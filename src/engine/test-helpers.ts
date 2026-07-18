import { Ship, ShipConfig, ShipType } from './ship';

export function ship(
  config: ShipConfig = {},
  type: ShipType = ShipType.Interceptor,
  rollD6?: () => number
): Ship {
  return rollD6 ? new Ship(type, config, rollD6) : new Ship(type, config);
}
