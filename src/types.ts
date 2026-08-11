export type ProviderName = "mock" | "openai" | "gemini" | "claude";
export type Theme = "dark" | "light" | "system";

export interface AppSettings {
  general: {
    theme: Theme;
    overlayOpacity: number;
    alwaysOnTop: boolean;
    position: string;
    shortcut: string;
    screenShareExclusion: boolean;
  };
  audio: {
    inputDevice: string;
    sttProvider: "mock" | "browser" | "native";
    autoListening: boolean;
    retainTranscript: boolean;
  };
  screen: {
    enabled: boolean;
    captureBehavior: "on-demand" | "manual";
    ocrEnabled: boolean;
    retainContext: boolean;
  };
  ai: {
    provider: ProviderName;
    model: string;
    temperature: number;
    maxOutput: number;
    streaming: boolean;
  };
  privacy: {
    conversationHistory: boolean;
    telemetry: boolean;
  };
}

export interface ScreenContext {
  application: string;
  windowTitle: string;
  visibleText: string;
  detectedTopics: string[];
}

export interface StructuredContext {
  currentQuestion: string;
  recentTranscript: string[];
  conversationSummary: string;
  screenContext: ScreenContext;
  taskContext: string;
}

export interface ProviderStatus {
  provider: ProviderName;
  configured: boolean;
  connected: boolean;
  credentialStorage: "secure" | "session" | "none";
  message: string;
}

export interface NativeSpeechCapability {
  supported: boolean;
  provider: "native";
  message: string;
}

export interface NativeSpeechEvent {
  kind: "partial" | "final" | "error" | "status";
  text: string;
}

export type CaptureMode = "native_exclusion" | "app_controlled_exclusion" | "window_sharing_recommended" | "unsupported";

export interface CaptureCapability {
  supported: boolean;
  mode: CaptureMode;
  enabled: boolean;
  platform: string;
  message: string;
}

export interface AppOwnedStreamStatus {
  mode: CaptureMode;
  supported: boolean;
  enabled: boolean;
  message: string;
}

export interface CaptureStatus extends CaptureCapability {
  appOwnedStream?: AppOwnedStreamStatus;
}

export type CaptureTestResult = "pass" | "fail" | "not_applicable";

export interface CapturePrivacyTest {
  platform: string;
  overlayDetected: boolean;
  nativeWindowDetected: boolean;
  captureCapability: CaptureCapability;
  exclusion: "enabled" | "disabled";
  result: CaptureTestResult;
  message: string;
  appOwnedStream?: AppOwnedStreamStatus;
}

export interface TranscriptSegment {
  id: string;
  text: string;
  final: boolean;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
}

export const defaultSettings: AppSettings = {
  general: {
    theme: "dark",
    overlayOpacity: 0.98,
    alwaysOnTop: true,
    position: "top-right",
    shortcut: "CommandOrControl+Space",
    screenShareExclusion: false,
  },
  audio: {
    inputDevice: "default",
    sttProvider: "mock",
    autoListening: false,
    retainTranscript: false,
  },
  screen: {
    enabled: false,
    captureBehavior: "on-demand",
    ocrEnabled: true,
    retainContext: false,
  },
  ai: {
    provider: "mock",
    model: "aster-mock-stream",
    temperature: 0.35,
    maxOutput: 500,
    streaming: true,
  },
  privacy: {
    conversationHistory: false,
    telemetry: false,
  },
};
