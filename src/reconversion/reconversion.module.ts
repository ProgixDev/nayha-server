import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReconversionController } from './reconversion.controller';
import { ReconversionService } from './reconversion.service';

@Module({
  imports: [AuthModule],
  controllers: [ReconversionController],
  providers: [ReconversionService],
})
export class ReconversionModule {}
