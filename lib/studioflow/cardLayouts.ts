import { httpsCallable } from "firebase/functions";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db, functions } from "@/lib/firebase/client";
import { withWebSyncStatus } from "@/lib/studioflow/syncStatus";

export const ORDER_WORKSPACE_LAYOUT_KEY = "__workspaceLayoutV1";

export const ORDER_DETAIL_CARD_IDS = [
  "preview",
  "summary",
  "customer",
  "invoiceItems",
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
] as const;

export type OrderDetailCardId = (typeof ORDER_DETAIL_CARD_IDS)[number];

export type OrderDetailCardLayout = {
  cardOrder: OrderDetailCardId[];
  mobileCardOrder: OrderDetailCardId[];
  columns: OrderDetailCardId[][];
  columnWidths: number[];
  cardHeights: Partial<Record<OrderDetailCardId, number>>;
  cardColors: Partial<Record<OrderDetailCardId, string>>;
  visibility: Record<OrderDetailCardId, boolean>;
};

const DEFAULT_VISIBILITY = ORDER_DETAIL_CARD_IDS.reduce((output, cardId) => {
  // All order-detail cards (including Production Status) are visible by default for new users.
  output[cardId] = true;
  return output;
}, {} as Record<OrderDetailCardId, boolean>);

export const DEFAULT_ORDER_DETAIL_CARD_COLUMNS: OrderDetailCardId[][] = [
  ["preview", "summary", "workTime", "shipping", "schedule", "notes"],
  ["customer", "invoiceItems", "materials", "delivery"],
  ["financial", "priority", "todo", "status", "historyLog", "clientFiles"]
];

export const DEFAULT_ORDER_DETAIL_CARD_LAYOUT: OrderDetailCardLayout = {
  cardOrder: DEFAULT_ORDER_DETAIL_CARD_COLUMNS.flat(),
  mobileCardOrder: DEFAULT_ORDER_DETAIL_CARD_COLUMNS.flat(),
  columns: DEFAULT_ORDER_DETAIL_CARD_COLUMNS.map(column => [...column]),
  columnWidths: [350, 350, 350],
  cardHeights: {},
  cardColors: {},
  visibility: { ...DEFAULT_VISIBILITY }
};

const LEGACY_CARD_ID_MAP: Record<string, OrderDetailCardId> = {
  communication: "customer",
  customerCommunication: "customer",
  customerAndCommunication: "customer",
  timeline: "delivery",
  timelineDelivery: "delivery",
  deliveryTimeline: "delivery",
  finance: "financial",
  financialInfo: "financial",
  priorityRisk: "priority",
  materialsInventory: "materials",
  history: "historyLog",
  historylog: "historyLog"
};

type CardLayoutCallableResult = {
  ok?: boolean;
  layout?: unknown;
  message?: string;
  [key: string]: unknown;
};

type WorkspaceUserProfile = {
  userId: string;
  snapshotJSON: string;
};

function normalizeCardId(value: unknown): OrderDetailCardId | null {
  if (typeof value !== "string") return null;
  const mapped = LEGACY_CARD_ID_MAP[value] ?? value;
  return ORDER_DETAIL_CARD_IDS.includes(mapped as OrderDetailCardId) ? mapped as OrderDetailCardId : null;
}

function normalizeCardOrder(value: unknown) {
  const seen = new Set<OrderDetailCardId>();
  const output: OrderDetailCardId[] = [];

  if (Array.isArray(value)) {
    value.forEach(item => {
      const cardId = normalizeCardId(item);
      if (cardId) {
        if (!seen.has(cardId)) {
          seen.add(cardId);
          output.push(cardId);
        }
      }
    });
  }

  ORDER_DETAIL_CARD_IDS.forEach(cardId => {
    if (!seen.has(cardId)) output.push(cardId);
  });

  return output;
}

function columnsFromCardOrder(cardOrder: OrderDetailCardId[]) {
  return [
    cardOrder.slice(0, 2),
    cardOrder.slice(2, 7),
    cardOrder.slice(7)
  ];
}

function normalizeCardColumns(value: unknown, fallbackOrder: OrderDetailCardId[]) {
  const seen = new Set<OrderDetailCardId>();
  const columns: OrderDetailCardId[][] = [];

  if (Array.isArray(value)) {
    value.forEach(rawColumn => {
      const column: OrderDetailCardId[] = [];
      if (Array.isArray(rawColumn)) {
        rawColumn.forEach(item => {
          const cardId = normalizeCardId(item);
          if (cardId && !seen.has(cardId)) {
            seen.add(cardId);
            column.push(cardId);
          }
        });
      }
      columns.push(column);
    });
  }

  if (columns.length === 0) {
    return columnsFromCardOrder(fallbackOrder);
  }

  ORDER_DETAIL_CARD_IDS.forEach(cardId => {
    if (!seen.has(cardId)) {
      columns[columns.length - 1].push(cardId);
    }
  });

  while (columns.length < 3) columns.push([]);
  return columns;
}

function normalizeColumnWidths(value: unknown, columnCount: number) {
  const widths = Array.isArray(value)
    ? value
      .map(item => Number(item))
      .filter(item => Number.isFinite(item))
      .map(item => Math.min(Math.max(item, 260), 800))
    : [];

  while (widths.length < Math.max(3, columnCount)) widths.push(350);
  return widths;
}

function normalizeCardNumberMap(value: unknown) {
  const output: Partial<Record<OrderDetailCardId, number>> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return output;

  Object.entries(value as Record<string, unknown>).forEach(([rawCardId, rawNumber]) => {
    const cardId = normalizeCardId(rawCardId);
    const number = Number(rawNumber);
    if (cardId && Number.isFinite(number) && number > 0) {
      output[cardId] = Math.min(Math.max(number, 160), 1200);
    }
  });

  return output;
}

function normalizeOrderId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cardHeightsFromWorkspaceSnapshot(snapshot: Record<string, unknown>, orderId?: string) {
  const sharedHeights = normalizeCardNumberMap(snapshot.kartYukseklikleri);
  const cleanOrderId = normalizeOrderId(orderId);
  const orderHeightsMap = snapshot.orderKartYukseklikleri ?? snapshot.orderCardHeights;

  if (
    cleanOrderId &&
    orderHeightsMap &&
    typeof orderHeightsMap === "object" &&
    !Array.isArray(orderHeightsMap)
  ) {
    const specificHeights = normalizeCardNumberMap((orderHeightsMap as Record<string, unknown>)[cleanOrderId]);
    if (Object.keys(specificHeights).length > 0) {
      return specificHeights;
    }
  }

  return sharedHeights;
}

function normalizeCardColorMap(value: unknown) {
  const output: Partial<Record<OrderDetailCardId, string>> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return output;

  Object.entries(value as Record<string, unknown>).forEach(([rawCardId, rawColor]) => {
    const cardId = normalizeCardId(rawCardId);
    if (cardId && typeof rawColor === "string" && rawColor.trim()) {
      output[cardId] = rawColor.trim();
    }
  });

  return output;
}

function normalizeVisibility(value: unknown) {
  const output = { ...DEFAULT_VISIBILITY };
  if (!value || typeof value !== "object" || Array.isArray(value)) return output;

  ORDER_DETAIL_CARD_IDS.forEach(cardId => {
    const visible = (value as Record<string, unknown>)[cardId];
    if (typeof visible === "boolean") output[cardId] = visible;
  });

  Object.entries(LEGACY_CARD_ID_MAP).forEach(([legacyId, cardId]) => {
    const visible = (value as Record<string, unknown>)[legacyId];
    if (typeof visible === "boolean") output[cardId] = visible;
  });

  return output;
}

export function normalizeOrderDetailCardLayout(value: unknown): OrderDetailCardLayout {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const fallbackOrder = normalizeCardOrder(data.cardOrder);
  const columns = normalizeCardColumns(data.columns, fallbackOrder);
  const cardOrder = normalizeCardOrder(columns.flat());
  const mobileCardOrder = normalizeCardOrder(
    data.mobileCardOrder ?? data.phoneKartSirasi ?? data.phoneCardOrder ?? cardOrder
  );

  return {
    cardOrder,
    mobileCardOrder,
    columns,
    columnWidths: normalizeColumnWidths(data.columnWidths, columns.length),
    cardHeights: normalizeCardNumberMap(data.cardHeights),
    cardColors: normalizeCardColorMap(data.cardColors),
    visibility: normalizeVisibility(data.visibility)
  };
}

function parseJSON(value: unknown, fallback: unknown) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeWorkspaceProfiles(value: unknown): WorkspaceUserProfile[] {
  const decoded = parseJSON(value, []);
  if (!Array.isArray(decoded)) return [];

  return decoded
    .filter((profile): profile is Record<string, unknown> => Boolean(profile) && typeof profile === "object" && !Array.isArray(profile))
    .map(profile => ({
      userId: typeof profile.userId === "string" ? profile.userId.trim() : "",
      snapshotJSON: typeof profile.snapshotJSON === "string" ? profile.snapshotJSON : ""
    }))
    .filter(profile => profile.userId.length > 0);
}

function layoutFromWorkspaceSnapshot(value: unknown, orderId?: string) {
  const snapshot = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const columns = Array.isArray(snapshot.kartYerlesimi) ? snapshot.kartYerlesimi : undefined;

  return normalizeOrderDetailCardLayout({
    columns,
    mobileCardOrder: snapshot.phoneKartSirasi ?? snapshot.mobileCardOrder ?? snapshot.phoneCardOrder ?? (Array.isArray(columns) ? columns.flat() : undefined),
    columnWidths: snapshot.sutunGenislikleri,
    cardHeights: cardHeightsFromWorkspaceSnapshot(snapshot, orderId),
    cardColors: snapshot.kartRenkleri,
    visibility: snapshot.visibility
  });
}

export function layoutFromOrderWorkspaceSnapshotJSON(value: unknown, orderId?: string) {
  const snapshot = parseJSON(value, null);
  return snapshot ? layoutFromWorkspaceSnapshot(snapshot, orderId) : null;
}

function layoutFromWorkspaceSettings(data: Record<string, unknown>, uid: string, ownerUid: string, orderId?: string) {
  const profiles = normalizeWorkspaceProfiles(data.workspaceUserProfilesJSON);
  const ownProfile = profiles.find(profile => profile.userId === uid);
  const ownerProfile = ownerUid ? profiles.find(profile => profile.userId === ownerUid) : undefined;
  const profile = ownProfile ?? ownerProfile;
  const profileSnapshot = profile ? parseJSON(profile.snapshotJSON, null) : null;
  const sharedSnapshot = parseJSON(data.sharedWorkspaceSnapshotJSON, null);

  if (profileSnapshot) return layoutFromWorkspaceSnapshot(profileSnapshot, orderId);
  if (sharedSnapshot) return layoutFromWorkspaceSnapshot(sharedSnapshot, orderId);
  return DEFAULT_ORDER_DETAIL_CARD_LAYOUT;
}

function friendlyCardLayoutError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("StudioFlow Lite")) return "Card customization is available from StudioFlow Lite.";
  if (/permission|insufficient|unauthenticated|access/i.test(message)) {
    if (/load/i.test(fallback)) {
      return "Could not load card layout. Please check your workspace access and try again.";
    }
    return "Could not save card layout. Please check your workspace access and try again.";
  }
  return message || fallback;
}

async function callCardLayoutFunction(name: string, payload: Record<string, unknown>, fallbackMessage: string) {
  try {
    const callable = httpsCallable<Record<string, unknown>, CardLayoutCallableResult>(functions, name);
    const response = await callable(payload);
    if (response.data?.ok === false) {
      throw new Error(response.data.message || fallbackMessage);
    }
    return response.data;
  } catch (error) {
    throw new Error(friendlyCardLayoutError(error, fallbackMessage));
  }
}

export async function loadOrderDetailCardLayout(uid: string, workspaceId: string, orderId?: string) {
  if (!uid || !workspaceId) return DEFAULT_ORDER_DETAIL_CARD_LAYOUT;
  const response = await callCardLayoutFunction(
    "getWorkspaceCardLayout",
    { companyId: workspaceId, orderId: normalizeOrderId(orderId) || undefined },
    "Could not load card layout. Using the default layout for now."
  );
  return normalizeOrderDetailCardLayout(response.layout);
}

export async function saveOrderDetailCardLayout(uid: string, workspaceId: string, layout: OrderDetailCardLayout, orderId?: string) {
  if (!uid || !workspaceId) {
    throw new Error("Sign in again to save card customization.");
  }
  const normalized = normalizeOrderDetailCardLayout(layout);
  const cleanOrderId = normalizeOrderId(orderId);
  const response = await withWebSyncStatus(() => callCardLayoutFunction(
      "saveWorkspaceCardLayout",
      {
        companyId: workspaceId,
        orderId: cleanOrderId || undefined,
        layout: normalized
      },
      "Could not save card layout. Please try again."
    ),
    "Saving card layout to cloud."
  );
  return normalizeOrderDetailCardLayout(response.layout || normalized);
}

export async function saveIndependentOrderCardLayout(uid: string, workspaceId: string, orderId: string, layout: OrderDetailCardLayout) {
  if (!uid || !workspaceId || !orderId) {
    throw new Error("Sign in again to save this order layout.");
  }
  const normalized = normalizeOrderDetailCardLayout(layout);
  const response = await withWebSyncStatus(() => callCardLayoutFunction(
      "saveOrderWorkspaceCardLayout",
      {
        companyId: workspaceId,
        orderId,
        layout: normalized
      },
      "Could not save this order layout. Please try again."
    ),
    "Saving this order layout to cloud."
  );
  return normalizeOrderDetailCardLayout(response.layout || normalized);
}

export async function resetIndependentOrderCardLayout(uid: string, workspaceId: string, orderId: string) {
  if (!uid || !workspaceId || !orderId) {
    throw new Error("Sign in again to reset this order layout.");
  }
  const response = await withWebSyncStatus(() => callCardLayoutFunction(
      "resetOrderWorkspaceCardLayout",
      {
        companyId: workspaceId,
        orderId
      },
      "Could not rejoin the shared card layout. Please try again."
    ),
    "Rejoining the shared card layout."
  );
  return normalizeOrderDetailCardLayout(response.layout);
}

export function subscribeOrderDetailCardLayout(
  uid: string,
  workspaceId: string,
  ownerUid: string,
  orderId: string | undefined,
  onLayout: (layout: OrderDetailCardLayout) => void,
  onError: (message: string) => void
) {
  if (!uid || !workspaceId) return () => {};

  const settingsRef = doc(db, "companySettings", workspaceId);
  let disposed = false;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;

  const applySnapshotData = (data: Record<string, unknown>) => {
    if (disposed) return;
    onLayout(layoutFromWorkspaceSettings(data, uid, ownerUid, orderId));
  };

  const scheduleSettledRefresh = () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      void getDoc(settingsRef)
        .then(latestSnapshot => {
          if (disposed || !latestSnapshot.exists()) return;
          applySnapshotData(latestSnapshot.data() as Record<string, unknown>);
        })
        .catch(() => {
          // The live listener remains the source of truth; this is only a small
          // catch-up read for rapid Mac/iPad resize writes.
        });
    }, 180);
  };

  const unsubscribe = onSnapshot(
    settingsRef,
    snapshot => {
      const data = snapshot.exists() ? snapshot.data() as Record<string, unknown> : {};
      applySnapshotData(data);
      scheduleSettledRefresh();
    },
    error => {
      onError(friendlyCardLayoutError(error, "Could not listen for card layout changes."));
    }
  );

  return () => {
    disposed = true;
    if (refreshTimer) clearTimeout(refreshTimer);
    unsubscribe();
  };
}
