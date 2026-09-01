<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, ref, watch } from "vue";
import type { RevivalProject } from "@/shared/domain/model";
import {
  createProjectComposition,
  projectWavFileName,
  renderProjectWav
} from "@/shared/audio/vinyl-music";
import { platform } from "@/renderer/platform/web";

const VinylRitualScene = defineAsyncComponent(() => import("./VinylRitualScene.vue"));

const props = defineProps<{
  project: RevivalProject;
  compact?: boolean;
}>();

const opened = ref(false);
const playing = ref(false);
const rendering = ref(false);
const audioElement = ref<HTMLAudioElement | null>(null);
const audioUrl = ref("");
const audioBytes = ref<Uint8Array | null>(null);
const audioError = ref("");
const exportNotice = ref("");

const composition = computed(() => createProjectComposition(props.project));
const trackLength = computed(() => {
  const seconds = composition.value.durationSeconds;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
});
const recordedMinutes = computed(() => Math.max(1, Math.round(composition.value.workSeconds / 60)));

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

function stopTrack(): void {
  audioElement.value?.pause();
  playing.value = false;
}

function releaseAudio(): void {
  stopTrack();
  if (audioUrl.value) URL.revokeObjectURL(audioUrl.value);
  audioUrl.value = "";
  audioBytes.value = null;
  audioError.value = "";
  exportNotice.value = "";
}

function ensureAudio(): Uint8Array {
  if (audioBytes.value) return audioBytes.value;
  const bytes = renderProjectWav(props.project);
  const blob = new Blob([bytes.slice().buffer], { type: "audio/wav" });
  audioBytes.value = bytes;
  audioUrl.value = URL.createObjectURL(blob);
  return bytes;
}

async function startTrack(): Promise<void> {
  if (playing.value) return;
  rendering.value = true;
  audioError.value = "";
  try {
    ensureAudio();
    await nextTick();
    await audioElement.value?.play();
  } catch (caught) {
    audioError.value = caught instanceof Error ? caught.message : "这张唱片暂时无法播放";
  } finally {
    rendering.value = false;
  }
}

async function exportTrack(): Promise<void> {
  rendering.value = true;
  audioError.value = "";
  exportNotice.value = "";
  try {
    const result = await platform.exportAudio({
      fileName: projectWavFileName(props.project),
      bytes: ensureAudio()
    });
    exportNotice.value = result.canceled
      ? "已取消导出"
      : result.path
        ? `已导出到 ${result.path}`
        : "WAV 已导出";
  } catch (caught) {
    audioError.value = caught instanceof Error ? caught.message : "WAV 导出失败";
  } finally {
    rendering.value = false;
  }
}

watch(() => [props.project.id, props.project.reward?.mood], releaseAudio);
onBeforeUnmount(releaseAudio);
</script>

<template>
  <section
    class="vinyl-artifact"
    :class="{
      'vinyl-artifact-compact': compact,
      'vinyl-artifact-abandoned': project.status === 'abandoned',
      'vinyl-artifact-ritual': project.status === 'completed' && project.reward
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

    <template v-else-if="project.status === 'completed' && project.reward">
      <VinylRitualScene
        :project-title="project.title"
        :cover-hue="coverSeed % 360"
        :playing="playing"
        :busy="rendering"
        @request-play="startTrack"
        @request-stop="stopTrack"
      />
      <div class="vinyl-ritual-meta">
        <audio
          ref="audioElement"
          class="sr-only"
          :src="audioUrl"
          @play="playing = true"
          @pause="playing = false"
          @ended="playing = false"
        />
        <div>
          <p class="summary-label">项目黑胶 · 本地生成</p>
          <h2 class="vinyl-heading">一段 {{ trackLength }} 的项目声音</h2>
          <p class="vinyl-copy">
            当前曲目根据“{{ composition.moodLabel }}”、{{ recordedMinutes }}
            分钟项目动作和本地记录生成；不会上传项目内容。真 3D
            仪式先验证动作与空间，原创分轨音乐会在独立阶段替换，不把参考歌曲作为采样。
          </p>
        </div>
        <button
          class="text-button vinyl-export"
          type="button"
          :disabled="rendering"
          @click="exportTrack"
        >
          导出当前同一首 WAV
        </button>
        <p v-if="audioError" class="form-error" role="alert">{{ audioError }}</p>
        <p v-if="exportNotice" class="vinyl-notice" role="status">{{ exportNotice }}</p>
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
              ? project.reward
                ? `这首 ${trackLength} 的曲目根据“${composition.moodLabel}”、${recordedMinutes} 分钟项目动作和本地记录生成；不会上传项目内容。`
                : "先选择完成这一刻的真实心情，才会生成这张项目唱片。"
              : "每次留下真实进度，封面都会再清晰一点。项目完成时才会完整打开。"
          }}
        </p>
      </div>
    </template>
  </section>
</template>
