import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProject } from "@/shared/domain/model";

const store = vi.hoisted(() => ({
  beginAction: vi.fn(),
  finishAction: vi.fn(),
  consumeFocusRequest: vi.fn()
}));

vi.mock("@/renderer/stores/revival", () => ({
  useRevivalStore: () => store
}));

import ExecuteStep from "@/renderer/components/ExecuteStep.vue";

describe("ExecuteStep stylus entry", () => {
  beforeEach(() => {
    store.beginAction.mockReset();
    store.finishAction.mockReset();
    store.consumeFocusRequest.mockReset().mockReturnValue(false);
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined)
    });
  });

  it("does not expose a direct start after the action is saved but not started", async () => {
    const project = createProject("课程项目", 1_800_000_000_000);
    project.stage = "execute";
    project.decision = "continue";
    project.action = {
      id: "action-stylus-only",
      text: "补写报名页第一段",
      doneDefinition: "第一段保存到文档",
      minutes: 10,
      startedAt: null,
      completedAt: null,
      createdAt: 1_800_000_000_001
    };

    const wrapper = mount(ExecuteStep, {
      props: { project },
      global: {
        stubs: {
          StageShell: { template: "<section><slot /></section>" },
          FocusMode: { template: '<div data-testid="focus-mode" />' }
        }
      }
    });

    expect(wrapper.text()).not.toContain("开始这一小步");
    const entries = wrapper
      .findAll("button")
      .filter((button) => button.text() === "以唱针进入全屏专注");
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    await entry?.trigger("click");
    await flushPromises();

    expect(store.beginAction).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="focus-mode"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
