/**
 * dialogue.ts — NPC dialogue trees and typing simulation.
 *
 * Pure functions. No anod imports.
 * Dialogue text is returned as strings; the reactive layer handles typewriter rendering.
 */

/**
 * Get Grit's greeting based on the player's current gold.
 * He's friendlier if you have more money to spend.
 */
export function getMerchantGreeting(gold: number): string {
  if (gold >= 100) {
    return 'Grit: "Well now! A customer with deep pockets! Let me show you the premium goods..."';
  }
  if (gold >= 50) {
    return 'Grit: "Welcome, welcome! Plenty of good stuff here for someone with your budget."';
  }
  if (gold >= 20) {
    return 'Grit: "Hmm, not much coin there. But I\'ve got bargains, if you look."';
  }
  return 'Grit: "...You even have any gold? I don\'t do charity."';
}

/**
 * Get Grit's offer for haggling over a specific item.
 * Returns the dialogue text and the haggled price.
 */
export function getMerchantOffer(
  itemName: string,
  basePrice: number,
  playerGold: number,
): { text: string; price: number } {
  /** Grit offers a discount if the player is short on funds. */
  if (playerGold < basePrice) {
    const discount = Math.floor(basePrice * 0.7);
    return {
      text: `Grit: "Tell you what — you look like you need it. ${discount} gold, final offer."`,
      price: discount,
    };
  }
  /** Otherwise he inflates the price a bit. */
  const markup = Math.floor(basePrice * 1.1);
  return {
    text: `Grit: "For the ${itemName}? ${markup} gold. Fair price — take it or leave it."`,
    price: markup,
  };
}

/**
 * Get the forest riddle. Only one riddle for simplicity.
 * Returns the question and the correct answer index (0-based).
 */
export function getForestRiddle(): {
  question: string;
  answerIndex: number;
  answers: string[];
} {
  return {
    question:
      "What has roots as nobody sees, is taller than trees, up, up it goes, and yet never grows?",
    answerIndex: 0,
    answers: ["A mountain", "A river", "The Signal Tower"],
  };
}

/**
 * Calculate a typing delay for typewriter effect.
 * Returns the delay in milliseconds per character.
 * Punctuation gets longer pauses. Pure timing logic.
 */
export function getTypingDelay(char: string): number {
  if (char === "." || char === "!" || char === "?") {
    return 120;
  }
  if (char === "," || char === ";") {
    return 80;
  }
  if (char === "\n") {
    return 150;
  }
  return 30;
}

/**
 * Simulate a "thinking" delay for NPC responses.
 * Returns a promise that resolves after a random delay.
 */
export function simulateThinkingDelay(): Promise<void> {
  const delay = 800 + Math.floor(Math.random() * 1200);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/** Get quest name by quest ID. */
export function getQuestName(questId: number): string {
  if (questId === 0) {
    return "Investigate the Signal Tower";
  }
  if (questId === 1) {
    return "Buy supplies from Grit";
  }
  if (questId === 2) {
    return "Acquire the Tower Key";
  }
  if (questId === 3) {
    return "Solve Luma's riddle";
  }
  if (questId === 4) {
    return "Find the hidden chest";
  }
  if (questId === 5) {
    return "Defeat the Warden";
  }
  if (questId === 6) {
    return "Collect the Warden's Crest";
  }
  if (questId === 7) {
    return "Return to Maren";
  }
  return "Unknown Quest";
}

/** Get class name by class ID. */
export function getClassName(classId: number): string {
  if (classId === 1) {
    return "Warrior";
  }
  if (classId === 2) {
    return "Mage";
  }
  if (classId === 3) {
    return "Rogue";
  }
  return "Adventurer";
}
