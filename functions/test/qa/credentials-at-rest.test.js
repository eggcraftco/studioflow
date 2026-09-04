// No connector keeps a credential in the clear.
//
// This started as one question — "are all the secrets really encrypted at
// rest?" — and the answer was no. Everything from Etsy onwards had been sealed
// in an AES-256-GCM envelope, and two connectors had been missed: the bank feed
// stored a TrueLayer refresh token as a plain string, and Pandle stored both of
// its tokens the same way. Nothing looked wrong. Each connector was written on
// its own and nobody had ever read them side by side.
//
// So this file reads them side by side, every run.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const box = require("../../security/tokenBox");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const root = path.join(__dirname, "..", "..");
const read = (...p) => fs.readFileSync(path.join(root, ...p), "utf8");

// ---- the envelope itself ------------------------------------------------------

check("the envelope has one implementation, not a copy per connector", () => {
  // A second copy is how two connectors end up with different rules, which is
  // the shape of the bug this file exists for.
  const copies = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "test" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith(".js")) continue;
      if (full.endsWith(path.join("security", "tokenBox.js"))) continue;
      if (/function encryptToken\s*\(/.test(fs.readFileSync(full, "utf8"))) copies.push(path.relative(root, full));
    }
  };
  walk(root);
  assert.deepStrictEqual(copies, [], `a second copy of the envelope: ${copies.join(", ")}`);
});

check("a sealed credential survives the key it was sealed with being retired", () => {
  const retired = "a".repeat(64);
  const current = "b".repeat(64);
  const sealed = box.encryptToken("a refresh token", retired);
  assert.strictEqual(box.decryptToken(sealed, [current, retired]), "a refresh token");
  assert.strictEqual(box.tokenNeedsRebox(sealed, [current, retired]), true);
  const resealed = box.encryptToken("a refresh token", [current, retired]);
  assert.strictEqual(resealed.k, box.tokenKeyId(current), "the box was resealed with the wrong key");
  assert.strictEqual(box.tokenNeedsRebox(resealed, [current, retired]), false);
  // A box nobody holds a key for fails loudly. Returning "" here would look
  // exactly like "this workspace never connected", and the connector would
  // quietly ask the customer to reconnect a connection that was fine.
  assert.throws(() => box.decryptToken(sealed, ["c".repeat(64)]), /could not|Unsupported|unable/i);
});

// ---- every connector that stores a credential ---------------------------------

const CONNECTORS = [
  { name: "Etsy", file: ["etsyConnect.js"], evidence: /encryptToken\(/ },
  { name: "the bank feed (TrueLayer)", file: ["bankFeed.js"], evidence: /refreshTokenBox: encryptToken\(/ },
  { name: "Pandle", file: ["pandle.js"], evidence: /accessTokenBox: encryptToken\(/ },
  { name: "accounting (QuickBooks and Xero)", file: ["accountingFunctions.js"], evidence: /encryptToken\(plain, credentialsFor\(provider\)\.tokenKey\(\)\)/ }
];

for (const connector of CONNECTORS) {
  check(`${connector.name} seals what it stores`, () => {
    const source = read(...connector.file);
    assert.ok(connector.evidence.test(source),
      `${connector.name} no longer seals its credential before storing it`);
  });
}

check("the bank feed refuses to store a consent it cannot seal", () => {
  const source = read("bankFeed.js");
  // The alternative — falling back to plain text when the key is missing — is
  // how the clear-text row appears again, quietly, on the day a deploy forgets
  // the secret.
  assert.ok(/could not be stored securely because the server's token key is not configured/.test(source),
    "a missing key no longer stops the bank consent being written");
  assert.ok(/refreshTokenBox/.test(source), "the sealed field is gone");
});

check("Pandle refuses to store tokens it cannot seal", () => {
  const source = read("pandle.js");
  assert.ok(/could not be stored securely because the server's token key is not configured/.test(source),
    "a missing key no longer stops the Pandle tokens being written");
});

check("a row still in the clear is read, and marked for sealing", () => {
  // Sealing new writes only would leave every existing connection in plain text
  // for as long as it lives, and a grep for the word "needsSealing" would pass
  // over a version of this that always answered false. So the decision is a
  // function, called here with the shapes the database actually holds.
  const key = "d".repeat(64);
  const legacy = box.openCredential({ box: null, legacy: "plain-refresh-token" }, [key]);
  assert.strictEqual(legacy.token, "plain-refresh-token", "a row written before sealing stopped being readable");
  assert.strictEqual(legacy.needsSealing, true, "a plain-text row is not noticed, so the migration never happens");

  const sealed = box.encryptToken("plain-refresh-token", key);
  const current = box.openCredential({ box: sealed, legacy: "" }, [key]);
  assert.strictEqual(current.token, "plain-refresh-token");
  assert.strictEqual(current.needsSealing, false, "an already-sealed row is rewritten on every single use");

  const rotated = box.openCredential({ box: sealed, legacy: "" }, ["e".repeat(64), key]);
  assert.strictEqual(rotated.token, "plain-refresh-token", "a rotation loses connections sealed with the old key");
  assert.strictEqual(rotated.needsSealing, true, "a row on a retired key is never moved, so the key can never be retired");

  // With no key configured nothing is marked for sealing — marking a row we
  // cannot then seal breaks a working connection — and a sealed row reports
  // itself unreadable rather than empty.
  const keyless = box.openCredential({ box: null, legacy: "plain-refresh-token" }, []);
  assert.strictEqual(keyless.needsSealing, false);
  assert.strictEqual(keyless.token, "plain-refresh-token");
  const lockedOut = box.openCredential({ box: sealed, legacy: "" }, []);
  assert.strictEqual(lockedOut.unreadable, true, "a sealed row with no key reads as 'never connected'");
  assert.strictEqual(lockedOut.token, "");
});

check("both connectors route their migration through that one decision", () => {
  const bank = read("bankFeed.js");
  assert.ok(/openCredential\(\{/.test(bank), "the bank feed decides for itself again");
  assert.ok(/refreshToken: admin\.firestore\.FieldValue\.delete\(\)/.test(bank),
    "the bank feed leaves the plain-text field behind after sealing");
  const pandle = read("pandle.js");
  assert.ok(/openCredential\(\{/.test(pandle), "Pandle decides for itself again");
  assert.ok(/pandleStored\(data, "refreshToken"\)/.test(pandle), "Pandle no longer reads the legacy shape");
});

check("every function that opens a sealed credential is given the key", () => {
  // A secret that is not declared on the function is not mounted, and .value()
  // throws at runtime — in production, on somebody's bank sync.
  const bank = read("bankFeed.js");
  const bankFns = bank.match(/secrets: \[TL_CLIENT_ID[^\]]*\]/g) || [];
  assert.ok(bankFns.length >= 5, `expected the TrueLayer functions to declare secrets; found ${bankFns.length}`);
  for (const decl of bankFns) {
    assert.ok(decl.includes("TL_TOKEN_KEY"), `a TrueLayer function cannot open its own consent: ${decl}`);
  }
  const pandle = read("pandle.js");
  const pandleFns = pandle.match(/secrets: \[PANDLE_CLIENT_ID[^\]]*\]/g) || [];
  assert.ok(pandleFns.length >= 5, `expected the Pandle functions to declare secrets; found ${pandleFns.length}`);
  for (const decl of pandleFns) {
    assert.ok(decl.includes("PANDLE_TOKEN_KEY"), `a Pandle function cannot open its own tokens: ${decl}`);
  }
});

// ---- the guard against the next one -------------------------------------------

check("nothing new writes a credential as a plain string", () => {
  // The shape of the bug: a credential-named field assigned a cleaned string
  // inside an object literal. That is what both missed connectors looked like,
  // and it is what a third one would look like.
  const smell = /^\s*(refreshToken|accessToken|apiKey|clientSecret|consumerSecret|consumerKey|webhookSecret|password):\s*(cleanText\(|String\(|raw|plain|token)/;
  const allowed = new Map([
    // Minted, returned to ChatGPT, and stored only as a SHA-256 — the document
    // id IS the hash. The raw value never reaches the database.
    ["index.js:accessToken: rawToken,", "returned to the caller; stored hashed, as the document id"],
    // Amazon's LWA access token lives an hour and is fetched from the refresh
    // token on every sync. It is returned to the caller and held in memory for
    // the length of one call; §12 of the spec makes "never store the access
    // token" a hard rule, and the check below proves this one is not stored.
    ['commerce/amazon/oauth.js:accessToken: String(data.access_token || ""),', "returned to the caller; never persisted"]
  ]);
  const found = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "test" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith(".js")) continue;
      const rel = path.relative(root, full);
      fs.readFileSync(full, "utf8").split("\n").forEach((line, i) => {
        if (!smell.test(line)) return;
        if (allowed.has(`${rel}:${line.trim()}`)) return;
        found.push(`${rel}:${i + 1}  ${line.trim()}`);
      });
    }
  };
  walk(root);
  assert.deepStrictEqual(found, [],
    "a credential is being written as a plain string. Seal it with security/tokenBox, or — if it is " +
    "genuinely not stored — add it to the allow-list above with the reason:\n  " + found.join("\n  "));
});

check("Amazon's short-lived access token is never written down", () => {
  // The allow-list entry above says this token is not stored. That is a claim
  // about the rest of the connector, so it is checked there rather than taken
  // on trust: no Amazon file may write an access token to Firestore, and the
  // refresh token — the one that IS durable — must be sealed.
  const files = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (entry.name.endsWith(".js")) files.push(full);
    }
  };
  walk(path.join(root, "commerce", "amazon"));
  if (fs.existsSync(path.join(root, "amazonConnector.js"))) files.push(path.join(root, "amazonConnector.js"));

  assert.ok(files.length > 0, "there are no Amazon files to check — has the connector moved?");
  for (const file of files) {
    const body = fs.readFileSync(file, "utf8");
    const rel = path.relative(root, file);
    // Sealing the access token would be no better than storing it plainly: it
    // lasts an hour and is fetched on demand, so keeping it at all turns a
    // one-hour grant into a durable credential.
    assert.ok(!/accessTokenEncrypted/.test(body),
      `${rel} stores an Amazon access token. It lasts an hour and is fetched from the refresh token ` +
      "on demand; keeping it turns a one-hour grant into a durable credential.");
    // A Firestore write whose object carries a bare credential field. Matches
    // the write, not the word — `url.searchParams.set("state", …)` is not one.
    const writes = [...body.matchAll(/\.(?:set|update|create)\(\s*\{([\s\S]{0,600}?)\}/g)].map((m) => m[1]);
    for (const written of writes) {
      for (const field of ["refreshToken", "accessToken", "clientSecret"]) {
        assert.ok(!new RegExp(`\\b${field}\\s*:`).test(written),
          `${rel} writes a bare ${field} to a document. Seal it with security/tokenBox first.`);
      }
    }
  }
});

check("the one allowed plain token really is stored hashed", () => {
  const source = read("index.js");
  assert.ok(/nvChatGPTOAuthTokensRef\(\)\.doc\(tokenHash\)\.set\(/.test(source),
    "the ChatGPT access token is no longer stored under its hash, so the allow-list entry is now a leak");
});

for (const { name, run } of checks) {
  try { run(); console.log(`PASS  ${name}`); }
  catch (error) { failures += 1; console.log(`FAIL  ${name} - ${error.message}`); }
}
if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
console.log("\n✅ CREDENTIALS AT REST GEÇTİ");
