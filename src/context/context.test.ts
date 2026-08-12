import { describe, expect, it } from "vitest";
import { ContextManager } from "./manager";
import { isLikelyQuestion } from "./question-detector";
import { redactSecrets } from "./sanitizer";

describe("ContextManager", () => {
  it("keeps a bounded recent transcript and sanitizes it", () => {
    const manager = new ContextManager(80, 3);
    manager.addTranscript({ id: "1", text: "token=very-secret-value-123456789", final: true, timestamp: 1 });
    manager.addTranscript({ id: "2", text: "How would you design this service?", final: true, timestamp: 2 });
    const context = manager.build("What should I answer?");
    expect(context.recentTranscript.join(" ")).toContain("[REDACTED]");
    expect(context.recentTranscript).toHaveLength(2);
  });

  it("detects likely questions", () => {
    expect(isLikelyQuestion("Can you explain how this works?")).toBe(true);
    expect(isLikelyQuestion("We shipped the update yesterday.")).toBe(false);
  });

  it("redacts obvious secrets", () => {
    expect(redactSecrets("authorization: Bearer abc.def-very-secret")).toContain("[REDACTED]");
  });

  it("expires older text into a bounded rolling summary", () => {
    const manager = new ContextManager(40, 10);
    manager.addTranscript({ id: "1", text: "First long transcript segment for a rolling context window.", final: true, timestamp: 1 });
    manager.addTranscript({ id: "2", text: "Second long transcript segment is also relevant.", final: true, timestamp: 2 });
    const context = manager.build("What matters now?");
    expect(context.conversationSummary).toContain("First long transcript");
    expect(context.recentTranscript.length).toBeLessThan(2);
  });

  it("invalidates OCR from a previous application and keeps active-window metadata out of AI by default", () => {
    const manager = new ContextManager();
    const vsCode = {
      application: { name: "VS Code", identifier: "com.microsoft.VSCode" },
      window: { title: "route.ts" },
      timestamp: 1,
      source: "active_window" as const,
      displayId: "display:1",
    };
    const chrome = {
      application: { name: "Google Chrome", identifier: "com.google.Chrome" },
      window: { title: "GitHub" },
      timestamp: 2,
      source: "active_window" as const,
      displayId: "display:1",
    };
    manager.setWorkingContext(vsCode);
    manager.setScreenContext({ application: "VS Code", applicationId: "com.microsoft.VSCode", windowTitle: "route.ts", visibleText: "const answer = 42", detectedTopics: [] });

    expect(manager.setWorkingContext(chrome)).toBe(true);
    expect(manager.build("What does this do?").screenContext.visibleText).toBe("");
    expect(manager.build("What does this do?").workingContext).toBeNull();

    manager.setAiContextualization(true);
    expect(manager.build("What does this do?").workingContext?.application.name).toBe("Google Chrome");
  });
});
