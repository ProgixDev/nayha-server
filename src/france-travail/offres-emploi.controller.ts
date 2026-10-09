import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SupabaseJwtGuard } from '../auth/guards/supabase-jwt.guard';
import {
  AuthUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { OffresEmploiService } from './offres-emploi.service';

@Controller('ft/offres-emploi')
@UseGuards(SupabaseJwtGuard)
export class OffresEmploiController {
  constructor(private readonly offresService: OffresEmploiService) {}

  /** Offers for the user's target métier around their city. */
  @Get()
  search(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('ville') ville?: string,
    @Query('distance', new ParseIntPipe({ optional: true })) distance?: number,
    @Query('typeContrat') typeContrat?: string,
  ) {
    return this.offresService.searchForUser(user.id, {
      q,
      ville,
      distance,
      typeContrat,
    });
  }

  /** Full offer, including the description sent to the analysis. */
  @Get(':id')
  getOffre(@Param('id') id: string) {
    return this.offresService.getOffre(id);
  }
}
