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
} as const;
