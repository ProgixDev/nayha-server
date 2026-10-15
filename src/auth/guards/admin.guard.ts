import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface AdminUserContext {
  id: string;
  email: string;
  name: string;
  role: string;
}

/**
 * Lets a request through only with a valid Supabase session whose email is
 * an active entry of `admin_users`. The admin is exposed as `request.admin`.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      admin?: AdminUserContext;
    }>();
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : '';
    if (!token) {
      throw new UnauthorizedException('Non authentifié');
    }

    const { data, error } = await this.supabase.auth.getUser(token);
    const email = data?.user?.email?.toLowerCase();
    if (error || !email) {
      throw new UnauthorizedException('Session invalide ou expirée');
    }

    const { data: admin } = await this.supabase
      .from('admin_users')
      .select('id, email, name, role, is_active')
      .ilike('email', email)
      .maybeSingle<{
        id: string;
        name: string;
        role: string;
        is_active: boolean | null;
      }>();
    if (!admin || admin.is_active === false) {
      throw new ForbiddenException('Accès réservé à l’équipe NAYHA');
    }

    request.admin = {
      id: admin.id,
      email,
      name: admin.name,
      role: admin.role,
    } satisfies AdminUserContext;
    return true;
  }
}
