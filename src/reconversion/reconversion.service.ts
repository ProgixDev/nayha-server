import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AiService, EvaluationResult } from '../ai/ai.service';
import { UpdateReconversionJourneyDto } from './dto/update-reconversion-journey.dto';

type PrerequisLevel =
  'a_verifier' | 'obligatoire' | 'fortement_attendu' | 'utile';
type PrerequisStatus =
  'acquis' | 'partiellement_acquis' | 'a_construire' | 'a_verifier';

interface Certification {
  id: number;
  libelle_diplome: string;
  niveau_europeen: number | null;
  code_rncp: string | null;
  code_rs: string | null;
  certificateur: string | null;
  etat_libelle: string | null;
  accessibilite_vae: number | null;
  accessibilite_fc: number | null;
  accessibilite_ca: number | null;
}

type FormationSource = 'apprentissage' | 'koumoul' | 'supabase';

interface Coordinates {
  latitude: number;
  longitude: number;
}

interface KoumoulPage {
  next?: string;
  results?: Record<string, unknown>[];
}

export interface FormationPage {
  source: FormationSource;
  results: Record<string, unknown>[];
  nextCursor: string | null;
}

export interface FormationsJourney {
  exploredFormationIds: string[];
  favoritedFormationIds: string[];
  dismissedFormationIds: string[];
  notesAvis: Record<string, 'me_correspond' | 'a_verifier'>;
  selectedFormationId?: string;
  selectedFormationTitre?: string;
  updatedAt?: string;
}

export interface CheminJourney {
  selectedVoieId?: string;
  prioritePrerequisId?: string;
  updatedAt?: string;
}

type ImmersionIntent = 'undecided' | 'yes' | 'later' | 'no';
type ImmersionStatus =
  | 'notStarted'
  | 'preparing'
  | 'requestReady'
  | 'awaitingReply'
  | 'scheduled'
  | 'inProgress'
  | 'completed';
type ImmersionOutcome =
  'undecided' | 'confirmed' | 'toClarify' | 'notConfirmed';

export interface FinancementJourney {
  statut?: string;
  tempsTravail?: string;
  coutFormation?: number;
  statutPrixFormation?: string;
  soldeCpf?: number;
  isCpfReel?: boolean;
  ancienneteAnnees?: number;
  demarcheFinancement?: string;
  maintienRevenus?: string;
  dureeAutonomieMois?: number;
  fraisAnnexes?: string[];
  alternancePreference?: string;
  piecesCochees?: string[];
  updatedAt?: string;
}

export interface ImmersionJourney {
  intent: ImmersionIntent;
  duration: string;
  criteria: string[];
  prescriber: string;
  completedActionIds: string[];
  isCompleted: boolean;
  outcome: ImmersionOutcome;
  highlights: string;
  concerns: string;
  keepContact: boolean;
  hasReuseConsent: boolean;
  status: ImmersionStatus;
  updatedAt?: string;
}

export interface Prerequis {
  id: string;
  titre: string;
  niveau: PrerequisLevel;
  statutUtilisateur: PrerequisStatus;
  explication: string;
  pourquoi: string;
  prochaineEtape: string;
  /** Present only when the ROME access wording explicitly states an obligation. */
  sourceReglementaire?: string;
  source: {
    type: 'rome' | 'certifinfo';
    reference: string;
    url?: string;
    verificationReglementaireRequise: boolean;
  };
  certification?: {
    id: number;
    codeRncp: string | null;
    codeRs: string | null;
    niveau: number | null;
    vaeAccessible: boolean;
    formationContinueAccessible: boolean;
    alternanceAccessible: boolean;
  };
}

@Injectable()
export class ReconversionService {
  private readonly logger = new Logger(ReconversionService.name);
  private readonly supabase: SupabaseClient;
  private readonly apprentissageApiKey?: string;
  private readonly formationsApiDebug: boolean;
  private static readonly formationsPageSize = 10;
  private static readonly maximumSearchRadiusKm = 1000;
  private static readonly apprentissageApiUrl =
    'https://api.apprentissage.beta.gouv.fr/api/formation/v1/search';
  private static readonly koumoulFormationsUrl =
    'https://opendata.koumoul.com/data-fair/api/v1/datasets/competences-rncp/lines';
  private static readonly entreprisesApiUrl =
    'https://recherche-entreprises.api.gouv.fr/search';
  private static readonly adresseApiUrl =
    'https://api-adresse.data.gouv.fr/search';
  private static readonly mcfCatalogueUrl =
    'https://opendata.caissedesdepots.fr/api/explore/v2.1/catalog/datasets/moncompteformation_catalogueformation/records';
  private static readonly mcfCacheTtlMs = 24 * 60 * 60 * 1000;
  private readonly mcfCache = new Map<
    string,
    { hasActiveOffer: boolean; checkedAt: number }
  >();
  private static readonly qualiopiCacheTtlMs = 24 * 60 * 60 * 1000;
  private static readonly geocodingCacheTtlMs = 7 * 24 * 60 * 60 * 1000;
  private readonly qualiopiCache = new Map<
    string,
    { value: boolean; checkedAt: number }
  >();
  private readonly cityCoordinatesCache = new Map<
    string,
    { value: Coordinates; checkedAt: number }
  >();

  constructor(
    configService: ConfigService,
    private readonly aiService: AiService,
  ) {
    this.apprentissageApiKey = configService.get<string>(
      'APPRENTISSAGE_API_KEY',
    );
    this.formationsApiDebug =
      configService.get<string>('FORMATIONS_API_DEBUG') === 'true';
    this.supabase = createClient(
      configService.get<string>('SUPABASE_URL')!,
      configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
  }

  async getCheminAcces(userId: string, rawCodeRome: string) {
    const codeRome = this.normalizeCodeRome(rawCodeRome);
    const [profileResult, metierResult, ficheResult, certificationsResult] =
      await Promise.all([
        this.supabase
          .from('user_profiles')
          .select(
            'selected_metier_id, selected_metier_titre, reconversion_chemin_journey',
          )
          .eq('id', userId)
          .single(),
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
        this.supabase
          .from('certifications')
          .select(
            'id, libelle_diplome, niveau_europeen, code_rncp, code_rs, certificateur, etat_libelle, accessibilite_vae, accessibilite_fc, accessibilite_ca',
          )
          .contains('code_romes', [codeRome])
          .eq('etat_libelle', 'Publie')
          .order('niveau_europeen', { ascending: false })
          .limit(20),
      ]);

    if (profileResult.error || !profileResult.data) {
      throw new NotFoundException('Profil utilisateur introuvable');
    }
    if (metierResult.error || !metierResult.data) {
      throw new NotFoundException(`Métier ${codeRome} introuvable`);
    }
    if (ficheResult.error) {
      throw new NotFoundException(`Fiche métier ${codeRome} introuvable`);
    }
    if (certificationsResult.error) {
      throw new Error(
        `Certifications indisponibles: ${certificationsResult.error.message}`,
      );
    }

    const evaluation = await this.aiService.evaluateAdequation(
      userId,
      codeRome,
    );
    const metier = metierResult.data.data as Record<string, any>;
    const fiche = (ficheResult.data?.data ?? null) as Record<
      string,
      any
    > | null;
    const certifications = (certificationsResult.data ?? []) as Certification[];
    const storedJourney = this.readCheminJourney(
      profileResult.data.reconversion_chemin_journey,
      codeRome,
    );

    return {
      metier: {
        codeRome,
        titre:
          metier.libelle ||
          profileResult.data.selected_metier_titre ||
          codeRome,
        accesEmploi: metier.accesEmploi || null,
      },
      prerequis: this.buildPrerequis(
        codeRome,
        metier.accesEmploi,
        fiche,
        certifications,
        evaluation,
      ),
      pointsAppui: evaluation.pointsForts.map((point) => point.label),
      vae: {
        pertinentePourLeProfil: evaluation.vaePossible === true,
        certificationsAccessibles: certifications
          .filter((certification) => (certification.accessibilite_vae ?? 0) > 0)
          .map((certification) => ({
            id: certification.id,
            libelle: certification.libelle_diplome,
            codeRncp: certification.code_rncp,
          })),
      },
      prioritePrerequisId: storedJourney?.prioritePrerequisId ?? null,
      selectedVoieId: storedJourney?.selectedVoieId ?? null,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Returns full detail for a single training offer.
   * The formationId encodes the source: "apprentissage:{cleMin}",
   * "koumoul:{rncpOrId}", or "supabase:{numericId}".
   * Use ?id= query param (URL-encoded) to avoid path conflicts with special
   * characters such as "#" present in cle_ministere_educatif values.
   */
  async getFormationDetail(
    rawCodeRome: string,
    formationId: string | undefined,
  ): Promise<Record<string, unknown>> {
    if (!formationId || formationId.trim().length === 0) {
      throw new BadRequestException('Identifiant de formation requis');
    }

    const codeRome = this.normalizeCodeRome(rawCodeRome);
    const colonIndex = formationId.indexOf(':');

    if (colonIndex <= 0) {
      throw new BadRequestException('Identifiant de formation invalide');
    }

    const source = formationId.slice(0, colonIndex);
    const actualId = formationId.slice(colonIndex + 1).trim();

    if (!actualId) {
      throw new BadRequestException('Identifiant de formation invalide');
    }

    switch (source) {
      case 'apprentissage':
        return this.getApprentissageFormationDetail(codeRome, actualId);
      case 'koumoul':
        return this.getKoumoulFormationDetail(codeRome, actualId);
      case 'supabase':
        return this.getSupabaseFormationDetail(actualId);
      default:
        throw new BadRequestException('Source de formation invalide');
    }
  }

  /**
   * Returns the user's saved financement journey for the given ROME code,
   * along with the formation selected during the formations step (if any).
   * The client uses this to restore previous choices and pre-fill fields.
   */
  async getFinancement(userId: string, rawCodeRome: string) {
    const codeRome = this.normalizeCodeRome(rawCodeRome);

    const { data: profile, error } = await this.supabase
      .from('user_profiles')
      .select(
        'reconversion_financement_journey, reconversion_formations_journey',
      )
      .eq('id', userId)
      .single();

    if (error || !profile) {
      throw new NotFoundException('Profil utilisateur introuvable');
    }

    const formationsJourney = this.readFormationsJourney(
      profile.reconversion_formations_journey,
      codeRome,
    );

    return {
      codeRome,
      selectedFormationId: formationsJourney.selectedFormationId ?? null,
      selectedFormationTitre: formationsJourney.selectedFormationTitre ?? null,
      journey: this.readFinancementJourney(
        profile.reconversion_financement_journey,
        codeRome,
      ),
    };
  }

  /**
   * Returns real training offers and certifications from the official
   * Apprentissage API (with Koumoul and Supabase fallbacks).
   */
  async getFormationsByRome(
    userId: string,
    rawCodeRome: string,
    options: {
      after?: string;
      source?: string;
      modalite?: string;
      rayonKm?: string;
    } = {},
  ): Promise<FormationPage> {
    const codeRome = this.normalizeCodeRome(rawCodeRome);
    const requestedSource = this.parseFormationSource(options.source);
    const rayonKm = this.parseRayonKm(options.rayonKm);
    const userCoordinates =
      rayonKm == null ? null : await this.getUserCityCoordinates(userId);
    this.logFormationTrace('request', {
      codeRome,
      after: options.after ?? null,
      requestedSource: requestedSource ?? 'auto',
      modalite: options.modalite ?? 'all',
      rayonKm,
    });

    let page: FormationPage;

    if (requestedSource === 'apprentissage') {
      page = await this.getApprentissageFormationPage(
        codeRome,
        options.after,
        userCoordinates,
      );
    } else if (requestedSource === 'supabase') {
      page = await this.getSupabaseFormationPage(codeRome, options.after);
    } else if (requestedSource === 'koumoul') {
      page = await this.getKoumoulFormationPage(codeRome, options.after);
    } else {
      // 1. Try Apprentissage API first
      let apprentissagePage: FormationPage | null = null;
      if (this.apprentissageApiKey) {
        try {
          const res = await this.getApprentissageFormationPage(
            codeRome,
            options.after,
            userCoordinates,
          );
          if (res.results.length > 0 || requestedSource === 'apprentissage') {
            apprentissagePage = res;
          }
        } catch (_) {
          // Fallback to secondary sources on network error
        }
      }

      if (apprentissagePage && apprentissagePage.results.length > 0) {
        page = apprentissagePage;
      } else {
        // 2. Try Koumoul open-data certifications
        try {
          const koumoulPage = await this.getKoumoulFormationPage(
            codeRome,
            options.after,
          );
          if (koumoulPage.results.length > 0) {
            page = koumoulPage;
          } else {
            page = await this.getSupabaseFormationPage(codeRome, options.after);
          }
        } catch (_) {
          page = await this.getSupabaseFormationPage(codeRome, options.after);
        }
      }
    }

    const responsePage = options.modalite
      ? {
          ...page,
          results: this.filterFormationsByModalite(
            page.results,
            options.modalite,
          ),
        }
      : page;

    const proximityPage =
      rayonKm == null
        ? responsePage
        : {
            ...responsePage,
            results: responsePage.results
              .filter(
                (formation) =>
                  typeof formation['distanceKm'] === 'number' &&
                  formation['distanceKm'] <= rayonKm,
              )
              .sort(
                (first, second) =>
                  Number(first['distanceKm']) - Number(second['distanceKm']),
              ),
          };

    // Complete contract serialised by Nest and delivered to the mobile screen.
    this.logFormationTrace('mobile-response', proximityPage);
    this.logFormationsPage(codeRome, proximityPage, options.modalite);
    return proximityPage;
  }

  /** Emits diagnostic metadata only; no user or contact data. */
  private logFormationsPage(
    codeRome: string,
    page: FormationPage,
    modalite?: string,
  ): void {
    const cpfStatuses = page.results.reduce<Record<string, number>>(
      (counts, formation) => {
        const status = this.text(formation['cpfEligibility'], 'absent');
        counts[status] = (counts[status] ?? 0) + 1;
        return counts;
      },
      {},
    );
    const rncpStatuses = page.results.reduce<Record<string, number>>(
      (counts, formation) => {
        const status =
          formation['isCertificationActive'] === true
            ? 'active'
            : 'inactive_or_unknown';
        counts[status] = (counts[status] ?? 0) + 1;
        return counts;
      },
      {},
    );

    this.logger.log(
      `[formations] rome=${codeRome} source=${page.source} modalite=${modalite ?? 'all'} results=${page.results.length} rncp=${JSON.stringify(rncpStatuses)} cpf=${JSON.stringify(cpfStatuses)}`,
    );
    if (this.formationsApiDebug) {
      this.logger.log(
        `[formations-api][final-list] ${JSON.stringify(page.results)}`,
      );
    }
  }

  /** Local diagnostic mode only; never enabled by default in production. */
  private logFormationApiResponse(
    source: string,
    url: string,
    status: number,
    payload: unknown,
  ): void {
    if (!this.formationsApiDebug) return;
    this.logger.log(
      `[formations-api][${source}] status=${status} url=${url} response=${JSON.stringify(payload)}`,
    );
  }

  /** Opt-in local trace. Upstream catalogues may contain public contact data. */
  private logFormationTrace(stage: string, payload: unknown): void {
    if (!this.formationsApiDebug) return;
    this.logger.log(
      `[formations-trace][${stage}] ${JSON.stringify(payload)}`,
    );
  }

  private filterFormationsByModalite(
    results: Record<string, unknown>[],
    modalite?: string,
  ): Record<string, unknown>[] {
    if (!modalite || modalite === 'all' || modalite === 'toutes') {
      return results;
    }
    const clean = modalite.toLowerCase().trim();
    switch (clean) {
      case 'alternance':
        return results.filter((r) => r.alternanceAccessible === true);
      case 'continue':
      case 'formation_continue':
        return results.filter((r) => r.formationContinue === true);
      case 'vae':
        return results.filter((r) => r.vaeAccessible === true);
      case 'distance':
        return results.filter((r) => r.isDistance === true);
      case 'presentiel':
        return results.filter((r) => r.isDistance === false);
      case 'qualiopi':
        return results.filter((r) => r.isQualiopi === true);
      default:
        return results;
    }
  }

  private parseRayonKm(raw: string | undefined): number | null {
    if (raw == null || raw.trim().length === 0) return null;
    const value = Number(raw);
    if (
      !Number.isInteger(value) ||
      value < 1 ||
      value > ReconversionService.maximumSearchRadiusKm
    ) {
      throw new BadRequestException('Rayon de recherche invalide');
    }
    return value;
  }

  /** Resolves the city explicitly provided in the life diagnostic. */
  private async getUserCityCoordinates(userId: string): Promise<Coordinates> {
    const { data: profile, error } = await this.supabase
      .from('user_profiles')
      .select('diagnostic_vie_data')
      .eq('id', userId)
      .single();

    const diagnostic = profile?.diagnostic_vie_data;
    const city =
      diagnostic != null && typeof diagnostic === 'object'
        ? this.text((diagnostic as Record<string, unknown>)['city'])
        : '';
    if (error || city.length === 0) {
      throw new BadRequestException(
        'Ajoutez votre ville dans le diagnostic de vie pour utiliser ce filtre.',
      );
    }

    const cacheKey = city.toLocaleLowerCase('fr-FR');
    const cached = this.cityCoordinatesCache.get(cacheKey);
    if (
      cached &&
      Date.now() - cached.checkedAt < ReconversionService.geocodingCacheTtlMs
    ) {
      return cached.value;
    }

    const query = new URLSearchParams({ q: city, limit: '1', type: 'municipality' });
    const response = await fetch(
      `${ReconversionService.adresseApiUrl}?${query.toString()}`,
    );
    if (!response.ok) {
      throw new Error('Le service de localisation est momentanément indisponible.');
    }

    const payload = (await response.json()) as {
      features?: Array<{ geometry?: { coordinates?: unknown } }>;
    };
    const coordinates = this.coordinatesFromUnknown(
      payload.features?.[0]?.geometry?.coordinates,
    );
    if (coordinates == null) {
      throw new BadRequestException(
        'La ville enregistrée est introuvable. Vérifiez son orthographe.',
      );
    }
    this.cityCoordinatesCache.set(cacheKey, {
      value: coordinates,
      checkedAt: Date.now(),
    });
    return coordinates;
  }

  private extractOfferCoordinates(item: Record<string, any>): Coordinates | null {
    const lieu = item.lieu ?? {};
    return (
      this.coordinatesFromUnknown(lieu.geolocalisation) ??
      this.coordinatesFromUnknown(lieu.geolocalisation?.coordinates) ??
      this.coordinatesFromUnknown(lieu.coordinates) ??
      this.coordinatesFromUnknown(lieu.adresse?.geolocalisation) ??
      this.coordinatesFromUnknown(lieu.adresse?.coordinates)
    );
  }

  /** Accepts GeoJSON [longitude, latitude] and common latitude/longitude maps. */
  private coordinatesFromUnknown(raw: unknown): Coordinates | null {
    if (Array.isArray(raw) && raw.length >= 2) {
      const longitude = Number(raw[0]);
      const latitude = Number(raw[1]);
      return this.validCoordinates(latitude, longitude)
        ? { latitude, longitude }
        : null;
    }
    if (raw == null || typeof raw !== 'object') return null;
    const value = raw as Record<string, unknown>;
    const latitude = Number(value['latitude'] ?? value['lat']);
    const longitude = Number(value['longitude'] ?? value['lon'] ?? value['lng']);
    return this.validCoordinates(latitude, longitude)
      ? { latitude, longitude }
      : null;
  }

  private validCoordinates(latitude: number, longitude: number): boolean {
    return (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    );
  }

  /** Straight-line distance, rounded to the nearest kilometre. */
  private distanceInKm(from: Coordinates, to: Coordinates): number {
    const radians = (degrees: number) => (degrees * Math.PI) / 180;
    const latitudeDelta = radians(to.latitude - from.latitude);
    const longitudeDelta = radians(to.longitude - from.longitude);
    const a =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(radians(from.latitude)) *
        Math.cos(radians(to.latitude)) *
        Math.sin(longitudeDelta / 2) ** 2;
    return Math.max(
      1,
      Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))),
    );
  }

  private async getApprentissageFormationPage(
    codeRome: string,
    after?: string,
    userCoordinates?: Coordinates | null,
  ): Promise<FormationPage> {
    if (!this.apprentissageApiKey) {
      return { source: 'apprentissage', results: [], nextCursor: null };
    }

    const pageIndex =
      after == null || after.length === 0 ? 0 : Number.parseInt(after, 10);
    if (!Number.isSafeInteger(pageIndex) || pageIndex < 0) {
      throw new BadRequestException('Curseur de pagination invalide');
    }

    const query = new URLSearchParams({
      romes: codeRome,
      page_size: String(ReconversionService.formationsPageSize),
      page_index: String(pageIndex),
      include_archived: 'false',
    });

    const requestUrl = `${ReconversionService.apprentissageApiUrl}?${query.toString()}`;
    const response = await fetch(requestUrl, {
      headers: {
        Authorization: `Bearer ${this.apprentissageApiKey}`,
      },
    });

    if (!response.ok) {
      this.logFormationTrace('apprentissage-error', {
        status: response.status,
        url: requestUrl,
      });
      return { source: 'apprentissage', results: [], nextCursor: null };
    }

    const payload = (await response.json()) as Record<string, any>;
    this.logFormationApiResponse(
      'apprentissage',
      requestUrl,
      response.status,
      payload,
    );
    const data = Array.isArray(payload.data) ? payload.data : [];
    const pageCount = payload.pagination?.page_count ?? 1;

    // Enrichment calls are independent per offer and run concurrently.
    const results = await Promise.all(
      data.map((item: Record<string, any>) =>
        this.apprentissageToFormation(item, userCoordinates),
      ),
    );

    const nextIndex = pageIndex + 1;
    const nextCursor = nextIndex < pageCount ? String(nextIndex) : null;

    return {
      source: 'apprentissage',
      results,
      nextCursor,
    };
  }

  private async apprentissageToFormation(
    item: Record<string, any>,
    userCoordinates?: Coordinates | null,
  ): Promise<Record<string, unknown>> {
    const formateur = item.formateur?.organisme;
    const responsable = item.responsable?.organisme;
    const org = formateur || responsable || {};
    const uniteLegale = org.unite_legale || {};
    const specific = org.renseignements_specifiques || {};
    const certif = item.certification?.valeur || {};
    const lieu = item.lieu || {};
    const adresse = lieu.adresse || {};
    const modalite = item.modalite || {};
    const contenu = item.contenu_educatif || {};
    const contact = item.contact || {};
    const sessions = Array.isArray(item.sessions) ? item.sessions : [];

    const rncpCode = this.normalizeRncpCode(
      certif.identifiant?.rncp ?? certif.identifiant?.rs,
    );
    const cleMin = item.identifiant?.cle_ministere_educatif || '';
    const siret = org.identifiant?.siret || '';
    const id = `apprentissage:${cleMin || siret || rncpCode || Math.random().toString(36).slice(2)}`;

    const [koumoulActive, qualiopiFromAnnuaire, mcfCpfActive] =
      await Promise.all([
        this.getKoumoulActiveStatus(rncpCode),
        this.getQualiopiStatus(siret),
        this.checkMcfCpfEligibility(rncpCode, siret),
      ]);
    // A temporary external outage must not turn a known offer into an
    // ineligible one.  The verification flags let clients distinguish the
    // official enrichment from the catalogue's own metadata.
    const realActiveStatus =
      koumoulActive ?? certif.periode_validite?.rncp?.actif === true;
    const realQualiopiStatus =
      qualiopiFromAnnuaire ?? specific.qualiopi === true;
    // Check CPF eligibility using Mon Compte Formation catalogue.
    // If the offer exists in MCF with active sessions → eligible + verified.
    // If RNCP is inactive → ineligible. Otherwise → to_verify.
    const cpfEligibility = mcfCpfActive
      ? 'eligible'
      : koumoulActive === false
        ? 'ineligible'
        : 'to_verify';
    const cpfOfferVerified = mcfCpfActive;

    const nomOrg =
      uniteLegale.raison_sociale ||
      org.etablissement?.enseigne ||
      'Organisme certifié';
    const titre =
      certif.intitule?.cfd?.long ||
      certif.intitule?.rncp ||
      'Formation certifiante';
    const niveau =
      certif.intitule?.niveau?.cfd?.libelle ||
      (certif.intitule?.niveau?.cfd?.europeen
        ? `Niveau ${certif.intitule.niveau.cfd.europeen}`
        : 'Niveau non renseigné');
    const qualiopi = realQualiopiStatus;

    // Blocs de compétences
    const blocs = Array.isArray(certif.blocs_competences?.rncp)
      ? certif.blocs_competences.rncp
          .map((b: any) => b.intitule)
          .filter(Boolean)
      : [];
    const blocsCodes = Array.isArray(certif.blocs_competences?.rncp)
      ? certif.blocs_competences.rncp.map((b: any) => b.code).filter(Boolean)
      : [];

    const now = new Date();
    const upcomingSessions = sessions
      .filter((s: any) => {
        if (!s.debut) return false;
        const debut = new Date(s.debut);
        return !Number.isNaN(debut.getTime()) && debut >= now;
      })
      .sort(
        (a: any, b: any) =>
          new Date(a.debut).getTime() - new Date(b.debut).getTime(),
      );
    const nextSession = upcomingSessions[0]
      ? [
          `Prochaine session : ${new Date(upcomingSessions[0].debut).toLocaleDateString('fr-FR')}`,
          upcomingSessions[0].capacite != null &&
          Number.isFinite(Number(upcomingSessions[0].capacite))
            ? `capacité ${upcomingSessions[0].capacite} places`
            : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : 'Aucune session à venir publiée';

    const normalizedSessions = upcomingSessions.map((s: any) => ({
      debut: new Date(s.debut).toLocaleDateString('fr-FR'),
      fin: s.fin ? new Date(s.fin).toLocaleDateString('fr-FR') : null,
      capacite:
        s.capacite != null && Number.isFinite(Number(s.capacite))
          ? Number(s.capacite)
          : null,
    }));

    // Lieu
    const lieuStr =
      [adresse.label, adresse.code_postal, adresse.commune?.nom]
        .filter(Boolean)
        .join(', ') || 'Lieu à confirmer';

    // Voie d'accès
    const voieAcces = certif.type?.voie_acces?.rncp || {};
    const formationContinue = voieAcces.formation_continue === true;
    const alternanceAccessible =
      voieAcces.apprentissage === true ||
      voieAcces.contrat_professionnalisation === true;
    const vaeAccessible = voieAcces.experience === true;
    const isDistance = modalite.entierement_a_distance === true;
    const offerCoordinates = this.extractOfferCoordinates(item);
    const distanceKm =
      userCoordinates != null && offerCoordinates != null
        ? this.distanceInKm(userCoordinates, offerCoordinates)
        : null;

    const normalizedFormation = {
      id,
      cleMinistereEducatif: cleMin,
      siret,
      uai: org.identifiant?.uai || '',
      nomOrganisme: nomOrg,
      titreFormation: titre,
      certificationCode: rncpCode,
      niveauCertification: niveau,
      dateFinEnregistrement:
        certif.periode_validite?.rncp?.fin_enregistrement ||
        certif.periode_validite?.rs?.fin_enregistrement ||
        '',
      dateLimiteDelivrance:
        certif.periode_validite?.rncp?.fin ||
        certif.periode_validite?.rs?.fin ||
        '',
      isCertificationActive: realActiveStatus,
      rncpStatusVerified: koumoulActive != null,
      cpfEligibility,
      cpfOfferVerified,
      isQualiopi: qualiopi,
      qualiopiVerified: qualiopiFromAnnuaire != null,
      isDistance,
      distanceKm,
      duree: modalite.duree_indicative
        ? `${modalite.duree_indicative} an(s)`
        : 'Durée selon parcours',
      rythme: alternanceAccessible
        ? 'Alternance / Formation continue'
        : 'Temps plein / partiel',
      format: isDistance ? '100% à distance' : 'Présentiel / Mixte',
      lieu: lieuStr,
      prochaineSession: nextSession,
      sessions: normalizedSessions,
      contactEmail: contact.email || org.contacts?.[0]?.email || '',
      contactTelephone: contact.telephone || '',
      contenu: contenu.contenu || '',
      objectif: contenu.objectif || '',
      blocsCompetences: blocs,
      blocsCompetencesCodes: blocsCodes,
      formationContinue,
      alternanceAccessible,
      vaeAccessible,
      onisepUrl: item.onisep?.url || '',
    };
    this.logFormationTrace('apprentissage-normalized', normalizedFormation);
    return normalizedFormation;
  }

  private async getKoumoulFormationPage(
    codeRome: string,
    after?: string,
  ): Promise<FormationPage> {
    const query = new URLSearchParams({
      CODES_ROME_search: codeRome,
      ACTIF_eq: 'true',
      size: String(ReconversionService.formationsPageSize),
    });
    if (after != null && after.length > 0) {
      if (!/^\d+$/.test(after)) {
        throw new BadRequestException('Curseur de pagination invalide');
      }
      query.set('after', after);
    }

    const requestUrl = `${ReconversionService.koumoulFormationsUrl}?${query.toString()}`;
    const response = await fetch(requestUrl);
    if (!response.ok) {
      throw new Error(`Koumoul indisponible (${response.status})`);
    }

    const payload = (await response.json()) as KoumoulPage;
    this.logFormationApiResponse(
      'koumoul',
      requestUrl,
      response.status,
      payload,
    );
    const results = Array.isArray(payload.results) ? payload.results : [];

    const formations = results
      .filter((row) => this.isActiveExactRomeMatch(row, codeRome))
      .map((row) => this.koumoulCertificationToFormation(row));
    await this.enrichFormationsWithMcfCpf(formations);
    const page: FormationPage = {
      source: 'koumoul',
      results: formations,
      nextCursor: this.cursorFromKoumoulNext(payload.next),
    };
    this.logFormationTrace('koumoul-normalized-page', page);
    return page;
  }

  private async getSupabaseFormationPage(
    codeRome: string,
    after?: string,
  ): Promise<FormationPage> {
    const offset =
      after == null || after.length === 0 ? 0 : Number.parseInt(after, 10);
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new BadRequestException('Curseur de pagination invalide');
    }

    const end = offset + ReconversionService.formationsPageSize - 1;
    const { data, error, count } = await this.supabase
      .from('certifications')
      .select(
        'id, libelle_diplome, niveau_europeen, code_rncp, code_romes, certificateur, etat_libelle, accessibilite_vae, accessibilite_fc, accessibilite_ca, date_maj',
        { count: 'exact' },
      )
      .contains('code_romes', [codeRome])
      .ilike('etat_libelle', 'publi%')
      .order('niveau_europeen', { ascending: false })
      .range(offset, end);

    if (error) {
      throw new Error(`Certifications indisponibles: ${error.message}`);
    }

    const results = (data ?? []).map((row) =>
      this.supabaseCertificationToFormation(row as Record<string, unknown>),
    );
    await this.enrichFormationsWithMcfCpf(results);
    const nextOffset = offset + results.length;
    const page: FormationPage = {
      source: 'supabase',
      results,
      nextCursor:
        count != null && nextOffset < count ? String(nextOffset) : null,
    };
    this.logFormationTrace('supabase-page', {
      codeRome,
      offset,
      count: count ?? null,
      page,
    });
    return page;
  }

  /**
   * Fetches a single Apprentissage formation by cle_ministere_educatif.
   * Paginates through results (up to 5 pages) until the record is found.
   */
  private async getApprentissageFormationDetail(
    codeRome: string,
    cleMin: string,
  ): Promise<Record<string, unknown>> {
    if (!this.apprentissageApiKey) {
      throw new NotFoundException('Détail de formation indisponible');
    }

    const pageSize = ReconversionService.formationsPageSize;
    const maxPages = 5;

    for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
      const query = new URLSearchParams({
        romes: codeRome,
        page_size: String(pageSize),
        page_index: String(pageIndex),
        include_archived: 'false',
      });

      const response = await fetch(
        `${ReconversionService.apprentissageApiUrl}?${query.toString()}`,
        { headers: { Authorization: `Bearer ${this.apprentissageApiKey}` } },
      );

      if (!response.ok) break;

      const payload = (await response.json()) as Record<string, any>;
      const data = Array.isArray(payload.data) ? payload.data : [];
      const pageCount: number = payload.pagination?.page_count ?? 1;

      const match = data.find(
        (item: Record<string, any>) =>
          (item.identifiant?.cle_ministere_educatif ?? '') === cleMin,
      );

      if (match) return this.apprentissageToFormation(match);
      if (pageIndex + 1 >= pageCount) break;
    }

    throw new NotFoundException('Formation introuvable');
  }

  /**
   * Fetches a single Koumoul certification by RNCP code or internal ID.
   */
  private async getKoumoulFormationDetail(
    codeRome: string,
    koumoulId: string,
  ): Promise<Record<string, unknown>> {
    const isRncp = /^(RNCP|RS)\d+$/i.test(koumoulId);

    if (isRncp) {
      const normalizedCode = koumoulId.toUpperCase();
      const query = new URLSearchParams({
        // `_search` is tokenised by Data Fair and does not reliably match an
        // RNCP identifier.  `_eq` guarantees that we enrich the requested
        // certification rather than a similarly indexed one.
        NUMERO_FICHE_eq: normalizedCode,
        size: String(ReconversionService.formationsPageSize),
      });

      const response = await fetch(
        `${ReconversionService.koumoulFormationsUrl}?${query.toString()}`,
      );

      if (!response.ok) throw new NotFoundException('Formation introuvable');

      const payload = (await response.json()) as KoumoulPage;
      this.logFormationApiResponse(
        'koumoul-rncp-status',
        `${ReconversionService.koumoulFormationsUrl}?${query.toString()}`,
        response.status,
        payload,
      );
      const results = Array.isArray(payload.results) ? payload.results : [];
      const match = results.find(
        (row) => this.normalizeRncpCode(row['NUMERO_FICHE']) === normalizedCode,
      );

      if (!match) throw new NotFoundException('Formation introuvable');
      return this.koumoulCertificationToFormation(match);
    }

    // Fallback: search by ROME and match by Koumoul internal ID
    const query = new URLSearchParams({
      CODES_ROME_search: codeRome,
      ACTIF_eq: 'true',
      size: String(ReconversionService.formationsPageSize),
    });

    const response = await fetch(
      `${ReconversionService.koumoulFormationsUrl}?${query.toString()}`,
    );

    if (!response.ok) throw new NotFoundException('Formation introuvable');

    const payload = (await response.json()) as KoumoulPage;
    const results = Array.isArray(payload.results) ? payload.results : [];
    const match = results.find(
      (row) => String(row['ID_FICHE'] ?? row['_id'] ?? '') === koumoulId,
    );

    if (!match) throw new NotFoundException('Formation introuvable');
    const formation = this.koumoulCertificationToFormation(match);
    // Enrich with MCF CPF check (no SIRET available at certification level)
    const code = this.normalizeRncpCode(match['NUMERO_FICHE']);
    const mcfActive = await this.checkMcfCpfEligibility(code);
    if (mcfActive) {
      formation['cpfEligibility'] = 'eligible';
      formation['cpfOfferVerified'] = true;
    }
    return formation;
  }

  /**
   * Fetches a single certification from the local Supabase table by numeric ID.
   */
  private async getSupabaseFormationDetail(
    id: string,
  ): Promise<Record<string, unknown>> {
    const numericId = Number.parseInt(id, 10);
    if (!Number.isSafeInteger(numericId) || numericId <= 0) {
      throw new BadRequestException('Identifiant de formation invalide');
    }

    const { data, error } = await this.supabase
      .from('certifications')
      .select(
        'id, libelle_diplome, niveau_europeen, code_rncp, code_romes, certificateur, etat_libelle, accessibilite_vae, accessibilite_fc, accessibilite_ca, date_maj',
      )
      .eq('id', numericId)
      .single();

    if (error || !data) {
      throw new NotFoundException('Formation introuvable');
    }

    const formation = this.supabaseCertificationToFormation(
      data as Record<string, unknown>,
    );
    // Enrich with MCF CPF check
    const code = this.normalizeRncpCode(
      (data as Record<string, unknown>)['code_rncp'],
    );
    const mcfActive = await this.checkMcfCpfEligibility(code);
    if (mcfActive) {
      formation['cpfEligibility'] = 'eligible';
      formation['cpfOfferVerified'] = true;
    }
    return formation;
  }

  private koumoulCertificationToFormation(
    row: Record<string, unknown>,
  ): Record<string, unknown> {
    const code = this.normalizeRncpCode(row['NUMERO_FICHE']);
    return {
      id: `koumoul:${code || row['ID_FICHE'] || row['_id'] || 'inconnu'}`,
      certificationCode: code,
      titreFormation: this.text(row['INTITULE'], 'Certification RNCP'),
      niveauCertification: this.text(
        row['NOMENCLATURE_EUROPE_INTITULE'],
        'Niveau non renseigné',
      ),
      nomOrganisme: this.text(
        row['CERTIFICATEURS'],
        'Certificateur non renseigné',
      ),
      isCertificationActive: row['ACTIF'] === true,
      rncpStatusVerified: true,
      cpfEligibility: row['ACTIF'] === true ? 'to_verify' : 'ineligible',
      cpfOfferVerified: false,
      etatFiche: this.text(row['ETAT_FICHE']),
      dateFinEnregistrement: this.text(row['date_fin_enregistrement']),
      dateLimiteDelivrance: this.text(row['date_limite_delivrance']),
      prerequis: this.text(row['prerequis_entree_formation']),
      blocsCompetences: this.splitValues(row['blocs_competences_libelles']),
      blocsCompetencesCodes: this.splitValues(row['blocs_competences_codes']),
      capacitesAttestees: this.text(row['CAPACITES_ATTESTEES']),
      activitesVisees: this.text(row['ACTIVITES_VISEES']),
      codesRome: this.splitValues(row['CODES_ROME']),
      formacodes: this.splitValues(row['formacodes']),
      emploisAccessibles: this.text(row['TYPE_EMPLOI_ACCESSIBLES']),
      formationContinue: row['SI_JURY_FC'] === true,
      vaeAccessible: row['SI_JURY_VAE'] === true || row['jury_vae'] != null,
      alternanceAccessible: row['SI_JURY_CA'] === true,
      isQualiopi: false,
      isDistance: false,
      statistiquesPromotions: row['statistiques_promotions'] ?? null,
    };
  }

  private isActiveExactRomeMatch(
    row: Record<string, unknown>,
    codeRome: string,
  ): boolean {
    return (
      row['ACTIF'] === true &&
      this.splitValues(row['CODES_ROME'])
        .map((code) => code.toUpperCase())
        .includes(codeRome)
    );
  }

  private supabaseCertificationToFormation(
    row: Record<string, unknown>,
  ): Record<string, unknown> {
    const code = this.normalizeRncpCode(row['code_rncp']);
    return {
      id: `supabase:${row['id']}`,
      certificationCode: code,
      titreFormation: this.text(row['libelle_diplome'], 'Certification'),
      niveauCertification:
        row['niveau_europeen'] == null
          ? 'Niveau non renseigné'
          : `Niveau ${row['niveau_europeen']}`,
      nomOrganisme: this.text(
        row['certificateur'],
        'Certificateur non renseigné',
      ),
      isCertificationActive:
        this.text(row['etat_libelle']).toLowerCase() === 'publie',
      rncpStatusVerified: false,
      cpfEligibility:
        this.text(row['etat_libelle']).toLowerCase() === 'publie'
          ? 'to_verify'
          : 'ineligible',
      cpfOfferVerified: false,
      isQualiopi: false,
      isDistance: false,
      etatFiche: this.text(row['etat_libelle']),
      dateFinEnregistrement: this.text(row['date_maj']),
      dateLimiteDelivrance: '',
      prerequis: '',
      blocsCompetences: [],
      blocsCompetencesCodes: [],
      capacitesAttestees: '',
      activitesVisees: '',
      codesRome: Array.isArray(row['code_romes']) ? row['code_romes'] : [],
      formacodes: [],
      emploisAccessibles: '',
      formationContinue: Number(row['accessibilite_fc'] ?? 0) > 0,
      vaeAccessible: Number(row['accessibilite_vae'] ?? 0) > 0,
      alternanceAccessible: Number(row['accessibilite_ca'] ?? 0) > 0,
      statistiquesPromotions: null,
    };
  }

  /**
   * France compétences data exposed by Koumoul is the authority used for the
   * CPF rule. `null` means the source could not be consulted or did not return
   * that exact RNCP code; it is intentionally different from `false`.
   */
  private async getKoumoulActiveStatus(
    rncpCode: string,
  ): Promise<boolean | null> {
    if (!rncpCode) return null;

    const query = new URLSearchParams({
      NUMERO_FICHE_eq: rncpCode,
      size: '1',
    });

    try {
      const response = await fetch(
        `${ReconversionService.koumoulFormationsUrl}?${query.toString()}`,
      );
      const requestUrl = `${ReconversionService.koumoulFormationsUrl}?${query.toString()}`;
      if (!response.ok) {
        this.logFormationTrace('koumoul-status-error', {
          rncpCode,
          status: response.status,
          url: requestUrl,
        });
        return null;
      }

      const payload = (await response.json()) as KoumoulPage;
      this.logFormationApiResponse(
        'koumoul-rncp-status',
        requestUrl,
        response.status,
        payload,
      );
      const row = (payload.results ?? []).find(
        (candidate) =>
          this.normalizeRncpCode(candidate['NUMERO_FICHE']) === rncpCode,
      );
      const isCertificationActive = row == null ? null : row['ACTIF'] === true;
      this.logFormationTrace('koumoul-status-decision', {
        rncpCode,
        isCertificationActive,
      });
      return isCertificationActive;
    } catch (error) {
      this.logFormationTrace('koumoul-status-exception', {
        rncpCode,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * The enterprise search endpoint may return a legal unit plus nearby/other
   * establishments. Only accept its Qualiopi value when the queried SIRET is
   * actually present in the response; using `results[0]` alone can badge the
   * wrong provider.
   */
  private async getQualiopiStatus(siret: string): Promise<boolean | null> {
    if (!/^\d{14}$/.test(siret)) return null;

    const cached = this.qualiopiCache.get(siret);
    if (
      cached &&
      Date.now() - cached.checkedAt < ReconversionService.qualiopiCacheTtlMs
    ) {
      this.logFormationTrace('qualiopi-cache-hit', {
        siret,
        isQualiopi: cached.value,
        checkedAt: new Date(cached.checkedAt).toISOString(),
      });
      return cached.value;
    }

    const query = new URLSearchParams({ q: siret, per_page: '10' });
    try {
      const response = await fetch(
        `${ReconversionService.entreprisesApiUrl}?${query.toString()}`,
      );
      if (!response.ok) {
        this.logFormationTrace('recherche-entreprises-error', {
          siret,
          status: response.status,
        });
        return null;
      }

      const payload = (await response.json()) as Record<string, any>;
      this.logFormationApiResponse(
        'recherche-entreprises',
        `${ReconversionService.entreprisesApiUrl}?${query.toString()}`,
        response.status,
        payload,
      );
      const enterprise = (
        Array.isArray(payload.results) ? payload.results : []
      ).find((candidate: Record<string, any>) => {
        const establishmentSirets = [
          candidate.siege?.siret,
          ...(Array.isArray(candidate.matching_etablissements)
            ? candidate.matching_etablissements.map(
                (establishment: Record<string, any>) => establishment.siret,
              )
            : []),
        ];
        return establishmentSirets.includes(siret);
      });

      if (enterprise == null) {
        this.logFormationTrace('qualiopi-no-siret-match', { siret });
        return null;
      }
      const value = enterprise.complements?.est_qualiopi === true;
      this.qualiopiCache.set(siret, { value, checkedAt: Date.now() });
      this.logFormationTrace('qualiopi-decision', { siret, isQualiopi: value });
      return value;
    } catch (error) {
      this.logFormationTrace('recherche-entreprises-exception', {
        siret,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Check if a formation has an active CPF offer on Mon Compte Formation.
   * Uses the Caisse des Dépôts open data API (no auth required).
   * Results are cached for 24 hours.
   */
  private async checkMcfCpfEligibility(
    codeRncp: string,
    siret?: string,
  ): Promise<boolean> {
    if (!codeRncp || codeRncp === '-1') return false;

    // MCF API expects numeric code only (e.g. "40692"), not "RNCP40692"
    const numericCode = codeRncp.replace(/^(RNCP|RS)/i, '');
    if (!numericCode || numericCode === '-1') return false;

    const cacheKey = `${numericCode}:${siret ?? '*'}`;
    const cached = this.mcfCache.get(cacheKey);
    if (
      cached &&
      Date.now() - cached.checkedAt < ReconversionService.mcfCacheTtlMs
    ) {
      this.logFormationTrace('mcf-cache-hit', {
        codeRncp,
        siret,
        hasActiveOffer: cached.hasActiveOffer,
      });
      return cached.hasActiveOffer;
    }

    try {
      // First try with SIRET for exact match, then fallback to RNCP-only.
      // Different establishments of the same org may have different SIRETs.
      const baseWhere = `code_rncp="${numericCode}" AND nb_session_active>0`;

      let hasActiveOffer = false;

      if (siret) {
        const siretParams = new URLSearchParams({
          where: `${baseWhere} AND siret="${siret}"`,
          limit: '1',
          select: 'nb_session_active',
        });
        const siretRes = await fetch(
          `${ReconversionService.mcfCatalogueUrl}?${siretParams.toString()}`,
        );
        if (siretRes.ok) {
          const siretPayload = (await siretRes.json()) as Record<string, any>;
          hasActiveOffer =
            typeof siretPayload.total_count === 'number' &&
            siretPayload.total_count > 0;
        }
      }

      // Fallback: check by RNCP code only (any provider)
      if (!hasActiveOffer) {
        const params = new URLSearchParams({
          where: baseWhere,
          limit: '1',
          select: 'nb_session_active',
        });
        const response = await fetch(
          `${ReconversionService.mcfCatalogueUrl}?${params.toString()}`,
        );
        if (!response.ok) {
          this.logFormationTrace('mcf-api-error', {
            codeRncp,
            siret,
            status: response.status,
          });
          return false;
        }
        const payload = (await response.json()) as Record<string, any>;
        hasActiveOffer =
          typeof payload.total_count === 'number' && payload.total_count > 0;
      }

      this.mcfCache.set(cacheKey, { hasActiveOffer, checkedAt: Date.now() });
      this.logFormationTrace('mcf-cpf-decision', {
        codeRncp,
        siret,
        hasActiveOffer,
      });
      return hasActiveOffer;
    } catch (error) {
      this.logFormationTrace('mcf-api-exception', {
        codeRncp,
        siret,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Batch-enrich a list of formations with MCF CPF status.
   * Runs checks in parallel for all unique RNCP codes.
   */
  private async enrichFormationsWithMcfCpf(
    formations: Record<string, unknown>[],
  ): Promise<void> {
    const codes = [
      ...new Set(
        formations
          .map((f) => String(f['certificationCode'] ?? ''))
          .filter((c) => c.length > 0 && c !== '-1'),
      ),
    ];
    if (codes.length === 0) return;

    const results = await Promise.all(
      codes.map(async (code) => ({
        code,
        active: await this.checkMcfCpfEligibility(code),
      })),
    );
    const activeSet = new Set(
      results.filter((r) => r.active).map((r) => r.code),
    );

    for (const f of formations) {
      const code = String(f['certificationCode'] ?? '');
      if (activeSet.has(code)) {
        f['cpfEligibility'] = 'eligible';
        f['cpfOfferVerified'] = true;
      }
    }
  }

  private parseFormationSource(
    raw: string | undefined,
  ): FormationSource | undefined {
    if (raw == null || raw.length === 0) return undefined;
    if (
      raw === 'apprentissage' ||
      raw === 'koumoul' ||
      raw === 'supabase'
    ) {
      return raw;
    }
    throw new BadRequestException('Source de formations invalide');
  }

  private cursorFromKoumoulNext(next: string | undefined): string | null {
    if (next == null || next.length === 0) return null;
    try {
      return new URL(next).searchParams.get('after');
    } catch (_) {
      return null;
    }
  }

  // Koumoul writes RNCP12345 or RS12345 while CertifInfo can omit the prefix.
  // Preserve an explicit RNCP/RS prefix and default unprefixed records to RNCP.
  private normalizeRncpCode(raw: unknown): string {
    const value = this.text(raw).replace(/\s+/g, '');
    if (value.length === 0) return '';
    const match = /^(RNCP|RS)(\d+)$/i.exec(value);
    return match ? `${match[1].toUpperCase()}${match[2]}` : `RNCP${value}`;
  }

  private text(raw: unknown, fallback = ''): string {
    return typeof raw === 'string' && raw.trim().length > 0
      ? raw.trim()
      : fallback;
  }

  private splitValues(raw: unknown): string[] {
    return this.text(raw)
      .split(';')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  async updateCheminPriority(
    userId: string,
    rawCodeRome: string,
    prerequisId: string,
  ) {
    const codeRome = this.normalizeCodeRome(rawCodeRome);
    const { data: profile, error: readError } = await this.supabase
      .from('user_profiles')
      .select('reconversion_chemin_journey')
      .eq('id', userId)
      .single();

    if (readError || !profile) {
      throw new NotFoundException('Profil utilisateur introuvable');
    }

    const journey = this.readAllSectionJourneys(
      profile.reconversion_chemin_journey,
    );
    const updatedAt = new Date().toISOString();
    journey[codeRome] = {
      ...this.normaliseCheminJourney(journey[codeRome]),
      prioritePrerequisId: prerequisId.trim(),
      updatedAt,
    };

    const { error: updateError } = await this.supabase
      .from('user_profiles')
      .update({ reconversion_chemin_journey: journey })
      .eq('id', userId);

    if (updateError) {
      throw new Error(
        `Impossible d'enregistrer la priorité: ${updateError.message}`,
      );
    }

    return { codeRome, prioritePrerequisId: prerequisId.trim(), updatedAt };
  }

  async getJourney(userId: string, rawCodeRome: string) {
    const codeRome = this.normalizeCodeRome(rawCodeRome);
    const { data: profile, error } = await this.supabase
      .from('user_profiles')
      .select(
        'reconversion_chemin_journey, reconversion_formations_journey, reconversion_immersion_journey, reconversion_financement_journey',
      )
      .eq('id', userId)
      .single();

    if (error || !profile) {
      throw new NotFoundException('Profil utilisateur introuvable');
    }

    return {
      codeRome,
      chemin: this.readCheminJourney(
        profile.reconversion_chemin_journey,
        codeRome,
      ),
      formations: this.readFormationsJourney(
        profile.reconversion_formations_journey,
        codeRome,
      ),
      immersion: this.readImmersionJourney(
        profile.reconversion_immersion_journey,
        codeRome,
      ),
      financement: this.readFinancementJourney(
        profile.reconversion_financement_journey,
        codeRome,
      ),
    };
  }

  async updateJourney(
    userId: string,
    rawCodeRome: string,
    dto: UpdateReconversionJourneyDto,
  ) {
    if (
      dto.chemin == null &&
      dto.formations == null &&
      dto.immersion == null &&
      dto.financement == null
    ) {
      throw new BadRequestException('Aucune donnée de parcours à enregistrer');
    }

    const codeRome = this.normalizeCodeRome(rawCodeRome);
    const { data: profile, error: readError } = await this.supabase
      .from('user_profiles')
      .select(
        'reconversion_chemin_journey, reconversion_formations_journey, reconversion_immersion_journey, reconversion_financement_journey',
      )
      .eq('id', userId)
      .single();

    if (readError || !profile) {
      throw new NotFoundException('Profil utilisateur introuvable');
    }

    const cheminJourneys = this.readAllSectionJourneys(
      profile.reconversion_chemin_journey,
    );
    const formationsJourneys = this.readAllSectionJourneys(
      profile.reconversion_formations_journey,
    );
    const immersionJourneys = this.readAllSectionJourneys(
      profile.reconversion_immersion_journey,
    );
    const financementJourneys = this.readAllSectionJourneys(
      profile.reconversion_financement_journey,
    );
    const updatedAt = new Date().toISOString();

    if (dto.chemin != null) {
      cheminJourneys[codeRome] = this.mergeCheminJourney(
        cheminJourneys[codeRome],
        dto.chemin,
        updatedAt,
      );
    }
    if (dto.formations != null) {
      formationsJourneys[codeRome] = this.mergeFormationsJourney(
        formationsJourneys[codeRome],
        dto.formations,
        updatedAt,
      );
    }
    if (dto.immersion != null) {
      immersionJourneys[codeRome] = this.mergeImmersionJourney(
        immersionJourneys[codeRome],
        dto.immersion,
        updatedAt,
      );
    }
    if (dto.financement != null) {
      financementJourneys[codeRome] = this.mergeFinancementJourney(
        financementJourneys[codeRome],
        dto.financement,
        updatedAt,
      );
    }

    const { error: updateError } = await this.supabase
      .from('user_profiles')
      .update({
        reconversion_chemin_journey: cheminJourneys,
        reconversion_formations_journey: formationsJourneys,
        reconversion_immersion_journey: immersionJourneys,
        reconversion_financement_journey: financementJourneys,
      })
      .eq('id', userId);

    if (updateError) {
      throw new Error(
        `Impossible d'enregistrer le parcours: ${updateError.message}`,
      );
    }

    return {
      codeRome,
      chemin: this.readCheminJourney(cheminJourneys, codeRome),
      formations: this.readFormationsJourney(formationsJourneys, codeRome),
      immersion: this.readImmersionJourney(immersionJourneys, codeRome),
      financement: this.readFinancementJourney(financementJourneys, codeRome),
    };
  }

  private readCheminJourney(value: unknown, codeRome: string): CheminJourney {
    const all = this.readAllSectionJourneys(value);
    return this.normaliseCheminJourney(all[codeRome]);
  }

  private normaliseCheminJourney(value: unknown): CheminJourney {
    const raw = this.asRecord(value);
    return {
      selectedVoieId: this.optionalVoieId(raw.selectedVoieId),
      prioritePrerequisId: this.optionalText(raw.prioritePrerequisId, 200),
      updatedAt: this.optionalText(raw.updatedAt, 40),
    };
  }

  private mergeCheminJourney(
    current: unknown,
    patch: Record<string, unknown>,
    updatedAt: string,
  ): CheminJourney {
    const next = this.normaliseCheminJourney(current);
    if (this.has(patch, 'selectedVoieId')) {
      const voieId = this.optionalVoieId(patch.selectedVoieId);
      if (voieId == null) {
        throw new BadRequestException("Voie d'accès invalide");
      }
      next.selectedVoieId = voieId;
    }
    next.updatedAt = updatedAt;
    return next;
  }

  private readFormationsJourney(
    value: unknown,
    codeRome: string,
  ): FormationsJourney {
    const all = this.readAllSectionJourneys(value);
    return this.normaliseFormationsJourney(all[codeRome]);
  }

  private normaliseFormationsJourney(value: unknown): FormationsJourney {
    const raw = this.asRecord(value);
    const notesAvis: Record<string, 'me_correspond' | 'a_verifier'> = {};
    const rawNotes = this.asRecord(raw.notesAvis);

    for (const [formationId, note] of Object.entries(rawNotes).slice(0, 100)) {
      if (note === 'me_correspond' || note === 'a_verifier') {
        notesAvis[this.text(formationId).slice(0, 300)] = note;
      }
    }

    return {
      exploredFormationIds: this.stringArray(raw.exploredFormationIds, 100),
      favoritedFormationIds: this.stringArray(raw.favoritedFormationIds, 100),
      dismissedFormationIds: this.stringArray(raw.dismissedFormationIds, 100),
      notesAvis,
      selectedFormationId: this.optionalText(raw.selectedFormationId, 300),
      selectedFormationTitre: this.optionalText(
        raw.selectedFormationTitre,
        300,
      ),
      updatedAt: this.optionalText(raw.updatedAt, 40),
    };
  }

  private mergeFormationsJourney(
    current: unknown,
    patch: Record<string, unknown>,
    updatedAt: string,
  ): FormationsJourney {
    const next = this.normaliseFormationsJourney(current);
    if (this.has(patch, 'exploredFormationIds')) {
      next.exploredFormationIds = this.stringArray(
        patch.exploredFormationIds,
        100,
      );
    }
    if (this.has(patch, 'favoritedFormationIds')) {
      next.favoritedFormationIds = this.stringArray(
        patch.favoritedFormationIds,
        100,
      );
    }
    if (this.has(patch, 'dismissedFormationIds')) {
      next.dismissedFormationIds = this.stringArray(
        patch.dismissedFormationIds,
        100,
      );
    }
    if (this.has(patch, 'notesAvis')) {
      const rawNotes = this.asRecord(patch.notesAvis);
      next.notesAvis = {};
      for (const [formationId, note] of Object.entries(rawNotes).slice(
        0,
        100,
      )) {
        if (note !== 'me_correspond' && note !== 'a_verifier') {
          throw new BadRequestException('Avis de formation invalide');
        }
        next.notesAvis[this.text(formationId).slice(0, 300)] = note;
      }
    }
    if (this.has(patch, 'selectedFormationId')) {
      next.selectedFormationId = this.optionalText(
        patch.selectedFormationId,
        300,
      );
    }
    if (this.has(patch, 'selectedFormationTitre')) {
      next.selectedFormationTitre = this.optionalText(
        patch.selectedFormationTitre,
        300,
      );
    }
    next.updatedAt = updatedAt;
    return next;
  }

  private readImmersionJourney(
    value: unknown,
    codeRome: string,
  ): ImmersionJourney {
    const all = this.readAllSectionJourneys(value);
    return this.normaliseImmersionJourney(all[codeRome]);
  }

  private normaliseImmersionJourney(value: unknown): ImmersionJourney {
    const raw = this.asRecord(value);
    const isCompleted = raw.isCompleted === true;
    const status = this.enumValue(
      raw.status,
      [
        'notStarted',
        'preparing',
        'requestReady',
        'awaitingReply',
        'scheduled',
        'inProgress',
        'completed',
      ] as const,
      'notStarted',
      "statut d'immersion",
    );

    return {
      intent: this.enumValue(
        raw.intent,
        ['undecided', 'yes', 'later', 'no'] as const,
        'undecided',
        "intention d'immersion",
      ),
      duration: this.text(raw.duration).slice(0, 100),
      criteria: this.stringArray(raw.criteria, 10),
      prescriber: this.text(raw.prescriber).slice(0, 160),
      completedActionIds: this.stringArray(raw.completedActionIds, 20),
      isCompleted,
      outcome: this.enumValue(
        raw.outcome,
        ['undecided', 'confirmed', 'toClarify', 'notConfirmed'] as const,
        'undecided',
        "résultat d'immersion",
      ),
      highlights: this.text(raw.highlights).slice(0, 2000),
      concerns: this.text(raw.concerns).slice(0, 2000),
      keepContact: raw.keepContact === true,
      hasReuseConsent: raw.hasReuseConsent === true,
      status: isCompleted
        ? 'completed'
        : status === 'completed'
          ? 'inProgress'
          : status,
      updatedAt: this.optionalText(raw.updatedAt, 40),
    };
  }

  private mergeImmersionJourney(
    current: unknown,
    patch: Record<string, unknown>,
    updatedAt: string,
  ): ImmersionJourney {
    const next = this.normaliseImmersionJourney(current);
    if (this.has(patch, 'intent')) {
      next.intent = this.enumValue(
        patch.intent,
        ['undecided', 'yes', 'later', 'no'] as const,
        next.intent,
        "intention d'immersion",
      );
    }
    if (this.has(patch, 'duration')) {
      next.duration = this.text(patch.duration).slice(0, 100);
    }
    if (this.has(patch, 'criteria')) {
      next.criteria = this.stringArray(patch.criteria, 10);
    }
    if (this.has(patch, 'prescriber')) {
      next.prescriber = this.text(patch.prescriber).slice(0, 160);
    }
    if (this.has(patch, 'completedActionIds')) {
      next.completedActionIds = this.stringArray(patch.completedActionIds, 20);
    }
    if (this.has(patch, 'outcome')) {
      next.outcome = this.enumValue(
        patch.outcome,
        ['undecided', 'confirmed', 'toClarify', 'notConfirmed'] as const,
        next.outcome,
        "résultat d'immersion",
      );
    }
    if (this.has(patch, 'highlights')) {
      next.highlights = this.text(patch.highlights).slice(0, 2000);
    }
    if (this.has(patch, 'concerns')) {
      next.concerns = this.text(patch.concerns).slice(0, 2000);
    }
    if (this.has(patch, 'keepContact')) {
      next.keepContact = this.booleanValue(patch.keepContact, 'contact');
    }
    if (this.has(patch, 'hasReuseConsent')) {
      next.hasReuseConsent = this.booleanValue(
        patch.hasReuseConsent,
        'consentement',
      );
    }
    if (this.has(patch, 'isCompleted')) {
      next.isCompleted = this.booleanValue(
        patch.isCompleted,
        'confirmation de fin',
      );
    }
    if (this.has(patch, 'status')) {
      next.status = this.enumValue(
        patch.status,
        [
          'notStarted',
          'preparing',
          'requestReady',
          'awaitingReply',
          'scheduled',
          'inProgress',
          'completed',
        ] as const,
        next.status,
        "statut d'immersion",
      );
    }

    if (next.status === 'completed' && !next.isCompleted) {
      throw new BadRequestException(
        'Une immersion doit être confirmée avant le bilan',
      );
    }
    if (next.isCompleted) next.status = 'completed';
    next.updatedAt = updatedAt;
    return next;
  }

  private readFinancementJourney(
    value: unknown,
    codeRome: string,
  ): FinancementJourney {
    const all = this.readAllSectionJourneys(value);
    return this.normaliseFinancementJourney(all[codeRome]);
  }

  private static readonly STATUT_ACTUEL = [
    'salarieeCdi',
    'salarieeCdd',
    'demandeuseIndemnisee',
    'sansActivite',
    'independante',
    'secteurPublic',
  ] as const;

  private static readonly STATUT_PRIX = [
    'monCompteFormation',
    'surDevis',
    'estimation',
  ] as const;

  private static readonly DEMARCHE_FINANCEMENT = [
    'aucune',
    'ptpEnCours',
    'franceTravailRegion',
    'devisOrganisme',
    'autre',
  ] as const;

  private static readonly MAINTIEN_REVENUS = [
    'salairePtp',
    'arefFranceTravail',
    'remunerationRegion',
    'epargneOuAutre',
    'aDeterminer',
  ] as const;

  private static readonly ALTERNANCE_PREFERENCE = [
    'tresOuverte',
    'possible',
    'non',
  ] as const;

  private static readonly FRAIS_ANNEXE_TYPES = [
    'transport',
    'gardeEnfants',
    'materiel',
    'hebergement',
  ] as const;

  private normaliseFinancementJourney(value: unknown): FinancementJourney {
    const raw = this.asRecord(value);

    const coutFormation =
      typeof raw.coutFormation === 'number' &&
      Number.isFinite(raw.coutFormation) &&
      raw.coutFormation >= 0
        ? Math.round(raw.coutFormation * 100) / 100
        : undefined;

    const soldeCpf =
      typeof raw.soldeCpf === 'number' &&
      Number.isFinite(raw.soldeCpf) &&
      raw.soldeCpf >= 0
        ? Math.round(raw.soldeCpf * 100) / 100
        : undefined;

    const ancienneteAnnees =
      typeof raw.ancienneteAnnees === 'number' &&
      Number.isInteger(raw.ancienneteAnnees) &&
      raw.ancienneteAnnees >= 0
        ? raw.ancienneteAnnees
        : undefined;

    const dureeAutonomieMois =
      typeof raw.dureeAutonomieMois === 'number' &&
      Number.isInteger(raw.dureeAutonomieMois) &&
      raw.dureeAutonomieMois >= 0
        ? raw.dureeAutonomieMois
        : undefined;

    const rawFrais = Array.isArray(raw.fraisAnnexes) ? raw.fraisAnnexes : [];
    const fraisAnnexes = rawFrais.filter(
      (f): f is string =>
        typeof f === 'string' &&
        (ReconversionService.FRAIS_ANNEXE_TYPES as readonly string[]).includes(
          f,
        ),
    );

    const rawPieces = Array.isArray(raw.piecesCochees) ? raw.piecesCochees : [];
    const piecesCochees = rawPieces
      .filter((p): p is string => typeof p === 'string')
      .map((p) => p.trim().slice(0, 200))
      .filter((p) => p.length > 0)
      .slice(0, 50);

    return {
      statut: this.optionalEnum(
        raw.statut,
        ReconversionService.STATUT_ACTUEL as readonly string[],
      ),
      tempsTravail: this.optionalEnum(raw.tempsTravail, [
        'tempsPlein',
        'tempsPartiel',
      ]),
      coutFormation,
      statutPrixFormation: this.optionalEnum(
        raw.statutPrixFormation,
        ReconversionService.STATUT_PRIX as readonly string[],
      ),
      soldeCpf,
      isCpfReel: typeof raw.isCpfReel === 'boolean' ? raw.isCpfReel : undefined,
      ancienneteAnnees,
      demarcheFinancement: this.optionalEnum(
        raw.demarcheFinancement,
        ReconversionService.DEMARCHE_FINANCEMENT as readonly string[],
      ),
      maintienRevenus: this.optionalEnum(
        raw.maintienRevenus,
        ReconversionService.MAINTIEN_REVENUS as readonly string[],
      ),
      dureeAutonomieMois,
      fraisAnnexes: fraisAnnexes.length > 0 ? fraisAnnexes : undefined,
      alternancePreference: this.optionalEnum(
        raw.alternancePreference,
        ReconversionService.ALTERNANCE_PREFERENCE as readonly string[],
      ),
      piecesCochees: piecesCochees.length > 0 ? piecesCochees : undefined,
      updatedAt: this.optionalText(raw.updatedAt, 40),
    };
  }

  private mergeFinancementJourney(
    current: unknown,
    patch: Record<string, unknown>,
    updatedAt: string,
  ): FinancementJourney {
    const next = this.normaliseFinancementJourney(current);

    if (this.has(patch, 'statut')) {
      const v = this.optionalEnum(
        patch.statut,
        ReconversionService.STATUT_ACTUEL as readonly string[],
      );
      if (v == null && patch.statut != null) {
        throw new BadRequestException('Statut professionnel invalide');
      }
      next.statut = v;
    }
    if (this.has(patch, 'tempsTravail')) {
      const v = this.optionalEnum(patch.tempsTravail, [
        'tempsPlein',
        'tempsPartiel',
      ]);
      if (v == null && patch.tempsTravail != null) {
        throw new BadRequestException('Type de temps de travail invalide');
      }
      next.tempsTravail = v;
    }
    if (this.has(patch, 'coutFormation')) {
      if (
        patch.coutFormation != null &&
        (typeof patch.coutFormation !== 'number' ||
          !Number.isFinite(patch.coutFormation) ||
          patch.coutFormation < 0)
      ) {
        throw new BadRequestException('Coût de formation invalide');
      }
      next.coutFormation =
        patch.coutFormation != null
          ? Math.round((patch.coutFormation as number) * 100) / 100
          : undefined;
    }
    if (this.has(patch, 'statutPrixFormation')) {
      const v = this.optionalEnum(
        patch.statutPrixFormation,
        ReconversionService.STATUT_PRIX as readonly string[],
      );
      if (v == null && patch.statutPrixFormation != null) {
        throw new BadRequestException('Statut du prix de formation invalide');
      }
      next.statutPrixFormation = v;
    }
    if (this.has(patch, 'soldeCpf')) {
      if (
        patch.soldeCpf != null &&
        (typeof patch.soldeCpf !== 'number' ||
          !Number.isFinite(patch.soldeCpf) ||
          patch.soldeCpf < 0)
      ) {
        throw new BadRequestException('Solde CPF invalide');
      }
      next.soldeCpf =
        patch.soldeCpf != null
          ? Math.round((patch.soldeCpf as number) * 100) / 100
          : undefined;
    }
    if (this.has(patch, 'isCpfReel')) {
      next.isCpfReel = this.booleanValue(patch.isCpfReel, 'isCpfReel');
    }
    if (this.has(patch, 'ancienneteAnnees')) {
      if (
        patch.ancienneteAnnees != null &&
        (typeof patch.ancienneteAnnees !== 'number' ||
          !Number.isInteger(patch.ancienneteAnnees) ||
          (patch.ancienneteAnnees as number) < 0)
      ) {
        throw new BadRequestException('Ancienneté invalide');
      }
      next.ancienneteAnnees =
        patch.ancienneteAnnees != null
          ? (patch.ancienneteAnnees as number)
          : undefined;
    }
    if (this.has(patch, 'demarcheFinancement')) {
      const v = this.optionalEnum(
        patch.demarcheFinancement,
        ReconversionService.DEMARCHE_FINANCEMENT as readonly string[],
      );
      if (v == null && patch.demarcheFinancement != null) {
        throw new BadRequestException('Démarche de financement invalide');
      }
      next.demarcheFinancement = v;
    }
    if (this.has(patch, 'maintienRevenus')) {
      const v = this.optionalEnum(
        patch.maintienRevenus,
        ReconversionService.MAINTIEN_REVENUS as readonly string[],
      );
      if (v == null && patch.maintienRevenus != null) {
        throw new BadRequestException('Maintien des revenus invalide');
      }
      next.maintienRevenus = v;
    }
    if (this.has(patch, 'dureeAutonomieMois')) {
      if (
        patch.dureeAutonomieMois != null &&
        (typeof patch.dureeAutonomieMois !== 'number' ||
          !Number.isInteger(patch.dureeAutonomieMois) ||
          (patch.dureeAutonomieMois as number) < 0)
      ) {
        throw new BadRequestException("Durée d'autonomie invalide");
      }
      next.dureeAutonomieMois =
        patch.dureeAutonomieMois != null
          ? (patch.dureeAutonomieMois as number)
          : undefined;
    }
    if (this.has(patch, 'fraisAnnexes')) {
      if (!Array.isArray(patch.fraisAnnexes)) {
        throw new BadRequestException('Frais annexes invalides');
      }
      next.fraisAnnexes = (patch.fraisAnnexes as unknown[])
        .filter(
          (f): f is string =>
            typeof f === 'string' &&
            (
              ReconversionService.FRAIS_ANNEXE_TYPES as readonly string[]
            ).includes(f),
        )
        .slice(0, 10);
    }
    if (this.has(patch, 'alternancePreference')) {
      const v = this.optionalEnum(
        patch.alternancePreference,
        ReconversionService.ALTERNANCE_PREFERENCE as readonly string[],
      );
      if (v == null && patch.alternancePreference != null) {
        throw new BadRequestException('Préférence alternance invalide');
      }
      next.alternancePreference = v;
    }
    if (this.has(patch, 'piecesCochees')) {
      if (!Array.isArray(patch.piecesCochees)) {
        throw new BadRequestException('Pièces cochées invalides');
      }
      next.piecesCochees = (patch.piecesCochees as unknown[])
        .filter((p): p is string => typeof p === 'string')
        .map((p) => p.trim().slice(0, 200))
        .filter((p) => p.length > 0)
        .slice(0, 50);
    }

    next.updatedAt = updatedAt;
    return next;
  }

  private optionalEnum(
    value: unknown,
    allowed: readonly string[],
  ): string | undefined {
    if (value == null) return undefined;
    return typeof value === 'string' && allowed.includes(value)
      ? value
      : undefined;
  }

  private readAllSectionJourneys(value: unknown): Record<string, any> {
    const raw = this.asRecord(value);
    return Object.fromEntries(
      Object.entries(raw).filter(([, journey]) => this.asRecord(journey)),
    ) as Record<string, any>;
  }

  private asRecord(value: unknown): Record<string, any> {
    return value != null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, any>)
      : {};
  }

  private has(value: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  private stringArray(value: unknown, maxItems: number): string[] {
    if (!Array.isArray(value)) return [];
    return [
      ...new Set(
        value
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim().slice(0, 300))
          .filter((item) => item.length > 0),
      ),
    ].slice(0, maxItems);
  }

  private optionalText(value: unknown, maxLength: number): string | undefined {
    const text = this.text(value).slice(0, maxLength);
    return text.length > 0 ? text : undefined;
  }

  private optionalVoieId(value: unknown): string | undefined {
    const voieId = this.optionalText(value, 80);
    return voieId != null &&
      [
        'voie_formation',
        'voie_vae',
        'voie_renforcement',
        'voie_directe',
      ].includes(voieId)
      ? voieId
      : undefined;
  }

  private booleanValue(value: unknown, label: string): boolean {
    if (typeof value !== 'boolean') {
      throw new BadRequestException(`${label} doit être un booléen`);
    }
    return value;
  }

  private enumValue<const T extends readonly string[]>(
    value: unknown,
    allowed: T,
    fallback: T[number],
    label: string,
  ): T[number] {
    if (value == null) return fallback;
    if (typeof value === 'string' && allowed.includes(value)) {
      return value as T[number];
    }
    throw new BadRequestException(`${label} invalide`);
  }

  private buildPrerequis(
    codeRome: string,
    accesEmploi: unknown,
    fiche: Record<string, any> | null,
    certifications: Certification[],
    evaluation: EvaluationResult,
  ): Prerequis[] {
    const prerequis: Prerequis[] = [];
    const sourceReglementaire = this.legalAccessSource(accesEmploi);
    const usedTitles = new Set<string>();
    const add = (item: Prerequis) => {
      const key = this.normalized(item.titre);
      if (key && !usedTitles.has(key) && prerequis.length < 3) {
        prerequis.push(item);
        usedTitles.add(key);
      }
    };

    for (const lacune of evaluation.lacunes.filter(
      (item) => item.niveau === 'obligatoire',
    )) {
      const certification = this.findCertification(
        lacune.element,
        certifications,
      );
      add(
        this.fromLacune(
          lacune,
          sourceReglementaire ? 'obligatoire' : 'fortement_attendu',
          codeRome,
          certification,
          sourceReglementaire
            ? 'Le référentiel ROME indique explicitement cette exigence comme obligatoire pour accéder au métier.'
            : "Niveau d'accès ou certification fréquemment attendu pour ce métier. À confirmer selon l'employeur et le poste visé.",
          sourceReglementaire,
        ),
      );
    }

    for (const lacune of evaluation.lacunes.filter(
      (item) => item.niveau === 'a_developper',
    )) {
      add(this.fromLacune(lacune, 'fortement_attendu', codeRome));
    }

    for (const lacune of evaluation.lacunes.filter(
      (item) => item.niveau === 'a_verifier',
    )) {
      add(this.fromLacune(lacune, 'utile', codeRome));
    }

    for (const competence of this.romeCompetences(fiche)) {
      add({
        id: `rome:${codeRome}:${this.slug(competence)}`,
        titre: this.toCompetenceRequirement(competence),
        niveau: prerequis.some((item) => item.niveau === 'fortement_attendu')
          ? 'utile'
          : 'fortement_attendu',
        statutUtilisateur: 'a_verifier',
        explication: 'Compétence identifiée dans la fiche métier ROME.',
        pourquoi:
          'Ton profil ne permet pas encore de confirmer précisément cet acquis.',
        prochaineEtape:
          'Vérifier si cette compétence a été mobilisée dans tes expériences.',
        source: {
          type: 'rome',
          reference: codeRome,
          verificationReglementaireRequise: false,
        },
      });
    }

    return prerequis;
  }

  private fromLacune(
    lacune: EvaluationResult['lacunes'][number],
    niveau: PrerequisLevel,
    codeRome: string,
    certification?: Certification,
    explicationOverride?: string,
    sourceReglementaire?: string,
  ): Prerequis {
    return {
      id: certification
        ? `certifinfo:${certification.id}`
        : `ecart:${this.slug(lacune.element)}`,
      titre:
        certification?.libelle_diplome ||
        this.toCompetenceRequirement(lacune.element),
      niveau,
      statutUtilisateur:
        lacune.niveau === 'a_verifier' ? 'a_verifier' : 'a_construire',
      explication: explicationOverride || lacune.pourquoi,
      pourquoi: lacune.pourquoi,
      prochaineEtape: lacune.prochaineEtape,
      sourceReglementaire,
      source: certification
        ? {
            type: 'certifinfo',
            reference:
              certification.code_rncp ||
              certification.code_rs ||
              String(certification.id),
            url: certification.code_rncp
              ? `https://www.francecompetences.fr/recherche/rncp/${certification.code_rncp}`
              : undefined,
            verificationReglementaireRequise: niveau !== 'obligatoire',
          }
        : {
            type: 'rome',
            reference: codeRome,
            verificationReglementaireRequise: false,
          },
      certification: certification
        ? {
            id: certification.id,
            codeRncp: certification.code_rncp,
            codeRs: certification.code_rs,
            niveau: certification.niveau_europeen,
            vaeAccessible: (certification.accessibilite_vae ?? 0) > 0,
            formationContinueAccessible:
              (certification.accessibilite_fc ?? 0) > 0,
            alternanceAccessible: (certification.accessibilite_ca ?? 0) > 0,
          }
        : undefined,
    };
  }

  private romeCompetences(fiche: Record<string, any> | null): string[] {
    const competences: string[] = [];
    for (const group of fiche?.groupesCompetencesMobilisees ?? []) {
      for (const competence of group.competences ?? []) {
        if (
          typeof competence.libelle === 'string' &&
          competence.libelle.trim()
        ) {
          competences.push(competence.libelle.trim());
        }
      }
    }
    return competences;
  }

  /**
   * Product rule: ROME access information counts as a legal obligation only
   * when it explicitly uses the word "obligatoire". Typical access wording
   * such as "niveau Licence" remains an employer expectation.
   */
  private legalAccessSource(accesEmploi: unknown): string | undefined {
    if (typeof accesEmploi !== 'string' || !accesEmploi.trim()) {
      return undefined;
    }

    const access = accesEmploi.trim();
    const normalized = this.normalized(access);
    const isNegated =
      normalized.includes('non obligatoire') ||
      normalized.includes('pas obligatoire') ||
      normalized.includes('sans obligation');

    return !isNegated && /\bobligatoire(?:s|ment)?\b/.test(normalized)
      ? `ROME — Accès à l'emploi : ${access}`
      : undefined;
  }

  /**
   * ROME lists activities as well as skills. The screen must phrase an
   * activity as a capability to build, never as a task already expected from
   * the user.
   */
  private toCompetenceRequirement(value: string): string {
    const normalized = this.normalized(value);
    if (
      normalized.includes('prestation de bilan') ||
      normalized.includes('orientation professionnelle')
    ) {
      return "Maîtriser la conduite d'entretiens et l'analyse de parcours";
    }
    if (normalized.includes('bilan de competences')) {
      return 'Maîtriser la méthodologie du bilan de compétences';
    }
    if (
      normalized.includes('passation de tests') ||
      normalized.includes('outils d evaluation')
    ) {
      return "Savoir utiliser et interpréter des outils d'évaluation";
    }
    if (
      normalized.includes('bilan') ||
      normalized.includes('orientation professionnelle')
    ) {
      return 'Conduire des entretiens et analyser les parcours professionnels';
    }
    return value;
  }

  private findCertification(
    requirement: string,
    certifications: Certification[],
  ): Certification | undefined {
    const normalizedRequirement = this.normalized(requirement);
    return certifications.find((certification) => {
      const normalizedCertification = this.normalized(
        certification.libelle_diplome,
      );
      return (
        normalizedCertification.includes(normalizedRequirement) ||
        normalizedRequirement.includes(normalizedCertification)
      );
    });
  }

  private normalizeCodeRome(value: string): string {
    const code = value.trim().toUpperCase();
    if (!/^[A-Z][0-9]{4}$/.test(code)) {
      throw new BadRequestException('Le code ROME doit avoir le format A1234');
    }
    return code;
  }

  private normalized(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private slug(value: string): string {
    return this.normalized(value).replace(/\s+/g, '-').slice(0, 120);
  }
}
