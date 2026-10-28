// Firebase Cloud Messaging service worker for web push.
// This file must be served at the site root (/firebase-messaging-sw.js).

importScripts("https://www.gstatic.com/firebasejs/11.0.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.0.0/firebase-messaging-compat.js");

// A service worker cannot read process.env, so the page passes the same config
// it already holds as query parameters when it registers this file (see
// lib/studioflow/pushNotifications.ts). One source of truth, nothing to keep in
// step by hand — an earlier copy of this file shipped REPLACE_* placeholders
// for months and silently broke background push.
const swParams = new URLSearchParams(self.location.search);
self.firebaseConfig = {
  apiKey: swParams.get("apiKey") || "",
  authDomain: swParams.get("authDomain") || "",
  projectId: swParams.get("projectId") || "",
  storageBucket: swParams.get("storageBucket") || "",
  messagingSenderId: swParams.get("messagingSenderId") || "",
  appId: swParams.get("appId") || "",
};

// Registered BEFORE firebase.messaging() on purpose. A push that carries a
// notification block is drawn by the Firebase SDK itself, which keeps our data
// under FCM_MSG and adds its own click listener: listening after it, a click on
// that copy was swallowed (stopImmediatePropagation, no link, nothing opened).
// Running first, every copy — the SDK's, ours below, and the one the page draws
// while it is open (pushNotifications.ts) — takes this one route.
self.addEventListener("notificationclick", (event) => {
  event.stopImmediatePropagation();
  event.notification.close();
  const shown = event.notification.data || {};
  const data = (shown.FCM_MSG && shown.FCM_MSG.data) || shown;
  let targetUrl = "/messages";
  if (data.route === "customerInbox") {
    // A customer wrote: the customer inbox, on that conversation — and the
    // workspace the server named (GN-07), so a push for another workspace says
    // so instead of opening "That conversation no longer exists."
    targetUrl = data.conversationId
      ? "/inbox?conversation=" + encodeURIComponent(data.conversationId) + (data.companyId ? "&workspace=" + encodeURIComponent(data.companyId) : "")
      : "/inbox";
  } else if (data.route === "notes" || data.inviteId || data.noteId) {
    // A note invitation or share: Notes lists the waiting invitations first.
    targetUrl = "/notes";
  } else if (data.threadId) targetUrl = "/messages";
  else if (data.ticketId) targetUrl = "/settings?section=support";
  else if (data.orderId) {
    // The order itself, and the card the notice is about: (GN-08) Files / Work
    // Time; a parcel delivered opens on the Shipping card.
    const params = new URLSearchParams({ orderId: data.orderId });
    const focus = data.focus || (data.type === "delivery" ? "shipping" : "");
    if (focus === "files" || focus === "workTime" || focus === "shipping") params.set("focus", focus);
    ["fileId", "workSessionId", "workDayId"].forEach((key) => { if (data[key]) params.set(key, data[key]); });
    targetUrl = "/orders?" + params.toString();
  }
  const targetPath = targetUrl.split("?")[0];
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Drawn by an open page (pushNotifications.ts): that page, whatever it is
      // showing, moves to the link itself — like a row in the bell.
      const page = shown.drawnByPage === "1"
        ? clientList.find((client) => client.visibilityState === "visible" && "postMessage" in client)
        : null;
      if (page) {
        return Promise.resolve(page.focus ? page.focus().catch(() => null) : null).then(() => {
          page.postMessage({ type: "nivadesk-open", url: targetUrl });
          return page;
        });
      }
      for (const client of clientList) {
        if (!client.url.includes(targetPath) || !("focus" in client)) continue;
        if (targetUrl === targetPath) return client.focus();
        // Already on the page: bring it forward while the click still counts
        // (Safari allows focus() only then), then move it to the link. Safari's
        // navigate() can refuse ("navigate failed", WebKit 263687); the page
        // then moves itself — AppShell listens for "nivadesk-open".
        return client.focus().catch(() => null).then((front) => {
          const tab = front || client;
          const askPage = () => {
            if ("postMessage" in tab) tab.postMessage({ type: "nivadesk-open", url: targetUrl });
            return tab;
          };
          if (!("navigate" in tab)) return askPage();
          return tab.navigate(targetUrl).then((moved) => moved || tab, askPage);
        });
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    }),
  );
});

firebase.initializeApp(self.firebaseConfig);
const messaging = firebase.messaging();

// Background push handler — when the tab is closed/in background.
messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) ||
    (payload.data && payload.data.title) || "New message";
  const body = (payload.notification && payload.notification.body) ||
    (payload.data && payload.data.body) || "";
  const data = payload.data || {};
  self.registration.showNotification(title, {
    body,
    icon: "/icon.png",
    badge: "/icon.png",
    data,
    // One tray entry per customer conversation, per team thread.
    tag: data.conversationId || data.threadId || data.messageId || undefined,
  });
});
