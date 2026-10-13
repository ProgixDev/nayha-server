import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  AuthUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { SupabaseJwtGuard } from '../auth/guards/supabase-jwt.guard';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  /** Refresh the subscription after a purchase or restore in the app. */
  @Post('sync')
  @UseGuards(SupabaseJwtGuard)
  sync(@CurrentUser() user: AuthUser) {
    return this.subscriptionsService.syncUser(user.id);
  }

  /** RevenueCat server-to-server notifications (renewal, cancel, refund…). */
  @Post('revenuecat-webhook')
  @HttpCode(200)
  webhook(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ) {
    return this.subscriptionsService.handleWebhook(authorization, body);
  }
}
