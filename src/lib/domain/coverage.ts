import type { Millis, Patient, RecipientPolicy, Shift, ShiftRole, SimState, Staff } from "./types";

export type ChainRole = "Covering physician" | "Backup physician" | "Attending" | "Primary RN" | "Charge RN";

export interface ChainEntry {
  staff: Staff;
  role: ChainRole;
  shift?: Shift;
}

export interface CoverageResult {
  ordering?: Staff;
  covering?: ChainEntry;
  /** True when the ordering provider is NOT the person covering right now. */
  differs: boolean;
  /** Ordered notification / escalation chain under the active recipient policy. */
  chain: ChainEntry[];
}

function activeShift(
  shifts: Shift[],
  role: ShiftRole,
  at: Millis,
  match: { serviceId?: string; unitId?: string },
): Shift | undefined {
  return shifts.find(
    (s) =>
      s.role === role &&
      s.startsAt <= at &&
      at < s.endsAt &&
      (match.serviceId == null || s.serviceId === match.serviceId) &&
      (match.unitId == null || s.unitId === match.unitId),
  );
}

/** Patient's assigned RN: RNs on the unit split beds by bed number. */
export function assignedNurseShift(shifts: Shift[], patient: Patient, at: Millis): Shift | undefined {
  const rnShifts = shifts
    .filter((s) => s.role === "rn" && s.unitId === patient.unitId && s.startsAt <= at && at < s.endsAt)
    .sort((a, b) => a.staffId.localeCompare(b.staffId));
  if (rnShifts.length === 0) return undefined;
  const bedNum = parseInt(patient.bed, 10) || 0;
  return rnShifts[bedNum % rnShifts.length];
}

export function isRecipientAllowed(staff: Staff, policy: RecipientPolicy): boolean {
  if (staff.kind === "tech") return false;
  if (staff.kind === "nurse") return policy === "physician_and_nurse";
  return true;
}

export function resolveCoverage(
  state: Pick<SimState, "shifts" | "staff">,
  patient: Patient,
  orderingProviderId: string | undefined,
  at: Millis,
  policy: RecipientPolicy,
): CoverageResult {
  const byId = new Map(state.staff.map((s) => [s.id, s]));
  const entry = (shift: Shift | undefined, role: ChainRole): ChainEntry | undefined => {
    if (!shift) return undefined;
    const staff = byId.get(shift.staffId);
    return staff ? { staff, role, shift } : undefined;
  };

  const svc = { serviceId: patient.serviceId };
  const covering = entry(activeShift(state.shifts, "primary", at, svc), "Covering physician");
  const backup = entry(activeShift(state.shifts, "backup", at, svc), "Backup physician");
  let attending = entry(activeShift(state.shifts, "attending", at, svc), "Attending");
  if (!attending) {
    const a = byId.get(patient.attendingId);
    if (a) attending = { staff: a, role: "Attending" };
  }

  const candidates: (ChainEntry | undefined)[] = [covering, backup, attending];
  if (policy === "physician_and_nurse") {
    candidates.push(
      entry(assignedNurseShift(state.shifts, patient, at), "Primary RN"),
      entry(activeShift(state.shifts, "charge_rn", at, { unitId: patient.unitId }), "Charge RN"),
    );
  }

  const seen = new Set<string>();
  const chain: ChainEntry[] = [];
  for (const c of candidates) {
    if (!c || seen.has(c.staff.id) || !isRecipientAllowed(c.staff, policy)) continue;
    seen.add(c.staff.id);
    chain.push(c);
  }

  const ordering = orderingProviderId ? byId.get(orderingProviderId) : undefined;
  return {
    ordering,
    covering,
    differs: !!ordering && !!covering && ordering.id !== covering.staff.id,
    chain,
  };
}
