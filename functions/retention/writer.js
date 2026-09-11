"use strict";

// Retention wiring, the Firestore-bound part — every writer behind a flag that
// is OFF until the operator turns it on, and every one of them a no-op that
// says so when it is off.
//
//   NIVADESK_RETENTION_IN_APP=1   the in-app writer may write retentionMessages
//   NIVADESK_RETENTION_EMAIL=1    the founder/welcome e-mail may leave through SMTP
//   NIVADESK_RETENTION_INBOUND=1  the inbound endpoint accepts replies
//   NIVADESK_RETENTION_SWEEP=1    the scheduled sweep evaluates workspaces
//
// Layout, per workspace (companies/{cid}/…):
//   retention/state              { optOut, optOutAtMs, optOutSource, userRepliedAtMs, lastInboundAtMs,
//                                  supportCaseOpenAtMs, dismissals: [{campaign, atMs}] }
//   retentionLog/{campaign__channel}   one document per campaign and channel — the
//                                  duplicate control: a second attempt finds the first
//   retentionMessages/{id}       what the clients show (in-app)
//   retentionInbound/{id}        what came back (feedback, product insight)
// and one lookup the reply key resolves through: retentionReplyKeys/{key} → { companyId }.
//
// `db` is injected everywhere so the tests can hand in a fake; the shape used is
// deliberately small (doc get/set/update, collection get/add, runTransaction).

const { messageDecision, CAMPAIGN_GOALS } = require("../lifecycle/messaging");
const retention = require("../lifecycle/retention");

function retentionFlags(env = process.env) {
  const on = (name) => String(env[name] || "").trim() === "1";
  return {
    inApp: on("NIVADESK_RETENTION_IN_APP"),
    email: on("NIVADESK_RETENTION_EMAIL"),
    inbound: on("NIVADESK_RETENTION_INBOUND"),
    sweep: on("NIVADESK_RETENTION_SWEEP")
  };
}

const clean = (value, max) => String(value == null ? "" : value).trim().slice(0, max);
const logId = (campaign, channel) => `${clean(campaign, 60)}__${clean(channel, 20)}`;

function stateRef(db, companyId) { return db.collection("companies").doc(companyId).collection("retention").doc("state"); }
function logRef(db, companyId, campaign, channel) { return db.collection("companies").doc(companyId).collection("retentionLog").doc(logId(campaign, channel)); }
function messagesRef(db, companyId) { return db.collection("companies").doc(companyId).collection("retentionMessages"); }
function inboundRef(db, companyId) { return db.collection("companies").doc(companyId).collection("retentionInbound"); }
function replyKeyRef(db, key) { return db.collection("retentionReplyKeys").doc(clean(key, 40)); }

/** What messaging.js needs to know about this workspace before it decides. */
async function loadMessagingContext(db, companyId) {
  const [stateSnap, logSnap] = await Promise.all([
    stateRef(db, companyId).get(),
    db.collection("companies").doc(companyId).collection("retentionLog").get()
  ]);
  const state = stateSnap.exists ? stateSnap.data() || {} : {};
  const history = [];
  for (const doc of logSnap.docs || []) {
    const row = doc.data() || {};
    // Only what actually went out (or is on its way) counts against a cap; a
    // refused or dead attempt is not a message the person received.
    if (!["sent", "queued", "failed"].includes(String(row.status || ""))) continue;
    history.push({ campaign: String(row.campaign || ""), channel: String(row.channel || ""), kind: String(row.kind || ""), atMs: Number(row.atMs) || 0 });
  }
  return {
    history,
    dismissals: Array.isArray(state.dismissals) ? state.dismissals : [],
    unsubscribed: state.optOut === true,
    userReplied: Number(state.userRepliedAtMs) > 0,
    supportCaseOpen: Number(state.supportCaseOpenAtMs) > 0
  };
}

/**
 * Decide, and if allowed and the flag is on, write. One document per
 * (campaign, channel) is claimed inside a transaction, so two sweeps that race
 * cannot both send.
 *
 * @returns {{ send: boolean, reason: string, id?: string }}
 */
async function deliver(db, input = {}) {
  const { companyId, candidate, context, nowMs, flags, template, transport, unsubscribeUrl } = input;
  if (!companyId || !candidate || !candidate.campaign) return { send: false, reason: "no_campaign" };
  const decision = messageDecision({ campaign: candidate.campaign, channel: candidate.channel, kind: candidate.kind, nowMs }, context || {});
  if (!decision.send) return decision;
  const channel = String(candidate.channel || "in_app");
  const enabled = channel === "email" ? Boolean(flags && flags.email) : Boolean(flags && flags.inApp);
  if (!enabled) return { send: false, reason: "flag_off" };
  if (!template) return { send: false, reason: "no_template" };

  const ref = logRef(db, companyId, candidate.campaign, channel);
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return false;
    tx.set(ref, {
      companyId, campaign: candidate.campaign, channel, kind: String(candidate.kind || ""),
      status: "queued", atMs: nowMs, attempts: 0, nextAttemptAtMs: nowMs, lastError: "",
      reason: String(candidate.reason || "")
    });
    return true;
  });
  if (!claimed) return { send: false, reason: "already_sent" };

  if (channel === "in_app") {
    const message = await messagesRef(db, companyId).add({
      campaign: candidate.campaign, kind: String(candidate.kind || ""),
      title: template.title, body: template.body, action: template.action || "", target: template.target || null,
      createdAtMs: nowMs, status: "open"
    });
    await ref.update({ status: "sent", sentAtMs: nowMs, messageId: message.id });
    return { send: true, reason: "", id: message.id };
  }

  // E-mail: the outbox row carries the payload, then one attempt now; a failure
  // schedules the next attempt rather than losing the message.
  const replyKey = retention.newReplyKey();
  await replyKeyRef(db, replyKey).set({ companyId, campaign: candidate.campaign, createdAtMs: nowMs });
  await ref.update({
    payload: { to: input.to || "", subject: template.subject, text: template.text, html: template.html, fromName: template.fromName, replyTo: template.replyTo, replyKey, unsubscribeUrl: unsubscribeUrl || "" }
  });
  return attemptEmail(db, ref, { nowMs, transport });
}

/** One send attempt for an outbox row; bookkeeping either way. */
async function attemptEmail(db, ref, { nowMs, transport } = {}) {
  const snap = await ref.get();
  const row = snap.exists ? snap.data() || {} : {};
  const payload = row.payload || {};
  const attempts = (Number(row.attempts) || 0) + 1;
  if (!transport || typeof transport.sendMail !== "function") {
    await ref.update({ status: "failed", attempts, lastError: "no_transport", ...retention.outboxSchedule(attempts, nowMs) });
    return { send: false, reason: "no_transport", id: ref.id };
  }
  if (!payload.to) {
    await ref.update({ status: "dead", attempts, lastError: "no_recipient", nextAttemptAtMs: 0 });
    return { send: false, reason: "no_recipient", id: ref.id };
  }
  try {
    const info = await transport.sendMail({
      from: payload.fromName ? `${payload.fromName} <${transport.fromAddress || ""}>` : transport.fromAddress || "",
      to: payload.to, subject: payload.subject, text: payload.text, html: payload.html,
      replyTo: payload.replyKey && transport.replyDomain ? `retention+${payload.replyKey}@${transport.replyDomain}` : payload.replyTo,
      headers: payload.unsubscribeUrl ? { "List-Unsubscribe": `<${payload.unsubscribeUrl}>` } : undefined
    });
    await ref.update({ status: "sent", attempts, sentAtMs: nowMs, providerId: String((info && info.messageId) || ""), lastError: "", nextAttemptAtMs: 0 });
    return { send: true, reason: "", id: ref.id };
  } catch (error) {
    const schedule = retention.outboxSchedule(attempts, nowMs);
    await ref.update({ status: schedule.dead ? "dead" : "failed", attempts, lastError: clean(error && error.message, 300), nextAttemptAtMs: schedule.nextAttemptAtMs });
    return { send: false, reason: schedule.dead ? "dead" : "retry_scheduled", id: ref.id };
  }
}

/** Retry the outbox rows the caller found due (status failed, nextAttemptAtMs ≤ now). */
async function retryOutboxEntries(db, refs, { nowMs, flags, transport } = {}) {
  if (!flags || !flags.email) return { skipped: "flag_off", attempted: 0 };
  let attempted = 0, sent = 0;
  for (const ref of refs || []) {
    attempted += 1;
    const result = await attemptEmail(db, ref, { nowMs, transport });
    if (result.send) sent += 1;
  }
  return { attempted, sent };
}

/** A reply came in: the person is talking to a person now, so automation stops. */
async function applyInboundReply(db, parsed, { nowMs } = {}) {
  if (!parsed || !parsed.replyKey) return { ok: false, reason: "no_reply_key" };
  const keySnap = await replyKeyRef(db, parsed.replyKey).get();
  if (!keySnap.exists) return { ok: false, reason: "unknown_reply_key" };
  const companyId = String((keySnap.data() || {}).companyId || "");
  if (!companyId) return { ok: false, reason: "unknown_reply_key" };
  if (parsed.kind === "bounce" || parsed.kind === "unknown") {
    await inboundRef(db, companyId).add({ kind: parsed.kind, subject: parsed.subject || "", receivedAtMs: nowMs });
    return { ok: true, companyId, kind: parsed.kind, suppressed: false };
  }
  const state = stateRef(db, companyId);
  const current = (await state.get());
  const data = current.exists ? current.data() || {} : {};
  const patch = { lastInboundAtMs: nowMs };
  // An auto-reply is not the person: it does not stop the sequence, only gets noted.
  if (parsed.kind === "reply" || parsed.kind === "unsubscribe") patch.userRepliedAtMs = Number(data.userRepliedAtMs) || nowMs;
  if (parsed.kind === "unsubscribe") { patch.optOut = true; patch.optOutAtMs = nowMs; patch.optOutSource = "reply"; }
  await state.set({ ...data, ...patch }, { merge: true });
  await inboundRef(db, companyId).add({ kind: parsed.kind, fromEmail: parsed.fromEmail || "", subject: parsed.subject || "", text: parsed.text || "", receivedAtMs: nowMs, replyKey: parsed.replyKey });
  return { ok: true, companyId, kind: parsed.kind, suppressed: parsed.kind !== "auto_reply" };
}

async function setOptOut(db, companyId, value, { nowMs, source } = {}) {
  const ref = stateRef(db, companyId);
  const snap = await ref.get();
  const data = snap.exists ? snap.data() || {} : {};
  await ref.set({ ...data, optOut: value === true, optOutAtMs: value === true ? nowMs : 0, optOutSource: value === true ? clean(source, 40) : "" }, { merge: true });
  return { ok: true, optOut: value === true };
}

/**
 * Close an open message. `outcome` "dismissed" (the default) records a
 * dismissal, which messaging.js turns into the 30-day cooldown for that
 * campaign; "acted" means the person did what the card asked — the card goes
 * away, and nothing is held against the campaign.
 */
async function dismissMessage(db, companyId, messageId, { nowMs, outcome } = {}) {
  const ref = messagesRef(db, companyId).doc(clean(messageId, 80));
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "not_found" };
  const message = snap.data() || {};
  const closed = outcome === "acted" ? "acted" : "dismissed";
  await ref.update(closed === "acted" ? { status: "acted", closedAtMs: nowMs, actedAtMs: nowMs } : { status: "dismissed", closedAtMs: nowMs, dismissedAtMs: nowMs });
  if (closed === "acted") return { ok: true, status: "acted" };
  const state = stateRef(db, companyId);
  const current = await state.get();
  const data = current.exists ? current.data() || {} : {};
  const dismissals = (Array.isArray(data.dismissals) ? data.dismissals : []).filter((d) => d && d.campaign).slice(-50);
  dismissals.push({ campaign: String(message.campaign || ""), atMs: nowMs });
  await state.set({ ...data, dismissals }, { merge: true });
  return { ok: true, status: "dismissed" };
}

/**
 * One workspace, one pass: what is it due, what may go, what went. With every
 * flag off this is a dry run that returns the decisions and writes nothing —
 * which is exactly what the operator reads before turning anything on.
 */
async function sweepWorkspace(db, input = {}) {
  const { companyId, nowMs, flags, trigger, contextLoader, templateContext, transport, unsubscribeUrl, to, holdInApp, holdReason } = input;
  const candidates = retention.triggerCandidates(trigger || {});
  if (!candidates.length) return { companyId, candidates: [], decisions: [] };
  const context = contextLoader ? await contextLoader(companyId) : await loadMessagingContext(db, companyId);
  const decisions = [];
  const taken = new Set();
  for (const candidate of candidates) {
    // Another system's card is on the person's screen (a feedback prompt, say):
    // the nudge waits for the next sweep rather than stacking on top of it.
    if (holdInApp && candidate.channel === "in_app") { decisions.push({ campaign: candidate.campaign, channel: candidate.channel, send: false, reason: String(holdReason || "held") }); continue; }
    if (taken.has(candidate.channel)) { decisions.push({ campaign: candidate.campaign, channel: candidate.channel, send: false, reason: "channel_taken_this_pass" }); continue; }
    const template = retention.renderTemplate(candidate.campaign, { ...(templateContext || {}), target: (trigger && trigger.firstOrder && trigger.firstOrder.shellId) ? { orderId: trigger.firstOrder.shellId } : null, unsubscribeUrl });
    const result = await deliver(db, { companyId, candidate, context, nowMs, flags, template, transport, unsubscribeUrl, to });
    decisions.push({ campaign: candidate.campaign, channel: candidate.channel, ...result });
    if (result.send) {
      taken.add(candidate.channel);
      context.history.push({ campaign: candidate.campaign, channel: candidate.channel, kind: candidate.kind, atMs: nowMs });
    }
  }
  return { companyId, candidates, decisions };
}


/**
 * Re-judge the workspace's open cards at the moment someone would see them.
 * A card written yesterday is not owed to the person today: if its goal has
 * been met since (the shell became a real project, the store got connected),
 * the workspace opted out, cancelled or activated, the card is **withdrawn** —
 * persisted, final, and never a dismissal. If a support case is open or a
 * feedback prompt was shown or answered in the last day, the card is **held**:
 * nothing is written, nothing is shown, the next look decides again.
 *
 * Clicking a card ("acted") changes none of this — activation and completion
 * are read from the workspace's data, never from a click.
 *
 * @returns {{ message: object|null, held: string, withdrawn: {id: string, reason: string}[] }}
 */
async function reviewOpenMessages(db, companyId, input = {}) {
  const nowMs = Number(input.nowMs) || Date.now();
  const context = input.context || {};
  const done = new Set(Array.isArray(input.doneEventNames) ? input.doneEventNames.map((name) => String(name || "")) : []);
  const messages = (Array.isArray(input.messages) ? input.messages : []).filter((m) => m && m.id && String(m.status || "open") === "open")
    .sort((a, b) => (Number(b.createdAtMs) || 0) - (Number(a.createdAtMs) || 0));
  const withdrawn = [];
  const withdraw = async (message, reason) => {
    await messagesRef(db, companyId).doc(String(message.id)).update({ status: "withdrawn", closedAtMs: nowMs, withdrawnAtMs: nowMs, withdrawReason: reason });
    withdrawn.push({ id: String(message.id), reason });
  };
  let held = "";
  let chosen = null;
  for (const message of messages) {
    const campaign = String(message.campaign || "");
    const goals = CAMPAIGN_GOALS[campaign] || [];
    if (context.unsubscribed === true || context.optOut === true) { await withdraw(message, "opt_out"); continue; }
    if (context.workspaceCancelled === true) { await withdraw(message, "workspace_cancelled"); continue; }
    if (goals.some((name) => done.has(name))) { await withdraw(message, "goal_met"); continue; }
    if (context.activated === true && String(message.kind || "") === "onboarding") { await withdraw(message, "activated"); continue; }
    if (chosen) continue;   // only the newest surviving card is shown; older ones stay open for a later look
    if (context.supportCaseOpen === true) { held = held || "support_case_open"; continue; }
    if (input.feedbackRecent === true) { held = held || "feedback_prompt_recent"; continue; }
    chosen = message;
  }
  return { message: chosen, held: chosen ? "" : held, withdrawn };
}

/** A support case is open while any ticket of the workspace is open, in progress or waiting for the user. */
const OPEN_TICKET_STATUSES = new Set(["open", "inProgress", "waitingForUser"]);
function supportCaseOpenFrom(statuses) {
  return (Array.isArray(statuses) ? statuses : []).some((s) => OPEN_TICKET_STATUSES.has(String(s || "")));
}

/**
 * The support-case stamp the ticket paths keep current (`supportCaseOpenAtMs`), read back by
 * `loadMessagingContext` as `supportCaseOpen` — the suppression that stops a nudge from landing on
 * someone who is already talking to support. Idempotent: an open case is not re-stamped, a closed one
 * is not re-cleared, so the ticket paths may call it after every change.
 */
async function markSupportCase(db, companyId, { open, nowMs = Date.now() } = {}) {
  if (!companyId) return { ok: false, reason: "no_company" };
  const ref = stateRef(db, companyId);
  const snap = await ref.get();
  const current = Number(((snap.exists && snap.data()) || {}).supportCaseOpenAtMs) || 0;
  if (open && current > 0) return { ok: true, changed: false, supportCaseOpenAtMs: current };
  if (!open && current === 0) return { ok: true, changed: false, supportCaseOpenAtMs: 0 };
  const supportCaseOpenAtMs = open ? nowMs : 0;
  await ref.set({ supportCaseOpenAtMs }, { merge: true });
  return { ok: true, changed: true, supportCaseOpenAtMs };
}

module.exports = {
  retentionFlags, loadMessagingContext, deliver, attemptEmail, retryOutboxEntries,
  applyInboundReply, setOptOut, dismissMessage, sweepWorkspace, markSupportCase, supportCaseOpenFrom, reviewOpenMessages,
  stateRef, logRef, messagesRef, inboundRef, replyKeyRef
};
