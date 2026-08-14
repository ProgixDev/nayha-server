import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class UsersService {
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

    if (error || !data) {
      // Auto-create profile for new users
      const { data: newProfile, error: insertError } = await this.supabase
        .from('user_profiles')
        .upsert({
          id: userId,
          rgpd_accepted: false,
          diagnostic_vie_completed: false,
          diagnostic_pro_completed: false,
          reports_completed: false,
        })
        .select()
        .single();

      if (insertError || !newProfile) {
        throw new NotFoundException('Could not create profile');
      }

      return newProfile;
    }

    return data;
  }

  async updateProfile(
    userId: string,
    updates: {
      diagnostic_vie_completed?: boolean;
      diagnostic_pro_completed?: boolean;
      rgpd_accepted?: boolean;
    },
  ) {
    const { data, error } = await this.supabase
      .from('user_profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      throw new NotFoundException('Profile not found');
    }

    return data;
  }

  async submitDiagnosticVie(userId: string, diagnosticData: Record<string, any>) {
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

  async submitDiagnosticPro(userId: string, diagnosticData: Record<string, any>) {
    const { data, error } = await this.supabase
      .from('user_profiles')
      .update({
        diagnostic_pro_data: diagnosticData,
        diagnostic_pro_completed: true,
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
