import type { StudioLanguage } from "./language";
import { ETSY_SHIPPING_ENTER_HINT, ETSY_SHIPPING_UNKNOWN_FREE, ETSY_SHIPPING_UNKNOWN_PAID, etsyNoteSentenceJoin } from "./etsyShippingCost";

// K5 (26 Oct 2026, owner decisions r3 + r4): whose shipping cost a WooCommerce, Shopify or inbound-webhook order holds.
//
// The server keeps one record on such an order, `deliveryCostOwner` (created only while the workspace is in the K5
// pilot, appConfig/deliveryCostOwnership): "channel" = the figure the channel sent (what the BUYER paid for shipping,
// not what the parcel cost), "seller" = the seller's own figure (ownerSource "manual" when set through this screen's
// shipping cost editor, "inferred" when the server deduced it from a value an older client wrote), "unknown" = an order
// from before K5 whose value differs from the channel's and whose earlier channel figure no stored data proves.
//
// r4: the pilot can be switched off while orders still carry records. The server then keeps protecting ONLY explicit
// manual postage (seller/manual); every other record is ignored for protection and the channel writes as before K5.
// So this screen shows K5 labels and uses the K5 edit path for a non-manual record ONLY when the server says the
// protection is on for this workspace (getDeliveryCostOwnershipState; unknown = off). A manual record keeps both.
//
// This file does NOT change a number. It decides (1) what the Shipping Cost row says about the figure, (2) whether
// the profit is final or an estimate, (3) which review actions to offer. Every channel order gets (2), record or not:
// an empty cost, or a 0 nobody chose, is never shown as a verified zero / Final Profit.

export type DeliveryCostChannel = "woocommerce" | "shopify" | "inbound";
export type DeliveryCostOwnerName = "channel" | "seller" | "unknown";
export type DeliveryCostReviewReason = "pre_k5_conflict" | "changed_outside_manual_path" | "synced_while_paused";

export type DeliveryCostOwnerRecord = {
  owner: DeliveryCostOwnerName;
  ownerSource: string;
  channel: DeliveryCostChannel;
  channelSent: number | null;
  channelSentKnown: boolean;
  channelHistory: number[];
  channelPending: number | null;
  channelPendingAtMs: number | null;
  keptValue: number | null;
  manualValue: number | null;
  manualAtMs: number | null;
  /** r4: the value a channel sync replaced while the pilot was off (reviewReason "synced_while_paused"). */
  pausedValue: number | null;
  pausedAtMs: number | null;
  needsReview: boolean;
  reviewReason: DeliveryCostReviewReason | null;
};

const CHANNELS: DeliveryCostChannel[] = ["woocommerce", "shopify", "inbound"];
const REASONS: DeliveryCostReviewReason[] = ["pre_k5_conflict", "changed_outside_manual_path", "synced_while_paused"];

function moneyOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function pence(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100);
}

function msOrNull(value: unknown): number | null {
  return value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
}

/** The server's record, read defensively (older r2/r3 records lack ownerSource / channelSentKnown / manualValue / pausedValue). */
export function parseDeliveryCostOwner(raw: unknown): DeliveryCostOwnerRecord | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  const owner = String(v.owner || "") as DeliveryCostOwnerName;
  const channel = String(v.channel || "") as DeliveryCostChannel;
  if (!["channel", "seller", "unknown"].includes(owner) || !CHANNELS.includes(channel)) return null;
  const channelSent = moneyOrNull(v.channelSent);
  const reason = String(v.reviewReason || "") as DeliveryCostReviewReason;
  return {
    owner,
    ownerSource: typeof v.ownerSource === "string" && v.ownerSource ? v.ownerSource : (owner === "seller" ? "inferred" : "sync"),
    channel,
    channelSent,
    channelSentKnown: typeof v.channelSentKnown === "boolean" ? v.channelSentKnown : channelSent !== null,
    channelHistory: Array.isArray(v.channelHistory) ? v.channelHistory.map(moneyOrNull).filter((x): x is number => x !== null) : [],
    channelPending: moneyOrNull(v.channelPending),
    channelPendingAtMs: msOrNull(v.channelPendingAtMs),
    keptValue: moneyOrNull(v.keptValue),
    manualValue: moneyOrNull(v.manualValue),
    manualAtMs: msOrNull(v.manualAtMs),
    pausedValue: moneyOrNull(v.pausedValue),
    pausedAtMs: msOrNull(v.pausedAtMs),
    needsReview: v.needsReview === true,
    reviewReason: REASONS.includes(reason) ? reason : (v.needsReview === true && owner === "unknown" ? "pre_k5_conflict" : null)
  };
}

/** Explicit manual postage (seller/manual): protected by the server whether or not the pilot is on. */
export function isExplicitManualRecord(record: DeliveryCostOwnerRecord | null | undefined): boolean {
  return Boolean(record && record.owner === "seller" && record.ownerSource === "manual");
}

/** Whether the order screen needs the workspace's protection state (a record that is not explicit manual). */
export function needsDeliveryCostProtectionState(record: DeliveryCostOwnerRecord | null | undefined): boolean {
  return Boolean(record) && !isExplicitManualRecord(record);
}

export type ChannelShippingOrderLike = {
  id: string;
  deliveryCost?: unknown;
  /** false when the order document carries no deliveryCost at all (the loader defaults the number to 0). */
  deliveryCostPresent?: boolean;
  commerce?: { provider?: string } | null;
  deliveryCostOwner?: DeliveryCostOwnerRecord | null;
};

/** Woo / Shopify / inbound, from the record, the commerce stamp, or the document id. null for every other order. */
export function channelOfOrder(order: ChannelShippingOrderLike): DeliveryCostChannel | null {
  const fromRecord = order.deliveryCostOwner?.channel;
  if (fromRecord && CHANNELS.includes(fromRecord)) return fromRecord;
  const provider = String(order.commerce?.provider || "").toLowerCase() as DeliveryCostChannel;
  if (CHANNELS.includes(provider)) return provider;
  const id = String(order.id || "");
  if (id.startsWith("woo_")) return "woocommerce";
  if (id.startsWith("shopify_")) return "shopify";
  if (id.startsWith("inbound_")) return "inbound";
  return null;
}

/** The name a person reads ("Website" for the inbound webhook: Zapier, Wix, Make, Squarespace, a site's own code). */
export function channelDisplayName(channel: DeliveryCostChannel): string {
  return channel === "woocommerce" ? "WooCommerce" : channel === "shopify" ? "Shopify" : "Website";
}

export type ChannelShippingAction =
  | { kind: "keep"; deliveryCost: number; mine?: boolean }  // setDeliveryCostManual(deliveryCost = what the order holds)
  | { kind: "restore"; deliveryCost: number }       // setDeliveryCostManual(the value to bring back)
  | { kind: "use_channel"; figure: number | null }  // returnDeliveryCostToChannel
  | { kind: "accept_channel"; deliveryCost: number } // returnDeliveryCostToChannel when the order already holds the channel's figure
  | { kind: "confirm_zero" };                        // setDeliveryCostManual(0)

export type ChannelShippingNote =
  | { key: "not_entered" }
  | { key: "buyer_paid"; amount: number }
  | { key: "free" }
  | { key: "review_conflict"; channelFigure: number | null; orderFigure: number | null }
  | { key: "review_outside"; was: number | null; now: number | null }
  | { key: "review_paused"; was: number | null; now: number | null };

export type ChannelShippingState = {
  channel: DeliveryCostChannel;
  hasRecord: boolean;
  /** The profit must read "Estimated profit" (not green) — labels only, no figure changes. */
  estimate: boolean;
  /** The one line under the profit (and the Shipping Cost row's review box text). */
  note: ChannelShippingNote | null;
  /** What the Shipping Cost row says about its figure. */
  status: "channel" | "channel_free" | "your_value" | "review" | "none";
  /** your_value: true = explicit manual (syncs never replace it), false = only while the protection is on. */
  yoursExplicit: boolean;
  actions: ChannelShippingAction[];
  /** With a record that applies, a Shipping Cost edit goes through setDeliveryCostManual (expected = the value on screen). */
  manualEditPath: boolean;
};

/**
 * The whole decision for one order; null = not a WooCommerce / Shopify / inbound order (nothing changes).
 * protectionOn: the server's answer for this workspace (true / false), or null while it is not known. A record that
 * is not explicit manual only counts when protectionOn === true; otherwise the order reads as one without a record.
 */
export function channelShippingState(order: ChannelShippingOrderLike, protectionOn: boolean | null): ChannelShippingState | null {
  const channel = channelOfOrder(order);
  if (!channel) return null;
  const raw = order.deliveryCostOwner ?? null;
  const explicit = isExplicitManualRecord(raw);
  const record = raw && (explicit || protectionOn === true) ? raw : null;
  const current = order.deliveryCostPresent === false ? null : moneyOrNull(order.deliveryCost);
  const notEntered = current === null || current === 0;
  if (!record) {
    return {
      channel, hasRecord: false, estimate: notEntered, note: notEntered ? { key: "not_entered" } : null,
      status: "none", yoursExplicit: false, actions: [], manualEditPath: false
    };
  }
  const base = { channel, hasRecord: true, manualEditPath: true, yoursExplicit: explicit };
  const knownFigure = record.channelSentKnown && record.channelSent !== null ? record.channelSent : null;
  const useChannel = (figure: number | null): ChannelShippingAction[] => (figure !== null && pence(figure) !== pence(current) ? [{ kind: "use_channel", figure }] : []);

  if (record.owner === "unknown" || (record.needsReview && record.reviewReason === "pre_k5_conflict")) {
    const channelFigure = record.channelPending ?? knownFigure;
    const actions: ChannelShippingAction[] = [];
    if (current !== null) actions.push({ kind: "keep", deliveryCost: current, mine: true });
    actions.push({ kind: "use_channel", figure: channelFigure });
    return { ...base, estimate: true, note: { key: "review_conflict", channelFigure, orderFigure: current }, status: "review", actions };
  }
  if (record.owner === "channel" && record.reviewReason === "synced_while_paused") {
    // r4 (D4): a SYSTEM change - the channel replaced the value while the pilot was off. Said as such; turning the
    // pilot back on did not undo it, so the seller chooses: bring the replaced value back, or keep the channel's.
    const actions: ChannelShippingAction[] = [];
    if (record.pausedValue !== null && pence(record.pausedValue) !== pence(current)) actions.push({ kind: "restore", deliveryCost: record.pausedValue });
    if (current !== null && knownFigure !== null && pence(knownFigure) === pence(current)) actions.push({ kind: "accept_channel", deliveryCost: current });
    else actions.push(...useChannel(knownFigure));
    return { ...base, estimate: true, note: { key: "review_paused", was: record.pausedValue, now: current }, status: "review", actions };
  }
  if (record.owner === "seller") {
    if (record.needsReview && record.reviewReason === "changed_outside_manual_path") {
      // The value no longer equals the one saved as the seller's; the cause is not known, so it is not named.
      const actions: ChannelShippingAction[] = [];
      if (current !== null) actions.push({ kind: "keep", deliveryCost: current });
      if (record.manualValue !== null && pence(record.manualValue) !== pence(current)) actions.push({ kind: "restore", deliveryCost: record.manualValue });
      actions.push(...useChannel(knownFigure));
      return { ...base, estimate: true, note: { key: "review_outside", was: record.manualValue, now: current }, status: "review", actions };
    }
    if (record.ownerSource === "manual" && current !== null) {
      // The seller chose this figure on the explicit path — 0 included. A verified cost.
      return { ...base, estimate: false, note: null, status: "your_value", actions: useChannel(knownFigure) };
    }
    if (notEntered) {
      const actions: ChannelShippingAction[] = current === 0 ? [{ kind: "confirm_zero" }] : [];
      return { ...base, estimate: true, note: { key: "not_entered" }, status: "your_value", actions: [...actions, ...useChannel(knownFigure)] };
    }
    return { ...base, estimate: false, note: null, status: "your_value", actions: useChannel(knownFigure) };
  }
  // owner "channel": the figure is what the buyer paid (an assumption), or nothing the channel reported.
  if (knownFigure === null) {
    if (notEntered) {
      return { ...base, estimate: true, note: { key: "not_entered" }, status: "none", actions: current === 0 ? [{ kind: "confirm_zero" }] : [] };
    }
    return { ...base, estimate: true, note: { key: "buyer_paid", amount: current as number }, status: "channel", actions: [] };
  }
  const channelFigures = new Set([...record.channelHistory, knownFigure].map((x) => pence(x)));
  if (current === null || channelFigures.has(pence(current))) {
    const shown = current ?? knownFigure;
    if (pence(shown) === 0) return { ...base, estimate: true, note: { key: "free" }, status: "channel_free", actions: [] };
    return { ...base, estimate: true, note: { key: "buyer_paid", amount: shown }, status: "channel", actions: [] };
  }
  // A figure none of the channel's: typed by an older client since the last sync — the server makes it the
  // seller's at the next sync while the protection is on. A 0 nobody confirmed still reads as not entered.
  if (current === 0) return { ...base, estimate: true, note: { key: "not_entered" }, status: "your_value", actions: [{ kind: "confirm_zero" }, ...useChannel(knownFigure)] };
  return { ...base, estimate: false, note: null, status: "your_value", actions: useChannel(knownFigure) };
}

// ---- texts (English is the source; every other language is a DRAFT for the owner's approval) ----
// r4: "buyer paid" / "free shipping" notes and the hint under the profit ARE ETSY-SHIP-2's ESC-01..03 (same text, one
// translation table in etsyShippingCost.ts) - reused here, not repeated.
export const K5_STATUS_CHANNEL = "From {channel}: buyer paid {amount}";
export const K5_STATUS_CHANNEL_FREE = "From {channel}: the buyer paid no shipping";
export const K5_STATUS_YOURS = "Your value — {channel} syncs don't replace it unless you choose {channel}'s value";
export const K5_STATUS_YOURS_WHILE_ON = "Your value — {channel} syncs don't replace it while shipping cost protection is on";
export const K5_NOTE_NOT_ENTERED = "Shipping cost not entered — profit is an estimate";
export const K5_NOTE_BUYER_PAID = ETSY_SHIPPING_UNKNOWN_PAID;
export const K5_NOTE_FREE = ETSY_SHIPPING_UNKNOWN_FREE;
export const K5_ENTER_HINT = ETSY_SHIPPING_ENTER_HINT;
export const K5_REVIEW_CONFLICT = "{channel} says {channelAmount}, this order has {orderAmount}";
export const K5_REVIEW_CONFLICT_HINT = "NivaDesk could not confirm where this figure came from. Choose which one to keep.";
export const K5_REVIEW_OUTSIDE = "Shipping cost changed after it was saved as your value: was {was}, now {now}";
export const K5_REVIEW_PAUSED = "{channel} sync replaced {was} with {now} while shipping cost protection was off";
export const K5_REVIEW_PAUSED_HINT = "Turning protection back on did not change it back. Choose which figure to keep.";
export const K5_ACTION_KEEP_MINE = "Keep my value";
export const K5_ACTION_KEEP_AMOUNT = "Keep {amount}";
export const K5_ACTION_RESTORE = "Restore {amount}";
export const K5_ACTION_USE_CHANNEL = "Use {channel}'s value";
export const K5_ACTION_USE_CHANNEL_AMOUNT = "Use {channel}'s value ({amount})";
export const K5_ACTION_CONFIRM_ZERO = "Confirm {amount}";
export const K5_STALE = "Shipping cost changed on another device — it is now {amount}. Nothing was overwritten.";
export const K5_SAVED_MANUAL = "Shipping cost saved as your value.";
/** returnDeliveryCostToChannel answered applied = true: the order holds the channel's figure now. */
export const K5_RETURNED = "Shipping cost set to {channel}'s figure, {amount}.";
/** applied = false: no figure on record; the value stays until a sync writes one. */
export const K5_RETURNED_NEXT_SYNC = "Shipping cost handed back to {channel}. It stays {amount} until a {channel} sync sets a new figure.";
export const K5_SAVE_FAILED = "Could not update the shipping cost. Please try again.";

const fill = (text: string, values: Record<string, string>) => Object.entries(values).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), text);

/** The review/estimate sentence alone (the Shipping Cost row's review box). `money` is the order's own money format. */
export function channelShippingNoteText(note: ChannelShippingNote, channel: DeliveryCostChannel, t: (text: string) => string, money: (value: number) => string): string {
  const name = t(channelDisplayName(channel));
  const m = (value: number | null) => (value === null ? "—" : money(value));
  switch (note.key) {
    case "not_entered": return t(K5_NOTE_NOT_ENTERED);
    case "buyer_paid": return fill(t(K5_NOTE_BUYER_PAID), { amount: m(note.amount) });
    case "free": return t(K5_NOTE_FREE);
    case "review_conflict": return fill(t(K5_REVIEW_CONFLICT), { channel: name, channelAmount: m(note.channelFigure), orderAmount: m(note.orderFigure) });
    case "review_outside": return fill(t(K5_REVIEW_OUTSIDE), { was: m(note.was), now: m(note.now) });
    case "review_paused": return fill(t(K5_REVIEW_PAUSED), { channel: name, was: m(note.was), now: m(note.now) });
    default: return "";
  }
}

/** The second line of the review box, when there is one. */
export function channelShippingReviewHint(note: ChannelShippingNote | null, t: (text: string) => string): string {
  if (note?.key === "review_conflict") return t(K5_REVIEW_CONFLICT_HINT);
  if (note?.key === "review_paused") return t(K5_REVIEW_PAUSED_HINT);
  return "";
}

/** The note under the profit: the sentence + ESC-03, joined with the language's own punctuation (ETSY-SHIP-2 K3). */
export function channelShippingProfitNote(note: ChannelShippingNote, channel: DeliveryCostChannel, language: string, t: (text: string) => string, money: (value: number) => string): string {
  const isolated = language === "العربية (Arabic)" ? (value: number) => `⁦${money(value)}⁩` : money;
  return `${channelShippingNoteText(note, channel, t, isolated)}${etsyNoteSentenceJoin(language)}${t(K5_ENTER_HINT)}`;
}

/** The line under the Shipping Cost row (empty when there is nothing to say). */
export function channelShippingStatusText(state: ChannelShippingState, order: ChannelShippingOrderLike, t: (text: string) => string, money: (value: number) => string): string {
  const name = t(channelDisplayName(state.channel));
  const current = order.deliveryCostPresent === false ? null : moneyOrNull(order.deliveryCost);
  if (state.status === "channel") return fill(t(K5_STATUS_CHANNEL), { channel: name, amount: money(current ?? order.deliveryCostOwner?.channelSent ?? 0) });
  if (state.status === "channel_free") return fill(t(K5_STATUS_CHANNEL_FREE), { channel: name });
  if (state.status === "your_value") return fill(t(state.yoursExplicit ? K5_STATUS_YOURS : K5_STATUS_YOURS_WHILE_ON), { channel: name });
  return "";
}

export function channelShippingActionLabel(action: ChannelShippingAction, channel: DeliveryCostChannel, t: (text: string) => string, money: (value: number) => string): string {
  const name = t(channelDisplayName(channel));
  switch (action.kind) {
    case "keep": return action.mine ? t(K5_ACTION_KEEP_MINE) : fill(t(K5_ACTION_KEEP_AMOUNT), { amount: money(action.deliveryCost) });
    case "accept_channel": return fill(t(K5_ACTION_KEEP_AMOUNT), { amount: money(action.deliveryCost) });
    case "restore": return fill(t(K5_ACTION_RESTORE), { amount: money(action.deliveryCost) });
    case "use_channel": return action.figure === null ? fill(t(K5_ACTION_USE_CHANNEL), { channel: name }) : fill(t(K5_ACTION_USE_CHANNEL_AMOUNT), { channel: name, amount: money(action.figure) });
    case "confirm_zero": return fill(t(K5_ACTION_CONFIRM_ZERO), { amount: money(0) });
    default: return "";
  }
}

/** What the screen says after returnDeliveryCostToChannel: applied now (with the figure) or not until a sync. */
export function channelShippingReturnedText(applied: boolean, channel: DeliveryCostChannel, amount: string, t: (text: string) => string): string {
  return fill(t(applied ? K5_RETURNED : K5_RETURNED_NEXT_SYNC), { channel: t(channelDisplayName(channel)), amount });
}

export function channelShippingFill(text: string, values: Record<string, string>): string {
  return fill(text, values);
}

// Draft translations (owner's decision on the wording; English is the source). Merged after ETSY-SHIP-2 in language.ts.
// The three texts shared with ETSY-SHIP-2 (ESC-01..03) are NOT here: they are that package's keys and translations.
export const CHANNEL_SHIPPING_COST_TRANSLATIONS: Record<string, Partial<Record<StudioLanguage, string>>> = {
  [K5_STATUS_CHANNEL]: {
    "Türkçe": "{channel} kaynaklı: alıcı {amount} ödedi", "Deutsch": "Von {channel}: Käufer zahlte {amount}", "Français": "De {channel} : l'acheteur a payé {amount}",
    "Italiano": "Da {channel}: l'acquirente ha pagato {amount}", "Español (Spanish)": "De {channel}: el comprador pagó {amount}", "Português": "De {channel}: o comprador pagou {amount}",
    "Русский (Russian)": "Из {channel}: покупатель заплатил {amount}", "日本語 (Japanese)": "{channel}より: 購入者の支払額 {amount}", "中文 (Chinese)": "来自 {channel}：买家支付了 {amount}",
    "العربية (Arabic)": "من {channel}: دفع المشتري {amount}", "हिन्दी (Hindi)": "{channel} से: खरीदार ने {amount} चुकाए"
  },
  [K5_STATUS_CHANNEL_FREE]: {
    "Türkçe": "{channel} kaynaklı: alıcı kargo ücreti ödemedi", "Deutsch": "Von {channel}: Käufer zahlte keine Versandkosten", "Français": "De {channel} : l'acheteur n'a pas payé de livraison", "Italiano": "Da {channel}: l'acquirente non ha pagato la spedizione", "Español (Spanish)": "De {channel}: el comprador no pagó envío", "Português": "Do {channel}: o comprador não pagou envio", "Русский (Russian)": "Из {channel}: покупатель не платил за доставку", "日本語 (Japanese)": "{channel}より: 購入者は送料を支払っていません", "中文 (Chinese)": "来自 {channel}：买家未支付运费", "العربية (Arabic)": "من {channel}: لم يدفع المشتري رسوم شحن", "हिन्दी (Hindi)": "{channel} से: खरीदार ने शिपिंग का भुगतान नहीं किया"
  },
  [K5_STATUS_YOURS]: {
    "Türkçe": "Sizin değeriniz — {channel} değerini seçmediğiniz sürece {channel} senkronları bunu değiştirmez", "Deutsch": "Ihr Wert — {channel}-Synchronisierungen ersetzen ihn nicht, außer Sie wählen den Wert von {channel}", "Français": "Votre valeur — les synchronisations {channel} ne la remplacent pas, sauf si vous choisissez la valeur de {channel}", "Italiano": "Il tuo valore — le sincronizzazioni di {channel} non lo sostituiscono, a meno che tu scelga il valore di {channel}", "Español (Spanish)": "Tu valor — las sincronizaciones de {channel} no lo sustituyen salvo que elijas el valor de {channel}", "Português": "O seu valor — as sincronizações do {channel} não o substituem, a menos que escolha o valor do {channel}", "Русский (Russian)": "Ваше значение — синхронизация {channel} его не заменяет, пока вы не выберете значение {channel}", "日本語 (Japanese)": "あなたの値 — {channel}の値を選ばない限り、{channel}の同期で置き換わりません", "中文 (Chinese)": "您的数值 — 除非您选择 {channel} 的数值，{channel} 同步不会替换它", "العربية (Arabic)": "قيمتك — لا تستبدلها مزامنة {channel} إلا إذا اخترت قيمة {channel}", "हिन्दी (Hindi)": "आपका मान — जब तक आप {channel} का मान न चुनें, {channel} सिंक इसे नहीं बदलता"
  },
  [K5_STATUS_YOURS_WHILE_ON]: {
    "Türkçe": "Sizin değeriniz — kargo maliyeti koruması açıkken {channel} senkronları bunu değiştirmez", "Deutsch": "Ihr Wert — solange der Versandkostenschutz an ist, ersetzen {channel}-Synchronisierungen ihn nicht", "Français": "Votre valeur — tant que la protection du coût d'expédition est active, les synchronisations {channel} ne la remplacent pas", "Italiano": "Il tuo valore — finché la protezione del costo di spedizione è attiva, le sincronizzazioni di {channel} non lo sostituiscono", "Español (Spanish)": "Tu valor — mientras la protección del coste de envío esté activa, las sincronizaciones de {channel} no lo sustituyen", "Português": "O seu valor — enquanto a proteção do custo de envio estiver ativa, as sincronizações do {channel} não o substituem", "Русский (Russian)": "Ваше значение — пока защита стоимости доставки включена, синхронизация {channel} его не заменяет", "日本語 (Japanese)": "あなたの値 — 送料の保護がオンの間、{channel}の同期で置き換わりません", "中文 (Chinese)": "您的数值 — 运费保护开启期间，{channel} 同步不会替换它", "العربية (Arabic)": "قيمتك — لا تستبدلها مزامنة {channel} ما دامت حماية تكلفة الشحن مفعّلة", "हिन्दी (Hindi)": "आपका मान — शिपिंग लागत सुरक्षा चालू रहने तक {channel} सिंक इसे नहीं बदलता"
  },
  [K5_NOTE_NOT_ENTERED]: {
    "Türkçe": "Kargo maliyeti girilmedi — kâr tahminidir", "Deutsch": "Versandkosten nicht eingetragen — Gewinn ist geschätzt", "Français": "Coût d'expédition non saisi — le bénéfice est une estimation",
    "Italiano": "Costo di spedizione non inserito — il profitto è una stima", "Español (Spanish)": "Coste de envío no introducido — el beneficio es una estimación", "Português": "Custo de envio não introduzido — o lucro é uma estimativa",
    "Русский (Russian)": "Стоимость доставки не указана — прибыль приблизительная", "日本語 (Japanese)": "送料が未入力 — 利益は概算です", "中文 (Chinese)": "未填写运费 — 利润为估算",
    "العربية (Arabic)": "لم تُدخل تكلفة الشحن — الربح تقديري", "हिन्दी (Hindi)": "शिपिंग लागत दर्ज नहीं — लाभ अनुमानित है"
  },
  [K5_REVIEW_CONFLICT]: {
    "Türkçe": "{channel} {channelAmount} diyor, bu siparişte {orderAmount} var", "Deutsch": "{channel} meldet {channelAmount}, diese Bestellung hat {orderAmount}", "Français": "{channel} indique {channelAmount}, cette commande a {orderAmount}",
    "Italiano": "{channel} indica {channelAmount}, questo ordine ha {orderAmount}", "Español (Spanish)": "{channel} indica {channelAmount}, este pedido tiene {orderAmount}", "Português": "{channel} indica {channelAmount}, esta encomenda tem {orderAmount}",
    "Русский (Russian)": "{channel} сообщает {channelAmount}, в этом заказе {orderAmount}", "日本語 (Japanese)": "{channel}は{channelAmount}、この注文は{orderAmount}です", "中文 (Chinese)": "{channel} 显示 {channelAmount}，此订单为 {orderAmount}",
    "العربية (Arabic)": "يذكر {channel} ‏{channelAmount}، وهذا الطلب فيه {orderAmount}", "हिन्दी (Hindi)": "{channel} {channelAmount} बताता है, इस ऑर्डर में {orderAmount} है"
  },
  [K5_REVIEW_CONFLICT_HINT]: {
    "Türkçe": "NivaDesk bu tutarın nereden geldiğini doğrulayamadı. Hangisinin kalacağını seçin.", "Deutsch": "NivaDesk konnte nicht bestätigen, woher dieser Betrag stammt. Wählen Sie, welcher bleibt.", "Français": "NivaDesk n'a pas pu confirmer l'origine de ce montant. Choisissez celui à garder.", "Italiano": "NivaDesk non ha potuto confermare da dove proviene questo importo. Scegli quale tenere.", "Español (Spanish)": "NivaDesk no pudo confirmar de dónde viene este importe. Elige cuál conservar.", "Português": "O NivaDesk não conseguiu confirmar de onde veio este valor. Escolha qual manter.", "Русский (Russian)": "NivaDesk не смог подтвердить, откуда взялась эта сумма. Выберите, какую оставить.", "日本語 (Japanese)": "NivaDeskはこの金額の出所を確認できませんでした。残す方を選んでください。", "中文 (Chinese)": "NivaDesk 无法确认此金额的来源。请选择保留哪一个。", "العربية (Arabic)": "تعذّر على NivaDesk تأكيد مصدر هذا المبلغ. اختر أيّهما تُبقي.", "हिन्दी (Hindi)": "NivaDesk पुष्टि नहीं कर सका कि यह राशि कहाँ से आई। चुनें कि कौन-सी रखनी है।"
  },
  [K5_REVIEW_OUTSIDE]: {
    "Türkçe": "Kargo maliyeti sizin değeriniz olarak kaydedildikten sonra değişti: önce {was}, şimdi {now}", "Deutsch": "Versandkosten wurden geändert, nachdem sie als Ihr Wert gespeichert wurden: vorher {was}, jetzt {now}", "Français": "Le coût d'expédition a changé après son enregistrement comme votre valeur : avant {was}, maintenant {now}", "Italiano": "Il costo di spedizione è cambiato dopo essere stato salvato come tuo valore: prima {was}, ora {now}", "Español (Spanish)": "El coste de envío cambió después de guardarse como tu valor: antes {was}, ahora {now}", "Português": "O custo de envio mudou depois de ser guardado como o seu valor: antes {was}, agora {now}", "Русский (Russian)": "Стоимость доставки изменилась после сохранения как вашего значения: было {was}, стало {now}", "日本語 (Japanese)": "あなたの値として保存した後に送料が変更されました: 変更前 {was}、現在 {now}", "中文 (Chinese)": "运费在保存为您的数值后被更改：原为 {was}，现为 {now}", "العربية (Arabic)": "تغيّرت تكلفة الشحن بعد حفظها كقيمتك: كانت {was}، والآن {now}", "हिन्दी (Hindi)": "आपके मान के रूप में सहेजने के बाद शिपिंग लागत बदली: पहले {was}, अब {now}"
  },
  [K5_REVIEW_PAUSED]: {
    "Türkçe": "Kargo maliyeti koruması kapalıyken {channel} senkronu {was} tutarını {now} ile değiştirdi", "Deutsch": "Während der Versandkostenschutz aus war, hat die {channel}-Synchronisierung {was} durch {now} ersetzt", "Français": "Pendant que la protection du coût d'expédition était désactivée, la synchronisation {channel} a remplacé {was} par {now}", "Italiano": "Mentre la protezione del costo di spedizione era disattivata, la sincronizzazione di {channel} ha sostituito {was} con {now}", "Español (Spanish)": "Con la protección del coste de envío desactivada, la sincronización de {channel} sustituyó {was} por {now}", "Português": "Com a proteção do custo de envio desativada, a sincronização do {channel} substituiu {was} por {now}", "Русский (Russian)": "Пока защита стоимости доставки была выключена, синхронизация {channel} заменила {was} на {now}", "日本語 (Japanese)": "送料の保護がオフの間に、{channel}の同期が {was} を {now} に置き換えました", "中文 (Chinese)": "运费保护关闭期间，{channel} 同步将 {was} 替换为 {now}", "العربية (Arabic)": "أثناء إيقاف حماية تكلفة الشحن، استبدلت مزامنة {channel} ‏{was} بـ {now}", "हिन्दी (Hindi)": "शिपिंग लागत सुरक्षा बंद रहते हुए {channel} सिंक ने {was} को {now} से बदल दिया"
  },
  [K5_REVIEW_PAUSED_HINT]: {
    "Türkçe": "Korumayı yeniden açmak tutarı geri getirmedi. Hangi tutarın kalacağını seçin.", "Deutsch": "Das erneute Einschalten des Schutzes hat ihn nicht zurückgesetzt. Wählen Sie, welcher Betrag bleibt.", "Français": "Réactiver la protection ne l'a pas rétabli. Choisissez le montant à garder.", "Italiano": "Riattivare la protezione non lo ha ripristinato. Scegli quale importo tenere.", "Español (Spanish)": "Volver a activar la protección no lo restauró. Elige qué importe conservar.", "Português": "Voltar a ativar a proteção não o repôs. Escolha que valor manter.", "Русский (Russian)": "Повторное включение защиты его не вернуло. Выберите, какую сумму оставить.", "日本語 (Japanese)": "保護をオンに戻しても元には戻りません。残す金額を選んでください。", "中文 (Chinese)": "重新开启保护不会将其改回。请选择保留哪个金额。", "العربية (Arabic)": "إعادة تفعيل الحماية لم تُرجعها. اختر المبلغ الذي تريد إبقاءه.", "हिन्दी (Hindi)": "सुरक्षा फिर चालू करने से यह वापस नहीं बदला। चुनें कि कौन-सी राशि रखनी है।"
  },
  [K5_ACTION_KEEP_MINE]: {
    "Türkçe": "Benim değerim kalsın", "Deutsch": "Meinen Wert behalten", "Français": "Garder ma valeur", "Italiano": "Mantieni il mio valore", "Español (Spanish)": "Mantener mi valor",
    "Português": "Manter o meu valor", "Русский (Russian)": "Оставить моё значение", "日本語 (Japanese)": "自分の値を残す", "中文 (Chinese)": "保留我的数值", "العربية (Arabic)": "الإبقاء على قيمتي", "हिन्दी (Hindi)": "मेरा मान रखें"
  },
  [K5_ACTION_KEEP_AMOUNT]: {
    "Türkçe": "{amount} kalsın", "Deutsch": "{amount} behalten", "Français": "Garder {amount}", "Italiano": "Mantieni {amount}", "Español (Spanish)": "Mantener {amount}",
    "Português": "Manter {amount}", "Русский (Russian)": "Оставить {amount}", "日本語 (Japanese)": "{amount} を残す", "中文 (Chinese)": "保留 {amount}", "العربية (Arabic)": "الإبقاء على {amount}", "हिन्दी (Hindi)": "{amount} रखें"
  },
  [K5_ACTION_RESTORE]: {
    "Türkçe": "{amount} geri yüklensin", "Deutsch": "{amount} wiederherstellen", "Français": "Rétablir {amount}", "Italiano": "Ripristina {amount}", "Español (Spanish)": "Restaurar {amount}",
    "Português": "Repor {amount}", "Русский (Russian)": "Вернуть {amount}", "日本語 (Japanese)": "{amount} に戻す", "中文 (Chinese)": "恢复为 {amount}", "العربية (Arabic)": "استعادة {amount}", "हिन्दी (Hindi)": "{amount} वापस लाएँ"
  },
  [K5_ACTION_USE_CHANNEL]: {
    "Türkçe": "{channel} değerini kullan", "Deutsch": "Wert von {channel} verwenden", "Français": "Utiliser la valeur de {channel}", "Italiano": "Usa il valore di {channel}", "Español (Spanish)": "Usar el valor de {channel}",
    "Português": "Usar o valor do {channel}", "Русский (Russian)": "Использовать значение {channel}", "日本語 (Japanese)": "{channel}の値を使う", "中文 (Chinese)": "使用 {channel} 的数值", "العربية (Arabic)": "استخدام قيمة {channel}", "हिन्दी (Hindi)": "{channel} का मान इस्तेमाल करें"
  },
  [K5_ACTION_USE_CHANNEL_AMOUNT]: {
    "Türkçe": "{channel} değerini kullan ({amount})", "Deutsch": "Wert von {channel} verwenden ({amount})", "Français": "Utiliser la valeur de {channel} ({amount})", "Italiano": "Usa il valore di {channel} ({amount})",
    "Español (Spanish)": "Usar el valor de {channel} ({amount})", "Português": "Usar o valor do {channel} ({amount})", "Русский (Russian)": "Использовать значение {channel} ({amount})", "日本語 (Japanese)": "{channel}の値を使う（{amount}）",
    "中文 (Chinese)": "使用 {channel} 的数值（{amount}）", "العربية (Arabic)": "استخدام قيمة {channel} ‏({amount})", "हिन्दी (Hindi)": "{channel} का मान इस्तेमाल करें ({amount})"
  },
  [K5_ACTION_CONFIRM_ZERO]: {
    "Türkçe": "{amount} olarak onayla", "Deutsch": "{amount} bestätigen", "Français": "Confirmer {amount}", "Italiano": "Conferma {amount}", "Español (Spanish)": "Confirmar {amount}",
    "Português": "Confirmar {amount}", "Русский (Russian)": "Подтвердить {amount}", "日本語 (Japanese)": "{amount} で確定", "中文 (Chinese)": "确认为 {amount}", "العربية (Arabic)": "تأكيد {amount}", "हिन्दी (Hindi)": "{amount} की पुष्टि करें"
  },
  [K5_STALE]: {
    "Türkçe": "Kargo maliyeti başka bir cihazda değişti — şimdi {amount}. Hiçbir şeyin üstüne yazılmadı.", "Deutsch": "Die Versandkosten wurden auf einem anderen Gerät geändert — jetzt {amount}. Nichts wurde überschrieben.",
    "Français": "Le coût d'expédition a été modifié sur un autre appareil — il est maintenant de {amount}. Rien n'a été écrasé.", "Italiano": "Il costo di spedizione è stato modificato su un altro dispositivo — ora è {amount}. Nulla è stato sovrascritto.",
    "Español (Spanish)": "El coste de envío cambió en otro dispositivo — ahora es {amount}. No se sobrescribió nada.", "Português": "O custo de envio foi alterado noutro dispositivo — agora é {amount}. Nada foi substituído.",
    "Русский (Russian)": "Стоимость доставки изменили на другом устройстве — теперь {amount}. Ничего не перезаписано.", "日本語 (Japanese)": "送料が別の端末で変更されました — 現在 {amount} です。上書きはしていません。",
    "中文 (Chinese)": "运费已在其他设备上更改 — 现为 {amount}。未覆盖任何内容。", "العربية (Arabic)": "تغيّرت تكلفة الشحن على جهاز آخر — أصبحت الآن {amount}. لم يُستبدل أي شيء.", "हिन्दी (Hindi)": "शिपिंग लागत किसी दूसरे डिवाइस पर बदली गई — अब {amount} है। कुछ भी ओवरराइट नहीं हुआ।"
  },
  [K5_SAVED_MANUAL]: {
    "Türkçe": "Kargo maliyeti sizin değeriniz olarak kaydedildi.", "Deutsch": "Versandkosten als Ihr Wert gespeichert.", "Français": "Coût d'expédition enregistré comme votre valeur.", "Italiano": "Costo di spedizione salvato come tuo valore.",
    "Español (Spanish)": "Coste de envío guardado como tu valor.", "Português": "Custo de envio guardado como o seu valor.", "Русский (Russian)": "Стоимость доставки сохранена как ваше значение.", "日本語 (Japanese)": "送料をあなたの値として保存しました。",
    "中文 (Chinese)": "运费已保存为您的数值。", "العربية (Arabic)": "حُفظت تكلفة الشحن كقيمتك.", "हिन्दी (Hindi)": "शिपिंग लागत आपके मान के रूप में सहेजी गई।"
  },
  [K5_RETURNED]: {
    "Türkçe": "Kargo maliyeti {channel} tutarına ayarlandı: {amount}.", "Deutsch": "Versandkosten auf den Betrag von {channel} gesetzt: {amount}.", "Français": "Coût d'expédition fixé au montant de {channel} : {amount}.", "Italiano": "Costo di spedizione impostato sull'importo di {channel}: {amount}.", "Español (Spanish)": "Coste de envío fijado en el importe de {channel}: {amount}.", "Português": "Custo de envio definido para o valor do {channel}: {amount}.", "Русский (Russian)": "Стоимость доставки установлена по сумме {channel}: {amount}.", "日本語 (Japanese)": "送料を{channel}の金額 {amount} に設定しました。", "中文 (Chinese)": "运费已设为 {channel} 的金额：{amount}。", "العربية (Arabic)": "ضُبطت تكلفة الشحن على مبلغ {channel}: {amount}.", "हिन्दी (Hindi)": "शिपिंग लागत {channel} की राशि पर सेट की गई: {amount}।"
  },
  [K5_RETURNED_NEXT_SYNC]: {
    "Türkçe": "Kargo maliyeti {channel} yönetimine verildi. Bir {channel} senkronu yeni tutar yazana kadar {amount} kalır.", "Deutsch": "Versandkosten an {channel} übergeben. Sie bleiben {amount}, bis eine {channel}-Synchronisierung einen neuen Betrag setzt.", "Français": "Coût d'expédition confié à {channel}. Il reste {amount} jusqu'à ce qu'une synchronisation {channel} fixe un nouveau montant.", "Italiano": "Costo di spedizione affidato a {channel}. Resta {amount} finché una sincronizzazione di {channel} non imposta un nuovo importo.", "Español (Spanish)": "Coste de envío entregado a {channel}. Se queda en {amount} hasta que una sincronización de {channel} fije un nuevo importe.", "Português": "Custo de envio entregue ao {channel}. Fica em {amount} até uma sincronização do {channel} definir um novo valor.", "Русский (Russian)": "Стоимость доставки передана {channel}. Остаётся {amount}, пока синхронизация {channel} не установит новую сумму.", "日本語 (Japanese)": "送料を{channel}に戻しました。{channel}の同期が新しい金額を設定するまで {amount} のままです。", "中文 (Chinese)": "运费已交给 {channel}。在 {channel} 同步设置新金额之前保持为 {amount}。", "العربية (Arabic)": "سُلّمت تكلفة الشحن إلى {channel}. تبقى {amount} حتى تضبط مزامنة {channel} مبلغًا جديدًا.", "हिन्दी (Hindi)": "शिपिंग लागत {channel} को सौंपी गई। जब तक {channel} सिंक नई राशि सेट न करे, यह {amount} रहेगी।"
  },
  [K5_SAVE_FAILED]: {
    "Türkçe": "Kargo maliyeti güncellenemedi. Lütfen tekrar deneyin.", "Deutsch": "Die Versandkosten konnten nicht aktualisiert werden. Bitte versuchen Sie es erneut.",
    "Français": "Impossible de mettre à jour le coût d'expédition. Veuillez réessayer.", "Italiano": "Impossibile aggiornare il costo di spedizione. Riprova.",
    "Español (Spanish)": "No se pudo actualizar el coste de envío. Inténtalo de nuevo.", "Português": "Não foi possível atualizar o custo de envio. Tente novamente.",
    "Русский (Russian)": "Не удалось обновить стоимость доставки. Попробуйте ещё раз.", "日本語 (Japanese)": "送料を更新できませんでした。もう一度お試しください。",
    "中文 (Chinese)": "无法更新运费。请重试。", "العربية (Arabic)": "تعذّر تحديث تكلفة الشحن. حاول مرة أخرى.", "हिन्दी (Hindi)": "शिपिंग लागत अपडेट नहीं हो सकी। कृपया फिर से कोशिश करें।"
  }
};
