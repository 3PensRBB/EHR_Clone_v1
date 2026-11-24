/**
 * Core domain types for CritLink.
 *
 * These shapes are deliberately "table-like" (flat records keyed by id, with
 * foreign keys rather than nested objects) so that they map 1:1 onto database
 * tables when a persistent backend is added. See docs/TECHNICAL_PLAN.md §3.
 */

export type Id = string;
/** Epoch milliseconds on the *simulated* clock. */
export type Millis = number;

export type RecipientPolicy = "physician_only" | "physician_and_nurse";

export type StaffKind = "physician" | "app" | "nurse" | "tech";

export interface Staff {
  id: Id;
  name: string; // "Priya Patel"
  credentials: string; // "MD", "NP", "RN", "MLS(ASCP)"
  kind: StaffKind;
  title: string; // "Hospitalist", "Night Float", "Charge RN"
  serviceId?: Id;
  unitId?: Id;
  phone: string; // extension / Vocera / pager (fictional)
}

export interface Unit {
  id: Id;
  name: string; // "5 West Med-Surg"
  short: string; // "5W"
  serviceId: Id;
}

export interface Service {
  id: Id;
  name: string; // "Hospital Medicine"
}

export interface Patient {
  id: Id;
  mrn: string;
  firstName: string;
  lastName: string;
  dob: string; // ISO date
  sex: "F" | "M";
  unitId: Id;
  bed: string; // "12"
  serviceId: Id;
  attendingId: Id;
}

export type ShiftRole = "primary" | "backup" | "attending" | "rn" | "charge_rn";

/** A block of on-call coverage. Physicians cover a service; nurses cover a unit. */
export interface Shift {
  id: Id;
  staffId: Id;
  role: ShiftRole;
  serviceId?: Id;
  unitId?: Id;
  startsAt: Millis;
  endsAt: Millis;
  label: string; // "Day", "Night Float", "24h Attending"
}

export type ResultFlag = "LL" | "HH" | "POS";

export interface LabResult {
  id: Id;
  accession: string;
  patientId: Id;
  testCode: string;
  value: number | null; // numeric tests
  textValue?: string; // cultures / qualitative
  flag: ResultFlag | "L" | "H" | "N";
  isCritical: boolean;
  orderingProviderId: Id;
  collectedAt: Millis;
  verifiedAt: Millis;
  verifiedByTechId: Id;
}

export type CriticalStatus = "open" | "notified" | "acknowledged";

export interface CriticalEvent {
  id: Id;
  resultId: Id;
  patientId: Id;
  createdAt: Millis;
  /** Always verifiedAt + 30 minutes. */
  slaDueAt: Millis;
  status: CriticalStatus;
  /** Index into the escalation chain of the last person notified (-1 = none). */
  escalationLevel: number;
  lastNotifiedAt?: Millis;
  lastNotifiedId?: Id;
  acknowledgedAt?: Millis;
  acknowledgedById?: Id;
  ackMethod?: "in_app" | "phone";
  readBackValue?: string;
  /** Set when the 30-minute window elapses without acknowledgment. */
  breachedAt?: Millis;
}

export type MessageKind = "critical" | "escalation" | "reply" | "ack" | "system";

/** Snapshot of the result embedded in a critical message (locked fields). */
export interface CriticalPayload {
  patientName: string;
  mrn: string;
  location: string;
  testName: string;
  value: string;
  units: string;
  flag: string;
  refRange: string;
  collectedAt: Millis;
  verifiedAt: Millis;
  accession: string;
}

export interface Message {
  id: Id;
  criticalId: Id; // one thread per critical value
  senderId: Id;
  recipientId: Id;
  kind: MessageKind;
  body: string;
  payload?: CriticalPayload;
  sentAt: Millis;
  deliveredAt?: Millis;
  readAt?: Millis;
  /** Simulator only: when the auto-responder will acknowledge (null = never answers). */
  autoAckAt?: Millis | null;
}

export interface NotificationLogEntry {
  id: Id;
  criticalId: Id;
  method: "in_app" | "phone";
  notifiedId: Id;
  byTechId: Id;
  at: Millis;
  readBackOk: boolean;
  minutesFromVerify: number;
  withinSla: boolean;
  notes?: string;
}

export interface AuditEvent {
  id: Id;
  at: Millis;
  actorId: Id | "system";
  action: string;
  criticalId?: Id;
  detail?: string;
}

export interface IncidentDraft {
  id: Id;
  criticalId: Id;
  createdAt: Millis;
  status: "draft";
  summary: string;
  timeline: { at: Millis; text: string }[];
}

export interface DemoClock {
  /** Real Date.now() at the moment the clock was last (re)anchored. */
  anchorReal: Millis;
  /** Simulated time at that same moment. */
  anchorSim: Millis;
  speed: number; // 1 = real time
}

export interface Settings {
  recipientPolicy: RecipientPolicy;
  autoRespond: boolean;
  /** Seconds (simulated) between generated criticals; null = stream off. */
  streamEverySimSec: number | null;
  streamNextAt?: Millis;
  currentTechId: Id;
  currentInboxUserId?: Id;
}

export interface SimState {
  schemaVersion: number;
  seededAt: Millis;
  services: Service[];
  units: Unit[];
  staff: Staff[];
  patients: Patient[];
  shifts: Shift[];
  results: LabResult[];
  criticals: CriticalEvent[];
  messages: Message[];
  notificationLog: NotificationLogEntry[];
  audit: AuditEvent[];
  incidents: IncidentDraft[];
  settings: Settings;
  clock: DemoClock;
}
