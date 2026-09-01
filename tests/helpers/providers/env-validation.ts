// Generic, secret-safe configuration validation. Reports which required
// variable NAMES are missing — never a value. No caller of this module
// should ever need to print/log a credential to explain a config problem.
export interface EnvValidationResult {
  valid: boolean;
  missing: string[];
}

export function validateRequiredEnv(
  requiredNames: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): EnvValidationResult {
  const missing = requiredNames.filter((name) => !env[name]);
  return { valid: missing.length === 0, missing };
}

export const SUPABASE_PROVIDER_ENV_VARS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

export function validateSupabaseProviderEnv(
  env: NodeJS.ProcessEnv = process.env,
): EnvValidationResult {
  return validateRequiredEnv(SUPABASE_PROVIDER_ENV_VARS, env);
}
