import { describe, expect, it } from "vitest";
import {
  createProjectComposition,
  projectActionDurations,
  projectWavFileName,
  renderProjectWav
} from "@/shared/audio/vinyl-music";
import { createProject, type ProjectMood, type RevivalProject } from "@/shared/domain/model";
import {
  assignAction,
  completeAction,
  markProjectCompleted,
  startAction
} from "@/shared/domain/revival";

function completedProject(mood: ProjectMood, actualSeconds = 600): RevivalProject {
  const startedAt = 1_800_000_000_000;
  let project = createProject("黑客松 / 申请", startedAt - 10_000);
  project.id = "project-music-test";
  project = assignAction(
    project,
    { text: "提交申请", doneDefinition: "收到确认页", minutes: 10 },
    startedAt - 1
  );
  project = startAction(project, startedAt);
  project = completeAction(project, startedAt + actualSeconds * 1000);
  return markProjectCompleted(project, mood, startedAt + actualSeconds * 1000 + 1);
}

describe("local vinyl music", () => {
  it("creates the same composition for the same project and changes with mood", () => {
    const calm = completedProject("calm");
    const first = createProjectComposition(calm);
    const second = createProjectComposition(calm);
    const energized = createProjectComposition(completedProject("energized"));

    expect(second).toEqual(first);
    expect(first.moodLabel).toBe("平静");
    expect(energized.bpm).toBeGreaterThan(first.bpm);
    expect(energized.noteSteps).not.toEqual(first.noteSteps);
  });

  it("uses actual completed action time and lets it shape the arrangement", () => {
    const tenMinutes = completedProject("proud", 600);
    const fortyMinutes = completedProject("proud", 2_400);

    expect(projectActionDurations(tenMinutes)).toEqual([600]);
    expect(projectActionDurations(fortyMinutes)).toEqual([2_400]);
    expect(createProjectComposition(fortyMinutes).durationSeconds).toBeGreaterThan(
      createProjectComposition(tenMinutes).durationSeconds
    );
  });

  it("renders a bounded PCM WAV that can be played and exported without a network", () => {
    const project = completedProject("relieved", 300);
    const wav = renderProjectWav(project);
    const header = new TextDecoder("ascii").decode(wav.slice(0, 12));

    expect(header.slice(0, 4)).toBe("RIFF");
    expect(header.slice(8, 12)).toBe("WAVE");
    expect(wav.byteLength).toBeGreaterThan(44);
    expect(wav.byteLength).toBeLessThan(5 * 1024 * 1024);
    expect(projectWavFileName(project)).toBe("黑客松 - 申请.wav");
  });
});
