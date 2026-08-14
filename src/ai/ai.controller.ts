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
}
