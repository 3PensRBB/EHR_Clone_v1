/**
 * Synthetic seed data. All names are fictional; no real patient information.
 */
import { HOUR } from "../domain/constants";
import type { Millis, Patient, RecipientPolicy, Service, Shift, SimState, Staff, Unit } from "../domain/types";
import { intBetween, mulberry32, pick, type Rand } from "./random";

export const SCHEMA_VERSION = 1;

const FIRST = [
  "Avery", "Jordan", "Morgan", "Riley", "Casey", "Quinn", "Rowan", "Harper", "Elena", "Marcus", "Nadia", "Omar",
  "Grace", "Hector", "Iris", "Jonah", "Keira", "Liam", "Maya", "Noel", "Opal", "Pierce", "Rosa", "Silas",
  "Tessa", "Ulric", "Vera", "Wade", "Ximena", "Yusuf", "Zara", "Beatrice", "Calvin", "Delia", "Emmett", "Fiona",
];
const LAST = [
  "Ashford", "Bellamy", "Calloway", "Dunmore", "Everly", "Fairbanks", "Galloway", "Hawthorne", "Ingram", "Jessup",
  "Kingsley", "Lockhart", "Merriweather", "Northcott", "Oakley", "Pemberton", "Quimby", "Radcliffe", "Sterling",
  "Thornbury", "Underhill", "Vance", "Whitlock", "Yardley", "Zeller", "Abernathy", "Brightwater", "Castellano",
  "Delacroix", "Esposito", "Fenwick", "Grimaldi", "Holloway", "Iverson", "Juarez", "Kowalski", "Lindqvist",
];

export const SERVICES: Service[] = [
  { id: "svc-med", name: "Hospital Medicine" },
  { id: "svc-icu", name: "Critical Care" },
  { id: "svc-surg", name: "General Surgery" },
];

export const UNITS: Unit[] = [
  { id: "u-5w", name: "5 West Med-Surg", short: "5W", serviceId: "svc-med" },
  { id: "u-6e", name: "6 East Telemetry", short: "6E", serviceId: "svc-med" },
  { id: "u-micu", name: "Medical ICU", short: "MICU", serviceId: "svc-icu" },
  { id: "u-4n", name: "4 North Surgical", short: "4N", serviceId: "svc-surg" },
  { id: "u-sicu", name: "Surgical ICU", short: "SICU", serviceId: "svc-surg" },
];

/** Physician roster per service: [id suffix, title, credentials, shift slot]. */
const PHYS_SLOTS = [
  ["day", "Day Hospitalist", "MD"],
  ["night", "Night Float", "MD"],
  ["dayb", "Day Backup", "DO"],
  ["nightb", "Night Backup", "NP"],
  ["att", "Attending", "MD"],
] as const;

const SERVICE_TITLE_OVERRIDE: Record<string, Partial<Record<string, string>>> = {
  "svc-icu": { day: "Day Intensivist", night: "Night Intensivist", dayb: "ICU Fellow (Day)", nightb: "ICU Fellow (Night)" },
  "svc-surg": { day: "Surgery Resident (Day)", night: "Surgery Night Float", dayb: "Surgery Chief Resident", nightb: "Surgery PA (Night)" },
};

function nameFactory(rand: Rand) {
  const used = new Set<string>();
  return () => {
    for (;;) {
      const n = `${pick(rand, FIRST)} ${pick(rand, LAST)}`;
      if (!used.has(n)) {
        used.add(n);
        return n;
      }
    }
  };
}

const ext = (rand: Rand) => `x${intBetween(rand, 4100, 7999)}`;

function startOfDay(t: Millis): Millis {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function buildSeed(now: Millis, policy: RecipientPolicy, seed = 20261124): SimState {
  const rand = mulberry32(seed);
  const newName = nameFactory(rand);
  const staff: Staff[] = [];
  const shifts: Shift[] = [];

  // Physicians / APPs per service
  for (const svc of SERVICES) {
    for (const [slot, title, cred] of PHYS_SLOTS) {
      staff.push({
        id: `${svc.id}-${slot}`,
        name: newName(),
        credentials: cred,
        kind: cred === "NP" ? "app" : "physician",
        title: SERVICE_TITLE_OVERRIDE[svc.id]?.[slot] ?? title,
        serviceId: svc.id,
        phone: ext(rand),
      });
    }
  }
  // Ordering-only providers (ED, consultants) – they order labs but don't cover.
  staff.push({ id: "ed-1", name: newName(), credentials: "MD", kind: "physician", title: "Emergency Medicine", phone: ext(rand) });
  staff.push({ id: "cards-1", name: newName(), credentials: "MD", kind: "physician", title: "Cardiology Consult", phone: ext(rand) });

  // Nurses per unit: 2 RNs + 1 charge per shift
  for (const u of UNITS) {
    for (const shift of ["d", "n"] as const) {
      for (const role of ["rn1", "rn2", "charge"] as const) {
        staff.push({
          id: `${u.id}-${shift}-${role}`,
          name: newName(),
          credentials: "RN",
          kind: "nurse",
          title: `${role === "charge" ? "Charge RN" : "RN"} · ${u.short} ${shift === "d" ? "Days" : "Nights"}`,
          unitId: u.id,
          phone: ext(rand),
        });
      }
    }
  }

  // Lab techs
  const techs: Staff[] = [
    { id: "tech-1", name: "Jamie Rivera", credentials: "MLS(ASCP)", kind: "tech", title: "Medical Laboratory Scientist", phone: "x4412" },
    { id: "tech-2", name: "Sam Okafor", credentials: "MLT(ASCP)", kind: "tech", title: "Medical Laboratory Technician", phone: "x4413" },
    { id: "tech-3", name: "Lee Moreno", credentials: "MLS(ASCP)", kind: "tech", title: "Night Shift Lead", phone: "x4415" },
  ];
  staff.push(...techs);

  // Shifts: days -1 .. +3 around "now"; day 07–19, night 19–07.
  const day0 = startOfDay(now);
  for (let d = -1; d <= 3; d++) {
    const base = day0 + d * 24 * HOUR;
    const dayStart = base + 7 * HOUR;
    const nightStart = base + 19 * HOUR;
    const nextDay = base + 31 * HOUR;
    for (const svc of SERVICES) {
      const mk = (slot: string, role: Shift["role"], s: Millis, e: Millis, label: string) =>
        shifts.push({ id: `sh-${svc.id}-${slot}-${d}`, staffId: `${svc.id}-${slot}`, role, serviceId: svc.id, startsAt: s, endsAt: e, label });
      mk("day", "primary", dayStart, nightStart, "Day");
      mk("night", "primary", nightStart, nextDay, "Night Float");
      mk("dayb", "backup", dayStart, nightStart, "Day Backup");
      mk("nightb", "backup", nightStart, nextDay, "Night Backup");
      mk("att", "attending", dayStart, nextDay, "24h Attending");
    }
    for (const u of UNITS) {
      for (const [sh, s, e, label] of [["d", dayStart, nightStart, "Days"], ["n", nightStart, nextDay, "Nights"]] as const) {
        for (const role of ["rn1", "rn2"]) {
          shifts.push({ id: `sh-${u.id}-${sh}-${role}-${d}`, staffId: `${u.id}-${sh}-${role}`, role: "rn", unitId: u.id, startsAt: s, endsAt: e, label });
        }
        shifts.push({ id: `sh-${u.id}-${sh}-charge-${d}`, staffId: `${u.id}-${sh}-charge`, role: "charge_rn", unitId: u.id, startsAt: s, endsAt: e, label });
      }
    }
  }

  // Patients
  const patients: Patient[] = [];
  const usedBeds = new Set<string>();
  for (let i = 0; i < 40; i++) {
    const unit = UNITS[i % UNITS.length];
    let bed: string;
    do bed = String(intBetween(rand, 1, 28)); while (usedBeds.has(`${unit.id}-${bed}`));
    usedBeds.add(`${unit.id}-${bed}`);
    const [first, last] = newName().split(" ");
    const age = intBetween(rand, 19, 94);
    const dob = new Date(new Date(now).getFullYear() - age, intBetween(rand, 0, 11), intBetween(rand, 1, 28));
    patients.push({
      id: `pt-${i + 1}`,
      mrn: String(intBetween(rand, 1000000, 9999999)).padStart(8, "0"),
      firstName: first,
      lastName: last,
      dob: dob.toISOString().slice(0, 10),
      sex: rand() < 0.5 ? "F" : "M",
      unitId: unit.id,
      bed,
      serviceId: unit.serviceId,
      attendingId: `${unit.serviceId}-att`,
    });
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    seededAt: now,
    services: SERVICES,
    units: UNITS,
    staff,
    patients,
    shifts,
    results: [],
    criticals: [],
    messages: [],
    notificationLog: [],
    audit: [],
    incidents: [],
    settings: {
      recipientPolicy: policy,
      autoRespond: true,
      streamEverySimSec: null,
      currentTechId: "tech-1",
    },
    clock: { anchorReal: now, anchorSim: now, speed: 1 },
  };
}
