import { z } from "zod";

export const SCHEMA_VERSION = 4 as const;

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

export const EvidenceSchema = z.object({
  id: z.string().min(1),
  note: z.string().trim().min(1).max(500),
  link: z.string().trim().max(500).default(""),
  createdAt: z.number().int().positive()
});

export const ReturnPlanSchema = z.object({
  dueAt: z.number().int().positive(),
  cue: z.string().trim().min(1).max(160),
  createdAt: z.number().int().positive()
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
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive()
});

export const AppStateSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  activeProjectId: z.string().nullable(),
  projects: z.array(ProjectSchema).max(100),
  legacyMigrationCompleted: z.boolean(),
  updatedAt: z.number().int().positive()
});

export type ProjectStage = z.infer<typeof ProjectStageSchema>;
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type Decision = z.infer<typeof DecisionSchema>;
export type RestoreContext = z.infer<typeof RestoreContextSchema>;
export type RevivalAction = z.infer<typeof ActionSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type ReturnPlan = z.infer<typeof ReturnPlanSchema>;
export type ProjectAnalysis = z.infer<typeof ProjectAnalysisSchema>;
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
    createdAt: now,
    updatedAt: now
  };
}
