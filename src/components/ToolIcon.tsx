import {
  FileCheck2,
  FilePlus2,
  FileText,
  Image as ImageIcon,
  Layers,
  Minimize2,
  RefreshCw,
  Scissors,
  Table2,
} from 'lucide-react';

export function ToolIcon({ name, className = 'w-5 h-5' }: { name: string; className?: string }) {
  switch (name) {
    case 'Layers':
      return <Layers className={className} />;
    case 'Scissors':
      return <Scissors className={className} />;
    case 'Minimize2':
      return <Minimize2 className={className} />;
    case 'Image':
      return <ImageIcon className={className} />;
    case 'FilePlus2':
      return <FilePlus2 className={className} />;
    case 'FileText':
      return <FileText className={className} />;
    case 'FileCheck2':
      return <FileCheck2 className={className} />;
    case 'Table2':
      return <Table2 className={className} />;
    case 'RefreshCw':
      return <RefreshCw className={className} />;
    default:
      return <FileText className={className} />;
  }
}
