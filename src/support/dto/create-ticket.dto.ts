import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export const SUPPORT_TOPICS = [
  'abonnement',
  'documents',
  'parcours',
  'bug',
  'autre',
] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number];

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateTicketDto {
  @IsIn(SUPPORT_TOPICS)
  topic: SupportTopic;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  attachmentPath?: string;

  /** App version, platform… added by the app, never typed by the user. */
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}
