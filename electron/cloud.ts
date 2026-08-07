import { promises as fs } from "node:fs";
import path from "node:path";
import { app, safeStorage } from "electron";
import { z } from "zod";
import {
  CloudAnalysisResultSchema,
  type CloudAnalysisResult,
  type CloudAnalyzeRequest,
  CloudQuoteSchema,
  type CloudQuote,
  CloudRedeemResultSchema,
  type CloudRedeemResult,
  CloudSourceMetadataSchema,
  type CloudStatus,
  MAX_CLOUD_SOURCE_BYTES
} from "../src/shared/cloud/contracts";

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

function configuredBaseUrl(): string | null {
  const configured = process.env.TRYREVIVE_CLOUD_URL?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    const localDevelopment =
      !app.isPackaged &&
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname);
    if (url.protocol !== "https:" && !localDevelopment) return null;
    if (url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
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
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, safeStorage.encryptString(token));
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
  if (!response.ok) throw new Error(await readError(response));
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
      message: "此版本尚未接通经过验证的云端服务；不会上传你的项目内容。"
    };
  }
  const token = await loadSessionToken();
  try {
    if (!token) {
      await requestJson(
        "/v1/cloud/catalog",
        z.object({ service: z.literal("tryrevive-cloud"), available: z.literal(true) })
      );
      return {
        available: true,
        authenticated: false,
        balance: null,
        secureSessionStorage,
        message: "云端服务可用；使用前需要兑换已购买的算力。"
      };
    }
    const account = await requestJson("/v1/cloud/account", AccountResponseSchema, {}, token);
    return {
      available: true,
      authenticated: true,
      balance: account.balance,
      secureSessionStorage,
      message: "算力已连接。每次上传前都会再次显示预计消耗。"
    };
  } catch (error) {
    return {
      available: false,
      authenticated: Boolean(token),
      balance: null,
      secureSessionStorage,
      message: error instanceof Error ? error.message : "云端服务暂时不可用"
    };
  }
}

export async function redeemCloudCode(input: unknown): Promise<CloudRedeemResult> {
  const code = z.string().trim().min(6).max(80).parse(input);
  const response = await requestJson("/v1/cloud/redeem", RedeemResponseSchema, {
    method: "POST",
    body: JSON.stringify({ code })
  });
  await saveSessionToken(response.sessionToken);
  return CloudRedeemResultSchema.parse(response);
}

export async function quoteCloudContext(input: unknown): Promise<CloudQuote> {
  const source = CloudSourceMetadataSchema.parse(input);
  const token = await loadSessionToken();
  if (!token) throw new Error("先兑换算力，再确认本次上传");
  const quoteSource = {
    ...source,
    name: source.kind === "audio" ? "语音" : source.kind === "text" ? "文字" : "附件"
  };
  return requestJson(
    "/v1/cloud/quote",
    CloudQuoteSchema,
    { method: "POST", body: JSON.stringify({ source: quoteSource }) },
    token
  );
}

export async function analyzeCloudContext(input: CloudAnalyzeRequest): Promise<CloudAnalysisResult> {
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
  const body = {
    idempotencyKey,
    quoteId,
    projectTitle,
    source: {
      metadata,
      ...(text ? { text } : {}),
      ...(bytes?.byteLength ? { base64: Buffer.from(bytes).toString("base64") } : {})
    }
  };
  return requestJson(
    "/v1/cloud/analyze",
    CloudAnalysisResultSchema,
    { method: "POST", body: JSON.stringify(body) },
    token,
    120_000
  );
}
