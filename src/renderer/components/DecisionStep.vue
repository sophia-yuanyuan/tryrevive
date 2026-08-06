<script setup lang="ts">
import { ref } from "vue";
import type { Decision, RevivalProject } from "@/shared/domain/model";
import { useRevivalStore } from "@/renderer/stores/revival";
import StageShell from "./StageShell.vue";

defineProps<{ project: RevivalProject }>();
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
    eyebrow="判断方向 · 2/6"
    title="现在最诚实的选择是什么？"
    :description="`你卡在：${project.restore.stuckAt}`"
  >
    <div class="grid gap-3 sm:grid-cols-2" role="list" aria-label="项目方向选择">
      <button
        v-for="option in options"
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
    <p v-if="error" class="form-error mt-4" role="alert">{{ error }}</p>
  </StageShell>
</template>
