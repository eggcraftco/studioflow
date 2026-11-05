// Banking ▸ Payment links in the owner's reference design (4 Nov 2026): the page header, the history search and
// filter, the row menu, where a paid link's money went (SL-29 / SL-31), the "add it to the order" suggestion in
// the New payment link form, and the bell's "Payment received" (SL-30). Keyed by the English text; merged in
// language.ts with mergeMissingIntoTranslations (an existing row wins).
//
// Each row: [Türkçe, Deutsch, Français, Italiano, Español, Português, Русский, 日本語, 中文, العربية, हिन्दी].

import type { StudioLanguage } from "./language";

const ORDER: StudioLanguage[] = [
  "Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"
];

const ROWS: Record<string, string[]> = {
  "Create, manage and track payment requests in one place.": [
    "Ödeme isteklerini tek yerden oluşturun, yönetin ve takip edin.",
    "Zahlungsanforderungen an einem Ort erstellen, verwalten und verfolgen.",
    "Créez, gérez et suivez vos demandes de paiement au même endroit.",
    "Crea, gestisci e segui le richieste di pagamento in un unico posto.",
    "Crea, gestiona y sigue tus solicitudes de pago en un solo lugar.",
    "Crie, gira e acompanhe os pedidos de pagamento num só lugar.",
    "Создавайте платёжные запросы, управляйте ими и отслеживайте их в одном месте.",
    "支払いリクエストの作成・管理・追跡をひとつの場所で。",
    "在一个地方创建、管理和跟踪付款请求。",
    "أنشئ طلبات الدفع وأدِرها وتابعها من مكان واحد.",
    "भुगतान अनुरोध एक ही जगह बनाएँ, प्रबंधित करें और ट्रैक करें।"
  ],
  "Payment link history": [
    "Ödeme bağlantısı geçmişi", "Verlauf der Zahlungslinks", "Historique des liens de paiement", "Cronologia dei link di pagamento",
    "Historial de enlaces de pago", "Histórico de links de pagamento", "История платёжных ссылок", "支払いリンクの履歴", "付款链接记录",
    "سجل روابط الدفع", "भुगतान लिंक इतिहास"
  ],
  "Search payments": [
    "Ödemelerde ara", "Zahlungen suchen", "Rechercher des paiements", "Cerca pagamenti", "Buscar pagos", "Pesquisar pagamentos",
    "Поиск платежей", "支払いを検索", "搜索付款", "ابحث في المدفوعات", "भुगतान खोजें"
  ],
  "Any time": [
    "Her zaman", "Beliebiger Zeitraum", "N'importe quand", "Qualsiasi data", "Cualquier fecha", "Qualquer data", "За всё время",
    "すべての期間", "任何时间", "أي وقت", "कभी भी"
  ],
  "Clear filters": [
    "Filtreleri temizle", "Filter zurücksetzen", "Effacer les filtres", "Cancella filtri", "Borrar filtros", "Limpar filtros",
    "Сбросить фильтры", "フィルターをクリア", "清除筛选", "مسح عوامل التصفية", "फ़िल्टर हटाएँ"
  ],
  "More actions": [
    "Diğer işlemler", "Weitere Aktionen", "Plus d'actions", "Altre azioni", "Más acciones", "Mais ações", "Другие действия",
    "その他の操作", "更多操作", "إجراءات أخرى", "और कार्रवाइयाँ"
  ],
  "Cancel link": [
    "Bağlantıyı iptal et", "Link stornieren", "Annuler le lien", "Annulla link", "Cancelar enlace", "Cancelar link", "Отменить ссылку",
    "リンクを取り消す", "取消链接", "إلغاء الرابط", "लिंक रद्द करें"
  ],
  "Open order {reference}": [
    "{reference} siparişini aç", "Auftrag {reference} öffnen", "Ouvrir la commande {reference}", "Apri l'ordine {reference}",
    "Abrir pedido {reference}", "Abrir encomenda {reference}", "Открыть заказ {reference}", "注文 {reference} を開く", "打开订单 {reference}",
    "فتح الطلب {reference}", "ऑर्डर {reference} खोलें"
  ],
  "This order is in the Trash": [
    "Bu sipariş Çöp Kutusu'nda", "Dieser Auftrag ist im Papierkorb", "Cette commande est dans la corbeille", "Questo ordine è nel cestino",
    "Este pedido está en la papelera", "Esta encomenda está no lixo", "Этот заказ в корзине", "この注文はゴミ箱にあります", "该订单在回收站中",
    "هذا الطلب في سلة المحذوفات", "यह ऑर्डर ट्रैश में है"
  ],
  "Add to {order}": [
    "{order} siparişine ekle", "Zu {order} hinzufügen", "Ajouter à {order}", "Aggiungi a {order}", "Añadir a {order}", "Adicionar a {order}",
    "Добавить к {order}", "{order} に追加", "添加到 {order}", "أضف إلى {order}", "{order} में जोड़ें"
  ],
  "No payment links match your search.": [
    "Aramanızla eşleşen ödeme bağlantısı yok.", "Keine Zahlungslinks passen zu Ihrer Suche.", "Aucun lien de paiement ne correspond à votre recherche.",
    "Nessun link di pagamento corrisponde alla ricerca.", "Ningún enlace de pago coincide con tu búsqueda.", "Nenhum link de pagamento corresponde à pesquisa.",
    "Нет платёжных ссылок, подходящих под поиск.", "検索に一致する支払いリンクはありません。", "没有符合搜索条件的付款链接。",
    "لا توجد روابط دفع تطابق بحثك.", "आपकी खोज से कोई भुगतान लिंक मेल नहीं खाता।"
  ],
  "Added to the customer's open order": [
    "Müşterinin açık siparişine eklendi", "Dem offenen Auftrag des Kunden hinzugefügt", "Ajouté à la commande ouverte du client",
    "Aggiunto all'ordine aperto del cliente", "Añadido al pedido abierto del cliente", "Adicionado à encomenda em aberto do cliente",
    "Добавлено к открытому заказу клиента", "お客様の未完了の注文に追加しました", "已计入该客户的未结订单", "أُضيف إلى طلب العميل المفتوح",
    "ग्राहक के खुले ऑर्डर में जोड़ा गया"
  ],
  "This customer also has an unpaid order. If this payment was for it, merge the two orders in Orders.": [
    "Bu müşterinin ödenmemiş bir siparişi daha var. Bu ödeme onun içinse iki siparişi Siparişler'de birleştirin.",
    "Dieser Kunde hat noch einen offenen Auftrag. Wenn diese Zahlung dafür war, führen Sie die beiden Aufträge unter Aufträge zusammen.",
    "Ce client a aussi une commande impayée. Si ce paiement était pour elle, fusionnez les deux commandes dans Commandes.",
    "Questo cliente ha anche un ordine non pagato. Se il pagamento era per quello, unisci i due ordini in Ordini.",
    "Este cliente también tiene un pedido sin pagar. Si este pago era para él, combina los dos pedidos en Pedidos.",
    "Este cliente também tem uma encomenda por pagar. Se este pagamento era para ela, junte as duas encomendas em Encomendas.",
    "У этого клиента есть и неоплаченный заказ. Если платёж был за него, объедините два заказа в разделе «Заказы».",
    "このお客様には未払いの注文もあります。この支払いがその注文分なら、「注文」で2件を統合してください。",
    "该客户还有一个未付款的订单。如果这笔付款是为它支付的，请在“订单”中合并这两个订单。",
    "لدى هذا العميل طلب غير مدفوع أيضًا. إذا كانت هذه الدفعة له، فادمج الطلبين في الطلبات.",
    "इस ग्राहक का एक और अवैतनिक ऑर्डर है। अगर यह भुगतान उसके लिए था, तो ऑर्डर में दोनों ऑर्डर मर्ज करें।"
  ],
  "This customer still owes on an order. Add the link to it, so the payment counts there instead of opening a second order.": [
    "Bu müşterinin ödemesi kalan bir siparişi var. Bağlantıyı ona ekleyin; ödeme ikinci bir sipariş açmak yerine o siparişe işlensin.",
    "Dieser Kunde hat noch einen offenen Betrag auf einem Auftrag. Fügen Sie den Link dort hinzu, damit die Zahlung dort zählt, statt einen zweiten Auftrag anzulegen.",
    "Ce client doit encore un montant sur une commande. Ajoutez-y le lien pour que le paiement y soit compté au lieu d'ouvrir une seconde commande.",
    "Questo cliente deve ancora un importo su un ordine. Aggiungi il link a quell'ordine, così il pagamento conta lì invece di aprire un secondo ordine.",
    "Este cliente aún debe un importe de un pedido. Añade el enlace a ese pedido para que el pago cuente allí en lugar de abrir un segundo pedido.",
    "Este cliente ainda deve um valor numa encomenda. Adicione o link a ela, para o pagamento contar aí em vez de abrir uma segunda encomenda.",
    "Этот клиент ещё должен по заказу. Добавьте ссылку к нему — платёж засчитается там, а не откроет второй заказ.",
    "このお客様には残額のある注文があります。リンクをその注文に追加すると、2件目の注文を作らずにそこへ計上されます。",
    "该客户还有一个订单未付清。把链接添加到该订单，付款会计入该订单，而不会新开第二个订单。",
    "لا يزال على هذا العميل مبلغ في طلب. أضف الرابط إليه ليُحتسب الدفع هناك بدل فتح طلب ثانٍ.",
    "इस ग्राहक का एक ऑर्डर अभी बकाया है। लिंक उसी में जोड़ें, ताकि भुगतान दूसरा ऑर्डर खोलने के बजाय वहीं गिना जाए।"
  ],
  "When the customer pays, the payment is added to their unpaid order if they have exactly one; otherwise NivaDesk opens a new order with the details they enter.": [
    "Müşteri ödediğinde, tek bir ödenmemiş siparişi varsa ödeme ona eklenir; yoksa NivaDesk girdiği bilgilerle yeni bir sipariş açar.",
    "Wenn der Kunde zahlt, wird die Zahlung seinem offenen Auftrag hinzugefügt, falls er genau einen hat; sonst legt NivaDesk mit seinen Angaben einen neuen Auftrag an.",
    "Quand le client paie, le paiement est ajouté à sa commande impayée s'il en a exactement une ; sinon NivaDesk ouvre une nouvelle commande avec les informations saisies.",
    "Quando il cliente paga, il pagamento viene aggiunto al suo ordine non pagato se ne ha esattamente uno; altrimenti NivaDesk apre un nuovo ordine con i dati inseriti.",
    "Cuando el cliente pague, el pago se añadirá a su pedido sin pagar si tiene exactamente uno; si no, NivaDesk abrirá un pedido nuevo con los datos que introduzca.",
    "Quando o cliente pagar, o pagamento é adicionado à sua encomenda por pagar se tiver exatamente uma; caso contrário, o NivaDesk abre uma nova encomenda com os dados indicados.",
    "Когда клиент оплатит, платёж добавится к его неоплаченному заказу, если такой заказ ровно один; иначе NivaDesk откроет новый заказ с введёнными данными.",
    "お客様が支払うと、未払いの注文がちょうど1件ならその注文に追加されます。そうでなければ、入力された情報で NivaDesk が新しい注文を作成します。",
    "客户付款时，如果该客户恰好有一个未付款订单，付款会计入该订单；否则 NivaDesk 会用客户填写的信息新建订单。",
    "عندما يدفع العميل، تُضاف الدفعة إلى طلبه غير المدفوع إن كان لديه طلب واحد فقط؛ وإلا يفتح NivaDesk طلبًا جديدًا بالبيانات التي يدخلها.",
    "ग्राहक के भुगतान करने पर, अगर उसका ठीक एक अवैतनिक ऑर्डर है तो भुगतान उसमें जुड़ जाता है; नहीं तो NivaDesk दर्ज विवरणों से नया ऑर्डर खोलता है।"
  ],
  "Payment received": [
    "Ödeme alındı", "Zahlung erhalten", "Paiement reçu", "Pagamento ricevuto", "Pago recibido", "Pagamento recebido", "Платёж получен",
    "支払いを受け取りました", "已收到付款", "تم استلام الدفعة", "भुगतान प्राप्त हुआ"
  ]
};

export const PAYMENT_LINKS_BOARD_TRANSLATIONS: Record<string, Partial<Record<StudioLanguage, string>>> = Object.fromEntries(
  Object.entries(ROWS).map(([english, row]) => [english, Object.fromEntries(ORDER.map((language, i) => [language, row[i]]))])
);
