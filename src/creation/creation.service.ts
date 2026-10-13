import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { CreationCoachMessageDto } from './dto/creation-coach-message.dto';
import { CreationMarketStarterDto } from './dto/creation-market-starter.dto';
import { CreationJourneyContextDto } from './dto/creation-journey-context.dto';
import { CreationOfferStarterDto } from './dto/creation-offer-starter.dto';
import { UpdateCreationJourneyDto } from './dto/update-creation-journey.dto';

type JourneySection = Record<string, unknown>;
export interface CreationJourney {
  situation: JourneySection | null;
  activite: JourneySection | null;
  marche: JourneySection | null;
  offre: JourneySection | null;
  statut: JourneySection | null;
  demarches: JourneySection | null;
  contacts: JourneySection | null;
  updatedAt?: string;
}

/** Journey steps in order: saving a step requires the previous one. */
const journeySteps = [
  'situation',
  'activite',
  'marche',
  'offre',
  'statut',
  'demarches',
  'contacts',
] as const;
type JourneyStep = (typeof journeySteps)[number];
const missingPreviousStep: Partial<Record<JourneyStep, string>> = {
  activite: "L'étape 1 doit être confirmée avant de valider l'activité",
  marche: "L'étape 2 doit être confirmée avant de valider l'étude de marché",
  offre:
    "L'étape 3 doit être confirmée avant de valider l'offre et sa viabilité",
  statut: "L'étape 4 doit être confirmée avant de valider le statut",
  demarches: "L'étape 5 doit être confirmée avant de valider les démarches",
  contacts:
    "L'étape 6 doit être confirmée avant de valider les premiers contacts",
};

const situationStatuses = [
  'salariee',
  'demandeuseIndemnisee',
  'demandeuseNonIndemnisee',
  'independante',
  'sansActivite',
  'autre',
];
const launchModes = ['explore', 'gradualTest', 'prepareLaunch', 'pause'];
const activityFamilies = [
  'service',
  'artisanat',
  'produit',
  'commerceLocal',
  'digital',
];
const targetTypes = ['b2c', 'b2b', 'mixte'];
const salesChannels = ['local', 'enLigne', 'mixte'];
const testMethods = [
  'entretiens',
  'questionnaire',
  'prototype',
  'listeInteret',
  'autre',
];
const marketDecisions = ['continueTest', 'adjustOffer', 'otherIdea', 'pause'];
const variableCostModels = ['ratioOfRevenue', 'perUnit'];
const frameworkTypes = [
  'microEntreprise',
  'couveuseCae',
  'portageSalarial',
  'societeUnipersonnelle',
];
const fundingStatuses = ['aVerifier', 'enCours', 'confirme', 'nonConcerne'];
const offerFormats = ['presentiel', 'enLigne', 'hybride', 'produit'];
const microActivityKinds = ['vente', 'service', 'liberal'];

const marketHintKeys = [
  'problem',
  'places',
  'competitorName',
  'competitorOffer',
  'competitorPrice',
  'person',
  'need',
  'objections',
  'priceReaction',
];
const offerHintKeys = [
  'offerTitle',
  'offerContent',
  'keyBenefit',
  'targetCustomer',
  'coreProblem',
];
const hintRule = `"hints": pour chaque champ listé, un exemple court (12 mots maximum) commençant par "Ex : ", écrit pour CE projet précis (son activité, son public, sa zone), que la personne lira en gris dans un champ vide avant d'écrire. Tutoie. Jamais d'exemple générique ni d'un autre métier. `;

/** Added to every project prompt: generic advice is what users reject most. */
const groundingRule = `Tout ce que tu écris doit être propre à CE projet : appuie-toi sur son activité, son public et son canal réels tels qu'ils sont décrits. Si une phrase pourrait s'appliquer à n'importe quel projet, réécris-la. N'utilise jamais d'exemple tiré d'un autre métier ou d'un autre secteur. `;

/** Official sources the app may link to; anything else is dropped. */
const officialDomains = [
  'service-public.gouv.fr',
  'service-public.fr',
  'entreprendre.service-public.gouv.fr',
  'formalites.entreprises.gouv.fr',
  'urssaf.fr',
  'autoentrepreneur.urssaf.fr',
  'francetravail.fr',
  'inpi.fr',
  'legifrance.gouv.fr',
  'economie.gouv.fr',
  'agriculture.gouv.fr',
  'sante.gouv.fr',
  'travail-emploi.gouv.fr',
  'cma-france.fr',
  'cci.fr',
  'cnil.fr',
  'arcom.fr',
  'developer.apple.com',
  'support.google.com',
];
function officialUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value.trim());
    const host = url.hostname.replace(/^www\./, '');
    return url.protocol === 'https:' &&
      officialDomains.some(
        (domain) => host === domain || host.endsWith(`.${domain}`),
      )
      ? url.toString()
      : '';
  } catch {
    return '';
  }
}
const actionTimeframes = ['30 jours', '60 jours', '90 jours'];

/** Keeps only the expected hint fields, as short "Ex : …" strings. */
function pickHints(value: unknown, keys: string[]): Record<string, string> {
  const source =
    value !== null && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const hints: Record<string, string> = {};
  for (const key of keys) {
    const hint = source[key];
    if (typeof hint === 'string' && hint.trim()) {
      hints[key] = hint.trim().slice(0, 140);
    }
  }
  return hints;
}

@Injectable()
export class CreationService {
  private readonly logger = new Logger(CreationService.name);
  private readonly supabase: SupabaseClient;
  private readonly openai: OpenAI;

  constructor(configService: ConfigService) {
    this.supabase = createClient(
      configService.get<string>('SUPABASE_URL')!,
      configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
    this.openai = new OpenAI({
      apiKey: configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async coach(userId: string, dto: CreationCoachMessageDto) {
    const message = dto.message?.trim() ?? '';
    const history = (dto.history ?? []).slice(-16);
    const { data: profile, error } = await this.supabase
      .from('user_profiles')
      .select('creation_journey, diagnostic_vie_data, diagnostic_pro_data')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      this.logger.warn(`Unable to load creation context: ${error.message}`);
    }
    const personalFields = new Set([
      'name',
      'nom',
      'prenom',
      'firstname',
      'lastname',
      'fullname',
      'email',
      'phone',
      'telephone',
      'mobile',
      'address',
      'adresse',
      'dateofbirth',
      'birthdate',
      'datenaissance',
    ]);
    const withoutIdentity = (data: unknown): unknown => {
      if (Array.isArray(data)) return data.map(withoutIdentity);
      if (!data || typeof data !== 'object') return data;
      return Object.fromEntries(
        Object.entries(data)
          .filter(
            ([key]) =>
              !personalFields.has(key.toLowerCase().replace(/[_-]/g, '')),
          )
          .map(([key, value]) => [key, withoutIdentity(value)]),
      );
    };
    const diagnosticContext = {
      vie: withoutIdentity(profile?.diagnostic_vie_data),
      professionnel: withoutIdentity(profile?.diagnostic_pro_data),
    };

    const completionMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
      [
        {
          role: 'system',
          content: `Tu es NAYHA, l’assistante IA du parcours de création d’activité en France. Tu aides la personne à comprendre l’écran en cours et à faire un petit pas concret. Réponds en français, tutoie, avec des mots simples et 80 mots maximum. Réponds d’abord à sa question; pose au plus une question courte si cela l’aide vraiment. Utilise les réponses déjà données, le contexte enregistré et le parcours de la personne, ne les redemande pas. Appuie-toi sur les diagnostics uniquement quand ils sont utiles au projet et ne répète pas de données personnelles. Ne prétends pas avoir validé la viabilité d’un projet ni l’éligibilité à une aide. Pour les questions juridiques, fiscales ou administratives, donne un repère prudent et oriente vers la source officielle. ${dto.screenContext ? `Écran actuel : ${dto.screenContext}` : ''}\nContexte enregistré : ${JSON.stringify(profile?.creation_journey ?? {})}\nDiagnostic de vie : ${JSON.stringify(diagnosticContext.vie)}\nDiagnostic professionnel : ${JSON.stringify(diagnosticContext.professionnel)}\nContexte du parcours transmis par l’application (peut être incomplet) : ${JSON.stringify(dto.journeyContext ?? {}).slice(0, 6000)}`,
        },
        ...history.map((turn) =>
          turn.role === 'assistant'
            ? ({ role: 'assistant', content: turn.content } as const)
            : ({ role: 'user', content: turn.content } as const),
        ),
        ...(!message && history.length === 0
          ? [
              {
                role: 'user' as const,
                content:
                  'La personne ouvre l’assistant. Accueille-la brièvement, présente ton aide pour son projet de création et pose une seule question ouverte.',
              },
            ]
          : []),
        ...(message ? [{ role: 'user' as const, content: message }] : []),
      ];

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.5,
        max_tokens: 180,
        messages: completionMessages,
      });
      const reply = completion.choices[0]?.message?.content?.trim();
      if (!reply) throw new Error('OpenAI returned an empty creation reply');
      return { reply };
    } catch (cause) {
      // OpenAI errors carry useful status/code fields, while the raw SDK
      // error object can contain request metadata. Log only the diagnostic
      // fields needed to distinguish credentials, quota, rate limits, and
      // model/request failures; never log the API key or conversation.
      const openAiError =
        typeof cause === 'object' && cause !== null
          ? (cause as {
              status?: unknown;
              code?: unknown;
              type?: unknown;
              message?: unknown;
            })
          : undefined;
      const detail = [
        `status=${String(openAiError?.status ?? 'unknown')}`,
        `code=${String(openAiError?.code ?? 'unknown')}`,
        `type=${String(openAiError?.type ?? 'unknown')}`,
        `message=${cause instanceof Error ? cause.message : String(cause)}`,
      ].join(' ');
      this.logger.error(`Creation coach request failed: ${detail}`);
      throw new ServiceUnavailableException(
        'NAYHA ne peut pas répondre pour le moment. Réessaie dans un instant.',
      );
    }
  }

  async generateActivitySuggestions(userId: string) {
    const { data: profile, error } = await this.supabase
      .from('user_profiles')
      .select('diagnostic_vie_data, diagnostic_pro_data, creation_journey')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      this.logger.error(
        `Unable to load diagnostics for activity ideas: ${error.message}`,
      );
      throw new ServiceUnavailableException(
        'Les diagnostics ne sont pas disponibles pour le moment.',
      );
    }
    if (!profile) throw new NotFoundException('Profil utilisateur introuvable');

    const diagnosticVie = profile.diagnostic_vie_data as Record<
      string,
      unknown
    > | null;
    const diagnosticPro = profile.diagnostic_pro_data as Record<
      string,
      unknown
    > | null;
    if (!diagnosticVie && !diagnosticPro) {
      throw new BadRequestException(
        'Complète au moins un diagnostic pour recevoir des pistes personnalisées.',
      );
    }

    // The diagnostics provide the person's background; direct identifiers
    // aren't needed to suggest an activity.
    const personalFields = new Set([
      'name',
      'nom',
      'prenom',
      'firstName',
      'lastName',
    ]);
    const withoutIdentity = (data: Record<string, unknown> | null) => {
      if (!data) return null;
      return Object.fromEntries(
        Object.entries(data).filter(([key]) => !personalFields.has(key)),
      );
    };
    const journey = (profile.creation_journey ?? {}) as {
      situation?: Record<string, unknown> | null;
    };
    const context = {
      diagnosticVie: withoutIdentity(diagnosticVie),
      diagnosticPro: withoutIdentity(diagnosticPro),
      situationCreation: journey.situation ?? null,
    };

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 1800,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              `Tu aides une personne en France à imaginer une activité indépendante réaliste à partir de ses diagnostics de vie et professionnel. ` +
              `Ancre chaque proposition dans ses compétences transférables, expériences, intérêts, motivations et contraintes effectivement renseignés, mais ne la limite pas à son métier actuel ni à la vente directe de son savoir-faire. ` +
              `Aide-la à voir plus large : croise ses forces avec des besoins d'autres secteurs, de nouveaux publics, des produits ou outils numériques, et des projets co-construits avec une personne experte du domaine. ` +
              `Par exemple, une expérience en développement logiciel peut servir à créer un outil pour un secteur qu'elle connaît, en le concevant avec une professionnelle de ce secteur; ne reprends cet exemple que s'il correspond réellement au profil. ` +
              `Sur les 5 pistes, propose au moins 2 transferts vers un autre domaine, un produit ou un partenariat lorsque le parcours contient des compétences transférables; garde des pistes variées et ne force pas une idée sans lien crédible. ` +
              `Ne répète pas une donnée personnelle sensible et ne déduis pas de capacité à partir de l'âge ou d'une situation familiale. ` +
              `Propose exactement 5 pistes distinctes, concrètes et accessibles à explorer. Ne transforme pas automatiquement chaque idée en prestation de service indépendante. ` +
              `N'invente ni diplôme, ni expérience, ni obligation réglementaire. Si une activité peut être réglementée, précise qu'il faut vérifier les conditions officielles. ` +
              `Réponds uniquement en JSON avec cette forme: {"suggestions":[{"label":"libellé court de 2 à 5 mots pour une puce","title":"nom concret de l'activité","category":"thématique ou secteur à explorer","subtitle":"description en une phrase qui rend l'idée concrète","whyThisFits":"compétence ou expérience transférable qui rend la piste crédible","complementaryPartner":"personne experte ou partenaire utile pour co-construire et vérifier le besoin, ou indique qu'aucun partenaire n'est indispensable","family":"service|artisanat|produit|commerceLocal|digital","target":"b2c|b2b|mixte","channel":"local|enLigne|mixte","tasks":"missions concrètes","public":"clientèle visée","resources":"moyens de départ","constraints":"contrainte ou point de vigilance","prereq":"formation ou vérification nécessaire, ou aucun prérequis particulier identifié","isRegulated":false}]}. ` +
              `Écris en français, tutoie, reste encourageante et prudente.`,
          },
          {
            role: 'user',
            content: `Diagnostics et situation de création : ${JSON.stringify(context).slice(0, 16000)}`,
          },
        ],
      });

      const content = completion.choices[0]?.message?.content?.trim();
      if (!content)
        throw new Error('OpenAI returned empty activity suggestions');
      const parsed = JSON.parse(content) as { suggestions?: unknown };
      if (
        !Array.isArray(parsed.suggestions) ||
        parsed.suggestions.length === 0
      ) {
        throw new Error('OpenAI returned no activity suggestions');
      }

      const text = (value: unknown, maxLength: number) =>
        typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
      const allowedFamilies = new Set(activityFamilies);
      const allowedTargets = new Set(targetTypes);
      const allowedChannels = new Set(salesChannels);
      const suggestions = parsed.suggestions.slice(0, 5).map((value) => {
        if (typeof value !== 'object' || value === null) {
          throw new Error('OpenAI returned an invalid activity suggestion');
        }
        const suggestion = value as Record<string, unknown>;
        const family = text(suggestion.family, 40);
        const target = text(suggestion.target, 20);
        const channel = text(suggestion.channel, 20);
        const normalized = {
          label: text(suggestion.label, 48),
          title: text(suggestion.title, 100),
          category: text(suggestion.category, 48),
          subtitle: text(suggestion.subtitle, 180),
          whyThisFits: text(suggestion.whyThisFits, 180),
          complementaryPartner:
            text(suggestion.complementaryPartner, 180) ||
            'Valide le besoin avec une personne du domaine avant de te lancer.',
          family: allowedFamilies.has(family) ? family : 'service',
          target: allowedTargets.has(target) ? target : 'mixte',
          channel: allowedChannels.has(channel) ? channel : 'mixte',
          tasks: text(suggestion.tasks, 240),
          public: text(suggestion.public, 160),
          resources: text(suggestion.resources, 160),
          constraints: text(suggestion.constraints, 180),
          prereq: text(suggestion.prereq, 180),
          isRegulated: suggestion.isRegulated === true,
        };
        if (!normalized.label || !normalized.title || !normalized.category) {
          throw new Error('OpenAI returned an incomplete activity suggestion');
        }
        return normalized;
      });

      return { suggestions };
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      this.logger.error(`Activity suggestion generation failed: ${detail}`);
      throw new ServiceUnavailableException(
        'Les pistes personnalisées sont momentanément indisponibles. Réessaie dans un instant.',
      );
    }
  }

  async generateMarketStarter(userId: string, dto: CreationMarketStarterDto) {
    const { data: profile, error } = await this.supabase
      .from('user_profiles')
      .select('creation_journey, diagnostic_pro_data')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      this.logger.warn(
        `Unable to load market starter context: ${error.message}`,
      );
    }

    const journey = (profile?.creation_journey ?? {}) as {
      situation?: Record<string, unknown> | null;
      activite?: Record<string, unknown> | null;
    };
    const activite = dto.activite ?? journey.activite ?? null;
    const idea =
      typeof activite?.ideaDescription === 'string'
        ? activite.ideaDescription.trim()
        : '';
    if (!idea) {
      throw new BadRequestException(
        "Décris d'abord ton idée d'activité à l'étape 2.",
      );
    }
    const context = {
      activite,
      situation: dto.situation ?? journey.situation ?? null,
      // Only the professional background helps here; the life diagnostic
      // would add personal details without improving the market drafts.
      diagnosticPro: (profile?.diagnostic_pro_data ?? null) as unknown,
    };

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.6,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              `Tu aides une personne qui débute dans la création d'activité en France à préparer l'étude de son marché. Elle n'a aucune connaissance en marketing. ` +
              groundingRule +
              `À partir de son idée, propose des points de départ simples qu'elle pourra corriger. Utilise des mots du quotidien, sans jargon (pas de "persona", "B2B", "segment", "lead"). Tutoie la personne dans "problems", "places" et "alternatives" ; seules les "questions" sont au vouvoiement. ` +
              `"problems": 3 formulations différentes du problème que vivent ses futurs clients, chacune en une phrase courte qui dit qui, dans quelle situation et ce qui est difficile. Décris le problème, pas la solution. ` +
              `"places": 5 endroits concrets, en ligne ou près de chez elle, où rencontrer ces personnes pour leur parler (label de 2 à 5 mots, detail d'une phrase). Adapte-les au canal et à la zone indiqués. ` +
              `"alternatives": 3 types de solutions que ces personnes utilisent déjà aujourd'hui (concurrents, solutions gratuites ou « faire soi-même »). Donne des types génériques, jamais de nom d'entreprise. "typicalPrice" donne un ordre de prix courant en France si tu le connais, sinon une chaîne vide. ` +
              `"questions": 3 questions ouvertes à poser à un futur client, au vouvoiement, sur son vécu et non sur l'idée (pas de « est-ce que vous achèteriez »). ` +
              `N'invente aucune donnée chiffrée sur la taille du marché. Ne répète aucune donnée personnelle. ` +
              hintRule +
              `Champs de "hints" : problem (le problème de ses clients), places (où les rencontrer), competitorName (une solution concurrente), competitorOffer (ce qu'elle propose), competitorPrice (son prix), person (profil anonyme d'une personne interrogée, sans nom), need (ce que cette personne dit de son besoin), objections (ses hésitations), priceReaction (ce qu'elle dépense ou paierait). ` +
              `Réponds uniquement en JSON: {"problems":["..."],"places":[{"label":"...","detail":"..."}],"alternatives":[{"name":"...","offer":"...","typicalPrice":"..."}],"questions":["..."],"hints":{"problem":"Ex : ...","places":"Ex : ...","competitorName":"Ex : ...","competitorOffer":"Ex : ...","competitorPrice":"Ex : ...","person":"Ex : ...","need":"Ex : ...","objections":"Ex : ...","priceReaction":"Ex : ..."}}`,
          },
          {
            role: 'user',
            content: `Contexte du projet : ${JSON.stringify(context).slice(0, 8000)}`,
          },
        ],
      });

      const content = completion.choices[0]?.message?.content?.trim();
      if (!content) throw new Error('OpenAI returned an empty market starter');
      const parsed = JSON.parse(content) as Record<string, unknown>;

      const text = (value: unknown, maxLength: number) =>
        typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
      const list = (value: unknown): unknown[] =>
        Array.isArray(value) ? (value as unknown[]) : [];
      const record = (value: unknown) =>
        value !== null && typeof value === 'object'
          ? (value as Record<string, unknown>)
          : {};

      const problems = list(parsed.problems)
        .map((value) => text(value, 220))
        .filter(Boolean)
        .slice(0, 3);
      const places = list(parsed.places)
        .map((value) => ({
          label: text(record(value).label, 48),
          detail: text(record(value).detail, 160),
        }))
        .filter((place) => place.label)
        .slice(0, 5);
      const alternatives = list(parsed.alternatives)
        .map((value) => ({
          name: text(record(value).name, 80),
          offer: text(record(value).offer, 160),
          typicalPrice: text(record(value).typicalPrice, 60),
        }))
        .filter((alternative) => alternative.name)
        .slice(0, 3);
      const questions = list(parsed.questions)
        .map((value) => text(value, 200))
        .filter(Boolean)
        .slice(0, 3);
      if (!problems.length || !places.length) {
        throw new Error('OpenAI returned an incomplete market starter');
      }

      return {
        problems,
        places,
        alternatives,
        questions,
        hints: pickHints(parsed.hints, marketHintKeys),
      };
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      this.logger.error(`Market starter generation failed: ${detail}`);
      throw new ServiceUnavailableException(
        'Les propositions de NAYHA sont momentanément indisponibles. Tu peux remplir cette étape avec tes mots.',
      );
    }
  }

  async generateOfferStarter(userId: string, dto: CreationOfferStarterDto) {
    const { data: profile, error } = await this.supabase
      .from('user_profiles')
      .select('creation_journey')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      this.logger.warn(
        `Unable to load offer starter context: ${error.message}`,
      );
    }

    const journey = (profile?.creation_journey ?? {}) as {
      situation?: Record<string, unknown> | null;
      activite?: Record<string, unknown> | null;
      marche?: Record<string, unknown> | null;
    };
    const activite = dto.activite ?? journey.activite ?? null;
    if (
      typeof activite?.ideaDescription !== 'string' ||
      !activite.ideaDescription.trim()
    ) {
      throw new BadRequestException(
        "Décris d'abord ton idée d'activité à l'étape 2.",
      );
    }
    const context = {
      situation: dto.situation ?? journey.situation ?? null,
      activite,
      marche: dto.marche ?? journey.marche ?? null,
    };

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.4,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              `Tu aides une personne qui débute dans la création d'activité en France à rédiger sa première offre. Elle ne connaît ni le marketing ni la gestion. ` +
              groundingRule +
              `Pars de son idée, de son public, du problème décrit et des retours de terrain fournis. Écris avec des mots simples, en tutoyant, sans jargon ni superlatifs. ` +
              `"offerTitle": nom concret de l'offre en 3 à 7 mots. "targetCustomer": le public précis en quelques mots, en minuscules (ex: "parents actifs de jeunes enfants"). ` +
              `"keyBenefit": ce que le client gagne, commençant par un verbe à l'infinitif, en minuscules (ex: "retrouver du temps le soir"). ` +
              `"offerContent": ce que le client reçoit concrètement (durée, quantité, format). ` +
              `"offerFormat": une valeur parmi presentiel, enLigne, hybride, produit. ` +
              `"activityKind": vente si elle vend surtout des produits, service si c'est une prestation artisanale ou commerciale, liberal si c'est du conseil, de l'accompagnement, de la formation ou une activité intellectuelle. ` +
              `"priceLow" et "priceHigh": fourchette de prix courante en France pour une offre comparable, en euros, nombres entiers. Tiens compte des prix observés dans les retours et la concurrence s'ils existent. "priceUnit": l'unité (ex: "par séance", "par pièce", "par mois"). "priceRationale": une phrase qui explique d'où vient la fourchette. ` +
              `"timePerSaleHours": temps de travail réaliste pour une vente, préparation comprise, en heures (nombre). "monthlyFixedCosts": frais fixes mensuels typiques pour démarrer petit (assurance, outils, téléphone), en euros. ` +
              `Ne promets pas de résultat et n'invente pas de chiffre de marché. ` +
              hintRule +
              `Champs de "hints" : offerTitle, offerContent, keyBenefit, targetCustomer, coreProblem. Ils doivent proposer une autre formulation que tes propositions, pour donner une idée sans recopier. ` +
              `Réponds uniquement en JSON: {"offerTitle":"","targetCustomer":"","keyBenefit":"","offerContent":"","offerFormat":"","activityKind":"","priceLow":0,"priceHigh":0,"priceUnit":"","priceRationale":"","timePerSaleHours":0,"monthlyFixedCosts":0,"hints":{"offerTitle":"Ex : ...","offerContent":"Ex : ...","keyBenefit":"Ex : ...","targetCustomer":"Ex : ...","coreProblem":"Ex : ..."}}`,
          },
          {
            role: 'user',
            content: `Contexte du projet : ${JSON.stringify(context).slice(0, 8000)}`,
          },
        ],
      });

      const content = completion.choices[0]?.message?.content?.trim();
      if (!content) throw new Error('OpenAI returned an empty offer starter');
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const text = (value: unknown, maxLength: number) =>
        typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
      const amount = (value: unknown, max: number) =>
        typeof value === 'number' && Number.isFinite(value) && value >= 0
          ? Math.min(Math.round(value * 10) / 10, max)
          : 0;
      const offerFormat = text(parsed.offerFormat, 20);
      const activityKind = text(parsed.activityKind, 20);
      const priceLow = amount(parsed.priceLow, 100_000);
      const priceHigh = Math.max(amount(parsed.priceHigh, 100_000), priceLow);

      const starter = {
        offerTitle: text(parsed.offerTitle, 100),
        targetCustomer: text(parsed.targetCustomer, 120),
        keyBenefit: text(parsed.keyBenefit, 180),
        offerContent: text(parsed.offerContent, 240),
        offerFormat: offerFormats.includes(offerFormat) ? offerFormat : '',
        activityKind: microActivityKinds.includes(activityKind)
          ? activityKind
          : 'service',
        priceLow,
        priceHigh,
        priceUnit: text(parsed.priceUnit, 40),
        priceRationale: text(parsed.priceRationale, 220),
        timePerSaleHours: amount(parsed.timePerSaleHours, 80),
        monthlyFixedCosts: amount(parsed.monthlyFixedCosts, 10_000),
        hints: pickHints(parsed.hints, offerHintKeys),
      };
      if (!starter.offerTitle || !starter.keyBenefit) {
        throw new Error('OpenAI returned an incomplete offer starter');
      }
      return starter;
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      this.logger.error(`Offer starter generation failed: ${detail}`);
      throw new ServiceUnavailableException(
        'Les propositions de NAYHA sont momentanément indisponibles. Tu peux remplir ton offre avec tes mots.',
      );
    }
  }

  /** Saved journey merged with the fresher sections sent by the app. */
  private async journeyContext(userId: string, dto: CreationJourneyContextDto) {
    const { data, error } = await this.supabase
      .from('user_profiles')
      .select('creation_journey')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      this.logger.warn(`Unable to load journey context: ${error.message}`);
    }
    const saved = this.normalizeJourney(data?.creation_journey);
    const context = {
      situation: dto.situation ?? saved.situation,
      activite: dto.activite ?? saved.activite,
      marche: dto.marche ?? saved.marche,
      offre: dto.offre ?? saved.offre,
      statut: dto.statut ?? saved.statut,
    };
    const idea = context.activite?.ideaDescription;
    if (typeof idea !== 'string' || !idea.trim()) {
      throw new BadRequestException(
        "Décris d'abord ton idée d'activité à l'étape 2.",
      );
    }
    return context;
  }

  private async askJson(
    label: string,
    system: string,
    context: unknown,
    maxTokens: number,
    temperature = 0.4,
  ): Promise<Record<string, unknown>> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: `Contexte du projet : ${JSON.stringify(context).slice(0, 9000)}`,
          },
        ],
      });
      const content = completion.choices[0]?.message?.content?.trim();
      if (!content) throw new Error(`OpenAI returned an empty ${label}`);
      return JSON.parse(content) as Record<string, unknown>;
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      this.logger.error(`${label} generation failed: ${detail}`);
      throw new ServiceUnavailableException(
        'Les propositions de NAYHA sont momentanément indisponibles. Réessaie dans un instant.',
      );
    }
  }

  async generateDemarchesStarter(
    userId: string,
    dto: CreationJourneyContextDto,
  ) {
    const context = await this.journeyContext(userId, dto);
    const parsed = await this.askJson(
      'Demarches starter',
      `Tu es une conseillère en création d'entreprise en France. À partir de la description précise du projet (idée, public, canal, format et contenu de l'offre), liste les obligations et vérifications réglementaires propres à CETTE activité. ` +
        `Avant de répondre, passe en revue chacune de ces questions et garde chaque point qui s'applique au projet : ` +
        `1) Le public : des enfants ou des mineurs, des personnes vulnérables, des patients, des professionnels ? ` +
        `2) Les données : le projet collecte-t-il des données personnelles (comptes, suivi, paiements, données de santé, données d'enfants) ? Si oui : RGPD, registre et information des personnes, consentement parental pour les moins de 15 ans, politique de confidentialité, CNIL. ` +
        `3) Le canal : application mobile, site, vente ou abonnement en ligne ? Si oui : règles de publication des stores (Apple App Store, Google Play, et leurs règles spécifiques pour les applis destinées aux enfants), mentions légales, CGU ou CGV, droit de rétractation et résiliation des abonnements, accessibilité. ` +
        `4) Un produit physique : normes de sécurité (ex. marquage CE des jouets), étiquetage, hygiène alimentaire, DDPP. ` +
        `5) Le métier : diplôme, carte professionnelle, déclaration ou autorisation, assurance obligatoire propre au métier. ` +
        `6) Le contenu : droits d'auteur des textes, images, musiques et contenus pédagogiques utilisés, dépôt de la marque à l'INPI. ` +
        `N'inclus PAS les démarches générales de création : immatriculation, choix du statut, compte bancaire, facturation, ACRE, assurance RC Pro générale. ` +
        `Chaque règle doit nommer l'élément concret du projet qui la déclenche (ex. "Ton appli s'adresse à des enfants : …"). Une règle qui pourrait s'appliquer à n'importe quelle activité est interdite. ` +
        `Renvoie une liste vide uniquement si le projet ne touche réellement à aucun de ces sujets. N'invente ni article de loi, ni montant, ni délai : en cas de doute, écris "à vérifier auprès de …". ` +
        `Donne 3 à 6 règles, de la plus importante à la moins importante. Pour chaque règle : "title" (une action courte commençant par un verbe), "description" (une à deux phrases simples, en tutoyant, qui disent pourquoi pour ce projet et auprès de qui vérifier), "obligation" ("obligatoire" si c'est une obligation légale certaine pour ce projet, sinon "aVerifier"), "officialUrl" (page officielle en https si tu en es sûre, sinon chaîne vide). ` +
        `Réponds uniquement en JSON: {"requirements":[{"title":"","description":"","obligation":"","officialUrl":""}]}`,
      {
        activite: context.activite,
        marche: context.marche
          ? { customerProblem: context.marche.customerProblem }
          : null,
        offre: context.offre,
        statut: context.statut,
      },
      1100,
      0.2,
    );
    const text = (value: unknown, max: number) =>
      typeof value === 'string' ? value.trim().slice(0, max) : '';
    const requirements = (
      Array.isArray(parsed.requirements)
        ? (parsed.requirements as unknown[])
        : []
    )
      .map((value) => {
        const item =
          value !== null && typeof value === 'object'
            ? (value as Record<string, unknown>)
            : {};
        return {
          title: text(item.title, 120),
          description: text(item.description, 320),
          obligation:
            item.obligation === 'obligatoire' ? 'obligatoire' : 'aVerifier',
          officialUrl: officialUrl(item.officialUrl),
        };
      })
      .filter((item) => item.title)
      .slice(0, 6);
    return { requirements };
  }

  async generateContactsStarter(
    userId: string,
    dto: CreationJourneyContextDto,
  ) {
    const context = await this.journeyContext(userId, dto);
    const parsed = await this.askJson(
      'Contacts starter',
      `Tu aides une personne qui débute à trouver ses premiers clients en France, sans expérience commerciale et sans gros budget. ` +
        groundingRule +
        `Appuie-toi sur son offre, son public, les lieux repérés pour rencontrer ses clients et les échanges déjà notés (notamment les personnes qui veulent une suite). Tutoie, mots simples, aucune technique agressive ni achat de publicité au départ. ` +
        `"actions": 6 actions concrètes et réalistes vu son temps disponible : 3 pour "30 jours", 2 pour "60 jours", 1 pour "90 jours". Chaque action : "timeframe" (30 jours, 60 jours ou 90 jours), "channel" (2 à 4 mots : où ou avec qui), "title" (commence par un verbe, cite son offre, un lieu ou un public réel de son projet), "description" (comment faire, en une ou deux phrases). ` +
        `"announcementMessage": un message court (60 mots max) qu'elle peut envoyer à son entourage pour annoncer son activité et demander des recommandations, au tutoiement, chaleureux, sans formule commerciale, signé "[Ton prénom]". ` +
        `Réponds uniquement en JSON: {"actions":[{"timeframe":"","channel":"","title":"","description":""}],"announcementMessage":""}`,
      {
        situation: context.situation,
        activite: context.activite,
        marche: context.marche,
        offre: context.offre,
      },
      1100,
    );
    const text = (value: unknown, max: number) =>
      typeof value === 'string' ? value.trim().slice(0, max) : '';
    const actions = (
      Array.isArray(parsed.actions) ? (parsed.actions as unknown[]) : []
    )
      .map((value) => {
        const item =
          value !== null && typeof value === 'object'
            ? (value as Record<string, unknown>)
            : {};
        const timeframe = text(item.timeframe, 20);
        return {
          timeframe: actionTimeframes.includes(timeframe)
            ? timeframe
            : '30 jours',
          channel: text(item.channel, 40),
          title: text(item.title, 140),
          description: text(item.description, 280),
        };
      })
      .filter((action) => action.title)
      .slice(0, 8);
    if (!actions.length) {
      throw new ServiceUnavailableException(
        'Les propositions de NAYHA sont momentanément indisponibles. Réessaie dans un instant.',
      );
    }
    return {
      actions,
      announcementMessage: text(parsed.announcementMessage, 600),
    };
  }

  async getJourney(userId: string): Promise<CreationJourney> {
    const { data, error } = await this.supabase
      .from('user_profiles')
      .select('creation_journey')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      this.logger.error(`Unable to read creation journey: ${error.message}`);
      throw new Error(
        "Impossible de récupérer le parcours de création d'activité",
      );
    }
    if (!data) throw new NotFoundException('Profil utilisateur introuvable');

    return this.normalizeJourney(data.creation_journey);
  }

  async updateJourney(
    userId: string,
    dto: UpdateCreationJourneyDto,
  ): Promise<CreationJourney> {
    if (!journeySteps.some((step) => dto[step])) {
      throw new BadRequestException('Aucune étape à enregistrer');
    }

    const validators: Record<
      JourneyStep,
      (input: JourneySection) => JourneySection
    > = {
      situation: (input) => this.validateSituation(input),
      activite: (input) => this.validateActivite(input),
      marche: (input) => this.validateMarche(input),
      offre: (input) => this.validateOffre(input),
      statut: (input) => this.validateStatut(input),
      demarches: (input) => this.validateDemarches(input),
      contacts: (input) => this.validateContacts(input),
    };
    const withoutConfirmation = (section: JourneySection | null) => {
      if (!section) return null;
      const copy = { ...section };
      delete copy.isConfirmed;
      return JSON.stringify(copy);
    };

    const current = await this.getJourney(userId);
    const next: CreationJourney = { ...current };

    journeySteps.forEach((step, index) => {
      const input = dto[step];
      if (!input) return;
      const previous = journeySteps[index - 1];
      if (
        previous &&
        current[previous]?.isConfirmed !== true &&
        next[previous]?.isConfirmed !== true
      ) {
        throw new BadRequestException(missingPreviousStep[step]);
      }
      next[step] = validators[step](input);
      // Revising a confirmed step reopens every later step, because they
      // were built on the previous answers.
      if (
        current[step]?.isConfirmed === true &&
        withoutConfirmation(input) !== withoutConfirmation(current[step])
      ) {
        for (const later of journeySteps.slice(index + 1)) {
          const saved = current[later];
          next[later] = saved ? { ...saved, isConfirmed: false } : null;
        }
      }
    });

    next.updatedAt = new Date().toISOString();
    const { data, error } = await this.supabase
      .from('user_profiles')
      .update({ creation_journey: next })
      .eq('id', userId)
      .select('creation_journey')
      .maybeSingle();

    if (error) {
      this.logger.error(`Unable to save creation journey: ${error.message}`);
      throw new Error(
        "Impossible d'enregistrer le parcours de création d'activité",
      );
    }
    if (!data) throw new NotFoundException('Profil utilisateur introuvable');

    return this.normalizeJourney(data.creation_journey);
  }

  private normalizeJourney(value: unknown): CreationJourney {
    const journey = this.asObject(value);
    return {
      situation: this.asObjectOrNull(journey.situation),
      activite: this.asObjectOrNull(journey.activite),
      marche: this.asObjectOrNull(journey.marche),
      offre: this.asObjectOrNull(journey.offre),
      statut: this.asObjectOrNull(journey.statut),
      demarches: this.asObjectOrNull(journey.demarches),
      contacts: this.asObjectOrNull(journey.contacts),
      ...(typeof journey.updatedAt === 'string'
        ? { updatedAt: journey.updatedAt }
        : {}),
    };
  }

  private validateSituation(input: JourneySection): JourneySection {
    this.rejectUnknownKeys(input, [
      'currentStatus',
      'weeklyHours',
      'monthlyIncomeGoal',
      'incomeNeededBy',
      'safeStartBudget',
      'launchMode',
      'strengths',
      'timeSlotsPreference',
      'mobilityPreference',
      'isConfirmed',
    ]);
    if (
      input.currentStatus !== undefined &&
      !situationStatuses.includes(String(input.currentStatus))
    ) {
      throw new BadRequestException('Situation professionnelle invalide');
    }
    if (
      input.launchMode !== undefined &&
      !launchModes.includes(String(input.launchMode))
    ) {
      throw new BadRequestException('Mode de lancement invalide');
    }
    this.validateNumber(input.weeklyHours, 'weeklyHours', 0, 168);
    this.validateNumber(
      input.monthlyIncomeGoal,
      'monthlyIncomeGoal',
      0,
      1_000_000,
      true,
    );
    this.validateNumber(
      input.safeStartBudget,
      'safeStartBudget',
      0,
      100_000_000,
      true,
    );
    this.validateStringArray(input.strengths, 'strengths');
    this.validateOptionalString(
      input.timeSlotsPreference,
      'timeSlotsPreference',
    );
    this.validateOptionalString(input.mobilityPreference, 'mobilityPreference');
    this.validateConfirmation(input.isConfirmed);
    if (
      input.incomeNeededBy != null &&
      (typeof input.incomeNeededBy !== 'string' ||
        Number.isNaN(Date.parse(input.incomeNeededBy)))
    ) {
      throw new BadRequestException('Date de besoin de revenus invalide');
    }
    if (
      input.isConfirmed === true &&
      (!input.currentStatus ||
        input.weeklyHours === undefined ||
        !input.launchMode)
    ) {
      throw new BadRequestException(
        'Complétez votre situation avant de la confirmer',
      );
    }
    return { ...input };
  }

  private validateActivite(input: JourneySection): JourneySection {
    this.rejectUnknownKeys(input, [
      'hasExistingIdea',
      'ideaDescription',
      'activityFamilies',
      'targetType',
      'salesChannel',
      'operatingArea',
      'hasAssociates',
      'isRegulated',
      'regulatoryNote',
      'selectedSuggestionTitle',
      'reasonsForChoice',
      'isConfirmed',
    ]);
    for (const key of ['hasExistingIdea', 'isRegulated', 'isConfirmed']) {
      if (input[key] !== undefined && typeof input[key] !== 'boolean') {
        throw new BadRequestException(`Valeur invalide pour ${key}`);
      }
    }
    if (
      input.hasAssociates !== undefined &&
      input.hasAssociates !== null &&
      typeof input.hasAssociates !== 'boolean'
    ) {
      throw new BadRequestException('Valeur invalide pour hasAssociates');
    }
    this.validateEnumArray(
      input.activityFamilies,
      'activityFamilies',
      activityFamilies,
    );
    this.validateOptionalEnum(input.targetType, 'targetType', targetTypes);
    this.validateOptionalEnum(
      input.salesChannel,
      'salesChannel',
      salesChannels,
    );
    for (const key of [
      'ideaDescription',
      'operatingArea',
      'regulatoryNote',
      'selectedSuggestionTitle',
      'reasonsForChoice',
    ])
      this.validateOptionalString(input[key], key);
    this.validateConfirmation(input.isConfirmed);
    if (
      input.isConfirmed === true &&
      (typeof input.ideaDescription !== 'string' ||
        !input.ideaDescription.trim() ||
        !Array.isArray(input.activityFamilies) ||
        input.activityFamilies.length === 0)
    ) {
      throw new BadRequestException(
        "Ajoutez une description et une famille d'activité avant de confirmer",
      );
    }
    return { ...input };
  }

  private validateMarche(input: JourneySection): JourneySection {
    this.rejectUnknownKeys(input, [
      'customerProblem',
      'customerLocations',
      'testMethod',
      'targetTestCount',
      'competitors',
      'feedbacks',
      'marketDecision',
      'untestedAcknowledged',
      'isConfirmed',
    ]);
    for (const key of ['customerProblem', 'customerLocations']) {
      this.validateOptionalString(input[key], key);
    }
    this.validateOptionalEnum(input.testMethod, 'testMethod', testMethods);
    this.validateOptionalEnum(
      input.marketDecision,
      'marketDecision',
      marketDecisions,
    );
    if (
      input.targetTestCount !== undefined &&
      (!Number.isInteger(input.targetTestCount) ||
        (input.targetTestCount as number) < 1 ||
        (input.targetTestCount as number) > 30)
    ) {
      throw new BadRequestException('Nombre de retours cible invalide');
    }
    for (const key of ['untestedAcknowledged', 'isConfirmed']) {
      if (input[key] !== undefined && typeof input[key] !== 'boolean') {
        throw new BadRequestException(`Valeur invalide pour ${key}`);
      }
    }
    this.validateObjectArray(input.competitors, 'competitors', [
      'name',
      'offer',
      'observedPrice',
      'source',
      'zone',
      'observationDate',
      'url',
    ]);
    this.validateObjectArray(
      input.feedbacks,
      'feedbacks',
      [
        'date',
        'anonymizedProfile',
        'expressedNeed',
        'objections',
        'priceReaction',
        'nextStep',
        'isPromising',
      ],
      ['isPromising'],
    );
    if (
      input.isConfirmed === true &&
      (typeof input.customerProblem !== 'string' ||
        !input.customerProblem.trim() ||
        typeof input.testMethod !== 'string' ||
        input.targetTestCount === undefined)
    ) {
      throw new BadRequestException(
        'Complétez votre plan de test avant de le confirmer',
      );
    }
    return { ...input };
  }

  private validateOffre(input: JourneySection): JourneySection {
    this.rejectUnknownKeys(input, [
      'offerTitle',
      'targetCustomer',
      'coreProblem',
      'keyBenefit',
      'offerContent',
      'offerFormat',
      'salesChannel',
      'termsAndConditions',
      'proposedPrice',
      'priceUnit',
      'timePerDeliveryHours',
      'pitchExpress',
      'targetMonthlyNetIncome',
      'fixedMonthlyCosts',
      'isFixedCostsConfirmedZero',
      'variableCostModel',
      'variableCostValue',
      'socialLevyRate',
      'monthlyBillableDays',
      'monthlyCapacityUnits',
      'initialStartupInvestment',
      'initialCashReserve',
      'paymentDelayDays',
      'scenarios',
      'isConfirmed',
    ]);

    for (const key of [
      'offerTitle',
      'targetCustomer',
      'coreProblem',
      'keyBenefit',
      'offerContent',
      'offerFormat',
      'salesChannel',
      'termsAndConditions',
      'priceUnit',
      'pitchExpress',
    ]) {
      this.validateOptionalString(input[key], key);
    }
    for (const key of ['isFixedCostsConfirmedZero', 'isConfirmed']) {
      if (input[key] !== undefined && typeof input[key] !== 'boolean') {
        throw new BadRequestException(`Valeur invalide pour ${key}`);
      }
    }
    this.validateNumber(input.proposedPrice, 'proposedPrice', 0, 100_000_000);
    this.validateNumber(
      input.timePerDeliveryHours,
      'timePerDeliveryHours',
      0,
      168,
    );
    this.validateNumber(
      input.targetMonthlyNetIncome,
      'targetMonthlyNetIncome',
      0,
      1_000_000,
    );
    this.validateNumber(
      input.fixedMonthlyCosts,
      'fixedMonthlyCosts',
      0,
      100_000_000,
      true,
    );
    this.validateOptionalEnum(
      input.variableCostModel,
      'variableCostModel',
      variableCostModels,
    );
    this.validateNumber(
      input.variableCostValue,
      'variableCostValue',
      0,
      100_000_000,
    );
    if (
      input.variableCostModel === 'ratioOfRevenue' &&
      typeof input.variableCostValue === 'number' &&
      input.variableCostValue > 1
    ) {
      throw new BadRequestException(
        'Le taux de coûts variables doit être compris entre 0 et 1',
      );
    }
    this.validateNumber(input.socialLevyRate, 'socialLevyRate', 0, 1);
    this.validateNumber(
      input.monthlyBillableDays,
      'monthlyBillableDays',
      0,
      31,
    );
    this.validateNumber(
      input.monthlyCapacityUnits,
      'monthlyCapacityUnits',
      0,
      10_000,
    );
    this.validateNumber(
      input.initialStartupInvestment,
      'initialStartupInvestment',
      0,
      100_000_000,
    );
    this.validateNumber(
      input.initialCashReserve,
      'initialCashReserve',
      0,
      100_000_000,
    );
    this.validateNumber(input.paymentDelayDays, 'paymentDelayDays', 0, 3_650);
    if (
      input.monthlyCapacityUnits !== undefined &&
      !Number.isInteger(input.monthlyCapacityUnits)
    ) {
      throw new BadRequestException(
        'Valeur invalide pour monthlyCapacityUnits',
      );
    }
    if (
      input.paymentDelayDays !== undefined &&
      !Number.isInteger(input.paymentDelayDays)
    ) {
      throw new BadRequestException('Valeur invalide pour paymentDelayDays');
    }
    this.validateEconomicScenarios(input.scenarios);
    this.validateConfirmation(input.isConfirmed);
    if (
      input.isConfirmed === true &&
      [
        input.offerTitle,
        input.targetCustomer,
        input.coreProblem,
        input.keyBenefit,
      ].some((value) => typeof value !== 'string' || !value.trim())
    ) {
      throw new BadRequestException(
        'Complétez le nom de votre offre, sa cible, le problème et le bénéfice avant de confirmer',
      );
    }
    return { ...input };
  }

  private validateStatut(input: JourneySection): JourneySection {
    this.rejectUnknownKeys(input, [
      'chosenFramework',
      'hasChosenFramework',
      'frameworkReason',
      'areRightsOpen',
      'fundingItems',
      'initialPersonalContribution',
      'isConfirmed',
    ]);
    this.validateOptionalEnum(
      input.chosenFramework,
      'chosenFramework',
      frameworkTypes,
    );
    for (const key of ['hasChosenFramework', 'areRightsOpen', 'isConfirmed']) {
      if (input[key] !== undefined && typeof input[key] !== 'boolean') {
        throw new BadRequestException(`Valeur invalide pour ${key}`);
      }
    }
    this.validateOptionalString(input.frameworkReason, 'frameworkReason');
    this.validateObjectArray(input.fundingItems, 'fundingItems', [
      'name',
      'description',
      'potentialAmount',
      'officialUrl',
      'status',
    ]);
    for (const item of (input.fundingItems as JourneySection[]) ?? []) {
      this.validateOptionalEnum(
        item.status,
        'fundingItems.status',
        fundingStatuses,
      );
    }
    this.validateNumber(
      input.initialPersonalContribution,
      'initialPersonalContribution',
      0,
      100_000_000,
    );
    return { ...input };
  }

  private validateDemarches(input: JourneySection): JourneySection {
    this.rejectUnknownKeys(input, ['alreadyCreated', 'items', 'isConfirmed']);
    for (const key of ['alreadyCreated', 'isConfirmed']) {
      if (input[key] !== undefined && typeof input[key] !== 'boolean') {
        throw new BadRequestException(`Valeur invalide pour ${key}`);
      }
    }
    this.validateObjectArray(
      input.items,
      'items',
      [
        'id',
        'category',
        'title',
        'description',
        'obligation',
        'officialUrl',
        'isCompleted',
      ],
      ['isCompleted'],
    );
    if (Array.isArray(input.items) && input.items.length > 40) {
      throw new BadRequestException('Trop de démarches');
    }
    return { ...input };
  }

  private validateContacts(input: JourneySection): JourneySection {
    this.rejectUnknownKeys(input, [
      'selectedChannels',
      'weeklyActionLimit',
      'actions',
      'results',
      'announcementMessage',
      'isConfirmed',
    ]);
    if (
      input.isConfirmed !== undefined &&
      typeof input.isConfirmed !== 'boolean'
    ) {
      throw new BadRequestException('Valeur de confirmation invalide');
    }
    this.validateStringArray(input.selectedChannels, 'selectedChannels');
    this.validateOptionalString(
      input.announcementMessage,
      'announcementMessage',
    );
    this.validateNumber(input.weeklyActionLimit, 'weeklyActionLimit', 0, 50);
    this.validateObjectArray(
      input.actions,
      'actions',
      ['id', 'timeframe', 'channel', 'title', 'description', 'isCompleted'],
      ['isCompleted'],
    );
    if (Array.isArray(input.actions) && input.actions.length > 40) {
      throw new BadRequestException('Trop d’actions');
    }
    if (input.results !== undefined) {
      if (
        input.results === null ||
        typeof input.results !== 'object' ||
        Array.isArray(input.results)
      ) {
        throw new BadRequestException('Valeur invalide pour results');
      }
      const results = input.results as JourneySection;
      this.rejectUnknownKeys(results, [
        'qualifiedContactsCount',
        'meetingsCount',
        'offersSentCount',
        'salesCount',
        'collectedRevenue',
        'notes',
      ]);
      for (const key of [
        'qualifiedContactsCount',
        'meetingsCount',
        'offersSentCount',
        'salesCount',
      ]) {
        this.validateNumber(results[key], `results.${key}`, 0, 100_000);
      }
      this.validateNumber(
        results.collectedRevenue,
        'results.collectedRevenue',
        0,
        100_000_000,
      );
      this.validateOptionalString(results.notes, 'results.notes');
    }
    return { ...input };
  }

  private validateEconomicScenarios(value: unknown) {
    if (value === undefined) return;
    if (!Array.isArray(value) || value.length > 10) {
      throw new BadRequestException('Valeur invalide pour scenarios');
    }
    for (const scenario of value) {
      if (
        scenario === null ||
        typeof scenario !== 'object' ||
        Array.isArray(scenario)
      ) {
        throw new BadRequestException('Valeur invalide pour scenarios');
      }
      const entry = scenario as Record<string, unknown>;
      this.rejectUnknownKeys(entry, [
        'name',
        'price',
        'volumeMonthly',
        'paymentDelayDays',
      ]);
      if (typeof entry.name !== 'string' || !entry.name.trim()) {
        throw new BadRequestException('Valeur invalide pour scenarios.name');
      }
      this.validateNumber(entry.price, 'scenarios.price', 0, 100_000_000);
      this.validateNumber(
        entry.volumeMonthly,
        'scenarios.volumeMonthly',
        0,
        1_000_000,
      );
      this.validateNumber(
        entry.paymentDelayDays,
        'scenarios.paymentDelayDays',
        0,
        3_650,
      );
      if (entry.price === undefined || entry.volumeMonthly === undefined) {
        throw new BadRequestException('Scénario économique incomplet');
      }
      for (const key of ['volumeMonthly', 'paymentDelayDays']) {
        if (entry[key] !== undefined && !Number.isInteger(entry[key])) {
          throw new BadRequestException(
            `Valeur invalide pour scenarios.${key}`,
          );
        }
      }
    }
  }

  private rejectUnknownKeys(input: JourneySection, allowed: string[]) {
    const unknown = Object.keys(input).filter((key) => !allowed.includes(key));
    if (unknown.length) {
      throw new BadRequestException(
        `Champ(s) non pris en charge: ${unknown.join(', ')}`,
      );
    }
  }

  private validateNumber(
    value: unknown,
    field: string,
    minimum: number,
    maximum: number,
    nullable = false,
  ) {
    if (value === null && nullable) return;
    if (
      value !== undefined &&
      (typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < minimum ||
        value > maximum)
    ) {
      throw new BadRequestException(`Valeur invalide pour ${field}`);
    }
  }

  private validateOptionalString(value: unknown, field: string) {
    if (value !== undefined && value !== null && typeof value !== 'string') {
      throw new BadRequestException(`Valeur invalide pour ${field}`);
    }
  }

  private validateStringArray(value: unknown, field: string) {
    if (
      value !== undefined &&
      (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
    ) {
      throw new BadRequestException(`Valeur invalide pour ${field}`);
    }
  }

  private validateEnumArray(value: unknown, field: string, allowed: string[]) {
    if (
      value !== undefined &&
      (!Array.isArray(value) ||
        value.some(
          (item) => typeof item !== 'string' || !allowed.includes(item),
        ))
    ) {
      throw new BadRequestException(`Valeur invalide pour ${field}`);
    }
  }

  private validateObjectArray(
    value: unknown,
    field: string,
    allowedKeys: string[],
    booleanKeys: string[] = [],
  ) {
    if (value === undefined) return;
    if (!Array.isArray(value)) {
      throw new BadRequestException(`Valeur invalide pour ${field}`);
    }
    for (const item of value) {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        throw new BadRequestException(`Valeur invalide pour ${field}`);
      }
      const record = item as Record<string, unknown>;
      this.rejectUnknownKeys(record, allowedKeys);
      for (const [key, entry] of Object.entries(record)) {
        if (booleanKeys.includes(key)) {
          if (typeof entry !== 'boolean') {
            throw new BadRequestException(
              `Valeur invalide pour ${field}.${key}`,
            );
          }
        } else if (typeof entry !== 'string') {
          throw new BadRequestException(`Valeur invalide pour ${field}.${key}`);
        }
      }
    }
  }

  private validateOptionalEnum(
    value: unknown,
    field: string,
    allowed: string[],
  ) {
    if (
      value !== undefined &&
      value !== null &&
      (typeof value !== 'string' || !allowed.includes(value))
    ) {
      throw new BadRequestException(`Valeur invalide pour ${field}`);
    }
  }

  private validateConfirmation(value: unknown) {
    if (value !== undefined && typeof value !== 'boolean') {
      throw new BadRequestException('Valeur de confirmation invalide');
    }
  }

  private asObject(value: unknown): JourneySection {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as JourneySection)
      : {};
  }

  private asObjectOrNull(value: unknown): JourneySection | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as JourneySection)
      : null;
  }
}
