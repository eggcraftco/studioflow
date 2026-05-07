import type { SerializableFirestoreDocument, WorkspaceExportData } from "@/lib/studioflow/firestore";

const APP_BACKUP_STRING_KEYS = [
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
] as const;

const APP_BACKUP_BOOL_KEYS = [
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
] as const;

const APP_BACKUP_DOUBLE_KEYS = [
  "feePercentage",
  "defaultTaxRate",
  "taxMilestoneDate",
  "ordersSidebarWidth",
  "colWLeftV3",
  "colWMidV3",
  "colWRightV3"
] as const;

const ORDER_COLUMNS = [
  "id",
  "customerName",
  "designName",
  "status",
  "designStatus",
  "paidAmount",
  "remainingAmount",
  "paymentDate",
  "deliveryTime",
  "clientFileCount",
  "notes"
];

const CUSTOMER_COLUMNS = [
  "id",
  "name",
  "email",
  "phone",
  "address",
  "company",
  "notes"
];

function valueForColumn(document: SerializableFirestoreDocument, column: string) {
  if (column === "id") return document.id;
  if (column === "clientFileCount") {
    const clientFiles = document.data.clientFiles;
    return Array.isArray(clientFiles) ? clientFiles.length : 0;
  }
  const value = document.data[column];
  if (Array.isArray(value) || (value && typeof value === "object")) return JSON.stringify(value);
  return value ?? "";
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integerValue(value: unknown, fallback = 0) {
  return Math.round(numberValue(value, fallback));
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function stringArrayValue(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringMapValue(value: unknown) {
  if (!isPlainObject(value)) return undefined;
  const entries = Object.entries(value)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string");
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function booleanMapValue(value: unknown) {
  if (!isPlainObject(value)) return undefined;
  const entries = Object.entries(value)
    .filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean");
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function swiftIsoDate(value: unknown, fallback: string) {
  let date: Date | null = null;
  if (value instanceof Date) {
    date = value;
  } else if (isPlainObject(value) && typeof value.seconds === "number") {
    date = new Date(value.seconds * 1000);
  } else if (typeof value === "string" || typeof value === "number") {
    date = new Date(value);
  }

  if (!date || Number.isNaN(date.getTime())) date = new Date(fallback);
  if (Number.isNaN(date.getTime())) date = new Date();
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function appBackupSettings(settings: Record<string, unknown>) {
  const strings: Record<string, string> = {};
  const bools: Record<string, boolean> = {};
  const doubles: Record<string, number> = {};

  APP_BACKUP_STRING_KEYS.forEach(key => {
    if (typeof settings[key] === "string") strings[key] = settings[key] as string;
  });
  APP_BACKUP_BOOL_KEYS.forEach(key => {
    if (typeof settings[key] === "boolean") bools[key] = settings[key] as boolean;
  });
  APP_BACKUP_DOUBLE_KEYS.forEach(key => {
    const value = Number(settings[key]);
    if (Number.isFinite(value)) doubles[key] = value;
  });

  return Object.keys(strings).length > 0 || Object.keys(bools).length > 0 || Object.keys(doubles).length > 0
    ? { strings, bools, doubles }
    : undefined;
}

function appBackupOrder(document: SerializableFirestoreDocument, generatedAt: string) {
  const data = document.data;
  return {
    customerName: stringValue(data.customerName, "New Order") || "New Order",
    paymentDate: swiftIsoDate(data.paymentDate, generatedAt),
    paidAmount: numberValue(data.paidAmount),
    remainingAmount: numberValue(data.remainingAmount),
    watchPurchasePrice: numberValue(data.watchPurchasePrice),
    watchRef: stringValue(data.watchRef),
    deliveryTime: integerValue(data.deliveryTime, 45),
    designName: stringValue(data.designName),
    designLink: stringValue(data.designLink),
    communication: stringArrayValue(data.communication),
    emailAddress: stringValue(data.emailAddress),
    instagramUsername: stringValue(data.instagramUsername),
    whatsappNumber: stringValue(data.whatsappNumber),
    notes: stringValue(data.notes),
    designStatus: stringValue(data.designStatus, "Not Yet") || "Not Yet",
    status: stringValue(data.status, "Not Yet") || "Not Yet",
    isDispatched: booleanValue(data.isDispatched),
    trackingNumber: stringValue(data.trackingNumber),
    courier: stringValue(data.courier, "Auto Detect") || "Auto Detect",
    isDelivered: booleanValue(data.isDelivered),
    paymentFee: numberValue(data.paymentFee),
    deliveryCost: numberValue(data.deliveryCost),
    extraStatuses: stringMapValue(data.extraStatuses),
    paymentMethod: stringValue(data.paymentMethod, "Card") || "Card",
    taxRate: numberValue(data.taxRate),
    taxAmount: numberValue(data.taxAmount),
    taxType: stringValue(data.taxType),
    invBool1: booleanValue(data.invBool1),
    invBool2: booleanValue(data.invBool2),
    invBool3: booleanValue(data.invBool3),
    invBool4: booleanValue(data.invBool4),
    invNotes: stringValue(data.invNotes),
    priority: stringValue(data.priority, "Normal") || "Normal",
    risk: stringValue(data.risk, "None") || "None",
    riskReason: stringValue(data.riskReason, "-") || "-",
    customFields: stringMapValue(data.customFields),
    customToggles: booleanMapValue(data.customToggles)
  };
}

function appBackupCustomer(document: SerializableFirestoreDocument) {
  const data = document.data;
  return {
    name: stringValue(data.name || data.customerName),
    phone: stringValue(data.phone || data.whatsappNumber),
    email: stringValue(data.email || data.emailAddress),
    address: stringValue(data.address),
    notes: stringValue(data.notes)
  };
}

export function documentsToCsv(documents: SerializableFirestoreDocument[], columns: string[]) {
  const rows = [
    columns.map(csvEscape).join(","),
    ...documents.map(document => columns.map(column => csvEscape(valueForColumn(document, column))).join(","))
  ];
  return rows.join("\n");
}

export function ordersToCsv(documents: SerializableFirestoreDocument[]) {
  return documentsToCsv(documents, ORDER_COLUMNS);
}

export function customersToCsv(documents: SerializableFirestoreDocument[]) {
  return documentsToCsv(documents, CUSTOMER_COLUMNS);
}

export function fullBackupJson(data: WorkspaceExportData, exportedByEmail: string | null | undefined) {
  return JSON.stringify(
    {
      exportVersion: 1,
      exportedAt: data.generatedAt,
      exportedBy: exportedByEmail ?? null,
      workspace: {
        id: data.workspace.id,
        name: data.workspace.name,
        role: data.workspace.role,
        billingPlan: data.workspace.billingPlan,
        billingPlanName: data.workspace.billingPlanName
      },
      counts: {
        orders: data.orders.length,
        customers: data.customers.length
      },
      orders: data.orders,
      customers: data.customers,
      settings: appBackupSettings(data.settings) ?? null,
      workspaceSettings: data.settings
    },
    null,
    2
  );
}

export function appCompatibleBackupJson(data: WorkspaceExportData) {
  const settings = appBackupSettings(data.settings);
  return JSON.stringify(
    {
      siparisler: data.orders.map(order => appBackupOrder(order, data.generatedAt)),
      musteriler: data.customers.map(appBackupCustomer).filter(customer => customer.name.trim().length > 0),
      ...(settings ? { settings } : {}),
      version: 2,
      exportedAt: swiftIsoDate(data.generatedAt, data.generatedAt)
    },
    null,
    2
  );
}

export function downloadTextFile(filename: string, contents: string, mimeType: string) {
  const blob = new Blob([contents], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function safeFileDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
