import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FranceTravailController } from './france-travail.controller';
import { FranceTravailService } from './france-travail.service';
import { OffresEmploiController } from './offres-emploi.controller';
import { OffresEmploiService } from './offres-emploi.service';

@Module({
  imports: [AuthModule],
  controllers: [FranceTravailController, OffresEmploiController],
  providers: [FranceTravailService, OffresEmploiService],
  exports: [FranceTravailService],
})
export class FranceTravailModule {}
