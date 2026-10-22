// DHL draft sender vs Settings (22 Oct 2026): senderDifferences / senderFromProfile vectors,
// the dialog wiring, the Shipping card height cap, and the new sentences in all 11 languages.
// Run: npx tsx scripts/check-dhl-sender-outdated.mts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { senderDifferences, senderFromProfile, senderOutdatedLabels, senderWarningLabels, SENDER_FIELD_LABELS } from "../lib/studioflow/shippingSender";
import type { ShipperProfile } from "../lib/studioflow/shipping";
import { studioT } from "../lib/studioflow/language";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
let checks = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  checks += 1;
  if (JSON.stringify(got) !== JSON.stringify(want)) failures.push(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};
const ok = (name: string, value: boolean) => { checks += 1; if (!value) failures.push(name); };

const profile: ShipperProfile = {
  companyName: "Train Test Studio", contactName: "Train Owner", contactTitle: "Director", phone: "+440000000000", email: "owner@x.invalid",
  addressLine1: "1 Synthetic Road", addressLine2: "", city: "London", postalCode: "E1 6AN", provinceCode: "", countryCode: "GB",
  timeZone: "Europe/London", registrationNumbers: [{ typeCode: "EOR", number: "GB123456789000", issuerCountryCode: "GB" }]
};
const same = senderFromProfile(profile);
eq("a draft made from the profile has no difference", senderDifferences(same, profile), []);
eq("no profile -> nothing to compare", senderDifferences(same, null), []);
eq("spacing and case of postcode are not a difference", senderDifferences({ ...same, address: { ...same.address, postalCode: "e1  6an" } }, profile), []);
eq("old draft without contactTitle", senderDifferences({ ...same, contactTitle: undefined }, profile), ["Title / Position (optional)"]);
eq("registration added in Settings", senderDifferences({ ...same, registrationNumbers: [] }, profile), ["Registration numbers (EORI, VAT)"]);
eq("registration issuer defaults to the sender country", senderDifferences({ ...same, registrationNumbers: [{ typeCode: "eor", number: "GB123456789000", issuerCountryCode: "" }] }, profile), []);
eq("address and phone", senderDifferences({ ...same, phone: "+441", address: { ...same.address, city: "Leeds" } }, profile), ["Phone", "Address"]);
eq("senderFromProfile carries contactTitle", same.contactTitle, "Director");

// The server's field (listOrderShipments 22 Oct 2026): names only, the same labels for every role.
eq("server names -> the same labels, in the compare's order", senderOutdatedLabels(["registrationNumbers", "phone", "companyName", "nonsense"]), ["Business name", "Phone", "Registration numbers (EORI, VAT)"]);
eq("every server field name has the compare's label", SENDER_FIELD_LABELS.map(([, label]) => label), ["Business name", "Contact name", "Title / Position (optional)", "Phone", "Email", "Address", "Registration numbers (EORI, VAT)"]);
const changedDraft = { ...same, phone: "+441" };
eq("a member with the server's field gets the warning", senderWarningLabels({ serverFields: ["phone"], draftShipper: changedDraft, profile: null, manager: false }), ["Phone"]);
eq("a member on an older server (no field) gets nothing — they cannot read the profile", senderWarningLabels({ serverFields: undefined, draftShipper: changedDraft, profile: null, manager: false }), []);
eq("a manager on an older server falls back to the compare", senderWarningLabels({ serverFields: undefined, draftShipper: changedDraft, profile, manager: true }), ["Phone"]);
eq("the server's [] wins over the compare (cleared after an update)", senderWarningLabels({ serverFields: [], draftShipper: changedDraft, profile, manager: true }), []);

const dialog = fs.readFileSync(path.join(root, "app/orders/ShipmentDraftDialog.tsx"), "utf8");
ok("dialog warns from the server's field, compare only for managers without it", dialog.includes("senderWarningLabels({ serverFields: serverOutdated, draftShipper: shipper, profile: latestProfile, manager: can.senderPaysDuties })"));
ok("dialog re-reads the list for the server's field when it opens", dialog.includes("listOrderShipments(companyId, orderId)") && dialog.includes("Array.isArray(row.senderOutdated)"));
ok("the update clears the server's flag", dialog.includes("setServerOutdated(current => (Array.isArray(current) ? [] : current));"));
ok("non-managers see who can update", /can\.senderPaysDuties \? \([\s\S]{0,300}An owner or admin can update them\./.test(dialog));
const shippingTs = fs.readFileSync(path.join(root, "lib/studioflow/shipping.ts"), "utf8");
ok("OrderShipment carries senderOutdated", /senderOutdated\?: string\[\];/.test(shippingTs));
ok("dialog re-reads the profile when it opens", dialog.includes("getShippingConnection(companyId, { fresh: true })"));
ok("update writes the whole sender block (contactTitle too)", dialog.includes("const next = senderFromProfile(profile);"));
ok("only managers get the action", /senderChanged\.length > 0 \? \([\s\S]{0,600}can\.senderPaysDuties \? \(/.test(dialog));
const panel = fs.readFileSync(path.join(root, "app/orders/OrderShipmentsPanel.tsx"), "utf8");
ok("the dialog opens only for not-created shipments", /const EDITABLE = new Set\(\["draft", "invalid", "rejected", "not_sent"\]\)/.test(panel) && panel.includes("editable && can?.prepare && connected"));
const detail = fs.readFileSync(path.join(root, "app/orders/OrderDetailContent.tsx"), "utf8");
ok("Shipping card may grow past 1200 px", /MEASURED_CARD_MAXIMUMS[^{]*\{[^}]*shipping: 4800/.test(detail));

const LANGUAGES = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
for (const text of ["The sender details in Settings have changed since this shipment was opened.", "Different now:", "Use updated sender details", "An owner or admin can update them.",
  "Business name", "Contact name", "Title / Position (optional)", "Phone", "Email", "Address", "Registration numbers (EORI, VAT)"]) {
  for (const language of LANGUAGES) ok(`"${text}" in ${language}`, studioT(text, language as never) !== text || ["Email"].includes(text));
}

if (failures.length) {
  console.log(`check-dhl-sender-outdated: ${failures.length} of ${checks} FAILED`);
  for (const f of failures) console.log("FAIL", f);
  process.exit(1);
}
console.log(`check-dhl-sender-outdated: ${checks}/${checks} passed`);
