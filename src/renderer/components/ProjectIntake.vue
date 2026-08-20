<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import { useRevivalStore } from "@/renderer/stores/revival";
import {
  startLocalSpeechRecording,
  type LocalSpeechRecording
} from "@/renderer/audio/local-speech-recorder";
import { parseProjectDump } from "@/shared/domain/intake";
import { readLocalMaterials, type LocalMaterialBundle } from "@/shared/domain/local-materials";
import { summarizeWebMaterialSource } from "@/shared/domain/web-source";
import type { ProjectAnalysis } from "@/shared/domain/model";
import type {
  RepositoryDiscoveryCandidate,
  RepositoryDiscoveryResult
} from "@/shared/domain/repository-discovery";
import { MAX_LOCAL_SPEECH_SECONDS } from "@/shared/speech/contracts";
import CloudContextAssist from "@/renderer/components/CloudContextAssist.vue";
import { platform } from "@/renderer/platform/web";

const store = useRevivalStore();
const context = ref("");
const intakeMode = ref<"decide" | "direct">("decide");
const directTitle = ref("");
const directAction = ref("");
const directDoneDefinition = ref("");
const directMinutes = ref(10);
const sourceUrl = ref("");
const projectNames = ref("");
const busy = ref(false);
const error = ref("");
const fileInput = ref<HTMLInputElement | null>(null);
const contextInput = ref<HTMLTextAreaElement | null>(null);
const localMaterials = ref<LocalMaterialBundle | null>(null);
const repositoryDiscovery = ref<Exclude<RepositoryDiscoveryResult, { canceled: true }> | null>(
  null
);
const selectedCandidateId = ref("");
const contextSourceKind = ref<"text" | "voice">("text");
const speechCulture = ref<"zh-CN" | "en-US">("zh-CN");
const speechPhase = ref<"idle" | "requesting" | "recording" | "transcribing">("idle");
const speechStatus = ref(
  "Windows 桌面版使用随应用打包的离线语音模型；无需 API Key，也不会发送给 tryrevive 后端或 OpenAI。中文转写会统一显示为简体。"
);
const speechSeconds = ref(0);
const parsedProjectNames = computed(() => parseProjectDump(projectNames.value));
const localAnalysisLabel = computed(() => {
  const count = localMaterials.value?.materials.length ?? 0;
  return count ? `从 ${count} 份材料生成待确认草稿` : "让 tryrevive 先整理一份草稿";
});
let speechRecording: LocalSpeechRecording | null = null;
let speechAbort: AbortController | null = null;
let speechTimer: ReturnType<typeof setInterval> | null = null;
let speechGeneration = 0;

function stopSpeechTimer(): void {
  if (speechTimer) clearInterval(speechTimer);
  speechTimer = null;
}

async function cancelLocalSpeech(): Promise<void> {
  speechGeneration += 1;
  speechAbort?.abort();
  speechAbort = null;
  stopSpeechTimer();
  const active = speechRecording;
  speechRecording = null;
  await active?.cancel();
  speechPhase.value = "idle";
}

async function finishLocalSpeech(): Promise<void> {
  const active = speechRecording;
  if (!active || speechPhase.value !== "recording") return;
  const generation = speechGeneration;
  speechRecording = null;
  stopSpeechTimer();
  speechPhase.value = "transcribing";
  busy.value = true;
  error.value = "";
  speechStatus.value = "正在使用 tryrevive 离线语音模型转写；录音不会离开这台电脑…";
  try {
    const bytes = await active.stop();
    const result = await platform.transcribeLocalSpeech({ bytes, culture: speechCulture.value });
    if (generation !== speechGeneration) return;
    const transcript = result.transcript.trim();
    context.value = [context.value.trim(), transcript]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 20_000);
    contextSourceKind.value = "voice";
    speechStatus.value =
      "转写已放到下方输入框。请先检查或修改文字，再点击“生成待确认草稿”；现在还没有创建项目。";
    await nextTick();
    contextInput.value?.focus();
    contextInput.value?.setSelectionRange(context.value.length, context.value.length);
  } catch (caught) {
    if (generation !== speechGeneration) return;
    error.value = caught instanceof Error ? caught.message : "本机语音转写失败";
    speechStatus.value = "录音没有保存；你仍可直接修改文字或选择本地材料。";
  } finally {
    if (generation === speechGeneration) {
      speechPhase.value = "idle";
      busy.value = false;
    }
  }
}

async function toggleLocalSpeech(): Promise<void> {
  if (speechPhase.value === "recording") {
    await finishLocalSpeech();
    return;
  }
  if (speechPhase.value !== "idle" || busy.value) return;

  const generation = ++speechGeneration;
  speechAbort = new AbortController();
  speechPhase.value = "requesting";
  error.value = "";
  speechStatus.value = "正在检查 Windows 中文语音引擎并请求麦克风权限…";
  try {
    const capability = await platform.localSpeechCapability();
    if (generation !== speechGeneration) return;
    if (!capability.available) throw new Error(capability.message);
    const recording = await startLocalSpeechRecording(speechAbort.signal);
    if (generation !== speechGeneration) {
      await recording.cancel();
      return;
    }
    speechRecording = recording;
    speechSeconds.value = 0;
    speechPhase.value = "recording";
    speechStatus.value = `正在本机录音。请说：最初目标、做到哪里、卡在哪里；最长 ${MAX_LOCAL_SPEECH_SECONDS} 秒。`;
    speechTimer = setInterval(() => {
      speechSeconds.value += 1;
      if (speechSeconds.value >= MAX_LOCAL_SPEECH_SECONDS) void finishLocalSpeech();
    }, 1_000);
  } catch (caught) {
    if (generation !== speechGeneration) return;
    speechPhase.value = "idle";
    error.value =
      caught instanceof DOMException && caught.name === "NotAllowedError"
        ? "没有获得麦克风权限；你仍可直接输入文字或选择本地材料。"
        : caught instanceof Error
          ? caught.message
          : "无法开始本机语音";
    speechStatus.value = "没有开始录音，也没有保存或上传任何声音。";
  }
}

async function chooseRepository(): Promise<void> {
  busy.value = true;
  error.value = "";
  try {
    await store.inferRepository();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "项目文件夹扫描失败";
  } finally {
    busy.value = false;
  }
}

async function discoverRepositories(): Promise<void> {
  busy.value = true;
  error.value = "";
  repositoryDiscovery.value = null;
  try {
    const result = await platform.discoverRepositories();
    if (!result.canceled) repositoryDiscovery.value = result;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "本机项目候选查找失败";
  } finally {
    busy.value = false;
  }
}

async function chooseDiscoveredRepository(candidate: RepositoryDiscoveryCandidate): Promise<void> {
  const discovery = repositoryDiscovery.value;
  if (!discovery) return;
  busy.value = true;
  selectedCandidateId.value = candidate.id;
  error.value = "";
  try {
    await store.inferDiscoveredRepository({
      sessionId: discovery.sessionId,
      candidateId: candidate.id
    });
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "候选项目安全扫描失败";
  } finally {
    selectedCandidateId.value = "";
    busy.value = false;
  }
}

async function startDirectAction(): Promise<void> {
  busy.value = true;
  error.value = "";
  try {
    await store.createDirectActionAndRequestFocus({
      title: directTitle.value,
      text: directAction.value,
      doneDefinition: directDoneDefinition.value,
      minutes: directMinutes.value
    });
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "这一步暂时无法保存";
  } finally {
    busy.value = false;
  }
}

async function importMaterials(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = "";
  if (!files.length) return;
  busy.value = true;
  error.value = "";
  try {
    localMaterials.value = await readLocalMaterials(files);
  } catch (caught) {
    localMaterials.value = null;
    error.value = caught instanceof Error ? caught.message : "无法读取这些文字材料";
  } finally {
    busy.value = false;
  }
}

function clearLocalMaterials(): void {
  localMaterials.value = null;
  error.value = "";
}

async function analyzeContext(): Promise<void> {
  const manualContext = context.value.trim();
  const materialBundle = localMaterials.value;
  const content = [manualContext, materialBundle?.content ?? ""].filter(Boolean).join("\n\n");
  let webSource: ReturnType<typeof summarizeWebMaterialSource>;
  try {
    webSource = summarizeWebMaterialSource(sourceUrl.value);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "网页链接格式不正确";
    return;
  }
  if (content.length < 4) {
    error.value = webSource
      ? "tryrevive 目前不会只靠链接读取登录页或未提交表单。请把页面要求和你已填写的内容粘贴到下方，再生成草稿。"
      : "至少写一句项目现场，或选择一份本地文字材料。";
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    await store.inferLocalContext({
      content,
      sourceKind: materialBundle || webSource ? "material" : contextSourceKind.value,
      sourceLabel:
        materialBundle?.sourceLabel ??
        webSource?.sourceLabel ??
        (contextSourceKind.value === "voice" ? "tryrevive 离线语音转写（已由你检查）" : "主动输入"),
      titleHint: materialBundle?.titleHint
    });
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "暂时无法理解这段内容";
  } finally {
    busy.value = false;
  }
}

async function acceptCloudAnalysis(
  analysis: ProjectAnalysis,
  sourceKind: "material" | "voice",
  titleHint: string
): Promise<void> {
  busy.value = true;
  error.value = "";
  try {
    await store.inferProvidedAnalysis({ analysis, sourceKind, titleHint });
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "云端恢复草稿保存失败";
  } finally {
    busy.value = false;
  }
}

async function collectProjectNames(): Promise<void> {
  if (!parsedProjectNames.value.length) {
    error.value = "先写下至少一个项目名称。";
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    await store.newProjects(parsedProjectNames.value);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "项目入口保存失败";
  } finally {
    busy.value = false;
  }
}

onBeforeUnmount(() => {
  void cancelLocalSpeech();
});
</script>

<template>
  <section class="intake-stage" aria-labelledby="intake-title">
    <div class="intake-copy">
      <p class="eyebrow">重新接上一个真实项目</p>
      <h1 id="intake-title" class="intake-title">先把现场交给 tryrevive。</h1>
      <p class="intake-description">
        选择项目文件夹、上传常见附件、说一段话，或写下你记得的内容。tryrevive
        会先猜“你做到这里”，由你点正确或修改。
      </p>
      <div class="intake-principles" aria-label="理解边界">
        <span>确认前不创建正式项目</span>
        <span>不执行仓库代码</span>
        <span>不把猜测写成事实</span>
      </div>
    </div>

    <div class="intake-path-switch" role="group" aria-label="选择进入方式">
      <button
        :class="['intake-path-option', { selected: intakeMode === 'decide' }]"
        type="button"
        :aria-pressed="intakeMode === 'decide'"
        @click="intakeMode = 'decide'"
      >
        <strong>我不确定，先帮我判断</strong>
        <span>从材料恢复现场，再由 tryrevive 推荐继续、缩小、求助、暂停或放弃。</span>
      </button>
      <button
        :class="['intake-path-option', { selected: intakeMode === 'direct' }]"
        type="button"
        :aria-pressed="intakeMode === 'direct'"
        @click="intakeMode = 'direct'"
      >
        <strong>我已经知道下一步，直接开始</strong>
        <span>不读取材料、不判断值不值得，保存你定义的一小步后直接进入专注。</span>
      </button>
    </div>

    <div class="intake-console space-y-6">
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>

      <form
        v-if="intakeMode === 'direct'"
        class="space-y-5 rounded-3xl border border-[var(--line)] bg-white/60 p-5 sm:p-7"
        @submit.prevent="startDirectAction"
      >
        <div>
          <p class="field-label">直接定义这一小步</p>
          <p class="field-help">
            这里不做项目价值判断，也不读取任何文件。行动保存成功后仍需按住 0.8 秒落针才会开始计时。
          </p>
        </div>
        <label class="block">
          <span class="field-label">项目名称</span>
          <input
            v-model="directTitle"
            class="field-input mt-2"
            maxlength="80"
            required
            placeholder="例如：申请黑客松"
          />
        </label>
        <label class="block">
          <span class="field-label">现在只做什么</span>
          <textarea
            v-model="directAction"
            class="field-input mt-2 min-h-24 resize-y"
            maxlength="240"
            required
            placeholder="例如：填写报名表中的项目简介"
          />
        </label>
        <label class="block">
          <span class="field-label">做到什么状态算完成</span>
          <textarea
            v-model="directDoneDefinition"
            class="field-input mt-2 min-h-20 resize-y"
            maxlength="240"
            required
            placeholder="例如：项目简介已保存为一份可继续修改的草稿"
          />
        </label>
        <label class="block">
          <span class="field-label">时间盒</span>
          <select v-model.number="directMinutes" class="field-input mt-2">
            <option :value="5">5 分钟</option>
            <option :value="10">10 分钟</option>
            <option :value="15">15 分钟</option>
            <option :value="20">20 分钟</option>
          </select>
        </label>
        <button class="primary-button w-full" type="submit" :disabled="busy">
          {{ busy ? "正在保存这一小步…" : "保存并进入专注" }}
        </button>
      </form>

      <template v-else>
        <section class="rounded-3xl border border-[var(--line)] bg-white/55 p-5 sm:p-6">
          <p class="field-label">从项目文件夹恢复</p>
          <p class="field-help">
            桌面版只读扫描最多 180
            个可读文件；跳过依赖、构建产物、隐藏目录、凭据和大文件，不运行任何脚本。
          </p>
          <p
            class="mt-3 rounded-2xl bg-black/[0.035] px-4 py-3 text-sm leading-6 text-[var(--muted)]"
          >
            如果只知道项目可能在 C 盘、D
            盘、桌面或一个大文件夹里，先用“查找候选项目”。这一步只看目录名、通用项目标记和修改时间，不读正文；选中一个候选后才进行有限深读。
          </p>
          <div class="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              class="primary-button w-full"
              type="button"
              :disabled="busy || store.platformKind !== 'desktop'"
              @click="discoverRepositories"
            >
              {{ busy ? "正在本机查找…" : "从 C／D 盘或大文件夹找项目" }}
            </button>
            <button
              class="secondary-button w-full"
              type="button"
              :disabled="busy || store.platformKind !== 'desktop'"
              @click="chooseRepository"
            >
              {{ busy ? "正在有限扫描…" : "我知道具体项目文件夹" }}
            </button>
          </div>
          <p v-if="store.platformKind !== 'desktop'" class="mt-3 text-xs text-[var(--muted)]">
            网页版不能读取文件夹；可以上传文字材料或直接输入。
          </p>
          <div
            v-if="repositoryDiscovery"
            class="mt-4 rounded-2xl border border-[var(--line)] bg-white/70 p-4"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="field-label">{{ repositoryDiscovery.scopeLabel }} 里的候选项目</p>
                <p class="mt-1 text-xs leading-5 text-[var(--muted)]">
                  只依据名称和元数据找到
                  {{ repositoryDiscovery.candidates.length }} 个候选；没有读取文件正文。
                </p>
              </div>
              <button class="text-button" type="button" @click="repositoryDiscovery = null">
                收起
              </button>
            </div>
            <ul v-if="repositoryDiscovery.candidates.length" class="repository-candidate-list">
              <li v-for="candidate in repositoryDiscovery.candidates" :key="candidate.id">
                <div>
                  <strong>{{ candidate.displayName }}</strong>
                  <span>{{ candidate.relativeLocation }}</span>
                  <small>{{ candidate.markers.join(" · ") }}</small>
                </div>
                <button
                  class="secondary-button"
                  type="button"
                  :disabled="busy"
                  @click="chooseDiscoveredRepository(candidate)"
                >
                  {{ selectedCandidateId === candidate.id ? "正在安全读取…" : "读取这个项目" }}
                </button>
              </li>
            </ul>
            <p v-else class="mt-4 text-sm leading-6 text-[var(--muted)]">
              这次没有发现带通用项目标记的文件夹。可以改选更具体的范围，或切换到“直接开始”。
            </p>
            <p
              v-if="repositoryDiscovery.boundary.truncated"
              class="mt-3 text-xs leading-5 text-[var(--muted)]"
            >
              查找达到时间或数量上限，结果不完整；这不代表其他文件夹里没有项目。
            </p>
          </div>
        </section>

        <CloudContextAssist
          presentation="intake"
          :initially-expanded="true"
          :persist-draft="acceptCloudAnalysis"
        />

        <form class="space-y-4" @submit.prevent="analyzeContext">
          <div class="intake-toolbar">
            <div>
              <label class="field-label" for="project-context">本地文字材料或你记得的内容</label>
              <p class="field-help">最好包含：最初目标、上次做到哪里、现在卡在哪里。</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <label class="speech-language-control">
                <span>语音语言</span>
                <select
                  v-model="speechCulture"
                  class="speech-language-select"
                  :disabled="busy || speechPhase !== 'idle'"
                  aria-label="语音识别语言"
                >
                  <option value="zh-CN">简体中文</option>
                  <option value="en-US">English</option>
                </select>
              </label>
              <button
                class="secondary-button voice-button"
                :class="{ 'voice-button-active': speechPhase === 'recording' }"
                type="button"
                :aria-pressed="speechPhase === 'recording'"
                :disabled="busy || speechPhase === 'requesting' || speechPhase === 'transcribing'"
                @click="toggleLocalSpeech"
              >
                <span class="voice-dot" aria-hidden="true" />
                <template v-if="speechPhase === 'recording'">
                  停止并转写 {{ speechSeconds }} 秒
                </template>
                <template v-else-if="speechPhase === 'requesting'">正在请求麦克风…</template>
                <template v-else-if="speechPhase === 'transcribing'">正在本机转写…</template>
                <template v-else>用 Windows 本机语音说</template>
              </button>
              <button
                class="secondary-button"
                type="button"
                :disabled="busy || speechPhase !== 'idle'"
                @click="fileInput?.click()"
              >
                选择本地材料
              </button>
              <input
                ref="fileInput"
                class="sr-only"
                type="file"
                multiple
                accept="text/plain,text/markdown,text/csv,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.txt,.md,.csv,.json,.yaml,.yml,.pdf,.docx"
                @change="importMaterials"
              />
            </div>
          </div>

          <p class="voice-status" aria-live="polite">{{ speechStatus }}</p>

          <div class="rounded-2xl border border-[var(--line)] bg-white/45 p-4">
            <label class="field-label" for="source-url">网页或飞书链接（可选）</label>
            <input
              id="source-url"
              v-model="sourceUrl"
              class="field-input mt-2"
              inputmode="url"
              maxlength="2048"
              placeholder="https://example.com/hackathon/apply"
            />
            <p class="mt-2 text-xs leading-5 text-[var(--muted)]">
              当前不会自动登录或读取未提交表单。请把页面要求、截止时间和你已经填写的内容复制到下方；也可以从飞书导出
              PDF/DOCX 后上传。草稿只保存站点名，不保存链接里的查询参数或邀请 token。
            </p>
          </div>

          <div
            v-if="localMaterials"
            class="rounded-2xl border border-[var(--focus)]/20 bg-[var(--focus)]/[0.045] p-4"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="field-label">将在本机读取的材料</p>
                <ul class="mt-2 space-y-1 text-sm leading-6 text-[var(--ink)]">
                  <li
                    v-for="(item, index) in localMaterials.materials"
                    :key="`${item.name}-${index}`"
                  >
                    {{ item.name }} · {{ item.characters.toLocaleString("zh-CN") }} 字
                  </li>
                </ul>
              </div>
              <button class="text-button shrink-0" type="button" @click="clearLocalMaterials">
                清除
              </button>
            </div>
            <p class="mt-3 text-xs leading-5 text-[var(--muted)]">
              原文不会写入存档；会保存生成的待确认摘要，只有你确认后才创建正式项目。
            </p>
          </div>

          <textarea
            id="project-context"
            ref="contextInput"
            v-model="context"
            class="field-input intake-textarea"
            maxlength="20000"
            autofocus
            placeholder="我想完成 tryrevive 桌面版。上次已经接好 Vue 页面，现在卡在不知道怎样把仓库现状变成下一小步。"
          />
          <p class="voice-status">
            本机支持 TXT、Markdown、CSV、JSON、YAML、可复制文字的 PDF 和 DOCX，一次最多 8
            份；不会发送给 tryrevive 后端或
            OpenAI。一次请选择属于同一个项目的材料；多个项目请逐个恢复。扫描图片不会
            OCR；音频文件不会冒充已理解，只有你主动点击上方本机语音并确认麦克风权限才会转写。
          </p>
          <button
            class="primary-button w-full"
            type="submit"
            :disabled="busy || speechPhase !== 'idle'"
          >
            {{ busy ? "正在整理恢复摘要…" : localAnalysisLabel }}
          </button>
        </form>

        <details class="rounded-3xl border border-[var(--line)] p-5">
          <summary class="cursor-pointer text-sm font-semibold text-[var(--ink)]">
            只先收纳多个项目名称
          </summary>
          <form class="mt-5 space-y-4" @submit.prevent="collectProjectNames">
            <div>
              <label class="field-label" for="project-names">所有还在心里的项目</label>
              <p class="field-help">保留原来的快速收纳方式；每行一个，之后再逐个补现场。</p>
            </div>
            <textarea
              id="project-names"
              v-model="projectNames"
              class="field-input min-h-28 resize-y"
              maxlength="4000"
              placeholder="申请黑客松&#10;报名英语考试&#10;整理作品集"
            />
            <p v-if="parsedProjectNames.length" class="text-sm text-[var(--muted)]">
              识别到 {{ parsedProjectNames.length }} 个项目
            </p>
            <button class="secondary-button w-full" type="submit" :disabled="busy">
              {{ busy ? "正在保存…" : `收下这 ${parsedProjectNames.length || 0} 个项目` }}
            </button>
          </form>
        </details>
      </template>
    </div>
  </section>
</template>
