<script setup lang="ts">
import { reactive, ref } from "vue";
import type { RevivalProject } from "@/shared/domain/model";
import { useRevivalStore } from "@/renderer/stores/revival";
import StageShell from "./StageShell.vue";

const props = defineProps<{ project: RevivalProject }>();
const store = useRevivalStore();
const form = reactive({ ...props.project.restore });
const busy = ref(false);
const error = ref("");

async function submit(): Promise<void> {
  busy.value = true;
  error.value = "";
  try {
    await store.recordRestore(form);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "进度保存失败";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <StageShell
    eyebrow="恢复现场 · 1/6"
    :title="`先找回「${project.title}」的现场`"
    description="只回答最有用的四件事。不需要复盘全部，也不用把计划写得漂亮。"
  >
    <form class="space-y-5" @submit.prevent="submit">
      <div>
        <label class="field-label" for="last-completed">上次最后完成了什么？</label>
        <textarea
          id="last-completed"
          v-model="form.lastCompleted"
          class="field-input min-h-24 resize-y"
          maxlength="240"
          placeholder="例如：完成了首页布局，代码已经保存到 feature/home"
          required
        />
      </div>
      <div>
        <label class="field-label" for="stuck-at">具体卡在哪里？</label>
        <textarea
          id="stuck-at"
          v-model="form.stuckAt"
          class="field-input min-h-24 resize-y"
          maxlength="240"
          placeholder="例如：不知道移动端导航应该怎么收起"
          required
        />
      </div>
      <div class="grid gap-5 sm:grid-cols-2">
        <div>
          <label class="field-label" for="deadline">最近的时间节点（可选）</label>
          <input
            id="deadline"
            v-model="form.deadline"
            class="field-input"
            maxlength="80"
            placeholder="例如：周五课堂展示"
          />
        </div>
        <div>
          <label class="field-label" for="why-matters">为什么还值得继续（可选）</label>
          <input
            id="why-matters"
            v-model="form.whyMatters"
            class="field-input"
            maxlength="240"
            placeholder="例如：这是我最想放进作品集的项目"
          />
        </div>
      </div>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button class="primary-button w-full sm:w-auto" type="submit" :disabled="busy">
        {{ busy ? "正在保存…" : "现场找回来了" }}
      </button>
    </form>
  </StageShell>
</template>
