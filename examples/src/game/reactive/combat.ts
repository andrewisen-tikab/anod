/**
 * combat.ts — Reactive combat loop with async tasks and spawns.
 *
 * Demonstrates: task(fn), task(dep, fn), spawn(fn), spawn(dep, fn),
 * suspend(), lock(), unlock(), controller(), defer(), pending(),
 * .loading, .error, .disposed getters.
 */

import type { GameState } from "./state.ts";
import {
  getWardenStats,
  resolveTurn,
  resolveFlee,
  isDefeated,
  calculateDamage,
  calculateDefense,
  getCritBonus,
  getPlayerBaseStats,
} from "../data/combat.ts";
import { getHealingAmount } from "../data/items.ts";
import { simulateThinkingDelay } from "../data/dialogue.ts";
import {
  ACTION_ATTACK,
  ACTION_HEAL,
  ACTION_FLEE,
  ITEM_SMOKE_BOMB,
  ITEM_HEALTH_POTION,
  ITEM_GREATER_POTION,
  TYPE_WEAPON,
  TYPE_ACCESSORY,
} from "../data/constants.ts";
import { getItemById } from "../data/items.ts";

// ─── Async Task ──────────────────────────────────────────────────────

/**
 * task(fn) — Unbound async compute for loading the Warden's stats.
 * Simulates an async "fetch" with a thinking delay.
 * While pending: task.loading === true, UI shows "The Warden materializes..."
 */
export function createLoadWardenTask(owner: any) {
  return owner.task(async (c: any) => {
    await simulateThinkingDelay();
    return getWardenStats();
  });
}

/**
 * task(dep, fn) — Bound async compute for resolving a combat turn.
 * Depends on the player's action signal. When the action changes,
 * the task re-runs to resolve the turn.
 */
export function createCombatTurnTask(owner: any, actionSignal: any, state: GameState) {
  return owner.task(actionSignal, async (actionValue: number, c: any) => {
    if (actionValue === 0) {
      return null;
    }

    /** Simulate Warden "thinking" before responding. */
    await simulateThinkingDelay();

    const inventory = state.inventory.get();
    const playerClass = state.playerClass.get();
    const playerHP = state.health.get();

    if (actionValue === ACTION_ATTACK) {
      /** Find player's weapon. */
      let weaponId = 0;
      for (let i = 0; i < inventory.length; i++) {
        const item = getItemById(inventory[i]);
        if (item !== undefined && item.type === TYPE_WEAPON) {
          weaponId = inventory[i];
          break;
        }
      }
      const playerDmg = calculateDamage(playerClass, weaponId);
      const baseStats = getPlayerBaseStats(playerClass);

      /** Calculate crit bonus from accessories. */
      let critBonus = 0;
      for (let i = 0; i < inventory.length; i++) {
        critBonus += getCritBonus(inventory[i]);
      }

      const playerTurn = resolveTurn(
        playerDmg,
        baseStats.critChance + critBonus,
        baseStats.critMultiplier,
        getWardenStats().defense,
      );

      /** Warden strikes back. */
      const equipmentIds: number[] = [];
      for (let i = 0; i < inventory.length; i++) {
        const item = getItemById(inventory[i]);
        if (item !== undefined && item.type === TYPE_ACCESSORY) {
          equipmentIds.push(inventory[i]);
        }
      }
      const playerDef = calculateDefense(playerClass, equipmentIds);
      const wardenTurn = resolveTurn(
        getWardenStats().damage,
        getWardenStats().critChance,
        getWardenStats().critMultiplier,
        playerDef,
      );

      return {
        action: ACTION_ATTACK,
        playerResult: playerTurn,
        wardenResult: wardenTurn,
      };
    }

    if (actionValue === ACTION_HEAL) {
      /** Find first healing item. */
      let healItemId = 0;
      let healIndex = -1;
      for (let i = 0; i < inventory.length; i++) {
        const amount = getHealingAmount(inventory[i]);
        if (amount > 0) {
          healItemId = inventory[i];
          healIndex = i;
          break;
        }
      }
      const healAmount = getHealingAmount(healItemId);

      /** Warden still attacks while you heal. */
      const equipmentIds: number[] = [];
      for (let i = 0; i < inventory.length; i++) {
        const item = getItemById(inventory[i]);
        if (item !== undefined && item.type === TYPE_ACCESSORY) {
          equipmentIds.push(inventory[i]);
        }
      }
      const playerDef = calculateDefense(playerClass, equipmentIds);
      const wardenTurn = resolveTurn(
        getWardenStats().damage,
        getWardenStats().critChance,
        getWardenStats().critMultiplier,
        playerDef,
      );

      return {
        action: ACTION_HEAL,
        healAmount,
        healItemId,
        healIndex,
        wardenResult: wardenTurn,
      };
    }

    if (actionValue === ACTION_FLEE) {
      const hasSmokeBomb = inventory.indexOf(ITEM_SMOKE_BOMB) !== -1;
      const fleeResult = resolveFlee(hasSmokeBomb);
      return {
        action: ACTION_FLEE,
        ...fleeResult,
        smokeBombIndex: hasSmokeBomb ? inventory.indexOf(ITEM_SMOKE_BOMB) : -1,
      };
    }

    return null;
  });
}

// ─── Async Spawn ─────────────────────────────────────────────────────

/**
 * spawn(fn) — Unbound async effect for combat animations.
 * Writes typewriter text character-by-character. Can be aborted via controller().
 */
export function createCombatAnimation(owner: any, textSignal: any, message: string) {
  return owner.spawn(async (c: any) => {
    const ctrl = c.controller();
    let accumulated = "";
    for (let i = 0; i < message.length; i++) {
      if (ctrl.signal.aborted) {
        break;
      }
      accumulated += message[i];
      textSignal.set(accumulated);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    textSignal.set(message);
  });
}

/**
 * spawn(dep, fn) — Bound async effect for ambient tower events.
 * Depends on the floor signal. Fires narration when floor changes.
 */
export function createAmbientEvents(owner: any, floorSignal: any, logFn: (msg: string) => void) {
  return owner.spawn(floorSignal, async (floor: number, c: any) => {
    const ctrl = c.controller();
    const messages = [
      "The tower hums softly...",
      "Whispers echo from the walls...",
      "The air crackles with energy...",
      "Strange lights pulse in the distance...",
    ];
    const msg = messages[floor % messages.length];
    if (msg !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (!ctrl.signal.aborted) {
        logFn(msg);
      }
    }
  });
}

// ─── Suspend & Control ───────────────────────────────────────────────

/**
 * suspend() — Await a combat task result before proceeding.
 * Used in effects that need to wait for the combat turn to resolve.
 */
export function awaitCombatResult(c: any, combatTask: any): any {
  return c.suspend(combatTask);
}

/**
 * lock() — Lock a node to prevent updates during combat animation.
 * Buttons are disabled while the animation plays.
 */
export function lockDuringAnimation(c: any): void {
  c.lock();
}

/**
 * unlock() — Re-enable updates after animation completes.
 */
export function unlockAfterAnimation(c: any): void {
  c.unlock();
}

/**
 * controller() — Get an AbortController tied to the node's lifecycle.
 * Used to cancel typewriter animations when player skips ahead.
 */
export function getAbortController(c: any): AbortController {
  return c.controller();
}

/**
 * defer() — Defer reading a sender's value.
 * Used to defer reading the Warden's health during the player's turn,
 * avoiding premature re-evaluation.
 */
export function deferEnemyHealth(c: any, wardenHP: any): any {
  return c.defer(wardenHP);
}

/**
 * pending() — Check if a task (or tasks) are still loading.
 * Used to disable the "Fight" button while Warden data loads.
 */
export function checkCombatLoading(c: any, tasks: any): boolean {
  return c.pending(tasks);
}

/**
 * task.loading — Read the loading state of a task.
 * Returns true if the task's promise is still pending.
 */
export function readTaskLoading(combatTask: any): boolean {
  return combatTask.loading;
}

/**
 * task.error — Read the error state of a task.
 * Returns the error POJO if the task failed, or null.
 */
export function readTaskError(combatTask: any): any {
  return combatTask.error;
}

/**
 * node.disposed — Check if a node has been disposed.
 * Returns true after dispose() has been called.
 */
export function checkDisposed(node: any): boolean {
  return node.disposed;
}
