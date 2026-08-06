<script setup lang="ts">
defineProps<{
  eyebrow: string;
  title: string;
  description: string;
}>();
</script>

<template>
  <section class="stage-card" aria-labelledby="stage-title">
    <p class="eyebrow">{{ eyebrow }}</p>
    <h1 id="stage-title" class="stage-title">{{ title }}</h1>
    <p class="stage-description">{{ description }}</p>
    <div class="mt-8">
      <slot />
    </div>
    <div v-if="$slots.footer" class="mt-6 border-t border-[var(--line)] pt-5">
      <slot name="footer" />
    </div>
  </section>
</template>
