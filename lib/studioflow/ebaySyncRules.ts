// The eBay Preview list and the one-order Refresh (1 Oct 2026) — the pure half.
//
// This module imports nothing, so scripts/check-ebay-sync.mjs can compile and
// run it: which fields of a Preview row may reach the screen (the order's own
// number, dates, amount and states — never the buyer), which rows can be
// chosen (an order already in NivaDesk updates by itself and is not offered
// again), what a chosen-orders Import and a Refresh answered, in words, and the
// sentences in every app language. The sentences live HERE rather than in
// language.ts so this change touches no shared translation file; `ebaySyncText`
// is an own-property lookup (see ebayScreenRules.ebayTableText for why a bare
// `TABLE[key]` is not used) and the screen falls back to the app's studioT.

export type EbayPreviewRow = {
  orderId: string;
  orderNumber: string;
  createdAt: string;
  lastModifiedAt: string;
  total: string;
  currency: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  cancelled: boolean;
  marketplace: string;
  lineItems: number;
  alreadyImported: boolean;
};

export type EbayChosenImportResult = {
  ok: boolean;
  outcome: { created: number; updated: number; noop: number; held: number; skipped: number; failed: number; stale: number };
  complete: boolean;
  failures: string[];
  chosen: number;
  notFound: string[];
  skipped: Record<string, string>;
};

/** The server takes at most this many ids per Import call (MAX_SELECTED_IDS in ebayConnector.js). */
export const EBAY_CHOSEN_PER_CALL = 500;
const ORDER_ID = /^[0-9A-Za-z!_-]{1,80}$/;

const text = (value: unknown, max = 80) => (typeof value === "string" ? value.slice(0, max) : typeof value === "number" && Number.isFinite(value) ? String(value) : "");

/** Only the row's own fields reach the screen, whatever else an answer carries; one row per order. */
export function previewRowsOf(preview: unknown): EbayPreviewRow[] {
  const rows = preview && typeof preview === "object" && Array.isArray((preview as { rows?: unknown }).rows) ? (preview as { rows: unknown[] }).rows : [];
  const out: EbayPreviewRow[] = [];
  const seen = new Set<string>();
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const orderId = text(r.orderId);
    if (!ORDER_ID.test(orderId) || seen.has(orderId)) continue;
    seen.add(orderId);
    out.push({
      orderId,
      orderNumber: text(r.orderNumber) || orderId,
      createdAt: text(r.createdAt, 40),
      lastModifiedAt: text(r.lastModifiedAt, 40),
      total: text(r.total, 24),
      currency: text(r.currency, 3).toUpperCase(),
      paymentStatus: text(r.paymentStatus, 30).toLowerCase(),
      fulfillmentStatus: text(r.fulfillmentStatus, 30).toLowerCase(),
      cancelled: r.cancelled === true,
      marketplace: text(r.marketplace, 20).toUpperCase(),
      lineItems: Number.isFinite(Number(r.lineItems)) ? Math.max(0, Math.floor(Number(r.lineItems))) : 0,
      alreadyImported: r.alreadyImported === true
    });
  }
  return out;
}

export function previewOmittedOf(preview: unknown): number {
  const n = Number(preview && typeof preview === "object" ? (preview as { rowsOmitted?: unknown }).rowsOmitted : 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** An order already in NivaDesk is never offered again: it keeps updating on its own. */
export function selectableIds(rows: EbayPreviewRow[]): string[] {
  return rows.filter((row) => !row.alreadyImported).map((row) => row.orderId);
}

export function toggleChosen(chosen: string[], id: string, rows: EbayPreviewRow[]): string[] {
  if (!selectableIds(rows).includes(id)) return chosen.filter((c) => c !== id);
  return chosen.includes(id) ? chosen.filter((c) => c !== id) : [...chosen, id];
}

/** The ids an Import is asked for, in the list's order, never one that cannot be chosen. */
export function chosenInOrder(chosen: string[], rows: EbayPreviewRow[]): string[] {
  const allowed = new Set(selectableIds(rows));
  const wanted = new Set(chosen);
  return rows.map((row) => row.orderId).filter((id) => allowed.has(id) && wanted.has(id));
}

export function chunkIds(ids: string[], size = EBAY_CHOSEN_PER_CALL): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/** Several calls' answers as one (a choice of more than 500 is imported in turns). */
export function mergeChosenResults(results: EbayChosenImportResult[]): EbayChosenImportResult {
  const total = { created: 0, updated: 0, noop: 0, held: 0, skipped: 0, failed: 0, stale: 0 };
  const merged: EbayChosenImportResult = { ok: true, outcome: total, complete: true, failures: [], chosen: 0, notFound: [], skipped: {} };
  for (const r of results) {
    for (const key of Object.keys(total) as (keyof typeof total)[]) total[key] += Number(r?.outcome?.[key]) || 0;
    merged.ok = merged.ok && r?.ok !== false;
    merged.complete = merged.complete && r?.complete === true;
    merged.failures.push(...(Array.isArray(r?.failures) ? r.failures : []));
    merged.notFound.push(...(Array.isArray(r?.notFound) ? r.notFound : []));
    merged.chosen += Number(r?.chosen) || 0;
    Object.assign(merged.skipped, r?.skipped && typeof r.skipped === "object" ? r.skipped : {});
  }
  return merged;
}

/** Which chosen orders are now in NivaDesk: chosen minus failed, not found and skipped. */
export function landedIds(chosen: string[], result: EbayChosenImportResult): string[] {
  const out = new Set([...(result.failures || []), ...(result.notFound || []), ...Object.keys(result.skipped || {})]);
  return chosen.filter((id) => !out.has(id));
}

const PAYMENT_WORDS: Record<string, string> = { paid: "Paid", pending: "Not paid yet", failed: "Payment failed", fully_refunded: "Refunded", partially_refunded: "Partly refunded" };
const SHIPPING_WORDS: Record<string, string> = { fulfilled: "Shipped", in_progress: "Partly shipped", not_started: "Not shipped" };
const own = (table: Record<string, string>, key: string) => (Object.prototype.hasOwnProperty.call(table, key) ? table[key] : "");

/** The row's states as English words (translated by the screen), cancelled first. */
export function rowStatusWords(row: EbayPreviewRow): string[] {
  const words: string[] = [];
  if (row.cancelled) words.push("Cancelled");
  const payment = own(PAYMENT_WORDS, row.paymentStatus);
  if (payment) words.push(payment);
  const shipping = own(SHIPPING_WORDS, row.fulfillmentStatus);
  if (shipping) words.push(shipping);
  if (row.alreadyImported) words.push("Already in NivaDesk");
  return words;
}

/** What Refresh answered, in one sentence. Every engine word the callable can return is here. */
export function refreshOutcomeSentence(result: string): string {
  switch (String(result || "")) {
    case "updated": case "created": return "Order refreshed from eBay.";
    case "noop": case "duplicate": return "Already up to date.";
    case "stale": return "eBay has an older copy of this order; nothing was changed.";
    case "not_found": return "eBay no longer has this order.";
    default: return "This order could not be refreshed.";
  }
}

export function fillCounts(sentence: string, values: Record<string, number | string>): string {
  return sentence.replace(/\{(\w+)\}/g, (match, key: string) => (Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match));
}

type Lang = "Türkçe" | "Deutsch" | "Français" | "Italiano" | "Español (Spanish)" | "Português" | "Русский (Russian)" | "日本語 (Japanese)" | "中文 (Chinese)" | "العربية (Arabic)" | "हिन्दी (Hindi)";
export const EBAY_SYNC_LANGUAGES: Lang[] = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const L = (tr: string, de: string, fr: string, it: string, es: string, pt: string, ru: string, ja: string, zh: string, ar: string, hi: string): Record<Lang, string> =>
  ({ "Türkçe": tr, "Deutsch": de, "Français": fr, "Italiano": it, "Español (Spanish)": es, "Português": pt, "Русский (Russian)": ru, "日本語 (Japanese)": ja, "中文 (Chinese)": zh, "العربية (Arabic)": ar, "हिन्दी (Hindi)": hi });

/** Every English sentence the Preview list and the Refresh button print, in the eleven other app languages. */
export const EBAY_SYNC_TEXT: Record<string, Record<Lang, string>> = {
  "Choose the orders to bring in": L("İçe aktarılacak siparişleri seçin", "Bestellungen zum Übernehmen auswählen", "Choisissez les commandes à importer", "Scegli gli ordini da importare", "Elige los pedidos que quieres importar", "Escolha as encomendas a importar", "Выберите заказы для импорта", "取り込む注文を選択", "选择要导入的订单", "اختر الطلبات التي تريد استيرادها", "आयात करने के लिए ऑर्डर चुनें"),
  "Select all": L("Tümünü seç", "Alle auswählen", "Tout sélectionner", "Seleziona tutto", "Seleccionar todo", "Selecionar tudo", "Выбрать все", "すべて選択", "全选", "تحديد الكل", "सभी चुनें"),
  "Clear selection": L("Seçimi temizle", "Auswahl aufheben", "Effacer la sélection", "Annulla selezione", "Borrar selección", "Limpar seleção", "Снять выбор", "選択を解除", "清除选择", "مسح التحديد", "चयन हटाएँ"),
  "{count} selected": L("{count} seçildi", "{count} ausgewählt", "{count} sélectionnée(s)", "{count} selezionati", "{count} seleccionados", "{count} selecionadas", "Выбрано: {count}", "{count}件選択中", "已选 {count} 个", "تم تحديد {count}", "{count} चुने गए"),
  "Import selected": L("Seçilenleri içe aktar", "Ausgewählte importieren", "Importer la sélection", "Importa selezionati", "Importar seleccionados", "Importar selecionadas", "Импортировать выбранные", "選択した注文を取り込む", "导入所选订单", "استيراد المحدد", "चुने गए आयात करें"),
  "Importing…": L("İçe aktarılıyor…", "Wird importiert…", "Importation…", "Importazione…", "Importando…", "A importar…", "Импорт…", "取り込み中…", "正在导入…", "جارٍ الاستيراد…", "आयात हो रहा है…"),
  "Order": L("Sipariş", "Bestellung", "Commande", "Ordine", "Pedido", "Encomenda", "Заказ", "注文", "订单", "الطلب", "ऑर्डर"),
  "Date": L("Tarih", "Datum", "Date", "Data", "Fecha", "Data", "Дата", "日付", "日期", "التاريخ", "तारीख"),
  "Amount": L("Tutar", "Betrag", "Montant", "Importo", "Importe", "Valor", "Сумма", "金額", "金额", "المبلغ", "राशि"),
  "Status": L("Durum", "Status", "Statut", "Stato", "Estado", "Estado", "Статус", "ステータス", "状态", "الحالة", "स्थिति"),
  "Paid": L("Ödendi", "Bezahlt", "Payée", "Pagato", "Pagado", "Paga", "Оплачен", "支払い済み", "已付款", "مدفوع", "भुगतान हो गया"),
  "Not paid yet": L("Henüz ödenmedi", "Noch nicht bezahlt", "Pas encore payée", "Non ancora pagato", "Aún sin pagar", "Ainda não paga", "Ещё не оплачен", "未入金", "尚未付款", "غير مدفوع بعد", "अभी भुगतान नहीं हुआ"),
  "Payment failed": L("Ödeme başarısız", "Zahlung fehlgeschlagen", "Paiement échoué", "Pagamento non riuscito", "Pago fallido", "Pagamento falhou", "Оплата не прошла", "支払い失敗", "付款失败", "فشل الدفع", "भुगतान विफल"),
  "Refunded": L("İade edildi", "Erstattet", "Remboursée", "Rimborsato", "Reembolsado", "Reembolsada", "Возвращён", "返金済み", "已退款", "تم الاسترداد", "रिफ़ंड हो गया"),
  "Partly refunded": L("Kısmen iade edildi", "Teilweise erstattet", "Partiellement remboursée", "Rimborsato in parte", "Reembolsado en parte", "Parcialmente reembolsada", "Частично возвращён", "一部返金済み", "部分退款", "تم الاسترداد جزئيًا", "आंशिक रिफ़ंड"),
  "Cancelled": L("İptal edildi", "Storniert", "Annulée", "Annullato", "Cancelado", "Cancelada", "Отменён", "キャンセル済み", "已取消", "ملغى", "रद्द"),
  "Shipped": L("Gönderildi", "Versendet", "Expédiée", "Spedito", "Enviado", "Enviada", "Отправлен", "発送済み", "已发货", "تم الشحن", "भेज दिया गया"),
  "Partly shipped": L("Kısmen gönderildi", "Teilweise versendet", "Partiellement expédiée", "Spedito in parte", "Enviado en parte", "Parcialmente enviada", "Частично отправлен", "一部発送済み", "部分发货", "تم الشحن جزئيًا", "आंशिक रूप से भेजा गया"),
  "Not shipped": L("Gönderilmedi", "Nicht versendet", "Non expédiée", "Non spedito", "Sin enviar", "Não enviada", "Не отправлен", "未発送", "未发货", "لم يُشحن", "नहीं भेजा गया"),
  "Already in NivaDesk": L("NivaDesk'te zaten var", "Bereits in NivaDesk", "Déjà dans NivaDesk", "Già in NivaDesk", "Ya en NivaDesk", "Já no NivaDesk", "Уже в NivaDesk", "NivaDeskに取り込み済み", "已在 NivaDesk 中", "موجود بالفعل في NivaDesk", "पहले से NivaDesk में"),
  "{count} more orders are not listed. Choose a shorter period to see them.": L("{count} sipariş daha listelenmedi. Görmek için daha kısa bir dönem seçin.", "{count} weitere Bestellungen sind nicht aufgeführt. Wählen Sie einen kürzeren Zeitraum, um sie zu sehen.", "{count} autres commandes ne sont pas listées. Choisissez une période plus courte pour les voir.", "Altri {count} ordini non sono elencati. Scegli un periodo più breve per vederli.", "Hay {count} pedidos más que no se muestran. Elige un periodo más corto para verlos.", "Há mais {count} encomendas que não estão listadas. Escolha um período mais curto para as ver.", "Ещё {count} заказов не показаны. Выберите более короткий период, чтобы их увидеть.", "ほかに{count}件の注文は表示されていません。表示するには期間を短くしてください。", "还有 {count} 个订单未列出。请选择更短的时间段查看。", "هناك {count} طلبًا آخر غير معروض. اختر فترة أقصر لرؤيتها.", "{count} और ऑर्डर सूची में नहीं हैं। उन्हें देखने के लिए छोटी अवधि चुनें।"),
  "No orders in this period.": L("Bu dönemde sipariş yok.", "Keine Bestellungen in diesem Zeitraum.", "Aucune commande sur cette période.", "Nessun ordine in questo periodo.", "No hay pedidos en este periodo.", "Não há encomendas neste período.", "За этот период заказов нет.", "この期間の注文はありません。", "此期间没有订单。", "لا توجد طلبات في هذه الفترة.", "इस अवधि में कोई ऑर्डर नहीं।"),
  "Choose at least one order.": L("En az bir sipariş seçin.", "Wählen Sie mindestens eine Bestellung aus.", "Choisissez au moins une commande.", "Scegli almeno un ordine.", "Elige al menos un pedido.", "Escolha pelo menos uma encomenda.", "Выберите хотя бы один заказ.", "注文を1件以上選択してください。", "请至少选择一个订单。", "اختر طلبًا واحدًا على الأقل.", "कम से कम एक ऑर्डर चुनें।"),
  "Imported {created} · Updated {updated} · Already here {noop} · Skipped {skipped} · Failed {failed}": L("İçe aktarılan {created} · Güncellenen {updated} · Zaten var {noop} · Atlanan {skipped} · Başarısız {failed}", "Importiert {created} · Aktualisiert {updated} · Bereits vorhanden {noop} · Übersprungen {skipped} · Fehlgeschlagen {failed}", "Importées {created} · Mises à jour {updated} · Déjà présentes {noop} · Ignorées {skipped} · Échecs {failed}", "Importati {created} · Aggiornati {updated} · Già presenti {noop} · Saltati {skipped} · Non riusciti {failed}", "Importados {created} · Actualizados {updated} · Ya estaban {noop} · Omitidos {skipped} · Fallidos {failed}", "Importadas {created} · Atualizadas {updated} · Já existentes {noop} · Ignoradas {skipped} · Com falha {failed}", "Импортировано {created} · Обновлено {updated} · Уже есть {noop} · Пропущено {skipped} · Ошибки {failed}", "取り込み {created} · 更新 {updated} · 既存 {noop} · スキップ {skipped} · 失敗 {failed}", "已导入 {created} · 已更新 {updated} · 已存在 {noop} · 已跳过 {skipped} · 失败 {failed}", "تم استيراد {created} · تم تحديث {updated} · موجود بالفعل {noop} · تم تخطي {skipped} · فشل {failed}", "आयात {created} · अपडेट {updated} · पहले से मौजूद {noop} · छोड़े गए {skipped} · विफल {failed}"),
  "{count} chosen orders were not found on eBay.": L("Seçilen {count} sipariş eBay'de bulunamadı.", "{count} ausgewählte Bestellungen wurden bei eBay nicht gefunden.", "{count} commandes choisies sont introuvables sur eBay.", "{count} ordini scelti non sono stati trovati su eBay.", "{count} pedidos elegidos no se encontraron en eBay.", "{count} encomendas escolhidas não foram encontradas no eBay.", "{count} выбранных заказов не найдено на eBay.", "選択した注文のうち{count}件がeBayで見つかりませんでした。", "有 {count} 个所选订单在 eBay 上找不到。", "لم يتم العثور على {count} من الطلبات المختارة على eBay.", "चुने गए {count} ऑर्डर eBay पर नहीं मिले।"),
  "Refresh from eBay": L("eBay'den yenile", "Von eBay aktualisieren", "Actualiser depuis eBay", "Aggiorna da eBay", "Actualizar desde eBay", "Atualizar a partir do eBay", "Обновить из eBay", "eBayから更新", "从 eBay 刷新", "تحديث من eBay", "eBay से रीफ़्रेश करें"),
  "Refreshing…": L("Yenileniyor…", "Wird aktualisiert…", "Actualisation…", "Aggiornamento…", "Actualizando…", "A atualizar…", "Обновление…", "更新中…", "正在刷新…", "جارٍ التحديث…", "रीफ़्रेश हो रहा है…"),
  "Order refreshed from eBay.": L("Sipariş eBay'den yenilendi.", "Bestellung von eBay aktualisiert.", "Commande actualisée depuis eBay.", "Ordine aggiornato da eBay.", "Pedido actualizado desde eBay.", "Encomenda atualizada a partir do eBay.", "Заказ обновлён из eBay.", "eBayから注文を更新しました。", "已从 eBay 刷新订单。", "تم تحديث الطلب من eBay.", "ऑर्डर eBay से रीफ़्रेश हो गया।"),
  "Already up to date.": L("Zaten güncel.", "Bereits aktuell.", "Déjà à jour.", "Già aggiornato.", "Ya está al día.", "Já está atualizada.", "Уже актуально.", "すでに最新です。", "已是最新。", "محدَّث بالفعل.", "पहले से अद्यतित।"),
  "eBay has an older copy of this order; nothing was changed.": L("eBay'deki kopya daha eski; hiçbir şey değiştirilmedi.", "eBay hat eine ältere Version dieser Bestellung; nichts wurde geändert.", "eBay a une version plus ancienne de cette commande ; rien n'a été modifié.", "eBay ha una copia più vecchia di questo ordine; non è stato modificato nulla.", "eBay tiene una copia más antigua de este pedido; no se ha cambiado nada.", "O eBay tem uma cópia mais antiga desta encomenda; nada foi alterado.", "На eBay более старая версия этого заказа; ничего не изменено.", "eBay上のこの注文は古いコピーです。何も変更されていません。", "eBay 上此订单的副本较旧；未做任何更改。", "لدى eBay نسخة أقدم من هذا الطلب؛ لم يتم تغيير أي شيء.", "eBay पर इस ऑर्डर की पुरानी प्रति है; कुछ भी नहीं बदला गया।"),
  "eBay no longer has this order.": L("eBay'de bu sipariş artık yok.", "eBay hat diese Bestellung nicht mehr.", "eBay ne connaît plus cette commande.", "eBay non ha più questo ordine.", "eBay ya no tiene este pedido.", "O eBay já não tem esta encomenda.", "На eBay этого заказа больше нет.", "この注文はeBayにもうありません。", "eBay 上已没有此订单。", "لم يعد هذا الطلب موجودًا على eBay.", "यह ऑर्डर अब eBay पर नहीं है।"),
  "This order could not be refreshed.": L("Bu sipariş yenilenemedi.", "Diese Bestellung konnte nicht aktualisiert werden.", "Impossible d'actualiser cette commande.", "Impossibile aggiornare questo ordine.", "No se pudo actualizar este pedido.", "Não foi possível atualizar esta encomenda.", "Не удалось обновить этот заказ.", "この注文を更新できませんでした。", "无法刷新此订单。", "تعذّر تحديث هذا الطلب.", "यह ऑर्डर रीफ़्रेश नहीं हो सका।")
};

/** The sentence in `language`, or "" when this table has none (the screen then asks the app's studioT). */
export function ebaySyncText(sentence: string, language: string): string {
  if (!Object.prototype.hasOwnProperty.call(EBAY_SYNC_TEXT, sentence)) return "";
  const row = EBAY_SYNC_TEXT[sentence];
  return Object.prototype.hasOwnProperty.call(row, language) ? row[language as Lang] : "";
}
