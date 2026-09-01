<script setup lang="ts">
import { ref } from "vue";
import type { ProjectMood, RevivalProject } from "@/shared/domain/model";
import { useRevivalStore } from "@/renderer/stores/revival";
import StageShell from "./StageShell.vue";
import VinylArtifact from "./VinylArtifact.vue";
import CompletionMoodPicker from "./CompletionMoodPicker.vue";

const props = defineProps<{ project: RevivalProject }>();
const store = useRevivalStore();
const busy = ref(false);
const error = ref("");

async function saveMood(mood: ProjectMood): Promise<void> {
  busy.value = true;
  error.value = "";
  try {
    await store.setRewardMood(props.project.id, mood);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "心情保存失败";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <StageShell
    eyebrow="已经作出明确决定"
    :title="project.status === 'completed' ? '这个项目已经完成' : '这个项目已经结束'"
    :description="
      project.status === 'completed'
        ? '完成由你确认。记录仍保留在本地，之后可以导出备份。'
        : '明确放弃不是失败。它不会再占用当前项目列表，记录仍保留在本地。'
    "
  >
    <CompletionMoodPicker
      v-if="project.status === 'completed' && !project.reward"
      :busy="busy"
      @select="saveMood"
    />
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <VinylArtifact :project="project" />
  </StageShell>
</template>
