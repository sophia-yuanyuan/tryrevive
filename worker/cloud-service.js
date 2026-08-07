import { randomToken } from "./cloud-core.js";
import { createCloudD1Repository } from "./cloud-d1-repository.js";
import { createCloudService } from "./cloud-service-core.js";

function unavailable(message) {
  return Response.json(
    { error: "service_unavailable", message },
    { status: 503, headers: { "cache-control": "no-store" } }
  );
}

function repositoryFrom(env) {
  return env?.CLOUD_DB ? createCloudD1Repository(env.CLOUD_DB) : null;
}

export default {
  async fetch(request, env) {
    const repository = repositoryFrom(env);
    if (!repository) {
      return unavailable("TryRevive 云端账本尚未配置；本次不会上传或扣除算力。");
    }
    const service = createCloudService({
      repository,
      provider: null,
      randomToken,
      uploadNotice: "只有在你确认后，所选内容才会发送给 TryRevive 云端处理。",
      retentionNotice: "真实处理方和保留期限尚未启用；当前服务不会接收项目内容。"
    });
    return service(request);
  },

  async scheduled(_controller, env, context) {
    const repository = repositoryFrom(env);
    if (!repository) return;
    context.waitUntil(repository.releaseExpired(Date.now()));
  }
};
