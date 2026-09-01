<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { ProjectAnalysisSchema, type ProjectAnalysis } from "@/shared/domain/model";
import type {
  CloudAnalysisResult,
  CloudPaymentCatalog,
  CloudQuote,
  CloudSourcePayload,
  CloudStatus
} from "@/shared/cloud/contracts";
import { MAX_CLOUD_SOURCE_BYTES } from "@/shared/cloud/contracts";
import { isCloudAudioFile, normalizeCloudMimeType } from "@/shared/cloud/intake-security";
import { platform } from "@/renderer/platform/web";

const props = withDefaults(
  defineProps<{
    projectTitle?: string;
    initiallyExpanded?: boolean;
    presentation?: "embedded" | "intake";
    accountOnly?: boolean;
    persistDraft?: (
      analysis: ProjectAnalysis,
      sourceKind: "material" | "voice",
      titleHint: string,
      cloudOperationId: string
    ) => Promise<void>;
  }>(),
  {
    projectTitle: "",
    initiallyExpanded: false,
    presentation: "embedded",
    accountOnly: false
  }
);

const expanded = ref(props.initiallyExpanded);
const status = ref<CloudStatus | null>(null);
const paymentCatalog = ref<CloudPaymentCatalog | null>(null);
const source = ref<CloudSourcePayload | null>(null);
const quote = ref<CloudQuote | null>(null);
const draft = ref<ProjectAnalysis | null>(null);
const draftSourceKind = ref<"material" | "voice" | null>(null);
const draftTitleHint = ref("");
const draftOperationId = ref("");
const recoveryPending = ref(false);
const RECOVERY_NOT_FOUND_GRACE_MS = 2 * 60 * 1000;
const redeemCode = ref("");
const busy = ref(false);
const recording = ref(false);
const recordingSeconds = ref(0);
const notice = ref("");
const error = ref("");
const fileInput = ref<HTMLInputElement | null>(null);
const isIntake = computed(() => props.presentation === "intake");
let recorder: MediaRecorder | null = null;
let mediaStream: MediaStream | null = null;
let recordingStartedAt = 0;
let recordingTimer: ReturnType<typeof setInterval> | null = null;
let audioChunks: Blob[] = [];
let idempotencyKey = "";

const balanceLabel = computed(() => {
  const balance = status.value?.balance;
  if (!balance) return "";
  return `还可使用 ${balance.speechMinutes} 分钟语音、${balance.projectAnalyses} 次项目理解`;
});

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatSourceType(payload: CloudSourcePayload): string {
  const mimeType = payload.metadata.mimeType.toLowerCase();
  if (payload.metadata.kind === "audio") return `语音／媒体音轨 · ${mimeType}`;
  if (mimeType === "application/pdf") return "PDF · application/pdf";
  if (mimeType.includes("word") || mimeType === "application/msword") return `Word · ${mimeType}`;
  if (mimeType.includes("spreadsheet") || mimeType === "application/vnd.ms-excel") {
    return `表格 · ${mimeType}`;
  }
  if (mimeType.includes("presentation") || mimeType === "application/vnd.ms-powerpoint") {
    return `演示文稿 · ${mimeType}`;
  }
  if (mimeType.startsWith("text/") || mimeType === "application/json") {
    return `文字材料 · ${mimeType}`;
  }
  return `附件 · ${mimeType}`;
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: currency.toUpperCase()
  }).format(amount / 100);
}

function clearQuote(): void {
  quote.value = null;
  draft.value = null;
  draftSourceKind.value = null;
  draftTitleHint.value = "";
  draftOperationId.value = "";
  idempotencyKey = crypto.randomUUID();
}

function plainSourcePayload(): CloudSourcePayload {
  if (!source.value) throw new Error("还没有选择语音或附件");
  const payload = source.value;
  return {
    metadata: {
      kind: payload.metadata.kind,
      name: payload.metadata.name,
      mimeType: payload.metadata.mimeType,
      sizeBytes: payload.metadata.sizeBytes,
      durationSeconds: payload.metadata.durationSeconds
    },
    ...(typeof payload.text === "string" ? { text: payload.text } : {}),
    ...(payload.bytes ? { bytes: payload.bytes.slice() } : {})
  };
}

function updateBalance(balance: NonNullable<CloudStatus["balance"]>, message: string): void {
  status.value = {
    ...(status.value ?? {
      available: true,
      authenticated: true,
      secureSessionStorage: true,
      paymentAvailable: false,
      message: ""
    }),
    authenticated: true,
    balance,
    message
  };
}

async function acceptAnalysisResult(
  result: CloudAnalysisResult,
  sourceKind: "material" | "voice",
  titleHint = ""
): Promise<void> {
  const parsed = ProjectAnalysisSchema.safeParse(result.draft);
  if (!parsed.success) throw new Error("云端返回的恢复草稿缺少必要内容，本地没有采用它");
  draft.value = parsed.data;
  draftSourceKind.value = sourceKind;
  draftTitleHint.value = titleHint;
  draftOperationId.value = result.idempotencyKey;
  recoveryPending.value = true;
  updateBalance(result.balance, "云端分析已完成；确认前不会改动本地项目。");
  notice.value = `本次已结算 ${result.charged.speechMinutes} 分钟语音、${result.charged.projectAnalyses} 次项目理解。`;
  await persistCurrentDraft();
  recoveryPending.value = false;
}

async function recoverPendingAnalysis(): Promise<void> {
  const recovery = await platform.recoverCloudAnalysis();
  if (recovery.status === "none") {
    recoveryPending.value = false;
    return;
  }
  if (recovery.status === "not_found") {
    recoveryPending.value = true;
    idempotencyKey = recovery.idempotencyKey;
    if (Date.now() - recovery.createdAt < RECOVERY_NOT_FOUND_GRACE_MS) {
      notice.value =
        "上次任务刚建立，云端暂时还查不到记录。请稍后再次检查；不会重复上传或再次预留。";
      return;
    }
    await platform.clearCloudAnalysisCheckpoint(recovery.idempotencyKey);
    recoveryPending.value = false;
    idempotencyKey = crypto.randomUUID();
    notice.value = "没有找到上次云端任务；没有恢复或创建本地项目，你可以重新选择材料。";
    return;
  }
  if (recovery.status === "pending") {
    recoveryPending.value = true;
    idempotencyKey = recovery.idempotencyKey;
    updateBalance(recovery.balance, "上次云端任务仍在处理或等待自动退回预留额度。");
    notice.value = recovery.claimed
      ? "上次材料已经进入处理；可稍后点击“检查上次处理结果”，不要重复上传。"
      : "上次只完成了额度预留，原材料没有保存在本机；任务过期后会自动退回。";
    return;
  }
  if (recovery.status === "failed") {
    await platform.clearCloudAnalysisCheckpoint(recovery.idempotencyKey);
    recoveryPending.value = false;
    updateBalance(recovery.balance, "上次云端任务没有生成可用草稿。");
    clearQuote();
    notice.value = recovery.refunded
      ? "上次云端处理失败或过期，预留额度已经退回。请重新选择材料。"
      : "上次云端处理失败；请先刷新余额确认额度状态，再重新选择材料。";
    return;
  }
  await acceptAnalysisResult(recovery.result, recovery.sourceKind);
}

function audioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(file);
    const timeout = window.setTimeout(() => finish(null), 5000);
    function finish(value: number | null): void {
      window.clearTimeout(timeout);
      URL.revokeObjectURL(url);
      audio.removeAttribute("src");
      if (value && Number.isFinite(value)) resolve(value);
      else reject(new Error("unknown duration"));
    }
    audio.preload = "metadata";
    audio.onloadedmetadata = () => finish(Math.ceil(audio.duration));
    audio.onerror = () => finish(null);
    audio.src = url;
  });
}

async function loadStatus(): Promise<void> {
  if (status.value || busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    status.value = await platform.cloudStatus();
    if (status.value.authenticated) await recoverPendingAnalysis();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "无法检查云端服务";
  } finally {
    busy.value = false;
  }
}

async function toggle(): Promise<void> {
  expanded.value = !expanded.value;
  if (expanded.value) await loadStatus();
}

async function redeem(): Promise<void> {
  if (!redeemCode.value.trim()) return;
  busy.value = true;
  error.value = "";
  try {
    const result = await platform.redeemCloudCode(redeemCode.value);
    redeemCode.value = "";
    notice.value = result.message;
    status.value = await platform.cloudStatus();
    if (status.value.authenticated) await recoverPendingAnalysis();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "算力兑换失败";
  } finally {
    busy.value = false;
  }
}

async function disconnectAccount(): Promise<void> {
  busy.value = true;
  error.value = "";
  try {
    const result = await platform.disconnectCloud();
    notice.value = result.message;
    recoveryPending.value = false;
    status.value = await platform.cloudStatus();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "无法退出云端算力";
  } finally {
    busy.value = false;
  }
}

async function loadPaymentPackages(): Promise<void> {
  busy.value = true;
  error.value = "";
  try {
    paymentCatalog.value = await platform.cloudPaymentPackages();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "无法读取当前算力包";
  } finally {
    busy.value = false;
  }
}

async function purchasePackage(packageId: string): Promise<void> {
  busy.value = true;
  error.value = "";
  notice.value = "";
  try {
    const checkout = await platform.createCloudPaymentCheckout(
      packageId,
      `payment-${crypto.randomUUID()}`
    );
    if (checkout.order.status === "paid") {
      status.value = await platform.cloudStatus();
      notice.value = "这笔订单已经入账，余额已刷新。";
      return;
    }
    if (!checkout.order.checkoutUrl) throw new Error("付款页面暂时不可用，请重新发起");
    const opened = await platform.openExternal(checkout.order.checkoutUrl);
    if (!opened) throw new Error("无法打开 Stripe 付款页面");
    notice.value = "Stripe 付款页面已经打开。付款后回到 TryRevive，点击“付款后刷新余额”。";
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "无法创建付款订单";
  } finally {
    busy.value = false;
  }
}

async function refreshBalanceAfterPayment(): Promise<void> {
  busy.value = true;
  error.value = "";
  try {
    status.value = await platform.cloudStatus();
    notice.value = "余额已经从 TryRevive 服务端刷新；只有签名回调确认的付款才会入账。";
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "无法刷新云端余额";
  } finally {
    busy.value = false;
  }
}

async function chooseFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  if (file.size > MAX_CLOUD_SOURCE_BYTES) {
    error.value = "单个附件不能超过 25 MB。";
    return;
  }
  try {
    const mimeType = normalizeCloudMimeType(file.name, file.type);
    const isAudio = isCloudAudioFile(file.name, file.type);
    const durationSeconds = isAudio ? await audioDuration(file) : null;
    source.value = {
      metadata: {
        kind: isAudio ? "audio" : "attachment",
        name: file.name,
        mimeType,
        sizeBytes: file.size,
        durationSeconds
      },
      bytes: new Uint8Array(await file.arrayBuffer())
    };
    error.value = "";
    notice.value = "文件仍在本机；查看报价不会上传文件内容。";
    clearQuote();
  } catch {
    error.value = isCloudAudioFile(file.name, file.type)
      ? "无法确认这段音频的时长，请改用现场录音或其他附件。"
      : "无法读取这个附件。";
  }
}

function releaseMicrophone(): void {
  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaStream = null;
  recorder = null;
  if (recordingTimer) clearInterval(recordingTimer);
  recordingTimer = null;
  recording.value = false;
}

async function toggleRecording(): Promise<void> {
  if (recording.value) {
    recorder?.stop();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    error.value = "当前设备无法录制语音，请改用附件或手动填写。";
    return;
  }
  error.value = "";
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioChunks = [];
    const preferredType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    recorder = new MediaRecorder(mediaStream, { mimeType: preferredType });
    recorder.ondataavailable = (event) => {
      if (event.data.size) audioChunks.push(event.data);
    };
    recorder.onstop = async () => {
      const durationSeconds = Math.max(1, Math.ceil((Date.now() - recordingStartedAt) / 1000));
      const blob = new Blob(audioChunks, { type: recorder?.mimeType || "audio/webm" });
      source.value = {
        metadata: {
          kind: "audio",
          name: `项目说明-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.webm`,
          mimeType: blob.type || "audio/webm",
          sizeBytes: blob.size,
          durationSeconds
        },
        bytes: new Uint8Array(await blob.arrayBuffer())
      };
      notice.value = "录音已经停止并留在本机；查看报价不会上传录音内容。";
      clearQuote();
      releaseMicrophone();
    };
    recorder.start(1000);
    recordingStartedAt = Date.now();
    recordingSeconds.value = 0;
    recording.value = true;
    recordingTimer = setInterval(() => {
      recordingSeconds.value = Math.floor((Date.now() - recordingStartedAt) / 1000);
      if (recordingSeconds.value >= 10 * 60) recorder?.stop();
    }, 1000);
  } catch {
    releaseMicrophone();
    error.value = "没有获得麦克风权限；你仍可选择附件或手动填写。";
  }
}

async function requestQuote(): Promise<void> {
  if (!source.value) return;
  busy.value = true;
  error.value = "";
  try {
    quote.value = await platform.quoteCloudContext(plainSourcePayload().metadata);
    notice.value = "报价只发送通用来源类型、大小和语音时长；真实文件名和内容仍未上传。";
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "无法取得本次报价";
  } finally {
    busy.value = false;
  }
}

async function confirmUpload(): Promise<void> {
  if (!source.value || !quote.value || !quote.value.canAfford) return;
  busy.value = true;
  error.value = "";
  try {
    const sourceKind = source.value.metadata.kind === "audio" ? "voice" : "material";
    const result = await platform.analyzeCloudContext({
      idempotencyKey: idempotencyKey || crypto.randomUUID(),
      quoteId: quote.value.id,
      projectTitle: props.projectTitle.trim() || "待恢复项目",
      source: plainSourcePayload()
    });
    await acceptAnalysisResult(
      result,
      sourceKind,
      sourceKind === "voice" ? "" : source.value.metadata.name
    );
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "云端分析失败";
    recoveryPending.value = true;
  } finally {
    busy.value = false;
  }
}

async function persistCurrentDraft(): Promise<void> {
  if (!draft.value) return;
  if (!props.persistDraft) throw new Error("当前入口没有配置恢复草稿保存目标");
  const parsed = ProjectAnalysisSchema.safeParse(draft.value);
  if (!parsed.success) {
    error.value = "这份恢复草稿缺少必要内容，请补全后再继续。";
    return;
  }
  error.value = "";
  const sourceKind =
    draftSourceKind.value ?? (source.value?.metadata.kind === "audio" ? "voice" : "material");
  await props.persistDraft(
    parsed.data,
    sourceKind,
    draftTitleHint.value || (sourceKind === "voice" ? "" : (source.value?.metadata.name ?? "")),
    draftOperationId.value
  );
  if (draftOperationId.value) {
    try {
      await platform.clearCloudAnalysisCheckpoint(draftOperationId.value);
    } catch {
      notice.value =
        "恢复草稿已经安全保存到本机；旧检查点将在下次进入时继续清理，不会重复创建项目。";
    }
  }
}

async function retryRecovery(): Promise<void> {
  busy.value = true;
  error.value = "";
  try {
    await recoverPendingAnalysis();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "暂时无法检查上次云端处理结果";
  } finally {
    busy.value = false;
  }
}

async function retryPersistDraft(): Promise<void> {
  busy.value = true;
  error.value = "";
  try {
    await persistCurrentDraft();
    recoveryPending.value = false;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "恢复草稿仍然无法保存到本机";
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  if (expanded.value) void loadStatus();
});

onBeforeUnmount(() => {
  if (recorder?.state === "recording") recorder.stop();
  releaseMicrophone();
});
</script>

<template>
  <section class="mb-7 rounded-2xl border border-[var(--line)] bg-white/45 p-4 sm:p-5">
    <div class="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
      <div>
        <p class="summary-label">
          {{ isIntake ? "语音或常见附件" : "可选 · 云端算力与数据" }}
        </p>
        <h2 class="mt-2 text-base font-semibold">
          {{ isIntake ? "说一段话，或上传现有材料" : "查看余额、补充算力或退出账户" }}
        </h2>
        <p class="mt-1 text-xs leading-5 text-[var(--muted)]">
          不需要 API Key。只有确认报价后才上传；也可以继续手动填写。
        </p>
      </div>
      <button v-if="!isIntake" class="secondary-button shrink-0" type="button" @click="toggle">
        {{ expanded ? "收起云端入口" : "查看云端入口" }}
      </button>
    </div>

    <div v-if="expanded" class="mt-5 border-t border-[var(--line)] pt-5">
      <p v-if="busy && !status" class="text-sm text-[var(--muted)]" role="status">
        正在检查云端服务…
      </p>

      <div v-else-if="status && !status.available" class="rounded-xl bg-black/[0.035] p-4">
        <strong class="text-sm">当前不会上传任何内容</strong>
        <p class="mt-2 text-sm leading-6 text-[var(--muted)]">{{ status.message }}</p>
        <button
          v-if="status.authenticated"
          class="text-button mt-3"
          type="button"
          :disabled="busy || recoveryPending"
          @click="disconnectAccount"
        >
          退出这台设备的云端算力
        </button>
      </div>

      <form
        v-else-if="status && !status.authenticated"
        class="rounded-xl bg-black/[0.035] p-4"
        @submit.prevent="redeem"
      >
        <label class="field-label" for="cloud-code">算力兑换码</label>
        <p class="mb-3 text-xs leading-5 text-[var(--muted)]">
          这里填写的是购买后获得的 TryRevive 算力码，不是任何模型 API Key。
        </p>
        <div class="flex flex-col gap-2 sm:flex-row">
          <input
            id="cloud-code"
            v-model="redeemCode"
            class="field-input"
            maxlength="80"
            autocomplete="off"
            placeholder="输入算力兑换码"
          />
          <button class="secondary-button shrink-0" type="submit" :disabled="busy">
            {{ busy ? "正在兑换…" : "兑换算力" }}
          </button>
        </div>
      </form>

      <div v-else-if="status?.authenticated" class="space-y-4">
        <div class="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <p class="text-xs font-semibold text-[var(--focus)]">{{ balanceLabel }}</p>
          <button
            class="text-button shrink-0"
            type="button"
            :disabled="busy || recoveryPending"
            @click="disconnectAccount"
          >
            退出云端算力
          </button>
        </div>

        <form class="rounded-xl bg-black/[0.025] p-3" @submit.prevent="redeem">
          <label class="field-label" for="cloud-top-up-code">补充算力兑换码</label>
          <div class="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="cloud-top-up-code"
              v-model="redeemCode"
              class="field-input"
              maxlength="80"
              autocomplete="off"
              placeholder="输入新的 TryRevive 算力码"
            />
            <button class="secondary-button shrink-0" type="submit" :disabled="busy">
              {{ busy ? "正在处理…" : "补充到当前账户" }}
            </button>
          </div>
        </form>

        <div v-if="status.paymentAvailable" class="rounded-xl bg-black/[0.025] p-3">
          <div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p class="field-label">购买 TryRevive 算力</p>
              <p class="mt-1 text-xs leading-5 text-[var(--muted)]">
                付款由 Stripe 页面完成；返回页面不能自行增加额度，只有签名回调可以入账。
              </p>
            </div>
            <button
              v-if="!paymentCatalog"
              class="secondary-button shrink-0"
              type="button"
              :disabled="busy"
              @click="loadPaymentPackages"
            >
              查看可购买算力
            </button>
          </div>
          <div v-if="paymentCatalog" class="mt-3 space-y-2">
            <p
              v-if="paymentCatalog.mode === 'test'"
              class="rounded-lg bg-[var(--danger)]/10 px-3 py-2 text-xs text-[var(--danger)]"
              role="status"
            >
              当前是 Stripe 测试环境，不会收取真实款项。
            </p>
            <button
              v-for="item in paymentCatalog.packages"
              :key="item.id"
              class="project-row w-full"
              type="button"
              :disabled="busy"
              @click="purchasePackage(item.id)"
            >
              <span class="min-w-0 text-left">
                <strong class="block text-sm">{{ item.name }}</strong>
                <small class="mt-1 block text-xs text-[var(--muted)]">
                  {{ item.speechMinutes }} 分钟语音 · {{ item.projectAnalyses }} 次项目理解
                </small>
              </span>
              <strong class="shrink-0 text-sm">{{
                formatMoney(item.amount, item.currency)
              }}</strong>
            </button>
            <button
              class="text-button"
              type="button"
              :disabled="busy"
              @click="refreshBalanceAfterPayment"
            >
              付款后刷新余额
            </button>
          </div>
        </div>

        <div v-if="!accountOnly && !source && !recoveryPending" class="grid gap-3 sm:grid-cols-2">
          <button
            class="secondary-button"
            :class="{ 'voice-button-active': recording }"
            type="button"
            :disabled="busy"
            @click="toggleRecording"
          >
            {{ recording ? `停止录音 · ${recordingSeconds}s` : "录一段项目说明" }}
          </button>
          <button class="secondary-button" type="button" @click="fileInput?.click()">
            选择项目附件
          </button>
          <input
            ref="fileInput"
            class="sr-only"
            type="file"
            accept=".pdf,.doc,.docx,.rtf,.odt,.txt,.md,.json,.html,.xml,.csv,.xls,.xlsx,.ppt,.pptx,.mp3,.mp4,.mpeg,.mpga,.m4a,.wav,.webm"
            @change="chooseFile"
          />
        </div>

        <div v-else-if="source" class="rounded-xl border border-[var(--line)] bg-white/55 p-4">
          <div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div class="min-w-0">
              <strong class="block truncate text-sm">{{ source.metadata.name }}</strong>
              <span class="mt-1 block text-xs text-[var(--muted)]">
                {{ formatSourceType(source) }}
              </span>
              <span class="mt-1 block text-xs text-[var(--muted)]">
                {{ formatBytes(source.metadata.sizeBytes) }}
                <template v-if="source.metadata.durationSeconds">
                  · {{ source.metadata.durationSeconds }} 秒
                </template>
              </span>
            </div>
            <button
              class="text-button shrink-0"
              type="button"
              @click="
                source = null;
                clearQuote();
              "
            >
              换一个
            </button>
          </div>
          <button
            v-if="!quote"
            class="secondary-button mt-4 w-full"
            type="button"
            :disabled="busy"
            @click="requestQuote"
          >
            {{ busy ? "正在计算…" : "查看预计消耗（不上传内容）" }}
          </button>
        </div>

        <div
          v-if="quote && !draft"
          class="rounded-xl border border-[var(--focus)]/20 bg-[var(--focus)]/[0.045] p-4"
        >
          <p class="summary-label">上传确认</p>
          <p class="mt-3 text-sm leading-6">{{ quote.uploadNotice }}</p>
          <p class="mt-2 text-xs leading-5 text-[var(--muted)]">{{ quote.retentionNotice }}</p>
          <dl class="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div class="summary-card">
              <dt class="text-xs text-[var(--muted)]">语音理解</dt>
              <dd class="mt-1 font-semibold">{{ quote.cost.speechMinutes }} 分钟</dd>
            </div>
            <div class="summary-card">
              <dt class="text-xs text-[var(--muted)]">项目理解</dt>
              <dd class="mt-1 font-semibold">{{ quote.cost.projectAnalyses }} 次</dd>
            </div>
          </dl>
          <p v-if="!quote.canAfford" class="form-error mt-3" role="alert">
            当前余额不足，因此不会上传。请先补充算力。
          </p>
          <button
            class="primary-button mt-4 w-full"
            type="button"
            :disabled="busy || recoveryPending || !quote.canAfford"
            @click="confirmUpload"
          >
            {{ busy ? "正在理解，先不要关闭…" : "确认上传并生成草稿" }}
          </button>
        </div>

        <div v-if="draft" class="space-y-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div>
            <p class="summary-label">恢复草稿已生成，但还没有保存到本机</p>
            <p class="mt-2 text-sm leading-6 text-[var(--muted)]">
              不会再次扣除本次分析次数。请重试本地保存，再进入“正确／修改”。
            </p>
          </div>
          <button
            class="primary-button w-full"
            type="button"
            :disabled="busy"
            @click="retryPersistDraft"
          >
            重新保存并查看恢复判断
          </button>
        </div>
      </div>

      <div v-if="recoveryPending" class="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
        <p class="summary-label">上次云端任务还需要对账</p>
        <p class="mt-2 text-sm leading-6 text-[var(--muted)]">
          不会重复上传或再次预留。请检查上次结果；处理中可稍后再试，失败或过期会显示退款状态。
        </p>
        <button
          class="secondary-button mt-3 w-full"
          type="button"
          :disabled="busy"
          @click="retryRecovery"
        >
          {{ busy ? "正在检查…" : "检查上次处理结果" }}
        </button>
      </div>

      <p v-if="notice" class="mt-3 text-xs leading-5 text-[var(--muted)]" role="status">
        {{ notice }}
      </p>
      <p v-if="error" class="form-error mt-3" role="alert">{{ error }}</p>
    </div>
  </section>
</template>
