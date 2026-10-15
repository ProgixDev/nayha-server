import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** A reply in a ticket: text, a screenshot, or both. */
export class SendMessageDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  attachmentPath?: string;
}
