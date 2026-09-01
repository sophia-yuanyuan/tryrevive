<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: "primary" | "secondary" | "quiet" | "danger";
    size?: "sm" | "md" | "lg";
    type?: "button" | "submit" | "reset";
    block?: boolean;
    loading?: boolean;
    disabled?: boolean;
  }>(),
  {
    variant: "primary",
    size: "md",
    type: "button",
    block: false,
    loading: false,
    disabled: false
  }
);
</script>

<template>
  <button
    :type="type"
    class="tr-button"
    :class="[
      `tr-button--${variant}`,
      `tr-button--${size}`,
      { 'tr-button--block': block }
    ]"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
  >
    <span v-if="loading" aria-hidden="true">…</span>
    <slot />
  </button>
</template>
