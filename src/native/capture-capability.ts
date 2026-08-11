import type { CaptureCapability, CaptureMode } from "../types";

export function supportsNativeCaptureExclusion(capability?: CaptureCapability): boolean {
  return capability?.supported === true && capability.mode === "native_exclusion";
}

export function safeCaptureCapability(capability?: CaptureCapability): CaptureCapability | undefined {
  if (!capability || supportsNativeCaptureExclusion(capability)) return capability;
  return { ...capability, enabled: false };
}

export function captureModeLabel(mode?: CaptureMode): string {
  if (mode === "native_exclusion") return "Native exclusion";
  if (mode === "app_controlled_exclusion") return "App-controlled exclusion";
  if (mode === "window_sharing_recommended") return "Window sharing recommended";
  return "Unsupported";
}
