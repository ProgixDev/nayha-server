import { Controller, Get, Post, UseGuards } from '@nestjs/common';
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
}
