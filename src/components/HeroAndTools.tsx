import { ArrowRight, Check, FileStack, Lock, ShieldCheck, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { TOOLS_CATALOG } from '../lib/toolsCatalog';
import type { PlatformSettings, ToolCategory, ToolId, UserProfile } from '../types';
import { ToolIcon } from './ToolIcon';

interface HeroAndToolsProps {
  onSelectTool: (toolId: ToolId) => void;
  onGoPricing: () => void;
  userProfile: UserProfile | null;
  todayUsageCount: number;
  platformSettings: PlatformSettings;
}

const HERO_IMAGE = '/src/assets/images/hero_document_studio_1795247476912.jpg';
const PROOF_IMAGE = '/src/assets/images/workflow_print_proofs_1795247476272.jpg';
const TESTIMONIAL_IMAGE = '/src/assets/images/testimonial_ops_director_1795247476868.jpg';

const CATEGORIES: { id: ToolCategory; label: string }[] = [
  { id: 'all', label: 'All Tools' },
  { id: 'pdf', label: 'PDF Workflows' },
  { id: 'office', label: 'Word & Excel' },
  { id: 'image', label: 'Image Studio' },
];

export function HeroAndTools({
  onSelectTool,
  onGoPricing,
  userProfile,
  todayUsageCount,
  platformSettings,
}: HeroAndToolsProps) {
  const [category, setCategory] = useState<ToolCategory>('all');
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [proofImgFailed, setProofImgFailed] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const isPaid = userProfile?.plan === 'pro' || userProfile?.plan === 'business';
  const remaining = Math.max(0, platformSettings.freeDailyLimit - todayUsageCount);
  const filteredTools =
    category === 'all'
      ? TOOLS_CATALOG
      : TOOLS_CATALOG.filter((tool) => tool.category === category);

  return (
    <div className="space-y-20 pb-20">
      {/* 1. Hero Split Section */}
      <section className="border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-between space-y-8">
              <div className="space-y-5">
                <p className="text-sm font-medium text-rose-600">
                  Browser-Native Document &amp; Image Suite <span aria-hidden="true">·</span> Powered by Africom Tech Skills
                </p>
                <h1 className="font-display font-bold text-slate-900 tracking-tight text-balance text-4xl sm:text-5xl leading-[1.08]">
                  Precision PDF and image tools built for daily work.
                </h1>
                <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
                  Merge, split, compress, and convert PDFs, Word documents, and high-resolution images
                  directly in your browser. Start with{' '}
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {platformSettings.freeDailyLimit} free tasks per day
                  </span>{' '}
                  or upgrade for unlimited batch workflows.
                </p>

                <div className="flex flex-wrap items-center gap-4 pt-2">
                  <button
                    type="button"
                    onClick={() => onSelectTool('merge-pdf')}
                    className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>Open Merge PDF</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={onGoPricing}
                    className="px-5 py-3 text-sm font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Compare Plans
                  </button>
                </div>
              </div>

              {/* Clean unboxed quota & trust metadata line */}
              <div className="pt-6 border-t border-slate-200 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
                <span className="font-medium text-slate-900 tabular-nums">
                  {isPaid
                    ? `${userProfile?.plan === 'business' ? 'Business' : 'Pro'} Plan · Unlimited daily runs`
                    : `Free Daily Allowance: ${remaining} of ${platformSettings.freeDailyLimit} remaining today`}
                </span>
                <span aria-hidden="true" className="text-slate-300">
                  ·
                </span>
                <span>Up to {isPaid ? platformSettings.maxProFileMb : platformSettings.maxFreeFileMb} MB per file</span>
                <span aria-hidden="true" className="text-slate-300">
                  ·
                </span>
                <span>Zero server file retention</span>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full min-h-[280px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                {heroImgFailed ? (
                  <div className="w-full h-full flex flex-col items-center justify-center p-8 text-slate-500 bg-gradient-to-br from-slate-100 to-slate-200">
                    <FileStack className="w-10 h-10 mb-3 text-rose-600" />
                    <span className="text-sm font-medium text-slate-700">
                      PDF Convert Document Studio
                    </span>
                  </div>
                ) : (
                  <img
                    src={HERO_IMAGE}
                    alt="Clean architectural studio desk with printed layouts and precision ruler"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
            </div>
          </div>

          {/* 4-column metric strip directly below hero split */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pt-10 mt-10 border-t border-slate-200">
            <div>
              <div className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                9 Tools
              </div>
              <div className="text-xs text-slate-500 mt-1">
                PDF, Word, Excel, and image pipelines
              </div>
            </div>
            <div>
              <div className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                &lt; 1.2s
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Median browser merge latency
              </div>
            </div>
            <div>
              <div className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                {platformSettings.freeDailyLimit} / day
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Free allowance before upgrade
              </div>
            </div>
            <div>
              <div className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                100% Local
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Documents stay in your browser
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Tool Directory Grid */}
      <section id="tools-directory" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              01. Complete PDF &amp; Image Toolkit
            </h2>
            <p className="text-sm sm:text-base text-slate-600">
              Choose any workflow below to launch the interactive workspace with instant file previews and batch downloads.
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Filter tools by category"
            className="inline-flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg self-start"
          >
            {CATEGORIES.map((cat) => {
              const active = category === cat.id;
              return (
                <button
                  key={cat.id}
                  role="tab"
                  aria-selected={active}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredTools.map((tool, index) => {
            const isDisabled =
              platformSettings.maintenanceMode ||
              platformSettings.disabledTools.includes(tool.id);

            return (
              <motion.button
                key={tool.id}
                type="button"
                disabled={isDisabled}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: index * 0.03 }}
                whileHover={isDisabled ? undefined : { y: -2 }}
                onClick={() => onSelectTool(tool.id)}
                className={`group text-left bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between transition-colors ${
                  isDisabled
                    ? 'opacity-55 cursor-not-allowed bg-slate-50'
                    : 'hover:border-rose-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-900 group-hover:bg-rose-50 group-hover:text-rose-600 flex items-center justify-center transition-colors">
                      <ToolIcon name={tool.iconName} className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-mono text-slate-400 tabular-nums">
                      0{index + 1}
                    </span>
                  </div>

                  <h3 className="font-display font-semibold text-base text-slate-900 mb-2">
                    {tool.name}
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed mb-6">
                    {tool.shortDesc}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>
                    {tool.inputLabel} <span aria-hidden="true">·</span> {tool.outputLabel}
                  </span>
                  {isDisabled ? (
                    <span className="text-amber-700 font-medium">Paused</span>
                  ) : (
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-rose-600 group-hover:translate-x-0.5 transition-all" />
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* 3. Architecture & Proof Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-5 bg-slate-100 min-h-[260px]">
            {proofImgFailed ? (
              <div className="w-full h-full flex items-center justify-center p-8 text-slate-500">
                <span className="text-sm font-medium">Print &amp; Proof Calibration</span>
              </div>
            ) : (
              <img
                src={PROOF_IMAGE}
                alt="Printed magazine layouts and color calibration cards arranged on a studio table"
                referrerPolicy="no-referrer"
                onError={() => setProofImgFailed(true)}
                className="w-full h-full object-cover"
              />
            )}
          </div>

          <div className="lg:col-span-7 p-8 sm:p-10 flex flex-col justify-between space-y-8">
            <div className="space-y-4">
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                02. Built for confidentiality and speed
              </h2>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                Unlike legacy upload portals that queue sensitive contracts on remote servers, PDF Convert runs PDF assembly, raster rendering, and Office extraction locally in your browser tab—logging only anonymous quota telemetry to your account.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Lock className="w-4 h-4 text-rose-600" />
                    <span>Zero Upload Exposure</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Client-side memory buffers clear automatically when you leave the tool.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Zap className="w-4 h-4 text-rose-600" />
                    <span>Instant Batch ZIPs</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Bundle split PDFs and multi-page image exports into a single compressed archive.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <ShieldCheck className="w-4 h-4 text-rose-600" />
                    <span>Predictable Quotas</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Clear daily counter on Free; immediate unlimited unlock on Pro and Business.
                  </p>
                </div>
              </div>
            </div>

            {/* Attributable Testimonial adjacent to proof claims */}
            <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="w-12 h-12 rounded-full overflow-hidden border border-slate-200 shrink-0 bg-slate-100">
                {avatarFailed ? (
                  <div className="w-full h-full flex items-center justify-center text-xs font-semibold text-slate-600">
                    ER
                  </div>
                ) : (
                  <img
                    src={TESTIMONIAL_IMAGE}
                    alt="Elena Rostova, Director of Operations at Northbridge Legal"
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarFailed(true)}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm text-slate-700 italic">
                  &ldquo;We replaced three desktop licenses with PDF Convert. Merging 80-page closing binders and exporting exhibits to PNG cut our paralegal prep time by 45 minutes per case.&rdquo;
                </p>
                <div className="text-xs text-slate-500">
                  <span className="font-semibold text-slate-900">Elena Rostova</span>
                  <span aria-hidden="true"> · </span>
                  <span>Director of Operations, Northbridge Legal</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Free vs Pro Action Banner */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-slate-900 text-white rounded-xl p-8 sm:p-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="space-y-3 max-w-2xl">
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
              Need more than {platformSettings.freeDailyLimit} tasks a day?
            </h2>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Upgrade to Pro for unlimited daily conversions across all 9 tools, larger {platformSettings.maxProFileMb} MB file ceilings, full usage history, and priority support.
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1 text-xs text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <Check className="w-4 h-4 text-rose-400" /> Unlimited PDF &amp; image runs
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="w-4 h-4 text-rose-400" /> Up to {platformSettings.maxProFileMb} MB per file
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="w-4 h-4 text-rose-400" /> Downloadable PDF invoices
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onGoPricing}
            className="px-6 py-3 text-sm font-semibold text-slate-900 bg-white hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start lg:self-center cursor-pointer"
          >
            View Subscription Plans
          </button>
        </div>
      </section>
    </div>
  );
}
