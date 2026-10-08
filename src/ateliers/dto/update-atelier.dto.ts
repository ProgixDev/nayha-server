import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateAtelierDto {
  @IsString()
  @IsOptional()
  titre?: string;

  @IsString()
  @IsOptional()
  subtitle?: string;

  @IsString()
  @IsOptional()
  palier?: string;

  @IsString()
  @IsOptional()
  palier_label?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  step_tag?: string;

  @IsString()
  @IsOptional()
  duree?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  video_url?: string;

  @IsArray()
  @IsOptional()
  objectifs?: string[];

  @IsArray()
  @IsOptional()
  tips?: string[];

  @IsString()
  @IsOptional()
  resource_url?: string;

  @IsString()
  @IsOptional()
  speaker_name?: string;

  @IsString()
  @IsOptional()
  speaker_role?: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsString()
  @IsOptional()
  accent_color?: string;

  @IsNumber()
  @IsOptional()
  order?: number;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
