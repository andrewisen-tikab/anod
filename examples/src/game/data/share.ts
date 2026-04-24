/**
 * share.ts — Canvas-based progress card rendering.
 *
 * Pure functions. No anod imports.
 * Draws a progress card onto a canvas element for sharing.
 */

import { getClassName } from "./dialogue.ts";

export interface ShareData {
  playerName: string;
  playerClass: number;
  health: number;
  maxHealth: number;
  gold: number;
  chapter: number;
  chapterName: string;
  inventoryCount: number;
  inventorySummary: string;
  questsCompleted: number;
  questsTotal: number;
  scenesVisited: number;
}

/** Card dimensions. */
const CARD_WIDTH = 600;
const CARD_HEIGHT = 400;

/** Colors matching the game's terminal theme. */
const BG_COLOR = "#0a0f0a";
const TEXT_COLOR = "#33ff33";
const DIM_COLOR = "#1a7a1a";
const ACCENT_COLOR = "#ffcc00";

/**
 * Render the progress card onto a canvas element.
 * The canvas should be CARD_WIDTH × CARD_HEIGHT.
 */
export function renderProgressCard(canvas: HTMLCanvasElement, data: ShareData): void {
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    return;
  }

  /** Background */
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  /** Border */
  ctx.strokeStyle = DIM_COLOR;
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, CARD_WIDTH - 8, CARD_HEIGHT - 8);

  /** Title */
  ctx.font = "bold 24px monospace";
  ctx.fillStyle = ACCENT_COLOR;
  ctx.fillText("⚔  THE SIGNAL TOWER", 30, 45);

  /** Player name and class */
  ctx.font = "18px monospace";
  ctx.fillStyle = TEXT_COLOR;
  ctx.fillText(`${data.playerName} the ${getClassName(data.playerClass)}`, 30, 85);

  /** Health and gold */
  ctx.font = "16px monospace";
  ctx.fillText(`❤ ${data.health}/${data.maxHealth} HP   💰 ${data.gold} gold`, 30, 115);

  /** Chapter and progress */
  ctx.fillStyle = ACCENT_COLOR;
  ctx.fillText(data.chapterName, 30, 155);

  /** Progress bar */
  const progress = getChapterProgress(data.chapter);
  const barX = 30;
  const barY = 170;
  const barWidth = 300;
  const barHeight = 16;
  ctx.fillStyle = DIM_COLOR;
  ctx.fillRect(barX, barY, barWidth, barHeight);
  ctx.fillStyle = TEXT_COLOR;
  ctx.fillRect(barX, barY, Math.floor((barWidth * progress) / 100), barHeight);
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = "14px monospace";
  ctx.fillText(`${progress}% complete`, barX + barWidth + 10, barY + 13);

  /** Inventory */
  ctx.font = "16px monospace";
  ctx.fillStyle = TEXT_COLOR;
  ctx.fillText(`Inventory (${data.inventoryCount} items):`, 30, 215);
  ctx.font = "14px monospace";
  ctx.fillStyle = DIM_COLOR;
  ctx.fillText(data.inventorySummary || "(empty)", 30, 240);

  /** Quests */
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = "16px monospace";
  ctx.fillText(`Quests: ${data.questsCompleted}/${data.questsTotal} completed`, 30, 280);
  ctx.fillText(`Scenes visited: ${data.scenesVisited}`, 30, 310);

  /** Footer */
  ctx.fillStyle = DIM_COLOR;
  ctx.font = "12px monospace";
  ctx.fillText("Built with anod — reactive signals for JavaScript", 30, 370);
}

/** Convert chapter number to completion percentage. */
export function getChapterProgress(chapter: number): number {
  if (chapter === 0) {
    return 0;
  }
  if (chapter === 1) {
    return 20;
  }
  if (chapter === 2) {
    return 40;
  }
  if (chapter === 3) {
    return 60;
  }
  return 100;
}

/**
 * Format inventory items into a grouped summary string.
 * Groups duplicate items with count: "Health Potion ×2 · Iron Sword · Torch"
 */
export function formatInventorySummary(itemNames: string[]): string {
  if (itemNames.length === 0) {
    return "";
  }

  /** Count occurrences of each item name. */
  const counts = new Map<string, number>();
  for (let i = 0; i < itemNames.length; i++) {
    const name = itemNames[i];
    const current = counts.get(name);
    if (current !== undefined) {
      counts.set(name, current + 1);
    } else {
      counts.set(name, 1);
    }
  }

  /** Build grouped string. */
  const parts: string[] = [];
  counts.forEach((count, name) => {
    if (count > 1) {
      parts.push(`${name} ×${count}`);
    } else {
      parts.push(name);
    }
  });

  return parts.join(" · ");
}
