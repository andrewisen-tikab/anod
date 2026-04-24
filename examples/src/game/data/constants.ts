/**
 * constants.ts — All numeric IDs for the game.
 *
 * Per project rules: never use strings or enums when numbers suffice.
 * Every constant is a plain number defined at the top level.
 */

// ─── Scene IDs ───────────────────────────────────────────────────────

/** Chapter 0: Prologue */
export const SCENE_ARRIVAL = 0;
export const SCENE_CLASS_SELECT = 1;
export const SCENE_QUEST_ACCEPT = 2;

/** Chapter 1: Market */
export const SCENE_MARKET_ENTRANCE = 10;
export const SCENE_GRIT_SHOP = 11;
export const SCENE_GRIT_HAGGLE = 12;
export const SCENE_MARKET_EXIT = 13;

/** Chapter 2: Forest */
export const SCENE_FOREST_ENTRANCE = 20;
export const SCENE_LUMA_ENCOUNTER = 21;
export const SCENE_FOREST_PATH = 22;
export const SCENE_FOREST_CLEARING = 23;
export const SCENE_FOREST_EXIT = 24;

/** Chapter 3: Tower */
export const SCENE_TOWER_BASE = 30;
export const SCENE_TOWER_ASCENT = 31;
export const SCENE_TOWER_SUMMIT = 32;
export const SCENE_COMBAT = 33;
export const SCENE_VICTORY = 34;
export const SCENE_DEFEAT = 35;

/** Chapter 4: Epilogue */
export const SCENE_RETURN = 40;
export const SCENE_MAREN_FINALE = 41;
export const SCENE_SUMMARY = 42;
export const SCENE_CREDITS = 43;

// ─── Chapter IDs ─────────────────────────────────────────────────────

export const CH_PROLOGUE = 0;
export const CH_MARKET = 1;
export const CH_FOREST = 2;
export const CH_TOWER = 3;
export const CH_EPILOGUE = 4;

// ─── Class IDs ───────────────────────────────────────────────────────

export const CLASS_WARRIOR = 1;
export const CLASS_MAGE = 2;
export const CLASS_ROGUE = 3;

// ─── Item IDs ────────────────────────────────────────────────────────

export const ITEM_IRON_SWORD = 1;
export const ITEM_OAK_STAFF = 2;
export const ITEM_RUSTY_DAGGER = 3;
export const ITEM_HEALTH_POTION = 4;
export const ITEM_GREATER_POTION = 5;
export const ITEM_TOWER_KEY = 6;
export const ITEM_SILVER_AMULET = 7;
export const ITEM_TORCH = 8;
export const ITEM_LOCKPICK_SET = 9;
export const ITEM_WARDENS_CREST = 10;
export const ITEM_BAG_OF_GEMS = 11;
export const ITEM_STALE_BREAD = 12;
export const ITEM_ROPE = 13;
export const ITEM_ENCHANTED_RING = 14;
export const ITEM_SMOKE_BOMB = 15;

// ─── Item Type IDs ───────────────────────────────────────────────────

export const TYPE_WEAPON = 1;
export const TYPE_CONSUMABLE = 2;
export const TYPE_QUEST = 3;
export const TYPE_ACCESSORY = 4;
export const TYPE_TOOL = 5;
export const TYPE_LOOT = 6;

// ─── Quest IDs ───────────────────────────────────────────────────────

export const QUEST_INVESTIGATE_TOWER = 0;
export const QUEST_BUY_SUPPLIES = 1;
export const QUEST_ACQUIRE_KEY = 2;
export const QUEST_SOLVE_RIDDLE = 3;
export const QUEST_FIND_CHEST = 4;
export const QUEST_DEFEAT_WARDEN = 5;
export const QUEST_COLLECT_CREST = 6;
export const QUEST_RETURN_MAREN = 7;

// ─── Combat Action IDs ──────────────────────────────────────────────

export const ACTION_ATTACK = 1;
export const ACTION_HEAL = 2;
export const ACTION_FLEE = 3;

// ─── Save Key ────────────────────────────────────────────────────────

export const SAVE_KEY = "signal-tower-save";
export const SAVE_VERSION = 1;
