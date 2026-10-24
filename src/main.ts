import { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { LocalState } from './main/settings';
import { CodexClient } from './main/codex-client';
import type { PinMode, ViewMode, WidgetSettings } from './shared/types';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let viewMode: ViewMode = 'compact';
let settings: WidgetSettings;
let state: LocalState;
let client: CodexClient;

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
    client = new CodexClient(state.getSnapshot(), settings.refreshIntervalSec * 1000);
    client.on('snapshot', async (snapshot) => { await state.saveSnapshot(snapshot); mainWindow?.webContents.send('quota:update', snapshot); });
    await client.start();
    mainWindow?.webContents.send('quota:update', client.getSnapshot());
  });
  app.on('before-quit', () => { isQuitting = true; client?.stop(); });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 360,
    height: 64,
    minWidth: 300,
    minHeight: 56,
    maxWidth: 520,
    maxHeight: 520,
    frame: false,
    transparent: true,
    resizable: false,
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
  const iconPath = app.isPackaged ? join(process.resourcesPath, 'tray.svg') : join(app.getAppPath(), 'assets', 'tray.svg');
  tray = new Tray(nativeImage.createFromPath(iconPath));
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

function applyStartupSetting(): void {
  app.setLoginItemSettings({ openAtLogin: settings.launchAtStartup, args: ['--autostart'] });
}

function applyWindowSize(): void {
  if (!mainWindow) return;
  const compact = viewMode === 'compact';
  const settingsView = viewMode === 'settings';
  mainWindow.setResizable(false);
  const nextSize: [number, number] = [360, compact ? 64 : settingsView ? 410 : 390];
  const bounds = mainWindow.getBounds();
  if (bounds.width !== nextSize[0] || bounds.height !== nextSize[1]) {
    mainWindow.setBounds({ ...bounds, width: nextSize[0], height: nextSize[1] }, false);
  }
  applyPinMode(settings.pinMode);
}

function applyPinMode(mode: PinMode): void {
  if (!mainWindow) return;
  mainWindow.setAlwaysOnTop(mode === 'always', 'floating');
}

ipcMain.handle('quota:get', () => client?.getSnapshot() ?? state?.getSnapshot());
ipcMain.handle('quota:refresh', () => client.refresh());
ipcMain.handle('settings:get', () => settings);
ipcMain.handle('settings:update', async (_event, patch: Partial<WidgetSettings>) => {
  settings = await state.updateSettings(patch);
  client?.setIntervalMs(settings.refreshIntervalSec * 1000);
  applyStartupSetting();
  applyWindowSize();
  mainWindow?.webContents.send('settings:update', settings);
  return settings;
});
ipcMain.handle('view:set', (_event, view: ViewMode) => { viewMode = view; applyWindowSize(); });
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:hide', () => mainWindow?.hide());
ipcMain.handle('app:quit', () => { isQuitting = true; app.quit(); });

ipcMain.on('view:request', (_event, view: ViewMode) => { viewMode = view; applyWindowSize(); mainWindow?.webContents.send('view:request', view); });
