import type { AppState } from "../domain/model";

export interface ExportResult {
  canceled: boolean;
  path?: string;
}

export interface ImportResult {
  canceled: boolean;
  state?: unknown;
}

export interface AppPlatform {
  readonly kind: "web" | "desktop";
  loadState(): Promise<unknown | null>;
  saveState(state: AppState): Promise<void>;
  exportState(state: AppState): Promise<ExportResult>;
  importState(): Promise<ImportResult>;
  openExternal(url: string): Promise<boolean>;
}

export interface DesktopBridge {
  loadState(): Promise<unknown | null>;
  saveState(state: AppState): Promise<void>;
  exportState(state: AppState): Promise<ExportResult>;
  importState(): Promise<ImportResult>;
  openExternal(url: string): Promise<boolean>;
}
