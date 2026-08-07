import type { AppState } from "@/shared/domain/model";
import type { AudioExportRequest } from "@/shared/audio/export";
import { extractLegacyReviveState } from "@/shared/domain/migrations";
import type {
  AppPlatform,
  DesktopBridge,
  ExportResult,
  ImportResult
} from "@/shared/platform/contracts";
import { FocusEventSchema } from "@/shared/focus/contracts";

const DATABASE_NAME = "tryrevive";
const STORE_NAME = "state";
const STATE_KEY = "current";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开本地数据库"));
  });
}

async function readIndexedState(): Promise<unknown | null> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(STATE_KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error ?? new Error("无法读取本地进度"));
    });
  } finally {
    database.close();
  }
}

async function writeIndexedState(state: AppState): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(state, STATE_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("无法保存本地进度"));
      transaction.onabort = () => reject(transaction.error ?? new Error("本地保存已中止"));
    });
  } finally {
    database.close();
  }
}

function legacyState(): unknown | null {
  const activeUser = localStorage.getItem("tryrevive_active_user") || "local_guest";
  return extractLegacyReviveState(localStorage.getItem(`tryrevive_save_${activeUser}`));
}

function downloadState(state: AppState): ExportResult {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `tryrevive-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  return { canceled: false };
}

function downloadAudio(request: AudioExportRequest): ExportResult {
  const blob = new Blob([request.bytes.slice().buffer], { type: "audio/wav" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = request.fileName;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return { canceled: false };
}

function pickJsonFile(): Promise<ImportResult> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve({ canceled: true });
      try {
        resolve({ canceled: false, state: JSON.parse(await file.text()) });
      } catch {
        resolve({ canceled: false, state: null });
      }
    };
    input.click();
  });
}

const webPlatform: AppPlatform = {
  kind: "web",
  async loadState() {
    return (await readIndexedState()) ?? legacyState();
  },
  saveState: writeIndexedState,
  async exportState(state) {
    return downloadState(state);
  },
  async exportAudio(request) {
    return downloadAudio(request);
  },
  importState: pickJsonFile,
  async openExternal(url) {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    window.open(parsed.href, "_blank", "noopener,noreferrer");
    return true;
  },
  async cloudStatus() {
    return {
      available: false,
      authenticated: false,
      balance: null,
      secureSessionStorage: false,
      message: "云端理解当前仅在桌面版内测；网页版仍可完成全部本地流程。"
    };
  },
  async redeemCloudCode() {
    throw new Error("云端理解当前仅在桌面版内测");
  },
  async quoteCloudContext() {
    throw new Error("云端理解当前仅在桌面版内测");
  },
  async analyzeCloudContext() {
    throw new Error("云端理解当前仅在桌面版内测");
  },
  async focusCapability() {
    return {
      available: false,
      active: false,
      message: "网页版本保留手动全屏专注；系统级偏离提醒仅在 Windows 桌面版提供。"
    };
  },
  async startFocusGuardian() {
    throw new Error("系统级偏离提醒仅在 Windows 桌面版提供");
  },
  async stopFocusGuardian() {
    return {
      phase: "stopped" as const,
      appName: "",
      graceRemainingSeconds: 0,
      idleSeconds: 0,
      allowedApps: [],
      message: "网页版本没有运行系统级偏离提醒。"
    };
  },
  async acknowledgeFocusGuardian() {
    throw new Error("系统级偏离提醒仅在 Windows 桌面版提供");
  },
  onFocusEvent() {
    return () => undefined;
  }
};

function desktopPlatform(bridge: DesktopBridge): AppPlatform {
  return {
    kind: "desktop",
    loadState: () => bridge.loadState(),
    saveState: (state) => bridge.saveState(state),
    exportState: (state) => bridge.exportState(state),
    exportAudio: (request) => bridge.exportAudio(request),
    importState: () => bridge.importState(),
    openExternal: (url) => bridge.openExternal(url),
    cloudStatus: () => bridge.cloudStatus(),
    redeemCloudCode: (code) => bridge.redeemCloudCode(code),
    quoteCloudContext: (source) => bridge.quoteCloudContext(source),
    analyzeCloudContext: (request) => bridge.analyzeCloudContext(request),
    focusCapability: () => bridge.focusCapability(),
    startFocusGuardian: (request) => bridge.startFocusGuardian(request),
    stopFocusGuardian: () => bridge.stopFocusGuardian(),
    acknowledgeFocusGuardian: (action) => bridge.acknowledgeFocusGuardian(action),
    onFocusEvent: (listener) =>
      bridge.onFocusEvent((event) => listener(FocusEventSchema.parse(event)))
  };
}

export const platform: AppPlatform = window.tryRevive
  ? desktopPlatform(window.tryRevive)
  : webPlatform;
