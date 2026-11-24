"use client";

import { applyCommand, type Command } from "../domain/engine";
import type { RecipientPolicy, SimState } from "../domain/types";
import { buildSeed, SCHEMA_VERSION } from "../simulator/seed";
import { simNow, type CritLinkRepository, type DispatchResult } from "./repository";

const STORAGE_KEY = `critlink:state:v${SCHEMA_VERSION}`;

function newId(prefix: string) {
  const r = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}-${r.replace(/-/g, "").slice(0, 12)}`;
}

/**
 * Browser-only repository. State is persisted to localStorage, and the
 * `storage` event keeps multiple tabs (e.g. Lab Tech + Physician windows) in sync.
 */
export class LocalStorageRepository implements CritLinkRepository {
  private state: SimState | null = null;
  private lastRaw: string | null = null;
  private listeners = new Set<() => void>();

  constructor(private defaultPolicy: RecipientPolicy, private lockedPolicy?: RecipientPolicy) {}

  /** Call once on the client after mount. */
  init() {
    if (this.state) return;
    const existing = this.read();
    const current = existing ?? this.seed(this.defaultPolicy);
    if (existing) this.state = existing;
    else this.commit(current);
    if (this.lockedPolicy && current.settings.recipientPolicy !== this.lockedPolicy) {
      this.commit(applyCommand(current, { type: "setRecipientPolicy", policy: this.lockedPolicy }, this.ctx(current)).state);
    }
    window.addEventListener("storage", (e) => {
      if (e.key !== STORAGE_KEY) return;
      const next = this.read();
      if (next) {
        this.state = next;
        this.emit();
      }
    });
    this.emit();
  }

  getSnapshot = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  dispatch = (command: Command): DispatchResult => {
    // Re-read so we apply on top of the freshest state written by another tab.
    const base = this.read() ?? this.state;
    if (!base) return { ok: false, error: "Not loaded" };
    if (command.type === "setRecipientPolicy" && this.lockedPolicy && command.policy !== this.lockedPolicy)
      return { ok: false, error: "This deployment is locked to a single notification policy" };
    const result = applyCommand(base, command, this.ctx(base));
    if (result.state !== base) this.commit(result.state);
    else if (base !== this.state) {
      this.state = base;
      this.emit();
    }
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  };

  reset = (policy?: RecipientPolicy) => {
    this.commit(this.seed(this.lockedPolicy ?? policy ?? this.state?.settings.recipientPolicy ?? this.defaultPolicy));
  };

  private ctx(state: SimState) {
    return { now: simNow(state.clock), rand: Math.random, newId };
  }

  private seed(policy: RecipientPolicy): SimState {
    return buildSeed(Date.now(), policy);
  }

  private read(): SimState | null {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      if (raw === this.lastRaw && this.state) return this.state;
      const parsed = JSON.parse(raw) as SimState;
      if (parsed.schemaVersion !== SCHEMA_VERSION) return null;
      this.lastRaw = raw;
      return parsed;
    } catch {
      return null;
    }
  }

  private commit(next: SimState) {
    this.state = next;
    try {
      const raw = JSON.stringify(next);
      window.localStorage.setItem(STORAGE_KEY, raw);
      this.lastRaw = raw;
    } catch {
      /* storage full or blocked: keep working in memory */
    }
    this.emit();
  }

  private emit() {
    for (const l of this.listeners) l();
  }
}
