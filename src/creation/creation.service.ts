import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UpdateCreationJourneyDto } from './dto/update-creation-journey.dto';

type JourneySection = Record<string, unknown>;
export interface CreationJourney {
  situation: JourneySection | null;
  activite: JourneySection | null;
  marche: JourneySection | null;
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

@Injectable()
export class CreationService {
  private readonly logger = new Logger(CreationService.name);
  private readonly supabase: SupabaseClient;

  constructor(configService: ConfigService) {
    this.supabase = createClient(
      configService.get<string>('SUPABASE_URL')!,
      configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
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
    if (!dto.situation && !dto.activite && !dto.marche) {
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
      }
    }

    if (dto.marche) {
      if (current.activite?.isConfirmed !== true && next.activite?.isConfirmed !== true) {
        throw new BadRequestException(
          "L'étape 2 doit être confirmée avant de valider l'étude de marché",
        );
      }
      next.marche = this.validateMarche(dto.marche);
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
