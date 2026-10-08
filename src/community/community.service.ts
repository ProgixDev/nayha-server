import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CreatePostDto } from './dto/create-post.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { ReportPostDto } from './dto/report-post.dto';

export interface CommunityCommentEntity {
  id: string;
  post_id: string;
  parent_id?: string | null;
  reply_to_name?: string | null;
  user_id: string;
  auteur: string;
  initiale: string;
  contenu: string;
  is_moderated: boolean;
  created_at: string;
}

@Injectable()
export class CommunityService {
  private supabase: SupabaseClient;
  private inMemoryComments: CommunityCommentEntity[] = [];

  constructor(private configService: ConfigService) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
  }

  async getPosts(userId: string) {
    const [postsResult, reactionsResult, commentsResult] = await Promise.all([
      this.supabase
        .from('community_posts')
        .select('*')
        .eq('is_moderated', false)
        .order('created_at', { ascending: false })
        .limit(50),
      this.supabase
        .from('community_reactions')
        .select('post_id')
        .eq('user_id', userId),
      this.supabase
        .from('community_comments')
        .select('post_id')
        .eq('is_moderated', false),
    ]);

    if (postsResult.error) {
      throw new Error(postsResult.error.message);
    }

    const reactedPostIds = new Set(
      (reactionsResult.data ?? []).map((r) => r.post_id),
    );

    const commentsCountsByPost = new Map<string, number>();
    (commentsResult.data ?? []).forEach((c) => {
      commentsCountsByPost.set(
        c.post_id,
        (commentsCountsByPost.get(c.post_id) ?? 0) + 1,
      );
    });
    this.inMemoryComments.forEach((c) => {
      if (!c.is_moderated) {
        commentsCountsByPost.set(
          c.post_id,
          (commentsCountsByPost.get(c.post_id) ?? 0) + 1,
        );
      }
    });

    return (postsResult.data ?? []).map((post) => ({
      id: post.id,
      user_id: post.user_id,
      auteur: post.auteur,
      initiale: post.initiale,
      contenu: post.contenu,
      type: post.type,
      reactions_count: post.reactions_count ?? 0,
      comments_count:
        post.comments_count ??
        commentsCountsByPost.get(post.id) ??
        0,
      created_at: post.created_at,
      user_reacted: reactedPostIds.has(post.id),
    }));
  }

  async getUserCount() {
    const { data: distinctUsers, error: distinctError } = await this.supabase
      .from('community_posts')
      .select('user_id');

    if (distinctError) {
      throw new Error(distinctError.message);
    }

    const uniqueUserIds = new Set((distinctUsers ?? []).map((u) => u.user_id));
    return { count: uniqueUserIds.size };
  }

  async createPost(userId: string, dto: CreatePostDto) {
    let firstName: string;
    let initiale: string;

    if (dto.auteur && dto.auteur.trim().length > 0) {
      firstName = dto.auteur.trim();
      initiale =
        dto.initiale?.trim().charAt(0).toUpperCase() ||
        firstName.charAt(0).toUpperCase() ||
        'A';
    } else {
      const { data: profile } = await this.supabase
        .from('user_profiles')
        .select('name')
        .eq('id', userId)
        .single();
      firstName = profile?.name ?? 'Anonyme';
      initiale = firstName.charAt(0).toUpperCase() || 'A';
    }

    const { data, error } = await this.supabase
      .from('community_posts')
      .insert({
        user_id: userId,
        auteur: firstName,
        initiale,
        contenu: dto.contenu,
        type: dto.type,
        reactions_count: 0,
        comments_count: 0,
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return {
      ...data,
      comments_count: 0,
    };
  }

  async toggleReact(userId: string, postId: string) {
    const { data: existing } = await this.supabase
      .from('community_reactions')
      .select('post_id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .single();

    if (existing) {
      const { error: deleteError } = await this.supabase
        .from('community_reactions')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userId);

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      const { data: current, error: fetchError } = await this.supabase
        .from('community_posts')
        .select('reactions_count')
        .eq('id', postId)
        .single();

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      const newCount = Math.max(0, (current?.reactions_count ?? 1) - 1);

      await this.supabase
        .from('community_posts')
        .update({ reactions_count: newCount })
        .eq('id', postId);

      return { reacted: false, reactions_count: newCount };
    } else {
      const { error: insertError } = await this.supabase
        .from('community_reactions')
        .insert({ post_id: postId, user_id: userId });

      if (insertError) {
        throw new Error(insertError.message);
      }

      const { data: current, error: fetchError } = await this.supabase
        .from('community_posts')
        .select('reactions_count')
        .eq('id', postId)
        .single();

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      const newCount = (current?.reactions_count ?? 0) + 1;

      await this.supabase
        .from('community_posts')
        .update({ reactions_count: newCount })
        .eq('id', postId);

      return { reacted: true, reactions_count: newCount };
    }
  }

  async reportPost(userId: string, postId: string, dto: ReportPostDto) {
    const { error } = await this.supabase
      .from('community_reports')
      .upsert(
        { post_id: postId, user_id: userId, reason: dto.reason ?? null },
        { onConflict: 'post_id,user_id', ignoreDuplicates: true },
      );

    if (error) {
      throw new Error(error.message);
    }

    return { reported: true };
  }

  // ── Comments / Replies Operations ──────────────────────────────────────────

  async getComments(postId: string) {
    try {
      const { data, error } = await this.supabase
        .from('community_comments')
        .select('*')
        .eq('post_id', postId)
        .eq('is_moderated', false)
        .order('created_at', { ascending: true });

      if (!error && data) {
        const mem = this.inMemoryComments.filter(
          (c) => c.post_id === postId && !c.is_moderated,
        );
        const map = new Map<string, any>();
        data.forEach((c) => map.set(c.id, c));
        mem.forEach((c) => map.set(c.id, c));
        return Array.from(map.values());
      }
    } catch (_) {
      // fallback
    }

    return this.inMemoryComments.filter(
      (c) => c.post_id === postId && !c.is_moderated,
    );
  }

  async createComment(userId: string, postId: string, dto: CreateCommentDto) {
    let firstName: string;
    let initiale: string;

    if (dto.auteur && dto.auteur.trim().length > 0) {
      firstName = dto.auteur.trim();
      initiale =
        dto.initiale?.trim().charAt(0).toUpperCase() ||
        firstName.charAt(0).toUpperCase() ||
        'A';
    } else {
      const { data: profile } = await this.supabase
        .from('user_profiles')
        .select('name')
        .eq('id', userId)
        .single();
      firstName = profile?.name ?? 'Anonyme';
      initiale = firstName.charAt(0).toUpperCase() || 'A';
    }

    const commentId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;

    const newComment: CommunityCommentEntity = {
      id: commentId,
      post_id: postId,
      parent_id: dto.parent_id?.trim() || null,
      reply_to_name: dto.reply_to_name?.trim() || null,
      user_id: userId,
      auteur: firstName,
      initiale,
      contenu: dto.contenu.trim(),
      is_moderated: false,
      created_at: new Date().toISOString(),
    };

    try {
      const { data, error } = await this.supabase
        .from('community_comments')
        .insert({
          id: newComment.id,
          post_id: postId,
          parent_id: newComment.parent_id,
          reply_to_name: newComment.reply_to_name,
          user_id: userId,
          auteur: firstName,
          initiale,
          contenu: dto.contenu.trim(),
          is_moderated: false,
        })
        .select('*')
        .single();

      if (!error && data) {
        // Increment comments count on post if column exists
        try {
          const { data: post } = await this.supabase
            .from('community_posts')
            .select('comments_count')
            .eq('id', postId)
            .single();
          const nextCount = (post?.comments_count ?? 0) + 1;
          await this.supabase
            .from('community_posts')
            .update({ comments_count: nextCount })
            .eq('id', postId);
        } catch (_) {}

        return data;
      }
    } catch (_) {
      // fallback
    }

    this.inMemoryComments.push(newComment);
    return newComment;
  }

  // ── Admin Operations ────────────────────────────────────────────────────────

  async getAdminPosts() {
    const [postsResult, reportsResult, commentsResult] = await Promise.all([
      this.supabase
        .from('community_posts')
        .select('*')
        .order('created_at', { ascending: false }),
      this.supabase.from('community_reports').select('*'),
      this.supabase.from('community_comments').select('post_id'),
    ]);

    if (postsResult.error) {
      throw new Error(postsResult.error.message);
    }

    const reportsByPostId = new Map<string, any[]>();
    (reportsResult.data ?? []).forEach((r) => {
      const list = reportsByPostId.get(r.post_id) ?? [];
      list.push(r);
      reportsByPostId.set(r.post_id, list);
    });

    const commentsCountsByPost = new Map<string, number>();
    (commentsResult.data ?? []).forEach((c) => {
      commentsCountsByPost.set(
        c.post_id,
        (commentsCountsByPost.get(c.post_id) ?? 0) + 1,
      );
    });
    this.inMemoryComments.forEach((c) => {
      commentsCountsByPost.set(
        c.post_id,
        (commentsCountsByPost.get(c.post_id) ?? 0) + 1,
      );
    });

    return (postsResult.data ?? []).map((post) => {
      const reports = reportsByPostId.get(post.id) ?? [];
      return {
        id: post.id,
        user_id: post.user_id,
        auteur: post.auteur,
        initiale: post.initiale,
        contenu: post.contenu,
        type: post.type,
        reactions_count: post.reactions_count ?? 0,
        comments_count:
          post.comments_count ??
          commentsCountsByPost.get(post.id) ??
          0,
        is_moderated: post.is_moderated ?? false,
        created_at: post.created_at,
        reports_count: reports.length,
        reports,
      };
    });
  }

  async getAdminReports() {
    const { data, error } = await this.supabase
      .from('community_reports')
      .select('*, community_posts(id, auteur, contenu, type)')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return data ?? [];
  }

  async moderatePost(id: string, isModerated?: boolean) {
    let target = isModerated;
    if (target === undefined) {
      const { data: current } = await this.supabase
        .from('community_posts')
        .select('is_moderated')
        .eq('id', id)
        .single();
      target = !current?.is_moderated;
    }

    const { data, error } = await this.supabase
      .from('community_posts')
      .update({ is_moderated: target })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async deletePost(id: string) {
    // Delete associated reactions, reports and comments first
    await Promise.all([
      this.supabase.from('community_reactions').delete().eq('post_id', id),
      this.supabase.from('community_reports').delete().eq('post_id', id),
      this.supabase.from('community_comments').delete().eq('post_id', id),
    ]);

    const { error } = await this.supabase
      .from('community_posts')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(error.message);
    }

    this.inMemoryComments = this.inMemoryComments.filter((c) => c.post_id !== id);
    return { success: true };
  }
}
