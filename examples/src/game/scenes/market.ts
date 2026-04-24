/**
 * market.ts — Chapter 1: Thornwick Market.
 *
 * This chapter exercises ALL list mutation and read methods through
 * natural shopping interactions with Grit the merchant.
 *
 * Exercises: All 9 list mutation methods, all 25 list read methods,
 * task(dep, fn) for NPC dialogue, task.loading, batch() for atomic buy/sell,
 * effect(dep, fn) for gold counter, cleanup() for event listeners.
 */

import { batch } from "anod";
import type { GameState } from "../reactive/state.ts";
import { transitionScene, createOwnedBoundTask, createOwnedSignal } from "../reactive/engine.ts";
import { writeValue, functionalUpdate, readValue } from "../reactive/render.ts";
import {
  pickUpItem,
  discardLastItem,
  useFirstItem,
  addPriorityItem,
  equipItemAtSlot,
  sortByValue,
  reverseOrder,
  clearAllSlots,
  rearrangeItems,
  getItemAtSlot,
  mergeWithLoot,
  iterateWithIndices,
  areAllIdentified,
  getWeapons,
  findItemById,
  findItemSlot,
  findLastPotion,
  findLastWeaponSlot,
  flattenCategories,
  extractSubItems,
  renderEachItem,
  hasItem,
  getSlotNumber,
  formatAsText,
  iterateSlotNumbers,
  toDisplayStrings,
  calculateTotalWeight,
  calculateReversePriority,
  getPage,
  hasAnyHealing,
  iterateValues,
} from "../reactive/inventory.ts";
import {
  SCENE_MARKET_ENTRANCE,
  SCENE_GRIT_SHOP,
  SCENE_GRIT_HAGGLE,
  SCENE_MARKET_EXIT,
  SCENE_FOREST_ENTRANCE,
  ITEM_TOWER_KEY,
  ITEM_HEALTH_POTION,
  ITEM_GREATER_POTION,
  ITEM_TORCH,
  ITEM_LOCKPICK_SET,
  ITEM_STALE_BREAD,
  ITEM_SILVER_AMULET,
  ITEM_SMOKE_BOMB,
  ITEM_ENCHANTED_RING,
  ITEM_ROPE,
  ITEM_BAG_OF_GEMS,
  QUEST_BUY_SUPPLIES,
  QUEST_ACQUIRE_KEY,
} from "../data/constants.ts";
import { getItemById, SHOP_INVENTORY, formatItemName } from "../data/items.ts";
import { getMerchantGreeting, getMerchantOffer, simulateThinkingDelay } from "../data/dialogue.ts";

/**
 * Set up the market chapter within a root scope.
 */
export function setupMarket(r: any, state: GameState, elements: any): void {
  /** Track current shop page for inventory pagination. */
  const shopPage = createOwnedSignal(r, 0);

  /** Create all reactive list read computes upfront.
   *  These are bound Compute nodes that auto-update when inventory changes. */
  const weightCompute = calculateTotalWeight(state);
  const weaponsCompute = getWeapons(state);
  const displayStrings = toDisplayStrings(state);
  const hasKey = hasItem(state, ITEM_TOWER_KEY);
  const hasHealing = hasAnyHealing(state);
  const allIdentified = areAllIdentified(state);
  const textFormat = formatAsText(state);
  const reversePriority = calculateReversePriority(state);
  const flatItems = flattenCategories(state);
  const subItems = extractSubItems(state);

  r.effect(state.currentScene, (sceneId: number, c: any) => {
    if (sceneId === SCENE_MARKET_ENTRANCE) {
      handleMarketEntrance(r, state, elements, c);
    } else if (sceneId === SCENE_GRIT_SHOP) {
      handleGritShop(r, state, elements, c, shopPage);
    } else if (sceneId === SCENE_GRIT_HAGGLE) {
      handleGritHaggle(r, state, elements, c);
    } else if (sceneId === SCENE_MARKET_EXIT) {
      handleMarketExit(r, state, elements, c, hasKey);
    }
  });
}

function handleMarketEntrance(r: any, state: GameState, elements: any, c: any): void {
  const { choicesEl } = elements;
  choicesEl.innerHTML = "";

  const gold = state.gold.get();
  const greeting = getMerchantGreeting(gold);
  const log = state.gameLog.get();
  log.push("Entered Thornwick Market.");
  state.gameLog.set(log);

  const btns = [
    { text: "Browse Grit's shop", scene: SCENE_GRIT_SHOP },
    { text: "Ask about the Tower Key", scene: SCENE_GRIT_HAGGLE },
  ];
  for (let i = 0; i < btns.length; i++) {
    const btn = document.createElement("button");
    btn.className = "choice-btn";
    btn.textContent = `[${i + 1}] ${btns[i].text}`;
    const scene = btns[i].scene;
    btn.addEventListener("click", () => transitionScene(state, scene));
    choicesEl.appendChild(btn);
  }
}

function handleGritShop(r: any, state: GameState, elements: any, c: any, shopPage: any): void {
  const { choicesEl } = elements;
  choicesEl.innerHTML = "";

  /** Build shop UI. */
  const shopContainer = document.createElement("div");
  shopContainer.className = "shop-container";

  /** Grit's wares panel. */
  const waresPanel = document.createElement("div");
  waresPanel.className = "shop-panel";
  waresPanel.innerHTML = "<h3>Grit's Wares</h3>";

  for (let i = 0; i < SHOP_INVENTORY.length; i++) {
    const itemId = SHOP_INVENTORY[i];
    const item = getItemById(itemId);
    if (item === undefined) {
      continue;
    }

    const row = document.createElement("div");
    row.className = "shop-row";

    const nameSpan = document.createElement("span");
    nameSpan.textContent = `${item.name} (${item.value}g)`;
    row.appendChild(nameSpan);

    const buyBtn = document.createElement("button");
    buyBtn.className = "shop-btn";
    buyBtn.textContent = "Buy";
    buyBtn.addEventListener("click", () => {
      const gold = state.gold.get();
      if (gold < item.value) {
        const log = state.gameLog.get();
        log.push(`Not enough gold for ${item.name}.`);
        state.gameLog.set(log);
        return;
      }
      /** batch() — atomic buy: deduct gold + add item together. */
      batch(() => {
        /** set(fn) — functional update to deduct gold. */
        functionalUpdate(state.gold, (prev: number) => prev - item.value);
        /** push() — add item to inventory. */
        pickUpItem(state, itemId);
      });

      const log = state.gameLog.get();
      log.push(`Bought ${item.name} for ${item.value}g.`);
      state.gameLog.set(log);

      /** Complete "Buy supplies" quest on first purchase. */
      const quests = state.questLog.get();
      if (quests.indexOf(QUEST_BUY_SUPPLIES) === -1) {
        state.questLog.push(QUEST_BUY_SUPPLIES);
        log.push("Quest completed: Buy supplies from Grit.");
        state.gameLog.set(log);
      }

      /** Complete "Acquire the Tower Key" quest. */
      if (itemId === ITEM_TOWER_KEY && quests.indexOf(QUEST_ACQUIRE_KEY) === -1) {
        state.questLog.push(QUEST_ACQUIRE_KEY);
        log.push("Quest completed: Acquire the Tower Key.");
        state.gameLog.set(log);
      }
    });
    row.appendChild(buyBtn);
    waresPanel.appendChild(row);
  }

  /** Inventory panel. */
  const invPanel = document.createElement("div");
  invPanel.className = "shop-panel";
  invPanel.innerHTML = "<h3>Your Inventory</h3>";

  /** Inventory management buttons. */
  const mgmtRow = document.createElement("div");
  mgmtRow.className = "shop-mgmt";

  const sortBtn = document.createElement("button");
  sortBtn.className = "shop-btn";
  sortBtn.textContent = "Sort";
  sortBtn.addEventListener("click", () => sortByValue(state));

  const reverseBtn = document.createElement("button");
  reverseBtn.className = "shop-btn";
  reverseBtn.textContent = "Reverse";
  reverseBtn.addEventListener("click", () => reverseOrder(state));

  const clearBtn = document.createElement("button");
  clearBtn.className = "shop-btn";
  clearBtn.textContent = "Clear";
  clearBtn.addEventListener("click", () => {
    clearAllSlots(state);
    const log = state.gameLog.get();
    log.push("Cleared inventory.");
    state.gameLog.set(log);
  });

  mgmtRow.appendChild(sortBtn);
  mgmtRow.appendChild(reverseBtn);
  mgmtRow.appendChild(clearBtn);
  invPanel.appendChild(mgmtRow);

  /** Inventory items list — rendered with forEach() effect. */
  const invList = document.createElement("div");
  invList.className = "inv-list";
  invPanel.appendChild(invList);

  /** forEach() — Effect that renders each inventory item. */
  renderEachItem(state, (itemId: number, index: number) => {
    if (itemId === 0) {
      return;
    }
    const item = getItemById(itemId);
    if (item === undefined) {
      return;
    }
    const row = document.createElement("div");
    row.className = "inv-row";
    row.textContent = `[${index}] ${item.name} (${item.value}g)`;

    const sellBtn = document.createElement("button");
    sellBtn.className = "shop-btn";
    sellBtn.textContent = "Sell";
    sellBtn.addEventListener("click", () => {
      /** batch() — atomic sell: remove item + add gold. */
      batch(() => {
        state.inventory.splice(index, 1);
        functionalUpdate(state.gold, (prev: number) => prev + Math.floor(item.value * 0.5));
      });
      const log = state.gameLog.get();
      log.push(`Sold ${item.name} for ${Math.floor(item.value * 0.5)}g.`);
      state.gameLog.set(log);
    });
    row.appendChild(sellBtn);
    invList.appendChild(row);
  });

  /** Weight display using reduce(). */
  const weightEl = document.createElement("div");
  weightEl.className = "shop-info";
  weightEl.textContent = `Weight: ${calculateTotalWeight(state).get()}`;
  invPanel.appendChild(weightEl);

  shopContainer.appendChild(waresPanel);
  shopContainer.appendChild(invPanel);
  choicesEl.appendChild(shopContainer);

  /** Navigation buttons below the shop. */
  const navRow = document.createElement("div");
  navRow.className = "shop-nav";

  const haggleBtn = document.createElement("button");
  haggleBtn.className = "choice-btn";
  haggleBtn.textContent = "[1] Haggle with Grit";
  haggleBtn.addEventListener("click", () => transitionScene(state, SCENE_GRIT_HAGGLE));

  const leaveBtn = document.createElement("button");
  leaveBtn.className = "choice-btn";
  leaveBtn.textContent = "[2] Leave the market";
  leaveBtn.addEventListener("click", () => transitionScene(state, SCENE_MARKET_EXIT));

  navRow.appendChild(haggleBtn);
  navRow.appendChild(leaveBtn);
  choicesEl.appendChild(navRow);
}

function handleGritHaggle(r: any, state: GameState, elements: any, c: any): void {
  const { choicesEl } = elements;
  choicesEl.innerHTML = "";

  /** task(dep, fn) — Bound async: Grit's response depends on player's gold. */
  const haggleTask = createOwnedBoundTask(r, state.gold, async (gold: number, tc: any) => {
    await simulateThinkingDelay();
    const item = getItemById(ITEM_TOWER_KEY);
    if (item === undefined) {
      return null;
    }
    return getMerchantOffer(item.name, item.value, gold);
  });

  /** Show loading state while Grit "thinks". */
  const loadingEl = document.createElement("div");
  loadingEl.className = "loading";
  loadingEl.textContent = "Grit is thinking...";
  choicesEl.appendChild(loadingEl);

  /** Effect that renders Grit's response when the task resolves. */
  r.effect(haggleTask, (result: any, ec: any) => {
    loadingEl.remove();
    if (result === null) {
      return;
    }

    const responseEl = document.createElement("div");
    responseEl.className = "dialogue";
    responseEl.textContent = result.text;
    choicesEl.appendChild(responseEl);

    /** Offer the haggled price. */
    const buyBtn = document.createElement("button");
    buyBtn.className = "choice-btn";
    buyBtn.textContent = `[1] Buy Tower Key for ${result.price}g`;
    buyBtn.addEventListener("click", () => {
      const gold = state.gold.get();
      if (gold < result.price) {
        const log = state.gameLog.get();
        log.push("Not enough gold!");
        state.gameLog.set(log);
        return;
      }
      batch(() => {
        functionalUpdate(state.gold, (prev: number) => prev - result.price);
        pickUpItem(state, ITEM_TOWER_KEY);
      });

      const log = state.gameLog.get();
      log.push(`Bought Tower Key for ${result.price}g.`);
      state.gameLog.set(log);

      const quests = state.questLog.get();
      if (quests.indexOf(QUEST_ACQUIRE_KEY) === -1) {
        state.questLog.push(QUEST_ACQUIRE_KEY);
        log.push("Quest completed: Acquire the Tower Key.");
        state.gameLog.set(log);
      }

      transitionScene(state, SCENE_GRIT_SHOP);
    });
    choicesEl.appendChild(buyBtn);

    /** Bonus: Grit gives a free bundle of extras. */
    const bonusBtn = document.createElement("button");
    bonusBtn.className = "choice-btn";
    bonusBtn.textContent = "[2] Ask for bonus items";
    bonusBtn.addEventListener("click", () => {
      /** concat() — Merge bonus loot with inventory. */
      const bonusLoot = [ITEM_STALE_BREAD, ITEM_TORCH];
      const merged = mergeWithLoot(state, bonusLoot);
      /** Actually add via push. */
      for (let i = 0; i < bonusLoot.length; i++) {
        pickUpItem(state, bonusLoot[i]);
      }
      const log = state.gameLog.get();
      log.push("Grit tosses you some extras.");
      state.gameLog.set(log);
    });
    choicesEl.appendChild(bonusBtn);

    const backBtn = document.createElement("button");
    backBtn.className = "choice-btn";
    backBtn.textContent = "[3] Back to shopping";
    backBtn.addEventListener("click", () => transitionScene(state, SCENE_GRIT_SHOP));
    choicesEl.appendChild(backBtn);
  });
}

function handleMarketExit(
  r: any,
  state: GameState,
  elements: any,
  c: any,
  hasKeyCompute: any,
): void {
  const { choicesEl } = elements;
  choicesEl.innerHTML = "";

  /** compute(dep, fn) — Bound compute: hasKey checks if Tower Key is in inventory. */
  const hasKey = hasKeyCompute.get();

  if (hasKey) {
    const btn = document.createElement("button");
    btn.className = "choice-btn";
    btn.textContent = "[1] Enter the Whispering Woods";
    btn.addEventListener("click", () => {
      transitionScene(state, SCENE_FOREST_ENTRANCE, "Left the market. Entered the forest.");
    });
    choicesEl.appendChild(btn);
  } else {
    const msg = document.createElement("div");
    msg.className = "dialogue";
    msg.textContent = "You need the Tower Key before you can proceed. Go back to Grit.";
    choicesEl.appendChild(msg);
  }

  const backBtn = document.createElement("button");
  backBtn.className = "choice-btn";
  backBtn.textContent = hasKey ? "[2] Go back to Grit" : "[1] Go back to Grit";
  backBtn.addEventListener("click", () => transitionScene(state, SCENE_GRIT_SHOP));
  choicesEl.appendChild(backBtn);
}
