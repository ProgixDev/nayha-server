import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CandidaturesController } from './candidatures.controller';
import { CandidaturesService } from './candidatures.service';

@Module({
  imports: [AuthModule],
  controllers: [CandidaturesController],
  providers: [CandidaturesService],
  exports: [CandidaturesService],
})
export class CandidaturesModule {}
