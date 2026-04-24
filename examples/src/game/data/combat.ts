/**
 * combat.ts — Combat rules and damage formulas.
 *
 * Pure functions. No anod imports.
 * All randomness uses Math.random() for simplicity.
 */

import {
  CLASS_WARRIOR,
  CLASS_MAGE,
  ITEM_IRON_SWORD,
  ITEM_OAK_STAFF,
  ITEM_RUSTY_DAGGER,
  ITEM_SILVER_AMULET,
  ITEM_ENCHANTED_RING,
} from "./constants.ts";

export interface CombatantStats {
  hp: number;
  damage: number;
  defense: number;
  critChance: number;
  critMultiplier: number;
}

export interface TurnResult {
  damage: number;
  blocked: number;
  crit: boolean;
  actualDamage: number;
}

export interface FleeResult {
  escaped: boolean;
  hpCost: number;
}

/** Get the Warden's combat stats. */
export function getWardenStats(): CombatantStats {
  return {
    hp: 150,
    damage: 12,
    defense: 5,
    critChance: 0.15,
    critMultiplier: 2,
  };
}

/**
 * Get the player's base combat stats from their class.
 * Does not account for equipment — that's layered on via getWeaponDamage/getDefenseBonus.
 */
export function getPlayerBaseStats(classId: number): CombatantStats {
  if (classId === CLASS_WARRIOR) {
    return {
      hp: 100,
      damage: 15,
      defense: 3,
      critChance: 0.1,
      critMultiplier: 2,
    };
  }
  if (classId === CLASS_MAGE) {
    return {
      hp: 100,
      damage: 10,
      defense: 2,
      critChance: 0.3,
      critMultiplier: 2,
    };
  }
  return {
    hp: 100,
    damage: 8,
    defense: 1,
    critChance: 0.45,
    critMultiplier: 2,
  };
}

/** Get the bonus damage from a weapon item ID. */
export function getWeaponDamage(itemId: number): number {
  if (itemId === ITEM_IRON_SWORD) {
    return 15;
  }
  if (itemId === ITEM_OAK_STAFF) {
    return 10;
  }
  if (itemId === ITEM_RUSTY_DAGGER) {
    return 8;
  }
  return 0;
}

/** Get the defense bonus from an accessory item ID. */
export function getDefenseBonus(itemId: number): number {
  if (itemId === ITEM_SILVER_AMULET) {
    return 5;
  }
  return 0;
}

/** Get crit chance bonus from an accessory item ID. */
export function getCritBonus(itemId: number): number {
  if (itemId === ITEM_ENCHANTED_RING) {
    return 0.1;
  }
  return 0;
}

/**
 * Calculate total damage for an attacker with a given class and weapon.
 * Base damage (from class) + weapon damage.
 */
export function calculateDamage(classId: number, weaponId: number): number {
  const base = getPlayerBaseStats(classId);
  return base.damage + getWeaponDamage(weaponId);
}

/** Calculate total defense from base class defense + equipment. */
export function calculateDefense(classId: number, equipmentIds: number[]): number {
  let defense = getPlayerBaseStats(classId).defense;
  for (let i = 0; i < equipmentIds.length; i++) {
    defense += getDefenseBonus(equipmentIds[i]);
  }
  return defense;
}

/**
 * Resolve a single combat turn.
 * Returns the raw damage, blocked amount, whether it was a crit, and actual damage dealt.
 */
export function resolveTurn(
  attackerDamage: number,
  attackerCritChance: number,
  attackerCritMultiplier: number,
  defenderDefense: number,
): TurnResult {
  const crit = Math.random() < attackerCritChance;
  const rawDamage = crit ? Math.floor(attackerDamage * attackerCritMultiplier) : attackerDamage;
  const blocked = Math.min(defenderDefense, rawDamage);
  const actualDamage = rawDamage - blocked;
  return { damage: rawDamage, blocked, crit, actualDamage };
}

/**
 * Resolve a flee attempt.
 * Smoke bomb = free escape. Without one, the Warden gets a parting strike (10 HP).
 */
export function resolveFlee(hasSmokeBomb: boolean): FleeResult {
  if (hasSmokeBomb) {
    return { escaped: true, hpCost: 0 };
  }
  return { escaped: true, hpCost: 10 };
}

/** Check if a combatant is defeated. */
export function isDefeated(health: number): boolean {
  return health <= 0;
}
