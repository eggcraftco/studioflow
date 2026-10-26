import type { StudioLanguage } from "./language";

// K5 (26 Oct 2026, owner decision; r3): whose shipping cost a WooCommerce, Shopify or inbound-webhook order holds.
//
// The server keeps one record on such an order, `deliveryCostOwner`, and only in the workspaces of the K5 pilot
// (appConfig/deliveryCostOwnership): "channel" = the figure the channel sent (what the BUYER paid for shipping, not
// what the parcel cost), "seller" = the seller's own figure (ownerSource "manual" when set through this screen's
// shipping cost editor, "inferred" when the server deduced it from a value an older client wrote), "unknown" = an
// order from before K5 whose value differs from the channel's and whose earlier channel figure no stored data proves.
//
// This file does NOT change a number. It decides (1) what the Shipping Cost row says about the figure, (2) whether
// the profit is final or an estimate, (3) which review actions to offer. Every channel order gets (2), record or not:
// an empty cost, or a 0 nobody chose, is never shown as a verified zero / Final Profit.

export type DeliveryCostChannel = "woocommerce" | "shopify" | "inbound";
export type DeliveryCostOwnerName = "channel" | "seller" | "unknown";
export type DeliveryCostReviewReason = "pre_k5_conflict" | "changed_outside_manual_path";

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
  needsReview: boolean;
  reviewReason: DeliveryCostReviewReason | null;
};

const CHANNELS: DeliveryCostChannel[] = ["woocommerce", "shopify", "inbound"];

function moneyOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function pence(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100);
}

/** The server's record, read defensively (older r2 records lack ownerSource / channelSentKnown / manualValue). */
export function parseDeliveryCostOwner(raw: unknown): DeliveryCostOwnerRecord | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  const owner = String(v.owner || "") as DeliveryCostOwnerName;
  const channel = String(v.channel || "") as DeliveryCostChannel;
  if (!["channel", "seller", "unknown"].includes(owner) || !CHANNELS.includes(channel)) return null;
  const channelSent = moneyOrNull(v.channelSent);
  const reason = String(v.reviewReason || "");
  return {
    owner,
    ownerSource: typeof v.ownerSource === "string" && v.ownerSource ? v.ownerSource : (owner === "seller" ? "inferred" : "sync"),
    channel,
    channelSent,
    channelSentKnown: typeof v.channelSentKnown === "boolean" ? v.channelSentKnown : channelSent !== null,
    channelHistory: Array.isArray(v.channelHistory) ? v.channelHistory.map(moneyOrNull).filter((x): x is number => x !== null) : [],
    channelPending: moneyOrNull(v.channelPending),
    channelPendingAtMs: Number.isFinite(Number(v.channelPendingAtMs)) && v.channelPendingAtMs !== null ? Number(v.channelPendingAtMs) : null,
    keptValue: moneyOrNull(v.keptValue),
    manualValue: moneyOrNull(v.manualValue),
    manualAtMs: Number.isFinite(Number(v.manualAtMs)) && v.manualAtMs !== null ? Number(v.manualAtMs) : null,
    needsReview: v.needsReview === true,
    reviewReason: reason === "pre_k5_conflict" || reason === "changed_outside_manual_path" ? reason : (v.needsReview === true && owner === "unknown" ? "pre_k5_conflict" : null)
  };
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
  | { kind: "restore"; deliveryCost: number }       // setDeliveryCostManual(the seller's last manual value)
  | { kind: "use_channel"; figure: number | null }  // returnDeliveryCostToChannel
  | { kind: "confirm_zero" };                        // setDeliveryCostManual(0)

export type ChannelShippingNote =
  | { key: "not_entered" }
  | { key: "buyer_paid"; amount: number }
  | { key: "free" }
  | { key: "review_conflict"; channelFigure: number | null; orderFigure: number | null }
  | { key: "review_outside"; was: number | null; now: number | null };

export type ChannelShippingState = {
  channel: DeliveryCostChannel;
  hasRecord: boolean;
  /** The profit must read "Estimated profit" (not green) — labels only, no figure changes. */
  estimate: boolean;
  /** The one line under the profit (and the Shipping Cost row's review box text). */
  note: ChannelShippingNote | null;
  /** What the Shipping Cost row says about its figure. */
  status: "channel" | "channel_free" | "your_value" | "review" | "none";
  actions: ChannelShippingAction[];
  /** With a record, a Shipping Cost edit goes through setDeliveryCostManual (expected = the value on screen). */
  manualEditPath: boolean;
};

/** The whole decision for one order; null = not a WooCommerce / Shopify / inbound order (nothing changes). */
export function channelShippingState(order: ChannelShippingOrderLike): ChannelShippingState | null {
  const channel = channelOfOrder(order);
  if (!channel) return null;
  const record = order.deliveryCostOwner ?? null;
  const current = order.deliveryCostPresent === false ? null : moneyOrNull(order.deliveryCost);
  const notEntered = current === null || current === 0;
  if (!record) {
    return {
      channel, hasRecord: false, estimate: notEntered, note: notEntered ? { key: "not_entered" } : null,
      status: "none", actions: [], manualEditPath: false
    };
  }
  const base = { channel, hasRecord: true, manualEditPath: true };
  const knownFigure = record.channelSentKnown && record.channelSent !== null ? record.channelSent : null;
  const useChannel = (figure: number | null): ChannelShippingAction[] => (figure !== null && pence(figure) !== pence(current) ? [{ kind: "use_channel", figure }] : []);

  if (record.owner === "unknown" || (record.needsReview && record.reviewReason === "pre_k5_conflict")) {
    const channelFigure = record.channelPending ?? knownFigure;
    const actions: ChannelShippingAction[] = [];
    if (current !== null) actions.push({ kind: "keep", deliveryCost: current, mine: true });
    actions.push({ kind: "use_channel", figure: channelFigure });
    return { ...base, estimate: true, note: { key: "review_conflict", channelFigure, orderFigure: current }, status: "review", actions };
  }
  if (record.owner === "seller") {
    if (record.needsReview && record.reviewReason === "changed_outside_manual_path") {
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
  // seller's at the next sync (r2 rule). A 0 nobody confirmed still reads as not entered.
  if (current === 0) return { ...base, estimate: true, note: { key: "not_entered" }, status: "your_value", actions: [{ kind: "confirm_zero" }, ...useChannel(knownFigure)] };
  return { ...base, estimate: false, note: null, status: "your_value", actions: useChannel(knownFigure) };
}

// ---- texts (English is the source; every other language is a DRAFT for the owner's approval) ----
export const K5_STATUS_CHANNEL = "From {channel}: buyer paid {amount}";
export const K5_STATUS_CHANNEL_FREE = "From {channel}: free shipping";
export const K5_STATUS_YOURS = "Your value — {channel} syncs do not change it";
export const K5_NOTE_NOT_ENTERED = "Shipping cost not entered — profit is an estimate";
export const K5_NOTE_BUYER_PAID = "Shipping cost not known — buyer paid {amount}";
export const K5_NOTE_FREE = "Free shipping — postage cost not known, not counted";
export const K5_ENTER_HINT = "Enter the real postage in Shipping Cost to see the final profit.";
export const K5_REVIEW_CONFLICT = "{channel} says {channelAmount}, this order has {orderAmount}";
export const K5_REVIEW_CONFLICT_HINT = "This order is older than shipping cost ownership. Choose which figure to keep.";
export const K5_REVIEW_OUTSIDE = "Changed outside the shipping cost editor: was {was}, now {now}";
export const K5_ACTION_KEEP_MINE = "Keep my value";
export const K5_ACTION_KEEP_AMOUNT = "Keep {amount}";
export const K5_ACTION_RESTORE = "Restore {amount}";
export const K5_ACTION_USE_CHANNEL = "Use {channel}'s value";
export const K5_ACTION_USE_CHANNEL_AMOUNT = "Use {channel}'s value ({amount})";
export const K5_ACTION_CONFIRM_ZERO = "Confirm {amount}";
export const K5_STALE = "Shipping cost changed on another device — it is now {amount}. Nothing was overwritten.";
export const K5_SAVED_MANUAL = "Shipping cost saved as your value.";
export const K5_RETURNED = "Shipping cost returned to {channel}.";
export const K5_RETURNED_NEXT_SYNC = "Shipping cost handed back to {channel} — its figure applies at the next sync.";
export const K5_SAVE_FAILED = "Could not update the shipping cost. Please try again.";

const fill = (text: string, values: Record<string, string>) => Object.entries(values).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), text);

/** The line under the profit. `money` is the order's own money format. */
export function channelShippingNoteText(note: ChannelShippingNote, channel: DeliveryCostChannel, t: (text: string) => string, money: (value: number) => string): string {
  const name = t(channelDisplayName(channel));
  const m = (value: number | null) => (value === null ? "—" : money(value));
  switch (note.key) {
    case "not_entered": return t(K5_NOTE_NOT_ENTERED);
    case "buyer_paid": return fill(t(K5_NOTE_BUYER_PAID), { amount: m(note.amount) });
    case "free": return t(K5_NOTE_FREE);
    case "review_conflict": return fill(t(K5_REVIEW_CONFLICT), { channel: name, channelAmount: m(note.channelFigure), orderAmount: m(note.orderFigure) });
    case "review_outside": return fill(t(K5_REVIEW_OUTSIDE), { was: m(note.was), now: m(note.now) });
    default: return "";
  }
}

/** The line under the Shipping Cost row (empty when there is nothing to say). */
export function channelShippingStatusText(state: ChannelShippingState, order: ChannelShippingOrderLike, t: (text: string) => string, money: (value: number) => string): string {
  const name = t(channelDisplayName(state.channel));
  const current = order.deliveryCostPresent === false ? null : moneyOrNull(order.deliveryCost);
  if (state.status === "channel") return fill(t(K5_STATUS_CHANNEL), { channel: name, amount: money(current ?? order.deliveryCostOwner?.channelSent ?? 0) });
  if (state.status === "channel_free") return fill(t(K5_STATUS_CHANNEL_FREE), { channel: name });
  if (state.status === "your_value") return fill(t(K5_STATUS_YOURS), { channel: name });
  return "";
}

export function channelShippingActionLabel(action: ChannelShippingAction, channel: DeliveryCostChannel, t: (text: string) => string, money: (value: number) => string): string {
  const name = t(channelDisplayName(channel));
  switch (action.kind) {
    case "keep": return action.mine ? t(K5_ACTION_KEEP_MINE) : fill(t(K5_ACTION_KEEP_AMOUNT), { amount: money(action.deliveryCost) });
    case "restore": return fill(t(K5_ACTION_RESTORE), { amount: money(action.deliveryCost) });
    case "use_channel": return action.figure === null ? fill(t(K5_ACTION_USE_CHANNEL), { channel: name }) : fill(t(K5_ACTION_USE_CHANNEL_AMOUNT), { channel: name, amount: money(action.figure) });
    case "confirm_zero": return fill(t(K5_ACTION_CONFIRM_ZERO), { amount: money(0) });
    default: return "";
  }
}

export function channelShippingFill(text: string, values: Record<string, string>): string {
  return fill(text, values);
}

// Draft translations (owner's decision on the wording; English is the source). Merged last in language.ts.
// K5_NOTE_BUYER_PAID / K5_NOTE_FREE / K5_ENTER_HINT carry the same text and drafts as ETSY-SHIP-2's ESC-01..03, so
// the two packages agree whichever ships first.
export const CHANNEL_SHIPPING_COST_TRANSLATIONS: Record<string, Partial<Record<StudioLanguage, string>>> = {
  [K5_STATUS_CHANNEL]: {
    "Türkçe": "{channel} kaynaklı: alıcı {amount} ödedi", "Deutsch": "Von {channel}: Käufer zahlte {amount}", "Français": "De {channel} : l'acheteur a payé {amount}",
    "Italiano": "Da {channel}: l'acquirente ha pagato {amount}", "Español (Spanish)": "De {channel}: el comprador pagó {amount}", "Português": "De {channel}: o comprador pagou {amount}",
    "Русский (Russian)": "Из {channel}: покупатель заплатил {amount}", "日本語 (Japanese)": "{channel}より: 購入者の支払額 {amount}", "中文 (Chinese)": "来自 {channel}：买家支付了 {amount}",
    "العربية (Arabic)": "من {channel}: دفع المشتري {amount}", "हिन्दी (Hindi)": "{channel} से: खरीदार ने {amount} चुकाए"
  },
  [K5_STATUS_CHANNEL_FREE]: {
    "Türkçe": "{channel} kaynaklı: ücretsiz kargo", "Deutsch": "Von {channel}: kostenloser Versand", "Français": "De {channel} : livraison gratuite",
    "Italiano": "Da {channel}: spedizione gratuita", "Español (Spanish)": "De {channel}: envío gratis", "Português": "De {channel}: envio grátis",
    "Русский (Russian)": "Из {channel}: бесплатная доставка", "日本語 (Japanese)": "{channel}より: 送料無料", "中文 (Chinese)": "来自 {channel}：免运费",
    "العربية (Arabic)": "من {channel}: شحن مجاني", "हिन्दी (Hindi)": "{channel} से: मुफ़्त शिपिंग"
  },
  [K5_STATUS_YOURS]: {
    "Türkçe": "Sizin değeriniz — {channel} senkronu bunu değiştirmez", "Deutsch": "Ihr Wert — {channel}-Synchronisierungen ändern ihn nicht", "Français": "Votre valeur — les synchronisations {channel} ne la modifient pas",
    "Italiano": "Il tuo valore — le sincronizzazioni di {channel} non lo cambiano", "Español (Spanish)": "Tu valor — las sincronizaciones de {channel} no lo cambian", "Português": "O seu valor — as sincronizações do {channel} não o alteram",
    "Русский (Russian)": "Ваше значение — синхронизация {channel} его не меняет", "日本語 (Japanese)": "あなたの値 — {channel}の同期では変更されません", "中文 (Chinese)": "您的数值 — {channel} 同步不会更改它",
    "العربية (Arabic)": "قيمتك — مزامنة {channel} لا تغيّرها", "हिन्दी (Hindi)": "आपका मान — {channel} सिंक इसे नहीं बदलता"
  },
  [K5_NOTE_NOT_ENTERED]: {
    "Türkçe": "Kargo maliyeti girilmedi — kâr tahminidir", "Deutsch": "Versandkosten nicht eingetragen — Gewinn ist geschätzt", "Français": "Coût d'expédition non saisi — le bénéfice est une estimation",
    "Italiano": "Costo di spedizione non inserito — il profitto è una stima", "Español (Spanish)": "Coste de envío no introducido — el beneficio es una estimación", "Português": "Custo de envio não introduzido — o lucro é uma estimativa",
    "Русский (Russian)": "Стоимость доставки не указана — прибыль приблизительная", "日本語 (Japanese)": "送料が未入力 — 利益は概算です", "中文 (Chinese)": "未填写运费 — 利润为估算",
    "العربية (Arabic)": "لم تُدخل تكلفة الشحن — الربح تقديري", "हिन्दी (Hindi)": "शिपिंग लागत दर्ज नहीं — लाभ अनुमानित है"
  },
  [K5_NOTE_BUYER_PAID]: {
    "Türkçe": "Kargo maliyeti bilinmiyor — alıcı {amount} ödedi", "Deutsch": "Versandkosten unbekannt — Käufer zahlte {amount}", "Français": "Coût d'expédition inconnu — l'acheteur a payé {amount}",
    "Italiano": "Costo di spedizione sconosciuto — l'acquirente ha pagato {amount}", "Español (Spanish)": "Coste de envío desconocido — el comprador pagó {amount}", "Português": "Custo de envio desconhecido — o comprador pagou {amount}",
    "Русский (Russian)": "Стоимость доставки неизвестна — покупатель заплатил {amount}", "日本語 (Japanese)": "送料の実費は不明 — 購入者の支払額 {amount}", "中文 (Chinese)": "运费成本未知 — 买家支付了 {amount}",
    "العربية (Arabic)": "تكلفة الشحن غير معروفة — دفع المشتري {amount}", "हिन्दी (Hindi)": "शिपिंग लागत ज्ञात नहीं — खरीदार ने {amount} चुकाए"
  },
  [K5_NOTE_FREE]: {
    "Türkçe": "Ücretsiz kargo — posta maliyeti bilinmiyor, hesaba katılmadı", "Deutsch": "Kostenloser Versand — Portokosten unbekannt, nicht berücksichtigt", "Français": "Livraison gratuite — frais de port inconnus, non comptés",
    "Italiano": "Spedizione gratuita — costo postale sconosciuto, non conteggiato", "Español (Spanish)": "Envío gratis — coste postal desconocido, no contabilizado", "Português": "Envio grátis — custo postal desconhecido, não contabilizado",
    "Русский (Russian)": "Бесплатная доставка — стоимость отправки неизвестна, не учтена", "日本語 (Japanese)": "送料無料 — 郵送費は不明のため計上されていません", "中文 (Chinese)": "免运费 — 邮寄成本未知，未计入",
    "العربية (Arabic)": "شحن مجاني — تكلفة البريد غير معروفة ولم تُحتسب", "हिन्दी (Hindi)": "मुफ़्त शिपिंग — डाक लागत ज्ञात नहीं, गिनी नहीं गई"
  },
  [K5_ENTER_HINT]: {
    "Türkçe": "Kesin kârı görmek için gerçek posta ücretini Kargo Maliyeti alanına girin.", "Deutsch": "Tragen Sie das tatsächliche Porto unter Versandkosten ein, um den endgültigen Gewinn zu sehen.",
    "Français": "Saisissez les frais de port réels dans Coût d'expédition pour voir le bénéfice final.", "Italiano": "Inserisci il costo postale reale in Costo di spedizione per vedere il profitto finale.",
    "Español (Spanish)": "Introduce el coste postal real en Coste de envío para ver el beneficio final.", "Português": "Introduza o custo postal real em Custo de envio para ver o lucro final.",
    "Русский (Russian)": "Укажите реальную стоимость отправки в поле «Стоимость доставки», чтобы увидеть итоговую прибыль.", "日本語 (Japanese)": "確定利益を見るには、送料欄に実際の郵送費を入力してください。",
    "中文 (Chinese)": "在“运费”中输入实际邮寄费用即可查看最终利润。", "العربية (Arabic)": "أدخل تكلفة البريد الفعلية في تكلفة الشحن لرؤية الربح النهائي.", "हिन्दी (Hindi)": "अंतिम लाभ देखने के लिए शिपिंग लागत में असली डाक खर्च दर्ज करें।"
  },
  [K5_REVIEW_CONFLICT]: {
    "Türkçe": "{channel} {channelAmount} diyor, bu siparişte {orderAmount} var", "Deutsch": "{channel} meldet {channelAmount}, diese Bestellung hat {orderAmount}", "Français": "{channel} indique {channelAmount}, cette commande a {orderAmount}",
    "Italiano": "{channel} indica {channelAmount}, questo ordine ha {orderAmount}", "Español (Spanish)": "{channel} indica {channelAmount}, este pedido tiene {orderAmount}", "Português": "{channel} indica {channelAmount}, esta encomenda tem {orderAmount}",
    "Русский (Russian)": "{channel} сообщает {channelAmount}, в этом заказе {orderAmount}", "日本語 (Japanese)": "{channel}は{channelAmount}、この注文は{orderAmount}です", "中文 (Chinese)": "{channel} 显示 {channelAmount}，此订单为 {orderAmount}",
    "العربية (Arabic)": "يذكر {channel} ‏{channelAmount}، وهذا الطلب فيه {orderAmount}", "हिन्दी (Hindi)": "{channel} {channelAmount} बताता है, इस ऑर्डर में {orderAmount} है"
  },
  [K5_REVIEW_CONFLICT_HINT]: {
    "Türkçe": "Bu sipariş kargo maliyeti sahipliğinden eski. Hangi tutarın kalacağını seçin.", "Deutsch": "Diese Bestellung ist älter als die Versandkosten-Zuordnung. Wählen Sie, welcher Betrag bleibt.",
    "Français": "Cette commande est antérieure au suivi de l'origine du coût d'expédition. Choisissez le montant à garder.", "Italiano": "Questo ordine è precedente alla gestione della provenienza del costo di spedizione. Scegli quale importo tenere.",
    "Español (Spanish)": "Este pedido es anterior al control del origen del coste de envío. Elige qué importe conservar.", "Português": "Esta encomenda é anterior ao controlo da origem do custo de envio. Escolha que valor manter.",
    "Русский (Russian)": "Этот заказ создан раньше, чем появился учёт источника стоимости доставки. Выберите, какую сумму оставить.", "日本語 (Japanese)": "この注文は送料の出所管理より前のものです。残す金額を選んでください。",
    "中文 (Chinese)": "此订单早于运费归属记录。请选择保留哪个金额。", "العربية (Arabic)": "هذا الطلب أقدم من تتبّع مصدر تكلفة الشحن. اختر المبلغ الذي تريد إبقاءه.", "हिन्दी (Hindi)": "यह ऑर्डर शिपिंग लागत के स्रोत-रिकॉर्ड से पुराना है। चुनें कि कौन-सी राशि रखनी है।"
  },
  [K5_REVIEW_OUTSIDE]: {
    "Türkçe": "Kargo maliyeti düzenleyicisi dışında değişti: önce {was}, şimdi {now}", "Deutsch": "Außerhalb des Versandkosten-Editors geändert: vorher {was}, jetzt {now}", "Français": "Modifié hors de l'éditeur du coût d'expédition : avant {was}, maintenant {now}",
    "Italiano": "Modificato fuori dall'editor del costo di spedizione: prima {was}, ora {now}", "Español (Spanish)": "Cambiado fuera del editor del coste de envío: antes {was}, ahora {now}", "Português": "Alterado fora do editor do custo de envio: antes {was}, agora {now}",
    "Русский (Russian)": "Изменено вне редактора стоимости доставки: было {was}, стало {now}", "日本語 (Japanese)": "送料エディタ以外で変更されました: 変更前 {was}、現在 {now}", "中文 (Chinese)": "在运费编辑器之外被更改：原为 {was}，现为 {now}",
    "العربية (Arabic)": "تغيّر خارج محرّر تكلفة الشحن: كان {was}، والآن {now}", "हिन्दी (Hindi)": "शिपिंग लागत संपादक के बाहर बदला गया: पहले {was}, अब {now}"
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
    "Türkçe": "Kargo maliyeti {channel} yönetimine geri verildi.", "Deutsch": "Versandkosten an {channel} zurückgegeben.", "Français": "Coût d'expédition rendu à {channel}.", "Italiano": "Costo di spedizione restituito a {channel}.",
    "Español (Spanish)": "Coste de envío devuelto a {channel}.", "Português": "Custo de envio devolvido ao {channel}.", "Русский (Russian)": "Стоимость доставки возвращена {channel}.", "日本語 (Japanese)": "送料を{channel}の管理に戻しました。",
    "中文 (Chinese)": "运费已交还给 {channel}。", "العربية (Arabic)": "أُعيدت تكلفة الشحن إلى {channel}.", "हिन्दी (Hindi)": "शिपिंग लागत {channel} को लौटा दी गई।"
  },
  [K5_RETURNED_NEXT_SYNC]: {
    "Türkçe": "Kargo maliyeti {channel} yönetimine verildi — tutarı bir sonraki senkronda gelir.", "Deutsch": "Versandkosten an {channel} übergeben — der Betrag kommt mit der nächsten Synchronisierung.",
    "Français": "Coût d'expédition confié à {channel} — son montant s'applique à la prochaine synchronisation.", "Italiano": "Costo di spedizione affidato a {channel} — l'importo arriva alla prossima sincronizzazione.",
    "Español (Spanish)": "Coste de envío entregado a {channel} — su importe se aplica en la próxima sincronización.", "Português": "Custo de envio entregue ao {channel} — o valor aplica-se na próxima sincronização.",
    "Русский (Russian)": "Стоимость доставки передана {channel} — сумма появится при следующей синхронизации.", "日本語 (Japanese)": "送料を{channel}に戻しました — 金額は次回の同期で反映されます。",
    "中文 (Chinese)": "运费已交给 {channel} — 其金额将在下次同步时生效。", "العربية (Arabic)": "سُلّمت تكلفة الشحن إلى {channel} — يُطبَّق مبلغها في المزامنة التالية.", "हिन्दी (Hindi)": "शिपिंग लागत {channel} को सौंपी गई — उसकी राशि अगले सिंक में लागू होगी।"
  },
  [K5_SAVE_FAILED]: {
    "Türkçe": "Kargo maliyeti güncellenemedi. Lütfen tekrar deneyin.", "Deutsch": "Die Versandkosten konnten nicht aktualisiert werden. Bitte versuchen Sie es erneut.",
    "Français": "Impossible de mettre à jour le coût d'expédition. Veuillez réessayer.", "Italiano": "Impossibile aggiornare il costo di spedizione. Riprova.",
    "Español (Spanish)": "No se pudo actualizar el coste de envío. Inténtalo de nuevo.", "Português": "Não foi possível atualizar o custo de envio. Tente novamente.",
    "Русский (Russian)": "Не удалось обновить стоимость доставки. Попробуйте ещё раз.", "日本語 (Japanese)": "送料を更新できませんでした。もう一度お試しください。",
    "中文 (Chinese)": "无法更新运费。请重试。", "العربية (Arabic)": "تعذّر تحديث تكلفة الشحن. حاول مرة أخرى.", "हिन्दी (Hindi)": "शिपिंग लागत अपडेट नहीं हो सकी। कृपया फिर से कोशिश करें।"
  }
};
