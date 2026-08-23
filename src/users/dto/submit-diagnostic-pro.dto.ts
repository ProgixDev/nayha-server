import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SubmitDiagnosticProDto {
  @IsString()
  @IsNotEmpty()
  educationLevel: string;

  @IsArray()
  @IsString({ each: true })
  educationDomains: string[];

  @IsOptional()
  @IsBoolean()
  knowsTargetJob?: boolean;

  @IsOptional()
  @IsString()
  targetJob?: string;

  @IsOptional()
  @IsString()
  diplomas?: string;

  @IsString()
  workExperiences: string;

  @IsOptional()
  @IsBoolean()
  hasWorkExperience?: boolean;

  @IsOptional()
  @IsString()
  experienceYears?: string;

  @IsOptional()
  @IsString()
  stayInDomain?: string;

  @IsString()
  energySources: string;

  @IsString()
  dealbreakers: string;

  @IsArray()
  @IsString({ each: true })
  idealConditions: string[];

  @IsString()
  idealDayVision: string;
}
