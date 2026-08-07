<script setup lang="ts">
import type { ProjectMood } from "@/shared/domain/model";
import { PROJECT_MOOD_LABELS } from "@/shared/audio/vinyl-music";

defineProps<{ busy?: boolean }>();
const emit = defineEmits<{ select: [mood: ProjectMood] }>();

const moodOptions: Array<{ mood: ProjectMood; description: string }> = [
  { mood: "calm", description: "安静地告一段落" },
  { mood: "relieved", description: "终于可以松口气" },
  { mood: "proud", description: "看见自己真正做成了" },
  { mood: "energized", description: "还想带着这股劲继续" },
  { mood: "bittersweet", description: "完成了，也有一点舍不得" }
];
</script>

<template>
  <fieldset class="mood-picker">
    <legend>完成这一刻，更接近哪种感觉？</legend>
    <p>没有标准答案。你的选择只保存在本机，并会改变这张唱片的速度与调式。</p>
    <div class="mood-grid">
      <button
        v-for="option in moodOptions"
        :key="option.mood"
        class="mood-choice"
        type="button"
        :disabled="busy"
        @click="emit('select', option.mood)"
      >
        <strong>{{ PROJECT_MOOD_LABELS[option.mood] }}</strong>
        <small>{{ option.description }}</small>
      </button>
    </div>
  </fieldset>
</template>
