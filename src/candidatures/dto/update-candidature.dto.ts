import { IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateCandidatureDto {
  @IsOptional()
  @IsString()
  entreprise?: string;

  @IsOptional()
  @IsString()
  poste?: string;

  @IsOptional()
  @IsString()
  lien?: string;

  @IsOptional()
  @IsString()
  statut?:
    | 'envoyee'
    | 'en_attente'
    | 'a_relancer'
    | 'entretien'
    | 'refusee'
    | 'acceptee';

  @IsOptional()
  @IsString()
  date_entretien?: string;

  @IsOptional()
  @IsString()
  ressenti_entretien?: 'bien' | 'mitige' | 'difficile';

  @IsOptional()
  @IsString()
  issue_entretien?: 'sans_suite' | 'en_attente' | 'proposition';

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  cv_adapte?: Record<string, any>;

  @IsOptional()
  @IsString()
  lettre?: string;
}
