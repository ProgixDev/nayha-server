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

  // ---- Certifications CertifInfo (referentiel local) ----

  /**
   * GET /ft/certifications/search?q=aide+soignant&limit=20
   * Recherche textuelle sur le libelle du diplome.
   */
  @Get('certifications/search')
  searchCertifications(
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ) {
    return this.ftService.searchCertifications(
      query || '',
      limit ? parseInt(limit) : 20,
    );
  }

  /**
   * GET /ft/certifications/rome/J1502?activeOnly=true&limit=50
   * Retourne toutes les certifications liees a un code ROME.
   */
  @Get('certifications/rome/:codeRome')
  getCertificationsByRome(
    @Param('codeRome') codeRome: string,
    @Query('activeOnly') activeOnly?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ftService.getCertificationsByRome(codeRome, {
      activeOnly: activeOnly === 'true',
      limit: limit ? parseInt(limit) : 50,
    });
  }

  /**
   * GET /ft/certifications/111669
   * Retourne le detail complet d une certification par son Code_Diplome.
   */
  @Get('certifications/:id')
  getCertification(@Param('id') id: string) {
    return this.ftService.getCertification(parseInt(id));
  }
}

