import {
  CombatRunner,
  DEFAULT_CALIBRATION,
  type CombatRunResult,
  type SolverCalibration,
} from '@calc/combat-runner';
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
  // The latest calibration this client saw; the worker returns the updated
  // one inside the result's diagnostics.
  calibration: SolverCalibration;
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

type ActiveRequest = {
  requestId: number;
  reject: (reason: unknown) => void;
};

// Runs combat in a dedicated worker that stays alive between requests, so
// later requests run on warm code. A request in flight cannot be interrupted,
// so cancelling it discards that worker and the next request starts a fresh
// one; the solver calibration lives here and survives that.
export class BrowserCombatClient implements CombatClient {
  private nextRequestId = 0;
  private worker?: Worker;
  private active?: ActiveRequest;
  private calibration: SolverCalibration = DEFAULT_CALIBRATION;
  private readonly inlineFallback = new InlineCombatClient();

  run(fleets: readonly CombatFleetInput[]): Promise<CombatRunResult> {
    this.cancel();

    let worker: Worker;
    try {
      worker = this.worker ?? this.createWorker();
    } catch {
      return this.inlineFallback.run(fleets);
    }
    this.worker = worker;

    const requestId = ++this.nextRequestId;
    return new Promise<CombatRunResult>((resolve, reject) => {
      this.active = { requestId, reject };

      const settle = () => {
        if (this.active?.requestId === requestId) {
          this.active = undefined;
        }
      };

      worker.onmessage = (event: MessageEvent<CombatWorkerResponse>) => {
        if (event.data.requestId !== requestId) return;
        settle();
        if (event.data.type === 'result') {
          this.calibration = event.data.result.diagnostics.calibration;
          resolve(event.data.result);
        } else {
          reject(new Error(event.data.message));
        }
      };
      worker.onerror = (event) => {
        event.preventDefault();
        settle();
        this.discardWorker();
        reject(new Error(event.message || 'Combat worker failed'));
      };

      const request: CombatWorkerRequest = {
        type: 'run',
        requestId,
        fleets: Array.from(fleets),
        calibration: this.calibration,
      };
      try {
        worker.postMessage(request);
      } catch (error) {
        settle();
        this.discardWorker();
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
    this.discardWorker();
    active.reject(new CombatCancelledError());
  }

  dispose() {
    this.cancel();
    this.discardWorker();
    this.inlineFallback.dispose();
  }

  private createWorker(): Worker {
    return new Worker(new URL('../combat-worker.js', import.meta.url), {
      type: 'module',
    });
  }

  private discardWorker() {
    this.worker?.terminate();
    this.worker = undefined;
  }
}

// Tests and browsers without Worker support retain the same combat contract.
// Production browsers use BrowserCombatClient so expensive work stays off the
// main thread.
export class InlineCombatClient implements CombatClient {
  private generation = 0;
  private calibration: SolverCalibration = DEFAULT_CALIBRATION;

  async run(fleets: readonly CombatFleetInput[]): Promise<CombatRunResult> {
    const generation = ++this.generation;
    const result = new CombatRunner().run(
      buildEngineFleets(fleets),
      this.calibration
    );
    if (generation !== this.generation) throw new CombatCancelledError();
    this.calibration = result.diagnostics.calibration;
    return result;
  }

  cancel() {
    this.generation++;
  }

  dispose() {
    this.cancel();
  }
}
