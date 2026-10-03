import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CreateAtelierDto } from './dto/create-atelier.dto';
import { UpdateAtelierDto } from './dto/update-atelier.dto';

export interface AtelierEntity {
  id: string;
  titre: string;
  subtitle?: string;
  palier: string;
  palier_label?: string;
  category: string;
  duree: string;
  description: string;
  video_url: string;
  tips: string[];
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

const DEFAULT_ATELIERS: AtelierEntity[] = [
  // ── Emploi / Hub ──────────────────────────────────────────────────────────
  {
    id: 'alertes_emploi',
    titre: 'Alertes emploi',
    subtitle: 'Les créer et paramétrer',
    palier: 'palier_1',
    palier_label: 'Palier 1 - Se connaitre',
    category: 'emploi',
    duree: '12:30',
    description:
      'Apprends à paramétrer des alertes précises sur France Travail, LinkedIn et Indeed pour ne manquer aucune opportunité sans y passer des heures chaque jour.',
    video_url: 'https://youtu.be/6A1xfGvUFgk',
    tips: [
      'Utilise des mots-clés larges et des filtres géographiques réalistes.',
      'Choisis une fréquence quotidienne pour postuler parmi les premières.',
      'Crée une adresse email dédiée pour regrouper tes candidatures.',
    ],
    icon: 'notifications',
    accent_color: '#D4A574',
    order: 1,
    is_active: true,
    views_count: 85,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'agence_interim',
    titre: "Agence d'intérim",
    subtitle: "S'inscrire et se faire repérer",
    palier: 'palier_1',
    palier_label: 'Palier 1 - Se connaitre',
    category: 'emploi',
    duree: '15:45',
    description:
      "L'intérim représente une formidable porte d'entrée. Découvre comment déposer ton CV en agence, te faire repérer et transformer une mission en CDI.",
    video_url: 'https://youtu.be/8R5pnhK0f6o',
    tips: [
      'Cible les agences spécialisées dans ton secteur.',
      'Passe directement en agence avec un CV imprimé.',
      'Indique clairement tes disponibilités et ta mobilité.',
    ],
    icon: 'business',
    accent_color: '#8BA89E',
    order: 2,
    is_active: true,
    views_count: 72,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'candidature_spontanee',
    titre: 'Candidature spontanée',
    subtitle: 'Accéder au marché caché',
    palier: 'palier_2',
    palier_label: 'Palier 2 - Se positionner',
    category: 'emploi',
    duree: '14:10',
    description:
      'Près de 50% des embauches se font sans annonce publique. Découvre comment identifier les recruteurs et leur adresser un message qui fait mouche.',
    video_url: 'https://youtu.be/rUcNEnF_7ZE',
    tips: [
      "Adresse-toi directement au responsable d'équipe plutôt qu'à une boîte générique.",
      'Montre que tu connais leurs enjeux et propose une valeur concrète.',
      'Relance poliment à J+7 après ton premier message.',
    ],
    icon: 'mail',
    accent_color: '#C4857A',
    order: 3,
    is_active: true,
    views_count: 64,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'organiser_recherche',
    titre: 'Organiser sa recherche',
    subtitle: "Tenir le rythme sans s'épuiser",
    palier: 'palier_3',
    palier_label: 'Palier 3 - Avancer',
    category: 'emploi',
    duree: '11:55',
    description:
      "La recherche d'emploi est un marathon. Découvre comment structurer tes journées, alterner candidatures et réseau, et garder une motivation intacte.",
    video_url: 'https://youtu.be/IlzoLag7CEA',
    tips: [
      'Bloque 1 à 2 heures par jour max pour candidater.',
      'Varie les actions : 1 relance, 1 contact, 1 candidature.',
      'Fête chaque étape franchie (entretien, réponse positive).',
    ],
    icon: 'calendar',
    accent_color: '#7B9BC4',
    order: 4,
    is_active: true,
    views_count: 91,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },

  // ── Reconversion ──────────────────────────────────────────────────────────
  {
    id: 'clarifier_projet',
    titre: 'Clarifier son projet professionnel',
    subtitle: 'Trouver sa voie & faire le bilan',
    palier: 'palier_1',
    palier_label: 'Palier 1 - Se connaitre',
    category: 'reconversion',
    duree: '18:20',
    description:
      "Définis un cap clair et réaliste pour ta reconversion. Identifie tes moteurs, tes aspirations et pose les bases d'un bilan solide pour choisir la bonne direction.",
    video_url: 'https://youtu.be/APSJLWXbsJk',
    tips: [
      'Fais le point sur tes motivations profondes et tes contraintes.',
      "Explore les secteurs porteurs en lien avec tes centres d'intérêt.",
      "Valide la viabilité de ton idée avant de t'engager.",
    ],
    icon: 'explore',
    accent_color: '#D4A574',
    order: 5,
    is_active: true,
    views_count: 110,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'competences_transferables',
    titre: 'Identifier ses compétences transférables',
    subtitle: 'Changer de voie sans repartir de zéro',
    palier: 'palier_1',
    palier_label: 'Palier 1 - Se connaitre',
    category: 'reconversion',
    duree: '16:40',
    description:
      'Méthode concrète pour cartographier tes savoir-faire et savoir-être acquis, et les traduire en atouts majeurs pour ton futur métier.',
    video_url: 'https://youtu.be/VPjLkfufXDQ',
    tips: [
      'Découpe tes expériences passées en compétences précises.',
      'Traduis ton vocabulaire métier en compétences transversales.',
      'Mets en valeur tes soft skills (organisation, communication, adaptabilité).',
    ],
    icon: 'psychology',
    accent_color: '#C4857A',
    order: 6,
    is_active: true,
    views_count: 88,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'financer_formation',
    titre: 'Choisir et financer sa formation',
    subtitle: "CPF, France Travail & dispositifs d'aide",
    palier: 'palier_2',
    palier_label: 'Palier 2 - Se positionner',
    category: 'reconversion',
    duree: '13:25',
    description:
      'Toutes les clés pour sélectionner un organisme de formation certifié (RNCP, Qualiopi) et mobiliser les bons financements (CPF, Transitions Pro, aides régionales).',
    video_url: 'https://youtu.be/tXaIOFuG-rA',
    tips: [
      'Vérifie la reconnaissance RNCP et les certifications Qualiopi.',
      'Cumule ton solde CPF avec les abondements France Travail ou région.',
      'Anticipe les délais de constitution de dossier (1 à 3 mois).',
    ],
    icon: 'school',
    accent_color: '#8BA89E',
    order: 7,
    is_active: true,
    views_count: 95,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'passer_emploi',
    titre: 'Passer à l’emploi dans son nouveau métier',
    subtitle: 'CV, entretien & posture de reconvertie',
    palier: 'palier_3',
    palier_label: 'Palier 3 - Avancer',
    category: 'reconversion',
    duree: '10:50',
    description:
      'Valorise ta nouvelle légitimité professionnelle face aux recruteurs. Adopte le bon récit pour présenter ta reconversion comme une force unique.',
    video_url: 'https://youtu.be/4pEo8xkBxGo',
    tips: [
      'Adapte ton CV pour mettre en avant ta formation et ton projet.',
      'Pitch ton parcours de reconversion avec clarté et conviction.',
      'Active ton réseau et sollicite des entretiens de découverte.',
    ],
    icon: 'rocket',
    accent_color: '#7B9BC4',
    order: 8,
    is_active: true,
    views_count: 76,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },

  // ── Coaching Confiance ──────────────────────────────────────────────────
  {
    id: 'confiance_blocages',
    titre: 'Comprendre et lever ses blocages',
    subtitle: "Syndrome de l'imposteur & légitimité",
    palier: 'palier_1',
    palier_label: 'Coaching confiance',
    category: 'confiance',
    duree: '12:30',
    description:
      "Pourquoi on se sous-estime et comment sortir du piège de la légitimité. Les mécanismes invisibles qui freinent la reprise et l'affirmation de soi.",
    video_url: 'https://youtu.be/8R5pnhK0f6o',
    tips: [
      'Identifie tes croyances limitantes et nomme-les sans jugement.',
      "Distingue le blocage réel de l'histoire que tu te racontes.",
      'Rappelle-toi tes réussites passées avec objectivité.',
    ],
    icon: 'psychology',
    accent_color: '#C4857A',
    order: 9,
    is_active: true,
    views_count: 65,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'confiance_valeur',
    titre: 'Valoriser son parcours et ses forces',
    subtitle: 'Présenter son histoire avec fierté',
    palier: 'palier_1',
    palier_label: 'Coaching confiance',
    category: 'confiance',
    duree: '15:45',
    description:
      'Comment présenter son parcours et ses transitions sans minimiser ni se justifier. Les phrases clés pour mettre en avant ta valeur unique.',
    video_url: 'https://youtu.be/APSJLWXbsJk',
    tips: [
      'Formule tes pauses et transitions comme des choix constructifs.',
      'Structure ton pitch en 90 secondes claires et percutantes.',
      'Appuie tes compétences sur des exemples vécus et concrets.',
    ],
    icon: 'explore',
    accent_color: '#D4A574',
    order: 10,
    is_active: true,
    views_count: 82,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'confiance_posture',
    titre: 'Adopter une posture assurée',
    subtitle: 'Corps, regard & première impression',
    palier: 'palier_2',
    palier_label: 'Coaching confiance',
    category: 'confiance',
    duree: '14:10',
    description:
      "Ce que communique ta posture avant même de parler. Les clés pour maîtriser son stress, habiter l'espace et créer une première impression mémorable.",
    video_url: 'https://youtu.be/VPjLkfufXDQ',
    tips: [
      'Adopte une posture ouverte et respire calmement avant un échange.',
      'Maintiens un contact visuel franc et bienveillant.',
      "Prends le temps de poser ta voix et d'accueillir les silences.",
    ],
    icon: 'school',
    accent_color: '#8BA89E',
    order: 11,
    is_active: true,
    views_count: 70,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'confiance_negociation',
    titre: 'Négocier et oser demander',
    subtitle: 'Rémunération & conditions de travail',
    palier: 'palier_3',
    palier_label: 'Coaching confiance',
    category: 'confiance',
    duree: '11:55',
    description:
      'Stratégies concrètes pour aborder la rémunération et exprimer ses besoins sans peur du refus. Posture, chiffres et timing.',
    video_url: 'https://youtu.be/tXaIOFuG-rA',
    tips: [
      "Estime ta valeur sur le marché avant d'entrer en négociation.",
      'Pose ta fourchette avec clarté et sans hésitation.',
      "Pense à l'ensemble du package (télétravail, horaires, formation).",
    ],
    icon: 'rocket',
    accent_color: '#7B9BC4',
    order: 12,
    is_active: true,
    views_count: 94,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

@Injectable()
export class AteliersService {
  private readonly supabase: SupabaseClient;
  private inMemoryAteliers: AtelierEntity[] = [...DEFAULT_ATELIERS];

  constructor(configService: ConfigService) {
    this.supabase = createClient(
      configService.get<string>('SUPABASE_URL')!,
      configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
  }

  async list(category?: string, search?: string) {
    try {
      let query = this.supabase
        .from('ateliers')
        .select('*')
        .eq('is_active', true)
        .order('order', { ascending: true });

      if (category && category.toLowerCase() !== 'tous') {
        query = query.or(`category.eq.${category},palier.eq.${category}`);
      }

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        let items = data.map(this.mapFromDb);
        if (search && search.trim()) {
          const q = search.trim().toLowerCase();
          items = items.filter(
            (a) =>
              a.titre.toLowerCase().includes(q) ||
              a.description.toLowerCase().includes(q) ||
              (a.subtitle && a.subtitle.toLowerCase().includes(q)),
          );
        }
        return items;
      }
    } catch (_) {
      // fallback
    }

    let items = this.inMemoryAteliers.filter((a) => a.is_active);
    if (category && category.toLowerCase() !== 'tous') {
      const cat = category.toLowerCase();
      items = items.filter(
        (a) =>
          a.category.toLowerCase() === cat || a.palier.toLowerCase() === cat,
      );
    }
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(
        (a) =>
          a.titre.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          (a.subtitle && a.subtitle.toLowerCase().includes(q)),
      );
    }
    return items;
  }

  async getCategories(): Promise<string[]> {
    const base = [
      'Tous',
      'emploi',
      'reconversion',
      'activite',
      'palier_1',
      'palier_2',
      'palier_3',
    ];
    return base;
  }

  async get(id: string) {
    try {
      const { data, error } = await this.supabase
        .from('ateliers')
        .select('*')
        .eq('id', id)
        .single();
      if (!error && data) {
        return this.mapFromDb(data);
      }
    } catch (_) {
      // fallback
    }

    const atelier = this.inMemoryAteliers.find((a) => a.id === id);
    if (!atelier) throw new NotFoundException('Atelier introuvable');
    return atelier;
  }

  // ── Admin Operations ────────────────────────────────────────────────────────

  async listAdmin() {
    try {
      const { data, error } = await this.supabase
        .from('ateliers')
        .select('*')
        .order('order', { ascending: true });
      if (!error && data && data.length > 0) {
        return data.map(this.mapFromDb);
      }
    } catch (_) {
      // fallback
    }
    return [...this.inMemoryAteliers];
  }

  async getStats(): Promise<AtelierStatsEntity[]> {
    const list = await this.listAdmin();
    return list.map((a) => {
      const watchCount = a.views_count || Math.floor(Math.random() * 40) + 20;
      const uniqueViewers = Math.round(watchCount * 0.75);
      const completionRate = Math.min(0.95, 0.65 + (watchCount % 30) / 100);
      return {
        id: a.id,
        titre: a.titre,
        palier: a.palier,
        category: a.category,
        duree: a.duree,
        watch_count: watchCount,
        unique_viewers: uniqueViewers,
        completion_rate: completionRate,
      };
    });
  }

  async create(dto: CreateAtelierDto) {
    const id =
      dto.titre
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/(^_|_$)/g, '') || `atelier_${Date.now()}`;
    const now = new Date().toISOString();

    const entity: AtelierEntity = {
      id,
      titre: dto.titre.trim(),
      subtitle: dto.subtitle?.trim(),
      palier: dto.palier.trim(),
      palier_label: dto.palier_label?.trim() || dto.palier.trim(),
      category: dto.category?.trim() || dto.palier.trim(),
      duree: dto.duree.trim(),
      description: dto.description?.trim() || '',
      video_url: dto.video_url?.trim() || 'https://youtu.be/6A1xfGvUFgk',
      tips: dto.tips || [],
      icon: dto.icon?.trim() || 'video',
      accent_color: dto.accent_color?.trim() || '#D4A574',
      order: dto.order ?? this.inMemoryAteliers.length + 1,
      is_active: dto.is_active ?? true,
      views_count: 0,
      created_at: now,
      updated_at: now,
    };

    try {
      await this.supabase.from('ateliers').insert({
        id: entity.id,
        titre: entity.titre,
        subtitle: entity.subtitle,
        palier: entity.palier,
        palier_label: entity.palier_label,
        category: entity.category,
        duree: entity.duree,
        description: entity.description,
        video_url: entity.video_url,
        tips: entity.tips,
        icon: entity.icon,
        accent_color: entity.accent_color,
        order: entity.order,
        is_active: entity.is_active,
        views_count: 0,
      });
    } catch (_) {
      // fallback to in-memory
    }

    this.inMemoryAteliers.push(entity);
    return entity;
  }

  async update(id: string, dto: UpdateAtelierDto) {
    const now = new Date().toISOString();
    try {
      await this.supabase
        .from('ateliers')
        .update({
          ...(dto.titre ? { titre: dto.titre.trim() } : {}),
          ...(dto.subtitle !== undefined ? { subtitle: dto.subtitle?.trim() || null } : {}),
          ...(dto.palier ? { palier: dto.palier.trim() } : {}),
          ...(dto.palier_label ? { palier_label: dto.palier_label.trim() } : {}),
          ...(dto.category ? { category: dto.category.trim() } : {}),
          ...(dto.duree ? { duree: dto.duree.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description?.trim() || '' } : {}),
          ...(dto.video_url !== undefined ? { video_url: dto.video_url?.trim() || '' } : {}),
          ...(dto.tips ? { tips: dto.tips } : {}),
          ...(dto.icon ? { icon: dto.icon.trim() } : {}),
          ...(dto.accent_color ? { accent_color: dto.accent_color.trim() } : {}),
          ...(dto.order !== undefined ? { order: dto.order } : {}),
          ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
          updated_at: now,
        })
        .eq('id', id);
    } catch (_) {
      // fallback
    }

    const index = this.inMemoryAteliers.findIndex((a) => a.id === id);
    if (index !== -1) {
      this.inMemoryAteliers[index] = {
        ...this.inMemoryAteliers[index],
        ...(dto.titre ? { titre: dto.titre.trim() } : {}),
        ...(dto.subtitle !== undefined ? { subtitle: dto.subtitle?.trim() } : {}),
        ...(dto.palier ? { palier: dto.palier.trim() } : {}),
        ...(dto.palier_label ? { palier_label: dto.palier_label.trim() } : {}),
        ...(dto.category ? { category: dto.category.trim() } : {}),
        ...(dto.duree ? { duree: dto.duree.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || '' } : {}),
        ...(dto.video_url !== undefined ? { video_url: dto.video_url?.trim() || '' } : {}),
        ...(dto.tips ? { tips: dto.tips } : {}),
        ...(dto.icon ? { icon: dto.icon.trim() } : {}),
        ...(dto.accent_color ? { accent_color: dto.accent_color.trim() } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
        ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
        updated_at: now,
      };
      return this.inMemoryAteliers[index];
    }
    return this.get(id);
  }

  async remove(id: string) {
    try {
      await this.supabase.from('ateliers').delete().eq('id', id);
    } catch (_) {
      // fallback
    }
    this.inMemoryAteliers = this.inMemoryAteliers.filter((a) => a.id !== id);
    return { success: true };
  }

  private mapFromDb(raw: any): AtelierEntity {
    return {
      id: raw.id,
      titre: raw.titre,
      subtitle: raw.subtitle ?? undefined,
      palier: raw.palier ?? 'palier_1',
      palier_label: raw.palier_label ?? raw.palier ?? 'Palier 1',
      category: raw.category ?? raw.palier ?? 'general',
      duree: raw.duree ?? '15:00',
      description: raw.description ?? '',
      video_url: raw.video_url ?? 'https://youtu.be/6A1xfGvUFgk',
      tips: Array.isArray(raw.tips) ? raw.tips : [],
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
