import {
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateCandidatureDto {
  @IsString()
  @IsNotEmpty()
  entreprise: string;

  @IsString()
  @IsNotEmpty()
  poste: string;

  @IsOptional()
  @IsString()
  lien?: string;

  @IsOptional()
  @IsString()
  offre_text?: string;

  @IsOptional()
  @IsNumber()
  delai_reponse_annonce?: number;

  @IsOptional()
  @IsObject()
  cv_adapte?: Record<string, any>;

  @IsOptional()
  @IsString()
  lettre?: string;
}
