import { Controller, Get, Param, Post, Query, Body } from '@nestjs/common';
import { FranceTravailService } from './france-travail.service';

@Controller('ft')
export class FranceTravailController {
  constructor(private readonly ftService: FranceTravailService) {}

  // ---- SYNC (manual trigger) ----

  @Post('sync')
  async syncAll() {
    const results = await this.ftService.syncAll();
    return { status: 'ok', synced: results };
  }

  // ---- ROME queries (from local DB) ----

  @Get('metiers')
  getMetiers() {
    return this.ftService.getMetiers();
  }

  @Get('metiers/search')
  searchMetiers(@Query('q') query: string) {
    return this.ftService.searchMetiers(query || '');
  }

  @Get('metiers/:code')
  getMetier(@Param('code') code: string) {
    return this.ftService.getMetier(code);
  }

  @Get('competences')
  getCompetences() {
    return this.ftService.getCompetences();
  }

  @Get('fiches-metiers/:code')
  getFicheMetier(@Param('code') code: string) {
    return this.ftService.getFicheMetier(code);
  }

  @Get('fiches-metiers/:code/full')
  getFullFicheMetier(@Param('code') code: string) {
    return this.ftService.getFullFicheMetier(code);
  }

  @Get('contextes-travail')
  getContextesTravail() {
    return this.ftService.getContextesTravail();
  }

  // ---- Premium: Rapport d'employabilité ----

  @Get('premium/salaires/:codeRome')
  getSalaires(
    @Param('codeRome') codeRome: string,
    @Query('typeTerritoire') typeTerritoire?: string,
    @Query('codeTerritoire') codeTerritoire?: string,
  ) {
    return this.ftService.getSalaires(
      codeRome,
      typeTerritoire || 'NAT',
      codeTerritoire || 'FR',
    );
  }

  @Get('premium/offres/:codeRome')
  getStatOffres(
    @Param('codeRome') codeRome: string,
    @Query('typeTerritoire') typeTerritoire?: string,
    @Query('codeTerritoire') codeTerritoire?: string,
  ) {
    return this.ftService.getStatOffres(
      codeRome,
      typeTerritoire || 'NAT',
      codeTerritoire || 'FR',
    );
  }

  @Get('premium/tension/:codeRome')
  getPerspectives(
    @Param('codeRome') codeRome: string,
    @Query('typeTerritoire') typeTerritoire?: string,
    @Query('codeTerritoire') codeTerritoire?: string,
  ) {
    return this.ftService.getPerspectivesRecrutement(
      codeRome,
      typeTerritoire || 'NAT',
      codeTerritoire || 'FR',
    );
  }

  @Get('premium/entreprises/:codeRome')
  searchEntreprises(
    @Param('codeRome') codeRome: string,
    @Query('latitude') latitude: string,
    @Query('longitude') longitude: string,
    @Query('distance') distance?: string,
  ) {
    return this.ftService.searchEntreprises(
      codeRome,
      parseFloat(latitude),
      parseFloat(longitude),
      distance ? parseInt(distance) : 30,
    );
  }

  @Get('premium/rapport/:codeRome')
  getRapportEmployabilite(
    @Param('codeRome') codeRome: string,
    @Query('latitude') latitude?: string,
    @Query('longitude') longitude?: string,
    @Query('typeTerritoire') typeTerritoire?: string,
    @Query('codeTerritoire') codeTerritoire?: string,
  ) {
    return this.ftService.getRapportEmployabilite(
      codeRome,
      latitude ? parseFloat(latitude) : undefined,
      longitude ? parseFloat(longitude) : undefined,
      typeTerritoire || 'NAT',
      codeTerritoire || 'FR',
    );
  }
}
