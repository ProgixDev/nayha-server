import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { ReconversionController } from './reconversion.controller';
import { ReconversionService } from './reconversion.service';

@Module({
  imports: [AiModule, AuthModule],
  controllers: [ReconversionController],
  providers: [ReconversionService],
})
export class ReconversionModule {}
