import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createInterface } from 'readline';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { ReadableStream as NodeReadableStream } from 'stream/web';

type Source = 'mcf' | 'apprentissage';
type Trigger = 'cron' | 'admin';

/** Row of public.training_offers (see PLAN_FORMATIONS.md). */
interface TrainingOffer {
  id: string;
  source: Source;
  source_id: string;
  title: string;
  provider_name: string | null;
  siret: string | null;
  siren: string | null;
  code_rncp: string | null;
  code_rs: string | null;
  certification_title: string | null;
  level: string | null;
  code_romes: string[];
  department: string | null;
  department_code: string | null;
  region: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  location_precise: boolean;
  /**
   * training_site: training place given by the source; provider_site: the
   * provider's only open site in the department; department: only that.
   */
  location_type: 'training_site' | 'provider_site' | 'department';
  remote: boolean;
  active_sessions: number;
  next_session_at: string | null;
  price_min: number | null;
  price_max: number | null;
  hours_min: number | null;
  hours_max: number | null;
  cpf_eligible: boolean;
  apprentissage: boolean;
  qualiopi: boolean | null;
  /** true when qualiopi comes from a check (register or source). */
  qualiopi_verified: boolean;
  certification_active: boolean | null;
  certification_status: CertificationStatus['status'];
  registration_end: string | null;
  delivery_until: string | null;
  /** Main training topic (formacode) of a Mon Compte Formation offer. */
  formacode_main: string | null;
  dedupe_key: string | null;
  last_seen_at: string;
  updated_at: string;
}

/** The parts of an API Apprentissage offer the import reads. */
interface ApprentissageAddress {
  commune?: { nom?: string };
  departement?: { nom?: string; code_insee?: string };
  region?: { nom?: string };
}

interface ApprentissageOrganisme {
  etablissement?: {
    siret?: string;
    ouvert?: boolean;
    enseigne?: string | null;
    adresse?: ApprentissageAddress;
    geopoint?: { coordinates?: [number, number] };
  };
  unite_legale?: {
    siren?: string;
    actif?: boolean;
    raison_sociale?: string;
  };
  renseignements_specifiques?: { qualiopi?: boolean };
}

interface ApprentissageCertification {
  identifiant?: { rncp?: string | null };
  intitule?: {
    rncp?: string | null;
    cfd?: { long?: string | null } | null;
    niveau?: { rncp?: { europeen?: string | null } | null } | null;
  };
  domaines?: { rome?: { rncp?: { code?: string }[] | null } | null };
  periode_validite?: { rncp?: { actif?: boolean } | null };
}

interface ApprentissageItem {
  identifiant?: { cle_ministere_educatif?: string };
  formateur?: { organisme?: ApprentissageOrganisme };
  certification?: { valeur?: ApprentissageCertification };
  lieu?: {
    adresse?: ApprentissageAddress;
    geolocalisation?: { coordinates?: [number, number] };
  };
  modalite?: { entierement_a_distance?: boolean };
  sessions?: { debut?: string; fin?: string }[];
}

interface KoumoulLines {
  results?: {
    NUMERO_FICHE?: string;
    ACTIF?: boolean;
    date_fin_enregistrement?: string | null;
    date_limite_delivrance?: string | null;
  }[];
  next?: string;
}

interface RncpRegistration {
  actif: boolean | null;
  /** End of registration in the RNCP (YYYY-MM-DD). */
  end: string | null;
  /** Last day the certification can be awarded (YYYY-MM-DD). */
  until: string | null;
}

interface CertificationStatus {
  status: 'active' | 'deliverable' | 'to_verify' | 'expired' | null;
  registration_end: string | null;
  delivery_until: string | null;
}

interface SyncResult {
  imported: number;
  skipped: number;
  removed: number;
}

const MCF_EXPORT_URL =
  'https://opendata.caissedesdepots.fr/api/explore/v2.1/catalog/datasets/moncompteformation_catalogueformation/exports/jsonl';
const MCF_FIELDS = [
  'numero_formation',
  'intitule_formation',
  'nom_of',
  'siret',
  'type_referentiel',
  'code_inventaire',
  'code_rncp',
  'intitule_certification',
  'libelle_niveau_sortie_formation',
  'code_rome_1',
  'code_rome_2',
  'code_rome_3',
  'code_rome_4',
  'code_rome_5',
  'nom_departement',
  'code_departement',
  'nom_region',
  'nb_session_active',
  'nb_session_a_distance',
  'frais_ttc_tot_min',
  'frais_ttc_tot_max',
  'nombre_heures_total_min',
  'nombre_heures_total_max',
  'code_formacode_1',
];
const APPRENTISSAGE_URL =
  'https://api.apprentissage.beta.gouv.fr/api/formation/v1/search';
const APPRENTISSAGE_PAGE_SIZE = 1000;
const BATCH_SIZE = 500;
/** Batches saved at the same time. */
const PARALLEL_SAVES = 2;
/**
 * Offers missing from an import are removed only if the import brought at
 * least this share of what is already stored: a source failing half-way
 * must not wipe the catalogue.
 */
const MIN_SHARE_TO_PRUNE = 0.5;
const ENTREPRISES_URL = 'https://recherche-entreprises.api.gouv.fr/search';
/**
 * Provider sites looked up per import. The register allows 7 calls per
 * second (it refuses bursts): 3000 lookups at 3 per second take about
 * 17 minutes. The first run is larger and
 * is done once by hand (see locateProviders).
 */
const SITES_PER_RUN = 3000;
const SITE_LOOKUPS_PER_SECOND = 3;
/** Providers whose Qualiopi certification is checked per import. */
const PROVIDERS_PER_RUN = 2000;

interface CertificationCodes {
  /** RNCP code → registration, from France Compétences. */
  rncp: Map<string, RncpRegistration>;
  /** RS codes listed in CertifInfo. */
  rs: Set<string>;
}

const RNCP_REGISTER_URL =
  'https://opendata.koumoul.com/data-fair/api/v1/datasets/competences-rncp/lines';

interface ProviderSite {
  siren: string;
  department_code: string;
  status: 'site' | 'ambiguous' | 'not_found';
  siret: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  checked_at: string;
}

/**
 * Nightly copy of the training offers into public.training_offers:
 * Mon Compte Formation (CPF offers with an active session) and API
 * Apprentissage (work-study offers). Each run upserts what the source
 * returns and removes what disappeared from it.
 */
@Injectable()
export class TrainingOffersService {
  private readonly logger = new Logger(TrainingOffersService.name);
  private readonly supabase: SupabaseClient;
  private readonly apprentissageApiKey?: string;
  private readonly cronSecret?: string;
  private running = false;

  constructor(configService: ConfigService) {
    this.supabase = createClient(
      configService.get<string>('SUPABASE_URL')!,
      configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
    this.apprentissageApiKey = configService.get<string>(
      'APPRENTISSAGE_API_KEY',
    );
    this.cronSecret = configService.get<string>('TRAINING_SYNC_SECRET');
  }

  /** Checks the secret sent by the nightly job (constant-time compare). */
  assertCronSecret(provided: string | undefined) {
    const expected = this.cronSecret;
    const ok =
      !!expected &&
      !!provided &&
      provided.length === expected.length &&
      timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    if (!ok) throw new UnauthorizedException();
  }

  /**
   * Starts an import of both sources in the background and returns at
   * once: a full import takes a few minutes.
   */
  startSync(trigger: Trigger) {
    if (this.running) {
      throw new ConflictException('Une synchronisation est déjà en cours.');
    }
    this.running = true;
    void (async () => {
      try {
        await this.runSource('mcf', trigger);
        await this.runSource('apprentissage', trigger);
      } finally {
        this.running = false;
      }
    })();
    return { started: true };
  }

  /** Latest runs and how many offers each source currently has. */
  async status() {
    const { data: runs, error } = await this.supabase
      .from('training_sync_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(10);
    if (error) {
      throw new InternalServerErrorException(
        'Le statut des formations n’a pas pu être chargé.',
      );
    }
    const counts: Record<Source, number> = { mcf: 0, apprentissage: 0 };
    for (const source of ['mcf', 'apprentissage'] as const) {
      counts[source] = await this.countOffers(source);
    }
    return { running: this.running, counts, runs: runs ?? [] };
  }

  private async runSource(source: Source, trigger: Trigger) {
    const startedAt = new Date().toISOString();
    const { data: run } = await this.supabase
      .from('training_sync_runs')
      .insert({ source, trigger, started_at: startedAt })
      .select('id')
      .single<{ id: string }>();

    try {
      const result =
        source === 'mcf'
          ? await this.syncMcf(startedAt)
          : await this.syncApprentissage(startedAt);
      this.logger.log(
        `Training offers ${source}: ${result.imported} imported, ${result.skipped} skipped, ${result.removed} removed`,
      );
      if (run) {
        await this.supabase
          .from('training_sync_runs')
          .update({
            status: 'succeeded',
            ...result,
            finished_at: new Date().toISOString(),
          })
          .eq('id', run.id);
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      this.logger.error(`Training offers ${source} import failed: ${message}`);
      if (run) {
        await this.supabase
          .from('training_sync_runs')
          .update({
            status: 'failed',
            error: message.slice(0, 1000),
            finished_at: new Date().toISOString(),
          })
          .eq('id', run.id);
      }
    }
  }

  // ── Mon Compte Formation ──────────────────────────────────────────────────

  private async syncMcf(runStartedAt: string): Promise<SyncResult> {
    const certifications = await this.certificationCodes();
    const sites = await this.knownSites();
    const providers = await this.knownProviders();
    const params = new URLSearchParams({
      select: MCF_FIELDS.join(','),
      where: 'nb_session_active>0',
    });
    // Download the whole export first, then read it: reading it while
    // saving is too slow for the source, which closes the connection.
    const file = join(tmpdir(), `mcf-${Date.now()}.jsonl`);
    await withRetry('Mon Compte Formation export', async () => {
      const response = await fetch(`${MCF_EXPORT_URL}?${params.toString()}`);
      if (!response.ok || !response.body) {
        throw new Error(
          `Mon Compte Formation export failed (${response.status})`,
        );
      }
      await pipeline(
        Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>),
        createWriteStream(file),
      );
    });

    let imported = 0;
    let skipped = 0;
    let batch: TrainingOffer[] = [];
    let saving: Promise<number>[] = [];
    const flush = async (force: boolean) => {
      if (batch.length) saving.push(this.upsert(batch));
      batch = [];
      if (saving.length >= PARALLEL_SAVES || force) {
        for (const count of await Promise.all(saving)) imported += count;
        saving = [];
      }
    };

    try {
      const lines = createInterface({
        input: createReadStream(file),
        crlfDelay: Infinity,
      });
      for await (const line of lines) {
        if (!line.trim()) continue;
        let row: Record<string, unknown>;
        try {
          row = JSON.parse(line) as Record<string, unknown>;
        } catch {
          skipped++;
          continue;
        }
        const offer = this.fromMcf(
          row,
          certifications,
          sites,
          providers,
          runStartedAt,
        );
        if (!offer) {
          skipped++;
          continue;
        }
        batch.push(offer);
        if (batch.length >= BATCH_SIZE) await flush(false);
      }
      await flush(true);
    } finally {
      await unlink(file).catch(() => undefined);
    }

    const removed = await this.pruneStale('mcf', runStartedAt, imported);
    // A failed lookup only leaves some offers "in the department".
    await this.locateProviders(SITES_PER_RUN).catch((cause: unknown) => {
      const message = cause instanceof Error ? cause.message : String(cause);
      this.logger.warn(`Training provider sites lookup failed: ${message}`);
    });
    // A failed check only leaves Qualiopi unknown for some providers.
    await this.checkProvidersQualiopi(PROVIDERS_PER_RUN).catch(
      (cause: unknown) => {
        const message = cause instanceof Error ? cause.message : String(cause);
        this.logger.warn(
          `Training providers Qualiopi check failed: ${message}`,
        );
      },
    );
    return { imported, skipped, removed };
  }

  private fromMcf(
    row: Record<string, unknown>,
    certifications: CertificationCodes,
    sites: Map<string, ProviderSite>,
    providers: Map<string, boolean>,
    seenAt: string,
  ): TrainingOffer | null {
    const numero = text(row.numero_formation);
    const title = text(row.intitule_formation);
    if (!numero || !title) return null;
    // The export has one row per department where the offer is given.
    const sourceId = `${numero}:${text(row.code_departement) ?? 'na'}`;

    const siret = digits(row.siret);
    const rncpRaw = text(row.code_rncp);
    const codeRncp = rncpRaw && rncpRaw !== '-1' ? rncpRaw : null;
    const codeRs =
      text(row.type_referentiel) === 'RS' ? text(row.code_inventaire) : null;
    const romes = [1, 2, 3, 4, 5]
      .map((i) => text(row[`code_rome_${i}`]))
      .filter((code): code is string => !!code);
    const siren = siret ? siret.slice(0, 9) : null;
    const departmentCode = text(row.code_departement);
    const site =
      siren && departmentCode
        ? sites.get(`${siren}:${departmentCode}`)
        : undefined;

    return {
      id: `mcf:${sourceId}`,
      source: 'mcf',
      source_id: sourceId,
      title,
      provider_name: text(row.nom_of),
      siret,
      siren: siret ? siret.slice(0, 9) : null,
      code_rncp: codeRncp,
      code_rs: codeRs,
      certification_title: text(row.intitule_certification),
      level: text(row.libelle_niveau_sortie_formation),
      code_romes: [...new Set(romes)],
      department: text(row.nom_departement),
      department_code: text(row.code_departement),
      region: text(row.nom_region),
      city: site?.city ?? null,
      lat: site?.lat ?? null,
      lng: site?.lng ?? null,
      location_precise: !!site,
      location_type: site ? 'provider_site' : 'department',
      remote: (num(row.nb_session_a_distance) ?? 0) > 0,
      active_sessions: num(row.nb_session_active) ?? 0,
      next_session_at: null,
      price_min: num(row.frais_ttc_tot_min),
      price_max: num(row.frais_ttc_tot_max),
      hours_min: num(row.nombre_heures_total_min),
      hours_max: num(row.nombre_heures_total_max),
      // Listed on Mon Compte Formation with an open session: CPF offer.
      cpf_eligible: true,
      apprentissage: false,
      // Only what the company register says; unknown until it is checked.
      qualiopi: (siren ? providers.get(siren) : undefined) ?? null,
      qualiopi_verified: !!siren && providers.has(siren),
      // RNCP: France Compétences dates. RS: listed in CertifInfo (no dates
      // published). A code found in neither stays unknown.
      ...withActive(
        codeRncp
          ? rncpStatus(certifications.rncp.get(codeRncp))
          : {
              status: codeRs && certifications.rs.has(codeRs) ? 'active' : null,
              registration_end: null,
              delivery_until: null,
            },
      ),
      formacode_main: text(row.code_formacode_1),
      dedupe_key: dedupeKey(siret, codeRncp, codeRs, title),
      last_seen_at: seenAt,
      updated_at: seenAt,
    };
  }

  // ── API Apprentissage ─────────────────────────────────────────────────────

  private async syncApprentissage(runStartedAt: string): Promise<SyncResult> {
    if (!this.apprentissageApiKey) {
      throw new Error('APPRENTISSAGE_API_KEY is not set');
    }
    const now = Date.now();
    const certifications = await this.certificationCodes();
    let imported = 0;
    let skipped = 0;
    let pageCount = 1;

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
      const params = new URLSearchParams({
        page_size: String(APPRENTISSAGE_PAGE_SIZE),
        page_index: String(pageIndex),
        include_archived: 'false',
      });
      const payload = await withRetry(
        `API Apprentissage page ${pageIndex}`,
        async () => {
          const response = await fetch(`${APPRENTISSAGE_URL}?${params}`, {
            headers: { Authorization: `Bearer ${this.apprentissageApiKey}` },
          });
          if (!response.ok) {
            throw new Error(
              `API Apprentissage page ${pageIndex} failed (${response.status})`,
            );
          }
          return (await response.json()) as {
            data?: ApprentissageItem[];
            pagination?: { page_count?: number };
          };
        },
      );
      pageCount = payload.pagination?.page_count ?? pageIndex + 1;

      const batch: TrainingOffer[] = [];
      for (const item of payload.data ?? []) {
        const offer = this.fromApprentissage(
          item,
          certifications,
          now,
          runStartedAt,
        );
        if (offer) batch.push(offer);
        else skipped++;
      }
      imported += await this.upsert(batch);
    }

    const removed = await this.pruneStale(
      'apprentissage',
      runStartedAt,
      imported,
    );
    return { imported, skipped, removed };
  }

  private fromApprentissage(
    item: ApprentissageItem,
    certifications: CertificationCodes,
    now: number,
    seenAt: string,
  ): TrainingOffer | null {
    const sourceId = text(item.identifiant?.cle_ministere_educatif);
    const organisme: ApprentissageOrganisme = item.formateur?.organisme ?? {};
    const etablissement = organisme.etablissement ?? {};
    const uniteLegale = organisme.unite_legale ?? {};
    // A closed site or a ceased company cannot welcome anyone.
    if (etablissement.ouvert === false || uniteLegale.actif === false) {
      return null;
    }
    const certification: ApprentissageCertification =
      item.certification?.valeur ?? {};
    const intitule = certification.intitule ?? {};
    const title = text(intitule.rncp) ?? text(intitule.cfd?.long);
    if (!sourceId || !title) return null;

    const siret = digits(etablissement.siret);
    const codeRncp =
      text(certification.identifiant?.rncp)?.replace(/^RNCP/i, '') ?? null;
    const romes = (certification.domaines?.rome?.rncp ?? [])
      .map((rome) => text(rome.code))
      .filter((code): code is string => !!code);

    const address: ApprentissageAddress =
      item.lieu?.adresse ?? etablissement.adresse ?? {};
    const coordinates =
      item.lieu?.geolocalisation?.coordinates ??
      etablissement.geopoint?.coordinates;

    const sessions = item.sessions ?? [];
    const openSessions = sessions.filter(
      (session) => !session.fin || Date.parse(session.fin) > now,
    );
    const nextStart = sessions
      .map((session) => session.debut)
      .filter((start): start is string => !!start && Date.parse(start) >= now)
      .sort()[0];

    return {
      id: `apprentissage:${sourceId}`,
      source: 'apprentissage',
      source_id: sourceId,
      title,
      provider_name:
        text(etablissement.enseigne) ?? text(uniteLegale.raison_sociale),
      siret,
      siren: text(uniteLegale.siren) ?? (siret ? siret.slice(0, 9) : null),
      code_rncp: codeRncp,
      code_rs: null,
      certification_title: text(intitule.rncp) ?? text(intitule.cfd?.long),
      level: text(intitule.niveau?.rncp?.europeen)
        ? `Niveau ${text(intitule.niveau?.rncp?.europeen)}`
        : null,
      code_romes: [...new Set(romes)],
      department: text(address.departement?.nom),
      department_code: text(address.departement?.code_insee),
      region: text(address.region?.nom),
      city: text(address.commune?.nom),
      lat: Array.isArray(coordinates) ? (num(coordinates[1]) ?? null) : null,
      lng: Array.isArray(coordinates) ? (num(coordinates[0]) ?? null) : null,
      location_precise: Array.isArray(coordinates),
      location_type: Array.isArray(item.lieu?.geolocalisation?.coordinates)
        ? 'training_site'
        : Array.isArray(coordinates)
          ? 'provider_site'
          : 'department',
      remote: item.modalite?.entierement_a_distance === true,
      active_sessions: openSessions.length,
      next_session_at: nextStart?.slice(0, 10) ?? null,
      price_min: null,
      price_max: null,
      hours_min: null,
      hours_max: null,
      cpf_eligible: false,
      apprentissage: true,
      qualiopi:
        typeof organisme.renseignements_specifiques?.qualiopi === 'boolean'
          ? organisme.renseignements_specifiques.qualiopi
          : null,
      qualiopi_verified:
        typeof organisme.renseignements_specifiques?.qualiopi === 'boolean',
      // France Compétences dates when the register has the code, otherwise
      // the catalogue's own flag (without dates: "inactive" stays to verify).
      ...withActive(
        codeRncp && certifications.rncp.has(codeRncp)
          ? rncpStatus(certifications.rncp.get(codeRncp))
          : {
              status:
                certification.periode_validite?.rncp?.actif === true
                  ? 'active'
                  : certification.periode_validite?.rncp?.actif === false
                    ? 'to_verify'
                    : null,
              registration_end: null,
              delivery_until: null,
            },
      ),
      formacode_main: null,
      dedupe_key: dedupeKey(
        siret ?? text(uniteLegale.siren),
        codeRncp,
        null,
        title,
      ),
      last_seen_at: seenAt,
      updated_at: seenAt,
    };
  }

  // ── Provider sites (where Mon Compte Formation offers take place) ─────────

  /** Sites already found, by "siren:department". */
  private async knownSites(): Promise<Map<string, ProviderSite>> {
    const sites = new Map<string, ProviderSite>();
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await this.supabase
        .from('training_provider_sites')
        .select('*')
        .eq('status', 'site')
        .range(from, from + pageSize - 1);
      if (error) {
        throw new Error(`Reading provider sites failed: ${error.message}`);
      }
      for (const site of (data ?? []) as ProviderSite[]) {
        sites.set(`${site.siren}:${site.department_code}`, site);
      }
      if (!data || data.length < pageSize) break;
    }
    return sites;
  }

  /**
   * Looks up, in the company register, the sites of providers in the
   * departments where they give offers, then copies the sites found onto
   * the offers. Returns how many pairs were looked up.
   */
  async locateProviders(limit: number): Promise<number> {
    let pending: ProviderSite[] = [];
    let looked = 0;
    let located = 0;
    // Saves the sites found, then copies them onto the offers.
    const save = async () => {
      if (!pending.length) return;
      const rows = pending;
      pending = [];
      await withRetry('Saving provider sites', async () => {
        const { error: saveError } = await this.supabase
          .from('training_provider_sites')
          .upsert(rows, { onConflict: 'siren,department_code' });
        if (saveError) throw new Error(saveError.message);
      });
      const found = rows.filter((row) => row.status === 'site');
      if (!found.length) return;
      const { data: updated, error: applyError } = await this.supabase.rpc(
        'apply_training_provider_sites',
        {
          p_sirens: found.map((row) => row.siren),
          p_departments: found.map((row) => row.department_code),
        },
      );
      if (applyError) {
        throw new Error(
          `Applying provider sites failed: ${applyError.message}`,
        );
      }
      located += Number(updated ?? 0);
    };

    // Supabase returns at most 1000 rows per call: take the pairs to look
    // up 1000 at a time; the ones done are saved, so the next call skips them.
    let stopped = false;
    while (!stopped && looked < limit) {
      const { data, error } = await this.supabase.rpc(
        'training_provider_sites_to_check',
        { p_limit: Math.min(1000, limit - looked) },
      );
      if (error) throw new Error(`Listing providers failed: ${error.message}`);
      const pairs = (data ?? []) as {
        siren: string;
        department_code: string;
        provider_name: string | null;
        sirets: string[] | null;
      }[];
      if (!pairs.length) break;

      // A few lookups at a time, at most SITE_LOOKUPS_PER_SECOND per second.
      for (let i = 0; i < pairs.length; i += SITE_LOOKUPS_PER_SECOND) {
        const started = Date.now();
        const found = await Promise.all(
          pairs
            .slice(i, i + SITE_LOOKUPS_PER_SECOND)
            .map((pair) => this.findProviderSite(pair)),
        );
        looked += found.length;
        for (const site of found) if (site) pending.push(site);
        if (pending.length >= 100) await save();
        if (found.some((site) => site === null)) {
          // The register keeps refusing: stop, the next run goes on.
          this.logger.warn(
            'Training provider sites: company register unavailable, stopping',
          );
          stopped = true;
          break;
        }
        const wait = 1000 - (Date.now() - started);
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      }
      await save();
    }

    this.logger.log(
      `Training provider sites: ${looked} looked up, ${located} offers located`,
    );
    return looked;
  }

  /**
   * The register is searched by name within the department (a search by
   * siren does not list sites), then only the provider's own open sites
   * are kept. One site, or the offer's own siret among several: located.
   * Returns null when the register could not be reached (tried next run).
   */
  private async findProviderSite(pair: {
    siren: string;
    department_code: string;
    provider_name: string | null;
    sirets: string[] | null;
  }): Promise<ProviderSite | null> {
    const checkedAt = new Date().toISOString();
    const result = (
      status: ProviderSite['status'],
      site?: {
        siret: string;
        libelle_commune?: string | null;
        latitude?: string | null;
        longitude?: string | null;
      },
    ): ProviderSite => ({
      siren: pair.siren,
      department_code: pair.department_code,
      status,
      siret: site?.siret ?? null,
      city: site?.libelle_commune
        ? site.libelle_commune
            .toLowerCase()
            .replace(/(^|[\s'-])\p{L}/gu, (letter) => letter.toUpperCase())
        : null,
      lat: num(site?.latitude),
      lng: num(site?.longitude),
      checked_at: checkedAt,
    });
    if (!pair.provider_name) return result('not_found');

    const params = new URLSearchParams({
      q: pair.provider_name,
      departement: pair.department_code,
      per_page: '25',
    });
    let payload: {
      results?: {
        siren?: string;
        matching_etablissements?: {
          siret: string;
          etat_administratif?: string;
          libelle_commune?: string | null;
          latitude?: string | null;
          longitude?: string | null;
        }[];
      }[];
    };
    try {
      payload = await withRetry(
        'Company register',
        async () => {
          const response = await fetch(`${ENTREPRISES_URL}?${params}`);
          if (response.status === 429 || response.status >= 500) {
            throw new Error(`Company register busy (${response.status})`);
          }
          if (!response.ok) return {};
          return (await response.json()) as typeof payload;
        },
        { tries: 4, delayMs: 20_000 },
      );
    } catch {
      return null;
    }

    const company = payload.results?.find((r) => r.siren === pair.siren);
    const open = (company?.matching_etablissements ?? []).filter(
      (site) =>
        site.etat_administratif === 'A' &&
        num(site.latitude) != null &&
        num(site.longitude) != null,
    );
    if (open.length === 1) return result('site', open[0]);
    const own = open.filter((site) => pair.sirets?.includes(site.siret));
    if (own.length === 1) return result('site', own[0]);
    return result(open.length > 1 ? 'ambiguous' : 'not_found');
  }

  // ── Providers' Qualiopi certification ─────────────────────────────────────

  /** Qualiopi results already known, by siren. */
  private async knownProviders(): Promise<Map<string, boolean>> {
    const providers = new Map<string, boolean>();
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await this.supabase
        .from('training_providers')
        .select('siren, qualiopi')
        .not('qualiopi', 'is', null)
        .order('siren')
        .range(from, from + pageSize - 1);
      if (error) throw new Error(`Reading providers failed: ${error.message}`);
      for (const row of (data ?? []) as {
        siren: string;
        qualiopi: boolean;
      }[]) {
        providers.set(row.siren, row.qualiopi);
      }
      if (!data || data.length < pageSize) break;
    }
    return providers;
  }

  /**
   * Checks in the company register whether Mon Compte Formation providers
   * are Qualiopi-certified, then copies the result onto their offers.
   * Returns how many providers were checked.
   */
  async checkProvidersQualiopi(limit: number): Promise<number> {
    let checked = 0;
    let updated = 0;
    let stopped = false;
    while (!stopped && checked < limit) {
      const { data, error } = await this.supabase.rpc(
        'training_providers_to_check',
        { p_limit: Math.min(1000, limit - checked) },
      );
      if (error) throw new Error(`Listing providers failed: ${error.message}`);
      const sirens = ((data ?? []) as { siren: string }[]).map((r) => r.siren);
      if (!sirens.length) break;

      for (let i = 0; i < sirens.length && !stopped; i += 10) {
        const rows: {
          siren: string;
          qualiopi: boolean | null;
          checked_at: string;
        }[] = [];
        // Small chunks: one big provider can have thousands of offers to update.
        const chunk = sirens.slice(i, i + 10);
        for (let j = 0; j < chunk.length; j += SITE_LOOKUPS_PER_SECOND) {
          const started = Date.now();
          const batch = chunk.slice(j, j + SITE_LOOKUPS_PER_SECOND);
          const results = await Promise.all(
            batch.map((siren) => this.findProviderQualiopi(siren)),
          );
          results.forEach((qualiopi, index) => {
            if (qualiopi === undefined) return;
            rows.push({
              siren: batch[index],
              qualiopi,
              checked_at: new Date().toISOString(),
            });
          });
          checked += batch.length;
          if (results.some((qualiopi) => qualiopi === undefined)) {
            this.logger.warn(
              'Training providers: company register unavailable, stopping',
            );
            stopped = true;
            break;
          }
          const wait = 1000 - (Date.now() - started);
          if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        }
        if (!rows.length) continue;
        await withRetry('Saving providers', async () => {
          const { error: saveError } = await this.supabase
            .from('training_providers')
            .upsert(rows, { onConflict: 'siren' });
          if (saveError) throw new Error(saveError.message);
        });
        const count = await withRetry('Applying providers', async () => {
          const { data: applied, error: applyError } = await this.supabase.rpc(
            'apply_training_providers',
            { p_sirens: rows.map((row) => row.siren) },
          );
          if (applyError) throw new Error(applyError.message);
          return Number(applied ?? 0);
        });
        updated += count;
      }
    }
    this.logger.log(
      `Training providers: ${checked} checked for Qualiopi, ${updated} offers updated`,
    );
    return checked;
  }

  /**
   * est_qualiopi of a company in the register: true/false, null when the
   * register does not know it, undefined when it cannot be reached.
   */
  private async findProviderQualiopi(
    siren: string,
  ): Promise<boolean | null | undefined> {
    try {
      const payload = await withRetry(
        'Company register',
        async () => {
          const response = await fetch(
            `${ENTREPRISES_URL}?${new URLSearchParams({ q: siren, per_page: '1' })}`,
          );
          if (response.status === 429 || response.status >= 500) {
            throw new Error(`Company register busy (${response.status})`);
          }
          if (!response.ok) return {};
          return (await response.json()) as {
            results?: {
              siren?: string;
              complements?: { est_qualiopi?: boolean };
            }[];
          };
        },
        { tries: 4, delayMs: 20_000 },
      );
      const company = payload.results?.find((r) => r.siren === siren);
      const qualiopi = company?.complements?.est_qualiopi;
      return typeof qualiopi === 'boolean' ? qualiopi : null;
    } catch {
      return undefined;
    }
  }

  // ── Storage helpers ───────────────────────────────────────────────────────

  private async upsert(offers: TrainingOffer[]): Promise<number> {
    if (!offers.length) return 0;
    // An id can appear twice in one page of a source: keep the last one.
    const unique = [...new Map(offers.map((o) => [o.id, o])).values()];
    await withRetry('Saving offers', async () => {
      const { error } = await this.supabase
        .from('training_offers')
        .upsert(unique, { onConflict: 'id' });
      if (error) throw new Error(`Saving offers failed: ${error.message}`);
    });
    return unique.length;
  }

  /** Removes offers of a source not seen in the import that just ended. */
  private async pruneStale(
    source: Source,
    runStartedAt: string,
    imported: number,
  ): Promise<number> {
    const stored = await this.countOffers(source);
    if (stored > 0 && imported < stored * MIN_SHARE_TO_PRUNE) {
      this.logger.warn(
        `Training offers ${source}: only ${imported} of ${stored} offers imported, nothing removed`,
      );
      return 0;
    }
    const { count, error } = await this.supabase
      .from('training_offers')
      .delete({ count: 'exact' })
      .eq('source', source)
      .lt('last_seen_at', runStartedAt);
    if (error) throw new Error(`Removing old offers failed: ${error.message}`);
    return count ?? 0;
  }

  private async countOffers(source: Source): Promise<number> {
    const { count } = await this.supabase
      .from('training_offers')
      .select('id', { count: 'exact', head: true })
      .eq('source', source);
    return count ?? 0;
  }

  /**
   * Registration status of RNCP certifications (France Compétences, via
   * Koumoul) and RS codes listed in CertifInfo (public.certifications).
   */
  private async certificationCodes(): Promise<CertificationCodes> {
    const codes: CertificationCodes = { rncp: new Map(), rs: new Set() };

    let url: string | undefined =
      `${RNCP_REGISTER_URL}?size=10000&select=NUMERO_FICHE,ACTIF,date_fin_enregistrement,date_limite_delivrance`;
    while (url) {
      const page: KoumoulLines = await withRetry('RNCP register', async () => {
        const response = await fetch(url!);
        if (!response.ok) {
          throw new Error(`RNCP register failed (${response.status})`);
        }
        return (await response.json()) as KoumoulLines;
      });
      for (const row of page.results ?? []) {
        const code = text(row.NUMERO_FICHE)?.replace(/^RNCP/i, '');
        if (code) {
          codes.rncp.set(code, {
            actif: typeof row.ACTIF === 'boolean' ? row.ACTIF : null,
            end: isoDate(row.date_fin_enregistrement),
            until: isoDate(row.date_limite_delivrance),
          });
        }
      }
      url = page.results?.length ? page.next : undefined;
    }

    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await this.supabase
        .from('certifications')
        .select('code_rs')
        .not('code_rs', 'is', null)
        .order('id')
        .range(from, from + pageSize - 1);
      if (error) {
        throw new Error(`Reading certifications failed: ${error.message}`);
      }
      for (const row of (data ?? []) as { code_rs: string | null }[]) {
        const rs = text(row.code_rs)?.replace(/^RS/i, '');
        if (rs) codes.rs.add(rs);
      }
      if (!data || data.length < pageSize) break;
    }
    return codes;
  }
}

// ── Small parsing helpers ─────────────────────────────────────────────────

function text(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function digits(value: unknown): string | null {
  const s = text(value)?.replace(/\D/g, '');
  return s ? s : null;
}

/** Lower case, no accents, single spaces: for comparing titles. */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Same provider (siren) + same certification, whatever the source: one
 * offer. Without a certification code, the normalised title is used.
 */
function dedupeKey(
  siretOrSiren: string | null,
  codeRncp: string | null,
  codeRs: string | null,
  title: string,
): string | null {
  const siren = siretOrSiren ? siretOrSiren.slice(0, 9) : null;
  if (!siren) return null;
  const certification = codeRncp
    ? `rncp${codeRncp}`
    : codeRs
      ? `rs${codeRs}`
      : `t:${normalizeTitle(title)}`;
  return `${siren}:${certification}`;
}

/** Runs a network call again (3 tries by default) when it fails. */
async function withRetry<T>(
  label: string,
  call: () => Promise<T>,
  { tries = 3, delayMs = 5000 }: { tries?: number; delayMs?: number } = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (cause) {
      if (attempt >= tries) throw cause;
      const message = cause instanceof Error ? cause.message : String(cause);
      new Logger(TrainingOffersService.name).warn(
        `${label}: try ${attempt} failed (${message}), retrying`,
      );
      await new Promise((resolve) => setTimeout(resolve, attempt * delayMs));
    }
  }
}

function isoDate(value: unknown): string | null {
  const date = text(value)?.slice(0, 10);
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

/**
 * Status of an RNCP certification from its official dates. The register's
 * ACTIF flag is updated a few days after the dates, so the dates decide.
 */
function rncpStatus(
  registration: RncpRegistration | undefined,
): CertificationStatus {
  if (!registration) {
    return { status: null, registration_end: null, delivery_until: null };
  }
  const today = new Date().toISOString().slice(0, 10);
  const { actif, end, until } = registration;
  const dates = { registration_end: end, delivery_until: until };
  // Withdrawn before its end date: only the delivery date can keep it.
  if (end && end >= today && actif !== false) {
    return { status: 'active', ...dates };
  }
  if (until && until >= today) return { status: 'deliverable', ...dates };
  if (until) return { status: 'expired', ...dates };
  if (end && end >= today) return { status: 'to_verify', ...dates };
  // Registration ended and no delivery date published.
  if (end) return { status: actif ? 'to_verify' : 'expired', ...dates };
  // No dates at all: only the flag.
  return {
    status: actif ? 'active' : actif === false ? 'expired' : null,
    ...dates,
  };
}

/** certification_active: the certification can be obtained. */
function withActive(status: CertificationStatus) {
  return {
    certification_status: status.status,
    registration_end: status.registration_end,
    delivery_until: status.delivery_until,
    certification_active:
      status.status === 'active' || status.status === 'deliverable'
        ? true
        : status.status === 'expired'
          ? false
          : null,
  };
}
