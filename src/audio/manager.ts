import { BrowserSpeechProvider } from "./providers/browser";
import { MockSpeechProvider } from "./providers/mock";
import { NativeSpeechProvider } from "./providers/native";
import type { SpeechCallbacks, SpeechProvider } from "./types";

export class AudioManager {
  private stream?: MediaStream;
  private provider?: SpeechProvider;
  private paused = false;
  private intentionalStop = false;

  async getDevices(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === "audioinput");
  }

  onDeviceChange(onChange: () => void): () => void {
    const listener = () => onChange();
    navigator.mediaDevices.addEventListener("devicechange", listener);
    return () => navigator.mediaDevices.removeEventListener("devicechange", listener);
  }

  async start(kind: "mock" | "browser" | "native", callbacks: SpeechCallbacks, deviceId = "default"): Promise<void> {
    await this.stop();
    this.intentionalStop = false;
    if (kind !== "native") {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: deviceId === "default" ? true : { deviceId: { exact: deviceId } },
        });
      } catch (error) {
        throw new Error(error instanceof Error ? `Microphone permission or device error: ${error.message}` : "Microphone permission was denied.");
      }
      this.stream.getAudioTracks().forEach((track) => track.addEventListener("ended", () => {
        if (!this.intentionalStop) callbacks.onError("The selected microphone was disconnected or became unavailable.");
      }, { once: true }));
    }
    this.provider = kind === "native" ? new NativeSpeechProvider() : kind === "browser" ? new BrowserSpeechProvider() : new MockSpeechProvider();
    try {
      await this.provider.startStream(callbacks);
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.intentionalStop = true;
    await this.provider?.stopStream();
    this.provider = undefined;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    this.paused = false;
  }

  async pause(): Promise<void> {
    if (this.provider?.pause) await this.provider.pause();
    else this.stream?.getAudioTracks().forEach((track) => { track.enabled = false; });
    this.paused = true;
  }

  async resume(): Promise<void> {
    if (this.provider?.resume) await this.provider.resume();
    else this.stream?.getAudioTracks().forEach((track) => { track.enabled = true; });
    this.paused = false;
  }

  get isPaused(): boolean { return this.paused; }
}
