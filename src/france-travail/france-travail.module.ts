import { Module } from '@nestjs/common';
import { FranceTravailController } from './france-travail.controller';
import { FranceTravailService } from './france-travail.service';

@Module({
  controllers: [FranceTravailController],
  providers: [FranceTravailService],
  exports: [FranceTravailService],
})
export class FranceTravailModule {}
