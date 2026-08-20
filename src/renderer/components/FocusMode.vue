<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { RevivalProject } from "@/shared/domain/model";
import { platform } from "@/renderer/platform/web";
import { useRevivalStore } from "@/renderer/stores/revival";
import type { FocusEvent } from "@/shared/focus/contracts";
import { stylusHoldProgress, stylusReadyToDrop } from "@/shared/focus/stylus";

const props = defineProps<{
  project: RevivalProject;
  clock: string;
  started: boolean;
}>();

const emit = defineEmits<{
  close: [];
  finish: [];
}>();

const store = useRevivalStore();
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const phase = ref(1);
const resetOpen = ref(false);
const resetCause = ref<"manual" | "guardian">("manual");
const resetPrimaryButton = ref<HTMLButtonElement | null>(null);
const guardianAvailable = ref(false);
const guardianActive = ref(false);
const guardianBusy = ref(false);
const guardianMessage = ref("");
const guardianEvent = ref<FocusEvent | null>(null);
const selectedApps = ref<string[]>([]);
const blockedApps = ref<string[]>([]);
const strictAllowlist = ref(true);
const customAllowedAppsText = ref("");
const customBlockedAppsText = ref("");
const entryHolding = ref(false);
const entryProgress = ref(0);
const entryBusy = ref(false);
const entryError = ref("");
const finishing = ref(false);
const phaseTimers: number[] = [];
let unsubscribeFocus: () => void = () => undefined;
let entryAnimationFrame = 0;
let entryStartedAt = 0;
let completionTimer = 0;
let guardianLifecycleGeneration = 0;
let guardianStarting = false;
let focusModeUnmounted = false;
let resetReturnFocus: HTMLElement | null = null;
const resetFocusTimers: number[] = [];
const quickAppGroups = [
  {
    label: "文档与申请",
    apps: [
      { label: "WPS", values: ["wps", "et", "wpp"] },
      { label: "Word", values: ["winword"] },
      { label: "Excel", values: ["excel"] },
      { label: "PowerPoint", values: ["powerpnt"] },
      { label: "Notion", values: ["Notion"] },
      { label: "Adobe Acrobat", values: ["Acrobat"] }
    ]
  },
  {
    label: "沟通",
    apps: [
      { label: "飞书", values: ["Feishu"] },
      { label: "微信", values: ["WeChat"] }
    ]
  },
  {
    label: "开发",
    apps: [
      { label: "VS Code", values: ["Code"] },
      { label: "Cursor", values: ["Cursor"] },
      { label: "JetBrains", values: ["idea64", "pycharm64", "webstorm64"] },
      { label: "Visual Studio", values: ["devenv"] },
      { label: "Windows Terminal", values: ["WindowsTerminal"] }
    ]
  },
  {
    label: "浏览器与设计",
    apps: [
      { label: "Chrome", values: ["chrome"] },
      { label: "Edge", values: ["msedge"] },
      { label: "Firefox", values: ["firefox"] },
      { label: "Figma", values: ["Figma"] }
    ]
  }
];
const lastScene = computed(
  () => props.project.evidence.at(-1)?.note ?? props.project.restore.lastCompleted
);
const entryStyle = computed(() => ({
  "--entry-progress": `${Math.round(entryProgress.value * 360)}deg`
}));
const configuredAllowedApps = computed(() => [
  ...selectedApps.value,
  ...parseCustomApps(customAllowedAppsText.value)
]);

function advance(): void {
  if (phase.value === 1) phase.value = 2;
}

function cancelEntryHold(reset = true): void {
  if (entryAnimationFrame) cancelAnimationFrame(entryAnimationFrame);
  entryAnimationFrame = 0;
  entryHolding.value = false;
  entryStartedAt = 0;
  if (reset && !entryBusy.value) entryProgress.value = 0;
}

async function dropNeedle(): Promise<void> {
  if (entryBusy.value || phase.value !== 2) return;
  cancelEntryHold(false);
  entryBusy.value = true;
  entryError.value = "";
  try {
    if (!props.project.action?.startedAt) await store.beginAction();
    entryProgress.value = 1;
    phase.value = 3;
  } catch (error) {
    entryProgress.value = 0;
    entryError.value = error instanceof Error ? error.message : "这一小步暂时无法开始";
  } finally {
    entryBusy.value = false;
  }
}

function updateEntryHold(timestamp: number): void {
  if (!entryHolding.value) return;
  entryProgress.value = stylusHoldProgress(entryStartedAt, timestamp);
  if (stylusReadyToDrop(entryStartedAt, timestamp)) {
    void dropNeedle();
    return;
  }
  entryAnimationFrame = requestAnimationFrame(updateEntryHold);
}

function beginEntryHold(): void {
  if (entryHolding.value || entryBusy.value || phase.value !== 2) return;
  entryHolding.value = true;
  entryProgress.value = 0;
  entryStartedAt = performance.now();
  entryAnimationFrame = requestAnimationFrame(updateEntryHold);
}

function releaseEntryHold(): void {
  if (!entryHolding.value) return;
  if (stylusReadyToDrop(entryStartedAt, performance.now())) {
    void dropNeedle();
    return;
  }
  cancelEntryHold();
}

function groupSelected(list: readonly string[], values: readonly string[]): boolean {
  return values.every((value) => list.includes(value));
}

function toggleAllowedAppGroup(values: readonly string[]): void {
  const selected = groupSelected(selectedApps.value, values);
  blockedApps.value = blockedApps.value.filter((item) => !values.includes(item));
  selectedApps.value = selected
    ? selectedApps.value.filter((item) => !values.includes(item))
    : [...new Set([...selectedApps.value, ...values])];
}

function toggleBlockedAppGroup(values: readonly string[]): void {
  const selected = groupSelected(blockedApps.value, values);
  selectedApps.value = selectedApps.value.filter((item) => !values.includes(item));
  blockedApps.value = selected
    ? blockedApps.value.filter((item) => !values.includes(item))
    : [...new Set([...blockedApps.value, ...values])];
}

function parseCustomApps(value: string): string[] {
  return value
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
  const allowedApps = configuredAllowedApps.value;
  if (strictAllowlist.value && allowedApps.length === 0) {
    guardianMessage.value = "严格白名单至少要选择一个完成这一步需要的软件。";
    return;
  }
  const generation = ++guardianLifecycleGeneration;
  guardianStarting = true;
  guardianBusy.value = true;
  guardianMessage.value = "";
  try {
    const event = await platform.startFocusGuardian({
      allowedApps,
      blockedApps: [...blockedApps.value, ...parseCustomApps(customBlockedAppsText.value)],
      strictAllowlist: strictAllowlist.value,
      graceSeconds: 12,
      idlePauseSeconds: 90
    });
    if (focusModeUnmounted || generation !== guardianLifecycleGeneration) {
      await platform.stopFocusGuardian().catch(() => undefined);
      return;
    }
    receiveFocusEvent(event);
  } catch (error) {
    if (!focusModeUnmounted && generation === guardianLifecycleGeneration) {
      guardianMessage.value = error instanceof Error ? error.message : "偏离提醒启动失败";
    }
  } finally {
    if (generation === guardianLifecycleGeneration) {
      guardianStarting = false;
      guardianBusy.value = false;
    }
  }
}

async function stopGuardian(): Promise<void> {
  const shouldStop = guardianActive.value || guardianStarting;
  const generation = ++guardianLifecycleGeneration;
  guardianStarting = false;
  if (!shouldStop) return;
  try {
    const event = await platform.stopFocusGuardian();
    if (!focusModeUnmounted && generation === guardianLifecycleGeneration) {
      receiveFocusEvent(event);
    }
  } catch (error) {
    if (!focusModeUnmounted && generation === guardianLifecycleGeneration) {
      guardianMessage.value = error instanceof Error ? error.message : "偏离提醒停止失败";
    }
  } finally {
    if (generation === guardianLifecycleGeneration) {
      guardianActive.value = false;
      guardianBusy.value = false;
      if (resetCause.value === "guardian") resetOpen.value = false;
    }
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
  resetOpen.value = true;
}

async function close(): Promise<void> {
  await stopGuardian();
  emit("close");
}

async function finish(): Promise<void> {
  if (finishing.value) return;
  finishing.value = true;
  await stopGuardian();
  completionTimer = window.setTimeout(() => emit("finish"), reducedMotion ? 0 : 700);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") void close();
  if (event.key === "Enter" && phase.value === 1) advance();
}

function clearResetFocusTimers(): void {
  resetFocusTimers.splice(0).forEach(window.clearTimeout);
}

function focusResetPrimary(): void {
  if (!resetOpen.value || focusModeUnmounted) return;
  const button = resetPrimaryButton.value;
  if (!button) return;
  const activeElement = document.activeElement;
  const takeover = button.closest('[role="alertdialog"]');
  if (activeElement instanceof HTMLElement && takeover?.contains(activeElement)) return;
  button.focus({ preventScroll: true });
}

function scheduleResetFocus(): void {
  clearResetFocusTimers();
  focusResetPrimary();
  // Windows may activate the BrowserWindow just after the renderer receives the
  // guardian event. Retry only while focus is outside the takeover so a user's
  // own choice inside the dialog is never overridden.
  [100, 350, 750, 1_500, 2_500, 4_000, 6_500, 8_500].forEach((delay) => {
    resetFocusTimers.push(window.setTimeout(focusResetPrimary, delay));
  });
}

function onWindowFocus(): void {
  if (!resetOpen.value) return;
  void nextTick().then(focusResetPrimary);
}

watch(resetOpen, async (open) => {
  if (open) {
    resetReturnFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    await nextTick();
    scheduleResetFocus();
    return;
  }
  clearResetFocusTimers();
  await nextTick();
  if (focusModeUnmounted) return;
  if (resetReturnFocus?.isConnected) resetReturnFocus.focus();
  else document.querySelector<HTMLButtonElement>(".focus-complete")?.focus();
  resetReturnFocus = null;
});

onMounted(() => {
  document.body.classList.add("focus-mode-active");
  window.addEventListener("keydown", onKeydown);
  window.addEventListener("focus", onWindowFocus);
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
    phaseTimers.push(
      window.setTimeout(() => {
        if (phase.value === 1) phase.value = 2;
      }, 3_200)
    );
  }
});

onBeforeUnmount(() => {
  focusModeUnmounted = true;
  const shouldStopGuardian = guardianActive.value || guardianStarting;
  guardianLifecycleGeneration += 1;
  guardianStarting = false;
  document.body.classList.remove("focus-mode-active");
  window.removeEventListener("keydown", onKeydown);
  window.removeEventListener("focus", onWindowFocus);
  unsubscribeFocus();
  clearResetFocusTimers();
  cancelEntryHold();
  if (completionTimer) window.clearTimeout(completionTimer);
  if (shouldStopGuardian) void platform.stopFocusGuardian().catch(() => undefined);
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

        <div v-else-if="phase === 2" key="action" class="focus-phase-card focus-entry-card">
          <p class="focus-eyebrow">现在 · 只做这一步</p>
          <h2 class="focus-action">{{ project.action?.text }}</h2>
          <p class="focus-entry-done">完成标准：{{ project.action?.doneDefinition }}</p>

          <div
            class="focus-entry-scene"
            :class="{ 'focus-entry-scene-holding': entryHolding || entryBusy }"
            aria-hidden="true"
          >
            <div class="focus-entry-record"><span /></div>
            <div class="focus-entry-stylus"><i /></div>
          </div>

          <button
            class="focus-entry-hold"
            type="button"
            :style="entryStyle"
            :disabled="entryBusy"
            aria-label="按住 0.8 秒，让唱针落下并开始这一小步"
            @pointerdown.prevent="beginEntryHold"
            @pointerup.prevent="releaseEntryHold"
            @pointerleave="cancelEntryHold()"
            @pointercancel="cancelEntryHold()"
            @keydown.space.prevent="beginEntryHold"
            @keyup.space.prevent="releaseEntryHold"
            @keydown.enter.prevent="beginEntryHold"
            @keyup.enter.prevent="releaseEntryHold"
            @click.prevent
          >
            <span>{{ entryBusy ? "正在落针…" : "按住 0.8 秒，让唱针落下" }}</span>
            <small>
              {{
                entryHolding ? `${Math.round(entryProgress * 100)}%` : "鼠标、触摸、空格或 Enter"
              }}
            </small>
          </button>
          <p v-if="entryError" class="focus-entry-error" role="alert">{{ entryError }}</p>
          <p class="focus-hint">松开即取消；不需要处理整个项目</p>
        </div>

        <div
          v-else-if="resetOpen"
          key="reset"
          class="focus-reset focus-reset-takeover"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="focus-reset-title"
          aria-describedby="focus-reset-description"
        >
          <div class="focus-reset-copy">
            <p class="focus-reset-kicker">停一下。你已经回来了。</p>
            <p
              v-if="resetCause === 'guardian' && guardianEvent?.appName"
              id="focus-reset-description"
              class="focus-reset-app"
            >
              刚才切到了 {{ guardianEvent.appName }}。
              <template v-if="guardianEvent.violationKind === 'blocked'">
                它在本次黑名单中。
              </template>
            </p>
            <p v-else id="focus-reset-description" class="focus-reset-app">
              这是你主动叫回的当前行动。
            </p>
            <h2 id="focus-reset-title">现在只完成：{{ project.action?.text }}</h2>
            <p class="focus-reset-done">完成标准：{{ project.action?.doneDefinition }}</p>
          </div>
          <div class="focus-reset-actions">
            <button
              ref="resetPrimaryButton"
              class="focus-reset-primary"
              type="button"
              :disabled="guardianBusy"
              @click="
                resetCause === 'guardian' ? acknowledgeGuardian('resume') : (resetOpen = false)
              "
            >
              回到当前行动
            </button>
            <button
              v-if="resetCause === 'guardian' && guardianEvent?.violationKind !== 'blocked'"
              class="focus-reset-back"
              type="button"
              :disabled="guardianBusy"
              @click="acknowledgeGuardian('necessary')"
            >
              这是必要工作 · 本次放行
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
          <p class="focus-reset-exit-hint">按 Esc 随时离开专注</p>
        </div>

        <div
          v-else
          key="live"
          class="focus-live-card"
          :class="{ 'focus-live-card-finishing': finishing }"
        >
          <p class="focus-project">{{ project.title }}</p>
          <div class="focus-presence" aria-hidden="true">
            <div class="focus-presence-record"><span /></div>
            <div class="focus-presence-stylus"><i /></div>
            <span class="focus-presence-piece" />
          </div>
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
                白名单是这一步需要的软件；黑名单始终立即拉回。守护不会关闭其他软件，也不能区分浏览器里的具体网页。
              </p>
              <p class="focus-guardian-title">未列入白名单时</p>
              <div class="focus-apps" aria-label="白名单守护强度">
                <button
                  :class="['focus-app-chip', { selected: strictAllowlist }]"
                  type="button"
                  :aria-pressed="strictAllowlist"
                  @click="strictAllowlist = true"
                >
                  严格白名单 · 立即拉回
                </button>
                <button
                  :class="['focus-app-chip', { selected: !strictAllowlist }]"
                  type="button"
                  :aria-pressed="!strictAllowlist"
                  @click="strictAllowlist = false"
                >
                  12 秒宽限 · 可短暂切换
                </button>
              </div>
              <p class="focus-guardian-title">白名单 · 本次允许</p>
              <div class="focus-app-groups" aria-label="本次白名单软件">
                <div v-for="group in quickAppGroups" :key="`allow-${group.label}`">
                  <p class="focus-app-group-label">{{ group.label }}</p>
                  <div class="focus-apps">
                    <button
                      v-for="app in group.apps"
                      :key="`allow-${app.label}`"
                      :class="[
                        'focus-app-chip',
                        { selected: groupSelected(selectedApps, app.values) }
                      ]"
                      type="button"
                      :aria-pressed="groupSelected(selectedApps, app.values)"
                      @click="toggleAllowedAppGroup(app.values)"
                    >
                      {{ app.label }}
                    </button>
                  </div>
                </div>
              </div>
              <details class="focus-custom-details">
                <summary>没有找到？添加其他软件</summary>
                <label class="focus-custom-app">
                  <span>其他白名单软件（可选，用逗号分开）</span>
                  <input
                    v-model="customAllowedAppsText"
                    maxlength="240"
                    placeholder="例如：Photoshop, Obsidian"
                  />
                </label>
              </details>
              <p class="focus-guardian-title">黑名单 · 明确排除</p>
              <div class="focus-app-groups" aria-label="本次黑名单软件">
                <div v-for="group in quickAppGroups" :key="`block-${group.label}`">
                  <p class="focus-app-group-label">{{ group.label }}</p>
                  <div class="focus-apps">
                    <button
                      v-for="app in group.apps"
                      :key="`block-${app.label}`"
                      :class="[
                        'focus-app-chip',
                        { selected: groupSelected(blockedApps, app.values) }
                      ]"
                      type="button"
                      :aria-pressed="groupSelected(blockedApps, app.values)"
                      @click="toggleBlockedAppGroup(app.values)"
                    >
                      {{ app.label }}
                    </button>
                  </div>
                </div>
              </div>
              <details class="focus-custom-details">
                <summary>添加其他黑名单软件</summary>
                <label class="focus-custom-app">
                  <span>其他黑名单软件（可选，用逗号分开）</span>
                  <input
                    v-model="customBlockedAppsText"
                    maxlength="240"
                    placeholder="例如：Discord, Steam"
                  />
                </label>
              </details>
              <button
                class="focus-guardian-start"
                type="button"
                :disabled="guardianBusy"
                @click="startGuardian"
              >
                {{ guardianBusy ? "正在开启…" : "开启本次白／黑名单守护" }}
              </button>
              <p v-if="guardianMessage" class="focus-guardian-warning" role="status">
                {{ guardianMessage }}
              </p>
            </template>

            <div v-else-if="guardianActive" class="focus-guardian-running">
              <p>{{ guardianMessage }}</p>
              <p v-if="guardianEvent?.phase === 'grace'" class="focus-guardian-warning">
                {{ guardianEvent.appName }} 不在允许列表，{{ guardianEvent.graceRemainingSeconds }}
                秒后拉回。
              </p>
              <p v-if="guardianEvent?.violationKind === 'blocked'" class="focus-guardian-warning">
                {{ guardianEvent.appName }} 在本次黑名单中，已立即拉回。
              </p>
              <button class="focus-secondary" type="button" @click="stopGuardian">
                结束本次守护
              </button>
            </div>

            <p v-else class="focus-guardian-copy">{{ guardianMessage }}</p>
          </section>

          <div class="focus-controls">
            <button class="focus-complete" type="button" :disabled="finishing" @click="finish">
              {{ finishing ? "正在把这一块留下…" : "我留下了一个结果" }}
            </button>
            <button class="focus-secondary" type="button" @click="openManualReset">
              我偏离了，帮我回来
            </button>
            <button class="focus-secondary" type="button" @click="close">先离开一下</button>
          </div>
        </div>
      </Transition>
    </section>
  </Teleport>
</template>
