import { Circle } from "lucide-react";

type Tone = "ready" | "active" | "warning" | "offline";

export function StatusIndicator({ label, tone = "ready" }: { label: string; tone?: Tone }) {
  const colors: Record<Tone, string> = {
    ready: "text-emerald-400",
    active: "text-sky-400",
    warning: "text-amber-400",
    offline: "text-zinc-500",
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-zinc-400">
      <Circle className={`h-2.5 w-2.5 fill-current ${colors[tone]}`} aria-hidden />
      {label}
    </span>
  );
}
