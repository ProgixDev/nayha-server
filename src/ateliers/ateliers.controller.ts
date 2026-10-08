import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AteliersService } from './ateliers.service';
import { CreateAtelierDto } from './dto/create-atelier.dto';
import { UpdateAtelierDto } from './dto/update-atelier.dto';
import { TrackAtelierViewDto } from './dto/track-atelier-view.dto';

@Controller('ateliers')
export class AteliersController {
  constructor(private readonly ateliersService: AteliersService) {}

  // ── Public / Mobile endpoints ───────────────────────────────────────────────

  @Get()
  list(@Query('category') category?: string, @Query('search') search?: string) {
    return this.ateliersService.list(category, search);
  }

  @Get('categories')
  getCategories() {
    return this.ateliersService.getCategories();
  }

  // ── Admin endpoints ────────────────────────────────────────────────────────

  @Get('admin/all')
  listAdmin() {
    return this.ateliersService.listAdmin();
  }

  @Get('admin/stats')
  getStats() {
    return this.ateliersService.getStats();
  }

  @Post('admin')
  create(@Body() dto: CreateAtelierDto) {
    return this.ateliersService.create(dto);
  }

  @Patch('admin/:id')
  update(@Param('id') id: string, @Body() dto: UpdateAtelierDto) {
    return this.ateliersService.update(id, dto);
  }

  @Delete('admin/:id')
  remove(@Param('id') id: string) {
    return this.ateliersService.remove(id);
  }

  @Post(':id/track')
  trackView(
    @Param('id') id: string,
    @Body() dto: TrackAtelierViewDto,
  ) {
    return this.ateliersService.trackView(id, dto);
  }

  // ── Detail endpoint ────────────────────────────────────────────────────────

  @Get(':id')
  get(@Param('id') id: string) {
    return this.ateliersService.get(id);
  }
}
