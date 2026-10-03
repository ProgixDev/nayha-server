import { IsObject } from 'class-validator';

export class UpdatePermissionsDto {
  @IsObject()
  permissions: Record<string, boolean>;
}
