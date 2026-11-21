import { Document, HeadingLevel, Packer, PageBreak, Paragraph, TextRun } from 'docx';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { PDFDocument, PageSizes, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { GeneratedOutputItem, ToolProcessResult } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function pdfBytesToBlob(bytes: Uint8Array): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: 'application/pdf' });
}

function stripExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(0, idx) : name;
}

function sanitizeWinAnsiText(input: string): string {
  return input
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2014/g, '--')
    .replace(/\u2013/g, '-')
    .replace(/\u2022/g, '*')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}

async function fileToRasterData(
  file: File,
  targetMime: 'image/png' | 'image/jpeg'
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const imgUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Unable to decode image: ${file.name}`));
      el.src = imgUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width || 800;
    canvas.height = img.naturalHeight || img.height || 600;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    if (targetMime === 'image/jpeg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to encode image'))),
        targetMime,
        0.92
      );
    });
    const buffer = await blob.arrayBuffer();
    return {
      bytes: new Uint8Array(buffer),
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    URL.revokeObjectURL(imgUrl);
  }
}

export async function getPdfPageCount(file: File): Promise<number> {
  const buffer = await file.arrayBuffer();
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  return doc.getPageCount();
}

// 1. Merge PDF
export async function runMergePdf(files: File[]): Promise<ToolProcessResult> {
  const started = performance.now();
  if (files.length < 2) {
    throw new Error('Select at least 2 PDF files to merge.');
  }

  const merged = await PDFDocument.create();
  let totalInputBytes = 0;
  let totalPages = 0;

  for (const file of files) {
    totalInputBytes += file.size;
    const bytes = await file.arrayBuffer();
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const indices = src.getPageIndices();
    const copiedPages = await merged.copyPages(src, indices);
    copiedPages.forEach((p) => merged.addPage(p));
    totalPages += indices.length;
  }

  const outBytes = await merged.save({ useObjectStreams: true });
  const blob = pdfBytesToBlob(outBytes);
  const outName = `${stripExtension(files[0].name)}_merged.pdf`;
  const url = URL.createObjectURL(blob);

  return {
    toolId: 'merge-pdf',
    primaryFileName: files.map((f) => f.name).join(', '),
    inputBytes: totalInputBytes,
    outputBytes: blob.size,
    durationMs: Math.round(performance.now() - started),
    summaryText: `Merged ${files.length} PDF files (${totalPages} total pages).`,
    items: [
      {
        name: outName,
        blob,
        url,
        mimeType: 'application/pdf',
        size: blob.size,
      },
    ],
  };
}

// 2. Split PDF
export interface SplitPdfOptions {
  mode: 'each' | 'range' | 'fixed';
  rangeText?: string;
  everyNPages?: number;
}

function parsePageRanges(rangeText: string, maxPages: number): number[] {
  const result = new Set<number>();
  const parts = rangeText
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-').map((s) => s.trim());
      const start = Math.max(1, parseInt(startStr, 10));
      const end = Math.min(maxPages, parseInt(endStr, 10));
      if (!Number.isNaN(start) && !Number.isNaN(end) && start <= end) {
        for (let i = start; i <= end; i++) {
          result.add(i - 1);
        }
      }
    } else {
      const pageNum = parseInt(part, 10);
      if (!Number.isNaN(pageNum) && pageNum >= 1 && pageNum <= maxPages) {
        result.add(pageNum - 1);
      }
    }
  }

  return Array.from(result).sort((a, b) => a - b);
}

export async function runSplitPdf(
  file: File,
  options: SplitPdfOptions
): Promise<ToolProcessResult> {
  const started = performance.now();
  const buffer = await file.arrayBuffer();
  const srcDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const totalPages = srcDoc.getPageCount();
  const baseName = stripExtension(file.name);
  const items: GeneratedOutputItem[] = [];

  if (options.mode === 'range') {
    const indices = parsePageRanges(options.rangeText || '1', totalPages);
    if (indices.length === 0) {
      throw new Error(`Enter valid page numbers between 1 and ${totalPages}.`);
    }
    const outDoc = await PDFDocument.create();
    const copied = await outDoc.copyPages(srcDoc, indices);
    copied.forEach((p) => outDoc.addPage(p));
    const outBytes = await outDoc.save({ useObjectStreams: true });
    const blob = pdfBytesToBlob(outBytes);
    items.push({
      name: `${baseName}_pages_${indices.map((i) => i + 1).join('-')}.pdf`.slice(0, 80),
      blob,
      url: URL.createObjectURL(blob),
      mimeType: 'application/pdf',
      size: blob.size,
    });
  } else if (options.mode === 'fixed') {
    const chunk = Math.max(1, Math.min(totalPages, options.everyNPages || 2));
    for (let i = 0; i < totalPages; i += chunk) {
      const indices: number[] = [];
      for (let j = i; j < Math.min(totalPages, i + chunk); j++) {
        indices.push(j);
      }
      const outDoc = await PDFDocument.create();
      const copied = await outDoc.copyPages(srcDoc, indices);
      copied.forEach((p) => outDoc.addPage(p));
      const outBytes = await outDoc.save({ useObjectStreams: true });
      const blob = pdfBytesToBlob(outBytes);
      const startPage = i + 1;
      const endPage = indices[indices.length - 1] + 1;
      items.push({
        name: `${baseName}_p${startPage}-${endPage}.pdf`,
        blob,
        url: URL.createObjectURL(blob),
        mimeType: 'application/pdf',
        size: blob.size,
      });
    }
  } else {
    for (let i = 0; i < totalPages; i++) {
      const outDoc = await PDFDocument.create();
      const [copied] = await outDoc.copyPages(srcDoc, [i]);
      outDoc.addPage(copied);
      const outBytes = await outDoc.save({ useObjectStreams: true });
      const blob = pdfBytesToBlob(outBytes);
      items.push({
        name: `${baseName}_page_${i + 1}.pdf`,
        blob,
        url: URL.createObjectURL(blob),
        mimeType: 'application/pdf',
        size: blob.size,
      });
    }
  }

  let zipItem: GeneratedOutputItem | undefined;
  let totalOutputBytes = items.reduce((acc, item) => acc + item.size, 0);

  if (items.length > 1) {
    const zip = new JSZip();
    for (const item of items) {
      zip.file(item.name, item.blob);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    zipItem = {
      name: `${baseName}_split_pdfs.zip`,
      blob: zipBlob,
      url: URL.createObjectURL(zipBlob),
      mimeType: 'application/zip',
      size: zipBlob.size,
    };
    totalOutputBytes = zipBlob.size;
  }

  return {
    toolId: 'split-pdf',
    primaryFileName: file.name,
    inputBytes: file.size,
    outputBytes: totalOutputBytes,
    durationMs: Math.round(performance.now() - started),
    summaryText: `Created ${items.length} PDF file${items.length === 1 ? '' : 's'} from ${totalPages} source page${totalPages === 1 ? '' : 's'}.`,
    items,
    zipItem,
  };
}

// 3. Compress PDF
export interface CompressPdfOptions {
  level: 'low' | 'medium' | 'high';
}

export async function runCompressPdf(
  file: File,
  options: CompressPdfOptions
): Promise<ToolProcessResult> {
  const started = performance.now();
  const buffer = await file.arrayBuffer();
  const baseName = stripExtension(file.name);

  let outBlob: Blob;

  if (options.level === 'low') {
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    doc.setTitle('');
    doc.setAuthor('');
    doc.setSubject('');
    doc.setKeywords([]);
    doc.setProducer('PDF Convert');
    doc.setCreator('PDF Convert');
    const outBytes = await doc.save({ useObjectStreams: true });
    outBlob = pdfBytesToBlob(outBytes);
  } else {
    const scale = options.level === 'high' ? 1.15 : 1.45;
    const jpegQuality = options.level === 'high' ? 0.52 : 0.72;
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
    const pdf = await loadingTask.promise;
    const newPdf = await PDFDocument.create();

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const origViewport = page.getViewport({ scale: 1 });
      const renderViewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(renderViewport.width));
      canvas.height = Math.max(1, Math.round(renderViewport.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport: renderViewport, canvas }).promise;

      const jpgBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Compression encode failed'))),
          'image/jpeg',
          jpegQuality
        );
      });
      const jpgBytes = new Uint8Array(await jpgBlob.arrayBuffer());
      const embedded = await newPdf.embedJpg(jpgBytes);
      const pdfPage = newPdf.addPage([origViewport.width, origViewport.height]);
      pdfPage.drawImage(embedded, {
        x: 0,
        y: 0,
        width: origViewport.width,
        height: origViewport.height,
      });
    }

    const outBytes = await newPdf.save({ useObjectStreams: true });
    outBlob = pdfBytesToBlob(outBytes);
  }

  // If rasterizing a tiny vector-only PDF produced a slightly bigger file, also try lossless and keep smaller
  if (outBlob.size > file.size && options.level !== 'low') {
    const losslessDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const losslessBytes = await losslessDoc.save({ useObjectStreams: true });
    const losslessBlob = pdfBytesToBlob(losslessBytes);
    if (losslessBlob.size < outBlob.size) {
      outBlob = losslessBlob;
    }
  }

  const savedBytes = Math.max(0, file.size - outBlob.size);
  const pct = file.size > 0 ? Math.round((savedBytes / file.size) * 100) : 0;

  return {
    toolId: 'compress-pdf',
    primaryFileName: file.name,
    inputBytes: file.size,
    outputBytes: outBlob.size,
    durationMs: Math.round(performance.now() - started),
    summaryText:
      savedBytes > 0
        ? `Reduced file size by ${pct}% using ${options.level} compression.`
        : `Optimized PDF object streams (source PDF was already compact).`,
    items: [
      {
        name: `${baseName}_compressed.pdf`,
        blob: outBlob,
        url: URL.createObjectURL(outBlob),
        mimeType: 'application/pdf',
        size: outBlob.size,
      },
    ],
  };
}

// 4. PDF to Image
export interface PdfToImageOptions {
  format: 'png' | 'jpeg' | 'webp';
  scale: 1 | 2 | 3;
  quality: number;
}

export async function runPdfToImage(
  file: File,
  options: PdfToImageOptions
): Promise<ToolProcessResult> {
  const started = performance.now();
  const buffer = await file.arrayBuffer();
  const baseName = stripExtension(file.name);
  const mimeMap = {
    png: 'image/png',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
  } as const;
  const extMap = { png: 'png', jpeg: 'jpg', webp: 'webp' } as const;
  const mime = mimeMap[options.format];
  const ext = extMap[options.format];

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;
  const items: GeneratedOutputItem[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: options.scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Image export failed'))),
        mime,
        options.quality
      );
    });
    const url = URL.createObjectURL(blob);
    items.push({
      name: `${baseName}_page_${pageNum}.${ext}`,
      blob,
      url,
      previewUrl: url,
      mimeType: mime,
      size: blob.size,
      dimensions: `${canvas.width} × ${canvas.height} px`,
    });
  }

  let zipItem: GeneratedOutputItem | undefined;
  let totalOutputBytes = items.reduce((sum, item) => sum + item.size, 0);

  if (items.length > 1) {
    const zip = new JSZip();
    for (const item of items) {
      zip.file(item.name, item.blob);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    zipItem = {
      name: `${baseName}_images.zip`,
      blob: zipBlob,
      url: URL.createObjectURL(zipBlob),
      mimeType: 'application/zip',
      size: zipBlob.size,
    };
    totalOutputBytes = zipBlob.size;
  }

  return {
    toolId: 'pdf-to-image',
    primaryFileName: file.name,
    inputBytes: file.size,
    outputBytes: totalOutputBytes,
    durationMs: Math.round(performance.now() - started),
    summaryText: `Rendered ${items.length} page${items.length === 1 ? '' : 's'} as ${options.format.toUpperCase()} at ${options.scale * 72} DPI.`,
    items,
    zipItem,
  };
}

// 5. Image to PDF
export interface ImageToPdfOptions {
  pageSize: 'fit' | 'a4' | 'letter';
  orientation: 'auto' | 'portrait' | 'landscape';
  marginPt: number;
}

export async function runImageToPdf(
  files: File[],
  options: ImageToPdfOptions
): Promise<ToolProcessResult> {
  const started = performance.now();
  if (files.length === 0) {
    throw new Error('Select at least 1 image file.');
  }

  const pdf = await PDFDocument.create();
  let totalInputBytes = 0;

  for (const file of files) {
    totalInputBytes += file.size;
    const isJpeg = file.type === 'image/jpeg';
    const isPng = file.type === 'image/png';

    let embedded;
    let imgWidth: number;
    let imgHeight: number;

    if (isJpeg) {
      const raw = new Uint8Array(await file.arrayBuffer());
      embedded = await pdf.embedJpg(raw);
      imgWidth = embedded.width;
      imgHeight = embedded.height;
    } else if (isPng) {
      const raw = new Uint8Array(await file.arrayBuffer());
      embedded = await pdf.embedPng(raw);
      imgWidth = embedded.width;
      imgHeight = embedded.height;
    } else {
      const raster = await fileToRasterData(file, 'image/png');
      embedded = await pdf.embedPng(raster.bytes);
      imgWidth = raster.width;
      imgHeight = raster.height;
    }

    const margin = Math.max(0, options.marginPt);

    if (options.pageSize === 'fit') {
      const page = pdf.addPage([imgWidth + margin * 2, imgHeight + margin * 2]);
      page.drawImage(embedded, {
        x: margin,
        y: margin,
        width: imgWidth,
        height: imgHeight,
      });
    } else {
      const [baseW, baseH] = options.pageSize === 'a4' ? PageSizes.A4 : PageSizes.Letter;
      const wantLandscape =
        options.orientation === 'landscape' ||
        (options.orientation === 'auto' && imgWidth > imgHeight);
      const pageW = wantLandscape ? baseH : baseW;
      const pageH = wantLandscape ? baseW : baseH;
      const availW = Math.max(10, pageW - margin * 2);
      const availH = Math.max(10, pageH - margin * 2);
      const scale = Math.min(availW / imgWidth, availH / imgHeight);
      const drawW = imgWidth * scale;
      const drawH = imgHeight * scale;
      const page = pdf.addPage([pageW, pageH]);
      page.drawImage(embedded, {
        x: (pageW - drawW) / 2,
        y: (pageH - drawH) / 2,
        width: drawW,
        height: drawH,
      });
    }
  }

  const outBytes = await pdf.save({ useObjectStreams: true });
  const blob = pdfBytesToBlob(outBytes);
  const outName = `${stripExtension(files[0].name)}_images.pdf`;

  return {
    toolId: 'image-to-pdf',
    primaryFileName: files.map((f) => f.name).join(', '),
    inputBytes: totalInputBytes,
    outputBytes: blob.size,
    durationMs: Math.round(performance.now() - started),
    summaryText: `Combined ${files.length} image${files.length === 1 ? '' : 's'} into a ${pdf.getPageCount()}-page PDF.`,
    items: [
      {
        name: outName,
        blob,
        url: URL.createObjectURL(blob),
        mimeType: 'application/pdf',
        size: blob.size,
      },
    ],
  };
}

// 6. PDF to Word (.docx)
export async function runPdfToWord(file: File): Promise<ToolProcessResult> {
  const started = performance.now();
  const buffer = await file.arrayBuffer();
  const baseName = stripExtension(file.name);
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;

  const docParagraphs: Paragraph[] = [];
  const previewLines: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    interface TextLine {
      y: number;
      fontSize: number;
      text: string;
    }

    const linesMap = new Map<number, { x: number; str: string; height: number }[]>();

    for (const rawItem of content.items) {
      if (!('str' in rawItem) || !rawItem.str.trim()) continue;
      const transform = rawItem.transform;
      const x = transform[4] ?? 0;
      const y = Math.round((transform[5] ?? 0) / 3) * 3;
      const height = Math.abs(transform[3] ?? rawItem.height ?? 11);
      const list = linesMap.get(y) || [];
      list.push({ x, str: rawItem.str, height });
      linesMap.set(y, list);
    }

    const sortedYs = Array.from(linesMap.keys()).sort((a, b) => b - a);
    const lines: TextLine[] = sortedYs.map((y) => {
      const segments = (linesMap.get(y) || []).sort((a, b) => a.x - b.x);
      const maxH = segments.reduce((m, s) => Math.max(m, s.height), 11);
      return {
        y,
        fontSize: maxH,
        text: segments
          .map((s) => s.str)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim(),
      };
    });

    if (lines.length === 0) {
      docParagraphs.push(
        new Paragraph({
          children: [new TextRun({ text: `[Page ${pageNum}: No selectable text found]`, italics: true })],
        })
      );
      previewLines.push(`[Page ${pageNum}: No selectable text found]`);
    } else {
      for (const line of lines) {
        if (!line.text) continue;
        previewLines.push(line.text);
        if (line.fontSize >= 16) {
          docParagraphs.push(
            new Paragraph({
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 200, after: 100 },
              children: [new TextRun({ text: line.text, bold: true })],
            })
          );
        } else {
          docParagraphs.push(
            new Paragraph({
              spacing: { after: 120 },
              children: [new TextRun({ text: line.text })],
            })
          );
        }
      }
    }

    if (pageNum < pdf.numPages) {
      docParagraphs.push(new Paragraph({ children: [new PageBreak()] }));
      previewLines.push('');
    }
  }

  const wordDoc = new Document({
    sections: [
      {
        children:
          docParagraphs.length > 0
            ? docParagraphs
            : [new Paragraph({ children: [new TextRun('Empty document')] })],
      },
    ],
  });

  const blob = await Packer.toBlob(wordDoc);

  return {
    toolId: 'pdf-to-word',
    primaryFileName: file.name,
    inputBytes: file.size,
    outputBytes: blob.size,
    durationMs: Math.round(performance.now() - started),
    summaryText: `Converted ${pdf.numPages} PDF page${pdf.numPages === 1 ? '' : 's'} into an editable .docx document.`,
    extractedTextPreview: previewLines.slice(0, 40).join('\n'),
    items: [
      {
        name: `${baseName}.docx`,
        blob,
        url: URL.createObjectURL(blob),
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: blob.size,
      },
    ],
  };
}

// 7. Word (.docx) to PDF
export async function runWordToPdf(file: File): Promise<ToolProcessResult> {
  const started = performance.now();
  const buffer = await file.arrayBuffer();
  const baseName = stripExtension(file.name);

  const htmlResult = await mammoth.convertToHtml({ arrayBuffer: buffer });
  const rawResult = await mammoth.extractRawText({ arrayBuffer: buffer });

  // Parse structured blocks from mammoth HTML safely via DOMParser
  const parser = new DOMParser();
  const parsedDoc = parser.parseFromString(htmlResult.value || '', 'text/html');
  const blockNodes = Array.from(
    parsedDoc.body.querySelectorAll('h1, h2, h3, h4, p, li')
  );

  interface StyledBlock {
    text: string;
    isHeading: boolean;
    fontSize: number;
  }

  const blocks: StyledBlock[] = [];
  if (blockNodes.length > 0) {
    for (const node of blockNodes) {
      const tag = node.tagName.toLowerCase();
      const raw = (node.textContent || '').trim();
      if (!raw) continue;
      const prefix = tag === 'li' ? '* ' : '';
      const isHeading = tag.startsWith('h');
      const fontSize = tag === 'h1' ? 18 : tag === 'h2' ? 15 : tag.startsWith('h') ? 13 : 11;
      blocks.push({
        text: sanitizeWinAnsiText(prefix + raw),
        isHeading,
        fontSize,
      });
    }
  } else {
    const lines = (rawResult.value || 'Empty document').split(/\r?\n/);
    for (const l of lines) {
      if (l.trim()) {
        blocks.push({ text: sanitizeWinAnsiText(l.trim()), isHeading: false, fontSize: 11 });
      }
    }
  }

  if (blocks.length === 0) {
    blocks.push({ text: 'Document contains no readable text.', isHeading: false, fontSize: 11 });
  }

  const pdf = await PDFDocument.create();
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [pageW, pageH] = PageSizes.A4;
  const marginX = 56;
  const marginY = 56;
  const maxLineWidth = pageW - marginX * 2;

  let page = pdf.addPage([pageW, pageH]);
  let cursorY = pageH - marginY;

  const ensureSpace = (needed: number) => {
    if (cursorY - needed < marginY) {
      page = pdf.addPage([pageW, pageH]);
      cursorY = pageH - marginY;
    }
  };

  for (const block of blocks) {
    const font = block.isHeading ? boldFont : regularFont;
    const lineHeight = block.fontSize * 1.45;
    const words = block.text.split(/\s+/).filter(Boolean);
    const wrappedLines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(candidate, block.fontSize);
      if (width > maxLineWidth && currentLine) {
        wrappedLines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = candidate;
      }
    }
    if (currentLine) wrappedLines.push(currentLine);

    if (block.isHeading) {
      cursorY -= 6;
    }

    for (const line of wrappedLines) {
      ensureSpace(lineHeight);
      page.drawText(line, {
        x: marginX,
        y: cursorY,
        size: block.fontSize,
        font,
        color: rgb(0.06, 0.09, 0.16),
      });
      cursorY -= lineHeight;
    }
    cursorY -= block.isHeading ? 6 : 8;
  }

  // Page numbers
  const pages = pdf.getPages();
  pages.forEach((p, idx) => {
    const label = `${idx + 1} / ${pages.length}`;
    p.drawText(label, {
      x: pageW - marginX - regularFont.widthOfTextAtSize(label, 9),
      y: 28,
      size: 9,
      font: regularFont,
      color: rgb(0.45, 0.5, 0.58),
    });
  });

  const outBytes = await pdf.save({ useObjectStreams: true });
  const blob = pdfBytesToBlob(outBytes);

  return {
    toolId: 'word-to-pdf',
    primaryFileName: file.name,
    inputBytes: file.size,
    outputBytes: blob.size,
    durationMs: Math.round(performance.now() - started),
    summaryText: `Rendered ${pages.length} paginated PDF page${pages.length === 1 ? '' : 's'} from ${file.name}.`,
    extractedTextPreview: blocks
      .slice(0, 12)
      .map((b) => b.text)
      .join('\n'),
    items: [
      {
        name: `${baseName}.pdf`,
        blob,
        url: URL.createObjectURL(blob),
        mimeType: 'application/pdf',
        size: blob.size,
      },
    ],
  };
}

// 8. Image Format Conversion
export interface ImageConvertOptions {
  targetFormat: 'png' | 'jpeg' | 'webp';
  quality: number;
  resizeWidth?: number;
}

export async function runImageConvert(
  files: File[],
  options: ImageConvertOptions
): Promise<ToolProcessResult> {
  const started = performance.now();
  if (files.length === 0) {
    throw new Error('Select at least 1 image file.');
  }

  const mimeMap = {
    png: 'image/png',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
  } as const;
  const extMap = { png: 'png', jpeg: 'jpg', webp: 'webp' } as const;
  const targetMime = mimeMap[options.targetFormat];
  const ext = extMap[options.targetFormat];

  const items: GeneratedOutputItem[] = [];
  let totalInputBytes = 0;

  for (const file of files) {
    totalInputBytes += file.size;
    const objUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error(`Could not decode ${file.name}`));
        el.src = objUrl;
      });

      const natW = img.naturalWidth || img.width || 800;
      const natH = img.naturalHeight || img.height || 600;
      const targetW =
        options.resizeWidth && options.resizeWidth > 0 ? Math.min(8000, options.resizeWidth) : natW;
      const targetH = Math.max(1, Math.round((targetW / natW) * natH));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');

      if (options.targetFormat === 'jpeg') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetW, targetH);
      }
      ctx.drawImage(img, 0, 0, targetW, targetH);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error(`Encoding failed for ${file.name}`))),
          targetMime,
          options.quality
        );
      });

      const url = URL.createObjectURL(blob);
      items.push({
        name: `${stripExtension(file.name)}.${ext}`,
        blob,
        url,
        previewUrl: url,
        mimeType: targetMime,
        size: blob.size,
        dimensions: `${targetW} × ${targetH} px`,
      });
    } finally {
      URL.revokeObjectURL(objUrl);
    }
  }

  let zipItem: GeneratedOutputItem | undefined;
  let totalOutputBytes = items.reduce((sum, item) => sum + item.size, 0);

  if (items.length > 1) {
    const zip = new JSZip();
    for (const item of items) {
      zip.file(item.name, item.blob);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    zipItem = {
      name: `converted_images_${ext}.zip`,
      blob: zipBlob,
      url: URL.createObjectURL(zipBlob),
      mimeType: 'application/zip',
      size: zipBlob.size,
    };
    totalOutputBytes = zipBlob.size;
  }

  return {
    toolId: 'image-convert',
    primaryFileName: files.map((f) => f.name).join(', '),
    inputBytes: totalInputBytes,
    outputBytes: totalOutputBytes,
    durationMs: Math.round(performance.now() - started),
    summaryText: `Converted ${items.length} image${items.length === 1 ? '' : 's'} to ${options.targetFormat.toUpperCase()}.`,
    items,
    zipItem,
  };
}

// 9. PDF to Excel (.xlsx / .csv)
export interface PdfToExcelOptions {
  format: 'xlsx' | 'csv';
  sheetMode: 'combined' | 'per-page';
  detectNumbers: boolean;
}

interface ExtractedCell {
  x: number;
  endX: number;
  text: string;
}

interface ColumnBand {
  minX: number;
  maxX: number;
  anchorX: number;
}

function escapeXmlText(value: string): string {
  // Strip XML 1.0 disallowed control chars
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return cleaned
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizeSheetName(raw: string, fallbackIndex: number): string {
  const cleaned = raw.replace(/[\\/?*[\]:]/g, '_').trim();
  if (!cleaned) return `Sheet_${fallbackIndex}`;
  return cleaned.slice(0, 31);
}

function toExcelColName(zeroBasedIndex: number): string {
  let n = zeroBasedIndex + 1;
  let name = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function tryParseNumericCell(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Avoid converting leading-zero IDs like "0042" or dates like "2026-01-15"
  if (/^0\d+/.test(trimmed)) return null;
  if (!/^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(trimmed)) return null;
  const normalized = trimmed.replace(/,/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function rowsToCsvString(rows: string[][]): string {
  return '\uFEFF' + rows.map((row) => row.map((c) => escapeCsvCell(c)).join(',')).join('\r\n');
}

async function buildXlsxBlob(
  sheets: { name: string; rows: string[][] }[],
  detectNumbers: boolean
): Promise<Blob> {
  const zip = new JSZip();

  const sheetOverrides = sheets
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('');

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-officedocument.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      sheetOverrides +
      `</Types>`
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`
  );

  const sheetTags = sheets
    .map(
      (s, i) =>
        `<sheet name="${escapeXmlText(sanitizeSheetName(s.name, i + 1))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
    )
    .join('');

  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets>${sheetTags}</sheets>` +
      `</workbook>`
  );

  const workbookRels = sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
    )
    .join('');

  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      workbookRels +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `</Relationships>`
  );

  zip.file(
    'xl/styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<fonts count="2">` +
      `<font><sz val="11"/><name val="Calibri"/></font>` +
      `<font><b/><sz val="11"/><color rgb="FF0F172A"/><name val="Calibri"/></font>` +
      `</fonts>` +
      `<fills count="3">` +
      `<fill><patternFill patternType="none"/></fill>` +
      `<fill><patternFill patternType="gray125"/></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/></patternFill></fill>` +
      `</fills>` +
      `<borders count="2">` +
      `<border><left/><right/><top/><bottom/><diagonal/></border>` +
      `<border><left/><right/><top/><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border>` +
      `</borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="2">` +
      `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
      `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>` +
      `</cellXfs>` +
      `</styleSheet>`
  );

  sheets.forEach((sheet, sheetIdx) => {
    const rows = sheet.rows.length > 0 ? sheet.rows : [['No extractable table text found']];
    const maxCols = Math.max(1, ...rows.map((r) => r.length));
    const colWidths = new Array<number>(maxCols).fill(12);

    rows.forEach((row) => {
      row.forEach((val, cIdx) => {
        colWidths[cIdx] = Math.min(54, Math.max(colWidths[cIdx], val.length + 4));
      });
    });

    const colsXml = colWidths
      .map(
        (w, i) =>
          `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`
      )
      .join('');

    const rowsXml = rows
      .map((row, rIdx) => {
        const rowNum = rIdx + 1;
        // Highlight first multi-column row as header
        const isHeaderRow = rIdx === 0 && row.filter(Boolean).length >= 2;
        const styleAttr = isHeaderRow ? ' s="1"' : '';
        const cellsXml = row
          .map((val, cIdx) => {
            if (val === '') return '';
            const ref = `${toExcelColName(cIdx)}${rowNum}`;
            if (detectNumbers && !isHeaderRow) {
              const num = tryParseNumericCell(val);
              if (num !== null) {
                return `<c r="${ref}"${styleAttr} t="n"><v>${num}</v></c>`;
              }
            }
            return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${escapeXmlText(val)}</t></is></c>`;
          })
          .filter(Boolean)
          .join('');
        return `<row r="${rowNum}">${cellsXml}</row>`;
      })
      .join('');

    const sheetXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<cols>${colsXml}</cols>` +
      `<sheetData>${rowsXml}</sheetData>` +
      `</worksheet>`;

    zip.file(`xl/worksheets/sheet${sheetIdx + 1}.xml`, sheetXml);
  });

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function alignPageRowsToColumns(rawRows: ExtractedCell[][]): string[][] {
  if (rawRows.length === 0) return [];

  // Build column bands primarily from multi-cell rows so wide single-line titles don't merge columns
  const bands: ColumnBand[] = [];
  const multiCellSeeds = rawRows
    .filter((r) => r.length >= 2)
    .flat()
    .sort((a, b) => a.x - b.x);

  const assignToBand = (cell: ExtractedCell, allowCreate: boolean): number => {
    let bestIdx = -1;
    let bestDist = Infinity;

    for (let i = 0; i < bands.length; i++) {
      const b = bands[i];
      const overlaps = cell.x <= b.maxX + 6 && cell.endX >= b.minX - 6;
      const nearAnchor = Math.abs(cell.x - b.anchorX) <= 18;
      if (overlaps || nearAnchor) {
        const dist = Math.abs(cell.x - b.anchorX);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }
    }

    if (bestIdx >= 0) {
      bands[bestIdx].minX = Math.min(bands[bestIdx].minX, cell.x);
      bands[bestIdx].maxX = Math.max(bands[bestIdx].maxX, cell.endX);
      return bestIdx;
    }

    if (!allowCreate) return 0;

    bands.push({ minX: cell.x, maxX: cell.endX, anchorX: cell.x });
    bands.sort((a, b) => a.anchorX - b.anchorX);
    return bands.findIndex((b) => b.anchorX === cell.x);
  };

  for (const seed of multiCellSeeds) {
    assignToBand(seed, true);
  }

  if (bands.length === 0) {
    return rawRows.map((row) => [row.map((c) => c.text).join(' ').trim()]).filter((r) => r[0] !== '');
  }

  bands.sort((a, b) => a.anchorX - b.anchorX);

  const findColumnIndex = (cell: ExtractedCell, isSingleCellRow: boolean): number => {
    if (isSingleCellRow) {
      // Place wide page headers/notes into the nearest starting column without widening bands
      let nearest = 0;
      let minDist = Infinity;
      for (let i = 0; i < bands.length; i++) {
        const d = Math.abs(cell.x - bands[i].anchorX);
        if (d < minDist) {
          minDist = d;
          nearest = i;
        }
      }
      return nearest;
    }

    let bestIdx = 0;
    let bestScore = Infinity;
    for (let i = 0; i < bands.length; i++) {
      const b = bands[i];
      const overlaps = cell.x <= b.maxX + 6 && cell.endX >= b.minX - 6;
      const dist = Math.abs(cell.x - b.anchorX);
      const score = overlaps ? dist : dist + 1000;
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    return bestIdx;
  };

  const matrix: string[][] = [];
  for (const row of rawRows) {
    const cols = new Array<string>(bands.length).fill('');
    const isSingle = row.length === 1;
    for (const cell of row) {
      const idx = findColumnIndex(cell, isSingle);
      cols[idx] = cols[idx] ? `${cols[idx]} ${cell.text}` : cell.text;
    }
    if (cols.some((c) => c.trim() !== '')) {
      matrix.push(cols.map((c) => c.trim()));
    }
  }

  return matrix;
}

export async function runPdfToExcel(
  file: File,
  options: PdfToExcelOptions
): Promise<ToolProcessResult> {
  const started = performance.now();
  const buffer = await file.arrayBuffer();
  const baseName = stripExtension(file.name);
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;

  const pageSheets: { name: string; rows: string[][] }[] = [];
  let totalRows = 0;
  let maxColumnsDetected = 1;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const linesMap = new Map<number, { x: number; endX: number; str: string }[]>();

    for (const rawItem of content.items) {
      if (!('str' in rawItem) || !rawItem.str.trim()) continue;
      const transform = rawItem.transform;
      const x = transform[4] ?? 0;
      const y = Math.round((transform[5] ?? 0) / 4) * 4;
      const approxFont = Math.abs(transform[0] ?? transform[3] ?? 10) || 10;
      const width =
        typeof rawItem.width === 'number' && rawItem.width > 0
          ? rawItem.width
          : rawItem.str.length * approxFont * 0.52;

      const bucket = linesMap.get(y) || [];
      bucket.push({ x, endX: x + width, str: rawItem.str });
      linesMap.set(y, bucket);
    }

    const sortedYs = Array.from(linesMap.keys()).sort((a, b) => b - a);
    const rawRows: ExtractedCell[][] = [];

    for (const y of sortedYs) {
      const segments = (linesMap.get(y) || []).sort((a, b) => a.x - b.x);
      const rowCells: ExtractedCell[] = [];

      for (const seg of segments) {
        const text = seg.str.trim();
        if (!text) continue;
        const prev = rowCells[rowCells.length - 1];
        if (prev && seg.x - prev.endX <= 10) {
          const gap = seg.x - prev.endX;
          prev.text = gap > 1.5 ? `${prev.text} ${text}` : `${prev.text}${text}`;
          prev.endX = Math.max(prev.endX, seg.endX);
        } else {
          rowCells.push({ x: seg.x, endX: seg.endX, text });
        }
      }

      if (rowCells.length > 0) {
        rawRows.push(rowCells);
      }
    }

    const alignedRows = alignPageRowsToColumns(rawRows);
    totalRows += alignedRows.length;
    for (const r of alignedRows) {
      maxColumnsDetected = Math.max(maxColumnsDetected, r.length);
    }

    pageSheets.push({
      name: `Page_${pageNum}`,
      rows: alignedRows,
    });
  }

  const finalSheets =
    options.sheetMode === 'combined'
      ? [
          {
            name: 'Extracted_Data',
            rows: pageSheets.flatMap((sheet, idx) =>
              idx === 0 || sheet.rows.length === 0
                ? sheet.rows
                : [[''], ...sheet.rows]
            ),
          },
        ]
      : pageSheets;

  const firstNonEmptySheet = finalSheets.find((s) => s.rows.length > 0) || finalSheets[0];
  const previewRows = (firstNonEmptySheet?.rows || [])
    .filter((r) => r.some((c) => c.trim() !== ''))
    .slice(0, 14)
    .map((r) => r.slice(0, 8));

  const items: GeneratedOutputItem[] = [];
  let zipItem: GeneratedOutputItem | undefined;
  let totalOutputBytes = 0;

  if (options.format === 'xlsx') {
    const xlsxBlob = await buildXlsxBlob(finalSheets, options.detectNumbers);
    items.push({
      name: `${baseName}.xlsx`,
      blob: xlsxBlob,
      url: URL.createObjectURL(xlsxBlob),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: xlsxBlob.size,
    });
    totalOutputBytes = xlsxBlob.size;
  } else {
    for (const sheet of finalSheets) {
      const csvText = rowsToCsvString(sheet.rows);
      const csvBlob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
      const fileName =
        finalSheets.length === 1
          ? `${baseName}.csv`
          : `${baseName}_${sheet.name.toLowerCase()}.csv`;
      items.push({
        name: fileName,
        blob: csvBlob,
        url: URL.createObjectURL(csvBlob),
        mimeType: 'text/csv;charset=utf-8',
        size: csvBlob.size,
      });
    }

    totalOutputBytes = items.reduce((sum, item) => sum + item.size, 0);

    if (items.length > 1) {
      const zip = new JSZip();
      for (const item of items) {
        zip.file(item.name, item.blob);
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      zipItem = {
        name: `${baseName}_spreadsheets.zip`,
        blob: zipBlob,
        url: URL.createObjectURL(zipBlob),
        mimeType: 'application/zip',
        size: zipBlob.size,
      };
      totalOutputBytes = zipBlob.size;
    }
  }

  return {
    toolId: 'pdf-to-excel',
    primaryFileName: file.name,
    inputBytes: file.size,
    outputBytes: totalOutputBytes,
    durationMs: Math.round(performance.now() - started),
    summaryText: `Extracted ${totalRows} row${totalRows === 1 ? '' : 's'} across up to ${maxColumnsDetected} column${maxColumnsDetected === 1 ? '' : 's'} from ${pdf.numPages} page${pdf.numPages === 1 ? '' : 's'} as ${options.format.toUpperCase()}.`,
    items,
    zipItem,
    tablePreview: previewRows.length > 0 ? previewRows : undefined,
  };
}
