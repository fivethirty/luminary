import { ShipType } from '@calc/ship';
import {
  SHIP_ABBREVIATIONS,
  SHIP_NAMES,
  type ShipDropdownOption,
} from '@ui/ship-presets';

const SHIP_TYPE_ABBREVIATIONS = Object.fromEntries(
  (Object.keys(SHIP_NAMES) as ShipDropdownOption[]).map((key) => [
    SHIP_NAMES[key],
    SHIP_ABBREVIATIONS[key],
  ])
) as Record<string, string>;

const PLAYER_COMPOSITION_ORDER = new Map<string, number>(
  [
    ShipType.Dreadnought,
    ShipType.Cruiser,
    ShipType.Interceptor,
    ShipType.Orbital,
    ShipType.Starbase,
  ].map((type, index) => [type, index])
);

function compositionShipOrder(type: string): number {
  return PLAYER_COMPOSITION_ORDER.get(type) ?? Number.MAX_SAFE_INTEGER;
}

export function formatCompactFleetComposition(
  composition: Readonly<Record<string, number>> | undefined,
  abbreviationOverrides: Readonly<Record<string, string>> = {}
): string {
  if (!composition) return '—';

  const entries = Object.entries(composition)
    .filter(([, count]) => count > 0)
    .sort(([left], [right]) => {
      const orderDelta =
        compositionShipOrder(left) - compositionShipOrder(right);
      return orderDelta || left.localeCompare(right);
    });
  if (entries.length === 0) return '—';

  return entries
    .map(([type, count]) => {
      const label =
        abbreviationOverrides[type] ?? SHIP_TYPE_ABBREVIATIONS[type] ?? type;
      return count === 1 ? label : `${count}${label}`;
    })
    .join(',');
}
