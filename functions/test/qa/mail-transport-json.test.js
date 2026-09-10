// The mail path on the installed nodemailer, with nothing leaving the machine.
//
// The five mail helpers all go through nvMailTransport(options) →
// nodemailer.createTransport(options) and then transporter.sendMail({ from,
// to, replyTo, subject, text, html, attachments }). The suites never open
// that transport (no SMTP password → the helpers return first; the emulator
// host → a suppressed stub), so a nodemailer version bump was never actually
// exercised by a test. This one exercises it: createTransport is swapped for a
// jsonTransport — nodemailer's own transport that renders the message and
// sends nothing — BEFORE index.js binds it, so nvMailTransport's real call
// lands on a transport with no network, and the message shapes NivaDesk uses
// are rendered by the installed nodemailer. No SMTP connection is possible
// from this file: the stub throws if asked for anything but json.
//
// Run: node test/qa/mail-transport-json.test.js
const assert = require("assert");
const nodemailer = require("nodemailer");

function pass(name) { console.log("PASS ", name); }

const installed = require("nodemailer/package.json").version;
const seenOptions = [];
const realCreate = nodemailer.createTransport;
nodemailer.createTransport = (options) => {
  seenOptions.push(options);
  return realCreate.call(nodemailer, { jsonTransport: true });
};

delete process.env.FIRESTORE_EMULATOR_HOST; // the guard must hand the call to nodemailer, not suppress it
const fns = require("../../index.js");
assert.strictEqual(typeof fns._nvMailTransport, "function", "nvMailTransport is not exported");

(async () => {
  // The SMTP options the helpers build (sendPortalStatusEmail, emailWorkspaceInvitation, …).
  const transporter = fns._nvMailTransport({
    host: "smtp.hostinger.com", port: 465, secure: true, auth: { user: "support@nivadesk.co.uk", pass: "not-a-real-password" }
  });
  assert.strictEqual(seenOptions.length, 1, "nvMailTransport did not hand its options to nodemailer.createTransport exactly once");
  assert.strictEqual(seenOptions[0].host, "smtp.hostinger.com", "the SMTP options did not reach nodemailer");
  pass("nvMailTransport builds its transport through nodemailer.createTransport with the SMTP options");

  // Every field shape the five helpers use, in one message.
  const info = await transporter.sendMail({
    from: `"Studio Name" <support@nivadesk.co.uk>`,
    to: "customer@example.com",
    replyTo: "studio@example.org",
    subject: "Order update — In Progress",
    text: "We have started work on your order.",
    html: "<p>We have started work on your order.</p>",
    attachments: [{ filename: "note.txt", content: "plain content" }]
  });
  const rendered = JSON.parse(info.message);
  assert.deepStrictEqual(info.envelope, { from: "support@nivadesk.co.uk", to: ["customer@example.com"] });
  assert.strictEqual(rendered.to[0].address, "customer@example.com");
  assert.strictEqual(rendered.replyTo[0].address, "studio@example.org");
  assert.strictEqual(rendered.subject, "Order update — In Progress");
  assert.strictEqual(rendered.attachments.length, 1);
  assert.ok(info.messageId, "no messageId was minted");
  pass(`sendMail rendered the message on nodemailer ${installed} through jsonTransport (nothing sent)`);

  // A 240-character address — the cap every NivaDesk address passes through
  // before sendMail — is parsed as one address, quickly, on this version.
  const long = `${"a".repeat(220)}@example.com`.slice(0, 240);
  const parse = require("nodemailer/lib/addressparser");
  const t0 = Date.now();
  const parsed = parse(long);
  assert.strictEqual(parsed.length, 1);
  assert.ok(Date.now() - t0 < 50, "parsing a 240-character address took longer than 50 ms");
  pass("a 240-character address parses as one address in well under 50 ms");

  nodemailer.createTransport = realCreate;
  console.log("\n✅ MAIL TRANSPORT JSON GEÇTİ");
  process.exit(0);
})().catch((error) => { console.error("FAIL ", error.message); process.exit(1); });
