"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MessageThread, PayloadCard } from "@/components/thread";
import { Badge, Button, Card, EmptyState, SlaPill, cn } from "@/components/ui";
import { useNow, useRepo, useSim } from "@/lib/data/store";
import { isRecipientAllowed } from "@/lib/domain/coverage";
import { criticalView, displayName, formatTime, fullName, staffById } from "@/lib/domain/selectors";
import { slaState } from "@/lib/domain/sla";
import { GRAM_STAIN_RESULTS } from "@/lib/domain/tests-catalog";
import type { SimState } from "@/lib/domain/types";

export default function InboxPage() {
  return (
    <Suspense>
      <Inbox />
    </Suspense>
  );
}

function Inbox() {
  const sim = useSim()!;
  const now = useNow();
  const repo = useRepo();
  const params = useSearchParams();

  // Apply ?as=<staffId>&c=<criticalId> deep links (from "Open recipient's view").
  const [selectedCritical, setSelectedCritical] = useState<string | null>(params.get("c"));
  useEffect(() => {
    const as = params.get("as");
    if (as && as !== sim.settings.currentInboxUserId) repo.dispatch({ type: "updateSettings", patch: { currentInboxUserId: as } });
  }, [params]);

  const policy = sim.settings.recipientPolicy;
  const recipients = sim.staff.filter((s) => isRecipientAllowed(s, policy));
  const unread = (id: string) => sim.messages.filter((m) => m.recipientId === id && !m.readAt && m.kind !== "ack").length;

  // Default persona: whoever most recently received a critical message.
  const lastRecipient = [...sim.messages].reverse().find((m) => m.kind === "critical" || m.kind === "escalation")?.recipientId;
  const meId = [sim.settings.currentInboxUserId, lastRecipient].find((id) => id && recipients.some((r) => r.id === id)) ?? recipients[0]?.id;
  const me = staffById(sim, meId);

  const threads = useMemo(() => {
    const ids = [...new Set(sim.messages.filter((m) => m.recipientId === meId || m.senderId === meId).map((m) => m.criticalId))];
    return ids
      .map((id) => sim.criticals.find((c) => c.id === id)!)
      .filter(Boolean)
      .sort((a, b) => (a.status === "acknowledged" ? 1 : 0) - (b.status === "acknowledged" ? 1 : 0) || b.createdAt - a.createdAt);
  }, [sim, meId]);

  const current = threads.find((t) => t.id === selectedCritical) ?? threads[0];

  // Opening a thread marks it read (drives the "Read" receipt on the lab side).
  useEffect(() => {
    if (current && meId) repo.dispatch({ type: "markRead", criticalId: current.id, userId: meId });
  }, [current?.id, meId, repo, current]);

  const grouped = {
    "Physicians & APPs": recipients.filter((r) => r.kind !== "nurse"),
    Nurses: recipients.filter((r) => r.kind === "nurse"),
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">Provider Inbox</h1>
        <span className="text-sm text-muted">Viewing as</span>
        <select
          value={meId}
          onChange={(e) => {
            repo.dispatch({ type: "updateSettings", patch: { currentInboxUserId: e.target.value } });
            setSelectedCritical(null);
          }}
          className="rounded-md border border-line bg-white px-2 py-1 text-sm"
        >
          {Object.entries(grouped).map(([label, list]) =>
            list.length ? (
              <optgroup key={label} label={label}>
                {list.map((r) => {
                  const n = unread(r.id);
                  return (
                    <option key={r.id} value={r.id}>
                      {fullName(r)} — {r.title}
                      {n ? `  (${n} new)` : ""}
                    </option>
                  );
                })}
              </optgroup>
            ) : null,
          )}
        </select>
        {policy === "physician_only" && <span className="text-xs text-muted">Nurses are hidden in physician-only mode.</span>}
      </div>

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-2">
          {threads.length === 0 && <EmptyState title="No messages">Critical values sent to {displayName(me)} appear here.</EmptyState>}
          {threads.map((c) => {
            const v = criticalView(sim, c, now);
            const sla = slaState(c, now);
            const isUnread = sim.messages.some((m) => m.criticalId === c.id && m.recipientId === meId && !m.readAt);
            return (
              <button
                key={c.id}
                onClick={() => setSelectedCritical(c.id)}
                className={cn(
                  "block w-full rounded-lg border bg-white p-3 text-left shadow-sm transition hover:border-brand",
                  current?.id === c.id ? "border-brand ring-2 ring-blue-200" : "border-line",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("text-sm", isUnread ? "font-black" : "font-semibold")}>
                    {isUnread && <span className="mr-1 inline-block h-2 w-2 rounded-full bg-crit" />}
                    {v.patient.lastName.toUpperCase()}, {v.patient.firstName}
                  </span>
                  <SlaPill level={sla.level} label={c.status === "acknowledged" ? "Done" : sla.label} />
                </div>
                <div className="mt-1 text-xs text-muted">
                  {v.unit.short}-{v.patient.bed} · <b className="text-crit">CRITICAL {v.test.name}</b>
                </div>
              </button>
            );
          })}
        </div>

        <div className="min-w-0">{current && meId && <ThreadPane key={current.id + meId} sim={sim} criticalId={current.id} meId={meId} now={now} />}</div>
      </div>
    </div>
  );
}

function ThreadPane({ sim, criticalId, meId, now }: { sim: SimState; criticalId: string; meId: string; now: number }) {
  const repo = useRepo();
  const c = sim.criticals.find((x) => x.id === criticalId)!;
  const v = criticalView(sim, c, now);
  const [readBack, setReadBack] = useState("");
  const [identity, setIdentity] = useState(false);
  const [ackNote, setAckNote] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const labSender = [...sim.messages].reverse().find((m) => m.criticalId === criticalId && staffById(sim, m.senderId)?.kind === "tech")?.senderId;
  const lastPayload = [...sim.messages].reverse().find((m) => m.criticalId === criticalId && m.payload)?.payload;

  const acknowledge = () => {
    const r = repo.dispatch({ type: "acknowledge", criticalId, userId: meId, readBack, identityConfirmed: identity, note: ackNote });
    setError(r.ok ? null : r.error);
  };
  const sendReply = () => {
    if (!labSender) return;
    const r = repo.dispatch({ type: "reply", criticalId, senderId: meId, recipientId: labSender, body: reply });
    if (r.ok) setReply("");
  };

  return (
    <div className="space-y-4">
      {c.status === "acknowledged" ? (
        <div className="rounded-lg border-2 border-green-400 bg-ok-bg p-4 text-sm">
          <b className="text-ok">✓ Acknowledged</b> by {fullName(staffById(sim, c.acknowledgedById))} at {formatTime(c.acknowledgedAt!)} with read-back
          &quot;{c.readBackValue}&quot;. The lab&apos;s notification record was completed automatically.
        </div>
      ) : (
        <Card title={<span className="text-crit">Acknowledge critical value — read-back required</span>}>
          {lastPayload && <PayloadCard p={lastPayload} />}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Read back the value</span>
              {v.test.kind === "culture" ? (
                <select value={readBack} onChange={(e) => setReadBack(e.target.value)} className="w-full rounded-md border border-line p-2">
                  <option value="">Select Gram stain result…</option>
                  {GRAM_STAIN_RESULTS.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    value={readBack}
                    onChange={(e) => setReadBack(e.target.value)}
                    inputMode="decimal"
                    placeholder={`${v.test.name} value`}
                    className="w-full rounded-md border border-line p-2"
                  />
                  <span className="text-muted">{v.test.units}</span>
                </div>
              )}
              <span className="mt-1 block text-xs text-muted">Type it yourself; it is checked against the result.</span>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Plan / note (optional)</span>
              <input value={ackNote} onChange={(e) => setAckNote(e.target.value)} placeholder="e.g., Ordering calcium gluconate, repeat BMP" className="w-full rounded-md border border-line p-2" />
            </label>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={identity} onChange={(e) => setIdentity(e.target.checked)} />
            I confirm patient identity: <b>{v.patient.lastName.toUpperCase()}, {v.patient.firstName}</b>, MRN <b>{v.patient.mrn}</b>
          </label>
          <div className="mt-3 flex items-center gap-3">
            <Button variant="primary" onClick={acknowledge}>
              Acknowledge &amp; read back
            </Button>
            {error && <span className="text-sm font-medium text-crit">{error}</span>}
          </div>
        </Card>
      )}

      <Card title="Conversation with the lab" actions={<Badge>{v.unit.short}-{v.patient.bed}</Badge>}>
        <MessageThread sim={sim} criticalId={criticalId} viewerId={meId} />
        <div className="mt-3 flex gap-2">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendReply()}
            placeholder="Reply to the lab (e.g., 'Was the sample hemolyzed?')"
            className="flex-1 rounded-md border border-line p-2 text-sm"
          />
          <Button onClick={sendReply} disabled={!reply.trim() || !labSender}>
            Send
          </Button>
        </div>
      </Card>
    </div>
  );
}
