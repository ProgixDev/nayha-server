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
import { UpdateCreationJourneyDto } from './dto/update-creation-journey.dto';

type JourneySection = Record<string, unknown>;
export interface CreationJourney {
  situation: JourneySection | null;
  activite: JourneySection | null;
  marche: JourneySection | null;
  offre: JourneySection | null;
  updatedAt?: string;
}

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
      .select('creation_journey')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      this.logger.warn(`Unable to load creation context: ${error.message}`);
    }

    const completionMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `Tu es NAYHA, l’assistante IA du parcours de création d’activité en France. Tu aides la personne à comprendre l’écran en cours et à faire un petit pas concret. Réponds en français, tutoie, avec des mots simples et 80 mots maximum. Réponds d’abord à sa question; pose au plus une question courte si cela l’aide vraiment. Utilise les réponses déjà données et le contexte enregistré, ne les redemande pas. Ne prétends pas avoir validé la viabilité d’un projet ni l’éligibilité à une aide. Pour les questions juridiques, fiscales ou administratives, donne un repère prudent et oriente vers la source officielle. ${dto.screenContext ? `Écran actuel : ${dto.screenContext}` : ''}\nContexte enregistré : ${JSON.stringify(profile?.creation_journey ?? {})}\nContexte du parcours transmis par l’application (peut être incomplet) : ${JSON.stringify(dto.journeyContext ?? {}).slice(0, 6000)}`,
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

  async getJourney(userId: string): Promise<CreationJourney> {
    const { data, error } = await this.supabase
      .from('user_profiles')
      .select('creation_journey')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      this.logger.error(`Unable to read creation journey: ${error.message}`);
      throw new Error("Impossible de récupérer le parcours de création d'activité");
    }
    if (!data) throw new NotFoundException('Profil utilisateur introuvable');

    return this.normalizeJourney(data.creation_journey);
  }

  async updateJourney(
    userId: string,
    dto: UpdateCreationJourneyDto,
  ): Promise<CreationJourney> {
    if (!dto.situation && !dto.activite && !dto.marche && !dto.offre) {
      throw new BadRequestException('Aucune étape à enregistrer');
    }

    const current = await this.getJourney(userId);
    const next: CreationJourney = { ...current };

    if (dto.situation) {
      next.situation = this.validateSituation(dto.situation);
      // Revising step 1 invalidates step 2 confirmation because it may change
      // the context used to choose the activity.
      const revisedSituation = { ...dto.situation };
      delete revisedSituation.isConfirmed;
      const savedSituation = current.situation
        ? { ...current.situation }
        : null;
      if (savedSituation) delete savedSituation.isConfirmed;
      if (
        current.situation?.isConfirmed === true &&
        JSON.stringify(revisedSituation) !== JSON.stringify(savedSituation)
      ) {
        next.activite = current.activite
          ? { ...current.activite, isConfirmed: false }
          : null;
        next.marche = current.marche
          ? { ...current.marche, isConfirmed: false }
          : null;
        next.offre = current.offre
          ? { ...current.offre, isConfirmed: false }
          : null;
      }
    }

    if (dto.activite) {
      if (current.situation?.isConfirmed !== true && next.situation?.isConfirmed !== true) {
        throw new BadRequestException(
          "L'étape 1 doit être confirmée avant de valider l'activité",
        );
      }
      next.activite = this.validateActivite(dto.activite);
      const revisedActivite = { ...dto.activite };
      delete revisedActivite.isConfirmed;
      const savedActivite = current.activite ? { ...current.activite } : null;
      if (savedActivite) delete savedActivite.isConfirmed;
      if (
        current.activite?.isConfirmed === true &&
        JSON.stringify(revisedActivite) !== JSON.stringify(savedActivite)
      ) {
        next.marche = current.marche
          ? { ...current.marche, isConfirmed: false }
          : null;
        next.offre = current.offre
          ? { ...current.offre, isConfirmed: false }
          : null;
      }
    }

    if (dto.marche) {
      if (current.activite?.isConfirmed !== true && next.activite?.isConfirmed !== true) {
        throw new BadRequestException(
          "L'étape 2 doit être confirmée avant de valider l'étude de marché",
        );
      }
      next.marche = this.validateMarche(dto.marche);
      const revisedMarche = { ...dto.marche };
      delete revisedMarche.isConfirmed;
      const savedMarche = current.marche ? { ...current.marche } : null;
      if (savedMarche) delete savedMarche.isConfirmed;
      if (
        current.marche?.isConfirmed === true &&
        JSON.stringify(revisedMarche) !== JSON.stringify(savedMarche)
      ) {
        next.offre = current.offre
          ? { ...current.offre, isConfirmed: false }
          : null;
      }
    }

    if (dto.offre) {
      if (current.marche?.isConfirmed !== true && next.marche?.isConfirmed !== true) {
        throw new BadRequestException(
          "L'étape 3 doit être confirmée avant de valider l'offre et sa viabilité",
        );
      }
      next.offre = this.validateOffre(dto.offre);
    }

    next.updatedAt = new Date().toISOString();
    const { data, error } = await this.supabase
      .from('user_profiles')
      .update({ creation_journey: next })
      .eq('id', userId)
      .select('creation_journey')
      .maybeSingle();

    if (error) {
      this.logger.error(`Unable to save creation journey: ${error.message}`);
      throw new Error("Impossible d'enregistrer le parcours de création d'activité");
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
    if (input.currentStatus !== undefined && !situationStatuses.includes(String(input.currentStatus))) {
      throw new BadRequestException('Situation professionnelle invalide');
    }
    if (input.launchMode !== undefined && !launchModes.includes(String(input.launchMode))) {
      throw new BadRequestException('Mode de lancement invalide');
    }
    this.validateNumber(input.weeklyHours, 'weeklyHours', 0, 168);
    this.validateNumber(input.monthlyIncomeGoal, 'monthlyIncomeGoal', 0, 1_000_000, true);
    this.validateNumber(input.safeStartBudget, 'safeStartBudget', 0, 100_000_000, true);
    this.validateStringArray(input.strengths, 'strengths');
    this.validateOptionalString(input.timeSlotsPreference, 'timeSlotsPreference');
    this.validateOptionalString(input.mobilityPreference, 'mobilityPreference');
    this.validateConfirmation(input.isConfirmed);
    if (input.incomeNeededBy != null &&
        (typeof input.incomeNeededBy !== 'string' || Number.isNaN(Date.parse(input.incomeNeededBy)))) {
      throw new BadRequestException('Date de besoin de revenus invalide');
    }
    if (input.isConfirmed === true &&
        (!input.currentStatus || input.weeklyHours === undefined || !input.launchMode)) {
      throw new BadRequestException('Complétez votre situation avant de la confirmer');
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
    if (input.hasAssociates !== undefined && input.hasAssociates !== null &&
        typeof input.hasAssociates !== 'boolean') {
      throw new BadRequestException('Valeur invalide pour hasAssociates');
    }
    this.validateEnumArray(input.activityFamilies, 'activityFamilies', activityFamilies);
    this.validateOptionalEnum(input.targetType, 'targetType', targetTypes);
    this.validateOptionalEnum(input.salesChannel, 'salesChannel', salesChannels);
    for (const key of [
      'ideaDescription', 'operatingArea', 'regulatoryNote',
      'selectedSuggestionTitle', 'reasonsForChoice',
    ]) this.validateOptionalString(input[key], key);
    this.validateConfirmation(input.isConfirmed);
    if (input.isConfirmed === true &&
        (typeof input.ideaDescription !== 'string' || !input.ideaDescription.trim() ||
          !Array.isArray(input.activityFamilies) || input.activityFamilies.length === 0)) {
      throw new BadRequestException("Ajoutez une description et une famille d'activité avant de confirmer");
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
    this.validateOptionalEnum(input.marketDecision, 'marketDecision', marketDecisions);
    if (input.targetTestCount !== undefined &&
        (!Number.isInteger(input.targetTestCount) ||
          (input.targetTestCount as number) < 1 ||
          (input.targetTestCount as number) > 30)) {
      throw new BadRequestException('Nombre de retours cible invalide');
    }
    for (const key of ['untestedAcknowledged', 'isConfirmed']) {
      if (input[key] !== undefined && typeof input[key] !== 'boolean') {
        throw new BadRequestException(`Valeur invalide pour ${key}`);
      }
    }
    this.validateObjectArray(input.competitors, 'competitors', [
      'name', 'offer', 'observedPrice', 'source', 'zone', 'observationDate', 'url',
    ]);
    this.validateObjectArray(input.feedbacks, 'feedbacks', [
      'date', 'anonymizedProfile', 'expressedNeed', 'objections',
      'priceReaction', 'nextStep', 'isPromising',
    ], ['isPromising']);
    if (input.isConfirmed === true &&
        (typeof input.customerProblem !== 'string' ||
          !input.customerProblem.trim() ||
          typeof input.testMethod !== 'string' ||
          input.targetTestCount === undefined)) {
      throw new BadRequestException("Complétez votre plan de test avant de le confirmer");
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
    this.validateNumber(input.timePerDeliveryHours, 'timePerDeliveryHours', 0, 168);
    this.validateNumber(input.targetMonthlyNetIncome, 'targetMonthlyNetIncome', 0, 1_000_000);
    this.validateNumber(input.fixedMonthlyCosts, 'fixedMonthlyCosts', 0, 100_000_000, true);
    this.validateOptionalEnum(input.variableCostModel, 'variableCostModel', variableCostModels);
    this.validateNumber(input.variableCostValue, 'variableCostValue', 0, 100_000_000);
    if (
      input.variableCostModel === 'ratioOfRevenue' &&
      typeof input.variableCostValue === 'number' &&
      input.variableCostValue > 1
    ) {
      throw new BadRequestException('Le taux de coûts variables doit être compris entre 0 et 1');
    }
    this.validateNumber(input.socialLevyRate, 'socialLevyRate', 0, 1);
    this.validateNumber(input.monthlyBillableDays, 'monthlyBillableDays', 0, 31);
    this.validateNumber(input.monthlyCapacityUnits, 'monthlyCapacityUnits', 0, 10_000);
    this.validateNumber(input.initialStartupInvestment, 'initialStartupInvestment', 0, 100_000_000);
    this.validateNumber(input.initialCashReserve, 'initialCashReserve', 0, 100_000_000);
    this.validateNumber(input.paymentDelayDays, 'paymentDelayDays', 0, 3_650);
    if (
      input.monthlyCapacityUnits !== undefined &&
      !Number.isInteger(input.monthlyCapacityUnits)
    ) {
      throw new BadRequestException('Valeur invalide pour monthlyCapacityUnits');
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
      [input.offerTitle, input.targetCustomer, input.coreProblem, input.keyBenefit].some(
        (value) => typeof value !== 'string' || !value.trim(),
      )
    ) {
      throw new BadRequestException(
        'Complétez le nom de votre offre, sa cible, le problème et le bénéfice avant de confirmer',
      );
    }
    return { ...input };
  }

  private validateEconomicScenarios(value: unknown) {
    if (value === undefined) return;
    if (!Array.isArray(value) || value.length > 10) {
      throw new BadRequestException('Valeur invalide pour scenarios');
    }
    for (const scenario of value) {
      if (scenario === null || typeof scenario !== 'object' || Array.isArray(scenario)) {
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
      this.validateNumber(entry.volumeMonthly, 'scenarios.volumeMonthly', 0, 1_000_000);
      this.validateNumber(entry.paymentDelayDays, 'scenarios.paymentDelayDays', 0, 3_650);
      if (entry.price === undefined || entry.volumeMonthly === undefined) {
        throw new BadRequestException('Scénario économique incomplet');
      }
      for (const key of ['volumeMonthly', 'paymentDelayDays']) {
        if (entry[key] !== undefined && !Number.isInteger(entry[key])) {
          throw new BadRequestException(`Valeur invalide pour scenarios.${key}`);
        }
      }
    }
  }

  private rejectUnknownKeys(input: JourneySection, allowed: string[]) {
    const unknown = Object.keys(input).filter((key) => !allowed.includes(key));
    if (unknown.length) {
      throw new BadRequestException(`Champ(s) non pris en charge: ${unknown.join(', ')}`);
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
    if (value !== undefined &&
        (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum)) {
      throw new BadRequestException(`Valeur invalide pour ${field}`);
    }
  }

  private validateOptionalString(value: unknown, field: string) {
    if (value !== undefined && value !== null && typeof value !== 'string') {
      throw new BadRequestException(`Valeur invalide pour ${field}`);
    }
  }

  private validateStringArray(value: unknown, field: string) {
    if (value !== undefined && (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))) {
      throw new BadRequestException(`Valeur invalide pour ${field}`);
    }
  }

  private validateEnumArray(value: unknown, field: string, allowed: string[]) {
    if (value !== undefined &&
        (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !allowed.includes(item)))) {
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
            throw new BadRequestException(`Valeur invalide pour ${field}.${key}`);
          }
        } else if (typeof entry !== 'string') {
          throw new BadRequestException(`Valeur invalide pour ${field}.${key}`);
        }
      }
    }
  }

  private validateOptionalEnum(value: unknown, field: string, allowed: string[]) {
    if (value !== undefined && value !== null &&
        (typeof value !== 'string' || !allowed.includes(value))) {
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
