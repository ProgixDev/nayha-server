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
    const shortTitle = this.formatTitle(dto.triggerContext || dto.initialMessage);
    const { data: session, error } = await this.supabase
      .from('coaching_sessions')
      .insert({
        user_id: userId,
        trigger_context: shortTitle,
        confidence_before: dto.confidenceBefore ?? null,
        user_context: userContext,
      })
      .select()
      .single();
    if (error || !session)
      throw new Error(error?.message ?? 'Unable to create coaching session');

    const initialMessage = dto.initialMessage?.trim() || null;
    if (initialMessage)
      await this.insertMessage(userId, session.id, 1, 'user', initialMessage);
    const openingReply = await this.generateReply(
      userContext,
      initialMessage ? [{ sender: 'user', text: initialMessage }] : [],
      true,
    ).catch(() =>
      initialMessage
        ? 'Merci de me le confier. Je suis là pour t’écouter et avancer à ton rythme.'
        : 'Bonjour, je suis là pour t’écouter. Tu peux commencer par ce qui te semble important aujourd’hui.',
    );
    await this.insertMessage(
      userId,
      session.id,
      initialMessage ? 2 : 1,
      'coach',
      openingReply,
    );
    return this.get(userId, session.id);
  }

  async list(userId: string, pageValue?: string, pageSizeValue?: string) {
    const page = Math.max(1, Number.parseInt(pageValue ?? '1', 10) || 1);
    const pageSize = Math.min(
      30,
      Math.max(1, Number.parseInt(pageSizeValue ?? '10', 10) || 10),
    );
    const from = (page - 1) * pageSize;
    const { data, error, count } = await this.supabase
      .from('coaching_sessions')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    return {
      items: data ?? [],
      page,
      pageSize,
      total: count ?? 0,
      hasMore: from + (data?.length ?? 0) < (count ?? 0),
    };
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

  async getSuggestions(
    userId: string,
  ): Promise<Array<{ title: string; question: string }>> {
    const fallback = [
      {
        title: 'Reprendre confiance en soi',
        question:
          'Comment reprendre confiance pour postuler à de nouvelles opportunités ?',
      },
      {
        title: 'Valoriser mon parcours',
        question:
          'Comment bien présenter mon parcours et expliquer mes transitions ?',
      },
      {
        title: 'Surmonter mes doutes',
        question:
          'Comment dépasser le sentiment d’illégitimité et avancer sereinement ?',
      },
      {
        title: 'Préparer un entretien',
        question:
          'Comment me préparer avec clarté et assurance avant un entretien ?',
      },
    ];

    try {
      const userContext = await this.loadUserContext(userId);
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.5,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Tu es le coach d'orientation et de confiance professionnelle de NAYHA.
Génère une liste de 4 sujets de départ ("suggestions") personnalisés et pertinents pour aider la personne selon sa situation actuelle (candidatures, refus, entretiens, parcours, pause professionnelle).
Réponds UNIQUEMENT en JSON avec la clé "suggestions" contenant une liste de 4 objets:
- "title": Titre court du sujet, 3 à 4 mots maximum (ex: "Reprendre confiance en soi", "Préparer mon entretien", "Valoriser mon parcours", "Surmonter mes doutes").
- "question": Première question claire, chaleureuse et concrète que la personne pose au coach (ex: "Comment aborder sereinement les questions difficiles en entretien ?").`,
          },
          {
            role: 'user',
            content: `Contexte complet de la personne :\n${JSON.stringify(userContext)}`,
          },
        ],
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) return fallback;
      const parsed = JSON.parse(content) as {
        suggestions?: Array<{ title?: string; question?: string }>;
      };
      const rawList = parsed.suggestions;
      if (!Array.isArray(rawList) || rawList.length === 0) return fallback;

      const results = rawList
        .filter(
          (item) =>
            item &&
            typeof item.title === 'string' &&
            typeof item.question === 'string',
        )
        .map((item) => ({
          title: this.formatTitle(item.title),
          question: item.question!.trim(),
        }))
        .filter((item) => item.title.length > 0 && item.question.length > 0);

      if (results.length >= 3) {
        return results.slice(0, 4);
      }
      return fallback;
    } catch (_) {
      return fallback;
    }
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
    let sequence = messages.length + 1;
    await this.insertMessage(userId, id, sequence++, 'user', trimmed);
    const reply = await this.generateReply(session.user_context ?? {}, [
      ...messages,
      { sender: 'user', text: trimmed },
    ]).catch(
      () =>
        'Je t’entends. Prends le temps de me dire ce qui serait le plus utile pour toi maintenant.',
    );
    await this.insertMessage(userId, id, sequence, 'coach', reply);
    return this.get(userId, id);
  }

  async complete(userId: string, id: string, dto: CompleteCoachingSessionDto) {
    const session = await this.findSession(userId, id);
    if (session.status !== 'active' && session.status !== 'ready_to_complete') {
      throw new BadRequestException('This coaching session has already ended');
    }
    const messages = await this.messages(userId, id);
    const firstAnswer =
      messages.find((message) => message.sender === 'user')?.text ?? '';
    const commitment = dto.commitment?.trim() || null;
    const now = new Date();
    const dueAt = commitment
      ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      : null;
    const fallback = {
      blocker: this.summaryOf(firstAnswer) || 'Temps de réflexion',
      insight:
        'La confiance se construit aussi par une action réalisable, même imparfaite.',
      report: commitment
        ? `Tu as pris le temps d’identifier ce qui te freine. Ton point d’appui cette semaine : ${commitment}`
        : 'Tu as pris un temps pour faire le point sur ce qui compte pour toi. Tu pourras revenir quand tu le souhaites.',
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
        commitment_due_at: dueAt?.toISOString() ?? null,
        completed_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
    return this.get(userId, id);
  }

  async remove(userId: string, id: string) {
    await this.findSession(userId, id);
    const { error } = await this.supabase
      .from('coaching_sessions')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
    return { deleted: true };
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

  public formatTitle(text?: string | null): string {
    if (!text || !text.trim()) return 'Coaching confiance';
    const clean = text
      .trim()
      .replace(/[?!.:;]+$/g, '')
      .replace(/\s+/g, ' ');
    const lower = clean.toLowerCase();

    if (lower.includes('reprendre confiance') || lower.includes('confiance')) {
      if (lower.includes('pause')) return 'Confiance après pause';
      if (lower.includes('postuler')) return 'Confiance pour postuler';
      return 'Reprendre confiance en soi';
    }
    if (lower.includes('parcours') || lower.includes('parler')) {
      return 'Valoriser mon parcours';
    }
    if (
      lower.includes('peur') ||
      lower.includes('hauteur') ||
      lower.includes('doute') ||
      lower.includes('légitime') ||
      lower.includes('illégitime')
    ) {
      return 'Surmonter mes doutes';
    }
    if (lower.includes('entretien')) {
      return 'Préparer un entretien';
    }
    if (lower.includes('reconversion') || lower.includes('métier') || lower.includes('voie')) {
      return 'Clarifier ma reconversion';
    }
    if (lower.includes('activité') || lower.includes('création') || lower.includes('client')) {
      return 'Lancer mon activité';
    }

    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length <= 4) return words.join(' ');
    return words.slice(0, 4).join(' ');
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
    commitment: string | null,
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
            'Tu rédiges le bilan bref d’un coaching de confiance professionnelle. Réponds uniquement en JSON avec blocker, insight et report. Chaque valeur doit être une chaîne en français. Ton: chaleureux, non clinique, sans diagnostic médical, sans promesse. blocker: Titre court du sujet abordé en 3 à 4 mots maximum (ex: "Reprendre confiance en soi", "Valoriser son parcours", "Préparer un entretien"). insight: une phrase de 25 mots maximum. report: deux phrases de 60 mots maximum au total.',
        },
        {
          role: 'user',
          content: `Contexte complet connu de la personne :\n${JSON.stringify(userContext)}\n\nConversation:\n${transcript}\n\nEngagement choisi: ${commitment ?? 'Aucun'}`,
        },
      ],
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('Empty coaching report');
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const blocker = this.formatTitle(String(parsed.blocker ?? ''));
    const insight = this.summaryOf(String(parsed.insight ?? ''));
    const report = this.summaryOf(String(parsed.report ?? ''));
    if (!blocker || !insight || !report) {
      throw new Error('Invalid coaching report');
    }
    return { blocker, insight, report };
  }

  private async generateReply(
    userContext: Record<string, any>,
    messages: Array<{ sender: string; text: string }>,
    isOpening = false,
  ) {
    const transcript = messages
      .map(
        (message) =>
          `${message.sender === 'user' ? 'Personne' : 'Coach'}: ${message.text}`,
      )
      .join('\n');
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.45,
      messages: [
        {
          role: 'system',
          content: `Tu es le coach confiance professionnel de NAYHA. Tu accompagnes une conversation ouverte, sans questionnaire, nombre d’étapes imposé ni engagement obligatoire. Réponds avec empathie et de manière utile au dernier message. ${isOpening ? 'Si la personne n’a encore rien écrit, accueille-la avec une invitation ouverte.' : 'Pose au plus une question seulement si elle aide réellement à avancer.'} Réponse en français, 90 mots maximum, sans diagnostic médical ni promesse. Utilise le contexte sans citer de données personnelles inutilement.`,
        },
        {
          role: 'user',
          content: `Contexte complet :\n${JSON.stringify(userContext)}\n\nConversation :\n${transcript || '(La personne n’a pas encore écrit.)'}`,
        },
      ],
    });
    const reply = completion.choices[0]?.message?.content?.trim();
    if (!reply) throw new Error('Empty coaching opening reply');
    return reply;
  }
}
