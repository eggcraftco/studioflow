// Who sees the /admin pages (security audit #45, 28 Oct 2026).
//
// This is a VIEW gate only. Every admin callable is gated on the server
// (email_verified && SUPPORT_ADMIN_EMAILS in functions/index.js); this decides
// whether the menu item and the page are drawn. It used to be a plain list of
// the admin e-mail addresses — shipped in the /admin chunk and, through
// AppShell, in every signed-in page's bundle: a ready target list for phishing.
// The bundle now carries only SHA-256 digests of "nivadesk-admin-v1:" + the
// trimmed, lower-cased address, and the signed-in person's own address is
// hashed in the browser to compare.
//
// A digest can still confirm a guessed address; it no longer hands the list
// out. Changing the list: add the digest of the new address (same prefix) here
// and the address to SUPPORT_ADMIN_EMAILS on the server; never the address.
//   node -e 'console.log(require("crypto").createHash("sha256").update("nivadesk-admin-v1:"+process.argv[1].trim().toLowerCase()).digest("hex"))' <address>
import { useEffect, useState } from "react";

export const ADMIN_DIGEST_PREFIX = "nivadesk-admin-v1:";

export const NIVADESK_ADMIN_EMAIL_DIGESTS: ReadonlySet<string> = new Set([
  "ead04a3deadc53757356bd5c1877d03cf24b988e8bd32077fd431ebddc569f66",
  "38a01475cf98f6b6f3933c0629c307a3db0c385884fe19e4e744bef877741203",
  "2b65054979e021050e762407632f3276cd5d48f916d09c1295c3b7b6a8e94197"
]);

export function normalizeAdminEmail(email: string | null | undefined): string {
  return String(email ?? "").trim().toLowerCase();
}

/** Hex SHA-256 of ADMIN_DIGEST_PREFIX + the normalised address; "" when Web Crypto is unavailable. */
export async function adminEmailDigest(email: string | null | undefined): Promise<string> {
  const normalized = normalizeAdminEmail(email);
  const subtle = globalThis.crypto?.subtle;
  if (!normalized || !subtle) return "";
  const bytes = new TextEncoder().encode(`${ADMIN_DIGEST_PREFIX}${normalized}`);
  const digest = await subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

const answers = new Map<string, boolean>();

/** Whether this address is on the admin list (by digest). */
export async function isNivaDeskAdminEmail(email: string | null | undefined): Promise<boolean> {
  const normalized = normalizeAdminEmail(email);
  if (!normalized) return false;
  const known = answers.get(normalized);
  if (known !== undefined) return known;
  let admin = false;
  try {
    admin = NIVADESK_ADMIN_EMAIL_DIGESTS.has(await adminEmailDigest(normalized));
  } catch {
    admin = false;
  }
  answers.set(normalized, admin);
  return admin;
}

/** The view gate as a hook: null while the digest is being computed, then true / false. */
export function useNivaDeskAdmin(email: string | null | undefined): boolean | null {
  const normalized = normalizeAdminEmail(email);
  const [answer, setAnswer] = useState<{ email: string; admin: boolean } | null>(() => {
    const known = normalized ? answers.get(normalized) : false;
    return known === undefined ? null : { email: normalized, admin: known };
  });
  useEffect(() => {
    if (!normalized) return;
    const known = answers.get(normalized);
    if (known !== undefined) {
      setAnswer({ email: normalized, admin: known });
      return;
    }
    let cancelled = false;
    void isNivaDeskAdminEmail(normalized).then(admin => {
      if (!cancelled) setAnswer({ email: normalized, admin });
    });
    return () => {
      cancelled = true;
    };
  }, [normalized]);
  if (!normalized) return false;
  return answer && answer.email === normalized ? answer.admin : null;
}
