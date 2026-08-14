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
      '&champs=appellations(emploireglemente,transitionecologiquedetaillee,libelle,secondaire,code,emploicadre,transitionecologique,transitionnumerique,transitiondemographique,classification,romeparent,libellecourt)' +
      '&champs=emploireglemente&champs=emploicadre&champs=riasecmajeur&champs=riasecmineur' +
      '&champs=codeisco&champs=formacodes(libelle,code)&champs=label' +
      '&champs=transitiondemographique&champs=transitionecologique&champs=transitionecologiquedetaillee&champs=transitionnumerique',
    primaryKey: 'code',
  },
  {
    table: 'rome_competences',
    scope: 'api_rome-competencesv1 nomenclatureRome',
    url: 'https://api.francetravail.io/partenaire/rome-competences/v1/competences/competence',
    params:
      'champs=@competencedetaillee(riasecmineur,macrocompetence(libelle,transferable,@macrosavoiretreprofessionnel(qualiteprofessionnelle),souscategorie,code,riasecmineur,codearborescence,objectif(libelle,enjeu(libelle,code,codearborescence,domainecompetence(libelle,code,codearborescence)),code,codearborescence),codeogr,maturite,riasecmajeur),riasecmajeur)' +
      '&champs=@macrocompetence(transferable,@macrosavoiretreprofessionnel(qualiteprofessionnelle),souscategorie,riasecmineur,codearborescence,objectif(libelle,enjeu(libelle,code,codearborescence,domainecompetence(libelle,code,codearborescence)),code,codearborescence),maturite,riasecmajeur)' +
      '&champs=@savoir(categoriesavoir(libelle,categorie(libelle,code),code))' +
      '&champs=codeogr&champs=code&champs=competenceesco(libelle,uri)&champs=datefin&champs=libelle&champs=obsolete&champs=transitionecologique&champs=transitionnumerique',
    primaryKey: 'code',
  },
  {
    table: 'rome_fiches_metiers',
    scope: 'api_rome-fiches-metiersv1 nomenclatureRome',
    url: 'https://api.francetravail.io/partenaire/rome-fiches-metiers/v1/fiches-rome/fiche-metier',
    params:
      'champs=groupescompetencesmobilisees(competences(libelle,code),enjeu(libelle,code))' +
      '&champs=code' +
      '&champs=groupessavoirs(savoirs(libelle,code),categoriesavoirs(libelle,code))' +
      '&champs=metier(libelle,code)',
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

  /**
   * Build a complete fiche métier by combining all ROME tables.
   */
  async getFullFicheMetier(codeRome: string) {
    // Fetch métier (DB) + fiche (DB) + full métier from API (for contextesTravail) in parallel
    const [metierResult, ficheResult, apiMetier] = await Promise.all([
      this.supabase
        .from('rome_metiers')
        .select('data')
        .eq('code', codeRome)
        .single(),
      this.supabase
        .from('rome_fiches_metiers')
        .select('data')
        .eq('code', codeRome)
        .single(),
      this.fetchMetierFromApi(codeRome),
    ]);

    if (metierResult.error || !metierResult.data) {
      throw new Error(`Métier ${codeRome} not found`);
    }

    const metier = metierResult.data.data;
    const fiche = ficheResult.data?.data;

    // Extract competence codes from fiche to enrich with full details
    const compCodes: string[] = [];
    const competencesParEnjeu: {
      enjeu: string;
      competences: { code: string; libelle: string; type: string }[];
    }[] = [];

    if (fiche?.groupesCompetencesMobilisees) {
      for (const group of fiche.groupesCompetencesMobilisees) {
        const enjeuLabel = group.enjeu?.libelle || 'Autre';
        const comps = (group.competences || []).map(
          (c: { code: string; libelle: string; type?: string }) => {
            compCodes.push(c.code);
            return {
              code: c.code,
              libelle: c.libelle,
              type: c.type || 'COMPETENCE-DETAILLEE',
            };
          },
        );
        competencesParEnjeu.push({ enjeu: enjeuLabel, competences: comps });
      }
    }

    // Fetch full competence details for transferability info
    let transferableSkills: string[] = [];
    if (compCodes.length > 0) {
      const { data: compDetails } = await this.supabase
        .from('rome_competences')
        .select('data')
        .in('code', compCodes);

      if (compDetails) {
        transferableSkills = compDetails
          .filter((c) => c.data.macroCompetence?.transferable === true)
          .map((c) => c.data.libelle as string);
      }
    }

    // Build savoirs
    const savoirsParCategorie: {
      categorie: string;
      savoirs: string[];
    }[] = [];

    if (fiche?.groupesSavoirs) {
      for (const group of fiche.groupesSavoirs) {
        savoirsParCategorie.push({
          categorie: group.categorieSavoirs?.libelle || 'Autre',
          savoirs: (group.savoirs || []).map(
            (s: { libelle: string }) => s.libelle,
          ),
        });
      }
    }

    return {
      // Identity
      code: metier.code,
      titre: metier.libelle,
      definition: metier.definition || 'N/A',

      // Classification
      domaine: metier.domaineProfessionnel?.libelle || 'N/A',
      grandDomaine: metier.domaineProfessionnel?.grandDomaine?.libelle || 'N/A',
      riasec: {
        majeur: metier.riasecMajeur || 'N/A',
        mineur: metier.riasecMineur || 'N/A',
      },
      emploiCadre: metier.emploiCadre ?? false,
      transitionEcologique: metier.transitionEcologique ?? false,

      // Access
      accesEmploi: metier.accesEmploi || 'N/A',
      formacodes: (metier.formacodes || []).map(
        (f: { code: string; libelle: string }) => f.libelle,
      ),

      // Job title variants
      appellations: (metier.appellations || []).map(
        (a: { libelle: string; classification: string }) => ({
          titre: a.libelle,
          type: a.classification || 'PRINCIPALE',
        }),
      ),

      // Competences (from fiche)
      competencesParEnjeu,
      transferableSkills,

      // Knowledge (from fiche)
      savoirsParCategorie,

      // Data we don't have yet — N/A placeholders
      salaire: {
        min: 'N/A',
        median: 'N/A',
        max: 'N/A',
        source: 'N/A',
      },
      tensionMarche: {
        offres: 'N/A',
        demandeurs: 'N/A',
        indicateur: 'N/A',
      },
      formations: 'N/A',
      evolutionsPossibles: 'N/A',
      conditionsTravail: this.buildConditionsTravail(
        apiMetier?.contextesTravail || [],
      ),
    };
  }

  /**
   * Fetch a single métier from France Travail API (no champs filter)
   * to get fields like contextesTravail that aren't available via champs.
   */
  private async fetchMetierFromApi(
    codeRome: string,
  ): Promise<Record<string, any> | null> {
    try {
      const token = await this.getToken(
        'api_rome-metiersv1 nomenclatureRome',
      );
      const res = await fetch(
        `https://api.francetravail.io/partenaire/rome-metiers/v1/metiers/metier/${codeRome}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      this.logger.warn(`Failed to fetch métier ${codeRome} from API: ${e}`);
      return null;
    }
  }

  private buildConditionsTravail(
    contextes: { code: string; libelle: string; categorie: string }[],
  ): Record<string, string[]> | 'N/A' {
    if (!contextes.length) return 'N/A';

    const grouped: Record<string, string[]> = {};
    const categoryLabels: Record<string, string> = {
      CONDITIONS_TRAVAIL: 'Conditions de travail',
      HORAIRE_ET_DUREE_TRAVAIL: 'Horaires et durée',
      LIEU_ET_DEPLACEMENT: 'Lieu et déplacements',
      STATUT_EMPLOI: "Statut d'emploi",
      TYPE_BENEFICIAIRE: 'Public accompagné',
      TYPE_STRUCTURE_ACCUEIL: "Structures d'exercice",
    };

    for (const ctx of contextes) {
      const label = categoryLabels[ctx.categorie] || ctx.categorie;
      if (!grouped[label]) grouped[label] = [];
      grouped[label].push(ctx.libelle);
    }

    return grouped;
  }

  async getContextesTravail() {
    const { data, error } = await this.supabase
      .from('rome_contextes_travail')
      .select('code, data');

    if (error) throw new Error(error.message);
    return data.map((row) => row.data);
  }

  // ──────────────────────────────────────────────
  // IMT — Marché du travail (stats-offres-demandes-emploi)
  // ──────────────────────────────────────────────

  private readonly IMT_BASE =
    'https://api.francetravail.io/partenaire/stats-offres-demandes-emploi/v1';
  private readonly IMT_SCOPE =
    'api_stats-offres-demandes-emploiv1 offresetdemandesemploi';

  async getSalaires(
    codeRome: string,
    codeTypeTerritoire = 'NAT',
    codeTerritoire = 'FR',
  ) {
    const token = await this.getToken(this.IMT_SCOPE);
    const url = `${this.IMT_BASE}/indicateur/salaire-rome-fap/${codeTypeTerritoire}/${codeTerritoire}?codeRome=${codeRome}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      this.logger.warn(`getSalaires failed: ${res.status}`);
      return null;
    }
    return res.json();
  }

  async getStatOffres(
    codeRome: string,
    codeTypeTerritoire = 'NAT',
    codeTerritoire = 'FR',
  ) {
    const token = await this.getToken(this.IMT_SCOPE);
    const res = await fetch(`${this.IMT_BASE}/indicateur/stat-offres`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        codeTypeTerritoire,
        codeTerritoire,
        codeTypeActivite: 'ROME',
        codeActivite: codeRome,
        codeTypePeriode: 'TRIMESTRE',
        codeTypeNomenclature: 'ORIGINEOFF',
      }),
    });
    if (!res.ok) {
      this.logger.warn(`getStatOffres failed: ${res.status}`);
      return null;
    }
    return res.json();
  }

  async getPerspectivesRecrutement(
    codeRome: string,
    codeTypeTerritoire = 'NAT',
    codeTerritoire = 'FR',
  ) {
    const token = await this.getToken(this.IMT_SCOPE);
    const res = await fetch(
      `${this.IMT_BASE}/indicateur/stat-perspective-employeur`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          codeTypeTerritoire,
          codeTerritoire,
          codeTypeActivite: 'ROME',
          codeActivite: codeRome,
          codeTypePeriode: 'ANNEE',
          codeTypeNomenclature: 'TYPE_TENSION',
        }),
      },
    );
    if (!res.ok) {
      this.logger.warn(`getPerspectivesRecrutement failed: ${res.status}`);
      return null;
    }
    return res.json();
  }

  async getDynamiqueEmploi(
    codeTypeTerritoire = 'NAT',
    codeTerritoire = 'FR',
  ) {
    const token = await this.getToken(this.IMT_SCOPE);
    const res = await fetch(
      `${this.IMT_BASE}/indicateur/stat-dynamique-emploi`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          codeTypeTerritoire,
          codeTerritoire,
          codeTypeActivite: 'MOYENNE',
          codeActivite: 'MOYENNE',
          codeTypePeriode: 'TRIMESTRE',
        }),
      },
    );
    if (!res.ok) {
      this.logger.warn(`getDynamiqueEmploi failed: ${res.status}`);
      return null;
    }
    return res.json();
  }

  // ──────────────────────────────────────────────
  // La Bonne Boîte v2
  // ──────────────────────────────────────────────

  private readonly LBB_BASE =
    'https://api.francetravail.io/partenaire/labonneboite/v2';
  private readonly LBB_SCOPE = 'api_labonneboitev2 search office';

  async searchEntreprises(
    codeRome: string,
    latitude: number,
    longitude: number,
    distance = 30,
    pageSize = 10,
  ) {
    const token = await this.getToken(this.LBB_SCOPE);
    const params = new URLSearchParams({
      rome: codeRome,
      latitude: String(latitude),
      longitude: String(longitude),
      distance: String(distance),
      page_size: String(pageSize),
      sort_by: 'hiring_potential',
      sort_direction: 'desc',
    });
    const res = await fetch(`${this.LBB_BASE}/recherche?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      this.logger.warn(`searchEntreprises failed: ${res.status}`);
      return null;
    }
    return res.json();
  }

  async getNombreEntreprises(
    codeRome: string,
    latitude: number,
    longitude: number,
    distance = 30,
  ) {
    const token = await this.getToken(this.LBB_SCOPE);
    const params = new URLSearchParams({
      rome: codeRome,
      latitude: String(latitude),
      longitude: String(longitude),
      distance: String(distance),
    });
    const res = await fetch(`${this.LBB_BASE}/nombreEntreprise?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      this.logger.warn(`getNombreEntreprises failed: ${res.status}`);
      return null;
    }
    return res.json();
  }

  /**
   * Build a complete premium rapport d'employabilité.
   * Fetches all data sources in parallel for a given ROME + location.
   */
  async getRapportEmployabilite(
    codeRome: string,
    latitude?: number,
    longitude?: number,
    codeTypeTerritoire = 'NAT',
    codeTerritoire = 'FR',
  ) {
    const [salaires, offres, perspectives, dynamique, entreprises] =
      await Promise.all([
        this.getSalaires(codeRome, codeTypeTerritoire, codeTerritoire),
        this.getStatOffres(codeRome, codeTypeTerritoire, codeTerritoire),
        this.getPerspectivesRecrutement(
          codeRome,
          codeTypeTerritoire,
          codeTerritoire,
        ),
        this.getDynamiqueEmploi(codeTypeTerritoire, codeTerritoire),
        latitude && longitude
          ? this.searchEntreprises(codeRome, latitude, longitude)
          : Promise.resolve(null),
      ]);

    // Extract key salary figures
    const salaryData = this.extractSalaires(salaires);

    // Extract latest quarter offers
    const offresData = this.extractOffres(offres);

    // Extract tension/perspective indicators
    const tensionData = this.extractPerspectives(perspectives);

    // Extract employment dynamics
    const dynamiqueData = this.extractDynamique(dynamique);

    // Extract top companies
    const entreprisesData = this.extractEntreprises(entreprises);

    return {
      codeRome,
      salaires: salaryData,
      offres: offresData,
      tension: tensionData,
      dynamiqueEmploi: dynamiqueData,
      entreprises: entreprisesData,
    };
  }

  private extractSalaires(raw: any) {
    if (!raw?.valeursParPeriode?.length) {
      return { debutant: null, moyen: null, experimente: null, annee: null };
    }
    const latest = raw.valeursParPeriode[raw.valeursParPeriode.length - 1];
    const vals = latest.salaireValeurMontant || [];
    const byCode: Record<string, number> = {};
    for (const v of vals) {
      byCode[v.codeNomenclature] = v.valeurPrincipaleMontant;
    }
    return {
      debutant: byCode['SAL1'] ?? null,
      moyen: byCode['SAL3'] ?? null,
      experimente: byCode['SAL2'] ?? null,
      annee: latest.codePeriode ?? null,
      libActivite: latest.libActivite ?? null,
    };
  }

  private extractOffres(raw: any) {
    if (!raw?.listeValeursParPeriode?.length) {
      return { total: null, periode: null, contrats: [] };
    }
    // Get latest period
    const sorted = [...raw.listeValeursParPeriode].sort((a: any, b: any) =>
      (b.codePeriode || '').localeCompare(a.codePeriode || ''),
    );
    const latest = sorted[0];
    const contrats = (latest.listeValeurParCaract || [])
      .filter((c: any) => c.codeTypeCaract === 'TYPECTR')
      .map((c: any) => ({
        type: c.libCaract,
        nombre: c.nombre,
        pourcentage: c.pourcentage,
      }));
    return {
      total: latest.valeurPrincipaleNombre ?? null,
      periode: latest.libPeriode ?? null,
      contrats,
    };
  }

  private extractPerspectives(raw: any) {
    if (!raw?.listeValeursParPeriode?.length) {
      return { indicateurs: [], annee: null };
    }
    // Get the latest year only
    const allPeriods = raw.listeValeursParPeriode as any[];
    const latestYear = allPeriods.reduce(
      (max: string, v: any) =>
        (v.codePeriode || '') > max ? v.codePeriode : max,
      '',
    );
    const latestOnly = allPeriods.filter(
      (v: any) => v.codePeriode === latestYear,
    );
    const indicateurs = latestOnly.map((v: any) => ({
      code: v.codeNomenclature,
      libelle: v.libNomenclature,
      valeur: v.valeurPrincipaleDecimale ?? null,
      niveau: v.valeurPrincipaleNombre ?? null,
    }));
    return {
      indicateurs,
      annee: latestYear,
    };
  }

  private extractDynamique(raw: any) {
    if (!raw?.listeValeursParPeriode?.length) {
      return { indicateur: null, periode: null };
    }
    const sorted = [...raw.listeValeursParPeriode].sort((a: any, b: any) =>
      (b.codePeriode || '').localeCompare(a.codePeriode || ''),
    );
    const latest = sorted[0];
    return {
      indicateur: latest.valeurPrincipaleNombre ?? null,
      libelle: latest.libNomenclature ?? null,
      periode: latest.libPeriode ?? null,
    };
  }

  private extractEntreprises(raw: any) {
    if (!raw?.items?.length) {
      return { total: 0, top: [] };
    }
    return {
      total: raw.hits ?? 0,
      top: raw.items.slice(0, 5).map((e: any) => ({
        nom: e.company_name,
        ville: e.city,
        departement: e.department,
        potentiel: Math.round(e.hiring_potential),
        naf: e.naf_label,
        taille: `${e.headcount_min}-${e.headcount_max}`,
      })),
    };
  }
}
