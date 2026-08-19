import { constants, promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  session,
  shell,
  type IpcMainInvokeEvent
} from "electron";
import { AppStateSchema } from "../src/shared/domain/model";
import { migrateState } from "../src/shared/domain/migrations";
import type { LoadStateResult } from "../src/shared/platform/contracts";
import { parseAudioExportRequest } from "../src/shared/audio/export";
import {
  analyzeCloudContext,
  deleteCloudAccount,
  deleteCloudSourceContent,
  disconnectCloud,
  createCloudPaymentCheckout,
  getCloudDataExport,
  getCloudPaymentPackages,
  getCloudStatus,
  quoteCloudContext,
  redeemCloudCode
} from "./cloud";
import { focusGuardian } from "./focus";
import { IPC_CHANNELS } from "./ipc";
import { isTrustedRendererUrl } from "./renderer-trust";
import { chooseLocalRepository, rescanLocalRepository } from "./repository";

const APP_SCHEME = "app";
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
let diskRecoveryRequired = false;

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
  }
]);

function dataPath(): string {
  return path.join(app.getPath("userData"), "tryrevive-state.json");
}

interface InspectedStateFile {
  exists: boolean;
  raw: unknown | null;
  valid: boolean;
  error?: string;
}

async function inspectStateFile(filePath: string): Promise<InspectedStateFile> {
  try {
    const raw: unknown = JSON.parse(await fs.readFile(filePath, "utf8"));
    if (raw == null) throw new Error("存档内容为空");
    migrateState(raw);
    return { exists: true, raw, valid: true };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { exists: false, raw: null, valid: false };
    return {
      exists: true,
      raw: null,
      valid: false,
      error: error instanceof Error ? error.message : "存档无法读取"
    };
  }
}

function recoveryPath(destination: string): string {
  return `${destination}.recovery-${Date.now()}-${process.pid}.json`;
}

async function preservePreV8State(
  destination: string,
  inspected: InspectedStateFile
): Promise<void> {
  if (!inspected.valid || !inspected.raw || typeof inspected.raw !== "object") return;
  const declaredVersion = (inspected.raw as Record<string, unknown>).schemaVersion;
  if (typeof declaredVersion === "number" && declaredVersion >= 8) return;
  const preservation = `${destination}.pre-v8.json`;
  try {
    await fs.copyFile(destination, preservation, constants.COPYFILE_EXCL);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
}

async function restoreBackup(
  destination: string,
  backup: string,
  preservePrimary: boolean
): Promise<string | null> {
  let preservedPath: string | null = null;
  if (preservePrimary) {
    preservedPath = recoveryPath(destination);
    await fs.rename(destination, preservedPath);
  }
  const temporary = `${destination}.restore.tmp`;
  await fs.copyFile(backup, temporary);
  await fs.rename(temporary, destination);
  return preservedPath;
}

async function loadStateFromDisk(): Promise<LoadStateResult> {
  const destination = dataPath();
  const backup = `${destination}.bak`;
  const primaryState = await inspectStateFile(destination);
  if (primaryState.valid) {
    diskRecoveryRequired = false;
    return { state: primaryState.raw };
  }

  const backupState = await inspectStateFile(backup);
  if (backupState.valid) {
    const preservedPath = await restoreBackup(destination, backup, primaryState.exists);
    const preservedMessage = preservedPath
      ? `，原文件已保留为 ${path.basename(preservedPath)}`
      : "";
    diskRecoveryRequired = false;
    return {
      state: backupState.raw,
      recoveryMessage: `TryRevive 已从上一份有效备份恢复本地进度${preservedMessage}`
    };
  }

  if (!primaryState.exists && !backupState.exists) {
    diskRecoveryRequired = false;
    return { state: null };
  }
  diskRecoveryRequired = true;
  return {
    state: null,
    recoveryRequired: true,
    recoveryMessage:
      "本地存档无法安全验证，TryRevive 没有写入空白数据。请导入你之前导出的 JSON 备份。"
  };
}

async function saveStateToDisk(input: unknown, allowRecovery = false): Promise<void> {
  if (diskRecoveryRequired && !allowRecovery) {
    throw new Error("本地存档正在等待恢复；普通保存已被桌面主进程拒绝");
  }
  const state = AppStateSchema.parse(input);
  const destination = dataPath();
  const temporary = `${destination}.tmp`;
  const backup = `${destination}.bak`;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const currentState = await inspectStateFile(destination);
  if (currentState.valid) {
    await preservePreV8State(destination, currentState);
    await fs.copyFile(destination, backup);
  } else if (currentState.exists) {
    await fs.rename(destination, recoveryPath(destination));
  }
  await fs.writeFile(temporary, JSON.stringify(state, null, 2), "utf8");
  await fs.rename(temporary, destination);
  diskRecoveryRequired = false;
}

function isAllowedExternalUrl(input: unknown): input is string {
  if (typeof input !== "string" || input.length > 2_048) return false;
  try {
    return ["https:", "http:"].includes(new URL(input).protocol);
  } catch {
    return false;
  }
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const senderUrl = event.senderFrame?.url ?? "";
  if (!isTrustedRendererUrl(senderUrl, process.env.ELECTRON_RENDERER_URL)) {
    throw new Error("拒绝来自非受信页面的请求");
  }
}

async function applyFullScreen(window: BrowserWindow, enabled: boolean): Promise<boolean> {
  if (window.isFullScreen() !== enabled) window.setFullScreen(enabled);
  for (let attempt = 0; attempt < 60 && window.isFullScreen() !== enabled; attempt += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
  const actual = window.isFullScreen();
  window.webContents.send(IPC_CHANNELS.fullScreenChanged, actual);
  return actual;
}

function registerIpc(): void {
  ipcMain.handle(IPC_CHANNELS.loadState, async (event) => {
    assertTrustedSender(event);
    return loadStateFromDisk();
  });
  ipcMain.handle(IPC_CHANNELS.saveState, async (event, state: unknown) => {
    assertTrustedSender(event);
    await saveStateToDisk(state);
  });
  ipcMain.handle(IPC_CHANNELS.exportState, async (event, input: unknown) => {
    assertTrustedSender(event);
    const state = AppStateSchema.parse(input);
    const result = await dialog.showSaveDialog({
      title: "导出 TryRevive 备份",
      defaultPath: `tryrevive-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    await fs.writeFile(result.filePath, JSON.stringify(state, null, 2), "utf8");
    return { canceled: false, path: result.filePath };
  });
  ipcMain.handle(IPC_CHANNELS.exportAudio, async (event, input: unknown) => {
    assertTrustedSender(event);
    const request = parseAudioExportRequest(input);
    const result = await dialog.showSaveDialog({
      title: "导出这张项目唱片",
      defaultPath: request.fileName,
      filters: [{ name: "WAV 音频", extensions: ["wav"] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    await fs.writeFile(result.filePath, request.bytes);
    return { canceled: false, path: result.filePath };
  });
  ipcMain.handle(IPC_CHANNELS.importState, async (event) => {
    assertTrustedSender(event);
    const result = await dialog.showOpenDialog({
      title: "导入 TryRevive 备份",
      properties: ["openFile"],
      filters: [{ name: "JSON", extensions: ["json"] }]
    });
    const filePath = result.filePaths[0];
    if (result.canceled || !filePath) return { canceled: true };
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_IMPORT_BYTES) throw new Error("备份文件不能超过 5 MB");
    const raw: unknown = JSON.parse(await fs.readFile(filePath, "utf8"));
    if (diskRecoveryRequired) {
      const imported = migrateState(raw);
      if (!imported.projects.length && !imported.pendingInference) {
        throw new Error("备份中没有可导入的项目或待确认恢复摘要");
      }
      imported.legacyMigrationCompleted = true;
      await saveStateToDisk(imported, true);
      return { canceled: false, state: imported, persisted: true };
    }
    return { canceled: false, state: raw };
  });
  ipcMain.handle(IPC_CHANNELS.chooseRepository, async (event) => {
    assertTrustedSender(event);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error("找不到当前 TryRevive 窗口");
    return chooseLocalRepository(window);
  });
  ipcMain.handle(IPC_CHANNELS.rescanRepository, async (event, bindingId: unknown) => {
    assertTrustedSender(event);
    return rescanLocalRepository(bindingId);
  });
  ipcMain.handle(IPC_CHANNELS.fullScreenState, (event) => {
    assertTrustedSender(event);
    return BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false;
  });
  ipcMain.handle(IPC_CHANNELS.setFullScreen, async (event, enabled: unknown) => {
    assertTrustedSender(event);
    if (typeof enabled !== "boolean") throw new Error("全屏状态无效");
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error("找不到当前 TryRevive 窗口");
    return applyFullScreen(window, enabled);
  });
  ipcMain.handle(IPC_CHANNELS.openExternal, async (event, url: unknown) => {
    assertTrustedSender(event);
    if (!isAllowedExternalUrl(url)) return false;
    await shell.openExternal(url);
    return true;
  });
  ipcMain.handle(IPC_CHANNELS.cloudStatus, async (event) => {
    assertTrustedSender(event);
    return getCloudStatus();
  });
  ipcMain.handle(IPC_CHANNELS.disconnectCloud, async (event) => {
    assertTrustedSender(event);
    return disconnectCloud();
  });
  ipcMain.handle(IPC_CHANNELS.exportCloudData, async (event) => {
    assertTrustedSender(event);
    const result = await dialog.showSaveDialog({
      title: "导出 TryRevive 云端数据",
      defaultPath: `tryrevive-cloud-data-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const exported = await getCloudDataExport();
    await fs.writeFile(result.filePath, JSON.stringify(exported, null, 2), "utf8");
    return { canceled: false, path: result.filePath };
  });
  ipcMain.handle(IPC_CHANNELS.deleteCloudSourceContent, async (event) => {
    assertTrustedSender(event);
    return deleteCloudSourceContent();
  });
  ipcMain.handle(IPC_CHANNELS.deleteCloudAccount, async (event, confirmation: unknown) => {
    assertTrustedSender(event);
    return deleteCloudAccount(confirmation);
  });
  ipcMain.handle(IPC_CHANNELS.cloudPaymentPackages, async (event) => {
    assertTrustedSender(event);
    return getCloudPaymentPackages();
  });
  ipcMain.handle(
    IPC_CHANNELS.createCloudPaymentCheckout,
    async (event, packageId: unknown, idempotencyKey: unknown) => {
      assertTrustedSender(event);
      return createCloudPaymentCheckout(packageId, idempotencyKey);
    }
  );
  ipcMain.handle(IPC_CHANNELS.redeemCloudCode, async (event, code: unknown) => {
    assertTrustedSender(event);
    return redeemCloudCode(code);
  });
  ipcMain.handle(IPC_CHANNELS.quoteCloudContext, async (event, source: unknown) => {
    assertTrustedSender(event);
    return quoteCloudContext(source);
  });
  ipcMain.handle(IPC_CHANNELS.analyzeCloudContext, async (event, request: unknown) => {
    assertTrustedSender(event);
    return analyzeCloudContext(request as Parameters<typeof analyzeCloudContext>[0]);
  });
  ipcMain.handle(IPC_CHANNELS.focusCapability, (event) => {
    assertTrustedSender(event);
    return focusGuardian.capability();
  });
  ipcMain.handle(IPC_CHANNELS.startFocusGuardian, (event, request: unknown) => {
    assertTrustedSender(event);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error("找不到当前 TryRevive 窗口");
    return focusGuardian.start(request, window);
  });
  ipcMain.handle(IPC_CHANNELS.stopFocusGuardian, (event) => {
    assertTrustedSender(event);
    return focusGuardian.stop();
  });
  ipcMain.handle(IPC_CHANNELS.acknowledgeFocusGuardian, (event, action: unknown) => {
    assertTrustedSender(event);
    return focusGuardian.acknowledge(action);
  });
}

function registerAppProtocol(): void {
  const rendererRoot = path.resolve(__dirname, "../renderer");
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    const relativePath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const target = path.resolve(rendererRoot, `.${relativePath}`);
    if (!target.startsWith(`${rendererRoot}${path.sep}`) && target !== rendererRoot) {
      return new Response("Not found", { status: 404 });
    }
    return net.fetch(pathToFileURL(target).toString());
  });
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 360,
    minHeight: 640,
    fullscreen: true,
    show: false,
    backgroundColor: "#f4f1e8",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged
    }
  });
  const notifyFullScreen = () => {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.fullScreenChanged, window.isFullScreen());
    }
  };
  window.on("enter-full-screen", notifyFullScreen);
  window.on("leave-full-screen", notifyFullScreen);

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedRendererUrl(url, process.env.ELECTRON_RENDERER_URL)) event.preventDefault();
  });
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => focusGuardian.stop(false));

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadURL(`${APP_SCHEME}://renderer/index.html`);
  }
  return window;
}

app.whenReady().then(() => {
  registerAppProtocol();
  registerIpc();
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      if (!isTrustedRendererUrl(webContents.getURL(), process.env.ELECTRON_RENDERER_URL)) {
        return callback(false);
      }
      if (permission === "fullscreen") return callback(true);
      if (permission === "media") {
        const requestedMedia = "mediaTypes" in details ? (details.mediaTypes ?? []) : [];
        const supportedMedia =
          requestedMedia.length > 0 &&
          requestedMedia.every((type) => type === "audio" || type === "video");
        return callback(supportedMedia);
      }
      callback(false);
    }
  );
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => focusGuardian.stop(false));
