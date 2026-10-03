import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validate } from './config/env.validation';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { FranceTravailModule } from './france-travail/france-travail.module';
import { AiModule } from './ai/ai.module';
import { CandidaturesModule } from './candidatures/candidatures.module';
import { CommunityModule } from './community/community.module';
import { ReconversionModule } from './reconversion/reconversion.module';
import { CoachingModule } from './coaching/coaching.module';
import { BlogModule } from './blog/blog.module';
import { AteliersModule } from './ateliers/ateliers.module';
import { AdminSettingsModule } from './admin-settings/admin-settings.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    AuthModule,
    UsersModule,
    FranceTravailModule,
    AiModule,
    CandidaturesModule,
    CommunityModule,
    ReconversionModule,
    CoachingModule,
    BlogModule,
    AteliersModule,
    AdminSettingsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
