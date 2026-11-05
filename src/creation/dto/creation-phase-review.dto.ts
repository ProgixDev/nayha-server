import { IsIn } from 'class-validator';
import { reviewPhases } from '../phase-review';

/** The journey phase whose end-of-phase review is asked for. */
export class CreationPhaseReviewDto {
  @IsIn(reviewPhases)
  phase!: (typeof reviewPhases)[number];
}
