import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import {
  CurrentUser,
  AuthUser,
} from '../auth/decorators/current-user.decorator';
import { SupabaseJwtGuard } from '../auth/guards/supabase-jwt.guard';
import { PaidFeature } from '../subscriptions/paid-feature.decorator';
import { PaidFeatureGuard } from '../subscriptions/paid-feature.guard';
import { CreationService } from './creation.service';
import { CreationCoachMessageDto } from './dto/creation-coach-message.dto';
import { CreationMarketStarterDto } from './dto/creation-market-starter.dto';
import { CreationJourneyContextDto } from './dto/creation-journey-context.dto';
import { CreationOfferStarterDto } from './dto/creation-offer-starter.dto';
import { UpdateCreationJourneyDto } from './dto/update-creation-journey.dto';

@Controller('creation')
@UseGuards(SupabaseJwtGuard, PaidFeatureGuard)
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
  @PaidFeature('chat')
  @Post('coach')
  coach(@CurrentUser() user: AuthUser, @Body() dto: CreationCoachMessageDto) {
    return this.creationService.coach(user.id, dto);
  }

  /** Generate activity ideas from the user's completed diagnostics. */
  @PaidFeature('assist')
  @Post('activity-suggestions')
  activitySuggestions(@CurrentUser() user: AuthUser) {
    return this.creationService.generateActivitySuggestions(user.id);
  }

  /** Draft market-step starting points (problem, places, alternatives) from the idea. */
  @PaidFeature('assist')
  @Post('market-starter')
  marketStarter(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreationMarketStarterDto,
  ) {
    return this.creationService.generateMarketStarter(user.id, dto);
  }

  /** Draft the step 4 offer and a realistic price range from steps 1 to 3. */
  @PaidFeature('assist')
  @Post('offer-starter')
  offerStarter(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreationOfferStarterDto,
  ) {
    return this.creationService.generateOfferStarter(user.id, dto);
  }

  /** List the rules specific to this activity to check before creating it. */
  @PaidFeature('assist')
  @Post('demarches-starter')
  demarchesStarter(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreationJourneyContextDto,
  ) {
    return this.creationService.generateDemarchesStarter(user.id, dto);
  }

  /** Draft first commercial actions and an announcement message. */
  @PaidFeature('assist')
  @Post('contacts-starter')
  contactsStarter(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreationJourneyContextDto,
  ) {
    return this.creationService.generateContactsStarter(user.id, dto);
  }
}
