import { contextBridge, ipcRenderer } from 'electron';
import type { QuotaSnapshot, ViewMode, WidgetApi, WidgetSettings } from './shared/types';

const api: WidgetApi = {
  getSnapshot: () => ipcRenderer.invoke('quota:get'),
  refresh: () => ipcRenderer.invoke('quota:refresh'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  setView: (mode: ViewMode) => ipcRenderer.invoke('view:set', mode),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  hide: () => ipcRenderer.invoke('window:hide'),
  quit: () => ipcRenderer.invoke('app:quit'),
  onSnapshot: (callback: (snapshot: QuotaSnapshot) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: QuotaSnapshot) => callback(snapshot);
    ipcRenderer.on('quota:update', listener);
    return () => ipcRenderer.removeListener('quota:update', listener);
  },
  onSettings: (callback: (settings: WidgetSettings) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, settings: WidgetSettings) => callback(settings);
    ipcRenderer.on('settings:update', listener);
    return () => ipcRenderer.removeListener('settings:update', listener);
  },
  onViewRequest: (callback: (mode: ViewMode) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, mode: ViewMode) => callback(mode);
    ipcRenderer.on('view:request', listener);
    return () => ipcRenderer.removeListener('view:request', listener);
  },
};

contextBridge.exposeInMainWorld('codexQuota', api);
