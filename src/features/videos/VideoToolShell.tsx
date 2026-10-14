import { useMemo, useState, type ReactNode } from 'react';
import { Archive, Download, RotateCcw, Trash, X } from 'lucide-react';
import type { ToolInfo } from '@/features/tools';
import { buildZip, downloadBlob } from '@/lib/download';
import { acceptedVideoFormats } from '@/lib/media/capabilities';
import { ERROR_COPY, toMediaError, type MediaError } from '@/lib/media/errors';
import { FORMATS, type FormatId, type MediaKind } from '@/lib/media/formats';
import { getLimits } from '@/lib/media/limits';
import { formatBytes, formatDuration, sizeChange } from '@/lib/media/sizes';
import type { EnginePreference } from '@/lib/video-processing/engine';
import type { VideoJob, VideoProbe, VideoProgress } from '@/lib/video-processing/types';
import { useFileHandoff } from '@/hooks/useFileHandoff';
import { Alert, Badge, Button, Card, Select } from '@/components/ui/primitives';
import { ErrorAlert } from '@/components/tool/ErrorAlert';
import { FileInfo, type InfoRow } from '@/components/tool/FileInfo';
import { ProgressBar } from '@/components/tool/ProgressBar';
import { ResultCard } from '@/components/tool/ResultCard';
import { ToolLayout } from '@/components/tool/ToolLayout';
import { UploadZone } from '@/components/tool/UploadZone';
import { useVideoQueue, type PostProcess, type VideoItem } from './useVideoQueue';

export function probeRows(probe: VideoProbe, sizeBytes?: number): InfoRow[] {
  const rows: InfoRow[] = [];
  if (sizeBytes !== undefined) rows.push({ label: 'Size', value: formatBytes(sizeBytes) });
  if (probe.durationSec !== null) rows.push({ label: 'Duration', value: formatDuration(probe.durationSec, true) });
  if (probe.video) {
    const v = probe.video;
    rows.push({ label: 'Video', value: `${v.codec.toUpperCase()} · ${v.width} × ${v.height}${v.rotation ? ` (rotated ${v.rotation}°)` : ''}` });
    if (v.fps) rows.push({ label: 'Frame rate', value: `${Number(v.fps.toFixed(3))} fps${v.vfr ? ' (variable)' : ''}` });
  }
  rows.push({
    label: 'Audio',
    value: probe.audio ? `${probe.audio.codec.toUpperCase()}${probe.audio.channels ? ` · ${probe.audio.channels === 1 ? 'mono' : probe.audio.channels === 2 ? 'stereo' : `${probe.audio.channels} ch`}` : ''}${probe.audio.sampleRate ? ` · ${probe.audio.sampleRate / 1000} kHz` : ''}` : 'None',
  });
  if (probe.audioStreams > 1) rows.push({ label: 'Audio tracks', value: `${probe.audioStreams} (first is used)` });
  if (probe.subtitleStreams > 0) rows.push({ label: 'Subtitles', value: `${probe.subtitleStreams} (removed on export)` });
  if (probe.bitrateKbps) rows.push({ label: 'Bitrate', value: `${probe.bitrateKbps.toLocaleString()} kb/s` });
  return rows;
}

const STAGE_LABEL: Record<VideoProgress['stage'], string> = {
  'loading-engine': 'Loading video engine',
  probing: 'Reading video',
  processing: 'Processing',
  verifying: 'Checking the output',
};

export function progressLabel(p: VideoProgress | undefined): string {
  return p?.message ?? STAGE_LABEL[p?.stage ?? 'processing'];
}

/** Video element for the source (or its proxy), with notices for unplayable formats. */
export function SourcePreview({ item, onGenerate, videoRef, overlay }: { item: VideoItem; onGenerate: () => void; videoRef?: (el: HTMLVideoElement | null) => void; overlay?: boolean }) {
  const state = item.previewState;
  if (state === 'testing') return <ProgressBar fraction={null} label="Preparing preview" />;
  if (state === 'generating')
    return (
      <div className="flex flex-col gap-2">
        <Alert tone="info">Your browser can’t play this format, so a low-resolution preview is being created. Processing will still use the original file.</Alert>
        <ProgressBar fraction={item.previewProgress?.fraction ?? null} label={item.previewProgress?.stage === 'loading-engine' ? progressLabel(item.previewProgress) : 'Creating preview'} />
      </div>
    );
  if (state === 'unplayable' || state === 'failed')
    return (
      <Alert tone="info" title="Preview not available" action={state === 'unplayable' && <Button size="sm" onClick={onGenerate}>Create preview</Button>}>
        Your browser can’t play this format. You can still process it — the output will be verified before download.
      </Alert>
    );
  if (!item.previewUrl) return null;
  return (
    <div className="flex flex-col gap-2">
      {state === 'proxy' && <Badge tone="accent" className="w-fit">Low-resolution preview</Badge>}
      <video
        ref={videoRef}
        src={item.previewUrl}
        controls={!overlay}
        playsInline
        preload="auto"
        className="max-h-[60vh] w-full rounded-lg bg-black"
        aria-label={`Preview of ${item.file.name}`}
      />
    </div>
  );
}

export interface VideoToolShellProps {
  tool: ToolInfo;
  operation: string;
  multiple?: boolean;
  needsPreview?: boolean;
  extraAccept?: FormatId[];
  actionLabel: string;
  settings: (item: VideoItem | undefined) => ReactNode;
  buildJob: (item: VideoItem) => VideoJob;
  settingsError?: string | null;
  /** Validation per item (e.g. "this video has no audio"). */
  itemError?: (item: VideoItem) => string | null;
  engine?: EnginePreference;
  onEngineChange?: (e: EnginePreference) => void;
  resultKind?: MediaKind;
  offerKeepOriginal?: boolean;
  /** Custom editor (trim bar, cropper) rendered instead of the plain preview for single files. */
  editor?: (item: VideoItem, queue: ReturnType<typeof useVideoQueue>) => ReactNode;
  postProcess?: PostProcess;
}

export function VideoToolShell(props: VideoToolShellProps) {
  const { tool, operation, multiple = false, needsPreview = false, extraAccept, actionLabel, settings, buildJob, settingsError, itemError, engine = 'auto', onEngineChange, resultKind = 'video', offerKeepOriginal, editor, postProcess } = props;
  const queue = useVideoQueue({ multiple, operation, needsPreview, extraAccept });
  const { items, add } = queue;
  const accept = useMemo(() => [...acceptedVideoFormats(), ...(extraAccept ?? [])], [extraAccept]);
  const [zipError, setZipError] = useState<MediaError | null>(null);

  useFileHandoff(add);

  const processing = items.some((it) => it.status === 'processing');
  const runnable = items.filter((it) => it.probe && !itemError?.(it));
  const single = !multiple || items.length === 1 ? items[0] : undefined;
  const done = items.filter((it) => it.status === 'done');
  const failed = items.filter((it) => it.status === 'error' && it.probe);
  const singleItemError = single?.probe ? itemError?.(single) : null;

  const run = (ids?: string[]) => queue.run(buildJob, engine, ids ?? runnable.map((it) => it.id), postProcess);

  const aside = items.length > 0 && (
    <>
      <Card className="flex flex-col gap-5">
        <h2 className="font-semibold">Settings</h2>
        {settings(items.find((it) => it.probe))}
        {onEngineChange && (
          <Select<EnginePreference>
            label="Engine"
            value={engine}
            onChange={onEngineChange}
            options={[
              { value: 'auto', label: 'Automatic (hardware when available)' },
              { value: 'ffmpeg', label: 'Compatible (ffmpeg.wasm)' },
            ]}
            hint="Automatic uses your browser’s built-in encoder when it supports the job, which is much faster."
          />
        )}
      </Card>
      <Card className="flex flex-col gap-3">
        {settingsError && <Alert tone="warning">{settingsError}</Alert>}
        {processing ? (
          <Button variant="danger" size="lg" onClick={() => queue.cancel()} icon={<X className="size-5" aria-hidden />}>
            Cancel
          </Button>
        ) : (
          <Button variant="primary" size="lg" disabled={runnable.length === 0 || !!settingsError} onClick={() => run()} data-testid="process">
            {actionLabel}
            {runnable.length > 1 ? ` ${runnable.length} videos` : ''}
          </Button>
        )}
        <p className="text-xs text-muted">Large videos can take a while. Keep this tab open until processing finishes.</p>
      </Card>
    </>
  );

  return (
    <ToolLayout tool={tool} aside={aside || undefined} step={done.length > 0 ? 3 : items.length > 0 ? 2 : 1} sourceFile={items[0]?.file}>
      {queue.notice && <ErrorAlert error={queue.notice} />}
      {items.length === 0 && <UploadZone accept={accept} multiple={multiple} onFiles={add} title={multiple ? 'Drop videos here' : 'Drop a video here'} />}

      {single && (
        <>
          <Card className="flex flex-col gap-4">
            <FileInfo
              title={single.file.name}
              rows={single.probe ? probeRows(single.probe, single.file.size) : [{ label: 'Size', value: formatBytes(single.file.size) }]}
              actions={
                <Button size="sm" variant="ghost" onClick={queue.clear} disabled={processing} icon={<RotateCcw className="size-4" aria-hidden />}>
                  Start over
                </Button>
              }
            />
            {single.status === 'checking' && <ProgressBar fraction={null} label="Reading video details" />}
            {single.error && (
              <ErrorAlert
                error={single.error}
                action={
                  single.probe ? (
                    <Button size="sm" onClick={() => run([single.id])}>
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
            {singleItemError && <Alert tone="warning">{singleItemError}</Alert>}
            {single.warnings.map((w) => (
              <Alert key={w} tone="info">
                {w}
              </Alert>
            ))}
            {single.probe && !single.result && (editor ? editor(single, queue) : <SourcePreview item={single} onGenerate={() => queue.ensurePreview(single.id)} />)}
            {single.status === 'processing' && <ProgressBar fraction={single.progress?.fraction ?? null} label={progressLabel(single.progress)} />}
          </Card>
          {single.result && (
            <ResultCard
              blob={single.result.blob}
              filename={single.result.filename}
              originalFile={single.file}
              resultKind={resultKind}
              currentToolId={tool.id}
              offerKeepOriginal={offerKeepOriginal}
              notes={single.result.notes}
              details={[
                { label: 'Format', value: single.result.filenameExt.toUpperCase() },
                ...(single.result.probe ? probeRows(single.result.probe) : []),
                { label: 'Engine', value: single.result.engine === 'webcodecs' ? 'WebCodecs (hardware)' : 'ffmpeg.wasm' },
              ]}
            >
              {resultKind === 'audio' ? (
                <audio src={single.result.url} controls className="w-full" data-testid="result-media" />
              ) : single.result.mime.startsWith('image/') ? (
                <img src={single.result.url} alt="Result" className="max-h-[60vh] w-full rounded-lg object-contain" data-testid="result-media" />
              ) : (
                <video src={single.result.url} controls playsInline className="max-h-[60vh] w-full rounded-lg bg-black" data-testid="result-media" />
              )}
              {editor && (
                <Button onClick={() => queue.discardResult(single.id)} icon={<RotateCcw className="size-4" aria-hidden />}>
                  Edit again
                </Button>
              )}
            </ResultCard>
          )}
        </>
      )}

      {multiple && items.length > 1 && (
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">
              {items.length} videos · {done.length} done{failed.length > 0 ? ` · ${failed.length} failed` : ''}
            </h2>
            <div className="flex flex-wrap gap-2">
              {failed.length > 0 && !processing && (
                <Button size="sm" onClick={() => run(failed.map((it) => it.id))} icon={<RotateCcw className="size-4" aria-hidden />}>
                  Retry failed
                </Button>
              )}
              {done.length > 1 && !processing && (
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Archive className="size-4" aria-hidden />}
                  onClick={async () => {
                    setZipError(null);
                    try {
                      const zip = await buildZip(
                        done.map((it) => ({ name: it.result!.filename, blob: it.result!.blob })),
                        items.filter((it) => it.status === 'error').map((it) => ({ name: it.file.name, reason: it.error ? (it.error.detail ?? ERROR_COPY[it.error.code].message) : 'Failed' })),
                        getLimits().zipBytes,
                      );
                      downloadBlob(zip, `${operation}-videos.zip`);
                    } catch (e) {
                      setZipError(toMediaError(e));
                    }
                  }}
                >
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
            {items.map((it) => {
              const change = it.result ? sizeChange(it.file.size, it.result.bytes) : null;
              const problem = it.probe ? itemError?.(it) : null;
              return (
                <li key={it.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{it.file.name}</p>
                    <p className="text-xs text-muted">
                      {formatBytes(it.file.size)}
                      {it.probe?.video && ` · ${it.probe.video.width}×${it.probe.video.height}`}
                      {it.probe?.durationSec ? ` · ${formatDuration(it.probe.durationSec)}` : ''}
                      {it.validated && ` · ${FORMATS[it.validated.format].label}`}
                      {it.result && ` → ${formatBytes(it.result.bytes)}`}
                    </p>
                    {(problem || (it.status === 'error' && it.error)) && (
                      <p className="text-xs text-danger" role="alert">
                        {problem ?? it.error!.detail ?? ERROR_COPY[it.error!.code].message}
                      </p>
                    )}
                    {it.status === 'processing' && <ProgressBar className="mt-1 max-w-sm" fraction={it.progress?.fraction ?? null} label={progressLabel(it.progress)} />}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={it.status === 'done' ? (change?.larger ? 'warning' : 'success') : it.status === 'error' ? 'danger' : 'accent'}>
                      {it.status === 'done' ? change?.label : it.status === 'error' ? (it.error?.code === 'CANCELLED' ? 'Cancelled' : 'Failed') : it.status === 'checking' ? 'Checking' : it.status === 'processing' ? 'Processing' : 'Ready'}
                    </Badge>
                    {it.result && (
                      <Button size="sm" variant="ghost" onClick={() => downloadBlob(it.result!.blob, it.result!.filename)} aria-label={`Download ${it.result.filename}`} icon={<Download className="size-4" aria-hidden />} />
                    )}
                    {it.status === 'processing' ? (
                      <Button size="sm" variant="ghost" onClick={() => queue.cancel(it.id)} aria-label={`Cancel ${it.file.name}`} icon={<X className="size-4" aria-hidden />} />
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => queue.remove(it.id)} aria-label={`Remove ${it.file.name}`} icon={<Trash className="size-4" aria-hidden />} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <UploadZone accept={accept} multiple onFiles={add} compact title="Add more videos" disabled={processing} />
        </Card>
      )}
    </ToolLayout>
  );
}
