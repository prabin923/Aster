// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultSettings, type CaptureCapability } from "../types";
import { Settings } from "./Settings";

const macosCapability: CaptureCapability = {
  supported: false,
  mode: "window_sharing",
  enabled: false,
  platform: "macOS",
  message: "macOS does not provide the same documented per-window capture-exclusion mechanism available on Windows.",
};

afterEach(cleanup);

function renderSettings(captureCapability: CaptureCapability) {
  return render(
    <Settings
      settings={defaultSettings}
      audioDevices={[]}
      captureCapability={captureCapability}
      onSave={vi.fn(async () => undefined)}
      onSaveKey={vi.fn(async () => undefined)}
      onDeleteKey={vi.fn(async () => undefined)}
      onCaptureExclusionChange={vi.fn(async () => captureCapability)}
      onRunCaptureTest={vi.fn(async () => ({
        overlayWindowExists: true,
        overlayVisibleLocally: true,
        windowIdentity: "native window: main",
        supportedCaptureBehavior: "test",
        capability: captureCapability,
      }))}
      onHealthCheck={vi.fn(async () => undefined)}
    />,
  );
}

describe("Overlay privacy settings", () => {
  it("shows macOS window-sharing guidance without an exclusion toggle", () => {
    renderSettings(macosCapability);

    expect(screen.getByText("Window sharing recommended")).toBeTruthy();
    expect(screen.queryByLabelText("Screen-share exclusion")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "How to share safely" }));
    expect(screen.getByText("Keep the Aster overlay visible locally.")).toBeTruthy();
  });

  it("shows the real toggle only for native Windows exclusion", () => {
    renderSettings({ ...macosCapability, supported: true, mode: "native_exclusion", enabled: true, platform: "Windows", message: "Native capture exclusion active." });

    const toggle = screen.getByLabelText("Screen-share exclusion") as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    expect(screen.queryByText("Window sharing recommended")).toBeNull();
  });

  it("never renders an unsupported environment as enabled", () => {
    renderSettings({ ...macosCapability, mode: "unsupported", enabled: true, platform: "Linux", message: "Capture exclusion is not supported in this environment." });

    expect(screen.getByText("Capture exclusion is not supported in this environment.")).toBeTruthy();
    expect(screen.queryByLabelText("Screen-share exclusion")).toBeNull();
  });
});
