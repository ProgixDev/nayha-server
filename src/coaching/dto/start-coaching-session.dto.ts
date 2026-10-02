import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class StartCoachingSessionDto {
  @IsOptional()
  @IsString()
  triggerContext?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  confidenceBefore?: number;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  initialMessage?: string;
}
