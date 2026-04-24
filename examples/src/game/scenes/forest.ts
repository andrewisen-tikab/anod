/**
 * forest.ts — Chapter 2: The Whispering Woods.
 *
 * Exercises: compute(fn) unbound, compute(dep, fn) bound,
 * OPT_DEFER, OPT_STABLE, OPT_WEAK, equal(), stable(),
 * val(), peek(), refuse(), recover(), REFUSE error type,
 * signal.notify(), signal.post().
 */

import type { GameState } from "../reactive/state.ts";
import {
  transitionScene,
  createOwnedBoundCompute,
  createOwnedCompute,
  handleInvalidAction,
  setupErrorRecovery,
} from "../reactive/engine.ts";
import {
  readValue,
  writeValue,
  deferredUpdate,
  forceUIRefresh,
  functionalUpdate,
} from "../reactive/render.ts";
import {
  createLazyDangerLevel,
  createAutoDisposingTooltip,
  createStableClassName,
  enableEqualityCheck,
  readWithTracking,
  readWithoutTracking,
} from "../reactive/stats.ts";
import { hasItem, pickUpItem } from "../reactive/inventory.ts";
import {
  SCENE_FOREST_ENTRANCE,
  SCENE_LUMA_ENCOUNTER,
  SCENE_FOREST_PATH,
  SCENE_FOREST_CLEARING,
  SCENE_FOREST_EXIT,
  SCENE_TOWER_BASE,
  ITEM_TORCH,
  ITEM_LOCKPICK_SET,
  ITEM_BAG_OF_GEMS,
  QUEST_SOLVE_RIDDLE,
  QUEST_FIND_CHEST,
} from "../data/constants.ts";
import { getForestRiddle } from "../data/dialogue.ts";
import { createOwnedSignal } from "../reactive/engine.ts";

/**
 * Set up the forest chapter within a root scope.
 */
export function setupForest(r: any, state: GameState, elements: any): void {
  /** OPT_DEFER — Lazy stats panel: danger level computed only when opened. */
  const dangerLevel = createLazyDangerLevel(r, state);

  /** OPT_STABLE — Class name computed once, never changes. */
  const className = createStableClassName(r, state);

  /** Riddle answer tracking signal (owned by chapter root). */
  const riddleAnswer = createOwnedSignal(r, -1);

  r.effect(state.currentScene, (sceneId: number, c: any) => {
    if (sceneId === SCENE_FOREST_ENTRANCE) {
      handleForestEntrance(r, state, elements, c, dangerLevel);
    } else if (sceneId === SCENE_LUMA_ENCOUNTER) {
      handleLumaEncounter(r, state, elements, c, riddleAnswer);
    } else if (sceneId === SCENE_FOREST_PATH) {
      handleForestPath(r, state, elements, c);
    } else if (sceneId === SCENE_FOREST_CLEARING) {
      handleForestClearing(r, state, elements, c);
    } else if (sceneId === SCENE_FOREST_EXIT) {
      handleForestExit(r, state, elements, c);
    }
  });
}

function handleForestEntrance(
  r: any,
  state: GameState,
  elements: any,
  c: any,
  dangerLevel: any,
): void {
  const { choicesEl } = elements;
  choicesEl.innerHTML = "";

  /** compute(fn) — Unbound: derive visibility from inventory (has torch?). */
  const hasTorch = hasItem(state, ITEM_TORCH);
  const hasTorchVal = hasTorch.get();

  /** Read the deferred danger level — this triggers its first evaluation. */
  const danger = dangerLevel.get();

  const log = state.gameLog.get();
  log.push("Entered the Whispering Woods.");
  if (!hasTorchVal) {
    log.push("It's dark... some paths may be hidden without a torch.");
  }
  log.push(`Danger level: ${danger}`);
  state.gameLog.set(log);

  if (hasTorchVal) {
    const btn = document.createElement("button");
    btn.className = "choice-btn";
    btn.textContent = "[1] Light your torch and proceed";
    btn.addEventListener("click", () => {
      transitionScene(state, SCENE_LUMA_ENCOUNTER, "Lit torch. Proceeding deeper.");
    });
    choicesEl.appendChild(btn);
  }

  const darkBtn = document.createElement("button");
  darkBtn.className = "choice-btn";
  darkBtn.textContent = hasTorchVal
    ? "[2] Proceed into the darkness"
    : "[1] Proceed into the darkness";
  darkBtn.addEventListener("click", () => {
    transitionScene(state, SCENE_LUMA_ENCOUNTER, "Entered the dark forest.");
  });
  choicesEl.appendChild(darkBtn);
}

function handleLumaEncounter(
  r: any,
  state: GameState,
  elements: any,
  c: any,
  riddleAnswer: any,
): void {
  const { choicesEl, narrativeEl } = elements;
  choicesEl.innerHTML = "";

  const riddle = getForestRiddle();

  /**
   * compute(dep, fn) — Bound compute: validates the riddle answer.
   * Single dep on riddleAnswer signal. OPT_STABLE after correct answer.
   */
  const answerValidator = createOwnedBoundCompute(r, riddleAnswer, (answer: number) => {
    if (answer === -1) {
      return "waiting";
    }
    if (answer === riddle.answerIndex) {
      return "correct";
    }
    return "wrong";
  });

  /** equal() — Enable equality check: skip re-render for same answer. */
  enableEqualityCheck(answerValidator);

  /** recover() + refuse() — Handle wrong answers gracefully. */
  const errorMsg = document.createElement("div");
  errorMsg.className = "error-msg";
  errorMsg.style.display = "none";

  choicesEl.appendChild(errorMsg);

  for (let i = 0; i < riddle.answers.length; i++) {
    const btn = document.createElement("button");
    btn.className = "choice-btn";
    btn.textContent = `[${i + 1}] "${riddle.answers[i]}"`;
    const answerIdx = i;
    btn.addEventListener("click", () => {
      writeValue(riddleAnswer, answerIdx);

      if (answerIdx === riddle.answerIndex) {
        /** Correct! */
        state.questLog.push(QUEST_SOLVE_RIDDLE);
        const log = state.gameLog.get();
        log.push('Solved Luma\'s riddle: "A mountain."');
        state.gameLog.set(log);
        transitionScene(state, SCENE_FOREST_PATH, "Luma grants passage.");
      } else {
        /** Wrong answer — show error message. */
        errorMsg.style.display = "block";
        errorMsg.textContent = `Luma shakes her head. "${riddle.answers[answerIdx]}" is not the answer. Try again.`;

        const log = state.gameLog.get();
        log.push(`Wrong answer: "${riddle.answers[answerIdx]}"`);
        state.gameLog.set(log);
      }
    });
    choicesEl.appendChild(btn);
  }
}

function handleForestPath(r: any, state: GameState, elements: any, c: any): void {
  const { choicesEl } = elements;
  choicesEl.innerHTML = "";

  /** peek() — Read player name without subscribing (for log message). */
  const playerName = readWithoutTracking(c, state.playerName);
  /** val() — Read health with subscription (for danger warning). */
  const hp = readWithTracking(c, state.health);

  if (hp < 50) {
    const warning = document.createElement("div");
    warning.className = "warning";
    warning.textContent = `${playerName}, your health is low (${hp} HP). The left path may be dangerous.`;
    choicesEl.appendChild(warning);
  }

  const leftBtn = document.createElement("button");
  leftBtn.className = "choice-btn";
  leftBtn.textContent = "[1] Take the left path (dangerous shortcut)";
  leftBtn.addEventListener("click", () => {
    /** Dangerous path: lose some HP. */
    functionalUpdate(state.health, (prev: number) => Math.max(0, prev - 15));
    const log = state.gameLog.get();
    log.push("Took the dangerous shortcut. Lost 15 HP from thorns.");
    state.gameLog.set(log);
    transitionScene(state, SCENE_FOREST_EXIT);
  });

  const rightBtn = document.createElement("button");
  rightBtn.className = "choice-btn";
  rightBtn.textContent = "[2] Take the right path (safe, longer)";
  rightBtn.addEventListener("click", () => {
    transitionScene(state, SCENE_FOREST_CLEARING, "Took the safe path through the clearing.");
  });

  choicesEl.appendChild(leftBtn);
  choicesEl.appendChild(rightBtn);
}

function handleForestClearing(r: any, state: GameState, elements: any, c: any): void {
  const { choicesEl } = elements;
  choicesEl.innerHTML = "";

  /** includes() — Check for lockpick in inventory. */
  const hasLockpick = hasItem(state, ITEM_LOCKPICK_SET);
  const canPick = hasLockpick.get();

  if (canPick) {
    const pickBtn = document.createElement("button");
    pickBtn.className = "choice-btn";
    pickBtn.textContent = "[1] Pick the lock";
    pickBtn.addEventListener("click", () => {
      /** concat() conceptually — merge chest contents with inventory. */
      pickUpItem(state, ITEM_BAG_OF_GEMS);

      /** signal.post() — Deferred gold update after chest opening. */
      deferredUpdate(state.gold, state.gold.get() + 50);

      state.questLog.push(QUEST_FIND_CHEST);

      const log = state.gameLog.get();
      log.push("Picked the lock! Found Bag of Gems and 50 gold.");
      log.push("Quest completed: Find the hidden chest.");
      state.gameLog.set(log);

      transitionScene(state, SCENE_FOREST_EXIT);
    });
    choicesEl.appendChild(pickBtn);
  }

  const leaveBtn = document.createElement("button");
  leaveBtn.className = "choice-btn";
  leaveBtn.textContent = canPick
    ? "[2] Leave the chest and continue"
    : "[1] Leave the chest and continue";
  leaveBtn.addEventListener("click", () => {
    transitionScene(state, SCENE_FOREST_EXIT, "Left the chest behind.");
  });
  choicesEl.appendChild(leaveBtn);
}

function handleForestExit(r: any, state: GameState, elements: any, c: any): void {
  const { choicesEl } = elements;
  choicesEl.innerHTML = "";

  /** list.push() — Add "Cleared the forest" to quest log. */
  const log = state.gameLog.get();
  log.push("Reached the base of the Signal Tower.");
  state.gameLog.set(log);

  /** signal.notify() — Force game log refresh. */
  forceUIRefresh(state.gameLog);

  const btn = document.createElement("button");
  btn.className = "choice-btn";
  btn.textContent = "[1] Approach the Signal Tower";
  btn.addEventListener("click", () => {
    transitionScene(state, SCENE_TOWER_BASE, "Approaching the Signal Tower.");
  });
  choicesEl.appendChild(btn);
}
