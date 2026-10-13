import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  isPremiumProfile,
  SUBSCRIPTION_COLUMNS,
  SubscriptionFields,
} from '../common/subscription';
import {
  PAID_FEATURE_KEY,
  USAGE_LIMITS,
  UsageKind,
} from './paid-feature.decorator';

/**
 * Enforces @PaidFeature on endpoints: an active subscription, then the
 * fair-use limit of the endpoint's kind. Endpoints without the decorator
 * pass through untouched.
 */
@Injectable()
export class PaidFeatureGuard implements CanActivate {
  private readonly logger = new Logger(PaidFeatureGuard.name);
  private readonly supabase: SupabaseClient;

  constructor(
    private readonly reflector: Reflector,
    configService: ConfigService,
  ) {
    this.supabase = createClient(
      configService.get<string>('SUPABASE_URL')!,
      configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<
      { kind?: UsageKind } | undefined
    >(PAID_FEATURE_KEY, [context.getHandler(), context.getClass()]);
    if (!feature) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ user?: { id?: string } }>();
    const userId = request.user?.id;
    if (!userId) throw new ForbiddenException();

    const { data: profile } = await this.supabase
      .from('user_profiles')
      .select(SUBSCRIPTION_COLUMNS)
      .eq('id', userId)
      .maybeSingle<SubscriptionFields>();
    if (!profile || !isPremiumProfile(profile)) {
      throw new ForbiddenException({
        error: 'subscription_required',
        message: 'Cette fonctionnalité fait partie de l’abonnement NAYHA.',
      });
    }

    if (feature.kind) await this.consume(userId, feature.kind);
    return true;
  }

  private async consume(userId: string, kind: UsageKind) {
    const { limit, period } = USAGE_LIMITS[kind];
    const now = new Date();
    const periodStart =
      period === 'day'
        ? now.toISOString().slice(0, 10)
        : `${now.toISOString().slice(0, 7)}-01`;

    const result = await this.supabase.rpc('consume_ai_usage', {
      p_user_id: userId,
      p_kind: kind,
      p_period_start: periodStart,
      p_limit: limit,
    });
    const allowed = result.data as boolean | null;
    const error = result.error;
    if (error) {
      // Never block a paying user because the counter is unavailable.
      this.logger.error(`Usage counter failed (${kind}): ${error.message}`);
      return;
    }
    if (allowed === false) {
      throw new HttpException(
        {
          error: 'usage_limit',
          message:
            period === 'day'
              ? 'Tu as beaucoup échangé aujourd’hui : on reprend demain.'
              : 'Tu as atteint le maximum de ce mois-ci : ça repart le mois prochain.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
