// First click on a sidebar section that opens on Cloud Functions (8 Nov 2026, the owner: "on the web, when we click
// Sales or Inventory, the FIRST clicks always come in with a delay"). Those screens wait on callables that each run as
// their own Cloud Run service with no instance kept; the first request after a quiet spell waits for one to start
// (Cloud Monitoring, 7 days: p50 2.0–3.2 s). The shell now sends the sections' read-only opening calls ahead of the
// click (lib/studioflow/sectionWarmup.ts + useSectionWarmup.ts). This check holds:
//
//   1. the module, compiled with the tree's own TypeScript and driven with a pretend clock and storage: the five
//      sections and their callables (Orders added the same day, the owner: "fix Orders too" — its order panel's cards),
//      read-only names only, the smallest pages (limit 1), the order panel's per-order reads only with an id no order
//      has; a call a screen sends only to some people only behind the same gate; only sections in the menu;
//      at most once per section every 10 minutes, across tabs, with no account or workspace kept on the device; the
//      section on screen only marked;
//      nothing while the tab cannot run (hidden / offline / Save-Data); a failing call or storage never breaks it;
//   2. the warm-up names are still the ones those screens send when they open (a renamed or replaced callable would
//      leave the warm-up warming the wrong service), and the Orders gates are still the screens' own conditions;
//   3. the wiring: AppShell calls the hook with the workspace, the hrefs the sidebar draws (Messages as
//      messagesNavHref), the path on screen and the gates; the hook's three moments (settled + idle, tab shown, sidebar
//      pointer/focus) and its run conditions.
//   --require-build: also the built client chunks carry the warm-up (run after `npm run build`).
//
//   npm run test:section-warmup
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => { try { return fs.readFileSync(path.join(root, rel), "utf8"); } catch { return ""; } };
let checks = 0;
let failures = 0;
function expect(name: string, ok: unknown, detail = "") {
  checks += 1;
  if (ok) console.log(`ok   ${name}`);
  else { failures += 1; console.log(`FAIL ${name}${detail ? `  <- ${detail}` : ""}`); }
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function between(text: string, start: string, end: string) {
  const a = text.indexOf(start);
  const b = a >= 0 ? text.indexOf(end, a + start.length) : -1;
  return a >= 0 && b > a ? text.slice(a, b) : "";
}

// ---- 1. the module
const EXPECTED: Record<string, string[]> = {
  "/orders": ["getWorkspaceCardLayout", "getWorkspaceBlockHeadings", "getWorkspaceSmsSettings", "storageStatus", "listLibraryFiles",
    "getOrderInventory", "getShippingConnection", "getRoyalMailConnection", "getStripePaymentConnection", "listHeldIntegrationOrders"],
  "/sales": ["listSalesRows", "listSalesChannels"],
  "/inventory": ["listInventoryItems", "getInventorySummary", "listSuppliers", "listInventoryLocations", "getEbayListingLinks", "getWooProductLinks"],
  "/inbox": ["listCustomerInboxConversations", "getCustomerChannelStatus"],
  "/quick-reply": ["getQuickReplyPersonalSettings"]
};
const ALL_NAMES = Object.values(EXPECTED).flat();
// The Orders calls its screens send only to some people, and the condition (sectionWarmup.ts SectionWarmGate).
const GATED: Record<string, string> = {
  getWorkspaceSmsSettings: "customerCard", storageStatus: "clientFilesPlan", listLibraryFiles: "clientFiles",
  getOrderInventory: "inventory", getStripePaymentConnection: "finance", listHeldIntegrationOrders: "createOrders"
};
const ALL = () => true;
const TEN_MIN = 10 * 60 * 1000;

type Call = { name: string; payload: Record<string, unknown> };
type Mod = {
  WARM_INTERVAL_MS: number;
  SECTION_WARMUP: Record<string, { name: string; payload: (companyId: string) => Record<string, unknown>; gate?: string }[]>;
  SECTION_WARM_GATES: string[];
  WARM_ORDER_ID: string;
  sectionWarmupKey: (href: string) => string;
  createSectionWarmup: (deps: Record<string, unknown>) => { warm: (companyId: string, hrefs: string[], current?: string, allows?: (gate: string) => boolean) => string[] };
};
let mod: Mod | null = null;
const source = read("lib/studioflow/sectionWarmup.ts");
if (source) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "section-warmup-"));
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
  fs.writeFileSync(path.join(tmp, "sectionWarmup.mjs"), js);
  mod = await import(pathToFileURL(path.join(tmp, "sectionWarmup.mjs")).href) as Mod;
}
expect("lib/studioflow/sectionWarmup.ts exists and loads", mod);

function rig(options: { store?: Map<string, string>; canRun?: () => boolean; call?: (name: string, payload: Record<string, unknown>) => unknown; readThrows?: boolean; writeThrows?: boolean } = {}) {
  const calls: Call[] = [];
  const clock = { at: 1_800_000_000_000 };
  const store = options.store ?? new Map<string, string>();
  const warmup = mod!.createSectionWarmup({
    call: (name: string, payload: Record<string, unknown>) => { calls.push({ name, payload }); return options.call ? options.call(name, payload) : Promise.resolve({ data: {} }); },
    now: () => clock.at,
    read: (key: string) => { if (options.readThrows) throw new Error("SecurityError"); return store.has(key) ? store.get(key)! : null; },
    write: (key: string, value: string) => { if (options.writeThrows) throw new Error("QuotaExceededError"); store.set(key, value); },
    canRun: options.canRun ?? (() => true)
  });
  return { warmup, calls, clock, store };
}

if (mod) {
  const table = mod.SECTION_WARMUP;
  expect("the five sections, in this order", same(Object.keys(table), Object.keys(EXPECTED)), Object.keys(table).join(" "));
  for (const [href, names] of Object.entries(EXPECTED)) {
    expect(`${href} warms ${names.join(", ")}`, same((table[href] || []).map((c) => c.name), names), (table[href] || []).map((c) => c.name).join(" "));
  }
  const names = Object.values(table).flat().map((c) => c.name);
  expect("every warm-up call is a read (list…/get…, or storageStatus without check), none twice",
    names.every((n) => /^(list|get)[A-Z]/.test(n) || n === "storageStatus") && new Set(names).size === names.length, names.join(" "));
  expect("no write-shaped callable anywhere in the table", !names.some((n) => /^(save|set|delete|remove|change|copy|import|update|create|send|mark|connect|sync|refresh|start|run)/i.test(n)));
  const payload = (href: string, name: string) => (table[href] || []).find((c) => c.name === name)?.payload("ws1") ?? {};
  expect("every payload is the workspace's", Object.values(table).flat().every((c) => c.payload("ws1").companyId === "ws1"));
  expect("listSalesRows asks for one row, the screen's default filter",
    same(payload("/sales", "listSalesRows"), { companyId: "ws1", includeBespoke: true, needsAttentionOnly: false, limit: 1 }), JSON.stringify(payload("/sales", "listSalesRows")));
  expect("listInventoryItems asks for one item", same(payload("/inventory", "listInventoryItems"), { companyId: "ws1", limit: 1 }));
  expect("listCustomerInboxConversations asks for one conversation", same(payload("/inbox", "listCustomerInboxConversations"), { companyId: "ws1", limit: 1 }));
  expect("storageStatus is the plain read (never { check: true }, which asks the storage provider)",
    same(payload("/orders", "storageStatus"), { companyId: "ws1" }), JSON.stringify(payload("/orders", "storageStatus")));
  expect("the per-order reads use an id no order can have (Firestore ids have no hyphen)",
    /^[a-z]+-[a-z]+$/.test(mod.WARM_ORDER_ID) && !/^[A-Za-z0-9]{20}$/.test(mod.WARM_ORDER_ID)
      && same(payload("/orders", "getOrderInventory"), { companyId: "ws1", orderId: mod.WARM_ORDER_ID })
      && same(payload("/orders", "listLibraryFiles"), { companyId: "ws1", linkKey: `order:${mod.WARM_ORDER_ID}` }), mod.WARM_ORDER_ID);
  expect("no order-opening call (shipments, payment links, the order itself) is warmed: a made-up id would be refused",
    !names.some((n) => /^(listOrderShipments|listOrderRoyalMailShipments|listOrderPaymentRequests|getOrder$|getWebOrder)/.test(n)));
  expect("the gates are the six the shell answers", same(mod.SECTION_WARM_GATES, ["createOrders", "inventory", "clientFiles", "clientFilesPlan", "customerCard", "finance"]));
  const gatedNow = Object.fromEntries(Object.values(table).flat().filter((c) => c.gate).map((c) => [c.name, c.gate]));
  expect("exactly these Orders calls are gated, each behind its screen's condition", same(gatedNow, GATED), JSON.stringify(gatedNow));
  expect("interval is 10 minutes (Cloud Run keeps an idle instance up to 15)", mod.WARM_INTERVAL_MS === TEN_MIN, String(mod.WARM_INTERVAL_MS));

  {
    const r = rig();
    const started = r.warmup.warm("ws1", ["/home", "/orders", "/sales", "/inventory", "/inbox", "/quick-reply", "/files"], undefined, ALL);
    expect("a fresh tab warms the five sections in the menu, nothing else", same(started, ["/orders", "/sales", "/inventory", "/inbox", "/quick-reply"]), started.join(" "));
    expect("…with exactly their calls, once each", same(r.calls.map((c) => c.name), ALL_NAMES), r.calls.map((c) => c.name).join(" "));
    expect("…21 calls in all for someone every gate opens", r.calls.length === 21, String(r.calls.length));
    r.clock.at += 5 * 60 * 1000;
    expect("5 minutes later: nothing again", r.warmup.warm("ws1", ["/orders", "/sales", "/inventory", "/inbox", "/quick-reply"], undefined, ALL).length === 0 && r.calls.length === ALL_NAMES.length);
    r.clock.at += 5 * 60 * 1000 + 1;
    const again = r.warmup.warm("ws1", ["/sales", "/inventory"]);
    expect("past 10 minutes: those sections again", same(again, ["/sales", "/inventory"]) && r.calls.length === ALL_NAMES.length + 8, `${again.join(" ")} calls=${r.calls.length}`);
    // One Cloud Run instance serves every workspace: a workspace switch does not make a warm section cold.
    r.clock.at += 60_000;
    expect("another workspace a minute later: the services are already warm, nothing sent", r.warmup.warm("ws2", ["/sales"]).length === 0);
  }
  {
    const r = rig();
    r.warmup.warm("ws1", ["/sales"]);
    expect("only the sections the menu shows (a member without Inventory sends no inventory call)", same(r.calls.map((c) => c.name), EXPECTED["/sales"]));
    r.warmup.warm("ws1", ["/messages"]);
    expect("team Messages (/messages) is not the customer inbox: nothing sent", r.calls.length === 2);
  }
  {
    // Orders, gate by gate: a closed gate drops exactly its call; no answer means closed.
    const UNGATED = EXPECTED["/orders"].filter((n) => !GATED[n]);
    const none = rig();
    none.warmup.warm("ws1", ["/orders"]);
    expect("Orders with every gate closed (or none given): only the calls every screen sends",
      same(none.calls.map((c) => c.name), UNGATED), none.calls.map((c) => c.name).join(" "));
    for (const [name, gate] of Object.entries(GATED)) {
      const open = rig();
      open.warmup.warm("ws1", ["/orders"], undefined, (g) => g === gate);
      const shut = rig();
      shut.warmup.warm("ws1", ["/orders"], undefined, (g) => g !== gate);
      expect(`${name} only when "${gate}" is open`,
        same(open.calls.map((c) => c.name), EXPECTED["/orders"].filter((n) => !GATED[n] || n === name)) && !shut.calls.some((c) => c.name === name),
        `${open.calls.map((c) => c.name).join(" ")} | ${shut.calls.map((c) => c.name).join(" ")}`);
    }
    const throwing = rig();
    throwing.warmup.warm("ws1", ["/orders"], undefined, () => { throw new Error("no workspace"); });
    expect("a gate answer that throws counts as closed", same(throwing.calls.map((c) => c.name), UNGATED));
    const onOrders = rig();
    expect("on an order (/orders/<id>) the Orders calls are not sent again", onOrders.warmup.warm("ws1", ["/orders"], "/orders/abc", ALL).length === 0 && onOrders.calls.length === 0);
  }
  {
    const store = new Map<string, string>();
    const tabA = rig({ store });
    tabA.warmup.warm("ws1", ["/sales"]);
    const key = mod.sectionWarmupKey("/sales");
    expect("the stamp is shared through storage, under a name with no account or workspace in it",
      key === "nv.sectionWarm/sales" && store.get(key) === String(tabA.clock.at) && [...store.keys()].every((k) => !k.includes("ws1")), `${key}=${store.get(key)}`);
    const tabB = rig({ store });
    tabB.clock.at = tabA.clock.at + 60_000;
    expect("a second tab a minute later does not warm the same section", tabB.warmup.warm("ws1", ["/sales"]).length === 0 && tabB.calls.length === 0);
    store.set(mod.sectionWarmupKey("/inventory"), String(tabB.clock.at + 24 * 3600 * 1000));
    expect("a stamp from the future (clock moved back) does not hold a section cold", same(tabB.warmup.warm("ws1", ["/inventory"]), ["/inventory"]));
  }
  {
    const r = rig();
    const started = r.warmup.warm("ws1", ["/sales", "/inventory"], "/inventory");
    expect("the section on screen is not called again (its screen just did)", same(started, ["/sales"]) && !r.calls.some((c) => EXPECTED["/inventory"].includes(c.name)));
    expect("…but counts as warm: leaving it does not call it at once", r.warmup.warm("ws1", ["/inventory"], "/home").length === 0);
    const r2 = rig();
    expect("a sub-path of the section is the section", r2.warmup.warm("ws1", ["/sales"], "/sales/x").length === 0 && r2.calls.length === 0);
  }
  {
    let can = false;
    const r = rig({ canRun: () => can });
    expect("hidden tab / offline / Save-Data: nothing sent", r.warmup.warm("ws1", ["/sales"]).length === 0 && r.calls.length === 0);
    can = true;
    expect("…and nothing stamped, so it warms once it can", same(r.warmup.warm("ws1", ["/sales"]), ["/sales"]));
    const throwing = rig({ canRun: () => { throw new Error("no navigator"); } });
    expect("a run check that throws counts as cannot", throwing.warmup.warm("ws1", ["/sales"]).length === 0);
    expect("no workspace yet: nothing", rig().warmup.warm("", ["/sales"]).length === 0);
  }
  {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
    process.on("unhandledRejection", onUnhandled);
    const r = rig({ call: (name) => {
      if (name === "listSalesRows") throw new Error("sync failure");
      if (name === "listSalesChannels") return Promise.reject(new Error("permission-denied"));
      return Promise.resolve({ data: {} });
    } });
    let threw = false;
    try { r.warmup.warm("ws1", ["/sales", "/inventory"]); } catch { threw = true; }
    await new Promise((resolve) => setTimeout(resolve, 20));
    process.off("unhandledRejection", onUnhandled);
    expect("a call that throws or is refused breaks nothing", !threw && r.calls.length === 8 && unhandled.length === 0, `threw=${threw} calls=${r.calls.length} unhandled=${unhandled.length}`);
    const blocked = rig({ readThrows: true, writeThrows: true });
    expect("storage that refuses: still warms once…", same(blocked.warmup.warm("ws1", ["/sales"]), ["/sales"]));
    expect("…and this tab's memory still holds the interval", blocked.warmup.warm("ws1", ["/sales"]).length === 0 && blocked.calls.length === 2);
  }
}

// ---- 2. the names are still what those screens send when they open
const lib = (rel: string) => read(rel);
const OPENING: { name: string; lib: string; screen: string; uses: RegExp }[] = [
  { name: "listSalesRows", lib: "lib/studioflow/sales.ts", screen: "app/sales/page.tsx", uses: /fetchSalesRows\(/ },
  { name: "listSalesChannels", lib: "lib/studioflow/sales.ts", screen: "app/sales/page.tsx", uses: /fetchSalesChannels\(/ },
  { name: "listInventoryItems", lib: "lib/studioflow/inventory.ts", screen: "app/inventory/InventoryContent.tsx", uses: /listInventoryItems\(workspace\)/ },
  { name: "getInventorySummary", lib: "lib/studioflow/inventory.ts", screen: "app/inventory/InventoryContent.tsx", uses: /getInventorySummary\(workspace\)/ },
  { name: "listSuppliers", lib: "lib/studioflow/inventory.ts", screen: "app/inventory/InventoryContent.tsx", uses: /listSuppliers\(workspace\)/ },
  { name: "listInventoryLocations", lib: "lib/studioflow/inventory.ts", screen: "app/inventory/InventoryContent.tsx", uses: /listInventoryLocations\(workspace\)/ },
  { name: "getEbayListingLinks", lib: "lib/studioflow/ebayInventory.ts", screen: "app/inventory/InventoryContent.tsx", uses: /getEbayListingLinks\(workspace\.id\)/ },
  { name: "getWooProductLinks", lib: "lib/studioflow/wooInventory.ts", screen: "app/inventory/InventoryContent.tsx", uses: /getWooProductLinks\(workspace\.id\)/ },
  { name: "listCustomerInboxConversations", lib: "lib/studioflow/customerInbox.ts", screen: "app/inbox/InboxContent.tsx", uses: /loadCustomerInboxList\(workspace\.id/ },
  { name: "getCustomerChannelStatus", lib: "lib/studioflow/customerInbox.ts", screen: "app/inbox/InboxContent.tsx", uses: /loadCustomerChannelStatus\(workspace\.id\)/ },
  { name: "getQuickReplyPersonalSettings", lib: "lib/studioflow/quickReply.ts", screen: "app/quick-reply/page.tsx", uses: /loadQuickReplyPersonalSettings\(/ },
  { name: "getWorkspaceCardLayout", lib: "lib/studioflow/cardLayouts.ts", screen: "app/orders/OrderDetailContent.tsx", uses: /loadOrderDetailCardLayout\(currentUser\.uid, workspace\.id, order\.id/ },
  { name: "getWorkspaceBlockHeadings", lib: "lib/studioflow/blockHeadings.ts", screen: "app/orders/page.tsx", uses: /loadWorkspaceBlockHeadings\(loadedWorkspace\)/ },
  { name: "getWorkspaceSmsSettings", lib: "lib/studioflow/sms.ts", screen: "app/orders/OrderDetailContent.tsx", uses: /getWorkspaceSmsSettings\(workspace\)/ },
  { name: "storageStatus", lib: "lib/studioflow/storage.ts", screen: "app/orders/OrderDetailContent.tsx", uses: /getStorageStatusCached\(workspace\.id\)/ },
  { name: "listLibraryFiles", lib: "lib/studioflow/filesLibrary.ts", screen: "app/orders/OrderDetailContent.tsx", uses: /listLibraryFiles\(workspace, \{ linkKey: `order:\$\{order\.id\}` \}\)/ },
  { name: "getOrderInventory", lib: "lib/studioflow/inventory.ts", screen: "app/orders/OrderStockBlock.tsx", uses: /getOrderInventory\(workspace, orderId\)/ },
  { name: "getShippingConnection", lib: "lib/studioflow/shipping.ts", screen: "app/orders/OrderShipmentsPanel.tsx", uses: /getShippingConnection\(companyId\)/ },
  { name: "getRoyalMailConnection", lib: "lib/studioflow/royalMail.ts", screen: "app/orders/RoyalMailShipmentPanel.tsx", uses: /getRoyalMailConnection\(companyId\)/ },
  { name: "getStripePaymentConnection", lib: "lib/studioflow/stripeConnect.ts", screen: "components/OrderPaymentLinks.tsx", uses: /usePaymentLinksAvailable\(/ },
  { name: "listHeldIntegrationOrders", lib: "lib/studioflow/orders.ts", screen: "app/orders/page.tsx", uses: /listHeldIntegrationOrders\(workspace\)/ }
];
expect("every warm-up name has its opening check here", same(OPENING.map((o) => o.name).sort(), [...ALL_NAMES].sort()));
for (const o of OPENING) {
  expect(`${o.name}: ${o.lib} still calls it and ${o.screen} still opens with it`,
    lib(o.lib).includes(`"${o.name}"`) && o.uses.test(read(o.screen)), `${lib(o.lib).includes(`"${o.name}"`)} ${o.uses.test(read(o.screen))}`);
}
// The limit fields the warm-up sends are fields the clients already send, so the servers read them.
expect("the screens already send limit to listSalesRows and listInventoryItems",
  /limit: SALES_PAGE_SIZE \+ 1/.test(read("app/sales/page.tsx")) && /"listInventoryItems",\s*\{ companyId: workspace\.id, limit: 500/.test(read("lib/studioflow/inventory.ts")));
expect("…and the inbox client already sends limit to listCustomerInboxConversations",
  /companyId, \.\.\.\(limit \? \{ limit \} : \{\}\)/.test(read("lib/studioflow/customerInbox.ts")));

// The Orders gates are the screens' own conditions.
const detail = read("app/orders/OrderDetailContent.tsx");
const ordersPage = read("app/orders/page.tsx");
const caseBody = (label: string) => { const a = detail.indexOf(`case "${label}":`); if (a < 0) return ""; const rest = detail.slice(a + 8); const b = rest.search(/\n\s{6}(case "|default:)/); return b > 0 ? rest.slice(0, b) : rest; };
expect("gate inventory = the screen's: the stock block sits in the Materials card behind the inventory key",
  /workspaceAccessAllows\(workspace\.memberAccess, "inventory"\) \? \([\s\S]{0,700}<OrderStockBlock/.test(caseBody("materials")));
expect("gate finance = the screen's: the order's payment links sit in the Financial card",
  caseBody("financial").includes("<OrderPaymentLinks") && /financial: \["cardFinancial", "financialInfo"\]/.test(read("lib/studioflow/orderActionCards.ts")));
expect("gate customerCard = the screen's: the SMS row is asked only when the customer-portal card shows",
  /const showsPortalSmsRow = canShowOrderCard\("customerPortal"\);[\s\S]{0,120}if \(!showsPortalSmsRow\) return;[\s\S]{0,120}getWorkspaceSmsSettings\(workspace\)/.test(detail));
expect("gate clientFilesPlan = the screen's: the upload route is asked only on a plan with client files",
  /const clientFilesFeature = Boolean\(workspace\.entitlements\.features\.client_files\);[\s\S]{0,200}if \(!clientFilesFeature\) return[\s\S]{0,120}getStorageStatusCached\(workspace\.id\)/.test(detail));
expect("gate createOrders = the screen's: the held-orders queue only for someone who can create orders",
  /if \(!workspaceAccessAllows\(workspace\.memberAccess, "orders"\) \|\| !canCreateOrders\(workspace\)\) return;[\s\S]{0,120}listHeldIntegrationOrders\(workspace\)/.test(ordersPage));

// ---- 3. the wiring
const shell = read("components/AppShell.tsx");
const hook = read("lib/studioflow/useSectionWarmup.ts");
expect("AppShell imports the hook", /import \{ useSectionWarmup \} from "@\/lib\/studioflow\/useSectionWarmup";/.test(shell));
expect("AppShell warms the hrefs the sidebar draws (hidden items left out, Messages as messagesNavHref)",
  /NAV_ITEMS\.filter\(\(item\) => !navItemHidden\(item\)\)\s*\.map\(\(item\) => \(item\.href === "\/inbox" \? \(messagesNavHref\(workspace\?\.memberAccess\) \?\? item\.href\) : item\.href\)\)/.test(shell));
expect("AppShell passes the workspace, the menu (signed in only), the path on screen and the gates",
  /useSectionWarmup\(workspace\?\.id \?\? "", user\?\.uid \? warmMenuHrefs : "", pathname, warmGates\);/.test(shell));
const gateLine = (re: RegExp) => re.test(between(shell, "const warmGates = workspace", "useSectionWarmup("));
expect("AppShell answers each gate with the screen's condition",
  gateLine(/canCreateOrders\(workspace\) \? "createOrders"/)
  && gateLine(/workspaceAccessAllows\(workspace\.memberAccess, "inventory"\) && orderActionCardVisible\(workspace\.memberAccess, "materials"\) \? "inventory"/)
  && gateLine(/workspaceAccessAllows\(workspace\.memberAccess, "clientFiles"\) \? "clientFiles"/)
  && gateLine(/workspace\.entitlements\.features\.client_files \? "clientFilesPlan"/)
  && gateLine(/orderActionCardVisible\(workspace\.memberAccess, "customerPortal"\) \? "customerCard"/)
  && gateLine(/orderActionCardVisible\(workspace\.memberAccess, "financial"\) \? "finance"/));
expect("the sidebar nav keeps the id the hook listens on", /<nav id="app-sidebar-nav"/.test(shell) && /"#app-sidebar-nav"/.test(hook));
expect("hook: first warm-up after the shell settles, at an idle moment (with a fallback)",
  /setTimeout\(\(\) => \{\s*if \(idleWindow\.requestIdleCallback\) idleHandle = idleWindow\.requestIdleCallback\(run, \{ timeout: IDLE_TIMEOUT_MS \}\);\s*else run\(\);\s*\}, SETTLE_MS\)/.test(hook));
expect("hook: again when the tab is shown", /addEventListener\("visibilitychange", onVisibility\)/.test(hook) && /document\.visibilityState === "visible"\) run\(\)/.test(hook));
expect("hook: and when the pointer or focus enters the sidebar", /addEventListener\("pointerover", onSidebar/.test(hook) && /addEventListener\("focusin", onSidebar\)/.test(hook));
expect("hook: never while hidden, offline or on Save-Data",
  /document\.visibilityState === "visible" &&\s*navigator\.onLine !== false &&\s*\(navigator as SaveDataNavigator\)\.connection\?\.saveData !== true/.test(hook));
expect("hook: every listener and timer is removed on cleanup",
  /clearTimeout\(settle\)/.test(hook) && /removeEventListener\("visibilitychange", onVisibility\)/.test(hook) && /removeEventListener\("pointerover", onSidebar\)/.test(hook) && /removeEventListener\("focusin", onSidebar\)/.test(hook));
expect("hook: re-arms only when the workspace, the menu or the gates change, not on every navigation", /\}, \[companyId, menuHrefs, gates\]\);/.test(hook));
expect("hook: hands the module only the gates the shell named", /const open = new Set\(gates\.split\(" "\)\.filter\(Boolean\)\);/.test(hook) && /warm\(companyId, hrefs, current\.current, allows\)/.test(hook));
expect("hook: calls through the app's own Functions client (App Check, region, emulator)",
  /import \{ functions \} from "@\/lib\/firebase\/client";/.test(hook) && /httpsCallable\(functions, name\)\(payload\)/.test(hook));

// ---- --require-build: the client bundle carries it
if (process.argv.includes("--require-build")) {
  const dir = path.join(root, ".next/static/chunks");
  const chunks: string[] = [];
  const walk = (d: string) => { for (const e of fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }) : []) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith(".js")) chunks.push(p); } };
  walk(dir);
  const hits = chunks.filter((f) => fs.readFileSync(f, "utf8").includes("nv.sectionWarm"));
  expect("built: a client chunk carries the warm-up", hits.length > 0, `${chunks.length} chunks, ${hits.length} hits`);
}

console.log(`\n${checks - failures}/${checks} section-warmup checks passed`);
if (failures) process.exit(1);
