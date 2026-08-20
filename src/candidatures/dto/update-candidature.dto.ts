import { IsOptional, IsString } from 'class-validator';

export class UpdateCandidatureDto {
  @IsOptional()
  @IsString()
  statut?: 'envoyee' | 'en_attente' | 'entretien' | 'refusee' | 'acceptee';

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
}
