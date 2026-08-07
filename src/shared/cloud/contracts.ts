import { z } from "zod";
import { ProjectAnalysisSchema } from "../domain/model";

export const MAX_CLOUD_SOURCE_BYTES = 25 * 1024 * 1024;

export const CloudSourceMetadataSchema = z.object({
  kind: z.enum(["audio", "attachment", "text"]),
  name: z.string().trim().min(1).max(180),
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().min(0).max(MAX_CLOUD_SOURCE_BYTES),
  durationSeconds: z
    .number()
    .min(1)
    .max(60 * 60)
    .nullable()
    .default(null)
});

export const CloudBalanceSchema = z.object({
  speechMinutes: z.number().int().min(0),
  projectAnalyses: z.number().int().min(0)
});

export const CloudStatusSchema = z.object({
  available: z.boolean(),
  authenticated: z.boolean(),
  balance: CloudBalanceSchema.nullable(),
  secureSessionStorage: z.boolean(),
  message: z.string().trim().max(300)
});

export const CloudQuoteSchema = z.object({
  id: z.string().min(1),
  source: CloudSourceMetadataSchema,
  cost: CloudBalanceSchema,
  balance: CloudBalanceSchema.nullable(),
  canAfford: z.boolean(),
  expiresAt: z.number().int().positive(),
  uploadNotice: z.string().trim().min(1).max(500),
  retentionNotice: z.string().trim().min(1).max(500)
});

export const CloudRedeemResultSchema = z.object({
  balance: CloudBalanceSchema,
  message: z.string().trim().min(1).max(300)
});

export const CloudDisconnectResultSchema = z.object({
  remoteRevoked: z.boolean(),
  message: z.string().trim().min(1).max(300)
});

export const CloudAnalysisResultSchema = z.object({
  draft: ProjectAnalysisSchema,
  balance: CloudBalanceSchema,
  charged: CloudBalanceSchema,
  idempotencyKey: z.string().min(1)
});

export const CloudReservationResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("reserved"),
    reservationToken: z.string().min(32).max(512),
    balance: CloudBalanceSchema,
    charged: CloudBalanceSchema,
    expiresAt: z.number().int().positive()
  }),
  z.object({
    status: z.literal("succeeded"),
    result: CloudAnalysisResultSchema
  })
]);

export type CloudSourceMetadata = z.infer<typeof CloudSourceMetadataSchema>;
export type CloudBalance = z.infer<typeof CloudBalanceSchema>;
export type CloudStatus = z.infer<typeof CloudStatusSchema>;
export type CloudQuote = z.infer<typeof CloudQuoteSchema>;
export type CloudRedeemResult = z.infer<typeof CloudRedeemResultSchema>;
export type CloudDisconnectResult = z.infer<typeof CloudDisconnectResultSchema>;
export type CloudAnalysisResult = z.infer<typeof CloudAnalysisResultSchema>;
export type CloudReservationResult = z.infer<typeof CloudReservationResultSchema>;

export interface CloudSourcePayload {
  metadata: CloudSourceMetadata;
  text?: string;
  bytes?: Uint8Array;
}

export interface CloudAnalyzeRequest {
  idempotencyKey: string;
  quoteId: string;
  projectTitle: string;
  source: CloudSourcePayload;
}

export function estimateCloudCost(source: CloudSourceMetadata): CloudBalance {
  return {
    speechMinutes:
      source.kind === "audio" ? Math.max(1, Math.ceil((source.durationSeconds ?? 1) / 60)) : 0,
    projectAnalyses: 1
  };
}

export function canAffordCloudQuote(balance: CloudBalance, cost: CloudBalance): boolean {
  return (
    balance.speechMinutes >= cost.speechMinutes && balance.projectAnalyses >= cost.projectAnalyses
  );
}
