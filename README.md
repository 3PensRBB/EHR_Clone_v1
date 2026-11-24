# CritLink — Simulated EHR for Critical Value Notification

> ⚠️ **Simulated data only. Not for clinical use.**

A demo EHR-style app where a clinical lab technician can see simulated
**critical lab values**, find the **currently covering physician** (often not the
ordering physician), and **message them in context**, with read-back
acknowledgment and automatic documentation. The tech never leaves the EHR for a
separate messaging app, and the 30-minute notification window is tracked.

- 📄 [Product Requirements (PRD)](docs/PRD.md)
- 🛠 [Technical Plan & Phases](docs/TECHNICAL_PLAN.md)

Planned stack: Next.js + TypeScript + Tailwind/shadcn + Postgres (Supabase/Neon) + Drizzle, deployed on Vercel.
