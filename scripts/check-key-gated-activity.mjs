// Key-gated activity + background calls (owner's rule, 8 Oct 2026;
// docs/web/restricted-member-background-calls-2026-10-08.md).
//
//   A. lib/studioflow/notificationAccess.ts — one pure helper: each access key
//      that is OFF hides its own rows; unknown rows stay visible; an all-true
//      (owner) map sees everything. Every reader of the activity stream imports
//      it: Home recent activity (useHomeData), AppShell (listener + badge),
//      NotificationsDrawer (list + open guard).
//   B. With a key OFF the browser does not make the call the server would
//      refuse: getInventorySummary / getOrderInventory (inventory),
//      listCustomerInboxConversations (messages), getSalesCapability (orders
//      key, not workflow role), listHeldIntegrationOrders (can create orders),
//      getWorkspaceSmsSettings (customer-portal card visible).
//
//   node scripts/check-key-gated-activity.mjs [--root <dir>]
import fs from "fs";
import path from "path";
import { pathToFileURL, fileURLToPath } from "url";

const argRoot = process.argv.indexOf("--root");
const root = argRoot > 0 ? path.resolve(process.argv[argRoot + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => { try { return fs.readFileSync(path.join(root, file), "utf8"); } catch { return ""; } };
const failures = [];
const check = (ok, what) => { if (!ok) failures.push(what); };
/** `before` must occur in the file, and the first `call` after it must come later than it. */
const gateBefore = (file, before, call, label) => {
  const s = read(file);
  const b = s.indexOf(before);
  const c = s.indexOf(call, b < 0 ? 0 : b);
  check(b >= 0, `${file}: gate missing — ${label}`);
  check(b >= 0 && c > b, `${file}: ${label} — the call is not after its gate`);
};

// A. The helper and its vectors.
const helperPath = path.join(root, "lib/studioflow/notificationAccess.ts");
if (!fs.existsSync(helperPath)) failures.push("lib/studioflow/notificationAccess.ts is absent");
else {
  const h = await import(pathToFileURL(helperPath).href);
  const vis = h.notificationVisibleForAccess;
  const allOn = { messages: true, teamChat: true, inventory: true, customers: true, bankFeed: true, financialInfo: true };
  const off = (key) => ({ ...allOn, [key]: false });
  const rows = {
    messages: [{ route: "customerInbox", type: "customer_message" }, { type: "customer_message" }, { route: "orders", type: "x", channel: "instagram" }, { source: "WhatsApp" }],
    teamChat: [{ route: "messageThread", type: "message" }, { type: "message_mention" }],
    inventory: [{ route: "inventory", type: "inventory_low_stock" }, { type: "stocktake_completed" }, { type: "purchase_received" }, { type: "supplier_added" }],
    customers: [{ route: "customers", type: "customer_added" }, { type: "customer_merged" }],
    bankFeed: [{ route: "bank", type: "bank_receipt_matched" }, { type: "bank_connection_expired" }],
    financialInfo: [{ route: "dashboard", type: "x" }, { type: "woocommerce_payment" }, { type: "invoice_paid" }, { type: "settlement_matched" }],
  };
  const unknown = [{ route: "orders", type: "inbound_order" }, { route: "production", type: "production_stage_changed" }, { route: "notes", type: "shared_note" }, { route: "supportTicket", type: "support_ticket_reply" }, { route: "orderDeletionRequest", type: "order_deletion_request" }, { route: "", type: "" }];
  for (const [key, list] of Object.entries(rows)) {
    for (const row of list) {
      check(h.notificationAccessKeyFor(row) === key, `helper: ${JSON.stringify(row)} maps to ${h.notificationAccessKeyFor(row)}, expected ${key}`);
      check(vis(row, off(key)) === false, `helper: ${key}=false still shows ${JSON.stringify(row)}`);
      check(vis(row, allOn) === true, `helper: owner (all on) cannot see ${JSON.stringify(row)}`);
      for (const other of Object.keys(rows)) if (other !== key) check(vis(row, off(other)) === true, `helper: ${other}=false wrongly hides a ${key} row ${JSON.stringify(row)}`);
    }
  }
  const allOff = Object.fromEntries(Object.keys(allOn).map((k) => [k, false]));
  for (const row of unknown) {
    check(h.notificationAccessKeyFor(row) === null, `helper: unknown row ${JSON.stringify(row)} got a key`);
    check(vis(row, allOff) === true, `helper: unknown row ${JSON.stringify(row)} hidden with every key off`);
  }
  check(vis({ route: "customerInbox" }, undefined) === true && vis({ route: "customerInbox" }, null) === true, "helper: no access map must mean visible");
}
check(read("lib/studioflow/notifications.ts").includes("notificationVisibleForAccess,") && read("lib/studioflow/notifications.ts").includes('from "@/lib/studioflow/notificationAccess"'), "notifications.ts does not re-export the helper");

// A. Every reader.
const home = read("lib/studioflow/useHomeData.ts");
check(home.includes("notificationVisibleForAccess(item, workspace.memberAccess)"), "useHomeData: recent activity is not filtered by the helper");
const shell = read("components/AppShell.tsx");
check(shell.includes("mod.notificationVisibleForAccess(item, workspace.memberAccess)"), "AppShell: the activity listener is not filtered by the helper");
check(shell.includes("if (!notificationVisibleForAccess(n, workspace?.memberAccess)) return false;"), "AppShell: the unread badge does not apply the helper");
const drawer = read("components/NotificationsDrawer.tsx");
check(drawer.includes("notificationVisibleForAccess(n, workspace?.memberAccess)\n      && !dismissedLocally.has(n.id)"), "NotificationsDrawer: the list does not apply the helper");
check(drawer.includes("if (!notificationVisibleForAccess(n, workspace?.memberAccess)) return;\n    void handleMarkRead(n.id);"), "NotificationsDrawer: opening a row is not guarded by the helper");

// B. Background calls behind their key.
gateBefore("lib/studioflow/useHomeData.ts", 'if (!workspaceAccessAllows(workspace.memberAccess, "inventory")) {\n        setDomain("inventory", "denied");', "await getInventorySummary(workspace)", "getInventorySummary behind the inventory key");
gateBefore("app/orders/OrderDetailContent.tsx", 'workspaceAccessAllows(workspace.memberAccess, "inventory") ? (', "<OrderStockBlock", "OrderStockBlock mounted only with the inventory key");
check(read("app/orders/OrderDetailContent.tsx").includes('t("Inventory is not part of your access in this workspace.")'), "OrderDetailContent: no plain note in place of the stock block");
gateBefore("app/orders/OrderStockBlock.tsx", 'if (!workspaceAccessAllows(workspace.memberAccess, "inventory")) {', "await getOrderInventory(workspace, orderId)", "getOrderInventory behind the inventory key");
gateBefore("app/orders/page.tsx", 'if (!workspaceAccessAllows(workspace.memberAccess, "orders") || !canCreateOrders(workspace)) return;', "void listHeldIntegrationOrders(workspace)", "listHeldIntegrationOrders only for a member who can create orders");
gateBefore("components/AppShell.tsx", '!workspaceAccessAllows(workspace.memberAccess, "orders") || workspace.role === "workflow"', "await fetchSalesCapability(companyId)", "getSalesCapability behind the orders key / workflow role");
gateBefore("app/orders/OrderDetailContent.tsx", 'const showsPortalSmsRow = canShowOrderCard("customerPortal");', "getWorkspaceSmsSettings(workspace)", "getWorkspaceSmsSettings only when the customer-portal card shows");
check(read("app/orders/OrderDetailContent.tsx").includes("if (!showsPortalSmsRow) return;\n    let cancelled = false;\n    getWorkspaceSmsSettings(workspace)"), "OrderDetailContent: the SMS settings effect does not return before the call");
gateBefore("components/MessagesTabs.tsx", "if (!allowed.customers) return;", "loadCustomerInboxConversations(companyId)", "listCustomerInboxConversations (tabs count) behind the messages key");
gateBefore("app/inbox/page.tsx", 'if (!workspaceAccessAllows(context.memberAccess, "messages")) {\n          router.replace(', "<InboxContent", "/inbox redirects before the inbox content (and its list call) mounts");

// Note text in all 11 languages.
const LANGUAGES = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const dictionary = read("lib/studioflow/language.ts");
const key = "Inventory is not part of your access in this workspace.";
const at = dictionary.indexOf(`${JSON.stringify(key)}: {`);
if (at < 0) failures.push(`"${key}" — no dictionary entry`);
else {
  const line = dictionary.slice(at, dictionary.indexOf("\n", at));
  const absent = LANGUAGES.filter((language) => !line.includes(`${JSON.stringify(language)}:`));
  check(absent.length === 0, `"${key}" missing: ${absent.join(", ")}`);
}

if (failures.length) {
  console.error(`check-key-gated-activity: ${failures.length} failure(s)`);
  for (const f of failures) console.error(" - " + f);
  process.exit(1);
}
console.log("check-key-gated-activity: ok");
