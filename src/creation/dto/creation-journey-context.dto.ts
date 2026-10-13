import { IsObject, IsOptional } from 'class-validator';

/**
 * Latest answers of the earlier steps. The saved journey is used for any
 * section the app does not send.
 */
export class CreationJourneyContextDto {
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
}
