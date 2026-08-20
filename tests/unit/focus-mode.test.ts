import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProject } from "@/shared/domain/model";
import type { FocusEvent } from "@/shared/focus/contracts";

const mocks = vi.hoisted(() => ({
  listener: null as ((event: FocusEvent) => void) | null,
  capability: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  acknowledge: vi.fn()
}));

vi.mock("@/renderer/platform/web", () => ({
  platform: {
    kind: "desktop",
    focusCapability: mocks.capability,
    startFocusGuardian: mocks.start,
    stopFocusGuardian: mocks.stop,
    acknowledgeFocusGuardian: mocks.acknowledge,
    onFocusEvent: (listener: (event: FocusEvent) => void) => {
      mocks.listener = listener;
      return () => {
        mocks.listener = null;
      };
    }
  }
}));

import FocusMode from "@/renderer/components/FocusMode.vue";
import { useRevivalStore } from "@/renderer/stores/revival";

const startingEvent: FocusEvent = {
  phase: "starting",
  appName: "",
  graceRemainingSeconds: 0,
  idleSeconds: 0,
  allowedApps: ["chrome", "electron"],
  blockedApps: ["msedge"],
  violationKind: null,
  message: "偏离提醒已开启"
};

describe("FocusMode guardian controls", () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    setActivePinia(createPinia());
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true })
    });
    mocks.start.mockReset().mockResolvedValue(startingEvent);
    mocks.capability.mockReset().mockResolvedValue({
      available: true,
      active: false,
      message: "可选开启"
    });
    mocks.stop.mockReset().mockResolvedValue({
      ...startingEvent,
      phase: "stopped",
      allowedApps: [],
      blockedApps: [],
      message: "已停止"
    });
    mocks.acknowledge.mockReset().mockResolvedValue({
      ...startingEvent,
      phase: "allowed",
      appName: "powershell",
      violationKind: null,
      message: "已回到当前这一步"
    });
    vi.spyOn(performance, "now").mockReturnValue(0);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(1_000);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  });

  it("requires an explicit start and exposes all exits after a blocked event", async () => {
    const project = createProject("课程项目", 1_800_000_000_000);
    project.restore = {
      lastCompleted: "完成了入口",
      stuckAt: "没有进入下一步",
      deadline: "",
      whyMatters: "想完成这次交付"
    };
    project.action = {
      id: "action-1",
      text: "写完报名页第一段",
      doneDefinition: "第一段保存到文档",
      minutes: 10,
      startedAt: 1_800_000_000_000,
      completedAt: null,
      createdAt: 1_800_000_000_000
    };

    const wrapper = mount(FocusMode, {
      props: { project, clock: "09:59", started: true },
      attachTo: document.body,
      global: { stubs: { Teleport: true } }
    });
    await flushPromises();

    expect(wrapper.text()).toContain("回到上次离开的地方");
    expect(wrapper.text()).not.toContain("Windows 偏离提醒");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await nextTick();
    await wrapper.get("button.focus-entry-hold").trigger("keydown", { key: "Enter" });
    await flushPromises();

    expect(wrapper.text()).toContain("默认关闭");
    expect(wrapper.text()).toContain("严格白名单 · 立即拉回");
    expect(wrapper.get('[aria-label="白名单守护强度"] button').attributes("aria-pressed")).toBe(
      "true"
    );
    expect(mocks.start).not.toHaveBeenCalled();
    await wrapper.get("button.focus-guardian-start").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("严格白名单至少要选择一个");
    expect(mocks.start).not.toHaveBeenCalled();
    await wrapper
      .findAll('[aria-label="本次白名单软件"] button.focus-app-chip')
      .find((button) => button.text() === "Chrome")
      ?.trigger("click");
    await wrapper
      .findAll('[aria-label="本次黑名单软件"] button.focus-app-chip')
      .find((button) => button.text() === "Edge")
      ?.trigger("click");
    await wrapper.get("button.focus-guardian-start").trigger("click");
    await flushPromises();
    expect(mocks.start).toHaveBeenCalledWith({
      allowedApps: ["chrome"],
      blockedApps: ["msedge"],
      strictAllowlist: true,
      graceSeconds: 12,
      idlePauseSeconds: 90
    });

    mocks.listener?.({
      phase: "blocked",
      appName: "powershell",
      graceRemainingSeconds: 0,
      idleSeconds: 0,
      allowedApps: ["chrome", "electron"],
      blockedApps: ["msedge"],
      violationKind: "unlisted",
      message: "你离开了本次允许的软件"
    });
    await nextTick();
    await flushPromises();

    const takeover = wrapper.get('[role="alertdialog"]');
    expect(takeover.classes()).toContain("focus-reset-takeover");
    expect(takeover.text()).toContain("停一下。你已经回来了");
    expect(wrapper.text()).toContain("现在只完成：写完报名页第一段");
    expect(wrapper.text()).toContain("完成标准：第一段保存到文档");
    expect(wrapper.text()).toContain("这是必要工作 · 本次放行");
    expect(wrapper.text()).toContain("回到当前行动");
    expect(wrapper.text()).toContain("结束本次守护");
    expect(wrapper.text()).not.toContain("我留下了一个结果");
    expect(document.activeElement).toBe(wrapper.get("button.focus-reset-primary").element);

    const necessary = wrapper
      .findAll("button")
      .find((button) => button.text().includes("本次放行"));
    await necessary?.trigger("click");
    await flushPromises();
    expect(mocks.acknowledge).toHaveBeenCalledWith("necessary");

    mocks.listener?.({
      phase: "blocked",
      appName: "msedge",
      graceRemainingSeconds: 0,
      idleSeconds: 0,
      allowedApps: ["chrome", "electron"],
      blockedApps: ["msedge"],
      violationKind: "blocked",
      message: "msedge 在本次黑名单中"
    });
    await nextTick();
    expect(wrapper.text()).toContain("本次黑名单");
    expect(wrapper.findAll("button").some((button) => button.text().includes("本次放行"))).toBe(
      false
    );
    wrapper.unmount();
    await flushPromises();
    expect(mocks.stop).toHaveBeenCalledTimes(1);
  });

  it("offers one-click common apps and maps WPS to its process aliases", async () => {
    const project = createProject("申请项目", 1_800_000_000_000);
    project.action = {
      id: "action-apps",
      text: "填写报名表",
      doneDefinition: "保存报名草稿",
      minutes: 10,
      startedAt: 1_800_000_000_000,
      completedAt: null,
      createdAt: 1_800_000_000_000
    };
    const wrapper = mount(FocusMode, {
      props: { project, clock: "09:59", started: true },
      global: { stubs: { Teleport: true } }
    });
    await flushPromises();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await nextTick();
    await wrapper.get("button.focus-entry-hold").trigger("keydown", { key: "Enter" });
    await flushPromises();

    expect(wrapper.text()).toContain("飞书");
    expect(wrapper.text()).toContain("WPS");
    expect(wrapper.text()).toContain("Figma");
    expect(wrapper.text()).toContain("没有找到？添加其他软件");
    await wrapper
      .findAll('[aria-label="本次白名单软件"] button.focus-app-chip')
      .find((button) => button.text() === "WPS")
      ?.trigger("click");
    await wrapper.get("button.focus-guardian-start").trigger("click");
    await flushPromises();

    expect(mocks.start).toHaveBeenCalledWith(
      expect.objectContaining({ allowedApps: ["wps", "et", "wpp"] })
    );
    wrapper.unmount();
  });

  it("turns a manual recenter into a full-screen alert and restores the live action", async () => {
    const project = createProject("作品集", 1_800_000_000_000);
    project.action = {
      id: "action-manual-recenter",
      text: "只改一张作品图的说明",
      doneDefinition: "说明文字已经保存",
      minutes: 10,
      startedAt: 1_800_000_000_000,
      completedAt: null,
      createdAt: 1_800_000_000_000
    };
    const wrapper = mount(FocusMode, {
      props: { project, clock: "09:59", started: true },
      attachTo: document.body,
      global: { stubs: { Teleport: true } }
    });
    await flushPromises();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await nextTick();
    await wrapper.get("button.focus-entry-hold").trigger("keydown", { key: "Enter" });
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text() === "我偏离了，帮我回来")
      ?.trigger("click");
    await nextTick();

    expect(wrapper.get('[role="alertdialog"]').text()).toContain("这是你主动叫回的当前行动");
    expect(document.activeElement).toBe(wrapper.get("button.focus-reset-primary").element);
    expect(wrapper.text()).not.toContain("我留下了一个结果");
    await wrapper.get("button.focus-reset-primary").trigger("click");
    await nextTick();
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("我留下了一个结果");
    wrapper.unmount();
  });

  it("keeps the last real scene visible when reduced motion is requested", async () => {
    const project = createProject("报名项目", 1_800_000_000_000);
    project.restore.lastCompleted = "已经写完报名简介";
    project.action = {
      id: "action-reduced-motion",
      text: "核对报名截止时间",
      doneDefinition: "截止时间写进项目",
      minutes: 5,
      startedAt: null,
      completedAt: null,
      createdAt: 1_800_000_000_000
    };

    const wrapper = mount(FocusMode, {
      props: { project, clock: "05:00", started: false },
      global: { stubs: { Teleport: true } }
    });
    await flushPromises();

    expect(wrapper.text()).toContain("回到上次离开的地方");
    expect(wrapper.text()).toContain("已经写完报名简介");
    expect(wrapper.text()).not.toContain("按住 0.8 秒，让唱针落下");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await nextTick();
    expect(wrapper.text()).toContain("按住 0.8 秒，让唱针落下");
    wrapper.unmount();
  });

  it("accepts a full hold on release even when animation frames are delayed", async () => {
    vi.mocked(window.requestAnimationFrame).mockImplementation(() => 1);
    vi.mocked(performance.now).mockReturnValue(1_000);
    const revivalStore = useRevivalStore();
    const beginAction = vi.spyOn(revivalStore, "beginAction").mockResolvedValue();
    const project = createProject("掉帧中的课程项目", 1_800_000_000_000);
    project.restore.lastCompleted = "已经写完报名简介";
    project.action = {
      id: "action-delayed-frame",
      text: "核对报名截止时间",
      doneDefinition: "截止时间写进项目",
      minutes: 5,
      startedAt: null,
      completedAt: null,
      createdAt: 1_800_000_000_000
    };

    const wrapper = mount(FocusMode, {
      props: { project, clock: "05:00", started: false },
      global: { stubs: { Teleport: true } }
    });
    await flushPromises();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await nextTick();

    const dropNeedle = wrapper.get("button.focus-entry-hold");
    await dropNeedle.trigger("keydown", { key: "Enter" });
    vi.mocked(performance.now).mockReturnValue(1_900);
    await dropNeedle.trigger("keyup", { key: "Enter" });
    await flushPromises();

    expect(beginAction).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[aria-label="当前时间盒剩余时间"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("lets the user explicitly choose the 12-second fallback", async () => {
    const project = createProject("论文项目", 1_800_000_000_000);
    project.restore.lastCompleted = "已经整理完目录";
    project.action = {
      id: "action-grace",
      text: "补写第一段",
      doneDefinition: "第一段保存到文档",
      minutes: 10,
      startedAt: 1_800_000_000_000,
      completedAt: null,
      createdAt: 1_800_000_000_000
    };

    const wrapper = mount(FocusMode, {
      props: { project, clock: "09:59", started: true },
      global: { stubs: { Teleport: true } }
    });
    await flushPromises();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await nextTick();
    await wrapper.get("button.focus-entry-hold").trigger("keydown", { key: "Enter" });
    await flushPromises();

    await wrapper.get('[aria-label="白名单守护强度"] button:nth-child(2)').trigger("click");
    await wrapper.get("button.focus-guardian-start").trigger("click");
    await flushPromises();

    expect(mocks.start).toHaveBeenCalledWith({
      allowedApps: [],
      blockedApps: [],
      strictAllowlist: false,
      graceSeconds: 12,
      idlePauseSeconds: 90
    });
    wrapper.unmount();
    await flushPromises();
    expect(mocks.stop).toHaveBeenCalledTimes(1);
  });

  it("keeps manual focus usable when the Windows monitor is unavailable", async () => {
    mocks.capability.mockResolvedValue({
      available: false,
      active: false,
      message: "前台应用监测组件未随安装包找到；本次不会开始监测。"
    });
    const project = createProject("申请项目", 1_800_000_000_000);
    project.restore.lastCompleted = "已经列好材料";
    project.action = {
      id: "action-manual",
      text: "写申请开头",
      doneDefinition: "开头保存到文档",
      minutes: 10,
      startedAt: 1_800_000_000_000,
      completedAt: null,
      createdAt: 1_800_000_000_000
    };

    const wrapper = mount(FocusMode, {
      props: { project, clock: "09:59", started: true },
      global: { stubs: { Teleport: true } }
    });
    await flushPromises();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await nextTick();
    await wrapper.get("button.focus-entry-hold").trigger("keydown", { key: "Enter" });
    await flushPromises();

    expect(wrapper.text()).toContain("写申请开头");
    expect(wrapper.text()).toContain("本次不会开始监测");
    expect(wrapper.find("button.focus-guardian-start").exists()).toBe(false);
    wrapper.unmount();
    await flushPromises();
    expect(mocks.stop).not.toHaveBeenCalled();
  });

  it("stops a guardian whose start finishes after the focus view is gone", async () => {
    let resolveStart: (event: FocusEvent) => void = () => undefined;
    mocks.start.mockReturnValue(
      new Promise<FocusEvent>((resolve) => {
        resolveStart = resolve;
      })
    );
    const project = createProject("刷新安全项目", 1_800_000_000_000);
    project.action = {
      id: "action-late-guardian",
      text: "只改报名页标题",
      doneDefinition: "新标题已经保存",
      minutes: 5,
      startedAt: 1_800_000_000_000,
      completedAt: null,
      createdAt: 1_800_000_000_000
    };

    const wrapper = mount(FocusMode, {
      props: { project, clock: "04:59", started: true },
      global: { stubs: { Teleport: true } }
    });
    await flushPromises();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await nextTick();
    await wrapper.get("button.focus-entry-hold").trigger("keydown", { key: "Enter" });
    await flushPromises();

    await wrapper.get('[aria-label="本次白名单软件"] button.focus-app-chip').trigger("click");
    await wrapper.get("button.focus-guardian-start").trigger("click");
    expect(mocks.start).toHaveBeenCalledTimes(1);

    wrapper.unmount();
    expect(mocks.stop).toHaveBeenCalledTimes(1);
    resolveStart(startingEvent);
    await flushPromises();
    expect(mocks.stop).toHaveBeenCalledTimes(2);
  });
});
