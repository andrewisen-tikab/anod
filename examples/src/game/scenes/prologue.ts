/**
 * prologue.ts — Chapter 0: The Village of Thornwick.
 *
 * Wires together data and reactive helpers for the prologue chapter.
 * Exercises: signal.set(name), signal.set(fn) functional update,
 * relay push, list.push(), spawn()+controller() typewriter,
 * effect(fn) render, root() chapter scope.
 */

import type { GameState } from "../reactive/state.ts";
import { transitionScene } from "../reactive/engine.ts";
import { writeValue, functionalUpdate, createTypewriter } from "../reactive/render.ts";
import { pickUpItem } from "../reactive/inventory.ts";
import {
  SCENE_ARRIVAL,
  SCENE_CLASS_SELECT,
  SCENE_QUEST_ACCEPT,
  SCENE_MARKET_ENTRANCE,
  CLASS_WARRIOR,
  CLASS_MAGE,
  CLASS_ROGUE,
  QUEST_INVESTIGATE_TOWER,
} from "../data/constants.ts";
import { getStarterWeapon } from "../data/items.ts";

/**
 * Set up the prologue chapter within a root scope.
 * All nodes created here are owned by the chapter root.
 */
export function setupPrologue(r: any, state: GameState, elements: any): void {
  /** Render the chapter-specific effects. */
  r.effect(state.currentScene, (sceneId: number, c: any) => {
    if (sceneId === SCENE_ARRIVAL) {
      handleArrival(r, state, elements, c);
    } else if (sceneId === SCENE_CLASS_SELECT) {
      handleClassSelect(r, state, elements, c);
    } else if (sceneId === SCENE_QUEST_ACCEPT) {
      handleQuestAccept(r, state, elements, c);
    }
  });
}

/**
 * SCENE_ARRIVAL — Player enters their name.
 * Uses signal.set(name) to store the player's name.
 */
function handleArrival(r: any, state: GameState, elements: any, c: any): void {
  const { narrativeEl, choicesEl } = elements;

  /** Show name input instead of normal choices. */
  choicesEl.innerHTML = "";
  const inputGroup = document.createElement("div");
  inputGroup.className = "input-group";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "name-input";
  input.placeholder = "Enter your name...";
  input.maxLength = 20;

  const confirmBtn = document.createElement("button");
  confirmBtn.className = "choice-btn";
  confirmBtn.textContent = "[Enter] Confirm";

  const submitName = () => {
    const name = input.value.trim();
    if (name.length === 0) {
      return;
    }
    /** signal.set(name) — set the player's name signal. */
    writeValue(state.playerName, name);

    const log = state.gameLog.get();
    log.push(`${name} arrives in Thornwick.`);
    state.gameLog.set(log);

    transitionScene(state, SCENE_CLASS_SELECT, `${name} has arrived.`);
  };

  confirmBtn.addEventListener("click", submitName);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      submitName();
    }
  });

  inputGroup.appendChild(input);
  inputGroup.appendChild(confirmBtn);
  choicesEl.appendChild(inputGroup);

  c.cleanup(() => {
    confirmBtn.removeEventListener("click", submitName);
  });

  /** Focus the input. */
  setTimeout(() => input.focus(), 100);
}

/**
 * SCENE_CLASS_SELECT — Choose Warrior, Mage, or Rogue.
 * Uses signal.set(fn) functional update to add starter weapon bonus.
 * Uses list.push() to add starter weapon to inventory.
 */
function handleClassSelect(r: any, state: GameState, elements: any, c: any): void {
  const { choicesEl } = elements;
  choicesEl.innerHTML = "";

  const classes = [
    { id: CLASS_WARRIOR, label: "⚔ I am a Warrior" },
    { id: CLASS_MAGE, label: "🔮 I am a Mage" },
    { id: CLASS_ROGUE, label: "🗡 I am a Rogue" },
  ];

  for (let i = 0; i < classes.length; i++) {
    const cls = classes[i];
    const btn = document.createElement("button");
    btn.className = "choice-btn";
    btn.textContent = `[${i + 1}] ${cls.label}`;
    btn.addEventListener("click", () => {
      /** signal.set(classId) — store the chosen class. */
      writeValue(state.playerClass, cls.id);

      /** list.push() — add starter weapon to inventory. */
      const weaponId = getStarterWeapon(cls.id);
      pickUpItem(state, weaponId);

      const playerName = state.playerName.get();
      const log = state.gameLog.get();
      log.push(`${playerName} chose the ${cls.label.slice(2)} path.`);
      state.gameLog.set(log);

      transitionScene(state, SCENE_QUEST_ACCEPT);
    });
    choicesEl.appendChild(btn);
  }

  /** Keyboard shortcuts. */
  const keyHandler = (e: KeyboardEvent) => {
    const num = parseInt(e.key, 10);
    if (num >= 1 && num <= 3) {
      const buttons = choicesEl.querySelectorAll(".choice-btn");
      if (buttons[num - 1]) {
        (buttons[num - 1] as HTMLButtonElement).click();
      }
    }
  };
  document.addEventListener("keydown", keyHandler);
  c.cleanup(() => {
    document.removeEventListener("keydown", keyHandler);
  });
}

/**
 * SCENE_QUEST_ACCEPT — Maren gives the main quest.
 * Uses list.push() to add quest to quest log.
 * Auto-advances to market chapter.
 */
function handleQuestAccept(r: any, state: GameState, elements: any, c: any): void {
  const { choicesEl } = elements;
  choicesEl.innerHTML = "";

  /** list.push() — add main quest to quest log. */
  state.questLog.push(QUEST_INVESTIGATE_TOWER);

  const log = state.gameLog.get();
  log.push("Quest accepted: Investigate the Signal Tower.");
  state.gameLog.set(log);

  const btn = document.createElement("button");
  btn.className = "choice-btn";
  btn.textContent = "[1] Head to the market";
  btn.addEventListener("click", () => {
    transitionScene(state, SCENE_MARKET_ENTRANCE, "Headed to Thornwick Market.");
  });
  choicesEl.appendChild(btn);

  const keyHandler = (e: KeyboardEvent) => {
    if (e.key === "1") {
      btn.click();
    }
  };
  document.addEventListener("keydown", keyHandler);
  c.cleanup(() => {
    document.removeEventListener("keydown", keyHandler);
  });
}
