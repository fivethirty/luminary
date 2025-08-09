export const DICE_VALUES = {
  HIT: 6,
  MISS: 1,
  RIFT_SELF_DAMAGE: 1,
  RIFT_MISS_1: 2,
  RIFT_MISS_2: 3,
};

export const HIT_AFTER_MODIFIERS = 6;

export const GREEDY_ALGORITHM_FALLBACK_N_SHOTS = 22;

export const GUARANTEED_HIT = () => DICE_VALUES.HIT;
export const GUARANTEED_MISS = () => DICE_VALUES.MISS;
export const RIFT_SELF_DAMAGE = () => DICE_VALUES.RIFT_SELF_DAMAGE;
export const RIFT_MISS = () => DICE_VALUES.RIFT_MISS_1;

export enum DAMAGE_PRIORTY {
  NPC = 1,
  DPS,
}
