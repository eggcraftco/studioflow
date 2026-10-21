// WooCommerce products → Inventory (MC-3, 22 Oct 2026) — the pure half of the web screen.
//
// This module imports nothing, so scripts/check-woo-inventory.mjs can compile and run it. It decides:
//   * which fields of a Preview row may reach the screen (a closed list), and that a picture is shown only from the
//     store's own host (or WordPress's image CDN), loaded without a referrer;
//   * what a selected row's decision is and whether it can be sent: a counted card needs the person's own shelf count
//     (the store's figure is never a default — and is often not tracked at all), a one-off card needs the person's
//     "this item is here", an ambiguous row needs the person's confirmation, a sold-out/archived row is chosen only
//     from its own list. Nothing is chosen until the person ticks a row;
//   * the words for every state and refusal, in every app language. The sentences shared with eBay E4 come from
//     ebayInventoryRules' table (wooInventory.ts falls back to it, then to the app's studioT).

export type WooCandidate = { id: string; number: string; name: string; sku: string; status: string; trackingType: string; reason: string };
export type WooMoney = { value: string; currency: string } | null;
export type WooProductRow = {
  linkId: string; productId: string; variationId: string; type: string; hasVariations: boolean; title: string; variationName: string;
  sku: string; brand: string; condition: string; description: string; imageUrl: string;
  listedQuantity: number | null; stockTracked: "parent" | boolean; stockStatus: string; lifecycle: "active" | "sold" | "archived";
  price: WooMoney; salePrice: WooMoney; onSale: boolean;
  state: string; ambiguity: string; linkedItem: WooCandidate | null; candidates: WooCandidate[]; suggestions: WooCandidate[];
  proposed: { name: string; trackingType: "" | "unique" | "quantity" };
};
export type WooDecision = { action: "" | "link" | "create"; inventoryItemId: string; trackingType: "" | "unique" | "quantity"; openingCount: string; inHand: boolean; confirmAmbiguous: boolean; category: string };
export type WooImportRow = { linkId: string; result: string; reason: string; inventoryItemId: string; number: string };

export const WOO_IMPORT_PER_CALL = 200;
const LINK_ID = /^s[0-9a-f]{10}__p\d{1,20}__v\d{1,20}$/;
const STATES = ["linked", "sku_match", "ambiguous", "no_match", "no_sku", "link_broken", "not_stock"];

const text = (value: unknown, max = 200) => (typeof value === "string" ? value.slice(0, max) : typeof value === "number" && Number.isFinite(value) ? String(value) : "");
const obj = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {});
const intOrNull = (value: unknown) => (typeof value === "number" && Number.isInteger(value) ? value : null);

/** The store's own host (or a subdomain of it), or WordPress's image CDN — anything else is not loaded. */
export function safeImageUrl(value: unknown, storeHost: string): string {
  const url = text(value, 1024);
  let parsed: URL;
  try { parsed = new URL(url); } catch { return ""; }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return "";
  const host = parsed.hostname.toLowerCase();
  const store = String(storeHost || "").toLowerCase();
  if (store && (host === store || host.endsWith(`.${store}`))) return url;
  if (/^i[0-3]\.wp\.com$/.test(host)) return url;
  return "";
}

function moneyOf(value: unknown): WooMoney {
  const m = obj(value);
  const v = text(m.value, 24); const c = text(m.currency, 3).toUpperCase();
  return v && /^-?\d+(\.\d+)?$/.test(v) ? { value: v, currency: /^[A-Z]{3}$/.test(c) ? c : "" } : null;
}
function candidateOf(value: unknown): WooCandidate | null {
  const c = obj(value);
  const id = text(c.id, 80);
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return null;
  return { id, number: text(c.number, 40), name: text(c.name, 160), sku: text(c.sku, 80), status: text(c.status, 30), trackingType: text(c.trackingType, 20), reason: text(c.reason, 20) };
}
const candidatesOf = (value: unknown) => (Array.isArray(value) ? value.map(candidateOf).filter((c): c is WooCandidate => Boolean(c)) : []);

/** The Preview's rows as the screen may hold them: one per link id, the closed list of fields, nothing else. */
export function productRowsOf(answer: unknown): WooProductRow[] {
  const a = obj(answer);
  const storeHost = text(a.host, 200);
  const rows = Array.isArray(a.rows) ? a.rows as unknown[] : [];
  const seen = new Set<string>();
  const out: WooProductRow[] = [];
  for (const raw of rows) {
    const r = obj(raw);
    const linkId = text(r.linkId, 80);
    if (!LINK_ID.test(linkId) || seen.has(linkId)) continue;
    seen.add(linkId);
    const proposed = obj(r.proposed);
    const lifecycle = r.lifecycle === "sold" || r.lifecycle === "archived" ? r.lifecycle : "active";
    out.push({
      linkId, productId: text(r.productId, 20), variationId: text(r.variationId, 20), type: text(r.type, 20), hasVariations: r.hasVariations === true,
      title: text(r.title, 200), variationName: text(r.variationName, 200), sku: text(r.sku, 80), brand: text(r.brand, 80), condition: text(r.condition, 40),
      description: text(r.description, 600), imageUrl: safeImageUrl(r.imageUrl, storeHost),
      listedQuantity: intOrNull(r.listedQuantity), stockTracked: r.stockTracked === "parent" ? "parent" : r.stockTracked === true, stockStatus: text(r.stockStatus, 20), lifecycle,
      price: moneyOf(r.price), salePrice: moneyOf(r.salePrice), onSale: r.onSale === true,
      state: STATES.includes(text(r.state, 20)) ? text(r.state, 20) : "no_match", ambiguity: text(r.ambiguity, 40),
      linkedItem: candidateOf(r.linkedItem), candidates: candidatesOf(r.candidates), suggestions: candidatesOf(r.suggestions),
      proposed: { name: text(proposed.name, 160), trackingType: proposed.trackingType === "unique" ? "unique" : proposed.trackingType === "quantity" ? "quantity" : "" }
    });
  }
  return out;
}

/** A row can be chosen unless it is already linked to a card that exists, or is not stock at all. */
export function canChoose(row: WooProductRow): boolean {
  return row.state !== "linked" && row.state !== "not_stock";
}

/** The decision a row starts with when ticked: link to the one SKU match; otherwise nothing chosen yet. Never a count. */
export function startingDecision(row: WooProductRow): WooDecision {
  const base: WooDecision = { action: "", inventoryItemId: "", trackingType: row.proposed.trackingType, openingCount: "", inHand: false, confirmAmbiguous: false, category: "" };
  if (row.state === "sku_match" && row.candidates.length === 1) return { ...base, action: "link", inventoryItemId: row.candidates[0].id };
  return base;
}

/** Why a decision cannot be sent yet ("" when it can): the server's own rules, so a refusal is not a surprise. */
export function decisionProblem(row: WooProductRow, decision: WooDecision | undefined): string {
  if (!decision || !decision.action) return "action_required";
  if (row.state === "ambiguous" && !decision.confirmAmbiguous) return "ambiguous_needs_decision";
  if (decision.action === "link") {
    if (!decision.inventoryItemId) return "card_required";
    const card = [...row.candidates, ...row.suggestions].find((c) => c.id === decision.inventoryItemId);
    if (card && card.trackingType === "unique" && (row.listedQuantity ?? 0) > 1) return "one_off_card_for_many";
    return "";
  }
  if (!decision.trackingType) return "tracking_type_required";
  if (decision.trackingType === "unique") {
    if (row.hasVariations) return "one_off_card_for_variation";
    if ((row.listedQuantity ?? 0) > 1) return "one_off_card_for_many";
    if (!decision.inHand) return "count_required";
    return "";
  }
  if (decision.openingCount.trim() === "") return "count_required";
  const n = Number(decision.openingCount.replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 1e7) return "count_invalid";
  return "";
}

/** What Import sends for the chosen rows, in the list's order; rows with a problem are not sent. */
export function decisionsToSend(rows: WooProductRow[], chosen: string[], decisions: Record<string, WooDecision>) {
  const out: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    if (!chosen.includes(row.linkId) || !canChoose(row)) continue;
    const d = decisions[row.linkId];
    if (decisionProblem(row, d)) continue;
    const flags = { ...(row.lifecycle !== "active" ? { includeInactive: true } : {}), ...(row.state === "ambiguous" ? { confirmAmbiguous: true } : {}) };
    if (d.action === "link") out.push({ linkId: row.linkId, action: "link", inventoryItemId: d.inventoryItemId, ...flags });
    else out.push({
      linkId: row.linkId, action: "create", trackingType: d.trackingType,
      ...(d.trackingType === "quantity" ? { openingCount: Number(d.openingCount.replace(",", ".")) } : { inHand: true }),
      ...(d.category ? { category: d.category } : {}), ...flags
    });
  }
  return out;
}

export function chunk<T>(list: T[], size = WOO_IMPORT_PER_CALL): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export function importRowsOf(answer: unknown): WooImportRow[] {
  const rows = Array.isArray(obj(answer).results) ? obj(answer).results as unknown[] : [];
  return rows.map((raw) => {
    const r = obj(raw);
    return { linkId: text(r.linkId, 80), result: text(r.result, 30), reason: text(r.reason, 60), inventoryItemId: text(r.inventoryItemId, 80), number: text(r.number, 40) };
  });
}

/** The tabs: what is for sale (default), the rows that need the person, SKU proposals, linked — and, apart, sold-out/archived. */
export function filterRows(rows: WooProductRow[], filter: string): WooProductRow[] {
  const active = rows.filter((r) => r.lifecycle === "active");
  if (filter === "inactive") return rows.filter((r) => r.lifecycle !== "active");
  if (filter === "needs_choice") return active.filter((r) => ["ambiguous", "no_match", "no_sku", "link_broken"].includes(r.state));
  if (filter === "sku_match") return active.filter((r) => r.state === "sku_match");
  if (filter === "linked") return rows.filter((r) => r.state === "linked");
  return active;
}
export function countsOf(rows: WooProductRow[]) {
  return { active: filterRows(rows, "active").length, needs_choice: filterRows(rows, "needs_choice").length, sku_match: filterRows(rows, "sku_match").length, linked: filterRows(rows, "linked").length, inactive: filterRows(rows, "inactive").length };
}

/** The word for a row's state. */
export function rowStateSentence(row: WooProductRow): string {
  if (row.state === "linked") return "Linked";
  if (row.state === "sku_match") return "Same SKU in stock";
  if (row.state === "link_broken") return "The linked card no longer exists";
  if (row.state === "not_stock") return "Not stock (grouped or external product)";
  if (row.state === "ambiguous") {
    if (row.ambiguity === "sku_on_several_products") return "Check: the same SKU is on another product in this store";
    if (row.ambiguity === "sku_on_several_cards") return "Check: more than one card has this SKU";
    if (row.ambiguity === "sku_case_differs") return "Check: the SKU matches only if capitals are ignored";
    return "Check: the card with this SKU is no longer on the shelf";
  }
  if (row.state === "no_sku") return "No SKU in the store";
  return "No card has this SKU";
}

/** What the store says about its own stock — never the shelf count. */
export function storeStockSentence(row: WooProductRow): { sentence: string; values: Record<string, number | string> } {
  if (row.stockTracked === "parent") return { sentence: "Stock is tracked on the parent product", values: {} };
  if (row.listedQuantity === null) return { sentence: "Stock not tracked in the store", values: {} };
  return { sentence: "Store shows {count} in stock — the store's number, not your shelf count", values: { count: row.listedQuantity } };
}

const REASONS: Record<string, string> = {
  product_not_in_preview: "This product is not in the last read. Read the store again.",
  preview_too_old: "The last read is more than a day old. Read the store again.",
  already_linked: "Already linked to a card. Change the link from that card.",
  card_not_found: "That card no longer exists.",
  card_required: "Choose a card.",
  customer_item: "A customer's own item is not stock.",
  card_not_on_shelf: "That card is archived or removed.",
  made_card_not_on_shelf: "The card made from this product earlier is archived or removed.",
  one_off_card_for_many: "A one-off card cannot stand for a product the store sells more than one of.",
  one_off_card_for_variation: "A variation is brought in as a counted card.",
  card_linked_to_other_product: "This one-off card is already linked to another product of this store.",
  tracking_type_required: "Choose one-off or counted.",
  count_required: "Type how many you have on the shelf (0 is allowed), or confirm the one item is here.",
  count_invalid: "That count is not a number NivaDesk can use.",
  inactive_needs_explicit_choice: "This product is sold out or archived: choose it from that list.",
  ambiguous_needs_decision: "Check the candidates and confirm before bringing this in.",
  not_stock_product: "A grouped or external product has no stock of its own.",
  action_required: "Choose link or create.",
  chosen_twice: "This product was chosen twice.",
  // the store read
  not_connected: "This store is not connected. Reconnect it in Settings ▸ Integrations.",
  reconnect_required: "The store refused NivaDesk's keys. Reconnect WooCommerce.",
  rate_limited: "The store asked NivaDesk to slow down. Try again in a few minutes.",
  store_address_refused: "The store's address cannot be used.",
  provider_unavailable: "The store could not be reached just now. Try again in a moment.",
  failed: "This could not be done."
};
/** The sentence for a server reason word; an unknown word gets the general sentence, never the raw word. */
export function reasonSentence(reason: string): string {
  return Object.prototype.hasOwnProperty.call(REASONS, reason) ? REASONS[reason] : REASONS.failed;
}

export function fill(sentence: string, values: Record<string, number | string>): string {
  return sentence.replace(/\{(\w+)\}/g, (match, key: string) => (Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match));
}

// ---- the sentences (only those E4's table does not already carry) ----------------
type Lang = "Türkçe" | "Deutsch" | "Français" | "Italiano" | "Español (Spanish)" | "Português" | "Русский (Russian)" | "日本語 (Japanese)" | "中文 (Chinese)" | "العربية (Arabic)" | "हिन्दी (Hindi)";
export const WOO_INVENTORY_LANGUAGES: Lang[] = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const L = (tr: string, de: string, fr: string, it: string, es: string, pt: string, ru: string, ja: string, zh: string, ar: string, hi: string): Record<Lang, string> =>
  ({ "Türkçe": tr, "Deutsch": de, "Français": fr, "Italiano": it, "Español (Spanish)": es, "Português": pt, "Русский (Russian)": ru, "日本語 (Japanese)": ja, "中文 (Chinese)": zh, "العربية (Arabic)": ar, "हिन्दी (Hindi)": hi });

export const WOO_INVENTORY_TEXT: Record<string, Record<Lang, string>> = {
  "WooCommerce products": L("WooCommerce ürünleri", "WooCommerce-Produkte", "Produits WooCommerce", "Prodotti WooCommerce", "Productos de WooCommerce", "Produtos WooCommerce", "Товары WooCommerce", "WooCommerceの商品", "WooCommerce 商品", "منتجات WooCommerce", "WooCommerce उत्पाद"),
  "Read your WooCommerce products, match them to your stock and bring in only the ones you choose. Nothing is written to your store.": L(
    "WooCommerce ürünlerinizi okuyun, stoğunuzla eşleştirin ve yalnızca seçtiklerinizi içe alın. Mağazanıza hiçbir şey yazılmaz.",
    "Lesen Sie Ihre WooCommerce-Produkte, ordnen Sie sie Ihrem Bestand zu und übernehmen Sie nur die ausgewählten. In Ihrem Shop wird nichts geändert.",
    "Lisez vos produits WooCommerce, rapprochez-les de votre stock et n'importez que ceux que vous choisissez. Rien n'est écrit dans votre boutique.",
    "Leggi i tuoi prodotti WooCommerce, abbinali al tuo magazzino e importa solo quelli che scegli. Nel tuo negozio non viene scritto nulla.",
    "Lee tus productos de WooCommerce, relaciónalos con tu stock y trae solo los que elijas. No se escribe nada en tu tienda.",
    "Leia os seus produtos WooCommerce, associe-os ao seu stock e traga apenas os que escolher. Nada é escrito na sua loja.",
    "Прочитайте товары WooCommerce, сопоставьте их со складом и перенесите только выбранные. В магазин ничего не записывается.",
    "WooCommerceの商品を読み込み、在庫と照合して、選んだものだけを取り込みます。ストアには何も書き込みません。",
    "读取您的 WooCommerce 商品，与库存匹配，只导入您选择的商品。不会向您的商店写入任何内容。",
    "اقرأ منتجات WooCommerce وطابقها مع مخزونك واستورد فقط ما تختاره. لا يُكتب أي شيء في متجرك.",
    "अपने WooCommerce उत्पाद पढ़ें, उन्हें अपने स्टॉक से मिलाएँ और केवल चुने हुए ही लाएँ। आपके स्टोर में कुछ नहीं लिखा जाता।"),
  "WooCommerce products are not switched on for this workspace yet.": L("WooCommerce ürünleri bu çalışma alanı için henüz açılmadı.", "WooCommerce-Produkte sind für diesen Arbeitsbereich noch nicht eingeschaltet.", "Les produits WooCommerce ne sont pas encore activés pour cet espace de travail.", "I prodotti WooCommerce non sono ancora attivi per questo spazio di lavoro.", "Los productos de WooCommerce aún no están activados para este espacio de trabajo.", "Os produtos WooCommerce ainda não estão ativados para este espaço de trabalho.", "Товары WooCommerce для этого рабочего пространства ещё не включены.", "このワークスペースではWooCommerceの商品はまだ有効になっていません。", "此工作区尚未开启 WooCommerce 商品。", "لم يتم تشغيل منتجات WooCommerce لمساحة العمل هذه بعد.", "इस वर्कस्पेस के लिए WooCommerce उत्पाद अभी चालू नहीं हैं।"),
  "Connect WooCommerce in Settings ▸ Integrations first.": L("Önce Ayarlar ▸ Entegrasyonlar'dan WooCommerce'i bağlayın.", "Verbinden Sie zuerst WooCommerce unter Einstellungen ▸ Integrationen.", "Connectez d'abord WooCommerce dans Réglages ▸ Intégrations.", "Collega prima WooCommerce in Impostazioni ▸ Integrazioni.", "Primero conecta WooCommerce en Ajustes ▸ Integraciones.", "Primeiro ligue o WooCommerce em Definições ▸ Integrações.", "Сначала подключите WooCommerce в Настройки ▸ Интеграции.", "先に「設定 ▸ 連携」でWooCommerceを接続してください。", "请先在 设置 ▸ 集成 中连接 WooCommerce。", "اربط WooCommerce أولاً من الإعدادات ▸ التكاملات.", "पहले सेटिंग्स ▸ इंटीग्रेशन में WooCommerce कनेक्ट करें।"),
  "Open WooCommerce settings": L("WooCommerce ayarlarını aç", "WooCommerce-Einstellungen öffnen", "Ouvrir les réglages WooCommerce", "Apri le impostazioni WooCommerce", "Abrir ajustes de WooCommerce", "Abrir definições do WooCommerce", "Открыть настройки WooCommerce", "WooCommerceの設定を開く", "打开 WooCommerce 设置", "افتح إعدادات WooCommerce", "WooCommerce सेटिंग्स खोलें"),
  "Read my products": L("Ürünlerimi oku", "Meine Produkte lesen", "Lire mes produits", "Leggi i miei prodotti", "Leer mis productos", "Ler os meus produtos", "Прочитать мои товары", "商品を読み込む", "读取我的商品", "اقرأ منتجاتي", "मेरे उत्पाद पढ़ें"),
  "Reading the store…": L("Mağaza okunuyor…", "Shop wird gelesen…", "Lecture de la boutique…", "Lettura del negozio…", "Leyendo la tienda…", "A ler a loja…", "Чтение магазина…", "ストアを読み込み中…", "正在读取商店…", "جارٍ قراءة المتجر…", "स्टोर पढ़ा जा रहा है…"),
  "{count} products read · {rows} to match": L("{count} ürün okundu · eşleştirilecek {rows}", "{count} Produkte gelesen · {rows} zuzuordnen", "{count} produits lus · {rows} à rapprocher", "{count} prodotti letti · {rows} da abbinare", "{count} productos leídos · {rows} por relacionar", "{count} produtos lidos · {rows} para associar", "Прочитано товаров: {count} · к сопоставлению: {rows}", "{count}件の商品を読み込み · 照合対象 {rows}", "已读取 {count} 个商品 · 待匹配 {rows}", "تمت قراءة {count} منتجًا · {rows} للمطابقة", "{count} उत्पाद पढ़े · मिलाने के लिए {rows}"),
  "More than 1,000 products: only the first 1,000 were read.": L("1.000'den fazla ürün: yalnızca ilk 1.000 okundu.", "Mehr als 1.000 Produkte: nur die ersten 1.000 wurden gelesen.", "Plus de 1 000 produits : seuls les 1 000 premiers ont été lus.", "Più di 1.000 prodotti: sono stati letti solo i primi 1.000.", "Más de 1.000 productos: solo se leyeron los primeros 1.000.", "Mais de 1.000 produtos: só foram lidos os primeiros 1.000.", "Больше 1 000 товаров: прочитаны только первые 1 000.", "商品が1,000件を超えています：最初の1,000件のみ読み込みました。", "超过 1,000 个商品：只读取了前 1,000 个。", "أكثر من 1,000 منتج: تمت قراءة أول 1,000 فقط.", "1,000 से अधिक उत्पाद: केवल पहले 1,000 पढ़े गए।"),
  "Some products have more than 300 variations: only the first 300 were read.": L("Bazı ürünlerin 300'den fazla varyasyonu var: yalnızca ilk 300 okundu.", "Einige Produkte haben mehr als 300 Varianten: nur die ersten 300 wurden gelesen.", "Certains produits ont plus de 300 variantes : seules les 300 premières ont été lues.", "Alcuni prodotti hanno più di 300 varianti: sono state lette solo le prime 300.", "Algunos productos tienen más de 300 variaciones: solo se leyeron las primeras 300.", "Alguns produtos têm mais de 300 variações: só foram lidas as primeiras 300.", "У некоторых товаров больше 300 вариантов: прочитаны только первые 300.", "300を超えるバリエーションを持つ商品があります：最初の300件のみ読み込みました。", "部分商品有超过 300 个变体：只读取了前 300 个。", "بعض المنتجات لها أكثر من 300 متغير: تمت قراءة أول 300 فقط.", "कुछ उत्पादों में 300 से अधिक वेरिएशन हैं: केवल पहले 300 पढ़े गए।"),
  "No products in this store.": L("Bu mağazada ürün yok.", "Keine Produkte in diesem Shop.", "Aucun produit dans cette boutique.", "Nessun prodotto in questo negozio.", "No hay productos en esta tienda.", "Não há produtos nesta loja.", "В этом магазине нет товаров.", "このストアには商品がありません。", "此商店没有商品。", "لا توجد منتجات في هذا المتجر.", "इस स्टोर में कोई उत्पाद नहीं है।"),
  "For sale": L("Satışta", "Im Verkauf", "En vente", "In vendita", "A la venta", "À venda", "В продаже", "販売中", "在售", "معروض للبيع", "बिक्री पर"),
  "Sold out or archived": L("Tükenmiş veya arşivlenmiş", "Ausverkauft oder archiviert", "Épuisé ou archivé", "Esaurito o archiviato", "Agotado o archivado", "Esgotado ou arquivado", "Распродано или в архиве", "売り切れまたはアーカイブ済み", "已售罄或已归档", "نفدت الكمية أو مؤرشف", "स्टॉक ख़त्म या संग्रहित"),
  "Sold out in the store": L("Mağazada tükenmiş", "Im Shop ausverkauft", "Épuisé dans la boutique", "Esaurito nel negozio", "Agotado en la tienda", "Esgotado na loja", "Распродано в магазине", "ストアで売り切れ", "商店中已售罄", "نفدت الكمية في المتجر", "स्टोर में स्टॉक ख़त्म"),
  "Archived in the store": L("Mağazada arşivlenmiş", "Im Shop archiviert", "Archivé dans la boutique", "Archiviato nel negozio", "Archivado en la tienda", "Arquivado na loja", "В архиве магазина", "ストアでアーカイブ済み", "商店中已归档", "مؤرشف في المتجر", "स्टोर में संग्रहित"),
  "A past sale is not stock: bring these in only for what is physically on your shelf.": L("Geçmiş bir satış stok değildir: bunları yalnızca rafta fiziksel olarak duranlar için içe alın.", "Ein vergangener Verkauf ist kein Bestand: übernehmen Sie diese nur für das, was physisch im Regal liegt.", "Une vente passée n'est pas du stock : n'importez ceux-ci que pour ce qui est physiquement sur l'étagère.", "Una vendita passata non è magazzino: importali solo per ciò che è fisicamente sullo scaffale.", "Una venta pasada no es stock: tráelos solo para lo que está físicamente en tu estante.", "Uma venda passada não é stock: traga-os apenas para o que está fisicamente na prateleira.", "Прошлая продажа — не запас: переносите их только для того, что физически на полке.", "過去の販売は在庫ではありません：実際に棚にあるものだけ取り込んでください。", "过去的销售不是库存：只为实际在货架上的物品导入。", "البيع السابق ليس مخزونًا: استوردها فقط لما هو موجود فعليًا على رفّك.", "पिछली बिक्री स्टॉक नहीं है: इन्हें केवल उसी के लिए लाएँ जो सच में आपकी शेल्फ़ पर है।"),
  "Store shows {count} in stock — the store's number, not your shelf count": L("Mağaza stokta {count} gösteriyor — mağazanın sayısı, raf sayınız değil", "Shop zeigt {count} auf Lager — die Zahl des Shops, nicht Ihr Regalbestand", "La boutique affiche {count} en stock — le chiffre de la boutique, pas votre comptage", "Il negozio mostra {count} disponibili — il numero del negozio, non il tuo conteggio", "La tienda muestra {count} en stock — el número de la tienda, no tu recuento", "A loja mostra {count} em stock — o número da loja, não a sua contagem", "Магазин показывает {count} в наличии — это число магазина, не ваш пересчёт", "ストアの在庫表示 {count} — ストアの数字で、棚の数ではありません", "商店显示库存 {count} — 这是商店的数字，不是您的货架数量", "يعرض المتجر {count} في المخزون — رقم المتجر وليس عدّ رفّك", "स्टोर {count} स्टॉक में दिखाता है — यह स्टोर की संख्या है, आपकी शेल्फ़ गिनती नहीं"),
  "Stock not tracked in the store": L("Mağazada stok takibi kapalı", "Bestand wird im Shop nicht geführt", "Stock non suivi dans la boutique", "Magazzino non gestito nel negozio", "La tienda no controla el stock", "Stock não gerido na loja", "Магазин не ведёт учёт запаса", "ストアで在庫管理されていません", "商店未跟踪库存", "المتجر لا يتتبع المخزون", "स्टोर में स्टॉक ट्रैक नहीं होता"),
  "Stock is tracked on the parent product": L("Stok ana üründe takip ediliyor", "Bestand wird am Hauptprodukt geführt", "Le stock est suivi sur le produit parent", "Il magazzino è gestito sul prodotto principale", "El stock se controla en el producto principal", "O stock é gerido no produto principal", "Запас учитывается в основном товаре", "在庫は親商品で管理されています", "库存在父商品上跟踪", "يُتتبع المخزون على المنتج الرئيسي", "स्टॉक मुख्य उत्पाद पर ट्रैक होता है"),
  "Sale price in the store": L("Mağazadaki satış fiyatı", "Verkaufspreis im Shop", "Prix de vente dans la boutique", "Prezzo di vendita nel negozio", "Precio de venta en la tienda", "Preço de venda na loja", "Цена продажи в магазине", "ストアでの販売価格", "商店售价", "سعر البيع في المتجر", "स्टोर में बिक्री मूल्य"),
  "Picture shown from your store; not copied into NivaDesk": L("Resim mağazanızdan gösteriliyor; NivaDesk'e kopyalanmaz", "Bild aus Ihrem Shop angezeigt; nicht in NivaDesk kopiert", "Image affichée depuis votre boutique ; non copiée dans NivaDesk", "Immagine mostrata dal tuo negozio; non copiata in NivaDesk", "Imagen mostrada desde tu tienda; no se copia en NivaDesk", "Imagem mostrada da sua loja; não é copiada para o NivaDesk", "Изображение показано из вашего магазина; в NivaDesk не копируется", "画像はストアから表示しています。NivaDeskにはコピーされません", "图片来自您的商店；不会复制到 NivaDesk", "الصورة معروضة من متجرك؛ لا تُنسخ إلى NivaDesk", "चित्र आपके स्टोर से दिखाया गया; NivaDesk में कॉपी नहीं किया गया"),
  "Check: the same SKU is on another product in this store": L("Kontrol edin: aynı SKU bu mağazada başka bir üründe de var", "Prüfen: dieselbe SKU steht bei einem anderen Produkt dieses Shops", "À vérifier : le même SKU est sur un autre produit de cette boutique", "Verifica: lo stesso SKU è su un altro prodotto di questo negozio", "Revisa: el mismo SKU está en otro producto de esta tienda", "Verifique: o mesmo SKU está noutro produto desta loja", "Проверьте: тот же SKU есть у другого товара этого магазина", "確認：同じSKUがこのストアの別の商品にもあります", "请检查：此商店的另一个商品也有相同 SKU", "تحقق: رمز SKU نفسه موجود على منتج آخر في هذا المتجر", "जाँचें: यही SKU इस स्टोर के दूसरे उत्पाद पर भी है"),
  "Not stock (grouped or external product)": L("Stok değil (gruplu veya harici ürün)", "Kein Bestand (gruppiertes oder externes Produkt)", "Pas du stock (produit groupé ou externe)", "Non è magazzino (prodotto raggruppato o esterno)", "No es stock (producto agrupado o externo)", "Não é stock (produto agrupado ou externo)", "Не запас (сгруппированный или внешний товар)", "在庫ではありません（グループ商品または外部商品）", "非库存（组合或外部商品）", "ليس مخزونًا (منتج مجمّع أو خارجي)", "स्टॉक नहीं (समूहित या बाहरी उत्पाद)"),
  "No SKU in the store": L("Mağazada SKU yok", "Keine SKU im Shop", "Pas de SKU dans la boutique", "Nessuno SKU nel negozio", "Sin SKU en la tienda", "Sem SKU na loja", "В магазине нет SKU", "ストアにSKUがありません", "商店中没有 SKU", "لا يوجد SKU في المتجر", "स्टोर में SKU नहीं"),
  "This one item is here, on my shelf": L("Bu tek ürün burada, rafımda", "Dieses eine Stück ist hier, in meinem Regal", "Cet article unique est ici, sur mon étagère", "Questo pezzo unico è qui, sul mio scaffale", "Este artículo único está aquí, en mi estante", "Este artigo único está aqui, na minha prateleira", "Этот единственный предмет здесь, на моей полке", "この1点はここ、私の棚にあります", "这一件物品就在我的货架上", "هذه القطعة الوحيدة هنا على رفّي", "यह एक वस्तु यहाँ, मेरी शेल्फ़ पर है"),
  "Opening count (yours, typed by you)": L("Açılış sayımı (sizin, sizin yazdığınız)", "Anfangsbestand (Ihrer, von Ihnen eingegeben)", "Stock d'ouverture (le vôtre, saisi par vous)", "Conteggio iniziale (il tuo, inserito da te)", "Recuento inicial (el tuyo, escrito por ti)", "Contagem inicial (a sua, escrita por si)", "Начальный остаток (ваш, введённый вами)", "初期数量（あなたが入力するもの）", "期初数量（由您填写）", "العدّ الافتتاحي (عدّك أنت، تكتبه بنفسك)", "शुरुआती गिनती (आपकी, आपके द्वारा लिखी)"),
  "I have checked the candidates: bring this in as I chose": L("Adayları kontrol ettim: seçtiğim gibi içe al", "Ich habe die Kandidaten geprüft: so übernehmen, wie gewählt", "J'ai vérifié les candidats : importer comme je l'ai choisi", "Ho controllato i candidati: importa come ho scelto", "He revisado los candidatos: tráelo como elegí", "Verifiquei os candidatos: trazer como escolhi", "Я проверил варианты: перенести так, как я выбрал", "候補を確認しました：選んだとおりに取り込む", "我已检查候选项：按我的选择导入", "تحققت من المرشحين: استورده كما اخترت", "मैंने विकल्प जाँच लिए: जैसा चुना वैसा लाएँ"),
  "Cost: not entered — the store's price is a sale price, not what you paid.": L("Maliyet: girilmedi — mağazanın fiyatı satış fiyatıdır, ödediğiniz tutar değil.", "Kosten: nicht eingegeben — der Shoppreis ist ein Verkaufspreis, nicht Ihr Einkaufspreis.", "Coût : non saisi — le prix de la boutique est un prix de vente, pas ce que vous avez payé.", "Costo: non inserito — il prezzo del negozio è un prezzo di vendita, non quanto hai pagato.", "Coste: no introducido — el precio de la tienda es de venta, no lo que pagaste.", "Custo: não introduzido — o preço da loja é de venda, não o que pagou.", "Себестоимость: не указана — цена магазина — это цена продажи, а не то, что вы заплатили.", "原価：未入力 — ストアの価格は販売価格で、仕入れ値ではありません。", "成本：未填写 — 商店价格是售价，不是您的进价。", "التكلفة: غير مُدخلة — سعر المتجر سعر بيع وليس ما دفعته.", "लागत: दर्ज नहीं — स्टोर का मूल्य बिक्री मूल्य है, आपने जो चुकाया वह नहीं।"),
  "Choose what to do with each selected product.": L("Seçilen her ürün için ne yapılacağını seçin.", "Wählen Sie für jedes ausgewählte Produkt, was geschehen soll.", "Choisissez quoi faire de chaque produit sélectionné.", "Scegli cosa fare con ogni prodotto selezionato.", "Elige qué hacer con cada producto seleccionado.", "Escolha o que fazer com cada produto selecionado.", "Выберите действие для каждого выбранного товара.", "選択した各商品の扱いを選んでください。", "请为每个选中的商品选择操作。", "اختر ما يجب فعله بكل منتج محدد.", "हर चुने गए उत्पाद के लिए तय करें कि क्या करना है।"),
  "This product is not in the last read. Read the store again.": L("Bu ürün son okumada yok. Mağazayı yeniden okuyun.", "Dieses Produkt ist nicht im letzten Lesevorgang. Lesen Sie den Shop erneut.", "Ce produit n'est pas dans la dernière lecture. Relisez la boutique.", "Questo prodotto non è nell'ultima lettura. Rileggi il negozio.", "Este producto no está en la última lectura. Vuelve a leer la tienda.", "Este produto não está na última leitura. Leia a loja novamente.", "Этого товара нет в последнем чтении. Прочитайте магазин снова.", "この商品は前回の読み込みにありません。ストアを再読み込みしてください。", "此商品不在上次读取中。请重新读取商店。", "هذا المنتج ليس في آخر قراءة. اقرأ المتجر مجددًا.", "यह उत्पाद पिछली रीडिंग में नहीं है। स्टोर फिर से पढ़ें।"),
  "The last read is more than a day old. Read the store again.": L("Son okuma bir günden eski. Mağazayı yeniden okuyun.", "Der letzte Lesevorgang ist älter als einen Tag. Lesen Sie den Shop erneut.", "La dernière lecture date de plus d'un jour. Relisez la boutique.", "L'ultima lettura ha più di un giorno. Rileggi il negozio.", "La última lectura tiene más de un día. Vuelve a leer la tienda.", "A última leitura tem mais de um dia. Leia a loja novamente.", "Последнее чтение старше суток. Прочитайте магазин снова.", "前回の読み込みから1日以上経っています。ストアを再読み込みしてください。", "上次读取已超过一天。请重新读取商店。", "آخر قراءة أقدم من يوم. اقرأ المتجر مجددًا.", "पिछली रीडिंग एक दिन से पुरानी है। स्टोर फिर से पढ़ें।"),
  "The card made from this product earlier is archived or removed.": L("Bu üründen daha önce oluşturulan kart arşivlenmiş veya kaldırılmış.", "Die früher aus diesem Produkt erstellte Karte ist archiviert oder entfernt.", "La fiche créée plus tôt à partir de ce produit est archivée ou supprimée.", "La scheda creata prima da questo prodotto è archiviata o rimossa.", "La ficha creada antes desde este producto está archivada o eliminada.", "O cartão criado antes a partir deste produto está arquivado ou removido.", "Карточка, ранее созданная из этого товара, в архиве или удалена.", "以前この商品から作成したカードはアーカイブ済みか削除されています。", "之前由此商品创建的卡片已归档或删除。", "البطاقة التي أُنشئت سابقًا من هذا المنتج مؤرشفة أو محذوفة.", "इस उत्पाद से पहले बना कार्ड संग्रहित या हटाया जा चुका है।"),
  "A one-off card cannot stand for a product the store sells more than one of.": L("Tek parça kart, mağazanın birden fazla sattığı bir ürünü temsil edemez.", "Eine Einzelstück-Karte kann nicht für ein Produkt stehen, das der Shop mehrfach verkauft.", "Une fiche pièce unique ne peut pas représenter un produit que la boutique vend en plusieurs exemplaires.", "Una scheda pezzo unico non può rappresentare un prodotto che il negozio vende in più unità.", "Una ficha de pieza única no puede representar un producto del que la tienda vende más de uno.", "Um cartão de peça única não pode representar um produto que a loja vende em mais de uma unidade.", "Карточка единичного предмета не может обозначать товар, который магазин продаёт больше одного.", "1点物のカードは、ストアが複数販売する商品を表せません。", "单件卡片不能代表商店出售多件的商品。", "لا يمكن لبطاقة القطعة الواحدة أن تمثل منتجًا يبيع المتجر منه أكثر من قطعة.", "एकल वस्तु का कार्ड ऐसे उत्पाद के लिए नहीं हो सकता जिसे स्टोर एक से अधिक बेचता है।"),
  "A variation is brought in as a counted card.": L("Varyasyon sayılan kart olarak içe alınır.", "Eine Variante wird als gezählte Karte übernommen.", "Une variante est importée comme fiche comptée.", "Una variante viene importata come scheda a quantità.", "Una variación se trae como ficha contada.", "Uma variação é trazida como cartão contado.", "Вариант переносится как карточка с количеством.", "バリエーションは数量管理カードとして取り込まれます。", "变体以计数卡片导入。", "يُستورد المتغير كبطاقة معدودة.", "वेरिएशन को गिनती वाले कार्ड के रूप में लाया जाता है।"),
  "This one-off card is already linked to another product of this store.": L("Bu tek parça kart zaten bu mağazanın başka bir ürününe bağlı.", "Diese Einzelstück-Karte ist bereits mit einem anderen Produkt dieses Shops verknüpft.", "Cette fiche pièce unique est déjà liée à un autre produit de cette boutique.", "Questa scheda pezzo unico è già collegata a un altro prodotto di questo negozio.", "Esta ficha de pieza única ya está vinculada a otro producto de esta tienda.", "Este cartão de peça única já está ligado a outro produto desta loja.", "Эта карточка единичного предмета уже связана с другим товаром этого магазина.", "この1点物のカードは、このストアの別の商品に既にリンクされています。", "此单件卡片已关联到此商店的另一个商品。", "بطاقة القطعة الواحدة هذه مرتبطة بالفعل بمنتج آخر في هذا المتجر.", "यह एकल वस्तु कार्ड पहले से इस स्टोर के दूसरे उत्पाद से जुड़ा है।"),
  "Type how many you have on the shelf (0 is allowed), or confirm the one item is here.": L("Rafta kaç tane olduğunu yazın (0 olabilir) ya da tek ürünün burada olduğunu onaylayın.", "Geben Sie ein, wie viele im Regal liegen (0 ist erlaubt), oder bestätigen Sie, dass das eine Stück hier ist.", "Saisissez combien vous en avez sur l'étagère (0 est permis), ou confirmez que l'article unique est ici.", "Scrivi quanti ne hai sullo scaffale (0 è consentito) o conferma che il pezzo unico è qui.", "Escribe cuántos tienes en el estante (se permite 0) o confirma que el artículo único está aquí.", "Escreva quantos tem na prateleira (0 é permitido) ou confirme que o artigo único está aqui.", "Укажите, сколько у вас на полке (можно 0), или подтвердите, что единственный предмет здесь.", "棚にある数を入力する（0も可）か、1点物がここにあることを確認してください。", "请输入货架上的数量（可以为 0），或确认这件物品就在这里。", "اكتب عدد ما لديك على الرف (يُسمح بـ 0)، أو أكّد أن القطعة الوحيدة هنا.", "शेल्फ़ पर कितने हैं लिखें (0 चलेगा), या पुष्टि करें कि वह एक वस्तु यहाँ है।"),
  "This product is sold out or archived: choose it from that list.": L("Bu ürün tükenmiş veya arşivlenmiş: onu o listeden seçin.", "Dieses Produkt ist ausverkauft oder archiviert: wählen Sie es aus dieser Liste.", "Ce produit est épuisé ou archivé : choisissez-le dans cette liste.", "Questo prodotto è esaurito o archiviato: sceglilo da quell'elenco.", "Este producto está agotado o archivado: elígelo de esa lista.", "Este produto está esgotado ou arquivado: escolha-o nessa lista.", "Этот товар распродан или в архиве: выберите его из того списка.", "この商品は売り切れかアーカイブ済みです：そのリストから選んでください。", "此商品已售罄或已归档：请从该列表中选择。", "هذا المنتج نفدت كميته أو مؤرشف: اختره من تلك القائمة.", "यह उत्पाद स्टॉक से बाहर या संग्रहित है: इसे उसी सूची से चुनें।"),
  "Check the candidates and confirm before bringing this in.": L("İçe almadan önce adayları kontrol edip onaylayın.", "Prüfen Sie die Kandidaten und bestätigen Sie vor der Übernahme.", "Vérifiez les candidats et confirmez avant d'importer.", "Controlla i candidati e conferma prima di importare.", "Revisa los candidatos y confirma antes de traerlo.", "Verifique os candidatos e confirme antes de trazer.", "Проверьте варианты и подтвердите перед переносом.", "取り込む前に候補を確認して承認してください。", "导入前请检查候选项并确认。", "تحقق من المرشحين وأكّد قبل الاستيراد.", "लाने से पहले विकल्प जाँचें और पुष्टि करें।"),
  "A grouped or external product has no stock of its own.": L("Gruplu veya harici ürünün kendi stoğu yoktur.", "Ein gruppiertes oder externes Produkt hat keinen eigenen Bestand.", "Un produit groupé ou externe n'a pas de stock propre.", "Un prodotto raggruppato o esterno non ha magazzino proprio.", "Un producto agrupado o externo no tiene stock propio.", "Um produto agrupado ou externo não tem stock próprio.", "У сгруппированного или внешнего товара нет собственного запаса.", "グループ商品や外部商品には独自の在庫がありません。", "组合或外部商品没有自己的库存。", "المنتج المجمّع أو الخارجي ليس له مخزون خاص.", "समूहित या बाहरी उत्पाद का अपना कोई स्टॉक नहीं होता।"),
  "This product was chosen twice.": L("Bu ürün iki kez seçildi.", "Dieses Produkt wurde zweimal gewählt.", "Ce produit a été choisi deux fois.", "Questo prodotto è stato scelto due volte.", "Este producto se eligió dos veces.", "Este produto foi escolhido duas vezes.", "Этот товар выбран дважды.", "この商品は2回選択されています。", "此商品被选择了两次。", "تم اختيار هذا المنتج مرتين.", "यह उत्पाद दो बार चुना गया।"),
  "This store is not connected. Reconnect it in Settings ▸ Integrations.": L("Bu mağaza bağlı değil. Ayarlar ▸ Entegrasyonlar'dan yeniden bağlayın.", "Dieser Shop ist nicht verbunden. Verbinden Sie ihn unter Einstellungen ▸ Integrationen neu.", "Cette boutique n'est pas connectée. Reconnectez-la dans Réglages ▸ Intégrations.", "Questo negozio non è collegato. Ricollegalo in Impostazioni ▸ Integrazioni.", "Esta tienda no está conectada. Vuelve a conectarla en Ajustes ▸ Integraciones.", "Esta loja não está ligada. Volte a ligá-la em Definições ▸ Integrações.", "Этот магазин не подключён. Подключите его снова в Настройки ▸ Интеграции.", "このストアは接続されていません。「設定 ▸ 連携」で再接続してください。", "此商店未连接。请在 设置 ▸ 集成 中重新连接。", "هذا المتجر غير متصل. أعد ربطه من الإعدادات ▸ التكاملات.", "यह स्टोर कनेक्ट नहीं है। सेटिंग्स ▸ इंटीग्रेशन में फिर से कनेक्ट करें।"),
  "The store refused NivaDesk's keys. Reconnect WooCommerce.": L("Mağaza NivaDesk'in anahtarlarını reddetti. WooCommerce'i yeniden bağlayın.", "Der Shop hat die Schlüssel von NivaDesk abgelehnt. Verbinden Sie WooCommerce neu.", "La boutique a refusé les clés de NivaDesk. Reconnectez WooCommerce.", "Il negozio ha rifiutato le chiavi di NivaDesk. Ricollega WooCommerce.", "La tienda rechazó las claves de NivaDesk. Vuelve a conectar WooCommerce.", "A loja recusou as chaves do NivaDesk. Volte a ligar o WooCommerce.", "Магазин отклонил ключи NivaDesk. Переподключите WooCommerce.", "ストアがNivaDeskのキーを拒否しました。WooCommerceを再接続してください。", "商店拒绝了 NivaDesk 的密钥。请重新连接 WooCommerce。", "رفض المتجر مفاتيح NivaDesk. أعد ربط WooCommerce.", "स्टोर ने NivaDesk की कुंजियाँ अस्वीकार कीं। WooCommerce फिर से कनेक्ट करें।"),
  "The store asked NivaDesk to slow down. Try again in a few minutes.": L("Mağaza NivaDesk'ten yavaşlamasını istedi. Birkaç dakika sonra yeniden deneyin.", "Der Shop hat NivaDesk gebeten, langsamer zu werden. Versuchen Sie es in ein paar Minuten erneut.", "La boutique a demandé à NivaDesk de ralentir. Réessayez dans quelques minutes.", "Il negozio ha chiesto a NivaDesk di rallentare. Riprova tra qualche minuto.", "La tienda pidió a NivaDesk que fuera más despacio. Inténtalo de nuevo en unos minutos.", "A loja pediu ao NivaDesk para abrandar. Tente novamente dentro de alguns minutos.", "Магазин попросил NivaDesk замедлиться. Повторите через несколько минут.", "ストアからNivaDeskに速度を落とすよう求められました。数分後にもう一度お試しください。", "商店要求 NivaDesk 放慢速度。请几分钟后重试。", "طلب المتجر من NivaDesk الإبطاء. حاول مرة أخرى بعد بضع دقائق.", "स्टोर ने NivaDesk से धीमा होने को कहा। कुछ मिनट बाद फिर कोशिश करें।"),
  "The store's address cannot be used.": L("Mağazanın adresi kullanılamıyor.", "Die Adresse des Shops kann nicht verwendet werden.", "L'adresse de la boutique ne peut pas être utilisée.", "L'indirizzo del negozio non può essere usato.", "La dirección de la tienda no se puede usar.", "O endereço da loja não pode ser usado.", "Адрес магазина нельзя использовать.", "ストアのアドレスは使用できません。", "无法使用商店的地址。", "لا يمكن استخدام عنوان المتجر.", "स्टोर का पता उपयोग नहीं किया जा सकता।"),
  "The store could not be reached just now. Try again in a moment.": L("Mağazaya şu anda ulaşılamadı. Birazdan yeniden deneyin.", "Der Shop ist gerade nicht erreichbar. Versuchen Sie es gleich noch einmal.", "La boutique est injoignable pour le moment. Réessayez dans un instant.", "Il negozio non è raggiungibile ora. Riprova tra un momento.", "No se pudo contactar con la tienda ahora. Inténtalo de nuevo en un momento.", "Não foi possível contactar a loja agora. Tente novamente daqui a pouco.", "Магазин сейчас недоступен. Повторите чуть позже.", "現在ストアに接続できません。しばらくしてからもう一度お試しください。", "暂时无法连接商店。请稍后重试。", "تعذّر الوصول إلى المتجر الآن. حاول مرة أخرى بعد لحظة.", "अभी स्टोर तक नहीं पहुँच सके। थोड़ी देर में फिर कोशिश करें।")
};

/** The sentence in `language`, or "" when this table has none (the screen then asks E4's table, then the app's studioT). */
export function wooInventoryText(sentence: string, language: string): string {
  if (!Object.prototype.hasOwnProperty.call(WOO_INVENTORY_TEXT, sentence)) return "";
  const row = WOO_INVENTORY_TEXT[sentence];
  return Object.prototype.hasOwnProperty.call(row, language) ? row[language as Lang] : "";
}
