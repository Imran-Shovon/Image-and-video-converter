// Target-size bitrate maths (spec §B2): video kbps = target bits / duration − audio kbps, minus container overhead.

export const CONTAINER_OVERHEAD = 0.04;

export interface BitratePlan {
  videoKbps: number;
  audioKbps: number;
  /** True when the required bitrate is too low for the output resolution to look acceptable. */
  tooLow: boolean;
  /** Suggested longest edge when `tooLow` is set. */
  suggestedMaxEdge: number | null;
}

/** Rough minimum H.264 bitrate (kbps) for watchable quality at a resolution, scaled by pixel count. */
export function minimumKbps(width: number, height: number): number {
  return Math.max(80, (width * height * 30 * 0.04) / 1000);
}

const EDGES = [3840, 2560, 1920, 1280, 854, 640, 426];

export function planTargetBitrate(targetBytes: number, durationSec: number, audioKbps: number, width: number, height: number): BitratePlan {
  const totalKbps = (targetBytes * 8 * (1 - CONTAINER_OVERHEAD)) / durationSec / 1000;
  const videoKbps = Math.floor(totalKbps - audioKbps);
  const min = minimumKbps(width, height);
  const tooLow = videoKbps < min;
  let suggestedMaxEdge: number | null = null;
  if (tooLow) {
    const aspect = width / height;
    for (const edge of EDGES) {
      const w = aspect >= 1 ? edge : edge * aspect;
      const h = aspect >= 1 ? edge / aspect : edge;
      if (edge < Math.max(width, height) && videoKbps >= minimumKbps(w, h)) {
        suggestedMaxEdge = edge;
        break;
      }
    }
  }
  return { videoKbps: Math.max(0, videoKbps), audioKbps, tooLow, suggestedMaxEdge };
}

/** Estimated output size in bytes for a bitrate-controlled encode. */
export function estimateBytes(videoKbps: number, audioKbps: number, durationSec: number): number {
  return Math.round((((videoKbps + audioKbps) * 1000) / 8) * durationSec * (1 + CONTAINER_OVERHEAD));
}
