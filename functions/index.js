const admin = require("firebase-admin");
const crypto = require("crypto");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");

admin.initializeApp();

const TRACK17_TOKEN = defineSecret("TRACK17_TOKEN");
const ROYALMAIL_CLIENT_ID = defineSecret("ROYALMAIL_CLIENT_ID");
const ROYALMAIL_CLIENT_SECRET = defineSecret("ROYALMAIL_CLIENT_SECRET");
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");

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
    "messaging/registration-token-not-registered",
    "messaging/invalid-argument"
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
  const data = toPushStringMap({
    companyId,
    orderId: notification.orderId || "",
    type: notification.type || "update",
    notificationId: notification.notificationId || "",
    trackingNumber: notification.trackingNumber || "",
    carrier: notification.carrier || "",
    priority: notification.priority || "",
    dueAt: notification.dueAt || ""
  });

  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    data,
    apns: {
      headers: { "apns-priority": "10" },
      payload: { aps: { sound: "default", badge: 1 } }
    }
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
    teamMemberLimit: 10,
    clientFilesEnabled: true,
    shareSheetEnabled: true,
    teamAccessEnabled: true,
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

function normalizeBillingPlan(value, fallback = "team_monthly") {
  const raw = String(value || "").trim();
  if (PLAN_ENTITLEMENTS[raw]) return raw;
  return fallback;
}

function billingPlanFromCompanyData(data = {}) {
  // Existing workspaces created before the billing system should not suddenly lose access.
  return normalizeBillingPlan(data.billingPlan, "team_monthly");
}

function billingEntitlementsForCompany(data = {}) {
  const plan = billingPlanFromCompanyData(data);
  return PLAN_ENTITLEMENTS[plan] || PLAN_ENTITLEMENTS.team_monthly;
}

function numericLimit(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
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
  quickReply: true,
  settings: true,
  teamAccess: true,
  clientFiles: true,
  financialInfo: true,
  exportData: true,
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
    access.teamAccess = false;
    access.cardFinancial = false;
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
    merged.teamAccess = false;
    merged.cardFinancial = false;
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
    access.teamAccess = false;
    access.cardFinancial = false;
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

function planLimitsFromEntitlements(entitlements = {}) {
  return {
    orderLimit: numericLimit(entitlements.orderLimit),
    customerLimit: numericLimit(entitlements.customerLimit),
    storageLimitMB: numericLimit(entitlements.storageLimitMB) || 0,
    storageLimitBytes: (numericLimit(entitlements.storageLimitMB) || 0) * 1024 * 1024,
    teamMemberLimit: numericLimit(entitlements.teamMemberLimit) || 1,
    taskLimitPerOrder: numericLimit(entitlements.taskLimitPerOrder)
  };
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
  const limits = planLimitsFromEntitlements(entitlements);
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
  const limits = planLimitsFromEntitlements(entitlements);
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
  const limits = planLimitsFromEntitlements(entitlements);
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

function supportTicketFromDoc(doc, ticketType = "appSupport") {
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
    createdAtMillis: toMillis(data.createdAt),
    updatedAtMillis: toMillis(data.updatedAt),
    lastMessageAtMillis: toMillis(data.lastMessageAt)
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
  payload.supportAdminEmails = Array.from(SUPPORT_ADMIN_EMAILS);
  payload.shareWithWorkspaceOwner = request.data?.shareWithWorkspaceOwner === true;

  await ticketRef.set(payload);
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
    .map((doc) => supportTicketFromDoc(doc, "appSupport"))
    .sort((a, b) => Number(b.createdAtMillis || 0) - Number(a.createdAtMillis || 0));

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
  payload.targetRole = "owner_admin";

  await ticketRef.set(payload);
  return { ok: true, ticketId: ticketRef.id, message: "Workspace ticket sent to the workspace owner." };
});

exports.listWorkspaceTickets = onCall({ region: "europe-west2" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in to read workspace tickets.");
  }

  const { companyId, companyData } = await requireWorkspaceForBilling(request, false);
  const role = normalizeWorkspaceRole(workspaceMemberRole(companyData, uid, "member"), "member");
  const canSeeWorkspaceQueue = uidIsCompanyOwner(companyData, uid) || role === "admin";
  const collection = admin.firestore().collection("companies").doc(companyId).collection("workspaceTickets");
  const query = canSeeWorkspaceQueue ? collection.limit(200) : collection.where("createdByUid", "==", uid).limit(100);
  const snapshot = await query.get();

  const tickets = snapshot.docs
    .map((doc) => supportTicketFromDoc(doc, "workspace"))
    .sort((a, b) => Number(b.createdAtMillis || 0) - Number(a.createdAtMillis || 0));

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
  const role = normalizeWorkspaceRole(workspaceMemberRole(companyData, uid, "member"), "member");
  const canManageWorkspaceQueue = uidIsCompanyOwner(companyData, uid) || role === "admin";
  if (!canManageWorkspaceQueue) {
    throw new HttpsError("permission-denied", "Only the workspace owner or admins can update workspace ticket status.");
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

  await ticketRef.set({
    status,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastStatusChangedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastStatusChangedByUid: uid,
    lastStatusChangedByEmail: supportUserEmail(request)
  }, { merge: true });

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
    authorRole: String(data.authorRole || "user"),
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
    authorRole: "user",
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
    const messages = snapshot.docs.map((doc) => supportTicketMessageFromDoc(doc, ticketId));
    if (messages.length === 0 && ticketData.message) {
      messages.push(supportTicketInitialMessage(ticketId, ticketData, "appSupport"));
    }

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
    if (!ticketId || !message) {
      throw new HttpsError("invalid-argument", "ticketId and message are required.");
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
      ...supportAuthorPayload(request, isAdmin ? "supportAdmin" : "user"),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      source: "callable",
      supportSchemaVersion: 2
    };

    const batch = admin.firestore().batch();
    batch.set(messageRef, payload);
    batch.set(ticketRef, {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageByUid: uid,
      lastMessageByEmail: supportUserEmail(request),
      lastMessageByRole: isAdmin ? "supportAdmin" : "user",
      status: nextStatus
    }, { merge: true });
    await batch.commit();

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
    if (!canReplyWorkspaceTicket(ticketData, companyData, request)) {
      throw new HttpsError("permission-denied", "You do not have access to this workspace ticket.");
    }

    const snapshot = await ticketRef.collection("messages").orderBy("createdAt", "asc").limit(200).get();
    const messages = snapshot.docs.map((doc) => supportTicketMessageFromDoc(doc, ticketId));
    if (messages.length === 0 && ticketData.message) {
      messages.push(supportTicketInitialMessage(ticketId, ticketData, "workspace"));
    }

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
    if (!ticketId || !message) {
      throw new HttpsError("invalid-argument", "ticketId and message are required.");
    }

    const ticketRef = admin.firestore().collection("companies").doc(companyId).collection("workspaceTickets").doc(ticketId);
    const ticketSnap = await ticketRef.get();
    if (!ticketSnap.exists) {
      throw new HttpsError("not-found", "Workspace ticket not found.");
    }

    const ticketData = ticketSnap.data() || {};
    if (!canReplyWorkspaceTicket(ticketData, companyData, request)) {
      throw new HttpsError("permission-denied", "You do not have access to reply to this workspace ticket.");
    }

    const role = normalizeWorkspaceRole(workspaceMemberRole(companyData, uid, "member"), "member");
    const isManager = uidIsCompanyOwner(companyData, uid) || role === "admin";
    const messageRef = ticketRef.collection("messages").doc();
    const currentStatus = String(ticketData.status || "open");
    const nextStatus = isManager ? "waitingForUser" : (["resolved", "closed"].includes(currentStatus) ? "open" : currentStatus);
    const payload = {
      ticketId,
      message,
      ...supportAuthorPayload(request, isManager ? "workspaceAdmin" : "user"),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      source: "callable",
      supportSchemaVersion: 2
    };

    const batch = admin.firestore().batch();
    batch.set(messageRef, payload);
    batch.set(ticketRef, {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageByUid: uid,
      lastMessageByEmail: supportUserEmail(request),
      lastMessageByRole: isManager ? "workspaceAdmin" : "user",
      status: nextStatus
    }, { merge: true });
    await batch.commit();

    return { ok: true, ticketId, messageId: messageRef.id, status: nextStatus, message: "Reply sent." };
  } catch (error) {
    throw supportCallableInternalError("addWorkspaceTicketReply", error);
  }
});

const { createStripeBillingFunctions } = require("./stripeBilling");
Object.assign(exports, createStripeBillingFunctions({
  admin,
  onCall,
  onRequest,
  HttpsError,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
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

function quickReplySettingsFromData(data = {}) {
  return {
    replyMode: cleanQuickReplyMode(data.replyMode, "AI"),
    quickReplyPoliteness: cleanQuickReplyOption(data.quickReplyPoliteness, QUICK_REPLY_POLITENESS, "Warm"),
    quickReplyLength: cleanQuickReplyOption(data.quickReplyLength, QUICK_REPLY_LENGTHS, "Short"),
    aiKnowledgeBase: String(data.aiKnowledgeBase || ""),
    hasOpenAIKey: String(data.openAIKey || "").trim().length > 0,
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
  if (!uidCanEditWorkspaceSettings(companyData, uid)) {
    throw new HttpsError("permission-denied", "Your workspace role cannot edit Quick Reply settings.");
  }
  requireWorkspaceAreaAccess(companyData, uid, "quickReply", "Quick Reply is not enabled for your workspace account.");

  const incoming = request.data?.settings && typeof request.data.settings === "object" ? request.data.settings : {};
  const updates = {
    quickReplySettingsUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
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
  if (Object.prototype.hasOwnProperty.call(incoming, "aiKnowledgeBase")) {
    updates.aiKnowledgeBase = cleanQuickReplyText(incoming.aiKnowledgeBase, 50000);
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "openAIKey")) {
    updates.openAIKey = cleanQuickReplyText(incoming.openAIKey, 500);
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "products")) {
    updates.customProductsJSON = JSON.stringify(cleanQuickReplyTemplateItems(incoming.products));
  }
  if (Object.prototype.hasOwnProperty.call(incoming, "rules")) {
    updates.customRulesJSON = JSON.stringify(cleanQuickReplyTemplateItems(incoming.rules));
  }

  const settingsRef = companySettingsDocRef(companyId);
  await settingsRef.set(updates, { merge: true });
  const settingsSnapshot = await settingsRef.get();

  return {
    ok: true,
    companyId,
    settings: quickReplySettingsFromData(settingsSnapshot.exists ? settingsSnapshot.data() || {} : {}),
    message: "Quick Reply settings saved."
  };
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

  const apiKey = String(settingsData.openAIKey || "").trim();
  const customerMessage = cleanQuickReplyText(request.data?.customerMessage, 12000);
  const knowledge = cleanQuickReplyText(settingsData.aiKnowledgeBase, 50000);

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

  const incoming = request.data?.settings && typeof request.data.settings === "object" ? request.data.settings : {};
  const updates = {
    seciliDil: cleanStudioLanguage(incoming.selectedLanguage, "English"),
    languageSettingsUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  const settingsRef = companySettingsDocRef(companyId);
  await settingsRef.set(updates, { merge: true });
  const settingsSnapshot = await settingsRef.get();
  return {
    ok: true,
    companyId,
    settings: languageSettingsFromData(settingsSnapshot.exists ? settingsSnapshot.data() || {} : {}),
    message: "Language settings saved."
  };
});

exports.saveThemeBrandingSettings = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyData } = await requireWorkspaceForBilling(request, false);
  if (!uidCanEditWorkspaceSettings(companyData, uid)) {
    throw new HttpsError("permission-denied", "Your workspace role cannot edit Theme & Branding.");
  }

  const incoming = request.data?.settings && typeof request.data.settings === "object" ? request.data.settings : {};
  const updates = {
    appTheme: cleanAppTheme(incoming.appTheme, "System"),
    appSubtitle: cleanQuickReplyText(incoming.appSubtitle || "Bespoke Hand-Painted Dials", 120),
    themeBrandingSettingsUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

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
  const limits = planLimitsFromEntitlements(entitlements);
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
    const limits = planLimitsFromEntitlements(entitlements);
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

  const role = workspaceMemberRole(companyData, normalizedUid, "member");
  return canEditOrderStatus(role);
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
  return ["owner", "admin", "member", "workflowOnly"].includes(normalizeWorkspaceRole(role));
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
  const shouldRecalculateTax = changedFields.some((field) => [
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
  const isBasicFinanceOnly = entitlements?.plan === "demo";
  if (isBasicFinanceOnly && changedFields.some((field) => !basicFields.has(field))) {
    throw new HttpsError("failed-precondition", "Advanced financial fields are available from NivaDesk Lite.");
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

  if (!hasOwnField(patch, "paymentFee") && ["orderValue", "paidAmount", "remainingAmount", "fullPaymentReceived"].some((field) => hasOwnField(patch, field))) {
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

  if (cleanTaxRate(orderData.taxRate) !== taxRate) {
    updates.taxRate = taxRate;
    pushHistoryChange(historyEntries, "VAT rate changed", `${cleanTaxRate(orderData.taxRate)}%`, `${taxRate}%`, uid, email);
  }
  if (cleanTaxType(orderData.taxType) !== taxType) {
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
  const limits = planLimitsFromEntitlements(entitlements);
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
  const limits = planLimitsFromEntitlements(entitlements);
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
  const limits = planLimitsFromEntitlements(entitlements);
  const usage = await workspaceBillingUsage(companyId, companyData);
  const validation = validateBillingAction("create_order", entitlements, usage, limits, request.data || {});
  if (!validation.allowed) {
    throw new HttpsError("failed-precondition", "Your current plan has reached its order limit. Upgrade the workspace plan to add more orders.", validation);
  }

  const requestData = request.data || {};
  const customerName = cleanOrderText(requestData.customerName, "New Project", 180) || "New Project";
  const designName = cleanOrderText(requestData.designName, "", 180);

  const orderValue = cleanOrderNumber(requestData.orderValue);
  const paidAmount = Math.min(cleanOrderNumber(requestData.paidAmount), orderValue);
  const remainingAmount = Math.max(orderValue - paidAmount, 0);
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
  const paymentFee = roundMoneyValue((orderValue * cleanPercentageNumber(financialSettings.feePercentage, 3)) / 100);
  const taxType = financialTaxTypeForPaymentDate(financialSettings, paymentDate);
  const taxRate = cleanPercentageNumber(financialSettings.defaultTaxRate, 20);
  const taxAmount = webFinanceTaxAmount({
    paidAmount,
    remainingAmount,
    watchPurchasePrice: 0,
    paymentFee,
    deliveryCost: 0,
    taxRate,
    taxType
  });

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
    assignedToUid: "",
    assignedToEmail: "",
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

exports.deleteWebOrder = onCall({ region: "europe-west2" }, async (request) => {
  const { uid, companyId, companyRef, companyData } = await requireWorkspaceForBilling(request, false);
  const role = normalizeWorkspaceRole(workspaceOrderRole(companyData, uid));
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
    const limits = planLimitsFromEntitlements(entitlements);
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
      updates[field] = decodedOrder[field];
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
  if (!canEditOrderStatus(role)) {
    throw new HttpsError("permission-denied", `Your current role is ${workspaceRoleLabel(role)} and cannot create orders.`);
  }

  const entitlements = billingEntitlementsForCompany(companyData);
  const limits = planLimitsFromEntitlements(entitlements);
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
    orderPayload[field] = decodedOrder[field];
    createdFields.push(field);
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
  const limits = planLimitsFromEntitlements(entitlements);
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
    orderId,
    fileId,
    orderRef: orderDocRef(orderId)
  };
}

function readClientFileFromOrder(orderSnap, companyId, fileId) {
  if (!orderSnap.exists) {
    throw new HttpsError("not-found", "Order not found.");
  }
  const orderData = orderSnap.data() || {};
  if (orderCompanyId(orderData) !== companyId) {
    throw new HttpsError("permission-denied", "This order does not belong to the active workspace.");
  }

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
    const limits = planLimitsFromEntitlements(entitlements);
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
    const { orderData, files, fileIndex, file } = readClientFileFromOrder(orderSnap, context.companyId, context.fileId);
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
    const { orderData, files, fileIndex, file } = readClientFileFromOrder(orderSnap, context.companyId, context.fileId);
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
  const limits = planLimitsFromEntitlements(entitlements);
  const usage = await workspaceBillingUsage(companyId, companyData);
  const validation = validateBillingAction("add_team_member", entitlements, usage, limits, request.data || {});
  if (!validation.allowed) {
    throw new HttpsError("failed-precondition", "This workspace plan cannot add another team member.", validation);
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
    const limits = planLimitsFromEntitlements(entitlements);
    const usage = await workspaceBillingUsage(companyId, companyData);
    const validation = validateBillingAction("add_team_member", entitlements, usage, limits, request.data || {});
    if (!validation.allowed) {
      throw new HttpsError("failed-precondition", "This workspace plan cannot add another team member.", validation);
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
  const limits = planLimitsFromEntitlements(billingEntitlementsForCompany(updatedCompanyData));
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
  const limits = planLimitsFromEntitlements(entitlements);
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
    const limits = planLimitsFromEntitlements(entitlements);
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

    const wooOrderId = cleanWooText(order?.id || order?.number);
    if (!wooOrderId) {
      res.status(400).json({ ok: false, error: "Missing WooCommerce order id." });
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
