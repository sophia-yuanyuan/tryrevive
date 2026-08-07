import {
  OutcomeDraftSchema,
  type OutcomeDraft,
  type RepositoryObservation
} from "./model";
import type { RepositorySnapshot } from "./repository";

export type RepositoryOutcomeChange = OutcomeDraft["changes"][number];

function compactPaths(paths: string[]): string {
  const visible = paths.slice(0, 3).join("、");
  return paths.length > 3 ? `${visible} 等 ${paths.length} 个路径` : visible;
}

export function compareRepositorySnapshots(
  baseline: RepositorySnapshot,
  current: RepositorySnapshot
): RepositoryOutcomeChange[] {
  const beforeByPath = new Map(baseline.files.map((file) => [file.path, file]));
  const changes: RepositoryOutcomeChange[] = [];

  for (const file of current.files) {
    const before = beforeByPath.get(file.path);
    if (!before) {
      changes.push({ path: file.path, kind: "now_observed" });
      continue;
    }
    if (before.contentHash !== file.contentHash) {
      changes.push({ path: file.path, kind: "content_changed" });
    }
  }

  return changes
    .sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "content_changed" ? -1 : 1;
      return left.path.localeCompare(right.path, "zh-CN");
    })
    .slice(0, 20);
}

export function createRepositoryOutcomeDraft(
  input: {
    actionId: string;
    baseline: RepositorySnapshot | null;
    current: RepositorySnapshot | null;
    scanTruncated?: boolean;
  },
  now = Date.now()
): OutcomeDraft {
  if (!input.baseline || !input.current) {
    return OutcomeDraftSchema.parse({
      actionId: input.actionId,
      status: "scan_failed",
      changes: [],
      suggestedNote:
        "这次无法完成开始前与完成后的扫描对比；你的专注结果没有丢失，请手动写下实际留下的结果。",
      scanTruncated: Boolean(input.scanTruncated),
      createdAt: now
    });
  }

  const changes = compareRepositorySnapshots(input.baseline, input.current);
  if (!changes.length) {
    return OutcomeDraftSchema.parse({
      actionId: input.actionId,
      status: "no_readable_change",
      changes,
      suggestedNote:
        "这次有限扫描没有读到文件内容变化；这不代表你没有进展，请手动写下实际留下的结果。",
      scanTruncated: Boolean(input.scanTruncated),
      createdAt: now
    });
  }

  const changedPaths = changes
    .filter((change) => change.kind === "content_changed")
    .map((change) => change.path);
  const observedPaths = changes
    .filter((change) => change.kind === "now_observed")
    .map((change) => change.path);
  const clauses: string[] = [];
  if (changedPaths.length) {
    clauses.push(`TryRevive 只读扫描到 ${compactPaths(changedPaths)} 的内容与开始前不同`);
  }
  if (observedPaths.length) {
    clauses.push(`本次新扫描到 ${compactPaths(observedPaths)}`);
  }

  return OutcomeDraftSchema.parse({
    actionId: input.actionId,
    status: "changes_detected",
    changes,
    suggestedNote: `${clauses.join("；")}。这只说明文件变化，不代表完成标准或成果质量已经得到验证。`,
    scanTruncated: Boolean(input.scanTruncated),
    createdAt: now
  });
}

export function observationFromOutcome(
  draft: OutcomeDraft | null
): RepositoryObservation | null {
  if (!draft || draft.status !== "changes_detected" || !draft.changes.length) return null;
  return {
    kind: "repository_diff",
    paths: draft.changes.map((change) => change.path),
    detectedAt: draft.createdAt
  };
}
