/**
 * main.ts — Bootstrap for "The Signal Tower" game.
 *
 * Creates the root game scope, mounts DOM elements, checks for saved games,
 * wires up the reactive engine, and starts the game loop.
 *
 * Demonstrates: root() for top-level ownership, effect() for rendering,
 * batch() for atomic state updates, save/restore system.
 */

import "./style.css";
import { root } from "anod";
import { createGameState, type GameState } from "./game/reactive/state.ts";
import { createChapterScope, transitionScene, disposeChapter } from "./game/reactive/engine.ts";
import {
  renderGameLog,
  renderHealthBar,
  renderGoldCounter,
  renderChapterName,
  renderScene,
} from "./game/reactive/render.ts";
import { createAutoSave, loadSave, restoreState, deleteSave } from "./game/reactive/save.ts";
import { createShareButton } from "./game/reactive/share.ts";
import { setupPrologue } from "./game/scenes/prologue.ts";
import { setupMarket } from "./game/scenes/market.ts";
import { setupForest } from "./game/scenes/forest.ts";
import { setupTower } from "./game/scenes/tower.ts";
import { setupEpilogue } from "./game/scenes/epilogue.ts";
import { getChapterForScene } from "./game/data/scenes.ts";
import { CH_PROLOGUE, CH_MARKET, CH_FOREST, CH_TOWER, CH_EPILOGUE } from "./game/data/constants.ts";

/** Build the game DOM structure. */
function createGameDOM(): {
  statusBar: HTMLElement;
  healthBar: HTMLElement;
  healthText: HTMLElement;
  goldEl: HTMLElement;
  chapterEl: HTMLElement;
  shareBtn: HTMLButtonElement;
  narrativeEl: HTMLElement;
  choicesEl: HTMLElement;
  logEl: HTMLElement;
} {
  const app = document.getElementById("app")!;
  app.innerHTML = "";

  /** Status bar. */
  const statusBar = document.createElement("div");
  statusBar.className = "status-bar";

  const healthContainer = document.createElement("div");
  healthContainer.className = "health-container";
  const healthText = document.createElement("span");
  healthText.className = "health-text";
  const healthBarOuter = document.createElement("div");
  healthBarOuter.className = "health-bar-outer";
  const healthBar = document.createElement("div");
  healthBar.className = "health-bar";
  healthBarOuter.appendChild(healthBar);
  healthContainer.appendChild(healthText);
  healthContainer.appendChild(healthBarOuter);

  const goldEl = document.createElement("span");
  goldEl.className = "gold";

  const chapterEl = document.createElement("span");
  chapterEl.className = "chapter-name";

  const shareBtn = document.createElement("button");
  shareBtn.className = "share-btn";
  shareBtn.textContent = "📤 Share";

  statusBar.appendChild(healthContainer);
  statusBar.appendChild(goldEl);
  statusBar.appendChild(chapterEl);
  statusBar.appendChild(shareBtn);

  /** Narrative panel (center, largest area). */
  const narrativeEl = document.createElement("div");
  narrativeEl.className = "narrative";

  /** Choices panel. */
  const choicesEl = document.createElement("div");
  choicesEl.className = "choices";

  /** Game log (bottom, scrollable). */
  const logEl = document.createElement("div");
  logEl.className = "game-log";

  app.appendChild(statusBar);
  app.appendChild(narrativeEl);
  app.appendChild(choicesEl);
  app.appendChild(logEl);

  return {
    statusBar,
    healthBar,
    healthText,
    goldEl,
    chapterEl,
    shareBtn,
    narrativeEl,
    choicesEl,
    logEl,
  };
}

/** Get the chapter setup function for a given chapter ID. */
function getChapterSetup(
  chapterId: number,
): ((r: any, state: GameState, elements: any) => void) | null {
  if (chapterId === CH_PROLOGUE) {
    return setupPrologue;
  }
  if (chapterId === CH_MARKET) {
    return setupMarket;
  }
  if (chapterId === CH_FOREST) {
    return setupForest;
  }
  if (chapterId === CH_TOWER) {
    return setupTower;
  }
  if (chapterId === CH_EPILOGUE) {
    return setupEpilogue;
  }
  return null;
}

/** Start a new game or continue from save. */
function startGame(): void {
  const elements = createGameDOM();
  let gameRoot: ReturnType<typeof root> | null = null;

  const launch = (savedData?: any) => {
    if (gameRoot !== null) {
      gameRoot.dispose();
    }

    gameRoot = root((r) => {
      const state = createGameState();

      /** Wire up persistent UI effects. */
      renderHealthBar(r, state, elements.healthBar, elements.healthText);
      renderGoldCounter(r, state, elements.goldEl);
      renderChapterName(r, state, elements.chapterEl);
      renderGameLog(r, state, elements.logEl);
      createShareButton(r, state, elements.shareBtn);

      /** Auto-save on scene transitions. */
      createAutoSave(r, state);

      /** Render the current scene (text + choices). */
      renderScene(r, state, elements.narrativeEl, elements.choicesEl, (sceneId, _choiceIndex) => {
        transitionScene(state, sceneId);
      });

      /** Set up chapter scoping — watch for chapter changes. */
      let currentChapterId = -1;
      r.effect(state.chapter, (chapterId: number, _c: any) => {
        if (chapterId === currentChapterId) {
          return;
        }
        currentChapterId = chapterId;
        disposeChapter();
        const setup = getChapterSetup(chapterId);
        if (setup !== null) {
          createChapterScope((cr: any) => setup(cr, state, elements));
        }
      });

      /** Restore from save if we have saved data. */
      if (savedData !== undefined) {
        restoreState(state, savedData);
        /** jumpToChapter rebuilds the chapter scope. */
        const chapterId = getChapterForScene(savedData.currentScene);
        disposeChapter();
        const setup = getChapterSetup(chapterId);
        if (setup !== null) {
          createChapterScope((cr: any) => setup(cr, state, elements));
        }
      }
    });
  };

  /** Check for existing save. */
  const savedData = loadSave();
  if (savedData !== null) {
    showMainMenu(
      elements,
      () => {
        /** Continue. */
        launch(savedData);
      },
      () => {
        /** New Game. */
        deleteSave();
        launch();
      },
    );
  } else {
    launch();
  }

  /** Listen for new game events (from credits screen). */
  window.addEventListener("newgame", () => {
    deleteSave();
    if (gameRoot !== null) {
      gameRoot.dispose();
      gameRoot = null;
    }
    disposeChapter();
    launch();
  });
}

/** Show the main menu with Continue / New Game options. */
function showMainMenu(
  elements: ReturnType<typeof createGameDOM>,
  onContinue: () => void,
  onNewGame: () => void,
): void {
  elements.narrativeEl.innerHTML = `
    <div class="main-menu">
      <h1>The Signal Tower</h1>
      <p>A saved game was found. Would you like to continue?</p>
    </div>
  `;
  elements.choicesEl.innerHTML = "";

  const continueBtn = document.createElement("button");
  continueBtn.className = "choice-btn";
  continueBtn.textContent = "[1] Continue";
  continueBtn.addEventListener("click", onContinue);

  const newGameBtn = document.createElement("button");
  newGameBtn.className = "choice-btn";
  newGameBtn.textContent = "[2] New Game";
  newGameBtn.addEventListener("click", onNewGame);

  elements.choicesEl.appendChild(continueBtn);
  elements.choicesEl.appendChild(newGameBtn);
}

/** Launch the game. */
startGame();
