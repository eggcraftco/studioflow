// Online booking — the signed-in side (Settings ▸ Online booking and the booking block in the
// Calendar), 1 Nov 2026. Everything goes through the `bookingAdmin` callable: the setup, the slug,
// the bookings and every action on them live in server-only collections, and the server decides who
// may do what (owner/admin change the setup; a member sees and acts on their own bookings only).
// Design: docs/integrations/ONLINE-BOOKING-TASARIM-2026-11-01.md.

import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";

export type BookingWindow = { start: string; end: string };
export type BookingHours = Record<"1" | "2" | "3" | "4" | "5" | "6" | "7", BookingWindow[]>;
export type BookingPriceMode = "free" | "fixed" | "from" | "quote" | "hidden";
export type BookingLocation = "in_person" | "phone" | "video" | "customer_address";
export type BookingFieldMode = "hidden" | "optional" | "required";

export type BookingService = {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  priceMode: BookingPriceMode;
  priceMinor: number | null;
  approval: "instant" | "request";
  location: BookingLocation;
  providerUids: string[];
  createOrder: boolean;
  active: boolean;
  color: string | null;
};

export type BookingProvider = { uid: string; name: string; hours: BookingHours; useWorkdays: boolean; active: boolean };

export type BookingConfig = {
  enabled: boolean;
  slug: string | null;
  timeZone: string;
  currency: string;
  page: { title: string; intro: string; showLogo: boolean; accentColor: string | null };
  services: BookingService[];
  providers: BookingProvider[];
  rules: {
    slotStepMin: number;
    minNoticeMin: number;
    maxDaysAhead: number;
    dailyMaxPerProvider: number | null;
    closedDates: string[];
    allowCancel: boolean;
    allowReschedule: boolean;
    changeCutoffMin: number;
  };
  form: { phone: BookingFieldMode; address: BookingFieldMode; notes: BookingFieldMode; question: string; questionRequired: boolean };
  notify: { emailBusiness: boolean; customerReminderHours: number };
  calendarVisibility: "private" | "workspace";
};

export type BookingSetup = {
  ok: boolean;
  saved: boolean;
  canManage: boolean;
  open: boolean;
  planAllowed: boolean;
  config: BookingConfig;
  url: string | null;
  suggestedSlug: string;
  businessName: string;
  businessType: string;
  timeZone: string;
  currency: string;
  members: { uid: string; name: string; role: string }[];
  version?: number;
};

export type StaffBooking = {
  id: string;
  status: "pending" | "confirmed" | "declined" | "cancelled" | "completed" | "no_show" | "expired";
  source: string;
  serviceId: string;
  serviceName: string;
  durationMin: number;
  priceMode: BookingPriceMode;
  priceMinor: number | null;
  currency: string;
  location: BookingLocation;
  providerUid: string;
  providerName: string;
  dateKey: string;
  startTime: string;
  endTime: string;
  timeZone: string;
  startMs: number;
  endMs: number;
  customer: { name: string; email: string; phone: string; address: string; notes: string; answer: string };
  customerId: string | null;
  orderId: string | null;
  orderError: string | null;
  language: string;
  endedBy: string | null;
  businessMessage: string;
  createdAtMs: number | null;
  history: { atMs: number; action: string; by: string }[];
};

/** A calendar row made by online booking (functions/booking: id `bk_<bookingId>`, source "online_booking"). */
export const BOOKING_ENTRY_PREFIX = "bk_";
export function bookingIdFromEntryId(entryId: string | null | undefined): string | null {
  const id = String(entryId || "");
  return id.startsWith(BOOKING_ENTRY_PREFIX) && id.length > BOOKING_ENTRY_PREFIX.length ? id.slice(BOOKING_ENTRY_PREFIX.length) : null;
}

async function admin<T>(action: string, companyId: string, payload: Record<string, unknown> = {}): Promise<T> {
  const callable = httpsCallable<Record<string, unknown>, T>(functions, "bookingAdmin");
  return (await callable({ action, companyId, ...payload })).data;
}

export const loadBookingSetup = (companyId: string) => admin<BookingSetup>("get", companyId);
export const checkBookingSlug = (companyId: string, slug: string) => admin<{ available: boolean; reason: string | null }>("checkSlug", companyId, { slug });
export const saveBookingSetup = (companyId: string, config: BookingConfig, version: number | null) =>
  admin<{ config: BookingConfig; version: number; url: string | null }>("save", companyId, { config, ...(version === null ? {} : { version }) });
export const listBookings = (companyId: string, fromMs: number, toMs: number) => admin<{ bookings: StaffBooking[] }>("list", companyId, { fromMs, toMs });
export const listPendingBookings = (companyId: string) => admin<{ bookings: StaffBooking[] }>("pending", companyId);
export const bookingDetail = (companyId: string, bookingId: string) => admin<{ booking: StaffBooking; canAct: boolean }>("detail", companyId, { bookingId });
export const bookingTimes = (companyId: string, bookingId: string, from: string, to: string) =>
  admin<{ timeZone: string; days: { dateKey: string; times: { time: string; startMs: number }[] }[] }>("times", companyId, { bookingId, from, to });
export type BookingAction = "confirm" | "decline" | "cancel" | "noShow" | "complete";
export const actOnBooking = (companyId: string, bookingId: string, action: BookingAction, message = "", notify = true) =>
  admin<{ booking: StaffBooking }>(action, companyId, { bookingId, message, notify });
export const rescheduleBooking = (companyId: string, bookingId: string, dateKey: string, time: string, message = "", notify = true) =>
  admin<{ booking: StaffBooking }>("reschedule", companyId, { bookingId, dateKey, time, message, notify });
export const linkBookingOrder = (companyId: string, bookingId: string, orderId: string) => admin<{ ok: boolean }>("linkOrder", companyId, { bookingId, orderId });

// ---------------------------------------------------------------- building the setup

export const WEEKDAY_KEYS = ["1", "2", "3", "4", "5", "6", "7"] as const;

export function defaultHours(): BookingHours {
  const day = [{ start: "09:00", end: "17:00" }];
  return { 1: day, 2: [...day], 3: [...day], 4: [...day], 5: [...day], 6: [], 7: [] } as unknown as BookingHours;
}

export function newServiceId(existing: BookingService[]): string {
  let n = existing.length + 1;
  while (existing.some((s) => s.id === `svc${n}`)) n += 1;
  return `svc${n}`;
}

export function blankService(existing: BookingService[], over: Partial<BookingService> = {}): BookingService {
  return {
    id: newServiceId(existing),
    name: "",
    description: "",
    durationMin: 30,
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    priceMode: "hidden",
    priceMinor: null,
    approval: "instant",
    location: "in_person",
    providerUids: [],
    createOrder: false,
    active: true,
    color: null,
    ...over
  };
}

/** Same rule as the server (functions/booking/bookingCore.js slugify). */
export function bookingSlugFrom(name: string): string {
  const base = String(name || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return base.length >= 3 ? base : (base ? `${base}-studio` : "studio");
}

export const BOOKING_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/;

// Starting services by trade, matched from the workspace's business type with the same keywords the
// repair intake presets use (functions/index.js REPAIR_INTAKE_PRESET_KEYWORDS). English names: the
// business edits them, and the page shows exactly what they typed.
export type BookingPreset = { name: string; durationMin: number; location?: BookingLocation; approval?: "instant" | "request" };
const PRESETS: { id: string; terms: string[]; services: BookingPreset[] }[] = [
  { id: "jewellery", terms: ["jewel", "goldsmith", "silversmith", "kuyum", "mucevher", "mücevher", "altin", "altın"], services: [
    { name: "Design consultation", durationMin: 45, approval: "request" }, { name: "Ring sizing", durationMin: 15 }, { name: "Repair drop-off", durationMin: 15 }, { name: "Collection", durationMin: 10 }
  ] },
  { id: "repair", terms: ["repair", "electronic", "phone", "mobile", "computer", "laptop", "device", "watch", "clock", "bicycle", "bike", "tamir", "elektronik", "telefon", "bilgisayar", "saat"], services: [
    { name: "Repair drop-off", durationMin: 15 }, { name: "Diagnosis", durationMin: 30 }, { name: "Collection", durationMin: 10 }
  ] },
  { id: "tailoring", terms: ["tailor", "alteration", "garment", "seamstress", "bridal", "terzi", "dikis", "dikiş", "gelinlik"], services: [
    { name: "Measurements", durationMin: 30 }, { name: "Fitting", durationMin: 30 }, { name: "Alteration drop-off", durationMin: 15 }, { name: "Collection", durationMin: 10 }
  ] },
  { id: "furniture", terms: ["furniture", "upholster", "carpent", "joinery", "kitchen", "mobilya", "doseme", "döşeme", "marangoz"], services: [
    { name: "Showroom visit", durationMin: 45 }, { name: "Home measure", durationMin: 60, location: "customer_address", approval: "request" }, { name: "Design consultation", durationMin: 60 }
  ] },
  { id: "print", terms: ["print", "sign", "graphic", "design", "embroider", "baski", "baskı", "tabela", "nakis", "nakış"], services: [
    { name: "Brief call", durationMin: 30, location: "phone" }, { name: "Proof review", durationMin: 15, location: "video" }, { name: "Collection", durationMin: 10 }
  ] },
  { id: "studio", terms: ["photo", "studio", "art", "ceramic", "pottery", "tattoo", "foto", "stüdyo", "studyo", "seramik"], services: [
    { name: "Consultation", durationMin: 30 }, { name: "Session", durationMin: 60 }
  ] }
];
const GENERAL: BookingPreset[] = [{ name: "Consultation", durationMin: 30 }, { name: "Drop-off", durationMin: 15 }, { name: "Collection", durationMin: 10 }];

export function presetsForBusinessType(businessType: string): BookingPreset[] {
  const raw = String(businessType || "").toLowerCase();
  for (const p of PRESETS) if (p.terms.some((term) => raw.includes(term))) return p.services;
  return GENERAL;
}

export const DURATION_CHOICES = [5, 10, 15, 20, 30, 45, 60, 75, 90, 120, 150, 180, 240];
export const BUFFER_CHOICES = [0, 5, 10, 15, 20, 30, 45, 60];
export const STEP_CHOICES = [0, 10, 15, 20, 30, 45, 60, 90, 120];
export const NOTICE_CHOICES = [0, 30, 60, 120, 240, 720, 1440, 2880, 4320, 10080];
export const DAYS_AHEAD_CHOICES = [7, 14, 21, 30, 60, 90, 180, 365];
export const CUTOFF_CHOICES = [0, 60, 120, 240, 720, 1440, 2880];
export const REMINDER_CHOICES = [0, 2, 24, 48];

/** Minor units from what the person typed ("25", "25.50", "25,50"). Null when it is not a price. */
export function priceMinorFrom(text: string): number | null {
  const cleaned = String(text || "").trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

export function priceText(minor: number | null): string {
  return minor === null || !Number.isFinite(minor) ? "" : (minor / 100).toFixed(minor % 100 === 0 ? 0 : 2);
}

/** The iframe code a business pastes into its website. The page tells the frame its height. */
export function bookingEmbedCode(url: string): string {
  const src = `${url}${url.includes("?") ? "&" : "?"}embed=1`;
  return [
    `<iframe src="${src}" title="Book online" style="width:100%;max-width:640px;border:0;min-height:720px" loading="lazy" id="nivadesk-booking"></iframe>`,
    `<script>window.addEventListener("message",function(e){if(e.origin!=="${new URL(url).origin}")return;var d=e.data||{};if(d.type==="nivadesk-booking-height"){var f=document.getElementById("nivadesk-booking");if(f)f.style.height=d.height+"px";}});</script>`
  ].join("\n");
}
