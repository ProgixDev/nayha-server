import { Controller, Get, Param, Post, Query } from '@nestjs/common';
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

  @Get('contextes-travail')
  getContextesTravail() {
    return this.ftService.getContextesTravail();
  }
}
