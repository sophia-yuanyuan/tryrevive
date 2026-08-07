import { z } from "zod";
import { ProjectAnalysisSchema } from "./model";
import {
  RepositoryEvidenceSchema,
  RepositoryScanBoundarySchema,
  RepositorySnapshotSchema
} from "./repository";

export {
  RepositoryEvidenceSchema,
  RepositoryFileFingerprintSchema,
  RepositoryScanBoundarySchema,
  RepositorySnapshotSchema
} from "./repository";

const RepositoryScanSuccessSchema = z.object({
  canceled: z.literal(false),
  bindingId: z.string().regex(/^repo_[a-f0-9]{24}$/u),
  displayName: z.string().trim().min(1).max(120),
  analysis: ProjectAnalysisSchema,
  evidence: z.array(RepositoryEvidenceSchema).max(8),
  snapshot: RepositorySnapshotSchema,
  boundary: RepositoryScanBoundarySchema
});

export const RepositoryScanResultSchema = z.discriminatedUnion("canceled", [
  z.object({ canceled: z.literal(true) }),
  RepositoryScanSuccessSchema
]);

export type {
  RepositoryEvidence,
  RepositoryFileFingerprint,
  RepositorySnapshot
} from "./repository";
export type RepositoryScanSuccess = z.infer<typeof RepositoryScanSuccessSchema>;
export type RepositoryScanResult = z.infer<typeof RepositoryScanResultSchema>;
