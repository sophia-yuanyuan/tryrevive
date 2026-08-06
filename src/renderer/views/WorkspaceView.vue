<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useRevivalStore } from "@/renderer/stores/revival";
import ProjectIntake from "@/renderer/components/ProjectIntake.vue";
import RevivalFlow from "@/renderer/components/RevivalFlow.vue";

const store = useRevivalStore();
const { ready, activeProject } = storeToRefs(store);
</script>

<template>
  <main
    class="mx-auto w-full flex-1 px-4 py-8 sm:px-6 sm:py-12 lg:px-8"
    :class="activeProject ? 'max-w-5xl' : 'max-w-7xl'"
  >
    <div v-if="!ready" class="stage-card animate-pulse" aria-live="polite">
      <div class="h-3 w-24 rounded-full bg-black/10" />
      <div class="mt-5 h-10 w-3/4 rounded-2xl bg-black/10" />
      <div class="mt-4 h-5 w-full rounded-xl bg-black/8" />
      <p class="sr-only">正在读取本地进度</p>
    </div>
    <RevivalFlow v-else-if="activeProject" :project="activeProject" />
    <ProjectIntake v-else />
  </main>
</template>
