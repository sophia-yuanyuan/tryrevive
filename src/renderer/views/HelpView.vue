<script setup lang="ts">
import { computed, inject } from "vue";
import { routeLocationKey } from "vue-router";
import { safeReturnPath } from "@/renderer/navigation";

const route = inject(routeLocationKey);
const returnTo = computed(() => safeReturnPath(route?.query.returnTo));
const returnLabel = computed(() => (returnTo.value === "/" ? "返回首页" : "返回项目"));
</script>

<template>
  <main id="main-content" class="help-page">
    <header class="help-hero">
      <p class="eyebrow">TryRevive 帮助中心</p>
      <h1>遇到问题时，从正在做的事情继续。</h1>
      <p>这里按用户旅程组织说明，不要求你先理解产品内部术语。</p>
      <RouterLink class="primary-button inline-flex" :to="returnTo">{{ returnLabel }}</RouterLink>
    </header>

    <div class="help-layout">
      <nav class="help-outline" aria-label="帮助章节">
        <p class="summary-label">章节</p>
        <a href="#start">开始恢复</a>
        <a href="#continue">继续项目</a>
        <a href="#data">数据与隐私</a>
        <a href="#account">账户与云端</a>
        <a href="#troubleshoot">故障恢复</a>
      </nav>
      <article class="help-content">
        <section id="start">
          <p class="summary-label">01</p>
          <h2>开始恢复</h2>
          <p>
            打开“项目”，可以粘贴记得的内容、选择本地材料，或者在已经知道下一步时直接开始。第一步不要求注册。
          </p>
        </section>
        <section id="continue">
          <p class="summary-label">02</p>
          <h2>继续项目</h2>
          <p>
            TryRevive 会从本机读取上次保存的位置。若有多个项目，可在右上角的项目与数据设置中切换。
          </p>
        </section>
        <section id="data">
          <p class="summary-label">03</p>
          <h2>数据与隐私</h2>
          <p>项目默认保存在本机。请定期导出 JSON 备份；更详细的保留、导出与删除边界在隐私中心。</p>
          <RouterLink class="text-button" :to="{ path: '/privacy', query: { returnTo: '/help' } }">
            查看隐私中心
          </RouterLink>
        </section>
        <section id="account">
          <p class="summary-label">04</p>
          <h2>账户与云端</h2>
          <p>
            本地恢复链路与云端身份分开。只有主动使用受限云端能力时，才需要处理身份、额度和授权。
          </p>
        </section>
        <section id="troubleshoot">
          <p class="summary-label">05</p>
          <h2>故障恢复</h2>
          <p>
            如果本地存档无法安全读取，应用会停止自动保存并要求导入有效备份，不会用空白项目覆盖原文件。
          </p>
        </section>
      </article>
      <aside class="help-toc" aria-label="本页目录">
        <p class="summary-label">本页</p>
        <a href="#start">开始恢复</a>
        <a href="#continue">继续项目</a>
        <a href="#data">数据与隐私</a>
        <a href="#account">账户与云端</a>
        <a href="#troubleshoot">故障恢复</a>
      </aside>
    </div>
  </main>
</template>
