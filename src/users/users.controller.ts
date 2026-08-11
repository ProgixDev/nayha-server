import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
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
@UseGuards(SupabaseJwtGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getProfile(@CurrentUser() user: AuthUser) {
    return this.usersService.getProfile(user.id);
  }

  @Patch('me')
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Post('me/diagnostic-vie')
  submitDiagnosticVie(
    @CurrentUser() user: AuthUser,
    @Body() dto: SubmitDiagnosticVieDto,
  ) {
    return this.usersService.submitDiagnosticVie(user.id, dto);
  }

  @Post('me/diagnostic-pro')
  submitDiagnosticPro(
    @CurrentUser() user: AuthUser,
    @Body() dto: SubmitDiagnosticProDto,
  ) {
    return this.usersService.submitDiagnosticPro(user.id, dto);
  }
}
