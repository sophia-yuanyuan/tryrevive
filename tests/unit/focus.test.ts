import { describe, expect, it } from "vitest";
import { isAllowedApp, normalizeAppName } from "@/shared/focus/contracts";
import { evaluateFocusSample } from "@/shared/focus/guardian";

const request = {
  allowedApps: ["Code"],
  graceSeconds: 12,
  idlePauseSeconds: 90
};

describe("focus guardian", () => {
  it("matches only normalized process names", () => {
    expect(normalizeAppName(" Windows-Terminal.exe ")).toBe("windowsterminal");
    expect(isAllowedApp("Code.exe", ["Code"])).toBe(true);
    expect(isAllowedApp("chrome", ["msedge"])).toBe(false);
  });

  it("gives a grace period before blocking an unlisted app", () => {
    const grace = evaluateFocusSample({
      appName: "chrome",
      allowedApps: ["Code"],
      idleSeconds: 0,
      now: 10_000,
      request,
      state: { deviationStartedAt: null }
    });
    expect(grace.event).toMatchObject({
      phase: "grace",
      appName: "chrome",
      graceRemainingSeconds: 12
    });

    const blocked = evaluateFocusSample({
      appName: "chrome",
      allowedApps: ["Code"],
      idleSeconds: 0,
      now: 22_000,
      request,
      state: grace.state
    });
    expect(blocked.event.phase).toBe("blocked");
    expect(blocked.event.graceRemainingSeconds).toBe(0);
  });

  it("clears deviation when the user returns or becomes idle", () => {
    const allowed = evaluateFocusSample({
      appName: "Code.exe",
      allowedApps: ["Code"],
      idleSeconds: 0,
      now: 20_000,
      request,
      state: { deviationStartedAt: 10_000 }
    });
    expect(allowed.event.phase).toBe("allowed");
    expect(allowed.state.deviationStartedAt).toBeNull();

    const idle = evaluateFocusSample({
      appName: "chrome",
      allowedApps: ["Code"],
      idleSeconds: 120,
      now: 30_000,
      request,
      state: { deviationStartedAt: 10_000 }
    });
    expect(idle.event.phase).toBe("idle");
    expect(idle.state.deviationStartedAt).toBeNull();
  });
});
