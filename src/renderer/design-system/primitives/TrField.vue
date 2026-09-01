<script setup lang="ts">
import { computed, useId } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    label: string;
    id?: string;
    type?: "text" | "email" | "url" | "search";
    placeholder?: string;
    help?: string;
    error?: string;
    required?: boolean;
    disabled?: boolean;
    autocomplete?: string;
  }>(),
  {
    modelValue: "",
    type: "text",
    required: false,
    disabled: false
  }
);

const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const generatedId = useId();
const inputId = computed(() => props.id ?? `tr-field-${generatedId}`);
const helpId = computed(() => `${inputId.value}-help`);
const errorId = computed(() => `${inputId.value}-error`);
const describedBy = computed(() => {
  if (props.error) return errorId.value;
  if (props.help) return helpId.value;
  return undefined;
});
</script>

<template>
  <div class="tr-field-group">
    <label class="tr-field-label" :for="inputId">{{ label }}</label>
    <input
      :id="inputId"
      class="tr-field"
      :value="modelValue"
      :type="type"
      :placeholder="placeholder"
      :required="required"
      :disabled="disabled"
      :autocomplete="autocomplete"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <p v-if="error" :id="errorId" class="tr-field-error" role="alert">{{ error }}</p>
    <p v-else-if="help" :id="helpId" class="tr-field-help">{{ help }}</p>
  </div>
</template>
