import type { ToolDefinition, ToolId } from '../types';

export const TOOLS_CATALOG: ToolDefinition[] = [
  {
    id: 'merge-pdf',
    name: 'Merge PDF',
    shortDesc: 'Combine multiple PDF documents in custom order into a single file.',
    category: 'pdf',
    inputAccept: '.pdf,application/pdf',
    inputLabel: 'PDF',
    outputLabel: 'Merged PDF',
    multiple: true,
    iconName: 'Layers',
  },
  {
    id: 'split-pdf',
    name: 'Split PDF',
    shortDesc: 'Extract specific page ranges or burst every page into individual PDFs.',
    category: 'pdf',
    inputAccept: '.pdf,application/pdf',
    inputLabel: 'PDF',
    outputLabel: 'PDF / ZIP',
    multiple: false,
    iconName: 'Scissors',
  },
  {
    id: 'compress-pdf',
    name: 'Compress PDF',
    shortDesc: 'Reduce PDF file weight with lossless stream cleanup or visual compression.',
    category: 'pdf',
    inputAccept: '.pdf,application/pdf',
    inputLabel: 'PDF',
    outputLabel: 'Compressed PDF',
    multiple: false,
    iconName: 'Minimize2',
  },
  {
    id: 'pdf-to-image',
    name: 'PDF to Image',
    shortDesc: 'Render every PDF page as crisp PNG, JPG, or WebP images at up to 216 DPI.',
    category: 'pdf',
    inputAccept: '.pdf,application/pdf',
    inputLabel: 'PDF',
    outputLabel: 'PNG / JPG / WebP',
    multiple: false,
    iconName: 'Image',
  },
  {
    id: 'image-to-pdf',
    name: 'Image to PDF',
    shortDesc: 'Arrange JPG, PNG, and WebP images into a print-ready PDF document.',
    category: 'image',
    inputAccept: 'image/png,image/jpeg,image/webp,image/gif,image/bmp',
    inputLabel: 'JPG / PNG / WebP',
    outputLabel: 'PDF',
    multiple: true,
    iconName: 'FilePlus2',
  },
  {
    id: 'pdf-to-word',
    name: 'PDF to Word',
    shortDesc: 'Extract structured headings and paragraphs from PDF into an editable .docx file.',
    category: 'office',
    inputAccept: '.pdf,application/pdf',
    inputLabel: 'PDF',
    outputLabel: 'DOCX',
    multiple: false,
    iconName: 'FileText',
  },
  {
    id: 'word-to-pdf',
    name: 'Word to PDF',
    shortDesc: 'Convert .docx Word documents into paginated, share-ready PDF pages.',
    category: 'office',
    inputAccept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    inputLabel: 'DOCX',
    outputLabel: 'PDF',
    multiple: false,
    iconName: 'FileCheck2',
  },
  {
    id: 'image-convert',
    name: 'Image Converter',
    shortDesc: 'Convert and resize batches across PNG, JPG, and WebP with quality control.',
    category: 'image',
    inputAccept: 'image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml',
    inputLabel: 'PNG / JPG / WebP / SVG',
    outputLabel: 'PNG / JPG / WebP',
    multiple: true,
    iconName: 'RefreshCw',
  },
];

export function getToolById(id: ToolId): ToolDefinition {
  const found = TOOLS_CATALOG.find((t) => t.id === id);
  if (!found) {
    throw new Error(`Unknown tool: ${id}`);
  }
  return found;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const val = bytes / Math.pow(1024, i);
  return `${val >= 100 ? val.toFixed(0) : val >= 10 ? val.toFixed(1) : val.toFixed(2)} ${units[i]}`;
}

export function formatCurrencyCents(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}
