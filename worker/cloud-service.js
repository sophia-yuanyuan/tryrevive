import { randomToken } from "./cloud-core.js";
import { createCloudD1Repository } from "./cloud-d1-repository.js";
import { createCloudService } from "./cloud-service-core.js";
import { createOpenAIProjectProvider } from "./openai-project-provider.js";
import { createStripeCheckoutProvider } from "./stripe-checkout-provider.js";

function unavailable(message) {
  return Response.json(
    { error: "service_unavailable", message },
    { status: 503, headers: { "cache-control": "no-store" } }
  );
}

function repositoryFrom(env) {
  return env?.CLOUD_DB ? createCloudD1Repository(env.CLOUD_DB) : null;
}

export function createProviderFromEnvironment(env) {
  if (env?.CLOUD_PROVIDER_ENABLED !== "true") return null;
  if (env?.OPENAI_MODEL_APPROVED !== "true") return null;
  if (!env?.OPENAI_API_KEY || !env?.OPENAI_ANALYSIS_MODEL) return null;
  try {
    return createOpenAIProjectProvider({
      apiKey: env.OPENAI_API_KEY,
      analysisModel: env.OPENAI_ANALYSIS_MODEL,
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
    const paymentProvider = createPaymentProviderFromEnvironment(env);
    const service = createCloudService({
      repository,
      provider,
      paymentProvider,
      randomToken,
      uploadNotice: provider
        ? "只有在你确认后，所选内容才会发送给 TryRevive 云端，并由 OpenAI 完成转写或项目理解。"
        : "只有在你确认后，所选内容才会发送给 TryRevive 云端处理。",
      retentionNotice: provider
        ? "TryRevive 不在项目账本中保存原始内容；OpenAI Responses 请求设置为不保存应用状态。OpenAI 仍可能按默认安全策略保留滥用监测日志最多 30 天；可在隐私中心检查原文未存储状态、导出或删除云端账户。"
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
