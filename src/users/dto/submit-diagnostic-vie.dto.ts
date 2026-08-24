import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SubmitDiagnosticVieDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  nom?: string;

  @IsString()
  @IsNotEmpty()
  age: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  situation: string;

  @IsArray()
  @IsString({ each: true })
  roles: string[];

  @IsString()
  hiddenSuccess: string;

  @IsString()
  naturalStrength: string;

  @IsString()
  overcomeChallenge: string;

  @IsString()
  vision: string;
}
