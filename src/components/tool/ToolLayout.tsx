import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';
import { WorkflowSteps, type WorkflowStep } from './WorkflowSteps';
import { UploadZone, type UploadZoneProps } from './UploadZone';
import type { ToolInfo } from '@/features/tools';
import { useHandoff } from '@/stores/handoff';

/** Spec §4: every tool page states where processing happens. */
export function ProcessingBadge() {
  return (
    <p
      className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success-soft px-3 py-1 text-xs font-medium text-success"
      data-testid="processing-badge"
    >
      <ShieldCheck className="size-4" aria-hidden />
      Processed in your browser — files never leave your device
    </p>
  );
}

export function ToolLayout({
  tool,
  children,
  aside,
  step = 1,
  sourceFile,
  upload,
}: {
  tool: ToolInfo;
  children: ReactNode;
  aside?: ReactNode;
  step?: 1 | 2 | 3;
  sourceFile?: File;
  upload?: UploadZoneProps;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{ step: WorkflowStep; progress: WorkflowStep } | null>(
    null,
  );
  const current = selection?.progress === step ? selection.step : step;
  const showUpload = selection?.step === 1 && current === 1 && !!sourceFile && !!upload;
  const focusSection = (selector: string) => {
    const target = rootRef.current?.querySelector<HTMLElement>(selector);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
      block: 'start',
    });
  };
  useEffect(() => {
    if (showUpload) {
      const target = rootRef.current?.querySelector<HTMLElement>(
        '[data-testid="upload-zone"] button',
      );
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
  }, [showUpload]);
  const selectStep = (next: WorkflowStep) => {
    if (next > step) return;
    setSelection({ step: next, progress: step });
    if (next === 1) focusSection('[data-testid="upload-zone"] button');
    if (next === 2) focusSection('[data-workflow-settings]');
    if (next === 3) focusSection('[data-testid="result-card"], [data-testid="download-zip"]');
  };
  const give = useHandoff((s) => s.give);
  useEffect(() => {
    document.title = `${tool.title} — Media Toolkit`;
  }, [tool.title]);

  const Icon = tool.icon;
  return (
    <div ref={rootRef} className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          to="/"
          onClick={() => {
            if (sourceFile) give(sourceFile, tool.id);
          }}
          className="inline-flex min-h-11 items-center gap-2 text-sm text-muted hover:text-accent"
        >
          <ArrowLeft className="size-4" aria-hidden /> Back to workspace
        </Link>
        <WorkflowSteps current={current} availableThrough={step} onSelect={selectStep} />
      </div>
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Icon className="size-5" aria-hidden />
          </span>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{tool.title}</h1>
        </div>
        <p className="max-w-3xl text-muted">{tool.description}</p>
        <ProcessingBadge />
      </header>
      {showUpload && upload && (
        <section
          className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4"
          aria-label="Upload files"
        >
          <p className="text-sm text-muted">
            Your current file and results stay available while you browse steps.
            {upload.multiple
              ? ' Additional files join your current queue.'
              : ' Selecting a new file replaces the current one.'}
          </p>
          <UploadZone
            {...upload}
            onFiles={(files) => {
              upload.onFiles(files);
              setSelection({ step: 2, progress: step });
            }}
            allowPaste
          />
        </section>
      )}
      {aside ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-6">{children}</div>
          <aside
            data-workflow-settings
            tabIndex={-1}
            aria-label="Editing settings"
            className="flex flex-col gap-4 outline-none"
          >
            {aside}
          </aside>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
