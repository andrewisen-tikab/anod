/**
 * scenes.ts — Scene definitions with text content and choices.
 *
 * Each scene is a plain object. No anod imports.
 * Scene text is the narrative content displayed in the terminal panel.
 * Choices define the buttons the player can click.
 */

import {
  SCENE_ARRIVAL,
  SCENE_CLASS_SELECT,
  SCENE_QUEST_ACCEPT,
  SCENE_MARKET_ENTRANCE,
  SCENE_GRIT_SHOP,
  SCENE_GRIT_HAGGLE,
  SCENE_MARKET_EXIT,
  SCENE_FOREST_ENTRANCE,
  SCENE_LUMA_ENCOUNTER,
  SCENE_FOREST_PATH,
  SCENE_FOREST_CLEARING,
  SCENE_FOREST_EXIT,
  SCENE_TOWER_BASE,
  SCENE_TOWER_ASCENT,
  SCENE_TOWER_SUMMIT,
  SCENE_COMBAT,
  SCENE_VICTORY,
  SCENE_DEFEAT,
  SCENE_RETURN,
  SCENE_MAREN_FINALE,
  SCENE_SUMMARY,
  SCENE_CREDITS,
  CH_PROLOGUE,
  CH_MARKET,
  CH_FOREST,
  CH_TOWER,
  CH_EPILOGUE,
  CLASS_WARRIOR,
  CLASS_MAGE,
  CLASS_ROGUE,
  ITEM_TOWER_KEY,
  ITEM_TORCH,
  ITEM_LOCKPICK_SET,
} from "./constants.ts";

export interface Choice {
  text: string;
  sceneId: number;
  /** If provided, choice is hidden when this returns false. */
  condition?: (state: SceneState) => boolean;
}

/** Minimal state interface passed to scene conditions — avoids importing anod. */
export interface SceneState {
  inventory: number[];
  gold: number;
  playerClass: number;
  visitedScenes: number[];
}

export interface Scene {
  id: number;
  chapter: number;
  title: string;
  text: string;
  choices: Choice[];
}

/** Master scene registry. */
const SCENES: Map<number, Scene> = new Map();

function defineScene(
  id: number,
  chapter: number,
  title: string,
  text: string,
  choices: Choice[],
): void {
  SCENES.set(id, { id, chapter, title, text, choices });
}

// ─── Chapter 0: Prologue ─────────────────────────────────────────────

defineScene(
  SCENE_ARRIVAL,
  CH_PROLOGUE,
  "The Village of Thornwick",
  `The road ends at a weathered stone arch. Beyond it, the village of Thornwick hunches beneath a pale sky. Smoke curls from chimneys, but the streets are quiet — too quiet for midday.

An elderly woman stands at the arch, her silver hair braided tight. She watches you approach with sharp, knowing eyes.

> Maren: "Stranger. You've come at the right time — or the worst. See that tower?"

She points east. Above the treeline, a spire of dark stone rises impossibly high. Pulses of blue light ripple up its surface like a heartbeat.

> Maren: "It appeared three nights ago. No one who enters has returned. I need someone brave — or foolish — to investigate."

> Maren: "But first... what is your name?"`,
  [{ text: "Enter your name", sceneId: SCENE_CLASS_SELECT }],
);

defineScene(
  SCENE_CLASS_SELECT,
  CH_PROLOGUE,
  "Choose Your Path",
  `Maren nods thoughtfully.

> Maren: "Every adventurer has a specialty. Which path have you walked?"

Choose your class:

⚔ WARRIOR — Strong and resilient. High damage (15), low crit chance (10%). You receive an Iron Sword.

🔮 MAGE — Cunning and precise. Medium damage (10), high crit chance (30%). You receive an Oak Staff.

🗡 ROGUE — Swift and deadly. Low damage (8), very high crit chance (45%). You receive a Rusty Dagger.`,
  [
    { text: "⚔ I am a Warrior", sceneId: SCENE_QUEST_ACCEPT },
    { text: "🔮 I am a Mage", sceneId: SCENE_QUEST_ACCEPT },
    { text: "🗡 I am a Rogue", sceneId: SCENE_QUEST_ACCEPT },
  ],
);

defineScene(
  SCENE_QUEST_ACCEPT,
  CH_PROLOGUE,
  "The Quest Begins",
  `Maren clasps your hand firmly.

> Maren: "Good. Then hear me — the Signal Tower must be investigated. Whatever force brought it here is growing stronger. The lights grow brighter each night, and the livestock have stopped sleeping."

She presses a worn leather pouch into your palm.

> Maren: "50 gold. Spend it wisely at the market. Grit sells supplies — and he has a key. You'll need it."

> Maren: "Go now. The market is just ahead. And stranger... come back alive."

Quest added: Investigate the Signal Tower`,
  [{ text: "Head to the market", sceneId: SCENE_MARKET_ENTRANCE }],
);

// ─── Chapter 1: The Market ──────────────────────────────────────────

defineScene(
  SCENE_MARKET_ENTRANCE,
  CH_MARKET,
  "Thornwick Market",
  `The market square opens before you — a handful of stalls draped in faded canvas. Most are shuttered. Only one still trades: a cluttered stall overflowing with weapons, potions, and oddities.

Behind the counter stands a stocky man with a braided beard and arms like tree trunks. He grins as you approach.

> Grit: "Well, well. Fresh meat! Name's Grit. I sell everything worth buying — and a few things that aren't. Take a look."`,
  [
    { text: "Browse Grit's shop", sceneId: SCENE_GRIT_SHOP },
    { text: "Ask about the Tower Key", sceneId: SCENE_GRIT_HAGGLE },
  ],
);

defineScene(
  SCENE_GRIT_SHOP,
  CH_MARKET,
  "Grit's Shop",
  `Grit spreads his wares across the counter. The items glint under the cloudy sky.

> Grit: "Buy, sell, trade — I don't care which, long as coin changes hands. Need healing? Got potions. Need light? Got torches. Need to get into that cursed tower? Well..."

He taps a heavy iron key hanging from a hook behind him.

> Grit: "That one'll cost you."`,
  [
    { text: "Continue shopping", sceneId: SCENE_GRIT_SHOP },
    { text: "Haggle with Grit", sceneId: SCENE_GRIT_HAGGLE },
    { text: "Leave the market", sceneId: SCENE_MARKET_EXIT },
  ],
);

defineScene(
  SCENE_GRIT_HAGGLE,
  CH_MARKET,
  "Haggling with Grit",
  `You lean on the counter and lower your voice.

> You: "That Tower Key. What's the real price?"

Grit scratches his beard, eyes narrowing.

> Grit: "Hmm... let me think on that..."`,
  [
    { text: "Back to shopping", sceneId: SCENE_GRIT_SHOP },
    { text: "Leave the market", sceneId: SCENE_MARKET_EXIT },
  ],
);

defineScene(
  SCENE_MARKET_EXIT,
  CH_MARKET,
  "Leaving the Market",
  `You turn toward the eastern road. The forest begins where the cobblestones end — a wall of ancient oaks and twisted undergrowth.`,
  [
    {
      text: "Enter the Whispering Woods",
      sceneId: SCENE_FOREST_ENTRANCE,
      condition: (s) => s.inventory.indexOf(ITEM_TOWER_KEY) !== -1,
    },
    {
      text: "Go back to Grit (you need the Tower Key)",
      sceneId: SCENE_GRIT_SHOP,
    },
  ],
);

// ─── Chapter 2: The Forest ──────────────────────────────────────────

defineScene(
  SCENE_FOREST_ENTRANCE,
  CH_FOREST,
  "The Whispering Woods",
  `The canopy closes overhead like a vault. What little light remains turns green and sickly. The trees lean toward you, their bark carved with symbols you can't read.

The air smells of moss and something else — ozone, like before a storm.

Deeper in, a faint glow pulses between the trunks. Something waits.`,
  [
    {
      text: "Light your torch and proceed",
      sceneId: SCENE_LUMA_ENCOUNTER,
      condition: (s) => s.inventory.indexOf(ITEM_TORCH) !== -1,
    },
    { text: "Proceed into the darkness", sceneId: SCENE_LUMA_ENCOUNTER },
  ],
);

defineScene(
  SCENE_LUMA_ENCOUNTER,
  CH_FOREST,
  "The Spirit Luma",
  `A sphere of pale light drifts between the trees and stops before you. It pulses once, twice — then unfolds into a translucent figure: humanoid but not human, with eyes like captured starlight.

> Luma: "Another one comes seeking the tower. Very well."

The spirit tilts its head, studying you.

> Luma: "I will let you pass... if you answer my riddle."

> Luma: "What has roots as nobody sees, is taller than trees, up, up it goes, and yet never grows?"`,
  [
    { text: '"A mountain"', sceneId: SCENE_FOREST_PATH },
    { text: '"A river"', sceneId: SCENE_LUMA_ENCOUNTER },
    { text: '"The Signal Tower"', sceneId: SCENE_LUMA_ENCOUNTER },
  ],
);

defineScene(
  SCENE_FOREST_PATH,
  CH_FOREST,
  "The Fork in the Path",
  `Luma shimmers approvingly.

> Luma: "Correct. A mountain. You may pass."

The spirit fades, and ahead the path splits in two.

The LEFT path is narrow and steep, winding through thorny undergrowth. Claw marks score the trees. It looks faster — but dangerous.

The RIGHT path curves gently through a mossy clearing. Wildflowers dot the ground. It's longer, but you can see where you're going.`,
  [
    {
      text: "Take the left path (dangerous shortcut)",
      sceneId: SCENE_FOREST_EXIT,
    },
    {
      text: "Take the right path (safe, longer)",
      sceneId: SCENE_FOREST_CLEARING,
    },
  ],
);

defineScene(
  SCENE_FOREST_CLEARING,
  CH_FOREST,
  "The Hidden Clearing",
  `The right path opens into a sun-dappled clearing. At its center sits an old stone chest, half-buried in moss. Runes glow faintly on its lid.

The lock is intricate — but not impossible.`,
  [
    {
      text: "Pick the lock",
      sceneId: SCENE_FOREST_EXIT,
      condition: (s) => s.inventory.indexOf(ITEM_LOCKPICK_SET) !== -1,
    },
    { text: "Leave the chest and continue", sceneId: SCENE_FOREST_EXIT },
  ],
);

defineScene(
  SCENE_FOREST_EXIT,
  CH_FOREST,
  "The Tower Looms",
  `The trees thin. The forest floor turns to bare stone. And there it is.

The Signal Tower rises before you — impossibly tall, carved from stone so dark it seems to drink the light. Blue energy pulses along its surface in rhythmic waves, climbing toward the peak.

At its base, a single iron door waits. The keyhole matches the key in your pack.

> Luma (whispering from the trees): "Be careful in there. The tower reflects what it finds."`,
  [{ text: "Approach the Signal Tower", sceneId: SCENE_TOWER_BASE }],
);

// ─── Chapter 3: The Tower ───────────────────────────────────────────

defineScene(
  SCENE_TOWER_BASE,
  CH_TOWER,
  "The Tower Entrance",
  `You slide the Tower Key into the lock. It turns with a sound like a heartbeat — a deep, resonant thud that vibrates through the stone.

The door swings inward. Inside, spiral stairs climb into blue-tinged darkness. The air hums with energy.

The key crumbles to dust in your hand. There's no going back.`,
  [{ text: "Begin the ascent", sceneId: SCENE_TOWER_ASCENT }],
);

defineScene(
  SCENE_TOWER_ASCENT,
  CH_TOWER,
  "The Ascent",
  `You climb. The stairs spiral endlessly upward. The walls pulse with light, and you hear whispers — fragments of thoughts that aren't yours.

"...turn back..."
"...not worthy..."
"...the signal grows..."

The tower hums louder with each floor. The stone beneath your fingers is warm, almost alive.`,
  [{ text: "Keep climbing", sceneId: SCENE_TOWER_SUMMIT }],
);

defineScene(
  SCENE_TOWER_SUMMIT,
  CH_TOWER,
  "The Summit",
  `The stairs end at a vast circular chamber. The ceiling is open to the sky — or what should be the sky. Instead, a vortex of blue energy swirls above, crackling with power.

In the center of the chamber stands a figure in cracked armor. Its eyes glow the same blue as the tower. It turns to face you.

> The Warden: "You should not have come. The signal must not be disturbed."

The Warden raises a massive blade.

> The Warden: "I am the last guardian. And you... are the last intruder."`,
  [
    { text: "Draw your weapon", sceneId: SCENE_COMBAT },
    { text: "Try to reason with the Warden", sceneId: SCENE_COMBAT },
  ],
);

defineScene(
  SCENE_COMBAT,
  CH_TOWER,
  "Combat: The Warden",
  `The Warden attacks! Blue energy crackles along its blade as it swings.

Choose your action wisely. The Warden is powerful — 150 HP, heavy armor, and strikes that leave trails of light.`,
  [
    { text: "⚔ Attack", sceneId: SCENE_COMBAT },
    { text: "❤ Heal", sceneId: SCENE_COMBAT },
    { text: "💨 Flee", sceneId: SCENE_TOWER_SUMMIT },
  ],
);

defineScene(
  SCENE_VICTORY,
  CH_TOWER,
  "Victory!",
  `The Warden staggers. Cracks of light spread across its armor. It drops to one knee.

> The Warden: "You... have silenced the signal. The tower... will sleep now."

The blue energy fades. The vortex above slows, then dissipates into wisps of light. The Warden's armor crumbles, revealing nothing inside but a faintly glowing crest.

You pick up the Warden's Crest. The tower is quiet now.`,
  [{ text: "Descend the tower", sceneId: SCENE_RETURN }],
);

defineScene(
  SCENE_DEFEAT,
  CH_TOWER,
  "Defeat",
  `The Warden's blade connects. The world tilts. You fall to your knees as darkness creeps in from the edges of your vision.

> The Warden: "The tower claims another."

Everything goes dark...

But wait — the tower's light flickers. Something pulls you back. You feel your strength returning, as if time itself is rewinding.

Perhaps you can try again.`,
  [
    { text: "Replay this chapter", sceneId: SCENE_TOWER_BASE },
    { text: "Accept defeat (credits)", sceneId: SCENE_CREDITS },
  ],
);

// ─── Chapter 4: Epilogue ────────────────────────────────────────────

defineScene(
  SCENE_RETURN,
  CH_EPILOGUE,
  "The Return",
  `The tower is silent now. You descend the stairs — they feel shorter somehow. The whispers are gone, replaced by ordinary silence.

Outside, the forest has changed. The trees stand straight. Sunlight streams through the canopy. Birds sing.

The walk back to Thornwick is peaceful. For the first time in days, you breathe easily.`,
  [{ text: "Return to Thornwick", sceneId: SCENE_MAREN_FINALE }],
);

defineScene(
  SCENE_MAREN_FINALE,
  CH_EPILOGUE,
  "Maren's Welcome",
  `Maren waits at the village arch, exactly where you first met her. But now she's smiling.

> Maren: "You did it. I can feel it — the air is lighter. The signal has stopped."

She takes the Warden's Crest from your hands and examines it.

> Maren: "Let me see what you've accomplished on your journey..."`,
  [{ text: "Show your quest log", sceneId: SCENE_SUMMARY }],
);

defineScene(
  SCENE_SUMMARY,
  CH_EPILOGUE,
  "Adventure Summary",
  `Maren reviews your journey in detail. The villagers begin to emerge from their homes, drawn by the silence of the tower.

Your final statistics are being tallied...`,
  [{ text: "View final score", sceneId: SCENE_CREDITS }],
);

defineScene(
  SCENE_CREDITS,
  CH_EPILOGUE,
  "Credits",
  `═══════════════════════════════════════
         THE SIGNAL TOWER
           - Fin -
═══════════════════════════════════════

A reactive adventure built with anod.

Thank you for playing.`,
  [{ text: "🔄 Play Again", sceneId: SCENE_ARRIVAL }],
);

// ─── Public API ─────────────────────────────────────────────────────

/** Look up a scene by its numeric ID. */
export function getScene(id: number): Scene | undefined {
  return SCENES.get(id);
}

/** Get the list of scene IDs belonging to a chapter. */
export function getChapterScenes(chapterId: number): number[] {
  if (chapterId === CH_PROLOGUE) {
    return [SCENE_ARRIVAL, SCENE_CLASS_SELECT, SCENE_QUEST_ACCEPT];
  }
  if (chapterId === CH_MARKET) {
    return [SCENE_MARKET_ENTRANCE, SCENE_GRIT_SHOP, SCENE_GRIT_HAGGLE, SCENE_MARKET_EXIT];
  }
  if (chapterId === CH_FOREST) {
    return [
      SCENE_FOREST_ENTRANCE,
      SCENE_LUMA_ENCOUNTER,
      SCENE_FOREST_PATH,
      SCENE_FOREST_CLEARING,
      SCENE_FOREST_EXIT,
    ];
  }
  if (chapterId === CH_TOWER) {
    return [
      SCENE_TOWER_BASE,
      SCENE_TOWER_ASCENT,
      SCENE_TOWER_SUMMIT,
      SCENE_COMBAT,
      SCENE_VICTORY,
      SCENE_DEFEAT,
    ];
  }
  if (chapterId === CH_EPILOGUE) {
    return [SCENE_RETURN, SCENE_MAREN_FINALE, SCENE_SUMMARY, SCENE_CREDITS];
  }
  return [];
}

/** Get the chapter ID for a given scene. */
export function getChapterForScene(sceneId: number): number {
  if (sceneId < 10) {
    return CH_PROLOGUE;
  }
  if (sceneId < 20) {
    return CH_MARKET;
  }
  if (sceneId < 30) {
    return CH_FOREST;
  }
  if (sceneId < 40) {
    return CH_TOWER;
  }
  return CH_EPILOGUE;
}

/** Get a human-readable chapter name. */
export function getChapterName(chapterId: number): string {
  if (chapterId === CH_PROLOGUE) {
    return "Prologue: The Village of Thornwick";
  }
  if (chapterId === CH_MARKET) {
    return "Ch.1: Thornwick Market";
  }
  if (chapterId === CH_FOREST) {
    return "Ch.2: The Whispering Woods";
  }
  if (chapterId === CH_TOWER) {
    return "Ch.3: The Signal Tower";
  }
  if (chapterId === CH_EPILOGUE) {
    return "Ch.4: Return to Thornwick";
  }
  return "Unknown";
}
