import { describe, expect, it } from "vitest";
import { MockAIProvider } from "./mock";
import type { StructuredContext } from "../../types";

const context: StructuredContext = {
  currentQuestion: "How should I structure a release?",
  recentTranscript: [],
  conversationSummary: "",
  screenContext: { application: "", windowTitle: "", visibleText: "", detectedTopics: [] },
  taskContext: "",
};

describe("MockAIProvider", () => {
  it("streams and generates a response without a network request", async () => {
    const provider = new MockAIProvider();
    const chunks: string[] = [];
    for await (const chunk of provider.streamResponse(context)) chunks.push(chunk);

    expect(chunks.join("")).toContain(context.currentQuestion);
    await expect(provider.generateResponse(context)).resolves.toContain("Mock response");
    await expect(provider.healthCheck()).resolves.toBe(true);
    expect(provider.countTokens(context)).toBeGreaterThan(0);
  });
});
