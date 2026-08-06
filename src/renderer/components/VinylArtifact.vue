<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import type { RevivalProject } from "@/shared/domain/model";

const props = defineProps<{
  project: RevivalProject;
  compact?: boolean;
}>();

const opened = ref(false);
const playing = ref(false);
let audioContext: AudioContext | null = null;
let stopTimer: number | null = null;

const filledPieces = computed(() => {
  if (props.project.status === "completed") return 16;
  return Math.min(
    15,
    Math.max(2, props.project.evidence.length * 4 + props.project.actionHistory.length * 2)
  );
});

const coverSeed = computed(() => {
  let hash = 2166136261;
  const input = `${props.project.title}:${props.project.createdAt}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
});

const coverStyle = computed(() => ({
  "--cover-hue": `${coverSeed.value % 360}`,
  "--cover-hue-alt": `${(coverSeed.value + 76) % 360}`
}));

function stopTone(): void {
  if (stopTimer !== null) window.clearTimeout(stopTimer);
  stopTimer = null;
  playing.value = false;
  if (audioContext) void audioContext.close().catch(() => undefined);
  audioContext = null;
}

function toggleTone(): void {
  if (playing.value) {
    stopTone();
    return;
  }

  const context = new AudioContext();
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, context.currentTime);
  master.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.08);
  master.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 6.2);
  master.connect(context.destination);

  const scale = [0, 2, 4, 7, 9];
  const root = 146.83 * 2 ** ((coverSeed.value % 7) / 12);
  for (let beat = 0; beat < 8; beat += 1) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const degree = scale[(coverSeed.value + beat * 3) % scale.length] ?? 0;
    oscillator.type = beat % 3 === 0 ? "triangle" : "sine";
    oscillator.frequency.value = root * 2 ** (degree / 12);
    const startsAt = context.currentTime + beat * 0.72;
    envelope.gain.setValueAtTime(0.0001, startsAt);
    envelope.gain.exponentialRampToValueAtTime(0.42, startsAt + 0.04);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startsAt + 0.62);
    oscillator.connect(envelope).connect(master);
    oscillator.start(startsAt);
    oscillator.stop(startsAt + 0.66);
  }

  audioContext = context;
  playing.value = true;
  stopTimer = window.setTimeout(stopTone, 6_500);
}

onBeforeUnmount(stopTone);
</script>

<template>
  <section
    class="vinyl-artifact"
    :class="{
      'vinyl-artifact-compact': compact,
      'vinyl-artifact-abandoned': project.status === 'abandoned'
    }"
    :style="coverStyle"
  >
    <template v-if="project.status === 'abandoned'">
      <div class="vinyl-bowl" aria-hidden="true">
        <span class="vinyl-bowl-label" />
      </div>
      <div>
        <p class="summary-label">已经放下</p>
        <h2 class="vinyl-heading">这张唱片不再需要播放。</h2>
        <p class="vinyl-copy">记录仍留在本机。放弃是一个项目决定，不是对你的评价。</p>
      </div>
    </template>

    <template v-else>
      <button
        class="vinyl-sleeve"
        :class="{
          'vinyl-sleeve-open': opened,
          'vinyl-sleeve-complete': project.status === 'completed'
        }"
        type="button"
        :aria-pressed="opened"
        :aria-label="project.status === 'completed' ? '打开项目黑胶封套' : '查看正在生成的项目封面'"
        @click="opened = !opened"
      >
        <span class="vinyl-cover">
          <span
            v-for="piece in 16"
            :key="piece"
            class="vinyl-puzzle-piece"
            :class="{ 'vinyl-puzzle-piece-filled': piece <= filledPieces }"
            :style="{ '--piece': piece }"
          />
          <span class="vinyl-cover-title">{{ project.title }}</span>
        </span>
        <span class="vinyl-record" aria-hidden="true">
          <span class="vinyl-record-label">TR</span>
        </span>
      </button>

      <div class="vinyl-content">
        <p class="summary-label">
          {{ project.status === "completed" ? "项目黑胶 · 本地生成" : "封面正在变清晰" }}
        </p>
        <h2 class="vinyl-heading">
          {{
            project.status === "completed"
              ? "把唱片从封套里取出来。"
              : `${filledPieces}/16 块项目碎片已经归位。`
          }}
        </h2>
        <p class="vinyl-copy">
          {{
            project.status === "completed"
              ? "颜色与短音型由项目标题和本地记录确定；这是奖励原型，不会上传你的项目内容。"
              : "每次留下真实进度，封面都会再清晰一点。项目完成时才会完整打开。"
          }}
        </p>
        <button
          v-if="project.status === 'completed'"
          class="secondary-button vinyl-play"
          type="button"
          @click="toggleTone"
        >
          {{ playing ? "停止短音型" : "播放这张项目唱片" }}
        </button>
      </div>
    </template>
  </section>
</template>
