/**
 * Pure helpers for the France Travail "Offres d'emploi v2" integration.
 * Kept free of Nest/HTTP so they can be unit-tested directly.
 */

/** Subset of the France Travail offer payload that we read. */
export interface FtRawOffre {
  id?: string;
  intitule?: string;
  description?: string;
  dateCreation?: string;
  entreprise?: { nom?: string };
  lieuTravail?: { libelle?: string };
  typeContrat?: string;
  typeContratLibelle?: string;
  dureeTravailLibelleConverti?: string;
  salaire?: { libelle?: string };
  experienceLibelle?: string;
  origineOffre?: { origine?: string | number; urlOrigine?: string };
  romeCode?: string;
  romeLibelle?: string;
  competences?: { libelle?: string }[];
  qualitesProfessionnelles?: { libelle?: string }[];
  formations?: { domaineLibelle?: string }[];
  secteurActiviteLibelle?: string;
  trancheEffectifEtab?: string;
  nombrePostes?: number;
}

export interface OffreSummary {
  id: string;
  intitule: string;
  entreprise: string | null;
  lieu: string | null;
  typeContrat: string | null;
  dureeTravail: string | null;
  salaire: string | null;
  experience: string | null;
  dateCreation: string | null;
  /** First characters of the description, for the list card. */
  extrait: string;
  origine: 'france_travail' | 'partenaire';
  url: string;
}

export interface OffreDetail extends OffreSummary {
  description: string;
  romeCode: string | null;
  romeLibelle: string | null;
  competences: string[];
  qualitesProfessionnelles: string[];
  formations: string[];
  secteur: string | null;
  trancheEffectif: string | null;
  nombrePostes: number | null;
}

/** Generic job words that make an AND keyword search far too strict. */
const GENERIC_WORDS = new Set([
  'agent',
  'agente',
  'assistant',
  'assistante',
  'charge',
  'chargee',
  'chef',
  'conseiller',
  'conseillere',
  'responsable',
  'technicien',
  'technicienne',
  'ingenieur',
  'ingenieure',
  'employe',
  'employee',
  'operateur',
  'operatrice',
  'de',
  'des',
  'du',
  'en',
  'et',
  'la',
  'le',
  'les',
  'au',
  'aux',
  'h/f',
  'f/h',
]);

const stripAccents = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * "Ingénieur / Ingénieure sécurité web" → "sécurité,web".
 * Drops the feminine duplicate and generic job words; the API ANDs keywords,
 * so only the specific ones are kept (max 3).
 */
export function keywordsFromMetier(titre: string): string | null {
  // ROME labels repeat the job in both genders: "X / Xe suffix".
  const singleGender = titre.replace(/^(.+?)\s*\/\s*\S+(.*)$/, '$1$2');
  const words = singleGender
    .split(/[\s,()'’-]+/)
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length >= 3)
    .filter((word) => !GENERIC_WORDS.has(stripAccents(word)));
  const unique = [...new Set(words)].slice(0, 3);
  return unique.length > 0 ? unique.join(',') : null;
}

/** Subset of a stored ROME 4.0 métier (rome_metiers.data). */
export interface RomeMetierData {
  code?: string;
  appellations?: { code?: string; libelle?: string; romeParent?: string }[];
  domaineProfessionnel?: { code?: string };
}

export interface OffresSearchPlan {
  /** Appellation codes matching the user's métier label. */
  appellations: string[];
  /** The métier code plus ROME parents of its appellations. */
  codesRome: string[];
  /** Most specific keyword, searched inside the professional domain. */
  motCle: string | null;
  domaine: string | null;
}

const normalizeLabel = (value: string) =>
  stripAccents(value).toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Turns the user's métier into complementary API searches. A ROME 4.0 code
 * alone can be very narrow (M1833 has 3 offers in France) while its
 * appellation and parent codes carry hundreds.
 */
export function searchPlanFromRome(
  codeRome: string | null,
  titre: string | null,
  rome: RomeMetierData | null,
): OffresSearchPlan {
  const appellations = rome?.appellations ?? [];
  const wanted = titre ? normalizeLabel(titre) : null;
  const matching = appellations.filter(
    (a) => wanted !== null && normalizeLabel(a.libelle ?? '') === wanted,
  );
  const codesRome = new Set<string>();
  if (codeRome) codesRome.add(codeRome);
  for (const a of matching.length > 0 ? matching : appellations) {
    if (a.romeParent && /^[A-Z]\d{4}$/.test(a.romeParent)) {
      codesRome.add(a.romeParent);
    }
  }
  const keywords = titre ? keywordsFromMetier(titre) : null;
  return {
    appellations: matching
      .map((a) => a.code)
      .filter((code): code is string => !!code)
      .slice(0, 3),
    codesRome: [...codesRome].slice(0, 3),
    // The longest keyword is usually the most specific ("soignant" > "aide").
    motCle: keywords
      ? keywords.split(',').reduce((a, b) => (b.length > a.length ? b : a))
      : null,
    domaine: rome?.domaineProfessionnel?.code ?? null,
  };
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function labels<K extends string>(
  list: Partial<Record<K, string>>[] | undefined,
  key: K,
): string[] {
  return (list ?? [])
    .map((item) => text(item?.[key]))
    .filter((item): item is string => item !== null);
}

export function toOffreSummary(raw: FtRawOffre): OffreSummary {
  const description = text(raw.description) ?? '';
  const id = raw.id ?? '';
  return {
    id,
    intitule: text(raw.intitule) ?? 'Offre sans intitulé',
    entreprise: text(raw.entreprise?.nom),
    lieu: text(raw.lieuTravail?.libelle),
    typeContrat: text(raw.typeContratLibelle) ?? text(raw.typeContrat),
    dureeTravail: text(raw.dureeTravailLibelleConverti),
    salaire: text(raw.salaire?.libelle),
    experience: text(raw.experienceLibelle),
    dateCreation: text(raw.dateCreation),
    extrait:
      description.length > 220
        ? `${description.slice(0, 217).trimEnd()}…`
        : description,
    origine:
      String(raw.origineOffre?.origine) === '2'
        ? 'partenaire'
        : 'france_travail',
    url:
      text(raw.origineOffre?.urlOrigine) ??
      `https://candidat.francetravail.fr/offres/recherche/detail/${id}`,
  };
}

export function toOffreDetail(raw: FtRawOffre): OffreDetail {
  return {
    ...toOffreSummary(raw),
    description: text(raw.description) ?? '',
    romeCode: text(raw.romeCode),
    romeLibelle: text(raw.romeLibelle),
    competences: labels(raw.competences, 'libelle'),
    qualitesProfessionnelles: labels(raw.qualitesProfessionnelles, 'libelle'),
    formations: labels(raw.formations, 'domaineLibelle'),
    secteur: text(raw.secteurActiviteLibelle),
    trancheEffectif: text(raw.trancheEffectifEtab),
    nombrePostes:
      typeof raw.nombrePostes === 'number' ? raw.nombrePostes : null,
  };
}

/** Results of one API search and how much a hit from it is worth. */
export interface WeightedResults {
  offres: OffreSummary[];
  weight: number;
}

/**
 * Merges several searches, drops duplicates and ranks by relevance: the sum
 * of the searches that found the offer, plus a bonus when its title contains
 * one of the métier keywords. Newest first among equals.
 */
export function mergeOffres(
  searches: WeightedResults[],
  titleKeywords: string[] = [],
): OffreSummary[] {
  const byId = new Map<string, { offre: OffreSummary; score: number }>();
  for (const { offres, weight } of searches) {
    for (const offre of offres) {
      if (!offre.id) continue;
      const entry = byId.get(offre.id);
      if (entry) entry.score += weight;
      else byId.set(offre.id, { offre, score: weight });
    }
  }
  const keywords = titleKeywords.map((k) => stripAccents(k).toLowerCase());
  for (const entry of byId.values()) {
    const title = stripAccents(entry.offre.intitule).toLowerCase();
    entry.score += keywords.filter((k) => title.includes(k)).length * 2;
  }
  return [...byId.values()]
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.offre.dateCreation ?? '').localeCompare(a.offre.dateCreation ?? ''),
    )
    .map((entry) => entry.offre);
}

/** Same search on candidat.francetravail.fr, for "voir toutes les offres". */
export function websiteSearchUrl(
  motsCles: string | null,
  location: { type: 'commune' | 'departement'; code: string } | null,
): string {
  const params = new URLSearchParams();
  if (motsCles) params.set('motsCles', motsCles.replace(/,/g, ' '));
  if (location) {
    // The website encodes places as "<code><type>": 75D = département 75,
    // 69123 = commune.
    params.set(
      'lieux',
      location.type === 'departement' ? `${location.code}D` : location.code,
    );
  }
  const query = params.toString();
  return `https://candidat.francetravail.fr/offres/recherche${query ? `?${query}` : ''}`;
}
