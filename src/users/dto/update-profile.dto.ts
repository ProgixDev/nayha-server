import { IsBoolean, IsOptional, IsString } from 'class-validator';

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
}
