import type { SpeechCallbacks, SpeechProvider } from "../types";

interface SpeechRecognitionResultEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type RecognitionConstructor = new () => SpeechRecognitionLike;

function recognitionErrorMessage(error: string): string {
  if (error === "service-not-allowed") {
    return "Browser speech recognition is not available in this desktop WebView. On macOS, choose Native macOS speech recognition in Settings and allow Microphone and Speech Recognition access.";
  }
  if (error === "not-allowed") {
    return "Browser speech recognition was denied. Allow Microphone access, or on macOS choose Native macOS speech recognition in Settings.";
  }
  return `Speech recognition: ${error}`;
}

export class BrowserSpeechProvider implements SpeechProvider {
  private recognition?: SpeechRecognitionLike;
  private active = false;

  async startStream(callbacks: SpeechCallbacks): Promise<void> {
    const browserWindow = window as Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    const Recognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
    if (!Recognition) throw new Error("Browser speech recognition is unavailable in this system WebView. Select Mock or configure an external STT adapter.");
    this.active = true;
    this.recognition = new Recognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = navigator.language || "en-US";
    this.recognition.onresult = (event) => {
      let partial = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const text = event.results[index][0].transcript.trim();
        if (event.results[index].isFinal) callbacks.onFinalTranscript(text);
        else partial += `${text} `;
      }
      if (partial.trim()) callbacks.onPartialTranscript(partial.trim());
    };
    this.recognition.onerror = (event) => {
      this.active = false;
      callbacks.onError(recognitionErrorMessage(event.error));
    };
    this.recognition.onend = () => {
      if (this.active) {
        try { this.recognition?.start(); } catch { /* already restarting */ }
      }
    };
    this.recognition.start();
  }

  async stopStream(): Promise<void> {
    this.active = false;
    this.recognition?.stop();
    this.recognition = undefined;
  }
}

export { recognitionErrorMessage };
