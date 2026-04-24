/**
 * engine.ts — Chapter lifecycle, scene transitions, and error handling.
 *
 * Demonstrates: root(), batch(), flush(), dispose(), recover(), refuse(), panic(),
 * REFUSE, PANIC, FATAL error constants, and owned node creation via root scope.
 */

import { root, batch, flush, REFUSE, PANIC, FATAL } from "anod";
import type { GameState } from "./state.ts";
import { getChapterForScene } from "../data/scenes.ts";

/** Chapter root scopes, indexed by chapter ID. */
let activeChapterRoot: ReturnType<typeof root> | null = null;

// ─── Ownership & Disposal ────────────────────────────────────────────

/**
 * root(fn) — Create a chapter-level ownership scope.
 * All signals, effects, computes, and tasks created within the callback
 * are owned by this root and will be disposed when the chapter ends.
 */
export function createChapterScope(fn: (r: any) => void): ReturnType<typeof root> {
  const chapterRoot = root(fn);
  activeChapterRoot = chapterRoot;
  return chapterRoot;
}

/**
 * root.dispose() — Dispose a chapter's ownership scope.
 * Recursively disposes all owned nodes, runs cleanup functions,
 * and cancels any pending async tasks/spawns.
 */
export function disposeChapter(): void {
  if (activeChapterRoot !== null) {
    activeChapterRoot.dispose();
    activeChapterRoot = null;
  }
}

/**
 * Replay a chapter: dispose the current root and recreate it.
 * This is the mechanism for the "Replay Chapter" button after defeat.
 */
export function replayChapter(
  state: GameState,
  chapterId: number,
  setupFn: (r: any, state: GameState) => void,
): void {
  disposeChapter();
  createChapterScope((r) => setupFn(r, state));
}

/**
 * Jump to a chapter (used for save/restore).
 * Disposes any existing chapter root, creates a new one via the chapter's
 * setup function, then sets the scene signal inside a batch.
 */
export function jumpToChapter(
  state: GameState,
  chapterId: number,
  sceneId: number,
  setupFn: (r: any, state: GameState) => void,
): void {
  disposeChapter();
  batch(() => {
    state.chapter.set(chapterId);
    createChapterScope((r) => setupFn(r, state));
    state.currentScene.set(sceneId);
  });
}

// ─── Transactions ────────────────────────────────────────────────────

/**
 * batch() — Atomically transition to a new scene.
 * Updates the current scene, chapter, game log, and visited scenes
 * list all in one atomic batch so effects only fire once.
 */
export function transitionScene(state: GameState, sceneId: number, logMessage?: string): void {
  batch(() => {
    const newChapter = getChapterForScene(sceneId);
    if (newChapter !== state.chapter.get()) {
      state.chapter.set(newChapter);
    }
    state.currentScene.set(sceneId);
    /** Push to visited scenes list. */
    const visited = state.visitedScenes.get();
    if (visited.indexOf(sceneId) === -1) {
      state.visitedScenes.push(sceneId);
    }
    /** Add log message if provided. */
    if (logMessage !== undefined) {
      const log = state.gameLog.get();
      log.push(logMessage);
      state.gameLog.set(log);
    }
  });
}

/**
 * flush() — Drain all pending reactive queues.
 * Forces all scheduled effects to run immediately.
 * Used after manual signal writes outside of batch context.
 */
export function forceFlush(): void {
  flush();
}

// ─── Error Handling ──────────────────────────────────────────────────

/**
 * refuse() — Signal an expected, non-throwing error.
 * Used when a player makes an invalid choice (e.g., wrong riddle answer).
 * The compute returns the error value without throwing.
 */
export function handleInvalidAction(c: any, message: string): any {
  return c.refuse(message);
}

/**
 * panic() — Signal an expected error that throws.
 * Used when game state becomes corrupted (e.g., negative HP).
 * FLAG_PANIC distinguishes it from unexpected crashes.
 */
export function handleCorruption(c: any, message: string): void {
  c.panic(message);
}

/**
 * recover() — Register an error recovery handler on a node.
 * The handler receives the error POJO { error, type } and can:
 * - Return true to swallow the error
 * - Return false to propagate it
 * Branches on REFUSE / PANIC / FATAL to handle each case differently.
 */
export function setupErrorRecovery(c: any, onError: (message: string) => void): void {
  c.recover((err: any) => {
    if (err.type === REFUSE) {
      /** Expected error — show message to player, swallow the error. */
      onError(err.error);
      return true;
    }
    if (err.type === PANIC) {
      /** Expected corruption — log and re-throw. */
      console.error("[PANIC]", err.error);
      return false;
    }
    /** FATAL — unexpected crash. Log and propagate. */
    console.error("[FATAL]", err.error);
    return false;
  });
}

/**
 * Classify an error POJO by its type constant.
 * Returns a human-readable string for display.
 */
export function classifyError(err: any): string {
  if (err !== null && typeof err === "object") {
    if (err.type === REFUSE) {
      return "Invalid action: " + String(err.error);
    }
    if (err.type === PANIC) {
      return "Game error: " + String(err.error);
    }
    if (err.type === FATAL) {
      return "Unexpected error: " + String(err.error);
    }
  }
  return "Unknown error";
}

// ─── Owned Node Creation ─────────────────────────────────────────────

/**
 * owner.signal(val) — Create a signal owned by a root/effect scope.
 * When the owner is disposed, this signal is automatically cleaned up.
 */
export function createOwnedSignal<T>(owner: any, value: T) {
  return owner.signal(value);
}

/**
 * owner.compute(...) — Create a compute owned by a root/effect scope.
 * Automatically disposed with the owner.
 */
export function createOwnedCompute(owner: any, fn: any, seed?: any, opts?: number) {
  if (opts !== undefined) {
    return owner.compute(fn, seed, opts);
  }
  if (seed !== undefined) {
    return owner.compute(fn, seed);
  }
  return owner.compute(fn);
}

/**
 * owner.compute(dep, fn) — Create a bound compute owned by a scope.
 */
export function createOwnedBoundCompute(owner: any, dep: any, fn: any, seed?: any, opts?: number) {
  if (opts !== undefined) {
    return owner.compute(dep, fn, seed, opts);
  }
  if (seed !== undefined) {
    return owner.compute(dep, fn, seed);
  }
  return owner.compute(dep, fn);
}

/**
 * owner.task(...) — Create an async task owned by a scope.
 */
export function createOwnedTask(owner: any, fn: any, seed?: any) {
  if (seed !== undefined) {
    return owner.task(fn, seed);
  }
  return owner.task(fn);
}

/**
 * owner.task(dep, fn) — Create a bound async task owned by a scope.
 */
export function createOwnedBoundTask(owner: any, dep: any, fn: any, seed?: any) {
  if (seed !== undefined) {
    return owner.task(dep, fn, seed);
  }
  return owner.task(dep, fn);
}

/**
 * owner.effect(...) — Create an effect owned by a scope.
 */
export function createOwnedEffect(owner: any, fn: any) {
  return owner.effect(fn);
}

/**
 * owner.effect(dep, fn) — Create a bound effect owned by a scope.
 */
export function createOwnedBoundEffect(owner: any, dep: any, fn: any) {
  return owner.effect(dep, fn);
}

/**
 * owner.spawn(...) — Create an async spawn owned by a scope.
 */
export function createOwnedSpawn(owner: any, fn: any) {
  return owner.spawn(fn);
}

/**
 * owner.spawn(dep, fn) — Create a bound async spawn owned by a scope.
 */
export function createOwnedBoundSpawn(owner: any, dep: any, fn: any) {
  return owner.spawn(dep, fn);
}

/**
 * owner.root(fn) — Create a nested ownership scope within a parent.
 */
export function createNestedScope(owner: any, fn: (r: any) => void) {
  return owner.root(fn);
}
