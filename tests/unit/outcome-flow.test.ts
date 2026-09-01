import { describe, expect, it } from "vitest";
import {
  compareRepositorySnapshots,
  createRepositoryOutcomeDraft,
  observationFromOutcome
} from "@/shared/domain/outcome-flow";
import type { RepositorySnapshot } from "@/shared/domain/repository";

function snapshot(
  files: Array<{ path: string; hash: string; modifiedAt?: number }>,
  scannedAt = 1_800_000_000_000
): RepositorySnapshot {
  return {
    scannedAt,
    fingerprint: "f".repeat(64),
    files: files.map((file) => ({
      path: file.path,
      sizeBytes: 10,
      modifiedAt: file.modifiedAt ?? scannedAt,
      contentHash: file.hash.repeat(64).slice(0, 64)
    }))
  };
}

describe("repository outcome inference", () => {
  it("reports content changes and newly observed paths without claiming creation", () => {
    const before = snapshot([
      { path: "src/main.ts", hash: "a" },
      { path: "README.md", hash: "b" }
    ]);
    const after = snapshot(
      [
        { path: "src/main.ts", hash: "c" },
        { path: "README.md", hash: "b" },
        { path: "notes.md", hash: "d" }
      ],
      1_800_000_001_000
    );

    const changes = compareRepositorySnapshots(before, after);
    const draft = createRepositoryOutcomeDraft({
      actionId: "action-one",
      baseline: before,
      current: after
    });

    expect(changes).toEqual([
      { path: "src/main.ts", kind: "content_changed" },
      { path: "notes.md", kind: "now_observed" }
    ]);
    expect(draft.status).toBe("changes_detected");
    expect(draft.suggestedNote).toContain("本次新扫描到 notes.md");
    expect(draft.suggestedNote).not.toContain("创建");
    expect(draft.suggestedNote).not.toContain("已完成");
    expect(observationFromOutcome(draft)?.paths).toEqual(["src/main.ts", "notes.md"]);
  });

  it("ignores mtime-only changes and paths missing from a bounded rescan", () => {
    const before = snapshot([
      { path: "src/main.ts", hash: "a", modifiedAt: 1_800_000_000_000 },
      { path: "possibly-truncated.md", hash: "b" }
    ]);
    const after = snapshot(
      [{ path: "src/main.ts", hash: "a", modifiedAt: 1_800_000_001_000 }],
      1_800_000_001_000
    );

    const draft = createRepositoryOutcomeDraft({
      actionId: "action-one",
      baseline: before,
      current: after,
      scanTruncated: true
    });

    expect(draft.status).toBe("no_readable_change");
    expect(draft.changes).toEqual([]);
    expect(draft.scanTruncated).toBe(true);
    expect(JSON.stringify(draft)).not.toContain("删除");
    expect(observationFromOutcome(draft)).toBeNull();
  });

  it("falls back to a manual result when no safe baseline exists", () => {
    const draft = createRepositoryOutcomeDraft({
      actionId: "action-one",
      baseline: null,
      current: null
    });

    expect(draft.status).toBe("scan_failed");
    expect(draft.changes).toEqual([]);
    expect(draft.suggestedNote).toContain("手动写下");
    expect(observationFromOutcome(draft)).toBeNull();
  });

  it("caps a stable list at twenty neutral observations", () => {
    const before = snapshot([]);
    const after = snapshot(
      Array.from({ length: 25 }, (_, index) => ({
        path: `notes/${String(24 - index).padStart(2, "0")}.md`,
        hash: "a"
      }))
    );

    const changes = compareRepositorySnapshots(before, after);

    expect(changes).toHaveLength(20);
    expect(changes[0]).toEqual({ path: "notes/00.md", kind: "now_observed" });
    expect(changes.at(-1)).toEqual({ path: "notes/19.md", kind: "now_observed" });
  });
});
