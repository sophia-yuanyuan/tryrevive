import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProject } from "@/shared/domain/model";
import type { FocusEvent } from "@/shared/focus/contracts";

const mocks = vi.hoisted(() => ({
  listener: null as ((event: FocusEvent) => void) | null,
  start: vi.fn(),
  stop: vi.fn(),
  acknowledge: vi.fn()
}));

vi.mock("@/renderer/platform/web", () => ({
  platform: {
    kind: "desktop",
    focusCapability: vi.fn().mockResolvedValue({
      available: true,
      active: false,
      message: "可选开启"
    }),
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
    expect(mocks.start).not.toHaveBeenCalled();
    await wrapper.get('[aria-label="本次白名单软件"] button.focus-app-chip').trigger("click");
    await wrapper
      .get('[aria-label="本次黑名单软件"] button.focus-app-chip:nth-child(2)')
      .trigger("click");
    await wrapper.get("button.focus-guardian-start").trigger("click");
    await flushPromises();
    expect(mocks.start).toHaveBeenCalledWith({
      allowedApps: ["chrome"],
      blockedApps: ["msedge"],
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

    expect(wrapper.text()).toContain("你现在在做什么？眼前这一步是：写完报名页第一段");
    expect(wrapper.text()).toContain("这是必要工作");
    expect(wrapper.text()).toContain("我回到这一步");
    expect(wrapper.text()).toContain("结束本次守护");

    const necessary = wrapper.findAll("button").find((button) => button.text() === "这是必要工作");
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
    expect(wrapper.findAll("button").some((button) => button.text() === "这是必要工作")).toBe(
      false
    );
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
});
