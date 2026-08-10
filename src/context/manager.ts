import type { ScreenContext, StructuredContext, TranscriptSegment } from "../types";
import { redactSecrets } from "./sanitizer";

const EMPTY_SCREEN: ScreenContext = { application: "", windowTitle: "", visibleText: "", detectedTopics: [] };

export class ContextManager {
  private transcript: TranscriptSegment[] = [];
  private summary = "";
  private screen: ScreenContext = EMPTY_SCREEN;
  private taskContext = "";

  constructor(private readonly charBudget = 6_000, private readonly maxTranscriptSegments = 18) {}

  addTranscript(segment: TranscriptSegment): void {
    if (!segment.final || !segment.text.trim()) return;
    this.transcript = [...this.transcript, { ...segment, text: redactSecrets(segment.text.trim()) }].slice(-this.maxTranscriptSegments);
    this.compact();
  }

  setScreenContext(context: ScreenContext): void {
    this.screen = {
      ...context,
      visibleText: redactSecrets(context.visibleText).slice(0, 3_000),
      detectedTopics: context.detectedTopics.slice(0, 12),
    };
  }

  clearScreenContext(): void {
    this.screen = EMPTY_SCREEN;
  }

  setTaskContext(value: string): void {
    this.taskContext = redactSecrets(value).slice(0, 2_000);
  }

  clear(): void {
    this.transcript = [];
    this.summary = "";
    this.screen = EMPTY_SCREEN;
    this.taskContext = "";
  }

  build(question: string): StructuredContext {
    const recentTranscript = this.transcript.map((segment) => segment.text);
    return {
      currentQuestion: redactSecrets(question).slice(0, 2_000),
      recentTranscript,
      conversationSummary: this.summary,
      screenContext: this.screen,
      taskContext: this.taskContext,
    };
  }

  getTranscript(): TranscriptSegment[] {
    return [...this.transcript];
  }

  private compact(): void {
    const text = this.transcript.map((segment) => segment.text).join("\n");
    if (text.length <= this.charBudget) return;
    const archived = this.transcript.slice(0, Math.max(1, Math.floor(this.transcript.length / 2)));
    const condensed = archived.map((segment) => segment.text).join(" ").slice(0, 1_200);
    this.summary = [this.summary, condensed].filter(Boolean).join(" ").slice(-2_000);
    this.transcript = this.transcript.slice(archived.length);
  }
}
