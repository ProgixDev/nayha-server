import { Global, Module } from '@nestjs/common';
import { AdminGuard } from './guards/admin.guard';
import { SupabaseJwtGuard } from './guards/supabase-jwt.guard';

/** Global so any module can protect routes with these guards. */
@Global()
@Module({
  providers: [SupabaseJwtGuard, AdminGuard],
  exports: [SupabaseJwtGuard, AdminGuard],
})
export class AuthModule {}
