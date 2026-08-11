import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsBoolean()
  diagnostic_vie_completed?: boolean;

  @IsOptional()
  @IsBoolean()
  diagnostic_pro_completed?: boolean;

  @IsOptional()
  @IsBoolean()
  rgpd_accepted?: boolean;

  @IsOptional()
  @IsBoolean()
  reports_completed?: boolean;
}
