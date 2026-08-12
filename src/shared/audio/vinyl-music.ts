import type { ProjectMood, RevivalProject } from "../domain/model";
import { sanitizeWavFileName } from "./export";
import {
  captureLegacyMusicRecipe,
  projectActionDurations,
  type ProjectMusicRecipe
} from "./music-recipe";
import {
  createLegacyComposition,
  renderLegacyProjectWav,
  type LegacyProjectComposition
} from "./legacy-v1";

export { actionDurationSeconds, projectActionDurations } from "./music-recipe";

export const PROJECT_MOOD_LABELS: Record<ProjectMood, string> = {
  calm: "平静",
  relieved: "松了一口气",
  proud: "踏实的骄傲",
  energized: "还有能量",
  bittersweet: "有点舍不得"
};

export interface ProjectComposition extends LegacyProjectComposition {
  moodLabel: string;
}

function projectRecipe(project: RevivalProject, mood: ProjectMood): ProjectMusicRecipe {
  return project.reward?.music ?? captureLegacyMusicRecipe(project, mood);
}

export function createProjectComposition(project: RevivalProject): ProjectComposition {
  const mood = project.reward?.mood ?? "relieved";
  const composition = createLegacyComposition(mood, projectRecipe(project, mood));
  return {
    ...composition,
    moodLabel: PROJECT_MOOD_LABELS[mood]
  };
}

export function renderProjectWav(project: RevivalProject): Uint8Array {
  const mood = project.reward?.mood ?? "relieved";
  return renderLegacyProjectWav(mood, projectRecipe(project, mood));
}

export function projectWavFileName(project: RevivalProject): string {
  return sanitizeWavFileName(project.title.slice(0, 48));
}

export function projectRecordedActionDurations(project: RevivalProject): number[] {
  return projectActionDurations(project);
}
