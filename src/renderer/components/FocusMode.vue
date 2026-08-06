<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { RevivalProject } from "@/shared/domain/model";

const props = defineProps<{
  project: RevivalProject;
  clock: string;
}>();

const emit = defineEmits<{
  close: [];
  finish: [];
}>();

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const phase = ref(reducedMotion ? 3 : 1);
const resetOpen = ref(false);
const phaseTimers: number[] = [];
const lastScene = computed(
  () => props.project.evidence.at(-1)?.note ?? props.project.restore.lastCompleted
);
const anchor = computed(
  () => props.project.restore.whyMatters || "你可以先回到眼前这一个可见结果。"
);

function advance(): void {
  if (phase.value < 3) phase.value += 1;
}

function close(): void {
  emit("close");
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") close();
  if (event.key === "Enter" && phase.value < 3) advance();
}

onMounted(() => {
  document.body.classList.add("focus-mode-active");
  window.addEventListener("keydown", onKeydown);
  if (!reducedMotion) {
    phaseTimers.push(window.setTimeout(() => (phase.value = 2), 3_200));
    phaseTimers.push(window.setTimeout(() => (phase.value = 3), 6_400));
  }
});

onBeforeUnmount(() => {
  document.body.classList.remove("focus-mode-active");
  window.removeEventListener("keydown", onKeydown);
  phaseTimers.forEach(window.clearTimeout);
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
});
</script>

<template>
  <Teleport to="body">
    <section
      class="focus-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="专注界面"
      @click.self="advance"
    >
      <div class="focus-orbit focus-orbit-one" aria-hidden="true" />
      <div class="focus-orbit focus-orbit-two" aria-hidden="true" />

      <button class="focus-exit" type="button" @click="close">Esc · 离开专注</button>

      <Transition name="focus-phase" mode="out-in">
        <div v-if="phase === 1" key="scene" class="focus-phase-card" @click="advance">
          <p class="focus-eyebrow">回到上次离开的地方</p>
          <blockquote class="focus-quote">“{{ lastScene }}”</blockquote>
          <p class="focus-hint">轻触或按 Enter 继续</p>
        </div>

        <div v-else-if="phase === 2" key="action" class="focus-phase-card" @click="advance">
          <p class="focus-eyebrow">现在 · 只做这一步</p>
          <h2 class="focus-action">{{ project.action?.text }}</h2>
          <p class="focus-hint">不需要处理整个项目</p>
        </div>

        <div v-else key="live" class="focus-live-card">
          <p class="focus-project">{{ project.title }}</p>
          <time class="focus-clock" aria-label="当前时间盒剩余时间">{{ clock }}</time>
          <h2 class="focus-live-action">{{ project.action?.text }}</h2>
          <p class="focus-done">完成标准：{{ project.action?.doneDefinition }}</p>

          <div v-if="resetOpen" class="focus-reset" role="status">
            <span class="breath-core" aria-hidden="true" />
            <div>
              <p>先停一下，慢慢呼气。</p>
              <strong>{{ anchor }}</strong>
            </div>
            <button class="focus-reset-back" type="button" @click="resetOpen = false">
              我回到这一步
            </button>
          </div>

          <div class="focus-controls">
            <button class="focus-complete" type="button" @click="emit('finish')">
              我留下了一个结果
            </button>
            <button class="focus-secondary" type="button" @click="resetOpen = !resetOpen">
              {{ resetOpen ? "收起重置" : "我偏离了，帮我回来" }}
            </button>
            <button class="focus-secondary" type="button" @click="close">先离开一下</button>
          </div>
        </div>
      </Transition>
    </section>
  </Teleport>
</template>
