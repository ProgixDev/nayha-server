import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CreationController } from './creation.controller';
import { CreationService } from './creation.service';

@Module({
  imports: [AuthModule],
  controllers: [CreationController],
  providers: [CreationService],
})
export class CreationModule {}
