/** Shared semantic classes for full results and the sticky live summary. */
export function resultClassesForFleet(
  fleetIndex: number | null,
  isDraw = false
): string[] {
  if (isDraw) return ['draw-result'];
  if (fleetIndex === 0) return ['defender-result'];
  if (fleetIndex !== null && fleetIndex > 1) {
    return ['attacker-result', `attacker-result-${Math.min(fleetIndex, 4)}`];
  }
  return ['attacker-result'];
}

export function resultClassNameForFleet(
  fleetIndex: number | null,
  isDraw = false
): string {
  return resultClassesForFleet(fleetIndex, isDraw).join(' ');
}
