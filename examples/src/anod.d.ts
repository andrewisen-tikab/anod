declare module "anod" {
  export function root(fn: (r: any) => void): any;
  export function signal(value: any): any;
  export function relay(value: any): any;
  export function compute(fn: (...args: any[]) => any): any;
  export function compute(dep: any, fn: (...args: any[]) => any): any;
  export function effect(fn: (...args: any[]) => any): any;
  export function effect(dep: any, fn: (...args: any[]) => any): any;
  export function task(fn: (...args: any[]) => any): any;
  export function task(dep: any, fn: (...args: any[]) => any): any;
  export function spawn(fn: (...args: any[]) => any): any;
  export function spawn(dep: any, fn: (...args: any[]) => any): any;
  export function batch(fn: () => void): void;
  export function flush(): void;
  export function list(value?: any[]): any;

  export const OPT_DEFER: number;
  export const OPT_STABLE: number;
  export const OPT_SETUP: number;
  export const OPT_WEAK: number;
  export const REFUSE: number;
  export const PANIC: number;
  export const FATAL: number;
}
