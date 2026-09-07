// Every published MCP tool says what it does, in four explicit booleans, with
// a reason for each — and the listing OpenAI is reviewing does not move.
//
// OpenAI rejected NivaDesk 1.1.1 with "annotations do not appear to match the
// tool's behavior ... explicitly set to true or false (not null) for every tool
// ... include a clear justification". This test is the standing answer to all
// three halves of that: no hint may be null or missing, every hint carries a
// justification, and the values on the wire are pinned to a fixture so a future
// edit cannot quietly change the surface a reviewer already looked at.
//
// The fixture's "off" and "inventory" projections were recorded from index.js
// at commit d4399da1 — before the hints moved into orchestrator/registry.js —
// so they are independent evidence rather than a copy of what this code
// happens to produce today.
//
// Run: node test/qa/mcp-tool-annotations.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const FUNCTIONS_DIR = path.join(__dirname, "..", "..");
const INDEX = path.join(FUNCTIONS_DIR, "index.js");
const REGISTRY_PATH = path.join(FUNCTIONS_DIR, "orchestrator", "registry.js");
const FIXTURE = path.join(FUNCTIONS_DIR, "test", "fixtures", "mcp", "tools-list-annotations.json");
const DOC = path.join(FUNCTIONS_DIR, "..", "docs", "mcp-tool-annotations.md");

const registry = require(REGISTRY_PATH);
const registrySource = fs.readFileSync(REGISTRY_PATH, "utf8");
const indexSource = fs.readFileSync(INDEX, "utf8");
const fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
const doc = fs.readFileSync(DOC, "utf8");

const HINTS = ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"];
const FLAG_STATES = {
  "off": {},
  "inventory": { inventory: true },
  "orchestrator": { orchestrator: true },
  "inventory+orchestrator": { inventory: true, orchestrator: true }
};

// Documents write counts as words ("Nine read tools"), so the checks that read a
// number back out of a document have to read both spellings.
// The table runs to 22 and the review connection is served 19, so the range has
// to reach the numbers these documents actually spell — "Nineteen tools go to
// the review connection", "Twenty-two tools." — and read the hyphen out of the
// compound ones.
const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, twentyone: 21, twentytwo: 22, twentythree: 23
};
const asCount = (text) => {
  const raw = String(text).trim();
  if (/^\d+$/.test(raw)) return Number(raw);
  return NUMBER_WORDS[raw.toLowerCase().replace(/[\s-]/g, "")];
};

let failures = 0;
function check(name, run) {
  try { run(); console.log("PASS ", name); }
  catch (error) { failures++; console.error("FAIL ", name, "\n      ", error.message); }
}

/* ------------------------------------------------------------------ *
 * 1. Every hint is an explicit boolean, in every flag state.
 * ------------------------------------------------------------------ */

check("no published tool has a null or missing hint, under any flag combination", () => {
  for (const [label, flags] of Object.entries(FLAG_STATES)) {
    const names = registry.publishedNames(flags);
    assert.ok(names.length > 0, `${label}: nothing published`);
    for (const name of names) {
      const annotations = registry.annotationsFor(name, flags);
      assert.deepStrictEqual(
        Object.keys(annotations), HINTS,
        `${label}/${name}: expected exactly the four hints in wire order, got ${Object.keys(annotations).join(", ")}`
      );
      for (const hint of HINTS) {
        const value = annotations[hint];
        assert.notStrictEqual(value, null, `${label}/${name}.${hint} is null`);
        assert.notStrictEqual(value, undefined, `${label}/${name}.${hint} is missing`);
        assert.strictEqual(typeof value, "boolean", `${label}/${name}.${hint} is ${typeof value}, not a boolean`);
      }
    }
  }
});

check("every hint is a literal true/false in the registry source, not an expression", () => {
  const start = registrySource.indexOf("const TOOL_REGISTRY = [");
  const end = registrySource.indexOf("\n];", start);
  assert.ok(start > 0 && end > start, "could not find the registry table in the source");
  const table = registrySource.slice(start, end);

  for (const hint of HINTS) {
    const occurrences = table.match(new RegExp(`${hint}\\s*:`, "g")) || [];
    const literals = table.match(new RegExp(`${hint}\\s*:\\s*(?:true|false)\\b`, "g")) || [];
    // Each entry has an `annotations` block; two entries also carry the frozen
    // 1.1.1 `liveAnnotations`. The justification map repeats the four keys once
    // per entry, and those values are strings.
    const annotationBlocks = registry.TOOL_REGISTRY.length + registry.TOOL_REGISTRY.filter((e) => e.liveAnnotations).length;
    const justificationLines = registry.TOOL_REGISTRY.length;
    assert.strictEqual(
      occurrences.length, annotationBlocks + justificationLines,
      `${hint} appears ${occurrences.length} times in the table; expected ${annotationBlocks + justificationLines}`
    );
    assert.strictEqual(
      literals.length, annotationBlocks,
      `${hint} has ${literals.length} literal boolean values; expected ${annotationBlocks}. A hint written as anything but a bare true/false is what the rejection was about.`
    );
    assert.ok(!new RegExp(`${hint}\\s*:\\s*null`).test(table), `${hint} is set to null somewhere in the table`);
  }
});

check("every hint carries its own reason", () => {
  for (const entry of registry.TOOL_REGISTRY) {
    const lines = registry.justificationFor(entry.name);
    assert.deepStrictEqual(Object.keys(lines).sort(), [...HINTS].sort(), `${entry.name}: justification keys`);
    for (const hint of HINTS) {
      assert.ok(typeof lines[hint] === "string" && lines[hint].trim().length >= 20, `${entry.name}.${hint}: no justification`);
      assert.ok(/^Because /.test(lines[hint]), `${entry.name}.${hint}: justification must read as a reason ("Because ...")`);
    }
  }
});

/* ------------------------------------------------------------------ *
 * 2. The values are defensible, not just present.
 * ------------------------------------------------------------------ */

check("openWorldHint and the declared effects agree", () => {
  // The check that would have caught 1.1.1: create_order and
  // update_order_status both reach the customer through
  // notifyCustomerOnStatusChange, and both shipped openWorldHint false.
  for (const entry of registry.TOOL_REGISTRY) {
    const open = entry.annotations.openWorldHint;
    if (entry.effects.length > 0) {
      assert.strictEqual(open, true, `${entry.name} declares effects [${entry.effects}] but claims openWorldHint false`);
    } else {
      assert.strictEqual(open, false, `${entry.name} claims openWorldHint true but names no effect`);
    }
  }
  // And the two tools whose write fires the customer notification say so.
  for (const name of ["create_order", "update_order_status"]) {
    assert.ok(registry.effectsFor(name).includes("customer_message"), `${name} must declare customer_message`);
    assert.ok(
      /notifyCustomerOnStatusChange/.test(registry.justificationFor(name).openWorldHint),
      `${name}: the openWorldHint reason must name the trigger it depends on`
    );
  }
});

check("the runtime still has the trigger the openWorldHint values rest on", () => {
  // If somebody deletes or renames the notification trigger, two openWorldHint
  // values become false and this test is where that is noticed.
  assert.ok(
    /exports\.notifyCustomerOnStatusChange\s*=\s*onDocumentWritten\(/.test(indexSource),
    "notifyCustomerOnStatusChange is no longer an onDocumentWritten trigger"
  );
  assert.ok(
    /document:\s*"siparisler\/\{orderId\}"/.test(indexSource),
    "the notification trigger no longer listens on siparisler/{orderId}"
  );
});

check("a read tool that hands over people discloses its access-log row", () => {
  for (const entry of registry.TOOL_REGISTRY) {
    if (entry.annotations.readOnlyHint === true && entry.piiAccessLogged) {
      assert.ok(
        /piiAccessLog/.test(entry.justification.readOnlyHint),
        `${entry.name}: readOnlyHint is true and the dispatcher writes an access-log row; the reason must say so on the tool, not only in a design document`
      );
    }
  }
});

check("the dispatcher's PII list is the registry's, and it is still these nine tools", () => {
  // There were two lists: a hand-written MCP_ACTIONS_READING_PII in index.js
  // and `piiAccessLogged` here, kept in step by the version of this check that
  // parsed the Set out of the source. There is one list now — the dispatcher
  // derives it — so what is worth pinning has moved: WHICH tools log, named
  // here, so a registry edit that quietly stops logging a tool handing over a
  // person fails this test rather than the next audit.
  assert.ok(
    /nvMcpPiiLoggedActions[\s\S]{0,300}entry\.piiAccessLogged === true/.test(indexSource),
    "the dispatcher no longer derives its PII list from the registry"
  );
  assert.ok(
    !/MCP_ACTIONS_READING_PII\s*=\s*new Set\(\[/.test(indexSource),
    "a second hand-written list of PII-logging actions is back in index.js"
  );
  const logged = registry.TOOL_REGISTRY.filter((entry) => entry.piiAccessLogged).map((entry) => entry.name).sort();
  assert.deepStrictEqual(logged, [
    "get_bank_spending_summary",
    "get_dashboard_summary",
    "get_extra_spending_overview",
    "get_financial_overview",
    "get_order_detail",
    "get_order_financials",
    "search_bank_transactions",
    "search_commerce_orders",
    "search_orders"
  ]);
  // Every tool that hands over a person records the read. The two bank tools
  // were the exception — `pii: ["name"]` with `piiAccessLogged: false` — while
  // `search_commerce_orders`, the newest door to a customer's name and e-mail,
  // logged. There is no exception now.
  for (const entry of registry.TOOL_REGISTRY) {
    if (entry.pii.length === 0) continue;
    assert.strictEqual(entry.piiAccessLogged, true,
      `${entry.name} hands over ${entry.pii.join(", ")} and records nothing`);
  }
});

check("a PII row that waits on a deployment flag waits on it, and says which", () => {
  // Turning a write on for the live 1.1.1 connection is the operator's call, so
  // the two bank rows ship behind NIVADESK_MCP_ORCHESTRATOR like every other
  // behaviour change on this branch — declared in the registry rather than
  // hidden in a second list somewhere in index.js.
  const api = require("../../index");
  const waiting = registry.TOOL_REGISTRY.filter((entry) => entry.piiAccessLoggedFlag);
  assert.deepStrictEqual(waiting.map((entry) => entry.name).sort(),
    ["get_bank_spending_summary", "search_bank_transactions"]);
  for (const entry of waiting) {
    assert.strictEqual(entry.piiAccessLoggedFlag, "orchestrator");
    assert.strictEqual(entry.piiAccessLogged, true, `${entry.name} names a flag for a row it does not declare`);
    assert.ok(require("../../privacy/accessLog").SUBJECT_KINDS.includes(entry.piiSubject),
      `${entry.name}: subject kind "${entry.piiSubject}" would be rewritten at write time`);
  }
  // And the flag is what decides, in the deployment as built. With
  // NIVADESK_MCP_ORCHESTRATOR off — which is the default and the state this
  // test process runs in — the wire and the writes are the 1.1.1 ones.
  const flagOn = process.env.NIVADESK_MCP_ORCHESTRATOR === "1";
  const live = api._nvMcpPiiLoggedActions();
  for (const entry of waiting) {
    assert.strictEqual(live.has(entry.name), flagOn,
      `${entry.name} logs with the orchestrator flag ${flagOn ? "on" : "off"} — the gate is not the flag`);
    assert.strictEqual(api._nvMcpPiiAccessEntry(entry.name, { companyId: "c", uid: "u", surface: "mcp" }, {}) !== null, flagOn);
  }
  // The gate is one predicate, not a copy per call site.
  assert.ok(/nvMcpPiiLogFlagOn\(entry\)/.test(indexSource), "the flag gate is no longer a shared predicate");
});

/** `_nvMcpPiiLoggedActions()` / `_nvMcpAvailableActions()` under a chosen flag state. */
function loggedAndAvailableUnder(flags) {
  const script = `
    for (const k of Object.keys(process.env)) if (/MCP/.test(k)) delete process.env[k];
    process.env.NIVADESK_MCP_ORCHESTRATOR = ${JSON.stringify(flags.orchestrator ? "1" : "0")};
    const api = require(${JSON.stringify(INDEX)});
    console.log(JSON.stringify({
      logged: [...api._nvMcpPiiLoggedActions()],
      available: [...api._nvMcpAvailableActions()]
    }));
  `;
  const raw = execFileSync(process.execPath, ["-e", script], { cwd: FUNCTIONS_DIR, maxBuffer: 40 * 1024 * 1024 }).toString();
  return JSON.parse(raw.trim().split("\n").pop());
}

check("the carve-out paragraph counts the access-log rows the registry declares", () => {
  // docs/mcp-tool-annotations.md exists to disclose the one place a
  // `readOnlyHint: true` tool writes, and on 7 September 2026 the sentence that
  // does the disclosing said "Six read tools" while the registry held nine and
  // the document's own per-tool sections disclosed the row on all nine. Six was
  // the number of tools a caller could REACH with the orchestrator flag off —
  // a live figure written as though it were the table's — and it went stale the
  // moment the two bank tools gained the row behind that flag.
  //
  // So all four numbers in that paragraph are read back out of it: the
  // registry's count, the two flag-state counts the deployment actually
  // returns, and the reachable count.
  const paragraph = doc.split("\n\n").find((block) => / read tools cause one write:/.test(block));
  assert.ok(paragraph, 'the carve-out paragraph ("N read tools cause one write") is gone from the document');

  const declared = registry.TOOL_REGISTRY.filter((entry) => entry.piiAccessLogged);
  const stated = /(\*{0,2})([A-Za-z]+|\d+)\1 read tools cause one write:/.exec(paragraph);
  assert.ok(stated, "could not read the count out of the carve-out sentence");
  assert.strictEqual(
    asCount(stated[2]), declared.length,
    `the carve-out says "${stated[2]} read tools" and the registry declares ${declared.length} with piiAccessLogged: true ` +
    `(${declared.map((entry) => entry.name).sort().join(", ")})`
  );

  // The split the sentence has to carry, because flags-off the bank tools are
  // not among them: what the deployment returns in each state, measured.
  const off = loggedAndAvailableUnder({ orchestrator: false });
  const on = loggedAndAvailableUnder({ orchestrator: true });
  const perFlag = /names (\*{0,2})([A-Za-z]+|\d+)\1 with the flag off and (\*{0,2})([A-Za-z]+|\d+)\3 with it on/.exec(paragraph);
  assert.ok(perFlag,
    'the carve-out must state both flag states, as "names <n> with the flag off and <n> with it on" — flags-off the two bank tools do not file the row');
  assert.strictEqual(asCount(perFlag[2]), off.logged.length,
    `the carve-out says ${perFlag[2]} with the flag off; nvMcpPiiLoggedActions() returns ${off.logged.length} (${off.logged.sort().join(", ")})`);
  assert.strictEqual(asCount(perFlag[4]), on.logged.length,
    `the carve-out says ${perFlag[4]} with the flag on; nvMcpPiiLoggedActions() returns ${on.logged.length} (${on.logged.sort().join(", ")})`);

  // And the number that was actually in the sentence before: how many a caller
  // can reach flags-off, which is smaller again because search_commerce_orders
  // is registered and not dispatchable in that state.
  const reachable = off.logged.filter((name) => off.available.includes(name));
  const stateReachable = /(\*{0,2})([A-Za-z]+|\d+)\1 of those seven are reachable/.exec(paragraph)
    || /With the flag off (\*{0,2})([A-Za-z]+|\d+)\1 of/.exec(paragraph);
  assert.ok(stateReachable, "the carve-out must say how many of the flags-off rows a caller can actually reach");
  assert.strictEqual(asCount(stateReachable[2]), reachable.length,
    `the carve-out says ${stateReachable[2]} reachable flags-off; the dispatcher reaches ${reachable.length} (${reachable.sort().join(", ")})`);

  assert.ok(/NIVADESK_MCP_ORCHESTRATOR/.test(paragraph), "the carve-out must name the flag the two bank rows wait on");
  for (const name of ["get_bank_spending_summary", "search_bank_transactions"]) {
    assert.ok(paragraph.includes(`\`${name}\``), `the carve-out must name ${name} as one of the flag-gated rows`);
  }
});

/**
 * Every top-level `function name(...)` body in a module, and which of the
 * module's own functions each one calls. Enough to answer "can a published
 * capability reach this helper", which is the question a claim about behaviour
 * turns into.
 */
function callGraph(source) {
  const starts = [...source.matchAll(/^(?:async )?function ([A-Za-z0-9_$]+)\s*\(/gm)]
    .map((match) => ({ name: match[1], at: match.index }));
  const bodies = new Map();
  starts.forEach((entry, index) => {
    const end = index + 1 < starts.length ? starts[index + 1].at : source.length;
    bodies.set(entry.name, source.slice(entry.at, end));
  });
  const calls = new Map();
  for (const [name, body] of bodies) {
    calls.set(name, [...bodies.keys()].filter((other) => other !== name && new RegExp(`\\b${other}\\(`).test(body)));
  }
  return calls;
}

/** Everything reachable from `roots` through a module's own functions. */
function reachableFrom(calls, roots) {
  const seen = new Set();
  const queue = [...roots];
  while (queue.length) {
    const name = queue.shift();
    if (seen.has(name) || !calls.has(name)) continue;
    seen.add(name);
    queue.push(...calls.get(name));
  }
  return seen;
}

check("no reviewer-facing or operator-facing claim rests on a capability the reduction removed", () => {
  // B3. §7 of the submission is the block pasted to OpenAI, and it promised
  // "a channel the workspace has not connected is named as not connected rather
  // than counted as zero". §2.3 stated the same thing as an honesty rule
  // "visible in a demo", and checklist step 7 told the operator to stage the
  // review around it. Nothing published does it: the roster is `channelRows`,
  // whose only callers are `commerceOverview` and `channelPerformance`, and the
  // reduction removed both capabilities. That is the 1.1.1 rejection shape —
  // telling a reviewer a tool behaves in a way it does not — in the document
  // written to avoid it.
  //
  // So the claim is not banned by name; it is tied to the code that would have
  // to produce it. Putting get_commerce_overview back in the release would make
  // channelRows reachable and the sentence true again, and this check would
  // allow it then.
  const submission = fs.readFileSync(path.join(FUNCTIONS_DIR, "..", "docs", "mcp-submission-1.2.0.md"), "utf8");
  const orchestrator = require("../../orchestrator");

  const section = (heading, next) => {
    const start = submission.indexOf(heading);
    assert.ok(start >= 0, `${heading.trim()} is gone from the submission document`);
    const end = next ? submission.indexOf(next, start + 1) : -1;
    return submission.slice(start, end > start ? end : undefined);
  };
  const checklist = section("\n## 6. ", "\n## 7. ");
  const releaseNotes = section("\n## 7. ");
  assert.ok(/draft to paste/i.test(releaseNotes) && releaseNotes.length > 800,
    "§7 is the reviewer-facing block; if it has moved or shrunk this check has stopped reading it");
  assert.ok(/Submission checklist/i.test(checklist) && checklist.length > 800,
    "§6 is the operator's checklist; if it has moved or shrunk this check has stopped reading it");

  // 1. Neither section may name a capability this release does not publish.
  const publishedEver = new Set(Object.values(FLAG_STATES).flatMap((flags) => registry.publishedNames(flags)));
  let named = 0;
  for (const [label, text] of [["§6 checklist", checklist], ["§7 release notes", releaseNotes]]) {
    for (const match of text.matchAll(/`((?:get|search|create|update|add|attach|pin|archive|append|list)_[a-z_]+)`/g)) {
      named += 1;
      assert.ok(
        publishedEver.has(match[1]),
        `${label} names \`${match[1]}\`, which no flag state publishes. ` +
        `The reduction of 6 September left ${[...publishedEver].sort().join(", ")}.`
      );
    }
  }
  assert.ok(named >= 3, `expected §6 and §7 to name capabilities by name; found ${named}`);

  // 2. Claims tied to a specific producer: allowed only where a published
  //    capability can reach that producer.
  const CLAIMS = [
    {
      what: "a channel that is not connected is named as not connected rather than counted as zero",
      pattern: /named as not connected|not connected[^.\n]{0,60}(?:rather than|never|instead of)[^.\n]{0,40}zero/i,
      module: "commerce.js",
      producer: "channelRows",
      // The removed callers, so a refutation has to carry its own evidence.
      evidence: ["channelRows", "commerceOverview", "channelPerformance"]
    }
  ];

  for (const claim of CLAIMS) {
    const source = fs.readFileSync(path.join(FUNCTIONS_DIR, "orchestrator", claim.module), "utf8");
    const handlers = [...publishedEver]
      .map((name) => orchestrator.HANDLERS[name])
      .filter(Boolean)
      .map((fn) => fn.name);
    assert.ok(handlers.length > 0, "no published capability resolves to a handler; the reachability test would be vacuous");
    const reachable = reachableFrom(callGraph(source), handlers).has(claim.producer);

    for (const [label, text] of [["§6 checklist", checklist], ["§7 release notes", releaseNotes]]) {
      assert.ok(
        reachable || !claim.pattern.test(text),
        `${label} claims "${claim.what}". No published capability reaches ` +
        `${claim.producer}() in orchestrator/${claim.module}; the published handlers are ` +
        `[${handlers.join(", ")}]. Telling a reviewer a tool does something it does not is the 1.1.1 rejection.`
      );
    }

    // Elsewhere in the document the claim may be quoted — that is how the
    // correction explains itself — but only beside the code that shows it is
    // not true, so it cannot come back as a bare promise.
    if (!reachable) {
      for (const paragraph of submission.split("\n\n")) {
        if (!claim.pattern.test(paragraph)) continue;
        for (const name of claim.evidence) {
          assert.ok(
            paragraph.includes(name),
            `a paragraph of the submission states "${claim.what}" without naming ${name}. ` +
            `The claim is false while ${claim.producer}() is unreachable, so quoting it has to carry the ` +
            `reason it is being quoted.`
          );
        }
      }
    }
  }
});

check("the submission's carve-out sign-off names every tool the operator is signing for", () => {
  // §5.7 is the operator's signature, not narration: "a position to sign off,
  // not a bug". On 7 September 2026 it described seven tools and weighed an
  // alternative of "flipping seven readOnlyHints to false", in a document whose
  // own §5.5 says two more tools gain the row on NIVADESK_MCP_ORCHESTRATOR —
  // the very flag the signature authorises. Nine is what is being signed, and
  // nine hints is a materially larger alternative than seven.
  const submission = fs.readFileSync(path.join(FUNCTIONS_DIR, "..", "docs", "mcp-submission-1.2.0.md"), "utf8");
  const start = submission.indexOf("### 5.7 ");
  assert.ok(start > 0, "§5.7, the readOnlyHint carve-out sign-off, is gone from the submission document");
  const end = submission.indexOf("\n### ", start + 1);
  const section = submission.slice(start, end > start ? end : undefined);

  // Every tool the section names, against the registry's own list. Naming a
  // tool that does NOT file the row is as wrong as omitting one that does.
  const logged = registry.TOOL_REGISTRY.filter((entry) => entry.piiAccessLogged).map((entry) => entry.name).sort();
  const named = registry.TOOL_REGISTRY
    .map((entry) => entry.name)
    .filter((name) => section.includes(`\`${name}\``))
    .sort();
  assert.deepStrictEqual(
    named, logged,
    `§5.7 names [${named.join(", ")}]; the tools that file a piiAccessLog row are [${logged.join(", ")}]`
  );

  // And the numbers, each against its own source.
  const off = loggedAndAvailableUnder({ orchestrator: false });
  const on = loggedAndAvailableUnder({ orchestrator: true });
  const reachableOff = off.logged.filter((name) => off.available.includes(name));

  const opening = /^### 5\.7[^\n]*\n+([A-Za-z]+|\d+) read tools write one `piiAccessLog` row/m.exec(section);
  assert.ok(opening, '§5.7 must open with "<n> read tools write one `piiAccessLog` row per call"');
  assert.strictEqual(asCount(opening[1]), logged.length,
    `§5.7 opens with ${opening[1]}; the registry declares ${logged.length} tools that file the row`);

  const alternative = /flipping ([A-Za-z]+|\d+) `readOnlyHint`s to `false`/.exec(section);
  assert.ok(alternative, "§5.7 must weigh the alternative it is being signed against");
  assert.strictEqual(asCount(alternative[1]), logged.length,
    `§5.7 weighs flipping ${alternative[1]} hints; the flipped state has ${logged.length}. ` +
    `The size of the alternative is half of what the signature is for.`);

  const live = /([A-Za-z]+|\d+) are live today/.exec(section);
  assert.ok(live, '§5.7 must say how many of them are live today ("<n> are live today")');
  assert.strictEqual(asCount(live[1]), reachableOff.length,
    `§5.7 says ${live[1]} are live today; flags-off the dispatcher reaches ${reachableOff.length} (${reachableOff.sort().join(", ")})`);

  const flagOff = /names ([A-Za-z]+|\d+) with the flag off/.exec(section);
  assert.ok(flagOff, "§5.7 must state what nvMcpPiiLoggedActions() returns with the flag off");
  assert.strictEqual(asCount(flagOff[1]), off.logged.length,
    `§5.7 says ${flagOff[1]} with the flag off; the deployment returns ${off.logged.length}`);

  const flagOn = /That is ([A-Za-z]+|\d+) with the flag on/.exec(section);
  assert.ok(flagOn, "§5.7 must state what it becomes with the flag on — that is the state being signed");
  assert.strictEqual(asCount(flagOn[1]), on.logged.length,
    `§5.7 says ${flagOn[1]} with the flag on; the deployment returns ${on.logged.length}`);
});

check("every access-logged tool names categories and a subject the access log will keep", () => {
  // accessLog.worthLogging drops an entry with no categories, and accessEntry
  // rewrites an unknown subject kind to "order". Either turns a row that was
  // written into a row that says something else, or into no row at all.
  const accessLog = require("../../privacy/accessLog");
  for (const entry of registry.TOOL_REGISTRY) {
    if (!entry.piiAccessLogged) {
      assert.strictEqual(entry.piiSubject, null, `${entry.name} names a subject but files no row`);
      continue;
    }
    assert.ok(entry.pii.length > 0, `${entry.name} would be dropped by worthLogging`);
    for (const category of entry.pii) {
      assert.ok(accessLog.PII_CATEGORIES.includes(category), `${entry.name}: "${category}" is not an access-log category`);
    }
    assert.ok(accessLog.SUBJECT_KINDS.includes(entry.piiSubject),
      `${entry.name}: subject kind "${entry.piiSubject}" would be silently rewritten to "order"`);
  }
});

/** `_nvMcpPiiAccessEntry` rows built in a child process under a chosen flag state. */
function accessRowsUnder(flags, calls) {
  const script = `
    for (const k of Object.keys(process.env)) if (/MCP/.test(k)) delete process.env[k];
    process.env.NIVADESK_MCP_ORCHESTRATOR = ${JSON.stringify(flags.orchestrator ? "1" : "0")};
    const api = require(${JSON.stringify(INDEX)});
    const out = ${JSON.stringify(calls)}.map(([action, context, args]) => api._nvMcpPiiAccessEntry(action, context, args));
    console.log(JSON.stringify(out));
  `;
  const raw = execFileSync(process.execPath, ["-e", script], { cwd: FUNCTIONS_DIR, maxBuffer: 40 * 1024 * 1024 }).toString();
  return JSON.parse(raw.trim().split("\n").pop());
}

check("an access-log row names the door it came through, and says when it has no subject", () => {
  // Two halves of the same finding. `source: "mcp"` was hardcoded while
  // chatgptWorkspaceAction dispatches the same actions through the same switch
  // over a member's own ID token, so every REST read was filed as MCP — the one
  // question a source field exists to answer. And a capability that takes no
  // orderId files `subject.id: ""`, which reads as a row whose subject went
  // missing rather than as a read of a SET.
  //
  // Both fixes are BEHIND THE FLAG, and the next check is why: they are the two
  // fields that changed what a compliance surface records with every flag unset,
  // for reads production already performs today.
  const accessLog = require("../../privacy/accessLog");
  const base = { companyId: "co_1", uid: "u1", email: "u@example.com" };

  const [mcp, rest, one] = accessRowsUnder({ orchestrator: true }, [
    ["search_commerce_orders", { ...base, surface: "mcp" }, {}],
    ["search_commerce_orders", { ...base, surface: "rest" }, {}],
    ["get_order_detail", { ...base, surface: "mcp" }, { orderId: "o_1" }]
  ]);
  assert.strictEqual(mcp.source, "mcp");
  assert.strictEqual(rest.source, "rest", "a REST read is still filed as MCP");
  assert.ok(accessLog.ACCESS_SOURCES.includes("rest"), "\"rest\" would be rewritten to \"unknown\" at write time");
  for (const row of [mcp, rest]) {
    assert.strictEqual(accessLog.accessEntry(row).source, row.source, "the source survives normalisation");
  }

  // A set read says so; a record read names the record.
  assert.strictEqual(mcp.subject.id, "");
  assert.ok(/subject=set/.test(mcp.note), `a set read must say it read a set: ${mcp.note}`);
  assert.strictEqual(one.subject.id, "o_1");
  assert.ok(!/subject=set/.test(one.note));

  // And the two entry points stamp the surface, because they are the only
  // things that know it: an MCP call authenticated with a member's own ID
  // token is still an MCP call.
  assert.ok(/nvChatGPTDispatchAction\(\{ \.\.\.context, surface: "mcp" \}/.test(indexSource),
    "the MCP tool-call path no longer stamps its surface");
  assert.ok(/nvChatGPTDispatchAction\(\{ \.\.\.context, surface: "rest" \}/.test(indexSource),
    "chatgptWorkspaceAction no longer stamps its surface");

  // Half of that fix landed. The orchestrator adapter hardcoded
  // `channel: { type: "mcp" }` and never read the surface, and
  // orchestrator/index.js files the marketplace-PII-block row off
  // `ctx.channel.type` — so one chatgptWorkspaceAction request produced an
  // access row correctly saying "rest" and a block row from the same request
  // saying "mcp". Both halves come from `nvMcpAccessSource(context)` now.
  assert.ok(/channel: \{ type: nvMcpAccessSource\(context\) \}/.test(indexSource),
    "the orchestrator adapter files a REST request as MCP again");
  assert.ok(!/channel: \{ type: "mcp" \}/.test(indexSource),
    "the channel type is hardcoded somewhere in index.js again");
});

check("with the flags off, the access log records exactly what production records", () => {
  // The invariant is behavioural, not a claim about tools/list: merging and
  // deploying with every flag unset must not change what a compliance surface
  // writes for reads that already happen today. Two fields broke it.
  //
  //   `source: nvMcpAccessSource(context)` — production hardcodes "mcp" for
  //   BOTH doors, so every chatgptWorkspaceAction read started being filed as
  //   "rest" the moment the branch merged, flags or no flags.
  //
  //   `note: subjectId ? … : "… subject=set"` — production writes only
  //   `action=<name>`, so every set read gained a suffix.
  //
  // Both are improvements. That is not the point: `piiAccessLoggedFlag` already
  // exists three lines away and puts the two bank rows behind the flag for
  // exactly this reason. It simply was not applied here.
  const base = { companyId: "co_1", uid: "u1", email: "u@example.com" };
  // The six actions production logs, driven through both doors and both shapes
  // of subject.
  const PRODUCTION_LOGGED = [
    "get_dashboard_summary", "get_extra_spending_overview", "get_financial_overview",
    "get_order_detail", "get_order_financials", "search_orders"
  ];
  const calls = [];
  for (const action of PRODUCTION_LOGGED) {
    for (const surface of ["mcp", "rest"]) {
      calls.push([action, { ...base, surface }, {}]);
      calls.push([action, { ...base, surface }, { orderId: "o_1" }]);
    }
  }

  const off = accessRowsUnder({ orchestrator: false }, calls);
  assert.strictEqual(off.filter((row) => row === null).length, 0,
    "an action production logs stopped being logged with the flags off");
  for (let index = 0; index < calls.length; index += 1) {
    const [action, context, args] = calls[index];
    const row = off[index];
    assert.strictEqual(row.source, "mcp",
      `${action} over ${context.surface} files source "${row.source}" with the flags off; the deployed tree writes "mcp"`);
    assert.strictEqual(row.note, `action=${action}`,
      `${action} files note "${row.note}" with the flags off; the deployed tree writes "action=${action}"`);
    // The fields that did NOT move stay where they were, so this check does not
    // quietly become "the row is whatever it is".
    assert.strictEqual(row.actorRole, "chatgpt_connection");
    assert.strictEqual(row.action, "assistant");
    assert.strictEqual(row.subject.kind, "order");
    assert.deepStrictEqual(row.categories, ["name", "email", "phone", "address"]);
    assert.strictEqual(row.subject.id, String(args.orderId || ""));
  }

  // And the improvements are reachable — a gate that never opens is a feature
  // that does not work.
  const on = accessRowsUnder({ orchestrator: true }, [
    ["search_orders", { ...base, surface: "rest" }, {}],
    ["search_orders", { ...base, surface: "rest" }, { orderId: "o_1" }]
  ]);
  assert.strictEqual(on[0].source, "rest");
  assert.strictEqual(on[0].note, "action=search_orders subject=set");
  assert.strictEqual(on[1].note, "action=search_orders");
});

check("assertRegistry refuses the mistakes it exists for", () => {
  const clone = () => JSON.parse(JSON.stringify(registry.TOOL_REGISTRY));
  const rejects = (mutate, why) => {
    const table = clone();
    mutate(table);
    assert.throws(() => registry.assertRegistry(table), /MCP tool registry/, `should have refused: ${why}`);
  };

  rejects((t) => { t[0].annotations.readOnlyHint = null; }, "a null hint");
  rejects((t) => { delete t[0].annotations.openWorldHint; }, "a missing hint");
  rejects((t) => { t[0].annotations.readOnlyHint = "false"; }, "a stringified hint");
  rejects((t) => { t[0].justification.readOnlyHint = ""; }, "an empty justification");
  rejects((t) => { t[0].justification.destructiveHint = "It only adds a record."; }, "a justification that is not a reason");
  rejects((t) => { t[0].scopes = ["inventory.write"]; }, "a scope the OAuth metadata does not advertise");
  rejects((t) => { t[0].scopes = []; }, "no scope at all");
  rejects((t) => { t[0].annotations.openWorldHint = false; }, "an effect with openWorldHint false");
  // Found by name, not by position: the table grew and "the last entry" stopped
  // being an open-world tool, which made this mutation silently stop testing
  // anything.
  rejects((t) => { t.find((entry) => entry.annotations.openWorldHint === true).effects = []; }, "openWorldHint true with no effect named");
  rejects((t) => { t[1].justification.readOnlyHint = "Because it reads orders."; }, "a logged read that hides its access-log row");
  rejects((t) => { t[1].name = t[0].name; }, "a duplicate tool name");
  rejects((t) => { t[0].name = "debug_orders"; }, "a name that reads like an internal action");
  rejects((t) => { t[0].riskClass = "Z"; }, "an unknown risk class");
  rejects((t) => { t[0].permission.ownerOnly = "yes"; }, "a non-boolean permission flag");

  // The pending-guard coupling, in both directions.
  const withGuard = clone();
  const guarded = withGuard.find((e) => e.pendingGuard);
  assert.ok(guarded, "expected at least one entry waiting on a behaviour guard");
  const token = guarded.pendingGuard.token;
  rejects(
    (t) => { const e = t.find((x) => x.pendingGuard); e.annotations[e.pendingGuard.hint] = e.pendingGuard.flipsTo; },
    "a hint flipped ahead of the guard it names"
  );
  assert.throws(
    () => registry.assertRegistry(clone(), `function ${token}() {}`),
    /flip idempotentHint to true/,
    "should have refused a hint left behind after its guard shipped"
  );
  // And it passes against the real handler source, where the guard is absent.
  assert.strictEqual(registry.assertRegistry(registry.TOOL_REGISTRY, indexSource), true);
});

check("a broken table takes down the MCP surface, not every function's cold start", () => {
  // `assertRegistry()` used to run at module scope, and functions/index.js
  // requires this module unconditionally — so a malformed tool entry failed
  // the cold start of all 400-plus deployed functions, order writes and bank
  // feed included. The check keeps its teeth and loses its reach.
  assert.ok(
    !/^assertRegistry\(\);\s*$/m.test(registrySource),
    "registry.js validates at require time again: a bad entry there fails every deployed function's cold start"
  );

  // Behavioural, and the two halves prove each other: the corruption is
  // introduced AFTER the module is required, so a table validated at require
  // time would have memoised "valid" and let these calls through.
  const saved = require.cache[REGISTRY_PATH];
  delete require.cache[REGISTRY_PATH];
  try {
    const fresh = require(REGISTRY_PATH);
    fresh.TOOL_REGISTRY[0].annotations.readOnlyHint = null;
    for (const [label, call] of [
      ["publishedNames", () => fresh.publishedNames({})],
      ["annotationsFor", () => fresh.annotationsFor("create_order", {})],
      ["scopesFor", () => fresh.scopesFor("create_order")],
      ["publishedForChannel", () => fresh.publishedForChannel({ flags: {} })]
    ]) {
      assert.throws(call, /MCP tool registry/, `${label} served a table that cannot describe itself`);
    }
    // Memoised, and memoised as the SAME failure rather than a second, later
    // one from a half-validated table.
    const first = (() => { try { fresh.publishedNames({}); } catch (error) { return error; } return null; })();
    const second = (() => { try { fresh.publishedNames({}); } catch (error) { return error; } return null; })();
    assert.strictEqual(first, second, "the second call reported a different failure");
  } finally {
    delete require.cache[REGISTRY_PATH];
    if (saved) require.cache[REGISTRY_PATH] = saved;
  }
});

check("the annotation set that actually SHIPS is checked, not only the verified one", () => {
  // With the orchestrator flag off, annotationsFor serves `liveAnnotations`.
  // The openWorldHint-vs-effects check used to read `entry.annotations` only,
  // so the four booleans a reviewer is looking at today were exempt from the
  // one structural check this file was built around, and a third wrong live
  // value could have been added without the load-time assertion noticing.
  const clone = () => JSON.parse(JSON.stringify(registry.TOOL_REGISTRY));
  const rejects = (mutate, why, pattern = /MCP tool registry/) => {
    const table = clone();
    mutate(table);
    assert.throws(() => registry.assertRegistry(table), pattern, `should have refused: ${why}`);
  };

  // A third wrong live value, on a tool that has no pending correction.
  rejects((t) => {
    const entry = t.find((e) => !e.liveAnnotations && e.annotations.readOnlyHint === true);
    entry.liveAnnotations = { ...entry.annotations, readOnlyHint: false };
  }, "a live hint that disagrees with the verified one and is named nowhere", /no pending correction names it/);

  // The served openWorldHint contradicting the tool's own effects — the 1.1.1
  // defect itself, arriving through the half of the table that ships.
  rejects((t) => {
    const entry = t.find((e) => !e.liveAnnotations && e.effects.length === 0 && e.annotations.openWorldHint === false);
    entry.effects = ["customer_message"];
    entry.annotations = { ...entry.annotations, openWorldHint: true };
    entry.liveAnnotations = { ...entry.annotations, openWorldHint: false };
  }, "a served openWorldHint false on a tool that mails the customer");

  // And the allowlist cannot rot into a licence: a correction whose two values
  // now agree is a correction that has already shipped.
  rejects((t) => {
    const entry = t.find((e) => e.name === "create_order");
    entry.liveAnnotations = { ...entry.annotations };
  }, "a pending correction for a hint that no longer differs", /remove it/);

  // Every declared correction names a real tool, a real hint, and a reason.
  const names = new Set(registry.TOOL_REGISTRY.map((entry) => entry.name));
  for (const [name, hints] of Object.entries(registry.LIVE_HINT_EXEMPTIONS)) {
    assert.ok(names.has(name), `LIVE_HINT_EXEMPTIONS names ${name}, which is not a tool`);
    for (const [hint, reason] of Object.entries(hints)) {
      assert.ok(registry.ANNOTATION_KEYS.includes(hint), `${name}: ${hint} is not a hint`);
      assert.ok(typeof reason === "string" && reason.trim().length >= 20, `${name}.${hint} has no reason`);
    }
  }
  // The allowlist and the corrections the registry is holding back are the
  // same list, read two ways.
  assert.deepStrictEqual(
    registry.correctionsPending().map((row) => `${row.name}.${row.changes.map((c) => c.hint).sort().join("+")}`).sort(),
    Object.entries(registry.LIVE_HINT_EXEMPTIONS).map(([name, hints]) => `${name}.${Object.keys(hints).sort().join("+")}`).sort()
  );
});

/* ------------------------------------------------------------------ *
 * 3. The served tools/list, snapshotted.
 * ------------------------------------------------------------------ */

/** tools/list as this deployment would serve it, under the given flags. */
function servedTools(flags) {
  const script = `
    const api = require(${JSON.stringify(INDEX)});
    console.log(JSON.stringify(api._nvMcpToolsWithSecuritySchemes().map((tool) => ({
      name: tool.name,
      annotations: tool.annotations,
      scopes: (tool.securitySchemes[0] || {}).scopes
    }))));
  `;
  const out = execFileSync(process.execPath, ["-e", script], {
    cwd: FUNCTIONS_DIR,
    env: {
      ...process.env,
      NIVADESK_MCP_EMAIL_RECEIPTS: "0",
      NIVADESK_MCP_INVENTORY: flags.inventory ? "1" : "0",
      NIVADESK_MCP_ORCHESTRATOR: flags.orchestrator ? "1" : "0"
    }
  }).toString();
  return JSON.parse(out.trim().split("\n").pop());
}

// `--write` re-records the two ORCHESTRATOR states only, and refuses the other
// two. The "off" and "inventory" recordings are the evidence that the listing
// the 1.1.1 connection is served did not move; a --write that regenerated them
// would overwrite the finding with whatever the code now does, which is the one
// thing a parity fixture must never be able to do. When the flagged surface
// changes — as it did on 6 September 2026, from ten capabilities to two — this
// is how the fixture follows it.
if (process.argv.includes("--write")) {
  const next = { ...fixture, states: { ...fixture.states } };
  for (const label of ["orchestrator", "inventory+orchestrator"]) {
    next.states[label] = { ...fixture.states[label], tools: servedTools(FLAG_STATES[label]) };
  }
  fs.writeFileSync(FIXTURE, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`re-recorded the orchestrator states (${next.states.orchestrator.tools.length} and ${next.states["inventory+orchestrator"].tools.length} tools)`);
  console.log("\"off\" and \"inventory\" were NOT touched: they are the reviewed 1.1.1 listing");
  process.exit(0);
}

for (const [label, flags] of Object.entries(FLAG_STATES)) {
  check(`tools/list matches the recorded snapshot (${label})`, () => {
    const expected = fixture.states[label];
    assert.ok(expected, `no fixture for flag state ${label}`);
    const served = servedTools(flags);
    assert.deepStrictEqual(
      served.map((t) => t.name), expected.tools.map((t) => t.name),
      `${label}: the published tool names or their order changed`
    );
    assert.deepStrictEqual(
      served, expected.tools,
      `${label}: the published annotations or scopes changed. If that is intended, it is a submission decision — update the fixture in the same commit and say so in docs/mcp-tool-annotations.md.`
    );
    for (const tool of served) {
      for (const hint of HINTS) {
        assert.strictEqual(typeof tool.annotations[hint], "boolean", `${label}/${tool.name}.${hint} left the wire as ${JSON.stringify(tool.annotations[hint])}`);
      }
    }
  });
}

check("the review connection's listing is exactly the 19 reviewed tools", () => {
  // Flag off is what the 1.1.1 connection is served. Nothing may be added to
  // it, and the two corrected hints must still show their pre-correction
  // values, because moving them is the operator's submission decision.
  const served = fixture.states.off.tools;
  assert.strictEqual(served.length, 19);
  const byName = Object.fromEntries(served.map((t) => [t.name, t.annotations]));
  assert.strictEqual(byName.create_order.openWorldHint, false);
  assert.strictEqual(byName.update_order_status.openWorldHint, false);
  assert.strictEqual(byName.update_order_status.idempotentHint, true);
});

check("the corrections waiting on the flag are exactly the three the audit found", () => {
  const pending = registry.correctionsPending();
  assert.deepStrictEqual(
    pending.map((row) => `${row.name}.${row.changes.map((c) => c.hint).join("+")}`),
    ["create_order.openWorldHint", "update_order_status.idempotentHint+openWorldHint"]
  );
  for (const row of pending) {
    for (const change of row.changes) {
      assert.strictEqual(registry.annotationsFor(row.name, {})[change.hint], change.live);
      assert.strictEqual(registry.annotationsFor(row.name, { orchestrator: true })[change.hint], change.verified);
    }
  }
});

/* ------------------------------------------------------------------ *
 * 4. The registry is the only list.
 * ------------------------------------------------------------------ */

check("the tool list, the dispatcher and the registry name the same tools", () => {
  // A tool hidden from tools/list for a review used to answer anyway, because
  // the list and the dispatcher were two lists. Three lists now, all pinned.
  for (const entry of registry.TOOL_REGISTRY) {
    assert.ok(
      indexSource.includes(`case "${entry.name}":`),
      `${entry.name} is published but the dispatcher has no case for it`
    );
    assert.ok(
      indexSource.includes(`annotationsFor("${entry.name}", NV_MCP_FLAGS)`),
      `${entry.name}'s schema does not take its annotations from the registry`
    );
  }
  const inSchemas = (indexSource.slice(indexSource.indexOf("function nvMcpOrderToolSchemas()"), indexSource.indexOf("function nvMcpInitializeResult"))
    .match(/annotationsFor\("([a-z_]+)"/g) || []).map((s) => s.slice(16, -1));
  assert.deepStrictEqual(
    inSchemas, registry.TOOL_REGISTRY.map((e) => e.name),
    "the schema list and the registry disagree about which tools exist, or about their order"
  );
});

check("no annotation literal is left behind in index.js", () => {
  const schemas = indexSource.slice(
    indexSource.indexOf("function nvMcpOrderToolSchemas()"),
    indexSource.indexOf("function nvMcpInitializeResult")
  );
  assert.ok(
    !/readOnlyHint\s*:/.test(schemas),
    "a tool schema still spells its hints out inline; the registry has to be the only place they are written"
  );
  assert.ok(
    !/function nvMcpNormalizedAnnotations|nvMcpNormalizedAnnotations\(/.test(indexSource),
    "the coercing normaliser is back: `=== true` turns a null hint into false silently, which is what 1.1.1 was rejected for"
  );
});

check("the advertised scope of each tool comes from one table", () => {
  // There used to be two lists: a switch in index.js and the registry's own
  // `scopes` field, kept in step by hand. index.js now asks the registry, and
  // the served listing is what proves it — comparing the switch to the registry
  // would only have compared the registry to itself.
  const scopeSource = indexSource.slice(
    indexSource.indexOf("function nvMcpOAuthScopesForTool"),
    indexSource.indexOf("function nvMcpAssertAnnotations")
  );
  assert.ok(
    /return nvMcpRegistry\.scopesFor\(toolName\);/.test(scopeSource),
    "nvMcpOAuthScopesForTool has grown its own table again; the registry has to be the only one"
  );
  for (const [label, flags] of Object.entries(FLAG_STATES)) {
    for (const tool of servedTools(flags)) {
      assert.deepStrictEqual(
        tool.scopes, registry.scopesFor(tool.name),
        `${label}/${tool.name}: the scope on the wire and the registry disagree`
      );
    }
  }
});

/* ------------------------------------------------------------------ *
 * 5. The document a reviewer is handed says what the code says.
 * ------------------------------------------------------------------ */

check("docs/mcp-tool-annotations.md carries every tool and every reason verbatim", () => {
  for (const entry of registry.TOOL_REGISTRY) {
    assert.ok(doc.includes(`\`${entry.name}\``), `${entry.name} is missing from the justification document`);
    for (const hint of HINTS) {
      assert.ok(
        doc.includes(entry.justification[hint]),
        `${entry.name}: the document does not carry the ${hint} justification the code serves`
      );
    }
  }
});

check("the document states the four values it claims for each tool", () => {
  // The table rows are "| `name` | ✓/✗ | ..." — a value written one way in the
  // code and another in the document is worse than no document.
  for (const entry of registry.TOOL_REGISTRY) {
    const row = doc.split("\n").find((line) => line.startsWith(`| \`${entry.name}\` |`));
    assert.ok(row, `${entry.name} has no row in the annotation table`);
    const cells = row.split("|").map((c) => c.trim());
    const values = cells.slice(2, 6).map((c) => c.startsWith("true"));
    assert.deepStrictEqual(
      values, HINTS.map((hint) => entry.annotations[hint]),
      `${entry.name}: the table row does not match the registry`
    );
  }
});

check("the annotation document's own paragraph counts the table above it", () => {
  // The sentence under the table is the reviewer's index into it: how many
  // entries there are, how many of them the review connection is served, and
  // which flag hides the rest. Every number in it is a word rather than a
  // digit, so the `**N** tools` scan below never saw it, and the paragraph
  // states the two flag groups as a pair that overlaps by exactly one row — a
  // claim the registry can answer and prose cannot be trusted to keep.
  const paragraph = doc.split("\n\n").find((block) => /are published to the review connection/.test(block));
  assert.ok(paragraph, "the paragraph under the annotation table is gone");

  const flagsOff = registry.publishedNames({});
  const inventoryOnly = registry.publishedNames({ inventory: true }).filter((name) => !flagsOff.includes(name));
  const orchestratorOnly = registry.publishedNames({ orchestrator: true }).filter((name) => !flagsOff.includes(name));

  const total = /^([A-Za-z-]+|\d+) tools\./.exec(paragraph.trim());
  assert.ok(total, 'the paragraph must open with the size of the table ("N tools.")');
  assert.strictEqual(asCount(total[1]), registry.TOOL_REGISTRY.length,
    `the paragraph says "${total[1]} tools" and the registry holds ${registry.TOOL_REGISTRY.length}`);

  const served = /([A-Za-z]+|\d+) are published to the review connection/.exec(paragraph);
  assert.strictEqual(asCount(served[1]), flagsOff.length,
    `the paragraph says ${served[1]} tools go to the review connection; flags-off the registry publishes ${flagsOff.length}`);

  for (const [flagName, hidden] of [["NIVADESK_MCP_INVENTORY", inventoryOnly], ["NIVADESK_MCP_ORCHESTRATOR", orchestratorOnly]]) {
    const stated = new RegExp(`([A-Za-z]+|\\d+)[^.]*hidden behind\\s+\`?${flagName}\``).exec(paragraph.replace(/\n/g, " "));
    assert.ok(stated, `the paragraph does not say how many tools ${flagName} hides`);
    assert.strictEqual(asCount(stated[1]), hidden.length,
      `the paragraph says ${stated[1]} tools sit behind ${flagName}; the registry gates ${hidden.length} on it (${hidden.join(", ")})`);
    for (const name of hidden) {
      assert.ok(paragraph.includes(`\`${name}\``), `${flagName} publishes ${name} and the paragraph never names it`);
    }
  }
});

check("the parity document lists the flags-off surface, in order", () => {
  // docs/mcp-production-parity.md is the evidence that the reviewed listing has
  // not moved, and §3.1 writes that listing out by hand, one numbered row per
  // tool. The hash comparison in docs/evidence/capture-tools-list.js proves the
  // BYTES; nothing checked that the table a person reads names the same tools
  // in the same order, so a capability added to the flags-off set would be
  // invisible here while every other check stayed green.
  const parity = fs.readFileSync(path.join(FUNCTIONS_DIR, "..", "docs", "mcp-production-parity.md"), "utf8");
  const rows = parity.split("\n")
    .map((line) => /^\| (\d+) \| `([a-z_]+)` \|/.exec(line))
    .filter(Boolean);
  const flagsOff = registry.publishedNames({});
  assert.deepStrictEqual(rows.map((row) => row[2]), flagsOff,
    "the parity document's §3.1 table is not the flags-off listing, in listing order");
  assert.deepStrictEqual(rows.map((row) => Number(row[1])), flagsOff.map((_, index) => index + 1),
    "the parity document's §3.1 table is misnumbered");
  // Every "N tools" in the prose is the same 19 — except where the sentence
  // attributes the figure to a named commit, which makes it a measurement of
  // that tree rather than a claim about this one. §5 measures `f753a8ca` at 16
  // that way, and it is right to.
  let seen = 0;
  parity.split("\n").forEach((line, index) => {
    for (const match of line.matchAll(/\b(\d+) tools?\b/g)) {
      if (/`[0-9a-f]{7,40}`/.test(line)) continue;   // attributed to a commit
      seen += 1;
      assert.strictEqual(Number(match[1]), flagsOff.length,
        `mcp-production-parity.md:${index + 1} states ${match[1]} tools; flags-off the registry publishes ` +
        `${flagsOff.length}. A figure measured at another commit has to name that commit on the same line.`);
    }
  });
  assert.ok(seen >= 3, `expected the parity document to state its tool count in prose, found ${seen}`);
});

check("the submission document counts the surface the flags actually publish", () => {
  // docs/mcp-submission-1.2.0.md is what the operator flips flags from and what
  // the release notes are written out of. A count that drifts there becomes a
  // sentence sent to a reviewer that the deployed listing then contradicts.
  const submission = fs.readFileSync(path.join(FUNCTIONS_DIR, "..", "docs", "mcp-submission-1.2.0.md"), "utf8");
  const rows = {
    "none (today)": {},
    "`NIVADESK_MCP_INVENTORY`": { inventory: true },
    "`NIVADESK_MCP_ORCHESTRATOR`": { orchestrator: true },
    "inventory + orchestrator": { inventory: true, orchestrator: true }
  };
  for (const [label, flags] of Object.entries(rows)) {
    const line = submission.split("\n").find((text) => text.startsWith(`| ${label} |`));
    assert.ok(line, `the submission document has no row for ${label}`);
    const published = registry.publishedNames(flags).length;
    assert.ok(
      line.includes(`**${published}**`) || line.includes(`| ${published} |`),
      `${label}: the document does not say ${published} tools`
    );
  }

  // And the corrections it promises the reviewer are the ones the registry is
  // holding back — no more, and no fewer.
  const correctionRows = submission.split("\n").filter((line) => /^\| `[a-z_]+` \| `[a-zA-Z]+Hint` \|/.test(line));
  let pending = 0;
  for (const row of registry.correctionsPending()) {
    for (const change of row.changes) {
      pending += 1;
      const line = correctionRows.find((text) => text.startsWith(`| \`${row.name}\` | \`${change.hint}\` |`));
      assert.ok(line, `${row.name}/${change.hint} is not in the submission document's correction table`);
      assert.ok(
        line.includes(`| ${change.live} | **${change.verified}**`),
        `${row.name}/${change.hint}: the document does not state ${change.live} → ${change.verified}`
      );
    }
  }
  assert.strictEqual(correctionRows.length, pending,
    "the submission document lists a different number of annotation corrections than the registry holds");
});

check("no document states a wire count in prose that the builder does not produce", () => {
  // The check above pins the submission document's TABLE ROWS, and it was green
  // on 7 September 2026 while three documents each carried a sentence beside a
  // pinned row stating a different number: the submission said `inventory +
  // orchestrator` is "**30** tools" two sections after its own table said 22,
  // the design document said "**30** tools, not 31", and the decision
  // document's outcome row read "19 / 21 / 29 / **30**". All three were the
  // count before the 6 September reduction took eight capabilities out. A row
  // that a test reads stays true and a sentence beside it does not, so the
  // sentences are read here too — every bolded "**N** tools" and every
  // four-state "a / b / c / d" quartet in the documents an operator flips flags
  // from, and in the two gate artefacts that report counts.
  //
  // A historical figure is written unbolded, with the sentence saying what it
  // is the history of. Only a count the builder produces today may be bold.
  const DOCS = [
    "mcp-submission-1.2.0.md",
    "mcp-inventory-search-decision.md",
    "mcp-orchestration-design.md",
    "mcp-backlog.md"
  ];
  const counts = Object.values(FLAG_STATES).map((flags) => registry.publishedNames(flags).length);
  const live = new Set(counts);
  const quartet = counts.join(" / ");
  let bold = 0;
  let quartets = 0;

  for (const name of DOCS) {
    const text = fs.readFileSync(path.join(FUNCTIONS_DIR, "..", "docs", name), "utf8");
    text.split("\n").forEach((line, index) => {
      for (const match of line.matchAll(/\*\*(\d+)\*\* tools?\b/g)) {
        bold += 1;
        assert.ok(
          live.has(Number(match[1])),
          `${name}:${index + 1} states **${match[1]}** tools; no flag state publishes that. ` +
          `The builder publishes ${[...live].sort((a, b) => a - b).join(", ")}. ` +
          `Bold a count only when it is one of those; write a historical figure unbolded and say what it is history of.`
        );
      }
      // `**19 / 21 / 21 / 22**` bolds the whole quartet, so strip emphasis first.
      // Requiring spaces around the slashes keeps this off line and version
      // references like `index.js:2074/2105/2138/2175`.
      for (const match of line.replace(/\*\*/g, "").matchAll(/(?<![\d.])(\d+) \/ (\d+) \/ (\d+) \/ (\d+)(?![\d.])/g)) {
        quartets += 1;
        assert.strictEqual(
          match.slice(1, 5).join(" / "), quartet,
          `${name}:${index + 1} states the four flag states as "${match[0]}"; the builder publishes ${quartet} ` +
          `for ${Object.keys(FLAG_STATES).join(" / ")}`
        );
      }
    });
  }

  // If the patterns stop matching anything the check has gone quiet rather than
  // green, which is how B4, B5 and B9 survived in the first place.
  assert.ok(bold >= 3, `expected the pinned documents to state at least three bolded tool counts, found ${bold}`);
  assert.ok(quartets >= 2, `expected at least two four-state quartets in the pinned documents, found ${quartets}`);
});

check("a hyphenated wire count is a wire count too", () => {
  // The check above matched `**N** tools` and a bare four-state quartet, and it
  // was green on 7 September 2026 while `docs/mcp-orchestration-design.md`
  // §7 recommended flipping all three flags "so the reviewer sees the finished
  // 30-tool surface once". Written that way the number sits outside both
  // patterns: no bold, and "tool" hyphenated onto the noun. Wrong by eight, in
  // the paragraph that tells the operator what a reviewer will be shown.
  //
  // The pattern is exercised against a literal below rather than only against
  // the documents, because a document with no hyphenated count left in it is
  // the normal state, and a scan that matches nothing proves nothing.
  // Same convention as the check above: a count the builder produces today may
  // be stated flat; a superseded figure has to read as history. There the
  // marker is "unbolded"; a hyphenated count cannot be bolded, so the marker is
  // the sentence's own tense — `docs/mcp-inventory-search-decision.md` calls
  // its 29 "the defect this section describes", and the design's 30 was
  // recommending what a reviewer would be shown.
  // The marker is looked for over the wrapped sentence, not the one line: these
  // documents are hard-wrapped at about 100 characters, and the decision
  // document's own "the defect this section describes" sits on the line ABOVE
  // its 29.
  const HYPHENATED = /(?<![\d.])(\d+)-tool\b/g;
  const HISTORY = /\b(was|were|until|used to|no longer|had been|defect|stale|history|historical)\b/i;
  const windowAt = (lines, index) => lines.slice(Math.max(0, index - 1), index + 2).join(" ");
  const verdict = (lines, index) => [...String(lines[index]).matchAll(HYPHENATED)]
    .some(() => !HISTORY.test(windowAt(lines, index)));
  assert.ok(verdict(["Recommended: all three on, so the reviewer sees the finished 30-tool surface once."], 0),
    "the hyphenated-count pattern no longer catches the present-tense sentence it was written for");
  assert.ok(!verdict(["it went on shipping the defect this section", "describes: a 29-tool orchestrator state"], 1),
    "the history marker no longer recognises a figure a document is explicitly recording as past");

  const counts = Object.values(FLAG_STATES).map((flags) => registry.publishedNames(flags).length);
  const live = new Set(counts);
  for (const name of ["mcp-submission-1.2.0.md", "mcp-inventory-search-decision.md",
    "mcp-orchestration-design.md", "mcp-backlog.md", "mcp-tool-annotations.md",
    "mcp-production-parity.md", "orchestrator-contract.md"]) {
    const lines = fs.readFileSync(path.join(FUNCTIONS_DIR, "..", "docs", name), "utf8").split("\n");
    lines.forEach((line, index) => {
      for (const match of line.matchAll(HYPHENATED)) {
        assert.ok(
          live.has(Number(match[1])) || HISTORY.test(windowAt(lines, index)),
          `${name}:${index + 1} states a "${match[0]}" surface in the present tense; no flag state publishes ${match[1]}. ` +
          `The builder publishes ${[...live].sort((a, b) => a - b).join(", ")}. ` +
          `Write a superseded figure in a sentence that says what it is the history of.`
        );
      }
    });
  }
});

check("a per-flag tool count in prose is the delta that flag actually adds", () => {
  // `docs/mcp-orchestration-design.md` §7 item 6 is the operator's own "tools
  // exposed" list, one line per flag. It said `NIVADESK_MCP_ORCHESTRATOR=1
  // (9 tools ...)` until 7 September 2026 — the pre-reduction number — while
  // the flag adds two. This is not the same claim as a total: it is what
  // setting one flag on its own appends to the flags-off listing, so it is
  // measured that way.
  const design = fs.readFileSync(path.join(FUNCTIONS_DIR, "..", "docs", "mcp-orchestration-design.md"), "utf8");
  const base = registry.publishedNames({}).length;
  const FLAG_KEY = { NIVADESK_MCP_EMAIL_RECEIPTS: "emailReceipts", NIVADESK_MCP_INVENTORY: "inventory", NIVADESK_MCP_ORCHESTRATOR: "orchestrator" };
  let seen = 0;
  for (const match of design.matchAll(/`?(NIVADESK_MCP_[A-Z_]+)=1`?[^(\n]{0,40}\((\d+) tools?/g)) {
    const [, flagName, stated] = match;
    const key = FLAG_KEY[flagName];
    assert.ok(key, `the design document names an environment flag the registry does not know: ${flagName}`);
    const delta = registry.publishedNames({ [key]: true }).length - base;
    assert.strictEqual(Number(stated), delta,
      `the design document says ${flagName}=1 exposes ${stated} tools; on its own it adds ${delta} ` +
      `(${registry.publishedNames({ [key]: true }).filter((n) => !registry.publishedNames({}).includes(n)).join(", ") || "nothing"})`);
    seen += 1;
  }
  assert.ok(seen >= 2, `expected at least two per-flag tool counts in the design document, found ${seen}`);
});

check("the annotation corrections are counted the same in the table, the prose and the release notes", () => {
  // `registry.correctionsPending()` holds three hint changes across two tools.
  // The check above pins the submission's correction TABLE against it and was
  // green on 7 September 2026 while §3.1's heading read "The two annotation
  // corrections", §3's flag table said "**two annotation corrections**", and
  // §7 — the block marked "draft to paste" for OpenAI — opened "Two values
  // changed since 1.1.1, and both are corrections", then described only the two
  // `openWorldHint` changes. The third, `update_order_status` idempotentHint
  // true → false, moves on the wire the moment the flag is set: the release
  // notes under-declared a value the reviewer would find by reading the
  // listing, which is the shape 1.1.1 was rejected over.
  //
  // The count is read out of the registry, so if the no-op guard of §5.2 ships
  // and `correctionsPending()` drops to two, this check requires the documents
  // to say two in the same commit.
  const submission = fs.readFileSync(path.join(FUNCTIONS_DIR, "..", "docs", "mcp-submission-1.2.0.md"), "utf8");
  const total = registry.correctionsPending().reduce((sum, row) => sum + row.changes.length, 0);
  const tools = registry.correctionsPending().length;
  const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const word = WORDS[total];
  assert.ok(word, `the registry holds ${total} corrections and this check has no word for that`);

  // Unwrapped for the same reason the checks above are: these documents are
  // hard-wrapped, and two of the three sentences below span a line break.
  const flat = submission.replace(/\s+/g, " ");
  const sites = [
    [`### 3.1 The ${word} annotation corrections`, "§3.1's heading"],
    [`**${word} annotation corrections** across ${WORDS[tools]} tools`, "§3's per-flag table row"],
    [`**${word.charAt(0).toUpperCase()}${word.slice(1)} values changed since 1.1.1, across ${WORDS[tools]} tools`, "§7's release-note block"]
  ];
  for (const [needle, where] of sites) {
    assert.ok(flat.includes(needle),
      `${where} does not state the ${total} annotation corrections the registry holds ` +
      `(expected to find "${needle}"). registry.correctionsPending() is the count.`);
  }

  // The same number, in the design document's own submission plan (§7 item 1),
  // which said "Two values change from what is live" beside the submission's
  // three-row table.
  // Unwrapped: this sentence is hard-wrapped and the phrase spans two lines.
  const design = fs.readFileSync(path.join(FUNCTIONS_DIR, "..", "docs", "mcp-orchestration-design.md"), "utf8")
    .replace(/\s+/g, " ");
  const Capital = `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
  assert.ok(design.includes(`**${Capital} values change from what is live, across ${WORDS[tools]} tools**`),
    `the design document's §7 item 1 does not state the ${total} annotation corrections the registry holds`);

  // And every hint the registry is holding back has to be DESCRIBED in the
  // release-note block, not merely totalled there: a count that says three over
  // a paragraph that explains two is the defect this check was written for.
  const notes = releaseNoteBlock(submission);
  for (const row of registry.correctionsPending()) {
    for (const change of row.changes) {
      assert.ok(notes.includes(`\`${change.hint}: ${change.verified}\``),
        `the §7 release-note block never states ${row.name}'s corrected ${change.hint} (${change.verified}). ` +
        `A reviewer reads this block against the listing; a hint that moves and is not named here is one they find themselves.`);
    }
  }
});

/**
 * The §7 "draft to paste" block: every blockquote line under that heading.
 *
 * It is prose in a document otherwise full of tables, and it is the only text
 * in this repository that goes to OpenAI verbatim — two of the three false
 * claims closed on 6 and 7 September 2026 lived in it, and nothing parsed it.
 */
function releaseNoteBlock(submission) {
  const lines = submission.split("\n");
  const at = lines.findIndex((line) => /^## 7\. Release notes/.test(line));
  assert.ok(at >= 0, "the submission document no longer has a §7 release-notes section");
  const block = [];
  for (const line of lines.slice(at + 1)) {
    if (/^## /.test(line)) break;
    if (line.startsWith(">")) block.push(line.replace(/^>\s?/, ""));
  }
  assert.ok(block.length > 5, "the §7 release-note block is empty or is no longer a blockquote");
  return block.join("\n");
}

check("the release notes describe the freshness these two capabilities actually report", () => {
  // Measured, not reasoned about. The block said "Both report how fresh their
  // data is and what they could not include" until 7 September 2026, and
  // neither half of the first claim survives being run:
  //
  //   * `search_commerce_orders` names a source only for a provider with a
  //     commerceHealth document or a non-manual order, so on the manual-only
  //     review workspace — the workspace §6 step 7 tells the operator to demo
  //     on — `sources` is empty and no freshness is reported at all;
  //   * `search_inventory` has no connector behind it, so its one row is
  //     `state: "unsupported"` rather than a sync time.
  //
  // Same finding shape as B3: a submission page telling OpenAI that a tool
  // exhibits a behaviour the reviewer's own demo will not show.
  const commerce = require("../../orchestrator/commerce");
  const inventory = require("../../orchestrator/inventory");
  const manualOnly = {
    companyId: "co_1", nowMs: Date.UTC(2026, 8, 15, 12, 0, 0),
    settings: { seciliParaBirimi: "£" },
    orders: [{ id: "o1", companyId: "co_1", status: "In Progress", customerName: "A B", emailAddress: "a@b.co", createdAt: "2026-09-02" }],
    inventoryItems: [{ id: "i1", name: "Clasp", trackingType: "quantity", status: "available", quantity: { onHand: 10, unit: "pcs" } }]
  };
  const orders = commerce.searchCommerceOrders(manualOnly, {}, {});
  assert.strictEqual(orders.data.count, 1, "the manual-only snapshot no longer returns a row; this check proves nothing");
  assert.deepStrictEqual(orders.sources, [],
    "search_commerce_orders now names a source on a manual-only workspace; the release-note sentence below can be widened");
  const stock = inventory.searchInventoryItems(manualOnly, {}, {});
  assert.strictEqual(stock.sources.length, 1, "search_inventory no longer returns exactly one freshness row");
  assert.strictEqual(stock.sources[0].state, "unsupported",
    "search_inventory now reports a real freshness state; the release-note sentence below can be widened");

  const submission = fs.readFileSync(path.join(FUNCTIONS_DIR, "..", "docs", "mcp-submission-1.2.0.md"), "utf8");
  const notes = releaseNoteBlock(submission);
  assert.ok(!/both report how fresh/i.test(notes),
    "the release notes promise OpenAI that both new tools report how fresh their data is. " +
    "Measured just above: the order search reports nothing on a workspace with no connected channel, " +
    "and stock has no connector, so its freshness row is \"unsupported\".");
  assert.ok(/each channel that contributed/i.test(notes),
    "the release notes must say whose freshness the order search reports — the channels that contributed rows to that answer");
  assert.ok(/not applicable/i.test(notes),
    "the release notes must say that stock freshness is not applicable rather than leaving an unsupported row to read as a sync time");
});

check("the design document's disclaimed line numbers land on the lines they name", () => {
  // The 7 September 2026 banner tells a reader that four specific lines below
  // it are design history rather than a description of the shipped capability.
  // All four references were wrong — by 19, 19, 19 and 20 lines — which is
  // worse than no reference: the money sentence stays undisclaimed and the
  // reader is sent to a line that never needed disclaiming. The numbers are
  // read out of the banner rather than written here, so the check fails when
  // an edit above them shifts the document.
  const DESIGN = path.join(FUNCTIONS_DIR, "..", "docs", "mcp-orchestration-design.md");
  const lines = fs.readFileSync(DESIGN, "utf8").split("\n");
  const banner = lines.slice(0, 60).join("\n");
  const at = banner.indexOf("is design history");
  assert.ok(at >= 0, "the design banner no longer carries the money-history paragraph this check pins");
  const refs = [...banner.slice(at).matchAll(/\(`:(\d+)`\)/g)].map((m) => Number(m[1]));
  // In the order the banner names them.
  const EXPECTED = ["customerTotal", "totals: { grandTotal", "money fields only with financialInfo", "what it still owes"];
  assert.strictEqual(refs.length, EXPECTED.length,
    `the banner names ${refs.length} disclaimed lines and this check knows ${EXPECTED.length}; ` +
    "if a reference was added or removed, pair it with the phrase it points at here");
  refs.forEach((line, index) => {
    const text = lines[line - 1];
    assert.ok(text !== undefined, `the banner points at :${line}, past the end of the document`);
    assert.ok(text.includes(EXPECTED[index]),
      `the banner points at :${line} for "${EXPECTED[index]}", and that line reads:\n      ${String(text).slice(0, 120)}`);
  });
});

if (failures > 0) {
  console.error(`\n❌ MCP TOOL ANNOTATIONS: ${failures} failure(s)`);
  process.exit(1);
}
console.log("\n✅ MCP TOOL ANNOTATIONS GEÇTİ");
