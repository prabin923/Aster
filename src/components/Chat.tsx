import { useEffect, useRef } from "react";
import { Copy, RefreshCw, Send, Square, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "../types";

interface ChatProps {
  question: string;
  answer: string;
  history: ChatMessage[];
  generating: boolean;
  onQuestionChange(value: string): void;
  onGenerate(): void;
  onStop(): void;
  onClear(): void;
}

export function Chat({ question, answer, history, generating, onQuestionChange, onGenerate, onStop, onClear }: ChatProps) {
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
    <section className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4 pt-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Ask Aster</p>
          <p className="mt-1 text-sm text-zinc-300">Context-aware, private by default.</p>
        </div>
        <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-1 text-[10px] font-medium text-zinc-400">⌘/Ctrl Enter</span>
      </div>

      {history.length > 0 && (
        <div className="max-h-24 overflow-y-auto rounded-xl border border-zinc-800/90 bg-zinc-950/45 px-3 py-2 text-xs text-zinc-500">
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
        <div className="flex items-center justify-between border-b border-zinc-800/80 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-300">Aster response</p>
          <div className="flex items-center gap-1">
            <button onClick={copy} disabled={!answer} title="Copy response" className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30"><Copy className="h-3.5 w-3.5" /></button>
            <button onClick={onGenerate} disabled={!question.trim() || generating} title="Regenerate" className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30"><RefreshCw className="h-3.5 w-3.5" /></button>
            <button onClick={onClear} title="Clear context" className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        <div ref={responseRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm leading-6 text-zinc-200">
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
