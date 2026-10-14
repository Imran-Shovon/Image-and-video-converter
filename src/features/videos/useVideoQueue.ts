// State for video tools: validate → probe → route → preview (with proxy fallback) → sequential processing.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { acceptedVideoFormats } from '@/lib/media/capabilities';
import { MediaError, toMediaError } from '@/lib/media/errors';
import { detectFeatures } from '@/lib/media/features';
import { dedupeFilename, outputFilename } from '@/lib/media/filenames';
import { primaryExtension, type FormatId } from '@/lib/media/formats';
import { getLimits } from '@/lib/media/limits';
import { routeVideoJob } from '@/lib/media/routing';
import { validateFile, type ValidatedFile } from '@/lib/media/validate';
import { makePreviewProxy, probeVideo, runVideoJob, type EnginePreference } from '@/lib/video-processing/engine';
import type { VideoJob, VideoJobResult, VideoProbe, VideoProgress } from '@/lib/video-processing/types';

export type VideoItemStatus = 'checking' | 'ready' | 'processing' | 'done' | 'error';
export type PreviewState = 'testing' | 'playable' | 'unplayable' | 'generating' | 'proxy' | 'failed';

export interface VideoItem {
  id: string;
  file: File;
  ext: string;
  status: VideoItemStatus;
  validated?: ValidatedFile;
  probe?: VideoProbe;
  warnings: string[];
  previewUrl?: string;
  previewState?: PreviewState;
  previewProgress?: VideoProgress;
  progress?: VideoProgress;
  result?: VideoJobResult & { filename: string; url: string };
  error?: MediaError;
}

let counter = 0;

/** Optional step after a job, e.g. converting an extracted PNG frame to JPEG. */
export type PostProcess = (result: VideoJobResult, signal: AbortSignal) => Promise<VideoJobResult>;

/** True when this browser can decode and show a frame of the video. */
export function testPlayable(url: string, timeoutMs = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.playsInline = true;
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    video.addEventListener('loadeddata', () => finish(video.videoWidth > 0 && video.videoHeight > 0));
    video.addEventListener('error', () => finish(false));
    video.src = url;
  });
}

function revoke(item: VideoItem) {
  if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  if (item.result) URL.revokeObjectURL(item.result.url);
}

export interface UseVideoQueueOptions {
  multiple: boolean;
  operation: string;
  /** Generate a playable proxy automatically when the browser can't play the source (crop/trim/thumbnail/GIF). */
  needsPreview: boolean;
  /** Extra accepted formats (e.g. GIF for Convert). */
  extraAccept?: FormatId[];
}

export function useVideoQueue({ multiple, operation, needsPreview, extraAccept = [] }: UseVideoQueueOptions) {
  const [items, setItems] = useState<VideoItem[]>([]);
  const [notice, setNotice] = useState<MediaError | null>(null);
  const itemsRef = useRef(items);
  useLayoutEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const controllers = useRef(new Map<string, AbortController>());
  const running = useRef(false);

  const patch = useCallback((id: string, update: Partial<VideoItem>) => {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...update } : it)));
  }, []);
  const alive = (id: string) => itemsRef.current.some((it) => it.id === id);

  const generateProxy = useCallback(
    async (item: VideoItem, probe: VideoProbe) => {
      const controller = new AbortController();
      controllers.current.set(`${item.id}:proxy`, controller);
      patch(item.id, { previewState: 'generating' });
      try {
        const blob = await makePreviewProxy(item.file, item.ext, probe, {
          signal: controller.signal,
          onProgress: (previewProgress) => patch(item.id, { previewProgress }),
        });
        if (!alive(item.id)) return;
        const url = URL.createObjectURL(blob);
        setItems((list) =>
          list.map((it) => {
            if (it.id !== item.id) return it;
            if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
            return { ...it, previewUrl: url, previewState: 'proxy', previewProgress: undefined };
          }),
        );
      } catch (error) {
        if (alive(item.id)) patch(item.id, { previewState: 'failed', previewProgress: undefined, warnings: [...item.warnings, `Preview unavailable: ${toMediaError(error).message}`] });
      } finally {
        controllers.current.delete(`${item.id}:proxy`);
      }
    },
    [patch],
  );

  const inspect = useCallback(
    async (item: VideoItem) => {
      const controller = new AbortController();
      controllers.current.set(item.id, controller);
      try {
        const accept = [...acceptedVideoFormats(), ...extraAccept];
        const validated = await validateFile(item.file, { accept, limits: getLimits() });
        const ext = primaryExtension(validated.format);
        const probe = await probeVideo(item.file, ext, { signal: controller.signal });
        if (!probe.video && !probe.audio) throw new MediaError('CORRUPTED_FILE');
        if (!probe.video) throw new MediaError('NO_VIDEO_TRACK');
        const route = routeVideoJob({ sizeBytes: item.file.size, durationSec: probe.durationSec, width: probe.video.width, height: probe.video.height }, getLimits(), detectFeatures());
        const warnings = [...route.warnings];
        if (validated.extensionMismatch) warnings.push('The file extension doesn’t match its contents; it was detected from the data instead.');
        if (probe.video.vfr) warnings.push('This video has a variable frame rate (common for phone recordings). Timestamps are preserved unless you choose a fixed frame rate.');
        if (!alive(item.id)) return;
        const previewUrl = URL.createObjectURL(item.file);
        patch(item.id, { status: 'ready', validated, ext, probe, warnings, previewUrl, previewState: 'testing' });
        const playable = await testPlayable(previewUrl);
        if (!alive(item.id)) return;
        if (playable) patch(item.id, { previewState: 'playable' });
        else {
          patch(item.id, { previewState: 'unplayable' });
          if (needsPreview) void generateProxy({ ...item, ext, warnings }, probe);
        }
      } catch (error) {
        console.error('[video inspect]', error, (error as { cause?: unknown })?.cause);
        if (alive(item.id)) patch(item.id, { status: 'error', error: toMediaError(error, 'CORRUPTED_FILE') });
      } finally {
        controllers.current.delete(item.id);
      }
    },
    [extraAccept, generateProxy, needsPreview, patch],
  );

  const add = useCallback(
    (files: File[]) => {
      setNotice(null);
      let incoming = files;
      if (multiple) {
        const room = getLimits().batchFiles - itemsRef.current.length;
        if (files.length > room) {
          setNotice(new MediaError('TOO_LARGE', `Up to ${getLimits().batchFiles} files can be queued at once.`));
          incoming = files.slice(0, Math.max(0, room));
        }
      } else {
        itemsRef.current.forEach((it) => revoke(it));
        controllers.current.forEach((c) => c.abort());
      }
      const created: VideoItem[] = incoming.map((file) => ({ id: `vid-${++counter}`, file, ext: '', status: 'checking', warnings: [] }));
      const next = multiple ? [...itemsRef.current, ...created] : created;
      itemsRef.current = next;
      setItems(next);
      // Probing uses the shared engine, so inspect files one after another.
      void created.reduce((p, item) => p.then(() => inspect(item)), Promise.resolve());
    },
    [inspect, multiple],
  );

  const remove = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
    controllers.current.get(`${id}:proxy`)?.abort();
    setItems((list) => {
      const item = list.find((it) => it.id === id);
      if (item) revoke(item);
      return list.filter((it) => it.id !== id);
    });
  }, []);

  const clear = useCallback(() => {
    controllers.current.forEach((c) => c.abort());
    itemsRef.current.forEach(revoke);
    itemsRef.current = [];
    setItems([]);
    setNotice(null);
  }, []);

  /** Runs jobs one at a time (spec §B4: sequential by default to limit memory). A failure never stops the rest. */
  const run = useCallback(
    async (buildJob: (item: VideoItem) => VideoJob, engine: EnginePreference = 'auto', ids?: string[], postProcess?: PostProcess) => {
      if (running.current) return;
      running.current = true;
      const taken = new Set<string>();
      const targets = itemsRef.current.filter((it) => it.probe && (!ids || ids.includes(it.id)));
      try {
        for (const target of targets) {
          if (!alive(target.id)) continue;
          // Stop any running proxy encode: the engine processes one job at a time.
          controllers.current.get(`${target.id}:proxy`)?.abort();
          const item = itemsRef.current.find((it) => it.id === target.id)!;
          const controller = new AbortController();
          controllers.current.set(item.id, controller);
          if (item.result) URL.revokeObjectURL(item.result.url);
          patch(item.id, { status: 'processing', error: undefined, result: undefined, progress: { stage: 'processing', fraction: null } });
          try {
            const job = buildJob(item);
            let result = await runVideoJob(item.file, item.ext, item.probe!, job, { signal: controller.signal, engine, onProgress: (progress) => patch(item.id, { progress }) });
            if (postProcess) result = await postProcess(result, controller.signal);
            const filename = dedupeFilename(outputFilename(item.file.name, operation, result.filenameExt), taken);
            if (alive(item.id)) patch(item.id, { status: 'done', progress: undefined, result: { ...result, filename, url: URL.createObjectURL(result.blob) } });
          } catch (error) {
            // The cause goes to the console for debugging; users only see the mapped, friendly message.
            console.error('[video job]', error, (error as { cause?: unknown })?.cause);
            if (alive(item.id)) patch(item.id, { status: 'error', progress: undefined, error: toMediaError(error) });
          } finally {
            controllers.current.delete(item.id);
          }
        }
      } finally {
        running.current = false;
      }
    },
    [operation, patch],
  );

  const cancel = useCallback((id?: string) => {
    if (id) controllers.current.get(id)?.abort();
    else controllers.current.forEach((c) => c.abort());
  }, []);

  const discardResult = useCallback((id: string) => {
    setItems((list) =>
      list.map((it) => {
        if (it.id !== id || !it.result) return it;
        URL.revokeObjectURL(it.result.url);
        return { ...it, status: 'ready', result: undefined, error: undefined };
      }),
    );
  }, []);

  const ensurePreview = useCallback(
    (id: string) => {
      const item = itemsRef.current.find((it) => it.id === id);
      if (item?.probe && (item.previewState === 'unplayable' || item.previewState === 'failed')) void generateProxy(item, item.probe);
    },
    [generateProxy],
  );

  useEffect(
    () => () => {
      controllers.current.forEach((c) => c.abort());
      itemsRef.current.forEach(revoke);
    },
    [],
  );

  return { items, add, remove, clear, run, cancel, discardResult, ensurePreview, notice };
}
