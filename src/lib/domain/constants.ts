/** Fixed by policy: every critical value must be acknowledged within 30 minutes. */
export const SLA_MINUTES = 30;
export const SLA_MS = SLA_MINUTES * 60_000;

/** Prompt the tech to escalate if no acknowledgment this long after a notification. */
export const ESCALATE_AFTER_MINUTES = 10;
export const ESCALATE_AFTER_MS = ESCALATE_AFTER_MINUTES * 60_000;

/** Simulated network delay before a sent message shows as "delivered". */
export const DELIVERY_DELAY_MS = 4_000;

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
