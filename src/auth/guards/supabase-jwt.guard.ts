import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseJwtGuard implements CanActivate {
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new UnauthorizedException('Empty bearer token');
    }

    const { data, error } = await this.supabase.auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // A suspended account loses access at once, even with a valid token.
    if (await this.isBlocked(data.user.id)) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'account_blocked',
        message:
          'Ton compte a été suspendu. Écris à contact@progix.pro pour en savoir plus.',
      });
    }

    request.user = {
      id: data.user.id,
      email: data.user.email,
    };

    // Update activity timestamp in background (non-blocking)
    (async () => {
      try {
        await this.supabase
          .from('user_profiles')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', data.user.id);
      } catch (_) {
        // silent
      }
    })();

    return true;
  }

  /** Blocked state, cached a few seconds to spare a query per request. */
  private async isBlocked(userId: string): Promise<boolean> {
    const cached = blockedCache.get(userId);
    if (cached && cached.until > Date.now()) return cached.blocked;
    const { data } = await this.supabase
      .from('user_profiles')
      .select('is_blocked')
      .eq('id', userId)
      .maybeSingle<{ is_blocked: boolean | null }>();
    const blocked = data?.is_blocked === true;
    blockedCache.set(userId, { blocked, until: Date.now() + BLOCKED_CACHE_MS });
    return blocked;
  }
}

const BLOCKED_CACHE_MS = 30_000;
const blockedCache = new Map<string, { blocked: boolean; until: number }>();

/** Called when the team blocks or unblocks someone, so it applies at once. */
export function forgetBlockedState(userId: string) {
  blockedCache.delete(userId);
}
