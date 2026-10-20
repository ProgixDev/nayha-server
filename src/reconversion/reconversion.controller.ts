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
import { UpdateReconversionJourneyDto } from './dto/update-reconversion-journey.dto';
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
   * Trainings for the selected target occupation, grouped by certification,
   * from the imported catalogue (Mon Compte Formation + API Apprentissage).
   * The live sources (Apprentissage, Koumoul, CertifInfo) are the fallback.
   */
  @Get('formations/:codeRome')
  getFormations(
    @CurrentUser() user: AuthUser,
    @Param('codeRome') codeRome: string,
    @Query('after') after?: string,
    @Query('source') source?: string,
    @Query('modalite') modalite?: string,
    @Query('rayonKm') rayonKm?: string,
  ) {
    return this.reconversionService.getFormationsByRome(user.id, codeRome, {
      after,
      source,
      modalite,
      rayonKm,
    });
  }

  /**
   * Certificates linked to the job by its official ROME formacodes (e.g.
   * CACES for a cariste), shown apart from the trainings to the job.
   */
  @Get('formations/:codeRome/certificats-complementaires')
  getCertificatsComplementaires(
    @CurrentUser() user: AuthUser,
    @Param('codeRome') codeRome: string,
    @Query('after') after?: string,
    @Query('modalite') modalite?: string,
    @Query('rayonKm') rayonKm?: string,
  ) {
    return this.reconversionService.getCertificatsComplementaires(
      user.id,
      codeRome,
      { after, modalite, rayonKm },
    );
  }

  /** Providers of one certification (certificationKey of a result), closest first. */
  @Get('formations/:codeRome/organismes')
  getFormationOrganismes(
    @CurrentUser() user: AuthUser,
    @Param('codeRome') codeRome: string,
    @Query('certification') certification?: string,
    @Query('after') after?: string,
    @Query('modalite') modalite?: string,
    @Query('rayonKm') rayonKm?: string,
    @Query('complementaire') complementaire?: string,
  ) {
    return this.reconversionService.getFormationOrganismes(user.id, codeRome, {
      certification,
      after,
      modalite,
      rayonKm,
      complementaire,
    });
  }

  /** Searches certifications for ROME métiers in the target's domain whose
   * Formacodes overlap most with the target métier. */
  @Get('formations/:codeRome/domaines-proches')
  getFormationsDomainesProches(
    @CurrentUser() user: AuthUser,
    @Param('codeRome') codeRome: string,
    @Query('modalite') modalite?: string,
    @Query('rayonKm') rayonKm?: string,
  ) {
    return this.reconversionService.getFormationsDomainesProches(
      user.id,
      codeRome,
      { modalite, rayonKm },
    );
  }

  /** Returns full detail for a single training offer by its composite ID. */
  @Get('formations/:codeRome/detail')
  getFormationDetail(
    @Param('codeRome') codeRome: string,
    @Query('id') formationId?: string,
  ) {
    return this.reconversionService.getFormationDetail(codeRome, formationId);
  }

  /**
   * Returns the user's saved funding-plan choices for the given ROME code,
   * plus the formation selected during the formations step (if any).
   * The mobile client uses this to pre-fill and restore the financement screen.
   */
  @Get('financement/:codeRome')
  getFinancement(
    @CurrentUser() user: AuthUser,
    @Param('codeRome') codeRome: string,
  ) {
    return this.reconversionService.getFinancement(user.id, codeRome);
  }

  /** Restores deliberate choices made in formation exploration and immersion. */
  @Get('journey/:codeRome')
  getJourney(
    @CurrentUser() user: AuthUser,
    @Param('codeRome') codeRome: string,
  ) {
    return this.reconversionService.getJourney(user.id, codeRome);
  }

  /** Saves a partial journey section without touching the other section. */
  @Patch('journey/:codeRome')
  updateJourney(
    @CurrentUser() user: AuthUser,
    @Param('codeRome') codeRome: string,
    @Body() dto: UpdateReconversionJourneyDto,
  ) {
    return this.reconversionService.updateJourney(user.id, codeRome, dto);
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
