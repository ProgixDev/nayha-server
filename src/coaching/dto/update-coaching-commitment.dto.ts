import { IsIn } from 'class-validator';

export class UpdateCoachingCommitmentDto {
  @IsIn(['done', 'not_done'])
  status: 'done' | 'not_done';
}
