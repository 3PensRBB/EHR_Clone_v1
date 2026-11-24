"use client";

import { useState } from "react";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { useNow, useSim } from "@/lib/data/store";
import { computeMetrics } from "@/lib/domain/metrics";
import { criticalView, formatDateTime, formatTime, fullName, staffById } from "@/lib/domain/selectors";
import { formatValue } from "@/lib/domain/tests-catalog";

function Stat({ label, value, sub, status }: { label: string; value: string; sub?: string; status?: "ok" | "crit" | "warn" }) {
  const color = status === "ok" ? "text-ok" : status === "crit" ? "text-crit" : status === "warn" ? "text-warn" : "text-ink";
  return (
    <div className="rounded-lg border border-line bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={`tabular mt-1 text-3xl font-black ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

/** Single-series histogram of minutes from verification to acknowledgment. */
function AckHistogram({ bins }: { bins: { label: string; count: number; lo: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...bins.map((b) => b.count));
  return (
    <div>
      <div className="relative flex h-44 items-end gap-[2px] border-b border-line">
        {bins.map((b, i) => {
          const late = b.lo >= 30;
          return (
            <div
              key={b.label}
              className="group relative flex h-full flex-1 cursor-default flex-col justify-end"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {hover === i && (
                <div className="absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-ink px-2 py-1 text-xs text-white shadow">
                  {b.label} min: <b>{b.count}</b> {b.count === 1 ? "critical" : "criticals"}
                  {late && " (outside window)"}
                </div>
              )}
              {b.count > 0 && <div className="mb-0.5 text-center text-[11px] text-muted tabular">{b.count}</div>}
              <div
                className={`mx-auto w-[70%] rounded-t-[4px] transition-opacity ${late ? "bg-crit" : "bg-brand"} ${hover != null && hover !== i ? "opacity-50" : ""}`}
                style={{ height: `${(b.count / max) * 85}%`, minHeight: b.count ? 3 : 0 }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-[2px] text-center text-[11px] text-muted">
        {bins.map((b) => (
          <div key={b.label} className="flex-1">
            {b.label}
          </div>
        ))}
      </div>
      <div className="mt-1 text-center text-xs text-muted">Minutes from result verification to read-back acknowledgment</div>
      <div className="mt-2 flex justify-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand" /> Within 30-min window
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-crit" /> ⚠ Outside window
        </span>
      </div>
    </div>
  );
}

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function DashboardPage() {
  const sim = useSim()!;
  const now = useNow();
  const m = computeMetrics(sim, now);

  const exportCsv = () => {
    const header = ["Notified at", "Patient", "MRN", "Test", "Value", "Notified", "Role", "Method", "By tech", "Min from verify", "Within 30 min", "Read-back", "Notes"];
    const rows = sim.notificationLog.map((l) => {
      const c = sim.criticals.find((x) => x.id === l.criticalId)!;
      const v = criticalView(sim, c, now);
      const who = staffById(sim, l.notifiedId);
      return [
        new Date(l.at).toISOString(),
        `${v.patient.lastName}, ${v.patient.firstName}`,
        v.patient.mrn,
        v.test.name,
        `${formatValue(v.test, v.result.value, v.result.textValue)} ${v.test.units}`,
        fullName(who),
        who?.title,
        l.method,
        staffById(sim, l.byTechId)?.name,
        l.minutesFromVerify,
        l.withinSla ? "Y" : "N",
        l.readBackOk ? "Y" : "N",
        l.notes,
      ];
    });
    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "critical-value-notification-log.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (m.total === 0)
    return <EmptyState title="No critical values yet">Generate some from the Lab worklist or Demo Controls to populate compliance metrics.</EmptyState>;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Critical Value Compliance</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat
          label="Within 30 min"
          value={m.pctWithin != null ? `${m.pctWithin}%` : "—"}
          sub={`${m.within} of ${m.within + m.missed} closed`}
          status={m.pctWithin == null ? undefined : m.pctWithin >= 95 ? "ok" : m.pctWithin >= 85 ? "warn" : "crit"}
        />
        <Stat label="Median time to ack" value={m.median != null ? `${m.median}m` : "—"} sub={m.p90 != null ? `p90 ${m.p90}m` : undefined} />
        <Stat label="Critical values" value={String(m.total)} sub={`${m.open} open now`} />
        <Stat label="Escalations" value={String(m.escalations)} />
        <Stat label="Missed (incidents)" value={String(m.missed)} status={m.missed ? "crit" : "ok"} />
        <Stat label="Documented" value={String(m.acked)} sub={`${m.byMethod.inApp} in-EHR · ${m.byMethod.phone} phone`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card title="Time to acknowledgment">
          {m.acked ? <AckHistogram bins={m.bins} /> : <div className="py-10 text-center text-sm text-muted">No acknowledgments yet.</div>}
        </Card>
        <Card title="By test / by unit">
          {[
            ["Test", m.byTest],
            ["Unit", m.byUnit],
          ].map(([label, rows]) => (
            <table key={label as string} className="mb-4 w-full text-sm last:mb-0">
              <thead className="text-left text-xs uppercase text-muted">
                <tr>
                  <th className="py-1">{label as string}</th>
                  <th className="py-1 text-right">N</th>
                  <th className="py-1 text-right">Within</th>
                  <th className="py-1 text-right">Missed</th>
                  <th className="py-1 text-right">Median</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {(rows as typeof m.byTest).map((r) => (
                  <tr key={r.key} className="border-t border-line">
                    <td className="py-1">{r.key}</td>
                    <td className="py-1 text-right">{r.n}</td>
                    <td className="py-1 text-right">{r.within}</td>
                    <td className={`py-1 text-right ${r.missed ? "font-semibold text-crit" : ""}`}>{r.missed}</td>
                    <td className="py-1 text-right">{r.median != null ? `${r.median}m` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </Card>
      </div>

      <Card title={`Incident report drafts (${sim.incidents.length})`}>
        {sim.incidents.length === 0 ? (
          <div className="text-sm text-muted">None. Every critical value has been acknowledged within 30 minutes so far.</div>
        ) : (
          <div className="space-y-3">
            {[...sim.incidents].reverse().map((inc) => (
              <details key={inc.id} className="rounded-md border border-red-200 bg-crit-bg p-3 text-sm">
                <summary className="cursor-pointer font-semibold">
                  <Badge tone="crit">DRAFT</Badge> {formatDateTime(inc.createdAt)} — {inc.summary}
                </summary>
                <ol className="mt-2 space-y-0.5 border-l-2 border-red-200 pl-3 text-xs">
                  {inc.timeline.map((t, i) => (
                    <li key={i}>
                      <span className="tabular text-muted">{formatTime(t.at)}</span> {t.text}
                    </li>
                  ))}
                </ol>
              </details>
            ))}
          </div>
        )}
      </Card>

      <Card title="Notification log" actions={<Button size="sm" onClick={exportCsv} disabled={!sim.notificationLog.length}>Export CSV</Button>}>
        {sim.notificationLog.length === 0 ? (
          <div className="text-sm text-muted">No completed notifications yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs uppercase text-muted">
                <tr>
                  <th className="py-1">Time</th>
                  <th className="py-1">Patient</th>
                  <th className="py-1">Result</th>
                  <th className="py-1">Notified</th>
                  <th className="py-1">Method</th>
                  <th className="py-1 pr-4 text-right">Minutes</th>
                  <th className="py-1">Read-back</th>
                </tr>
              </thead>
              <tbody>
                {[...sim.notificationLog].reverse().map((l) => {
                  const c = sim.criticals.find((x) => x.id === l.criticalId)!;
                  const v = criticalView(sim, c, now);
                  return (
                    <tr key={l.id} className="border-t border-line">
                      <td className="tabular py-1.5">{formatTime(l.at)}</td>
                      <td className="py-1.5">
                        {v.patient.lastName.toUpperCase()} <span className="text-xs text-muted">{v.patient.mrn}</span>
                      </td>
                      <td className="py-1.5">
                        {v.test.name} {formatValue(v.test, v.result.value, v.result.textValue)}
                      </td>
                      <td className="py-1.5">{fullName(staffById(sim, l.notifiedId))}</td>
                      <td className="py-1.5">{l.method === "phone" ? "Phone" : "In-EHR"}</td>
                      <td className="tabular py-1.5 pr-4 text-right">
                        {l.minutesFromVerify} {!l.withinSla && <Badge tone="crit">late</Badge>}
                      </td>
                      <td className="py-1.5">{l.readBackOk ? <Badge tone="ok">✓ verified</Badge> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
