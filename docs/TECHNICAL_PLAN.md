# Technical Plan — CritLink

Companion to [PRD.md](./PRD.md).

## 0. As built (v0.1): no database

Decisions confirmed for the first build:
- **No database yet.** State lives in the browser (localStorage) and syncs across tabs, so the
  two-window demo (lab tech + physician) works on Vercel with zero infrastructure.
- **SLA is always 30 minutes** from result verification (`SLA_MINUTES` in `src/lib/domain/constants.ts`).
- **Two recipient policies:** `physician_only` and `physician_and_nurse`, switchable in-app or pinned per
  deployment with `NEXT_PUBLIC_RECIPIENT_POLICY`.

### Layering

```
UI (src/app/*, src/components/*)
   │  useSim() / useNow() / repo.dispatch(command)
   ▼
CritLinkRepository  (src/lib/data/repository.ts)      ← the only persistence boundary
   │  today: LocalStorageRepository (browser)
   │  later: ApiRepository → POST /api/commands + realtime subscription
   ▼
Command engine  applyCommand(state, command, ctx)   (src/lib/domain/engine.ts)
   │  pure: no I/O, no globals, deterministic given ctx {now, rand, newId}
   ▼
Domain logic  coverage.ts · sla.ts · readback.ts · metrics.ts · selectors.ts   (unit-tested)
```

Every change is a typed `Command` (`generate`, `notify`, `markRead`, `reply`, `acknowledge`,
`logPhone`, `updateSettings`, `setRecipientPolicy`, `setClockSpeed`, `advanceClock`, `tick`).
Components never mutate state directly.

### Adding a database later

The domain types in `src/lib/domain/types.ts` are already flat, table-shaped records with id
foreign keys, matching the data model in §3 below. To add Postgres:

1. Create tables from `types.ts` (Drizzle schema). `SimState` arrays map to tables.
2. Add `src/app/api/commands/route.ts`. Load the needed rows, run the **same** `applyCommand`, and write
   the diff in a transaction. Add a Vercel Cron job (or check-on-read) that runs the `tick` command server-side.
3. Implement `ApiRepository` (the same `CritLinkRepository` interface). `dispatch` POSTs the command,
   and `subscribe` listens to Supabase Realtime / Pusher.
4. Swap the class in `src/lib/data/store.tsx`. No component changes are needed.
5. Move the simulator-only fields (`autoAckAt`, demo clock) behind a `DEMO_MODE` flag.

---

*The sections below are the original target plan. They still describe the database-backed version.*

## 1. Recommended stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | First-class on Vercel; API routes and UI in one repo |
| UI | **Tailwind CSS + shadcn/ui** | Fast, clean, clinical-looking UI; accessible primitives |
| Database | **Postgres (Supabase or Neon via Vercel Marketplace)** | Free tier; works from serverless functions |
| ORM | **Drizzle ORM** | Typed schema, simple migrations, edge-friendly |
| Realtime | **Supabase Realtime** (or Pusher/Ably) | Vercel functions can't hold long-lived WebSockets; a managed realtime service handles live message status |
| Auth (demo) | **Role switcher, no login** → later Supabase Auth / NextAuth | Lets a demo move fast |
| Validation | **Zod** | Shared schemas client and server |
| Testing | **Vitest** (logic) + **Playwright** (end-to-end core flow) | |
| Hosting | **Vercel** | Preview deploys per branch, simple env management |

> **Simplest-possible path:** if we want a demo before choosing a DB, Phase 1
> can run on an **in-memory store with seed data** (state resets on refresh)
> and swap in Postgres at Phase 3 behind the same repository interface.

## 2. Architecture

```
┌────────────────────────── Next.js app (Vercel) ──────────────────────────┐
│                                                                          │
│  UI (React Server + Client Components)                                   │
│   ├─ /lab/criticals        Lab tech worklist + notify panel              │
│   ├─ /provider/inbox       Covering physician inbox / threads            │
│   ├─ /schedule             On-call schedule                              │
│   ├─ /dashboard            Compliance metrics                            │
│   └─ /demo                 Simulator controls                            │
│                                                                          │
│  Server Actions / Route Handlers                                         │
│   ├─ simulator.generateCritical()                                        │
│   ├─ coverage.resolve(patientId, at)                                     │
│   ├─ messages.send / markRead / acknowledge(readBackValue)               │
│   ├─ escalation.check()  (on read + Vercel Cron every minute)            │
│   └─ metrics.summary()                                                   │
│                                                                          │
└───────────────┬────────────────────────────────────┬─────────────────────┘
                │ SQL (Drizzle)                      │ realtime events
                ▼                                    ▼
         Postgres (Supabase/Neon)             Supabase Realtime / Pusher
```

**Domain logic lives in `src/lib/domain/`** as pure TypeScript functions
(coverage resolution, SLA state, read-back check, escalation). These are
unit-tested and kept independent of the UI and DB.

## 3. Data model (initial)

```
patient(id, mrn, first_name, last_name, dob, sex, unit_id, bed, attending_id)
provider(id, name, credentials, role [MD|DO|NP|PA|RN], service, pager, is_active)
unit(id, name)                                  -- e.g., 5W Med-Surg, MICU
lab_test(id, code, name, units, ref_low, ref_high, crit_low, crit_high)
lab_order(id, patient_id, test_id, ordering_provider_id, ordered_at)
lab_result(id, order_id, value, flag [L|H|LL|HH|POS], collected_at,
           verified_at, verified_by_tech_id, is_critical)

coverage_shift(id, service, unit_id?, provider_id, role [primary|backup|attending],
               starts_at, ends_at)
patient_team(patient_id, service)               -- which service owns the patient

critical_event(id, result_id, status [open|notified|acknowledged|escalated|missed],
               sla_due_at, acknowledged_at, acknowledged_by_id,
               read_back_value, read_back_ok, minutes_to_ack)

message_thread(id, critical_event_id)
message(id, thread_id, sender_id, recipient_id, body, structured_payload jsonb,
        sent_at, delivered_at, read_at, kind [critical|reply|escalation|system])

notification_log(id, critical_event_id, method [in_app|phone],
                 notified_provider_id, by_tech_id, at, read_back_ok, notes)

audit_event(id, entity, entity_id, action, actor_id, at, data jsonb)  -- append-only
incident_draft(id, critical_event_id, created_at, timeline jsonb, status)
```

### Coverage resolution (core algorithm)
```
resolveCoverage(patient, at):
  service = patient_team[patient].service
  primary = coverage_shift where service matches AND role=primary
            AND starts_at <= at < ends_at
  chain   = [primary, backup, attending] (ordered, de-duplicated)
  return { ordering: order.ordering_provider, covering: primary, chain,
           differs: ordering.id != primary.id }
```

### SLA / escalation states
```
remaining = sla_due_at - now
state = acknowledged ? DONE
      : remaining <= 0 ? OVERDUE (→ status=missed, create incident_draft)
      : remaining < 5m ? RED
      : remaining < 15m ? AMBER : GREEN
escalate when: no ack AND (now - last_message.sent_at) >= escalation_after (10m)
```

## 4. Simulator design
- **Seed:** ~40 synthetic patients across 5 units, ~15 providers, 3 services
  (Hospitalist, ICU, Surgery), and a 24-hour on-call schedule with day/night
  handoffs, so the *ordering ≠ covering* case happens often.
- **Generator:** pick a random patient with an open order, pick a test from the
  critical-limits table, then draw a value beyond the critical limit (with
  plausible clinical noise). Create the result + critical_event with
  `sla_due_at = verified_at + 30m`.
- **Modes:** single, burst (e.g., 8 at once for a "busy night"), stream (every *n* s).
- **Demo clock:** an optional time multiplier (1×, 5×, 10×) so the 30-minute countdown and escalation can be shown in a short demo.
- **Auto-responder (optional):** simulated physicians acknowledge after a random delay, and some never answer, to show escalation.

## 5. Phased delivery

### Phase 0 — Scaffold (½ day)
- `create-next-app` with TS, Tailwind, ESLint; add shadcn/ui, Drizzle, Zod, Vitest.
- App shell: top nav, role switcher, **SIMULATED DATA** banner.
- GitHub → Vercel project connected; preview deploys on every push.

### Phase 1 — Simulated EHR + critical values (1–2 days)
- Schema + seed script (patients, providers, tests, schedule).
- Critical values worklist with live countdown + flags.
- Result detail drawer with history.
- Demo control panel (generate single/burst/stream, reset).
- **Milestone:** a presenter can generate criticals and watch the timers run.

### Phase 2 — Coverage resolution (1 day)
- On-call schedule page (view/edit).
- `resolveCoverage()` + unit tests; coverage card in the result drawer with
  "Ordering ≠ Covering" callout.
- **Milestone:** each critical shows who to call right now.

### Phase 3 — In-context messaging (2–3 days), the headline feature
- Notify panel: pre-filled, locked-field structured message + optional note.
- Provider inbox and thread view; status ticks (sent / delivered / read / acknowledged).
- Acknowledge with read-back verification; auto-write `notification_log` + audit.
- Realtime updates across two browser windows (tech ↔ physician).
- Manual phone-notification fallback.
- **Milestone:** end-to-end demo across two windows in under 2 minutes.

### Phase 4 — Escalation, dashboard, incident drafts (1–2 days)
- Escalation prompts and chain; Vercel Cron job (`/api/cron/escalations`) plus check-on-read.
- Compliance dashboard (charts: % within SLA, time-to-ack distribution, by unit/test).
- Draft incident report on missed SLA; CSV export.

### Phase 5 — Polish and Vercel production demo (½–1 day)
- Playwright end-to-end test of the core flow.
- Demo script + "reset demo" button; seeded "before vs after" metrics.
- Production deploy, custom domain (optional), README with screenshots.

## 6. Vercel deployment checklist
1. Push the repo to GitHub and **Import Project** in Vercel (framework auto-detected).
2. Add **Supabase** or **Neon** from the Vercel Marketplace; the env vars (`DATABASE_URL`, etc.) are injected automatically.
3. Add realtime keys (Supabase anon key / Pusher keys) as env vars.
4. Run migrations + seed (`npm run db:migrate && npm run db:seed`) via a one-off script or a protected `/api/admin/seed` route.
5. Configure `vercel.json` crons for escalation checks (Hobby plan: daily only; for per-minute use check-on-read or a Pro plan).
6. Optional: protect the demo with Vercel Password Protection or a simple shared passcode.

## 7. Proposed repo layout
```
src/
  app/
    (lab)/lab/criticals/        page.tsx, notify-panel.tsx
    (provider)/provider/inbox/  page.tsx, thread/[id]/page.tsx
    schedule/  dashboard/  demo/
    api/cron/escalations/route.ts
  components/                   ui/ (shadcn), countdown, flag-badge, coverage-card
  lib/
    domain/                     coverage.ts, sla.ts, readback.ts, escalation.ts (+ tests)
    db/                         schema.ts, client.ts, seed.ts
    realtime/                   client.ts
    simulator/                  generate.ts, limits.ts, names.ts
docs/                           PRD.md, TECHNICAL_PLAN.md
```
