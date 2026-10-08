import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UpdateAppLinkDto } from './dto/update-app-link.dto';

export interface AppLink {
  key: string;
  title: string;
  module: string;
  step: string;
  organisme: string;
  description: string;
  default_url: string;
  current_url: string;
  created_at?: string;
  updated_at: string;
}

const DEFAULT_APP_LINKS: AppLink[] = [
  {
    key: 'reconversion_financement_cpf',
    title: 'Mon Compte Formation (CPF)',
    module: 'Reconversion',
    step: 'Étape 5 · Financement',
    organisme: 'Caisse des Dépôts',
    description:
      'Portail officiel pour consulter son solde CPF et s\'inscrire à une formation certifiante.',
    default_url: 'https://www.moncompteformation.gouv.fr',
    current_url: 'https://www.moncompteformation.gouv.fr',
    updated_at: new Date().toISOString(),
  },
  {
    key: 'reconversion_financement_ptp',
    title: 'Projet de Transition Professionnelle (PTP CDI)',
    module: 'Reconversion',
    step: 'Étape 5 · Financement',
    organisme: 'Transitions Pro',
    description:
      'Prise en charge de formation longue et maintien de salaire pour salariés en CDI.',
    default_url: 'https://www.transitionspro.fr',
    current_url: 'https://www.transitionspro.fr',
    updated_at: new Date().toISOString(),
  },
  {
    key: 'reconversion_financement_ptp_cdd',
    title: 'Projet de Transition Professionnelle (PTP CDD)',
    module: 'Reconversion',
    step: 'Étape 5 · Financement',
    organisme: 'Transitions Pro',
    description:
      'Dispositif PTP accessible pendant ou à l\'issue d\'un contrat à durée déterminée.',
    default_url: 'https://www.transitionspro.fr',
    current_url: 'https://www.transitionspro.fr',
    updated_at: new Date().toISOString(),
  },
  {
    key: 'reconversion_financement_opco',
    title: 'Financement OPCO',
    module: 'Reconversion',
    step: 'Étape 5 · Financement',
    organisme: 'OPCO',
    description:
      'Financement des formations via l\'employeur dans le cadre du plan de développement des compétences.',
    default_url: 'https://www.opco.fr',
    current_url: 'https://www.opco.fr',
    updated_at: new Date().toISOString(),
  },
  {
    key: 'reconversion_financement_demission',
    title: 'Dispositif Démission-Reconversion',
    module: 'Reconversion',
    step: 'Étape 5 · Financement',
    organisme: 'France Travail + Transitions Pro',
    description:
      'Dispositif pour démissionner et bénéficier de l\'ARE pour un projet de reconversion réel et sérieux.',
    default_url: 'https://demission-reconversion.gouv.fr',
    current_url: 'https://demission-reconversion.gouv.fr',
    updated_at: new Date().toISOString(),
  },
  {
    key: 'reconversion_financement_aif',
    title: 'Aide Individuelle à la Formation (AIF)',
    module: 'Reconversion',
    step: 'Étape 5 · Financement',
    organisme: 'France Travail',
    description:
      'Prise en charge France Travail des frais pédagogiques de formation restants.',
    default_url:
      'https://www.francetravail.fr/candidat/en-formation/mes-aides-financieres/laide-individuelle-a-la-formatio.html',
    current_url:
      'https://www.francetravail.fr/candidat/en-formation/mes-aides-financieres/laide-individuelle-a-la-formatio.html',
    updated_at: new Date().toISOString(),
  },
  {
    key: 'reconversion_financement_aref',
    title: 'Allocation de Retour à l\'Emploi Formation (ARE-F)',
    module: 'Reconversion',
    step: 'Étape 5 · Financement',
    organisme: 'France Travail',
    description:
      'Maintien des allocations chômage sous forme d\'AREF pendant toute la formation validée au PPAE.',
    default_url:
      'https://www.francetravail.fr/candidat/en-formation/les-dispositifs/lallocation-daide-au-retour-a-le.html',
    current_url:
      'https://www.francetravail.fr/candidat/en-formation/les-dispositifs/lallocation-daide-au-retour-a-le.html',
    updated_at: new Date().toISOString(),
  },
  {
    key: 'reconversion_financement_poei',
    title: 'POEI / AFPR (Formation pré-embauche)',
    module: 'Reconversion',
    step: 'Étape 5 · Financement',
    organisme: 'France Travail + Employeur',
    description:
      'Préparation opérationnelle à l\'emploi individuelle financée avec promesse de recrutement.',
    default_url:
      'https://www.francetravail.fr/employeur/aides-aux-recrutements/les-aides-a-la-formation/la-preparation-operationnelle-a.html',
    current_url:
      'https://www.francetravail.fr/employeur/aides-aux-recrutements/les-aides-a-la-formation/la-preparation-operationnelle-a.html',
    updated_at: new Date().toISOString(),
  },
  {
    key: 'reconversion_financement_region',
    title: 'Financement Conseil Régional (Non indemnisés)',
    module: 'Reconversion',
    step: 'Étape 5 · Financement',
    organisme: 'Conseil Régional / ASP',
    description:
      'Prise en charge de formations conventionnées pour demandeurs d\'emploi non indemnisés.',
    default_url: 'https://www.service-public.fr/particuliers/vosdroits/F2401',
    current_url: 'https://www.service-public.fr/particuliers/vosdroits/F2401',
    updated_at: new Date().toISOString(),
  },
  {
    key: 'reconversion_financement_rfft',
    title: 'Rémunération de Formation (RFFT / R2F)',
    module: 'Reconversion',
    step: 'Étape 5 · Financement',
    organisme: 'Région / ASP',
    description:
      'Rémunération mensuelle versée aux stagiaires de la formation professionnelle conventionnée Région.',
    default_url:
      'https://www.service-public.gouv.fr/particuliers/vosdroits/F292?lang=fr',
    current_url:
      'https://www.service-public.gouv.fr/particuliers/vosdroits/F292?lang=fr',
    updated_at: new Date().toISOString(),
  },
  {
    key: 'reconversion_financement_agefice',
    title: 'AGEFICE (Commerce & Non réglementé)',
    module: 'Reconversion',
    step: 'Étape 5 · Financement',
    organisme: 'AGEFICE',
    description:
      'Fonds d\'assurance formation pour les commerçants et dirigeants non salariés.',
    default_url: 'https://agefice.info/',
    current_url: 'https://agefice.info/',
    updated_at: new Date().toISOString(),
  },
  {
    key: 'reconversion_financement_fifpl',
    title: 'FIF-PL (Professions Libérales)',
    module: 'Reconversion',
    step: 'Étape 5 · Financement',
    organisme: 'FIF-PL',
    description:
      'Fonds d\'assurance formation pour les professions libérales et indépendants CIPAV.',
    default_url: 'https://www.fifpl.fr',
    current_url: 'https://www.fifpl.fr',
    updated_at: new Date().toISOString(),
  },
  {
    key: 'reconversion_financement_fafcea',
    title: 'FAFCEA (Artisans)',
    module: 'Reconversion',
    step: 'Étape 5 · Financement',
    organisme: 'FAFCEA',
    description:
      'Fonds d\'assurance formation des chefs d\'entreprises artisanales.',
    default_url: 'https://www.fafcea.com',
    current_url: 'https://www.fafcea.com',
    updated_at: new Date().toISOString(),
  },
  {
    key: 'reconversion_financement_faf_generic',
    title: 'FAF (Identification FAF Indépendants)',
    module: 'Reconversion',
    step: 'Étape 5 · Financement',
    organisme: 'Service-Public',
    description:
      'Guide officiel pour identifier son FAF selon son code d\'activité.',
    default_url:
      'https://www.service-public.fr/professionnels-entreprises/vosdroits/F31148',
    current_url:
      'https://www.service-public.fr/professionnels-entreprises/vosdroits/F31148',
    updated_at: new Date().toISOString(),
  },
  {
    key: 'reconversion_financement_public_cfp',
    title: 'Congé de Formation Professionnelle (CFP Public)',
    module: 'Reconversion',
    step: 'Étape 5 · Financement',
    organisme: 'Administration / CNFPT / ANFH',
    description:
      'Congé de formation avec maintien partiel de traitement pour agents publics.',
    default_url: 'https://www.service-public.fr/particuliers/vosdroits/F14018',
    current_url: 'https://www.service-public.fr/particuliers/vosdroits/F14018',
    updated_at: new Date().toISOString(),
  },
  {
    key: 'reconversion_financement_public_plan',
    title: 'Plan de formation Fonction Publique',
    module: 'Reconversion',
    step: 'Étape 5 · Financement',
    organisme: 'Administration employeur',
    description:
      'Prise en charge de formation continue dans le cadre du plan annuel d\'administration.',
    default_url: 'https://www.service-public.fr/particuliers/vosdroits/F3019',
    current_url: 'https://www.service-public.fr/particuliers/vosdroits/F3019',
    updated_at: new Date().toISOString(),
  },
  {
    key: 'reconversion_financement_alternance',
    title: 'Contrat d\'Alternance / Apprentissage',
    module: 'Reconversion',
    step: 'Étape 5 · Financement',
    organisme: 'Ministère du Travail',
    description:
      'Dispositif de formation gratuite rémunérée en entreprise (apprentissage / professionnalisation).',
    default_url: 'https://www.service-public.fr/particuliers/vosdroits/F2918',
    current_url: 'https://www.service-public.fr/particuliers/vosdroits/F2918',
    updated_at: new Date().toISOString(),
  },
  {
    key: 'reconversion_immersion_facile',
    title: 'Immersion Facilitée (PMSMP)',
    module: 'Reconversion',
    step: 'Étape 3 · Immersion',
    organisme: 'Beta.gouv / France Travail',
    description:
      'Plateforme nationale pour conventionner une période de stage d\'immersion professionnelle en entreprise.',
    default_url: 'https://immersion-facile.beta.gouv.fr/',
    current_url: 'https://immersion-facile.beta.gouv.fr/',
    updated_at: new Date().toISOString(),
  },
  {
    key: 'reconversion_cep',
    title: 'Mon Conseil en Évolution Professionnelle',
    module: 'Reconversion',
    step: 'Général',
    organisme: 'Mon CEP',
    description:
      'Service gratuit d\'accompagnement et d\'orientation professionnelle.',
    default_url: 'https://mon-cep.org',
    current_url: 'https://mon-cep.org',
    updated_at: new Date().toISOString(),
  },
  {
    key: 'creation_formalites_entreprises',
    title: 'Guichet Unique Formalités Entreprises',
    module: 'Création d\'activité',
    step: 'Étape 6 · Démarches',
    organisme: 'INPI',
    description:
      'Guichet unique obligatoire pour l\'immatriculation de toute entreprise en France.',
    default_url: 'https://formalites.entreprises.gouv.fr',
    current_url: 'https://formalites.entreprises.gouv.fr',
    updated_at: new Date().toISOString(),
  },
  {
    key: 'creation_autoentrepreneur_urssaf',
    title: 'Portail Auto-Entrepreneur URSSAF',
    module: 'Création d\'activité',
    step: 'Étape 6 · Démarches',
    organisme: 'URSSAF',
    description:
      'Portail officiel de gestion et de déclaration du chiffre d\'affaires micro-entrepreneur.',
    default_url: 'https://www.autoentrepreneur.urssaf.fr',
    current_url: 'https://www.autoentrepreneur.urssaf.fr',
    updated_at: new Date().toISOString(),
  },
];

@Injectable()
export class AppLinksService {
  private readonly logger = new Logger(AppLinksService.name);
  private supabase: SupabaseClient;
  private inMemoryLinks: Map<string, AppLink> = new Map();

  constructor(private configService: ConfigService) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    // Initialize in-memory cache with defaults
    DEFAULT_APP_LINKS.forEach((link) => {
      this.inMemoryLinks.set(link.key, { ...link });
    });
  }

  /**
   * Returns key-value pairs of all active links for the mobile client.
   * Endpoint: GET /config/links
   */
  async getPublicLinks(): Promise<{ data: Record<string, string> }> {
    const all = await this.getAllLinks();
    const map: Record<string, string> = {};
    for (const item of all) {
      map[item.key] = item.current_url || item.default_url;
    }
    return { data: map };
  }

  /**
   * Returns all links with full metadata for the Admin Dashboard.
   * Endpoint: GET /admin-settings/links
   */
  async getAdminLinks(filter?: {
    module?: string;
    step?: string;
    search?: string;
  }): Promise<AppLink[]> {
    let list = await this.getAllLinks();

    if (filter?.module && filter.module !== 'tous') {
      const mod = filter.module.toLowerCase();
      list = list.filter((item) => item.module.toLowerCase() === mod);
    }

    if (filter?.step && filter.step !== 'tous') {
      const step = filter.step.toLowerCase();
      list = list.filter((item) => item.step.toLowerCase() === step);
    }

    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.key.toLowerCase().includes(q) ||
          item.organisme.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.current_url.toLowerCase().includes(q),
      );
    }

    return list;
  }

  /**
   * Gets available filter categories for admin UI.
   */
  async getCategories() {
    const list = await this.getAllLinks();
    const modules = Array.from(new Set(list.map((i) => i.module)));
    const steps = Array.from(new Set(list.map((i) => i.step).filter(Boolean)));
    const organismes = Array.from(new Set(list.map((i) => i.organisme).filter(Boolean)));

    return {
      modules,
      steps,
      organismes,
      total: list.length,
    };
  }

  /**
   * Updates a link's URL and metadata.
   */
  async updateLink(key: string, dto: UpdateAppLinkDto): Promise<AppLink> {
    const newUrl = (dto.url || dto.current_url || '').trim();
    if (!newUrl) {
      throw new NotFoundException('Une URL valide est requise.');
    }

    try {
      const { data, error } = await this.supabase
        .from('app_links')
        .update({
          current_url: newUrl,
          ...(dto.title ? { title: dto.title } : {}),
          ...(dto.description ? { description: dto.description } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('key', key)
        .select()
        .single();

      if (error) {
        this.logger.warn(`Supabase update error for link ${key}: ${error.message}`);
      } else if (data) {
        this.inMemoryLinks.set(key, data as AppLink);
        return data as AppLink;
      }
    } catch (e) {
      this.logger.error(`Failed to update link in Supabase: ${e}`);
    }

    // Fallback: update in-memory
    const existing = this.inMemoryLinks.get(key);
    if (!existing) {
      throw new NotFoundException(`Lien introuvable pour la clé: ${key}`);
    }

    const updated: AppLink = {
      ...existing,
      current_url: newUrl,
      title: dto.title || existing.title,
      description: dto.description || existing.description,
      updated_at: new Date().toISOString(),
    };

    this.inMemoryLinks.set(key, updated);
    return updated;
  }

  /**
   * Resets a link to its default URL.
   */
  async resetLink(key: string): Promise<AppLink> {
    const existing = this.inMemoryLinks.get(key) || (await this.getLinkByKey(key));
    if (!existing) {
      throw new NotFoundException(`Lien introuvable pour la clé: ${key}`);
    }

    return this.updateLink(key, { url: existing.default_url });
  }

  /**
   * Fetches all links from Supabase with graceful in-memory fallback.
   */
  private async getAllLinks(): Promise<AppLink[]> {
    try {
      const { data, error } = await this.supabase
        .from('app_links')
        .select('*')
        .order('module', { ascending: true })
        .order('step', { ascending: true });

      if (error) {
        this.logger.warn(`Supabase select app_links error: ${error.message}`);
        return Array.from(this.inMemoryLinks.values());
      }

      if (data && data.length > 0) {
        // Merge Supabase data into memory
        data.forEach((item: AppLink) => {
          this.inMemoryLinks.set(item.key, item);
        });
        return data as AppLink[];
      }
    } catch (e) {
      this.logger.warn(`Could not reach Supabase app_links table: ${e}`);
    }

    return Array.from(this.inMemoryLinks.values());
  }

  private async getLinkByKey(key: string): Promise<AppLink | null> {
    try {
      const { data, error } = await this.supabase
        .from('app_links')
        .select('*')
        .eq('key', key)
        .single();

      if (!error && data) {
        return data as AppLink;
      }
    } catch (_) {}

    return this.inMemoryLinks.get(key) || null;
  }
}
