import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentAdmin } from '../auth/decorators/current-admin.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { AdminGuard, type AdminUserContext } from '../auth/guards/admin.guard';
import { SupabaseJwtGuard } from '../auth/guards/supabase-jwt.guard';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { SupportService } from './support.service';

@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  // ── User: her own requests ────────────────────────────────────────────────

  @Get('tickets')
  @UseGuards(SupabaseJwtGuard)
  list(@CurrentUser() user: AuthUser) {
    return this.supportService.listForUser(user.id);
  }

  @Get('tickets/unread-count')
  @UseGuards(SupabaseJwtGuard)
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.supportService.unreadCountForUser(user.id);
  }

  @Post('tickets')
  @UseGuards(SupabaseJwtGuard)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTicketDto) {
    return this.supportService.createTicket(user.id, dto);
  }

  @Get('tickets/:id')
  @UseGuards(SupabaseJwtGuard)
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.supportService.getForUser(user.id, id);
  }

  @Post('tickets/:id/messages')
  @UseGuards(SupabaseJwtGuard)
  reply(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.supportService.replyAsUser(user.id, id, dto);
  }

  @Post('tickets/:id/resolve')
  @UseGuards(SupabaseJwtGuard)
  resolve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.supportService.resolveAsUser(user.id, id);
  }

  @Post('tickets/:id/reopen')
  @UseGuards(SupabaseJwtGuard)
  reopen(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.supportService.reopenAsUser(user.id, id);
  }

  @Post('attachments')
  @UseGuards(SupabaseJwtGuard)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: { buffer: Buffer; mimetype?: string } | undefined,
  ) {
    return this.supportService.uploadAttachment(user.id, file);
  }

  // ── Team: inbox ───────────────────────────────────────────────────────────

  /** ?page=&pageSize=&status=&search= */
  @Get('admin/tickets')
  @UseGuards(AdminGuard)
  adminList(@Query() query: Record<string, string | undefined>) {
    return this.supportService.listForAdmin(query);
  }

  @Get('admin/stats')
  @UseGuards(AdminGuard)
  adminStats() {
    return this.supportService.statsForAdmin();
  }

  @Get('admin/tickets/:id')
  @UseGuards(AdminGuard)
  adminGet(@Param('id', ParseUUIDPipe) id: string) {
    return this.supportService.getForAdmin(id);
  }

  @Post('admin/tickets/:id/messages')
  @UseGuards(AdminGuard)
  adminReply(
    @CurrentAdmin() admin: AdminUserContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.supportService.replyAsTeam(admin, id, dto);
  }

  @Post('admin/tickets/:id/resolve')
  @UseGuards(AdminGuard)
  adminResolve(@Param('id', ParseUUIDPipe) id: string) {
    return this.supportService.resolveAsTeam(id);
  }
}
