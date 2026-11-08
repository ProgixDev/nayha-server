import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CreateAtelierDto } from './dto/create-atelier.dto';
import { UpdateAtelierDto } from './dto/update-atelier.dto';
import { TrackAtelierViewDto } from './dto/track-atelier-view.dto';
import { Paginated, pageRequest } from '../common/pagination';

export interface AtelierEntity {
  id: string;
  titre: string;
  subtitle?: string;
  palier: string;
  palier_label?: string;
  category: string;
  step_tag?: string;
  duree: string;
  description: string;
  video_url: string;
  objectifs?: string[];
  tips: string[];
  resource_url?: string;
  speaker_name?: string;
  speaker_role?: string;
  icon?: string;
  accent_color?: string;
  order: number;
  is_active: boolean;
  views_count: number;
  created_at: string;
  updated_at: string;
}

export interface AtelierStatsEntity {
  id: string;
  titre: string;
  palier: string;
  category: string;
  duree: string;
  watch_count: number;
  unique_viewers: number;
  completion_rate: number;
}

/** A row of the `ateliers` table: any column may be missing or null. */
type AtelierRow = { [K in keyof AtelierEntity]?: AtelierEntity[K] | null } & {
  id: string;
};

/** A row of the `atelier_views` table. */
interface AtelierViewRow {
  id: string;
  session_id: string | null;
  atelier_id: string;
  user_id: string | null;
  completed: boolean | null;
  watch_seconds: number | null;
  progress_rate: number | null;
  created_at: string | null;
}

const UNAVAILABLE = 'Les ateliers sont momentanément indisponibles';

/**
 * Ateliers come only from the Supabase `ateliers` table: every video shown
 * in the app is managed in the database, never in code.
 */
@Injectable()
export class AteliersService {
  private readonly supabase: SupabaseClient<any, any>;
  private readonly logger = new Logger(AteliersService.name);

  constructor(configService: ConfigService) {
    this.supabase = createClient(
      configService.get<string>('SUPABASE_URL')!,
      configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
  }

  /** Logs a Supabase error and stops the request with a 503. */
  private fail(action: string, error: unknown): never {
    const message =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : String(error);
    this.logger.error(`Ateliers: ${action} failed: ${message}`);
    throw new ServiceUnavailableException(UNAVAILABLE);
  }

  async list(category?: string, search?: string) {
    let query = this.supabase
      .from('ateliers')
      .select('*')
      .eq('is_active', true)
      .order('order', { ascending: true });

    if (category && category.toLowerCase() !== 'tous') {
      query = query.or(`category.eq.${category},palier.eq.${category}`);
    }

    const { data, error } = await query.overrideTypes<
      AtelierRow[],
      { merge: false }
    >();
    if (error) this.fail('list', error);

    let items = (data ?? []).map((raw) => this.mapFromDb(raw));
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(
        (a) =>
          a.titre.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          (a.subtitle && a.subtitle.toLowerCase().includes(q)) ||
          (a.step_tag && a.step_tag.toLowerCase().includes(q)),
      );
    }
    return items;
  }

  getCategories(): Promise<string[]> {
    const base = [
      'Tous',
      'emploi',
      'reconversion',
      'confiance',
      'palier_1',
      'palier_2',
      'palier_3',
    ];
    return Promise.resolve(base);
  }

  async get(id: string) {
    const { data, error } = await this.supabase
      .from('ateliers')
      .select('*')
      .eq('id', id)
      .maybeSingle<AtelierRow>();
    if (error) this.fail('get', error);
    if (!data) throw new NotFoundException('Atelier introuvable');
    return this.mapFromDb(data);
  }

  // ── Admin Operations ────────────────────────────────────────────────────────

  async listAdmin() {
    const { data, error } = await this.supabase
      .from('ateliers')
      .select('*')
      .order('order', { ascending: true })
      .overrideTypes<AtelierRow[], { merge: false }>();
    if (error) this.fail('listAdmin', error);
    return (data ?? []).map((raw) => this.mapFromDb(raw));
  }

  /** Admin list, one page: ?page=&pageSize=&search=&category= */
  async listAdminPage(
    query: Record<string, string | undefined>,
  ): Promise<Paginated<AtelierEntity>> {
    const request = pageRequest(query);
    const search = (query.search ?? '').trim();
    const category = (query.category ?? '').trim();
    const byCategory = !!category && category.toLowerCase() !== 'tous';
    // Characters that would break the PostgREST filter syntax are dropped.
    const clean = (value: string) => value.replace(/[,()*%\\]/g, ' ').trim();

    let db = this.supabase
      .from('ateliers')
      .select('*', { count: 'exact' })
      .order('order', { ascending: true });
    if (byCategory) {
      const cat = clean(category);
      db = db.or(`category.eq.${cat},palier.eq.${cat}`);
    }
    const term = clean(search);
    if (term) {
      db = db.or(
        ['titre', 'category', 'step_tag', 'description', 'speaker_name']
          .map((column) => `${column}.ilike.%${term}%`)
          .join(','),
      );
    }
    const { data, error, count } = await db
      .range(request.from, request.to)
      .overrideTypes<AtelierRow[], { merge: false }>();
    if (error) this.fail('listAdminPage', error);

    const items = (data ?? []).map((raw) => this.mapFromDb(raw));
    return {
      items,
      total: count ?? items.length,
      page: request.page,
      pageSize: request.pageSize,
    };
  }

  async trackView(id: string, dto: TrackAtelierViewDto) {
    const now = new Date().toISOString();
    let progressRate = dto.progress_rate;

    try {
      if (progressRate === undefined || progressRate === null) {
        if (dto.completed) {
          progressRate = 1.0;
        } else if (dto.watch_seconds && dto.watch_seconds > 0) {
          const { data: atelier } = await this.supabase
            .from('ateliers')
            .select('duree')
            .eq('id', id)
            .maybeSingle<Pick<AtelierRow, 'duree'>>();
          const duree = typeof atelier?.duree === 'string' ? atelier.duree : '';
          if (duree) {
            const parts = duree.split(':').map(Number);
            const totalSec = (parts[0] || 0) * 60 + (parts[1] || 0);
            if (totalSec > 0) {
              progressRate = Math.min(1.0, dto.watch_seconds / totalSec);
            }
          }
        }
      }
    } catch (error) {
      // Tracking must never break playback.
      this.logger.warn(
        `Ateliers: could not read duration of ${id}: ${String(error)}`,
      );
    }
    progressRate =
      progressRate !== undefined && progressRate !== null
        ? Math.min(1.0, Math.max(0.0, progressRate))
        : dto.completed
          ? 1.0
          : 0.0;

    const sessionId = dto.session_id || dto.user_id;

    try {
      if (sessionId) {
        // Check if this session already exists
        const { data: existing } = await this.supabase
          .from('atelier_views')
          .select('id, progress_rate, watch_seconds, completed')
          .eq('atelier_id', id)
          .eq('session_id', sessionId)
          .maybeSingle<
            Pick<
              AtelierViewRow,
              'id' | 'progress_rate' | 'watch_seconds' | 'completed'
            >
          >();

        if (existing) {
          // Update the session's max progress instead of creating a duplicate view
          const higherProgress = Math.max(
            Number(existing.progress_rate || 0),
            progressRate,
          );
          const higherSeconds = Math.max(
            Number(existing.watch_seconds || 0),
            dto.watch_seconds || 0,
          );
          const isCompleted =
            existing.completed || (dto.completed ?? higherProgress >= 0.85);

          await this.supabase
            .from('atelier_views')
            .update({
              progress_rate: higherProgress,
              watch_seconds: higherSeconds,
              completed: isCompleted,
              updated_at: now,
            })
            .eq('id', existing.id);

          return { success: true, progress_rate: higherProgress };
        }
      }

      // New viewing session: insert 1 view record
      await this.supabase.from('atelier_views').insert({
        atelier_id: id,
        session_id: sessionId || null,
        user_id: dto.user_id || null,
        completed: dto.completed ?? progressRate >= 0.85,
        watch_seconds: dto.watch_seconds ?? 0,
        progress_rate: progressRate,
        created_at: now,
        updated_at: now,
      });

      // Increment views_count by 1 only for a genuine new session
      const { data: current } = await this.supabase
        .from('ateliers')
        .select('views_count')
        .eq('id', id)
        .single<Pick<AtelierRow, 'views_count'>>();
      const newCount = (current?.views_count || 0) + 1;
      await this.supabase
        .from('ateliers')
        .update({ views_count: newCount, updated_at: now })
        .eq('id', id);
    } catch (error) {
      // Tracking must never break playback.
      this.logger.warn(
        `Ateliers: could not track view of ${id}: ${String(error)}`,
      );
    }

    return { success: true, progress_rate: progressRate };
  }

  async getStats(): Promise<AtelierStatsEntity[]> {
    const list = await this.listAdmin();
    let viewsData: AtelierViewRow[] = [];

    try {
      const { data, error } = await this.supabase
        .from('atelier_views')
        .select(
          'id, session_id, atelier_id, user_id, completed, watch_seconds, progress_rate, created_at',
        )
        .overrideTypes<AtelierViewRow[], { merge: false }>();
      if (!error && data) {
        viewsData = data;
      }
    } catch {
      // Stats without view records: every counter stays at 0.
    }

    return list.map((a) => {
      const records = viewsData.filter((r) => r.atelier_id === a.id);

      // Deduplicate records by session_id to get true viewing sessions
      const sessionMap = new Map<string, AtelierViewRow>();
      for (const r of records) {
        const key =
          r.session_id ||
          (r.user_id ? `${r.user_id}_${r.created_at?.slice(0, 13)}` : r.id);
        if (
          !sessionMap.has(key) ||
          Number(r.progress_rate || 0) >
            Number(sessionMap.get(key)?.progress_rate || 0)
        ) {
          sessionMap.set(key, r);
        }
      }

      const sessions = Array.from(sessionMap.values());
      const watchCount = sessions.length;
      const uniqueViewers =
        sessions.length > 0
          ? new Set(sessions.map((r) => r.user_id).filter(Boolean)).size ||
            (watchCount > 0 ? 1 : 0)
          : 0;

      let completionRate = 0;
      if (sessions.length > 0) {
        const totalProgress = sessions.reduce((sum, r) => {
          if (r.progress_rate !== null && r.progress_rate !== undefined) {
            return sum + Number(r.progress_rate);
          }
          return sum + (r.completed ? 1.0 : 0.0);
        }, 0);
        completionRate = totalProgress / sessions.length;
      }

      return {
        id: a.id,
        titre: a.titre,
        palier: a.palier,
        category: a.category,
        duree: a.duree,
        watch_count: watchCount,
        unique_viewers: uniqueViewers,
        completion_rate: Math.min(1, Math.max(0, completionRate)),
      };
    });
  }

  /** Next free position: highest `order` in the table + 1 (0 if empty). */
  private async nextOrder(): Promise<number> {
    const { data, error } = await this.supabase
      .from('ateliers')
      .select('order')
      .order('order', { ascending: false })
      .limit(1)
      .maybeSingle<Pick<AtelierRow, 'order'>>();
    if (error) this.fail('nextOrder', error);
    const max = Number(data?.order);
    return data && Number.isFinite(max) ? max + 1 : 0;
  }

  async create(dto: CreateAtelierDto) {
    const id =
      dto.titre
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/(^_|_$)/g, '') || `atelier_${Date.now()}`;
    const order = dto.order ?? (await this.nextOrder());

    const { data, error } = await this.supabase
      .from('ateliers')
      .insert({
        id,
        titre: dto.titre.trim(),
        subtitle: dto.subtitle?.trim(),
        palier: dto.palier.trim(),
        palier_label: dto.palier_label?.trim() || dto.palier.trim(),
        category: dto.category?.trim() || dto.palier.trim(),
        step_tag: dto.step_tag?.trim() || '',
        duree: dto.duree.trim(),
        description: dto.description?.trim() || '',
        video_url: dto.video_url?.trim() || '',
        objectifs: dto.objectifs || [],
        tips: dto.tips || [],
        resource_url: dto.resource_url?.trim() || '',
        speaker_name: dto.speaker_name?.trim() || '',
        speaker_role: dto.speaker_role?.trim() || '',
        icon: dto.icon?.trim() || 'video',
        accent_color: dto.accent_color?.trim() || '#D4A574',
        order,
        is_active: dto.is_active ?? true,
        views_count: 0,
      })
      .select()
      .single<AtelierRow>();
    if (error) this.fail('create', error);
    return this.mapFromDb(data);
  }

  async update(id: string, dto: UpdateAtelierDto) {
    const now = new Date().toISOString();
    const { data, error } = await this.supabase
      .from('ateliers')
      .update({
        ...(dto.titre ? { titre: dto.titre.trim() } : {}),
        ...(dto.subtitle !== undefined
          ? { subtitle: dto.subtitle?.trim() || null }
          : {}),
        ...(dto.palier ? { palier: dto.palier.trim() } : {}),
        ...(dto.palier_label ? { palier_label: dto.palier_label.trim() } : {}),
        ...(dto.category ? { category: dto.category.trim() } : {}),
        ...(dto.step_tag !== undefined
          ? { step_tag: dto.step_tag?.trim() || '' }
          : {}),
        ...(dto.duree ? { duree: dto.duree.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || '' }
          : {}),
        ...(dto.video_url !== undefined
          ? { video_url: dto.video_url?.trim() || '' }
          : {}),
        ...(dto.objectifs !== undefined ? { objectifs: dto.objectifs } : {}),
        ...(dto.tips !== undefined ? { tips: dto.tips } : {}),
        ...(dto.resource_url !== undefined
          ? { resource_url: dto.resource_url?.trim() || '' }
          : {}),
        ...(dto.speaker_name !== undefined
          ? { speaker_name: dto.speaker_name?.trim() || '' }
          : {}),
        ...(dto.speaker_role !== undefined
          ? { speaker_role: dto.speaker_role?.trim() || '' }
          : {}),
        ...(dto.icon ? { icon: dto.icon.trim() } : {}),
        ...(dto.accent_color ? { accent_color: dto.accent_color.trim() } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
        ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
        updated_at: now,
      })
      .eq('id', id)
      .select()
      .maybeSingle<AtelierRow>();
    if (error) this.fail('update', error);
    if (!data) throw new NotFoundException('Atelier introuvable');
    return this.mapFromDb(data);
  }

  async remove(id: string) {
    const { error } = await this.supabase
      .from('ateliers')
      .delete()
      .eq('id', id);
    if (error) this.fail('remove', error);
    return { success: true };
  }

  private mapFromDb(raw: AtelierRow): AtelierEntity {
    return {
      id: raw.id,
      titre: raw.titre ?? '',
      subtitle: raw.subtitle ?? undefined,
      palier: raw.palier ?? 'palier_1',
      palier_label: raw.palier_label ?? raw.palier ?? 'Palier 1',
      category: raw.category ?? raw.palier ?? 'general',
      step_tag: raw.step_tag ?? '',
      duree: raw.duree ?? '',
      description: raw.description ?? '',
      video_url: raw.video_url ?? '',
      objectifs: Array.isArray(raw.objectifs) ? raw.objectifs : [],
      tips: Array.isArray(raw.tips) ? raw.tips : [],
      resource_url: raw.resource_url ?? '',
      speaker_name: raw.speaker_name ?? '',
      speaker_role: raw.speaker_role ?? '',
      icon: raw.icon ?? 'video',
      accent_color: raw.accent_color ?? '#D4A574',
      order: raw.order ?? 0,
      is_active: raw.is_active ?? true,
      views_count: raw.views_count ?? 0,
      created_at: raw.created_at ?? new Date().toISOString(),
      updated_at: raw.updated_at ?? new Date().toISOString(),
    };
  }
}
