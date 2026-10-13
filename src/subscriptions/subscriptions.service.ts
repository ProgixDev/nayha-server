import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const REVENUECAT_API = 'https://api.revenuecat.com/v1';

/**
 * RevenueCat entitlement identifiers, from highest to lowest. NAYHA sells a
 * single plan ("nayha") in three durations; "premium" and "standard" remain
 * only so subscriptions bought under the earlier offer are still recognised.
 */
const TIERS = ['nayha', 'premium', 'standard'] as const;
type Tier = (typeof TIERS)[number];

interface RevenueCatEntitlement {
  expires_date: string | null;
  purchase_date: string | null;
}

interface RevenueCatSubscriber {
  entitlements?: Record<string, RevenueCatEntitlement>;
}

export interface SubscriptionState {
  tier: Tier | 'free';
  status: 'active' | 'expired' | 'free';
  expiresAt: string | null;
}

/**
 * The stores take the payment, RevenueCat knows the result, and this service
 * copies it into user_profiles. The app never writes these fields itself:
 * every update re-reads the subscriber from RevenueCat's API.
 */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);
  private readonly supabase: SupabaseClient;
  private readonly secretKey?: string;
  private readonly webhookAuth?: string;

  constructor(configService: ConfigService) {
    this.supabase = createClient(
      configService.get<string>('SUPABASE_URL')!,
      configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
    this.secretKey = configService.get<string>('REVENUECAT_SECRET_KEY');
    this.webhookAuth = configService.get<string>('REVENUECAT_WEBHOOK_AUTH');
  }

  /** Called by the app right after a purchase or a restore. */
  async syncUser(userId: string): Promise<SubscriptionState> {
    const subscriber = await this.fetchSubscriber(userId);
    return this.saveState(userId, this.stateFrom(subscriber));
  }

  /**
   * RevenueCat webhook. The event body is only used to know which user
   * changed; the state itself is re-read from the API.
   */
  async handleWebhook(authorization: string | undefined, body: unknown) {
    if (!this.webhookAuth) {
      throw new ServiceUnavailableException('Paiements non configurés');
    }
    if (!authorization || !this.sameSecret(authorization, this.webhookAuth)) {
      throw new UnauthorizedException();
    }

    const event = (body as { event?: Record<string, unknown> })?.event ?? {};
    const list = (value: unknown): unknown[] =>
      Array.isArray(value) ? (value as unknown[]) : [];
    const candidates = [
      event.app_user_id,
      event.original_app_user_id,
      ...list(event.aliases),
      ...list(event.transferred_to),
    ].filter(
      (id): id is string =>
        typeof id === 'string' && !id.startsWith('$RCAnonymousID'),
    );

    for (const userId of new Set(candidates)) {
      // Only accounts known to NAYHA are updated.
      const { data } = await this.supabase
        .from('user_profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();
      if (!data) continue;
      await this.syncUser(userId);
    }
    return { received: true };
  }

  /** Right to erasure: forget the customer at RevenueCat too. */
  async deleteCustomer(userId: string) {
    if (!this.secretKey) return;
    const response = await fetch(
      `${REVENUECAT_API}/subscribers/${encodeURIComponent(userId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${this.secretKey}` },
      },
    );
    if (!response.ok && response.status !== 404) {
      this.logger.error(
        `RevenueCat customer deletion failed for user ${userId}: ${response.status}`,
      );
    }
  }

  private async fetchSubscriber(userId: string): Promise<RevenueCatSubscriber> {
    if (!this.secretKey) {
      throw new ServiceUnavailableException('Paiements non configurés');
    }
    const response = await fetch(
      `${REVENUECAT_API}/subscribers/${encodeURIComponent(userId)}`,
      { headers: { Authorization: `Bearer ${this.secretKey}` } },
    );
    if (!response.ok) {
      this.logger.error(
        `RevenueCat lookup failed for user ${userId}: ${response.status}`,
      );
      throw new ServiceUnavailableException(
        'Impossible de vérifier ton abonnement pour le moment.',
      );
    }
    const json = (await response.json()) as {
      subscriber?: RevenueCatSubscriber;
    };
    return json.subscriber ?? {};
  }

  private stateFrom(subscriber: RevenueCatSubscriber): SubscriptionState {
    const entitlements = subscriber.entitlements ?? {};
    const now = Date.now();
    const isActive = (entitlement?: RevenueCatEntitlement) =>
      !!entitlement &&
      (entitlement.expires_date === null ||
        Date.parse(entitlement.expires_date) > now);

    const activeTier = TIERS.find((tier) => isActive(entitlements[tier]));
    if (activeTier) {
      return {
        tier: activeTier,
        status: 'active',
        expiresAt: entitlements[activeTier].expires_date,
      };
    }

    const lastTier = TIERS.filter((tier) => entitlements[tier]).sort(
      (a, b) =>
        Date.parse(entitlements[b].expires_date ?? '') -
        Date.parse(entitlements[a].expires_date ?? ''),
    )[0];
    return lastTier
      ? {
          tier: lastTier,
          status: 'expired',
          expiresAt: entitlements[lastTier].expires_date,
        }
      : { tier: 'free', status: 'free', expiresAt: null };
  }

  private async saveState(userId: string, state: SubscriptionState) {
    const { data: current } = await this.supabase
      .from('user_profiles')
      .select('subscription_started_at, subscription_status')
      .eq('id', userId)
      .maybeSingle();
    const startedAt =
      state.status === 'active' && current?.subscription_status !== 'active'
        ? new Date().toISOString()
        : ((current?.subscription_started_at as string | null) ?? null);

    const { error } = await this.supabase
      .from('user_profiles')
      .update({
        has_paid: state.status !== 'free',
        subscription_tier: state.tier,
        subscription_status: state.status,
        subscription_expires_at: state.expiresAt,
        subscription_started_at: state.status === 'free' ? null : startedAt,
      })
      .eq('id', userId);
    if (error) {
      this.logger.error(
        `Saving subscription failed for user ${userId}: ${error.message}`,
      );
      throw new ServiceUnavailableException(
        'Impossible d’enregistrer ton abonnement pour le moment.',
      );
    }
    return state;
  }

  private sameSecret(received: string, expected: string) {
    const value = received.replace(/^Bearer\s+/i, '');
    const a = Buffer.from(value);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
