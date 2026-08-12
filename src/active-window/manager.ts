import { redactSecrets } from "../context/sanitizer";
import type { ActiveWindow, ApplicationContextHistory, WorkingContext } from "../types";

export interface ActiveWindowState {
  current: WorkingContext | null;
  previous: WorkingContext | null;
  pinned: WorkingContext | null;
  history: ApplicationContextHistory[];
  unavailableReason?: string;
}

type Listener = (state: ActiveWindowState) => void;
type Reader = () => Promise<ActiveWindow>;

const cloneContext = (context: WorkingContext | null): WorkingContext | null => context ? {
  ...context,
  application: { ...context.application },
  window: { ...context.window },
  bounds: context.bounds ? { ...context.bounds } : undefined,
} : null;

const cloneState = (state: ActiveWindowState): ActiveWindowState => ({
  current: cloneContext(state.current),
  previous: cloneContext(state.previous),
  pinned: cloneContext(state.pinned),
  history: state.history.map((entry) => ({ ...entry })),
  unavailableReason: state.unavailableReason,
});

export function workingContextFromActiveWindow(window: ActiveWindow, timestamp = Date.now()): WorkingContext | null {
  if (window.isAssistantWindow || !window.applicationName.trim()) return null;
  return {
    application: {
      name: redactSecrets(window.applicationName).slice(0, 200),
      identifier: redactSecrets(window.bundleId || `process:${window.processId}`).slice(0, 300),
    },
    window: { title: redactSecrets(window.windowTitle).slice(0, 500) },
    timestamp,
    source: "active_window",
    displayId: window.displayId.slice(0, 120),
    bounds: window.bounds ? { ...window.bounds } : undefined,
    limited: !window.available,
  };
}

function sameContext(left: WorkingContext | null, right: WorkingContext | null): boolean {
  if (!left || !right) return left === right;
  return left.application.identifier === right.application.identifier &&
    left.application.name === right.application.name &&
    left.window.title === right.window.title &&
    left.displayId === right.displayId &&
    left.limited === right.limited &&
    left.bounds?.x === right.bounds?.x &&
    left.bounds?.y === right.bounds?.y &&
    left.bounds?.width === right.bounds?.width &&
    left.bounds?.height === right.bounds?.height;
}

/**
 * Small, renderer-owned state machine for native metadata snapshots. Native
 * change events are primary; a bounded renderer fallback keeps state current
 * when an OS event is delayed or unavailable. It never starts capture or AI
 * work, and identical snapshots do not cause React updates.
 */
export class ActiveWindowManager {
  private state: ActiveWindowState = { current: null, previous: null, pinned: null, history: [] };
  private listeners = new Set<Listener>();
  private timer?: ReturnType<typeof setInterval>;
  private polling = false;
  private generation = 0;

  constructor(
    private readonly reader: Reader,
    private readonly intervalMs = 225,
    private readonly previousExpiryMs = 45_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.expirePrevious();
      void this.poll();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  getState(): ActiveWindowState {
    return cloneState(this.state);
  }

  getEffectiveContext(): WorkingContext | null {
    return cloneContext(this.state.pinned || this.state.current);
  }

  togglePin(): boolean {
    if (this.state.pinned) {
      this.state.pinned = null;
      this.emit();
      return false;
    }
    if (!this.state.current) return false;
    this.state.pinned = cloneContext(this.state.current);
    this.emit();
    return true;
  }

  clearHistory(): void {
    this.state.history = [];
    this.emit();
  }

  async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    const startedAt = this.generation;
    try {
      const snapshot = await this.reader();
      // A native push event may have advanced state while this IPC round-trip
      // was in flight; that snapshot is fresher than this stale live read.
      if (this.generation !== startedAt) return;
      this.ingest(snapshot);
    } finally {
      this.polling = false;
    }
  }

  ingest(snapshot: ActiveWindow): void {
    this.generation++;
    if (snapshot.isAssistantWindow) return;
    const next = workingContextFromActiveWindow(snapshot, this.now());
    if (!next) {
      if (snapshot.reason && snapshot.reason !== this.state.unavailableReason) {
        this.state.unavailableReason = snapshot.reason;
        this.emit();
      }
      this.expirePrevious();
      return;
    }
    this.state.unavailableReason = snapshot.reason;
    if (sameContext(this.state.current, next)) {
      this.expirePrevious();
      return;
    }

    const previous = this.state.current;
    const applicationChanged = Boolean(previous && previous.application.identifier !== next.application.identifier);
    if (applicationChanged && previous) {
      this.state.previous = cloneContext(previous);
      const openHistory = this.state.history.find((entry) => entry.endedAt === null);
      if (openHistory) openHistory.endedAt = next.timestamp;
    }
    if (!previous || applicationChanged) {
      this.state.history = [...this.state.history, {
        application: next.application.name,
        applicationId: next.application.identifier,
        startedAt: next.timestamp,
        endedAt: null,
      }].slice(-12);
    }
    this.state.current = next;
    this.emit();
  }

  private expirePrevious(): void {
    if (this.state.previous && this.now() - this.state.previous.timestamp > this.previousExpiryMs) {
      this.state.previous = null;
      this.emit();
    }
  }

  private emit(): void {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }
}
