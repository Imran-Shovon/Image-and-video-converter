// Processing limits (spec §9). Every value can be overridden with a VITE_LIMIT_* environment variable.
import { MB } from './sizes';

export type DeviceProfile = 'desktop' | 'mobile';

export interface Limits {
  imageBytes: number;
  imagePixels: number;
  videoBytes: number;
  videoSeconds: number;
  /** Longest edge in pixels (4K = 3840, 1080p = 1920). */
  videoMaxEdge: number;
  gifSeconds: number;
  batchFiles: number;
  zipBytes: number;
  concurrentImageJobs: number;
}

const DEFAULTS: Record<DeviceProfile, Limits> = {
  desktop: {
    imageBytes: 50 * MB,
    imagePixels: 100_000_000,
    videoBytes: 500 * MB,
    videoSeconds: 10 * 60,
    videoMaxEdge: 3840,
    gifSeconds: 30,
    batchFiles: 50,
    zipBytes: 1000 * MB,
    concurrentImageJobs: 3,
  },
  mobile: {
    imageBytes: 25 * MB,
    imagePixels: 16_777_216,
    videoBytes: 200 * MB,
    videoSeconds: 3 * 60,
    videoMaxEdge: 1920,
    gifSeconds: 15,
    batchFiles: 20,
    zipBytes: 300 * MB,
    concurrentImageJobs: 1,
  },
};

type Env = Record<string, string | boolean | undefined>;

function envNumber(env: Env, key: string): number | undefined {
  const raw = env[key];
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

const ENV_KEYS: Record<keyof Limits, string> = {
  imageBytes: 'IMAGE_MB',
  imagePixels: 'IMAGE_MEGAPIXELS',
  videoBytes: 'VIDEO_MB',
  videoSeconds: 'VIDEO_SECONDS',
  videoMaxEdge: 'VIDEO_MAX_EDGE',
  gifSeconds: 'GIF_SECONDS',
  batchFiles: 'BATCH_FILES',
  zipBytes: 'ZIP_MB',
  concurrentImageJobs: 'CONCURRENT_IMAGE_JOBS',
};

const ENV_SCALE: Partial<Record<keyof Limits, number>> = {
  imageBytes: MB,
  videoBytes: MB,
  zipBytes: MB,
  imagePixels: 1_000_000,
};

export function resolveLimits(profile: DeviceProfile, env: Env = {}): Limits {
  const base = { ...DEFAULTS[profile] };
  const prefix = `VITE_LIMIT_${profile.toUpperCase()}_`;
  for (const key of Object.keys(ENV_KEYS) as (keyof Limits)[]) {
    const value = envNumber(env, prefix + ENV_KEYS[key]);
    if (value !== undefined) base[key] = Math.round(value * (ENV_SCALE[key] ?? 1));
  }
  return base;
}

/**
 * Classifies the device by input capability and memory, not by user-agent string.
 * Touch-primary devices with small screens or ≤4 GB memory get the mobile limits.
 */
export function detectDeviceProfile(): DeviceProfile {
  if (typeof window === 'undefined') return 'desktop';
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const small = Math.min(window.screen?.width ?? 1920, window.screen?.height ?? 1080) < 768;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (coarse && (small || (memory !== undefined && memory <= 4))) return 'mobile';
  return 'desktop';
}

let cached: Limits | null = null;

export function getLimits(): Limits {
  cached ??= resolveLimits(detectDeviceProfile(), import.meta.env as Env);
  return cached;
}
