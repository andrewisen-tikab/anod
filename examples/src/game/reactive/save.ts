/**
 * save.ts — Reactive save/restore wiring.
 *
 * Demonstrates: effect(fn) unbound auto-save, batch() atomic restore,
 * get() for reading, peek() for reading without triggering re-save.
 */

import { batch } from "anod";
import type { GameState } from "./state.ts";
import { SAVE_VERSION } from "../data/constants.ts";
import {
  type SaveData,
  serializeState,
  deserializeState,
  validateSaveData,
  readSaveFromStorage,
  writeSaveToStorage,
  deleteSaveFromStorage,
} from "../data/save.ts";

/**
 * effect(fn) — Unbound auto-save effect.
 * Watches currentScene and chapter signals. On every scene transition,
 * serializes the full game state to localStorage.
 * Uses peek() for game log (don't want log changes to trigger re-save).
 */
export function createAutoSave(owner: any, state: GameState) {
  return owner.effect((c: any) => {
    /** These reads create subscriptions — auto-save fires when they change. */
    const currentScene = c.val(state.currentScene);
    const chapter = c.val(state.chapter);

    /** These use peek() — we read the values but don't subscribe to them.
     *  We only want to save when scenes change, not when log/gold/HP change. */
    const data: SaveData = {
      version: SAVE_VERSION,
      timestamp: Date.now(),
      playerName: c.peek(state.playerName),
      playerClass: c.peek(state.playerClass),
      health: c.peek(state.health),
      maxHealth: c.peek(state.maxHealth),
      gold: c.peek(state.gold),
      currentScene: currentScene,
      chapter: chapter,
      inventory: c.peek(state.inventory),
      questLog: c.peek(state.questLog),
      visitedScenes: c.peek(state.visitedScenes),
    };

    const json = serializeState(data);
    writeSaveToStorage(json);
  });
}

/**
 * Load a save from localStorage.
 * Returns the deserialized state or null if no valid save exists.
 */
export function loadSave(): SaveData | null {
  const raw = readSaveFromStorage();
  if (raw === null) {
    return null;
  }
  const data = deserializeState(raw);
  if (data === null) {
    return null;
  }
  if (!validateSaveData(data)) {
    return null;
  }
  return data;
}

/**
 * batch() — Atomically restore all game state from a save.
 * Uses signal.set() for each scalar and signal.set(array) for lists.
 * The batch ensures all effects fire once after all values are set.
 */
export function restoreState(state: GameState, data: SaveData): void {
  batch(() => {
    state.playerName.set(data.playerName);
    state.playerClass.set(data.playerClass);
    state.health.set(data.health);
    state.maxHealth.set(data.maxHealth);
    state.gold.set(data.gold);
    state.currentScene.set(data.currentScene);
    state.chapter.set(data.chapter);
    state.inventory.set(data.inventory.slice());
    state.questLog.set(data.questLog.slice());
    state.visitedScenes.set(data.visitedScenes.slice());
  });
}

/** Delete the save from localStorage. */
export function deleteSave(): void {
  deleteSaveFromStorage();
}

/** Check if a valid save exists in localStorage. */
export function hasSave(): boolean {
  return loadSave() !== null;
}
