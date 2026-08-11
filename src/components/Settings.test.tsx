// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultSettings, type CaptureStatus, type ProviderStatus } from "../types";
import { Settings } from "./Settings";

const macosCapability: CaptureStatus = {
  supported: false,
  mode: "window_sharing_recommended",
  enabled: false,
  platform: "macOS",
  message: "macOS does not provide the same documented per-window capture-exclusion mechanism available on Windows.",
  appOwnedStream: {
    mode: "app_controlled_exclusion",
    supported: true,
    enabled: false,
    message: "Aster can test its own ScreenCaptureKit stream.",
  },
};

afterEach(cleanup);

function renderSettings(captureStatus: CaptureStatus) {
  return render(
    <Settings
      settings={defaultSettings}
      audioDevices={[]}
      captureStatus={captureStatus}
      onSave={vi.fn(async () => undefined)}
      onSaveKey={vi.fn(async (): Promise<ProviderStatus> => ({ provider: "gemini", configured: true, connected: false, credentialStorage: "secure", message: "API key was stored and verified in native secure storage." }))}
      onDeleteKey={vi.fn(async () => undefined)}
      onCaptureExclusionChange={vi.fn(async () => captureStatus)}
      onRunCapturePrivacyTest={vi.fn(async () => ({
        platform: captureStatus.platform,
        overlayDetected: true,
        nativeWindowDetected: true,
        captureCapability: captureStatus,
        exclusion: "disabled" as const,
        result: "not_applicable" as const,
        message: "test",
        appOwnedStream: captureStatus.appOwnedStream,
      }))}
      onHealthCheck={vi.fn(async () => undefined)}
    />,
  );
}

describe("Overlay privacy settings", () => {
  it("shows macOS window-sharing guidance and the app-owned capture diagnostic", async () => {
    renderSettings(macosCapability);

    expect(screen.getAllByText("Window sharing recommended").length).toBeGreaterThan(0);
    expect(screen.getByText("App-controlled exclusion available")).toBeTruthy();
    expect(screen.queryByLabelText("Screen-share exclusion")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "How to share safely" }));
    expect(screen.getByText("Keep the Aster overlay visible locally.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Run capture privacy test" }));
    expect(await screen.findByText("Capture Privacy Test — Not applicable")).toBeTruthy();
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

  it("shows a visible error when native credential storage rejects a key", async () => {
    const geminiSettings = { ...defaultSettings, ai: { ...defaultSettings.ai, provider: "gemini" as const, model: "gemini-test" } };
    render(
      <Settings
        settings={geminiSettings}
        audioDevices={[]}
        captureStatus={macosCapability}
        onSave={vi.fn(async () => undefined)}
        onSaveKey={vi.fn(async () => { throw new Error("Keychain access was denied"); })}
        onDeleteKey={vi.fn(async () => undefined)}
        onCaptureExclusionChange={vi.fn(async () => macosCapability)}
        onRunCapturePrivacyTest={vi.fn(async () => ({ platform: "macOS", overlayDetected: true, nativeWindowDetected: true, captureCapability: macosCapability, exclusion: "disabled" as const, result: "not_applicable" as const, message: "test" }))}
        onHealthCheck={vi.fn(async () => undefined)}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Paste once — never shown again"), { target: { value: "AIzaTestOnlyNotARealCredential" } });
    fireEvent.click(screen.getByRole("button", { name: "Store" }));
    expect(await screen.findByText("Could not store API key: Keychain access was denied")).toBeTruthy();
  });
});
