/**
 * render.ts — DOM rendering effects and signal methods.
 *
 * Demonstrates: effect(fn) unbound, effect(dep, fn) bound,
 * cleanup(), notify(), post(), get(), set(), set(fn), typewriter via spawn+controller.
 */

import type { GameState } from "./state.ts";
import { getScene } from "../data/scenes.ts";
import { getChapterName } from "../data/scenes.ts";
import { getTypingDelay } from "../data/dialogue.ts";

// ─── Effect Variants ─────────────────────────────────────────────────

/**
 * effect(fn) — Unbound effect that reads multiple dependencies.
 * Renders the entire game log panel. Reads currentScene + gameLog relay.
 * Re-runs whenever any dependency changes.
 */
export function renderGameLog(
	owner: any,
	state: GameState,
	logEl: HTMLElement,
) {
	return owner.effect((c: any) => {
		const log = c.val(state.gameLog);
		logEl.innerHTML = "";
		for (let i = 0; i < log.length; i++) {
			const entry = document.createElement("div");
			entry.className = "log-entry";
			entry.textContent = "> " + log[i];
			logEl.appendChild(entry);
		}
		/** Auto-scroll to bottom. */
		logEl.scrollTop = logEl.scrollHeight;
	});
}

/**
 * effect(dep, fn) — Bound effect with a single dependency.
 * Renders the health bar. Bound to the health signal for maximum performance.
 */
export function renderHealthBar(
	owner: any,
	state: GameState,
	barEl: HTMLElement,
	textEl: HTMLElement,
) {
	return owner.effect(state.health, (hp: number, _c: any) => {
		const maxHp = state.maxHealth.get();
		const pct = maxHp > 0 ? Math.floor((hp / maxHp) * 100) : 0;
		barEl.style.width = pct + "%";
		if (pct > 50) {
			barEl.style.backgroundColor = "#33ff33";
		} else if (pct > 25) {
			barEl.style.backgroundColor = "#ffcc00";
		} else {
			barEl.style.backgroundColor = "#ff3333";
		}
		textEl.textContent = `❤ ${hp}/${maxHp}`;
	});
}

/**
 * effect(dep, fn) — Bound effect for rendering the gold counter.
 */
export function renderGoldCounter(
	owner: any,
	state: GameState,
	el: HTMLElement,
) {
	return owner.effect(state.gold, (gold: number) => {
		el.textContent = `💰 ${gold}g`;
	});
}

/**
 * effect(dep, fn) — Bound effect for rendering the chapter name.
 */
export function renderChapterName(
	owner: any,
	state: GameState,
	el: HTMLElement,
) {
	return owner.effect(state.chapter, (ch: number) => {
		el.textContent = getChapterName(ch);
	});
}

// ─── Cleanup ─────────────────────────────────────────────────────────

/**
 * cleanup() — Register a cleanup function on a compute or effect.
 * Runs when the node is disposed or before re-execution.
 * Used to remove DOM event listeners when scenes transition.
 */
export function registerClickCleanup(
	c: any,
	el: HTMLElement,
	handler: EventListener,
): void {
	el.addEventListener("click", handler);
	c.cleanup(() => {
		el.removeEventListener("click", handler);
	});
}

/**
 * cleanup() — Register keyboard listener cleanup.
 */
export function registerKeyboardCleanup(c: any, handler: EventListener): void {
	document.addEventListener("keydown", handler);
	c.cleanup(() => {
		document.removeEventListener("keydown", handler);
	});
}

// ─── Signal Methods ──────────────────────────────────────────────────

/**
 * notify() — Force a sender to re-notify all subscribers.
 * Used when the game log array is mutated in place — the reference doesn't
 * change, so signal's equality check wouldn't normally fire.
 * relay() handles this automatically, but notify() is the manual escape hatch.
 */
export function forceUIRefresh(sender: any): void {
	sender.notify();
}

/**
 * post(value) — Set a signal's value via queueMicrotask.
 * The update is deferred to the next microtask, coalescing with other pending updates.
 * Used for gold updates after chest opening (avoids synchronous cascade).
 */
export function deferredUpdate(sender: any, value: any): void {
	sender.post(value);
}

/**
 * get() — Read a signal's current value without subscribing.
 * The standard way to read a signal outside of a compute/effect.
 */
export function readValue(sender: any): any {
	return sender.get();
}

/**
 * set(value) — Write a new value to a signal.
 * Notifies subscribers if the value changed (via !== for signals, always for relays).
 */
export function writeValue(sender: any, value: any): void {
	sender.set(value);
}

/**
 * set(fn) — Functional update: derives the new value from the previous value.
 * Used for gold transactions: `set(prev => prev - price)` instead of reading then writing.
 */
export function functionalUpdate(sender: any, fn: (prev: any) => any): void {
	sender.set(fn);
}

// ─── Typewriter (Spawn + Controller) ─────────────────────────────────

/**
 * Create a typewriter effect using spawn() and controller().
 * Writes text character-by-character with per-character timing.
 * controller() provides abort — clicking or pressing Space skips to full text.
 */
export function createTypewriter(
	owner: any,
	text: string,
	el: HTMLElement,
	onComplete?: () => void,
) {
	return owner.spawn(async (c: any) => {
		const ctrl = c.controller();
		el.textContent = "";
		let accumulated = "";

		for (let i = 0; i < text.length; i++) {
			if (ctrl.signal.aborted) {
				break;
			}
			accumulated += text[i];
			el.textContent = accumulated;
			const delay = getTypingDelay(text[i]);
			await new Promise((resolve) => setTimeout(resolve, delay));
		}

		/** On abort or completion, show full text. */
		el.textContent = text;
		if (onComplete !== undefined) {
			onComplete();
		}
	});
}

/**
 * Render the scene text and choices for the current scene.
 * Unbound effect — reads currentScene and renders accordingly.
 */
export function renderScene(
	owner: any,
	state: GameState,
	narrativeEl: HTMLElement,
	choicesEl: HTMLElement,
	onChoice: (sceneId: number, choiceIndex: number) => void,
) {
	return owner.effect((c: any) => {
		const sceneId = c.val(state.currentScene);
		const scene = getScene(sceneId);
		if (scene === undefined) {
			narrativeEl.textContent = "Scene not found.";
			choicesEl.innerHTML = "";
			return;
		}

		/** Clear previous content. */
		choicesEl.innerHTML = "";
		narrativeEl.textContent = "";

		/** Track whether the typewriter has been skipped/completed. */
		let done = false;

		const showFull = () => {
			if (done) {
				return;
			}
			done = true;
			narrativeEl.textContent = scene.text;
			renderChoices(c, state, scene.choices, choicesEl, onChoice);
		};

		/** Typewriter for scene text — use an AbortController so we can cancel it. */
		const ctrl = new AbortController();
		const typewrite = async () => {
			let accumulated = "";
			for (let i = 0; i < scene.text.length; i++) {
				if (ctrl.signal.aborted) {
					return;
				}
				accumulated += scene.text[i];
				narrativeEl.textContent = accumulated;
				const delay = getTypingDelay(scene.text[i]);
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
			showFull();
		};
		typewrite();

		/** Allow skipping typewriter with Space or click. */
		const keyHandler = (e: Event) => {
			if ((e as KeyboardEvent).key === " ") {
				e.preventDefault();
				ctrl.abort();
				showFull();
			}
		};

		const clickHandler = () => {
			ctrl.abort();
			showFull();
		};

		narrativeEl.addEventListener("click", clickHandler, { once: true });
		document.addEventListener("keydown", keyHandler, { once: true });

		/** Abort typewriter and remove listeners on cleanup (scene change). */
		c.cleanup(() => {
			ctrl.abort();
			narrativeEl.removeEventListener("click", clickHandler);
			document.removeEventListener("keydown", keyHandler);
		});
	});
}

/**
 * Render choice buttons for a scene.
 * Handles conditional choices (hidden if condition returns false).
 */
function renderChoices(
	c: any,
	state: GameState,
	choices: Array<{
		text: string;
		sceneId: number;
		condition?: (s: any) => boolean;
	}>,
	container: HTMLElement,
	onChoice: (sceneId: number, choiceIndex: number) => void,
): void {
	container.innerHTML = "";

	const currentState = {
		inventory: state.inventory.get(),
		gold: state.gold.get(),
		playerClass: state.playerClass.get(),
		visitedScenes: state.visitedScenes.get(),
	};

	let buttonIndex = 0;
	for (let i = 0; i < choices.length; i++) {
		const choice = choices[i];
		/** Hide choice if condition fails. */
		if (choice.condition !== undefined && !choice.condition(currentState)) {
			continue;
		}
		buttonIndex++;
		const btn = document.createElement("button");
		btn.className = "choice-btn";
		btn.textContent = `[${buttonIndex}] ${choice.text}`;
		const sceneId = choice.sceneId;
		const idx = i;
		const handler = () => onChoice(sceneId, idx);
		btn.addEventListener("click", handler);
		container.appendChild(btn);
	}

	/** Keyboard shortcuts: 1-9 for choices. */
	const keyHandler = (e: Event) => {
		const key = (e as KeyboardEvent).key;
		const num = parseInt(key, 10);
		if (num >= 1 && num <= buttonIndex) {
			const buttons = container.querySelectorAll(".choice-btn");
			if (buttons[num - 1] !== undefined) {
				(buttons[num - 1] as HTMLButtonElement).click();
			}
		}
	};
	document.addEventListener("keydown", keyHandler);
	c.cleanup(() => {
		document.removeEventListener("keydown", keyHandler);
	});
}
