import { IsObject, IsOptional } from 'class-validator';

/**
 * Latest answers from steps 1 to 3. The saved journey is used for any
 * section the app does not send.
 */
export class CreationOfferStarterDto {
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
