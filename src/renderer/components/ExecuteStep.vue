<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import type { RevivalProject } from "@/shared/domain/model";
import { useRevivalStore } from "@/renderer/stores/revival";
import { platform } from "@/renderer/platform/web";
import FocusMode from "./FocusMode.vue";
import StageShell from "./StageShell.vue";

const props = defineProps<{ project: RevivalProject }>();
const store = useRevivalStore();
const now = ref(Date.now());
const busy = ref(false);
const error = ref("");
const focusOpen = ref(store.consumeFocusRequest(props.project.id));
const timer = window.setInterval(() => (now.value = Date.now()), 1_000);
onBeforeUnmount(() => window.clearInterval(timer));

const action = computed(() => props.project.action);
const started = computed(() => Boolean(action.value?.startedAt));
const totalSeconds = computed(() => (action.value?.minutes ?? 0) * 60);
const elapsedSeconds = computed(() =>
  action.value?.startedAt
    ? Math.max(0, Math.floor((now.value - action.value.startedAt) / 1_000))
    : 0
);
const remainingSeconds = computed(() => Math.max(0, totalSeconds.value - elapsedSeconds.value));
const clock = computed(() => {
  const minutes = Math.floor(remainingSeconds.value / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (remainingSeconds.value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
});

async function finish(): Promise<void> {
  busy.value = true;
  try {
    await store.finishAction();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "完成状态保存失败";
  } finally {
    busy.value = false;
  }
}

async function enterFocus(): Promise<void> {
  error.value = "";
  try {
    await platform.setFullScreen(true).catch(() => false);
    focusOpen.value = true;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "专注界面启动失败";
  }
}

async function finishFromFocus(): Promise<void> {
  focusOpen.value = false;
  await finish();
}
</script>

<template>
  <div>
    <StageShell
      :eyebrow="project.decision === null ? '专注执行 · 3/5' : '执行 · 4/6'"
      title="现在只处理这一小步"
      description="可以提前完成，也可以超时继续。计时只是边界，不是评价。"
    >
      <div v-if="action" class="space-y-6">
        <div class="rounded-3xl bg-[var(--ink)] p-6 text-white sm:p-8">
          <p class="text-sm text-white/60">当前动作</p>
          <p class="mt-3 text-xl font-semibold leading-8 sm:text-2xl">{{ action.text }}</p>
          <p class="mt-4 border-t border-white/15 pt-4 text-sm leading-6 text-white/75">
            完成标准：{{ action.doneDefinition }}
          </p>
        </div>
        <div
          class="flex flex-col items-center rounded-3xl border border-[var(--line)] bg-white/60 p-7"
        >
          <span class="text-xs font-semibold tracking-[0.18em] text-[var(--muted)] uppercase">
            {{ started ? "剩余时间" : `${action.minutes} 分钟时间盒` }}
          </span>
          <span
            class="mt-2 font-mono text-5xl font-semibold tracking-tight text-[var(--ink)] sm:text-6xl"
          >
            {{ clock }}
          </span>
        </div>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <div v-if="started" class="grid gap-3 sm:grid-cols-2">
          <button class="primary-button w-full" type="button" :disabled="busy" @click="enterFocus">
            以唱针进入全屏专注
          </button>
          <button class="secondary-button w-full" type="button" :disabled="busy" @click="finish">
            我已经留下结果
          </button>
        </div>
        <button
          v-if="!started"
          class="primary-button w-full"
          type="button"
          :disabled="busy"
          @click="enterFocus"
        >
          以唱针进入全屏专注
        </button>
      </div>
    </StageShell>
    <FocusMode
      v-if="focusOpen"
      :project="project"
      :clock="clock"
      :started="started"
      @close="focusOpen = false"
      @finish="finishFromFocus"
    />
  </div>
</template>
