import { Module } from '@nestjs/common';
import { AteliersController } from './ateliers.controller';
import { AteliersService } from './ateliers.service';

@Module({
  controllers: [AteliersController],
  providers: [AteliersService],
  exports: [AteliersService],
})
export class AteliersModule {}
