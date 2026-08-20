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
  chooseRepository: () => ipcRenderer.invoke(IPC_CHANNELS.chooseRepository),
  discoverRepositories: () => ipcRenderer.invoke(IPC_CHANNELS.discoverRepositories),
  scanDiscoveredRepository: (selection) =>
    ipcRenderer.invoke(IPC_CHANNELS.scanDiscoveredRepository, selection),
  rescanRepository: (bindingId) => ipcRenderer.invoke(IPC_CHANNELS.rescanRepository, bindingId),
  localSpeechCapability: () => ipcRenderer.invoke(IPC_CHANNELS.localSpeechCapability),
  transcribeLocalSpeech: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.transcribeLocalSpeech, request),
  fullScreenState: () => ipcRenderer.invoke(IPC_CHANNELS.fullScreenState),
  setFullScreen: (enabled) => ipcRenderer.invoke(IPC_CHANNELS.setFullScreen, enabled),
  onFullScreenChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, enabled: boolean) => listener(enabled);
    ipcRenderer.on(IPC_CHANNELS.fullScreenChanged, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.fullScreenChanged, handler);
  },
  openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.openExternal, url),
  cloudStatus: () => ipcRenderer.invoke(IPC_CHANNELS.cloudStatus),
  disconnectCloud: () => ipcRenderer.invoke(IPC_CHANNELS.disconnectCloud),
  exportCloudData: () => ipcRenderer.invoke(IPC_CHANNELS.exportCloudData),
  deleteCloudSourceContent: () => ipcRenderer.invoke(IPC_CHANNELS.deleteCloudSourceContent),
  deleteCloudAccount: (confirmation) =>
    ipcRenderer.invoke(IPC_CHANNELS.deleteCloudAccount, confirmation),
  cloudPaymentPackages: () => ipcRenderer.invoke(IPC_CHANNELS.cloudPaymentPackages),
  createCloudPaymentCheckout: (packageId, idempotencyKey) =>
    ipcRenderer.invoke(IPC_CHANNELS.createCloudPaymentCheckout, packageId, idempotencyKey),
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
