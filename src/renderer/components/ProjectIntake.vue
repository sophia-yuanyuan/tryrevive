<script setup lang="ts">
import { computed, ref } from "vue";
import { useRevivalStore } from "@/renderer/stores/revival";
import { parseProjectDump } from "@/shared/domain/intake";
import { readLocalTextMaterials, type LocalMaterialBundle } from "@/shared/domain/local-materials";
import type { ProjectAnalysis } from "@/shared/domain/model";
import CloudContextAssist from "@/renderer/components/CloudContextAssist.vue";

const store = useRevivalStore();
const context = ref("");
const projectNames = ref("");
const busy = ref(false);
const error = ref("");
const fileInput = ref<HTMLInputElement | null>(null);
const localMaterials = ref<LocalMaterialBundle | null>(null);
const parsedProjectNames = computed(() => parseProjectDump(projectNames.value));
const localAnalysisLabel = computed(() => {
  const count = localMaterials.value?.materials.length ?? 0;
  return count ? `从 ${count} 份材料生成待确认草稿` : "让 TryRevive 先猜一遍";
});

async function chooseRepository(): Promise<void> {
  busy.value = true;
  error.value = "";
  try {
    await store.inferRepository();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "项目文件夹扫描失败";
  } finally {
    busy.value = false;
  }
}

async function importMaterials(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = "";
  if (!files.length) return;
  busy.value = true;
  error.value = "";
  try {
    localMaterials.value = await readLocalTextMaterials(files);
  } catch (caught) {
    localMaterials.value = null;
    error.value = caught instanceof Error ? caught.message : "无法读取这些文字材料";
  } finally {
    busy.value = false;
  }
}

function clearLocalMaterials(): void {
  localMaterials.value = null;
  error.value = "";
}

async function analyzeContext(): Promise<void> {
  const manualContext = context.value.trim();
  const materialBundle = localMaterials.value;
  const content = [manualContext, materialBundle?.content ?? ""].filter(Boolean).join("\n\n");
  if (content.length < 4) {
    error.value = "至少写一句项目现场，或选择一份本地文字材料。";
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    await store.inferLocalContext({
      content,
      sourceKind: materialBundle ? "material" : "text",
      sourceLabel: materialBundle?.sourceLabel ?? "主动输入",
      titleHint: materialBundle?.titleHint
    });
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "暂时无法理解这段内容";
  } finally {
    busy.value = false;
  }
}

async function acceptCloudAnalysis(
  analysis: ProjectAnalysis,
  sourceKind: "material" | "voice",
  titleHint: string
): Promise<void> {
  busy.value = true;
  error.value = "";
  try {
    await store.inferProvidedAnalysis({ analysis, sourceKind, titleHint });
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "云端恢复草稿保存失败";
  } finally {
    busy.value = false;
  }
}

async function collectProjectNames(): Promise<void> {
  if (!parsedProjectNames.value.length) {
    error.value = "先写下至少一个项目名称。";
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    await store.newProjects(parsedProjectNames.value);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "项目入口保存失败";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="intake-stage" aria-labelledby="intake-title">
    <div class="intake-copy">
      <p class="eyebrow">重新接上一个真实项目</p>
      <h1 id="intake-title" class="intake-title">先把现场交给 TryRevive。</h1>
      <p class="intake-description">
        选择项目文件夹、上传常见附件、说一段话，或写下你记得的内容。TryRevive
        会先猜“你做到这里”，由你点正确或修改。
      </p>
      <div class="intake-principles" aria-label="理解边界">
        <span>确认前不创建正式项目</span>
        <span>不执行仓库代码</span>
        <span>不把猜测写成事实</span>
      </div>
    </div>

    <div class="intake-console space-y-6">
      <section class="rounded-3xl border border-[var(--line)] bg-white/55 p-5 sm:p-6">
        <p class="field-label">从项目文件夹恢复</p>
        <p class="field-help">
          桌面版只读扫描最多 180
          个可读文件；跳过依赖、构建产物、隐藏目录、凭据和大文件，不运行任何脚本。
        </p>
        <button
          class="primary-button mt-4 w-full"
          type="button"
          :disabled="busy || store.platformKind !== 'desktop'"
          @click="chooseRepository"
        >
          {{ busy ? "正在有限扫描…" : "选择项目文件夹并安全扫描" }}
        </button>
        <p v-if="store.platformKind !== 'desktop'" class="mt-3 text-xs text-[var(--muted)]">
          网页版不能读取文件夹；可以上传文字材料或直接输入。
        </p>
      </section>

      <CloudContextAssist
        presentation="intake"
        :initially-expanded="true"
        @accepted="acceptCloudAnalysis"
      />

      <p v-if="error" class="form-error" role="alert">{{ error }}</p>

      <form class="space-y-4" @submit.prevent="analyzeContext">
        <div class="intake-toolbar">
          <div>
            <label class="field-label" for="project-context">本地文字材料或你记得的内容</label>
            <p class="field-help">最好包含：最初目标、上次做到哪里、现在卡在哪里。</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              class="secondary-button"
              type="button"
              :disabled="busy"
              @click="fileInput?.click()"
            >
              选择本地文字材料
            </button>
            <input
              ref="fileInput"
              class="sr-only"
              type="file"
              multiple
              accept="text/plain,text/markdown,text/csv,application/json,.txt,.md,.csv,.json,.yaml,.yml"
              @change="importMaterials"
            />
          </div>
        </div>

        <div
          v-if="localMaterials"
          class="rounded-2xl border border-[var(--focus)]/20 bg-[var(--focus)]/[0.045] p-4"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="field-label">将在本机读取的材料</p>
              <ul class="mt-2 space-y-1 text-sm leading-6 text-[var(--ink)]">
                <li
                  v-for="(item, index) in localMaterials.materials"
                  :key="`${item.name}-${index}`"
                >
                  {{ item.name }} · {{ item.characters.toLocaleString("zh-CN") }} 字
                </li>
              </ul>
            </div>
            <button class="text-button shrink-0" type="button" @click="clearLocalMaterials">
              清除
            </button>
          </div>
          <p class="mt-3 text-xs leading-5 text-[var(--muted)]">
            原文不会写入存档；会保存生成的待确认摘要，只有你确认后才创建正式项目。
          </p>
        </div>

        <textarea
          id="project-context"
          v-model="context"
          class="field-input intake-textarea"
          maxlength="20000"
          autofocus
          placeholder="我想完成 TryRevive 桌面版。上次已经接好 Vue 页面，现在卡在不知道怎样把仓库现状变成下一小步。"
        />
        <p class="voice-status">
          本机支持 TXT、Markdown、CSV、JSON、YAML，一次最多 8 份；不会发送给 TryRevive 后端或
          OpenAI。一次请选择属于同一个项目的材料；多个项目请逐个恢复。PDF、DOCX、图片和音频当前不冒充本地已理解。
        </p>
        <button class="primary-button w-full" type="submit" :disabled="busy">
          {{ busy ? "正在整理恢复摘要…" : localAnalysisLabel }}
        </button>
      </form>

      <details class="rounded-3xl border border-[var(--line)] p-5">
        <summary class="cursor-pointer text-sm font-semibold text-[var(--ink)]">
          只先收纳多个项目名称
        </summary>
        <form class="mt-5 space-y-4" @submit.prevent="collectProjectNames">
          <div>
            <label class="field-label" for="project-names">所有还在心里的项目</label>
            <p class="field-help">保留原来的快速收纳方式；每行一个，之后再逐个补现场。</p>
          </div>
          <textarea
            id="project-names"
            v-model="projectNames"
            class="field-input min-h-28 resize-y"
            maxlength="4000"
            placeholder="申请黑客松&#10;报名英语考试&#10;整理作品集"
          />
          <p v-if="parsedProjectNames.length" class="text-sm text-[var(--muted)]">
            识别到 {{ parsedProjectNames.length }} 个项目
          </p>
          <button class="secondary-button w-full" type="submit" :disabled="busy">
            {{ busy ? "正在保存…" : `收下这 ${parsedProjectNames.length || 0} 个项目` }}
          </button>
        </form>
      </details>
    </div>
  </section>
</template>
