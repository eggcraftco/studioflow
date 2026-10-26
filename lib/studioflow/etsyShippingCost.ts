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
export const ETSY_SHIPPING_ENTER_HINT = "Enter the real postage in Shipping Cost to see the final profit.";
export const ETSY_SHIPPING_UNKNOWN_FOOTNOTE = "Some Etsy orders use what the buyer paid for shipping — postage cost not known, profit is an estimate";

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

/** The order screen's note. `formatMoney` is the order's own money format (its currency). */
export function etsyShippingUnknownNote(state: EtsyShippingUnknown, t: (text: string) => string, formatMoney: (value: number) => string): string {
  return state.free ? t(ETSY_SHIPPING_UNKNOWN_FREE) : t(ETSY_SHIPPING_UNKNOWN_PAID).replace("{amount}", formatMoney(state.buyerPaid));
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
    "Türkçe": "Kesin kârı görmek için gerçek posta ücretini Kargo Maliyeti alanına girin.",
    "Deutsch": "Tragen Sie das tatsächliche Porto unter Versandkosten ein, um den endgültigen Gewinn zu sehen.",
    "Français": "Saisissez les frais de port réels dans Coût d'expédition pour voir le bénéfice final.",
    "Italiano": "Inserisci il costo postale reale in Costo di spedizione per vedere il profitto finale.",
    "Español (Spanish)": "Introduce el coste postal real en Coste de envío para ver el beneficio final.",
    "Português": "Introduza o custo postal real em Custo de envio para ver o lucro final.",
    "Русский (Russian)": "Укажите реальную стоимость отправки в поле «Стоимость доставки», чтобы увидеть итоговую прибыль.",
    "日本語 (Japanese)": "確定利益を見るには、送料欄に実際の郵送費を入力してください。",
    "中文 (Chinese)": "在“运费”中输入实际邮寄费用即可查看最终利润。",
    "العربية (Arabic)": "أدخل تكلفة البريد الفعلية في تكلفة الشحن لرؤية الربح النهائي.",
    "हिन्दी (Hindi)": "अंतिम लाभ देखने के लिए शिपिंग लागत में असली डाक खर्च दर्ज करें।"
  },
  [ETSY_SHIPPING_UNKNOWN_FOOTNOTE]: {
    "Türkçe": "Bazı Etsy siparişlerinde alıcının ödediği kargo kullanılıyor — posta maliyeti bilinmiyor, kâr tahminidir",
    "Deutsch": "Bei einigen Etsy-Bestellungen wird der vom Käufer bezahlte Versand verwendet — Portokosten unbekannt, Gewinn ist geschätzt",
    "Français": "Certaines commandes Etsy utilisent la livraison payée par l'acheteur — frais de port inconnus, bénéfice estimé",
    "Italiano": "Alcuni ordini Etsy usano la spedizione pagata dall'acquirente — costo postale sconosciuto, profitto stimato",
    "Español (Spanish)": "Algunos pedidos de Etsy usan el envío que pagó el comprador — coste postal desconocido, el beneficio es una estimación",
    "Português": "Algumas encomendas Etsy usam o envio pago pelo comprador — custo postal desconhecido, o lucro é uma estimativa",
    "Русский (Russian)": "В некоторых заказах Etsy учтена доставка, оплаченная покупателем, — стоимость отправки неизвестна, прибыль приблизительная",
    "日本語 (Japanese)": "一部のEtsy注文では購入者が支払った送料を使用しています — 郵送費は不明のため利益は概算です",
    "中文 (Chinese)": "部分 Etsy 订单使用买家支付的运费 — 邮寄成本未知，利润为估算",
    "العربية (Arabic)": "بعض طلبات Etsy تستخدم ما دفعه المشتري للشحن — تكلفة البريد غير معروفة، والربح تقديري",
    "हिन्दी (Hindi)": "कुछ Etsy ऑर्डर में खरीदार द्वारा चुकाई गई शिपिंग इस्तेमाल हुई है — डाक लागत ज्ञात नहीं, लाभ अनुमानित है"
  }
};
