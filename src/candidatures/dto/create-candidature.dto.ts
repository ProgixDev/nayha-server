import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateCandidatureDto {
  @IsString()
  @IsNotEmpty()
  entreprise: string;

  @IsString()
  @IsNotEmpty()
  poste: string;

  @IsOptional()
  @IsString()
  offre_text?: string;

  @IsOptional()
  @IsNumber()
  delai_reponse_annonce?: number;
}
