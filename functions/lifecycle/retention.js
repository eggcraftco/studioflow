"use strict";

// Retention wiring, the pure part.
//
// Four questions, each answered without Firestore, a clock or a network:
//   which message is a workspace due (triggerCandidates),
//   what does it say (renderTemplate),
//   what does an inbound reply mean (parseInboundReply),
//   when is a failed send tried again (outboxSchedule),
// plus the tokens that let an e-mail carry an unsubscribe link and a reply key
// without a database lookup on the way in.
//
// Whether a message MAY be sent is messaging.js's question (caps, goals met,
// dismissals, opt-out, user_replied); this file never decides that, it only
// proposes. Spec: NivaDesk_Native_Onboarding_Feedback_Retention_AI_Spec.md
// §21-§24, §62, §69, §70, as carried by the 9 Sep 2026 status document §9-§11.
//
// Every timing is configuration (§65): a hard-coded "12 hours" is the kind of
// number that is right in August and wrong in December.

const crypto = require("crypto");

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const DEFAULT_TIMINGS = Object.freeze({
  // §9.1: "within minutes of signup, if possible" — and not after a fortnight,
  // because a welcome two months late is not a welcome.
  founderIntroAfterMs: 10 * MINUTE_MS,
  founderIntroWithinMs: 14 * DAY_MS,
  // §9.4: setup or integration not completed, ≥ ~12h since the trigger.
  setupReminderAfterMs: 12 * HOUR_MS,
  firstOrderReminderAfterMs: 24 * HOUR_MS,
  shellReminderAfterMs: 24 * HOUR_MS,
  // A workspace quiet for a month is the recovery engine's concern, not a nudge's.
  reminderSilenceMs: 30 * DAY_MS
});

/**
 * The campaigns this wiring can propose, with the channel and kind the
 * decision engine caps them by. `founder` is not `onboarding`: the founder note
 * is a person writing, and activation does not cancel it.
 */
const CAMPAIGNS = Object.freeze({
  founder_intro: { channel: "email", kind: "founder", priority: 0 },
  finish_onboarding: { channel: "in_app", kind: "onboarding", priority: 1 },
  connect_first_store: { channel: "in_app", kind: "onboarding", priority: 2 },
  connect_bank: { channel: "in_app", kind: "onboarding", priority: 3 },
  complete_first_order: { channel: "in_app", kind: "onboarding", priority: 4 },
  create_first_order: { channel: "in_app", kind: "onboarding", priority: 5 }
});

const num = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0);

function latestEvent(events, name) {
  let at = 0;
  for (const event of Array.isArray(events) ? events : []) {
    if (!event || String(event.name || "") !== name) continue;
    const atMs = num(event.atMs);
    if (atMs > at) at = atMs;
  }
  return at;
}

function lastActivity(events, signedUpAtMs) {
  let at = num(signedUpAtMs);
  for (const event of Array.isArray(events) ? events : []) {
    const atMs = num(event && event.atMs);
    if (atMs > at) at = atMs;
  }
  return at;
}

/**
 * Which messages a workspace is due, in priority order. Proposals only: the
 * caller runs each through messageDecision and the first that may be sent
 * per channel is the one that goes.
 *
 * @param {object} input {
 *   nowMs, signedUpAtMs, path, state, events: [{name, atMs}],
 *   firstOrder: { state: "none"|"shell"|"substantive", shellId?, shellAtMs? },
 *   timings?: partial DEFAULT_TIMINGS
 * }
 * @returns {{campaign: string, channel: string, kind: string, reason: string}[]}
 */
function triggerCandidates(input = {}) {
  const timings = { ...DEFAULT_TIMINGS, ...(input.timings || {}) };
  const nowMs = num(input.nowMs);
  const signedUpAtMs = num(input.signedUpAtMs);
  if (!nowMs || !signedUpAtMs || signedUpAtMs > nowMs) return [];

  const events = Array.isArray(input.events) ? input.events : [];
  const has = (name) => events.some((event) => event && String(event.name || "") === name);
  const path = String(input.path || "general");
  const state = String(input.state || "");
  const firstOrder = input.firstOrder && typeof input.firstOrder === "object" ? input.firstOrder : { state: "none" };
  const out = [];
  const propose = (campaign, reason) => out.push({ campaign, ...CAMPAIGNS[campaign], reason });

  // The founder note goes to everybody once, on time or not at all.
  const sinceSignup = nowMs - signedUpAtMs;
  if (sinceSignup >= timings.founderIntroAfterMs && sinceSignup <= timings.founderIntroWithinMs) {
    propose("founder_intro", "signed_up");
  }

  // Nudges stop for a cancelled workspace and for one that has gone quiet for a
  // month: the first is over, the second is a recovery question.
  if (state === "churned") return out;
  if (nowMs - lastActivity(events, signedUpAtMs) > timings.reminderSilenceMs) return out;

  const onboardingDone = has("onboarding_completed") || has("onboarding_skipped");
  const onboardingAt = Math.max(latestEvent(events, "onboarding_started"), signedUpAtMs);
  if (!onboardingDone) {
    if (nowMs - onboardingAt >= timings.setupReminderAfterMs) propose("finish_onboarding", "onboarding_not_finished");
    // Before the wizard is finished nothing else is asked for: the path is not known yet.
    return out.sort((a, b) => a.priority - b.priority);
  }

  const completedAt = Math.max(latestEvent(events, "onboarding_completed"), latestEvent(events, "onboarding_skipped"), signedUpAtMs);
  const sinceCompleted = nowMs - completedAt;

  if (path === "commerce" && !has("integration_connected") && !has("external_order_imported") && sinceCompleted >= timings.setupReminderAfterMs) {
    propose("connect_first_store", "no_store_connected");
  }
  if (path === "finance" && !has("bank_connected") && sinceCompleted >= timings.setupReminderAfterMs) {
    propose("connect_bank", "no_bank_connected");
  }
  if (path !== "commerce") {
    if (firstOrder.state === "shell") {
      const shellAt = num(firstOrder.shellAtMs);
      if (!shellAt || nowMs - shellAt >= timings.shellReminderAfterMs) propose("complete_first_order", "first_order_is_a_shell");
    } else if (firstOrder.state === "none" && (path === "bespoke_studio" || path === "general") && sinceCompleted >= timings.firstOrderReminderAfterMs) {
      propose("create_first_order", "no_order_yet");
    }
  }
  return out.sort((a, b) => a.priority - b.priority);
}

// ---- templates ---------------------------------------------------------------

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const clean = (value, max) => String(value == null ? "" : value).replace(/[\r\n\t]+/g, " ").trim().slice(0, max);

/**
 * The words. English only tonight; the `language` argument is the seam the
 * translation tables plug into (the checklist copy shows how), and the gap is
 * recorded in docs/onboarding/retention-wiring-2026-09-10.md.
 *
 * @returns for in_app: { title, body, action, target }
 *          for email:  { subject, text, html, fromName, replyTo }
 */
function renderTemplate(campaign, context = {}) {
  const name = clean(context.firstName, 60);
  const workspace = clean(context.workspaceName, 80) || "your workspace";
  const appUrl = clean(context.appUrl, 200) || "https://nivadesk.app";
  const founder = clean(context.founderName, 80) || "Gunes from NivaDesk";
  const replyTo = clean(context.replyTo, 200) || "contact@eggcraft.co.uk";
  const hello = name ? `Hi ${name},` : "Hi,";
  switch (campaign) {
    case "founder_intro": {
      const unsubscribe = clean(context.unsubscribeUrl, 400);
      const text = [
        hello,
        "",
        "I'm Gunes, I build NivaDesk. Thanks for setting up " + workspace + ".",
        "",
        "One question, if you have a minute: what were you hoping NivaDesk would take off your plate? Just reply to this e-mail — it comes straight to me, and the answer shapes what I build next.",
        "",
        "If something is in your way already, tell me and I'll help.",
        "",
        "Gunes",
        "NivaDesk — " + appUrl,
        "",
        unsubscribe ? "Don't want these notes? " + unsubscribe : ""
      ].join("\n").replace(/\n+$/, "\n");
      const html = [
        '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1c1c1e">',
        `<p>${escapeHtml(hello)}</p>`,
        `<p>I'm Gunes, I build NivaDesk. Thanks for setting up <strong>${escapeHtml(workspace)}</strong>.</p>`,
        "<p>One question, if you have a minute: what were you hoping NivaDesk would take off your plate? Just reply to this e-mail — it comes straight to me, and the answer shapes what I build next.</p>",
        "<p>If something is in your way already, tell me and I'll help.</p>",
        `<p>Gunes<br>NivaDesk — <a href="${escapeHtml(appUrl)}">${escapeHtml(appUrl)}</a></p>`,
        unsubscribe ? `<p style="color:#6b6b70;font-size:13px">Don't want these notes? <a href="${escapeHtml(unsubscribe)}">Unsubscribe</a></p>` : "",
        "</div>"
      ].join("");
      return { subject: "Quick question about " + workspace, text, html, fromName: founder, replyTo };
    }
    case "finish_onboarding":
      return { title: "Finish setting up", body: "Two more answers and NivaDesk knows what to show you first.", action: "setup", target: null };
    case "connect_first_store":
      return { title: "Connect your first sales channel", body: "Shopify, Etsy, WooCommerce or Square — orders then arrive on their own.", action: "integrations", target: null };
    case "connect_bank":
      return { title: "Connect your bank", body: "Read-only. NivaDesk can never move money.", action: "bank", target: null };
    case "complete_first_order": {
      const orderId = clean(context.target && context.target.orderId, 200);
      return { title: "Complete your first project", body: "You started one — add the customer, what it is worth or what it contains, and it counts.", action: "open_order", target: orderId ? { orderId } : null };
    }
    case "create_first_order":
      return { title: "Create your first project", body: "One real job, so the board has something to hold.", action: "new_order", target: null };
    default:
      return null;
  }
}

// ---- inbound replies -----------------------------------------------------------

const UNSUBSCRIBE_WORDS = /^\s*(stop|unsubscribe|remove me|opt ?out|no more e-?mails?)\b/i;
const AUTO_REPLY_SUBJECT = /\b(out of (the )?office|auto(matic)?[- ]?reply|automatic response|autoreply|away from (my )?(desk|office)|vacation|on leave|abwesenheit|abwesend|otomatik (yanıt|cevap))\b/i;
const BOUNCE_FROM = /^(mailer-daemon|postmaster|no-?reply|donotreply|bounce)/i;

function headerValue(headers, name) {
  if (!headers || typeof headers !== "object") return "";
  const wanted = String(name).toLowerCase();
  for (const key of Object.keys(headers)) {
    if (String(key).toLowerCase() === wanted) return clean(headers[key], 500);
  }
  return "";
}

function addressOf(value) {
  const raw = String(value == null ? "" : value);
  const angle = raw.match(/<([^>]+)>/);
  const candidate = (angle ? angle[1] : raw).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) && candidate.length <= 254 ? candidate : "";
}

/** The reply key an outbound e-mail carried: `retention+<key>@…` on the address, or `[NV-<key>]` in the subject. */
function replyKeyOf(to, subject) {
  for (const address of String(to == null ? "" : to).split(",")) {
    const match = addressOf(address).match(/^retention\+([a-z0-9]{8,40})@/);
    if (match) return match[1];
  }
  const inSubject = String(subject == null ? "" : subject).match(/\[NV-([A-Za-z0-9]{8,40})\]/);
  return inSubject ? inSubject[1].toLowerCase() : "";
}

/** The person's own words: quoted history and signature lines dropped, length bounded. */
function strippedReplyText(text) {
  const lines = String(text == null ? "" : text).replace(/\r\n?/g, "\n").split("\n");
  const kept = [];
  for (const line of lines) {
    if (/^\s*>/.test(line)) continue;
    if (/^\s*On .+wrote:\s*$/.test(line) || /^\s*-{2,}\s*Original Message\s*-{2,}/i.test(line) || /^\s*From:\s.+$/.test(line) && kept.length) break;
    if (/^\s*--\s*$/.test(line)) break;
    kept.push(line);
  }
  return kept.join("\n").trim().slice(0, 4000);
}

/**
 * What an inbound message means for the lifecycle.
 *
 * @param {object} message { from, to, subject, text, headers?, receivedAtMs? }
 * @returns {{ kind: "reply"|"auto_reply"|"bounce"|"unsubscribe"|"unknown", replyKey, fromEmail, text, subject }}
 */
function parseInboundReply(message = {}) {
  const fromEmail = addressOf(message.from);
  const subject = clean(message.subject, 300);
  const replyKey = replyKeyOf(message.to, subject);
  const text = strippedReplyText(message.text);
  const autoSubmitted = headerValue(message.headers, "auto-submitted").toLowerCase();
  const precedence = headerValue(message.headers, "precedence").toLowerCase();
  let kind = "reply";
  if (!fromEmail || BOUNCE_FROM.test(fromEmail.split("@")[0])) kind = "bounce";
  else if ((autoSubmitted && autoSubmitted !== "no") || precedence === "bulk" || precedence === "auto_reply" || AUTO_REPLY_SUBJECT.test(subject)) kind = "auto_reply";
  else if (UNSUBSCRIBE_WORDS.test(text) || UNSUBSCRIBE_WORDS.test(subject)) kind = "unsubscribe";
  else if (!text) kind = "unknown";
  return { kind, replyKey, fromEmail, text, subject };
}

// ---- the outbox ------------------------------------------------------------------

const DEFAULT_BACKOFF_MS = Object.freeze([5 * MINUTE_MS, 30 * MINUTE_MS, 2 * HOUR_MS, 12 * HOUR_MS]);

/**
 * When a send that just failed is tried again, or that it is not.
 * @param {number} attempts  how many attempts have been made, counting the one that just failed
 */
function outboxSchedule(attempts, nowMs, options = {}) {
  const made = Math.max(0, Math.floor(Number(attempts) || 0));
  const backoff = Array.isArray(options.backoffMs) && options.backoffMs.length ? options.backoffMs : DEFAULT_BACKOFF_MS;
  const maxAttempts = Number(options.maxAttempts) || backoff.length + 1;
  if (made >= maxAttempts) return { retry: false, dead: true, nextAttemptAtMs: 0 };
  const wait = backoff[Math.min(made - 1, backoff.length - 1)] || backoff[0];
  return { retry: true, dead: false, nextAttemptAtMs: num(nowMs) + wait };
}

// ---- tokens ---------------------------------------------------------------------------

function retentionToken(secret, companyId, purpose = "unsubscribe") {
  const key = String(secret || "");
  const subject = String(companyId || "");
  if (!key || !subject) return "";
  return crypto.createHmac("sha256", key).update(`${purpose}:${subject}`).digest("base64url").slice(0, 32);
}

function verifyRetentionToken(secret, companyId, token, purpose = "unsubscribe") {
  const expected = retentionToken(secret, companyId, purpose);
  const given = String(token || "");
  if (!expected || given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}

function newReplyKey(randomBytes = crypto.randomBytes) {
  return randomBytes(12).toString("base64url").replace(/[^a-z0-9]/gi, "").toLowerCase().padEnd(16, "0").slice(0, 16);
}

// ---- who may be swept at all ------------------------------------------------

const INTERNAL_DOMAINS = Object.freeze(["nivadesk.co.uk", "eggcraft.co.uk"]);

function parseList(raw) {
  return String(raw == null ? "" : raw).split(",").map((item) => item.trim()).filter(Boolean);
}

/**
 * Whether the sweep may consider a workspace. The pilot list works like the
 * feedback one: unset or empty means nobody, "*" means every workspace,
 * otherwise the exact ids. The exclude list and the internal rule win over
 * "*": a test workspace or our own company never receives a nudge or a founder
 * note, even though the activation funnel counts it.
 *
 * @param {object} input { companyId, ownerEmail, pilotList, excludeList, adminEmails, internalDomains? }
 * @returns {{allowed: boolean, reason: string}}
 */
function workspaceScope(input = {}) {
  const companyId = String(input.companyId || "").trim();
  if (!companyId) return { allowed: false, reason: "no_company" };
  if (new Set(parseList(input.excludeList)).has(companyId)) return { allowed: false, reason: "excluded_workspace" };
  const email = String(input.ownerEmail || "").trim().toLowerCase();
  const domain = email.includes("@") ? email.split("@").pop() : "";
  const admins = new Set(parseList(input.adminEmails).map((item) => item.toLowerCase()));
  const domains = new Set((Array.isArray(input.internalDomains) ? input.internalDomains : INTERNAL_DOMAINS).map((item) => String(item).toLowerCase()));
  if (email && (admins.has(email) || domains.has(domain))) return { allowed: false, reason: "internal_owner" };
  const pilot = parseList(input.pilotList);
  if (!pilot.length) return { allowed: false, reason: "not_in_pilot" };
  if (pilot.includes("*") || pilot.includes(companyId)) return { allowed: true, reason: "" };
  return { allowed: false, reason: "not_in_pilot" };
}

/**
 * True when the workspace owner saw or answered a feedback prompt inside the
 * window (a day by default): the in-app nudge then waits for the next sweep,
 * so two cards from two systems never stack on one screen.
 */
function feedbackPromptRecent(state, nowMs, windowMs = DAY_MS) {
  const now = num(nowMs);
  if (!now) return false;
  const shows = Array.isArray(state && state.shows) ? state.shows : [];
  const submissions = Array.isArray(state && state.submissions) ? state.submissions : [];
  return [...shows, ...submissions].some((entry) => {
    const at = num(entry && entry.atMs);
    return at > 0 && now - at >= 0 && now - at < windowMs;
  });
}

module.exports = {
  workspaceScope, feedbackPromptRecent, INTERNAL_DOMAINS,
  DEFAULT_RETENTION_TIMINGS: DEFAULT_TIMINGS, RETENTION_CAMPAIGNS: CAMPAIGNS, DEFAULT_BACKOFF_MS,
  triggerCandidates, renderTemplate, parseInboundReply, strippedReplyText, replyKeyOf,
  outboxSchedule, retentionToken, verifyRetentionToken, newReplyKey
};
