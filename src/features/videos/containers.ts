import { canRemux } from '@/lib/video-processing/args';
import type { RemuxJob, VideoProbe } from '@/lib/video-processing/types';
import type { VideoItem } from './useVideoQueue';

/** Container for a stream copy (fast trim, remove audio): keeps the source container when the codecs allow it. */
export function remuxContainer(item: VideoItem, probe: VideoProbe, removeAudio = false): RemuxJob['container'] | null {
  const source = item.validated?.format;
  const preferred: RemuxJob['container'][] = source === 'mov' ? ['mov', 'mp4', 'mkv'] : source === 'webm' ? ['webm', 'mkv'] : source === 'mkv' ? ['mkv'] : ['mp4', 'mkv'];
  return preferred.find((c) => canRemux(probe, c, removeAudio)) ?? null;
}
