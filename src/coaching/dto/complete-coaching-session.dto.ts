import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CompleteCoachingSessionDto {
  @IsOptional()
  @IsString()
  commitment?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  confidenceAfter?: number;
}
