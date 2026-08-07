import assert from "node:assert/strict";
import test from "node:test";
import {
  estimateCost,
  extractResponseText,
  normalizeAnalysis,
  parseSourceMetadata,
  sha256Hex
} from "./cloud-core.js";

test("audio quotes round up visible speech minutes", () => {
  assert.deepEqual(
    estimateCost({
      kind: "audio",
      name: "项目说明.webm",
      mimeType: "audio/webm",
      sizeBytes: 1024,
      durationSeconds: 61
    }),
    { speechMinutes: 2, projectAnalyses: 1 }
  );
});

test("metadata rejects oversized sources before any provider call", () => {
  assert.throws(() =>
    parseSourceMetadata({
      kind: "attachment",
      name: "项目.pdf",
      mimeType: "application/pdf",
      sizeBytes: 26 * 1024 * 1024,
      durationSeconds: null
    })
  );
});

test("structured drafts retain uncertainty and bounded next actions", () => {
  const draft = normalizeAnalysis(
    {
      originalGoal: "提交一份黑客松申请",
      lastCompleted: "写完问题陈述",
      stuckAt: "还没写团队分工",
      deadline: "周日",
      whyMatters: "验证项目",
      stallReasons: ["等待队友信息"],
      suggestedDecision: "shrink",
      nextAction: {
        text: "先写自己的职责",
        doneDefinition: "留下 80 字职责说明",
        minutes: 10
      },
      uncertainties: ["队友是否确认参加"]
    },
    { sourceLabel: "申请记录.md", createdAt: 1_800_000_000_000 }
  );
  assert.equal(draft.nextAction.minutes, 10);
  assert.deepEqual(draft.uncertainties, ["队友是否确认参加"]);
});

test("response text can be extracted from raw Responses API output items", () => {
  assert.equal(
    extractResponseText({
      output: [{ content: [{ type: "output_text", text: "{\"ok\":true}" }] }]
    }),
    "{\"ok\":true}"
  );
});

test("redeem/session identifiers can be hashed without exposing the raw value", async () => {
  assert.equal((await sha256Hex("private-session-token")).length, 64);
});
