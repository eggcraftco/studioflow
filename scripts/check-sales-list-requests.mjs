// Sales list requests (MC-2 fix, 23 Oct 2026): a slow answer for an old
// filter never overwrites the new filter, and pages of different filters never
// merge.
//
//   1. lib/studioflow/salesListLoader.ts is compiled with the web tree's own
//      TypeScript and driven with a fake listSalesRows whose answers arrive in
//      an order the test controls (deferred promises, no timers, no network).
//   2. Mutation proof: the same scenarios run against two broken copies of the
//      loader — no generation check, and "append without reset" — and MUST fail.
//   3. app/sales/page.tsx uses the loader (no hand-rolled merge, no direct
//      fetchSalesRows outside it).
//
//   node scripts/check-sales-list-requests.mjs
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "lib/studioflow/salesListLoader.ts"), "utf8");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sales-list-"));
let copy = 0;
async function compile(text) {
  const js = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
  const file = path.join(tmpDir, `salesListLoader-${(copy += 1)}.mjs`);
  fs.writeFileSync(file, js);
  return import(pathToFileURL(file).href);
}

// ── fake server ─────────────────────────────────────────────────────────────
// Every order belongs to one store; the "server" answers a filter + cursor with
// the next `limit` matching rows. Answers are held until the test releases them.
const ORDERS = Array.from({ length: 30 }, (_, i) => ({ orderId: `o${String(i).padStart(2, "0")}`, storeKey: ["A", "B", "C"][i % 3] }));
function answer(filter, cursor, limit = 4) {
  const matching = ORDERS.filter((o) => !filter.storeKey || o.storeKey === filter.storeKey);
  const start = cursor ? matching.findIndex((o) => o.orderId === cursor.id) + 1 : 0;
  const rows = matching.slice(start, start + limit);
  const hasMore = start + limit < matching.length;
  return { rows, hasMore, nextCursor: hasMore ? { ms: 1, id: rows[rows.length - 1].orderId } : null, financeVisible: true };
}
function harness(mod) {
  const pending = [];
  const state = { rows: null, busy: false, errors: [], applied: [] };
  const loader = mod.createSalesListLoader({
    fetchPage: (filter, cursor, requestId) => new Promise((resolve, reject) => pending.push({ filter, cursor, requestId, resolve, reject })),
    apply: (update) => { state.rows = update.rows; state.applied.push(update.requestId); },
    busy: (value) => { state.busy = value; },
    fail: (error) => { state.errors.push(String(error && error.message || error)); },
    reset: () => { state.rows = null; },
    rowId: (row) => row.orderId
  });
  const release = async (requestId, how = "ok") => {
    const index = pending.findIndex((p) => p.requestId === requestId);
    if (index < 0) throw new Error(`no pending request ${requestId}`);
    const [p] = pending.splice(index, 1);
    if (how === "ok") p.resolve(answer(p.filter, p.cursor)); else p.reject(new Error(`boom ${requestId}`));
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  };
  const key = (filter) => mod.salesListFilterKey("c1", filter);
  return { loader, state, release, key, pending };
}
const ids = (rows) => (rows || []).map((r) => r.orderId);
const stores = (rows) => [...new Set((rows || []).map((r) => r.storeKey))];

// ── a scan-window server (the real listSalesRows shape) ─────────────────────
// 23 Oct 2026, S-5: the server reads `window` orders per call and applies the
// store filter INSIDE that window, so a filtered page can be short or empty
// while hasMore is still true. The loader must keep asking.
const WIDE = Array.from({ length: 120 }, (_, i) => ({ orderId: `w${String(i).padStart(3, "0")}`, storeKey: i === 119 ? "LONE" : (i < 4 ? "FEW" : "OTHER") }));
function windowAnswer(filter, cursor, limit = 25, window = 50) {
  const start = cursor ? WIDE.findIndex((o) => o.orderId === cursor.id) + 1 : 0;
  const scan = WIDE.slice(start, start + window);
  const rows = [];
  let last = null;
  for (const o of scan) { last = o; if (!filter.storeKey || o.storeKey === filter.storeKey) { rows.push(o); if (rows.length >= limit) break; } }
  const hasMore = rows.length >= limit || start + window < WIDE.length;
  return { rows, hasMore, nextCursor: hasMore && last ? { ms: 1, id: last.orderId } : null, scanned: scan.length };
}
function windowHarness(mod, { cap } = {}) {
  const pending = [];
  const state = { rows: null, hasMore: null, scanned: 0, capped: false, applied: 0, calls: 0 };
  const loader = mod.createSalesListLoader({
    fetchPage: (filter, cursor, requestId) => { state.calls += 1; return new Promise((resolve) => pending.push({ filter, cursor, requestId, resolve })); },
    apply: (u) => { state.rows = u.rows; state.hasMore = u.hasMore; state.scanned = u.scanned; state.capped = u.searchCapped; state.applied += 1; },
    busy: () => {}, fail: () => {}, reset: () => { state.rows = null; },
    rowId: (row) => row.orderId, pageSize: 25, ...(cap ? { searchCap: cap } : {})
  });
  const tick = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
  const step = async () => { const p = pending.shift(); if (!p) return false; p.resolve(windowAnswer(p.filter, p.cursor)); await tick(); return true; };
  const drain = async () => { let n = 0; while (await step()) n += 1; return n; };
  return { loader, state, pending, step, drain, key: (f) => mod.salesListFilterKey("c1", f) };
}

// ── scenarios ───────────────────────────────────────────────────────────────
const SCENARIOS = [
  ["a slow first page for the old filter is dropped when the new filter answered first", async (mod) => {
    const h = harness(mod);
    const a = h.loader.load(h.key({ storeKey: "A" }), { storeKey: "A" });
    const b = h.loader.load(h.key({ storeKey: "B" }), { storeKey: "B" });
    await h.release(b);
    await h.release(a);                                   // A arrives last
    return stores(h.state.rows).join() === "B" && h.state.rows.length === 4 && !h.state.applied.includes(a);
  }],
  ["a slow first page for the old filter is dropped when it answers before the new one", async (mod) => {
    const h = harness(mod);
    const a = h.loader.load(h.key({ storeKey: "A" }), { storeKey: "A" });
    const b = h.loader.load(h.key({ storeKey: "B" }), { storeKey: "B" });
    await h.release(a);
    const midway = h.state.rows;                          // nothing painted for A
    await h.release(b);
    return midway === null && stores(h.state.rows).join() === "B";
  }],
  ["rapid switching A → B → C → A: the list is the last filter's, whatever order the answers come in", async (mod) => {
    const h = harness(mod);
    const r1 = h.loader.load(h.key({ storeKey: "A" }), { storeKey: "A" });
    const r2 = h.loader.load(h.key({ storeKey: "B" }), { storeKey: "B" });
    const r3 = h.loader.load(h.key({ storeKey: "C" }), { storeKey: "C" });
    const r4 = h.loader.load(h.key({ storeKey: "A" }), { storeKey: "A" });
    await h.release(r4);
    await h.release(r3);
    await h.release(r1);
    await h.release(r2);
    return stores(h.state.rows).join() === "A" && h.state.applied.length === 1 && h.state.applied[0] === r4;
  }],
  ["a Show more asked for the old filter is dropped after a filter change (pages never merge)", async (mod) => {
    const h = harness(mod);
    const a = h.loader.load(h.key({ storeKey: "A" }), { storeKey: "A" });
    await h.release(a);
    const more = h.loader.more();                         // page 2 of A in flight
    const b = h.loader.load(h.key({ storeKey: "B" }), { storeKey: "B" });
    await h.release(b);
    await h.release(more);                                // A's page 2 arrives late
    return more > 0 && stores(h.state.rows).join() === "B" && h.state.rows.length === 4;
  }],
  ["Show more is refused until the new filter's first page has arrived (no old cursor on a new filter)", async (mod) => {
    const h = harness(mod);
    const a = h.loader.load(h.key({ storeKey: "A" }), { storeKey: "A" });
    await h.release(a);
    h.loader.load(h.key({ storeKey: "B" }), { storeKey: "B" });
    const refused = h.loader.more();
    return refused === 0 && h.pending.length === 1;
  }],
  ["paging one filter to the end: every row once, all from that filter, in order", async (mod) => {
    const h = harness(mod);
    const first = h.loader.load(h.key({ storeKey: "C" }), { storeKey: "C" });
    await h.release(first);
    for (let guard = 0; guard < 10; guard += 1) {
      const next = h.loader.more();
      if (!next) break;
      await h.release(next);
    }
    const expected = ORDERS.filter((o) => o.storeKey === "C").map((o) => o.orderId);
    return JSON.stringify(ids(h.state.rows)) === JSON.stringify(expected);
  }],
  ["a double Show more sends one request; a duplicate row is never added twice", async (mod) => {
    const h = harness(mod);
    const first = h.loader.load(h.key({}), {});
    await h.release(first);
    const m1 = h.loader.more();
    const m2 = h.loader.more();
    await h.release(m1);
    const list = ids(h.state.rows);
    return m1 > 0 && m2 === 0 && new Set(list).size === list.length && list.length === 8;
  }],
  ["a reload of the same filter (after a brand/store change) drops the answer that was in flight", async (mod) => {
    const h = harness(mod);
    const k = h.key({ brandId: "x" });
    const old = h.loader.load(k, { storeKey: "A" });
    const fresh = h.loader.load(k, { storeKey: "B" });  // same key, new generation (server data changed)
    await h.release(fresh);
    await h.release(old);
    return stores(h.state.rows).join() === "B";
  }],
  ["busy and errors belong to the newest request only", async (mod) => {
    const h = harness(mod);
    const a = h.loader.load(h.key({ storeKey: "A" }), { storeKey: "A" });
    const b = h.loader.load(h.key({ storeKey: "B" }), { storeKey: "B" });
    await h.release(a, "fail");                          // stale failure: no error, still busy
    const quiet = h.state.errors.length === 0 && h.state.busy === true;
    await h.release(b);
    return quiet && h.state.busy === false && stores(h.state.rows).join() === "B";
  }],
  ["a workspace change drops everything in flight", async (mod) => {
    const h = harness(mod);
    const a = h.loader.load(h.key({}), {});
    h.loader.invalidate();
    await h.release(a);
    return h.state.applied.length === 0 && h.state.busy === false;
  }],
  ["scan window: the one matching order at the very end is found on the first load", async (mod) => {
    const h = windowHarness(mod);
    h.loader.load(h.key({ storeKey: "LONE" }), { storeKey: "LONE" });
    await h.drain();
    return ids(h.state.rows).join() === "w119" && h.state.hasMore === false && h.state.capped === false && h.state.scanned === 120 && h.state.applied === 1;
  }],
  ["scan window: a short filter (4 rows) ends with no empty Show more", async (mod) => {
    const h = windowHarness(mod);
    h.loader.load(h.key({ storeKey: "FEW" }), { storeKey: "FEW" });
    await h.drain();
    return h.state.rows.length === 4 && h.state.hasMore === false && h.loader.more() === 0;
  }],
  ["scan window: a filter change stops the old filter's continuing search", async (mod) => {
    const h = windowHarness(mod);
    h.loader.load(h.key({ storeKey: "LONE" }), { storeKey: "LONE" });
    await h.step();                                        // LONE page 1: empty, hasMore → asks page 2
    const lonePending = h.pending.length === 1 && h.pending[0].filter.storeKey === "LONE";
    h.loader.load(h.key({ storeKey: "FEW" }), { storeKey: "FEW" });
    await h.drain();                                       // the old LONE page 2 answers too: must not continue or paint
    // LONE asked twice (page 1, page 2) and stopped; FEW asked three windows (50+50+20).
    return lonePending && ids(h.state.rows).join() === "w000,w001,w002,w003" && h.state.calls === 5 && h.state.applied === 1;
  }],
  ["scan window: the safety cap hands back with 'keep searching', which then finds the match", async (mod) => {
    const h = windowHarness(mod, { cap: { calls: 2, scanned: 1000 } });
    h.loader.load(h.key({ storeKey: "LONE" }), { storeKey: "LONE" });
    await h.drain();
    const capped = h.state.rows.length === 0 && h.state.hasMore === true && h.state.capped === true && h.state.scanned === 100;
    const asked = h.loader.more();
    await h.drain();
    return capped && asked > 0 && ids(h.state.rows).join() === "w119" && h.state.hasMore === false && h.state.scanned === 120;
  }],
  ["the filter key tells filters apart and ignores key order", async (mod) => {
    const k = (f) => mod.salesListFilterKey("c1", f);
    return k({ storeKey: "A", brandId: "" }) === k({ brandId: "", storeKey: "A" })
      && k({ storeKey: "A" }) !== k({ storeKey: "B" })
      && mod.salesListFilterKey("c1", {}) !== mod.salesListFilterKey("c2", {});
  }]
];

async function runAll(mod) {
  const results = [];
  for (const [name, fn] of SCENARIOS) {
    let ok = false;
    try { ok = (await fn(mod)) === true; } catch (error) { ok = false; }
    results.push([name, ok]);
  }
  return results;
}

let failures = 0;
const real = await runAll(await compile(source));
for (const [name, ok] of real) { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failures += 1; }

// ── mutation proof ──────────────────────────────────────────────────────────
const MUTANTS = [
  ["no generation check (every answer is applied)", (text) => text.replace("const stale = () => !isCurrent(requestGeneration, key)", "const stale = () => false; const unusedStale = () => !isCurrent(requestGeneration, key)")],
  ["append without reset (a new filter keeps the old rows and cursor)", (text) => text.replace("      rows = []; scannedTotal = 0;\n      cursor = null;\n      hasMore = false;\n      deps.reset?.();", "      deps.reset?.();")
    .replace("if (!filter || !firstPageArrived || !hasMore || !cursor || appendRequestId) return 0;", "if (!filter || !cursor) return 0;")],
  ["no continuation (a short filtered page is taken as the answer — the 23 Oct live behaviour)", (text) => text.replace("while (wanted && found.length < wanted", "while (false && wanted && found.length < wanted")]
];
for (const [label, mutate] of MUTANTS) {
  const mutated = mutate(source);
  if (mutated === source) { console.log(`FAIL  mutant "${label}" did not change the source — the control is blind`); failures += 1; continue; }
  const results = await runAll(await compile(mutated));
  const red = results.filter(([, ok]) => !ok).length;
  console.log(`${red > 0 ? "PASS" : "FAIL"}  control: mutant "${label}" is caught (${red}/${results.length} scenarios red)`);
  if (red === 0) failures += 1;
}

// ── the page uses the loader ────────────────────────────────────────────────
const page = fs.readFileSync(path.join(root, "app/sales/page.tsx"), "utf8");
const pageChecks = [
  ["page imports createSalesListLoader", /import \{[^}]*createSalesListLoader[^}]*\} from "@\/lib\/studioflow\/salesListLoader"/.test(page)],
  ["page calls fetchSalesRows only inside the loader's fetchPage", (page.match(/fetchSalesRows\(/g) || []).length === 1 && /fetchPage: \(filter, nextCursor\) => fetchSalesRows\(/.test(page)],
  ["page has no hand-rolled merge of pages", !/\[\.\.\.previous, \.\.\.page\.rows\]/.test(page)],
  ["Show more goes through the loader", /listLoader\.current\?\.more\(\)/.test(page)],
  ["the loader is told the page size, so short filtered pages are continued", /pageSize: SALES_PAGE_SIZE/.test(page)],
  ["'No sales match these filters.' only when the server has nothing more", /rows\.length === 0 && hasMore \? \(/.test(page) && /\{hasMore && rows && rows\.length > 0 \? \(/.test(page)],
  ["a workspace change invalidates the loader", /listLoader\.current\?\.invalidate\(\)/.test(page)],
  ["Channels (store/brand directory) answers are sequenced: only the newest paints", /const mine = \(channelsRequest\.current \+= 1\)/.test(page) && (page.match(/mine !== channelsRequest\.current/g) || []).length === 2],
  ["Products answers are sequenced", /const mine = \(productsRequest\.current \+= 1\)/.test(page) && (page.match(/mine !== productsRequest\.current/g) || []).length === 2]
];
for (const [name, ok] of pageChecks) { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failures += 1; }

fs.rmSync(tmpDir, { recursive: true, force: true });
if (failures) { console.log(`\n❌ SALES LIST REQUESTS: ${failures} failing`); process.exit(1); }
console.log(`\n✅ SALES LIST REQUESTS OK (${SCENARIOS.length} scenarios, ${MUTANTS.length} mutants caught, ${pageChecks.length} page checks)`);
