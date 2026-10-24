export type ConnectionState = 'connected' | 'refreshing' | 'stale' | 'unauthenticated' | 'cli_missing' | 'error';
export type ViewMode = 'compact' | 'expanded' | 'settings';
export type ThemeMode = 'light' | 'dark' | 'system';
export type PinMode = 'off' | 'always';

export interface QuotaWindow {
  label: string;
  remainingPercent: number | null;
  usedPercent: number | null;
  windowDurationMins: number | null;
  resetsAt: number | null;
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
  error?: string;
}

export interface WidgetSettings {
  launchAtStartup: boolean;
  compact: boolean;
  refreshIntervalSec: number;
  theme: ThemeMode;
  pinMode: PinMode;
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
  onSnapshot(callback: (snapshot: QuotaSnapshot) => void): () => void;
  onSettings(callback: (settings: WidgetSettings) => void): () => void;
  onViewRequest(callback: (mode: ViewMode) => void): () => void;
}
