import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { SupabaseJwtGuard } from '../auth/guards/supabase-jwt.guard';
import { CreationService } from './creation.service';
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
}
