import { toolById } from '@/features/tools';
import { DEFAULT_VIDEO_ENCODE, buildEncodeJob } from '../VideoFields';
import { VideoToolShell } from '../VideoToolShell';
import { remuxContainer } from '../containers';
import type { VideoItem } from '../useVideoQueue';
import type { VideoJob } from '@/lib/video-processing/types';

/** Stream-copies the video without its audio; falls back to an MP4 re-encode only if the codec can't be copied. */
function buildJob(item: VideoItem): VideoJob {
  const container = remuxContainer(item, item.probe!, true);
  if (container) return { type: 'remux', container, removeAudio: true };
  return buildEncodeJob({ ...DEFAULT_VIDEO_ENCODE, removeAudio: true }, {});
}

export default function RemoveAudioPage() {
  return (
    <VideoToolShell
      tool={toolById('video-remove-audio')!}
      operation="muted"
      multiple
      actionLabel="Remove audio"
      itemError={(item) => (item.probe && !item.probe.audio ? 'This video is already silent.' : null)}
      buildJob={buildJob}
      settings={(item) => (
        <p className="text-sm text-muted">
          {item?.probe && !remuxContainer(item, item.probe, true)
            ? 'This video’s codec can’t be copied directly, so it will be re-encoded to MP4 (H.264).'
            : 'The video stream is copied unchanged, so there is no quality loss and it finishes in seconds.'}
        </p>
      )}
    />
  );
}
