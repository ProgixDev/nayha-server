import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsBoolean()
  diagnostic_vie_completed?: boolean;

  @IsOptional()
  @IsBoolean()
  diagnostic_pro_completed?: boolean;

  @IsOptional()
  @IsBoolean()
  rgpd_accepted?: boolean;

  @IsOptional()
  @IsBoolean()
  metier_selected?: boolean;

  @IsOptional()
  @IsBoolean()
  has_paid?: boolean;

  @IsOptional()
  @IsString()
  selected_metier_id?: string;

  @IsOptional()
  @IsString()
  selected_metier_titre?: string;

  @IsOptional()
  @IsObject()
  cv_base?: Record<string, any>;

  @IsOptional()
  @IsObject()
  linkedin_profil?: Record<string, any>;

  @IsOptional()
  @IsObject()
  retour_emploi_journey?: Record<string, any>;

  @IsOptional()
  @IsString()
  parcours_type?: string;

  @IsOptional()
  @IsBoolean()
  parcours_analyse_completed?: boolean;

  @IsOptional()
  @IsBoolean()
  parcours_first_candidature_completed?: boolean;

  @IsOptional()
  @IsBoolean()
  retour_emploi_evaluation_completed?: boolean;

  @IsOptional()
  @IsArray()
  ateliers_emploi_watched?: string[];

  @IsOptional()
  @IsInt()
  actions_semaine_count?: number;

  @IsOptional()
  @IsString()
  subscription_tier?: string;

  @IsOptional()
  @IsString()
  subscription_status?: string;
}
