/**
 * epilogue.ts — Chapter 4: Return to Thornwick.
 *
 * Exercises: map(), join(), reduce(), reduceRight(), slice(), every(), some(),
 * compute(fn) unbound for final score, effect(fn) for summary render,
 * list.push(), get(), peek(), root.dispose() + root(fn) for new game.
 */

import type { GameState } from "../reactive/state.ts";
import { transitionScene, disposeChapter } from "../reactive/engine.ts";
import { readValue } from "../reactive/render.ts";
import { toDisplayStrings, calculateTotalWeight } from "../reactive/inventory.ts";
import {
  SCENE_RETURN,
  SCENE_MAREN_FINALE,
  SCENE_SUMMARY,
  SCENE_CREDITS,
  SCENE_ARRIVAL,
  QUEST_RETURN_MAREN,
} from "../data/constants.ts";
import { getQuestName, getClassName } from "../data/dialogue.ts";
import { formatItemName } from "../data/items.ts";

/**
 * Set up the epilogue chapter.
 */
export function setupEpilogue(r: any, state: GameState, elements: any): void {
  r.effect(state.currentScene, (sceneId: number, c: any) => {
    if (sceneId === SCENE_RETURN) {
      handleReturn(r, state, elements, c);
    } else if (sceneId === SCENE_MAREN_FINALE) {
      handleMarenFinale(r, state, elements, c);
    } else if (sceneId === SCENE_SUMMARY) {
      handleSummary(r, state, elements, c);
    } else if (sceneId === SCENE_CREDITS) {
      handleCredits(r, state, elements, c);
    }
  });
}

function handleReturn(r: any, state: GameState, elements: any, c: any): void {
  const { choicesEl } = elements;
  choicesEl.innerHTML = "";

  const log = state.gameLog.get();
  log.push("Returning to Thornwick...");
  state.gameLog.set(log);

  const btn = document.createElement("button");
  btn.className = "choice-btn";
  btn.textContent = "[1] Return to Thornwick";
  btn.addEventListener("click", () => {
    transitionScene(state, SCENE_MAREN_FINALE, "Arrived back in Thornwick.");
  });
  choicesEl.appendChild(btn);
}

function handleMarenFinale(r: any, state: GameState, elements: any, c: any): void {
  const { choicesEl, narrativeEl } = elements;
  choicesEl.innerHTML = "";

  /** list.push() — Complete the "Return to Maren" quest. */
  state.questLog.push(QUEST_RETURN_MAREN);

  const questLog = state.questLog.get();

  /** map() — Transform quest IDs to display strings. */
  const questNames = questLog.map((id: number) => getQuestName(id));

  /** join() — Format quest log as readable text. */
  const questText = questNames.join("\n• ");

  /** reduce() — Count total quests completed. */
  const totalQuests = questLog.reduce((count: number) => count + 1, 0);

  /** reduceRight() — Build reverse-chronological summary. */
  const reverseLog = questLog.reduceRight((acc: string, id: number) => {
    return acc + (acc.length > 0 ? " ← " : "") + getQuestName(id);
  }, "");

  /** slice() — Show last 3 quests as highlights. */
  const recentQuests = questLog.slice(-3);
  const recentNames = recentQuests.map((id: number) => getQuestName(id));

  /** every() — Check if all main quests completed (IDs 0, 2, 3, 5, 6, 7). */
  const mainQuestIds = [0, 2, 3, 5, 6, 7];
  const allMainComplete = mainQuestIds.every((id) => questLog.indexOf(id) !== -1);

  /** some() — Check if any bonus items collected (Bag of Gems, Enchanted Ring). */
  const inventory = state.inventory.get();
  const hasBonusItems = inventory.some((id: number) => id === 11 || id === 14);

  /** Render Maren's review. */
  const reviewEl = document.createElement("div");
  reviewEl.className = "quest-review";
  reviewEl.innerHTML = `
    <h3>Quest Log (${totalQuests} completed)</h3>
    <div class="quest-list">• ${questText}</div>
    <div class="quest-recent">Recent: ${recentNames.join(", ")}</div>
    <div class="quest-reverse">Journey: ${reverseLog}</div>
    ${allMainComplete ? '<div class="quest-bonus">✨ All main quests completed!</div>' : ""}
    ${hasBonusItems ? '<div class="quest-bonus">💎 Bonus items collected!</div>' : ""}
  `;
  choicesEl.appendChild(reviewEl);

  const log = state.gameLog.get();
  log.push("Maren reviews your quest log.");
  log.push(`Quest completed: Return to Maren. (${totalQuests} total quests)`);
  state.gameLog.set(log);

  const btn = document.createElement("button");
  btn.className = "choice-btn";
  btn.textContent = "[1] View final score";
  btn.addEventListener("click", () => {
    transitionScene(state, SCENE_SUMMARY, "Viewing final summary.");
  });
  choicesEl.appendChild(btn);
}

function handleSummary(r: any, state: GameState, elements: any, c: any): void {
  const { choicesEl } = elements;
  choicesEl.innerHTML = "";

  /** get() — Read all final signal values for display. */
  const playerName = state.playerName.get();
  const playerClass = state.playerClass.get();
  const health = state.health.get();
  const maxHealth = state.maxHealth.get();
  const gold = state.gold.get();
  const inventory = state.inventory.get();
  const questLog = state.questLog.get();
  const visitedScenes = state.visitedScenes.get();

  /** compute(fn) — Unbound: derive final score. */
  const score = gold + inventory.length * 10 + questLog.length * 50 + health;

  /** peek() — Read stats without tracking for static render. */
  const className = getClassName(playerClass);

  /** list.push() — Add "Adventure Complete" to quest log. */
  const log = state.gameLog.get();
  log.push("Adventure Complete!");
  state.gameLog.set(log);

  /** Inventory display names. */
  const itemNames: string[] = [];
  for (let i = 0; i < inventory.length; i++) {
    itemNames.push(formatItemName(inventory[i]));
  }

  const summaryEl = document.createElement("div");
  summaryEl.className = "final-summary";
  summaryEl.innerHTML = `
    <h2>Adventure Summary</h2>
    <div class="summary-row">${playerName} the ${className}</div>
    <div class="summary-row">❤ ${health}/${maxHealth} HP</div>
    <div class="summary-row">💰 ${gold} gold</div>
    <div class="summary-row">📦 ${inventory.length} items: ${itemNames.join(", ") || "none"}</div>
    <div class="summary-row">📜 ${questLog.length}/8 quests completed</div>
    <div class="summary-row">🗺 ${visitedScenes.length} scenes visited</div>
    <div class="summary-score">⭐ Final Score: ${score}</div>
  `;
  choicesEl.appendChild(summaryEl);

  const btn = document.createElement("button");
  btn.className = "choice-btn";
  btn.textContent = "[1] View credits";
  btn.addEventListener("click", () => {
    transitionScene(state, SCENE_CREDITS);
  });
  choicesEl.appendChild(btn);
}

function handleCredits(r: any, state: GameState, elements: any, c: any): void {
  const { choicesEl } = elements;
  choicesEl.innerHTML = "";

  const creditsEl = document.createElement("div");
  creditsEl.className = "credits";
  creditsEl.innerHTML = `
    <pre>
═══════════════════════════════════════
         THE SIGNAL TOWER
           - Fin -
═══════════════════════════════════════

A reactive adventure built with anod.

Thank you for playing.
    </pre>
  `;
  choicesEl.appendChild(creditsEl);

  const newGameBtn = document.createElement("button");
  newGameBtn.className = "choice-btn";
  newGameBtn.textContent = "[1] 🔄 Play Again";
  newGameBtn.addEventListener("click", () => {
    /** This will be handled by main.ts — triggers full game restart. */
    window.dispatchEvent(new CustomEvent("newgame"));
  });
  choicesEl.appendChild(newGameBtn);
}
