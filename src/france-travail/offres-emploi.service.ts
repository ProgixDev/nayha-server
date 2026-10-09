import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { FranceTravailService } from './france-travail.service';
import {
  FtRawOffre,
  keywordsFromMetier,
  mergeOffres,
  OffreDetail,
  OffreSummary,
  RomeMetierData,
  WeightedResults,
  searchPlanFromRome,
  toOffreDetail,
  toOffreSummary,
  websiteSearchUrl,
} from './offres-emploi.helpers';

const OFFRES_SCOPE = 'api_offresdemploiv2 o2dsoffre';
const OFFRES_BASE =
  'https://api.francetravail.io/partenaire/offresdemploi/v2/offres';
const CACHE_TTL_MS = 15 * 60 * 1000;
/** Below this, the search is widened to the département, then France. */
const MIN_RESULTS = 8;
const PAGE_SIZE = 50;

interface GeoCommune {
  code: string;
  nom: string;
  codeDepartement: string;
}

type Location = {
  type: 'commune' | 'departement';
  code: string;
  label: string;
};

export interface OffresSearchParams {
  /** Free keywords typed by the user; replaces the métier-based search. */
  q?: string;
  /** City name; defaults to the CV city, then the diagnostic city. */
  ville?: string;
  distance?: number;
  /** CDI, CDD, MIS (intérim)… as expected by France Travail. */
  typeContrat?: string;
}

export interface OffresSearchResult {
  metier: { codeRome: string | null; titre: string | null };
  motsCles: string | null;
  /** Where the results actually come from after widening. */
  zone: { niveau: 'ville' | 'departement' | 'france'; libelle: string };
  offres: OffreSummary[];
  voirPlusUrl: string;
}

@Injectable()
export class OffresEmploiService {
  private readonly logger = new Logger(OffresEmploiService.name);
  private readonly supabase: SupabaseClient;
  private readonly cache = new Map<string, { at: number; value: unknown }>();

  constructor(
    configService: ConfigService,
    private readonly ftService: FranceTravailService,
  ) {
    this.supabase = createClient(
      configService.get<string>('SUPABASE_URL')!,
      configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
  }

  /**
   * Offers for the user's target métier around their city. Combines a ROME
   * code search and a keyword search (the public API exposes fewer offers
   * than the website, the union narrows the gap), then widens the zone when
   * too few offers are found.
   */
  async searchForUser(
    userId: string,
    params: OffresSearchParams,
  ): Promise<OffresSearchResult> {
    const profile = await this.loadProfile(userId);
    const codeRome = /^[A-Z]\d{4}$/.test(profile.selected_metier_id ?? '')
      ? (profile.selected_metier_id as string)
      : null;
    const titre = profile.selected_metier_titre?.trim() || null;
    const userQuery = params.q?.trim();
    const plan = userQuery
      ? null
      : searchPlanFromRome(codeRome, titre, await this.loadRome(codeRome));
    // Keywords shown to the user and used for the website link.
    const motsCles = userQuery
      ? userQuery.split(/\s+/).slice(0, 3).join(',')
      : titre
        ? keywordsFromMetier(titre)
        : null;
    const city =
      params.ville?.trim() ||
      profile.cv_identity?.city?.trim() ||
      profile.diagnostic_vie_data?.city?.trim() ||
      '';
    const commune = city ? await this.resolveCommune(city) : null;

    const filters = new URLSearchParams();
    if (params.typeContrat) filters.set('typeContrat', params.typeContrat);

    const zones: {
      niveau: OffresSearchResult['zone']['niveau'];
      location: Location | null;
    }[] = [];
    if (commune) {
      zones.push({ niveau: 'ville', location: commune.commune });
      zones.push({ niveau: 'departement', location: commune.departement });
    }
    zones.push({ niveau: 'france', location: null });

    let offres: OffreSummary[] = [];
    let used = zones[zones.length - 1];
    for (const zone of zones) {
      const location = new URLSearchParams(filters);
      if (zone.location?.type === 'commune') {
        location.set('commune', zone.location.code);
        location.set('distance', String(params.distance ?? 20));
      } else if (zone.location?.type === 'departement') {
        location.set('departement', zone.location.code);
      }

      const at = Object.fromEntries(location);
      const searches: Promise<WeightedResults>[] = [];
      const add = (query: Record<string, string>, weight: number) =>
        searches.push(
          this.search({ ...at, ...query }).then((offres) => ({
            offres,
            weight,
          })),
        );
      if (plan) {
        // The appellation is the exact job; parent codes and keyword + domain
        // widen the pool and are ranked lower.
        if (plan.appellations.length > 0) {
          add({ appellation: plan.appellations.join(',') }, 3);
        }
        if (plan.codesRome.length > 0) {
          add({ codeROME: plan.codesRome.join(',') }, 1);
        }
        if (plan.motCle && plan.domaine) {
          add({ motsCles: plan.motCle, domaine: plan.domaine }, 2);
        }
      } else if (motsCles) {
        // A typed query is the user's intent: don't mix in the métier.
        add({ motsCles }, 1);
      }
      if (searches.length === 0) break;

      offres = mergeOffres(
        await Promise.all(searches),
        motsCles ? motsCles.split(',') : [],
      );
      used = zone;
      if (offres.length >= MIN_RESULTS) break;
    }

    return {
      metier: { codeRome, titre },
      motsCles,
      zone: {
        niveau: used.niveau,
        libelle: used.location?.label ?? 'France entière',
      },
      offres,
      voirPlusUrl: websiteSearchUrl(
        motsCles ?? titre,
        used.location
          ? { type: used.location.type, code: used.location.code }
          : null,
      ),
    };
  }

  async getOffre(id: string): Promise<OffreDetail> {
    if (!/^[A-Za-z0-9]{3,20}$/.test(id)) {
      throw new NotFoundException('Offre introuvable');
    }
    const raw = await this.cached(`offre:${id}`, () =>
      this.request<FtRawOffre>(`/${id}`),
    );
    if (!raw) throw new NotFoundException('Offre introuvable ou expirée');
    return toOffreDetail(raw);
  }

  private async search(query: Record<string, string>): Promise<OffreSummary[]> {
    const params = new URLSearchParams({
      ...query,
      range: `0-${PAGE_SIZE - 1}`,
      sort: '1', // date de création décroissante
    });
    const data = await this.cached(`search:${params.toString()}`, () =>
      this.request<{ resultats?: FtRawOffre[] }>(
        `/search?${params.toString()}`,
      ),
    );
    return (data?.resultats ?? []).map(toOffreSummary);
  }

  /** GET on the offers API; 204 (no result) and 404 return null. */
  private async request<T>(path: string): Promise<T | null> {
    const token = await this.ftService.getToken(OFFRES_SCOPE);
    const res = await fetch(`${OFFRES_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (res.status === 204 || res.status === 404) return null;
    if (!res.ok) {
      const body = await res.text();
      this.logger.warn(
        `Offres API ${res.status} on ${path}: ${body.slice(0, 200)}`,
      );
      throw new BadGatewayException(
        'Le service d’offres France Travail est momentanément indisponible',
      );
    }
    return (await res.json()) as T;
  }

  /** City name → INSEE commune + département (geo.api.gouv.fr, no auth). */
  private async resolveCommune(
    city: string,
  ): Promise<{ commune: Location; departement: Location } | null> {
    // "Lyon (69)" or "Paris 11e" → "Lyon" / "Paris".
    const name = city
      .replace(/\(.*?\)/g, '')
      .replace(/\d.*$/, '')
      .trim();
    if (!name) return null;
    try {
      const results = await this.cached(
        `geo:${name.toLowerCase()}`,
        async (): Promise<GeoCommune[]> => {
          const res = await fetch(
            `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(name)}&fields=code,nom,codeDepartement&boost=population&limit=1`,
          );
          return res.ok ? ((await res.json()) as GeoCommune[]) : [];
        },
      );
      const match = results[0];
      if (!match?.code) return null;
      return {
        commune: { type: 'commune', code: match.code, label: match.nom },
        departement: {
          type: 'departement',
          code: match.codeDepartement,
          label: `Département ${match.codeDepartement}`,
        },
      };
    } catch (error) {
      this.logger.warn(`Commune lookup failed for "${name}": ${String(error)}`);
      return null;
    }
  }

  private async loadRome(
    codeRome: string | null,
  ): Promise<RomeMetierData | null> {
    if (!codeRome) return null;
    const { data } = await this.supabase
      .from('rome_metiers')
      .select('data')
      .eq('code', codeRome)
      .maybeSingle<{ data: RomeMetierData }>();
    return data?.data ?? null;
  }

  private async loadProfile(userId: string) {
    const { data, error } = await this.supabase
      .from('user_profiles')
      .select(
        'selected_metier_id, selected_metier_titre, cv_identity, diagnostic_vie_data',
      )
      .eq('id', userId)
      .maybeSingle<{
        selected_metier_id: string | null;
        selected_metier_titre: string | null;
        cv_identity: { city?: string } | null;
        diagnostic_vie_data: { city?: string } | null;
      }>();
    if (error || !data) throw new NotFoundException('Profile not found');
    return data;
  }

  /** Short in-memory cache: offers move daily, the API is rate limited. */
  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;
    const value = await load();
    this.cache.set(key, { at: Date.now(), value });
    if (this.cache.size > 500) {
      // Maps iterate in insertion order: drop the oldest entry.
      const [oldest] = this.cache.keys();
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    return value;
  }
}
