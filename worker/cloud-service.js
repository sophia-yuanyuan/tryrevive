import { randomToken } from "./cloud-core.js";
import { createCloudD1Repository } from "./cloud-d1-repository.js";
import { createCloudService } from "./cloud-service-core.js";
import { createOpenAIProjectProvider } from "./openai-project-provider.js";

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
  if (!env?.OPENAI_API_KEY || !env?.OPENAI_ANALYSIS_MODEL) return null;
  try {
    return createOpenAIProjectProvider({
      apiKey: env.OPENAI_API_KEY,
      analysisModel: env.OPENAI_ANALYSIS_MODEL,
      transcriptionModel: env.OPENAI_TRANSCRIPTION_MODEL || "gpt-transcribe"
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
    const service = createCloudService({
      repository,
      provider,
      randomToken,
      uploadNotice: provider
        ? "只有在你确认后，所选内容才会发送给 TryRevive 云端，并由 OpenAI 完成转写或项目理解。"
        : "只有在你确认后，所选内容才会发送给 TryRevive 云端处理。",
      retentionNotice: provider
        ? "TryRevive 不在项目账本中保存原始内容；OpenAI Responses 请求设置为不保存应用状态。OpenAI 仍可能按默认安全策略保留滥用监测日志最多 30 天；当前没有原文删除入口。"
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
