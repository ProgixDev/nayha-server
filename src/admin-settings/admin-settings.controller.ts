import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AdminSettingsService } from './admin-settings.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';

@Controller('admin-settings')
export class AdminSettingsController {
  constructor(private readonly adminSettingsService: AdminSettingsService) {}

  @Get('users')
  getUsers() {
    return this.adminSettingsService.getUsers();
  }

  @Post('users')
  addUser(@Body() dto: CreateAdminUserDto) {
    return this.adminSettingsService.addUser(dto);
  }

  @Patch('users/:id')
  updateUser(@Param('id') id: string, @Body() dto: UpdateAdminUserDto) {
    return this.adminSettingsService.updateUser(id, dto);
  }

  @Delete('users/:id')
  deleteUser(@Param('id') id: string) {
    return this.adminSettingsService.deleteUser(id);
  }

  @Get('permissions')
  getPermissions() {
    return this.adminSettingsService.getPermissions();
  }

  @Patch('permissions/:role')
  updatePermissions(
    @Param('role') role: string,
    @Body() dto: UpdatePermissionsDto,
  ) {
    return this.adminSettingsService.updatePermissions(role, dto);
  }
}
