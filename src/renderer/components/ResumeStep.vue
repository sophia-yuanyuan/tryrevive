<script setup lang="ts">
import { computed, ref } from "vue";
import type { ProjectMood, RevivalProject } from "@/shared/domain/model";
import { useRevivalStore } from "@/renderer/stores/revival";
import StageShell from "./StageShell.vue";
import VinylArtifact from "./VinylArtifact.vue";
import CompletionMoodPicker from "./CompletionMoodPicker.vue";

const props = defineProps<{ project: RevivalProject }>();
const store = useRevivalStore();
const busy = ref(false);
const error = ref("");
const choosingMood = ref(false);
const lastEvidence = computed(() => props.project.evidence.at(-1));
const dueLabel = computed(() =>
  props.project.returnPlan
    ? new Intl.DateTimeFormat("zh-CN", {
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }).format(props.project.returnPlan.dueAt)
    : "你准备好的时候"
);

async function resume(): Promise<void> {
  busy.value = true;
  error.value = "";
  try {
    await store.resume();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "状态保存失败";
  } finally {
    busy.value = false;
  }
}

async function completeWithMood(mood: ProjectMood): Promise<void> {
  busy.value = true;
  error.value = "";
  try {
    await store.completeProject(mood);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "完成状态保存失败";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <StageShell
    :eyebrow="project.status === 'paused' ? '已安全暂停' : '真实进度已保存'"
    :title="project.status === 'paused' ? '项目还在这里，不必现在继续' : '下次不用从头回忆'"
    :description="`${project.title} · 计划回来时间：${dueLabel}`"
  >
    <div class="space-y-4">
      <VinylArtifact v-if="project.status !== 'paused'" :project="project" compact />
      <article class="summary-card">
        <p class="summary-label">上次留下的进度</p>
        <p class="summary-value">
          {{ lastEvidence?.note ?? project.restore.lastCompleted }}
        </p>
      </article>
      <article class="summary-card">
        <p class="summary-label">回来先看</p>
        <p class="summary-value">
          {{ project.returnPlan?.cue ?? `目前卡在：${project.restore.stuckAt}` }}
        </p>
      </article>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button class="primary-button w-full" type="button" :disabled="busy" @click="resume">
        从真实进度继续
      </button>
      <button
        class="text-button mx-auto block"
        type="button"
        :disabled="busy"
        :aria-expanded="choosingMood"
        @click="choosingMood = !choosingMood"
      >
        这个项目已经完成
      </button>
      <CompletionMoodPicker v-if="choosingMood" :busy="busy" @select="completeWithMood" />
    </div>
  </StageShell>
</template>
