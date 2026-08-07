import { contextBridge, ipcRenderer } from "electron";
import type { AppState } from "../src/shared/domain/model";
import type { FocusEvent } from "../src/shared/focus/contracts";
import type { DesktopBridge } from "../src/shared/platform/contracts";
import { IPC_CHANNELS } from "./ipc";

const bridge: DesktopBridge = {
  loadState: () => ipcRenderer.invoke(IPC_CHANNELS.loadState),
  saveState: (state: AppState) => ipcRenderer.invoke(IPC_CHANNELS.saveState, state),
  exportState: (state: AppState) => ipcRenderer.invoke(IPC_CHANNELS.exportState, state),
  exportAudio: (request) => ipcRenderer.invoke(IPC_CHANNELS.exportAudio, request),
  importState: () => ipcRenderer.invoke(IPC_CHANNELS.importState),
  openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.openExternal, url),
  cloudStatus: () => ipcRenderer.invoke(IPC_CHANNELS.cloudStatus),
  disconnectCloud: () => ipcRenderer.invoke(IPC_CHANNELS.disconnectCloud),
  redeemCloudCode: (code: string) => ipcRenderer.invoke(IPC_CHANNELS.redeemCloudCode, code),
  quoteCloudContext: (source) => ipcRenderer.invoke(IPC_CHANNELS.quoteCloudContext, source),
  analyzeCloudContext: (request) => ipcRenderer.invoke(IPC_CHANNELS.analyzeCloudContext, request),
  focusCapability: () => ipcRenderer.invoke(IPC_CHANNELS.focusCapability),
  startFocusGuardian: (request) => ipcRenderer.invoke(IPC_CHANNELS.startFocusGuardian, request),
  stopFocusGuardian: () => ipcRenderer.invoke(IPC_CHANNELS.stopFocusGuardian),
  acknowledgeFocusGuardian: (action) =>
    ipcRenderer.invoke(IPC_CHANNELS.acknowledgeFocusGuardian, action),
  onFocusEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown) =>
      listener(value as FocusEvent);
    ipcRenderer.on(IPC_CHANNELS.focusEvent, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.focusEvent, handler);
  }
};

contextBridge.exposeInMainWorld("tryRevive", Object.freeze(bridge));
