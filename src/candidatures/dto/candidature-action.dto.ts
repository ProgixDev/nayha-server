import { IsIn, IsOptional, IsString } from 'class-validator';

export class CandidatureActionDto {
  @IsIn(['relance_effectuee', 'a_relancer', 'entretien', 'refusee'])
  action: 'relance_effectuee' | 'a_relancer' | 'entretien' | 'refusee';

  @IsOptional()
  @IsString()
  note?: string;
}
