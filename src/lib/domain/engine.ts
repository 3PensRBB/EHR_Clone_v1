/**
 * The command engine: every state change in CritLink is a `Command` applied by
 * `applyCommand(state, command, ctx)`. It is a pure function — no I/O, no
 * globals — so the same code can run:
 *   • in the browser today (LocalStorageRepository), or
 *   • on the server later, inside a DB transaction (see docs/TECHNICAL_PLAN.md).
 */
import { DELIVERY_DELAY_MS, MINUTE, SLA_MINUTES } from "./constants";
import { isRecipientAllowed } from "./coverage";
import { checkReadBack } from "./readback";
import { buildPayload, criticalView, displayName, formatTime, staffById } from "./selectors";
import { minutesToAck } from "./sla";
import { getTest } from "./tests-catalog";
import type { AuditEvent, CriticalEvent, Id, Message, Millis, RecipientPolicy, Settings, SimState } from "./types";
import { generateCritical } from "../simulator/generate";
import type { Rand } from "../simulator/random";

export type Command =
  | { type: "generate"; count: number }
  | { type: "notify"; criticalId: Id; recipientId: Id; techId: Id; note?: string }
  | { type: "markRead"; criticalId: Id; userId: Id }
  | { type: "reply"; criticalId: Id; senderId: Id; recipientId: Id; body: string }
  | { type: "acknowledge"; criticalId: Id; userId: Id; readBack: string; identityConfirmed: boolean; note?: string }
  | { type: "logPhone"; criticalId: Id; techId: Id; notifiedId: Id; readBackOk: boolean; notes?: string }
  | { type: "updateSettings"; patch: Partial<Settings> }
  | { type: "setRecipientPolicy"; policy: RecipientPolicy }
  | { type: "setClockSpeed"; speed: number; realNow: Millis }
  | { type: "advanceClock"; minutes: number }
  | { type: "tick" };

export interface EngineCtx {
  /** Current simulated time. */
  now: Millis;
  rand: Rand;
  newId: (prefix: string) => string;
}

export type CommandResult = { ok: true; state: SimState } | { ok: false; state: SimState; error: string };

const ok = (state: SimState): CommandResult => ({ ok: true, state });
const fail = (state: SimState, error: string): CommandResult => ({ ok: false, state, error });

function audit(ctx: EngineCtx, actorId: Id | "system", action: string, criticalId?: Id, detail?: string): AuditEvent {
  return { id: ctx.newId("aud"), at: ctx.now, actorId, action, criticalId, detail };
}

function patchCritical(state: SimState, id: Id, patch: Partial<CriticalEvent>): SimState {
  return { ...state, criticals: state.criticals.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
}

export function applyCommand(state: SimState, cmd: Command, ctx: EngineCtx): CommandResult {
  switch (cmd.type) {
    case "generate": {
      let s = state;
      for (let i = 0; i < cmd.count; i++) {
        const { results, critical } = generateCritical(s, ctx);
        const r = results[results.length - 1];
        s = {
          ...s,
          results: [...s.results, ...results],
          criticals: [...s.criticals, critical],
          audit: [
            ...s.audit,
            audit(ctx, r.verifiedByTechId, "Critical result verified", critical.id, `${getTest(r.testCode).name} — 30-min window started`),
          ],
        };
      }
      return ok(s);
    }

    case "notify": {
      const c = state.criticals.find((x) => x.id === cmd.criticalId);
      if (!c) return fail(state, "Critical value not found");
      if (c.status === "acknowledged") return fail(state, "Already acknowledged");
      const recipient = staffById(state, cmd.recipientId);
      if (!recipient) return fail(state, "Recipient not found");
      if (!isRecipientAllowed(recipient, state.settings.recipientPolicy))
        return fail(state, "Recipient not allowed under the current notification policy");

      const view = criticalView(state, c, ctx.now);
      const level = view.coverage.chain.findIndex((e) => e.staff.id === recipient.id);
      const isEscalation = c.status === "notified" && c.lastNotifiedId !== recipient.id;
      const payload = buildPayload(view);
      const tech = staffById(state, cmd.techId);

      let autoAckAt: Millis | null | undefined;
      if (state.settings.autoRespond) {
        // ~25% never answer (to demo escalation); others answer in 1.5–13 min.
        autoAckAt = ctx.rand() < 0.25 ? null : ctx.now + Math.round((1.5 + ctx.rand() * 11.5) * MINUTE);
      }

      const msg: Message = {
        id: ctx.newId("msg"),
        criticalId: c.id,
        senderId: cmd.techId,
        recipientId: recipient.id,
        kind: isEscalation ? "escalation" : "critical",
        body:
          (isEscalation ? `ESCALATION — no acknowledgment from ${displayName(staffById(state, c.lastNotifiedId))}. ` : "") +
          `Please acknowledge and read back. — Lab, ${tech ? `${tech.name} ${tech.credentials}, ${tech.phone}` : "Clinical Lab"}` +
          (cmd.note?.trim() ? `\nNote: ${cmd.note.trim()}` : ""),
        payload,
        sentAt: ctx.now,
        autoAckAt,
      };

      let s = patchCritical(state, c.id, {
        status: "notified",
        lastNotifiedAt: ctx.now,
        lastNotifiedId: recipient.id,
        escalationLevel: Math.max(c.escalationLevel, level),
      });
      s = {
        ...s,
        messages: [...s.messages, msg],
        audit: [
          ...s.audit,
          audit(ctx, cmd.techId, isEscalation ? "Escalated via secure message" : "Secure message sent", c.id, `To ${displayName(recipient)} (${view.coverage.chain[level]?.role ?? recipient.title})`),
        ],
      };
      return ok(s);
    }

    case "markRead": {
      let changed = false;
      const messages = state.messages.map((m) => {
        if (m.criticalId === cmd.criticalId && m.recipientId === cmd.userId && m.readAt == null) {
          changed = true;
          return { ...m, deliveredAt: m.deliveredAt ?? ctx.now, readAt: ctx.now };
        }
        return m;
      });
      if (!changed) return ok(state);
      return ok({ ...state, messages, audit: [...state.audit, audit(ctx, cmd.userId, "Message read", cmd.criticalId)] });
    }

    case "reply": {
      if (!cmd.body.trim()) return fail(state, "Empty message");
      const msg: Message = {
        id: ctx.newId("msg"),
        criticalId: cmd.criticalId,
        senderId: cmd.senderId,
        recipientId: cmd.recipientId,
        kind: "reply",
        body: cmd.body.trim(),
        sentAt: ctx.now,
      };
      return ok({ ...state, messages: [...state.messages, msg] });
    }

    case "acknowledge": {
      const c = state.criticals.find((x) => x.id === cmd.criticalId);
      if (!c) return fail(state, "Critical value not found");
      if (c.status === "acknowledged") return fail(state, "Already acknowledged");
      const user = staffById(state, cmd.userId);
      if (!user || !isRecipientAllowed(user, state.settings.recipientPolicy))
        return fail(state, "You are not an allowed recipient under the current policy");
      if (!cmd.identityConfirmed) return fail(state, "Confirm patient identity (name + MRN) first");
      const result = state.results.find((r) => r.id === c.resultId)!;
      const test = getTest(result.testCode);
      if (!checkReadBack(test, result, cmd.readBack))
        return fail(state, "Read-back does not match the reported value. Please re-check and read back again.");

      return ok(recordAcknowledgment(state, ctx, c, cmd.userId, "in_app", cmd.readBack, cmd.note));
    }

    case "logPhone": {
      const c = state.criticals.find((x) => x.id === cmd.criticalId);
      if (!c) return fail(state, "Critical value not found");
      if (c.status === "acknowledged") return fail(state, "Already acknowledged");
      const notified = staffById(state, cmd.notifiedId);
      if (!notified || !isRecipientAllowed(notified, state.settings.recipientPolicy))
        return fail(state, "Recipient not allowed under the current notification policy");
      if (!cmd.readBackOk) return fail(state, "Read-back must be completed before the notification can be documented");
      const result = state.results.find((r) => r.id === c.resultId)!;
      const test = getTest(result.testCode);
      const rb = test.kind === "culture" ? result.textValue ?? "" : result.value?.toFixed(test.decimals) ?? "";
      return ok(recordAcknowledgment(state, ctx, c, cmd.notifiedId, "phone", rb, cmd.notes, cmd.techId));
    }

    case "updateSettings":
      return ok({ ...state, settings: { ...state.settings, ...cmd.patch } });

    case "setRecipientPolicy":
      return ok({
        ...state,
        settings: { ...state.settings, recipientPolicy: cmd.policy, currentInboxUserId: undefined },
        audit: [...state.audit, audit(ctx, "system", "Notification policy changed", undefined, cmd.policy)],
      });

    case "setClockSpeed":
      return ok({ ...state, clock: { anchorReal: cmd.realNow, anchorSim: ctx.now, speed: cmd.speed } });

    case "advanceClock":
      return ok({ ...state, clock: { ...state.clock, anchorSim: state.clock.anchorSim + cmd.minutes * MINUTE } });

    case "tick":
      return ok(tick(state, ctx));
  }
}

function recordAcknowledgment(
  state: SimState,
  ctx: EngineCtx,
  c: CriticalEvent,
  userId: Id,
  method: "in_app" | "phone",
  readBack: string,
  note?: string,
  techIdOverride?: Id,
): SimState {
  const techId =
    techIdOverride ??
    [...state.messages].reverse().find((m) => m.criticalId === c.id && (m.kind === "critical" || m.kind === "escalation"))?.senderId ??
    state.settings.currentTechId;
  const acked: CriticalEvent = {
    ...c,
    status: "acknowledged",
    acknowledgedAt: ctx.now,
    acknowledgedById: userId,
    ackMethod: method,
    readBackValue: readBack,
  };
  const mins = minutesToAck(acked) ?? 0;
  const withinSla = mins <= SLA_MINUTES;
  const user = staffById(state, userId);
  let s = patchCritical(state, c.id, acked);

  const messages = s.messages.map((m) =>
    m.criticalId === c.id && m.recipientId === userId && m.readAt == null
      ? { ...m, deliveredAt: m.deliveredAt ?? ctx.now, readAt: ctx.now }
      : m,
  );
  if (method === "in_app") {
    messages.push({
      id: ctx.newId("msg"),
      criticalId: c.id,
      senderId: userId,
      recipientId: techId,
      kind: "ack",
      body: `ACKNOWLEDGED with read-back: "${readBack}".${note?.trim() ? ` ${note.trim()}` : ""}`,
      sentAt: ctx.now,
      deliveredAt: ctx.now,
    });
  }

  s = {
    ...s,
    messages,
    notificationLog: [
      ...s.notificationLog,
      {
        id: ctx.newId("log"),
        criticalId: c.id,
        method,
        notifiedId: userId,
        byTechId: techId,
        at: ctx.now,
        readBackOk: true,
        minutesFromVerify: mins,
        withinSla,
        notes: note?.trim() || undefined,
      },
    ],
    audit: [
      ...s.audit,
      audit(
        ctx,
        userId,
        method === "phone" ? "Phone notification documented" : "Acknowledged with read-back",
        c.id,
        `${displayName(user)} read back "${readBack}" at ${formatTime(ctx.now)} — ${mins} min from verification${withinSla ? "" : " (OUTSIDE 30-min window)"}`,
      ),
    ],
  };
  return s;
}

/** Advance time-based simulation: delivery receipts, auto-responders, SLA breaches, streaming. */
function tick(state: SimState, ctx: EngineCtx): SimState {
  let s = state;
  const now = ctx.now;

  // 1) delivery receipts + simulated "read"
  let msgChanged = false;
  const messages = s.messages.map((m) => {
    let next = m;
    if (m.deliveredAt == null && now >= m.sentAt + DELIVERY_DELAY_MS) next = { ...next, deliveredAt: m.sentAt + DELIVERY_DELAY_MS };
    if (m.readAt == null && m.autoAckAt != null && now >= m.sentAt + (m.autoAckAt - m.sentAt) / 2)
      next = { ...next, readAt: m.sentAt + Math.round((m.autoAckAt - m.sentAt) / 2) };
    if (next !== m) msgChanged = true;
    return next;
  });
  if (msgChanged) s = { ...s, messages };

  // 2) auto-responders acknowledge
  for (const m of s.messages) {
    if (m.autoAckAt == null || now < m.autoAckAt) continue;
    const c = s.criticals.find((x) => x.id === m.criticalId);
    if (!c || c.status === "acknowledged") continue;
    const recipient = staffById(s, m.recipientId);
    if (!recipient || !isRecipientAllowed(recipient, s.settings.recipientPolicy)) continue;
    const result = s.results.find((r) => r.id === c.resultId)!;
    const test = getTest(result.testCode);
    const rb = test.kind === "culture" ? result.textValue ?? "" : result.value?.toFixed(test.decimals) ?? "";
    s = recordAcknowledgment(s, { ...ctx, now: m.autoAckAt }, c, m.recipientId, "in_app", rb, "(simulated responder)");
  }

  // 3) SLA breaches → incident draft
  for (const c of s.criticals) {
    if (c.status === "acknowledged" || c.breachedAt != null || now < c.slaDueAt) continue;
    const view = criticalView(s, c, c.slaDueAt);
    const timeline = s.audit
      .filter((a) => a.criticalId === c.id)
      .map((a) => ({ at: a.at, text: `${a.action}${a.detail ? ` — ${a.detail}` : ""}` }));
    timeline.push({ at: c.slaDueAt, text: "30-minute notification window elapsed without acknowledgment" });
    s = patchCritical(s, c.id, { breachedAt: c.slaDueAt });
    s = {
      ...s,
      incidents: [
        ...s.incidents,
        {
          id: `inc-${c.id}`,
          criticalId: c.id,
          createdAt: c.slaDueAt,
          status: "draft",
          summary: `Critical ${view.test.name} (${buildPayload(view).value} ${view.test.units}) for ${view.patient.lastName.toUpperCase()}, MRN ${view.patient.mrn} was not acknowledged within 30 minutes of verification.`,
          timeline,
        },
      ],
      audit: [...s.audit, audit({ ...ctx, now: c.slaDueAt }, "system", "30-min window missed — incident draft created", c.id)],
    };
  }

  // 4) streaming generator
  const every = s.settings.streamEverySimSec;
  if (every && every > 0) {
    if (s.settings.streamNextAt == null) {
      s = { ...s, settings: { ...s.settings, streamNextAt: now + every * 1000 } };
    } else if (now >= s.settings.streamNextAt) {
      s = applyCommand(s, { type: "generate", count: 1 }, ctx).state;
      s = { ...s, settings: { ...s.settings, streamNextAt: now + every * 1000 } };
    }
  }

  return s;
}
