// BeautyFolio-specific project adapter — the only place project identity/
// routes/terminology should live. Generic QA infrastructure (tests/helpers,
// playwright.config.ts, vitest.config.ts) must not import BeautyFolio
// business logic directly; project specs import from here instead.
export const beautyfolioProject = {
  name: "beautyfolio",
  baseUrl: process.env["QA_BASE_URL"] ?? "http://localhost:8080",
  tenantTerm: "beautician",
  routes: {
    home: "/",
    // Known-published public portfolio used for non-destructive smoke
    // checks only — never mutated by these tests.
    samplePortfolio: "/portfolio/dharti-panchal",
    dashboard: "/dashboard",
    admin: "/admin",
    login: "/login",
  },
  // The current Lovable-managed Supabase backend — holds real BeautyFolio
  // professional data. Listed here (project config), not in generic safety
  // logic, so the generic destructive-QA gate stays project-agnostic while
  // this specific backend can never receive destructive QA regardless of
  // any other configuration (see tests/helpers/safety-gate.ts).
  protectedBackendRefs: ["ivbujlyilzmlublqzalu"],
  // Table/column BeautyFolio uses for the one trusted read this phase
  // performs — kept here, not in the generic Supabase adapter, so the
  // adapter stays free of BeautyFolio schema knowledge.
  sampleProfile: {
    table: "beautician_profiles",
    slug: "dharti-panchal",
    publishedColumn: "is_published",
  },
} as const;
