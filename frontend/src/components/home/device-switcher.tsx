import { Monitor, Smartphone, Tablet } from "lucide-react";

import { cn } from "@/lib/utils";
import type { DeviceKey } from "@/data/home";

const options: { key: DeviceKey; label: string; Icon: typeof Monitor }[] = [
  { key: "desktop", label: "Desktop", Icon: Monitor },
  { key: "tablet", label: "Tablet", Icon: Tablet },
  { key: "mobile", label: "Mobile", Icon: Smartphone },
];

export function DeviceSwitcher({
  value,
  onChange,
  label,
}: {
  value: DeviceKey;
  onChange: (key: DeviceKey) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-background/80 p-1 backdrop-blur"
    >
      {options.map(({ key, label: optionLabel, Icon }) => (
        <button
          key={key}
          role="tab"
          type="button"
          aria-selected={value === key}
          aria-label={`${optionLabel} preview`}
          onClick={() => onChange(key)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            value === key
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">{optionLabel}</span>
        </button>
      ))}
    </div>
  );
}
