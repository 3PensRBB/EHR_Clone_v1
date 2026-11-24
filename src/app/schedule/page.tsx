"use client";

import { Badge, Card } from "@/components/ui";
import { useNow, useSim } from "@/lib/data/store";
import { formatDateTime, formatTime, fullName, staffById } from "@/lib/domain/selectors";
import type { Shift, SimState } from "@/lib/domain/types";

const ROLE_LABEL: Record<Shift["role"], string> = {
  primary: "Covering (primary)",
  backup: "Backup",
  attending: "Attending",
  rn: "RN",
  charge_rn: "Charge RN",
};

function Row({ sim, s, now }: { sim: SimState; s: Shift; now: number }) {
  const staff = staffById(sim, s.staffId);
  const active = s.startsAt <= now && now < s.endsAt;
  return (
    <tr className="border-t border-line">
      <td className="py-1.5 pr-3 text-xs text-muted">{ROLE_LABEL[s.role]}</td>
      <td className="py-1.5 pr-3">
        <b>{fullName(staff)}</b> <span className="text-xs text-muted">{staff?.title}</span>
      </td>
      <td className="tabular py-1.5 pr-3 text-xs">
        {formatTime(s.startsAt)}–{formatTime(s.endsAt)}
      </td>
      <td className="py-1.5 pr-3 text-xs">{staff?.phone}</td>
      <td className="py-1.5">{active ? <Badge tone="ok">On now</Badge> : now < s.startsAt ? <span className="text-xs text-muted">Next</span> : null}</td>
    </tr>
  );
}

export default function SchedulePage() {
  const sim = useSim()!;
  const now = useNow();
  // Show what's on now plus the next block for each slot.
  const relevant = (s: Shift) => s.endsAt > now && s.startsAt < now + 14 * 3600_000;
  const rnMode = sim.settings.recipientPolicy === "physician_and_nurse";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">On-Call Schedule</h1>
        <p className="text-sm text-muted">
          Coverage is resolved from this schedule at the moment a critical value is worked. Now: {formatDateTime(now)}. Day shift
          07:00–19:00, nights 19:00–07:00.
        </p>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        {sim.services.map((svc) => (
          <Card key={svc.id} title={svc.name}>
            <div className="mb-2 text-xs text-muted">Units: {sim.units.filter((u) => u.serviceId === svc.id).map((u) => u.short).join(", ")}</div>
            <table className="w-full text-sm">
              <tbody>
                {sim.shifts
                  .filter((s) => s.serviceId === svc.id && relevant(s))
                  .sort((a, b) => a.startsAt - b.startsAt || a.role.localeCompare(b.role))
                  .map((s) => (
                    <Row key={s.id} sim={sim} s={s} now={now} />
                  ))}
              </tbody>
            </table>
          </Card>
        ))}
      </div>

      <Card
        title="Nursing assignments"
        actions={
          <Badge tone={rnMode ? "info" : "neutral"}>{rnMode ? "Nurses can receive critical values" : "Not used in physician-only mode"}</Badge>
        }
      >
        <div className={rnMode ? "" : "opacity-60"}>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {sim.units.map((u) => (
              <div key={u.id}>
                <div className="mb-1 text-sm font-semibold">{u.name}</div>
                <table className="w-full text-sm">
                  <tbody>
                    {sim.shifts
                      .filter((s) => s.unitId === u.id && s.startsAt <= now && now < s.endsAt)
                      .map((s) => (
                        <Row key={s.id} sim={sim} s={s} now={now} />
                      ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
