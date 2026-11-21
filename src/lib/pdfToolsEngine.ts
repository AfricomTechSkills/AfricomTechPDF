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
