/**
 * Illustrative critical-limits table. Every institution sets its own limits;
 * these are seed values for the simulator only.
 */
export interface LabTestDef {
  code: string;
  name: string;
  units: string;
  kind: "numeric" | "culture";
  decimals: number;
  refLow?: number;
  refHigh?: number;
  critLow?: number;
  critHigh?: number;
  /** Plausible critical-range bounds for the generator. */
  genLow?: [number, number];
  genHigh?: [number, number];
  /** Relative weight for how often the generator picks this test. */
  weight: number;
}

export const LAB_TESTS: LabTestDef[] = [
  { code: "K", name: "Potassium", units: "mmol/L", kind: "numeric", decimals: 1, refLow: 3.5, refHigh: 5.1, critLow: 2.8, critHigh: 6.2, genLow: [2.0, 2.7], genHigh: [6.3, 7.8], weight: 5 },
  { code: "NA", name: "Sodium", units: "mmol/L", kind: "numeric", decimals: 0, refLow: 136, refHigh: 145, critLow: 120, critHigh: 160, genLow: [110, 119], genHigh: [161, 168], weight: 3 },
  { code: "GLU", name: "Glucose", units: "mg/dL", kind: "numeric", decimals: 0, refLow: 70, refHigh: 99, critLow: 40, critHigh: 450, genLow: [22, 39], genHigh: [460, 780], weight: 4 },
  { code: "CA", name: "Calcium, total", units: "mg/dL", kind: "numeric", decimals: 1, refLow: 8.6, refHigh: 10.3, critLow: 6.0, critHigh: 13.0, genLow: [4.8, 5.9], genHigh: [13.1, 15.2], weight: 2 },
  { code: "HGB", name: "Hemoglobin", units: "g/dL", kind: "numeric", decimals: 1, refLow: 12.0, refHigh: 16.0, critLow: 7.0, critHigh: 20.0, genLow: [4.9, 6.9], genHigh: [20.1, 21.5], weight: 4 },
  { code: "PLT", name: "Platelets", units: "x10³/µL", kind: "numeric", decimals: 0, refLow: 150, refHigh: 400, critLow: 20, critHigh: 1000, genLow: [4, 19], genHigh: [1010, 1250], weight: 3 },
  { code: "WBC", name: "WBC", units: "x10³/µL", kind: "numeric", decimals: 1, refLow: 4.0, refHigh: 11.0, critLow: 2.0, critHigh: 50.0, genLow: [0.3, 1.9], genHigh: [50.5, 88.0], weight: 2 },
  { code: "INR", name: "INR", units: "", kind: "numeric", decimals: 1, refLow: 0.9, refHigh: 1.1, critHigh: 5.0, genHigh: [5.1, 9.8], weight: 3 },
  { code: "LACT", name: "Lactate", units: "mmol/L", kind: "numeric", decimals: 1, refLow: 0.5, refHigh: 2.0, critHigh: 4.0, genHigh: [4.1, 9.5], weight: 3 },
  { code: "TROP", name: "Troponin I, hs", units: "ng/L", kind: "numeric", decimals: 0, refHigh: 34, critHigh: 100, genHigh: [120, 4800], weight: 3 },
  { code: "BCX", name: "Blood Culture, Gram stain", units: "", kind: "culture", decimals: 0, weight: 2 },
];

export const GRAM_STAIN_RESULTS = [
  "Gram-positive cocci in clusters",
  "Gram-positive cocci in chains",
  "Gram-negative rods",
  "Yeast",
];

const BY_CODE = new Map(LAB_TESTS.map((t) => [t.code, t]));

export function getTest(code: string): LabTestDef {
  const t = BY_CODE.get(code);
  if (!t) throw new Error(`Unknown test code ${code}`);
  return t;
}

export function formatRefRange(t: LabTestDef): string {
  if (t.kind === "culture") return "No growth";
  if (t.refLow != null && t.refHigh != null) return `${t.refLow}–${t.refHigh}`;
  if (t.refHigh != null) return `≤ ${t.refHigh}`;
  if (t.refLow != null) return `≥ ${t.refLow}`;
  return "—";
}

export function formatCriticalLimits(t: LabTestDef): string {
  if (t.kind === "culture") return "Any positive";
  const parts: string[] = [];
  if (t.critLow != null) parts.push(`< ${t.critLow}`);
  if (t.critHigh != null) parts.push(`> ${t.critHigh}`);
  return parts.join(" or ");
}

export function formatValue(t: LabTestDef, value: number | null, textValue?: string): string {
  if (t.kind === "culture") return textValue ?? "Positive";
  if (value == null) return "—";
  return value.toFixed(t.decimals);
}
