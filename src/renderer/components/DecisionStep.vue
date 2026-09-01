<script setup lang="ts">
import { computed, ref } from "vue";
import type { Decision, RevivalProject } from "@/shared/domain/model";
import { useRevivalStore } from "@/renderer/stores/revival";
import StageShell from "./StageShell.vue";

const props = defineProps<{ project: RevivalProject }>();
const store = useRevivalStore();
const busy = ref<Decision | null>(null);
const error = ref("");

const options: Array<{ value: Decision; title: string; description: string; tone?: string }> = [
  { value: "continue", title: "继续", description: "方向没问题，直接找下一小步" },
  { value: "shrink", title: "缩小", description: "保留价值，把范围收小到今天能动" },
  { value: "help", title: "求助", description: "先把问题说清楚，再向同学或老师求助" },
  { value: "pause", title: "暂停", description: "现在不做，但留下以后能接上的位置" },
  { value: "abandon", title: "放弃", description: "明确结束，不再让它占用注意力", tone: "quiet" }
];

const recommendedDecision = computed<Decision>(
  () => props.project.analysis?.suggestedDecision ?? "shrink"
);
const recommendedOption = computed(
  () => options.find((option) => option.value === recommendedDecision.value) ?? options[1]!
);
const alternativeOptions = computed(() =>
  options.filter((option) => option.value !== recommendedDecision.value)
);
const recommendationReason = computed(() => {
  const reasons: Record<Decision, string> = {
    continue: "目标和卡点已经比较明确，可以直接把卡点变成一个可保存的小步。",
    shrink: "现有范围或进度还不够清楚，先缩小比继续硬推更容易留下真实结果。",
    help: "当前卡点依赖别人、权限或外部答案，先提出具体求助更有效。",
    pause: "继续所需的条件暂时不在手上，先留下恢复位置更诚实。",
    abandon: "现有材料显示继续投入的时效或价值已经消失，明确结束可以释放注意力。"
  };
  return reasons[recommendedDecision.value];
});

async function select(decision: Decision): Promise<void> {
  busy.value = decision;
  error.value = "";
  try {
    await store.decide(decision);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "选择保存失败";
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <StageShell
    eyebrow="项目判断 · 2/6"
    :title="`tryrevive 建议：${recommendedOption.title}`"
    description="这是根据你刚确认的现场给出的建议；你只需接受，或在不合适时改一次。"
  >
    <article
      class="rounded-3xl border border-[var(--focus)]/20 bg-[var(--focus)]/[0.045] p-5 sm:p-6"
    >
      <p class="summary-label">为什么这样判断</p>
      <p class="summary-value mt-2">{{ recommendationReason }}</p>
      <p class="mt-3 text-sm leading-6 text-[var(--muted)]">
        你确认的卡点：{{ project.restore.stuckAt }}
      </p>
      <button
        class="primary-button mt-5 w-full"
        type="button"
        :disabled="busy !== null"
        @click="select(recommendedDecision)"
      >
        {{ busy === recommendedDecision ? "正在保存…" : `接受建议：${recommendedOption.title}` }}
      </button>
    </article>

    <details class="mt-4 rounded-3xl border border-[var(--line)] p-5">
      <summary class="cursor-pointer text-sm font-semibold text-[var(--ink)]">
        这个判断不合适？换一个
      </summary>
      <div class="mt-4 grid gap-3 sm:grid-cols-2" role="list" aria-label="其他项目方向">
        <button
          v-for="option in alternativeOptions"
          :key="option.value"
          class="choice-card text-left"
          :class="{ 'sm:col-span-2 opacity-80': option.tone === 'quiet' }"
          type="button"
          :disabled="busy !== null"
          @click="select(option.value)"
        >
          <span class="block text-base font-semibold text-[var(--ink)]">{{ option.title }}</span>
          <span class="mt-1 block text-sm leading-6 text-[var(--muted)]">{{
            option.description
          }}</span>
        </button>
      </div>
    </details>
    <p v-if="error" class="form-error mt-4" role="alert">{{ error }}</p>
  </StageShell>
</template>
