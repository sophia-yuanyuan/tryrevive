<script setup lang="ts">
import { computed, inject } from "vue";
import { storeToRefs } from "pinia";
import { routeLocationKey } from "vue-router";
import { useRevivalStore } from "@/renderer/stores/revival";

const route = inject(routeLocationKey);
const store = useRevivalStore();
const { activeProject, openProjects, pendingInference } = storeToRefs(store);
const hasWork = computed(
  () =>
    activeProject.value !== null || openProjects.value.length > 0 || pendingInference.value !== null
);
const destination = computed(() => (hasWork.value ? "/start" : "/"));
const actionLabel = computed(() => (hasWork.value ? "回到我的项目" : "回到 TryRevive 首页"));
</script>

<template>
  <main id="main-content" class="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
    <section class="stage-card not-found-card" aria-labelledby="not-found-title">
      <p class="eyebrow">404 · 没有这个页面</p>
      <h1 id="not-found-title" class="stage-title">这条路没有接到 TryRevive。</h1>
      <p class="stage-description">
        地址 <code>{{ route?.path ?? "/" }}</code> 不存在。你的本地项目没有被修改。
      </p>
      <div class="mt-8 flex flex-wrap gap-3">
        <RouterLink class="primary-button inline-flex items-center" :to="destination">
          <span>{{ actionLabel }}</span>
        </RouterLink>
        <RouterLink
          class="text-button inline-flex items-center"
          :to="{ path: '/help', query: { returnTo: destination } }"
        >
          查看帮助
        </RouterLink>
      </div>
    </section>
  </main>
</template>
