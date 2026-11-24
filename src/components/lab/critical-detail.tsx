"use client";

import { useState } from "react";
import { useRepo } from "@/lib/data/store";
import type { ChainEntry } from "@/lib/domain/coverage";
import { ESCALATE_AFTER_MINUTES } from "@/lib/domain/constants";
import {
  ageYears,
  buildPayload,
  criticalView,
  displayName,
  formatDateTime,
  formatTime,
  fullName,
  staffById,
} from "@/lib/domain/selectors";
import { isEscalationDue, minutesToAck, slaState } from "@/lib/domain/sla";
import { formatCriticalLimits, formatRefRange, formatValue } from "@/lib/domain/tests-catalog";
import type { CriticalEvent, SimState } from "@/lib/domain/types";
import { MessageThread, PayloadCard } from "../thread";
import { Badge, Button, Card, Field, FlagBadge, SlaPill, cn } from "../ui";

function shiftEnds(e: ChainEntry) {
  return e.shift ? `until ${formatTime(e.shift.endsAt)}` : "";
}

export function CriticalDetail({ sim, critical, now }: { sim: SimState; critical: CriticalEvent; now: number }) {
  const repo = useRepo();
  const v = criticalView(sim, critical, now);
  const { patient, unit, test, result, coverage } = v;
  const sla = slaState(critical, now);
  const techId = sim.settings.currentTechId;
  const lastIdx = coverage.chain.findIndex((e) => e.staff.id === critical.lastNotifiedId);
  const nextEntry = critical.status === "notified" ? coverage.chain[lastIdx + 1] : undefined;
  const escalationDue = isEscalationDue(critical, now);

  const [recipientId, setRecipientId] = useState<string | undefined>(
    critical.lastNotifiedId && critical.status === "notified" ? nextEntry?.staff.id : coverage.covering?.staff.id,
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showPhone, setShowPhone] = useState(false);
  const [phoneWho, setPhoneWho] = useState(coverage.covering?.staff.id ?? "");
  const [phoneRb, setPhoneRb] = useState(false);
  const [phoneNotes, setPhoneNotes] = useState("");

  const [reply, setReply] = useState("");
  const sendReply = () => {
    if (!critical.lastNotifiedId) return;
    const r = repo.dispatch({ type: "reply", criticalId: critical.id, senderId: techId, recipientId: critical.lastNotifiedId, body: reply });
    if (r.ok) setReply("");
  };

  const recipient = staffById(sim, recipientId);
  const acked = critical.status === "acknowledged";

  const send = (to: string | undefined) => {
    if (!to) return;
    const r = repo.dispatch({ type: "notify", criticalId: critical.id, recipientId: to, techId, note });
    setError(r.ok ? null : r.error);
    if (r.ok) setNote("");
  };

  const logPhone = () => {
    const r = repo.dispatch({ type: "logPhone", criticalId: critical.id, techId, notifiedId: phoneWho, readBackOk: phoneRb, notes: phoneNotes });
    setError(r.ok ? null : r.error);
  };

  const audit = sim.audit.filter((a) => a.criticalId === critical.id);

  return (
    <div className="space-y-4">
      {/* Patient + timer header */}
      <div className="rounded-lg border border-line bg-panel p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-bold">
              {patient.lastName.toUpperCase()}, {patient.firstName}
            </div>
            <div className="text-sm text-muted">
              MRN <b className="text-ink">{patient.mrn}</b> · {ageYears(patient.dob, now)}y {patient.sex} · DOB {patient.dob} ·{" "}
              {unit.short}-{patient.bed} ({unit.name}) · {sim.services.find((s) => s.id === patient.serviceId)?.name}
            </div>
          </div>
          <div className="ml-auto flex flex-col items-end">
            <SlaPill level={sla.level} label={sla.label} large />
            <div className="mt-1 text-xs text-muted">30-min window from verification {formatTime(result.verifiedAt)}</div>
          </div>
        </div>
      </div>

      {/* Result */}
      <Card title="Critical result">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="col-span-2">
            <div className="text-xs uppercase tracking-wide text-muted">{test.name}</div>
            <div className="text-3xl font-black text-crit tabular">
              {formatValue(test, result.value, result.textValue)} <span className="text-base font-semibold">{test.units}</span>{" "}
              <FlagBadge flag={result.flag} />
            </div>
          </div>
          <Field label="Reference range">{formatRefRange(test)}</Field>
          <Field label="Critical limits">{formatCriticalLimits(test)}</Field>
          <Field label="Collected">{formatDateTime(result.collectedAt)}</Field>
          <Field label="Verified">
            {formatDateTime(result.verifiedAt)} by {staffById(sim, result.verifiedByTechId)?.name}
          </Field>
          <Field label="Accession">{result.accession}</Field>
          <Field label="Ordering provider">{fullName(coverage.ordering)}</Field>
        </div>
        {v.history.length > 1 && (
          <div className="mt-4">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Recent {test.name} (delta)</div>
            <table className="w-full text-sm">
              <tbody>
                {v.history.map((h) => (
                  <tr key={h.id} className={cn("border-t border-line", h.id === result.id && "font-semibold")}>
                    <td className="py-1 pr-3 text-muted">{formatDateTime(h.collectedAt)}</td>
                    <td className="py-1 pr-3 tabular">
                      {formatValue(test, h.value, h.textValue)} {test.units}
                    </td>
                    <td className="py-1">
                      <FlagBadge flag={h.flag} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Coverage */}
      <Card title="Who to notify — right now">
        {coverage.differs && (
          <div className="mb-3 rounded-md border border-amber-300 bg-warn-bg px-3 py-2 text-sm">
            <b>Ordering ≠ Covering.</b> {displayName(coverage.ordering)} ordered this test, but{" "}
            <b>{displayName(coverage.covering?.staff)}</b> is covering {coverage.covering?.shift?.label.toLowerCase()} {coverage.covering && shiftEnds(coverage.covering)}.
          </div>
        )}
        <div className="space-y-1.5">
          {coverage.chain.map((e, i) => {
            const isLast = e.staff.id === critical.lastNotifiedId;
            return (
              <label
                key={e.staff.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm",
                  recipientId === e.staff.id ? "border-brand bg-blue-50" : "border-line hover:bg-slate-50",
                  acked && "cursor-default opacity-70",
                )}
              >
                <input
                  type="radio"
                  name={`recipient-${critical.id}`}
                  checked={recipientId === e.staff.id}
                  onChange={() => setRecipientId(e.staff.id)}
                  disabled={acked}
                />
                <span className="w-5 text-center text-xs text-muted">{i + 1}</span>
                <span className="flex-1">
                  <b>{fullName(e.staff)}</b> <span className="text-muted">· {e.staff.title}</span>
                  <div className="text-xs text-muted">
                    {e.role} {shiftEnds(e)} · {e.staff.phone}
                  </div>
                </span>
                {e.staff.kind === "nurse" ? <Badge tone="info">RN</Badge> : null}
                {i === 0 && <Badge tone="ok">Covering</Badge>}
                {isLast && critical.status === "notified" && <Badge tone="warn">Awaiting ack</Badge>}
              </label>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">
          Escalation order follows the list.{" "}
          {sim.settings.recipientPolicy === "physician_only"
            ? "Physician-only mode: nurses cannot receive critical value notifications."
            : "Physician + RN mode: the patient's primary RN and the unit charge RN may receive and acknowledge."}
        </p>
      </Card>

      {/* Escalation prompt */}
      {escalationDue && !acked && (
        <div className="rounded-lg border-2 border-amber-400 bg-warn-bg p-4">
          <div className="font-semibold text-warn">
            No acknowledgment from {displayName(staffById(sim, critical.lastNotifiedId))} in {ESCALATE_AFTER_MINUTES}+ minutes.
          </div>
          {nextEntry ? (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="text-sm">
                Next in chain: <b>{fullName(nextEntry.staff)}</b> ({nextEntry.role})
              </span>
              <Button variant="warn" onClick={() => send(nextEntry.staff.id)}>
                Escalate to {displayName(nextEntry.staff)} →
              </Button>
            </div>
          ) : (
            <div className="mt-1 text-sm">End of chain reached — call the house supervisor / lab medical director per policy.</div>
          )}
        </div>
      )}

      {/* Composer / completion */}
      {acked ? (
        <div className="rounded-lg border-2 border-green-400 bg-ok-bg p-4">
          <div className="font-semibold text-ok">✓ Notification complete — documented automatically</div>
          <div className="mt-1 text-sm">
            <b>{fullName(staffById(sim, critical.acknowledgedById))}</b> read back <b>&quot;{critical.readBackValue}&quot;</b> at{" "}
            {formatTime(critical.acknowledgedAt!)} via {critical.ackMethod === "phone" ? "phone" : "in-EHR secure message"} —{" "}
            <b>{minutesToAck(critical)} min</b> from verification{critical.breachedAt ? " (outside 30-min window)" : " (within 30 min)"}.
          </div>
        </div>
      ) : (
        <Card title="Send secure message">
          <div className="mb-2 text-sm">
            To: <b>{recipient ? fullName(recipient) : "Select a recipient above"}</b>
            {recipient && <span className="text-muted"> · {recipient.title}</span>}
          </div>
          <PayloadCard p={buildPayload(v)} />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note (e.g., 'Hemolysis not present. Repeat sent.')"
            className="mt-3 w-full rounded-md border border-line p-2 text-sm"
            rows={2}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button variant="danger" onClick={() => send(recipientId)} disabled={!recipientId}>
              {critical.status !== "notified" ? "Send" : critical.lastNotifiedId === recipientId ? "Re-send" : "Escalate"} critical value →
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowPhone((s) => !s)}>
              {showPhone ? "Hide" : "Notified by phone instead?"}
            </Button>
            {critical.lastNotifiedId && (
              <a
                href={`/inbox?as=${critical.lastNotifiedId}&c=${critical.id}`}
                target="_blank"
                rel="noreferrer"
                className="ml-auto text-xs text-brand underline"
              >
                Open recipient&apos;s view in new tab ↗
              </a>
            )}
          </div>
          {showPhone && (
            <div className="mt-3 space-y-2 rounded-md border border-line bg-slate-50 p-3 text-sm">
              <div className="font-semibold">Document phone notification</div>
              <select value={phoneWho} onChange={(e) => setPhoneWho(e.target.value)} className="w-full rounded border border-line p-1.5">
                {coverage.chain.map((e) => (
                  <option key={e.staff.id} value={e.staff.id}>
                    {fullName(e.staff)} — {e.role}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={phoneRb} onChange={(e) => setPhoneRb(e.target.checked)} />
                Recipient read back the patient name, MRN and value correctly
              </label>
              <input
                value={phoneNotes}
                onChange={(e) => setPhoneNotes(e.target.value)}
                placeholder="Notes"
                className="w-full rounded border border-line p-1.5"
              />
              <Button size="sm" variant="primary" onClick={logPhone}>
                Document notification
              </Button>
            </div>
          )}
          {error && <div className="mt-2 text-sm font-medium text-crit">{error}</div>}
        </Card>
      )}

      <Card title="Message thread">
        <MessageThread sim={sim} criticalId={critical.id} />
        {critical.lastNotifiedId && (
          <div className="mt-3 flex gap-2">
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendReply()}
              placeholder={`Reply to ${displayName(staffById(sim, critical.lastNotifiedId))}`}
              className="flex-1 rounded-md border border-line p-2 text-sm"
            />
            <Button onClick={sendReply} disabled={!reply.trim()}>
              Send
            </Button>
          </div>
        )}
      </Card>

      <Card title="Audit trail">
        <ol className="space-y-1 text-xs">
          {audit.map((a) => (
            <li key={a.id} className="flex gap-2">
              <span className="tabular w-12 shrink-0 text-muted">{formatTime(a.at)}</span>
              <span>
                <b>{a.action}</b>
                {a.detail && <span className="text-muted"> — {a.detail}</span>}
                {a.actorId !== "system" && <span className="text-muted"> · {displayName(staffById(sim, a.actorId))}</span>}
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
