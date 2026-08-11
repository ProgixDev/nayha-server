import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

export interface PortraitDeForce {
  signature: string;
  portrait: string;
  savoirFaire: string[];
  savoirEtre: string[];
  message: string;
}

@Injectable()
export class AiService {
  private supabase: SupabaseClient;
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async generatePortrait(userId: string): Promise<PortraitDeForce> {
    // 1. Fetch diagnostic data
    const { data: profile, error } = await this.supabase
      .from('user_profiles')
      .select('diagnostic_vie_data, diagnostic_pro_data')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      throw new NotFoundException('Profile not found');
    }

    const { diagnostic_vie_data: vie, diagnostic_pro_data: pro } = profile;

    if (!vie || !pro) {
      throw new NotFoundException('Diagnostics not completed');
    }

    // 2. Generate portrait via OpenAI
    const prompt = this.buildPortraitPrompt(vie, pro);

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Tu es une conseillère en insertion professionnelle bienveillante et experte. Tu transformes les expériences de vie et les compétences acquises (y compris hors emploi) en atouts professionnels valorisants.

Tu dois répondre UNIQUEMENT en JSON valide avec cette structure exacte :
{
  "signature": "titre professionnel valorisant en 2-4 mots (ex: Manager du quotidien, Coordinatrice de l'humain)",
  "portrait": "texte narratif de 2 paragraphes qui reformule l'expérience de la personne en parcours professionnel valorisant. Tutoie la personne. Ne minimise jamais. Transforme chaque expérience de vie en compétence professionnelle.",
  "savoirFaire": ["liste de 7 à 10 compétences professionnelles concrètes extraites des expériences décrites"],
  "savoirEtre": ["liste de 5 à 8 qualités humaines / soft skills identifiées"],
  "message": "message motivationnel personnalisé de 2-3 phrases. Bienveillant, pas condescendant. Tutoie."
}`,
        },
        { role: 'user', content: prompt },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI returned empty response');
    }

    const portrait: PortraitDeForce = JSON.parse(content);

    // 3. Save to profile
    await this.supabase
      .from('user_profiles')
      .update({ portrait_data: portrait })
      .eq('id', userId);

    return portrait;
  }

  async getPortrait(userId: string): Promise<PortraitDeForce | null> {
    const { data, error } = await this.supabase
      .from('user_profiles')
      .select('portrait_data')
      .eq('id', userId)
      .single();

    if (error || !data) throw new NotFoundException('Profile not found');
    return data.portrait_data;
  }

  private buildPortraitPrompt(
    vie: Record<string, any>,
    pro: Record<string, any>,
  ): string {
    return `Voici les informations recueillies lors du diagnostic :

--- DIAGNOSTIC VIE ---
Prénom : ${vie.name}
Âge : ${vie.age}
Ville : ${vie.city}
Situation actuelle : ${vie.situation}
Rôles tenus au quotidien : ${Array.isArray(vie.roles) ? vie.roles.join(', ') : vie.roles}
Réussite dont elle est fière (même cachée) : ${vie.hiddenSuccess}
Force naturelle : ${vie.naturalStrength}
Défi surmonté : ${vie.overcomeChallenge}
Vision pour l'avenir : ${vie.vision}

--- DIAGNOSTIC PROFESSIONNEL ---
Niveau d'études : ${pro.educationLevel}
Domaines d'études : ${Array.isArray(pro.educationDomains) ? pro.educationDomains.join(', ') : pro.educationDomains}
Expériences professionnelles : ${pro.workExperiences}
Ce qui donne de l'énergie : ${pro.energySources}
Ce qui est inacceptable au travail : ${pro.dealbreakers}
Conditions de travail idéales : ${Array.isArray(pro.idealConditions) ? pro.idealConditions.join(', ') : pro.idealConditions}
Journée idéale : ${pro.idealDayVision}

Génère le Portrait de Force de cette personne.`;
  }
}
