import type { UnlistenFn } from "@tauri-apps/api/event";
import { native } from "../../native/commands";
import type { SpeechCallbacks, SpeechProvider } from "../types";

/**
 * Uses the supported macOS Speech framework through Tauri's native layer.
 * The React renderer only receives transcript events; it never receives raw
 * microphone buffers or provider credentials.
 */
export class NativeSpeechProvider implements SpeechProvider {
  private unlisten?: UnlistenFn;
  private active = false;
  private callbacks?: SpeechCallbacks;

  async startStream(callbacks: SpeechCallbacks): Promise<void> {
    this.callbacks = callbacks;
    this.active = true;
    this.unlisten = await native.onNativeSpeech((event) => {
      if (!this.active) return;
      if (event.kind === "partial") callbacks.onPartialTranscript(event.text);
      else if (event.kind === "final") callbacks.onFinalTranscript(event.text);
      else if (event.kind === "error") callbacks.onError(event.text);
    });
    try {
      await native.startNativeSpeech();
    } catch (error) {
      await this.stopStream();
      throw error;
    }
  }

  async stopStream(): Promise<void> {
    this.active = false;
    try {
      await native.stopNativeSpeech();
    } finally {
      this.unlisten?.();
      this.unlisten = undefined;
      this.callbacks = undefined;
    }
  }

  async pause(): Promise<void> {
    this.active = false;
    await native.stopNativeSpeech();
  }

  async resume(): Promise<void> {
    if (!this.callbacks) throw new Error("Native speech recognition is not active.");
    this.active = true;
    try {
      await native.startNativeSpeech();
    } catch (error) {
      this.active = false;
      throw error;
    }
  }
}
