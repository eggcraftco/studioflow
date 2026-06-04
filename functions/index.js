const admin = require("firebase-admin");
const crypto = require("crypto");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");

admin.initializeApp();

const TRACK17_TOKEN = defineSecret("TRACK17_TOKEN");
const ROYALMAIL_CLIENT_ID = defineSecret("ROYALMAIL_CLIENT_ID");
const ROYALMAIL_CLIENT_SECRET = defineSecret("ROYALMAIL_CLIENT_SECRET");
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
const APPLE_ROOT_CA_CERTS_PEM = defineSecret("APPLE_ROOT_CA_CERTS_PEM");
const GOOGLE_PLAY_SERVICE_ACCOUNT = defineSecret("GOOGLE_PLAY_SERVICE_ACCOUNT");

const TRACK17_BASE_URL = "https://api.17track.net/track/v2.2";
const TRACK17_REGISTER_URL = `${TRACK17_BASE_URL}/register`;
const TRACK17_GET_INFO_URL = `${TRACK17_BASE_URL}/gettrackinfo`;
const TRACK17_PUSH_URL = `${TRACK17_BASE_URL}/push`;
const TRACK17_REALTIME_URL = `${TRACK17_BASE_URL}/getRealTimeTrackInfo`;
const TRACK17_CHANGE_CARRIER_URL = `${TRACK17_BASE_URL}/changecarrier`;
const ROYALMAIL_BASE_URL = "https://api.royalmail.net/mailpieces/v2";

const CARRIER_NAME_TO_CODE = {
  "royal mail": 11031,
  "royalmail": 11031,
  "dhl": 100001,
  "dhl express": 100001,
  "ups": 100002,
  "fedex": 100003,
  "fedex express": 100003,
  "parcelforce": 11033,
  "parcel force": 11033
};

const CARRIER_CODE_TO_NAME = {
  11031: "Royal Mail",
  11033: "Parcelforce",
  100001: "DHL",
  100002: "UPS",
  100003: "FedEx"
};

const REALTIME_UNSUPPORTED_CODES = new Set([11031, 7047, 100766, 1151, 21051, 101066]);

const SUPPORT_MESSAGE = {
  checking_support: {
    "Türkçe": "Bu takip numarası için 17TRACK desteği kontrol ediliyor.",
    English: "Checking 17TRACK support for this tracking number."
  },
  carrier_required_message: {
    "Türkçe": "17TRACK kuryeyi otomatik algılayamadı. Lütfen DHL, FedEx, Royal Mail veya UPS gibi doğru kuryeyi manuel seçip tekrar yenileyin.",
    English: "17TRACK could not auto-detect the carrier. Please choose the Courier manually, for example Royal Mail, DHL, FedEx or UPS, then press Refresh Live Status again."
  },
  registered_waiting: {
    "Türkçe": "Kayıt yapıldı, 17TRACK güncellemesi bekleniyor.",
    English: "Registered - waiting for 17TRACK update"
  },
  royal_mail_limited: {
    "Türkçe": "Royal Mail için 17TRACK API desteği şu an sınırlı görünüyor. Sistem daha sonra otomatik tekrar deneyecek; gerekirse Royal Mail sitesinden de kontrol edin.",
    English: "Royal Mail tracking support is currently limited through 17TRACK. The system will try again automatically; you can also check the Royal Mail website."
  },
  royal_mail_credentials_missing: {
    "Türkçe": "Royal Mail resmi API bilgileri henüz Firebase secrets içine eklenmedi. ROYALMAIL_CLIENT_ID ve ROYALMAIL_CLIENT_SECRET eklenince Royal Mail doğrudan kendi sistemiyle kontrol edilecek.",
    English: "Royal Mail official API credentials are not configured yet. Add ROYALMAIL_CLIENT_ID and ROYALMAIL_CLIENT_SECRET to Firebase secrets to check Royal Mail directly."
  },
  royal_mail_waiting: {
    "Türkçe": "Royal Mail resmi API sorgulandı, ancak bu takip numarası için henüz güncel hareket bulunamadı. Sistem daha sonra tekrar deneyecek.",
    English: "Royal Mail official API was checked, but no current tracking event was returned yet. The system will try again later."
  },
  royal_mail_error: {
    "Türkçe": "Royal Mail resmi API şu anda bu takip numarasını okuyamadı. Sistem 17TRACK fallback ile denemeye devam edecek.",
    English: "Royal Mail official API could not read this tracking number right now. The system will continue with the 17TRACK fallback."
  },
  fedex_limited: {
    "Türkçe": "FedEx bazı takip numaralarında ek gönderim bilgisi isteyebilir. Sistem otomatik tekrar deneyecek; sonuç gelmezse FedEx sitesiyle kontrol edin.",
    English: "FedEx may require extra shipment details for some tracking numbers. The system will try again automatically; if no result appears, check FedEx directly."
  },
  courier_not_mapped: {
    "Türkçe": "Bu kurye henüz 17TRACK kodlarıyla eşleştirilmedi. Auto Detect kullanın veya index.js içine kurye kodunu ekleyin.",
    English: "This courier is not mapped to a 17TRACK carrier code yet. Use Auto Detect or add this carrier code in index.js."
  },
  token_missing: {
    "Türkçe": "TRACK17_TOKEN boş veya çok kısa. Firebase secrets içine gerçek 17TRACK API key'i kaydedip yeniden deploy edin.",
    English: "TRACK17_TOKEN is empty or too short. Please set the real 17TRACK API key in Firebase secrets and redeploy."
  },
  missing_parameters: {
    "Türkçe": "companyId, orderId veya trackingNumber eksik. Lütfen siparişi kaydedip takip numarası girin.",
    English: "Missing companyId, orderId or trackingNumber. Please save the order and enter a tracking number."
  }
};

function localizedMessage(key, language = "English") {
  return SUPPORT_MESSAGE[key]?.[language] || SUPPORT_MESSAGE[key]?.English || key;
}

function cleanTrackingNumber(value) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function isAutoDetectCourier(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "" || normalized === "auto detect" || normalized === "autodetect" || normalized === "auto";
}

function carrierCodeFromName(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return CARRIER_NAME_TO_CODE[normalized] || null;
}

function carrierNameFromCode(value) {
  const code = Number(value);
  if (!Number.isFinite(code) || code <= 0) return "";
  return CARRIER_CODE_TO_NAME[code] || `Carrier #${code}`;
}

function isRoyalMailCourier(value, carrierCode = null) {
  const normalized = String(value || "").trim().toLowerCase().replace(/\s+/g, "");
  return Number(carrierCode) === 11031 || normalized === "royalmail" || normalized === "royalmailgroup";
}

function secretLooksConfigured(value) {
  const normalized = String(value || "").trim();
  if (normalized.length < 8) return false;
  return !["not_set", "not-set", "placeholder", "todo", "none", "missing"].includes(normalized.toLowerCase());
}

function providerDocRef(companyId, orderId) {
  return admin.firestore()
    .collection("companies")
    .doc(companyId)
    .collection("trackingResults")
    .doc(orderId);
}

function orderDocRef(orderId) {
  return admin.firestore().collection("siparisler").doc(orderId);
}

function lookupDocRef(trackingNumber) {
  return admin.firestore().collection("trackingLookup").doc(cleanTrackingNumber(trackingNumber));
}

function notificationCollectionRef(companyId) {
  return admin.firestore().collection("companies").doc(companyId).collection("notifications");
}

function deviceTokenCollectionRef(companyId) {
  return admin.firestore().collection("companies").doc(companyId).collection("deviceTokens");
}

const PUSH_TEXT = {
  deliveryTitle: {
    "Türkçe": "Teslimat tamamlandı",
    English: "Delivery completed",
    Deutsch: "Lieferung abgeschlossen",
    Français: "Livraison terminée",
    Italiano: "Consegna completata",
    "Español (Spanish)": "Entrega completada",
    Português: "Entrega concluída",
    "Русский (Russian)": "Доставка завершена",
    "日本語 (Japanese)": "配達が完了しました",
    "中文 (Chinese)": "配送已完成",
    "العربية (Arabic)": "تم التسليم",
    "हिन्दी (Hindi)": "डिलीवरी पूरी हुई"
  },
  reminderTitle: {
    "Türkçe": "Hatırlatıcı zamanı geldi",
    English: "Reminder due",
    Deutsch: "Erinnerung fällig",
    Français: "Rappel à effectuer",
    Italiano: "Promemoria in scadenza",
    "Español (Spanish)": "Recordatorio pendiente",
    Português: "Lembrete vencido",
    "Русский (Russian)": "Напоминание наступило",
    "日本語 (Japanese)": "リマインダーの時間です",
    "中文 (Chinese)": "提醒时间到了",
    "العربية (Arabic)": "حان وقت التذكير",
    "हिन्दी (Hindi)": "रिमाइंडर का समय हो गया"
  }
};

function pushText(key, language = "English") {
  return PUSH_TEXT[key]?.[language] || PUSH_TEXT[key]?.English || key;
}

function deliveryPushTitle(language = "English") {
  return pushText("deliveryTitle", language);
}

function deliveryPushMessage(result, language = "English") {
  const carrier = result?.carrier || (language === "Türkçe" ? "Kargo firması" : "Carrier");
  const number = result?.trackingNumber || "";
  const checkpoint = result?.checkpoint || result?.location || "";
  if (language === "Türkçe") {
    return (carrier + " " + number + " takip numarasını teslim etti." + (checkpoint ? " " + checkpoint : "")).trim();
  }
  return (carrier + " delivered tracking number " + number + "." + (checkpoint ? " " + checkpoint : "")).trim();
}

function toPushStringMap(data = {}) {
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    if (value instanceof Date) {
      out[key] = value.toISOString();
    } else if (typeof value === "object") {
      out[key] = JSON.stringify(value);
    } else {
      out[key] = String(value);
    }
  }
  return out;
}

function isInvalidFcmTokenError(code = "") {
  return [
    "messaging/invalid-registration-token",
    "messaging/registration-token-not-registered"
  ].includes(code);
}

async function sendPushNotificationToCompany(companyId, notification = {}) {
  if (!companyId) {
    return { sent: 0, failed: 0, reason: "missing_company" };
  }

  const tokenSnap = await deviceTokenCollectionRef(companyId).limit(100).get();
  const tokenDocs = tokenSnap.docs.filter((doc) => doc.data()?.enabled !== false);
  const tokens = tokenDocs.map((doc) => doc.data()?.token || doc.id).filter(Boolean);

  if (tokens.length === 0) {
    return { sent: 0, failed: 0, reason: "no_device_tokens" };
  }

  const title = String(notification.title || "NivaDesk").slice(0, 120);
  const body = String(notification.message || notification.body || "You have a new update.").slice(0, 240);
  const richImageURL = cleanSupportPhotoURL(
    notification.richImageURL ||
    notification.richImageUrl ||
    notification.previewImageURL ||
    notification.previewImageUrl ||
    notification.imageUrl ||
    notification.imageURL ||
    notification.senderPhotoURL ||
    ""
  );
  const notificationPayload = richImageURL
    ? { title, body, imageUrl: richImageURL }
    : { title, body };
  const data = toPushStringMap({
    companyId,
    orderId: notification.orderId || "",
    type: notification.type || "update",
    notificationId: notification.notificationId || "",
    trackingNumber: notification.trackingNumber || "",
    carrier: notification.carrier || "",
    priority: notification.priority || "",
    dueAt: notification.dueAt || "",
    senderPhotoURL: notification.senderPhotoURL || "",
    imageUrl: richImageURL,
    richImageURL,
    previewImageURL: notification.previewImageURL || notification.previewImageUrl || ""
  });

  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: notificationPayload,
    data,
    android: richImageURL ? { notification: { imageUrl: richImageURL } } : undefined,
    apns: {
      headers: { "apns-priority": "10" },
      payload: { aps: { sound: "default", badge: 1, "mutable-content": 1 } },
      fcmOptions: richImageURL ? { imageUrl: richImageURL } : undefined
    },
    webpush: richImageURL ? { notification: { image: richImageURL } } : undefined
  });

  const cleanupBatch = admin.firestore().batch();
  response.responses.forEach((item, index) => {
    if (item.success) return;
    const code = item.error?.code || "";
    if (isInvalidFcmTokenError(code)) {
      cleanupBatch.set(tokenDocs[index].ref, {
        enabled: false,
        invalidAt: admin.firestore.FieldValue.serverTimestamp(),
        invalidReason: code
      }, { merge: true });
    }
  });

  try {
    await cleanupBatch.commit();
  } catch (error) {
    console.error("FCM token cleanup failed:", error?.message || error);
  }

  return { sent: response.successCount, failed: response.failureCount, tokenCount: tokens.length };
}

function supportUniqueStrings(values = []) {
  return Array.from(new Set(
    values
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  ));
}

function supportEmailQueueRef() {
  return admin.firestore().collection("supportEmailQueue");
}

function cleanSupportEmailSubject(value = "") {
  return cleanSupportText(value, 180) || "NivaDesk Support update";
}

function cleanSupportEmailBody(value = "") {
  return cleanSupportMultiline(value, 4000) || "You have a new Support / Tickets update in NivaDesk.";
}

async function queueSupportEmailNotification(email = {}, context = {}) {
  const toEmail = cleanSupportText(email.toEmail || email.to || "", 240).toLowerCase();
  if (!toEmail || !toEmail.includes("@")) {
    return { queued: false, reason: "missing_email" };
  }

  const payload = {
    toEmail,
    subject: cleanSupportEmailSubject(email.subject),
    body: cleanSupportEmailBody(email.body),
    companyId: String(context.companyId || ""),
    ticketId: String(context.ticketId || ""),
    ticketType: String(context.ticketType || ""),
    notificationType: String(context.notificationType || "support_ticket"),
    status: "pending",
    provider: "not_configured",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    source: "supportTicketNotification",
    supportSchemaVersion: 2
  };

  const docRef = supportEmailQueueRef().doc();
  await docRef.set(payload);
  return { queued: true, emailQueueId: docRef.id };
}

async function queueSupportEmailNotifications(emails = [], email = {}, context = {}) {
  const cleanEmails = supportUniqueStrings(emails).map((item) => item.toLowerCase());
  const results = [];
  for (const toEmail of cleanEmails) {
    try {
      results.push(await queueSupportEmailNotification({ ...email, toEmail }, context));
    } catch (error) {
      console.error("queueSupportEmailNotification failed:", toEmail, error?.message || error);
      results.push({ queued: false, toEmail, error: error?.message || String(error) });
    }
  }
  return results;
}

async function sendPushNotificationToRecipients(companyId, notification = {}, recipient = {}) {
  if (!companyId) {
    return { sent: 0, failed: 0, reason: "missing_company" };
  }

  const userIds = new Set(supportUniqueStrings(recipient.userIds || recipient.uids || []));
  const emails = new Set(supportUniqueStrings(recipient.emails || []).map((item) => item.toLowerCase()));

  if (userIds.size === 0 && emails.size === 0) {
    return { sent: 0, failed: 0, reason: "missing_recipients" };
  }

  const tokenSnap = await deviceTokenCollectionRef(companyId).limit(200).get();
  const tokenDocs = tokenSnap.docs.filter((doc) => {
    const data = doc.data() || {};
    if (data.enabled === false) return false;
    const tokenUserId = String(data.userId || data.uid || "").trim();
    const tokenEmail = String(data.email || "").trim().toLowerCase();
    return (tokenUserId && userIds.has(tokenUserId)) || (tokenEmail && emails.has(tokenEmail));
  });
  const tokens = tokenDocs.map((doc) => doc.data()?.token || doc.id).filter(Boolean);

  if (tokens.length === 0) {
    return { sent: 0, failed: 0, reason: "no_matching_device_tokens", recipientCount: userIds.size + emails.size };
  }

  const title = String(notification.title || "NivaDesk").slice(0, 120);
  const body = String(notification.message || notification.body || "You have a new update.").slice(0, 240);
  const senderPhotoURL = cleanSupportPhotoURL(notification.senderPhotoURL || notification.imageUrl || notification.imageURL || "");
  const richImageURL = cleanSupportPhotoURL(
    notification.richImageURL ||
    notification.richImageUrl ||
    notification.previewImageURL ||
    notification.previewImageUrl ||
    notification.attachmentImageURL ||
    notification.attachmentImageUrl ||
    notification.imageUrl ||
    notification.imageURL ||
    notification.senderPhotoURL ||
    ""
  );
  const notificationPayload = richImageURL
    ? { title, body, imageUrl: richImageURL }
    : { title, body };
  const data = toPushStringMap({
    companyId,
    orderId: notification.orderId || "",
    type: notification.type || "support_ticket",
    notificationId: notification.notificationId || "",
    ticketId: notification.ticketId || "",
    ticketType: notification.ticketType || "",
    ticketTitle: notification.ticketTitle || "",
    threadId: notification.threadId || "",
    messageId: notification.messageId || "",
    conversationType: notification.conversationType || "",
    route: notification.route || (notification.threadId ? "messageThread" : (notification.ticketId ? "supportTicket" : "")),
    senderName: notification.senderName || "",
    senderEmail: notification.senderEmail || "",
    senderUid: notification.senderUid || "",
    senderPhotoURL,
    imageUrl: richImageURL || senderPhotoURL,
    richImageURL,
    previewImageURL: notification.previewImageURL || notification.previewImageUrl || "",
    priority: notification.priority || "",
    status: notification.status || ""
  });

  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: notificationPayload,
    data,
    android: richImageURL ? { notification: { imageUrl: richImageURL } } : undefined,
    apns: {
      headers: { "apns-priority": "10" },
      payload: { aps: { sound: "default", badge: 1, "mutable-content": 1 } },
      fcmOptions: richImageURL ? { imageUrl: richImageURL } : undefined
    },
    webpush: richImageURL ? { notification: { image: richImageURL } } : undefined
  });

  const cleanupBatch = admin.firestore().batch();
  const failureDetails = [];
  response.responses.forEach((item, index) => {
    if (item.success) return;
    const code = item.error?.code || "";
    const message = item.error?.message || "";
    const tokenData = tokenDocs[index]?.data?.() || tokenDocs[index]?.data() || {};
    const token = String(tokenData.token || tokenDocs[index]?.id || "");
    failureDetails.push({
      index,
      code,
      message: String(message).slice(0, 500),
      tokenPreview: token ? `${token.slice(0, 8)}...${token.slice(-6)}` : "",
      userId: String(tokenData.userId || tokenData.uid || ""),
      email: String(tokenData.email || "")
    });
    if (isInvalidFcmTokenError(code)) {
      cleanupBatch.set(tokenDocs[index].ref, {
        enabled: false,
        invalidAt: admin.firestore.FieldValue.serverTimestamp(),
        invalidReason: code,
        invalidMessage: String(message).slice(0, 500)
      }, { merge: true });
    }
  });

  try {
    await cleanupBatch.commit();
  } catch (error) {
    console.error("Targeted FCM token cleanup failed:", error?.message || error);
  }

  const firstFailure = failureDetails[0] || null;
  return {
    sent: response.successCount,
    failed: response.failureCount,
    tokenCount: tokens.length,
    recipientCount: userIds.size + emails.size,
    failureCode: firstFailure?.code || "",
    failureMessage: firstFailure?.message || "",
    failures: failureDetails
  };
}

async function writeSupportTicketNotification(companyId, notification = {}, recipient = {}) {
  const notificationRef = notificationCollectionRef(companyId).doc();
  const recipientUids = supportUniqueStrings(recipient.userIds || recipient.uids || []);
  const recipientEmails = supportUniqueStrings(recipient.emails || []).map((item) => item.toLowerCase());
  const title = cleanSupportText(notification.title || "Support / Tickets", 140);
  const message = cleanSupportText(notification.message || "You have a new ticket update.", 240);

  const payload = {
    companyId,
    type: String(notification.type || "support_ticket"),
    title,
    message,
    ticketId: String(notification.ticketId || ""),
    ticketType: String(notification.ticketType || ""),
    ticketTitle: String(notification.ticketTitle || ""),
    route: String(notification.route || (notification.ticketId ? "supportTicket" : "")),
    senderUid: String(notification.senderUid || ""),
    senderEmail: String(notification.senderEmail || ""),
    senderName: String(notification.senderName || ""),
    senderPhotoURL: cleanSupportPhotoURL(notification.senderPhotoURL || notification.imageUrl || notification.imageURL || ""),
    imageUrl: cleanSupportPhotoURL(notification.senderPhotoURL || notification.imageUrl || notification.imageURL || ""),
    priority: String(notification.priority || ""),
    status: String(notification.status || ""),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    read: false,
    actioned: false,
    source: "supportTicketNotification",
    recipientUids,
    recipientEmails,
    supportSchemaVersion: 2
  };

  await notificationRef.set(payload, { merge: true });

  let pushResult = { sent: 0, failed: 0, reason: "not_attempted" };
  try {
    pushResult = await sendPushNotificationToRecipients(companyId, {
      ...payload,
      notificationId: notificationRef.id,
      body: message
    }, { userIds: recipientUids, emails: recipientEmails });
  } catch (error) {
    console.error("Support ticket push failed:", notificationRef.id, error?.message || error);
    pushResult = { sent: 0, failed: 1, error: error?.message || String(error) };
  }

  await notificationRef.set({
    pushSent: Number(pushResult.sent || 0) > 0,
    pushResult,
    pushSentAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return { notificationId: notificationRef.id, pushResult };
}


async function requireNotificationWorkspaceAccess(request, companyId = "") {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  const cleanCompanyId = String(companyId || request.data?.companyId || "").trim();
  if (!cleanCompanyId) {
    throw new HttpsError("invalid-argument", "companyId is required.");
  }

  const companyRef = admin.firestore().collection("companies").doc(cleanCompanyId);
  const companySnap = await companyRef.get();
  if (!companySnap.exists) {
    throw new HttpsError("not-found", "Workspace not found.");
  }

  const companyData = companySnap.data() || {};
  companyData.__workspaceId = cleanCompanyId;
  if (!uidHasCompanyAccess(companyData, uid)) {
    throw new HttpsError("permission-denied", "You do not have access to this workspace.");
  }

  return { uid, companyId: cleanCompanyId, companyRef, companyData };
}

function notificationReadEmailKey(email = "") {
  return String(email || "")
    .trim()
    .toLowerCase()
    .replace(/\./g, "_")
    .replace(/@/g, "_at_");
}

function notificationMatchesCurrentUser(notificationData = {}, request = {}) {
  const uid = String(request.auth?.uid || "").trim();
  const email = supportUserEmail(request);
  const recipientUids = Array.isArray(notificationData.recipientUids) ? notificationData.recipientUids.map((item) => String(item || "").trim()) : [];
  const recipientEmails = Array.isArray(notificationData.recipientEmails) ? notificationData.recipientEmails.map((item) => String(item || "").trim().toLowerCase()) : [];

  if (recipientUids.length === 0 && recipientEmails.length === 0) return true;
  if (uid && recipientUids.includes(uid)) return true;
  if (email && recipientEmails.includes(email)) return true;
  return false;
}

exports.markActivityNotificationRead = onCall({ region: "europe-west2" }, async (request) => {
  const notificationId = String(request.data?.notificationId || "").trim();
  if (!notificationId) {
    throw new HttpsError("invalid-argument", "notificationId is required.");
  }

  const { uid, companyId } = await requireNotificationWorkspaceAccess(request);
  const notificationRef = notificationCollectionRef(companyId).doc(notificationId);
  const notificationSnap = await notificationRef.get();

  if (!notificationSnap.exists) {
    throw new HttpsError("not-found", "Notification not found.");
  }

  const notificationData = notificationSnap.data() || {};
  if (!notificationMatchesCurrentUser(notificationData, request)) {
    throw new HttpsError("permission-denied", "This notification is not assigned to your account.");
  }

  const emailKey = notificationReadEmailKey(supportUserEmail(request));
  const readPayload = {
    [`readBy.${uid}`]: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  if (emailKey) {
    readPayload[`readBy.${emailKey}`] = admin.firestore.FieldValue.serverTimestamp();
  }

  await notificationRef.set(readPayload, { merge: true });

  return { ok: true, notificationId };
});

exports.markAllActivityNotificationsRead = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId } = await requireNotificationWorkspaceAccess(request);

  const snap = await notificationCollectionRef(companyId)
    .orderBy("createdAt", "desc")
    .limit(200)
    .get();

  const batch = admin.firestore().batch();
  let updated = 0;

  const emailKey = notificationReadEmailKey(supportUserEmail(request));

  snap.forEach((doc) => {
    const data = doc.data() || {};
    if (!notificationMatchesCurrentUser(data, request)) return;
    const readBy = data.readBy && typeof data.readBy === "object" && !Array.isArray(data.readBy) ? data.readBy : {};
    if (readBy[uid] || (emailKey && readBy[emailKey])) return;

    const readPayload = {
      [`readBy.${uid}`]: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (emailKey) {
      readPayload[`readBy.${emailKey}`] = admin.firestore.FieldValue.serverTimestamp();
    }

    batch.set(doc.ref, readPayload, { merge: true });
    updated += 1;
  });

  if (updated > 0) {
    await batch.commit();
  }

  return { ok: true, updated };
});



exports.dismissActivityNotifications = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId } = await requireNotificationWorkspaceAccess(request);

  const rawIds = Array.isArray(request.data?.notificationIds) ? request.data.notificationIds : [];
  const notificationIds = supportUniqueStrings(rawIds.map((item) => String(item || "").trim()).filter(Boolean)).slice(0, 100);
  if (notificationIds.length === 0) {
    throw new HttpsError("invalid-argument", "notificationIds is required.");
  }

  const emailKey = notificationReadEmailKey(supportUserEmail(request));
  const batch = admin.firestore().batch();
  let updated = 0;

  for (const notificationId of notificationIds) {
    const notificationRef = notificationCollectionRef(companyId).doc(notificationId);
    const notificationSnap = await notificationRef.get();

    if (!notificationSnap.exists) continue;
    const notificationData = notificationSnap.data() || {};
    if (!notificationMatchesCurrentUser(notificationData, request)) continue;

    const payload = {
      [`dismissedBy.${uid}`]: admin.firestore.FieldValue.serverTimestamp(),
      [`readBy.${uid}`]: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (emailKey) {
      payload[`dismissedBy.${emailKey}`] = admin.firestore.FieldValue.serverTimestamp();
      payload[`readBy.${emailKey}`] = admin.firestore.FieldValue.serverTimestamp();
    }

    batch.set(notificationRef, payload, { merge: true });
    updated += 1;
  }

  if (updated > 0) {
    await batch.commit();
  }

  return { ok: true, updated };
});



function workspaceSupportRecipientEntries(companyData = {}, excludeUid = "") {
  const cleanExcludeUid = String(excludeUid || "").trim();
  const recipients = [];
  const addRecipient = (uid = "", email = "") => {
    const cleanUid = String(uid || "").trim();
    const cleanEmail = String(email || "").trim().toLowerCase();
    if (cleanUid && cleanUid === cleanExcludeUid) return;
    if (!cleanUid && !cleanEmail) return;
    if (recipients.some((item) => (cleanUid && item.uid === cleanUid) || (cleanEmail && item.email === cleanEmail))) return;
    recipients.push({ uid: cleanUid, email: cleanEmail });
  };

  const ownerUid = String(companyData.ownerUid || "").trim();
  addRecipient(ownerUid, companyData.ownerEmail || companyData.email || "");

  const members = companyMembersMap(companyData);
  for (const [uid, entry] of Object.entries(members)) {
    const role = normalizeWorkspaceRole(workspaceMemberRole(companyData, uid, "member"), "member");
    if (role !== "owner" && role !== "admin") continue;
    const email = entry && typeof entry === "object" && !Array.isArray(entry) ? entry.email || entry.userEmail || "" : "";
    addRecipient(uid, email);
  }

  const memberRoles = companyMemberRolesMap(companyData);
  for (const [uid, roleValue] of Object.entries(memberRoles)) {
    const role = normalizeWorkspaceRole(roleValue, "member");
    if (role === "owner" || role === "admin") addRecipient(uid, "");
  }

  if (companyData.__supportSettings && typeof companyData.__supportSettings === "object") {
    for (const managerUid of cleanSupportManagerUidList(companyData.__supportSettings.supportManagerUids || [])) {
      const member = companyMembersMap(companyData)[managerUid];
      const email = member && typeof member === "object" && !Array.isArray(member) ? member.email || member.userEmail || "" : "";
      addRecipient(managerUid, email);
    }
    for (const managerEmail of cleanSupportManagerEmailList(companyData.__supportSettings.supportManagerEmails || [])) {
      addRecipient("", managerEmail);
    }
  }

  return recipients;
}

function supportRecipientObject(entries = []) {
  return {
    userIds: supportUniqueStrings(entries.map((item) => item.uid)),
    emails: supportUniqueStrings(entries.map((item) => item.email)).map((item) => item.toLowerCase())
  };
}

function supportSettingsDocRef(companyId = "") {
  return admin.firestore().collection("companies").doc(String(companyId || "").trim()).collection("supportSettings").doc("general");
}

async function workspaceSupportSettings(companyId = "") {
  const cleanCompanyId = String(companyId || "").trim();
  if (!cleanCompanyId) return {};
  try {
    const snap = await supportSettingsDocRef(cleanCompanyId).get();
    return snap.data() || {};
  } catch (error) {
    console.warn("workspaceSupportSettings failed:", error?.message || error);
    return {};
  }
}

function cleanSupportManagerUidList(value = []) {
  if (!Array.isArray(value)) return [];
  return supportUniqueStrings(value).slice(0, 50);
}

function cleanSupportManagerEmailList(value = []) {
  if (!Array.isArray(value)) return [];
  return supportUniqueStrings(value).map((item) => item.toLowerCase()).filter((item) => item.includes("@")).slice(0, 50);
}

function isWorkspaceSupportManagerFromSettings(settings = {}, request = {}) {
  const uid = String(request.auth?.uid || "").trim();
  const email = supportUserEmail(request);
  const managerUids = new Set(cleanSupportManagerUidList(settings.supportManagerUids || settings.managerUids || []));
  const managerEmails = new Set(cleanSupportManagerEmailList(settings.supportManagerEmails || settings.managerEmails || []));
  return Boolean((uid && managerUids.has(uid)) || (email && managerEmails.has(email)));
}

async function canManageWorkspaceSupportQueue(companyId = "", companyData = {}, request = {}) {
  const uid = String(request.auth?.uid || "").trim();
  const role = normalizeWorkspaceRole(workspaceMemberRole(companyData, uid, "member"), "member");
  if (uidIsCompanyOwner(companyData, uid) || role === "admin") return true;
  const settings = await workspaceSupportSettings(companyId);
  return isWorkspaceSupportManagerFromSettings(settings, request);
}

async function canAccessWorkspaceTicket(ticketData = {}, companyId = "", companyData = {}, request = {}) {
  const uid = String(request.auth?.uid || "").trim();
  if (String(ticketData.createdByUid || "") === uid) return true;
  return canManageWorkspaceSupportQueue(companyId, companyData, request);
}

async function canAssignWorkspaceTicketTo(companyId = "", companyData = {}, target = {}) {
  const targetUid = String(target.uid || target.userId || "").trim();
  const targetEmail = String(target.email || "").trim().toLowerCase();
  if (!targetUid && !targetEmail) return false;

  if (targetUid) {
    const role = normalizeWorkspaceRole(workspaceMemberRole(companyData, targetUid, "member"), "member");
    if (uidIsCompanyOwner(companyData, targetUid) || role === "admin") return true;
  }

  const settings = await workspaceSupportSettings(companyId);
  const managerUids = new Set(cleanSupportManagerUidList(settings.supportManagerUids || settings.managerUids || []));
  const managerEmails = new Set(cleanSupportManagerEmailList(settings.supportManagerEmails || settings.managerEmails || []));
  return Boolean((targetUid && managerUids.has(targetUid)) || (targetEmail && managerEmails.has(targetEmail)));
}



async function notifySupportAdminsForTicket(companyId, ticketId, ticketData = {}, eventType = "new_ticket") {
  const subject = eventType === "reply"
    ? `New reply on support ticket: ${ticketData.title || ticketId}`
    : `New support ticket: ${ticketData.title || ticketId}`;
  const body = [
    `Ticket: ${ticketData.title || ticketId}`,
    `Workspace: ${ticketData.companyName || companyId}`,
    `From: ${ticketData.createdByEmail || "Unknown user"}`,
    "",
    supportLastMessagePreview(ticketData.lastMessagePreview || ticketData.message || "")
  ].join("\n");

  return queueSupportEmailNotifications(Array.from(SUPPORT_ADMIN_EMAILS), {
    subject,
    body
  }, {
    companyId,
    ticketId,
    ticketType: "appSupport",
    notificationType: eventType === "reply" ? "support_ticket_reply_to_admin" : "new_support_ticket"
  });
}

async function notifySupportTicketCreator(companyId, ticketId, ticketData = {}, message = "") {
  const recipient = supportRecipientObject([{ uid: ticketData.createdByUid || "", email: ticketData.createdByEmail || "" }]);
  const senderName = supportNotificationSenderName({ ...ticketData, lastMessageByName: "NivaDesk Support" }, "NivaDesk Support");
  const subject = supportNotificationSubject(ticketData.title || "your ticket", "your ticket");
  const title = supportNotificationTitle(senderName, subject, "replied");
  const body = supportNotificationBody(senderName, message || ticketData.lastMessagePreview || "", `Reply on: ${subject}`);
  const result = await writeSupportTicketNotification(companyId, {
    type: "support_ticket_reply",
    title,
    message: body,
    ticketId,
    ticketType: "appSupport",
    ticketTitle: ticketData.title || "",
    route: "supportTicket",
    senderUid: ticketData.lastMessageByUid || "",
    senderEmail: ticketData.lastMessageByEmail || "",
    senderName,
    senderPhotoURL: ticketData.lastMessageByPhotoURL || "",
    priority: ticketData.priority || "",
    status: ticketData.status || ""
  }, recipient);

  const emailResult = await queueSupportEmailNotifications(recipient.emails, {
    subject: `${title}: ${ticketData.title || "your ticket"}`,
    body: `${body}\n\nTicket: ${ticketData.title || ticketId}`
  }, {
    companyId,
    ticketId,
    ticketType: "appSupport",
    notificationType: "support_ticket_reply_to_user"
  });

  return { ...result, emailResult };
}

async function notifyWorkspaceTicketRecipients(companyId, companyData = {}, ticketId, ticketData = {}, senderUid = "", eventType = "reply", message = "") {
  const supportSettings = await workspaceSupportSettings(companyId);
  const companyWithSupportSettings = { ...companyData, __supportSettings: supportSettings };
  const creatorUid = String(ticketData.createdByUid || "").trim();
  const senderIsCreator = senderUid && senderUid === creatorUid;
  const recipientEntries = senderIsCreator
    ? workspaceSupportRecipientEntries(companyWithSupportSettings, senderUid)
    : [{ uid: creatorUid, email: ticketData.createdByEmail || "" }];

  const recipient = supportRecipientObject(recipientEntries);
  if (recipient.userIds.length === 0 && recipient.emails.length === 0) {
    return { skipped: true, reason: "no_workspace_ticket_recipients" };
  }

  const isNew = eventType === "new_ticket";
  const subject = supportNotificationSubject(ticketData.title || "Workspace ticket", "Workspace ticket");
  const senderName = isNew
    ? supportNotificationSenderName(ticketData, "A team member")
    : supportNotificationSenderName(ticketData, "Workspace");
  const title = isNew
    ? supportNotificationTitle(senderName, subject, "opened")
    : supportNotificationTitle(senderName, subject, "replied");
  const body = isNew
    ? supportNotificationBody(senderName, message || ticketData.message || "", `Opened: ${subject}`)
    : supportNotificationBody(senderName, message || ticketData.lastMessagePreview || "", `Reply on: ${subject}`);

  const result = await writeSupportTicketNotification(companyId, {
    type: isNew ? "workspace_ticket" : "workspace_ticket_reply",
    title,
    message: body,
    ticketId,
    ticketType: "workspace",
    ticketTitle: ticketData.title || "",
    route: "supportTicket",
    senderUid: isNew ? ticketData.createdByUid || "" : ticketData.lastMessageByUid || "",
    senderEmail: isNew ? ticketData.createdByEmail || "" : ticketData.lastMessageByEmail || "",
    senderName,
    senderPhotoURL: isNew ? ticketData.createdByPhotoURL || "" : ticketData.lastMessageByPhotoURL || "",
    priority: ticketData.priority || "",
    status: ticketData.status || ""
  }, recipient);

  const emailResult = await queueSupportEmailNotifications(recipient.emails, {
    subject: `${title}: ${ticketData.title || "Workspace ticket"}`,
    body: `${body}\n\nTicket: ${ticketData.title || ticketId}`
  }, {
    companyId,
    ticketId,
    ticketType: "workspace",
    notificationType: isNew ? "new_workspace_ticket" : "workspace_ticket_reply"
  });

  return { ...result, emailResult };
}

async function safeSupportNotification(label, callback) {
  try {
    return await callback();
  } catch (error) {
    console.error(label, error?.message || error);
    return { ok: false, error: error?.message || String(error) };
  }
}




function cleanPersonalNoteText(value = "", maxLength = 20000) {
  return String(value || "").trim().slice(0, maxLength);
}

function cleanPersonalNoteStringArray(value = [], maxItems = 80, maxLength = 240) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .map((item) => item.slice(0, maxLength))
  )).slice(0, maxItems);
}

function normalizedPersonalNoteEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

function memberEmailFromCompanyData(companyData = {}, uid = "") {
  const cleanUid = String(uid || "").trim();
  if (!cleanUid) return "";
  if (cleanUid === String(companyData.ownerUid || "").trim()) {
    return normalizedPersonalNoteEmail(companyData.ownerEmail || companyData.email || "");
  }

  const members = companyMembersMap(companyData);
  const member = members[cleanUid];
  if (member && typeof member === "object" && !Array.isArray(member)) {
    return normalizedPersonalNoteEmail(member.email || member.userEmail || "");
  }

  return "";
}

function isWorkspaceMemberTarget(companyData = {}, targetUserId = "", targetEmail = "") {
  const cleanTargetUid = String(targetUserId || "").trim();
  const cleanTargetEmail = normalizedPersonalNoteEmail(targetEmail);

  if (cleanTargetUid && uidHasCompanyAccess(companyData, cleanTargetUid)) return true;

  if (cleanTargetEmail) {
    const ownerEmail = normalizedPersonalNoteEmail(companyData.ownerEmail || companyData.email || "");
    if (ownerEmail && ownerEmail === cleanTargetEmail) return true;

    const members = companyMembersMap(companyData);
    for (const entry of Object.values(members)) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const email = normalizedPersonalNoteEmail(entry.email || entry.userEmail || "");
      if (email && email === cleanTargetEmail) return true;
    }
  }

  return false;
}

function personalNoteDocRef(companyId = "", userId = "", noteId = "") {
  return admin.firestore()
    .collection("companies")
    .doc(String(companyId || "").trim())
    .collection("personal_notes")
    .doc(String(userId || "").trim())
    .collection("notes")
    .doc(String(noteId || "").trim());
}

function cleanSharedPersonalNotePayload(data = {}, context = {}) {
  const title = cleanPersonalNoteText(data.title || "", 500);
  const text = cleanPersonalNoteText(data.text || "", 20000);
  const now = admin.firestore.FieldValue.serverTimestamp();

  const payload = {
    title,
    text,
    colorName: cleanPersonalNoteText(data.colorName || "default", 80) || "default",
    ownerUserId: String(data.ownerUserId || context.ownerUserId || "").trim(),
    companyId: String(context.companyId || data.companyId || "").trim(),
    sharedWith: cleanPersonalNoteStringArray(data.sharedWith || []),
    collaboratorEmails: cleanPersonalNoteStringArray(data.collaboratorEmails || []),
    activeEditorUserId: "",
    activeEditorEmail: "",
    isPinned: Boolean(data.isPinned),
    isArchived: Boolean(data.isArchived),
    isDeleted: Boolean(data.isDeleted),
    labels: cleanPersonalNoteStringArray(data.labels || [], 80, 160),
    links: cleanPersonalNoteStringArray(data.links || [], 80, 1000),
    manualOrder: Number.isFinite(Number(data.manualOrder)) ? Number(data.manualOrder) : Date.now(),
    createdAt: data.createdAt && typeof data.createdAt.toDate === "function" ? data.createdAt : now,
    updatedAt: now,
    userId: String(context.targetUserId || data.userId || "").trim()
  };

  if (data.reminderDate) payload.reminderDate = data.reminderDate;
  return payload;
}

exports.sharePersonalNoteWithWorkspaceMember = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  const companyId = String(request.data?.companyId || "").trim();
  const noteId = String(request.data?.noteId || "").trim();
  const targetUserId = String(request.data?.targetUserId || request.data?.targetUid || "").trim();
  const targetEmail = normalizedPersonalNoteEmail(request.data?.targetEmail || "");
  const note = request.data?.note || {};

  if (!companyId || !noteId || !targetUserId) {
    throw new HttpsError("invalid-argument", "companyId, noteId and targetUserId are required.");
  }

  const { companyData } = await requireNotificationWorkspaceAccess(request, companyId);

  if (!isWorkspaceMemberTarget(companyData, targetUserId, targetEmail)) {
    throw new HttpsError("permission-denied", "The selected user is not a member of this workspace.");
  }

  const sourceRef = personalNoteDocRef(companyId, uid, noteId);
  const sourceSnap = await sourceRef.get();

  const sourceData = sourceSnap.exists ? sourceSnap.data() || {} : {};
  const ownerUserId = String(sourceData.ownerUserId || note.ownerUserId || uid).trim();

  if (ownerUserId && ownerUserId !== uid && !uidIsCompanyOwner(companyData, uid)) {
    const sourceShared = Array.isArray(sourceData.sharedWith) ? sourceData.sharedWith.map(normalizedPersonalNoteEmail) : [];
    const requestEmail = supportUserEmail(request);
    if (!sourceShared.includes(requestEmail)) {
      throw new HttpsError("permission-denied", "Only the note owner or an existing collaborator can share this note.");
    }
  }

  const existingEmails = cleanPersonalNoteStringArray([
    ...(Array.isArray(sourceData.sharedWith) ? sourceData.sharedWith : []),
    ...(Array.isArray(note.sharedWith) ? note.sharedWith : []),
    targetEmail
  ]).map(normalizedPersonalNoteEmail).filter(Boolean);

  const collaboratorEmails = cleanPersonalNoteStringArray([
    ...(Array.isArray(sourceData.collaboratorEmails) ? sourceData.collaboratorEmails : []),
    ...(Array.isArray(note.collaboratorEmails) ? note.collaboratorEmails : []),
    targetEmail
  ]).map(normalizedPersonalNoteEmail).filter(Boolean);

  const mergedNote = {
    ...note,
    ...sourceData,
    ownerUserId: ownerUserId || uid,
    sharedWith: existingEmails,
    collaboratorEmails
  };

  const targetRef = personalNoteDocRef(companyId, targetUserId, noteId);
  const targetPayload = cleanSharedPersonalNotePayload(mergedNote, {
    companyId,
    ownerUserId: ownerUserId || uid,
    targetUserId
  });

  const sourcePayload = {
    sharedWith: existingEmails,
    collaboratorEmails,
    ownerUserId: ownerUserId || uid,
    companyId,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  const batch = admin.firestore().batch();
  batch.set(sourceRef, sourcePayload, { merge: true });
  batch.set(targetRef, targetPayload, { merge: true });

  const notificationRef = notificationCollectionRef(companyId).doc();
  const noteTitle = cleanPersonalNoteText(mergedNote.title || "Untitled note", 140) || "Untitled note";
  const senderEmail = supportUserEmail(request);
  const message = `${senderEmail || "A teammate"} shared a note with you: ${noteTitle}`;

  batch.set(notificationRef, {
    companyId,
    type: "shared_note",
    title: "Shared note",
    message,
    noteId,
    route: "notes",
    senderUid: uid,
    senderEmail,
    recipientUids: [targetUserId],
    recipientEmails: targetEmail ? [targetEmail] : [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    read: false,
    actioned: false,
    source: "sharePersonalNoteWithWorkspaceMember"
  }, { merge: true });

  await batch.commit();

  let pushResult = { sent: 0, failed: 0, reason: "not_attempted" };
  try {
    pushResult = await sendPushNotificationToRecipients(companyId, {
      type: "shared_note",
      title: "Shared note",
      message,
      noteId,
      route: "notes",
      notificationId: notificationRef.id,
      senderUid: uid,
      senderEmail
    }, {
      userIds: [targetUserId],
      emails: targetEmail ? [targetEmail] : []
    });
    await notificationRef.set({
      pushSent: Number(pushResult.sent || 0) > 0,
      pushResult,
      pushSentAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error("shared note push failed:", error?.message || error);
  }

  return {
    ok: true,
    noteId,
    companyId,
    targetUserId,
    targetEmail,
    notificationId: notificationRef.id,
    pushResult
  };
});

exports.removeSharedPersonalNoteFromWorkspaceMember = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  const companyId = String(request.data?.companyId || "").trim();
  const noteId = String(request.data?.noteId || "").trim();
  const targetUserId = String(request.data?.targetUserId || request.data?.targetUid || "").trim();
  const targetEmail = normalizedPersonalNoteEmail(request.data?.targetEmail || "");

  if (!companyId || !noteId || !targetUserId) {
    throw new HttpsError("invalid-argument", "companyId, noteId and targetUserId are required.");
  }

  const { companyData } = await requireNotificationWorkspaceAccess(request, companyId);

  if (!isWorkspaceMemberTarget(companyData, targetUserId, targetEmail)) {
    throw new HttpsError("permission-denied", "The selected user is not a member of this workspace.");
  }

  const sourceRef = personalNoteDocRef(companyId, uid, noteId);
  const sourceSnap = await sourceRef.get();
  const sourceData = sourceSnap.data() || {};
  const ownerUserId = String(sourceData.ownerUserId || uid).trim();

  if (ownerUserId !== uid && !uidIsCompanyOwner(companyData, uid)) {
    throw new HttpsError("permission-denied", "Only the note owner can remove collaborators.");
  }

  const sharedWith = cleanPersonalNoteStringArray(sourceData.sharedWith || [])
    .map(normalizedPersonalNoteEmail)
    .filter((email) => email && email !== targetEmail);

  const collaboratorEmails = cleanPersonalNoteStringArray(sourceData.collaboratorEmails || [])
    .map(normalizedPersonalNoteEmail)
    .filter((email) => email && email !== targetEmail);

  const batch = admin.firestore().batch();
  batch.set(sourceRef, {
    sharedWith,
    collaboratorEmails,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  batch.delete(personalNoteDocRef(companyId, targetUserId, noteId));
  await batch.commit();

  return { ok: true, noteId, targetUserId, targetEmail };
});



function personalNoteInviteRef(companyId = "", inviteId = "") {
  return admin.firestore()
    .collection("companies")
    .doc(String(companyId || "").trim())
    .collection("personal_note_collaboration_invites")
    .doc(String(inviteId || "").trim());
}

function inviteIdForPersonalNote(companyId = "", noteId = "", targetUserId = "") {
  const source = `${String(companyId || "").trim()}_${String(noteId || "").trim()}_${String(targetUserId || "").trim()}`;
  return crypto.createHash("sha1").update(source).digest("hex");
}

function cleanInviteNotePreview(note = {}) {
  return {
    title: cleanPersonalNoteText(note.title || "Untitled note", 500) || "Untitled note",
    text: cleanPersonalNoteText(note.text || "", 1200),
    colorName: cleanPersonalNoteText(note.colorName || "default", 80) || "default"
  };
}

exports.createPersonalNoteCollaborationInvite = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  const companyId = String(request.data?.companyId || "").trim();
  const noteId = String(request.data?.noteId || "").trim();
  const targetUserId = String(request.data?.targetUserId || request.data?.targetUid || "").trim();
  const targetEmail = normalizedPersonalNoteEmail(request.data?.targetEmail || "");
  const note = request.data?.note || {};

  if (!companyId || !noteId || !targetUserId) {
    throw new HttpsError("invalid-argument", "companyId, noteId and targetUserId are required.");
  }

  const { companyData } = await requireNotificationWorkspaceAccess(request, companyId);
  if (!isWorkspaceMemberTarget(companyData, targetUserId, targetEmail)) {
    throw new HttpsError("permission-denied", "The selected user is not a member of this workspace.");
  }

  const sourceRef = personalNoteDocRef(companyId, uid, noteId);
  const sourceSnap = await sourceRef.get();
  const sourceData = sourceSnap.exists ? sourceSnap.data() || {} : {};
  const ownerUserId = String(sourceData.ownerUserId || note.ownerUserId || uid).trim();

  if (ownerUserId && ownerUserId !== uid && !uidIsCompanyOwner(companyData, uid)) {
    throw new HttpsError("permission-denied", "Only the note owner can invite collaborators.");
  }

  const inviteId = inviteIdForPersonalNote(companyId, noteId, targetUserId);
  const inviteRef = personalNoteInviteRef(companyId, inviteId);
  const senderEmail = supportUserEmail(request);
  const preview = cleanInviteNotePreview({ ...note, ...sourceData });
  const now = admin.firestore.FieldValue.serverTimestamp();

  const invitePayload = {
    companyId,
    inviteId,
    noteId,
    sourceUserId: uid,
    sourceEmail: senderEmail,
    ownerUserId: ownerUserId || uid,
    targetUserId,
    targetEmail,
    status: "pending",
    notePreview: preview,
    createdAt: now,
    updatedAt: now,
    acceptedAt: null,
    declinedAt: null
  };

  const notificationRef = notificationCollectionRef(companyId).doc();
  const message = `${senderEmail || "A teammate"} invited you to collaborate on a note: ${preview.title}`;

  const batch = admin.firestore().batch();
  batch.set(inviteRef, invitePayload, { merge: true });
  batch.set(sourceRef, {
    ownerUserId: ownerUserId || uid,
    companyId,
    pendingCollaboratorEmails: admin.firestore.FieldValue.arrayUnion(targetEmail),
    updatedAt: now
  }, { merge: true });
  const userNotificationRef = admin.firestore()
    .collection("companies")
    .doc(companyId)
    .collection("users")
    .doc(targetUserId)
    .collection("notifications")
    .doc(notificationRef.id);

  batch.set(notificationRef, {
    companyId,
    type: "personal_note_collaboration_invite",
    title: "Note collaboration invitation",
    message,
    noteId,
    inviteId,
    route: "notes",
    senderUid: uid,
    senderEmail,
    recipientUids: [targetUserId],
    recipientEmails: targetEmail ? [targetEmail] : [],
    createdAt: now,
    read: false,
    actioned: false,
    source: "createPersonalNoteCollaborationInvite"
  }, { merge: true });

  batch.set(userNotificationRef, {
    companyId,
    type: "personal_note_collaboration_invite",
    title: "Note collaboration invitation",
    message,
    noteId,
    inviteId,
    route: "notes",
    senderUid: uid,
    senderEmail,
    recipientUids: [targetUserId],
    recipientEmails: targetEmail ? [targetEmail] : [],
    createdAt: now,
    read: false,
    actioned: false,
    source: "createPersonalNoteCollaborationInvite"
  }, { merge: true });

  await batch.commit();

  let pushResult = { sent: 0, failed: 0, reason: "not_attempted" };
  try {
    pushResult = await sendPushNotificationToRecipients(companyId, {
      type: "personal_note_collaboration_invite",
      title: "Note collaboration invitation",
      message,
      noteId,
      inviteId,
      route: "notes",
      notificationId: notificationRef.id,
      senderUid: uid,
      senderEmail
    }, {
      userIds: [targetUserId],
      emails: targetEmail ? [targetEmail] : []
    });

    await notificationRef.set({
      pushSent: Number(pushResult.sent || 0) > 0,
      pushResult,
      pushSentAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error("personal note collaboration invite push failed:", error?.message || error);
  }

  return {
    ok: true,
    inviteId,
    noteId,
    companyId,
    targetUserId,
    targetEmail,
    notificationId: notificationRef.id,
    pushResult
  };
});

exports.listPersonalNoteCollaborationInvites = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  const companyId = String(request.data?.companyId || "").trim();
  if (!companyId) {
    throw new HttpsError("invalid-argument", "companyId is required.");
  }

  await requireNotificationWorkspaceAccess(request, companyId);
  const userEmail = supportUserEmail(request);

  const byUidSnap = await admin.firestore()
    .collection("companies")
    .doc(companyId)
    .collection("personal_note_collaboration_invites")
    .where("targetUserId", "==", uid)
    .where("status", "==", "pending")
    .limit(50)
    .get();

  let docs = byUidSnap.docs;

  if (userEmail) {
    const byEmailSnap = await admin.firestore()
      .collection("companies")
      .doc(companyId)
      .collection("personal_note_collaboration_invites")
      .where("targetEmail", "==", userEmail)
      .where("status", "==", "pending")
      .limit(50)
      .get();

    const seen = new Set(docs.map((doc) => doc.id));
    for (const doc of byEmailSnap.docs) {
      if (!seen.has(doc.id)) docs.push(doc);
    }
  }

  return {
    ok: true,
    invites: docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        inviteId: data.inviteId || doc.id,
        companyId: data.companyId || companyId,
        noteId: data.noteId || "",
        sourceUserId: data.sourceUserId || "",
        sourceEmail: data.sourceEmail || "",
        ownerUserId: data.ownerUserId || "",
        targetUserId: data.targetUserId || "",
        targetEmail: data.targetEmail || "",
        status: data.status || "pending",
        notePreview: data.notePreview || {},
        createdAtMillis: data.createdAt && typeof data.createdAt.toMillis === "function" ? data.createdAt.toMillis() : null
      };
    })
  };
});

exports.acceptPersonalNoteCollaborationInvite = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  const companyId = String(request.data?.companyId || "").trim();
  const inviteId = String(request.data?.inviteId || "").trim();
  if (!companyId || !inviteId) {
    throw new HttpsError("invalid-argument", "companyId and inviteId are required.");
  }

  await requireNotificationWorkspaceAccess(request, companyId);

  const inviteRef = personalNoteInviteRef(companyId, inviteId);
  const inviteSnap = await inviteRef.get();
  if (!inviteSnap.exists) {
    throw new HttpsError("not-found", "Invitation not found.");
  }

  const invite = inviteSnap.data() || {};
  const userEmail = supportUserEmail(request);
  const targetUserId = String(invite.targetUserId || "").trim();
  const targetEmail = normalizedPersonalNoteEmail(invite.targetEmail || "");

  if (targetUserId !== uid && (!userEmail || targetEmail !== userEmail)) {
    throw new HttpsError("permission-denied", "This invitation is not for the signed-in user.");
  }

  if (String(invite.status || "") !== "pending") {
    return { ok: true, alreadyHandled: true, status: invite.status || "unknown" };
  }

  const noteId = String(invite.noteId || "").trim();
  const sourceUserId = String(invite.sourceUserId || invite.ownerUserId || "").trim();
  if (!noteId || !sourceUserId) {
    throw new HttpsError("failed-precondition", "Invitation is missing note source information.");
  }

  const sourceRef = personalNoteDocRef(companyId, sourceUserId, noteId);
  const sourceSnap = await sourceRef.get();
  if (!sourceSnap.exists) {
    throw new HttpsError("not-found", "The original note is no longer available.");
  }

  const sourceData = sourceSnap.data() || {};
  const existingShared = cleanPersonalNoteStringArray(sourceData.sharedWith || []).map(normalizedPersonalNoteEmail);
  const existingCollaborators = cleanPersonalNoteStringArray(sourceData.collaboratorEmails || []).map(normalizedPersonalNoteEmail);
  const targetEmailForShare = targetEmail || userEmail;

  const sharedWith = Array.from(new Set([...existingShared, targetEmailForShare].filter(Boolean)));
  const collaboratorEmails = Array.from(new Set([...existingCollaborators, targetEmailForShare].filter(Boolean)));

  const targetRef = personalNoteDocRef(companyId, uid, noteId);
  const targetPayload = cleanSharedPersonalNotePayload({
    ...sourceData,
    sharedWith,
    collaboratorEmails
  }, {
    companyId,
    ownerUserId: sourceData.ownerUserId || sourceUserId,
    targetUserId: uid
  });

  const now = admin.firestore.FieldValue.serverTimestamp();
  const batch = admin.firestore().batch();
  batch.set(targetRef, targetPayload, { merge: true });
  batch.set(sourceRef, {
    sharedWith,
    collaboratorEmails,
    pendingCollaboratorEmails: admin.firestore.FieldValue.arrayRemove(targetEmailForShare),
    updatedAt: now
  }, { merge: true });
  batch.set(inviteRef, {
    status: "accepted",
    acceptedAt: now,
    updatedAt: now
  }, { merge: true });

  await batch.commit();

  return { ok: true, status: "accepted", noteId, inviteId };
});

exports.declinePersonalNoteCollaborationInvite = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  const companyId = String(request.data?.companyId || "").trim();
  const inviteId = String(request.data?.inviteId || "").trim();
  if (!companyId || !inviteId) {
    throw new HttpsError("invalid-argument", "companyId and inviteId are required.");
  }

  await requireNotificationWorkspaceAccess(request, companyId);

  const inviteRef = personalNoteInviteRef(companyId, inviteId);
  const inviteSnap = await inviteRef.get();
  if (!inviteSnap.exists) {
    throw new HttpsError("not-found", "Invitation not found.");
  }

  const invite = inviteSnap.data() || {};
  const userEmail = supportUserEmail(request);
  const targetUserId = String(invite.targetUserId || "").trim();
  const targetEmail = normalizedPersonalNoteEmail(invite.targetEmail || "");

  if (targetUserId !== uid && (!userEmail || targetEmail !== userEmail)) {
    throw new HttpsError("permission-denied", "This invitation is not for the signed-in user.");
  }

  const noteId = String(invite.noteId || "").trim();
  const sourceUserId = String(invite.sourceUserId || invite.ownerUserId || "").trim();
  const now = admin.firestore.FieldValue.serverTimestamp();

  const batch = admin.firestore().batch();
  batch.set(inviteRef, {
    status: "declined",
    declinedAt: now,
    updatedAt: now
  }, { merge: true });

  if (noteId && sourceUserId && targetEmail) {
    batch.set(personalNoteDocRef(companyId, sourceUserId, noteId), {
      pendingCollaboratorEmails: admin.firestore.FieldValue.arrayRemove(targetEmail),
      updatedAt: now
    }, { merge: true });
  }

  await batch.commit();
  return { ok: true, status: "declined", noteId, inviteId };
});



function resolvePersonalNoteCollaboratorUserIds(companyData = {}, emails = [], excludedUid = "") {
  const excluded = String(excludedUid || "").trim();
  const wantedEmails = new Set(
    (Array.isArray(emails) ? emails : [])
      .map(normalizedPersonalNoteEmail)
      .filter(Boolean)
  );

  const resolved = new Set();

  function maybeAdd(uid = "", email = "") {
    const cleanUid = String(uid || "").trim();
    const cleanEmail = normalizedPersonalNoteEmail(email || "");
    if (!cleanUid || cleanUid === excluded) return;
    if (wantedEmails.size === 0 || wantedEmails.has(cleanEmail)) {
      resolved.add(cleanUid);
    }
  }

  maybeAdd(companyData.ownerUid || "", companyData.ownerEmail || companyData.email || "");

  const members = companyMembersMap(companyData);
  for (const [uid, member] of Object.entries(members)) {
    if (!member || typeof member !== "object" || Array.isArray(member)) continue;
    maybeAdd(uid, member.email || member.userEmail || member.memberEmail || "");
  }

  return Array.from(resolved);
}

function personalNoteMirrorPayloadForSync(note = {}, context = {}) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const payload = {
    title: cleanPersonalNoteText(note.title || "", 500),
    text: cleanPersonalNoteText(note.text || "", 20000),
    colorName: cleanPersonalNoteText(note.colorName || "default", 80) || "default",
    ownerUserId: String(note.ownerUserId || context.ownerUserId || "").trim(),
    companyId: String(context.companyId || note.companyId || "").trim(),
    sharedWith: cleanPersonalNoteStringArray(note.sharedWith || []),
    collaboratorEmails: cleanPersonalNoteStringArray(note.collaboratorEmails || []),
    isPinned: Boolean(note.isPinned),
    isArchived: Boolean(note.isArchived),
    isDeleted: Boolean(note.isDeleted),
    labels: cleanPersonalNoteStringArray(note.labels || [], 80, 160),
    links: cleanPersonalNoteStringArray(note.links || [], 80, 1000),
    manualOrder: Number.isFinite(Number(note.manualOrder)) ? Number(note.manualOrder) : Date.now(),
    updatedAt: now
  };

  if (note.createdAt && typeof note.createdAt.toDate === "function") {
    payload.createdAt = note.createdAt;
  } else if (Number.isFinite(Number(note.createdAtMillis))) {
    payload.createdAt = admin.firestore.Timestamp.fromMillis(Number(note.createdAtMillis));
  }

  if (Number.isFinite(Number(note.reminderDateMillis))) {
    payload.reminderDate = admin.firestore.Timestamp.fromMillis(Number(note.reminderDateMillis));
  } else if (note.reminderDate && typeof note.reminderDate.toDate === "function") {
    payload.reminderDate = note.reminderDate;
  }

  return payload;
}

exports.syncSharedPersonalNoteContent = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  const companyId = String(request.data?.companyId || "").trim();
  const noteId = String(request.data?.noteId || "").trim();
  const note = request.data?.note || {};

  if (!companyId || !noteId) {
    throw new HttpsError("invalid-argument", "companyId and noteId are required.");
  }

  const { companyData } = await requireNotificationWorkspaceAccess(request, companyId);
  const currentRef = personalNoteDocRef(companyId, uid, noteId);
  const currentSnap = await currentRef.get();

  if (!currentSnap.exists) {
    throw new HttpsError("not-found", "The note is not available for the signed-in user.");
  }

  const currentData = currentSnap.data() || {};
  const sharedEmails = cleanPersonalNoteStringArray([
    ...(Array.isArray(currentData.sharedWith) ? currentData.sharedWith : []),
    ...(Array.isArray(currentData.collaboratorEmails) ? currentData.collaboratorEmails : []),
    ...(Array.isArray(note.sharedWith) ? note.sharedWith : []),
    ...(Array.isArray(note.collaboratorEmails) ? note.collaboratorEmails : [])
  ]).map(normalizedPersonalNoteEmail).filter(Boolean);

  const ownerUserId = String(currentData.ownerUserId || note.ownerUserId || uid).trim();
  const mergedNote = {
    ...currentData,
    ...note,
    ownerUserId: ownerUserId || uid,
    sharedWith: sharedEmails,
    collaboratorEmails: sharedEmails
  };

  const payload = personalNoteMirrorPayloadForSync(mergedNote, {
    companyId,
    ownerUserId: ownerUserId || uid
  });

  const targetUserIds = new Set([
    uid,
    ownerUserId,
    ...resolvePersonalNoteCollaboratorUserIds(companyData, sharedEmails, "")
  ].filter(Boolean));

  const batch = admin.firestore().batch();
  for (const targetUid of targetUserIds) {
    batch.set(personalNoteDocRef(companyId, targetUid, noteId), {
      ...payload,
      userId: targetUid
    }, { merge: true });
  }

  await batch.commit();

  return {
    ok: true,
    noteId,
    syncedUserCount: targetUserIds.size
  };
});

exports.setSharedPersonalNoteEditingPresence = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  const companyId = String(request.data?.companyId || "").trim();
  const noteId = String(request.data?.noteId || "").trim();
  const isEditing = Boolean(request.data?.isEditing);

  if (!companyId || !noteId) {
    throw new HttpsError("invalid-argument", "companyId and noteId are required.");
  }

  const { companyData } = await requireNotificationWorkspaceAccess(request, companyId);
  const currentRef = personalNoteDocRef(companyId, uid, noteId);
  const currentSnap = await currentRef.get();

  if (!currentSnap.exists) {
    throw new HttpsError("not-found", "The note is not available for the signed-in user.");
  }

  const currentData = currentSnap.data() || {};
  const sharedEmails = cleanPersonalNoteStringArray([
    ...(Array.isArray(currentData.sharedWith) ? currentData.sharedWith : []),
    ...(Array.isArray(currentData.collaboratorEmails) ? currentData.collaboratorEmails : [])
  ]).map(normalizedPersonalNoteEmail).filter(Boolean);

  const ownerUserId = String(currentData.ownerUserId || uid).trim();
  const targetUserIds = new Set([
    uid,
    ownerUserId,
    ...resolvePersonalNoteCollaboratorUserIds(companyData, sharedEmails, "")
  ].filter(Boolean));

  const update = isEditing ? {
    activeEditorUserId: uid,
    activeEditorEmail: supportUserEmail(request),
    activeEditorUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
  } : {
    activeEditorUserId: "",
    activeEditorEmail: "",
    activeEditorUpdatedAt: admin.firestore.FieldValue.delete()
  };

  const batch = admin.firestore().batch();
  for (const targetUid of targetUserIds) {
    batch.set(personalNoteDocRef(companyId, targetUid, noteId), update, { merge: true });
  }

  await batch.commit();

  return {
    ok: true,
    noteId,
    isEditing,
    syncedUserCount: targetUserIds.size
  };
});


const PLAN_ENTITLEMENTS = {
  demo: {
    plan: "demo",
    displayName: "Free Demo",
    orderLimit: 5,
    customerLimit: 3,
    storageLimitMB: 50,
    teamMemberLimit: 1,
    clientFilesEnabled: false,
    shareSheetEnabled: false,
    teamAccessEnabled: false,
    messagesEnabled: false,
    chatgptAppEnabled: true,
    advancedFinanceEnabled: false,
    auditLogEnabled: false,
    multiDeviceCloudSyncEnabled: false,
    advancedDashboardEnabled: false,
    calendarRemindersEnabled: false,
    cardProfileSyncEnabled: false,
    workspaceLogoUploadEnabled: false,
    pdfExportEnabled: true,
    financialCardsEnabled: true,
    materialsInventoryCardsEnabled: false,
    historyLogEnabled: false,
    cardCustomizationEnabled: false,
    scheduleAdvancedFiltersEnabled: false,
    scheduleLongRangeEnabled: false,
    scheduleTeamViewEnabled: false,
    taskLimitPerOrder: 5
  },
  lifetime_lite: {
    plan: "lifetime_lite",
    displayName: "NivaDesk Lite",
    orderLimit: null,
    customerLimit: null,
    storageLimitMB: 250,
    teamMemberLimit: 1,
    clientFilesEnabled: false,
    shareSheetEnabled: false,
    teamAccessEnabled: false,
    messagesEnabled: false,
    chatgptAppEnabled: true,
    advancedFinanceEnabled: false,
    auditLogEnabled: false,
    multiDeviceCloudSyncEnabled: false,
    advancedDashboardEnabled: false,
    calendarRemindersEnabled: true,
    cardProfileSyncEnabled: false,
    workspaceLogoUploadEnabled: false,
    pdfExportEnabled: true,
    financialCardsEnabled: true,
    materialsInventoryCardsEnabled: true,
    historyLogEnabled: true,
    cardCustomizationEnabled: true,
    scheduleAdvancedFiltersEnabled: false,
    scheduleLongRangeEnabled: false,
    scheduleTeamViewEnabled: false,
    taskLimitPerOrder: null
  },
  pro_monthly: {
    plan: "pro_monthly",
    displayName: "NivaDesk Pro",
    orderLimit: null,
    customerLimit: null,
    storageLimitMB: 10240,
    teamMemberLimit: 1,
    clientFilesEnabled: true,
    shareSheetEnabled: true,
    teamAccessEnabled: false,
    messagesEnabled: false,
    chatgptAppEnabled: true,
    advancedFinanceEnabled: true,
    auditLogEnabled: true,
    multiDeviceCloudSyncEnabled: true,
    advancedDashboardEnabled: true,
    calendarRemindersEnabled: true,
    cardProfileSyncEnabled: false,
    workspaceLogoUploadEnabled: true,
    pdfExportEnabled: true,
    financialCardsEnabled: true,
    materialsInventoryCardsEnabled: true,
    historyLogEnabled: true,
    cardCustomizationEnabled: true,
    scheduleAdvancedFiltersEnabled: true,
    scheduleLongRangeEnabled: true,
    scheduleTeamViewEnabled: false,
    taskLimitPerOrder: null
  },
  team_monthly: {
    plan: "team_monthly",
    displayName: "NivaDesk Team",
    orderLimit: null,
    customerLimit: null,
    storageLimitMB: 51200,
    teamMemberLimit: 5,
    teamMemberIncludedSeats: 5,
    teamMemberSelfServiceMax: 10,
    additionalTeamSeatMonthlyPriceGBP: 5,
    additionalTeamSeatYearlyPriceGBP: 50,
    clientFilesEnabled: true,
    shareSheetEnabled: true,
    teamAccessEnabled: true,
    messagesEnabled: true,
    chatgptAppEnabled: true,
    advancedFinanceEnabled: true,
    auditLogEnabled: true,
    multiDeviceCloudSyncEnabled: true,
    advancedDashboardEnabled: true,
    calendarRemindersEnabled: true,
    cardProfileSyncEnabled: true,
    workspaceLogoUploadEnabled: true,
    pdfExportEnabled: true,
    financialCardsEnabled: true,
    materialsInventoryCardsEnabled: true,
    historyLogEnabled: true,
    cardCustomizationEnabled: true,
    scheduleAdvancedFiltersEnabled: true,
    scheduleLongRangeEnabled: true,
    scheduleTeamViewEnabled: true,
    taskLimitPerOrder: null
  }
};

const BILLING_ACTIONS = {
  create_order: { limitKey: "orderLimit", usageKey: "orderCount", requiredFeature: null, requiredPlan: "demo" },
  create_customer: { limitKey: "customerLimit", usageKey: "customerCount", requiredFeature: null, requiredPlan: "demo" },
  upload_client_file: { requiredFeature: "clientFilesEnabled", requiredPlan: "pro_monthly", usesStorage: true },
  rename_client_file: { requiredFeature: "clientFilesEnabled", requiredPlan: "pro_monthly" },
  delete_client_file: { requiredFeature: "clientFilesEnabled", requiredPlan: "pro_monthly" },
  import_share_sheet: { requiredFeature: "shareSheetEnabled", requiredPlan: "pro_monthly", usesStorage: true },
  upload_workspace_logo: { requiredFeature: "workspaceLogoUploadEnabled", requiredPlan: "pro_monthly", usesStorage: true },
  write_audit_log: { requiredFeature: "auditLogEnabled", requiredPlan: "pro_monthly" },
  sync_card_profile: { requiredFeature: "cardProfileSyncEnabled", requiredPlan: "team_monthly" },
  add_team_member: { requiredFeature: "teamAccessEnabled", requiredPlan: "team_monthly", limitKey: "teamMemberLimit", usageKey: "teamMemberCount" },
  schedule_team_view: { requiredFeature: "scheduleTeamViewEnabled", requiredPlan: "team_monthly" }
};

function normalizeBillingPlan(value, fallback = "demo") {
  const raw = String(value || "").trim();
  if (PLAN_ENTITLEMENTS[raw]) return raw;
  return fallback;
}

function billingPlanFromCompanyData(data = {}) {
  // Fail closed: missing or invalid billing data must never unlock paid/team features.
  return normalizeBillingPlan(data.billingPlan, "demo");
}

function billingEntitlementsForCompany(data = {}) {
  const plan = billingPlanFromCompanyData(data);
  return PLAN_ENTITLEMENTS[plan] || PLAN_ENTITLEMENTS.demo;
}

function requireMessagesEntitlement(companyData = {}) {
  const entitlements = billingEntitlementsForCompany(companyData);
  if (entitlements.messagesEnabled !== true) {
    throw new HttpsError("failed-precondition", "Messages is available on NivaDesk Team.");
  }
  return entitlements;
}

function messageRoleForUid(companyData = {}, uid = "") {
  if (uidIsCompanyOwner(companyData, uid)) return "owner";
  return normalizeWorkspaceRole(workspaceMemberRole(companyData, uid, "member"), "unknown");
}

function requireMessagesReadAccess(companyData = {}, uid = "") {
  const entitlements = requireMessagesEntitlement(companyData);
  const role = messageRoleForUid(companyData, uid);
  if (!["owner", "admin", "member", "viewOnly", "workflowOnly"].includes(role)) {
    throw new HttpsError("permission-denied", "Your workspace role cannot access Messages.");
  }
  return entitlements;
}

function requireMessagesWriteAccess(companyData = {}, uid = "") {
  const entitlements = requireMessagesEntitlement(companyData);
  const role = messageRoleForUid(companyData, uid);
  if (!["owner", "admin", "member"].includes(role)) {
    throw new HttpsError("permission-denied", "Your workspace role can read Messages but cannot change conversations or messages.");
  }
  return { entitlements, role };
}

function requireMessagesSendAccess(companyData = {}, uid = "") {
  const entitlements = requireMessagesEntitlement(companyData);
  const role = messageRoleForUid(companyData, uid);
  if (!["owner", "admin", "member", "viewOnly", "workflowOnly"].includes(role)) {
    throw new HttpsError("permission-denied", "Your workspace role cannot send messages.");
  }
  return { entitlements, role };
}

function requireMessagesConversationCreateAccess(companyData = {}, uid = "") {
  const entitlements = requireMessagesEntitlement(companyData);
  const role = messageRoleForUid(companyData, uid);
  if (!["owner", "admin", "member", "workflowOnly"].includes(role)) {
    throw new HttpsError("permission-denied", "Your workspace role cannot start or manage private conversations.");
  }
  return { entitlements, role };
}

function numericLimit(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

const TEAM_INCLUDED_SEATS = 5;
const TEAM_SELF_SERVICE_MAX_SEATS = 10;

function activeAdditionalTeamSeats(companyData = {}) {
  const rawCount = Number(companyData.billingAdditionalTeamSeatQuantity || 0);
  const status = String(companyData.billingAdditionalTeamSeatStatus || "").trim().toLowerCase();
  if (!["active", "trialing", "past_due"].includes(status)) return 0;
  if (!Number.isFinite(rawCount) || rawCount <= 0) return 0;
  return Math.min(TEAM_SELF_SERVICE_MAX_SEATS - TEAM_INCLUDED_SEATS, Math.floor(rawCount));
}

function effectiveTeamSeatLimit(entitlements = {}, companyData = {}) {
  if (String(entitlements.plan || "") !== "team_monthly") {
    return numericLimit(entitlements.teamMemberLimit) || 1;
  }
  return Math.min(
    TEAM_SELF_SERVICE_MAX_SEATS,
    TEAM_INCLUDED_SEATS + activeAdditionalTeamSeats(companyData)
  );
}

function parseClientFileSize(file = {}) {
  const size = Number(file.fileSize || file.size || file.sizeBytes || 0);
  return Number.isFinite(size) && size > 0 ? Math.round(size) : 0;
}

function companyMembersMap(data = {}) {
  return data.members && typeof data.members === "object" && !Array.isArray(data.members) ? data.members : {};
}

function companyMemberRolesMap(data = {}) {
  return data.memberRoles && typeof data.memberRoles === "object" && !Array.isArray(data.memberRoles) ? data.memberRoles : {};
}

function companyMemberCustomRolesMap(data = {}) {
  return data.memberCustomRoles && typeof data.memberCustomRoles === "object" && !Array.isArray(data.memberCustomRoles) ? data.memberCustomRoles : {};
}

function companyCustomRolesMap(data = {}) {
  return data.customRoles && typeof data.customRoles === "object" && !Array.isArray(data.customRoles) ? data.customRoles : {};
}

function workspaceIdFromCompanyData(data = {}) {
  return String(data.__workspaceId || data.id || data.companyId || "").trim();
}

function normalizeWorkspaceRole(value, fallback = "unknown") {
  const raw = String(value || "").trim();
  const compact = raw.toLowerCase().replace(/[\s_-]+/g, "");
  if (compact === "owner") return "owner";
  if (compact === "admin") return "admin";
  if (compact === "member") return "member";
  if (compact === "viewer" || compact === "viewonly" || compact === "readonly") return "viewOnly";
  if (compact === "workflow" || compact === "workflowonly") return "workflowOnly";
  if (compact === "unknown") return "unknown";
  return fallback ? normalizeWorkspaceRole(fallback, "unknown") : "unknown";
}

function workspaceRoleLabel(role) {
  switch (normalizeWorkspaceRole(role)) {
    case "owner": return "Owner";
    case "admin": return "Admin";
    case "member": return "Member";
    case "workflowOnly": return "Workflow Only";
    case "viewOnly": return "View Only";
    default: return "Unknown";
  }
}

function customRoleId(value) {
  const raw = String(value || "").trim();
  return /^custom_[A-Za-z0-9_-]{6,64}$/.test(raw) ? raw : "";
}

function customRoleData(companyData = {}, roleId = "") {
  const cleanId = customRoleId(roleId);
  if (!cleanId) return null;
  const roles = companyCustomRolesMap(companyData);
  const role = roles[cleanId];
  return role && typeof role === "object" && !Array.isArray(role) ? role : null;
}

function cleanCustomRoleName(value) {
  return cleanQuickReplyText(value, 80) || "Custom Role";
}

function workspaceMemberRoleValueFromEntry(entry, fallback = "") {
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    const customId = customRoleId(entry.customRoleId);
    if (customId) return customId;
    return String(entry.role || fallback || "").trim();
  }
  return String(entry || fallback || "").trim();
}

function storedBaseRoleForRoleValue(companyData = {}, roleValue = "") {
  const customRole = customRoleData(companyData, roleValue);
  if (customRole) return normalizeTeamRoleForStorage(customRole.baseRole || "member");
  return normalizeTeamRoleForStorage(roleValue || "member");
}

function effectiveWorkspaceRole(companyData = {}, roleValue = "", fallback = "unknown") {
  const custom = customRoleData(companyData, roleValue);
  if (custom) return normalizeWorkspaceRole(custom.baseRole || "member", "member");
  return normalizeWorkspaceRole(roleValue, fallback);
}

function workspaceMemberRoleValue(companyData = {}, uid = "", memberFallback = "member") {
  const normalizedUid = String(uid || "").trim();
  const member = companyMembersMap(companyData)[normalizedUid];
  const memberRoles = companyMemberRolesMap(companyData);
  const memberCustomRoles = companyMemberCustomRolesMap(companyData);
  const customRole = customRoleId(memberCustomRoles[normalizedUid]);
  if (customRole && customRoleData(companyData, customRole)) return customRole;
  const memberRole = member ? workspaceMemberRoleValueFromEntry(member, "") : "";
  if (memberRole) return memberRole;
  if (Object.prototype.hasOwnProperty.call(memberRoles, normalizedUid)) {
    return String(memberRoles[normalizedUid] || "").trim();
  }
  return member ? memberFallback : "";
}

function workspaceMemberRole(companyData = {}, uid = "", memberFallback = "member") {
  const roleValue = workspaceMemberRoleValue(companyData, uid, memberFallback);
  return roleValue ? effectiveWorkspaceRole(companyData, roleValue, "unknown") : "unknown";
}

function teamMemberCountFromCompanyData(data = {}) {
  const ownerUid = String(data.ownerUid || data.id || "").trim();
  const members = companyMembersMap(data);
  const memberIds = new Set(Object.keys(members).filter(Boolean));
  if (ownerUid) memberIds.add(ownerUid);
  return Math.max(1, memberIds.size);
}

function uidHasCompanyAccess(data = {}, uid = "") {
  const normalizedUid = String(uid || "").trim();
  if (!normalizedUid) return false;
  const ownerUid = String(data.ownerUid || "").trim();
  const workspaceId = workspaceIdFromCompanyData(data);
  if (normalizedUid === ownerUid) return true;
  if (workspaceId && normalizedUid === workspaceId) return true;
  const members = companyMembersMap(data);
  if (Boolean(members[normalizedUid])) return true;
  const memberRoles = companyMemberRolesMap(data);
  return Object.prototype.hasOwnProperty.call(memberRoles, normalizedUid);
}

function uidIsCompanyOwner(data = {}, uid = "") {
  const normalizedUid = String(uid || "").trim();
  const ownerUid = String(data.ownerUid || "").trim();
  const workspaceId = workspaceIdFromCompanyData(data);
  return Boolean(normalizedUid && (normalizedUid === ownerUid || (workspaceId && normalizedUid === workspaceId)));
}

const WORKSPACE_MEMBER_ACCESS_DEFAULTS = Object.freeze({
  orders: true,
  dashboard: true,
  schedule: true,
  customers: true,
  messages: true,
  notes: true,
  quickReply: true,
  settings: true,
  teamAccess: true,
  clientFiles: true,
  financialInfo: true,
  exportData: true,
  settingsGeneral: true,
  settingsPdf: true,
  settingsQuickReply: true,
  settingsMessageSettings: true,
  settingsWorkflow: true,
  settingsFinancial: true,
  settingsSafetyUploads: true,
  settingsData: true,
  settingsTeamAccess: true,
  settingsPlanAccess: true,
  settingsSupport: true,
  cardPreview: true,
  cardSummary: true,
  cardCustomer: true,
  cardMaterials: true,
  cardPriority: true,
  cardDelivery: true,
  cardNotes: true,
  cardClientFiles: true,
  cardTodo: true,
  cardWorkTime: true,
  cardFinancial: true,
  cardStatus: true,
  cardShipping: true,
  cardSchedule: true,
  cardHistoryLog: true,
  assignedProjectsOnly: false,
  manageProjectAssignments: false
});

const WORKSPACE_MEMBER_ACCESS_KEYS = Object.freeze(Object.keys(WORKSPACE_MEMBER_ACCESS_DEFAULTS));

function cleanWorkspaceMemberAccess(value = {}) {
  const output = { ...WORKSPACE_MEMBER_ACCESS_DEFAULTS };
  if (!value || typeof value !== "object" || Array.isArray(value)) return output;
  for (const key of WORKSPACE_MEMBER_ACCESS_KEYS) {
    if (typeof value[key] === "boolean") output[key] = value[key];
  }
  return output;
}

function defaultWorkspaceAccessForRole(roleValue = "member") {
  const role = normalizeWorkspaceRole(roleValue, "member");
  const access = { ...WORKSPACE_MEMBER_ACCESS_DEFAULTS };
  if (role === "workflowOnly") {
    access.dashboard = false;
    access.financialInfo = false;
    access.customers = false;
    access.teamAccess = false;
    access.cardFinancial = false;
    access.assignedProjectsOnly = true;
    access.manageProjectAssignments = false;
    access.orders = true;
    access.schedule = true;
    access.quickReply = true;
    access.clientFiles = true;
    access.cardClientFiles = true;
  }
  return access;
}

function workspaceMemberAccess(companyData = {}, uid = "") {
  const normalizedUid = String(uid || "").trim();
  if (!normalizedUid || uidIsCompanyOwner(companyData, normalizedUid)) {
    return { ...WORKSPACE_MEMBER_ACCESS_DEFAULTS };
  }

  const members = companyMembersMap(companyData);
  const member = members[normalizedUid] && typeof members[normalizedUid] === "object" && !Array.isArray(members[normalizedUid])
    ? members[normalizedUid]
    : {};
  const roleValue = workspaceMemberRoleValue(companyData, normalizedUid, "member");
  const customRole = customRoleData(companyData, roleValue);
  if (customRole) {
    return cleanWorkspaceMemberAccess(customRole.access || {});
  }
  const memberAccessMap = companyData.memberAccess && typeof companyData.memberAccess === "object" && !Array.isArray(companyData.memberAccess)
    ? companyData.memberAccess
    : {};
  const inlineAccess = member.access && typeof member.access === "object" && !Array.isArray(member.access) ? member.access : {};
  const rootAccess = memberAccessMap[normalizedUid] && typeof memberAccessMap[normalizedUid] === "object" && !Array.isArray(memberAccessMap[normalizedUid])
    ? memberAccessMap[normalizedUid]
    : {};

  const roleDefaults = defaultWorkspaceAccessForRole(roleValue);
  const merged = cleanWorkspaceMemberAccess({ ...roleDefaults, ...inlineAccess, ...rootAccess });
  if (normalizeWorkspaceRole(roleValue, "member") === "workflowOnly") {
    merged.dashboard = false;
    merged.financialInfo = false;
    merged.customers = false;
    merged.teamAccess = false;
    merged.cardFinancial = false;
    merged.assignedProjectsOnly = true;
    merged.manageProjectAssignments = false;
    merged.orders = true;
    merged.schedule = true;
    merged.quickReply = true;
    merged.clientFiles = true;
    merged.cardClientFiles = true;
  }
  return merged;
}

function accessForRoleValue(companyData = {}, roleValue = "", fallbackAccess = {}) {
  const customRole = customRoleData(companyData, roleValue);
  if (customRole) return cleanWorkspaceMemberAccess(customRole.access || {});
  const roleDefaults = defaultWorkspaceAccessForRole(roleValue);
  const access = cleanWorkspaceMemberAccess({ ...roleDefaults, ...(fallbackAccess || {}) });
  if (normalizeWorkspaceRole(roleValue, "member") === "workflowOnly") {
    access.dashboard = false;
    access.financialInfo = false;
    access.customers = false;
    access.teamAccess = false;
    access.cardFinancial = false;
    access.assignedProjectsOnly = true;
    access.manageProjectAssignments = false;
    access.orders = true;
    access.schedule = true;
    access.quickReply = true;
    access.clientFiles = true;
    access.cardClientFiles = true;
  }
  return access;
}

function uidCanAccessWorkspaceArea(companyData = {}, uid = "", area = "") {
  const key = String(area || "").trim();
  if (!WORKSPACE_MEMBER_ACCESS_KEYS.includes(key)) return false;
  return workspaceMemberAccess(companyData, uid)[key] !== false;
}

function requireWorkspaceAreaAccess(companyData = {}, uid = "", area = "", message = "This area is not enabled for your workspace account.") {
  if (!uidCanAccessWorkspaceArea(companyData, uid, area)) {
    throw new HttpsError("permission-denied", message);
  }
}

async function activeCompanyIdForUid(uid) {
  const normalizedUid = String(uid || "").trim();
  if (!normalizedUid) return "";
  try {
    const userSnap = await admin.firestore().collection("users").doc(normalizedUid).get();
    const activeCompanyId = String(userSnap.data()?.activeCompanyId || "").trim();
    return activeCompanyId || normalizedUid;
  } catch (error) {
    console.warn("Could not read active workspace for billing:", error?.message || error);
    return normalizedUid;
  }
}

async function requireWorkspaceForBilling(request, requireOwner = false) {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in to read workspace billing limits.");
  }

  const requestedCompanyId = String(request.data?.companyId || "").trim();
  const companyId = requestedCompanyId || await activeCompanyIdForUid(uid);
  if (!companyId) {
    throw new HttpsError("failed-precondition", "An active workspace is required.");
  }

  const companyRef = admin.firestore().collection("companies").doc(companyId);
  const companySnap = await companyRef.get();
  if (!companySnap.exists) {
    throw new HttpsError("not-found", "Workspace not found.");
  }

  const companyData = companySnap.data() || {};
  companyData.__workspaceId = companyId;
  if (!uidHasCompanyAccess(companyData, uid)) {
    throw new HttpsError("permission-denied", "You do not have access to this workspace.");
  }

  if (requireOwner && !uidIsCompanyOwner(companyData, uid)) {
    throw new HttpsError("permission-denied", "Only the workspace owner can run this billing action.");
  }

  return { uid, companyId, companyRef, companyData };
}

async function countCompanyCollection(collectionName, companyId) {
  const query = admin.firestore().collection(collectionName).where("companyId", "==", companyId);
  try {
    const aggregate = await query.count().get();
    return aggregate.data().count || 0;
  } catch (error) {
    console.warn(`Count aggregate failed for ${collectionName}; falling back to document count:`, error?.message || error);
    const snap = await query.select().get();
    return snap.size;
  }
}

async function calculateClientFilesStorageBytes(companyId) {
  const snap = await admin.firestore()
    .collection("siparisler")
    .where("companyId", "==", companyId)
    .select("clientFiles")
    .get();

  let total = 0;
  let fileCount = 0;
  snap.forEach((doc) => {
    const files = doc.data()?.clientFiles;
    if (!Array.isArray(files)) return;
    for (const file of files) {
      if (file?.isPendingUpload === true) continue;
      total += parseClientFileSize(file);
      fileCount += 1;
    }
  });

  return { clientFilesBytes: total, clientFilesCount: fileCount };
}

async function workspaceBillingUsage(companyId, companyData = {}) {
  const [orderCount, customerCount, fileUsage] = await Promise.all([
    countCompanyCollection("siparisler", companyId),
    countCompanyCollection("musteriler", companyId),
    calculateClientFilesStorageBytes(companyId)
  ]);

  return {
    orderCount,
    customerCount,
    teamMemberCount: teamMemberCountFromCompanyData(companyData),
    clientFilesCount: fileUsage.clientFilesCount,
    clientFilesBytes: fileUsage.clientFilesBytes,
    clientFilesMB: Math.round((fileUsage.clientFilesBytes / 1024 / 1024) * 10) / 10
  };
}

function planLimitsFromEntitlements(entitlements = {}, companyData = {}) {
  const teamMemberLimit = effectiveTeamSeatLimit(entitlements, companyData);
  return {
    orderLimit: numericLimit(entitlements.orderLimit),
    customerLimit: numericLimit(entitlements.customerLimit),
    storageLimitMB: numericLimit(entitlements.storageLimitMB) || 0,
    storageLimitBytes: (numericLimit(entitlements.storageLimitMB) || 0) * 1024 * 1024,
    teamMemberLimit,
    teamMemberIncludedSeats: String(entitlements.plan || "") === "team_monthly" ? TEAM_INCLUDED_SEATS : teamMemberLimit,
    teamMemberAdditionalSeatCount: String(entitlements.plan || "") === "team_monthly" ? activeAdditionalTeamSeats(companyData) : 0,
    teamMemberSelfServiceMax: String(entitlements.plan || "") === "team_monthly" ? TEAM_SELF_SERVICE_MAX_SEATS : teamMemberLimit,
    taskLimitPerOrder: numericLimit(entitlements.taskLimitPerOrder)
  };
}

function teamSeatLimitMessage(limits = {}) {
  const currentLimit = Number(limits.teamMemberLimit || 1);
  const maximum = Number(limits.teamMemberSelfServiceMax || TEAM_SELF_SERVICE_MAX_SEATS);
  if (currentLimit >= maximum) {
    return `This workspace has reached the self-service maximum of ${maximum} users. Contact contact@nivadesk.co.uk for a tailored plan.`;
  }
  return `This workspace has reached its current seat allowance of ${currentLimit} users. NivaDesk Team includes ${TEAM_INCLUDED_SEATS} seats; additional seats will be available for £5/month or £50/year each, up to ${maximum} users.`;
}

function publicEntitlements(entitlements = {}) {
  return { ...entitlements };
}

function actionDenied(reason, action, entitlements, usage, limits, extra = {}) {
  return {
    allowed: false,
    action,
    reason,
    plan: entitlements.plan,
    planName: entitlements.displayName,
    usage,
    limits,
    entitlements: publicEntitlements(entitlements),
    ...extra
  };
}

function actionAllowed(action, entitlements, usage, limits, extra = {}) {
  return {
    allowed: true,
    action,
    reason: "allowed",
    plan: entitlements.plan,
    planName: entitlements.displayName,
    usage,
    limits,
    entitlements: publicEntitlements(entitlements),
    ...extra
  };
}

function validateBillingAction(action, entitlements, usage, limits, data = {}) {
  const normalizedAction = String(action || "").trim();
  const config = BILLING_ACTIONS[normalizedAction];
  if (!config) {
    return actionDenied("unknown_action", normalizedAction, entitlements, usage, limits);
  }

  if (config.requiredFeature && entitlements[config.requiredFeature] !== true) {
    return actionDenied("feature_not_in_plan", normalizedAction, entitlements, usage, limits, {
      requiredFeature: config.requiredFeature,
      requiredPlan: config.requiredPlan || "pro_monthly"
    });
  }

  if (config.limitKey && config.usageKey) {
    const limit = limits[config.limitKey];
    const current = Number(usage[config.usageKey] || 0);
    if (limit !== null && limit !== undefined && current >= limit) {
      return actionDenied("plan_limit_reached", normalizedAction, entitlements, usage, limits, {
        limitKey: config.limitKey,
        usageKey: config.usageKey
      });
    }
  }

  if (config.usesStorage) {
    const incomingBytes = Math.max(0, Number(data.fileSizeBytes || data.fileSize || 0) || 0);
    const projectedBytes = Number(usage.clientFilesBytes || 0) + incomingBytes;
    if (limits.storageLimitBytes > 0 && projectedBytes > limits.storageLimitBytes) {
      return actionDenied("storage_limit_reached", normalizedAction, entitlements, usage, limits, {
        incomingBytes,
        projectedBytes,
        requiredPlan: entitlements.plan === "team_monthly" ? "team_monthly" : "pro_monthly"
      });
    }
  }

  return actionAllowed(normalizedAction, entitlements, usage, limits);
}

async function saveWorkspaceBillingUsage(companyRef, usage, entitlements, limits, source = "manual") {
  const payload = {
    ...usage,
    plan: entitlements.plan,
    planName: entitlements.displayName,
    storageLimitMB: limits.storageLimitMB,
    storageLimitBytes: limits.storageLimitBytes,
    teamMemberLimit: limits.teamMemberLimit,
    teamMemberIncludedSeats: limits.teamMemberIncludedSeats,
    teamMemberAdditionalSeatCount: limits.teamMemberAdditionalSeatCount,
    teamMemberSelfServiceMax: limits.teamMemberSelfServiceMax,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    source
  };

  await Promise.all([
    companyRef.collection("billing").doc("usage").set(payload, { merge: true }),
    companyRef.set({
      billingUsageOrderCount: usage.orderCount,
      billingUsageCustomerCount: usage.customerCount,
      billingUsageTeamMemberCount: usage.teamMemberCount,
      billingUsageClientFilesCount: usage.clientFilesCount,
      billingUsageClientFilesBytes: usage.clientFilesBytes,
      billingUsageUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true })
  ]);

  return payload;
}

exports.getWorkspacePlanUsage = onCall({ region: "europe-west2" }, async (request) => {
  const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
  const entitlements = billingEntitlementsForCompany(companyData);
  const limits = planLimitsFromEntitlements(entitlements, companyData);
  const usage = await workspaceBillingUsage(companyId, companyData);

  return {
    ok: true,
    companyId,
    plan: entitlements.plan,
    planName: entitlements.displayName,
    billingPlanSource: companyData.billingPlanSource || (companyData.billingPlan ? "workspace" : "legacy_default"),
    usage,
    limits,
    entitlements: publicEntitlements(entitlements)
  };
});

exports.validateWorkspacePlanAction = onCall({ region: "europe-west2" }, async (request) => {
  const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
  const action = String(request.data?.action || "").trim();
  const entitlements = billingEntitlementsForCompany(companyData);
  const limits = planLimitsFromEntitlements(entitlements, companyData);
  const usage = await workspaceBillingUsage(companyId, companyData);
  const result = validateBillingAction(action, entitlements, usage, limits, request.data || {});

  return {
    ok: true,
    companyId,
    ...result
  };
});

exports.recalculateWorkspacePlanUsage = onCall({ region: "europe-west2" }, async (request) => {
  const { companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, true);
  const entitlements = billingEntitlementsForCompany(companyData);
  const limits = planLimitsFromEntitlements(entitlements, companyData);
  const usage = await workspaceBillingUsage(companyId, companyData);
  const saved = await saveWorkspaceBillingUsage(companyRef, usage, entitlements, limits, "owner_recalculate");

  return {
    ok: true,
    companyId,
    plan: entitlements.plan,
    planName: entitlements.displayName,
    usage,
    limits,
    saved
  };
});




const SUPPORT_ADMIN_EMAILS = new Set(["nivadesk@gmail.com", "eggcraftco@gmail.com"]);
const SUPPORT_TICKET_CATEGORIES = new Set(["bug", "question", "billing", "feature", "account", "other"]);
const WORKSPACE_TICKET_CATEGORIES = new Set(["project", "task", "approval", "customer", "internal", "other"]);
const SUPPORT_TICKET_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
const SUPPORT_TICKET_STATUSES = new Set(["open", "inProgress", "waitingForUser", "resolved", "closed"]);

function cleanSupportText(value, maxLength = 2000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanSupportMultiline(value, maxLength = 5000) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().slice(0, maxLength);
}

function cleanSupportChoice(value, allowed, fallback) {
  const raw = String(value || "").trim();
  return allowed.has(raw) ? raw : fallback;
}

function supportUserEmail(request = {}) {
  return cleanSupportText(request.auth?.token?.email || request.data?.userEmail || "", 240).toLowerCase();
}

function isSupportAdminRequest(request = {}) {
  const email = supportUserEmail(request);
  return Boolean(email && SUPPORT_ADMIN_EMAILS.has(email));
}

function supportTimestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.getTime() : 0;
}

function supportReadByMillisMap(value = {}) {
  const output = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return output;
  for (const [uid, timestamp] of Object.entries(value)) {
    const cleanUid = String(uid || "").trim();
    if (!cleanUid) continue;
    output[cleanUid] = supportTimestampMillis(timestamp);
  }
  return output;
}

function supportLastMessagePreview(value = "") {
  return cleanSupportText(value, 180);
}


function cleanSupportAttachments(value = []) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 6).map((item) => {
    const raw = item && typeof item === "object" && !Array.isArray(item) ? item : {};
    const fileURL = cleanSupportPhotoURL(raw.fileURL || raw.url || "");
    if (!fileURL) return null;
    const fileName = cleanSupportText(raw.fileName || raw.name || "Attachment", 180) || "Attachment";
    const fileType = cleanSupportText(raw.fileType || raw.type || "application/octet-stream", 120) || "application/octet-stream";
    const fileSize = Math.max(0, Math.round(Number(raw.fileSize || raw.size || 0) || 0));
    return {
      id: cleanSupportText(raw.id || "", 120) || crypto.randomUUID(),
      fileName,
      fileURL,
      fileType,
      fileSize
    };
  }).filter(Boolean);
}

function supportMessagePreviewWithAttachments(message = "", attachments = []) {
  const preview = supportLastMessagePreview(message || "");
  if (preview) return preview;
  if (attachments.length === 1) return `Attachment: ${attachments[0].fileName || "file"}`;
  if (attachments.length > 1) return `${attachments.length} attachments`;
  return "";
}


function supportNotificationPreview(value = "", fallback = "You have a new support update.") {
  return supportLastMessagePreview(value || fallback).slice(0, 140);
}

function supportNotificationSenderName(ticketData = {}, fallback = "NivaDesk") {
  const rawName = cleanSupportText(
    ticketData.lastMessageByName ||
    ticketData.authorName ||
    ticketData.createdByName ||
    "",
    80
  );
  if (rawName && !rawName.includes("@")) return rawName;

  const rawEmail = cleanSupportText(
    ticketData.lastMessageByEmail ||
    ticketData.authorEmail ||
    ticketData.createdByEmail ||
    "",
    120
  ).toLowerCase();
  if (rawEmail && rawEmail.includes("@")) {
    const localPart = rawEmail.split("@")[0]
      .replace(/[._-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (localPart) return localPart.replace(/\w/g, (char) => char.toUpperCase()).slice(0, 80);
  }

  return cleanSupportText(fallback, 80) || "NivaDesk";
}

function supportNotificationSubject(value = "", fallback = "Support ticket") {
  return cleanSupportText(value || fallback, 90) || fallback;
}

function supportNotificationTitle(senderName = "", subject = "", action = "replied") {
  const sender = cleanSupportText(senderName, 80) || "NivaDesk";
  const cleanSubject = supportNotificationSubject(subject, "Support ticket");
  return `${sender} ${action} • ${cleanSubject}`.slice(0, 120);
}

function supportNotificationBody(senderName = "", message = "", fallback = "You have a new support update.") {
  return supportNotificationPreview(message, fallback).slice(0, 240);
}

function cleanSupportPhotoURL(value = "") {
  const url = cleanSupportText(value, 1200);
  if (!url) return "";
  if (!/^https:\/\//i.test(url)) return "";
  return url;
}

function supportPhotoURLFromCompanyData(companyData = {}, uid = "", email = "") {
  const cleanUid = String(uid || "").trim();
  const cleanEmail = String(email || "").trim().toLowerCase();
  const candidates = [];

  if (cleanUid) {
    const members = companyMembersMap(companyData);
    const member = members[cleanUid];
    if (member && typeof member === "object" && !Array.isArray(member)) {
      candidates.push(member.photoURL, member.accountPhotoURL, member.avatarURL, member.profilePhotoURL);
    }
  }

  if (cleanEmail) {
    const members = companyMembersMap(companyData);
    for (const entry of Object.values(members)) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const entryEmail = String(entry.email || entry.userEmail || "").trim().toLowerCase();
      if (entryEmail === cleanEmail) {
        candidates.push(entry.photoURL, entry.accountPhotoURL, entry.avatarURL, entry.profilePhotoURL);
      }
    }
  }

  if (cleanUid && cleanUid === String(companyData.ownerUid || "").trim()) {
    candidates.push(companyData.ownerPhotoURL, companyData.photoURL, companyData.accountPhotoURL, companyData.avatarURL);
  }

  for (const candidate of candidates) {
    const photoURL = cleanSupportPhotoURL(candidate || "");
    if (photoURL) return photoURL;
  }
  return "";
}

async function supportPhotoURLForUser(companyId = "", companyData = {}, uid = "", email = "", preferredPhotoURL = "") {
  const preferred = cleanSupportPhotoURL(preferredPhotoURL || "");
  if (preferred) return preferred;

  const fromCompany = supportPhotoURLFromCompanyData(companyData, uid, email);
  if (fromCompany) return fromCompany;

  const cleanUid = String(uid || "").trim();
  if (cleanUid) {
    try {
      const userSnap = await admin.firestore().collection("users").doc(cleanUid).get();
      const userData = userSnap.data() || {};
      const fromUser = cleanSupportPhotoURL(userData.photoURL || userData.accountPhotoURL || userData.avatarURL || userData.profilePhotoURL || "");
      if (fromUser) return fromUser;
    } catch (error) {
      console.warn("supportPhotoURLForUser users lookup failed:", error?.message || error);
    }

    try {
      const authUser = await admin.auth().getUser(cleanUid);
      const fromAuth = cleanSupportPhotoURL(authUser.photoURL || "");
      if (fromAuth) return fromAuth;
    } catch (error) {
      console.warn("supportPhotoURLForUser auth lookup failed:", error?.message || error);
    }
  }

  if (email) {
    try {
      const authUser = await admin.auth().getUserByEmail(String(email).trim().toLowerCase());
      const fromAuth = cleanSupportPhotoURL(authUser.photoURL || "");
      if (fromAuth) return fromAuth;
    } catch (error) {
      // Email may not belong to a Firebase Auth account. This is okay.
    }
  }

  return "";
}


function supportPhotoURLFromRequest(request = {}) {
  return cleanSupportPhotoURL(
    request.data?.userPhotoURL ||
    request.data?.accountPhotoURL ||
    request.data?.photoURL ||
    request.data?.senderPhotoURL ||
    ""
  );
}

async function hydrateSupportTicketMessagePhotoURLs(companyId = "", companyData = {}, messages = []) {
  const cache = new Map();
  const output = [];
  for (const message of messages) {
    const existing = cleanSupportPhotoURL(message.authorPhotoURL || "");
    if (existing) {
      output.push({ ...message, authorPhotoURL: existing });
      continue;
    }

    const uid = String(message.authorUid || "").trim();
    const email = String(message.authorEmail || "").trim().toLowerCase();
    const cacheKey = `${uid}|${email}`;
    if (!cache.has(cacheKey)) {
      cache.set(cacheKey, await supportPhotoURLForUser(companyId, companyData, uid, email));
    }
    output.push({ ...message, authorPhotoURL: cache.get(cacheKey) || "" });
  }
  return output;
}

async function supportCompanyDataForId(companyId = "") {
  const cleanCompanyId = String(companyId || "").trim();
  if (!cleanCompanyId) return {};
  try {
    const snap = await admin.firestore().collection("companies").doc(cleanCompanyId).get();
    return snap.data() || {};
  } catch (error) {
    console.warn("supportCompanyDataForId failed:", error?.message || error);
    return {};
  }
}

function supportTicketIsUnreadForUid(ticketData = {}, uid = "") {
  const cleanUid = String(uid || "").trim();
  if (!cleanUid) return false;
  const lastMessageAt = supportTimestampMillis(ticketData.lastMessageAt);
  const lastReadAt = supportTimestampMillis((ticketData.readBy || {})[cleanUid]);
  const lastMessageByUid = String(ticketData.lastMessageByUid || "").trim();
  return Boolean(lastMessageAt > 0 && lastMessageAt > lastReadAt && lastMessageByUid !== cleanUid);
}

function supportTicketFromDoc(doc, ticketType = "appSupport", currentUid = "") {
  const data = doc.data() || {};
  return {
    id: doc.id,
    ticketType: String(data.ticketType || data.type || ticketType),
    companyId: String(data.companyId || ""),
    companyName: String(data.companyName || ""),
    createdByUid: String(data.createdByUid || ""),
    createdByEmail: String(data.createdByEmail || ""),
    createdByName: String(data.createdByName || ""),
    title: String(data.title || ""),
    message: String(data.message || ""),
    category: String(data.category || "other"),
    priority: String(data.priority || "normal"),
    status: String(data.status || "open"),
    platform: String(data.platform || "mac"),
    appVersion: String(data.appVersion || ""),
    deviceInfo: String(data.deviceInfo || ""),
    language: String(data.language || "English"),
    createdAtMillis: supportTimestampMillis(data.createdAt),
    updatedAtMillis: supportTimestampMillis(data.updatedAt),
    lastMessageAtMillis: supportTimestampMillis(data.lastMessageAt),
    lastMessageByUid: String(data.lastMessageByUid || ""),
    lastMessageByEmail: String(data.lastMessageByEmail || ""),
    lastMessageByRole: String(data.lastMessageByRole || ""),
    lastMessagePreview: String(data.lastMessagePreview || ""),
    assignedToUid: String(data.assignedToUid || ""),
    assignedToName: String(data.assignedToName || ""),
    assignedToEmail: String(data.assignedToEmail || ""),
    assignedByUid: String(data.assignedByUid || ""),
    assignedByName: String(data.assignedByName || ""),
    assignedByEmail: String(data.assignedByEmail || ""),
    assignedAtMillis: supportTimestampMillis(data.assignedAt),
    readByMillis: supportReadByMillisMap(data.readBy || {}),
    isUnread: supportTicketIsUnreadForUid(data, currentUid)
  };
}

function baseSupportPayload(request, companyId, companyData, ticketType, allowedCategories) {
  const uid = request.auth?.uid;
  const title = cleanSupportText(request.data?.title, 160);
  const message = cleanSupportMultiline(request.data?.message, 5000);

  if (!title || !message) {
    throw new HttpsError("invalid-argument", "Please add a subject and message.");
  }

  const companyName = cleanSupportText(
    request.data?.companyName || companyData.companyName || companyData.name || companyData.businessName || "",
    160
  );
  const createdByEmail = supportUserEmail(request);
  const createdByName = cleanSupportText(request.auth?.token?.name || request.data?.userName || createdByEmail || uid, 160);
  const platform = cleanSupportChoice(request.data?.platform, new Set(["mac", "web", "android", "ios", "unknown"]), "mac");

  return {
    ticketType,
    companyId,
    companyName,
    createdByUid: uid,
    createdByEmail,
    createdByName,
    createdByPhotoURL: "",
    title,
    message,
    category: cleanSupportChoice(request.data?.category, allowedCategories, "other"),
    priority: cleanSupportChoice(request.data?.priority, SUPPORT_TICKET_PRIORITIES, "normal"),
    status: "open",
    platform,
    appVersion: cleanSupportText(request.data?.appVersion, 80),
    deviceInfo: cleanSupportText(request.data?.deviceInfo, 240),
    language: cleanSupportText(request.data?.language || "English", 80),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
    lastMessageByUid: uid,
    lastMessageByEmail: createdByEmail,
    lastMessageByName: createdByName,
    lastMessageByRole: "user",
    lastMessagePreview: supportLastMessagePreview(message),
    readBy: {
      [uid]: admin.firestore.FieldValue.serverTimestamp()
    },
    source: "callable",
    supportSchemaVersion: 2
  };
}

exports.createSupportTicket = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in to send a support ticket.");
  }

  const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
  const ticketRef = admin.firestore().collection("supportTickets").doc();
  const payload = baseSupportPayload(request, companyId, companyData, "appSupport", SUPPORT_TICKET_CATEGORIES);
  payload.createdByPhotoURL = await supportPhotoURLForUser(companyId, companyData, uid, payload.createdByEmail, payload.createdByPhotoURL);
  payload.lastMessageByPhotoURL = payload.createdByPhotoURL;
  payload.supportAdminEmails = Array.from(SUPPORT_ADMIN_EMAILS);
  payload.shareWithWorkspaceOwner = request.data?.shareWithWorkspaceOwner === true;

  await ticketRef.set(payload);
  await safeSupportNotification("notifySupportAdminsForTicket(createSupportTicket)", () =>
    notifySupportAdminsForTicket(companyId, ticketRef.id, payload, "new_ticket")
  );
  return { ok: true, ticketId: ticketRef.id, message: "Ticket sent. We will review it as soon as possible." };
});

exports.listMySupportTickets = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in to read support tickets.");
  }

  const { companyId } = await requireWorkspaceForBilling(request, false);
  const query = isSupportAdminRequest(request)
    ? admin.firestore().collection("supportTickets").limit(200)
    : admin.firestore().collection("supportTickets").where("companyId", "==", companyId).where("createdByUid", "==", uid).limit(100);
  const snapshot = await query.get();

  const tickets = snapshot.docs
    .map((doc) => supportTicketFromDoc(doc, "appSupport", uid))
    .sort((a, b) => Number(b.lastMessageAtMillis || b.createdAtMillis || 0) - Number(a.lastMessageAtMillis || a.createdAtMillis || 0));

  return { ok: true, tickets, isSupportAdmin: isSupportAdminRequest(request) };
});

exports.createWorkspaceTicket = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in to send a workspace ticket.");
  }

  const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
  const ticketRef = admin.firestore().collection("companies").doc(companyId).collection("workspaceTickets").doc();
  const payload = baseSupportPayload(request, companyId, companyData, "workspace", WORKSPACE_TICKET_CATEGORIES);
  payload.createdByPhotoURL = await supportPhotoURLForUser(companyId, companyData, uid, payload.createdByEmail, payload.createdByPhotoURL);
  payload.lastMessageByPhotoURL = payload.createdByPhotoURL;
  payload.targetRole = "owner_admin";

  await ticketRef.set(payload);
  await safeSupportNotification("notifyWorkspaceTicketRecipients(createWorkspaceTicket)", () =>
    notifyWorkspaceTicketRecipients(companyId, companyData, ticketRef.id, payload, uid, "new_ticket", payload.message)
  );
  return { ok: true, ticketId: ticketRef.id, message: "Workspace ticket sent to the workspace owner." };
});


exports.getWorkspaceSupportManagers = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in to read support managers.");
  }

  const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
  const role = normalizeWorkspaceRole(workspaceMemberRole(companyData, uid, "member"), "member");
  const canManageSupportManagers = uidIsCompanyOwner(companyData, uid) || role === "admin";
  const settings = await workspaceSupportSettings(companyId);
  const supportManagerUids = cleanSupportManagerUidList(settings.supportManagerUids || settings.managerUids || []);
  const supportManagerEmails = cleanSupportManagerEmailList(settings.supportManagerEmails || settings.managerEmails || []);
  const isSupportManager = isWorkspaceSupportManagerFromSettings({ supportManagerUids, supportManagerEmails }, request);

  return {
    ok: true,
    companyId,
    supportManagerUids,
    supportManagerEmails,
    canManageSupportManagers,
    isSupportManager
  };
});

exports.setWorkspaceSupportManagers = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in to manage support managers.");
  }

  const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
  const role = normalizeWorkspaceRole(workspaceMemberRole(companyData, uid, "member"), "member");
  if (!uidIsCompanyOwner(companyData, uid) && role !== "admin") {
    throw new HttpsError("permission-denied", "Only the workspace owner or admins can manage support managers.");
  }

  const supportManagerUids = cleanSupportManagerUidList(request.data?.supportManagerUids || []);
  const supportManagerEmails = cleanSupportManagerEmailList(request.data?.supportManagerEmails || []);
  await supportSettingsDocRef(companyId).set({
    supportManagerUids,
    supportManagerEmails,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedByUid: uid,
    updatedByEmail: supportUserEmail(request),
    supportSchemaVersion: 2
  }, { merge: true });

  return {
    ok: true,
    companyId,
    supportManagerUids,
    supportManagerEmails,
    canManageSupportManagers: true,
    isSupportManager: isWorkspaceSupportManagerFromSettings({ supportManagerUids, supportManagerEmails }, request)
  };
});

exports.listWorkspaceTickets = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in to read workspace tickets.");
  }

  const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
  const canSeeWorkspaceQueue = await canManageWorkspaceSupportQueue(companyId, companyData, request);
  const collection = admin.firestore().collection("companies").doc(companyId).collection("workspaceTickets");
  const query = canSeeWorkspaceQueue ? collection.limit(200) : collection.where("createdByUid", "==", uid).limit(100);
  const snapshot = await query.get();

  const tickets = snapshot.docs
    .map((doc) => supportTicketFromDoc(doc, "workspace", uid))
    .sort((a, b) => Number(b.lastMessageAtMillis || b.createdAtMillis || 0) - Number(a.lastMessageAtMillis || a.createdAtMillis || 0));

  return { ok: true, tickets, canSeeWorkspaceQueue };
});

exports.updateSupportTicketStatus = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in to update support tickets.");
  }

  if (!isSupportAdminRequest(request)) {
    throw new HttpsError("permission-denied", "Only NivaDesk support admins can update app support ticket status.");
  }

  const ticketId = cleanSupportText(request.data?.ticketId, 160);
  if (!ticketId) {
    throw new HttpsError("invalid-argument", "ticketId is required.");
  }

  const status = cleanSupportChoice(request.data?.status, SUPPORT_TICKET_STATUSES, "open");
  const ticketRef = admin.firestore().collection("supportTickets").doc(ticketId);
  const ticketSnap = await ticketRef.get();
  if (!ticketSnap.exists) {
    throw new HttpsError("not-found", "Support ticket not found.");
  }

  await ticketRef.set({
    status,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastStatusChangedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastStatusChangedByUid: uid,
    lastStatusChangedByEmail: supportUserEmail(request)
  }, { merge: true });

  return { ok: true, ticketId, status, message: "NivaDesk support ticket status updated." };
});

exports.updateWorkspaceTicketStatus = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in to update workspace tickets.");
  }

  const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
  const canManageWorkspaceQueue = await canManageWorkspaceSupportQueue(companyId, companyData, request);
  if (!canManageWorkspaceQueue) {
    throw new HttpsError("permission-denied", "Only the workspace owner, admins or support managers can update workspace ticket status.");
  }

  const ticketId = cleanSupportText(request.data?.ticketId, 160);
  if (!ticketId) {
    throw new HttpsError("invalid-argument", "ticketId is required.");
  }

  const status = cleanSupportChoice(request.data?.status, SUPPORT_TICKET_STATUSES, "open");
  const ticketRef = admin.firestore().collection("companies").doc(companyId).collection("workspaceTickets").doc(ticketId);
  const ticketSnap = await ticketRef.get();
  if (!ticketSnap.exists) {
    throw new HttpsError("not-found", "Workspace ticket not found.");
  }

  const oldStatus = String((ticketSnap.data() || {}).status || "open");
  await ticketRef.set({
    status,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastStatusChangedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastStatusChangedByUid: uid,
    lastStatusChangedByEmail: supportUserEmail(request)
  }, { merge: true });

  if (oldStatus !== status) {
    const actorName = cleanSupportText(request.auth?.token?.name || supportUserEmail(request) || uid, 120);
    await addWorkspaceTicketSystemMessage(companyId, ticketId, `${actorName} changed status from ${oldStatus} to ${status}.`);
  }

  return { ok: true, ticketId, status, message: "Workspace ticket status updated." };
});




function supportTicketMessageFromDoc(doc, ticketId = "") {
  const data = doc.data() || {};
  const toMillis = (value) => {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.toDate === "function") return value.toDate().getTime();
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.getTime() : 0;
  };
  return {
    id: doc.id,
    ticketId: String(data.ticketId || ticketId || ""),
    message: String(data.message || ""),
    authorUid: String(data.authorUid || ""),
    authorEmail: String(data.authorEmail || ""),
    authorName: String(data.authorName || ""),
    authorPhotoURL: String(data.authorPhotoURL || data.authorAvatarURL || data.senderPhotoURL || ""),
    authorRole: String(data.authorRole || "user"),
    attachments: cleanSupportAttachments(data.attachments || []),
    createdAtMillis: toMillis(data.createdAt)
  };
}

function supportTicketInitialMessage(ticketId = "", ticketData = {}, ticketType = "workspace") {
  const toMillis = (value) => {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.toDate === "function") return value.toDate().getTime();
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.getTime() : 0;
  };
  return {
    id: "initial",
    ticketId,
    message: String(ticketData.message || ""),
    authorUid: String(ticketData.createdByUid || ""),
    authorEmail: String(ticketData.createdByEmail || ""),
    authorName: String(ticketData.createdByName || ticketData.createdByEmail || ""),
    authorPhotoURL: String(ticketData.createdByPhotoURL || ticketData.authorPhotoURL || ""),
    authorRole: "user",
    attachments: cleanSupportAttachments(ticketData.attachments || []),
    createdAtMillis: toMillis(ticketData.createdAt)
  };
}

function supportAuthorPayload(request = {}, authorRole = "user") {
  const uid = request.auth?.uid || "";
  const email = supportUserEmail(request);
  return {
    authorUid: uid,
    authorEmail: email,
    authorName: cleanSupportText(request.auth?.token?.name || request.data?.userName || email || uid, 160),
    authorPhotoURL: supportPhotoURLFromRequest(request),
    authorRole
  };
}

function canAccessAppSupportTicket(ticketData = {}, request = {}) {
  const uid = request.auth?.uid || "";
  return isSupportAdminRequest(request) || String(ticketData.createdByUid || "") === uid;
}

function canReplyAppSupportTicket(ticketData = {}, request = {}) {
  return canAccessAppSupportTicket(ticketData, request);
}

function canReplyWorkspaceTicket(ticketData = {}, companyData = {}, request = {}) {
  const uid = request.auth?.uid || "";
  if (String(ticketData.createdByUid || "") === uid) return true;
  const role = normalizeWorkspaceRole(workspaceMemberRole(companyData, uid, "member"), "member");
  return uidIsCompanyOwner(companyData, uid) || role === "admin";
}

function supportCallableInternalError(label, error) {
  if (error instanceof HttpsError) return error;
  const message = error?.message || String(error || "Unknown support ticket error.");
  console.error(label, error);
  return new HttpsError("internal", `${label}: ${message}`, { label, message });
}

exports.listSupportTicketMessages = onCall({ region: "europe-west2" }, async (request) => {
  try {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "You must be signed in to read ticket messages.");
    }

    const ticketId = cleanSupportText(request.data?.ticketId, 160);
    if (!ticketId) {
      throw new HttpsError("invalid-argument", "ticketId is required.");
    }

    const ticketRef = admin.firestore().collection("supportTickets").doc(ticketId);
    const ticketSnap = await ticketRef.get();
    if (!ticketSnap.exists) {
      throw new HttpsError("not-found", "Support ticket not found.");
    }

    const ticketData = ticketSnap.data() || {};
    if (!canAccessAppSupportTicket(ticketData, request)) {
      throw new HttpsError("permission-denied", "You do not have access to this support ticket.");
    }

    const snapshot = await ticketRef.collection("messages").orderBy("createdAt", "asc").limit(200).get();
    const rawMessages = snapshot.docs.map((doc) => supportTicketMessageFromDoc(doc, ticketId));
    if (rawMessages.length === 0 && ticketData.message) {
      rawMessages.push(supportTicketInitialMessage(ticketId, ticketData, "appSupport"));
    }
    const supportCompanyData = await supportCompanyDataForId(String(ticketData.companyId || ""));
    const messages = await hydrateSupportTicketMessagePhotoURLs(String(ticketData.companyId || ""), supportCompanyData, rawMessages);

    return { ok: true, ticketId, messages };
  } catch (error) {
    throw supportCallableInternalError("listSupportTicketMessages", error);
  }
});

exports.addSupportTicketReply = onCall({ region: "europe-west2" }, async (request) => {
  try {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "You must be signed in to reply to support tickets.");
    }

    const ticketId = cleanSupportText(request.data?.ticketId, 160);
    const message = cleanSupportMultiline(request.data?.message, 5000);
    const attachments = cleanSupportAttachments(request.data?.attachments || []);
    const suppressNotification = request.data?.suppressNotification === true;
    if (!ticketId || (!message && attachments.length === 0)) {
      throw new HttpsError("invalid-argument", "ticketId and message or attachments are required.");
    }

    const ticketRef = admin.firestore().collection("supportTickets").doc(ticketId);
    const ticketSnap = await ticketRef.get();
    if (!ticketSnap.exists) {
      throw new HttpsError("not-found", "Support ticket not found.");
    }

    const ticketData = ticketSnap.data() || {};
    if (!canReplyAppSupportTicket(ticketData, request)) {
      throw new HttpsError("permission-denied", "You do not have access to reply to this support ticket.");
    }

    const isAdmin = isSupportAdminRequest(request);
    const messageRef = ticketRef.collection("messages").doc();
    const currentStatus = String(ticketData.status || "open");
    const nextStatus = isAdmin ? "waitingForUser" : (["resolved", "closed"].includes(currentStatus) ? "open" : currentStatus);
    const payload = {
      ticketId,
      message,
      attachments,
      ...supportAuthorPayload(request, isAdmin ? "supportAdmin" : "user"),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      source: "callable",
      supportSchemaVersion: 2
    };
    const supportCompanyData = await supportCompanyDataForId(String(ticketData.companyId || ""));
    payload.authorPhotoURL = await supportPhotoURLForUser(String(ticketData.companyId || ""), supportCompanyData, uid, payload.authorEmail, payload.authorPhotoURL);

    const batch = admin.firestore().batch();
    batch.set(messageRef, payload);
    batch.set(ticketRef, {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageByUid: uid,
      lastMessageByEmail: supportUserEmail(request),
      lastMessageByRole: isAdmin ? "supportAdmin" : "user",
      lastMessageByName: payload.authorName,
      lastMessageByPhotoURL: payload.authorPhotoURL || "",
      lastMessagePreview: supportMessagePreviewWithAttachments(message, attachments),
      status: nextStatus
    }, { merge: true });
    await batch.commit();

    if (!suppressNotification) {
      await safeSupportNotification("support ticket reply notification", () => {
        const nextTicketData = {
          ...ticketData,
          status: nextStatus,
          lastMessagePreview: supportMessagePreviewWithAttachments(message, attachments),
          lastMessageByUid: uid,
          lastMessageByEmail: supportUserEmail(request),
          lastMessageByRole: isAdmin ? "supportAdmin" : "user",
          lastMessageByName: payload.authorName,
          lastMessageByPhotoURL: payload.authorPhotoURL || ""
        };
        return isAdmin
          ? notifySupportTicketCreator(String(ticketData.companyId || ""), ticketId, nextTicketData, message)
          : notifySupportAdminsForTicket(String(ticketData.companyId || ""), ticketId, nextTicketData, "reply");
      });
    }

    return { ok: true, ticketId, messageId: messageRef.id, status: nextStatus, message: "Reply sent." };
  } catch (error) {
    throw supportCallableInternalError("addSupportTicketReply", error);
  }
});

exports.listWorkspaceTicketMessages = onCall({ region: "europe-west2" }, async (request) => {
  try {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "You must be signed in to read workspace ticket messages.");
    }

    const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
    const ticketId = cleanSupportText(request.data?.ticketId, 160);
    if (!ticketId) {
      throw new HttpsError("invalid-argument", "ticketId is required.");
    }

    const ticketRef = admin.firestore().collection("companies").doc(companyId).collection("workspaceTickets").doc(ticketId);
    const ticketSnap = await ticketRef.get();
    if (!ticketSnap.exists) {
      throw new HttpsError("not-found", "Workspace ticket not found.");
    }

    const ticketData = ticketSnap.data() || {};
    if (!(await canAccessWorkspaceTicket(ticketData, companyId, companyData, request))) {
      throw new HttpsError("permission-denied", "You do not have access to this workspace ticket.");
    }

    const snapshot = await ticketRef.collection("messages").orderBy("createdAt", "asc").limit(200).get();
    const rawMessages = snapshot.docs.map((doc) => supportTicketMessageFromDoc(doc, ticketId));
    if (rawMessages.length === 0 && ticketData.message) {
      rawMessages.push(supportTicketInitialMessage(ticketId, ticketData, "workspace"));
    }
    const messages = await hydrateSupportTicketMessagePhotoURLs(companyId, companyData, rawMessages);

    return { ok: true, ticketId, messages };
  } catch (error) {
    throw supportCallableInternalError("listWorkspaceTicketMessages", error);
  }
});

exports.addWorkspaceTicketReply = onCall({ region: "europe-west2" }, async (request) => {
  try {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "You must be signed in to reply to workspace tickets.");
    }

    const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
    const ticketId = cleanSupportText(request.data?.ticketId, 160);
    const message = cleanSupportMultiline(request.data?.message, 5000);
    const attachments = cleanSupportAttachments(request.data?.attachments || []);
    if (!ticketId || (!message && attachments.length === 0)) {
      throw new HttpsError("invalid-argument", "ticketId and message or attachments are required.");
    }

    const ticketRef = admin.firestore().collection("companies").doc(companyId).collection("workspaceTickets").doc(ticketId);
    const ticketSnap = await ticketRef.get();
    if (!ticketSnap.exists) {
      throw new HttpsError("not-found", "Workspace ticket not found.");
    }

    const ticketData = ticketSnap.data() || {};
    if (!(await canAccessWorkspaceTicket(ticketData, companyId, companyData, request))) {
      throw new HttpsError("permission-denied", "You do not have access to reply to this workspace ticket.");
    }

    const isManager = await canManageWorkspaceSupportQueue(companyId, companyData, request);
    const messageRef = ticketRef.collection("messages").doc();
    const currentStatus = String(ticketData.status || "open");
    const nextStatus = isManager ? "waitingForUser" : (["resolved", "closed"].includes(currentStatus) ? "open" : currentStatus);
    const payload = {
      ticketId,
      message,
      attachments,
      ...supportAuthorPayload(request, isManager ? "workspaceAdmin" : "user"),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      source: "callable",
      supportSchemaVersion: 2
    };
    payload.authorPhotoURL = await supportPhotoURLForUser(companyId, companyData, uid, payload.authorEmail, payload.authorPhotoURL);

    const batch = admin.firestore().batch();
    batch.set(messageRef, payload);
    batch.set(ticketRef, {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageByUid: uid,
      lastMessageByEmail: supportUserEmail(request),
      lastMessageByRole: isManager ? "workspaceAdmin" : "user",
      lastMessageByName: payload.authorName,
      lastMessageByPhotoURL: payload.authorPhotoURL || "",
      lastMessagePreview: supportMessagePreviewWithAttachments(message, attachments),
      status: nextStatus
    }, { merge: true });
    await batch.commit();

    if (!suppressNotification) {
      await safeSupportNotification("workspace ticket reply notification", () => {
        const nextTicketData = {
          ...ticketData,
          status: nextStatus,
          lastMessagePreview: supportMessagePreviewWithAttachments(message, attachments),
          lastMessageByUid: uid,
          lastMessageByEmail: supportUserEmail(request),
          lastMessageByRole: isManager ? "workspaceAdmin" : "user",
          lastMessageByName: payload.authorName,
          lastMessageByPhotoURL: payload.authorPhotoURL || ""
        };
        return notifyWorkspaceTicketRecipients(companyId, companyData, ticketId, nextTicketData, uid, "reply", message);
      });
    }

    return { ok: true, ticketId, messageId: messageRef.id, status: nextStatus, message: "Reply sent." };
  } catch (error) {
    throw supportCallableInternalError("addWorkspaceTicketReply", error);
  }
});




async function addWorkspaceTicketSystemMessage(companyId, ticketId, message) {
  const cleanCompanyId = cleanSupportText(companyId, 160);
  const cleanTicketId = cleanSupportText(ticketId, 160);
  const cleanMessage = cleanSupportText(message, 500);
  if (!cleanCompanyId || !cleanTicketId || !cleanMessage) return { ok: false, reason: "missing_parameters" };

  const messageRef = admin.firestore()
    .collection("companies")
    .doc(cleanCompanyId)
    .collection("workspaceTickets")
    .doc(cleanTicketId)
    .collection("messages")
    .doc();

  await messageRef.set({
    ticketId: cleanTicketId,
    message: cleanMessage,
    authorUid: "system",
    authorEmail: "",
    authorName: "System",
    authorPhotoURL: "",
    authorRole: "system",
    attachments: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    source: "system",
    supportSchemaVersion: 2
  });

  return { ok: true, messageId: messageRef.id };
}


exports.assignWorkspaceTicket = onCall({ region: "europe-west2" }, async (request) => {
  try {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "You must be signed in to assign workspace tickets.");
    }

    const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
    const canManageWorkspaceQueue = await canManageWorkspaceSupportQueue(companyId, companyData, request);
    if (!canManageWorkspaceQueue) {
      throw new HttpsError("permission-denied", "Only the workspace owner, admins or support managers can assign workspace tickets.");
    }

    const ticketId = cleanSupportText(request.data?.ticketId, 160);
    if (!ticketId) {
      throw new HttpsError("invalid-argument", "ticketId is required.");
    }

    const ticketRef = admin.firestore().collection("companies").doc(companyId).collection("workspaceTickets").doc(ticketId);
    const ticketSnap = await ticketRef.get();
    if (!ticketSnap.exists) {
      throw new HttpsError("not-found", "Workspace ticket not found.");
    }

    const assignedToUid = cleanSupportText(request.data?.assignedToUid || "", 160);
    const assignedToEmail = cleanSupportText(request.data?.assignedToEmail || "", 240).toLowerCase();
    const assignedToName = cleanSupportText(request.data?.assignedToName || assignedToEmail || assignedToUid || "", 160);

    if (!assignedToUid && !assignedToEmail) {
      const previousAssignee = cleanSupportText((ticketSnap.data() || {}).assignedToName || (ticketSnap.data() || {}).assignedToEmail || "", 160);
      await ticketRef.set({
        assignedToUid: admin.firestore.FieldValue.delete(),
        assignedToEmail: admin.firestore.FieldValue.delete(),
        assignedToName: admin.firestore.FieldValue.delete(),
        assignedAt: admin.firestore.FieldValue.delete(),
        assignedByUid: admin.firestore.FieldValue.delete(),
        assignedByEmail: admin.firestore.FieldValue.delete(),
        assignedByName: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        assignmentUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      const actorName = cleanSupportText(request.auth?.token?.name || supportUserEmail(request) || uid, 120);
      await addWorkspaceTicketSystemMessage(companyId, ticketId, previousAssignee ? `${actorName} unassigned this ticket from ${previousAssignee}.` : `${actorName} unassigned this ticket.`);

      return { ok: true, ticketId, assigned: false, message: "Ticket unassigned." };
    }

    const canAssignTarget = await canAssignWorkspaceTicketTo(companyId, companyData, {
      uid: assignedToUid,
      email: assignedToEmail
    });
    if (!canAssignTarget) {
      throw new HttpsError("permission-denied", "Tickets can only be assigned to the owner, admins or support managers.");
    }

    const assignerName = cleanSupportText(request.auth?.token?.name || supportUserEmail(request) || uid, 160);
    await ticketRef.set({
      assignedToUid,
      assignedToEmail,
      assignedToName,
      assignedAt: admin.firestore.FieldValue.serverTimestamp(),
      assignedByUid: uid,
      assignedByEmail: supportUserEmail(request),
      assignedByName: assignerName,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      assignmentUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await addWorkspaceTicketSystemMessage(companyId, ticketId, `${assignerName} assigned this ticket to ${assignedToName}.`);

    if (assignedToUid !== uid || (assignedToEmail && assignedToEmail !== supportUserEmail(request))) {
      await safeSupportNotification("workspace ticket assigned notification", () =>
        writeSupportTicketNotification(companyId, {
          type: "workspace_ticket_assigned",
          title: "Ticket assigned to you",
          message: `${assignerName} assigned you: ${cleanSupportText((ticketSnap.data() || {}).title || "Workspace ticket", 120)}`,
          ticketId,
          ticketType: "workspace",
          ticketTitle: (ticketSnap.data() || {}).title || "",
          route: "supportTicket",
          senderUid: uid,
          senderEmail: supportUserEmail(request),
          senderName: assignerName,
          senderPhotoURL: supportPhotoURLFromRequest(request),
          priority: (ticketSnap.data() || {}).priority || "",
          status: (ticketSnap.data() || {}).status || ""
        }, {
          userIds: assignedToUid ? [assignedToUid] : [],
          emails: assignedToEmail ? [assignedToEmail] : []
        })
      );
    }

    return {
      ok: true,
      ticketId,
      assigned: true,
      assignedToUid,
      assignedToEmail,
      assignedToName,
      message: "Ticket assigned."
    };
  } catch (error) {
    throw supportCallableInternalError("assignWorkspaceTicket", error);
  }
});


exports.markSupportTicketRead = onCall({ region: "europe-west2" }, async (request) => {
  try {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "You must be signed in to mark support tickets as read.");
    }

    const ticketId = cleanSupportText(request.data?.ticketId, 160);
    if (!ticketId) {
      throw new HttpsError("invalid-argument", "ticketId is required.");
    }

    const ticketRef = admin.firestore().collection("supportTickets").doc(ticketId);
    const ticketSnap = await ticketRef.get();
    if (!ticketSnap.exists) {
      throw new HttpsError("not-found", "Support ticket not found.");
    }

    const ticketData = ticketSnap.data() || {};
    if (!canAccessAppSupportTicket(ticketData, request)) {
      throw new HttpsError("permission-denied", "You do not have access to this support ticket.");
    }

    await ticketRef.set({
      [`readBy.${uid}`]: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return { ok: true, ticketId, message: "Ticket marked as read." };
  } catch (error) {
    throw supportCallableInternalError("markSupportTicketRead", error);
  }
});

exports.markWorkspaceTicketRead = onCall({ region: "europe-west2" }, async (request) => {
  try {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "You must be signed in to mark workspace tickets as read.");
    }

    const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
    const ticketId = cleanSupportText(request.data?.ticketId, 160);
    if (!ticketId) {
      throw new HttpsError("invalid-argument", "ticketId is required.");
    }

    const ticketRef = admin.firestore().collection("companies").doc(companyId).collection("workspaceTickets").doc(ticketId);
    const ticketSnap = await ticketRef.get();
    if (!ticketSnap.exists) {
      throw new HttpsError("not-found", "Workspace ticket not found.");
    }

    const ticketData = ticketSnap.data() || {};
    if (!(await canAccessWorkspaceTicket(ticketData, companyId, companyData, request))) {
      throw new HttpsError("permission-denied", "You do not have access to this workspace ticket.");
    }

    await ticketRef.set({
      [`readBy.${uid}`]: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return { ok: true, ticketId, message: "Workspace ticket marked as read." };
  } catch (error) {
    throw supportCallableInternalError("markWorkspaceTicketRead", error);
  }
});

exports.getSupportTicketUnreadSummary = onCall({ region: "europe-west2" }, async (request) => {
  try {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "You must be signed in to read support ticket unread counts.");
    }

    const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
    const appQuery = isSupportAdminRequest(request)
      ? admin.firestore().collection("supportTickets").limit(200)
      : admin.firestore().collection("supportTickets").where("companyId", "==", companyId).where("createdByUid", "==", uid).limit(100);

    const canSeeWorkspaceQueue = await canManageWorkspaceSupportQueue(companyId, companyData, request);
    const workspaceCollection = admin.firestore().collection("companies").doc(companyId).collection("workspaceTickets");
    const workspaceQuery = canSeeWorkspaceQueue ? workspaceCollection.limit(200) : workspaceCollection.where("createdByUid", "==", uid).limit(100);

    const [appSnap, workspaceSnap] = await Promise.all([appQuery.get(), workspaceQuery.get()]);
    const unreadSupportTicketIds = appSnap.docs
      .filter((doc) => supportTicketIsUnreadForUid(doc.data() || {}, uid))
      .map((doc) => doc.id);
    const unreadWorkspaceTicketIds = workspaceSnap.docs
      .filter((doc) => supportTicketIsUnreadForUid(doc.data() || {}, uid))
      .map((doc) => doc.id);
    const supportUnread = unreadSupportTicketIds.length;
    const workspaceUnread = unreadWorkspaceTicketIds.length;

    return {
      ok: true,
      companyId,
      supportUnread,
      appSupportUnread: supportUnread,
      workspaceUnread,
      totalUnread: supportUnread + workspaceUnread,
      unreadSupportTicketIds,
      unreadWorkspaceTicketIds,
      supportTicketIds: unreadSupportTicketIds,
      workspaceTicketIds: unreadWorkspaceTicketIds
    };
  } catch (error) {
    throw supportCallableInternalError("getSupportTicketUnreadSummary", error);
  }
});


const { createStripeBillingFunctions } = require("./stripeBilling");
Object.assign(exports, createStripeBillingFunctions({
  admin,
  onCall,
  onRequest,
  onSchedule,
  HttpsError,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  APPLE_ROOT_CA_CERTS_PEM,
  GOOGLE_PLAY_SERVICE_ACCOUNT,
  PLAN_ENTITLEMENTS,
  requireWorkspaceForBilling,
  workspaceOrderRole,
  normalizeWorkspaceRole,
  workspaceRoleLabel
}));


const ORDER_DETAIL_CARD_IDS = [
  "preview",
  "summary",
  "customer",
  "materials",
  "priority",
  "delivery",
  "notes",
  "clientFiles",
  "todo",
  "workTime",
  "financial",
  "status",
  "shipping",
  "schedule",
  "historyLog"
];

const DEFAULT_ORDER_DETAIL_CARD_COLUMNS = [
  ["preview", "summary"],
  ["customer", "materials", "delivery", "notes", "clientFiles"],
  ["priority", "todo", "workTime", "financial", "status", "shipping", "schedule", "historyLog"]
];

const APP_ORDER_DETAIL_CARD_IDS = Array.from(new Set([
  ...ORDER_DETAIL_CARD_IDS,
  "communication",
  "customerNotes"
]));

const LEGACY_WEB_CARD_ID_MAP = {
  timeline: "delivery",
  finance: "financial"
};

function appCardId(value) {
  const raw = String(value || "").trim();
  return LEGACY_WEB_CARD_ID_MAP[raw] || raw;
}

function normalizeOrderDetailCardOrder(value) {
  const seen = new Set();
  const output = [];

  if (Array.isArray(value)) {
    for (const item of value) {
      const cardId = appCardId(item);
      if (ORDER_DETAIL_CARD_IDS.includes(cardId) && !seen.has(cardId)) {
        seen.add(cardId);
        output.push(cardId);
      }
    }
  }

  for (const cardId of ORDER_DETAIL_CARD_IDS) {
    if (!seen.has(cardId)) output.push(cardId);
  }

  return output;
}

function normalizeAppCardOrder(value) {
  const seen = new Set();
  const output = [];

  if (Array.isArray(value)) {
    for (const item of value) {
      const cardId = appCardId(item);
      if (APP_ORDER_DETAIL_CARD_IDS.includes(cardId) && !seen.has(cardId)) {
        seen.add(cardId);
        output.push(cardId);
      }
    }
  }

  return output;
}

function mergePhoneCardOrder(nextKnownOrder, existingPhoneOrder) {
  const webCardIds = new Set(ORDER_DETAIL_CARD_IDS);
  const knownOrder = normalizeOrderDetailCardOrder(nextKnownOrder);
  const existingOrder = normalizeAppCardOrder(existingPhoneOrder);
  if (existingOrder.length === 0) return knownOrder;

  const output = [];
  const usedKnownCards = new Set();
  let knownIndex = 0;

  for (const cardId of existingOrder) {
    if (webCardIds.has(cardId)) {
      while (knownIndex < knownOrder.length && usedKnownCards.has(knownOrder[knownIndex])) {
        knownIndex += 1;
      }
      if (knownIndex < knownOrder.length) {
        output.push(knownOrder[knownIndex]);
        usedKnownCards.add(knownOrder[knownIndex]);
        knownIndex += 1;
      }
    } else if (!output.includes(cardId)) {
      output.push(cardId);
    }
  }

  for (const cardId of knownOrder) {
    if (!usedKnownCards.has(cardId)) output.push(cardId);
  }

  return output;
}

function layoutColumnsFromCardOrder(cardOrder = []) {
  const order = normalizeOrderDetailCardOrder(cardOrder);
  return [
    order.slice(0, 2),
    order.slice(2, 7),
    order.slice(7)
  ];
}

function normalizeOrderDetailCardColumns(value, fallbackOrder = ORDER_DETAIL_CARD_IDS) {
  const seen = new Set();
  const columns = [];

  if (Array.isArray(value)) {
    for (const rawColumn of value) {
      const column = [];
      if (Array.isArray(rawColumn)) {
        for (const item of rawColumn) {
          const cardId = appCardId(item);
          if (ORDER_DETAIL_CARD_IDS.includes(cardId) && !seen.has(cardId)) {
            seen.add(cardId);
            column.push(cardId);
          }
        }
      }
      columns.push(column);
    }
  }

  if (columns.length === 0) {
    return layoutColumnsFromCardOrder(fallbackOrder);
  }

  for (const cardId of ORDER_DETAIL_CARD_IDS) {
    if (!seen.has(cardId)) {
      columns[columns.length - 1].push(cardId);
    }
  }

  while (columns.length < 3) columns.push([]);
  return columns;
}

function normalizeOrderDetailCardVisibility(value) {
  const output = {};
  for (const cardId of ORDER_DETAIL_CARD_IDS) {
    output[cardId] = true;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) return output;

  for (const cardId of ORDER_DETAIL_CARD_IDS) {
    if (typeof value[cardId] === "boolean") {
      output[cardId] = value[cardId];
    }
  }

  for (const [legacyId, currentId] of Object.entries(LEGACY_WEB_CARD_ID_MAP)) {
    if (typeof value[legacyId] === "boolean") {
      output[currentId] = value[legacyId];
    }
  }

  return output;
}

function normalizeOrderDetailCardLayout(value = {}) {
  const data = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const fallbackOrder = normalizeOrderDetailCardOrder(data.cardOrder);
  const columns = normalizeOrderDetailCardColumns(data.columns, fallbackOrder);
  const cardOrder = normalizeOrderDetailCardOrder(columns.flat());
  const mobileCardOrder = normalizeOrderDetailCardOrder(
    data.mobileCardOrder || data.phoneKartSirasi || data.phoneCardOrder || cardOrder
  );

  return {
    cardOrder,
    mobileCardOrder,
    columns,
    columnWidths: normalizeColumnWidths(data.columnWidths, columns.length),
    cardHeights: normalizeNumberMap(data.cardHeights),
    cardColors: normalizeStringMap(data.cardColors),
    visibility: normalizeOrderDetailCardVisibility(data.visibility)
  };
}

function userWorkspaceCardLayoutRef(uid, companyId) {
  return admin.firestore()
    .collection("users")
    .doc(uid)
    .collection("workspaceCardLayouts")
    .doc(companyId);
}

const ORDER_WORKSPACE_LAYOUT_KEY = "__workspaceLayoutV1";

function companySettingsDocRef(companyId) {
  return admin.firestore().collection("companySettings").doc(companyId);
}

function cleanSidebarWidth(value, fallback = 380) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.round(number), 260), 720);
}

const DASHBOARD_VISIBILITY_KEYS = [
  "revenue",
  "pending",
  "cost",
  "fee",
  "shipping",
  "tax",
  "profit"
];

function cleanDashboardWidgetVisibility(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return DASHBOARD_VISIBILITY_KEYS.reduce((result, key) => {
    result[key] = source[key] !== false;
    return result;
  }, {});
}

function requireWorkspaceCardCustomization(companyData = {}) {
  const entitlements = billingEntitlementsForCompany(companyData);
  if (entitlements.cardCustomizationEnabled !== true) {
    throw new HttpsError("failed-precondition", "Card customization is available from NivaDesk Lite.", {
      requiredPlan: "lifetime_lite",
      plan: entitlements.plan,
      planName: entitlements.displayName
    });
  }
  return entitlements;
}

function parseJSON(value, fallback) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function workspaceProfileRole(companyData = {}, uid = "") {
  if (uidIsCompanyOwner(companyData, uid)) return "owner";
  return workspaceMemberRole(companyData, uid, "member");
}

function workspaceProfileDisplayName(companyData = {}, uid = "", request = {}) {
  const member = companyMembersMap(companyData)[uid];
  return String(
    request.auth?.token?.name ||
    member?.displayName ||
    request.auth?.token?.email ||
    member?.email ||
    uid
  ).trim();
}

function workspaceProfileEmail(companyData = {}, uid = "", request = {}) {
  const member = companyMembersMap(companyData)[uid];
  return String(request.auth?.token?.email || member?.email || uid).trim();
}

function swiftDateNumber(date = new Date()) {
  return (date.getTime() / 1000) - 978307200;
}

function normalizeWorkspaceProfiles(value) {
  const decoded = parseJSON(value, []);
  if (!Array.isArray(decoded)) return [];

  return decoded
    .filter((profile) => profile && typeof profile === "object")
    .map((profile) => ({
      ...profile,
      userId: String(profile.userId || "").trim(),
      savedProfiles: Array.isArray(profile.savedProfiles) ? profile.savedProfiles : []
    }))
    .filter((profile) => profile.userId);
}

function normalizeStringMap(value = {}) {
  const output = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return output;
  for (const [key, childValue] of Object.entries(value)) {
    if (typeof childValue === "string") output[key] = childValue;
  }
  return output;
}

function normalizeNumberMap(value = {}) {
  const output = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return output;
  for (const [key, childValue] of Object.entries(value)) {
    const number = Number(childValue);
    if (Number.isFinite(number)) output[key] = number;
  }
  return output;
}

function sanitizeOrderLayoutId(value = "") {
  const clean = String(value || "").trim();
  return clean.length > 160 ? clean.slice(0, 160) : clean;
}

function normalizeOrderCardHeightsMap(value = {}) {
  const output = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return output;

  for (const [rawOrderId, rawHeights] of Object.entries(value)) {
    const orderId = sanitizeOrderLayoutId(rawOrderId);
    if (!orderId) continue;

    const heights = normalizeNumberMap(rawHeights);
    if (Object.keys(heights).length > 0) {
      output[orderId] = heights;
    }
  }

  return output;
}

function activeCardHeightsForOrder(snapshot = {}, orderId = "") {
  const cleanOrderId = sanitizeOrderLayoutId(orderId);
  const sharedHeights = normalizeNumberMap(snapshot.kartYukseklikleri);
  const orderHeights = normalizeOrderCardHeightsMap(snapshot.orderKartYukseklikleri || snapshot.orderCardHeights);
  const specificHeights = cleanOrderId ? orderHeights[cleanOrderId] : null;

  if (specificHeights && Object.keys(specificHeights).length > 0) {
    return specificHeights;
  }

  return sharedHeights;
}

function normalizeColumnWidths(value, columnCount = 3) {
  const widths = Array.isArray(value) ? value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
    .map((item) => Math.min(Math.max(item, 260), 800)) : [];

  while (widths.length < Math.max(3, columnCount)) widths.push(350);
  return widths;
}

function layoutFromWorkspaceSnapshot(snapshot = {}, orderId = "") {
  const columns = Array.isArray(snapshot.kartYerlesimi) ? snapshot.kartYerlesimi : DEFAULT_ORDER_DETAIL_CARD_COLUMNS;
  return normalizeOrderDetailCardLayout({
    columns,
    mobileCardOrder: snapshot.phoneKartSirasi || snapshot.mobileCardOrder || snapshot.phoneCardOrder || columns.flat(),
    columnWidths: snapshot.sutunGenislikleri,
    cardHeights: activeCardHeightsForOrder(snapshot, orderId),
    cardColors: snapshot.kartRenkleri,
    visibility: snapshot.visibility
  });
}

function workspaceSnapshotFromLayout(layout, existingSnapshot = {}, orderId = "") {
  const normalized = normalizeOrderDetailCardLayout(layout);
  const existingVisibility = normalizeOrderDetailCardVisibility(existingSnapshot.visibility || {});
  const version = Number(existingSnapshot.version);
  const columnCount = normalized.columns.length;
  const nextCardColors = normalizeStringMap(layout?.cardColors);
  const mergedCardColors = normalizeStringMap(existingSnapshot.kartRenkleri);
  const cleanOrderId = sanitizeOrderLayoutId(orderId);
  const activeHeights = normalizeNumberMap(layout?.cardHeights);
  const nextOrderCardHeights = normalizeOrderCardHeightsMap(existingSnapshot.orderKartYukseklikleri || existingSnapshot.orderCardHeights);
  if (cleanOrderId) {
    if (Object.keys(activeHeights).length > 0) {
      nextOrderCardHeights[cleanOrderId] = activeHeights;
    } else {
      delete nextOrderCardHeights[cleanOrderId];
    }
  }
  for (const cardId of ORDER_DETAIL_CARD_IDS) {
    delete mergedCardColors[cardId];
  }

  return {
    ...existingSnapshot,
    version: Number.isFinite(version) && version > 0 ? Math.round(version) : 1,
    sutunGenislikleri: normalizeColumnWidths(layout?.columnWidths || existingSnapshot.sutunGenislikleri, columnCount),
    kartYerlesimi: normalized.columns,
    phoneKartSirasi: mergePhoneCardOrder(
      normalized.mobileCardOrder,
      existingSnapshot.phoneKartSirasi || existingSnapshot.mobileCardOrder || existingSnapshot.phoneCardOrder
    ),
    kartYukseklikleri: cleanOrderId
      ? normalizeNumberMap(existingSnapshot.kartYukseklikleri)
      : {
        ...normalizeNumberMap(existingSnapshot.kartYukseklikleri),
        ...activeHeights
      },
    orderKartYukseklikleri: nextOrderCardHeights,
    kartRenkleri: {
      ...mergedCardColors,
      ...nextCardColors
    },
    visibility: {
      ...existingVisibility,
      ...normalized.visibility
    }
  };
}

function workspaceProfileSnapshot(profile = {}) {
  return parseJSON(profile.snapshotJSON, null);
}

function ownOrFallbackWorkspaceProfile(profiles, uid, companyData = {}) {
  const ownProfile = profiles.find((profile) => profile.userId === uid);
  if (ownProfile) return { profile: ownProfile, source: "user_profile" };

  const ownerUid = String(companyData.ownerUid || "").trim();
  const ownerProfile = profiles.find((profile) => profile.userId === ownerUid);
  if (ownerProfile) return { profile: ownerProfile, source: "owner_profile" };

  return { profile: null, source: "default" };
}

function normalizedSavedProfiles(value, fallbackSnapshotJSON) {
  const items = Array.isArray(value) ? value : [];
  const cleaned = items
    .filter((profile) => profile && typeof profile === "object")
    .map((profile, index) => ({
      id: String(profile.id || crypto.randomUUID()),
      name: String(profile.name || `Profile ${index + 1}`).trim() || `Profile ${index + 1}`,
      snapshotJSON: String(profile.snapshotJSON || "")
    }));

  if (cleaned.length === 0 && fallbackSnapshotJSON) {
    cleaned.push({
      id: crypto.randomUUID(),
      name: "Profile 1",
      snapshotJSON: fallbackSnapshotJSON
    });
  }

  return cleaned;
}

function sanitizeSwiftWorkspaceSnapshotJSON(value, fieldName = "snapshotJSON", allowEmpty = false) {
  const raw = String(value || "").trim();
  if (!raw) {
    if (allowEmpty) return "";
    throw new HttpsError("invalid-argument", `${fieldName} is required.`);
  }

  if (raw.length > 250000) {
    throw new HttpsError("invalid-argument", `${fieldName} is too large.`);
  }

  const parsed = parseJSON(raw, null);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpsError("invalid-argument", `${fieldName} must be a valid card profile object.`);
  }

  return JSON.stringify(parsed);
}

function sanitizeSwiftSavedProfiles(value, fallbackSnapshotJSON) {
  const items = Array.isArray(value) ? value : [];
  const cleaned = [];

  for (const [index, profile] of items.entries()) {
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) continue;

    const snapshotJSON = sanitizeSwiftWorkspaceSnapshotJSON(
      profile.snapshotJSON,
      `savedProfiles[${index}].snapshotJSON`,
      true
    );

    cleaned.push({
      id: String(profile.id || crypto.randomUUID()),
      name: String(profile.name || `Profile ${index + 1}`).trim() || `Profile ${index + 1}`,
      snapshotJSON
    });
  }

  if (cleaned.length === 0 && fallbackSnapshotJSON) {
    cleaned.push({
      id: crypto.randomUUID(),
      name: "Profile 1",
      snapshotJSON: fallbackSnapshotJSON
    });
  }

  return cleaned.slice(0, 20);
}

exports.saveSwiftWorkspaceCardProfile = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyData } = await requireWorkspaceForBilling(request, false);
  requireWorkspaceCardCustomization(companyData);

  const role = normalizeWorkspaceRole(workspaceOrderRole(companyData, uid));
  if (!canEditOrderStatus(role)) {
    throw new HttpsError("permission-denied", `Your current role is ${workspaceRoleLabel(role)} and cannot edit card layout.`);
  }

  const orderId = sanitizeOrderLayoutId(request.data?.orderId);
  const settingsRef = companySettingsDocRef(companyId);

  if (orderId) {
    const snapshotJSON = sanitizeSwiftWorkspaceSnapshotJSON(request.data?.snapshotJSON);
    const orderRef = orderDocRef(orderId);

    await admin.firestore().runTransaction(async (transaction) => {
      const orderSnapshot = await transaction.get(orderRef);
      if (!orderSnapshot.exists) {
        throw new HttpsError("not-found", "Order not found.");
      }

      const orderData = orderSnapshot.data() || {};
      if (orderCompanyId(orderData) !== companyId) {
        throw new HttpsError("permission-denied", "This order does not belong to the active workspace.");
      }

      transaction.update(orderRef, {
        customFields: {
          ...normalizeStringMap(orderData.customFields),
          [ORDER_WORKSPACE_LAYOUT_KEY]: snapshotJSON
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedByUid: uid
      });
    });

    return {
      ok: true,
      companyId,
      orderId,
      message: "This order layout was saved."
    };
  }

  const inputProfile = request.data?.profile && typeof request.data.profile === "object"
    ? request.data.profile
    : {};
  const snapshotJSON = sanitizeSwiftWorkspaceSnapshotJSON(inputProfile.snapshotJSON || request.data?.snapshotJSON);

  await admin.firestore().runTransaction(async (transaction) => {
    const settingsSnapshot = await transaction.get(settingsRef);
    const settingsData = settingsSnapshot.exists ? settingsSnapshot.data() || {} : {};
    const profiles = normalizeWorkspaceProfiles(settingsData.workspaceUserProfilesJSON);
    const existingIndex = profiles.findIndex((profile) => profile.userId === uid);
    const existingProfile = existingIndex >= 0 ? profiles[existingIndex] : {};

    const updatedProfile = {
      ...existingProfile,
      id: String(existingProfile.id || inputProfile.id || crypto.randomUUID()),
      userId: uid,
      displayName: workspaceProfileDisplayName(companyData, uid, request),
      email: workspaceProfileEmail(companyData, uid, request),
      role: workspaceProfileRole(companyData, uid),
      snapshotJSON,
      updatedAt: swiftDateNumber(),
      savedProfiles: sanitizeSwiftSavedProfiles(inputProfile.savedProfiles || existingProfile.savedProfiles, snapshotJSON)
    };

    if (existingIndex >= 0) {
      profiles[existingIndex] = updatedProfile;
    } else {
      profiles.push(updatedProfile);
    }

    transaction.set(settingsRef, {
      workspaceUserProfilesJSON: JSON.stringify(profiles)
    }, { merge: true });
  });

  return {
    ok: true,
    companyId,
    message: "Card profile saved."
  };
});

exports.getWorkspaceCardLayout = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyData } = await requireWorkspaceForBilling(request, false);
  const orderId = sanitizeOrderLayoutId(request.data?.orderId);
  const settingsSnapshot = await companySettingsDocRef(companyId).get();
  const settingsData = settingsSnapshot.exists ? settingsSnapshot.data() || {} : {};
  const profiles = normalizeWorkspaceProfiles(settingsData.workspaceUserProfilesJSON);
  const { profile, source } = ownOrFallbackWorkspaceProfile(profiles, uid, companyData);
  const sharedSnapshot = parseJSON(settingsData.sharedWorkspaceSnapshotJSON, null);
  const appSnapshot = profile ? workspaceProfileSnapshot(profile) : sharedSnapshot;

  if (appSnapshot) {
    return {
      ok: true,
      companyId,
      source: profile ? source : "shared_workspace",
      layout: layoutFromWorkspaceSnapshot(appSnapshot, orderId)
    };
  }

  const legacySnapshot = await userWorkspaceCardLayoutRef(uid, companyId).get();
  if (legacySnapshot.exists) {
    return {
      ok: true,
      companyId,
      source: "legacy_web_layout",
      layout: normalizeOrderDetailCardLayout(legacySnapshot.data())
    };
  }

  return {
    ok: true,
    companyId,
    source: "default",
    layout: normalizeOrderDetailCardLayout({})
  };
});

exports.saveWorkspaceCardLayout = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyData } = await requireWorkspaceForBilling(request, false);
  requireWorkspaceCardCustomization(companyData);

  const orderId = sanitizeOrderLayoutId(request.data?.orderId);
  const layout = normalizeOrderDetailCardLayout(request.data?.layout || {});
  const settingsRef = companySettingsDocRef(companyId);
  let savedLayout = layout;

  await admin.firestore().runTransaction(async (transaction) => {
    const orderRef = orderId ? orderDocRef(orderId) : null;
    const [settingsSnapshot, orderSnapshot] = await Promise.all([
      transaction.get(settingsRef),
      orderRef ? transaction.get(orderRef) : Promise.resolve(null)
    ]);
    const settingsData = settingsSnapshot.exists ? settingsSnapshot.data() || {} : {};
    const orderData = orderSnapshot?.exists ? orderSnapshot.data() || {} : null;
    const orderCustomFields = orderData ? normalizeStringMap(orderData.customFields) : {};
    const orderLayoutSnapshot = parseJSON(orderCustomFields[ORDER_WORKSPACE_LAYOUT_KEY], null);

    if (orderRef && orderData && orderLayoutSnapshot) {
      if (orderCompanyId(orderData) !== companyId) {
        throw new HttpsError("permission-denied", "This order does not belong to the active workspace.");
      }

      const profiles = normalizeWorkspaceProfiles(settingsData.workspaceUserProfilesJSON);
      const { profile } = ownOrFallbackWorkspaceProfile(profiles, uid, companyData);
      const existingSnapshot = orderLayoutSnapshot || workspaceProfileSnapshot(profile || {}) || parseJSON(settingsData.sharedWorkspaceSnapshotJSON, {});
      const snapshot = workspaceSnapshotFromLayout(layout, existingSnapshot || {}, orderId);
      const snapshotJSON = JSON.stringify(snapshot);

      transaction.update(orderRef, {
        customFields: {
          ...orderCustomFields,
          [ORDER_WORKSPACE_LAYOUT_KEY]: snapshotJSON
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedByUid: uid,
        source: orderData.source || "web"
      });

      savedLayout = layoutFromWorkspaceSnapshot(snapshot, orderId);
      return;
    }

    const profiles = normalizeWorkspaceProfiles(settingsData.workspaceUserProfilesJSON);
    const existingIndex = profiles.findIndex((profile) => profile.userId === uid);
    const existingProfile = existingIndex >= 0 ? profiles[existingIndex] : {};
    const existingSnapshot = workspaceProfileSnapshot(existingProfile) || parseJSON(settingsData.sharedWorkspaceSnapshotJSON, {});
    const snapshot = workspaceSnapshotFromLayout(layout, existingSnapshot || {}, orderId);
    savedLayout = layoutFromWorkspaceSnapshot(snapshot, orderId);
    const snapshotJSON = JSON.stringify(snapshot);
    const savedProfiles = normalizedSavedProfiles(existingProfile.savedProfiles, snapshotJSON);

    const updatedProfile = {
      ...existingProfile,
      id: String(existingProfile.id || crypto.randomUUID()),
      userId: uid,
      displayName: workspaceProfileDisplayName(companyData, uid, request),
      email: workspaceProfileEmail(companyData, uid, request),
      role: workspaceProfileRole(companyData, uid),
      snapshotJSON,
      updatedAt: swiftDateNumber(),
      savedProfiles
    };

    if (existingIndex >= 0) {
      profiles[existingIndex] = updatedProfile;
    } else {
      profiles.push(updatedProfile);
    }

    transaction.set(settingsRef, {
      workspaceUserProfilesJSON: JSON.stringify(profiles)
    }, { merge: true });
  });

  return {
    ok: true,
    companyId,
    layout: savedLayout,
    message: "Card layout saved."
  };
});

exports.saveOrderWorkspaceCardLayout = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyData } = await requireWorkspaceForBilling(request, false);
  requireWorkspaceCardCustomization(companyData);

  const role = normalizeWorkspaceRole(workspaceOrderRole(companyData, uid));
  if (!canEditOrderStatus(role)) {
    throw new HttpsError("permission-denied", `Your current role is ${workspaceRoleLabel(role)} and cannot make this order independent.`);
  }

  const orderId = String(request.data?.orderId || "").trim();
  if (!orderId) throw new HttpsError("invalid-argument", "orderId is required.");

  const layout = normalizeOrderDetailCardLayout(request.data?.layout || {});
  const settingsRef = companySettingsDocRef(companyId);
  const orderRef = orderDocRef(orderId);
  let savedLayout = layout;

  await admin.firestore().runTransaction(async (transaction) => {
    const [settingsSnapshot, orderSnapshot] = await Promise.all([
      transaction.get(settingsRef),
      transaction.get(orderRef)
    ]);

    if (!orderSnapshot.exists) {
      throw new HttpsError("not-found", "Order not found.");
    }

    const orderData = orderSnapshot.data() || {};
    if (orderCompanyId(orderData) !== companyId) {
      throw new HttpsError("permission-denied", "This order does not belong to the active workspace.");
    }

    const settingsData = settingsSnapshot.exists ? settingsSnapshot.data() || {} : {};
    const orderCustomFields = normalizeStringMap(orderData.customFields);
    const orderLayoutSnapshot = parseJSON(orderCustomFields[ORDER_WORKSPACE_LAYOUT_KEY], null);
    const profiles = normalizeWorkspaceProfiles(settingsData.workspaceUserProfilesJSON);
    const { profile } = ownOrFallbackWorkspaceProfile(profiles, uid, companyData);
    const existingSnapshot = orderLayoutSnapshot || workspaceProfileSnapshot(profile || {}) || parseJSON(settingsData.sharedWorkspaceSnapshotJSON, {});
    const snapshot = workspaceSnapshotFromLayout(layout, existingSnapshot || {}, orderId);
    const snapshotJSON = JSON.stringify(snapshot);
    const customFields = {
      ...orderCustomFields,
      [ORDER_WORKSPACE_LAYOUT_KEY]: snapshotJSON
    };

    transaction.update(orderRef, {
      customFields,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedByUid: uid,
      source: orderData.source || "web"
    });

    savedLayout = layoutFromWorkspaceSnapshot(snapshot, orderId);
  });

  return {
    ok: true,
    companyId,
    orderId,
    layout: savedLayout,
    message: "This order layout was saved."
  };
});

exports.resetOrderWorkspaceCardLayout = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyData } = await requireWorkspaceForBilling(request, false);
  requireWorkspaceCardCustomization(companyData);

  const role = normalizeWorkspaceRole(workspaceOrderRole(companyData, uid));
  if (!canEditOrderStatus(role)) {
    throw new HttpsError("permission-denied", `Your current role is ${workspaceRoleLabel(role)} and cannot rejoin the shared card layout.`);
  }

  const orderId = String(request.data?.orderId || "").trim();
  if (!orderId) throw new HttpsError("invalid-argument", "orderId is required.");

  const settingsRef = companySettingsDocRef(companyId);
  const orderRef = orderDocRef(orderId);
  let savedLayout = normalizeOrderDetailCardLayout({});

  await admin.firestore().runTransaction(async (transaction) => {
    const [settingsSnapshot, orderSnapshot] = await Promise.all([
      transaction.get(settingsRef),
      transaction.get(orderRef)
    ]);

    if (!orderSnapshot.exists) {
      throw new HttpsError("not-found", "Order not found.");
    }

    const orderData = orderSnapshot.data() || {};
    if (orderCompanyId(orderData) !== companyId) {
      throw new HttpsError("permission-denied", "This order does not belong to the active workspace.");
    }

    const customFields = normalizeStringMap(orderData.customFields);
    delete customFields[ORDER_WORKSPACE_LAYOUT_KEY];

    transaction.update(orderRef, {
      customFields,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedByUid: uid,
      source: orderData.source || "web"
    });

    const settingsData = settingsSnapshot.exists ? settingsSnapshot.data() || {} : {};
    const profiles = normalizeWorkspaceProfiles(settingsData.workspaceUserProfilesJSON);
    const { profile } = ownOrFallbackWorkspaceProfile(profiles, uid, companyData);
    const sharedSnapshot = parseJSON(settingsData.sharedWorkspaceSnapshotJSON, null);
    const appSnapshot = profile ? workspaceProfileSnapshot(profile) : sharedSnapshot;
    savedLayout = appSnapshot ? layoutFromWorkspaceSnapshot(appSnapshot, orderId) : normalizeOrderDetailCardLayout({});
  });

  return {
    ok: true,
    companyId,
    orderId,
    layout: savedLayout,
    message: "This order now uses the shared card layout."
  };
});

const BLOCK_HEADING_FIELDS_BY_CARD = {
  summary: ["summaryStep1", "summaryStep2"],
  financial: ["financialShowBaseCost", "financialBaseCostLabel", "financialExpenseItemsJSON", "financialRemainingItemsJSON"],
  status: [
    "businessType",
    "businessDescriptionPrompt",
    "activeStatusesJSON",
    "customStepsJSON",
    "customTogglesJSON",
    "summaryStep1",
    "summaryStep2",
    "orderListStep1",
    "orderListStep2",
    "showStatusNotesSupplier",
    "statusNotesSupplierLabel"
  ],
  customer: [
    "customFieldsJSON",
    "communicationShowTelephone",
    "communicationShowEmail",
    "communicationShowAddress",
    "communicationShowChannel",
    "communicationShowCustomerNotes",
    "communicationChannelLabelsJSON"
  ],
  communication: [
    "communicationShowTelephone",
    "communicationShowEmail",
    "communicationShowAddress",
    "communicationShowChannel",
    "communicationShowCustomerNotes",
    "communicationChannelLabelsJSON"
  ],
  notes: ["specialNoteSectionsJSON"],
  materials: [
    "invLabel1",
    "invLabel2",
    "invLabel3",
    "invLabel4",
    "materialsDefaultChecksJSON",
    "materialsTogglesJSON",
    "showMaterialsNotesSupplier",
    "materialsNotesSupplierLabel"
  ],
  schedule: ["scheduleQuickRemindersJSON"]
};

const PRIMARY_SPECIAL_NOTE_ID = "00000000-0000-0000-0000-000000000101";

function blockHeadingString(value, fallback = "", maxLength = 120) {
  const cleaned = String(value ?? "").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, maxLength) || fallback;
}

function blockHeadingBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeHeadingItems(value, fallbackItems = []) {
  const source = Array.isArray(value) ? value : fallbackItems;
  const output = [];
  for (const item of source) {
    const title = blockHeadingString(item?.title, "", 120);
    if (!title) continue;
    output.push({
      id: blockHeadingString(item?.id, crypto.randomUUID(), 80),
      title
    });
  }
  return output.slice(0, 40);
}

function parseHeadingItemsJSON(value, fallbackItems = []) {
  try {
    return normalizeHeadingItems(JSON.parse(String(value || "")), fallbackItems);
  } catch {
    return normalizeHeadingItems(fallbackItems);
  }
}

function encodeHeadingItems(value, fallbackItems = []) {
  return JSON.stringify(normalizeHeadingItems(value, fallbackItems));
}

function normalizeStringArray(value, fallback = []) {
  const source = Array.isArray(value) ? value : fallback;
  const output = [];
  for (const item of source) {
    const cleaned = blockHeadingString(item, "", 80);
    if (cleaned && !output.some((existing) => existing.toLowerCase() === cleaned.toLowerCase())) {
      output.push(cleaned);
    }
  }
  return output.slice(0, 20);
}

function parseStringArrayJSON(value, fallback = []) {
  try {
    return normalizeStringArray(JSON.parse(String(value || "")), fallback);
  } catch {
    return normalizeStringArray(fallback);
  }
}

function encodeStringArray(value, fallback = []) {
  return JSON.stringify(normalizeStringArray(value, fallback));
}

function normalizeScheduleReminderItems(value, fallbackItems = []) {
  const source = Array.isArray(value) ? value : fallbackItems;
  const output = [];
  for (const item of source) {
    const title = blockHeadingString(item?.title, "", 120);
    if (!title) continue;
    output.push({
      id: blockHeadingString(item?.id, crypto.randomUUID(), 80),
      title,
      days: 1,
      hours: 0,
      priority: "Normal",
      notify: true
    });
  }
  return output.slice(0, 20);
}

function parseScheduleRemindersJSON(value, fallbackItems = []) {
  try {
    return normalizeScheduleReminderItems(JSON.parse(String(value || "")), fallbackItems);
  } catch {
    return normalizeScheduleReminderItems(fallbackItems);
  }
}

function encodeScheduleReminders(value, fallbackItems = []) {
  return JSON.stringify(normalizeScheduleReminderItems(value, fallbackItems));
}

function defaultHeadingSettings() {
  return {
    businessType: "Custom Art Studio",
    businessDescriptionPrompt: "",
    customSteps: [{ id: crypto.randomUUID(), title: "Design" }, { id: crypto.randomUUID(), title: "Painting" }],
    customFields: [],
    customToggles: [],
    activeStatuses: ["New", "Not Yet", "In Progress", "Done", "Cancelled"],
    materialsToggles: [],
    materialsDefaultChecks: [],
    financialExpenseItems: [],
    financialRemainingItems: [],
    financialShowBaseCost: true,
    financialBaseCostLabel: "Cost (Base)",
    summaryStep1: "Design",
    summaryStep2: "Painting",
    orderListStep1: "Design",
    orderListStep2: "Painting",
    invLabel1: "Dial",
    invLabel2: "Hands",
    invLabel3: "Case",
    invLabel4: "Materials Ready",
    showStatusNotesSupplier: false,
    showMaterialsNotesSupplier: true,
    statusNotesSupplierLabel: "Notes / Supplier",
    materialsNotesSupplierLabel: "Notes / Supplier",
    scheduleQuickReminders: [
      { id: crypto.randomUUID(), title: "Follow up customer", days: 1, hours: 0, priority: "Normal", notify: true },
      { id: crypto.randomUUID(), title: "Send design update", days: 1, hours: 0, priority: "Normal", notify: true },
      { id: crypto.randomUUID(), title: "Ask for approval", days: 1, hours: 0, priority: "Normal", notify: true },
      { id: crypto.randomUUID(), title: "Check payment", days: 1, hours: 0, priority: "Normal", notify: true }
    ],
    communicationShowTelephone: true,
    communicationShowEmail: true,
    communicationShowAddress: true,
    communicationShowChannel: true,
    communicationShowCustomerNotes: true,
    communicationChannelLabels: ["Instagram", "WhatsApp", "TikTok"],
    specialNoteSections: [{ id: PRIMARY_SPECIAL_NOTE_ID, title: "Special Notes" }]
  };
}

function blockHeadingSettingsFromData(data = {}) {
  const defaults = defaultHeadingSettings();
  return {
    businessType: blockHeadingString(data.businessType, defaults.businessType),
    businessDescriptionPrompt: String(data.businessDescriptionPrompt ?? defaults.businessDescriptionPrompt).slice(0, 50000),
    customSteps: parseHeadingItemsJSON(data.customStepsJSON, defaults.customSteps),
    customFields: parseHeadingItemsJSON(data.customFieldsJSON, defaults.customFields),
    customToggles: parseHeadingItemsJSON(data.customTogglesJSON, defaults.customToggles),
    activeStatuses: parseStringArrayJSON(data.activeStatusesJSON, defaults.activeStatuses),
    materialsToggles: parseHeadingItemsJSON(data.materialsTogglesJSON, defaults.materialsToggles),
    materialsDefaultChecks: parseHeadingItemsJSON(data.materialsDefaultChecksJSON, defaults.materialsDefaultChecks),
    financialExpenseItems: parseHeadingItemsJSON(data.financialExpenseItemsJSON, defaults.financialExpenseItems),
    financialRemainingItems: parseHeadingItemsJSON(data.financialRemainingItemsJSON, defaults.financialRemainingItems),
    financialShowBaseCost: blockHeadingBoolean(data.financialShowBaseCost, defaults.financialShowBaseCost),
    financialBaseCostLabel: blockHeadingString(data.financialBaseCostLabel, defaults.financialBaseCostLabel),
    summaryStep1: blockHeadingString(data.summaryStep1, defaults.summaryStep1),
    summaryStep2: blockHeadingString(data.summaryStep2, defaults.summaryStep2),
    orderListStep1: blockHeadingString(data.orderListStep1, defaults.orderListStep1),
    orderListStep2: blockHeadingString(data.orderListStep2, defaults.orderListStep2),
    invLabel1: blockHeadingString(data.invLabel1, defaults.invLabel1),
    invLabel2: blockHeadingString(data.invLabel2, defaults.invLabel2),
    invLabel3: blockHeadingString(data.invLabel3, defaults.invLabel3),
    invLabel4: blockHeadingString(data.invLabel4, defaults.invLabel4),
    showStatusNotesSupplier: blockHeadingBoolean(data.showStatusNotesSupplier, defaults.showStatusNotesSupplier),
    showMaterialsNotesSupplier: blockHeadingBoolean(data.showMaterialsNotesSupplier, defaults.showMaterialsNotesSupplier),
    statusNotesSupplierLabel: blockHeadingString(data.statusNotesSupplierLabel, defaults.statusNotesSupplierLabel),
    materialsNotesSupplierLabel: blockHeadingString(data.materialsNotesSupplierLabel, defaults.materialsNotesSupplierLabel),
    scheduleQuickReminders: parseScheduleRemindersJSON(data.scheduleQuickRemindersJSON, defaults.scheduleQuickReminders),
    communicationShowTelephone: blockHeadingBoolean(data.communicationShowTelephone, defaults.communicationShowTelephone),
    communicationShowEmail: blockHeadingBoolean(data.communicationShowEmail, defaults.communicationShowEmail),
    communicationShowAddress: blockHeadingBoolean(data.communicationShowAddress, defaults.communicationShowAddress),
    communicationShowChannel: blockHeadingBoolean(data.communicationShowChannel, defaults.communicationShowChannel),
    communicationShowCustomerNotes: blockHeadingBoolean(data.communicationShowCustomerNotes, defaults.communicationShowCustomerNotes),
    communicationChannelLabels: parseStringArrayJSON(data.communicationChannelLabelsJSON, defaults.communicationChannelLabels),
    specialNoteSections: parseHeadingItemsJSON(data.specialNoteSectionsJSON, defaults.specialNoteSections)
  };
}

function blockHeadingUpdatesForCard(cardId, settings = {}) {
  const supportedFields = BLOCK_HEADING_FIELDS_BY_CARD[cardId];
  if (!supportedFields) {
    throw new HttpsError("failed-precondition", "Block heading editing for this card is not available on web yet.");
  }

  const updates = {};
  const allow = (field) => supportedFields.includes(field);
  const defaults = defaultHeadingSettings();

  if (allow("financialShowBaseCost")) updates.financialShowBaseCost = blockHeadingBoolean(settings.financialShowBaseCost, true);
  if (allow("businessType")) updates.businessType = blockHeadingString(settings.businessType, "Custom Art Studio", 120);
  if (allow("businessDescriptionPrompt")) updates.businessDescriptionPrompt = String(settings.businessDescriptionPrompt || "").slice(0, 50000);
  if (allow("financialBaseCostLabel")) updates.financialBaseCostLabel = blockHeadingString(settings.financialBaseCostLabel, "Cost (Base)");
  if (allow("financialExpenseItemsJSON")) updates.financialExpenseItemsJSON = encodeHeadingItems(settings.financialExpenseItems);
  if (allow("financialRemainingItemsJSON")) updates.financialRemainingItemsJSON = encodeHeadingItems(settings.financialRemainingItems);
  if (allow("customStepsJSON")) updates.customStepsJSON = encodeHeadingItems(settings.customSteps, defaults.customSteps);
  if (allow("customFieldsJSON")) updates.customFieldsJSON = encodeHeadingItems(settings.customFields, defaults.customFields);
  if (allow("customTogglesJSON")) updates.customTogglesJSON = encodeHeadingItems(settings.customToggles);
  if (allow("activeStatusesJSON")) updates.activeStatusesJSON = encodeStringArray(settings.activeStatuses, defaults.activeStatuses);
  if (allow("summaryStep1")) updates.summaryStep1 = blockHeadingString(settings.summaryStep1, "Design");
  if (allow("summaryStep2")) updates.summaryStep2 = blockHeadingString(settings.summaryStep2, "Painting");
  if (allow("orderListStep1")) updates.orderListStep1 = blockHeadingString(settings.orderListStep1, updates.summaryStep1 || "Design");
  if (allow("orderListStep2")) updates.orderListStep2 = blockHeadingString(settings.orderListStep2, updates.summaryStep2 || "Painting");
  if (allow("showStatusNotesSupplier")) updates.showStatusNotesSupplier = blockHeadingBoolean(settings.showStatusNotesSupplier, false);
  if (allow("statusNotesSupplierLabel")) updates.statusNotesSupplierLabel = blockHeadingString(settings.statusNotesSupplierLabel, "Notes / Supplier");

  if (allow("materialsDefaultChecksJSON")) {
    const materialChecks = normalizeHeadingItems(settings.materialsDefaultChecks);
    const sourceLabels = materialChecks.length
      ? materialChecks.map((item) => item.title)
      : [settings.invLabel1, settings.invLabel2, settings.invLabel3, settings.invLabel4]
        .map((item) => blockHeadingString(item, "", 120))
        .filter(Boolean);
    const padded = [...sourceLabels, "Item", "Item", "Item", "Item"];
    updates.invLabel1 = padded[0] || "Dial";
    updates.invLabel2 = padded[1] || "Hands";
    updates.invLabel3 = padded[2] || "Case";
    updates.invLabel4 = padded[3] || "Materials Ready";
    updates.materialsDefaultChecksJSON = encodeHeadingItems(sourceLabels.map((title) => ({ title })));
  }
  if (allow("materialsTogglesJSON")) updates.materialsTogglesJSON = encodeHeadingItems(settings.materialsToggles);
  if (allow("showMaterialsNotesSupplier")) updates.showMaterialsNotesSupplier = blockHeadingBoolean(settings.showMaterialsNotesSupplier, true);
  if (allow("materialsNotesSupplierLabel")) updates.materialsNotesSupplierLabel = blockHeadingString(settings.materialsNotesSupplierLabel, "Notes / Supplier");

  if (allow("communicationShowTelephone")) updates.communicationShowTelephone = blockHeadingBoolean(settings.communicationShowTelephone, true);
  if (allow("communicationShowEmail")) updates.communicationShowEmail = blockHeadingBoolean(settings.communicationShowEmail, true);
  if (allow("communicationShowAddress")) updates.communicationShowAddress = blockHeadingBoolean(settings.communicationShowAddress, true);
  if (allow("communicationShowChannel")) updates.communicationShowChannel = blockHeadingBoolean(settings.communicationShowChannel, true);
  if (allow("communicationShowCustomerNotes")) updates.communicationShowCustomerNotes = blockHeadingBoolean(settings.communicationShowCustomerNotes, true);
  if (allow("communicationChannelLabelsJSON")) updates.communicationChannelLabelsJSON = encodeStringArray(settings.communicationChannelLabels, defaults.communicationChannelLabels);

  if (allow("specialNoteSectionsJSON")) {
    const notes = normalizeHeadingItems(settings.specialNoteSections, defaults.specialNoteSections);
    const hasPrimary = notes.some((item) => item.id === PRIMARY_SPECIAL_NOTE_ID);
    updates.specialNoteSectionsJSON = encodeHeadingItems(hasPrimary ? notes : [defaults.specialNoteSections[0], ...notes]);
  }

  if (allow("scheduleQuickRemindersJSON")) updates.scheduleQuickRemindersJSON = encodeScheduleReminders(settings.scheduleQuickReminders, defaults.scheduleQuickReminders);

  updates.workflowSettingsUpdatedAt = admin.firestore.FieldValue.serverTimestamp();
  return updates;
}

exports.getWorkspaceBlockHeadings = onCall({ region: "europe-west2" }, async (request) => {
  const { companyId } = await requireWorkspaceForBilling(request, false);
  const settingsSnapshot = await companySettingsDocRef(companyId).get();
  const settingsData = settingsSnapshot.exists ? settingsSnapshot.data() || {} : {};

  return {
    ok: true,
    companyId,
    settings: blockHeadingSettingsFromData(settingsData)
  };
});

exports.saveWorkspaceBlockHeadings = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyData } = await requireWorkspaceForBilling(request, false);
  requireWorkspaceCardCustomization(companyData);
  if (!uidCanEditWorkspaceOrderStatus(companyData, uid)) {
    throw new HttpsError("permission-denied", "Your workspace role cannot edit block headings.");
  }

  const cardId = String(request.data?.cardId || "").trim();
  const updates = blockHeadingUpdatesForCard(cardId, request.data?.settings || {});
  const settingsRef = companySettingsDocRef(companyId);
  await settingsRef.set(updates, { merge: true });
  const settingsSnapshot = await settingsRef.get();

  return {
    ok: true,
    companyId,
    cardId,
    settings: blockHeadingSettingsFromData(settingsSnapshot.exists ? settingsSnapshot.data() || {} : {})
  };
});

exports.saveWorkspaceSidebarLayout = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId } = await requireWorkspaceForBilling(request, false);
  const visible = request.data?.visible !== false;
  const width = cleanSidebarWidth(request.data?.width, 380);
  const settingsRef = companySettingsDocRef(companyId);

  await settingsRef.set({
    ordersSidebarWidth: width,
    ordersSidebarVisible: visible,
    workspaceSidebarLayoutUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    workspaceSidebarLayoutUpdatedBy: uid
  }, { merge: true });

  return {
    ok: true,
    companyId,
    layout: {
      width,
      visible
    },
    message: "Workspace sidebar layout saved."
  };
});

exports.saveOrderCardDisplaySettings = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyData } = await requireWorkspaceForBilling(request, false);
  if (!uidCanEditWorkspaceOrders(companyData, uid)) {
    throw new HttpsError("permission-denied", "Your workspace role cannot edit order card settings.");
  }

  const incoming = request.data?.settings && typeof request.data.settings === "object" ? request.data.settings : {};
  const showStatusBadges = incoming.showStatusBadges !== false;
  const settingsRef = companySettingsDocRef(companyId);
  await settingsRef.set({
    orderCardShowStatusBadges: showStatusBadges,
    orderCardSettingsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    orderCardSettingsUpdatedBy: uid
  }, { merge: true });

  return {
    ok: true,
    companyId,
    settings: { showStatusBadges },
    message: "Order card settings saved."
  };
});

exports.saveDashboardWidgetVisibility = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyData } = await requireWorkspaceForBilling(request, false);
  if (!uidCanEditWorkspaceOrders(companyData, uid)) {
    throw new HttpsError("permission-denied", "Your workspace role cannot edit dashboard settings.");
  }

  const visibility = cleanDashboardWidgetVisibility(request.data?.visibility || {});
  const settingsRef = companySettingsDocRef(companyId);
  await settingsRef.set({
    dashboardWidgetVisibility: visibility,
    dashShowRevenue: visibility.revenue,
    dashShowPending: visibility.pending,
    dashShowCost: visibility.cost,
    dashShowFee: visibility.fee,
    dashShowShipping: visibility.shipping,
    dashShowTax: visibility.tax,
    dashShowProfit: visibility.profit,
    dashboardWidgetVisibilityUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    dashboardWidgetVisibilityUpdatedBy: uid
  }, { merge: true });

  return {
    ok: true,
    companyId,
    visibility,
    message: "Dashboard customization saved."
  };
});

const QUICK_REPLY_MODES = new Set(["Apple", "AI", "Offline"]);
const QUICK_REPLY_POLITENESS = new Set(["Direct", "Warm", "Very Polite"]);
const QUICK_REPLY_LENGTHS = new Set(["Short", "Balanced", "Detailed"]);

function cleanQuickReplyMode(value, fallback = "AI") {
  const raw = String(value || "").trim();
  if (raw === "Local") return "Apple";
  return QUICK_REPLY_MODES.has(raw) ? raw : fallback;
}

function cleanQuickReplyOption(value, allowed, fallback) {
  const raw = String(value || "").trim();
  return allowed.has(raw) ? raw : fallback;
}

function cleanQuickReplyText(value, maxLength = 50000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function cleanQuickReplyTemplateItems(items, fallback = []) {
  const source = Array.isArray(items) ? items : fallback;
  return source.slice(0, 50).map((item) => {
    const data = item && typeof item === "object" && !Array.isArray(item) ? item : {};
    return {
      id: String(data.id || crypto.randomUUID()).trim() || crypto.randomUUID(),
      title: cleanQuickReplyText(data.title, 140),
      desc: cleanQuickReplyText(data.desc, 5000)
    };
  }).filter((item) => item.title || item.desc);
}

function decodeQuickReplyTemplateItems(value) {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const decoded = JSON.parse(value);
    return cleanQuickReplyTemplateItems(decoded);
  } catch (error) {
    return [];
  }
}

function quickReplySecretDocRef(companyId) {
  return admin.firestore().collection("quickReplySecrets").doc(companyId);
}

function quickReplyContributionCollectionRef(companyId) {
  return admin.firestore().collection("companies").doc(companyId).collection("quickReplyContributions");
}

function quickReplyUserSettingsDocRef(companyId, uid) {
  return admin.firestore().collection("companies").doc(companyId).collection("quickReplyUserSettings").doc(uid);
}

function personalInterfaceSettingsDocRef(companyId, uid) {
  return admin.firestore().collection("companies").doc(companyId).collection("personalInterfaceSettings").doc(uid);
}

function cleanPersonalTheme(value, fallback = "System") {
  const normalized = String(value || "").trim();
  return ["System", "Light", "Dark"].includes(normalized) ? normalized : fallback;
}

function personalInterfaceSettingsFromData(data = {}, fallbackData = {}) {
  const booleanSetting = (key, fallback = true) =>
    Object.prototype.hasOwnProperty.call(data, key) ? data[key] !== false :
    Object.prototype.hasOwnProperty.call(fallbackData, key) ? fallbackData[key] !== false : fallback;
  return {
    // Appearance and language are strictly personal and must never fall back
    // to another workspace member's shared/legacy preference.
    appTheme: cleanPersonalTheme(data.appTheme, "System"),
    selectedLanguage: cleanQuickReplyText(data.selectedLanguage || "English", 80) || "English",
    pdfShowCustomer: booleanSetting("pdfShowCustomer"),
    pdfShowContact: booleanSetting("pdfShowContact"),
    pdfShowPreview: booleanSetting("pdfShowPreview"),
    pdfShowMaterials: booleanSetting("pdfShowMaterials"),
    pdfShowPriority: booleanSetting("pdfShowPriority"),
    pdfShowStatus: booleanSetting("pdfShowStatus"),
    pdfShowShipping: booleanSetting("pdfShowShipping")
  };
}

function canManagePersonalQuickReplySettings(companyData = {}, uid = "") {
  const role = normalizeWorkspaceRole(workspaceOrderRole(companyData, uid));
  return isQuickReplyOwner(companyData, uid) || ["admin", "member", "workflowOnly"].includes(role);
}

function personalQuickReplySettingsFromData(data = {}, companySettings = {}) {
  return {
    replyMode: cleanQuickReplyMode(data.replyMode, cleanQuickReplyMode(companySettings.replyMode, "AI")),
    quickReplyPoliteness: cleanQuickReplyOption(data.quickReplyPoliteness, QUICK_REPLY_POLITENESS, cleanQuickReplyOption(companySettings.quickReplyPoliteness, QUICK_REPLY_POLITENESS, "Warm")),
    quickReplyLength: cleanQuickReplyOption(data.quickReplyLength, QUICK_REPLY_LENGTHS, cleanQuickReplyOption(companySettings.quickReplyLength, QUICK_REPLY_LENGTHS, "Short")),
    onDeviceKnowledgeBase: cleanQuickReplyText(data.onDeviceKnowledgeBase, 50000),
    offlineProductsJSON: JSON.stringify(cleanQuickReplyTemplateItems(decodeQuickReplyTemplateItems(data.offlineProductsJSON).length ? decodeQuickReplyTemplateItems(data.offlineProductsJSON) : decodeQuickReplyTemplateItems(companySettings.customProductsJSON))),
    offlineRulesJSON: JSON.stringify(cleanQuickReplyTemplateItems(decodeQuickReplyTemplateItems(data.offlineRulesJSON).length ? decodeQuickReplyTemplateItems(data.offlineRulesJSON) : decodeQuickReplyTemplateItems(companySettings.customRulesJSON)))
  };
}

function isQuickReplyOwner(companyData = {}, uid = "") {
  return uidIsCompanyOwner(companyData, uid) || normalizeWorkspaceRole(workspaceOrderRole(companyData, uid)) === "owner";
}

function canContributeQuickReplyKnowledge(companyData = {}, uid = "") {
  const role = normalizeWorkspaceRole(workspaceOrderRole(companyData, uid));
  return isQuickReplyOwner(companyData, uid) || ["admin", "member", "workflowOnly"].includes(role);
}

async function secureQuickReplyOpenAIKey(companyId, settingsData = {}) {
  const secretRef = quickReplySecretDocRef(companyId);
  const secretSnap = await secretRef.get();
  let key = secretSnap.exists ? String(secretSnap.data()?.openAIKey || "").trim() : "";
  const legacyKey = String(settingsData.openAIKey || "").trim();

  if (!key && legacyKey) {
    key = legacyKey;
    await secretRef.set({
      openAIKey: key,
      companyId,
      migratedFromLegacySettingsAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  if (legacyKey || settingsData.hasOpenAIKey !== Boolean(key)) {
    await companySettingsDocRef(companyId).set({
      openAIKey: admin.firestore.FieldValue.delete(),
      hasOpenAIKey: Boolean(key),
      quickReplySecretMigratedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }
  return key;
}

async function quickReplyKnowledgeWithContributions(companyId, mainKnowledge) {
  const snapshot = await quickReplyContributionCollectionRef(companyId).limit(100).get();
  const additions = snapshot.docs.map((document) => {
    const data = document.data() || {};
    const text = cleanQuickReplyText(data.text, 4000);
    const author = cleanQuickReplyText(data.authorName || data.authorEmail || "Team member", 120);
    return text ? `- ${author}: ${text}` : "";
  }).filter(Boolean);
  const core = cleanQuickReplyText(mainKnowledge, 50000);
  if (additions.length === 0) return core;
  return `${core}\n\n--- TEAM CONTRIBUTIONS ---\n${additions.join("\n")}`.trim();
}

function quickReplySettingsFromData(data = {}) {
  return {
    replyMode: cleanQuickReplyMode(data.replyMode, "AI"),
    quickReplyPoliteness: cleanQuickReplyOption(data.quickReplyPoliteness, QUICK_REPLY_POLITENESS, "Warm"),
    quickReplyLength: cleanQuickReplyOption(data.quickReplyLength, QUICK_REPLY_LENGTHS, "Short"),
    aiKnowledgeBase: String(data.aiKnowledgeBase || ""),
    hasOpenAIKey: data.hasOpenAIKey === true || String(data.openAIKey || "").trim().length > 0,
    products: decodeQuickReplyTemplateItems(data.customProductsJSON),
    rules: decodeQuickReplyTemplateItems(data.customRulesJSON)
  };
}

function quickReplyPolitenessInstruction(politeness) {
  switch (politeness) {
    case "Direct":
      return "Tone: polite but direct, minimal extra warmth.";
    case "Very Polite":
      return "Tone: very polite, warm, appreciative and careful without sounding overly salesy.";
    default:
      return "Tone: warm, polite and professional.";
  }
}

function quickReplyLengthInstruction(length) {
  switch (length) {
    case "Balanced":
      return "Length: balanced, around 2 to 4 short paragraphs.";
    case "Detailed":
      return "Length: detailed when useful, but still clear and easy to read.";
    default:
      return "Length: short and concise, usually 1 to 2 short paragraphs.";
  }
}

function quickReplyStyleInstruction(politeness, length) {
  return `${quickReplyPolitenessInstruction(politeness)}\n${quickReplyLengthInstruction(length)}`;
}

function quickReplySystemPrompt(knowledge, politeness, length) {
  return "You are the official Customer Support AI for this company.\nSTYLE INSTRUCTIONS:\n" +
    `${quickReplyStyleInstruction(politeness, length)}\n\n` +
    "CRITICAL INSTRUCTION:\n" +
    "Your ONLY source of truth is the 'COMPANY KNOWLEDGE BASE' provided below.\n" +
    "You MUST base your entire response strictly on this knowledge base.\n" +
    "Do NOT use any outside knowledge. Do NOT guess, invent, or hallucinate prices, timelines, or rules.\n" +
    "If the answer to the customer's question is NOT in the knowledge base, politely state that you will check with the team and get back to them.\n\n" +
    "--- COMPANY KNOWLEDGE BASE START ---\n" +
    `${knowledge.trim() ? knowledge : "No specific rules provided. Just be polite and say we will contact them soon."}\n` +
    "--- COMPANY KNOWLEDGE BASE END ---\n\n" +
    "INSTRUCTIONS FOR REPLY:\n" +
    "1. Extract the customer's name from their message and greet them personally. If no name is found, use a polite greeting like 'Hi there,'.\n" +
    "2. Answer specifically what they asked using ONLY facts from the Knowledge Base.\n" +
    "3. Be warm and highly professional in your tone.\n" +
    "4. Sign off as 'The Team'.";
}

function quickReplyLimitedText(value, maxCharacters) {
  const text = String(value || "");
  return text.length > maxCharacters ? text.slice(0, maxCharacters) : text;
}

function quickReplyGreetingForName(name, politeness) {
  const trimmedName = String(name || "").trim();
  if (!trimmedName) return politeness === "Direct" ? "Hi," : "Hi there,";
  return politeness === "Very Polite" ? `Dear ${trimmedName},` : `Hi ${trimmedName},`;
}

function quickReplySignOff(politeness) {
  return politeness === "Very Polite" ? "Kind regards," : "Best regards,";
}

function generateOfflineQuickReply(settings, input = {}) {
  const politeness = cleanQuickReplyOption(input.politeness || settings.quickReplyPoliteness, QUICK_REPLY_POLITENESS, "Warm");
  const length = cleanQuickReplyOption(input.length || settings.quickReplyLength, QUICK_REPLY_LENGTHS, "Short");
  const selectedCategory = String(input.selectedCategory || "").trim();
  const selectedTopic = String(input.selectedTopic || "Price & Info").trim() || "Price & Info";
  const product = settings.products.find((item) => item.title === selectedCategory) || settings.products[0] || null;
  const rule = settings.rules.find((item) => item.title === selectedTopic) || null;
  let bodyText = "";

  if (selectedTopic === "Price & Info") {
    bodyText = politeness === "Direct" ? "" : "Thank you for your interest!\n\n";
    bodyText += product?.desc || "Thank you for your message. We will get back to you shortly.";
    if (length !== "Short") {
      bodyText += "\n\nPlease let me know if you have any other questions.";
    }
  } else if (rule) {
    bodyText = rule.desc;
  } else {
    bodyText = "Thank you for your message. We will get back to you shortly.";
  }

  if (length === "Detailed") {
    bodyText += "\n\nIf helpful, please send any additional details and we will guide you through the next step.";
  }

  return [
    quickReplyGreetingForName(input.customerName, politeness),
    bodyText.trim(),
    `${quickReplySignOff(politeness)}\nThe Team`
  ].filter(Boolean).join("\n\n");
}

function uidCanEditWorkspaceSettings(companyData = {}, uid = "") {
  return uidCanAccessWorkspaceArea(companyData, uid, "settings") && canFullyEditOrder(workspaceOrderRole(companyData, uid));
}

exports.saveQuickReplySettings = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyData } = await requireWorkspaceForBilling(request, false);
  requireWorkspaceAreaAccess(companyData, uid, "quickReply", "Quick Reply is not enabled for your workspace account.");
  requireWorkspaceAreaAccess(companyData, uid, "settingsQuickReply", "Quick Reply Settings are not enabled for your role.");

  const incoming = request.data?.settings && typeof request.data.settings === "object" ? request.data.settings : {};
  const ownerOnlyFields = ["replyMode", "aiKnowledgeBase", "openAIKey", "products", "rules"];
  const changesOwnerOnlySettings = ownerOnlyFields.some((field) => Object.prototype.hasOwnProperty.call(incoming, field));
  if (changesOwnerOnlySettings && !isQuickReplyOwner(companyData, uid)) {
    throw new HttpsError("permission-denied", "Only the workspace owner can manage the OpenAI key and Company Knowledge Base.");
  }

  const updates = { quickReplySettingsUpdatedAt: admin.firestore.FieldValue.serverTimestamp() };
  if (Object.prototype.hasOwnProperty.call(incoming, "replyMode")) {
    updates.replyMode = cleanQuickReplyMode(incoming.replyMode, "AI");
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "quickReplyPoliteness")) {
    updates.quickReplyPoliteness = cleanQuickReplyOption(incoming.quickReplyPoliteness, QUICK_REPLY_POLITENESS, "Warm");
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "quickReplyLength")) {
    updates.quickReplyLength = cleanQuickReplyOption(incoming.quickReplyLength, QUICK_REPLY_LENGTHS, "Short");
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "aiKnowledgeBase")) {
    updates.aiKnowledgeBase = cleanQuickReplyText(incoming.aiKnowledgeBase, 50000);
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "products")) {
    updates.customProductsJSON = JSON.stringify(cleanQuickReplyTemplateItems(incoming.products));
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "rules")) {
    updates.customRulesJSON = JSON.stringify(cleanQuickReplyTemplateItems(incoming.rules));
  }

  const settingsRef = companySettingsDocRef(companyId);
  if (Object.prototype.hasOwnProperty.call(incoming, "openAIKey")) {
    const cleanKey = cleanQuickReplyText(incoming.openAIKey, 500);
    if (cleanKey) {
      await quickReplySecretDocRef(companyId).set({
        companyId,
        openAIKey: cleanKey,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedByUid: uid
      }, { merge: true });
    } else {
      await quickReplySecretDocRef(companyId).delete().catch(() => undefined);
    }
    updates.hasOpenAIKey = Boolean(cleanKey);
  }

  // Always strip a legacy client-readable key after an owner settings save.
  updates.openAIKey = admin.firestore.FieldValue.delete();
  await settingsRef.set(updates, { merge: true });
  const settingsSnapshot = await settingsRef.get();

  return {
    ok: true,
    companyId,
    settings: quickReplySettingsFromData(settingsSnapshot.exists ? settingsSnapshot.data() || {} : {}),
    message: "Quick Reply settings saved securely."
  };
});

exports.getPersonalInterfaceSettings = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyData } = await requireWorkspaceForBilling(request, false);
  // Personal language + theme (and finance-free PDF flags) are available to EVERY
  // workspace member regardless of role — owner, admin, member, workflow and custom
  // roles each keep their own per-user language/theme across all their devices.
  if (!uidHasCompanyAccess(companyData, uid)) throw new HttpsError("permission-denied", "You do not have access to this workspace.");
  const [personalSnapshot, sharedSnapshot] = await Promise.all([
    personalInterfaceSettingsDocRef(companyId, uid).get(),
    companySettingsDocRef(companyId).get()
  ]);
  return {
    ok: true,
    settings: personalInterfaceSettingsFromData(
      personalSnapshot.exists ? personalSnapshot.data() || {} : {},
      sharedSnapshot.exists ? sharedSnapshot.data() || {} : {}
    )
  };
});

exports.savePersonalInterfaceSettings = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyData } = await requireWorkspaceForBilling(request, false);
  // Personal language + theme (and finance-free PDF flags) are available to EVERY
  // workspace member regardless of role. Each user keeps their own per-user
  // language/theme across all their devices; this never touches workspace-wide data.
  if (!uidHasCompanyAccess(companyData, uid)) throw new HttpsError("permission-denied", "You do not have access to this workspace.");
  const incoming = request.data?.settings && typeof request.data.settings === "object" ? request.data.settings : {};
  const updates = { companyId, userId: uid, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedByUid: uid };
  if (Object.prototype.hasOwnProperty.call(incoming, "appTheme")) updates.appTheme = cleanPersonalTheme(incoming.appTheme, "System");
  if (Object.prototype.hasOwnProperty.call(incoming, "selectedLanguage")) updates.selectedLanguage = cleanQuickReplyText(incoming.selectedLanguage, 80) || "English";
  const pdfKeys = ["pdfShowCustomer", "pdfShowContact", "pdfShowPreview", "pdfShowMaterials", "pdfShowPriority", "pdfShowStatus", "pdfShowShipping"];
  if (pdfKeys.some((key) => Object.prototype.hasOwnProperty.call(incoming, key))) {
    requireWorkspaceAreaAccess(companyData, uid, "exportData", "PDF Export is not enabled for your workspace account.");
    for (const key of pdfKeys) if (Object.prototype.hasOwnProperty.call(incoming, key)) updates[key] = incoming[key] !== false;
  }
  await personalInterfaceSettingsDocRef(companyId, uid).set(updates, { merge: true });
  const [saved, sharedSnapshot] = await Promise.all([
    personalInterfaceSettingsDocRef(companyId, uid).get(),
    companySettingsDocRef(companyId).get()
  ]);
  return {
    ok: true,
    settings: personalInterfaceSettingsFromData(
      saved.data() || {},
      sharedSnapshot.exists ? sharedSnapshot.data() || {} : {}
    ),
    message: "Personal settings saved."
  };
});

exports.getQuickReplyPersonalSettings = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyData } = await requireWorkspaceForBilling(request, false);
  requireWorkspaceAreaAccess(companyData, uid, "quickReply", "Quick Reply is not enabled for your workspace account.");
  if (!canManagePersonalQuickReplySettings(companyData, uid)) {
    throw new HttpsError("permission-denied", "Your workspace role cannot manage personal Quick Reply settings.");
  }
  const [userSnapshot, companySnapshot] = await Promise.all([
    quickReplyUserSettingsDocRef(companyId, uid).get(),
    companySettingsDocRef(companyId).get()
  ]);
  return {
    ok: true,
    settings: personalQuickReplySettingsFromData(
      userSnapshot.exists ? userSnapshot.data() || {} : {},
      companySnapshot.exists ? companySnapshot.data() || {} : {}
    )
  };
});

exports.saveQuickReplyPersonalSettings = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyData } = await requireWorkspaceForBilling(request, false);
  requireWorkspaceAreaAccess(companyData, uid, "quickReply", "Quick Reply is not enabled for your workspace account.");
  if (!canManagePersonalQuickReplySettings(companyData, uid)) {
    throw new HttpsError("permission-denied", "Your workspace role cannot manage personal Quick Reply settings.");
  }

  const incoming = request.data?.settings && typeof request.data.settings === "object" ? request.data.settings : {};
  const updates = {
    companyId,
    userId: uid,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedByUid: uid
  };
  if (Object.prototype.hasOwnProperty.call(incoming, "replyMode")) {
    updates.replyMode = cleanQuickReplyMode(incoming.replyMode, "AI");
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "quickReplyPoliteness")) {
    updates.quickReplyPoliteness = cleanQuickReplyOption(incoming.quickReplyPoliteness, QUICK_REPLY_POLITENESS, "Warm");
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "quickReplyLength")) {
    updates.quickReplyLength = cleanQuickReplyOption(incoming.quickReplyLength, QUICK_REPLY_LENGTHS, "Short");
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "onDeviceKnowledgeBase")) {
    updates.onDeviceKnowledgeBase = cleanQuickReplyText(incoming.onDeviceKnowledgeBase, 50000);
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "products")) {
    updates.offlineProductsJSON = JSON.stringify(cleanQuickReplyTemplateItems(incoming.products));
  } else if (Object.prototype.hasOwnProperty.call(incoming, "customProductsJSON")) {
    updates.offlineProductsJSON = JSON.stringify(decodeQuickReplyTemplateItems(String(incoming.customProductsJSON || "")));
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "rules")) {
    updates.offlineRulesJSON = JSON.stringify(cleanQuickReplyTemplateItems(incoming.rules));
  } else if (Object.prototype.hasOwnProperty.call(incoming, "customRulesJSON")) {
    updates.offlineRulesJSON = JSON.stringify(decodeQuickReplyTemplateItems(String(incoming.customRulesJSON || "")));
  }

  const ref = quickReplyUserSettingsDocRef(companyId, uid);
  await ref.set(updates, { merge: true });
  const [savedSnapshot, companySnapshot] = await Promise.all([ref.get(), companySettingsDocRef(companyId).get()]);
  return {
    ok: true,
    message: "Your Quick Reply settings were saved.",
    settings: personalQuickReplySettingsFromData(
      savedSnapshot.data() || {},
      companySnapshot.exists ? companySnapshot.data() || {} : {}
    )
  };
});

exports.listQuickReplyContributions = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyData } = await requireWorkspaceForBilling(request, false);
  requireWorkspaceAreaAccess(companyData, uid, "quickReply", "Quick Reply is not enabled for your workspace account.");
  const snapshot = await quickReplyContributionCollectionRef(companyId).limit(100).get();
  const items = snapshot.docs.map((document) => {
    const data = document.data() || {};
    return {
      id: document.id,
      text: cleanQuickReplyText(data.text, 4000),
      authorUid: String(data.authorUid || ""),
      authorName: cleanQuickReplyText(data.authorName || data.authorEmail || "Team member", 120),
      canDelete: isQuickReplyOwner(companyData, uid) || String(data.authorUid || "") === uid
    };
  }).filter((item) => item.text);
  return { ok: true, items };
});

exports.saveQuickReplyContribution = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, email, companyId, companyData } = await requireWorkspaceForBilling(request, false);
  requireWorkspaceAreaAccess(companyData, uid, "quickReply", "Quick Reply is not enabled for your workspace account.");
  if (!canContributeQuickReplyKnowledge(companyData, uid)) {
    throw new HttpsError("permission-denied", "Your workspace role cannot add Knowledge Base contributions.");
  }
  const text = cleanQuickReplyText(request.data?.text, 4000);
  if (!text) throw new HttpsError("invalid-argument", "Contribution text is empty.");
  const member = (companyData.members || {})[uid] || {};
  const ref = quickReplyContributionCollectionRef(companyId).doc();
  await ref.set({
    id: ref.id,
    text,
    authorUid: uid,
    authorEmail: String(email || "").toLowerCase(),
    authorName: cleanQuickReplyText(member.displayName || member.name || email || "Team member", 120),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return { ok: true, message: "Contribution added to the workspace Knowledge Base." };
});

exports.deleteQuickReplyContribution = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyData } = await requireWorkspaceForBilling(request, false);
  const contributionId = cleanQuickReplyText(request.data?.contributionId, 160);
  if (!contributionId) throw new HttpsError("invalid-argument", "Contribution is missing.");
  const ref = quickReplyContributionCollectionRef(companyId).doc(contributionId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: true };
  const authorUid = String(snap.data()?.authorUid || "");
  if (!isQuickReplyOwner(companyData, uid) && authorUid !== uid) {
    throw new HttpsError("permission-denied", "Only the owner or the author can delete this contribution.");
  }
  await ref.delete();
  return { ok: true, message: "Contribution removed." };
});

exports.generateQuickReply = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyData } = await requireWorkspaceForBilling(request, false);
  requireWorkspaceAreaAccess(companyData, uid, "quickReply", "Quick Reply is not enabled for your workspace account.");
  const settingsSnapshot = await companySettingsDocRef(companyId).get();
  const settingsData = settingsSnapshot.exists ? settingsSnapshot.data() || {} : {};
  const settings = quickReplySettingsFromData(settingsData);
  const requestedMode = cleanQuickReplyMode(request.data?.mode || settings.replyMode, settings.replyMode);
  const politeness = cleanQuickReplyOption(request.data?.politeness || settings.quickReplyPoliteness, QUICK_REPLY_POLITENESS, "Warm");
  const length = cleanQuickReplyOption(request.data?.length || settings.quickReplyLength, QUICK_REPLY_LENGTHS, "Short");

  if (requestedMode === "Offline") {
    return {
      ok: true,
      companyId,
      mode: "Offline",
      reply: generateOfflineQuickReply(settings, {
        customerName: request.data?.customerName,
        selectedCategory: request.data?.selectedCategory,
        selectedTopic: request.data?.selectedTopic,
        politeness,
        length
      })
    };
  }

  if (requestedMode === "Apple") {
    throw new HttpsError("failed-precondition", "Apple On-Device AI replies are only available in the Swift app on Apple Intelligence-capable devices. Use OpenAI Online or Offline Template on web.");
  }

  const apiKey = await secureQuickReplyOpenAIKey(companyId, settingsData);
  const customerMessage = cleanQuickReplyText(request.data?.customerMessage, 12000);
  const knowledge = await quickReplyKnowledgeWithContributions(companyId, settingsData.aiKnowledgeBase);

  if (!apiKey) {
    throw new HttpsError("failed-precondition", "OpenAI API Key is missing. Add it in Settings > Quick Reply Settings.");
  }
  if (!customerMessage) {
    throw new HttpsError("invalid-argument", "Customer message is empty. Please paste a message.");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: quickReplySystemPrompt(knowledge, politeness, length) },
        { role: "user", content: `Customer Message: "${quickReplyLimitedText(customerMessage, 12000)}"` }
      ],
      temperature: 0.2
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiMessage = payload?.error?.message ? String(payload.error.message) : "OpenAI could not generate a reply.";
    throw new HttpsError("internal", `OpenAI API Error (${response.status}): ${apiMessage}`);
  }

  const reply = String(payload?.choices?.[0]?.message?.content || "").trim();
  if (!reply) {
    throw new HttpsError("internal", "OpenAI returned no response text.");
  }

  return {
    ok: true,
    companyId,
    mode: "AI",
    reply
  };
});

function cleanUploadSafetyMaxFileSizeMB(value, fallback = 10) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.round(number), 1), 50);
}

function uploadSafetySettingsFromData(data = {}) {
  return {
    uploadSafetyRequirePolicyAcceptance: typeof data.uploadSafetyRequirePolicyAcceptanceV1 === "boolean"
      ? data.uploadSafetyRequirePolicyAcceptanceV1
      : typeof data.uploadSafetyRequirePolicyAcceptance === "boolean"
        ? data.uploadSafetyRequirePolicyAcceptance
        : true,
    uploadSafetyMaxFileSizeMB: cleanUploadSafetyMaxFileSizeMB(
      data.uploadSafetyMaxFileSizeMBV1 ?? data.uploadSafetyMaxFileSizeMB,
      10
    )
  };
}

function cleanPdfBoolean(value, fallback = true) {
  return typeof value === "boolean" ? value : fallback;
}

const FINANCIAL_CURRENCY_SYMBOLS = new Set(["£", "$", "€", "₺", "¥", "A$", "C$", "CHF", "د.إ"]);
const TAX_CALCULATION_TYPES = new Set(["Revenue", "Profit"]);
const STUDIO_LANGUAGES = new Set(["English", "Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"]);

function cleanStudioLanguage(value, fallback = "English") {
  const raw = String(value || "").trim();
  return STUDIO_LANGUAGES.has(raw) ? raw : fallback;
}

function cleanFinancialCurrency(value, fallback = "£") {
  const raw = String(value || "").trim();
  return FINANCIAL_CURRENCY_SYMBOLS.has(raw) ? raw : fallback;
}

function cleanDecimalSeparator(value, fallback = ".") {
  const raw = String(value || "").trim();
  return raw === "," || raw === "." ? raw : fallback;
}

function cleanPercentageNumber(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, 0), 100);
}

function cleanTaxCalculationType(value, fallback = "Revenue") {
  const raw = String(value || "").trim();
  return TAX_CALCULATION_TYPES.has(raw) ? raw : fallback;
}

function cleanTaxMilestoneDate(value, fallback = Date.now() / 1000) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return number;
}

function financialSettingsFromData(data = {}) {
  return {
    selectedCurrency: cleanFinancialCurrency(data.seciliParaBirimi, "£"),
    selectedDecimalSeparator: cleanDecimalSeparator(data.seciliOndalik, "."),
    feePercentage: cleanPercentageNumber(data.feePercentage, 3),
    taxRuleNameRevenue: cleanQuickReplyText(data.taxRuleNameRevenue || "Standard Tax (Services/New)", 120),
    taxRuleNameProfit: cleanQuickReplyText(data.taxRuleNameProfit || "Margin Scheme (2nd Hand)", 120),
    defaultTaxRate: cleanPercentageNumber(data.defaultTaxRate, 20),
    taxCalculationType: cleanTaxCalculationType(data.taxCalculationType, "Revenue"),
    taxMilestoneEnabled: typeof data.taxMilestoneEnabled === "boolean" ? data.taxMilestoneEnabled : false,
    taxMilestoneDate: cleanTaxMilestoneDate(data.taxMilestoneDate, Date.now() / 1000)
  };
}

function languageSettingsFromData(data = {}) {
  return {
    selectedLanguage: cleanStudioLanguage(data.seciliDil, "English")
  };
}

function cleanAppTheme(value, fallback = "System") {
  const raw = String(value || "").trim();
  return raw === "Light" || raw === "Dark" || raw === "System" ? raw : fallback;
}

function themeBrandingSettingsFromData(data = {}) {
  return {
    appTheme: cleanAppTheme(data.appTheme, "System"),
    appSubtitle: cleanQuickReplyText(data.appSubtitle || "Bespoke Hand-Painted Dials", 120)
  };
}

function financialTaxTypeForPaymentDate(settings = {}, paymentDate = new Date()) {
  const date = paymentDate instanceof Date && !Number.isNaN(paymentDate.getTime()) ? paymentDate : new Date();
  if (settings.taxMilestoneEnabled) {
    return date.getTime() / 1000 >= cleanTaxMilestoneDate(settings.taxMilestoneDate, Date.now() / 1000) ? "Revenue" : "Profit";
  }
  return cleanTaxCalculationType(settings.taxCalculationType, "Revenue");
}

function cleanCompanyNumbers(value) {
  const source = Array.isArray(value) ? value : [];
  const output = [];
  for (const item of source) {
    const data = item && typeof item === "object" && !Array.isArray(item) ? item : {};
    const title = cleanQuickReplyText(data.title, 80);
    const numberValue = cleanQuickReplyText(data.value, 160);
    if (!title && !numberValue) continue;
    output.push({
      id: cleanQuickReplyText(data.id, 80) || crypto.randomUUID(),
      title,
      value: numberValue
    });
  }
  return output.slice(0, 20);
}

function pdfExportSettingsFromData(data = {}) {
  let companyNumbers = [];
  try {
    const decoded = JSON.parse(String(data.companyNumbersJSON || ""));
    companyNumbers = cleanCompanyNumbers(decoded);
  } catch {
    companyNumbers = [];
  }

  return {
    pdfShowCustomer: cleanPdfBoolean(data.pdfShowCustomer, true),
    pdfShowContact: cleanPdfBoolean(data.pdfShowContact, true),
    pdfShowPreview: cleanPdfBoolean(data.pdfShowPreview, true),
    pdfShowFinCustomer: cleanPdfBoolean(data.pdfShowFinCustomer, true),
    pdfShowPaymentMethod: cleanPdfBoolean(data.pdfShowPaymentMethod, true),
    pdfShowFinInternal: cleanPdfBoolean(data.pdfShowFinInternal, false),
    pdfShowStatus: cleanPdfBoolean(data.pdfShowStatus, true),
    pdfShowShipping: cleanPdfBoolean(data.pdfShowShipping, true),
    pdfShowMaterials: cleanPdfBoolean(data.pdfShowMaterials, true),
    pdfShowPriority: cleanPdfBoolean(data.pdfShowPriority, true),
    companyNumbers
  };
}

exports.savePdfExportSettings = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyData } = await requireWorkspaceForBilling(request, false);
  if (!uidCanEditWorkspaceSettings(companyData, uid)) {
    throw new HttpsError("permission-denied", "Your workspace role cannot edit PDF Export settings.");
  }
  requireWorkspaceAreaAccess(companyData, uid, "exportData", "Export settings are not enabled for your workspace account.");
  requireWorkspaceAreaAccess(companyData, uid, "settingsPdf", "PDF Export Settings are not enabled for your role.");

  const incoming = request.data?.settings && typeof request.data.settings === "object" ? request.data.settings : {};
  const settingsRef = companySettingsDocRef(companyId);
  const updates = {
    pdfShowCustomer: cleanPdfBoolean(incoming.pdfShowCustomer, true),
    pdfShowContact: cleanPdfBoolean(incoming.pdfShowContact, true),
    pdfShowPreview: cleanPdfBoolean(incoming.pdfShowPreview, true),
    pdfShowFinCustomer: cleanPdfBoolean(incoming.pdfShowFinCustomer, true),
    pdfShowPaymentMethod: cleanPdfBoolean(incoming.pdfShowPaymentMethod, true),
    pdfShowFinInternal: cleanPdfBoolean(incoming.pdfShowFinInternal, false),
    pdfShowStatus: cleanPdfBoolean(incoming.pdfShowStatus, true),
    pdfShowShipping: cleanPdfBoolean(incoming.pdfShowShipping, true),
    pdfShowMaterials: cleanPdfBoolean(incoming.pdfShowMaterials, true),
    pdfShowPriority: cleanPdfBoolean(incoming.pdfShowPriority, true),
    companyNumbersJSON: JSON.stringify(cleanCompanyNumbers(incoming.companyNumbers)),
    pdfExportSettingsUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  await settingsRef.set(updates, { merge: true });
  const settingsSnapshot = await settingsRef.get();
  return {
    ok: true,
    companyId,
    settings: pdfExportSettingsFromData(settingsSnapshot.exists ? settingsSnapshot.data() || {} : {}),
    message: "PDF Export settings saved."
  };
});

exports.saveFinancialSettings = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyData } = await requireWorkspaceForBilling(request, false);
  if (!uidCanEditWorkspaceSettings(companyData, uid)) {
    throw new HttpsError("permission-denied", "Your workspace role cannot edit Financial Settings.");
  }
  requireWorkspaceAreaAccess(companyData, uid, "financialInfo", "Financial Info is not enabled for your workspace account.");
  requireWorkspaceAreaAccess(companyData, uid, "settingsFinancial", "Financial Settings are not enabled for your role.");
  if (billingEntitlementsForCompany(companyData).advancedFinanceEnabled !== true) {
    throw new HttpsError("failed-precondition", "Advanced Financial Settings are available on NivaDesk Pro and Team.");
  }

  const incoming = request.data?.settings && typeof request.data.settings === "object" ? request.data.settings : {};
  const updates = {
    seciliParaBirimi: cleanFinancialCurrency(incoming.selectedCurrency, "£"),
    seciliOndalik: cleanDecimalSeparator(incoming.selectedDecimalSeparator, "."),
    feePercentage: cleanPercentageNumber(incoming.feePercentage, 3),
    taxRuleNameRevenue: cleanQuickReplyText(incoming.taxRuleNameRevenue || "Standard Tax (Services/New)", 120),
    taxRuleNameProfit: cleanQuickReplyText(incoming.taxRuleNameProfit || "Margin Scheme (2nd Hand)", 120),
    defaultTaxRate: cleanPercentageNumber(incoming.defaultTaxRate, 20),
    taxCalculationType: cleanTaxCalculationType(incoming.taxCalculationType, "Revenue"),
    taxMilestoneEnabled: typeof incoming.taxMilestoneEnabled === "boolean" ? incoming.taxMilestoneEnabled : false,
    taxMilestoneDate: cleanTaxMilestoneDate(incoming.taxMilestoneDate, Date.now() / 1000),
    financialSettingsUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  const settingsRef = companySettingsDocRef(companyId);
  await settingsRef.set(updates, { merge: true });
  const settingsSnapshot = await settingsRef.get();
  return {
    ok: true,
    companyId,
    settings: financialSettingsFromData(settingsSnapshot.exists ? settingsSnapshot.data() || {} : {}),
    message: "Financial settings saved."
  };
});

exports.saveLanguageSettings = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyData } = await requireWorkspaceForBilling(request, false);
  if (!uidCanEditWorkspaceSettings(companyData, uid)) {
    throw new HttpsError("permission-denied", "Your workspace role cannot edit Language & Labels.");
  }
  requireWorkspaceAreaAccess(companyData, uid, "settingsGeneral", "General settings are not enabled for your role.");

  // Language is STRICTLY per-user now. We never write `seciliDil` to the shared
  // companySettings doc anymore (that would make every workspace member inherit the
  // same language). Persist it to the caller's personal interface settings instead
  // so each user keeps their own language across their devices.
  const incoming = request.data?.settings && typeof request.data.settings === "object" ? request.data.settings : {};
  const language = cleanStudioLanguage(incoming.selectedLanguage, "English");
  await personalInterfaceSettingsDocRef(companyId, uid).set({
    companyId,
    userId: uid,
    selectedLanguage: language,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedByUid: uid
  }, { merge: true });
  return {
    ok: true,
    companyId,
    settings: { selectedLanguage: language },
    message: "Language settings saved."
  };
});

exports.saveThemeBrandingSettings = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyData } = await requireWorkspaceForBilling(request, false);
  if (!uidCanEditWorkspaceSettings(companyData, uid)) {
    throw new HttpsError("permission-denied", "Your workspace role cannot edit Theme & Branding.");
  }
  requireWorkspaceAreaAccess(companyData, uid, "settingsGeneral", "General settings are not enabled for your role.");

  const incoming = request.data?.settings && typeof request.data.settings === "object" ? request.data.settings : {};
  const updates = {
    themeBrandingSettingsUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  // appSubtitle remains a shared workspace branding field.
  if (Object.prototype.hasOwnProperty.call(incoming, "appSubtitle")) {
    updates.appSubtitle = cleanQuickReplyText(incoming.appSubtitle || "Bespoke Hand-Painted Dials", 120);
  }
  // Theme is STRICTLY per-user — if an appTheme arrives here it's persisted to the
  // caller's personal interface settings, NEVER to the shared companySettings doc,
  // so members no longer inherit the owner's theme.
  if (Object.prototype.hasOwnProperty.call(incoming, "appTheme")) {
    await personalInterfaceSettingsDocRef(companyId, uid).set({
      companyId,
      userId: uid,
      appTheme: cleanAppTheme(incoming.appTheme, "System"),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedByUid: uid
    }, { merge: true });
  }

  const settingsRef = companySettingsDocRef(companyId);
  await settingsRef.set(updates, { merge: true });
  const settingsSnapshot = await settingsRef.get();
  return {
    ok: true,
    companyId,
    settings: themeBrandingSettingsFromData(settingsSnapshot.exists ? settingsSnapshot.data() || {} : {}),
    message: "Theme & Branding settings saved."
  };
});

exports.recalculateFinancialSettingsForOrders = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyData } = await requireWorkspaceForBilling(request, false);
  if (!uidCanEditWorkspaceSettings(companyData, uid)) {
    throw new HttpsError("permission-denied", "Your workspace role cannot recalculate Financial Settings.");
  }
  requireWorkspaceAreaAccess(companyData, uid, "financialInfo", "Financial Info is not enabled for your workspace account.");
  if (billingEntitlementsForCompany(companyData).advancedFinanceEnabled !== true) {
    throw new HttpsError("failed-precondition", "Advanced Financial Settings are available on NivaDesk Pro and Team.");
  }

  const db = admin.firestore();
  const settingsSnapshot = await companySettingsDocRef(companyId).get();
  const financialSettings = financialSettingsFromData(settingsSnapshot.exists ? settingsSnapshot.data() || {} : {});
  const email = String(request.auth?.token?.email || "");
  const snapshot = await db.collection("siparisler").where("companyId", "==", companyId).get();
  let batch = db.batch();
  let batchCount = 0;
  let updatedCount = 0;

  async function commitBatchIfNeeded(force = false) {
    if (batchCount === 0) return;
    if (!force && batchCount < 400) return;
    await batch.commit();
    batch = db.batch();
    batchCount = 0;
  }

  for (const orderDoc of snapshot.docs) {
    const orderData = orderDoc.data() || {};
    const paidAmount = roundMoneyValue(orderData.paidAmount);
    const remainingAmount = roundMoneyValue(orderData.remainingAmount);
    const watchPurchasePrice = roundMoneyValue(orderData.watchPurchasePrice);
    const deliveryCost = roundMoneyValue(orderData.deliveryCost);
    const paymentDate = dateFromFirestore(orderData.paymentDate, new Date());
    const orderValue = paidAmount + remainingAmount;
    const paymentFee = roundMoneyValue((orderValue * cleanPercentageNumber(financialSettings.feePercentage, 3)) / 100);
    const taxType = financialTaxTypeForPaymentDate(financialSettings, paymentDate);
    const taxRate = cleanTaxRate(orderData.taxRate) || cleanPercentageNumber(financialSettings.defaultTaxRate, 20);
    const taxAmount = webFinanceTaxAmount({
      paidAmount,
      remainingAmount,
      watchPurchasePrice,
      paymentFee,
      deliveryCost,
      taxRate,
      taxType
    });

    const updates = {};
    if (roundMoneyValue(orderData.paymentFee) !== paymentFee) updates.paymentFee = paymentFee;
    if (cleanTaxType(orderData.taxType) !== taxType) updates.taxType = taxType;
    if (cleanTaxRate(orderData.taxRate) !== taxRate) updates.taxRate = taxRate;
    if (roundMoneyValue(orderData.taxAmount) !== taxAmount) updates.taxAmount = taxAmount;

    if (Object.keys(updates).length > 0) {
      batch.set(orderDoc.ref, {
        ...updates,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedByUid: uid,
        updatedByEmail: email,
        source: orderData.source || "web"
      }, { merge: true });
      batchCount += 1;
      updatedCount += 1;
      await commitBatchIfNeeded(false);
    }
  }

  await commitBatchIfNeeded(true);

  return {
    ok: true,
    companyId,
    updatedCount,
    message: `Recalculated ${updatedCount} orders.`
  };
});

exports.saveUploadSafetySettings = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyData } = await requireWorkspaceForBilling(request, false);
  if (!uidCanEditWorkspaceSettings(companyData, uid)) {
    throw new HttpsError("permission-denied", "Your workspace role cannot edit Upload Safety settings.");
  }
  requireWorkspaceAreaAccess(companyData, uid, "settingsSafetyUploads", "Safety & Uploads settings are not enabled for your role.");

  const incoming = request.data?.settings && typeof request.data.settings === "object" ? request.data.settings : {};
  const requirePolicy = typeof incoming.uploadSafetyRequirePolicyAcceptance === "boolean"
    ? incoming.uploadSafetyRequirePolicyAcceptance
    : true;
  const maxFileSizeMB = cleanUploadSafetyMaxFileSizeMB(incoming.uploadSafetyMaxFileSizeMB, 10);

  const settingsRef = companySettingsDocRef(companyId);
  await settingsRef.set({
    uploadSafetyRequirePolicyAcceptanceV1: requirePolicy,
    uploadSafetyRequirePolicyAcceptance: requirePolicy,
    uploadSafetyMaxFileSizeMBV1: maxFileSizeMB,
    uploadSafetyMaxFileSizeMB: maxFileSizeMB,
    uploadSafetySettingsUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  const settingsSnapshot = await settingsRef.get();
  return {
    ok: true,
    companyId,
    settings: uploadSafetySettingsFromData(settingsSnapshot.exists ? settingsSnapshot.data() || {} : {}),
    message: "Upload Safety settings saved."
  };
});

function cleanWorkspaceLogoUrl(value) {
  const cleaned = String(value || "").trim();
  if (!cleaned) return "";
  if (cleaned.length > 3000) {
    throw new HttpsError("invalid-argument", "Workspace logo URL is too long.");
  }
  let parsed;
  try {
    parsed = new URL(cleaned);
  } catch {
    throw new HttpsError("invalid-argument", "Workspace logo URL is invalid.");
  }
  const allowedStorageHosts = new Set([
    "firebasestorage.googleapis.com",
    "storage.googleapis.com",
    "storage.cloud.google.com"
  ]);
  if (parsed.protocol !== "https:" || !allowedStorageHosts.has(parsed.hostname)) {
    throw new HttpsError("invalid-argument", "Workspace logo must be an uploaded Firebase Storage file.");
  }
  return cleaned;
}

exports.saveWorkspaceLogo = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyData } = await requireWorkspaceForBilling(request, false);
  if (!uidCanEditWorkspaceSettings(companyData, uid)) {
    throw new HttpsError("permission-denied", "Your workspace role cannot edit Workspace Logo.");
  }

  const appLogoUrl = cleanWorkspaceLogoUrl(request.data?.appLogoUrl);
  if (appLogoUrl) {
    const entitlements = billingEntitlementsForCompany(companyData);
    if (entitlements.workspaceLogoUploadEnabled !== true) {
      throw new HttpsError("failed-precondition", "Workspace logo upload is available on Monthly Pro and Team plans.", {
        requiredPlan: "pro_monthly",
        plan: entitlements.plan,
        planName: entitlements.displayName
      });
    }
  }

  const settingsRef = companySettingsDocRef(companyId);
  await settingsRef.set({
    appLogoUrl,
    brandingUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    brandingUpdatedByUid: uid,
    brandingUpdatedByEmail: String(request.auth?.token?.email || "")
  }, { merge: true });

  return {
    ok: true,
    companyId,
    settings: { appLogoUrl },
    message: appLogoUrl ? "Workspace logo saved." : "Workspace logo removed."
  };
});

function cleanAccountName(value, fallback = "") {
  return cleanQuickReplyText(value, 80) || fallback;
}

function cleanAccountPhotoURL(value) {
  const cleaned = cleanQuickReplyText(value, 2000);
  if (!cleaned) return "";
  let parsed;
  try {
    parsed = new URL(cleaned);
  } catch (error) {
    throw new HttpsError("invalid-argument", "Profile photo URL must be a valid URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new HttpsError("invalid-argument", "Profile photo URL must use HTTPS.");
  }
  return cleaned;
}

async function accountProfileAuthUser(uid) {
  try {
    return await admin.auth().getUser(uid);
  } catch (error) {
    console.warn("Account Auth profile lookup failed; using callable token and Firestore profile.", { uid, error: error?.message || error });
    return null;
  }
}


const ACCOUNT_EMAIL_CHANGE_COOLDOWN_MS = 10 * 24 * 60 * 60 * 1000;

function cleanAccountEmail(value) {
  const cleaned = String(value || "").trim().toLowerCase();
  if (!cleaned) return "";
  if (cleaned.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
    throw new HttpsError("invalid-argument", "Enter a valid email address.");
  }
  return cleaned;
}

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function accountEmailCooldownError(nextAllowedMs) {
  const nextDate = new Date(nextAllowedMs);
  const displayDate = nextDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  return new HttpsError("failed-precondition", "You can change your email again on " + displayDate + ".");
}

exports.changeAccountEmail = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, false);
  const email = cleanAccountEmail(request.data?.email);
  if (!email) {
    throw new HttpsError("invalid-argument", "Enter a valid email address.");
  }

  const authUser = await accountProfileAuthUser(uid);
  const existingMember = companyMembersMap(companyData)[uid] || {};
  const token = request.auth?.token || {};
  const currentEmail = String(authUser?.email || token.email || existingMember.email || "").trim().toLowerCase();
  const userRef = admin.firestore().collection("users").doc(uid);
  const userSnap = await userRef.get();
  const userData = userSnap.data() || {};
  const lastChangedMs = Math.max(
    timestampMillis(userData.accountEmailLastChangedAt),
    timestampMillis(existingMember.accountEmailLastChangedAt)
  );
  const nowMs = Date.now();
  const nextAllowedMs = lastChangedMs ? lastChangedMs + ACCOUNT_EMAIL_CHANGE_COOLDOWN_MS : 0;

  if (email === currentEmail) {
    return {
      ok: true,
      companyId,
      profile: {
        email,
        displayName: cleanAccountName(existingMember.displayName || authUser?.displayName || token.name || ""),
        companyName: cleanAccountName(companyData.name || companyData.companyName, "My Studio"),
        photoURL: cleanQuickReplyText(existingMember.photoURL || authUser?.photoURL || "", 2000),
        emailNextChangeAt: nextAllowedMs || null
      },
      message: "This is already your sign-in email."
    };
  }

  if (nextAllowedMs && nowMs < nextAllowedMs) {
    throw accountEmailCooldownError(nextAllowedMs);
  }

  try {
    const existingUser = await admin.auth().getUserByEmail(email);
    if (existingUser.uid !== uid) {
      throw new HttpsError("already-exists", "This email address is already used by another account.");
    }
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error?.code !== "auth/user-not-found") {
      console.warn("Account email availability check failed:", { uid, email, error: error?.message || error });
      throw new HttpsError("internal", "Email availability could not be checked right now.");
    }
  }

  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  const displayName = cleanAccountName(existingMember.displayName || authUser?.displayName || token.name || "");
  const photoURL = cleanQuickReplyText(existingMember.photoURL || authUser?.photoURL || "", 2000);
  const companyName = cleanAccountName(companyData.name || companyData.companyName, "My Studio");
  const previousEmail = currentEmail || String(existingMember.email || userData.email || "").trim().toLowerCase();

  await admin.auth().updateUser(uid, { email, emailVerified: false });

  const batch = admin.firestore().batch();
  batch.set(userRef, {
    uid,
    email,
    displayName,
    photoURL,
    activeCompanyId: companyId,
    accountEmailPrevious: previousEmail,
    accountEmailLastChangedAt: timestamp,
    updatedAt: timestamp
  }, { merge: true });

  const memberProfile = {
    uid,
    email,
    displayName,
    photoURL,
    accountEmailLastChangedAt: timestamp,
    updatedAt: timestamp
  };
  const companyUpdate = {
    members: { [uid]: memberProfile },
    updatedAt: timestamp
  };
  if (uidIsCompanyOwner(companyData, uid)) {
    companyUpdate.ownerEmail = email;
  }
  batch.set(companyRef, companyUpdate, { merge: true });
  await batch.commit();

  return {
    ok: true,
    companyId,
    profile: {
      email,
      displayName,
      companyName,
      photoURL,
      emailNextChangeAt: nowMs + ACCOUNT_EMAIL_CHANGE_COOLDOWN_MS
    },
    message: "Email updated. You can change it again after 10 days."
  };
});

exports.initializeFreeDemoWorkspace = onCall({ region: "europe-west2" }, async (request) => {
  const uid = String(request.auth?.uid || "").trim();
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in is required before creating a workspace.");
  }

  const fullName = cleanQuickReplyText(request.data?.fullName || request.auth?.token?.name || "", 80);
  const workspaceName = cleanQuickReplyText(request.data?.workspaceName || "", 100);
  if (fullName.length < 2 || workspaceName.length < 2) {
    throw new HttpsError("invalid-argument", "Full name and workspace name are required.");
  }

  const email = String(request.auth?.token?.email || "").trim();
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  const db = admin.firestore();
  const userRef = db.collection("users").doc(uid);
  const companyRef = db.collection("companies").doc(uid);
  const companySnapshot = await companyRef.get();
  const existing = companySnapshot.exists ? (companySnapshot.data() || {}) : {};

  if (companySnapshot.exists) {
    const existingOwner = String(existing.ownerUid || uid).trim();
    const existingSource = String(existing.billingPlanSource || "").trim();
    const existingPlan = String(existing.billingPlan || "demo").trim();
    const existingName = String(existing.name || existing.companyName || "").trim();
    const isAutomaticBootstrap = existingOwner === uid && existingPlan === "demo" && (
      !existingSource ||
      existingSource === "new_workspace_default" ||
      existingSource === "signup_free_demo" ||
      existingName === "My Studio"
    );

    if (!isAutomaticBootstrap) {
      throw new HttpsError("failed-precondition", "This account already has an active workspace. Open the portal instead.");
    }
  }

  const ownerMember = {
    uid,
    email,
    displayName: fullName,
    role: "owner",
    updatedAt: timestamp
  };

  const batch = db.batch();
  batch.set(userRef, {
    uid,
    email,
    displayName: fullName,
    activeCompanyId: uid,
    updatedAt: timestamp
  }, { merge: true });

  batch.set(companyRef, {
    companyId: uid,
    ownerUid: uid,
    ownerEmail: email,
    ownerDisplayName: fullName,
    appName: "NivaDesk",
    name: workspaceName,
    companyName: workspaceName,
    memberUids: admin.firestore.FieldValue.arrayUnion(uid),
    memberRoles: { [uid]: "owner" },
    members: { [uid]: ownerMember },
    billingPlan: "demo",
    billingPlanName: "Free Demo",
    billingPlanSource: "signup_free_demo",
    billingStatus: "free",
    billingProviderRawStatus: "free",
    billingStorageLimitMB: 50,
    billingTeamMemberLimit: 1,
    signupCompletedAt: timestamp,
    updatedAt: timestamp,
    createdAt: companySnapshot.exists ? (existing.createdAt || timestamp) : timestamp
  }, { merge: true });

  await batch.commit();
  return { ok: true, companyId: uid, plan: "demo", message: "Free Demo workspace created." };
});

exports.saveAccountProfile = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, false);
  const profile = request.data?.profile && typeof request.data.profile === "object" ? request.data.profile : {};
  const authUser = await accountProfileAuthUser(uid);
  const existingMember = companyMembersMap(companyData)[uid] || {};
  const token = request.auth?.token || {};
  const hasDisplayNameInput = Object.prototype.hasOwnProperty.call(profile, "displayName");
  const displayName = hasDisplayNameInput
    ? cleanQuickReplyText(profile.displayName, 80)
    : cleanAccountName(existingMember.displayName || authUser?.displayName || token.name || "");
  const incomingCompanyName = cleanAccountName(profile.companyName, "My Studio");
  const isOwner = uidIsCompanyOwner(companyData, uid);
  const currentCompanyName = cleanAccountName(companyData.name || companyData.companyName, "My Studio");
  const companyName = isOwner ? incomingCompanyName : currentCompanyName;
  const email = String(authUser?.email || token.email || existingMember.email || "");
  const photoURL = String(existingMember.photoURL || "");
  const timestamp = admin.firestore.FieldValue.serverTimestamp();

  const batch = admin.firestore().batch();
  batch.set(admin.firestore().collection("users").doc(uid), {
    uid,
    email,
    displayName,
    activeCompanyId: companyId,
    updatedAt: timestamp
  }, { merge: true });

  const companyUpdate = {
    updatedAt: timestamp,
    members: {
      [uid]: {
        uid,
        email,
        displayName,
        updatedAt: timestamp
      }
    }
  };

  if (isOwner) {
    companyUpdate.name = companyName;
    companyUpdate.companyName = companyName;
    companyUpdate.ownerDisplayName = displayName;
    companyUpdate.ownerEmail = email;
    companyUpdate.memberUids = admin.firestore.FieldValue.arrayUnion(uid);
  }

  batch.set(companyRef, companyUpdate, { merge: true });
  await batch.commit();

  return {
    ok: true,
    companyId,
    profile: {
      displayName,
      companyName,
      photoURL,
      companyNameEditable: isOwner
    },
    message: isOwner ? "Profile updated." : "Profile updated. Company details can only be changed by the workspace owner."
  };
});

exports.saveAccountAvatar = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, false);
  const photoURL = cleanAccountPhotoURL(request.data?.photoURL);
  const authUser = await accountProfileAuthUser(uid);
  const existingMember = companyMembersMap(companyData)[uid] || {};
  const token = request.auth?.token || {};
  const displayName = Object.prototype.hasOwnProperty.call(existingMember, "displayName")
    ? String(existingMember.displayName || "")
    : String(authUser?.displayName || token.name || "");
  const email = String(authUser?.email || token.email || existingMember.email || "");
  const timestamp = admin.firestore.FieldValue.serverTimestamp();

  const batch = admin.firestore().batch();
  batch.set(admin.firestore().collection("users").doc(uid), {
    uid,
    email,
    displayName,
    photoURL,
    activeCompanyId: companyId,
    updatedAt: timestamp
  }, { merge: true });

  const companyUpdate = {
    updatedAt: timestamp,
    members: {
      [uid]: {
        uid,
        email,
        displayName,
        photoURL,
        updatedAt: timestamp
      }
    }
  };

  if (uidIsCompanyOwner(companyData, uid)) {
    companyUpdate.ownerPhotoURL = photoURL;
  }

  batch.set(companyRef, companyUpdate, { merge: true });
  await batch.commit();

  return {
    ok: true,
    companyId,
    profile: {
      displayName,
      companyName: cleanAccountName(companyData.name || companyData.companyName, "My Studio"),
      photoURL,
      companyNameEditable: uidIsCompanyOwner(companyData, uid)
    },
    message: photoURL ? "Avatar updated." : "Avatar removed."
  };
});

const BACKUP_STRING_SETTING_KEYS = new Set([
  "seciliDil",
  "seciliParaBirimi",
  "seciliOndalik",
  "businessType",
  "businessDescriptionPrompt",
  "activeStatusesJSON",
  "customFieldsJSON",
  "customTogglesJSON",
  "materialsTogglesJSON",
  "materialsDefaultChecksJSON",
  "customStepsJSON",
  "financialExpenseItemsJSON",
  "financialRemainingItemsJSON",
  "financialBaseCostLabel",
  "specialNoteSectionsJSON",
  "specialNoteSectionsJSONV1",
  "summaryStep1",
  "summaryStep2",
  "orderListStep1",
  "orderListStep2",
  "invLabel1",
  "invLabel2",
  "invLabel3",
  "invLabel4",
  "appLogoUrl",
  "appSubtitle",
  "companyNumbersJSON",
  "appTheme",
  "taxCalculationType",
  "taxRuleNameRevenue",
  "taxRuleNameProfit",
  "replyMode",
  "openAIKey",
  "localAIURL",
  "localAIModel",
  "aiKnowledgeBase",
  "quickReplyPoliteness",
  "quickReplyLength",
  "customProductsJSON",
  "customRulesJSON",
  "workspaceCustomizationModeV1",
  "workspaceProfile1JSONV1",
  "workspaceProfile2JSONV1",
  "workspaceProfile3JSONV1",
  "workspaceProfilesJSONV2",
  "sharedWorkspaceSnapshotJSONV1",
  "sutunGenislikleriJSONV4",
  "kartRenkleriJSONV1",
  "kartYerlesimiJSON",
  "kartYukseklikleriJSON",
  "phoneKartSirasiJSONV1",
  "statusNotesSupplierLabel",
  "materialsNotesSupplierLabel",
  "scheduleQuickRemindersJSONV2"
]);

const BACKUP_BOOL_SETTING_KEYS = new Set([
  "showCardCustomerNotes",
  "showCardPreview",
  "showCardSummary",
  "showCardCustomer",
  "showCardDelivery",
  "showCardCommunication",
  "showCardNotes",
  "showCardFinancial",
  "showCardStatus",
  "showCardShipping",
  "showCardMaterials",
  "showCardPriority",
  "showCardSchedule",
  "showCardHistoryLog",
  "showCardClientFiles",
  "showCardToDo",
  "showCardWorkTime",
  "pdfShowCustomer",
  "pdfShowContact",
  "pdfShowPreview",
  "pdfShowFinCustomer",
  "pdfShowPaymentMethod",
  "pdfShowFinInternal",
  "pdfShowStatus",
  "pdfShowShipping",
  "pdfShowMaterials",
  "pdfShowPriority",
  "financialShowBaseCost",
  "taxMilestoneEnabled",
  "hideSensitiveNumbers",
  "ordersSidebarShowPreviewImages",
  "ordersSidebarVisible",
  "showStatusNotesSupplier",
  "showMaterialsNotesSupplier"
]);

const BACKUP_DOUBLE_SETTING_KEYS = new Set([
  "feePercentage",
  "defaultTaxRate",
  "taxMilestoneDate",
  "ordersSidebarWidth",
  "colWLeftV3",
  "colWMidV3",
  "colWRightV3"
]);

function backupItems(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      return backupItems(JSON.parse(value));
    } catch {
      return [];
    }
  }
  if (value && typeof value === "object") {
    return Object.values(value).filter((item) => item && typeof item === "object");
  }
  return [];
}

function backupOrderItems(backup) {
  if (Array.isArray(backup)) return backup;
  if (!backup || typeof backup !== "object") return [];
  if (Array.isArray(backup.siparisler)) return backup.siparisler;
  if (Array.isArray(backup.orders)) {
    return backup.orders.map((item) => item && typeof item === "object" && item.data ? item.data : item);
  }
  return [];
}

function backupCustomerItems(backup) {
  if (!backup || typeof backup !== "object") return [];
  if (Array.isArray(backup.musteriler)) return backup.musteriler;
  if (Array.isArray(backup.customers)) {
    return backup.customers.map((item) => item && typeof item === "object" && item.data ? item.data : item);
  }
  return [];
}

function backupDate(value, fallback = new Date()) {
  if (value && typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (value && typeof value === "object" && typeof value.seconds === "number") {
    const date = new Date(value.seconds * 1000);
    return Number.isNaN(date.getTime()) ? fallback : date;
  }
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function backupOptionalDate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (value && typeof value === "object" && typeof value.seconds === "number") {
    const date = new Date(value.seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function backupTimestamp(value, fallback = new Date()) {
  const date = backupOptionalDate(value) || fallback;
  return admin.firestore.Timestamp.fromDate(date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date());
}

function backupOptionalTimestamp(value) {
  const date = backupOptionalDate(value);
  return date ? admin.firestore.Timestamp.fromDate(date) : null;
}

function backupUuidString(value) {
  const raw = typeof value === "string"
    ? value
    : value && typeof value === "object" && typeof value.uuidString === "string"
      ? value.uuidString
      : "";
  const cleaned = cleanOrderText(raw, "", 120);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleaned)
    ? cleaned
    : crypto.randomUUID();
}

function backupHistoryLogItems(value) {
  return backupItems(value)
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .slice(0, 120)
    .map((item) => ({
      id: backupUuidString(item.id),
      createdAt: backupTimestamp(item.createdAt, new Date()),
      title: cleanOrderText(item.title, "Order updated", 180) || "Order updated",
      oldValue: historyValue(item.oldValue).slice(0, 500),
      newValue: historyValue(item.newValue).slice(0, 500)
    }));
}

function backupClientFileItems(value, uid, email) {
  return backupItems(value)
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .map((item) => {
      const rawSize = Number(item.fileSize || item.size || 0);
      return {
        id: backupUuidString(item.id),
        fileName: cleanOrderText(item.fileName || item.originalFileName || item.name, "Client file", 180) || "Client file",
        downloadURL: cleanOrderText(item.downloadURL || item.downloadUrl || item.url, "", 2000),
        storagePath: cleanOrderText(item.storagePath || item.path, "", 1000),
        contentType: cleanOrderText(item.contentType || item.type, "application/octet-stream", 160) || "application/octet-stream",
        fileSize: Number.isFinite(rawSize) ? Math.max(0, Math.round(rawSize)) : 0,
        uploadedByUid: cleanOrderText(item.uploadedByUid || item.createdByUid, uid, 160),
        uploadedByEmail: cleanOrderText(item.uploadedByEmail || item.uploadedBy || item.createdByEmail, email, 220),
        uploadedAt: backupTimestamp(item.uploadedAt || item.createdAt, new Date()),
        source: cleanOrderText(item.source, "client_file", 60) || "client_file",
        note: cleanOrderNotes(item.note || ""),
        isPendingUpload: false,
        localFilePath: "",
        pendingQueueId: ""
      };
    });
}

function backupTodoItems(value, uid, email) {
  return backupItems(value)
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .map((item) => ({
      id: backupUuidString(item.id),
      title: cleanOrderText(item.title, "Untitled task", 240) || "Untitled task",
      note: cleanOrderNotes(item.note || ""),
      assignedToUid: cleanOrderText(item.assignedToUid, "", 160),
      assignedToEmail: cleanOrderText(item.assignedToEmail, "", 220),
      dueAt: backupOptionalTimestamp(item.dueAt),
      priority: cleanTodoPriority(item.priority, "Normal"),
      isDone: cleanBoolean(item.isDone, false),
      createdAt: backupTimestamp(item.createdAt, new Date()),
      createdByUid: cleanOrderText(item.createdByUid, uid, 160),
      createdByEmail: cleanOrderText(item.createdByEmail, email, 220),
      completedAt: backupOptionalTimestamp(item.completedAt),
      completedByUid: cleanOrderText(item.completedByUid, "", 160),
      completedByEmail: cleanOrderText(item.completedByEmail, "", 220)
    }));
}

function backupWorkSessionItems(value, uid, email) {
  return backupItems(value)
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .map((item) => {
      const startedAt = backupOptionalDate(item.startedAt) || new Date();
      return {
        id: backupUuidString(item.id),
        title: cleanWorkSessionTitle(item.title),
        startedAt: admin.firestore.Timestamp.fromDate(startedAt),
        endedAt: backupOptionalTimestamp(item.endedAt),
        durationSeconds: Math.max(0, Math.round(Number(item.durationSeconds || 0))),
        createdAt: admin.firestore.Timestamp.fromDate(backupOptionalDate(item.createdAt) || startedAt),
        createdByUid: cleanOrderText(item.createdByUid, uid, 160),
        createdByEmail: cleanOrderText(item.createdByEmail, email, 220),
        source: cleanOrderText(item.source, "app", 40) || "app"
      };
    });
}

function backupObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function importedOrderPayload(item, companyId, uid, email) {
  const raw = backupObject(item);
  const paymentDate = backupDate(raw.paymentDate, new Date());
  const paidAmount = cleanOrderNumber(raw.paidAmount);
  const remainingAmount = cleanOrderNumber(raw.remainingAmount);
  const watchPurchasePrice = cleanOrderNumber(raw.watchPurchasePrice);
  const paymentFee = cleanOrderNumber(raw.paymentFee);
  const deliveryCost = cleanOrderNumber(raw.deliveryCost);
  const taxRate = cleanPercentageNumber(raw.taxRate, 0);
  const taxAmount = cleanOrderNumber(raw.taxAmount);
  return {
    companyId,
    customerName: cleanOrderText(raw.customerName, "New Project", 180) || "New Project",
    paymentDate: admin.firestore.Timestamp.fromDate(paymentDate),
    paidAmount,
    remainingAmount,
    watchPurchasePrice,
    watchRef: cleanOrderText(raw.watchRef, "", 180),
    deliveryTime: Math.min(Math.max(Math.round(Number(raw.deliveryTime || 45) || 45), 1), 730),
    designName: cleanOrderText(raw.designName, "", 180),
    designLink: cleanOrderText(raw.designLink, "", 1000),
    communication: cleanCommunicationChannels(raw.communication),
    emailAddress: cleanOrderText(raw.emailAddress, "", 220),
    instagramUsername: cleanOrderText(raw.instagramUsername, "", 120),
    whatsappNumber: cleanOrderText(raw.whatsappNumber, "", 80),
    notes: cleanOrderNotes(raw.notes),
    designStatus: cleanOrderStatus(raw.designStatus, "Not Yet"),
    status: cleanOrderStatus(raw.status, "Not Yet"),
    isDispatched: cleanBoolean(raw.isDispatched, false),
    trackingNumber: cleanOrderText(raw.trackingNumber, "", 180),
    courier: cleanOrderText(raw.courier, "Auto Detect", 120) || "Auto Detect",
    isDelivered: cleanBoolean(raw.isDelivered, false),
    paymentFee,
    deliveryCost,
    extraStatuses: backupObject(raw.extraStatuses),
    paymentMethod: cleanOrderText(raw.paymentMethod, "Card", 80) || "Card",
    taxRate,
    taxAmount,
    taxType: cleanOrderText(raw.taxType, "", 80),
    invBool1: cleanBoolean(raw.invBool1, false),
    invBool2: cleanBoolean(raw.invBool2, false),
    invBool3: cleanBoolean(raw.invBool3, false),
    invBool4: cleanBoolean(raw.invBool4, false),
    invNotes: cleanOrderNotes(raw.invNotes),
    priority: cleanPriorityValue(raw.priority, "Normal"),
    risk: cleanRiskValue(raw.risk, "None"),
    riskReason: cleanOrderText(raw.riskReason, "-", 500) || "-",
    customFields: backupObject(raw.customFields),
    customToggles: backupObject(raw.customToggles),
    historyLog: [
      webHistoryEntry("Order imported", "-", "Imported from backup", uid, email),
      ...backupHistoryLogItems(raw.historyLog)
    ].slice(0, 120),
    clientFiles: backupClientFileItems(raw.clientFiles, uid, email),
    todoItems: backupTodoItems(raw.todoItems, uid, email),
    workSessions: backupWorkSessionItems(raw.workSessions, uid, email),
    assignedToUid: cleanOrderText(raw.assignedToUid, "", 160),
    assignedToEmail: cleanOrderText(raw.assignedToEmail, "", 220),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdByUid: uid,
    createdByEmail: email,
    importedByUid: uid,
    importedByEmail: email,
    source: "web_import"
  };
}

function importedCustomerPayload(item, companyId, uid, email) {
  const raw = backupObject(item);
  const name = cleanOrderText(raw.name || raw.customerName, "", 180);
  if (!name) return null;
  const streetAddress = cleanOrderText(raw.streetAddress || raw.addressLine1 || raw.street, "", 500);
  const city = cleanOrderText(raw.city || raw.town, "", 120);
  const postalCode = cleanOrderText(raw.postalCode || raw.postcode || raw.zipCode || raw.zip, "", 40);
  const country = cleanOrderText(raw.country, "", 120);
  return {
    companyId,
    name,
    phone: cleanOrderText(raw.phone || raw.whatsappNumber, "", 80),
    email: cleanOrderText(raw.email || raw.emailAddress, "", 220),
    instagram: cleanOrderText(raw.instagram || raw.instagramUsername, "", 120),
    address: cleanOrderText(raw.address, "", 1000) || composeCustomerAddressParts(streetAddress, city, postalCode, country),
    streetAddress,
    city,
    postalCode,
    country,
    notes: cleanOrderNotes(raw.notes),
    profileImageUrl: cleanOrderText(raw.profileImageUrl, "", 1000),
    lastContactDate: admin.firestore.Timestamp.fromDate(backupDate(raw.lastContactDate, new Date())),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdByUid: uid,
    createdByEmail: email,
    importedByUid: uid,
    importedByEmail: email,
    source: "web_import"
  };
}

function importedBackupSettingsPayload(settings) {
  const raw = backupObject(settings);
  const updates = {};

  for (const [key, value] of Object.entries(backupObject(raw.strings))) {
    if (!BACKUP_STRING_SETTING_KEYS.has(key)) continue;
    updates[key] = cleanQuickReplyText(value, key === "aiKnowledgeBase" ? 50000 : 200000);
  }
  if (Object.prototype.hasOwnProperty.call(updates, "specialNoteSectionsJSONV1")) {
    if (!Object.prototype.hasOwnProperty.call(updates, "specialNoteSectionsJSON")) {
      updates.specialNoteSectionsJSON = updates.specialNoteSectionsJSONV1;
    }
    delete updates.specialNoteSectionsJSONV1;
  }
  for (const [key, value] of Object.entries(backupObject(raw.bools))) {
    if (!BACKUP_BOOL_SETTING_KEYS.has(key) || typeof value !== "boolean") continue;
    updates[key] = value;
  }
  for (const [key, value] of Object.entries(backupObject(raw.doubles))) {
    if (!BACKUP_DOUBLE_SETTING_KEYS.has(key)) continue;
    const number = Number(value);
    if (Number.isFinite(number)) updates[key] = number;
  }

  if (Object.prototype.hasOwnProperty.call(updates, "seciliParaBirimi")) {
    updates.selectedCurrency = updates.seciliParaBirimi;
  }
  if (Object.prototype.hasOwnProperty.call(updates, "seciliOndalik")) {
    updates.selectedDecimalSeparator = updates.seciliOndalik;
  }
  if (Object.prototype.hasOwnProperty.call(updates, "uploadSafetyRequirePolicyAcceptance")) {
    updates.uploadSafetyRequirePolicyAcceptanceV1 = updates.uploadSafetyRequirePolicyAcceptance;
  }
  if (Object.prototype.hasOwnProperty.call(updates, "uploadSafetyMaxFileSizeMB")) {
    updates.uploadSafetyMaxFileSizeMBV1 = Math.min(Math.max(Number(updates.uploadSafetyMaxFileSizeMB) || 10, 1), 50);
  }

  return updates;
}

async function commitBackupImportWrites(writes) {
  let batch = admin.firestore().batch();
  let count = 0;
  for (const write of writes) {
    batch.set(write.ref, write.data, { merge: Boolean(write.merge) });
    count += 1;
    if (count >= 400) {
      await batch.commit();
      batch = admin.firestore().batch();
      count = 0;
    }
  }
  if (count > 0) await batch.commit();
}

exports.importWorkspaceBackup = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, false);
  const role = normalizeWorkspaceRole(workspaceOrderRole(companyData, uid));
  if (!canFullyEditOrder(role)) {
    throw new HttpsError("permission-denied", `Your current role is ${workspaceRoleLabel(role)} and cannot import workspace data.`);
  }

  const backup = request.data?.backup;
  const orderItems = backupOrderItems(backup).slice(0, 500);
  const customerItems = backupCustomerItems(backup).slice(0, 500);
  const settingsUpdates = importedBackupSettingsPayload(backup && typeof backup === "object" ? backup.settings : null);
  if (orderItems.length === 0 && customerItems.length === 0 && Object.keys(settingsUpdates).length === 0) {
    throw new HttpsError("invalid-argument", "Choose a valid NivaDesk backup JSON file.");
  }

  const entitlements = billingEntitlementsForCompany(companyData);
  const limits = planLimitsFromEntitlements(entitlements, companyData);
  const usage = await workspaceBillingUsage(companyId, companyData);
  if (limits.orderLimit !== null && limits.orderLimit !== undefined && usage.orderCount + orderItems.length > limits.orderLimit) {
    throw new HttpsError("failed-precondition", "Import would exceed this workspace order limit.");
  }
  if (limits.customerLimit !== null && limits.customerLimit !== undefined && usage.customerCount + customerItems.length > limits.customerLimit) {
    throw new HttpsError("failed-precondition", "Import would exceed this workspace customer limit.");
  }

  const email = String(request.auth?.token?.email || "");
  const db = admin.firestore();
  const writes = [];
  const importedOrders = [];
  const importedCustomers = [];

  for (const item of orderItems) {
    const ref = db.collection("siparisler").doc();
    importedOrders.push(ref.id);
    writes.push({ ref, data: importedOrderPayload(item, companyId, uid, email), merge: false });
  }

  for (const item of customerItems) {
    const payload = importedCustomerPayload(item, companyId, uid, email);
    if (!payload) continue;
    const ref = db.collection("musteriler").doc();
    importedCustomers.push(ref.id);
    writes.push({ ref, data: payload, merge: false });
  }

  if (Object.keys(settingsUpdates).length > 0) {
    writes.push({
      ref: companySettingsDocRef(companyId),
      data: {
        ...settingsUpdates,
        importedFromBackupAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      merge: true
    });
  }

  await commitBackupImportWrites(writes);

  try {
    const updatedCompanySnap = await companyRef.get();
    const updatedUsage = await workspaceBillingUsage(companyId, updatedCompanySnap.data() || companyData);
    await saveWorkspaceBillingUsage(companyRef, updatedUsage, entitlements, limits, "web_backup_import");
  } catch (error) {
    console.warn("Backup import billing usage update failed:", error?.message || error);
  }

  return {
    ok: true,
    companyId,
    importedOrders: importedOrders.length,
    importedCustomers: importedCustomers.length,
    importedSettings: Object.keys(settingsUpdates).length > 0,
    message: `Import finished. Orders: ${importedOrders.length}. Customers: ${importedCustomers.length}.${Object.keys(settingsUpdates).length > 0 ? " Settings imported." : ""}`
  };
});

async function deleteWorkspaceCollectionDocuments(collectionName, companyId) {
  const db = admin.firestore();
  const snapshot = await db.collection(collectionName).where("companyId", "==", companyId).get();
  let batch = db.batch();
  let count = 0;
  let deleted = 0;

  for (const documentSnapshot of snapshot.docs) {
    batch.delete(documentSnapshot.ref);
    count += 1;
    deleted += 1;
    if (count >= 400) {
      await batch.commit();
      batch = db.batch();
      count = 0;
    }
  }

  if (count > 0) await batch.commit();
  return deleted;
}

exports.deleteWorkspaceData = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, false);
  const role = normalizeWorkspaceRole(workspaceOrderRole(companyData, uid));
  if (role !== "owner" && role !== "admin") {
    throw new HttpsError("permission-denied", `Your current role is ${workspaceRoleLabel(role)} and cannot delete workspace data.`);
  }

  const confirmation = String(request.data?.confirmation || "").trim();
  if (confirmation !== "DELETE DATA") {
    throw new HttpsError("failed-precondition", "Type DELETE DATA to confirm this action.");
  }

  const deletedOrders = await deleteWorkspaceCollectionDocuments("siparisler", companyId);
  const deletedCustomers = await deleteWorkspaceCollectionDocuments("musteriler", companyId);

  try {
    const updatedCompanySnap = await companyRef.get();
    const entitlements = billingEntitlementsForCompany(updatedCompanySnap.data() || companyData);
    const limits = planLimitsFromEntitlements(entitlements, companyData);
    const updatedUsage = await workspaceBillingUsage(companyId, updatedCompanySnap.data() || companyData);
    await saveWorkspaceBillingUsage(companyRef, updatedUsage, entitlements, limits, "web_delete_workspace_data");
  } catch (error) {
    console.warn("Delete workspace data billing usage update failed:", error?.message || error);
  }

  return {
    ok: true,
    companyId,
    deletedOrders,
    deletedCustomers,
    message: `Delete finished. Orders: ${deletedOrders}. Customers: ${deletedCustomers}.`
  };
});

function cleanClientFileName(value) {
  const cleaned = String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) {
    throw new HttpsError("invalid-argument", "File name is required.");
  }
  if (cleaned.length > 180) {
    throw new HttpsError("invalid-argument", "File name is too long.");
  }
  return cleaned;
}

function clientFileIdString(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && typeof value.uuidString === "string" && value.uuidString.trim()) {
    return value.uuidString.trim();
  }
  return "";
}

function clientFileDisplayName(file = {}) {
  return String(file.fileName || file.originalFileName || file.name || "Client file").trim() || "Client file";
}

function uidCanManageClientFiles(companyData = {}, uid = "") {
  const normalizedUid = String(uid || "").trim();
  if (!normalizedUid) return false;
  if (uidIsCompanyOwner(companyData, normalizedUid)) return true;
  if (!uidCanAccessWorkspaceArea(companyData, normalizedUid, "clientFiles")) return false;

  const role = normalizeWorkspaceRole(workspaceMemberRole(companyData, normalizedUid, "member"), "unknown");
  return ["owner", "admin", "member", "workflowOnly"].includes(role);
}

function findClientFileIndex(files = [], fileId = "") {
  const target = String(fileId || "").trim();
  if (!target) return -1;
  return files.findIndex((file, index) => {
    if (!file || typeof file !== "object") return false;
    return clientFileIdString(file.id) === target || `file-${index}` === target;
  });
}

function orderCompanyId(orderData = {}) {
  return String(orderData.companyId || "").trim();
}

function requireAssignedProjectAccess(companyData = {}, orderData = {}, uid = "", roleValue = "") {
  if (!usesRestrictedAssignedProjectScope(companyData, uid, roleValue)) return;
  const assignedToUid = String(orderData.assignedToUid || "").trim();
  if (!assignedToUid || assignedToUid !== String(uid || "").trim()) {
    throw new HttpsError("permission-denied", "This role can access only projects assigned to the current member.");
  }
}

const WORKFLOW_ORDER_VIEW_FIELDS = [
  "companyId", "assignedToUid", "assignedToEmail", "createdByUid", "createdByEmail",
  "createdByWorkflowOnly", "createdAt", "updatedAt", "customerName", "designName",
  "designLink", "watchRef", "status", "designStatus", "priority", "risk", "riskReason",
  "paymentDate", "deliveryTime", "deliveryDueDate", "communication", "emailAddress",
  "instagramUsername", "whatsappNumber", "tiktokUsername", "address", "customerNotes",
  "notes", "specialNotes", "invBool1", "invBool2", "invBool3", "invBool4", "invNotes",
  "materialsDefaultToggles", "materialsToggles", "statusNotesSupplier", "customToggles",
  "extraStatuses", "trackingNumber", "courier", "isDispatched", "isDelivered",
  "clientFiles", "todoItems", "workSessions", "historyLog"
];

function workflowOrderViewRef(companyId = "", orderId = "") {
  return admin.firestore().collection("companies").doc(String(companyId || "").trim())
    .collection("workflowOrders").doc(String(orderId || "").trim());
}

function workflowSafeOrderViewData(orderId = "", data = {}) {
  const output = { id: String(orderId || "").trim() };
  for (const field of WORKFLOW_ORDER_VIEW_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(data, field)) output[field] = data[field];
  }
  return output;
}

async function writeWorkflowSafeOrderView(orderId = "", data = {}) {
  const companyId = orderCompanyId(data);
  const assignedToUid = String(data.assignedToUid || "").trim();
  if (!companyId || !orderId) return;
  const viewRef = workflowOrderViewRef(companyId, orderId);
  if (!assignedToUid) {
    await viewRef.delete().catch(() => undefined);
    return;
  }
  await viewRef.set(workflowSafeOrderViewData(orderId, data), { merge: false });
}

exports.ensureWorkflowAssignedOrderViews = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyData } = await requireWorkspaceForBilling(request, false);
  const role = workspaceOrderRole(companyData, uid);
  if (!usesRestrictedAssignedProjectScope(companyData, uid, role)) {
    throw new HttpsError("permission-denied", "This account does not use assigned project views.");
  }

  const snapshot = await admin.firestore().collection("siparisler")
    .where("companyId", "==", companyId)
    .where("assignedToUid", "==", uid)
    .limit(250)
    .get();

  const batch = admin.firestore().batch();
  snapshot.docs.forEach((document) => {
    batch.set(workflowOrderViewRef(companyId, document.id), workflowSafeOrderViewData(document.id, document.data()), { merge: false });
  });
  await batch.commit();

  return { ok: true, companyId, count: snapshot.size };
});

exports.syncWorkflowSafeOrderView = onDocumentWritten(
  { document: "siparisler/{orderId}", region: "europe-west2" },
  async (event) => {
    const orderId = String(event.params.orderId || "").trim();
    const before = event.data?.before;
    const after = event.data?.after;
    const beforeData = before?.exists ? before.data() || {} : {};
    const afterData = after?.exists ? after.data() || {} : {};
    const beforeCompanyId = orderCompanyId(beforeData);
    const afterCompanyId = orderCompanyId(afterData);

    if (beforeCompanyId && beforeCompanyId !== afterCompanyId) {
      await workflowOrderViewRef(beforeCompanyId, orderId).delete().catch(() => undefined);
    }
    if (!after?.exists) {
      if (beforeCompanyId) {
        await workflowOrderViewRef(beforeCompanyId, orderId).delete().catch(() => undefined);
      }
      return;
    }
    await writeWorkflowSafeOrderView(orderId, afterData);
  }
);

function historyLogWithEntry(orderData = {}, title, oldValue, newValue) {
  const existing = Array.isArray(orderData.historyLog) ? orderData.historyLog : [];
  return [
    {
      id: crypto.randomUUID(),
      createdAt: admin.firestore.Timestamp.now(),
      title,
      oldValue: String(oldValue || "-").trim() || "-",
      newValue: String(newValue || "-").trim() || "-"
    },
    ...existing
  ].slice(0, 120);
}

function uidCanEditWorkspaceCustomers(companyData = {}, uid = "") {
  return uidCanAccessWorkspaceArea(companyData, uid, "customers") && canFullyEditOrder(workspaceOrderRole(companyData, uid));
}

function uidCanEditWorkspaceOrders(companyData = {}, uid = "") {
  return uidCanAccessWorkspaceArea(companyData, uid, "orders") && canEditOrderStatus(workspaceOrderRole(companyData, uid));
}

function workspaceOrderRole(companyData = {}, uid = "") {
  const normalizedUid = String(uid || "").trim();
  if (!normalizedUid) return "unknown";
  if (uidIsCompanyOwner(companyData, normalizedUid)) return "owner";
  return workspaceMemberRole(companyData, normalizedUid, "member");
}

function uidCanEditWorkspaceOrderStatus(companyData = {}, uid = "") {
  const role = workspaceOrderRole(companyData, uid);
  return canEditOrderStatus(role);
}

function canFullyEditOrder(role) {
  return ["owner", "admin", "member"].includes(normalizeWorkspaceRole(role));
}

function canDeleteOrder(role) {
  return ["owner", "admin", "member"].includes(normalizeWorkspaceRole(role));
}

function canManageProjectAssignments(companyData = {}, uid = "", role = "") {
  const normalizedRole = normalizeWorkspaceRole(role);
  if (normalizedRole === "owner" || uidIsCompanyOwner(companyData, uid)) return true;
  return ["admin", "member"].includes(normalizedRole)
    && workspaceMemberAccess(companyData, uid).manageProjectAssignments === true;
}

function usesRestrictedAssignedProjectScope(companyData = {}, uid = "", roleValue = "") {
  const normalizedRole = normalizeWorkspaceRole(roleValue || workspaceOrderRole(companyData, uid));
  if (normalizedRole === "workflowOnly") return true;
  const access = workspaceMemberAccess(companyData, uid);
  return access.assignedProjectsOnly === true && access.manageProjectAssignments !== true;
}

function canRequestApprovedOrderDeletion(companyData = {}, uid = "", roleValue = "") {
  return usesRestrictedAssignedProjectScope(companyData, uid, roleValue)
    && uidCanAccessWorkspaceArea(companyData, uid, "orders");
}

function canEditWorkflowOnly(role) {
  return normalizeWorkspaceRole(role) === "workflowOnly";
}

function canEditOrderStatus(role) {
  return canFullyEditOrder(role) || canEditWorkflowOnly(role);
}

function logUpdateWebOrderPermissionDecision(context = {}) {
  console.warn("updateWebOrder permission decision", {
    uid: context.uid,
    workspaceId: context.workspaceId,
    rawRole: context.rawRole,
    normalizedRole: context.normalizedRole,
    requestedFieldKeys: Array.isArray(context.requestedFieldKeys) ? context.requestedFieldKeys : [],
    canFullEdit: Boolean(context.canFullEdit),
    canWorkflowEdit: Boolean(context.canWorkflowEdit)
  });
}

function cleanOrderText(value, fallback = "", maxLength = 500) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.slice(0, maxLength);
}

function cleanOrderNotes(value) {
  return String(value ?? "").trim().slice(0, 5000);
}

function cleanOrderNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function cleanOrderStatus(value, fallback = "Not Yet") {
  const status = cleanOrderText(value, fallback, 80);
  return status || fallback;
}

function cleanBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  return fallback;
}

function cleanCommunicationChannels(value) {
  if (!Array.isArray(value)) return [];
  const output = [];
  for (const item of value) {
    const channel = cleanOrderText(item, "", 60);
    if (channel && !output.some((existing) => existing.toLowerCase() === channel.toLowerCase())) {
      output.push(channel);
    }
  }
  return output.slice(0, 12);
}

function communicationChannelKey(value) {
  return cleanOrderText(value, "", 120).toLowerCase().replace(/[\s_-]+/g, "");
}

function cleanTodoPriority(value, fallback = "Normal") {
  const cleaned = cleanOrderText(value, fallback, 40);
  const allowed = ["Low", "Normal", "High", "Urgent"];
  return allowed.find((item) => item.toLowerCase() === cleaned.toLowerCase()) || fallback;
}

function cleanPriorityValue(value, fallback = "Normal") {
  const cleaned = cleanOrderText(value, fallback, 40);
  const allowed = ["Low", "Normal", "High", "Urgent"];
  return allowed.find((item) => item.toLowerCase() === cleaned.toLowerCase()) || fallback;
}

function cleanRiskValue(value, fallback = "None") {
  const cleaned = cleanOrderText(value, fallback, 60);
  const allowed = ["None", "Waiting", "Blocked", "Overdue"];
  return allowed.find((item) => item.toLowerCase() === cleaned.toLowerCase()) || fallback;
}

function dateFromISODate(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function deliveryTimeFromDueDate(paymentDate, dueDate) {
  if (!(paymentDate instanceof Date) || !(dueDate instanceof Date)) return 45;
  const paymentDay = Date.UTC(paymentDate.getUTCFullYear(), paymentDate.getUTCMonth(), paymentDate.getUTCDate());
  const dueDay = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  const days = Math.round((dueDay - paymentDay) / (24 * 60 * 60 * 1000));
  return Math.min(Math.max(days, 1), 730);
}

function dateFromFirestore(value, fallback = new Date()) {
  if (value && typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  return fallback;
}

function dueDateForOrder(paymentDate, deliveryTime) {
  const due = new Date(Date.UTC(paymentDate.getUTCFullYear(), paymentDate.getUTCMonth(), paymentDate.getUTCDate()));
  due.setUTCDate(due.getUTCDate() + Math.max(Number(deliveryTime || 0), 0));
  return due;
}

function shortISODate(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "-";
  return value.toISOString().slice(0, 10);
}

function sameStringArray(lhs = [], rhs = []) {
  if (!Array.isArray(lhs) || !Array.isArray(rhs)) return false;
  if (lhs.length !== rhs.length) return false;
  return lhs.every((item, index) => String(item) === String(rhs[index]));
}

function historyValue(value) {
  const text = String(value ?? "").trim();
  return text || "-";
}

function amountHistoryValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? `£${number.toFixed(2)}` : "£0.00";
}

function webHistoryEntry(title, oldValue, newValue, uid, email) {
  return {
    id: crypto.randomUUID(),
    createdAt: admin.firestore.Timestamp.now(),
    title,
    oldValue: historyValue(oldValue),
    newValue: historyValue(newValue),
    source: "web",
    createdByUid: uid,
    createdByEmail: email
  };
}

function semanticStatusHistoryEntries(title, oldValue, newValue, uid, email) {
  const normalizedTitle = String(title || "").trim().toLowerCase();
  const next = historyValue(newValue).toLowerCase();
  const entries = [];

  if (normalizedTitle.includes("design")) {
    if (next.includes("approved") || next.includes("approval") || next === "done" || next === "complete" || next === "completed") {
      entries.push(webHistoryEntry("Customer approved design", "-", newValue, uid, email));
    }
    if (next.includes("mockup") || next.includes("sent") || next.includes("draft sent")) {
      entries.push(webHistoryEntry("Design mockup sent", "-", newValue, uid, email));
    }
  }

  if (normalizedTitle.includes("painting") || normalizedTitle.includes("status")) {
    if (next.includes("progress") || next.includes("painting") || next.includes("production") || next.includes("started")) {
      entries.push(webHistoryEntry("Painting started", "-", newValue, uid, email));
    }
    if (next === "done" || next === "complete" || next === "completed") {
      entries.push(webHistoryEntry("Order completed", "-", newValue, uid, email));
    }
  }

  return entries;
}

function pushHistoryChange(entries, title, oldValue, newValue, uid, email) {
  const oldText = historyValue(oldValue);
  const newText = historyValue(newValue);
  if (oldText === newText) return;
  entries.push(webHistoryEntry(title, oldText, newText, uid, email));
  entries.push(...semanticStatusHistoryEntries(title, oldText, newText, uid, email));
}

function hasOwnField(value, field) {
  return Boolean(value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, field));
}

function roundMoneyValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.round(number * 100) / 100;
}

function cleanTaxRate(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(Math.round(number * 100) / 100, 100);
}

function cleanTaxType(value, fallback = "") {
  const text = cleanOrderText(value, fallback, 80);
  const normalized = text.toLowerCase();
  if (normalized === "revenue" || normalized.includes("standard")) return "Revenue";
  if (normalized === "profit" || normalized.includes("profit")) return "Profit";
  return text || fallback;
}

function webFinanceTaxAmount({ paidAmount, remainingAmount, watchPurchasePrice, paymentFee, deliveryCost, taxRate, taxType }) {
  if (!taxRate || !taxType) return 0;
  const orderValue = roundMoneyValue(paidAmount) + roundMoneyValue(remainingAmount);
  if (cleanTaxType(taxType) === "Profit") {
    const taxableProfit = Math.max(
      orderValue - roundMoneyValue(watchPurchasePrice) - roundMoneyValue(paymentFee) - roundMoneyValue(deliveryCost),
      0
    );
    return roundMoneyValue((taxableProfit * cleanTaxRate(taxRate)) / 100);
  }
  return roundMoneyValue((orderValue * cleanTaxRate(taxRate)) / 100);
}

function applyWebFinancePatch({ patch, orderData, updates, historyEntries, uid, email, entitlements, financialSettings }) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return false;

  const knownFields = new Set([
    "orderValue",
    "paidAmount",
    "remainingAmount",
    "watchPurchasePrice",
    "paymentFee",
    "deliveryCost",
    "taxRate",
    "taxType",
    "paymentMethod",
    "fullPaymentReceived",
    "financialRemainingValues",
    "financialExpenseValues"
  ]);
  const changedFields = Object.keys(patch).filter((field) => knownFields.has(field));
  if (changedFields.length === 0) return false;
  const shouldRecalculateTax = entitlements?.advancedFinanceEnabled === true && changedFields.some((field) => [
    "orderValue",
    "paidAmount",
    "remainingAmount",
    "watchPurchasePrice",
    "paymentFee",
    "deliveryCost",
    "taxRate",
    "taxType",
    "fullPaymentReceived"
  ].includes(field));

  const unknownFields = Object.keys(patch).filter((field) => !knownFields.has(field));
  if (unknownFields.length > 0) {
    throw new HttpsError("invalid-argument", "Unsupported financial field.");
  }

  const basicFields = new Set(["paidAmount", "watchPurchasePrice"]);
  const isBasicFinanceOnly = entitlements?.advancedFinanceEnabled !== true;
  if (isBasicFinanceOnly && changedFields.some((field) => !basicFields.has(field))) {
    throw new HttpsError("failed-precondition", "Advanced financial fields are available on NivaDesk Pro and Team.");
  }

  const previousPaidAmount = roundMoneyValue(orderData.paidAmount);
  const previousRemainingAmount = roundMoneyValue(orderData.remainingAmount);
  const previousOrderValue = previousPaidAmount + previousRemainingAmount;
  let orderValue = previousOrderValue;
  let paidAmount = previousPaidAmount;
  let remainingAmount = previousRemainingAmount;
  let watchPurchasePrice = roundMoneyValue(orderData.watchPurchasePrice);
  let paymentFee = roundMoneyValue(orderData.paymentFee);
  let deliveryCost = roundMoneyValue(orderData.deliveryCost);
  let taxRate = cleanTaxRate(orderData.taxRate) || cleanPercentageNumber(financialSettings?.defaultTaxRate, 20);
  let taxType = cleanTaxType(orderData.taxType) || financialTaxTypeForPaymentDate(financialSettings, dateFromFirestore(orderData.paymentDate, new Date()));
  let paymentMethod = cleanOrderText(orderData.paymentMethod, "Card", 80);

  if (hasOwnField(patch, "orderValue")) {
    orderValue = roundMoneyValue(patch.orderValue);
    paidAmount = Math.min(paidAmount, orderValue);
    remainingAmount = Math.max(orderValue - paidAmount, 0);
  }

  if (hasOwnField(patch, "paidAmount")) {
    paidAmount = Math.min(roundMoneyValue(patch.paidAmount), orderValue);
    remainingAmount = Math.max(orderValue - paidAmount, 0);
  }

  if (hasOwnField(patch, "remainingAmount")) {
    remainingAmount = roundMoneyValue(patch.remainingAmount);
    orderValue = paidAmount + remainingAmount;
  }

  const currentFields = orderData.customFields && typeof orderData.customFields === "object" && !Array.isArray(orderData.customFields)
    ? { ...orderData.customFields }
    : {};
  const customFieldValueForKey = (key) => {
    const target = cleanOrderText(key, "", 160).toLowerCase();
    const existingKey = Object.keys(currentFields).find((fieldKey) => cleanOrderText(fieldKey, "", 160).toLowerCase() === target);
    return existingKey ? currentFields[existingKey] : "";
  };
  const currentCustomRemainingTotal = (financialSettings?.financialRemainingItems || [])
    .map((item) => cleanOrderText(item?.title, "", 120))
    .filter(Boolean)
    .reduce((total, title) => total + roundMoneyValue(customFieldValueForKey(`financialRemaining::${title}`)), 0);

  if (hasOwnField(patch, "fullPaymentReceived") && Boolean(patch.fullPaymentReceived)) {
    paidAmount = roundMoneyValue(paidAmount + remainingAmount + currentCustomRemainingTotal);
    remainingAmount = 0;
    orderValue = paidAmount;
  }

  if (hasOwnField(patch, "watchPurchasePrice")) watchPurchasePrice = roundMoneyValue(patch.watchPurchasePrice);
  if (hasOwnField(patch, "paymentFee")) paymentFee = roundMoneyValue(patch.paymentFee);
  if (hasOwnField(patch, "deliveryCost")) deliveryCost = roundMoneyValue(patch.deliveryCost);
  if (hasOwnField(patch, "taxRate")) taxRate = cleanTaxRate(patch.taxRate);
  if (hasOwnField(patch, "taxType")) taxType = cleanTaxType(patch.taxType, taxType);
  if (hasOwnField(patch, "paymentMethod")) paymentMethod = cleanOrderText(patch.paymentMethod, paymentMethod, 80) || "Card";

  if (entitlements?.advancedFinanceEnabled === true && !hasOwnField(patch, "paymentFee") && ["orderValue", "paidAmount", "remainingAmount", "fullPaymentReceived"].some((field) => hasOwnField(patch, field))) {
    paymentFee = roundMoneyValue((orderValue * cleanPercentageNumber(financialSettings?.feePercentage, 3)) / 100);
  }

  const taxAmount = webFinanceTaxAmount({
    paidAmount,
    remainingAmount,
    watchPurchasePrice,
    paymentFee,
    deliveryCost,
    taxRate,
    taxType
  });

  const setMoneyUpdate = (field, title, previousValue, nextValue) => {
    const previous = roundMoneyValue(previousValue);
    const next = roundMoneyValue(nextValue);
    if (previous === next) return;
    updates[field] = next;
    pushHistoryChange(historyEntries, title, amountHistoryValue(previous), amountHistoryValue(next), uid, email);
  };

  if (previousOrderValue !== orderValue) {
    pushHistoryChange(historyEntries, "Order value changed", amountHistoryValue(previousOrderValue), amountHistoryValue(orderValue), uid, email);
  }
  setMoneyUpdate("paidAmount", "Paid amount changed", orderData.paidAmount, paidAmount);
  setMoneyUpdate("remainingAmount", "Remaining amount recalculated", orderData.remainingAmount, remainingAmount);
  setMoneyUpdate("watchPurchasePrice", "Base cost changed", orderData.watchPurchasePrice, watchPurchasePrice);
  setMoneyUpdate("paymentFee", "Platform fee changed", orderData.paymentFee, paymentFee);
  setMoneyUpdate("deliveryCost", "Shipping cost changed", orderData.deliveryCost, deliveryCost);
  if (shouldRecalculateTax) {
    setMoneyUpdate("taxAmount", "VAT amount recalculated", orderData.taxAmount, taxAmount);
  }

  if (entitlements?.advancedFinanceEnabled === true && cleanTaxRate(orderData.taxRate) !== taxRate) {
    updates.taxRate = taxRate;
    pushHistoryChange(historyEntries, "VAT rate changed", `${cleanTaxRate(orderData.taxRate)}%`, `${taxRate}%`, uid, email);
  }
  if (entitlements?.advancedFinanceEnabled === true && cleanTaxType(orderData.taxType) !== taxType) {
    updates.taxType = taxType;
    pushHistoryChange(historyEntries, "VAT rule changed", cleanTaxType(orderData.taxType) || "-", taxType || "-", uid, email);
  }
  if (cleanOrderText(orderData.paymentMethod, "Card", 80) !== paymentMethod) {
    updates.paymentMethod = paymentMethod;
    pushHistoryChange(historyEntries, "Payment method changed", orderData.paymentMethod, paymentMethod, uid, email);
  }

  if (hasOwnField(patch, "fullPaymentReceived") && Boolean(patch.fullPaymentReceived) && (previousRemainingAmount > 0 || currentCustomRemainingTotal > 0)) {
    const outstandingTotal = previousRemainingAmount + currentCustomRemainingTotal;
    pushHistoryChange(historyEntries, "Full payment received", amountHistoryValue(outstandingTotal), "Remaining cleared", uid, email);
  }

  let customFieldsChanged = false;
  const setCustomMoneyField = (prefix, title, value) => {
    const cleanTitle = cleanOrderText(title, "", 120);
    if (!cleanTitle) return;
    const key = `${prefix}${cleanTitle}`;
    const previous = roundMoneyValue(currentFields[key]);
    const next = roundMoneyValue(value);
    if (previous === next) return;
    if (next > 0) currentFields[key] = String(next);
    else delete currentFields[key];
    pushHistoryChange(historyEntries, `${cleanTitle} changed`, amountHistoryValue(previous), amountHistoryValue(next), uid, email);
    customFieldsChanged = true;
  };
  const applyCustomFinancialMap = (field, prefix, configuredItems) => {
    if (!hasOwnField(patch, field)) return;
    const incoming = patch[field] && typeof patch[field] === "object" && !Array.isArray(patch[field])
      ? patch[field]
      : {};
    const allowedTitles = new Set((configuredItems || [])
      .map((item) => cleanOrderText(item?.title, "", 120))
      .filter(Boolean));
    for (const [title, value] of Object.entries(incoming)) {
      const cleanTitle = cleanOrderText(title, "", 120);
      if (!cleanTitle || !allowedTitles.has(cleanTitle)) continue;
      setCustomMoneyField(prefix, cleanTitle, value);
    }
  };
  applyCustomFinancialMap("financialRemainingValues", "financialRemaining::", financialSettings?.financialRemainingItems || []);
  applyCustomFinancialMap("financialExpenseValues", "financialExpense::", financialSettings?.financialExpenseItems || []);
  if (customFieldsChanged) {
    updates.customFields = currentFields;
  }

  return true;
}

function applyWebDetailsPatch({ patch, orderData, companyData, updates, historyEntries, uid, email }) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return false;

  const knownFields = new Set([
    "customerName",
    "designName",
    "assignedToUid",
    "assignedToEmail",
    "watchRef",
    "designLink",
    "emailAddress",
    "whatsappNumber",
    "instagramUsername",
    "tiktokUsername",
    "address",
    "communication",
    "customerNotes",
    "paymentDate",
    "deliveryTime",
    "deliveryDueDate",
    "courier",
    "trackingNumber",
    "isDispatched",
    "isDelivered",
    "priority",
    "risk",
    "riskReason",
    "invBool1",
    "invBool2",
    "invBool3",
    "invBool4",
    "invNotes",
    "extraStatuses",
    "customToggles",
    "materialsDefaultToggles",
    "materialsToggles",
    "statusNotesSupplier",
    "notes",
    "customFields",
    "specialNotes"
  ]);

  const unknownFields = Object.keys(patch).filter((field) => !knownFields.has(field));
  if (unknownFields.length > 0) {
    throw new HttpsError("invalid-argument", "Unsupported order detail field.");
  }

  let changed = false;
  const setTextUpdate = (field, title, nextValue, maxLength = 180) => {
    const previous = cleanOrderText(orderData[field], "", maxLength);
    const next = cleanOrderText(nextValue, "", maxLength);
    if (previous === next) return;
    updates[field] = next;
    pushHistoryChange(historyEntries, title, previous, next, uid, email);
    changed = true;
  };

  if (hasOwnField(patch, "customerName")) {
    const next = cleanOrderText(patch.customerName, "New Project", 180) || "New Project";
    setTextUpdate("customerName", "Customer changed", next, 180);
  }
  if (hasOwnField(patch, "designName")) setTextUpdate("designName", "Design changed", patch.designName, 180);
  if (hasOwnField(patch, "assignedToUid")) setTextUpdate("assignedToUid", "Project assignee changed", patch.assignedToUid, 160);
  if (hasOwnField(patch, "assignedToEmail")) setTextUpdate("assignedToEmail", "Project assignee email changed", patch.assignedToEmail, 220);
  if (hasOwnField(patch, "watchRef")) setTextUpdate("watchRef", "Reference changed", patch.watchRef, 180);
  if (hasOwnField(patch, "designLink")) {
    const previous = cleanOrderText(orderData.designLink, "", 2000);
    const next = cleanOrderText(patch.designLink, "", 2000);
    if (previous !== next) {
      updates.designLink = next;
      pushHistoryChange(
        historyEntries,
        "Preview Image",
        previous ? "Image" : "No image",
        next ? "Updated image" : "Removed",
        uid,
        email
      );
      changed = true;
    }
  }
  if (hasOwnField(patch, "emailAddress")) setTextUpdate("emailAddress", "Email changed", patch.emailAddress, 220);
  if (hasOwnField(patch, "whatsappNumber")) setTextUpdate("whatsappNumber", "Telephone changed", patch.whatsappNumber, 80);
  if (hasOwnField(patch, "instagramUsername")) setTextUpdate("instagramUsername", "Instagram changed", patch.instagramUsername, 120);
  if (hasOwnField(patch, "courier")) setTextUpdate("courier", "Courier changed", patch.courier, 120);
  if (hasOwnField(patch, "trackingNumber")) setTextUpdate("trackingNumber", "Tracking number changed", patch.trackingNumber, 160);

  const currentFields = orderData.customFields && typeof orderData.customFields === "object" && !Array.isArray(orderData.customFields)
    ? { ...orderData.customFields }
    : {};
  let customFieldsChanged = false;
  const setCustomField = (key, title, nextValue, maxLength = 500) => {
    const previous = cleanOrderText(currentFields[key], "", maxLength);
    const next = cleanOrderText(nextValue, "", maxLength);
    if (previous === next) return;
    if (next) currentFields[key] = next;
    else delete currentFields[key];
    pushHistoryChange(historyEntries, title, previous, next, uid, email);
    customFieldsChanged = true;
    changed = true;
  };

  if (hasOwnField(patch, "address")) setCustomField("communicationAddress", "Address changed", patch.address, 500);
  if (hasOwnField(patch, "customerNotes")) setCustomField("communicationCustomerNotes", "Customer notes updated", patch.customerNotes, 2000);
  if (hasOwnField(patch, "tiktokUsername")) setCustomField("communicationChannel::TikTok", "TikTok changed", patch.tiktokUsername, 160);
  if (hasOwnField(patch, "statusNotesSupplier")) setCustomField("status::notesSupplier", "Status notes updated", patch.statusNotesSupplier, 500);

  const materialSettings = blockHeadingSettingsFromData(companyData || {});
  if (hasOwnField(patch, "customFields")) {
    const incomingCustomFields = patch.customFields && typeof patch.customFields === "object" && !Array.isArray(patch.customFields)
      ? patch.customFields
      : {};
    const allowedCustomerFieldTitles = new Set((materialSettings.customFields || [])
      .map((item) => blockHeadingString(item?.title, "", 120))
      .filter(Boolean));
    const allowedCommunicationChannels = (materialSettings.communicationChannelLabels || [])
      .map((item) => blockHeadingString(item, "", 120))
      .filter(Boolean);
    const allowedCommunicationChannelKeys = new Map(allowedCommunicationChannels.map((channel) => [communicationChannelKey(channel), channel]));
    for (const [title, value] of Object.entries(incomingCustomFields)) {
      const cleanTitle = blockHeadingString(title, "", 120);
      if (!cleanTitle) continue;
      const prefix = "communicationChannel::";
      if (cleanTitle.toLowerCase().startsWith(prefix.toLowerCase())) {
        const channel = cleanTitle.slice(prefix.length).trim();
        const savedChannel = allowedCommunicationChannelKeys.get(communicationChannelKey(channel));
        if (!savedChannel) continue;
        setCustomField(`${prefix}${savedChannel}`, `${savedChannel} changed`, value, 500);
        continue;
      }
      if (cleanTitle === "orderExtraNoteSectionsJSON") {
        const previous = blockHeadingString(currentFields[cleanTitle], "", 4000);
        const next = blockHeadingString(value, "", 4000);
        if (previous !== next) {
          if (next) currentFields[cleanTitle] = next;
          else delete currentFields[cleanTitle];
          pushHistoryChange(historyEntries, "Note sections updated", previous ? "Sections" : "-", next ? "Sections" : "-", uid, email);
          customFieldsChanged = true;
          changed = true;
        }
        continue;
      }
      if (!allowedCustomerFieldTitles.has(cleanTitle)) continue;
      setCustomField(cleanTitle, `${cleanTitle} changed`, value, 500);
    }
  }
  if (hasOwnField(patch, "notes")) {
    const previous = cleanOrderNotes(orderData.notes);
    const next = cleanOrderNotes(patch.notes);
    if (previous !== next) {
      updates.notes = next;
      pushHistoryChange(historyEntries, "Notes updated", previous ? "Notes" : "-", next ? "Notes" : "-", uid, email);
      changed = true;
    }
  }

  const allowedSpecialNoteIds = new Set((materialSettings.specialNoteSections || [])
    .map((item) => blockHeadingString(item?.id, "", 80).toLowerCase())
    .filter(Boolean));
  const parsePerOrderExtraIds = (jsonStr) => {
    const trimmed = blockHeadingString(jsonStr, "", 4000).trim();
    if (!trimmed) return [];
    try {
      const arr = JSON.parse(trimmed);
      if (!Array.isArray(arr)) return [];
      return arr.map((item) => blockHeadingString(item?.id, "", 80).toLowerCase()).filter(Boolean);
    } catch (_) { return []; }
  };
  parsePerOrderExtraIds(currentFields.orderExtraNoteSectionsJSON).forEach((id) => allowedSpecialNoteIds.add(id));
  if (hasOwnField(patch, "customFields") && patch.customFields && typeof patch.customFields === "object") {
    parsePerOrderExtraIds(patch.customFields.orderExtraNoteSectionsJSON).forEach((id) => allowedSpecialNoteIds.add(id));
  }
  const specialNoteCustomFieldKey = (rawId) => {
    const cleanId = blockHeadingString(rawId, "", 80);
    if (!cleanId || cleanId.toLowerCase() === PRIMARY_SPECIAL_NOTE_ID || !allowedSpecialNoteIds.has(cleanId.toLowerCase())) return "";
    return `specialNote::${cleanId.toUpperCase()}`;
  };
  const specialNoteExistingKey = (canonicalKey) => {
    const target = cleanOrderText(canonicalKey, "", 120).toLowerCase();
    return Object.keys(currentFields).find((key) => cleanOrderText(key, "", 120).toLowerCase() === target) || canonicalKey;
  };
  const setSpecialNoteField = (canonicalKey, title, nextValue) => {
    const existingKey = specialNoteExistingKey(canonicalKey);
    const previous = cleanOrderNotes(currentFields[existingKey]);
    const next = cleanOrderNotes(nextValue);
    if (previous === next) return;
    delete currentFields[existingKey];
    if (existingKey !== canonicalKey) delete currentFields[canonicalKey];
    if (next) currentFields[canonicalKey] = next;
    pushHistoryChange(historyEntries, title, previous ? "Notes" : "-", next ? "Notes" : "-", uid, email);
    customFieldsChanged = true;
    changed = true;
  };
  if (hasOwnField(patch, "specialNotes")) {
    const incoming = patch.specialNotes && typeof patch.specialNotes === "object" && !Array.isArray(patch.specialNotes)
      ? patch.specialNotes
      : {};
    for (const [id, value] of Object.entries(incoming)) {
      const key = specialNoteCustomFieldKey(id);
      if (!key) continue;
      const heading = (materialSettings.specialNoteSections || []).find((item) => blockHeadingString(item?.id, "", 80).toLowerCase() === String(id).toLowerCase());
      const label = blockHeadingString(heading?.title, "Special note", 120);
      setSpecialNoteField(key, `${label} updated`, value);
    }
  }

  const statusStepLabels = {};
  for (const item of materialSettings.customSteps || []) {
    const id = cleanOrderText(item?.id, "", 120);
    const title = cleanOrderText(item?.title, "", 120);
    if (!id || !title) continue;
    statusStepLabels[`statusStep::${id.toLowerCase()}`] = title;
    statusStepLabels[`statusStep::${id}`] = title;
  }
  const statusStepLabelForKey = (key) => {
    const cleanKey = cleanOrderText(key, "", 120);
    return cleanOrderText(statusStepLabels[cleanKey] || statusStepLabels[cleanKey.toLowerCase()], cleanKey.replace(/^statusStep::/i, ""), 120);
  };
  const materialDefaultLabels = (materialSettings.materialsDefaultChecks || [])
    .map((item) => cleanOrderText(item?.title, "", 120))
    .filter(Boolean);
  const materialLabels = materialDefaultLabels.length > 0
    ? materialDefaultLabels
    : [materialSettings.invLabel1, materialSettings.invLabel2, materialSettings.invLabel3, materialSettings.invLabel4]
      .map((label) => cleanOrderText(label, "", 120))
      .filter(Boolean);

  ["invBool1", "invBool2", "invBool3", "invBool4"].forEach((field, index) => {
    if (!hasOwnField(patch, field)) return;
    const previous = Boolean(orderData[field]);
    const next = cleanBoolean(patch[field], previous);
    if (previous === next) return;
    updates[field] = next;
    const label = materialLabels[index] || `Material Check ${index + 1}`;
    pushHistoryChange(historyEntries, `${label} changed`, previous ? "Yes" : "No", next ? "Yes" : "No", uid, email);
    changed = true;
  });

  if (hasOwnField(patch, "invNotes")) {
    const previous = cleanOrderNotes(orderData.invNotes);
    const next = cleanOrderNotes(patch.invNotes);
    if (previous !== next) {
      updates.invNotes = next;
      pushHistoryChange(historyEntries, "Materials notes updated", previous ? "Notes" : "-", next ? "Notes" : "-", uid, email);
      changed = true;
    }
  }

  if (hasOwnField(patch, "extraStatuses")) {
    const incoming = patch.extraStatuses && typeof patch.extraStatuses === "object" && !Array.isArray(patch.extraStatuses)
      ? patch.extraStatuses
      : {};
    const current = orderData.extraStatuses && typeof orderData.extraStatuses === "object" && !Array.isArray(orderData.extraStatuses)
      ? { ...orderData.extraStatuses }
      : {};
    let mapChanged = false;
    for (const [key, value] of Object.entries(incoming)) {
      const cleanKey = cleanOrderText(key, "", 120);
      if (!cleanKey) continue;
      const previous = cleanOrderStatus(current[cleanKey], "Not Yet");
      const next = cleanOrderStatus(value, "Not Yet");
      if (previous === next) continue;
      current[cleanKey] = next;
      pushHistoryChange(historyEntries, `${statusStepLabelForKey(cleanKey)} status changed`, previous, next, uid, email);
      mapChanged = true;
    }
    if (mapChanged) {
      updates.extraStatuses = current;
      changed = true;
    }
  }

  const currentToggles = orderData.customToggles && typeof orderData.customToggles === "object" && !Array.isArray(orderData.customToggles)
    ? { ...orderData.customToggles }
    : {};
  let customTogglesChanged = false;
  const setCustomToggleValue = (storageKey, label, value) => {
    const cleanKey = cleanOrderText(storageKey, "", 160);
    if (!cleanKey) return;
    const previous = Boolean(currentToggles[cleanKey]);
    const next = Boolean(value);
    if (previous === next) return;
    currentToggles[cleanKey] = next;
    pushHistoryChange(historyEntries, `${label} changed`, previous ? "Yes" : "No", next ? "Yes" : "No", uid, email);
    customTogglesChanged = true;
    changed = true;
  };

  if (hasOwnField(patch, "customToggles")) {
    const incoming = patch.customToggles && typeof patch.customToggles === "object" && !Array.isArray(patch.customToggles)
      ? patch.customToggles
      : {};
    const toggleLabels = {};
    const statusToggleItems = materialSettings.customToggles || [];
    for (const item of statusToggleItems) {
      const id = cleanOrderText(item?.id, "", 80);
      const title = cleanOrderText(item?.title, "", 120);
      if (!id || !title) continue;
      toggleLabels[`statusToggle::${id.toLowerCase()}`] = title;
      toggleLabels[`statusToggle::${id}`] = title;
    }
    for (const [key, value] of Object.entries(incoming)) {
      const cleanKey = cleanOrderText(key, "", 120);
      if (!cleanKey) continue;
      const label = cleanOrderText(toggleLabels[cleanKey] || toggleLabels[cleanKey.toLowerCase()], cleanKey, 120);
      setCustomToggleValue(cleanKey, label, value);
    }
  }

  if (hasOwnField(patch, "materialsDefaultToggles")) {
    const incoming = patch.materialsDefaultToggles && typeof patch.materialsDefaultToggles === "object" && !Array.isArray(patch.materialsDefaultToggles)
      ? patch.materialsDefaultToggles
      : {};
    for (const [key, value] of Object.entries(incoming)) {
      const label = cleanOrderText(String(key).replace(/^materialsDefault::/, ""), "", 120);
      if (!label) continue;
      setCustomToggleValue(`materialsDefault::${label}`, label, value);
    }
  }

  if (hasOwnField(patch, "materialsToggles")) {
    const incoming = patch.materialsToggles && typeof patch.materialsToggles === "object" && !Array.isArray(patch.materialsToggles)
      ? patch.materialsToggles
      : {};
    for (const [key, value] of Object.entries(incoming)) {
      const label = cleanOrderText(String(key).replace(/^materials::/, ""), "", 120);
      if (!label) continue;
      setCustomToggleValue(`materials::${label}`, label, value);
    }
  }

  if (customTogglesChanged) {
    updates.customToggles = currentToggles;
  }

  if (hasOwnField(patch, "communication")) {
    const previous = cleanCommunicationChannels(orderData.communication);
    const next = cleanCommunicationChannels(patch.communication);
    if (!sameStringArray(previous, next)) {
      updates.communication = next;
      pushHistoryChange(historyEntries, "Communication channels changed", previous.join(", ") || "-", next.join(", ") || "-", uid, email);
      changed = true;
    }
  }

  const currentPaymentDate = dateFromFirestore(orderData.paymentDate, new Date());
  let nextPaymentDate = currentPaymentDate;
  const previousDeliveryTime = Number(orderData.deliveryTime || 0);
  let nextDeliveryTime = previousDeliveryTime;
  const previousDueDate = dueDateForOrder(currentPaymentDate, previousDeliveryTime);

  if (hasOwnField(patch, "paymentDate")) {
    const parsed = dateFromISODate(patch.paymentDate);
    if (!parsed) throw new HttpsError("invalid-argument", "Created date must be a valid date.");
    nextPaymentDate = parsed;
  }

  if (hasOwnField(patch, "deliveryTime")) {
    const number = Math.round(Number(patch.deliveryTime));
    if (!Number.isFinite(number)) throw new HttpsError("invalid-argument", "Delivery time must be a valid number.");
    nextDeliveryTime = Math.min(Math.max(number, 1), 730);
  }

  if (hasOwnField(patch, "deliveryDueDate")) {
    const parsedDue = dateFromISODate(patch.deliveryDueDate);
    if (!parsedDue) throw new HttpsError("invalid-argument", "Delivery due date must be a valid date.");
    nextDeliveryTime = deliveryTimeFromDueDate(nextPaymentDate, parsedDue);
  }

  if (hasOwnField(patch, "paymentDate") && shortISODate(nextPaymentDate) !== shortISODate(currentPaymentDate)) {
    updates.paymentDate = admin.firestore.Timestamp.fromDate(nextPaymentDate);
    pushHistoryChange(historyEntries, "Created date changed", shortISODate(currentPaymentDate), shortISODate(nextPaymentDate), uid, email);
    changed = true;
  }

  const nextDueDate = dueDateForOrder(nextPaymentDate, nextDeliveryTime);
  if (nextDeliveryTime !== previousDeliveryTime) {
    updates.deliveryTime = nextDeliveryTime;
    pushHistoryChange(historyEntries, "Delivery time changed", `${previousDeliveryTime} days`, `${nextDeliveryTime} days`, uid, email);
    changed = true;
  }
  if (shortISODate(nextDueDate) !== shortISODate(previousDueDate)) {
    pushHistoryChange(historyEntries, "Due date changed", shortISODate(previousDueDate), shortISODate(nextDueDate), uid, email);
  }

  if (hasOwnField(patch, "isDispatched")) {
    const next = cleanBoolean(patch.isDispatched, Boolean(orderData.isDispatched));
    if (next !== Boolean(orderData.isDispatched)) {
      updates.isDispatched = next;
      pushHistoryChange(historyEntries, "Dispatched changed", orderData.isDispatched ? "Yes" : "No", next ? "Yes" : "No", uid, email);
      changed = true;
      if (next && cleanOrderStatus(orderData.status, "Not Yet") !== "Cancelled") {
        if (cleanOrderStatus(orderData.designStatus, "Not Yet") !== "Done") {
          updates.designStatus = "Done";
          pushHistoryChange(historyEntries, "Design status changed", orderData.designStatus, "Done", uid, email);
        }
        if (cleanOrderStatus(orderData.status, "Not Yet") !== "Done") {
          updates.status = "Done";
          pushHistoryChange(historyEntries, "Painting status changed", orderData.status, "Done", uid, email);
        }
      }
    }
  }

  if (hasOwnField(patch, "isDelivered")) {
    const next = cleanBoolean(patch.isDelivered, Boolean(orderData.isDelivered));
    if (next !== Boolean(orderData.isDelivered)) {
      updates.isDelivered = next;
      pushHistoryChange(historyEntries, "Delivered changed", orderData.isDelivered ? "Yes" : "No", next ? "Yes" : "No", uid, email);
      changed = true;
    }
  }

  if (hasOwnField(patch, "priority")) {
    const next = cleanPriorityValue(patch.priority, cleanPriorityValue(orderData.priority));
    if (next !== cleanPriorityValue(orderData.priority)) {
      updates.priority = next;
      pushHistoryChange(historyEntries, "Priority", orderData.priority, next, uid, email);
      changed = true;
    }
  }

  if (hasOwnField(patch, "risk")) {
    const next = cleanRiskValue(patch.risk, cleanRiskValue(orderData.risk));
    if (next !== cleanRiskValue(orderData.risk)) {
      updates.risk = next;
      pushHistoryChange(historyEntries, "Risk", orderData.risk, next, uid, email);
      changed = true;
    }
  }

  if (hasOwnField(patch, "riskReason")) {
    const next = cleanOrderText(patch.riskReason, "-", 160) || "-";
    if (next !== cleanOrderText(orderData.riskReason, "-", 160)) {
      updates.riskReason = next;
      pushHistoryChange(historyEntries, "Risk reason changed", orderData.riskReason, next, uid, email);
      changed = true;
    }
  }

  if (customFieldsChanged) {
    updates.customFields = currentFields;
  }

  return changed;
}

const SCHEDULE_ITEMS_CUSTOM_KEY = "__scheduleAlertItemsV1";
const SWIFT_REFERENCE_SECONDS = 978307200;

function scheduleIdString(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof value.uuidString === "string") return value.uuidString;
  return String(value || "");
}

function encodeSwiftDate(date) {
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return (Date.now() / 1000) - SWIFT_REFERENCE_SECONDS;
  return (parsed.getTime() / 1000) - SWIFT_REFERENCE_SECONDS;
}

function dateFromScheduleInput(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") return parseSwiftDate(value);
  const parsed = new Date(String(value));
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? parseSwiftDate(numeric) : null;
}

function normalizeWebScheduleItems(orderData = {}) {
  const rawJSON = orderData?.customFields?.[SCHEDULE_ITEMS_CUSTOM_KEY];
  if (!rawJSON) return [];

  let decoded = [];
  try {
    decoded = JSON.parse(String(rawJSON));
  } catch {
    return [];
  }

  if (!Array.isArray(decoded)) return [];
  const now = new Date();
  return decoded
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const dueAt = dateFromScheduleInput(item.dueAt) || now;
      const createdAt = dateFromScheduleInput(item.createdAt) || now;
      const completedAt = dateFromScheduleInput(item.completedAt);
      const status = cleanOrderText(item.status, "Pending", 40) || "Pending";
      const normalized = {
        ...item,
        id: scheduleIdString(item.id) || crypto.randomUUID(),
        title: cleanOrderText(item.title, "Reminder", 160) || "Reminder",
        note: cleanOrderNotes(item.note || ""),
        dueAt: encodeSwiftDate(dueAt),
        priority: cleanTodoPriority(item.priority, "Normal"),
        status,
        notify: item.notify !== false,
        type: cleanOrderText(item.type, "Manual", 60) || "Manual",
        createdAt: encodeSwiftDate(createdAt),
        notificationSent: item.notificationSent === true
      };
      if (completedAt) normalized.completedAt = encodeSwiftDate(completedAt);
      else delete normalized.completedAt;
      return normalized;
    });
}

function applyWebSchedulePatch({ patch, orderData, updates, historyEntries, uid, email, entitlements }) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return false;

  const action = cleanOrderText(patch.action, "", 40);
  const knownActions = new Set(["add", "complete", "snooze", "delete", "update"]);
  if (!knownActions.has(action)) {
    throw new HttpsError("invalid-argument", "Unsupported Schedule action.");
  }

  const currentFields = orderData.customFields && typeof orderData.customFields === "object" && !Array.isArray(orderData.customFields)
    ? { ...orderData.customFields }
    : {};
  const items = normalizeWebScheduleItems(orderData);
  const now = new Date();
  let historyTitle = "";
  let historyValue = "";

  const assertNotifyAllowed = (notify) => {
    if (notify && entitlements?.calendarRemindersEnabled !== true) {
      throw new HttpsError("failed-precondition", "Apple Calendar and Reminders are available from NivaDesk Lite.");
    }
  };

  if (action === "add") {
    const title = cleanOrderText(patch.title, "", 160);
    if (!title) throw new HttpsError("invalid-argument", "Reminder title is required.");
    const dueAt = dateFromScheduleInput(patch.dueAt);
    if (!dueAt) throw new HttpsError("invalid-argument", "Reminder date is required.");
    const notify = hasOwnField(patch, "notify") ? Boolean(patch.notify) : true;
    assertNotifyAllowed(notify);
    items.push({
      id: scheduleIdString(patch.reminderId) || crypto.randomUUID(),
      title,
      note: cleanOrderNotes(patch.note || ""),
      dueAt: encodeSwiftDate(dueAt),
      priority: cleanTodoPriority(patch.priority, "Normal"),
      status: "Pending",
      notify,
      type: "Manual",
      createdAt: encodeSwiftDate(now),
      notificationSent: false
    });
    historyTitle = "Reminder added";
    historyValue = title;
  } else {
    const reminderId = scheduleIdString(patch.reminderId);
    const index = items.findIndex((item) => scheduleIdString(item.id) === reminderId);
    if (index < 0) throw new HttpsError("not-found", "Reminder not found.");

    if (action === "delete") {
      const [removed] = items.splice(index, 1);
      historyTitle = "Reminder deleted";
      historyValue = removed.title;
    } else if (action === "complete") {
      if (items[index].status === "Done") return false;
      items[index] = {
        ...items[index],
        status: "Done",
        completedAt: encodeSwiftDate(now)
      };
      historyTitle = "Reminder completed";
      historyValue = items[index].title;
    } else if (action === "snooze") {
      const hours = Math.min(Math.max(Math.round(Number(patch.hours || 1)), 1), 720);
      const nextDue = new Date(now.getTime() + hours * 60 * 60 * 1000);
      items[index] = {
        ...items[index],
        dueAt: encodeSwiftDate(nextDue),
        status: "Pending",
        notificationSent: false
      };
      delete items[index].completedAt;
      historyTitle = "Reminder snoozed";
      historyValue = items[index].title;
    } else if (action === "update") {
      const item = { ...items[index] };
      if (hasOwnField(patch, "title")) item.title = cleanOrderText(patch.title, item.title, 160) || item.title;
      if (hasOwnField(patch, "note")) item.note = cleanOrderNotes(patch.note || "");
      if (hasOwnField(patch, "priority")) item.priority = cleanTodoPriority(patch.priority, item.priority);
      if (hasOwnField(patch, "dueAt")) {
        const dueAt = dateFromScheduleInput(patch.dueAt);
        if (!dueAt) throw new HttpsError("invalid-argument", "Reminder date is required.");
        item.dueAt = encodeSwiftDate(dueAt);
        item.notificationSent = false;
      }
      if (hasOwnField(patch, "notify")) {
        const notify = Boolean(patch.notify);
        assertNotifyAllowed(notify);
        item.notify = notify;
        if (notify) item.notificationSent = false;
      }
      items[index] = item;
      historyTitle = "Reminder updated";
      historyValue = item.title;
    }
  }

  currentFields[SCHEDULE_ITEMS_CUSTOM_KEY] = JSON.stringify(items);
  updates.customFields = currentFields;
  if (historyTitle) {
    historyEntries.push(webHistoryEntry(historyTitle, "-", historyValue, uid, email));
  }
  return true;
}

function todoIdString(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof value.uuidString === "string") return value.uuidString;
  return String(value || "");
}

function normalizeWebTodoItems(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      ...item,
      id: todoIdString(item.id) || crypto.randomUUID(),
      title: cleanOrderText(item.title, "Untitled task", 240) || "Untitled task",
      note: cleanOrderNotes(item.note || ""),
      assignedToUid: cleanOrderText(item.assignedToUid, "", 160),
      assignedToEmail: cleanOrderText(item.assignedToEmail, "", 220),
      priority: cleanTodoPriority(item.priority, "Normal"),
      isDone: Boolean(item.isDone)
    }));
}

function applyWebTodoPatch({ patch, orderData, updates, historyEntries, uid, email, entitlements }) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return false;

  const action = cleanOrderText(patch.action, "", 40);
  const knownActions = new Set(["add", "toggle", "delete", "update", "move", "reorder"]);
  if (!knownActions.has(action)) {
    throw new HttpsError("invalid-argument", "Unsupported To Do action.");
  }

  const items = normalizeWebTodoItems(orderData.todoItems);
  const now = admin.firestore.Timestamp.now();
  let historyTitle = "";
  let historyValue = "";

  if (action === "add") {
    const limit = entitlements?.taskLimitPerOrder;
    if (Number.isFinite(limit) && items.length >= Number(limit)) {
      throw new HttpsError("failed-precondition", `Demo allows up to ${limit} tasks per order.`);
    }

    const title = cleanOrderText(patch.title, "", 240);
    if (!title) throw new HttpsError("invalid-argument", "Task title is required.");
    const dueDate = hasOwnField(patch, "dueDate") ? dateFromISODate(patch.dueDate) : null;
    let assignedToUid = "";
    let assignedToEmail = "";
    if (hasOwnField(patch, "assignedToUid") || hasOwnField(patch, "assignedToEmail")) {
      if (entitlements?.teamAccessEnabled !== true) {
        throw new HttpsError("failed-precondition", "To Do assignment is available on NivaDesk Team.");
      }
      assignedToUid = cleanOrderText(patch.assignedToUid, "", 160);
      assignedToEmail = assignedToUid ? cleanOrderText(patch.assignedToEmail, "", 220) : "";
    }
    items.unshift({
      id: crypto.randomUUID(),
      title,
      note: cleanOrderNotes(patch.note || ""),
      assignedToUid,
      assignedToEmail,
      dueAt: dueDate ? admin.firestore.Timestamp.fromDate(dueDate) : null,
      priority: cleanTodoPriority(patch.priority, "Normal"),
      isDone: false,
      createdAt: now,
      createdByUid: uid,
      createdByEmail: email,
      completedAt: null,
      completedByUid: "",
      completedByEmail: ""
    });
    historyTitle = "Task added";
    historyValue = title;
  } else if (action === "reorder") {
    const orderedIds = Array.isArray(patch.orderedIds)
      ? patch.orderedIds.map(todoIdString).filter(Boolean)
      : [];
    const existingIds = items.map((item) => todoIdString(item.id));
    const sameLength = orderedIds.length === existingIds.length;
    const sameSet = sameLength && existingIds.every((id) => orderedIds.includes(id));
    const noDuplicates = sameLength && new Set(orderedIds).size === orderedIds.length;
    if (!sameLength || !sameSet || !noDuplicates) {
      throw new HttpsError("invalid-argument", "Invalid To Do order.");
    }
    if (orderedIds.every((id, index) => id === existingIds[index])) return false;
    const byId = new Map(items.map((item) => [todoIdString(item.id), item]));
    const reordered = orderedIds.map((id) => byId.get(id)).filter(Boolean);
    items.splice(0, items.length, ...reordered);
    historyTitle = "Task order updated";
    historyValue = "Reordered";
  } else {
    const taskId = todoIdString(patch.taskId);
    const index = items.findIndex((item) => todoIdString(item.id) === taskId);
    if (index < 0) throw new HttpsError("not-found", "Task not found.");

    if (action === "delete") {
      const [removed] = items.splice(index, 1);
      historyTitle = "Task deleted";
      historyValue = removed.title;
    } else if (action === "toggle") {
      const nextDone = hasOwnField(patch, "isDone") ? Boolean(patch.isDone) : !items[index].isDone;
      if (items[index].isDone === nextDone) return false;
      items[index] = {
        ...items[index],
        isDone: nextDone,
        completedAt: nextDone ? now : null,
        completedByUid: nextDone ? uid : "",
        completedByEmail: nextDone ? email : ""
      };
      historyTitle = nextDone ? "Task completed" : "Task reopened";
      historyValue = items[index].title;
    } else if (action === "move") {
      const move = cleanOrderText(patch.move, "", 20).toLowerCase();
      let targetIndex = index;
      if (move === "up") targetIndex = index - 1;
      if (move === "down") targetIndex = index + 1;
      if (move === "top") targetIndex = 0;
      if (move === "bottom") targetIndex = items.length - 1;
      if (!["up", "down", "top", "bottom"].includes(move)) {
        throw new HttpsError("invalid-argument", "Unsupported To Do move.");
      }
      if (targetIndex < 0 || targetIndex >= items.length || targetIndex === index) return false;
      const [moved] = items.splice(index, 1);
      items.splice(targetIndex, 0, moved);
      historyTitle = "Task order updated";
      historyValue = moved.title;
    } else if (action === "update") {
      const item = { ...items[index] };
      if (hasOwnField(patch, "title")) {
        const nextTitle = cleanOrderText(patch.title, "", 240);
        if (!nextTitle) {
          throw new HttpsError("invalid-argument", "Task title is required.");
        }
        if (nextTitle !== item.title) {
          item.title = nextTitle;
          historyTitle = "Task renamed";
        }
      }
      if (hasOwnField(patch, "note")) {
        const nextNote = cleanOrderNotes(patch.note || "");
        if (nextNote !== String(item.note || "")) {
          item.note = nextNote;
          historyTitle = historyTitle || "Task note updated";
        }
      }
      if (hasOwnField(patch, "priority")) {
        const nextPriority = cleanTodoPriority(patch.priority, item.priority);
        if (nextPriority !== item.priority) {
          item.priority = nextPriority;
          historyTitle = "Task priority updated";
        }
      }
      if (hasOwnField(patch, "dueDate")) {
        const dueDate = patch.dueDate ? dateFromISODate(patch.dueDate) : null;
        item.dueAt = dueDate ? admin.firestore.Timestamp.fromDate(dueDate) : null;
        historyTitle = historyTitle || "Task due date updated";
      }
      if (hasOwnField(patch, "assignedToUid") || hasOwnField(patch, "assignedToEmail")) {
        if (entitlements?.teamAccessEnabled !== true) {
          throw new HttpsError("failed-precondition", "To Do assignment is available on NivaDesk Team.");
        }
        item.assignedToUid = cleanOrderText(patch.assignedToUid, "", 160);
        item.assignedToEmail = item.assignedToUid ? cleanOrderText(patch.assignedToEmail, "", 220) : "";
        historyTitle = historyTitle || "Task assigned";
      }
      items[index] = item;
      historyValue = item.title;
    }
  }

  updates.todoItems = items;
  if (historyTitle) {
    historyEntries.push(webHistoryEntry(historyTitle, "-", historyValue, uid, email));
  }
  return true;
}

function cleanWorkSessionTitle(value) {
  return cleanOrderText(value, "Work session", 120) || "Work session";
}

function workSessionTimestamp(value) {
  const date = dateFromFirestore(value, null);
  return date ? admin.firestore.Timestamp.fromDate(date) : null;
}

function normalizeWebWorkSessions(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      ...item,
      id: cleanOrderText(item.id, "", 120) || crypto.randomUUID(),
      title: cleanWorkSessionTitle(item.title),
      startedAt: workSessionTimestamp(item.startedAt) || admin.firestore.Timestamp.now(),
      endedAt: workSessionTimestamp(item.endedAt),
      durationSeconds: Math.max(0, Math.round(Number(item.durationSeconds || 0))),
      createdAt: workSessionTimestamp(item.createdAt) || workSessionTimestamp(item.startedAt) || admin.firestore.Timestamp.now(),
      createdByUid: cleanOrderText(item.createdByUid, "", 160),
      createdByEmail: cleanOrderText(item.createdByEmail, "", 220),
      source: cleanOrderText(item.source, "app", 40)
    }));
}

function workSessionDurationForServer(session, nowDate = new Date()) {
  const startedAt = dateFromFirestore(session.startedAt, null);
  const endedAt = dateFromFirestore(session.endedAt, null);
  if (startedAt && endedAt) {
    return Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
  }
  if (startedAt) {
    return Math.max(0, Math.round((nowDate.getTime() - startedAt.getTime()) / 1000));
  }
  return Math.max(0, Math.round(Number(session.durationSeconds || 0)));
}

function shortWorkDuration(seconds) {
  const safeSeconds = Math.max(0, Math.round(Number(seconds || 0)));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${safeSeconds}s`;
}

function applyWebWorkTimePatch({ patch, orderData, updates, historyEntries, uid, email }) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return false;

  const action = cleanOrderText(patch.action, "", 40).toLowerCase();
  if (!["start", "continue", "stop", "delete"].includes(action)) {
    throw new HttpsError("invalid-argument", "Unsupported Work Time action.");
  }

  const sessions = normalizeWebWorkSessions(orderData.workSessions);
  const now = admin.firestore.Timestamp.now();
  const nowDate = now.toDate();
  const activeIndex = sessions.findIndex((item) => !item.endedAt);

  if (action === "start" || action === "continue") {
    if (activeIndex >= 0) {
      throw new HttpsError("failed-precondition", "A work timer is already running.");
    }
    const requestedId = cleanOrderText(patch.sessionId, "", 120);
    const requestedNewId = cleanOrderText(patch.newSessionId || (action === "start" ? requestedId : ""), "", 120);
    const sourceSession = requestedId
      ? sessions.find((item) => cleanOrderText(item.id, "", 120) === requestedId)
      : null;
    const title = cleanWorkSessionTitle(patch.title || sourceSession?.title);
    sessions.unshift({
      id: requestedNewId || crypto.randomUUID(),
      title,
      startedAt: now,
      endedAt: null,
      durationSeconds: 0,
      createdAt: now,
      createdByUid: uid,
      createdByEmail: email,
      source: "web"
    });
    historyEntries.push(webHistoryEntry(action === "continue" ? "Work timer continued" : "Work timer started", "-", title, uid, email));
  } else if (action === "stop") {
    const requestedId = cleanOrderText(patch.sessionId, "", 120);
    const targetIndex = requestedId
      ? sessions.findIndex((item) => cleanOrderText(item.id, "", 120) === requestedId)
      : activeIndex;
    if (targetIndex < 0) {
      throw new HttpsError("not-found", "No running work timer found.");
    }
    if (sessions[targetIndex].endedAt) return false;
    const durationSeconds = workSessionDurationForServer(sessions[targetIndex], nowDate);
    sessions[targetIndex] = {
      ...sessions[targetIndex],
      endedAt: now,
      durationSeconds
    };
    historyEntries.push(webHistoryEntry("Work timer stopped", "-", `${sessions[targetIndex].title} · ${shortWorkDuration(durationSeconds)}`, uid, email));
  } else if (action === "delete") {
    const requestedId = cleanOrderText(patch.sessionId, "", 120);
    if (!requestedId) throw new HttpsError("invalid-argument", "sessionId is required.");
    const targetIndex = sessions.findIndex((item) => cleanOrderText(item.id, "", 120) === requestedId);
    if (targetIndex < 0) throw new HttpsError("not-found", "Work session not found.");
    const [removed] = sessions.splice(targetIndex, 1);
    historyEntries.push(webHistoryEntry("Work timer deleted", "-", removed.title, uid, email));
  }

  updates.workSessions = sessions.sort((first, second) => {
    const left = dateFromFirestore(first.startedAt, new Date(0)).getTime();
    const right = dateFromFirestore(second.startedAt, new Date(0)).getTime();
    return right - left;
  });
  return true;
}

async function upsertCustomerForWebOrder(transaction, companyId, customerName, paymentDate, uid, email) {
  const name = cleanOrderText(customerName, "", 180);
  if (!name || name === "New Order" || name === "New Project" || name === "Yeni Sipariş" || name === "Yeni Proje") return { created: false, customerId: "" };

  const db = admin.firestore();
  const existingSnapshot = await transaction.get(
    db.collection("musteriler")
      .where("companyId", "==", companyId)
      .where("name", "==", name)
      .limit(1)
  );

  if (!existingSnapshot.empty) {
    const existingDoc = existingSnapshot.docs[0];
    transaction.set(existingDoc.ref, {
      lastContactDate: admin.firestore.Timestamp.fromDate(paymentDate),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedByUid: uid,
      updatedByEmail: email,
      source: "web"
    }, { merge: true });
    return { created: false, customerId: existingDoc.id };
  }

  const customerRef = db.collection("musteriler").doc();
  transaction.set(customerRef, {
    companyId,
    name,
    email: "",
    phone: "",
    instagram: "",
    address: "",
    streetAddress: "",
    city: "",
    postalCode: "",
    country: "",
    notes: "",
    profileImageUrl: "",
    lastContactDate: admin.firestore.Timestamp.fromDate(paymentDate),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdByUid: uid,
    createdByEmail: email,
    source: "web"
  });
  return { created: true, customerId: customerRef.id };
}

function customerSyncFieldsFromOrderRequest(requestData = {}) {
  const details = requestData.details && typeof requestData.details === "object" && !Array.isArray(requestData.details)
    ? requestData.details
    : {};
  return {
    name: hasOwnField(requestData, "customerName") || hasOwnField(details, "customerName"),
    email: hasOwnField(details, "emailAddress"),
    phone: hasOwnField(details, "whatsappNumber"),
    instagram: hasOwnField(details, "instagramUsername"),
    address: hasOwnField(details, "address"),
    notes: hasOwnField(details, "customerNotes")
  };
}

function hasCustomerSyncFields(syncFields = {}) {
  return Object.values(syncFields).some(Boolean);
}

function customerPayloadFromOrderData(orderData = {}) {
  const customFields = orderData.customFields && typeof orderData.customFields === "object" && !Array.isArray(orderData.customFields)
    ? orderData.customFields
    : {};
  return {
    name: cleanOrderText(orderData.customerName, "", 180),
    email: cleanOrderText(orderData.emailAddress, "", 220),
    phone: cleanOrderText(orderData.whatsappNumber, "", 80),
    instagram: cleanOrderText(orderData.instagramUsername, "", 120),
    address: cleanOrderText(customFields.communicationAddress || customFields.Address, "", 1000),
    streetAddress: "",
    city: "",
    postalCode: "",
    country: "",
    notes: cleanOrderNotes(customFields.communicationCustomerNotes),
    lastContactDate: dateFromFirestore(orderData.paymentDate, new Date())
  };
}

async function upsertCustomerContactForWebOrder(transaction, companyId, orderId, orderData, syncFields, uid, email, previousCustomerName = "") {
  const payload = customerPayloadFromOrderData(orderData);
  const name = payload.name;
  if (!name || name === "New Order" || name === "New Project" || name === "Yeni Sipariş" || name === "Yeni Proje") return { created: false, customerId: "" };

  const db = admin.firestore();
  const existingSnapshot = await transaction.get(
    db.collection("musteriler")
      .where("companyId", "==", companyId)
      .where("name", "==", name)
      .limit(1)
  );

  const baseUpdate = {
    lastContactDate: admin.firestore.Timestamp.fromDate(payload.lastContactDate),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedByUid: uid,
    updatedByEmail: email,
    source: "web"
  };

  if (!existingSnapshot.empty) {
    const existingDoc = existingSnapshot.docs[0];
    const existingData = existingDoc.data() || {};
    const updates = { ...baseUpdate };

    const setProfileText = (field, nextValue, maxLength, explicit) => {
      const previous = field === "notes"
        ? cleanOrderNotes(existingData[field])
        : cleanOrderText(existingData[field], "", maxLength);
      const next = field === "notes"
        ? cleanOrderNotes(nextValue)
        : cleanOrderText(nextValue, "", maxLength);
      if (!explicit && (previous || !next)) return;
      if (previous !== next) updates[field] = next;
    };

    setProfileText("email", payload.email, 220, syncFields.email);
    setProfileText("phone", payload.phone, 80, syncFields.phone);
    setProfileText("instagram", payload.instagram, 120, syncFields.instagram);
    setProfileText("address", payload.address, 1000, syncFields.address);
    setProfileText("notes", payload.notes, 2000, syncFields.notes);

    transaction.set(existingDoc.ref, updates, { merge: true });
    return { created: false, customerId: existingDoc.id };
  }

  const previousName = cleanOrderText(previousCustomerName, "", 180);
  if (previousName &&
      previousName !== "New Order" &&
      previousName !== "New Project" &&
      previousName !== "Yeni Sipariş" &&
      previousName !== "Yeni Proje" &&
      normalizedCustomerKey(previousName) !== normalizedCustomerKey(name)) {
    const previousCustomerSnapshot = await transaction.get(
      db.collection("musteriler")
        .where("companyId", "==", companyId)
        .where("name", "==", previousName)
        .limit(1)
    );

    if (!previousCustomerSnapshot.empty) {
      const previousOrdersSnapshot = await transaction.get(
        db.collection("siparisler")
          .where("companyId", "==", companyId)
          .where("customerName", "==", previousName)
          .limit(2)
      );
      const usedByAnotherOrder = previousOrdersSnapshot.docs.some((doc) => doc.id !== orderId);

      if (!usedByAnotherOrder) {
        const previousCustomerDoc = previousCustomerSnapshot.docs[0];
        const previousCustomerData = previousCustomerDoc.data() || {};
        const updates = {
          ...baseUpdate,
          name
        };

        const setProfileText = (field, nextValue, maxLength, explicit) => {
          const previous = field === "notes"
            ? cleanOrderNotes(previousCustomerData[field])
            : cleanOrderText(previousCustomerData[field], "", maxLength);
          const next = field === "notes"
            ? cleanOrderNotes(nextValue)
            : cleanOrderText(nextValue, "", maxLength);
          if (!explicit && (previous || !next)) return;
          if (previous !== next) updates[field] = next;
        };

        setProfileText("email", payload.email, 220, syncFields.email);
        setProfileText("phone", payload.phone, 80, syncFields.phone);
        setProfileText("instagram", payload.instagram, 120, syncFields.instagram);
        setProfileText("address", payload.address, 1000, syncFields.address);
        setProfileText("notes", payload.notes, 2000, syncFields.notes);

        transaction.set(previousCustomerDoc.ref, updates, { merge: true });
        return { created: false, customerId: previousCustomerDoc.id, renamed: true };
      }
    }
  }

  const customerRef = db.collection("musteriler").doc();
  transaction.set(customerRef, {
    companyId,
    name,
    email: payload.email,
    phone: payload.phone,
    instagram: payload.instagram,
    address: payload.address,
    streetAddress: payload.streetAddress,
    city: payload.city,
    postalCode: payload.postalCode,
    country: payload.country,
    notes: payload.notes,
    profileImageUrl: "",
    lastContactDate: admin.firestore.Timestamp.fromDate(payload.lastContactDate),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdByUid: uid,
    createdByEmail: email,
    source: "web"
  });
  return { created: true, customerId: customerRef.id };
}

function cleanCustomerPayload(data = {}, requireName = true) {
  const name = cleanOrderText(data.name, "", 180);
  if (requireName && !name) {
    throw new HttpsError("invalid-argument", "Customer name is required.");
  }
  const streetAddress = cleanOrderText(data.streetAddress || data.addressLine1 || data.street, "", 500);
  const city = cleanOrderText(data.city || data.town, "", 120);
  const postalCode = cleanOrderText(data.postalCode || data.postcode || data.zipCode || data.zip, "", 40);
  const country = cleanOrderText(data.country, "", 120);
  const address = cleanOrderText(data.address, "", 1000) || composeCustomerAddressParts(streetAddress, city, postalCode, country);
  return {
    name,
    email: cleanOrderText(data.email, "", 220),
    phone: cleanOrderText(data.phone, "", 80),
    instagram: cleanOrderText(data.instagram, "", 120),
    address,
    streetAddress,
    city,
    postalCode,
    country,
    notes: cleanOrderNotes(data.notes)
  };
}

function customerPayloadWithAddressAliases(payload = {}) {
  return {
    ...payload,
    addressLine1: payload.streetAddress || "",
    street: payload.streetAddress || "",
    town: payload.city || "",
    postcode: payload.postalCode || "",
    zipCode: payload.postalCode || "",
    zip: payload.postalCode || ""
  };
}

function composeCustomerAddressParts(streetAddress = "", city = "", postalCode = "", country = "") {
  return [streetAddress, city, postalCode, country]
    .map((value) => cleanOrderText(value, "", 500))
    .filter(Boolean)
    .join(", ");
}

function normalizedCustomerKey(value) {
  return cleanOrderText(value, "", 180).toLowerCase();
}

function addCommunicationChannel(channels = [], channel = "") {
  const cleaned = cleanOrderText(channel, "", 60);
  if (!cleaned) return cleanCommunicationChannels(channels);
  const output = cleanCommunicationChannels(channels);
  if (!output.some((item) => item.toLowerCase() === cleaned.toLowerCase())) {
    output.push(cleaned);
  }
  return output.slice(0, 12);
}

async function syncCustomerContactToOrders(companyId, previousName, customerPayload, uid = "", email = "") {
  const previousKey = normalizedCustomerKey(previousName);
  const nextKey = normalizedCustomerKey(customerPayload.name);
  if (!previousKey && !nextKey) return 0;

  const snapshot = await admin.firestore()
    .collection("siparisler")
    .where("companyId", "==", companyId)
    .get();

  const batch = admin.firestore().batch();
  let changedCount = 0;

  snapshot.docs.forEach((orderDoc) => {
    const orderData = orderDoc.data() || {};
    const orderCustomerKey = normalizedCustomerKey(orderData.customerName);
    if (orderCustomerKey !== previousKey && orderCustomerKey !== nextKey) return;

    const updates = {};
    let changed = false;

    const setText = (field, nextValue, maxLength = 180) => {
      const previous = cleanOrderText(orderData[field], "", maxLength);
      const next = cleanOrderText(nextValue, "", maxLength);
      if (previous === next) return;
      updates[field] = next;
      changed = true;
    };

    setText("customerName", customerPayload.name, 180);
    setText("emailAddress", customerPayload.email, 220);
    setText("whatsappNumber", customerPayload.phone, 80);
    setText("instagramUsername", customerPayload.instagram, 120);

    const currentFields = orderData.customFields && typeof orderData.customFields === "object" && !Array.isArray(orderData.customFields)
      ? { ...orderData.customFields }
      : {};
    const previousAddress = cleanOrderText(currentFields.communicationAddress || currentFields.Address, "", 1000);
    const nextAddress = cleanOrderText(customerPayload.address, "", 1000);
    if (previousAddress !== nextAddress) {
      if (nextAddress) {
        currentFields.communicationAddress = nextAddress;
        currentFields.Address = nextAddress;
      } else {
        delete currentFields.communicationAddress;
        delete currentFields.Address;
      }
      updates.customFields = currentFields;
      changed = true;
    }
    const previousCustomerNotes = cleanOrderNotes(currentFields.communicationCustomerNotes);
    const nextCustomerNotes = cleanOrderNotes(customerPayload.notes);
    if (previousCustomerNotes !== nextCustomerNotes) {
      if (nextCustomerNotes) currentFields.communicationCustomerNotes = nextCustomerNotes;
      else delete currentFields.communicationCustomerNotes;
      updates.customFields = currentFields;
      changed = true;
    }

    let nextCommunication = cleanCommunicationChannels(orderData.communication);
    if (customerPayload.instagram) nextCommunication = addCommunicationChannel(nextCommunication, "Instagram");
    if (customerPayload.phone) nextCommunication = addCommunicationChannel(nextCommunication, "WhatsApp");
    if (!sameStringArray(cleanCommunicationChannels(orderData.communication), nextCommunication)) {
      updates.communication = nextCommunication;
      changed = true;
    }

    if (!changed) return;

    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    updates.updatedByUid = uid;
    updates.updatedByEmail = email;
    updates.customerSyncedFromProfileAt = admin.firestore.FieldValue.serverTimestamp();
    batch.set(orderDoc.ref, updates, { merge: true });
    changedCount += 1;
  });

  if (changedCount > 0) {
    await batch.commit();
  }
  return changedCount;
}

async function clearDeletedCustomerFromOrders(companyId, deletedCustomerName, uid = "", email = "") {
  const deletedKey = normalizedCustomerKey(deletedCustomerName);
  if (!deletedKey) return 0;

  const snapshot = await admin.firestore()
    .collection("siparisler")
    .where("companyId", "==", companyId)
    .get();

  const batch = admin.firestore().batch();
  let changedCount = 0;

  snapshot.docs.forEach((orderDoc) => {
    const orderData = orderDoc.data() || {};
    if (normalizedCustomerKey(orderData.customerName) !== deletedKey) return;

    const updates = {
      customerName: "New Project",
      emailAddress: "",
      whatsappNumber: "",
      instagramUsername: "",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedByUid: uid,
      updatedByEmail: email
    };

    const currentFields = orderData.customFields && typeof orderData.customFields === "object" && !Array.isArray(orderData.customFields)
      ? { ...orderData.customFields }
      : {};
    let customFieldsChanged = false;
    ["communicationAddress", "Address", "communicationCustomerNotes"].forEach((key) => {
      if (hasOwnField(currentFields, key)) {
        delete currentFields[key];
        customFieldsChanged = true;
      }
    });
    Object.keys(currentFields).forEach((key) => {
      if (key.startsWith("communicationChannel::")) {
        delete currentFields[key];
        customFieldsChanged = true;
      }
    });
    if (customFieldsChanged) {
      updates.customFields = currentFields;
    }

    const previousCommunication = cleanCommunicationChannels(orderData.communication);
    const nextCommunication = previousCommunication.filter((channel) => {
      const normalized = channel.toLowerCase();
      return normalized !== "instagram" && normalized !== "whatsapp" && normalized !== "tiktok";
    });
    if (!sameStringArray(previousCommunication, nextCommunication)) {
      updates.communication = nextCommunication;
    }

    const existingHistory = Array.isArray(orderData.historyLog) ? orderData.historyLog : [];
    updates.historyLog = [
      webHistoryEntry("Customer deleted", orderData.customerName, "New Project", uid, email),
      ...existingHistory
    ].slice(0, 120);

    batch.set(orderDoc.ref, updates, { merge: true });
    changedCount += 1;
  });

  if (changedCount > 0) {
    await batch.commit();
  }
  return changedCount;
}

exports.createWebCustomer = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, false);
  if (!uidCanEditWorkspaceCustomers(companyData, uid)) {
    throw new HttpsError("permission-denied", "Your workspace role cannot create customers.");
  }

  const entitlements = billingEntitlementsForCompany(companyData);
  const limits = planLimitsFromEntitlements(entitlements, companyData);
  const usage = await workspaceBillingUsage(companyId, companyData);
  const validation = validateBillingAction("create_customer", entitlements, usage, limits, request.data || {});
  if (!validation.allowed) {
    throw new HttpsError("failed-precondition", "Your current plan has reached its customer limit. Upgrade the workspace plan to add more customers.", validation);
  }

  const payload = cleanCustomerPayload(request.data || {}, true);
  const email = String(request.auth?.token?.email || "");
  const db = admin.firestore();
  const customerRef = db.collection("musteriler").doc();
  await customerRef.set({
    companyId,
    ...customerPayloadWithAddressAliases(payload),
    profileImageUrl: "",
    lastContactDate: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdByUid: uid,
    createdByEmail: email,
    updatedByUid: uid,
    updatedByEmail: email,
    source: "web"
  });

  await syncCustomerContactToOrders(companyId, payload.name, payload, uid, email);

  const updatedUsage = await workspaceBillingUsage(companyId, companyData);
  await saveWorkspaceBillingUsage(companyRef, updatedUsage, entitlements, limits, "web_customer_created");

  return {
    ok: true,
    companyId,
    customerId: customerRef.id,
    message: "Customer created."
  };
});

exports.updateWebCustomer = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyData } = await requireWorkspaceForBilling(request, false);
  if (!uidCanEditWorkspaceCustomers(companyData, uid)) {
    throw new HttpsError("permission-denied", "Your workspace role cannot edit customers.");
  }

  const customerId = String(request.data?.customerId || "").trim();
  if (!customerId) {
    throw new HttpsError("invalid-argument", "customerId is required.");
  }

  const payload = cleanCustomerPayload(request.data || {}, true);
  const email = String(request.auth?.token?.email || "");
  const customerRef = admin.firestore().collection("musteriler").doc(customerId);
  let previousName = "";

  await admin.firestore().runTransaction(async (transaction) => {
    const customerSnap = await transaction.get(customerRef);
    if (!customerSnap.exists) {
      throw new HttpsError("not-found", "Customer not found.");
    }
    const customerData = customerSnap.data() || {};
    if (String(customerData.companyId || "").trim() !== companyId) {
      throw new HttpsError("permission-denied", "This customer does not belong to the active workspace.");
    }
    previousName = cleanOrderText(customerData.name, "", 180);

    transaction.set(customerRef, {
      ...customerPayloadWithAddressAliases(payload),
      companyId,
      lastContactDate: customerData.lastContactDate || admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedByUid: uid,
      updatedByEmail: email,
      source: customerData.source || "web"
    }, { merge: true });
  });

  const syncedOrderCount = await syncCustomerContactToOrders(companyId, previousName || payload.name, payload, uid, email);

  return {
    ok: true,
    companyId,
    customerId,
    syncedOrderCount,
    message: "Customer updated."
  };
});

exports.deleteWebCustomer = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, false);
  if (!uidCanEditWorkspaceCustomers(companyData, uid)) {
    throw new HttpsError("permission-denied", "Your workspace role cannot delete customers.");
  }

  const customerId = String(request.data?.customerId || "").trim();
  if (!customerId) {
    throw new HttpsError("invalid-argument", "customerId is required.");
  }

  const customerRef = admin.firestore().collection("musteriler").doc(customerId);
  const email = String(request.auth?.token?.email || "");
  let deletedCustomerName = "";
  await admin.firestore().runTransaction(async (transaction) => {
    const customerSnap = await transaction.get(customerRef);
    if (!customerSnap.exists) {
      throw new HttpsError("not-found", "Customer not found.");
    }

    const customerData = customerSnap.data() || {};
    if (String(customerData.companyId || "").trim() !== companyId) {
      throw new HttpsError("permission-denied", "This customer does not belong to the active workspace.");
    }
    deletedCustomerName = cleanOrderText(customerData.name, "", 180);

    transaction.delete(customerRef);
  });

  const clearedOrderCount = await clearDeletedCustomerFromOrders(companyId, deletedCustomerName, uid, email);

  const entitlements = billingEntitlementsForCompany(companyData);
  const limits = planLimitsFromEntitlements(entitlements, companyData);
  const updatedUsage = await workspaceBillingUsage(companyId, companyData);
  await saveWorkspaceBillingUsage(companyRef, updatedUsage, entitlements, limits, "web_customer_deleted");

  return {
    ok: true,
    companyId,
    customerId,
    clearedOrderCount,
    message: "Customer deleted."
  };
});

exports.createWebOrder = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, false);
  if (!uidCanEditWorkspaceOrders(companyData, uid)) {
    throw new HttpsError("permission-denied", "Your workspace role cannot create orders.");
  }

  const entitlements = billingEntitlementsForCompany(companyData);
  const limits = planLimitsFromEntitlements(entitlements, companyData);
  const usage = await workspaceBillingUsage(companyId, companyData);
  const validation = validateBillingAction("create_order", entitlements, usage, limits, request.data || {});
  if (!validation.allowed) {
    throw new HttpsError("failed-precondition", "Your current plan has reached its order limit. Upgrade the workspace plan to add more orders.", validation);
  }

  const requestData = request.data || {};
  const creatorRole = normalizeWorkspaceRole(workspaceOrderRole(companyData, uid));
  const workflowOnlyCreator = creatorRole === "workflowOnly";
  const assignedScopeCreator = usesRestrictedAssignedProjectScope(companyData, uid, creatorRole);
  const customerName = cleanOrderText(requestData.customerName, "New Project", 180) || "New Project";
  const designName = cleanOrderText(requestData.designName, "", 180);

  const orderValue = workflowOnlyCreator ? 0 : cleanOrderNumber(requestData.orderValue);
  const paidAmount = workflowOnlyCreator ? 0 : Math.min(cleanOrderNumber(requestData.paidAmount), orderValue);
  const remainingAmount = workflowOnlyCreator ? 0 : Math.max(orderValue - paidAmount, 0);
  const paymentDate = new Date();
  const dueDate = dateFromISODate(requestData.deliveryDueDate) || dueDateForOrder(paymentDate, 45);

  const deliveryTime = deliveryTimeFromDueDate(paymentDate, dueDate);
  const email = String(request.auth?.token?.email || "");
  const db = admin.firestore();
  const orderRef = db.collection("siparisler").doc();
  const status = cleanOrderStatus(requestData.paintingStatus, "Not Yet");
  const designStatus = cleanOrderStatus(requestData.designStatus, "Not Yet");
  const settingsSnapshot = await companySettingsDocRef(companyId).get();
  const financialSettings = financialSettingsFromData(settingsSnapshot.exists ? settingsSnapshot.data() || {} : {});
  const advancedFinanceEnabled = entitlements.advancedFinanceEnabled === true && !workflowOnlyCreator;
  const paymentFee = advancedFinanceEnabled ? roundMoneyValue((orderValue * cleanPercentageNumber(financialSettings.feePercentage, 3)) / 100) : 0;
  const taxType = advancedFinanceEnabled ? financialTaxTypeForPaymentDate(financialSettings, paymentDate) : "";
  const taxRate = advancedFinanceEnabled ? cleanPercentageNumber(financialSettings.defaultTaxRate, 20) : 0;
  const taxAmount = advancedFinanceEnabled ? webFinanceTaxAmount({
    paidAmount,
    remainingAmount,
    watchPurchasePrice: 0,
    paymentFee,
    deliveryCost: 0,
    taxRate,
    taxType
  }) : 0;

  const orderPayload = {
    companyId,
    paymentMethod: "Card",
    customerName,
    paymentDate: admin.firestore.Timestamp.fromDate(paymentDate),
    paidAmount,
    remainingAmount,
    watchPurchasePrice: 0,
    watchRef: cleanOrderText(requestData.watchRef, "", 180),
    deliveryTime,
    designName,
    designLink: "",
    communication: [],
    emailAddress: "",
    instagramUsername: "",
    whatsappNumber: "",
    notes: cleanOrderNotes(requestData.notes),
    designStatus,
    status,
    isDispatched: false,
    trackingNumber: "",
    courier: "Auto Detect",
    isDelivered: false,
    paymentFee,
    deliveryCost: 0,
    taxType,
    extraStatuses: {},
    taxRate,
    invBool1: false,
    invBool2: false,
    invBool3: false,
    invBool4: false,
    invNotes: "",
    taxAmount,
    priority: "Normal",
    risk: "None",
    riskReason: "-",
    customFields: {},
    customToggles: {},
    historyLog: [
      {
        id: crypto.randomUUID(),
        createdAt: admin.firestore.Timestamp.fromDate(paymentDate),
        title: "Order created",
        oldValue: "-",
        newValue: "Created"
      }
    ],
    clientFiles: [],
    todoItems: [],
    workSessions: [],
    assignedToUid: assignedScopeCreator ? uid : "",
    assignedToEmail: assignedScopeCreator ? email : "",
    createdByWorkflowOnly: workflowOnlyCreator,
    createdByAssignedScope: assignedScopeCreator,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdByUid: uid,
    createdByEmail: email,
    source: "web"
  };

  let customerResult = { created: false, customerId: "" };
  await db.runTransaction(async (transaction) => {
    customerResult = await upsertCustomerForWebOrder(transaction, companyId, customerName, paymentDate, uid, email);
    transaction.set(orderRef, orderPayload);
  });

  try {
    const updatedCompanySnap = await companyRef.get();
    const updatedUsage = await workspaceBillingUsage(companyId, updatedCompanySnap.data() || companyData);
    await saveWorkspaceBillingUsage(companyRef, updatedUsage, entitlements, limits, "web_order_created");
  } catch (error) {
    console.warn("Order billing usage update failed:", error?.message || error);
  }

  return {
    ok: true,
    companyId,
    orderId: orderRef.id,
    customerId: customerResult.customerId,
    customerCreated: customerResult.created,
    message: "Order created."
  };
});


function orderDeletionRequestRef(companyId = "", orderId = "") {
  return admin.firestore().collection("companies").doc(String(companyId || "").trim())
    .collection("orderDeletionRequests").doc(String(orderId || "").trim());
}

async function writeOrderDeletionActivityNotification(companyId, notification = {}, recipient = {}) {
  const ref = notificationCollectionRef(companyId).doc();
  const recipientUids = supportUniqueStrings(recipient.userIds || recipient.uids || []);
  const recipientEmails = supportUniqueStrings(recipient.emails || []).map((item) => item.toLowerCase());
  const title = cleanSupportText(notification.title || "Order deletion request", 140);
  const message = cleanSupportText(notification.message || "An order deletion request needs review.", 240);
  const payload = {
    companyId,
    type: String(notification.type || "order_deletion_request"),
    title,
    message,
    route: "orderDeletionRequest",
    orderId: String(notification.orderId || ""),
    senderUid: String(notification.senderUid || ""),
    senderEmail: String(notification.senderEmail || ""),
    senderName: String(notification.senderName || ""),
    priority: String(notification.priority || "High"),
    status: String(notification.status || "pending"),
    source: "orderDeletionApproval",
    recipientUids,
    recipientEmails,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    read: false,
    actioned: false
  };
  await ref.set(payload);
  try {
    const pushResult = await sendPushNotificationToRecipients(companyId, {
      ...payload,
      notificationId: ref.id,
      body: message
    }, { userIds: recipientUids, emails: recipientEmails });
    await ref.set({
      pushSent: Number(pushResult.sent || 0) > 0,
      pushResult,
      pushSentAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.warn("Order deletion request push failed:", error?.message || error);
  }
  return ref.id;
}

exports.requestWorkflowOrderDeletion = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyData } = await requireWorkspaceForBilling(request, false);
  const role = normalizeWorkspaceRole(workspaceOrderRole(companyData, uid));
  if (!canRequestApprovedOrderDeletion(companyData, uid, role)) {
    throw new HttpsError("permission-denied", "Only assigned-project roles can request deletion for their assigned order.");
  }

  const orderId = String(request.data?.orderId || "").trim();
  if (!orderId) throw new HttpsError("invalid-argument", "orderId is required.");

  const db = admin.firestore();
  const orderRef = db.collection("siparisler").doc(orderId);
  const requestRef = orderDeletionRequestRef(companyId, orderId);
  const requesterEmail = String(request.auth?.token?.email || "").trim().toLowerCase();
  const requesterName = cleanSupportText(request.auth?.token?.name || requesterEmail || "Workflow member", 120);
  const ownerUid = String(companyData.ownerUid || "").trim();
  const ownerEmail = String(companyData.ownerEmail || companyData.email || "").trim().toLowerCase();

  if (!ownerUid && !ownerEmail) {
    throw new HttpsError("failed-precondition", "Workspace owner could not be identified.");
  }

  const created = await db.runTransaction(async (transaction) => {
    const [orderSnap, requestSnap] = await Promise.all([
      transaction.get(orderRef),
      transaction.get(requestRef)
    ]);
    if (!orderSnap.exists) throw new HttpsError("not-found", "Order not found.");
    const orderData = orderSnap.data() || {};
    if (orderCompanyId(orderData) !== companyId) {
      throw new HttpsError("permission-denied", "This order does not belong to the active workspace.");
    }
    requireAssignedProjectAccess(companyData, orderData, uid, role);
    if (requestSnap.exists && String(requestSnap.data()?.status || "") === "pending") {
      return { alreadyPending: true, orderData };
    }
    transaction.set(requestRef, {
      companyId,
      orderId,
      status: "pending",
      requestedByUid: uid,
      requestedByEmail: requesterEmail,
      requestedByName: requesterName,
      orderCustomerName: cleanOrderText(orderData.customerName, "Order", 180),
      orderDesignName: cleanOrderText(orderData.designName, "", 180),
      assignedToUid: String(orderData.assignedToUid || ""),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: false });
    return { alreadyPending: false, orderData };
  });

  if (created.alreadyPending) {
    return { ok: true, alreadyPending: true, orderId, status: "pending", message: "Deletion request is already waiting for owner approval." };
  }

  const orderLabel = cleanOrderText(created.orderData.designName || created.orderData.customerName || "Order", "Order", 180);
  const notificationId = await writeOrderDeletionActivityNotification(companyId, {
    type: "order_deletion_request",
    title: "Order deletion request",
    message: `${requesterName} requested deletion of ${orderLabel}.`,
    orderId,
    senderUid: uid,
    senderEmail: requesterEmail,
    senderName: requesterName,
    status: "pending"
  }, { userIds: [ownerUid], emails: [ownerEmail] });
  await requestRef.set({ notificationId }, { merge: true });

  return { ok: true, orderId, status: "pending", message: "Deletion request sent to workspace owner." };
});

exports.approveWorkflowOrderDeletion = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, false);
  if (!uidIsCompanyOwner(companyData, uid)) {
    throw new HttpsError("permission-denied", "Only the workspace owner can approve order deletion requests.");
  }
  const orderId = String(request.data?.orderId || "").trim();
  if (!orderId) throw new HttpsError("invalid-argument", "orderId is required.");

  const db = admin.firestore();
  const requestRef = orderDeletionRequestRef(companyId, orderId);
  const orderRef = db.collection("siparisler").doc(orderId);
  const viewRef = workflowOrderViewRef(companyId, orderId);
  const outcome = await db.runTransaction(async (transaction) => {
    const [requestSnap, orderSnap] = await Promise.all([transaction.get(requestRef), transaction.get(orderRef)]);
    if (!requestSnap.exists || String(requestSnap.data()?.status || "") !== "pending") {
      throw new HttpsError("failed-precondition", "This deletion request is no longer pending.");
    }
    const requestData = requestSnap.data() || {};
    if (orderSnap.exists) {
      const orderData = orderSnap.data() || {};
      if (orderCompanyId(orderData) !== companyId) {
        throw new HttpsError("permission-denied", "This order does not belong to the active workspace.");
      }
      transaction.delete(orderRef);
    }
    transaction.delete(viewRef);
    transaction.set(requestRef, {
      status: "approved",
      reviewedByUid: uid,
      reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    if (requestData.notificationId) {
      transaction.set(notificationCollectionRef(companyId).doc(String(requestData.notificationId)), {
        status: "approved",
        actioned: true,
        actionedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
    return requestData;
  });

  await writeOrderDeletionActivityNotification(companyId, {
    type: "order_deletion_approved",
    title: "Order deletion approved",
    message: "Your order deletion request was approved by the workspace owner.",
    orderId,
    status: "approved"
  }, { userIds: [String(outcome.requestedByUid || "")], emails: [String(outcome.requestedByEmail || "")] });

  try {
    const entitlements = billingEntitlementsForCompany(companyData);
    const limits = planLimitsFromEntitlements(entitlements, companyData);
    const updatedCompanySnap = await companyRef.get();
    const updatedUsage = await workspaceBillingUsage(companyId, updatedCompanySnap.data() || companyData);
    await saveWorkspaceBillingUsage(companyRef, updatedUsage, entitlements, limits, "workflow_order_deletion_approved");
  } catch (error) {
    console.warn("Order billing usage update after approved delete failed:", error?.message || error);
  }

  return { ok: true, orderId, status: "approved", message: "Deletion approved and order deleted." };
});

exports.rejectWorkflowOrderDeletion = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyData } = await requireWorkspaceForBilling(request, false);
  if (!uidIsCompanyOwner(companyData, uid)) {
    throw new HttpsError("permission-denied", "Only the workspace owner can reject order deletion requests.");
  }
  const orderId = String(request.data?.orderId || "").trim();
  if (!orderId) throw new HttpsError("invalid-argument", "orderId is required.");
  const requestRef = orderDeletionRequestRef(companyId, orderId);
  const requestSnap = await requestRef.get();
  if (!requestSnap.exists || String(requestSnap.data()?.status || "") !== "pending") {
    throw new HttpsError("failed-precondition", "This deletion request is no longer pending.");
  }
  const requestData = requestSnap.data() || {};
  await requestRef.set({
    status: "rejected",
    reviewedByUid: uid,
    reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  if (requestData.notificationId) {
    await notificationCollectionRef(companyId).doc(String(requestData.notificationId)).set({
      status: "rejected",
      actioned: true,
      actionedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }
  await writeOrderDeletionActivityNotification(companyId, {
    type: "order_deletion_rejected",
    title: "Order deletion rejected",
    message: "Your order deletion request was rejected by the workspace owner.",
    orderId,
    status: "rejected"
  }, { userIds: [String(requestData.requestedByUid || "")], emails: [String(requestData.requestedByEmail || "")] });
  return { ok: true, orderId, status: "rejected", message: "Deletion request rejected." };
});

exports.deleteWebOrder = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, false);
  const role = normalizeWorkspaceRole(workspaceOrderRole(companyData, uid));
  if (usesRestrictedAssignedProjectScope(companyData, uid, role)) {
    throw new HttpsError("permission-denied", "This assigned-project role must request owner approval before deleting an order.");
  }
  if (!canDeleteOrder(role) || !uidCanAccessWorkspaceArea(companyData, uid, "orders")) {
    throw new HttpsError("permission-denied", "Your workspace role cannot delete orders.");
  }

  const orderId = String(request.data?.orderId || "").trim();
  if (!orderId) throw new HttpsError("invalid-argument", "orderId is required.");

  const db = admin.firestore();
  const orderRef = db.collection("siparisler").doc(orderId);
  const deleted = await db.runTransaction(async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists) {
      throw new HttpsError("not-found", "Order not found.");
    }
    const orderData = orderSnap.data() || {};
    if (orderCompanyId(orderData) !== companyId) {
      throw new HttpsError("permission-denied", "This order does not belong to the active workspace.");
    }
    transaction.delete(orderRef);
    return {
      customerName: cleanOrderText(orderData.customerName, "Order", 180),
      designName: cleanOrderText(orderData.designName, "", 180)
    };
  });

  try {
    const entitlements = billingEntitlementsForCompany(companyData);
    const limits = planLimitsFromEntitlements(entitlements, companyData);
    const updatedCompanySnap = await companyRef.get();
    const updatedUsage = await workspaceBillingUsage(companyId, updatedCompanySnap.data() || companyData);
    await saveWorkspaceBillingUsage(companyRef, updatedUsage, entitlements, limits, "web_order_deleted");
  } catch (error) {
    console.warn("Order billing usage update after delete failed:", error?.message || error);
  }

  return {
    ok: true,
    companyId,
    orderId,
    customerName: deleted.customerName,
    designName: deleted.designName,
    message: "Order deleted."
  };
});

const SWIFT_ORDER_FIELDS = [
  "paymentMethod",
  "customerName",
  "paymentDate",
  "paidAmount",
  "remainingAmount",
  "watchPurchasePrice",
  "watchRef",
  "deliveryTime",
  "designName",
  "designLink",
  "communication",
  "emailAddress",
  "instagramUsername",
  "whatsappNumber",
  "notes",
  "designStatus",
  "status",
  "isDispatched",
  "trackingNumber",
  "courier",
  "isDelivered",
  "paymentFee",
  "deliveryCost",
  "taxType",
  "extraStatuses",
  "taxRate",
  "invBool1",
  "invBool2",
  "invBool3",
  "invBool4",
  "invNotes",
  "taxAmount",
  "priority",
  "risk",
  "riskReason",
  "customFields",
  "customToggles",
  "historyLog",
  "clientFiles",
  "todoItems",
  "workSessions"
];

const SWIFT_ADVANCED_FINANCE_FIELDS = new Set(["paymentFee", "deliveryCost", "taxType", "taxRate", "taxAmount"]);

function preserveBasicPlanCustomFinancialFields(incoming = {}, existing = {}) {
  const next = incoming && typeof incoming === "object" && !Array.isArray(incoming) ? { ...incoming } : {};
  const current = existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {};
  for (const key of Object.keys(next)) {
    if (String(key).startsWith("financialExpense::") || String(key).startsWith("financialRemaining::")) delete next[key];
  }
  for (const [key, value] of Object.entries(current)) {
    if (String(key).startsWith("financialExpense::") || String(key).startsWith("financialRemaining::")) next[key] = value;
  }
  return next;
}

const SWIFT_FINANCE_ORDER_FIELDS = new Set([
  "paymentMethod",
  "paidAmount",
  "remainingAmount",
  "watchPurchasePrice",
  "paymentFee",
  "deliveryCost",
  "taxType",
  "taxRate",
  "taxAmount"
]);

function decodeSwiftCallableValue(value) {
  if (Array.isArray(value)) {
    return value.map(decodeSwiftCallableValue);
  }

  if (value && typeof value === "object") {
    if (Object.prototype.hasOwnProperty.call(value, "__studioflowTimestampMillis")) {
      const millis = Number(value.__studioflowTimestampMillis);
      return Number.isFinite(millis) ? admin.firestore.Timestamp.fromMillis(millis) : null;
    }

    const output = {};
    for (const [key, child] of Object.entries(value)) {
      output[key] = decodeSwiftCallableValue(child);
    }
    return output;
  }

  return value;
}

exports.saveSwiftOrder = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyData } = await requireWorkspaceForBilling(request, false);
  const rawRole = workspaceOrderRole(companyData, uid);
  const role = normalizeWorkspaceRole(rawRole);
  const canEditFullOrder = canFullyEditOrder(role);
  const canWorkflowEdit = canEditWorkflowOnly(role);

  if (!canEditFullOrder && !canWorkflowEdit) {
    throw new HttpsError("permission-denied", `Your current role is ${workspaceRoleLabel(role)} and cannot edit this order.`);
  }
  requireWorkspaceAreaAccess(companyData, uid, "orders", "Orders are not enabled for your workspace account.");
  const canEditFinanceFields = uidCanAccessWorkspaceArea(companyData, uid, "financialInfo");
  const advancedFinanceEnabled = billingEntitlementsForCompany(companyData).advancedFinanceEnabled === true;

  const orderId = String(request.data?.orderId || "").trim();
  if (!orderId) throw new HttpsError("invalid-argument", "orderId is required.");

  const rawOrder = request.data?.order;
  if (!rawOrder || typeof rawOrder !== "object" || Array.isArray(rawOrder)) {
    throw new HttpsError("invalid-argument", "order is required.");
  }

  const decodedOrder = decodeSwiftCallableValue(rawOrder);
  const email = String(request.auth?.token?.email || "");
  const orderRef = orderDocRef(orderId);
  const changedFields = [];

  await admin.firestore().runTransaction(async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists) {
      throw new HttpsError("not-found", "Order not found.");
    }

    const orderData = orderSnap.data() || {};
    if (orderCompanyId(orderData) !== companyId) {
      throw new HttpsError("permission-denied", "This order does not belong to the active workspace.");
    }
    requireAssignedProjectAccess(companyData, orderData, uid, role);

    const updates = {
      companyId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedByUid: uid,
      updatedByEmail: email,
      source: orderData.source || "app"
    };

    for (const field of SWIFT_ORDER_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(decodedOrder, field)) continue;
      if (canWorkflowEdit && !canEditFullOrder && SWIFT_FINANCE_ORDER_FIELDS.has(field)) continue;
      if (!canEditFinanceFields && SWIFT_FINANCE_ORDER_FIELDS.has(field)) continue;
      if (!advancedFinanceEnabled && SWIFT_ADVANCED_FINANCE_FIELDS.has(field)) continue;
      updates[field] = field === "customFields" && !advancedFinanceEnabled
        ? preserveBasicPlanCustomFinancialFields(decodedOrder[field], orderData.customFields)
        : decodedOrder[field];
      changedFields.push(field);
    }

    if (changedFields.length === 0) {
      return;
    }

    transaction.update(orderRef, updates);
  });

  return {
    ok: true,
    companyId,
    orderId,
    changedFields,
    message: changedFields.length > 0 ? "Order saved." : "No editable fields to save."
  };
});

exports.createSwiftOrder = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, false);
  const rawRole = workspaceOrderRole(companyData, uid);
  const role = normalizeWorkspaceRole(rawRole);
  const workflowOnlyCreator = role === "workflowOnly";
  const assignedScopeCreator = usesRestrictedAssignedProjectScope(companyData, uid, role);
  if (!canEditOrderStatus(role)) {
    throw new HttpsError("permission-denied", `Your current role is ${workspaceRoleLabel(role)} and cannot create orders.`);
  }

  const entitlements = billingEntitlementsForCompany(companyData);
  const limits = planLimitsFromEntitlements(entitlements, companyData);
  const usage = await workspaceBillingUsage(companyId, companyData);
  const validation = validateBillingAction("create_order", entitlements, usage, limits, request.data || {});
  if (!validation.allowed) {
    throw new HttpsError("failed-precondition", "Your current plan has reached its order limit. Upgrade the workspace plan to add more orders.", validation);
  }

  const requestedOrderId = String(request.data?.orderId || "").trim();
  if (requestedOrderId.includes("/") || requestedOrderId.includes("..")) {
    throw new HttpsError("invalid-argument", "Invalid orderId.");
  }

  const rawOrder = request.data?.order;
  if (!rawOrder || typeof rawOrder !== "object" || Array.isArray(rawOrder)) {
    throw new HttpsError("invalid-argument", "order is required.");
  }

  const decodedOrder = decodeSwiftCallableValue(rawOrder);
  const email = String(request.auth?.token?.email || "");
  const orderRef = requestedOrderId ? orderDocRef(requestedOrderId) : admin.firestore().collection("siparisler").doc();
  const createdFields = [];
  const orderPayload = {
    companyId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdByUid: uid,
    createdByEmail: email,
    updatedByUid: uid,
    updatedByEmail: email,
    source: "app"
  };

  for (const field of SWIFT_ORDER_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(decodedOrder, field)) continue;
    if (workflowOnlyCreator && SWIFT_FINANCE_ORDER_FIELDS.has(field)) continue;
    if (entitlements.advancedFinanceEnabled !== true && SWIFT_ADVANCED_FINANCE_FIELDS.has(field)) continue;
    orderPayload[field] = field === "customFields" && entitlements.advancedFinanceEnabled !== true
      ? preserveBasicPlanCustomFinancialFields(decodedOrder[field], {})
      : decodedOrder[field];
    createdFields.push(field);
  }

  if (assignedScopeCreator) {
    orderPayload.assignedToUid = uid;
    orderPayload.assignedToEmail = email;
    orderPayload.createdByAssignedScope = true;
  }

  if (workflowOnlyCreator) {
    orderPayload.createdByWorkflowOnly = true;
    orderPayload.paidAmount = 0;
    orderPayload.remainingAmount = 0;
    orderPayload.watchPurchasePrice = 0;
    orderPayload.paymentFee = 0;
    orderPayload.deliveryCost = 0;
    orderPayload.taxType = "";
    orderPayload.taxRate = 0;
    orderPayload.taxAmount = 0;
  }

  await admin.firestore().runTransaction(async (transaction) => {
    const existingSnap = await transaction.get(orderRef);
    if (existingSnap.exists) {
      throw new HttpsError("already-exists", "Order already exists.");
    }
    transaction.set(orderRef, orderPayload);
  });

  try {
    const updatedCompanySnap = await companyRef.get();
    const updatedUsage = await workspaceBillingUsage(companyId, updatedCompanySnap.data() || companyData);
    await saveWorkspaceBillingUsage(companyRef, updatedUsage, entitlements, limits, "swift_order_created");
  } catch (error) {
    console.warn("Swift order billing usage update failed:", error?.message || error);
  }

  return {
    ok: true,
    companyId,
    orderId: orderRef.id,
    changedFields: createdFields,
    message: "Order created."
  };
});

exports.updateWebOrder = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyData } = await requireWorkspaceForBilling(request, false);
  const requestData = request.data || {};
  const rawRole = workspaceOrderRole(companyData, uid);
  const normalizedRole = normalizeWorkspaceRole(rawRole);
  const canEditFullOrder = canFullyEditOrder(normalizedRole);
  const canWorkflowEdit = canEditWorkflowOnly(normalizedRole);
  const requestedFieldKeys = Object.keys(requestData).filter(key => key !== "companyId" && key !== "orderId");
  if (!canEditFullOrder && !canWorkflowEdit) {
    logUpdateWebOrderPermissionDecision({
      uid,
      workspaceId: companyId,
      rawRole,
      normalizedRole,
      requestedFieldKeys,
      canFullEdit: canEditFullOrder,
      canWorkflowEdit
    });
    throw new HttpsError("permission-denied", `Your current role is ${workspaceRoleLabel(normalizedRole)} and cannot edit this order.`);
  }

  const orderId = String(requestData.orderId || "").trim();
  if (!orderId) throw new HttpsError("invalid-argument", "orderId is required.");

  const email = String(request.auth?.token?.email || "");
  const db = admin.firestore();
  const orderRef = db.collection("siparisler").doc(orderId);
  const fullEditFields = [
    "customerName",
    "designName",
    "watchRef",
    "orderValue",
    "paidAmount",
    "deliveryDueDate",
    "notes"
  ];
  const attemptedFullEdit = fullEditFields.some(field => hasOwnField(requestData, field));
  const attemptedFinanceEdit = hasOwnField(requestData, "finance");
  const attemptedDetailsEdit = hasOwnField(requestData, "details");
  const attemptedTodoEdit = hasOwnField(requestData, "todo");
  const attemptedScheduleEdit = hasOwnField(requestData, "schedule");
  const attemptedWorkTimeEdit = hasOwnField(requestData, "workTime");
  const attemptedStatusEdit = hasOwnField(requestData, "designStatus") || hasOwnField(requestData, "paintingStatus");
  const attemptedFullFinanceFieldEdit = ["orderValue", "paidAmount"].some((field) => hasOwnField(requestData, field));
  const detailsPatch = requestData.details && typeof requestData.details === "object" && !Array.isArray(requestData.details)
    ? requestData.details
    : {};
  const attemptedProjectAssignmentEdit = attemptedDetailsEdit
    && (hasOwnField(detailsPatch, "assignedToUid") || hasOwnField(detailsPatch, "assignedToEmail"));
  const workflowDetailFields = new Set([
    "customerName",
    "designName",
    "watchRef",
    "designLink",
    "emailAddress",
    "whatsappNumber",
    "instagramUsername",
    "tiktokUsername",
    "address",
    "communication",
    "customerNotes",
    "paymentDate",
    "deliveryTime",
    "deliveryDueDate",
    "courier",
    "trackingNumber",
    "isDispatched",
    "isDelivered",
    "priority",
    "risk",
    "riskReason",
    "invBool1",
    "invBool2",
    "invBool3",
    "invBool4",
    "invNotes",
    "extraStatuses",
    "customToggles",
    "materialsDefaultToggles",
    "materialsToggles",
    "statusNotesSupplier",
    "notes",
    "customFields",
    "specialNotes"
  ]);
  const materialDetailFields = new Set([
    "invBool1",
    "invBool2",
    "invBool3",
    "invBool4",
    "invNotes",
    "materialsDefaultToggles",
    "materialsToggles"
  ]);
  const attemptedWorkflowOnlyDetails = attemptedDetailsEdit
    && Object.keys(detailsPatch).length > 0
    && Object.keys(detailsPatch).every((field) => workflowDetailFields.has(field));
  const attemptedMaterialsEdit = attemptedDetailsEdit
    && Object.keys(detailsPatch).some((field) => materialDetailFields.has(field));
  if ((attemptedFullEdit || attemptedDetailsEdit || attemptedTodoEdit || attemptedWorkTimeEdit || attemptedStatusEdit) && !uidCanAccessWorkspaceArea(companyData, uid, "orders")) {
    throw new HttpsError("permission-denied", "Orders are not enabled for your workspace account.");
  }
  if (attemptedScheduleEdit && !uidCanAccessWorkspaceArea(companyData, uid, "schedule")) {
    throw new HttpsError("permission-denied", "Schedule is not enabled for your workspace account.");
  }
  if ((attemptedFinanceEdit || attemptedFullFinanceFieldEdit) && !uidCanAccessWorkspaceArea(companyData, uid, "financialInfo")) {
    throw new HttpsError("permission-denied", "Financial Info is not enabled for your workspace account.");
  }
  const entitlements = billingEntitlementsForCompany(companyData);
  if (attemptedMaterialsEdit && !entitlements.materialsInventoryCardsEnabled) {
    throw new HttpsError("failed-precondition", "Materials & Inventory is available from NivaDesk Lite.");
  }
  if (attemptedProjectAssignmentEdit && !canManageProjectAssignments(companyData, uid, normalizedRole)) {
    throw new HttpsError("permission-denied", "Your workspace role cannot assign projects.");
  }
  if (attemptedProjectAssignmentEdit) {
    const requestedAssignedUid = cleanOrderText(detailsPatch.assignedToUid, "", 160);
    if (requestedAssignedUid) {
      const members = companyMembersMap(companyData);
      const member = members[requestedAssignedUid] && typeof members[requestedAssignedUid] === "object" && !Array.isArray(members[requestedAssignedUid])
        ? members[requestedAssignedUid]
        : null;
      if (!member) {
        throw new HttpsError("invalid-argument", "Select a workspace member for this project.");
      }
      detailsPatch.assignedToUid = requestedAssignedUid;
      detailsPatch.assignedToEmail = cleanOrderText(member.email || detailsPatch.assignedToEmail, "", 220);
    } else {
      detailsPatch.assignedToUid = "";
      detailsPatch.assignedToEmail = "";
    }
  }

  const result = await db.runTransaction(async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists) {
      throw new HttpsError("not-found", "Order not found.");
    }
    const settingsSnap = await transaction.get(companySettingsDocRef(companyId));
    const settingsData = settingsSnap.exists ? settingsSnap.data() || {} : {};
    const financialSettings = {
      ...financialSettingsFromData(settingsData),
      ...blockHeadingSettingsFromData(settingsData)
    };

    const orderData = orderSnap.data() || {};
    if (orderCompanyId(orderData) !== companyId) {
      throw new HttpsError("permission-denied", "This order does not belong to the active workspace.");
    }
    requireAssignedProjectAccess(companyData, orderData, uid, normalizedRole);

    const paymentDate = dateFromFirestore(orderData.paymentDate, new Date());
    const updates = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedByUid: uid,
      updatedByEmail: email,
      source: orderData.source || "web"
    };
    const historyEntries = [];

    const nextDesignStatus = cleanOrderStatus(requestData.designStatus, cleanOrderStatus(orderData.designStatus, "Not Yet"));
    const nextPaintingStatus = cleanOrderStatus(requestData.paintingStatus, cleanOrderStatus(orderData.status, "Not Yet"));
    if (nextDesignStatus !== cleanOrderStatus(orderData.designStatus, "Not Yet")) {
      updates.designStatus = nextDesignStatus;
      pushHistoryChange(historyEntries, "Design status changed", orderData.designStatus, nextDesignStatus, uid, email);
    }
    if (nextPaintingStatus !== cleanOrderStatus(orderData.status, "Not Yet")) {
      updates.status = nextPaintingStatus;
      pushHistoryChange(historyEntries, "Painting status changed", orderData.status, nextPaintingStatus, uid, email);
    }

    if (canEditFullOrder && attemptedFullEdit) {
      const requestedCustomerName = hasOwnField(requestData, "customerName") ? requestData.customerName : orderData.customerName;
      const nextCustomerName = cleanOrderText(requestedCustomerName, "", 180) || "New Project";
      const nextDesignName = cleanOrderText(requestData.designName, cleanOrderText(orderData.designName, ""), 180);
      if (!nextDesignName) throw new HttpsError("invalid-argument", "Design name is required.");

      if (nextCustomerName !== cleanOrderText(orderData.customerName, "", 180)) {
        updates.customerName = nextCustomerName;
        pushHistoryChange(historyEntries, "Customer changed", orderData.customerName, nextCustomerName, uid, email);
      }
      if (nextDesignName !== cleanOrderText(orderData.designName, "", 180)) {
        updates.designName = nextDesignName;
        pushHistoryChange(historyEntries, "Design changed", orderData.designName, nextDesignName, uid, email);
      }

      const nextWatchRef = cleanOrderText(requestData.watchRef, cleanOrderText(orderData.watchRef, ""), 180);
      if (nextWatchRef !== cleanOrderText(orderData.watchRef, "", 180)) {
        updates.watchRef = nextWatchRef;
        pushHistoryChange(historyEntries, "Reference changed", orderData.watchRef, nextWatchRef, uid, email);
      }

      const previousOrderValue = cleanOrderNumber(orderData.paidAmount) + cleanOrderNumber(orderData.remainingAmount);
      const nextOrderValue = cleanOrderNumber(requestData.orderValue);
      const nextPaidAmount = Math.min(cleanOrderNumber(requestData.paidAmount), nextOrderValue);
      const nextRemainingAmount = Math.max(nextOrderValue - nextPaidAmount, 0);
      if (nextOrderValue !== previousOrderValue) {
        pushHistoryChange(historyEntries, "Order value changed", amountHistoryValue(previousOrderValue), amountHistoryValue(nextOrderValue), uid, email);
      }
      if (nextPaidAmount !== cleanOrderNumber(orderData.paidAmount)) {
        pushHistoryChange(historyEntries, "Paid amount changed", amountHistoryValue(orderData.paidAmount), amountHistoryValue(nextPaidAmount), uid, email);
      }
      if (nextRemainingAmount !== cleanOrderNumber(orderData.remainingAmount)) {
        pushHistoryChange(historyEntries, "Remaining amount recalculated", amountHistoryValue(orderData.remainingAmount), amountHistoryValue(nextRemainingAmount), uid, email);
      }
      if (nextPaidAmount !== cleanOrderNumber(orderData.paidAmount)) updates.paidAmount = nextPaidAmount;
      if (nextRemainingAmount !== cleanOrderNumber(orderData.remainingAmount)) updates.remainingAmount = nextRemainingAmount;

      const dueDate = dateFromISODate(requestData.deliveryDueDate);
      if (!dueDate) throw new HttpsError("invalid-argument", "Delivery due date is required.");
      const previousDueDate = dueDateForOrder(paymentDate, Number(orderData.deliveryTime || 0));
      const nextDeliveryTime = deliveryTimeFromDueDate(paymentDate, dueDate);
      const nextDueDate = dueDateForOrder(paymentDate, nextDeliveryTime);
      if (nextDeliveryTime !== Number(orderData.deliveryTime || 0)) {
        updates.deliveryTime = nextDeliveryTime;
        pushHistoryChange(historyEntries, "Due date changed", shortISODate(previousDueDate), shortISODate(nextDueDate), uid, email);
      }

      const nextNotes = cleanOrderNotes(requestData.notes);
      if (nextNotes !== String(orderData.notes || "")) {
        updates.notes = nextNotes;
        pushHistoryChange(historyEntries, "Notes updated", orderData.notes ? "Notes" : "-", nextNotes ? "Notes" : "-", uid, email);
      }
    }

    if (canEditFullOrder && attemptedFinanceEdit) {
      applyWebFinancePatch({
        patch: requestData.finance,
        orderData: {
          ...orderData,
          ...updates
        },
        companyData,
        updates,
        historyEntries,
        uid,
        email,
        entitlements,
        financialSettings
      });
    }

    if ((canEditFullOrder || (canWorkflowEdit && attemptedWorkflowOnlyDetails)) && attemptedDetailsEdit) {
      applyWebDetailsPatch({
        patch: requestData.details,
        orderData: {
          ...orderData,
          ...updates
        },
        companyData: settingsData,
        updates,
        historyEntries,
        uid,
        email
      });
    }

    if ((canEditFullOrder || canWorkflowEdit) && attemptedTodoEdit) {
      applyWebTodoPatch({
        patch: requestData.todo,
        orderData: {
          ...orderData,
          ...updates
        },
        updates,
        historyEntries,
        uid,
        email,
        entitlements
      });
    }

    if ((canEditFullOrder || canWorkflowEdit) && attemptedScheduleEdit) {
      applyWebSchedulePatch({
        patch: requestData.schedule,
        orderData: {
          ...orderData,
          ...updates
        },
        updates,
        historyEntries,
        uid,
        email,
        entitlements
      });
    }

    if ((canEditFullOrder || canWorkflowEdit) && attemptedWorkTimeEdit) {
      applyWebWorkTimePatch({
        patch: requestData.workTime,
        orderData: {
          ...orderData,
          ...updates
        },
        updates,
        historyEntries,
        uid,
        email
      });
    }

    if (!canEditFullOrder && canWorkflowEdit) {
      const forbiddenFields = [
        "customerName",
        "designName",
        "watchRef",
        "orderValue",
        "paidAmount",
        "deliveryDueDate",
        "notes",
        "finance",
        ...(attemptedWorkflowOnlyDetails ? [] : ["details"]),
      ];
      const attemptedForbiddenEdit = forbiddenFields.some(field => hasOwnField(requestData, field));
      if (attemptedForbiddenEdit) {
        logUpdateWebOrderPermissionDecision({
          uid,
          workspaceId: companyId,
          rawRole,
          normalizedRole,
          requestedFieldKeys,
          canFullEdit: canEditFullOrder,
          canWorkflowEdit
        });
        throw new HttpsError("permission-denied", "Your current role is Workflow Only and cannot edit finance fields.");
      }
    } else if (!canEditFullOrder && (attemptedFullEdit || attemptedFinanceEdit || attemptedDetailsEdit || attemptedTodoEdit || attemptedScheduleEdit || attemptedWorkTimeEdit)) {
      logUpdateWebOrderPermissionDecision({
        uid,
        workspaceId: companyId,
        rawRole,
        normalizedRole,
        requestedFieldKeys,
        canFullEdit: canEditFullOrder,
        canWorkflowEdit
      });
      throw new HttpsError("permission-denied", `Your current role is ${workspaceRoleLabel(normalizedRole)} and cannot edit this order.`);
    }

    const customerSyncFields = customerSyncFieldsFromOrderRequest(requestData);
    if ((canEditFullOrder || canWorkflowEdit) && hasCustomerSyncFields(customerSyncFields)) {
      await upsertCustomerContactForWebOrder(transaction, companyId, orderId, {
        ...orderData,
        ...updates
      }, customerSyncFields, uid, email, orderData.customerName);
    }

    if (historyEntries.length > 0) {
      const existingHistory = Array.isArray(orderData.historyLog) ? orderData.historyLog : [];
      updates.historyLog = [...historyEntries, ...existingHistory].slice(0, 120);
    }

    const updateKeys = Object.keys(updates).filter(key => !["updatedAt", "updatedByUid", "updatedByEmail", "source"].includes(key));
    if (updateKeys.length > 0) {
      transaction.update(orderRef, updates);
    }

    return {
      changed: updateKeys.length > 0,
      historyCount: historyEntries.length
    };
  });

  return {
    ok: true,
    companyId,
    orderId,
    changed: result.changed,
    historyCount: result.historyCount,
    message: result.changed ? "Order updated." : "No changes to save."
  };
});

function validateClientFileMutationPlan(action, companyData = {}, companyId = "", requestData = {}) {
  const entitlements = billingEntitlementsForCompany(companyData);
  const limits = planLimitsFromEntitlements(entitlements, companyData);
  const usage = {
    orderCount: Number(companyData.billingUsageOrderCount || 0),
    customerCount: Number(companyData.billingUsageCustomerCount || 0),
    teamMemberCount: teamMemberCountFromCompanyData(companyData),
    clientFilesCount: Number(companyData.billingUsageClientFilesCount || 0),
    clientFilesBytes: Number(companyData.billingUsageClientFilesBytes || 0),
    clientFilesMB: Math.round((Number(companyData.billingUsageClientFilesBytes || 0) / 1024 / 1024) * 10) / 10
  };
  const validation = validateBillingAction(action, entitlements, usage, limits, requestData);
  if (!validation.allowed) {
    throw new HttpsError("failed-precondition", "Client Files management requires NivaDesk Pro or Team.", validation);
  }
  return { entitlements, limits, usage, companyId };
}

async function requireClientFileMutationContext(request, action) {
  const { uid, companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, false);
  const role = normalizeWorkspaceRole(workspaceOrderRole(companyData, uid));
  if (!uidCanManageClientFiles(companyData, uid)) {
    throw new HttpsError("permission-denied", "Your workspace role cannot manage Client Files.");
  }

  validateClientFileMutationPlan(action, companyData, companyId, request.data || {});

  const orderId = String(request.data?.orderId || "").trim();
  const fileId = String(request.data?.fileId || "").trim();
  if (!orderId || !fileId) {
    throw new HttpsError("invalid-argument", "orderId and fileId are required.");
  }

  return {
    uid,
    companyId,
    companyRef,
    companyData,
    role,
    orderId,
    fileId,
    orderRef: orderDocRef(orderId)
  };
}

function readClientFileFromOrder(orderSnap, companyId, fileId, uid = "", role = "") {
  if (!orderSnap.exists) {
    throw new HttpsError("not-found", "Order not found.");
  }
  const orderData = orderSnap.data() || {};
  if (orderCompanyId(orderData) !== companyId) {
    throw new HttpsError("permission-denied", "This order does not belong to the active workspace.");
  }
  requireAssignedProjectAccess(companyData, orderData, uid, role);

  const files = Array.isArray(orderData.clientFiles) ? [...orderData.clientFiles] : [];
  const fileIndex = findClientFileIndex(files, fileId);
  if (fileIndex < 0) {
    throw new HttpsError("not-found", "Client file not found.");
  }
  const file = files[fileIndex] && typeof files[fileIndex] === "object" ? files[fileIndex] : {};
  return { orderData, files, fileIndex, file };
}

function safeClientFileStoragePath(companyId, storagePath) {
  const path = String(storagePath || "").trim();
  const prefix = `companies/${companyId}/client_files/`;
  if (!path.startsWith(prefix)) return "";
  if (path.includes("..") || path.includes("//")) return "";
  return path;
}

function safeClientFileMetadata(companyId, orderId, rawFile = {}, requestData = {}, auth = {}) {
  if (!rawFile || typeof rawFile !== "object" || Array.isArray(rawFile)) {
    throw new HttpsError("invalid-argument", "clientFile metadata is required.");
  }

  const fileId = String(rawFile.id || requestData.fileId || crypto.randomUUID()).trim();
  const fileName = cleanClientFileName(rawFile.fileName || rawFile.originalFileName || rawFile.name);
  const storagePath = safeClientFileStoragePath(companyId, rawFile.storagePath);
  const expectedPrefix = `companies/${companyId}/client_files/${String(orderId).replace(/\//g, "_")}/`;
  if (!storagePath || !storagePath.startsWith(expectedPrefix)) {
    throw new HttpsError("invalid-argument", "Client file Storage path is not valid for this order.");
  }

  const downloadURL = String(rawFile.downloadURL || "").trim();
  if (!downloadURL || downloadURL.length > 2000) {
    throw new HttpsError("invalid-argument", "Client file download URL is required.");
  }

  const contentType = String(rawFile.contentType || rawFile.fileType || "application/octet-stream").trim().slice(0, 120);
  const fileSize = Math.max(0, Math.round(Number(rawFile.fileSize || rawFile.size || rawFile.sizeBytes || requestData.fileSizeBytes || 0)));
  const uploadedByEmail = String(rawFile.uploadedByEmail || auth.token?.email || "").trim().slice(0, 240);
  const uploadedBy = String(rawFile.uploadedBy || uploadedByEmail || auth.uid || "unknown").trim().slice(0, 240);
  const uploadedAtRaw = rawFile.uploadedAt || requestData.uploadedAt;
  const uploadedAt = typeof uploadedAtRaw === "string" && uploadedAtRaw.trim()
    ? admin.firestore.Timestamp.fromDate(new Date(uploadedAtRaw))
    : admin.firestore.Timestamp.now();

  return {
    id: fileId,
    fileName,
    downloadURL,
    storagePath,
    contentType,
    fileSize,
    uploadedByUid: String(rawFile.uploadedByUid || auth.uid || "unknown").trim(),
    uploadedByEmail,
    uploadedBy,
    uploadedAt,
    source: String(rawFile.source || "web").trim().slice(0, 80) || "web",
    note: String(rawFile.note || "").trim().slice(0, 500),
    isPendingUpload: false,
    localFilePath: "",
    pendingQueueId: ""
  };
}

exports.appendClientFile = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, false);
  if (!uidCanManageClientFiles(companyData, uid)) {
    throw new HttpsError("permission-denied", "Your workspace role cannot manage Client Files.");
  }

  const orderId = String(request.data?.orderId || "").trim();
  if (!orderId) {
    throw new HttpsError("invalid-argument", "orderId is required.");
  }

  const clientFile = safeClientFileMetadata(companyId, orderId, request.data?.clientFile, request.data || {}, request.auth || {});
  validateClientFileMutationPlan("upload_client_file", companyData, companyId, {
    ...(request.data || {}),
    fileSizeBytes: clientFile.fileSize
  });

  const db = admin.firestore();
  const orderRef = orderDocRef(orderId);

  await db.runTransaction(async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists) {
      throw new HttpsError("not-found", "Order not found.");
    }
    const orderData = orderSnap.data() || {};
    if (orderCompanyId(orderData) !== companyId) {
      throw new HttpsError("permission-denied", "This order does not belong to the active workspace.");
    }
    requireAssignedProjectAccess(companyData, orderData, uid, workspaceOrderRole(companyData, uid));

    const files = Array.isArray(orderData.clientFiles) ? [...orderData.clientFiles] : [];
    const existingIndex = findClientFileIndex(files, clientFile.id);
    if (existingIndex >= 0) {
      files[existingIndex] = clientFile;
    } else {
      files.unshift(clientFile);
    }

    transaction.update(orderRef, {
      clientFiles: files,
      historyLog: historyLogWithEntry(orderData, "Client file uploaded", "-", clientFile.fileName),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedByUid: uid,
      updatedByEmail: String(request.auth?.token?.email || ""),
      source: orderData.source || "web"
    });
  });

  try {
    const updatedCompanySnap = await companyRef.get();
    const entitlements = billingEntitlementsForCompany(updatedCompanySnap.data() || companyData);
    const limits = planLimitsFromEntitlements(entitlements, companyData);
    const usage = await workspaceBillingUsage(companyId, updatedCompanySnap.data() || companyData);
    await saveWorkspaceBillingUsage(companyRef, usage, entitlements, limits, "web_client_file_uploaded");
  } catch (error) {
    console.warn("Client file upload billing usage update failed:", error?.message || error);
  }

  return {
    ok: true,
    companyId,
    orderId,
    fileId: clientFile.id,
    fileName: clientFile.fileName,
    message: "File uploaded."
  };
});

exports.renameClientFile = onCall({ region: "europe-west2" }, async (request) => {
  const context = await requireClientFileMutationContext(request, "rename_client_file");
  const newFileName = cleanClientFileName(request.data?.fileName);
  const db = admin.firestore();

  const result = await db.runTransaction(async (transaction) => {
    const orderSnap = await transaction.get(context.orderRef);
    const { orderData, files, fileIndex, file } = readClientFileFromOrder(orderSnap, context.companyId, context.fileId, context.uid, context.role);
    const oldFileName = clientFileDisplayName(file);

    files[fileIndex] = {
      ...file,
      fileName: newFileName
    };

    transaction.update(context.orderRef, {
      clientFiles: files,
      historyLog: historyLogWithEntry(orderData, "Client file renamed", oldFileName, newFileName),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { oldFileName };
  });

  return {
    ok: true,
    companyId: context.companyId,
    orderId: context.orderId,
    fileId: context.fileId,
    fileName: newFileName,
    oldFileName: result.oldFileName,
    message: "File renamed."
  };
});

exports.deleteClientFile = onCall({ region: "europe-west2" }, async (request) => {
  const context = await requireClientFileMutationContext(request, "delete_client_file");
  const db = admin.firestore();

  const result = await db.runTransaction(async (transaction) => {
    const orderSnap = await transaction.get(context.orderRef);
    const { orderData, files, fileIndex, file } = readClientFileFromOrder(orderSnap, context.companyId, context.fileId, context.uid, context.role);
    const fileName = clientFileDisplayName(file);
    const storagePath = safeClientFileStoragePath(context.companyId, file.storagePath);
    const downloadURL = String(file.downloadURL || "").trim();

    files.splice(fileIndex, 1);

    transaction.update(context.orderRef, {
      clientFiles: files,
      historyLog: historyLogWithEntry(orderData, "Client file deleted", "-", fileName),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { fileName, storagePath, downloadURL };
  });

  let storageDeleted = false;
  let storageCleanupError = "";
  if (result.storagePath) {
    try {
      await admin.storage().bucket().file(result.storagePath).delete({ ignoreNotFound: true });
      storageDeleted = true;
    } catch (error) {
      storageCleanupError = "storage_delete_failed";
      console.warn("Client file storage delete failed:", error?.message || error);
    }
  }

  try {
    await db.collection("uploadAudit").add({
      companyId: context.companyId,
      action: "deleted",
      fileName: result.fileName,
      downloadURL: result.downloadURL,
      storagePath: result.storagePath,
      source: "web_client_file_delete",
      orderId: context.orderId,
      uploadedByUid: context.uid,
      uploadedByEmail: String(request.auth?.token?.email || ""),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.warn("Client file delete audit log failed:", error?.message || error);
  }

  return {
    ok: true,
    companyId: context.companyId,
    orderId: context.orderId,
    fileId: context.fileId,
    fileName: result.fileName,
    storageDeleted,
    storageCleanupError,
    message: storageCleanupError ? "File removed, but Storage cleanup could not complete automatically." : "File deleted."
  };
});

function normalizeTeamRoleForWrite(value, companyData = {}) {
  const customId = customRoleId(value);
  if (customId && customRoleData(companyData, customId)) return customId;
  const normalized = normalizeWorkspaceRole(value, "member");
  if (normalized === "viewOnly") return "viewer";
  if (normalized === "workflowOnly") return "workflow";
  if (["member", "admin"].includes(normalized)) return normalized;
  return "member";
}

function normalizeTeamRoleForStorage(value) {
  const normalized = normalizeWorkspaceRole(value, "member");
  if (normalized === "viewOnly") return "viewer";
  if (normalized === "workflowOnly") return "workflow";
  if (["owner", "admin", "member"].includes(normalized)) return normalized;
  return "member";
}

function requireJoinRequestData(requestSnap, companyId, allowedStatuses = ["pending"]) {
  if (!requestSnap.exists) {
    throw new HttpsError("not-found", "Join request not found.");
  }
  const requestData = requestSnap.data() || {};
  if (String(requestData.targetCompanyId || "").trim() !== companyId) {
    throw new HttpsError("permission-denied", "This join request does not belong to this workspace.");
  }
  const status = String(requestData.status || "pending").trim().toLowerCase();
  if (!allowedStatuses.includes(status)) {
    throw new HttpsError("failed-precondition", "This join request is no longer pending.");
  }
  const requesterUid = String(requestData.requesterUid || "").trim();
  if (!requesterUid) {
    throw new HttpsError("invalid-argument", "Join request is missing requesterUid.");
  }
  return { requestData, requesterUid, status };
}

function requirePendingJoinRequestData(requestSnap, companyId) {
  return requireJoinRequestData(requestSnap, companyId, ["pending"]);
}

function teamMemberPayloadFromJoinRequest(companyData, requestData, requesterUid, role, addedBy, repaired = false, access = defaultWorkspaceAccessForRole(role)) {
  const assignedCustomRoleId = customRoleId(role);
  const storedRole = assignedCustomRoleId ? storedBaseRoleForRoleValue(companyData, role) : normalizeTeamRoleForStorage(role);
  return {
    uid: requesterUid,
    email: String(requestData.requesterEmail || ""),
    displayName: String(requestData.requesterDisplayName || ""),
    photoURL: String(requestData.requesterPhotoURL || ""),
    role: storedRole,
    ...(assignedCustomRoleId ? { customRoleId: assignedCustomRoleId } : {}),
    access,
    addedBy,
    addedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...(repaired ? { repairedFromJoinRequest: true } : {})
  };
}

function workspaceAccessPayloadFromJoinRequest(companyId, companyData, requestData, role, addedBy, repaired = false, access = defaultWorkspaceAccessForRole(role)) {
  const assignedCustomRoleId = customRoleId(role);
  const storedRole = assignedCustomRoleId ? storedBaseRoleForRoleValue(companyData, role) : normalizeTeamRoleForStorage(role);
  return {
    companyId,
    name: String(companyData.name || companyData.companyName || "My Studio"),
    ownerUid: String(companyData.ownerUid || addedBy),
    ownerEmail: String(companyData.ownerEmail || ""),
    role: storedRole,
    customRoleId: assignedCustomRoleId || admin.firestore.FieldValue.delete(),
    access,
    memberEmail: String(requestData.requesterEmail || ""),
    memberPhotoURL: String(requestData.requesterPhotoURL || ""),
    addedBy,
    addedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...(repaired ? { repairedFromJoinRequest: true } : {})
  };
}

function teamMemberPayloadFromManualInput(companyData, data, memberUid, role, access, addedBy, existing = {}) {
  const existingData = existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {};
  const assignedCustomRoleId = customRoleId(role);
  return {
    uid: memberUid,
    email: cleanQuickReplyText(data.email ?? existingData.email ?? "", 220),
    displayName: cleanQuickReplyText(data.displayName ?? existingData.displayName ?? "", 120),
    photoURL: cleanQuickReplyText(existingData.photoURL || "", 2000),
    role: assignedCustomRoleId ? storedBaseRoleForRoleValue(companyData, role) : normalizeTeamRoleForStorage(role),
    ...(assignedCustomRoleId ? { customRoleId: assignedCustomRoleId } : {}),
    access,
    addedBy: existingData.addedBy || addedBy,
    addedAt: existingData.addedAt || admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: addedBy,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    source: existingData.source || "manual"
  };
}

function workspaceAccessPayloadFromManualInput(companyId, companyData, data, role, access, addedBy, existing = {}) {
  const existingData = existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {};
  const assignedCustomRoleId = customRoleId(role);
  const storedRole = assignedCustomRoleId ? storedBaseRoleForRoleValue(companyData, role) : normalizeTeamRoleForStorage(role);
  return {
    companyId,
    name: String(companyData.name || companyData.companyName || "My Studio"),
    ownerUid: String(companyData.ownerUid || addedBy),
    ownerEmail: String(companyData.ownerEmail || ""),
    role: storedRole,
    customRoleId: assignedCustomRoleId || admin.firestore.FieldValue.delete(),
    access,
    memberEmail: cleanQuickReplyText(data.email ?? existingData.email ?? "", 220),
    memberDisplayName: cleanQuickReplyText(data.displayName ?? existingData.displayName ?? "", 120),
    memberPhotoURL: cleanQuickReplyText(existingData.photoURL || existingData.memberPhotoURL || "", 2000),
    addedBy: existingData.addedBy || addedBy,
    addedAt: existingData.addedAt || admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: addedBy,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    source: existingData.source || "manual"
  };
}

async function reconcileAcceptedJoinRequestsForWorkspace(companyId, ownerUid, companyRef, companyData) {
  const db = admin.firestore();
  const joinSnap = await db.collection("workspaceJoinRequests")
    .where("targetCompanyId", "==", companyId)
    .get();

  const currentMembers = companyMembersMap(companyData);
  const removedMemberUids = new Set(Array.isArray(companyData.removedMemberUids) ? companyData.removedMemberUids : []);
  const companyUpdate = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  const repairedUids = [];
  const batch = db.batch();

  joinSnap.forEach((docSnap) => {
    const requestData = docSnap.data() || {};
    const status = String(requestData.status || "").trim().toLowerCase();
    if (!["accepted", "approved"].includes(status)) return;

    const requesterUid = String(requestData.requesterUid || "").trim();
    if (!requesterUid || currentMembers[requesterUid] || removedMemberUids.has(requesterUid)) return;

    const role = normalizeTeamRoleForWrite(requestData.role || "member", companyData);
    const access = accessForRoleValue(companyData, role, {});
    companyUpdate[`members.${requesterUid}`] = teamMemberPayloadFromJoinRequest(companyData, requestData, requesterUid, role, ownerUid, true, access);
    companyUpdate[`memberRoles.${requesterUid}`] = storedBaseRoleForRoleValue(companyData, role);
    if (customRoleId(role)) companyUpdate[`memberCustomRoles.${requesterUid}`] = customRoleId(role);
    else companyUpdate[`memberCustomRoles.${requesterUid}`] = admin.firestore.FieldValue.delete();
    companyUpdate[`memberAccess.${requesterUid}`] = access;
    repairedUids.push(requesterUid);

    const accessRef = db.collection("users").doc(requesterUid).collection("workspaceAccess").doc(companyId);
    batch.set(accessRef, workspaceAccessPayloadFromJoinRequest(companyId, companyData, requestData, role, ownerUid, true, access), { merge: true });
  });

  if (!repairedUids.length) {
    return { repairedCount: 0, repairedUids: [] };
  }

  companyUpdate.memberUids = admin.firestore.FieldValue.arrayUnion(...repairedUids);
  batch.update(companyRef, companyUpdate);
  await batch.commit();

  return { repairedCount: repairedUids.length, repairedUids };
}

exports.approveWorkspaceJoinRequest = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, true);
  const requestId = String(request.data?.requestId || "").trim();
  const role = normalizeTeamRoleForWrite(request.data?.role, companyData);

  if (!requestId) {
    throw new HttpsError("invalid-argument", "requestId is required.");
  }

  const entitlements = billingEntitlementsForCompany(companyData);
  const limits = planLimitsFromEntitlements(entitlements, companyData);
  const usage = await workspaceBillingUsage(companyId, companyData);
  const validation = validateBillingAction("add_team_member", entitlements, usage, limits, request.data || {});
  if (!validation.allowed) {
    throw new HttpsError("failed-precondition", teamSeatLimitMessage(limits), validation);
  }

  const db = admin.firestore();
  const requestRef = db.collection("workspaceJoinRequests").doc(requestId);
  const requestSnap = await requestRef.get();
  const { requestData, requesterUid, status } = requireJoinRequestData(requestSnap, companyId, ["pending", "accepted", "approved"]);

  if (requesterUid === String(companyData.ownerUid || "")) {
    throw new HttpsError("failed-precondition", "The workspace owner is already a member.");
  }

  const memberAccess = accessForRoleValue(companyData, role, {});
  const memberPayload = teamMemberPayloadFromJoinRequest(companyData, requestData, requesterUid, role, uid, status !== "pending", memberAccess);
  const accessPayload = workspaceAccessPayloadFromJoinRequest(companyId, companyData, requestData, role, uid, status !== "pending", memberAccess);

  const batch = db.batch();
  batch.update(companyRef, {
    [`members.${requesterUid}`]: memberPayload,
    [`memberRoles.${requesterUid}`]: storedBaseRoleForRoleValue(companyData, role),
    [`memberCustomRoles.${requesterUid}`]: customRoleId(role) || admin.firestore.FieldValue.delete(),
    [`memberAccess.${requesterUid}`]: memberAccess,
    memberUids: admin.firestore.FieldValue.arrayUnion(requesterUid),
    removedMemberUids: admin.firestore.FieldValue.arrayRemove(requesterUid),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  batch.set(db.collection("users").doc(requesterUid).collection("workspaceAccess").doc(companyId), accessPayload, { merge: true });
  // Auto-switch the approved user's active workspace to the workspace they just
  // got accepted into so they don't have to manually pick it from Team Access on
  // the next platform launch. All clients (Mac, iPhone, Android, Web) listen to
  // users/{uid}.activeCompanyId and will refresh the visible workspace live.
  batch.set(db.collection("users").doc(requesterUid), {
    activeCompanyId: companyId,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  batch.set(requestRef, {
    status: "accepted",
    acceptedBy: uid,
    acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  await batch.commit();

  const updatedCompanySnap = await companyRef.get();
  const updatedUsage = await workspaceBillingUsage(companyId, updatedCompanySnap.data() || companyData);
  await saveWorkspaceBillingUsage(companyRef, updatedUsage, entitlements, limits, "team_join_approved");

  return {
    ok: true,
    companyId,
    requesterUid,
    role,
    message: "Access request approved."
  };
});

exports.declineWorkspaceJoinRequest = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId } = await requireWorkspaceForBilling(request, true);
  const requestId = String(request.data?.requestId || "").trim();
  if (!requestId) {
    throw new HttpsError("invalid-argument", "requestId is required.");
  }

  const requestRef = admin.firestore().collection("workspaceJoinRequests").doc(requestId);
  const requestSnap = await requestRef.get();
  requirePendingJoinRequestData(requestSnap, companyId);

  await requestRef.set({
    status: "declined",
    declinedBy: uid,
    declinedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return {
    ok: true,
    companyId,
    requestId,
    message: "Access request declined."
  };
});

function cleanWorkspaceRequestIdentifier(value) {
  return String(value || "").trim();
}

function isLikelyEmailIdentifier(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanWorkspaceRequestIdentifier(value));
}

async function targetCompanyIdFromOwnerIdentifier(rawIdentifier) {
  const identifier = cleanWorkspaceRequestIdentifier(rawIdentifier);
  if (!identifier) {
    throw new HttpsError("invalid-argument", "Owner email or Company ID is required.");
  }

  if (!isLikelyEmailIdentifier(identifier)) {
    return identifier;
  }

  const db = admin.firestore();
  try {
    const authUser = await admin.auth().getUserByEmail(identifier);
    if (authUser?.uid) return authUser.uid;
  } catch (error) {
    if (error?.code !== "auth/user-not-found") {
      console.warn("Owner email auth lookup failed:", error?.message || error);
    }
  }

  const candidates = Array.from(new Set([identifier, identifier.toLowerCase()]));
  for (const email of candidates) {
    const snap = await db.collection("companies").where("ownerEmail", "==", email).limit(1).get();
    if (!snap.empty) return snap.docs[0].id;
  }

  throw new HttpsError("not-found", "Workspace not found. Check the owner email or Company ID and try again.");
}

exports.requestWorkspaceAccess = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Please sign in before sending a workspace access request.");
  }

  const rawIdentifier = request.data?.ownerIdentifier || request.data?.ownerEmail || request.data?.ownerCompanyId || request.data?.companyId;
  const targetCompanyId = await targetCompanyIdFromOwnerIdentifier(rawIdentifier);
  if (targetCompanyId === uid) {
    throw new HttpsError("failed-precondition", "This is already your own workspace.");
  }

  const db = admin.firestore();
  const companyRef = db.collection("companies").doc(targetCompanyId);
  const companySnap = await companyRef.get();
  if (!companySnap.exists) {
    throw new HttpsError("not-found", "Workspace not found. Check the owner email or Company ID and try again.");
  }

  const companyData = companySnap.data() || {};
  companyData.__workspaceId = targetCompanyId;

  const targetEntitlements = billingEntitlementsForCompany(companyData);
  if (targetEntitlements.teamAccessEnabled !== true) {
    throw new HttpsError(
      "failed-precondition",
      "This workspace is not accepting members because it does not have an active NivaDesk Team plan."
    );
  }

  if (uidHasCompanyAccess(companyData, uid)) {
    throw new HttpsError("failed-precondition", "You already have access to this workspace.");
  }

  const token = request.auth?.token || {};
  const requestId = `${targetCompanyId}_${uid}`;
  const requestRef = db.collection("workspaceJoinRequests").doc(requestId);
  const existingSnap = await requestRef.get();
  const existingData = existingSnap.data() || {};
  const existingStatus = String(existingData.status || "").trim().toLowerCase();
  if (["accepted", "approved"].includes(existingStatus)) {
    throw new HttpsError("failed-precondition", "This request was already approved. Ask the owner to refresh Team Access if the workspace is missing.");
  }

  await requestRef.set({
    requesterUid: uid,
    requesterEmail: String(token.email || ""),
    requesterDisplayName: String(token.name || ""),
    requesterPhotoURL: String(token.picture || ""),
    targetCompanyId,
    status: "pending",
    createdAt: existingData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    source: String(request.data?.source || "web").trim() || "web"
  }, { merge: true });

  return {
    ok: true,
    companyId: targetCompanyId,
    requestId,
    message: "Access request sent. The workspace owner can approve it from Team Access."
  };
});

exports.saveWorkspaceCustomRole = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, true);
  const entitlements = billingEntitlementsForCompany(companyData);
  if (entitlements.teamAccessEnabled !== true) {
    throw new HttpsError("failed-precondition", "Custom roles require NivaDesk Team.");
  }

  const requestedId = customRoleId(request.data?.roleId);
  const roleId = requestedId || `custom_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const name = cleanCustomRoleName(request.data?.name);
  const normalizedBaseRole = normalizeWorkspaceRole(request.data?.baseRole || "member", "member");
  const baseRole = normalizedBaseRole === "viewOnly"
    ? "viewer"
    : normalizedBaseRole === "workflowOnly"
      ? "workflow"
      : "member";
  const access = cleanWorkspaceMemberAccess(request.data?.access || {});

  const assignedMemberUids = Object.keys(companyMembersMap(companyData))
    .filter(memberUid => workspaceMemberRoleValue(companyData, memberUid, "") === roleId);
  const companyUpdate = {
    [`customRoles.${roleId}`]: {
      id: roleId,
      name,
      baseRole,
      access,
      updatedBy: uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: customRoleData(companyData, roleId)?.createdAt || admin.firestore.FieldValue.serverTimestamp()
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  assignedMemberUids.forEach(memberUid => {
    companyUpdate[`members.${memberUid}.role`] = baseRole;
    companyUpdate[`members.${memberUid}.customRoleId`] = roleId;
    companyUpdate[`members.${memberUid}.access`] = access;
    companyUpdate[`members.${memberUid}.updatedBy`] = uid;
    companyUpdate[`members.${memberUid}.updatedAt`] = admin.firestore.FieldValue.serverTimestamp();
    companyUpdate[`memberRoles.${memberUid}`] = baseRole;
    companyUpdate[`memberCustomRoles.${memberUid}`] = roleId;
    companyUpdate[`memberAccess.${memberUid}`] = access;
  });

  const batch = admin.firestore().batch();
  batch.update(companyRef, companyUpdate);
  assignedMemberUids.forEach(memberUid => {
    batch.set(admin.firestore().collection("users").doc(memberUid).collection("workspaceAccess").doc(companyId), {
      role: baseRole,
      customRoleId: roleId,
      access,
      updatedBy: uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });
  await batch.commit();

  return {
    ok: true,
    companyId,
    appliedMemberCount: assignedMemberUids.length,
    role: { id: roleId, name, baseRole, access },
    message: "Custom role saved."
  };
});

exports.deleteWorkspaceCustomRole = onCall({ region: "europe-west2" }, async (request) => {
  const { companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, true);
  const roleId = customRoleId(request.data?.roleId);
  if (!roleId || !customRoleData(companyData, roleId)) {
    throw new HttpsError("not-found", "Custom role not found.");
  }

  const members = companyMembersMap(companyData);
  const inUse = Object.entries(members).some(([memberUid, member]) => {
    return workspaceMemberRoleValue(companyData, memberUid, "") === roleId ||
      (member && typeof member === "object" && !Array.isArray(member) && String(member.role || "").trim() === roleId);
  });
  if (inUse) {
    throw new HttpsError("failed-precondition", "This role is assigned to a member. Move those members to another role first.");
  }

  await companyRef.update({
    [`customRoles.${roleId}`]: admin.firestore.FieldValue.delete(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return {
    ok: true,
    companyId,
    roleId,
    message: "Custom role deleted."
  };
});

exports.addWorkspaceTeamMember = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, true);
  const memberUid = String(request.data?.memberUid || "").trim();
  const role = normalizeTeamRoleForWrite(request.data?.role, companyData);
  const access = accessForRoleValue(companyData, role, request.data?.access || {});

  if (!memberUid) {
    throw new HttpsError("invalid-argument", "memberUid is required.");
  }
  if (memberUid === uid || memberUid === String(companyData.ownerUid || "") || memberUid === companyId) {
    throw new HttpsError("failed-precondition", "The workspace owner is already a member.");
  }

  const entitlements = billingEntitlementsForCompany(companyData);
  if (entitlements.teamAccessEnabled !== true) {
    throw new HttpsError("failed-precondition", "Adding team members requires NivaDesk Team.");
  }

  const members = companyMembersMap(companyData);
  const alreadyMember = Boolean(members[memberUid]);
  if (!alreadyMember) {
    const limits = planLimitsFromEntitlements(entitlements, companyData);
    const usage = await workspaceBillingUsage(companyId, companyData);
    const validation = validateBillingAction("add_team_member", entitlements, usage, limits, request.data || {});
    if (!validation.allowed) {
      throw new HttpsError("failed-precondition", teamSeatLimitMessage(limits), validation);
    }
  }

  const memberPayload = teamMemberPayloadFromManualInput(companyData, request.data || {}, memberUid, role, access, uid, members[memberUid]);
  const accessPayload = workspaceAccessPayloadFromManualInput(companyId, companyData, request.data || {}, role, access, uid, members[memberUid]);
  const storedRole = storedBaseRoleForRoleValue(companyData, role);
  const assignedCustomRoleId = customRoleId(role);
  const db = admin.firestore();
  const batch = db.batch();
  batch.update(companyRef, {
    [`members.${memberUid}`]: memberPayload,
    [`memberRoles.${memberUid}`]: storedRole,
    [`memberCustomRoles.${memberUid}`]: assignedCustomRoleId || admin.firestore.FieldValue.delete(),
    [`memberAccess.${memberUid}`]: access,
    memberUids: admin.firestore.FieldValue.arrayUnion(memberUid),
    removedMemberUids: admin.firestore.FieldValue.arrayRemove(memberUid),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  batch.set(db.collection("users").doc(memberUid).collection("workspaceAccess").doc(companyId), accessPayload, { merge: true });
  batch.set(db.collection("workspaceJoinRequests").doc(`${companyId}_${memberUid}`), {
    targetCompanyId: companyId,
    requesterUid: memberUid,
    requesterEmail: memberPayload.email,
    requesterDisplayName: memberPayload.displayName,
    requesterPhotoURL: memberPayload.photoURL,
    status: "accepted",
    acceptedBy: uid,
    acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    source: "manual"
  }, { merge: true });
  await batch.commit();

  const updatedCompanySnap = await companyRef.get();
  const updatedCompanyData = updatedCompanySnap.data() || companyData;
  const limits = planLimitsFromEntitlements(billingEntitlementsForCompany(updatedCompanyData), updatedCompanyData);
  const usage = await workspaceBillingUsage(companyId, updatedCompanyData);
  await saveWorkspaceBillingUsage(companyRef, usage, billingEntitlementsForCompany(updatedCompanyData), limits, alreadyMember ? "team_member_updated" : "team_member_added");

  return {
    ok: true,
    companyId,
    memberUid,
    role,
    access,
    message: alreadyMember ? "Team member updated." : "Team member added."
  };
});

exports.updateWorkspaceMemberProfile = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, true);
  const memberUid = String(request.data?.memberUid || "").trim();
  const displayName = cleanQuickReplyText(request.data?.displayName || "", 120);
  const email = cleanQuickReplyText(request.data?.email || "", 220);

  if (!memberUid) {
    throw new HttpsError("invalid-argument", "memberUid is required.");
  }
  if (memberUid === uid || memberUid === String(companyData.ownerUid || "") || memberUid === companyId) {
    throw new HttpsError("failed-precondition", "The workspace owner profile is managed from Account.");
  }

  const entitlements = billingEntitlementsForCompany(companyData);
  if (entitlements.teamAccessEnabled !== true) {
    throw new HttpsError("failed-precondition", "Changing team member profiles requires NivaDesk Team.");
  }

  const members = companyMembersMap(companyData);
  if (!members[memberUid]) {
    throw new HttpsError("not-found", "Team member not found.");
  }

  const db = admin.firestore();
  const batch = db.batch();
  batch.update(companyRef, {
    [`members.${memberUid}.displayName`]: displayName,
    [`members.${memberUid}.email`]: email,
    [`members.${memberUid}.updatedBy`]: uid,
    [`members.${memberUid}.updatedAt`]: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  batch.set(db.collection("users").doc(memberUid).collection("workspaceAccess").doc(companyId), {
    memberDisplayName: displayName,
    memberEmail: email,
    updatedBy: uid,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  await batch.commit();

  return {
    ok: true,
    companyId,
    memberUid,
    displayName,
    email,
    message: "Team member profile updated."
  };
});

exports.updateWorkspaceMemberRole = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, true);
  const memberUid = String(request.data?.memberUid || "").trim();
  const role = normalizeTeamRoleForWrite(request.data?.role, companyData);

  if (!memberUid) {
    throw new HttpsError("invalid-argument", "memberUid is required.");
  }
  if (memberUid === uid || memberUid === String(companyData.ownerUid || "")) {
    throw new HttpsError("failed-precondition", "The owner role cannot be changed here.");
  }

  const entitlements = billingEntitlementsForCompany(companyData);
  if (entitlements.teamAccessEnabled !== true) {
    throw new HttpsError("failed-precondition", "Changing team roles requires NivaDesk Team.");
  }

  const members = companyMembersMap(companyData);
  if (!members[memberUid]) {
    throw new HttpsError("not-found", "Team member not found.");
  }

  const db = admin.firestore();
  const access = accessForRoleValue(companyData, role, {});
  const storedRole = storedBaseRoleForRoleValue(companyData, role);
  const assignedCustomRoleId = customRoleId(role);
  const batch = db.batch();
  batch.update(companyRef, {
    [`members.${memberUid}.role`]: storedRole,
    [`members.${memberUid}.customRoleId`]: assignedCustomRoleId || admin.firestore.FieldValue.delete(),
    [`members.${memberUid}.access`]: access,
    [`members.${memberUid}.updatedBy`]: uid,
    [`members.${memberUid}.updatedAt`]: admin.firestore.FieldValue.serverTimestamp(),
    [`memberRoles.${memberUid}`]: storedRole,
    [`memberCustomRoles.${memberUid}`]: assignedCustomRoleId || admin.firestore.FieldValue.delete(),
    [`memberAccess.${memberUid}`]: access,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  batch.set(db.collection("users").doc(memberUid).collection("workspaceAccess").doc(companyId), {
    role: storedRole,
    customRoleId: assignedCustomRoleId || admin.firestore.FieldValue.delete(),
    access,
    updatedBy: uid,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  await batch.commit();

  return {
    ok: true,
    companyId,
    memberUid,
    role,
    message: "Team role updated."
  };
});

exports.updateWorkspaceMemberAccess = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, true);
  const memberUid = String(request.data?.memberUid || "").trim();
  const access = cleanWorkspaceMemberAccess(request.data?.access || {});

  if (!memberUid) {
    throw new HttpsError("invalid-argument", "memberUid is required.");
  }
  if (memberUid === uid || memberUid === String(companyData.ownerUid || "") || memberUid === companyId) {
    throw new HttpsError("failed-precondition", "The workspace owner always keeps full access.");
  }

  const entitlements = billingEntitlementsForCompany(companyData);
  if (entitlements.teamAccessEnabled !== true) {
    throw new HttpsError("failed-precondition", "Changing team access requires NivaDesk Team.");
  }

  const members = companyMembersMap(companyData);
  if (!members[memberUid]) {
    throw new HttpsError("not-found", "Team member not found.");
  }

  const db = admin.firestore();
  const batch = db.batch();
  batch.update(companyRef, {
    [`memberAccess.${memberUid}`]: access,
    [`members.${memberUid}.access`]: access,
    [`members.${memberUid}.updatedBy`]: uid,
    [`members.${memberUid}.updatedAt`]: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  batch.set(db.collection("users").doc(memberUid).collection("workspaceAccess").doc(companyId), {
    access,
    updatedBy: uid,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  await batch.commit();

  return {
    ok: true,
    companyId,
    memberUid,
    access,
    message: "Team member access updated."
  };
});

exports.removeWorkspaceTeamMember = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, true);
  const memberUid = String(request.data?.memberUid || "").trim();

  if (!memberUid) {
    throw new HttpsError("invalid-argument", "memberUid is required.");
  }
  if (memberUid === uid || memberUid === String(companyData.ownerUid || "")) {
    throw new HttpsError("failed-precondition", "The workspace owner cannot be removed here.");
  }

  const members = companyMembersMap(companyData);
  if (!members[memberUid]) {
    // Still make sure the user's access document and accepted join request do not re-create access later.
  }

  const db = admin.firestore();
  const deterministicRequestRef = db.collection("workspaceJoinRequests").doc(`${companyId}_${memberUid}`);
  const accessRef = db.collection("users").doc(memberUid).collection("workspaceAccess").doc(companyId);
  const relatedRequestSnap = await db.collection("workspaceJoinRequests")
    .where("targetCompanyId", "==", companyId)
    .where("requesterUid", "==", memberUid)
    .get();

  const batch = db.batch();
  batch.update(companyRef, {
    [`members.${memberUid}`]: admin.firestore.FieldValue.delete(),
    [`memberRoles.${memberUid}`]: admin.firestore.FieldValue.delete(),
    [`memberCustomRoles.${memberUid}`]: admin.firestore.FieldValue.delete(),
    [`memberAccess.${memberUid}`]: admin.firestore.FieldValue.delete(),
    memberUids: admin.firestore.FieldValue.arrayRemove(memberUid),
    removedMemberUids: admin.firestore.FieldValue.arrayUnion(memberUid),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  batch.delete(accessRef);

  const removalPayload = {
    targetCompanyId: companyId,
    requesterUid: memberUid,
    status: "removed",
    removedBy: uid,
    removedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  if (relatedRequestSnap.empty) {
    batch.set(deterministicRequestRef, removalPayload, { merge: true });
  } else {
    relatedRequestSnap.forEach((docSnap) => {
      batch.set(docSnap.ref, removalPayload, { merge: true });
    });
    if (!relatedRequestSnap.docs.some((docSnap) => docSnap.id === deterministicRequestRef.id)) {
      batch.set(deterministicRequestRef, removalPayload, { merge: true });
    }
  }

  await batch.commit();

  const updatedCompanySnap = await companyRef.get();
  const updatedCompanyData = updatedCompanySnap.data() || companyData;
  const entitlements = billingEntitlementsForCompany(updatedCompanyData);
  const limits = planLimitsFromEntitlements(entitlements, companyData);
  const usage = await workspaceBillingUsage(companyId, updatedCompanyData);
  await saveWorkspaceBillingUsage(companyRef, usage, entitlements, limits, "team_member_removed");

  return {
    ok: true,
    companyId,
    memberUid,
    message: "Team member removed."
  };
});

exports.syncWorkspaceAcceptedJoinRequests = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, true);
  const result = await reconcileAcceptedJoinRequestsForWorkspace(companyId, uid, companyRef, companyData);

  if (result.repairedCount > 0) {
    const updatedCompanySnap = await companyRef.get();
    const entitlements = billingEntitlementsForCompany(updatedCompanySnap.data() || companyData);
    const limits = planLimitsFromEntitlements(entitlements, companyData);
    const usage = await workspaceBillingUsage(companyId, updatedCompanySnap.data() || companyData);
    await saveWorkspaceBillingUsage(companyRef, usage, entitlements, limits, "accepted_join_request_sync");
  }

  return {
    ok: true,
    companyId,
    ...result,
    message: result.repairedCount > 0 ? "Team access repaired." : "Team access already up to date."
  };
});

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const stringValue = String(value).trim();
    if (stringValue) return stringValue;
  }
  return "";
}

function firstArrayValue(...values) {
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0) return value[0];
  }
  return undefined;
}

function acceptedArray(response) {
  const accepted = response?.data?.accepted;
  return Array.isArray(accepted) ? accepted : [];
}

function rejectedArray(response) {
  const rejected = response?.data?.rejected;
  return Array.isArray(rejected) ? rejected : [];
}

function errorsArray(response) {
  const errors = response?.data?.errors;
  return Array.isArray(errors) ? errors : [];
}

function firstAccepted(response) {
  const accepted = acceptedArray(response);
  return accepted.length > 0 ? accepted[0] : null;
}

function firstApiError(response) {
  const firstRejected = rejectedArray(response)[0];
  const firstError = errorsArray(response)[0];
  const err = firstRejected?.error || firstRejected || firstError || null;

  if (!err) return null;

  return {
    code: Number(err.code || firstRejected?.code || firstError?.code || 0),
    message: firstNonEmpty(
      err.message,
      firstRejected?.message,
      firstError?.message,
      typeof err === "string" ? err : "",
      JSON.stringify(err)
    )
  };
}

function isAlreadyRegistered(error) {
  return error?.code === -18019901 || String(error?.message || "").toLowerCase().includes("already registered");
}

function isCarrierCannotBeDetected(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === -18019903 || message.includes("carrier can not be detected") || message.includes("carrier cannot be detected");
}

function isNoTrackingInfoYet(error) {
  return error?.code === -18019909 || String(error?.message || "").toLowerCase().includes("no tracking info");
}

function isRealtimeNotAvailable(errorOrMessage) {
  const message = String(errorOrMessage?.message || errorOrMessage || "").toLowerCase();
  const code = Number(errorOrMessage?.code || 0);

  return code === -18019818 ||
    code === -18019912 ||
    code === -18019815 ||
    code === -18019816 ||
    message.includes("track_info") ||
    message.includes("real-time") ||
    message.includes("realtime") ||
    message.includes("not support");
}

function buildTrack17Body(trackingNumber, carrierCode = null, options = {}) {
  const item = { number: trackingNumber };

  if (carrierCode) {
    item.carrier = Number(carrierCode);
  } else if (options.autoDetection === true) {
    item.auto_detection = true;
  }

  if (options.lang) item.lang = String(options.lang);
  if (options.param) item.param = String(options.param);
  if (options.tag) item.tag = String(options.tag);
  if (options.remark) item.remark = String(options.remark);

  return [item];
}

function packageStatusFromCode(value) {
  const code = Number(value);
  if (code === 0) return "NotFound";
  if (code === 10) return "InTransit";
  if (code === 20) return "Delivered";
  if (code === 30) return "Exception";
  if (code === 40) return "Expired";
  if (code === 50) return "AvailableForPickup";
  return Number.isFinite(code) && code > 0 ? `Status ${code}` : "Registered";
}

function extractCarrierName(track, item, fallback = {}) {
  const provider = firstArrayValue(
    track?.tracking?.providers,
    track?.providers,
    item?.track_info?.tracking?.providers,
    item?.track?.tracking?.providers
  );

  return firstNonEmpty(
    provider?.provider?.name,
    provider?.provider_name,
    provider?.name,
    track?.shipping_info?.shipping_provider,
    track?.shipping_info?.courier_name,
    track?.shipping_info?.carrier_name,
    carrierNameFromCode(item?.carrier),
    carrierNameFromCode(track?.w1),
    carrierNameFromCode(track?.carrier),
    carrierNameFromCode(fallback.carrierCode),
    isAutoDetectCourier(fallback.carrier) ? "" : fallback.carrier
  );
}

function normalize17TrackPayload(raw, fallback = {}) {
  const item = Array.isArray(raw) ? raw[0] : raw || {};
  const track = item.track_info || item.track || item.info || item || {};

  const provider = firstArrayValue(track?.tracking?.providers, track?.providers);
  const providerEvents = Array.isArray(provider?.events) ? provider.events : [];
  const compactEvents = Array.isArray(track?.z1) ? track.z1 : [];

  const latestEvent =
    track?.latest_event ||
    track?.latestEvent ||
    providerEvents[0] ||
    track?.events?.[0] ||
    track?.z0 ||
    compactEvents[0] ||
    {};

  const latestStatus = track?.latest_status || track?.latestStatus || {};

  const rawStatus = firstNonEmpty(
    latestStatus?.status,
    latestStatus?.status_code,
    latestEvent?.stage,
    latestEvent?.sub_status,
    track?.package_state,
    track?.package_status,
    track?.status,
    item?.status,
    track?.e ? packageStatusFromCode(track.e) : "",
    fallback.status,
    "Registered"
  );

  const statusText = firstNonEmpty(
    latestStatus?.status_text,
    latestStatus?.sub_status_text,
    latestStatus?.sub_status_descr,
    latestStatus?.status,
    latestEvent?.stage,
    latestEvent?.sub_status,
    track?.status_text,
    rawStatus,
    fallback.statusText,
    "Registered"
  );

  const carrierCode = firstNonEmpty(item?.carrier, track?.w1, track?.carrier, fallback.carrierCode);
  const carrier = extractCarrierName(track, item, { ...fallback, carrierCode });

  const checkpoint = firstNonEmpty(
    latestEvent?.description,
    latestEvent?.event,
    latestEvent?.text,
    latestEvent?.content,
    latestEvent?.z,
    latestEvent?.stage
  );

  const trackingNumber = cleanTrackingNumber(
    item?.number || item?.tracking_number || track?.tracking_number || fallback.trackingNumber
  );

  const result = {
    ok: true,
    provider: "17TRACK",
    trackingNumber,
    status: String(rawStatus || "Registered"),
    statusText: String(statusText || rawStatus || "Registered"),
    subStatus: firstNonEmpty(latestStatus?.sub_status, latestStatus?.sub_status_text, latestStatus?.sub_status_descr, latestEvent?.sub_status),
    carrier: String(carrier || ""),
    carrierCode: String(carrierCode || ""),
    checkpoint: String(checkpoint || ""),
    location: firstNonEmpty(latestEvent?.location, latestEvent?.place, latestEvent?.c, latestEvent?.d),
    eta: firstNonEmpty(
      track?.time_metrics?.estimated_delivery_date?.from,
      track?.time_metrics?.estimated_delivery_date?.to,
      track?.estimated_delivery_date
    ),
    lastUpdate: firstNonEmpty(latestEvent?.time_iso, latestEvent?.time_utc, latestEvent?.time_raw, latestEvent?.time, latestEvent?.a),
    lastCheckedAt: admin.firestore.FieldValue.serverTimestamp(),
    trackingUrl: trackingNumber ? `https://www.17track.net/en/track-details?nums=${encodeURIComponent(trackingNumber)}` : "",
    trackingSupportStatus: "active",
    supportMessage: "",
    supportMessageKey: "",
    error: ""
  };

  if (!hasUsefulTrackingData(result)) {
    result.trackingSupportStatus = "waiting";
    result.supportMessageKey = "registered_waiting";
  }

  return result;
}

function hasUsefulTrackingData(result) {
  return Boolean(
    firstNonEmpty(result?.checkpoint, result?.lastUpdate, result?.eta) ||
    ["delivered", "intransit", "in transit", "exception", "availableforpickup", "available for pickup", "out for delivery"].some((word) =>
      String(result?.status || result?.statusText || "").toLowerCase().includes(word)
    )
  );
}

function isDeliveredResult(result) {
  const text = `${result?.status || ""} ${result?.statusText || ""} ${result?.checkpoint || ""}`.toLowerCase();
  return text.includes("delivered") || text.includes("teslim edildi");
}

function limitedSupportForCarrier(carrierCode, language) {
  const code = Number(carrierCode);
  if (code === 11031) {
    return {
      trackingSupportStatus: "limited",
      supportMessageKey: "royal_mail_limited",
      supportMessage: localizedMessage("royal_mail_limited", language)
    };
  }
  if (code === 100003) {
    return {
      trackingSupportStatus: "limited",
      supportMessageKey: "fedex_limited",
      supportMessage: localizedMessage("fedex_limited", language)
    };
  }
  return {};
}

async function call17Track(url, token, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "17token": token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`17TRACK returned non-JSON response: ${text.slice(0, 500)}`);
  }

  if (!response.ok) {
    throw new Error(`17TRACK HTTP ${response.status}: ${JSON.stringify(json).slice(0, 800)}`);
  }

  return json;
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function firstObject(...values) {
  for (const value of values) {
    if (!value) continue;
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === "object") return value[0];
    if (typeof value === "object" && !Array.isArray(value)) return value;
  }
  return {};
}

async function callRoyalMailEvents(trackingNumber, clientId, clientSecret) {
  const url = `${ROYALMAIL_BASE_URL}/${encodeURIComponent(trackingNumber)}/events`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "X-Accept-RMG-Terms": "yes",
      "X-IBM-Client-Id": clientId,
      "X-IBM-Client-Secret": clientSecret
    }
  });

  const text = await response.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`Royal Mail returned non-JSON response: ${text.slice(0, 500)}`);
  }

  if (!response.ok) {
    const message = firstNonEmpty(
      json?.message,
      json?.Message,
      json?.error,
      json?.Error,
      json?.errors?.[0]?.message,
      json?.Errors?.[0]?.Message,
      JSON.stringify(json).slice(0, 700)
    );
    throw new Error(`Royal Mail HTTP ${response.status}: ${message}`);
  }

  return json;
}

function normalizeRoyalMailPayload(raw, fallback = {}) {
  const mailPiecesRoot = firstObject(raw?.mailPieces, raw?.MailPieces, raw?.mailpieces, raw);
  const piece = firstObject(
    mailPiecesRoot?.mailPiece,
    mailPiecesRoot?.MailPiece,
    mailPiecesRoot?.mailPieces,
    mailPiecesRoot?.MailPieces,
    raw?.mailPiece,
    raw?.MailPiece,
    raw
  );

  const summary = firstObject(piece?.summary, piece?.Summary, raw?.summary, raw?.Summary, piece);
  const eventsContainer = firstObject(piece?.events, piece?.Events, raw?.events, raw?.Events);
  const events = asArray(
    eventsContainer?.event ||
    eventsContainer?.Event ||
    piece?.event ||
    piece?.Event ||
    raw?.event ||
    raw?.Event
  );
  const latestEvent = firstObject(events[0], summary);

  const trackingNumber = cleanTrackingNumber(firstNonEmpty(
    summary?.oneDBarcode,
    summary?.OneDBarcode,
    summary?.mailPieceId,
    summary?.MailPieceId,
    piece?.mailPieceId,
    piece?.MailPieceId,
    raw?.mailPieceId,
    raw?.MailPieceId,
    fallback.trackingNumber
  ));

  const carrier = firstNonEmpty(
    piece?.carrierFullName,
    piece?.CarrierFullName,
    summary?.internationalPostalProvider?.title,
    summary?.InternationalPostalProvider?.Title,
    "Royal Mail"
  );

  const statusCategory = firstNonEmpty(
    summary?.statusCategory,
    summary?.StatusCategory,
    summary?.statusDescription,
    summary?.StatusDescription,
    latestEvent?.eventName,
    latestEvent?.EventName,
    fallback.status,
    "Registered"
  );

  const statusText = firstNonEmpty(
    summary?.statusDescription,
    summary?.StatusDescription,
    summary?.lastEventName,
    summary?.LastEventName,
    latestEvent?.eventName,
    latestEvent?.EventName,
    statusCategory
  );

  const location = firstNonEmpty(
    summary?.lastEventLocationName,
    summary?.LastEventLocationName,
    latestEvent?.locationName,
    latestEvent?.LocationName,
    latestEvent?.location,
    latestEvent?.Location
  );

  const checkpoint = firstNonEmpty(
    summary?.summaryLine,
    summary?.SummaryLine,
    [statusText, location].filter(Boolean).join(" · "),
    statusText
  );

  const lastUpdate = firstNonEmpty(
    summary?.lastEventDateTime,
    summary?.LastEventDateTime,
    latestEvent?.eventDateTime,
    latestEvent?.EventDateTime,
    latestEvent?.dateTime,
    latestEvent?.DateTime
  );

  const eta = firstNonEmpty(
    summary?.estimatedDeliveryDate,
    summary?.EstimatedDeliveryDate,
    summary?.estimatedDeliveryWindow?.end,
    summary?.EstimatedDeliveryWindow?.End
  );

  const result = {
    ok: true,
    provider: "Royal Mail",
    trackingNumber,
    status: String(statusCategory || "Registered"),
    statusText: String(statusText || statusCategory || "Registered"),
    subStatus: "",
    carrier: String(carrier || "Royal Mail"),
    carrierCode: "11031",
    checkpoint: String(checkpoint || ""),
    location: String(location || ""),
    eta: String(eta || ""),
    lastUpdate: String(lastUpdate || ""),
    lastCheckedAt: admin.firestore.FieldValue.serverTimestamp(),
    trackingUrl: trackingNumber ? `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(trackingNumber)}` : "https://www.royalmail.com/track-your-item",
    trackingSupportStatus: "active",
    supportMessage: "",
    supportMessageKey: "",
    error: ""
  };

  if (!hasUsefulTrackingData(result)) {
    result.trackingSupportStatus = "waiting";
    result.supportMessageKey = "royal_mail_waiting";
  }

  return result;
}

async function tryRoyalMailOfficialTracking(trackingNumber, language = "English") {
  const clientId = ROYALMAIL_CLIENT_ID.value();
  const clientSecret = ROYALMAIL_CLIENT_SECRET.value();

  const base = {
    ok: false,
    provider: "Royal Mail",
    trackingNumber,
    carrier: "Royal Mail",
    carrierCode: "11031",
    status: "Waiting",
    statusText: "Waiting",
    checkpoint: "",
    location: "",
    eta: "",
    lastUpdate: "",
    lastCheckedAt: admin.firestore.FieldValue.serverTimestamp(),
    trackingUrl: trackingNumber ? `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(trackingNumber)}` : "https://www.royalmail.com/track-your-item",
    error: ""
  };

  if (!secretLooksConfigured(clientId) || !secretLooksConfigured(clientSecret)) {
    return {
      ...base,
      trackingSupportStatus: "credentials_missing",
      supportMessageKey: "royal_mail_credentials_missing",
      supportMessage: localizedMessage("royal_mail_credentials_missing", language)
    };
  }

  try {
    const response = await callRoyalMailEvents(trackingNumber, clientId, clientSecret);
    const normalized = normalizeRoyalMailPayload(response, { trackingNumber });
    if (!normalized.supportMessage && normalized.supportMessageKey) {
      normalized.supportMessage = localizedMessage(normalized.supportMessageKey, language);
    }
    return normalized;
  } catch (error) {
    console.error("Royal Mail official tracking warning:", error?.message || error);
    return {
      ...base,
      trackingSupportStatus: "limited",
      supportMessageKey: "royal_mail_error",
      supportMessage: localizedMessage("royal_mail_error", language),
      error: error?.message || String(error)
    };
  }
}

async function tryPushUpdate(token, trackingNumber, carrierCode) {
  try {
    await call17Track(TRACK17_PUSH_URL, token, buildTrack17Body(trackingNumber, carrierCode));
  } catch (error) {
    console.error("17TRACK push warning:", error?.message || error);
  }
}

async function tryChangeCarrier(token, trackingNumber, carrierCode) {
  if (!carrierCode) return { changed: false, error: null };

  try {
    const response = await call17Track(TRACK17_CHANGE_CARRIER_URL, token, [
      {
        number: trackingNumber,
        carrier_new: Number(carrierCode)
      }
    ]);

    const apiError = firstApiError(response);
    if (apiError && apiError.code !== -18019803 && apiError.code !== -18019809) {
      return { changed: false, error: apiError };
    }

    return { changed: true, error: null };
  } catch (error) {
    console.error("17TRACK change carrier warning:", error?.message || error);
    return { changed: false, error };
  }
}

async function getTrackingDetails(token, trackingNumber, carrierCode, fallback, language = "English") {
  const body = buildTrack17Body(trackingNumber, carrierCode);

  try {
    const infoResponse = await call17Track(TRACK17_GET_INFO_URL, token, body);
    const accepted = acceptedArray(infoResponse);
    const apiError = firstApiError(infoResponse);

    if (accepted.length > 0) {
      const normalized = normalize17TrackPayload(accepted, fallback);
      if (hasUsefulTrackingData(normalized)) {
        return normalized;
      }

      return {
        ...normalized,
        status: normalized.status || "Registered",
        statusText: normalized.statusText || "Registered - waiting for 17TRACK update",
        trackingSupportStatus: "waiting",
        supportMessageKey: "registered_waiting",
        supportMessage: localizedMessage("registered_waiting", language)
      };
    }

    if (apiError && !isNoTrackingInfoYet(apiError)) {
      return {
        ...normalize17TrackPayload([], fallback),
        ...limitedSupportForCarrier(carrierCode, language),
        error: apiError.message
      };
    }
  } catch (error) {
    console.error("17TRACK gettrackinfo warning:", error?.message || error);
  }

  await tryPushUpdate(token, trackingNumber, carrierCode);

  if (carrierCode && !REALTIME_UNSUPPORTED_CODES.has(Number(carrierCode))) {
    try {
      const realtimeResponse = await call17Track(TRACK17_REALTIME_URL, token, body);
      const accepted = acceptedArray(realtimeResponse);
      const apiError = firstApiError(realtimeResponse);

      if (accepted.length > 0) {
        const normalized = normalize17TrackPayload(accepted, fallback);
        if (hasUsefulTrackingData(normalized)) {
          return normalized;
        }
      }

      if (apiError && !isRealtimeNotAvailable(apiError) && !isNoTrackingInfoYet(apiError)) {
        return {
          ...normalize17TrackPayload([], fallback),
          ...limitedSupportForCarrier(carrierCode, language),
          error: apiError.message
        };
      }
    } catch (error) {
      if (!isRealtimeNotAvailable(error)) {
        console.error("17TRACK realtime warning:", error?.message || error);
      }
    }
  }

  return {
    ...normalize17TrackPayload([], fallback),
    status: "Registered",
    statusText: "Registered - waiting for 17TRACK update",
    trackingSupportStatus: firstNonEmpty(limitedSupportForCarrier(carrierCode, language).trackingSupportStatus, "waiting"),
    supportMessageKey: firstNonEmpty(limitedSupportForCarrier(carrierCode, language).supportMessageKey, "registered_waiting"),
    supportMessage: firstNonEmpty(limitedSupportForCarrier(carrierCode, language).supportMessage, localizedMessage("registered_waiting", language)),
    error: ""
  };
}

function buildTrackingCustomFields(result) {
  const customFields = {};
  const keys = [
    "trackingNumber", "status", "statusText", "subStatus", "carrier", "carrierCode",
    "checkpoint", "location", "eta", "lastUpdate", "trackingUrl", "provider", "error",
    "trackingSupportStatus", "supportMessage", "supportMessageKey", "lastCheckedAt"
  ];

  for (const key of keys) {
    const value = result?.[key];
    if (value !== undefined && value !== null) {
      customFields[`tracking::${key}`] = String(value);
    }
  }

  return customFields;
}

async function writeDeliveryNotification(companyId, orderId, result, language = "English") {
  const notificationId = `delivery_${orderId}`;
  const ref = notificationCollectionRef(companyId).doc(notificationId);
  const snap = await ref.get();

  if (snap.exists && snap.data()?.pushSent === true) {
    return;
  }

  const title = deliveryPushTitle(language);
  const message = deliveryPushMessage(result, language);
  const data = {
    companyId,
    orderId,
    type: "delivery",
    title,
    message,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    read: false,
    actioned: false,
    source: "scheduledTrackingRefresh",
    trackingNumber: result.trackingNumber || "",
    carrier: result.carrier || "",
    checkpoint: result.checkpoint || "",
    location: result.location || "",
    language
  };

  await ref.set(data, { merge: true });

  const pushResult = await sendPushNotificationToCompany(companyId, {
    ...data,
    notificationId,
    createdAt: new Date().toISOString()
  });

  await ref.set({
    pushSent: pushResult.sent > 0,
    pushResult,
    pushSentAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

async function refreshTrackingCore({ companyId, orderId, trackingNumber, courier, carrierCode, language = "English" }) {
  const token = TRACK17_TOKEN.value();
  const manualCarrier = isAutoDetectCourier(courier) ? "" : courier;
  const manualCarrierCode = carrierCode ? Number(carrierCode) : carrierCodeFromName(manualCarrier);
  const shouldUseRoyalMailOfficial = isRoyalMailCourier(manualCarrier, manualCarrierCode);

  function publicErrorResult(messageKey, messageOverride = "", extra = {}) {
    const message = messageOverride || localizedMessage(messageKey, language);

    return {
      ok: false,
      provider: "17TRACK",
      trackingNumber,
      carrier: manualCarrier,
      carrierCode: manualCarrierCode ? String(manualCarrierCode) : "",
      status: extra.status || "Error",
      statusText: extra.statusText || "Error",
      trackingSupportStatus: extra.trackingSupportStatus || "error",
      supportMessageKey: extra.supportMessageKey || "",
      supportMessage: extra.supportMessage || "",
      error: message,
      lastCheckedAt: admin.firestore.FieldValue.serverTimestamp(),
      trackingUrl: trackingNumber ? `https://www.17track.net/en/track-details?nums=${encodeURIComponent(trackingNumber)}` : "",
      ...extra
    };
  }

  if (!companyId || !orderId || !trackingNumber) {
    return publicErrorResult("missing_parameters");
  }

  if (shouldUseRoyalMailOfficial) {
    const royalMailResult = await tryRoyalMailOfficialTracking(trackingNumber, language);
    if (royalMailResult.ok && hasUsefulTrackingData(royalMailResult)) {
      return royalMailResult;
    }

    // If the official Royal Mail API is configured but only says "waiting", keep the clean
    // Royal Mail result instead of falling back to the noisier 17TRACK Royal Mail registration error.
    if (royalMailResult.trackingSupportStatus === "waiting") {
      return royalMailResult;
    }

    // If 17TRACK is not configured, show the Royal Mail setup/status message.
    if (!token || token.length < 10) {
      return royalMailResult;
    }
  }

  if (!token || token.length < 10) {
    return publicErrorResult("token_missing");
  }

  if (manualCarrier && !manualCarrierCode) {
    return publicErrorResult("courier_not_mapped", "", {
      trackingSupportStatus: "unsupported",
      supportMessageKey: "courier_not_mapped",
      supportMessage: localizedMessage("courier_not_mapped", language)
    });
  }

  const registerBody = buildTrack17Body(trackingNumber, manualCarrierCode, { autoDetection: !manualCarrierCode });
  const registerResponse = await call17Track(TRACK17_REGISTER_URL, token, registerBody);
  const registerAccepted = firstAccepted(registerResponse);
  const registerError = firstApiError(registerResponse);
  const alreadyRegistered = isAlreadyRegistered(registerError);

  if (!registerAccepted && registerError && !alreadyRegistered) {
    const cannotDetect = isCarrierCannotBeDetected(registerError);
    const temporarilyUnsupported = registerError.code === -18019911;

    if (cannotDetect) {
      return publicErrorResult("carrier_required_message", "", {
        status: "Carrier Required",
        statusText: "Carrier Required",
        trackingSupportStatus: "carrier_required",
        supportMessageKey: "carrier_required_message",
        supportMessage: localizedMessage("carrier_required_message", language),
        error: ""
      });
    }

    if (temporarilyUnsupported) {
      const limited = limitedSupportForCarrier(manualCarrierCode, language);
      return publicErrorResult(limited.supportMessageKey || "registered_waiting", "", {
        status: "Limited Support",
        statusText: "Limited Support",
        trackingSupportStatus: limited.trackingSupportStatus || "limited",
        supportMessageKey: limited.supportMessageKey || "registered_waiting",
        supportMessage: limited.supportMessage || localizedMessage("registered_waiting", language),
        error: registerError.message || ""
      });
    }

    return publicErrorResult("", registerError.message || "17TRACK error");
  }

  if (alreadyRegistered && manualCarrierCode) {
    await tryChangeCarrier(token, trackingNumber, manualCarrierCode);
  }

  const detectedCarrierCode = firstNonEmpty(registerAccepted?.carrier, manualCarrierCode);
  const detectedCarrierName = firstNonEmpty(manualCarrier, carrierNameFromCode(detectedCarrierCode));

  const details = await getTrackingDetails(token, trackingNumber, detectedCarrierCode ? Number(detectedCarrierCode) : null, {
    trackingNumber,
    carrier: detectedCarrierName,
    carrierCode: detectedCarrierCode,
    status: "Registered",
    statusText: "Registered"
  }, language);

  return {
    ok: true,
    provider: "17TRACK",
    trackingNumber,
    carrier: firstNonEmpty(details.carrier, detectedCarrierName),
    carrierCode: firstNonEmpty(details.carrierCode, detectedCarrierCode),
    status: details.status || "Registered",
    statusText: details.statusText || "Registered",
    subStatus: details.subStatus || "",
    checkpoint: details.checkpoint || "",
    location: details.location || "",
    eta: details.eta || "",
    lastUpdate: details.lastUpdate || "",
    trackingUrl: details.trackingUrl || `https://www.17track.net/en/track-details?nums=${encodeURIComponent(trackingNumber)}`,
    trackingSupportStatus: details.trackingSupportStatus || "active",
    language,
    supportMessage: details.supportMessage || "",
    supportMessageKey: details.supportMessageKey || "",
    error: details.error || "",
    lastCheckedAt: admin.firestore.FieldValue.serverTimestamp()
  };
}

exports.registerTracking = onCall({ secrets: [TRACK17_TOKEN, ROYALMAIL_CLIENT_ID, ROYALMAIL_CLIENT_SECRET], region: "europe-west2" }, async (request) => {
  const companyId = String(request.data?.companyId || "").trim();
  const orderId = String(request.data?.orderId || "").trim();
  const trackingNumber = cleanTrackingNumber(request.data?.trackingNumber);
  const courier = String(request.data?.courier || "").trim();
  const language = String(request.data?.language || "English").trim() || "English";
  const ref = providerDocRef(companyId || "missing_company", orderId || "missing_order");

  try {
    const startState = {
      provider: "17TRACK",
      trackingNumber,
      carrier: isAutoDetectCourier(courier) ? "" : courier,
      status: "Registering",
      statusText: "Registering",
      trackingSupportStatus: "waiting",
      language,
      supportMessageKey: "checking_support",
      supportMessage: localizedMessage("checking_support", language),
      lastCheckedAt: admin.firestore.FieldValue.serverTimestamp(),
      trackingUrl: trackingNumber ? `https://www.17track.net/en/track-details?nums=${encodeURIComponent(trackingNumber)}` : "",
      error: ""
    };

    if (companyId && orderId) {
      await ref.set(startState, { merge: true });
    }

    if (trackingNumber) {
      await lookupDocRef(trackingNumber).set({ companyId, orderId, trackingNumber }, { merge: true });
    }

    const result = await refreshTrackingCore({ companyId, orderId, trackingNumber, courier, language });

    const clientResult = {
      ...result,
      lastCheckedAt: new Date().toISOString()
    };

    if (companyId && orderId) {
      await ref.set(result, { merge: true });

      const orderTrackingUpdate = {
        customFields: buildTrackingCustomFields(clientResult)
      };

      if (isDeliveredResult(result)) {
        orderTrackingUpdate.isDelivered = true;
        orderTrackingUpdate.isDispatched = true;
      }

      await orderDocRef(orderId).set(orderTrackingUpdate, { merge: true });

      if (isDeliveredResult(result)) {
        await writeDeliveryNotification(companyId, orderId, result, language);
      }
    }

    return clientResult;
  } catch (error) {
    console.error("registerTracking error:", error);

    const result = {
      ok: false,
      provider: "17TRACK",
      trackingNumber,
      carrier: isAutoDetectCourier(courier) ? "" : courier,
      status: "Error",
      statusText: "Error",
      trackingSupportStatus: "error",
      supportMessage: "",
      supportMessageKey: "",
      error: error?.message || String(error) || "Unknown tracking error",
      lastCheckedAt: admin.firestore.FieldValue.serverTimestamp(),
      trackingUrl: trackingNumber ? `https://www.17track.net/en/track-details?nums=${encodeURIComponent(trackingNumber)}` : ""
    };

    const clientResult = {
      ...result,
      lastCheckedAt: new Date().toISOString()
    };

    if (companyId && orderId) {
      try {
        await ref.set(result, { merge: true });
        await orderDocRef(orderId).set({
          customFields: buildTrackingCustomFields(clientResult)
        }, { merge: true });
      } catch (writeError) {
        console.error("registerTracking Firestore error write failed:", writeError);
      }
    }

    return clientResult;
  }
});

exports.scheduledTrackingRefresh = onSchedule({
  schedule: "every 60 minutes",
  timeZone: "Europe/London",
  region: "europe-west2",
  secrets: [TRACK17_TOKEN, ROYALMAIL_CLIENT_ID, ROYALMAIL_CLIENT_SECRET]
}, async () => {
  const snap = await admin.firestore()
    .collectionGroup("trackingResults")
    .where("provider", "==", "17TRACK")
    .limit(80)
    .get();

  let checked = 0;
  let updated = 0;
  let delivered = 0;

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const orderId = doc.id;
    const companyId = doc.ref.parent.parent?.id || "";
    const trackingNumber = cleanTrackingNumber(data.trackingNumber);
    const statusText = `${data.status || ""} ${data.statusText || ""}`.toLowerCase();

    if (!companyId || !orderId || !trackingNumber) continue;
    if (statusText.includes("delivered")) continue;

    checked += 1;

    try {
      const result = await refreshTrackingCore({
        companyId,
        orderId,
        trackingNumber,
        courier: data.carrier || "",
        carrierCode: data.carrierCode || null,
        language: data.language || "English"
      });

      await doc.ref.set(result, { merge: true });
      await orderDocRef(orderId).set({
        customFields: buildTrackingCustomFields({
          ...result,
          lastCheckedAt: new Date().toISOString()
        })
      }, { merge: true });
      updated += 1;

      if (isDeliveredResult(result)) {
        await orderDocRef(orderId).set({
          isDelivered: true,
          isDispatched: true,
          customFields: buildTrackingCustomFields({
            ...result,
            lastCheckedAt: new Date().toISOString()
          })
        }, { merge: true });
        await writeDeliveryNotification(companyId, orderId, result, data.language || "English");
        await doc.ref.set({ deliveredNotificationSent: true }, { merge: true });
        delivered += 1;
      }
    } catch (error) {
      console.error("scheduledTrackingRefresh item failed:", orderId, error?.message || error);
      await doc.ref.set({
        trackingSupportStatus: "error",
        error: error?.message || String(error),
        lastCheckedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
  }

  console.log("scheduledTrackingRefresh complete", { checked, updated, delivered });
});

function parseSwiftDate(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;

  if (typeof value === "number") {
    // Swift JSONEncoder Date default is seconds since 2001-01-01.
    const unixSeconds = value > 2000000000 ? value / 1000 : value + 978307200;
    return new Date(unixSeconds * 1000);
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;

    const numeric = Number(value);
    if (Number.isFinite(numeric)) return parseSwiftDate(numeric);
  }

  return null;
}

exports.scheduledReminderCheck = onSchedule({
  schedule: "every 15 minutes",
  timeZone: "Europe/London",
  region: "europe-west2"
}, async () => {
  const now = new Date();
  const snap = await admin.firestore()
    .collection("siparisler")
    .where("companyId", "==", "test_studio_123")
    .limit(200)
    .get();

  let dueCount = 0;
  const batch = admin.firestore().batch();
  const notificationsToPush = [];

  for (const doc of snap.docs) {
    const order = doc.data() || {};
    const rawJSON = order.customFields?.__scheduleAlertItemsV1;
    if (!rawJSON) continue;

    let items = [];
    try {
      items = JSON.parse(rawJSON);
    } catch (error) {
      console.error("scheduledReminderCheck JSON parse failed:", doc.id, error?.message || error);
      continue;
    }

    let changed = false;
    const language = order.language || order.customFields?.language || order.customFields?.selectedLanguage || "English";

    for (const item of items) {
      const dueAt = parseSwiftDate(item.dueAt);
      if (!dueAt) continue;

      const isPending = String(item.status || "Pending") !== "Done";
      const shouldNotify = item.notify !== false;
      const alreadySent = item.notificationSent === true;

      if (isPending && shouldNotify && !alreadySent && dueAt <= now) {
        const companyId = order.companyId || "test_studio_123";
        const notificationId = `schedule_${doc.id}_${item.id}`;
        const notificationRef = notificationCollectionRef(companyId).doc(notificationId);
        const fallbackTitle = pushText("reminderTitle", language);
        const title = item.title || fallbackTitle;
        const message = order.customerName ? `${order.customerName}: ${title}` : title;

        const data = {
          companyId,
          orderId: doc.id,
          type: "schedule",
          title,
          message,
          note: item.note || "",
          priority: item.priority || "Normal",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          dueAt,
          read: false,
          actioned: false,
          source: "scheduledReminderCheck",
          language
        };

        batch.set(notificationRef, data, { merge: true });
        notificationsToPush.push({
          companyId,
          notificationRef,
          notificationId,
          data: { ...data, createdAt: now.toISOString(), dueAt: dueAt.toISOString() }
        });

        item.notificationSent = true;
        changed = true;
        dueCount += 1;
      }
    }

    if (changed) {
      const customFields = {
        ...(order.customFields || {}),
        __scheduleAlertItemsV1: JSON.stringify(items)
      };
      batch.set(doc.ref, { customFields }, { merge: true });
    }
  }

  if (dueCount > 0) {
    await batch.commit();
  }

  for (const pending of notificationsToPush) {
    try {
      const pushResult = await sendPushNotificationToCompany(pending.companyId, {
        ...pending.data,
        notificationId: pending.notificationId
      });
      await pending.notificationRef.set({
        pushSent: pushResult.sent > 0,
        pushResult,
        pushSentAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.error("scheduledReminderCheck push failed:", pending.notificationId, error?.message || error);
      await pending.notificationRef.set({
        pushSent: false,
        pushError: error?.message || String(error),
        pushTriedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
  }

  console.log("scheduledReminderCheck complete", { dueCount, pushCount: notificationsToPush.length });
});


function cleanWooText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function wooNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function wooDate(value, fallback = new Date()) {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function wooMetaValue(order, keys = []) {
  const meta = Array.isArray(order?.meta_data) ? order.meta_data : [];
  for (const key of keys) {
    const found = meta.find((item) => cleanWooText(item?.key).toLowerCase() === cleanWooText(key).toLowerCase());
    const value = cleanWooText(found?.value);
    if (value) return value;
  }
  return "";
}

function wooSafeDocPart(value) {
  return cleanWooText(value).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "workspace";
}

function wooLineItems(order) {
  return Array.isArray(order?.line_items) ? order.line_items : [];
}

function wooLineItemsSummary(order) {
  return wooLineItems(order)
    .map((item) => {
      const quantity = item?.quantity ? ` x${item.quantity}` : "";
      return `${cleanWooText(item?.name) || "Product"}${quantity}`;
    })
    .filter(Boolean)
    .join(", ");
}

function wooBillingFullName(order) {
  const billing = order?.billing || {};
  const name = [billing.first_name, billing.last_name].map(cleanWooText).filter(Boolean).join(" ");
  return name || cleanWooText(billing.company) || cleanWooText(order?.customer_name) || "WooCommerce Customer";
}

function wooPhone(order) {
  return cleanWooText(order?.billing?.phone || order?.shipping?.phone || wooMetaValue(order, ["phone", "telephone", "whatsapp", "WhatsApp"]));
}

function wooCompanyId(req, order) {
  return cleanWooText(
    req.query?.companyId ||
    req.query?.company_id ||
    req.headers?.["x-studioflow-company-id"] ||
    wooMetaValue(order, ["companyId", "company_id", "studioflow_company_id", "_studioflow_company_id"])
  );
}

function wooOrderDocId(companyId, wooOrderId) {
  return `woo_${wooSafeDocPart(companyId)}_${wooSafeDocPart(wooOrderId)}`;
}

function mapWooCommerceOrderToSiparis(order, companyId, isNew = true) {
  const now = new Date();
  const wooId = cleanWooText(order?.id || order?.number || crypto.randomUUID());
  const orderNumber = cleanWooText(order?.number || order?.id || wooId);
  const status = cleanWooText(order?.status || "new");
  const total = wooNumber(order?.total, 0);
  const createdAt = wooDate(order?.date_paid || order?.date_created || order?.date_created_gmt, now);
  const deliveryTime = wooNumber(wooMetaValue(order, ["deliveryTime", "delivery_days", "studioflow_delivery_days"]), 45);
  const lineSummary = wooLineItemsSummary(order);
  const firstItem = wooLineItems(order)[0] || {};
  const designName = cleanWooText(wooMetaValue(order, ["designName", "design_name", "Design Name"]) || lineSummary || firstItem?.name || `WooCommerce #${orderNumber}`);
  const watchRef = cleanWooText(wooMetaValue(order, ["watchRef", "watch_ref", "Watch Ref", "watch model"]) || firstItem?.sku || "");
  const paymentMethod = cleanWooText(order?.payment_method_title || order?.payment_method || "WooCommerce");
  const customerNote = cleanWooText(order?.customer_note || "");
  const email = cleanWooText(order?.billing?.email || order?.shipping?.email || "");
  const phone = wooPhone(order);

  const customFields = {
    Source: "WooCommerce",
    "WooCommerce Order ID": wooId,
    "WooCommerce Order Number": orderNumber,
    "WooCommerce Status": status,
    "WooCommerce Payment Method": paymentMethod,
    "WooCommerce Currency": cleanWooText(order?.currency || ""),
    "WooCommerce Total": cleanWooText(order?.total || ""),
    "WooCommerce Created At": cleanWooText(order?.date_created || order?.date_created_gmt || ""),
    "WooCommerce Products": lineSummary
  };

  const mapped = {
    companyId,
    paymentMethod,
    customerName: wooBillingFullName(order),
    paymentDate: createdAt,
    paidAmount: total,
    remainingAmount: 0,
    watchPurchasePrice: 0,
    watchRef,
    deliveryTime,
    designName,
    designLink: cleanWooText(order?.permalink || order?.url || ""),
    communication: ["WooCommerce"],
    emailAddress: email,
    instagramUsername: "",
    whatsappNumber: phone,
    notes: customerNote,
    designStatus: "Not Yet",
    status: "Not Yet",
    isDispatched: false,
    trackingNumber: "",
    courier: "Auto Detect",
    isDelivered: false,
    paymentFee: 0,
    deliveryCost: wooNumber(order?.shipping_total, 0),
    taxType: "",
    extraStatuses: {},
    taxRate: 0,
    invBool1: false,
    invBool2: false,
    invBool3: false,
    invBool4: false,
    invNotes: "",
    taxAmount: wooNumber(order?.total_tax, 0),
    priority: "Normal",
    risk: "None",
    riskReason: "-",
    customFields,
    customToggles: {},
    clientFiles: [],
    todoItems: [],
    workSessions: [],
    assignedToUid: "",
    assignedToEmail: ""
  };

  if (isNew) {
    mapped.historyLog = [{
      id: crypto.randomUUID(),
      createdAt: now,
      title: "Order created",
      oldValue: "WooCommerce",
      newValue: `#${orderNumber}`
    }];
  }

  return mapped;
}

// Constant-time string comparison to avoid timing side channels on secret checks.
function nvTimingSafeEqual(a, b) {
  const ba = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function woocommerceDeliveryUrl(companyId, token) {
  return "https://europe-west2-eggcraft-studio.cloudfunctions.net/woocommerceOrderWebhook"
    + `?companyId=${encodeURIComponent(companyId)}&token=${encodeURIComponent(token)}`;
}

// Owner-only: returns this workspace's WooCommerce webhook token + full Delivery URL,
// minting a per-workspace token on first use. The token is what the webhook checks, so each
// workspace gets an isolated, unguessable credential shown in the app's integration screen.
exports.getWooCommerceWebhookToken = onCall({ region: "europe-west2" }, async (request) => {
  const { companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, true);
  let token = String(companyData.woocommerceWebhookToken || "").trim();
  if (!token) {
    token = crypto.randomBytes(24).toString("hex");
    await companyRef.set({
      woocommerceWebhookToken: token,
      woocommerceWebhookTokenCreatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }
  return { ok: true, companyId, token, deliveryUrl: woocommerceDeliveryUrl(companyId, token) };
});

exports.woocommerceOrderWebhook = onRequest({ region: "europe-west2" }, async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(200).json({
        ok: true,
        message: "WooCommerce webhook endpoint is alive. Use POST from WooCommerce.",
        requiredQuery: "companyId"
      });
      return;
    }

    const order = req.body || {};
    const companyId = wooCompanyId(req, order);
    if (!companyId) {
      res.status(400).json({
        ok: false,
        error: "Missing companyId. Add ?companyId=YOUR_COMPANY_ID to the webhook Delivery URL."
      });
      return;
    }

    // Authentication. Primary: a per-workspace token (woocommerceWebhookToken on the company
    // doc, shown in the app's WooCommerce integration screen). Fallback (transition):
    // a global WOOCOMMERCE_WEBHOOK_SECRET via token or WooCommerce HMAC signature. Each
    // workspace's token is isolated, so knowing one workspace's URL cannot forge orders into
    // another. Backward compatible: if neither a workspace token nor a global secret exists,
    // the request is allowed with a warning.
    const providedToken = String(req.query?.token || req.headers["x-studioflow-token"] || "");
    const companyAuthRef = admin.firestore().collection("companies").doc(companyId);
    const companyAuthSnap = await companyAuthRef.get();
    if (!companyAuthSnap.exists) {
      res.status(404).json({ ok: false, error: "unknown_company" });
      return;
    }
    const workspaceToken = String(companyAuthSnap.data()?.woocommerceWebhookToken || "").trim();
    const globalSecret = String(process.env.WOOCOMMERCE_WEBHOOK_SECRET || "").trim();

    let authed = false;
    if (workspaceToken && nvTimingSafeEqual(providedToken, workspaceToken)) {
      authed = true;
    }
    if (!authed && globalSecret) {
      if (nvTimingSafeEqual(providedToken, globalSecret)) {
        authed = true;
      } else {
        const signature = String(req.headers["x-wc-webhook-signature"] || "");
        if (signature) {
          const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
          const expected = crypto.createHmac("sha256", globalSecret).update(rawBody).digest("base64");
          authed = nvTimingSafeEqual(signature, expected);
        }
      }
    }
    if (!authed) {
      if (!workspaceToken && !globalSecret) {
        console.warn("woocommerceOrderWebhook: no token configured for workspace — request not authenticated.");
      } else {
        console.warn("woocommerceOrderWebhook: rejected request with invalid token/signature.");
        res.status(401).json({ ok: false, error: "unauthorized" });
        return;
      }
    }

    const wooOrderId = cleanWooText(order?.id || order?.number);
    if (!wooOrderId) {
      // Acknowledge non-order payloads (e.g. WooCommerce's save-time test ping) with 200 so
      // WooCommerce does not count them as failed deliveries and auto-disable the webhook.
      res.status(200).json({ ok: true, ignored: "no_order_id" });
      return;
    }

    const docId = wooOrderDocId(companyId, wooOrderId);
    const ref = orderDocRef(docId);
    const existing = await ref.get();
    const mappedOrder = mapWooCommerceOrderToSiparis(order, companyId, !existing.exists);
    await ref.set(mappedOrder, { merge: true });

    await sendPushNotificationToCompany(companyId, {
      title: "New WooCommerce order",
      body: `${mappedOrder.customerName}: ${mappedOrder.designName}`,
      orderId: docId,
      type: "woocommerce_order"
    });

    res.status(200).json({
      ok: true,
      created: !existing.exists,
      orderId: docId,
      companyId
    });
  } catch (error) {
    console.error("woocommerceOrderWebhook error:", error);
    res.status(500).json({ ok: false, error: error.message || String(error) });
  }
});


exports.track17Webhook = onRequest({ region: "europe-west2" }, async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(200).json({ ok: true, message: "Webhook endpoint is alive. Use POST for updates." });
      return;
    }

    // Authenticate with a shared token when configured. Backward compatible: if
    // TRACK17_WEBHOOK_TOKEN is unset the request is allowed (with a warning). Once set,
    // add ?token=<value> to the 17TRACK webhook URL; requests without it are rejected.
    const expectedToken = String(process.env.TRACK17_WEBHOOK_TOKEN || "").trim();
    if (expectedToken) {
      const provided = String(req.query?.token || req.headers["x-studioflow-token"] || "");
      if (!nvTimingSafeEqual(provided, expectedToken)) {
        console.warn("track17Webhook: rejected request with invalid token.");
        res.status(401).json({ ok: false, error: "invalid_token" });
        return;
      }
    } else {
      console.warn("track17Webhook: TRACK17_WEBHOOK_TOKEN not set — request not authenticated.");
    }

    const payload = req.body || {};
    const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [payload];

    let writeCount = 0;
    const deliveredToNotify = [];
    const batch = admin.firestore().batch();

    for (const item of items) {
      if (!item) continue;

      const eventData = item?.data || item;
      const trackingNumber = cleanTrackingNumber(
        eventData?.number ||
        eventData?.tracking_number ||
        eventData?.track_info?.tracking_number ||
        eventData?.track_info?.number ||
        eventData?.track?.number
      );

      if (!trackingNumber) continue;

      const lookupSnap = await lookupDocRef(trackingNumber).get();
      if (!lookupSnap.exists) continue;

      const { companyId, orderId } = lookupSnap.data();
      if (!companyId || !orderId) continue;

      const normalized = normalize17TrackPayload(eventData, {
        trackingNumber,
        carrierCode: eventData?.carrier
      });

      batch.set(providerDocRef(companyId, orderId), normalized, { merge: true });

      if (isDeliveredResult(normalized)) {
        batch.set(orderDocRef(orderId), {
          isDelivered: true,
          isDispatched: true,
          customFields: buildTrackingCustomFields(normalized)
        }, { merge: true });
        deliveredToNotify.push({ companyId, orderId, result: normalized, language: normalized.language || "English" });
      }

      writeCount += 1;
    }

    if (writeCount > 0) {
      await batch.commit();
    }

    for (const item of deliveredToNotify) {
      await writeDeliveryNotification(item.companyId, item.orderId, item.result, item.language);
    }

    res.status(200).json({
      ok: true,
      received: items.length,
      updated: writeCount
    });
  } catch (error) {
    console.error("track17Webhook error:", error);
    res.status(200).json({
      ok: false,
      error: error.message || String(error)
    });
  }
});


// MARK: - Workspace Messages

function messageThreadsRef(companyId) {
  return admin.firestore().collection("companies").doc(companyId).collection("messageThreads");
}

function cleanMessageText(value = "", maxLength = 5000) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().slice(0, maxLength);
}

function messageMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.getTime() : 0;
}

function messageWorkspaceMemberEntries(companyData = {}) {
  const out = [];
  const seen = new Set();
  const add = (uid = "", email = "", name = "", photoURL = "") => {
    const cleanUid = String(uid || "").trim();
    const cleanEmail = String(email || "").trim().toLowerCase();
    const key = cleanUid || cleanEmail;
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({
      uid: cleanUid,
      email: cleanEmail,
      name: cleanSupportText(name || email || uid || "Team member", 120),
      photoURL: cleanSupportPhotoURL(photoURL || "")
    });
  };

  add(companyData.ownerUid || companyData.companyId || "", companyData.ownerEmail || companyData.email || "", companyData.ownerDisplayName || companyData.ownerName || "Owner", companyData.ownerPhotoURL || "");

  const members = companyMembersMap(companyData);
  for (const [uid, entry] of Object.entries(members)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      add(uid, "", "", "");
      continue;
    }
    add(
      uid,
      entry.email || entry.userEmail || "",
      entry.displayName || entry.name || entry.userName || "",
      entry.photoURL || entry.accountPhotoURL || entry.avatarURL || entry.profilePhotoURL || ""
    );
  }

  const memberRoles = companyMemberRolesMap(companyData);
  for (const uid of Object.keys(memberRoles)) add(uid, "", "", "");
  return out;
}

function messageThreadFromDoc(doc, currentUid = "") {
  const data = doc.data() || {};
  const readBy = data.readBy && typeof data.readBy === "object" && !Array.isArray(data.readBy) ? data.readBy : {};
  const lastMessageAt = messageMillis(data.lastMessageAt);
  const currentReadAt = messageMillis(readBy[currentUid]);
  const lastMessageByUid = String(data.lastMessageByUid || "");
  return {
    id: doc.id,
    companyId: String(data.companyId || ""),
    type: String(data.type || "team"),
    title: String(data.title || ""),
    memberUids: Array.isArray(data.memberUids) ? data.memberUids.map(String) : [],
    memberEmails: Array.isArray(data.memberEmails) ? data.memberEmails.map(String) : [],
    lastMessageText: String(data.lastMessageText || ""),
    lastMessageAtMillis: lastMessageAt,
    lastMessageByUid,
    lastMessageByName: String(data.lastMessageByName || ""),
    lastMessageByPhotoURL: String(data.lastMessageByPhotoURL || ""),
    readByMillis: Object.fromEntries(Object.entries(readBy).map(([uid, ts]) => [uid, messageMillis(ts)])),
    mutedUntilByMillis: Object.fromEntries(Object.entries(data.mutedUntilBy && typeof data.mutedUntilBy === "object" && !Array.isArray(data.mutedUntilBy) ? data.mutedUntilBy : {}).map(([uid, ts]) => [uid, messageMillis(ts)])),
    pinnedMessageIds: Array.isArray(data.pinnedMessageIds) ? data.pinnedMessageIds.map(String) : [],
    isUnread: Boolean(lastMessageAt > 0 && lastMessageAt > currentReadAt && lastMessageByUid !== currentUid)
  };
}

function messageFromDoc(doc, threadId = "") {
  const data = doc.data() || {};
  return {
    id: doc.id,
    threadId: String(data.threadId || threadId || ""),
    text: String(data.text || ""),
    senderUid: String(data.senderUid || ""),
    senderEmail: String(data.senderEmail || ""),
    senderName: String(data.senderName || ""),
    senderPhotoURL: String(data.senderPhotoURL || ""),
    createdAtMillis: messageMillis(data.createdAt),
    type: String(data.type || "text"),
    fileName: String(data.fileName || ""),
    fileURL: String(data.fileURL || ""),
    fileType: String(data.fileType || ""),
    fileSize: Number(data.fileSize || 0),
    deletedForEveryone: data.deletedForEveryone === true,
    deletedByUid: String(data.deletedByUid || ""),
    deletedAtMillis: messageMillis(data.deletedAt),
    pinned: data.pinned === true,
    pinnedByUid: String(data.pinnedByUid || ""),
    pinnedByName: String(data.pinnedByName || ""),
    pinnedAtMillis: messageMillis(data.pinnedAt),
    replyToMessageId: String(data.replyToMessageId || ""),
    replyToText: String(data.replyToText || ""),
    replyToSenderName: String(data.replyToSenderName || ""),
    replyToSenderUid: String(data.replyToSenderUid || ""),
    replyToFileName: String(data.replyToFileName || ""),
    replyToType: String(data.replyToType || ""),
    reactions: data.reactions && typeof data.reactions === "object" && !Array.isArray(data.reactions) ? data.reactions : {},
    mentionedUids: Array.isArray(data.mentionedUids) ? data.mentionedUids.map(String) : [],
    edited: data.edited === true,
    editedAtMillis: messageMillis(data.editedAt),
    editedByUid: String(data.editedByUid || "")
  };
}


const DEFAULT_MESSAGE_WORKSPACE_SETTINGS = Object.freeze({
  directMessagesEnabled: true,
  groupConversationsEnabled: true,
  attachmentsEnabled: true
});

function messageWorkspaceSettingsRef(companyId) {
  return admin.firestore().collection("companies").doc(companyId).collection("messageSettings").doc("general");
}

function cleanMessageWorkspaceSettings(value = {}) {
  const settings = { ...DEFAULT_MESSAGE_WORKSPACE_SETTINGS };
  if (!value || typeof value !== "object" || Array.isArray(value)) return settings;
  for (const key of Object.keys(settings)) {
    if (typeof value[key] === "boolean") settings[key] = value[key];
  }
  return settings;
}

async function loadMessageWorkspaceSettings(companyId) {
  try {
    const snap = await messageWorkspaceSettingsRef(companyId).get();
    return cleanMessageWorkspaceSettings(snap.data() || {});
  } catch (error) {
    console.warn("Could not read message workspace settings:", error?.message || error);
    return { ...DEFAULT_MESSAGE_WORKSPACE_SETTINGS };
  }
}

function canManageMessageWorkspaceSettings(companyData = {}, uid = "") {
  if (uidIsCompanyOwner(companyData, uid)) return true;
  const roleValue = workspaceMemberRoleValue(companyData, uid, "member");
  if (customRoleData(companyData, roleValue)) {
    return canFullyEditOrder(workspaceMemberRole(companyData, uid, "member"))
      && uidCanAccessWorkspaceArea(companyData, uid, "settingsMessageSettings");
  }
  return normalizeWorkspaceRole(workspaceMemberRole(companyData, uid, "member"), "member") === "admin";
}

exports.getMessageWorkspaceSettings = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in to read message settings.");
  const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
  requireMessagesReadAccess(companyData, uid);
  const settings = await loadMessageWorkspaceSettings(companyId);
  return {
    ok: true,
    companyId,
    settings,
    canManage: canManageMessageWorkspaceSettings(companyData, uid)
  };
});

exports.setMessageWorkspaceSettings = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in to update message settings.");
  const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
  requireMessagesWriteAccess(companyData, uid);
  if (!canManageMessageWorkspaceSettings(companyData, uid)) {
    throw new HttpsError("permission-denied", "Only the workspace owner or admins can update message settings.");
  }
  const settings = cleanMessageWorkspaceSettings(request.data || {});
  await messageWorkspaceSettingsRef(companyId).set({
    ...settings,
    companyId,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedByUid: uid
  }, { merge: true });
  return { ok: true, companyId, settings };
});

async function ensureTeamMessageThread(companyId, companyData = {}) {
  const threadRef = messageThreadsRef(companyId).doc("team");
  const entries = messageWorkspaceMemberEntries(companyData);
  const memberUids = supportUniqueStrings(entries.map((item) => item.uid));
  const memberEmails = supportUniqueStrings(entries.map((item) => item.email)).map((item) => item.toLowerCase());

  await threadRef.set({
    companyId,
    type: "team",
    title: "Team Chat",
    memberUids,
    memberEmails,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    source: "messages",
    messageSchemaVersion: 1
  }, { merge: true });

  return threadRef;
}

async function requireMessageThreadAccess(companyId, threadId, uid, companyData = {}) {
  const threadRef = messageThreadsRef(companyId).doc(threadId);
  const threadSnap = await threadRef.get();
  if (!threadSnap.exists) {
    throw new HttpsError("not-found", "Message thread not found.");
  }

  const data = threadSnap.data() || {};
  const memberUids = Array.isArray(data.memberUids) ? data.memberUids.map(String) : [];
  if (!memberUids.includes(uid) && !uidIsCompanyOwner(companyData, uid)) {
    throw new HttpsError("permission-denied", "You do not have access to this conversation.");
  }
  return { threadRef, threadData: data };
}

async function messageSenderProfile(companyId, companyData, request) {
  const uid = request.auth?.uid || "";
  const email = supportUserEmail(request);
  const requestedPhotoURL = supportPhotoURLFromRequest(request);
  const photoURL = await supportPhotoURLForUser(companyId, companyData, uid, email, requestedPhotoURL);
  const name = cleanSupportText(request.auth?.token?.name || request.data?.userName || "", 120) ||
    supportNotificationSenderName({ createdByEmail: email, createdByName: "" }, "Team member");
  return { uid, email, name, photoURL };
}

exports.createMessageThread = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in to create a message thread.");

  const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
  requireMessagesConversationCreateAccess(companyData, uid);
  const requestedType = String(request.data?.type || "team").trim().toLowerCase();
  const type = requestedType === "direct" || requestedType === "group" ? requestedType : "team";
  const messageSettings = await loadMessageWorkspaceSettings(companyId);

  if (type === "team") {
    await ensureTeamMessageThread(companyId, companyData);
    return { ok: true, threadId: "team" };
  }

  const sender = await messageSenderProfile(companyId, companyData, request);
  const members = messageWorkspaceMemberEntries(companyData);
  const memberByUid = new Map(members.map((entry) => [String(entry.uid || ""), entry]));

  if (type === "direct") {
    if (messageSettings.directMessagesEnabled !== true) {
      throw new HttpsError("failed-precondition", "Direct messages are disabled for this workspace.");
    }
    const otherUid = cleanSupportText(request.data?.memberUid || request.data?.otherUid || "", 160);
    if (!otherUid || otherUid === uid) throw new HttpsError("invalid-argument", "Please choose a team member.");
    if (!uidHasCompanyAccess(companyData, otherUid)) throw new HttpsError("permission-denied", "That user is not in this workspace.");

    const ids = [uid, otherUid].sort();
    const threadId = `direct_${ids[0]}_${ids[1]}`.replace(/[^A-Za-z0-9_-]/g, "_");
    const otherPhotoURL = await supportPhotoURLForUser(companyId, companyData, otherUid, "");
    const otherEntry = memberByUid.get(otherUid) || {};
    const otherEmail = cleanSupportText(otherEntry.email || "", 240).toLowerCase();
    const existingThreadRef = messageThreadsRef(companyId).doc(threadId);
    const existingThreadSnap = await existingThreadRef.get();
    if (existingThreadSnap.exists) return { ok: true, threadId };

    await existingThreadRef.set({
      companyId, type: "direct",
      title: cleanSupportText(otherEntry.name || otherEntry.email || "Direct message", 120),
      memberUids: ids,
      memberEmails: supportUniqueStrings([sender.email, otherEmail]).map((item) => item.toLowerCase()),
      participantPhotoURLs: { [uid]: sender.photoURL || "", [otherUid]: otherPhotoURL || otherEntry.photoURL || "" },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      source: "messages", messageSchemaVersion: 1
    }, { merge: true });
    return { ok: true, threadId };
  }

  if (messageSettings.groupConversationsEnabled !== true) {
    throw new HttpsError("failed-precondition", "Group conversations are disabled for this workspace.");
  }
  const requestedMemberUids = Array.isArray(request.data?.memberUids)
    ? request.data.memberUids.map((item) => cleanSupportText(item, 160)).filter(Boolean) : [];
  const additionalUids = supportUniqueStrings(requestedMemberUids).filter((memberUid) => memberUid && memberUid !== uid);
  if (additionalUids.length === 0) throw new HttpsError("invalid-argument", "Please choose at least one team member.");
  for (const memberUid of additionalUids) {
    if (!uidHasCompanyAccess(companyData, memberUid)) throw new HttpsError("permission-denied", "Only workspace members can be added to a private group.");
  }
  const groupUids = supportUniqueStrings([uid, ...additionalUids]);
  const participantPhotoURLs = {};
  const groupEmails = [];
  for (const memberUid of groupUids) {
    const entry = memberByUid.get(memberUid) || {};
    const memberEmail = memberUid === uid ? sender.email : cleanSupportText(entry.email || "", 240).toLowerCase();
    if (memberEmail) groupEmails.push(memberEmail);
    participantPhotoURLs[memberUid] = memberUid === uid ? sender.photoURL || "" :
      await supportPhotoURLForUser(companyId, companyData, memberUid, memberEmail, entry.photoURL || "");
  }
  const groupTitle = cleanSupportText(request.data?.title || "Private group", 120) || "Private group";
  const threadRef = messageThreadsRef(companyId).doc();
  await threadRef.set({
    companyId, type: "group", title: groupTitle,
    memberUids: groupUids,
    memberEmails: supportUniqueStrings(groupEmails).map((item) => item.toLowerCase()),
    participantPhotoURLs,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    source: "messages", messageSchemaVersion: 1
  }, { merge: true });
  return { ok: true, threadId: threadRef.id };
});

exports.listMessageThreads = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in to read messages.");

  const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
  requireMessagesReadAccess(companyData, uid);
  await ensureTeamMessageThread(companyId, companyData);

  const snap = await messageThreadsRef(companyId)
    .where("memberUids", "array-contains", uid)
    .limit(100)
    .get();

  const threads = snap.docs
    .map((doc) => messageThreadFromDoc(doc, uid))
    .sort((a, b) => Number(b.lastMessageAtMillis || 0) - Number(a.lastMessageAtMillis || 0));

  return { ok: true, companyId, threads, teamMembers: messageWorkspaceMemberEntries(companyData) };
});

exports.listThreadMessages = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in to read messages.");

  const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
  requireMessagesReadAccess(companyData, uid);
  const threadId = cleanSupportText(request.data?.threadId, 220) || "team";
  if (threadId === "team") await ensureTeamMessageThread(companyId, companyData);
  const { threadRef } = await requireMessageThreadAccess(companyId, threadId, uid, companyData);

  const snap = await threadRef.collection("messages").orderBy("createdAt", "asc").limit(300).get();
  const messages = snap.docs
    .filter((doc) => {
      const data = doc.data() || {};
      const hiddenFor = data.hiddenFor && typeof data.hiddenFor === "object" && !Array.isArray(data.hiddenFor) ? data.hiddenFor : {};
      return hiddenFor[uid] !== true;
    })
    .map((doc) => messageFromDoc(doc, threadId));
  return { ok: true, threadId, messages };
});

exports.markMessageThreadRead = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in to mark messages read.");

  const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
  requireMessagesReadAccess(companyData, uid);
  const threadId = cleanSupportText(request.data?.threadId, 220) || "team";
  if (threadId === "team") await ensureTeamMessageThread(companyId, companyData);
  const { threadRef } = await requireMessageThreadAccess(companyId, threadId, uid, companyData);

  const requestedReadAtMillis = Number(request.data?.readAtMillis || 0);
  const readAt = Number.isFinite(requestedReadAtMillis) && requestedReadAtMillis > 0
    ? admin.firestore.Timestamp.fromMillis(requestedReadAtMillis)
    : admin.firestore.FieldValue.serverTimestamp();

  await threadRef.set({
    [`readBy.${uid}`]: readAt,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return { ok: true, threadId };
});

function mutedUntilMillisForUid(threadData = {}, uid = "") {
  const cleanUid = String(uid || "").trim();
  if (!cleanUid) return 0;
  const mutedMap = threadData.mutedUntilBy && typeof threadData.mutedUntilBy === "object" && !Array.isArray(threadData.mutedUntilBy)
    ? threadData.mutedUntilBy
    : {};
  return messageMillis(mutedMap[cleanUid]);
}

function activeUntilMillisForUid(threadData = {}, uid = "") {
  const cleanUid = String(uid || "").trim();
  if (!cleanUid) return 0;
  const activeMap = threadData.activeUntilBy && typeof threadData.activeUntilBy === "object" && !Array.isArray(threadData.activeUntilBy)
    ? threadData.activeUntilBy
    : {};
  return messageMillis(activeMap[cleanUid]);
}

function pushEligibleMessageRecipients(threadData = {}, recipientUids = [], mentionedUids = []) {
  const mentionSet = new Set((mentionedUids || []).map((item) => String(item || "").trim()).filter(Boolean));
  const now = Date.now();
  return supportUniqueStrings(recipientUids).filter((uid) => {
    const cleanUid = String(uid || "").trim();
    if (!cleanUid) return false;

    // If the recipient is actively viewing this exact conversation, do not send a push.
    // The unread state still updates in Firestore, but the device will not receive a duplicate alert.
    const activeUntil = activeUntilMillisForUid(threadData, cleanUid);
    if (activeUntil > now) return false;

    // Mentions can bypass mute, but not the active-viewing suppression above.
    if (mentionSet.has(cleanUid)) return true;

    const mutedUntil = mutedUntilMillisForUid(threadData, cleanUid);
    return !(mutedUntil > now);
  });
}

exports.setMessageThreadActive = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in to update conversation presence.");

  const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
  requireMessagesSendAccess(companyData, uid);
  const threadId = cleanSupportText(request.data?.threadId, 220) || "team";
  const isActive = request.data?.isActive === true;
  if (threadId === "team") await ensureTeamMessageThread(companyId, companyData);
  const { threadRef } = await requireMessageThreadAccess(companyId, threadId, uid, companyData);

  const activeField = new admin.firestore.FieldPath("activeUntilBy", uid);
  if (isActive) {
    await threadRef.update(
      activeField, admin.firestore.Timestamp.fromMillis(Date.now() + 90 * 1000),
      "activeUpdatedAt", admin.firestore.FieldValue.serverTimestamp()
    );
  } else {
    await threadRef.update(
      activeField, admin.firestore.FieldValue.delete(),
      "activeUpdatedAt", admin.firestore.FieldValue.serverTimestamp()
    );
  }

  return { ok: true, threadId, isActive };
});

exports.setMessageThreadMute = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in to mute a conversation.");

  const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
  requireMessagesReadAccess(companyData, uid);
  const threadId = cleanSupportText(request.data?.threadId, 220) || "team";
  const mode = cleanSupportText(request.data?.mode || "oneHour", 40);
  if (threadId === "team") await ensureTeamMessageThread(companyId, companyData);
  const { threadRef } = await requireMessageThreadAccess(companyId, threadId, uid, companyData);

  const now = Date.now();
  let mutedUntilMillis = 0;
  if (["oneHour", "1h", "hour"].includes(mode)) {
    mutedUntilMillis = now + 60 * 60 * 1000;
  } else if (mode === "today") {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    mutedUntilMillis = end.getTime();
  } else if (["forever", "untilOn", "untilIUnmute"].includes(mode)) {
    mutedUntilMillis = now + 3650 * 24 * 60 * 60 * 1000;
  } else if (["unmute", "off", "none"].includes(mode)) {
    mutedUntilMillis = 0;
  }

  const muteField = new admin.firestore.FieldPath("mutedUntilBy", uid);
  if (mutedUntilMillis > 0) {
    await threadRef.update(
      muteField, admin.firestore.Timestamp.fromMillis(mutedUntilMillis),
      "updatedAt", admin.firestore.FieldValue.serverTimestamp()
    );
  } else {
    await threadRef.update(
      muteField, admin.firestore.FieldValue.delete(),
      "updatedAt", admin.firestore.FieldValue.serverTimestamp()
    );
  }

  return { ok: true, threadId, mutedUntilMillis };
});

async function notifyMessageRecipients(companyId, threadId, threadData, messageId, messageData, recipientUids = []) {
  const cleanRecipientUids = supportUniqueStrings(recipientUids);
  if (cleanRecipientUids.length === 0) return { sent: 0, failed: 0, reason: "no_recipients" };

  const mentionedUids = Array.isArray(messageData.mentionedUids) ? messageData.mentionedUids.map(String) : [];
  const pushRecipientUids = pushEligibleMessageRecipients(threadData, cleanRecipientUids, mentionedUids);
  const hasMention = mentionedUids.some((item) => cleanRecipientUids.includes(item));
  const title = `${hasMention ? "@ " : ""}${messageData.senderName || "Team member"} • ${threadData.title || "Messages"}`.slice(0, 120);
  const body = cleanSupportText(messageData.text || messageData.fileName || "Sent a file", 240);
  const messageType = String(messageData.type || "").toLowerCase();
  const messageFileURL = cleanSupportPhotoURL(messageData.fileURL || "");
  const messageSenderPhotoURL = cleanSupportPhotoURL(messageData.senderPhotoURL || "");
  const messageRichImageURL = messageType === "image" && messageFileURL ? messageFileURL : messageSenderPhotoURL;
  const notificationRef = notificationCollectionRef(companyId).doc();
  const payload = {
    companyId,
    type: hasMention ? "message_mention" : "message",
    title,
    message: body,
    route: "messageThread",
    threadId,
    messageId,
    conversationType: threadData.type || "team",
    senderUid: messageData.senderUid || "",
    senderEmail: messageData.senderEmail || "",
    senderName: messageData.senderName || "",
    senderPhotoURL: messageSenderPhotoURL,
    imageUrl: messageRichImageURL,
    richImageURL: messageRichImageURL,
    previewImageURL: messageType === "image" ? messageFileURL : "",
    recipientUids: cleanRecipientUids,
    recipientEmails: [],
    mentionedUids,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    read: false,
    actioned: false,
    source: "workspaceMessages",
    messageSchemaVersion: 1
  };

  await notificationRef.set(payload, { merge: true });

  let pushResult = { sent: 0, failed: 0, reason: "not_attempted" };
  try {
    if (pushRecipientUids.length === 0) {
      pushResult = { sent: 0, failed: 0, reason: "all_recipients_muted", muted: true };
    } else {
      pushResult = await sendPushNotificationToRecipients(companyId, {
        ...payload,
        notificationId: notificationRef.id,
        body
      }, { userIds: pushRecipientUids, emails: [] });
    }
  } catch (error) {
    console.error("Message push failed:", notificationRef.id, error?.message || error);
    pushResult = { sent: 0, failed: 1, error: error?.message || String(error) };
  }

  await notificationRef.set({
    pushSent: Number(pushResult.sent || 0) > 0,
    pushResult,
    pushSentAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return pushResult;
}


const MESSAGE_REACTION_EMOJIS = new Set(["👍", "❤️", "😂", "✅", "👀", "🙏"]);

function cleanMessageReactionEmoji(value = "") {
  const emoji = String(value || "").trim();
  return MESSAGE_REACTION_EMOJIS.has(emoji) ? emoji : "";
}

function cleanMentionedMessageUids(value = [], allowedUids = [], senderUid = "") {
  if (!Array.isArray(value)) return [];
  const allowed = new Set((allowedUids || []).map((item) => String(item || "").trim()).filter(Boolean));
  const sender = String(senderUid || "").trim();
  const out = [];
  for (const raw of value) {
    const uid = String(raw || "").trim();
    if (!uid || uid === sender || !allowed.has(uid) || out.includes(uid)) continue;
    out.push(uid);
  }
  return out.slice(0, 25);
}

exports.toggleMessageReaction = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in to react to messages.");

  const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
  requireMessagesWriteAccess(companyData, uid);
  const threadId = cleanSupportText(request.data?.threadId, 220) || "team";
  const messageId = cleanSupportText(request.data?.messageId, 220);
  const emoji = cleanMessageReactionEmoji(request.data?.emoji || "");
  if (!messageId || !emoji) {
    throw new HttpsError("invalid-argument", "Please choose a valid message reaction.");
  }

  if (threadId === "team") await ensureTeamMessageThread(companyId, companyData);
  const { threadRef } = await requireMessageThreadAccess(companyId, threadId, uid, companyData);
  const messageRef = threadRef.collection("messages").doc(messageId);
  const sender = await messageSenderProfile(companyId, companyData, request);
  const userLabel = cleanSupportText(request.data?.userName || sender.name || sender.email || "Team member", 120);

  await admin.firestore().runTransaction(async (transaction) => {
    const messageSnap = await transaction.get(messageRef);
    if (!messageSnap.exists) {
      throw new HttpsError("not-found", "Message not found.");
    }
    const messageData = messageSnap.data() || {};
    if (messageData.deletedForEveryone === true) {
      throw new HttpsError("failed-precondition", "Deleted messages cannot receive reactions.");
    }

    const reactions = messageData.reactions && typeof messageData.reactions === "object" && !Array.isArray(messageData.reactions)
      ? { ...messageData.reactions }
      : {};
    const existingForEmoji = reactions[emoji] && typeof reactions[emoji] === "object" && !Array.isArray(reactions[emoji])
      ? { ...reactions[emoji] }
      : {};

    if (Object.prototype.hasOwnProperty.call(existingForEmoji, uid)) {
      delete existingForEmoji[uid];
    } else {
      existingForEmoji[uid] = userLabel;
    }

    if (Object.keys(existingForEmoji).length === 0) {
      delete reactions[emoji];
    } else {
      reactions[emoji] = existingForEmoji;
    }

    transaction.set(messageRef, {
      reactions,
      reactionsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      messageSchemaVersion: 2
    }, { merge: true });
  });

  return { ok: true, threadId, messageId, emoji };
});


exports.setMessageTypingStatus = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in to update typing status.");

  const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
  requireMessagesSendAccess(companyData, uid);
  const threadId = cleanSupportText(request.data?.threadId, 220) || "team";
  const isTyping = request.data?.isTyping === true;
  if (threadId === "team") await ensureTeamMessageThread(companyId, companyData);
  const { threadRef } = await requireMessageThreadAccess(companyId, threadId, uid, companyData);
  const typingRef = threadRef.collection("typing").doc(uid);

  if (!isTyping) {
    await typingRef.delete().catch(async () => {
      await typingRef.set({ isTyping: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    });
    return { ok: true, threadId, isTyping: false };
  }

  const sender = await messageSenderProfile(companyId, companyData, request);
  await typingRef.set({
    uid,
    name: sender.name || sender.email || "Team member",
    email: sender.email || "",
    photoURL: sender.photoURL || "",
    isTyping: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 9000),
    source: "workspaceMessagesTyping",
    messageSchemaVersion: 1
  }, { merge: true });

  return { ok: true, threadId, isTyping: true };
});

exports.clearMessageTypingStatus = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in to update typing status.");

  const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
  requireMessagesSendAccess(companyData, uid);
  const threadId = cleanSupportText(request.data?.threadId, 220) || "team";
  if (threadId === "team") await ensureTeamMessageThread(companyId, companyData);
  const { threadRef } = await requireMessageThreadAccess(companyId, threadId, uid, companyData);
  await threadRef.collection("typing").doc(uid).delete().catch(() => null);
  return { ok: true, threadId, isTyping: false };
});


exports.deleteMessageForMe = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in to delete messages.");

  const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
  requireMessagesReadAccess(companyData, uid);
  const threadId = cleanSupportText(request.data?.threadId, 220) || "team";
  const messageId = cleanSupportText(request.data?.messageId, 220);
  if (!messageId) throw new HttpsError("invalid-argument", "messageId is required.");

  if (threadId === "team") await ensureTeamMessageThread(companyId, companyData);
  const { threadRef } = await requireMessageThreadAccess(companyId, threadId, uid, companyData);
  const messageRef = threadRef.collection("messages").doc(messageId);
  const messageSnap = await messageRef.get();
  if (!messageSnap.exists) throw new HttpsError("not-found", "Message not found.");

  await messageRef.set({
    [`hiddenFor.${uid}`]: true,
    [`hiddenAt.${uid}`]: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return { ok: true, threadId, messageId };
});

exports.deleteMessageForEveryone = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in to delete messages.");

  const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
  requireMessagesWriteAccess(companyData, uid);
  const threadId = cleanSupportText(request.data?.threadId, 220) || "team";
  const messageId = cleanSupportText(request.data?.messageId, 220);
  if (!messageId) throw new HttpsError("invalid-argument", "messageId is required.");

  if (threadId === "team") await ensureTeamMessageThread(companyId, companyData);
  const { threadRef } = await requireMessageThreadAccess(companyId, threadId, uid, companyData);
  const messageRef = threadRef.collection("messages").doc(messageId);
  const messageSnap = await messageRef.get();
  if (!messageSnap.exists) throw new HttpsError("not-found", "Message not found.");

  const messageData = messageSnap.data() || {};
  if (String(messageData.senderUid || "") !== uid) {
    throw new HttpsError("permission-denied", "You can only delete your own messages for everyone.");
  }

  const batch = admin.firestore().batch();
  batch.set(messageRef, {
    deletedForEveryone: true,
    deletedByUid: uid,
    deletedAt: admin.firestore.FieldValue.serverTimestamp(),
    text: "",
    fileURL: "",
    fileName: "",
    fileType: "",
    fileSize: 0,
    type: "deleted",
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  try {
    const latestSnap = await threadRef.collection("messages").orderBy("createdAt", "desc").limit(1).get();
    if (!latestSnap.empty && latestSnap.docs[0].id === messageId) {
      batch.set(threadRef, {
        lastMessageText: "This message was deleted",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
  } catch (error) {
    console.warn("Could not update deleted last message preview:", error?.message || error);
  }

  await batch.commit();
  return { ok: true, threadId, messageId };
});

exports.addMembersToMessageThread = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in to add people to a conversation.");

  const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
  requireMessagesConversationCreateAccess(companyData, uid);
  const messageSettings = await loadMessageWorkspaceSettings(companyId);
  if (messageSettings.groupConversationsEnabled !== true) {
    throw new HttpsError("failed-precondition", "Group conversations are disabled for this workspace.");
  }
  const threadId = cleanSupportText(request.data?.threadId, 220);
  const requestedMemberUids = Array.isArray(request.data?.memberUids)
    ? request.data.memberUids.map((item) => cleanSupportText(item, 160)).filter(Boolean)
    : [];

  if (!threadId) throw new HttpsError("invalid-argument", "threadId is required.");
  if (threadId === "team") throw new HttpsError("failed-precondition", "Team Chat already includes the workspace team.");
  if (requestedMemberUids.length === 0) throw new HttpsError("invalid-argument", "Please choose at least one team member.");

  const { threadRef, threadData } = await requireMessageThreadAccess(companyId, threadId, uid, companyData);
  const existingUids = Array.isArray(threadData.memberUids) ? threadData.memberUids.map(String).filter(Boolean) : [];
  if (!existingUids.includes(uid)) {
    throw new HttpsError("permission-denied", "You must be a member of this conversation to add people.");
  }

  const entries = messageWorkspaceMemberEntries(companyData);
  const entryByUid = new Map(entries.map((entry) => [String(entry.uid || ""), entry]));
  const addedUids = [];
  for (const memberUid of supportUniqueStrings(requestedMemberUids)) {
    if (!memberUid || memberUid === uid || existingUids.includes(memberUid)) continue;
    if (!uidHasCompanyAccess(companyData, memberUid)) {
      throw new HttpsError("permission-denied", "Only workspace members can be added to a conversation.");
    }
    addedUids.push(memberUid);
  }

  if (addedUids.length === 0) {
    return { ok: true, threadId, addedUids: [], message: "No new members to add." };
  }

  const sender = await messageSenderProfile(companyId, companyData, request);
  const addedEntries = addedUids.map((memberUid) => entryByUid.get(memberUid) || { uid: memberUid, email: "", name: "Team member", photoURL: "" });
  const allUids = supportUniqueStrings([...existingUids, ...addedUids]);
  const allEmails = supportUniqueStrings([
    ...(Array.isArray(threadData.memberEmails) ? threadData.memberEmails.map(String) : []),
    ...addedEntries.map((entry) => entry.email || "")
  ]).map((item) => item.toLowerCase());

  const participantPhotoURLs = threadData.participantPhotoURLs && typeof threadData.participantPhotoURLs === "object" && !Array.isArray(threadData.participantPhotoURLs)
    ? { ...threadData.participantPhotoURLs }
    : {};
  for (const entry of addedEntries) {
    participantPhotoURLs[entry.uid] = await supportPhotoURLForUser(companyId, companyData, entry.uid, entry.email || "", entry.photoURL || "");
  }

  const addedNames = addedEntries.map((entry) => cleanSupportText(entry.name || entry.email || entry.uid || "Team member", 80));
  const systemText = `${sender.name || sender.email || "Someone"} added ${addedNames.join(", ")}`.slice(0, 240);
  const messageRef = threadRef.collection("messages").doc();
  const messagePayload = {
    threadId,
    companyId,
    text: systemText,
    senderUid: uid,
    senderEmail: sender.email || "",
    senderName: sender.name || sender.email || "Team member",
    senderPhotoURL: sender.photoURL || "",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    type: "system",
    source: "addMembersToMessageThread",
    messageSchemaVersion: 1
  };

  const batch = admin.firestore().batch();
  batch.set(threadRef, {
    type: "group",
    title: cleanSupportText(threadData.title || "Group chat", 120) || "Group chat",
    memberUids: allUids,
    memberEmails: allEmails,
    participantPhotoURLs,
    lastMessageText: systemText,
    lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
    lastMessageByUid: uid,
    lastMessageByName: sender.name || sender.email || "Team member",
    lastMessageByPhotoURL: sender.photoURL || "",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    [`readBy.${uid}`]: admin.firestore.FieldValue.serverTimestamp(),
    messageSchemaVersion: 1
  }, { merge: true });
  batch.set(messageRef, messagePayload);
  await batch.commit();

  await notifyMessageRecipients(companyId, threadId, { ...threadData, type: "group", title: "Group chat", memberUids: allUids }, messageRef.id, {
    ...messagePayload,
    createdAt: Date.now()
  }, addedUids);

  return { ok: true, threadId, addedUids, message: "People added." };
});




exports.renameMessageThread = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in to rename a group.");

  const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
  requireMessagesWriteAccess(companyData, uid);
  const threadId = cleanSupportText(request.data?.threadId, 220);
  const title = cleanSupportText(request.data?.title, 80);
  if (!threadId || !title) throw new HttpsError("invalid-argument", "threadId and title are required.");
  if (threadId === "team") throw new HttpsError("failed-precondition", "Team Chat cannot be renamed here.");

  const { threadRef, threadData } = await requireMessageThreadAccess(companyId, threadId, uid, companyData);
  const memberUids = Array.isArray(threadData.memberUids) ? threadData.memberUids.map(String).filter(Boolean) : [];
  const isGroup = String(threadData.type || "") === "group" || memberUids.length > 2;
  if (!isGroup) throw new HttpsError("failed-precondition", "Only group conversations can be renamed.");
  if (!memberUids.includes(uid)) throw new HttpsError("permission-denied", "You must be a member of this group.");

  const sender = await messageSenderProfile(companyId, companyData, request);
  const systemText = `${sender.name || sender.email || "Someone"} renamed the group to ${title}`.slice(0, 240);
  const messageRef = threadRef.collection("messages").doc();
  const messagePayload = {
    threadId,
    companyId,
    text: systemText,
    senderUid: uid,
    senderEmail: sender.email || "",
    senderName: sender.name || sender.email || "Team member",
    senderPhotoURL: sender.photoURL || "",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    type: "system",
    source: "renameMessageThread",
    messageSchemaVersion: 1
  };

  const batch = admin.firestore().batch();
  batch.set(threadRef, {
    type: "group",
    title,
    lastMessageText: systemText,
    lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
    lastMessageByUid: uid,
    lastMessageByName: sender.name || sender.email || "Team member",
    lastMessageByPhotoURL: sender.photoURL || "",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    [`readBy.${uid}`]: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  batch.set(messageRef, messagePayload);
  await batch.commit();

  const recipients = memberUids.filter((memberUid) => memberUid && memberUid !== uid);
  await notifyMessageRecipients(companyId, threadId, { ...threadData, type: "group", title, memberUids }, messageRef.id, messagePayload, recipients);
  return { ok: true, threadId, title };
});

exports.leaveMessageThread = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in to leave a group.");

  const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
  requireMessagesWriteAccess(companyData, uid);
  const threadId = cleanSupportText(request.data?.threadId, 220);
  if (!threadId) throw new HttpsError("invalid-argument", "threadId is required.");
  if (threadId === "team") throw new HttpsError("failed-precondition", "You cannot leave Team Chat.");

  const { threadRef, threadData } = await requireMessageThreadAccess(companyId, threadId, uid, companyData);
  const memberUids = Array.isArray(threadData.memberUids) ? threadData.memberUids.map(String).filter(Boolean) : [];
  const isGroup = String(threadData.type || "") === "group" || memberUids.length > 2;
  if (!isGroup) throw new HttpsError("failed-precondition", "Only group conversations can be left.");
  if (!memberUids.includes(uid)) throw new HttpsError("permission-denied", "You are not a member of this group.");
  if (memberUids.length <= 2) throw new HttpsError("failed-precondition", "A group must keep at least two members.");

  const sender = await messageSenderProfile(companyId, companyData, request);
  const remainingUids = memberUids.filter((memberUid) => memberUid !== uid);
  const senderEmail = String(sender.email || "").toLowerCase();
  const remainingEmails = Array.isArray(threadData.memberEmails)
    ? threadData.memberEmails.map(String).filter((email) => String(email || "").toLowerCase() !== senderEmail)
    : [];
  const systemText = `${sender.name || sender.email || "Someone"} left the group`.slice(0, 240);
  const messageRef = threadRef.collection("messages").doc();
  const messagePayload = {
    threadId,
    companyId,
    text: systemText,
    senderUid: uid,
    senderEmail: sender.email || "",
    senderName: sender.name || sender.email || "Team member",
    senderPhotoURL: sender.photoURL || "",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    type: "system",
    source: "leaveMessageThread",
    messageSchemaVersion: 1
  };

  const participantPhotoURLs = threadData.participantPhotoURLs && typeof threadData.participantPhotoURLs === "object" && !Array.isArray(threadData.participantPhotoURLs)
    ? { ...threadData.participantPhotoURLs }
    : {};
  delete participantPhotoURLs[uid];

  const batch = admin.firestore().batch();
  batch.set(threadRef, {
    type: "group",
    memberUids: remainingUids,
    memberEmails: supportUniqueStrings(remainingEmails).map((item) => item.toLowerCase()),
    participantPhotoURLs,
    lastMessageText: systemText,
    lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
    lastMessageByUid: uid,
    lastMessageByName: sender.name || sender.email || "Team member",
    lastMessageByPhotoURL: sender.photoURL || "",
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  batch.set(messageRef, messagePayload);
  await batch.commit();

  await notifyMessageRecipients(companyId, threadId, { ...threadData, type: "group", memberUids: remainingUids }, messageRef.id, messagePayload, remainingUids);
  return { ok: true, threadId };
});

exports.removeMemberFromMessageThread = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in to remove a group member.");

  const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
  requireMessagesWriteAccess(companyData, uid);
  const threadId = cleanSupportText(request.data?.threadId, 220);
  const memberUid = cleanSupportText(request.data?.memberUid, 160);
  if (!threadId || !memberUid) throw new HttpsError("invalid-argument", "threadId and memberUid are required.");
  if (threadId === "team") throw new HttpsError("failed-precondition", "Team Chat members cannot be removed here.");
  if (memberUid === uid) throw new HttpsError("invalid-argument", "Use Leave Group to remove yourself.");

  const { threadRef, threadData } = await requireMessageThreadAccess(companyId, threadId, uid, companyData);
  const memberUids = Array.isArray(threadData.memberUids) ? threadData.memberUids.map(String).filter(Boolean) : [];
  const isGroup = String(threadData.type || "") === "group" || memberUids.length > 2;
  if (!isGroup) throw new HttpsError("failed-precondition", "Only group conversations can be managed.");
  if (!memberUids.includes(uid)) throw new HttpsError("permission-denied", "You must be a member of this group.");
  if (!memberUids.includes(memberUid)) throw new HttpsError("not-found", "This user is not in the group.");
  if (memberUids.length <= 2) throw new HttpsError("failed-precondition", "A group must keep at least two members.");

  const requesterRole = normalizeWorkspaceRole(workspaceMemberRole(companyData, uid, "member"), "member");
  const canRemove = uidIsCompanyOwner(companyData, uid) || requesterRole === "admin";
  if (!canRemove) {
    throw new HttpsError("permission-denied", "Only the workspace owner or admins can remove group members.");
  }

  const entries = messageWorkspaceMemberEntries(companyData);
  const removedEntry = entries.find((entry) => entry.uid === memberUid) || { uid: memberUid, email: "", name: "Team member", photoURL: "" };
  const sender = await messageSenderProfile(companyId, companyData, request);
  const remainingUids = memberUids.filter((item) => item !== memberUid);
  const removedEmail = String(removedEntry.email || "").toLowerCase();
  const remainingEmails = Array.isArray(threadData.memberEmails)
    ? threadData.memberEmails.map(String).filter((email) => String(email || "").toLowerCase() !== removedEmail)
    : [];
  const removedName = cleanSupportText(removedEntry.name || removedEntry.email || memberUid || "Team member", 80);
  const systemText = `${sender.name || sender.email || "Someone"} removed ${removedName}`.slice(0, 240);
  const messageRef = threadRef.collection("messages").doc();
  const messagePayload = {
    threadId,
    companyId,
    text: systemText,
    senderUid: uid,
    senderEmail: sender.email || "",
    senderName: sender.name || sender.email || "Team member",
    senderPhotoURL: sender.photoURL || "",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    type: "system",
    source: "removeMemberFromMessageThread",
    messageSchemaVersion: 1
  };
  const participantPhotoURLs = threadData.participantPhotoURLs && typeof threadData.participantPhotoURLs === "object" && !Array.isArray(threadData.participantPhotoURLs)
    ? { ...threadData.participantPhotoURLs }
    : {};
  delete participantPhotoURLs[memberUid];

  const batch = admin.firestore().batch();
  batch.set(threadRef, {
    type: "group",
    memberUids: remainingUids,
    memberEmails: supportUniqueStrings(remainingEmails).map((item) => item.toLowerCase()),
    participantPhotoURLs,
    lastMessageText: systemText,
    lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
    lastMessageByUid: uid,
    lastMessageByName: sender.name || sender.email || "Team member",
    lastMessageByPhotoURL: sender.photoURL || "",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    [`readBy.${uid}`]: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  batch.set(messageRef, messagePayload);
  await batch.commit();

  await notifyMessageRecipients(companyId, threadId, { ...threadData, type: "group", memberUids: remainingUids }, messageRef.id, messagePayload, remainingUids);
  return { ok: true, threadId, removedUid: memberUid };
});

exports.sendThreadMessage = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in to send messages.");

  const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
  const sendAccess = requireMessagesSendAccess(companyData, uid);
  const threadId = cleanSupportText(request.data?.threadId, 220) || "team";
  const text = cleanMessageText(request.data?.text || request.data?.message || "", 5000);
  const fileURL = cleanSupportPhotoURL(request.data?.fileURL || "");
  const fileName = cleanSupportText(request.data?.fileName || "", 240);
  const fileType = cleanSupportText(request.data?.fileType || "", 160);
  const fileSize = Math.max(0, Number(request.data?.fileSize || 0) || 0);
  const replyToMessageId = cleanSupportText(request.data?.replyToMessageId || "", 220);
  const requestedMentionedUids = Array.isArray(request.data?.mentionedUids) ? request.data.mentionedUids.map(String) : [];

  if (!text && !fileURL) {
    throw new HttpsError("invalid-argument", "Please write a message or attach a file.");
  }

  if (fileURL && sendAccess.role === "viewOnly") {
    throw new HttpsError("permission-denied", "View Only members can send text messages but cannot upload message attachments.");
  }

  if (fileURL) {
    const messageSettings = await loadMessageWorkspaceSettings(companyId);
    if (messageSettings.attachmentsEnabled !== true) {
      throw new HttpsError("failed-precondition", "File sharing is disabled for this workspace.");
    }
  }

  if (threadId === "team") await ensureTeamMessageThread(companyId, companyData);
  const { threadRef, threadData } = await requireMessageThreadAccess(companyId, threadId, uid, companyData);
  const sender = await messageSenderProfile(companyId, companyData, request);
  const messageRef = threadRef.collection("messages").doc();
  const messageType = fileURL ? (String(fileType).toLowerCase().startsWith("image/") ? "image" : "file") : "text";
  const threadMemberUids = Array.isArray(threadData.memberUids) ? threadData.memberUids.map(String) : [];
  const mentionedUids = cleanMentionedMessageUids(requestedMentionedUids, threadMemberUids, uid);

  const replyPayload = {};
  if (replyToMessageId) {
    try {
      const replySnap = await threadRef.collection("messages").doc(replyToMessageId).get();
      if (replySnap.exists) {
        const replyData = replySnap.data() || {};
        replyPayload.replyToMessageId = replyToMessageId;
        replyPayload.replyToSenderUid = String(replyData.senderUid || "");
        replyPayload.replyToSenderName = cleanSupportText(replyData.senderName || replyData.senderEmail || "Original message", 120);
        replyPayload.replyToType = String(replyData.deletedForEveryone === true ? "deleted" : (replyData.type || "text"));
        if (replyData.deletedForEveryone === true) {
          replyPayload.replyToText = "Original message was deleted";
          replyPayload.replyToFileName = "";
        } else {
          replyPayload.replyToText = cleanSupportText(replyData.text || "", 240);
          replyPayload.replyToFileName = cleanSupportText(replyData.fileName || "", 240);
        }
      }
    } catch (error) {
      console.warn("Could not hydrate reply message", replyToMessageId, error?.message || error);
    }
  }

  const messagePayload = {
    threadId,
    companyId,
    text,
    senderUid: sender.uid,
    senderEmail: sender.email,
    senderName: sender.name,
    senderPhotoURL: sender.photoURL,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    type: messageType,
    fileName,
    fileURL,
    fileType,
    fileSize,
    source: "callable",
    ...replyPayload,
    mentionedUids,
    messageSchemaVersion: 1
  };

  const batch = admin.firestore().batch();
  batch.set(messageRef, messagePayload);
  batch.set(threadRef, {
    lastMessageText: text || (fileName ? `File: ${fileName}` : "Sent a file"),
    lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
    lastMessageByUid: sender.uid,
    lastMessageByName: sender.name,
    lastMessageByPhotoURL: sender.photoURL,
    lastMessageId: messageRef.id,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    [`readBy.${uid}`]: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  await batch.commit();

  const memberUids = Array.isArray(threadData.memberUids) ? threadData.memberUids.map(String) : [];
  const recipientUids = memberUids.filter((item) => item && item !== uid);
  await notifyMessageRecipients(companyId, threadId, threadData, messageRef.id, {
    ...messagePayload,
    createdAt: Date.now()
  }, recipientUids);

  return { ok: true, threadId, messageId: messageRef.id, message: "Message sent." };
});

exports.editThreadMessage = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in to edit messages.");

  const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
  requireMessagesWriteAccess(companyData, uid);
  const threadId = cleanSupportText(request.data?.threadId, 220) || "";
  const messageId = cleanSupportText(request.data?.messageId, 220) || "";
  const text = cleanMessageText(request.data?.text || "", 5000);

  if (!threadId || !messageId) {
    throw new HttpsError("invalid-argument", "threadId and messageId are required.");
  }

  const { threadRef, threadData } = await requireMessageThreadAccess(companyId, threadId, uid, companyData);
  const messageRef = threadRef.collection("messages").doc(messageId);
  const messageSnap = await messageRef.get();
  if (!messageSnap.exists) {
    throw new HttpsError("not-found", "Message not found.");
  }

  const messageData = messageSnap.data() || {};
  if (String(messageData.senderUid || "") !== uid) {
    throw new HttpsError("permission-denied", "You can only edit your own messages.");
  }
  if (messageData.deletedForEveryone === true) {
    throw new HttpsError("failed-precondition", "Deleted messages cannot be edited.");
  }

  const hasFile = Boolean(cleanSupportPhotoURL(messageData.fileURL || ""));
  if (!hasFile && !text) {
    throw new HttpsError("invalid-argument", "Text messages cannot be empty.");
  }

  const batch = admin.firestore().batch();
  batch.set(messageRef, {
    text,
    edited: true,
    editedAt: admin.firestore.FieldValue.serverTimestamp(),
    editedByUid: uid,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  const lastMessageId = String(threadData.lastMessageId || "");
  if (lastMessageId === messageId) {
    batch.set(threadRef, {
      lastMessageText: text || (messageData.fileName ? `File: ${messageData.fileName}` : "Sent a file"),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  await batch.commit();
  return { ok: true, threadId, messageId, message: "Message edited." };
});

/* === NivaDesk ChatGPT Workspace Action API - MVP v1 ===
   Private backend foundation for future ChatGPT / Apps SDK / MCP integration.
   Uses Firebase ID token in Authorization: Bearer <token>.
   Does not expose direct Firestore access.
*/

function nvChatCors(req, res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return true;
  }
  return false;
}

function nvCleanString(value = "", maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function nvCleanNumber(value = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function nvTimestampFromInput(value, fallbackDate = new Date()) {
  if (!value) return admin.firestore.Timestamp.fromDate(fallbackDate);
  if (value && typeof value.toDate === "function") return value;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return admin.firestore.Timestamp.fromDate(fallbackDate);
  return admin.firestore.Timestamp.fromDate(parsed);
}

function nvDeliveryDaysFromDueDate(dueDateValue, startDateValue = new Date(), fallbackDays = 45) {
  if (!dueDateValue) return fallbackDays;
  const due = dateFromISODate(dueDateValue);
  if (!due) return fallbackDays;

  const start = startDateValue instanceof Date
    ? startDateValue
    : new Date(String(startDateValue || ""));

  if (Number.isNaN(start.getTime())) return fallbackDays;

  const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const days = Math.round((dueDay - startDay) / (24 * 60 * 60 * 1000));

  if (!Number.isFinite(days)) return fallbackDays;
  return days;
}

function nvHistoryItem(title = "", oldValue = "", newValue = "") {
  return {
    id: crypto.randomUUID(),
    createdAt: admin.firestore.Timestamp.now(),
    title: nvCleanString(title, 160),
    oldValue: nvCleanString(oldValue, 500),
    newValue: nvCleanString(newValue, 1200)
  };
}

function nvRoleCanWriteOrders(companyData = {}, uid = "") {
  const role = normalizeWorkspaceRole(workspaceMemberRole(companyData, uid, "member"), "member");
  if (uidIsCompanyOwner(companyData, uid) || role === "owner" || role === "admin" || role === "member" || role === "workflowOnly") {
    return true;
  }
  return false;
}

function nvWorkflowOnlyContext(context = {}) {
  return normalizeWorkspaceRole(workspaceMemberRole(context.companyData || {}, context.uid || "", "member"), "member") === "workflowOnly";
}

function nvRequireWorkflowAssignedOrder(context = {}, orderData = {}) {
  if (!nvWorkflowOnlyContext(context)) return;
  if (String(orderData.assignedToUid || "").trim() !== String(context.uid || "").trim()) {
    throw new HttpsError("permission-denied", "Workflow Only members can access only orders assigned to them.");
  }
}

function nvSafeOrderForChatGPT(doc) {
  const data = doc.data ? (doc.data() || {}) : (doc || {});
  return {
    id: doc.id || data.id || "",
    companyId: data.companyId || "",
    customerName: data.customerName || "",
    emailAddress: data.emailAddress || "",
    instagramUsername: data.instagramUsername || "",
    whatsappNumber: data.whatsappNumber || "",
    watchRef: data.watchRef || "",
    designName: data.designName || "",
    designLink: data.designLink || "",
    notes: data.notes || "",
    designStatus: data.designStatus || "",
    status: data.status || "",
    priority: data.priority || "",
    risk: data.risk || "",
    trackingNumber: data.trackingNumber || "",
    courier: data.courier || "",
    isDispatched: Boolean(data.isDispatched),
    isDelivered: Boolean(data.isDelivered),
    paidAmount: Number(data.paidAmount || 0),
    remainingAmount: Number(data.remainingAmount || 0),
    watchPurchasePrice: Number(data.watchPurchasePrice || 0),
    deliveryTime: Number(data.deliveryTime || 0),
    paymentDate: data.paymentDate || null,
    deliveryDueDate: data.deliveryDueDate || data.dueDate || data.deliveryDate || null,
    dueDate: nvChatGPTDueDateMillis(data)
      ? new Date(nvChatGPTDueDateMillis(data)).toISOString().slice(0, 10)
      : "",
    labels: data.labels || [],
    todoCount: Array.isArray(data.todoItems) ? data.todoItems.length : 0,
    clientFileCount: Array.isArray(data.clientFiles) ? data.clientFiles.length : 0,
    historyLog: Array.isArray(data.historyLog) ? data.historyLog.slice(0, 20) : []
  };
}

async function nvRequireFirebaseIdToken(req) {
  const authHeader = String(req.get("Authorization") || req.get("authorization") || "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";

  if (!token) {
    throw new HttpsError("unauthenticated", "Missing Authorization: Bearer <Firebase ID token>.");
  }

  try {
    return await admin.auth().verifyIdToken(token);
  } catch (error) {
    throw new HttpsError("unauthenticated", "Invalid Firebase ID token.");
  }
}

async function nvRequireChatGPTWorkspaceAccess(req, companyId = "") {
  const authHeader = String(req.get("Authorization") || "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  if (!token) {
    throw new HttpsError("unauthenticated", "Missing Authorization: Bearer <Firebase ID token>.");
  }

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch (error) {
    throw new HttpsError("unauthenticated", "Invalid Firebase ID token.");
  }

  const uid = String(decoded.uid || "").trim();
  const cleanCompanyId = String(companyId || "").trim();
  if (!uid || !cleanCompanyId) {
    throw new HttpsError("invalid-argument", "companyId is required.");
  }

  const companyRef = admin.firestore().collection("companies").doc(cleanCompanyId);
  const companySnap = await companyRef.get();
  if (!companySnap.exists) {
    throw new HttpsError("not-found", "Workspace not found.");
  }

  const companyData = { ...(companySnap.data() || {}), __workspaceId: cleanCompanyId };
  if (!uidHasCompanyAccess(companyData, uid)) {
    throw new HttpsError("permission-denied", "You do not have access to this workspace.");
  }

  return {
    uid,
    email: String(decoded.email || "").trim().toLowerCase(),
    companyId: cleanCompanyId,
    companyRef,
    companyData
  };
}

function nvRequireWriteAccess(context) {
  if (!nvRoleCanWriteOrders(context.companyData, context.uid)) {
    throw new HttpsError("permission-denied", "Your role cannot create or update orders.");
  }
}

function nvRoleCanAccessFinancialInfo(companyData = {}, uid = "") {
  const cleanUid = String(uid || "").trim();
  if (!cleanUid) return false;
  if (uidIsCompanyOwner(companyData, cleanUid)) return true;

  const roleValue = workspaceMemberRoleValue(companyData, cleanUid, "member");
  const customRole = customRoleData(companyData, roleValue);
  const access = workspaceMemberAccess(companyData, cleanUid);
  const hasFinanceAccess = access.financialInfo !== false && access.cardFinancial !== false;

  if (customRole) return hasFinanceAccess;

  const role = normalizeWorkspaceRole(roleValue, "member");
  if (role === "workflowOnly" || role === "viewOnly") return false;
  if (role === "owner" || role === "admin" || role === "member") return hasFinanceAccess;
  return false;
}

function nvRequireFinancialAccess(context) {
  if (!nvRoleCanAccessFinancialInfo(context.companyData, context.uid)) {
    throw new HttpsError("permission-denied", "You do not have access to financial information in this workspace.");
  }
}

function nvRequireDashboardAccess(context) {
  if (!uidCanAccessWorkspaceArea(context.companyData, context.uid, "dashboard")) {
    throw new HttpsError("permission-denied", "You do not have access to the dashboard in this workspace.");
  }
}

function nvMoneyNumber(value) {
  const raw = typeof value === "number" ? value : String(value ?? "")
    .replace(/,/g, "")
    .replace(/[£$€]/g, "")
    .trim();
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function nvChatGPTDateMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") {
    const d = value.toDate();
    const t = d instanceof Date ? d.getTime() : NaN;
    return Number.isFinite(t) ? t : null;
  }
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function nvChatGPTDueDateMillis(order = {}) {
  const explicit = nvChatGPTDateMillis(order.dueDate || order.deliveryDueDate || order.deliveryDate);
  if (explicit) return explicit;
  const startMs = nvChatGPTDateMillis(order.paymentDate || order.createdAt);
  const deliveryDays = Number(order.deliveryTime || order.deliveryDays || 0);
  if (startMs && Number.isFinite(deliveryDays) && deliveryDays > 0) {
    return startMs + deliveryDays * 24 * 60 * 60 * 1000;
  }
  return null;
}

function nvIsCompletedStatus(value = "") {
  const s = String(value || "").trim().toLowerCase();
  return ["completed", "complete", "done", "delivered", "finished", "tamamlandı", "tamamlandi"].includes(s);
}

function nvIsCancelledStatus(value = "") {
  const s = String(value || "").trim().toLowerCase();
  return ["cancelled", "canceled", "cancel", "iptal", "cancelled order"].includes(s);
}

function nvChatGPTCustomFinancialItems(order = {}, prefix = "") {
  const fields = order.customFields && typeof order.customFields === "object" && !Array.isArray(order.customFields) ? order.customFields : {};
  return Object.entries(fields)
    .filter(([key]) => String(key || "").startsWith(prefix))
    .map(([key, rawValue]) => {
      const title = String(key).slice(prefix.length);
      const amount = nvMoneyNumber(rawValue);
      return { title, amount };
    })
    .filter((item) => item.title && item.amount !== 0);
}

function nvChatGPTOrderFinancialsFromData(data = {}, orderId = "") {
  const paidAmount = nvMoneyNumber(data.paidAmount);
  const remainingAmount = nvMoneyNumber(data.remainingAmount);
  const totalPrice = nvMoneyNumber(data.totalPrice || data.price || (paidAmount + remainingAmount));
  const watchPurchasePrice = nvMoneyNumber(data.watchPurchasePrice);
  const paymentFee = nvMoneyNumber(data.paymentFee);
  const deliveryCost = nvMoneyNumber(data.deliveryCost);
  const taxAmount = nvMoneyNumber(data.taxAmount);
  const taxRate = nvMoneyNumber(data.taxRate);
  const customExpenses = nvChatGPTCustomFinancialItems(data, "financialExpense::");
  const customPending = nvChatGPTCustomFinancialItems(data, "financialRemaining::");
  const customExpenseTotal = customExpenses.reduce((sum, item) => sum + item.amount, 0);
  const customPendingTotal = customPending.reduce((sum, item) => sum + item.amount, 0);
  const totalCost = watchPurchasePrice + paymentFee + deliveryCost + taxAmount + customExpenseTotal;
  const expectedRevenue = totalPrice || (paidAmount + remainingAmount);
  const estimatedProfit = expectedRevenue - totalCost;
  const outstandingTotal = remainingAmount + customPendingTotal;
  const dueMs = nvChatGPTDueDateMillis(data);

  return {
    orderId,
    customerName: String(data.customerName || ""),
    watchRef: String(data.watchRef || ""),
    designName: String(data.designName || ""),
    status: String(data.status || ""),
    designStatus: String(data.designStatus || ""),
    currency: String(data.currency || data.paraBirimi || "£"),
    totalPrice: nvMoneyNumber(totalPrice),
    paidAmount,
    remainingAmount,
    customPending,
    customPendingTotal,
    outstandingTotal,
    watchPurchasePrice,
    paymentFee,
    deliveryCost,
    taxType: String(data.taxType || ""),
    taxRate,
    taxAmount,
    customExpenses,
    customExpenseTotal,
    totalCost,
    estimatedProfit,
    dueDate: dueMs ? new Date(dueMs).toISOString().slice(0, 10) : "",
    isCompleted: nvIsCompletedStatus(data.status),
    isCancelled: nvIsCancelledStatus(data.status)
  };
}

function nvChatGPTHasAdvancedFinance(context = {}) {
  return billingEntitlementsForCompany(context.companyData || {}).advancedFinanceEnabled === true;
}

function nvChatGPTBasicFinanceLimitation() {
  return "This plan includes Received totals, Base Cost and Basic Balance only. VAT, shipping, platform fees, custom expenses and detailed profit are available on NivaDesk Pro and Team.";
}

function nvChatGPTBasicOrderFinancialsFromData(data = {}, id = "") {
  const paidAmount = nvMoneyNumber(data.paidAmount);
  const baseCost = nvMoneyNumber(data.watchPurchasePrice);
  return {
    id,
    customerName: String(data.customerName || ""),
    designName: String(data.designName || ""),
    status: String(data.status || ""),
    currency: String(data.currency || data.paraBirimi || "£"),
    paidAmount,
    receivedAmount: paidAmount,
    baseCost,
    watchPurchasePrice: baseCost,
    basicBalance: nvRoundMoney(paidAmount - baseCost),
    accessLevel: "basic",
    limitation: nvChatGPTBasicFinanceLimitation()
  };
}

async function nvChatGPTGetOrderFinancials(context, args = {}) {
  nvRequireFinancialAccess(context);

  let orderId = nvCleanString(args.orderId || args.id || "", 160);
  const query = nvCleanString(
    args.query || args.orderName || args.designName || args.customerName || "",
    240
  ).toLowerCase();

  if (!orderId && query) {
    const snap = await admin.firestore()
      .collection("siparisler")
      .where("companyId", "==", context.companyId)
      .limit(250)
      .get();

    const matchingDocs = snap.docs.filter((doc) => {
      const data = doc.data() || {};
      const designName = String(data.designName || data.projectName || "").trim().toLowerCase();
      const customerName = String(data.customerName || "").trim().toLowerCase();
      const watchRef = String(data.watchRef || "").trim().toLowerCase();
      const exactMatch =
        doc.id.toLowerCase() === query ||
        designName === query ||
        customerName === query;

      if (exactMatch) return true;

      const haystack = [designName, customerName, watchRef].join(" ");
      return haystack.includes(query);
    });

    if (matchingDocs.length === 0) {
      throw new HttpsError("not-found", "No order matching that name or customer was found in the connected workspace.");
    }

    const exactDocs = matchingDocs.filter((doc) => {
      const data = doc.data() || {};
      return [
        doc.id,
        data.designName,
        data.projectName,
        data.customerName
      ].some((value) => String(value || "").trim().toLowerCase() === query);
    });

    const selectedDocs = exactDocs.length > 0 ? exactDocs : matchingDocs;
    if (selectedDocs.length > 1) {
      throw new HttpsError("failed-precondition", "More than one order matches this request. Please specify the order more precisely.");
    }

    orderId = selectedDocs[0].id;
  }

  if (!orderId) {
    throw new HttpsError("invalid-argument", "Provide orderId or query/orderName/customerName to read financial information.");
  }

  const ref = admin.firestore().collection("siparisler").doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Order not found.");
  const data = snap.data() || {};
  if (String(data.companyId || "") !== context.companyId) {
    throw new HttpsError("permission-denied", "This order belongs to another workspace.");
  }

  return {
    ok: true,
    action: "get_order_financials",
    orderId,
    resolvedBy: query && !(args.orderId || args.id) ? "query" : "orderId",
    financials: nvChatGPTHasAdvancedFinance(context)
      ? nvChatGPTOrderFinancialsFromData(data, orderId)
      : nvChatGPTBasicOrderFinancialsFromData(data, orderId)
  };
}

function nvChatGPTDashboardBuckets(orders = []) {
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  let active = 0;
  let completed = 0;
  let cancelled = 0;
  let overdue = 0;
  let dueSoon = 0;

  for (const item of orders) {
    const status = item.status || "";
    if (nvIsCancelledStatus(status)) {
      cancelled += 1;
    } else if (nvIsCompletedStatus(status) || item.isDelivered === true) {
      completed += 1;
    } else {
      active += 1;
      const dueMs = nvChatGPTDueDateMillis(item);
      if (dueMs && dueMs < now) overdue += 1;
      if (dueMs && dueMs >= now && dueMs <= now + sevenDays) dueSoon += 1;
    }
  }

  return { total: orders.length, active, completed, cancelled, overdue, dueSoon };
}

function nvChatGPTBasicDashboardFinancialSummary(orders = []) {
  const summary = { receivedAmount: 0, baseCost: 0, basicBalance: 0 };
  for (const order of orders) {
    if (nvIsCancelledStatus(order.status)) continue;
    summary.receivedAmount += nvMoneyNumber(order.paidAmount);
    summary.baseCost += nvMoneyNumber(order.watchPurchasePrice);
  }
  summary.receivedAmount = nvRoundMoney(summary.receivedAmount);
  summary.baseCost = nvRoundMoney(summary.baseCost);
  summary.basicBalance = nvRoundMoney(summary.receivedAmount - summary.baseCost);
  return { ...summary, accessLevel: "basic", limitation: nvChatGPTBasicFinanceLimitation() };
}

function nvChatGPTDashboardFinancialSummary(orders = []) {
  const summary = {
    totalRevenue: 0,
    paidAmount: 0,
    remainingAmount: 0,
    customPendingTotal: 0,
    outstandingTotal: 0,
    watchPurchaseCost: 0,
    paymentFees: 0,
    deliveryCosts: 0,
    taxAmount: 0,
    customExpenseTotal: 0,
    totalCost: 0,
    estimatedProfit: 0
  };

  for (const order of orders) {
    if (nvIsCancelledStatus(order.status)) continue;
    const f = nvChatGPTOrderFinancialsFromData(order, order.id || "");
    summary.totalRevenue += f.totalPrice || (f.paidAmount + f.remainingAmount);
    summary.paidAmount += f.paidAmount;
    summary.remainingAmount += f.remainingAmount;
    summary.customPendingTotal += f.customPendingTotal;
    summary.outstandingTotal += f.outstandingTotal;
    summary.watchPurchaseCost += f.watchPurchasePrice;
    summary.paymentFees += f.paymentFee;
    summary.deliveryCosts += f.deliveryCost;
    summary.taxAmount += f.taxAmount;
    summary.customExpenseTotal += f.customExpenseTotal;
    summary.totalCost += f.totalCost;
    summary.estimatedProfit += f.estimatedProfit;
  }

  for (const key of Object.keys(summary)) {
    summary[key] = Math.round((summary[key] + Number.EPSILON) * 100) / 100;
  }
  return summary;
}


function nvRoundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function nvChatGPTScopeDateRange(scope = "", fromDate = "", toDate = "") {
  const normalized = String(scope || "thisMonth").trim().toLowerCase();
  const now = new Date();

  function startOfDay(d) {
    const out = new Date(d);
    out.setHours(0, 0, 0, 0);
    return out;
  }

  function endOfDay(d) {
    const out = new Date(d);
    out.setHours(23, 59, 59, 999);
    return out;
  }

  if (["all", "alltime", "all_time", "all time"].includes(normalized)) {
    return null;
  }

  if (["custom", "customrange", "custom_range", "custom range"].includes(normalized)) {
    const startMs = Date.parse(String(fromDate || ""));
    const endMs = Date.parse(String(toDate || ""));
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      throw new HttpsError("invalid-argument", "fromDate and toDate are required for custom range, in YYYY-MM-DD format.");
    }
    return { startMs: startOfDay(new Date(startMs)).getTime(), endMs: endOfDay(new Date(endMs)).getTime(), scope: "customRange" };
  }

  if (["thisyear", "this_year", "this year", "year"].includes(normalized)) {
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear() + 1, 0, 1);
    return { startMs: start.getTime(), endMs: end.getTime(), scope: "thisYear" };
  }

  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { startMs: start.getTime(), endMs: end.getTime(), scope: "thisMonth" };
}

function nvChatGPTPaymentDateMillis(order = {}) {
  return nvChatGPTDateMillis(order.paymentDate || order.createdAt || order.updatedAt);
}

function nvChatGPTExtraSpendingEntry(order = {}, heading = "", amount = 0, source = "custom") {
  const orderId = String(order.id || order.orderId || "");
  const dateMs = nvChatGPTPaymentDateMillis(order);
  return {
    orderId,
    customerName: String(order.customerName || ""),
    designName: String(order.designName || ""),
    watchRef: String(order.watchRef || ""),
    status: String(order.status || ""),
    paymentDate: dateMs ? new Date(dateMs).toISOString().slice(0, 10) : "",
    heading: String(heading || ""),
    amount: nvRoundMoney(amount),
    source
  };
}

function nvChatGPTExtraSpendingEntriesForOrder(order = {}, options = {}) {
  const entries = [];

  function pushEntry(heading, amount, source) {
    const value = nvMoneyNumber(amount);
    if (value <= 0) return;
    entries.push(nvChatGPTExtraSpendingEntry(order, heading, value, source));
  }

  if (options.includeBaseCost !== false) {
    pushEntry("Base Cost", order.watchPurchasePrice, "baseCost");
  }
  if (options.includeShipping === true) {
    pushEntry("Shipping", order.deliveryCost, "shipping");
  }
  if (options.includePlatformFee === true) {
    pushEntry("Platform Fee", order.paymentFee, "platformFee");
  }
  if (options.includeTax === true) {
    pushEntry("VAT / Tax", order.taxAmount, "tax");
  }

  if (options.includeCustomExpenses !== false) {
    const customExpenses = nvChatGPTCustomFinancialItems(order, "financialExpense::");
    for (const item of customExpenses) {
      pushEntry(item.title, item.amount, "customSpending");
    }
  }

  return entries;
}

function nvChatGPTSummarizeExtraSpending(entries = []) {
  const byHeading = new Map();
  const byOrder = new Map();

  for (const entry of entries) {
    const headingKey = String(entry.heading || "Other");
    const orderKey = String(entry.orderId || "unknown");
    const amount = nvMoneyNumber(entry.amount);

    if (!byHeading.has(headingKey)) {
      byHeading.set(headingKey, { heading: headingKey, total: 0, count: 0 });
    }
    const h = byHeading.get(headingKey);
    h.total += amount;
    h.count += 1;

    if (!byOrder.has(orderKey)) {
      byOrder.set(orderKey, {
        orderId: orderKey,
        customerName: entry.customerName,
        designName: entry.designName,
        watchRef: entry.watchRef,
        total: 0,
        count: 0
      });
    }
    const o = byOrder.get(orderKey);
    o.total += amount;
    o.count += 1;
  }

  const clean = (item) => ({ ...item, total: nvRoundMoney(item.total) });

  return {
    byHeading: Array.from(byHeading.values()).map(clean).sort((a, b) => b.total - a.total).slice(0, 50),
    byOrder: Array.from(byOrder.values()).map(clean).sort((a, b) => b.total - a.total).slice(0, 50)
  };
}

async function nvChatGPTGetExtraSpendingOverview(context, args = {}) {
  nvRequireFinancialAccess(context);

  const range = nvChatGPTScopeDateRange(args.scope || args.period || "thisMonth", args.fromDate || args.startDate || "", args.toDate || args.endDate || "");
  const pageSize = Math.min(Math.max(Number(args.pageSize || args.limit || 20), 1), 100);
  const page = Math.max(Number(args.page || 1), 1);
  const orders = await nvChatGPTLoadWorkspaceOrders(context, args.scanLimit || 1000);

  const advancedFinance = nvChatGPTHasAdvancedFinance(context);
  const includeOptions = advancedFinance ? {
    includeBaseCost: args.includeBaseCost !== false,
    includeShipping: args.includeShipping === true,
    includePlatformFee: args.includePlatformFee === true,
    includeTax: args.includeTax === true,
    includeCustomExpenses: true
  } : {
    includeBaseCost: true,
    includeShipping: false,
    includePlatformFee: false,
    includeTax: false,
    includeCustomExpenses: false
  };

  let entries = [];
  for (const order of orders) {
    if (nvIsCancelledStatus(order.status)) continue;
    const dateMs = nvChatGPTPaymentDateMillis(order);
    if (range && (!dateMs || dateMs < range.startMs || dateMs > range.endMs)) continue;
    entries.push(...nvChatGPTExtraSpendingEntriesForOrder(order, includeOptions));
  }

  entries = entries
    .filter((entry) => nvMoneyNumber(entry.amount) > 0)
    .sort((a, b) => {
      const amountDiff = nvMoneyNumber(b.amount) - nvMoneyNumber(a.amount);
      if (amountDiff !== 0) return amountDiff;
      return String(a.customerName || "").localeCompare(String(b.customerName || ""));
    });

  const totalAmount = nvRoundMoney(entries.reduce((sum, entry) => sum + nvMoneyNumber(entry.amount), 0));
  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const pageEntries = entries.slice(startIndex, startIndex + pageSize);
  const summary = nvChatGPTSummarizeExtraSpending(entries);

  return {
    ok: true,
    action: "get_extra_spending_overview",
    companyId: context.companyId,
    scope: range ? range.scope : "allTime",
    fromDate: range ? new Date(range.startMs).toISOString().slice(0, 10) : "",
    toDate: range ? new Date(range.endMs).toISOString().slice(0, 10) : "",
    includeOptions,
    accessLevel: advancedFinance ? "advanced" : "basic",
    limitation: advancedFinance ? "" : nvChatGPTBasicFinanceLimitation(),
    totalAmount,
    totalEntries: entries.length,
    page: safePage,
    pageSize,
    totalPages,
    pageRange: entries.length === 0 ? "0 / 0" : `${startIndex + 1}-${Math.min(startIndex + pageSize, entries.length)} / ${entries.length}`,
    byHeading: summary.byHeading,
    byOrder: summary.byOrder,
    entries: pageEntries
  };
}

function nvChatGPTOrderSummaryForDashboard(data = {}, id = "") {
  const dueMs = nvChatGPTDueDateMillis(data);
  return {
    id,
    customerName: String(data.customerName || ""),
    watchRef: String(data.watchRef || ""),
    designName: String(data.designName || ""),
    status: String(data.status || ""),
    designStatus: String(data.designStatus || ""),
    remainingAmount: nvMoneyNumber(data.remainingAmount),
    paidAmount: nvMoneyNumber(data.paidAmount),
    dueDate: dueMs ? new Date(dueMs).toISOString().slice(0, 10) : ""
  };
}

async function nvChatGPTLoadWorkspaceOrders(context, limit = 500) {
  const snap = await admin.firestore()
    .collection("siparisler")
    .where("companyId", "==", context.companyId)
    .limit(Math.min(Math.max(Number(limit || 500), 1), 1000))
    .get();

  return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
}

async function nvChatGPTGetDashboardSummary(context, args = {}) {
  nvRequireDashboardAccess(context);
  const orders = await nvChatGPTLoadWorkspaceOrders(context, args.limit || 500);
  const buckets = nvChatGPTDashboardBuckets(orders);
  const hasFinancialAccess = nvRoleCanAccessFinancialInfo(context.companyData, context.uid);

  const now = Date.now();
  const upcoming = orders
    .filter((order) => !nvIsCancelledStatus(order.status) && !nvIsCompletedStatus(order.status) && order.isDelivered !== true)
    .map((order) => ({ order, dueMs: nvChatGPTDueDateMillis(order) }))
    .filter((item) => item.dueMs)
    .sort((a, b) => a.dueMs - b.dueMs)
    .slice(0, 10)
    .map((item) => ({
      ...nvChatGPTOrderSummaryForDashboard(item.order, item.order.id || ""),
      daysRemaining: Math.ceil((item.dueMs - now) / (24 * 60 * 60 * 1000))
    }));

  const result = {
    ok: true,
    action: "get_dashboard_summary",
    companyId: context.companyId,
    counts: buckets,
    upcomingOrders: upcoming,
    financialAccess: hasFinancialAccess
  };

  if (hasFinancialAccess) {
    result.financialSummary = nvChatGPTHasAdvancedFinance(context)
      ? nvChatGPTDashboardFinancialSummary(orders)
      : nvChatGPTBasicDashboardFinancialSummary(orders);
    result.highestRemainingOrders = orders
      .filter((order) => !nvIsCancelledStatus(order.status) && nvMoneyNumber(order.remainingAmount) > 0)
      .sort((a, b) => nvMoneyNumber(b.remainingAmount) - nvMoneyNumber(a.remainingAmount))
      .slice(0, 10)
      .map((order) => nvChatGPTOrderSummaryForDashboard(order, order.id || ""));
  } else {
    result.financialSummaryHiddenReason = "Your workspace role does not allow financial information.";
  }

  return result;
}

async function nvChatGPTGetFinancialOverview(context, args = {}) {
  nvRequireFinancialAccess(context);
  const orders = await nvChatGPTLoadWorkspaceOrders(context, args.limit || 1000);
  if (!nvChatGPTHasAdvancedFinance(context)) {
    return {
      ok: true,
      action: "get_financial_overview",
      companyId: context.companyId,
      counts: nvChatGPTDashboardBuckets(orders),
      advancedFinanceAvailable: false,
      financialSummary: nvChatGPTBasicDashboardFinancialSummary(orders)
    };
  }

  return {
    ok: true,
    action: "get_financial_overview",
    companyId: context.companyId,
    counts: nvChatGPTDashboardBuckets(orders),
    advancedFinanceAvailable: true,
    financialSummary: nvChatGPTDashboardFinancialSummary(orders),
    highestRemainingOrders: orders
      .filter((order) => !nvIsCancelledStatus(order.status) && nvMoneyNumber(order.remainingAmount) > 0)
      .sort((a, b) => nvMoneyNumber(b.remainingAmount) - nvMoneyNumber(a.remainingAmount))
      .slice(0, 15)
      .map((order) => nvChatGPTOrderSummaryForDashboard(order, order.id || "")),
    mostProfitableOrders: orders
      .filter((order) => !nvIsCancelledStatus(order.status))
      .map((order) => ({ order, financials: nvChatGPTOrderFinancialsFromData(order, order.id || "") }))
      .sort((a, b) => b.financials.estimatedProfit - a.financials.estimatedProfit)
      .slice(0, 10)
      .map((item) => ({
        ...nvChatGPTOrderSummaryForDashboard(item.order, item.order.id || ""),
        estimatedProfit: item.financials.estimatedProfit,
        totalRevenue: item.financials.totalPrice || (item.financials.paidAmount + item.financials.remainingAmount),
        totalCost: item.financials.totalCost
      }))
  };
}

function nvOrderDefaults(args = {}, context = {}) {
  const customerName = nvCleanString(args.customerName || args.customer || "New Project", 240) || "New Project";
  const designBrief = nvCleanString(args.designBrief || args.notes || "", 5000);
  const watchModel = nvCleanString(args.watchModel || args.watchRef || "", 240);

  const paymentDateInput = args.paymentDate || args.createdDate || args.orderDate || "";
  const paymentDate = nvTimestampFromInput(paymentDateInput, new Date());
  const paymentDateValue = paymentDate.toDate();
  const dueDateInput = nvCleanString(args.deliveryDueDate || args.dueDate || "", 40);
  const deliveryDueDate = dueDateInput ? dateFromISODate(dueDateInput) : null;

  if (dueDateInput && !deliveryDueDate) {
    throw new HttpsError("invalid-argument", "Delivery due date must be in YYYY-MM-DD format.");
  }

  let deliveryDays;
  if (Number.isFinite(Number(args.deliveryDays))) {
    deliveryDays = Math.max(0, Number(args.deliveryDays));
  } else if (deliveryDueDate) {
    deliveryDays = nvDeliveryDaysFromDueDate(dueDateInput, paymentDateValue, 45);
    if (deliveryDays < 0 && !paymentDateInput) {
      throw new HttpsError(
        "invalid-argument",
        "A past delivery due date requires the original created date. Please provide paymentDate or createdDate in YYYY-MM-DD format."
      );
    }
    if (deliveryDays < 0) {
      throw new HttpsError(
        "invalid-argument",
        "Created date must be on or before the delivery due date."
      );
    }
  } else {
    deliveryDays = 45;
  }

  const workflowOnlyCreator = nvWorkflowOnlyContext(context);
  const advancedFinanceEnabled = billingEntitlementsForCompany(context.companyData || {}).advancedFinanceEnabled === true && !workflowOnlyCreator;
  const paidAmount = workflowOnlyCreator ? 0 : nvCleanNumber(args.paidAmount ?? args.depositPaid ?? 0);
  const totalPrice = workflowOnlyCreator ? 0 : nvCleanNumber(args.totalPrice ?? args.price ?? 0);
  const remainingAmount = workflowOnlyCreator ? 0 : nvCleanNumber(args.remainingAmount ?? Math.max(0, totalPrice - paidAmount));

  const history = [
    nvHistoryItem("Order Created", "-", `${context.email || context.uid || "User"} created this order from ChatGPT.`)
  ];

  if (designBrief) {
    history.push(nvHistoryItem("Design Brief", "-", designBrief.slice(0, 900)));
  }

  return {
    companyId: context.companyId,
    paymentMethod: nvCleanString(args.paymentMethod || "Card", 120),
    customerName,
    paymentDate,
    ...(deliveryDueDate ? { deliveryDueDate: admin.firestore.Timestamp.fromDate(deliveryDueDate) } : {}),
    paidAmount,
    remainingAmount,
    watchPurchasePrice: nvCleanNumber(args.watchPurchasePrice || 0),
    watchRef: watchModel,
    deliveryTime: deliveryDays,
    designName: nvCleanString(args.designName || args.projectName || "", 240),
    designLink: nvCleanString(args.designLink || "", 1000),
    communication: Array.isArray(args.communication) ? args.communication.map((item) => nvCleanString(item, 80)).filter(Boolean).slice(0, 20) : [],
    emailAddress: nvCleanString(args.emailAddress || args.email || "", 240).toLowerCase(),
    instagramUsername: nvCleanString(args.instagramUsername || args.instagram || "", 160),
    whatsappNumber: nvCleanString(args.whatsappNumber || args.phone || args.whatsapp || "", 120),
    notes: designBrief,
    designStatus: nvCleanString(args.designStatus || "Not Yet", 120),
    status: nvCleanString(args.status || "Not Yet", 120),
    isDispatched: Boolean(args.isDispatched),
    trackingNumber: nvCleanString(args.trackingNumber || "", 160),
    courier: nvCleanString(args.courier || "Auto Detect", 120) || "Auto Detect",
    isDelivered: Boolean(args.isDelivered),
    paymentFee: advancedFinanceEnabled ? nvCleanNumber(args.paymentFee || 0) : 0,
    deliveryCost: advancedFinanceEnabled ? nvCleanNumber(args.deliveryCost || 0) : 0,
    taxType: advancedFinanceEnabled ? nvCleanString(args.taxType || "", 80) : "",
    extraStatuses: args.extraStatuses && typeof args.extraStatuses === "object" && !Array.isArray(args.extraStatuses) ? args.extraStatuses : {},
    taxRate: advancedFinanceEnabled ? nvCleanNumber(args.taxRate || 0) : 0,
    invBool1: Boolean(args.invBool1),
    invBool2: Boolean(args.invBool2),
    invBool3: Boolean(args.invBool3),
    invBool4: Boolean(args.invBool4),
    invNotes: nvCleanString(args.invNotes || "", 1000),
    taxAmount: advancedFinanceEnabled ? nvCleanNumber(args.taxAmount || 0) : 0,
    priority: nvCleanString(args.priority || "Normal", 80) || "Normal",
    risk: nvCleanString(args.risk || "None", 80) || "None",
    riskReason: nvCleanString(args.riskReason || "-", 500) || "-",
    customFields: args.customFields && typeof args.customFields === "object" && !Array.isArray(args.customFields) ? args.customFields : {},
    customToggles: args.customToggles && typeof args.customToggles === "object" && !Array.isArray(args.customToggles) ? args.customToggles : {},
    historyLog: history,
    clientFiles: [],
    todoItems: [],
    workSessions: [],
    assignedToUid: workflowOnlyCreator ? context.uid : nvCleanString(args.assignedToUid || "", 160),
    assignedToEmail: workflowOnlyCreator ? String(context.email || "").toLowerCase() : nvCleanString(args.assignedToEmail || "", 240).toLowerCase(),
    createdByWorkflowOnly: workflowOnlyCreator,
    createdByUid: context.uid,
    createdByEmail: context.email || "",
    createdFrom: "chatgpt",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
}

async function nvChatGPTCreateOrder(context, args = {}) {
  nvRequireWriteAccess(context);
  const ref = admin.firestore().collection("siparisler").doc();
  const payload = nvOrderDefaults(args, context);
  await ref.set(payload, { merge: true });
  return {
    ok: true,
    action: "create_order",
    order: nvSafeOrderForChatGPT({ id: ref.id, data: () => payload })
  };
}

async function nvChatGPTSearchOrders(context, args = {}) {
  const rawQuery = nvCleanString(args.query || args.keyword || "", 240).toLowerCase();
  const status = nvCleanString(args.status || "", 120).toLowerCase();
  const limit = Math.min(Math.max(Number(args.limit || 30), 1), 100);

  let ordersQuery = admin.firestore()
    .collection("siparisler")
    .where("companyId", "==", context.companyId);
  if (nvWorkflowOnlyContext(context)) {
    ordersQuery = ordersQuery.where("assignedToUid", "==", context.uid);
  }
  const snap = await ordersQuery.limit(250).get();

  let orders = snap.docs.map(nvSafeOrderForChatGPT);

  if (rawQuery) {
    orders = orders.filter((order) => {
      const haystack = [
        order.id,
        order.customerName,
        order.emailAddress,
        order.instagramUsername,
        order.whatsappNumber,
        order.watchRef,
        order.designName,
        order.notes,
        order.status,
        order.designStatus
      ].join(" ").toLowerCase();
      return haystack.includes(rawQuery);
    });
  }

  if (status) {
    orders = orders.filter((order) => String(order.status || "").toLowerCase().includes(status));
  }

  orders = orders.slice(0, limit);
  return { ok: true, action: "search_orders", count: orders.length, orders };
}

async function nvChatGPTGetOrderDetail(context, args = {}) {
  const orderId = nvCleanString(args.orderId || args.id || "", 160);
  if (!orderId) throw new HttpsError("invalid-argument", "orderId is required.");
  const ref = admin.firestore().collection("siparisler").doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Order not found.");
  const data = snap.data() || {};
  if (String(data.companyId || "") !== context.companyId) {
    throw new HttpsError("permission-denied", "This order belongs to another workspace.");
  }
    nvRequireWorkflowAssignedOrder(context, data);
  return { ok: true, action: "get_order_detail", order: nvSafeOrderForChatGPT(snap) };
}

async function nvChatGPTAddOrderNote(context, args = {}) {
  nvRequireWriteAccess(context);
  const orderId = nvCleanString(args.orderId || args.id || "", 160);
  const noteText = nvCleanString(args.note || args.text || "", 5000);
  if (!orderId || !noteText) {
    throw new HttpsError("invalid-argument", "orderId and note are required.");
  }

  const ref = admin.firestore().collection("siparisler").doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Order not found.");
  const data = snap.data() || {};
  if (String(data.companyId || "") !== context.companyId) {
    throw new HttpsError("permission-denied", "This order belongs to another workspace.");
  }

  nvRequireWorkflowAssignedOrder(context, data);

  const previousNotes = String(data.notes || "");
  const mergedNotes = previousNotes ? `${previousNotes}\n\n${noteText}` : noteText;
  await ref.set({
    notes: mergedNotes,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    historyLog: admin.firestore.FieldValue.arrayUnion(
      nvHistoryItem("Special Notes", "-", noteText.slice(0, 900))
    )
  }, { merge: true });

  return { ok: true, action: "add_order_note", orderId };
}

async function nvChatGPTUpdateOrderStatus(context, args = {}) {
  nvRequireWriteAccess(context);
  const orderId = nvCleanString(args.orderId || args.id || "", 160);
  const status = nvCleanString(args.status || "", 160);
  const designStatus = nvCleanString(args.designStatus || "", 160);
  if (!orderId || (!status && !designStatus)) {
    throw new HttpsError("invalid-argument", "orderId and status or designStatus are required.");
  }

  const ref = admin.firestore().collection("siparisler").doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Order not found.");
  const data = snap.data() || {};
  if (String(data.companyId || "") !== context.companyId) {
    throw new HttpsError("permission-denied", "This order belongs to another workspace.");
  }

  nvRequireWorkflowAssignedOrder(context, data);

  const update = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  const historyItems = [];
  if (status) {
    update.status = status;
    historyItems.push(nvHistoryItem("Order Status", data.status || "-", status));
  }
  if (designStatus) {
    update.designStatus = designStatus;
    historyItems.push(nvHistoryItem("Design Status", data.designStatus || "-", designStatus));
  }
  if (historyItems.length > 0) {
    update.historyLog = admin.firestore.FieldValue.arrayUnion(...historyItems);
  }

  await ref.set(update, { merge: true });
  return { ok: true, action: "update_order_status", orderId, status: status || data.status || "", designStatus: designStatus || data.designStatus || "" };
}

async function nvPersonalNoteRefForChatGPT(context, noteId = "") {
  const cleanNoteId = nvCleanString(noteId || "", 180);
  if (!cleanNoteId) throw new HttpsError("invalid-argument", "noteId is required.");
  return personalNoteDocRef(context.companyId, context.uid, cleanNoteId);
}

function nvSafePersonalNoteForChatGPT(docOrData = {}) {
  const id = docOrData.id || docOrData.noteId || "";
  const data = typeof docOrData.data === "function" ? (docOrData.data() || {}) : (docOrData || {});
  return {
    id,
    noteId: id,
    companyId: String(data.companyId || ""),
    userId: String(data.userId || ""),
    ownerUserId: String(data.ownerUserId || ""),
    ownerEmail: String(data.ownerEmail || ""),
    ownerName: String(data.ownerName || ""),
    title: String(data.title || ""),
    text: String(data.text || ""),
    colorName: String(data.colorName || "default"),
    isPinned: Boolean(data.isPinned),
    isArchived: Boolean(data.isArchived),
    isDeleted: Boolean(data.isDeleted),
    labels: Array.isArray(data.labels) ? data.labels.map((item) => String(item || "")).filter(Boolean).slice(0, 80) : [],
    links: Array.isArray(data.links) ? data.links.map((item) => String(item || "")).filter(Boolean).slice(0, 80) : [],
    collaboratorEmails: Array.isArray(data.collaboratorEmails) ? data.collaboratorEmails.map((item) => String(item || "")).filter(Boolean).slice(0, 80) : [],
    sharedWith: Array.isArray(data.sharedWith) ? data.sharedWith.map((item) => String(item || "")).filter(Boolean).slice(0, 80) : [],
    reminderDateMillis: data.reminderDate && typeof data.reminderDate.toMillis === "function" ? data.reminderDate.toMillis() : (Number.isFinite(Number(data.reminderDateMillis)) ? Number(data.reminderDateMillis) : null),
    createdAtMillis: data.createdAt && typeof data.createdAt.toMillis === "function" ? data.createdAt.toMillis() : (Number.isFinite(Number(data.createdAtMillis)) ? Number(data.createdAtMillis) : null),
    updatedAtMillis: data.updatedAt && typeof data.updatedAt.toMillis === "function" ? data.updatedAt.toMillis() : (Number.isFinite(Number(data.updatedAtMillis)) ? Number(data.updatedAtMillis) : null)
  };
}

function nvPersonalNotePayloadFromChatGPT(context, args = {}, existing = null) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const payload = {
    title: nvCleanString(args.title || args.name || existing?.title || "", 500),
    text: nvCleanString(args.text || args.content || args.body || existing?.text || "", 20000),
    colorName: nvCleanString(args.colorName || args.color || existing?.colorName || "default", 80) || "default",
    ownerUserId: context.uid,
    ownerEmail: context.email || "",
    ownerName: nvCleanString(args.ownerName || existing?.ownerName || "", 240),
    companyId: context.companyId,
    userId: context.uid,
    sharedWith: Array.isArray(existing?.sharedWith) ? existing.sharedWith : [],
    collaboratorEmails: Array.isArray(existing?.collaboratorEmails) ? existing.collaboratorEmails : [],
    activeEditorUserId: "",
    activeEditorEmail: "",
    isPinned: args.isPinned === undefined ? Boolean(existing?.isPinned) : Boolean(args.isPinned),
    isArchived: args.isArchived === undefined ? Boolean(existing?.isArchived) : Boolean(args.isArchived),
    isDeleted: args.isDeleted === undefined ? Boolean(existing?.isDeleted) : Boolean(args.isDeleted),
    labels: cleanPersonalNoteStringArray(args.labels || existing?.labels || [], 80, 160),
    links: cleanPersonalNoteStringArray(args.links || existing?.links || [], 80, 1000),
    manualOrder: Number.isFinite(Number(existing?.manualOrder)) ? Number(existing.manualOrder) : Date.now(),
    updatedAt: now,
    source: "chatgpt"
  };
  if (!existing) payload.createdAt = now;

  if (Number.isFinite(Number(args.reminderDateMillis))) {
    payload.reminderDate = admin.firestore.Timestamp.fromMillis(Number(args.reminderDateMillis));
  } else if (args.reminderDate) {
    const parsed = Date.parse(String(args.reminderDate));
    if (Number.isFinite(parsed)) payload.reminderDate = admin.firestore.Timestamp.fromMillis(parsed);
  }
  return payload;
}

async function nvChatGPTCreateNote(context, args = {}) {
  const title = nvCleanString(args.title || args.name || "", 500);
  const text = nvCleanString(args.text || args.content || args.body || "", 20000);
  if (!title && !text) throw new HttpsError("invalid-argument", "title or text is required.");

  const ref = personalNoteDocRef(context.companyId, context.uid, admin.firestore().collection("_").doc().id);
  const payload = nvPersonalNotePayloadFromChatGPT(context, args, null);
  await ref.set(payload, { merge: true });

  return { ok: true, action: "create_note", noteId: ref.id, note: nvSafePersonalNoteForChatGPT({ id: ref.id, data: () => payload }) };
}

async function nvChatGPTSearchNotes(context, args = {}) {
  const q = nvCleanString(args.query || args.keyword || "", 240).toLowerCase();
  const includeArchived = Boolean(args.includeArchived);
  const includeDeleted = Boolean(args.includeDeleted);
  const limit = Math.min(Math.max(Number(args.limit || 20), 1), 100);

  const snap = await admin.firestore()
    .collection("companies")
    .doc(context.companyId)
    .collection("personal_notes")
    .doc(context.uid)
    .collection("notes")
    .limit(250)
    .get();

  let notes = snap.docs.map(nvSafePersonalNoteForChatGPT)
    .filter((note) => includeArchived || !note.isArchived)
    .filter((note) => includeDeleted || !note.isDeleted);

  if (q) {
    notes = notes.filter((note) => {
      const haystack = [note.id, note.title, note.text, ...(Array.isArray(note.labels) ? note.labels : [])].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }

  notes = notes
    .sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return Number(b.updatedAtMillis || 0) - Number(a.updatedAtMillis || 0);
    })
    .slice(0, limit);

  return { ok: true, action: "search_notes", count: notes.length, notes };
}

async function nvChatGPTGetNoteDetail(context, args = {}) {
  const noteId = nvCleanString(args.noteId || args.id || "", 180);
  const ref = nvPersonalNoteRefForChatGPT(context, noteId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Note not found.");
  return { ok: true, action: "get_note_detail", noteId, note: nvSafePersonalNoteForChatGPT(snap) };
}

async function nvChatGPTAppendNote(context, args = {}) {
  const noteId = nvCleanString(args.noteId || args.id || "", 180);
  const appendText = nvCleanString(args.text || args.content || args.appendText || "", 10000);
  if (!noteId || !appendText) throw new HttpsError("invalid-argument", "noteId and text are required.");

  const ref = nvPersonalNoteRefForChatGPT(context, noteId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Note not found.");
  const data = snap.data() || {};
  const previousText = String(data.text || "");
  const nextText = previousText ? `${previousText}\n\n${appendText}` : appendText;
  await ref.set({ text: nextText, updatedAt: admin.firestore.FieldValue.serverTimestamp(), source: "chatgpt" }, { merge: true });

  return { ok: true, action: "append_note", noteId, note: { ...nvSafePersonalNoteForChatGPT(snap), text: nextText } };
}

async function nvChatGPTUpdateNote(context, args = {}) {
  const noteId = nvCleanString(args.noteId || args.id || "", 180);
  if (!noteId) throw new HttpsError("invalid-argument", "noteId is required.");

  const ref = nvPersonalNoteRefForChatGPT(context, noteId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Note not found.");
  const existing = snap.data() || {};

  const update = { updatedAt: admin.firestore.FieldValue.serverTimestamp(), source: "chatgpt" };
  if (args.title !== undefined || args.name !== undefined) update.title = nvCleanString(args.title || args.name || "", 500);
  if (args.text !== undefined || args.content !== undefined || args.body !== undefined) update.text = nvCleanString(args.text || args.content || args.body || "", 20000);
  if (args.colorName !== undefined || args.color !== undefined) update.colorName = nvCleanString(args.colorName || args.color || "default", 80) || "default";
  if (args.labels !== undefined) update.labels = cleanPersonalNoteStringArray(args.labels, 80, 160);
  if (args.links !== undefined) update.links = cleanPersonalNoteStringArray(args.links, 80, 1000);

  if (Object.keys(update).length <= 2) throw new HttpsError("invalid-argument", "Provide at least one field to update: title, text, labels, links, or colorName.");
  await ref.set(update, { merge: true });
  return { ok: true, action: "update_note", noteId, note: nvSafePersonalNoteForChatGPT({ id: noteId, data: () => ({ ...existing, ...update }) }) };
}

async function nvChatGPTPinNote(context, args = {}) {
  const noteId = nvCleanString(args.noteId || args.id || "", 180);
  if (!noteId) throw new HttpsError("invalid-argument", "noteId is required.");
  const isPinned = Boolean(args.isPinned ?? args.pinned ?? true);
  const ref = nvPersonalNoteRefForChatGPT(context, noteId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Note not found.");
  await ref.set({ isPinned, updatedAt: admin.firestore.FieldValue.serverTimestamp(), source: "chatgpt" }, { merge: true });
  return { ok: true, action: "pin_note", noteId, isPinned };
}

async function nvChatGPTArchiveNote(context, args = {}) {
  const noteId = nvCleanString(args.noteId || args.id || "", 180);
  if (!noteId) throw new HttpsError("invalid-argument", "noteId is required.");
  const isArchived = Boolean(args.isArchived ?? args.archived ?? true);
  const ref = nvPersonalNoteRefForChatGPT(context, noteId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Note not found.");
  await ref.set({ isArchived, updatedAt: admin.firestore.FieldValue.serverTimestamp(), source: "chatgpt" }, { merge: true });
  return { ok: true, action: "archive_note", noteId, isArchived };
}


function nvChatGPTDispatchAction(context, action = "", args = {}) {
  switch (String(action || "").trim()) {
    case "create_order":
      return nvChatGPTCreateOrder(context, args);
    case "search_orders":
      return nvChatGPTSearchOrders(context, args);
    case "get_order_detail":
      return nvChatGPTGetOrderDetail(context, args);
    case "add_order_note":
      return nvChatGPTAddOrderNote(context, args);
    case "update_order_status":
      return nvChatGPTUpdateOrderStatus(context, args);
    case "create_note":
      return nvChatGPTCreateNote(context, args);
    case "search_notes":
      return nvChatGPTSearchNotes(context, args);
    case "get_note_detail":
      return nvChatGPTGetNoteDetail(context, args);
    case "append_note":
      return nvChatGPTAppendNote(context, args);
    case "update_note":
      return nvChatGPTUpdateNote(context, args);
    case "pin_note":
      return nvChatGPTPinNote(context, args);
    case "archive_note":
      return nvChatGPTArchiveNote(context, args);
    case "get_order_financials":
      return nvChatGPTGetOrderFinancials(context, args);
    case "get_dashboard_summary":
      return nvChatGPTGetDashboardSummary(context, args);
    case "get_financial_overview":
      return nvChatGPTGetFinancialOverview(context, args);
    case "get_extra_spending_overview":
      return nvChatGPTGetExtraSpendingOverview(context, args);
    default:
      throw new HttpsError("invalid-argument", "Unknown action. Supported actions: create_order, search_orders, get_order_detail, add_order_note, update_order_status, create_note, search_notes, get_note_detail, append_note, update_note, pin_note, archive_note, get_order_financials, get_dashboard_summary, get_financial_overview, get_extra_spending_overview, get_extra_spending_overview.");
  }
}



// MARK: - ChatGPT OAuth skeleton

const NV_CHATGPT_OAUTH_CODE_TTL_MS = 10 * 60 * 1000;
// Keep ChatGPT connector access stable for a private workspace integration.
// Users can still revoke access by reconnecting/removing the connector.
const NV_CHATGPT_OAUTH_ACCESS_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const NV_CHATGPT_OAUTH_ISSUER_NAME = "NivaDesk";
const NV_CHATGPT_PUBLIC_BASE_URL = "https://nivadesk.app";
const NV_CHATGPT_LOGIN_URL = `${NV_CHATGPT_PUBLIC_BASE_URL}/chatgpt/connect`;

function nvBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function nvRandomToken(byteLength = 32) {
  return nvBase64Url(crypto.randomBytes(byteLength));
}

function nvSha256(value = "") {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function nvChatGPTOAuthCodesRef() {
  return admin.firestore().collection("chatgptOAuthCodes");
}

function nvChatGPTOAuthTokensRef() {
  return admin.firestore().collection("chatgptOAuthTokens");
}

function nvSafeOAuthUri(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (!["https:", "http:"].includes(url.protocol)) return "";
    return url.toString();
  } catch (_) {
    return "";
  }
}

function nvOAuthBaseUrl(_req) {
  // Public ChatGPT App review must expose one stable production origin.
  // Keep OAuth discovery, MCP metadata and authorization redirects on nivadesk.app.
  return NV_CHATGPT_PUBLIC_BASE_URL;
}

function nvOAuthEndpointUrl(req, functionName = "") {
  const base = nvOAuthBaseUrl(req);
  const cleanFunctionName = String(functionName || "").replace(/^\/+/, "");
  return `${base}/${cleanFunctionName}`;
}

function nvOAuthProtectedResourceMetadata(req) {
  const resource = nvOAuthEndpointUrl(req, "chatgptMcp");
  return {
    resource,
    // OAuth authorization server issuer base URL.
    // ChatGPT discovers /.well-known/oauth-authorization-server from this origin.
    authorization_servers: [
      NV_CHATGPT_PUBLIC_BASE_URL
    ],
    bearer_methods_supported: ["header"],
    scopes_supported: [
      "orders.read",
      "orders.write",
      "notes.read",
      "notes.write",
      "finance.read",
      "tasks.write"
    ],
    resource_documentation: `${NV_CHATGPT_PUBLIC_BASE_URL}/privacy`
  };
}

function nvOAuthAuthorizationServerMetadata(req) {
  const issuer = NV_CHATGPT_PUBLIC_BASE_URL;
  return {
    issuer,
    authorization_endpoint: nvOAuthEndpointUrl(req, "chatgptOAuthAuthorize"),
    token_endpoint: nvOAuthEndpointUrl(req, "chatgptOAuthToken"),
    client_id_metadata_document_supported: true,
    registration_endpoint: nvOAuthEndpointUrl(req, "chatgptOAuthRegister"),
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [
      "orders.read",
      "orders.write",
      "notes.read",
      "notes.write",
      "finance.read",
      "tasks.write"
    ],
    service_documentation: `${NV_CHATGPT_PUBLIC_BASE_URL}/privacy`,
    ui_locales_supported: ["en", "tr"]
  };
}

function nvOAuthJson(res, status, payload = {}) {
  res.status(status).json({
    ...payload,
    server: NV_CHATGPT_OAUTH_ISSUER_NAME
  });
}

function nvOAuthHtmlEscape(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nvOAuthExtractClientId(req) {
  return nvCleanString(req.query?.client_id || req.body?.client_id || "", 500);
}

function nvOAuthExtractRedirectUri(req) {
  return nvSafeOAuthUri(req.query?.redirect_uri || req.body?.redirect_uri || "");
}

function nvOAuthExtractScope(req) {
  return nvCleanString(req.query?.scope || req.body?.scope || "orders.read orders.write", 500);
}

function nvOAuthExtractState(req) {
  return nvCleanString(req.query?.state || req.body?.state || "", 2000);
}

function nvOAuthExtractCodeChallenge(req) {
  return nvCleanString(req.query?.code_challenge || req.body?.code_challenge || "", 500);
}

function nvOAuthExtractCodeChallengeMethod(req) {
  return nvCleanString(req.query?.code_challenge_method || req.body?.code_challenge_method || "", 50);
}

function nvOAuthValidateAuthorizeParams(req) {
  const responseType = nvCleanString(req.query?.response_type || req.body?.response_type || "", 80);
  const clientId = nvOAuthExtractClientId(req);
  const redirectUri = nvOAuthExtractRedirectUri(req);
  const scope = nvOAuthExtractScope(req);
  const state = nvOAuthExtractState(req);
  const codeChallenge = nvOAuthExtractCodeChallenge(req);
  const codeChallengeMethod = nvOAuthExtractCodeChallengeMethod(req);

  if (responseType !== "code") {
    return { ok: false, error: "unsupported_response_type", message: "response_type must be code." };
  }
  if (!clientId) {
    return { ok: false, error: "invalid_request", message: "client_id is required." };
  }
  if (!redirectUri) {
    return { ok: false, error: "invalid_request", message: "redirect_uri must be a valid URL." };
  }
  if (!codeChallenge || codeChallengeMethod !== "S256") {
    return { ok: false, error: "invalid_request", message: "PKCE S256 code_challenge is required." };
  }

  return {
    ok: true,
    clientId,
    redirectUri,
    scope,
    state,
    codeChallenge,
    codeChallengeMethod
  };
}

function nvOAuthVerifyPkce(codeVerifier = "", expectedChallenge = "") {
  const verifier = String(codeVerifier || "").trim();
  const expected = String(expectedChallenge || "").trim();
  if (!verifier || !expected) return false;
  const challenge = nvBase64Url(crypto.createHash("sha256").update(verifier, "utf8").digest());
  return challenge === expected;
}

async function nvOAuthCreateCodeRecord(data = {}) {
  const rawCode = nvRandomToken(32);
  const codeHash = nvSha256(rawCode);
  const nowMs = Date.now();
  await nvChatGPTOAuthCodesRef().doc(codeHash).set({
    clientId: String(data.clientId || ""),
    redirectUri: String(data.redirectUri || ""),
    scope: String(data.scope || ""),
    codeChallenge: String(data.codeChallenge || ""),
    codeChallengeMethod: String(data.codeChallengeMethod || "S256"),
    uid: String(data.uid || ""),
    email: String(data.email || ""),
    companyId: String(data.companyId || ""),
    createdAtMs: nowMs,
    expiresAtMs: nowMs + NV_CHATGPT_OAUTH_CODE_TTL_MS,
    consumedAtMs: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    source: "chatgptOAuthAuthorize"
  }, { merge: true });
  return rawCode;
}

async function nvOAuthCreateAccessToken(data = {}) {
  const rawToken = nvRandomToken(48);
  const tokenHash = nvSha256(rawToken);
  const nowMs = Date.now();
  await nvChatGPTOAuthTokensRef().doc(tokenHash).set({
    clientId: String(data.clientId || ""),
    scope: String(data.scope || ""),
    uid: String(data.uid || ""),
    email: String(data.email || ""),
    companyId: String(data.companyId || ""),
    createdAtMs: nowMs,
    expiresAtMs: nowMs + NV_CHATGPT_OAUTH_ACCESS_TOKEN_TTL_MS,
    revokedAtMs: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    source: "chatgptOAuthToken"
  }, { merge: true });

  return {
    accessToken: rawToken,
    expiresIn: Math.floor(NV_CHATGPT_OAUTH_ACCESS_TOKEN_TTL_MS / 1000)
  };
}

async function nvResolveChatGPTOAuthBearer(req) {
  const authHeader = String(req.get("authorization") || req.get("Authorization") || "").trim();
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  const rawToken = authHeader.slice(7).trim();
  if (!rawToken) return null;

  const tokenHash = nvSha256(rawToken);
  const tokenSnap = await nvChatGPTOAuthTokensRef().doc(tokenHash).get();
  if (!tokenSnap.exists) return null;

  const tokenData = tokenSnap.data() || {};
  const nowMs = Date.now();
  if (Number(tokenData.revokedAtMs || 0) > 0) return null;
  if (Number(tokenData.expiresAtMs || 0) <= nowMs) return null;

  return {
    uid: String(tokenData.uid || ""),
    email: String(tokenData.email || ""),
    companyId: String(tokenData.companyId || ""),
    scope: String(tokenData.scope || ""),
    clientId: String(tokenData.clientId || ""),
    tokenHash
  };
}

async function nvRequireChatGPTWorkspaceAccessWithOAuth(req, companyId = "") {
  const oauth = await nvResolveChatGPTOAuthBearer(req);
  if (oauth?.uid) {
    const cleanCompanyId = String(oauth.companyId || companyId || "").trim();
    if (!cleanCompanyId) {
      throw new HttpsError("invalid-argument", "companyId is required.");
    }

    const companyRef = admin.firestore().collection("companies").doc(cleanCompanyId);
    const companySnap = await companyRef.get();
    if (!companySnap.exists) {
      throw new HttpsError("not-found", "Workspace not found.");
    }

    const companyData = companySnap.data() || {};
    companyData.__workspaceId = cleanCompanyId;
    if (!uidHasCompanyAccess(companyData, oauth.uid)) {
      throw new HttpsError("permission-denied", "You do not have access to this workspace.");
    }

    return {
      uid: oauth.uid,
      email: oauth.email,
      companyId: cleanCompanyId,
      companyRef,
      companyData,
      authType: "chatgpt_oauth",
      scope: oauth.scope
    };
  }

  return nvRequireChatGPTWorkspaceAccess(req, companyId);
}

exports.chatgptOAuthProtectedResource = onRequest({ region: "europe-west2", cors: true }, async (req, res) => {
  if (nvChatCors(req, res)) return;
  nvOAuthJson(res, 200, nvOAuthProtectedResourceMetadata(req));
});

exports.chatgptOAuthAuthorizationServer = onRequest({ region: "europe-west2", cors: true }, async (req, res) => {
  if (nvChatCors(req, res)) return;
  nvOAuthJson(res, 200, nvOAuthAuthorizationServerMetadata(req));
});

exports.chatgptOAuthRegister = onRequest({ region: "europe-west2", cors: true }, async (req, res) => {
  if (nvChatCors(req, res)) return;
  if (req.method !== "POST") {
    nvOAuthJson(res, 405, { error: "method_not_allowed", message: "Use POST." });
    return;
  }

  const clientId = `chatgpt_${nvRandomToken(18)}`;
  nvOAuthJson(res, 201, {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code"],
    response_types: ["code"],
    scope: "orders.read orders.write notes.read notes.write finance.read tasks.write"
  });
});

exports.chatgptOAuthAuthorize = onRequest({ region: "europe-west2", cors: true }, async (req, res) => {
  if (nvChatCors(req, res)) return;

  const params = nvOAuthValidateAuthorizeParams(req);
  if (!params.ok) {
    nvOAuthJson(res, 400, params);
    return;
  }

  // Safety-first skeleton:
  // This endpoint intentionally does not auto-approve OAuth yet.
  // Next step: redirect to StudioFlow web login, verify Firebase user session,
  // choose workspace, then call nvOAuthCreateCodeRecord and redirect back.
  const loginUrl = NV_CHATGPT_LOGIN_URL;
  if (loginUrl) {
    const login = new URL(loginUrl);
    login.searchParams.set("client_id", params.clientId);
    login.searchParams.set("redirect_uri", params.redirectUri);
    login.searchParams.set("scope", params.scope);
    login.searchParams.set("state", params.state);
    login.searchParams.set("code_challenge", params.codeChallenge);
    login.searchParams.set("code_challenge_method", params.codeChallengeMethod);
    res.redirect(302, login.toString());
    return;
  }

  res.status(501).send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>NivaDesk ChatGPT Connection</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f5f7; color: #1d1d1f; margin: 0; padding: 40px; }
    .card { max-width: 680px; margin: 0 auto; background: white; border-radius: 22px; box-shadow: 0 12px 36px rgba(0,0,0,.08); padding: 28px; }
    h1 { margin-top: 0; font-size: 28px; }
    code { background: #f0f0f2; padding: 2px 6px; border-radius: 6px; }
    .muted { color: #6e6e73; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>NivaDesk ChatGPT connection is prepared</h1>
    <p class="muted">OAuth metadata is active, but the StudioFlow web login callback is not connected yet.</p>
    <p class="muted">Next step: set <code>STUDIOFLOW_CHATGPT_LOGIN_URL</code> to your StudioFlow web <code>/chatgpt/connect</code> page.</p>
    <p class="muted">Client: ${nvOAuthHtmlEscape(params.clientId)}</p>
  </div>
</body>
</html>`);
});



exports.chatgptOAuthWorkspaces = onRequest({ region: "europe-west2", cors: true }, async (req, res) => {
  if (nvChatCors(req, res)) return;
  if (req.method !== "GET" && req.method !== "POST") {
    nvOAuthJson(res, 405, { error: "method_not_allowed", message: "Use GET or POST." });
    return;
  }

  try {
    const decoded = await nvRequireFirebaseIdToken(req);
    const uid = decoded.uid;
    const email = decoded.email || "";
    const results = new Map();

    async function addWorkspace(companyId) {
      const cleanCompanyId = nvCleanString(companyId || "", 160);
      if (!cleanCompanyId || results.has(cleanCompanyId)) return;

      const snap = await admin.firestore().collection("companies").doc(cleanCompanyId).get();
      if (!snap.exists) return;

      const data = snap.data() || {};
      data.__workspaceId = cleanCompanyId;
      if (!uidHasCompanyAccess(data, uid)) return;

      const memberRoles = data.memberRoles && typeof data.memberRoles === "object" ? data.memberRoles : {};
      const role = String(data.ownerUid || "") === uid
        ? "owner"
        : String(memberRoles[uid] || data.memberAccess?.[uid] || "member");

      results.set(cleanCompanyId, {
        id: cleanCompanyId,
        name: String(data.companyName || data.name || data.appName || "My Studio"),
        role
      });
    }

    const userSnap = await admin.firestore().collection("users").doc(uid).get();
    const userData = userSnap.exists ? userSnap.data() || {} : {};

    await addWorkspace(userData.activeCompanyId);
    await addWorkspace(userData.companyId);
    await addWorkspace(uid);

    const ownedQuery = await admin.firestore()
      .collection("companies")
      .where("ownerUid", "==", uid)
      .limit(25)
      .get();

    for (const doc of ownedQuery.docs) {
      await addWorkspace(doc.id);
    }

    const memberQuery = await admin.firestore()
      .collection("companies")
      .where("memberUids", "array-contains", uid)
      .limit(25)
      .get();

    for (const doc of memberQuery.docs) {
      await addWorkspace(doc.id);
    }

    const workspaces = Array.from(results.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)));

    nvOAuthJson(res, 200, {
      ok: true,
      uid,
      email,
      workspaces
    });
  } catch (error) {
    const status = nvMcpHttpStatusFromHttps(error);
    const message = error?.message || String(error);
    console.error("chatgptOAuthWorkspaces failed:", error?.code || status, message);
    nvOAuthJson(res, status, {
      error: error?.code || "internal",
      message
    });
  }
});


exports.chatgptOAuthApprove = onRequest({ region: "europe-west2", cors: true }, async (req, res) => {
  if (nvChatCors(req, res)) return;
  if (req.method !== "POST") {
    nvOAuthJson(res, 405, { error: "method_not_allowed", message: "Use POST." });
    return;
  }

  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const clientId = nvCleanString(body.client_id || body.clientId || "", 500);
    const redirectUri = nvSafeOAuthUri(body.redirect_uri || body.redirectUri || "");
    const scope = nvCleanString(body.scope || "orders.read orders.write", 500);
    const state = nvCleanString(body.state || "", 2000);
    const codeChallenge = nvCleanString(body.code_challenge || body.codeChallenge || "", 500);
    const codeChallengeMethod = nvCleanString(body.code_challenge_method || body.codeChallengeMethod || "", 50);
    const companyId = nvCleanString(body.companyId || "", 160);

    if (!clientId || !redirectUri || !codeChallenge || codeChallengeMethod !== "S256") {
      nvOAuthJson(res, 400, {
        error: "invalid_request",
        message: "client_id, redirect_uri, code_challenge and code_challenge_method=S256 are required."
      });
      return;
    }

    if (!companyId) {
      nvOAuthJson(res, 400, {
        error: "invalid_request",
        message: "companyId is required."
      });
      return;
    }

    const context = await nvRequireChatGPTWorkspaceAccess(req, companyId);
    const code = await nvOAuthCreateCodeRecord({
      clientId,
      redirectUri,
      scope,
      codeChallenge,
      codeChallengeMethod,
      uid: context.uid,
      email: context.email,
      companyId: context.companyId
    });

    const redirect = new URL(redirectUri);
    redirect.searchParams.set("code", code);
    if (state) redirect.searchParams.set("state", state);

    nvOAuthJson(res, 200, {
      ok: true,
      redirect_uri: redirect.toString(),
      expires_in: Math.floor(NV_CHATGPT_OAUTH_CODE_TTL_MS / 1000),
      companyId: context.companyId
    });
  } catch (error) {
    const status = nvMcpHttpStatusFromHttps(error);
    const message = error?.message || String(error);
    console.error("chatgptOAuthApprove failed:", error?.code || status, message);
    nvOAuthJson(res, status, {
      error: error?.code || "internal",
      message
    });
  }
});


exports.chatgptOAuthToken = onRequest({ region: "europe-west2", cors: true }, async (req, res) => {
  if (nvChatCors(req, res)) return;
  if (req.method !== "POST") {
    nvOAuthJson(res, 405, { error: "method_not_allowed", message: "Use POST." });
    return;
  }

  const grantType = nvCleanString(req.body?.grant_type || "", 80);
  const code = nvCleanString(req.body?.code || "", 500);
  const redirectUri = nvSafeOAuthUri(req.body?.redirect_uri || "");
  const clientId = nvCleanString(req.body?.client_id || "", 500);
  const codeVerifier = nvCleanString(req.body?.code_verifier || "", 500);

  if (grantType !== "authorization_code") {
    nvOAuthJson(res, 400, { error: "unsupported_grant_type", message: "Only authorization_code is supported." });
    return;
  }
  if (!code || !redirectUri || !clientId || !codeVerifier) {
    nvOAuthJson(res, 400, { error: "invalid_request", message: "code, redirect_uri, client_id and code_verifier are required." });
    return;
  }

  const codeHash = nvSha256(code);
  const codeRef = nvChatGPTOAuthCodesRef().doc(codeHash);
  const codeSnap = await codeRef.get();

  if (!codeSnap.exists) {
    nvOAuthJson(res, 400, { error: "invalid_grant", message: "Invalid or expired authorization code." });
    return;
  }

  const codeData = codeSnap.data() || {};
  const nowMs = Date.now();

  if (Number(codeData.consumedAtMs || 0) > 0 || Number(codeData.expiresAtMs || 0) <= nowMs) {
    nvOAuthJson(res, 400, { error: "invalid_grant", message: "Authorization code has expired or was already used." });
    return;
  }
  if (String(codeData.clientId || "") !== clientId || String(codeData.redirectUri || "") !== redirectUri) {
    nvOAuthJson(res, 400, { error: "invalid_grant", message: "Authorization code does not match this client or redirect URI." });
    return;
  }
  if (!nvOAuthVerifyPkce(codeVerifier, codeData.codeChallenge || "")) {
    nvOAuthJson(res, 400, { error: "invalid_grant", message: "PKCE verification failed." });
    return;
  }

  await codeRef.set({
    consumedAtMs: nowMs,
    consumedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  const token = await nvOAuthCreateAccessToken({
    clientId,
    scope: codeData.scope || "",
    uid: codeData.uid || "",
    email: codeData.email || "",
    companyId: codeData.companyId || ""
  });

  nvOAuthJson(res, 200, {
    access_token: token.accessToken,
    token_type: "Bearer",
    expires_in: token.expiresIn,
    scope: codeData.scope || ""
  });
});


// MARK: - ChatGPT MCP endpoint MVP

const NV_MCP_PROTOCOL_VERSION = "2024-11-05";

function nvMcpServerInfo() {
  return {
    name: "NivaDesk",
    version: "0.1.0"
  };
}

function nvMcpText(value = "") {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch (_) {
    return String(value || "");
  }
}

function nvMcpJsonRpcResult(id, result = {}) {
  return {
    jsonrpc: "2.0",
    id: id === undefined ? null : id,
    result
  };
}

function nvMcpJsonRpcError(id, code = -32603, message = "Internal error", data = undefined) {
  const payload = {
    jsonrpc: "2.0",
    id: id === undefined ? null : id,
    error: {
      code,
      message: String(message || "Internal error")
    }
  };
  if (data !== undefined) payload.error.data = data;
  return payload;
}

function nvMcpErrorCodeFromHttps(error = {}) {
  const code = error?.code || "";
  switch (code) {
    case "unauthenticated": return -32001;
    case "permission-denied": return -32003;
    case "not-found": return -32004;
    case "invalid-argument": return -32602;
    default: return -32603;
  }
}

function nvMcpHttpStatusFromHttps(error = {}) {
  const code = error?.code || "";
  switch (code) {
    case "unauthenticated": return 401;
    case "permission-denied": return 403;
    case "not-found": return 404;
    case "invalid-argument": return 400;
    default: return 500;
  }
}

function nvMcpToolContentFromResult(result = {}) {
  const action = String(result.action || "");
  if (action === "create_order") {
    return `Order created: ${result.orderId || result.id || "new order"}`;
  }
  if (action === "search_orders") {
    return `Found ${result.count || 0} order(s).`;
  }
  if (action === "get_order_detail") {
    const order = result.order || {};
    return `Order detail: ${order.customerName || order.id || "order"}`;
  }
  if (action === "add_order_note") {
    return `Note added to order ${result.orderId || ""}.`;
  }
  if (action === "update_order_status") {
    return `Order status updated: ${result.orderId || ""}.`;
  }
  if (action === "create_note") {
    return `Personal note created: ${result.note?.title || result.noteId || "new note"}.`;
  }
  if (action === "search_notes") {
    return `Found ${result.count || 0} note(s).`;
  }
  if (action === "get_note_detail") {
    return `Note detail: ${result.note?.title || result.noteId || "note"}.`;
  }
  if (action === "append_note" || action === "update_note") {
    return `Personal note updated: ${result.noteId || ""}.`;
  }
  if (action === "pin_note") {
    return `Personal note pin state updated: ${result.noteId || ""}.`;
  }
  if (action === "archive_note") {
    return `Personal note archive state updated: ${result.noteId || ""}.`;
  }
  if (action === "get_order_financials") {
    return `Order financials: ${result.financials?.customerName || result.orderId || "order"}.`;
  }
  if (action === "get_dashboard_summary") {
    return `Dashboard summary: ${result.counts?.total || 0} order(s).`;
  }
  if (action === "get_financial_overview") {
    return `Financial overview: ${result.counts?.total || 0} order(s).`;
  }
  return nvMcpText(result);
}

function nvMcpToolResult(result = {}) {
  return {
    content: [
      {
        type: "text",
        text: nvMcpToolContentFromResult(result)
      }
    ],
    structuredContent: result,
    isError: false
  };
}

function nvMcpToolErrorResult(error = {}) {
  const code = error?.code || "internal";
  const message = error?.message || String(error);
  const result = {
    content: [
      {
        type: "text",
        text: message
      }
    ],
    structuredContent: {
      ok: false,
      error: code,
      message
    },
    isError: true
  };

  if (code === "unauthenticated") {
    result._meta = {
      "mcp/www_authenticate": [
        `Bearer resource_metadata="${nvMcpProtectedResourceMetadataUrl()}", error="insufficient_scope", error_description="Sign in to NivaDesk to continue"`
      ]
    };
  }

  return result;
}

function nvMcpOAuthScopesForTool(toolName = "") {
  switch (String(toolName || "")) {
    case "search_orders":
    case "get_order_detail":
      return ["orders.read"];
    case "create_order":
    case "update_order_status":
      return ["orders.write"];
    case "add_order_note":
      return ["orders.write", "notes.write"];
    case "search_notes":
    case "get_note_detail":
      return ["notes.read"];
    case "create_note":
    case "append_note":
    case "update_note":
    case "pin_note":
    case "archive_note":
      return ["notes.write"];
    case "get_order_financials":
    case "get_extra_spending_overview":
    case "get_financial_overview":
      return ["finance.read"];
    case "get_dashboard_summary":
      return ["orders.read", "finance.read"];
    default:
      return ["orders.read"];
  }
}

function nvMcpToolsWithSecuritySchemes() {
  return nvMcpOrderToolSchemas().map((tool) => {
    const securitySchemes = [
      { type: "oauth2", scopes: nvMcpOAuthScopesForTool(tool.name) }
    ];

    return {
      ...tool,
      securitySchemes,
      _meta: {
        ...(tool._meta || {}),
        securitySchemes
      }
    };
  });
}

function nvMcpOrderToolSchemas() {
  return [
    {
      name: "create_order",
      title: "Create order",
      description: "Create a new NivaDesk order in the currently connected workspace. Use the connected workspace automatically. Do not ask for companyId. If the user provides a delivery due date, always pass it as deliveryDueDate in YYYY-MM-DD format. For an already overdue active order, also collect and pass its original created date as paymentDate so Timeline & Delivery and overdue calculations remain accurate. Use this only after the user provides enough order details or confirms creating a draft order.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: [],
        properties: {
          companyId: {
            type: "string",
            description: "Workspace/company ID where the order should be created."
          },
          customerName: {
            type: "string",
            description: "Customer name or project name."
          },
          email: {
            type: "string",
            description: "Customer email address."
          },
          phone: {
            type: "string",
            description: "Customer phone or WhatsApp number."
          },
          instagram: {
            type: "string",
            description: "Customer Instagram username."
          },
          watchModel: {
            type: "string",
            description: "Watch model or reference, for example Rolex Datejust 41."
          },
          designBrief: {
            type: "string",
            description: "Short design brief or customer request."
          },
          designName: {
            type: "string",
            description: "Internal design/project name."
          },
          price: {
            type: "number",
            description: "Total quoted price."
          },
          paidAmount: {
            type: "number",
            description: "Already paid amount, for example deposit amount."
          },
          paymentDate: {
            type: "string",
            description: "Order created/intake date in YYYY-MM-DD format. Required when creating an already overdue active order."
          },
          deliveryDueDate: {
            type: "string",
            description: "Preferred delivery due date field in YYYY-MM-DD format. Always pass this field when the user provides a delivery date."
          },
          dueDate: {
            type: "string",
            description: "Legacy alias for deliveryDueDate in YYYY-MM-DD format. Prefer deliveryDueDate."
          },
          deliveryDays: {
            type: "number",
            description: "Alternative only when no calendar due date was provided: number of days from created date until due."
          },
          status: {
            type: "string",
            description: "Initial order status."
          }
        }
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    {
      name: "search_orders",
      title: "Search orders",
      description: "Search orders in the currently connected workspace by customer name, email, watch model, status, order ID, or keyword. Use the connected workspace automatically. Do not ask for companyId.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: [],
        properties: {
          companyId: {
            type: "string",
            description: "Workspace/company ID to search."
          },
          query: {
            type: "string",
            description: "Search keyword, customer name, email, watch model, or order ID."
          },
          status: {
            type: "string",
            description: "Optional status filter."
          },
          limit: {
            type: "number",
            description: "Maximum number of orders to return. Default is 10."
          }
        }
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    {
      name: "get_order_detail",
      title: "Get order detail",
      description: "Get full safe order details for one order in the currently connected workspace. Use the connected workspace automatically. Do not ask for companyId.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["orderId"],
        properties: {
          companyId: {
            type: "string",
            description: "Workspace/company ID."
          },
          orderId: {
            type: "string",
            description: "Order document ID."
          }
        }
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    {
      name: "add_order_note",
      title: "Add order note",
      description: "Append an internal note to an existing order in the currently connected workspace. This is an order note, not a personal Notes item. Do not ask for companyId.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["orderId", "note"],
        properties: {
          companyId: {
            type: "string",
            description: "Workspace/company ID."
          },
          orderId: {
            type: "string",
            description: "Order document ID."
          },
          note: {
            type: "string",
            description: "Note text to append."
          }
        }
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    {
      name: "update_order_status",
      title: "Update order status",
      description: "Update an order status or design status in the currently connected workspace. Do not ask for companyId. Use only when the user clearly asks to update the order.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["orderId"],
        properties: {
          companyId: {
            type: "string",
            description: "Workspace/company ID."
          },
          orderId: {
            type: "string",
            description: "Order document ID."
          },
          status: {
            type: "string",
            description: "New main order status."
          },
          designStatus: {
            type: "string",
            description: "New design/workflow status."
          }
        }
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    {
      name: "create_note",
      title: "Create personal note",
      description: "Create a new personal Notes item for the connected user in the currently connected workspace. Do not ask for companyId. This is not an order note. Collaboration is not changed automatically.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: [],
        properties: {
          companyId: { type: "string", description: "Optional. Usually omit this; the connected workspace is used automatically." },
          title: { type: "string", description: "Note title." },
          text: { type: "string", description: "Note body/content." },
          labels: { type: "array", items: { type: "string" }, description: "Optional labels." },
          links: { type: "array", items: { type: "string" }, description: "Optional links or image URLs." },
          colorName: { type: "string", description: "Optional color name." },
          isPinned: { type: "boolean", description: "Whether to pin the note." }
        }
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    {
      name: "search_notes",
      title: "Search personal notes",
      description: "Search the connected user's personal Notes in the currently connected workspace. Do not ask for companyId.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: [],
        properties: {
          companyId: { type: "string", description: "Optional. Usually omit this; the connected workspace is used automatically." },
          query: { type: "string", description: "Keyword to search in title, text, labels or note ID." },
          includeArchived: { type: "boolean", description: "Include archived notes." },
          includeDeleted: { type: "boolean", description: "Include deleted notes." },
          limit: { type: "number", description: "Maximum number of notes to return. Default is 20." }
        }
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    {
      name: "get_note_detail",
      title: "Get personal note detail",
      description: "Get one personal note by note ID from the currently connected workspace. Do not ask for companyId.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["noteId"],
        properties: {
          companyId: { type: "string", description: "Optional. Usually omit this; the connected workspace is used automatically." },
          noteId: { type: "string", description: "Personal note document ID." }
        }
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    {
      name: "append_note",
      title: "Append to personal note",
      description: "Append text to an existing personal note for the connected user in the currently connected workspace. Do not ask for companyId. This is not an order note.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["noteId", "text"],
        properties: {
          companyId: { type: "string", description: "Optional. Usually omit this; the connected workspace is used automatically." },
          noteId: { type: "string", description: "Personal note document ID." },
          text: { type: "string", description: "Text to append to the note." }
        }
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    {
      name: "update_note",
      title: "Update personal note",
      description: "Update the title, text, labels, links or color of a personal note in the currently connected workspace. Do not ask for companyId.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["noteId"],
        properties: {
          companyId: { type: "string", description: "Optional. Usually omit this; the connected workspace is used automatically." },
          noteId: { type: "string", description: "Personal note document ID." },
          title: { type: "string", description: "New note title." },
          text: { type: "string", description: "New note text/body." },
          labels: { type: "array", items: { type: "string" }, description: "Replacement labels." },
          links: { type: "array", items: { type: "string" }, description: "Replacement links." },
          colorName: { type: "string", description: "Replacement color name." }
        }
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    {
      name: "pin_note",
      title: "Pin or unpin personal note",
      description: "Pin or unpin a personal note in the currently connected workspace. Do not ask for companyId.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["noteId"],
        properties: {
          companyId: { type: "string", description: "Optional. Usually omit this; the connected workspace is used automatically." },
          noteId: { type: "string", description: "Personal note document ID." },
          isPinned: { type: "boolean", description: "True to pin, false to unpin." }
        }
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    {
      name: "archive_note",
      title: "Archive or unarchive personal note",
      description: "Archive or unarchive a personal note in the currently connected workspace. Do not ask for companyId.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["noteId"],
        properties: {
          companyId: { type: "string", description: "Optional. Usually omit this; the connected workspace is used automatically." },
          noteId: { type: "string", description: "Personal note document ID." },
          isArchived: { type: "boolean", description: "True to archive, false to unarchive." }
        }
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    {
      name: "get_order_financials",
      title: "Get order financials",
      description: "Read the Financial Info card values for one order. You may provide the orderId, or provide query/orderName/customerName so NivaDesk finds the order in the connected workspace. Do not ask the user for companyId. Requires financial access.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: [],
        properties: {
          companyId: {
            type: "string",
            description: "Optional. Usually omit this; the connected workspace is used automatically."
          },
          orderId: {
            type: "string",
            description: "Optional order document ID when already known."
          },
          query: {
            type: "string",
            description: "Order name, customer name or identifying keyword when orderId is not known, for example Ocean Scene Dial."
          },
          orderName: {
            type: "string",
            description: "Optional order/project name alias when orderId is not known."
          },
          customerName: {
            type: "string",
            description: "Optional customer name when orderId is not known."
          }
        }
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    {
      name: "get_dashboard_summary",
      title: "Get dashboard summary",
      description: "Read the connected workspace dashboard summary. ChatGPT App is available on every plan. Free Demo and Lite return permitted basic finance totals (Received, Base Cost and Basic Balance); Pro and Team can return advanced finance when the user role allows it.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: [],
        properties: {
          companyId: {
            type: "string",
            description: "Optional. Usually omit this; the connected workspace is used automatically."
          },
          limit: {
            type: "number",
            description: "Maximum number of orders to scan. Default is 500."
          }
        }
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    {
      name: "get_extra_spending_overview",
      title: "Get extra spending overview",
      description: "Read permitted spending summary data for the connected workspace. Free Demo and Lite return Base Cost only. Pro and Team may include Shipping, Platform Fee, VAT / Tax and custom expenses when the user role allows financial access. Supports thisMonth, thisYear, allTime and customRange.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: [],
        properties: {
          companyId: {
            type: "string",
            description: "Optional. Usually omit this; the connected workspace is used automatically."
          },
          scope: {
            type: "string",
            description: "Optional period: thisMonth, thisYear, allTime, or customRange. Default is thisMonth."
          },
          fromDate: {
            type: "string",
            description: "Start date in YYYY-MM-DD format. Required only when scope is customRange."
          },
          toDate: {
            type: "string",
            description: "End date in YYYY-MM-DD format. Required only when scope is customRange."
          },
          includeBaseCost: {
            type: "boolean",
            description: "Include Base Cost / watch purchase price. Default true."
          },
          includeShipping: {
            type: "boolean",
            description: "Include shipping/delivery cost. Default false."
          },
          includePlatformFee: {
            type: "boolean",
            description: "Include platform/payment fee. Default false."
          },
          includeTax: {
            type: "boolean",
            description: "Include VAT / tax amount. Default false."
          },
          page: {
            type: "number",
            description: "Page number for entry results. Default 1."
          },
          pageSize: {
            type: "number",
            description: "Entries per page. Default 20, maximum 100."
          }
        }
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    {
      name: "get_financial_overview",
      title: "Get financial overview",
      description: "Read workspace-level financial totals, remaining payments, costs and estimated profit. Requires financial access in the connected workspace.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: [],
        properties: {
          companyId: {
            type: "string",
            description: "Optional. Usually omit this; the connected workspace is used automatically."
          },
          limit: {
            type: "number",
            description: "Maximum number of orders to scan. Default is 1000."
          }
        }
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    }
  ];
}

function nvMcpInitializeResult() {
  return {
    protocolVersion: NV_MCP_PROTOCOL_VERSION,
    serverInfo: nvMcpServerInfo(),
    capabilities: {
      tools: {}
    },
    instructions: [
      "This MCP server connects ChatGPT to NivaDesk / StudioFlow workspace order and personal note actions.",
      "Always ask for confirmation before creating or changing important order data when user intent is ambiguous.",
      "Never reveal data from another workspace. Use the workspace selected during NivaDesk sign-in automatically; do not ask the user for companyId.",
      "Respect workspace roles: view-only and workflow-only users cannot create or update orders. Personal note tools only affect the connected user own Notes area; collaboration is not changed automatically."
    ].join("\n")
  };
}

function nvMcpProtectedResourceMetadata(req) {
  return nvOAuthProtectedResourceMetadata(req);
}

function nvMcpProtectedResourceMetadataUrl() {
  return `${NV_CHATGPT_PUBLIC_BASE_URL}/.well-known/oauth-protected-resource`;
}

function nvSendMcpOAuthChallenge(res, message = "Authentication required.") {
  const metadataUrl = nvMcpProtectedResourceMetadataUrl();
  res.set(
    "WWW-Authenticate",
    `Bearer resource_metadata="${metadataUrl}", scope="orders.read notes.read finance.read"`
  );
  res.status(401).json(nvMcpJsonRpcError(null, -32001, message));
}

async function nvHandleMcpToolCall(req, params = {}) {
  const toolName = nvCleanString(params.name || "", 120);
  const args = params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
    ? params.arguments
    : {};
  const companyId = nvCleanString(args.companyId || "", 160);

  if (!toolName) {
    throw new HttpsError("invalid-argument", "Tool name is required.");
  }

  const context = await nvRequireChatGPTWorkspaceAccessWithOAuth(req, companyId);
  return nvChatGPTDispatchAction(context, toolName, args);
}

async function nvHandleMcpRequest(req, body = {}) {
  const id = body.id === undefined ? null : body.id;
  const method = String(body.method || "").trim();
  const params = body.params && typeof body.params === "object" && !Array.isArray(body.params) ? body.params : {};

  switch (method) {
    case "initialize":
      return nvMcpJsonRpcResult(id, nvMcpInitializeResult());

    case "ping":
      return nvMcpJsonRpcResult(id, {});

    case "tools/list":
      return nvMcpJsonRpcResult(id, { tools: nvMcpToolsWithSecuritySchemes() });

    case "tools/call": {
      const requestedToolName = nvCleanString(params.name || "", 120);
      try {
        const result = await nvHandleMcpToolCall(req, params);
        console.info("NivaDesk MCP tool result", JSON.stringify({
          tool: requestedToolName,
          ok: true,
          action: String(result?.action || requestedToolName)
        }));
        return nvMcpJsonRpcResult(id, nvMcpToolResult(result));
      } catch (error) {
        console.warn("NivaDesk MCP tool error", JSON.stringify({
          tool: requestedToolName,
          error: String(error?.code || "internal"),
          message: String(error?.message || "Tool call failed.").slice(0, 240)
        }));
        return nvMcpJsonRpcResult(id, nvMcpToolErrorResult(error));
      }
    }

    default:
      return nvMcpJsonRpcError(id, -32601, `Method not found: ${method || "(empty)"}`);
  }
}

exports.chatgptMcp = onRequest({ region: "europe-west2", cors: true }, async (req, res) => {
  if (nvChatCors(req, res)) return;

  if (req.method === "GET") {
    res.status(200).json({
      ok: true,
      name: "NivaDesk",
      serverInfo: nvMcpServerInfo(),
      protectedResource: nvMcpProtectedResourceMetadata(req),
      tools: nvMcpToolsWithSecuritySchemes().map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        securitySchemes: tool.securitySchemes
      }))
    });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method-not-allowed", message: "Use POST." });
    return;
  }

  // Allow MCP initialize and tools/list so ChatGPT can discover the app.
  // Protected tools enforce OAuth individually and return mcp/www_authenticate when linking is required.
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const response = await nvHandleMcpRequest(req, body);
    res.status(200).json(response);
  } catch (error) {
    const code = nvMcpErrorCodeFromHttps(error);
    const status = nvMcpHttpStatusFromHttps(error);
    const message = error?.message || String(error);
    console.error("chatgptMcp failed:", error?.code || code, message);
    if (status === 401) {
      nvSendMcpOAuthChallenge(res, message);
      return;
    }
    res.status(status).json(nvMcpJsonRpcError(null, code, message));
  }
});


exports.chatgptWorkspaceAction = onRequest({ region: "europe-west2", cors: true }, async (req, res) => {
  if (nvChatCors(req, res)) return;

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method-not-allowed", message: "Use POST." });
    return;
  }

  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const companyId = nvCleanString(body.companyId || "", 160);
    const action = nvCleanString(body.action || "", 120);
    const args = body.arguments && typeof body.arguments === "object" && !Array.isArray(body.arguments) ? body.arguments : {};
    const context = await nvRequireChatGPTWorkspaceAccess(req, companyId);
    const result = await nvChatGPTDispatchAction(context, action, args);
    res.status(200).json(result);
  } catch (error) {
    const code = error?.code || "internal";
    const message = error?.message || String(error);
    const httpStatus =
      code === "unauthenticated" ? 401 :
      code === "permission-denied" ? 403 :
      code === "not-found" ? 404 :
      code === "invalid-argument" ? 400 : 500;

    console.error("chatgptWorkspaceAction failed:", code, message);
    res.status(httpStatus).json({ ok: false, error: code, message });
  }
});
