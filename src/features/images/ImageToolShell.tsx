import { useMemo, useState, type ReactNode } from 'react';
import { Archive, Download, RotateCcw, Trash, X } from 'lucide-react';
import type { ToolInfo } from '@/features/tools';
import { buildZip, downloadBlob } from '@/lib/download';
import type { ImageProbe } from '@/lib/image-processing/types';
import { acceptedImageFormats } from '@/lib/media/capabilities';
import { ERROR_COPY, toMediaError, type MediaError } from '@/lib/media/errors';
import { FORMATS } from '@/lib/media/formats';
import { getLimits } from '@/lib/media/limits';
import { formatBytes, sizeChange } from '@/lib/media/sizes';
import { useFileHandoff } from '@/hooks/useFileHandoff';
import { Alert, Badge, Button, Card } from '@/components/ui/primitives';
import { CompareSlider } from '@/components/tool/CompareSlider';
import { ErrorAlert } from '@/components/tool/ErrorAlert';
import { FileInfo, type InfoRow } from '@/components/tool/FileInfo';
import { ProgressBar } from '@/components/tool/ProgressBar';
import { ResultCard } from '@/components/tool/ResultCard';
import { ToolLayout } from '@/components/tool/ToolLayout';
import { UploadZone } from '@/components/tool/UploadZone';
import { useImageQueue, type BuildJob, type ImageItem } from './useImageQueue';

export function imageInfoRows(item: ImageItem): InfoRow[] {
  const rows: InfoRow[] = [{ label: 'Size', value: formatBytes(item.file.size) }];
  if (item.probe) {
    rows.unshift({ label: 'Format', value: FORMATS[item.probe.format].label + (item.validated?.extensionMismatch ? ' (extension doesn’t match content)' : '') });
    rows.push({ label: 'Dimensions', value: `${item.probe.width} × ${item.probe.height} px` });
    rows.push({ label: 'Transparency', value: item.probe.hasAlpha ? 'Yes' : 'No' });
    if (item.probe.animated) rows.push({ label: 'Animated', value: 'Yes — first frame only' });
    if (item.probe.orientation !== 1) rows.push({ label: 'Orientation', value: `EXIF ${item.probe.orientation} (applied)` });
  }
  return rows;
}

const STAGE_LABEL = {
  download: 'Downloading',
  model: 'Preparing',
  segment: 'Analysing',
  decode: 'Decoding',
  transform: 'Transforming',
  encode: 'Encoding',
  verify: 'Verifying output',
} as const;

export interface ImageToolShellProps {
  tool: ToolInfo;
  /** Word used in output filenames, e.g. "compressed". */
  operation: string;
  multiple?: boolean;
  actionLabel: string;
  /** Settings panel; receives the first ready item's probe for context. */
  settings: (probe: ImageProbe | undefined) => ReactNode;
  buildJob: BuildJob;
  /** Warnings to show before processing (e.g. transparency will be lost). */
  warnings?: (item: ImageItem) => string[];
  /** Validation error message for current settings, which disables processing. */
  settingsError?: string | null;
  offerKeepOriginal?: boolean;
  /** Background removal shows the whole cutout first; other tools start with comparison. */
  resultView?: 'compare' | 'result';
}

export function ImageToolShell({ tool, operation, multiple = false, actionLabel, settings, buildJob, warnings, settingsError, offerKeepOriginal, resultView = 'compare' }: ImageToolShellProps) {
  const queue = useImageQueue({ multiple, operation });
  const { items, add } = queue;
  const accept = useMemo(() => acceptedImageFormats(), []);
  const [zipError, setZipError] = useState<MediaError | null>(null);
  const [zipping, setZipping] = useState(false);

  useFileHandoff(add);

  const ready = items.filter((it) => it.probe);
  const firstProbe = ready[0]?.probe;
  const processing = items.some((it) => it.status === 'processing');
  const done = items.filter((it) => it.status === 'done');
  const failed = items.filter((it) => it.status === 'error' && it.probe);
  const single = !multiple || items.length === 1 ? items[0] : undefined;
  const itemWarnings = single?.probe && warnings ? warnings(single) : [];

  const downloadZip = async () => {
    setZipError(null);
    setZipping(true);
    try {
      const zip = await buildZip(
        done.map((it) => ({ name: it.result!.filename, blob: it.result!.blob })),
        items.filter((it) => it.status === 'error').map((it) => ({ name: it.file.name, reason: it.error ? (it.error.detail ?? ERROR_COPY[it.error.code].message) : 'Failed' })),
        getLimits().zipBytes,
      );
      downloadBlob(zip, `${operation}-images.zip`);
    } catch (error) {
      setZipError(toMediaError(error));
    } finally {
      setZipping(false);
    }
  };

  const action = (
    <div className="flex flex-col gap-3">
      {settingsError && <Alert tone="warning">{settingsError}</Alert>}
      {processing ? (
        <Button variant="danger" size="lg" onClick={() => queue.cancel()} icon={<X className="size-5" aria-hidden />}>
          Cancel
        </Button>
      ) : (
        <Button variant="primary" size="lg" disabled={ready.length === 0 || !!settingsError} onClick={() => queue.run(buildJob)} data-testid="process">
          {actionLabel}
          {ready.length > 1 ? ` ${ready.length} images` : ''}
        </Button>
      )}
    </div>
  );

  const aside = items.length > 0 && (
    <>
      <Card className="flex flex-col gap-5">
        <h2 className="font-semibold">Settings</h2>
        {settings(firstProbe)}
      </Card>
      <Card>{action}</Card>
    </>
  );

  return (
    <ToolLayout tool={tool} aside={aside || undefined} step={done.length > 0 ? 3 : items.length > 0 ? 2 : 1} sourceFile={items[0]?.file}>
      {queue.notice && <ErrorAlert error={queue.notice} />}
      {items.length === 0 && <UploadZone accept={accept} multiple={multiple} onFiles={add} allowPaste />}

      {single && (
        <>
          <Card className="flex flex-col gap-4">
            <FileInfo
              title={single.file.name}
              rows={imageInfoRows(single)}
              actions={
                <Button size="sm" variant="ghost" onClick={queue.clear} icon={<RotateCcw className="size-4" aria-hidden />} disabled={processing}>
                  Start over
                </Button>
              }
            />
            {single.status === 'checking' && <ProgressBar fraction={null} label="Reading image" />}
            {single.error && single.status === 'error' && (
              <ErrorAlert
                error={single.error}
                action={
                  single.probe ? (
                    <Button size="sm" onClick={() => queue.run(buildJob)}>
                      Retry
                    </Button>
                  ) : (
                    <Button size="sm" onClick={queue.clear}>
                      Choose another file
                    </Button>
                  )
                }
              />
            )}
            {itemWarnings.map((w) => (
              <Alert key={w} tone="warning">
                {w}
              </Alert>
            ))}
            {single.preview && !single.result && (
              <div className="checkerboard flex max-h-[70vh] justify-center overflow-hidden rounded-lg border border-border">
                <img src={single.preview.url} alt={`Preview of ${single.file.name}`} className="max-h-[70vh] object-contain" />
              </div>
            )}
            {single.status === 'processing' && single.progress && (
              <ProgressBar fraction={single.progress.fraction} label={single.progress.message ?? STAGE_LABEL[single.progress.stage]} />
            )}
          </Card>
          {single.result && single.probe && (
            <ResultCard
              blob={single.result.blob}
              filename={single.result.filename}
              originalFile={single.file}
              resultKind="image"
              currentToolId={tool.id}
              offerKeepOriginal={offerKeepOriginal}
              notes={single.result.notes}
              details={[
                { label: 'Format', value: FORMATS[single.result.format].label },
                { label: 'Dimensions', value: `${single.result.width} × ${single.result.height} px` },
                ...(single.result.target
                  ? [
                      { label: 'Target size', value: `${formatBytes(single.result.target.requestedBytes)} — ${single.result.target.met ? 'reached' : 'not reachable'}` },
                      { label: 'Quality used', value: String(single.result.quality) },
                    ]
                  : []),
              ]}
            >
              <CompareSlider key={single.result.url} beforeUrl={single.originalUrl ?? single.preview!.url} afterUrl={single.result.url} width={single.result.width} height={single.result.height} initialView={resultView} />
            </ResultCard>
          )}
        </>
      )}

      {multiple && items.length > 1 && (
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">
              {items.length} files · {done.length} done{failed.length > 0 ? ` · ${failed.length} failed` : ''}
            </h2>
            <div className="flex flex-wrap gap-2">
              {failed.length > 0 && !processing && (
                <Button size="sm" onClick={() => queue.retryFailed(buildJob)} icon={<RotateCcw className="size-4" aria-hidden />}>
                  Retry failed
                </Button>
              )}
              {done.length > 0 && !processing && (
                <Button size="sm" variant="primary" onClick={downloadZip} loading={zipping} icon={<Archive className="size-4" aria-hidden />} data-testid="download-zip">
                  Download all (ZIP)
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={queue.clear} disabled={processing} icon={<Trash className="size-4" aria-hidden />}>
                Clear
              </Button>
            </div>
          </div>
          {zipError && <ErrorAlert error={zipError} />}
          <ul className="flex flex-col divide-y divide-border" data-testid="batch-list">
            {items.map((it) => (
              <BatchRow key={it.id} item={it} onRemove={() => queue.remove(it.id)} onCancel={() => queue.cancel(it.id)} />
            ))}
          </ul>
          <UploadZone accept={accept} multiple onFiles={add} compact title="Add more files" disabled={processing} />
        </Card>
      )}
    </ToolLayout>
  );
}

function BatchRow({ item, onRemove, onCancel }: { item: ImageItem; onRemove: () => void; onCancel: () => void }) {
  const change = item.result ? sizeChange(item.file.size, item.result.bytes) : null;
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="checkerboard size-12 shrink-0 overflow-hidden rounded-md border border-border">
          {item.preview && <img src={item.preview.url} alt="" className="size-full object-cover" />}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{item.file.name}</p>
          <p className="text-xs text-muted">
            {formatBytes(item.file.size)}
            {item.probe && ` · ${item.probe.width}×${item.probe.height}`}
            {item.result && ` → ${formatBytes(item.result.bytes)}`}
          </p>
          {item.status === 'error' && item.error && (
            <p className="text-xs text-danger" role="alert">
              {item.error.detail ?? ERROR_COPY[item.error.code].message}
            </p>
          )}
          {item.status === 'processing' && <ProgressBar className="mt-1 w-56 max-w-full" fraction={item.progress?.fraction ?? null} label={item.progress?.message ?? 'Processing'} />}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StatusBadge item={item} changeLabel={change?.label} larger={change?.larger} />
        {item.result && (
          <Button size="sm" variant="ghost" onClick={() => downloadBlob(item.result!.blob, item.result!.filename)} aria-label={`Download ${item.result.filename}`} icon={<Download className="size-4" aria-hidden />} />
        )}
        {item.status === 'processing' ? (
          <Button size="sm" variant="ghost" onClick={onCancel} aria-label={`Cancel ${item.file.name}`} icon={<X className="size-4" aria-hidden />} />
        ) : (
          <Button size="sm" variant="ghost" onClick={onRemove} aria-label={`Remove ${item.file.name}`} icon={<Trash className="size-4" aria-hidden />} />
        )}
      </div>
    </li>
  );
}

function StatusBadge({ item, changeLabel, larger }: { item: ImageItem; changeLabel?: string; larger?: boolean }) {
  switch (item.status) {
    case 'checking':
      return <Badge>Checking</Badge>;
    case 'ready':
      return <Badge tone="accent">Ready</Badge>;
    case 'processing':
      return <Badge tone="accent">Processing</Badge>;
    case 'done':
      return <Badge tone={larger ? 'warning' : 'success'}>{changeLabel ?? 'Done'}</Badge>;
    case 'error':
      return <Badge tone="danger">{item.error?.code === 'CANCELLED' ? 'Cancelled' : 'Failed'}</Badge>;
  }
}
