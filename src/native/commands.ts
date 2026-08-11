import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AppSettings, CaptureCapability, CapturePrivacyTest, CaptureStatus, NativeSpeechCapability, NativeSpeechEvent, ProviderStatus, StructuredContext } from "../types";

export interface AiStreamEvent { requestId: string; delta: string; done: boolean; error?: string | null; }
export interface OverlayCollapseStatus { collapsed: boolean; }
export interface OverlayDisplayMove { moved: boolean; display: string; }

export const native = {
  getSettings: () => invoke<AppSettings>("get_settings"),
  saveSettings: (settings: AppSettings) => invoke<AppSettings>("save_settings", { settings }),
  saveProviderKey: (provider: string, apiKey: string) => invoke<ProviderStatus>("save_provider_key", { provider, apiKey }),
  deleteProviderKey: (provider: string) => invoke<void>("delete_provider_key", { provider }),
  providerStatus: () => invoke<ProviderStatus>("provider_status"),
  healthCheck: () => invoke<ProviderStatus>("health_check"),
  getCaptureCapability: () => invoke<CaptureCapability>("get_capture_capability"),
  getCaptureStatus: () => invoke<CaptureStatus>("get_capture_status"),
  isCaptureExclusionSupported: () => invoke<boolean>("is_capture_exclusion_supported"),
  setCaptureExclusion: (enabled: boolean) => invoke<CaptureCapability>("set_capture_exclusion", { enabled }),
  runCapturePrivacyTest: () => invoke<CapturePrivacyTest>("run_capture_privacy_test"),
  getNativeSpeechCapability: () => invoke<NativeSpeechCapability>("get_native_speech_capability"),
  startNativeSpeech: () => invoke<void>("start_native_speech"),
  stopNativeSpeech: () => invoke<void>("stop_native_speech"),
  toggleOverlay: () => invoke<void>("toggle_overlay"),
  toggleOverlayCollapse: () => invoke<OverlayCollapseStatus>("toggle_overlay_collapse"),
  moveOverlayToNextDisplay: () => invoke<OverlayDisplayMove>("move_overlay_to_next_display"),
  followOverlayCursorDisplay: () => invoke<boolean>("follow_overlay_cursor_display"),
  startWindowDrag: () => invoke<void>("start_window_drag"),
  minimizeOverlayWindow: () => invoke<void>("minimize_overlay_window"),
  closeOverlayWindow: () => invoke<void>("close_overlay_window"),
  startGeneration: (requestId: string, context: StructuredContext) => invoke<void>("start_generation", { request: { requestId, context } }),
  cancelGeneration: (requestId: string) => invoke<void>("cancel_generation", { requestId }),
  onAiStream: (handler: (event: AiStreamEvent) => void): Promise<UnlistenFn> => listen<AiStreamEvent>("aster://ai-stream", ({ payload }) => handler(payload)),
  onNativeSpeech: (handler: (event: NativeSpeechEvent) => void): Promise<UnlistenFn> => listen<NativeSpeechEvent>("aster://native-speech", ({ payload }) => handler(payload)),
};
