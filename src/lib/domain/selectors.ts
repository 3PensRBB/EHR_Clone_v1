import { resolveCoverage } from "./coverage";
import { formatRefRange, formatValue, getTest } from "./tests-catalog";
import type { CriticalEvent, CriticalPayload, Millis, SimState, Staff } from "./types";

export function staffById(state: SimState, id: string | undefined): Staff | undefined {
  return id ? state.staff.find((s) => s.id === id) : undefined;
}

export function displayName(s: Staff | undefined): string {
  if (!s) return "Unknown";
  if (s.kind === "physician") return `Dr. ${s.name.split(" ").slice(-1)[0]}`;
  return `${s.name}, ${s.credentials}`;
}

export function fullName(s: Staff | undefined): string {
  return s ? `${s.name}, ${s.credentials}` : "Unknown";
}

/** Everything a screen needs about one critical value, joined. */
export function criticalView(state: SimState, c: CriticalEvent, at: Millis) {
  const result = state.results.find((r) => r.id === c.resultId)!;
  const patient = state.patients.find((p) => p.id === c.patientId)!;
  const unit = state.units.find((u) => u.id === patient.unitId)!;
  const test = getTest(result.testCode);
  const coverage = resolveCoverage(state, patient, result.orderingProviderId, at, state.settings.recipientPolicy);
  const history = state.results
    .filter((r) => r.patientId === patient.id && r.testCode === result.testCode)
    .sort((a, b) => b.collectedAt - a.collectedAt);
  return { critical: c, result, patient, unit, test, coverage, history };
}

export type CriticalView = ReturnType<typeof criticalView>;

export function buildPayload(v: CriticalView): CriticalPayload {
  return {
    patientName: `${v.patient.lastName.toUpperCase()}, ${v.patient.firstName}`,
    mrn: v.patient.mrn,
    location: `${v.unit.short}-${v.patient.bed}`,
    testName: v.test.name,
    value: formatValue(v.test, v.result.value, v.result.textValue),
    units: v.test.units,
    flag: v.result.flag,
    refRange: formatRefRange(v.test),
    collectedAt: v.result.collectedAt,
    verifiedAt: v.result.verifiedAt,
    accession: v.result.accession,
  };
}

export function messagesFor(state: SimState, criticalId: string) {
  return state.messages.filter((m) => m.criticalId === criticalId).sort((a, b) => a.sentAt - b.sentAt);
}

export function ageYears(dob: string, at: Millis): number {
  const d = new Date(dob);
  const n = new Date(at);
  let age = n.getFullYear() - d.getFullYear();
  if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) age--;
  return age;
}

export function formatTime(t: Millis): string {
  return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function formatDateTime(t: Millis): string {
  const d = new Date(t);
  return `${d.toLocaleDateString([], { month: "2-digit", day: "2-digit" })} ${formatTime(t)}`;
}
