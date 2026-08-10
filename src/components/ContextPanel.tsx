import { Eraser, MonitorUp, ScanText } from "lucide-react";
import type { ScreenContext } from "../types";

export function ContextPanel({ screenEnabled, screenContext, capturing, onCapture, onClear }: { screenEnabled: boolean; screenContext: ScreenContext; capturing: boolean; onCapture(): void; onClear(): void }) {
  const hasContext = Boolean(screenContext.visibleText);
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><span className={`grid h-7 w-7 place-items-center rounded-lg ${screenEnabled ? "bg-sky-500/15 text-sky-300" : "bg-zinc-800 text-zinc-500"}`}><MonitorUp className="h-3.5 w-3.5" /></span><div><p className="text-xs font-semibold text-zinc-200">Screen context</p><p className="text-[10px] text-zinc-500">{screenEnabled ? "ON — on-demand only" : "OFF"}</p></div></div>
        <div className="flex gap-1"><button disabled={!screenEnabled || capturing} onClick={onCapture} className="rounded-lg bg-zinc-800 p-2 text-zinc-200 hover:bg-zinc-700 disabled:opacity-30" title="Capture and OCR selected source"><ScanText className="h-3.5 w-3.5" /></button><button disabled={!hasContext} onClick={onClear} className="rounded-lg bg-zinc-800 p-2 text-zinc-200 hover:bg-zinc-700 disabled:opacity-30" title="Clear screen context"><Eraser className="h-3.5 w-3.5" /></button></div>
      </div>
      <p className="mt-3 line-clamp-3 rounded-lg border border-zinc-800/80 bg-black/20 p-2 text-[11px] leading-4 text-zinc-500">{hasContext ? screenContext.visibleText : "Enable screen context in Settings, then use a one-time user-approved capture. Images are discarded after local OCR."}</p>
    </section>
  );
}
