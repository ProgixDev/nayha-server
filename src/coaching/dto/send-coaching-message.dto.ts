import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendCoachingMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  text: string;
}
