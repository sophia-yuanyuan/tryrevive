import { promises as fs } from "node:fs";
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
import { analyzeCloudContext, getCloudStatus, quoteCloudContext, redeemCloudCode } from "./cloud";
import { focusGuardian } from "./focus";
import { IPC_CHANNELS } from "./ipc";

const APP_SCHEME = "app";
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
  }
]);

function dataPath(): string {
  return path.join(app.getPath("userData"), "tryrevive-state.json");
}

async function loadStateFromDisk(): Promise<unknown | null> {
  try {
    return JSON.parse(await fs.readFile(dataPath(), "utf8"));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw error;
  }
}

async function saveStateToDisk(input: unknown): Promise<void> {
  const state = AppStateSchema.parse(input);
  const destination = dataPath();
  const temporary = `${destination}.tmp`;
  const backup = `${destination}.bak`;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  try {
    await fs.copyFile(destination, backup);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await fs.writeFile(temporary, JSON.stringify(state, null, 2), "utf8");
  await fs.rename(temporary, destination);
}

function isAllowedExternalUrl(input: unknown): input is string {
  if (typeof input !== "string" || input.length > 2_048) return false;
  try {
    return ["https:", "http:"].includes(new URL(input).protocol);
  } catch {
    return false;
  }
}

function isTrustedRendererUrl(senderUrl: string): boolean {
  const developmentUrl = process.env.ELECTRON_RENDERER_URL;
  return developmentUrl
    ? senderUrl.startsWith(new URL(developmentUrl).origin)
    : senderUrl.startsWith(`${APP_SCHEME}://renderer/`);
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const senderUrl = event.senderFrame?.url ?? "";
  if (!isTrustedRendererUrl(senderUrl)) throw new Error("拒绝来自非受信页面的请求");
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
    return { canceled: false, state: JSON.parse(await fs.readFile(filePath, "utf8")) };
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

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault();
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
      if (!isTrustedRendererUrl(webContents.getURL())) return callback(false);
      if (permission === "fullscreen") return callback(true);
      if (permission === "media") {
        const requestedMedia = "mediaTypes" in details ? (details.mediaTypes ?? []) : [];
        const audioOnly =
          requestedMedia.length > 0 && requestedMedia.every((type) => type === "audio");
        return callback(audioOnly);
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
