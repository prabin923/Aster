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
  if (mode === "window_sharing") return "Window sharing";
  return "Unsupported";
}
