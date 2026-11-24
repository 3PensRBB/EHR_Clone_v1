import type { LabTestDef } from "./tests-catalog";
import type { LabResult } from "./types";

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Verify the recipient's read-back against the actual result.
 * Numeric results must match at the reported precision; cultures must match the Gram stain text.
 */
export function checkReadBack(test: LabTestDef, result: LabResult, input: string): boolean {
  if (!input.trim()) return false;
  if (test.kind === "culture") return norm(input) === norm(result.textValue ?? "");
  const n = Number(input.trim().replace(/,/g, ""));
  if (!Number.isFinite(n) || result.value == null) return false;
  return n.toFixed(test.decimals) === result.value.toFixed(test.decimals);
}
