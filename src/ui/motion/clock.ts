import { useSyncExternalStore } from "react";

/**
 * One shared animation clock for every spinner/shimmer. It ticks only while at least one
 * animated component is mounted, so an idle UI costs nothing. Reduce-motion freezes it.
 */
export const FRAME_MS = 80;

let frame = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let frozen = false;
const listeners = new Set<() => void>();

function start() {
  if (timer || frozen) return;
  timer = setInterval(() => {
    frame = (frame + 1) % 1_000_000;
    for (const l of listeners) l();
  }, FRAME_MS);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

export function setMotionFrozen(value: boolean) {
  frozen = value;
  if (frozen) stop();
  else if (listeners.size > 0) start();
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

const noop = () => () => {};

/** Current animation frame (0 when motion is frozen or `active` is false). */
export function useFrame(active = true): number {
  return useSyncExternalStore(active ? subscribe : noop, () => (active && !frozen ? frame : 0));
}

export const isMotionFrozen = () => frozen;
/** Test hook. */
export const listenerCount = () => listeners.size;
