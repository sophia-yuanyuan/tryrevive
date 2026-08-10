import { randomToken } from "./cloud-core.js";
import { createCloudD1Repository } from "./cloud-d1-repository.js";
import { createCloudService } from "./cloud-service-core.js";
import { createOpenAIProjectProvider } from "./openai-project-provider.js";
import { createStripeCheckoutProvider } from "./stripe-checkout-provider.js";

export const OPENAI_UPLOAD_NOTICE =
  "只有在你确认后，所选内容才会发送给 TryRevive 云端，并由 OpenAI 完成转写或项目理解。";

export const OPENAI_RETENTION_NOTICE =
  "TryRevive 不在项目账本中保存原始内容，OpenAI Responses 请求设置为 store:false；这不等于退出滥用监测日志。每次项目分析还会发送由随机云账号 ID、固定用途前缀和 SHA-256 生成的稳定匿名标识；OpenAI 可以据此关联同一匿名账号的多次分析请求，但原始账号 ID、会话令牌、姓名、邮箱、项目名、文件名和材料内容都不用于该标识。OpenAI 默认滥用监测日志最长保留 30 天；如果法律要求，或为保护服务与第三方免受伤害而合理必要，可能保留更久。";

function unavailable(message) {
  return Response.json(
    { error: "service_unavailable", message },
    { status: 503, headers: { "cache-control": "no-store" } }
  );
}

function repositoryFrom(env) {
  return env?.CLOUD_DB ? createCloudD1Repository(env.CLOUD_DB) : null;
}

export function providerModeFromEnvironment(env) {
  if (env?.CLOUD_PROVIDER_ENABLED !== "true") return null;
  const deployment = env?.CLOUD_DEPLOYMENT_ENVIRONMENT;
  if (deployment !== "staging" && deployment !== "production") return null;
  if (env?.OPENAI_MODEL_APPROVED === "true") return "approved";
  if (deployment === "staging" && env?.OPENAI_MODEL_REVIEW_ENABLED === "true") return "review";
  return null;
}

export function createProviderFromEnvironment(env) {
  if (!providerModeFromEnvironment(env)) return null;
  if (!env?.OPENAI_API_KEY || !env?.OPENAI_ANALYSIS_MODEL) return null;
  try {
    return createOpenAIProjectProvider({
      apiKey: env.OPENAI_API_KEY,
      analysisModel: env.OPENAI_ANALYSIS_MODEL,
      reasoningEffort: env.OPENAI_REASONING_EFFORT || "medium",
      transcriptionModel: env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe"
    });
  } catch {
    return null;
  }
}

export function createPaymentProviderFromEnvironment(env) {
  if (env?.CLOUD_PAYMENT_ENABLED !== "true") return null;
  if (
    !env?.STRIPE_SECRET_KEY ||
    !env?.STRIPE_WEBHOOK_SECRET ||
    !env?.STRIPE_PACKAGES_JSON ||
    !env?.STRIPE_SUCCESS_URL ||
    !env?.STRIPE_CANCEL_URL
  ) {
    return null;
  }
  const liveKey = env.STRIPE_SECRET_KEY.startsWith("sk_live_");
  if (liveKey && env?.CLOUD_PAYMENT_LIVE_ENABLED !== "true") return null;
  if (!liveKey && !env.STRIPE_SECRET_KEY.startsWith("sk_test_")) return null;
  try {
    return createStripeCheckoutProvider({
      secretKey: env.STRIPE_SECRET_KEY,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
      packages: env.STRIPE_PACKAGES_JSON,
      successUrl: env.STRIPE_SUCCESS_URL,
      cancelUrl: env.STRIPE_CANCEL_URL
    });
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const repository = repositoryFrom(env);
    if (!repository) {
      return unavailable("TryRevive 云端账本尚未配置；本次不会上传或扣除算力。");
    }
    const provider = createProviderFromEnvironment(env);
    const analysisMode = provider ? providerModeFromEnvironment(env) : null;
    const paymentProvider = createPaymentProviderFromEnvironment(env);
    const service = createCloudService({
      repository,
      provider,
      analysisMode,
      analysisModel: provider ? provider.analysisModel : null,
      analysisReasoningEffort: provider ? provider.reasoningEffort : null,
      paymentProvider,
      randomToken,
      uploadNotice: provider
        ? OPENAI_UPLOAD_NOTICE
        : "只有在你确认后，所选内容才会发送给 TryRevive 云端处理。",
      retentionNotice: provider
        ? OPENAI_RETENTION_NOTICE
        : "真实处理方和保留期限尚未启用；当前服务不会接收项目内容。"
    });
    return service(request);
  },

  async scheduled(_controller, env, context) {
    const repository = repositoryFrom(env);
    if (!repository) return;
    context.waitUntil(repository.releaseExpired(Date.now()));
  }
};
