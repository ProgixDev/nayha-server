import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAdminUserDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  role: string;

  @IsOptional()
  @IsString()
  avatar_url?: string | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
