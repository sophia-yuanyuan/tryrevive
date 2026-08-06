<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { parseProjectDump } from "@/shared/domain/intake";
import { useRevivalStore } from "@/renderer/stores/revival";

const store = useRevivalStore();
const brainDump = ref("");
const busy = ref(false);
const error = ref("");
const voiceStatus = ref("也可以直接说出来；语音只在你主动开启时使用。");
const listening = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
let recognition: SpeechRecognition | null = null;

const projects = computed(() => parseProjectDump(brainDump.value));

function stopListening(): void {
  recognition?.stop();
  recognition = null;
  listening.value = false;
}

function startListening(): void {
  if (listening.value) {
    stopListening();
    return;
  }

  const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!Recognition) {
    voiceStatus.value = "当前设备没有提供可靠的实时语音转写，请使用文字或导入本地文本。";
    return;
  }

  const initialText = brainDump.value.trim();
  recognition = new Recognition();
  recognition.lang = "zh-CN";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.onresult = (event) => {
    let transcript = "";
    for (let index = 0; index < event.results.length; index += 1) {
      transcript += event.results[index]?.[0]?.transcript ?? "";
      if (event.results[index]?.isFinal) transcript += "\n";
    }
    brainDump.value = [initialText, transcript.trim()].filter(Boolean).join("\n");
    voiceStatus.value = "正在把你说的内容转成文字；请检查项目边界是否正确。";
  };
  recognition.onerror = (event) => {
    listening.value = false;
    voiceStatus.value =
      event.error === "not-allowed"
        ? "没有获得麦克风权限。你仍可继续输入文字或导入本地文本。"
        : "语音转写中断了，已经识别出的文字仍保留在这里。";
  };
  recognition.onend = () => {
    listening.value = false;
    recognition = null;
  };

  try {
    recognition.start();
    listening.value = true;
    voiceStatus.value = "正在听。每说完一个项目，请停顿一下。";
  } catch {
    recognition = null;
    voiceStatus.value = "语音入口暂时无法启动，请使用文字或导入本地文本。";
  }
}

async function importText(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  if (file.size > 1024 * 1024) {
    error.value = "文本文件不能超过 1 MB。";
    return;
  }
  try {
    const content = await file.text();
    brainDump.value = [brainDump.value.trim(), content.trim()].filter(Boolean).join("\n");
    error.value = "";
  } catch {
    error.value = "无法读取这个文本文件。";
  }
}

async function submit(): Promise<void> {
  if (!projects.value.length) {
    error.value = "先写下至少一个你还挂念的项目，每行一个。";
    return;
  }
  stopListening();
  busy.value = true;
  error.value = "";
  try {
    await store.newProjects(projects.value);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "项目收纳失败";
  } finally {
    busy.value = false;
  }
}

onBeforeUnmount(stopListening);
</script>

<template>
  <section class="intake-stage" aria-labelledby="intake-title">
    <div class="intake-copy">
      <p class="eyebrow">把脑内项目先放下来</p>
      <h1 id="intake-title" class="intake-title">你不需要先决定从哪一个开始。</h1>
      <p class="intake-description">
        黑客松申请、报名、证书、作品集、没做完的产品——先全部放进来。数据默认留在本机，接下来一次只梳理一个。
      </p>
      <div class="intake-principles" aria-label="收纳原则">
        <span>不要求完整计划</span>
        <span>不替你判断价值</span>
        <span>随时可以暂停或放弃</span>
      </div>
    </div>

    <form class="intake-console" @submit.prevent="submit">
      <div class="intake-toolbar">
        <div>
          <label class="field-label" for="project-dump">所有还在心里的项目</label>
          <p class="field-help">每行一个，也可以用分号隔开。一次最多收纳 20 个。</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            class="secondary-button voice-button"
            :class="{ 'voice-button-active': listening }"
            type="button"
            :aria-pressed="listening"
            @click="startListening"
          >
            <span class="voice-dot" aria-hidden="true" />
            {{ listening ? "停止倾听" : "用语音说" }}
          </button>
          <button class="secondary-button" type="button" @click="fileInput?.click()">
            导入文字
          </button>
          <input
            ref="fileInput"
            class="sr-only"
            type="file"
            accept="text/plain,text/markdown,text/csv,.txt,.md,.csv"
            @change="importText"
          />
        </div>
      </div>

      <textarea
        id="project-dump"
        v-model="brainDump"
        class="field-input intake-textarea"
        maxlength="4000"
        autofocus
        placeholder="申请 AdventureX 黑客松&#10;报名英语考试&#10;完成 TryRevive 桌面版&#10;整理作品集"
      />
      <p class="voice-status" aria-live="polite">{{ voiceStatus }}</p>

      <div v-if="projects.length" class="intake-preview" aria-live="polite">
        <div class="intake-preview-head">
          <strong>识别到 {{ projects.length }} 个项目</strong>
          <span>只创建项目入口，不会假装已经理解全部上下文</span>
        </div>
        <ol class="project-chip-list">
          <li v-for="project in projects" :key="project">{{ project }}</li>
        </ol>
      </div>

      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button class="primary-button intake-submit" type="submit" :disabled="busy">
        {{
          busy
            ? "正在保存到本机…"
            : projects.length
              ? `收下这 ${projects.length} 个项目`
              : "收下这些项目"
        }}
      </button>
    </form>
  </section>
</template>
