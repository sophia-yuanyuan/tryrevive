import { describe, expect, it } from "vitest";
import {
  ProjectMusicRecipeSchema,
  captureLegacyMusicRecipe,
  musicRecipeFingerprint,
  recipeDurationSeconds,
  recipeWorkSeconds
} from "@/shared/audio/music-recipe";
import { createProject } from "@/shared/domain/model";
import {
  assignAction,
  chooseDecision,
  completeAction,
  markProjectCompleted,
  setProjectReward,
  startAction
} from "@/shared/domain/revival";

describe("frozen vinyl music recipes", () => {
  it("accepts only the strict bounded renderer version that exists", () => {
    expect(
      ProjectMusicRecipeSchema.parse({
        engineVersion: 1,
        seed: 0xffff_ffff,
        actionDurationsSeconds: [1, 14_400]
      })
    ).toMatchObject({ engineVersion: 1 });
    expect(() =>
      ProjectMusicRecipeSchema.parse({
        engineVersion: 3,
        seed: 1,
        actionDurationsSeconds: []
      })
    ).toThrow();
    expect(() =>
      ProjectMusicRecipeSchema.parse({
        engineVersion: 1,
        seed: 1.5,
        actionDurationsSeconds: [],
        extra: true
      })
    ).toThrow();
    expect(() =>
      ProjectMusicRecipeSchema.parse({
        engineVersion: 1,
        seed: 1,
        actionDurationsSeconds: [14_401]
      })
    ).toThrow();
  });

  it("derives bounded metadata without persisting contradictory totals", () => {
    const recipe = ProjectMusicRecipeSchema.parse({
      engineVersion: 1,
      seed: 7,
      actionDurationsSeconds: [600, 2_400]
    });

    expect(recipeWorkSeconds(recipe)).toBe(3_000);
    expect(recipeDurationSeconds(recipe)).toBeGreaterThanOrEqual(48);
    expect(recipeDurationSeconds(recipe)).toBeLessThanOrEqual(96);
    expect(musicRecipeFingerprint(recipe)).toBe("1:7:600,2400");
  });

  it("captures the existing renderer recipe at completion and never rewrites it", () => {
    const startedAt = 1_800_000_000_000;
    let project = createProject("毕业作品", startedAt - 3 * 86_400_000);
    project.id = "project-recipe-test";
    project = chooseDecision(project, "continue", startedAt - 2);
    project = assignAction(
      project,
      { text: "完成展示", doneDefinition: "展示可打开", minutes: 10 },
      startedAt - 1
    );
    project = startAction(project, startedAt);
    project = completeAction(project, startedAt + 777_000);
    project.evidence.push({
      id: "evidence-recipe",
      actionId: project.action?.id ?? null,
      note: "展示已经保存",
      link: "",
      observation: null,
      createdAt: startedAt + 777_001
    });

    const completed = markProjectCompleted(project, "proud", startedAt + 800_000);
    expect(completed.reward).toMatchObject({
      mood: "proud",
      music: {
        engineVersion: 1,
        actionDurationsSeconds: [777]
      }
    });
    const reward = completed.reward;
    expect(markProjectCompleted(completed, "proud", startedAt + 900_000).reward).toBe(reward);
    expect(setProjectReward(completed, "proud", startedAt + 900_000).reward).toBe(reward);
    expect(() => setProjectReward(completed, "calm", startedAt + 900_000)).toThrow(/已经生成/);
  });

  it("captures evidence in the stable legacy seed without storing its text", () => {
    const now = 1_800_000_000_000;
    const first = createProject("同一项目", now - 86_400_000);
    first.id = "same-project";
    const second = { ...first, evidence: [{ marker: true }] };

    expect(captureLegacyMusicRecipe(first, "calm")).not.toEqual(
      captureLegacyMusicRecipe(second, "calm")
    );
  });
});
