import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePostDto {
  @IsString()
  @MinLength(1)
  @MaxLength(600)
  contenu: string;

  @IsIn(['normal', 'victoire', 'question', 'temoignage'])
  type: string;
}
