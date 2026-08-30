// Deciding whether an Etsy buyer is somebody the studio already knows.
//
// This is the part of the integration most likely to do quiet damage, because
// both mistakes are invisible for a while:
//
//   * Merge two people who are not the same, and one customer's address and
//     history are now wrong — usually discovered when a parcel goes to the
//     wrong house.
//   * Split one person into two, and the studio loses the repeat-customer
//     relationship it actually wanted from this software.
//
// So the rule is: link automatically only on an identity Etsy itself
// guarantees, and ask a human for everything else.
//
// Why email is not that identity. Etsy hands out relay addresses of the form
// <token>@etsy.com (and regional variants) that route to the buyer without
// revealing them. They are per-transaction or per-relationship, not per-person:
// two receipts from the same buyer can carry different relay addresses, and a
// relay address can be reissued. Treating one as a primary key both splits and
// merges people. The buyer_user_id is the stable identity, and it is the only
// thing here that produces an automatic link.

const RELAY_DOMAINS = [
  "etsy.com",
  "convos.etsy.com",
  "reply.etsy.com",
  "members.etsy.com"
];

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKD")
    // Strip diacritics so "Bogaç" and "Bogac" are the same signal. This is a
    // comparison key only — never write it back as the customer's name.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(value) {
  const clean = normalizeText(value);
  if (!clean) return "";
  // Compare on the set of name parts, so "Ada Lovelace" and "Lovelace Ada"
  // and "Ada  Lovelace" all agree. Order varies by locale and by how the
  // buyer typed it.
  return clean.split(" ").filter(Boolean).sort().join(" ");
}

function normalizePostcode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeAddress(parts) {
  const street = normalizeText(parts?.streetAddress || parts?.street || "");
  const city = normalizeText(parts?.city || "");
  const postcode = normalizePostcode(parts?.postalCode || parts?.zip || "");
  // House number plus postcode is the part that actually identifies a home;
  // street spelling varies far more than either.
  const houseNumber = (street.match(/\b\d+\b/) || [""])[0];
  return { street, city, postcode, houseNumber };
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  // Compare on the last nine digits: country prefixes and trunk zeros are
  // written a dozen ways for the same number.
  return digits.length > 9 ? digits.slice(-9) : digits;
}

function isEtsyRelayEmail(email) {
  const value = String(email || "").toLowerCase().trim();
  const at = value.lastIndexOf("@");
  if (at < 0) return false;
  const domain = value.slice(at + 1);
  return RELAY_DOMAINS.some((relay) => domain === relay || domain.endsWith(`.${relay}`));
}

/**
 * Score one existing NivaDesk customer against the Etsy buyer on this receipt.
 *
 * Returns the signals that agreed rather than a bare number, because the
 * seller is going to be shown WHY NivaDesk thinks these are the same person,
 * and "0.72" is not a reason.
 */
function scoreCandidate(candidate, buyer) {
  const signals = [];
  let score = 0;

  const candidateExternalId = String(candidate?.externalCustomerId || "").trim();
  if (candidateExternalId && buyer.buyerUserId && candidateExternalId === buyer.buyerUserId) {
    signals.push("etsy_buyer_id");
    score += 100;
  }

  const candidateName = normalizeName(candidate?.name);
  if (candidateName && candidateName === buyer.name) {
    signals.push("name");
    score += 30;
  }

  const address = normalizeAddress(candidate);
  if (buyer.address.postcode && address.postcode === buyer.address.postcode) {
    signals.push("postcode");
    score += 25;
    if (buyer.address.houseNumber && address.houseNumber === buyer.address.houseNumber) {
      signals.push("house_number");
      score += 20;
    }
  }
  if (buyer.address.city && address.city === buyer.address.city) {
    signals.push("city");
    score += 5;
  }

  const phone = normalizePhone(candidate?.phone || candidate?.whatsappNumber);
  if (phone && buyer.phone && phone === buyer.phone) {
    signals.push("phone");
    score += 35;
  }

  const candidateEmail = String(candidate?.email || candidate?.emailAddress || "").toLowerCase().trim();
  if (candidateEmail && buyer.email && candidateEmail === buyer.email) {
    // A real address is a decent signal. A relay address is not: two receipts
    // from one buyer can carry different ones, and one can be reissued to
    // someone else entirely.
    if (isEtsyRelayEmail(candidateEmail)) {
      signals.push("relay_email_ignored");
    } else {
      signals.push("email");
      score += 30;
    }
  }

  return { score, signals };
}

/**
 * Decide what to do with the buyer on this receipt.
 *
 * `link`   — an identity Etsy guarantees, or a decision this workspace already made.
 * `review` — plausible, but a human decides.
 * `create` — nothing resembles them.
 *
 * `existingLink` is a previously confirmed buyer→customer decision. Once the
 * seller has said "this Etsy buyer is this customer", NivaDesk must not ask
 * again on every subsequent order.
 */
function proposeCustomerMatch({ source, candidates = [], existingLink = null }) {
  const buyer = {
    buyerUserId: String(source?.buyerUserId || "").trim(),
    name: normalizeName(source?.address?.name || source?.name),
    email: String(source?.buyerEmail || "").toLowerCase().trim(),
    phone: normalizePhone(source?.phone),
    address: normalizeAddress({
      streetAddress: source?.address?.street,
      city: source?.address?.city,
      postalCode: source?.address?.postalCode
    })
  };

  if (existingLink && existingLink.customerId) {
    return {
      decision: "link",
      customerId: String(existingLink.customerId),
      confidence: "confirmed",
      matchMethod: "remembered_decision",
      signals: ["previous_decision"],
      candidates: []
    };
  }

  const scored = candidates
    .map((candidate) => ({ candidate, ...scoreCandidate(candidate, buyer) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    return { decision: "create", customerId: "", confidence: "none", matchMethod: "new", signals: [], candidates: [] };
  }

  const best = scored[0];
  const runnerUp = scored[1] || null;

  // The only automatic link. Etsy's buyer id is the same person by definition.
  if (best.signals.includes("etsy_buyer_id")) {
    return {
      decision: "link",
      customerId: String(best.candidate.id || best.candidate.customerId || ""),
      confidence: "exact",
      matchMethod: "etsy_buyer_id",
      signals: best.signals,
      candidates: []
    };
  }

  // Two candidates that look equally like this person is exactly the case where
  // guessing does damage. Always ask.
  const ambiguous = runnerUp && best.score - runnerUp.score < 20;

  return {
    decision: "review",
    customerId: "",
    confidence: ambiguous ? "ambiguous" : (best.score >= 60 ? "strong" : "weak"),
    matchMethod: "needs_review",
    signals: best.signals,
    candidates: scored.slice(0, 3).map((row) => ({
      customerId: String(row.candidate.id || row.candidate.customerId || ""),
      name: String(row.candidate.name || ""),
      score: row.score,
      signals: row.signals
    }))
  };
}

/**
 * Which fields a sync may write onto a customer the studio already has.
 *
 * The brief calls these merge-policy fields, and the rule is the one that
 * matters most to a working studio: a correction someone made in NivaDesk is
 * not overwritten by the next Etsy sync. A shipping address the seller fixed
 * after a buyer emailed them about a typo must survive.
 *
 * So: fill blanks, never replace.
 */
function customerPatchForExisting(existing, incoming) {
  const patch = {};
  const fields = [
    "email", "phone", "address", "streetAddress", "city", "postalCode", "country",
    "shippingAddress", "shippingStreetAddress", "shippingCity", "shippingPostalCode",
    "shippingCountry", "shippingPhone"
  ];
  for (const field of fields) {
    const current = String(existing?.[field] || "").trim();
    const next = String(incoming?.[field] || "").trim();
    if (!next) continue;
    if (current) continue;          // the studio's value wins, always
    patch[field] = next;
  }
  // The external id is bookkeeping, not content: stamping it lets the next
  // receipt from this buyer link automatically instead of asking again.
  const externalId = String(incoming?.externalCustomerId || "").trim();
  if (externalId && !String(existing?.externalCustomerId || "").trim()) {
    patch.externalCustomerId = externalId;
  }
  return patch;
}

module.exports = {
  RELAY_DOMAINS,
  normalizeName,
  normalizeAddress,
  normalizePhone,
  normalizePostcode,
  isEtsyRelayEmail,
  scoreCandidate,
  proposeCustomerMatch,
  customerPatchForExisting
};
