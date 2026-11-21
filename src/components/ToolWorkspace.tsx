import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  Download,
  FileArchive,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import {
  getPdfPageCount,
  runCompressPdf,
  runImageConvert,
  runImageToPdf,
  runMergePdf,
  runPdfToImage,
  runPdfToWord,
  runSplitPdf,
  runWordToPdf,
} from '../lib/pdfToolsEngine';
import { generateSampleFilesForTool } from '../lib/sampleFiles';
import { formatBytes, getToolById, TOOLS_CATALOG } from '../lib/toolsCatalog';
import type {
  PlatformSettings,
  ToolId,
  ToolProcessResult,
  UserProfile,
} from '../types';
import { ToolIcon } from './ToolIcon';

interface ToolWorkspaceProps {
  toolId: ToolId;
  onSelectTool: (id: ToolId) => void;
  onBack: () => void;
  userProfile: UserProfile | null;
  todayUsageCount: number;
  platformSettings: PlatformSettings;
  onRecordSuccess: (result: ToolProcessResult, fileCount: number) => Promise<void>;
  onOpenUpgrade: () => void;
  onSignIn: () => void;
}

export function ToolWorkspace({
  toolId,
  onSelectTool,
  onBack,
  userProfile,
  todayUsageCount,
  platformSettings,
  onRecordSuccess,
  onOpenUpgrade,
  onSignIn,
}: ToolWorkspaceProps) {
  const tool = getToolById(toolId);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [pdfPageCount, setPdfPageCount] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingSample, setIsLoadingSample] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<ToolProcessResult | null>(null);

  // Tool-specific options
  const [splitMode, setSplitMode] = useState<'each' | 'range' | 'fixed'>('each');
  const [splitRange, setSplitRange] = useState('1-2');
  const [splitChunk, setSplitChunk] = useState(2);

  const [compressLevel, setCompressLevel] = useState<'low' | 'medium' | 'high'>('medium');

  const [pdfImgFormat, setPdfImgFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [pdfImgScale, setPdfImgScale] = useState<1 | 2 | 3>(2);
  const [pdfImgQuality, setPdfImgQuality] = useState(0.9);

  const [imgPdfSize, setImgPdfSize] = useState<'fit' | 'a4' | 'letter'>('a4');
  const [imgPdfOrientation, setImgPdfOrientation] = useState<'auto' | 'portrait' | 'landscape'>('auto');
  const [imgPdfMargin, setImgPdfMargin] = useState(24);

  const [convFormat, setConvFormat] = useState<'png' | 'jpeg' | 'webp'>('webp');
  const [convQuality, setConvQuality] = useState(0.88);
  const [convWidth, setConvWidth] = useState<string>('');

  const isPaid = userProfile?.plan === 'pro' || userProfile?.plan === 'business';
  const isSuspended = userProfile?.status === 'suspended';
  const isToolDisabled =
    platformSettings.maintenanceMode || platformSettings.disabledTools.includes(toolId);
  const freeRemaining = Math.max(0, platformSettings.freeDailyLimit - todayUsageCount);
  const quotaExceeded = !isPaid && todayUsageCount >= platformSettings.freeDailyLimit;
  const maxFileMb = isPaid ? platformSettings.maxProFileMb : platformSettings.maxFreeFileMb;

  // Cleanup generated blob URLs when result changes
  useEffect(() => {
    return () => {
      if (result) {
        result.items.forEach((item) => URL.revokeObjectURL(item.url));
        if (result.zipItem) URL.revokeObjectURL(result.zipItem.url);
      }
    };
  }, [result]);

  // Reset workspace when switching tools
  useEffect(() => {
    setFiles([]);
    setPdfPageCount(null);
    setErrorMsg(null);
    setResult(null);
  }, [toolId]);

  const validateAndSetFiles = async (incoming: File[]) => {
    setErrorMsg(null);
    setResult(null);

    if (incoming.length === 0) return;

    const oversized = incoming.find((f) => f.size > maxFileMb * 1024 * 1024);
    if (oversized) {
      setErrorMsg(
        `"${oversized.name}" exceeds your ${maxFileMb} MB per-file limit.${
          !isPaid ? ' Upgrade to Pro for up to ' + platformSettings.maxProFileMb + ' MB.' : ''
        }`
      );
      return;
    }

    const nextFiles = tool.multiple ? [...files, ...incoming] : [incoming[0]];
    setFiles(nextFiles);

    if (toolId === 'split-pdf' && nextFiles[0]) {
      try {
        const count = await getPdfPageCount(nextFiles[0]);
        setPdfPageCount(count);
        setSplitRange(count >= 2 ? `1-${Math.min(2, count)}` : '1');
      } catch {
        setPdfPageCount(null);
      }
    }
  };

  const handleLoadSample = async () => {
    setIsLoadingSample(true);
    setErrorMsg(null);
    setResult(null);
    try {
      const sample = await generateSampleFilesForTool(toolId);
      setFiles(sample);
      if (toolId === 'split-pdf' && sample[0]) {
        const count = await getPdfPageCount(sample[0]);
        setPdfPageCount(count);
        setSplitRange(`1-${Math.min(2, count)}`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to generate sample file.');
    } finally {
      setIsLoadingSample(false);
    }
  };

  const moveFile = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= files.length) return;
    const copy = [...files];
    const [removed] = copy.splice(index, 1);
    copy.splice(target, 0, removed);
    setFiles(copy);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setResult(null);
  };

  const handleRunTool = async () => {
    setErrorMsg(null);

    if (isSuspended) {
      setErrorMsg('Your account is currently suspended. Contact an administrator.');
      return;
    }

    if (isToolDisabled) {
      setErrorMsg('This tool is temporarily paused by the administrator.');
      return;
    }

    if (quotaExceeded) {
      onOpenUpgrade();
      return;
    }

    if (files.length === 0) {
      setErrorMsg('Please select or drop at least one file first.');
      return;
    }

    setIsProcessing(true);
    try {
      let output: ToolProcessResult;
      switch (toolId) {
        case 'merge-pdf':
          output = await runMergePdf(files);
          break;
        case 'split-pdf':
          output = await runSplitPdf(files[0], {
            mode: splitMode,
            rangeText: splitRange,
            everyNPages: splitChunk,
          });
          break;
        case 'compress-pdf':
          output = await runCompressPdf(files[0], { level: compressLevel });
          break;
        case 'pdf-to-image':
          output = await runPdfToImage(files[0], {
            format: pdfImgFormat,
            scale: pdfImgScale,
            quality: pdfImgQuality,
          });
          break;
        case 'image-to-pdf':
          output = await runImageToPdf(files, {
            pageSize: imgPdfSize,
            orientation: imgPdfOrientation,
            marginPt: imgPdfMargin,
          });
          break;
        case 'pdf-to-word':
          output = await runPdfToWord(files[0]);
          break;
        case 'word-to-pdf':
          output = await runWordToPdf(files[0]);
          break;
        case 'image-convert': {
          const parsedW = parseInt(convWidth, 10);
          output = await runImageConvert(files, {
            targetFormat: convFormat,
            quality: convQuality,
            resizeWidth: Number.isFinite(parsedW) && parsedW > 0 ? parsedW : undefined,
          });
          break;
        }
      }

      setResult(output);
      await onRecordSuccess(output, files.length);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Processing failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const triggerDownload = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Breadcrumb & Tool Switcher Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>All Tools</span>
          </button>
          <span className="text-slate-300" aria-hidden="true">
            /
          </span>
          <span className="text-sm font-semibold text-slate-900">{tool.name}</span>
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-600">
          {isPaid ? (
            <span className="font-medium text-emerald-700">
              {userProfile?.plan === 'business' ? 'Business' : 'Pro'} Plan · Unlimited daily runs
            </span>
          ) : (
            <span className="tabular-nums">
              Free quota:{' '}
              <strong className={freeRemaining === 0 ? 'text-rose-600' : 'text-slate-900'}>
                {freeRemaining} of {platformSettings.freeDailyLimit}
              </strong>{' '}
              left today
            </span>
          )}
          {!isPaid && (
            <button
              type="button"
              onClick={onOpenUpgrade}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 cursor-pointer whitespace-nowrap"
            >
              Upgrade to Pro
            </button>
          )}
        </div>
      </div>

      {/* Horizontal quick tool switcher */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {TOOLS_CATALOG.map((item) => {
          const active = item.id === toolId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTool(item.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                active
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              {item.name}
            </button>
          );
        })}
      </div>

      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Upload & File Queue + Results */}
        <div className="lg:col-span-8 space-y-6">
          {quotaExceeded && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold text-amber-950">
                  Daily free limit reached ({platformSettings.freeDailyLimit} /{' '}
                  {platformSettings.freeDailyLimit} used today)
                </h2>
                <p className="text-xs text-amber-800">
                  You have used all {platformSettings.freeDailyLimit} free daily operations. Upgrade
                  to Pro for unlimited access across all 8 tools.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!userProfile && (
                  <button
                    type="button"
                    onClick={onSignIn}
                    className="px-3.5 py-2 text-xs font-medium text-amber-900 bg-white border border-amber-300 rounded-lg hover:bg-amber-100 cursor-pointer whitespace-nowrap"
                  >
                    Sign in
                  </button>
                )}
                <button
                  type="button"
                  onClick={onOpenUpgrade}
                  className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  Unlock Unlimited
                </button>
              </div>
            </div>
          )}

          {/* Dropzone Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <ToolIcon name={tool.iconName} className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="font-display font-bold text-xl text-slate-900">{tool.name}</h1>
                  <p className="text-xs text-slate-500">
                    Accepts {tool.inputLabel} · Outputs {tool.outputLabel} · Max {maxFileMb} MB
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={isLoadingSample}
                onClick={handleLoadSample}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                {isLoadingSample ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-rose-600" />
                )}
                <span>Load sample file</span>
              </button>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const dropped = Array.from(e.dataTransfer.files || []);
                void validateAndSetFiles(dropped);
              }}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                isDragging
                  ? 'border-rose-500 bg-rose-50/50'
                  : 'border-slate-300 bg-slate-50/60 hover:border-slate-400'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={tool.inputAccept}
                multiple={tool.multiple}
                className="hidden"
                onChange={(e) => {
                  const chosen = Array.from(e.target.files || []);
                  void validateAndSetFiles(chosen);
                  e.target.value = '';
                }}
              />
              <Upload className="w-8 h-8 mx-auto mb-3 text-slate-400" />
              <p className="text-sm font-medium text-slate-900 mb-1">
                Drop your {tool.multiple ? 'files' : 'file'} here, or browse from disk
              </p>
              <p className="text-xs text-slate-500 mb-5">
                {tool.multiple
                  ? 'Upload multiple files and arrange their sequence below.'
                  : 'Single file input processed directly in browser memory.'}
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                Select {tool.multiple ? 'Files' : 'File'}
              </button>
            </div>

            {/* Selected File List */}
            {files.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-medium text-slate-700 tabular-nums">
                    {files.length} file{files.length === 1 ? '' : 's'} queued (
                    {formatBytes(files.reduce((sum, f) => sum + f.size, 0))})
                    {pdfPageCount !== null ? ` · ${pdfPageCount} pages detected` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setFiles([]);
                      setPdfPageCount(null);
                      setResult(null);
                    }}
                    className="text-rose-600 hover:text-rose-700 font-medium cursor-pointer"
                  >
                    Clear all
                  </button>
                </div>

                <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg bg-white">
                  {files.map((file, idx) => (
                    <div
                      key={`${file.name}-${idx}`}
                      className="px-4 py-3 flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">
                          {file.name}
                        </div>
                        <div className="text-xs font-mono text-slate-500 tabular-nums">
                          {formatBytes(file.size)}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {tool.multiple && files.length > 1 && (
                          <>
                            <button
                              type="button"
                              aria-label={`Move ${file.name} up`}
                              disabled={idx === 0}
                              onClick={() => moveFile(idx, -1)}
                              className="p-1.5 text-slate-500 hover:text-slate-900 disabled:opacity-30 cursor-pointer"
                            >
                              <ArrowUp className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Move ${file.name} down`}
                              disabled={idx === files.length - 1}
                              onClick={() => moveFile(idx, 1)}
                              className="p-1.5 text-slate-500 hover:text-slate-900 disabled:opacity-30 cursor-pointer"
                            >
                              <ArrowDown className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          aria-label={`Remove ${file.name}`}
                          onClick={() => removeFile(idx)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {errorMsg && (
              <div
                role="alert"
                className="flex items-start gap-2.5 p-4 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800"
              >
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

          {/* Result Panel */}
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h2 className="font-display font-semibold text-lg text-slate-900">
                      Processing Complete
                    </h2>
                    <p className="text-sm text-slate-600">{result.summaryText}</p>
                  </div>
                </div>

                {result.zipItem ? (
                  <button
                    type="button"
                    onClick={() => triggerDownload(result.zipItem!.url, result.zipItem!.name)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <FileArchive className="w-4 h-4" />
                    <span>Download All (.zip)</span>
                  </button>
                ) : (
                  result.items[0] && (
                    <button
                      type="button"
                      onClick={() => triggerDownload(result.items[0].url, result.items[0].name)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download Output</span>
                    </button>
                  )
                )}
              </div>

              {/* Output Size Metrics */}
              <div className="grid grid-cols-3 gap-4 py-2">
                <div>
                  <div className="text-xs text-slate-500">Input Size</div>
                  <div className="font-mono text-base font-semibold text-slate-900 tabular-nums mt-0.5">
                    {formatBytes(result.inputBytes)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Output Size</div>
                  <div className="font-mono text-base font-semibold text-slate-900 tabular-nums mt-0.5">
                    {formatBytes(result.outputBytes)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Processing Time</div>
                  <div className="font-mono text-base font-semibold text-slate-900 tabular-nums mt-0.5">
                    {result.durationMs} ms
                  </div>
                </div>
              </div>

              {/* Extracted Text Preview for PDF <-> Word */}
              {result.extractedTextPreview && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-slate-500">Document Text Preview</div>
                  <pre className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono text-slate-700 whitespace-pre-wrap max-h-56 overflow-y-auto">
                    {result.extractedTextPreview}
                  </pre>
                </div>
              )}

              {/* Individual Output Items / Image Thumbnails */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {result.items.map((item, idx) => (
                  <div
                    key={`${item.name}-${idx}`}
                    className="border border-slate-200 rounded-lg p-3.5 flex items-center justify-between gap-3 bg-slate-50/50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {item.previewUrl && (
                        <img
                          src={item.previewUrl}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                          className="w-12 h-12 rounded object-cover border border-slate-200 shrink-0 bg-white"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 truncate">
                          {item.name}
                        </div>
                        <div className="text-xs font-mono text-slate-500 tabular-nums">
                          {formatBytes(item.size)}
                          {item.dimensions ? ` · ${item.dimensions}` : ''}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => triggerDownload(item.url, item.name)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:border-slate-300 rounded-md shrink-0 cursor-pointer"
                    >
                      Save
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>

        {/* Right: Tool Parameters & Primary Execution Button */}
        <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div>
            <h2 className="font-display font-semibold text-base text-slate-900">
              Conversion Settings
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Configure parameters before running {tool.name}.
            </p>
          </div>

          <div className="space-y-4">
            {toolId === 'merge-pdf' && (
              <p className="text-xs text-slate-600 leading-relaxed">
                Upload 2 or more PDF files and use the arrow buttons in the queue to order pages
                from top to bottom before merging.
              </p>
            )}

            {toolId === 'split-pdf' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Split Method
                  </label>
                  <select
                    value={splitMode}
                    onChange={(e) => setSplitMode(e.target.value as 'each' | 'range' | 'fixed')}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-600"
                  >
                    <option value="each">Split every page into separate PDFs</option>
                    <option value="range">Extract custom page range</option>
                    <option value="fixed">Split every N pages</option>
                  </select>
                </div>

                {splitMode === 'range' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Pages to Extract (e.g., 1-3, 5)
                    </label>
                    <input
                      type="text"
                      value={splitRange}
                      onChange={(e) => setSplitRange(e.target.value)}
                      placeholder="1-3, 5"
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-600"
                    />
                  </div>
                )}

                {splitMode === 'fixed' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Pages per Output PDF
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={splitChunk}
                      onChange={(e) => setSplitChunk(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-600"
                    />
                  </div>
                )}
              </div>
            )}

            {toolId === 'compress-pdf' && (
              <div className="space-y-3">
                <label className="block text-xs font-medium text-slate-700">
                  Compression Level
                </label>
                {(
                  [
                    {
                      id: 'low',
                      title: 'Lossless Stream Optimization',
                      desc: 'Strips redundant metadata while keeping crisp vector text.',
                    },
                    {
                      id: 'medium',
                      title: 'Balanced Visual Compression',
                      desc: 'Re-encodes heavy page graphics at balanced 105 DPI JPEG.',
                    },
                    {
                      id: 'high',
                      title: 'Maximum Size Reduction',
                      desc: 'Aggressive image compaction for fastest email attachment.',
                    },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setCompressLevel(opt.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                      compressLevel === opt.id
                        ? 'border-rose-600 bg-rose-50/50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="text-xs font-semibold text-slate-900">{opt.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            )}

            {toolId === 'pdf-to-image' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Image Format
                  </label>
                  <select
                    value={pdfImgFormat}
                    onChange={(e) => setPdfImgFormat(e.target.value as 'png' | 'jpeg' | 'webp')}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="png">PNG (Lossless crisp text)</option>
                    <option value="jpeg">JPG (Compact photographs)</option>
                    <option value="webp">WebP (Modern web export)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Resolution Scale
                  </label>
                  <select
                    value={pdfImgScale}
                    onChange={(e) => setPdfImgScale(Number(e.target.value) as 1 | 2 | 3)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value={1}>1x · 72 DPI (Screen preview)</option>
                    <option value={2}>2x · 144 DPI (Recommended)</option>
                    <option value={3}>3x · 216 DPI (High resolution)</option>
                  </select>
                </div>

                {pdfImgFormat !== 'png' && (
                  <div>
                    <div className="flex justify-between text-xs text-slate-700 mb-1">
                      <span>Quality</span>
                      <span className="font-mono tabular-nums">
                        {Math.round(pdfImgQuality * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.4}
                      max={1}
                      step={0.05}
                      value={pdfImgQuality}
                      onChange={(e) => setPdfImgQuality(Number(e.target.value))}
                      className="w-full accent-rose-600"
                    />
                  </div>
                )}
              </div>
            )}

            {toolId === 'image-to-pdf' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Page Dimensions
                  </label>
                  <select
                    value={imgPdfSize}
                    onChange={(e) => setImgPdfSize(e.target.value as 'fit' | 'a4' | 'letter')}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="a4">A4 Standard</option>
                    <option value="letter">US Letter</option>
                    <option value="fit">Fit to Image Size</option>
                  </select>
                </div>

                {imgPdfSize !== 'fit' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Orientation
                    </label>
                    <select
                      value={imgPdfOrientation}
                      onChange={(e) =>
                        setImgPdfOrientation(e.target.value as 'auto' | 'portrait' | 'landscape')
                      }
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="auto">Auto (Match each image)</option>
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Page Margin
                  </label>
                  <select
                    value={imgPdfMargin}
                    onChange={(e) => setImgPdfMargin(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value={0}>No Margin (Full bleed)</option>
                    <option value={24}>Small Margin (24 pt)</option>
                    <option value={48}>Wide Margin (48 pt)</option>
                  </select>
                </div>
              </div>
            )}

            {(toolId === 'pdf-to-word' || toolId === 'word-to-pdf') && (
              <p className="text-xs text-slate-600 leading-relaxed">
                {toolId === 'pdf-to-word'
                  ? 'Detects headings, body lines, and page breaks across your PDF to generate a structured Microsoft Word (.docx) document.'
                  : 'Parses DOCX headings, paragraphs, and bullet lists into a cleanly paginated A4 PDF with automatic page numbering.'}
              </p>
            )}

            {toolId === 'image-convert' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Target Format
                  </label>
                  <select
                    value={convFormat}
                    onChange={(e) => setConvFormat(e.target.value as 'png' | 'jpeg' | 'webp')}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="webp">WebP (Smallest modern web)</option>
                    <option value="png">PNG (Lossless transparency)</option>
                    <option value="jpeg">JPG (Universal photo)</option>
                  </select>
                </div>

                {convFormat !== 'png' && (
                  <div>
                    <div className="flex justify-between text-xs text-slate-700 mb-1">
                      <span>Output Quality</span>
                      <span className="font-mono tabular-nums">
                        {Math.round(convQuality * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.3}
                      max={1}
                      step={0.02}
                      value={convQuality}
                      onChange={(e) => setConvQuality(Number(e.target.value))}
                      className="w-full accent-rose-600"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Resize Width in px (optional)
                  </label>
                  <input
                    type="number"
                    min={16}
                    max={8000}
                    placeholder="Keep original width"
                    value={convWidth}
                    onChange={(e) => setConvWidth(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={isProcessing || isToolDisabled}
            onClick={handleRunTool}
            className="w-full py-3 px-5 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processing...</span>
              </>
            ) : quotaExceeded ? (
              <span>Upgrade for Unlimited Access</span>
            ) : (
              <span>Run {tool.name}</span>
            )}
          </button>
        </aside>
      </div>
    </div>
  );
}
