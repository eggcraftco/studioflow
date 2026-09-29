// Live courier status on the order's Shipping & Tracking card.
//
// The server answers a tracking number in two places (functions/index.js): the order's own
// `tracking::<key>` custom fields (registerTracking, the hourly scheduledTrackingRefresh, and the
// track17Webhook when the parcel moves or is delivered) and the row
// companies/{companyId}/trackingResults/{orderId} (all three, every time — the webhook's only
// write for a state that is not movement, such as an exception). The Mac and the iPhone read both,
// the row first, and so does this: the same order shows the same answer on every screen.
//
// Who answered is on the answer itself (`provider`): 17TRACK follows any number the merchant types;
// DHL Express follows its own waybills directly when DHL is connected for the workspace (the
// server then does not register the number with 17TRACK); Royal Mail's own API answers Royal Mail
// numbers when it is configured. The panel names that provider instead of assuming 17TRACK.
//
// Pure: no Firebase import, so scripts/check-live-tracking.mjs can compile and run it.

export const TRACKING_KEYS = [
  "trackingNumber", "status", "statusText", "subStatus", "carrier", "carrierCode", "checkpoint", "location",
  "eta", "lastUpdate", "lastCheckedAt", "trackingUrl", "provider", "trackingSupportStatus", "supportMessage",
  "supportMessageKey", "error"
] as const;

export type TrackingValues = Partial<Record<(typeof TRACKING_KEYS)[number], string>>;

export function cleanTrackingNumber(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, "");
}

/** The order's `tracking::` custom fields as plain values. */
export function trackingFieldsFromCustomFields(customFields: Record<string, string> | null | undefined): TrackingValues {
  const out: TrackingValues = {};
  for (const key of TRACKING_KEYS) {
    const value = customFields?.[`tracking::${key}`];
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

/**
 * The answer for the number the order carries NOW. A row or a set of fields written for a
 * previous number is not this number's answer and is dropped whole (the Mac's rule); what is left
 * is merged with the live row winning over the stored fields, value by value, when it has one.
 */
export function currentTrackingValues(orderTrackingNumber: string, stored: TrackingValues, live: TrackingValues | null): TrackingValues {
  const current = cleanTrackingNumber(orderTrackingNumber);
  if (!current) return {};
  const belongs = (values: TrackingValues | null) => {
    if (!values) return false;
    const number = cleanTrackingNumber(values.trackingNumber);
    return !number || number === current;
  };
  const merged: TrackingValues = {};
  if (belongs(stored)) Object.assign(merged, stored);
  if (live && belongs(live)) {
    for (const key of TRACKING_KEYS) {
      const value = live[key];
      if (typeof value === "string" && value.trim()) merged[key] = value;
    }
    // The four the server clears on purpose: an empty value in the row is the current answer.
    for (const key of ["supportMessage", "supportMessageKey", "error", "trackingSupportStatus"] as const) {
      if (typeof live[key] === "string") merged[key] = live[key];
    }
  }
  merged.trackingNumber = current;
  return merged;
}

export function isRegistered(values: TrackingValues): boolean {
  return Boolean((values.status || values.statusText || values.provider || "").trim());
}

/** Who answered: "17TRACK", "DHL Express", "Royal Mail", or the provider the server named. */
export function trackingProvider(values: TrackingValues): string {
  const provider = String(values.provider || "").trim();
  if (!provider) return "17TRACK"; // an unregistered number is registered with 17TRACK by default
  const lower = provider.toLowerCase();
  if (lower === "17track") return "17TRACK";
  if (lower.includes("dhl")) return "DHL Express";
  if (lower.includes("royal mail")) return "Royal Mail";
  return provider;
}

export function trackingDisplayStatus(values: TrackingValues): string {
  return (values.statusText || "").trim() || (values.status || "").trim() || "Not Registered";
}

/** 17TRACK's package states arrive as codes ("InTransit"); these are their words. Any other sentence passes through. */
const STATUS_LABELS: Record<string, string> = {
  notfound: "Not found", inforeceived: "Info received", intransit: "In transit", expired: "Expired",
  availableforpickup: "Available for pickup", outfordelivery: "Out for delivery", deliveryfailure: "Delivery failed",
  delivered: "Delivered", exception: "Exception", registering: "Registering", registered: "Registered",
  waiting: "Waiting", error: "Error", limitedsupport: "Limited support", carrierrequired: "Carrier required",
  notregistered: "Not Registered", labelcreated: "Label created", pickupbooked: "Pickup booked", pickedup: "Picked up",
  incustoms: "In customs", cancelled: "Cancelled"
};

function compact(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function trackingStatusLabel(status: string): string {
  return STATUS_LABELS[compact(status)] ?? status;
}

/** The support row's word, or "" when the answer is a healthy one and the row is not shown. */
export function trackingSupportLabel(value: string): string {
  switch (value.trim().toLowerCase()) {
    case "":
    case "active":
    case "supported": return "";
    case "waiting": return "Waiting";
    case "limited": return "Limited support";
    case "carrier_required": return "Carrier required";
    case "unsupported": return "Unsupported";
    case "credentials_missing": return "Not configured";
    case "error": return "Error";
    default: return value;
  }
}

/** The server's support message by its key, in the words this app has; an unknown key shows the server's own sentence. */
export function trackingSupportMessage(message: string, key: string): string {
  switch (key.trim().toLowerCase()) {
    case "checking_support": return "Checking 17TRACK support for this tracking number.";
    case "carrier_required_message": return "Carrier could not be auto-detected. Choose the courier and refresh live status again.";
    case "registered_waiting": return "Registered with 17TRACK and waiting for the next carrier update.";
    case "royal_mail_limited": return "Royal Mail live updates can be limited for this service.";
    case "fedex_limited": return "FedEx may need extra carrier details before full tracking is available.";
    case "token_missing": return "Live tracking is not configured on the server yet.";
    case "courier_not_mapped": return "This courier is not mapped for live tracking yet.";
    case "dhl_express_direct": return "This waybill is tracked directly with DHL Express, so it was not registered with 17TRACK as well.";
    default: return message;
  }
}

export const TRACKING_TONES = { green: "#16a34a", red: "#dc2626", orange: "#ea580c", blue: "#2563eb", muted: "#64748b" } as const;

export function trackingTone(status: string, supportStatus: string): string {
  switch (supportStatus.trim().toLowerCase()) {
    case "waiting": return TRACKING_TONES.blue;
    case "limited":
    case "carrier_required":
    case "unsupported":
    case "credentials_missing": return TRACKING_TONES.orange;
    case "error": return TRACKING_TONES.red;
    default: break;
  }
  const value = compact(status);
  if (value.includes("delivered") && !value.includes("fail")) return TRACKING_TONES.green;
  if (["exception", "fail", "expired", "error", "cancelled"].some(word => value.includes(word))) return TRACKING_TONES.red;
  if (value.includes("outfordelivery") || value.includes("pickup") || value.includes("customs")) return TRACKING_TONES.orange;
  if (["notfound", "pending", "notregistered"].some(word => value.includes(word))) return TRACKING_TONES.muted;
  return TRACKING_TONES.blue;
}

/** Where "Open Tracking" goes: the answer's own page, else the provider's page for this number. */
export function trackingOpenUrl(values: TrackingValues, orderTrackingNumber: string): string {
  const stored = String(values.trackingUrl || "").trim();
  if (/^https:\/\//i.test(stored)) return stored;
  const number = encodeURIComponent(cleanTrackingNumber(orderTrackingNumber));
  if (trackingProvider(values) === "DHL Express") return `https://www.dhl.com/gb-en/home/tracking/tracking-express.html?submit=1&tracking-id=${number}`;
  return `https://www.17track.net/en/track-details?nums=${number}`;
}

/** An ISO time as a local date and time; anything else is shown as the server wrote it. */
export function formatTrackingDate(value: string | undefined, locale: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) return trimmed;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return trimmed;
  try {
    return new Intl.DateTimeFormat(locale || undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
  } catch {
    return trimmed;
  }
}
