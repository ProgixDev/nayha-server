import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class SubmitDiagnosticProDto {
  @IsString()
  @IsNotEmpty()
  educationLevel: string;

  @IsArray()
  @IsString({ each: true })
  educationDomains: string[];

  @IsString()
  workExperiences: string;

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
