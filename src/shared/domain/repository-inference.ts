import { z } from "zod";
import { ProjectAnalysisSchema, type ProjectAnalysis } from "./model";
import {
  RepositoryEvidenceSchema,
  RepositoryScanBoundarySchema,
  RepositorySnapshotSchema,
  type RepositoryScanBoundary
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

export function addRepositoryScanBoundary(
  analysis: ProjectAnalysis,
  boundary: RepositoryScanBoundary
): ProjectAnalysis {
  const boundaryNotes: string[] = [];
  if (boundary.truncated) {
    boundaryNotes.push(
      "扫描已达到时间、文件数量或读取总量上限，因此摘要只覆盖本次安全读取到的部分。"
    );
  }
  const skipped = [
    [boundary.skippedSecretCount, "疑似敏感项"],
    [boundary.skippedLinkCount, "链接或项目外路径"],
    [boundary.skippedBinaryCount, "非文字项"],
    [boundary.skippedLargeCount, "过大文件"]
  ]
    .filter(([count]) => Number(count) > 0)
    .map(([count, label]) => `${label} ${count}`);
  if (skipped.length) {
    boundaryNotes.push(`为保护隐私和稳定性，本次未读取：${skipped.join("、")}。`);
  }
  return ProjectAnalysisSchema.parse({
    ...analysis,
    uncertainties: [...new Set([...boundaryNotes, ...analysis.uncertainties])].slice(0, 5)
  });
}
