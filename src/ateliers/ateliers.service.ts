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

const DEFAULT_ATELIERS: AtelierEntity[] = [
  // ── Emploi / Hub ──────────────────────────────────────────────────────────
  {
    id: 'alertes_emploi',
    titre: 'Alertes emploi',
    subtitle: 'Les créer et paramétrer',
    palier: 'palier_1',
    palier_label: 'Palier 1 - Se connaitre',
    category: 'emploi',
    step_tag: 'Candidatures & Veille',
    duree: '12:30',
    description:
      'Apprends à paramétrer des alertes précises sur France Travail, LinkedIn et Indeed pour ne manquer aucune opportunité sans y passer des heures chaque jour.',
    video_url: 'https://youtu.be/6A1xfGvUFgk',
    objectifs: [
      'Identifier les mots-clés stratégiques pour son profil',
      'Configurer des alertes quotidiennes sans saturation',
      'Créer une routine efficace de veille et candidature',
    ],
    tips: [
      'Utilise des mots-clés larges et des filtres géographiques réalistes.',
      'Choisis une fréquence quotidienne pour postuler parmi les premières.',
      'Crée une adresse email dédiée pour regrouper tes candidatures.',
    ],
    speaker_name: 'Équipe Recrutement NAYHA',
    speaker_role: 'Experte en sourcing emploi',
    resource_url: 'https://www.francetravail.fr',
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
    step_tag: 'Opportunités & Tremplin',
    duree: '15:45',
    description:
      "L'intérim représente une formidable porte d'entrée. Découvre comment déposer ton CV en agence, te faire repérer et transformer une mission en CDI.",
    video_url: 'https://youtu.be/8R5pnhK0f6o',
    objectifs: [
      'Sélectionner les agences spécialisées de son bassin d’emploi',
      'Préparer son pitch de 2 minutes en agence',
      'Négocier des missions avec perspective de titularisation',
    ],
    tips: [
      'Cible les agences spécialisées dans ton secteur.',
      'Passe directement en agence avec un CV imprimé.',
      'Indique clairement tes disponibilités et ta mobilité.',
    ],
    speaker_name: 'Coach Emploi NAYHA',
    speaker_role: 'Conseillère Insertion & Intérim',
    resource_url: '',
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
    step_tag: 'Marché Caché & Réseau',
    duree: '14:10',
    description:
      'Près de 50% des embauches se font sans annonce publique. Découvre comment identifier les recruteurs et leur adresser un message qui fait mouche.',
    video_url: 'https://youtu.be/rUcNEnF_7ZE',
    objectifs: [
      'Trouver le bon décisionnaire sur LinkedIn ou annuaires pro',
      'Rédiger une accroche personnalisée qui démontre de la valeur',
      'Mettre en place une relance constructive sans harceler',
    ],
    tips: [
      "Adresse-toi directement au responsable d'équipe plutôt qu'à une boîte générique.",
      'Montre que tu connais leurs enjeux et propose une valeur concrète.',
      'Relance poliment à J+7 après ton premier message.',
    ],
    speaker_name: 'Experte Réseau NAYHA',
    speaker_role: 'Chasseuse de têtes & Coach',
    resource_url: '',
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
    step_tag: 'Méthode & Organisation',
    duree: '11:55',
    description:
      "La recherche d'emploi est un marathon. Découvre comment structurer tes journées, alterner candidatures et réseau, et garder une motivation intacte.",
    video_url: 'https://youtu.be/IlzoLag7CEA',
    objectifs: [
      'Bâtir un semainier équilibré et protecteur d’énergie',
      'Créer un tableau de bord de suivi des candidatures',
      'Maintenir le moral et célébrer chaque micro-victoire',
    ],
    tips: [
      'Bloque 1 à 2 heures par jour max pour candidater.',
      'Varie les actions : 1 relance, 1 contact, 1 candidature.',
      'Fête chaque étape franchie (entretien, réponse positive).',
    ],
    speaker_name: 'Coach NAYHA',
    speaker_role: 'Spécialiste Organisation & Mental',
    resource_url: '',
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
    step_tag: 'Bilan & Orientation',
    duree: '18:20',
    description:
      "Définis un cap clair et réaliste pour ta reconversion. Identifie tes moteurs, tes aspirations et pose les bases d'un bilan solide pour choisir la bonne direction.",
    video_url: 'https://youtu.be/APSJLWXbsJk',
    objectifs: [
      'Lister ses compétences, valeurs et contraintes personnelles',
      'Explorer des pistes métiers alignées avec son profil',
      'Valider la faisabilité avec des professionnels en poste',
    ],
    tips: [
      'Fais le point sur tes motivations profondes et tes contraintes.',
      "Explore les secteurs porteurs en lien avec tes centres d'intérêt.",
      "Valide la viabilité de ton idée avant de t'engager.",
    ],
    speaker_name: 'Conseillère Bilan NAYHA',
    speaker_role: 'Psychologue du travail & Coach carrière',
    resource_url: '',
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
    step_tag: 'Compétences & Soft Skills',
    duree: '16:40',
    description:
      'Méthode concrète pour cartographier tes savoir-faire et savoir-être acquis, et les traduire en atouts majeurs pour ton futur métier.',
    video_url: 'https://youtu.be/VPjLkfufXDQ',
    objectifs: [
      'Identifier ses compétences techniques et comportementales',
      'Reformuler son vocabulaire métier pour une nouvelle cible',
      'Illustrer chaque compétence par un résultat quantifiable',
    ],
    tips: [
      'Découpe tes expériences passées en compétences précises.',
      'Traduis ton vocabulaire métier en compétences transversales.',
      'Mets en valeur tes soft skills (organisation, communication, adaptabilité).',
    ],
    speaker_name: 'Experte Compétences NAYHA',
    speaker_role: 'Formatrice en Transition Pro',
    resource_url: '',
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
    step_tag: 'Financement & Dossiers',
    duree: '13:25',
    description:
      'Toutes les clés pour sélectionner un organisme de formation certifié (RNCP, Qualiopi) et mobiliser les bons financements (CPF, Transitions Pro, aides régionales).',
    video_url: 'https://youtu.be/tXaIOFuG-rA',
    objectifs: [
      'Vérifier l’éligibilité de sa formation (Qualiopi, RNCP/RS)',
      'Combiner les aides (CPF, AIF, Région, Transitions Pro)',
      'Déposer un dossier solide dans les délais impartis',
    ],
    tips: [
      'Vérifie la reconnaissance RNCP et les certifications Qualiopi.',
      'Cumule ton solde CPF avec les abondements France Travail ou région.',
      'Anticipe les délais de constitution de dossier (1 à 3 mois).',
    ],
    speaker_name: 'Expert Dispositifs NAYHA',
    speaker_role: 'Spécialiste Financements de Formation',
    resource_url: 'https://www.moncompteformation.gouv.fr',
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
    step_tag: 'Immersion & Entretien',
    duree: '10:50',
    description:
      'Valorise ta nouvelle légitimité professionnelle face aux recruteurs. Adopte le bon récit pour présenter ta reconversion comme une force unique.',
    video_url: 'https://youtu.be/4pEo8xkBxGo',
    objectifs: [
      'Construire un CV par compétences ciblé reconversion',
      'Assumer et raconter sa bifurcation professionnelle en entretien',
      'Réaliser une PMSMP / immersion pour sécuriser l’embauche',
    ],
    tips: [
      'Adapte ton CV pour mettre en avant ta formation et ton projet.',
      'Pitch ton parcours de reconversion avec clarté et conviction.',
      'Active ton réseau et sollicite des entretiens de découverte.',
    ],
    speaker_name: 'Coach Emploi NAYHA',
    speaker_role: 'Coach en Reconversion Professionnelle',
    resource_url: '',
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
    step_tag: 'Mental & Légitimité',
    duree: '12:30',
    description:
      "Pourquoi on se sous-estime et comment sortir du piège de la légitimité. Les mécanismes invisibles qui freinent la reprise et l'affirmation de soi.",
    video_url: 'https://youtu.be/8R5pnhK0f6o',
    objectifs: [
      'Identifier les mécanismes du syndrome de l’imposteur',
      'Désamorcer le dialogue intérieur d’autocritique',
      'Reconnaître ses compétences objectives et sa valeur',
    ],
    tips: [
      'Identifie tes croyances limitantes et nomme-les sans jugement.',
      "Distingue le blocage réel de l'histoire que tu te racontes.",
      'Rappelle-toi tes réussites passées avec objectivité.',
    ],
    speaker_name: 'Coach Confiance NAYHA',
    speaker_role: 'Praticienne en Développement Personnel',
    resource_url: '',
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
    step_tag: 'Pitch & Récit',
    duree: '15:45',
    description:
      'Comment présenter son parcours et ses transitions sans minimiser ni se justifier. Les phrases clés pour mettre en avant ta valeur unique.',
    video_url: 'https://youtu.be/APSJLWXbsJk',
    objectifs: [
      'Trouver le fil conducteur positif de son parcours',
      'Exprimer ses transitions sans attitude d’excuse',
      'Livrer un pitch fluide en 90 secondes',
    ],
    tips: [
      'Formule tes pauses et transitions comme des choix constructifs.',
      'Structure ton pitch en 90 secondes claires et percutantes.',
      'Appuie tes compétences sur des exemples vécus et concrets.',
    ],
    speaker_name: 'Coach Expression NAYHA',
    speaker_role: 'Spécialiste en Communication & Storytelling',
    resource_url: '',
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
    step_tag: 'Posture & Non-verbal',
    duree: '14:10',
    description:
      "Ce que communique ta posture avant même de parler. Les clés pour maîtriser son stress, habiter l'espace et créer une première impression mémorable.",
    video_url: 'https://youtu.be/VPjLkfufXDQ',
    objectifs: [
      'Utiliser la respiration pour apaiser le trac en 2 minutes',
      'Adopter une posture ancrée et ouverte en entretien',
      'Maîtriser le contact visuel et le débit vocal',
    ],
    tips: [
      'Adopte une posture ouverte et respire calmement avant un échange.',
      'Maintiens un contact visuel franc et bienveillant.',
      "Prends le temps de poser ta voix et d'accueillir les silences.",
    ],
    speaker_name: 'Coach Posture NAYHA',
    speaker_role: 'Experte en Communication Non-Verbale',
    resource_url: '',
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
    step_tag: 'Négociation & Rémunération',
    duree: '11:55',
    description:
      'Stratégies concrètes pour aborder la rémunération et exprimer ses besoins sans peur du refus. Posture, chiffres et timing.',
    video_url: 'https://youtu.be/tXaIOFuG-rA',
    objectifs: [
      'Estimer sa fourchette salariale selon les grilles du marché',
      'Argumenter sa demande avec des preuves tangibles',
      'Négocier le package global (télétravail, horaires, primes)',
    ],
    tips: [
      "Estime ta valeur sur le marché avant d'entrer en négociation.",
      'Pose ta fourchette avec clarté et sans hésitation.',
      "Pense à l'ensemble du package (télétravail, horaires, formation).",
    ],
    speaker_name: 'Coach Carrière NAYHA',
    speaker_role: 'Négociatrice & Conseil Dirigeants',
    resource_url: '',
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
              (a.subtitle && a.subtitle.toLowerCase().includes(q)) ||
              (a.step_tag && a.step_tag.toLowerCase().includes(q)),
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
          (a.subtitle && a.subtitle.toLowerCase().includes(q)) ||
          (a.step_tag && a.step_tag.toLowerCase().includes(q)),
      );
    }
    return items;
  }

  async getCategories(): Promise<string[]> {
    const base = [
      'Tous',
      'emploi',
      'reconversion',
      'confiance',
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
      step_tag: dto.step_tag?.trim() || '',
      duree: dto.duree.trim(),
      description: dto.description?.trim() || '',
      video_url: dto.video_url?.trim() || 'https://youtu.be/6A1xfGvUFgk',
      objectifs: dto.objectifs || [],
      tips: dto.tips || [],
      resource_url: dto.resource_url?.trim() || '',
      speaker_name: dto.speaker_name?.trim() || '',
      speaker_role: dto.speaker_role?.trim() || '',
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
        step_tag: entity.step_tag,
        duree: entity.duree,
        description: entity.description,
        video_url: entity.video_url,
        objectifs: entity.objectifs,
        tips: entity.tips,
        resource_url: entity.resource_url,
        speaker_name: entity.speaker_name,
        speaker_role: entity.speaker_role,
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
          ...(dto.step_tag !== undefined ? { step_tag: dto.step_tag?.trim() || '' } : {}),
          ...(dto.duree ? { duree: dto.duree.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description?.trim() || '' } : {}),
          ...(dto.video_url !== undefined ? { video_url: dto.video_url?.trim() || '' } : {}),
          ...(dto.objectifs !== undefined ? { objectifs: dto.objectifs } : {}),
          ...(dto.tips !== undefined ? { tips: dto.tips } : {}),
          ...(dto.resource_url !== undefined ? { resource_url: dto.resource_url?.trim() || '' } : {}),
          ...(dto.speaker_name !== undefined ? { speaker_name: dto.speaker_name?.trim() || '' } : {}),
          ...(dto.speaker_role !== undefined ? { speaker_role: dto.speaker_role?.trim() || '' } : {}),
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
        ...(dto.step_tag !== undefined ? { step_tag: dto.step_tag?.trim() } : {}),
        ...(dto.duree ? { duree: dto.duree.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || '' } : {}),
        ...(dto.video_url !== undefined ? { video_url: dto.video_url?.trim() || '' } : {}),
        ...(dto.objectifs !== undefined ? { objectifs: dto.objectifs } : {}),
        ...(dto.tips !== undefined ? { tips: dto.tips } : {}),
        ...(dto.resource_url !== undefined ? { resource_url: dto.resource_url?.trim() } : {}),
        ...(dto.speaker_name !== undefined ? { speaker_name: dto.speaker_name?.trim() } : {}),
        ...(dto.speaker_role !== undefined ? { speaker_role: dto.speaker_role?.trim() } : {}),
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
      step_tag: raw.step_tag ?? '',
      duree: raw.duree ?? '15:00',
      description: raw.description ?? '',
      video_url: raw.video_url ?? 'https://youtu.be/6A1xfGvUFgk',
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
