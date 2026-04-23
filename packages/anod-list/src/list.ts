import { OPT_SETUP, OPT_STABLE } from "anod-core";

import {
	Signal,
	Compute,
	Effect,
	IDLE,
	FLAG_STALE,
	FLAG_INIT,
	FLAG_BOUND,
	FLAG_SCHEDULED,
	OPT_DEFER,
	connect,
	schedule,
	notify,
	flush,
	startEffect,
	startCompute,
	signal,
} from "anod-core/internal";

import type {
	ISender,
	ICompute,
	IEffect,
	ComputeFn,
	EffectFn,
	UpdateFn,
} from "anod-core/internal-types";

// Module augmentation — declare array methods on ISender and ICompute prototypes
declare module "anod-core/internal-types" {
	interface ISender<T> {
		// Read methods (return Compute)
		at(index: unknown): ICompute;
		concat(...items: unknown[]): ICompute;
		entries(): ICompute;
		every(cb: ArrayCb, opts?: number): ICompute;
		filter(cb: ArrayCb, opts?: number): ICompute;
		find(cb: ArrayCb, opts?: number, mutation?: boolean): ICompute;
		findIndex(cb: ArrayCb, opts?: number, mutation?: boolean): ICompute;
		findLast(cb: ArrayCb, opts?: number, mutation?: boolean): ICompute;
		findLastIndex(cb: ArrayCb, opts?: number, mutation?: boolean): ICompute;
		flat(depth?: unknown): ICompute;
		flatMap(cb: ArrayCb, opts?: number): ICompute;
		forEach(cb: ArrayCb, opts?: number): IEffect;
		includes(
			searchElement: unknown,
			fromIndex?: unknown,
			mutation?: boolean,
		): ICompute;
		indexOf(
			searchElement: unknown,
			fromIndex?: unknown,
			mutation?: boolean,
		): ICompute;
		join(separator?: unknown): ICompute;
		keys(): ICompute;
		map(cb: ArrayCb, opts?: number): ICompute;
		reduce(cb: unknown, initialValue?: unknown, opts?: number): ICompute;
		reduceRight(cb: unknown, initialValue?: unknown, opts?: number): ICompute;
		slice(start?: unknown, end?: unknown): ICompute;
		some(cb: ArrayCb, opts?: number): ICompute;
		values(): ICompute;
		// Mutation methods (Signal only)
		copyWithin(target: number, start: number, end?: number): void;
		fill(value: unknown, start?: number, end?: number): void;
		pop(): void;
		push(...items: unknown[]): void;
		reverse(): void;
		shift(): void;
		sort(compareFn?: (a: unknown, b: unknown) => number): void;
		splice(start: number, deleteCount?: number, ...items: unknown[]): void;
		unshift(...items: unknown[]): void;
	}

	interface ICompute<T> {
		at(index: unknown): ICompute;
		concat(...items: unknown[]): ICompute;
		entries(): ICompute;
		every(cb: ArrayCb, opts?: number): ICompute;
		filter(cb: ArrayCb, opts?: number): ICompute;
		find(cb: ArrayCb, opts?: number, mutation?: boolean): ICompute;
		findIndex(cb: ArrayCb, opts?: number, mutation?: boolean): ICompute;
		findLast(cb: ArrayCb, opts?: number, mutation?: boolean): ICompute;
		findLastIndex(cb: ArrayCb, opts?: number, mutation?: boolean): ICompute;
		flat(depth?: unknown): ICompute;
		flatMap(cb: ArrayCb, opts?: number): ICompute;
		forEach(cb: ArrayCb, opts?: number): IEffect;
		includes(
			searchElement: unknown,
			fromIndex?: unknown,
			mutation?: boolean,
		): ICompute;
		indexOf(
			searchElement: unknown,
			fromIndex?: unknown,
			mutation?: boolean,
		): ICompute;
		join(separator?: unknown): ICompute;
		keys(): ICompute;
		map(cb: ArrayCb, opts?: number): ICompute;
		reduce(cb: unknown, initialValue?: unknown, opts?: number): ICompute;
		reduceRight(cb: unknown, initialValue?: unknown, opts?: number): ICompute;
		slice(start?: unknown, end?: unknown): ICompute;
		some(cb: ArrayCb, opts?: number): ICompute;
		values(): ICompute;
	}
}

type ArrayCb<T = unknown> = (
	value: T,
	index: number,
	array: T[],
	node: ICompute,
) => unknown;

const MOD_SHIFT = 7;
const MUT_ADD = 1;
const MUT_DEL = 2;
const MUT_SORT = 4;
const MUT_OP_MASK = 7;
const MUT_LEN_SHIFT = 3;
const MUT_LEN_MASK = 0x1f;
const MUT_POS_SHIFT = 8;
const MUT_POS_MASK = 0x1ffff;

const SignalProto = (Signal as unknown as { prototype: ISender }).prototype;
const ComputeProto = (Compute as unknown as { prototype: ICompute }).prototype;

ComputeProto._getMod = function (this: ICompute): number {
	return this._dep1!._flag >>> MOD_SHIFT;
};

function encode(op: number, pos: number, len: number): number {
	return (
		((op | (len << MUT_LEN_SHIFT) | (pos << MUT_POS_SHIFT)) << MOD_SHIFT) >>> 0
	);
}

const FLAG_SENDER_MASK = 0x7f;

function modify(node: ISender, mod: number): void {
	node._flag = (node._flag & FLAG_SENDER_MASK) | mod;
	notify(node, FLAG_STALE);
	flush();
}

function setMod(node: ISender, mod: number): void {
	if (node._flag & FLAG_SCHEDULED) {
		node._flag = (node._flag & FLAG_SENDER_MASK & ~FLAG_SCHEDULED) | mod;
		notify(node, FLAG_STALE);
	}
}

// ─── Batched array mutation handlers ────────────────────────────────

function push(node: ISender, value: unknown): void {
	(node._value as unknown[]).push(value);
	setMod(node, encode(MUT_ADD, (node._value as unknown[]).length - 1, 1));
}

function pushArray(node: ISender, items: unknown): void {
	let arr = node._value as unknown[];
	let pos = arr.length;
	arr.push(...(items as unknown[]));
	setMod(node, encode(MUT_ADD, pos, (items as unknown[]).length));
}

function pop(node: ISender): void {
	(node._value as unknown[]).pop();
	setMod(node, encode(MUT_DEL, (node._value as unknown[]).length, 1));
}

function shift(node: ISender): void {
	(node._value as unknown[]).shift();
	setMod(node, encode(MUT_DEL, 0, 1));
}

function unshift(node: ISender, value: unknown): void {
	(node._value as unknown[]).unshift(value);
	setMod(node, encode(MUT_ADD, 0, 1));
}

function unshiftArray(node: ISender, items: unknown): void {
	(node._value as unknown[]).unshift(...(items as unknown[]));
	setMod(node, encode(MUT_ADD, 0, (items as unknown[]).length));
}

function reverse(node: ISender): void {
	(node._value as unknown[]).reverse();
	setMod(node, encode(MUT_SORT, 0, 0));
}

function sort(node: ISender, compareFn: unknown): void {
	(node._value as unknown[]).sort(
		compareFn as ((a: unknown, b: unknown) => number) | undefined,
	);
	setMod(node, encode(MUT_SORT, 0, 0));
}

function fill(node: ISender, value: unknown): void {
	(node._value as unknown[]).fill(value);
	setMod(node, 0);
}

function fillRange(node: ISender, args: unknown): void {
	let a = args as [unknown, number?, number?];
	(node._value as unknown[]).fill(a[0], a[1], a[2]);
	setMod(node, 0);
}

function copyWithin(node: ISender, args: unknown): void {
	let a = args as [number, number, number?];
	(node._value as unknown[]).copyWithin(a[0], a[1], a[2]);
	setMod(node, 0);
}

function splice(node: ISender, args: unknown): void {
	let a = args as [number, number | undefined, unknown[]];
	let arr = node._value as unknown[];
	let start = a[0];
	let delCount: number = a[1] ?? 0;
	let items = a[2];
	let pos =
		start < 0 ? Math.max(0, arr.length + start) : Math.min(start, arr.length);
	if (items.length === 0) {
		if (a[1] === undefined) {
			delCount = arr.length - pos;
			arr.splice(start);
		} else {
			arr.splice(start, delCount);
		}
	} else {
		arr.splice(start, delCount, ...items);
	}
	let addLen = items.length;
	let dc = (delCount ?? 0) as number;
	let op = (dc > 0 ? MUT_DEL : 0) | (addLen > 0 ? MUT_ADD : 0);
	setMod(node, op > 0 ? encode(op, pos, Math.max(dc, addLen)) : 0);
}

// ─── Helpers ────────────────────────────────────────────────────────

function isSignal(v: unknown): boolean {
	return (
		v !== null && typeof v === "object" && (v as ISender)._flag !== undefined
	);
}

function getVal(arg: unknown): unknown {
	if (
		arg !== null &&
		typeof arg === "object" &&
		(arg as ISender)._flag !== undefined
	) {
		return (arg as ISender)._value;
	}
	return arg;
}

function read(source: unknown): unknown {
	if (
		source !== null &&
		typeof source === "object" &&
		(source as ISender)._flag !== undefined
	) {
		return (source as ISender)._value;
	}
	return source;
}

// ─── computeArray factory ───────────────────────────────────────────

const _Compute = Compute as unknown as {
	new (
		opts: number,
		fn: ComputeFn,
		dep1: ISender | null,
		seed: unknown,
		args: unknown,
	): ICompute;
};
const _Effect = Effect as unknown as {
	new (
		opts: number,
		fn: EffectFn,
		dep1: ISender | null,
		owner: unknown,
		args: unknown,
	): IEffect;
};

function computeArray(
	source: ISender,
	fn: ComputeFn,
	args: unknown,
	opts?: number,
): ICompute {
	let flag = FLAG_BOUND | OPT_STABLE | OPT_SETUP | (0 | (opts as number));
	let node = new _Compute(flag, fn, source, undefined, args);
	node._dep1slot = connect(source, node, -1);
	if (!(flag & OPT_DEFER)) {
		startCompute(node);
	}
	return node;
}

// ─── Array method implementations ──────────────────────────────────

function at(
	source: unknown[],
	_node: ICompute,
	seed: unknown,
	args: unknown,
): unknown {
	return source.at(typeof args === "number" ? args : (read(args) as number));
}

SignalProto.at = ComputeProto.at = function (
	this: ISender | ICompute,
	index: unknown,
): ICompute {
	return computeArray(
		this as ISender,
		at as ComputeFn,
		index,
		isSignal(index) ? OPT_SETUP : 0,
	);
};

function concat(
	source: unknown[],
	_node: ICompute,
	seed: unknown,
	args: unknown,
): unknown[] {
	return source.concat(args as unknown[]);
}

function concatN(
	source: unknown[],
	_node: ICompute,
	seed: unknown,
	args: unknown,
): unknown[] {
	return source.concat(...(args as Iterable<unknown[]>));
}

SignalProto.concat = ComputeProto.concat = function (
	this: ISender | ICompute,
	...items: unknown[]
): ICompute {
	let len = items.length;
	if (len === 1) {
		let item = items[0];
		return computeArray(
			this as ISender,
			concat as ComputeFn,
			item,
			isSignal(item) ? OPT_SETUP : 0,
		);
	}
	return computeArray(this as ISender, concatN as ComputeFn, items);
};

function entries(
	source: unknown[],
	_node: ICompute,
): IterableIterator<[number, unknown]> {
	return source.entries();
}

SignalProto.entries = ComputeProto.entries = function (
	this: ISender | ICompute,
): ICompute {
	return computeArray(this as ISender, entries as ComputeFn, undefined);
};

function every(
	source: unknown[],
	_node: ICompute,
	prev: boolean,
	cb: ArrayCb,
): boolean {
	if (!(_node._flag & FLAG_INIT)) {
		let mod = _node._getMod!();
		if (mod > 0) {
			let op = mod & MUT_OP_MASK;
			if (prev === true) {
				if (!(op & (MUT_ADD | MUT_SORT))) {
					return true;
				}
				if (!(op & MUT_SORT) && cb.length <= 2) {
					let pos = (mod >>> MUT_POS_SHIFT) & MUT_POS_MASK;
					let len = (mod >>> MUT_LEN_SHIFT) & MUT_LEN_MASK;
					let end = Math.min(pos + len, source.length);
					for (let i = pos; i < end; i++) {
						if (!cb(source[i], i, source, _node)) {
							return false;
						}
					}
					return true;
				}
			}
			if (prev === false && !(op & (MUT_DEL | MUT_SORT)) && cb.length <= 2) {
				return false;
			}
		}
	}
	for (let i = 0; i < source.length; i++) {
		if (!cb(source[i], i, source, _node)) {
			return false;
		}
	}
	return true;
}

SignalProto.every = ComputeProto.every = function (
	this: ISender | ICompute,
	cb: ArrayCb,
	opts?: number,
): ICompute {
	return computeArray(this as ISender, every as unknown as ComputeFn, cb, opts);
};

function filter(
	source: unknown[],
	_node: ICompute,
	seed: unknown,
	cb: ArrayCb,
): unknown[] {
	let result: unknown[] = [];
	for (let i = 0; i < source.length; i++) {
		if (cb(source[i], i, source, _node)) {
			result.push(source[i]);
		}
	}
	return result;
}

SignalProto.filter = ComputeProto.filter = function (
	this: ISender | ICompute,
	cb: ArrayCb,
	opts?: number,
): ICompute {
	return computeArray(
		this as ISender,
		filter as unknown as ComputeFn,
		cb,
		opts,
	);
};

function find(
	source: unknown[],
	_node: ICompute,
	seed: unknown,
	cb: ArrayCb,
): unknown {
	for (let i = 0; i < source.length; i++) {
		if (cb(source[i], i, source, _node)) {
			return source[i];
		}
	}
	return undefined;
}

interface FindMutArgs {
	_val: ArrayCb;
	_idx: number;
}

function find_mut(
	source: unknown[],
	_node: ICompute,
	prev: unknown,
	args: FindMutArgs,
): unknown {
	let cb = args._val;
	if (!(_node._flag & FLAG_INIT)) {
		let mod = _node._getMod!();
		if (mod > 0) {
			let op = mod & MUT_OP_MASK;
			let pos = (mod >>> MUT_POS_SHIFT) & MUT_POS_MASK;
			let len = (mod >>> MUT_LEN_SHIFT) & MUT_LEN_MASK;
			let idx = args._idx;
			if (op & MUT_SORT) {
				/* noop */
			} else if (idx >= 0) {
				if (pos > idx) {
					return prev;
				}
				if (op === MUT_DEL && pos + len <= idx) {
					args._idx = idx - len;
					return source[idx - len];
				}
				if (op === MUT_ADD && cb.length <= 2) {
					let end = Math.min(pos + len, source.length);
					for (let i = pos; i < end; i++) {
						if (cb(source[i], i, source, _node)) {
							args._idx = i;
							return source[i];
						}
					}
					args._idx = idx + len;
					return source[idx + len];
				}
			} else {
				if (!(op & MUT_ADD)) {
					return undefined;
				}
				if (cb.length <= 2) {
					let end = Math.min(pos + len, source.length);
					for (let i = pos; i < end; i++) {
						if (cb(source[i], i, source, _node)) {
							args._idx = i;
							return source[i];
						}
					}
					return undefined;
				}
			}
		}
	}
	let idx = -1;
	for (let i = 0; i < source.length; i++) {
		if (cb(source[i], i, source, _node)) {
			idx = i;
			break;
		}
	}
	args._idx = idx;
	return idx >= 0 ? source[idx] : undefined;
}

SignalProto.find = ComputeProto.find = function (
	this: ISender | ICompute,
	cb: ArrayCb,
	opts?: number,
	mutation?: boolean,
): ICompute {
	if (mutation) {
		return computeArray(
			this as ISender,
			find_mut as unknown as ComputeFn,
			{ _val: cb, _idx: -1 },
			opts,
		);
	}
	return computeArray(this as ISender, find as unknown as ComputeFn, cb, opts);
};

function findIndex(
	source: unknown[],
	_node: ICompute,
	seed: unknown,
	cb: ArrayCb,
): number {
	for (let i = 0; i < source.length; i++) {
		if (cb(source[i], i, source, _node)) {
			return i;
		}
	}
	return -1;
}

function findIndex_mut(
	source: unknown[],
	_node: ICompute,
	prev: number,
	cb: ArrayCb,
): number {
	if (!(_node._flag & FLAG_INIT)) {
		let mod = _node._getMod!();
		if (mod > 0) {
			let op = mod & MUT_OP_MASK;
			let pos = (mod >>> MUT_POS_SHIFT) & MUT_POS_MASK;
			let len = (mod >>> MUT_LEN_SHIFT) & MUT_LEN_MASK;
			if (op & MUT_SORT) {
				/* noop */
			} else if (prev >= 0) {
				if (pos > prev) {
					return prev;
				}
				if (op === MUT_DEL) {
					if (pos + len <= prev) {
						return prev - len;
					}
				} else if (op === MUT_ADD && cb.length <= 2) {
					let end = Math.min(pos + len, source.length);
					for (let i = pos; i < end; i++) {
						if (cb(source[i], i, source, _node)) {
							return i;
						}
					}
					return prev + len;
				}
			} else if (prev === -1) {
				if (!(op & MUT_ADD)) {
					return -1;
				}
				if (cb.length <= 2) {
					let end = Math.min(pos + len, source.length);
					for (let i = pos; i < end; i++) {
						if (cb(source[i], i, source, _node)) {
							return i;
						}
					}
					return -1;
				}
			}
		}
	}
	for (let i = 0; i < source.length; i++) {
		if (cb(source[i], i, source, _node)) {
			return i;
		}
	}
	return -1;
}

SignalProto.findIndex = ComputeProto.findIndex = function (
	this: ISender | ICompute,
	cb: ArrayCb,
	opts?: number,
	mutation?: boolean,
): ICompute {
	return computeArray(
		this as ISender,
		(mutation ? findIndex_mut : findIndex) as unknown as ComputeFn,
		cb,
		opts,
	);
};

function findLast(
	source: unknown[],
	_node: ICompute,
	seed: unknown,
	cb: ArrayCb,
): unknown {
	for (let i = source.length - 1; i >= 0; i--) {
		if (cb(source[i], i, source, _node)) {
			return source[i];
		}
	}
	return undefined;
}

function findLast_mut(
	source: unknown[],
	_node: ICompute,
	prev: unknown,
	args: FindMutArgs,
): unknown {
	if (!(_node._flag & FLAG_INIT)) {
		let mod = _node._getMod!();
		if (mod > 0) {
			let op = mod & MUT_OP_MASK;
			let pos = (mod >>> MUT_POS_SHIFT) & MUT_POS_MASK;
			let len = (mod >>> MUT_LEN_SHIFT) & MUT_LEN_MASK;
			let idx = args._idx;
			if (op & MUT_SORT) {
				/* noop */
			} else if (idx >= 0) {
				if (op === MUT_DEL && pos > idx) {
					return prev;
				}
				if (op === MUT_ADD && args._val.length <= 2) {
					let end = Math.min(pos + len, source.length);
					let shiftedIdx = pos <= idx ? idx + len : idx;
					let lastFound = shiftedIdx;
					let lastVal: unknown = source[shiftedIdx];
					for (let i = pos; i < end; i++) {
						if (args._val(source[i], i, source, _node) && i > lastFound) {
							lastFound = i;
							lastVal = source[i];
						}
					}
					args._idx = lastFound;
					return lastVal;
				}
			} else {
				if (!(op & MUT_ADD)) {
					return undefined;
				}
				if (args._val.length <= 2) {
					let end = Math.min(pos + len, source.length);
					let lastFound = -1;
					let lastVal: unknown = undefined;
					for (let i = pos; i < end; i++) {
						if (args._val(source[i], i, source, _node)) {
							lastFound = i;
							lastVal = source[i];
						}
					}
					args._idx = lastFound;
					return lastVal;
				}
			}
		}
	}
	let idx = -1;
	for (let i = source.length - 1; i >= 0; i--) {
		if (args._val(source[i], i, source, _node)) {
			idx = i;
			break;
		}
	}
	args._idx = idx;
	return idx >= 0 ? source[idx] : undefined;
}

SignalProto.findLast = ComputeProto.findLast = function (
	this: ISender | ICompute,
	cb: ArrayCb,
	opts?: number,
	mutation?: boolean,
): ICompute {
	if (mutation) {
		return computeArray(
			this as ISender,
			findLast_mut as unknown as ComputeFn,
			{ _val: cb, _idx: -1 },
			opts,
		);
	}
	return computeArray(
		this as ISender,
		findLast as unknown as ComputeFn,
		cb,
		opts,
	);
};

function findLastIndex(
	source: unknown[],
	_node: ICompute,
	seed: unknown,
	cb: ArrayCb,
): number {
	for (let i = source.length - 1; i >= 0; i--) {
		if (cb(source[i], i, source, _node)) {
			return i;
		}
	}
	return -1;
}

function findLastIndex_mut(
	source: unknown[],
	_node: ICompute,
	prev: number,
	cb: ArrayCb,
): number {
	if (!(_node._flag & FLAG_INIT)) {
		let mod = _node._getMod!();
		if (mod > 0) {
			let op = mod & MUT_OP_MASK;
			let pos = (mod >>> MUT_POS_SHIFT) & MUT_POS_MASK;
			let len = (mod >>> MUT_LEN_SHIFT) & MUT_LEN_MASK;
			if (op & MUT_SORT) {
				/* noop */
			} else if (prev >= 0) {
				if (op === MUT_DEL && pos > prev) {
					return prev;
				}
				if (op === MUT_DEL && pos + len <= prev) {
					return prev - len;
				}
				if (op === MUT_ADD && cb.length <= 2) {
					let end = Math.min(pos + len, source.length);
					let shiftedPrev = pos <= prev ? prev + len : prev;
					let lastFound = shiftedPrev;
					for (let i = pos; i < end; i++) {
						if (cb(source[i], i, source, _node) && i > lastFound) {
							lastFound = i;
						}
					}
					return lastFound;
				}
			} else if (prev === -1) {
				if (!(op & MUT_ADD)) {
					return -1;
				}
				if (cb.length <= 2) {
					let end = Math.min(pos + len, source.length);
					let lastFound = -1;
					for (let i = pos; i < end; i++) {
						if (cb(source[i], i, source, _node)) {
							lastFound = i;
						}
					}
					return lastFound;
				}
			}
		}
	}
	for (let i = source.length - 1; i >= 0; i--) {
		if (cb(source[i], i, source, _node)) {
			return i;
		}
	}
	return -1;
}

SignalProto.findLastIndex = ComputeProto.findLastIndex = function (
	this: ISender | ICompute,
	cb: ArrayCb,
	opts?: number,
	mutation?: boolean,
): ICompute {
	return computeArray(
		this as ISender,
		(mutation ? findLastIndex_mut : findLastIndex) as unknown as ComputeFn,
		cb,
		opts,
	);
};

function flat(
	source: unknown[],
	_node: ICompute,
	seed: unknown,
	depth: unknown,
): unknown[] {
	return source.flat(getVal(depth) as number | undefined);
}

SignalProto.flat = ComputeProto.flat = function (
	this: ISender | ICompute,
	depth?: unknown,
): ICompute {
	return computeArray(
		this as ISender,
		flat as ComputeFn,
		depth,
		isSignal(depth) ? OPT_SETUP : 0,
	);
};

function flatMap(
	source: unknown[],
	_node: ICompute,
	seed: unknown,
	cb: ArrayCb,
): unknown[] {
	let result: unknown[] = [];
	for (let i = 0; i < source.length; i++) {
		let items = cb(source[i], i, source, _node);
		if (Array.isArray(items)) {
			for (let j = 0; j < items.length; j++) {
				result.push(items[j]);
			}
		} else {
			result.push(items);
		}
	}
	return result;
}

SignalProto.flatMap = ComputeProto.flatMap = function (
	this: ISender | ICompute,
	cb: ArrayCb,
	opts?: number,
): ICompute {
	return computeArray(
		this as ISender,
		flatMap as unknown as ComputeFn,
		cb,
		opts,
	);
};

function forEach(source: unknown[], _node: IEffect, cb: ArrayCb): void {
	for (let i = 0; i < source.length; i++) {
		cb(source[i], i, source, _node as unknown as ICompute);
	}
}

SignalProto.forEach = ComputeProto.forEach = function (
	this: ISender | ICompute,
	cb: ArrayCb,
	opts?: number,
): IEffect {
	let flag = FLAG_BOUND | OPT_STABLE | (0 | (opts as number));
	let node = new _Effect(
		flag,
		forEach as unknown as EffectFn,
		this as ISender,
		null,
		cb,
	);
	node._dep1slot = connect(this as ISender, node, -1);
	startEffect(node);
	return node;
};

// --- includes ---

function includes1(
	source: unknown[],
	_node: ICompute,
	seed: unknown,
	arg: unknown,
): boolean {
	return source.includes(getVal(arg));
}

interface IncludesMutArgs {
	_val: unknown;
	_idx: number;
}

function includes1_mut(
	source: unknown[],
	_node: ICompute,
	prev: boolean,
	args: IncludesMutArgs,
): boolean {
	if (!(_node._flag & FLAG_INIT)) {
		let mod = _node._getMod!();
		if (mod > 0) {
			let op = mod & MUT_OP_MASK;
			let pos = (mod >>> MUT_POS_SHIFT) & MUT_POS_MASK;
			let len = (mod >>> MUT_LEN_SHIFT) & MUT_LEN_MASK;
			let idx = args._idx;
			if (op & MUT_SORT) {
				/* noop */
			} else if (idx >= 0) {
				if (pos > idx) {
					return true;
				}
				if (op === MUT_DEL) {
					if (pos + len <= idx) {
						args._idx = idx - len;
						return true;
					}
				} else if (op === MUT_ADD) {
					let target = getVal(args._val);
					let end = Math.min(pos + len, source.length);
					for (let i = pos; i < end; i++) {
						if (source[i] === target) {
							args._idx = i;
							return true;
						}
					}
					args._idx = idx + len;
					return true;
				}
			} else {
				if (!(op & MUT_ADD)) {
					return false;
				}
				let target = getVal(args._val);
				let end = Math.min(pos + len, source.length);
				for (let i = pos; i < end; i++) {
					if (source[i] === target) {
						args._idx = i;
						return true;
					}
				}
				return false;
			}
		}
	}
	let idx = source.indexOf(getVal(args._val));
	args._idx = idx;
	return idx >= 0;
}

function includes2(
	source: unknown[],
	_node: ICompute,
	seed: unknown,
	args: unknown,
): boolean {
	let arr = args as unknown[];
	return source.includes(getVal(arr[0]), getVal(arr[1]) as number);
}

SignalProto.includes = ComputeProto.includes = function (
	this: ISender | ICompute,
	searchElement: unknown,
	fromIndex?: unknown,
	mutation?: boolean,
): ICompute {
	if (typeof fromIndex === "boolean") {
		mutation = fromIndex;
		fromIndex = undefined;
	}
	if (fromIndex === undefined) {
		if (mutation) {
			return computeArray(
				this as ISender,
				includes1_mut as unknown as ComputeFn,
				{ _val: searchElement, _idx: -1 },
				0,
			);
		}
		return computeArray(
			this as ISender,
			includes1 as ComputeFn,
			searchElement,
			isSignal(searchElement) ? OPT_SETUP : 0,
		);
	}
	return computeArray(
		this as ISender,
		includes2 as unknown as ComputeFn,
		[searchElement, fromIndex],
		0,
	);
};

// --- indexOf ---

function indexOf1(
	source: unknown[],
	_node: ICompute,
	seed: unknown,
	arg: unknown,
): number {
	return source.indexOf(getVal(arg));
}

function indexOf1_mut(
	source: unknown[],
	_node: ICompute,
	prev: number,
	arg: unknown,
): number {
	if (!(_node._flag & FLAG_INIT)) {
		let mod = _node._getMod!();
		if (mod > 0) {
			let op = mod & MUT_OP_MASK;
			let pos = (mod >>> MUT_POS_SHIFT) & MUT_POS_MASK;
			let len = (mod >>> MUT_LEN_SHIFT) & MUT_LEN_MASK;
			if (op & MUT_SORT) {
				/* noop */
			} else if (prev >= 0) {
				if (pos > prev) {
					return prev;
				}
				if (op === MUT_DEL) {
					if (pos + len <= prev) {
						return prev - len;
					}
				} else if (op === MUT_ADD) {
					let target = getVal(arg);
					let end = Math.min(pos + len, source.length);
					for (let i = pos; i < end; i++) {
						if (source[i] === target) {
							return i;
						}
					}
					return prev + len;
				}
			} else if (prev === -1) {
				if (!(op & MUT_ADD)) {
					return -1;
				}
				let target = getVal(arg);
				let end = Math.min(pos + len, source.length);
				for (let i = pos; i < end; i++) {
					if (source[i] === target) {
						return i;
					}
				}
				return -1;
			}
		}
	}
	return source.indexOf(getVal(arg));
}

function indexOf2(
	source: unknown[],
	_node: ICompute,
	seed: unknown,
	args: unknown,
): number {
	let arr = args as unknown[];
	return source.indexOf(getVal(arr[0]), getVal(arr[1]) as number);
}

SignalProto.indexOf = ComputeProto.indexOf = function (
	this: ISender | ICompute,
	searchElement: unknown,
	fromIndex?: unknown,
	mutation?: boolean,
): ICompute {
	if (typeof fromIndex === "boolean") {
		mutation = fromIndex;
		fromIndex = undefined;
	}
	if (fromIndex === undefined) {
		let fn = mutation ? indexOf1_mut : indexOf1;
		return computeArray(
			this as ISender,
			fn as unknown as ComputeFn,
			searchElement,
			isSignal(searchElement) ? OPT_SETUP : 0,
		);
	}
	return computeArray(
		this as ISender,
		indexOf2 as unknown as ComputeFn,
		[searchElement, fromIndex],
		0,
	);
};

// --- join ---

function join(
	source: unknown[],
	_node: ICompute,
	seed: unknown,
	separator: unknown,
): string {
	return source.join(
		separator !== undefined ? (getVal(separator) as string) : undefined,
	);
}

SignalProto.join = ComputeProto.join = function (
	this: ISender | ICompute,
	separator?: unknown,
): ICompute {
	return computeArray(
		this as ISender,
		join as unknown as ComputeFn,
		separator,
		isSignal(separator) ? OPT_SETUP : 0,
	);
};

// --- keys ---

function keys(
	source: unknown[],
	_node: ICompute,
	seed: unknown,
	args: unknown,
): IterableIterator<number> {
	return source.keys();
}

SignalProto.keys = ComputeProto.keys = function (
	this: ISender | ICompute,
): ICompute {
	return computeArray(this as ISender, keys as ComputeFn, undefined, 0);
};

// --- map ---

function map(
	source: unknown[],
	_node: ICompute,
	seed: unknown,
	cb: ArrayCb,
): unknown[] {
	let result = new Array(source.length);
	for (let i = 0; i < source.length; i++) {
		result[i] = cb(source[i], i, source, _node);
	}
	return result;
}

SignalProto.map = ComputeProto.map = function (
	this: ISender | ICompute,
	cb: ArrayCb,
	opts?: number,
): ICompute {
	return computeArray(this as ISender, map as unknown as ComputeFn, cb, opts);
};

// --- reduce ---

function reduce1(
	source: unknown[],
	_node: ICompute,
	seed: unknown,
	arg: unknown,
): unknown {
	let cb = arg as (
		acc: unknown,
		val: unknown,
		i: number,
		arr: unknown[],
		node: ICompute,
	) => unknown;
	if (source.length === 0) {
		throw new TypeError("Reduce of empty array with no initial value");
	}
	let acc: unknown = source[0];
	for (let i = 1; i < source.length; i++) {
		acc = cb(acc, source[i], i, source, _node);
	}
	return acc;
}

function reduce2(
	source: unknown[],
	_node: ICompute,
	seed: unknown,
	args: unknown,
): unknown {
	let arr = args as unknown[];
	let cb = arr[0] as (
		acc: unknown,
		val: unknown,
		i: number,
		arr: unknown[],
		node: ICompute,
	) => unknown;
	let initialValue = getVal(arr[1]);
	let acc = initialValue;
	for (let i = 0; i < source.length; i++) {
		acc = cb(acc, source[i], i, source, _node);
	}
	return acc;
}

SignalProto.reduce = ComputeProto.reduce = function (
	this: ISender | ICompute,
	cb: unknown,
	initialValue?: unknown,
	opts?: number,
): ICompute {
	if (arguments.length === 1) {
		return computeArray(this as ISender, reduce1 as ComputeFn, cb, opts);
	}
	return computeArray(
		this as ISender,
		reduce2 as unknown as ComputeFn,
		[cb, initialValue],
		opts,
	);
};

// --- reduceRight ---

function reduceRight1(
	source: unknown[],
	_node: ICompute,
	seed: unknown,
	arg: unknown,
): unknown {
	let cb = arg as (
		acc: unknown,
		val: unknown,
		i: number,
		arr: unknown[],
		node: ICompute,
	) => unknown;
	if (source.length === 0) {
		throw new TypeError("Reduce of empty array with no initial value");
	}
	let acc: unknown = source[source.length - 1];
	for (let i = source.length - 2; i >= 0; i--) {
		acc = cb(acc, source[i], i, source, _node);
	}
	return acc;
}

function reduceRight2(
	source: unknown[],
	_node: ICompute,
	seed: unknown,
	args: unknown,
): unknown {
	let arr = args as unknown[];
	let cb = arr[0] as (
		acc: unknown,
		val: unknown,
		i: number,
		arr: unknown[],
		node: ICompute,
	) => unknown;
	let initialValue = getVal(arr[1]);
	let acc = initialValue;
	for (let i = source.length - 1; i >= 0; i--) {
		acc = cb(acc, source[i], i, source, _node);
	}
	return acc;
}

SignalProto.reduceRight = ComputeProto.reduceRight = function (
	this: ISender | ICompute,
	cb: unknown,
	initialValue?: unknown,
	opts?: number,
): ICompute {
	if (arguments.length === 1) {
		return computeArray(this as ISender, reduceRight1 as ComputeFn, cb, opts);
	}
	return computeArray(
		this as ISender,
		reduceRight2 as unknown as ComputeFn,
		[cb, initialValue],
		opts,
	);
};

// --- slice ---

function slice0(
	source: unknown[],
	_node: ICompute,
	seed: unknown,
	args: unknown,
): unknown[] {
	return source.slice();
}

function slice1(
	source: unknown[],
	_node: ICompute,
	seed: unknown,
	arg: unknown,
): unknown[] {
	return source.slice(getVal(arg) as number);
}

function slice2(
	source: unknown[],
	_node: ICompute,
	seed: unknown,
	args: unknown,
): unknown[] {
	let arr = args as unknown[];
	return source.slice(getVal(arr[0]) as number, getVal(arr[1]) as number);
}

SignalProto.slice = ComputeProto.slice = function (
	this: ISender | ICompute,
	start?: unknown,
	end?: unknown,
): ICompute {
	let len = arguments.length;
	if (len === 0) {
		return computeArray(this as ISender, slice0 as ComputeFn, undefined);
	} else if (len === 1) {
		return computeArray(this as ISender, slice1 as ComputeFn, start, 0);
	}
	return computeArray(
		this as ISender,
		slice2 as unknown as ComputeFn,
		[start, end],
		0,
	);
};

// --- some ---

function some(
	source: unknown[],
	_node: ICompute,
	prev: boolean,
	cb: ArrayCb,
): boolean {
	if (!(_node._flag & FLAG_INIT)) {
		let mod = _node._getMod!();
		if (mod > 0) {
			let op = mod & MUT_OP_MASK;
			if (prev === false) {
				if (!(op & (MUT_ADD | MUT_SORT))) {
					return false;
				}
				if (!(op & MUT_SORT) && cb.length <= 2) {
					let pos = (mod >>> MUT_POS_SHIFT) & MUT_POS_MASK;
					let len = (mod >>> MUT_LEN_SHIFT) & MUT_LEN_MASK;
					let end = Math.min(pos + len, source.length);
					for (let i = pos; i < end; i++) {
						if (cb(source[i], i, source, _node)) {
							return true;
						}
					}
					return false;
				}
			}
			if (prev === true && !(op & (MUT_DEL | MUT_SORT)) && cb.length <= 2) {
				return true;
			}
		}
	}
	for (let i = 0; i < source.length; i++) {
		if (cb(source[i], i, source, _node)) {
			return true;
		}
	}
	return false;
}

SignalProto.some = ComputeProto.some = function (
	this: ISender | ICompute,
	cb: ArrayCb,
	opts?: number,
): ICompute {
	return computeArray(this as ISender, some as unknown as ComputeFn, cb, opts);
};

// --- values ---

function values(
	source: unknown[],
	_node: ICompute,
	seed: unknown,
	args: unknown,
): IterableIterator<unknown> {
	return source.values();
}

SignalProto.values = ComputeProto.values = function (
	this: ISender | ICompute,
): ICompute {
	return computeArray(this as ISender, values as ComputeFn, undefined);
};

// ─── Signal mutation methods ────────────────────────────────────────

SignalProto.copyWithin = function (
	this: ISender,
	target: number,
	start: number,
	end?: number,
): void {
	if (IDLE) {
		(this._value as unknown[]).copyWithin(target, start, end);
		modify(this, 0);
	} else {
		schedule(this, [target, start, end], copyWithin as UpdateFn);
	}
};

SignalProto.fill = function (
	this: ISender,
	value: unknown,
	start?: number,
	end?: number,
): void {
	if (IDLE) {
		(this._value as unknown[]).fill(value, start, end);
		modify(this, 0);
	} else {
		if (arguments.length === 1) {
			schedule(this, value, fill as UpdateFn);
		} else {
			schedule(this, [value, start, end], fillRange as UpdateFn);
		}
	}
};

SignalProto.pop = function (this: ISender): void {
	if (IDLE) {
		(this._value as unknown[]).pop();
		modify(this, encode(MUT_DEL, (this._value as unknown[]).length, 1));
	} else {
		schedule(this, null, pop as UpdateFn);
	}
};

SignalProto.push = function (this: ISender, ...items: unknown[]): void {
	let len = items.length;
	if (len > 0) {
		let arr = this._value as unknown[];
		let pos = arr.length;
		if (IDLE) {
			if (len === 1) {
				arr.push(items[0]);
			} else {
				arr.push(...items);
			}
			modify(this, encode(MUT_ADD, pos, len));
		} else {
			if (len === 1) {
				schedule(this, items[0], push as UpdateFn);
			} else {
				schedule(this, items, pushArray as UpdateFn);
			}
		}
	}
};

SignalProto.reverse = function (this: ISender): void {
	if (IDLE) {
		(this._value as unknown[]).reverse();
		modify(this, encode(MUT_SORT, 0, 0));
	} else {
		schedule(this, null, reverse as UpdateFn);
	}
};

SignalProto.shift = function (this: ISender): void {
	if (IDLE) {
		(this._value as unknown[]).shift();
		modify(this, encode(MUT_DEL, 0, 1));
	} else {
		schedule(this, null, shift as UpdateFn);
	}
};

SignalProto.sort = function (
	this: ISender,
	compareFn?: (a: unknown, b: unknown) => number,
): void {
	if (IDLE) {
		(this._value as unknown[]).sort(compareFn);
		modify(this, encode(MUT_SORT, 0, 0));
	} else {
		schedule(this, compareFn, sort as UpdateFn);
	}
};

SignalProto.splice = function (
	this: ISender,
	start: number,
	deleteCount?: number,
	...items: unknown[]
): void {
	if (IDLE) {
		let arr = this._value as unknown[];
		let pos =
			start < 0 ? Math.max(0, arr.length + start) : Math.min(start, arr.length);
		let dc: number;
		if (items.length === 0) {
			if (arguments.length === 1) {
				dc = arr.length - pos;
				arr.splice(start);
			} else {
				dc = deleteCount ?? 0;
				arr.splice(start, dc);
			}
		} else {
			dc = deleteCount ?? 0;
			arr.splice(start, dc, ...items);
		}
		let addLen = items.length;
		let op = (dc > 0 ? MUT_DEL : 0) | (addLen > 0 ? MUT_ADD : 0);
		modify(this, op > 0 ? encode(op, pos, Math.max(dc, addLen)) : 0);
	} else {
		schedule(this, [start, deleteCount, items], splice as UpdateFn);
	}
};

SignalProto.unshift = function (this: ISender, ...items: unknown[]): void {
	let len = items.length;
	if (len > 0) {
		if (IDLE) {
			if (len === 1) {
				(this._value as unknown[]).unshift(items[0]);
			} else {
				(this._value as unknown[]).unshift(...items);
			}
			modify(this, encode(MUT_ADD, 0, len));
		} else {
			if (len === 1) {
				schedule(this, items[0], unshift as UpdateFn);
			} else {
				schedule(this, items, unshiftArray as UpdateFn);
			}
		}
	}
};

export { computeArray, signal as list };
