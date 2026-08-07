import { z } from "zod";
import { ProjectAnalysisSchema } from "./model";

const SafeRelativePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(320)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.startsWith("\\") &&
      !/^[a-z]:/iu.test(value) &&
      !/(?:^|\/)\.\.(?:\/|$)/u.test(value),
    "扫描结果只能包含项目内的相对路径"
  );

export const RepositoryFileFingerprintSchema = z.object({
  path: SafeRelativePathSchema,
  sizeBytes: z
    .number()
    .int()
    .min(0)
    .max(128 * 1024),
  modifiedAt: z.number().int().positive(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/u)
});

export const RepositorySnapshotSchema = z.object({
  scannedAt: z.number().int().positive(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  files: z.array(RepositoryFileFingerprintSchema).max(180)
});

export const RepositoryScanBoundarySchema = z.object({
  scannedFileCount: z.number().int().min(0).max(180),
  readBytes: z.number().int().min(0).max(1_500_000),
  skippedSecretCount: z.number().int().min(0),
  skippedLinkCount: z.number().int().min(0),
  skippedBinaryCount: z.number().int().min(0),
  skippedLargeCount: z.number().int().min(0),
  truncated: z.boolean()
});

export const RepositoryEvidenceSchema = z.object({
  path: SafeRelativePathSchema,
  reason: z.string().trim().min(1).max(120)
});

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

export type RepositoryEvidence = z.infer<typeof RepositoryEvidenceSchema>;
export type RepositoryFileFingerprint = z.infer<typeof RepositoryFileFingerprintSchema>;
export type RepositorySnapshot = z.infer<typeof RepositorySnapshotSchema>;
export type RepositoryScanSuccess = z.infer<typeof RepositoryScanSuccessSchema>;
export type RepositoryScanResult = z.infer<typeof RepositoryScanResultSchema>;
