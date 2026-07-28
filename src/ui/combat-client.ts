import { CombatRunner, type CombatRunResult } from '@calc/combat-runner';
import { buildEngineFleets, type CombatFleetInput } from '@ui/combat-fleets';

export interface CombatClient {
  run(fleets: readonly CombatFleetInput[]): Promise<CombatRunResult>;
  cancel(): void;
  dispose(): void;
}

export type CombatWorkerRequest = {
  type: 'run';
  requestId: number;
  fleets: CombatFleetInput[];
};

export type CombatWorkerResponse =
  | {
      type: 'result';
      requestId: number;
      result: CombatRunResult;
    }
  | {
      type: 'error';
      requestId: number;
      message: string;
    };

export class CombatCancelledError extends Error {
  constructor() {
    super('Combat calculation cancelled');
    this.name = 'CombatCancelledError';
  }
}

export function isCombatCancelledError(
  error: unknown
): error is CombatCancelledError {
  return error instanceof CombatCancelledError;
}

type ActiveWorker = {
  requestId: number;
  worker: Worker;
  reject: (reason: unknown) => void;
};

export class BrowserCombatClient implements CombatClient {
  private nextRequestId = 0;
  private active?: ActiveWorker;
  private readonly inlineFallback = new InlineCombatClient();

  run(fleets: readonly CombatFleetInput[]): Promise<CombatRunResult> {
    this.cancel();

    let worker: Worker;
    try {
      worker = new Worker(new URL('../combat-worker.js', import.meta.url), {
        type: 'module',
      });
    } catch {
      return this.inlineFallback.run(fleets);
    }

    const requestId = ++this.nextRequestId;
    return new Promise<CombatRunResult>((resolve, reject) => {
      this.active = { requestId, worker, reject };

      const finish = () => {
        if (this.active?.requestId === requestId) {
          this.active = undefined;
        }
        worker.terminate();
      };

      worker.onmessage = (event: MessageEvent<CombatWorkerResponse>) => {
        if (event.data.requestId !== requestId) return;
        finish();
        if (event.data.type === 'result') {
          resolve(event.data.result);
        } else {
          reject(new Error(event.data.message));
        }
      };
      worker.onerror = (event) => {
        event.preventDefault();
        finish();
        reject(new Error(event.message || 'Combat worker failed'));
      };

      const request: CombatWorkerRequest = {
        type: 'run',
        requestId,
        fleets: Array.from(fleets),
      };
      try {
        worker.postMessage(request);
      } catch (error) {
        finish();
        reject(error);
      }
    });
  }

  cancel() {
    const active = this.active;
    if (!active) {
      this.inlineFallback.cancel();
      return;
    }

    this.active = undefined;
    active.worker.terminate();
    active.reject(new CombatCancelledError());
  }

  dispose() {
    this.cancel();
    this.inlineFallback.dispose();
  }
}

// Tests and browsers without Worker support retain the same combat contract.
// Production browsers use BrowserCombatClient so expensive work stays off the
// main thread.
export class InlineCombatClient implements CombatClient {
  private generation = 0;

  async run(fleets: readonly CombatFleetInput[]): Promise<CombatRunResult> {
    const generation = ++this.generation;
    const result = new CombatRunner().run(buildEngineFleets(fleets));
    if (generation !== this.generation) throw new CombatCancelledError();
    return result;
  }

  cancel() {
    this.generation++;
  }

  dispose() {
    this.cancel();
  }
}
