import { z } from "zod";
import {
  PendingInferenceSchema,
  ProjectSchema,
  createId,
  createProject,
  type InferenceSource,
  type PendingInference,
  type ProjectAnalysis,
  type RevivalProject
} from "./model";

const InferenceCorrectionSchema = z.object({
  title: z.string().trim().min(1).max(80),
  originalGoal: z.string().trim().min(1).max(500),
  lastCompleted: z.string().trim().min(1).max(240),
  stuckAt: z.string().trim().min(1).max(240),
  whyMatters: z.string().trim().max(240).default("")
});

export type InferenceCorrection = z.infer<typeof InferenceCorrectionSchema>;

export function createPendingInference(
  input: {
    sourceKind: InferenceSource;
    title: string;
    analysis: ProjectAnalysis;
    repository: PendingInference["repository"];
  },
  now = Date.now()
): PendingInference {
  return PendingInferenceSchema.parse({
    id: createId("inference"),
    ...input,
    createdAt: now,
    updatedAt: now
  });
}

export function correctPendingInference(
  pending: PendingInference,
  input: InferenceCorrection,
  now = Date.now()
): PendingInference {
  const correction = InferenceCorrectionSchema.parse(input);
  const nextActionText = `先处理“${correction.stuckAt}”里能留下可见结果的一步`.slice(0, 160);
  return PendingInferenceSchema.parse({
    ...pending,
    title: correction.title,
    analysis: {
      ...pending.analysis,
      originalGoal: correction.originalGoal,
      lastCompleted: correction.lastCompleted,
      stuckAt: correction.stuckAt,
      whyMatters: correction.whyMatters,
      stallReasons: [`你确认的当前卡点：${correction.stuckAt}`.slice(0, 240)],
      nextAction: {
        text: nextActionText,
        doneDefinition: "留下一个可见、可保存、下次能继续的结果",
        minutes: pending.analysis.nextAction.minutes
      }
    },
    updatedAt: now
  });
}

export function confirmPendingInference(
  pendingInput: PendingInference,
  now = Date.now()
): RevivalProject {
  const pending = PendingInferenceSchema.parse(pendingInput);
  const project = createProject(pending.title, now);
  return ProjectSchema.parse({
    ...project,
    restore: {
      lastCompleted: pending.analysis.lastCompleted,
      stuckAt: pending.analysis.stuckAt,
      deadline: pending.analysis.deadline,
      whyMatters: pending.analysis.whyMatters
    },
    diagnosis: pending.analysis.stallReasons,
    analysis: pending.analysis,
    repository: pending.repository
      ? {
          bindingId: pending.repository.bindingId,
          displayName: pending.repository.displayName,
          lastSnapshot: pending.repository.snapshot,
          evidence: pending.repository.evidence,
          actionBaseline: null
        }
      : null,
    decision: null,
    stage: "action",
    status: "active",
    updatedAt: now
  });
}
