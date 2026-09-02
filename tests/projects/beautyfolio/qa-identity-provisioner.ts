// BeautyFolio-specific guarded QA identity provisioner. The ONE place that
// may compose the generic provider's destructive primitives
// (insertRow/ensureAuthUser) with BeautyFolio's own schema (user_roles,
// beautician_profiles) to create the three persistent QA fixture
// identities. Idempotent throughout — safe to re-run.
//
// SAFETY: assertDestructiveQaAllowed() is called exactly once, before any
// write, and its rejection aborts the whole run before touching anything.
// Never called from application code, never from tests/e2e/** (browser
// context) — Node-only, invoked via the qa:provision-identities script.
import {
  assertDestructiveQaAllowed,
  type DestructiveQaRequest,
} from "../../helpers/safety-gate.ts";
import type { QaProvider } from "../../helpers/providers/provider.ts";
import { beautyfolioProject } from "./project.ts";

export interface ProvisionedIdentity {
  role: "admin" | "professionalA" | "professionalB";
  authUserId: string;
  authUserCreated: boolean;
  profileId: string;
  userRoleEnsured: "already-present" | "created";
  beauticianProfileId: string | null;
  beauticianProfileSlug: string | null;
  beauticianProfileCreated: boolean | null;
}

export interface ProvisionQaIdentitiesResult {
  admin: ProvisionedIdentity;
  professionalA: ProvisionedIdentity;
  professionalB: ProvisionedIdentity;
}

export interface ProvisionQaIdentitiesConfig {
  allowWrites: boolean;
  configuredEnvironment: string | null;
  baseUrl: string | null;
  backendRef: string | null;
  expectedQaBackendRef: string | null;
  recordPrefix: string | null;
  profileSlugPrefix: string | null;
  adminEmail: string;
  adminPassword: string;
  proAEmail: string;
  proAPassword: string;
  proBEmail: string;
  proBPassword: string;
}

async function ensureProfileRow(provider: QaProvider, authUserId: string): Promise<{ id: string }> {
  // handle_new_user() (see the bootstrap SQL) inserts this synchronously
  // within the same transaction as auth user creation, so it should be
  // immediately queryable — a short retry loop guards against any
  // replication lag rather than assuming zero latency.
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await provider.getRow("profiles", { auth_user_id: authUserId });
    if (row) return { id: row["id"] as string };
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(
    `profiles row for auth user ${authUserId} did not appear — handle_new_user() may not have fired`,
  );
}

async function ensureAdminRole(
  provider: QaProvider,
  authUserId: string,
): Promise<"already-present" | "created"> {
  const existing = await provider.getRow("user_roles", { user_id: authUserId, role: "admin" });
  if (existing) return "already-present";
  await provider.insertRow("user_roles", { user_id: authUserId, role: "admin" });
  return "created";
}

async function ensureBeautician(
  provider: QaProvider,
  profileId: string,
  slug: string,
  displayName: string,
): Promise<{ id: string; created: boolean }> {
  const existing = await provider.getRow("beautician_profiles", { profile_id: profileId });
  if (existing) return { id: existing["id"] as string, created: false };

  const conflictingSlug = await provider.getRow("beautician_profiles", { slug });
  if (conflictingSlug) {
    throw new Error(
      `Refusing to create beautician_profiles: slug "${slug}" is already used by a different profile_id.`,
    );
  }

  const created = await provider.insertRow("beautician_profiles", {
    profile_id: profileId,
    slug,
    display_name: displayName,
    status: "draft",
  });
  return { id: created["id"] as string, created: true };
}

export async function provisionQaIdentities(
  provider: QaProvider,
  config: ProvisionQaIdentitiesConfig,
): Promise<ProvisionQaIdentitiesResult> {
  const gateRequest: DestructiveQaRequest = {
    allowWrites: config.allowWrites,
    configuredEnvironment: config.configuredEnvironment,
    baseUrl: config.baseUrl,
    backendRef: config.backendRef,
    expectedQaBackendRef: config.expectedQaBackendRef,
    protectedBackendRefs: beautyfolioProject.protectedBackendRefs,
    recordPrefix: config.recordPrefix,
    profileSlugPrefix: config.profileSlugPrefix,
  };
  // Throws (aborts everything below) if any condition fails.
  assertDestructiveQaAllowed(gateRequest);

  if (
    !config.adminEmail.startsWith("qa-") ||
    !config.proAEmail.startsWith("qa-") ||
    !config.proBEmail.startsWith("qa-")
  ) {
    throw new Error("Refusing to provision: all QA fixture emails must start with 'qa-'.");
  }
  for (const slug of [
    beautyfolioProject.qaIdentities.professionalA.slug,
    beautyfolioProject.qaIdentities.professionalB.slug,
  ]) {
    if (!slug.startsWith(config.profileSlugPrefix ?? "")) {
      throw new Error(
        `Refusing to provision: slug "${slug}" does not match QA_PROFILE_SLUG_PREFIX.`,
      );
    }
  }

  const adminAuth = await provider.ensureAuthUser({
    email: config.adminEmail,
    password: config.adminPassword,
    emailConfirm: true,
    userMetadata: { qa_fixture: true, qa_project: "beautyfolio", qa_role: "admin" },
  });
  const adminProfile = await ensureProfileRow(provider, adminAuth.id);
  const adminRole = await ensureAdminRole(provider, adminAuth.id);

  const proAAuth = await provider.ensureAuthUser({
    email: config.proAEmail,
    password: config.proAPassword,
    emailConfirm: true,
    userMetadata: { qa_fixture: true, qa_project: "beautyfolio", qa_role: "professionalA" },
  });
  const proAProfile = await ensureProfileRow(provider, proAAuth.id);
  const proABp = await ensureBeautician(
    provider,
    proAProfile.id,
    beautyfolioProject.qaIdentities.professionalA.slug,
    beautyfolioProject.qaIdentities.professionalA.displayName,
  );

  const proBAuth = await provider.ensureAuthUser({
    email: config.proBEmail,
    password: config.proBPassword,
    emailConfirm: true,
    userMetadata: { qa_fixture: true, qa_project: "beautyfolio", qa_role: "professionalB" },
  });
  const proBProfile = await ensureProfileRow(provider, proBAuth.id);
  const proBBp = await ensureBeautician(
    provider,
    proBProfile.id,
    beautyfolioProject.qaIdentities.professionalB.slug,
    beautyfolioProject.qaIdentities.professionalB.displayName,
  );

  return {
    admin: {
      role: "admin",
      authUserId: adminAuth.id,
      authUserCreated: adminAuth.created,
      profileId: adminProfile.id,
      userRoleEnsured: adminRole,
      beauticianProfileId: null,
      beauticianProfileSlug: null,
      beauticianProfileCreated: null,
    },
    professionalA: {
      role: "professionalA",
      authUserId: proAAuth.id,
      authUserCreated: proAAuth.created,
      profileId: proAProfile.id,
      userRoleEnsured: "already-present", // beautician role is auto-created by handle_new_user()
      beauticianProfileId: proABp.id,
      beauticianProfileSlug: beautyfolioProject.qaIdentities.professionalA.slug,
      beauticianProfileCreated: proABp.created,
    },
    professionalB: {
      role: "professionalB",
      authUserId: proBAuth.id,
      authUserCreated: proBAuth.created,
      profileId: proBProfile.id,
      userRoleEnsured: "already-present",
      beauticianProfileId: proBBp.id,
      beauticianProfileSlug: beautyfolioProject.qaIdentities.professionalB.slug,
      beauticianProfileCreated: proBBp.created,
    },
  };
}
