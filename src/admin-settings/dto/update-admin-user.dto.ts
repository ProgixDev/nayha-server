import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';

export class UpdateAdminUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  avatar_url?: string | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
