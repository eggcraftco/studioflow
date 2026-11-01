// Online booking — the business's public page (/book/<slug>) and the customer's manage page
// (/book/manage#<token>), 1 Nov 2026. Design: docs/integrations/ONLINE-BOOKING-TASARIM-2026-11-01.md.
//
// The customer is not a NivaDesk user: no sign-in, no app shell, no cookie banner (nothing is set but
// what the page needs), never indexed. What the page shows comes from the `bookingPublic` callable,
// which sends only the service list, free times and the business's name/logo — never account ids,
// member e-mails or anything about other bookings. Times are the business's wall clock in its zone.
//
// Erasable TypeScript only (no enums, no path aliases): scripts/check-online-booking.mts imports this
// file directly under Node's type stripping.

import type { PaymentReturnLanguage } from "./paymentReturn";

export type BookingLanguage = PaymentReturnLanguage;
export type BookingPriceMode = "free" | "fixed" | "from" | "quote" | "hidden";
export type BookingLocation = "in_person" | "phone" | "video" | "customer_address";
export type BookingFieldMode = "hidden" | "optional" | "required";
export type BookingStatus = "pending" | "confirmed" | "declined" | "cancelled" | "completed" | "no_show" | "expired";

export type BookingServiceView = {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  priceMode: BookingPriceMode;
  priceMinor: number | null;
  approval: "instant" | "request";
  location: BookingLocation;
  color: string | null;
  providers: { id: string; name: string }[];
};

export type BookingPageView = {
  business: { name: string; logoUrl: string | null; accentColor: string | null; country: string | null };
  title: string;
  intro: string;
  timeZone: string;
  currency: string;
  services: BookingServiceView[];
  choosePerson: boolean;
  form: { phone: BookingFieldMode; address: BookingFieldMode; notes: BookingFieldMode; question: string; questionRequired: boolean };
  rules: { maxDaysAhead: number; allowCancel: boolean; allowReschedule: boolean; changeCutoffMin: number };
};

export type BookingDay = { dateKey: string; times: { time: string; startMs: number }[] };

export type BookingSummary = {
  status: BookingStatus;
  serviceName: string;
  dateKey: string;
  startTime: string;
  endTime: string;
  startMs: number;
  endMs: number;
  timeZone: string;
  durationMin: number;
  providerName: string;
  location: BookingLocation;
  address: string;
  priceMode: BookingPriceMode;
  priceMinor: number | null;
  currency: string;
  customerName: string;
  businessName: string;
};

export const BOOKING_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/;
export const BOOKING_TOKEN_RE = /^[A-Za-z0-9_-]{20,80}$/;
/** How many days the day strip shows and asks the server for at once (the server allows 14). */
export const BOOKING_STRIP_DAYS = 14;

export function bookingSlug(raw: string | undefined | null): string {
  const value = String(raw ?? "").trim().toLowerCase();
  return BOOKING_SLUG_RE.test(value) && !value.includes("--") ? value : "";
}

export function bookingToken(raw: string | undefined | null): string {
  const value = String(raw ?? "").replace(/^#/, "").trim();
  return BOOKING_TOKEN_RE.test(value) ? value : "";
}

// ---------------------------------------------------------------- dates in the business's zone

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Today's "YYYY-MM-DD" in `timeZone`. */
export function todayKeyIn(timeZone: string, nowMs: number = Date.now()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(nowMs));
    const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    const d = new Date(nowMs);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
}

export function addDaysKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86400000;
  const n = new Date(t);
  return `${n.getUTCFullYear()}-${pad(n.getUTCMonth() + 1)}-${pad(n.getUTCDate())}`;
}

export function daysBetween(fromKey: string, toKey: string): number {
  const [a, b] = [fromKey, toKey].map((k) => { const [y, m, d] = k.split("-").map(Number); return Date.UTC(y, m - 1, d); });
  return Math.round((b - a) / 86400000);
}

/** The keys of a strip of `count` days from `fromKey`. */
export function stripKeys(fromKey: string, count: number = BOOKING_STRIP_DAYS): string[] {
  return Array.from({ length: count }, (_, i) => addDaysKey(fromKey, i));
}

/** "Tue", "3", "Nov" for a day chip, in the page language (a calendar date: no zone shift). */
export function dayChipParts(dateKey: string, locale: string): { weekday: string; day: string; month: string } {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  const fmt = (o: Intl.DateTimeFormatOptions) => {
    try { return new Intl.DateTimeFormat(locale, { ...o, timeZone: "UTC" }).format(date); } catch { return ""; }
  };
  return { weekday: fmt({ weekday: "short" }), day: String(d), month: fmt({ month: "short" }) };
}

/** "Tuesday 3 November" in the page language. */
export function longDate(dateKey: string, locale: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  try {
    return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d, 12)));
  } catch {
    return dateKey;
  }
}

/** "London" from "Europe/London"; the visitor reads the city, not the IANA id. */
export function zoneCity(timeZone: string): string {
  const last = String(timeZone || "").split("/").pop() || "";
  return last.replace(/_/g, " ");
}

/** True when the visitor's own zone shows a different clock from the business's right now. */
export function visitorZoneDiffers(timeZone: string, nowMs: number = Date.now()): boolean {
  try {
    const visitor = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!visitor || visitor === timeZone) return false;
    const at = (zone: string) => new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(nowMs));
    return at(visitor) !== at(timeZone);
  } catch {
    return false;
  }
}

export function bookingLocale(language: BookingLanguage): string {
  return ({ en: "en-GB", tr: "tr-TR", de: "de-DE", fr: "fr-FR", it: "it-IT", es: "es-ES", pt: "pt-PT", ru: "ru-RU", ja: "ja-JP", zh: "zh-CN", ar: "ar", hi: "hi-IN" } as Record<BookingLanguage, string>)[language] || "en-GB";
}

export function bookingMoney(minor: number | null, currency: string, language: BookingLanguage): string {
  if (minor === null || !Number.isFinite(Number(minor))) return "";
  try {
    return new Intl.NumberFormat(bookingLocale(language), { style: "currency", currency: /^[A-Z]{3}$/.test(currency) ? currency : "GBP" }).format(Number(minor) / 100);
  } catch {
    return (Number(minor) / 100).toFixed(2);
  }
}

/** The price line of a service card ("Free", "£25.00", "from £40.00", "Price on request"), or "" when hidden. */
export function priceLabel(service: Pick<BookingServiceView, "priceMode" | "priceMinor">, currency: string, language: BookingLanguage): string {
  const c = BOOKING_COPY[language];
  switch (service.priceMode) {
    case "free": return c.free;
    case "fixed": return bookingMoney(service.priceMinor, currency, language);
    case "from": return c.from.replace("{price}", bookingMoney(service.priceMinor, currency, language));
    case "quote": return c.quote;
    default: return "";
  }
}

export function locationLabel(location: BookingLocation, language: BookingLanguage): string {
  const c = BOOKING_COPY[language];
  return { in_person: c.locInPerson, phone: c.locPhone, video: c.locVideo, customer_address: c.locCustomer }[location] || c.locInPerson;
}

/** "24 hours" / "2 days" for the cut-off sentence. */
export function cutoffLabel(minutes: number, language: BookingLanguage): string {
  const c = BOOKING_COPY[language];
  if (minutes >= 2880 && minutes % 1440 === 0) return c.days.replace("{n}", String(minutes / 1440));
  if (minutes >= 60) return c.hours.replace("{n}", String(Math.round(minutes / 60)));
  return c.minutes.replace("{n}", String(minutes));
}

/** Splits the day's times into morning / afternoon / evening (business clock), dropping empty parts. */
export function timesByPart(times: { time: string; startMs: number }[]): { part: "morning" | "afternoon" | "evening"; times: { time: string; startMs: number }[] }[] {
  const parts: Record<"morning" | "afternoon" | "evening", { time: string; startMs: number }[]> = { morning: [], afternoon: [], evening: [] };
  for (const t of times) {
    const hour = Number(t.time.slice(0, 2));
    parts[hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"].push(t);
  }
  return (["morning", "afternoon", "evening"] as const).filter((p) => parts[p].length).map((p) => ({ part: p, times: parts[p] }));
}

/** A calendar file the customer can save, from the server's .ics text. */
export function icsDataUrl(ics: string): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

// ---------------------------------------------------------------- words

export type BookingCopy = {
  loading: string;
  unavailableTitle: string;
  unavailableBody: string;
  failed: string;
  tooMany: string;
  retry: string;
  chooseService: string;
  choosePerson: string;
  anyone: string;
  chooseDay: string;
  chooseTime: string;
  morning: string;
  afternoon: string;
  evening: string;
  noTimesDay: string;
  noTimesRange: string;
  laterDates: string;
  earlierDates: string;
  free: string;
  from: string;
  quote: string;
  minutes: string;
  hours: string;
  days: string;
  locInPerson: string;
  locPhone: string;
  locVideo: string;
  locCustomer: string;
  requestNote: string;
  timesIn: string;
  change: string;
  yourDetails: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  optional: string;
  consent: string;
  privacy: string;
  policyChange: string;
  policyNoChange: string;
  confirm: string;
  sendRequest: string;
  sending: string;
  problemName: string;
  problemEmail: string;
  problemPhone: string;
  problemAddress: string;
  problemNotes: string;
  problemAnswer: string;
  problemConsent: string;
  slotTaken: string;
  tooManyForEmail: string;
  doneTitle: string;
  doneBody: string;
  requestTitle: string;
  requestBody: string;
  addToCalendar: string;
  manage: string;
  bookAnother: string;
  manageTitle: string;
  statusConfirmed: string;
  statusPending: string;
  statusCancelled: string;
  statusDeclined: string;
  statusExpired: string;
  statusCompleted: string;
  statusNoShow: string;
  cancelBooking: string;
  cancelAsk: string;
  yesCancel: string;
  keep: string;
  changeTime: string;
  moveTo: string;
  moved: string;
  cancelled: string;
  tooLate: string;
  linkInvalid: string;
  poweredBy: string;
};

export const BOOKING_LANGUAGES: readonly BookingLanguage[] = ["en", "tr", "de", "fr", "it", "es", "pt", "ru", "ja", "zh", "ar", "hi"];

export const BOOKING_COPY: Record<BookingLanguage, BookingCopy> = {
  en: {
    loading: "Loading…",
    unavailableTitle: "This booking page is not available",
    unavailableBody: "The link may be wrong, or the business has turned online booking off. Please contact them directly.",
    failed: "Something went wrong. Please try again.",
    tooMany: "Too many tries from this connection. Please wait a little and try again.",
    retry: "Try again",
    chooseService: "Choose a service",
    choosePerson: "Who would you like?",
    anyone: "No preference",
    chooseDay: "Choose a day",
    chooseTime: "Choose a time",
    morning: "Morning",
    afternoon: "Afternoon",
    evening: "Evening",
    noTimesDay: "No free times on this day. Please pick another day.",
    noTimesRange: "No free times in these two weeks.",
    laterDates: "Later dates",
    earlierDates: "Earlier dates",
    free: "Free",
    from: "from {price}",
    quote: "Price on request",
    minutes: "{n} min",
    hours: "{n} hours",
    days: "{n} days",
    locInPerson: "In person",
    locPhone: "By phone",
    locVideo: "Video call",
    locCustomer: "At your address",
    requestNote: "The business confirms this booking by email.",
    timesIn: "Times are in {zone} time.",
    change: "Change",
    yourDetails: "Your details",
    name: "Full name",
    email: "Email",
    phone: "Phone",
    address: "Address",
    notes: "Anything we should know?",
    optional: "optional",
    consent: "I agree that {business} keeps these details to manage my booking. NivaDesk processes them on its behalf.",
    privacy: "Privacy policy",
    policyChange: "You can cancel or change this booking online until {time} before it starts.",
    policyNoChange: "To change or cancel, please contact {business}.",
    confirm: "Confirm booking",
    sendRequest: "Send request",
    sending: "Booking…",
    problemName: "Please enter your name.",
    problemEmail: "Please enter a valid email address.",
    problemPhone: "Please enter a valid phone number.",
    problemAddress: "Please enter your address.",
    problemNotes: "Please fill this in.",
    problemAnswer: "Please answer this question.",
    problemConsent: "Please tick the box to continue.",
    slotTaken: "That time was just taken. Please pick another.",
    tooManyForEmail: "You already have several bookings here. Please contact the business to book more.",
    doneTitle: "You're booked",
    doneBody: "We've emailed the details to {email}.",
    requestTitle: "Request sent",
    requestBody: "{business} will confirm by email. We've sent a copy to {email}.",
    addToCalendar: "Add to calendar",
    manage: "Manage booking",
    bookAnother: "Book something else",
    manageTitle: "Your booking",
    statusConfirmed: "Confirmed",
    statusPending: "Waiting for confirmation",
    statusCancelled: "Cancelled",
    statusDeclined: "Not accepted",
    statusExpired: "Not confirmed in time",
    statusCompleted: "Completed",
    statusNoShow: "Missed",
    cancelBooking: "Cancel booking",
    cancelAsk: "Cancel this booking?",
    yesCancel: "Yes, cancel",
    keep: "Keep it",
    changeTime: "Change time",
    moveTo: "Move to {when}",
    moved: "Done — your booking has a new time. We've emailed you.",
    cancelled: "Your booking is cancelled. We've emailed you.",
    tooLate: "This booking can no longer be changed online. Please contact {business}.",
    linkInvalid: "This link is not valid any more.",
    poweredBy: "Booking by NivaDesk"
  },
  tr: {
    loading: "Yükleniyor…",
    unavailableTitle: "Bu randevu sayfası kullanılamıyor",
    unavailableBody: "Bağlantı yanlış olabilir ya da işletme online randevuyu kapatmış olabilir. Lütfen işletmeyle doğrudan iletişime geçin.",
    failed: "Bir sorun oldu. Lütfen yeniden deneyin.",
    tooMany: "Bu bağlantıdan çok fazla deneme yapıldı. Lütfen biraz bekleyip yeniden deneyin.",
    retry: "Yeniden dene",
    chooseService: "Hizmet seçin",
    choosePerson: "Kiminle?",
    anyone: "Fark etmez",
    chooseDay: "Gün seçin",
    chooseTime: "Saat seçin",
    morning: "Sabah",
    afternoon: "Öğleden sonra",
    evening: "Akşam",
    noTimesDay: "Bu günde boş saat yok. Lütfen başka bir gün seçin.",
    noTimesRange: "Bu iki haftada boş saat yok.",
    laterDates: "Sonraki günler",
    earlierDates: "Önceki günler",
    free: "Ücretsiz",
    from: "{price}'den başlayan",
    quote: "Fiyat için sorun",
    minutes: "{n} dk",
    hours: "{n} saat",
    days: "{n} gün",
    locInPerson: "Yüz yüze",
    locPhone: "Telefonla",
    locVideo: "Görüntülü görüşme",
    locCustomer: "Sizin adresinizde",
    requestNote: "İşletme bu randevuyu e-postayla onaylar.",
    timesIn: "Saatler {zone} saatiyle.",
    change: "Değiştir",
    yourDetails: "Bilgileriniz",
    name: "Ad soyad",
    email: "E-posta",
    phone: "Telefon",
    address: "Adres",
    notes: "Bilmemiz gereken bir şey var mı?",
    optional: "isteğe bağlı",
    consent: "{business} işletmesinin bu bilgileri randevumu yönetmek için saklamasını kabul ediyorum. NivaDesk bunları işletme adına işler.",
    privacy: "Gizlilik politikası",
    policyChange: "Bu randevuyu başlamasına {time} kalana kadar online iptal edebilir ya da değiştirebilirsiniz.",
    policyNoChange: "Değiştirmek ya da iptal etmek için lütfen {business} ile iletişime geçin.",
    confirm: "Randevuyu onayla",
    sendRequest: "İstek gönder",
    sending: "Randevu alınıyor…",
    problemName: "Lütfen adınızı yazın.",
    problemEmail: "Lütfen geçerli bir e-posta adresi yazın.",
    problemPhone: "Lütfen geçerli bir telefon numarası yazın.",
    problemAddress: "Lütfen adresinizi yazın.",
    problemNotes: "Lütfen bu alanı doldurun.",
    problemAnswer: "Lütfen bu soruyu yanıtlayın.",
    problemConsent: "Devam etmek için kutuyu işaretleyin.",
    slotTaken: "Bu saat az önce alındı. Lütfen başka bir saat seçin.",
    tooManyForEmail: "Burada zaten birkaç randevunuz var. Daha fazlası için lütfen işletmeyle iletişime geçin.",
    doneTitle: "Randevunuz alındı",
    doneBody: "Ayrıntıları {email} adresine e-postayla gönderdik.",
    requestTitle: "İstek gönderildi",
    requestBody: "{business} e-postayla onaylayacak. Bir kopyasını {email} adresine gönderdik.",
    addToCalendar: "Takvime ekle",
    manage: "Randevuyu yönet",
    bookAnother: "Başka bir randevu al",
    manageTitle: "Randevunuz",
    statusConfirmed: "Onaylandı",
    statusPending: "Onay bekliyor",
    statusCancelled: "İptal edildi",
    statusDeclined: "Kabul edilmedi",
    statusExpired: "Zamanında onaylanmadı",
    statusCompleted: "Tamamlandı",
    statusNoShow: "Gelinmedi",
    cancelBooking: "Randevuyu iptal et",
    cancelAsk: "Bu randevu iptal edilsin mi?",
    yesCancel: "Evet, iptal et",
    keep: "Vazgeç",
    changeTime: "Saati değiştir",
    moveTo: "{when} saatine taşı",
    moved: "Tamam — randevunuzun saati değişti. Size e-posta gönderdik.",
    cancelled: "Randevunuz iptal edildi. Size e-posta gönderdik.",
    tooLate: "Bu randevu artık online değiştirilemiyor. Lütfen {business} ile iletişime geçin.",
    linkInvalid: "Bu bağlantı artık geçerli değil.",
    poweredBy: "Randevu: NivaDesk"
  },
  de: {
    loading: "Wird geladen…",
    unavailableTitle: "Diese Buchungsseite ist nicht verfügbar",
    unavailableBody: "Der Link ist vielleicht falsch, oder das Unternehmen hat die Online-Buchung ausgeschaltet. Bitte kontaktieren Sie es direkt.",
    failed: "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.",
    tooMany: "Zu viele Versuche von dieser Verbindung. Bitte warten Sie kurz und versuchen Sie es erneut.",
    retry: "Erneut versuchen",
    chooseService: "Leistung wählen",
    choosePerson: "Bei wem?",
    anyone: "Egal",
    chooseDay: "Tag wählen",
    chooseTime: "Uhrzeit wählen",
    morning: "Vormittag",
    afternoon: "Nachmittag",
    evening: "Abend",
    noTimesDay: "An diesem Tag ist nichts frei. Bitte wählen Sie einen anderen Tag.",
    noTimesRange: "In diesen zwei Wochen ist nichts frei.",
    laterDates: "Spätere Tage",
    earlierDates: "Frühere Tage",
    free: "Kostenlos",
    from: "ab {price}",
    quote: "Preis auf Anfrage",
    minutes: "{n} Min.",
    hours: "{n} Stunden",
    days: "{n} Tage",
    locInPerson: "Vor Ort",
    locPhone: "Telefonisch",
    locVideo: "Videoanruf",
    locCustomer: "Bei Ihnen",
    requestNote: "Das Unternehmen bestätigt diesen Termin per E-Mail.",
    timesIn: "Zeiten in {zone}er Zeit.",
    change: "Ändern",
    yourDetails: "Ihre Angaben",
    name: "Vollständiger Name",
    email: "E-Mail",
    phone: "Telefon",
    address: "Adresse",
    notes: "Sollten wir etwas wissen?",
    optional: "optional",
    consent: "Ich bin einverstanden, dass {business} diese Angaben zur Verwaltung meines Termins speichert. NivaDesk verarbeitet sie im Auftrag.",
    privacy: "Datenschutz",
    policyChange: "Sie können diesen Termin bis {time} vor Beginn online stornieren oder ändern.",
    policyNoChange: "Für Änderungen oder Stornierungen wenden Sie sich bitte an {business}.",
    confirm: "Termin bestätigen",
    sendRequest: "Anfrage senden",
    sending: "Wird gebucht…",
    problemName: "Bitte geben Sie Ihren Namen ein.",
    problemEmail: "Bitte geben Sie eine gültige E-Mail-Adresse ein.",
    problemPhone: "Bitte geben Sie eine gültige Telefonnummer ein.",
    problemAddress: "Bitte geben Sie Ihre Adresse ein.",
    problemNotes: "Bitte füllen Sie dieses Feld aus.",
    problemAnswer: "Bitte beantworten Sie diese Frage.",
    problemConsent: "Bitte setzen Sie das Häkchen, um fortzufahren.",
    slotTaken: "Diese Zeit wurde gerade vergeben. Bitte wählen Sie eine andere.",
    tooManyForEmail: "Sie haben hier bereits mehrere Termine. Für weitere wenden Sie sich bitte an das Unternehmen.",
    doneTitle: "Ihr Termin ist gebucht",
    doneBody: "Wir haben die Details an {email} gesendet.",
    requestTitle: "Anfrage gesendet",
    requestBody: "{business} bestätigt per E-Mail. Eine Kopie ging an {email}.",
    addToCalendar: "Zum Kalender hinzufügen",
    manage: "Termin verwalten",
    bookAnother: "Weiteren Termin buchen",
    manageTitle: "Ihr Termin",
    statusConfirmed: "Bestätigt",
    statusPending: "Wartet auf Bestätigung",
    statusCancelled: "Storniert",
    statusDeclined: "Nicht angenommen",
    statusExpired: "Nicht rechtzeitig bestätigt",
    statusCompleted: "Erledigt",
    statusNoShow: "Nicht erschienen",
    cancelBooking: "Termin stornieren",
    cancelAsk: "Diesen Termin stornieren?",
    yesCancel: "Ja, stornieren",
    keep: "Behalten",
    changeTime: "Zeit ändern",
    moveTo: "Auf {when} verschieben",
    moved: "Erledigt — Ihr Termin hat eine neue Zeit. Wir haben Ihnen eine E-Mail geschickt.",
    cancelled: "Ihr Termin ist storniert. Wir haben Ihnen eine E-Mail geschickt.",
    tooLate: "Dieser Termin kann online nicht mehr geändert werden. Bitte wenden Sie sich an {business}.",
    linkInvalid: "Dieser Link ist nicht mehr gültig.",
    poweredBy: "Buchung über NivaDesk"
  },
  fr: {
    loading: "Chargement…",
    unavailableTitle: "Cette page de réservation n’est pas disponible",
    unavailableBody: "Le lien est peut-être erroné, ou l’entreprise a désactivé la réservation en ligne. Contactez-la directement.",
    failed: "Un problème est survenu. Veuillez réessayer.",
    tooMany: "Trop de tentatives depuis cette connexion. Patientez un peu et réessayez.",
    retry: "Réessayer",
    chooseService: "Choisissez une prestation",
    choosePerson: "Avec qui ?",
    anyone: "Peu importe",
    chooseDay: "Choisissez un jour",
    chooseTime: "Choisissez une heure",
    morning: "Matin",
    afternoon: "Après-midi",
    evening: "Soir",
    noTimesDay: "Aucun créneau libre ce jour-là. Choisissez un autre jour.",
    noTimesRange: "Aucun créneau libre sur ces deux semaines.",
    laterDates: "Jours suivants",
    earlierDates: "Jours précédents",
    free: "Gratuit",
    from: "à partir de {price}",
    quote: "Prix sur demande",
    minutes: "{n} min",
    hours: "{n} heures",
    days: "{n} jours",
    locInPerson: "Sur place",
    locPhone: "Par téléphone",
    locVideo: "Appel vidéo",
    locCustomer: "À votre adresse",
    requestNote: "L’entreprise confirme ce rendez-vous par e-mail.",
    timesIn: "Heures de {zone}.",
    change: "Modifier",
    yourDetails: "Vos coordonnées",
    name: "Nom complet",
    email: "E-mail",
    phone: "Téléphone",
    address: "Adresse",
    notes: "Quelque chose à nous dire ?",
    optional: "facultatif",
    consent: "J’accepte que {business} conserve ces informations pour gérer mon rendez-vous. NivaDesk les traite pour son compte.",
    privacy: "Politique de confidentialité",
    policyChange: "Vous pouvez annuler ou modifier ce rendez-vous en ligne jusqu’à {time} avant son début.",
    policyNoChange: "Pour modifier ou annuler, contactez {business}.",
    confirm: "Confirmer le rendez-vous",
    sendRequest: "Envoyer la demande",
    sending: "Réservation…",
    problemName: "Veuillez saisir votre nom.",
    problemEmail: "Veuillez saisir une adresse e-mail valide.",
    problemPhone: "Veuillez saisir un numéro de téléphone valide.",
    problemAddress: "Veuillez saisir votre adresse.",
    problemNotes: "Veuillez remplir ce champ.",
    problemAnswer: "Veuillez répondre à cette question.",
    problemConsent: "Cochez la case pour continuer.",
    slotTaken: "Ce créneau vient d’être pris. Choisissez-en un autre.",
    tooManyForEmail: "Vous avez déjà plusieurs rendez-vous ici. Contactez l’entreprise pour en réserver d’autres.",
    doneTitle: "C’est réservé",
    doneBody: "Nous avons envoyé les détails à {email}.",
    requestTitle: "Demande envoyée",
    requestBody: "{business} confirmera par e-mail. Une copie a été envoyée à {email}.",
    addToCalendar: "Ajouter à l’agenda",
    manage: "Gérer le rendez-vous",
    bookAnother: "Réserver autre chose",
    manageTitle: "Votre rendez-vous",
    statusConfirmed: "Confirmé",
    statusPending: "En attente de confirmation",
    statusCancelled: "Annulé",
    statusDeclined: "Non accepté",
    statusExpired: "Non confirmé à temps",
    statusCompleted: "Terminé",
    statusNoShow: "Absent",
    cancelBooking: "Annuler le rendez-vous",
    cancelAsk: "Annuler ce rendez-vous ?",
    yesCancel: "Oui, annuler",
    keep: "Le garder",
    changeTime: "Changer l’heure",
    moveTo: "Déplacer au {when}",
    moved: "C’est fait — votre rendez-vous a un nouvel horaire. Nous vous avons écrit.",
    cancelled: "Votre rendez-vous est annulé. Nous vous avons écrit.",
    tooLate: "Ce rendez-vous ne peut plus être modifié en ligne. Contactez {business}.",
    linkInvalid: "Ce lien n’est plus valide.",
    poweredBy: "Réservation par NivaDesk"
  },
  it: {
    loading: "Caricamento…",
    unavailableTitle: "Questa pagina di prenotazione non è disponibile",
    unavailableBody: "Il link potrebbe essere errato o l’attività ha disattivato la prenotazione online. Contattala direttamente.",
    failed: "Qualcosa è andato storto. Riprova.",
    tooMany: "Troppi tentativi da questa connessione. Attendi un po’ e riprova.",
    retry: "Riprova",
    chooseService: "Scegli un servizio",
    choosePerson: "Con chi?",
    anyone: "Indifferente",
    chooseDay: "Scegli un giorno",
    chooseTime: "Scegli un orario",
    morning: "Mattina",
    afternoon: "Pomeriggio",
    evening: "Sera",
    noTimesDay: "Nessun orario libero in questo giorno. Scegli un altro giorno.",
    noTimesRange: "Nessun orario libero in queste due settimane.",
    laterDates: "Giorni successivi",
    earlierDates: "Giorni precedenti",
    free: "Gratis",
    from: "da {price}",
    quote: "Prezzo su richiesta",
    minutes: "{n} min",
    hours: "{n} ore",
    days: "{n} giorni",
    locInPerson: "Di persona",
    locPhone: "Per telefono",
    locVideo: "Videochiamata",
    locCustomer: "Al tuo indirizzo",
    requestNote: "L’attività conferma questa prenotazione via email.",
    timesIn: "Orari di {zone}.",
    change: "Cambia",
    yourDetails: "I tuoi dati",
    name: "Nome e cognome",
    email: "Email",
    phone: "Telefono",
    address: "Indirizzo",
    notes: "C’è qualcosa che dovremmo sapere?",
    optional: "facoltativo",
    consent: "Acconsento che {business} conservi questi dati per gestire la mia prenotazione. NivaDesk li tratta per suo conto.",
    privacy: "Informativa privacy",
    policyChange: "Puoi annullare o modificare questa prenotazione online fino a {time} prima dell’inizio.",
    policyNoChange: "Per modificare o annullare, contatta {business}.",
    confirm: "Conferma prenotazione",
    sendRequest: "Invia richiesta",
    sending: "Prenotazione…",
    problemName: "Inserisci il tuo nome.",
    problemEmail: "Inserisci un indirizzo email valido.",
    problemPhone: "Inserisci un numero di telefono valido.",
    problemAddress: "Inserisci il tuo indirizzo.",
    problemNotes: "Compila questo campo.",
    problemAnswer: "Rispondi a questa domanda.",
    problemConsent: "Spunta la casella per continuare.",
    slotTaken: "Questo orario è appena stato preso. Scegline un altro.",
    tooManyForEmail: "Hai già diverse prenotazioni qui. Contatta l’attività per prenotarne altre.",
    doneTitle: "Prenotazione fatta",
    doneBody: "Abbiamo inviato i dettagli a {email}.",
    requestTitle: "Richiesta inviata",
    requestBody: "{business} confermerà via email. Abbiamo inviato una copia a {email}.",
    addToCalendar: "Aggiungi al calendario",
    manage: "Gestisci prenotazione",
    bookAnother: "Prenota altro",
    manageTitle: "La tua prenotazione",
    statusConfirmed: "Confermata",
    statusPending: "In attesa di conferma",
    statusCancelled: "Annullata",
    statusDeclined: "Non accettata",
    statusExpired: "Non confermata in tempo",
    statusCompleted: "Completata",
    statusNoShow: "Mancata",
    cancelBooking: "Annulla prenotazione",
    cancelAsk: "Annullare questa prenotazione?",
    yesCancel: "Sì, annulla",
    keep: "Tienila",
    changeTime: "Cambia orario",
    moveTo: "Sposta a {when}",
    moved: "Fatto — la prenotazione ha un nuovo orario. Ti abbiamo scritto.",
    cancelled: "La prenotazione è annullata. Ti abbiamo scritto.",
    tooLate: "Questa prenotazione non può più essere modificata online. Contatta {business}.",
    linkInvalid: "Questo link non è più valido.",
    poweredBy: "Prenotazione con NivaDesk"
  },
  es: {
    loading: "Cargando…",
    unavailableTitle: "Esta página de reservas no está disponible",
    unavailableBody: "Puede que el enlace sea incorrecto o que el negocio haya desactivado las reservas online. Contacta directamente con ellos.",
    failed: "Algo ha fallado. Inténtalo de nuevo.",
    tooMany: "Demasiados intentos desde esta conexión. Espera un poco y vuelve a intentarlo.",
    retry: "Reintentar",
    chooseService: "Elige un servicio",
    choosePerson: "¿Con quién?",
    anyone: "Me da igual",
    chooseDay: "Elige un día",
    chooseTime: "Elige una hora",
    morning: "Mañana",
    afternoon: "Tarde",
    evening: "Noche",
    noTimesDay: "No hay horas libres este día. Elige otro día.",
    noTimesRange: "No hay horas libres en estas dos semanas.",
    laterDates: "Días siguientes",
    earlierDates: "Días anteriores",
    free: "Gratis",
    from: "desde {price}",
    quote: "Precio a consultar",
    minutes: "{n} min",
    hours: "{n} horas",
    days: "{n} días",
    locInPerson: "En persona",
    locPhone: "Por teléfono",
    locVideo: "Videollamada",
    locCustomer: "En tu dirección",
    requestNote: "El negocio confirma esta cita por correo.",
    timesIn: "Horas de {zone}.",
    change: "Cambiar",
    yourDetails: "Tus datos",
    name: "Nombre completo",
    email: "Correo",
    phone: "Teléfono",
    address: "Dirección",
    notes: "¿Algo que debamos saber?",
    optional: "opcional",
    consent: "Acepto que {business} guarde estos datos para gestionar mi cita. NivaDesk los trata en su nombre.",
    privacy: "Política de privacidad",
    policyChange: "Puedes cancelar o cambiar esta cita online hasta {time} antes de que empiece.",
    policyNoChange: "Para cambiarla o cancelarla, contacta con {business}.",
    confirm: "Confirmar cita",
    sendRequest: "Enviar solicitud",
    sending: "Reservando…",
    problemName: "Escribe tu nombre.",
    problemEmail: "Escribe un correo válido.",
    problemPhone: "Escribe un teléfono válido.",
    problemAddress: "Escribe tu dirección.",
    problemNotes: "Rellena este campo.",
    problemAnswer: "Responde a esta pregunta.",
    problemConsent: "Marca la casilla para continuar.",
    slotTaken: "Esa hora se acaba de reservar. Elige otra.",
    tooManyForEmail: "Ya tienes varias citas aquí. Contacta con el negocio para reservar más.",
    doneTitle: "Cita reservada",
    doneBody: "Hemos enviado los detalles a {email}.",
    requestTitle: "Solicitud enviada",
    requestBody: "{business} la confirmará por correo. Hemos enviado una copia a {email}.",
    addToCalendar: "Añadir al calendario",
    manage: "Gestionar cita",
    bookAnother: "Reservar otra cosa",
    manageTitle: "Tu cita",
    statusConfirmed: "Confirmada",
    statusPending: "Pendiente de confirmación",
    statusCancelled: "Cancelada",
    statusDeclined: "No aceptada",
    statusExpired: "No confirmada a tiempo",
    statusCompleted: "Completada",
    statusNoShow: "No acudió",
    cancelBooking: "Cancelar cita",
    cancelAsk: "¿Cancelar esta cita?",
    yesCancel: "Sí, cancelar",
    keep: "Mantener",
    changeTime: "Cambiar hora",
    moveTo: "Cambiar a {when}",
    moved: "Hecho — tu cita tiene nueva hora. Te hemos escrito.",
    cancelled: "Tu cita está cancelada. Te hemos escrito.",
    tooLate: "Esta cita ya no se puede cambiar online. Contacta con {business}.",
    linkInvalid: "Este enlace ya no es válido.",
    poweredBy: "Reservas con NivaDesk"
  },
  pt: {
    loading: "A carregar…",
    unavailableTitle: "Esta página de marcações não está disponível",
    unavailableBody: "A ligação pode estar errada ou o negócio desativou as marcações online. Contacte-o diretamente.",
    failed: "Algo correu mal. Tente novamente.",
    tooMany: "Demasiadas tentativas a partir desta ligação. Aguarde um pouco e tente novamente.",
    retry: "Tentar novamente",
    chooseService: "Escolha um serviço",
    choosePerson: "Com quem?",
    anyone: "Tanto faz",
    chooseDay: "Escolha um dia",
    chooseTime: "Escolha uma hora",
    morning: "Manhã",
    afternoon: "Tarde",
    evening: "Noite",
    noTimesDay: "Não há horas livres neste dia. Escolha outro dia.",
    noTimesRange: "Não há horas livres nestas duas semanas.",
    laterDates: "Dias seguintes",
    earlierDates: "Dias anteriores",
    free: "Grátis",
    from: "desde {price}",
    quote: "Preço sob consulta",
    minutes: "{n} min",
    hours: "{n} horas",
    days: "{n} dias",
    locInPerson: "Presencial",
    locPhone: "Por telefone",
    locVideo: "Videochamada",
    locCustomer: "Na sua morada",
    requestNote: "O negócio confirma esta marcação por e-mail.",
    timesIn: "Horas de {zone}.",
    change: "Alterar",
    yourDetails: "Os seus dados",
    name: "Nome completo",
    email: "E-mail",
    phone: "Telefone",
    address: "Morada",
    notes: "Há algo que devamos saber?",
    optional: "opcional",
    consent: "Aceito que {business} guarde estes dados para gerir a minha marcação. A NivaDesk trata-os em seu nome.",
    privacy: "Política de privacidade",
    policyChange: "Pode cancelar ou alterar esta marcação online até {time} antes do início.",
    policyNoChange: "Para alterar ou cancelar, contacte {business}.",
    confirm: "Confirmar marcação",
    sendRequest: "Enviar pedido",
    sending: "A marcar…",
    problemName: "Escreva o seu nome.",
    problemEmail: "Escreva um e-mail válido.",
    problemPhone: "Escreva um telefone válido.",
    problemAddress: "Escreva a sua morada.",
    problemNotes: "Preencha este campo.",
    problemAnswer: "Responda a esta pergunta.",
    problemConsent: "Assinale a caixa para continuar.",
    slotTaken: "Essa hora acabou de ser marcada. Escolha outra.",
    tooManyForEmail: "Já tem várias marcações aqui. Contacte o negócio para marcar mais.",
    doneTitle: "Marcação feita",
    doneBody: "Enviámos os detalhes para {email}.",
    requestTitle: "Pedido enviado",
    requestBody: "{business} vai confirmar por e-mail. Enviámos uma cópia para {email}.",
    addToCalendar: "Adicionar ao calendário",
    manage: "Gerir marcação",
    bookAnother: "Marcar outra coisa",
    manageTitle: "A sua marcação",
    statusConfirmed: "Confirmada",
    statusPending: "A aguardar confirmação",
    statusCancelled: "Cancelada",
    statusDeclined: "Não aceite",
    statusExpired: "Não confirmada a tempo",
    statusCompleted: "Concluída",
    statusNoShow: "Falta",
    cancelBooking: "Cancelar marcação",
    cancelAsk: "Cancelar esta marcação?",
    yesCancel: "Sim, cancelar",
    keep: "Manter",
    changeTime: "Alterar hora",
    moveTo: "Mudar para {when}",
    moved: "Feito — a sua marcação tem nova hora. Enviámos-lhe um e-mail.",
    cancelled: "A sua marcação foi cancelada. Enviámos-lhe um e-mail.",
    tooLate: "Esta marcação já não pode ser alterada online. Contacte {business}.",
    linkInvalid: "Esta ligação já não é válida.",
    poweredBy: "Marcações com NivaDesk"
  },
  ru: {
    loading: "Загрузка…",
    unavailableTitle: "Эта страница записи недоступна",
    unavailableBody: "Возможно, ссылка неверна или онлайн-запись выключена. Свяжитесь с компанией напрямую.",
    failed: "Что-то пошло не так. Попробуйте ещё раз.",
    tooMany: "Слишком много попыток с этого подключения. Подождите немного и попробуйте снова.",
    retry: "Повторить",
    chooseService: "Выберите услугу",
    choosePerson: "К кому?",
    anyone: "Неважно",
    chooseDay: "Выберите день",
    chooseTime: "Выберите время",
    morning: "Утро",
    afternoon: "День",
    evening: "Вечер",
    noTimesDay: "В этот день нет свободного времени. Выберите другой день.",
    noTimesRange: "В эти две недели нет свободного времени.",
    laterDates: "Следующие дни",
    earlierDates: "Предыдущие дни",
    free: "Бесплатно",
    from: "от {price}",
    quote: "Цена по запросу",
    minutes: "{n} мин",
    hours: "{n} ч",
    days: "{n} дн.",
    locInPerson: "Лично",
    locPhone: "По телефону",
    locVideo: "Видеозвонок",
    locCustomer: "По вашему адресу",
    requestNote: "Компания подтвердит запись по электронной почте.",
    timesIn: "Время указано по зоне {zone}.",
    change: "Изменить",
    yourDetails: "Ваши данные",
    name: "Имя и фамилия",
    email: "Эл. почта",
    phone: "Телефон",
    address: "Адрес",
    notes: "Что нам стоит знать?",
    optional: "необязательно",
    consent: "Я согласен(на), что {business} хранит эти данные для управления моей записью. NivaDesk обрабатывает их от её имени.",
    privacy: "Политика конфиденциальности",
    policyChange: "Отменить или изменить запись онлайн можно не позднее чем за {time} до начала.",
    policyNoChange: "Чтобы изменить или отменить запись, свяжитесь с {business}.",
    confirm: "Подтвердить запись",
    sendRequest: "Отправить заявку",
    sending: "Записываем…",
    problemName: "Введите ваше имя.",
    problemEmail: "Введите корректный адрес эл. почты.",
    problemPhone: "Введите корректный номер телефона.",
    problemAddress: "Введите ваш адрес.",
    problemNotes: "Заполните это поле.",
    problemAnswer: "Ответьте на этот вопрос.",
    problemConsent: "Отметьте флажок, чтобы продолжить.",
    slotTaken: "Это время только что заняли. Выберите другое.",
    tooManyForEmail: "У вас уже несколько записей здесь. Чтобы записаться ещё, свяжитесь с компанией.",
    doneTitle: "Вы записаны",
    doneBody: "Мы отправили детали на {email}.",
    requestTitle: "Заявка отправлена",
    requestBody: "{business} подтвердит по эл. почте. Копия отправлена на {email}.",
    addToCalendar: "Добавить в календарь",
    manage: "Управление записью",
    bookAnother: "Записаться ещё",
    manageTitle: "Ваша запись",
    statusConfirmed: "Подтверждена",
    statusPending: "Ожидает подтверждения",
    statusCancelled: "Отменена",
    statusDeclined: "Не принята",
    statusExpired: "Не подтверждена вовремя",
    statusCompleted: "Завершена",
    statusNoShow: "Неявка",
    cancelBooking: "Отменить запись",
    cancelAsk: "Отменить эту запись?",
    yesCancel: "Да, отменить",
    keep: "Оставить",
    changeTime: "Изменить время",
    moveTo: "Перенести на {when}",
    moved: "Готово — у записи новое время. Мы отправили вам письмо.",
    cancelled: "Ваша запись отменена. Мы отправили вам письмо.",
    tooLate: "Эту запись больше нельзя изменить онлайн. Свяжитесь с {business}.",
    linkInvalid: "Эта ссылка больше не действует.",
    poweredBy: "Запись через NivaDesk"
  },
  ja: {
    loading: "読み込み中…",
    unavailableTitle: "この予約ページは利用できません",
    unavailableBody: "リンクが間違っているか、オンライン予約が停止されています。直接お問い合わせください。",
    failed: "問題が発生しました。もう一度お試しください。",
    tooMany: "この接続からの試行が多すぎます。少し待ってからもう一度お試しください。",
    retry: "再試行",
    chooseService: "サービスを選択",
    choosePerson: "担当者を選択",
    anyone: "指定なし",
    chooseDay: "日付を選択",
    chooseTime: "時間を選択",
    morning: "午前",
    afternoon: "午後",
    evening: "夕方",
    noTimesDay: "この日は空きがありません。別の日を選んでください。",
    noTimesRange: "この2週間は空きがありません。",
    laterDates: "次の日程",
    earlierDates: "前の日程",
    free: "無料",
    from: "{price}〜",
    quote: "価格はお問い合わせください",
    minutes: "{n}分",
    hours: "{n}時間",
    days: "{n}日",
    locInPerson: "対面",
    locPhone: "電話",
    locVideo: "ビデオ通話",
    locCustomer: "ご指定の住所",
    requestNote: "この予約は店舗がメールで確定します。",
    timesIn: "時間は{zone}時間です。",
    change: "変更",
    yourDetails: "お客様情報",
    name: "氏名",
    email: "メール",
    phone: "電話",
    address: "住所",
    notes: "伝えておきたいことはありますか？",
    optional: "任意",
    consent: "{business} が予約管理のためにこの情報を保管することに同意します。NivaDesk が同社に代わって処理します。",
    privacy: "プライバシーポリシー",
    policyChange: "開始の{time}前までオンラインでキャンセル・変更できます。",
    policyNoChange: "変更・キャンセルは {business} にお問い合わせください。",
    confirm: "予約を確定",
    sendRequest: "リクエストを送信",
    sending: "予約中…",
    problemName: "お名前を入力してください。",
    problemEmail: "有効なメールアドレスを入力してください。",
    problemPhone: "有効な電話番号を入力してください。",
    problemAddress: "住所を入力してください。",
    problemNotes: "この欄を入力してください。",
    problemAnswer: "この質問に回答してください。",
    problemConsent: "続行するにはチェックを入れてください。",
    slotTaken: "この時間はちょうど埋まりました。別の時間を選んでください。",
    tooManyForEmail: "すでに複数の予約があります。追加の予約は店舗にお問い合わせください。",
    doneTitle: "予約が完了しました",
    doneBody: "詳細を {email} にお送りしました。",
    requestTitle: "リクエストを送信しました",
    requestBody: "{business} がメールで確定します。控えを {email} にお送りしました。",
    addToCalendar: "カレンダーに追加",
    manage: "予約を管理",
    bookAnother: "別の予約をする",
    manageTitle: "ご予約",
    statusConfirmed: "確定",
    statusPending: "確認待ち",
    statusCancelled: "キャンセル済み",
    statusDeclined: "お受けできませんでした",
    statusExpired: "期限内に確定されませんでした",
    statusCompleted: "完了",
    statusNoShow: "未来店",
    cancelBooking: "予約をキャンセル",
    cancelAsk: "この予約をキャンセルしますか？",
    yesCancel: "はい、キャンセルします",
    keep: "そのままにする",
    changeTime: "時間を変更",
    moveTo: "{when}に変更",
    moved: "完了しました。予約の日時が変更されました。メールをお送りしました。",
    cancelled: "予約はキャンセルされました。メールをお送りしました。",
    tooLate: "この予約はオンラインで変更できなくなりました。{business} にお問い合わせください。",
    linkInvalid: "このリンクは無効になりました。",
    poweredBy: "予約: NivaDesk"
  },
  zh: {
    loading: "加载中…",
    unavailableTitle: "此预约页面不可用",
    unavailableBody: "链接可能有误，或商家已关闭在线预约。请直接联系商家。",
    failed: "出了点问题，请重试。",
    tooMany: "此连接尝试次数过多，请稍后再试。",
    retry: "重试",
    chooseService: "选择服务",
    choosePerson: "选择服务人员",
    anyone: "不限",
    chooseDay: "选择日期",
    chooseTime: "选择时间",
    morning: "上午",
    afternoon: "下午",
    evening: "晚上",
    noTimesDay: "这一天没有空闲时间，请选择其他日期。",
    noTimesRange: "这两周没有空闲时间。",
    laterDates: "之后的日期",
    earlierDates: "之前的日期",
    free: "免费",
    from: "{price} 起",
    quote: "价格面议",
    minutes: "{n} 分钟",
    hours: "{n} 小时",
    days: "{n} 天",
    locInPerson: "到店",
    locPhone: "电话",
    locVideo: "视频通话",
    locCustomer: "上门（您的地址）",
    requestNote: "商家会通过电子邮件确认此预约。",
    timesIn: "时间为{zone}时间。",
    change: "更改",
    yourDetails: "您的信息",
    name: "姓名",
    email: "电子邮件",
    phone: "电话",
    address: "地址",
    notes: "还有什么需要我们知道的吗？",
    optional: "选填",
    consent: "我同意 {business} 保存这些信息以管理我的预约。NivaDesk 代表其处理这些信息。",
    privacy: "隐私政策",
    policyChange: "在开始前 {time} 之前，您可以在线取消或更改此预约。",
    policyNoChange: "如需更改或取消，请联系 {business}。",
    confirm: "确认预约",
    sendRequest: "发送请求",
    sending: "正在预约…",
    problemName: "请输入您的姓名。",
    problemEmail: "请输入有效的电子邮件地址。",
    problemPhone: "请输入有效的电话号码。",
    problemAddress: "请输入您的地址。",
    problemNotes: "请填写此项。",
    problemAnswer: "请回答这个问题。",
    problemConsent: "请勾选复选框以继续。",
    slotTaken: "该时间刚刚被预约，请选择其他时间。",
    tooManyForEmail: "您在此已有多个预约。如需更多预约，请联系商家。",
    doneTitle: "预约成功",
    doneBody: "我们已将详情发送至 {email}。",
    requestTitle: "请求已发送",
    requestBody: "{business} 将通过电子邮件确认。副本已发送至 {email}。",
    addToCalendar: "添加到日历",
    manage: "管理预约",
    bookAnother: "预约其他服务",
    manageTitle: "您的预约",
    statusConfirmed: "已确认",
    statusPending: "等待确认",
    statusCancelled: "已取消",
    statusDeclined: "未被接受",
    statusExpired: "未及时确认",
    statusCompleted: "已完成",
    statusNoShow: "未到场",
    cancelBooking: "取消预约",
    cancelAsk: "要取消此预约吗？",
    yesCancel: "是，取消",
    keep: "保留",
    changeTime: "更改时间",
    moveTo: "改到 {when}",
    moved: "完成——预约时间已更改。我们已发邮件给您。",
    cancelled: "您的预约已取消。我们已发邮件给您。",
    tooLate: "此预约已无法在线更改。请联系 {business}。",
    linkInvalid: "此链接已失效。",
    poweredBy: "预约由 NivaDesk 提供"
  },
  ar: {
    loading: "جارٍ التحميل…",
    unavailableTitle: "صفحة الحجز هذه غير متاحة",
    unavailableBody: "قد يكون الرابط غير صحيح، أو أوقف النشاط التجاري الحجز عبر الإنترنت. يُرجى التواصل معه مباشرةً.",
    failed: "حدث خطأ ما. يُرجى المحاولة مرة أخرى.",
    tooMany: "محاولات كثيرة جدًا من هذا الاتصال. انتظر قليلًا ثم حاول مرة أخرى.",
    retry: "إعادة المحاولة",
    chooseService: "اختر خدمة",
    choosePerson: "مع من؟",
    anyone: "بلا تفضيل",
    chooseDay: "اختر يومًا",
    chooseTime: "اختر وقتًا",
    morning: "صباحًا",
    afternoon: "بعد الظهر",
    evening: "مساءً",
    noTimesDay: "لا توجد أوقات متاحة في هذا اليوم. اختر يومًا آخر.",
    noTimesRange: "لا توجد أوقات متاحة في هذين الأسبوعين.",
    laterDates: "أيام لاحقة",
    earlierDates: "أيام سابقة",
    free: "مجانًا",
    from: "ابتداءً من {price}",
    quote: "السعر عند الطلب",
    minutes: "{n} دقيقة",
    hours: "{n} ساعات",
    days: "{n} أيام",
    locInPerson: "حضوريًا",
    locPhone: "عبر الهاتف",
    locVideo: "مكالمة فيديو",
    locCustomer: "في عنوانك",
    requestNote: "يؤكد النشاط التجاري هذا الحجز عبر البريد الإلكتروني.",
    timesIn: "الأوقات بتوقيت {zone}.",
    change: "تغيير",
    yourDetails: "بياناتك",
    name: "الاسم الكامل",
    email: "البريد الإلكتروني",
    phone: "الهاتف",
    address: "العنوان",
    notes: "هل هناك ما يجب أن نعرفه؟",
    optional: "اختياري",
    consent: "أوافق على أن يحتفظ {business} بهذه البيانات لإدارة حجزي. تعالجها NivaDesk نيابةً عنه.",
    privacy: "سياسة الخصوصية",
    policyChange: "يمكنك إلغاء هذا الحجز أو تغييره عبر الإنترنت حتى {time} قبل بدئه.",
    policyNoChange: "للتغيير أو الإلغاء، يُرجى التواصل مع {business}.",
    confirm: "تأكيد الحجز",
    sendRequest: "إرسال الطلب",
    sending: "جارٍ الحجز…",
    problemName: "يُرجى كتابة اسمك.",
    problemEmail: "يُرجى كتابة بريد إلكتروني صحيح.",
    problemPhone: "يُرجى كتابة رقم هاتف صحيح.",
    problemAddress: "يُرجى كتابة عنوانك.",
    problemNotes: "يُرجى ملء هذا الحقل.",
    problemAnswer: "يُرجى الإجابة عن هذا السؤال.",
    problemConsent: "يُرجى تحديد المربع للمتابعة.",
    slotTaken: "تم حجز هذا الوقت للتو. يُرجى اختيار وقت آخر.",
    tooManyForEmail: "لديك عدة حجوزات هنا بالفعل. للحجز أكثر، تواصل مع النشاط التجاري.",
    doneTitle: "تم الحجز",
    doneBody: "أرسلنا التفاصيل إلى {email}.",
    requestTitle: "تم إرسال الطلب",
    requestBody: "سيؤكد {business} عبر البريد الإلكتروني. أرسلنا نسخة إلى {email}.",
    addToCalendar: "إضافة إلى التقويم",
    manage: "إدارة الحجز",
    bookAnother: "حجز شيء آخر",
    manageTitle: "حجزك",
    statusConfirmed: "مؤكد",
    statusPending: "بانتظار التأكيد",
    statusCancelled: "ملغى",
    statusDeclined: "غير مقبول",
    statusExpired: "لم يُؤكَّد في الوقت المناسب",
    statusCompleted: "مكتمل",
    statusNoShow: "لم يحضر",
    cancelBooking: "إلغاء الحجز",
    cancelAsk: "هل تريد إلغاء هذا الحجز؟",
    yesCancel: "نعم، ألغِ",
    keep: "إبقاء",
    changeTime: "تغيير الوقت",
    moveTo: "النقل إلى {when}",
    moved: "تم — أصبح لحجزك وقت جديد. أرسلنا إليك رسالة.",
    cancelled: "تم إلغاء حجزك. أرسلنا إليك رسالة.",
    tooLate: "لم يعد بالإمكان تغيير هذا الحجز عبر الإنترنت. يُرجى التواصل مع {business}.",
    linkInvalid: "هذا الرابط لم يعد صالحًا.",
    poweredBy: "الحجز عبر NivaDesk"
  },
  hi: {
    loading: "लोड हो रहा है…",
    unavailableTitle: "यह बुकिंग पेज उपलब्ध नहीं है",
    unavailableBody: "लिंक गलत हो सकता है, या व्यवसाय ने ऑनलाइन बुकिंग बंद कर दी है। कृपया सीधे उनसे संपर्क करें।",
    failed: "कुछ गड़बड़ हो गई। कृपया फिर से कोशिश करें।",
    tooMany: "इस कनेक्शन से बहुत ज़्यादा कोशिशें हुईं। थोड़ा रुककर फिर कोशिश करें।",
    retry: "फिर कोशिश करें",
    chooseService: "सेवा चुनें",
    choosePerson: "किसके साथ?",
    anyone: "कोई भी",
    chooseDay: "दिन चुनें",
    chooseTime: "समय चुनें",
    morning: "सुबह",
    afternoon: "दोपहर",
    evening: "शाम",
    noTimesDay: "इस दिन कोई खाली समय नहीं है। कृपया दूसरा दिन चुनें।",
    noTimesRange: "इन दो हफ़्तों में कोई खाली समय नहीं है।",
    laterDates: "आगे के दिन",
    earlierDates: "पिछले दिन",
    free: "मुफ़्त",
    from: "{price} से",
    quote: "कीमत पूछें",
    minutes: "{n} मिनट",
    hours: "{n} घंटे",
    days: "{n} दिन",
    locInPerson: "व्यक्तिगत रूप से",
    locPhone: "फ़ोन पर",
    locVideo: "वीडियो कॉल",
    locCustomer: "आपके पते पर",
    requestNote: "व्यवसाय इस बुकिंग की पुष्टि ईमेल से करता है।",
    timesIn: "समय {zone} के अनुसार है।",
    change: "बदलें",
    yourDetails: "आपकी जानकारी",
    name: "पूरा नाम",
    email: "ईमेल",
    phone: "फ़ोन",
    address: "पता",
    notes: "कुछ ऐसा जो हमें जानना चाहिए?",
    optional: "वैकल्पिक",
    consent: "मैं सहमत हूँ कि {business} मेरी बुकिंग संभालने के लिए यह जानकारी रखे। NivaDesk उनकी ओर से इसे प्रोसेस करता है।",
    privacy: "गोपनीयता नीति",
    policyChange: "शुरू होने से {time} पहले तक आप यह बुकिंग ऑनलाइन रद्द या बदल सकते हैं।",
    policyNoChange: "बदलने या रद्द करने के लिए कृपया {business} से संपर्क करें।",
    confirm: "बुकिंग पक्की करें",
    sendRequest: "अनुरोध भेजें",
    sending: "बुक हो रहा है…",
    problemName: "कृपया अपना नाम लिखें।",
    problemEmail: "कृपया सही ईमेल पता लिखें।",
    problemPhone: "कृपया सही फ़ोन नंबर लिखें।",
    problemAddress: "कृपया अपना पता लिखें।",
    problemNotes: "कृपया इसे भरें।",
    problemAnswer: "कृपया इस सवाल का जवाब दें।",
    problemConsent: "आगे बढ़ने के लिए बॉक्स पर टिक करें।",
    slotTaken: "यह समय अभी-अभी बुक हो गया। कृपया दूसरा चुनें।",
    tooManyForEmail: "यहाँ आपकी पहले से कई बुकिंग हैं। और बुक करने के लिए व्यवसाय से संपर्क करें।",
    doneTitle: "आपकी बुकिंग हो गई",
    doneBody: "हमने जानकारी {email} पर भेज दी है।",
    requestTitle: "अनुरोध भेजा गया",
    requestBody: "{business} ईमेल से पुष्टि करेगा। हमने एक कॉपी {email} पर भेजी है।",
    addToCalendar: "कैलेंडर में जोड़ें",
    manage: "बुकिंग प्रबंधित करें",
    bookAnother: "कुछ और बुक करें",
    manageTitle: "आपकी बुकिंग",
    statusConfirmed: "पक्की",
    statusPending: "पुष्टि की प्रतीक्षा",
    statusCancelled: "रद्द",
    statusDeclined: "स्वीकार नहीं हुई",
    statusExpired: "समय पर पुष्टि नहीं हुई",
    statusCompleted: "पूरी हुई",
    statusNoShow: "नहीं आए",
    cancelBooking: "बुकिंग रद्द करें",
    cancelAsk: "यह बुकिंग रद्द करें?",
    yesCancel: "हाँ, रद्द करें",
    keep: "रहने दें",
    changeTime: "समय बदलें",
    moveTo: "{when} पर ले जाएँ",
    moved: "हो गया — आपकी बुकिंग का नया समय है। हमने आपको ईमेल भेजा है।",
    cancelled: "आपकी बुकिंग रद्द हो गई है। हमने आपको ईमेल भेजा है।",
    tooLate: "यह बुकिंग अब ऑनलाइन नहीं बदली जा सकती। कृपया {business} से संपर्क करें।",
    linkInvalid: "यह लिंक अब मान्य नहीं है।",
    poweredBy: "बुकिंग: NivaDesk"
  }
};
