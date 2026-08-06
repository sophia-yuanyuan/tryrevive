<script setup lang="ts">
import { reactive, ref } from "vue";
import { RadioGroupIndicator, RadioGroupItem, RadioGroupRoot } from "reka-ui";
import type { RevivalProject } from "@/shared/domain/model";
import { suggestedAction } from "@/shared/domain/revival";
import { useRevivalStore } from "@/renderer/stores/revival";
import StageShell from "./StageShell.vue";

const props = defineProps<{ project: RevivalProject }>();
const store = useRevivalStore();
const suggestion = suggestedAction(props.project);
const form = reactive({ ...suggestion });
const busy = ref(false);
const error = ref("");
const minuteOptions = [5, 10, 15, 20];

async function submit(): Promise<void> {
  busy.value = true;
  error.value = "";
  try {
    await store.setAction(form);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "下一小步保存失败";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <StageShell
    eyebrow="下一小步 · 3/6"
    title="把它缩成今天能完成的一步"
    description="只保留一个动作、一个完成标准和 5–20 分钟的时间盒。你可以直接改掉建议。"
  >
    <form class="space-y-5" @submit.prevent="submit">
      <div>
        <label class="field-label" for="action-text">这一步具体做什么？</label>
        <textarea
          id="action-text"
          v-model="form.text"
          class="field-input min-h-24 resize-y"
          maxlength="160"
          required
        />
      </div>
      <div>
        <label class="field-label" for="done-definition">做到什么算完成？</label>
        <input
          id="done-definition"
          v-model="form.doneDefinition"
          class="field-input"
          maxlength="160"
          required
        />
      </div>
      <fieldset>
        <legend class="field-label">给它多少分钟？</legend>
        <RadioGroupRoot
          v-model="form.minutes"
          class="flex flex-wrap gap-3"
          orientation="horizontal"
        >
          <label v-for="minutes in minuteOptions" :key="minutes" class="time-option">
            <RadioGroupItem :value="minutes" class="radio-control">
              <RadioGroupIndicator class="radio-indicator" />
            </RadioGroupItem>
            {{ minutes }} 分钟
          </label>
        </RadioGroupRoot>
      </fieldset>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button class="primary-button w-full sm:w-auto" type="submit" :disabled="busy">
        {{ busy ? "正在保存…" : "就做这一步" }}
      </button>
    </form>
  </StageShell>
</template>
