import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SupabaseJwtGuard } from '../auth/guards/supabase-jwt.guard';
import {
  AuthUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { CandidaturesService } from './candidatures.service';
import { CreateCandidatureDto } from './dto/create-candidature.dto';
import { UpdateCandidatureDto } from './dto/update-candidature.dto';
import { CandidatureActionDto } from './dto/candidature-action.dto';

@Controller('candidatures')
export class CandidaturesController {
  constructor(private readonly candidaturesService: CandidaturesService) {}

  @Get('admin/all')
  listAdmin() {
    return this.candidaturesService.listAdmin();
  }

  @Get('admin/stats')
  getAdminStats() {
    return this.candidaturesService.getAdminStats();
  }

  @Get()
  @UseGuards(SupabaseJwtGuard)
  list(@CurrentUser() user: AuthUser) {
    return this.candidaturesService.list(user.id);
  }

  @Post()
  @UseGuards(SupabaseJwtGuard)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCandidatureDto) {
    return this.candidaturesService.create(user.id, dto);
  }

  @Get('stats')
  @UseGuards(SupabaseJwtGuard)
  getStats(@CurrentUser() user: AuthUser) {
    return this.candidaturesService.getStats(user.id);
  }

  @Get('triggers')
  @UseGuards(SupabaseJwtGuard)
  getTriggers(@CurrentUser() user: AuthUser) {
    return this.candidaturesService.getTriggers(user.id);
  }

  @Get('export')
  @UseGuards(SupabaseJwtGuard)
  exportData(@CurrentUser() user: AuthUser, @Query('days') queryDays?: string) {
    return this.candidaturesService.exportData(
      user.id,
      queryDays ? Number(queryDays) : 30,
    );
  }

  @Get('bilan/latest')
  @UseGuards(SupabaseJwtGuard)
  latestBilan(@CurrentUser() user: AuthUser) {
    return this.candidaturesService.getLatestBilan(user.id);
  }

  @Get(':id/relances')
  @UseGuards(SupabaseJwtGuard)
  getRelanceMessages(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.candidaturesService.getRelanceMessages(user.id, id);
  }

  @Patch(':id')
  @UseGuards(SupabaseJwtGuard)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCandidatureDto,
  ) {
    return this.candidaturesService.update(user.id, id, dto);
  }

  @Post(':id/actions')
  @UseGuards(SupabaseJwtGuard)
  recordAction(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CandidatureActionDto,
  ) {
    return this.candidaturesService.recordAction(user.id, id, dto);
  }

  @Delete(':id')
  @UseGuards(SupabaseJwtGuard)
  delete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.candidaturesService.delete(user.id, id);
  }
}
