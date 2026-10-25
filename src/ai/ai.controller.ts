import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { SupabaseJwtGuard } from '../auth/guards/supabase-jwt.guard';
import { PaidFeature } from '../subscriptions/paid-feature.decorator';
import { PaidFeatureGuard } from '../subscriptions/paid-feature.guard';
import {
  AuthUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { AiService } from './ai.service';

@Controller('ai')
@UseGuards(SupabaseJwtGuard, PaidFeatureGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('portrait')
  generatePortrait(@CurrentUser() user: AuthUser) {
    return this.aiService.generatePortrait(user.id);
  }

  @Get('portrait')
  getPortrait(@CurrentUser() user: AuthUser) {
    return this.aiService.getPortrait(user.id);
  }

  @Post('plan-action')
  generatePlanAction(
    @CurrentUser() user: AuthUser,
    @Body('granddomaines') granddomaines?: string[],
  ) {
    return this.aiService.generatePlanAction(user.id, granddomaines);
  }

  @Get('plan-action')
  getPlanAction(@CurrentUser() user: AuthUser) {
    return this.aiService.getPlanAction(user.id);
  }

  // DEMO: temporarily free; restore the paid guard after the demonstration.
  // @PaidFeature('assist')
  @Post('evaluate')
  evaluateAdequation(
    @CurrentUser() user: AuthUser,
    @Body('metierId') metierId: string,
  ) {
    return this.aiService.evaluateAdequation(user.id, metierId);
  }

  // DEMO: temporarily free; restore the paid guard after the demonstration.
  // @PaidFeature('assist')
  @Post('analyse-offres')
  generateAnalyseOffres(
    @CurrentUser() user: AuthUser,
    @Body('offers') offers: string[],
  ) {
    return this.aiService.generateAnalyseOffres(user.id, offers);
  }

  @PaidFeature('document')
  @Post('linkedin-profile')
  generateLinkedinProfile(
    @CurrentUser() user: AuthUser,
    @Body('profileText') profileText?: string,
    @Body('enrichments') enrichments?: any,
  ) {
    return this.aiService.generateLinkedinProfile(
      user.id,
      profileText,
      enrichments,
    );
  }

  @PaidFeature('document')
  @Post('cv-adapte')
  adaptCv(
    @CurrentUser() user: AuthUser,
    @Body('offre_text') offreText: string,
    @Body('poste') poste: string,
  ) {
    return this.aiService.adaptCv(user.id, offreText, poste);
  }

  @PaidFeature('document')
  @Post('cv-metier')
  generateCv(
    @CurrentUser() user: AuthUser,
    @Body('experiences') experiences: any[],
    @Body('formations') formations: any[],
    @Body('competences') competences: any[],
    @Body('langues') langues: any[],
    @Body('linkedinTitre') linkedinTitre?: string,
    @Body('linkedinAPropos') linkedinAPropos?: string,
    @Body('targetRole') targetRole?: string,
    @Body('jobOffer') jobOffer?: string,
  ) {
    return this.aiService.generateCv(
      user.id,
      experiences,
      formations,
      competences,
      langues,
      linkedinTitre,
      linkedinAPropos,
      targetRole,
      jobOffer,
    );
  }

  @PaidFeature('document')
  @Post('lettre-motivation')
  generateLettreMotivation(
    @CurrentUser() user: AuthUser,
    @Body('jobOffer') jobOffer?: string,
    @Body('targetRole') targetRole?: string,
    @Body('company') company?: string,
    @Body('isSpontaneous') isSpontaneous?: boolean,
    @Body('tone') tone?: string,
  ) {
    return this.aiService.generateLettreMotivation(
      user.id,
      jobOffer,
      targetRole,
      company,
      isSpontaneous,
      tone,
    );
  }

  @PaidFeature('document')
  @Post('relance')
  generateRelanceMessage(
    @CurrentUser() user: AuthUser,
    @Body('candidatureId') candidatureId: string,
  ) {
    return this.aiService.generateRelanceMessage(user.id, candidatureId);
  }

  @PaidFeature('assist')
  @Post('bilan-mensuel')
  generateBilanMensuel(
    @CurrentUser() user: AuthUser,
    @Body('days') days?: number,
  ) {
    return this.aiService.generateBilanMensuel(user.id, days ?? 30);
  }

  @PaidFeature('assist')
  @Post('entretien-debrief')
  generateEntretienDebrief(
    @CurrentUser() user: AuthUser,
    @Body('candidatureId') candidatureId: string,
    @Body('ressenti') ressenti: 'bien' | 'mitige' | 'difficile',
  ) {
    return this.aiService.generateEntretienDebrief(
      user.id,
      candidatureId,
      ressenti,
    );
  }

  @PaidFeature('simulation')
  @Post('simulation-entretien')
  generateSimulationQuestions(
    @CurrentUser() user: AuthUser,
    @Body('candidatureId') candidatureId: string,
  ) {
    return this.aiService.generateSimulationQuestions(user.id, candidatureId);
  }

  @PaidFeature()
  @Post('simulation-feedback')
  generateSimulationFeedback(
    @CurrentUser() user: AuthUser,
    @Body('candidatureId') candidatureId: string,
    @Body('questionText') questionText: string,
    @Body('answer') answer: string,
  ) {
    return this.aiService.generateSimulationFeedback(
      user.id,
      candidatureId,
      questionText,
      answer,
    );
  }

  @PaidFeature()
  @Post('simulation-score')
  generateSimulationScore(
    @CurrentUser() user: AuthUser,
    @Body('candidatureId') candidatureId: string,
    @Body('questionsAndAnswers')
    questionsAndAnswers: { question: string; answer: string }[],
  ) {
    return this.aiService.generateSimulationScore(
      user.id,
      candidatureId,
      questionsAndAnswers,
    );
  }

  @PaidFeature('assist')
  @Post('proposition-embauche')
  generatePropositionEmbaucheHelp(
    @CurrentUser() user: AuthUser,
    @Body('candidatureId') candidatureId: string,
  ) {
    return this.aiService.generatePropositionEmbaucheHelp(
      user.id,
      candidatureId,
    );
  }

  @PaidFeature('assist')
  @Post('parcours-reussite')
  generateParcoursReussite(
    @CurrentUser() user: AuthUser,
    @Body('candidatureId') candidatureId?: string,
  ) {
    return this.aiService.generateParcoursReussite(user.id, candidatureId);
  }
}
