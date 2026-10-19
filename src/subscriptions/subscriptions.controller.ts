import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AuthUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { AdminGuard } from '../auth/guards/admin.guard';
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

  /** Figures and one page of subscribers: ?page=&pageSize=&status=&search= */
  @Get('admin')
  @UseGuards(AdminGuard)
  listForAdmin(@Query() query: Record<string, string | undefined>) {
    return this.subscriptionsService.listForAdmin(query);
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
