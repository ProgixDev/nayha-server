import { plainToInstance } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  SUPABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  SUPABASE_SERVICE_ROLE_KEY: string;

  @IsString()
  @IsNotEmpty()
  FT_CLIENT_ID: string;

  @IsString()
  @IsNotEmpty()
  FT_CLIENT_SECRET: string;

  @IsString()
  @IsNotEmpty()
  OPENAI_API_KEY: string;

  /** RevenueCat secret API key (v1). Payments stay off until it is set. */
  @IsOptional()
  @IsString()
  REVENUECAT_SECRET_KEY?: string;

  /** Value RevenueCat sends in the webhook Authorization header. */
  @IsOptional()
  @IsString()
  REVENUECAT_WEBHOOK_AUTH?: string;
}

export function validate(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validated;
}
