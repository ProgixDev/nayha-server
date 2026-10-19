import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/guards/admin.guard';
import { TrainingOffersService } from './training-offers.service';

@Controller('training-offers')
export class TrainingOffersController {
  constructor(private readonly trainingOffersService: TrainingOffersService) {}

  /** Manual import, from the admin. */
  @Post('sync')
  @HttpCode(202)
  @UseGuards(AdminGuard)
  sync() {
    return this.trainingOffersService.startSync('admin');
  }

  @Get('sync/status')
  @UseGuards(AdminGuard)
  status() {
    return this.trainingOffersService.status();
  }

  /** Nightly import, called by Supabase pg_cron with a shared secret. */
  @Post('sync/cron')
  @HttpCode(202)
  cron(@Headers('x-cron-secret') secret: string | undefined) {
    this.trainingOffersService.assertCronSecret(secret);
    return this.trainingOffersService.startSync('cron');
  }
}
