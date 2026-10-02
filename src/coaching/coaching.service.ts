import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { CompleteCoachingSessionDto } from './dto/complete-coaching-session.dto';
import { StartCoachingSessionDto } from './dto/start-coaching-session.dto';

const guidedQuestions = [
  'Avant de chercher une solution, qu’est-ce qui te pèse le plus dans cette situation aujourd’hui ?',
  'Quand cette pensée arrive, qu’est-ce qu’elle te fait faire — ou ne pas faire ?',
  'Peux-tu te rappeler d’un fait concret qui montre que tu as déjà su traverser quelque chose de difficile ?',
  'Quelle action suffisamment petite et réaliste pourrais-tu faire cette semaine, même sans te sentir totalement prête ?',
];

@Injectable()
export class CoachingService {
  private readonly supabase: SupabaseClient;
  private readonly openai: OpenAI;

  constructor(configService: ConfigService) {
    this.supabase = createClient(
      configService.get<string>('SUPABASE_URL')!,
      configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
    this.openai = new OpenAI({
      apiKey: configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async start(userId: string, dto: StartCoachingSessionDto) {
    const userContext = await this.loadUserContext(userId);
    const { data: session, error } = await this.supabase
      .from('coaching_sessions')
      .insert({
        user_id: userId,
        trigger_context: dto.triggerContext?.trim() || null,
        confidence_before: dto.confidenceBefore ?? null,
        user_context: userContext,
      })
      .select()
      .single();
    if (error || !session)
      throw new Error(error?.message ?? 'Unable to create coaching session');

    await this.insertMessage(
      userId,
      session.id,
      1,
      'coach',
      guidedQuestions[0],
    );
    return this.get(userId, session.id);
  }

  async list(userId: string) {
    const { data, error } = await this.supabase
      .from('coaching_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  /**
   * The single source of truth for automatic coaching invitations. More
   * journey-specific signals can be added here without changing Flutter.
   */
  async getOffer(userId: string) {
    const twoWeeksAgo = new Date(
      Date.now() - 14 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { data: recentSessions, error: sessionsError } = await this.supabase
      .from('coaching_sessions')
      .select('id')
      .eq('user_id', userId)
      .gte('created_at', twoWeeksAgo)
      .limit(1);
    if (sessionsError) throw new Error(sessionsError.message);
    if ((recentSessions ?? []).length > 0) {
      return { shouldOffer: false, reason: null, message: null };
    }

    const { data: candidatures, error } = await this.supabase
      .from('candidatures')
      .select('statut, updated_at, date_entretien')
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
    const all = candidatures ?? [];
    const refusals = all.filter((item) => item.statut === 'refusee').length;
    if (refusals >= 3) {
      return {
        shouldOffer: true,
        reason: 'three_refusals',
        message:
          'Tu as reçu plusieurs refus. Prendre un temps pour toi peut t’aider à garder ton élan.',
      };
    }

    if (all.length > 0) {
      const hasRecentActivity = all.some(
        (item) =>
          item.updated_at &&
          new Date(item.updated_at).getTime() >=
            new Date(twoWeeksAgo).getTime(),
      );
      if (!hasRecentActivity) {
        return {
          shouldOffer: true,
          reason: 'inactive_14_days',
          message:
            'Cela fait un moment que ton parcours est en pause. On peut reprendre doucement, à ton rythme.',
        };
      }
    }

    const upcomingInterview = all.some(
      (item) =>
        item.statut === 'entretien' &&
        item.date_entretien &&
        new Date(item.date_entretien).getTime() > Date.now(),
    );
    if (upcomingInterview) {
      return {
        shouldOffer: true,
        reason: 'before_interview',
        message:
          'Un entretien approche. Tu peux prendre quelques minutes pour te préparer avec confiance.',
      };
    }
    return { shouldOffer: false, reason: null, message: null };
  }

  async get(userId: string, id: string) {
    const session = await this.findSession(userId, id);
    const { data: messages, error } = await this.supabase
      .from('coaching_messages')
      .select('*')
      .eq('session_id', id)
      .eq('user_id', userId)
      .order('sequence');
    if (error) throw new Error(error.message);
    return { ...session, messages: messages ?? [] };
  }

  async sendMessage(userId: string, id: string, text: string) {
    const session = await this.findSession(userId, id);
    if (session.status !== 'active') {
      throw new BadRequestException(
        'This coaching session no longer accepts messages',
      );
    }

    const trimmed = text.trim();
    if (!trimmed) throw new BadRequestException('Message cannot be empty');
    const messages = await this.messages(userId, id);
    const answerCount = messages.filter(
      (message) => message.sender === 'user',
    ).length;
    if (answerCount >= guidedQuestions.length) {
      throw new BadRequestException('The guided conversation is complete');
    }

    let sequence = messages.length + 1;
    await this.insertMessage(userId, id, sequence++, 'user', trimmed);

    const completedAnswers = answerCount + 1;
    if (completedAnswers === guidedQuestions.length) {
      const { error } = await this.supabase
        .from('coaching_sessions')
        .update({
          status: 'ready_to_complete',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', userId);
      if (error) throw new Error(error.message);
    } else {
      await this.insertMessage(
        userId,
        id,
        sequence,
        'coach',
        guidedQuestions[completedAnswers],
      );
    }
    return this.get(userId, id);
  }

  async complete(userId: string, id: string, dto: CompleteCoachingSessionDto) {
    const session = await this.findSession(userId, id);
    if (session.status !== 'ready_to_complete') {
      throw new BadRequestException(
        'Answer all four guided questions before completing the session',
      );
    }
    const messages = await this.messages(userId, id);
    const firstAnswer =
      messages.find((message) => message.sender === 'user')?.text ?? '';
    const commitment = dto.commitment.trim();
    const now = new Date();
    const dueAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const fallback = {
      blocker: this.summaryOf(firstAnswer),
      insight:
        'La confiance se construit aussi par une action réalisable, même imparfaite.',
      report: `Tu as pris le temps d’identifier ce qui te freine et de choisir une action concrète. Ton point d’appui cette semaine : ${commitment}`,
    };
    const personalized = await this.personalizeReport(
      session.user_context ?? {},
      messages,
      commitment,
    ).catch(() => fallback);

    const { error } = await this.supabase
      .from('coaching_sessions')
      .update({
        status: 'completed',
        confidence_after: dto.confidenceAfter ?? null,
        blocker: personalized.blocker,
        insight: personalized.insight,
        report: personalized.report,
        commitment,
        commitment_due_at: dueAt.toISOString(),
        completed_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
    return this.get(userId, id);
  }

  async updateCommitment(
    userId: string,
    id: string,
    status: 'done' | 'not_done',
  ) {
    const session = await this.findSession(userId, id);
    if (session.status !== 'completed' || !session.commitment) {
      throw new BadRequestException('This session has no completed commitment');
    }
    const { error } = await this.supabase
      .from('coaching_sessions')
      .update({
        commitment_status: status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
    return this.get(userId, id);
  }

  private async findSession(userId: string, id: string) {
    const { data, error } = await this.supabase
      .from('coaching_sessions')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();
    if (error || !data)
      throw new NotFoundException('Coaching session not found');
    return data;
  }

  private async messages(userId: string, sessionId: string) {
    const { data, error } = await this.supabase
      .from('coaching_messages')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .order('sequence');
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  private async insertMessage(
    userId: string,
    sessionId: string,
    sequence: number,
    sender: 'coach' | 'user',
    text: string,
  ) {
    const { error } = await this.supabase.from('coaching_messages').insert({
      user_id: userId,
      session_id: sessionId,
      sequence,
      sender,
      text,
    });
    if (error) throw new Error(error.message);
  }

  private summaryOf(text: string) {
    const normalized = text.replace(/\s+/g, ' ').trim();
    return normalized.length <= 180
      ? normalized
      : `${normalized.slice(0, 177)}...`;
  }

  private async loadUserContext(userId: string) {
    const [profile, candidatures, actions, coachingHistory] = await Promise.all(
      [
        this.supabase
          .from('user_profiles')
          .select('*')
          .eq('id', userId)
          .single(),
        this.supabase.from('candidatures').select('*').eq('user_id', userId),
        this.supabase
          .from('candidature_actions')
          .select('*')
          .eq('user_id', userId),
        this.supabase
          .from('coaching_sessions')
          .select(
            'trigger_context, blocker, insight, report, commitment, commitment_status, created_at',
          )
          .eq('user_id', userId)
          .eq('status', 'completed'),
      ],
    );
    for (const result of [profile, candidatures, actions, coachingHistory]) {
      if (result.error) throw new Error(result.error.message);
    }
    return {
      profile: profile.data,
      candidatures: candidatures.data ?? [],
      candidatureActions: actions.data ?? [],
      previousCoachingSessions: coachingHistory.data ?? [],
    };
  }

  private async personalizeReport(
    userContext: Record<string, any>,
    messages: any[],
    commitment: string,
  ): Promise<{ blocker: string; insight: string; report: string }> {
    const transcript = messages
      .map(
        (message) =>
          `${message.sender === 'user' ? 'Personne' : 'Coach'}: ${message.text}`,
      )
      .join('\n');
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Tu rédiges le bilan bref d’un coaching de confiance professionnelle. Réponds uniquement en JSON avec blocker, insight et report. Chaque valeur doit être une chaîne en français. Ton: chaleureux, non clinique, sans diagnostic médical, sans promesse. blocker: 3 à 12 mots. insight: une phrase de 25 mots maximum. report: deux phrases de 60 mots maximum au total.',
        },
        {
          role: 'user',
          content: `Contexte complet connu de la personne :\n${JSON.stringify(userContext)}\n\nConversation:\n${transcript}\n\nEngagement choisi: ${commitment}`,
        },
      ],
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('Empty coaching report');
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const blocker = this.summaryOf(String(parsed.blocker ?? ''));
    const insight = this.summaryOf(String(parsed.insight ?? ''));
    const report = this.summaryOf(String(parsed.report ?? ''));
    if (!blocker || !insight || !report) {
      throw new Error('Invalid coaching report');
    }
    return { blocker, insight, report };
  }
}
