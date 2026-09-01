import { describe, expect, it } from "vitest";
import { normalizeSpeechTranscript } from "@/shared/speech/transcript";

describe("normalizeSpeechTranscript", () => {
  it("converts mixed traditional Chinese transcription to simplified Chinese", () => {
    expect(normalizeSpeechTranscript("我想申請黑客松，專案還沒有完成。", "zh-CN")).toBe(
      "我想申请黑客松，专案还没有完成。"
    );
  });

  it("does not alter an English transcription", () => {
    expect(normalizeSpeechTranscript("  I want to finish my application.  ", "en-US")).toBe(
      "I want to finish my application."
    );
  });
});
