import { Mic, Pause, Play, Radio, Square } from "lucide-react";
import type { TranscriptSegment } from "../types";

interface TranscriptProps {
  listening: boolean;
  paused: boolean;
  partial: string;
  transcript: TranscriptSegment[];
  autoMode: boolean;
  error?: string;
  onStart(): void;
  onStop(): void;
  onPause(): void;
  onResume(): void;
  onAutoMode(value: boolean): void;
}

export function Transcript({ listening, paused, partial, transcript, autoMode, error, onStart, onStop, onPause, onResume, onAutoMode }: TranscriptProps) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`grid h-7 w-7 place-items-center rounded-lg ${listening ? "bg-rose-500/15 text-rose-300" : "bg-zinc-800 text-zinc-500"}`}><Mic className="h-3.5 w-3.5" /></span>
          <div><p className="text-xs font-semibold text-zinc-200">Transcript</p><p className="text-[10px] text-zinc-500">{listening ? (paused ? "Paused" : "Listening in memory") : "Microphone off"}</p></div>
        </div>
        <div className="flex gap-1">
          {!listening ? <button onClick={onStart} className="rounded-lg bg-zinc-800 p-2 text-zinc-200 hover:bg-zinc-700" title="Start microphone"><Play className="h-3.5 w-3.5" /></button> : <>
            <button onClick={paused ? onResume : onPause} className="rounded-lg bg-zinc-800 p-2 text-zinc-200 hover:bg-zinc-700" title={paused ? "Resume" : "Pause"}>{paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}</button>
            <button onClick={onStop} className="rounded-lg bg-zinc-800 p-2 text-zinc-200 hover:bg-zinc-700" title="Stop microphone"><Square className="h-3.5 w-3.5 fill-current" /></button>
          </>}
        </div>
      </div>
      <label className="mt-3 flex cursor-pointer items-center justify-between rounded-lg bg-zinc-900/70 px-2.5 py-2 text-[11px] text-zinc-400">
        <span className="flex items-center gap-1.5"><Radio className="h-3 w-3 text-sky-400" /> Automatic question detection</span>
        <input checked={autoMode} onChange={(event) => onAutoMode(event.target.checked)} className="accent-violet-400" type="checkbox" />
      </label>
      <div className="mt-3 max-h-32 overflow-y-auto rounded-lg border border-zinc-800/80 bg-black/20 p-2 text-xs leading-5">
        {transcript.length === 0 && !partial && <p className="text-zinc-600">Final transcripts appear here. Raw audio is not stored.</p>}
        {transcript.slice(-6).map((segment) => <p key={segment.id} className="text-zinc-300">{segment.text}</p>)}
        {partial && <p className="italic text-sky-300/90">{partial}</p>}
      </div>
      {error && <p className="mt-2 text-[11px] leading-4 text-rose-300">{error}</p>}
    </section>
  );
}
