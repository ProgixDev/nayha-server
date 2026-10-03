import {
  Body,
  Controller,
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
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SubmitDiagnosticVieDto } from './dto/submit-diagnostic-vie.dto';
import { SubmitDiagnosticProDto } from './dto/submit-diagnostic-pro.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ── Admin endpoints ────────────────────────────────────────────────────────

  @Get('admin/all')
  listAdmin() {
    return this.usersService.listAdmin();
  }

  @Get('admin/stats')
  getAdminStats() {
    return this.usersService.getAdminStats();
  }

  @Get('admin/:id')
  getUserById(@Param('id') id: string) {
    return this.usersService.getUserById(id);
  }

  @Patch('admin/:id/block')
  toggleBlockUser(@Param('id') id: string, @Body('is_blocked') isBlocked: boolean) {
    return this.usersService.toggleBlockUser(id, isBlocked);
  }

  // ── Authenticated User endpoints ───────────────────────────────────────────

  @Get('me')
  @UseGuards(SupabaseJwtGuard)
  getProfile(@CurrentUser() user: AuthUser) {
    return this.usersService.getProfile(user.id);
  }

  @Patch('me')
  @UseGuards(SupabaseJwtGuard)
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Post('me/diagnostic-vie')
  @UseGuards(SupabaseJwtGuard)
  submitDiagnosticVie(
    @CurrentUser() user: AuthUser,
    @Body() dto: SubmitDiagnosticVieDto,
  ) {
    return this.usersService.submitDiagnosticVie(user.id, dto);
  }

  @Post('me/diagnostic-pro')
  @UseGuards(SupabaseJwtGuard)
  submitDiagnosticPro(
    @CurrentUser() user: AuthUser,
    @Body() dto: SubmitDiagnosticProDto,
  ) {
    return this.usersService.submitDiagnosticPro(user.id, dto);
  }
}
