import { describe, expect, it } from "vitest";
import {
  FocusSessionRequestSchema,
  isAllowedApp,
  isBlockedApp,
  normalizeAppName
} from "@/shared/focus/contracts";
import { evaluateFocusSample } from "@/shared/focus/guardian";

const request = {
  allowedApps: ["Code"],
  blockedApps: ["Discord"],
  strictAllowlist: false,
  graceSeconds: 12,
  idlePauseSeconds: 90
};

describe("focus guardian", () => {
  it("keeps old requests on the 12-second safe default", () => {
    expect(
      FocusSessionRequestSchema.parse({
        allowedApps: ["Code"],
        blockedApps: [],
        graceSeconds: 12,
        idlePauseSeconds: 90
      }).strictAllowlist
    ).toBe(false);
  });

  it("matches only normalized process names", () => {
    expect(normalizeAppName(" Windows-Terminal.exe ")).toBe("windowsterminal");
    expect(isAllowedApp("Code.exe", ["Code"])).toBe(true);
    expect(isAllowedApp("chrome", ["msedge"])).toBe(false);
    expect(isBlockedApp("Discord.exe", ["discord"])).toBe(true);
  });

  it("gives a grace period before blocking an unlisted app", () => {
    const grace = evaluateFocusSample({
      appName: "chrome",
      allowedApps: ["Code"],
      blockedApps: ["Discord"],
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
      blockedApps: ["Discord"],
      idleSeconds: 0,
      now: 22_000,
      request,
      state: grace.state
    });
    expect(blocked.event.phase).toBe("blocked");
    expect(blocked.event.graceRemainingSeconds).toBe(0);
    expect(blocked.event.violationKind).toBe("unlisted");
  });

  it("blocks an explicitly excluded app immediately, even if it is also allowed", () => {
    const blocked = evaluateFocusSample({
      appName: "Discord.exe",
      allowedApps: ["Code", "Discord"],
      blockedApps: ["Discord"],
      idleSeconds: 0,
      now: 10_000,
      request,
      state: { deviationStartedAt: null }
    });

    expect(blocked.event).toMatchObject({
      phase: "blocked",
      appName: "Discord.exe",
      graceRemainingSeconds: 0,
      violationKind: "blocked"
    });
  });

  it("immediately returns from every unlisted app in strict allowlist mode", () => {
    const blocked = evaluateFocusSample({
      appName: "chrome",
      allowedApps: ["Code"],
      blockedApps: [],
      idleSeconds: 0,
      now: 10_000,
      request: { ...request, strictAllowlist: true },
      state: { deviationStartedAt: null }
    });

    expect(blocked.event).toMatchObject({
      phase: "blocked",
      appName: "chrome",
      graceRemainingSeconds: 0,
      violationKind: "unlisted"
    });
    expect(blocked.event.message).toContain("严格白名单");
  });

  it("clears deviation when the user returns or becomes idle", () => {
    const allowed = evaluateFocusSample({
      appName: "Code.exe",
      allowedApps: ["Code"],
      blockedApps: ["Discord"],
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
      blockedApps: ["Discord"],
      idleSeconds: 120,
      now: 30_000,
      request,
      state: { deviationStartedAt: 10_000 }
    });
    expect(idle.event.phase).toBe("idle");
    expect(idle.state.deviationStartedAt).toBeNull();
  });
});
