import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CoachingController } from './coaching.controller';
import { CoachingService } from './coaching.service';

@Module({
  imports: [AuthModule],
  controllers: [CoachingController],
  providers: [CoachingService],
})
export class CoachingModule {}
