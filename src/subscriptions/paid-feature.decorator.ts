import { SetMetadata } from '@nestjs/common';

/**
 * Fair-use buckets for AI features. Limits are high enough that a normal
 * subscriber never sees them; they only stop abuse.
 */
export const USAGE_LIMITS = {
  /** Conversation messages (coaching, creation assistant), per day. */
  chat: { limit: 60, period: 'day' },
  /** Written documents (CV, letters, LinkedIn, follow-ups), per month. */
  document: { limit: 30, period: 'month' },
  /** Interview simulations started, per month. */
  simulation: { limit: 20, period: 'month' },
  /** Other AI help (analyses, suggestions, drafts), per day. */
  assist: { limit: 100, period: 'day' },
} as const;

export type UsageKind = keyof typeof USAGE_LIMITS;

export const PAID_FEATURE_KEY = 'paidFeature';

/**
 * Marks an endpoint as part of the paid plan. Use after SupabaseJwtGuard
 * with PaidFeatureGuard: it requires an active subscription and, when a
 * kind is given, counts the call against that fair-use limit.
 */
export const PaidFeature = (kind?: UsageKind) =>
  SetMetadata(PAID_FEATURE_KEY, { kind });
