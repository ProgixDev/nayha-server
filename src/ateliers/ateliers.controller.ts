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
import { AdminGuard } from '../auth/guards/admin.guard';
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

  /** ?page=&pageSize=&search=&category= */
  @Get('admin/all')
  @UseGuards(AdminGuard)
  listAdmin(@Query() query: Record<string, string | undefined>) {
    return this.ateliersService.listAdminPage(query);
  }

  @Get('admin/stats')
  @UseGuards(AdminGuard)
  getStats() {
    return this.ateliersService.getStats();
  }

  @Post('admin')
  @UseGuards(AdminGuard)
  create(@Body() dto: CreateAtelierDto) {
    return this.ateliersService.create(dto);
  }

  @Patch('admin/:id')
  @UseGuards(AdminGuard)
  update(@Param('id') id: string, @Body() dto: UpdateAtelierDto) {
    return this.ateliersService.update(id, dto);
  }

  @Delete('admin/:id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.ateliersService.remove(id);
  }

  @Post(':id/track')
  trackView(@Param('id') id: string, @Body() dto: TrackAtelierViewDto) {
    return this.ateliersService.trackView(id, dto);
  }

  // ── Detail endpoint ────────────────────────────────────────────────────────

  @Get(':id')
  get(@Param('id') id: string) {
    return this.ateliersService.get(id);
  }
}
