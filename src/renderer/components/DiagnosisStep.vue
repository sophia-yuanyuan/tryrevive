<script setup lang="ts">
import { reactive, ref } from "vue";
import type { RevivalProject } from "@/shared/domain/model";
import { useRevivalStore } from "@/renderer/stores/revival";
import StageShell from "./StageShell.vue";

defineProps<{ project: RevivalProject }>();
const store = useRevivalStore();
const answers = reactive<[string, string, string]>(["", "", ""]);
const busy = ref(false);
const error = ref("");

async function submit(): Promise<void> {
  busy.value = true;
  try {
    await store.diagnose(answers);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "求助信息保存失败";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <StageShell
    eyebrow="把问题说清楚 · 3/6"
    title="用三句话，准备一次有效求助"
    description="不需要自己把问题解决。把背景和尝试说清楚，会更容易得到可用的回应。"
  >
    <form class="space-y-5" @submit.prevent="submit">
      <div>
        <label class="field-label" for="diagnosis-context">对方需要知道的背景</label>
        <input
          id="diagnosis-context"
          v-model="answers[0]"
          class="field-input"
          maxlength="240"
          placeholder="我正在做什么、希望得到什么"
        />
      </div>
      <div>
        <label class="field-label" for="diagnosis-tried">已经尝试过什么</label>
        <input
          id="diagnosis-tried"
          v-model="answers[1]"
          class="field-input"
          maxlength="240"
          placeholder="我试过 A 和 B，结果分别是…"
        />
      </div>
      <div>
        <label class="field-label" for="diagnosis-question">最想问的一个问题</label>
        <input
          id="diagnosis-question"
          v-model="answers[2]"
          class="field-input"
          maxlength="240"
          placeholder="你会建议我先检查哪一处？"
        />
      </div>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button class="primary-button w-full sm:w-auto" type="submit" :disabled="busy">
        {{ busy ? "正在保存…" : "整理成下一小步" }}
      </button>
    </form>
  </StageShell>
</template>
