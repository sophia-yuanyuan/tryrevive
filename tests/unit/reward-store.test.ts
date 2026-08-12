import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyState, createProject } from "@/shared/domain/model";

const mocks = vi.hoisted(() => ({
  saveState: vi.fn()
}));

vi.mock("@/renderer/platform/web", () => ({
  platform: {
    kind: "web",
    saveState: mocks.saveState
  }
}));

import { useRevivalStore } from "@/renderer/stores/revival";

describe("reward persistence", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.saveState.mockReset().mockResolvedValue(undefined);
  });

  it("publishes project completion only after saving and blocks old write paths", async () => {
    const store = useRevivalStore();
    const project = createProject("原子保存项目", 1_800_000_000_000);
    store.data = {
      ...createEmptyState(1_800_000_000_000),
      activeProjectId: project.id,
      projects: [project]
    };
    let resolveSave: () => void = () => undefined;
    mocks.saveState.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveSave = resolve;
      })
    );

    const completing = store.completeProject("proud");
    await nextTick();

    expect(store.activeProject?.status).toBe("active");
    expect(store.activeProject?.reward).toBeNull();
    await expect(store.completeProject("proud")).rejects.toThrow(/上一次保存还在进行/);
    await expect(store.resume()).rejects.toThrow(/上一次保存还在进行/);
    await expect(store.newProject("不应插入的新项目")).rejects.toThrow(/上一次保存还在进行/);
    expect(mocks.saveState).toHaveBeenCalledTimes(1);
    expect(store.data.projects).toHaveLength(1);

    resolveSave();
    await completing;

    expect(store.activeProject?.status).toBe("completed");
    expect(store.activeProject?.reward).toMatchObject({ mood: "proud" });
  });

  it("keeps the in-memory project unchanged when reward persistence fails", async () => {
    const store = useRevivalStore();
    const project = createProject("不能产生幽灵唱片", 1_800_000_000_000);
    project.status = "completed";
    project.stage = "closed";
    store.data = {
      ...createEmptyState(1_800_000_000_000),
      activeProjectId: project.id,
      projects: [project]
    };
    mocks.saveState.mockRejectedValueOnce(new Error("disk unavailable"));

    await expect(store.setRewardMood(project.id, "calm")).rejects.toThrow("disk unavailable");

    expect(store.activeProject?.reward).toBeNull();
    expect(store.activeProject?.status).toBe("completed");
  });
});
