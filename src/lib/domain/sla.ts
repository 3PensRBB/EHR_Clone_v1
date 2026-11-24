import { ESCALATE_AFTER_MS, MINUTE } from "./constants";
import type { CriticalEvent, Millis } from "./types";

export type SlaLevel = "green" | "amber" | "red" | "overdue" | "done" | "done_late";

export interface SlaState {
  level: SlaLevel;
  /** Milliseconds left in the 30-minute window (negative once overdue). */
  remainingMs: number;
  label: string;
}

export function formatDuration(ms: number): string {
  const neg = ms < 0;
  const total = Math.floor(Math.abs(ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${neg ? "-" : ""}${m}:${s.toString().padStart(2, "0")}`;
}

export function slaState(c: CriticalEvent, now: Millis): SlaState {
  if (c.status === "acknowledged" && c.acknowledgedAt != null) {
    const late = c.acknowledgedAt > c.slaDueAt;
    const mins = minutesToAck(c);
    return {
      level: late ? "done_late" : "done",
      remainingMs: c.slaDueAt - c.acknowledgedAt,
      label: late ? `Ack'd late (${mins} min)` : `Ack'd in ${mins} min`,
    };
  }
  const remainingMs = c.slaDueAt - now;
  if (remainingMs <= 0) return { level: "overdue", remainingMs, label: `OVERDUE ${formatDuration(-remainingMs)}` };
  const level: SlaLevel = remainingMs < 5 * MINUTE ? "red" : remainingMs < 15 * MINUTE ? "amber" : "green";
  return { level, remainingMs, label: `${formatDuration(remainingMs)} left` };
}

/** Minutes from verification (slaDueAt − 30 min) to acknowledgment, rounded to 0.1. */
export function minutesToAck(c: CriticalEvent): number | undefined {
  if (c.acknowledgedAt == null) return undefined;
  const verifiedAt = c.slaDueAt - 30 * MINUTE;
  return Math.round(((c.acknowledgedAt - verifiedAt) / MINUTE) * 10) / 10;
}

/** True when someone has been notified but hasn't acknowledged within the escalation window. */
export function isEscalationDue(c: CriticalEvent, now: Millis): boolean {
  return c.status === "notified" && c.lastNotifiedAt != null && now - c.lastNotifiedAt >= ESCALATE_AFTER_MS;
}
