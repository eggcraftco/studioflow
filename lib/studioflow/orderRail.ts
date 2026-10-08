// The collapsed order list's rail (8 Oct 2026): what each square shows when the
// Orders or Schedule list is folded to its narrow width. Pure, so a test can
// hold it: the photo when the order has one, otherwise the customer's
// initials, otherwise the project number, otherwise the design's initials; a
// status colour on every square; and the tooltip's three facts in a fixed order
// (number, customer, status). The component (components/OrderListRail.tsx) only
// draws what these say.

export type OrderRailItem = {
  id: string;
  customerName: string;
  designName: string;
  status: string;
  previewImageUrl: string;
  projectNumber?: number;
  isDispatched?: boolean;
};

export type OrderRailTone = "success" | "danger" | "neutral" | "warning";

/** The same reading of a status as the list card's chip (components/OrderListCard.tsx statusTone). */
export function orderRailTone(status: string, isDispatched = false): OrderRailTone {
  const normalized = String(status || "").trim().toLowerCase();
  if (isDispatched) return "success";
  if (["none", "done", "completed", "delivered", "approved", "deposit paid", "shipped", "ready to ship"].includes(normalized)) return "success";
  if (["not yet", "blocked", "overdue", "urgent"].includes(normalized)) return "danger";
  if (["cancelled", "canceled", "refunded", "new", "quoted", "low"].includes(normalized)) return "neutral";
  return "warning";
}

function initials(value: string): string {
  const cleaned = String(value || "").replace(/[._-]+/g, " ").trim();
  if (!cleaned) return "";
  const words = cleaned.split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map(word => Array.from(word)[0] || "").join("");
  return letters.toLocaleUpperCase();
}

/** Only an address a browser can fetch as an image; a pasted shop link or an empty field earns the fallback. */
export function orderRailImageUrl(value: string): string {
  const raw = String(value || "").trim();
  if (!/^https?:\/\//i.test(raw)) return "";
  const path = raw.toLowerCase().split("?")[0];
  if (/\.(png|jpe?g|webp|gif|heic|heif|avif|bmp|svg)$/.test(path)) return raw;
  // An uploaded file keeps its name inside the encoded Storage path ("…%2Fpreview.jpg?alt=media").
  if (/firebasestorage\.googleapis\.com|\.firebasestorage\.app|storage\.googleapis\.com/.test(path) && /\.(png|jpe?g|webp|gif|heic|heif|avif)(%3F|$)/i.test(path)) return raw;
  return "";
}

/** The letters or number shown when there is no photo. */
export function orderRailFallbackText(order: OrderRailItem): string {
  const fromCustomer = initials(order.customerName);
  if (fromCustomer) return fromCustomer;
  if (order.projectNumber && order.projectNumber > 0) return `#${order.projectNumber}`;
  const fromDesign = initials(order.designName);
  return fromDesign || "•";
}

/** "#12 · Jane Doe · In Progress": the number only when the order has one; the status already in the reader's language. */
export function orderRailTooltip(order: OrderRailItem, statusText: string): string {
  const parts: string[] = [];
  if (order.projectNumber && order.projectNumber > 0) parts.push(`#${order.projectNumber}`);
  const customer = String(order.customerName || "").trim();
  if (customer) parts.push(customer);
  const status = String(statusText || order.status || "").trim();
  if (status) parts.push(status);
  return parts.join(" · ");
}
