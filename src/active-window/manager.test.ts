import { describe, expect, it } from "vitest";
import { ActiveWindowManager, workingContextFromActiveWindow } from "./manager";
import type { ActiveWindow } from "../types";

const window = (applicationName: string, bundleId: string, title: string, overrides: Partial<ActiveWindow> = {}): ActiveWindow => ({
  available: true,
  applicationName,
  bundleId,
  windowTitle: title,
  processId: 42,
  displayId: "display:1",
  isAssistantWindow: false,
  ...overrides,
});

describe("ActiveWindowManager", () => {
  it("updates app history without an AI request when the working app changes", async () => {
    const snapshots = [window("VS Code", "com.microsoft.VSCode", "route.ts"), window("Google Chrome", "com.google.Chrome", "GitHub")];
    const manager = new ActiveWindowManager(async () => snapshots.shift()!, 200, 45_000, (() => { let now = 1; return () => ++now; })());

    await manager.poll();
    await manager.poll();

    const state = manager.getState();
    expect(state.current?.application.name).toBe("Google Chrome");
    expect(state.previous?.application.name).toBe("VS Code");
    expect(state.history).toHaveLength(2);
    expect(state.history[0].endedAt).not.toBeNull();
  });

  it("keeps the prior work context when Aster receives focus", async () => {
    const snapshots = [
      window("VS Code", "com.microsoft.VSCode", "route.ts"),
      window("Aster", "com.aster.desktop", "", { isAssistantWindow: true, processId: 999 }),
    ];
    const manager = new ActiveWindowManager(async () => snapshots.shift()!);
    await manager.poll();
    await manager.poll();
    expect(manager.getState().current?.application.name).toBe("VS Code");
  });

  it("pins and unpins the effective context while tracking the real active app", async () => {
    const snapshots = [window("VS Code", "com.microsoft.VSCode", "route.ts"), window("Terminal", "com.apple.Terminal", "zsh")];
    const manager = new ActiveWindowManager(async () => snapshots.shift()!);
    await manager.poll();
    expect(manager.togglePin()).toBe(true);
    await manager.poll();
    expect(manager.getState().current?.application.name).toBe("Terminal");
    expect(manager.getEffectiveContext()?.application.name).toBe("VS Code");
    expect(manager.togglePin()).toBe(false);
    expect(manager.getEffectiveContext()?.application.name).toBe("Terminal");
  });

  it("represents permission-limited front-app metadata without inventing a title", () => {
    const context = workingContextFromActiveWindow(window("Google Chrome", "com.google.Chrome", "", { available: false, reason: "accessibility_permission_required" }));
    expect(context?.limited).toBe(true);
    expect(context?.window.title).toBe("");
  });

  it("does not roll back state when a stale poll resolves after a fresher native push", async () => {
    let resolvePoll: (value: ActiveWindow) => void;
    const staleRead = new Promise<ActiveWindow>((resolve) => { resolvePoll = resolve; });
    const manager = new ActiveWindowManager(() => staleRead);

    const pending = manager.poll();
    // A native push event for the newly focused app arrives while the poll's
    // IPC round-trip (holding an older snapshot) is still in flight.
    manager.ingest(window("Terminal", "com.apple.Terminal", "zsh"));
    resolvePoll!(window("VS Code", "com.microsoft.VSCode", "route.ts"));
    await pending;

    expect(manager.getState().current?.application.name).toBe("Terminal");
  });

  it("updates a title change without creating duplicate application history", async () => {
    const snapshots = [window("Google Chrome", "com.google.Chrome", "GitHub"), window("Google Chrome", "com.google.Chrome", "Docs")];
    const manager = new ActiveWindowManager(async () => snapshots.shift()!);
    await manager.poll();
    await manager.poll();
    expect(manager.getState().current?.window.title).toBe("Docs");
    expect(manager.getState().history).toHaveLength(1);
  });
});
