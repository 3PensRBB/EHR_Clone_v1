import { describe, expect, it } from "vitest";
import { buildSeed } from "../simulator/seed";
import { mulberry32 } from "../simulator/random";
import { resolveCoverage } from "./coverage";
import { applyCommand, type Command, type EngineCtx } from "./engine";
import { checkReadBack } from "./readback";
import { isEscalationDue, slaState } from "./sla";
import { getTest } from "./tests-catalog";
import type { RecipientPolicy, SimState } from "./types";
import { MINUTE } from "./constants";

// 2026-11-24 02:30 local — night shift
const NIGHT = new Date(2026, 10, 24, 2, 30).getTime();

function setup(policy: RecipientPolicy = "physician_only") {
  let n = 0;
  const state = buildSeed(NIGHT, policy);
  state.settings.autoRespond = false;
  const ctx = (now = NIGHT): EngineCtx => ({ now, rand: mulberry32(7), newId: (p) => `${p}-${++n}` });
  const run = (s: SimState, cmd: Command, now = NIGHT) => applyCommand(s, cmd, ctx(now));
  return { state, run };
}

describe("coverage", () => {
  it("resolves the night float as covering when a day hospitalist ordered", () => {
    const { state } = setup();
    const pt = state.patients.find((p) => p.serviceId === "svc-med")!;
    const cov = resolveCoverage(state, pt, "svc-med-day", NIGHT, "physician_only");
    expect(cov.covering?.staff.id).toBe("svc-med-night");
    expect(cov.differs).toBe(true);
    expect(cov.chain.map((c) => c.role)).toEqual(["Covering physician", "Backup physician", "Attending"]);
  });

  it("adds nurses to the chain only under the physician_and_nurse policy", () => {
    const { state } = setup();
    const pt = state.patients[0];
    const physOnly = resolveCoverage(state, pt, undefined, NIGHT, "physician_only");
    const withRn = resolveCoverage(state, pt, undefined, NIGHT, "physician_and_nurse");
    expect(physOnly.chain.some((c) => c.staff.kind === "nurse")).toBe(false);
    expect(withRn.chain.filter((c) => c.staff.kind === "nurse").map((c) => c.role)).toEqual(["Primary RN", "Charge RN"]);
  });
});

describe("read-back", () => {
  it("matches at reported precision", () => {
    const t = getTest("K");
    const r = { value: 6.8, textValue: undefined } as never;
    expect(checkReadBack(t, r, "6.8")).toBe(true);
    expect(checkReadBack(t, r, "6.80")).toBe(true);
    expect(checkReadBack(t, r, "8.6")).toBe(false);
    expect(checkReadBack(t, r, "")).toBe(false);
  });
});

describe("engine: notify → acknowledge flow", () => {
  it("requires a correct read-back and documents the notification", () => {
    const { state, run } = setup();
    let s = run(state, { type: "generate", count: 1 }).state;
    const c = s.criticals[0];
    expect(slaState(c, NIGHT).level).toBe("green");

    const pt = s.patients.find((p) => p.id === c.patientId)!;
    const covering = resolveCoverage(s, pt, undefined, NIGHT, "physician_only").covering!.staff.id;
    s = run(s, { type: "notify", criticalId: c.id, recipientId: covering, techId: "tech-1" }).state;
    expect(s.criticals[0].status).toBe("notified");
    expect(s.messages[0].payload?.mrn).toBe(pt.mrn);

    const bad = run(s, { type: "acknowledge", criticalId: c.id, userId: covering, readBack: "999", identityConfirmed: true });
    expect(bad.ok).toBe(false);

    const result = s.results.find((r) => r.id === c.resultId)!;
    const test = getTest(result.testCode);
    const rb = test.kind === "culture" ? result.textValue! : result.value!.toFixed(test.decimals);
    const good = run(s, { type: "acknowledge", criticalId: c.id, userId: covering, readBack: rb, identityConfirmed: true }, NIGHT + 5 * MINUTE);
    expect(good.ok).toBe(true);
    expect(good.state.criticals[0].status).toBe("acknowledged");
    expect(good.state.notificationLog[0]).toMatchObject({ withinSla: true, minutesFromVerify: 5, readBackOk: true });
  });

  it("blocks nurses in physician-only mode and allows them in nurse mode", () => {
    for (const policy of ["physician_only", "physician_and_nurse"] as const) {
      const { state, run } = setup(policy);
      const s = run(state, { type: "generate", count: 1 }).state;
      const res = run(s, { type: "notify", criticalId: s.criticals[0].id, recipientId: "u-5w-n-rn1", techId: "tech-1" });
      expect(res.ok).toBe(policy === "physician_and_nurse");
    }
  });

  it("flags escalation after 10 min and drafts an incident after 30 min", () => {
    const { state, run } = setup();
    let s = run(state, { type: "generate", count: 1 }).state;
    const c = s.criticals[0];
    s = run(s, { type: "notify", criticalId: c.id, recipientId: "svc-med-night", techId: "tech-1" }).state;
    expect(isEscalationDue(s.criticals[0], NIGHT + 9 * MINUTE)).toBe(false);
    expect(isEscalationDue(s.criticals[0], NIGHT + 10 * MINUTE)).toBe(true);
    s = run(s, { type: "tick" }, NIGHT + 31 * MINUTE).state;
    expect(s.criticals[0].breachedAt).toBe(c.slaDueAt);
    expect(s.incidents).toHaveLength(1);
  });
});
