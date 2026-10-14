// Decides where a job runs (spec §6.1). All thresholds live here and in limits.ts.
import { MediaError } from './errors';
import type { BrowserFeatures } from './features';
import type { Limits } from './limits';
import { formatBytes, formatDuration } from './sizes';

export const SERVER_PROCESSING_ENABLED = import.meta.env?.VITE_ENABLE_SERVER_PROCESSING === 'true';

export interface VideoJobFacts {
  sizeBytes: number;
  durationSec: number | null;
  width: number | null;
  height: number | null;
}

export interface RouteDecision {
  target: 'client' | 'server';
  warnings: string[];
}

/** Checks whether a video can be processed in this browser. Throws a MediaError when it cannot. */
export function routeVideoJob(facts: VideoJobFacts, limits: Limits, features: BrowserFeatures, serverEnabled = SERVER_PROCESSING_ENABLED): RouteDecision {
  const warnings: string[] = [];
  const problems: MediaError[] = [];

  if (facts.sizeBytes > limits.videoBytes) {
    problems.push(new MediaError('TOO_LARGE', `Videos up to ${formatBytes(limits.videoBytes)} can be processed in this browser.`));
  }
  if (facts.durationSec !== null && facts.durationSec > limits.videoSeconds) {
    problems.push(
      new MediaError('TOO_LONG', `Videos up to ${formatDuration(limits.videoSeconds)} can be processed in this browser (this one is ${formatDuration(facts.durationSec)}).`),
    );
  }
  const edge = Math.max(facts.width ?? 0, facts.height ?? 0);
  if (edge > limits.videoMaxEdge) {
    problems.push(new MediaError('TOO_LARGE', `Videos up to ${limits.videoMaxEdge}px on the longest side can be processed on this device (this one is ${edge}px).`));
  }

  if (problems.length > 0) {
    if (serverEnabled) return { target: 'server', warnings: problems.map((p) => p.message) };
    throw problems[0]!;
  }

  if (!features.webAssembly || !features.workers) {
    throw new MediaError('CODEC_UNAVAILABLE', 'This browser does not support WebAssembly workers, which video processing needs.');
  }
  if (features.deviceMemoryGb !== null && features.deviceMemoryGb <= 2 && facts.sizeBytes > 100_000_000) {
    warnings.push('This device has little memory. Large videos may fail; close other tabs first.');
  }
  return { target: 'client', warnings };
}
