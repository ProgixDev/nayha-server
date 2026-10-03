import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateAtelierDto {
  @IsString()
  titre: string;

  @IsString()
  @IsOptional()
  subtitle?: string;

  @IsString()
  palier: string;

  @IsString()
  @IsOptional()
  palier_label?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  duree: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  video_url?: string;

  @IsArray()
  @IsOptional()
  tips?: string[];

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
