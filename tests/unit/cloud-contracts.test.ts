import { describe, expect, it } from "vitest";
import {
  canAffordCloudQuote,
  CloudAnalysisResultSchema,
  estimateCloudCost
} from "@/shared/cloud/contracts";

describe("cloud usage contracts", () => {
  it("quotes bounded recordings in visible minutes plus one project analysis", () => {
    expect(
      estimateCloudCost({
        kind: "audio",
        name: "项目说明.webm",
        mimeType: "audio/webm",
        sizeBytes: 2048,
        durationSeconds: 61
      })
    ).toEqual({ speechMinutes: 2, projectAnalyses: 1 });
  });

  it("does not pretend an insufficient balance can upload", () => {
    expect(
      canAffordCloudQuote(
        { speechMinutes: 1, projectAnalyses: 4 },
        { speechMinutes: 2, projectAnalyses: 1 }
      )
    ).toBe(false);
  });

  it("rejects analysis responses that omit user-visible uncertainty", () => {
    const result = CloudAnalysisResultSchema.safeParse({
      draft: {
        id: "draft-1",
        sourceLabel: "项目.md",
        originalGoal: "完成报名",
        lastCompleted: "写完简介",
        stuckAt: "还没补材料",
        deadline: "周五",
        whyMatters: "想参加",
        stallReasons: ["材料分散"],
        suggestedDecision: "shrink",
        nextAction: { text: "列材料", doneDefinition: "出现清单", minutes: 10 },
        createdAt: 1_800_000_000_000
      },
      balance: { speechMinutes: 0, projectAnalyses: 0 },
      charged: { speechMinutes: 0, projectAnalyses: 1 },
      idempotencyKey: "request-123456"
    });
    expect(result.success).toBe(false);
  });
});
