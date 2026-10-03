import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
  }

  async getProfile(userId: string) {
    const { data, error } = await this.supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      this.logger.error(
        `Profile lookup failed for user ${userId}: ${error.message}`,
        error.code,
      );
      throw new InternalServerErrorException('Profile lookup failed');
    }

    if (!data) {
      // Auto-create profile for new users
      const { data: newProfile, error: insertError } = await this.supabase
        .from('user_profiles')
        .upsert({
          id: userId,
          rgpd_accepted: false,
          diagnostic_vie_completed: false,
          diagnostic_pro_completed: false,
          metier_selected: false,
          has_paid: false,
        })
        .select()
        .single();

      if (insertError || !newProfile) {
        this.logger.error(
          `Profile creation failed for user ${userId}: ${insertError?.message ?? 'no profile returned'}`,
          insertError?.code,
        );
        throw new InternalServerErrorException('Could not create profile');
      }

      return newProfile;
    }

    // Auto-expire subscription if past due
    if (
      data.subscription_expires_at &&
      data.subscription_status === 'active' &&
      new Date(data.subscription_expires_at) < new Date()
    ) {
      // Update status in background (don't block the response)
      this.supabase
        .from('user_profiles')
        .update({ subscription_status: 'expired' })
        .eq('id', userId);
      data.subscription_status = 'expired';
    }

    return data;
  }

  async updateProfile(
    userId: string,
    updates: {
      diagnostic_vie_completed?: boolean;
      diagnostic_pro_completed?: boolean;
      rgpd_accepted?: boolean;
      metier_selected?: boolean;
      has_paid?: boolean;
      selected_metier_id?: string;
      selected_metier_titre?: string;
      selected_metier_certification_required?: string;
      linkedin_relevant?: boolean | null;
      linkedin_relevance_metier_id?: string | null;
      cv_base?: Record<string, any>;
      linkedin_profil?: Record<string, any>;
      retour_emploi_journey?: Record<string, any>;
      parcours_type?: string;
      parcours_analyse_completed?: boolean;
      parcours_first_candidature_completed?: boolean;
      evaluation_finished?: boolean;
      retour_emploi_evaluation_completed?: boolean;
      ateliers_emploi_watched?: string[];
      actions_semaine_count?: number;
      subscription_tier?: string;
      subscription_status?: string;
      subscription_started_at?: string;
      subscription_expires_at?: string;
    },
  ) {
    const enriched = { ...updates };

    // A relevance decision belongs to one exact target job. Clear it in the
    // same profile update whenever the user chooses a different métier.
    if (updates.selected_metier_id !== undefined) {
      const { data: currentProfile, error: currentProfileError } =
        await this.supabase
          .from('user_profiles')
          .select('selected_metier_id')
          .eq('id', userId)
          .maybeSingle();

      if (currentProfileError || !currentProfile) {
        throw new NotFoundException('Profile not found');
      }

      if (currentProfile.selected_metier_id !== updates.selected_metier_id) {
        enriched.linkedin_relevant = null;
        enriched.linkedin_relevance_metier_id = null;
      }
    }

    // Auto-set subscription fields when has_paid is activated
    if (enriched.has_paid === true) {
      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + 30);

      enriched.subscription_tier = enriched.subscription_tier || 'standard';
      enriched.subscription_status = 'active';
      enriched.subscription_started_at = now.toISOString();
      enriched.subscription_expires_at = expiresAt.toISOString();
    }

    const { data, error } = await this.supabase
      .from('user_profiles')
      .update(enriched)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      throw new NotFoundException('Profile not found');
    }

    return data;
  }

  async submitDiagnosticVie(
    userId: string,
    diagnosticData: Record<string, any>,
  ) {
    const { data, error } = await this.supabase
      .from('user_profiles')
      .update({
        diagnostic_vie_data: diagnosticData,
        diagnostic_vie_completed: true,
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      throw new NotFoundException('Profile not found');
    }

    return data;
  }

  async submitDiagnosticPro(
    userId: string,
    diagnosticData: Record<string, any>,
  ) {
    const { data, error } = await this.supabase
      .from('user_profiles')
      .update({
        diagnostic_pro_data: diagnosticData,
        diagnostic_pro_completed: true,
        // Recommendations must be regenerated from the latest diagnostic answers.
        plan_action_data: null,
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      throw new NotFoundException('Profile not found');
    }

    return data;
  }

  async listAdmin() {
    try {
      const { data, error } = await this.supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        return data.map(this.mapFromDb);
      }
    } catch (_) {
      // fallback
    }
    return DEFAULT_ADMIN_USERS;
  }

  async getAdminStats() {
    const users = await this.listAdmin();
    const now = Date.now();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

    const total = users.length;
    const activeThisWeek = users.filter((u) => {
      const t = new Date(u.last_active_at || u.created_at).getTime();
      return now - t < oneWeekMs;
    }).length;
    const paidUsers = users.filter((u) => u.has_paid).length;
    const diagnosticCompleted = users.filter(
      (u) => u.diagnostic_vie_completed && u.diagnostic_pro_completed,
    ).length;

    return { total, activeThisWeek, paidUsers, diagnosticCompleted };
  }

  async getUserById(id: string) {
    try {
      const { data, error } = await this.supabase
        .from('user_profiles')
        .select('*')
        .eq('id', id)
        .single();
      if (!error && data) {
        return this.mapFromDb(data);
      }
    } catch (_) {
      // fallback
    }
    const found = DEFAULT_ADMIN_USERS.find((u) => u.id === id);
    if (!found) throw new NotFoundException('Utilisatrice introuvable');
    return found;
  }

  async toggleBlockUser(id: string, isBlocked: boolean) {
    try {
      const { data, error } = await this.supabase
        .from('user_profiles')
        .update({ is_blocked: isBlocked })
        .eq('id', id)
        .select()
        .single();
      if (!error && data) {
        return this.mapFromDb(data);
      }
    } catch (_) {
      // fallback
    }
    const found = DEFAULT_ADMIN_USERS.find((u) => u.id === id);
    if (found) found.is_blocked = isBlocked;
    return found;
  }

  private mapFromDb(raw: any) {
    const name = raw.name || raw.full_name || 'Utilisatrice NAYHA';
    const email = raw.email || 'utilisatrice@nayha.fr';
    return {
      id: raw.id,
      name,
      email,
      created_at: raw.created_at ?? new Date().toISOString(),
      last_active_at: raw.last_active_at ?? raw.updated_at ?? raw.created_at ?? new Date().toISOString(),
      rgpd_accepted: raw.rgpd_accepted ?? false,
      diagnostic_vie_completed: raw.diagnostic_vie_completed ?? false,
      diagnostic_pro_completed: raw.diagnostic_pro_completed ?? false,
      metier_selected: raw.metier_selected ?? false,
      has_paid: raw.has_paid ?? false,
      selected_metier_titre: raw.selected_metier_titre ?? '',
      parcours_type: raw.parcours_type ?? null,
      parcours_analyse_completed: raw.parcours_analyse_completed ?? false,
      parcours_first_candidature_completed: raw.parcours_first_candidature_completed ?? false,
      ateliers_emploi_watched: Array.isArray(raw.ateliers_emploi_watched) ? raw.ateliers_emploi_watched : [],
      actions_semaine_count: raw.actions_semaine_count ?? 0,
      cv_generated: !!raw.cv_base,
      linkedin_optimized: !!raw.linkedin_profil,
      is_blocked: raw.is_blocked ?? false,
    };
  }
}

const DEFAULT_ADMIN_USERS = [
  {
    id: 'u1',
    name: 'Fatima Benali',
    email: 'fatima.benali@gmail.com',
    created_at: '2026-05-28T10:15:00Z',
    last_active_at: '2026-08-25T14:30:00Z',
    rgpd_accepted: true,
    diagnostic_vie_completed: true,
    diagnostic_pro_completed: true,
    metier_selected: true,
    has_paid: true,
    selected_metier_titre: 'Assistante RH',
    parcours_type: 'retour_emploi',
    parcours_analyse_completed: true,
    parcours_first_candidature_completed: true,
    ateliers_emploi_watched: ['a1', 'a2', 'a3', 'a4', 'a5'],
    actions_semaine_count: 12,
    cv_generated: true,
    linkedin_optimized: true,
    is_blocked: false,
  },
  {
    id: 'u2',
    name: 'Amira Khelifi',
    email: 'amira.khelifi@outlook.fr',
    created_at: '2026-06-03T08:45:00Z',
    last_active_at: '2026-08-26T09:10:00Z',
    rgpd_accepted: true,
    diagnostic_vie_completed: true,
    diagnostic_pro_completed: true,
    metier_selected: true,
    has_paid: true,
    selected_metier_titre: 'Chargee de communication',
    parcours_type: 'reconversion',
    parcours_analyse_completed: true,
    parcours_first_candidature_completed: true,
    ateliers_emploi_watched: ['a1', 'a2', 'a3', 'a6', 'a7'],
    actions_semaine_count: 8,
    cv_generated: true,
    linkedin_optimized: true,
    is_blocked: false,
  },
  {
    id: 'u3',
    name: 'Leila Mansouri',
    email: 'leila.mansouri@yahoo.fr',
    created_at: '2026-06-10T14:20:00Z',
    last_active_at: '2026-08-24T17:45:00Z',
    rgpd_accepted: true,
    diagnostic_vie_completed: true,
    diagnostic_pro_completed: true,
    metier_selected: true,
    has_paid: true,
    selected_metier_titre: 'Responsable marketing',
    parcours_type: 'retour_emploi',
    parcours_analyse_completed: true,
    parcours_first_candidature_completed: true,
    ateliers_emploi_watched: ['a1', 'a2', 'a4', 'a8'],
    actions_semaine_count: 6,
    cv_generated: true,
    linkedin_optimized: true,
    is_blocked: false,
  },
  {
    id: 'u4',
    name: 'Nadia Bouzid',
    email: 'nadia.bouzid@gmail.com',
    created_at: '2026-06-15T11:00:00Z',
    last_active_at: '2026-08-23T15:20:00Z',
    rgpd_accepted: true,
    diagnostic_vie_completed: true,
    diagnostic_pro_completed: true,
    metier_selected: true,
    has_paid: true,
    selected_metier_titre: 'Comptable',
    parcours_type: 'retour_emploi',
    parcours_analyse_completed: true,
    parcours_first_candidature_completed: false,
    ateliers_emploi_watched: ['a1', 'a2', 'a3'],
    actions_semaine_count: 5,
    cv_generated: true,
    linkedin_optimized: false,
    is_blocked: false,
  },
  {
    id: 'u5',
    name: 'Samira El Amrani',
    email: 'samira.elamrani@hotmail.com',
    created_at: '2026-06-18T09:30:00Z',
    last_active_at: '2026-08-25T11:00:00Z',
    rgpd_accepted: true,
    diagnostic_vie_completed: true,
    diagnostic_pro_completed: true,
    metier_selected: true,
    has_paid: true,
    selected_metier_titre: 'Developpeuse web',
    parcours_type: 'reconversion',
    parcours_analyse_completed: true,
    parcours_first_candidature_completed: true,
    ateliers_emploi_watched: ['a1', 'a2', 'a5', 'a6', 'a9'],
    actions_semaine_count: 10,
    cv_generated: true,
    linkedin_optimized: true,
    is_blocked: false,
  },
  {
    id: 'u6',
    name: 'Sophie Martin',
    email: 'sophie.martin@gmail.com',
    created_at: '2026-06-22T16:45:00Z',
    last_active_at: '2026-08-22T14:15:00Z',
    rgpd_accepted: true,
    diagnostic_vie_completed: true,
    diagnostic_pro_completed: true,
    metier_selected: true,
    has_paid: false,
    selected_metier_titre: 'Assistante de direction',
    parcours_type: 'retour_emploi',
    parcours_analyse_completed: false,
    parcours_first_candidature_completed: false,
    ateliers_emploi_watched: ['a1'],
    actions_semaine_count: 3,
    cv_generated: false,
    linkedin_optimized: false,
    is_blocked: false,
  },
  {
    id: 'u7',
    name: 'Marie Dupont',
    email: 'marie.dupont@laposte.net',
    created_at: '2026-06-25T13:10:00Z',
    last_active_at: '2026-08-26T08:00:00Z',
    rgpd_accepted: true,
    diagnostic_vie_completed: true,
    diagnostic_pro_completed: true,
    metier_selected: true,
    has_paid: true,
    selected_metier_titre: 'Gestionnaire de paie',
    parcours_type: 'retour_emploi',
    parcours_analyse_completed: true,
    parcours_first_candidature_completed: true,
    ateliers_emploi_watched: ['a1', 'a2', 'a3', 'a4'],
    actions_semaine_count: 7,
    cv_generated: true,
    linkedin_optimized: true,
    is_blocked: false,
  },
  {
    id: 'u8',
    name: 'Yasmine Hadj',
    email: 'yasmine.hadj@gmail.com',
    created_at: '2026-07-01T10:00:00Z',
    last_active_at: '2026-08-20T16:30:00Z',
    rgpd_accepted: true,
    diagnostic_vie_completed: true,
    diagnostic_pro_completed: true,
    metier_selected: true,
    has_paid: true,
    selected_metier_titre: 'Infographiste',
    parcours_type: 'creation_activite',
    parcours_analyse_completed: true,
    parcours_first_candidature_completed: false,
    ateliers_emploi_watched: ['a1', 'a7', 'a9'],
    actions_semaine_count: 4,
    cv_generated: true,
    linkedin_optimized: false,
    is_blocked: false,
  },
  {
    id: 'u9',
    name: 'Camille Roux',
    email: 'camille.roux@orange.fr',
    created_at: '2026-07-05T08:15:00Z',
    last_active_at: '2026-08-26T10:30:00Z',
    rgpd_accepted: true,
    diagnostic_vie_completed: true,
    diagnostic_pro_completed: true,
    metier_selected: true,
    has_paid: true,
    selected_metier_titre: 'Product Owner',
    parcours_type: 'reconversion',
    parcours_analyse_completed: true,
    parcours_first_candidature_completed: true,
    ateliers_emploi_watched: ['a1', 'a2', 'a3', 'a5', 'a6', 'a8'],
    actions_semaine_count: 15,
    cv_generated: true,
    linkedin_optimized: true,
    is_blocked: false,
  },
  {
    id: 'u10',
    name: 'Khadija Taleb',
    email: 'khadija.taleb@gmail.com',
    created_at: '2026-07-08T15:30:00Z',
    last_active_at: '2026-08-21T11:45:00Z',
    rgpd_accepted: true,
    diagnostic_vie_completed: true,
    diagnostic_pro_completed: false,
    metier_selected: false,
    has_paid: false,
    selected_metier_titre: '',
    parcours_type: null,
    parcours_analyse_completed: false,
    parcours_first_candidature_completed: false,
    ateliers_emploi_watched: [],
    actions_semaine_count: 1,
    cv_generated: false,
    linkedin_optimized: false,
    is_blocked: false,
  },
  {
    id: 'u11',
    name: 'Aurelie Bernard',
    email: 'aurelie.bernard@free.fr',
    created_at: '2026-07-12T11:20:00Z',
    last_active_at: '2026-08-25T09:00:00Z',
    rgpd_accepted: true,
    diagnostic_vie_completed: true,
    diagnostic_pro_completed: true,
    metier_selected: true,
    has_paid: true,
    selected_metier_titre: 'Conseillere en insertion',
    parcours_type: 'reconversion',
    parcours_analyse_completed: true,
    parcours_first_candidature_completed: true,
    ateliers_emploi_watched: ['a1', 'a2', 'a3', 'a7'],
    actions_semaine_count: 9,
    cv_generated: true,
    linkedin_optimized: true,
    is_blocked: false,
  },
  {
    id: 'u12',
    name: 'Ines Chaibi',
    email: 'ines.chaibi@gmail.com',
    created_at: '2026-07-15T14:00:00Z',
    last_active_at: '2026-08-24T15:00:00Z',
    rgpd_accepted: true,
    diagnostic_vie_completed: true,
    diagnostic_pro_completed: true,
    metier_selected: true,
    has_paid: true,
    selected_metier_titre: 'UX Designer',
    parcours_type: 'reconversion',
    parcours_analyse_completed: true,
    parcours_first_candidature_completed: true,
    ateliers_emploi_watched: ['a1', 'a2', 'a6', 'a8', 'a9'],
    actions_semaine_count: 11,
    cv_generated: true,
    linkedin_optimized: true,
    is_blocked: false,
  },
];
