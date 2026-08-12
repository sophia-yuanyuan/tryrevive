import { promises as fs } from "node:fs";
import path from "node:path";
import { app, safeStorage } from "electron";
import { z } from "zod";
import {
  CloudDisconnectResultSchema,
  type CloudDisconnectResult,
  CloudDataExportSchema,
  type CloudDataExport,
  CloudSourceDeletionResultSchema,
  type CloudSourceDeletionResult,
  CloudAccountDeletionResultSchema,
  type CloudAccountDeletionResult,
  CloudPaymentCatalogSchema,
  type CloudPaymentCatalog,
  CloudPaymentCheckoutSchema,
  type CloudPaymentCheckout,
  CloudAnalysisResultSchema,
  type CloudAnalysisResult,
  type CloudAnalyzeRequest,
  CloudQuoteSchema,
  type CloudQuote,
  CloudRedeemResultSchema,
  type CloudRedeemResult,
  CloudReservationResultSchema,
  CloudSourceMetadataSchema,
  type CloudStatus,
  MAX_CLOUD_SOURCE_BYTES
} from "../src/shared/cloud/contracts";
import { resolveCloudBaseUrl } from "../src/shared/cloud/intake-security";

const SESSION_FILENAME = "tryrevive-cloud-session.bin";
const MAX_TEXT_LENGTH = 120_000;

const RedeemResponseSchema = CloudRedeemResultSchema.extend({
  sessionToken: z.string().min(32).max(512)
});
const AccountResponseSchema = z.object({
  balance: z.object({
    speechMinutes: z.number().int().min(0),
    projectAnalyses: z.number().int().min(0)
  })
});
const CatalogResponseSchema = z.object({
  service: z.literal("tryrevive-cloud"),
  available: z.literal(true),
  analysisAvailable: z.boolean(),
  analysisMode: z.enum(["disabled", "review", "approved"]).default("disabled"),
  analysisModel: z.string().trim().min(1).max(120).nullable().default(null),
  costProtection: z.boolean().default(false),
  paymentAvailable: z.boolean().default(false)
});

class CloudRequestError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "CloudRequestError";
  }
}

function configuredBaseUrl(): string | null {
  return resolveCloudBaseUrl(process.env.TRYREVIVE_CLOUD_URL, app.isPackaged);
}

function redactSourceMetadata(source: z.infer<typeof CloudSourceMetadataSchema>) {
  return {
    ...source,
    name: source.kind === "audio" ? "语音" : source.kind === "text" ? "文字" : "附件"
  };
}

function sessionPath(): string {
  return path.join(app.getPath("userData"), SESSION_FILENAME);
}

async function loadSessionToken(): Promise<string | null> {
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const encrypted = await fs.readFile(sessionPath());
    return safeStorage.decryptString(encrypted);
  } catch {
    return null;
  }
}

async function saveSessionToken(token: string): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("当前系统无法安全保存云端会话，请先完成系统登录后重试");
  }
  const destination = sessionPath();
  const temporary = `${destination}.${process.pid}.tmp`;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  try {
    await fs.writeFile(temporary, safeStorage.encryptString(token));
    await fs.rename(temporary, destination);
  } finally {
    await fs.unlink(temporary).catch(() => undefined);
  }
}

async function clearSessionToken(): Promise<void> {
  try {
    await fs.unlink(sessionPath());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown; error?: unknown };
    if (typeof body.message === "string" && body.message.trim()) return body.message;
    if (typeof body.error === "string" && body.error.trim()) return body.error;
  } catch {
    // Return a bounded status below without exposing an upstream response body.
  }
  if (response.status === 401) return "算力凭据已失效，请重新兑换或登录";
  if (response.status === 402) return "当前算力额度不足，本次内容没有上传处理";
  if (response.status === 429) return "云端请求过于频繁，请稍后再试";
  return `云端服务暂时不可用（${response.status}）`;
}

async function requestJson<T>(
  endpoint: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
  token?: string | null,
  timeoutMs = 30_000
): Promise<T> {
  const baseUrl = configuredBaseUrl();
  if (!baseUrl) throw new Error("此安装包尚未配置经过验证的 TryRevive 云端服务");
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${endpoint}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch {
    throw new Error("无法连接 TryRevive 云端；本地项目没有受到影响");
  }
  if (!response.ok) throw new CloudRequestError(response.status, await readError(response));
  return schema.parse(await response.json());
}

export async function getCloudStatus(): Promise<CloudStatus> {
  const secureSessionStorage = safeStorage.isEncryptionAvailable();
  if (!configuredBaseUrl()) {
    return {
      available: false,
      authenticated: false,
      balance: null,
      secureSessionStorage,
      paymentAvailable: false,
      message: "此版本尚未接通经过验证的云端服务；不会上传你的项目内容。"
    };
  }
  if (!secureSessionStorage) {
    return {
      available: false,
      authenticated: false,
      balance: null,
      secureSessionStorage,
      paymentAvailable: false,
      message: "当前系统无法安全保存云端凭据，因此不会使用兑换码或上传项目内容。"
    };
  }
  const token = await loadSessionToken();
  let paymentAvailable = false;
  try {
    const catalog = await requestJson("/v1/cloud/catalog", CatalogResponseSchema);
    paymentAvailable = catalog.paymentAvailable;
    if (
      !catalog.analysisAvailable ||
      catalog.analysisMode !== "approved" ||
      !catalog.costProtection
    ) {
      return {
        available: false,
        authenticated: Boolean(token),
        balance: null,
        secureSessionStorage,
        paymentAvailable,
        message:
          catalog.analysisMode === "review"
            ? "云端模型正在使用合成材料审核，尚未批准给普通用户；不会上传你的内容。"
            : catalog.analysisMode === "approved" && !catalog.costProtection
              ? "云端成本保护尚未启用；不会上传你的内容。"
              : "云端账本已就绪，但真实语音和附件处理尚未启用；不会上传你的内容。"
      };
    }
    if (!token) {
      return {
        available: true,
        authenticated: false,
        balance: null,
        secureSessionStorage,
        paymentAvailable,
        message: "云端服务可用；使用前需要兑换已购买的算力。"
      };
    }
    const account = await requestJson("/v1/cloud/account", AccountResponseSchema, {}, token);
    return {
      available: true,
      authenticated: true,
      balance: account.balance,
      secureSessionStorage,
      paymentAvailable,
      message: "算力已连接。每次上传前都会再次显示预计消耗。"
    };
  } catch (error) {
    if (error instanceof CloudRequestError && error.status === 401) {
      await clearSessionToken();
      return {
        available: true,
        authenticated: false,
        balance: null,
        secureSessionStorage,
        paymentAvailable,
        message: "算力凭据已失效，请重新兑换。原有项目仍保存在本机。"
      };
    }
    return {
      available: false,
      authenticated: Boolean(token),
      balance: null,
      secureSessionStorage,
      paymentAvailable: false,
      message: error instanceof Error ? error.message : "云端服务暂时不可用"
    };
  }
}

export async function redeemCloudCode(input: unknown): Promise<CloudRedeemResult> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("当前系统无法安全保存云端凭据，因此没有使用这枚兑换码");
  }
  const code = z.string().trim().min(6).max(80).parse(input);
  const token = await loadSessionToken();
  const response = await requestJson(
    "/v1/cloud/redeem",
    RedeemResponseSchema,
    {
      method: "POST",
      body: JSON.stringify({ code })
    },
    token
  );
  await saveSessionToken(response.sessionToken);
  return CloudRedeemResultSchema.parse(response);
}

export async function disconnectCloud(): Promise<CloudDisconnectResult> {
  const token = await loadSessionToken();
  let remoteRevoked = !token;
  if (token && configuredBaseUrl()) {
    try {
      const result = await requestJson(
        "/v1/cloud/session/revoke",
        CloudDisconnectResultSchema,
        { method: "POST" },
        token
      );
      remoteRevoked = result.remoteRevoked;
    } catch {
      remoteRevoked = false;
    }
  }
  await clearSessionToken();
  return CloudDisconnectResultSchema.parse({
    remoteRevoked,
    message: remoteRevoked
      ? "这台设备已经退出云端算力；本地项目仍可继续使用。"
      : "本机凭据已移除，但暂时无法确认云端撤销；请勿在共享设备上继续使用旧凭据。"
  });
}

export async function getCloudDataExport(): Promise<CloudDataExport> {
  const token = await loadSessionToken();
  if (!token) throw new Error("请先连接云端账户，再导出云端数据");
  return requestJson("/v1/cloud/data-export", CloudDataExportSchema, {}, token);
}

export async function deleteCloudSourceContent(): Promise<CloudSourceDeletionResult> {
  const token = await loadSessionToken();
  if (!token) throw new Error("请先连接云端账户，再检查原文副本");
  return requestJson(
    "/v1/cloud/source-content",
    CloudSourceDeletionResultSchema,
    { method: "DELETE" },
    token
  );
}

export async function deleteCloudAccount(input: unknown): Promise<CloudAccountDeletionResult> {
  const confirmation = z.literal("DELETE CLOUD DATA").parse(input);
  const token = await loadSessionToken();
  if (!token) throw new Error("请先连接云端账户，再删除云端数据");
  const result = await requestJson(
    "/v1/cloud/account",
    CloudAccountDeletionResultSchema,
    {
      method: "DELETE",
      headers: { "x-tryrevive-delete-confirmation": confirmation }
    },
    token
  );
  await clearSessionToken();
  return result;
}

export async function getCloudPaymentPackages(): Promise<CloudPaymentCatalog> {
  const token = await loadSessionToken();
  if (!token) throw new Error("请先连接云端账户，再购买算力");
  return requestJson("/v1/cloud/payments/packages", CloudPaymentCatalogSchema, {}, token);
}

export async function createCloudPaymentCheckout(
  packageInput: unknown,
  idempotencyInput: unknown
): Promise<CloudPaymentCheckout> {
  const token = await loadSessionToken();
  if (!token) throw new Error("请先连接云端账户，再购买算力");
  const packageId = z.string().trim().min(1).max(48).parse(packageInput);
  const idempotencyKey = z.string().trim().min(12).max(120).parse(idempotencyInput);
  return requestJson(
    "/v1/cloud/payments/checkout",
    CloudPaymentCheckoutSchema,
    {
      method: "POST",
      body: JSON.stringify({ packageId, idempotencyKey })
    },
    token
  );
}

export async function quoteCloudContext(input: unknown): Promise<CloudQuote> {
  const source = CloudSourceMetadataSchema.parse(input);
  const token = await loadSessionToken();
  if (!token) throw new Error("先兑换算力，再确认本次上传");
  const quoteSource = redactSourceMetadata(source);
  return requestJson(
    "/v1/cloud/quote",
    CloudQuoteSchema,
    { method: "POST", body: JSON.stringify({ source: quoteSource }) },
    token
  );
}

export async function analyzeCloudContext(
  input: CloudAnalyzeRequest
): Promise<CloudAnalysisResult> {
  const token = await loadSessionToken();
  if (!token) throw new Error("先兑换算力，再开始云端理解");
  const idempotencyKey = z.string().trim().min(12).max(120).parse(input.idempotencyKey);
  const quoteId = z.string().trim().min(1).max(200).parse(input.quoteId);
  const projectTitle = z.string().trim().min(1).max(80).parse(input.projectTitle);
  const metadata = CloudSourceMetadataSchema.parse(input.source.metadata);
  const text = input.source.text?.slice(0, MAX_TEXT_LENGTH);
  const bytes = input.source.bytes;
  if (!text && !bytes?.byteLength) throw new Error("没有可上传的语音或附件内容");
  if (bytes && bytes.byteLength > MAX_CLOUD_SOURCE_BYTES) {
    throw new Error("单个云端文件不能超过 25 MB");
  }
  const redactedMetadata = redactSourceMetadata(metadata);
  const reservation = await requestJson(
    "/v1/cloud/reservations",
    CloudReservationResultSchema,
    {
      method: "POST",
      body: JSON.stringify({
        idempotencyKey,
        quoteId,
        source: redactedMetadata
      })
    },
    token
  );
  if (reservation.status === "succeeded") {
    if (reservation.result.idempotencyKey !== idempotencyKey) {
      throw new Error("云端返回了不属于本次请求的结果，本地项目没有改变");
    }
    return reservation.result;
  }
  const body = {
    idempotencyKey,
    quoteId,
    projectTitle,
    source: {
      metadata: redactedMetadata,
      ...(text ? { text } : {}),
      ...(bytes?.byteLength ? { base64: Buffer.from(bytes).toString("base64") } : {})
    }
  };
  const result = await requestJson(
    "/v1/cloud/analyze",
    CloudAnalysisResultSchema,
    {
      method: "POST",
      headers: { "x-tryrevive-reservation": reservation.reservationToken },
      body: JSON.stringify(body)
    },
    token,
    120_000
  );
  if (result.idempotencyKey !== idempotencyKey) {
    throw new Error("云端返回了不属于本次请求的结果，本地项目没有改变");
  }
  return result;
}
