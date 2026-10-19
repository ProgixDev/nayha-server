import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AdminSettingsService } from './admin-settings.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';
import { AdminLoginDto } from './dto/admin-login.dto';

@Controller('admin-settings')
export class AdminSettingsController {
  constructor(private readonly adminSettingsService: AdminSettingsService) {}

  @Post('login')
  login(@Body() dto: AdminLoginDto) {
    return this.adminSettingsService.login(dto);
  }

  @Get('me')
  getMe(@Headers('authorization') auth: string) {
    return this.adminSettingsService.getMe(auth);
  }

  @Get('users')
  @UseGuards(AdminGuard)
  getUsers() {
    return this.adminSettingsService.getUsers();
  }

  @Post('users')
  @UseGuards(AdminGuard)
  addUser(@Body() dto: CreateAdminUserDto) {
    return this.adminSettingsService.addUser(dto);
  }

  @Patch('users/:id')
  @UseGuards(AdminGuard)
  updateUser(@Param('id') id: string, @Body() dto: UpdateAdminUserDto) {
    return this.adminSettingsService.updateUser(id, dto);
  }

  @Delete('users/:id')
  @UseGuards(AdminGuard)
  deleteUser(@Param('id') id: string) {
    return this.adminSettingsService.deleteUser(id);
  }

  @Get('permissions')
  @UseGuards(AdminGuard)
  getPermissions() {
    return this.adminSettingsService.getPermissions();
  }

  @Patch('permissions/:role')
  @UseGuards(AdminGuard)
  updatePermissions(
    @Param('role') role: string,
    @Body() dto: UpdatePermissionsDto,
  ) {
    return this.adminSettingsService.updatePermissions(role, dto);
  }
}
