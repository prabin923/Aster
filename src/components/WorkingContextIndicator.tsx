import { AppWindow, Pin, PinOff, Trash2 } from "lucide-react";
import type { WorkingContext } from "../types";

interface WorkingContextIndicatorProps {
  context: WorkingContext | null;
  pinned: boolean;
  unavailableReason?: string;
  onTogglePin(): void;
  onClearHistory(): void;
}

export function WorkingContextIndicator({ context, pinned, unavailableReason, onTogglePin, onClearHistory }: WorkingContextIndicatorProps) {
  const title = context?.window.title || (unavailableReason === "accessibility_permission_required" ? "Grant Accessibility for window details" : unavailableReason ? "Window details unavailable" : "Waiting for a working application");
  return (
    <section className="mx-4 mt-2.5 flex shrink-0 items-center gap-2.5 rounded-xl border border-zinc-800/90 bg-zinc-950/45 px-3 py-2 transition-colors duration-150">
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${pinned ? "bg-amber-400/15 text-amber-200" : "bg-sky-400/10 text-sky-300"}`}><AppWindow className="h-3.5 w-3.5" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-500">{pinned ? "Context pinned" : "Working in"}</p>
        <p className="truncate text-xs font-semibold text-zinc-200">{context?.application.name || "Active window unavailable"}</p>
        <p className="truncate text-[10px] text-zinc-500">{title}</p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <button onClick={onTogglePin} disabled={!context} className={`rounded-md p-1.5 transition disabled:opacity-30 ${pinned ? "text-amber-200 hover:bg-amber-400/10" : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"}`} title={pinned ? "Unpin context" : "Pin current context"}>{pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}</button>
        <button onClick={onClearHistory} className="rounded-md p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200" title="Clear application context history"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    </section>
  );
}
