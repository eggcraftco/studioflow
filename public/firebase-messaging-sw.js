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

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  let targetUrl = "/messages";
  if (data.route === "customerInbox") {
    // A customer wrote: the customer inbox, on that conversation.
    targetUrl = data.conversationId ? "/inbox?conversation=" + encodeURIComponent(data.conversationId) : "/inbox";
  } else if (data.threadId) targetUrl = "/messages";
  else if (data.ticketId) targetUrl = "/settings?section=support";
  else if (data.orderId) targetUrl = "/orders";
  const targetPath = targetUrl.split("?")[0];
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (!client.url.includes(targetPath) || !("focus" in client)) continue;
        // Already on the page: move it to the conversation, then bring it forward.
        if (targetUrl !== targetPath && "navigate" in client) {
          return client.navigate(targetUrl).then((moved) => (moved || client).focus());
        }
        return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    }),
  );
});
