import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import {
  CurrentUser,
  AuthUser,
} from '../auth/decorators/current-user.decorator';
import { SupabaseJwtGuard } from '../auth/guards/supabase-jwt.guard';
import { CreationService } from './creation.service';
import { CreationCoachMessageDto } from './dto/creation-coach-message.dto';
import { UpdateCreationJourneyDto } from './dto/update-creation-journey.dto';

@Controller('creation')
@UseGuards(SupabaseJwtGuard)
export class CreationController {
  constructor(private readonly creationService: CreationService) {}

  /** Restore saved creation-of-activity journey progress. */
  @Get('journey')
  getJourney(@CurrentUser() user: AuthUser) {
    return this.creationService.getJourney(user.id);
  }

  /** Save one step without overwriting the other steps. */
  @Patch('journey')
  updateJourney(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateCreationJourneyDto,
  ) {
    return this.creationService.updateJourney(user.id, dto);
  }

  /** Send a contextual creation-flow question to the AI coach. */
  @Post('coach')
  coach(@CurrentUser() user: AuthUser, @Body() dto: CreationCoachMessageDto) {
    return this.creationService.coach(user.id, dto);
  }
}
