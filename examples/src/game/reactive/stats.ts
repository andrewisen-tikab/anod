/**
 * stats.ts — Derived stats using compute with various options.
 *
 * Demonstrates: compute(fn) unbound, compute(dep, fn) bound,
 * OPT_STABLE, OPT_DEFER, OPT_WEAK, equal(), stable(), val(), peek().
 */

import { OPT_STABLE, OPT_DEFER, OPT_WEAK } from "anod";
import type { GameState } from "./state.ts";
import { getClassName } from "../data/dialogue.ts";
import { getItemById } from "../data/items.ts";
import { TYPE_WEAPON, TYPE_ACCESSORY } from "../data/constants.ts";

// ─── Compute Variants ────────────────────────────────────────────────

/**
 * compute(fn) — Unbound compute that reads multiple dependencies.
 * Derives a status text string from health, gold, and class.
 * Dynamic dep tracking: reads whatever signals are needed.
 */
export function createStatusText(owner: any, state: GameState) {
  return owner.compute((c: any) => {
    const hp = c.val(state.health);
    const maxHp = c.val(state.maxHealth);
    const gold = c.val(state.gold);
    const cls = c.val(state.playerClass);
    const name = c.val(state.playerName);
    const className = getClassName(cls);
    return `${name} the ${className} | ❤ ${hp}/${maxHp} | 💰 ${gold}g`;
  });
}

/**
 * compute(dep, fn) — Bound compute with a single dependency.
 * Derives the health bar width percentage from the health signal.
 * No setup or reconciliation needed — single dep, maximum speed.
 */
export function createHealthBarWidth(owner: any, state: GameState) {
  return owner.compute(state.health, (hp: number) => {
    const maxHp = state.maxHealth.get();
    if (maxHp === 0) {
      return 0;
    }
    return Math.floor((hp / maxHp) * 100);
  });
}

/**
 * compute(dep, fn, seed, OPT_STABLE) — Stable compute.
 * Once the class name is computed, it never changes (class is chosen once).
 * OPT_STABLE skips dependency tracking on re-read for maximum performance.
 */
export function createStableClassName(owner: any, state: GameState) {
  return owner.compute(
    state.playerClass,
    (cls: number) => {
      return getClassName(cls);
    },
    "",
    OPT_STABLE,
  );
}

/**
 * compute(fn, seed, OPT_DEFER) — Deferred compute.
 * The danger level is only evaluated when the player opens the stats panel.
 * OPT_DEFER means it doesn't auto-start — remains stale until explicitly read.
 */
export function createLazyDangerLevel(owner: any, state: GameState) {
  return owner.compute(
    (c: any) => {
      const hp = c.val(state.health);
      const inventory = c.val(state.inventory);
      const weaponCount = inventory.filter((id: number) => {
        const item = getItemById(id);
        return item !== undefined && item.type === TYPE_WEAPON;
      }).length;
      if (hp < 30 && weaponCount === 0) {
        return "CRITICAL";
      }
      if (hp < 50) {
        return "HIGH";
      }
      if (hp < 80) {
        return "MODERATE";
      }
      return "LOW";
    },
    "",
    OPT_DEFER,
  );
}

/**
 * compute(dep, fn, seed, OPT_WEAK) — Weak compute for tooltips.
 * Auto-disposes when no subscribers are reading it.
 * Used for item tooltips that appear on hover and disappear on mouse out.
 */
export function createAutoDisposingTooltip(owner: any, itemSignal: any) {
  return owner.compute(
    itemSignal,
    (itemId: number) => {
      const item = getItemById(itemId);
      if (item === undefined) {
        return "Unknown item";
      }
      return `${item.name} (${item.description}) - Weight: ${item.weight}, Value: ${item.value}g`;
    },
    "",
    OPT_WEAK,
  );
}

// ─── Compute Methods ─────────────────────────────────────────────────

/**
 * equal(true) — Enable equality check on a compute.
 * The compute won't notify subscribers if the new value === old value.
 * Used on the riddle answer validation to skip re-render for same answer.
 */
export function enableEqualityCheck(node: any): void {
  node.equal(true);
}

/**
 * equal(false) — Disable equality check on a compute.
 * Forces notification on every re-evaluation regardless of value.
 */
export function disableEqualityCheck(node: any): void {
  node.equal(false);
}

/**
 * stable() — Mark a compute as stable (no more dependency tracking).
 * After calling this, the compute won't re-subscribe to deps on re-run.
 * Fastest read path, but deps are frozen.
 */
export function switchToStable(c: any): void {
  c.stable();
}

/**
 * val(sender) — Read a sender's value WITH dependency tracking.
 * Creates a subscription: when the sender changes, this compute is marked stale.
 * The standard way to read dependencies inside compute/effect callbacks.
 */
export function readWithTracking(c: any, sender: any): any {
  return c.val(sender);
}

/**
 * peek(sender) — Read a sender's value WITHOUT subscribing.
 * Gets the current value but doesn't create a dependency link.
 * Used to read player name for log messages without re-triggering the log effect.
 */
export function readWithoutTracking(c: any, sender: any): any {
  return c.peek(sender);
}

/**
 * Compute the health bar color based on HP percentage.
 * Green > 50%, Yellow > 25%, Red ≤ 25%.
 */
export function createHealthBarColor(owner: any, state: GameState) {
  return owner.compute(state.health, (hp: number) => {
    const maxHp = state.maxHealth.get();
    const pct = maxHp > 0 ? (hp / maxHp) * 100 : 0;
    if (pct > 50) {
      return "#33ff33";
    }
    if (pct > 25) {
      return "#ffcc00";
    }
    return "#ff3333";
  });
}

/**
 * Compute the total gold value of all inventory items.
 * Unbound — reads inventory with tracking.
 */
export function createInventoryValue(owner: any, state: GameState) {
  return owner.compute((c: any) => {
    const items = c.val(state.inventory);
    let total = 0;
    for (let i = 0; i < items.length; i++) {
      const item = getItemById(items[i]);
      if (item !== undefined) {
        total += item.value;
      }
    }
    return total;
  });
}
