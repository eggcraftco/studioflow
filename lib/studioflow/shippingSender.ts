// DHL draft sender vs the profile in Settings (22 Oct 2026). Dependency-free (types only),
// so scripts/check-dhl-sender-outdated.mts runs it in Node without Firebase.
import type { ShipmentParty, ShipperProfile, ShipperRegistration } from "./shipping";

/**
 * The sender block a draft takes from the profile in Settings — the same fields the server's
 * prefillDraft copies when a shipment is opened (functions/shipping/service.js).
 */
export function senderFromProfile(profile: ShipperProfile): ShipmentParty {
  return {
    companyName: profile.companyName ?? "", fullName: profile.contactName ?? "", contactTitle: profile.contactTitle ?? "",
    phone: profile.phone ?? "", email: profile.email ?? "",
    address: {
      line1: profile.addressLine1 ?? "", line2: profile.addressLine2 ?? "", city: profile.city ?? "", postalCode: profile.postalCode ?? "",
      provinceCode: profile.provinceCode ?? "", countryCode: String(profile.countryCode ?? "").toUpperCase()
    },
    registrationNumbers: (profile.registrationNumbers ?? []).map(r => ({
      typeCode: r.typeCode, number: r.number, issuerCountryCode: r.issuerCountryCode || profile.countryCode
    }))
  };
}

/**
 * Which sender details of a NOT-yet-created draft differ from the profile in Settings now
 * (the draft keeps the snapshot from when it was opened). English labels, for t(). Empty = same.
 * A created shipment is never compared: its label and invoice are history.
 */
export function senderDifferences(draftShipper: ShipmentParty | null | undefined, profile: ShipperProfile | null | undefined): string[] {
  if (!profile) return [];
  const now = senderFromProfile(profile);
  const was = draftShipper ?? {};
  const norm = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ");
  const up = (value: unknown) => norm(value).toUpperCase();
  const out: string[] = [];
  if (norm(was.companyName) !== norm(now.companyName)) out.push("Business name");
  if (norm(was.fullName) !== norm(now.fullName)) out.push("Contact name");
  if (norm(was.contactTitle) !== norm(now.contactTitle)) out.push("Title / Position (optional)");
  if (norm(was.phone) !== norm(now.phone)) out.push("Phone");
  if (norm(was.email).toLowerCase() !== norm(now.email).toLowerCase()) out.push("Email");
  const a = was.address ?? {};
  const b = now.address ?? {};
  if (norm(a.line1) !== norm(b.line1) || norm(a.line2) !== norm(b.line2) || norm(a.city) !== norm(b.city)
    || up(a.postalCode) !== up(b.postalCode) || up(a.provinceCode) !== up(b.provinceCode) || up(a.countryCode) !== up(b.countryCode)) out.push("Address");
  const regs = (list: ShipperRegistration[] | undefined, country: unknown) => (list ?? [])
    .filter(r => norm(r?.number))
    .map(r => `${up(r.typeCode)}|${up(r.number)}|${up(r.issuerCountryCode || country)}`)
    .sort()
    .join(";");
  if (regs(was.registrationNumbers, a.countryCode) !== regs(now.registrationNumbers, b.countryCode)) out.push("Registration numbers (EORI, VAT)");
  return out;
}
