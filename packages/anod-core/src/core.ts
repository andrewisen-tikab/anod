import type {
	Disposer,
	Owner,
	ISender,
	IReceiver,
	ICompute,
	IEffect,
	IChannel,
	IRoot,
	CleanupSlot,
	RecoverSlot,
	ComputeFn,
	EffectFn,
	UpdateFn,
	Err,
	Resolve,
} from "./types.js";

export type { Err, Resolve, ISender as Sender };

/* Sender flags (bits 0-6) — readable on any Sender (Signal or Compute).
 * Bits 7+ on a plain Signal are free for extension (e.g. mod encoding
 * in anod-list). */
const FLAG_STALE = 1 << 0;
const FLAG_PENDING = 1 << 1;
const FLAG_SCHEDULED = 1 << 2;
const FLAG_DISPOSED = 1 << 3;
const FLAG_ERROR = 1 << 4;
const FLAG_RELAY = 1 << 5;
const FLAG_WEAK = 1 << 6;

/* Receiver flags (bits 7+) — only valid on Compute/Effect nodes. */
const FLAG_INIT = 1 << 7;
const FLAG_SETUP = 1 << 8;
const FLAG_LOADING = 1 << 9;
const FLAG_DEFER = 1 << 10;
const FLAG_STABLE = 1 << 11;
const FLAG_EQUAL = 1 << 12;
const FLAG_NOTEQUAL = 1 << 13;
const FLAG_ASYNC = 1 << 14;
const FLAG_BOUND = 1 << 15;
const FLAG_WAITER = 1 << 16;
const FLAG_CHANNEL = 1 << 17;
const FLAG_BLOCKED = 1 << 18;
const FLAG_LOCK = 1 << 19;
const FLAG_SUSPEND = 1 << 20;
const FLAG_PANIC = 1 << 21;
const FLAG_SINGLE = 1 << 22;
const FLAG_EAGER = 1 << 23;

/** Error type constants for { error, type } POJOs. */
const REFUSE = 1;
const PANIC = 2;
const FATAL = 3;

/* Option flags */
const OPT_DEFER = FLAG_DEFER;
const OPT_STABLE = FLAG_STABLE;
const OPT_SETUP = FLAG_SETUP;
const OPT_WEAK = FLAG_WEAK;
const OPT_EAGER = FLAG_EAGER;

const OPTIONS = OPT_DEFER | OPT_STABLE | OPT_SETUP | OPT_WEAK | OPT_EAGER;

/* Async dispatch kinds */
const ASYNC_PROMISE = 1;
const ASYNC_ITERATOR = 2;
const ASYNC_SYNC = 3;

/**
 * A thenable that silently swallows .then() callbacks. When an async
 * node is disposed or re-run mid-flight, `await c.suspend(promise)`
 * resolves to REGRET — the awaiter calls `.then()` on it, which does
 * nothing, so the continuation never resumes and the closure is GC'd.
 */
const REGRET: PromiseLike<never> = { then() {} } as PromiseLike<never>;

const NOOP: () => void = function () {};

/**
 * Thrown (synchronously) when an async node's fn returns a non-sync
 * value (promise/iterator) without having called `c.suspend()`. This
 * catches the common mistake of forgetting `c.suspend()`.
 */
const ASSERT_DISPOSED = "Cannot access a disposed node";

// ─── Module-level state ─────────────────────────────────────────────

/** Version conflict restoration stack: [sender, oldVersion] pairs. */
let VSTACK: (ISender | number)[] = [];
let VCOUNT = 0;
/** Count of existing deps confirmed during dynamic re-execution. */
let REUSED = 0;

/** Pre-allocated stack for iterative checkRun. */
let CSTACK: (ICompute | null)[] = [];
/** Position encoding: -1 = was checking dep1, >= 0 = index in _deps array. */
let CINDEX: number[] = [];
/** Global stack pointer for checkRun. */
let CTOP = 0;

/** Pre-allocated stack for batching deps during setup execution. */
let DSTACK: (ISender | number | null)[] = [];
let DCOUNT = 0;
/** Base pointer for the current node's deps region in DSTACK. */
let DBASE = 0;

let TIME = 1;
let IDLE = true;
/** Whether a microtask flush is already scheduled. */
let POSTING = false;
let SEED = 1;
let VERSION = 0;
let TRANSACTION = 0;

let DISPOSES: Disposer[] = [];
let DISPOSER_COUNT = 0;

/** Writable senders pending an assignment during a batch. */
let SENDERS: (ISender | null)[] = [];
let PAYLOADS: unknown[] = [];
let UPDATES: (UpdateFn | null)[] = [];
let SENDER_COUNT = 0;

/** Eager computes to re-run. */
let COMPUTES: (ICompute | null)[] = [];
let COMPUTE_COUNT = 0;

/** Scoped effect queues indexed by level. */
let LEVELS: number[] = [0, 0, 0, 0];
let SCOPES: IEffect[][] = [[], [], [], []];
let SCOPE_COUNT = 0;

/** Flat (unowned) effects. */
let RECEIVERS: (IEffect | null)[] = [];
let RECEIVER_COUNT = 0;

// ─── Node constructors ──────────────────────────────────────────────
// Function-style constructors preserved for V8 optimization.

function Root(this: IRoot): void {
	this._cleanup = null;
	this._owned = null;
	this._recover = null;
}

function Signal<T>(this: ISender<T>, value: T): void {
	this._flag = 0;
	this._value = value;
	this._version = -1;
	this._sub1 = null;
	this._sub1slot = 0;
	this._subs = null;
}

function Compute<T>(
	this: ICompute<T>,
	opts: number,
	fn: ComputeFn,
	dep1: ISender | null,
	seed: T | undefined,
	args: unknown,
): void {
	this._flag = FLAG_INIT | FLAG_STALE | opts;
	this._value = seed as T;
	this._version = -1;
	this._sub1 = null;
	this._sub1slot = 0;
	this._subs = null;
	this._fn = fn;
	this._dep1 = dep1;
	this._dep1slot = 0;
	this._deps = null;
	this._time = 0;
	this._ctime = 0;
	this._cleanup = null;
	this._args = args;
}

function Effect(
	this: IEffect,
	opts: number,
	fn: EffectFn,
	dep1: ISender | null,
	owner: Owner | null,
	args: unknown,
): void {
	this._flag = FLAG_INIT | (0 | opts);
	this._fn = fn;
	this._dep1 = dep1;
	this._dep1slot = 0;
	this._deps = null;
	this._version = 0;
	this._time = 0;
	this._cleanup = null;
	this._owned = null;
	this._level = 0;
	this._owner = owner;
	this._recover = null;
	this._args = args;
}

function Channel(this: IChannel, args: unknown): void {
	this._args = args;
	this._controller = null;
	this._defer1 = null;
	this._defer1val = undefined;
	this._defers = null;
	this._res1 = null;
	this._res1slot = 0;
	this._responds = null;
	this._waiters = null;
}

// Typed constructor aliases for `new` calls. One-time module-scope cast.
const _Root = Root as unknown as { new (): IRoot; prototype: IRoot };
const _Signal = Signal as unknown as {
	new <T>(value: T): ISender<T>;
	prototype: ISender;
};
const _Compute = Compute as unknown as {
	new <T>(
		opts: number,
		fn: ComputeFn,
		dep1: ISender | null,
		seed: T | undefined,
		args: unknown,
	): ICompute<T>;
	prototype: ICompute;
};
const _Effect = Effect as unknown as {
	new (
		opts: number,
		fn: EffectFn,
		dep1: ISender | null,
		owner: Owner | null,
		args: unknown,
	): IEffect;
	prototype: IEffect;
};
const _Channel = Channel as unknown as {
	new (args: unknown): IChannel;
	prototype: IChannel;
};

// ─── Shared prototype methods ───────────────────────────────────────

/**
 * Shared across Root/Signal/Compute/Effect. Routes to `_dispose` directly
 * when idle, otherwise queues onto DISPOSES so the batch drain runs it in
 * the same transaction as any pending sets.
 */
function dispose(this: Disposer): void {
	if (!(this._flag & FLAG_DISPOSED)) {
		if (IDLE) {
			this._dispose();
		} else {
			DISPOSES[DISPOSER_COUNT++] = this;
		}
	}
}

/**
 * Dependency-tracking read. Refreshes stale senders, creates bidirectional
 * link, and returns the sender's value.
 */
function val(this: IReceiver, sender: ISender): unknown {
	let flag = this._flag;
	if (sender._flag & FLAG_DISPOSED) {
		throw new Error(ASSERT_DISPOSED);
	}
	if (flag & FLAG_LOADING) {
		return (this as ICompute)._readAsync(sender);
	}
	let version = VERSION;
	if (sender._version === version) {
		return sender._value;
	}
	if (sender._flag & (FLAG_STALE | FLAG_PENDING)) {
		(sender as ICompute)._refresh();
	}
	if ((flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
		if (sender._flag & FLAG_ERROR) {
			throw sender._value;
		}
		return sender._value;
	}
	let stamp = sender._version;
	sender._version = version;
	if (stamp === version - 1) {
		REUSED++;
	} else {
		(this as ICompute)._read(sender, stamp);
	}
	if (sender._flag & FLAG_ERROR) {
		throw sender._value;
	}
	return sender._value;
}

/**
 * Reads a sender's current value without subscribing.
 */
function peek(this: ICompute | IEffect, sender: ISender): unknown {
	if (sender._flag & FLAG_DISPOSED) {
		throw new Error(ASSERT_DISPOSED);
	}
	if (sender._flag & (FLAG_STALE | FLAG_PENDING)) {
		(sender as ICompute)._refresh();
	}
	if (sender._flag & FLAG_ERROR) {
		throw sender._value;
	}
	return sender._value;
}

/**
 * Shared set implementation for Signal and Compute.
 */
function set(this: ISender, value: unknown): void {
	if (this._flag & FLAG_DISPOSED) {
		throw new Error(ASSERT_DISPOSED);
	}
	if (IDLE) {
		if (typeof value === "function") {
			value = (value as (prev: unknown) => unknown)(this._value);
		}
		if (this._flag & FLAG_RELAY || this._value !== value) {
			this._assign(value, TIME + 1);
			notify(this, FLAG_STALE);
			flush();
		}
	} else if (
		typeof value === "function" ||
		this._flag & FLAG_RELAY ||
		this._value !== value
	) {
		schedule(this, value, assign as UpdateFn);
	}
}

/**
 * Batch-drain handler for both Signal and Compute.
 */
function assign(node: ISender, value: unknown, time: number): void {
	if (typeof value === "function") {
		value = (value as (prev: unknown) => unknown)(node._value);
	}
	if (node._flag & FLAG_RELAY || node._value !== value) {
		node._assign(value, time);
		if (node._flag & FLAG_SCHEDULED) {
			node._flag &= ~FLAG_SCHEDULED;
			notify(node, FLAG_STALE);
		}
	} else {
		node._flag &= ~FLAG_SCHEDULED;
	}
}

/**
 * Batch-drain handler for notify().
 */
function poke(node: ISender, _: unknown, _time: number): void {
	if (node._flag & FLAG_SCHEDULED) {
		node._flag &= ~FLAG_SCHEDULED;
		notify(node, FLAG_STALE);
	}
}

/**
 * Enqueues a deferred update to run during the next drain cycle.
 */
function schedule(node: ISender, payload: unknown, fn: UpdateFn): void {
	node._flag |= FLAG_SCHEDULED;
	let index = SENDER_COUNT++;
	SENDERS[index] = node;
	PAYLOADS[index] = payload;
	UPDATES[index] = fn;
}

/**
 * Registers a dependency link from sender -> this (the tracking node).
 */
function _read(this: IReceiver, sender: ISender, stamp: number): void {
	if (stamp > TRANSACTION) {
		VSTACK[VCOUNT++] = sender;
		VSTACK[VCOUNT++] = stamp;
	}

	if (this._flag & FLAG_SETUP) {
		if (this._dep1 === null) {
			let subslot = connect(sender, this, -1);
			this._dep1 = sender;
			this._dep1slot = subslot;
		} else {
			let depslot = DCOUNT - DBASE;
			let subslot = connect(sender, this, depslot);
			DSTACK[DCOUNT++] = sender;
			DSTACK[DCOUNT++] = subslot;
		}
	} else if (this._deps === null) {
		this._deps = [sender, 0];
		this._flag &= ~FLAG_SINGLE;
	} else {
		this._deps.push(sender, 0);
	}
}

function _readAsync(this: IReceiver, sender: ISender): unknown {
	if (sender._flag & (FLAG_STALE | FLAG_PENDING)) {
		(sender as ICompute)._refresh();
	}
	if ((this._flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
		if (sender._flag & FLAG_ERROR) {
			throw sender._value;
		}
		return sender._value;
	}
	subscribe(this, sender);
	if (sender._flag & FLAG_ERROR) {
		throw sender._value;
	}
	return sender._value;
}

function signal<T>(value: T): ISender<T> {
	return new _Signal(value);
}

/**
 * Creates a relay signal — always propagates on set(), bypassing equality check.
 */
function relay<T>(value: T): ISender<T> {
	let node = new _Signal(value);
	node._flag = FLAG_RELAY;
	return node;
}

function root(fn: (c: IRoot) => void): IRoot {
	let node = new _Root();
	startRoot(node, fn);
	return node;
}

// ─── Prototype method installation ─────────────────────────────────
{
	let RootProto = _Root.prototype;
	let SignalProto = _Signal.prototype;
	let ComputeProto = _Compute.prototype;
	let EffectProto = _Effect.prototype;

	(RootProto as Owner)._flag = 0;
	RootProto._owner = null;
	RootProto._level = -1;

	SignalProto._ctime = 0;

	SignalProto._assign = function (
		this: ISender,
		value: unknown,
		_time: number,
	): void {
		this._value = value;
	};

	ComputeProto._assign = function (
		this: ICompute,
		value: unknown,
		time: number,
	): void {
		this._value = value;
		this._ctime = time;
	};

	SignalProto._drop = function (): void {};

	ComputeProto._drop = function (this: ICompute): void {
		if (this._flag & FLAG_LOADING) {
			return;
		}
		this._flag |= FLAG_STALE;
		this._value = null;
		if (this._cleanup !== null) {
			clearCleanup(this);
		}
	};

	// Disposer#dispose — shared by all four node types
	RootProto.dispose =
		SignalProto.dispose =
		ComputeProto.dispose =
		EffectProto.dispose =
			dispose;

	// Receiver#_read — internal dep tracking
	ComputeProto._read = EffectProto._read = _read;
	ComputeProto._readAsync = EffectProto._readAsync = _readAsync;
	ComputeProto.peek = EffectProto.peek = peek;

	let disposed = {
		get(this: Disposer): boolean {
			return (this._flag & FLAG_DISPOSED) !== 0;
		},
	};

	let _disposed = { disposed };
	Object.defineProperties(SignalProto, _disposed);
	Object.defineProperties(RootProto, _disposed);

	let states = {
		disposed,
		error: {
			get(this: ISender): Err | null {
				return this._flag & FLAG_ERROR ? (this._value as Err) : null;
			},
		},
		loading: {
			get(this: Disposer): boolean {
				return (this._flag & FLAG_LOADING) !== 0;
			},
		},
	};
	Object.defineProperties(ComputeProto, states);
	Object.defineProperties(EffectProto, states);

	function cleanup(this: Owner | ICompute, fn: () => void): void {
		let c = this._cleanup;
		if (c === null) {
			this._cleanup = fn;
		} else if (typeof c === "function") {
			this._cleanup = [c, fn];
		} else {
			c.push(fn);
		}
	}

	function recover(this: Owner, fn: (error: unknown) => boolean): void {
		let r = this._recover;
		if (r === null) {
			this._recover = fn;
		} else if (typeof r === "function") {
			this._recover = [r, fn];
		} else {
			r.push(fn);
		}
	}

	function equal(this: ICompute | IEffect, eq?: boolean): void {
		if (eq === false) {
			this._flag = (this._flag | FLAG_NOTEQUAL) & ~FLAG_EQUAL;
		} else {
			this._flag = (this._flag | FLAG_EQUAL) & ~FLAG_NOTEQUAL;
		}
	}

	function stable(this: ICompute | IEffect): void {
		if (this._flag & FLAG_ASYNC) {
			this._flag = (this._flag | FLAG_STABLE) & ~FLAG_SETUP;
		} else {
			this._flag |= FLAG_STABLE;
		}
	}

	RootProto.cleanup = EffectProto.cleanup = ComputeProto.cleanup = cleanup;
	RootProto.recover = EffectProto.recover = recover;
	ComputeProto.equal = EffectProto.equal = equal;
	ComputeProto.stable = EffectProto.stable = stable;

	ComputeProto.refuse = function (this: ICompute, val: unknown): Err {
		this._flag |= FLAG_ERROR;
		return { error: val, type: REFUSE };
	};

	function panic(this: ICompute | IEffect, val: unknown): never {
		this._flag |= FLAG_PANIC;
		throw { error: val, type: PANIC };
	}

	ComputeProto.panic = EffectProto.panic = panic;

	ComputeProto.eager = function (this: ICompute): void {
		this._flag |= FLAG_EAGER;
	};

	ComputeProto.weak = function (this: ICompute): void {
		this._flag |= FLAG_WEAK;
	};

	function suspend(this: ICompute | IEffect, promiseOrTask: unknown): unknown {
		/** Branch: setup function → callback constructor path. */
		if (typeof promiseOrTask === "function") {
			if (this._flag & FLAG_SUSPEND) {
				throw new Error(
					"Cannot call suspend() with callbacks after a previous suspend()",
				);
			}
			this._flag |= FLAG_SUSPEND | FLAG_LOADING;
			let node = this;
			let time = this._time;
			(
				promiseOrTask as (
					resolve: (v: unknown) => void,
					reject: (e: unknown) => void,
				) => void
			)(
				function (val: unknown) {
					if (
						node._time !== time ||
						(node._flag & FLAG_DISPOSED && !(node._flag & FLAG_LOCK))
					) {
						return;
					}
					if (!(node._flag & FLAG_LOCK)) {
						if (node._flag & FLAG_STALE) {
							return;
						}
						if (node._flag & FLAG_PENDING && needsUpdate(node, TIME)) {
							node._flag |= FLAG_STALE;
							return;
						}
					}
					node._settle(val);
				},
				function (err: unknown) {
					if (
						node._time !== time ||
						(node._flag & FLAG_DISPOSED && !(node._flag & FLAG_LOCK))
					) {
						return;
					}
					if (!(node._flag & FLAG_LOCK)) {
						if (node._flag & FLAG_STALE) {
							return;
						}
						if (node._flag & FLAG_PENDING && needsUpdate(node, TIME)) {
							node._flag |= FLAG_STALE;
							return;
						}
					}
					node._error(err);
				},
			);
			return;
		}
		this._flag |= FLAG_SUSPEND;
		/** Branch: array of tasks → concurrent await. */
		if (Array.isArray(promiseOrTask)) {
			return _suspendArray.call(this, promiseOrTask as ICompute[]);
		}
		/** Branch: Compute node with FLAG_ASYNC → task-await path. */
		if (
			(promiseOrTask as ICompute)._flag !== undefined &&
			(promiseOrTask as ICompute)._flag & FLAG_ASYNC
		) {
			return _suspendTask.call(this, promiseOrTask as ICompute);
		}
		/** Promise path — wrap with staleness guard. */
		let node = this;
		let time = this._time;
		return (promiseOrTask as PromiseLike<unknown>).then(
			function (val: unknown) {
				if (
					node._time === time &&
					(!(node._flag & FLAG_DISPOSED) || node._flag & FLAG_LOCK)
				) {
					return val;
				}
				return REGRET;
			},
			function (err: unknown) {
				if (
					node._time === time &&
					(!(node._flag & FLAG_DISPOSED) || node._flag & FLAG_LOCK)
				) {
					throw err;
				}
				return REGRET;
			},
		);
	}

	function _suspendTask(this: ICompute | IEffect, taskNode: ICompute): unknown {
		if (taskNode._flag & FLAG_DISPOSED) {
			throw new Error(ASSERT_DISPOSED);
		}
		if (taskNode._flag & (FLAG_STALE | FLAG_PENDING)) {
			taskNode._refresh();
		}

		if (!(taskNode._flag & FLAG_LOADING)) {
			if (this._flag & FLAG_LOADING) {
				subscribe(this, taskNode);
			} else {
				let version = VERSION;
				let stamp = taskNode._version;
				taskNode._version = version;
				if (stamp !== version - 1) {
					this._read(taskNode, stamp);
				} else {
					REUSED++;
				}
			}
			if (taskNode._flag & FLAG_ERROR) {
				throw taskNode._value;
			}
			return taskNode._value;
		}

		let self = this;
		return new Promise(function (resolve, reject) {
			send(self, taskNode, resolve, reject);
		});
	}

	function _suspendArray(
		this: ICompute | IEffect,
		tasks: ICompute[],
	): unknown[] | Promise<unknown[]> {
		this._flag |= FLAG_BLOCKED;
		let count = tasks.length;
		if (count === 0) {
			this._flag &= ~FLAG_BLOCKED;
			return [];
		}
		let results: unknown[] = new Array(count);

		let allSettled = true;
		for (let i = 0; i < count; i++) {
			let task = tasks[i]!;
			if (task._flag & (FLAG_STALE | FLAG_PENDING)) {
				task._refresh();
			}
			if (task._flag & FLAG_LOADING) {
				allSettled = false;
				break;
			}
			if (task._flag & FLAG_ERROR) {
				throw task._value;
			}
			results[i] = task._value;
		}

		if (allSettled) {
			this._flag &= ~FLAG_BLOCKED;
			for (let i = 0; i < count; i++) {
				subscribe(this, tasks[i]!);
			}
			return results;
		}

		let self = this;
		return new Promise(function (resolve, reject) {
			_stepArray(self, tasks, results, resolve, reject);
		});
	}

	function _stepArray(
		node: ICompute | IEffect,
		tasks: ICompute[],
		results: unknown[],
		resolve: (value: unknown[]) => void,
		reject: (reason: unknown) => void,
	): void {
		let count = tasks.length;
		let blocked = -1;
		for (let i = 0; i < count; i++) {
			let task = tasks[i]!;
			if (task._flag & (FLAG_STALE | FLAG_PENDING)) {
				task._refresh();
			}
			if (task._flag & FLAG_LOADING) {
				blocked = i;
				break;
			}
			if (task._flag & FLAG_ERROR) {
				reject(task._value);
				return;
			}
			results[i] = task._value;
		}

		if (blocked === -1) {
			node._flag &= ~FLAG_BLOCKED;
			for (let i = 0; i < count; i++) {
				subscribe(node, tasks[i]!);
			}
			resolve(results);
			return;
		}

		for (let j = blocked + 1; j < count; j++) {
			let t = tasks[j]!;
			if (t._flag & (FLAG_STALE | FLAG_PENDING)) {
				t._refresh();
			}
		}

		let task = tasks[blocked]!;
		send(
			node,
			task,
			function () {
				_stepArray(node, tasks, results, resolve, reject);
			},
			reject,
		);
	}

	ComputeProto.suspend = EffectProto.suspend = suspend;

	ComputeProto.lock = EffectProto.lock = function (
		this: ICompute | IEffect,
	): void {
		this._flag |= FLAG_LOCK;
	};

	ComputeProto.unlock = EffectProto.unlock = function (
		this: ICompute | IEffect,
	): void {
		this._flag &= ~FLAG_LOCK;
	};

	function _channel(this: ICompute | IEffect): IChannel {
		if (this._flag & FLAG_CHANNEL) {
			return this._args as IChannel;
		}
		let channel = new _Channel(this._args);
		this._args = channel;
		this._flag |= FLAG_CHANNEL;
		return channel;
	}

	ComputeProto._channel = EffectProto._channel = _channel;

	function controller(this: ICompute | IEffect): AbortController {
		let channel = this._channel();
		let ctrl = new AbortController();
		channel._controller = ctrl;
		return ctrl;
	}

	ComputeProto.controller = EffectProto.controller = controller;

	function defer(this: ICompute | IEffect, sender: ISender): unknown {
		if (!(this._flag & FLAG_ASYNC)) {
			return val.call(this, sender);
		}
		if (sender._flag & (FLAG_STALE | FLAG_PENDING)) {
			(sender as ICompute)._refresh();
		}
		let value = sender._value;
		let channel = this._channel();
		if (channel._defer1 === null) {
			channel._defer1 = sender;
			channel._defer1val = value;
		} else {
			let defers = channel._defers;
			if (defers === null) {
				channel._defers = [sender, value];
			} else {
				defers.push(sender, value);
			}
		}
		if (sender._flag & FLAG_ERROR) {
			throw value;
		}
		return value;
	}

	ComputeProto.defer = EffectProto.defer = defer;

	function pending(
		this: ICompute | IEffect,
		tasks: ICompute | ICompute[],
	): boolean {
		let loading = false;
		if ((tasks as ICompute)._flag !== undefined) {
			val.call(this, tasks as ICompute);
			if ((tasks as ICompute)._flag & FLAG_LOADING) {
				loading = true;
			}
		} else {
			let arr = tasks as ICompute[];
			let count = arr.length;
			for (let i = 0; i < count; i++) {
				let t = arr[i]!;
				val.call(this, t);
				if (t._flag & FLAG_LOADING) {
					loading = true;
				}
			}
		}
		return loading;
	}

	ComputeProto.pending = EffectProto.pending = pending;

	RootProto._dispose = function (this: IRoot): void {
		(this as Owner)._flag = FLAG_DISPOSED;
		if (this._cleanup !== null) {
			clearCleanup(this);
		}
		if (this._owned !== null) {
			clearOwned(this);
		}
		this._owned = this._recover = null;
	};

	SignalProto.get = function (this: ISender): unknown {
		return this._value;
	};

	SignalProto.set = set;

	function signal_notify(this: ISender): void {
		if (this._flag & FLAG_DISPOSED) {
			throw new Error(ASSERT_DISPOSED);
		}
		if (IDLE) {
			notify(this, FLAG_STALE);
			flush();
		} else {
			schedule(this, null, poke as UpdateFn);
		}
	}

	SignalProto.notify = ComputeProto.notify = signal_notify;

	SignalProto.post = function (this: ISender, value: unknown): void {
		if (this._flag & FLAG_DISPOSED) {
			throw new Error(ASSERT_DISPOSED);
		}
		if (
			!POSTING &&
			!(this._flag & FLAG_RELAY) &&
			typeof value !== "function" &&
			this._value === value
		) {
			return;
		}
		schedule(this, value, assign as UpdateFn);
		if (!POSTING) {
			POSTING = true;
			queueMicrotask(microflush);
		}
	};

	SignalProto._changed = ComputeProto._changed = function (
		this: ISender,
		value: unknown,
	): boolean {
		return this._value !== value;
	};

	SignalProto._dispose = function (this: ISender): void {
		this._flag = FLAG_DISPOSED;
		clearSubs(this);
		this._value = null;
	};

	ComputeProto.get = function (this: ICompute): unknown {
		let flag = this._flag;
		if (flag & (FLAG_STALE | FLAG_PENDING)) {
			if (IDLE) {
				IDLE = false;
				try {
					if (flag & FLAG_STALE || needsUpdate(this, TIME)) {
						TRANSACTION = SEED;
						this._update(TIME);
					}
					if (SENDER_COUNT > 0 || DISPOSER_COUNT > 0) {
						flush();
					}
				} finally {
					IDLE = true;
				}
			} else {
				this._refresh();
			}
		}
		if (this._flag & FLAG_BOUND && this._dep1 === null) {
			this._flag |= FLAG_ERROR;
			this._value = { error: ASSERT_DISPOSED, type: FATAL };
		}
		if (this._flag & FLAG_ERROR) {
			throw this._value;
		}
		return this._value;
	};

	ComputeProto.val = val;

	ComputeProto.set = set;

	ComputeProto._refresh = function (this: ICompute): void {
		let flag = this._flag;
		if (flag & FLAG_STALE) {
			this._update(TIME);
		} else if (flag & FLAG_SINGLE) {
			checkSingle(this, TIME);
		} else {
			checkRun(this, TIME);
		}
	};

	ComputeProto._settle = function (this: ICompute, value: unknown): void {
		let flag = this._flag;
		let isError = flag & FLAG_ERROR;
		this._flag &= ~(FLAG_LOADING | FLAG_INIT | FLAG_LOCK);

		if (flag & FLAG_DISPOSED) {
			this._dispose();
			return;
		}

		if (value !== this._value || flag & (FLAG_INIT | FLAG_ERROR)) {
			this._value = value;
			let time = TIME + 1;
			this._ctime = time;

			let stale = false;
			if (this._flag & FLAG_ASYNC) {
				let hasDefers =
					this._flag & FLAG_CHANNEL &&
					((this._args as IChannel)._defer1 !== null ||
						(this._args as IChannel)._defers !== null);
				if (this._deps !== null || hasDefers) {
					stale = settleDeps(this);
				}
			}

			let waiters: (IReceiver | number | ((value: unknown) => void))[] | null =
				null;
			if (this._flag & FLAG_CHANNEL) {
				let ch = this._args as IChannel;
				if (ch !== null && ch._waiters !== null) {
					waiters = ch._waiters;
					let waiterCount = waiters.length;
					settleNotify(this, value, !!isError, waiters, waiterCount);
					ch._waiters = null;
					this._flag &= ~FLAG_WAITER;
				}
			}
			if (waiters === null) {
				notify(this, FLAG_STALE);
			}

			flush();

			if (
				stale ||
				(flag & FLAG_LOCK &&
					(this._flag & FLAG_STALE ||
						(this._flag & FLAG_PENDING && needsUpdate(this, TIME))))
			) {
				this._flag |= FLAG_STALE;
				this._update(TIME);
			}
		} else if (
			flag & FLAG_LOCK &&
			(this._flag & FLAG_STALE ||
				(this._flag & FLAG_PENDING && needsUpdate(this, TIME)))
		) {
			this._flag |= FLAG_STALE;
			this._update(TIME);
		}

		if (
			this._flag & FLAG_WEAK &&
			this._sub1 === null &&
			(this._subs === null || this._subs.length === 0)
		) {
			this._drop();
		}
	};

	ComputeProto._error = function (this: ICompute, err: unknown): void {
		this._flag |= FLAG_ERROR;
		this._settle({ error: err, type: FATAL });
	};

	ComputeProto._dispose = function (this: ICompute): void {
		if (this._flag & FLAG_LOCK) {
			this._flag |= FLAG_DISPOSED;
			return;
		}
		let flag = this._flag;
		this._flag = FLAG_DISPOSED;
		clearSubs(this);
		clearDeps(this);
		if (flag & FLAG_CHANNEL) {
			let ch = this._args as IChannel;
			if (ch._controller !== null) {
				ch._controller.abort();
			}
			if (ch._waiters !== null) {
				resolveWaiters(
					this,
					ch,
					new Error("Awaited task was disposed"),
					true,
					true,
				);
			}
			if (ch._res1 !== null) {
				clearChannel(ch);
			}
		}
		if (this._cleanup !== null) {
			clearCleanup(this);
		}
		this._fn = this._value = this._args = null;
	};

	/**
	 * Unified update for compute nodes. Two branches:
	 * 1. Stable — no dep tracking
	 * 2. Setup/dynamic — version-tracked dep reconciliation
	 */
	ComputeProto._update = function (this: ICompute, time: number): void {
		let flag = this._flag;
		if (flag & FLAG_LOCK) {
			return;
		}
		this._time = time;
		this._flag =
			flag &
			~(
				FLAG_STALE |
				FLAG_LOADING |
				FLAG_ERROR |
				FLAG_EQUAL |
				FLAG_NOTEQUAL |
				FLAG_SUSPEND |
				FLAG_PANIC
			);

		if (!(flag & FLAG_INIT) && this._cleanup !== null) {
			clearCleanup(this);
		}

		if (flag & FLAG_ASYNC) {
			if (flag & FLAG_CHANNEL) {
				resetChannel(this);
			}
		}

		let value: unknown;
		let args =
			flag & FLAG_CHANNEL ? (this._args as IChannel)._args : this._args;

		if ((flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
			run: try {
				if (flag & FLAG_BOUND) {
					let dep = this._dep1!;
					if (dep._flag & (FLAG_STALE | FLAG_PENDING)) {
						(dep as ICompute)._refresh();
					}
					if (dep._flag & FLAG_ERROR) {
						value = dep._value;
						this._flag |= FLAG_ERROR;
						break run;
					}
					value = (
						this._fn as unknown as (
							val: unknown,
							c: ICompute,
							prev: unknown,
							args: unknown,
						) => unknown
					)(dep._value, this, this._value, args);
				} else {
					value = (
						this._fn as unknown as (
							c: ICompute,
							prev: unknown,
							args: unknown,
						) => unknown
					)(this, this._value, args);
				}
			} catch (err) {
				if (this._flag & FLAG_PANIC) {
					value = err;
					this._flag &= ~FLAG_PANIC;
				} else {
					value = { error: err, type: FATAL };
				}
				this._flag |= FLAG_ERROR;
			}
		} else {
			let prevRVer = VERSION;
			let version = (SEED += 2);
			VERSION = version;
			let saveStart = VCOUNT;
			let depsLen = 0;
			let depCount = 0;
			let prevDBase: number | undefined;
			let prevReused: number | undefined;
			if (flag & FLAG_SETUP) {
				prevDBase = DBASE;
				DBASE = DCOUNT;
			} else {
				prevReused = REUSED;
				REUSED = 0;
				depCount = sweepDeps(version - 1, this._dep1, this._deps);
				depsLen = this._deps !== null ? this._deps.length : 0;
			}

			call: try {
				if (flag & FLAG_BOUND) {
					let dep = this._dep1!;
					if (dep._flag & (FLAG_STALE | FLAG_PENDING)) {
						(dep as ICompute)._refresh();
					}
					if (dep._flag & FLAG_ERROR) {
						value = dep._value;
						this._flag |= FLAG_ERROR;
						break call;
					}
					dep._version = version;
					value = (
						this._fn as unknown as (
							val: unknown,
							c: ICompute,
							prev: unknown,
							args: unknown,
						) => unknown
					)(dep._value, this, this._value, args);
				} else {
					value = (
						this._fn as unknown as (
							c: ICompute,
							prev: unknown,
							args: unknown,
						) => unknown
					)(this, this._value, args);
				}
			} catch (err) {
				if (this._flag & FLAG_PANIC) {
					value = err;
					this._flag &= ~FLAG_PANIC;
				} else {
					value = { error: err, type: FATAL };
				}
				this._flag |= FLAG_ERROR;
			}

			if (flag & FLAG_SETUP) {
				if (DCOUNT > DBASE) {
					let stack = DSTACK;
					this._deps = stack.slice(DBASE, DCOUNT) as (ISender | number)[];
					for (let i = DBASE; i < DCOUNT; i += 2) {
						stack[i] = null;
					}
					DCOUNT = DBASE;
				} else if (this._dep1 !== null) {
					this._flag |= FLAG_SINGLE;
				}
				DBASE = prevDBase!;
			} else {
				let newLen = this._deps !== null ? this._deps.length : 0;
				if (REUSED !== depCount || newLen !== depsLen) {
					patchDeps(this, version, depCount, newLen);
				}
				REUSED = prevReused!;
			}

			if (VCOUNT > saveStart) {
				let count = VCOUNT;
				let stack = VSTACK;
				for (let i = saveStart; i < count; i += 2) {
					(stack[i] as ISender)._version = stack[i + 1] as number;
					stack[i] = null as unknown as ISender;
				}
				VCOUNT = saveStart;
			}
			VERSION = prevRVer;
		}

		this._flag &= ~(FLAG_STALE | FLAG_PENDING | FLAG_SETUP);
		flag = this._flag;

		if (flag & FLAG_ASYNC) {
			if (this._flag & FLAG_SUSPEND && this._flag & FLAG_LOADING) {
				this._flag &= ~FLAG_INIT;
				return;
			}
			let kind = asyncKind(value);
			if (kind !== ASYNC_SYNC) {
				this._flag |= FLAG_LOADING;
				if (kind === ASYNC_PROMISE) {
					resolvePromise(this, value as PromiseLike<unknown>, time);
				} else {
					resolveIterator(
						this,
						value as AsyncIterator<unknown> | AsyncIterable<unknown>,
						time,
					);
				}
				return;
			}
		}

		flag = this._flag &= ~FLAG_INIT;
		if (flag & FLAG_ERROR) {
			this._value = value;
			this._ctime = time;
		} else if (value !== this._value) {
			this._value = value;
			if (!(flag & FLAG_EQUAL)) {
				this._ctime = time;
			}
		} else if (flag & FLAG_NOTEQUAL) {
			this._ctime = time;
		}
	};

	ComputeProto._receive = function (this: ICompute): void {
		let flag = this._flag;
		if (!(flag & (FLAG_EAGER | FLAG_WAITER | FLAG_LOCK | FLAG_LOADING))) {
			notify(this, FLAG_PENDING);
		} else if (flag & FLAG_LOCK) {
			return;
		} else {
			if (flag & FLAG_LOADING && flag & FLAG_CHANNEL) {
				resetChannel(this);
			}
			if (!(flag & (FLAG_EAGER | FLAG_WAITER))) {
				notify(this, FLAG_PENDING);
				return;
			}
			COMPUTES[COMPUTE_COUNT++] = this;
			if (flag & FLAG_EAGER) {
				if (!(flag & FLAG_ASYNC)) {
					notify(this, FLAG_STALE);
				}
			} else {
				notify(this, FLAG_PENDING);
			}
		}
	};

	EffectProto.val = val;

	EffectProto._update = function (this: IEffect, time: number): void {
		let flag = this._flag;
		if (flag & FLAG_LOCK) {
			return;
		}

		this._time = time;
		if (!(flag & FLAG_INIT)) {
			if (this._cleanup !== null) {
				clearCleanup(this);
			}
			if (this._owned !== null) {
				clearOwned(this);
			}
			this._recover = null;
		}

		if (flag & FLAG_ASYNC) {
			this._flag &= ~(FLAG_LOADING | FLAG_SUSPEND);
		}

		let value: unknown;
		let args =
			flag & FLAG_CHANNEL ? (this._args as IChannel)._args : this._args;

		if ((flag & (FLAG_STABLE | FLAG_SETUP)) === FLAG_STABLE) {
			try {
				if (flag & FLAG_BOUND) {
					let dep = this._dep1!;
					if (dep._flag & (FLAG_STALE | FLAG_PENDING)) {
						(dep as ICompute)._refresh();
					}
					if (dep._flag & FLAG_ERROR) {
						throw dep._value;
					}
					value = (
						this._fn as unknown as (
							val: unknown,
							c: IEffect,
							args: unknown,
						) => unknown
					)(dep._value, this, args);
				} else {
					value = (
						this._fn as unknown as (c: IEffect, args: unknown) => unknown
					)(this, args);
				}
			} finally {
				this._flag &= ~(FLAG_STALE | FLAG_PENDING);
			}
		} else {
			let current = VERSION;
			let version = (SEED += 2);
			VERSION = version;
			let saveStart = VCOUNT;
			let depCount = 0;
			let depsLen = 0;
			let dbase: number | undefined;
			let reused: number | undefined;
			if (flag & FLAG_SETUP) {
				dbase = DBASE;
				DBASE = DCOUNT;
			} else {
				reused = REUSED;
				REUSED = 0;
				let deps = this._deps;
				depCount = sweepDeps(version - 1, this._dep1, deps);
				depsLen = deps !== null ? deps.length : 0;
			}

			try {
				if (flag & FLAG_BOUND) {
					let dep = this._dep1!;
					if (dep._flag & (FLAG_STALE | FLAG_PENDING)) {
						(dep as ICompute)._refresh();
					}
					if (dep._flag & FLAG_ERROR) {
						throw dep._value;
					}
					value = (
						this._fn as unknown as (
							val: unknown,
							c: IEffect,
							args: unknown,
						) => unknown
					)(dep._value, this, args);
				} else {
					value = (
						this._fn as unknown as (c: IEffect, args: unknown) => unknown
					)(this, args);
				}
			} finally {
				if (flag & FLAG_SETUP) {
					if (DCOUNT > DBASE) {
						let stack = DSTACK;
						this._deps = stack.slice(DBASE, DCOUNT) as (ISender | number)[];
						for (let i = DBASE; i < DCOUNT; i += 2) {
							stack[i] = null;
						}
						DCOUNT = DBASE;
					} else if (this._dep1 !== null) {
						this._flag |= FLAG_SINGLE;
					}
					DBASE = dbase!;
				} else {
					let newLen = this._deps !== null ? this._deps.length : 0;
					if (REUSED !== depCount || newLen !== depsLen) {
						patchDeps(this, version, depCount, newLen);
					}
					REUSED = reused!;
				}
				if (VCOUNT > saveStart) {
					let count = VCOUNT;
					let stack = VSTACK;
					for (let i = saveStart; i < count; i += 2) {
						(stack[i] as ISender)._version = stack[i + 1] as number;
						stack[i] = null as unknown as ISender;
					}
					VCOUNT = saveStart;
				}
				VERSION = current;
				this._flag &= ~(FLAG_SETUP | FLAG_STALE | FLAG_PENDING);
			}
		}

		if (flag & FLAG_ASYNC) {
			if (this._flag & FLAG_SUSPEND && this._flag & FLAG_LOADING) {
				this._flag &= ~FLAG_INIT;
				return;
			}
			let kind = asyncKind(value);
			if (kind !== ASYNC_SYNC) {
				this._flag |= FLAG_LOADING;
				if (kind === ASYNC_PROMISE) {
					resolvePromise(
						this as unknown as ICompute,
						value as PromiseLike<unknown>,
						time,
					);
				} else {
					resolveIterator(
						this as unknown as ICompute,
						value as AsyncIterator<unknown> | AsyncIterable<unknown>,
						time,
					);
				}
				return;
			}
		}

		this._flag &= ~FLAG_INIT;
	};

	EffectProto._settle = function (this: IEffect, err?: unknown): void {
		let flag = this._flag;
		this._flag &= ~(FLAG_LOADING | FLAG_LOCK);

		if (flag & FLAG_DISPOSED) {
			this._dispose();
			return;
		}

		if (flag & FLAG_ERROR) {
			this._flag &= ~FLAG_ERROR;
			let result = tryRecover(this, err);
			if (result !== RECOVER_SELF) {
				this._dispose();
			}
			return;
		}

		let stale = false;
		if (
			this._flag & FLAG_CHANNEL &&
			((this._args as IChannel)._defer1 !== null ||
				(this._args as IChannel)._defers !== null)
		) {
			stale = settleDeps(this);
		}
		if (
			stale ||
			(flag & FLAG_LOCK &&
				(this._flag & FLAG_STALE ||
					(this._flag & FLAG_PENDING && needsUpdate(this, TIME))))
		) {
			this._flag |= FLAG_STALE;
			(this as IEffect)._receive();
			flush();
		}
	};

	EffectProto._error = function (this: IEffect, err: unknown): void {
		this._flag |= FLAG_ERROR;
		this._settle({ error: err, type: FATAL });
	};

	EffectProto._dispose = function (this: IEffect): void {
		if (this._flag & FLAG_LOCK) {
			this._flag |= FLAG_DISPOSED;
			return;
		}
		let flag = this._flag;
		this._flag = FLAG_DISPOSED;
		clearDeps(this);
		if (this._cleanup !== null) {
			clearCleanup(this);
		}
		if (this._owned !== null) {
			clearOwned(this);
		}
		if (flag & FLAG_CHANNEL) {
			let ch = this._args as IChannel;
			if (ch._controller !== null) {
				ch._controller.abort();
			}
			if (ch._res1 !== null) {
				clearChannel(ch);
			}
		}
		this._fn = this._args = this._owned = this._owner = this._recover = null;
	};

	EffectProto._receive = function (this: IEffect): void {
		let flag = this._flag;
		if (flag & FLAG_LOCK) {
			return;
		}
		if (flag & FLAG_LOADING && flag & FLAG_CHANNEL) {
			resetChannel(this);
		}
		if (this._owned === null) {
			RECEIVERS[RECEIVER_COUNT++] = this;
		} else {
			let level = this._level;
			let count = LEVELS[level]!;
			SCOPES[level]![count] = this;
			LEVELS[level] = count + 1;
			SCOPE_COUNT++;
		}
	};

	/** Factory methods installed on Root and Effect prototypes. */
	function _compute(
		this: IRoot | IEffect,
		depOrFn: unknown,
		fnOrSeed: unknown,
		optsOrSeed: unknown,
		argsOrOpts: unknown,
		args: unknown,
	): ICompute {
		if ((this as Owner)._flag & FLAG_DISPOSED) {
			throw new Error(ASSERT_DISPOSED);
		}
		let flag: number;
		let node: ICompute;
		if (typeof depOrFn === "function") {
			flag = FLAG_SETUP | ((0 | (optsOrSeed as number)) & OPTIONS);
			node = new _Compute(
				flag,
				depOrFn as ComputeFn,
				null,
				fnOrSeed,
				argsOrOpts,
			);
		} else {
			flag =
				FLAG_STABLE |
				FLAG_BOUND |
				FLAG_SINGLE |
				((0 | (argsOrOpts as number)) & OPTIONS);
			node = new _Compute(
				flag,
				fnOrSeed as ComputeFn,
				depOrFn as ISender,
				optsOrSeed,
				args,
			);
			node._dep1slot = connect(depOrFn as ISender, node, -1);
		}
		addOwned(this as Owner, node);
		if (!(flag & FLAG_DEFER)) {
			startCompute(node);
		}
		return node;
	}

	function _task(
		this: IRoot | IEffect,
		depOrFn: unknown,
		fnOrSeed: unknown,
		optsOrSeed: unknown,
		argsOrOpts: unknown,
		args: unknown,
	): ICompute {
		if ((this as Owner)._flag & FLAG_DISPOSED) {
			throw new Error(ASSERT_DISPOSED);
		}
		let flag: number;
		let node: ICompute;
		if (typeof depOrFn === "function") {
			flag = FLAG_ASYNC | FLAG_SETUP | ((0 | (optsOrSeed as number)) & OPTIONS);
			node = new _Compute(
				flag,
				depOrFn as ComputeFn,
				null,
				fnOrSeed,
				argsOrOpts,
			);
		} else {
			flag =
				FLAG_ASYNC |
				FLAG_STABLE |
				FLAG_BOUND |
				FLAG_SINGLE |
				((0 | (argsOrOpts as number)) & OPTIONS);
			node = new _Compute(
				flag,
				fnOrSeed as ComputeFn,
				depOrFn as ISender,
				optsOrSeed,
				args,
			);
			node._dep1slot = connect(depOrFn as ISender, node, -1);
		}
		addOwned(this as Owner, node);
		if (!(flag & FLAG_DEFER)) {
			startCompute(node);
		}
		return node;
	}

	function _effect(
		this: IRoot | IEffect,
		depOrFn: unknown,
		fnOrOpts: unknown,
		optsOrArgs: unknown,
		args: unknown,
	): IEffect {
		if ((this as Owner)._flag & FLAG_DISPOSED) {
			throw new Error(ASSERT_DISPOSED);
		}
		let flag: number;
		let node: IEffect;
		if (typeof depOrFn === "function") {
			flag = FLAG_SETUP | ((0 | (fnOrOpts as number)) & OPTIONS);
			node = new _Effect(
				flag,
				depOrFn as EffectFn,
				null,
				this as Owner,
				optsOrArgs,
			);
		} else {
			flag =
				FLAG_STABLE |
				FLAG_BOUND |
				FLAG_SINGLE |
				((0 | (optsOrArgs as number)) & OPTIONS);
			node = new _Effect(
				flag,
				fnOrOpts as EffectFn,
				depOrFn as ISender,
				this as Owner,
				args,
			);
			node._dep1slot = connect(depOrFn as ISender, node, -1);
		}
		let level = (this as Owner)._level + 1;
		if ((this as Owner)._level > 2 && level >= LEVELS.length) {
			LEVELS.push(0);
			SCOPES.push([]);
		}
		node._level = level;
		addOwned(this as Owner, node);
		startEffect(node);
		return node;
	}

	function _spawn(
		this: IRoot | IEffect,
		depOrFn: unknown,
		fnOrOpts: unknown,
		optsOrArgs: unknown,
		args: unknown,
	): IEffect {
		if ((this as Owner)._flag & FLAG_DISPOSED) {
			throw new Error(ASSERT_DISPOSED);
		}
		let flag: number;
		let node: IEffect;
		if (typeof depOrFn === "function") {
			flag = FLAG_ASYNC | FLAG_SETUP | ((0 | (fnOrOpts as number)) & OPTIONS);
			node = new _Effect(
				flag,
				depOrFn as EffectFn,
				null,
				this as Owner,
				optsOrArgs,
			);
		} else {
			flag =
				FLAG_ASYNC |
				FLAG_STABLE |
				FLAG_BOUND |
				FLAG_SINGLE |
				((0 | (optsOrArgs as number)) & OPTIONS);
			node = new _Effect(
				flag,
				fnOrOpts as EffectFn,
				depOrFn as ISender,
				this as Owner,
				args,
			);
			node._dep1slot = connect(depOrFn as ISender, node, -1);
		}
		let level = (this as Owner)._level + 1;
		if ((this as Owner)._level > 2 && level >= LEVELS.length) {
			LEVELS.push(0);
			SCOPES.push([]);
		}
		node._level = level;
		addOwned(this as Owner, node);
		startEffect(node);
		return node;
	}

	RootProto.signal = EffectProto.signal = signal;
	RootProto.compute = EffectProto.compute = _compute;
	RootProto.task = EffectProto.task = _task;
	RootProto.effect = EffectProto.effect = _effect;
	RootProto.spawn = EffectProto.spawn = _spawn;
	RootProto.root = EffectProto.root = root;
}

// ─── Free functions ─────────────────────────────────────────────────

function subscribe(receiver: IReceiver, sender: ISender): void {
	if (receiver._dep1 === null) {
		receiver._dep1 = sender;
		receiver._dep1slot = connect(sender, receiver, -1);
	} else {
		let deps = receiver._deps;
		let depslot = deps === null ? 0 : deps.length;
		let slot = connect(sender, receiver, depslot);
		if (deps === null) {
			receiver._deps = [sender, slot];
		} else {
			deps.push(sender, slot);
		}
	}
}

function connect(send: ISender, receiver: IReceiver, depslot: number): number {
	let subslot = -1;
	if (send._sub1 === null) {
		send._sub1 = receiver;
		send._sub1slot = depslot;
	} else if (send._subs === null) {
		subslot = 0;
		send._subs = [receiver, depslot];
	} else {
		subslot = send._subs.length;
		send._subs.push(receiver, depslot);
	}
	return subslot;
}

function clearReceiver(send: ISender, slot: number): void {
	if (slot === -1) {
		send._sub1 = null;
	} else {
		let subs = send._subs!;
		let lastSlot = subs.pop() as number;
		let lastNode = subs.pop() as IReceiver;
		if (slot !== subs.length) {
			subs[slot] = lastNode;
			subs[slot + 1] = lastSlot;
			if (lastSlot === -1) {
				lastNode._dep1slot = slot;
			} else {
				(lastNode._deps![lastSlot + 1] as number) = slot;
			}
		}
	}
	if (
		send._flag & FLAG_WEAK &&
		send._sub1 === null &&
		(send._subs === null || send._subs.length === 0)
	) {
		send._drop();
	}
}

function clearSender(receive: IReceiver, slot: number): void {
	if (slot === -1) {
		receive._dep1 = null;
	} else {
		let deps = receive._deps!;
		let lastSlot = deps.pop() as number;
		let lastNode = deps.pop() as ISender;
		if (slot !== deps.length) {
			deps[slot] = lastNode;
			deps[slot + 1] = lastSlot;
			if (lastSlot === -1) {
				lastNode._sub1slot = slot;
			} else {
				(lastNode._subs![lastSlot + 1] as number) = slot;
			}
		}
	}
}

function clearDeps(receive: IReceiver): void {
	if (receive._dep1 !== null) {
		clearReceiver(receive._dep1, receive._dep1slot);
		receive._dep1 = null;
	}
	let deps = receive._deps;
	if (deps !== null) {
		let count = deps.length;
		for (let i = 0; i < count; i += 2) {
			clearReceiver(deps[i] as ISender, deps[i + 1] as number);
		}
		receive._deps = null;
	}
}

function clearSubs(send: ISender): void {
	if (send._sub1 !== null) {
		clearSender(send._sub1, send._sub1slot);
		send._sub1 = null;
	}
	let subs = send._subs;
	if (subs !== null) {
		let count = subs.length;
		for (let i = 0; i < count; i += 2) {
			clearSender(subs[i] as IReceiver, subs[i + 1] as number);
		}
		send._subs = null;
	}
}

function clearCleanup(node: Disposer | Owner | ICompute): void {
	let cleanup = node._cleanup;
	if (typeof cleanup === "function") {
		cleanup();
		node._cleanup = null;
	} else {
		let arr = cleanup as (() => void)[];
		let count = arr.length;
		while (count-- > 0) {
			arr.pop()!();
		}
	}
}

function addOwned(owner: Owner, child: IReceiver): void {
	if (owner._owned === null) {
		owner._owned = [child];
	} else {
		owner._owned.push(child);
	}
}

function clearOwned(owner: Owner): void {
	let owned = owner._owned!;
	let count = owned.length;
	while (count-- > 0) {
		owned.pop()!._dispose();
	}
	owner._recover = null;
}

function _checkRecover(owner: Owner, error: unknown): boolean {
	let recover = owner._recover;
	if (recover !== null) {
		if (typeof recover === "function") {
			if (recover(error) === true) {
				return true;
			}
		} else {
			let count = recover.length;
			for (let i = 0; i < count; i++) {
				if (recover[i]!(error) === true) {
					return true;
				}
			}
		}
	}
	return false;
}

const RECOVER_NONE = 0;
const RECOVER_SELF = 1;
const RECOVER_OWNER = 2;

function tryRecover(node: IEffect, error: unknown): number {
	if (node._recover !== null && _checkRecover(node, error)) {
		return RECOVER_SELF;
	}
	let owner = node._owner;
	while (owner !== null) {
		if (_checkRecover(owner, error)) {
			return RECOVER_OWNER;
		}
		owner = owner._owner;
	}
	return RECOVER_NONE;
}

function patchDeps(
	node: IReceiver,
	version: number,
	depCount: number,
	newLen: number,
): void {
	let deps = node._deps;
	let existingLen = depCount > 1 ? (depCount - 1) * 2 : 0;
	let newidx = existingLen;

	let dep1 = node._dep1;
	if (dep1 !== null) {
		if (dep1._version !== version) {
			clearReceiver(dep1, node._dep1slot);
			if (newidx < newLen) {
				let newDep = deps![newidx] as ISender;
				node._dep1 = newDep;
				node._dep1slot = connect(newDep, node, -1);
				newidx += 2;
			} else {
				node._dep1 = null;
				node._dep1slot = 0;
			}
		}
	}

	if (deps === null) {
		if (node._dep1 !== null) {
			node._flag |= FLAG_SINGLE;
		}
		return;
	}

	let i = 0;
	let tail = existingLen;
	while (i < tail) {
		let dep = deps[i] as ISender;
		if (dep._version === version) {
			i += 2;
			continue;
		}
		clearReceiver(dep, deps[i + 1] as number);
		if (newidx < newLen) {
			let newDep = deps[newidx] as ISender;
			let subslot = connect(newDep, node, i);
			deps[i] = newDep;
			deps[i + 1] = subslot;
			newidx += 2;
			i += 2;
		} else {
			let found = 0;
			while (tail > i + 2) {
				tail -= 2;
				let tDep = deps[tail] as ISender;
				if (tDep._version === version) {
					let tSlot = deps[tail + 1] as number;
					deps[i] = tDep;
					deps[i + 1] = tSlot;
					if (tSlot === -1) {
						tDep._sub1slot = i;
					} else {
						(tDep._subs![tSlot + 1] as number) = i;
					}
					found = 1;
					break;
				} else {
					clearReceiver(tDep, deps[tail + 1] as number);
				}
			}
			if (found) {
				i += 2;
			} else {
				tail = i;
			}
		}
	}
	if (newidx < newLen) {
		if (node._dep1 === null) {
			let newDep = deps[newidx] as ISender;
			let subslot = connect(newDep, node, i);
			deps[i] = newDep;
			deps[i + 1] = subslot;
			newidx += 2;
		}
		while (newidx < newLen) {
			let dep = deps[newidx] as ISender;
			let subslot = connect(dep, node, tail);
			deps[tail] = dep;
			deps[tail + 1] = subslot;
			tail += 2;
			newidx += 2;
		}
	}

	if (node._dep1 === null && tail > 0) {
		tail -= 2;
		let dep = deps[tail] as ISender;
		let slot = deps[tail + 1] as number;
		node._dep1 = dep;
		node._dep1slot = slot;
		if (slot === -1) {
			dep._sub1slot = -1;
		} else {
			(dep._subs![slot + 1] as number) = -1;
		}
	}

	if (tail === 0) {
		node._deps = null;
		if (node._dep1 !== null) {
			node._flag |= FLAG_SINGLE;
		}
	} else {
		node._flag &= ~FLAG_SINGLE;
		let excess = deps.length - tail;
		if (excess > 0) {
			if (excess < 20) {
				while (excess-- > 0) {
					deps.pop();
				}
			} else {
				deps.length = tail;
			}
		}
	}
}

function sweepDeps(
	stamp: number,
	dep1: ISender | null,
	deps: (ISender | number)[] | null,
): number {
	let depCount = 0;
	let vstack = VSTACK;
	let vcount = VCOUNT;
	let transaction = TRANSACTION;
	if (dep1 !== null) {
		let depver = dep1._version;
		if (depver > transaction) {
			vstack[vcount++] = dep1;
			vstack[vcount++] = depver;
		}
		dep1._version = stamp;
		depCount = 1;
	}
	if (deps !== null) {
		let count = deps.length;
		for (let i = 0; i < count; i += 2) {
			let dep = deps[i] as ISender;
			let depver = dep._version;
			if (depver > transaction) {
				vstack[vcount++] = dep;
				vstack[vcount++] = depver;
			}
			dep._version = stamp;
		}
		depCount += count >> 1;
	}
	VCOUNT = vcount;
	return depCount;
}

function notify(node: ISender, flag: number): void {
	let sub = node._sub1;
	if (sub !== null) {
		let flags = sub._flag;
		sub._flag |= flag;
		if (!(flags & (FLAG_PENDING | FLAG_STALE))) {
			sub._receive();
		}
	}
	let subs = node._subs;
	if (subs !== null) {
		let count = subs.length;
		for (let i = 0; i < count; i += 2) {
			sub = subs[i] as IReceiver;
			let flags = sub._flag;
			sub._flag |= flag;
			if (!(flags & (FLAG_PENDING | FLAG_STALE))) {
				sub._receive();
			}
		}
	}
}

function needsUpdate(node: IReceiver, time: number): boolean {
	let lastRun = node._time;
	let dep = node._dep1;
	if (dep !== null) {
		let flag = dep._flag;
		if (flag & FLAG_STALE) {
			TRANSACTION = SEED;
			(dep as ICompute)._update(time);
		} else if (flag & FLAG_PENDING) {
			TRANSACTION = SEED;
			if (flag & FLAG_SINGLE) {
				checkSingle(dep as ICompute, time);
			} else {
				checkRun(dep as ICompute, time);
			}
		}
		if (dep._ctime > lastRun) {
			return true;
		}
	}
	let deps = node._deps;
	if (deps !== null) {
		let len = deps.length;
		for (let i = 0; i < len; i += 2) {
			dep = deps[i] as ISender;
			let flag = dep._flag;
			if (flag & FLAG_STALE) {
				TRANSACTION = SEED;
				(dep as ICompute)._update(time);
			} else if (flag & FLAG_PENDING) {
				TRANSACTION = SEED;
				if (flag & FLAG_SINGLE) {
					checkSingle(dep as ICompute, time);
				} else {
					checkRun(dep as ICompute, time);
				}
			}
			if (dep._ctime > lastRun) {
				return true;
			}
		}
	}
	return false;
}

function checkSingle(node: ICompute, time: number): void {
	let dep = node._dep1!;
	let flag = dep._flag;
	if (flag & FLAG_STALE) {
		(dep as ICompute)._update(time);
	} else if (flag & FLAG_PENDING) {
		if (flag & FLAG_SINGLE) {
			checkSingle(dep as ICompute, time);
		} else {
			checkRun(dep as ICompute, time);
		}
	}
	if (dep._ctime > node._time) {
		node._update(time);
	} else {
		node._time = time;
		node._flag &= ~(FLAG_STALE | FLAG_PENDING);
	}
}

function checkRun(node: ICompute, time: number): void {
	let base = CTOP;
	let dep = node._dep1!;

	if ((dep._flag & (FLAG_STALE | FLAG_PENDING)) === FLAG_PENDING) {
		do {
			CSTACK[CTOP] = node;
			CINDEX[CTOP] = -1;
			CTOP++;
			node = dep as ICompute;
			dep = node._dep1!;
		} while (
			dep !== null &&
			(dep._flag & (FLAG_STALE | FLAG_PENDING)) === FLAG_PENDING
		);
	}

	let resumeFrom = -2;

	outer: for (;;) {
		let lastRun = node._time;
		let i: number;

		scan: {
			if (resumeFrom === -2) {
				dep = node._dep1!;
				if (dep !== null) {
					let flag = dep._flag;
					if (flag & FLAG_STALE) {
						(dep as ICompute)._update(time);
					} else if (flag & FLAG_PENDING) {
						CSTACK[CTOP] = node;
						CINDEX[CTOP] = -1;
						CTOP++;
						node = dep as ICompute;
						continue outer;
					}
					if (dep._ctime > lastRun) {
						node._update(time);
						break scan;
					}
				}
				i = 0;
			} else if (resumeFrom === -1) {
				if (node._dep1!._ctime > lastRun) {
					node._update(time);
					break scan;
				}
				i = 0;
			} else {
				if ((node._deps![resumeFrom] as ISender)._ctime > lastRun) {
					node._update(time);
					break scan;
				}
				i = resumeFrom + 2;
			}

			let deps = node._deps;
			if (deps !== null) {
				let count = deps.length;
				for (; i < count; i += 2) {
					dep = deps[i] as ISender;
					let flag = dep._flag;
					if (flag & FLAG_STALE) {
						(dep as ICompute)._update(time);
					} else if (flag & FLAG_PENDING) {
						CSTACK[CTOP] = node;
						CINDEX[CTOP] = i;
						CTOP++;
						node = dep as ICompute;
						resumeFrom = -2;
						continue outer;
					}
					if (dep._ctime > lastRun) {
						node._update(time);
						break scan;
					}
				}
			}

			node._time = time;
			node._flag &= ~(FLAG_STALE | FLAG_PENDING);
		}

		while (CTOP > base) {
			CTOP--;
			let parent = CSTACK[CTOP]!;
			CSTACK[CTOP] = null;
			if (node._ctime > parent._time) {
				parent._update(time);
				node = parent;
				continue;
			}
			let idx = CINDEX[CTOP]!;
			if (idx === -1) {
				if (parent._deps !== null) {
					node = parent;
					resumeFrom = -1;
					continue outer;
				}
			} else if (idx + 2 < parent._deps!.length) {
				node = parent;
				resumeFrom = idx;
				continue outer;
			}
			parent._time = time;
			parent._flag &= ~(FLAG_STALE | FLAG_PENDING);
			node = parent;
		}
		return;
	}
}

function asyncKind(value: unknown): number {
	if (value === null || typeof value !== "object") {
		return ASYNC_SYNC;
	}
	if (typeof (value as PromiseLike<unknown>).then === "function") {
		return ASYNC_PROMISE;
	}
	if (
		typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] ===
		"function"
	) {
		return ASYNC_ITERATOR;
	}
	return ASYNC_SYNC;
}

function resolvePromise(
	node: ICompute,
	promise: PromiseLike<unknown>,
	time: number,
): void {
	promise.then(
		(val) => {
			if (
				node._time !== time ||
				(node._flag & FLAG_DISPOSED && !(node._flag & FLAG_LOCK))
			) {
				return;
			}
			if (!(node._flag & FLAG_LOCK)) {
				if (node._flag & FLAG_STALE) {
					return;
				}
				if (node._flag & FLAG_PENDING && needsUpdate(node, TIME)) {
					node._flag |= FLAG_STALE;
					return;
				}
			}
			node._settle(val);
		},
		(err) => {
			if (
				node._time !== time ||
				(node._flag & FLAG_DISPOSED && !(node._flag & FLAG_LOCK))
			) {
				return;
			}
			if (!(node._flag & FLAG_LOCK)) {
				if (node._flag & FLAG_STALE) {
					return;
				}
				if (node._flag & FLAG_PENDING && needsUpdate(node, TIME)) {
					node._flag |= FLAG_STALE;
					return;
				}
			}
			node._error(err);
		},
	);
}

function resolveIterator(
	node: ICompute,
	iterable: AsyncIterator<unknown> | AsyncIterable<unknown>,
	time: number,
): void {
	let iterator: AsyncIterator<unknown> =
		typeof (iterable as AsyncIterable<unknown>)[Symbol.asyncIterator] ===
		"function"
			? (iterable as AsyncIterable<unknown>)[Symbol.asyncIterator]()
			: (iterable as AsyncIterator<unknown>);

	let onNext = (result: IteratorResult<unknown>): void => {
		if (
			node._time !== time ||
			(node._flag & FLAG_DISPOSED && !(node._flag & FLAG_LOCK))
		) {
			if (typeof iterator.return === "function") {
				iterator.return();
			}
			return;
		}
		if (!(node._flag & FLAG_LOCK)) {
			if (node._flag & FLAG_STALE) {
				if (typeof iterator.return === "function") {
					iterator.return();
				}
				return;
			}
			if (node._flag & FLAG_PENDING && needsUpdate(node, TIME)) {
				node._flag |= FLAG_STALE;
				if (typeof iterator.return === "function") {
					iterator.return();
				}
				return;
			}
		}

		if (result.done) {
			return;
		}

		iterator.next().then(onNext, onError);

		node._settle(result.value);
	};

	let onError = (err: unknown): void => {
		if (
			node._time !== time ||
			(node._flag & FLAG_DISPOSED && !(node._flag & FLAG_LOCK))
		) {
			return;
		}
		if (!(node._flag & FLAG_LOCK)) {
			if (node._flag & FLAG_STALE) {
				return;
			}
			if (node._flag & FLAG_PENDING && needsUpdate(node, TIME)) {
				node._flag |= FLAG_STALE;
				return;
			}
		}
		node._error(err);
	};

	iterator.next().then(onNext, onError);
}

function settleNotify(
	node: ISender,
	value: unknown,
	isError: boolean,
	waiters: (IReceiver | number | ((value: unknown) => void))[],
	waiterCount: number,
): void {
	let version = (SEED += 2);

	let sub = node._sub1;
	if (sub !== null) {
		sub._version = version - 1;
	}
	let subs = node._subs;
	if (subs !== null) {
		let count = subs.length;
		for (let i = 0; i < count; i += 2) {
			(subs[i] as IReceiver)._version = version - 1;
		}
	}

	for (let i = 0; i < waiterCount; i += 4) {
		let awaiter = waiters[i] as IReceiver;
		let resSlot = waiters[i + 1] as number;
		if (isError) {
			(waiters[i + 3] as (v: unknown) => void)(value);
		} else {
			(waiters[i + 2] as (v: unknown) => void)(value);
		}
		if (!(awaiter._flag & FLAG_BLOCKED)) {
			if (awaiter._version !== version - 1) {
				subscribe(awaiter, node);
			}
		}
		awaiter._version = version;
		let awaiterCh = (awaiter as ICompute | IEffect)._args as IChannel;
		if (resSlot === -1) {
			awaiterCh._res1 = null;
		} else {
			awaiterCh._responds![resSlot] = null;
		}
	}

	if (sub !== null && sub._version !== version) {
		let flags = sub._flag;
		sub._flag |= FLAG_STALE;
		if (!(flags & (FLAG_PENDING | FLAG_STALE))) {
			sub._receive();
		}
	}
	if (subs !== null) {
		let count = subs.length;
		for (let i = 0; i < count; i += 2) {
			sub = subs[i] as IReceiver;
			if (sub._version !== version) {
				let flags = sub._flag;
				sub._flag |= FLAG_STALE;
				if (!(flags & (FLAG_PENDING | FLAG_STALE))) {
					sub._receive();
				}
			}
		}
	}
}

function settleDeps(node: IReceiver): boolean {
	let stamp = (SEED += 2);
	let dep1 = node._dep1;
	let deps = node._deps;

	let defer1: ISender | null = null;
	let defer1val: unknown;
	let defers: (ISender | unknown)[] | null = null;
	let deferLen = 0;
	if (node._flag & FLAG_CHANNEL) {
		let ch = (node as ICompute | IEffect)._args as IChannel;
		defer1 = ch._defer1;
		if (defer1 !== null) {
			defer1val = ch._defer1val;
			ch._defer1 = null;
		}
		defers = ch._defers;
		if (defers !== null) {
			deferLen = defers.length;
			ch._defers = null;
		}
	}

	if (dep1 !== null) {
		dep1._version = stamp;
	}

	let hasDefers = defer1 !== null || deferLen > 0;
	if (deps !== null) {
		let i = deps.length - 2;
		let write = deps.length;
		while (i >= 0) {
			let dep = deps[i] as ISender;
			if (dep._version === stamp) {
				clearReceiver(dep, deps[i + 1] as number);
				write -= 2;
				if (i !== write) {
					let lastDep: ISender | number;
					let lastSlot: ISender | number;
					if (hasDefers) {
						lastDep = deps[write]!;
						lastSlot = deps[write + 1]!;
					} else {
						lastSlot = deps.pop()!;
						lastDep = deps.pop()!;
					}
					deps[i] = lastDep;
					deps[i + 1] = lastSlot;
					if ((lastSlot as number) === -1) {
						(lastDep as ISender)._sub1slot = i;
					} else {
						(lastDep as ISender)._subs![(lastSlot as number) + 1] = i;
					}
				} else if (!hasDefers) {
					deps.pop();
					deps.pop();
				}
			} else {
				dep._version = stamp;
			}
			i -= 2;
		}
		if (hasDefers && write < deps.length) {
			deps.length = write;
		}
	}

	if (!hasDefers) {
		return false;
	}

	let changed = false;

	if (defer1 !== null) {
		if (defer1._version === stamp) {
			if (
				(defer1 as ISender & { _changed(v: unknown): boolean })._changed(
					defer1val,
				)
			) {
				changed = true;
			}
		} else {
			defer1._version = stamp;
			subscribe(node, defer1);
			if (
				(defer1 as ISender & { _changed(v: unknown): boolean })._changed(
					defer1val,
				)
			) {
				changed = true;
			}
		}
	}

	for (let i = 0; i < deferLen; i += 2) {
		let sender = defers![i] as ISender;
		let snapshot = defers![i + 1];
		if (sender._version === stamp) {
			if (
				(sender as ISender & { _changed(v: unknown): boolean })._changed(
					snapshot,
				)
			) {
				changed = true;
			}
			continue;
		}
		sender._version = stamp;
		subscribe(node, sender);
		if (
			(sender as ISender & { _changed(v: unknown): boolean })._changed(snapshot)
		) {
			changed = true;
		}
	}
	return changed;
}

function resetChannel(node: ICompute | IEffect): void {
	let ch = node._args as IChannel;
	if (ch._controller !== null) {
		ch._controller.abort();
		ch._controller = null;
	}
	ch._defer1 = null;
	ch._defers = null;
	if (ch._res1 !== null || ch._responds !== null) {
		clearChannel(ch);
	}
}

function addWaiter(
	responderCh: IChannel,
	awaiter: IReceiver,
	awaiterResSlot: number,
	resolve: (v: unknown) => void,
	reject: (e: unknown) => void,
): number {
	let waiters = responderCh._waiters;
	let slot: number;
	if (waiters === null) {
		responderCh._waiters = [awaiter, awaiterResSlot, resolve, reject];
		slot = 0;
	} else {
		slot = waiters.length;
		waiters.push(awaiter, awaiterResSlot, resolve, reject);
	}
	return slot;
}

function send(
	awaiter: ICompute | IEffect,
	task: ICompute,
	resolve: ((v: unknown) => void) | null,
	reject: ((e: unknown) => void) | null,
): void {
	resolve = resolve || NOOP;
	reject = reject || NOOP;
	let awaiterCh = awaiter._channel();
	let responderCh = task._channel();

	let resSlot: number;
	if (awaiterCh._res1 === null) {
		resSlot = -1;
	} else if (awaiterCh._responds === null) {
		resSlot = 0;
	} else {
		resSlot = awaiterCh._responds.length;
	}

	let waiterSlot = addWaiter(responderCh, awaiter, resSlot, resolve, reject);
	task._flag |= FLAG_WAITER;

	if (resSlot === -1) {
		awaiterCh._res1 = task;
		awaiterCh._res1slot = waiterSlot;
	} else if (awaiterCh._responds === null) {
		awaiterCh._responds = [task, waiterSlot];
	} else {
		awaiterCh._responds.push(task, waiterSlot);
	}
}

function removeWaiter(
	responder: ICompute,
	responderCh: IChannel,
	slot: number,
): void {
	let waiters = responderCh._waiters!;
	let lastReject = waiters.pop()!;
	let lastResolve = waiters.pop()!;
	let lastResSlot = waiters.pop() as number;
	let lastAwaiter = waiters.pop() as IReceiver;
	if (slot !== waiters.length) {
		waiters[slot] = lastAwaiter;
		waiters[slot + 1] = lastResSlot;
		waiters[slot + 2] = lastResolve;
		waiters[slot + 3] = lastReject;
		let ch = (lastAwaiter as ICompute | IEffect)._args as IChannel;
		if (lastResSlot === -1) {
			ch._res1slot = slot;
		} else {
			ch._responds![lastResSlot + 1] = slot;
		}
	}
	if (waiters.length === 0) {
		responderCh._waiters = null;
		responder._flag &= ~FLAG_WAITER;
	}
}

function clearChannel(channel: IChannel): void {
	let res = channel._res1;
	if (res !== null) {
		removeWaiter(res, res._args as IChannel, channel._res1slot);
		channel._res1 = null;
	}
	let responds = channel._responds;
	if (responds !== null) {
		for (let i = 0; i < responds.length; i += 2) {
			let responder = responds[i] as ICompute | null;
			if (responder === null) {
				continue;
			}
			let slot = responds[i + 1] as number;
			removeWaiter(responder, responder._args as IChannel, slot);
		}
		channel._responds = null;
	}
}

function resolveWaiters(
	responder: ICompute,
	responderCh: IChannel,
	value: unknown,
	isError: boolean,
	panic: boolean,
): void {
	let waiters = responderCh._waiters!;
	let count = waiters.length;
	for (let i = 0; i < count; i += 4) {
		let awaiter = waiters[i] as IReceiver;
		let resSlot = waiters[i + 1] as number;
		if (isError) {
			(waiters[i + 3] as (v: unknown) => void)(value);
		} else {
			(waiters[i + 2] as (v: unknown) => void)(value);
		}
		if (!panic && !(awaiter._flag & FLAG_BLOCKED)) {
			subscribe(awaiter, responder);
		}
		let awaiterCh = (awaiter as ICompute | IEffect)._args as IChannel;
		if (resSlot === -1) {
			awaiterCh._res1 = null;
		} else {
			awaiterCh._responds![resSlot] = null;
		}
	}
	responderCh._waiters = null;
	responder._flag &= ~FLAG_WAITER;
}

function startRoot(root: IRoot, fn: (c: IRoot) => void): void {
	let idle = IDLE;
	IDLE = true;
	try {
		fn(root);
	} finally {
		IDLE = idle;
	}
}

function startCompute(node: ICompute): void {
	if (IDLE) {
		IDLE = false;
		try {
			TRANSACTION = SEED;
			node._update(TIME);
			if (SENDER_COUNT > 0 || DISPOSER_COUNT > 0) {
				flush();
			}
		} finally {
			IDLE = true;
		}
	} else {
		node._update(TIME);
	}
}

function startEffect(node: IEffect): void {
	if (IDLE) {
		IDLE = false;
		try {
			TRANSACTION = SEED;
			node._update(TIME);
			if (SENDER_COUNT > 0 || DISPOSER_COUNT > 0) {
				flush();
			}
		} catch (err) {
			let error = node._flag & FLAG_PANIC ? err : { error: err, type: FATAL };
			node._flag &= ~FLAG_PANIC;
			let result = tryRecover(node, error);
			if (result !== RECOVER_SELF) {
				node._dispose();
			}
			if (result === RECOVER_NONE) {
				throw error;
			}
		} finally {
			IDLE = true;
		}
	} else {
		try {
			node._update(TIME);
		} catch (err) {
			let error = node._flag & FLAG_PANIC ? err : { error: err, type: FATAL };
			node._flag &= ~FLAG_PANIC;
			let result = tryRecover(node, error);
			if (result !== RECOVER_SELF) {
				node._dispose();
			}
			if (result === RECOVER_NONE) {
				throw error;
			}
		}
	}
}

function flush(): void {
	let time = 0;
	let cycle = 0;
	let error: unknown = null;
	let thrown = false;
	IDLE = false;
	try {
		do {
			time = ++TIME;
			if (DISPOSER_COUNT > 0) {
				let count = DISPOSER_COUNT;
				for (let i = 0; i < count; i++) {
					DISPOSES[i]!._dispose();
					(DISPOSES as (Disposer | null)[])[i] = null;
				}
				DISPOSER_COUNT = 0;
			}
			if (SENDER_COUNT > 0) {
				let count = SENDER_COUNT;
				for (let i = 0; i < count; i++) {
					UPDATES[i]!(SENDERS[i]!, PAYLOADS[i], time);
					SENDERS[i] = PAYLOADS[i] = UPDATES[i] = null;
				}
				SENDER_COUNT = 0;
			}
			if (COMPUTE_COUNT > 0) {
				let count = COMPUTE_COUNT;
				for (let i = 0; i < count; i++) {
					let node = COMPUTES[i]!;
					COMPUTES[i] = null;
					if (
						node._flag & FLAG_STALE ||
						(node._flag & FLAG_PENDING && needsUpdate(node, time))
					) {
						node._update(time);
					} else {
						node._flag &= ~(FLAG_STALE | FLAG_PENDING);
					}
				}
				COMPUTE_COUNT = 0;
			}
			if (SCOPE_COUNT > 0) {
				let levels = LEVELS.length;
				for (let i = 0; i < levels; i++) {
					let count = LEVELS[i]!;
					let effects = SCOPES[i]!;
					for (let j = 0; j < count; j++) {
						let node = effects[j]!;
						if (
							node._flag & FLAG_STALE ||
							(node._flag & FLAG_PENDING && needsUpdate(node, time))
						) {
							try {
								TRANSACTION = SEED;
								node._update(time);
							} catch (err) {
								let e: unknown =
									node._flag & FLAG_PANIC ? err : { error: err, type: FATAL };
								node._flag &= ~FLAG_PANIC;
								let result = tryRecover(node, e);
								if (result !== RECOVER_SELF) {
									node._dispose();
								}
								if (!thrown && result === RECOVER_NONE) {
									error = e;
									thrown = true;
								}
							}
						} else {
							node._flag &= ~(FLAG_STALE | FLAG_PENDING);
						}
						(effects as (IEffect | null)[])[j] = null;
					}
					LEVELS[i] = 0;
				}
				SCOPE_COUNT = 0;
			}
			if (RECEIVER_COUNT > 0) {
				let count = RECEIVER_COUNT;
				for (let i = 0; i < count; i++) {
					let node = RECEIVERS[i]!;
					RECEIVERS[i] = null;
					if (
						node._flag & FLAG_STALE ||
						(node._flag & FLAG_PENDING && needsUpdate(node, time))
					) {
						TRANSACTION = SEED;
						try {
							node._update(time);
						} catch (err) {
							let e: unknown =
								node._flag & FLAG_PANIC ? err : { error: err, type: FATAL };
							node._flag &= ~FLAG_PANIC;
							let result = tryRecover(node, e);
							if (result !== RECOVER_SELF) {
								node._dispose();
							}
							if (!thrown && result === RECOVER_NONE) {
								error = e;
								thrown = true;
							}
						}
					} else {
						node._flag &= ~(FLAG_STALE | FLAG_PENDING);
					}
				}
				RECEIVER_COUNT = 0;
			}
			if (cycle++ === 1e5) {
				error = new Error("Runaway cycle");
				thrown = true;
				break;
			}
		} while (!thrown && (SENDER_COUNT > 0 || DISPOSER_COUNT > 0));
	} finally {
		IDLE = true;
		DISPOSER_COUNT = SENDER_COUNT = SCOPE_COUNT = RECEIVER_COUNT = 0;
		if (thrown) {
			throw error;
		}
	}
}

// ─── Unowned factory functions ──────────────────────────────────────

function compute(
	depOrFn: unknown,
	fnOrSeed?: unknown,
	optsOrSeed?: unknown,
	argsOrOpts?: unknown,
	args?: unknown,
): ICompute {
	let flag: number;
	let node: ICompute;
	if (typeof depOrFn === "function") {
		flag = FLAG_SETUP | ((0 | (optsOrSeed as number)) & OPTIONS);
		node = new _Compute(flag, depOrFn as ComputeFn, null, fnOrSeed, argsOrOpts);
	} else {
		flag =
			FLAG_STABLE |
			FLAG_BOUND |
			FLAG_SINGLE |
			((0 | (argsOrOpts as number)) & OPTIONS);
		node = new _Compute(
			flag,
			fnOrSeed as ComputeFn,
			depOrFn as ISender,
			optsOrSeed,
			args,
		);
		node._dep1slot = connect(depOrFn as ISender, node, -1);
	}
	if (!(flag & FLAG_DEFER)) {
		startCompute(node);
	}
	return node;
}

function task(
	depOrFn: unknown,
	fnOrSeed?: unknown,
	optsOrSeed?: unknown,
	argsOrOpts?: unknown,
	args?: unknown,
): ICompute {
	let flag: number;
	let node: ICompute;
	if (typeof depOrFn === "function") {
		flag = FLAG_ASYNC | FLAG_SETUP | ((0 | (optsOrSeed as number)) & OPTIONS);
		node = new _Compute(flag, depOrFn as ComputeFn, null, fnOrSeed, argsOrOpts);
	} else {
		flag =
			FLAG_ASYNC |
			FLAG_STABLE |
			FLAG_BOUND |
			FLAG_SINGLE |
			((0 | (argsOrOpts as number)) & OPTIONS);
		node = new _Compute(
			flag,
			fnOrSeed as ComputeFn,
			depOrFn as ISender,
			optsOrSeed,
			args,
		);
		node._dep1slot = connect(depOrFn as ISender, node, -1);
	}
	if (!(flag & FLAG_DEFER)) {
		startCompute(node);
	}
	return node;
}

function effect(
	depOrFn: unknown,
	fnOrOpts?: unknown,
	optsOrArgs?: unknown,
	args?: unknown,
): IEffect {
	let flag: number;
	let node: IEffect;
	if (typeof depOrFn === "function") {
		flag = FLAG_SETUP | ((0 | (fnOrOpts as number)) & OPTIONS);
		node = new _Effect(flag, depOrFn as EffectFn, null, null, optsOrArgs);
	} else {
		flag =
			FLAG_STABLE |
			FLAG_BOUND |
			FLAG_SINGLE |
			((0 | (optsOrArgs as number)) & OPTIONS);
		node = new _Effect(
			flag,
			fnOrOpts as EffectFn,
			depOrFn as ISender,
			null,
			args,
		);
		node._dep1slot = connect(depOrFn as ISender, node, -1);
	}
	startEffect(node);
	return node;
}

function spawn(
	depOrFn: unknown,
	fnOrOpts?: unknown,
	optsOrArgs?: unknown,
	args?: unknown,
): IEffect {
	let flag: number;
	let node: IEffect;
	if (typeof depOrFn === "function") {
		flag = FLAG_ASYNC | FLAG_SETUP | ((0 | (fnOrOpts as number)) & OPTIONS);
		node = new _Effect(flag, depOrFn as EffectFn, null, null, optsOrArgs);
	} else {
		flag =
			FLAG_ASYNC |
			FLAG_STABLE |
			FLAG_BOUND |
			FLAG_SINGLE |
			((0 | (optsOrArgs as number)) & OPTIONS);
		node = new _Effect(
			flag,
			fnOrOpts as EffectFn,
			depOrFn as ISender,
			null,
			args,
		);
		node._dep1slot = connect(depOrFn as ISender, node, -1);
	}
	startEffect(node);
	return node;
}

function microflush(): void {
	POSTING = false;
	flush();
}

function batch(fn: () => void): void {
	if (IDLE) {
		IDLE = false;
		try {
			fn();
			flush();
		} finally {
			IDLE = true;
		}
	} else {
		fn();
	}
}

// ─── Exports ────────────────────────────────────────────────────────

export {
	Root,
	Signal,
	Compute,
	Effect,
	FLAG_STALE,
	FLAG_PENDING,
	FLAG_SCHEDULED,
	FLAG_DISPOSED,
	FLAG_INIT,
	FLAG_SETUP,
	FLAG_LOADING,
	FLAG_ERROR,
	FLAG_RELAY,
	FLAG_DEFER,
	FLAG_STABLE,
	FLAG_SINGLE,
	FLAG_WEAK,
	FLAG_EQUAL,
	FLAG_NOTEQUAL,
	FLAG_ASYNC,
	FLAG_BOUND,
	FLAG_CHANNEL,
	FLAG_EAGER,
	FLAG_BLOCKED,
	FLAG_LOCK,
	FLAG_SUSPEND,
	REFUSE,
	PANIC,
	FATAL,
	OPT_DEFER,
	OPT_STABLE,
	OPT_SETUP,
	OPT_WEAK,
	OPTIONS,
	IDLE,
	connect,
	subscribe,
	schedule,
	assign,
	notify,
	flush,
	batch,
	startEffect,
	startCompute,
	signal,
	relay,
	compute,
	task,
	effect,
	spawn,
	root,
};
