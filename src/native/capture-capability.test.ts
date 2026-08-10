import { describe, expect, it } from "vitest";
import { captureModeLabel, safeCaptureCapability, supportsNativeCaptureExclusion } from "./capture-capability";

describe("capture capability presentation", () => {
  it("allows a native Windows capability to remain enabled", () => {
    const capability = { supported: true, mode: "native_exclusion" as const, enabled: true, platform: "Windows", message: "active" };
    expect(supportsNativeCaptureExclusion(capability)).toBe(true);
    expect(safeCaptureCapability(capability)?.enabled).toBe(true);
  });

  it("represents a native operation failure as off", () => {
    const capability = { supported: true, mode: "native_exclusion" as const, enabled: false, platform: "Windows", message: "Windows rejected the request" };
    expect(safeCaptureCapability(capability)?.enabled).toBe(false);
  });

  it("never exposes macOS window-sharing fallback as enabled", () => {
    const poisonedCapability = { supported: false, mode: "window_sharing" as const, enabled: true, platform: "macOS", message: "guidance" };
    expect(supportsNativeCaptureExclusion(poisonedCapability)).toBe(false);
    expect(safeCaptureCapability(poisonedCapability)?.enabled).toBe(false);
    expect(captureModeLabel("window_sharing")).toBe("Window sharing");
  });

  it("never exposes an unsupported environment as enabled", () => {
    const poisonedCapability = { supported: false, mode: "unsupported" as const, enabled: true, platform: "Linux", message: "unsupported" };
    expect(safeCaptureCapability(poisonedCapability)?.enabled).toBe(false);
    expect(captureModeLabel("unsupported")).toBe("Unsupported");
  });
});
