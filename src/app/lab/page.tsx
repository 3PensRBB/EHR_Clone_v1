"use client";

import { useEffect, useMemo, useState } from "react";
import { CriticalDetail } from "@/components/lab/critical-detail";
import { Badge, Button, EmptyState, FlagBadge, SlaPill, cn } from "@/components/ui";
import { useNow, useRepo, useSim } from "@/lib/data/store";
import { criticalView, displayName, formatTime, messagesFor, staffById } from "@/lib/domain/selectors";
import { isEscalationDue, slaState } from "@/lib/domain/sla";
import { formatValue } from "@/lib/domain/tests-catalog";

type Tab = "active" | "completed" | "all";

export default function LabPage() {
  const sim = useSim()!;
  const now = useNow();
  const repo = useRepo();
  const [tab, setTab] = useState<Tab>("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const list = sim.criticals
      .filter((c) => (tab === "active" ? c.status !== "acknowledged" : tab === "completed" ? c.status === "acknowledged" : true))
      .map((c) => ({ c, v: criticalView(sim, c, now), sla: slaState(c, now) }));
    return list.sort((a, b) =>
      tab === "active" ? a.c.slaDueAt - b.c.slaDueAt : (b.c.acknowledgedAt ?? b.c.createdAt) - (a.c.acknowledgedAt ?? a.c.createdAt),
    );
  }, [sim, now, tab]);

  // Pin the selection so the panel doesn't jump to another patient when the
  // current one is acknowledged and leaves the Active list.
  const firstRowId = rows[0]?.c.id;
  useEffect(() => {
    if (!selectedId && firstRowId) setSelectedId(firstRowId);
  }, [selectedId, firstRowId]);
  const selected = sim.criticals.find((c) => c.id === selectedId) ?? rows[0]?.c;
  const activeCount = sim.criticals.filter((c) => c.status !== "acknowledged").length;
  const tech = staffById(sim, sim.settings.currentTechId);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold">Critical Values Worklist</h1>
          <span className="text-sm text-muted">
            Signed in as{" "}
            <select
              value={sim.settings.currentTechId}
              onChange={(e) => repo.dispatch({ type: "updateSettings", patch: { currentTechId: e.target.value } })}
              className="rounded border border-line bg-white px-1 py-0.5 text-ink"
            >
              {sim.staff
                .filter((s) => s.kind === "tech")
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}, {s.credentials}
                  </option>
                ))}
            </select>{" "}
            · {tech?.phone}
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="primary" onClick={() => repo.dispatch({ type: "generate", count: 1 })}>
              + Simulate critical
            </Button>
            <Button size="sm" onClick={() => repo.dispatch({ type: "generate", count: 6 })}>
              Busy night (×6)
            </Button>
          </div>
        </div>

        <div className="mb-2 flex gap-1 text-sm">
          {(["active", "completed", "all"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn("rounded-md px-3 py-1 capitalize", tab === t ? "bg-ink text-white" : "bg-white text-ink hover:bg-slate-100")}
            >
              {t}
              {t === "active" && ` (${activeCount})`}
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <EmptyState title={tab === "active" ? "No open critical values" : "Nothing here yet"}>
            Use <b>+ Simulate critical</b> or the Demo Controls to generate results.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-white shadow-sm">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-2.5 py-2">Timer</th>
                  <th className="px-2.5 py-2">Patient</th>
                  <th className="px-2.5 py-2">Result</th>
                  <th className="px-2.5 py-2">Ordering → Covering now</th>
                  <th className="px-2.5 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ c, v, sla }) => {
                  const msgs = messagesFor(sim, c.id);
                  const last = [...msgs].reverse().find((m) => m.kind === "critical" || m.kind === "escalation");
                  const esc = isEscalationDue(c, now);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      className={cn(
                        "cursor-pointer border-t border-line align-top hover:bg-blue-50/50",
                        selected?.id === c.id && "bg-blue-50",
                      )}
                    >
                      <td className="px-2.5 py-2">
                        <SlaPill level={sla.level} label={sla.label} />
                      </td>
                      <td className="px-2.5 py-2">
                        <div className="font-semibold">
                          {v.patient.lastName.toUpperCase()}, {v.patient.firstName}
                        </div>
                        <div className="text-xs text-muted">
                          {v.patient.mrn} · {v.unit.short}-{v.patient.bed}
                        </div>
                      </td>
                      <td className="px-2.5 py-2">
                        <div className="text-xs text-muted">{v.test.name}</div>
                        <div className="font-bold text-crit tabular">
                          {formatValue(v.test, v.result.value, v.result.textValue)} {v.test.units} <FlagBadge flag={v.result.flag} />
                        </div>
                      </td>
                      <td className="px-2.5 py-2 text-xs">
                        <div className="text-muted">{displayName(v.coverage.ordering)}</div>
                        <div className={cn("font-semibold", v.coverage.differs && "text-warn")}>
                          {v.coverage.differs ? "≠ " : "= "}
                          {displayName(v.coverage.covering?.staff)}
                        </div>
                      </td>
                      <td className="px-2.5 py-2 text-xs">
                        {c.status === "open" && <Badge tone="crit">Not yet notified</Badge>}
                        {c.status === "notified" && (
                          <div className="space-y-1">
                            <Badge tone={esc ? "warn" : "info"}>{esc ? "Escalation due" : "Awaiting ack"}</Badge>
                            <div className="text-muted">
                              {displayName(staffById(sim, c.lastNotifiedId))} · {last?.readAt ? `read ${formatTime(last.readAt)}` : last?.deliveredAt ? "delivered" : "sent"}
                            </div>
                          </div>
                        )}
                        {c.status === "acknowledged" && (
                          <div className="space-y-1">
                            <Badge tone="ok">Read-back ✓</Badge>
                            <div className="text-muted">{displayName(staffById(sim, c.acknowledgedById))}</div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="min-w-0">
        {selected ? (
          <CriticalDetail key={selected.id} sim={sim} critical={selected} now={now} />
        ) : (
          <EmptyState title="Select a critical value">Details, coverage and messaging appear here.</EmptyState>
        )}
      </div>
    </div>
  );
}
