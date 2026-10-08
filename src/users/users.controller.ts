import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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

  @Post('me/touch')
  @UseGuards(SupabaseJwtGuard)
  touchActivity(@CurrentUser() user: AuthUser) {
    return this.usersService.touchActivity(user.id);
  }

  @Post('me/avatar')
  @UseGuards(SupabaseJwtGuard)
  @UseInterceptors(FileInterceptor('file'))
  uploadAvatar(
    @CurrentUser() user: AuthUser,
    @UploadedFile()
    file: {
      buffer: Buffer;
      mimetype?: string;
      originalname?: string;
    },
  ) {
    if (!file) {
      throw new BadRequestException('Aucun fichier fourni');
    }
    return this.usersService.uploadAvatar(
      user.id,
      file.buffer,
      file.mimetype || 'image/jpeg',
    );
  }

  @Delete('me/avatar')
  @UseGuards(SupabaseJwtGuard)
  deleteAvatar(@CurrentUser() user: AuthUser) {
    return this.usersService.deleteAvatar(user.id);
  }
}
