export type ConnectionState = 'connected' | 'refreshing' | 'stale' | 'unauthenticated' | 'cli_missing' | 'error';
export type ViewMode = 'compact' | 'expanded' | 'settings';
export type ThemeMode = 'light' | 'dark' | 'system';
export type PinMode = 'off' | 'always';
export type QuotaSource = 'codex' | 'deepseek' | 'both';
export type DeepSeekState = 'connected' | 'missing_key' | 'unavailable' | 'error';

export interface QuotaWindow {
  label: string;
  remainingPercent: number | null;
  usedPercent: number | null;
  windowDurationMins: number | null;
  resetsAt: number | null;
}

export interface DeepSeekBalance {
  isAvailable: boolean | null;
  currency: string;
  totalBalance: number | null;
  grantedBalance: number | null;
  toppedUpBalance: number | null;
  updatedAt: number | null;
  state: DeepSeekState;
  error?: string;
}

export interface QuotaSnapshot {
  accountEmail: string | null;
  planType: string | null;
  primary: QuotaWindow | null;
  secondary: QuotaWindow | null;
  availableResets: number | null;
  updatedAt: number | null;
  source: 'app-server' | 'cache' | 'none';
  state: ConnectionState;
  deepseek: DeepSeekBalance | null;
  error?: string;
}

export interface WidgetSettings {
  launchAtStartup: boolean;
  compact: boolean;
  refreshIntervalSec: number;
  theme: ThemeMode;
  pinMode: PinMode;
  compactScale: number;
  quotaSource: QuotaSource;
  deepseekApiKeySet: boolean;
}

export interface WidgetApi {
  getSnapshot(): Promise<QuotaSnapshot>;
  refresh(): Promise<QuotaSnapshot>;
  getSettings(): Promise<WidgetSettings>;
  updateSettings(patch: Partial<WidgetSettings>): Promise<WidgetSettings>;
  setView(mode: ViewMode): Promise<void>;
  minimize(): Promise<void>;
  hide(): Promise<void>;
  quit(): Promise<void>;
  resizeCompact(width: number, persist?: boolean): Promise<{ width: number; height: number; scale: number }>;
  getDeepSeekKeyStatus(): Promise<boolean>;
  setDeepSeekApiKey(key: string): Promise<boolean>;
  clearDeepSeekApiKey(): Promise<void>;
  onSnapshot(callback: (snapshot: QuotaSnapshot) => void): () => void;
  onSettings(callback: (settings: WidgetSettings) => void): () => void;
  onViewRequest(callback: (mode: ViewMode) => void): () => void;
}
