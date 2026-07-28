import { CombatRunner } from '@calc/combat-runner';
import {
  type CombatWorkerRequest,
  type CombatWorkerResponse,
} from '@ui/combat-client';
import { buildEngineFleets } from '@ui/combat-fleets';

type WorkerScope = {
  onmessage: ((event: MessageEvent<CombatWorkerRequest>) => void) | null;
  postMessage(message: CombatWorkerResponse): void;
};

const workerScope = globalThis as unknown as WorkerScope;

workerScope.onmessage = (event) => {
  if (event.data.type !== 'run') return;

  const { requestId, fleets } = event.data;
  try {
    const result = new CombatRunner().run(buildEngineFleets(fleets));
    workerScope.postMessage({
      type: 'result',
      requestId,
      result,
    });
  } catch (error) {
    workerScope.postMessage({
      type: 'error',
      requestId,
      message:
        error instanceof Error ? error.message : 'Combat calculation failed',
    });
  }
};
