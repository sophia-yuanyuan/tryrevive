import type { ProjectMood } from "../domain/model";
import type { LegacyMusicRecipe, ProjectMusicRecipe } from "./music-recipe";
import { recipeDurationSeconds, recipeWorkSeconds } from "./music-recipe";

interface MoodProfile {
  bpm: number;
  scale: readonly number[];
  rootOffset: number;
  brightness: number;
}

const MOOD_PROFILES: Record<ProjectMood, MoodProfile> = {
  calm: { bpm: 72, scale: [0, 2, 4, 7, 9], rootOffset: -5, brightness: 0.72 },
  relieved: { bpm: 82, scale: [0, 2, 4, 7, 11], rootOffset: 0, brightness: 0.8 },
  proud: { bpm: 92, scale: [0, 4, 5, 7, 11], rootOffset: 2, brightness: 0.92 },
  energized: { bpm: 108, scale: [0, 2, 4, 7, 9, 11], rootOffset: 5, brightness: 1 },
  bittersweet: { bpm: 76, scale: [0, 2, 3, 7, 10], rootOffset: -2, brightness: 0.68 }
};

export interface LegacyProjectComposition {
  seed: number;
  mood: ProjectMood;
  bpm: number;
  durationSeconds: number;
  workSeconds: number;
  actionDurationsSeconds: number[];
  rootFrequency: number;
  noteSteps: number[];
  scale: readonly number[];
  brightness: number;
}

function createRandom(seed: number): () => number {
  let state = seed || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function legacyView(recipe: ProjectMusicRecipe): LegacyMusicRecipe {
  return {
    engineVersion: 1,
    seed: recipe.seed,
    actionDurationsSeconds: [...recipe.actionDurationsSeconds]
  };
}

export function createLegacyComposition(
  mood: ProjectMood,
  sourceRecipe: ProjectMusicRecipe
): LegacyProjectComposition {
  const recipe = legacyView(sourceRecipe);
  const profile = MOOD_PROFILES[mood];
  const workSeconds = recipeWorkSeconds(recipe);
  const random = createRandom(recipe.seed);
  const bpm = profile.bpm + (recipe.seed % 7) - 3;
  const rootFrequency = 110 * 2 ** ((profile.rootOffset + (recipe.seed % 5)) / 12);
  const noteSteps = Array.from({ length: 32 }, (_, index) => {
    const durationInfluence =
      recipe.actionDurationsSeconds[index % Math.max(1, recipe.actionDurationsSeconds.length)] ??
      300;
    const degree = Math.floor(random() * profile.scale.length);
    const octave = (index % 8 === 7 ? 12 : 0) + (durationInfluence % 3 === 0 ? 0 : 12);
    return (profile.scale[degree] ?? 0) + octave;
  });

  return {
    seed: recipe.seed,
    mood,
    bpm,
    durationSeconds: recipeDurationSeconds(recipe),
    workSeconds,
    actionDurationsSeconds: [...recipe.actionDurationsSeconds],
    rootFrequency,
    noteSteps,
    scale: profile.scale,
    brightness: profile.brightness
  };
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

export function renderLegacyProjectWav(mood: ProjectMood, recipe: ProjectMusicRecipe): Uint8Array {
  const composition = createLegacyComposition(mood, recipe);
  const sampleRate = 22_050;
  const sampleCount = Math.floor(composition.durationSeconds * sampleRate);
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + sampleCount * bytesPerSample);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + sampleCount * bytesPerSample, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, sampleCount * bytesPerSample, true);

  const beatSeconds = 60 / composition.bpm;
  let noiseState = composition.seed || 1;
  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    const beat = Math.floor(time / beatSeconds);
    const beatPhase = (time % beatSeconds) / beatSeconds;
    const noteStep = composition.noteSteps[beat % composition.noteSteps.length] ?? 0;
    const frequency = composition.rootFrequency * 2 ** (noteStep / 12);
    const pluck = Math.exp(-beatPhase * (4.4 - composition.brightness));
    const lead =
      Math.sin(2 * Math.PI * frequency * time) * 0.34 +
      Math.sin(2 * Math.PI * frequency * 2 * time) * 0.1 * composition.brightness;
    const bassStep = composition.scale[Math.floor(beat / 4) % composition.scale.length] ?? 0;
    const bassFrequency = (composition.rootFrequency / 2) * 2 ** (bassStep / 12);
    const bass = Math.sin(2 * Math.PI * bassFrequency * time) * 0.2;
    const kickPhase = (time % (beatSeconds * 2)) / (beatSeconds * 2);
    const kick =
      Math.sin(2 * Math.PI * (54 - kickPhase * 20) * time) * Math.exp(-kickPhase * 18) * 0.16;
    noiseState = Math.imul(noiseState, 1_664_525) + 1_013_904_223;
    const vinylNoise = (((noiseState >>> 16) & 0xffff) / 32_768 - 1) * 0.009;
    const entrance = Math.min(1, time / 1.4);
    const exit = Math.min(1, (composition.durationSeconds - time) / 2.4);
    const sample = Math.max(
      -1,
      Math.min(1, (lead * pluck + bass + kick + vinylNoise) * entrance * exit * 0.72)
    );
    view.setInt16(44 + index * bytesPerSample, Math.round(sample * 32_767), true);
  }

  return new Uint8Array(buffer);
}
