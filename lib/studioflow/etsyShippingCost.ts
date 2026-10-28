import type { StudioLanguage } from "./language";

// ETSY-SHIP-2 (25 Oct 2026): an Etsy order's postage cost is not known.
//
// An Etsy receipt says what the BUYER paid for shipping, never what the parcel cost the seller. The importer writes
// the buyer's figure into deliveryCost (free shipping: 0), and the Finance Engine deducts it as the shipping cost —
// so the profit is right only when the postage happened to equal what the buyer paid. Etsy's own label purchases are
// shop-level ledger lines with no reliable link to a receipt, and NivaDesk never spreads them over orders.
//
// This file does NOT change a number. It decides whether the order's shipping cost is still that assumption, so the
// screens can call the profit an estimate and say why. The cost counts as known when the seller entered their own:
//   * the server marked it (etsySource.deliveryCostSource === "seller_entered": the seller's figure survives syncs), or
//   * the order now holds a figure other than the one Etsy last sent (etsySource.shipping) — typed since the last sync.
// A seller who types exactly what the buyer paid cannot be told apart; the note stays (and says how to clear it).

export type EtsyShippingSourceLike = { shipping?: unknown; deliveryCostSource?: unknown } | null | undefined;

/** The order's shipping cost is the buyer's figure, not a known postage cost. */
export type EtsyShippingUnknown = { buyerPaid: number; free: boolean };

export const ETSY_SHIPPING_UNKNOWN_PAID = "Shipping cost not known — buyer paid {amount}";
export const ETSY_SHIPPING_UNKNOWN_FREE = "Free shipping — postage cost not known, not counted";
export const ETSY_SHIPPING_ENTER_HINT = "Enter your actual postage cost in Shipping Cost to improve this profit estimate.";
export const ETSY_SHIPPING_UNKNOWN_FOOTNOTE = "Profit is estimated for Etsy orders with unconfirmed postage costs.";
/** Financial Breakdown only (the Dashboard card shows the short footnote above). */
export const ETSY_SHIPPING_UNKNOWN_DETAIL = "Etsy tells NivaDesk what the buyer paid for shipping, not what your postage cost. Those orders use the buyer's figure until you enter your actual postage cost.";

function pence(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** null = not an Etsy copy, or the seller's own postage is on the order (a known cost). */
export function etsyShippingCostUnknown(order: { deliveryCost?: unknown } | null | undefined, source: EtsyShippingSourceLike): EtsyShippingUnknown | null {
  if (!source || typeof source !== "object") return null;
  if (source.deliveryCostSource === "seller_entered") return null;
  const charged = pence(source.shipping);
  if (charged === null) return null;
  const current = pence(order?.deliveryCost);
  if (current !== null && current !== charged) return null;
  return { buyerPaid: charged / 100, free: charged === 0 };
}

// K3 (26 Oct 2026): the two sentences are joined with the language's own punctuation, never a shared ASCII ". ".
// Japanese/Chinese end the first sentence with "。", Hindi with "।", Arabic joins the clauses with the Arabic comma and
// isolates the amount (U+2066…U+2069) so "£3.95" keeps its order inside right-to-left text.
export function etsyNoteSentenceJoin(language: string): string {
  if (language === "日本語 (Japanese)" || language === "中文 (Chinese)") return "。";
  if (language === "हिन्दी (Hindi)") return "। ";
  if (language === "العربية (Arabic)") return "، ";
  return ". ";
}

/** The order screen's note: what the buyer paid (or free shipping) + how to make the estimate better. */
export function etsyShippingNoteText(state: EtsyShippingUnknown, language: string, t: (text: string) => string, formatMoney: (value: number) => string): string {
  const amount = language === "العربية (Arabic)" ? `\u2066${formatMoney(state.buyerPaid)}\u2069` : formatMoney(state.buyerPaid);
  const first = state.free ? t(ETSY_SHIPPING_UNKNOWN_FREE) : t(ETSY_SHIPPING_UNKNOWN_PAID).replace("{amount}", amount);
  return `${first}${etsyNoteSentenceJoin(language)}${t(ETSY_SHIPPING_ENTER_HINT)}`;
}

// K1 (26 Oct 2026): an Etsy order's profit is "Final Profit" only when nothing in it is still a guess. Entering the
// real postage clears the shipping reason only; an estimated Etsy fee or no costs entered keep it an estimate.
// The fee test is commissionIsEstimated's rule (finance.ts), repeated here to keep this module free of imports.
export type EtsyProfitBlock = { directCost: number; otherExpenses: number; commissionEstimated?: boolean; platformFeeKnown?: boolean };
export function etsyOrderProfitIsEstimate(finance: EtsyProfitBlock, shipping: EtsyShippingUnknown | null): boolean {
  if (shipping) return true;
  if (finance.directCost === 0 && finance.otherExpenses === 0) return true;
  return typeof finance.commissionEstimated === "boolean" ? finance.commissionEstimated : finance.platformFeeKnown !== true;
}

/** How many of these orders count the buyer's shipping as the cost (the Dashboard footnote shows when > 0). */
export function etsyShippingUnknownCount(orders: Array<{ deliveryCost?: unknown; etsyShipping?: EtsyShippingSourceLike }>): number {
  let n = 0;
  for (const order of orders) if (order && etsyShippingCostUnknown(order, order.etsyShipping)) n += 1;
  return n;
}

// Draft translations (owner's decision on the wording; English is the source). Merged last in language.ts.
export const ETSY_SHIPPING_COST_TRANSLATIONS: Record<string, Partial<Record<StudioLanguage, string>>> = {
  [ETSY_SHIPPING_UNKNOWN_PAID]: {
    "Türkçe": "Kargo maliyeti bilinmiyor — alıcı {amount} ödedi",
    "Deutsch": "Versandkosten unbekannt — Käufer zahlte {amount}",
    "Français": "Coût d'expédition inconnu — l'acheteur a payé {amount}",
    "Italiano": "Costo di spedizione sconosciuto — l'acquirente ha pagato {amount}",
    "Español (Spanish)": "Coste de envío desconocido — el comprador pagó {amount}",
    "Português": "Custo de envio desconhecido — o comprador pagou {amount}",
    "Русский (Russian)": "Стоимость доставки неизвестна — покупатель заплатил {amount}",
    "日本語 (Japanese)": "送料の実費は不明 — 購入者の支払額 {amount}",
    "中文 (Chinese)": "运费成本未知 — 买家支付了 {amount}",
    "العربية (Arabic)": "تكلفة الشحن غير معروفة — دفع المشتري {amount}",
    "हिन्दी (Hindi)": "शिपिंग लागत ज्ञात नहीं — खरीदार ने {amount} चुकाए"
  },
  [ETSY_SHIPPING_UNKNOWN_FREE]: {
    "Türkçe": "Ücretsiz kargo — posta maliyeti bilinmiyor, hesaba katılmadı",
    "Deutsch": "Kostenloser Versand — Portokosten unbekannt, nicht berücksichtigt",
    "Français": "Livraison gratuite — frais de port inconnus, non comptés",
    "Italiano": "Spedizione gratuita — costo postale sconosciuto, non conteggiato",
    "Español (Spanish)": "Envío gratis — coste postal desconocido, no contabilizado",
    "Português": "Envio grátis — custo postal desconhecido, não contabilizado",
    "Русский (Russian)": "Бесплатная доставка — стоимость отправки неизвестна, не учтена",
    "日本語 (Japanese)": "送料無料 — 郵送費は不明のため計上されていません",
    "中文 (Chinese)": "免运费 — 邮寄成本未知，未计入",
    "العربية (Arabic)": "شحن مجاني — تكلفة البريد غير معروفة ولم تُحتسب",
    "हिन्दी (Hindi)": "मुफ़्त शिपिंग — डाक लागत ज्ञात नहीं, गिनी नहीं गई"
  },
  [ETSY_SHIPPING_ENTER_HINT]: {
    "Türkçe": "Bu kâr tahminini iyileştirmek için gerçek posta maliyetinizi Kargo Maliyeti alanına girin.",
    "Deutsch": "Tragen Sie Ihre tatsächlichen Portokosten unter Versandkosten ein, um diese Gewinnschätzung zu verbessern.",
    "Français": "Saisissez vos frais d'envoi réels dans Frais de Port pour affiner cette estimation du bénéfice.",
    "Italiano": "Inserisci il costo postale effettivo in Costo di Spedizione per migliorare questa stima del profitto.",
    "Español (Spanish)": "Introduce tu coste postal real en Costo de Envío para mejorar esta estimación del beneficio.",
    "Português": "Introduza o seu custo postal real em Custo de Envio para melhorar esta estimativa de lucro.",
    "Русский (Russian)": "Укажите фактическую стоимость отправки в поле «Стоимость Доставки», чтобы уточнить эту оценку прибыли.",
    "日本語 (Japanese)": "実際の郵送費を送料欄に入力すると、この利益の推定がより正確になります。",
    "中文 (Chinese)": "在“运费”中输入实际邮寄费用，可使此利润估算更准确。",
    "العربية (Arabic)": "أدخل تكلفة البريد الفعلية في تكلفة الشحن لتحسين تقدير الربح هذا.",
    "हिन्दी (Hindi)": "इस लाभ अनुमान को बेहतर बनाने के लिए शिपिंग लागत में अपनी असली डाक लागत दर्ज करें।"
  },
  [ETSY_SHIPPING_UNKNOWN_FOOTNOTE]: {
    "Türkçe": "Posta maliyeti doğrulanmamış Etsy siparişlerinde kâr tahminidir.",
    "Deutsch": "Für Etsy-Bestellungen mit unbestätigten Portokosten ist der Gewinn geschätzt.",
    "Français": "Le bénéfice est estimé pour les commandes Etsy dont les frais d'envoi ne sont pas confirmés.",
    "Italiano": "Il profitto è stimato per gli ordini Etsy con costi postali non confermati.",
    "Español (Spanish)": "El beneficio es estimado en los pedidos de Etsy con costes postales sin confirmar.",
    "Português": "O lucro é estimado nas encomendas Etsy com custos postais não confirmados.",
    "Русский (Russian)": "Для заказов Etsy с неподтверждённой стоимостью отправки прибыль приблизительная.",
    "日本語 (Japanese)": "郵送費が未確認のEtsy注文では、利益は推定です。",
    "中文 (Chinese)": "邮寄成本未确认的 Etsy 订单，利润为估算。",
    "العربية (Arabic)": "الربح تقديري لطلبات Etsy التي لم تُؤكَّد تكلفة بريدها.",
    "हिन्दी (Hindi)": "जिन Etsy ऑर्डर की डाक लागत पुष्ट नहीं है, उनका लाभ अनुमानित है।"
  },
  [ETSY_SHIPPING_UNKNOWN_DETAIL]: {
    "Türkçe": "Etsy, NivaDesk'e alıcının kargo için ne ödediğini bildirir; posta maliyetinizi bildirmez. Gerçek posta maliyetinizi girene kadar bu siparişlerde alıcının ödediği tutar kullanılır.",
    "Deutsch": "Etsy teilt NivaDesk mit, was der Käufer für den Versand bezahlt hat, nicht was Ihr Porto gekostet hat. Diese Bestellungen verwenden den Betrag des Käufers, bis Sie Ihre tatsächlichen Portokosten eintragen.",
    "Français": "Etsy indique à NivaDesk ce que l'acheteur a payé pour la livraison, pas ce que vous a coûté l'envoi. Ces commandes utilisent le montant de l'acheteur jusqu'à ce que vous saisissiez vos frais d'envoi réels.",
    "Italiano": "Etsy comunica a NivaDesk quanto l'acquirente ha pagato per la spedizione, non quanto ti è costato l'invio. Questi ordini usano l'importo dell'acquirente finché non inserisci il costo postale effettivo.",
    "Español (Spanish)": "Etsy le indica a NivaDesk lo que pagó el comprador por el envío, no lo que te costó el franqueo. Esos pedidos usan el importe del comprador hasta que introduzcas tu coste postal real.",
    "Português": "A Etsy indica à NivaDesk o que o comprador pagou pelo envio, não o que o envio lhe custou. Essas encomendas usam o valor do comprador até introduzir o seu custo postal real.",
    "Русский (Russian)": "Etsy сообщает NivaDesk, сколько покупатель заплатил за доставку, но не сколько стоила отправка вам. Пока вы не укажете фактическую стоимость отправки, в этих заказах используется сумма покупателя.",
    "日本語 (Japanese)": "Etsy から NivaDesk に届くのは購入者が支払った送料で、実際にかかった郵送費ではありません。実際の郵送費を入力するまで、これらの注文では購入者の支払額を使います。",
    "中文 (Chinese)": "Etsy 告诉 NivaDesk 的是买家支付的运费，而不是您实际的邮寄成本。在您输入实际邮寄费用之前，这些订单使用买家支付的金额。",
    "العربية (Arabic)": "يُبلغ Etsy نظام NivaDesk بما دفعه المشتري مقابل الشحن، لا بتكلفة البريد الفعلية عليك. تستخدم هذه الطلبات المبلغ الذي دفعه المشتري إلى أن تُدخل تكلفة البريد الفعلية.",
    "हिन्दी (Hindi)": "Etsy, NivaDesk को बताता है कि खरीदार ने शिपिंग के लिए कितना चुकाया, न कि आपकी डाक लागत कितनी थी। जब तक आप अपनी असली डाक लागत दर्ज नहीं करते, इन ऑर्डर में खरीदार की राशि इस्तेमाल होती है।"
  }
};
