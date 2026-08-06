<script setup lang="ts">
import { computed } from "vue";
import { ProgressIndicator, ProgressRoot } from "reka-ui";
import type { RevivalProject } from "@/shared/domain/model";
import ActionStep from "./ActionStep.vue";
import ClosedStep from "./ClosedStep.vue";
import DecisionStep from "./DecisionStep.vue";
import DiagnosisStep from "./DiagnosisStep.vue";
import EvidenceStep from "./EvidenceStep.vue";
import ExecuteStep from "./ExecuteStep.vue";
import RestoreStep from "./RestoreStep.vue";
import ResumeStep from "./ResumeStep.vue";
import ReturnStep from "./ReturnStep.vue";

const props = defineProps<{ project: RevivalProject }>();

const components = {
  restore: RestoreStep,
  decision: DecisionStep,
  diagnosis: DiagnosisStep,
  action: ActionStep,
  execute: ExecuteStep,
  evidence: EvidenceStep,
  return: ReturnStep,
  resume: ResumeStep,
  closed: ClosedStep
};

const progressByStage = {
  restore: 10,
  decision: 25,
  diagnosis: 38,
  action: 42,
  execute: 60,
  evidence: 78,
  return: 92,
  resume: 100,
  closed: 100
};

const activeComponent = computed(() => components[props.project.stage]);
const progress = computed(() => progressByStage[props.project.stage]);
</script>

<template>
  <div>
    <div class="mx-auto mb-5 flex max-w-3xl items-center gap-3 px-1" aria-label="恢复流程进度">
      <ProgressRoot
        class="relative h-1.5 flex-1 overflow-hidden rounded-full bg-black/8"
        :model-value="progress"
        :max="100"
      >
        <ProgressIndicator
          class="h-full rounded-full bg-[var(--accent)] transition-transform duration-500"
          :style="{ transform: `translateX(-${100 - progress}%)` }"
        />
      </ProgressRoot>
      <span class="text-xs font-semibold tabular-nums text-[var(--muted)]">{{ progress }}%</span>
    </div>
    <Transition name="stage" mode="out-in">
      <component :is="activeComponent" :key="project.stage" :project="project" />
    </Transition>
  </div>
</template>
