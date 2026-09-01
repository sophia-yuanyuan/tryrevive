<script setup lang="ts">
withDefaults(
  defineProps<{
    selected?: boolean;
    disabled?: boolean;
  }>(),
  { selected: false, disabled: false }
);

defineEmits<{ select: [] }>();
</script>

<template>
  <button
    type="button"
    class="tr-chip"
    :aria-pressed="selected"
    :disabled="disabled"
    @click="$emit('select')"
  >
    <slot />
  </button>
</template>
