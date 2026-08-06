<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useRevivalStore } from "@/renderer/stores/revival";
import NewProjectCard from "@/renderer/components/NewProjectCard.vue";
import RevivalFlow from "@/renderer/components/RevivalFlow.vue";

const store = useRevivalStore();
const { ready, activeProject } = storeToRefs(store);
</script>

<template>
  <main class="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
    <div v-if="!ready" class="stage-card animate-pulse" aria-live="polite">
      <div class="h-3 w-24 rounded-full bg-black/10" />
      <div class="mt-5 h-10 w-3/4 rounded-2xl bg-black/10" />
      <div class="mt-4 h-5 w-full rounded-xl bg-black/8" />
      <p class="sr-only">正在读取本地进度</p>
    </div>
    <RevivalFlow v-else-if="activeProject" :project="activeProject" />
    <NewProjectCard v-else />
  </main>
</template>
