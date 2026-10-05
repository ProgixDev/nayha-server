import { IsObject, IsOptional } from 'class-validator';

/** A section is sent as the complete current step state by the mobile client. */
export class UpdateCreationJourneyDto {
  @IsOptional()
  @IsObject()
  situation?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  activite?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  marche?: Record<string, unknown>;
}
