import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(600)
  contenu: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  auteur?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  initiale?: string;

  @IsOptional()
  @IsString()
  parent_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reply_to_name?: string;
}
