import type { StructuredContext } from "../../types";

export interface AIProvider {
  streamResponse(context: StructuredContext): AsyncIterable<string>;
  generateResponse(context: StructuredContext): Promise<string>;
  countTokens(context: StructuredContext): number;
  healthCheck(): Promise<boolean>;
}

export class MockAIProvider implements AIProvider {
  async *streamResponse(context: StructuredContext): AsyncIterable<string> {
    const response = `Mock response for: ${context.currentQuestion}`;
    for (const chunk of response.match(/.{1,8}/g) ?? []) yield chunk;
  }
  async generateResponse(context: StructuredContext): Promise<string> { return `Mock response for: ${context.currentQuestion}`; }
  countTokens(context: StructuredContext): number { return Math.ceil(JSON.stringify(context).length / 4); }
  async healthCheck(): Promise<boolean> { return true; }
}
