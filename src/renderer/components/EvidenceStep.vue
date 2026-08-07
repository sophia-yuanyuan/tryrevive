<script setup lang="ts">
import { reactive, ref } from "vue";
import type { RevivalProject } from "@/shared/domain/model";
import { useRevivalStore } from "@/renderer/stores/revival";
import StageShell from "./StageShell.vue";

defineProps<{ project: RevivalProject }>();
const store = useRevivalStore();
const form = reactive({ note: "", link: "" });
const busy = ref(false);
const error = ref("");

async function submit(): Promise<void> {
  busy.value = true;
  error.value = "";
  try {
    await store.recordEvidence(form);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "进度记录失败";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <StageShell
    :eyebrow="project.decision === null ? '留下进度 · 4/5' : '留下进度 · 5/6'"
    title="下一次回来，要一眼看见什么？"
    :description="`刚才的完成标准：${project.action?.doneDefinition ?? '留下一个明确结果'}`"
  >
    <form class="space-y-5" @submit.prevent="submit">
      <div>
        <label class="field-label" for="evidence-note">我实际完成了</label>
        <textarea
          id="evidence-note"
          v-model="form.note"
          class="field-input min-h-28 resize-y"
          maxlength="500"
          placeholder="例如：首页移动端导航已经可以展开和关闭；下一次从键盘操作继续检查"
          required
        />
        <p class="field-help">写真实结果，不需要把它包装成成功。</p>
      </div>
      <div>
        <label class="field-label" for="evidence-link">结果链接或文件位置（可选）</label>
        <input
          id="evidence-link"
          v-model="form.link"
          class="field-input"
          maxlength="500"
          placeholder="https://… 或项目中的文件路径"
        />
      </div>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button class="primary-button w-full sm:w-auto" type="submit" :disabled="busy">
        {{ busy ? "正在保存…" : "把真实进度留下" }}
      </button>
    </form>
  </StageShell>
</template>
