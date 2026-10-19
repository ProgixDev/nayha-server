import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AppLinksService } from './app-links.service';
import { UpdateAppLinkDto } from './dto/update-app-link.dto';

@Controller()
export class AppLinksController {
  constructor(private readonly appLinksService: AppLinksService) {}

  // ── Public Endpoint for Mobile App ─────────────────────────────────────────

  @Get('config/links')
  getPublicLinks() {
    return this.appLinksService.getPublicLinks();
  }

  // ── Admin Endpoints for Admin Dashboard ────────────────────────────────────

  @Get('admin-settings/links')
  @UseGuards(AdminGuard)
  getAdminLinks(
    @Query('module') module?: string,
    @Query('step') step?: string,
    @Query('search') search?: string,
  ) {
    return this.appLinksService.getAdminLinks({ module, step, search });
  }

  @Get('admin-settings/links/categories')
  @UseGuards(AdminGuard)
  getCategories() {
    return this.appLinksService.getCategories();
  }

  @Patch('admin-settings/links/:key')
  @UseGuards(AdminGuard)
  updateLink(@Param('key') key: string, @Body() dto: UpdateAppLinkDto) {
    return this.appLinksService.updateLink(key, dto);
  }

  @Post('admin-settings/links/:key/reset')
  @UseGuards(AdminGuard)
  resetLink(@Param('key') key: string) {
    return this.appLinksService.resetLink(key);
  }
}
