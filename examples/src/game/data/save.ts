/**
 * save.ts — Pure serialization/deserialization for game state.
 *
 * No anod imports. Handles converting game state to/from JSON.
 */

import { SAVE_KEY, SAVE_VERSION } from "./constants.ts";

export interface SaveData {
  version: number;
  timestamp: number;
  playerName: string;
  playerClass: number;
  health: number;
  maxHealth: number;
  gold: number;
  currentScene: number;
  chapter: number;
  inventory: number[];
  questLog: number[];
  visitedScenes: number[];
}

/** Serialize a plain state object to a JSON string. */
export function serializeState(data: SaveData): string {
  return JSON.stringify(data);
}

/** Deserialize a JSON string to a state object. Returns null on invalid JSON. */
export function deserializeState(json: string): SaveData | null {
  try {
    return JSON.parse(json) as SaveData;
  } catch {
    return null;
  }
}

/**
 * Validate that a deserialized save has the correct structure and version.
 * Checks for required fields and correct version number.
 */
export function validateSaveData(data: unknown): data is SaveData {
  if (data === null || typeof data !== "object") {
    return false;
  }
  const d = data as Record<string, unknown>;
  if (d.version !== SAVE_VERSION) {
    return false;
  }
  if (typeof d.playerName !== "string") {
    return false;
  }
  if (typeof d.playerClass !== "number") {
    return false;
  }
  if (typeof d.health !== "number") {
    return false;
  }
  if (typeof d.gold !== "number") {
    return false;
  }
  if (typeof d.currentScene !== "number") {
    return false;
  }
  if (typeof d.chapter !== "number") {
    return false;
  }
  if (!Array.isArray(d.inventory)) {
    return false;
  }
  if (!Array.isArray(d.questLog)) {
    return false;
  }
  if (!Array.isArray(d.visitedScenes)) {
    return false;
  }
  return true;
}

/** Read raw save string from localStorage. */
export function readSaveFromStorage(): string | null {
  try {
    return localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
}

/** Write raw save string to localStorage. */
export function writeSaveToStorage(json: string): void {
  try {
    localStorage.setItem(SAVE_KEY, json);
  } catch {
    /* Storage full or blocked — silently fail. */
  }
}

/** Delete save from localStorage. */
export function deleteSaveFromStorage(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* Silently fail. */
  }
}
