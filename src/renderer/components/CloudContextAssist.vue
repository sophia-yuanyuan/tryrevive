<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { ProjectAnalysisSchema, type ProjectAnalysis } from "@/shared/domain/model";
import type { CloudQuote, CloudSourcePayload, CloudStatus } from "@/shared/cloud/contracts";
import { MAX_CLOUD_SOURCE_BYTES } from "@/shared/cloud/contracts";
import { isCloudAudioFile, normalizeCloudMimeType } from "@/shared/cloud/intake-security";
import { platform } from "@/renderer/platform/web";

const props = withDefaults(
  defineProps<{
    projectTitle?: string;
    initiallyExpanded?: boolean;
    presentation?: "embedded" | "intake";
  }>(),
  {
    projectTitle: "",
    initiallyExpanded: false,
    presentation: "embedded"
  }
);
const emit = defineEmits<{
  accepted: [analysis: ProjectAnalysis, sourceKind: "material" | "voice", titleHint: string];
}>();

const expanded = ref(props.initiallyExpanded);
const status = ref<CloudStatus | null>(null);
const source = ref<CloudSourcePayload | null>(null);
const quote = ref<CloudQuote | null>(null);
const draft = ref<ProjectAnalysis | null>(null);
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

function clearQuote(): void {
  quote.value = null;
  draft.value = null;
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
    status.value = await platform.cloudStatus();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "无法退出云端算力";
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
    const result = await platform.analyzeCloudContext({
      idempotencyKey: idempotencyKey || crypto.randomUUID(),
      quoteId: quote.value.id,
      projectTitle: props.projectTitle.trim() || "待恢复项目",
      source: plainSourcePayload()
    });
    draft.value = result.draft;
    status.value = {
      ...(status.value ?? {
        available: true,
        authenticated: true,
        secureSessionStorage: true,
        message: ""
      }),
      balance: result.balance,
      message: "云端分析已完成；确认前不会改动本地项目。"
    };
    notice.value = `本次已结算 ${result.charged.speechMinutes} 分钟语音、${result.charged.projectAnalyses} 次项目理解。`;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "云端分析失败";
  } finally {
    busy.value = false;
  }
}

function acceptDraft(): void {
  if (!draft.value || !source.value) return;
  const parsed = ProjectAnalysisSchema.safeParse(draft.value);
  if (!parsed.success) {
    error.value = "这份恢复草稿缺少必要内容，请补全后再继续。";
    return;
  }
  emit(
    "accepted",
    parsed.data,
    source.value.metadata.kind === "audio" ? "voice" : "material",
    source.value.metadata.kind === "audio" ? "" : source.value.metadata.name
  );
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
        <p class="summary-label">{{ isIntake ? "语音或常见附件" : "可选 · 云端理解" }}</p>
        <h2 class="mt-2 text-base font-semibold">
          {{ isIntake ? "说一段话，或上传现有材料" : "把语音或附件整理成一份待确认草稿" }}
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
          :disabled="busy"
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
            :disabled="busy"
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

        <div v-if="!source" class="grid gap-3 sm:grid-cols-2">
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

        <div v-else class="rounded-xl border border-[var(--line)] bg-white/55 p-4">
          <div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div class="min-w-0">
              <strong class="block truncate text-sm">{{ source.metadata.name }}</strong>
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
            :disabled="busy || !quote.canAfford"
            @click="confirmUpload"
          >
            {{ busy ? "正在理解，先不要关闭…" : "确认上传并生成草稿" }}
          </button>
        </div>

        <div
          v-if="draft && isIntake"
          class="space-y-4 rounded-xl border border-[var(--accent)]/25 bg-white/70 p-4"
        >
          <div>
            <p class="summary-label">恢复草稿已生成</p>
            <p class="mt-2 text-sm leading-6 text-[var(--muted)]">
              下一页只需要判断“正确”或“修改”；确认前不会创建正式项目。
            </p>
          </div>
          <button class="primary-button w-full" type="button" @click="acceptDraft">
            查看 TryRevive 的恢复判断
          </button>
        </div>

        <div
          v-if="draft && !isIntake"
          class="space-y-4 rounded-xl border border-[var(--accent)]/25 bg-white/70 p-4"
        >
          <div>
            <p class="summary-label">待你确认的草稿</p>
            <p class="mt-2 text-xs leading-5 text-[var(--muted)]">
              AI 可能理解错。下面每一项都能修改，采用前不会写入项目。
            </p>
          </div>
          <div>
            <label class="field-label" for="draft-goal">最开始的目标</label>
            <textarea id="draft-goal" v-model="draft.originalGoal" class="field-input min-h-20" />
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="field-label" for="draft-completed">上次做到哪里</label>
              <textarea
                id="draft-completed"
                v-model="draft.lastCompleted"
                class="field-input min-h-20"
              />
            </div>
            <div>
              <label class="field-label" for="draft-stuck">现在停在哪里</label>
              <textarea id="draft-stuck" v-model="draft.stuckAt" class="field-input min-h-20" />
            </div>
          </div>
          <div>
            <span class="field-label">可能停滞的原因</span>
            <ul class="space-y-2 text-sm leading-6 text-[var(--ink)]">
              <li v-for="reason in draft.stallReasons" :key="reason">· {{ reason }}</li>
            </ul>
          </div>
          <div class="summary-card">
            <span class="field-label">建议的下一小步</span>
            <textarea v-model="draft.nextAction.text" class="field-input min-h-20" />
            <input v-model="draft.nextAction.doneDefinition" class="field-input mt-2" />
          </div>
          <div v-if="draft.uncertainties.length" class="rounded-xl bg-amber-50 p-3">
            <strong class="text-xs">仍需你确认</strong>
            <ul class="mt-2 space-y-1 text-xs leading-5 text-[var(--muted)]">
              <li v-for="item in draft.uncertainties" :key="item">· {{ item }}</li>
            </ul>
          </div>
          <button class="primary-button w-full" type="button" @click="acceptDraft">
            采用这份草稿，进入项目判断
          </button>
        </div>
      </div>

      <p v-if="notice" class="mt-3 text-xs leading-5 text-[var(--muted)]" role="status">
        {{ notice }}
      </p>
      <p v-if="error" class="form-error mt-3" role="alert">{{ error }}</p>
    </div>
  </section>
</template>
