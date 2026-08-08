<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { platform } from "@/renderer/platform/web";
import type { CloudStatus } from "@/shared/cloud/contracts";

const status = ref<CloudStatus | null>(null);
const busy = ref<"export" | "source" | "account" | null>(null);
const notice = ref("");
const error = ref("");
const deletePhrase = ref("");

const canManageCloudData = computed(
  () => platform.kind === "desktop" && status.value?.authenticated === true
);

async function refreshStatus(): Promise<void> {
  status.value = await platform.cloudStatus();
}

async function exportCloudData(): Promise<void> {
  busy.value = "export";
  notice.value = "";
  error.value = "";
  try {
    const result = await platform.exportCloudData();
    notice.value = result.canceled
      ? "你取消了导出，没有创建文件。"
      : `云端数据已经导出${result.path ? `到 ${result.path}` : ""}。`;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "云端数据导出失败";
  } finally {
    busy.value = null;
  }
}

async function verifySourceDeletion(): Promise<void> {
  busy.value = "source";
  notice.value = "";
  error.value = "";
  try {
    const result = await platform.deleteCloudSourceContent();
    notice.value = result.message;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "无法检查云端原文副本";
  } finally {
    busy.value = null;
  }
}

async function deleteCloudAccount(): Promise<void> {
  notice.value = "";
  error.value = "";
  if (deletePhrase.value.trim() !== "删除云端数据") {
    error.value = "请完整输入“删除云端数据”，再执行不可恢复的删除。";
    return;
  }
  busy.value = "account";
  try {
    const result = await platform.deleteCloudAccount("DELETE CLOUD DATA");
    deletePhrase.value = "";
    notice.value = `${result.message} 已删除的未使用额度：${result.unusedBalanceDeleted.speechMinutes} 分钟语音、${result.unusedBalanceDeleted.projectAnalyses} 次项目理解。`;
    await refreshStatus();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "云端账户删除失败";
  } finally {
    busy.value = null;
  }
}

function openOpenAiDataControls(): void {
  void platform.openExternal("https://platform.openai.com/docs/guides/your-data");
}

onMounted(() => {
  void refreshStatus().catch((caught) => {
    error.value = caught instanceof Error ? caught.message : "无法检查云端账户状态";
  });
});
</script>

<template>
  <main class="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
    <article class="stage-card prose-copy">
      <p class="eyebrow">TryRevive 隐私中心</p>
      <h1 class="stage-title">你的项目原文不应该变成一笔糊涂账</h1>
      <p class="stage-description">
        本说明适用于 TryRevive
        本地功能，以及你主动确认后才会启用的云端项目理解。版本日期：2026-08-08。
      </p>

      <section class="mt-9" aria-labelledby="privacy-local-title">
        <p class="summary-label">默认留在本机</p>
        <h2 id="privacy-local-title" class="mt-2 text-xl font-semibold text-[var(--ink)]">
          项目、进度和下次继续位置
        </h2>
        <p class="mt-3 text-sm leading-7 text-[var(--muted)]">
          项目名称、恢复摘要、下一步、专注记录、成果证据、返回位置和黑胶奖励默认保存在你的设备。只有你主动导出备份时，TryRevive
          才会在你选择的位置生成 JSON 或音频文件。
        </p>
      </section>

      <section
        class="mt-9 border-t border-[var(--line)] pt-8"
        aria-labelledby="privacy-cloud-title"
      >
        <p class="summary-label">主动使用云端理解时</p>
        <h2 id="privacy-cloud-title" class="mt-2 text-xl font-semibold text-[var(--ink)]">
          先报价和预留额度，再上传一次
        </h2>
        <p class="mt-3 text-sm leading-7 text-[var(--muted)]">
          TryRevive
          云端保存匿名账户编号、剩余额度、报价、用量账本、处理状态和由模型生成的恢复摘要。上传前只提交文件类型、大小和语音时长；只有你确认消耗后，所选文字、语音、PDF
          或 DOCX 才会发送给 TryRevive 云端，并交给配置且审核通过的 OpenAI 模型处理。
        </p>
        <p class="mt-3 text-sm leading-7 text-[var(--muted)]">
          TryRevive 不把上传原文写入 D1 数据库，也不使用 OpenAI Files API 持久化文件；分析请求使用
          <code>store: false</code>。这不等于第三方没有任何安全日志。OpenAI
          的滥用监测日志可能按其数据控制规则短期保留，当前产品提示上限为 30 天。
        </p>
        <button class="text-button mt-3" type="button" @click="openOpenAiDataControls">
          查看 OpenAI 官方数据控制说明
        </button>
      </section>

      <section class="mt-9 border-t border-[var(--line)] pt-8" aria-labelledby="privacy-use-title">
        <p class="summary-label">为什么处理这些数据</p>
        <h2 id="privacy-use-title" class="mt-2 text-xl font-semibold text-[var(--ink)]">
          只用于恢复项目、结算用量和保障请求安全
        </h2>
        <p class="mt-3 text-sm leading-7 text-[var(--muted)]">
          项目内容用于生成“我猜你做到这里”和最小下一步；账户与账本用于避免重复扣费、处理退款和导出记录；会话令牌仅以系统加密方式保存在桌面端，服务端只保存哈希。TryRevive
          不出售项目内容，也不把原文用于广告画像。
        </p>
      </section>

      <section
        class="mt-9 border-t border-[var(--line)] pt-8"
        aria-labelledby="privacy-retention-title"
      >
        <p class="summary-label">保存与删除</p>
        <h2 id="privacy-retention-title" class="mt-2 text-xl font-semibold text-[var(--ink)]">
          你可以拿走记录，也可以结束云端账户
        </h2>
        <p class="mt-3 text-sm leading-7 text-[var(--muted)]">
          本地数据由你控制。云端派生分析、账户和账本会保存到你删除云端账户为止；删除后，所有会话立即失效，未使用额度不会恢复。已兑换代码只保留去关联的防重复使用记录。正在处理的请求必须先完成或退款，避免删除与扣费同时发生。
        </p>

        <div class="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            class="secondary-button"
            type="button"
            :disabled="!canManageCloudData || busy !== null"
            @click="exportCloudData"
          >
            {{ busy === "export" ? "正在导出…" : "导出我的云端数据" }}
          </button>
          <button
            class="secondary-button"
            type="button"
            :disabled="!canManageCloudData || busy !== null"
            @click="verifySourceDeletion"
          >
            {{ busy === "source" ? "正在检查…" : "检查并清除原文副本" }}
          </button>
        </div>

        <div class="mt-6 rounded-2xl border border-[var(--line)] bg-white/45 p-5">
          <label class="summary-label" for="delete-cloud-phrase">永久删除云端账户</label>
          <p class="mt-2 text-sm leading-6 text-[var(--muted)]">
            这不会删除本机项目，但会删除全部云端派生分析、用量记录、会话和未使用额度。请输入“删除云端数据”确认。
          </p>
          <div class="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              id="delete-cloud-phrase"
              v-model="deletePhrase"
              class="field-input min-w-0 flex-1"
              type="text"
              autocomplete="off"
              placeholder="删除云端数据"
              :disabled="!canManageCloudData || busy !== null"
            />
            <button
              class="secondary-button"
              type="button"
              :disabled="!canManageCloudData || busy !== null"
              @click="deleteCloudAccount"
            >
              {{ busy === "account" ? "正在删除…" : "永久删除" }}
            </button>
          </div>
        </div>

        <p v-if="status" class="mt-4 text-sm leading-6 text-[var(--muted)]" role="status">
          {{ status.message }}
        </p>
        <p v-if="notice" class="mt-3 text-sm leading-6 text-[var(--muted)]" role="status">
          {{ notice }}
        </p>
        <p v-if="error" class="mt-3 text-sm leading-6 text-[var(--danger)]" role="alert">
          {{ error }}
        </p>
      </section>

      <section
        class="mt-9 border-t border-[var(--line)] pt-8"
        aria-labelledby="privacy-launch-title"
      >
        <p class="summary-label">生产启用边界</p>
        <h2 id="privacy-launch-title" class="mt-2 text-xl font-semibold text-[var(--ink)]">
          真实付款启用前还必须补齐运营者和联系入口
        </h2>
        <p class="mt-3 text-sm leading-7 text-[var(--muted)]">
          当前说明真实描述了代码已经执行的数据流，但尚未把运营主体、适用司法辖区、退款责任人和经过收信验证的隐私联系邮箱写成既成事实。完成这些账户级验证前，TryRevive
          不应打开生产付款或对外宣称云端服务已经正式上线。
        </p>
      </section>

      <div class="mt-9 flex flex-wrap gap-3">
        <RouterLink class="secondary-button inline-flex" to="/">返回工作台</RouterLink>
        <RouterLink class="text-button inline-flex items-center" to="/about">
          TryRevive 如何工作
        </RouterLink>
      </div>
    </article>
  </main>
</template>
