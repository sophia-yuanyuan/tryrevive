<script setup lang="ts">
import { computed, inject } from "vue";
import { routeLocationKey } from "vue-router";
import { safeReturnPath } from "@/renderer/navigation";

const route = inject(routeLocationKey);
const returnTo = computed(() => safeReturnPath(route?.query.returnTo));
const returnLabel = computed(() => (returnTo.value === "/" ? "返回首页" : "返回项目"));
</script>

<template>
  <main id="main-content" class="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
    <article class="stage-card prose-copy">
      <p class="eyebrow">关于 TryRevive</p>
      <h1 class="stage-title">让停滞项目重新有一个可继续的位置</h1>
      <p class="stage-description">
        TryRevive
        面向手里有真实停滞项目、近期又有节点的在读学生。它不会替你承诺结果，只帮助你找回现场、完成一个小步并留下真实进度。
      </p>
      <div class="mt-8 grid gap-4 sm:grid-cols-3">
        <section class="summary-card">
          <p class="summary-label">无需注册</p>
          <p class="summary-value">第一次打开即可开始，数据优先保存在本地。</p>
        </section>
        <section class="summary-card">
          <p class="summary-label">小步执行</p>
          <p class="summary-value">一次只处理 5–20 分钟内能完成的一步。</p>
        </section>
        <section class="summary-card">
          <p class="summary-label">真实继续</p>
          <p class="summary-value">留下实际结果，下次无需重新回忆全部背景。</p>
        </section>
      </div>
      <div class="mt-8 flex flex-wrap gap-3">
        <RouterLink class="primary-button inline-flex items-center" :to="returnTo">
          <span>{{ returnLabel }}</span>
        </RouterLink>
        <RouterLink class="text-button inline-flex items-center" to="/help">查看帮助</RouterLink>
      </div>
    </article>
  </main>
</template>
