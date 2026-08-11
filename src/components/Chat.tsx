import { useEffect, useRef } from "react";
import { Code2, Copy, MessageSquarePlus, Monitor, RefreshCw, Send, Sparkles, Square, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "../types";

interface ChatProps {
  question: string;
  answer: string;
  history: ChatMessage[];
  generating: boolean;
  smartMode: boolean;
  onQuestionChange(value: string): void;
  onGenerate(): void;
  onStop(): void;
  onClear(): void;
  onAssistScreen(): void;
  onSolveCode(): void;
  onWhatShouldISay(): void;
  onToggleSmartMode(): void;
}

export function Chat({
  question,
  answer,
  history,
  generating,
  smartMode,
  onQuestionChange,
  onGenerate,
  onStop,
  onClear,
  onAssistScreen,
  onSolveCode,
  onWhatShouldISay,
  onToggleSmartMode,
}: ChatProps) {
  const responseRef = useRef<HTMLDivElement>(null);

  useEffect(() => { responseRef.current?.scrollTo({ top: responseRef.current.scrollHeight, behavior: "smooth" }); }, [answer, generating]);

  const copy = async () => { if (answer) await navigator.clipboard.writeText(answer); };
  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      onGenerate();
    }
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2.5 px-4 pb-4 pt-2.5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Ask Aster</p>
          <p className="mt-0.5 text-xs text-zinc-300">Screen & meeting copilot</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleSmartMode}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition ${
              smartMode
                ? "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                : "border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20"
            }`}
            title={smartMode ? "Smart Mode: In-depth reasoning" : "Fast Mode: High speed response"}
          >
            <Sparkles className="h-3 w-3" />
            {smartMode ? "Smart" : "Fast"}
          </button>
          <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-zinc-400">⌘/Ctrl ↵</span>
        </div>
      </div>

      {/* Cue-like Quick Action Buttons */}
      <div className="grid grid-cols-3 gap-1.5">
        <button
          onClick={onAssistScreen}
          disabled={generating}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-800/90 bg-zinc-900/70 px-2 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-violet-500/50 hover:bg-zinc-800 disabled:opacity-50"
          title="Capture current screen and analyze (⌘ Enter)"
        >
          <Monitor className="h-3.5 w-3.5 text-violet-400" />
          <span>Assist</span>
        </button>
        <button
          onClick={onSolveCode}
          disabled={generating}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-800/90 bg-zinc-900/70 px-2 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-emerald-500/50 hover:bg-zinc-800 disabled:opacity-50"
          title="Solve coding problem from screen (⌘ H)"
        >
          <Code2 className="h-3.5 w-3.5 text-emerald-400" />
          <span>Solve Code</span>
        </button>
        <button
          onClick={onWhatShouldISay}
          disabled={generating}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-800/90 bg-zinc-900/70 px-2 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-amber-500/50 hover:bg-zinc-800 disabled:opacity-50"
          title="Suggest live meeting response"
        >
          <MessageSquarePlus className="h-3.5 w-3.5 text-amber-400" />
          <span>What to say?</span>
        </button>
      </div>

      {history.length > 0 && (
        <div className="max-h-20 overflow-y-auto rounded-xl border border-zinc-800/90 bg-zinc-950/45 px-3 py-1.5 text-xs text-zinc-500">
          {history.slice(-3).map((item) => <p className="truncate py-0.5" key={item.id}><span className="mr-1 text-zinc-600">{item.role === "user" ? "You" : "Aster"}:</span>{item.content}</p>)}
        </div>
      )}

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-2 shadow-inner shadow-black/10 focus-within:border-violet-400/60">
        <textarea
          value={question}
          onChange={(event) => onQuestionChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask anything…"
          rows={3}
          className="block w-full resize-none bg-transparent px-2 py-1.5 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-600"
        />
        <div className="mt-1 flex items-center justify-between px-1">
          <span className="text-[10px] text-zinc-600">Sensitive values are redacted before cloud requests.</span>
          {generating ? (
            <button onClick={onStop} className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-2.5 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-zinc-700"><Square className="h-3 w-3 fill-current" /> Stop</button>
          ) : (
            <button onClick={onGenerate} disabled={!question.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"><Send className="h-3 w-3" /> Ask</button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-zinc-800/90 bg-zinc-950/45">
        <div className="flex items-center justify-between border-b border-zinc-800/80 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-300">Aster response</p>
          <div className="flex items-center gap-1">
            <button onClick={copy} disabled={!answer} title="Copy response" className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30"><Copy className="h-3.5 w-3.5" /></button>
            <button onClick={onGenerate} disabled={!question.trim() || generating} title="Regenerate" className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30"><RefreshCw className="h-3.5 w-3.5" /></button>
            <button onClick={onClear} title="Clear context" className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        <div ref={responseRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-2.5 text-sm leading-6 text-zinc-200">
          {answer ? (
            <article className="aster-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>{generating && <span className="ml-1 inline-block h-3 w-1 animate-pulse rounded bg-violet-300 align-baseline" />}</article>
          ) : (
            <p className="pt-4 text-center text-xs text-zinc-600">Answers stream here as soon as Aster receives a token.</p>
          )}
        </div>
      </div>
    </section>
  );
}

