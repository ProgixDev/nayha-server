import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CompleteCoachingSessionDto {
  @IsString()
  @IsNotEmpty()
  commitment: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  confidenceAfter?: number;
}
