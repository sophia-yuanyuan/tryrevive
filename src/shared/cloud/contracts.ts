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

const CloudTimestampSchema = z.number().int().nonnegative();

export const CloudStatusSchema = z.object({
  available: z.boolean(),
  authenticated: z.boolean(),
  balance: CloudBalanceSchema.nullable(),
  secureSessionStorage: z.boolean(),
  paymentAvailable: z.boolean().default(false),
  message: z.string().trim().max(300)
});

export const CloudPaymentPackageSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9_-]*$/)
    .max(48),
  name: z.string().trim().min(1).max(80),
  currency: z.string().regex(/^[a-z]{3}$/),
  amount: z.number().int().positive(),
  speechMinutes: z.number().int().min(0),
  projectAnalyses: z.number().int().positive()
});

export const CloudPaymentCatalogSchema = z.object({
  provider: z.literal("stripe"),
  mode: z.enum(["test", "live"]),
  packages: z.array(CloudPaymentPackageSchema).min(1).max(8)
});

const StripeCheckoutUrlSchema = z
  .url()
  .refine(
    (value) =>
      new URL(value).protocol === "https:" && new URL(value).hostname === "checkout.stripe.com"
  );

export const CloudPaymentOrderSchema = z.object({
  id: z.string().trim().min(1).max(200),
  packageId: z.string().trim().min(1).max(48),
  amount: z.number().int().positive(),
  currency: z.string().regex(/^[a-z]{3}$/),
  units: CloudBalanceSchema,
  status: z.enum(["creating", "pending", "paid", "failed", "expired"]),
  checkoutUrl: StripeCheckoutUrlSchema.nullable(),
  createdAt: CloudTimestampSchema,
  updatedAt: CloudTimestampSchema,
  paidAt: CloudTimestampSchema.nullable()
});

export const CloudPaymentCheckoutSchema = z.object({
  order: CloudPaymentOrderSchema
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

export const CloudDataExportSchema = z.object({
  schemaVersion: z.literal(1),
  service: z.literal("tryrevive-cloud"),
  generatedAt: CloudTimestampSchema,
  sourceContent: z.object({
    storedByTryRevive: z.literal(false),
    deletionStatus: z.literal("not_stored"),
    note: z.string().trim().min(1).max(500)
  }),
  account: z.object({
    id: z.string().trim().min(1).max(200),
    balance: CloudBalanceSchema,
    createdAt: CloudTimestampSchema,
    updatedAt: CloudTimestampSchema
  }),
  sessions: z.array(
    z.object({
      createdAt: CloudTimestampSchema,
      expiresAt: CloudTimestampSchema
    })
  ),
  redeemEvents: z.array(
    z.object({
      units: CloudBalanceSchema,
      redeemedAt: CloudTimestampSchema
    })
  ),
  quotes: z.array(
    z.object({
      id: z.string().trim().min(1).max(200),
      cost: CloudBalanceSchema,
      createdAt: CloudTimestampSchema,
      expiresAt: CloudTimestampSchema
    })
  ),
  operations: z.array(
    z.object({
      idempotencyKey: z.string().trim().min(1).max(120),
      quoteId: z.string().trim().min(1).max(200),
      status: z.enum(["pending", "succeeded", "failed", "rejected"]),
      cost: CloudBalanceSchema,
      result: z.unknown().nullable(),
      errorCode: z.string().trim().max(80).nullable(),
      createdAt: CloudTimestampSchema,
      updatedAt: CloudTimestampSchema,
      claimedAt: CloudTimestampSchema.nullable(),
      releasedAt: CloudTimestampSchema.nullable()
    })
  ),
  ledger: z.array(
    z.object({
      operationId: z.string().trim().min(1).max(120).nullable(),
      kind: z.enum(["redeem", "reserve", "settle", "release"]),
      speechMinutesDelta: z.number().int(),
      projectAnalysesDelta: z.number().int(),
      createdAt: CloudTimestampSchema
    })
  ),
  payments: z
    .object({
      orders: z.array(
        z.object({
          id: z.string().trim().min(1).max(200),
          packageId: z.string().trim().min(1).max(48),
          amount: z.number().int().positive(),
          currency: z.string().regex(/^[a-z]{3}$/),
          units: CloudBalanceSchema,
          status: z.enum(["creating", "pending", "paid", "failed", "expired"]),
          createdAt: CloudTimestampSchema,
          updatedAt: CloudTimestampSchema,
          paidAt: CloudTimestampSchema.nullable()
        })
      ),
      ledger: z.array(
        z.object({
          orderId: z.string().trim().min(1).max(200),
          units: CloudBalanceSchema,
          amount: z.number().int().positive(),
          currency: z.string().regex(/^[a-z]{3}$/),
          provider: z.literal("stripe"),
          createdAt: CloudTimestampSchema,
          appliedAt: CloudTimestampSchema.nullable()
        })
      )
    })
    .default({ orders: [], ledger: [] })
});

export const CloudSourceDeletionResultSchema = z.object({
  status: z.literal("not_stored"),
  sourceDeleted: z.literal(true),
  storedByTryRevive: z.literal(false),
  message: z.string().trim().min(1).max(500)
});

export const CloudAccountDeletionResultSchema = z.object({
  deleted: z.literal(true),
  remoteSessionsRevoked: z.literal(true),
  unusedBalanceDeleted: CloudBalanceSchema,
  message: z.string().trim().min(1).max(500)
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
export type CloudPaymentPackage = z.infer<typeof CloudPaymentPackageSchema>;
export type CloudPaymentCatalog = z.infer<typeof CloudPaymentCatalogSchema>;
export type CloudPaymentCheckout = z.infer<typeof CloudPaymentCheckoutSchema>;
export type CloudQuote = z.infer<typeof CloudQuoteSchema>;
export type CloudRedeemResult = z.infer<typeof CloudRedeemResultSchema>;
export type CloudDisconnectResult = z.infer<typeof CloudDisconnectResultSchema>;
export type CloudDataExport = z.infer<typeof CloudDataExportSchema>;
export type CloudSourceDeletionResult = z.infer<typeof CloudSourceDeletionResultSchema>;
export type CloudAccountDeletionResult = z.infer<typeof CloudAccountDeletionResultSchema>;
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
