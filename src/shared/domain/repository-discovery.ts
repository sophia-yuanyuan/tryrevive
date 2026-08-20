import { z } from "zod";

export const RepositoryDiscoveryCandidateSchema = z
  .object({
    id: z.string().regex(/^candidate_[a-f0-9]{24}$/u),
    displayName: z.string().trim().min(1).max(120),
    relativeLocation: z.string().trim().min(1).max(320),
    markers: z.array(z.string().trim().min(1).max(80)).min(1).max(8),
    modifiedAt: z.number().int().nonnegative()
  })
  .strict();

export const RepositoryDiscoveryBoundarySchema = z
  .object({
    visitedEntries: z.number().int().nonnegative(),
    skippedDirectoryCount: z.number().int().nonnegative(),
    truncated: z.boolean()
  })
  .strict();

const RepositoryDiscoverySuccessSchema = z
  .object({
    canceled: z.literal(false),
    sessionId: z.string().regex(/^discovery_[a-f0-9]{24}$/u),
    scopeLabel: z.string().trim().min(1).max(120),
    candidates: z.array(RepositoryDiscoveryCandidateSchema).max(50),
    boundary: RepositoryDiscoveryBoundarySchema
  })
  .strict();

export const RepositoryDiscoveryResultSchema = z.discriminatedUnion("canceled", [
  z.object({ canceled: z.literal(true) }).strict(),
  RepositoryDiscoverySuccessSchema
]);

export const RepositoryDiscoverySelectionSchema = z
  .object({
    sessionId: z.string().regex(/^discovery_[a-f0-9]{24}$/u),
    candidateId: z.string().regex(/^candidate_[a-f0-9]{24}$/u)
  })
  .strict();

export type RepositoryDiscoveryCandidate = z.infer<typeof RepositoryDiscoveryCandidateSchema>;
export type RepositoryDiscoveryResult = z.infer<typeof RepositoryDiscoveryResultSchema>;
export type RepositoryDiscoverySelection = z.infer<typeof RepositoryDiscoverySelectionSchema>;
