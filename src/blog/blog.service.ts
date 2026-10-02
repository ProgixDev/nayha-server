import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CreateBlogArticleDto } from './dto/create-blog-article.dto';
import { UpdateBlogArticleDto } from './dto/update-blog-article.dto';

export interface BlogArticleEntity {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  readTimeMinutes: number;
  keyTakeaway: string;
  exerciseTitle?: string;
  exercisePrompt?: string;
  sections: Array<{ heading?: string; content: string }>;
  coachTrigger: string;
  coachMessage: string;
  isPublished: boolean;
  viewsCount: number;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_ARTICLES: BlogArticleEntity[] = [
  {
    id: 'premiers-pas-confiance',
    title: 'Les premiers pas pour avancer avec confiance',
    subtitle:
        'Comment dépasser la paralysie du doute et réenclencher une dynamique positive au quotidien.',
    category: 'Confiance',
    readTimeMinutes: 3,
    keyTakeaway:
        'La confiance ne précède pas l’action, elle en est la conséquence directe. Commencer par un micro-geste réalisable débloque l’élan.',
    exerciseTitle: 'Ton micro-geste du jour (2 min)',
    exercisePrompt:
        'Identifie une seule chose que tu repousses par manque d’assurance. Rends-la si petite qu’il est impossible d’échouer, et fais-la maintenant.',
    coachTrigger: 'Reprendre confiance',
    coachMessage:
        'J’ai lu l’article sur les premiers pas pour avancer avec confiance. Comment puis-je définir mon tout premier micro-geste cette semaine ?',
    sections: [
      {
        heading: 'Le mythe du courage préalable',
        content:
            'On attend souvent de "se sentir prêt" ou "d’avoir confiance" avant de postuler, de contacter une personne du réseau ou de poser les bases d’un projet. En réalité, le cerveau attend des preuves tangibles de succès avant de libérer le sentiment de sécurité intérieure.',
      },
      {
        heading: 'La règle de la micro-marche',
        content:
            'Plutôt que de viser un objectif monumental, découpe-le en une tâche de 5 minutes. Ouvrir un document et écrire 3 compétences suffit à relancer l’énergie.',
      },
      {
        heading: 'Accepter l’inconfort passager',
        content:
            'L’hésitation n’est pas un signe d’incompétence. C’est simplement le signe que tu t’aventures hors de ta zone de confort connue. Sois bienveillant avec ce ressenti et avance à ton rythme.',
      },
    ],
    isPublished: true,
    viewsCount: 240,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'transformer-experience-atout',
    title: 'Transformer son expérience en véritable atout',
    subtitle:
        'Mettre en valeur son parcours singulier, ses compétences transversales et ses apprentissages.',
    category: 'Retour à l’emploi',
    readTimeMinutes: 4,
    keyTakeaway:
        'Chaque étape de ton parcours t’a appris des compétences précieuses. Ce n’est pas la linéarité qui fait la valeur, c’est le fil conducteur que tu racontes.',
    exerciseTitle: 'L’exercice des compétences invisibles',
    exercisePrompt:
        'Liste 3 compétences relationnelles ou d’organisation que tu as développées en dehors d’un cadre professionnel classique.',
    coachTrigger: 'Valoriser mon parcours',
    coachMessage:
        'J’aimerais apprendre à mieux raconter mon parcours et valoriser mes compétences transversales.',
    sections: [
      {
        heading: 'Sortir de la comparaison',
        content:
            'Il est tentant de comparer son CV à des parcours ultra-linéaires. Pourtant, les recruteurs recherchent de plus en plus des profils adaptables, résilients et capables d’apporter une perspective différente.',
      },
      {
        heading: 'Identifier le fil conducteur',
        content:
            'Quelle est la valeur ou le plaisir qui a toujours guidé tes choix ? L’écoute, la rigueur, le sens du service, la créativité ? C’est ce fil rouge qui donne toute sa cohérence à ton histoire.',
      },
      {
        heading: 'Exprimer ses réussites avec simplicité',
        content:
            'Parler de ses réussites ne signifie pas se vanter. Il s’agit simplement de décrire une situation, ton action concrète et le résultat obtenu pour l’équipe ou le projet.',
      },
    ],
    isPublished: true,
    viewsCount: 185,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'trouver-rythme-durable',
    title: 'Trouver un rythme durable pour son projet',
    subtitle:
        'Éviter l’épuisement et bâtir une routine bienveillante et régulière vers ses objectifs.',
    category: 'Confiance',
    readTimeMinutes: 3,
    keyTakeaway:
        'La constance douce bat toujours l’intensité brève. Mieux vaut 20 minutes chaque matin qu’une journée entière suivie de deux semaines de découragement.',
    exerciseTitle: 'Ta plage de respiration',
    exercisePrompt:
        'Définis une heure fixe dans ta semaine où tu fermes les écrans et où tu t’accordes une pause totale sans culpabilité.',
    coachTrigger: 'Rythme et sérénité',
    coachMessage:
        'Comment organiser mes journées pour avancer sur mon projet professionnel sans me sentir débordé(e) ?',
    sections: [
      {
        heading: 'La fatigue invisible de la transition',
        content:
            'Changer de métier ou chercher un emploi demande une énergie mentale colossale. La remise en question, les doutes et l’incertitude consomment énormément de ressources.',
      },
      {
        heading: 'Protéger ses temps de récupération',
        content:
            'Une pause n’est pas du temps perdu : c’est le carburant indispensable pour garder de la lucidité, de la créativité et de la motivation sur la durée.',
      },
    ],
    isPublished: true,
    viewsCount: 142,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'reconversion-identifier-voie',
    title: 'Clarifier sa voie lors d’une reconversion',
    subtitle:
        'Les 3 questions clés pour aligner ses envies profondes avec les réalités du marché.',
    category: 'Reconversion',
    readTimeMinutes: 5,
    keyTakeaway:
        'Une reconversion réussie se situe au croisement de ce que tu aimes faire, de tes talents naturels et des opportunités réelles sur le terrain.',
    exerciseTitle: 'Le filtre des 3 cercles',
    exercisePrompt:
        'Note 2 activités professionnelles qui te donnent de l’énergie, et 2 tâches que tu souhaites absolument bannir de ton futur quotidien.',
    coachTrigger: 'Clarifier ma reconversion',
    coachMessage:
        'Je suis en pleine réflexion de reconversion et j’aimerais poser les critères essentiels de mon futur métier.',
    sections: [
      {
        heading: 'Partir de ses sources d’énergie',
        content:
            'Au lieu de chercher directement un intitulé de poste, commence par identifier les conditions dans lesquelles tu t’épanouis : travailler en équipe ou en autonomie, en intérieur ou sur le terrain.',
      },
      {
        heading: 'Valider sur le terrain par l’immersion',
        content:
            'Rien ne remplace le contact direct avec des professionnels en poste. Passer une journée en observation (PMSMP) ou faire des interviews métier dissipe les fantasmes.',
      },
    ],
    isPublished: true,
    viewsCount: 310,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'premiers-clients-activite',
    title: 'Décrocher ses premiers clients sans forcer',
    subtitle:
        'La méthode bienveillante pour activer son réseau proche et tester son offre avec authenticité.',
    category: 'Création d’activité',
    readTimeMinutes: 4,
    keyTakeaway:
        'Vendre un service, c’est avant tout résoudre un problème pour quelqu’un. Quand tu te concentres sur l’aide à apporter, la peur de vendre disparaît.',
    exerciseTitle: 'Le message de découverte',
    exercisePrompt:
        'Pense à une personne de ton entourage qui pourrait bénéficier de tes compétences. Propose-lui un échange de 15 min pour lui demander son avis sincère.',
    coachTrigger: 'Lancer mon activité',
    coachMessage:
        'Je prépare le lancement de mon activité et j’aimerais définir ma proposition de valeur pour mes premiers clients.',
    sections: [
      {
        heading: 'Clarifier la transformation',
        content:
            'Les clients n’achètent pas des heures : ils recherchent un soulagement, un gain de temps ou une sérénité retrouvée.',
      },
      {
        heading: 'La puissance des retours d’expérience',
        content:
            'Tes premiers accompagnements sont précieux pour collecter des témoignages concrets. Ils constituent la base de ta crédibilité future.',
      },
    ],
    isPublished: true,
    viewsCount: 95,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'preparer-entretien-sereinement',
    title: 'Aborder un entretien avec authenticité et clarté',
    subtitle:
        'Comment transformer un échange d’embauche en une véritable conversation d’égal à égal.',
    category: 'Retour à l’emploi',
    readTimeMinutes: 4,
    keyTakeaway:
        'Un entretien n’est pas un interrogatoire : c’est une rencontre pour voir si votre collaboration a du sens pour les deux parties.',
    exerciseTitle: 'La question miroir',
    exercisePrompt:
        'Rédige 2 questions précises que tu souhaites poser au recruteur pour savoir si cet environnement te correspond vraiment.',
    coachTrigger: 'Préparer un entretien',
    coachMessage:
        'J’ai un entretien à préparer et j’aimerais m’entraîner à répondre aux questions avec assurance et authenticité.',
    sections: [
      {
        heading: 'Changer de posture',
        content:
            'Le recruteur a un problème à résoudre et cherche un allié. En adoptant une posture d’écoute et de curiosité sincère, tu évites le stress du candidat jugé.',
      },
      {
        heading: 'La structure STAR pour tes exemples',
        content:
            'Pour chaque compétence revendiquée, prépare un exemple concret : Situation, Tâche, Action et Résultat.',
      },
    ],
    isPublished: true,
    viewsCount: 215,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

@Injectable()
export class BlogService {
  private readonly supabase: SupabaseClient;
  private inMemoryArticles: BlogArticleEntity[] = [...DEFAULT_ARTICLES];

  constructor(configService: ConfigService) {
    this.supabase = createClient(
      configService.get<string>('SUPABASE_URL')!,
      configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
  }

  async getCategories(): Promise<string[]> {
    const base = [
      'Tous',
      'Confiance',
      'Reconversion',
      'Retour à l’emploi',
      'Création d’activité',
    ];
    try {
      const { data } = await this.supabase
        .from('blog_articles')
        .select('category');
      if (data && data.length > 0) {
        const set = new Set(base);
        for (const item of data) {
          if (item.category) set.add(item.category);
        }
        return Array.from(set);
      }
    } catch (_) {
      // fallback
    }
    const set = new Set(base);
    for (const a of this.inMemoryArticles) {
      if (a.category) set.add(a.category);
    }
    return Array.from(set);
  }

  async list(category?: string, search?: string) {
    try {
      let query = this.supabase
        .from('blog_articles')
        .select('*')
        .eq('is_published', true)
        .order('created_at', { ascending: false });

      if (category && category.toLowerCase() !== 'tous') {
        query = query.ilike('category', category);
      }

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        let items = data.map(this.mapFromDb);
        if (search && search.trim()) {
          const q = search.trim().toLowerCase();
          items = items.filter(
            (a) =>
              a.title.toLowerCase().includes(q) ||
              a.subtitle.toLowerCase().includes(q) ||
              a.keyTakeaway.toLowerCase().includes(q),
          );
        }
        return items;
      }
    } catch (_) {
      // fallback to memory
    }

    let items = this.inMemoryArticles.filter((a) => a.isPublished);
    if (category && category.toLowerCase() !== 'tous') {
      items = items.filter(
        (a) => a.category.toLowerCase() === category.toLowerCase(),
      );
    }
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.subtitle.toLowerCase().includes(q) ||
          a.keyTakeaway.toLowerCase().includes(q),
      );
    }
    return items;
  }

  async get(id: string) {
    try {
      const { data, error } = await this.supabase
        .from('blog_articles')
        .select('*')
        .eq('id', id)
        .single();
      if (!error && data) {
        return this.mapFromDb(data);
      }
    } catch (_) {
      // fallback
    }

    const article = this.inMemoryArticles.find((a) => a.id === id);
    if (!article) throw new NotFoundException('Article introuvable');
    return article;
  }

  // ── Admin operations ────────────────────────────────────────────────────────

  async listAdmin() {
    try {
      const { data, error } = await this.supabase
        .from('blog_articles')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data && data.length > 0) {
        return data.map(this.mapFromDb);
      }
    } catch (_) {
      // fallback
    }
    return [...this.inMemoryArticles];
  }

  async create(dto: CreateBlogArticleDto) {
    const id =
      dto.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || `article-${Date.now()}`;
    const now = new Date().toISOString();

    const entity: BlogArticleEntity = {
      id,
      title: dto.title.trim(),
      subtitle: dto.subtitle.trim(),
      category: dto.category.trim(),
      readTimeMinutes: dto.readTimeMinutes || 3,
      keyTakeaway: dto.keyTakeaway.trim(),
      exerciseTitle: dto.exerciseTitle?.trim() || undefined,
      exercisePrompt: dto.exercisePrompt?.trim() || undefined,
      sections: dto.sections || [],
      coachTrigger: dto.coachTrigger.trim(),
      coachMessage: dto.coachMessage.trim(),
      isPublished: dto.isPublished ?? true,
      viewsCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.supabase.from('blog_articles').insert({
        id: entity.id,
        title: entity.title,
        subtitle: entity.subtitle,
        category: entity.category,
        read_time_minutes: entity.readTimeMinutes,
        key_takeaway: entity.keyTakeaway,
        exercise_title: entity.exerciseTitle,
        exercise_prompt: entity.exercisePrompt,
        sections: entity.sections,
        coach_trigger: entity.coachTrigger,
        coach_message: entity.coachMessage,
        is_published: entity.isPublished,
        views_count: 0,
      });
    } catch (_) {
      // in-memory fallback
    }

    this.inMemoryArticles.unshift(entity);
    return entity;
  }

  async update(id: string, dto: UpdateBlogArticleDto) {
    const now = new Date().toISOString();
    try {
      await this.supabase
        .from('blog_articles')
        .update({
          ...(dto.title ? { title: dto.title.trim() } : {}),
          ...(dto.subtitle ? { subtitle: dto.subtitle.trim() } : {}),
          ...(dto.category ? { category: dto.category.trim() } : {}),
          ...(dto.readTimeMinutes ? { read_time_minutes: dto.readTimeMinutes } : {}),
          ...(dto.keyTakeaway ? { key_takeaway: dto.keyTakeaway.trim() } : {}),
          ...(dto.exerciseTitle !== undefined ? { exercise_title: dto.exerciseTitle?.trim() || null } : {}),
          ...(dto.exercisePrompt !== undefined ? { exercise_prompt: dto.exercisePrompt?.trim() || null } : {}),
          ...(dto.sections ? { sections: dto.sections } : {}),
          ...(dto.coachTrigger ? { coach_trigger: dto.coachTrigger.trim() } : {}),
          ...(dto.coachMessage ? { coach_message: dto.coachMessage.trim() } : {}),
          ...(dto.isPublished !== undefined ? { is_published: dto.isPublished } : {}),
          updated_at: now,
        })
        .eq('id', id);
    } catch (_) {
      // in memory
    }

    const index = this.inMemoryArticles.findIndex((a) => a.id === id);
    if (index !== -1) {
      this.inMemoryArticles[index] = {
        ...this.inMemoryArticles[index],
        ...(dto.title ? { title: dto.title.trim() } : {}),
        ...(dto.subtitle ? { subtitle: dto.subtitle.trim() } : {}),
        ...(dto.category ? { category: dto.category.trim() } : {}),
        ...(dto.readTimeMinutes ? { readTimeMinutes: dto.readTimeMinutes } : {}),
        ...(dto.keyTakeaway ? { keyTakeaway: dto.keyTakeaway.trim() } : {}),
        ...(dto.exerciseTitle !== undefined ? { exerciseTitle: dto.exerciseTitle?.trim() || undefined } : {}),
        ...(dto.exercisePrompt !== undefined ? { exercisePrompt: dto.exercisePrompt?.trim() || undefined } : {}),
        ...(dto.sections ? { sections: dto.sections } : {}),
        ...(dto.coachTrigger ? { coachTrigger: dto.coachTrigger.trim() } : {}),
        ...(dto.coachMessage ? { coachMessage: dto.coachMessage.trim() } : {}),
        ...(dto.isPublished !== undefined ? { isPublished: dto.isPublished } : {}),
        updatedAt: now,
      };
      return this.inMemoryArticles[index];
    }
    return this.get(id);
  }

  async remove(id: string) {
    try {
      await this.supabase.from('blog_articles').delete().eq('id', id);
    } catch (_) {
      // in memory
    }
    this.inMemoryArticles = this.inMemoryArticles.filter((a) => a.id !== id);
    return { success: true };
  }

  private mapFromDb(raw: any): BlogArticleEntity {
    return {
      id: raw.id,
      title: raw.title,
      subtitle: raw.subtitle,
      category: raw.category,
      readTimeMinutes: raw.read_time_minutes ?? 3,
      keyTakeaway: raw.key_takeaway ?? '',
      exerciseTitle: raw.exercise_title ?? undefined,
      exercisePrompt: raw.exercise_prompt ?? undefined,
      sections: Array.isArray(raw.sections) ? raw.sections : [],
      coachTrigger: raw.coach_trigger ?? 'Coaching confiance',
      coachMessage: raw.coach_message ?? '',
      isPublished: raw.is_published ?? true,
      viewsCount: raw.views_count ?? 0,
      createdAt: raw.created_at ?? new Date().toISOString(),
      updatedAt: raw.updated_at ?? new Date().toISOString(),
    };
  }
}
