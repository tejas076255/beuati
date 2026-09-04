// Shared presentational Marketing Tracking (GTM) manager — Admin-only this
// phase (no beautician self-editing yet, see the phase report). Callers own
// all data-fetching/mutation wiring and pass data + callbacks as props — no
// direct server-fn calls here, matching the established *Manager pattern
// (ServiceAreasManager, AvailabilityManager, ...). A single canonical GTM
// container ID is the only thing this UI can ever submit — no free-text
// script/snippet field exists here or anywhere in this feature.
import { useEffect, useState } from "react";
import { Radio } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isValidGtmContainerId, normalizeGtmContainerId } from "@/lib/gtm";

export function TrackingSettingsManager({
  gtmContainerId,
  isLoading,
  isSaving,
  onSave,
  onRemove,
}: {
  gtmContainerId: string | null;
  isLoading: boolean;
  isSaving: boolean;
  onSave: (value: string) => Promise<void> | void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(gtmContainerId ?? "");
  }, [gtmContainerId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeGtmContainerId(draft);
    if (!isValidGtmContainerId(normalized)) {
      setValidationError("Enter a valid GTM container ID (e.g. GTM-XXXXXXX).");
      return;
    }
    setValidationError(null);
    await onSave(normalized);
  };

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Radio className="h-4 w-4 text-primary" aria-hidden="true" />
          Marketing Tracking (GTM)
        </CardTitle>
        <CardDescription>
          When set, this professional's public portfolio loads their own Google Tag Manager
          container — never on any other professional's page, never on Admin/dashboard pages. GA4,
          Meta Pixel, Google Ads conversion tags, etc. are then configured inside that GTM
          container, not here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-sm">
              <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                GTM container ID
              </span>
              <Input
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (validationError) setValidationError(null);
                }}
                placeholder="GTM-XXXXXXX"
                className="mt-1.5"
                disabled={isSaving}
              />
              {validationError && (
                <p role="alert" className="mt-1.5 text-sm text-destructive">
                  {validationError}
                </p>
              )}
            </label>
            <div className="flex gap-2">
              <Button type="submit" variant="hero" disabled={isSaving}>
                {isSaving ? "Saving…" : gtmContainerId ? "Update" : "Save"}
              </Button>
              {gtmContainerId && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isSaving}
                  onClick={() => {
                    if (window.confirm("Remove this portfolio's GTM container ID?")) {
                      onRemove();
                    }
                  }}
                >
                  Remove
                </Button>
              )}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
