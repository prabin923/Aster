import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AppSettings, CaptureCapability, LocalCaptureTest, ProviderStatus, StructuredContext } from "../types";

export interface AiStreamEvent { requestId: string; delta: string; done: boolean; error?: string | null; }

export const native = {
  getSettings: () => invoke<AppSettings>("get_settings"),
  saveSettings: (settings: AppSettings) => invoke<AppSettings>("save_settings", { settings }),
  saveProviderKey: (provider: string, apiKey: string) => invoke<void>("save_provider_key", { provider, apiKey }),
  deleteProviderKey: (provider: string) => invoke<void>("delete_provider_key", { provider }),
  providerStatus: () => invoke<ProviderStatus>("provider_status"),
  healthCheck: () => invoke<ProviderStatus>("health_check"),
  getCaptureCapability: () => invoke<CaptureCapability>("get_capture_capability"),
  isCaptureExclusionSupported: () => invoke<boolean>("is_capture_exclusion_supported"),
  setCaptureExclusion: (enabled: boolean) => invoke<CaptureCapability>("set_capture_exclusion", { enabled }),
  runLocalCaptureTest: () => invoke<LocalCaptureTest>("run_local_capture_test"),
  toggleOverlay: () => invoke<void>("toggle_overlay"),
  startGeneration: (requestId: string, context: StructuredContext) => invoke<void>("start_generation", { request: { requestId, context } }),
  cancelGeneration: (requestId: string) => invoke<void>("cancel_generation", { requestId }),
  onAiStream: (handler: (event: AiStreamEvent) => void): Promise<UnlistenFn> => listen<AiStreamEvent>("aster://ai-stream", ({ payload }) => handler(payload)),
};
