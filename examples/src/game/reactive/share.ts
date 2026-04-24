/**
 * share.ts — Reactive share button wiring.
 *
 * Demonstrates: effect(dep, fn) bound, get() for reading state,
 * cleanup() for removing click listener on dispose.
 */

import type { GameState } from "./state.ts";
import { getChapterName } from "../data/scenes.ts";
import { formatItemName } from "../data/items.ts";
import { renderProgressCard, formatInventorySummary } from "../data/share.ts";
import { getClassName } from "../data/dialogue.ts";

/**
 * effect(dep, fn) — Bound effect that updates the share button label.
 * Depends on the chapter signal. When chapter changes, the button text
 * updates to show the current chapter name.
 */
export function createShareButton(owner: any, state: GameState, buttonEl: HTMLButtonElement) {
  return owner.effect(state.chapter, (ch: number, c: any) => {
    buttonEl.textContent = `📤 Share Ch.${ch}`;

    const handler = () => shareProgress(state);
    buttonEl.addEventListener("click", handler);
    c.cleanup(() => {
      buttonEl.removeEventListener("click", handler);
    });
  });
}

/**
 * Generate a share image from the current game state.
 * Reads all state via get(), renders to canvas, returns a blob.
 */
export function generateShareImage(state: GameState): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  const inventory = state.inventory.get();
  const itemNames: string[] = [];
  for (let i = 0; i < inventory.length; i++) {
    itemNames.push(formatItemName(inventory[i]));
  }

  renderProgressCard(canvas, {
    playerName: state.playerName.get(),
    playerClass: state.playerClass.get(),
    health: state.health.get(),
    maxHealth: state.maxHealth.get(),
    gold: state.gold.get(),
    chapter: state.chapter.get(),
    chapterName: getChapterName(state.chapter.get()),
    inventoryCount: inventory.length,
    inventorySummary: formatInventorySummary(itemNames),
    questsCompleted: state.questLog.get().length,
    questsTotal: 8,
    scenesVisited: state.visitedScenes.get().length,
  });

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

/**
 * Share the progress card via Web Share API, clipboard, or download.
 * Cascade of fallbacks for maximum browser compatibility.
 */
export async function shareProgress(state: GameState): Promise<void> {
  const blob = await generateShareImage(state);
  if (blob === null) {
    return;
  }

  /** Try Web Share API first (mobile + some desktop). */
  if (typeof navigator.share === "function") {
    try {
      const file = new File([blob], "signal-tower-progress.png", {
        type: "image/png",
      });
      await navigator.share({ files: [file] });
      showToast("Shared!");
      return;
    } catch {
      /** User cancelled or share failed — fall through to clipboard. */
    }
  }

  /** Try clipboard API. */
  if (typeof navigator.clipboard !== "undefined" && typeof ClipboardItem !== "undefined") {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      showToast("Copied to clipboard!");
      return;
    } catch {
      /** Clipboard blocked — fall through to download. */
    }
  }

  /** Final fallback: download as PNG. */
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "signal-tower-progress.png";
  a.click();
  URL.revokeObjectURL(url);
  showToast("Downloaded!");
}

/** Show a brief toast notification. */
function showToast(message: string): void {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 2000);
}
