import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';
import { AdminLoginDto } from './dto/admin-login.dto';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar_url: string | null;
  created_at: string;
  last_login_at: string;
  is_active: boolean;
}

export interface RolePermissions {
  role: string;
  permissions: Record<string, boolean>;
}

@Injectable()
export class AdminSettingsService {
  private readonly logger = new Logger(AdminSettingsService.name);
  private supabase: SupabaseClient;

  private inMemoryPermissions: RolePermissions[] = [
    ...DEFAULT_ROLE_PERMISSIONS,
  ];

  constructor(private configService: ConfigService) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
  }

  /**
   * Only people listed in admin_users, active, and signing in with the
   * password of their Supabase account get a session.
   */
  async login(dto: AdminLoginDto) {
    const email = dto.email.toLowerCase().trim();
    const refused = new UnauthorizedException(
      'E-mail ou mot de passe incorrect.',
    );

    const admin = await this.findAdminByEmail(email);
    if (!admin) throw refused;
    if (!admin.is_active) {
      throw new UnauthorizedException(
        'Ce compte administrateur est désactivé.',
      );
    }

    const { data: authData, error: authError } =
      await this.supabase.auth.signInWithPassword({
        email,
        password: dto.password,
      });
    const token = authData?.session?.access_token;
    if (authError || !token) throw refused;

    const now = new Date().toISOString();
    await this.supabase
      .from('admin_users')
      .update({ last_login_at: now })
      .eq('id', admin.id);
    admin.last_login_at = now;

    return {
      user: admin,
      token,
      permissions: await this.permissionsFor(admin.role),
    };
  }

  /** The admin behind a Supabase access token, or 401. */
  async getMe(authHeader?: string) {
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : '';
    if (!token) throw new UnauthorizedException('Non authentifié');

    const { data, error } = await this.supabase.auth.getUser(token);
    const email = data?.user?.email?.toLowerCase();
    if (error || !email) {
      throw new UnauthorizedException('Session invalide ou expirée');
    }

    const admin = await this.findAdminByEmail(email);
    if (!admin || !admin.is_active) {
      throw new UnauthorizedException('Accès réservé à l’équipe NAYHA');
    }

    return {
      user: admin,
      token,
      permissions: await this.permissionsFor(admin.role),
    };
  }

  async getUsers(): Promise<AdminUser[]> {
    const { data, error } = await this.supabase
      .from('admin_users')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) this.fail('list admin users', error.message);
    return (data ?? []) as AdminUser[];
  }

  async addUser(dto: CreateAdminUserDto): Promise<AdminUser> {
    const now = new Date().toISOString();
    const { data, error } = await this.supabase
      .from('admin_users')
      .insert({
        id: `adm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        name: dto.name,
        email: dto.email.toLowerCase().trim(),
        role: dto.role || 'admin',
        avatar_url: dto.avatar_url ?? null,
        created_at: now,
        last_login_at: now,
        is_active: dto.is_active ?? true,
      })
      .select()
      .single<AdminUser>();
    if (error || !data) this.fail('add admin user', error?.message);
    return data;
  }

  async updateUser(id: string, dto: UpdateAdminUserDto): Promise<AdminUser> {
    const { data, error } = await this.supabase
      .from('admin_users')
      .update(dto)
      .eq('id', id)
      .select()
      .maybeSingle<AdminUser>();
    if (error) this.fail('update admin user', error.message);
    if (!data) throw new NotFoundException(`Admin user ${id} not found`);
    return data;
  }

  async deleteUser(id: string): Promise<{ success: boolean }> {
    const { error } = await this.supabase
      .from('admin_users')
      .delete()
      .eq('id', id);
    if (error) this.fail('delete admin user', error.message);
    return { success: true };
  }

  private async findAdminByEmail(email: string): Promise<AdminUser | null> {
    const { data, error } = await this.supabase
      .from('admin_users')
      .select('*')
      .ilike('email', email)
      .maybeSingle<AdminUser>();
    if (error) this.fail('read admin user', error.message);
    return data;
  }

  private async permissionsFor(role: string) {
    const all = await this.getPermissions();
    return all.find((p) => p.role === role)?.permissions ?? {};
  }

  private fail(action: string, detail?: string): never {
    this.logger.error(
      `Admin settings: ${action} failed: ${detail ?? 'no data'}`,
    );
    throw new InternalServerErrorException(
      'Le service d’administration est momentanément indisponible.',
    );
  }

  async getPermissions(): Promise<RolePermissions[]> {
    try {
      const { data, error } = await this.supabase
        .from('admin_role_permissions')
        .select('*');

      if (!error && data && data.length > 0) {
        this.inMemoryPermissions = data;
        return data;
      }
    } catch (err) {
      this.logger.warn(
        `Could not fetch admin_role_permissions from Supabase: ${err}`,
      );
    }

    return [...this.inMemoryPermissions];
  }

  async updatePermissions(
    role: string,
    dto: UpdatePermissionsDto,
  ): Promise<RolePermissions> {
    try {
      const { data, error } = await this.supabase
        .from('admin_role_permissions')
        .upsert({ role, permissions: dto.permissions })
        .select()
        .single();

      if (!error && data) {
        const idx = this.inMemoryPermissions.findIndex((p) => p.role === role);
        if (idx !== -1) this.inMemoryPermissions[idx] = data;
        else this.inMemoryPermissions.push(data);
        return data;
      }
    } catch (err) {
      this.logger.warn(
        `Could not upsert admin_role_permissions in Supabase: ${err}`,
      );
    }

    const idx = this.inMemoryPermissions.findIndex((p) => p.role === role);
    const updated = { role, permissions: dto.permissions };
    if (idx !== -1) {
      this.inMemoryPermissions[idx] = updated;
    } else {
      this.inMemoryPermissions.push(updated);
    }
    return updated;
  }
}

const DEFAULT_ROLE_PERMISSIONS: RolePermissions[] = [
  {
    role: 'super_admin',
    permissions: {
      dashboard: true,
      users_view: true,
      users_edit: true,
      candidatures_view: true,
      ai_view: true,
      ai_config: true,
      ateliers_view: true,
      ateliers_edit: true,
      community_view: true,
      community_moderate: true,
      subscriptions_view: true,
      subscriptions_edit: true,
      settings_view: true,
      settings_edit: true,
    },
  },
  {
    role: 'admin',
    permissions: {
      dashboard: true,
      users_view: true,
      users_edit: true,
      candidatures_view: true,
      ai_view: true,
      ai_config: true,
      ateliers_view: true,
      ateliers_edit: true,
      community_view: true,
      community_moderate: true,
      subscriptions_view: true,
      subscriptions_edit: true,
      settings_view: true,
      settings_edit: false,
    },
  },
  {
    role: 'moderator',
    permissions: {
      dashboard: true,
      users_view: true,
      users_edit: false,
      candidatures_view: false,
      ai_view: false,
      ai_config: false,
      ateliers_view: true,
      ateliers_edit: false,
      community_view: true,
      community_moderate: true,
      subscriptions_view: false,
      subscriptions_edit: false,
      settings_view: false,
      settings_edit: false,
    },
  },
  {
    role: 'viewer',
    permissions: {
      dashboard: true,
      users_view: true,
      users_edit: false,
      candidatures_view: true,
      ai_view: true,
      ai_config: false,
      ateliers_view: true,
      ateliers_edit: false,
      community_view: true,
      community_moderate: false,
      subscriptions_view: true,
      subscriptions_edit: false,
      settings_view: true,
      settings_edit: false,
    },
  },
];
