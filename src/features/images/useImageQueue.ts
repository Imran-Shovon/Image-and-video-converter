// State for image tools: validation → probe → preview → (batch) processing with per-file status,
// cancellation and retry (spec §A4, §10). Object URLs are revoked when items go away.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { imageEngine } from '@/lib/image-processing/engine';
import type { ImageJobInput, ImageJobResult, ImageProbe, ImageProgress } from '@/lib/image-processing/types';
import { acceptedImageFormats } from '@/lib/media/capabilities';
import { MediaError, toMediaError } from '@/lib/media/errors';
import { NO_OFFSCREEN_CANVAS } from '@/lib/media/features';
import { dedupeFilename, outputFilename } from '@/lib/media/filenames';
import { primaryExtension } from '@/lib/media/formats';
import { getLimits } from '@/lib/media/limits';
import { validateFile, type ValidatedFile } from '@/lib/media/validate';

export type ItemStatus = 'checking' | 'ready' | 'processing' | 'done' | 'error';

/** Builds the job for an item. May do async preparation first (e.g. background segmentation). */
export type BuildJob = (item: ImageItem, ctx: { signal: AbortSignal; onProgress: (p: ImageProgress) => void }) => ImageJobInput | Promise<ImageJobInput>;

export interface ImagePreview {
  url: string;
  width: number;
  height: number;
}

export interface ImageItem {
  id: string;
  file: File;
  status: ItemStatus;
  validated?: ValidatedFile;
  probe?: ImageProbe;
  /** Downscaled, correctly oriented preview (always displayable). */
  preview?: ImagePreview;
  /** Full-resolution original for 100% comparison when the browser can display it. */
  originalUrl?: string;
  progress?: ImageProgress;
  result?: ImageJobResult & { filename: string; url: string };
  error?: MediaError;
}

const DISPLAYABLE = new Set(['jpeg', 'png', 'webp', 'gif', 'bmp', 'avif']);
let counter = 0;

function revoke(item: ImageItem) {
  if (item.preview) URL.revokeObjectURL(item.preview.url);
  if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
  if (item.result) URL.revokeObjectURL(item.result.url);
}

export function useImageQueue({ multiple, operation }: { multiple: boolean; operation: string }) {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [notice, setNotice] = useState<MediaError | null>(null);
  const itemsRef = useRef(items);
  useLayoutEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const controllers = useRef(new Map<string, AbortController>());

  const patch = useCallback((id: string, update: Partial<ImageItem> | ((item: ImageItem) => Partial<ImageItem>)) => {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...(typeof update === 'function' ? update(it) : update) } : it)));
  }, []);

  const inspect = useCallback(
    async (item: ImageItem) => {
      const controller = new AbortController();
      controllers.current.set(item.id, controller);
      try {
        const validated = await validateFile(item.file, { accept: acceptedImageFormats(), limits: getLimits() });
        if (typeof OffscreenCanvas === 'undefined') throw new MediaError('CODEC_UNAVAILABLE', NO_OFFSCREEN_CANVAS);
        const { probe, preview } = await imageEngine.inspect(item.file, 1600, controller.signal);
        const previewUrl = URL.createObjectURL(preview.blob);
        const originalUrl = DISPLAYABLE.has(probe.format) ? URL.createObjectURL(item.file) : undefined;
        if (!itemsRef.current.some((it) => it.id === item.id)) {
          URL.revokeObjectURL(previewUrl);
          if (originalUrl) URL.revokeObjectURL(originalUrl);
          return;
        }
        patch(item.id, { status: 'ready', validated, probe, preview: { url: previewUrl, width: preview.width, height: preview.height }, originalUrl });
      } catch (error) {
        patch(item.id, { status: 'error', error: toMediaError(error, 'CORRUPTED_FILE') });
      } finally {
        controllers.current.delete(item.id);
      }
    },
    [patch],
  );

  const add = useCallback(
    (files: File[]) => {
      setNotice(null);
      const limit = getLimits().batchFiles;
      let incoming = files;
      if (multiple) {
        const room = limit - itemsRef.current.length;
        if (files.length > room) {
          setNotice(new MediaError('TOO_LARGE', `Up to ${limit} files can be processed at once. ${Math.max(0, room)} more can be added.`));
          incoming = files.slice(0, Math.max(0, room));
        }
      } else {
        itemsRef.current.forEach((it) => {
          controllers.current.get(it.id)?.abort();
          revoke(it);
        });
      }
      const created: ImageItem[] = incoming.map((file) => ({ id: `img-${++counter}`, file, status: 'checking' }));
      setItems((list) => (multiple ? [...list, ...created] : created));
      itemsRef.current = multiple ? [...itemsRef.current, ...created] : created;
      created.forEach((item) => void inspect(item));
    },
    [inspect, multiple],
  );

  const remove = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
    setItems((list) => {
      const item = list.find((it) => it.id === id);
      if (item) revoke(item);
      return list.filter((it) => it.id !== id);
    });
  }, []);

  const clear = useCallback(() => {
    controllers.current.forEach((c) => c.abort());
    itemsRef.current.forEach(revoke);
    setItems([]);
    setNotice(null);
  }, []);

  const runItem = useCallback(
    async (item: ImageItem, buildJob: BuildJob, taken: Set<string>) => {
      const controller = new AbortController();
      controllers.current.set(item.id, controller);
      if (item.result) URL.revokeObjectURL(item.result.url);
      patch(item.id, { status: 'processing', error: undefined, result: undefined, progress: { stage: 'decode', fraction: null } });
      try {
        const onProgress = (progress: ImageProgress) => patch(item.id, { progress });
        const job = await buildJob(item, { signal: controller.signal, onProgress });
        if (controller.signal.aborted) throw new MediaError('CANCELLED');
        const result = await imageEngine.process(job, { signal: controller.signal, onProgress });
        const filename = dedupeFilename(outputFilename(item.file.name, operation, primaryExtension(result.format)), taken);
        patch(item.id, { status: 'done', progress: undefined, result: { ...result, filename, url: URL.createObjectURL(result.blob) } });
      } catch (error) {
        console.error('[image job]', error);
        patch(item.id, { status: 'error', progress: undefined, error: toMediaError(error) });
      } finally {
        controllers.current.delete(item.id);
      }
    },
    [operation, patch],
  );

  /** Processes the given items (default: every valid item). A failed item never stops the rest. */
  const run = useCallback(
    async (buildJob: BuildJob, ids?: string[]) => {
      const targets = itemsRef.current.filter((it) => it.probe && (!ids || ids.includes(it.id)));
      const taken = new Set<string>(itemsRef.current.filter((it) => it.result && !targets.includes(it)).map((it) => it.result!.filename.toLowerCase()));
      // The engine limits concurrency to its worker pool size.
      await Promise.all(targets.map((item) => runItem(item, buildJob, taken)));
    },
    [runItem],
  );

  const retryFailed = useCallback(
    (buildJob: BuildJob) => run(buildJob, itemsRef.current.filter((it) => it.status === 'error' && it.probe).map((it) => it.id)),
    [run],
  );

  /** Discards a result and returns the item to the editable state (keeps the file and settings). */
  const discardResult = useCallback((id: string) => {
    setItems((list) =>
      list.map((it) => {
        if (it.id !== id || !it.result) return it;
        URL.revokeObjectURL(it.result.url);
        return { ...it, status: 'ready', result: undefined, error: undefined };
      }),
    );
  }, []);

  const cancel = useCallback((id?: string) => {
    if (id) controllers.current.get(id)?.abort();
    else controllers.current.forEach((c) => c.abort());
  }, []);

  useEffect(
    () => () => {
      controllers.current.forEach((c) => c.abort());
      itemsRef.current.forEach(revoke);
    },
    [],
  );

  const busy = items.some((it) => it.status === 'processing' || it.status === 'checking');
  return { items, add, remove, clear, run, retryFailed, cancel, discardResult, busy, notice, setNotice };
}
