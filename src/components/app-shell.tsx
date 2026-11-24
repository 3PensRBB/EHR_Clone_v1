"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { LOCKED_POLICY, useNow, useSim } from "@/lib/data/store";
import { isEscalationDue } from "@/lib/domain/sla";
import { cn } from "./ui";

const NAV = [
  { href: "/lab", label: "Lab Critical Values" },
  { href: "/inbox", label: "Provider Inbox" },
  { href: "/schedule", label: "On-Call Schedule" },
  { href: "/dashboard", label: "Compliance" },
  { href: "/demo", label: "Demo Controls" },
];

export function PolicyBadge({ policy }: { policy: string }) {
  const rn = policy === "physician_and_nurse";
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        rn ? "border-violet-300 bg-violet-50 text-violet-800" : "border-sky-300 bg-sky-50 text-sky-800",
      )}
      title={LOCKED_POLICY ? "Pinned by this deployment" : "Change in Demo Controls"}
    >
      {rn ? "Physician + RN recipients" : "Physician-only recipients"}
      {LOCKED_POLICY && " 🔒"}
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const sim = useSim();
  const now = useNow();
  const openCount = sim?.criticals.filter((c) => c.status !== "acknowledged").length ?? 0;
  const escalations = sim?.criticals.filter((c) => isEscalationDue(c, now)).length ?? 0;

  return (
    <div className="min-h-screen">
      <div className="bg-amber-400 px-4 py-1 text-center text-xs font-bold tracking-wide text-amber-950">
        SIMULATED DATA — NOT FOR CLINICAL USE · All patients and staff are fictional
      </div>
      <header className="sticky top-0 z-30 border-b border-brand-dark bg-brand text-white shadow">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2">
          <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded bg-white text-sm font-black text-brand">C</span>
            CritLink <span className="hidden text-xs font-normal opacity-75 sm:inline">Simulated EHR</span>
          </Link>
          <nav className="flex flex-wrap gap-1">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "rounded px-2.5 py-1 text-sm transition",
                  pathname.startsWith(n.href) ? "bg-white/20 font-semibold" : "opacity-85 hover:bg-white/10",
                )}
              >
                {n.label}
                {n.href === "/lab" && openCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-crit px-1.5 text-[11px] font-bold">{openCount}</span>
                )}
                {n.href === "/lab" && escalations > 0 && (
                  <span className="ml-1 rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-amber-950">⇪{escalations}</span>
                )}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {sim && <PolicyBadge policy={sim.settings.recipientPolicy} />}
            {sim && (
              <span className="tabular rounded bg-black/20 px-2 py-0.5 font-mono text-xs" title="Simulated clock">
                {new Date(now).toLocaleTimeString([], { hour12: false })}
                {sim.clock.speed !== 1 && <span className="ml-1 text-amber-300">{sim.clock.speed}×</span>}
              </span>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] px-4 py-5">
        {sim ? children : <div className="py-20 text-center text-muted">Loading simulator…</div>}
      </main>
    </div>
  );
}
