import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validate } from './config/env.validation';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { FranceTravailModule } from './france-travail/france-travail.module';
import { AiModule } from './ai/ai.module';
import { CandidaturesModule } from './candidatures/candidatures.module';

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
  ],
})
export class AppModule {}
