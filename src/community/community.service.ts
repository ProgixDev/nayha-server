import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CreatePostDto } from './dto/create-post.dto';
import { ReportPostDto } from './dto/report-post.dto';

@Injectable()
export class CommunityService {
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
  }

  async getPosts(userId: string) {
    const [postsResult, reactionsResult] = await Promise.all([
      this.supabase
        .from('community_posts')
        .select('id, auteur, initiale, contenu, type, reactions_count, created_at')
        .eq('is_moderated', false)
        .order('created_at', { ascending: false })
        .limit(50),
      this.supabase
        .from('community_reactions')
        .select('post_id')
        .eq('user_id', userId),
    ]);

    if (postsResult.error) {
      throw new Error(postsResult.error.message);
    }

    if (reactionsResult.error) {
      throw new Error(reactionsResult.error.message);
    }

    const reactedPostIds = new Set(
      (reactionsResult.data ?? []).map((r) => r.post_id),
    );

    return (postsResult.data ?? []).map((post) => ({
      ...post,
      user_reacted: reactedPostIds.has(post.id),
    }));
  }

  async getUserCount() {
    const { data, error } = await this.supabase
      .from('community_posts')
      .select('user_id', { count: 'exact', head: true });

    if (error) {
      throw new Error(error.message);
    }

    // Count distinct users
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
    // Use client-provided name if available (cached from /users/me in Flutter)
    // Fall back to DB lookup only when missing
    let firstName: string;
    let initiale: string;

    if (dto.auteur && dto.auteur.trim().length > 0) {
      firstName = dto.auteur.trim();
      initiale = dto.initiale?.trim().charAt(0).toUpperCase() || firstName.charAt(0).toUpperCase() || 'A';
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
      })
      .select('id, auteur, initiale, contenu, type, reactions_count, created_at')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async toggleReact(userId: string, postId: string) {
    const { data: existing } = await this.supabase
      .from('community_reactions')
      .select('post_id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .single();

    if (existing) {
      // Remove reaction
      const { error: deleteError } = await this.supabase
        .from('community_reactions')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userId);

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      // Fetch current count then decrement
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
      // Add reaction
      const { error: insertError } = await this.supabase
        .from('community_reactions')
        .insert({ post_id: postId, user_id: userId });

      if (insertError) {
        throw new Error(insertError.message);
      }

      // Fetch current count then increment
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
}
