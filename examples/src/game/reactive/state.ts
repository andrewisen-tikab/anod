/**
 * state.ts — All reactive game state, each in a named helper.
 *
 * This file is the single source of truth for all game signals.
 * Each factory function documents WHY that particular anod primitive was chosen.
 */

import { signal, relay, list } from "anod";
import { SCENE_ARRIVAL, CH_PROLOGUE } from "../data/constants.ts";

/**
 * The complete game state, created fresh for each playthrough.
 * Every field is a reactive node — signals for scalars, lists for arrays.
 */
export interface GameState {
  playerName: any;
  playerClass: any;
  health: any;
  maxHealth: any;
  gold: any;
  currentScene: any;
  chapter: any;
  gameLog: any;
  inventory: any;
  questLog: any;
  visitedScenes: any;
}

/**
 * signal("") — Player name starts empty, set once during SCENE_ARRIVAL.
 * We use signal() because the name changes exactly once and we want
 * equality-based notification (no re-render if set to the same name).
 */
export function createPlayerName() {
  return signal("");
}

/**
 * signal(0) — Player class is set once during SCENE_CLASS_SELECT.
 * Using a number (CLASS_WARRIOR=1, CLASS_MAGE=2, CLASS_ROGUE=3)
 * instead of a string, per project allocation rules.
 */
export function createPlayerClass() {
  return signal(0);
}

/**
 * signal(100) — Health is a simple numeric value that changes frequently
 * during combat. signal() with equality check avoids redundant re-renders
 * when healing would set HP to the same capped value.
 */
export function createHealth() {
  return signal(100);
}

/**
 * signal(100) — Max health cap. Could increase with items/leveling.
 * Separate from health so computes can derive the health bar percentage.
 */
export function createMaxHealth() {
  return signal(100);
}

/**
 * signal(50) — Gold starts at 50 (given by Maren).
 * Changes on buy/sell/chest loot. signal() so UI doesn't re-render
 * when a transaction would leave gold unchanged.
 */
export function createGold() {
  return signal(50);
}

/**
 * signal(SCENE_ARRIVAL) — Tracks which scene is currently displayed.
 * The core navigation signal — effects bound to this drive scene rendering.
 */
export function createCurrentScene() {
  return signal(SCENE_ARRIVAL);
}

/**
 * signal(CH_PROLOGUE) — Tracks the current chapter.
 * Used for chapter-level disposal, save system, and status bar display.
 */
export function createChapter() {
  return signal(CH_PROLOGUE);
}

/**
 * relay([]) — The game log is a mutable array that we push() into.
 * We use relay() instead of signal() because we mutate the same array
 * reference and need notification on every push, not just reference changes.
 */
export function createGameLog() {
  return relay([]);
}

/**
 * list([]) — Inventory is a reactive array of item IDs.
 * We use list() to get reactive array methods: push, pop, splice, filter,
 * map, reduce, etc. This is the primary exercise target for anod-list.
 */
export function createInventory() {
  return list([]);
}

/**
 * list([]) — Quest log is a reactive array of quest IDs.
 * Using list() so we can use reactive read methods (map, reduce, every, some)
 * in the epilogue summary scene.
 */
export function createQuestLog() {
  return list([]);
}

/**
 * list([]) — Tracks scene IDs the player has visited.
 * Used for save system and conditional scene choices.
 */
export function createVisitedScenes() {
  return list([]);
}

/**
 * Create a fresh game state with all reactive nodes initialized.
 * Called at game start and on "New Game".
 */
export function createGameState(): GameState {
  return {
    playerName: createPlayerName(),
    playerClass: createPlayerClass(),
    health: createHealth(),
    maxHealth: createMaxHealth(),
    gold: createGold(),
    currentScene: createCurrentScene(),
    chapter: createChapter(),
    gameLog: createGameLog(),
    inventory: createInventory(),
    questLog: createQuestLog(),
    visitedScenes: createVisitedScenes(),
  };
}
