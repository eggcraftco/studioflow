// pinMessageInThread / unpinMessageInThread.
//
// These two were deployed and then deleted from index.js. Cloud Functions kept
// running the container it had been given, so pinning went on working in the
// shipped Mac, iPhone and Android apps while the code that did it existed
// nowhere — and the next full deploy would have removed the functions with
// nothing left to redeploy. They were rewritten from the only surviving
// specification: what the three clients read.
//
// Which is exactly why this file exists. A function restored from inference
// and never run is the same hazard wearing a fresh coat.
//
// Needs the full emulator suite and the QA seed. Run through test/run-integration.sh.
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.GCLOUD_PROJECT = "eggcraft-studio";
const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
const fns = require("../../index.js");
const db = admin.firestore();

const companyId = "qa-workspace";
const THREAD = "team";
const MSG = "msg-pin-1";
const GONE = "msg-deleted-1";
const auth = { uid: "qa-review-uid", token: { email: "review@nivadesk.app", name: "QA Review" } };

let fail = 0;
const ok = (label, cond, extra = "") => {
  if (!cond) fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${cond ? "" : "  <- " + extra}`);
};
const mustThrow = async (label, fn, needle) => {
  try { await fn(); ok(label, false, "no error thrown"); }
  catch (error) { ok(label, String(error?.message || "").toLowerCase().includes(needle.toLowerCase()), error?.message); }
};

const threadRef = db.collection("companies").doc(companyId).collection("messageThreads").doc(THREAD);
const pin = (messageId) => fns.pinMessageInThread.run({ data: { companyId, threadId: THREAD, messageId }, auth, acceptsStreaming: false });
const unpin = (messageId) => fns.unpinMessageInThread.run({ data: { companyId, threadId: THREAD, messageId }, auth, acceptsStreaming: false });
const thread = async () => (await threadRef.get()).data() || {};
const message = async (id) => (await threadRef.collection("messages").doc(id).get()).data() || {};

// The thread the team always has, plus two messages.
await threadRef.set({
  companyId, type: "team", title: "Team",
  memberUids: [auth.uid], createdAt: admin.firestore.FieldValue.serverTimestamp()
}, { merge: true });
await threadRef.collection("messages").doc(MSG).set({
  text: "Bring the wax model on Tuesday", senderUid: auth.uid, senderName: "QA Review",
  createdAt: admin.firestore.FieldValue.serverTimestamp()
});
await threadRef.collection("messages").doc(GONE).set({
  text: "", senderUid: auth.uid, deletedForEveryone: true,
  createdAt: admin.firestore.FieldValue.serverTimestamp()
});

// --- pinning writes BOTH sides -------------------------------------------
await pin(MSG);
{
  const t = await thread(); const m = await message(MSG);
  ok("thread lists the pinned message", (t.pinnedMessageIds || []).includes(MSG), JSON.stringify(t.pinnedMessageIds));
  ok("message says it is pinned", m.pinned === true, String(m.pinned));
  ok("pinned by whom is recorded", m.pinnedByUid === auth.uid, m.pinnedByUid);
  ok("pinned by name is recorded", String(m.pinnedByName || "").length > 0, m.pinnedByName);
  ok("pinned at is a timestamp", Boolean(m.pinnedAt), String(m.pinnedAt));
}

// --- pinning twice is not two pins ---------------------------------------
await pin(MSG);
{
  const ids = (await thread()).pinnedMessageIds || [];
  ok("pinning twice leaves one entry", ids.filter((id) => id === MSG).length === 1, JSON.stringify(ids));
}

// --- unpinning clears both sides, and leaves no stale name ----------------
await unpin(MSG);
{
  const t = await thread(); const m = await message(MSG);
  ok("thread no longer lists it", !(t.pinnedMessageIds || []).includes(MSG), JSON.stringify(t.pinnedMessageIds));
  ok("message says it is not pinned", m.pinned === false, String(m.pinned));
  ok("the pinner's name is cleared, not left behind", m.pinnedByName === undefined, String(m.pinnedByName));
  ok("the pinned time is cleared", m.pinnedAt === undefined, String(m.pinnedAt));
}

// --- unpinning something not pinned is not an error ----------------------
await unpin(MSG);
ok("unpinning twice is harmless", true);

// --- a deleted message cannot be pinned, but CAN be unpinned -------------
await mustThrow("a deleted message cannot be pinned", () => pin(GONE), "deleted");
await threadRef.set({ pinnedMessageIds: [GONE] }, { merge: true });
await unpin(GONE);
ok("a deleted message that was pinned can be unpinned",
  !((await thread()).pinnedMessageIds || []).includes(GONE),
  JSON.stringify((await thread()).pinnedMessageIds));

// --- a message that does not exist -------------------------------------
await mustThrow("pinning a message that is not there fails", () => pin("no-such-message"), "not found");

// --- somebody outside the workspace -------------------------------------
await mustThrow("an outsider cannot pin",
  () => fns.pinMessageInThread.run({
    data: { companyId, threadId: THREAD, messageId: MSG },
    auth: { uid: "stranger-uid", token: { email: "stranger@example.com" } },
    acceptsStreaming: false
  }),
  "");

console.log(fail ? `\n${fail} FAILED` : "\nPASS");
process.exit(fail ? 1 : 0);
