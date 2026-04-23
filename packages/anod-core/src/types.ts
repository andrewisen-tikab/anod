/**
 * Internal type interfaces for the reactive engine.
 * These describe the internal shape of node objects — not the public API.
 * Public API types are generated from the source via tsc declarations.
 */

/** Cleanup function or array of cleanup functions. */
export type CleanupFn = () => void;
export type CleanupSlot = CleanupFn | CleanupFn[] | null;

/** Recovery handler: receives error POJO, returns true to swallow. */
export type RecoverFn = (error: unknown) => boolean;
export type RecoverSlot = RecoverFn | RecoverFn[] | null;

/** Schedule update handler. */
export type UpdateFn = (node: ISender, payload: unknown, time: number) => void;

/** Base interface for all disposable nodes. */
export interface Disposer {
  _flag: number;
  _cleanup: CleanupSlot;
  _dispose(): void;
  dispose(): void;
}

/** Owner interface — nodes that can own child nodes for hierarchical disposal. */
export interface Owner extends Disposer {
  _owned: IReceiver[] | null;
  _level: number;
  _owner: Owner | null;
  _recover: RecoverSlot;
  cleanup(fn: () => void): void;
  recover(fn: RecoverFn): void;
}

/**
 * Sender interface — nodes that can broadcast changes to subscribers.
 * Uses dual-pointer + overflow array layout for subscribers.
 */
export interface ISender<T = unknown> extends Disposer {
  _value: T;
  _version: number;
  _ctime: number;
  _sub1: IReceiver | null;
  _sub1slot: number;
  _subs: (IReceiver | number)[] | null;
  _assign(value: T, time: number): void;
  _drop(): void;
  _changed(value: unknown): boolean;
  get(): T;
  set(value: T | ((prev: T) => T)): void;
  notify(): void;
  post(value: T): void;
  readonly disposed: boolean;
}

/**
 * Receiver interface — nodes that can subscribe to senders.
 * Uses dual-pointer + overflow array layout for dependencies.
 */
export interface IReceiver extends Disposer {
  _dep1: ISender | null;
  _dep1slot: number;
  _deps: (ISender | number)[] | null;
  _time: number;
  _version: number;
  _receive(): void;
}

/** Combined sender + receiver for Compute nodes. */
export interface ICompute<T = unknown> extends ISender<T>, IReceiver {
  _fn: ComputeFn | null;
  _args: unknown;
  _channel(): IChannel;
  _refresh(): void;
  _update(time: number): void;
  _settle(value: T): void;
  _error(err: unknown): void;
  _read(sender: ISender, stamp: number): void;
  _readAsync(sender: ISender): unknown;
  _getMod?(): number;
  val(sender: ISender): unknown;
  peek(sender: ISender): unknown;
  equal(eq?: boolean): void;
  stable(): void;
  refuse(val: unknown): Err;
  panic(val: unknown): never;
  eager(): void;
  weak(): void;
  suspend(promiseOrTask: unknown): unknown;
  lock(): void;
  unlock(): void;
  controller(): AbortController;
  defer(sender: ISender): unknown;
  pending(tasks: ICompute | ICompute[]): boolean;
  cleanup(fn: () => void): void;
  readonly disposed: boolean;
  readonly error: Err | null;
  readonly loading: boolean;
}

/** Effect interface — side-effect sink with ownership. */
export interface IEffect extends Owner, IReceiver {
  _fn: EffectFn | null;
  _args: unknown;
  _channel(): IChannel;
  _update(time: number): void;
  _settle(err?: unknown): void;
  _error(err: unknown): void;
  _read(sender: ISender, stamp: number): void;
  _readAsync(sender: ISender): unknown;
  val(sender: ISender): unknown;
  peek(sender: ISender): unknown;
  equal(eq?: boolean): void;
  stable(): void;
  panic(val: unknown): never;
  suspend(promiseOrTask: unknown): unknown;
  lock(): void;
  unlock(): void;
  controller(): AbortController;
  defer(sender: ISender): unknown;
  pending(tasks: ICompute | ICompute[]): boolean;
  signal<T>(value: T): ISender<T>;
  compute(...args: unknown[]): ICompute;
  task(...args: unknown[]): ICompute;
  effect(...args: unknown[]): IEffect;
  spawn(...args: unknown[]): IEffect;
  root(fn: (c: IRoot) => void): IRoot;
  readonly disposed: boolean;
  readonly error: Err | null;
  readonly loading: boolean;
}

/** Channel — lazy async context for task/spawn nodes. */
export interface IChannel {
  _args: unknown;
  _controller: AbortController | null;
  _defer1: ISender | null;
  _defer1val: unknown;
  _defers: (ISender | unknown)[] | null;
  _res1: ICompute | null;
  _res1slot: number;
  _responds: (ICompute | number | null)[] | null;
  _waiters: (IReceiver | number | ((value: unknown) => void))[] | null;
}

/** Root interface — top-level ownership scope. */
export interface IRoot extends Owner {
  signal<T>(value: T): ISender<T>;
  compute(...args: unknown[]): ICompute;
  task(...args: unknown[]): ICompute;
  effect(...args: unknown[]): IEffect;
  spawn(...args: unknown[]): IEffect;
  root(fn: (c: IRoot) => void): IRoot;
  readonly disposed: boolean;
}

/**
 * Opaque callback types. The actual fn signature depends on runtime flags
 * (bound/unbound × sync/async × compute/effect). We use opaque branded
 * types to avoid `Function` and `any` while keeping the polymorphic dispatch
 * that V8 requires.
 */
export type ComputeFn = ((...args: never[]) => unknown) & {
  __brand?: "compute";
};
export type EffectFn = ((...args: never[]) => unknown) & { __brand?: "effect" };

/** Error type constants. */
export const REFUSE = 1 as const;
export const PANIC = 2 as const;
export const FATAL = 3 as const;

/** Error POJO returned by refuse/panic/thrown. */
export interface Err<T = unknown> {
  error: T;
  type: typeof REFUSE | typeof PANIC | typeof FATAL;
}

/**
 * Resolve utility type — unwraps Promise/AsyncIterator to the inner value type.
 */
export type Resolve<T> =
  T extends Promise<infer U>
    ? U
    : T extends AsyncIterable<infer U>
      ? U
      : T extends AsyncIterator<infer U, unknown, unknown>
        ? U
        : T;
