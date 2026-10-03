import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';

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

  private inMemoryUsers: AdminUser[] = [...DEFAULT_ADMIN_USERS];
  private inMemoryPermissions: RolePermissions[] = [...DEFAULT_ROLE_PERMISSIONS];

  constructor(private configService: ConfigService) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
  }

  async getUsers(): Promise<AdminUser[]> {
    try {
      const { data, error } = await this.supabase
        .from('admin_users')
        .select('*')
        .order('created_at', { ascending: true });

      if (!error && data && data.length > 0) {
        this.inMemoryUsers = data;
        return data;
      }
    } catch (err) {
      this.logger.warn(`Could not fetch admin_users from Supabase: ${err}`);
    }

    return [...this.inMemoryUsers];
  }

  async addUser(dto: CreateAdminUserDto): Promise<AdminUser> {
    const id = `adm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    const newUser: AdminUser = {
      id,
      name: dto.name,
      email: dto.email,
      role: dto.role || 'admin',
      avatar_url: dto.avatar_url ?? null,
      created_at: now,
      last_login_at: now,
      is_active: dto.is_active ?? true,
    };

    try {
      const { data, error } = await this.supabase
        .from('admin_users')
        .insert(newUser)
        .select()
        .single();

      if (!error && data) {
        this.inMemoryUsers = [...this.inMemoryUsers.filter((u) => u.id !== id), data];
        return data;
      }
    } catch (err) {
      this.logger.warn(`Could not insert into admin_users in Supabase: ${err}`);
    }

    this.inMemoryUsers = [...this.inMemoryUsers, newUser];
    return newUser;
  }

  async updateUser(id: string, dto: UpdateAdminUserDto): Promise<AdminUser> {
    try {
      const { data, error } = await this.supabase
        .from('admin_users')
        .update(dto)
        .eq('id', id)
        .select()
        .single();

      if (!error && data) {
        const idx = this.inMemoryUsers.findIndex((u) => u.id === id);
        if (idx !== -1) this.inMemoryUsers[idx] = data;
        return data;
      }
    } catch (err) {
      this.logger.warn(`Could not update admin_users in Supabase: ${err}`);
    }

    const idx = this.inMemoryUsers.findIndex((u) => u.id === id);
    if (idx === -1) {
      throw new NotFoundException(`Admin user ${id} not found`);
    }

    this.inMemoryUsers[idx] = {
      ...this.inMemoryUsers[idx],
      ...dto,
    };
    return this.inMemoryUsers[idx];
  }

  async deleteUser(id: string): Promise<{ success: boolean }> {
    try {
      await this.supabase.from('admin_users').delete().eq('id', id);
    } catch (err) {
      this.logger.warn(`Could not delete from admin_users in Supabase: ${err}`);
    }

    this.inMemoryUsers = this.inMemoryUsers.filter((u) => u.id !== id);
    return { success: true };
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
      this.logger.warn(`Could not fetch admin_role_permissions from Supabase: ${err}`);
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
      this.logger.warn(`Could not upsert admin_role_permissions in Supabase: ${err}`);
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

const DEFAULT_ADMIN_USERS: AdminUser[] = [
  {
    id: 'adm_001',
    name: 'Meriem Boussaïd',
    email: 'meriem@nayha.fr',
    role: 'super_admin',
    avatar_url: null,
    created_at: '2025-01-10T09:00:00Z',
    last_login_at: '2026-08-26T08:30:00Z',
    is_active: true,
  },
  {
    id: 'adm_002',
    name: 'Abderraouf Zouaid',
    email: 'abderraouf@progix.dev',
    role: 'admin',
    avatar_url: null,
    created_at: '2025-03-15T10:00:00Z',
    last_login_at: '2026-08-26T10:15:00Z',
    is_active: true,
  },
  {
    id: 'adm_003',
    name: 'Sarah Benali',
    email: 'sarah@nayha.fr',
    role: 'moderator',
    avatar_url: null,
    created_at: '2025-06-01T14:00:00Z',
    last_login_at: '2026-08-25T17:45:00Z',
    is_active: true,
  },
  {
    id: 'adm_004',
    name: 'Nadia Khelifi',
    email: 'nadia@nayha.fr',
    role: 'viewer',
    avatar_url: null,
    created_at: '2025-09-20T11:00:00Z',
    last_login_at: '2026-08-23T09:00:00Z',
    is_active: true,
  },
  {
    id: 'adm_005',
    name: 'Leila Mansour',
    email: 'leila@nayha.fr',
    role: 'moderator',
    avatar_url: null,
    created_at: '2025-07-10T08:30:00Z',
    last_login_at: '2026-08-12T14:20:00Z',
    is_active: false,
  },
];

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
