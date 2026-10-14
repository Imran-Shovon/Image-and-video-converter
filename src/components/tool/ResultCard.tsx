import { useState, type ReactNode } from 'react';
import { DropdownMenu } from 'radix-ui';
import { ArrowRight, ChevronDown, Download, Share2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toolsForKind } from '@/features/tools';
import { downloadBlob, shareFile } from '@/lib/download';
import type { MediaKind } from '@/lib/media/formats';
import { formatBytes, sizeChange } from '@/lib/media/sizes';
import { useHandoff } from '@/stores/handoff';
import { Alert, Badge, Button, Card } from '@/components/ui/primitives';
import type { InfoRow } from './FileInfo';
import { FileInfo } from './FileInfo';

export interface ResultCardProps {
  blob: Blob;
  filename: string;
  originalFile: File;
  details: InfoRow[];
  notes?: string[];
  /** Kind of the result, used to offer compatible follow-up tools. */
  resultKind: MediaKind;
  currentToolId: string;
  /** Offer "Keep original" when the output is larger (compression tools). */
  offerKeepOriginal?: boolean;
  children?: ReactNode;
}

export function ResultCard({ blob, filename, originalFile, details, notes = [], resultKind, currentToolId, offerKeepOriginal, children }: ResultCardProps) {
  const change = sizeChange(originalFile.size, blob.size);
  const navigate = useNavigate();
  const give = useHandoff((s) => s.give);
  const [shared, setShared] = useState(false);
  const nextTools = toolsForKind(resultKind).filter((t) => t.id !== currentToolId);
  const canShare = typeof navigator !== 'undefined' && 'canShare' in navigator;

  return (
    <Card className="flex flex-col gap-4" aria-labelledby="result-heading" data-testid="result-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="result-heading" className="text-lg font-semibold">
          Result
        </h2>
        <Badge tone={change.larger ? 'warning' : 'success'}>{change.label}</Badge>
      </div>
      <p className="sr-only" role="status">
        Processing complete. Output is {formatBytes(blob.size)}, {change.label}.
      </p>
      {children}
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Original" value={formatBytes(originalFile.size)} />
        <Stat label="Output" value={formatBytes(blob.size)} testId="output-size" />
        <Stat label="Change" value={change.reductionPercent >= 0 ? `−${Math.abs(change.reductionPercent).toFixed(1)}%` : `+${Math.abs(change.reductionPercent).toFixed(1)}%`} />
      </div>
      <FileInfo rows={details} />
      {notes.length > 0 && (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted" data-testid="result-notes">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {offerKeepOriginal && change.larger && (
        <Alert tone="warning" title="The result is larger than the original">
          Re-encoding made this file bigger. You can keep the original instead.
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="lg" icon={<Download className="size-5" aria-hidden />} onClick={() => downloadBlob(blob, filename)} data-testid="download">
          Download
        </Button>
        {offerKeepOriginal && change.larger && (
          <Button size="lg" onClick={() => downloadBlob(originalFile, originalFile.name)}>
            Keep original
          </Button>
        )}
        {canShare && (
          <Button
            size="lg"
            variant="ghost"
            icon={<Share2 className="size-5" aria-hidden />}
            onClick={async () => setShared(await shareFile(blob, filename))}
            aria-label="Share or save to device"
          >
            {shared ? 'Shared' : 'Share'}
          </Button>
        )}
        {nextTools.length > 0 && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button size="lg" variant="secondary" icon={<ArrowRight className="size-5" aria-hidden />}>
                Continue with… <ChevronDown className="size-4" aria-hidden />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="start" sideOffset={6} className="z-50 min-w-56 rounded-lg border border-border bg-surface p-1 shadow-lg">
                {nextTools.map((t) => (
                  <DropdownMenu.Item
                    key={t.id}
                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 text-sm outline-none data-[highlighted]:bg-surface-2"
                    onSelect={() => {
                      give(new File([blob], filename, { type: blob.type }), currentToolId);
                      navigate(t.path);
                    }}
                  >
                    <t.icon className="size-4 text-muted" aria-hidden />
                    {t.title}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </div>
      <p className="text-xs text-muted">Saved as {filename}</p>
    </Card>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-2 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="font-semibold tabular-nums" data-testid={testId}>
        {value}
      </p>
    </div>
  );
}
