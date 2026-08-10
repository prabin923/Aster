import type { SpeechCallbacks, SpeechProvider } from "../types";

export class MockSpeechProvider implements SpeechProvider {
  private callbacks?: SpeechCallbacks;

  async startStream(callbacks: SpeechCallbacks): Promise<void> {
    this.callbacks = callbacks;
    callbacks.onPartialTranscript("Mock listening is active — type or use the browser provider for speech.");
  }

  async stopStream(): Promise<void> {
    this.callbacks = undefined;
  }

  emitFinalTranscript(text: string): void {
    this.callbacks?.onFinalTranscript(text);
  }
}
