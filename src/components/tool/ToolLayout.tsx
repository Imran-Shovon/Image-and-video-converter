import { useEffect, type ReactNode } from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';
import { WorkflowSteps } from './WorkflowSteps';
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
}: {
  tool: ToolInfo;
  children: ReactNode;
  aside?: ReactNode;
  step?: 1 | 2 | 3;
  sourceFile?: File;
}) {
  const give = useHandoff((s) => s.give);
  useEffect(() => {
    document.title = `${tool.title} — Media Toolkit`;
  }, [tool.title]);

  const Icon = tool.icon;
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
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
        <WorkflowSteps current={step} />
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
      {aside ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-6">{children}</div>
          <aside className="flex flex-col gap-4">{aside}</aside>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
