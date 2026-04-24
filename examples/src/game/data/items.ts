/**
 * items.ts — Item catalog and pure helper functions.
 *
 * Every item is a plain object with numeric fields.
 * No anod imports — this is pure game data.
 */

import {
  ITEM_IRON_SWORD,
  ITEM_OAK_STAFF,
  ITEM_RUSTY_DAGGER,
  ITEM_HEALTH_POTION,
  ITEM_GREATER_POTION,
  ITEM_TOWER_KEY,
  ITEM_SILVER_AMULET,
  ITEM_TORCH,
  ITEM_LOCKPICK_SET,
  ITEM_WARDENS_CREST,
  ITEM_BAG_OF_GEMS,
  ITEM_STALE_BREAD,
  ITEM_ROPE,
  ITEM_ENCHANTED_RING,
  ITEM_SMOKE_BOMB,
  TYPE_WEAPON,
  TYPE_CONSUMABLE,
  TYPE_QUEST,
  TYPE_ACCESSORY,
  TYPE_TOOL,
  TYPE_LOOT,
} from "./constants.ts";

export interface Item {
  id: number;
  name: string;
  type: number;
  weight: number;
  value: number;
  description: string;
}

/** Master item catalog — indexed by item ID for O(1) lookup. */
const ITEMS: Item[] = [];

function defineItem(
  id: number,
  name: string,
  type: number,
  weight: number,
  value: number,
  description: string,
): void {
  ITEMS[id] = { id, name, type, weight, value, description };
}

defineItem(
  ITEM_IRON_SWORD,
  "Iron Sword",
  TYPE_WEAPON,
  5,
  30,
  "+15 damage. A warrior's trusted blade.",
);
defineItem(ITEM_OAK_STAFF, "Oak Staff", TYPE_WEAPON, 3, 25, "+10 damage. Channels arcane energy.");
defineItem(ITEM_RUSTY_DAGGER, "Rusty Dagger", TYPE_WEAPON, 2, 15, "+8 damage. Quick and quiet.");
defineItem(ITEM_HEALTH_POTION, "Health Potion", TYPE_CONSUMABLE, 1, 10, "Restores 25 HP.");
defineItem(ITEM_GREATER_POTION, "Greater Potion", TYPE_CONSUMABLE, 1, 25, "Restores 50 HP.");
defineItem(
  ITEM_TOWER_KEY,
  "Tower Key",
  TYPE_QUEST,
  0,
  0,
  "A heavy iron key. Opens the Signal Tower.",
);
defineItem(
  ITEM_SILVER_AMULET,
  "Silver Amulet",
  TYPE_ACCESSORY,
  1,
  40,
  "+5 defense. Glows faintly.",
);
defineItem(ITEM_TORCH, "Torch", TYPE_CONSUMABLE, 2, 5, "Lights dark areas.");
defineItem(ITEM_LOCKPICK_SET, "Lockpick Set", TYPE_TOOL, 1, 20, "Opens locked chests.");
defineItem(
  ITEM_WARDENS_CREST,
  "Warden's Crest",
  TYPE_QUEST,
  0,
  0,
  "Proof of victory over the Warden.",
);
defineItem(
  ITEM_BAG_OF_GEMS,
  "Bag of Gems",
  TYPE_LOOT,
  3,
  100,
  "Sparkling gems from the tower vault.",
);
defineItem(
  ITEM_STALE_BREAD,
  "Stale Bread",
  TYPE_CONSUMABLE,
  1,
  2,
  "Restores 5 HP. Better than nothing.",
);
defineItem(ITEM_ROPE, "Rope", TYPE_TOOL, 2, 8, "Useful for climbing.");
defineItem(ITEM_ENCHANTED_RING, "Enchanted Ring", TYPE_ACCESSORY, 0, 60, "+10% crit chance.");
defineItem(ITEM_SMOKE_BOMB, "Smoke Bomb", TYPE_CONSUMABLE, 1, 15, "Escape combat without penalty.");

/** Look up an item by its numeric ID. Returns the item or undefined. */
export function getItemById(id: number): Item | undefined {
  return ITEMS[id];
}

/** Get all items that match a given type constant. */
export function getItemsByType(type: number): Item[] {
  const result: Item[] = [];
  for (let i = 0; i < ITEMS.length; i++) {
    if (ITEMS[i] !== undefined && ITEMS[i].type === type) {
      result.push(ITEMS[i]);
    }
  }
  return result;
}

/** Sum the weight of an array of item IDs. */
export function calculateWeight(itemIds: number[]): number {
  let total = 0;
  for (let i = 0; i < itemIds.length; i++) {
    const item = ITEMS[itemIds[i]];
    if (item !== undefined) {
      total += item.weight;
    }
  }
  return total;
}

/** Format an item's display name. Returns "Unknown Item" for invalid IDs. */
export function formatItemName(itemId: number): string {
  const item = ITEMS[itemId];
  if (item === undefined) {
    return "Unknown Item";
  }
  return item.name;
}

/**
 * Get the healing amount for a consumable item.
 * Returns 0 for non-healing items.
 */
export function getHealingAmount(itemId: number): number {
  if (itemId === ITEM_HEALTH_POTION) {
    return 25;
  }
  if (itemId === ITEM_GREATER_POTION) {
    return 50;
  }
  if (itemId === ITEM_STALE_BREAD) {
    return 5;
  }
  return 0;
}

/** Items available for sale in Grit's shop. */
export const SHOP_INVENTORY: number[] = [
  ITEM_HEALTH_POTION,
  ITEM_GREATER_POTION,
  ITEM_TOWER_KEY,
  ITEM_SILVER_AMULET,
  ITEM_TORCH,
  ITEM_LOCKPICK_SET,
  ITEM_STALE_BREAD,
  ITEM_ROPE,
  ITEM_ENCHANTED_RING,
  ITEM_SMOKE_BOMB,
];

/** Get the starter weapon ID for a given class. */
export function getStarterWeapon(classId: number): number {
  if (classId === 1) {
    return ITEM_IRON_SWORD;
  }
  if (classId === 2) {
    return ITEM_OAK_STAFF;
  }
  return ITEM_RUSTY_DAGGER;
}
