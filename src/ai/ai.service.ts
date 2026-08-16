import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

export interface PortraitDeForce {
  signature: string;
  portrait: string;
  savoirFaire: string[];
  savoirEtre: string[];
  message: string;
}

export interface PlanActionMetier {
  code: string;
  title: string;
  why: string;
  matchScore: number;
  matchLabel: string;
}

export interface PlanActionResult {
  metiers: PlanActionMetier[];
  generatedAt: string;
}

export interface EvaluationResult {
  sortie:
    'candidaterMaintenant' | 'candidaterEtRenforcer' | 'formationNecessaire';
  messagePersonnalise: string;
  pointsForts: { label: string }[];
  renforcement?: {
    element: string;
    raison: string;
    duree: string;
  };
  formationObligatoire: boolean;
  elementsManquants?: string[];
}

const ROME_GRANDDOMAINE_CODES = new Set([
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
]);

@Injectable()
export class AiService {
  private supabase: SupabaseClient;
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async generatePortrait(userId: string): Promise<PortraitDeForce> {
    // 1. Fetch diagnostic data
    const { data: profile, error } = await this.supabase
      .from('user_profiles')
      .select('diagnostic_vie_data, diagnostic_pro_data')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      throw new NotFoundException('Profile not found');
    }

    const { diagnostic_vie_data: vie, diagnostic_pro_data: pro } = profile;

    if (!vie || !pro) {
      throw new NotFoundException('Diagnostics not completed');
    }

    // 2. Generate portrait via OpenAI
    const prompt = this.buildPortraitPrompt(vie, pro);

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.75,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Tu es NAYHA, une conseillère en insertion professionnelle profondément bienveillante. Tu t'adresses à une femme qui vient de te confier ses expériences de vie et son parcours. Ce Portrait de Force est peut-être la première fois que quelqu'un reconnaît officiellement la valeur de ce qu'elle a accompli.

# TON RÔLE
Transformer chaque expérience de vie — parentalité, bénévolat, aidance, gestion du foyer, épreuves surmontées — en compétences professionnelles légitimes et nommées. Ces expériences NE SONT PAS un entraînement, un "terrain d'apprentissage" ou une préparation. Elles SONT le travail. Nomme-les comme tel.

# RÈGLES ABSOLUES
- TUTOIEMENT OBLIGATOIRE partout. Jamais "elle", "Salomé incarne", "cette personne". Toujours "tu as", "tu sais".
- Parle À elle, pas D'elle. C'est une lettre, pas un rapport RH.
- INTERDITS : jargon corporate ("champ d'entraînement", "soft skills", "levier", "valoriser ses acquis"), phrases creuses ("continue comme ça", "suis ta passion"), clichés motivationnels, adjectifs de flatterie vide ("avec brio", "hors pair", "éclatante", "remarquable"). Dire "tu as fait X" est plus puissant que "tu as fait X avec brio". Les faits parlent d'eux-mêmes.
- Chaque savoir-faire DOIT être ancré dans un fait précis qu'elle a mentionné. Si elle n'a pas mentionné de négociation, ne mets pas "négociation".
- Le portrait doit provoquer un "c'est vrai, j'ai fait tout ça" — pas un "c'est gentil mais c'est pas moi".

# FORMAT JSON (strict)
{
  "signature": "Son identité professionnelle en 2-4 mots. Pas un intitulé de poste (pas 'Coordinatrice Sociale'). Un titre qui capture son énergie unique. Exemples du bon registre : 'Architecte du collectif', 'Pilote de l'invisible', 'Manager du quotidien', 'Tisseuse de liens'.",

  "portrait": "2 paragraphes, 120-180 mots au total. Paragraphe 1 : reprends ses expériences concrètes (foyer, aidance, bénévolat, emplois) et nomme les compétences pro exactes qu'elles représentent. Utilise SES mots, SES situations. Paragraphe 2 : fais le lien entre ce qu'elle a fait et ce qu'elle veut faire — montre que le chemin est déjà tracé par ce qu'elle a vécu. Sépare les paragraphes avec \\n\\n. Ton : chaleureux, direct, factuel. Pas de flatterie vide — des faits reformulés avec reconnaissance.",

  "savoirFaire": "7 à 10 compétences concrètes. Chacune doit être spécifique et traçable à une expérience qu'elle a décrite. Format : verbe d'action + contexte précis. BON : 'Coordination d'un déménagement familial complet (logement, écoles, médecins)'. MAUVAIS : 'Gestion de projet'. BON : 'Gestion budgétaire au centime près sur 12 mois de crise'. MAUVAIS : 'Budgétisation'.",

  "savoirEtre": "5 à 8 qualités. Chacune doit être déductible d'un fait concret du diagnostic. Si elle a dit qu'elle calme les situations tendues → 'Sang-froid'. Si elle a tout pris en charge seule → 'Endurance sous pression'. Pas de qualité inventée ou générique.",

  "message": "2-3 phrases max. Personnel et spécifique. Reprends UN détail précis de son diagnostic pour montrer que tu as vraiment lu. Termine sur une phrase tournée vers l'avenir qui reprend SES propres mots sur ce qu'elle veut (sa vision, son métier rêvé, ses conditions). INTERDIT de terminer par des phrases génériques type 'le monde a besoin de toi' ou 'le secteur X a besoin de personnes comme toi'. Ton : comme une grande sœur bienveillante qui dit la vérité, pas comme un coach LinkedIn."
}`,
        },
        { role: 'user', content: prompt },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI returned empty response');
    }

    const portrait: PortraitDeForce = JSON.parse(content);

    // 3. Save to profile
    await this.supabase
      .from('user_profiles')
      .update({ portrait_data: portrait })
      .eq('id', userId);

    return portrait;
  }

  async getPortrait(userId: string): Promise<PortraitDeForce | null> {
    const { data, error } = await this.supabase
      .from('user_profiles')
      .select('portrait_data')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) return null;
    return data.portrait_data ?? null;
  }

  // ─── Plan d'Action ───────────────────────────────────────────

  async generatePlanAction(
    userId: string,
    requestedGranddomaines?: string[],
  ): Promise<PlanActionResult> {
    // 1. Fetch diagnostic data
    const { data: profile, error } = await this.supabase
      .from('user_profiles')
      .select('diagnostic_vie_data, diagnostic_pro_data')
      .eq('id', userId)
      .single();

    if (error || !profile) throw new NotFoundException('Profile not found');

    const { diagnostic_vie_data: vie, diagnostic_pro_data: pro } = profile;
    if (!vie || !pro) throw new NotFoundException('Diagnostics not completed');

    const hasRequestedGranddomaines = requestedGranddomaines !== undefined;
    const granddomaines = hasRequestedGranddomaines
      ? this.validateGranddomaines(requestedGranddomaines)
      : await this.pickGranddomaines(vie, pro);

    const result = await this.scoreMetiersForGranddomaines(
      vie,
      pro,
      granddomaines,
      hasRequestedGranddomaines,
    );

    if (!hasRequestedGranddomaines) {
      await this.supabase
        .from('user_profiles')
        .update({ plan_action_data: result })
        .eq('id', userId);
    }

    return result;
  }

  async getPlanAction(userId: string): Promise<PlanActionResult | null> {
    const { data, error } = await this.supabase
      .from('user_profiles')
      .select('plan_action_data')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) return null;
    return data.plan_action_data ?? null;
  }

  // ─── Évaluation d'adéquation ────────────────────────────────

  async evaluateAdequation(
    userId: string,
    metierId: string,
  ): Promise<EvaluationResult> {
    // 1. Fetch user profile (diagnostics + portrait)
    const { data: profile, error: profileError } = await this.supabase
      .from('user_profiles')
      .select('diagnostic_vie_data, diagnostic_pro_data, portrait_data')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      throw new NotFoundException('Profile not found');
    }

    const { diagnostic_vie_data: vie, diagnostic_pro_data: pro } = profile;
    if (!vie || !pro) {
      throw new NotFoundException('Diagnostics not completed');
    }

    // 2. Fetch ROME métier + fiche data
    const [metierResult, ficheResult] = await Promise.all([
      this.supabase
        .from('rome_metiers')
        .select('data')
        .eq('code', metierId)
        .single(),
      this.supabase
        .from('rome_fiches_metiers')
        .select('data')
        .eq('code', metierId)
        .single(),
    ]);

    if (metierResult.error || !metierResult.data) {
      throw new NotFoundException(`Métier ${metierId} not found`);
    }

    const metier = metierResult.data.data;
    const fiche = ficheResult.data?.data;

    // 3. Build job requirements summary
    const jobContext = this.buildJobContext(metier, fiche);
    const diagnosticContext = this.buildDiagnosticContext(vie, pro);

    // Include portrait if available
    const portraitContext = profile.portrait_data
      ? `\n=== PORTRAIT DE FORCE (généré par NAYHA) ===
Signature : ${profile.portrait_data.signature}
Savoir-faire : ${(profile.portrait_data.savoirFaire || []).join(', ')}
Savoir-être : ${(profile.portrait_data.savoirEtre || []).join(', ')}`
      : '';

    // 4. AI evaluation
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.5,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Tu es NAYHA, une conseillère en insertion professionnelle. Tu compares le profil réel d'une femme avec les exigences d'un métier ROME.

# PRINCIPE ABSOLU
NAYHA ne dit JAMAIS qu'elle ne peut pas postuler. Il y a TOUJOURS une possibilité. Tu choisis l'une des 3 sorties.

# LES 3 SORTIES (choisis UNE seule)

## SORTIE 1 : "candidaterMaintenant"
Son profil correspond. Elle a les compétences clés, et l'accès au métier ne requiert pas de diplôme obligatoire qu'elle n'a pas.
→ Liste ses points forts (3-5 éléments concrets tirés de son profil qui matchent les compétences du métier)
→ Message personnalisé expliquant pourquoi elle est légitime

## SORTIE 2 : "candidaterEtRenforcer"
Elle a les bases mais un élément revient dans les offres qu'elle pourrait renforcer. Ce n'est PAS bloquant — elle peut candidater maintenant ET se former en parallèle.
→ Liste ses points forts (3-4 éléments)
→ Liste 1 à 3 éléments manquants ou à renforcer (formation optionnelle, outil, compétence particulière)
→ UN renforcement suggéré (élément + raison + durée estimée)
→ Message personnalisé

## SORTIE 3 : "formationNecessaire"
UNIQUEMENT si l'accès au métier mentionne un diplôme ou une condition OBLIGATOIRE pour exercer (emploi réglementé, diplôme d'État, agrément obligatoire). Si c'est juste "recommandé" ou "souhaité", c'est sortie 1 ou 2, PAS sortie 3.
→ formationObligatoire = true si c'est légalement obligatoire
→ Message encourageant, pas décourageant
→ Liste ce qui ne change pas (ses compétences restent valides)

# RÈGLES
- Tutoiement obligatoire
- Chaque point fort DOIT être ancré dans un fait du profil ET correspondre à une compétence du métier
- Le renforcement (sortie 2) doit être précis : quel outil/compétence, pourquoi, combien de temps
- Si une formation est optionnelle ou si seules des compétences particulières manquent, choisis sortie 2 et remplis "elementsManquants". Ne choisis pas sortie 3.
- Ne mets JAMAIS sortie 3 pour un métier non réglementé
- Vérifie le champ "accesEmploi" : s'il dit "obligatoire pour exercer" → sortie 3. Sinon → sortie 1 ou 2.

# FORMAT JSON (strict)
{
  "sortie": "candidaterMaintenant" | "candidaterEtRenforcer" | "formationNecessaire",
  "messagePersonnalise": "2-3 phrases personnalisées, tutoiement, ancrées dans son profil",
  "pointsForts": [
    { "label": "Compétence ancrée dans son vécu" }
  ],
  "renforcement": {
    "element": "Nom de la compétence/outil à renforcer",
    "raison": "Pourquoi — cet élément revient dans les offres",
    "duree": "Durée estimée (ex: '2-3 semaines en autoformation')"
  },
  "formationObligatoire": false,
  "elementsManquants": ["Élément manquant ou à renforcer"]
}

Note : "renforcement" est null pour sortie 1 et sortie 3. "elementsManquants" est vide pour sortie 1 et contient 1 à 3 éléments pour sortie 2. "pointsForts" contient 3-5 éléments.`,
        },
        {
          role: 'user',
          content: `${diagnosticContext}${portraitContext}

${jobContext}

Compare ce profil avec les exigences du métier. Quelle sortie ?`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('OpenAI returned empty response');

    const parsed = JSON.parse(content);

    const result: EvaluationResult = {
      sortie: parsed.sortie,
      messagePersonnalise: parsed.messagePersonnalise || '',
      pointsForts: (parsed.pointsForts || []).map((p: any) => ({
        label: typeof p === 'string' ? p : p.label || '',
      })),
      formationObligatoire: parsed.formationObligatoire ?? false,
      elementsManquants: Array.isArray(parsed.elementsManquants)
        ? parsed.elementsManquants.filter(
            (item: any) => typeof item === 'string' && item.trim(),
          )
        : [],
    };

    if (parsed.renforcement && parsed.sortie === 'candidaterEtRenforcer') {
      result.renforcement = {
        element: parsed.renforcement.element || '',
        raison: parsed.renforcement.raison || '',
        duree: parsed.renforcement.duree || '',
      };
    }

    return result;
  }

  private buildJobContext(
    metier: Record<string, any>,
    fiche: Record<string, any> | null,
  ): string {
    const competences: string[] = [];
    if (fiche?.groupesCompetencesMobilisees) {
      for (const group of fiche.groupesCompetencesMobilisees) {
        const enjeu = group.enjeu?.libelle || '';
        for (const c of group.competences || []) {
          competences.push(`${c.libelle} (${enjeu})`);
        }
      }
    }

    return `=== MÉTIER VISÉ ===
Titre : ${metier.libelle}
Code ROME : ${metier.code}
Définition : ${metier.definition || 'N/A'}

Accès au métier : ${metier.accesEmploi || 'N/A'}

Compétences requises (${competences.length}) :
${competences
  .slice(0, 30)
  .map((c) => `- ${c}`)
  .join('\n')}

Formacodes : ${(metier.formacodes || []).map((f: any) => f.libelle || f).join(', ') || 'N/A'}`;
  }

  private async scoreMetiersForGranddomaines(
    vie: Record<string, any>,
    pro: Record<string, any>,
    granddomaines: string[],
    isAlternative = false,
  ): Promise<PlanActionResult> {
    // 1. Fetch métiers with full data
    const { data: metiers, error: metiersError } = await this.supabase
      .from('rome_metiers')
      .select('code, data')
      .or(granddomaines.map((code) => `code.ilike.${code}%`).join(','));

    if (metiersError) throw new Error(metiersError.message);
    if (!metiers?.length) {
      throw new NotFoundException('No métiers found for selected domains');
    }

    let candidates: typeof metiers;

    if (isAlternative) {
      // User explicitly chose this domain — skip keyword pre-filter.
      // Send all métiers (capped) so GPT can find transferable-skill matches.
      candidates = metiers.slice(0, 80);
    } else {
      // AI-picked domains — use keyword relevance to narrow pool
      const userKeywords = this.extractKeywords(vie, pro);
      const userRiasec = this.extractUserRiasec(vie, pro);

      const scored = metiers.map((m) => {
        const target = [m.data.libelle || '', m.data.definition || '']
          .join(' ')
          .toLowerCase();

        let relevance = 0;
        for (const kw of userKeywords) {
          if (target.includes(kw)) relevance++;
        }

        let riasecBonus = 0;
        if (userRiasec.includes(m.data.riasecMajeur)) riasecBonus += 0.3;
        if (userRiasec.includes(m.data.riasecMineur)) riasecBonus += 0.2;

        return { ...m, _score: relevance + riasecBonus };
      });

      scored.sort((a, b) => b._score - a._score);
      candidates = scored.slice(0, 50);
    }

    // 3. Build enriched list for GPT
    const enrichedList = candidates
      .map((m) => {
        const def = m.data.definition
          ? (m.data.definition as string).split('\n')[0].slice(0, 120)
          : '';
        const acces = m.data.accesEmploi
          ? (m.data.accesEmploi as string).split('\n')[0].slice(0, 100)
          : '';
        const riasec =
          [m.data.riasecMajeur, m.data.riasecMineur]
            .filter(Boolean)
            .join('/') || '';
        return `${m.code}|${m.data.libelle}|${def}|${riasec}|${acces}`;
      })
      .join('\n');

    const diagnosticContext = this.buildDiagnosticContext(vie, pro);

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.6,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Tu es NAYHA, une conseillère en insertion professionnelle. Tu analyses le profil d'une femme et tu sélectionnes les 3 métiers les plus adaptés à partir d'une liste ROME 4.0.

Chaque métier dans la liste contient : CODE|TITRE|DÉFINITION|RIASEC|ACCÈS EMPLOI
Utilise la DÉFINITION pour comprendre ce que le métier implique concrètement.
Utilise ACCÈS EMPLOI pour vérifier qu'elle peut y accéder avec son parcours.
Utilise RIASEC pour vérifier la compatibilité de personnalité (S=Social, I=Investigateur, A=Artiste, R=Réaliste, E=Entreprenant, C=Conventionnel).

# PROCESSUS DE SÉLECTION (suis ces étapes dans l'ordre)

## ÉTAPE 1 : ÉLIMINATION (dealbreakers)
Lis la section "CE QUI COMPTE" du profil. Pour CHAQUE métier candidat, vérifie :
- La DÉFINITION du métier implique-t-elle des astreintes, du on-call, ou du travail de nuit ? → Si elle refuse ça, ÉLIMINE.
- La DÉFINITION implique-t-elle du présentiel 5j/5 en open space ? → Si elle refuse ça, ÉLIMINE.
- Ce métier est-il identique ou quasi-identique à son ancien poste qu'elle a quitté (burnout, démission) ? → ÉLIMINE.
- L'ACCÈS EMPLOI exige-t-il un diplôme ou une formation qu'elle n'a clairement pas et ne peut pas obtenir ? → ÉLIMINE.
Un métier éliminé NE PEUT PAS apparaître dans les 3 résultats.

## ÉTAPE 2 : CLASSEMENT (parmi les métiers non éliminés)
Classe les métiers restants selon :
1. **VISION & ASPIRATIONS** (50%) — Le métier va-t-il VERS ce qu'elle veut devenir ? Sa vision, sa journée idéale, son rêve.
2. **COMPÉTENCES TRANSFÉRABLES** (50%) — Ses savoir-faire passés sont-ils un pont crédible vers ce métier ? Le métier doit s'appuyer sur son domaine d'expertise, mais représenter une ÉVOLUTION.

## ÉTAPE 3 : VÉRIFICATION FINALE
- Les bifurcations s'appuient sur ses compétences techniques principales ? (pas de métier sans lien avec son expertise)
- Les 3 scores sont différenciés ? (pas tous au même niveau)
- Aucun métier n'est son ancien poste déguisé ?
- Elle peut réalistement accéder à ce métier ? (vérifie ACCÈS EMPLOI vs son parcours)

# RÈGLES DE FORMAT
- Le "code" et le "title" DOIVENT provenir EXACTEMENT de la liste MÉTIERS DISPONIBLES. Copie le code et le libellé tels quels. INTERDIT d'inventer ou reformuler un titre.
- Tutoiement obligatoire dans les justifications ("Ton écoute...", "Tu sais...")
- Chaque "why" doit citer un fait précis du diagnostic ET expliquer en quoi ce métier répond à sa vision ou à ses conditions idéales
- Pas de jargon corporate, pas de flatterie vide

# FORMAT JSON (strict)
{
  "metiers": [
    {
      "code": "CODE_ROME exact de la liste",
      "title": "Libellé EXACT copié de la liste (ne pas modifier)",
      "why": "1-2 phrases personnalisées : pourquoi ce métier correspond à ce qu'elle VEUT devenir, ancré dans ses réponses.",
      "matchScore": 85
    }
  ]
}

Retourne exactement 3 métiers, triés par matchScore décroissant.`,
        },
        {
          role: 'user',
          content: `${diagnosticContext}

=== MÉTIERS DISPONIBLES (CODE|TITRE|DÉFINITION|RIASEC|ACCÈS) ===
${enrichedList}

Choisis les 3 métiers les plus adaptés à son profil ET à ses aspirations. Rappel : lis la DÉFINITION de chaque métier, vérifie l'ACCÈS EMPLOI, et regarde sa vision et ses refus AVANT de choisir.`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('OpenAI returned empty response');

    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed.metiers) || parsed.metiers.length === 0) {
      throw new Error('OpenAI returned no métiers');
    }

    // Validate codes + titles against actual DB data
    const validCodes = new Map(
      candidates.map((m) => [m.code, m.data.libelle as string]),
    );

    const validatedMetiers = parsed.metiers
      .filter((m: PlanActionMetier) => validCodes.has(m.code))
      .slice(0, 3)
      .map((m: PlanActionMetier) => {
        const score = Math.max(0, Math.min(100, Number(m.matchScore) || 0));
        return {
          ...m,
          title: validCodes.get(m.code) ?? m.title, // Force DB title
          matchScore: score,
          matchLabel: this.qualifyMatch(score),
        };
      });

    if (validatedMetiers.length === 0) {
      throw new Error('OpenAI returned no valid ROME codes');
    }

    const result: PlanActionResult = {
      metiers: validatedMetiers,
      generatedAt: new Date().toISOString(),
    };

    return result;
  }

  private async pickGranddomaines(
    vie: Record<string, any>,
    pro: Record<string, any>,
  ): Promise<string[]> {
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Tu es un expert en orientation professionnelle. Analyse le profil et sélectionne les 3 grands domaines ROME les plus pertinents.

# IMPORTANT
- Choisis les domaines en fonction de ce qu'elle VEUT DEVENIR, pas seulement de ce qu'elle a fait.
- Si elle a quitté un secteur (burnout, démission), ne choisis pas uniquement ce même secteur. Inclus au moins un domaine qui correspond à sa VISION ou à ses aspirations nouvelles.
- Prends en compte ses dealbreakers pour éviter les domaines incompatibles.

Les 14 grands domaines ROME :
A - Agriculture et pêche, espaces naturels et espaces verts, soins aux animaux
B - Arts et façonnage d'ouvrages d'art
C - Banque, assurance, immobilier
D - Commerce, vente et grande distribution
E - Communication, média et multimédia
F - Construction, bâtiment et travaux publics
G - Hôtellerie-restauration, tourisme, loisirs et animation
H - Industrie
I - Installation et maintenance
J - Santé
K - Services à la personne et à la collectivité
L - Spectacle
M - Support à l'entreprise
N - Transport et logistique

Réponds en JSON : { "codes": ["K", "M", "J"] }`,
        },
        {
          role: 'user',
          content: `Profil :
- Formation : ${this.safe(pro.educationLevel)}, domaines : ${this.safe(pro.educationDomains)}
- Expériences : "${this.safe(pro.workExperiences)}"
- Ce qui donne de l'énergie : "${this.safe(pro.energySources)}"
- Ce qu'elle refuse : "${this.safe(pro.dealbreakers)}"
- Conditions idéales : ${this.safe(pro.idealConditions)}
- Vision / rêve : "${this.safe(vie.vision)}"
- Journée idéale : "${this.safe(pro.idealDayVision)}"
- Rôles actuels : ${this.safe(vie.roles)}
- Situation : ${this.safe(vie.situation)}

Quels 3 grands domaines ROME correspondent le mieux à ce qu'elle VEUT devenir ?`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('OpenAI returned empty response');

    const parsed = JSON.parse(content);
    return this.validateGranddomaines(parsed.codes);
  }

  private validateGranddomaines(granddomaines: string[]): string[] {
    if (!Array.isArray(granddomaines) || granddomaines.length === 0) {
      throw new BadRequestException('granddomaines must be a non-empty array');
    }

    const codes = [
      ...new Set(
        granddomaines.map((code) =>
          typeof code === 'string' ? code.trim().toUpperCase() : '',
        ),
      ),
    ].filter((code) => code.length > 0);
    if (codes.length === 0) {
      throw new BadRequestException('granddomaines must contain valid codes');
    }

    // Accept both granddomaine letters (M) and sub-domain prefixes (M18, M15)
    const invalidCodes = codes.filter(
      (code) => !ROME_GRANDDOMAINE_CODES.has(code[0]),
    );
    if (invalidCodes.length > 0) {
      throw new BadRequestException(
        `Invalid ROME granddomaines: ${invalidCodes.join(', ')}`,
      );
    }

    return codes;
  }

  private safe(value: any, fallback = 'Non renseigné'): string {
    if (value == null || value === '') return fallback;
    return Array.isArray(value) ? value.join(', ') : String(value);
  }

  private buildDiagnosticContext(
    vie: Record<string, any>,
    pro: Record<string, any>,
  ): string {
    return `=== PROFIL ===
Prénom : ${this.safe(vie.name)}
Âge : ${this.safe(vie.age)} ans
Situation : ${this.safe(vie.situation)}
Rôles : ${this.safe(vie.roles)}

=== PARCOURS ===
Niveau d'études : ${this.safe(pro.educationLevel)}
Domaines : ${this.safe(pro.educationDomains)}
Expériences : "${this.safe(pro.workExperiences)}"

=== CE QUI COMPTE ===
Énergie : "${this.safe(pro.energySources)}"
Refus : "${this.safe(pro.dealbreakers)}"
Conditions idéales : ${this.safe(pro.idealConditions)}
Journée idéale : "${this.safe(pro.idealDayVision)}"

=== SA VISION ===
"${this.safe(vie.vision)}"

=== SES FORCES ===
Réussite cachée : "${this.safe(vie.hiddenSuccess)}"
Force naturelle : "${this.safe(vie.naturalStrength)}"
Défi surmonté : "${this.safe(vie.overcomeChallenge)}"`;
  }

  private static readonly STOP_WORDS = new Set([
    'le',
    'la',
    'les',
    'de',
    'du',
    'des',
    'un',
    'une',
    'et',
    'en',
    'dans',
    'pour',
    'par',
    'sur',
    'avec',
    'est',
    'sont',
    'ses',
    'son',
    'qui',
    'que',
    'ce',
    'cette',
    'au',
    'aux',
    'ne',
    'pas',
    'plus',
    'elle',
    'je',
    'tu',
    'on',
    'nous',
    'vous',
    'ils',
    'se',
    'sa',
    'leur',
    'même',
    'aussi',
    'très',
    'bien',
    'tout',
    'tous',
    'mais',
    'car',
    'donc',
    'comme',
    'dont',
    'mon',
    'mes',
    'été',
    'fait',
    'être',
    'avoir',
    'faire',
    'ces',
    'ans',
    'non',
    'oui',
    'peu',
    'sans',
    'sous',
    'chez',
    'lors',
    'après',
    'avant',
    'entre',
    'vers',
    'quel',
    'quoi',
    'comment',
    'peut',
    'faut',
    'voir',
    'mise',
    'jour',
    'lieu',
    'deux',
    'trois',
    'quatre',
    'cinq',
    'puis',
    'toute',
    'autre',
    'autres',
    'chaque',
    'notre',
    'votre',
    'leurs',
    'mois',
    'site',
    'projet',
    'travail',
    'métier',
    'poste',
    'niveau',
    'renseigné',
  ]);

  /**
   * Extract meaningful keywords from user diagnostic for relevance matching.
   * Used to score métier definitions by domain overlap.
   */
  private extractKeywords(
    vie: Record<string, any>,
    pro: Record<string, any>,
  ): string[] {
    const userText = [
      this.safe(pro.workExperiences),
      this.safe(vie.vision),
      this.safe(pro.energySources),
      this.safe(pro.idealDayVision),
      this.safe(pro.educationDomains),
      this.safe(vie.naturalStrength),
      this.safe(vie.hiddenSuccess),
    ].join(' ');

    return [
      ...new Set(
        userText
          .toLowerCase()
          .replace(/[^a-zàâäéèêëïîôùûüÿç\s'-]/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length > 3 && !AiService.STOP_WORDS.has(w)),
      ),
    ];
  }

  /**
   * Extract likely RIASEC codes from diagnostic answers.
   * Maps user interests/energy sources to RIASEC dimensions.
   */
  private extractUserRiasec(
    vie: Record<string, any>,
    pro: Record<string, any>,
  ): string[] {
    const codes = new Set<string>();
    const text = [
      this.safe(pro.energySources),
      this.safe(pro.idealDayVision),
      this.safe(vie.vision),
      this.safe(pro.workExperiences),
      this.safe(vie.naturalStrength),
    ]
      .join(' ')
      .toLowerCase();

    // Social (S) — helping, teaching, caring, accompagner
    if (
      /enseign|form|accompagn|aide|soin|social|écoute|transmettre|coach|mentor|pédagog/i.test(
        text,
      )
    )
      codes.add('S');
    // Investigateur (I) — research, analyze, tech, data
    if (
      /analys|recherch|développ|tech|données|code|programm|ingénier|scientif/i.test(
        text,
      )
    )
      codes.add('I');
    // Artiste (A) — creative, design, write, art
    if (
      /créat|design|écri|artist|cultur|communic|média|graphi|photo|vidéo/i.test(
        text,
      )
    )
      codes.add('A');
    // Entreprenant (E) — lead, manage, entrepreneurial
    if (
      /diriger|manage|entrepren|leader|négoci|vend|commerce|pilot|stratég/i.test(
        text,
      )
    )
      codes.add('E');
    // Conventionnel (C) — organize, admin, structure
    if (
      /organis|admin|gest|compta|budget|planifi|procédure|rigeur|structur/i.test(
        text,
      )
    )
      codes.add('C');
    // Réaliste (R) — build, hands-on, physical
    if (
      /construi|fabriqu|réparer|terrain|pratiqu|manuel|technique|logistiq/i.test(
        text,
      )
    )
      codes.add('R');

    return [...codes];
  }

  private qualifyMatch(score: number): string {
    if (score >= 85) return 'Très forte correspondance avec ton profil';
    if (score >= 70) return 'Forte correspondance';
    return 'Bonne correspondance';
  }

  private buildPortraitPrompt(
    vie: Record<string, any>,
    pro: Record<string, any>,
  ): string {
    return `Voici ce que ${vie.name} a partagé durant son diagnostic. Chaque réponse est précieuse — c'est SA vérité, SES mots. Ton portrait doit s'ancrer dans ces faits précis.

=== QUI EST-ELLE ===
Prénom : ${vie.name}
Âge : ${vie.age} ans
Ville : ${vie.city}
Situation actuelle : ${vie.situation}
Rôles qu'elle tient au quotidien : ${Array.isArray(vie.roles) ? vie.roles.join(', ') : vie.roles}

=== CE QU'ELLE A ACCOMPLI (ses mots) ===
Sa réussite (même cachée) : "${vie.hiddenSuccess}"
Sa force naturelle : "${vie.naturalStrength}"
Un défi qu'elle a surmonté : "${vie.overcomeChallenge}"

=== SON PARCOURS PRO ===
Niveau d'études : ${pro.educationLevel}
Domaines : ${Array.isArray(pro.educationDomains) ? pro.educationDomains.join(', ') : pro.educationDomains}
Expériences : "${pro.workExperiences}"

=== CE QUI COMPTE POUR ELLE ===
Ce qui lui donne de l'énergie : "${pro.energySources}"
Ce qu'elle refuse au travail : "${pro.dealbreakers}"
Conditions idéales : ${Array.isArray(pro.idealConditions) ? pro.idealConditions.join(', ') : pro.idealConditions}
Sa journée idéale : "${pro.idealDayVision}"

=== SA VISION ===
Ce qu'elle veut pour la suite : "${vie.vision}"

Génère son Portrait de Force. Rappel : tutoie-la, ancre chaque compétence dans un fait ci-dessus, pas de généralités.`;
  }
}
