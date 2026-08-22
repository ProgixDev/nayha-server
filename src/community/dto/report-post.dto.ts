import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReportPostDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
