import { criticalView } from "./selectors";
import { minutesToAck } from "./sla";
import type { Millis, SimState } from "./types";

function quantile(sorted: number[], q: number): number | undefined {
  if (sorted.length === 0) return undefined;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return Math.round((sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)) * 10) / 10;
}

export const ACK_BINS = [
  { label: "0–5", lo: 0, hi: 5 },
  { label: "5–10", lo: 5, hi: 10 },
  { label: "10–15", lo: 10, hi: 15 },
  { label: "15–20", lo: 15, hi: 20 },
  { label: "20–25", lo: 20, hi: 25 },
  { label: "25–30", lo: 25, hi: 30 },
  { label: ">30", lo: 30, hi: Infinity },
];

export function computeMetrics(state: SimState, now: Millis) {
  const total = state.criticals.length;
  const acked = state.criticals.filter((c) => c.status === "acknowledged");
  const times = acked.map((c) => minutesToAck(c)!).sort((a, b) => a - b);
  const within = acked.filter((c) => !c.breachedAt).length;
  const open = state.criticals.filter((c) => c.status !== "acknowledged").length;
  const missed = state.criticals.filter((c) => c.breachedAt).length;
  const escalations = state.messages.filter((m) => m.kind === "escalation").length;
  const decided = within + missed; // criticals whose outcome is known

  const groupBy = (key: (c: (typeof state.criticals)[number]) => string) => {
    const m = new Map<string, { n: number; within: number; missed: number; times: number[] }>();
    for (const c of state.criticals) {
      const k = key(c);
      const g = m.get(k) ?? { n: 0, within: 0, missed: 0, times: [] };
      g.n++;
      if (c.status === "acknowledged" && !c.breachedAt) g.within++;
      if (c.breachedAt) g.missed++;
      if (c.acknowledgedAt) g.times.push(minutesToAck(c)!);
      m.set(k, g);
    }
    return [...m.entries()]
      .map(([k, g]) => ({ key: k, ...g, median: quantile([...g.times].sort((a, b) => a - b), 0.5) }))
      .sort((a, b) => b.n - a.n);
  };

  return {
    total,
    open,
    acked: acked.length,
    within,
    missed,
    escalations,
    pctWithin: decided ? Math.round((within / decided) * 1000) / 10 : undefined,
    median: quantile(times, 0.5),
    p90: quantile(times, 0.9),
    bins: ACK_BINS.map((b) => ({ ...b, count: times.filter((t) => t >= b.lo && t < b.hi).length })),
    byTest: groupBy((c) => criticalView(state, c, now).test.name),
    byUnit: groupBy((c) => criticalView(state, c, now).unit.short),
    byMethod: {
      inApp: state.notificationLog.filter((l) => l.method === "in_app").length,
      phone: state.notificationLog.filter((l) => l.method === "phone").length,
    },
  };
}
