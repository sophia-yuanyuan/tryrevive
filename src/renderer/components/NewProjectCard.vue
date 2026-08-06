<script setup lang="ts">
import { ref } from "vue";
import { useRevivalStore } from "@/renderer/stores/revival";
import StageShell from "./StageShell.vue";

const store = useRevivalStore();
const title = ref("");
const busy = ref(false);
const error = ref("");

async function submit(): Promise<void> {
  const normalized = title.value.trim();
  if (!normalized) {
    error.value = "先给这个项目一个你认得出的名字。";
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    await store.newProject(normalized);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "项目创建失败";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <StageShell
    eyebrow="重新接上"
    title="哪个项目，最近总在等你回来？"
    description="不用注册，也不用整理完整计划。先写下项目名，我们一起找回上次做到哪里。"
  >
    <form class="space-y-5" @submit.prevent="submit">
      <label class="field-label" for="project-title">项目名</label>
      <input
        id="project-title"
        v-model="title"
        class="field-input"
        maxlength="80"
        autocomplete="off"
        placeholder="例如：课程作品集、毕业设计、社团活动页面"
        autofocus
      />
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button class="primary-button w-full sm:w-auto" type="submit" :disabled="busy">
        {{ busy ? "正在保存…" : "找回上次进度" }}
      </button>
    </form>
  </StageShell>
</template>
