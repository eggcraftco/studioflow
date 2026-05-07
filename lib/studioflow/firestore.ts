import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type DocumentSnapshot
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { entitlementsForPlan, type PlanEntitlements, type StudioBillingPlan } from "@/lib/studioflow/plans";

export type WorkspaceContext = {
  id: string;
  name: string;
  ownerUid: string;
  role: string;
  roleLabel: string;
  billingPlan: StudioBillingPlan;
  billingPlanSource: string;
  billingPlanName: string;
  billingStatus: string;
  billingProviderRawStatus: string;
  billingCustomerId: string;
  billingSubscriptionId: string;
  billingStorageLimitMB: number;
  billingTeamMemberLimit: number;
  storageAddonMB: number;
  currentMemberDisplayName: string;
  currentMemberPhotoURL: string;
  entitlements: PlanEntitlements;
};

export type DashboardCounts = {
  orderCount: number;
  customerCount: number;
  activeOrderCount: number;
  completedOrderCount: number;
  cancelledOrderCount: number;
  dueSoonCount: number;
  estimatedFileUsageMB: number;
  sampledOrderCount: number;
};

export type DashboardFinanceOrder = {
  id: string;
  paymentDate: Date | null;
  paidAmount: number;
  remainingAmount: number;
  watchPurchasePrice: number;
  paymentFee: number;
  deliveryCost: number;
  taxAmount: number;
  customFields: Record<string, string>;
};

export type WorkspaceSettingsOverview = {
  appTheme: string;
  appSubtitle: string;
  appLogoUrl: string;
  selectedLanguage: string;
  selectedCurrency: string;
  selectedDecimalSeparator: string;
  feePercentage: number;
  defaultTaxRate: number;
  taxCalculationType: string;
  taxMilestoneEnabled: boolean;
  taxMilestoneDate: number;
  companyNumbers: CompanyNumberSetting[];
  pdfShowCustomer: boolean;
  pdfShowContact: boolean;
  pdfShowPreview: boolean;
  pdfShowFinCustomer: boolean;
  pdfShowPaymentMethod: boolean;
  pdfShowFinInternal: boolean;
  pdfShowStatus: boolean;
  pdfShowShipping: boolean;
  pdfShowMaterials: boolean;
  pdfShowPriority: boolean;
  financialExpenseItemsJSON: string;
  financialRemainingItemsJSON: string;
  financialShowBaseCost: boolean;
  taxRuleNameRevenue: string;
  taxRuleNameProfit: string;
  uploadSafetyRequirePolicyAcceptance: boolean;
  uploadSafetyMaxFileSizeMB: number;
  dashboardWidgetVisibility: DashboardWidgetVisibility;
};

export type DashboardWidgetVisibility = {
  revenue: boolean;
  pending: boolean;
  cost: boolean;
  fee: boolean;
  shipping: boolean;
  tax: boolean;
  profit: boolean;
};

export type CompanyNumberSetting = {
  id: string;
  title: string;
  value: string;
};

export type QuickReplyTemplateItem = {
  id: string;
  title: string;
  desc: string;
};

export type QuickReplySettings = {
  replyMode: string;
  quickReplyPoliteness: string;
  quickReplyLength: string;
  aiKnowledgeBase: string;
  hasOpenAIKey: boolean;
  products: QuickReplyTemplateItem[];
  rules: QuickReplyTemplateItem[];
};

export type OrderListItem = {
  id: string;
  customerName: string;
  designName: string;
  watchRef: string;
  status: string;
  designStatus: string;
  priority: string;
  risk: string;
  riskReason: string;
  notes: string;
  emailAddress: string;
  instagramUsername: string;
  whatsappNumber: string;
  paidAmount: number;
  remainingAmount: number;
  paymentDate: Date | null;
  dueDate: Date | null;
  isDispatched: boolean;
  isDelivered: boolean;
  clientFileCount: number;
  previewImageUrl: string;
  customFields: Record<string, string>;
  extraStatuses: Record<string, string>;
};

export type ScheduleOrderItem = {
  id: string;
  customerName: string;
  designName: string;
  watchRef: string;
  status: string;
  designStatus: string;
  priority: string;
  risk: string;
  riskReason: string;
  notes: string;
  paidAmount: number;
  remainingAmount: number;
  paymentDate: Date | null;
  deliveryTime: number;
  dueDate: Date | null;
  isDispatched: boolean;
  isDelivered: boolean;
  previewImageUrl: string;
  clientFileCount: number;
  customFields: Record<string, string>;
  extraStatuses: Record<string, string>;
};

export type OrderOptionItem = {
  id: string;
  customerName: string;
  designName: string;
  status: string;
  paymentDate: Date | null;
};

export type CustomerOrderSummary = {
  id: string;
  customerName: string;
  designName: string;
  status: string;
  notes: string;
  previewImageUrl: string;
  paidAmount: number;
  remainingAmount: number;
  paymentDate: Date | null;
  dueDate: Date | null;
};

export type CustomerDirectoryItem = {
  id: string;
  name: string;
  email: string;
  phone: string;
  instagram: string;
  address: string;
  notes: string;
  profileImageUrl: string;
  lastContactDate: Date | null;
  orderCount: number;
  totalPaid: number;
  totalValue: number;
  orders: CustomerOrderSummary[];
};

export type SerializableFirestoreDocument = {
  id: string;
  data: Record<string, unknown>;
};

export type WorkspaceExportData = {
  workspace: WorkspaceContext;
  generatedAt: string;
  orders: SerializableFirestoreDocument[];
  customers: SerializableFirestoreDocument[];
  settings: Record<string, unknown>;
};



export type ClientFileDetail = {
  id: string;
  fileName: string;
  downloadURL: string;
  storagePath: string;
  contentType: string;
  fileSize: number;
  uploadedByUid: string;
  uploadedByEmail: string;
  uploadedBy: string;
  uploadedAt: Date | null;
  source: string;
  note: string;
};

export type ClientFileListItem = ClientFileDetail & {
  fileId: string;
  orderId: string;
  customerName: string;
  designName: string;
  orderStatus: string;
};

export type ToDoDetail = {
  id: string;
  title: string;
  note: string;
  assignedToUid: string;
  assignedToEmail: string;
  dueAt: Date | null;
  priority: string;
  isDone: boolean;
};

export type HistoryLogDetail = {
  id: string;
  title: string;
  oldValue: string;
  newValue: string;
  createdAt: Date | null;
};

export type OrderDetail = {
  id: string;
  companyId: string;
  customerName: string;
  designName: string;
  designLink: string;
  watchRef: string;
  status: string;
  designStatus: string;
  priority: string;
  risk: string;
  riskReason: string;
  paymentMethod: string;
  paymentDate: Date | null;
  deliveryTime: number;
  dueDate: Date | null;
  paidAmount: number;
  remainingAmount: number;
  watchPurchasePrice: number;
  paymentFee: number;
  deliveryCost: number;
  taxType: string;
  taxRate: number;
  taxAmount: number;
  netProfit: number;
  emailAddress: string;
  instagramUsername: string;
  whatsappNumber: string;
  communication: string[];
  notes: string;
  invBool1: boolean;
  invBool2: boolean;
  invBool3: boolean;
  invBool4: boolean;
  invNotes: string;
  trackingNumber: string;
  courier: string;
  isDispatched: boolean;
  isDelivered: boolean;
  customFields: Record<string, string>;
  customToggles: Record<string, boolean>;
  extraStatuses: Record<string, string>;
  clientFiles: ClientFileDetail[];
  todoItems: ToDoDetail[];
  historyLog: HistoryLogDetail[];
};

const ACTIVE_CLOSED_STATUSES = new Set(["done", "completed", "cancelled", "canceled"]);

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function firstStringValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return "";
}

function recordStringValue(value: unknown) {
  const output: Record<string, string> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return output;
  Object.entries(value as Record<string, unknown>).forEach(([key, childValue]) => {
    if (typeof childValue === "string") output[key] = childValue;
  });
  return output;
}

function decodeCompanyNumbers(value: unknown): CompanyNumberSetting[] {
  if (typeof value !== "string" || value.trim().length === 0) return [];
  try {
    const decoded = JSON.parse(value) as unknown;
    if (!Array.isArray(decoded)) return [];
    return decoded.map((item, index) => {
      const source = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return {
        id: idFromUnknown(source.id, `company-number-${index}`),
        title: stringValue(source.title, ""),
        value: stringValue(source.value, "")
      };
    }).filter(item => item.title.trim().length > 0 || item.value.trim().length > 0);
  } catch {
    return [];
  }
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function dateValue(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object" && value !== null && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate();
  }
  return null;
}

function normalizedCustomerName(value: unknown) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase() : "";
}

export function normalizeWorkspaceRole(value: unknown, fallback = ""): string {
  const raw = typeof value === "string" ? value.trim() : "";
  const compact = raw.toLowerCase().replace(/[\s_-]+/g, "");
  if (compact === "owner") return "owner";
  if (compact === "admin") return "admin";
  if (compact === "member") return "member";
  if (compact === "viewer" || compact === "viewonly" || compact === "readonly") return "viewer";
  if (compact === "workflow" || compact === "workflowonly") return "workflow";
  return fallback ? normalizeWorkspaceRole(fallback) : "";
}

function normalizeWorkspaceMemberRole(entry: unknown, fallback = ""): string {
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    return normalizeWorkspaceRole((entry as Record<string, unknown>).role, fallback);
  }
  return normalizeWorkspaceRole(entry, fallback);
}

function workspaceMemberRole(companyData: Record<string, unknown>, uid: string, memberFallback = "member"): string {
  const members = companyData.members && typeof companyData.members === "object"
    ? companyData.members as Record<string, unknown>
    : {};
  const roles = companyData.memberRoles && typeof companyData.memberRoles === "object"
    ? companyData.memberRoles as Record<string, unknown>
    : {};
  const memberExists = Object.prototype.hasOwnProperty.call(members, uid);
  const memberRole = memberExists ? normalizeWorkspaceMemberRole(members[uid], "") : "";
  if (memberRole) return memberRole;
  if (Object.prototype.hasOwnProperty.call(roles, uid)) return normalizeWorkspaceRole(roles[uid], "");
  return memberExists ? normalizeWorkspaceRole(memberFallback, "") : "";
}

function resolveRole(companyData: Record<string, unknown>, uid: string, companyId: string) {
  const ownerUid = stringValue(companyData.ownerUid, companyId);
  if (uid === ownerUid || uid === companyId) return "owner";

  return workspaceMemberRole(companyData, uid, "member");
}

export function roleLabel(role: string) {
  switch (normalizeWorkspaceRole(role)) {
    case "owner":
      return "Owner";
    case "admin":
      return "Admin";
    case "viewer":
      return "View Only";
    case "workflow":
      return "Workflow Only";
    case "member":
      return "Member";
    default:
      return "Unknown";
  }
}

async function readWorkspaceDocument(companyId: string) {
  const snapshot = await getDoc(doc(db, "companies", companyId));
  return snapshot.exists() ? snapshot : null;
}

export async function loadWorkspaceContext(uid: string): Promise<WorkspaceContext> {
  const userSnapshot = await getDoc(doc(db, "users", uid));
  const userData = userSnapshot.exists() ? userSnapshot.data() : {};
  let companyId = stringValue(userData.activeCompanyId, uid);

  let companySnapshot = await readWorkspaceDocument(companyId);
  if (!companySnapshot && companyId !== uid) {
    companyId = uid;
    companySnapshot = await readWorkspaceDocument(companyId);
  }

  const companyData = companySnapshot?.data() ?? {};
  const hasBillingPlan = typeof companyData.billingPlan === "string" && companyData.billingPlan.length > 0;
  const entitlements = entitlementsForPlan(companyData.billingPlan as string | undefined, hasBillingPlan ? "demo" : "team_monthly");
  const storageAddonMB = numberValue(companyData.billingStorageAddonMB, numberValue(companyData.storageAddonMB, 0));
  const storedStorageLimitMB = numberValue(companyData.billingStorageLimitMB, entitlements.storageLimitMB);
  const ownerUid = stringValue(companyData.ownerUid, companyId);
  const role = resolveRole(companyData, uid, companyId);
  const members = companyData.members && typeof companyData.members === "object" && !Array.isArray(companyData.members)
    ? companyData.members as Record<string, unknown>
    : {};
  const memberData = members[uid] && typeof members[uid] === "object" && !Array.isArray(members[uid])
    ? members[uid] as Record<string, unknown>
    : {};

  return {
    id: companyId,
    name: stringValue(companyData.name, stringValue(companyData.companyName, "My Studio")),
    ownerUid,
    role,
    roleLabel: roleLabel(role),
    billingPlan: entitlements.plan,
    billingPlanSource: stringValue(companyData.billingPlanSource, hasBillingPlan ? "workspace" : "legacy_default"),
    billingPlanName: stringValue(companyData.billingPlanName, entitlements.title),
    billingStatus: stringValue(companyData.billingStatus, hasBillingPlan ? "active" : "free"),
    billingProviderRawStatus: stringValue(companyData.billingProviderRawStatus, ""),
    billingCustomerId: stringValue(companyData.billingCustomerId, stringValue(companyData.billingStripeCustomerId, "")),
    billingSubscriptionId: stringValue(companyData.billingSubscriptionId, ""),
    billingStorageLimitMB: storedStorageLimitMB + storageAddonMB,
    billingTeamMemberLimit: numberValue(companyData.billingTeamMemberLimit, entitlements.teamMemberLimit),
    storageAddonMB,
    currentMemberDisplayName: Object.prototype.hasOwnProperty.call(memberData, "displayName")
      ? (typeof memberData.displayName === "string" ? memberData.displayName : "")
      : stringValue(userData.displayName, ""),
    currentMemberPhotoURL: Object.prototype.hasOwnProperty.call(memberData, "photoURL")
      ? stringValue(memberData.photoURL, "")
      : "",
    entitlements
  };
}

export async function loadDashboardCounts(companyId: string): Promise<DashboardCounts> {
  const ordersQuery = query(collection(db, "siparisler"), where("companyId", "==", companyId));
  const customersQuery = query(collection(db, "musteriler"), where("companyId", "==", companyId));

  const [ordersCountSnapshot, customersCountSnapshot, sampledOrdersSnapshot] = await Promise.all([
    getCountFromServer(ordersQuery),
    getCountFromServer(customersQuery),
    getDocs(query(collection(db, "siparisler"), where("companyId", "==", companyId), limit(200)))
  ]);

  let activeOrderCount = 0;
  let completedOrderCount = 0;
  let cancelledOrderCount = 0;
  let dueSoonCount = 0;
  let estimatedFileBytes = 0;
  const now = new Date();
  const inFourteenDays = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  sampledOrdersSnapshot.docs.forEach(orderDocument => {
    const data = orderDocument.data();
    const status = stringValue(data.status, "").toLowerCase();
    if (status === "cancelled" || status === "canceled") cancelledOrderCount += 1;
    if (status === "done" || status === "completed") completedOrderCount += 1;
    if (!ACTIVE_CLOSED_STATUSES.has(status)) activeOrderCount += 1;

    const paymentDate = dateValue(data.paymentDate);
    const deliveryTime = numberValue(data.deliveryTime, 0);
    const dueDate = paymentDate && deliveryTime > 0
      ? new Date(paymentDate.getTime() + deliveryTime * 24 * 60 * 60 * 1000)
      : null;
    if (dueDate && dueDate >= now && dueDate <= inFourteenDays && !ACTIVE_CLOSED_STATUSES.has(status)) {
      dueSoonCount += 1;
    }

    if (Array.isArray(data.clientFiles)) {
      data.clientFiles.forEach(file => {
        if (file && typeof file === "object") {
          estimatedFileBytes += numberValue((file as Record<string, unknown>).fileSize, 0);
        }
      });
    }
  });

  return {
    orderCount: ordersCountSnapshot.data().count,
    customerCount: customersCountSnapshot.data().count,
    activeOrderCount,
    completedOrderCount,
    cancelledOrderCount,
    dueSoonCount,
    estimatedFileUsageMB: Math.round((estimatedFileBytes / 1024 / 1024) * 10) / 10,
    sampledOrderCount: sampledOrdersSnapshot.size
  };
}

export async function loadDashboardFinanceOrders(companyId: string): Promise<DashboardFinanceOrder[]> {
  const snapshot = await getDocs(query(collection(db, "siparisler"), where("companyId", "==", companyId)));
  return snapshot.docs.map(orderDocument => {
    const data = orderDocument.data();
    return {
      id: orderDocument.id,
      paymentDate: dateValue(data.paymentDate),
      paidAmount: numberValue(data.paidAmount, 0),
      remainingAmount: numberValue(data.remainingAmount, 0),
      watchPurchasePrice: numberValue(data.watchPurchasePrice, 0),
      paymentFee: numberValue(data.paymentFee, 0),
      deliveryCost: numberValue(data.deliveryCost, 0),
      taxAmount: numberValue(data.taxAmount, 0),
      customFields: stringMapValue(data.customFields)
    };
  });
}

export async function loadWorkspaceSettingsOverview(companyId: string): Promise<WorkspaceSettingsOverview> {
  const snapshot = await getDoc(doc(db, "companySettings", companyId));
  const data = snapshot.exists() ? snapshot.data() : {};
  const dashboardVisibility = dashboardWidgetVisibilityValue(data);

  return {
    appTheme: stringValue(data.appTheme, "System"),
    appSubtitle: stringValue(data.appSubtitle, "Bespoke Hand-Painted Dials"),
    appLogoUrl: stringValue(data.appLogoUrl, ""),
    selectedLanguage: stringValue(data.seciliDil, "English"),
    selectedCurrency: stringValue(data.seciliParaBirimi, "£"),
    selectedDecimalSeparator: stringValue(data.seciliOndalik, "."),
    feePercentage: numberValue(data.feePercentage, 3),
    defaultTaxRate: numberValue(data.defaultTaxRate, 20),
    taxCalculationType: stringValue(data.taxCalculationType, "Revenue"),
    taxMilestoneEnabled: booleanValue(data.taxMilestoneEnabled, false),
    taxMilestoneDate: numberValue(data.taxMilestoneDate, Date.now() / 1000),
    companyNumbers: decodeCompanyNumbers(data.companyNumbersJSON),
    pdfShowCustomer: booleanValue(data.pdfShowCustomer, true),
    pdfShowContact: booleanValue(data.pdfShowContact, true),
    pdfShowPreview: booleanValue(data.pdfShowPreview, true),
    pdfShowFinCustomer: booleanValue(data.pdfShowFinCustomer, true),
    pdfShowPaymentMethod: booleanValue(data.pdfShowPaymentMethod, true),
    pdfShowFinInternal: booleanValue(data.pdfShowFinInternal, false),
    pdfShowStatus: booleanValue(data.pdfShowStatus, true),
    pdfShowShipping: booleanValue(data.pdfShowShipping, true),
    pdfShowMaterials: booleanValue(data.pdfShowMaterials, true),
    pdfShowPriority: booleanValue(data.pdfShowPriority, true),
    financialExpenseItemsJSON: stringValue(data.financialExpenseItemsJSON, ""),
    financialRemainingItemsJSON: stringValue(data.financialRemainingItemsJSON, ""),
    financialShowBaseCost: booleanValue(data.financialShowBaseCost, true),
    taxRuleNameRevenue: stringValue(data.taxRuleNameRevenue, "Standard Tax (Services/New)"),
    taxRuleNameProfit: stringValue(data.taxRuleNameProfit, "Margin Scheme (2nd Hand)"),
    uploadSafetyRequirePolicyAcceptance: booleanValue(
      data.uploadSafetyRequirePolicyAcceptanceV1,
      booleanValue(data.uploadSafetyRequirePolicyAcceptance, true)
    ),
    uploadSafetyMaxFileSizeMB: numberValue(
      data.uploadSafetyMaxFileSizeMBV1,
      numberValue(data.uploadSafetyMaxFileSizeMB, 10)
    ),
    dashboardWidgetVisibility: dashboardVisibility
  };
}

function dashboardWidgetVisibilityValue(data: DocumentData): DashboardWidgetVisibility {
  const mapValue = data.dashboardWidgetVisibility && typeof data.dashboardWidgetVisibility === "object"
    ? data.dashboardWidgetVisibility as Record<string, unknown>
    : {};

  return {
    revenue: booleanValue(mapValue.revenue, booleanValue(data.dashShowRevenue, true)),
    pending: booleanValue(mapValue.pending, booleanValue(data.dashShowPending, true)),
    cost: booleanValue(mapValue.cost, booleanValue(data.dashShowCost, true)),
    fee: booleanValue(mapValue.fee, booleanValue(data.dashShowFee, true)),
    shipping: booleanValue(mapValue.shipping, booleanValue(data.dashShowShipping, true)),
    tax: booleanValue(mapValue.tax, booleanValue(data.dashShowTax, true)),
    profit: booleanValue(mapValue.profit, booleanValue(data.dashShowProfit, true))
  };
}

export async function loadWorkspaceStatusOptions(companyId: string): Promise<string[]> {
  const snapshot = await getDoc(doc(db, "companySettings", companyId));
  const data = snapshot.exists() ? snapshot.data() : {};
  const json = stringValue(data.activeStatusesJSON, "");
  if (!json) return [];

  try {
    const decoded = JSON.parse(json) as unknown;
    if (!Array.isArray(decoded)) return [];
    return decoded
      .map(item => typeof item === "string" ? item.trim() : "")
      .filter(Boolean);
  } catch {
    return [];
  }
}

function decodeQuickReplyTemplateItems(value: unknown): QuickReplyTemplateItem[] {
  if (typeof value !== "string" || value.trim().length === 0) return [];
  try {
    const decoded = JSON.parse(value) as unknown;
    if (!Array.isArray(decoded)) return [];
    return decoded.map((item, index) => {
      const source = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return {
        id: idFromUnknown(source.id, `template-${index}`),
        title: stringValue(source.title, ""),
        desc: stringValue(source.desc, "")
      };
    }).filter(item => item.title.trim().length > 0 || item.desc.trim().length > 0);
  } catch {
    return [];
  }
}

export async function loadQuickReplySettings(companyId: string): Promise<QuickReplySettings> {
  const snapshot = await getDoc(doc(db, "companySettings", companyId));
  const data = snapshot.exists() ? snapshot.data() : {};

  return {
    replyMode: stringValue(data.replyMode, "AI"),
    quickReplyPoliteness: stringValue(data.quickReplyPoliteness, "Warm"),
    quickReplyLength: stringValue(data.quickReplyLength, "Short"),
    aiKnowledgeBase: stringValue(data.aiKnowledgeBase, ""),
    hasOpenAIKey: stringValue(data.openAIKey, "").length > 0,
    products: decodeQuickReplyTemplateItems(data.customProductsJSON),
    rules: decodeQuickReplyTemplateItems(data.customRulesJSON)
  };
}

export async function loadRecentOrders(companyId: string): Promise<OrderListItem[]> {
  const snapshot = await getDocs(query(collection(db, "siparisler"), where("companyId", "==", companyId), limit(100)));
  const orders = snapshot.docs.map(orderDocument => {
    const data = orderDocument.data();
    const paymentDate = dateValue(data.paymentDate);
    const deliveryTime = numberValue(data.deliveryTime, 0);
    const dueDate = paymentDate && deliveryTime > 0
      ? new Date(paymentDate.getTime() + deliveryTime * 24 * 60 * 60 * 1000)
      : null;

    return {
      id: orderDocument.id,
      customerName: stringValue(data.customerName, "Unnamed customer"),
      designName: stringValue(data.designName, "Untitled design"),
      watchRef: stringValue(data.watchRef, ""),
      status: stringValue(data.status, "Not Yet"),
      designStatus: stringValue(data.designStatus, "Not Yet"),
      priority: stringValue(data.priority, "Normal"),
      risk: stringValue(data.risk, "None"),
      riskReason: stringValue(data.riskReason, ""),
      notes: stringValue(data.notes, ""),
      emailAddress: stringValue(data.emailAddress, ""),
      instagramUsername: stringValue(data.instagramUsername, ""),
      whatsappNumber: stringValue(data.whatsappNumber, ""),
      paidAmount: numberValue(data.paidAmount, 0),
      remainingAmount: numberValue(data.remainingAmount, 0),
      paymentDate,
      dueDate,
      isDispatched: booleanValue(data.isDispatched, false),
      isDelivered: booleanValue(data.isDelivered, false),
      clientFileCount: Array.isArray(data.clientFiles) ? data.clientFiles.length : 0,
      previewImageUrl: firstStringValue(
        data.previewImageUrl,
        data.previewImageURL,
        data.previewURL,
        data.previewUrl,
        data.imageUrl,
        data.imageURL,
        data.designImageUrl,
        data.designImageURL,
        data.designLink
      ),
      customFields: recordStringValue(data.customFields),
      extraStatuses: recordStringValue(data.extraStatuses)
    };
  });

  return orders.sort((lhs, rhs) => {
    const left = lhs.paymentDate?.getTime() ?? 0;
    const right = rhs.paymentDate?.getTime() ?? 0;
    return right - left;
  });
}

export async function loadScheduleOrders(companyId: string): Promise<ScheduleOrderItem[]> {
  const snapshot = await getDocs(query(collection(db, "siparisler"), where("companyId", "==", companyId)));
  const orders = snapshot.docs.map(orderDocument => {
    const data = orderDocument.data();
    const paymentDate = dateValue(data.paymentDate);
    const deliveryTime = numberValue(data.deliveryTime, 0);
    const dueDate = paymentDate && deliveryTime > 0
      ? new Date(paymentDate.getTime() + deliveryTime * 24 * 60 * 60 * 1000)
      : null;

    return {
      id: orderDocument.id,
      customerName: stringValue(data.customerName, "Unnamed customer"),
      designName: stringValue(data.designName, "Untitled design"),
      watchRef: stringValue(data.watchRef, ""),
      status: stringValue(data.status, "Not Yet"),
      designStatus: stringValue(data.designStatus, "Not Yet"),
      priority: stringValue(data.priority, "Normal"),
      risk: stringValue(data.risk, "None"),
      riskReason: stringValue(data.riskReason, ""),
      notes: stringValue(data.notes, ""),
      paidAmount: numberValue(data.paidAmount, 0),
      remainingAmount: numberValue(data.remainingAmount, 0),
      paymentDate,
      deliveryTime,
      dueDate,
      isDispatched: booleanValue(data.isDispatched, false),
      isDelivered: booleanValue(data.isDelivered, false),
      previewImageUrl: firstStringValue(
        data.previewImageUrl,
        data.previewImageURL,
        data.previewURL,
        data.previewUrl,
        data.imageUrl,
        data.imageURL,
        data.designImageUrl,
        data.designImageURL,
        data.designLink
      ),
      clientFileCount: Array.isArray(data.clientFiles) ? data.clientFiles.length : 0,
      customFields: stringMapValue(data.customFields),
      extraStatuses: stringMapValue(data.extraStatuses)
    };
  });

  return orders.sort((lhs, rhs) => {
    const left = lhs.dueDate?.getTime() ?? lhs.paymentDate?.getTime() ?? 0;
    const right = rhs.dueDate?.getTime() ?? rhs.paymentDate?.getTime() ?? 0;
    return left - right;
  });
}

export async function loadWorkspaceOrderOptions(companyId: string): Promise<OrderOptionItem[]> {
  const snapshot = await getDocs(query(collection(db, "siparisler"), where("companyId", "==", companyId)));
  const orders = snapshot.docs.map(orderDocument => {
    const data = orderDocument.data();
    return {
      id: orderDocument.id,
      customerName: stringValue(data.customerName, "Unnamed customer"),
      designName: stringValue(data.designName, "Untitled design"),
      status: stringValue(data.status, "Not Yet"),
      paymentDate: dateValue(data.paymentDate)
    };
  });

  return orders.sort((lhs, rhs) => {
    const left = lhs.paymentDate?.getTime() ?? 0;
    const right = rhs.paymentDate?.getTime() ?? 0;
    return right - left;
  });
}

export async function loadWorkspaceCustomers(companyId: string): Promise<CustomerDirectoryItem[]> {
  const [customersSnapshot, ordersSnapshot] = await Promise.all([
    getDocs(query(collection(db, "musteriler"), where("companyId", "==", companyId))),
    getDocs(query(collection(db, "siparisler"), where("companyId", "==", companyId)))
  ]);

  const orders = ordersSnapshot.docs.map(orderDocument => {
    const data = orderDocument.data();
    const paymentDate = dateValue(data.paymentDate);
    const deliveryTime = numberValue(data.deliveryTime, 0);
    const dueDate = paymentDate && deliveryTime > 0
      ? new Date(paymentDate.getTime() + deliveryTime * 24 * 60 * 60 * 1000)
      : null;

    return {
      id: orderDocument.id,
      customerName: stringValue(data.customerName, "Unnamed customer"),
      designName: stringValue(data.designName, "Untitled design"),
      status: stringValue(data.status, "Not Yet"),
      notes: stringValue(data.notes, ""),
      previewImageUrl: firstStringValue(
        data.previewImageUrl,
        data.previewImageURL,
        data.previewURL,
        data.previewUrl,
        data.imageUrl,
        data.imageURL,
        data.designImageUrl,
        data.designImageURL,
        data.designLink
      ),
      paidAmount: numberValue(data.paidAmount, 0),
      remainingAmount: numberValue(data.remainingAmount, 0),
      paymentDate,
      dueDate
    };
  });

  const ordersByCustomer = new Map<string, CustomerOrderSummary[]>();
  orders.forEach(order => {
    const key = normalizedCustomerName(order.customerName);
    if (!key) return;
    const existing = ordersByCustomer.get(key) ?? [];
    existing.push(order);
    ordersByCustomer.set(key, existing);
  });

  const customers = customersSnapshot.docs.map(customerDocument => {
    const data = customerDocument.data();
    const name = stringValue(data.name, "Unnamed customer");
    const customerOrders = (ordersByCustomer.get(normalizedCustomerName(name)) ?? [])
      .sort((lhs, rhs) => (rhs.paymentDate?.getTime() ?? 0) - (lhs.paymentDate?.getTime() ?? 0));

    return {
      id: customerDocument.id,
      name,
      email: stringValue(data.email, ""),
      phone: stringValue(data.phone, ""),
      instagram: stringValue(data.instagram, ""),
      address: stringValue(data.address, ""),
      notes: stringValue(data.notes, ""),
      profileImageUrl: stringValue(data.profileImageUrl, ""),
      lastContactDate: dateValue(data.lastContactDate),
      orderCount: customerOrders.length,
      totalPaid: customerOrders.reduce((total, order) => total + order.paidAmount, 0),
      totalValue: customerOrders.reduce((total, order) => total + order.paidAmount + order.remainingAmount, 0),
      orders: customerOrders
    };
  });

  return customers.sort((lhs, rhs) => {
    const left = lhs.lastContactDate?.getTime() ?? 0;
    const right = rhs.lastContactDate?.getTime() ?? 0;
    if (left !== right) return right - left;
    return lhs.name.localeCompare(rhs.name);
  });
}

export function serializeFirestoreValue(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) return value.map(item => serializeFirestoreValue(item));
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, childValue]) => {
      output[key] = serializeFirestoreValue(childValue);
    });
    return output;
  }
  return value;
}

function serializableDocument(id: string, data: Record<string, unknown>): SerializableFirestoreDocument {
  return {
    id,
    data: serializeFirestoreValue(data) as Record<string, unknown>
  };
}

export async function loadWorkspaceExportData(workspace: WorkspaceContext): Promise<WorkspaceExportData> {
  const [ordersSnapshot, customersSnapshot, settingsSnapshot] = await Promise.all([
    getDocs(query(collection(db, "siparisler"), where("companyId", "==", workspace.id))),
    getDocs(query(collection(db, "musteriler"), where("companyId", "==", workspace.id))),
    getDoc(doc(db, "companySettings", workspace.id))
  ]);

  const orders = ordersSnapshot.docs.map(orderDocument => serializableDocument(orderDocument.id, orderDocument.data()));
  const customers = customersSnapshot.docs.map(customerDocument => serializableDocument(customerDocument.id, customerDocument.data()));

  return {
    workspace,
    generatedAt: new Date().toISOString(),
    orders,
    customers,
    settings: settingsSnapshot.exists()
      ? serializeFirestoreValue(settingsSnapshot.data()) as Record<string, unknown>
      : {}
  };
}


function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function stringArrayValue(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function stringMapValue(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, string> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, childValue]) => {
    if (typeof childValue === "string" && childValue.trim().length > 0) output[key] = childValue;
  });
  return output;
}

function booleanMapValue(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, boolean> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, childValue]) => {
    if (typeof childValue === "boolean") output[key] = childValue;
  });
  return output;
}

function idFromUnknown(value: unknown, fallback: string) {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (value && typeof value === "object") {
    const maybeUuid = (value as Record<string, unknown>).uuidString;
    if (typeof maybeUuid === "string" && maybeUuid.trim().length > 0) return maybeUuid;
  }
  return fallback;
}

function mapClientFiles(value: unknown): ClientFileDetail[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const file = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      id: idFromUnknown(file.id, `file-${index}`),
      fileName: stringValue(file.fileName, "Untitled file"),
      downloadURL: stringValue(file.downloadURL, ""),
      storagePath: stringValue(file.storagePath, ""),
      contentType: stringValue(file.contentType, ""),
      fileSize: numberValue(file.fileSize, numberValue(file.sizeBytes, 0)),
      uploadedByUid: stringValue(file.uploadedByUid, ""),
      uploadedByEmail: stringValue(file.uploadedByEmail, ""),
      uploadedBy: stringValue(file.uploadedBy, ""),
      uploadedAt: dateValue(file.uploadedAt),
      source: stringValue(file.source, ""),
      note: stringValue(file.note, "")
    };
  });
}

export async function loadWorkspaceClientFiles(companyId: string, includeCloudAccess = false): Promise<ClientFileListItem[]> {
  const snapshot = await getDocs(query(collection(db, "siparisler"), where("companyId", "==", companyId)));
  const files = snapshot.docs.flatMap(orderDocument => {
    const data = orderDocument.data();
    const orderId = orderDocument.id;
    const customerName = stringValue(data.customerName, "Unnamed customer");
    const designName = stringValue(data.designName, "Untitled design");
    const orderStatus = stringValue(data.status, "Not Yet");

    return mapClientFiles(data.clientFiles).map(file => ({
      ...file,
      id: `${orderId}-${file.id}`,
      fileId: file.id,
      downloadURL: includeCloudAccess ? file.downloadURL : "",
      storagePath: includeCloudAccess ? file.storagePath : "",
      orderId,
      customerName,
      designName,
      orderStatus
    }));
  });

  return files.sort((lhs, rhs) => {
    const left = lhs.uploadedAt?.getTime() ?? 0;
    const right = rhs.uploadedAt?.getTime() ?? 0;
    if (left !== right) return right - left;
    return lhs.fileName.localeCompare(rhs.fileName);
  });
}

function mapTodoItems(value: unknown): ToDoDetail[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const task = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      id: idFromUnknown(task.id, `task-${index}`),
      title: stringValue(task.title, "Untitled task"),
      note: stringValue(task.note, ""),
      assignedToUid: stringValue(task.assignedToUid, ""),
      assignedToEmail: stringValue(task.assignedToEmail, ""),
      dueAt: dateValue(task.dueAt),
      priority: stringValue(task.priority, "Normal"),
      isDone: booleanValue(task.isDone, false)
    };
  });
}

function mapHistoryLog(value: unknown): HistoryLogDetail[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const entry = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      id: idFromUnknown(entry.id, `history-${index}`),
      title: stringValue(entry.title, "Update"),
      oldValue: stringValue(entry.oldValue, ""),
      newValue: stringValue(entry.newValue, ""),
      createdAt: dateValue(entry.createdAt)
    };
  }).sort((first, second) => (second.createdAt?.getTime() ?? 0) - (first.createdAt?.getTime() ?? 0));
}

function mapOrderDetailSnapshot(
  snapshot: DocumentSnapshot<DocumentData>,
  companyId: string,
  includeClientFileCloudAccess = true
): OrderDetail {
  if (!snapshot.exists()) {
    throw new Error("Order not found.");
  }

  const data = snapshot.data();
  const orderCompanyId = stringValue(data.companyId, companyId);
  if (orderCompanyId !== companyId) {
    throw new Error("You do not have access to this order.");
  }

  const paymentDate = dateValue(data.paymentDate);
  const deliveryTime = numberValue(data.deliveryTime, 0);
  const dueDate = paymentDate && deliveryTime > 0
    ? new Date(paymentDate.getTime() + deliveryTime * 24 * 60 * 60 * 1000)
    : null;

  const paidAmount = numberValue(data.paidAmount, 0);
  const remainingAmount = numberValue(data.remainingAmount, 0);
  const watchPurchasePrice = numberValue(data.watchPurchasePrice, 0);
  const paymentFee = numberValue(data.paymentFee, 0);
  const deliveryCost = numberValue(data.deliveryCost, 0);
  const taxAmount = numberValue(data.taxAmount, 0);

  return {
    id: snapshot.id,
    companyId: orderCompanyId,
    customerName: stringValue(data.customerName, "Unnamed customer"),
    designName: stringValue(data.designName, "Untitled design"),
    designLink: stringValue(data.designLink, ""),
    watchRef: stringValue(data.watchRef, ""),
    status: stringValue(data.status, "Not Yet"),
    designStatus: stringValue(data.designStatus, "Not Yet"),
    priority: stringValue(data.priority, "Normal"),
    risk: stringValue(data.risk, "None"),
    riskReason: stringValue(data.riskReason, ""),
    paymentMethod: stringValue(data.paymentMethod, ""),
    paymentDate,
    deliveryTime,
    dueDate,
    paidAmount,
    remainingAmount,
    watchPurchasePrice,
    paymentFee,
    deliveryCost,
    taxType: stringValue(data.taxType, ""),
    taxRate: numberValue(data.taxRate, 0),
    taxAmount,
    netProfit: paidAmount + remainingAmount - watchPurchasePrice - paymentFee - deliveryCost - taxAmount,
    emailAddress: stringValue(data.emailAddress, ""),
    instagramUsername: stringValue(data.instagramUsername, ""),
    whatsappNumber: stringValue(data.whatsappNumber, ""),
    communication: stringArrayValue(data.communication),
    notes: stringValue(data.notes, ""),
    invBool1: booleanValue(data.invBool1, false),
    invBool2: booleanValue(data.invBool2, false),
    invBool3: booleanValue(data.invBool3, false),
    invBool4: booleanValue(data.invBool4, false),
    invNotes: stringValue(data.invNotes, ""),
    trackingNumber: stringValue(data.trackingNumber, ""),
    courier: stringValue(data.courier, ""),
    isDispatched: booleanValue(data.isDispatched, false),
    isDelivered: booleanValue(data.isDelivered, false),
    customFields: stringMapValue(data.customFields),
    customToggles: booleanMapValue(data.customToggles),
    extraStatuses: stringMapValue(data.extraStatuses),
    clientFiles: mapClientFiles(data.clientFiles).map(file => includeClientFileCloudAccess ? file : {
      ...file,
      downloadURL: "",
      storagePath: ""
    }),
    todoItems: mapTodoItems(data.todoItems),
    historyLog: mapHistoryLog(data.historyLog)
  };
}

export async function loadOrderDetail(companyId: string, orderId: string, includeClientFileCloudAccess = true): Promise<OrderDetail> {
  const snapshot = await getDoc(doc(db, "siparisler", orderId));
  return mapOrderDetailSnapshot(snapshot, companyId, includeClientFileCloudAccess);
}

export function subscribeOrderDetail(
  companyId: string,
  orderId: string,
  includeClientFileCloudAccess: boolean,
  onOrder: (order: OrderDetail) => void,
  onError: (message: string) => void
) {
  if (!companyId || !orderId) return () => {};

  return onSnapshot(
    doc(db, "siparisler", orderId),
    snapshot => {
      try {
        onOrder(mapOrderDetailSnapshot(snapshot, companyId, includeClientFileCloudAccess));
      } catch (error) {
        onError(error instanceof Error ? error.message : "Could not load this order.");
      }
    },
    error => {
      onError(error.message || "Could not listen to this order.");
    }
  );
}

export type TeamMemberDetail = {
  id: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: string;
  roleLabel: string;
  addedAt: Date | null;
  isOwner: boolean;
};

export type JoinRequestDetail = {
  id: string;
  requesterUid: string;
  requesterEmail: string;
  requesterDisplayName: string;
  requesterPhotoURL: string;
  status: string;
  createdAt: Date | null;
};

export type TeamAccessData = {
  members: TeamMemberDetail[];
  joinRequests: JoinRequestDetail[];
};

function mapCompanyMembers(companyData: Record<string, unknown>, companyId: string): TeamMemberDetail[] {
  const ownerUid = stringValue(companyData.ownerUid, companyId);
  const members = companyData.members && typeof companyData.members === "object"
    ? companyData.members as Record<string, unknown>
    : {};

  const output: TeamMemberDetail[] = Object.entries(members).map(([uid, raw]) => {
    const memberData = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const role = workspaceMemberRole(companyData, uid, uid === ownerUid ? "owner" : "member");
    return {
      id: uid,
      email: stringValue(memberData.email, uid === ownerUid ? stringValue(companyData.ownerEmail, "") : ""),
      displayName: stringValue(memberData.displayName, uid === ownerUid ? stringValue(companyData.ownerDisplayName, "") : ""),
      photoURL: stringValue(memberData.photoURL, uid === ownerUid ? stringValue(companyData.ownerPhotoURL, "") : ""),
      role,
      roleLabel: roleLabel(role),
      addedAt: dateValue(memberData.addedAt) ?? dateValue(memberData.updatedAt),
      isOwner: uid === ownerUid || normalizeWorkspaceRole(role) === "owner"
    };
  });

  if (!output.some(member => member.id === ownerUid)) {
    output.unshift({
      id: ownerUid,
      email: stringValue(companyData.ownerEmail, ""),
      displayName: stringValue(companyData.ownerDisplayName, "Owner"),
      photoURL: stringValue(companyData.ownerPhotoURL, ""),
      role: "owner",
      roleLabel: "Owner",
      addedAt: dateValue(companyData.createdAt),
      isOwner: true
    });
  }

  return output.sort((lhs, rhs) => {
    if (lhs.isOwner && !rhs.isOwner) return -1;
    if (!lhs.isOwner && rhs.isOwner) return 1;
    const roleRank: Record<string, number> = { owner: 0, admin: 1, member: 2, viewer: 3, workflow: 4 };
    const lhsRank = roleRank[normalizeWorkspaceRole(lhs.role)] ?? 9;
    const rhsRank = roleRank[normalizeWorkspaceRole(rhs.role)] ?? 9;
    if (lhsRank !== rhsRank) return lhsRank - rhsRank;
    return (lhs.displayName || lhs.email || lhs.id).localeCompare(rhs.displayName || rhs.email || rhs.id);
  });
}

function mapJoinRequest(documentId: string, data: Record<string, unknown>): JoinRequestDetail | null {
  const requesterUid = stringValue(data.requesterUid, "");
  if (!requesterUid) return null;
  return {
    id: documentId,
    requesterUid,
    requesterEmail: stringValue(data.requesterEmail, ""),
    requesterDisplayName: stringValue(data.requesterDisplayName, ""),
    requesterPhotoURL: stringValue(data.requesterPhotoURL, ""),
    status: stringValue(data.status, "pending"),
    createdAt: dateValue(data.createdAt)
  };
}

export async function loadTeamAccessData(workspace: WorkspaceContext): Promise<TeamAccessData> {
  const companySnapshot = await getDoc(doc(db, "companies", workspace.id));
  const companyData = companySnapshot.exists() ? companySnapshot.data() : {};
  const members = mapCompanyMembers(companyData, workspace.id);

  let joinRequests: JoinRequestDetail[] = [];
  if (normalizeWorkspaceRole(workspace.role) === "owner") {
    const joinSnapshot = await getDocs(query(collection(db, "workspaceJoinRequests"), where("targetCompanyId", "==", workspace.id)));
    joinRequests = joinSnapshot.docs
      .map(joinDocument => mapJoinRequest(joinDocument.id, joinDocument.data()))
      .filter((request): request is JoinRequestDetail => Boolean(request))
      .filter(request => request.status.toLowerCase() === "pending")
      .sort((lhs, rhs) => (rhs.createdAt?.getTime() ?? 0) - (lhs.createdAt?.getTime() ?? 0));
  }

  return { members, joinRequests };
}
