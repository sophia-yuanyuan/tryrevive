import { describe, expect, it } from "vitest";
import { isTrustedRendererUrl } from "../../electron/renderer-trust";

describe("renderer URL trust", () => {
  it("accepts only the exact development origin", () => {
    const developmentUrl = "http://127.0.0.1:5173/";

    expect(isTrustedRendererUrl("http://127.0.0.1:5173/intake", developmentUrl)).toBe(true);
    expect(isTrustedRendererUrl("http://127.0.0.1:5173@evil.example/intake", developmentUrl)).toBe(
      false
    );
    expect(isTrustedRendererUrl("http://127.0.0.1:5174/intake", developmentUrl)).toBe(false);
    expect(isTrustedRendererUrl("https://127.0.0.1:5173/intake", developmentUrl)).toBe(false);
  });

  it("accepts only the packaged renderer host", () => {
    expect(isTrustedRendererUrl("app://renderer/index.html")).toBe(true);
    expect(isTrustedRendererUrl("app://renderer/focus")).toBe(true);
    expect(isTrustedRendererUrl("app://renderer.evil/index.html")).toBe(false);
    expect(isTrustedRendererUrl("app://renderer@evil/index.html")).toBe(false);
    expect(isTrustedRendererUrl("https://renderer/index.html")).toBe(false);
  });
});
