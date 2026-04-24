/**
 * inventory.ts — One named function per anod-list method.
 *
 * Every list mutation and read method is wrapped in a game-themed helper.
 * A reader can grep for any list method name and find its usage here.
 *
 * Mutation methods modify the inventory in place and notify subscribers.
 * Read methods return bound Compute nodes that auto-update when inventory changes.
 */

import type { GameState } from "./state.ts";
import { getItemById, formatItemName, type Item } from "../data/items.ts";
import {
  TYPE_WEAPON,
  TYPE_CONSUMABLE,
  ITEM_HEALTH_POTION,
  ITEM_GREATER_POTION,
  ITEM_STALE_BREAD,
} from "../data/constants.ts";

// ─── Mutation Methods (9) ────────────────────────────────────────────

/**
 * push() — Add an item to the end of the inventory.
 * Used when buying items, picking up loot, receiving quest rewards.
 */
export function pickUpItem(state: GameState, itemId: number): void {
  state.inventory.push(itemId);
}

/**
 * pop() — Remove and return the last item in the inventory.
 * Used for "discard last item" in shop management.
 */
export function discardLastItem(state: GameState): number | undefined {
  return state.inventory.pop();
}

/**
 * shift() — Remove and return the first item in the inventory.
 * Used for "use first item" quick-action.
 */
export function useFirstItem(state: GameState): number | undefined {
  return state.inventory.shift();
}

/**
 * unshift() — Add an item to the front of the inventory.
 * Used for "priority equip" — puts important items first.
 */
export function addPriorityItem(state: GameState, itemId: number): void {
  state.inventory.unshift(itemId);
}

/**
 * splice() — Remove items at a position, optionally insert replacements.
 * Used for equipping items at specific inventory slots.
 */
export function equipItemAtSlot(state: GameState, fromIndex: number, toIndex: number): void {
  const items = state.inventory.get();
  const item = items[fromIndex];
  if (item === undefined) {
    return;
  }
  state.inventory.splice(fromIndex, 1);
  state.inventory.splice(toIndex > fromIndex ? toIndex - 1 : toIndex, 0, item);
}

/**
 * sort() — Sort inventory items by their gold value (ascending).
 * Used in shop to organize bag before selling.
 */
export function sortByValue(state: GameState): void {
  state.inventory.sort((a: number, b: number) => {
    const itemA = getItemById(a);
    const itemB = getItemById(b);
    const valueA = itemA !== undefined ? itemA.value : 0;
    const valueB = itemB !== undefined ? itemB.value : 0;
    return valueA - valueB;
  });
}

/**
 * reverse() — Reverse the inventory order.
 * Used as a toggle with sort — sort ascending, then reverse for descending.
 */
export function reverseOrder(state: GameState): void {
  state.inventory.reverse();
}

/**
 * fill() — Fill all inventory slots with a value.
 * Used for "clear bag" — fills with 0 (empty slot marker), then re-adds starter items.
 */
export function clearAllSlots(state: GameState): void {
  state.inventory.fill(0);
}

/**
 * copyWithin() — Copy items within the inventory array.
 * Used for "rearrange items" — duplicate a section of the bag layout.
 */
export function rearrangeItems(
  state: GameState,
  target: number,
  start: number,
  end?: number,
): void {
  state.inventory.copyWithin(target, start, end);
}

// ─── Read Methods (25) ───────────────────────────────────────────────

/**
 * at() — Get item at a specific inventory slot.
 * Returns a bound Compute that updates when inventory changes.
 */
export function getItemAtSlot(state: GameState, index: number) {
  return state.inventory.at(index);
}

/**
 * concat() — Merge inventory with external loot array.
 * Returns a bound Compute of the combined arrays (doesn't mutate inventory).
 */
export function mergeWithLoot(state: GameState, loot: number[]) {
  return state.inventory.concat(loot);
}

/**
 * entries() — Iterate inventory with [index, itemId] pairs.
 * Returns a bound Compute of the entries iterator.
 */
export function iterateWithIndices(state: GameState) {
  return state.inventory.entries();
}

/**
 * every() — Check if all inventory items match a condition.
 * Used to check if all items are "identified" (non-zero).
 */
export function areAllIdentified(state: GameState) {
  return state.inventory.every((id: number) => id !== 0);
}

/**
 * filter() — Get only weapons from inventory.
 * Returns a bound Compute of weapon item IDs.
 */
export function getWeapons(state: GameState) {
  return state.inventory.filter((id: number) => {
    const item = getItemById(id);
    return item !== undefined && item.type === TYPE_WEAPON;
  });
}

/**
 * find() — Find a specific item by ID in the inventory.
 * Returns a bound Compute of the found item ID or undefined.
 */
export function findItemById(state: GameState, targetId: number) {
  return state.inventory.find((id: number) => id === targetId);
}

/**
 * findIndex() — Find the slot number of a specific item.
 * Returns a bound Compute of the index (-1 if not found).
 */
export function findItemSlot(state: GameState, targetId: number) {
  return state.inventory.findIndex((id: number) => id === targetId);
}

/**
 * findLast() — Find the last consumable in the inventory.
 * Useful for using the most recently acquired potion first.
 */
export function findLastPotion(state: GameState) {
  return state.inventory.findLast((id: number) => {
    const item = getItemById(id);
    return item !== undefined && item.type === TYPE_CONSUMABLE;
  });
}

/**
 * findLastIndex() — Find the slot of the last weapon.
 * Returns a bound Compute of the last weapon's index.
 */
export function findLastWeaponSlot(state: GameState) {
  return state.inventory.findLastIndex((id: number) => {
    const item = getItemById(id);
    return item !== undefined && item.type === TYPE_WEAPON;
  });
}

/**
 * flat() — Flatten nested item arrays (for unpacking bundles).
 * In our case, inventory is already flat, but this demonstrates the API.
 */
export function flattenCategories(state: GameState) {
  return state.inventory.flat();
}

/**
 * flatMap() — Map each item to its components, then flatten.
 * Demonstrates breaking composite items into parts.
 */
export function extractSubItems(state: GameState) {
  return state.inventory.flatMap((id: number) => {
    const item = getItemById(id);
    if (item === undefined) {
      return [];
    }
    return [id];
  });
}

/**
 * forEach() — Render each inventory item.
 * Returns an Effect (not a Compute) — side-effectful iteration.
 * The callback is called for each item whenever the inventory changes.
 */
export function renderEachItem(state: GameState, callback: (id: number, index: number) => void) {
  return state.inventory.forEach(callback);
}

/**
 * includes() — Check if inventory contains a specific item.
 * Returns a bound Compute boolean.
 */
export function hasItem(state: GameState, itemId: number) {
  return state.inventory.includes(itemId);
}

/**
 * indexOf() — Find the first slot containing a specific item.
 * Returns a bound Compute of the index.
 */
export function getSlotNumber(state: GameState, itemId: number) {
  return state.inventory.indexOf(itemId);
}

/**
 * join() — Format inventory as a comma-separated string.
 * Returns a bound Compute string.
 */
export function formatAsText(state: GameState) {
  return state.inventory.join(", ");
}

/**
 * keys() — Iterate slot numbers (indices).
 * Returns a bound Compute of the keys iterator.
 */
export function iterateSlotNumbers(state: GameState) {
  return state.inventory.keys();
}

/**
 * map() — Transform item IDs to display name strings.
 * Returns a bound Compute of name strings.
 */
export function toDisplayStrings(state: GameState) {
  return state.inventory.map((id: number) => formatItemName(id));
}

/**
 * reduce() — Calculate total weight of all inventory items.
 * Returns a bound Compute number.
 */
export function calculateTotalWeight(state: GameState) {
  return state.inventory.reduce((total: number, id: number) => {
    const item = getItemById(id);
    return total + (item !== undefined ? item.weight : 0);
  }, 0);
}

/**
 * reduceRight() — Calculate reverse-priority score (later items worth more).
 * Returns a bound Compute number. Demonstrates right-to-left reduction.
 */
export function calculateReversePriority(state: GameState) {
  return state.inventory.reduceRight((score: number, id: number, index: number) => {
    const item = getItemById(id);
    return score + (item !== undefined ? item.value * (index + 1) : 0);
  }, 0);
}

/**
 * slice() — Get a page of inventory items (for paginated display).
 * Returns a bound Compute of the sliced array.
 */
export function getPage(state: GameState, start: number, end: number) {
  return state.inventory.slice(start, end);
}

/**
 * some() — Check if inventory contains any healing items.
 * Returns a bound Compute boolean.
 */
export function hasAnyHealing(state: GameState) {
  return state.inventory.some(
    (id: number) =>
      id === ITEM_HEALTH_POTION || id === ITEM_GREATER_POTION || id === ITEM_STALE_BREAD,
  );
}

/**
 * values() — Iterate item IDs.
 * Returns a bound Compute of the values iterator.
 */
export function iterateValues(state: GameState) {
  return state.inventory.values();
}
