import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common';
import {
  AuthUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { SupabaseJwtGuard } from '../auth/guards/supabase-jwt.guard';
import { RegisterPushTokenDto, RemovePushTokenDto } from './dto/push-token.dto';
import { PushService } from './push.service';

@Controller('push')
@UseGuards(SupabaseJwtGuard)
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Post('tokens')
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterPushTokenDto) {
    return this.pushService.registerToken(user.id, dto.token, dto.platform);
  }

  @Delete('tokens')
  remove(@CurrentUser() user: AuthUser, @Body() dto: RemovePushTokenDto) {
    return this.pushService.removeToken(user.id, dto.token);
  }
}
