<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogTrigger
} from "reka-ui";
import { useRevivalStore } from "@/renderer/stores/revival";
import { platform } from "@/renderer/platform/web";

const store = useRevivalStore();
const { activeProject, data, errorMessage, recoveryNotice, recoveryRequired, saveStatus } =
  storeToRefs(store);
const settingsOpen = ref(false);
const notice = ref("");
const isFullScreen = ref(false);
let unsubscribeFullScreen: () => void = () => undefined;

const saveLabel = computed(() => {
  if (saveStatus.value === "saving") return "正在保存";
  if (saveStatus.value === "error") return "保存遇到问题";
  if (saveStatus.value === "saved") return "已保存到本地";
  return "本地优先";
});

async function setFullScreen(enabled: boolean): Promise<void> {
  isFullScreen.value = await platform.setFullScreen(enabled);
}

function handleWindowKeydown(event: KeyboardEvent): void {
  if (
    event.key === "Escape" &&
    store.platformKind === "desktop" &&
    isFullScreen.value &&
    !document.body.classList.contains("focus-mode-active")
  ) {
    void setFullScreen(false);
  }
}

onMounted(async () => {
  void store.initialize();
  isFullScreen.value = await platform.fullScreenState().catch(() => false);
  unsubscribeFullScreen = platform.onFullScreenChanged((enabled) => {
    isFullScreen.value = enabled;
  });
  window.addEventListener("keydown", handleWindowKeydown);
});

onBeforeUnmount(() => {
  unsubscribeFullScreen();
  window.removeEventListener("keydown", handleWindowKeydown);
});

async function runDataAction(action: "export" | "import"): Promise<void> {
  notice.value = "";
  try {
    notice.value = action === "export" ? await store.exportData() : await store.importData();
  } catch (error) {
    notice.value = error instanceof Error ? error.message : "数据操作失败";
  }
}

async function startNewProject(): Promise<void> {
  await store.prepareNewProject();
  settingsOpen.value = false;
}
</script>

<template>
  <div class="app-shell min-h-screen">
    <div class="ambient ambient-one" aria-hidden="true" />
    <div class="ambient ambient-two" aria-hidden="true" />
    <header class="app-header">
      <RouterLink class="brand" to="/" aria-label="TryRevive 工作台">
        <span class="brand-mark" aria-hidden="true">T</span>
        <span>
          <strong class="block text-sm leading-none tracking-tight">TryRevive</strong>
          <small class="mt-1 block text-[10px] font-medium tracking-[0.14em] text-[var(--muted)]">
            从真实进度继续
          </small>
        </span>
      </RouterLink>

      <nav class="app-nav" aria-label="主要页面">
        <RouterLink to="/">工作台</RouterLink>
        <RouterLink to="/collection">黑胶星球</RouterLink>
      </nav>

      <div class="flex items-center gap-2">
        <span class="hidden text-xs text-[var(--muted)] sm:inline-flex" aria-live="polite">
          {{ saveLabel }} · {{ store.platformKind === "desktop" ? "桌面版" : "网页版" }}
        </span>
        <button
          v-if="store.platformKind === 'desktop'"
          class="fullscreen-toggle"
          type="button"
          @click="setFullScreen(!isFullScreen)"
        >
          {{ isFullScreen ? "退出全屏" : "进入全屏" }}
        </button>
        <DialogRoot v-model:open="settingsOpen">
          <DialogTrigger class="icon-button" aria-label="打开项目与数据设置">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
              <path d="M4 7h16M7 12h10M9 17h6" stroke="currentColor" stroke-width="1.8" />
            </svg>
          </DialogTrigger>
          <DialogPortal>
            <DialogOverlay class="dialog-overlay" />
            <DialogContent class="dialog-content">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <DialogTitle class="text-xl font-semibold text-[var(--ink)]">
                    项目与本地数据
                  </DialogTitle>
                  <DialogDescription class="mt-2 text-sm leading-6 text-[var(--muted)]">
                    切换项目，或导出一份可恢复的 JSON 备份。
                  </DialogDescription>
                </div>
                <DialogClose class="icon-button shrink-0" aria-label="关闭">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                    <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" stroke-width="1.8" />
                  </svg>
                </DialogClose>
              </div>

              <div class="mt-7">
                <p class="summary-label">本地项目</p>
                <p v-if="recoveryRequired" class="mt-3 text-sm leading-6 text-[var(--muted)]">
                  项目暂未载入；有效备份导入前不会显示空白列表，也不会覆盖原存档。
                </p>
                <div v-else class="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                  <button
                    v-if="data.pendingInference"
                    class="project-row"
                    :class="{ 'project-row-active': !activeProject }"
                    type="button"
                    :disabled="saveStatus === 'saving'"
                    @click="store.reviewInference().then(() => (settingsOpen = false))"
                  >
                    <span class="min-w-0">
                      <strong class="block truncate text-sm font-semibold">
                        {{ data.pendingInference.title }}
                      </strong>
                      <small class="mt-1 block text-xs text-[var(--muted)]">待确认恢复摘要</small>
                    </span>
                    <span aria-hidden="true">→</span>
                  </button>
                  <button
                    v-for="project in data.projects"
                    :key="project.id"
                    class="project-row"
                    :class="{ 'project-row-active': activeProject?.id === project.id }"
                    type="button"
                    :disabled="saveStatus === 'saving'"
                    @click="store.selectProject(project.id).then(() => (settingsOpen = false))"
                  >
                    <span class="min-w-0">
                      <strong class="block truncate text-sm font-semibold">{{
                        project.title
                      }}</strong>
                      <small class="mt-1 block text-xs text-[var(--muted)]">
                        {{
                          project.status === "active"
                            ? "进行中"
                            : project.status === "paused"
                              ? "已暂停"
                              : project.status === "completed"
                                ? "已完成"
                                : "已结束"
                        }}
                      </small>
                    </span>
                    <span aria-hidden="true">→</span>
                  </button>
                  <p
                    v-if="!data.pendingInference && !data.projects.length"
                    class="text-sm text-[var(--muted)]"
                  >
                    还没有本地项目。
                  </p>
                </div>
                <button
                  class="secondary-button mt-4 w-full"
                  type="button"
                  :disabled="recoveryRequired || saveStatus === 'saving'"
                  @click="startNewProject"
                >
                  新建另一个项目
                </button>
              </div>

              <div class="mt-7 border-t border-[var(--line)] pt-6">
                <p class="summary-label">备份与恢复</p>
                <div class="mt-3 grid grid-cols-2 gap-3">
                  <button
                    class="secondary-button"
                    type="button"
                    :disabled="recoveryRequired"
                    @click="runDataAction('export')"
                  >
                    导出备份
                  </button>
                  <button
                    class="secondary-button"
                    type="button"
                    :disabled="saveStatus === 'saving'"
                    @click="runDataAction('import')"
                  >
                    导入备份
                  </button>
                </div>
                <p v-if="notice" class="mt-3 text-sm text-[var(--muted)]" role="status">
                  {{ notice }}
                </p>
              </div>

              <RouterLink
                class="text-button mt-6 inline-flex"
                to="/collection"
                @click="settingsOpen = false"
              >
                打开黑胶星球
              </RouterLink>

              <RouterLink
                class="text-button ml-4 mt-6 inline-flex"
                to="/about"
                @click="settingsOpen = false"
              >
                TryRevive 如何工作
              </RouterLink>

              <RouterLink
                class="text-button ml-4 mt-6 inline-flex"
                to="/privacy"
                @click="settingsOpen = false"
              >
                隐私与数据控制
              </RouterLink>
            </DialogContent>
          </DialogPortal>
        </DialogRoot>
      </div>
    </header>

    <p v-if="errorMessage" class="error-banner" role="alert">{{ errorMessage }}</p>
    <p v-else-if="recoveryNotice" class="recovery-banner" role="status">
      {{ recoveryNotice }}
    </p>
    <main
      v-if="recoveryRequired"
      class="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12 lg:px-8"
    >
      <section class="stage-card" aria-labelledby="recovery-title">
        <p class="eyebrow">本地数据保护</p>
        <h1 id="recovery-title" class="stage-title">先恢复存档，再继续工作</h1>
        <p class="stage-copy">
          {{ recoveryNotice || "TryRevive 没有用空白项目覆盖无法验证的原存档。" }}
        </p>
        <button
          class="primary-button mt-7"
          type="button"
          :disabled="saveStatus === 'saving'"
          @click="runDataAction('import')"
        >
          导入 JSON 备份
        </button>
        <p class="mt-4 text-sm leading-6 text-[var(--muted)]">
          导入成功前，所有页面都会保持在这里；新建、修改和导出均已关闭，原存档保持不变。
        </p>
        <p v-if="notice" class="mt-4 text-sm" role="status">{{ notice }}</p>
      </section>
    </main>
    <RouterView v-else />
    <footer class="px-4 pb-7 text-center text-xs leading-5 text-[var(--muted)]">
      TryRevive 不替代老师、同伴或专业支持；项目方向与完成状态由你决定。
      <RouterLink class="ml-2 underline underline-offset-4" to="/privacy">
        隐私与数据控制
      </RouterLink>
    </footer>
  </div>
</template>
