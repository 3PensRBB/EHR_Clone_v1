"use client";

import { Badge, Button, Card } from "@/components/ui";
import { LOCKED_POLICY, useRepo, useSim } from "@/lib/data/store";
import { formatTime } from "@/lib/domain/selectors";
import type { RecipientPolicy } from "@/lib/domain/types";

const SPEEDS = [1, 5, 10, 30];

export default function DemoPage() {
  const sim = useSim()!;
  const repo = useRepo();
  const { settings, clock } = sim;

  const setPolicy = (policy: RecipientPolicy) => repo.dispatch({ type: "setRecipientPolicy", policy });

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <h1 className="text-xl font-bold">Demo Controls</h1>

      <Card title="Notification policy (demo version)">
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["physician_only", "Physician-only", "Critical values go only to physicians / APPs (covering → backup → attending). Nurses cannot receive or acknowledge."],
              ["physician_and_nurse", "Physician + RN", "Adds the patient's primary RN and the unit charge RN as valid recipients and escalation steps."],
            ] as const
          ).map(([id, label, desc]) => (
            <button
              key={id}
              onClick={() => setPolicy(id)}
              disabled={!!LOCKED_POLICY && LOCKED_POLICY !== id}
              className={`rounded-lg border-2 p-3 text-left transition disabled:opacity-40 ${settings.recipientPolicy === id ? "border-brand bg-blue-50" : "border-line bg-white hover:border-slate-400"}`}
            >
              <div className="flex items-center justify-between font-semibold">
                {label} {settings.recipientPolicy === id && <Badge tone="info">Active</Badge>}
              </div>
              <div className="mt-1 text-sm text-muted">{desc}</div>
            </button>
          ))}
        </div>
        {LOCKED_POLICY && <p className="mt-2 text-xs text-muted">🔒 This deployment is pinned via NEXT_PUBLIC_RECIPIENT_POLICY.</p>}
      </Card>

      <Card title="Generate critical values">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={() => repo.dispatch({ type: "generate", count: 1 })}>
            + 1 critical
          </Button>
          <Button onClick={() => repo.dispatch({ type: "generate", count: 6 })}>Busy night burst (×6)</Button>
          <span className="mx-2 h-6 w-px bg-line" />
          <span className="text-sm">Stream:</span>
          {[null, 120, 300].map((sec) => (
            <Button
              key={String(sec)}
              size="sm"
              variant={settings.streamEverySimSec === sec ? "primary" : "secondary"}
              onClick={() => repo.dispatch({ type: "updateSettings", patch: { streamEverySimSec: sec, streamNextAt: undefined } })}
            >
              {sec ? `every ${sec / 60} sim-min` : "off"}
            </Button>
          ))}
        </div>
      </Card>

      <Card title="Simulated clock">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">Speed:</span>
          {SPEEDS.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={clock.speed === s ? "primary" : "secondary"}
              onClick={() => repo.dispatch({ type: "setClockSpeed", speed: s, realNow: Date.now() })}
            >
              {s}×
            </Button>
          ))}
          <span className="mx-2 h-6 w-px bg-line" />
          {[5, 10, 30].map((m) => (
            <Button key={m} size="sm" onClick={() => repo.dispatch({ type: "advanceClock", minutes: m })}>
              +{m} min
            </Button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          Speed up time to show the 30-minute window, the 10-minute escalation prompt and the automatic incident draft in a short demo.
        </p>
      </Card>

      <Card title="Simulated responders">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.autoRespond}
            onChange={(e) => repo.dispatch({ type: "updateSettings", patch: { autoRespond: e.target.checked } })}
          />
          Physicians/nurses auto-acknowledge after 1.5–13 min (about 1 in 4 never answer, which triggers escalation)
        </label>
        <p className="mt-2 text-xs text-muted">
          Turn this off when you want to play the physician yourself in a second window (Provider Inbox).
        </p>
      </Card>

      <Card title="Reset">
        <div className="flex items-center gap-3">
          <Button
            variant="danger"
            onClick={() => {
              if (confirm("Reset all simulated data?")) repo.reset();
            }}
          >
            Reset demo data
          </Button>
          <span className="text-xs text-muted">
            Seeded {formatTime(sim.seededAt)} · {sim.patients.length} patients · {sim.staff.length} staff · {sim.criticals.length} criticals
          </span>
        </div>
      </Card>
    </div>
  );
}
