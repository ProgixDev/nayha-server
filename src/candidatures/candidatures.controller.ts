import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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

@Controller('candidatures')
@UseGuards(SupabaseJwtGuard)
export class CandidaturesController {
  constructor(private readonly candidaturesService: CandidaturesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.candidaturesService.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCandidatureDto) {
    return this.candidaturesService.create(user.id, dto);
  }

  @Get('stats')
  getStats(@CurrentUser() user: AuthUser) {
    return this.candidaturesService.getStats(user.id);
  }

  @Get('triggers')
  getTriggers(@CurrentUser() user: AuthUser) {
    return this.candidaturesService.getTriggers(user.id);
  }

  @Get(':id/relances')
  getRelanceMessages(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.candidaturesService.getRelanceMessages(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCandidatureDto,
  ) {
    return this.candidaturesService.update(user.id, id, dto);
  }

  @Delete(':id')
  delete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.candidaturesService.delete(user.id, id);
  }
}
