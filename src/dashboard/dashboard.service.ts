import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UsersService } from '../users/users.service';

export interface DashboardKpis {
  totalUsers: number;
  activeThisWeek: number;
  paidUsers: number;
  conversionRate: number;
  totalCandidatures: number;
  entretiensObtenus: number;
  acceptees: number;
  totalAiCalls: number;
  totalAiCost: number;
  reportedPosts: number;
}

export interface ActivityItem {
  id: string;
  type: 'user_joined' | 'candidature_sent' | 'post_created' | 'ai_call' | 'atelier_watched';
  description: string;
  timestamp: string;
  user_name: string;
}

export interface SparklinePoint {
  date: string;
  value: number;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);
  private supabase: SupabaseClient;

  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
  }

  async getKpis(): Promise<DashboardKpis> {
    const now = Date.now();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

    let users: any[] = [];
    try {
      users = await this.usersService.listAdmin();
    } catch (_) {
      users = [];
    }

    const totalUsers = users.length;
    const activeThisWeek = users.filter((u) => {
      const t = new Date(u.last_active_at || u.created_at).getTime();
      return now - t < oneWeekMs;
    }).length;
    const paidUsers = users.filter((u) => u.has_paid).length;
    const conversionRate = totalUsers > 0 ? Math.round((paidUsers / totalUsers) * 100) / 100 : 0;

    // Real Candidatures from DB
    let totalCandidatures = 0;
    let entretiensObtenus = 0;
    let acceptees = 0;

    try {
      const { data: cands } = await this.supabase
        .from('candidatures')
        .select('statut');

      if (cands) {
        totalCandidatures = cands.length;
        entretiensObtenus = cands.filter(
          (c) => c.statut === 'entretien' || c.statut === 'acceptee',
        ).length;
        acceptees = cands.filter((c) => c.statut === 'acceptee').length;
      }
    } catch (_) {}

    // Real Coaching / AI sessions from DB
    let totalAiCalls = 0;
    try {
      const { data: coaching } = await this.supabase
        .from('coaching_sessions')
        .select('id');
      if (coaching) {
        totalAiCalls = coaching.length;
      }
    } catch (_) {}
    const totalAiCost = Math.round(totalAiCalls * 0.04 * 100) / 100;

    // Reported posts
    let reportedPosts = 0;
    try {
      const { data: posts } = await this.supabase
        .from('community_posts')
        .select('id, reports_count, is_moderated');

      if (posts) {
        reportedPosts = posts.filter(
          (p: any) => (p.reports_count || 0) > 0 && !p.is_moderated,
        ).length;
      }
    } catch (_) {}

    return {
      totalUsers,
      activeThisWeek,
      paidUsers,
      conversionRate,
      totalCandidatures,
      entretiensObtenus,
      acceptees,
      totalAiCalls,
      totalAiCost,
      reportedPosts,
    };
  }

  async getRecentActivity(): Promise<ActivityItem[]> {
    const activities: ActivityItem[] = [];

    // 1. Fetch Users
    let users: any[] = [];
    try {
      users = await this.usersService.listAdmin();
    } catch (_) {}

    const userMap = new Map<string, string>();
    for (const u of users) {
      userMap.set(u.id, u.name);

      if (u.created_at) {
        activities.push({
          id: `act-user-${u.id}`,
          type: 'user_joined',
          description: `${u.name} a rejoint Nayha`,
          timestamp: u.created_at,
          user_name: u.name,
        });
      }
    }

    // 2. Fetch Candidatures from DB
    try {
      const { data: cands } = await this.supabase
        .from('candidatures')
        .select('*')
        .order('created_at', { ascending: false });

      if (cands) {
        for (const c of cands) {
          const uName = userMap.get(c.user_id) || 'Une utilisatrice';
          const ent = c.entreprise ? `chez ${c.entreprise}` : '';
          const poste = c.poste ? `(${c.poste})` : '';
          activities.push({
            id: `act-cand-${c.id}`,
            type: 'candidature_sent',
            description: `${uName} a postulé ${ent} ${poste}`.trim(),
            timestamp: c.date_envoi || c.created_at,
            user_name: uName,
          });
        }
      }
    } catch (_) {}

    // 3. Fetch Community Posts from DB
    try {
      const { data: posts } = await this.supabase
        .from('community_posts')
        .select('*')
        .order('created_at', { ascending: false });

      if (posts) {
        for (const p of posts) {
          const author = p.auteur || userMap.get(p.user_id) || 'Une utilisatrice';
          activities.push({
            id: `act-post-${p.id}`,
            type: 'post_created',
            description: `${author} a publié dans la communauté : "${p.contenu?.slice(0, 50) || 'Message'}"`,
            timestamp: p.created_at,
            user_name: author,
          });
        }
      }
    } catch (_) {}

    // 4. Fetch Coaching Sessions from DB
    try {
      const { data: sessions } = await this.supabase
        .from('coaching_sessions')
        .select('id, user_id, created_at')
        .order('created_at', { ascending: false });

      if (sessions) {
        for (const s of sessions) {
          const uName = userMap.get(s.user_id) || 'Une utilisatrice';
          activities.push({
            id: `act-coach-${s.id}`,
            type: 'ai_call',
            description: `${uName} a effectué une séance de coaching IA`,
            timestamp: s.created_at,
            user_name: uName,
          });
        }
      }
    } catch (_) {}

    // Sort by timestamp descending
    activities.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    return activities.slice(0, 30);
  }

  async getSparklineData(): Promise<{
    activityPerDay: SparklinePoint[];
    usersPerDay: SparklinePoint[];
    candidaturesPerDay: SparklinePoint[];
    aiCallsPerDay: SparklinePoint[];
    costPerDay: SparklinePoint[];
  }> {
    const days: string[] = [];
    const now = new Date();

    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }

    let users: any[] = [];
    try {
      users = await this.usersService.listAdmin();
    } catch (_) {}

    let cands: any[] = [];
    try {
      const { data } = await this.supabase
        .from('candidatures')
        .select('date_envoi, created_at');
      if (data) cands = data;
    } catch (_) {}

    let posts: any[] = [];
    try {
      const { data } = await this.supabase
        .from('community_posts')
        .select('created_at');
      if (data) posts = data;
    } catch (_) {}

    let coaching: any[] = [];
    try {
      const { data } = await this.supabase
        .from('coaching_sessions')
        .select('created_at');
      if (data) coaching = data;
    } catch (_) {}

    const usersPerDay = days.map((date) => ({
      date,
      value: users.filter((u) => (u.created_at || '').slice(0, 10) === date).length,
    }));

    const candidaturesPerDay = days.map((date) => ({
      date,
      value: cands.filter(
        (c) => (c.date_envoi || c.created_at || '').slice(0, 10) === date,
      ).length,
    }));

    const aiCallsPerDay = days.map((date) => ({
      date,
      value: coaching.filter((s) => (s.created_at || '').slice(0, 10) === date).length,
    }));

    const costPerDay = aiCallsPerDay.map((pt) => ({
      date: pt.date,
      value: Math.round(pt.value * 0.04 * 100) / 100,
    }));

    const activityPerDay = days.map((date) => {
      const uCount = users.filter((u) => (u.created_at || '').slice(0, 10) === date).length;
      const cCount = cands.filter((c) => (c.date_envoi || c.created_at || '').slice(0, 10) === date).length;
      const pCount = posts.filter((p) => (p.created_at || '').slice(0, 10) === date).length;
      const coachCount = coaching.filter((s) => (s.created_at || '').slice(0, 10) === date).length;

      return {
        date,
        value: uCount + cCount + pCount + coachCount,
      };
    });

    return { activityPerDay, usersPerDay, candidaturesPerDay, aiCallsPerDay, costPerDay };
  }
}

