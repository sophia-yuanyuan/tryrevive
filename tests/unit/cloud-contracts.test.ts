import { describe, expect, it } from "vitest";
import {
  canAffordCloudQuote,
  CloudAnalysisResultSchema,
  CloudDataExportSchema,
  CloudReservationResultSchema,
  estimateCloudCost
} from "@/shared/cloud/contracts";
import {
  isCloudAudioFile,
  normalizeCloudMimeType,
  resolveCloudBaseUrl
} from "@/shared/cloud/intake-security";

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

  it("accepts only a bounded reservation token or an already-settled result", () => {
    expect(
      CloudReservationResultSchema.safeParse({
        status: "reserved",
        reservationToken: "r".repeat(64),
        balance: { speechMinutes: 2, projectAnalyses: 1 },
        charged: { speechMinutes: 0, projectAnalyses: 1 },
        expiresAt: 1_800_000_600_000
      }).success
    ).toBe(true);
    expect(
      CloudReservationResultSchema.safeParse({
        status: "reserved",
        reservationToken: "short",
        balance: { speechMinutes: 2, projectAnalyses: 1 },
        charged: { speechMinutes: 0, projectAnalyses: 1 },
        expiresAt: 1_800_000_600_000
      }).success
    ).toBe(false);
  });

  it("allows only the reviewed TryRevive API origin in packaged builds", () => {
    expect(resolveCloudBaseUrl("https://api.tryrevive.online", true)).toBe(
      "https://api.tryrevive.online"
    );
    expect(resolveCloudBaseUrl("https://api.tryrevive.online/v1", true)).toBeNull();
    expect(resolveCloudBaseUrl("https://api.tryrevive.online.evil.example", true)).toBeNull();
    expect(resolveCloudBaseUrl("https://example.com", true)).toBeNull();
  });

  it("keeps local harnesses development-only", () => {
    expect(resolveCloudBaseUrl("http://127.0.0.1:8787", false)).toBe("http://127.0.0.1:8787");
    expect(resolveCloudBaseUrl("http://127.0.0.1:8787", true)).toBeNull();
    expect(resolveCloudBaseUrl("http://example.com", false)).toBeNull();
  });

  it("infers safe attachment and audio MIME types before names are redacted", () => {
    expect(normalizeCloudMimeType("报名材料.DOCX", "")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(normalizeCloudMimeType("项目说明.mp3", "application/octet-stream")).toBe("audio/mpeg");
    expect(isCloudAudioFile("项目说明.mp3", "")).toBe(true);
    expect(normalizeCloudMimeType("未知文件.bin", "")).toBe("application/octet-stream");
  });

  it("accepts a privacy export only when it contains no stored source-content claim", () => {
    const exported = CloudDataExportSchema.safeParse({
      schemaVersion: 1,
      service: "tryrevive-cloud",
      generatedAt: 1_800_000_000_000,
      sourceContent: {
        storedByTryRevive: false,
        deletionStatus: "not_stored",
        note: "TryRevive does not persist source content."
      },
      account: {
        id: "account-1",
        balance: { speechMinutes: 2, projectAnalyses: 1 },
        createdAt: 1_799_000_000_000,
        updatedAt: 1_800_000_000_000
      },
      sessions: [],
      redeemEvents: [],
      quotes: [],
      operations: [],
      ledger: []
    });
    expect(exported.success).toBe(true);

    const falseClaim = CloudDataExportSchema.safeParse({
      ...(exported.success ? exported.data : {}),
      sourceContent: {
        storedByTryRevive: true,
        deletionStatus: "stored",
        note: "Source was retained."
      }
    });
    expect(falseClaim.success).toBe(false);
  });
});
