// The pure half of lib/studioflow/trackingRegistration.ts (no Firebase import), so
// scripts/check-tracking-registration.mjs can compile and run it.

export type TrackingRegistrationSettings = {
  autoRegister: boolean;
  canChange: boolean;
  caps: { daily: number; monthly: number };
  used: { today: number; month: number };
  outcomesThisMonth: { registered: number; failed: number; indeterminate: number; released: number };
  providerPaused: boolean;
};

const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);

/** The server's answer, made safe to render (missing numbers are 0, the setting is off unless `true`). */
export function trackingRegistrationSettingsFrom(raw: unknown): TrackingRegistrationSettings {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const caps = (d.caps && typeof d.caps === "object" ? d.caps : {}) as Record<string, unknown>;
  const used = (d.used && typeof d.used === "object" ? d.used : {}) as Record<string, unknown>;
  const outcomes = (d.outcomesThisMonth && typeof d.outcomesThisMonth === "object" ? d.outcomesThisMonth : {}) as Record<string, unknown>;
  return {
    autoRegister: d.autoRegister === true,
    canChange: d.canChange === true,
    caps: { daily: num(caps.daily), monthly: num(caps.monthly) },
    used: { today: num(used.today), month: num(used.month) },
    outcomesThisMonth: { registered: num(outcomes.registered), failed: num(outcomes.failed), indeterminate: num(outcomes.indeterminate), released: num(outcomes.released) },
    providerPaused: d.providerPaused === true
  };
}

/** "3 of 10" — filled after translation of "{used} of {limit}". */
export function usageLine(template: string, used: number, limit: number): string {
  return template.replace("{used}", String(used)).replace("{limit}", String(limit));
}
