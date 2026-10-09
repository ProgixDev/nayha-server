export interface SubscriptionFields {
  subscription_tier?: string | null;
  subscription_status?: string | null;
  subscription_expires_at?: string | null;
  has_paid?: boolean | null;
}

export const SUBSCRIPTION_COLUMNS =
  'subscription_tier, subscription_status, subscription_expires_at, has_paid';

/** Premium tier with a running subscription. Paid profiles without expiry
 * tracking are treated as active (legacy rule of the subscription gate). */
export function isPremiumProfile(profile: SubscriptionFields): boolean {
  if (profile.subscription_tier !== 'premium') return false;
  if (profile.has_paid && !profile.subscription_expires_at) return true;
  return (
    profile.subscription_status === 'active' &&
    !!profile.subscription_expires_at &&
    new Date(profile.subscription_expires_at) > new Date()
  );
}
