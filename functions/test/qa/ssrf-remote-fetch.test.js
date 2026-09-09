// SSRF containment and hardening: the two sinks that fetch a caller's URL.
//
// `attach_bank_receipt` and `create_inventory_item` each took a URL out of an
// assistant argument and fetched it. Both wrote the guard as a ternary:
//
//     const source = /^https:\/\//i.test(u) ? u : nvAssertPublicHttpsUrl(u);
//
// which is not a guard. Every https URL — every hostile one — took the raw
// branch and never met the validator; everything else met a validator whose
// first line rejects it for not being https. At attach_bank_receipt the two
// branches did not even carry the same variable: it validated `linkUrl` and
// fetched `chatFileUrl`, and on the deployed configuration `linkUrl` is always
// empty, so the only branch where the validator worked was dead code.
//
// The fetched bytes are written to the workspace's own Storage and handed back,
// so this was full-read SSRF reachable by any authenticated workspace owner.
//
// WHAT THIS FILE TESTS, AND WHY IT IS NOT A VALIDATOR TEST.
// A test of the validator in isolation would have passed against the broken
// code — the validator was correct, it was simply not on the path. So every
// check below drives the real production entry point, nvChatGPTDispatchAction,
// with the real handler, and watches the network seam. The assertion that
// matters is not "it threw", it is "neither DNS nor a socket was reached": a
// request that is made and then discarded is still a request.
//
// Nothing here reaches the network, DNS, Firestore or Storage. The resolver and
// the transport in security/remoteFetch.js are replaced by spies, ./inventory
// is stubbed in the require cache so no item is written, and every hostile case
// is asserted to stop before any of that is reached. Six checks are the
// exception and say so. Three bind a server on 127.0.0.1:0 and talk to it,
// because what they test is Node's own behaviour and nothing short of a real
// connection can show it: socket pooling, the fact that `timeout` measures
// silence rather than elapsed time, and the fact that a redirect-following
// client lets the remote server pick the final address. The other three spawn
// this file as a child process, because what they test is this runner's own
// exit code. Nothing in any of them leaves this machine.
"use strict";

const assert = require("assert");
const Module = require("module");
const path = require("path");

// Site 1 is gated off by default (NIVADESK_MCP_INVENTORY absent in production).
// Turn it on here: the assessment named "somebody switches that flag on" as the
// thing that would make site 1 live, so the flag-on configuration is precisely
// the one worth holding a test against.
process.env.NIVADESK_MCP_INVENTORY = "1";
// Belt and braces: if anything below ever did reach for Firestore, it must fail
// against a dead local port rather than travel to the production project.
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:9";

// ---- stub ./inventory before index.js requires it ---------------------------
// saveItemForWorkspace runs before the photo fetch and writes to Firestore.
// Stubbing it is what lets the *real* create_inventory_item handler run all the
// way to its fetch. The fetch itself, and everything guarding it, is production
// code — that is the part under test.
const inventoryPath = require.resolve("../../inventory");
const inventoryStub = new Module(inventoryPath, module);
inventoryStub.filename = inventoryPath;
inventoryStub.loaded = true;
inventoryStub.exports = {
  createInventoryFunctions: () => ({
    _internal: {
      saveItemForWorkspace: async () => ({ itemId: "item-1", number: "INV-1" }),
      itemsRef: () => ({ doc: () => ({ set: async () => undefined }), limit: () => ({ get: async () => ({ docs: [] }) }) })
    }
  })
};
require.cache[inventoryPath] = inventoryStub;

const api = require("../../index");
const dispatch = api._nvChatGPTDispatchAction;
const availableActions = api._nvMcpAvailableActions;
const remote = require("../../security/remoteFetch");
const { assertFetchableUrl, ALLOWED_SCHEMES, UnsafeUrlError, NETWORK } = remote;
const { isPrivateAddress } = require("../../security/privateAddress");

let failures = 0;
const checks = [];
function check(name, run) { checks.push({ name, run }); }

// A check that never settles used to VANISH, and take the rest of the file with
// it. The loop below awaited it, nothing ever resolved it, Node found no
// pending handles, drained the event loop and exited 0 — thirteen PASS lines,
// no FAIL, no banner, and six checks that never ran, one of them the structural
// check that watches for a reintroduced bare fetch on either sink. CI
// (.github/workflows/functions-tests.yml) gates on that exit code, so the run
// read as a pass in seconds with the regression guard skipped.
//
// It was not hypothetical. Removing the 3xx branch from the transport produced
// exactly that: this file's 3xx check drives a mock response, and without the
// branch pinnedHttpsRequest falls through to wait for a body the mock never
// sent. One guard's removal, therefore, went green.
//
// FOUR guarantees now, because a run can go wrong in four ways and an earlier
// version of this comment claimed there were two. Each is proved by a child
// process driven from `SSRF_SELFTEST` below, and each was measured failing
// against the runner as it stood:
//   1. A check that never settles is a FAILURE with the check's name on it —
//      each check races a rejecting timer. Set SSRF_CHECK_TIMEOUT_MS=0 to
//      disable it, which the self-test does to prove guarantee 2 on its own.
//   2. A process that leaves without a verdict exits non-zero — an exit hook,
//      because (1) only helps while the loop is still running. A completion
//      count checked after the loop would not: with a stalled check the loop
//      never reaches the line that checks it.
//   3. A process that never leaves AT ALL. A check that resolves while still
//      holding a timer, a socket or a server wedges the run *after* the ✅ has
//      been printed: the runner falls off the end of its async IIFE and waits
//      for the event loop to drain, which that handle prevents. CI then burns
//      its whole timeout-minutes budget, `npm test`'s for-loop never reaches
//      the remaining files, and the last thing on stdout is the success
//      banner. So active handles are counted around every check, a leak is a
//      named FAILURE, and the verdict is followed by an explicit exit.
//   4. An asynchronous throw — from a check the loop has already abandoned, or
//      from a timer inside one that never settles — used to kill the process
//      with no FAIL line, no verdict and no check name: the crash beat the 20s
//      timer, and the exit hook returned early because the exit code was
//      already non-zero. Both are trapped now, reported against the running
//      check's name, and counted ("N never ran").
//
// KNOWN AND NOT CLOSED: nothing counts assertions. A check whose body resolves
// without asserting anything, or which swallows its own AssertionError, PASSes.
// That is why every guard in this file is proved by REMOVING it and watching a
// named check go red (hotfix §6) rather than by trusting a green run.
const CHECK_TIMEOUT_MS = process.env.SSRF_CHECK_TIMEOUT_MS === undefined ? 20000 : Number(process.env.SSRF_CHECK_TIMEOUT_MS);
// "" in a normal run; "hang" | "leak" | "throw" in a child spawned by the
// runner's own self-test checks.
const SELFTEST = String(process.env.SSRF_SELFTEST || "");
let reported = 0;
let finished = false;
let current = null;                       // the check being awaited, for crash attribution

/** Leaves deterministically, so a handle a check forgot cannot wedge the run. */
function leave(code) {
  process.exitCode = code;
  const stop = () => process.exit(code);
  // The callback fires once everything queued before it has flushed, which
  // process.exit() on its own does not guarantee on a pipe — and the self-test
  // reads this process's stdout through one.
  process.stdout.write("", stop);
  setTimeout(stop, 2000).unref();         // backstop, reachable only while something else holds the loop open
}

process.on("exit", (code) => {
  if (finished) return;
  console.log(`\n❌ the runner left after ${reported}/${checks.length} checks without reaching a verdict`);
  if (code === 0) process.exitCode = 1;
});

// Guarantee 4. Without these, an async throw prints a raw stack and exits
// non-zero with nothing said about which check was running or how much of the
// suite never ran — and the exit hook above stayed silent, because it used to
// return early whenever the code was already non-zero.
const crash = (kind) => (error) => {
  if (finished) return;
  finished = true;
  console.log("FAIL ", current || "(no check was running)", `- ${kind}:`, String((error && error.message) || error).split("\n")[0].slice(0, 300));
  console.log(`\n❌ ${kind} after ${reported}/${checks.length} checks — ${checks.length - reported} never ran`);
  leave(1);
};
process.on("uncaughtException", crash("an uncaught exception"));
process.on("unhandledRejection", crash("an unhandled rejection"));

// Registered FIRST, so the child's remaining checks are downstream of the fault
// and the self-test can assert they still ran.
if (SELFTEST === "hang") check("SELFTEST: a check that never settles", () => new Promise(() => { }));
if (SELFTEST === "leak") check("SELFTEST: a check that leaks a timer", async () => { setInterval(() => undefined, 500); });
if (SELFTEST === "throw") check("SELFTEST: a check that throws from a timer", () => new Promise(() => {
  setTimeout(() => { throw new Error("thrown from a timer nobody awaits"); }, 300);
}));

// ---- the seam --------------------------------------------------------------
// Two spies, one per layer, so a check can say which layer stopped something:
// `dnsCalls` empty means the URL never got past the string checks, `sent` empty
// means no socket was opened.
const PUBLIC_ANSWER = [{ address: "93.184.216.34", family: 4 }];
let dnsCalls = [];
let sent = [];

function installSpy({ answers = PUBLIC_ANSWER, respond = () => { throw new Error("SPY_NETWORK_REACHED"); } } = {}) {
  dnsCalls = [];
  sent = [];
  NETWORK.resolve = async (name) => {
    dnsCalls.push(String(name));
    if (answers instanceof Error) throw answers;
    return answers;
  };
  NETWORK.request = async (url, options) => {
    sent.push({ url: url.toString(), options: options || {} });
    return respond(url, options || {});
  };
}
function restoreSeam() { NETWORK.resolve = null; NETWORK.request = null; }

/** A response shaped like the parts these two sinks read. */
function fakeResponse({ status = 200, contentType = "application/pdf", body = "%PDF-1.4 x" } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (String(name).toLowerCase() === "content-type" ? contentType : null) },
    arrayBuffer: async () => Buffer.from(body, "utf8")
  };
}
const redirectResponse = (status) => () => ({
  ok: false,
  status,
  headers: { get: (n) => (String(n).toLowerCase() === "location" ? "http://169.254.169.254/computeMetadata/v1/" : null) },
  arrayBuffer: async () => { throw new Error("the body of a redirect was read"); }
});

// ---- the caller ------------------------------------------------------------
// An owner of their own workspace: the weakest credential that reaches these
// sinks, which every self-serve signup holds.
const OWNER = {
  uid: "owner-uid",
  companyId: "acme",
  email: "owner@example.com",
  companyData: {
    __workspaceId: "acme",
    ownerUid: "owner-uid",
    members: { "owner-uid": { role: "owner" } },
    memberRoles: { "owner-uid": "owner" }
  }
};

const attachReceipt = (url) => dispatch(OWNER, "attach_bank_receipt", {
  transactionId: "tx-1",
  receipt: { download_url: url, mime_type: "application/pdf", file_name: "invoice.pdf" }
});

const createItem = (url) => dispatch(OWNER, "create_inventory_item", {
  name: "Silver wire",
  confirmed: true,
  trackingType: "quantity",
  quantity: 5,
  photo: { download_url: url, mime_type: "image/jpeg", file_name: "wire.jpg" }
});

/** Runs a body with console.warn silenced — site 1 logs its skipped photos. */
async function quietly(run) {
  const warn = console.warn;
  console.warn = () => undefined;
  try { return await run(); } finally { console.warn = warn; }
}

/**
 * A LOOP OVER AN EMPTY LIST ASSERTS NOTHING, AND SAYS SO IN GREEN.
 *
 * Measured, not imagined: with `HOSTILE` emptied, this file still exited 0 with
 * every check PASSing — and it did so with the credentials guard removed from
 * remoteFetch.js, and again with the port allowlist removed. Those two guards
 * have no other coverage anywhere in the suite, so a merge, a rebase or a "tidy
 * the list" commit that shortened this table would have retired them silently
 * while hotfix §6 still claimed 23 of 23 were proved by removal.
 *
 * So every table a check loops over is declared through here, with the floor it
 * must not fall below; the loops assert they actually ran that many times; and
 * the named check `no check loops over a table that has been emptied`, which is
 * registered last so every table has been declared by the time it runs, reports
 * any that fell short. It does not throw where it is called, because half these
 * tables are declared at module scope and a throw there would kill the file
 * before a single check had a name to fail under.
 */
const TABLES = [];
function table(name, rows, minimum) {
  const list = Array.isArray(rows) ? rows : [];
  TABLES.push({ name, count: list.length, minimum, isList: Array.isArray(rows) });
  return list;
}

// The inputs. Every one of these was fetched raw by the shipped code: each is a
// well-formed https URL, so each took the ternary's unguarded branch. Column 3
// is the layer-1 reason it must be refused for; the check
// `every layer-1 refusal reason is exercised by name` uses it to prove no guard
// has been left with nothing pointed at it.
const HOSTILE = table("HOSTILE", [
  ["the cloud metadata service", "https://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token", "private_ip"],
  ["metadata by name", "https://metadata.google.internal/computeMetadata/v1/", "blocked_host"],
  ["metadata's other name", "https://metadata.goog/computeMetadata/v1/", "blocked_host"],
  ["loopback", "https://127.0.0.1/admin", "private_ip"],
  ["loopback by name", "https://localhost/admin", "blocked_host"],
  ["loopback in decimal", "https://2130706433/admin", "private_ip"],
  ["loopback in hex", "https://0x7f000001/admin", "private_ip"],
  ["loopback short form", "https://127.1/admin", "private_ip"],
  ["RFC1918 ten", "https://10.0.0.5/", "private_ip"],
  ["RFC1918 one-seven-two", "https://172.16.0.5/", "private_ip"],
  ["RFC1918 one-nine-two", "https://192.168.1.1/", "private_ip"],
  ["carrier NAT", "https://100.100.100.200/", "private_ip"],
  ["the Google-only VIP shape", "https://192.0.0.192/", "private_ip"],
  ["a cluster-internal single label", "https://kubernetes/api", "not_a_domain"],
  ["a cluster service suffix", "https://kubernetes.default.svc/api", "blocked_host"],
  ["a .internal name", "https://redis.c.my-project.internal/", "blocked_host"],
  ["IPv6 loopback", "https://[::1]/", "private_ip"],
  ["IPv6 loopback written out", "https://[0:0:0:0:0:0:0:1]/", "private_ip"],
  ["IPv6 unique-local", "https://[fd00::1]/", "private_ip"],
  ["IPv6 link-local", "https://[fe80::1]/", "private_ip"],
  ["IPv6 multicast", "https://[ff02::1]/", "private_ip"],
  ["IPv4-mapped IPv6", "https://[::ffff:127.0.0.1]/", "private_ip"],
  ["IPv4-mapped metadata", "https://[::ffff:169.254.169.254]/", "private_ip"],
  // RFC 9637 (2024) documentation space. Not a route to anything internal on
  // this runtime — it is the completeness gap that let one input reach the
  // transport while every other hostile case stopped short of it.
  ["IPv6 documentation space", "https://[3fff::1]/", "private_ip"],
  // Fail-closed cases: malformed, credentialed, or naming a port.
  ["a URL that will not parse", "http:// not a url", "unparseable"],
  ["credentials in the URL", "https://metadata.google.internal@example.com/", "credentials"],
  ["a named port", "https://example.com:8080/receipt.pdf", "port"],
  ["a cleartext scheme", "http://example.com/receipt.pdf", "scheme"],
  ["a file scheme", "file:///etc/passwd", "scheme"],
  ["a gopher scheme", "gopher://example.com/1", "scheme"]
], 30);

check("every layer-1 refusal reason is exercised by name", () => {
  // The guard against the vacuity above, from the other side. Emptying HOSTILE
  // fails `table()`; deleting only the credentials row or only the port row
  // would not, and those two rows are the sole coverage those two guards have.
  // So the reasons are enumerated and each must be both CLAIMED by a row and
  // PRODUCED by the validator for that row.
  const required = ["scheme", "credentials", "port", "blocked_host", "private_ip", "not_a_domain", "unparseable"];
  const claimed = new Set(HOSTILE.map(([, , reason]) => reason));
  for (const reason of required) {
    assert.ok(claimed.has(reason), `no hostile input claims the reason "${reason}" — that guard has nothing pointed at it`);
  }
  let checked = 0;
  for (const [label, url, reason] of HOSTILE) {
    assert.ok(reason, `${label}: no expected reason`);
    assert.throws(() => assertFetchableUrl(url), (error) => {
      assert.ok(error instanceof UnsafeUrlError, `${label}: threw ${error.name}`);
      assert.strictEqual(error.reason, reason, `${label}: refused as ${error.reason}, expected ${reason}`);
      return true;
    }, `${label}: ACCEPTED by layer 1`);
    checked += 1;
  }
  assert.strictEqual(checked, HOSTILE.length, "the loop did not visit every row");
});

// ---- SITE 2: attach_bank_receipt — live in production today -----------------
check("attach_bank_receipt: no hostile link reaches DNS or the network", async () => {
  let tried = 0;
  for (const [label, url] of HOSTILE) {
    installSpy();
    try {
      await assert.rejects(() => attachReceipt(url), (error) => {
        assert.strictEqual(error.code, "invalid-argument", `${label}: refused, but as ${error.code}`);
        return true;
      }, `${label}: was NOT refused`);
      assert.strictEqual(sent.length, 0, `${label}: FETCHED — ${sent.map((c) => c.url).join(", ")}`);
      assert.strictEqual(dnsCalls.length, 0, `${label}: resolved ${dnsCalls.join(", ")}`);
      tried += 1;
    } finally { restoreSeam(); }
  }
  assert.strictEqual(tried, HOSTILE.length, "the loop did not drive every hostile input");
});

check("attach_bank_receipt: the URL fetched is the URL validated", async () => {
  // The original defect in one check. chatFileUrl is what gets fetched; the old
  // code validated linkUrl, which on the deployed configuration is always "".
  // A hostile chatFileUrl with an innocent everything-else must still be
  // refused, and must not reach the network.
  installSpy();
  try {
    await assert.rejects(() => dispatch(OWNER, "attach_bank_receipt", {
      transactionId: "tx-1",
      receiptUrl: "https://example.com/harmless.pdf",
      receipt: { download_url: "https://169.254.169.254/computeMetadata/v1/", mime_type: "application/pdf" }
    }), /public https address/);
    assert.strictEqual(sent.length, 0, `fetched ${sent.map((c) => c.url).join(", ")}`);
  } finally { restoreSeam(); }
});

check("attach_bank_receipt: a redirect is refused, not followed", async () => {
  // The bypass that survives a correct validator: the caller's URL passes every
  // check and the remote server then names the real destination. Nothing may be
  // read from a 3xx and no second request may be made.
  for (const status of [301, 302, 303, 307, 308]) {
    installSpy({ respond: redirectResponse(status) });
    try {
      await assert.rejects(() => attachReceipt("https://example.com/receipt.pdf"), /redirects elsewhere/, `HTTP ${status} was not refused`);
      assert.strictEqual(sent.length, 1, `HTTP ${status}: made ${sent.length} requests, expected exactly the first`);
    } finally { restoreSeam(); }
  }
});

check("attach_bank_receipt: a legitimate https link is still fetched", async () => {
  // The positive control. Without it, a change that refused everything would
  // pass every check above.
  installSpy();
  try {
    await assert.rejects(() => attachReceipt("https://files.example.com/invoice.pdf"), /Could not download/);
    assert.strictEqual(sent.length, 1, "a good link did not reach the network");
    assert.strictEqual(sent[0].url, "https://files.example.com/invoice.pdf");
    assert.deepStrictEqual(dnsCalls, ["files.example.com"], "the host was not resolved exactly once");
  } finally { restoreSeam(); }
});

// ---- SITE 1: create_inventory_item — one flag away from live ----------------
check("create_inventory_item is dispatchable in this process", () => {
  // If this is false the checks below are vacuous, so it is asserted rather
  // than assumed.
  assert.ok(availableActions().includes("create_inventory_item"));
});

check("create_inventory_item: no hostile photo link reaches DNS or the network", async () => {
  // This sink swallows a download failure on purpose — the item is saved and
  // only the photo is lost — so "it threw" is not available as evidence here.
  // The evidence is the spy: the request must not have been made.
  await quietly(async () => {
    let tried = 0;
    for (const [label, url] of HOSTILE) {
      installSpy();
      try {
        const result = await createItem(url);
        assert.strictEqual(sent.length, 0, `${label}: FETCHED — ${sent.map((c) => c.url).join(", ")}`);
        assert.strictEqual(dnsCalls.length, 0, `${label}: resolved ${dnsCalls.join(", ")}`);
        assert.strictEqual(result.photoStored, false, `${label}: stored a photo it must not have downloaded`);
        tried += 1;
      } finally { restoreSeam(); }
    }
    assert.strictEqual(tried, HOSTILE.length, "the loop did not drive every hostile input");
  });
});

check("create_inventory_item: a redirect is refused, and a good link is fetched", async () => {
  await quietly(async () => {
    installSpy({ respond: redirectResponse(302) });
    try {
      const result = await createItem("https://images.example.com/wire.jpg");
      assert.strictEqual(sent.length, 1, "followed the redirect or made extra requests");
      assert.strictEqual(result.photoStored, false, "stored the redirect target");
    } finally { restoreSeam(); }

    // Positive control: a good link does reach the network.
    installSpy();
    try {
      await createItem("https://images.example.com/wire.jpg");
      assert.strictEqual(sent.length, 1, "a good photo link did not reach the network");
      assert.strictEqual(sent[0].url, "https://images.example.com/wire.jpg");
    } finally { restoreSeam(); }
  });
});

// ---- PHASE 2: the name is resolved, and every answer is judged --------------
check("a public name that resolves privately is refused, at both sinks", async () => {
  // The whole class containment could not touch: nip.io, a rebinding host, an
  // internal name with a real-looking suffix. The URL is unimpeachable; the
  // answer is not.
  const url = "https://169.254.169.254.nip.io/computeMetadata/v1/";
  const answer = [{ address: "169.254.169.254", family: 4 }];

  installSpy({ answers: answer });
  try {
    await assert.rejects(() => attachReceipt(url), /public https address/);
    assert.strictEqual(dnsCalls.length, 1, "the host was not resolved");
    assert.strictEqual(sent.length, 0, `CONNECTED to ${sent.map((c) => c.url).join(", ")}`);
  } finally { restoreSeam(); }

  await quietly(async () => {
    installSpy({ answers: answer });
    try {
      const result = await createItem(url);
      assert.strictEqual(sent.length, 0, `CONNECTED to ${sent.map((c) => c.url).join(", ")}`);
      assert.strictEqual(result.photoStored, false);
    } finally { restoreSeam(); }
  });
});

check("every answer is judged, not the first", async () => {
  // A host that returns one routable address and one loopback address is not
  // safe, and which of them a connection would have picked is not ours to say.
  const mixed = table("mixed answers", [
    ["private last", [{ address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 }]],
    ["private first", [{ address: "10.1.2.3", family: 4 }, { address: "93.184.216.34", family: 4 }]],
    ["private in the middle", [{ address: "93.184.216.34", family: 4 }, { address: "169.254.169.254", family: 4 }, { address: "1.1.1.1", family: 4 }]],
    ["an IPv6 answer", [{ address: "2606:4700::1111", family: 6 }, { address: "::1", family: 6 }]],
    ["an IPv4-mapped answer", [{ address: "::ffff:169.254.169.254", family: 6 }]],
    ["a unique-local answer", [{ address: "fd12:3456::1", family: 6 }]],
    ["a link-local answer", [{ address: "fe80::1", family: 6 }]],
    ["a multicast answer", [{ address: "ff02::1", family: 6 }]],
    ["a documentation-space answer", [{ address: "3fff::1", family: 6 }]]
  ], 9);
  let tried = 0;
  for (const [label, answers] of mixed) {
    installSpy({ answers });
    try {
      await assert.rejects(() => attachReceipt("https://files.example.com/invoice.pdf"), /public https address/, `${label}: accepted`);
      assert.strictEqual(sent.length, 0, `${label}: CONNECTED anyway`);
      tried += 1;
    } finally { restoreSeam(); }
  }
  assert.strictEqual(tried, mixed.length, "the loop did not judge every answer set");
});

check("a host that will not resolve is refused, not attempted", async () => {
  for (const answers of [new Error("ENOTFOUND"), []]) {
    installSpy({ answers });
    try {
      await assert.rejects(() => attachReceipt("https://files.example.com/invoice.pdf"), (error) => {
        assert.strictEqual(error.code, "invalid-argument");
        return true;
      });
      assert.strictEqual(sent.length, 0, "connected without a usable answer");
    } finally { restoreSeam(); }
  }
});

check("the layer-2 refusal table, row for row", async () => {
  // The hotfix record's second table (§5, "Refused at layer 2") said "Measured
  // today" and named five rows, and four of them appeared nowhere in this file
  // — so the measurement was not reproducible from the tree it shipped in.
  // They are reproduced here, with the reason code the table prints, and with
  // the two facts the table's own columns claim: DNS was asked exactly once,
  // and no socket was opened.
  const rows = table("the layer-2 table", [
    ["a public name pointing at metadata", "https://169.254.169.254.nip.io/", [{ address: "169.254.169.254", family: 4 }], "private_address"],
    // Two labels, so layer 1 passes it BY DESIGN — refusing it there would mean
    // inventing a TLD allowlist. This row is what makes layer 2 necessary.
    ["a two-label cluster name", "https://kubernetes.default/api", [{ address: "10.96.0.1", family: 4 }], "private_address"],
    ["a host answering public and loopback", "https://rebind.example.com/x.pdf", [{ address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 }], "private_address"],
    ["a v6-only host on unique-local", "https://v6only.example.com/x.pdf", [{ address: "fd00::1", family: 6 }], "private_address"],
    ["a name that does not resolve", "https://nx.example.com/x.pdf", new Error("ENOTFOUND"), "dns_failed"]
  ], 5);

  let tried = 0;
  for (const [label, url, answers, reason] of rows) {
    // The reason code the table prints, from the door itself.
    installSpy({ answers });
    try {
      await assert.rejects(() => remote.safeRemoteFetch(url), (error) => {
        assert.ok(error instanceof UnsafeUrlError, `${label}: threw ${error.name}`);
        assert.strictEqual(error.reason, reason, `${label}: refused as ${error.reason}, the table says ${reason}`);
        return true;
      }, `${label}: was NOT refused`);
      assert.strictEqual(dnsCalls.length, 1, `${label}: resolved ${dnsCalls.length} times — layer 1 was expected to pass this and layer 2 to stop it`);
      assert.strictEqual(sent.length, 0, `${label}: CONNECTED to ${sent.map((c) => c.url).join(", ")}`);
    } finally { restoreSeam(); }

    // And through the live sink, so the row is about production and not about a
    // module in isolation.
    installSpy({ answers });
    try {
      await assert.rejects(() => attachReceipt(url), (error) => {
        assert.strictEqual(error.code, "invalid-argument", `${label}: refused, but as ${error.code}`);
        return true;
      }, `${label}: the sink did not refuse it`);
      assert.strictEqual(sent.length, 0, `${label}: the sink CONNECTED`);
      tried += 1;
    } finally { restoreSeam(); }
  }
  assert.strictEqual(tried, rows.length, "the loop did not drive every row of the layer-2 table");
});

check("the address that was checked is the address handed to the transport", async () => {
  // The TOCTOU seam, at the layer above the socket: whatever the resolver
  // returned and the checks passed is what the request is told to connect to.
  installSpy({ answers: [{ address: "93.184.216.34", family: 4 }] });
  try {
    await attachReceipt("https://files.example.com/invoice.pdf").catch(() => undefined);
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].options.address, "93.184.216.34", "the request was not pinned to the checked address");
    assert.strictEqual(sent[0].options.family, 4);
    assert.strictEqual(dnsCalls.length, 1, `resolved ${dnsCalls.length} times — a second resolution is the window this closes`);
  } finally { restoreSeam(); }
});

check("the pin: the transport ignores the hostname it is asked to look up", async () => {
  // The TOCTOU seam at the socket. node:https is handed a `lookup` that returns
  // the checked address whatever name it is given, so a rebinding attacker has
  // no second answer to give. Also asserts SNI is still the hostname, because a
  // pin that broke certificate identity would be a worse bug than the one it
  // fixes.
  const https = require("https");
  const realRequest = https.request;
  let captured = null;
  https.request = (options) => { captured = options; return { on() { return this; }, end() { } }; };
  try {
    // deadlineMs: 0 — this call is abandoned rather than awaited (the mock never
    // answers), and a live deadline timer would hold the process open until it
    // fired and then destroy a request object the mock never made.
    remote.pinnedHttpsRequest(new URL("https://files.example.com/a.pdf"), { address: "93.184.216.34", family: 4, deadlineMs: 0 }).catch(() => undefined);
  } finally { https.request = realRequest; }

  assert.ok(captured, "https.request was never called");
  assert.strictEqual(captured.servername, "files.example.com", "SNI is not the hostname");
  assert.strictEqual(captured.hostname, "files.example.com", "the Host header identity changed");
  assert.strictEqual(typeof captured.lookup, "function", "no lookup was pinned — the connection would resolve again");

  const asList = await new Promise((res, rej) => captured.lookup("rebound.attacker.example", { all: true }, (e, v) => (e ? rej(e) : res(v))));
  assert.deepStrictEqual(asList, [{ address: "93.184.216.34", family: 4 }]);
  const asSingle = await new Promise((res, rej) => captured.lookup("rebound.attacker.example", {}, (e, a, f) => (e ? rej(e) : res([a, f]))));
  assert.deepStrictEqual(asSingle, ["93.184.216.34", 4]);
});

check("the pin is consulted for every request, not only the first", async () => {
  // The pin is only true of every request if every request opens its own
  // connection. It would not, by default: on Node 22 the global agent has
  // keepAlive: true and pools sockets by host and port — NOT by the lookup we
  // pass — so a second request to the same hostname rides the first socket and
  // our lookup is never asked. This check measures that on a loopback server,
  // because a structural assertion that `agent: false` is present would not
  // show why it has to be. http.Agent is the class https.Agent extends, so the
  // pooling under test is the same code.
  const http = require("http");
  const server = http.createServer((req, res) => res.end("ok"));
  await new Promise((res) => server.listen(0, "127.0.0.1", res));
  const port = server.address().port;

  let lookups = 0;
  const countingLookup = (_host, options, callback) => {
    lookups += 1;
    if (options && options.all) callback(null, [{ address: "127.0.0.1", family: 4 }]);
    else callback(null, "127.0.0.1", 4);
  };
  const call = (agent) => new Promise((resolve, reject) => {
    const options = { hostname: "pinned.invalid", port, path: "/", method: "GET", lookup: countingLookup };
    if (agent !== undefined) options.agent = agent;
    const request = http.request(options, (response) => { response.resume(); response.on("end", resolve); });
    request.on("error", reject);
    request.end();
  });

  try {
    lookups = 0;
    await call(undefined); await call(undefined); await call(undefined);
    const pooled = lookups;

    lookups = 0;
    await call(false); await call(false); await call(false);
    const unpooled = lookups;

    assert.ok(pooled < 3, `the default agent resolved ${pooled} times — if pooling has changed, the note in remoteFetch.js needs rewriting, not deleting`);
    assert.strictEqual(unpooled, 3, "agent: false did not give each request its own connection");
  } finally {
    await new Promise((res) => server.close(res));
  }

  // And the transport actually asks for that. Without this option the pin binds
  // the first request to each host and the rest inherit its socket.
  const https = require("https");
  const realRequest = https.request;
  let captured = null;
  https.request = (options) => { captured = options; return { on() { return this; }, end() { } }; };
  try {
    // deadlineMs: 0 — this call is abandoned rather than awaited (the mock never
    // answers), and a live deadline timer would hold the process open until it
    // fired and then destroy a request object the mock never made.
    remote.pinnedHttpsRequest(new URL("https://files.example.com/a.pdf"), { address: "93.184.216.34", family: 4, deadlineMs: 0 }).catch(() => undefined);
  } finally { https.request = realRequest; }
  assert.strictEqual(captured && captured.agent, false, "the transport reuses pooled sockets, so the pin is not consulted per request");
});

check("a redirect-following client lets the remote server pick the final address", async () => {
  // WHY REDIRECTS ARE DISABLED RATHER THAN CAPPED, measured instead of cited.
  //
  // The assessment's §4.2 reported this from a throwaway harness ("supplied
  // port 59453, final port 59452") that is not in the tree and cannot be re-run
  // — the one candidate file, test/security/ssrf-receipt-fetch.poc.js, aborts
  // at load because it extracts a function this fix deleted. It is the
  // load-bearing measurement behind "a correctly-called guard would still be
  // defeated by one 302", so it lives here now, on two loopback servers this
  // check starts and stops itself. Nothing leaves this machine.
  //
  // What it shows: the caller-supplied URL passes every check that could ever
  // be applied to it, and the address actually contacted is chosen afterwards,
  // by the server. That is why safeRemoteFetch refuses a 3xx instead of
  // following a bounded number of them.
  const http = require("http");
  const target = http.createServer((req, res) => { res.writeHead(200, { "content-type": "text/plain" }); res.end("the address the SERVER chose"); });
  await new Promise((res) => target.listen(0, "127.0.0.1", res));
  const targetPort = target.address().port;
  const redirector = http.createServer((req, res) => { res.writeHead(302, { location: `http://127.0.0.1:${targetPort}/chosen-by-the-server` }); res.end(); });
  await new Promise((res) => redirector.listen(0, "127.0.0.1", res));
  const suppliedPort = redirector.address().port;

  try {
    assert.notStrictEqual(suppliedPort, targetPort, "both servers landed on one port; the measurement would prove nothing");
    const response = await fetch(`http://127.0.0.1:${suppliedPort}/supplied-by-the-caller`);
    const body = await response.text();
    assert.strictEqual(response.status, 200);
    assert.strictEqual(body, "the address the SERVER chose");
    assert.strictEqual(response.redirected, true, "the client did not follow the redirect — this argument would need rewriting, not deleting");
    assert.ok(response.url.includes(`:${targetPort}`),
      `the final URL was ${response.url}, not the redirect target on port ${targetPort}`);
    assert.ok(!response.url.includes(`:${suppliedPort}`), "the final URL is still the caller's");
  } finally {
    await new Promise((res) => target.close(res));
    await new Promise((res) => redirector.close(res));
  }

  // And our door does not: the same 302 shape is a refusal, not a second
  // request. (The transport's own half of this is the check below.)
  installSpy({ respond: redirectResponse(302) });
  try {
    await assert.rejects(() => remote.safeRemoteFetch("https://files.example.com/invoice.pdf"), /redirects elsewhere/);
    assert.strictEqual(sent.length, 1, `the door made ${sent.length} requests for one redirect`);
  } finally { restoreSeam(); }
});

check("the pinned transport refuses a 3xx without reading its body", async () => {
  const https = require("https");
  const { EventEmitter } = require("events");
  const realRequest = https.request;
  https.request = (options, callback) => {
    const response = new EventEmitter();
    response.statusCode = 302;
    response.headers = { location: "http://169.254.169.254/computeMetadata/v1/" };
    response.destroy = () => { response.destroyed = true; };
    setImmediate(() => {
      callback(response);
      // A real origin sends the redirect's body whether or not anyone reads it,
      // and this mock has to as well. Without these two events, removing the
      // 3xx branch did not fail this check — it left pinnedHttpsRequest waiting
      // forever for a body, which is how that guard's removal went GREEN and
      // silently took five later checks with it. With them, the removal fails
      // here, on the assertion below, with this check's name against it.
      setImmediate(() => {
        if (response.destroyed) return;    // the guard killed it: a real socket would send nothing more
        response.emit("data", Buffer.from("<html>moved</html>"));
        response.emit("end");
      });
    });
    return { on() { return this; }, end() { }, destroy() { this.destroyed = true; } };
  };
  let result;
  try {
    result = await remote.pinnedHttpsRequest(new URL("https://files.example.com/a.pdf"), { address: "93.184.216.34", family: 4 });
  } finally { https.request = realRequest; }
  assert.strictEqual(result.status, 302);
  assert.strictEqual(result.ok, false);
  await assert.rejects(() => result.arrayBuffer(), /no body/, "a redirect's body was readable");
});

check("a trailing dot does not walk past the host blocklist", async () => {
  // The DNS root dot is part of the name and was not part of the spellings the
  // blocklist is written in, and all three of layer 1's host tests are spelling
  // tests. Measured before the fix, against this validator: every one of these
  // was ACCEPTED and returned unchanged, while its undotted twin was refused.
  // ".internal." does not end with ".internal"; "internal." is not a single
  // label. Two dots defeated a one-dot strip, so all of them go.
  const dotted = table("dotted spellings", [
    ["metadata by its fully-qualified name", "https://metadata.google.internal./computeMetadata/v1/", "blocked_host"],
    ["...with the redundant default port", "https://metadata.google.internal.:443/", "blocked_host"],
    ["...with two root dots", "https://metadata.google.internal../", "blocked_host"],
    ["metadata's other name, dotted", "https://metadata.goog./", "blocked_host"],
    ["loopback by name, dotted", "https://localhost./admin", "blocked_host"],
    ["a .local name, dotted", "https://printer.local./", "blocked_host"],
    ["a cluster service suffix, dotted", "https://kubernetes.default.svc./api", "blocked_host"],
    ["a .cluster.local name, dotted", "https://redis.default.svc.cluster.local./", "blocked_host"],
    ["a single label wearing a root dot", "https://internal./", "not_a_domain"]
  ], 9);
  let tried = 0;
  for (const [label, url, reason] of dotted) {
    assert.throws(() => assertFetchableUrl(url), (error) => {
      assert.ok(error instanceof UnsafeUrlError, `${label}: threw ${error.name}`);
      assert.strictEqual(error.reason, reason, `${label}: refused as ${error.reason}`);
      return true;
    }, `${label}: ACCEPTED — the root dot walked past layer 1`);
    tried += 1;
  }
  assert.strictEqual(tried, dotted.length, "the loop did not visit every dotted spelling");

  // And the layer that was doing all the work is not reached at all now: layer
  // 1 stops it before the resolver is asked, which is what the comment above
  // BLOCKED_HOSTS has always claimed. Driven through the real sink.
  installSpy();
  try {
    await assert.rejects(() => attachReceipt("https://metadata.google.internal./computeMetadata/v1/"), /public https address/);
    assert.strictEqual(dnsCalls.length, 0, `resolved ${dnsCalls.join(", ")} — layer 1 still lets the dotted name through`);
    assert.strictEqual(sent.length, 0, `fetched ${sent.map((c) => c.url).join(", ")}`);
  } finally { restoreSeam(); }

  // A legitimate name keeps working and is normalised to ONE spelling, so the
  // name that was checked is the name that is resolved and the name that goes
  // out as SNI — certificates are issued without the root dot.
  assert.strictEqual(assertFetchableUrl("https://files.example.com./invoice.pdf"), "https://files.example.com/invoice.pdf");
});

check("the transport bounds the whole request, not only the gaps between bytes", async () => {
  // Two halves, because the claim has two parts.
  //
  // Part 1, on a real socket: Node's `timeout` option is INACTIVITY. A server
  // that keeps dripping never trips it, however long it runs. Measured rather
  // than asserted from the docs, because the whole finding rests on it.
  const http = require("http");
  let drip;
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    drip = setInterval(() => res.write("x"), 40);           // never ends
  });
  await new Promise((res) => server.listen(0, "127.0.0.1", res));
  const port = server.address().port;
  let socketTimeoutFired = false;
  const started = Date.now();
  try {
    await new Promise((resolve, reject) => {
      const request = http.request({ hostname: "127.0.0.1", port, path: "/", agent: false, timeout: 150 }, (response) => {
        response.on("data", () => undefined);
      });
      request.on("timeout", () => { socketTimeoutFired = true; request.destroy(); resolve(); });
      request.on("error", reject);
      request.end();
      setTimeout(() => { request.destroy(); resolve(); }, 700);
    });
  } finally {
    clearInterval(drip);
    await new Promise((res) => server.close(res));
  }
  assert.ok(Date.now() - started > 400, "the drip did not run long enough to mean anything");
  assert.strictEqual(socketTimeoutFired, false,
    "a 150ms socket timeout fired against a 40ms drip — if Node's `timeout` has become a wall clock, the deadline below is redundant and this comment is wrong");

  // Part 2: so the transport carries its own deadline, and it fires while bytes
  // are still arriving. Without it this never settles at all, and the runner's
  // per-check timer is what reports it.
  const https = require("https");
  const { EventEmitter } = require("events");
  const realRequest = https.request;
  let destroyed = false;
  let dripping;
  https.request = (options, callback) => {
    const response = new EventEmitter();
    response.statusCode = 200;
    response.headers = { "content-type": "application/pdf" };
    response.destroy = () => { response.destroyed = true; };
    setImmediate(() => {
      callback(response);
      dripping = setInterval(() => response.emit("data", Buffer.from("x")), 20);   // no "end", ever
    });
    return { on() { return this; }, end() { }, destroy() { destroyed = true; clearInterval(dripping); } };
  };
  let outcome;
  try {
    outcome = await Promise.race([
      remote.pinnedHttpsRequest(new URL("https://files.example.com/slow.pdf"), {
        address: "93.184.216.34", family: 4, timeoutMs: 60000, deadlineMs: 250
      }).then((value) => `resolved with HTTP ${value.status}`, (error) => error),
      new Promise((res) => setTimeout(() => res("still running"), 3000))
    ]);
  } finally {
    https.request = realRequest;
    clearInterval(dripping);
  }
  assert.ok(outcome instanceof UnsafeUrlError, `expected a deadline refusal, got: ${outcome}`);
  assert.strictEqual(outcome.reason, "too_slow", `refused as ${outcome.reason}`);
  assert.ok(destroyed, "the deadline expired but the request was left open");

  // And it is a deadline, not a cap on everything: a prompt response is not
  // penalised by it.
  assert.strictEqual(remote.DEFAULT_DEADLINE_MS > remote.DEFAULT_TIMEOUT_MS, true,
    "the deadline is tighter than the inactivity timeout, which would make the timeout unreachable");
});

check("the transport stops reading at its byte cap, mid-stream", async () => {
  // Both sinks compare against 15MB, but only AFTER the whole body is in
  // memory; this cap is the one that exists while the bytes are still arriving,
  // and it is what bounds what a validated-but-hostile origin can make this
  // process hold. Written because removing `if (size > maxBytes)` left the
  // suite green — found by mutating the guard, not by reading it.
  const https = require("https");
  const { EventEmitter } = require("events");
  const realRequest = https.request;
  const CHUNK = 4096;
  const CHUNKS = 64;
  let delivered = 0;
  https.request = (options, callback) => {
    const response = new EventEmitter();
    response.statusCode = 200;
    response.headers = { "content-type": "application/pdf" };
    response.destroy = () => { response.destroyed = true; };
    setImmediate(() => {
      callback(response);
      const chunk = Buffer.alloc(CHUNK, 0x41);
      // Stops the moment the transport destroys the response, exactly as a real
      // socket would: what is measured is how much it accepted before saying no.
      for (let i = 0; i < CHUNKS && !response.destroyed; i += 1) {
        delivered += CHUNK;
        response.emit("data", chunk);
      }
      if (!response.destroyed) response.emit("end");
    });
    return { on() { return this; }, end() { }, destroy() { } };
  };
  try {
    await assert.rejects(
      () => remote.pinnedHttpsRequest(new URL("https://files.example.com/huge.pdf"), {
        address: "93.184.216.34", family: 4, maxBytes: 10 * 1024, deadlineMs: 5000
      }),
      (error) => {
        assert.ok(error instanceof UnsafeUrlError, `threw ${error.name}`);
        assert.strictEqual(error.reason, "too_large", `refused as ${error.reason}`);
        return true;
      },
      "the transport buffered an oversized body to the end instead of refusing it"
    );
  } finally { https.request = realRequest; }
  assert.ok(delivered < CHUNK * CHUNKS, `read all ${delivered} bytes — the cap is checked after buffering, not during`);
  assert.ok(delivered <= 10 * 1024 + CHUNK, `read ${delivered} bytes past a 10240-byte cap`);
});

/**
 * Runs THIS file as a child and reports what it said and what it exited with.
 *
 * `timeout` plus the throw on a signal is load-bearing: guarantee 3 is about a
 * run that never ends, so "the child came back at all" is part of what is being
 * asserted, not a convenience.
 */
function runSelfTestChild(env) {
  const { execFileSync } = require("child_process");
  try {
    const stdout = execFileSync(process.execPath, [__filename], {
      env: { ...process.env, ...env },
      encoding: "utf8", timeout: 90000, stdio: ["ignore", "pipe", "pipe"]
    });
    return { code: 0, stdout };
  } catch (error) {
    if (error.killed || error.signal) throw new Error(`the child never exited (${error.signal || "timeout"})`);
    return { code: error.status, stdout: String(error.stdout || "") };
  }
}

// NOT registered inside the child, which would spawn a child of its own, forever.
if (!SELFTEST) check("a check that never settles is reported, not skipped", async () => {
  // The runner's own guarantee, proved the only way it can be: by running this
  // file as a child with a check that hangs, and reading what the child says
  // and what it exits with. CI reads that exit code and nothing else.
  //
  // Against the old runner both halves go red: it printed the PASS lines up to
  // the stall, no FAIL, no banner, and exited 0.
  const run = (env) => runSelfTestChild({ SSRF_SELFTEST: "hang", ...env });

  // Guarantee 1: the per-check timer names the stalled check and lets the rest
  // of the file run. The budget is well above what any real check here needs
  // (the deadline check spends ~700ms proving the socket timeout is inactivity)
  // and only the deliberate stall trips it. That margin is the point: racing a
  // check does not cancel it, it abandons it, and an abandoned check still owns
  // its server, its interval and its monkey-patch of https.request. A tight
  // budget would tear real checks in half and hang the child on their leftovers
  // — measured at 400ms, which is why the default is 20s, not 1s.
  const timed = run({ SSRF_CHECK_TIMEOUT_MS: "4000" });
  assert.strictEqual(timed.code, 1, "a hung check exited 0 — CI would read this run as a pass");
  assert.match(timed.stdout, /FAIL {2}SELFTEST: a check that never settles - did not settle within 4000ms/,
    "the hung check was not reported by name");
  assert.ok(!timed.stdout.includes("✅"), "a run with a hung check printed the success banner");
  // PASS *or* FAIL: the property is that they REPORTED. Counting only passes
  // would couple this check to whether the rest of the suite is green, which is
  // not what it is about.
  const after = (timed.stdout.match(/^(PASS|FAIL) {2}/gm) || []).length;
  assert.ok(after >= 15, `only ${after} checks reported after the stall — the rest were skipped again`);
  assert.match(timed.stdout, /neither sink opens a connection any other way/,
    "the structural guard against a reintroduced bare fetch still does not run after a stall");

  // Guarantee 2, on its own: with the timer disabled the loop really does stall
  // and the process really does drain — the original failure mode exactly. The
  // exit hook is the only thing left, and it must turn that into a non-zero
  // exit. A completion count after the loop could not: the loop never gets
  // there.
  const drained = run({ SSRF_CHECK_TIMEOUT_MS: "0" });
  assert.strictEqual(drained.code, 1, "the runner drained the event loop mid-suite and exited 0");
  assert.match(drained.stdout, /left after 0\/\d+ checks without reaching a verdict/,
    "the exit hook did not say how much of the suite never ran");
});

if (!SELFTEST) check("a check that leaves a handle running is a failure, and the run still ends", async () => {
  // Guarantee 3, and the failure mode the earlier runner did not have a name
  // for. A check that RESOLVES while holding a timer, a socket or a listening
  // server passes; the runner then prints the ✅ banner and falls off the end
  // of its async IIFE, and the handle keeps the event loop alive forever. The
  // process never exits. CI's unit job burns its whole timeout-minutes budget
  // and `npm test`'s for-loop never reaches the remaining test files, with the
  // success banner as the last thing on stdout.
  //
  // Measured against the runner before this: all PASS lines, then ✅, then no
  // exit at all — killed by the harness, no exit code produced.
  //
  // The fix has two halves and this check separates them. Take out the leak
  // DETECTOR and the child still comes back — the explicit `leave()` after the
  // verdict is what ends it — and this check goes red on the exit code below
  // (measured: "a check that leaked a timer exited 0"). Take out `leave()`
  // instead and the detector still turns the leak into a failure, which routes
  // through `leave(1)`. So the detector is the row in the proved-by-removal
  // table, and the explicit exit is named here rather than claimed there.
  const leaked = runSelfTestChild({ SSRF_SELFTEST: "leak" });
  // runSelfTestChild throws on a signal, so simply arriving here proves the
  // child ended by itself rather than being killed.
  assert.strictEqual(leaked.code, 1, "a check that leaked a timer exited 0 — CI would read this run as a pass");
  assert.match(leaked.stdout, /FAIL {2}SELFTEST: a check that leaks a timer - left \d+ \w+ handle\(s\) running/,
    "the leaking check was not named");
  assert.ok(!leaked.stdout.includes("✅"), "a run that leaked a handle printed the success banner");
  // And the rest of the suite still ran: a leak is reported, not fatal.
  assert.match(leaked.stdout, /neither sink opens a connection any other way/,
    "the structural guard did not run in a child that leaked a handle");
});

if (!SELFTEST) check("an async throw is reported by name, with a count of what never ran", async () => {
  // Guarantee 4. A throw from a timer inside a check the loop is still awaiting
  // beats the per-check timer, so guarantee 1 never fires; and the exit hook
  // used to return early because the exit code was already non-zero. The
  // result was an honest non-zero exit with a bare stack: no FAIL line, no
  // check name, no verdict, and no statement of how much of the suite never
  // ran. All four of those are asserted here.
  const thrown = runSelfTestChild({ SSRF_SELFTEST: "throw" });
  assert.strictEqual(thrown.code, 1, "an async throw did not fail the run");
  assert.match(thrown.stdout, /FAIL {2}SELFTEST: a check that throws from a timer - an uncaught exception: thrown from a timer nobody awaits/,
    "the crash was not reported against the running check's name");
  assert.match(thrown.stdout, /an uncaught exception after 0\/\d+ checks — \d+ never ran/,
    "the crash did not say how much of the suite never ran");
  assert.ok(!thrown.stdout.includes("✅"), "a run that crashed printed the success banner");
});

// ---- the address table -----------------------------------------------------
check("the address table judges both families, and the mapped forms", () => {
  const priv = table("private addresses", [
    "0.0.0.0", "10.0.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.255",
    "192.168.0.1", "100.64.0.1", "192.0.0.192", "198.18.0.1", "203.0.113.5", "224.0.0.1", "255.255.255.255",
    "::", "::1", "0:0:0:0:0:0:0:1", "fc00::1", "fd00::1", "fe80::1", "fec0::1", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:169.254.169.254", "64:ff9b::7f00:1", "2001:db8::1", "2002:7f00:1::1", "100::1",
    // RFC 9637 documentation space (3fff::/20, reserved 2024) — the youngest
    // row here and the one that was missing. It sits inside global unicast
    // 2000::/3, so the catch-all "not global unicast" rule passes it and only a
    // named range stops it, exactly as for 2001:db8::/32 and 3ffe::/16. Both
    // ends of the prefix, because /20 is four bits into the third byte and a
    // /16 written by mistake would swallow 3fff:1000:: as well.
    "3fff::1", "3fff:0:0:0:0:0:0:2", "3fff:0fff:ffff:ffff:ffff:ffff:ffff:ffff"
  ], 30);
  for (const address of priv) assert.strictEqual(isPrivateAddress(address), true, `${address} was treated as public`);

  const publicOnes = table("public addresses", [
    "93.184.216.34", "1.1.1.1", "8.8.8.8", "2606:4700::1111", "2a00:1450:4009:81f::200e", "::ffff:93.184.216.34",
    // The neighbours of 3fff::/20, so that range stays a /20 and does not become
    // a /16 cut out of live global unicast. 3fff:1000:: is the first address
    // past the documentation prefix and is ordinary, allocatable space.
    "3ffd::1", "3f00::1", "3fff:1000::1", "3fff:8000::1"
  ], 9);
  for (const address of publicOnes) assert.strictEqual(isPrivateAddress(address), false, `${address} was treated as private`);

  // Anything unparseable is refused rather than guessed at.
  const junkRows = table("unparseable inputs", ["", null, undefined, "not-an-address", "999.1.1.1", "::gg"], 6);
  for (const junk of junkRows) {
    assert.strictEqual(isPrivateAddress(junk), true, `${JSON.stringify(junk)} was treated as public`);
  }
});

check("the WooCommerce client uses the shared table, not a third copy", () => {
  // The pattern already existed; the point of Phase 2 was to stop having three
  // of it. If a copy comes back, this goes red.
  const fs = require("fs");
  const read = (p) => fs.readFileSync(path.join(__dirname, "..", "..", p), "utf8");
  const client = read("commerce/woo/client.js");
  const url = read("commerce/woo/url.js");
  assert.ok(client.includes("security/privateAddress"), "the Woo client no longer shares the table");
  assert.ok(url.includes("security/privateAddress"), "commerce/woo/url.js no longer shares the table");
  assert.ok(!/const PRIVATE_V4 = /.test(url), "commerce/woo/url.js grew its own range table again");
  assert.ok(!/dns\.promises\.lookup/.test(client), "the Woo client resolves on its own again");
});

// ---- neither sink may fetch any other way ----------------------------------
//
// THIS IS THE ONLY THING WATCHING FOR A FUTURE CALL SITE THAT CONNECTS ON ITS
// OWN, so its two halves — how much it reads, and what it recognises — are
// themselves proved by the check below it.
//
// It used to read a FIXED BYTE WINDOW: slice(marker, 3000) over a function that
// is 10006 bytes long, and slice(marker, 3500) over one that is 4583. Roughly
// 7000 bytes of the live receipt sink and 1000 of the photo sink were never
// scanned at all, and an `await fetch(url)` inserted past the window left the
// suite at exit 0, 23 PASS, banner and all. It also could not SEE two shapes it
// claims to catch: `/[^.\w]fetch\(/` excludes anything preceded by a dot, which
// lets `globalThis.fetch(` through, and the redirect test was
// `includes('redirect: "follow"')`, a double-quoted literal that a single
// quote defeats.
//
// So: the region is the WHOLE function, from its signature to the closing brace
// in column 0 that ends it, and the shapes are matched by
// `outboundConnectionOffences` — one function, used by the real check and by
// the mutation self-test, so neither can drift from the other.

/** The source of one whole top-level function, signature to closing brace. */
function wholeFunction(source, signature) {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => line.startsWith(signature));
  assert.ok(start >= 0, `${signature} is not in index.js under that name`);
  let end = start + 1;
  while (end < lines.length && lines[end] !== "}") end += 1;
  assert.ok(end < lines.length, `${signature} has no closing brace in column 0 — the scan would run to EOF`);
  return lines.slice(start, end + 1).join("\n");
}

/**
 * Drops whole-line comments before the scan below reads the code.
 *
 * Both sinks carry a paragraph about the defect that used to live in them, and
 * a scan that reads text cannot be allowed to mistake a sentence about a bare
 * fetch for a bare fetch — the first false positive is how a check like this
 * gets weakened instead of fixed. Only FULL-LINE comments go: a trailing `//`
 * cannot be stripped safely, because `"https://…"` contains one.
 */
function stripFullLineComments(text) {
  return text.split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");
}

/**
 * Every way a call site could open its own connection, in the shapes a person
 * would actually type. Returns the names of what it found, so a check can say
 * which shape it is objecting to.
 */
function outboundConnectionOffences(source) {
  const text = stripFullLineComments(source);
  const found = [];
  // A bare `fetch(` — but not `safeRemoteFetch(`/`nvFetchRemoteDocument(`,
  // which is what the leading non-word character excludes — plus the qualified
  // spellings of the same global, which the old dot-excluding form let past.
  if (/(?:^|[^.\w])fetch\s*\(/.test(text)) found.push("fetch(");
  if (/\b(?:globalThis|global|window|self|undici)\s*\.\s*fetch\s*\(/.test(text)) found.push("globalThis.fetch(");
  // The transport layer under it. remoteFetch.js's own residual note says this
  // check is what watches for a future call site calling https.request itself;
  // until now it did not look for that at all.
  if (/\b(?:https?|net|tls)\s*\.\s*(?:request|connect|get)\s*\(/.test(text)) found.push("https.request(");
  // Any quoting of redirect following, including a template literal.
  if (/redirect\s*:\s*(?:"follow"|'follow'|`follow`)/.test(text)) found.push('redirect: "follow"');
  return found;
}

const SINKS = table("the sinks that fetch a caller's URL", [
  // Column 3 is a string from the LAST few lines of each function. It is what
  // makes "the whole function" measurable rather than asserted: a scan that
  // stops early cannot contain it.
  ["the receipt sink", "async function nvChatGPTAttachBankReceipt(", "Several transactions could match."],
  ["the photo sink", "async function nvChatGPTCreateInventoryItem(", "add it from the item's photo button."]
], 2);

check("neither sink opens a connection any other way", () => {
  const fs = require("fs");
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");

  for (const [label, signature, tailMarker] of SINKS) {
    const body = wholeFunction(source, signature);
    assert.ok(body.includes(tailMarker),
      `${label}: the scanned region stops before the end of the function — it is ${body.length} bytes and does not reach "${tailMarker}"`);
    assert.ok(body.includes("nvFetchRemoteDocument("), `${label} no longer goes through the shared door`);
    assert.deepStrictEqual(outboundConnectionOffences(body), [], `${label} opens its own connection`);
  }

  // The ternary that was the whole defect, in both of its shapes.
  assert.ok(!/\?\s*photoUrl\s*:/.test(source), "the inventory ternary is back");
  assert.ok(!/\?\s*chatFileUrl\s*:/.test(source), "the receipt ternary is back");
  assert.ok(!/redirect\s*:\s*(?:"follow"|'follow'|`follow`)/.test(source), "something in index.js follows redirects again");

  // And the door itself must not have learned to follow one.
  const door = fs.readFileSync(path.join(__dirname, "..", "..", "security", "remoteFetch.js"), "utf8");
  const code = stripFullLineComments(door);
  assert.ok(!/redirect\s*:\s*(?:"follow"|'follow'|`follow`)/.test(code), "the door follows redirects");
  assert.ok(!/location/i.test(code.replace(/"[^"]*"/g, "")), "the door reads a Location header");
});

check("the structural scan reads the whole sink, and sees the shapes it claims to", () => {
  // The check above is only worth its place if it would actually catch what it
  // says it catches, so the catching is measured here rather than trusted —
  // against copies of the real source held in memory. Nothing is written.
  //
  // Both halves reproduce a mutation that went GREEN against the previous
  // version of the check: a probe past its byte window, and two spellings it
  // could not match inside the window.
  const fs = require("fs");
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");

  const probes = table("probe shapes", [
    ["a bare fetch", "  if (globalThis.__probe) { await fetch(String(globalThis.__probe)); }", "fetch("],
    ["a qualified fetch", "  if (globalThis.__probe) { await globalThis.fetch(String(globalThis.__probe)); }", "globalThis.fetch("],
    ["a raw https request", "  if (globalThis.__probe) { https.request(String(globalThis.__probe)); }", "https.request("],
    ["a single-quoted redirect", "  if (globalThis.__probe) { await f(u, { redirect: 'follow' }); }", 'redirect: "follow"'],
    ["a double-quoted redirect", "  if (globalThis.__probe) { await f(u, { redirect: \"follow\" }); }", 'redirect: "follow"'],
    ["a back-ticked redirect", "  if (globalThis.__probe) { await f(u, { redirect: `follow` }); }", 'redirect: "follow"']
  ], 6);

  for (const [label, signature] of SINKS) {
    const body = wholeFunction(source, signature);
    const closing = body.lastIndexOf("\n}");
    assert.ok(closing > 0, `${label}: could not find the closing brace of the extracted body`);

    for (const [probeLabel, probe, expected] of probes) {
      // At the very END of the function — the position the old fixed window
      // could not see. An identical probe inserted at index.js:25013 (receipt)
      // and after `photoStored = true;` (photo) left the suite green.
      const mutated = `${body.slice(0, closing)}\n${probe}${body.slice(closing)}`;
      const offences = outboundConnectionOffences(mutated);
      assert.ok(offences.includes(expected),
        `${label}: ${probeLabel} at the end of the function was not seen — the scan reported [${offences.join(", ")}]`);
    }
  }

  // And the shapes that must NOT trip it, or the check would be unusable and
  // would be weakened rather than fixed the first time it cried wolf.
  const innocent = table("innocent shapes", [
    "const response = await safeRemoteFetch(url, { accept });",
    "const response = await nvFetchRemoteDocument(photoUrl, \"image/*\");",
    "return await remoteFetch.safeRemoteFetch(rawUrl, { accept });",
    "const sent = await this.prefetch(url);",
    "const redirects = { follow: false };",
    // The two comment rows are the point of stripFullLineComments: both sinks
    // carry a paragraph describing the defect they used to have, and a scan
    // that reads text must not mistake the description for the thing.
    "// the ternary sent every https URL straight to fetch(u), unguarded",
    "  * redirect: \"follow\" at both sinks is what this removed"
  ], 7);
  for (const line of innocent) {
    assert.deepStrictEqual(outboundConnectionOffences(line), [], `a legitimate line was flagged: ${line}`);
  }
});

// ---- the allowlist is a set, and it has one member on purpose ---------------
check("the scheme allowlist is a set with https as its only member", () => {
  // Widening this to http would not be implementing "allow only http/https" —
  // neither sink has ever accepted cleartext, because the prefix test they used
  // rejected it. It would be a downgrade wearing the fix's clothes.
  assert.ok(ALLOWED_SCHEMES instanceof Set, "the allowlist is not a Set");
  assert.deepStrictEqual([...ALLOWED_SCHEMES], ["https:"]);
  assert.throws(() => assertFetchableUrl("http://example.com/x"), UnsafeUrlError);
});

check("the validator returns the value the caller must fetch", () => {
  // The shape that makes the old defect unexpressible: there is no boolean to
  // ignore and no second variable to fetch instead.
  assert.strictEqual(assertFetchableUrl("https://example.com/a.pdf"), "https://example.com/a.pdf");
  assert.strictEqual(assertFetchableUrl("  https://example.com/a.pdf  "), "https://example.com/a.pdf");
  assert.strictEqual(assertFetchableUrl("https://example.com:443/a.pdf"), "https://example.com/a.pdf");
});

// Guarantee 3's instrument. `getActiveResourcesInfo()` is a multiset of handle
// TYPE names, not identities, so what a leak looks like here is a count that
// went up during one check and never came back down. Attribution is to the
// first check that raised it, which is the one that has to be fixed.
const resourceCounts = () => {
  const counts = new Map();
  for (const kind of process.getActiveResourcesInfo()) counts.set(kind, (counts.get(kind) || 0) + 1);
  return counts;
};

// Registered LAST on purpose: the tables declared inside a check only reach
// TABLES when that check has run, so this has to be the final one.
check("no check loops over a table that has been emptied", () => {
  // Every named table, and the floor below which its loop stops testing what
  // its missing rows covered. Naming them here as well as at each declaration
  // is the point: deleting a `table(...)` wrapper is as effective a way to make
  // a guard vacuous as emptying the list, and only this list catches that.
  const expected = [
    "HOSTILE", "the sinks that fetch a caller's URL",
    "mixed answers", "the layer-2 table", "dotted spellings",
    "private addresses", "public addresses", "unparseable inputs",
    "probe shapes", "innocent shapes"
  ];
  const seen = new Map(TABLES.map((row) => [row.name, row]));
  for (const name of expected) {
    assert.ok(seen.has(name), `the table "${name}" was never declared — its loop, if it still exists, is running over something unchecked`);
  }
  for (const row of TABLES) {
    assert.ok(row.isList, `${row.name} is not a list`);
    assert.ok(row.count >= row.minimum,
      `${row.name} has ${row.count} rows, expected at least ${row.minimum} — a loop over a short table quietly stops testing the guards its missing rows covered`);
  }
});

(async () => {
  // Node creates the stdout/stderr handles lazily, on the first write. Without
  // this priming they appear during check 1 and are reported as its leak.
  process.stdout.write("");
  process.stderr.write("");
  const baseline = resourceCounts();
  const raisedBy = new Map();             // handle kind -> the check that first raised its count

  for (const { name, run } of checks) {
    let timer = null;
    current = name;
    try {
      // The timer is deliberately NOT unref'd. Unref'ing it would reproduce the
      // bug it exists to catch: with a stalled check and no other handle, the
      // loop would drain and the process would leave before the timer fired.
      const settled = CHECK_TIMEOUT_MS > 0
        ? Promise.race([
          Promise.resolve().then(run),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`did not settle within ${CHECK_TIMEOUT_MS}ms`)), CHECK_TIMEOUT_MS); })
        ])
        : Promise.resolve().then(run);
      await settled;
      console.log("PASS ", name);
    } catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 300)); }
    finally { if (timer) clearTimeout(timer); }
    reported += 1;
    const now = resourceCounts();
    for (const [kind, count] of now) {
      if (count > (baseline.get(kind) || 0) && !raisedBy.has(kind)) raisedBy.set(kind, name);
    }
  }
  current = null;
  restoreSeam();

  // Anything still above the baseline once the loop has had two turns to settle
  // is a handle a check left running — and it is what would hold this process
  // open after the verdict below.
  await new Promise((res) => setImmediate(res));
  await new Promise((res) => setImmediate(res));
  const final = resourceCounts();
  const leaks = [];
  for (const [kind, count] of final) {
    const over = count - (baseline.get(kind) || 0);
    if (over > 0) leaks.push({ kind, over, name: raisedBy.get(kind) || "(unattributed)" });
  }
  for (const leak of leaks) {
    failures += 1;
    console.log("FAIL ", leak.name, `- left ${leak.over} ${leak.kind} handle(s) running after it settled — that is what wedges a run after the banner`);
  }

  finished = true;
  if (reported !== checks.length) { console.log(`\n❌ ${checks.length - reported} checks never reported`); leave(1); return; }
  if (failures) { console.log(`\n❌ ${failures} failing`); leave(1); return; }
  console.log("\n✅ SSRF CONTAINMENT + HARDENING GEÇTİ");
  leave(0);
})();
