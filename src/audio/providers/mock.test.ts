import { describe, expect, it } from "vitest";
import { MockSpeechProvider } from "./mock";

describe("MockSpeechProvider", () => {
  it("emits a partial status and forwards final transcript segments", async () => {
    const provider = new MockSpeechProvider();
    const partial: string[] = [];
    const final: string[] = [];
    await provider.startStream({
      onPartialTranscript: (value) => partial.push(value),
      onFinalTranscript: (value) => final.push(value),
      onError: () => undefined,
    });
    provider.emitFinalTranscript("Can you explain this design?");
    await provider.stopStream();
    provider.emitFinalTranscript("This must not be received.");

    expect(partial).toHaveLength(1);
    expect(final).toEqual(["Can you explain this design?"]);
  });
});
