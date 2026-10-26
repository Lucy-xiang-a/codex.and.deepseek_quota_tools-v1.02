import { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { LocalState } from './main/settings';
import { CodexClient } from './main/codex-client';
import { DeepSeekClient } from './main/deepseek-client';
import { clampScale } from './main/settings';
import type { PinMode, QuotaSnapshot, ViewMode, WidgetSettings } from './shared/types';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let viewMode: ViewMode = 'compact';
let settings: WidgetSettings;
let state: LocalState;
let client: CodexClient;
let deepSeekClient: DeepSeekClient;
let latestSnapshot: QuotaSnapshot | null = null;

const COMPACT_BASE_WIDTH = 360;
const COMPACT_BASE_HEIGHT = 88;
const COMPACT_MIN_WIDTH = 280;
const COMPACT_MAX_WIDTH = 640;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

if (gotLock) {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.whenReady().then(async () => {
    state = new LocalState(app.getPath('userData'));
    await state.load();
    settings = state.getSettings();
    viewMode = settings.compact ? 'compact' : 'expanded';
    createWindow();
    createTray();
    applyStartupSetting();
    latestSnapshot = state.getSnapshot();
    client = new CodexClient(latestSnapshot, settings.refreshIntervalSec * 1000);
    deepSeekClient = new DeepSeekClient(state.getDeepSeekApiKey(), latestSnapshot?.deepseek ?? null, settings.refreshIntervalSec * 1000);
    client.on('snapshot', (snapshot) => publishSnapshot(snapshot));
    deepSeekClient.on('balance', (balance) => publishSnapshot({ ...(latestSnapshot ?? client.getSnapshot()), deepseek: balance }));
    await Promise.all([client.start(), deepSeekClient.start()]);
    publishSnapshot(client.getSnapshot());
  });
  app.on('before-quit', () => { isQuitting = true; client?.stop(); deepSeekClient?.stop(); });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: COMPACT_BASE_WIDTH,
    height: COMPACT_BASE_HEIGHT,
    minWidth: COMPACT_MIN_WIDTH,
    minHeight: 68,
    maxWidth: COMPACT_MAX_WIDTH,
    maxHeight: 520,
    frame: false,
    transparent: true,
    resizable: false,
    icon: iconPath(),
    show: false,
    skipTaskbar: false,
    webPreferences: { preload: join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => { mainWindow?.show(); applyWindowSize(); });
  mainWindow.on('close', (event) => { if (!isQuitting) { event.preventDefault(); mainWindow?.hide(); } });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { void shell.openExternal(url); return { action: 'deny' }; });
}

function createTray(): void {
  const trayPath = app.isPackaged ? join(process.resourcesPath, 'tray.png') : join(app.getAppPath(), 'assets', 'tray.png');
  const trayIcon = nativeImage.createFromPath(trayPath);
  const trayHiDpiPath = app.isPackaged ? join(process.resourcesPath, 'tray@2x.png') : join(app.getAppPath(), 'assets', 'tray@2x.png');
  const trayHiDpi = nativeImage.createFromPath(trayHiDpiPath);
  if (!trayHiDpi.isEmpty()) trayIcon.addRepresentation({ scaleFactor: 2, buffer: trayHiDpi.toPNG() });
  tray = new Tray(trayIcon);
  tray.setToolTip('Codex 额度');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示额度', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: '刷新额度', click: () => void client?.refresh() },
    { label: '偏好设置', click: () => { mainWindow?.show(); mainWindow?.webContents.send('view:request', 'settings'); } },
    { type: 'separator' },
    { label: '退出组件', click: () => app.quit() },
  ]));
  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) { mainWindow.restore(); mainWindow.show(); mainWindow.focus(); return; }
    if (mainWindow.isVisible()) mainWindow.hide(); else { mainWindow.show(); mainWindow.focus(); }
  });
}

function iconPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'icon.ico') : join(app.getAppPath(), 'build', 'icon.ico');
}

function publishSnapshot(snapshot: QuotaSnapshot): void {
  latestSnapshot = { ...snapshot, deepseek: snapshot.deepseek ?? deepSeekClient?.getBalance() ?? null };
  void state?.saveSnapshot(latestSnapshot);
  mainWindow?.webContents.send('quota:update', latestSnapshot);
}

function applyStartupSetting(): void {
  app.setLoginItemSettings({ openAtLogin: settings.launchAtStartup, args: ['--autostart'] });
}

function applyWindowSize(): void {
  if (!mainWindow) return;
  const compact = viewMode === 'compact';
  const settingsView = viewMode === 'settings';
  mainWindow.setResizable(compact);
  const scale = clampScale(settings?.compactScale ?? 1);
  const nextSize: [number, number] = compact
    ? [Math.round(COMPACT_BASE_WIDTH * scale), Math.round(COMPACT_BASE_HEIGHT * scale)]
    : [360, settingsView ? 410 : 390];
  const bounds = mainWindow.getBounds();
  if (bounds.width !== nextSize[0] || bounds.height !== nextSize[1]) {
    mainWindow.setBounds({ ...bounds, width: nextSize[0], height: nextSize[1] }, false);
  }
  if (compact) mainWindow.setAlwaysOnTop(true, 'floating');
  else applyPinMode(settings.pinMode);
}

function applyPinMode(mode: PinMode): void {
  if (!mainWindow) return;
  mainWindow.setAlwaysOnTop(mode === 'always', 'floating');
}

ipcMain.handle('quota:get', () => latestSnapshot ?? client?.getSnapshot() ?? state?.getSnapshot());
ipcMain.handle('quota:refresh', async () => {
  const [codexSnapshot] = await Promise.all([
    client?.refresh() ?? Promise.resolve(latestSnapshot ?? state?.getSnapshot()),
    deepSeekClient?.refresh(),
  ]);
  return latestSnapshot ?? codexSnapshot;
});
ipcMain.handle('settings:get', () => settings);
ipcMain.handle('settings:update', async (_event, patch: Partial<WidgetSettings>) => {
  settings = await state.updateSettings(patch);
  client?.setIntervalMs(settings.refreshIntervalSec * 1000);
  deepSeekClient?.setIntervalMs(settings.refreshIntervalSec * 1000);
  applyStartupSetting();
  applyWindowSize();
  mainWindow?.webContents.send('settings:update', settings);
  return settings;
});
ipcMain.handle('view:set', (_event, view: ViewMode) => { viewMode = view; applyWindowSize(); });
ipcMain.handle('window:resize-compact', async (_event, requestedWidth: number, persist = false) => {
  if (!mainWindow) return { width: COMPACT_BASE_WIDTH, height: COMPACT_BASE_HEIGHT, scale: 1 };
  const width = Math.max(COMPACT_MIN_WIDTH, Math.min(COMPACT_MAX_WIDTH, Math.round(Number(requestedWidth) || COMPACT_BASE_WIDTH)));
  const scale = clampScale(width / COMPACT_BASE_WIDTH);
  const height = Math.round(COMPACT_BASE_HEIGHT * scale);
  const bounds = mainWindow.getBounds();
  mainWindow.setBounds({ ...bounds, width, height }, false);
  settings = { ...settings, compactScale: scale };
  mainWindow.webContents.send('settings:update', settings);
  if (persist) settings = await state.updateSettings({ compactScale: scale });
  return { width, height, scale };
});
ipcMain.handle('deepseek:key:status', () => Boolean(state?.getDeepSeekApiKey()));
ipcMain.handle('deepseek:key:set', async (_event, key: string) => {
  const configured = await state.setDeepSeekApiKey(typeof key === 'string' ? key : '');
  deepSeekClient?.setApiKey(state.getDeepSeekApiKey());
  settings = await state.updateSettings({ deepseekApiKeySet: configured });
  deepSeekClient?.refresh();
  mainWindow?.webContents.send('settings:update', settings);
  return configured;
});
ipcMain.handle('deepseek:key:clear', async () => {
  await state.clearDeepSeekApiKey();
  deepSeekClient?.setApiKey(null);
  settings = await state.updateSettings({ deepseekApiKeySet: false });
  mainWindow?.webContents.send('settings:update', settings);
});
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:hide', () => mainWindow?.hide());
ipcMain.handle('app:quit', () => { isQuitting = true; app.quit(); });

ipcMain.on('view:request', (_event, view: ViewMode) => { viewMode = view; applyWindowSize(); mainWindow?.webContents.send('view:request', view); });
