import OpenCC from "opencc-js/t2cn";

const toSimplifiedChinese = OpenCC.Converter({ from: "t", to: "cn" });

export function normalizeSpeechTranscript(transcript: string, culture: string): string {
  const trimmed = transcript.trim();
  if (!culture.toLocaleLowerCase("en-US").startsWith("zh")) return trimmed;
  return toSimplifiedChinese(trimmed);
}
