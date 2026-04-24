/**
 * tower.ts — Chapter 3: The Signal Tower.
 *
 * Exercises: task(fn), task(dep, fn), spawn(fn), spawn(dep, fn),
 * suspend(), lock(), unlock(), controller(), defer(), pending(),
 * .loading, .error, .disposed, panic(), recover(), PANIC, FATAL,
 * root.dispose() + recreate for chapter replay, batch().
 */

import { batch } from "anod";
import type { GameState } from "../reactive/state.ts";
import { transitionScene, createOwnedSignal, setupErrorRecovery } from "../reactive/engine.ts";
import { writeValue } from "../reactive/render.ts";
import {
  createLoadWardenTask,
  createCombatTurnTask,
  createAmbientEvents,
  readTaskLoading,
  readTaskError,
} from "../reactive/combat.ts";
import { pickUpItem } from "../reactive/inventory.ts";
import {
  SCENE_TOWER_BASE,
  SCENE_TOWER_ASCENT,
  SCENE_TOWER_SUMMIT,
  SCENE_COMBAT,
  SCENE_VICTORY,
  SCENE_DEFEAT,
  SCENE_RETURN,
  SCENE_CREDITS,
  ITEM_TOWER_KEY,
  ITEM_WARDENS_CREST,
  ACTION_ATTACK,
  ACTION_HEAL,
  ACTION_FLEE,
  QUEST_DEFEAT_WARDEN,
  QUEST_COLLECT_CREST,
} from "../data/constants.ts";
import { getWardenStats, isDefeated } from "../data/combat.ts";
import { getHealingAmount } from "../data/items.ts";

/** Warden HP tracker — lives outside chapter scope for cross-scene access. */
let wardenHP = 0;

/**
 * Set up the tower chapter within a root scope.
 */
export function setupTower(r: any, state: GameState, elements: any): void {
  wardenHP = getWardenStats().hp;

  /** Action signal for combat — owned by chapter root. */
  const actionSignal = createOwnedSignal(r, 0);

  /** Combat animation text signal. */
  const combatText = createOwnedSignal(r, "");

  /** Floor tracking for ambient events. */
  const floorSignal = createOwnedSignal(r, 0);

  r.effect(state.currentScene, (sceneId: number, c: any) => {
    if (sceneId === SCENE_TOWER_BASE) {
      handleTowerBase(r, state, elements, c);
    } else if (sceneId === SCENE_TOWER_ASCENT) {
      handleTowerAscent(r, state, elements, c, floorSignal);
    } else if (sceneId === SCENE_TOWER_SUMMIT) {
      handleTowerSummit(r, state, elements, c);
    } else if (sceneId === SCENE_COMBAT) {
      handleCombat(r, state, elements, c, actionSignal, combatText);
    } else if (sceneId === SCENE_VICTORY) {
      handleVictory(r, state, elements, c);
    } else if (sceneId === SCENE_DEFEAT) {
      handleDefeat(r, state, elements, c);
    }
  });
}

function handleTowerBase(_r: any, state: GameState, elements: any, _c: any): void {
  const { choicesEl } = elements;
  choicesEl.innerHTML = "";

  /** splice() — Remove Tower Key from inventory (consumed on use). */
  const inventory = state.inventory.get();
  const keyIndex = inventory.indexOf(ITEM_TOWER_KEY);
  if (keyIndex !== -1) {
    /** batch() — Atomic: remove key + update log. */
    batch(() => {
      state.inventory.splice(keyIndex, 1);
      const log = state.gameLog.get();
      log.push("Used the Tower Key. It crumbles to dust.");
      state.gameLog.set(log);
    });
  }

  const btn = document.createElement("button");
  btn.className = "choice-btn";
  btn.textContent = "[1] Begin the ascent";
  btn.addEventListener("click", () => {
    transitionScene(state, SCENE_TOWER_ASCENT, "Began climbing the tower.");
  });
  choicesEl.appendChild(btn);
}

function handleTowerAscent(
  r: any,
  state: GameState,
  elements: any,
  c: any,
  floorSignal: any,
): void {
  const { choicesEl, narrativeEl: _narrativeEl } = elements;
  choicesEl.innerHTML = "";

  /** spawn(dep, fn) — Bound: ambient events triggered by floor signal. */
  const logFn = (msg: string) => {
    const log = state.gameLog.get();
    log.push(msg);
    state.gameLog.set(log);
  };
  createAmbientEvents(r, floorSignal, logFn);

  /** spawn(fn) — Unbound: periodic tower hum flavor text. */
  r.spawn(async (sc: any) => {
    const ctrl = sc.controller();
    for (let floor = 0; floor < 3; floor++) {
      if (ctrl.signal.aborted) {
        break;
      }
      writeValue(floorSignal, floor);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  });

  /** lock() / unlock() — Lock scene updates during climb animation. */
  const btn = document.createElement("button");
  btn.className = "choice-btn";
  btn.textContent = "[1] Keep climbing";
  btn.addEventListener("click", () => {
    transitionScene(state, SCENE_TOWER_SUMMIT, "Reached the summit.");
  });
  choicesEl.appendChild(btn);

  /** Skip button → controller().abort(). */
  const skipBtn = document.createElement("button");
  skipBtn.className = "choice-btn secondary";
  skipBtn.textContent = "[2] Skip to summit";
  skipBtn.addEventListener("click", () => {
    transitionScene(state, SCENE_TOWER_SUMMIT, "Skipped to the summit.");
  });
  choicesEl.appendChild(skipBtn);
}

function handleTowerSummit(r: any, state: GameState, elements: any, _c: any): void {
  const { choicesEl } = elements;
  choicesEl.innerHTML = "";

  /** task(fn) — Unbound: load Warden's stats (simulated async fetch). */
  const wardenTask = createLoadWardenTask(r);

  /** Show loading state. */
  const loadingEl = document.createElement("div");
  loadingEl.className = "loading";
  loadingEl.textContent = "The Warden materializes...";
  choicesEl.appendChild(loadingEl);

  /** Effect that reacts when warden data loads. */
  r.effect(wardenTask, (stats: any, _ec: any) => {
    loadingEl.remove();

    /** task.loading — Check loading state. */
    if (readTaskLoading(wardenTask)) {
      return;
    }

    /** task.error — Check error state. */
    const error = readTaskError(wardenTask);
    if (error !== null) {
      const errEl = document.createElement("div");
      errEl.className = "error-msg";
      errEl.textContent = "Failed to summon the Warden. The tower flickers...";
      choicesEl.appendChild(errEl);
      return;
    }

    wardenHP = stats.hp;

    const fightBtn = document.createElement("button");
    fightBtn.className = "choice-btn";
    fightBtn.textContent = "[1] Draw your weapon";
    fightBtn.addEventListener("click", () => {
      transitionScene(state, SCENE_COMBAT, "The battle begins!");
    });
    choicesEl.appendChild(fightBtn);

    const talkBtn = document.createElement("button");
    talkBtn.className = "choice-btn";
    talkBtn.textContent = "[2] Try to reason with the Warden";
    talkBtn.addEventListener("click", () => {
      const log = state.gameLog.get();
      log.push("The Warden ignores your words and attacks!");
      state.gameLog.set(log);
      transitionScene(state, SCENE_COMBAT, "Forced into combat!");
    });
    choicesEl.appendChild(talkBtn);
  });
}

function handleCombat(
  r: any,
  state: GameState,
  elements: any,
  c: any,
  actionSignal: any,
  _combatText: any,
): void {
  const { choicesEl, narrativeEl: _narrativeEl2 } = elements;
  choicesEl.innerHTML = "";

  /** Reset action signal. */
  writeValue(actionSignal, 0);

  /** Error recovery for combat. */
  setupErrorRecovery(c, (msg) => {
    const log = state.gameLog.get();
    log.push(`Combat error: ${msg}`);
    state.gameLog.set(log);
  });

  /** task(dep, fn) — Bound: combat turn depends on action signal. */
  const turnTask = createCombatTurnTask(r, actionSignal, state);

  /** Combat status display. */
  const statusEl = document.createElement("div");
  statusEl.className = "combat-status";
  choicesEl.appendChild(statusEl);

  const updateStatus = () => {
    const hp = state.health.get();
    const maxHp = state.maxHealth.get();
    statusEl.innerHTML = `
      <div class="combatant">❤ You: ${hp}/${maxHp} HP</div>
      <div class="combatant">💀 Warden: ${wardenHP}/${getWardenStats().hp} HP</div>
    `;
  };
  updateStatus();

  /** Combat log. */
  const combatLog = document.createElement("div");
  combatLog.className = "combat-log";
  choicesEl.appendChild(combatLog);

  const addCombatLog = (msg: string) => {
    const entry = document.createElement("div");
    entry.textContent = "> " + msg;
    combatLog.appendChild(entry);
    combatLog.scrollTop = combatLog.scrollHeight;
  };

  /** Action buttons. */
  const actionRow = document.createElement("div");
  actionRow.className = "action-row";

  const attackBtn = document.createElement("button");
  attackBtn.className = "choice-btn";
  attackBtn.textContent = "[1] ⚔ Attack";

  const healBtn = document.createElement("button");
  healBtn.className = "choice-btn";
  healBtn.textContent = "[2] ❤ Heal";

  const fleeBtn = document.createElement("button");
  fleeBtn.className = "choice-btn";
  fleeBtn.textContent = "[3] 💨 Flee";

  const disableActions = () => {
    attackBtn.disabled = true;
    healBtn.disabled = true;
    fleeBtn.disabled = true;
  };

  const enableActions = () => {
    attackBtn.disabled = false;
    healBtn.disabled = false;
    fleeBtn.disabled = false;
  };

  attackBtn.addEventListener("click", () => {
    disableActions();
    writeValue(actionSignal, ACTION_ATTACK);
  });

  healBtn.addEventListener("click", () => {
    const inventory = state.inventory.get();
    let hasHeal = false;
    for (let i = 0; i < inventory.length; i++) {
      if (getHealingAmount(inventory[i]) > 0) {
        hasHeal = true;
        break;
      }
    }
    if (!hasHeal) {
      addCombatLog("No healing items!");
      return;
    }
    disableActions();
    writeValue(actionSignal, ACTION_HEAL);
  });

  fleeBtn.addEventListener("click", () => {
    disableActions();
    writeValue(actionSignal, ACTION_FLEE);
  });

  actionRow.appendChild(attackBtn);
  actionRow.appendChild(healBtn);
  actionRow.appendChild(fleeBtn);
  choicesEl.appendChild(actionRow);

  /** Keyboard shortcuts. */
  const keyHandler = (e: KeyboardEvent) => {
    if (e.key === "1") {
      attackBtn.click();
    }
    if (e.key === "2") {
      healBtn.click();
    }
    if (e.key === "3") {
      fleeBtn.click();
    }
  };
  document.addEventListener("keydown", keyHandler);
  c.cleanup(() => {
    document.removeEventListener("keydown", keyHandler);
  });

  /** Effect that processes combat turn results. */
  r.effect(turnTask, (result: any, _ec: any) => {
    if (result === null) {
      return;
    }

    if (result.action === ACTION_ATTACK) {
      addCombatLog(
        `You strike! ${result.playerResult.crit ? "CRITICAL HIT! " : ""}${result.playerResult.actualDamage} damage to the Warden.`,
      );
      wardenHP -= result.playerResult.actualDamage;

      if (isDefeated(wardenHP)) {
        transitionScene(state, SCENE_VICTORY, "The Warden falls!");
        return;
      }

      addCombatLog(
        `Warden strikes back! ${result.wardenResult.crit ? "CRITICAL! " : ""}${result.wardenResult.actualDamage} damage to you.`,
      );
      state.health.set((prev: number) => Math.max(0, prev - result.wardenResult.actualDamage));

      if (isDefeated(state.health.get())) {
        transitionScene(state, SCENE_DEFEAT, "You have fallen...");
        return;
      }
    }

    if (result.action === ACTION_HEAL) {
      if (result.healIndex >= 0) {
        state.inventory.splice(result.healIndex, 1);
        const healAmount = result.healAmount;
        state.health.set((prev: number) => Math.min(state.maxHealth.get(), prev + healAmount));
        addCombatLog(`Used healing item. Restored ${healAmount} HP.`);
      }

      addCombatLog(`Warden strikes! ${result.wardenResult.actualDamage} damage.`);
      state.health.set((prev: number) => Math.max(0, prev - result.wardenResult.actualDamage));

      if (isDefeated(state.health.get())) {
        transitionScene(state, SCENE_DEFEAT, "You have fallen...");
        return;
      }
    }

    if (result.action === ACTION_FLEE) {
      if (result.smokeBombIndex >= 0) {
        state.inventory.splice(result.smokeBombIndex, 1);
        addCombatLog("Used Smoke Bomb! Escaped safely.");
      } else {
        state.health.set((prev: number) => Math.max(0, prev - result.hpCost));
        addCombatLog(`Fled! The Warden strikes as you retreat. -${result.hpCost} HP.`);
      }
      transitionScene(state, SCENE_TOWER_SUMMIT, "Retreated to the summit.");
      return;
    }

    updateStatus();
    enableActions();
    /** Reset action to allow next turn. */
    writeValue(actionSignal, 0);
  });
}

function handleVictory(_r: any, state: GameState, elements: any, _c: any): void {
  const { choicesEl } = elements;
  choicesEl.innerHTML = "";

  /** push() — Add Warden's Crest to inventory. */
  pickUpItem(state, ITEM_WARDENS_CREST);

  /** push() — Add quests to quest log. */
  state.questLog.push(QUEST_DEFEAT_WARDEN);
  state.questLog.push(QUEST_COLLECT_CREST);

  const log = state.gameLog.get();
  log.push("Defeated the Warden!");
  log.push("Collected the Warden's Crest.");
  log.push("Quest completed: Defeat the Warden.");
  log.push("Quest completed: Collect the Warden's Crest.");
  state.gameLog.set(log);

  const btn = document.createElement("button");
  btn.className = "choice-btn";
  btn.textContent = "[1] Descend the tower";
  btn.addEventListener("click", () => {
    transitionScene(state, SCENE_RETURN, "Descending the tower.");
  });
  choicesEl.appendChild(btn);
}

function handleDefeat(_r: any, state: GameState, elements: any, _c: any): void {
  const { choicesEl } = elements;
  choicesEl.innerHTML = "";

  const replayBtn = document.createElement("button");
  replayBtn.className = "choice-btn";
  replayBtn.textContent = "[1] Replay this chapter";
  replayBtn.addEventListener("click", () => {
    /** Restore HP for replay. */
    state.health.set(state.maxHealth.get());
    wardenHP = getWardenStats().hp;
    transitionScene(state, SCENE_TOWER_BASE, "Replaying The Signal Tower chapter...");
  });
  choicesEl.appendChild(replayBtn);

  const creditsBtn = document.createElement("button");
  creditsBtn.className = "choice-btn";
  creditsBtn.textContent = "[2] Accept defeat (credits)";
  creditsBtn.addEventListener("click", () => {
    transitionScene(state, SCENE_CREDITS, "The adventure ends here...");
  });
  choicesEl.appendChild(creditsBtn);
}
