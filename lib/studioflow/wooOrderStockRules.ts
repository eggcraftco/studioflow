// MC-4 (27 Oct 2026): a WooCommerce sale moves NivaDesk stock — the order page's "Stock" line and the card's flag,
// as pure rules (no imports, so scripts/check-woo-order-stock.mjs runs them as they are).
//
// What the server (getWooOrderStock) says per Woo line, in one sentence: reserved for this order (paid), taken from
// stock (Woo completed, or dispatched/delivered in NivaDesk), given back (cancelled/refunded/trashed/deleted before
// it left), oversold (another order holds or sold the piece — never negative), or "refunded after dispatch — did it
// come back?" (money is not goods: only the owner/admin's "Return to stock" puts it back). Two acts are the person's:
// "Reserve stock" (an order from before the link, a line that could not take stock, or an order paid again after its
// stock was given back) and "Return to stock". Nothing is written to the store.

export type WooStockCard = { id: string; number: string; name: string; trackingType: string; status: string };
export type WooStockLine = {
  lineId: string; title: string; sku: string; quantity: number; refundedQty: number;
  state: string; reservedQty: number; soldQty: number; returnedQty: number;
  blocked: { reason: string; atMs: number } | null; needsReturnDecision: boolean; attention: string;
  card: WooStockCard | null;
};
export type WooOrderStockView = {
  ok: boolean; enabled: boolean; preview: boolean; canEdit: boolean; canReturn: boolean;
  orderNumber: string; storeName: string; wooStatus: string; attention: string[]; lines: WooStockLine[];
};

const str = (v: unknown, max = 200) => (v === undefined || v === null ? "" : String(v).slice(0, max));
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** The server's answer, with only the fields this screen prints (anything else it sends is dropped here). */
export function wooOrderStockViewOf(answer: unknown): WooOrderStockView {
  const a = (answer && typeof answer === "object" ? answer : {}) as Record<string, unknown>;
  const lines = Array.isArray(a.lines) ? a.lines : [];
  return {
    ok: a.ok === true, enabled: a.enabled === true, preview: a.preview === true, canEdit: a.canEdit === true, canReturn: a.canReturn === true,
    orderNumber: str(a.orderNumber, 40), storeName: str(a.storeName, 120), wooStatus: str(a.wooStatus, 40),
    attention: Array.isArray(a.attention) ? a.attention.map((x) => str(x, 40)).filter(Boolean) : [],
    lines: lines.map((raw) => {
      const l = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      const c = (l.card && typeof l.card === "object" ? l.card : null) as Record<string, unknown> | null;
      const b = (l.blocked && typeof l.blocked === "object" ? l.blocked : null) as Record<string, unknown> | null;
      return {
        lineId: str(l.lineId, 24), title: str(l.title), sku: str(l.sku, 80), quantity: num(l.quantity), refundedQty: num(l.refundedQty),
        state: str(l.state, 40) || "none", reservedQty: num(l.reservedQty), soldQty: num(l.soldQty), returnedQty: num(l.returnedQty),
        blocked: b && str(b.reason, 40) ? { reason: str(b.reason, 40), atMs: num(b.atMs) } : null,
        needsReturnDecision: l.needsReturnDecision === true, attention: str(l.attention, 40),
        card: c ? { id: str(c.id, 80), number: str(c.number, 40), name: str(c.name, 160), trackingType: str(c.trackingType, 20), status: str(c.status, 30) } : null
      };
    }).filter((l) => l.lineId)
  };
}

export type WooStockTone = "info" | "success" | "warning" | "danger" | "muted";
/** One line's sentence (English source text; the screen translates it) and its values. */
export function wooStockLineSentence(line: WooStockLine): { sentence: string; tone: WooStockTone; values: Record<string, string | number> } {
  const card = line.card ? (line.card.number || line.card.name) : "";
  const values = { card, sold: line.soldQty, quantity: line.quantity, reserved: line.reservedQty, reason: line.blocked ? line.blocked.reason : "" };
  if (line.attention === "oversold") return { sentence: "Oversold — {card} is already reserved or sold for another order. Check.", tone: "danger", values };
  if (line.needsReturnDecision) return { sentence: "Refunded after dispatch — did {card} come back?", tone: "warning", values };
  if (line.blocked) return { sentence: "Could not take stock from {card}. Check.", tone: "danger", values };
  switch (line.state) {
    case "reserved": return { sentence: "Reserved {card} for this order", tone: "info", values };
    case "sold": case "sold_then_cancelled": return { sentence: "Took {card} from stock", tone: "success", values };
    case "partly_sold": return { sentence: "Took {sold} of {quantity} from {card}", tone: "success", values };
    case "released": return { sentence: "Restored — {card} is back on the shelf", tone: "muted", values };
    case "returned": return { sentence: "Returned — {card} is back in stock", tone: "muted", values };
    case "cancelled_before_stock": return { sentence: "Cancelled before it took stock", tone: "muted", values };
    case "before_link": return { sentence: "Ordered before {card} was linked — stock not touched", tone: "muted", values };
    case "paid_again_after_release": return { sentence: "Paid again after its stock was given back — reserve it again?", tone: "warning", values };
    case "waiting_payment": return { sentence: "Waiting for payment — stock not touched yet", tone: "muted", values };
    default:
      if (line.state.startsWith("would_")) return { sentence: "Not checked yet — {card}", tone: "muted", values };
      return { sentence: "Linked to {card}", tone: "muted", values };
  }
}

/** Which of the person's two acts this line offers, given the server's permissions. */
export function wooStockLineActions(view: WooOrderStockView, line: WooStockLine): { reserve: boolean; returned: boolean } {
  const reserve = view.canEdit && Boolean(line.card) && line.reservedQty === 0 && line.soldQty === 0
    && (line.state === "before_link" || line.state === "paid_again_after_release" || Boolean(line.blocked) || line.state.startsWith("would_") || line.state === "none");
  const returned = view.canReturn && line.soldQty - line.returnedQty > 0 && line.needsReturnDecision;
  return { reserve, returned };
}

/** The card's own flag (inventoryItems.wooStockAttention, written by the server), newest first. */
export function wooCardAttentionOf(item: unknown): Array<{ orderId: string; reason: string; orderNumber: string; storeName: string; atMs: number }> {
  const raw = item && typeof item === "object" ? (item as Record<string, unknown>).wooStockAttention : null;
  if (!raw || typeof raw !== "object") return [];
  return Object.entries(raw as Record<string, unknown>).map(([orderId, v]) => {
    const r = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    return { orderId, reason: str(r.reason, 40), orderNumber: str(r.orderNumber, 40), storeName: str(r.storeName, 120), atMs: num(r.atMs) };
  }).filter((x) => x.reason).sort((a, b) => b.atMs - a.atMs);
}

export function wooCardAttentionSentence(reason: string): string {
  if (reason === "oversold") return "Oversold on WooCommerce order #{order} — needs attention";
  if (reason === "returned_after_dispatch") return "WooCommerce order #{order} was refunded after dispatch — did it come back?";
  if (reason === "paid_again_after_release") return "WooCommerce order #{order} was paid again after its stock was given back";
  return "WooCommerce order #{order} could not take stock — check";
}

export const fillWooStock = (sentence: string, values: Record<string, string | number>) => sentence.replace(/\{(\w+)\}/g, (_, k) => (values[k] === undefined ? "" : String(values[k])));

type Lang = "Türkçe" | "Deutsch" | "Français" | "Italiano" | "Español (Spanish)" | "Português" | "Русский (Russian)" | "日本語 (Japanese)" | "中文 (Chinese)" | "العربية (Arabic)" | "हिन्दी (Hindi)";
const L = (tr: string, de: string, fr: string, it: string, es: string, pt: string, ru: string, ja: string, zh: string, ar: string, hi: string): Record<Lang, string> =>
  ({ "Türkçe": tr, "Deutsch": de, "Français": fr, "Italiano": it, "Español (Spanish)": es, "Português": pt, "Русский (Russian)": ru, "日本語 (Japanese)": ja, "中文 (Chinese)": zh, "العربية (Arabic)": ar, "हिन्दी (Hindi)": hi });

// Draft translations (27 Oct 2026, MC-4) — English is the source; owner review pending.
export const WOO_ORDER_STOCK_TEXT: Record<string, Record<Lang, string>> = {
  "Stock": L("Stok", "Bestand", "Stock", "Magazzino", "Stock", "Stock", "Склад", "在庫", "库存", "المخزون", "स्टॉक"),
  "Oversold — {card} is already reserved or sold for another order. Check.": L(
    "Fazla satıldı — {card} başka bir sipariş için zaten ayrılmış ya da satılmış. Kontrol edin.",
    "Überverkauft — {card} ist bereits für eine andere Bestellung reserviert oder verkauft. Bitte prüfen.",
    "Survendu — {card} est déjà réservé ou vendu pour une autre commande. À vérifier.",
    "Venduto due volte — {card} è già riservato o venduto per un altro ordine. Controlla.",
    "Sobreventa — {card} ya está reservado o vendido para otro pedido. Revísalo.",
    "Vendido a mais — {card} já está reservado ou vendido para outra encomenda. Verifique.",
    "Перепродано — {card} уже зарезервирован или продан по другому заказу. Проверьте.",
    "売り越し — {card} は別の注文で既に予約済みまたは販売済みです。確認してください。",
    "超卖 — {card} 已为另一订单预留或售出。请检查。",
    "بيع زائد — {card} محجوز أو مُباع بالفعل لطلب آخر. تحقّق من ذلك.",
    "ज़्यादा बिक्री — {card} पहले से किसी दूसरे ऑर्डर के लिए आरक्षित या बिक चुका है। जाँचें।"),
  "Refunded after dispatch — did {card} come back?": L(
    "Gönderimden sonra iade edildi — {card} geri geldi mi?", "Nach dem Versand erstattet — ist {card} zurückgekommen?", "Remboursé après l'envoi — {card} est-il revenu ?",
    "Rimborsato dopo la spedizione — {card} è tornato?", "Reembolsado tras el envío — ¿ha vuelto {card}?", "Reembolsado após o envio — {card} voltou?",
    "Возврат денег после отправки — {card} вернулся?", "発送後に返金 — {card} は戻ってきましたか？", "发货后已退款 — {card} 退回了吗？",
    "استُرد المبلغ بعد الشحن — هل عاد {card}؟", "भेजने के बाद रिफ़ंड — क्या {card} वापस आया?"),
  "Could not take stock from {card}. Check.": L(
    "{card} stoktan düşülemedi. Kontrol edin.", "Bestand von {card} konnte nicht entnommen werden. Bitte prüfen.", "Impossible de prélever {card} du stock. À vérifier.",
    "Impossibile prelevare {card} dal magazzino. Controlla.", "No se pudo tomar {card} del stock. Revísalo.", "Não foi possível retirar {card} do stock. Verifique.",
    "Не удалось списать {card} со склада. Проверьте.", "{card} を在庫から引き当てられませんでした。確認してください。", "无法从库存扣减 {card}。请检查。",
    "تعذّر أخذ {card} من المخزون. تحقّق من ذلك.", "{card} को स्टॉक से नहीं लिया जा सका। जाँचें।"),
  "Reserved {card} for this order": L(
    "{card} bu sipariş için ayrıldı", "{card} für diese Bestellung reserviert", "{card} réservé pour cette commande", "{card} riservato per questo ordine",
    "{card} reservado para este pedido", "{card} reservado para esta encomenda", "{card} зарезервирован для этого заказа", "{card} をこの注文用に予約しました",
    "已为此订单预留 {card}", "حُجز {card} لهذا الطلب", "{card} इस ऑर्डर के लिए आरक्षित"),
  "Took {card} from stock": L(
    "{card} stoktan düşüldü", "{card} aus dem Bestand entnommen", "{card} sorti du stock", "{card} prelevato dal magazzino", "{card} descontado del stock",
    "{card} retirado do stock", "{card} списан со склада", "{card} を在庫から出庫しました", "已从库存扣减 {card}", "أُخذ {card} من المخزون", "{card} स्टॉक से लिया गया"),
  "Took {sold} of {quantity} from {card}": L(
    "{card} stoğundan {quantity} adetin {sold} tanesi düşüldü", "{sold} von {quantity} aus {card} entnommen", "{sold} sur {quantity} prélevés de {card}",
    "{sold} di {quantity} prelevati da {card}", "{sold} de {quantity} tomados de {card}", "{sold} de {quantity} retirados de {card}", "Списано {sold} из {quantity} с {card}",
    "{card} から {quantity} 個中 {sold} 個を出庫", "已从 {card} 扣减 {quantity} 中的 {sold}", "أُخذ {sold} من {quantity} من {card}", "{card} से {quantity} में से {sold} लिए गए"),
  "Restored — {card} is back on the shelf": L(
    "Geri alındı — {card} yeniden rafta", "Zurückgegeben — {card} ist wieder im Regal", "Rétabli — {card} est de nouveau en rayon", "Ripristinato — {card} è di nuovo a scaffale",
    "Restaurado — {card} vuelve a estar en la estantería", "Reposto — {card} está de novo na prateleira", "Восстановлено — {card} снова на полке", "戻しました — {card} は棚に戻りました",
    "已恢复 — {card} 已回到货架", "أُعيد — {card} عاد إلى الرف", "बहाल — {card} फिर से शेल्फ़ पर है"),
  "Returned — {card} is back in stock": L(
    "İade alındı — {card} yeniden stokta", "Zurück — {card} ist wieder im Bestand", "Retourné — {card} est de nouveau en stock", "Reso — {card} è di nuovo in magazzino",
    "Devuelto — {card} vuelve a estar en stock", "Devolvido — {card} está de novo em stock", "Возвращено — {card} снова на складе", "返品 — {card} は在庫に戻りました",
    "已退回 — {card} 已回到库存", "أُرجع — {card} عاد إلى المخزون", "लौटाया — {card} फिर से स्टॉक में है"),
  "Cancelled before it took stock": L(
    "Stok düşülmeden iptal edildi", "Storniert, bevor Bestand entnommen wurde", "Annulé avant toute sortie de stock", "Annullato prima di prelevare dal magazzino",
    "Cancelado antes de tomar stock", "Cancelado antes de retirar stock", "Отменён до списания со склада", "在庫引当前にキャンセル", "在扣减库存前已取消", "أُلغي قبل الأخذ من المخزون", "स्टॉक लेने से पहले रद्द"),
  "Ordered before {card} was linked — stock not touched": L(
    "{card} bağlanmadan önce sipariş edildi — stoğa dokunulmadı", "Bestellt, bevor {card} verknüpft war — Bestand unverändert", "Commandé avant le lien avec {card} — stock inchangé",
    "Ordinato prima del collegamento con {card} — magazzino invariato", "Pedido antes de vincular {card} — stock sin cambios", "Encomendado antes de ligar {card} — stock inalterado",
    "Заказ сделан до привязки {card} — склад не изменён", "{card} のリンク前の注文 — 在庫は変更していません", "在关联 {card} 之前下单 — 库存未变动",
    "طُلب قبل ربط {card} — لم يُمسّ المخزون", "{card} जोड़ने से पहले का ऑर्डर — स्टॉक नहीं बदला"),
  "Paid again after its stock was given back — reserve it again?": L(
    "Stoğu geri verildikten sonra yeniden ödendi — tekrar ayrılsın mı?", "Nach Rückgabe des Bestands erneut bezahlt — wieder reservieren?", "Payé de nouveau après la remise en stock — réserver à nouveau ?",
    "Pagato di nuovo dopo la restituzione al magazzino — riservare di nuovo?", "Pagado otra vez tras devolver el stock — ¿reservar de nuevo?", "Pago de novo depois de o stock ser devolvido — reservar outra vez?",
    "Снова оплачен после возврата на склад — зарезервировать снова?", "在庫を戻した後に再度支払われました — もう一度予約しますか？", "库存退回后再次付款 — 要重新预留吗？",
    "دُفع مرة أخرى بعد إعادة المخزون — هل تحجزه مجددًا؟", "स्टॉक लौटाने के बाद फिर से भुगतान — फिर से आरक्षित करें?"),
  "Waiting for payment — stock not touched yet": L(
    "Ödeme bekleniyor — stoğa henüz dokunulmadı", "Warten auf Zahlung — Bestand noch unverändert", "En attente de paiement — stock pas encore touché", "In attesa di pagamento — magazzino non ancora toccato",
    "Esperando el pago — stock sin tocar", "A aguardar pagamento — stock ainda inalterado", "Ожидается оплата — склад пока не изменён", "支払い待ち — 在庫はまだ変更していません",
    "等待付款 — 库存尚未变动", "بانتظار الدفع — لم يُمسّ المخزون بعد", "भुगतान की प्रतीक्षा — स्टॉक अभी नहीं बदला"),
  "Not checked yet — {card}": L(
    "Henüz kontrol edilmedi — {card}", "Noch nicht geprüft — {card}", "Pas encore vérifié — {card}", "Non ancora verificato — {card}", "Aún sin comprobar — {card}", "Ainda não verificado — {card}",
    "Ещё не проверено — {card}", "未確認 — {card}", "尚未检查 — {card}", "لم يُتحقق بعد — {card}", "अभी जाँचा नहीं गया — {card}"),
  "Linked to {card}": L("{card} ile bağlı", "Mit {card} verknüpft", "Lié à {card}", "Collegato a {card}", "Vinculado a {card}", "Ligado a {card}", "Связан с {card}", "{card} にリンク", "已关联 {card}", "مرتبط بـ {card}", "{card} से जुड़ा"),
  "Reserve stock": L("Stok ayır", "Bestand reservieren", "Réserver le stock", "Riserva magazzino", "Reservar stock", "Reservar stock", "Зарезервировать", "在庫を予約", "预留库存", "احجز المخزون", "स्टॉक आरक्षित करें"),
  "Return to stock": L("Stoğa geri al", "Zurück in den Bestand", "Remettre en stock", "Rimetti in magazzino", "Devolver al stock", "Devolver ao stock", "Вернуть на склад", "在庫に戻す", "退回库存", "أعد إلى المخزون", "स्टॉक में वापस रखें"),
  "Confirm": L("Onayla", "Bestätigen", "Confirmer", "Conferma", "Confirmar", "Confirmar", "Подтвердить", "確認", "确认", "تأكيد", "पुष्टि करें"),
  "Cancel": L("Vazgeç", "Abbrechen", "Annuler", "Annulla", "Cancelar", "Cancelar", "Отмена", "キャンセル", "取消", "إلغاء", "रद्द करें"),
  "This will reserve {reserve}, take {sell} from stock and give back {release} on {card}.": L(
    "Bu işlem {card} için {reserve} ayıracak, {sell} stoktan düşecek ve {release} geri verecek.", "Damit werden auf {card} {reserve} reserviert, {sell} entnommen und {release} zurückgegeben.",
    "Cela réservera {reserve}, sortira {sell} du stock et rendra {release} sur {card}.", "Questo riserverà {reserve}, preleverà {sell} e restituirà {release} su {card}.",
    "Esto reservará {reserve}, tomará {sell} del stock y devolverá {release} en {card}.", "Isto vai reservar {reserve}, retirar {sell} do stock e devolver {release} em {card}.",
    "Будет зарезервировано {reserve}, списано {sell} и возвращено {release} по {card}.", "{card} で {reserve} を予約し、{sell} を出庫し、{release} を戻します。",
    "将在 {card} 上预留 {reserve}、扣减 {sell} 并退回 {release}。", "سيُحجز {reserve} ويُؤخذ {sell} من المخزون ويُعاد {release} على {card}.", "{card} पर {reserve} आरक्षित, {sell} स्टॉक से लिया और {release} लौटाया जाएगा।"),
  "Could not load the stock for this order.": L(
    "Bu siparişin stoğu yüklenemedi.", "Der Bestand für diese Bestellung konnte nicht geladen werden.", "Impossible de charger le stock de cette commande.", "Impossibile caricare il magazzino per questo ordine.",
    "No se pudo cargar el stock de este pedido.", "Não foi possível carregar o stock desta encomenda.", "Не удалось загрузить склад для этого заказа.", "この注文の在庫を読み込めませんでした。",
    "无法加载此订单的库存。", "تعذّر تحميل المخزون لهذا الطلب.", "इस ऑर्डर का स्टॉक लोड नहीं हो सका।"),
  "This could not be done.": L("Bu işlem yapılamadı.", "Das hat nicht geklappt.", "Impossible d'effectuer cette action.", "Operazione non riuscita.", "No se pudo hacer.", "Não foi possível fazer isto.", "Не удалось выполнить.", "実行できませんでした。", "无法完成此操作。", "تعذّر تنفيذ ذلك.", "यह नहीं हो सका।"),
  "NivaDesk never changes your WooCommerce stock — sell this piece elsewhere only after checking it here.": L(
    "NivaDesk WooCommerce stoğunuzu hiçbir zaman değiştirmez — bu parçayı başka bir kanalda satmadan önce burada kontrol edin.",
    "NivaDesk ändert Ihren WooCommerce-Bestand nie — verkaufen Sie dieses Stück woanders erst, nachdem Sie es hier geprüft haben.",
    "NivaDesk ne modifie jamais votre stock WooCommerce — ne vendez cette pièce ailleurs qu'après l'avoir vérifiée ici.",
    "NivaDesk non modifica mai il tuo magazzino WooCommerce — vendi questo pezzo altrove solo dopo averlo controllato qui.",
    "NivaDesk nunca cambia tu stock de WooCommerce — vende esta pieza en otro sitio solo después de comprobarla aquí.",
    "O NivaDesk nunca altera o seu stock WooCommerce — venda esta peça noutro lado só depois de a verificar aqui.",
    "NivaDesk никогда не меняет склад WooCommerce — продавайте эту вещь в другом месте только после проверки здесь.",
    "NivaDesk が WooCommerce の在庫を変更することはありません — 他の販路で売る前にここで確認してください。",
    "NivaDesk 从不更改您的 WooCommerce 库存 — 在其他渠道出售此物品前请先在此确认。",
    "لا يغيّر NivaDesk مخزون WooCommerce أبدًا — لا تبع هذه القطعة في مكان آخر قبل التحقق منها هنا.",
    "NivaDesk आपका WooCommerce स्टॉक कभी नहीं बदलता — इसे कहीं और बेचने से पहले यहाँ जाँच लें।"),
  "Oversold on WooCommerce order #{order} — needs attention": L(
    "WooCommerce siparişi #{order} ile fazla satıldı — ilgilenilmesi gerekiyor", "Überverkauft durch WooCommerce-Bestellung #{order} — bitte prüfen", "Survendu sur la commande WooCommerce n°{order} — à traiter",
    "Venduto due volte con l'ordine WooCommerce n. {order} — da controllare", "Sobreventa en el pedido de WooCommerce n.º {order} — requiere atención", "Vendido a mais na encomenda WooCommerce n.º {order} — requer atenção",
    "Перепродано в заказе WooCommerce №{order} — нужна проверка", "WooCommerce 注文 #{order} で売り越し — 要確認", "WooCommerce 订单 #{order} 超卖 — 需要处理",
    "بيع زائد في طلب WooCommerce رقم {order} — يحتاج إلى متابعة", "WooCommerce ऑर्डर #{order} पर ज़्यादा बिक्री — ध्यान दें"),
  "WooCommerce order #{order} was refunded after dispatch — did it come back?": L(
    "WooCommerce siparişi #{order} gönderimden sonra iade edildi — geri geldi mi?", "WooCommerce-Bestellung #{order} wurde nach dem Versand erstattet — ist es zurückgekommen?",
    "La commande WooCommerce n°{order} a été remboursée après l'envoi — est-elle revenue ?", "L'ordine WooCommerce n. {order} è stato rimborsato dopo la spedizione — è tornato?",
    "El pedido de WooCommerce n.º {order} se reembolsó tras el envío — ¿ha vuelto?", "A encomenda WooCommerce n.º {order} foi reembolsada após o envio — voltou?",
    "Заказ WooCommerce №{order} возвращён после отправки — товар вернулся?", "WooCommerce 注文 #{order} は発送後に返金されました — 戻ってきましたか？",
    "WooCommerce 订单 #{order} 在发货后退款 — 物品退回了吗？", "استُرد طلب WooCommerce رقم {order} بعد الشحن — هل عادت القطعة؟", "WooCommerce ऑर्डर #{order} भेजने के बाद रिफ़ंड हुआ — क्या वापस आया?"),
  "WooCommerce order #{order} was paid again after its stock was given back": L(
    "WooCommerce siparişi #{order} stoğu geri verildikten sonra yeniden ödendi", "WooCommerce-Bestellung #{order} wurde nach Rückgabe des Bestands erneut bezahlt",
    "La commande WooCommerce n°{order} a été payée à nouveau après la remise en stock", "L'ordine WooCommerce n. {order} è stato pagato di nuovo dopo la restituzione",
    "El pedido de WooCommerce n.º {order} se pagó otra vez tras devolver el stock", "A encomenda WooCommerce n.º {order} foi paga de novo após devolver o stock",
    "Заказ WooCommerce №{order} снова оплачен после возврата на склад", "WooCommerce 注文 #{order} は在庫を戻した後に再度支払われました", "WooCommerce 订单 #{order} 在库存退回后再次付款",
    "دُفع طلب WooCommerce رقم {order} مرة أخرى بعد إعادة المخزون", "WooCommerce ऑर्डर #{order} का स्टॉक लौटाने के बाद फिर भुगतान हुआ"),
  "WooCommerce order #{order} could not take stock — check": L(
    "WooCommerce siparişi #{order} stoktan düşülemedi — kontrol edin", "WooCommerce-Bestellung #{order} konnte keinen Bestand entnehmen — bitte prüfen", "La commande WooCommerce n°{order} n'a pas pu prendre le stock — à vérifier",
    "L'ordine WooCommerce n. {order} non ha potuto prelevare — controlla", "El pedido de WooCommerce n.º {order} no pudo tomar stock — revísalo", "A encomenda WooCommerce n.º {order} não conseguiu retirar stock — verifique",
    "Заказ WooCommerce №{order} не смог списать склад — проверьте", "WooCommerce 注文 #{order} は在庫を引き当てられませんでした — 確認してください", "WooCommerce 订单 #{order} 无法扣减库存 — 请检查",
    "تعذّر على طلب WooCommerce رقم {order} أخذ المخزون — تحقّق", "WooCommerce ऑर्डर #{order} स्टॉक नहीं ले सका — जाँचें")
};

export function wooOrderStockText(sentence: string, language: string): string {
  if (!Object.prototype.hasOwnProperty.call(WOO_ORDER_STOCK_TEXT, sentence)) return "";
  const row = WOO_ORDER_STOCK_TEXT[sentence];
  return Object.prototype.hasOwnProperty.call(row, language) ? row[language as Lang] : "";
}
