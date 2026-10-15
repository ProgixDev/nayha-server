import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AdminUserContext } from '../guards/admin.guard';

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminUserContext =>
    ctx.switchToHttp().getRequest<{ admin: AdminUserContext }>().admin,
);
