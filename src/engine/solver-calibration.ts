/**
 * Device speed probe for the interactive runner: one fixed reference battle
 * solved the way real requests solve, so its time on this device relative to
 * the development machine scales cost predictions. It is fleet-invariant by
 * construction, unlike the cost of the request's own solve, which varies
 * several-fold between fleet types (rift self-damage, missile tails) for the
 * same amount of counted work.
 */
import { DamageType } from 'src/constants';
import { BattleModel } from './battle-state';
import { Ship, ShipType } from './ship';
import { DEFAULT_CAPS, WinProbabilitySolver } from './win-probability-solver';

// Warm time of the reference probe on the development machine (Apple M3 Max,
// bun 1.2.19): 12.4 ms median, 10.4 to 13.0 across warm runs; the first run
// in a fresh process is about 27 ms, the second about 17 ms.
export const REFERENCE_PROBE_MILLIS = 12.4;
// The probe is solved this many times; the fastest run is the warm speed.
const PROBE_RUNS = 3;

function referenceFleet(): Ship[] {
  return [
    ...Array.from(
      { length: 4 },
      () =>
        new Ship(ShipType.Interceptor, { initiative: 3, cannons: { ion: 1 } })
    ),
    ...Array.from(
      { length: 2 },
      () =>
        new Ship(ShipType.Cruiser, {
          initiative: 2,
          hull: 1,
          cannons: { ion: 1 },
        })
    ),
  ];
}

// Solves the 4-interceptor, 2-cruiser optimal mirror (dice enumeration,
// candidate enumeration, planner memo, canonical codes, and the component
// solver all take part) and returns the fastest of PROBE_RUNS solves in ms.
export function measureReferenceProbe(
  now: () => number = () => performance.now()
): number {
  let fastest = Infinity;
  for (let run = 0; run < PROBE_RUNS; run++) {
    const model = new BattleModel(
      referenceFleet(),
      referenceFleet(),
      false,
      false,
      DamageType.OPTIMAL,
      DamageType.OPTIMAL
    );
    const started = now();
    new WinProbabilitySolver(model, {
      perspective: 'A',
      assignments: 'minimax',
      caps: { ...DEFAULT_CAPS, maxMillis: Infinity },
    }).solveOutcome();
    fastest = Math.min(fastest, now() - started);
  }
  return fastest;
}
