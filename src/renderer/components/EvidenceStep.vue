<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import type { RevivalProject } from "@/shared/domain/model";
import { useRevivalStore } from "@/renderer/stores/revival";
import StageShell from "./StageShell.vue";

const props = defineProps<{ project: RevivalProject }>();
const store = useRevivalStore();
const draft = computed(() => props.project.outcomeDraft);
const detected = computed(() => draft.value?.status === "changes_detected");
const editingDetected = ref(false);
const form = reactive({
  note: detected.value ? (draft.value?.suggestedNote ?? "") : "",
  link: ""
});
const busy = ref(false);
const error = ref("");

function beginModify(): void {
  form.note = draft.value?.suggestedNote ?? "";
  editingDetected.value = true;
  error.value = "";
}

async function acceptDetected(): Promise<void> {
  if (!draft.value || draft.value.status !== "changes_detected") return;
  busy.value = true;
  error.value = "";
  try {
    await store.recordEvidence({ note: draft.value.suggestedNote });
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "进度记录失败";
  } finally {
    busy.value = false;
  }
}

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
    title="先确认这次真正留下了什么"
    :description="`刚才的完成标准：${project.action?.doneDefinition ?? '留下一个明确结果'}`"
  >
    <section
      v-if="detected && draft"
      class="space-y-5 rounded-3xl border border-[var(--line)] bg-white/60 p-5 sm:p-6"
      role="region"
      aria-label="TryRevive 观察到的文件变化"
    >
      <div>
        <p class="summary-label">TryRevive 只读观察到</p>
        <ul class="mt-3 space-y-3">
          <li
            v-for="change in draft.changes"
            :key="`${change.kind}-${change.path}`"
            class="rounded-2xl bg-black/[0.035] px-4 py-3 text-sm leading-6"
          >
            <strong class="break-all text-[var(--ink)]">{{ change.path }}</strong>
            <span class="ml-2 text-[var(--muted)]">
              {{
                change.kind === "content_changed"
                  ? "内容与开始前不同"
                  : "本次新扫描到"
              }}
            </span>
          </li>
        </ul>
      </div>
      <p class="text-sm leading-6 text-[var(--muted)]">
        这只是有限的文件内容对比，不代表完成标准或成果质量已经得到验证。
        <template v-if="draft.scanTruncated">
          本次扫描达到范围上限；没扫描到不等于文件被删除。
        </template>
      </p>
      <p class="rounded-2xl bg-[var(--ink)] p-4 text-sm leading-6 text-white/85">
        {{ draft.suggestedNote }}
      </p>
      <p v-if="error && !editingDetected" class="form-error" role="alert">{{ error }}</p>
      <div v-if="!editingDetected" class="grid gap-3 sm:grid-cols-2">
        <button class="primary-button w-full" type="button" :disabled="busy" @click="acceptDetected">
          {{ busy ? "正在保存…" : "正确，留下这条记录" }}
        </button>
        <button class="secondary-button w-full" type="button" :disabled="busy" @click="beginModify">
          修改
        </button>
      </div>
    </section>

    <div
      v-else-if="draft"
      class="mb-5 rounded-3xl border border-[var(--line)] bg-black/[0.025] p-5 text-sm leading-6 text-[var(--muted)]"
      role="status"
    >
      <strong class="block text-[var(--ink)]">
        {{
          draft.status === "scan_failed"
            ? "这次自动对比没有成功"
            : "有限扫描没有读到内容变化"
        }}
      </strong>
      <span class="mt-2 block">{{ draft.suggestedNote }}</span>
    </div>

    <form v-if="!detected || editingDetected" class="mt-5 space-y-5" @submit.prevent="submit">
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
