// Per-beautician Admin Verification tab — a thin read/write view over the
// SAME is_verified flag + updateProfileFlags() authority already used by
// the platform-wide /admin/profiles list (src/data/admin/profiles.server.ts,
// DB-guarded by guard_beautician_profile_flags() so a professional can
// never set this on themselves, and already audit-logged via the
// "verification_changed" admin_audit_action). No new verification system,
// no scoring/approval-queue model — just a dedicated place to see and
// toggle the same trust flag without leaving this workspace.
import { CheckCircle2, ShieldQuestion } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function VerificationPanel({
  profileDisplayName,
  isVerified,
  isLoading,
  isSaving,
  onToggle,
}: {
  profileDisplayName: string;
  isVerified: boolean | null;
  isLoading: boolean;
  isSaving: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <div>
      <div>
        <h2 className="font-display text-2xl font-semibold">Verification</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Whether BeautyFolio has reviewed and approved {profileDisplayName}.
        </p>
      </div>

      <div className="mt-6 space-y-4">
        {isLoading || isVerified === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {isVerified ? (
                  <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
                ) : (
                  <ShieldQuestion className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                )}
                Trust status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <Badge variant={isVerified ? "default" : "outline"}>
                  {isVerified ? "Verified" : "Unverified"}
                </Badge>
                <Button
                  variant={isVerified ? "outline" : "default"}
                  size="sm"
                  disabled={isSaving}
                  onClick={() => onToggle(!isVerified)}
                >
                  {isVerified ? "Remove verification" : "Verify professional"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Verification means BeautyFolio has personally reviewed and approved this
                professional. Verified profiles show a "Reviewed and approved by BeautyFolio" badge
                on their public portfolio. This is independent of Readiness (content completeness)
                and Publication (public visibility) — verifying or unverifying does not change
                either.
              </p>
              <a
                href="/admin/audit-logs"
                className="inline-block text-xs font-medium text-primary underline underline-offset-2"
              >
                View full audit history →
              </a>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
