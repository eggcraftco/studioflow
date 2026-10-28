// Delivery push → the order's Shipping card (28 Oct 2026; owner's 22 Oct request). A "Delivered" notification
// in Safari opened the bare Orders list: the order had to be found by hand.
//
//   1. The service worker, run in a sandbox with the payload the live server sends (functions/index.js
//      writeDeliveryNotification → sendPushNotificationToCompany: type "delivery", orderId, …):
//      - opens /orders?orderId=<id>&focus=shipping, for our copy AND for the copy the Firebase SDK draws
//        (data under FCM_MSG), whose click the SDK used to swallow (its listener ran first, had no link);
//      - its click listener is registered before firebase.messaging() and stops the SDK's;
//      - an open Orders tab is brought forward FIRST, then moved; when navigate() refuses (Safari, WebKit
//        263687) the tab is asked to move itself (postMessage "nivadesk-open");
//      - a tab on another page is left alone (a new window opens, as before); other pushes unchanged.
//   2. lib/studioflow/notificationSettings.ts, run for real: the bell row of a delivery opens the same link;
//      orderCardForFocus("shipping") is the Shipping card; an unknown focus is still dropped.
//   3. Wiring: a push drawn while the page is open goes through the service worker (same click path); AppShell
//      moves on "nivadesk-open" with the router, same-site paths only; the Orders page clears a search/filter
//      that would hide the linked order and re-focuses an order that is already open; the Shipping card frame
//      carries the selector the focus effect looks for.
//
//   node scripts/check-delivery-push-link.mjs        (CONTROL=1 runs it against the live web's files: red)
import fs from "fs";
import os from "os";
import path from "path";
import vm from "vm";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const root = process.env.CHECK_ROOT
  ? path.resolve(process.env.CHECK_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const failures = [];
let checks = 0;
const check = (label, ok) => { checks += 1; if (!ok) failures.push(label); };

// 1. The service worker, run.
const swSource = read("public/firebase-messaging-sw.js");
async function click(data, { tabs = [], navigateFails = false } = {}) {
  const order = [];
  const listeners = {};
  const steps = [];
  let stopped = false;
  const sandbox = {
    URLSearchParams,
    importScripts: () => {},
    firebase: {
      initializeApp: () => {},
      messaging: () => { order.push("messaging"); return { onBackgroundMessage: () => {} }; }
    },
    self: {
      location: { search: "" },
      registration: { showNotification: () => {} },
      addEventListener: (type, fn) => { if (type === "notificationclick") order.push("click"); listeners[type] = fn; },
      clients: {
        matchAll: async () => tabs.map((tab) => typeof tab === "string" ? { url: tab, visibilityState: "hidden" } : tab).map(({ url, visibilityState }) => ({
          url,
          visibilityState,
          focus: async () => { steps.push(["focus", url]); return null; },
          navigate: async (to) => {
            steps.push(["navigate", to]);
            if (navigateFails) throw new TypeError("navigate failed");
            return null;
          },
          postMessage: (message) => { steps.push(["postMessage", message]); }
        })),
        openWindow: async (url) => { steps.push(["openWindow", url]); return null; }
      }
    }
  };
  vm.runInNewContext(swSource, sandbox);
  let waited = Promise.resolve();
  listeners.notificationclick({
    notification: { close: () => {}, data },
    stopImmediatePropagation: () => { stopped = true; },
    waitUntil: (p) => { waited = p; }
  });
  await waited.catch((error) => steps.push(["rejected", String(error)]));
  return { order, steps, stopped };
}

// What sendPushNotificationToCompany puts in `data` for a delivery (toPushStringMap: all strings).
const deliveryData = {
  companyId: "wsA", orderId: "ord_42", type: "delivery", notificationId: "delivery_ord_42",
  trackingNumber: "JD0002", carrier: "Royal Mail", priority: "", dueAt: "", senderPhotoURL: "",
  imageUrl: "", richImageURL: "", previewImageURL: ""
};
const LINK = "/orders?orderId=ord_42&focus=shipping";

let r = await click(deliveryData);
check(`SW: a delivery push opens ${LINK} (got ${JSON.stringify(r.steps)})`, r.steps.length === 1 && r.steps[0][0] === "openWindow" && r.steps[0][1] === LINK);
check("SW: the click listener is registered before firebase.messaging()", r.order.indexOf("click") > -1 && r.order.indexOf("click") < r.order.indexOf("messaging"));
check("SW: the SDK's own click listener is stopped", r.stopped === true);

r = await click({ FCM_MSG: { data: deliveryData, notification: { title: "Delivered · Jane" } } });
check(`SW: the copy the Firebase SDK draws (FCM_MSG) opens the same link (got ${JSON.stringify(r.steps)})`, r.steps[0]?.[0] === "openWindow" && r.steps[0]?.[1] === LINK);

r = await click(deliveryData, { tabs: ["https://nivadesk.app/orders?orderId=other"] });
check(`SW: an open Orders tab is brought forward, then moved to the Shipping card (got ${JSON.stringify(r.steps)})`,
  JSON.stringify(r.steps) === JSON.stringify([["focus", "https://nivadesk.app/orders?orderId=other"], ["navigate", LINK]]));

r = await click(deliveryData, { tabs: ["https://nivadesk.app/orders"], navigateFails: true });
check(`SW: when navigate() refuses (Safari), the tab is asked to move itself (got ${JSON.stringify(r.steps)})`,
  r.steps.some(([kind, message]) => kind === "postMessage" && message?.type === "nivadesk-open" && message?.url === LINK)
  && !r.steps.some(([kind]) => kind === "rejected"));

r = await click(deliveryData, { tabs: ["https://nivadesk.app/notes"] });
check(`SW: a tab on another page is left alone; a window opens on the link (got ${JSON.stringify(r.steps)})`,
  JSON.stringify(r.steps) === JSON.stringify([["openWindow", LINK]]));

r = await click({ ...deliveryData, drawnByPage: "1" }, { tabs: ["https://nivadesk.app/notes", { url: "https://nivadesk.app/dashboard", visibilityState: "visible" }] });
check(`SW: a notification the open page drew moves THAT page (no new tab) (got ${JSON.stringify(r.steps)})`,
  JSON.stringify(r.steps) === JSON.stringify([["focus", "https://nivadesk.app/dashboard"], ["postMessage", { type: "nivadesk-open", url: LINK }]]));
r = await click({ ...deliveryData, drawnByPage: "1" }, { tabs: ["https://nivadesk.app/notes"] });
check(`SW: …and with no visible page it opens a window as usual (got ${JSON.stringify(r.steps)})`, JSON.stringify(r.steps) === JSON.stringify([["openWindow", LINK]]));
r = await click({ companyId: "wsA", orderId: "ord_7", type: "update" });
check(`SW: another order push opens the order without a card (got ${JSON.stringify(r.steps)})`, r.steps[0]?.[1] === "/orders?orderId=ord_7");
r = await click({ orderId: "ord_8", type: "delivery", focus: "javascript:x" });
check(`SW: an unknown focus is dropped (got ${JSON.stringify(r.steps)})`, r.steps[0]?.[1] === "/orders?orderId=ord_8");
r = await click({ route: "customerInbox", conversationId: "c1", companyId: "wsA" }, { tabs: ["https://nivadesk.app/inbox"] });
check(`SW: a customer push still moves the open inbox (GN-07) (got ${JSON.stringify(r.steps)})`, r.steps.some(([kind, to]) => kind === "navigate" && to === "/inbox?conversation=c1&workspace=wsA"));
r = await click({ threadId: "t1" }, { tabs: ["https://nivadesk.app/messages"] });
check(`SW: a team push on an open Messages tab only focuses it (got ${JSON.stringify(r.steps)})`, JSON.stringify(r.steps) === JSON.stringify([["focus", "https://nivadesk.app/messages"]]));

// 2. The module, run (Firebase stubbed).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-link-"));
fs.writeFileSync(path.join(tmp, "firebase-functions.mjs"), "export function httpsCallable() { return async () => ({ data: {} }); }\n");
fs.writeFileSync(path.join(tmp, "firebase-client.mjs"), "export const functions = {};\n");
let m = {};
const moduleRel = "lib/studioflow/notificationSettings.ts";
check(`${moduleRel} exists (GN-08 web)`, fs.existsSync(path.join(root, moduleRel)));
if (fs.existsSync(path.join(root, moduleRel))) {
  const moduleSource = ts.transpileModule(read(moduleRel), { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText
    .replace(/from "firebase\/functions"/g, 'from "./firebase-functions.mjs"')
    .replace(/from "@\/lib\/firebase\/client"/g, 'from "./firebase-client.mjs"');
  fs.writeFileSync(path.join(tmp, "notificationSettings.mjs"), moduleSource);
  m = await import(pathToFileURL(path.join(tmp, "notificationSettings.mjs")).href);
}
check("module: the bell row of a delivery opens the Shipping card", typeof m.orderNotificationHref === "function" && m.orderNotificationHref({ orderId: "ord_42", type: "delivery" }) === LINK);
check("module: a delivery row's own focus wins (files)", m.orderNotificationHref?.({ orderId: "o1", type: "delivery", focus: "files" }) === "/orders?orderId=o1&focus=files");
check("module: GN-08 work time link unchanged", m.orderNotificationHref?.({ orderId: "o1", focus: "workTime", workSessionId: "s1" }) === "/orders?orderId=o1&focus=workTime&workSessionId=s1");
check("module: an unknown focus is dropped", m.orderNotificationHref?.({ orderId: "o1", focus: "x" }) === "/orders?orderId=o1");
check("module: orderCardForFocus(\"shipping\") is the Shipping card", m.orderCardForFocus?.("shipping") === "shipping");
check("module: the re-focus event is exported", typeof m.ORDER_CARD_FOCUS_EVENT === "string" && m.ORDER_CARD_FOCUS_EVENT.length > 0);

// 3. Wiring.
const push = read("lib/studioflow/pushNotifications.ts");
check("pushNotifications.ts: a push drawn while the page is open goes through the service worker with its data, marked drawnByPage",
  /swRegistration\s*\n?\s*\.showNotification\(title, \{[\s\S]{0,300}data: \{ \.\.\.data, drawnByPage: "1" \}/.test(push));
check("pushNotifications.ts: no bare foreground `new Notification` without a click route",
  !/new Notification\(title, \{ body, icon: "\/icon\.png" \}\);\s*\n\s*\}/.test(push) && /shown\.onclick = \(\) => \{[\s\S]{0,120}openInApp\(orderNotificationHref\(data\)\)/.test(push));
let openInApp = "";
try { openInApp = read("lib/studioflow/openInApp.ts"); } catch { /* missing on the control */ }
check("openInApp.ts: the request name matches the service worker's message", /OPEN_IN_APP_EVENT = "nivadesk-open"/.test(openInApp) && /type: "nivadesk-open"/.test(swSource));
check("openInApp.ts: only a same-site path is taken", /value\.startsWith\("\/"\) && !value\.startsWith\("\/\/"\)/.test(openInApp));
const shell = read("components/AppShell.tsx");
check("AppShell.tsx: moves on the worker's message and the window request with the router",
  /event\.data\?\.type === OPEN_IN_APP_EVENT\) go\(event\.data\.url\)/.test(shell)
  && /navigator\.serviceWorker[\s\S]{0,200}addEventListener\("message", onWorkerMessage\)/.test(shell)
  && /window\.addEventListener\(OPEN_IN_APP_EVENT, onWindowRequest\)/.test(shell)
  && /const link = inAppLink\(url\);\s*\n\s*if \(link\) router\.push\(link\);/.test(shell));
check("AppShell.tsx: imports the listener without pulling in firebase/messaging", /from "@\/lib\/studioflow\/openInApp"/.test(shell) && !/^import .*pushNotifications/m.test(shell));
const page = read("app/orders/page.tsx");
check("orders/page.tsx: a link naming one order clears a search/filter/source that would hide it",
  /if \(linkedOrderId && !customerName && !source\) \{\s*\n\s*setOrderSearch\(""\);\s*\n\s*setOrderFilter\("all"\);\s*\n\s*setOrderSource\("all"\);/.test(page));
check("orders/page.tsx: an order that is already open is asked to focus the card again",
  /if \(linkedOrderId && searchParams\.get\("focus"\)\) window\.dispatchEvent\(new Event\(ORDER_CARD_FOCUS_EVENT\)\);/.test(page));
const detail = read("app/orders/OrderDetailContent.tsx");
check("OrderDetailContent.tsx: the focus effect listens for the re-focus event and cleans up",
  /window\.addEventListener\(ORDER_CARD_FOCUS_EVENT, focusLinkedCard\)/.test(detail) && /window\.removeEventListener\(ORDER_CARD_FOCUS_EVENT, focusLinkedCard\)/.test(detail));
check("OrderDetailContent.tsx: the effect finds a card frame by data-first-project-guide-card (the Shipping card has one)",
  /document\.querySelector<HTMLElement>\(`\[data-first-project-guide-card="\$\{cardId\}"\]`\)/.test(detail)
  && (detail.match(/data-first-project-guide-card=\{cardId\}/g) || []).length >= 2
  && /case "shipping":\s*\n\s*return \(/.test(detail));
const css = read("app/globals.css");
check("globals.css: the focused card is marked", /\.is-notification-focus \{[^}]*outline/.test(css));
const pkg = JSON.parse(read("package.json"));
check("package.json: npm run test:delivery-push-link", pkg.scripts?.["test:delivery-push-link"] === "node scripts/check-delivery-push-link.mjs");

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) {
  console.error(`delivery-push-link: ${checks - failures.length}/${checks} passed, ${failures.length} FAILED`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`delivery-push-link: ${checks}/${checks} passed`);
