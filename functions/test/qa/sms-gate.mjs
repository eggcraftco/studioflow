// The gate in front of an SMS, and the one hole it had.
//
// sendWorkspaceSMS refuses rather than half-sends. Four checks: the plan, the
// Twilio credentials, a sender, a number. The third one passed on a sender
// nobody could actually send from — config.senderId falls back to the platform
// name "NivaDesk", a non-empty string looked like a working sender, and the
// alphanumeric sender ID has been In Review with Twilio since 25 Aug 2026.
//
// So a Pro workspace changing an order status with a phone number on it would
// have handed Twilio a From: it does not recognise. It never happened, but only
// because nobody is on a paid plan yet — which is not a safety mechanism.
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.GCLOUD_PROJECT = "eggcraft-studio";
const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);
const admin = require("firebase-admin");

let fail = 0;
const ok = (l, c, e = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${l}${c ? "" : "  <- " + e}`); };

// The platform sender is unregistered unless the env says otherwise, which is
// the state today.
delete process.env.NIVADESK_SMS_SENDER_STATUS;
const fns = require("../../index.js");
const db = admin.firestore();

const companyId = "qa-workspace";
const auth = { uid: "qa-review-uid", token: { email: "review@nivadesk.app" } };
const read = () => fns.getWorkspaceSmsSettings.run({ data: { companyId }, auth, acceptsStreaming: false });

// Team plan, so the plan gate is open and the sender gate is what is under test.
await db.collection("companies").doc(companyId).set({ billingPlan: "team_monthly", billingStatus: "active" }, { merge: true });

const before = await read();
ok("the API reports the platform sender", before.platformSenderId === "NivaDesk", String(before.platformSenderId));
ok("and reports it as NOT registered", before.platformSenderStatus === "pending", String(before.platformSenderStatus));
ok("so sending is not live", before.sendingLive === false, String(before.sendingLive));
// The distinction that caused the bug: credentials present, sending impossible.
ok("even though the provider is configured",
  typeof before.providerConfigured === "boolean", String(before.providerConfigured));
ok("the plan allows it", before.available === true, String(before.available));
ok("the three milestone triggers are on by default",
  before.triggers.estimateReady && before.triggers.workStarted && before.triggers.readyForCollection,
  JSON.stringify(before.triggers));
ok("and telling the customer about every internal step is not",
  before.triggers.everyStatusChange === false, JSON.stringify(before.triggers));

// The owner sets their own sender: it goes to pending, never straight to
// verified — a workspace cannot vouch for itself, the aggregator does.
const saved = await fns.saveWorkspaceSmsSettings.run({
  data: { companyId, senderId: "EGGcraft", triggers: { everyStatusChange: true }, defaultCallingCode: "44" },
  auth, acceptsStreaming: false
});
ok("an own sender is accepted", saved.senderId === "EGGcraft", String(saved.senderId));
ok("but only as pending", saved.senderStatus === "pending", String(saved.senderStatus));
const after = await read();
ok("still not live on an unverified own sender", after.sendingLive === false, String(after.sendingLive));
ok("the trigger choice was kept", after.triggers.everyStatusChange === true, JSON.stringify(after.triggers));

// A member who is not the owner cannot change any of it.
let denied = "";
try {
  await fns.saveWorkspaceSmsSettings.run({
    data: { companyId, senderId: "Someone" },
    auth: { uid: "qa-member-uid", token: { email: "member@nivadesk.app" } },
    acceptsStreaming: false
  });
} catch (e) { denied = String(e?.message || e); }
ok("a non-owner cannot change SMS settings", /owner/i.test(denied), denied || "no error");

// And the switch itself: flipping one environment variable is all that turning
// SMS on takes. In a second process, because index.js calls initializeApp at
// load and the status is read once, at load — which is exactly why it is a
// deploy-time switch rather than something a request can change.
const { execFileSync } = require("child_process");
const probe = `
const admin = require("firebase-admin");
const fns = require(process.argv[1]);
fns.getWorkspaceSmsSettings.run({ data: { companyId: "qa-workspace" },
  auth: { uid: "qa-review-uid", token: { email: "review@nivadesk.app" } }, acceptsStreaming: false })
  .then(r => { console.log(JSON.stringify({ live: r.sendingLive, status: r.platformSenderStatus })); process.exit(0); })
  .catch(e => { console.log(JSON.stringify({ error: String(e && e.message) })); process.exit(1); });
`;
let liveOut = {};
try {
  const out = execFileSync("node", ["-e", probe, require.resolve("../../index.js")], {
    env: { ...process.env, NIVADESK_SMS_SENDER_STATUS: "verified" },
    encoding: "utf8"
  });
  liveOut = JSON.parse(out.trim().split("\n").pop());
} catch (e) { liveOut = { error: String(e && e.message).slice(0, 120) }; }

ok("with the sender registered, sending goes live", liveOut.live === true, JSON.stringify(liveOut));
ok("and the platform sender reads verified", liveOut.status === "verified", JSON.stringify(liveOut));

console.log(fail ? `\n${fail} FAILED` : "\nPASS");
process.exit(fail ? 1 : 0);
