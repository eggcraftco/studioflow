// eBay listings → Inventory, and eBay orders → stock (package E4, 1 Oct 2026) — the pure half of the web screens.
//
// This module imports nothing, so scripts/check-ebay-inventory.mjs can compile and run it. It decides:
//   * which fields of a Preview row, a link or an order-stock answer may reach the screen (a closed list — whatever
//     else an answer carries is dropped here), and that a picture is shown only from eBay's own picture host;
//   * what a selected row's decision is, and whether it can be sent: a counted card needs the person's own shelf
//     count (eBay's number is never a default), a one-off card cannot stand for a listing that sells more than one,
//     an ambiguous row has no default — the person picks the card. Nothing is chosen until the person ticks a row;
//   * the words for every state and every refusal, and eBay's carrier codes as the courier names NivaDesk follows;
//   * the sentences in every app language. They live HERE rather than in language.ts so this change touches no shared
//     translation file; `ebayInventoryText` is an own-property lookup and the screen falls back to the app's studioT.

export type EbayCandidate = { id: string; number: string; name: string; sku: string; status: string; trackingType: string; reason: string };
export type EbayMoney = { value: string; currency: string } | null;
export type EbayListingRow = {
  linkId: string; itemId: string; variationKey: string; title: string; variationTitle: string; specificsText: string;
  sku: string; skuFitsCard: boolean; hasVariations: boolean; listingType: string; listedQuantity: number | null;
  priceKind: string; price: EbayMoney; currentBid: EbayMoney; pictureUrl: string;
  state: string; ambiguity: string; linkedItem: EbayCandidate | null; candidates: EbayCandidate[]; suggestions: EbayCandidate[];
  proposed: { name: string; trackingType: "unique" | "quantity" };
};
export type EbayDecision = { action: "" | "link" | "create"; inventoryItemId: string; trackingType: "unique" | "quantity"; onHand: string; category: string };
export type EbayImportRow = { linkId: string; result: string; reason: string; inventoryItemId: string; number: string };

export const EBAY_IMPORT_PER_CALL = 200;
const LINK_ID = /^[A-Za-z0-9_-]{1,200}__\d{6,20}__[0-9a-f]{20}$/;
const EBAY_PICTURE_URL = /^https:\/\/i\.ebayimg\.(?:com|sandbox\.ebay\.com)\/[A-Za-z0-9/_.~%-]{1,900}$/;
const STATES = ["linked", "sku_match", "ambiguous", "no_match", "no_sku", "link_broken"];

const text = (value: unknown, max = 200) => (typeof value === "string" ? value.slice(0, max) : typeof value === "number" && Number.isFinite(value) ? String(value) : "");
const obj = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {});
const intOrNull = (value: unknown) => (typeof value === "number" && Number.isInteger(value) ? value : null);

/** eBay's picture host only — anything else (a seller's own server) is not loaded by NivaDesk. */
export function safePictureUrl(value: unknown): string {
  const url = text(value, 1024);
  return EBAY_PICTURE_URL.test(url) ? url : "";
}

function moneyOf(value: unknown): EbayMoney {
  const m = obj(value);
  const v = text(m.value, 24); const c = text(m.currency, 3).toUpperCase();
  return v && /^-?\d+(\.\d+)?$/.test(v) ? { value: v, currency: /^[A-Z]{3}$/.test(c) ? c : "" } : null;
}
function candidateOf(value: unknown): EbayCandidate | null {
  const c = obj(value);
  const id = text(c.id, 80);
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return null;
  return { id, number: text(c.number, 40), name: text(c.name, 160), sku: text(c.sku, 80), status: text(c.status, 30), trackingType: text(c.trackingType, 20), reason: text(c.reason, 20) };
}
const candidatesOf = (value: unknown) => (Array.isArray(value) ? value.map(candidateOf).filter((c): c is EbayCandidate => Boolean(c)) : []);

/** The Preview's rows as the screen may hold them: one per link id, the closed list of fields, nothing else. */
export function listingRowsOf(answer: unknown): EbayListingRow[] {
  const rows = Array.isArray(obj(answer).rows) ? obj(answer).rows as unknown[] : [];
  const seen = new Set<string>();
  const out: EbayListingRow[] = [];
  for (const raw of rows) {
    const r = obj(raw);
    const linkId = text(r.linkId, 260);
    if (!LINK_ID.test(linkId) || seen.has(linkId)) continue;
    seen.add(linkId);
    const proposed = obj(r.proposed);
    out.push({
      linkId, itemId: text(r.itemId, 20), variationKey: text(r.variationKey, 120), title: text(r.title, 200), variationTitle: text(r.variationTitle, 200),
      specificsText: text(r.specificsText, 300), sku: text(r.sku, 80), skuFitsCard: r.skuFitsCard !== false, hasVariations: r.hasVariations === true,
      listingType: text(r.listingType, 40), listedQuantity: intOrNull(r.listedQuantity), priceKind: text(r.priceKind, 20),
      price: moneyOf(r.price), currentBid: moneyOf(r.currentBid), pictureUrl: safePictureUrl(r.pictureUrl),
      state: STATES.includes(text(r.state, 20)) ? text(r.state, 20) : "no_match", ambiguity: text(r.ambiguity, 40),
      linkedItem: candidateOf(r.linkedItem), candidates: candidatesOf(r.candidates), suggestions: candidatesOf(r.suggestions),
      proposed: { name: text(proposed.name, 160), trackingType: proposed.trackingType === "unique" ? "unique" : "quantity" }
    });
  }
  return out;
}

/** A row can be chosen unless it is already linked to a card that exists. */
export function canChoose(row: EbayListingRow): boolean {
  return row.state !== "linked";
}

/** The decision a row starts with when the person ticks it: link to the one SKU match; otherwise nothing chosen yet. */
export function startingDecision(row: EbayListingRow): EbayDecision {
  const base: EbayDecision = { action: "", inventoryItemId: "", trackingType: row.proposed.trackingType, onHand: "", category: "" };
  if (row.state === "sku_match" && row.candidates.length === 1) return { ...base, action: "link", inventoryItemId: row.candidates[0].id };
  return base;
}

/** Why a decision cannot be sent yet ("" when it can): the server's own rules, so a refusal is not a surprise. */
export function decisionProblem(row: EbayListingRow, decision: EbayDecision | undefined): string {
  if (!decision || !decision.action) return "action_required";
  if (decision.action === "link") {
    if (!decision.inventoryItemId) return "card_required";
    const card = [...row.candidates, ...row.suggestions].find((c) => c.id === decision.inventoryItemId);
    if (card && card.trackingType === "unique" && (row.listedQuantity ?? 0) > 1) return "one_off_card_for_many";
    return "";
  }
  if (decision.trackingType === "unique" && (row.listedQuantity ?? 0) > 1) return "one_off_card_for_many";
  if (decision.trackingType === "quantity") {
    if (decision.onHand.trim() === "") return "count_required";
    const n = Number(decision.onHand.replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 1e7) return "count_invalid";
  }
  return "";
}

/** What Import sends for the chosen rows, in the list's order; rows with a problem are not sent. */
export function decisionsToSend(rows: EbayListingRow[], chosen: string[], decisions: Record<string, EbayDecision>) {
  const out: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    if (!chosen.includes(row.linkId) || !canChoose(row)) continue;
    const d = decisions[row.linkId];
    if (decisionProblem(row, d)) continue;
    if (d.action === "link") out.push({ linkId: row.linkId, action: "link", inventoryItemId: d.inventoryItemId });
    else out.push({ linkId: row.linkId, action: "create", trackingType: d.trackingType, ...(d.trackingType === "quantity" ? { onHand: Number(d.onHand.replace(",", ".")) } : {}), ...(d.category ? { category: d.category } : {}) });
  }
  return out;
}

export function chunk<T>(list: T[], size = EBAY_IMPORT_PER_CALL): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export function importRowsOf(answer: unknown): EbayImportRow[] {
  const rows = Array.isArray(obj(answer).results) ? obj(answer).results as unknown[] : [];
  return rows.map((raw) => {
    const r = obj(raw);
    return { linkId: text(r.linkId, 260), result: text(r.result, 30), reason: text(r.reason, 60), inventoryItemId: text(r.inventoryItemId, 80), number: text(r.number, 40) };
  });
}

/** The filter tabs: everything, the rows that need the person, the SKU proposals, what is linked. */
export function filterRows(rows: EbayListingRow[], filter: string): EbayListingRow[] {
  if (filter === "needs_choice") return rows.filter((r) => ["ambiguous", "no_match", "no_sku", "link_broken"].includes(r.state));
  if (filter === "sku_match") return rows.filter((r) => r.state === "sku_match");
  if (filter === "linked") return rows.filter((r) => r.state === "linked");
  return rows;
}
export function countsOf(rows: EbayListingRow[]) {
  return { all: rows.length, needs_choice: filterRows(rows, "needs_choice").length, sku_match: filterRows(rows, "sku_match").length, linked: filterRows(rows, "linked").length };
}

/** The word for a row's state. */
export function rowStateSentence(row: EbayListingRow): string {
  if (row.state === "linked") return "Linked";
  if (row.state === "sku_match") return "Same SKU in stock";
  if (row.state === "link_broken") return "The linked card no longer exists";
  if (row.state === "ambiguous") {
    if (row.ambiguity === "sku_on_several_cards") return "Check: more than one card has this SKU";
    if (row.ambiguity === "sku_case_differs") return "Check: the SKU matches only if capitals are ignored";
    return "Check: the card with this SKU is no longer on the shelf";
  }
  if (row.state === "no_sku") return "No SKU on eBay";
  return "No card has this SKU";
}

const REASONS: Record<string, string> = {
  listing_not_in_preview: "This listing is not in the last read. Read eBay again.",
  preview_too_old: "The last read is more than a day old. Read eBay again.",
  already_linked: "Already linked to a card. Change the link from that card.",
  card_not_found: "That card no longer exists.",
  card_required: "Choose a card.",
  customer_item: "A customer's own item is not stock.",
  card_not_on_shelf: "That card is archived or removed.",
  made_card_not_on_shelf: "The card made from this listing earlier is archived or removed.",
  one_off_card_for_many: "A one-off card cannot stand for a listing that sells more than one.",
  tracking_type_required: "Choose one-off or counted.",
  count_required: "Type how many you have on the shelf (0 is allowed).",
  count_invalid: "That count is not a number NivaDesk can use.",
  action_required: "Choose link or create.",
  chosen_twice: "This listing was chosen twice.",
  // a line of an order that could not take stock
  not_enough_stock: "Not enough free stock.",
  held_by_another_order: "The card is held for another order.",
  card_not_available: "The card is sold, used or archived.",
  reservation_missing: "The hold on the card was moved by hand.",
  card_missing: "The card no longer exists.",
  not_enough_on_hand: "Not enough on the shelf.",
  card_not_sold: "That card is not marked sold.",
  stock_refused: "The stock rules refused this.",
  // the listing read
  listing_scope_missing: "NivaDesk may not read your listings yet. Reconnect eBay (Settings ▸ Integrations ▸ eBay) and approve listing access.",
  listing_token_rejected: "eBay refused the listing read. Reconnect eBay and approve listing access.",
  reconnect_required: "eBay needs you to reconnect this account.",
  rate_limited: "eBay's limit for today is spent. Try again tomorrow.",
  provider_unavailable: "eBay could not be reached just now. Try again in a moment.",
  listing_read_refused: "eBay did not accept the request.",
  call_not_allowed: "eBay did not accept the request.",
  failed: "This could not be done."
};
/** The sentence for a server reason word; an unknown word gets the general sentence, never the raw word. */
export function reasonSentence(reason: string): string {
  return Object.prototype.hasOwnProperty.call(REASONS, reason) ? REASONS[reason] : REASONS.failed;
}

/** eBay carrier codes → the courier names NivaDesk's tracking speaks (the server's commerce/ebay/carriers.js). */
const COURIERS: Record<string, string> = { royalmail: "Royal Mail", parcelforce: "Parcelforce", dhl: "DHL", dhlexpress: "DHL", fedex: "FedEx", fedexsmartpost: "FedEx", ups: "UPS", upsmailinnovations: "UPS" };
export function courierForEbayCarrier(code: unknown): string {
  const key = text(code, 60).toLowerCase().replace(/[^a-z]/g, "");
  return Object.prototype.hasOwnProperty.call(COURIERS, key) ? COURIERS[key] : "Auto Detect";
}

// ---- the order page --------------------------------------------------------------
export type EbayStockCard = { id: string; number: string; name: string; status: string; trackingType: string; onHand: number; costNotEntered: boolean; unitCost?: number };
export type EbayOrderStockLine = {
  lineItemId: string; title: string; quantity: number; shippedQuantity: number; sku: string;
  link: { linkId: string; inventoryItemId: string; card: EbayStockCard | null } | null;
  stock: { state: string; reservedQty: number; soldQty: number; returnedQty: number; inventoryItemId: string; card: EbayStockCard | null; blocked: { reason: string; atMs: number } | null; linkMovedSince: boolean } | null;
  beforeLink: boolean; needsReturnDecision: boolean;
};
export type EbayPackage = { id: string; trackingNumber: string; carrierCode: string; carrier: string; courier: string; shippedAt: string; lines: Array<{ lineItemId: string; quantity: number; title: string }>; followed: boolean; followProblem: boolean; onOrder: boolean };
export type EbayOrderStockView = { lines: EbayOrderStockLine[]; packages: EbayPackage[]; cancelled: boolean; refunded: boolean; enabled: boolean; canEdit: boolean; money: boolean; partlyShipped: boolean; address: "on_order" | "restricted" };

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
function stockCardOf(value: unknown): EbayStockCard | null {
  const c = obj(value);
  const id = text(c.id, 80);
  if (!id) return null;
  return { id, number: text(c.number, 40), name: text(c.name, 160), status: text(c.status, 30), trackingType: text(c.trackingType, 20), onHand: num(c.onHand), costNotEntered: c.costNotEntered === true, ...(typeof c.unitCost === "number" ? { unitCost: c.unitCost } : {}) };
}
/** The order-stock answer as the page may hold it. A tracking number is letters and digits only. */
export function orderStockViewOf(answer: unknown): EbayOrderStockView {
  const a = obj(answer);
  const lines = (Array.isArray(a.lines) ? a.lines : []).map((raw) => {
    const l = obj(raw); const link = obj(l.link); const stock = obj(l.stock); const blocked = obj(stock.blocked);
    return {
      lineItemId: text(l.lineItemId, 120), title: text(l.title, 200), quantity: Math.max(1, num(l.quantity)), shippedQuantity: num(l.shippedQuantity), sku: text(l.sku, 80),
      link: l.link ? { linkId: text(link.linkId, 260), inventoryItemId: text(link.inventoryItemId, 80), card: stockCardOf(link.card) } : null,
      stock: l.stock ? { state: text(stock.state, 30), reservedQty: num(stock.reservedQty), soldQty: num(stock.soldQty), returnedQty: num(stock.returnedQty), inventoryItemId: text(stock.inventoryItemId, 80), card: stockCardOf(stock.card), blocked: stock.blocked ? { reason: text(blocked.reason, 40), atMs: num(blocked.atMs) } : null, linkMovedSince: stock.linkMovedSince === true } : null,
      beforeLink: l.beforeLink === true, needsReturnDecision: l.needsReturnDecision === true
    };
  }).filter((l) => l.lineItemId);
  const packages = (Array.isArray(a.packages) ? a.packages : []).map((raw) => {
    const p = obj(raw);
    const tracking = text(p.trackingNumber, 120).replace(/\s+/g, "");
    return {
      id: text(p.id, 200), trackingNumber: /^[A-Za-z0-9-]{1,60}$/.test(tracking) ? tracking : "", carrierCode: text(p.carrierCode, 60), carrier: text(p.carrier, 60),
      courier: courierForEbayCarrier(p.carrierCode), shippedAt: text(p.shippedAt, 40),
      lines: (Array.isArray(p.lines) ? p.lines : []).map((x) => { const y = obj(x); return { lineItemId: text(y.lineItemId, 120), quantity: Math.max(1, num(y.quantity)), title: text(y.title, 200) }; }),
      followed: p.followed === true,
      // NivaDesk tried to follow this number and tracking did not take it (the order's tracking panel says why).
      followProblem: p.followed !== true && p.followProblem === true,
      onOrder: p.onOrder === true
    };
  });
  return { lines, packages, cancelled: a.cancelled === true, refunded: a.refunded === true, enabled: a.enabled === true, canEdit: a.canEdit === true, money: a.money === true, partlyShipped: a.partlyShipped === true, address: a.address === "on_order" ? "on_order" : "restricted" };
}

/** The word for a line's stock, with its numbers. */
export function lineStockSentence(line: EbayOrderStockLine): { sentence: string; tone: "ok" | "warn" | "bad" | "muted"; values: Record<string, number | string> } {
  const card = (line.stock && line.stock.card) || (line.link && line.link.card);
  const values = { reserved: line.stock ? line.stock.reservedQty : 0, sold: line.stock ? line.stock.soldQty : 0, returned: line.stock ? line.stock.returnedQty : 0, quantity: line.quantity, card: card ? `${card.number} ${card.name}`.trim() : "" };
  if (!line.link && !line.stock) return { sentence: "Not linked to a stock card", tone: "muted", values };
  if (line.stock && line.stock.blocked) return { sentence: "Could not take stock: {reason}", tone: "bad", values: { ...values, reason: reasonSentence(line.stock.blocked.reason) } };
  if (!line.stock) return line.beforeLink ? { sentence: "Placed before the listing was linked — stock not taken", tone: "warn", values } : { sentence: "Stock not taken yet", tone: "warn", values };
  switch (line.stock.state) {
    case "reserved": return { sentence: "Reserved {reserved} of {quantity} on {card}", tone: "ok", values };
    case "partly_sold": return { sentence: "Sent {sold} of {quantity} · {reserved} still reserved on {card}", tone: "ok", values };
    case "sold": return { sentence: "Sold from stock ({sold}) · {card}", tone: "ok", values };
    case "sold_then_cancelled": return { sentence: "Sent, then cancelled — {sold} still counted as sold", tone: "warn", values };
    case "released": return { sentence: "Cancelled — the reservation was given back", tone: "muted", values };
    case "cancelled_before_stock": return { sentence: "Cancelled before stock was taken", tone: "muted", values };
    case "returned": return { sentence: "Returned to the shelf ({returned})", tone: "muted", values };
    default: return { sentence: "Stock not taken yet", tone: "warn", values };
  }
}

/** Which buttons a line offers (the server decides again). */
export function lineActions(view: EbayOrderStockView, line: EbayOrderStockLine): { reserve: boolean; returned: boolean } {
  if (!view.canEdit) return { reserve: false, returned: false };
  // Reserve: a linked line with no stock record (placed before the link, or while the switch was off) or a blocked one.
  const reserve = Boolean(line.link) && (!line.stock || Boolean(line.stock.blocked));
  // Item returned: only goods that went out, and only on an order whose sale was undone (cancelled or refunded).
  const outstanding = line.stock ? line.stock.soldQty - line.stock.returnedQty : 0;
  return { reserve, returned: outstanding > 0 && (line.needsReturnDecision || view.cancelled || view.refunded) };
}

export function fill(sentence: string, values: Record<string, number | string>): string {
  return sentence.replace(/\{(\w+)\}/g, (match, key: string) => (Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match));
}

// ---- the sentences ---------------------------------------------------------------
type Lang = "Türkçe" | "Deutsch" | "Français" | "Italiano" | "Español (Spanish)" | "Português" | "Русский (Russian)" | "日本語 (Japanese)" | "中文 (Chinese)" | "العربية (Arabic)" | "हिन्दी (Hindi)";
export const EBAY_INVENTORY_LANGUAGES: Lang[] = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const L = (tr: string, de: string, fr: string, it: string, es: string, pt: string, ru: string, ja: string, zh: string, ar: string, hi: string): Record<Lang, string> =>
  ({ "Türkçe": tr, "Deutsch": de, "Français": fr, "Italiano": it, "Español (Spanish)": es, "Português": pt, "Русский (Russian)": ru, "日本語 (Japanese)": ja, "中文 (Chinese)": zh, "العربية (Arabic)": ar, "हिन्दी (Hindi)": hi });

/** Every English sentence the E4 screens print, in the eleven other app languages. */
export const EBAY_INVENTORY_TEXT: Record<string, Record<Lang, string>> = {
  "eBay listings": L("eBay ilanları", "eBay-Angebote", "Annonces eBay", "Inserzioni eBay", "Anuncios de eBay", "Anúncios do eBay", "Объявления eBay", "eBayの出品", "eBay 刊登", "قوائم eBay", "eBay लिस्टिंग"),
  "Read your active eBay listings, match them to your stock and bring in only the ones you choose. Nothing is written to eBay.": L(
    "Aktif eBay ilanlarınızı okuyun, stoğunuzla eşleştirin ve yalnızca seçtiklerinizi içe alın. eBay'e hiçbir şey yazılmaz.",
    "Lesen Sie Ihre aktiven eBay-Angebote, ordnen Sie sie Ihrem Bestand zu und übernehmen Sie nur die ausgewählten. Bei eBay wird nichts geändert.",
    "Lisez vos annonces eBay actives, rapprochez-les de votre stock et n'importez que celles que vous choisissez. Rien n'est écrit sur eBay.",
    "Leggi le tue inserzioni eBay attive, abbinale al tuo magazzino e importa solo quelle che scegli. Su eBay non viene scritto nulla.",
    "Lee tus anuncios activos de eBay, relaciónalos con tu stock y trae solo los que elijas. No se escribe nada en eBay.",
    "Leia os seus anúncios ativos do eBay, associe-os ao seu stock e traga apenas os que escolher. Nada é escrito no eBay.",
    "Прочитайте активные объявления eBay, сопоставьте их со складом и перенесите только выбранные. В eBay ничего не записывается.",
    "eBayの出品中リストを読み込み、在庫と照合して、選んだものだけを取り込みます。eBay側には何も書き込みません。",
    "读取您在 eBay 上的在售刊登，与库存匹配，只导入您选择的项目。不会向 eBay 写入任何内容。",
    "اقرأ قوائمك النشطة على eBay، وطابقها مع مخزونك، واستورد فقط ما تختاره. لا يُكتب أي شيء على eBay.",
    "अपनी सक्रिय eBay लिस्टिंग पढ़ें, उन्हें अपने स्टॉक से मिलाएँ और केवल चुनी हुई ही लाएँ। eBay पर कुछ नहीं लिखा जाता।"),
  "Read my eBay listings": L("eBay ilanlarımı oku", "Meine eBay-Angebote lesen", "Lire mes annonces eBay", "Leggi le mie inserzioni eBay", "Leer mis anuncios de eBay", "Ler os meus anúncios do eBay", "Прочитать мои объявления eBay", "eBayの出品を読み込む", "读取我的 eBay 刊登", "اقرأ قوائمي على eBay", "मेरी eBay लिस्टिंग पढ़ें"),
  "Read again": L("Yeniden oku", "Erneut lesen", "Relire", "Rileggi", "Volver a leer", "Ler novamente", "Прочитать снова", "もう一度読み込む", "重新读取", "اقرأ مرة أخرى", "फिर से पढ़ें"),
  "Reading eBay…": L("eBay okunuyor…", "eBay wird gelesen…", "Lecture d'eBay…", "Lettura di eBay…", "Leyendo eBay…", "A ler o eBay…", "Чтение eBay…", "eBayを読み込み中…", "正在读取 eBay…", "جارٍ قراءة eBay…", "eBay पढ़ा जा रहा है…"),
  "Loading…": L("Yükleniyor…", "Wird geladen…", "Chargement…", "Caricamento…", "Cargando…", "A carregar…", "Загрузка…", "読み込み中…", "正在加载…", "جارٍ التحميل…", "लोड हो रहा है…"),
  "eBay listings are not switched on for this workspace yet.": L("eBay ilanları bu çalışma alanı için henüz açılmadı.", "eBay-Angebote sind für diesen Arbeitsbereich noch nicht freigeschaltet.", "Les annonces eBay ne sont pas encore activées pour cet espace de travail.", "Le inserzioni eBay non sono ancora attive per questo spazio di lavoro.", "Los anuncios de eBay aún no están activados para este espacio de trabajo.", "Os anúncios do eBay ainda não estão ativados para este espaço de trabalho.", "Объявления eBay для этого рабочего пространства ещё не включены.", "このワークスペースではeBayの出品機能はまだ有効になっていません。", "此工作区尚未开启 eBay 刊登功能。", "لم يتم تفعيل قوائم eBay لمساحة العمل هذه بعد.", "इस वर्कस्पेस के लिए eBay लिस्टिंग अभी चालू नहीं हैं।"),
  "Connect eBay in Settings ▸ Integrations first.": L("Önce Ayarlar ▸ Entegrasyonlar'dan eBay'i bağlayın.", "Verbinden Sie zuerst eBay unter Einstellungen ▸ Integrationen.", "Connectez d'abord eBay dans Réglages ▸ Intégrations.", "Collega prima eBay in Impostazioni ▸ Integrazioni.", "Primero conecta eBay en Ajustes ▸ Integraciones.", "Ligue primeiro o eBay em Definições ▸ Integrações.", "Сначала подключите eBay в разделе Настройки ▸ Интеграции.", "まず「設定 ▸ 連携」でeBayを接続してください。", "请先在“设置 ▸ 集成”中连接 eBay。", "اربط eBay أولاً من الإعدادات ▸ التكاملات.", "पहले सेटिंग्स ▸ इंटीग्रेशन में eBay कनेक्ट करें।"),
  "Open eBay settings": L("eBay ayarlarını aç", "eBay-Einstellungen öffnen", "Ouvrir les réglages eBay", "Apri le impostazioni eBay", "Abrir ajustes de eBay", "Abrir definições do eBay", "Открыть настройки eBay", "eBay設定を開く", "打开 eBay 设置", "افتح إعدادات eBay", "eBay सेटिंग्स खोलें"),
  "All listings": L("Tüm ilanlar", "Alle Angebote", "Toutes les annonces", "Tutte le inserzioni", "Todos los anuncios", "Todos os anúncios", "Все объявления", "すべての出品", "全部刊登", "كل القوائم", "सभी लिस्टिंग"),
  "Needs a choice": L("Seçim bekliyor", "Auswahl nötig", "Choix nécessaire", "Serve una scelta", "Necesita una elección", "Precisa de escolha", "Нужен выбор", "選択が必要", "需要选择", "يحتاج إلى اختيار", "चयन ज़रूरी"),
  "Same SKU": L("Aynı SKU", "Gleiche SKU", "Même SKU", "Stesso SKU", "Mismo SKU", "Mesmo SKU", "Тот же SKU", "同じSKU", "相同 SKU", "نفس SKU", "समान SKU"),
  "Linked": L("Bağlı", "Verknüpft", "Liée", "Collegata", "Vinculado", "Ligado", "Связано", "リンク済み", "已关联", "مرتبط", "जुड़ा हुआ"),
  "Same SKU in stock": L("Stokta aynı SKU var", "Gleiche SKU im Bestand", "Même SKU en stock", "Stesso SKU in magazzino", "Mismo SKU en stock", "Mesmo SKU em stock", "Тот же SKU на складе", "在庫に同じSKUあり", "库存中有相同 SKU", "نفس SKU في المخزون", "स्टॉक में समान SKU"),
  "The linked card no longer exists": L("Bağlı kart artık yok", "Die verknüpfte Karte gibt es nicht mehr", "La fiche liée n'existe plus", "La scheda collegata non esiste più", "La ficha vinculada ya no existe", "A ficha ligada já não existe", "Связанной карточки больше нет", "リンク先のカードはもうありません", "关联的卡片已不存在", "البطاقة المرتبطة لم تعد موجودة", "जुड़ा कार्ड अब मौजूद नहीं है"),
  "Check: more than one card has this SKU": L("Kontrol edin: bu SKU birden fazla kartta var", "Prüfen: Mehr als eine Karte hat diese SKU", "À vérifier : plusieurs fiches ont ce SKU", "Da controllare: più schede hanno questo SKU", "Revisar: más de una ficha tiene este SKU", "Verificar: mais de uma ficha tem este SKU", "Проверьте: этот SKU у нескольких карточек", "確認：このSKUのカードが複数あります", "请检查：多张卡片使用此 SKU", "تحقق: أكثر من بطاقة تحمل هذا SKU", "जाँचें: यह SKU एक से अधिक कार्ड पर है"),
  "Check: the SKU matches only if capitals are ignored": L("Kontrol edin: SKU yalnızca büyük/küçük harf farkı gözetilmezse eşleşiyor", "Prüfen: Die SKU passt nur ohne Beachtung der Groß-/Kleinschreibung", "À vérifier : le SKU ne correspond qu'en ignorant les majuscules", "Da controllare: lo SKU coincide solo ignorando le maiuscole", "Revisar: el SKU solo coincide si se ignoran las mayúsculas", "Verificar: o SKU só coincide ignorando maiúsculas", "Проверьте: SKU совпадает только без учёта регистра", "確認：大文字小文字を無視した場合のみSKUが一致します", "请检查：仅在忽略大小写时 SKU 才匹配", "تحقق: يتطابق SKU فقط عند تجاهل حالة الأحرف", "जाँचें: SKU केवल बड़े/छोटे अक्षर अनदेखा करने पर मेल खाता है"),
  "Check: the card with this SKU is no longer on the shelf": L("Kontrol edin: bu SKU'lu kart artık rafta değil", "Prüfen: Die Karte mit dieser SKU ist nicht mehr im Regal", "À vérifier : la fiche avec ce SKU n'est plus en rayon", "Da controllare: la scheda con questo SKU non è più a scaffale", "Revisar: la ficha con este SKU ya no está en la estantería", "Verificar: a ficha com este SKU já não está na prateleira", "Проверьте: карточки с этим SKU больше нет на полке", "確認：このSKUのカードはもう棚にありません", "请检查：此 SKU 的卡片已不在货架上", "تحقق: البطاقة التي تحمل هذا SKU لم تعد على الرف", "जाँचें: इस SKU वाला कार्ड अब शेल्फ़ पर नहीं है"),
  "No SKU on eBay": L("eBay'de SKU yok", "Keine SKU bei eBay", "Pas de SKU sur eBay", "Nessuno SKU su eBay", "Sin SKU en eBay", "Sem SKU no eBay", "Нет SKU на eBay", "eBayにSKUなし", "eBay 上没有 SKU", "لا يوجد SKU على eBay", "eBay पर कोई SKU नहीं"),
  "No card has this SKU": L("Bu SKU hiçbir kartta yok", "Keine Karte hat diese SKU", "Aucune fiche n'a ce SKU", "Nessuna scheda ha questo SKU", "Ninguna ficha tiene este SKU", "Nenhuma ficha tem este SKU", "Ни у одной карточки нет этого SKU", "このSKUのカードはありません", "没有卡片使用此 SKU", "لا توجد بطاقة بهذا SKU", "किसी कार्ड पर यह SKU नहीं है"),
  "{count} listings read from eBay · {rows} to match": L("eBay'den {count} ilan okundu · eşleştirilecek {rows}", "{count} Angebote von eBay gelesen · {rows} zuzuordnen", "{count} annonces lues sur eBay · {rows} à rapprocher", "{count} inserzioni lette da eBay · {rows} da abbinare", "{count} anuncios leídos de eBay · {rows} por relacionar", "{count} anúncios lidos do eBay · {rows} para associar", "Прочитано объявлений eBay: {count} · к сопоставлению: {rows}", "eBayから{count}件の出品を読み込み · 照合対象{rows}件", "已从 eBay 读取 {count} 个刊登 · 待匹配 {rows} 项", "تمت قراءة {count} قائمة من eBay · {rows} للمطابقة", "eBay से {count} लिस्टिंग पढ़ी गईं · मिलाने के लिए {rows}"),
  "No active listings on eBay.": L("eBay'de aktif ilan yok.", "Keine aktiven Angebote bei eBay.", "Aucune annonce active sur eBay.", "Nessuna inserzione attiva su eBay.", "No hay anuncios activos en eBay.", "Não há anúncios ativos no eBay.", "Нет активных объявлений на eBay.", "eBayに出品中の商品はありません。", "eBay 上没有在售刊登。", "لا توجد قوائم نشطة على eBay.", "eBay पर कोई सक्रिय लिस्टिंग नहीं।"),
  "More than 2,000 listings: only the first 2,000 were read.": L("2.000'den fazla ilan var: yalnızca ilk 2.000'i okundu.", "Mehr als 2.000 Angebote: Nur die ersten 2.000 wurden gelesen.", "Plus de 2 000 annonces : seules les 2 000 premières ont été lues.", "Più di 2.000 inserzioni: sono state lette solo le prime 2.000.", "Más de 2.000 anuncios: solo se leyeron los primeros 2.000.", "Mais de 2.000 anúncios: só os primeiros 2.000 foram lidos.", "Больше 2 000 объявлений: прочитаны только первые 2 000.", "出品が2,000件を超えています。最初の2,000件のみ読み込みました。", "刊登超过 2,000 个：只读取了前 2,000 个。", "أكثر من 2,000 قائمة: تمت قراءة أول 2,000 فقط.", "2,000 से अधिक लिस्टिंग: केवल पहली 2,000 पढ़ी गईं।"),
  "eBay's list changed while it was read. Read it again to be sure nothing is missing.": L("eBay listesi okunurken değişti. Eksik kalmadığından emin olmak için yeniden okuyun.", "Die eBay-Liste hat sich beim Lesen geändert. Lesen Sie sie erneut, damit nichts fehlt.", "La liste eBay a changé pendant la lecture. Relisez-la pour être sûr que rien ne manque.", "L'elenco eBay è cambiato durante la lettura. Rileggilo per essere sicuro che non manchi nulla.", "La lista de eBay cambió mientras se leía. Vuelve a leerla para asegurarte de que no falta nada.", "A lista do eBay mudou durante a leitura. Leia novamente para garantir que nada falta.", "Список eBay изменился во время чтения. Прочитайте его снова, чтобы ничего не пропустить.", "読み込み中にeBayのリストが変わりました。漏れがないよう、もう一度読み込んでください。", "读取期间 eBay 列表发生了变化。请重新读取以确保没有遗漏。", "تغيّرت قائمة eBay أثناء قراءتها. اقرأها مرة أخرى للتأكد من عدم فقدان أي شيء.", "पढ़ते समय eBay की सूची बदल गई। कुछ छूटा न हो, इसके लिए फिर से पढ़ें।"),
  "eBay shows {count} for sale — eBay's number, not your shelf count": L("eBay'de satışta {count} — bu eBay'in sayısı, rafınızdaki adet değil", "eBay bietet {count} an — die Zahl von eBay, nicht Ihr Regalbestand", "eBay en propose {count} — le chiffre d'eBay, pas votre stock en rayon", "eBay ne offre {count} — il numero di eBay, non la tua giacenza", "eBay muestra {count} a la venta — la cifra de eBay, no tus existencias", "O eBay mostra {count} à venda — o número do eBay, não o seu stock", "На eBay в продаже {count} — это число eBay, а не ваш остаток", "eBayでの販売数 {count}（eBayの数であり、棚の在庫数ではありません）", "eBay 显示可售 {count} 件——这是 eBay 的数字，不是您的货架库存", "يعرض eBay عدد {count} للبيع — رقم eBay وليس عدد رفك", "eBay पर बिक्री के लिए {count} — यह eBay की संख्या है, आपके शेल्फ़ की गिनती नहीं"),
  "Sale price on eBay": L("eBay'deki satış fiyatı", "Verkaufspreis bei eBay", "Prix de vente sur eBay", "Prezzo di vendita su eBay", "Precio de venta en eBay", "Preço de venda no eBay", "Цена продажи на eBay", "eBayでの販売価格", "eBay 售价", "سعر البيع على eBay", "eBay पर बिक्री मूल्य"),
  "Auction — current bid": L("Açık artırma — güncel teklif", "Auktion — aktuelles Gebot", "Enchère — offre actuelle", "Asta — offerta attuale", "Subasta — puja actual", "Leilão — licitação atual", "Аукцион — текущая ставка", "オークション — 現在の入札額", "拍卖——当前出价", "مزاد — المزايدة الحالية", "नीलामी — मौजूदा बोली"),
  "Picture shown from eBay's servers; not copied into NivaDesk": L("Fotoğraf eBay sunucularından gösteriliyor; NivaDesk'e kopyalanmaz", "Bild wird von eBay-Servern angezeigt; nicht in NivaDesk kopiert", "Photo affichée depuis les serveurs d'eBay ; non copiée dans NivaDesk", "Foto mostrata dai server di eBay; non copiata in NivaDesk", "Foto mostrada desde los servidores de eBay; no se copia en NivaDesk", "Foto mostrada a partir dos servidores do eBay; não é copiada para o NivaDesk", "Фото показано с серверов eBay; в NivaDesk не копируется", "写真はeBayのサーバーから表示しています（NivaDeskにはコピーしません）", "图片从 eBay 服务器显示；不会复制到 NivaDesk", "تُعرض الصورة من خوادم eBay؛ ولا تُنسخ إلى NivaDesk", "तस्वीर eBay के सर्वर से दिखाई जा रही है; NivaDesk में कॉपी नहीं होती"),
  "Choose": L("Seç", "Auswählen", "Choisir", "Scegli", "Elegir", "Escolher", "Выбрать", "選択", "选择", "اختر", "चुनें"),
  "Link to a card": L("Bir karta bağla", "Mit einer Karte verknüpfen", "Lier à une fiche", "Collega a una scheda", "Vincular a una ficha", "Ligar a uma ficha", "Связать с карточкой", "カードにリンク", "关联到卡片", "اربط ببطاقة", "किसी कार्ड से जोड़ें"),
  "Create a new card": L("Yeni kart oluştur", "Neue Karte anlegen", "Créer une nouvelle fiche", "Crea una nuova scheda", "Crear una ficha nueva", "Criar uma ficha nova", "Создать новую карточку", "新しいカードを作成", "新建卡片", "أنشئ بطاقة جديدة", "नया कार्ड बनाएँ"),
  "Choose a card": L("Bir kart seçin", "Karte auswählen", "Choisissez une fiche", "Scegli una scheda", "Elige una ficha", "Escolha uma ficha", "Выберите карточку", "カードを選択", "选择卡片", "اختر بطاقة", "कार्ड चुनें"),
  "Search your cards…": L("Kartlarınızda arayın…", "Karten durchsuchen…", "Rechercher dans vos fiches…", "Cerca nelle tue schede…", "Busca en tus fichas…", "Pesquisar nas suas fichas…", "Поиск по карточкам…", "カードを検索…", "搜索您的卡片…", "ابحث في بطاقاتك…", "अपने कार्ड खोजें…"),
  "Similar name (not a match)": L("Benzer ad (eşleşme değil)", "Ähnlicher Name (keine Zuordnung)", "Nom proche (pas une correspondance)", "Nome simile (non è un abbinamento)", "Nombre parecido (no es una coincidencia)", "Nome parecido (não é correspondência)", "Похожее название (не совпадение)", "似た名前（一致ではありません）", "名称相似（并非匹配）", "اسم مشابه (ليس تطابقًا)", "मिलता-जुलता नाम (मेल नहीं)"),
  "One-off item": L("Tekil ürün", "Einzelstück", "Pièce unique", "Pezzo unico", "Pieza única", "Peça única", "Единичный предмет", "一点物", "单件物品", "قطعة فريدة", "एकल वस्तु"),
  "Counted item": L("Adetli ürün", "Mengenartikel", "Article compté", "Articolo a quantità", "Artículo contado", "Artigo contado", "Учитываемый по количеству", "数量で管理", "按数量计", "صنف بالعدد", "गिनती वाली वस्तु"),
  "How many do you have on the shelf?": L("Rafta kaç tane var?", "Wie viele haben Sie im Regal?", "Combien en avez-vous en rayon ?", "Quanti ne hai a scaffale?", "¿Cuántos tienes en la estantería?", "Quantos tem na prateleira?", "Сколько у вас на полке?", "棚にいくつありますか？", "货架上有多少件？", "كم لديك على الرف؟", "शेल्फ़ पर कितने हैं?"),
  "Category": L("Kategori", "Kategorie", "Catégorie", "Categoria", "Categoría", "Categoria", "Категория", "カテゴリ", "类别", "الفئة", "श्रेणी"),
  "{count} selected": L("{count} seçildi", "{count} ausgewählt", "{count} sélectionnée(s)", "{count} selezionate", "{count} seleccionados", "{count} selecionados", "Выбрано: {count}", "{count}件選択中", "已选 {count} 个", "تم تحديد {count}", "{count} चुने गए"),
  "Bring in selected": L("Seçilenleri içe al", "Ausgewählte übernehmen", "Importer la sélection", "Importa le selezionate", "Traer los seleccionados", "Trazer os selecionados", "Перенести выбранные", "選択したものを取り込む", "导入所选项", "استيراد المحدد", "चुने गए लाएँ"),
  "Bringing in…": L("İçe alınıyor…", "Wird übernommen…", "Importation…", "Importazione…", "Trayendo…", "A trazer…", "Перенос…", "取り込み中…", "正在导入…", "جارٍ الاستيراد…", "लाया जा रहा है…"),
  "Choose what to do with each selected listing.": L("Seçtiğiniz her ilan için ne yapılacağını seçin.", "Wählen Sie für jedes ausgewählte Angebot, was geschehen soll.", "Choisissez quoi faire pour chaque annonce sélectionnée.", "Scegli cosa fare con ogni inserzione selezionata.", "Elige qué hacer con cada anuncio seleccionado.", "Escolha o que fazer com cada anúncio selecionado.", "Выберите действие для каждого выбранного объявления.", "選択した出品ごとに処理を選んでください。", "请为每个所选刊登选择要做的操作。", "اختر ما تريد فعله بكل قائمة محددة.", "हर चुनी गई लिस्टिंग के लिए तय करें कि क्या करना है।"),
  "{created} new cards · {linked} linked · {refused} not done": L("{created} yeni kart · {linked} bağlandı · {refused} yapılmadı", "{created} neue Karten · {linked} verknüpft · {refused} nicht erledigt", "{created} nouvelles fiches · {linked} liées · {refused} non faites", "{created} nuove schede · {linked} collegate · {refused} non eseguite", "{created} fichas nuevas · {linked} vinculadas · {refused} sin hacer", "{created} fichas novas · {linked} ligadas · {refused} não feitas", "Новых карточек: {created} · связано: {linked} · не выполнено: {refused}", "新規カード{created}件 · リンク{linked}件 · 未処理{refused}件", "新建卡片 {created} 张 · 关联 {linked} 个 · 未完成 {refused} 个", "{created} بطاقات جديدة · {linked} مرتبطة · {refused} لم تتم", "{created} नए कार्ड · {linked} जोड़े गए · {refused} नहीं हुए"),
  "Created {number}": L("{number} oluşturuldu", "{number} angelegt", "{number} créée", "{number} creata", "{number} creada", "{number} criada", "Создана {number}", "{number}を作成", "已创建 {number}", "تم إنشاء {number}", "{number} बनाया गया"),
  "Linked to {number}": L("{number} kartına bağlandı", "Mit {number} verknüpft", "Liée à {number}", "Collegata a {number}", "Vinculado a {number}", "Ligado a {number}", "Связано с {number}", "{number}にリンク", "已关联到 {number}", "مرتبط بـ {number}", "{number} से जोड़ा गया"),
  "Already linked": L("Zaten bağlı", "Bereits verknüpft", "Déjà liée", "Già collegata", "Ya vinculado", "Já ligado", "Уже связано", "リンク済み", "已关联", "مرتبط بالفعل", "पहले से जुड़ा"),
  "Cost not entered — eBay does not know what you paid.": L("Maliyet girilmedi — eBay sizin ne ödediğinizi bilmez.", "Kosten nicht erfasst — eBay weiß nicht, was Sie bezahlt haben.", "Coût non saisi — eBay ne sait pas ce que vous avez payé.", "Costo non inserito — eBay non sa quanto hai pagato.", "Coste no indicado — eBay no sabe cuánto pagaste.", "Custo não indicado — o eBay não sabe quanto pagou.", "Себестоимость не указана — eBay не знает, сколько вы заплатили.", "原価未入力 — eBayはあなたの仕入れ額を知りません。", "未录入成本——eBay 不知道您的进价。", "لم تُدخل التكلفة — eBay لا يعرف ما دفعته.", "लागत दर्ज नहीं — eBay नहीं जानता कि आपने कितना चुकाया।"),
  // reasons
  "This listing is not in the last read. Read eBay again.": L("Bu ilan son okumada yok. eBay'i yeniden okuyun.", "Dieses Angebot ist nicht im letzten Lesevorgang. Lesen Sie eBay erneut.", "Cette annonce n'est pas dans la dernière lecture. Relisez eBay.", "Questa inserzione non è nell'ultima lettura. Rileggi eBay.", "Este anuncio no está en la última lectura. Vuelve a leer eBay.", "Este anúncio não está na última leitura. Leia o eBay novamente.", "Этого объявления нет в последнем чтении. Прочитайте eBay снова.", "この出品は前回の読み込みにありません。eBayを再読み込みしてください。", "此刊登不在最近一次读取中。请重新读取 eBay。", "هذه القائمة ليست في آخر قراءة. اقرأ eBay مرة أخرى.", "यह लिस्टिंग पिछली बार पढ़ी गई सूची में नहीं है। eBay फिर से पढ़ें।"),
  "The last read is more than a day old. Read eBay again.": L("Son okuma bir günden eski. eBay'i yeniden okuyun.", "Der letzte Lesevorgang ist älter als einen Tag. Lesen Sie eBay erneut.", "La dernière lecture date de plus d'un jour. Relisez eBay.", "L'ultima lettura ha più di un giorno. Rileggi eBay.", "La última lectura tiene más de un día. Vuelve a leer eBay.", "A última leitura tem mais de um dia. Leia o eBay novamente.", "Последнему чтению больше суток. Прочитайте eBay снова.", "前回の読み込みから1日以上経っています。eBayを再読み込みしてください。", "上次读取已超过一天。请重新读取 eBay。", "آخر قراءة أقدم من يوم. اقرأ eBay مرة أخرى.", "पिछली बार पढ़े एक दिन से अधिक हो गया। eBay फिर से पढ़ें।"),
  "Already linked to a card. Change the link from that card.": L("Zaten bir karta bağlı. Bağlantıyı o karttan değiştirin.", "Bereits mit einer Karte verknüpft. Ändern Sie die Verknüpfung auf dieser Karte.", "Déjà liée à une fiche. Modifiez le lien depuis cette fiche.", "Già collegata a una scheda. Cambia il collegamento da quella scheda.", "Ya vinculado a una ficha. Cambia el vínculo desde esa ficha.", "Já ligado a uma ficha. Altere a ligação a partir dessa ficha.", "Уже связано с карточкой. Измените связь в этой карточке.", "すでにカードにリンクされています。リンクはそのカードから変更してください。", "已关联到某张卡片。请在该卡片中更改关联。", "مرتبطة ببطاقة بالفعل. غيّر الربط من تلك البطاقة.", "पहले से किसी कार्ड से जुड़ा है। जोड़ उसी कार्ड से बदलें।"),
  "That card no longer exists.": L("O kart artık yok.", "Diese Karte gibt es nicht mehr.", "Cette fiche n'existe plus.", "Quella scheda non esiste più.", "Esa ficha ya no existe.", "Essa ficha já não existe.", "Этой карточки больше нет.", "そのカードはもうありません。", "该卡片已不存在。", "تلك البطاقة لم تعد موجودة.", "वह कार्ड अब मौजूद नहीं है।"),
  "Choose a card.": L("Bir kart seçin.", "Wählen Sie eine Karte.", "Choisissez une fiche.", "Scegli una scheda.", "Elige una ficha.", "Escolha uma ficha.", "Выберите карточку.", "カードを選んでください。", "请选择一张卡片。", "اختر بطاقة.", "एक कार्ड चुनें।"),
  "A customer's own item is not stock.": L("Müşterinin kendi eşyası stok değildir.", "Ein Kundenartikel ist kein Bestand.", "L'article d'un client n'est pas du stock.", "L'oggetto di un cliente non è magazzino.", "El artículo de un cliente no es stock.", "O artigo de um cliente não é stock.", "Вещь клиента — не складской запас.", "お客様の持ち物は在庫ではありません。", "客户自己的物品不是库存。", "الغرض الخاص بالعميل ليس مخزونًا.", "ग्राहक की अपनी वस्तु स्टॉक नहीं है।"),
  "That card is archived or removed.": L("O kart arşivlendi ya da kaldırıldı.", "Diese Karte ist archiviert oder entfernt.", "Cette fiche est archivée ou retirée.", "Quella scheda è archiviata o rimossa.", "Esa ficha está archivada o retirada.", "Essa ficha está arquivada ou removida.", "Эта карточка в архиве или удалена.", "そのカードはアーカイブ済みか削除済みです。", "该卡片已归档或移除。", "تلك البطاقة مؤرشفة أو محذوفة.", "वह कार्ड संग्रहीत या हटाया गया है।"),
  "The card made from this listing earlier is archived or removed.": L("Bu ilandan daha önce oluşturulan kart arşivlendi ya da kaldırıldı.", "Die früher aus diesem Angebot angelegte Karte ist archiviert oder entfernt.", "La fiche créée plus tôt à partir de cette annonce est archivée ou retirée.", "La scheda creata in precedenza da questa inserzione è archiviata o rimossa.", "La ficha creada antes a partir de este anuncio está archivada o retirada.", "A ficha criada antes a partir deste anúncio está arquivada ou removida.", "Карточка, созданная ранее из этого объявления, в архиве или удалена.", "以前この出品から作成したカードはアーカイブ済みか削除済みです。", "之前由此刊登创建的卡片已归档或移除。", "البطاقة التي أُنشئت سابقًا من هذه القائمة مؤرشفة أو محذوفة.", "इस लिस्टिंग से पहले बना कार्ड संग्रहीत या हटाया गया है।"),
  "A one-off card cannot stand for a listing that sells more than one.": L("Tekil bir kart, birden fazla adet satan bir ilanı karşılayamaz.", "Eine Einzelstück-Karte kann kein Angebot mit mehr als einem Stück abbilden.", "Une fiche de pièce unique ne peut pas représenter une annonce qui en vend plusieurs.", "Una scheda di pezzo unico non può rappresentare un'inserzione che ne vende più di uno.", "Una ficha de pieza única no puede representar un anuncio que vende más de una.", "Uma ficha de peça única não pode representar um anúncio que vende mais de uma.", "Карточка единичного предмета не может соответствовать объявлению с несколькими штуками.", "一点物のカードは、複数個を販売する出品には使えません。", "单件卡片不能对应出售多件的刊登。", "لا يمكن لبطاقة قطعة فريدة أن تمثل قائمة تبيع أكثر من واحدة.", "एकल वस्तु का कार्ड एक से अधिक बेचने वाली लिस्टिंग के लिए नहीं हो सकता।"),
  "Choose one-off or counted.": L("Tekil ya da adetli seçin.", "Wählen Sie Einzelstück oder Mengenartikel.", "Choisissez pièce unique ou article compté.", "Scegli pezzo unico o a quantità.", "Elige pieza única o contada.", "Escolha peça única ou contada.", "Выберите: единичный или по количеству.", "一点物か数量管理かを選んでください。", "请选择单件或按数量计。", "اختر قطعة فريدة أو بالعدد.", "एकल या गिनती वाली चुनें।"),
  "Type how many you have on the shelf (0 is allowed).": L("Rafta kaç tane olduğunu yazın (0 olabilir).", "Geben Sie ein, wie viele im Regal sind (0 ist erlaubt).", "Indiquez combien vous en avez en rayon (0 est possible).", "Indica quanti ne hai a scaffale (0 è consentito).", "Escribe cuántos tienes en la estantería (se permite 0).", "Escreva quantos tem na prateleira (0 é permitido).", "Укажите, сколько у вас на полке (можно 0).", "棚にある数を入力してください（0も可）。", "请输入货架上的数量（可以为 0）。", "اكتب عدد ما لديك على الرف (يُسمح بـ 0).", "शेल्फ़ पर कितने हैं, लिखें (0 भी चलेगा)।"),
  "That count is not a number NivaDesk can use.": L("Bu sayı NivaDesk'in kullanabileceği bir sayı değil.", "Diese Anzahl ist keine Zahl, die NivaDesk verwenden kann.", "Ce nombre n'est pas utilisable par NivaDesk.", "Questo numero non è utilizzabile da NivaDesk.", "Esa cantidad no es un número que NivaDesk pueda usar.", "Essa quantidade não é um número que o NivaDesk possa usar.", "Это количество NivaDesk использовать не может.", "その数はNivaDeskで使える数値ではありません。", "该数量不是 NivaDesk 可用的数字。", "هذا العدد ليس رقمًا يمكن لـ NivaDesk استخدامه.", "यह संख्या NivaDesk इस्तेमाल नहीं कर सकता।"),
  "Choose link or create.": L("Bağla ya da oluştur seçin.", "Wählen Sie Verknüpfen oder Anlegen.", "Choisissez lier ou créer.", "Scegli collega o crea.", "Elige vincular o crear.", "Escolha ligar ou criar.", "Выберите: связать или создать.", "リンクか作成かを選んでください。", "请选择关联或新建。", "اختر الربط أو الإنشاء.", "जोड़ें या बनाएँ चुनें।"),
  "This listing was chosen twice.": L("Bu ilan iki kez seçildi.", "Dieses Angebot wurde zweimal gewählt.", "Cette annonce a été choisie deux fois.", "Questa inserzione è stata scelta due volte.", "Este anuncio se eligió dos veces.", "Este anúncio foi escolhido duas vezes.", "Это объявление выбрано дважды.", "この出品が2回選ばれています。", "此刊登被选择了两次。", "تم اختيار هذه القائمة مرتين.", "यह लिस्टिंग दो बार चुनी गई।"),
  "Not enough free stock.": L("Yeterli boş stok yok.", "Nicht genug freier Bestand.", "Pas assez de stock libre.", "Giacenza libera insufficiente.", "No hay suficiente stock libre.", "Não há stock livre suficiente.", "Недостаточно свободного запаса.", "空き在庫が足りません。", "可用库存不足。", "لا يوجد مخزون متاح كافٍ.", "पर्याप्त मुक्त स्टॉक नहीं है।"),
  "The card is held for another order.": L("Kart başka bir sipariş için ayrılmış.", "Die Karte ist für eine andere Bestellung reserviert.", "La fiche est réservée pour une autre commande.", "La scheda è riservata per un altro ordine.", "La ficha está reservada para otro pedido.", "A ficha está reservada para outra encomenda.", "Карточка зарезервирована под другой заказ.", "このカードは別の注文に確保されています。", "该卡片已为其他订单预留。", "البطاقة محجوزة لطلب آخر.", "कार्ड किसी अन्य ऑर्डर के लिए रखा गया है।"),
  "The card is sold, used or archived.": L("Kart satıldı, kullanıldı ya da arşivlendi.", "Die Karte ist verkauft, verbraucht oder archiviert.", "La fiche est vendue, utilisée ou archivée.", "La scheda è venduta, usata o archiviata.", "La ficha está vendida, usada o archivada.", "A ficha está vendida, usada ou arquivada.", "Карточка продана, использована или в архиве.", "このカードは販売済み・使用済み・アーカイブ済みです。", "该卡片已售出、已使用或已归档。", "البطاقة مباعة أو مستخدمة أو مؤرشفة.", "कार्ड बिक चुका, इस्तेमाल हो चुका या संग्रहीत है।"),
  "The hold on the card was moved by hand.": L("Karttaki ayırma elle taşındı.", "Die Reservierung auf der Karte wurde von Hand verschoben.", "La réservation sur la fiche a été déplacée à la main.", "La prenotazione sulla scheda è stata spostata a mano.", "La reserva de la ficha se movió a mano.", "A reserva na ficha foi movida à mão.", "Резерв на карточке перенесён вручную.", "カードの確保は手動で移されました。", "卡片上的预留已被手动移动。", "تم نقل الحجز على البطاقة يدويًا.", "कार्ड पर रोक हाथ से हटाई गई।"),
  "The card no longer exists.": L("Kart artık yok.", "Die Karte gibt es nicht mehr.", "La fiche n'existe plus.", "La scheda non esiste più.", "La ficha ya no existe.", "A ficha já não existe.", "Карточки больше нет.", "カードはもうありません。", "卡片已不存在。", "البطاقة لم تعد موجودة.", "कार्ड अब मौजूद नहीं है।"),
  "Not enough on the shelf.": L("Rafta yeterli yok.", "Nicht genug im Regal.", "Pas assez en rayon.", "Non abbastanza a scaffale.", "No hay suficiente en la estantería.", "Não há o suficiente na prateleira.", "На полке недостаточно.", "棚に足りません。", "货架上数量不足。", "لا يوجد ما يكفي على الرف.", "शेल्फ़ पर पर्याप्त नहीं है।"),
  "That card is not marked sold.": L("O kart satıldı olarak işaretli değil.", "Diese Karte ist nicht als verkauft markiert.", "Cette fiche n'est pas marquée vendue.", "Quella scheda non è segnata come venduta.", "Esa ficha no está marcada como vendida.", "Essa ficha não está marcada como vendida.", "Эта карточка не отмечена как проданная.", "そのカードは販売済みになっていません。", "该卡片未标记为已售出。", "تلك البطاقة غير معلّمة كمباعة.", "वह कार्ड बिका हुआ चिह्नित नहीं है।"),
  "The stock rules refused this.": L("Stok kuralları bunu reddetti.", "Die Bestandsregeln haben dies abgelehnt.", "Les règles de stock ont refusé ceci.", "Le regole di magazzino lo hanno rifiutato.", "Las reglas de stock lo rechazaron.", "As regras de stock recusaram isto.", "Правила склада это отклонили.", "在庫ルールにより拒否されました。", "库存规则拒绝了此操作。", "رفضت قواعد المخزون ذلك.", "स्टॉक नियमों ने इसे अस्वीकार किया।"),
  "NivaDesk may not read your listings yet. Reconnect eBay (Settings ▸ Integrations ▸ eBay) and approve listing access.": L(
    "NivaDesk henüz ilanlarınızı okuyamaz. eBay'i yeniden bağlayın (Ayarlar ▸ Entegrasyonlar ▸ eBay) ve ilan erişimini onaylayın.",
    "NivaDesk darf Ihre Angebote noch nicht lesen. Verbinden Sie eBay neu (Einstellungen ▸ Integrationen ▸ eBay) und erlauben Sie den Zugriff auf Angebote.",
    "NivaDesk ne peut pas encore lire vos annonces. Reconnectez eBay (Réglages ▸ Intégrations ▸ eBay) et autorisez l'accès aux annonces.",
    "NivaDesk non può ancora leggere le tue inserzioni. Ricollega eBay (Impostazioni ▸ Integrazioni ▸ eBay) e approva l'accesso alle inserzioni.",
    "NivaDesk aún no puede leer tus anuncios. Vuelve a conectar eBay (Ajustes ▸ Integraciones ▸ eBay) y aprueba el acceso a los anuncios.",
    "O NivaDesk ainda não pode ler os seus anúncios. Volte a ligar o eBay (Definições ▸ Integrações ▸ eBay) e aprove o acesso aos anúncios.",
    "NivaDesk пока не может читать ваши объявления. Переподключите eBay (Настройки ▸ Интеграции ▸ eBay) и разрешите доступ к объявлениям.",
    "NivaDeskはまだ出品を読み込めません。eBayを再接続し（設定 ▸ 連携 ▸ eBay）、出品へのアクセスを許可してください。",
    "NivaDesk 目前还无法读取您的刊登。请重新连接 eBay（设置 ▸ 集成 ▸ eBay）并批准刊登访问权限。",
    "لا يمكن لـ NivaDesk قراءة قوائمك بعد. أعد ربط eBay (الإعدادات ▸ التكاملات ▸ eBay) ووافق على الوصول إلى القوائم.",
    "NivaDesk अभी आपकी लिस्टिंग नहीं पढ़ सकता। eBay फिर से कनेक्ट करें (सेटिंग्स ▸ इंटीग्रेशन ▸ eBay) और लिस्टिंग एक्सेस मंज़ूर करें।"),
  "eBay refused the listing read. Reconnect eBay and approve listing access.": L("eBay ilan okumayı reddetti. eBay'i yeniden bağlayın ve ilan erişimini onaylayın.", "eBay hat das Lesen der Angebote abgelehnt. Verbinden Sie eBay neu und erlauben Sie den Zugriff auf Angebote.", "eBay a refusé la lecture des annonces. Reconnectez eBay et autorisez l'accès aux annonces.", "eBay ha rifiutato la lettura delle inserzioni. Ricollega eBay e approva l'accesso alle inserzioni.", "eBay rechazó la lectura de anuncios. Vuelve a conectar eBay y aprueba el acceso a los anuncios.", "O eBay recusou a leitura dos anúncios. Volte a ligar o eBay e aprove o acesso aos anúncios.", "eBay отказал в чтении объявлений. Переподключите eBay и разрешите доступ к объявлениям.", "eBayが出品の読み込みを拒否しました。eBayを再接続し、出品へのアクセスを許可してください。", "eBay 拒绝读取刊登。请重新连接 eBay 并批准刊登访问权限。", "رفض eBay قراءة القوائم. أعد ربط eBay ووافق على الوصول إلى القوائم.", "eBay ने लिस्टिंग पढ़ने से मना किया। eBay फिर से कनेक्ट करें और लिस्टिंग एक्सेस मंज़ूर करें।"),
  "eBay needs you to reconnect this account.": L("eBay bu hesabı yeniden bağlamanızı istiyor.", "eBay verlangt, dass Sie dieses Konto neu verbinden.", "eBay vous demande de reconnecter ce compte.", "eBay richiede di ricollegare questo account.", "eBay necesita que vuelvas a conectar esta cuenta.", "O eBay precisa que volte a ligar esta conta.", "eBay требует переподключить этот аккаунт.", "eBayからこのアカウントの再接続を求められています。", "eBay 需要您重新连接此账户。", "يحتاج eBay إلى إعادة ربط هذا الحساب.", "eBay चाहता है कि आप यह खाता फिर से कनेक्ट करें।"),
  "eBay's limit for today is spent. Try again tomorrow.": L("eBay'in bugünkü sınırı doldu. Yarın tekrar deneyin.", "Das heutige eBay-Limit ist aufgebraucht. Versuchen Sie es morgen erneut.", "La limite eBay du jour est atteinte. Réessayez demain.", "Il limite eBay di oggi è esaurito. Riprova domani.", "Se agotó el límite de eBay de hoy. Inténtalo mañana.", "O limite do eBay de hoje esgotou-se. Tente amanhã.", "Лимит eBay на сегодня исчерпан. Попробуйте завтра.", "本日のeBayの上限に達しました。明日もう一度お試しください。", "今日的 eBay 限额已用完。请明天再试。", "تم استنفاد حد eBay لليوم. حاول مرة أخرى غدًا.", "आज की eBay सीमा पूरी हो गई। कल फिर कोशिश करें।"),
  "eBay could not be reached just now. Try again in a moment.": L("eBay'e şu an ulaşılamadı. Birazdan tekrar deneyin.", "eBay ist gerade nicht erreichbar. Versuchen Sie es gleich noch einmal.", "eBay est injoignable pour le moment. Réessayez dans un instant.", "eBay non è raggiungibile al momento. Riprova tra poco.", "No se pudo conectar con eBay ahora. Inténtalo en un momento.", "Não foi possível contactar o eBay agora. Tente daqui a pouco.", "Сейчас нет связи с eBay. Попробуйте чуть позже.", "現在eBayに接続できません。しばらくしてからお試しください。", "暂时无法连接 eBay。请稍后再试。", "تعذّر الوصول إلى eBay الآن. حاول بعد قليل.", "अभी eBay तक नहीं पहुँच सके। थोड़ी देर में फिर कोशिश करें।"),
  "eBay did not accept the request.": L("eBay isteği kabul etmedi.", "eBay hat die Anfrage nicht angenommen.", "eBay n'a pas accepté la demande.", "eBay non ha accettato la richiesta.", "eBay no aceptó la solicitud.", "O eBay não aceitou o pedido.", "eBay не принял запрос.", "eBayがリクエストを受け付けませんでした。", "eBay 未接受该请求。", "لم يقبل eBay الطلب.", "eBay ने अनुरोध स्वीकार नहीं किया।"),
  "This could not be done.": L("Bu yapılamadı.", "Das konnte nicht ausgeführt werden.", "Impossible de le faire.", "Non è stato possibile farlo.", "No se pudo hacer.", "Não foi possível fazer isto.", "Не удалось выполнить.", "実行できませんでした。", "无法完成此操作。", "تعذّر تنفيذ ذلك.", "यह नहीं हो सका।"),
  // the card's eBay section
  "On eBay": L("eBay'de", "Bei eBay", "Sur eBay", "Su eBay", "En eBay", "No eBay", "На eBay", "eBay上", "在 eBay 上", "على eBay", "eBay पर"),
  "eBay's quantity and price are eBay's; the shelf count and the cost on this card are yours.": L("eBay'deki adet ve fiyat eBay'e aittir; bu karttaki raf adedi ve maliyet sizindir.", "Menge und Preis bei eBay gehören eBay; Regalbestand und Kosten auf dieser Karte gehören Ihnen.", "La quantité et le prix sur eBay sont ceux d'eBay ; le stock en rayon et le coût de cette fiche sont les vôtres.", "Quantità e prezzo su eBay sono di eBay; giacenza e costo di questa scheda sono tuoi.", "La cantidad y el precio de eBay son de eBay; las existencias y el coste de esta ficha son tuyos.", "A quantidade e o preço no eBay são do eBay; o stock e o custo desta ficha são seus.", "Количество и цена на eBay — данные eBay; остаток и себестоимость в этой карточке — ваши.", "eBayの数量と価格はeBayのものです。このカードの棚在庫と原価はあなたのものです。", "eBay 上的数量和价格属于 eBay；此卡片的货架数量和成本由您掌握。", "الكمية والسعر على eBay يخصان eBay؛ أما عدد الرف والتكلفة في هذه البطاقة فلك.", "eBay की मात्रा और कीमत eBay की हैं; इस कार्ड की शेल्फ़ गिनती और लागत आपकी हैं।"),
  "Unlink": L("Bağlantıyı kaldır", "Verknüpfung lösen", "Délier", "Scollega", "Desvincular", "Desligar", "Отвязать", "リンク解除", "取消关联", "إلغاء الربط", "जोड़ हटाएँ"),
  "Unlink this listing? Orders that already took stock keep it; new eBay orders for this listing will not reserve stock.": L(
    "Bu ilanın bağlantısı kaldırılsın mı? Stok almış siparişler onu korur; bu ilan için yeni eBay siparişleri stok ayırmaz.",
    "Verknüpfung dieses Angebots lösen? Bestellungen, die bereits Bestand genommen haben, behalten ihn; neue eBay-Bestellungen reservieren keinen Bestand.",
    "Délier cette annonce ? Les commandes qui ont déjà pris du stock le gardent ; les nouvelles commandes eBay ne réserveront pas de stock.",
    "Scollegare questa inserzione? Gli ordini che hanno già preso magazzino lo mantengono; i nuovi ordini eBay non riserveranno magazzino.",
    "¿Desvincular este anuncio? Los pedidos que ya tomaron stock lo conservan; los nuevos pedidos de eBay no reservarán stock.",
    "Desligar este anúncio? As encomendas que já tomaram stock mantêm-no; as novas encomendas do eBay não vão reservar stock.",
    "Отвязать это объявление? Заказы, уже взявшие запас, его сохранят; новые заказы eBay не будут резервировать запас.",
    "この出品のリンクを解除しますか？すでに在庫を確保した注文はそのままです。この出品への新しいeBay注文は在庫を確保しません。",
    "要取消此刊登的关联吗？已占用库存的订单保留不变；此刊登的新 eBay 订单将不会预留库存。",
    "إلغاء ربط هذه القائمة؟ الطلبات التي أخذت مخزونًا تحتفظ به؛ ولن تحجز طلبات eBay الجديدة لهذه القائمة أي مخزون.",
    "इस लिस्टिंग का जोड़ हटाएँ? जिन ऑर्डर ने स्टॉक ले लिया है वे उसे रखेंगे; इस लिस्टिंग के नए eBay ऑर्डर स्टॉक नहीं रोकेंगे।"),
  "Change card": L("Kartı değiştir", "Karte ändern", "Changer de fiche", "Cambia scheda", "Cambiar ficha", "Mudar de ficha", "Сменить карточку", "カードを変更", "更换卡片", "تغيير البطاقة", "कार्ड बदलें"),
  "Move": L("Taşı", "Verschieben", "Déplacer", "Sposta", "Mover", "Mover", "Переместить", "移動", "移动", "نقل", "स्थानांतरित करें"),
  "Cancel": L("Vazgeç", "Abbrechen", "Annuler", "Annulla", "Cancelar", "Cancelar", "Отмена", "キャンセル", "取消", "إلغاء", "रद्द करें"),
  "Done. {count} open eBay orders still hold stock on the previous card.": L("Tamam. {count} açık eBay siparişi hâlâ önceki kartta stok tutuyor.", "Erledigt. {count} offene eBay-Bestellungen halten noch Bestand auf der vorherigen Karte.", "C'est fait. {count} commandes eBay ouvertes gardent encore du stock sur la fiche précédente.", "Fatto. {count} ordini eBay aperti tengono ancora magazzino sulla scheda precedente.", "Hecho. {count} pedidos de eBay abiertos aún retienen stock en la ficha anterior.", "Feito. {count} encomendas do eBay em aberto ainda retêm stock na ficha anterior.", "Готово. Открытых заказов eBay, удерживающих запас на прежней карточке: {count}.", "完了しました。未完了のeBay注文{count}件が、まだ前のカードの在庫を確保しています。", "完成。仍有 {count} 个未完成的 eBay 订单在原卡片上占用库存。", "تم. لا يزال {count} طلبًا مفتوحًا على eBay يحجز مخزونًا على البطاقة السابقة.", "हो गया। {count} खुले eBay ऑर्डर अब भी पिछले कार्ड पर स्टॉक रोके हुए हैं।"),
  "Last read from eBay": L("eBay'den son okuma", "Zuletzt von eBay gelesen", "Dernière lecture sur eBay", "Ultima lettura da eBay", "Última lectura de eBay", "Última leitura do eBay", "Последнее чтение из eBay", "eBayから最終読み込み", "上次从 eBay 读取", "آخر قراءة من eBay", "eBay से पिछली बार पढ़ा"),
  // the order page
  "Stock for this eBay order": L("Bu eBay siparişinin stoğu", "Bestand für diese eBay-Bestellung", "Stock pour cette commande eBay", "Magazzino per questo ordine eBay", "Stock de este pedido de eBay", "Stock desta encomenda do eBay", "Запас для этого заказа eBay", "このeBay注文の在庫", "此 eBay 订单的库存", "مخزون طلب eBay هذا", "इस eBay ऑर्डर का स्टॉक"),
  "Not linked to a stock card": L("Bir stok kartına bağlı değil", "Nicht mit einer Bestandskarte verknüpft", "Non liée à une fiche de stock", "Non collegata a una scheda di magazzino", "No vinculado a una ficha de stock", "Não ligado a uma ficha de stock", "Не связано с карточкой склада", "在庫カードにリンクされていません", "未关联库存卡片", "غير مرتبط ببطاقة مخزون", "किसी स्टॉक कार्ड से नहीं जुड़ा"),
  "Link it in Inventory ▸ eBay listings": L("Envanter ▸ eBay ilanları'ndan bağlayın", "In Inventar ▸ eBay-Angebote verknüpfen", "Liez-la dans Inventaire ▸ Annonces eBay", "Collegala in Inventario ▸ Inserzioni eBay", "Vincúlalo en Inventario ▸ Anuncios de eBay", "Ligue-o em Inventário ▸ Anúncios do eBay", "Свяжите в разделе Склад ▸ Объявления eBay", "在庫 ▸ eBayの出品 でリンクしてください", "请在“库存 ▸ eBay 刊登”中关联", "اربطه من المخزون ▸ قوائم eBay", "इन्वेंटरी ▸ eBay लिस्टिंग में जोड़ें"),
  "Could not take stock: {reason}": L("Stok alınamadı: {reason}", "Bestand konnte nicht genommen werden: {reason}", "Stock non pris : {reason}", "Magazzino non preso: {reason}", "No se pudo tomar stock: {reason}", "Não foi possível tomar stock: {reason}", "Не удалось взять запас: {reason}", "在庫を確保できませんでした：{reason}", "未能占用库存：{reason}", "تعذّر أخذ المخزون: {reason}", "स्टॉक नहीं लिया जा सका: {reason}"),
  "Placed before the listing was linked — stock not taken": L("İlan bağlanmadan önce verildi — stok alınmadı", "Vor der Verknüpfung des Angebots bestellt — kein Bestand genommen", "Passée avant la liaison de l'annonce — stock non pris", "Effettuato prima del collegamento dell'inserzione — magazzino non preso", "Hecho antes de vincular el anuncio — stock no tomado", "Feita antes de o anúncio ser ligado — stock não tomado", "Оформлен до связывания объявления — запас не взят", "出品のリンク前の注文 — 在庫は確保していません", "下单于刊登关联之前——未占用库存", "تم قبل ربط القائمة — لم يُؤخذ مخزون", "लिस्टिंग जुड़ने से पहले दिया गया — स्टॉक नहीं लिया"),
  "Stock not taken yet": L("Henüz stok alınmadı", "Noch kein Bestand genommen", "Stock pas encore pris", "Magazzino non ancora preso", "Stock aún no tomado", "Stock ainda não tomado", "Запас ещё не взят", "まだ在庫を確保していません", "尚未占用库存", "لم يُؤخذ المخزون بعد", "अभी स्टॉक नहीं लिया"),
  "Reserved {reserved} of {quantity} on {card}": L("{card} üzerinde {quantity} adedin {reserved} kadarı ayrıldı", "{reserved} von {quantity} auf {card} reserviert", "{reserved} sur {quantity} réservé(s) sur {card}", "{reserved} di {quantity} riservati su {card}", "{reserved} de {quantity} reservados en {card}", "{reserved} de {quantity} reservados em {card}", "Зарезервировано {reserved} из {quantity} на {card}", "{card}で{quantity}点中{reserved}点を確保", "已在 {card} 上预留 {quantity} 件中的 {reserved} 件", "تم حجز {reserved} من {quantity} على {card}", "{card} पर {quantity} में से {reserved} आरक्षित"),
  "Sent {sold} of {quantity} · {reserved} still reserved on {card}": L("{quantity} adedin {sold} kadarı gönderildi · {reserved} hâlâ {card} üzerinde ayrılı", "{sold} von {quantity} versendet · {reserved} noch auf {card} reserviert", "{sold} sur {quantity} expédié(s) · {reserved} encore réservé(s) sur {card}", "{sold} di {quantity} spediti · {reserved} ancora riservati su {card}", "{sold} de {quantity} enviados · {reserved} aún reservados en {card}", "{sold} de {quantity} enviados · {reserved} ainda reservados em {card}", "Отправлено {sold} из {quantity} · ещё {reserved} в резерве на {card}", "{quantity}点中{sold}点発送 · {card}に{reserved}点確保中", "已发出 {quantity} 件中的 {sold} 件 · {card} 上仍预留 {reserved} 件", "تم إرسال {sold} من {quantity} · لا يزال {reserved} محجوزًا على {card}", "{quantity} में से {sold} भेजे · {card} पर {reserved} अब भी आरक्षित"),
  "Sold from stock ({sold}) · {card}": L("Stoktan satıldı ({sold}) · {card}", "Aus dem Bestand verkauft ({sold}) · {card}", "Vendu depuis le stock ({sold}) · {card}", "Venduto dal magazzino ({sold}) · {card}", "Vendido del stock ({sold}) · {card}", "Vendido do stock ({sold}) · {card}", "Продано со склада ({sold}) · {card}", "在庫から販売（{sold}） · {card}", "已从库存售出（{sold}）· {card}", "بيع من المخزون ({sold}) · {card}", "स्टॉक से बिका ({sold}) · {card}"),
  "Sent, then cancelled — {sold} still counted as sold": L("Gönderildi, sonra iptal edildi — {sold} hâlâ satılmış sayılıyor", "Versendet, dann storniert — {sold} zählen weiter als verkauft", "Expédié puis annulé — {sold} encore compté(s) comme vendu(s)", "Spedito, poi annullato — {sold} ancora conteggiati come venduti", "Enviado y luego cancelado — {sold} siguen contando como vendidos", "Enviado e depois cancelado — {sold} ainda contam como vendidos", "Отправлено, затем отменено — {sold} всё ещё считаются проданными", "発送後にキャンセル — {sold}点はまだ販売済みとして数えています", "已发出后取消——{sold} 件仍计为已售", "تم الإرسال ثم الإلغاء — لا يزال {sold} محسوبًا كمباع", "भेजा, फिर रद्द — {sold} अब भी बिके हुए गिने जा रहे हैं"),
  "Cancelled — the reservation was given back": L("İptal edildi — ayırma geri verildi", "Storniert — die Reservierung wurde freigegeben", "Annulée — la réservation a été rendue", "Annullato — la prenotazione è stata liberata", "Cancelado — se liberó la reserva", "Cancelada — a reserva foi devolvida", "Отменено — резерв снят", "キャンセル — 確保を解除しました", "已取消——预留已释放", "ملغى — تمت إعادة الحجز", "रद्द — आरक्षण छोड़ दिया गया"),
  "Cancelled before stock was taken": L("Stok alınmadan iptal edildi", "Storniert, bevor Bestand genommen wurde", "Annulée avant toute prise de stock", "Annullato prima di prendere magazzino", "Cancelado antes de tomar stock", "Cancelada antes de tomar stock", "Отменено до взятия запаса", "在庫確保前にキャンセル", "在占用库存前已取消", "أُلغي قبل أخذ المخزون", "स्टॉक लेने से पहले रद्द"),
  "Returned to the shelf ({returned})": L("Rafa geri döndü ({returned})", "Zurück im Regal ({returned})", "Remis en rayon ({returned})", "Tornato a scaffale ({returned})", "Devuelto a la estantería ({returned})", "Devolvido à prateleira ({returned})", "Возвращено на полку ({returned})", "棚に戻しました（{returned}）", "已放回货架（{returned}）", "أُعيد إلى الرف ({returned})", "शेल्फ़ पर वापस ({returned})"),
  "Reserve stock": L("Stok ayır", "Bestand reservieren", "Réserver le stock", "Riserva magazzino", "Reservar stock", "Reservar stock", "Зарезервировать запас", "在庫を確保", "预留库存", "احجز المخزون", "स्टॉक आरक्षित करें"),
  "Try again": L("Tekrar dene", "Erneut versuchen", "Réessayer", "Riprova", "Reintentar", "Tentar novamente", "Повторить", "再試行", "重试", "حاول مرة أخرى", "फिर से कोशिश करें"),
  "This will reserve {reserve}, record {sell} as sold and give back {release} on {card}.": L("Bu işlem {card} üzerinde {reserve} ayıracak, {sell} satıldı olarak kaydedecek ve {release} geri verecek.", "Dadurch werden auf {card} {reserve} reserviert, {sell} als verkauft erfasst und {release} freigegeben.", "Cela réservera {reserve}, enregistrera {sell} comme vendu(s) et rendra {release} sur {card}.", "Verranno riservati {reserve}, registrati {sell} come venduti e liberati {release} su {card}.", "Se reservarán {reserve}, se registrarán {sell} como vendidos y se liberarán {release} en {card}.", "Serão reservados {reserve}, registados {sell} como vendidos e devolvidos {release} em {card}.", "Будет зарезервировано {reserve}, отмечено проданными {sell} и возвращено {release} на {card}.", "{card}で{reserve}点を確保し、{sell}点を販売済みとして記録し、{release}点を解除します。", "将在 {card} 上预留 {reserve} 件，记录 {sell} 件为已售，并释放 {release} 件。", "سيتم حجز {reserve} وتسجيل {sell} كمباع وإعادة {release} على {card}.", "इससे {card} पर {reserve} आरक्षित होंगे, {sell} बिके दर्ज होंगे और {release} छोड़े जाएँगे।"),
  "Confirm": L("Onayla", "Bestätigen", "Confirmer", "Conferma", "Confirmar", "Confirmar", "Подтвердить", "確認", "确认", "تأكيد", "पुष्टि करें"),
  "Item returned": L("Ürün geri geldi", "Artikel zurückgekommen", "Article revenu", "Articolo rientrato", "Artículo devuelto", "Artigo devolvido", "Товар вернулся", "商品が戻った", "物品已退回", "عاد الصنف", "वस्तु वापस आई"),
  "How many came back?": L("Kaç tane geri geldi?", "Wie viele sind zurückgekommen?", "Combien sont revenus ?", "Quanti sono rientrati?", "¿Cuántos volvieron?", "Quantos voltaram?", "Сколько вернулось?", "いくつ戻りましたか？", "退回了多少件？", "كم عدد ما عاد؟", "कितने वापस आए?"),
  "Put back on the shelf": L("Rafa geri koy", "Zurück ins Regal", "Remettre en rayon", "Rimetti a scaffale", "Devolver a la estantería", "Devolver à prateleira", "Вернуть на полку", "棚に戻す", "放回货架", "أعِده إلى الرف", "शेल्फ़ पर वापस रखें"),
  "A refund on eBay is money, not goods: the item stays sold until you say it came back.": L("eBay'deki iade paradır, mal değil: siz geri geldiğini söyleyene kadar ürün satılmış kalır.", "Eine Erstattung bei eBay ist Geld, keine Ware: Der Artikel bleibt verkauft, bis Sie sagen, dass er zurück ist.", "Un remboursement eBay, c'est de l'argent, pas de la marchandise : l'article reste vendu tant que vous ne dites pas qu'il est revenu.", "Un rimborso su eBay è denaro, non merce: l'articolo resta venduto finché non dici che è rientrato.", "Un reembolso en eBay es dinero, no mercancía: el artículo sigue vendido hasta que indiques que ha vuelto.", "Um reembolso no eBay é dinheiro, não mercadoria: o artigo continua vendido até indicar que voltou.", "Возврат денег на eBay — это деньги, а не товар: товар остаётся проданным, пока вы не отметите, что он вернулся.", "eBayの返金はお金であって商品ではありません。戻ったと記録するまで、商品は販売済みのままです。", "eBay 退款是钱，不是货：在您确认物品退回之前，它仍为已售。", "استرداد المبلغ على eBay مال وليس بضاعة: يبقى الصنف مباعًا حتى تؤكد أنه عاد.", "eBay पर रिफ़ंड पैसा है, सामान नहीं: जब तक आप न बताएँ कि वस्तु लौटी है, वह बिकी ही रहेगी।"),
  "The listing now points to another card; this order keeps the card it took stock from.": L("İlan artık başka bir kartı gösteriyor; bu sipariş stok aldığı kartı korur.", "Das Angebot verweist jetzt auf eine andere Karte; diese Bestellung behält die Karte, von der sie Bestand genommen hat.", "L'annonce pointe désormais vers une autre fiche ; cette commande garde la fiche dont elle a pris le stock.", "L'inserzione ora punta a un'altra scheda; questo ordine mantiene la scheda da cui ha preso magazzino.", "El anuncio ahora apunta a otra ficha; este pedido conserva la ficha de la que tomó stock.", "O anúncio aponta agora para outra ficha; esta encomenda mantém a ficha de onde tomou stock.", "Объявление теперь указывает на другую карточку; этот заказ сохраняет карточку, с которой взял запас.", "出品は現在別のカードを指しています。この注文は在庫を確保したカードのままです。", "该刊登现在指向另一张卡片；此订单保留其占用库存的原卡片。", "تشير القائمة الآن إلى بطاقة أخرى؛ يحتفظ هذا الطلب بالبطاقة التي أخذ منها المخزون.", "लिस्टिंग अब दूसरे कार्ड की ओर है; यह ऑर्डर उसी कार्ड को रखता है जिससे स्टॉक लिया था।"),
  "Shipments on eBay": L("eBay'deki gönderiler", "Sendungen bei eBay", "Envois sur eBay", "Spedizioni su eBay", "Envíos en eBay", "Envios no eBay", "Отправления на eBay", "eBayでの発送", "eBay 上的发货", "الشحنات على eBay", "eBay पर शिपमेंट"),
  "Partly shipped": L("Kısmen gönderildi", "Teilweise versendet", "Partiellement expédiée", "Spedito in parte", "Enviado en parte", "Parcialmente enviada", "Частично отправлен", "一部発送済み", "部分发货", "تم الشحن جزئيًا", "आंशिक रूप से भेजा गया"),
  "No shipment on eBay yet.": L("eBay'de henüz gönderi yok.", "Noch keine Sendung bei eBay.", "Aucun envoi sur eBay pour l'instant.", "Ancora nessuna spedizione su eBay.", "Aún no hay envíos en eBay.", "Ainda não há envios no eBay.", "На eBay пока нет отправлений.", "eBayでの発送はまだありません。", "eBay 上尚无发货。", "لا توجد شحنة على eBay بعد.", "eBay पर अभी कोई शिपमेंट नहीं।"),
  "Shipped {date}": L("{date} tarihinde gönderildi", "Versendet am {date}", "Expédié le {date}", "Spedito il {date}", "Enviado el {date}", "Enviado a {date}", "Отправлено {date}", "{date}に発送", "已于 {date} 发货", "شُحن في {date}", "{date} को भेजा गया"),
  "Followed in NivaDesk": L("NivaDesk'te takip ediliyor", "In NivaDesk verfolgt", "Suivi dans NivaDesk", "Seguito in NivaDesk", "Seguido en NivaDesk", "Acompanhado no NivaDesk", "Отслеживается в NivaDesk", "NivaDeskで追跡中", "已在 NivaDesk 中跟踪", "متابَع في NivaDesk", "NivaDesk में ट्रैक हो रहा है"),
  "Follow in NivaDesk": L("NivaDesk'te takip et", "In NivaDesk verfolgen", "Suivre dans NivaDesk", "Segui in NivaDesk", "Seguir en NivaDesk", "Acompanhar no NivaDesk", "Отслеживать в NivaDesk", "NivaDeskで追跡", "在 NivaDesk 中跟踪", "تابِع في NivaDesk", "NivaDesk में ट्रैक करें"),
  "Following…": L("Takip başlatılıyor…", "Wird verfolgt…", "Suivi en cours…", "Avvio del monitoraggio…", "Siguiendo…", "A acompanhar…", "Подключаем отслеживание…", "追跡を開始中…", "正在开始跟踪…", "جارٍ بدء المتابعة…", "ट्रैकिंग शुरू हो रही है…"),
  "NivaDesk could not start following this number — the tracking panel on this order says why": L("NivaDesk bu numarayı takibe alamadı — nedeni bu siparişin takip panelinde yazıyor", "NivaDesk konnte diese Nummer nicht verfolgen — warum, steht im Sendungsbereich dieser Bestellung", "NivaDesk n'a pas pu commencer à suivre ce numéro — le panneau de suivi de cette commande indique pourquoi", "NivaDesk non è riuscito a seguire questo numero — il pannello di tracciamento di questo ordine spiega perché", "NivaDesk no pudo empezar a seguir este número — el panel de seguimiento de este pedido explica por qué", "O NivaDesk não conseguiu começar a acompanhar este número — o painel de seguimento desta encomenda explica porquê", "NivaDesk не удалось начать отслеживать этот номер — причина указана в панели отслеживания этого заказа", "NivaDeskはこの番号の追跡を開始できませんでした。理由はこの注文の追跡パネルに表示されています", "NivaDesk 未能开始跟踪此号码——原因见此订单的跟踪面板", "تعذّر على NivaDesk بدء متابعة هذا الرقم — تجد السبب في لوحة التتبع لهذا الطلب", "NivaDesk इस नंबर को ट्रैक करना शुरू नहीं कर सका — कारण इस ऑर्डर के ट्रैकिंग पैनल में है"),
  "In the order's tracking field — not followed yet": L("Siparişin takip alanında — henüz takip edilmiyor", "Im Sendungsfeld der Bestellung — noch nicht verfolgt", "Dans le champ de suivi de la commande — pas encore suivi", "Nel campo di tracciamento dell'ordine — non ancora seguito", "En el campo de seguimiento del pedido — aún sin seguir", "No campo de seguimento da encomenda — ainda não acompanhado", "В поле отслеживания заказа — пока не отслеживается", "注文の追跡番号欄にあります（まだ追跡していません）", "已在订单的跟踪号字段中——尚未跟踪", "في حقل تتبع الطلب — لم تتم متابعته بعد", "ऑर्डर के ट्रैकिंग फ़ील्ड में — अभी ट्रैक नहीं हो रहा"),
  "Open on 17TRACK": L("17TRACK'te aç", "Auf 17TRACK öffnen", "Ouvrir sur 17TRACK", "Apri su 17TRACK", "Abrir en 17TRACK", "Abrir no 17TRACK", "Открыть на 17TRACK", "17TRACKで開く", "在 17TRACK 打开", "افتح على 17TRACK", "17TRACK पर खोलें"),
  "In this package": L("Bu pakette", "In diesem Paket", "Dans ce colis", "In questo pacco", "En este paquete", "Neste volume", "В этой посылке", "この荷物の中身", "此包裹内", "في هذا الطرد", "इस पैकेज में"),
  "One package is followed at a time; NivaDesk follows the one you choose.": L("Aynı anda tek paket takip edilir; NivaDesk seçtiğinizi takip eder.", "Es wird jeweils ein Paket verfolgt; NivaDesk verfolgt das von Ihnen gewählte.", "Un seul colis est suivi à la fois ; NivaDesk suit celui que vous choisissez.", "Si segue un pacco alla volta; NivaDesk segue quello che scegli.", "Se sigue un paquete a la vez; NivaDesk sigue el que elijas.", "É acompanhado um volume de cada vez; o NivaDesk acompanha o que escolher.", "Одновременно отслеживается одна посылка; NivaDesk отслеживает выбранную вами.", "追跡できる荷物は一度に1つです。NivaDeskは選んだものを追跡します。", "一次只跟踪一个包裹；NivaDesk 会跟踪您选择的那个。", "تتم متابعة طرد واحد في كل مرة؛ يتابع NivaDesk الطرد الذي تختاره.", "एक समय में एक पैकेज ट्रैक होता है; NivaDesk आपका चुना हुआ ट्रैक करता है।"),
  "The buyer's address is kept protected by eBay, so NivaDesk cannot make a shipping label for this order. Create the label in eBay — the tracking number comes back here by itself.": L(
    "Alıcının adresi eBay tarafından korunur; bu yüzden NivaDesk bu sipariş için gönderi etiketi oluşturamaz. Etiketi eBay'de oluşturun — takip numarası buraya kendiliğinden gelir.",
    "Die Adresse des Käufers wird von eBay geschützt, daher kann NivaDesk für diese Bestellung kein Versandetikett erstellen. Erstellen Sie das Etikett bei eBay — die Sendungsnummer kommt von selbst hierher.",
    "L'adresse de l'acheteur est protégée par eBay : NivaDesk ne peut donc pas créer d'étiquette d'expédition pour cette commande. Créez l'étiquette sur eBay — le numéro de suivi reviendra ici tout seul.",
    "L'indirizzo dell'acquirente è protetto da eBay, quindi NivaDesk non può creare un'etichetta di spedizione per questo ordine. Crea l'etichetta su eBay: il numero di tracciamento arriverà qui da solo.",
    "eBay protege la dirección del comprador, así que NivaDesk no puede crear una etiqueta de envío para este pedido. Crea la etiqueta en eBay: el número de seguimiento llegará aquí solo.",
    "A morada do comprador é protegida pelo eBay, por isso o NivaDesk não pode criar uma etiqueta de envio para esta encomenda. Crie a etiqueta no eBay — o número de seguimento chega aqui sozinho.",
    "Адрес покупателя защищён eBay, поэтому NivaDesk не может создать ярлык доставки для этого заказа. Создайте ярлык в eBay — трек-номер придёт сюда сам.",
    "購入者の住所はeBayによって保護されているため、NivaDeskではこの注文の配送ラベルを作成できません。ラベルはeBayで作成してください。追跡番号は自動でここに反映されます。",
    "买家地址受 eBay 保护，因此 NivaDesk 无法为此订单创建运单标签。请在 eBay 中创建标签——跟踪号会自动回到这里。",
    "عنوان المشتري محمي لدى eBay، لذلك لا يمكن لـ NivaDesk إنشاء ملصق شحن لهذا الطلب. أنشئ الملصق على eBay — وسيعود رقم التتبع إلى هنا تلقائيًا.",
    "खरीदार का पता eBay द्वारा सुरक्षित रखा जाता है, इसलिए NivaDesk इस ऑर्डर का शिपिंग लेबल नहीं बना सकता। लेबल eBay में बनाएँ — ट्रैकिंग नंबर अपने आप यहाँ आ जाएगा।"),
  "Could not load the stock for this order.": L("Bu siparişin stoğu yüklenemedi.", "Der Bestand für diese Bestellung konnte nicht geladen werden.", "Impossible de charger le stock de cette commande.", "Impossibile caricare il magazzino di questo ordine.", "No se pudo cargar el stock de este pedido.", "Não foi possível carregar o stock desta encomenda.", "Не удалось загрузить запас для этого заказа.", "この注文の在庫を読み込めませんでした。", "无法加载此订单的库存。", "تعذّر تحميل مخزون هذا الطلب.", "इस ऑर्डर का स्टॉक लोड नहीं हो सका।"),
  "Unit cost": L("Birim maliyet", "Stückkosten", "Coût unitaire", "Costo unitario", "Coste unitario", "Custo unitário", "Себестоимость единицы", "単価原価", "单位成本", "تكلفة الوحدة", "प्रति इकाई लागत"),
  // the settings card
  "Products → Inventory": L("Ürünler → Envanter", "Produkte → Inventar", "Produits → Inventaire", "Prodotti → Inventario", "Productos → Inventario", "Produtos → Inventário", "Товары → Склад", "商品 → 在庫", "商品 → 库存", "المنتجات ← المخزون", "उत्पाद → इन्वेंटरी"),
  "{count} eBay listings linked to stock": L("Stoğa bağlı {count} eBay ilanı", "{count} eBay-Angebote mit Bestand verknüpft", "{count} annonces eBay liées au stock", "{count} inserzioni eBay collegate al magazzino", "{count} anuncios de eBay vinculados al stock", "{count} anúncios do eBay ligados ao stock", "Объявлений eBay, связанных со складом: {count}", "在庫にリンクしたeBay出品 {count}件", "{count} 个 eBay 刊登已关联库存", "{count} من قوائم eBay مرتبطة بالمخزون", "{count} eBay लिस्टिंग स्टॉक से जुड़ी"),
  "Listing access approved": L("İlan erişimi onaylandı", "Zugriff auf Angebote erlaubt", "Accès aux annonces autorisé", "Accesso alle inserzioni approvato", "Acceso a los anuncios aprobado", "Acesso aos anúncios aprovado", "Доступ к объявлениям разрешён", "出品へのアクセスを許可済み", "已批准刊登访问", "تمت الموافقة على الوصول إلى القوائم", "लिस्टिंग एक्सेस मंज़ूर"),
  "Listing access not approved yet: Reconnect eBay to approve it": L("İlan erişimi henüz onaylanmadı: onaylamak için eBay'i yeniden bağlayın", "Zugriff auf Angebote noch nicht erlaubt: Verbinden Sie eBay neu, um ihn zu erlauben", "Accès aux annonces pas encore autorisé : reconnectez eBay pour l'autoriser", "Accesso alle inserzioni non ancora approvato: ricollega eBay per approvarlo", "Acceso a los anuncios aún no aprobado: vuelve a conectar eBay para aprobarlo", "Acesso aos anúncios ainda não aprovado: volte a ligar o eBay para o aprovar", "Доступ к объявлениям ещё не разрешён: переподключите eBay, чтобы разрешить", "出品へのアクセスは未許可です：eBayを再接続して許可してください", "尚未批准刊登访问：请重新连接 eBay 以批准", "لم تتم الموافقة على الوصول إلى القوائم بعد: أعد ربط eBay للموافقة", "लिस्टिंग एक्सेस अभी मंज़ूर नहीं: मंज़ूरी के लिए eBay फिर से कनेक्ट करें"),
  "Open eBay listings": L("eBay ilanlarını aç", "eBay-Angebote öffnen", "Ouvrir les annonces eBay", "Apri le inserzioni eBay", "Abrir anuncios de eBay", "Abrir anúncios do eBay", "Открыть объявления eBay", "eBayの出品を開く", "打开 eBay 刊登", "افتح قوائم eBay", "eBay लिस्टिंग खोलें")
};

/** The sentence in `language`, or "" when this table has none (the screen then asks the app's studioT). */
export function ebayInventoryText(sentence: string, language: string): string {
  if (!Object.prototype.hasOwnProperty.call(EBAY_INVENTORY_TEXT, sentence)) return "";
  const row = EBAY_INVENTORY_TEXT[sentence];
  return Object.prototype.hasOwnProperty.call(row, language) ? row[language as Lang] : "";
}
