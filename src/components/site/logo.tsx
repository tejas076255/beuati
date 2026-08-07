import { Sparkles } from "lucide-react";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <span className="bg-gradient-brand flex h-9 w-9 items-center justify-center rounded-xl">
        <Sparkles className="h-4.5 w-4.5 text-primary-foreground" aria-hidden="true" />
      </span>
      <span className="font-display text-lg font-semibold tracking-tight">
        Beauty<span className="text-gradient-brand">Folio</span>
      </span>
    </span>
  );
}
