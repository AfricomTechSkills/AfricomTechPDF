import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { PDFDocument, PageSizes, StandardFonts, rgb } from 'pdf-lib';
import type { ToolId } from '../types';

async function buildSamplePdf(name: string, title: string, pages: number): Promise<File> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage(PageSizes.A4);
    const { width, height } = page.getSize();

    page.drawRectangle({
      x: 48,
      y: height - 110,
      width: width - 96,
      height: 54,
      color: rgb(0.97, 0.98, 0.99),
      borderColor: rgb(0.88, 0.9, 0.93),
      borderWidth: 1,
    });

    page.drawText(`${title} - Page ${i}`, {
      x: 64,
      y: height - 86,
      size: 16,
      font: bold,
      color: rgb(0.06, 0.09, 0.16),
    });

    page.drawText(
      'PDF Convert Sample Document for real PDF merging, splitting, compression, and Word extraction.',
      {
        x: 48,
        y: height - 150,
        size: 11,
        font,
        color: rgb(0.25, 0.3, 0.38),
      }
    );

    page.drawText(
      'Section Overview: Quarterly financial summaries, compliance checklists, and high-resolution',
      {
        x: 48,
        y: height - 180,
        size: 11,
        font,
        color: rgb(0.25, 0.3, 0.38),
      }
    );
    page.drawText(
      'document proofs can be processed cleanly in the browser with zero third-party server retention.',
      {
        x: 48,
        y: height - 198,
        size: 11,
        font,
        color: rgb(0.25, 0.3, 0.38),
      }
    );
  }

  const bytes = await doc.save();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new File([copy.buffer], name, { type: 'application/pdf' });
}

async function buildSampleImage(name: string, label: string, accentHex: string): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 800;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(80, 80, 1040, 640);
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 4;
  ctx.strokeRect(80, 80, 1040, 640);

  ctx.fillStyle = accentHex;
  ctx.fillRect(80, 80, 1040, 16);

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 52px sans-serif';
  ctx.fillText(label, 140, 220);

  ctx.fillStyle = '#475569';
  ctx.font = '28px sans-serif';
  ctx.fillText('1200 x 800 px · Sample Studio Graphic', 140, 280);

  ctx.fillStyle = '#E11D48';
  ctx.fillRect(140, 350, 220, 140);
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(390, 350, 220, 140);
  ctx.fillStyle = '#64748B';
  ctx.fillRect(640, 350, 220, 140);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Sample image failed'))), 'image/png');
  });
  return new File([blob], name, { type: 'image/png' });
}

async function buildSampleDocx(name: string): Promise<File> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: 'PDF Convert Quarterly Operations Brief', bold: true })],
          }),
          new Paragraph({
            children: [
              new TextRun(
                'This sample Word document demonstrates real client-side conversion from DOCX into a clean, paginated PDF using PDF Convert.'
              ),
            ],
          }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: 'Key Deliverables', bold: true })],
          }),
          new Paragraph({
            children: [
              new TextRun(
                '1. Consolidate multi-department PDF reports into a single archival packet.'
              ),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun(
                '2. Compress high-resolution proof sheets for fast email distribution.'
              ),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun(
                '3. Export verified print layouts into PNG and WebP assets for web portals.'
              ),
            ],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  return new File([blob], name, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

async function buildSampleTablePdf(name: string): Promise<File> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pagesData: string[][][] = [
    [
      ['Date', 'Department', 'Vendor', 'Category', 'Units', 'Amount'],
      ['2026-01-08', 'Operations', 'Africom Cloud Services', 'Infrastructure', '12', '1,450.00'],
      ['2026-01-14', 'Design Studio', 'Northbridge Print Co', 'Proofing Stock', '40', '620.50'],
      ['2026-01-21', 'Finance', 'LedgerPro Systems', 'Audit Licenses', '5', '890.00'],
      ['2026-02-03', 'Engineering', 'Vertex Security Labs', 'Penetration Test', '1', '2,400.00'],
      ['2026-02-11', 'Legal', 'ClearSign Compliance', 'Document Filing', '18', '540.75'],
    ],
    [
      ['Date', 'Department', 'Vendor', 'Category', 'Units', 'Amount'],
      ['2026-02-19', 'Operations', 'Metro Courier Express', 'Archival Freight', '9', '315.20'],
      ['2026-03-04', 'Marketing', 'Studio Type Foundry', 'Webfont License', '3', '480.00'],
      ['2026-03-16', 'Engineering', 'FastEdge CDN', 'Bandwidth Overage', '25', '760.40'],
      ['2026-03-27', 'Finance', 'Summit Tax Advisory', 'Q1 Reconciliation', '1', '1,950.00'],
    ],
  ];

  const colX = [46, 120, 206, 336, 434, 492];

  pagesData.forEach((rows, pIdx) => {
    const page = doc.addPage(PageSizes.A4);
    const { width, height } = page.getSize();

    page.drawText(`PDF Convert - Quarterly Expense Ledger (Page ${pIdx + 1})`, {
      x: 46,
      y: height - 64,
      size: 14,
      font: bold,
      color: rgb(0.06, 0.09, 0.16),
    });

    rows.forEach((row, rIdx) => {
      const y = height - 116 - rIdx * 28;
      if (rIdx === 0) {
        page.drawRectangle({
          x: 40,
          y: y - 7,
          width: width - 80,
          height: 24,
          color: rgb(0.95, 0.96, 0.98),
        });
      }
      row.forEach((cell, cIdx) => {
        page.drawText(cell, {
          x: colX[cIdx],
          y,
          size: 10,
          font: rIdx === 0 ? bold : font,
          color: rgb(0.1, 0.14, 0.22),
        });
      });
    });
  });

  const bytes = await doc.save();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new File([copy.buffer], name, { type: 'application/pdf' });
}

export async function generateSampleFilesForTool(toolId: ToolId): Promise<File[]> {
  switch (toolId) {
    case 'merge-pdf':
      return Promise.all([
        buildSamplePdf('Q4_Summary_Part1.pdf', 'Q4 Executive Summary', 2),
        buildSamplePdf('Q4_Appendix_Part2.pdf', 'Financial Appendix', 2),
      ]);
    case 'split-pdf':
      return [await buildSamplePdf('Annual_Report_4Pages.pdf', 'Annual Report', 4)];
    case 'compress-pdf':
      return [await buildSamplePdf('Design_Proof_Draft.pdf', 'Design Proof', 3)];
    case 'pdf-to-image':
      return [await buildSamplePdf('Presentation_Deck.pdf', 'Presentation Deck', 2)];
    case 'image-to-pdf':
      return Promise.all([
        buildSampleImage('Cover_Plate.png', 'Cover Specification', '#E11D48'),
        buildSampleImage('Color_Swatches.png', 'Palette Calibration', '#0F172A'),
      ]);
    case 'pdf-to-word':
      return [await buildSamplePdf('Contract_Clause_Draft.pdf', 'Service Agreement', 2)];
    case 'word-to-pdf':
      return [await buildSampleDocx('Operations_Brief.docx')];
    case 'pdf-to-excel':
      return [await buildSampleTablePdf('Quarterly_Expense_Ledger.pdf')];
    case 'image-convert':
      return [await buildSampleImage('Studio_Banner.png', 'Studio Asset Export', '#E11D48')];
  }
}
