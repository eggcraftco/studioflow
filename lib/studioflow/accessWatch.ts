// K2 (acceptance refresh 9 Oct 2026): an open tab follows the owner's access changes.
//
// Measured on 7a934710: a member had /orders open with four orders and their amounts; the owner switched
// Assigned Projects Only on (or made them Workflow Only). The rules stopped new data at once, but the four
// orders — money included — stayed on screen until a reload, because every page reads its workspace context
// and its lists once, on mount. A reload was already correct (1 order, finance-free).
//
// So the shell watches the active workspace document and reduces it to this member's ACCESS FINGERPRINT —
// role, custom role (and that role's own access map), the raw memberAccess entry, the inline members.<uid>
// access, suspension. When the server's fingerprint differs from the first one this page saw, the page is
// dropped and loaded again (the same thing a workspace switch does): nothing read under the old scope stays
// on screen, and every list is read again under the new one. Customers, finance and every other area ride
// along, because the fingerprint is the whole access entry.
//
// Only SERVER snapshots count (a cache snapshot can hold the old entry), names and photos are not part of the
// fingerprint (a rename is not an access change), and a refused read after a known baseline (removed,
// suspended) is a change too. A reload storm is impossible by construction — the baseline after a reload is
// the new server value — and is capped anyway.

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function stable(value: unknown): Json {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(stable);
  if (typeof value === "object") {
    // Firestore Timestamps and other class instances: only plain data matters here.
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return String(value);
    const out: { [key: string]: Json } = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = stable((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") return value;
  return String(value);
}

function asMap(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** This member's access, reduced to a string. "owner" for the owner; "absent" when the document is missing. */
export function memberAccessFingerprint(
  companyData: Record<string, unknown> | null | undefined,
  companyId: string,
  uid: string
): string {
  const cleanUid = String(uid || "").trim();
  if (!companyData) return "absent";
  const ownerUid = typeof companyData.ownerUid === "string" && companyData.ownerUid.trim() ? companyData.ownerUid.trim() : companyId;
  if (cleanUid && (cleanUid === ownerUid || cleanUid === companyId)) return "owner";
  const members = asMap(companyData.members);
  const member = asMap(members[cleanUid]);
  const customRoleId = String(asMap(companyData.memberCustomRoles)[cleanUid] ?? member.customRoleId ?? "").trim();
  const customRole = customRoleId ? asMap(asMap(companyData.customRoles)[customRoleId]) : {};
  return JSON.stringify(stable({
    member: Object.prototype.hasOwnProperty.call(members, cleanUid),
    role: member.role ?? null,
    memberRole: asMap(companyData.memberRoles)[cleanUid] ?? null,
    customRoleId,
    customRole: customRoleId ? { baseRole: customRole.baseRole ?? null, access: customRole.access ?? null } : null,
    memberAccess: asMap(companyData.memberAccess)[cleanUid] ?? null,
    inlineAccess: member.access ?? null,
    suspended: Object.prototype.hasOwnProperty.call(asMap(companyData.suspendedMembers), cleanUid)
  }));
}

export type AccessWatchEvent =
  | { kind: "snapshot"; fromCache: boolean; fingerprint: string }
  | { kind: "refused" };

export type AccessWatchStep = { baseline: string | null; action: "none" | "reload" };

/**
 * One step of the watch. `baseline` is the fingerprint the page was loaded under (the first SERVER snapshot);
 * any later server fingerprint that differs — or a refusal after a baseline — reloads the page.
 */
export function accessWatchStep(baseline: string | null, event: AccessWatchEvent): AccessWatchStep {
  if (event.kind === "refused") return { baseline, action: baseline === null ? "none" : "reload" };
  if (event.fromCache) return { baseline, action: "none" };
  if (baseline === null) return { baseline: event.fingerprint, action: "none" };
  return { baseline, action: event.fingerprint === baseline ? "none" : "reload" };
}

/** At most `max` access reloads in `windowMs` (a broken document must not loop the tab). */
export function mayReloadForAccess(previousReloadsMs: number[], nowMs: number, max = 3, windowMs = 60_000): boolean {
  return previousReloadsMs.filter(at => nowMs - at < windowMs).length < max;
}
