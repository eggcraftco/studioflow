// The server's own download-token writes, and why they consult the scan record.
//
// Two pieces of server code write download tokens: the portal share mints one
// so a visitor with no session can open a file, and the portal revoke replaces
// it so every copied URL dies. Left alone, both would put a token straight
// back onto a file the upload scanner was holding — the first version of each
// did exactly that, blind, with no precondition. So both go through the token
// service, and this is what it has to guarantee.
const assert = require("assert");
const { createDownloadTokenService } = require("../../security/downloadTokens");
const { scanDocId, TOKEN_METADATA_KEY } = require("../../malwareScanTrigger");

let failures = 0;
const checks = [];
const check = (name, run) => checks.push({ name, run });

const PATH = "companies/c1/client_files/o1/Jane_Doe_passport.pdf";
const GEN = "1755000001";

function harness({ token = "", record = null } = {}) {
  const state = { metadata: token ? { [TOKEN_METADATA_KEY]: token } : {}, metageneration: 1 };
  const docs = new Map();
  if (record) docs.set(scanDocId(PATH, GEN), { objectPath: PATH, generation: GEN, ...record });
  const events = [];
  let mints = 0;

  const file = {
    async getMetadata() {
      events.push("getMetadata");
      return [{ generation: GEN, metageneration: state.metageneration, metadata: { ...state.metadata } }];
    },
    async setMetadata(patch, opts = {}) {
      assert.ok(Object.prototype.hasOwnProperty.call(opts, "ifMetagenerationMatch"),
        "a token write went out without an ifMetagenerationMatch precondition");
      if (String(opts.ifMetagenerationMatch) !== String(state.metageneration)) {
        const e = new Error("precondition failed"); e.code = 412; events.push("412"); throw e;
      }
      const next = { ...state.metadata, ...(patch.metadata || {}) };
      for (const [k, v] of Object.entries(patch.metadata || {})) if (v === null) delete next[k];
      state.metadata = next;
      state.metageneration += 1;
      events.push(`setMetadata:${next[TOKEN_METADATA_KEY] || "-"}`);
      return [{ metageneration: state.metageneration }];
    }
  };
  const admin = {
    storage: () => ({ bucket: () => ({ name: "b", file: () => file }) }),
    firestore: () => ({
      collection: () => ({
        doc: (id) => ({
          async get() { const d = docs.get(id); return { exists: Boolean(d), data: () => d }; },
          async set(data, opts) { docs.set(id, { ...(opts?.merge ? docs.get(id) : {}), ...data }); events.push(`record:${id === scanDocId(PATH, GEN) ? "ok" : id}`); }
        })
      })
    })
  };
  const service = createDownloadTokenService({ admin, uuid: () => `tok-new-${++mints}`, now: () => 1_700_000_000_000 });
  return { service, state, docs, events, record: () => docs.get(scanDocId(PATH, GEN)) };
}

check("a file with a token keeps it — nothing is written", () => {
  const h = harness({ token: "tok-existing" });
  return h.service.ensureToken(PATH).then((r) => {
    assert.strictEqual(r.token, "tok-existing");
    assert.strictEqual(r.deferred, false);
    assert.ok(r.url.includes("token=tok-existing"));
    assert.ok(!h.events.some((e) => e.startsWith("setMetadata")), "a file that had a token was written to");
  });
});

check("a file with no token and no scan record gets one, with a precondition", () => {
  const h = harness();
  return h.service.ensureToken(PATH).then((r) => {
    assert.strictEqual(r.token, "tok-new-1");
    assert.strictEqual(h.state.metadata[TOKEN_METADATA_KEY], "tok-new-1");
    assert.strictEqual(r.deferred, false);
  });
});

check("a held file is NOT given a token on the object — it goes into the record instead", () => {
  // This is the bypass the first version had: the file is held (no token on
  // the object), the portal share minted one, and the scanner's hold meant
  // nothing. Now the token waits in the record for a clean verdict.
  const h = harness({ record: { status: "unverified", verdict: "pending", heldToken: "tok-held", holding: true } });
  return h.service.ensureToken(PATH).then((r) => {
    assert.strictEqual(r.deferred, true, "a held file's URL was not marked deferred");
    assert.ok(!h.state.metadata[TOKEN_METADATA_KEY], `a token was written onto a held file: ${JSON.stringify(h.state.metadata)}`);
    assert.strictEqual(r.token, "tok-held", "a different token from the one that will be restored");
    assert.ok(r.url.includes("token=tok-held"));
  });
});

check("a held file whose record has no token yet gets one in the record", () => {
  const h = harness({ record: { status: "unverified", verdict: "pending", heldToken: "", holding: true } });
  return h.service.ensureToken(PATH).then((r) => {
    assert.strictEqual(r.deferred, true);
    assert.ok(!h.state.metadata[TOKEN_METADATA_KEY], "a token was written onto a held file");
    assert.strictEqual(h.record().heldToken, "tok-new-1", "the new token was not put where the restore will find it");
    assert.strictEqual(h.record().holding, true);
  });
});

check("a file the scanner settled as unusable is still held, whatever its status says", () => {
  // holding is the truth, not the verdict: too_large, error, timeout all hold.
  for (const verdict of ["too_large", "error", "timeout", "unsupported"]) {
    const h = harness({ record: { status: "unverified", verdict, heldToken: "tok-held", holding: true } });
    const done = h.service.ensureToken(PATH).then(() => {
      assert.ok(!h.state.metadata[TOKEN_METADATA_KEY], `verdict ${verdict}: a token was written onto a held file`);
    });
    if (verdict === "unsupported") return done;
  }
  return Promise.resolve();
});

check("a file with a clean record is treated like any other file", () => {
  const h = harness({ record: { status: "clean", verdict: "clean", heldToken: "", holding: false } });
  return h.service.ensureToken(PATH).then((r) => {
    assert.strictEqual(r.deferred, false);
    assert.strictEqual(h.state.metadata[TOKEN_METADATA_KEY], "tok-new-1");
  });
});

check("a mint that loses the race looks again", () => {
  const h = harness();
  let first = true;
  const original = h.state;
  const bump = () => { if (first) { first = false; original.metageneration += 1; } };
  const get = h.service; void get;
  // The strip lands between the read and the write: the fake bumps metageneration after the first read.
  const admin = { storage: () => ({ bucket: () => ({ name: "b", file: () => ({
    async getMetadata() { const m = [{ generation: GEN, metageneration: original.metageneration, metadata: { ...original.metadata } }]; bump(); return m; },
    async setMetadata(patch, opts) {
      if (String(opts.ifMetagenerationMatch) !== String(original.metageneration)) { const e = new Error("precondition"); e.code = 412; throw e; }
      original.metadata = { ...original.metadata, ...patch.metadata }; original.metageneration += 1; return [{}];
    }
  }) }) }), firestore: () => ({ collection: () => ({ doc: () => ({ async get() { return { exists: false }; }, async set() {} }) }) }) };
  const service = createDownloadTokenService({ admin, uuid: () => "tok-x", now: () => 1 });
  return service.ensureToken(PATH).then((r) => {
    assert.strictEqual(r.token, "tok-x");
    assert.strictEqual(original.metadata[TOKEN_METADATA_KEY], "tok-x", "the retry never wrote the token");
  });
});

check("a revoke on an unheld file replaces the token on the object", () => {
  const h = harness({ token: "tok-old" });
  return h.service.rotate(PATH).then((r) => {
    assert.strictEqual(r.rotated, true);
    assert.strictEqual(r.deferred, false);
    assert.strictEqual(h.state.metadata[TOKEN_METADATA_KEY], "tok-new-1");
  });
});

check("a revoke on a held file replaces the token in the record and leaves the object tokenless", () => {
  // The object has no token to replace. What the restore will put back is the
  // record's copy — so that is what gets replaced, and the old URL is dead the
  // moment the file is released.
  const h = harness({ record: { status: "unverified", verdict: "pending", heldToken: "tok-old", holding: true } });
  return h.service.rotate(PATH).then((r) => {
    assert.strictEqual(r.rotated, true);
    assert.strictEqual(r.deferred, true);
    assert.ok(!h.state.metadata[TOKEN_METADATA_KEY], "a revoke put a token onto a held file");
    assert.strictEqual(h.record().heldToken, "tok-new-1", "the record still holds the revoked token");
    assert.strictEqual(h.record().holding, true);
  });
});

check("a revoke on a claimed-but-not-yet-held file clears the record's stale copy", () => {
  // Between the claim and the strip the object still has its token and the
  // record may already have written it down. After the rotate the record's
  // copy is stale and must not come back through the restore.
  const h = harness({ token: "tok-old", record: { status: "unverified", verdict: "pending", heldToken: "tok-old", holding: false } });
  return h.service.rotate(PATH).then((r) => {
    assert.strictEqual(r.rotated, true);
    assert.strictEqual(h.state.metadata[TOKEN_METADATA_KEY], "tok-new-1");
    assert.strictEqual(h.record().heldToken, "", "the record still carries the revoked token");
  });
});

check("the portal share and the portal revoke both go through the service", () => {
  // The service existing is not the control; the two minters using it is.
  const fs = require("fs");
  const path = require("path");
  const lib = fs.readFileSync(path.join(__dirname, "..", "..", "filesLibrary.js"), "utf8");
  const at = lib.indexOf("async function ensurePortalUrl(");
  assert.ok(at > 0);
  const body = lib.slice(at, lib.indexOf("\n}\n", at));
  assert.ok(/createDownloadTokenService\(/.test(body), "ensurePortalUrl no longer uses the token service");
  assert.ok(!/setMetadata\(/.test(body) && !/randomUUID\(/.test(body), "ensurePortalUrl mints on its own again");

  const index = fs.readFileSync(path.join(__dirname, "..", "..", "index.js"), "utf8");
  const rot = index.indexOf("async function rotatePortalFileTokens(");
  assert.ok(rot > 0);
  const rotBody = index.slice(rot, index.indexOf("\n}\n", rot));
  assert.ok(/tokens\.rotate\(/.test(rotBody), "rotatePortalFileTokens no longer uses the token service");
  assert.ok(!/firebaseStorageDownloadTokens: crypto\.randomUUID\(\)/.test(rotBody), "rotatePortalFileTokens mints on its own again");
  assert.ok(!/console\.warn\("portal token rotation failed", path/.test(rotBody), "the rotation log writes the raw path");
});

(async () => {
  for (const { name, run } of checks) {
    try { await run(); console.log(`PASS  ${name}`); }
    catch (error) { failures += 1; console.log(`FAIL  ${name} - ${error.message}`); }
  }
  if (failures) { console.log(`\n❌ ${failures} failing`); process.exit(1); }
  console.log("\n✅ DOWNLOAD TOKENS GEÇTİ");
})();
