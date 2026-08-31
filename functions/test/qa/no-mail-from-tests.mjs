// No test run may send a real email.
//
// This exists because they did, for a whole evening, to a real phone.
//
// The Firebase emulators emulate Firestore, Auth and the functions runtime.
// They do not emulate the internet — and `firebase emulators:start` FETCHES
// real secret values from Secret Manager for the functions that declare them.
// So the functions emulator held the real SMTP password and opened a real
// connection to Hostinger. ticket-dedupe.mjs calls createSupportTicket twice by
// design, because it is testing deduplication; the day these suites were made
// runnable again, every integration run delivered
// "[NivaDesk Support] Uygulama çöküyor — My Studio", from the seeded QA user,
// to the owner's inbox.
//
// The tickets were only ever in the emulator. The emails were real.
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.GCLOUD_PROJECT = "eggcraft-studio";
const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);

let fail = 0;
const ok = (l, c, e = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${l}${c ? "" : "  <- " + e}`); };

const nodemailer = require("nodemailer");
const realCreate = nodemailer.createTransport;
let realRequested = 0;
nodemailer.createTransport = () => { realRequested += 1; throw new Error("real SMTP transport requested"); };

const fns = require("../../index.js");
const transport = fns._nvMailTransport;
ok("the guarded transport is reachable", typeof transport === "function", typeof transport);

// The behaviour, not the wording: with the emulator host set, asking for a
// transport must not reach nodemailer at all.
const captured = [];
const log = console.log;
console.log = (...a) => { const l = a.map(String).join(" "); if (l.includes("mail suppressed")) captured.push(l); else log(...a); };
const t = transport({ host: "smtp.hostinger.com", port: 465, secure: true, auth: { user: "x", pass: "y" } });
const result = await t.sendMail({ to: "contact@nivadesk.co.uk", subject: "probe", text: "no" });
console.log = log;

ok("no real SMTP transport was created", realRequested === 0, `${realRequested} istendi`);
ok("sendMail resolved instead of throwing", Boolean(result), JSON.stringify(result));
ok("it reported the suppression", captured.length === 1, JSON.stringify(captured));
ok("and named the recipient it withheld", /contact@nivadesk\.co\.uk/.test(captured[0] || ""), captured[0] || "");

// The other half: without the emulator host this MUST hand back a real
// transport, or the guard would have quietly disabled email in production.
delete process.env.FIRESTORE_EMULATOR_HOST;
let askedForReal = false;
try { transport({ host: "smtp.example.com", port: 465 }); } catch { askedForReal = true; }
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
ok("outside the emulator it still asks for a real transport", askedForReal, "guard would disable production email");

// The other two channels that leave the building. Mail was the one that
// actually escaped, but SMS costs money and arrives on a customer's phone, and
// push buzzes whoever's device tokens are in the database — and the order
// status trigger that sends SMS fires in the emulator like any other trigger.
{
  const captured2 = [];
  const log2 = console.log;
  console.log = (...a) => { const l = a.map(String).join(" "); if (l.includes("suppressed")) captured2.push(l); else log2(...a); };

  const provider = fns._nvMessagingProvider && fns._nvMessagingProvider();
  let smsResult = null;
  if (provider && typeof provider.sendSMS === "function") {
    smsResult = await provider.sendSMS({ to: "+447700900123", from: "NivaDesk", body: "probe" });
  }
  console.log = log2;

  ok("SMS is suppressed under the emulator",
    Boolean(provider) && smsResult && smsResult.status === "suppressed", JSON.stringify(smsResult));
  ok("and it says which number it withheld",
    captured2.some((l) => /SMS to \+447700900123/.test(l)), JSON.stringify(captured2));
}

nodemailer.createTransport = realCreate;
console.log(fail ? `\n${fail} FAILED` : "\nPASS");
process.exit(fail ? 1 : 0);
