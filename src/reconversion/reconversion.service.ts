import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AiService, EvaluationResult } from '../ai/ai.service';

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

type FormationSource = 'koumoul' | 'supabase';

interface KoumoulPage {
  next?: string;
  results?: Record<string, unknown>[];
}

export interface FormationPage {
  source: FormationSource;
  results: Record<string, unknown>[];
  nextCursor: string | null;
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
  private readonly supabase: SupabaseClient;
  private static readonly formationsPageSize = 10;
  private static readonly koumoulFormationsUrl =
    'https://opendata.koumoul.com/data-fair/api/v1/datasets/competences-rncp/lines';

  constructor(
    configService: ConfigService,
    private readonly aiService: AiService,
  ) {
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
    const storedJourney = this.readJourney(
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
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Returns a stable, app-facing page of RNCP certifications.
   *
   * The cursor remains opaque to the app.  Koumoul supplies it in `next`,
   * while the Supabase fallback uses its offset as a cursor. Both sources
   * always return pages of ten records.
   */
  async getFormationsByRome(
    rawCodeRome: string,
    options: { after?: string; source?: string } = {},
  ): Promise<FormationPage> {
    const codeRome = this.normalizeCodeRome(rawCodeRome);
    const requestedSource = this.parseFormationSource(options.source);

    if (requestedSource === 'supabase') {
      return this.getSupabaseFormationPage(codeRome, options.after);
    }

    const koumoulPage = await this.getKoumoulFormationPage(
      codeRome,
      options.after,
    );
    if (koumoulPage.results.length > 0 || requestedSource === 'koumoul') {
      return koumoulPage;
    }

    // Only an explicitly empty Koumoul first page activates the local source.
    // We do not silently replace a later Koumoul page with unrelated records.
    return this.getSupabaseFormationPage(codeRome, options.after);
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

    const response = await fetch(
      `${ReconversionService.koumoulFormationsUrl}?${query.toString()}`,
    );
    if (!response.ok) {
      throw new Error(`Koumoul indisponible (${response.status})`);
    }

    const payload = (await response.json()) as KoumoulPage;
    const results = Array.isArray(payload.results) ? payload.results : [];

    return {
      source: 'koumoul',
      results: results
        .filter((row) => this.isActiveExactRomeMatch(row, codeRome))
        .map((row) => this.koumoulCertificationToFormation(row)),
      nextCursor: this.cursorFromKoumoulNext(payload.next),
    };
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
    const nextOffset = offset + results.length;
    return {
      source: 'supabase',
      results,
      nextCursor:
        count != null && nextOffset < count ? String(nextOffset) : null,
    };
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
      etatFiche: this.text(row['ETAT_FICHE']),
      dateFinEnregistrement: this.text(row['date_fin_enregistrement']),
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
      statistiquesPromotions: row['statistiques_promotions'] ?? null,
    };
  }

  private isActiveExactRomeMatch(
    row: Record<string, unknown>,
    codeRome: string,
  ): boolean {
    const etat = this.text(row['ETAT_FICHE']).toLowerCase();
    return (
      row['ACTIF'] === true &&
      etat.startsWith('publi') &&
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
      etatFiche: this.text(row['etat_libelle']),
      dateFinEnregistrement: this.text(row['date_maj']),
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

  private parseFormationSource(
    raw: string | undefined,
  ): FormationSource | undefined {
    if (raw == null || raw.length === 0) return undefined;
    if (raw === 'koumoul' || raw === 'supabase') return raw;
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

  // Koumoul writes RNCP12345 while CertifInfo stores 12345.  The app only
  // receives the normalized format, making source comparisons deterministic.
  private normalizeRncpCode(raw: unknown): string {
    const value = this.text(raw)
      .replace(/^RNCP\s*/i, '')
      .trim();
    return value.length === 0 ? '' : `RNCP${value}`;
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

    const journey = this.readAllJourneys(profile.reconversion_chemin_journey);
    const updatedAt = new Date().toISOString();
    journey[codeRome] = { prioritePrerequisId: prerequisId.trim(), updatedAt };

    const { error: updateError } = await this.supabase
      .from('user_profiles')
      .update({ reconversion_chemin_journey: journey })
      .eq('id', userId);

    if (updateError) {
      throw new Error(
        `Impossible d’enregistrer la priorité: ${updateError.message}`,
      );
    }

    return { codeRome, prioritePrerequisId: prerequisId.trim(), updatedAt };
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
            : 'Niveau d’accès ou certification fréquemment attendu pour ce métier. À confirmer selon l’employeur et le poste visé.',
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
      ? `ROME — Accès à l’emploi : ${access}`
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
      return 'Maîtriser la conduite d’entretiens et l’analyse de parcours';
    }
    if (normalized.includes('bilan de competences')) {
      return 'Maîtriser la méthodologie du bilan de compétences';
    }
    if (
      normalized.includes('passation de tests') ||
      normalized.includes('outils d evaluation')
    ) {
      return 'Savoir utiliser et interpréter des outils d’évaluation';
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

  private readJourney(value: unknown, codeRome: string) {
    return this.readAllJourneys(value)[codeRome];
  }

  private readAllJourneys(
    value: unknown,
  ): Record<string, { prioritePrerequisId: string; updatedAt: string }> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<
      string,
      { prioritePrerequisId: string; updatedAt: string }
    >;
  }
}
