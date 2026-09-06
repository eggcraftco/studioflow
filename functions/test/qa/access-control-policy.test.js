// The access control policy, pinned to the rules it describes.
//
// A policy document is a claim about a system. These checks read the deployed
// security rules and confirm the claim is still true — and one of them is a
// trip-wire: the policy promises that Amazon buyer data will live in a
// rules-protected subcollection rather than in the order document, and that
// promise becomes enforced the moment somebody wires the Amazon adapter into an
// ingestion path.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const root = path.join(__dirname, "..", "..");
const repo = path.join(root, "..");
const policyPath = path.join(repo, "docs", "security", "access-control-policy.md");
const policy = fs.existsSync(policyPath) ? fs.readFileSync(policyPath, "utf8") : "";
const rules = fs.readFileSync(path.join(repo, "firestore.rules"), "utf8");

check("the policy exists", () => {
  assert.ok(policy, `no access control policy at ${policyPath}`);
});

// ---- what the policy says the database enforces -------------------------------

check("a workspace cannot read another workspace's orders", () => {
  assert.ok(/function canReadCompany\(companyId\)/.test(rules), "canReadCompany is gone");
  assert.ok(/function canReadOrderDocument\(data\)/.test(rules), "order reads no longer go through one check");
  const fn = rules.slice(rules.indexOf("function canReadOrderDocument(data)"));
  assert.ok(/canReadCompany\(data\.companyId\)/.test(fn.slice(0, 400)),
    "an order read no longer checks the reader belongs to that workspace");
});

check("the three order tiers the policy names still exist", () => {
  for (const fn of ["isWorkflowOnlyMember", "isAssignedOnlyCustomMember", "usesWorkflowSafeView"]) {
    assert.ok(new RegExp(`function ${fn}\\(`).test(rules), `the policy describes a tier that ${fn} no longer implements`);
  }
  // Workflow Only must not reach the full order document — that is the whole
  // point of the finance-free view.
  const orders = rules.slice(rules.indexOf("match /siparisler/{orderId}"));
  assert.ok(/allow read: if canReadOrderDocument\(resource\.data\)\s*\n\s*&& !usesWorkflowSafeView\(resource\.data\.companyId\);/.test(orders),
    "a Workflow Only member can now read the full order document");
});

check("suspension is a server-only fact, not a member-writable flag", () => {
  assert.ok(/function memberSuspended\(companyId\)/.test(rules), "suspension is no longer checked in rules");
  assert.ok(/suspendedMembers/.test(rules), "the suspension map is gone from the rules");
  // The protected list lives in the rules, which is what makes it a database
  // fact rather than a server convention.
  const protectedList = rules.slice(rules.indexOf("function protectedBillingFields()"));
  assert.ok(/'suspendedMembers'/.test(protectedList.slice(0, 1500)),
    "suspendedMembers left the protected list, so an owner's client can write it");
});

check("the bank feed is gated in the rules, not only in the app", () => {
  assert.ok(/function canReadBankFeed\(companyId\)/.test(rules), "the bank feed gate is gone");
  assert.ok(/memberAccessAllows\(companyId, 'bankFeed'\)/.test(rules),
    "the bank feed no longer checks the per-member grant");
});

check("the access log stays owner-read and client-unwritable", () => {
  const block = rules.slice(rules.indexOf("piiAccessLog"));
  assert.ok(/allow read: if isCompanyOwner\(companyId\);/.test(block.slice(0, 400)), "the access log is readable by members");
  assert.ok(/allow write: if false;/.test(block.slice(0, 400)), "a client can write the access log");
  // The wildcard is a deny-list: named in both blocks, or all members read it.
  const denials = rules.match(/collectionId != 'piiAccessLog'/g) || [];
  assert.strictEqual(denials.length, 2,
    `piiAccessLog must be excluded from both wildcard blocks; found ${denials.length}`);
});

// ---- the trip-wire ------------------------------------------------------------

// Where a marketplace buyer's details are allowed to be written, and the rules
// that have to exist first. Kept as constants so the message can name them.
const RESTRICTED = "restrictedCustomer";
const RESTRICTED_MATCH = `match /companies/{companyId}/${RESTRICTED}/{orderId}`;

/** Every non-test JavaScript file under functions/ that pulls in the Amazon adapter. */
function amazonAdapterCallers() {
  const found = [];
  // Any way of naming the module: require, require with .js, dynamic import,
  // ESM import, a re-export. The first version of this looked only for a bare
  // require() and would have watched an ESM import ship past it.
  const references = /(?:require\s*\(|import\s*\(|from\s*)["'][^"']*adapters\/amazon(?:\.js)?["']/;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "test" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(js|mjs|cjs)$/.test(entry.name)) continue;
      if (references.test(fs.readFileSync(full, "utf8"))) found.push(path.relative(root, full));
    }
  };
  walk(root);
  return found;
}

check("the rules for a marketplace buyer's details are correct whether or not they exist yet", () => {
  // Checked unconditionally. A trip-wire that only looks once the connector has
  // shipped is a trip-wire nobody has ever seen work, and this one was wrong in
  // three ways before anybody read it closely.
  const at = rules.indexOf(RESTRICTED_MATCH);
  if (at < 0) {
    // Not built yet is a legitimate state — but then nothing may reference the
    // collection either, or something is writing where no rule protects it.
    assert.ok(!new RegExp(`['"\`]${RESTRICTED}['"\`]`).test(rules),
      `${RESTRICTED} is named in the rules but has no match block of its own`);
    return;
  }
  const block = rules.slice(at, at + 300);
  assert.ok(/allow read, write: if false;/.test(block),
    "the restricted collection is reachable from a client. Reads must go through a callable that " +
    "records the access — a read straight from a phone to Firestore is invisible to the access log.");
  // The wildcard rules OR with this one: absent from either list, every member
  // can read it whatever the block above says.
  const denials = rules.match(new RegExp(`collectionId != '${RESTRICTED}'`, "g")) || [];
  assert.strictEqual(denials.length, 2,
    `${RESTRICTED} must be excluded from BOTH wildcard deny-lists; found ${denials.length}`);
});

check("if the Amazon connector has shipped, the buyer never reaches the order document", () => {
  const wiredBy = amazonAdapterCallers();
  if (!wiredBy.length) {
    // Nothing ingests Amazon orders yet, so there is nothing to protect. The
    // outbound denial stands on its own and is tested separately.
    return;
  }
  const where = wiredBy.join(", ");
  assert.ok(rules.includes(RESTRICTED_MATCH),
    `the Amazon adapter is wired in by ${where}, and access control policy §5 requires the buyer's ` +
    `details to live in a rules-protected collection. Add "${RESTRICTED_MATCH}" — and name ` +
    `${RESTRICTED} in BOTH wildcard deny-lists — before shipping.`);

  // The rules being right is not the same as the code obeying them. The shared
  // engine writes shopOwnedFields — customerName, emailAddress, shippingName,
  // the street address — straight onto the order, so an Amazon path that
  // follows the Square and Woo pattern faithfully breaks §5 on its first order
  // and nothing in the engine complains.
  const diverted = wiredBy.some((rel) => {
    const body = fs.readFileSync(path.join(root, rel), "utf8");
    return new RegExp(`["'\`]${RESTRICTED}["'\`]`).test(body);
  });
  assert.ok(diverted,
    `${where} pulls in the Amazon adapter but never mentions ${RESTRICTED}. The adapter fills in the ` +
    "buyer's name, email, phone and both addresses, and the shared engine writes those onto the order " +
    "document. The ingestion path has to divert them before the engine sees them.");
});

check("if Amazon or eBay has shipped, its secrets are not readable by every function", () => {
  // Every function runs as the default compute service account, so a secret
  // granted to one is reachable by all of them. Tolerable for what ships today;
  // not tolerable for the key that opens a seller's marketplace account — and
  // eBay's obligations are the same class as Amazon's, so the same rule.
  const wiredBy = amazonAdapterCallers();
  const source = fs.readFileSync(path.join(root, "index.js"), "utf8");
  const marketplaceSecrets = [...source.matchAll(/defineSecret\("((?:AMAZON|EBAY)_[A-Z_0-9]*|NIVADESK_(?:AMAZON|EBAY)_[A-Z_0-9]*)"\)/g)].map((m) => m[1]);

  if (!wiredBy.length && !marketplaceSecrets.length) return; // nothing to protect yet

  assert.ok(marketplaceSecrets.length > 0,
    `the Amazon adapter is wired in by ${wiredBy.join(", ")} but no Amazon secret is declared — ` +
    "where is the credential coming from?");

  // The eBay secrets are declared behind a marker file, and every eBay trigger
  // spreads EBAY_RUNTIME — which must carry the dedicated identity beside the
  // secrets, so the two cannot be separated by a later edit.
  if (marketplaceSecrets.some((name) => /EBAY/.test(name))) {
    assert.ok(/const EBAY_RUNTIME = EBAY_SECRETS_READY \? \{ secrets: EBAY_SECRET_PARAMS, serviceAccount: EBAY_SERVICE_ACCOUNT \} : \{\};/.test(source),
      "EBAY_RUNTIME no longer carries the dedicated service account beside the eBay secrets");
    assert.ok(/const EBAY_SERVICE_ACCOUNT = "ebay-connector@eggcraft-studio\.iam\.gserviceaccount\.com";/.test(source),
      "the eBay service account is no longer named");
  }

  // Any trigger that mounts a marketplace secret must run as its own identity:
  // a literal serviceAccount, or the EBAY_RUNTIME spread that carries one.
  const mounts = [...source.matchAll(/secrets:\s*\[([^\]]*)\]/g)]
    .map((m) => ({ list: m[1], at: m.index }))
    .filter((entry) => marketplaceSecrets.some((name) => entry.list.includes(name)) || /AMAZON|EBAY_SECRET/.test(entry.list));
  for (const mount of mounts) {
    const options = source.slice(Math.max(0, mount.at - 400), mount.at + mount.list.length + 200);
    assert.ok(/serviceAccount:\s*["'`]/.test(options) || /serviceAccount: EBAY_SERVICE_ACCOUNT/.test(options) || /\.\.\.EBAY_RUNTIME/.test(options),
      "a function mounts a marketplace secret while running as the default compute service account, which " +
      "every other function also runs as. Give the marketplace functions a dedicated service account and " +
      "grant their secrets only to it — see access-control-policy.md, 'Open remediation'.");
  }
  // And no eBay secret may be mounted by name outside the runtime bundle.
  const bareMounts = [...source.matchAll(/secrets:\s*\[[^\]]*EBAY_[A-Z_]+[^\]]*\]/g)].filter((m) => !/EBAY_SECRET_PARAMS/.test(m[0]));
  assert.deepStrictEqual(bareMounts.map((m) => m[0]), [], "an eBay secret is mounted outside EBAY_RUNTIME");
});

// The trip-wire above is one-directional: it asks whether a function that NAMES
// a marketplace secret also names an identity. It says nothing about a function
// that USES marketplace code without mounting the secret at all — which is the
// same policy broken from the other side, and fails at runtime rather than at
// deploy. releaseHeldIntegrationOrders did exactly that: it called into the eBay
// connector's internals, which unbox the seller's token under EBAY_TOKEN_KEY, in
// a shared callable that mounts no eBay secret. `process.env.EBAY_TOKEN_KEY` is
// undefined there, so every held eBay order failed to release, silently, into a
// counter that reported 'left in place'.
check("a function that runs eBay connector code also mounts the eBay runtime", () => {
  const source = fs.readFileSync(path.join(root, "index.js"), "utf8");
  // Top-level symbols in file order: exported triggers, const triggers and
  // plain functions. Each one's body runs to the next symbol's start.
  const marks = [];
  for (const m of source.matchAll(/^(?:exports\.(\w+)\s*=\s*(on[A-Za-z]+)\(|const\s+(\w+)\s*=\s*(on[A-Za-z]+)\(|(?:async\s+)?function\s+(\w+)\s*\()/gm)) {
    marks.push({ name: m[1] || m[3] || m[5], trigger: Boolean(m[2] || m[4]), at: m.index });
  }
  const symbols = marks.map((mark, i) => ({ ...mark, body: source.slice(mark.at, i + 1 < marks.length ? marks[i + 1].at : source.length) }));
  const mountsRuntime = (symbol) => /\.\.\.EBAY_RUNTIME/.test(symbol.body.slice(0, 600));
  const usesEbayInternals = (body) => /ebayExports\._internal\./.test(body);

  // Which triggers can reach a symbol, following plain functions up to their
  // callers (runEbayEventTask is a plain function; ebayEventWorker is what runs it).
  const triggersReaching = (symbol, seen = new Set()) => {
    if (seen.has(symbol.name)) return [];
    seen.add(symbol.name);
    if (symbol.trigger) return [symbol];
    const callers = symbols.filter((other) => other !== symbol && new RegExp(`\\b${symbol.name}\\s*\\(`).test(other.body));
    return callers.flatMap((caller) => triggersReaching(caller, seen));
  };

  const users = symbols.filter((symbol) => usesEbayInternals(symbol.body));
  assert.ok(users.length > 0, "nothing in index.js calls the eBay connector any more — has the wiring moved?");
  for (const user of users) {
    const triggers = triggersReaching(user);
    assert.ok(triggers.length > 0, `${user.name} runs eBay connector code but no trigger reaches it`);
    for (const trigger of triggers) {
      assert.ok(mountsRuntime(trigger),
        `${trigger.name} reaches eBay connector code (through ${user.name}) without spreading EBAY_RUNTIME. ` +
        "The eBay internals unbox the seller's credentials under EBAY_TOKEN_KEY, which is mounted only by that " +
        "bundle — so this throws \"No eBay key is configured.\" in production. Adding `secrets:` alone is not the " +
        "fix: secrets and the ebay-connector@ identity travel together (access-control-policy.md §5). Hand the " +
        "work to ebayEventWorker instead, the way retryCommerceEvent does.");
    }
  }
});

// ---- the document keeps itself current ----------------------------------------

check("the policy is reviewed every six months, and is not overdue", () => {
  assert.ok(/reviewed \*\*every six months\*\*/.test(policy), "the six-month cadence is no longer stated");
  const match = policy.match(/\*\*Next scheduled review:\*\*\s*(\d{1,2}) (\w+) (\d{4})/);
  assert.ok(match, "the next review date cannot be read");
  const due = new Date(`${match[1]} ${match[2]} ${match[3]} UTC`);
  assert.ok(due.getTime() > Date.now(),
    `the access control policy was due for review on ${match[1]} ${match[2]} ${match[3]}. ` +
    "Check the operator accounts and their two-factor, re-read the rules against §3, record the review in §8, " +
    "and move the date on six months.");
});

check("the policy still admits which controls are interface-level", () => {
  // The honest paragraph is the load-bearing one. A policy that quietly drops it
  // starts claiming database enforcement it does not have.
  assert.ok(/What is enforced by the interface/.test(policy), "§4 is gone");
  assert.ok(/are \*\*not\*\* database rules\./.test(policy),
    "the policy no longer says the per-card capabilities are interface-level");
  // The other uncomfortable paragraph. It is the record of a known weakening,
  // and a document that quietly drops it starts claiming least privilege it
  // does not have.
  assert.ok(/Open remediation: one identity can read every secret/.test(policy),
    "the policy no longer records that every function runs as the same service account");
  assert.ok(/Before the Amazon connector serves a production seller/.test(policy),
    "the policy no longer states when that stops being acceptable");
  assert.ok(/and the eBay connector\s+likewise/.test(policy),
    "the policy no longer says the eBay connector is held to the same separation");
  assert.ok(/ebay-connector@eggcraft-studio/.test(policy) && /ebayEventWorker/.test(policy),
    "the policy no longer names eBay's identity and its own worker");
});

for (const { name, run } of checks) {
  try { run(); console.log(`PASS  ${name}`); }
  catch (error) { failures += 1; console.log(`FAIL  ${name} - ${error.message}`); }
}
if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
console.log("\n✅ ACCESS CONTROL POLICY GEÇTİ");
