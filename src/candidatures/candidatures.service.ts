import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CreateCandidatureDto } from './dto/create-candidature.dto';
import { UpdateCandidatureDto } from './dto/update-candidature.dto';
import { CandidatureActionDto } from './dto/candidature-action.dto';

export interface CandidatureStats {
  totalEnvoyees: number;
  totalEntretiens: number;
  totalSansReponse: number;
  tauxReponse: number;
}

export interface Alerte {
  type: string;
  message: string;
  candidature_id?: string;
}

@Injectable()
export class CandidaturesService {
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
  }

  async list(userId: string) {
    const { data, error } = await this.supabase
      .from('candidatures')
      .select('*')
      .eq('user_id', userId)
      .order('date_envoi', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async create(userId: string, dto: CreateCandidatureDto) {
    const dateEnvoi = new Date();
    const prochaineRelance = new Date(
      dateEnvoi.getTime() + 7 * 24 * 60 * 60 * 1000,
    );
    const { data, error } = await this.supabase
      .from('candidatures')
      .insert({
        user_id: userId,
        entreprise: dto.entreprise,
        poste: dto.poste,
        lien: dto.lien ?? null,
        offre_text: dto.offre_text ?? null,
        delai_reponse_annonce: dto.delai_reponse_annonce ?? null,
        cv_adapte: dto.cv_adapte ?? null,
        lettre: dto.lettre ?? null,
        date_envoi: dateEnvoi.toISOString(),
        prochaine_relance: prochaineRelance.toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async update(userId: string, id: string, dto: UpdateCandidatureDto) {
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (dto.entreprise !== undefined) updates.entreprise = dto.entreprise;
    if (dto.poste !== undefined) updates.poste = dto.poste;
    if (dto.lien !== undefined) updates.lien = dto.lien;

    if (dto.statut !== undefined) {
      updates.statut = dto.statut;
      // When status changes to 'entretien', reset relance_proposee
      if (dto.statut === 'entretien') {
        updates.relance_proposee = false;
      }
    }
    if (dto.date_entretien !== undefined) {
      updates.date_entretien = dto.date_entretien;
    }
    if (dto.ressenti_entretien !== undefined) {
      updates.ressenti_entretien = dto.ressenti_entretien;
    }
    if (dto.issue_entretien !== undefined) {
      updates.issue_entretien = dto.issue_entretien;
    }
    if (dto.notes !== undefined) {
      updates.notes = dto.notes;
    }
    if (dto.cv_adapte !== undefined) {
      updates.cv_adapte = dto.cv_adapte;
    }
    if (dto.lettre !== undefined) {
      updates.lettre = dto.lettre;
    }

    const { data, error } = await this.supabase
      .from('candidatures')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new NotFoundException('Candidature not found');
    }

    return data;
  }

  async delete(userId: string, id: string) {
    const { error } = await this.supabase
      .from('candidatures')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      throw new NotFoundException('Candidature not found');
    }

    return { deleted: true };
  }

  async recordAction(userId: string, id: string, dto: CandidatureActionDto) {
    const { data: candidature, error: fetchError } = await this.supabase
      .from('candidatures')
      .select('id, statut')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !candidature) {
      throw new NotFoundException('Candidature not found');
    }

    const now = new Date();
    const updates: Record<string, any> = {
      updated_at: now.toISOString(),
    };
    let newStatus = candidature.statut;

    switch (dto.action) {
      case 'relance_effectuee':
        newStatus = 'envoyee';
        updates.statut = newStatus;
        updates.relance_envoyee = true;
        updates.relance_proposee = true;
        updates.date_derniere_relance = now.toISOString();
        updates.prochaine_relance = new Date(
          now.getTime() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString();
        break;
      case 'a_relancer':
        newStatus = 'a_relancer';
        updates.statut = newStatus;
        updates.relance_proposee = true;
        break;
      case 'entretien':
        newStatus = 'entretien';
        updates.statut = newStatus;
        updates.relance_proposee = false;
        break;
      case 'refusee':
        newStatus = 'refusee';
        updates.statut = newStatus;
        updates.relance_proposee = false;
        break;
    }

    const { data: updated, error: updateError } = await this.supabase
      .from('candidatures')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError || !updated) {
      throw new Error(updateError?.message ?? 'Could not update candidature');
    }

    const { error: actionError } = await this.supabase
      .from('candidature_actions')
      .insert({
        candidature_id: id,
        user_id: userId,
        action: dto.action,
        ancien_statut: candidature.statut,
        nouveau_statut: newStatus,
        note: dto.note ?? null,
      });

    if (actionError) throw new Error(actionError.message);
    return updated;
  }

  async exportData(userId: string, days: number) {
    const safeDays = days === 7 ? 7 : 30;
    const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
    const { data: candidatures, error: candidaturesError } = await this.supabase
      .from('candidatures')
      .select('*')
      .eq('user_id', userId)
      .gte('date_envoi', since.toISOString())
      .order('date_envoi', { ascending: false });

    if (candidaturesError) throw new Error(candidaturesError.message);
    const ids = (candidatures ?? []).map((c) => c.id);
    let actions: any[] = [];
    if (ids.length > 0) {
      const { data, error } = await this.supabase
        .from('candidature_actions')
        .select('*')
        .eq('user_id', userId)
        .in('candidature_id', ids)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      actions = data ?? [];
    }

    return {
      days: safeDays,
      since: since.toISOString(),
      candidatures,
      actions,
    };
  }

  async getLatestBilan(userId: string) {
    const { data, error } = await this.supabase
      .from('bilans_mensuels')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }

  async getStats(userId: string): Promise<CandidatureStats> {
    const { data, error } = await this.supabase
      .from('candidatures')
      .select('statut')
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }

    const all = data || [];
    const totalEnvoyees = all.length;
    const totalEntretiens = all.filter((c) => c.statut === 'entretien').length;
    const totalReponses = all.filter(
      (c) =>
        c.statut === 'entretien' ||
        c.statut === 'refusee' ||
        c.statut === 'acceptee',
    ).length;
    const totalSansReponse = all.filter(
      (c) =>
        c.statut === 'envoyee' ||
        c.statut === 'en_attente' ||
        c.statut === 'a_relancer',
    ).length;
    const tauxReponse =
      totalEnvoyees > 0 ? Math.round((totalReponses / totalEnvoyees) * 100) : 0;

    return {
      totalEnvoyees,
      totalEntretiens,
      totalSansReponse,
      tauxReponse,
    };
  }

  async getTriggers(userId: string): Promise<{ alertes: Alerte[] }> {
    const alertes: Alerte[] = [];
    const now = new Date();

    // Fetch all candidatures for the user
    const { data: candidatures, error } = await this.supabase
      .from('candidatures')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }

    const all = candidatures || [];

    // 1. relance7jours: candidatures envoyees > 7 days (or delai_reponse_annonce), not yet relance_proposee
    for (const c of all) {
      if (
        (c.statut === 'envoyee' || c.statut === 'a_relancer') &&
        !c.relance_proposee
      ) {
        const dateEnvoi = new Date(c.date_envoi);
        const delaiJours = c.delai_reponse_annonce || 7;
        const prochaineRelance = c.prochaine_relance
          ? new Date(c.prochaine_relance)
          : new Date(dateEnvoi.getTime() + delaiJours * 24 * 60 * 60 * 1000);
        const diffDays = Math.floor(
          (now.getTime() - dateEnvoi.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (now >= prochaineRelance) {
          alertes.push({
            type: 'relance7jours',
            message: `Ta candidature chez ${c.entreprise} (${c.poste}) date de ${diffDays} jours. C'est le bon moment pour relancer.`,
            candidature_id: c.id,
          });
        }
      }
    }

    // 2. inactivite14jours: no candidature updated in last 14 days
    if (all.length > 0) {
      const fourteenDaysAgo = new Date(
        now.getTime() - 14 * 24 * 60 * 60 * 1000,
      );
      const hasRecentActivity = all.some(
        (c) => new Date(c.updated_at) >= fourteenDaysAgo,
      );

      if (!hasRecentActivity) {
        alertes.push({
          type: 'inactivite14jours',
          message:
            "Cela fait plus de 14 jours sans activit\u00e9 sur tes candidatures. On s'y remet ?",
        });
      }
    }

    // 3. troisRefus: 3 or more recent refusals
    const refusees = all.filter((c) => c.statut === 'refusee');
    if (refusees.length >= 3) {
      alertes.push({
        type: 'troisRefus',
        message: `Tu as re\u00e7u ${refusees.length} refus r\u00e9cemment. On peut analyser ta strat\u00e9gie ensemble et ajuster ton approche.`,
      });
    }

    // 4. pasEntretien30jours: has candidatures in last 30 days but none with statut='entretien'
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentCandidatures = all.filter(
      (c) => new Date(c.date_envoi) >= thirtyDaysAgo,
    );

    if (recentCandidatures.length > 0) {
      const hasEntretien = recentCandidatures.some(
        (c) => c.statut === 'entretien',
      );

      if (!hasEntretien) {
        alertes.push({
          type: 'pasEntretien30jours',
          message:
            "Tu as envoy\u00e9 des candidatures ce mois-ci mais aucune n'a encore d\u00e9bouch\u00e9 sur un entretien. On peut travailler tes candidatures ensemble.",
        });
      }
    }

    // 5. lendemainEntretien: entretien date was yesterday (or today), no feedback yet
    for (const c of all) {
      if (
        c.statut === 'entretien' &&
        c.date_entretien &&
        !c.ressenti_entretien
      ) {
        const dateEntretien = new Date(c.date_entretien);
        const diffDays = Math.floor(
          (now.getTime() - dateEntretien.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (diffDays >= 0 && diffDays <= 2) {
          alertes.push({
            type: 'lendemainEntretien',
            message: `Comment s'est pass\u00e9 ton entretien chez ${c.entreprise} ? Dis-nous en un clic.`,
            candidature_id: c.id,
          });
        }
      }
    }

    return { alertes };
  }

  async getRelanceMessages(userId: string, candidatureId: string) {
    const { data, error } = await this.supabase
      .from('relance_messages')
      .select('*')
      .eq('user_id', userId)
      .eq('candidature_id', candidatureId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async saveBilan(
    userId: string,
    data: {
      mois: string;
      total_envoyees: number;
      total_entretiens: number;
      total_reponses: number;
      taux_reponse: number;
      analyse: string;
      strategie: string;
    },
  ) {
    const { data: bilan, error } = await this.supabase
      .from('bilans_mensuels')
      .insert({
        user_id: userId,
        ...data,
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return bilan;
  }
}
