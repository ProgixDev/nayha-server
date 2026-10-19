import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import type { AdminUserContext } from '../auth/guards/admin.guard';
import { pageRequest } from '../common/pagination';
import { PushService } from '../push/push.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { SendMessageDto } from './dto/send-message.dto';

const BUCKET = 'support-attachments';
const SIGNED_URL_SECONDS = 60 * 60;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/webp': 'webp',
};
/** Context keys the app may attach to a ticket, and nothing else. */
const CONTEXT_KEYS = [
  'appVersion',
  'buildNumber',
  'platform',
  'osVersion',
  'locale',
] as const;

export type TicketStatus = 'waiting' | 'answered' | 'resolved';
type Author = 'user' | 'team' | 'event';
type EventCode = 'resolved_by_team' | 'resolved_by_user' | 'reopened';

interface TicketRow {
  id: string;
  user_id: string;
  topic: string;
  subject: string;
  status: TicketStatus;
  user_unread: boolean;
  admin_unread: boolean;
  last_message_preview: string;
  context: Record<string, unknown>;
  created_at: string;
  last_message_at: string;
  resolved_at: string | null;
}

interface MessageRow {
  id: string;
  ticket_id: string;
  author: Author;
  author_name: string | null;
  body: string;
  attachment_path: string | null;
  created_at: string;
}

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);
  private supabase: SupabaseClient;

  constructor(
    private configService: ConfigService,
    private pushService: PushService,
  ) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
  }

  // ── User side ─────────────────────────────────────────────────────────────

  async listForUser(userId: string) {
    const { data, error } = await this.supabase
      .from('support_tickets')
      .select('*')
      .eq('user_id', userId)
      .order('last_message_at', { ascending: false });
    if (error) this.fail('list tickets', error.message);
    return (data as TicketRow[]).map((ticket) => this.toTicket(ticket));
  }

  async unreadCountForUser(userId: string) {
    const { count, error } = await this.supabase
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('user_unread', true);
    if (error) this.fail('count unread tickets', error.message);
    return { count: count ?? 0 };
  }

  async createTicket(userId: string, dto: CreateTicketDto) {
    this.assertOwnAttachment(userId, dto.attachmentPath);
    const now = new Date().toISOString();
    const { data, error } = await this.supabase
      .from('support_tickets')
      .insert({
        user_id: userId,
        topic: dto.topic,
        subject: dto.subject || this.subjectFrom(dto.message),
        status: 'waiting',
        admin_unread: true,
        user_unread: false,
        last_message_preview: this.preview(dto.message, dto.attachmentPath),
        context: this.sanitizeContext(dto.context),
        created_at: now,
        last_message_at: now,
      })
      .select()
      .single<TicketRow>();
    if (error || !data) this.fail('create ticket', error?.message);

    await this.insertMessage(data.id, userId, {
      author: 'user',
      body: dto.message,
      attachmentPath: dto.attachmentPath,
      createdAt: now,
    });
    return this.detail(data, 'user');
  }

  async getForUser(userId: string, ticketId: string) {
    const ticket = await this.findTicket(ticketId);
    if (ticket.user_id !== userId) throw new NotFoundException();
    if (ticket.user_unread) {
      await this.updateTicket(ticketId, { user_unread: false });
      ticket.user_unread = false;
    }
    return this.detail(ticket, 'user');
  }

  async replyAsUser(userId: string, ticketId: string, dto: SendMessageDto) {
    const ticket = await this.findTicket(ticketId);
    if (ticket.user_id !== userId) throw new NotFoundException();
    this.assertMessage(dto);
    this.assertOwnAttachment(userId, dto.attachmentPath);

    // Writing again in a resolved request reopens it.
    if (ticket.status === 'resolved') {
      await this.insertEvent(ticket, 'reopened');
    }
    const now = new Date().toISOString();
    await this.insertMessage(ticket.id, userId, {
      author: 'user',
      body: dto.message ?? '',
      attachmentPath: dto.attachmentPath,
      createdAt: now,
    });
    const updated = await this.updateTicket(ticket.id, {
      status: 'waiting',
      admin_unread: true,
      user_unread: false,
      resolved_at: null,
      last_message_at: now,
      last_message_preview: this.preview(dto.message, dto.attachmentPath),
    });
    return this.detail(updated, 'user');
  }

  async resolveAsUser(userId: string, ticketId: string) {
    const ticket = await this.findTicket(ticketId);
    if (ticket.user_id !== userId) throw new NotFoundException();
    if (ticket.status === 'resolved') return this.detail(ticket, 'user');
    await this.insertEvent(ticket, 'resolved_by_user');
    const updated = await this.updateTicket(ticket.id, {
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      user_unread: false,
    });
    return this.detail(updated, 'user');
  }

  /** "Pas encore": the team's fix did not work, the request goes back to it. */
  async reopenAsUser(userId: string, ticketId: string) {
    const ticket = await this.findTicket(ticketId);
    if (ticket.user_id !== userId) throw new NotFoundException();
    if (ticket.status !== 'resolved') return this.detail(ticket, 'user');
    await this.insertEvent(ticket, 'reopened');
    const updated = await this.updateTicket(ticket.id, {
      status: 'waiting',
      resolved_at: null,
      admin_unread: true,
      user_unread: false,
    });
    return this.detail(updated, 'user');
  }

  async uploadAttachment(
    userId: string,
    file: { buffer: Buffer; mimetype?: string; size?: number } | undefined,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Aucune image reçue.');
    }
    const extension = IMAGE_TYPES[file.mimetype ?? ''];
    if (!extension) {
      throw new BadRequestException('Seules les images sont acceptées.');
    }
    if (file.buffer.length > MAX_ATTACHMENT_BYTES) {
      throw new BadRequestException('L’image dépasse 5 Mo.');
    }
    const path = `${userId}/${randomUUID()}.${extension}`;
    const { error } = await this.supabase.storage
      .from(BUCKET)
      .upload(path, file.buffer, { contentType: file.mimetype });
    if (error) this.fail('upload attachment', error.message);
    return { path, url: await this.signedUrl(path) };
  }

  // ── Team side ─────────────────────────────────────────────────────────────

  /**
   * One page of the team inbox.
   * ?page=&pageSize=&status=waiting|answered|resolved&search=
   * The search looks in the subject and the last message.
   */
  async listForAdmin(query: Record<string, string | undefined> = {}) {
    const request = pageRequest(query);
    const status = query.status;
    // Characters that would break the PostgREST "or" filter are dropped.
    const search = (query.search ?? '').replace(/[,()*%\\]/g, ' ').trim();
    let select = this.supabase
      .from('support_tickets')
      .select('*', { count: 'exact' })
      .order('last_message_at', { ascending: status !== 'waiting' })
      .range(request.from, request.to);
    if (
      status === 'waiting' ||
      status === 'answered' ||
      status === 'resolved'
    ) {
      select = select.eq('status', status);
    }
    if (search) {
      select = select.or(
        `subject.ilike.%${search}%,last_message_preview.ilike.%${search}%`,
      );
    }
    const { data, count, error } = await select;
    if (error) this.fail('list admin tickets', error.message);
    const tickets = (data ?? []) as TicketRow[];
    const people = await this.peopleById(tickets.map((t) => t.user_id));
    return {
      items: tickets.map((ticket) => ({
        ...this.toTicket(ticket, 'admin'),
        user: people.get(ticket.user_id) ?? null,
      })),
      total: count ?? 0,
      page: request.page,
      pageSize: request.pageSize,
    };
  }

  async statsForAdmin() {
    const counts: Record<TicketStatus | 'unread', number> = {
      waiting: 0,
      answered: 0,
      resolved: 0,
      unread: 0,
    };
    for (const status of ['waiting', 'answered', 'resolved'] as const) {
      const { count } = await this.supabase
        .from('support_tickets')
        .select('id', { count: 'exact', head: true })
        .eq('status', status);
      counts[status] = count ?? 0;
    }
    const { count } = await this.supabase
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('admin_unread', true);
    counts.unread = count ?? 0;
    return counts;
  }

  async getForAdmin(ticketId: string) {
    const ticket = await this.findTicket(ticketId);
    if (ticket.admin_unread) {
      await this.updateTicket(ticketId, { admin_unread: false });
      ticket.admin_unread = false;
    }
    const detail = await this.detail(ticket, 'admin');
    const people = await this.peopleById([ticket.user_id]);
    const { data: auth } = await this.supabase.auth.admin.getUserById(
      ticket.user_id,
    );
    return {
      ...detail,
      user: {
        ...(people.get(ticket.user_id) ?? { id: ticket.user_id }),
        email: auth?.user?.email ?? null,
      },
    };
  }

  async replyAsTeam(
    admin: AdminUserContext,
    ticketId: string,
    dto: SendMessageDto,
  ) {
    const ticket = await this.findTicket(ticketId);
    if (!dto.message?.trim()) {
      throw new BadRequestException('Le message est vide.');
    }
    const now = new Date().toISOString();
    await this.insertMessage(ticket.id, ticket.user_id, {
      author: 'team',
      authorName: admin.name,
      body: dto.message,
      createdAt: now,
    });
    const updated = await this.updateTicket(ticket.id, {
      status: 'answered',
      user_unread: true,
      admin_unread: false,
      resolved_at: null,
      last_message_at: now,
      last_message_preview: this.preview(dto.message),
    });
    // The content stays in the app: it can be personal.
    void this.pushService.sendToUser(ticket.user_id, {
      title: 'L’équipe NAYHA t’a répondu',
      body: 'Ouvre l’application pour lire sa réponse.',
      data: { type: 'support', ticketId: ticket.id },
    });
    return this.getForAdmin(updated.id);
  }

  async resolveAsTeam(ticketId: string) {
    const ticket = await this.findTicket(ticketId);
    if (ticket.status !== 'resolved') {
      await this.insertEvent(ticket, 'resolved_by_team');
      await this.updateTicket(ticket.id, {
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        user_unread: true,
        admin_unread: false,
      });
    }
    return this.getForAdmin(ticket.id);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async findTicket(ticketId: string): Promise<TicketRow> {
    const { data, error } = await this.supabase
      .from('support_tickets')
      .select('*')
      .eq('id', ticketId)
      .maybeSingle<TicketRow>();
    if (error) this.fail('read ticket', error.message);
    if (!data) throw new NotFoundException('Demande introuvable');
    return data;
  }

  private async updateTicket(
    ticketId: string,
    changes: Partial<TicketRow>,
  ): Promise<TicketRow> {
    const { data, error } = await this.supabase
      .from('support_tickets')
      .update(changes)
      .eq('id', ticketId)
      .select()
      .single<TicketRow>();
    if (error || !data) this.fail('update ticket', error?.message);
    return data;
  }

  private async insertMessage(
    ticketId: string,
    userId: string,
    message: {
      author: Author;
      body: string;
      authorName?: string;
      attachmentPath?: string;
      createdAt?: string;
    },
  ) {
    const { error } = await this.supabase.from('support_messages').insert({
      ticket_id: ticketId,
      user_id: userId,
      author: message.author,
      author_name: message.authorName ?? null,
      body: message.body,
      attachment_path: message.attachmentPath ?? null,
      ...(message.createdAt ? { created_at: message.createdAt } : {}),
    });
    if (error) this.fail('insert message', error.message);
  }

  private insertEvent(ticket: TicketRow, code: EventCode) {
    return this.insertMessage(ticket.id, ticket.user_id, {
      author: 'event',
      body: code,
    });
  }

  private async detail(ticket: TicketRow, viewer: 'user' | 'admin') {
    const { data, error } = await this.supabase
      .from('support_messages')
      .select('*')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: true });
    if (error) this.fail('read messages', error.message);
    const rows = data as MessageRow[];
    const paths = rows
      .map((row) => row.attachment_path)
      .filter((path): path is string => !!path);
    const urls = await this.signedUrls(paths);
    return {
      ticket: this.toTicket(ticket, viewer),
      messages: rows.map((row) => ({
        id: row.id,
        author: row.author,
        authorName: row.author === 'team' ? row.author_name : null,
        body: row.body,
        attachmentUrl: row.attachment_path
          ? (urls.get(row.attachment_path) ?? null)
          : null,
        createdAt: row.created_at,
      })),
    };
  }

  private toTicket(ticket: TicketRow, viewer: 'user' | 'admin' = 'user') {
    return {
      id: ticket.id,
      topic: ticket.topic,
      subject: ticket.subject,
      status: ticket.status,
      unread: viewer === 'user' ? ticket.user_unread : ticket.admin_unread,
      lastMessagePreview: ticket.last_message_preview,
      createdAt: ticket.created_at,
      lastMessageAt: ticket.last_message_at,
      resolvedAt: ticket.resolved_at,
      ...(viewer === 'admin' ? { context: ticket.context } : {}),
    };
  }

  /** First name, last name and journey of each user, for the team inbox. */
  private async peopleById(userIds: string[]) {
    const ids = [...new Set(userIds)];
    const people = new Map<
      string,
      { id: string; name: string; parcoursType: string | null }
    >();
    if (!ids.length) return people;
    const { data } = await this.supabase
      .from('user_profiles')
      .select('id, diagnostic_vie_data, parcours_type')
      .in('id', ids);
    for (const row of data ?? []) {
      const vie = (row.diagnostic_vie_data ?? {}) as Record<string, unknown>;
      const name = [vie.name ?? vie.prenom, vie.nom]
        .filter((part): part is string => typeof part === 'string')
        .map((part) => part.trim())
        .filter(Boolean)
        .join(' ');
      people.set(row.id as string, {
        id: row.id as string,
        name: name || 'Utilisatrice',
        parcoursType: (row.parcours_type as string | null) ?? null,
      });
    }
    return people;
  }

  private async signedUrl(path: string) {
    const urls = await this.signedUrls([path]);
    return urls.get(path) ?? null;
  }

  private async signedUrls(paths: string[]) {
    const urls = new Map<string, string>();
    if (!paths.length) return urls;
    const { data, error } = await this.supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_URL_SECONDS);
    if (error) {
      this.logger.error(`Signing attachments failed: ${error.message}`);
      return urls;
    }
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
    }
    return urls;
  }

  private assertMessage(dto: SendMessageDto) {
    if (!dto.message?.trim() && !dto.attachmentPath) {
      throw new BadRequestException('Le message est vide.');
    }
  }

  /** A user can only attach images she uploaded herself. */
  private assertOwnAttachment(userId: string, path?: string) {
    if (path && !path.startsWith(`${userId}/`)) {
      throw new ForbiddenException('Pièce jointe invalide');
    }
  }

  private subjectFrom(message: string) {
    const firstLine = message.trim().split(/\r?\n/)[0].trim();
    return firstLine.length > 60
      ? `${firstLine.slice(0, 57).trimEnd()}…`
      : firstLine;
  }

  private preview(message?: string, attachmentPath?: string) {
    const text = (message ?? '').trim().replace(/\s+/g, ' ');
    if (text) return text.length > 120 ? `${text.slice(0, 117)}…` : text;
    return attachmentPath ? '📎 Capture d’écran' : '';
  }

  private sanitizeContext(context?: Record<string, unknown>) {
    const clean: Record<string, string> = {};
    for (const key of CONTEXT_KEYS) {
      const value = context?.[key];
      if (typeof value === 'string' && value.trim()) {
        clean[key] = value.trim().slice(0, 100);
      }
    }
    return clean;
  }

  private fail(action: string, detail?: string): never {
    this.logger.error(`Support: ${action} failed: ${detail ?? 'no data'}`);
    throw new InternalServerErrorException(
      'Le support est momentanément indisponible. Réessaie dans un instant.',
    );
  }
}
