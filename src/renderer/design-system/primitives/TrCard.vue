<script setup lang="ts">
withDefaults(
  defineProps<{
    as?: "article" | "section" | "div";
  }>(),
  { as: "section" }
);
</script>

<template>
  <component :is="as" class="tr-card">
    <slot />
  </component>
</template>
