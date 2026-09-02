// QA-1D Step 3B — the ONE explicit, controlled entrypoint that provisions
// the three persistent QA fixture identities. Run via:
//
//   npm run qa:provision-identities
//
// The persistent, git-ignored .env.test file must keep QA_ALLOW_WRITES=false
// always — this script accepts a SEPARATE, ephemeral override
// (QA_ALLOW_WRITES_OVERRIDE=true), scoped to this one process only, so a
// developer must deliberately opt in every time rather than ever flipping
// the persistent file to true. Never prints secret values (passwords,
// service-role key) — only presence/success and non-secret identifiers.
import { fileURLToPath } from "node:url";
import { createSupabaseProviderFromEnv } from "../../../helpers/providers/supabase-provider.ts";
import { provisionQaIdentities } from "../qa-identity-provisioner.ts";

try {
  process.loadEnvFile(fileURLToPath(new URL("../../../../.env.test", import.meta.url)));
} catch {
  // .env.test not present — required for this script, checked below.
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required .env.test variable: ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const provider = createSupabaseProviderFromEnv();
  if (!provider) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not configured in .env.test");
  }

  const allowWrites = process.env["QA_ALLOW_WRITES_OVERRIDE"] === "true";
  if (!allowWrites) {
    console.error(
      "Refusing to run: pass QA_ALLOW_WRITES_OVERRIDE=true for this one invocation " +
        "(e.g. `QA_ALLOW_WRITES_OVERRIDE=true npm run qa:provision-identities`). " +
        "The persistent .env.test QA_ALLOW_WRITES value is never changed by this script.",
    );
    process.exitCode = 1;
    return;
  }

  const identity = provider.identity();
  console.log(`Provider identity: ${identity.providerType} / backendRef=${identity.backendRef}`);

  const result = await provisionQaIdentities(provider, {
    allowWrites,
    configuredEnvironment: process.env["QA_ENVIRONMENT"] ?? null,
    baseUrl: process.env["QA_BASE_URL"] ?? null,
    backendRef: identity.backendRef,
    expectedQaBackendRef: process.env["QA_EXPECTED_PROJECT_REF"] ?? null,
    recordPrefix: process.env["QA_RECORD_PREFIX"] ?? null,
    profileSlugPrefix: process.env["QA_PROFILE_SLUG_PREFIX"] ?? null,
    adminEmail: requireEnv("QA_ADMIN_EMAIL"),
    adminPassword: requireEnv("QA_ADMIN_PASSWORD"),
    proAEmail: requireEnv("QA_PRO_A_EMAIL"),
    proAPassword: requireEnv("QA_PRO_A_PASSWORD"),
    proBEmail: requireEnv("QA_PRO_B_EMAIL"),
    proBPassword: requireEnv("QA_PRO_B_PASSWORD"),
  });

  // Non-secret summary only — no emails, no passwords, no tokens.
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("Provisioning failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
