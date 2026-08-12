import type { ScreenContext, StructuredContext, TranscriptSegment, WorkingContext } from "../types";
import { redactSecrets } from "./sanitizer";

const EMPTY_SCREEN: ScreenContext = { application: "", windowTitle: "", visibleText: "", detectedTopics: [] };

export class ContextManager {
  private transcript: TranscriptSegment[] = [];
  private summary = "";
  private screen: ScreenContext = EMPTY_SCREEN;
  private taskContext = "";
  private workingContext: WorkingContext | null = null;
  private includeWorkingContextInAiRequests = false;

  constructor(private readonly charBudget = 6_000, private readonly maxTranscriptSegments = 18) {}

  addTranscript(segment: TranscriptSegment): void {
    if (!segment.final || !segment.text.trim()) return;
    this.transcript = [...this.transcript, { ...segment, text: redactSecrets(segment.text.trim()) }].slice(-this.maxTranscriptSegments);
    this.compact();
  }

  setScreenContext(context: ScreenContext): void {
    if (this.workingContext && context.applicationId && context.applicationId !== this.workingContext.application.identifier) {
      this.screen = EMPTY_SCREEN;
      return;
    }
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

  setWorkingContext(context: WorkingContext | null): boolean {
    const applicationId = context?.application.identifier;
    const staleScreenContext = Boolean(this.screen.applicationId && applicationId && this.screen.applicationId !== applicationId);
    this.workingContext = context ? {
      ...context,
      application: { ...context.application },
      window: { ...context.window, title: redactSecrets(context.window.title).slice(0, 500) },
      bounds: context.bounds ? { ...context.bounds } : undefined,
    } : null;
    if (staleScreenContext) this.screen = EMPTY_SCREEN;
    return staleScreenContext;
  }

  getWorkingContext(): WorkingContext | null {
    return this.workingContext ? {
      ...this.workingContext,
      application: { ...this.workingContext.application },
      window: { ...this.workingContext.window },
      bounds: this.workingContext.bounds ? { ...this.workingContext.bounds } : undefined,
    } : null;
  }

  setAiContextualization(enabled: boolean): void {
    this.includeWorkingContextInAiRequests = enabled;
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
      workingContext: this.includeWorkingContextInAiRequests ? this.getWorkingContext() : null,
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
