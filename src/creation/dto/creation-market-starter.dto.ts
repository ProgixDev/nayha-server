import { IsObject, IsOptional } from 'class-validator';

/**
 * Latest unsaved answers from steps 1 and 2. The saved journey is used when
 * the app does not send them.
 */
export class CreationMarketStarterDto {
  @IsOptional()
  @IsObject()
  situation?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  activite?: Record<string, unknown>;
}
