<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import type { PendingInference } from "@/shared/domain/model";
import { useRevivalStore } from "@/renderer/stores/revival";
import StageShell from "./StageShell.vue";

const props = defineProps<{ pending: PendingInference }>();
const store = useRevivalStore();
const editing = ref(false);
const busy = ref(false);
const error = ref("");
const repositoryNeedsNarrowerScope = computed(
  () =>
    Boolean(props.pending.repository) &&
    props.pending.analysis.uncertainties.some((item) => item.includes("扫描已达到"))
);
const form = reactive({
  title: "",
  originalGoal: "",
  lastCompleted: "",
  stuckAt: "",
  whyMatters: "",
  stallReason: "",
  nextActionText: "",
  doneDefinition: "",
  minutes: 10
});

function resetForm(): void {
  form.title = props.pending.title;
  form.originalGoal = props.pending.analysis.originalGoal;
  form.lastCompleted = props.pending.analysis.lastCompleted;
  form.stuckAt = props.pending.analysis.stuckAt;
  form.whyMatters = props.pending.analysis.whyMatters;
  form.stallReason = props.pending.analysis.stallReasons[0] ?? "";
  form.nextActionText = props.pending.analysis.nextAction.text;
  form.doneDefinition = props.pending.analysis.nextAction.doneDefinition;
  form.minutes = props.pending.analysis.nextAction.minutes;
}

function beginEditing(): void {
  resetForm();
  error.value = "";
  editing.value = true;
}

function cancelEditing(): void {
  resetForm();
  error.value = "";
  editing.value = false;
}

watch(() => props.pending.updatedAt, resetForm, { immediate: true });

async function saveCorrection(): Promise<void> {
  busy.value = true;
  error.value = "";
  try {
    await store.correctInference(form);
    editing.value = false;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "修改没有保存";
  } finally {
    busy.value = false;
  }
}

async function confirm(): Promise<void> {
  busy.value = true;
  error.value = "";
  try {
    await store.confirmInference();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "确认没有保存";
  } finally {
    busy.value = false;
  }
}

async function discard(): Promise<void> {
  busy.value = true;
  error.value = "";
  try {
    await store.discardInference();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "草稿没有被丢弃";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <StageShell
    eyebrow="恢复摘要 · 等你确认"
    title="我猜你做到这里"
    description="这只是根据你主动选择的内容生成的草稿。你确认前，TryRevive 不会把它当成正式项目。"
  >
    <form v-if="editing" class="space-y-5" @submit.prevent="saveCorrection">
      <div>
        <label class="field-label" for="inference-title">项目名称</label>
        <input
          id="inference-title"
          v-model="form.title"
          class="field-input"
          maxlength="80"
          required
        />
      </div>
      <div>
        <label class="field-label" for="inference-goal">你最开始想完成什么？</label>
        <textarea
          id="inference-goal"
          v-model="form.originalGoal"
          class="field-input min-h-24 resize-y"
          maxlength="500"
          required
        />
      </div>
      <div>
        <label class="field-label" for="inference-completed">实际上次做到哪里？</label>
        <textarea
          id="inference-completed"
          v-model="form.lastCompleted"
          class="field-input min-h-24 resize-y"
          maxlength="240"
          required
        />
      </div>
      <div>
        <label class="field-label" for="inference-stuck">实际上卡在哪里？</label>
        <textarea
          id="inference-stuck"
          v-model="form.stuckAt"
          class="field-input min-h-24 resize-y"
          maxlength="240"
          required
        />
      </div>
      <div>
        <label class="field-label" for="inference-matters">为什么还值得继续（可选）</label>
        <input
          id="inference-matters"
          v-model="form.whyMatters"
          class="field-input"
          maxlength="240"
        />
      </div>
      <div>
        <label class="field-label" for="inference-reason">可能为什么停住？</label>
        <textarea
          id="inference-reason"
          v-model="form.stallReason"
          class="field-input min-h-20 resize-y"
          maxlength="240"
        />
      </div>
      <div class="rounded-3xl border border-[var(--line)] p-5">
        <p class="summary-label">tryrevive 建议的下一小步</p>
        <label class="field-label mt-4" for="inference-action">这一步具体做什么？</label>
        <textarea
          id="inference-action"
          v-model="form.nextActionText"
          class="field-input min-h-20 resize-y"
          maxlength="160"
          required
        />
        <label class="field-label mt-4" for="inference-done">做到什么算完成？</label>
        <input
          id="inference-done"
          v-model="form.doneDefinition"
          class="field-input"
          maxlength="160"
          required
        />
        <label class="field-label mt-4" for="inference-minutes">预计时间</label>
        <select id="inference-minutes" v-model.number="form.minutes" class="field-input">
          <option :value="5">5 分钟</option>
          <option :value="10">10 分钟</option>
          <option :value="15">15 分钟</option>
          <option :value="20">20 分钟</option>
        </select>
      </div>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <div class="grid gap-3 sm:grid-cols-2">
        <button class="primary-button w-full" type="submit" :disabled="busy">
          {{ busy ? "正在保存…" : "保存修改" }}
        </button>
        <button
          class="secondary-button w-full"
          type="button"
          :disabled="busy"
          @click="cancelEditing"
        >
          取消修改
        </button>
      </div>
    </form>

    <div v-else class="space-y-5">
      <article class="summary-card">
        <p class="summary-label">项目</p>
        <p class="summary-value">{{ pending.title }}</p>
      </article>
      <article class="summary-card">
        <p class="summary-label">最开始的目标</p>
        <p class="summary-value">{{ pending.analysis.originalGoal }}</p>
      </article>
      <article class="summary-card">
        <p class="summary-label">我猜你上次做到这里</p>
        <p class="summary-value">{{ pending.analysis.lastCompleted }}</p>
      </article>
      <article class="summary-card">
        <p class="summary-label">可能停在这里</p>
        <p class="summary-value">{{ pending.analysis.stuckAt }}</p>
      </article>

      <article class="summary-card">
        <p class="summary-label">可能为什么停住</p>
        <ul class="mt-2 space-y-2 text-sm leading-6 text-[var(--ink)]">
          <li v-for="reason in pending.analysis.stallReasons" :key="reason">· {{ reason }}</li>
        </ul>
      </article>

      <article class="rounded-3xl border border-[var(--focus)]/20 bg-[var(--focus)]/[0.045] p-5">
        <p class="summary-label">tryrevive 建议的下一小步</p>
        <p class="summary-value mt-2">{{ pending.analysis.nextAction.text }}</p>
        <p class="mt-3 text-sm leading-6 text-[var(--muted)]">
          做到这里算完成：{{ pending.analysis.nextAction.doneDefinition }}
        </p>
        <p class="mt-2 text-xs font-semibold text-[var(--focus)]">
          {{ pending.analysis.nextAction.minutes }} 分钟
        </p>
      </article>

      <div
        v-if="pending.repository?.evidence.length"
        class="rounded-3xl border border-[var(--line)] p-5"
      >
        <p class="summary-label">本次有限扫描的依据</p>
        <ul class="mt-3 space-y-2 text-sm leading-6 text-[var(--muted)]">
          <li v-for="item in pending.repository.evidence" :key="`${item.path}-${item.reason}`">
            <strong class="text-[var(--ink)]">{{ item.path }}</strong> · {{ item.reason }}
          </li>
        </ul>
      </div>

      <div v-if="pending.analysis.uncertainties.length" class="rounded-3xl bg-black/[0.035] p-5">
        <p class="summary-label">还不能确定</p>
        <ul class="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-[var(--muted)]">
          <li v-for="item in pending.analysis.uncertainties" :key="item">{{ item }}</li>
        </ul>
      </div>

      <article
        v-if="repositoryNeedsNarrowerScope"
        class="rounded-3xl border border-amber-900/15 bg-amber-50/60 p-5"
      >
        <p class="summary-label">这不是整个文件夹的完整总结</p>
        <p class="mt-2 text-sm leading-6 text-[var(--muted)]">
          本次只依据安全扫描在上限内读到的部分。若你选了磁盘、桌面或很大的总目录，请先换成只属于这个项目的小文件夹。
        </p>
      </article>

      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <div class="grid gap-3 sm:grid-cols-2">
        <button class="primary-button w-full" type="button" :disabled="busy" @click="confirm">
          {{ busy ? "正在创建下一步…" : "正确，继续" }}
        </button>
        <button
          class="secondary-button w-full"
          type="button"
          :disabled="busy"
          @click="beginEditing"
        >
          修改
        </button>
      </div>
      <button class="text-button mx-auto block" type="button" :disabled="busy" @click="discard">
        {{
          repositoryNeedsNarrowerScope
            ? "选择更小的项目文件夹（丢弃这份草稿）"
            : "重新选择材料（丢弃这份草稿）"
        }}
      </button>
      <p class="text-center text-xs leading-5 text-[var(--muted)]">
        来源：{{ pending.analysis.sourceLabel }}
      </p>
    </div>
  </StageShell>
</template>
