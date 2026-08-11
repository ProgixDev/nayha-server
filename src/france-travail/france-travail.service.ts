import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

const ROME_APIS = [
  {
    table: 'rome_metiers',
    scope: 'api_rome-metiersv1 nomenclatureRome',
    url: 'https://api.francetravail.io/partenaire/rome-metiers/v1/metiers/metier',
    params:
      'champs=code&champs=libelle&champs=definition&champs=accesemploi' +
      '&champs=domaineprofessionnel(libelle,code,granddomaine(libelle,code))' +
      '&champs=appellations(libelle,code)' +
      '&champs=emploireglemente&champs=emploicadre&champs=riasecmajeur&champs=riasecmineur',
    primaryKey: 'code',
  },
  {
    table: 'rome_competences',
    scope: 'api_rome-competencesv1 nomenclatureRome',
    url: 'https://api.francetravail.io/partenaire/rome-competences/v1/competences/competence',
    params: '',
    primaryKey: 'code',
  },
  {
    table: 'rome_fiches_metiers',
    scope: 'api_rome-fiches-metiersv1 nomenclatureRome',
    url: 'https://api.francetravail.io/partenaire/rome-fiches-metiers/v1/fiches-rome/fiche-metier',
    params: '',
    primaryKey: 'code',
  },
  {
    table: 'rome_contextes_travail',
    scope: 'api_rome-contextes-travailv1 nomenclatureRome',
    url: 'https://api.francetravail.io/partenaire/rome-contextes-travail/v1/situations-travail/contexte-travail',
    params: '',
    primaryKey: 'code',
  },
];

@Injectable()
export class FranceTravailService {
  private readonly logger = new Logger(FranceTravailService.name);
  private supabase: SupabaseClient;
  private tokenCache = new Map<string, TokenCache>();

  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(private configService: ConfigService) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
    this.clientId = this.configService.get<string>('FT_CLIENT_ID')!;
    this.clientSecret = this.configService.get<string>('FT_CLIENT_SECRET')!;
  }

  /**
   * Get an OAuth2 token for France Travail API.
   * Caches tokens in memory (valid 25 min).
   */
  async getToken(scope: string): Promise<string> {
    const cached = this.tokenCache.get(scope);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.accessToken;
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope,
    });

    const res = await fetch(
      'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      },
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`France Travail auth failed: ${err}`);
    }

    const data = await res.json();
    this.tokenCache.set(scope, {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000, // refresh 1 min early
    });

    return data.access_token;
  }

  /**
   * Sync all ROME 4.0 data into Supabase tables.
   */
  async syncAll(): Promise<Record<string, number>> {
    const results: Record<string, number> = {};

    for (const api of ROME_APIS) {
      this.logger.log(`Syncing ${api.table}...`);
      const count = await this.syncOne(api);
      results[api.table] = count;
      this.logger.log(`${api.table}: ${count} rows synced`);
    }

    return results;
  }

  private async syncOne(api: (typeof ROME_APIS)[number]): Promise<number> {
    const token = await this.getToken(api.scope);
    const url = api.params ? `${api.url}?${api.params}` : api.url;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to fetch ${api.table}: ${err}`);
    }

    const items: Record<string, any>[] = await res.json();

    // Upsert in batches of 500
    const batchSize = 500;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize).map((item) => ({
        code: item[api.primaryKey],
        data: item,
        synced_at: new Date().toISOString(),
      }));

      const { error } = await this.supabase
        .from(api.table)
        .upsert(batch, { onConflict: 'code' });

      if (error) {
        throw new Error(`Supabase upsert ${api.table} failed: ${error.message}`);
      }
    }

    return items.length;
  }

  /**
   * Query local ROME data from Supabase.
   */
  async getMetiers() {
    const { data, error } = await this.supabase
      .from('rome_metiers')
      .select('code, data');

    if (error) throw new Error(error.message);
    return data.map((row) => row.data);
  }

  async getMetier(codeRome: string) {
    const { data, error } = await this.supabase
      .from('rome_metiers')
      .select('data')
      .eq('code', codeRome)
      .single();

    if (error) throw new Error(`Metier ${codeRome} not found`);
    return data.data;
  }

  async searchMetiers(query: string) {
    const { data, error } = await this.supabase
      .from('rome_metiers')
      .select('code, data')
      .ilike('data->>libelle', `%${query}%`)
      .limit(20);

    if (error) throw new Error(error.message);
    return data.map((row) => row.data);
  }

  async getCompetences() {
    const { data, error } = await this.supabase
      .from('rome_competences')
      .select('code, data');

    if (error) throw new Error(error.message);
    return data.map((row) => row.data);
  }

  async getFicheMetier(codeRome: string) {
    const { data, error } = await this.supabase
      .from('rome_fiches_metiers')
      .select('data')
      .eq('code', codeRome)
      .single();

    if (error) throw new Error(`Fiche ${codeRome} not found`);
    return data.data;
  }

  async getContextesTravail() {
    const { data, error } = await this.supabase
      .from('rome_contextes_travail')
      .select('code, data');

    if (error) throw new Error(error.message);
    return data.map((row) => row.data);
  }
}
