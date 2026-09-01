<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";

defineProps<{
  eyebrow: string;
  title: string;
  description: string;
}>();

const heading = ref<HTMLHeadingElement | null>(null);

onMounted(async () => {
  await nextTick();
  if (!document.activeElement || document.activeElement === document.body) heading.value?.focus();
});
</script>

<template>
  <section class="stage-card" aria-labelledby="stage-title">
    <p class="eyebrow">{{ eyebrow }}</p>
    <h1 id="stage-title" ref="heading" class="stage-title" tabindex="-1">{{ title }}</h1>
    <p class="stage-description">{{ description }}</p>
    <div class="mt-8">
      <slot />
    </div>
    <div v-if="$slots.footer" class="mt-6 border-t border-[var(--line)] pt-5">
      <slot name="footer" />
    </div>
  </section>
</template>
