import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateCheminPriorityDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  prerequisId: string;
}
