import { IsObject, IsOptional } from 'class-validator';

/**
 * Section values are sanitised by the service before persistence. Keeping the
 * wire format partial lets the mobile app save a single user action without
 * overwriting the other step.
 */
export class UpdateReconversionJourneyDto {
  @IsOptional()
  @IsObject()
  chemin?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  formations?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  immersion?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  financement?: Record<string, unknown>;
}
