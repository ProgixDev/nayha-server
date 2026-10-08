import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class TrackAtelierViewDto {
  @IsString()
  @IsOptional()
  user_id?: string;

  @IsBoolean()
  @IsOptional()
  completed?: boolean;

  @IsNumber()
  @IsOptional()
  watch_seconds?: number;
}
