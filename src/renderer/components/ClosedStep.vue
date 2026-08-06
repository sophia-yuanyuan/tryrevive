<script setup lang="ts">
import type { RevivalProject } from "@/shared/domain/model";
import StageShell from "./StageShell.vue";
import VinylArtifact from "./VinylArtifact.vue";

defineProps<{ project: RevivalProject }>();
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
    <VinylArtifact :project="project" />
  </StageShell>
</template>
