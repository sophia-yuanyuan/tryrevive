import { contextBridge, ipcRenderer } from "electron";
import type { AppState } from "../src/shared/domain/model";
import type { DesktopBridge } from "../src/shared/platform/contracts";
import { IPC_CHANNELS } from "./ipc";

const bridge: DesktopBridge = {
  loadState: () => ipcRenderer.invoke(IPC_CHANNELS.loadState),
  saveState: (state: AppState) => ipcRenderer.invoke(IPC_CHANNELS.saveState, state),
  exportState: (state: AppState) => ipcRenderer.invoke(IPC_CHANNELS.exportState, state),
  importState: () => ipcRenderer.invoke(IPC_CHANNELS.importState),
  openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.openExternal, url)
};

contextBridge.exposeInMainWorld("tryRevive", Object.freeze(bridge));
