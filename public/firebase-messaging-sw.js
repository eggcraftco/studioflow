// Firebase Cloud Messaging service worker for web push.
// This file must be served at the site root (/firebase-messaging-sw.js).
// Replace the firebaseConfig placeholders with your project's web config.

importScripts("https://www.gstatic.com/firebasejs/11.0.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.0.0/firebase-messaging-compat.js");

// IMPORTANT: This file cannot read process.env. The firebaseConfig must be
// hardcoded here OR injected at build time. The values below match
// lib/firebase/client.ts — copy your real values from .env.local.
self.firebaseConfig = self.firebaseConfig || {
  apiKey: "REPLACE_API_KEY",
  authDomain: "REPLACE_AUTH_DOMAIN",
  projectId: "REPLACE_PROJECT_ID",
  storageBucket: "REPLACE_STORAGE_BUCKET",
  messagingSenderId: "REPLACE_MESSAGING_SENDER_ID",
  appId: "REPLACE_APP_ID",
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
    tag: data.threadId || data.messageId || undefined,
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  let targetUrl = "/messages";
  if (data.threadId) targetUrl = "/messages";
  else if (data.ticketId) targetUrl = "/settings?section=support";
  else if (data.orderId) targetUrl = "/orders";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    }),
  );
});
