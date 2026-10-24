import type { QuotaSnapshot, QuotaWindow } from '../shared/types';

type RawWindow = {
  usedPercent?: number;
  windowDurationMins?: number | null;
  resetsAt?: number | null;
};

type RawRateLimit = {
  primary?: RawWindow | null;
  secondary?: RawWindow | null;
  limitId?: string | null;
};

export type RateLimitResponse = {
  rateLimits?: RawRateLimit | null;
  rateLimitsByLimitId?: Record<string, RawRateLimit> | null;
  rateLimitResetCredits?: { availableCount?: number } | null;
};

export type AccountResponse = {
  account?: { type?: string; email?: string | null; planType?: string | null } | null;
  requiresOpenaiAuth?: boolean;
};

export function clampPercent(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(100 - value)));
}

export function labelForDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return '额度';
  if (minutes === 300) return '5小时';
  if (minutes === 10080) return '1周';
  if (minutes >= 1440 && minutes % 1440 === 0) return `${minutes / 1440}天`;
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60}小时`;
  return `${minutes}分钟`;
}

function toWindow(raw: RawWindow | null | undefined): QuotaWindow | null {
  if (!raw) return null;
  return {
    label: labelForDuration(raw.windowDurationMins),
    remainingPercent: clampPercent(raw.usedPercent),
    usedPercent: typeof raw.usedPercent === 'number' ? Math.max(0, Math.min(100, Math.round(raw.usedPercent))) : null,
    windowDurationMins: raw.windowDurationMins ?? null,
    resetsAt: raw.resetsAt ?? null,
  };
}

export function mapRateLimitResponse(
  account: AccountResponse,
  response: RateLimitResponse,
  previous?: QuotaSnapshot,
): QuotaSnapshot {
  const bucket = response.rateLimitsByLimitId?.codex ?? response.rateLimits ?? null;
  const primary = toWindow(bucket?.primary);
  const secondary = toWindow(bucket?.secondary);
  const available = response.rateLimitResetCredits?.availableCount;
  return {
    accountEmail: account.account?.email ?? previous?.accountEmail ?? null,
    planType: account.account?.planType ?? previous?.planType ?? null,
    primary,
    secondary,
    availableResets: typeof available === 'number' ? available : previous?.availableResets ?? null,
    updatedAt: Date.now(),
    source: 'app-server',
    state: 'connected',
  };
}

export function mergeRateLimitUpdate(previous: QuotaSnapshot, update: RateLimitResponse): QuotaSnapshot {
  const bucket = update.rateLimitsByLimitId?.codex ?? update.rateLimits ?? null;
  if (!bucket) return previous;
  const nextPrimary = bucket.primary === undefined ? previous.primary : toWindow(bucket.primary);
  const nextSecondary = bucket.secondary === undefined ? previous.secondary : toWindow(bucket.secondary);
  return {
    ...previous,
    primary: nextPrimary,
    secondary: nextSecondary,
    availableResets: typeof update.rateLimitResetCredits?.availableCount === 'number'
      ? update.rateLimitResetCredits.availableCount
      : previous.availableResets,
    updatedAt: Date.now(),
    source: 'app-server',
    state: 'connected',
    error: undefined,
  };
}

export function formatCountdown(resetsAt: number | null, now = Date.now()): string {
  if (!resetsAt) return '重置时间未知';
  const seconds = Math.max(0, Math.floor(resetsAt - now / 1000));
  if (seconds <= 0) return '即将重置';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}小时${minutes}分后重置`;
  return `${Math.max(1, minutes)}分后重置`;
}

export function staleSnapshot(previous: QuotaSnapshot | null, state: QuotaSnapshot['state'], error: string): QuotaSnapshot {
  return {
    accountEmail: previous?.accountEmail ?? null,
    planType: previous?.planType ?? null,
    primary: previous?.primary ?? null,
    secondary: previous?.secondary ?? null,
    availableResets: previous?.availableResets ?? null,
    updatedAt: previous?.updatedAt ?? null,
    source: previous ? 'cache' : 'none',
    state,
    error,
  };
}
