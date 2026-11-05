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

  @IsOptional()
  @IsObject()
  offre?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  statut?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  demarches?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  contacts?: Record<string, unknown>;

  /** Weekly follow-up once the journey is done; not a journey step. */
  @IsOptional()
  @IsObject()
  suivi?: Record<string, unknown>;
}
