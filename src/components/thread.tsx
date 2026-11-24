"use client";

import { displayName, formatTime, messagesFor, staffById } from "@/lib/domain/selectors";
import type { CriticalPayload, Message, SimState } from "@/lib/domain/types";
import { Badge, cn } from "./ui";

export function PayloadCard({ p, compact }: { p: CriticalPayload; compact?: boolean }) {
  return (
    <div className="rounded-md border-2 border-crit bg-crit-bg p-3 text-ink">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-black tracking-wider text-crit">CRITICAL VALUE</span>
        <span className="text-[10px] text-muted" title="Fields are populated from the LIS and cannot be edited">🔒 from LIS</span>
      </div>
      <div className="font-semibold">
        {p.patientName} <span className="font-normal text-muted">MRN {p.mrn} · {p.location}</span>
      </div>
      <div className={cn("mt-1", compact ? "text-base" : "text-lg")}>
        {p.testName}: <b className="text-crit">{p.value} {p.units}</b> <Badge tone="crit">{p.flag}</Badge>
      </div>
      <div className="mt-0.5 text-xs text-muted">
        Ref {p.refRange} · Collected {formatTime(p.collectedAt)} · Verified {formatTime(p.verifiedAt)} · Acc# {p.accession}
      </div>
    </div>
  );
}

function Receipt({ m }: { m: Message }) {
  if (m.readAt) return <span className="text-brand">✓✓ Read {formatTime(m.readAt)}</span>;
  if (m.deliveredAt) return <span>✓✓ Delivered</span>;
  return <span>✓ Sent</span>;
}

export function MessageThread({ sim, criticalId, viewerId }: { sim: SimState; criticalId: string; viewerId?: string }) {
  const msgs = messagesFor(sim, criticalId);
  if (msgs.length === 0) return <div className="text-sm text-muted">No messages yet.</div>;
  const isLabViewer = !viewerId || staffById(sim, viewerId)?.kind === "tech";
  return (
    <ol className="space-y-3">
      {msgs.map((m) => {
        const sender = staffById(sim, m.senderId);
        const mine = viewerId ? m.senderId === viewerId : sender?.kind === "tech";
        const fromLab = sender?.kind === "tech";
        return (
          <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[92%] rounded-lg border px-3 py-2 text-sm shadow-sm",
                m.kind === "ack" ? "border-green-300 bg-ok-bg" : mine ? "border-blue-200 bg-blue-50" : "border-line bg-white",
              )}
            >
              <div className="mb-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                <b className="text-ink">{fromLab ? `Lab · ${sender?.name}` : displayName(sender)}</b>
                <span>→ {displayName(staffById(sim, m.recipientId))}</span>
                {m.kind === "escalation" && <Badge tone="warn">Escalation</Badge>}
                {m.kind === "ack" && <Badge tone="ok">Acknowledged</Badge>}
                <span>{formatTime(m.sentAt)}</span>
              </div>
              {m.payload && <PayloadCard p={m.payload} compact />}
              <div className={cn("whitespace-pre-wrap", m.payload && "mt-2")}>{m.body}</div>
              {fromLab && isLabViewer && (
                <div className="mt-1 text-right text-[11px] text-muted">
                  <Receipt m={m} />
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
