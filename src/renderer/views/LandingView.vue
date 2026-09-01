<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useRevivalStore } from "@/renderer/stores/revival";

const store = useRevivalStore();
const { activeProject, data, openProjects, pendingInference, ready } = storeToRefs(store);

const resumeProject = computed(() => activeProject.value ?? openProjects.value[0] ?? null);
const primaryLabel = computed(() => {
  if (!ready.value) return "正在读取本地进度…";
  if (pendingInference.value) return `继续确认「${pendingInference.value.title}」`;
  if (resumeProject.value) return `从「${resumeProject.value.title}」继续`;
  return "复活我的项目";
});
const hasLocalHistory = computed(
  () => data.value.projects.length > 0 || pendingInference.value !== null
);
</script>

<template>
  <main id="main-content" class="landing-page">
    <section class="landing-hero" aria-labelledby="landing-title">
      <div class="landing-hero-copy">
        <p class="eyebrow">不是重新开始，是从真实进度继续</p>
        <h1 id="landing-title">停下来的项目，也可以找回下一步。</h1>
        <p>
          TryRevive
          帮你找回上次做到哪里，判断现在该继续、缩小、求助还是暂停，然后完成今天最关键的一小步。
        </p>
        <RouterLink
          class="primary-button landing-primary"
          to="/start"
          :aria-disabled="!ready"
          :tabindex="ready ? undefined : -1"
        >
          {{ primaryLabel }}
        </RouterLink>
        <p class="landing-boundary">
          第一次使用无需注册。项目与进度默认留在本机；只有你主动确认的云端操作才会上传所选内容。
        </p>
      </div>

      <aside class="landing-preview" aria-label="TryRevive 恢复过程示例">
        <p class="summary-label">模拟示例 · 不是用户案例</p>
        <ol>
          <li>
            <span>1</span>
            <div><strong>找回现场</strong><small>上次完成了首页，卡在移动端导航。</small></div>
          </li>
          <li>
            <span>2</span>
            <div><strong>只定一小步</strong><small>先让 390px 下的菜单能够收起。</small></div>
          </li>
          <li>
            <span>3</span>
            <div><strong>留下真实结果</strong><small>记录改了什么，下次从这里继续。</small></div>
          </li>
        </ol>
      </aside>
    </section>

    <section class="landing-section" aria-labelledby="outcomes-title">
      <p class="eyebrow">你会得到什么</p>
      <h2 id="outcomes-title">不是更多计划，而是一个能继续的位置</h2>
      <div class="landing-card-grid">
        <article class="summary-card">
          <p class="summary-label">恢复</p>
          <h3>不用重新回忆全部背景</h3>
          <p>把已有材料、记得的内容或项目文件交进来，先得到一份可修改的现场草稿。</p>
        </article>
        <article class="summary-card">
          <p class="summary-label">行动</p>
          <h3>一次只完成 5–20 分钟</h3>
          <p>把模糊压力缩成一个动作，并提前写清楚做到什么才算完成。</p>
        </article>
        <article class="summary-card">
          <p class="summary-label">继续</p>
          <h3>把结果留给下次的自己</h3>
          <p>保存真实结果与回来位置；完成或放下的项目会进入成果记录。</p>
        </article>
      </div>
    </section>

    <section class="landing-section landing-split" aria-labelledby="how-title">
      <div>
        <p class="eyebrow">怎么工作</p>
        <h2 id="how-title">一条连续旅程，页面不会把你丢下</h2>
      </div>
      <ol class="landing-steps">
        <li><strong>01 · 恢复现场</strong><span>确认上次完成、卡点与近期节点。</span></li>
        <li><strong>02 · 做出判断</strong><span>继续、缩小、求助、暂停或放弃。</span></li>
        <li><strong>03 · 完成下一步</strong><span>进入专注，留下实际结果。</span></li>
        <li><strong>04 · 安排回来</strong><span>保存提示和时间，下次直接续上。</span></li>
      </ol>
    </section>

    <section class="landing-section" aria-labelledby="fit-title">
      <p class="eyebrow">什么时候适合用</p>
      <h2 id="fit-title">手里有真实项目，但不知道从哪里重新接上</h2>
      <div class="landing-card-grid">
        <article class="summary-card">
          <h3>课程与作品集</h3>
          <p>已有半成品、反馈或截止日期，却一直没再打开。</p>
        </article>
        <article class="summary-card">
          <h3>比赛与申请</h3>
          <p>报名、材料、分工散在不同地方，下一步不清楚。</p>
        </article>
        <article class="summary-card">
          <h3>代码与创作</h3>
          <p>知道项目重要，但每次回来都要重新理解现场。</p>
        </article>
      </div>
    </section>

    <section class="landing-section landing-trust" aria-labelledby="trust-title">
      <div>
        <p class="eyebrow">边界说清楚</p>
        <h2 id="trust-title">你决定方向，TryRevive 只帮助你继续</h2>
      </div>
      <div class="landing-trust-copy">
        <p>它不会替你承诺结果，也不把停滞解释成懒惰、疾病或失败。</p>
        <p>本地功能无需账户；云端理解、额度和身份是另一层能力，不会挡住第一次恢复项目。</p>
        <div class="landing-links">
          <RouterLink class="text-button" to="/privacy">查看隐私与数据控制</RouterLink>
          <RouterLink class="text-button" to="/about">了解 TryRevive 如何工作</RouterLink>
          <RouterLink class="text-button" to="/help">打开帮助中心</RouterLink>
        </div>
      </div>
    </section>

    <section class="landing-final" aria-labelledby="final-title">
      <p class="eyebrow">从现在的位置开始</p>
      <h2 id="final-title">
        {{ hasLocalHistory ? "你的项目还在这里。" : "先把一个停滞项目交进来。" }}
      </h2>
      <p>
        {{
          hasLocalHistory ? "不用重新创建，也不用从头解释。" : "不需要注册，不需要先整理得很完整。"
        }}
      </p>
      <RouterLink class="secondary-button landing-secondary" to="/start">
        <span>{{ primaryLabel }}</span>
      </RouterLink>
    </section>
  </main>
</template>
