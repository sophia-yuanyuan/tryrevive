import type { AppState } from "../domain/model";
import type {
  CloudAnalysisResult,
  CloudAnalyzeRequest,
  CloudQuote,
  CloudRedeemResult,
  CloudSourceMetadata,
  CloudStatus
} from "../cloud/contracts";

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
  cloudStatus(): Promise<CloudStatus>;
  redeemCloudCode(code: string): Promise<CloudRedeemResult>;
  quoteCloudContext(source: CloudSourceMetadata): Promise<CloudQuote>;
  analyzeCloudContext(request: CloudAnalyzeRequest): Promise<CloudAnalysisResult>;
}

export interface DesktopBridge {
  loadState(): Promise<unknown | null>;
  saveState(state: AppState): Promise<void>;
  exportState(state: AppState): Promise<ExportResult>;
  importState(): Promise<ImportResult>;
  openExternal(url: string): Promise<boolean>;
  cloudStatus(): Promise<CloudStatus>;
  redeemCloudCode(code: string): Promise<CloudRedeemResult>;
  quoteCloudContext(source: CloudSourceMetadata): Promise<CloudQuote>;
  analyzeCloudContext(request: CloudAnalyzeRequest): Promise<CloudAnalysisResult>;
}
