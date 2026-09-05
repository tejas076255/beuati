// Portfolio Completion Score — presentation-layer only. The ONE
// authoritative scoring algorithm lives in SQL
// (public.compute_portfolio_score, see the completion-score migration) —
// nothing here recomputes a single point. This module only labels,
// bands, and ranks the JSON breakdown that function already returns, for
// the professional dashboard's milestone text and next-best-action list.
export interface CompletionCriterion {
  id: string;
  label: string;
  earned: number;
  max: number;
}

export interface CompletionScoreBreakdown {
  total: number;
  criteria: CompletionCriterion[];
}

export interface MilestoneBand {
  min: number;
  max: number;
  label: string;
  message: string;
}

// Bands are inclusive [min, max]. Language is deliberately encouraging —
// never a quality/grading term. This is a completion measure, not a
// customer rating or professional-quality judgement.
export const MILESTONE_BANDS: MilestoneBand[] = [
  {
    min: 0,
    max: 29,
    label: "Just getting started",
    message: "Add your name, photo, and a short bio to get discovered.",
  },
  {
    min: 30,
    max: 49,
    label: "Building the basics",
    message: "You're a few details away from a stronger profile.",
  },
  {
    min: 50,
    max: 69,
    label: "Taking shape",
    message: "Add services or portfolio work to boost visibility.",
  },
  {
    min: 70,
    max: 84,
    label: "Almost complete",
    message: "You're close — a couple of quick additions and you're done.",
  },
  { min: 85, max: 99, label: "Nearly there", message: "Just a little more to reach 100%." },
  { min: 100, max: 100, label: "Complete", message: "Your portfolio is fully complete." },
];

const FIRST_MILESTONE_BAND = MILESTONE_BANDS[0]!;

export function getMilestone(score: number): MilestoneBand {
  return (
    MILESTONE_BANDS.find((band) => score >= band.min && score <= band.max) ?? FIRST_MILESTONE_BAND
  );
}

// Criteria whose underlying field(s) also gate public Readiness
// indexability (src/lib/seo-helpers.ts's required checks: name, title,
// bio >=80 chars, primary_city, active services). Used only as a
// next-best-action tie-break signal — this never merges the two systems,
// it just prioritizes an action that carries a second, SEO benefit when
// point-value ties would otherwise leave the order arbitrary.
const READINESS_REQUIRED_LINKED: ReadonlySet<string> = new Set([
  "identity",
  "bio",
  "location",
  "services",
]);

// Lower = less effort. A documented heuristic, not derived from any
// measurement: single-field text edits are fastest, a structured
// single-object edit (availability, highlights) is next, and creating a
// piece of multi-field content (a service, a gallery/before-after item,
// a service area, a FAQ) is the most effort. Used only as the final
// next-best-action tie-break.
const EFFORT_RANK: Record<string, number> = {
  identity: 1,
  photo: 1,
  bio: 1,
  location: 1,
  contact: 1,
  availability: 2,
  highlights: 2,
  services: 3,
  portfolio_work: 3,
  service_areas: 3,
  faqs: 3,
};

// Action label templates. `+<delta>` is prepended by the caller from the
// live breakdown — never hardcoded here, since the exact point gain
// depends on how much of the criterion is already earned.
const ACTION_LABELS: Record<string, string> = {
  identity: "Complete your name, title, and tagline",
  photo: "Add a profile photo",
  bio: "Write a bio (80+ characters)",
  location: "Add your city and locality",
  contact: "Add a phone or WhatsApp number",
  services: "Add another active service",
  portfolio_work: "Add gallery or before/after photos",
  availability: "Set your working hours",
  service_areas: "Add a service area",
  faqs: "Add another FAQ",
  highlights: "Add highlights and why-choose-you points",
};

export interface NextBestAction {
  criterionId: string;
  delta: number;
  label: string;
}

/**
 * Ranks every not-yet-full criterion by: (1) largest remaining point
 * gain, (2) Readiness-required-linked criteria first on a tie, (3)
 * lower-effort criteria first on a further tie. Pure sort/label over the
 * SQL function's own breakdown — never a point recalculation.
 */
export function rankNextBestActions(breakdown: CompletionScoreBreakdown): NextBestAction[] {
  return breakdown.criteria
    .filter((c) => c.earned < c.max)
    .map((c) => ({
      criterionId: c.id,
      delta: c.max - c.earned,
      label: ACTION_LABELS[c.id] ?? c.label,
    }))
    .sort((a, b) => {
      if (b.delta !== a.delta) return b.delta - a.delta;
      const aRequired = READINESS_REQUIRED_LINKED.has(a.criterionId) ? 0 : 1;
      const bRequired = READINESS_REQUIRED_LINKED.has(b.criterionId) ? 0 : 1;
      if (aRequired !== bRequired) return aRequired - bRequired;
      const aEffort = EFFORT_RANK[a.criterionId] ?? 99;
      const bEffort = EFFORT_RANK[b.criterionId] ?? 99;
      return aEffort - bEffort;
    });
}

export function formatActionText(action: NextBestAction): string {
  return `+${action.delta} ${action.label}`;
}
