<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { RevivalProject } from "@/shared/domain/model";
import { platform } from "@/renderer/platform/web";
import type { FocusEvent } from "@/shared/focus/contracts";

const props = defineProps<{
  project: RevivalProject;
  clock: string;
}>();

const emit = defineEmits<{
  close: [];
  finish: [];
}>();

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const phase = ref(reducedMotion ? 3 : 1);
const resetOpen = ref(false);
const resetCause = ref<"manual" | "guardian">("manual");
const guardianAvailable = ref(false);
const guardianActive = ref(false);
const guardianBusy = ref(false);
const guardianMessage = ref("");
const guardianEvent = ref<FocusEvent | null>(null);
const selectedApps = ref<string[]>([]);
const customApps = ref("");
const phaseTimers: number[] = [];
let unsubscribeFocus: () => void = () => undefined;
const quickApps = [
  { label: "Chrome", value: "chrome" },
  { label: "Edge", value: "msedge" },
  { label: "Word", value: "winword" },
  { label: "PowerPoint", value: "powerpnt" },
  { label: "Excel", value: "excel" },
  { label: "VS Code", value: "Code" },
  { label: "Cursor", value: "Cursor" },
  { label: "Windows Terminal", value: "WindowsTerminal" }
];
const lastScene = computed(
  () => props.project.evidence.at(-1)?.note ?? props.project.restore.lastCompleted
);
const anchor = computed(
  () => props.project.restore.whyMatters || "你可以先回到眼前这一个可见结果。"
);

function advance(): void {
  if (phase.value < 3) phase.value += 1;
}

function toggleApp(value: string): void {
  selectedApps.value = selectedApps.value.includes(value)
    ? selectedApps.value.filter((item) => item !== value)
    : [...selectedApps.value, value];
}

function customAllowedApps(): string[] {
  return customApps.value
    .split(/[，,、;；\n]/u)
    .map((item) => item.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 8);
}

function receiveFocusEvent(event: FocusEvent): void {
  guardianEvent.value = event;
  guardianActive.value = !["stopped", "error"].includes(event.phase);
  guardianMessage.value = event.message;
  if (event.phase === "blocked") {
    resetCause.value = "guardian";
    resetOpen.value = true;
  } else if (["stopped", "error"].includes(event.phase) && resetCause.value === "guardian") {
    resetOpen.value = false;
  }
}

async function startGuardian(): Promise<void> {
  guardianBusy.value = true;
  guardianMessage.value = "";
  try {
    receiveFocusEvent(
      await platform.startFocusGuardian({
        allowedApps: [...selectedApps.value, ...customAllowedApps()],
        graceSeconds: 12,
        idlePauseSeconds: 90
      })
    );
  } catch (error) {
    guardianMessage.value = error instanceof Error ? error.message : "偏离提醒启动失败";
  } finally {
    guardianBusy.value = false;
  }
}

async function stopGuardian(): Promise<void> {
  if (!guardianActive.value) return;
  try {
    receiveFocusEvent(await platform.stopFocusGuardian());
  } catch (error) {
    guardianMessage.value = error instanceof Error ? error.message : "偏离提醒停止失败";
  } finally {
    guardianActive.value = false;
    if (resetCause.value === "guardian") resetOpen.value = false;
  }
}

async function acknowledgeGuardian(action: "resume" | "necessary"): Promise<void> {
  guardianBusy.value = true;
  try {
    receiveFocusEvent(await platform.acknowledgeFocusGuardian(action));
    resetOpen.value = false;
  } catch (error) {
    guardianMessage.value = error instanceof Error ? error.message : "无法处理这次偏离";
  } finally {
    guardianBusy.value = false;
  }
}

function openManualReset(): void {
  resetCause.value = "manual";
  resetOpen.value = !resetOpen.value;
}

async function close(): Promise<void> {
  await stopGuardian();
  emit("close");
}

async function finish(): Promise<void> {
  await stopGuardian();
  emit("finish");
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") void close();
  if (event.key === "Enter" && phase.value < 3) advance();
}

onMounted(() => {
  document.body.classList.add("focus-mode-active");
  window.addEventListener("keydown", onKeydown);
  unsubscribeFocus = platform.onFocusEvent(receiveFocusEvent);
  void platform
    .focusCapability()
    .then((capability) => {
      guardianAvailable.value = capability.available;
      guardianActive.value = capability.active;
      guardianMessage.value = capability.message;
    })
    .catch((error: unknown) => {
      guardianMessage.value = error instanceof Error ? error.message : "无法读取偏离提醒状态";
    });
  if (!reducedMotion) {
    phaseTimers.push(window.setTimeout(() => (phase.value = 2), 3_200));
    phaseTimers.push(window.setTimeout(() => (phase.value = 3), 6_400));
  }
});

onBeforeUnmount(() => {
  document.body.classList.remove("focus-mode-active");
  window.removeEventListener("keydown", onKeydown);
  unsubscribeFocus();
  if (guardianActive.value) void platform.stopFocusGuardian().catch(() => undefined);
  phaseTimers.forEach(window.clearTimeout);
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
});
</script>

<template>
  <Teleport to="body">
    <section
      class="focus-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="专注界面"
      @click.self="advance"
    >
      <div class="focus-orbit focus-orbit-one" aria-hidden="true" />
      <div class="focus-orbit focus-orbit-two" aria-hidden="true" />

      <button class="focus-exit" type="button" @click="close">Esc · 离开专注</button>

      <Transition name="focus-phase" mode="out-in">
        <div v-if="phase === 1" key="scene" class="focus-phase-card" @click="advance">
          <p class="focus-eyebrow">回到上次离开的地方</p>
          <blockquote class="focus-quote">“{{ lastScene }}”</blockquote>
          <p class="focus-hint">轻触或按 Enter 继续</p>
        </div>

        <div v-else-if="phase === 2" key="action" class="focus-phase-card" @click="advance">
          <p class="focus-eyebrow">现在 · 只做这一步</p>
          <h2 class="focus-action">{{ project.action?.text }}</h2>
          <p class="focus-hint">不需要处理整个项目</p>
        </div>

        <div v-else key="live" class="focus-live-card">
          <p class="focus-project">{{ project.title }}</p>
          <time class="focus-clock" aria-label="当前时间盒剩余时间">{{ clock }}</time>
          <h2 class="focus-live-action">{{ project.action?.text }}</h2>
          <p class="focus-done">完成标准：{{ project.action?.doneDefinition }}</p>

          <section class="focus-guardian" aria-label="Windows 偏离提醒">
            <div class="focus-guardian-head">
              <div>
                <p class="focus-guardian-title">Windows 偏离提醒</p>
                <p class="focus-guardian-copy">
                  只在本次专注读取前台应用名和空闲时长；不读取按键、窗口标题或网页。
                </p>
              </div>
              <span :class="['focus-guardian-state', { active: guardianActive }]">
                {{ guardianActive ? "运行中" : "默认关闭" }}
              </span>
            </div>

            <template v-if="guardianAvailable && !guardianActive">
              <p class="focus-guardian-copy">
                选择这一步需要使用的软件；未选择的软件会先获得 12 秒宽限。
              </p>
              <div class="focus-apps" aria-label="本次允许的软件">
                <button
                  v-for="app in quickApps"
                  :key="app.value"
                  :class="['focus-app-chip', { selected: selectedApps.includes(app.value) }]"
                  type="button"
                  :aria-pressed="selectedApps.includes(app.value)"
                  @click="toggleApp(app.value)"
                >
                  {{ app.label }}
                </button>
              </div>
              <label class="focus-custom-app">
                <span>其他软件（可选，用逗号分开）</span>
                <input v-model="customApps" maxlength="240" placeholder="例如：Notion, Photoshop" />
              </label>
              <button
                class="focus-guardian-start"
                type="button"
                :disabled="guardianBusy"
                @click="startGuardian"
              >
                {{ guardianBusy ? "正在开启…" : "开启本次偏离提醒" }}
              </button>
            </template>

            <div v-else-if="guardianActive" class="focus-guardian-running">
              <p>{{ guardianMessage }}</p>
              <p v-if="guardianEvent?.phase === 'grace'" class="focus-guardian-warning">
                {{ guardianEvent.appName }} 不在允许列表，{{ guardianEvent.graceRemainingSeconds }}
                秒后拉回。
              </p>
              <button class="focus-secondary" type="button" @click="stopGuardian">
                结束本次守护
              </button>
            </div>

            <p v-else class="focus-guardian-copy">{{ guardianMessage }}</p>
          </section>

          <div v-if="resetOpen" class="focus-reset" role="status">
            <span class="breath-core" aria-hidden="true" />
            <div>
              <p>先停一下，慢慢呼气。</p>
              <strong v-if="resetCause === 'guardian'">
                你现在在做什么？眼前这一步是：{{ project.action?.text }}
              </strong>
              <strong v-else>{{ anchor }}</strong>
              <p v-if="resetCause === 'guardian' && guardianEvent?.appName" class="focus-reset-app">
                刚才检测到：{{ guardianEvent.appName }}
              </p>
            </div>
            <div class="focus-reset-actions">
              <button
                v-if="resetCause === 'guardian'"
                class="focus-reset-back"
                type="button"
                :disabled="guardianBusy"
                @click="acknowledgeGuardian('necessary')"
              >
                这是必要工作
              </button>
              <button
                class="focus-reset-back"
                type="button"
                :disabled="guardianBusy"
                @click="
                  resetCause === 'guardian' ? acknowledgeGuardian('resume') : (resetOpen = false)
                "
              >
                我回到这一步
              </button>
              <button
                v-if="resetCause === 'guardian'"
                class="focus-reset-back"
                type="button"
                :disabled="guardianBusy"
                @click="stopGuardian"
              >
                结束本次守护
              </button>
            </div>
          </div>

          <div class="focus-controls">
            <button class="focus-complete" type="button" @click="finish">我留下了一个结果</button>
            <button
              v-if="!(resetOpen && resetCause === 'guardian')"
              class="focus-secondary"
              type="button"
              @click="openManualReset"
            >
              {{ resetOpen ? "收起重置" : "我偏离了，帮我回来" }}
            </button>
            <button class="focus-secondary" type="button" @click="close">先离开一下</button>
          </div>
        </div>
      </Transition>
    </section>
  </Teleport>
</template>
