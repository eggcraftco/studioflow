"use strict";

// Inviting somebody to a workspace by email.
//
// The old way round was that the owner read their Company ID aloud, the other
// person typed it in, asked to join, and the owner approved — three steps and a
// number nobody can remember, done in the wrong order by the wrong person. This
// is the same thing said forwards: the owner types an email address, picks what
// that person may see, and presses send.
//
// Its own module because the parts that decide whether a stranger gets into a
// workspace are worth testing on their own, and because there is exactly one
// dangerous idea here: a link in an email IS the credential. Everything below
// exists to keep that true and narrow.

const crypto = require("crypto");

/** Long enough that guessing is not a strategy. */
const TOKEN_BYTES = 32;

/** Two weeks. Long enough for a holiday, short enough that a forwarded mailbox
 *  or a printed-out email does not stay a working key for a year. */
const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * A fresh invitation token, and the id it is stored under.
 *
 * The raw token is returned once, to be put in the email, and never written
 * down: what Firestore holds is its SHA-256, which is also the document id. So
 * an invitation cannot be replayed out of a database dump, a backup, or a
 * console session — and looking one up is a direct read rather than a query.
 */
function mintInvitationToken() {
  const token = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, id: invitationIdForToken(token) };
}

/** The document id a token resolves to. */
function invitationIdForToken(token) {
  const clean = String(token == null ? "" : token).trim();
  if (!clean) return "";
  return crypto.createHash("sha256").update(clean).digest("hex");
}

/**
 * The email as we will compare it.
 *
 * Lower-cased and trimmed, and nothing cleverer: stripping dots or +tags would
 * be guessing at one provider's rules and would let one invitation be accepted
 * by an address the owner did not type.
 */
function normalizeInviteEmail(value) {
  return String(value == null ? "" : value).trim().toLowerCase();
}

/** A shape check, not a promise the address exists. */
function isPlausibleEmail(value) {
  const email = normalizeInviteEmail(value);
  return /^[^\s@]+@[^\s@]{1,255}\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

function invitationExpiresAtMs(nowMs = Date.now()) {
  return nowMs + INVITE_TTL_MS;
}

function millisFrom(value) {
  if (value == null) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  if (typeof value._seconds === "number") return value._seconds * 1000;
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Whether this invitation may be accepted, by this person, right now.
 *
 * Returns a reason rather than a boolean because every one of these needs a
 * different sentence on the screen: "already used" and "expired" and "this link
 * was not sent to you" are three different situations and one of them is the
 * person's own mistake.
 *
 * The email must match. The token alone proves control of the mailbox it was
 * sent to, but not that the person signed in is the one the owner meant — and
 * an invitation forwarded to a colleague would otherwise quietly hand THEM the
 * seat, under a name the owner never typed.
 */
function invitationAcceptability(invitation, signedInEmail, nowMs = Date.now()) {
  if (!invitation || typeof invitation !== "object" || Array.isArray(invitation)) {
    return { ok: false, reason: "not_found" };
  }

  // An invitation with no address on it is not an invitation. Without this the
  // email check below is skipped — `invited` is empty, so nothing is compared —
  // and any signed-in person who reached the link takes the seat.
  const invited = normalizeInviteEmail(invitation.email);
  if (!invited) return { ok: false, reason: "not_found" };

  const status = String(invitation.status || "pending").toLowerCase();
  if (status === "accepted") return { ok: false, reason: "already_accepted" };
  if (status === "revoked") return { ok: false, reason: "revoked" };
  if (status !== "pending") return { ok: false, reason: "not_found" };

  const expiresAt = millisFrom(invitation.expiresAt);
  if (expiresAt && nowMs > expiresAt) return { ok: false, reason: "expired" };

  const signedIn = normalizeInviteEmail(signedInEmail);
  if (!signedIn) return { ok: false, reason: "no_email_on_account" };
  if (invited !== signedIn) return { ok: false, reason: "wrong_account" };

  return { ok: true, reason: "" };
}

/** The sentence each refusal deserves. Written out so all four platforms say
 *  the same thing, and so the strings can be translated once. */
const INVITATION_REFUSALS = {
  not_found: "This invitation link is not valid. Ask for a new one.",
  already_accepted: "This invitation has already been used.",
  revoked: "This invitation was withdrawn.",
  expired: "This invitation has expired. Ask for a new one.",
  no_email_on_account: "Your account has no email address, so this invitation cannot be matched to it.",
  wrong_account: "This invitation was sent to a different email address. Sign in with that address to accept it."
};

/** What a signed-out visitor may be told about an invitation: enough to decide
 *  whether to accept it, and nothing that identifies anybody else. */
function invitationPreview(invitation) {
  if (!invitation || typeof invitation !== "object") return null;
  return {
    companyName: String(invitation.companyName || "a NivaDesk workspace"),
    invitedByName: String(invitation.invitedByName || ""),
    email: normalizeInviteEmail(invitation.email),
    role: String(invitation.role || "member"),
    status: String(invitation.status || "pending").toLowerCase(),
    expiresAtMs: millisFrom(invitation.expiresAt)
  };
}

module.exports = {
  TOKEN_BYTES,
  INVITE_TTL_MS,
  INVITATION_REFUSALS,
  mintInvitationToken,
  invitationIdForToken,
  normalizeInviteEmail,
  isPlausibleEmail,
  invitationExpiresAtMs,
  millisFrom,
  invitationAcceptability,
  invitationPreview
};
