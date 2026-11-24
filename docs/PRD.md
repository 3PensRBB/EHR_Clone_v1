# PRD — CritLink: Critical Value Notification in a Simulated EHR

| | |
|---|---|
| **Status** | Draft v0.1 |
| **Last updated** | 2026-11-24 |
| **Type** | Demo / prototype (simulated data only, not for clinical use) |
| **Deploy target** | Vercel |

---

## 1. Problem

When a clinical lab produces a **critical value** (e.g., K⁺ 6.8 mmol/L), the lab
technician (MLS/MLT) must reach a responsible licensed caregiver, get a
**read-back**, and document the notification, usually **within 30 minutes**
of result verification. Regulatory drivers: The Joint Commission NPSG.02.03.01,
CAP checklist items on critical result notification, and CLIA.

Today the workflow is fragmented:

1. The tech sees the critical value in the **LIS/EHR**.
2. The tech works out **who is covering**. That is often *not* the ordering
   physician (night float, cross-cover, hospitalist handoff, residents).
   Coverage lives in a different place: paging directory, on-call
   spreadsheet, or the operator.
3. The tech opens a **separate application** (such as TigerConnect) in a separate
   browser or device, re-types the patient identifiers and the value, and sends
   a message.
4. The tech waits, follows up, escalates, and then goes **back to the EHR** to
   hand-document who was notified, when, and whether read-back happened.

Each context switch adds delay and the chance of error: the wrong patient, the
wrong physician, a value re-typed incorrectly, or a missing read-back. When the 30-minute window is
missed, an **incident report** is required.

## 2. Vision

> A lab tech can go from *"critical value flagged"* to *"covering physician
> notified, read-back confirmed, documented"* in one screen and a few clicks,
> without leaving the EHR.

## 3. Goals and non-goals

### Goals (demo)
- **G1.** Simulate a realistic lab-side EHR view with a live stream of synthetic critical values.
- **G2.** Show the **ordering provider and the current covering provider** side by side, resolved automatically from an on-call schedule.
- **G3.** Let the tech **message the covering provider in context**. The patient, MRN, test, value, units, reference range, and collection time are pre-filled from the result, with no re-typing.
- **G4.** Close the loop: the provider **acknowledges and reads back** in the app, and the notification record is **auto-documented**.
- **G5.** Show a visible **30-minute countdown** per critical value, with **escalation** when time runs short.
- **G6.** Provide a **compliance dashboard**: % notified within 30 minutes, median time-to-notify, escalations, and misses.
- **G7.** Deploy publicly on Vercel for demos.

### Non-goals (for now)
- Real PHI, real patients, or HIPAA-grade hosting. **Synthetic data only.**
- Real integration with an LIS, Epic or Cerner, HL7 v2, or TigerConnect. These are noted as future work in §10.
- Order entry, full chart, medication administration, or billing.
- Mobile-native apps.

## 4. Personas

| Persona | Description | Primary need |
|---|---|---|
| **Lab Tech (primary)** | MLS/MLT on bench or night shift; handles many results at once | Find the right person fast, notify once, document automatically |
| **Covering Physician** | Hospitalist, resident, or night float covering many patients they didn't order for | Clear, unambiguous critical message; acknowledge in one tap |
| **Lab Supervisor / QA** | Owns critical-value compliance and incident reports | See turnaround metrics, misses, and the audit trail |

In the demo, a **role switcher** lets one presenter act as each persona.

## 5. User stories

### Epic A: Simulated EHR and critical value feed
- **A1.** As a lab tech, I see a **Critical Values worklist** sorted by time remaining, so I work the most urgent first.
- **A2.** As a lab tech, each row shows patient name, MRN, location (unit/bed), test, value with an **H/L/HH/LL flag**, reference range, verified time, and a **countdown**.
- **A3.** As a demo presenter, I can **generate critical values** on demand (single button, a "busy night" burst, or a steady stream every *n* seconds).
- **A4.** As a lab tech, I can open a **patient result detail** with the recent result history (delta check) for context.

### Epic B: Coverage resolution
- **B1.** As a lab tech, I see the **Ordering Provider** and the **Currently Covering Provider** for that patient at the current time.
- **B2.** If they differ, the UI makes that obvious, for example: *"Dr. Patel ordered; Dr. Nguyen is covering (night float until 07:00)."*
- **B3.** Coverage is resolved from an **on-call schedule**: service/team, shift start and end, primary, backup, and escalation chain.
- **B4.** As a supervisor, I can edit the demo on-call schedule.

### Epic C: In-context secure messaging (the core feature)
- **C1.** From a critical value row, I click **"Notify Covering"**. A side panel opens with a **pre-filled, structured message**:
  > **CRITICAL VALUE** — JOHNSON, MARY (MRN 00412345), 5W-12
  > Potassium **6.8 mmol/L (HH)**, ref 3.5–5.1, collected 02:14, verified 02:31.
  > Please acknowledge and read back. — Lab, J. Rivera MLS, x4412
- **C2.** I can add a free-text note but **cannot edit the result fields**, so transcription errors are impossible.
- **C3.** Message status is visible: **Sent → Delivered → Read → Acknowledged (read-back)**.
- **C4.** As the covering physician, I receive the message in a **Provider Inbox** view. I tap **Acknowledge** and confirm read-back by re-entering or selecting the value. A mismatch blocks acknowledgment.
- **C5.** The conversation is a **thread tied to that critical result**, so follow-up questions stay attached.
- **C6.** On acknowledgment, the system **auto-writes the notification record**: who notified whom, method, timestamps, read-back confirmed, and minutes elapsed.
- **C7.** Fallback: I can log a **phone notification manually** (provider name, time, read-back checkbox) when messaging isn't used.

### Epic D: Timers and escalation
- **D1.** Each critical value has a countdown from **verification time** (30-minute SLA, configurable).
- **D2.** Visual states: green (>15 min), amber (5–15), red (<5), black/"OVERDUE".
- **D3.** If no acknowledgment comes within **X minutes** (default 10), the system **prompts escalation** to the next person in the chain (backup → attending → charge RN / rapid response). Each escalation is logged.
- **D4.** A missed SLA automatically creates a **draft incident report** pre-filled with the timeline.

### Epic E: Compliance and audit
- **E1.** Dashboard: total criticals, % within SLA, median and p90 time-to-acknowledge, escalations, misses, and breakdown by test, unit, and shift.
- **E2.** Full **audit trail** per critical value (every view, message, status change, and escalation).
- **E3.** Export the notification log as CSV.

## 6. Functional requirements (MVP cut)

| ID | Requirement | Priority |
|---|---|---|
| FR-1 | Seeded synthetic patients, providers, units, and on-call schedule | P0 |
| FR-2 | Critical value generator using a configurable critical-limits table | P0 |
| FR-3 | Critical values worklist with live countdown | P0 |
| FR-4 | Ordering vs covering provider resolution | P0 |
| FR-5 | Pre-filled, locked-field message composer from the result | P0 |
| FR-6 | Provider inbox with acknowledge and read-back verification | P0 |
| FR-7 | Auto-documented notification record | P0 |
| FR-8 | Real-time status updates (sent, read, acknowledged) | P0 |
| FR-9 | Escalation prompts and chain | P1 |
| FR-10 | Compliance dashboard | P1 |
| FR-11 | Draft incident report on miss | P1 |
| FR-12 | Manual phone-notification logging | P1 |
| FR-13 | Role switcher (Tech / Physician / Supervisor) and demo controls | P0 |
| FR-14 | Persistent "SIMULATED DATA — NOT FOR CLINICAL USE" banner | P0 |

### Illustrative critical limits (seed data; every institution sets its own)

| Test | Low critical | High critical | Units |
|---|---|---|---|
| Potassium | < 2.8 | > 6.2 | mmol/L |
| Sodium | < 120 | > 160 | mmol/L |
| Glucose | < 40 | > 450 | mg/dL |
| Calcium (total) | < 6.0 | > 13.0 | mg/dL |
| Hemoglobin | < 7.0 | > 20.0 | g/dL |
| Platelets | < 20 | > 1000 | ×10³/µL |
| WBC | < 2.0 | > 50.0 | ×10³/µL |
| INR | — | > 5.0 | — |
| Lactate | — | > 4.0 | mmol/L |
| Troponin I (hs) | — | > institution cutoff | ng/L |
| Blood culture | Positive (Gram stain result) | | — |

## 7. Non-functional requirements
- **Responsiveness:** a status change is visible to the other party within 2 s.
- **Usability:** the core flow (open critical, notify, see ack) takes ≤ 3 clicks for the tech.
- **Accessibility:** WCAG AA contrast; the color-coded timers also have text labels.
- **Safety framing:** no real PHI. A banner sits on every screen. Seeded names are clearly fictional.
- **Auditability:** every state change is an append-only event with actor and timestamp.

## 8. Success metrics (demo narrative)
- Time-to-notify in the demo: **< 2 minutes** vs. the typical multi-app workflow.
- Zero manual re-entry of result values.
- 100% of acknowledged notifications have read-back documented automatically.
- Dashboard shows a simulated "before" (fragmented) vs "after" (CritLink) comparison.

## 9. Key UX screens
1. **Lab Critical Values Worklist** (home for the tech)
2. **Critical Result Detail + Notify Panel** (slide-over with coverage card and composer)
3. **Provider Inbox / Thread** (physician view, acknowledge with read-back)
4. **On-Call Schedule** (who covers what, when)
5. **Compliance Dashboard** (supervisor)
6. **Demo Control Panel** (generate criticals, change clock speed, reset data)

## 10. Future / real-world path
- **Standards:** model on FHIR R4, using `Observation` (with `interpretation` HH/LL),
  `DiagnosticReport`, `Communication` / `CommunicationRequest`, `PractitionerRole`,
  `CareTeam`, `Schedule`/`Slot`. Ingest results over HL7 v2 ORU^R01.
- **Messaging integrations:** TigerConnect, Epic Secure Chat, Vocera, pager gateways.
  Use the real vendor APIs instead of a parallel system, keeping the in-context launch.
- **Coverage source of truth:** integrate with an on-call scheduling system (e.g., Amion, QGenda).
- **Compliance:** HIPAA hosting with a BAA, SSO, and role-based access.

## 11. Risks and open questions
- **"Message sent" ≠ "notified."** Regulation requires a read-back by a responsible caregiver. The design treats only **acknowledged + read-back** as complete.
- **Coverage data accuracy.** If the schedule is wrong, the right person is never reached. Escalation is the safety net.
- **Alert fatigue** for physicians. Use clear structured messages and one thread per critical value.
- **Resolved (v0.1):** The SLA is always 30 minutes. Nurses can be recipients in a separate "Physician + RN" version; the "Physician-only" version blocks them. Escalation is prompted after 10 minutes without acknowledgment. There is no database for now, and the architecture is ready for one (see TECHNICAL_PLAN §0).
