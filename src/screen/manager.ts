import { createWorker } from "tesseract.js";
import type { ScreenContext } from "../types";

const topicPatterns = ["React", "TypeScript", "Rust", "Tauri", "Next.js", "Prisma", "SQL", "Python", "Docker", "Kubernetes"];

export function parseScreenContext(visibleText: string): ScreenContext {
  const text = visibleText.trim().slice(0, 3_000);
  return {
    application: "User-approved screen capture",
    windowTitle: "Selected source",
    visibleText: text,
    detectedTopics: topicPatterns.filter((topic) => new RegExp(`\\b${topic.replace(".", "\\.")}\\b`, "i").test(text)),
  };
}

export class ScreenContextProvider {
  private context: ScreenContext = { application: "", windowTitle: "", visibleText: "", detectedTopics: [] };

  async capture(): Promise<ScreenContext> {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    try {
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      const scale = Math.min(1, 1600 / Math.max(video.videoWidth, 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Unable to create the capture.")), "image/jpeg", 0.82));
      const visibleText = await this.extractText(blob);
      this.context = parseScreenContext(visibleText);
      return this.context;
    } finally {
      stream.getTracks().forEach((track) => track.stop());
    }
  }

  async extractText(image: Blob): Promise<string> {
    const worker = await createWorker("eng");
    try {
      const result = await worker.recognize(image);
      return result.data.text.trim().slice(0, 3_000);
    } finally {
      await worker.terminate();
    }
  }

  async getActiveWindow(): Promise<{ application: string; windowTitle: string }> {
    return { application: "User-approved screen capture", windowTitle: "Selected source" };
  }

  getContext(): ScreenContext {
    return { ...this.context, detectedTopics: [...this.context.detectedTopics] };
  }

  clearContext(): void {
    this.context = { application: "", windowTitle: "", visibleText: "", detectedTopics: [] };
  }
}
