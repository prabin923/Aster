import { native } from "../native/commands";
import type { StructuredContext } from "../types";

export class AiManager {
  async streamResponse(context: StructuredContext, onDelta: (delta: string) => void): Promise<{ requestId: string; completion: Promise<void> }> {
    const requestId = crypto.randomUUID();
    let unlisten: (() => void) | undefined;
    const completion = new Promise<void>((resolve, reject) => {
      native.onAiStream((event) => {
        if (event.requestId !== requestId) return;
        if (event.delta) onDelta(event.delta);
        if (event.error) {
          unlisten?.();
          reject(new Error(event.error));
        } else if (event.done) {
          unlisten?.();
          resolve();
        }
      }).then((dispose) => {
        unlisten = dispose;
        native.startGeneration(requestId, context).catch((error) => {
          unlisten?.();
          reject(error instanceof Error ? error : new Error(String(error)));
        });
      }).catch(reject);
    });
    return { requestId, completion };
  }

  cancel(requestId: string): Promise<void> {
    return native.cancelGeneration(requestId);
  }
}
