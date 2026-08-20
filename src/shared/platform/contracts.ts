import type { AppState } from "../domain/model";
import type { AudioExportRequest } from "../audio/export";
import type {
  CloudAnalysisResult,
  CloudAnalysisRecovery,
  CloudAccountDeletionResult,
  CloudAnalyzeRequest,
  CloudSourceDeletionResult,
  CloudDisconnectResult,
  CloudQuote,
  CloudPaymentCatalog,
  CloudPaymentCheckout,
  CloudRedeemResult,
  CloudSourceMetadata,
  CloudStatus
} from "../cloud/contracts";
import type {
  FocusAcknowledge,
  FocusCapability,
  FocusEvent,
  FocusSessionRequest
} from "../focus/contracts";
import type { RepositoryScanResult } from "../domain/repository-inference";
import type {
  RepositoryDiscoveryResult,
  RepositoryDiscoverySelection
} from "../domain/repository-discovery";
import type {
  LocalSpeechCapability,
  LocalSpeechRequest,
  LocalSpeechResult
} from "../speech/contracts";

export interface ExportResult {
  canceled: boolean;
  path?: string;
}

export interface ImportResult {
  canceled: boolean;
  state?: unknown;
  persisted?: boolean;
}

export interface LoadStateResult {
  state: unknown | null;
  recoveryRequired?: boolean;
  recoveryMessage?: string;
}

export interface AppPlatform {
  readonly kind: "web" | "desktop";
  loadState(): Promise<LoadStateResult>;
  saveState(state: AppState): Promise<void>;
  exportState(state: AppState): Promise<ExportResult>;
  exportAudio(request: AudioExportRequest): Promise<ExportResult>;
  importState(): Promise<ImportResult>;
  chooseRepository(): Promise<RepositoryScanResult>;
  discoverRepositories(): Promise<RepositoryDiscoveryResult>;
  scanDiscoveredRepository(selection: RepositoryDiscoverySelection): Promise<RepositoryScanResult>;
  rescanRepository(bindingId: string): Promise<RepositoryScanResult>;
  localSpeechCapability(): Promise<LocalSpeechCapability>;
  transcribeLocalSpeech(request: LocalSpeechRequest): Promise<LocalSpeechResult>;
  fullScreenState(): Promise<boolean>;
  setFullScreen(enabled: boolean): Promise<boolean>;
  onFullScreenChanged(listener: (enabled: boolean) => void): () => void;
  openExternal(url: string): Promise<boolean>;
  cloudStatus(): Promise<CloudStatus>;
  disconnectCloud(): Promise<CloudDisconnectResult>;
  exportCloudData(): Promise<ExportResult>;
  deleteCloudSourceContent(): Promise<CloudSourceDeletionResult>;
  deleteCloudAccount(confirmation: string): Promise<CloudAccountDeletionResult>;
  cloudPaymentPackages(): Promise<CloudPaymentCatalog>;
  createCloudPaymentCheckout(
    packageId: string,
    idempotencyKey: string
  ): Promise<CloudPaymentCheckout>;
  redeemCloudCode(code: string): Promise<CloudRedeemResult>;
  quoteCloudContext(source: CloudSourceMetadata): Promise<CloudQuote>;
  analyzeCloudContext(request: CloudAnalyzeRequest): Promise<CloudAnalysisResult>;
  recoverCloudAnalysis(): Promise<CloudAnalysisRecovery>;
  clearCloudAnalysisCheckpoint(idempotencyKey: string): Promise<void>;
  focusCapability(): Promise<FocusCapability>;
  startFocusGuardian(request: FocusSessionRequest): Promise<FocusEvent>;
  stopFocusGuardian(): Promise<FocusEvent>;
  acknowledgeFocusGuardian(action: FocusAcknowledge): Promise<FocusEvent>;
  onFocusEvent(listener: (event: FocusEvent) => void): () => void;
}

export interface DesktopBridge {
  loadState(): Promise<LoadStateResult>;
  saveState(state: AppState): Promise<void>;
  exportState(state: AppState): Promise<ExportResult>;
  exportAudio(request: AudioExportRequest): Promise<ExportResult>;
  importState(): Promise<ImportResult>;
  chooseRepository(): Promise<RepositoryScanResult>;
  discoverRepositories(): Promise<RepositoryDiscoveryResult>;
  scanDiscoveredRepository(selection: RepositoryDiscoverySelection): Promise<RepositoryScanResult>;
  rescanRepository(bindingId: string): Promise<RepositoryScanResult>;
  localSpeechCapability(): Promise<LocalSpeechCapability>;
  transcribeLocalSpeech(request: LocalSpeechRequest): Promise<LocalSpeechResult>;
  fullScreenState(): Promise<boolean>;
  setFullScreen(enabled: boolean): Promise<boolean>;
  onFullScreenChanged(listener: (enabled: boolean) => void): () => void;
  openExternal(url: string): Promise<boolean>;
  cloudStatus(): Promise<CloudStatus>;
  disconnectCloud(): Promise<CloudDisconnectResult>;
  exportCloudData(): Promise<ExportResult>;
  deleteCloudSourceContent(): Promise<CloudSourceDeletionResult>;
  deleteCloudAccount(confirmation: string): Promise<CloudAccountDeletionResult>;
  cloudPaymentPackages(): Promise<CloudPaymentCatalog>;
  createCloudPaymentCheckout(
    packageId: string,
    idempotencyKey: string
  ): Promise<CloudPaymentCheckout>;
  redeemCloudCode(code: string): Promise<CloudRedeemResult>;
  quoteCloudContext(source: CloudSourceMetadata): Promise<CloudQuote>;
  analyzeCloudContext(request: CloudAnalyzeRequest): Promise<CloudAnalysisResult>;
  recoverCloudAnalysis(): Promise<CloudAnalysisRecovery>;
  clearCloudAnalysisCheckpoint(idempotencyKey: string): Promise<void>;
  focusCapability(): Promise<FocusCapability>;
  startFocusGuardian(request: FocusSessionRequest): Promise<FocusEvent>;
  stopFocusGuardian(): Promise<FocusEvent>;
  acknowledgeFocusGuardian(action: FocusAcknowledge): Promise<FocusEvent>;
  onFocusEvent(listener: (event: FocusEvent) => void): () => void;
}
