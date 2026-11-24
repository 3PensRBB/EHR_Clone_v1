# CritLink: Simulated EHR for Critical Value Notification

**🔗 Live demo: [ehrclonev1-gonn.vercel.app](https://ehrclonev1-gonn.vercel.app)**

> ⚠️ **Simulated data only. Not for clinical use.** All patients and staff are fictional.

A demo EHR-style app. A clinical lab tech sees simulated **critical lab values** and
gets the **covering physician right now** resolved automatically (often not the
ordering physician). The tech **messages them inside the EHR**, so there's no separate
TigerConnect window. The recipient must **read back** the value to acknowledge,
the notification is **documented automatically**, and a live **30-minute clock**
drives escalation prompts and incident-report drafts.

- 📄 [Product Requirements (PRD)](docs/PRD.md)
- 🛠 [Technical Plan & Architecture](docs/TECHNICAL_PLAN.md)

## Screens

| Route | Who | What |
|---|---|---|
| `/` | Presenter | Pick the demo version, then follow the two-window demo script |
| `/lab` | Lab tech | Critical values worklist, 30-min timers, coverage, pre-filled secure message, escalation, phone fallback, audit trail |
| `/inbox` | Physician / RN | Inbox and threads; acknowledge with **read-back verification** and identity confirmation |
| `/schedule` | Everyone | On-call schedule that coverage is resolved from (physicians by service, nurses by unit) |
| `/dashboard` | Supervisor / QA | % within 30 min, time-to-ack distribution, by test/unit, incident drafts, CSV export |
| `/demo` | Presenter | Version switch, generate criticals (single, burst, stream), clock speed, simulated responders, reset |

## Two demo versions

| Version | Who can receive critical value messages |
|---|---|
| **Physician-only** (`physician_only`) | Covering physician/APP → backup → attending |
| **Physician + RN** (`physician_and_nurse`) | Same chain, plus the patient's primary RN and the unit charge RN |

Switch versions in the app (home page or Demo Controls), **or** pin a deployment to one version with
the environment variable `NEXT_PUBLIC_RECIPIENT_POLICY` (see below).

## Run locally

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000. To do the two-window demo, open `/lab` and `/inbox` side by side. They sync
through the browser's localStorage. In Demo Controls, turn off *simulated responders* so you can play the physician yourself.

```bash
npm test
```

```bash
npm run build
```

## Deploy to Vercel

The live demo is deployed at **https://ehrclonev1-gonn.vercel.app**.


1. In Vercel, **Add New → Project → Import** `3PensRBB/EHR_Clone_v1`. The framework is auto-detected as Next.js, and no build settings need changing.
2. No database or secrets are needed. State lives in each viewer's browser.
3. Optional: for **two separate demo URLs**, import the repo twice as two Vercel projects and set:
   - Project `critlink-physician`: `NEXT_PUBLIC_RECIPIENT_POLICY=physician_only`
   - Project `critlink-rn`: `NEXT_PUBLIC_RECIPIENT_POLICY=physician_and_nurse`

   Leave the variable unset on a project to allow switching in-app.

## Tech

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Vitest. No database yet. All
state changes go through a pure command engine behind a repository interface, so a database can be
added without touching the UI. See [docs/TECHNICAL_PLAN.md](docs/TECHNICAL_PLAN.md#adding-a-database-later).
