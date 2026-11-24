import { HOUR, MINUTE, SLA_MS } from "../domain/constants";
import { GRAM_STAIN_RESULTS, LAB_TESTS, type LabTestDef } from "../domain/tests-catalog";
import type { CriticalEvent, LabResult, Millis, Patient, SimState } from "../domain/types";
import { between, intBetween, pick, weightedPick, type Rand } from "./random";

export interface GenCtx {
  now: Millis;
  rand: Rand;
  newId: (prefix: string) => string;
}

function round(v: number, decimals: number) {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

/** A value inside or near the reference range, for the patient's prior history. */
function priorValue(rand: Rand, t: LabTestDef, towards: "low" | "high"): number {
  const lo = t.refLow ?? (t.refHigh != null ? t.refHigh * 0.3 : 0);
  const hi = t.refHigh ?? lo * 1.5;
  const mid = (lo + hi) / 2;
  const drift = (hi - lo) * between(rand, 0.1, 0.9) * (towards === "high" ? 1 : -1);
  return round(Math.max(0, mid + drift), t.decimals);
}

function flagFor(t: LabTestDef, v: number): LabResult["flag"] {
  if (t.critLow != null && v < t.critLow) return "LL";
  if (t.critHigh != null && v > t.critHigh) return "HH";
  if (t.refLow != null && v < t.refLow) return "L";
  if (t.refHigh != null && v > t.refHigh) return "H";
  return "N";
}

/** Ordering providers: often someone who is *not* covering right now. */
function pickOrderingProvider(rand: Rand, patient: Patient): string {
  const svc = patient.serviceId;
  return pick(rand, [`${svc}-day`, `${svc}-day`, `${svc}-night`, `${svc}-dayb`, "ed-1", "cards-1"]);
}

let accessionSeq = 0;

export function generateCritical(
  state: SimState,
  ctx: GenCtx,
): { results: LabResult[]; critical: CriticalEvent } {
  const { rand, now, newId } = ctx;
  const patient = pick(rand, state.patients);
  const test = weightedPick(rand, LAB_TESTS);
  const techId = state.settings.currentTechId;
  const orderingProviderId = pickOrderingProvider(rand, patient);
  const collectedAt = now - intBetween(rand, 12, 40) * MINUTE;
  accessionSeq = (accessionSeq + 1) % 1000;
  const accession = `C${String(now).slice(-6)}${String(accessionSeq).padStart(3, "0")}`;

  const results: LabResult[] = [];
  let critical: LabResult;

  if (test.kind === "culture") {
    critical = {
      id: newId("res"),
      accession,
      patientId: patient.id,
      testCode: test.code,
      value: null,
      textValue: pick(rand, GRAM_STAIN_RESULTS),
      flag: "POS",
      isCritical: true,
      orderingProviderId,
      collectedAt: now - intBetween(rand, 14, 30) * HOUR,
      verifiedAt: now,
      verifiedByTechId: techId,
    };
  } else {
    const dir: "low" | "high" = test.genLow && test.genHigh ? (rand() < 0.5 ? "low" : "high") : test.genLow ? "low" : "high";
    const [lo, hi] = (dir === "low" ? test.genLow : test.genHigh)!;
    const value = round(between(rand, lo, hi), test.decimals);
    // Prior history for delta check context
    for (let k = 2; k >= 1; k--) {
      const t = collectedAt - k * intBetween(rand, 8, 14) * HOUR;
      const v = priorValue(rand, test, dir);
      results.push({
        id: newId("res"),
        accession: `${accession}-P${k}`,
        patientId: patient.id,
        testCode: test.code,
        value: v,
        flag: flagFor(test, v),
        isCritical: false,
        orderingProviderId,
        collectedAt: t,
        verifiedAt: t + 25 * MINUTE,
        verifiedByTechId: pick(rand, ["tech-1", "tech-2", "tech-3"]),
      });
    }
    critical = {
      id: newId("res"),
      accession,
      patientId: patient.id,
      testCode: test.code,
      value,
      flag: flagFor(test, value),
      isCritical: true,
      orderingProviderId,
      collectedAt,
      verifiedAt: now,
      verifiedByTechId: techId,
    };
  }
  results.push(critical);

  return {
    results,
    critical: {
      id: newId("crit"),
      resultId: critical.id,
      patientId: patient.id,
      createdAt: now,
      slaDueAt: now + SLA_MS,
      status: "open",
      escalationLevel: -1,
    },
  };
}
