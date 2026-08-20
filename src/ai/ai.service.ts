import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

export interface PortraitExperience {
  titre: string;
  duree?: string;
  contexte?: string;
  competences: string[];
}

export interface PortraitDeForce {
  signature: string;
  portrait: string;
  savoirFaire: string[];
  savoirEtre: string[];
  savoirFaireTechnique?: string[];
  experiences?: PortraitExperience[];
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
  metierTitre: string;
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
  obligationDetail?: string;
  elementsManquants?: string[];
  lacunes: {
    element: string;
    categorie: 'diplome' | 'competence' | 'qualite' | 'milieu' | 'acces';
    niveau: 'a_developper' | 'a_verifier' | 'obligatoire';
    pourquoi: string;
    prochaineEtape: string;
  }[];
}

export interface OffreDetail {
  entreprise: string;
  poste: string;
  score: string; // "Forte", "Moyenne", "Partielle"
  matchs: string[]; // what matches for THIS specific offer
  lacunes: string[]; // what's missing for THIS specific offer
  conseil: string; // one strategic tip for this offer
}

export interface AnalyseOffresResult {
  scoreGlobal: string;
  motsCles: string[];
  pointsForts: string[];
  aTravailler: string[];
  detailParOffre: OffreDetail[];
  recommandation: string; // which offer to prioritize and why
}

export interface LinkedinProfileResult {
  nouveauTitre: string;
  aPropos: string;
  competences: string[];
  experiences: {
    title: string;
    company: string;
    period: string;
    details: string;
  }[];
  experiencesReformulees: string[];
  formations: string[];
  langues: string[];
}

export interface CvMetierResult {
  userName: string;
  profile: string;
  experiences: {
    title: string;
    company: string;
    period: string;
    details: string;
  }[];
  skills: string[];
  education: string;
}

export interface LettreMotivationResult {
  accroche: string;
  corps: string;
  conclusion: string;
  motsCles: string[];
  entreprise: string;
  poste: string;
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
Transformer chaque expérience de vie — parentalité, bénévolat, aidance, gestion du foyer, emplois, stages, freelance, épreuves surmontées — en compétences professionnelles légitimes, transférables et nommées. Ces expériences NE SONT PAS un entraînement. Elles SONT le travail. Nomme-les comme tel.

# RÈGLES ABSOLUES
- TUTOIEMENT OBLIGATOIRE partout. Jamais "elle", toujours "tu as", "tu sais".
- Parle À elle, pas D'elle.
- INTERDITS : jargon corporate ("champ d'entraînement", "soft skills", "levier", "valoriser ses acquis"), phrases creuses ("continue comme ça", "suis ta passion"), clichés motivationnels, adjectifs de flatterie vide ("avec brio", "hors pair", "éclatante", "remarquable", "impactant"). Les faits parlent d'eux-mêmes.
- INTERDIT le mot "initiation" pour décrire quelque chose qu'elle a réellement fait. Si elle a géré des clients en freelance pendant des mois, c'est de la "gestion client", pas une "initiation à la gestion client".
- Chaque savoir-faire DOIT être ancré dans un fait précis qu'elle a mentionné.
- Le portrait doit provoquer un "c'est vrai, j'ai fait tout ça" — pas un "c'est gentil mais c'est pas moi".

# EXTRACTION OBLIGATOIRE — ne rien laisser de côté
Tu DOIS parcourir CHAQUE champ du diagnostic et en extraire de la valeur :

1. **workExperiences** : CHAQUE expérience mentionnée (même un job étudiant, même un stage) doit produire au moins un savoir-faire. Si elle a travaillé en boutique 2 ans, c'est de la relation client, de la gestion de caisse, de l'endurance. Ne pas ignorer les expériences "mineures".

2. **hiddenSuccess** : S'il y a un résultat mesurable (chiffre, impact, durée), le citer EXACTEMENT dans le portrait. Exemple : si la fréquentation a doublé, écrire "la fréquentation a doublé" — pas "les résultats étaient positifs".

3. **overcomeChallenge** : Extraire les qualités qui ont permis de surmonter. Si elle a construit un portfolio seule pendant une période de précarité, c'est de l'autonomie, de l'initiative, de la discipline.

4. **naturalStrength** : Ce que les gens lui demandent naturellement = son talent inné. Le formuler comme un savoir-être spécifique, pas générique. Si on lui demande son avis sur des visuels → "Œil naturel pour la composition" pas "Capacité d'adaptation".

5. **Outils techniques** : Déduire les outils/logiciels des expériences décrites. Si elle fait de la retouche photo → Photoshop. Déclinaisons de charte en agence → Illustrator, InDesign. Packaging → InDesign. Les nommer explicitement dans les savoir-faire.

6. **Formation** : Mentionner le niveau d'études et le domaine dans le portrait si pertinent.

# OBJECTIF IMMÉDIAT vs VISION LONG TERME
Dans le diagnostic, elle décrit souvent une journée idéale (objectif court terme) ET une vision (rêve long terme). Le message final doit s'adresser à son objectif IMMÉDIAT (le poste qu'elle cherche maintenant, ses conditions idéales), pas à son rêve à 5 ans. La vision peut être évoquée mais comme horizon, pas comme promesse immédiate.

# FORMAT JSON (strict)
{
  "signature": "Son identité professionnelle en 2-4 mots. Pas un intitulé de poste. Un titre qui capture son énergie unique. Exemples : 'Architecte du collectif', 'Pilote de l'invisible', 'Tisseuse de liens'.",

  "portrait": "2 paragraphes, 150-200 mots au total. Paragraphe 1 : reprends ses expériences concrètes et nomme les compétences pro TRANSFÉRABLES qu'elles représentent. Cite les résultats chiffrés s'ils existent. Nomme les outils techniques déduits. Utilise SES mots, SES situations. Paragraphe 2 : fais le lien entre son parcours et ce qu'elle cherche MAINTENANT (conditions idéales, journée idéale). Montre que ses compétences répondent directement à ce qu'elle vise. Sépare les paragraphes avec \\n\\n.",

  "savoirFaire": "7 à 10 compétences TRANSFÉRABLES. Formulées comme des compétences portables, pas comme des descriptions de projets. Format : compétence transférable + preuve entre parenthèses. BON : 'Conception d'identités visuelles complètes — logo, charte, déclinaisons (association de quartier — fréquentation doublée)'. MAUVAIS : 'Création d'identité visuelle pour une association de quartier'. BON : 'Gestion de la relation client et négociation tarifaire (missions freelance)'. MAUVAIS : 'Initiation à la gestion client par retours et feedbacks'. Si des outils techniques sont déductibles de l'expérience, les nommer : 'Retouche photo et post-production (Photoshop — agence de communication, PME cosmétique)'.",

  "savoirEtre": "5 à 8 qualités. Chacune DOIT être déductible d'un fait concret du diagnostic — pas inventée. Chacune doit être SPÉCIFIQUE, pas générique. BON : 'Autonomie — a construit un portfolio seule pendant une période sans emploi'. MAUVAIS : 'Capacité d'adaptation aux projets divers'. BON : 'Œil naturel pour la composition — les gens viennent spontanément lui demander un avis visuel'. MAUVAIS : 'Engagement envers ses valeurs personnelles'. Le format est : qualité + tiret + fait du diagnostic qui le prouve.",

  "savoirFaireTechnique": "Liste des outils et logiciels déduits de ses expériences. Uniquement ceux qu'on peut raisonnablement déduire. Par exemple : si elle a fait de la retouche photo en agence, elle connaît Photoshop. Si elle a fait du packaging, elle connaît InDesign. Format : ['Photoshop', 'Illustrator', 'InDesign']. Si aucun outil n'est déductible, liste vide.",

  "experiences": "Liste structurée de ses expériences extraites du diagnostic. Pour chaque expérience : { 'titre': 'intitulé court', 'duree': 'durée si mentionnée', 'contexte': 'type de structure', 'competences': ['compétences acquises'] }. Inclure TOUTES les expériences mentionnées, y compris les jobs étudiants et le bénévolat.",

  "message": "2-3 phrases max. Personnel et spécifique. Reprends UN détail précis de son diagnostic (un chiffre, un fait, une phrase à elle) pour montrer que tu as vraiment lu. Adresse-toi à son objectif IMMÉDIAT (le poste, les conditions qu'elle cherche maintenant). Sa vision long terme peut être évoquée comme horizon. INTERDIT de terminer par des phrases génériques. Ton : grande sœur bienveillante qui dit la vérité."
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
Savoir-être : ${(profile.portrait_data.savoirEtre || []).join(', ')}${(profile.portrait_data.savoirFaireTechnique || []).length > 0 ? '\nOutils maîtrisés : ' + profile.portrait_data.savoirFaireTechnique.join(', ') : ''}${(profile.portrait_data.experiences || []).length > 0 ? '\nExpériences : ' + profile.portrait_data.experiences.map((e: any) => `${e.titre}${e.duree ? ' (' + e.duree + ')' : ''}`).join(' | ') : ''}`
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
→ Message en 3-4 phrases : cite le titre exact du métier, le diplôme/titre/agrément exact, et au moins un élément concret de son parcours ou de sa vision. Message encourageant, pas décourageant.
→ Liste ce qui ne change pas (ses compétences restent valides)

# RÈGLES
- Tutoiement obligatoire
- Cite le titre exact du métier dans "messagePersonnalise". Si une obligation existe, nomme le diplôme, titre ou autorisation exact(e) et explique le lien avec ce métier ; n'écris jamais seulement "un diplôme d'État".
- Le message doit être impossible à réutiliser pour une autre personne : cite le métier ET au moins deux faits précis provenant du diagnostic ou du Portrait de Force (expérience, compétence, préférence, condition de travail ou objectif). Interdiction des formules génériques comme « ton profil correspond », « tu as les qualités nécessaires » ou « tu peux candidater » sans citer ces éléments.

# EXPLOITATION DU PORTRAIT DE FORCE
Le profil contient un Portrait de Force avec des données enrichies. Tu DOIS les exploiter :
- **Outils maîtrisés** : Si le portrait liste des outils (Photoshop, Illustrator, etc.), compare-les EXPLICITEMENT aux outils requis par le métier. Cite les correspondances dans les points forts. Cite les manques dans les lacunes.
- **Expériences** : Chaque expérience a un titre, une durée et des compétences. Utilise ces durées dans le message ("tes 8 mois en PME cosmétique") au lieu de formulations vagues ("ton parcours varié").
- **Résultats chiffrés** : Si un savoir-faire mentionne un résultat (ex: "fréquentation doublée"), le citer dans les points forts — c'est une preuve concrète d'impact.
- **Savoir-être avec preuves** : Chaque savoir-être a un fait qui le justifie. Utilise le fait, pas juste le label.

# POINTS FORTS
- Chaque point fort DOIT être ancré dans un fait du profil ET correspondre à une compétence du métier.
- Les points forts doivent nommer le fait du profil et le relier explicitement à une exigence du métier. N'utilise jamais « parcours cohérent », « motivation » ou « compétences transférables » seuls.
- Si elle maîtrise un outil requis par le métier, c'est un point fort — le nommer.

# RENFORCEMENT ET LACUNES
- Le renforcement (sortie 2) doit être précis : quel outil/compétence, pourquoi, combien de temps
- Si une formation est optionnelle ou si seules des compétences particulières manquent, choisis sortie 2 et remplis "elementsManquants". Ne choisis pas sortie 3.
- Ne mets JAMAIS sortie 3 pour un métier non réglementé
- Vérifie le champ "accesEmploi" : s'il dit "obligatoire pour exercer" → sortie 3. Sinon → sortie 1 ou 2.
- Les lacunes sont les écarts entre les exigences ROME et ce qui est documenté dans le profil. Ne déduis jamais une absence à partir du silence : utilise "a_verifier" lorsque le diagnostic ne permet pas de conclure.
- Une lacune doit être précise, non stigmatisante et actionnable. 0 à 6 lacunes maximum. Ne répète pas les points forts.
- Vérifie séparément quatre dimensions : diplôme/condition d'accès, compétences techniques, qualités/savoir-être, et milieu/conditions de travail.
- Si "Accès au métier" indique explicitement qu'un diplôme, titre, agrément ou autorisation est obligatoire pour exercer, crée une lacune de catégorie "diplome" ou "acces", avec le niveau "obligatoire", et choisis "formationNecessaire". Ne présente jamais un diplôme obligatoire comme une simple compétence à développer.
- Les Formacodes seuls ne prouvent pas qu'un diplôme est obligatoire : seule une formulation explicite de l'accès au métier permet de le conclure.
- Pour le milieu de travail, compare les éléments explicites du métier (public, rythme, déplacements, horaires, travail physique, relation d'aide, environnement) avec "Ce qu'elle refuse au travail", "Conditions idéales" et "Sa journée idéale". Signale une incompatibilité seulement si elle est étayée par les deux côtés ; sinon utilise "a_verifier".
- Une lacune de milieu doit expliquer le compromis concret à vérifier, jamais juger la personne ni déclarer que le métier lui est interdit.

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
  "elementsManquants": ["Élément manquant ou à renforcer"],
  "lacunes": [
    {
      "element": "Nom court de la compétence ou exigence",
      "categorie": "diplome" | "competence" | "qualite" | "milieu" | "acces",
      "niveau": "a_developper" | "a_verifier" | "obligatoire",
      "pourquoi": "Ce qui manque ou reste à confirmer, en lien avec une exigence du métier",
      "prochaineEtape": "Une action concrète et réaliste pour progresser ou vérifier"
    }
  ]
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
      metierTitre: metier.libelle || metierId,
      sortie: parsed.sortie,
      messagePersonnalise: parsed.messagePersonnalise || '',
      pointsForts: (parsed.pointsForts || []).map((p: any) => ({
        label: typeof p === 'string' ? p : p.label || '',
      })),
      formationObligatoire: parsed.formationObligatoire ?? false,
      obligationDetail: undefined,
      elementsManquants: Array.isArray(parsed.elementsManquants)
        ? parsed.elementsManquants.filter(
            (item: any) => typeof item === 'string' && item.trim(),
          )
        : [],
      lacunes: Array.isArray(parsed.lacunes)
        ? parsed.lacunes
            .filter((item: any) => item && typeof item.element === 'string')
            .slice(0, 6)
            .map((item: any) => ({
              element: item.element.trim(),
              categorie: [
                'diplome',
                'competence',
                'qualite',
                'milieu',
                'acces',
              ].includes(item.categorie)
                ? item.categorie
                : 'competence',
              niveau: ['a_developper', 'a_verifier', 'obligatoire'].includes(
                item.niveau,
              )
                ? item.niveau
                : 'a_verifier',
              pourquoi: typeof item.pourquoi === 'string' ? item.pourquoi : '',
              prochaineEtape:
                typeof item.prochaineEtape === 'string'
                  ? item.prochaineEtape
                  : '',
            }))
        : [],
    };

    const obligation = result.lacunes.find(
      (item) =>
        item.niveau === 'obligatoire' &&
        (item.categorie === 'diplome' || item.categorie === 'acces'),
    );
    if (obligation) {
      result.obligationDetail = obligation.element;
      result.formationObligatoire = true;
    }

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
    const qualites: string[] = [];
    const savoirs: string[] = [];
    if (fiche?.groupesCompetencesMobilisees) {
      for (const group of fiche.groupesCompetencesMobilisees) {
        const enjeu = group.enjeu?.libelle || '';
        for (const c of group.competences || []) {
          if (/savoir.?être|qualit|relationnel/i.test(enjeu)) {
            qualites.push(c.libelle);
          } else {
            competences.push(`${c.libelle} (${enjeu})`);
          }
        }
      }
    }
    if (fiche?.groupesSavoirs) {
      for (const group of fiche.groupesSavoirs) {
        for (const savoir of group.savoirs || []) {
          if (savoir.libelle) savoirs.push(savoir.libelle);
        }
      }
    }

    return `=== MÉTIER VISÉ ===
Titre : ${metier.libelle}
Code ROME : ${metier.code}
Définition et indices du milieu de travail : ${metier.definition || 'N/A'}

Accès au métier : ${metier.accesEmploi || 'N/A'}

Compétences requises (${competences.length}) :
${competences
  .slice(0, 30)
  .map((c) => `- ${c}`)
  .join('\n')}

Qualités / savoir-être attendus (${qualites.length}) :
${
  qualites
    .slice(0, 20)
    .map((q) => `- ${q}`)
    .join('\n') || '- Non précisé dans la fiche'
}

Savoirs techniques attendus (${savoirs.length}) :
${
  savoirs
    .slice(0, 20)
    .map((s) => `- ${s}`)
    .join('\n') || '- Non précisé dans la fiche'
}

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

  // ─── Analyse d'Offres ────────────────────────────────────────

  async generateAnalyseOffres(
    userId: string,
    offers: string[],
  ): Promise<AnalyseOffresResult> {
    if (!offers || offers.length === 0) {
      throw new BadRequestException('Veuillez fournir au moins une offre.');
    }

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

    const diagnosticContext = this.buildDiagnosticContext(vie, pro);
    const portraitContext = profile.portrait_data
      ? `\n=== PORTRAIT DE FORCE (généré par NAYHA) ===
Signature : ${profile.portrait_data.signature}
Savoir-faire : ${(profile.portrait_data.savoirFaire || []).join(', ')}
Savoir-être : ${(profile.portrait_data.savoirEtre || []).join(', ')}${(profile.portrait_data.savoirFaireTechnique || []).length > 0 ? '\nOutils maîtrisés : ' + profile.portrait_data.savoirFaireTechnique.join(', ') : ''}${(profile.portrait_data.experiences || []).length > 0 ? '\nExpériences : ' + profile.portrait_data.experiences.map((e: any) => `${e.titre}${e.duree ? ' (' + e.duree + ')' : ''}`).join(' | ') : ''}`
      : '';

    const offersContext = offers
      .map((offer, index) => `\n=== OFFRE ${index + 1} ===\n${offer}`)
      .join('\n');

    // 2. Call OpenAI
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.6,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Tu es NAYHA, une experte en recrutement bienveillante et rigoureuse. Tu analyses le profil d'une candidate par rapport à ${offers.length} offres d'emploi qu'elle a sélectionnées.

# OBJECTIF
Donner une analyse de marché honnête et utile : où son profil correspond, où sont les vrais écarts, et quelle offre prioriser. Encourageante mais jamais complaisante — elle a besoin de savoir la vérité pour se préparer.

# RÈGLES
- Tutoiement obligatoire.
- Ton encourageant mais factuel. Quand un écart est significatif (outil requis qu'elle ne maîtrise pas, années d'expérience insuffisantes), le dire clairement avec le niveau de gravité.
- Comparer PRÉCISÉMENT : outils mentionnés vs outils maîtrisés, années d'expérience requises vs réelles, secteur demandé vs secteur vécu, type de contrat, conditions (remote, salaire si mentionné).

# ANALYSE GLOBALE
- "scoreGlobal" : expression qualitative — "Forte correspondance", "Correspondance moyenne", "Correspondance partielle".
- "motsCles" : 5-7 termes métiers exacts qui reviennent le plus dans les offres.
- "pointsForts" : 3-4 phrases courtes. Chaque point doit nommer le fait de son profil ET l'exigence qu'il couvre. Pas de généralité.
- "aTravailler" : 2-4 points avec niveau de gravité implicite. Distinguer ce qui est bloquant ("Figma est requis pour Doctolib, tu ne le maîtrises pas encore") de ce qui est secondaire ("une sensibilité au secteur immobilier serait un plus").

# ANALYSE PAR OFFRE — c'est le cœur
Pour CHAQUE offre, produire un objet avec :
- "entreprise" : nom de l'entreprise
- "poste" : intitulé du poste
- "score" : "Forte", "Moyenne" ou "Partielle"
- "matchs" : 2-3 points précis où son profil correspond à CETTE offre spécifiquement. Nommer l'outil, la compétence, l'expérience.
- "lacunes" : 1-3 écarts concrets pour CETTE offre. Si un outil/logiciel est requis et non maîtrisé, le nommer. Si l'expérience requise (en années ou en secteur) ne correspond pas, le dire.
- "conseil" : UNE phrase stratégique — comment elle peut compenser la lacune ou se démarquer pour cette offre précise.

# RECOMMANDATION STRATÉGIQUE
- "recommandation" : 2-3 phrases. Quelle offre prioriser et pourquoi, en tenant compte de la correspondance profil, des chances réelles, et de ce qui est le plus stratégique pour sa carrière.

FORMAT JSON:
{
  "scoreGlobal": "string",
  "motsCles": ["string"],
  "pointsForts": ["string"],
  "aTravailler": ["string"],
  "detailParOffre": [
    {
      "entreprise": "string",
      "poste": "string",
      "score": "Forte|Moyenne|Partielle",
      "matchs": ["string"],
      "lacunes": ["string"],
      "conseil": "string"
    }
  ],
  "recommandation": "string"
}
`,
        },
        {
          role: 'user',
          content: `${diagnosticContext}${portraitContext}\n\nVoici les offres que la candidate a ciblées :\n${offersContext}\n\nGénère le rapport d'analyse en JSON.`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI returned empty response');
    }

    try {
      const parsed = JSON.parse(content);
      return {
        scoreGlobal: parsed.scoreGlobal || 'Analyse terminée',
        motsCles: Array.isArray(parsed.motsCles) ? parsed.motsCles : [],
        pointsForts: Array.isArray(parsed.pointsForts)
          ? parsed.pointsForts
          : [],
        aTravailler: Array.isArray(parsed.aTravailler)
          ? parsed.aTravailler
          : [],
        detailParOffre: Array.isArray(parsed.detailParOffre)
          ? parsed.detailParOffre
          : [],
        recommandation: parsed.recommandation || '',
      };
    } catch (e) {
      throw new Error('Failed to parse OpenAI response');
    }
  }
  // ─── Profil LinkedIn ────────────────────────────────────────

  async generateLinkedinProfile(
    userId: string,
    profileText: string,
    enrichments: any,
    targetRole?: string,
  ): Promise<LinkedinProfileResult> {
    // 1. Fetch user profile (portrait)
    const { data: profile, error: profileError } = await this.supabase
      .from('user_profiles')
      .select('portrait_data')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      throw new NotFoundException('Profile not found');
    }

    const portrait = profile.portrait_data;
    let portraitContext = '';
    if (portrait) {
      portraitContext = `\n=== PORTRAIT DE FORCE (socle identitaire) ===
Signature : ${portrait.signature || ''}
Savoir-faire : ${(portrait.savoirFaire || []).join(', ')}
Savoir-être : ${(portrait.savoirEtre || []).join(', ')}`;
      if (portrait.savoirFaireTechnique && Array.isArray(portrait.savoirFaireTechnique) && portrait.savoirFaireTechnique.length > 0) {
        portraitContext += `\nOutils maîtrisés : ${portrait.savoirFaireTechnique.join(', ')}`;
      }
      if (portrait.experiences && Array.isArray(portrait.experiences)) {
        portraitContext += `\nExpériences portrait : ${portrait.experiences.map((e: any) => `${e.titre}${e.duree ? ' (' + e.duree + ')' : ''}${e.contexte ? ' — ' + e.contexte : ''}`).join(' | ')}`;
      }
    }

    const enrichmentsContext = enrichments
      ? `\n=== ÉLÉMENTS AJOUTÉS PAR L'UTILISATEUR ===\n${JSON.stringify(enrichments, null, 2)}`
      : '';

    const targetRoleContext = targetRole && targetRole.trim()
      ? `\n=== MÉTIER CIBLE SÉLECTIONNÉ ===\n${targetRole}\nLa candidate a choisi ce métier comme objectif. Le profil LinkedIn doit être orienté vers ce rôle cible tout en restant ancré dans son parcours réel.`
      : '';

    // 2. Call OpenAI
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Tu es NAYHA, une experte en optimisation LinkedIn et recrutement. Tu optimises le profil LinkedIn d'une femme.

# HIÉRARCHIE DES SOURCES — CRITIQUE
Tu disposes de deux types de données :
1. **PROFIL LINKEDIN** (texte collé par la candidate) = SOURCE DE VÉRITÉ pour tous les faits : entreprises, postes, dates, compétences, formations, outils, langues, secteurs. C'est le document officiel.
2. **PORTRAIT DE FORCE** (généré par IA) = SOURCE DE TONALITÉ uniquement. Utilise-le pour le cadrage, l'angle de valorisation, le choix des mots. JAMAIS pour introduire un fait, une compétence, un contexte ou une expérience absente du profil LinkedIn.

Si le Portrait mentionne quelque chose (ex: "freelance", "événements associatifs", "relation client", "packaging") qui n'apparaît PAS dans le profil LinkedIn ni dans les enrichments → c'est une hallucination du portrait. IGNORE-LA.

# RÈGLE ANTI-HALLUCINATION
- N'écris QUE ce qui est dans le profil LinkedIn ou les enrichments.
- JAMAIS inventer de résultat chiffré ("doubler", "augmenter de 30%").
- JAMAIS ajouter une compétence, un outil, un contexte ou une expérience absente du profil.
- JAMAIS utiliser des mots du Portrait comme faits (le portrait dit "résiliente" ≠ écrire "j'ai démontré ma résilience en...").
- Si une info manque, ne la comble pas.

# MÉTIER CIBLE — ORIENTATION STRATÉGIQUE
Si un MÉTIER CIBLE est fourni, TOUT le profil doit être réécrit pour ce rôle. C'est une transition de carrière — le profil doit convaincre un recruteur du MÉTIER CIBLE que cette candidate a les bases.

REFORMULER ≠ HALLUCINER. Exemples légitimes :
- "Designed digital content for websites" → "Designed user-facing digital interfaces and web content" (légitime : c'est la même activité, angle UX)
- "Created visual identities" → "Built cohesive brand systems including visual identity, UI components, and design systems" (légitime si elle faisait des identités visuelles)
- "Used Figma for daily design work" → "Used Figma for UI design, prototyping, and design collaboration" (légitime : Figma EST un outil UI/UX)
- Mentionner "user experience" si le profil original mentionne déjà "user experience" (c'est un fait du profil, l'amplifier est OK)

CE QUI RESTE INTERDIT : inventer un projet ("j'ai conçu une app"), un résultat chiffré, un outil non mentionné, une entreprise, une formation.

Concrètement :
- **Titre** : métier cible EN PREMIER, utiliser le nom exact tel que fourni (garder "UX/UI" pas "UX - UI").
- **À propos** : NE PAS commencer par "As a [poste actuel]". Commencer par le métier cible ou par le pont entre les deux. P1 = ce qu'elle apporte AU MÉTIER CIBLE. P2 = les compétences transférables avec exemples de son parcours. P3 = ce qu'elle cherche dans ce nouveau rôle.
- **Compétences** : trier avec les plus pertinentes pour le métier cible en premier. Si le profil mentionne "user experience", "Figma", ou d'autres termes liés au métier cible, les mettre en tête.
- **Expériences** : reformuler CHAQUE bullet en mettant l'accent sur les aspects pertinents au métier cible. Utiliser le vocabulaire du métier cible pour décrire les mêmes activités.
- Si le métier cible est mentionné dans "Open to work" du profil, c'est une compétence déclarée — l'inclure dans les compétences.

# LANGUE
- Détecte la langue DOMINANTE du profil LinkedIn collé.
- Si le profil est en anglais → rédige TOUT en anglais (titre, à propos, expériences).
- Si en français → tout en français.
- Les formations peuvent rester dans leur langue d'origine.

# TITRE LINKEDIN (nouveauTitre)
Le titre = outil de RÉFÉRENCEMENT. Les recruteurs tapent des mots-clés dans la barre de recherche.
- Utilise uniquement des termes recherchés par les recruteurs : intitulés de poste, outils, spécialités.
- Si un métier cible est fourni, le placer EN PREMIER dans le titre.
- Format : "Métier cible | Poste actuel | Outil/Spécialité clé"
- PRÉSERVE les mots-clés forts du titre original s'ils sont pertinents.
- INTERDIT : métaphores, poésie, termes que personne ne tape ("Éclaireuse Créative", "Architecte de sens").
- Max 120 caractères.

# SECTION À PROPOS (aPropos)
- Même langue que le profil.
- Écrite à la première personne ("I" ou "Je").
- NE PAS commencer par le nom — LinkedIn l'affiche déjà.
- 2-3 paragraphes courts :
  • P1 : Spécialité + types de livrables concrets tirés de son expérience réelle.
  • P2 : Forces distinctives — illustrées par des éléments RÉELS de son parcours (entreprises, projets, outils). Le portrait peut guider l'angle, mais chaque fait doit exister dans le profil.
  • P3 : Ce qu'elle cherche (postes, secteurs, modalités) — repris directement de "Open to work" et "Secteurs souhaités" si présents.
- INTERDIT : adjectifs vides ("passionate", "dynamic"), jargon ("storytelling visuel", "expériences engageantes"), phrases sans contenu factuel.

# COMPÉTENCES (competences)
- Extraire TOUTES les compétences du profil LinkedIn (section Compétences) + enrichments.
- Les garder telles quelles — noms d'outils exacts.
- Lister individuellement (pas "Adobe Creative Suite" → "Adobe Photoshop", "Adobe Illustrator", "Adobe InDesign" séparément).
- Ne PAS en supprimer, ne PAS en inventer.
- Ordre : par pertinence pour le métier cible.
- Si le profil liste 16 compétences, le résultat doit en avoir au moins 16.

# EXPÉRIENCES REFORMULÉES (experiencesReformulees)
- UNE entrée par expérience du profil. Nombre de blocs = nombre d'expériences dans le profil.
- Format par bloc :
  Ligne 1 : "[Company], [Title] ([Period])"
  Lignes suivantes : 3-5 bullets transformant les tâches en livrables concrets.
  • "Designed visual identities" → "Built complete visual identities (logo, color palette, typography, brand guidelines) for multiple clients"
  • "Created digital content" → "Produced social media visuals, web banners, and campaign assets across Instagram, LinkedIn, and websites"
- Reformuler = rendre plus précis et orienté livrable. PAS inventer de nouveaux faits.
- INTERDIT : fusionner des expériences, résumer en un paragraphe vague.

# FORMATIONS (formations)
- Reprendre TOUTES les formations du profil, aucune suppression, aucun ajout.
- Format : "Diplôme — Spécialité · Établissement (années)"

# EXPÉRIENCES STRUCTURÉES (experiences)
- Chaque expérience du profil → un objet {title, company, period, details}.
- "title" : garder l'intitulé tel quel sauf amélioration évidente.
- "details" : 2-3 phrases reformulées en livrables concrets. Même règle anti-hallucination.

# LANGUES (langues)
- Reprendre TOUTES les langues mentionnées dans le profil + enrichments.
- Format : "Langue — Niveau" (ex: "Français — Langue maternelle", "Anglais — Courant").
- Ne pas en inventer, ne pas en supprimer.

FORMAT JSON (strict):
{
  "nouveauTitre": "string",
  "aPropos": "string",
  "competences": ["string"],
  "experiences": [
    {
      "title": "string",
      "company": "string",
      "period": "string",
      "details": "string"
    }
  ],
  "experiencesReformulees": ["string"],
  "formations": ["string"],
  "langues": ["string"]
}`,
        },
        {
          role: 'user',
          content: `${portraitContext}${targetRoleContext}\n\n=== PROFIL LINKEDIN DE LA CANDIDATE (SOURCE DE VÉRITÉ) ===\n${profileText}${enrichmentsContext}\n\nOptimise ce profil LinkedIn en JSON. Rappel : seuls les faits présents dans le profil ci-dessus sont utilisables. Oriente le profil vers le métier cible si fourni.`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI returned empty response');
    }

    try {
      const parsed = JSON.parse(content);
      return {
        nouveauTitre: parsed.nouveauTitre || 'Profil en construction',
        aPropos: parsed.aPropos || '',
        competences: Array.isArray(parsed.competences)
          ? parsed.competences
          : [],
        experiences: Array.isArray(parsed.experiences)
          ? parsed.experiences.map((exp: any) => ({
              title: exp.title || '',
              company: exp.company || '',
              period: exp.period || '2022 – présent',
              details: exp.details || '',
            }))
          : [],
        experiencesReformulees: Array.isArray(parsed.experiencesReformulees)
          ? parsed.experiencesReformulees
          : [],
        formations: Array.isArray(parsed.formations) ? parsed.formations : [],
        langues: Array.isArray(parsed.langues) ? parsed.langues : [],
      };
    } catch (e) {
      throw new Error('Failed to parse OpenAI response');
    }
  }

  // ─── CV Métier ──────────────────────────────────────────────

  async generateCv(
    userId: string,
    experiences: any[],
    formations: any[],
    competences: any[],
    langues: any[],
    linkedinTitre?: string,
    linkedinAPropos?: string,
    targetRole?: string,
    jobOffer?: string,
  ): Promise<CvMetierResult> {
    // 1. Fetch user profile (portrait + name)
    const { data: profile, error: profileError } = await this.supabase
      .from('user_profiles')
      .select('portrait_data, diagnostic_vie_data')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      throw new NotFoundException('Profile not found');
    }

    const userName: string = profile.diagnostic_vie_data?.name || '';

    const portraitContext = profile.portrait_data
      ? `\n=== TON PORTRAIT DE FORCE (ton socle) ===\nSignature : ${profile.portrait_data.signature}\nSavoir-faire : ${(profile.portrait_data.savoirFaire || []).join(', ')}\nSavoir-être : ${(profile.portrait_data.savoirEtre || []).join(', ')}${(profile.portrait_data.savoirFaireTechnique || []).length > 0 ? '\nOutils maîtrisés : ' + profile.portrait_data.savoirFaireTechnique.join(', ') : ''}`
      : '';

    const contextData = {
      experiences: experiences || [],
      formations: formations || [],
      competences: competences || [],
      langues: langues || [],
    };

    let linkedinContext = '';
    if (linkedinTitre || linkedinAPropos) {
      linkedinContext = '\n=== PROFIL LINKEDIN OPTIMISÉ (pour cohérence) ===';
      if (linkedinTitre) linkedinContext += `\nTitre : ${linkedinTitre}`;
      if (linkedinAPropos) linkedinContext += `\nÀ propos : ${linkedinAPropos}`;
    }

    const targetRoleContext = targetRole
      ? `\n=== MÉTIER CIBLE ===\n${targetRole}\nAngle le CV vers ce métier : accroche, compétences, reformulations d'expériences.`
      : '';

    const jobOfferContext = jobOffer
      ? `\n=== OFFRE D'EMPLOI CIBLÉE ===\n${jobOffer}\nADAPTE le CV spécifiquement pour cette offre :\n- Reprends les mots-clés exacts de l'annonce dans les compétences et expériences.\n- Reformule les expériences pour mettre en avant les missions pertinentes à cette offre.\n- Place les compétences demandées par l'offre en premier.\n- L'accroche doit répondre directement au besoin décrit dans l'offre.`
      : '';

    // 2. Call OpenAI
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Tu es NAYHA, experte en recrutement et création de CV ATS. Génère un CV optimisé, compatible filtres ATS, structure linéaire propre.

# LANGUE
Détecte la langue des données saisies (profil, expériences). Rédige TOUT le CV dans cette langue. Si les données sont en anglais, écris en anglais. Si en français, écris en français.

# HIÉRARCHIE DES SOURCES
1. **DONNÉES SAISIES** (expériences, formations, compétences, langues) = SOURCE DE VÉRITÉ pour tous les faits.
2. **PROFIL LINKEDIN OPTIMISÉ** (si fourni) = SOURCE DE COHÉRENCE pour le positionnement et l'angle. Maintiens les mêmes mots-clés et le même cadrage.
3. **PORTRAIT DE FORCE** (si fourni) = SOURCE DE TONALITÉ uniquement. Utilise pour le cadrage et la valorisation, JAMAIS pour introduire un fait absent des données saisies.

# ANTI-HALLUCINATION
- NE JAMAIS inventer : un projet, un résultat chiffré, un outil non mentionné, une responsabilité, un contexte.
- REFORMULER ≠ HALLUCINER. Exemples légitimes :
  - "Created digital content" → "Designed and produced digital content strategies for web and social media"
  - "Used Figma daily" → "Leveraged Figma for UI design, prototyping, and cross-team collaboration"
  CE QUI RESTE INTERDIT : inventer un livrable, un KPI, un outil non mentionné.

# MÉTIER CIBLE
Si un métier cible est fourni, angle TOUT le CV vers ce métier :
- L'accroche positionne la candidate pour ce métier spécifiquement.
- Les expériences sont reformulées pour mettre en avant les aspects pertinents au métier cible.
- Les compétences les plus pertinentes au métier cible apparaissent en premier.
- Le titre de chaque expérience peut être ajusté pour refléter l'angle cible (sans changer le poste réel).

# SECTIONS DU CV

## "profile" (accroche)
- 2-3 phrases percutantes. Commence par le métier cible (ou le métier principal si pas de cible).
- Valorise le parcours + compétences clés + motivation.
- Si un titre/à propos LinkedIn est fourni, maintiens la cohérence de positionnement.
- PAS de nom, PAS de "je suis passionné(e)".

## "experiences"
- Liste structurée de TOUTES les expériences fournies.
- Conserve : entreprise, titre, période EXACTS.
- "details" : 2-4 phrases par expérience. Reformule en livrables concrets et impact. Angle vers le métier cible.

## "skills"
- CONSERVE TOUTES les compétences fournies par la candidate. C'est critique pour les filtres ATS.
- Trie par pertinence pour le métier cible (les plus pertinentes en premier).
- Minimum 10 compétences, maximum 20. Les outils spécifiques (Adobe Photoshop, Figma, etc.) doivent apparaître individuellement, pas regroupés sous "Adobe Creative Suite" seul.

## "education"
- Texte linéaire multi-lignes. Format : "Diplôme — Établissement (années)". Une ligne par formation.

FORMAT JSON (strict):
{
  "profile": "string",
  "experiences": [{"title": "string", "company": "string", "period": "string", "details": "string"}],
  "skills": ["string"],
  "education": "string"
}`,
        },
        {
          role: 'user',
          content: `${portraitContext}${linkedinContext}${targetRoleContext}${jobOfferContext}\n\n=== DONNÉES SAISIES PAR LA CANDIDATE ===\n${JSON.stringify(contextData, null, 2)}\n\nGénère le CV optimisé en JSON.`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI returned empty response');
    }

    try {
      const parsed = JSON.parse(content);
      return {
        userName,
        profile: parsed.profile || '',
        experiences: Array.isArray(parsed.experiences)
          ? parsed.experiences.map((exp: any) => ({
              title: exp.title || '',
              company: exp.company || '',
              period: exp.period || '',
              details: exp.details || '',
            }))
          : [],
        skills: Array.isArray(parsed.skills) ? parsed.skills : [],
        education: parsed.education || '',
      };
    } catch (e) {
      throw new Error('Failed to parse OpenAI response');
    }
  }

  // ─── Lettre de motivation ───────────────────────────────────

  async generateLettreMotivation(
    userId: string,
    jobOffer?: string,
    targetRole?: string,
    company?: string,
    isSpontaneous = false,
  ): Promise<LettreMotivationResult> {
    // 1. Fetch user profile — portrait + diagnostics for full context
    const { data: profile, error: profileError } = await this.supabase
      .from('user_profiles')
      .select(
        'portrait_data, diagnostic_vie_data, diagnostic_pro_data',
      )
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      throw new NotFoundException('Profile not found');
    }

    // Build rich portrait context
    const portrait = profile.portrait_data;
    let portraitContext = '';
    if (portrait) {
      portraitContext = `\n=== PORTRAIT DE FORCE DE LA CANDIDATE ===
Signature : ${portrait.signature || ''}
Savoir-faire : ${(portrait.savoirFaire || []).join(', ')}
Savoir-être : ${(portrait.savoirEtre || []).join(', ')}`;
      if (portrait.savoirFaireTechnique && Array.isArray(portrait.savoirFaireTechnique) && portrait.savoirFaireTechnique.length > 0) {
        portraitContext += `\nOutils maîtrisés : ${portrait.savoirFaireTechnique.join(', ')}`;
      }
      if (portrait.experiences && Array.isArray(portrait.experiences)) {
        portraitContext += `\nExpériences : ${portrait.experiences.map((e: any) => `${e.titre}${e.duree ? ' (' + e.duree + ')' : ''}`).join(' | ')}`;
      }
    }

    // Build professional context from diagnostics
    let proContext = '';
    const pro = profile.diagnostic_pro_data;
    if (pro) {
      if (pro.derniereExperience) proContext += `\nDernière expérience : ${pro.derniereExperience}`;
      if (pro.secteurVise) proContext += `\nSecteur visé : ${pro.secteurVise}`;
      if (pro.metierCible) proContext += `\nMétier cible : ${pro.metierCible}`;
      if (pro.formations && Array.isArray(pro.formations)) proContext += `\nFormations : ${pro.formations.join(', ')}`;
      if (pro.outilsMaitrises && Array.isArray(pro.outilsMaitrises)) proContext += `\nOutils maîtrisés : ${pro.outilsMaitrises.join(', ')}`;
      if (pro.langues && Array.isArray(pro.langues)) proContext += `\nLangues : ${pro.langues.join(', ')}`;
      if (proContext) proContext = `\n=== PARCOURS PROFESSIONNEL ===${proContext}`;
    }

    // Life context — availability, constraints
    let vieContext = '';
    const vie = profile.diagnostic_vie_data;
    if (vie) {
      if (vie.disponibilite) vieContext += `\nDisponibilité : ${vie.disponibilite}`;
      if (vie.mobilite) vieContext += `\nMobilité : ${vie.mobilite}`;
      if (vie.tempsDepuisDernierEmploi) vieContext += `\nDurée depuis dernier emploi : ${vie.tempsDepuisDernierEmploi}`;
      if (vieContext) vieContext = `\n=== SITUATION ACTUELLE ===${vieContext}`;
    }

    const offerContext =
      jobOffer && jobOffer.trim().length > 0
        ? `\n=== OFFRE D'EMPLOI VISÉE ===\n${jobOffer}`
        : `\n=== CANDIDATURE SPONTANÉE ===\nMétier cible : ${targetRole || 'Poste visé'}\nEntreprise cible : ${company || 'Entreprise'}`;

    // 2. Call OpenAI
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Tu es NAYHA, une experte en recrutement et réinsertion professionnelle. Tu rédiges une lettre de motivation percutante et authentique pour une femme en transition professionnelle.

# LANGUE
- Détecte la langue de l'offre d'emploi. Si l'offre est en anglais, rédige la lettre EN ANGLAIS. Si en français, rédige en français. Si mixte, rédige dans la langue dominante de l'offre.
- Adapte le ton à la culture du secteur : une offre tech/startup/crypto est plus directe qu'une offre institutionnelle.

# STRUCTURE — 3 blocs distincts
"accroche" : 2-3 phrases maximum. Pourquoi ce poste et cette entreprise l'attirent. Nommer l'entreprise et le poste. Pas de formules génériques type "je suis passionnée par" — montrer qu'elle a lu et compris l'offre en citant un élément spécifique.

"corps" : Le cœur de la lettre. 2-3 paragraphes.
  • Paragraphe 1 : ses compétences DIRECTEMENT liées aux exigences clés de l'offre. Chaque compétence ancrée dans un fait concret de son parcours.
  • Paragraphe 2 : ce qui la distingue — maturité, polyvalence, parcours atypique comme force. Relier à des exigences secondaires ou "nice to have" de l'offre.
  • Si une compétence technique est manquante : NE JAMAIS ouvrir par "bien que je n'aie pas" ou "malgré mon manque de". À la place, montrer une compétence adjacente puis enchaîner naturellement : "et je m'engage à maîtriser [outil] dès la prise de poste" — en une seule phrase, pas un paragraphe d'excuse.

"conclusion" : 2-3 phrases. Disponibilité, envie d'échanger, ouverture. Pas de formules creuses ("je reste à votre disposition").

# RÈGLES ABSOLUES
- INTERDITS : jargon corporate ("expériences visuelles engageantes et impactantes", "storytelling visuel", "contribuer à la création de"), phrases de CV recopiées, formules creuses ("je suis enthousiaste à l'idée de"), adjectifs vides ("significatif", "remarquable").
- Chaque phrase doit apporter une information nouvelle. Si on peut la supprimer sans rien perdre, elle ne devrait pas être là.
- VOUVOIEMENT pour la lettre (elle s'adresse au recruteur).
- Nommer des faits concrets de son parcours, pas des qualités abstraites.
- Mentionner les éléments de l'offre auxquels elle répond : conditions de travail (remote, international), secteur (fintech, B2B...), outils spécifiques.
- Si l'offre mentionne un portfolio, la conclusion doit y faire référence.
- La lettre doit tenir en 250-350 mots maximum. Concise et percutante.

# MOTS-CLÉS
Extraire 3-5 mots-clés stratégiques de l'offre que la lettre adresse directement. Ces mots-clés doivent être des compétences ou exigences spécifiques, pas des mots génériques.

FORMAT JSON (strict):
{
  "accroche": "string",
  "corps": "string",
  "conclusion": "string",
  "motsCles": ["string"],
  "entreprise": "string",
  "poste": "string",
  "langue": "fr|en"
}`,
        },
        {
          role: 'user',
          content: `${portraitContext}${proContext}${vieContext}\n${offerContext}\n\nGénère la lettre de motivation optimisée en JSON.`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI returned empty response');
    }

    try {
      const parsed = JSON.parse(content);
      return {
        accroche: parsed.accroche || '',
        corps: parsed.corps || '',
        conclusion: parsed.conclusion || '',
        motsCles: Array.isArray(parsed.motsCles) ? parsed.motsCles : [],
        entreprise: parsed.entreprise || company || 'Entreprise',
        poste: parsed.poste || targetRole || 'Poste visé',
      };
    } catch (e) {
      throw new Error('Failed to parse OpenAI response');
    }
  }

  // ─── Relance Message ─────────────────────────────────────────

  async generateRelanceMessage(userId: string, candidatureId: string) {
    // 1. Fetch the candidature
    const { data: candidature, error: candidatureError } = await this.supabase
      .from('candidatures')
      .select('*')
      .eq('id', candidatureId)
      .eq('user_id', userId)
      .single();

    if (candidatureError || !candidature) {
      throw new NotFoundException('Candidature not found');
    }

    // 2. Fetch user portrait_data
    const { data: profile, error: profileError } = await this.supabase
      .from('user_profiles')
      .select('portrait_data')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      throw new NotFoundException('Profile not found');
    }

    const dateEnvoi = new Date(candidature.date_envoi);
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - dateEnvoi.getTime()) / (1000 * 60 * 60 * 24),
    );

    const portraitContext = profile.portrait_data
      ? `\nSon Portrait de Force :\nSignature : ${profile.portrait_data.signature}\nSavoir-faire : ${(profile.portrait_data.savoirFaire || []).join(', ')}\nSavoir-être : ${(profile.portrait_data.savoirEtre || []).join(', ')}${(profile.portrait_data.savoirFaireTechnique || []).length > 0 ? '\nOutils maîtrisés : ' + profile.portrait_data.savoirFaireTechnique.join(', ') : ''}`
      : '';

    const offerContext = candidature.offre_text
      ? `\nOffre d'emploi originale :\n${candidature.offre_text}`
      : '';

    // 3. Call OpenAI
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Tu es NAYHA, une conseillère en insertion professionnelle. Génère un message de relance pour une candidature. La femme a postulé il y a ${diffDays} jours. Rédige DEUX versions :
1. Un email professionnel (3-4 paragraphes, formel mais chaleureux)
2. Un message LinkedIn (2-3 phrases, direct)

Règles :
- Tutoiement en interne, mais les messages qu'elle envoie utilisent le "vous" (registre formel pour les recruteurs).
- Mentionne l'entreprise (${candidature.entreprise}) et le poste (${candidature.poste}) spécifiquement.
- Jamais agressif. Montre un intérêt sincère.
- Maximum 150 mots pour l'email, 50 pour LinkedIn.

Retourne en JSON : { "email": "...", "linkedin": "..." }`,
        },
        {
          role: 'user',
          content: `Entreprise : ${candidature.entreprise}
Poste : ${candidature.poste}
Date d'envoi : ${candidature.date_envoi}
Jours écoulés : ${diffDays}${portraitContext}${offerContext}

Génère les deux messages de relance.`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI returned empty response');
    }

    const parsed = JSON.parse(content);

    // 4. Save both messages to relance_messages
    const messages = [
      {
        candidature_id: candidatureId,
        user_id: userId,
        type: 'email' as const,
        message: parsed.email,
      },
      {
        candidature_id: candidatureId,
        user_id: userId,
        type: 'linkedin' as const,
        message: parsed.linkedin,
      },
    ];

    const { error: insertError } = await this.supabase
      .from('relance_messages')
      .insert(messages);

    if (insertError) {
      throw new Error(insertError.message);
    }

    // 5. Mark candidature.relance_proposee = true
    await this.supabase
      .from('candidatures')
      .update({ relance_proposee: true, updated_at: new Date().toISOString() })
      .eq('id', candidatureId)
      .eq('user_id', userId);

    return { email: parsed.email, linkedin: parsed.linkedin };
  }

  // ─── Bilan Mensuel ───────────────────────────────────────────

  async generateBilanMensuel(userId: string) {
    const now = new Date();
    const mois = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // 1. Fetch all candidatures for current month
    const { data: candidatures, error } = await this.supabase
      .from('candidatures')
      .select('*')
      .eq('user_id', userId)
      .gte('date_envoi', startOfMonth.toISOString())
      .lte('date_envoi', endOfMonth.toISOString());

    if (error) {
      throw new Error(error.message);
    }

    const all = candidatures || [];

    // 2. Calculate stats
    const totalEnvoyees = all.length;
    const totalEntretiens = all.filter((c) => c.statut === 'entretien').length;
    const totalReponses = all.filter(
      (c) =>
        c.statut === 'entretien' ||
        c.statut === 'refusee' ||
        c.statut === 'acceptee',
    ).length;
    const totalRefusees = all.filter((c) => c.statut === 'refusee').length;
    const tauxReponse =
      totalEnvoyees > 0
        ? Math.round((totalReponses / totalEnvoyees) * 100)
        : 0;

    // Gather entreprises for context
    const entreprises = all.map((c) => `${c.poste} chez ${c.entreprise}`);

    // 3. Call OpenAI
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Tu es NAYHA. Analyse le mois de recherche d'emploi de cette femme. Avec ses statistiques, fournis :
- analyse : Ce qui a fonctionné, ce qui n'a pas fonctionné (2-3 phrases)
- strategie : Stratégie concrète ajustée pour le mois prochain (3-4 points)

Tutoiement. Sois spécifique avec les chiffres. Ne la blâme jamais. Si le taux de réponse est faible, suggère de changer de canaux, pas de changer qui elle est.

Retourne en JSON : { "analyse": "...", "strategie": "..." }`,
        },
        {
          role: 'user',
          content: `Mois : ${mois}
Candidatures envoyées : ${totalEnvoyees}
Entretiens obtenus : ${totalEntretiens}
Réponses reçues : ${totalReponses}
Refus : ${totalRefusees}
Taux de réponse : ${tauxReponse}%
Candidatures détaillées : ${entreprises.join(', ') || 'Aucune ce mois-ci'}

Génère l'analyse et la stratégie.`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI returned empty response');
    }

    const parsed = JSON.parse(content);

    // 4. Save to bilans_mensuels
    const { data: bilan, error: insertError } = await this.supabase
      .from('bilans_mensuels')
      .insert({
        user_id: userId,
        mois,
        total_envoyees: totalEnvoyees,
        total_entretiens: totalEntretiens,
        total_reponses: totalReponses,
        taux_reponse: tauxReponse,
        analyse: parsed.analyse,
        strategie: parsed.strategie,
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(insertError.message);
    }

    return bilan;
  }

  // ─── Entretien Debrief ───────────────────────────────────────

  async generateEntretienDebrief(
    userId: string,
    candidatureId: string,
    ressenti: 'bien' | 'mitige' | 'difficile',
  ) {
    // 1. Fetch candidature
    const { data: candidature, error: candidatureError } = await this.supabase
      .from('candidatures')
      .select('entreprise, poste, offre_text')
      .eq('id', candidatureId)
      .eq('user_id', userId)
      .single();

    if (candidatureError || !candidature) {
      throw new NotFoundException('Candidature not found');
    }

    const offerContext = candidature.offre_text
      ? `\nOffre d'emploi :\n${candidature.offre_text}`
      : '';

    const ressentiLabel =
      ressenti === 'bien'
        ? "s'est bien passé"
        : ressenti === 'mitige'
          ? 'était mitigé'
          : 'a été difficile';

    // 2. Call OpenAI
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Tu es NAYHA. Elle vient de passer un entretien chez ${candidature.entreprise} pour le poste de ${candidature.poste} et elle sent que ça ${ressentiLabel}. Génère un court debrief :
- Si "bien" : renforce ce qu'elle a probablement bien fait, prépare les prochaines étapes
- Si "mitigé" : normalise le doute, identifie ce qu'il faut garder
- Si "difficile" : valide ses émotions, extrais les apprentissages, encourage

Tutoiement obligatoire. Sois concrète et bienveillante.

Retourne en JSON : { "debrief": "2-3 paragraphes", "pointsCles": ["string"], "pourLaProchaineFois": "string" }`,
        },
        {
          role: 'user',
          content: `Entreprise : ${candidature.entreprise}
Poste : ${candidature.poste}
Ressenti : ${ressenti}${offerContext}

Génère le debrief.`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI returned empty response');
    }

    const parsed = JSON.parse(content);

    return {
      debrief: parsed.debrief || '',
      pointsCles: Array.isArray(parsed.pointsCles) ? parsed.pointsCles : [],
      pourLaProchaineFois: parsed.pourLaProchaineFois || '',
    };
  }

  // ── Simulation d'entretien ────────────────────────────────────────────────

  async generateSimulationQuestions(userId: string, candidatureId: string) {
    // 1. Fetch candidature
    const { data: candidature, error: candidatureError } = await this.supabase
      .from('candidatures')
      .select('entreprise, poste, offre_text')
      .eq('id', candidatureId)
      .eq('user_id', userId)
      .single();

    if (candidatureError || !candidature) {
      throw new NotFoundException('Candidature not found');
    }

    // 2. Fetch user profile for context
    const { data: profile } = await this.supabase
      .from('user_profiles')
      .select('diagnostic_vie_data, diagnostic_pro_data, portrait_data')
      .eq('id', userId)
      .single();

    const portraitContext =
      profile?.portrait_data?.portrait
        ? `\nSon portrait de force : ${profile.portrait_data.portrait}`
        : '';

    const offerContext = candidature.offre_text
      ? `\n=== OFFRE D'EMPLOI ===\n${candidature.offre_text}`
      : '';

    // 3. Generate questions
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Tu es un recruteur expérimenté qui fait passer un entretien pour le poste de ${candidature.poste} chez ${candidature.entreprise}.

Génère exactement 6 questions d'entretien réalistes et progressives, dans l'ordre d'un vrai entretien :
1. Présentation / parcours
2. Motivation pour ce poste
3. Compétence technique ou mise en situation
4. Question DIFFICILE : la pause professionnelle ou un trou dans le parcours
5. Question DIFFICILE : les prétentions salariales
6. Question DIFFICILE : un échec ou une difficulté

Les questions doivent être SPÉCIFIQUES à l'offre et au poste — pas génériques.
${portraitContext}
${offerContext}

Retourne en JSON : { "questions": [{ "text": "string", "hard": boolean }] }`,
        },
        {
          role: 'user',
          content: `Poste : ${candidature.poste}\nEntreprise : ${candidature.entreprise}\n\nGénère les 6 questions.`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('OpenAI returned empty response');

    const parsed = JSON.parse(content);
    return {
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
    };
  }

  async generateSimulationFeedback(
    userId: string,
    candidatureId: string,
    questionText: string,
    answer: string,
  ) {
    // 1. Fetch candidature for context
    const { data: candidature } = await this.supabase
      .from('candidatures')
      .select('entreprise, poste, offre_text')
      .eq('id', candidatureId)
      .eq('user_id', userId)
      .single();

    if (!candidature) {
      throw new NotFoundException('Candidature not found');
    }

    const offerContext = candidature.offre_text
      ? `\nOffre : ${candidature.offre_text.substring(0, 500)}`
      : '';

    // 2. Generate feedback
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Tu es un coach en entretien d'embauche. Elle passe un entretien pour ${candidature.poste} chez ${candidature.entreprise}.

Évalue sa réponse à la question du recruteur. Sois bienveillante, concrète, et constructive. Tutoiement obligatoire.

Pour chaque réponse, donne :
- fort : ce qui était bien dans sa réponse (1-2 phrases)
- ameliorer : ce qui peut être amélioré (1-2 phrases)
- reformulation : une version mieux formulée de sa réponse (2-3 phrases, en gardant SES idées mais mieux structurées)

Retourne en JSON : { "fort": "string", "ameliorer": "string", "reformulation": "string" }`,
        },
        {
          role: 'user',
          content: `Question du recruteur : « ${questionText} »\n\nSa réponse : « ${answer} »${offerContext}\n\nÉvalue sa réponse.`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('OpenAI returned empty response');

    return JSON.parse(content);
  }

  async generateSimulationScore(
    userId: string,
    candidatureId: string,
    questionsAndAnswers: { question: string; answer: string }[],
  ) {
    // 1. Fetch candidature
    const { data: candidature } = await this.supabase
      .from('candidatures')
      .select('entreprise, poste')
      .eq('id', candidatureId)
      .eq('user_id', userId)
      .single();

    if (!candidature) {
      throw new NotFoundException('Candidature not found');
    }

    // 2. Format Q&A
    const qaText = questionsAndAnswers
      .map(
        (qa, i) =>
          `Q${i + 1}: ${qa.question}\nR${i + 1}: ${qa.answer}`,
      )
      .join('\n\n');

    // 3. Generate score
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Tu es un coach en entretien. Elle vient de terminer une simulation pour ${candidature.poste} chez ${candidature.entreprise}.

Évalue l'ensemble de ses réponses. Donne :
- Un score sur 10 (sois juste mais encourageante)
- Les 3 points principaux à travailler avant le vrai entretien
- Un message d'encouragement personnalisé

Tutoiement obligatoire.

Retourne en JSON : { "score": number, "pointsATravailler": ["string", "string", "string"], "message": "string" }`,
        },
        {
          role: 'user',
          content: `Poste : ${candidature.poste}\nEntreprise : ${candidature.entreprise}\n\n${qaText}\n\nÉvalue l'ensemble.`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('OpenAI returned empty response');

    return JSON.parse(content);
  }
}
