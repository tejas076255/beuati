import { describe, expect, it } from "vitest";
import { STATUS_META, STATUS_ORDER, type LeadStatus } from "@/lib/lead-config";

// QA-1P — guards against the exact drift class discovered this phase: the
// platform-wide /admin/leads page once carried its own hardcoded 6-value
// status list that silently fell out of sync with the real `lead_status`
// enum after quoted/negotiation/completed were added. Both Admin surfaces
// (platform-wide and per-beautician) now derive their status vocabulary
// from STATUS_ORDER/STATUS_META here instead of a local list — this test
// protects that ONE canonical source from drifting again, which is the
// leverage point that actually prevents the bug class, rather than trying
// to detect a hardcoded list appearing somewhere else in the app.
describe("lead-config STATUS_ORDER/STATUS_META", () => {
  const EXPECTED_STATUSES: LeadStatus[] = [
    "new",
    "contacted",
    "qualified",
    "quoted",
    "negotiation",
    "booked",
    "completed",
    "lost",
    "archived",
  ];

  it("includes every current lead_status enum value, in the current DB enum order", () => {
    expect(STATUS_ORDER).toEqual(EXPECTED_STATUSES);
  });

  it("has no duplicate statuses", () => {
    expect(new Set(STATUS_ORDER).size).toBe(STATUS_ORDER.length);
  });

  it("supplies a label and className for every status in STATUS_ORDER", () => {
    for (const status of STATUS_ORDER) {
      expect(STATUS_META[status], `missing STATUS_META entry for "${status}"`).toBeDefined();
      expect(STATUS_META[status].label.length).toBeGreaterThan(0);
      expect(STATUS_META[status].className.length).toBeGreaterThan(0);
    }
  });
});
