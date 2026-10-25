export const DICE_VALUES = {
  HIT: 6,
  MISS: 1,
  RIFT_SELF_DAMAGE: 1,
  RIFT_MISS_1: 2,
  RIFT_MISS_2: 3,
  NUM_SIDES: 6,
};

export const HIT_AFTER_MODIFIERS = 6;

// Expected target damage of one rift die: its faces deal 1, 2 and 3 damage
// and three faces deal none, whatever the computers and shields.
export const EXPECTED_RIFT_DIE_DAMAGE = 1;

export const GUARANTEED_HIT = () => DICE_VALUES.HIT;
export const GUARANTEED_MISS = () => DICE_VALUES.MISS;
export const RIFT_SELF_DAMAGE = () => DICE_VALUES.RIFT_SELF_DAMAGE;
export const RIFT_MISS = () => DICE_VALUES.RIFT_MISS_1;

export enum DamageType {
  NPC = 'npc',
  DPS = 'dps',
  OPTIMAL = 'optimal',
}
