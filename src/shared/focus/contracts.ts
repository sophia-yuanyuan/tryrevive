import { z } from "zod";

export const FocusSessionRequestSchema = z.object({
  allowedApps: z.array(z.string().trim().min(1).max(80)).max(32),
  blockedApps: z.array(z.string().trim().min(1).max(80)).max(32).default([]),
  strictAllowlist: z.boolean().default(false),
  graceSeconds: z.number().int().min(5).max(60).default(12),
  idlePauseSeconds: z.number().int().min(30).max(600).default(90)
});

export const FocusCapabilitySchema = z.object({
  available: z.boolean(),
  active: z.boolean(),
  message: z.string().max(240)
});

export const FocusPhaseSchema = z.enum([
  "starting",
  "allowed",
  "grace",
  "blocked",
  "idle",
  "stopped",
  "error"
]);

export const FocusViolationKindSchema = z.enum(["unlisted", "blocked"]).nullable();

export const FocusEventSchema = z.object({
  phase: FocusPhaseSchema,
  appName: z.string().trim().max(80).default(""),
  graceRemainingSeconds: z.number().int().min(0).max(60).default(0),
  idleSeconds: z.number().int().min(0).default(0),
  allowedApps: z.array(z.string().trim().min(1).max(80)).max(32),
  blockedApps: z.array(z.string().trim().min(1).max(80)).max(32).default([]),
  violationKind: FocusViolationKindSchema.default(null),
  message: z.string().max(240)
});

export const FocusAcknowledgeSchema = z.enum(["resume", "necessary"]);

export type FocusSessionRequest = z.infer<typeof FocusSessionRequestSchema>;
export type FocusCapability = z.infer<typeof FocusCapabilitySchema>;
export type FocusEvent = z.infer<typeof FocusEventSchema>;
export type FocusAcknowledge = z.infer<typeof FocusAcknowledgeSchema>;

export function normalizeAppName(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\.exe$/u, "")
    .replace(/[\s._-]+/gu, "");
}

export function isAllowedApp(appName: string, allowedApps: string[]): boolean {
  const normalized = normalizeAppName(appName);
  return allowedApps.some((allowed) => normalizeAppName(allowed) === normalized);
}

export function isBlockedApp(appName: string, blockedApps: string[]): boolean {
  const normalized = normalizeAppName(appName);
  return blockedApps.some((blocked) => normalizeAppName(blocked) === normalized);
}
