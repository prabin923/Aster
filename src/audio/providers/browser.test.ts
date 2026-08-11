import { describe, expect, it } from "vitest";
import { recognitionErrorMessage } from "./browser";

describe("BrowserSpeechProvider errors", () => {
  it("gives macOS users an actionable service-not-allowed fallback", () => {
    expect(recognitionErrorMessage("service-not-allowed")).toContain("Native macOS speech recognition");
  });

  it("preserves other browser recognition errors", () => {
    expect(recognitionErrorMessage("network")).toBe("Speech recognition: network");
  });
});
