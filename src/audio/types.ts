export interface SpeechCallbacks {
  onPartialTranscript(text: string): void;
  onFinalTranscript(text: string): void;
  onError(message: string): void;
}

export interface SpeechProvider {
  startStream(callbacks: SpeechCallbacks): Promise<void>;
  stopStream(): Promise<void>;
  pause?(): Promise<void>;
  resume?(): Promise<void>;
}
