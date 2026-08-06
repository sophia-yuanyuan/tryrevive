<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { RadioGroupIndicator, RadioGroupItem, RadioGroupRoot } from "reka-ui";
import type { RevivalProject } from "@/shared/domain/model";
import { useRevivalStore } from "@/renderer/stores/revival";
import StageShell from "./StageShell.vue";

const props = defineProps<{ project: RevivalProject }>();
const store = useRevivalStore();
const form = reactive({
  days: 3,
  cue: props.project.evidence.length
    ? "先看上次留下的结果，再决定下一个 5–20 分钟动作"
    : "从今天留下的进度继续"
});
const busy = ref(false);
const error = ref("");
const options = [3, 5, 7];
const returnDate = computed(() => {
  const value = new Date(Date.now() + form.days * 24 * 60 * 60 * 1_000);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(value);
});

async function submit(): Promise<void> {
  busy.value = true;
  error.value = "";
  try {
    await store.setReturnPlan({
      dueAt: Date.now() + form.days * 24 * 60 * 60 * 1_000,
      cue: form.cue
    });
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "回来看看的计划保存失败";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <StageShell
    eyebrow="下次继续 · 6/6"
    title="把再次开始的门槛降到最低"
    description="选择 3–7 天内回来看看。网页版会在本地保留进度，桌面版会保存在应用数据目录。"
  >
    <form class="space-y-6" @submit.prevent="submit">
      <fieldset>
        <legend class="field-label">几天后回来看看？</legend>
        <RadioGroupRoot v-model="form.days" class="grid grid-cols-3 gap-3" orientation="horizontal">
          <label v-for="days in options" :key="days" class="time-option justify-center">
            <RadioGroupItem :value="days" class="radio-control">
              <RadioGroupIndicator class="radio-indicator" />
            </RadioGroupItem>
            {{ days }} 天
          </label>
        </RadioGroupRoot>
        <p class="mt-3 text-sm text-[var(--muted)]">预计 {{ returnDate }}</p>
      </fieldset>
      <div>
        <label class="field-label" for="return-cue">回来时先看哪句话？</label>
        <textarea
          id="return-cue"
          v-model="form.cue"
          class="field-input min-h-24 resize-y"
          maxlength="160"
          required
        />
      </div>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button class="primary-button w-full sm:w-auto" type="submit" :disabled="busy">
        {{ busy ? "正在保存…" : "保存，下次从这里继续" }}
      </button>
    </form>
  </StageShell>
</template>
