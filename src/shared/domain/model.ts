import { z } from "zod";
import {
  RepositoryEvidenceSchema,
  RepositorySnapshotSchema,
  SafeRepositoryPathSchema
} from "./repository";
import { ProjectMusicRecipeSchema } from "../audio/music-recipe";

export const SCHEMA_VERSION = 8 as const;

export const ProjectStageSchema = z.enum([
  "restore",
  "decision",
  "diagnosis",
  "action",
  "execute",
  "evidence",
  "return",
  "resume",
  "closed"
]);

export const ProjectStatusSchema = z.enum(["active", "paused", "abandoned", "completed"]);
export const DecisionSchema = z.enum(["continue", "shrink", "help", "pause", "abandon"]);
export const ProjectMoodSchema = z.enum(["calm", "relieved", "proud", "energized", "bittersweet"]);
export const InferenceSourceSchema = z.enum(["repository", "material", "voice", "text"]);
export const SubstantiveProgressSchema = z.enum(["yes", "no", "uncertain"]);

export const ProjectRewardSchema = z
  .object({
    mood: ProjectMoodSchema,
    createdAt: z.number().int().positive(),
    music: ProjectMusicRecipeSchema
  })
  .strict();

export const ProjectAnalysisSchema = z.object({
  id: z.string().min(1),
  sourceLabel: z.string().trim().min(1).max(180),
  originalGoal: z.string().trim().min(1).max(500),
  lastCompleted: z.string().trim().min(1).max(240),
  stuckAt: z.string().trim().min(1).max(240),
  deadline: z.string().trim().max(80).default(""),
  whyMatters: z.string().trim().max(240).default(""),
  stallReasons: z.array(z.string().trim().min(1).max(240)).min(1).max(3),
  suggestedDecision: DecisionSchema,
  nextAction: z.object({
    text: z.string().trim().min(1).max(160),
    doneDefinition: z.string().trim().min(1).max(160),
    minutes: z.number().int().min(5).max(20)
  }),
  uncertainties: z.array(z.string().trim().min(1).max(240)).max(5),
  createdAt: z.number().int().positive()
});

export const PendingRepositoryContextSchema = z.object({
  bindingId: z.string().regex(/^repo_[a-f0-9]{24}$/u),
  displayName: z.string().trim().min(1).max(120),
  snapshot: RepositorySnapshotSchema,
  evidence: z.array(RepositoryEvidenceSchema).max(8)
});

export const PendingInferenceSchema = z.object({
  id: z.string().min(1),
  sourceKind: InferenceSourceSchema,
  title: z.string().trim().min(1).max(80),
  analysis: ProjectAnalysisSchema,
  repository: PendingRepositoryContextSchema.nullable(),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive()
});

export const RestoreContextSchema = z.object({
  lastCompleted: z.string().trim().max(240),
  stuckAt: z.string().trim().max(240),
  deadline: z.string().trim().max(80).default(""),
  whyMatters: z.string().trim().max(240).default("")
});

export const ActionSchema = z.object({
  id: z.string().min(1),
  text: z.string().trim().min(1).max(160),
  doneDefinition: z.string().trim().min(1).max(160),
  minutes: z.number().int().min(5).max(20),
  startedAt: z.number().int().positive().nullable(),
  completedAt: z.number().int().positive().nullable(),
  createdAt: z.number().int().positive()
});

export const RepositoryObservationSchema = z.object({
  kind: z.literal("repository_diff"),
  paths: z.array(SafeRepositoryPathSchema).min(1).max(20),
  detectedAt: z.number().int().positive()
});

export const EvidenceSchema = z.object({
  id: z.string().min(1),
  actionId: z.string().min(1).nullable(),
  note: z.string().trim().min(1).max(500),
  link: z.string().trim().max(500).default(""),
  observation: RepositoryObservationSchema.nullable(),
  substantiveProgress: SubstantiveProgressSchema,
  progressReason: z.string().trim().max(240).default(""),
  createdAt: z.number().int().positive()
});

export const ReturnPlanSchema = z.object({
  dueAt: z.number().int().positive(),
  cue: z.string().trim().min(1).max(160),
  createdAt: z.number().int().positive()
});

export const ProjectRepositoryContextSchema = z.object({
  bindingId: z.string().regex(/^repo_[a-f0-9]{24}$/u),
  displayName: z.string().trim().min(1).max(120),
  lastSnapshot: RepositorySnapshotSchema,
  evidence: z.array(RepositoryEvidenceSchema).max(8),
  actionBaseline: z
    .object({
      actionId: z.string().min(1),
      snapshot: RepositorySnapshotSchema
    })
    .nullable()
});

export const OutcomeDraftSchema = z
  .object({
    actionId: z.string().min(1),
    status: z.enum(["changes_detected", "no_readable_change", "scan_failed"]),
    changes: z
      .array(
        z.object({
          path: SafeRepositoryPathSchema,
          kind: z.enum(["content_changed", "now_observed"])
        })
      )
      .max(20),
    suggestedNote: z.string().trim().min(1).max(500),
    scanTruncated: z.boolean(),
    createdAt: z.number().int().positive()
  })
  .superRefine((draft, context) => {
    if (draft.status === "changes_detected" && draft.changes.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["changes"],
        message: "changes_detected 需要至少一条可确认的变化"
      });
    }
    if (draft.status !== "changes_detected" && draft.changes.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["changes"],
        message: "未检测到变化时不能保留变化列表"
      });
    }
  });

export const ProjectSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.literal(SCHEMA_VERSION),
  title: z.string().trim().min(1).max(80),
  stage: ProjectStageSchema,
  status: ProjectStatusSchema,
  restore: RestoreContextSchema,
  decision: DecisionSchema.nullable(),
  diagnosis: z.array(z.string().trim().max(240)).max(3),
  action: ActionSchema.nullable(),
  actionHistory: z.array(ActionSchema).max(50),
  evidence: z.array(EvidenceSchema).max(100),
  returnPlan: ReturnPlanSchema.nullable(),
  analysis: ProjectAnalysisSchema.nullable(),
  repository: ProjectRepositoryContextSchema.nullable(),
  outcomeDraft: OutcomeDraftSchema.nullable(),
  reward: ProjectRewardSchema.nullable(),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive()
});

export const AppStateSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  activeProjectId: z.string().nullable(),
  projects: z.array(ProjectSchema).max(100),
  pendingInference: PendingInferenceSchema.nullable(),
  deliveredCloudOperations: z.array(z.string().trim().min(12).max(120)).max(50).default([]),
  legacyMigrationCompleted: z.boolean(),
  updatedAt: z.number().int().positive()
});

export type ProjectStage = z.infer<typeof ProjectStageSchema>;
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type Decision = z.infer<typeof DecisionSchema>;
export type ProjectMood = z.infer<typeof ProjectMoodSchema>;
export type InferenceSource = z.infer<typeof InferenceSourceSchema>;
export type ProjectReward = z.infer<typeof ProjectRewardSchema>;
export type RestoreContext = z.infer<typeof RestoreContextSchema>;
export type RevivalAction = z.infer<typeof ActionSchema>;
export type RepositoryObservation = z.infer<typeof RepositoryObservationSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type SubstantiveProgress = z.infer<typeof SubstantiveProgressSchema>;
export type ReturnPlan = z.infer<typeof ReturnPlanSchema>;
export type ProjectAnalysis = z.infer<typeof ProjectAnalysisSchema>;
export type PendingInference = z.infer<typeof PendingInferenceSchema>;
export type ProjectRepositoryContext = z.infer<typeof ProjectRepositoryContextSchema>;
export type OutcomeDraft = z.infer<typeof OutcomeDraftSchema>;
export type RevivalProject = z.infer<typeof ProjectSchema>;
export type AppState = z.infer<typeof AppStateSchema>;

export function createId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}_${random}`;
}

export function createEmptyState(now = Date.now()): AppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    activeProjectId: null,
    projects: [],
    pendingInference: null,
    deliveredCloudOperations: [],
    legacyMigrationCompleted: false,
    updatedAt: now
  };
}

export function createProject(title: string, now = Date.now()): RevivalProject {
  return {
    id: createId("project"),
    schemaVersion: SCHEMA_VERSION,
    title: title.trim(),
    stage: "restore",
    status: "active",
    restore: { lastCompleted: "", stuckAt: "", deadline: "", whyMatters: "" },
    decision: null,
    diagnosis: [],
    action: null,
    actionHistory: [],
    evidence: [],
    returnPlan: null,
    analysis: null,
    repository: null,
    outcomeDraft: null,
    reward: null,
    createdAt: now,
    updatedAt: now
  };
}
