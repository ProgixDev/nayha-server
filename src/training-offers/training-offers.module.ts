import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TrainingOffersController } from './training-offers.controller';
import { TrainingOffersService } from './training-offers.service';

@Module({
  imports: [AuthModule],
  controllers: [TrainingOffersController],
  providers: [TrainingOffersService],
})
export class TrainingOffersModule {}
