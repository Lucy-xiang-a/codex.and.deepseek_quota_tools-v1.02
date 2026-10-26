import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { QuotaSnapshot, QuotaSource, ThemeMode, WidgetSettings } from '../shared/types';

const defaults: WidgetSettings = {
  launchAtStartup: false,
  compact: true,
  refreshIntervalSec: 60,
  theme: 'system',
  pinMode: 'off',
  compactScale: 1,
  quotaSource: 'codex',
  deepseekApiKeySet: false,
};

export class LocalState {
  private readonly filePath: string;
  private settings: WidgetSettings = structuredClone(defaults);
  private snapshot: QuotaSnapshot | null = null;
  private deepSeekApiKey: string | null = null;

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, 'state.json');
  }

  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(this.filePath, 'utf8')) as {
        settings?: Record<string, unknown>;
        snapshot?: QuotaSnapshot;
        deepseekApiKey?: unknown;
      };
      const saved = raw.settings ?? {};
      const deepseekApiKey = typeof raw.deepseekApiKey === 'string' && raw.deepseekApiKey.trim() ? raw.deepseekApiKey.trim() : null;
      this.settings = {
        launchAtStartup: saved.launchAtStartup === true,
        compact: saved.compact !== false,
        refreshIntervalSec: typeof saved.refreshIntervalSec === 'number' ? saved.refreshIntervalSec : defaults.refreshIntervalSec,
        theme: saved.theme === 'light' || saved.theme === 'dark' || saved.theme === 'system' ? saved.theme : defaults.theme,
        pinMode: saved.pinMode === 'always' ? 'always' : 'off',
        compactScale: typeof saved.compactScale === 'number' ? clampScale(saved.compactScale) : defaults.compactScale,
        quotaSource: saved.quotaSource === 'deepseek' || saved.quotaSource === 'both' ? saved.quotaSource : defaults.quotaSource,
        deepseekApiKeySet: Boolean(deepseekApiKey),
      };
      this.deepSeekApiKey = deepseekApiKey;
      this.snapshot = raw.snapshot ? normalizeSnapshot(raw.snapshot) : null;
    } catch {
      this.settings = structuredClone(defaults);
      this.snapshot = null;
      this.deepSeekApiKey = null;
    }
  }

  getSettings(): WidgetSettings { return structuredClone(this.settings); }
  getSnapshot(): QuotaSnapshot | null { return this.snapshot ? structuredClone(this.snapshot) : null; }
  getDeepSeekApiKey(): string | null { return this.deepSeekApiKey; }

  async updateSettings(patch: Partial<WidgetSettings>): Promise<WidgetSettings> {
    const nextSource = patch.quotaSource === 'deepseek' || patch.quotaSource === 'both' || patch.quotaSource === 'codex'
      ? patch.quotaSource
      : this.settings.quotaSource;
    const nextTheme: ThemeMode = patch.theme === 'light' || patch.theme === 'dark' || patch.theme === 'system'
      ? patch.theme
      : this.settings.theme;
    this.settings = {
      ...this.settings,
      ...patch,
      launchAtStartup: patch.launchAtStartup ?? this.settings.launchAtStartup,
      compact: patch.compact ?? this.settings.compact,
      refreshIntervalSec: typeof patch.refreshIntervalSec === 'number' ? Math.max(5, Math.min(3600, Math.round(patch.refreshIntervalSec))) : this.settings.refreshIntervalSec,
      theme: nextTheme,
      pinMode: patch.pinMode === 'always' ? 'always' : patch.pinMode === 'off' ? 'off' : this.settings.pinMode,
      compactScale: typeof patch.compactScale === 'number' ? clampScale(patch.compactScale) : this.settings.compactScale,
      quotaSource: nextSource,
      deepseekApiKeySet: Boolean(this.deepSeekApiKey),
    };
    await this.save();
    return this.getSettings();
  }

  async setDeepSeekApiKey(value: string): Promise<boolean> {
    this.deepSeekApiKey = value.trim() || null;
    this.settings.deepseekApiKeySet = Boolean(this.deepSeekApiKey);
    await this.save();
    return this.settings.deepseekApiKeySet;
  }

  async clearDeepSeekApiKey(): Promise<void> {
    this.deepSeekApiKey = null;
    this.settings.deepseekApiKeySet = false;
    await this.save();
  }

  async saveSnapshot(snapshot: QuotaSnapshot): Promise<void> {
    this.snapshot = snapshot;
    await this.save();
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify({ settings: this.settings, deepseekApiKey: this.deepSeekApiKey, snapshot: this.snapshot }, null, 2), 'utf8');
  }
}

export { defaults as defaultSettings };

export const COMPACT_MIN_SCALE = 0.75;
export const COMPACT_MAX_SCALE = 1.75;

export function clampScale(value: number): number {
  if (!Number.isFinite(value)) return defaults.compactScale;
  return Math.max(COMPACT_MIN_SCALE, Math.min(COMPACT_MAX_SCALE, Math.round(value * 100) / 100));
}

function normalizeSnapshot(snapshot: QuotaSnapshot): QuotaSnapshot {
  return {
    ...snapshot,
    deepseek: snapshot.deepseek ?? null,
  };
}
