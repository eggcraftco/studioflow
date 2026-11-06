// What the channel listings say about each stock card (envanter-aktarma, 6 Nov 2026). Pure: no Firebase, no React —
// scripts/check-inventory-listings.mjs compiles and runs it as it is.
//
// The owner, 6 Nov 2026: cards brought in from eBay and the two websites (EGGcraft, TickToon) show no picture in All
// Items, no price, and it is not clear whether they count in Total Inventory Value. The server
// (getInventorySummary, functions/inventoryListings.js) now joins each card's eBay / WooCommerce links back to it:
//   * summary.listedValue — the shelf at LISTING prices (per card the lowest active price, × units), apart from
//     Total Inventory Value, which stays the purchase COST;
//   * summary.costMissingCount / photoMissingCount / pictureAvailableCount / uncategorisedCount / listedNoCostCount;
//   * channelListings[cardId] — which channels list it, the chosen price (Financial Info only), whether a channel
//     has a picture the card lacks.
// An older server sends none of this; every helper here then answers "nothing to show".

import { inventoryCostKind, type InventoryCostCard } from "./inventoryCost";

export type ChannelPrice = { value: number; currency: string };
export type ChannelListingRow = {
  price: ChannelPrice | null;
  provider: "ebay" | "woocommerce" | string;
  label: string;
  seenAtMs: number;
  pictureAvailable: boolean;
  channels: Array<{ provider: string; label: string; active: boolean; seenAtMs: number; price: ChannelPrice | null }>;
};
export type ChannelListings = Record<string, ChannelListingRow>;

export type ListingCard = InventoryCostCard & {
  id: string;
  photos?: unknown;
  category?: string;
  status?: string;
  ownership?: string;
};

export type AttentionReason = "cost" | "photo" | "category";

const OFF_SHELF = ["archived", "sold", "used", "removed", "incoming"];
const SYMBOLS: Record<string, string> = { GBP: "£", EUR: "€", USD: "$", TRY: "₺", JPY: "¥", CNY: "¥", INR: "₹" };

export function onShelfBusiness(card: ListingCard | null | undefined): boolean {
  return Boolean(card) && card!.ownership !== "customer" && !OFF_SHELF.includes(String(card!.status || "available"));
}

export function hasStoredPhoto(card: ListingCard | null | undefined): boolean {
  const photos = card && Array.isArray(card.photos) ? card.photos : [];
  return photos.some((p) => typeof p === "string" && p.length > 0);
}

/**
 * Why a card on the shelf is in "Needs details": no cost (only for people who may see cost — a member without
 * Financial Info cannot fill it in anyway), no photo, no category ("Other" counts as none). Off-shelf and customer
 * items are never listed: a sold watch does not need a photo now.
 */
export function attentionReasons(card: ListingCard, { canSeeCost }: { canSeeCost: boolean }): AttentionReason[] {
  if (!onShelfBusiness(card)) return [];
  const out: AttentionReason[] = [];
  if (canSeeCost && inventoryCostKind(card) === "notEntered") out.push("cost");
  if (!hasStoredPhoto(card)) out.push("photo");
  const category = String(card.category || "").trim();
  if (!category || category === "Other") out.push("category");
  return out;
}

/** Cards on the shelf with no photo whose channel listing has a picture — what "Bring in pictures" would fill. */
export function pictureCandidateIds(cards: readonly ListingCard[], listings: ChannelListings | null | undefined): string[] {
  if (!listings) return [];
  return cards.filter((c) => onShelfBusiness(c) && !hasStoredPhoto(c) && listings[c.id] && listings[c.id].pictureAvailable === true).map((c) => c.id);
}

/** The symbol a screen's money formatter takes for an ISO code: "£" for GBP; an unknown code as "CHF " (with a space). */
export function currencySymbolOf(code: string): string {
  const c = String(code || "").toUpperCase();
  return SYMBOLS[c] || (c ? `${c} ` : "");
}

/** A channel price as money: £450.00 for GBP; an unknown code is written out ("CHF 450.00"). */
export function listingMoney(price: ChannelPrice | null | undefined): string {
  if (!price || !(Number(price.value) > 0)) return "";
  const symbol = SYMBOLS[String(price.currency || "").toUpperCase()];
  const amount = Number(price.value).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return symbol ? `${symbol}${amount}` : `${String(price.currency || "").toUpperCase()} ${amount}`;
}

/** The channel's name as a person reads it: "eBay", or the website's own address ("ticktoon.co.uk"). */
export function channelName(row: { provider?: string; label?: string } | null | undefined): string {
  if (!row) return "";
  if (row.provider === "ebay") return "eBay";
  return String(row.label || "").trim() || "WooCommerce";
}

/** The row's channel line: "eBay · £450.00" (money shown) or "eBay" (no price, or no Financial Info). */
export function listingLine(row: ChannelListingRow | null | undefined): string {
  if (!row) return "";
  const money = listingMoney(row.price);
  return money ? `${channelName(row)} · ${money}` : channelName(row);
}

/** Summary figures, or null when the server is older than this feature (no listedCurrency field at all). */
export function listedSummary(summary: Record<string, unknown> | null | undefined): null | {
  value: number; count: number; currency: string; otherCurrency: number; noCost: number; pictures: number; costMissing: number;
} {
  if (!summary || typeof summary.listedCurrency !== "string") return null;
  const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : 0; };
  return {
    value: n(summary.listedValue), count: Math.floor(n(summary.listedCount)), currency: String(summary.listedCurrency || ""),
    otherCurrency: Math.floor(n(summary.listedOtherCurrencyCount)), noCost: Math.floor(n(summary.listedNoCostCount)),
    pictures: Math.floor(n(summary.pictureAvailableCount)), costMissing: Math.floor(n(summary.costMissingCount))
  };
}

type Lang = "Türkçe" | "Deutsch" | "Français" | "Italiano" | "Español (Spanish)" | "Português" | "Русский (Russian)" | "日本語 (Japanese)" | "中文 (Chinese)" | "العربية (Arabic)" | "हिन्दी (Hindi)";
const L = (tr: string, de: string, fr: string, it: string, es: string, pt: string, ru: string, ja: string, zh: string, ar: string, hi: string): Record<Lang, string> =>
  ({ "Türkçe": tr, "Deutsch": de, "Français": fr, "Italiano": it, "Español (Spanish)": es, "Português": pt, "Русский (Russian)": ru, "日本語 (Japanese)": ja, "中文 (Chinese)": zh, "العربية (Arabic)": ar, "हिन्दी (Hindi)": hi });

/** Every English sentence this feature prints, in the eleven other app languages (drafts, 6 Nov 2026). */
export const INVENTORY_LISTINGS_TEXT: Record<string, Record<Lang, string>> = {
  "Listed value": L("İlan değeri", "Angebotswert", "Valeur en vente", "Valore in vendita", "Valor anunciado", "Valor anunciado", "Стоимость по объявлениям", "出品価格の合計", "在售标价合计", "القيمة المعروضة", "लिस्टिंग मूल्य"),
  "What the items on the shelf are listed at on eBay and your websites — per item the lowest active listing price. A sale price, not a cost: it is not part of Total Inventory Value.": L(
    "Raftaki ürünlerin eBay'de ve sitelerinizde satışa konduğu fiyatlar — her ürün için en düşük aktif ilan fiyatı. Bu bir satış fiyatıdır, maliyet değildir: Toplam Envanter Değeri'ne eklenmez.",
    "Zu welchem Preis die Artikel im Regal bei eBay und auf Ihren Websites angeboten werden — pro Artikel der niedrigste aktive Angebotspreis. Ein Verkaufspreis, keine Kosten: nicht Teil des gesamten Lagerwerts.",
    "Le prix auquel les articles en stock sont proposés sur eBay et vos sites — par article, le prix actif le plus bas. Un prix de vente, pas un coût : il ne fait pas partie de la valeur totale du stock.",
    "Il prezzo a cui gli articoli a magazzino sono in vendita su eBay e sui tuoi siti — per articolo il prezzo attivo più basso. È un prezzo di vendita, non un costo: non rientra nel valore totale dell'inventario.",
    "El precio al que los artículos en estante están anunciados en eBay y en tus webs — por artículo, el precio activo más bajo. Es un precio de venta, no un coste: no forma parte del valor total del inventario.",
    "O preço a que os itens em estoque estão anunciados no eBay e nos seus sites — por item, o preço ativo mais baixo. É um preço de venda, não um custo: não entra no valor total do inventário.",
    "По какой цене товары на полке выставлены на eBay и ваших сайтах — для каждого товара самая низкая активная цена. Это цена продажи, а не себестоимость: в общую стоимость запасов она не входит.",
    "在庫品が eBay やあなたのサイトで出品されている価格（品目ごとに最も安い有効な出品価格）。販売価格であり原価ではないため、在庫総額には含まれません。",
    "货架上的物品在 eBay 和您的网站上的标价——每件取最低的有效标价。这是售价而非成本，不计入库存总值。",
    "السعر الذي تُعرض به القطع الموجودة على الرف في eBay ومواقعك — لكل قطعة أقل سعر عرض فعّال. هذا سعر بيع وليس تكلفة: لا يدخل في إجمالي قيمة المخزون.",
    "शेल्फ़ पर रखी चीज़ें eBay और आपकी वेबसाइटों पर किस कीमत पर लिस्ट हैं — हर चीज़ की सबसे कम सक्रिय लिस्टिंग कीमत। यह बिक्री कीमत है, लागत नहीं: यह कुल इन्वेंटरी मूल्य में नहीं जुड़ती।"),
  "{count} listed": L("{count} ilanda", "{count} angeboten", "{count} en vente", "{count} in vendita", "{count} anunciados", "{count} anunciados", "{count} в объявлениях", "{count} 件出品中", "{count} 件在售", "{count} معروضة", "{count} लिस्टेड"),
  "{count} more are listed in another currency and are not added.": L(
    "{count} ürün daha başka bir para biriminde ilanda; eklenmedi.", "{count} weitere sind in einer anderen Währung angeboten und nicht enthalten.", "{count} autres sont proposés dans une autre devise et ne sont pas ajoutés.",
    "Altri {count} sono in vendita in un'altra valuta e non sono inclusi.", "Otros {count} están anunciados en otra moneda y no se suman.", "Outros {count} estão anunciados em outra moeda e não são somados.",
    "Ещё {count} выставлены в другой валюте и не учтены.", "ほかに {count} 件は別の通貨で出品されているため含めていません。", "另有 {count} 件以其他货币标价，未计入。", "{count} أخرى معروضة بعملة أخرى ولم تُضَف.", "{count} और किसी दूसरी मुद्रा में लिस्ट हैं और जोड़े नहीं गए।"),
  "Needs details": L("Eksik bilgi", "Angaben fehlen", "Informations manquantes", "Dati mancanti", "Faltan datos", "Faltam dados", "Не хватает данных", "情報が不足", "信息不全", "بيانات ناقصة", "जानकारी अधूरी"),
  "Items on the shelf missing a cost, a photo or a category. Cards brought in from eBay or a website start without a cost — add what you paid, so the inventory value is right.": L(
    "Maliyeti, fotoğrafı ya da kategorisi eksik raftaki ürünler. eBay'den ya da bir siteden alınan kartlar maliyetsiz başlar — envanter değeri doğru olsun diye ödediğiniz tutarı ekleyin.",
    "Artikel im Regal ohne Kosten, Foto oder Kategorie. Von eBay oder einer Website übernommene Karten beginnen ohne Kosten — tragen Sie ein, was Sie bezahlt haben, damit der Lagerwert stimmt.",
    "Articles en stock sans coût, photo ou catégorie. Les fiches venues d'eBay ou d'un site commencent sans coût — indiquez ce que vous avez payé pour que la valeur du stock soit juste.",
    "Articoli a magazzino senza costo, foto o categoria. Le schede importate da eBay o da un sito partono senza costo — inserisci quanto hai pagato, così il valore dell'inventario è corretto.",
    "Artículos en estante sin coste, foto o categoría. Las fichas traídas de eBay o de una web empiezan sin coste — añade lo que pagaste para que el valor del inventario sea correcto.",
    "Itens em estoque sem custo, foto ou categoria. Fichas trazidas do eBay ou de um site começam sem custo — adicione o que você pagou para que o valor do inventário fique certo.",
    "Товары на полке без себестоимости, фото или категории. Карточки из eBay или с сайта создаются без себестоимости — укажите, сколько вы заплатили, чтобы стоимость запасов была верной.",
    "原価・写真・カテゴリーのいずれかが欠けている在庫品です。eBay やサイトから取り込んだカードは原価なしで始まります。在庫額が正しくなるよう、支払った金額を入力してください。",
    "缺少成本、照片或分类的在架物品。从 eBay 或网站导入的卡片一开始没有成本——请填写您支付的金额，以便库存价值准确。",
    "قطع على الرف ينقصها التكلفة أو الصورة أو الفئة. البطاقات المستوردة من eBay أو من موقع تبدأ بلا تكلفة — أضف ما دفعته لتكون قيمة المخزون صحيحة.",
    "शेल्फ़ की वे चीज़ें जिनमें लागत, फ़ोटो या श्रेणी नहीं है। eBay या वेबसाइट से लाए गए कार्ड बिना लागत के शुरू होते हैं — आपने जो चुकाया वह जोड़ें, ताकि इन्वेंटरी मूल्य सही रहे।"),
  "No cost": L("Maliyet yok", "Keine Kosten", "Pas de coût", "Nessun costo", "Sin coste", "Sem custo", "Нет себестоимости", "原価なし", "无成本", "بلا تكلفة", "लागत नहीं"),
  "No photo": L("Fotoğraf yok", "Kein Foto", "Pas de photo", "Nessuna foto", "Sin foto", "Sem foto", "Нет фото", "写真なし", "无照片", "بلا صورة", "फ़ोटो नहीं"),
  "No category": L("Kategori yok", "Keine Kategorie", "Pas de catégorie", "Nessuna categoria", "Sin categoría", "Sem categoria", "Нет категории", "カテゴリーなし", "无分类", "بلا فئة", "श्रेणी नहीं"),
  "Bring in pictures from listings ({count})": L("Resimleri ilanlardan getir ({count})", "Bilder aus Angeboten übernehmen ({count})", "Récupérer les photos des annonces ({count})", "Prendi le foto dalle inserzioni ({count})", "Traer fotos de los anuncios ({count})", "Trazer fotos dos anúncios ({count})", "Взять фото из объявлений ({count})", "出品から写真を取り込む（{count}）", "从刊登导入图片（{count}）", "جلب الصور من العروض ({count})", "लिस्टिंग से फ़ोटो लाएँ ({count})"),
  "Bringing in pictures from your listings…": L("Resimler ilanlarınızdan getiriliyor…", "Bilder werden aus Ihren Angeboten übernommen…", "Récupération des photos de vos annonces…", "Recupero delle foto dalle inserzioni…", "Trayendo fotos de tus anuncios…", "Trazendo fotos dos seus anúncios…", "Берём фото из ваших объявлений…", "出品から写真を取り込んでいます…", "正在从您的刊登导入图片…", "جارٍ جلب الصور من عروضك…", "आपकी लिस्टिंग से फ़ोटो लाए जा रहे हैं…"),
  "Pictures brought in: {copied}. Not brought in: {failed}.": L("Getirilen resim: {copied}. Getirilemeyen: {failed}.", "Übernommene Bilder: {copied}. Nicht übernommen: {failed}.", "Photos récupérées : {copied}. Non récupérées : {failed}.", "Foto recuperate: {copied}. Non recuperate: {failed}.", "Fotos traídas: {copied}. No traídas: {failed}.", "Fotos trazidas: {copied}. Não trazidas: {failed}.", "Взято фото: {copied}. Не удалось: {failed}.", "取り込んだ写真：{copied}。取り込めなかった写真：{failed}。", "已导入图片：{copied}。未导入：{failed}。", "الصور المجلوبة: {copied}. غير المجلوبة: {failed}.", "लाए गए फ़ोटो: {copied}। नहीं लाए जा सके: {failed}।"),
  "Show them": L("Göster", "Anzeigen", "Les afficher", "Mostrali", "Mostrarlos", "Mostrar", "Показать", "表示する", "显示", "اعرضها", "दिखाएँ"),
  "Every item on the shelf has a cost, a photo and a category.": L("Raftaki her ürünün maliyeti, fotoğrafı ve kategorisi var.", "Jeder Artikel im Regal hat Kosten, ein Foto und eine Kategorie.", "Chaque article en stock a un coût, une photo et une catégorie.", "Ogni articolo a magazzino ha costo, foto e categoria.", "Cada artículo en estante tiene coste, foto y categoría.", "Cada item em estoque tem custo, foto e categoria.", "У каждого товара на полке есть себестоимость, фото и категория.", "在庫品はすべて原価・写真・カテゴリーがそろっています。", "每件在架物品都有成本、照片和分类。", "لكل قطعة على الرف تكلفة وصورة وفئة.", "शेल्फ़ की हर चीज़ में लागत, फ़ोटो और श्रेणी है।"),
  "Listed on {channel}": L("{channel} üzerinde ilanda", "Angeboten auf {channel}", "En vente sur {channel}", "In vendita su {channel}", "Anunciado en {channel}", "Anunciado em {channel}", "Выставлено на {channel}", "{channel} に出品中", "在 {channel} 上架", "معروض على {channel}", "{channel} पर लिस्टेड"),
  "{count} listed items have no cost yet — their margin is unknown.": L("İlandaki {count} ürünün henüz maliyeti yok — kâr payları bilinmiyor.", "{count} angebotene Artikel haben noch keine Kosten — ihre Marge ist unbekannt.", "{count} articles en vente n'ont pas encore de coût — leur marge est inconnue.", "{count} articoli in vendita non hanno ancora un costo — il margine è sconosciuto.", "{count} artículos anunciados aún no tienen coste — su margen es desconocido.", "{count} itens anunciados ainda não têm custo — a margem é desconhecida.", "У {count} выставленных товаров ещё нет себестоимости — их маржа неизвестна.", "出品中の {count} 件にはまだ原価がありません。利益は不明です。", "{count} 件在售物品尚无成本——利润未知。", "{count} قطعة معروضة بلا تكلفة بعد — هامشها غير معروف.", "{count} लिस्टेड चीज़ों की लागत अभी नहीं है — उनका मार्जिन अज्ञात है।")
};

/** The sentence in `language`, or "" when this table has none (the screen then asks its other tables, then studioT). */
export function inventoryListingsText(sentence: string, language: string): string {
  if (!Object.prototype.hasOwnProperty.call(INVENTORY_LISTINGS_TEXT, sentence)) return "";
  const row = INVENTORY_LISTINGS_TEXT[sentence];
  return Object.prototype.hasOwnProperty.call(row, language) ? row[language as Lang] : "";
}
