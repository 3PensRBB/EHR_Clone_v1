"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { RecipientPolicy, SimState } from "../domain/types";
import { LocalStorageRepository } from "./local-storage-repository";
import { simNow, type CritLinkRepository } from "./repository";

/**
 * Set NEXT_PUBLIC_RECIPIENT_POLICY on a deployment to pin it to one demo version:
 *   physician_only       – only physicians/APPs can receive critical value messages
 *   physician_and_nurse  – nurses (primary RN, charge RN) can also receive them
 * Leave it unset to let presenters switch versions in the app.
 */
const envPolicy = process.env.NEXT_PUBLIC_RECIPIENT_POLICY as RecipientPolicy | undefined;
export const LOCKED_POLICY: RecipientPolicy | undefined =
  envPolicy === "physician_only" || envPolicy === "physician_and_nurse" ? envPolicy : undefined;

const RepoContext = createContext<CritLinkRepository | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [repo] = useState(() => new LocalStorageRepository(LOCKED_POLICY ?? "physician_only", LOCKED_POLICY));

  useEffect(() => {
    repo.init();
    const id = window.setInterval(() => repo.dispatch({ type: "tick" }), 1000);
    return () => window.clearInterval(id);
  }, [repo]);

  return <RepoContext.Provider value={repo}>{children}</RepoContext.Provider>;
}

export function useRepo(): CritLinkRepository {
  const repo = useContext(RepoContext);
  if (!repo) throw new Error("useRepo must be used inside <StoreProvider>");
  return repo;
}

export function useSim(): SimState | null {
  const repo = useRepo();
  return useSyncExternalStore(repo.subscribe, repo.getSnapshot, () => null);
}

/** Simulated "now", re-rendering twice a second so countdowns tick. */
export function useNow(): number {
  const sim = useSim();
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, []);
  return sim ? simNow(sim.clock) : Date.now();
}
