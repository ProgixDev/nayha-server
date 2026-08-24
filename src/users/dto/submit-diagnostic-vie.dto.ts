import {
  IsArray,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

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

  @IsOptional()
  @IsObject()
  rolePeriods?: Record<string, string>;

  @IsString()
  hiddenSuccess: string;

  @IsString()
  naturalStrength: string;

  @IsString()
  overcomeChallenge: string;

  @IsString()
  vision: string;
}
