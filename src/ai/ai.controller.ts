import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { SupabaseJwtGuard } from '../auth/guards/supabase-jwt.guard';
import {
  AuthUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { AiService } from './ai.service';

@Controller('ai')
@UseGuards(SupabaseJwtGuard)
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

  @Post('evaluate')
  evaluateAdequation(
    @CurrentUser() user: AuthUser,
    @Body('metierId') metierId: string,
  ) {
    return this.aiService.evaluateAdequation(user.id, metierId);
  }

  @Post('analyse-offres')
  generateAnalyseOffres(
    @CurrentUser() user: AuthUser,
    @Body('offers') offers: string[],
  ) {
    return this.aiService.generateAnalyseOffres(user.id, offers);
  }

  @Post('linkedin-profile')
  generateLinkedinProfile(
    @CurrentUser() user: AuthUser,
    @Body('profileText') profileText: string,
    @Body('enrichments') enrichments: any,
    @Body('targetRole') targetRole?: string,
  ) {
    return this.aiService.generateLinkedinProfile(
      user.id,
      profileText,
      enrichments,
      targetRole,
    );
  }

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
    );
  }

  @Post('lettre-motivation')
  generateLettreMotivation(
    @CurrentUser() user: AuthUser,
    @Body('jobOffer') jobOffer?: string,
    @Body('targetRole') targetRole?: string,
    @Body('company') company?: string,
    @Body('isSpontaneous') isSpontaneous?: boolean,
  ) {
    return this.aiService.generateLettreMotivation(
      user.id,
      jobOffer,
      targetRole,
      company,
      isSpontaneous,
    );
  }

  @Post('relance')
  generateRelanceMessage(
    @CurrentUser() user: AuthUser,
    @Body('candidatureId') candidatureId: string,
  ) {
    return this.aiService.generateRelanceMessage(user.id, candidatureId);
  }

  @Post('bilan-mensuel')
  generateBilanMensuel(@CurrentUser() user: AuthUser) {
    return this.aiService.generateBilanMensuel(user.id);
  }

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
}
