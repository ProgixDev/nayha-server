import { Module } from '@nestjs/common';
import { AdminGuard } from './guards/admin.guard';
import { SupabaseJwtGuard } from './guards/supabase-jwt.guard';

@Module({
  providers: [SupabaseJwtGuard, AdminGuard],
  exports: [SupabaseJwtGuard, AdminGuard],
})
export class AuthModule {}
