import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SupabaseJwtGuard } from '../auth/guards/supabase-jwt.guard';
import {
  AuthUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { UpdateCheminPriorityDto } from './dto/update-chemin-priority.dto';
import { ReconversionService } from './reconversion.service';

@Controller('reconversion')
@UseGuards(SupabaseJwtGuard)
export class ReconversionController {
  constructor(private readonly reconversionService: ReconversionService) {}

  /**
   * First screen of "Mon chemin d'accès".
   * It combines the selected ROME métier, official certification metadata and
   * the user's existing adequation evaluation.
   */
  @Get('chemin-acces/:codeRome')
  getCheminAcces(
    @CurrentUser() user: AuthUser,
    @Param('codeRome') codeRome: string,
  ) {
    return this.reconversionService.getCheminAcces(user.id, codeRome);
  }

  /**
   * Certifications RNCP for the selected target occupation.
   * Koumoul is the primary source; CertifInfo in Supabase is used only when
   * Koumoul has no certification for this ROME code.
   */
  @Get('formations/:codeRome')
  getFormations(
    @Param('codeRome') codeRome: string,
    @Query('after') after?: string,
    @Query('source') source?: string,
  ) {
    return this.reconversionService.getFormationsByRome(codeRome, {
      after,
      source,
    });
  }

  /** Persists the prerequisite the user wants to work on first. */
  @Patch('chemin-acces/:codeRome/priorite')
  updateCheminPriority(
    @CurrentUser() user: AuthUser,
    @Param('codeRome') codeRome: string,
    @Body() dto: UpdateCheminPriorityDto,
  ) {
    return this.reconversionService.updateCheminPriority(
      user.id,
      codeRome,
      dto.prerequisId,
    );
  }
}
