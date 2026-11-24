"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui";
import { LOCKED_POLICY, useRepo, useSim } from "@/lib/data/store";
import type { RecipientPolicy } from "@/lib/domain/types";

const VERSIONS: { id: RecipientPolicy; title: string; blurb: string; tone: string }[] = [
  {
    id: "physician_only",
    title: "Physician-only",
    blurb: "Critical values route to the covering physician/APP, then backup, then attending. Nurses never receive them.",
    tone: "border-sky-300 hover:bg-sky-50",
  },
  {
    id: "physician_and_nurse",
    title: "Physician + RN",
    blurb: "Same chain, plus the patient's primary RN and unit charge RN can receive, read back and acknowledge.",
    tone: "border-violet-300 hover:bg-violet-50",
  },
];

export default function Home() {
  const sim = useSim()!;
  const repo = useRepo();
  const router = useRouter();

  const launch = (policy: RecipientPolicy) => {
    repo.dispatch({ type: "setRecipientPolicy", policy });
    if (sim.criticals.length === 0) repo.dispatch({ type: "generate", count: 3 });
    router.push("/lab");
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 py-4">
      <section>
        <h1 className="text-3xl font-black tracking-tight">Critical values, delivered inside the EHR.</h1>
        <p className="mt-3 max-w-3xl text-lg text-muted">
          A lab tech sees the critical result, the system works out who is <b className="text-ink">covering right now</b> (often not the
          ordering physician), and one click sends a structured secure message. The physician reads back the value in-app and the
          notification is documented automatically, with no separate messaging app, no re-typing, and a live 30-minute clock.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Choose a demo version</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {VERSIONS.map((v) => {
            const disabled = !!LOCKED_POLICY && LOCKED_POLICY !== v.id;
            return (
              <button
                key={v.id}
                disabled={disabled}
                onClick={() => launch(v.id)}
                className={`rounded-xl border-2 bg-white p-5 text-left shadow-sm transition disabled:opacity-40 ${v.tone}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold">{v.title}</span>
                  {sim.settings.recipientPolicy === v.id && <Badge tone="info">Current</Badge>}
                </div>
                <p className="mt-2 text-sm text-muted">{v.blurb}</p>
                <span className="mt-4 inline-block text-sm font-semibold text-brand">Launch lab worklist →</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-line bg-white p-5 shadow-sm">
        <h2 className="font-bold">Two-window demo script</h2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm">
          <li>
            Open <Link className="text-brand underline" href="/lab">Lab Critical Values</Link> in this window and{" "}
            <a className="text-brand underline" href="/inbox" target="_blank" rel="noreferrer">Provider Inbox ↗</a> in a second window
            side by side.
          </li>
          <li>
            In <Link className="text-brand underline" href="/demo">Demo Controls</Link>, turn <b>off</b> simulated responders so you
            can play the physician.
          </li>
          <li>Simulate a critical. Note the <b>Ordering ≠ Covering</b> callout and the running 30-minute timer.</li>
          <li>Click <b>Send critical value</b>. The physician window gets the message instantly, with locked, pre-filled fields.</li>
          <li>As the physician, type the read-back value, confirm identity, and acknowledge. The lab side shows ✓ and the record is documented.</li>
          <li>Speed the clock to 10× and leave one unanswered to show the escalation prompt, then the automatic incident draft on the Compliance page.</li>
        </ol>
      </section>
    </div>
  );
}
