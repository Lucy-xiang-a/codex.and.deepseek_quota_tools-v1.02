import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { QuotaSnapshot, WidgetSettings } from '../shared/types';

const defaults: WidgetSettings = {
  launchAtStartup: false,
  compact: true,
  refreshIntervalSec: 60,
  theme: 'system',
  pinMode: 'off',
};

export class LocalState {
  private readonly filePath: string;
  private settings: WidgetSettings = structuredClone(defaults);
  private snapshot: QuotaSnapshot | null = null;

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, 'state.json');
  }

  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(this.filePath, 'utf8')) as { settings?: Record<string, unknown>; snapshot?: QuotaSnapshot };
      const saved = raw.settings ?? {};
      this.settings = {
        launchAtStartup: saved.launchAtStartup === true,
        compact: saved.compact !== false,
        refreshIntervalSec: typeof saved.refreshIntervalSec === 'number' ? saved.refreshIntervalSec : defaults.refreshIntervalSec,
        theme: saved.theme === 'light' || saved.theme === 'dark' || saved.theme === 'system' ? saved.theme : defaults.theme,
        pinMode: saved.pinMode === 'always' ? 'always' : 'off',
      };
      this.snapshot = raw.snapshot ?? null;
    } catch {
      this.settings = structuredClone(defaults);
      this.snapshot = null;
    }
  }

  getSettings(): WidgetSettings { return structuredClone(this.settings); }
  getSnapshot(): QuotaSnapshot | null { return this.snapshot ? structuredClone(this.snapshot) : null; }

  async updateSettings(patch: Partial<WidgetSettings>): Promise<WidgetSettings> {
    this.settings = { ...this.settings, ...patch };
    await this.save();
    return this.getSettings();
  }

  async saveSnapshot(snapshot: QuotaSnapshot): Promise<void> {
    this.snapshot = snapshot;
    await this.save();
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify({ settings: this.settings, snapshot: this.snapshot }, null, 2), 'utf8');
  }
}

export { defaults as defaultSettings };
