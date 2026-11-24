/**
 * Persistence boundary.
 *
 * The UI only ever talks to a `CritLinkRepository`. Today the implementation is
 * `LocalStorageRepository` (no database — state lives in the browser and syncs
 * across tabs). To add a database later, implement this interface with an
 * `ApiRepository` that POSTs commands to `/api/commands` (which runs the same
 * `applyCommand` against Postgres in a transaction) and subscribes to a realtime
 * channel for updates. No component code needs to change.
 */
import type { Command } from "../domain/engine";
import type { DemoClock, Millis, RecipientPolicy, SimState } from "../domain/types";

export type DispatchResult = { ok: true } | { ok: false; error: string };

export interface CritLinkRepository {
  /** Current state, or null until loaded (e.g. during SSR / first fetch). */
  getSnapshot(): SimState | null;
  /** Subscribe to state changes; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Apply a command. */
  dispatch(command: Command): DispatchResult;
  /** Wipe and reseed the demo. */
  reset(policy?: RecipientPolicy): void;
}

export function simNow(clock: DemoClock, realNow: Millis = Date.now()): Millis {
  return clock.anchorSim + (realNow - clock.anchorReal) * clock.speed;
}
