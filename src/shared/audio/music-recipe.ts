import { z } from "zod";

const MusicSeedSchema = z.number().int().min(0).max(0xffff_ffff);
const ActionDurationsSchema = z.array(z.number().int().min(1).max(14_400)).max(51);

export const LegacyMusicRecipeSchema = z
  .object({
    engineVersion: z.literal(1),
    seed: MusicSeedSchema,
    actionDurationsSeconds: ActionDurationsSchema
  })
  .strict();

export const ProjectMusicRecipeSchema = LegacyMusicRecipeSchema;

export type LegacyMusicRecipe = z.infer<typeof LegacyMusicRecipeSchema>;
export type ProjectMusicRecipe = z.infer<typeof ProjectMusicRecipeSchema>;

interface RewardActionSnapshot {
  minutes: number;
  startedAt: number | null;
  completedAt: number | null;
}

export interface RewardProjectSnapshot {
  id: string;
  title: string;
  createdAt: number;
  actionHistory: readonly RewardActionSnapshot[];
  action: RewardActionSnapshot | null;
  evidence: readonly unknown[];
}

export function stableMusicHash(input: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function actionDurationSeconds(action: RewardActionSnapshot): number | null {
  if (action.startedAt && action.completedAt && action.completedAt > action.startedAt) {
    return Math.min(
      14_400,
      Math.max(1, Math.round((action.completedAt - action.startedAt) / 1_000))
    );
  }
  if (action.completedAt) return action.minutes * 60;
  return null;
}

export function projectActionDurations(project: RewardProjectSnapshot): number[] {
  return [...project.actionHistory, project.action]
    .filter((action): action is RewardActionSnapshot => Boolean(action))
    .map(actionDurationSeconds)
    .filter((seconds): seconds is number => seconds !== null);
}

export function recipeWorkSeconds(recipe: ProjectMusicRecipe): number {
  return Math.max(
    300,
    recipe.actionDurationsSeconds.reduce((total, seconds) => total + seconds, 0)
  );
}

export function recipeDurationSeconds(recipe: ProjectMusicRecipe): number {
  const workSeconds = recipeWorkSeconds(recipe);
  return Math.min(
    96,
    Math.max(
      48,
      48 +
        Math.round(Math.log2(1 + workSeconds / 60) * 8) +
        recipe.actionDurationsSeconds.length * 2
    )
  );
}

export function captureLegacyMusicRecipe(
  project: RewardProjectSnapshot,
  mood: string
): LegacyMusicRecipe {
  const actionDurationsSeconds = projectActionDurations(project);
  const signature = `${project.id}:${project.title}:${project.createdAt}:${mood}:${actionDurationsSeconds.join(",")}:${project.evidence.length}`;
  return LegacyMusicRecipeSchema.parse({
    engineVersion: 1,
    seed: stableMusicHash(signature),
    actionDurationsSeconds
  });
}

export function musicRecipeFingerprint(recipe: ProjectMusicRecipe): string {
  return `${recipe.engineVersion}:${recipe.seed}:${recipe.actionDurationsSeconds.join(",")}`;
}
