/**
 * Post-signup onboarding — 3-step wizard (Facebook-style).
 *
 * Step 1 — Basic Info   : cover photo, profile photo, name, title, tagline, experience
 * Step 2 — Contact      : WhatsApp, email, website
 * Step 3 — Location     : city, locality, state
 *
 * Every "Next" saves whatever was filled in.
 * Every "Skip for now" moves ahead without saving.
 * Completing or skipping step 3 → /dashboard
 *
 * Guards: if the user is not logged in, redirect to /login.
 * If they already have a professional_title set (already onboarded), go straight to /dashboard.
 */
import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Camera, ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { UPLOAD_HINT } from "@/lib/storage-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/onboarding")({
  component: OnboardingPage,
});

// ─── Server-side image upload ─────────────────────────────────────────────────
// Uses supabaseAdmin (service-role) so it bypasses Storage RLS and works
// reliably with new Supabase API key format. The file arrives as a base64
// data-URL string (the only serialisable form over a server fn boundary).

interface UploadImageInput {
  slug: string;
  category: "profile" | "cover";
  dataUrl: string;   // base64 data URL: "data:<mime>;base64,<data>"
  filename: string;
}

const uploadImageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: UploadImageInput) => d)
  .handler(async ({ data }): Promise<{ publicUrl: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const BUCKET = "portfolio-media";
    const MAX_MB = 5;

    // Decode base64 data URL
    const matches = data.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) throw new Error("Invalid image data.");
    const mimeType = matches[1];
    const base64Data = matches[2];

    const accepted = ["image/jpeg", "image/png", "image/webp"];
    if (!accepted.includes(mimeType)) {
      throw new Error("Please upload a JPG, PNG or WebP image.");
    }

    const buffer = Buffer.from(base64Data, "base64");
    if (buffer.byteLength > MAX_MB * 1024 * 1024) {
      throw new Error(`Image is too large — please keep it under ${MAX_MB}MB.`);
    }

    const ext = mimeType.split("/")[1].replace("jpeg", "jpg");
    const safeName = data.filename.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const path = `profiles/${data.slug}/${data.category}/${Date.now()}-${safeName}.${ext}`;

    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(
      path,
      buffer,
      { contentType: mimeType, cacheControl: "3600", upsert: false },
    );

    if (error) throw new Error(`Upload failed: ${error.message}`);

    const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    return { publicUrl: urlData.publicUrl };
  });

// ─── Server fns — profile data ───────────────────────────────────────────────
const getOnboardingContextFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getOwnBeauticianProfileId } = await import("@/data/dashboard/shared.server");
    const { getProfileForProfile } = await import("@/data/dashboard/profile.server");
    const bpId = await getOwnBeauticianProfileId(context.supabase, context.userId);
    const profile = await getProfileForProfile(context.supabase, bpId);
    return {
      slug: profile.slug,
      display_name: profile.display_name ?? "",
      professional_title: profile.professional_title ?? "",
      short_tagline: profile.short_tagline ?? "",
      years_experience: profile.years_experience ?? null,
      whatsapp_number: profile.whatsapp_number ?? "",
      email: profile.email ?? "",
      website_url: profile.website_url ?? "",
      primary_city: profile.primary_city ?? "",
      locality: profile.locality ?? "",
      state: profile.state ?? "",
      profile_image_url: profile.profile_image_url ?? null,
      cover_image_url: profile.cover_image_url ?? null,
      // Already onboarded if they have a title
      alreadyOnboarded: !!profile.professional_title,
    };
  });

interface SaveStep1Input {
  display_name: string;
  professional_title: string;
  short_tagline: string;
  years_experience: number | null;
  profile_image_url: string | null;
  cover_image_url: string | null;
}

const saveStep1Fn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: SaveStep1Input) => d)
  .handler(async ({ context, data }) => {
    const { updateOwnProfile } = await import("@/data/dashboard/profile.server");
    await updateOwnProfile(context.supabase, context.userId, {
      display_name: data.display_name || undefined,
      professional_title: data.professional_title || undefined,
      short_tagline: data.short_tagline || undefined,
      years_experience: data.years_experience,
      profile_image_url: data.profile_image_url,
      cover_image_url: data.cover_image_url,
    });
  });

interface SaveStep2Input {
  whatsapp_number: string;
  email: string;
  website_url: string;
}

const saveStep2Fn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: SaveStep2Input) => d)
  .handler(async ({ context, data }) => {
    const { updateOwnProfile } = await import("@/data/dashboard/profile.server");
    await updateOwnProfile(context.supabase, context.userId, {
      whatsapp_number: data.whatsapp_number || undefined,
      email: data.email || undefined,
      website_url: data.website_url || undefined,
    });
  });

interface SaveStep3Input {
  primary_city: string;
  locality: string;
  state: string;
}

const saveStep3Fn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: SaveStep3Input) => d)
  .handler(async ({ context, data }) => {
    const { updateOwnProfile } = await import("@/data/dashboard/profile.server");
    await updateOwnProfile(context.supabase, context.userId, {
      primary_city: data.primary_city || undefined,
      locality: data.locality || undefined,
      state: data.state || undefined,
    });
  });

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 3;

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="mb-6">
      <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
        <span>Step {step} of {TOTAL_STEPS}</span>
        <span>{Math.round((step / TOTAL_STEPS) * 100)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
        />
      </div>
    </div>
  );
}

function StepActions({
  onNext,
  onSkip,
  onBack,
  nextLabel = "Next →",
  loading = false,
  showBack = false,
}: {
  onNext: () => void;
  onSkip: () => void;
  onBack?: () => void;
  nextLabel?: string;
  loading?: boolean;
  showBack?: boolean;
}) {
  return (
    <div className="mt-6 space-y-3">
      <Button
        type="button"
        variant="hero"
        className="w-full"
        onClick={onNext}
        disabled={loading}
      >
        {loading ? "Saving…" : nextLabel}
      </Button>
      <div className="flex items-center justify-between">
        {showBack && onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onSkip}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}

// ─── Step 1 — Basic Info + Photos ─────────────────────────────────────────────

function Step1({
  slug,
  initial,
  onNext,
  onSkip,
}: {
  slug: string;
  initial: {
    display_name: string;
    professional_title: string;
    short_tagline: string;
    years_experience: number | null;
    profile_image_url: string | null;
    cover_image_url: string | null;
  };
  onNext: (data: SaveStep1Input) => Promise<void>;
  onSkip: () => void;
}) {
  const [displayName, setDisplayName] = useState(initial.display_name);
  const [title, setTitle] = useState(initial.professional_title);
  const [tagline, setTagline] = useState(initial.short_tagline);
  const [yearsExp, setYearsExp] = useState(
    initial.years_experience != null ? String(initial.years_experience) : "",
  );
  const [photoUrl, setPhotoUrl] = useState<string | null>(initial.profile_image_url);
  const [coverUrl, setCoverUrl] = useState<string | null>(initial.cover_image_url);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [saving, setSaving] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Convert File → base64 data URL for server fn transport
  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!slug) { toast.error("Profile not ready yet — please wait a moment."); return; }
    setUploadingPhoto(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const { publicUrl } = await uploadImageFn({
        data: { slug, category: "profile", dataUrl, filename: file.name },
      });
      setPhotoUrl(publicUrl);
      toast.success("Profile photo uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const handleCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!slug) { toast.error("Profile not ready yet — please wait a moment."); return; }
    setUploadingCover(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const { publicUrl } = await uploadImageFn({
        data: { slug, category: "cover", dataUrl, filename: file.name },
      });
      setCoverUrl(publicUrl);
      toast.success("Cover photo uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  };

  const handleNext = async () => {
    setSaving(true);
    try {
      await onNext({
        display_name: displayName,
        professional_title: title,
        short_tagline: tagline,
        years_experience: yearsExp.trim() ? Number(yearsExp) : null,
        profile_image_url: photoUrl,
        cover_image_url: coverUrl,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2 className="mb-1 font-display text-xl font-semibold">Basic information</h2>
      <p className="mb-5 text-sm text-muted-foreground">
        Add your photos and professional details.
      </p>

      {/* Cover photo */}
      <div className="relative mb-12 h-28 overflow-hidden rounded-xl bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 sm:h-36">
        {coverUrl && (
          <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <label
          htmlFor="ob-cover-input"
          className="absolute right-3 top-3 inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm hover:bg-black/55"
        >
          <Camera className="h-3.5 w-3.5" aria-hidden="true" />
          {uploadingCover ? "Uploading…" : coverUrl ? "Change cover" : "Upload cover"}
        </label>
        <input
          id="ob-cover-input"
          ref={coverInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleCoverChange}
          disabled={uploadingCover || !slug}
          className="sr-only"
        />

        {/* Profile photo — overlapping bottom of cover */}
        <div className="absolute -bottom-10 left-4 sm:-bottom-12">
          <div className="relative">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt=""
                className="h-20 w-20 rounded-full border-4 border-background object-cover shadow-md sm:h-24 sm:w-24"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-background bg-secondary text-[10px] text-muted-foreground shadow-md sm:h-24 sm:w-24">
                No photo
              </div>
            )}
            <label
              htmlFor="ob-photo-input"
              aria-label="Upload profile photo"
              className="absolute -bottom-1 -right-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-sm hover:opacity-90"
            >
              <Camera className="h-4 w-4" aria-hidden="true" />
            </label>
            <input
              id="ob-photo-input"
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoChange}
              disabled={uploadingPhoto || !slug}
              className="sr-only"
            />
          </div>
        </div>
      </div>

      <p className="mb-4 text-[11px] text-muted-foreground">{UPLOAD_HINT}</p>

      {/* Fields */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="ob-name">Full name</Label>
          <Input
            id="ob-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Priya Sharma"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ob-title">
            Professional title <span className="text-muted-foreground text-xs">(e.g. Bridal Makeup Artist)</span>
          </Label>
          <Input
            id="ob-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Bridal &amp; HD Makeup Artist"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ob-tagline">
            Short tagline <span className="text-muted-foreground text-xs">(optional)</span>
          </Label>
          <Input
            id="ob-tagline"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="Turning your dream look into reality"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ob-exp">
            Years of experience <span className="text-muted-foreground text-xs">(optional)</span>
          </Label>
          <Input
            id="ob-exp"
            type="number"
            min={0}
            max={60}
            value={yearsExp}
            onChange={(e) => setYearsExp(e.target.value)}
            placeholder="5"
          />
        </div>
      </div>

      <StepActions onNext={handleNext} onSkip={onSkip} loading={saving} />
    </div>
  );
}

// ─── Step 2 — Contact Information ─────────────────────────────────────────────

function Step2({
  initial,
  onNext,
  onSkip,
  onBack,
}: {
  initial: { whatsapp_number: string; email: string; website_url: string };
  onNext: (data: SaveStep2Input) => Promise<void>;
  onSkip: () => void;
  onBack: () => void;
}) {
  const [whatsapp, setWhatsapp] = useState(initial.whatsapp_number);
  const [email, setEmail] = useState(initial.email);
  const [website, setWebsite] = useState(initial.website_url);
  const [saving, setSaving] = useState(false);

  const handleNext = async () => {
    setSaving(true);
    try {
      await onNext({ whatsapp_number: whatsapp, email, website_url: website });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2 className="mb-1 font-display text-xl font-semibold">Contact information</h2>
      <p className="mb-5 text-sm text-muted-foreground">
        How can clients reach you? All fields are optional.
      </p>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="ob-wa">WhatsApp number</Label>
          <Input
            id="ob-wa"
            type="tel"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="9876543210"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ob-email">Email address</Label>
          <Input
            id="ob-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="priya@example.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ob-website">Website URL</Label>
          <Input
            id="ob-website"
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://yourwebsite.com"
          />
        </div>
      </div>

      <StepActions
        onNext={handleNext}
        onSkip={onSkip}
        onBack={onBack}
        showBack
        loading={saving}
      />
    </div>
  );
}

// ─── Step 3 — Location ────────────────────────────────────────────────────────

function Step3({
  initial,
  onNext,
  onSkip,
  onBack,
}: {
  initial: { primary_city: string; locality: string; state: string };
  onNext: (data: SaveStep3Input) => Promise<void>;
  onSkip: () => void;
  onBack: () => void;
}) {
  const [city, setCity] = useState(initial.primary_city);
  const [locality, setLocality] = useState(initial.locality);
  const [state, setState] = useState(initial.state);
  const [saving, setSaving] = useState(false);

  const handleNext = async () => {
    setSaving(true);
    try {
      await onNext({ primary_city: city, locality, state });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2 className="mb-1 font-display text-xl font-semibold">Location</h2>
      <p className="mb-5 text-sm text-muted-foreground">
        Where are you based? Helps clients find you locally.
      </p>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="ob-city">City</Label>
          <Input
            id="ob-city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Mumbai"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ob-locality">Locality / Area</Label>
          <Input
            id="ob-locality"
            value={locality}
            onChange={(e) => setLocality(e.target.value)}
            placeholder="Andheri West"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ob-state">State</Label>
          <Input
            id="ob-state"
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="Maharashtra"
          />
        </div>
      </div>

      <StepActions
        onNext={handleNext}
        onSkip={onSkip}
        onBack={onBack}
        showBack
        nextLabel="Finish →"
        loading={saving}
      />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [ctx, setCtx] = useState<Awaited<ReturnType<typeof getOnboardingContextFn>> | null>(null);

  // Load context on mount — redirect if not logged in or already onboarded
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate({ to: "/login" });
        return;
      }
      try {
        const data = await getOnboardingContextFn();
        if (data.alreadyOnboarded) {
          navigate({ to: "/dashboard" });
          return;
        }
        setCtx(data);
      } catch {
        // provisioning not done yet — rare, just go to dashboard
        navigate({ to: "/dashboard" });
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const goNext = () => {
    if (step < TOTAL_STEPS) setStep((s) => s + 1);
    else navigate({ to: "/dashboard" });
  };

  const goBack = () => setStep((s) => Math.max(1, s - 1));

  // ── Step handlers ────────────────────────────────────────────────────────

  const handleStep1Next = async (data: SaveStep1Input) => {
    try {
      await saveStep1Fn({ data });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
      return;
    }
    goNext();
  };

  const handleStep2Next = async (data: SaveStep2Input) => {
    try {
      await saveStep2Fn({ data });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
      return;
    }
    goNext();
  };

  const handleStep3Next = async (data: SaveStep3Input) => {
    try {
      await saveStep3Fn({ data });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
      return;
    }
    navigate({ to: "/dashboard" });
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading || !ctx) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Setting up your profile…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-background px-4 py-10 sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
            <span className="text-sm font-bold text-primary">B</span>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">BeautyFolio</p>
            <p className="text-sm font-semibold">Complete your profile</p>
          </div>
        </div>

        <ProgressBar step={step} />

        {step === 1 && (
          <Step1
            slug={ctx.slug}
            initial={{
              display_name: ctx.display_name,
              professional_title: ctx.professional_title,
              short_tagline: ctx.short_tagline,
              years_experience: ctx.years_experience,
              profile_image_url: ctx.profile_image_url,
              cover_image_url: ctx.cover_image_url,
            }}
            onNext={handleStep1Next}
            onSkip={goNext}
          />
        )}

        {step === 2 && (
          <Step2
            initial={{
              whatsapp_number: ctx.whatsapp_number,
              email: ctx.email,
              website_url: ctx.website_url,
            }}
            onNext={handleStep2Next}
            onSkip={goNext}
            onBack={goBack}
          />
        )}

        {step === 3 && (
          <Step3
            initial={{
              primary_city: ctx.primary_city,
              locality: ctx.locality,
              state: ctx.state,
            }}
            onNext={handleStep3Next}
            onSkip={() => navigate({ to: "/dashboard" })}
            onBack={goBack}
          />
        )}
      </div>
    </div>
  );
}
