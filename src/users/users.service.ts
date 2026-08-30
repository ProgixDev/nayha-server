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
      cv_base?: Record<string, any>;
      linkedin_profil?: Record<string, any>;
      retour_emploi_journey?: Record<string, any>;
      parcours_type?: string;
      parcours_analyse_completed?: boolean;
      parcours_first_candidature_completed?: boolean;
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
}
