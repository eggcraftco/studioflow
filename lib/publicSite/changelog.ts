import type { StudioLanguage } from "@/lib/studioflow/language";

// ---------------------------------------------------------------------------
// NivaDesk public changelog — https://nivadesk.app/changelog (no sign-in)
//
// HOW TO ADD A RELEASE (for the team) — part of docs/release-checklist-platforms.md
// in the app repository ("Release notes" step), done for EVERY store release:
//   1. Add a new object to the TOP of CHANGELOG below (newest first), one per
//      platform family that shipped: `platformKey` "apple" (iPhone, iPad, Mac —
//      one App Store record) or "android"; "all" only for a release that went
//      to every platform at once.
//   2. Set `version` to the app's own version string (Apple
//      CFBundleShortVersionString / Android versionName) — the apps link to
//      #<platformKey>-<version>, so a mismatch lands on the top of the page.
//   3. `date` is the day the store release STARTED (a phased or staged rollout
//      says so in `highlight`), never the day it was submitted.
//   4. List only what reached that platform's users: not candidate work, not
//      features behind a server switch, not web-only changes. Copy from the
//      store notes that were actually entered (ASC What's New / Play notes).
//   5. Update CHANGELOG_LAST_UPDATED to the same date.
//   6. After the web deploy, read back https://nivadesk.app/changelog#<anchor>
//      and check the app's "NivaDesk updated — see what's new" link opens it.
//
// The web app has no version of its own (it is replaced on every deploy), so
// Settings ▸ About on the web shows the build it is running instead of an
// entry from this list.
//
// Release text is written in English (the source of truth). From 2.5.1 an entry
// can also carry the same lines in the site's other languages (`i18n`, same
// order and count as `changes`), copied from the store notes that were entered
// in each language; an entry without them reads in English everywhere. The page
// chrome (titles, tags, labels) is localized to all 12 languages automatically.
// ---------------------------------------------------------------------------

export type ChangeTag = "new" | "improved" | "fixed";

export type ChangelogChange = {
  tag: ChangeTag;
  text: string;
};

export type ChangelogPlatformKey = "apple" | "android" | "all";

export type ChangelogEntry = {
  version: string;
  /** Which app this entry is for; with `version` it makes the entry's anchor
   *  (#apple-2.1), which is what the apps' "see what's new" link opens. */
  platformKey: ChangelogPlatformKey;
  // Optional platform this release targets (e.g. "Android", "Mac & iPhone",
  // "Web"). Shown as a small pill so staggered per-platform releases read
  // clearly. Omit for a cross-platform entry.
  platform?: string;
  date: string;
  highlight?: string;
  changes: ChangelogChange[];
  /** The same release text in the site's other languages: `changes` in the
   *  same order and count as the English list (a list of another length is
   *  ignored and the entry reads in English). */
  i18n?: Partial<Record<StudioLanguage, { highlight?: string; changes: string[] }>>;
};

/** The entry's highlight and change lines in `language`, English where the entry has no text for it. */
export function localizedChangelogEntry(
  entry: ChangelogEntry,
  language: StudioLanguage | string | null | undefined,
): { highlight?: string; changes: ChangelogChange[] } {
  const local = entry.i18n?.[language as StudioLanguage];
  if (!local || local.changes.length !== entry.changes.length) return { highlight: entry.highlight, changes: entry.changes };
  return {
    highlight: local.highlight ?? entry.highlight,
    changes: entry.changes.map((change, index) => ({ tag: change.tag, text: local.changes[index] || change.text })),
  };
}

/** The entry's anchor on /changelog: "<platformKey>-<version>", e.g. "android-2.1". */
export function changelogAnchor(entry: Pick<ChangelogEntry, "platformKey" | "version">): string {
  return `${entry.platformKey}-${String(entry.version).trim()}`.toLowerCase().replace(/[^a-z0-9.-]/g, "-");
}

/** True for the newest entry of its platform (each platform's own "Latest"). */
export function isLatestForPlatform(entry: ChangelogEntry, list: ChangelogEntry[] = CHANGELOG): boolean {
  return list.find((item) => item.platformKey === entry.platformKey) === entry;
}

export const CHANGELOG_LAST_UPDATED = "14 November 2026";

// 2.5.1 was submitted to the three stores on 14 Nov 2026 and the owner asked (chat, 14 Nov) to show its notes on the site
// straight away, before approval. So the entries carry the SUBMISSION day and a highlight that says the version is in store
// review. When the stores release it: set each entry's date to that store's release day, drop or reword the highlight
// (all 12 languages), and set CHANGELOG_LAST_UPDATED.
export const CHANGELOG_251_DAY = "14 November 2026";
export const CHANGELOG_251_IN_REVIEW = "In store review since 14 November 2026. It reaches your device as an update once the store approves it.";

export const CHANGELOG: ChangelogEntry[] = [
  // 2.5.1 (Apple) — SUBMITTED 14 Nov 2026 (iOS + macOS, build 38), automatic release. In review when this was written (see CHANGELOG_251_DAY above). Word for word from the App Store "What's New" entered in App Store Connect
  // (~/Developer/nivadesk-deploy-2026-11-13/native-2.5.1/store/notes/kopyala/app-store/<locale>.txt), all 12 languages.
  {
    version: "2.5.1",
    platformKey: "apple",
    platform: "iPhone, iPad & Mac",
    date: CHANGELOG_251_DAY,
    highlight: CHANGELOG_251_IN_REVIEW,
    changes: [
      { tag: "fixed", text: "Invoices and estimates: no VAT line when your business is not VAT registered. The invoice also shows Paid and Balance due." },
      { tag: "fixed", text: "Documents carry your own workspace name; the sample business name is gone." },
      { tag: "improved", text: "Setup asks whether you are VAT registered, nothing is picked for you in advance, and the optional questions are folded away." },
      { tag: "new", text: "New order, quick form: you can add a price straight away (optional)." },
      { tag: "fixed", text: "Banking on iPhone: the page title and its buttons no longer squeeze together." },
      { tag: "improved", text: "Repair Intake appears only where repairs happen." },
    ],
    i18n: {
      "Türkçe": { highlight: "14 Kasım 2026'dan beri mağaza incelemesinde. Mağaza onayladığında cihazınıza güncelleme olarak gelir.", changes: [
        "Fatura ve teklifler: işletmeniz KDV mükellefi değilse KDV satırı çıkmaz. Faturada ayrıca Ödenen ve Kalan bakiye görünür.",
        "Belgelerde kendi çalışma alanınızın adı yazar; örnek işletme adı kaldırıldı.",
        "Kurulum, KDV mükellefi olup olmadığınızı sorar; hiçbir seçenek önceden işaretli gelmez ve isteğe bağlı sorular katlanmış durur.",
        "Yeni sipariş, hızlı form: fiyatı hemen ekleyebilirsiniz (isteğe bağlı).",
        "iPhone'da Banka: sayfa başlığı ve düğmeleri artık sıkışmıyor.",
        "Onarım Kabul yalnızca onarım yapılan iş yerlerinde görünür.",
      ] },
      "Deutsch": { highlight: "Seit dem 14. November 2026 in der Store-Prüfung. Das Update erreicht Ihr Gerät, sobald der Store es freigibt.", changes: [
        "Rechnungen und Kostenvoranschläge: keine Umsatzsteuerzeile, wenn Ihr Betrieb nicht umsatzsteuerpflichtig ist. Die Rechnung zeigt außerdem „Bezahlt“ und „Restbetrag“.",
        "Dokumente tragen den Namen Ihres eigenen Workspace; der Beispielname ist entfernt.",
        "Die Einrichtung fragt, ob Sie umsatzsteuerpflichtig sind, nichts ist vorausgewählt, und die optionalen Fragen sind eingeklappt.",
        "Neue Bestellung, Schnellformular: Sie können gleich einen Preis eintragen (optional).",
        "Banking auf dem iPhone: Seitentitel und Schaltflächen drängen sich nicht mehr zusammen.",
        "Die Reparaturannahme erscheint nur dort, wo repariert wird.",
      ] },
      "Français": { highlight: "En cours de validation par le store depuis le 14 novembre 2026. La mise à jour arrive sur votre appareil dès que le store l'approuve.", changes: [
        "Factures et devis : pas de ligne de TVA si votre entreprise n'est pas assujettie à la TVA. La facture affiche aussi « Payé » et « Solde dû ».",
        "Les documents portent le nom de votre propre espace de travail ; le nom d'entreprise d'exemple a disparu.",
        "La configuration demande si vous êtes assujetti à la TVA, rien n'est présélectionné et les questions facultatives sont repliées.",
        "Nouvelle commande, formulaire rapide : vous pouvez ajouter un prix tout de suite (facultatif).",
        "Banque sur iPhone : le titre de la page et ses boutons ne se serrent plus.",
        "La réception de réparation n'apparaît que là où l'on répare.",
      ] },
      "Italiano": { highlight: "In revisione presso lo store dal 14 novembre 2026. L'aggiornamento arriva sul tuo dispositivo appena lo store lo approva.", changes: [
        "Fatture e preventivi: nessuna riga IVA se la tua attività non è registrata ai fini IVA. La fattura mostra anche «Pagato» e «Saldo dovuto».",
        "I documenti riportano il nome del tuo spazio di lavoro; il nome di esempio non c'è più.",
        "La configurazione chiede se sei registrato ai fini IVA, nulla è preselezionato e le domande facoltative sono ripiegate.",
        "Nuovo ordine, modulo rapido: puoi aggiungere subito un prezzo (facoltativo).",
        "Banca su iPhone: il titolo della pagina e i suoi pulsanti non si schiacciano più.",
        "L'accettazione riparazione compare solo dove si fanno riparazioni.",
      ] },
      "Español (Spanish)": { highlight: "En revisión de la tienda desde el 14 de noviembre de 2026. La actualización llega a tu dispositivo en cuanto la tienda la aprueba.", changes: [
        "Facturas y presupuestos: sin línea de IVA si tu negocio no está registrado a efectos de IVA. La factura muestra además «Pagado» y «Saldo pendiente».",
        "Los documentos llevan el nombre de tu propio espacio de trabajo; el nombre de ejemplo ha desaparecido.",
        "La configuración pregunta si estás registrado a efectos de IVA, nada viene marcado de antemano y las preguntas opcionales quedan plegadas.",
        "Nuevo pedido, formulario rápido: puedes añadir un precio desde el principio (opcional).",
        "Banca en iPhone: el título de la página y sus botones ya no se aprietan.",
        "La recepción de reparación aparece solo donde se hacen reparaciones.",
      ] },
      "Português": { highlight: "Em revisão na loja desde 14 de novembro de 2026. A atualização chega ao seu dispositivo assim que a loja a aprovar.", changes: [
        "Faturas e orçamentos: sem linha de IVA quando o seu negócio não está registado para efeitos de IVA. A fatura mostra também «Pago» e «Saldo em dívida».",
        "Os documentos levam o nome do seu próprio espaço de trabalho; o nome de exemplo desapareceu.",
        "A configuração pergunta se está registado para efeitos de IVA, nada vem pré-selecionado e as perguntas opcionais ficam recolhidas.",
        "Novo pedido, formulário rápido: pode indicar logo um preço (opcional).",
        "Banco no iPhone: o título da página e os seus botões já não ficam apertados.",
        "A receção de reparação aparece apenas onde se fazem reparações.",
      ] },
      "Русский (Russian)": { highlight: "На проверке в магазине с 14 ноября 2026 г. Обновление появится на вашем устройстве, как только магазин его одобрит.", changes: [
        "Счета и сметы: строки НДС нет, если ваша мастерская не является плательщиком НДС. В счёте также показаны «Оплачено» и «К оплате».",
        "В документах стоит название вашего рабочего пространства; образец названия убран.",
        "Настройка спрашивает, являетесь ли вы плательщиком НДС; ничего не выбрано заранее, а необязательные вопросы свёрнуты.",
        "Новый заказ, быстрая форма: цену можно указать сразу (необязательно).",
        "Банк на iPhone: заголовок страницы и кнопки больше не сжимаются.",
        "Приём в ремонт появляется только там, где выполняют ремонт.",
      ] },
      "日本語 (Japanese)": { highlight: "2026年11月14日からストアの審査中です。ストアが承認すると、アップデートとしてお使いのデバイスに届きます。", changes: [
        "請求書と見積書：VAT（消費税）の課税事業者でない場合、税の行は表示されません。請求書には「支払済」と「残額」も表示されます。",
        "書類にはご自身のワークスペース名が入ります。サンプルの事業者名はなくなりました。",
        "セットアップで課税事業者かどうかを確認します。あらかじめ選択されている項目はなく、任意の質問は折りたたまれています。",
        "新規注文のクイックフォーム：価格をすぐに入力できます（任意）。",
        "iPhone のバンキング：ページのタイトルとボタンが窮屈にならなくなりました。",
        "修理受付は修理を行う工房にだけ表示されます。",
      ] },
      "中文 (Chinese)": { highlight: "自 2026 年 11 月 14 日起处于商店审核中。商店批准后，将以更新的形式推送到您的设备。", changes: [
        "发票和报价单：如果您不是增值税登记纳税人，则不显示增值税行。发票还会显示“已付”和“应付余额”。",
        "单据上显示您自己的工作区名称；示例商家名称已移除。",
        "设置向导会询问您是否为增值税登记纳税人，不再预先选中任何选项，可选问题默认折叠。",
        "新建订单快速表单：可以直接填写价格（可选）。",
        "iPhone 上的银行：页面标题和按钮不再挤在一起。",
        "维修接收只在做维修的工坊显示。",
      ] },
      "العربية (Arabic)": { highlight: "قيد مراجعة المتجر منذ 14 نوفمبر 2026. يصل التحديث إلى جهازك فور موافقة المتجر عليه.", changes: [
        "الفواتير وعروض الأسعار: لا يظهر سطر ضريبة القيمة المضافة إذا لم تكن منشأتك مسجّلة في ضريبة القيمة المضافة. وتعرض الفاتورة أيضًا «مدفوع» و«الرصيد المستحق».",
        "تحمل المستندات اسم مساحة عملك أنت؛ وأُزيل اسم المنشأة التجريبي.",
        "يسألك الإعداد هل أنت مسجّل في ضريبة القيمة المضافة، ولا يُحدَّد أي خيار مسبقًا، والأسئلة الاختيارية مطويّة.",
        "طلب جديد، النموذج السريع: يمكنك إضافة السعر مباشرةً (اختياري).",
        "الخدمات المصرفية على iPhone: لم يعد عنوان الصفحة وأزرارها تتزاحم.",
        "يظهر استلام الإصلاح فقط حيث تُجرى الإصلاحات.",
      ] },
      "हिन्दी (Hindi)": { highlight: "14 नवंबर 2026 से स्टोर की समीक्षा में है। स्टोर के स्वीकृत करते ही यह अपडेट के रूप में आपके डिवाइस पर आ जाएगा।", changes: [
        "इनवॉइस और अनुमान: अगर आपका व्यवसाय VAT में पंजीकृत नहीं है तो VAT की पंक्ति नहीं दिखती। इनवॉइस में “भुगतान किया” और “बकाया राशि” भी दिखते हैं।",
        "दस्तावेज़ों पर आपके अपने वर्कस्पेस का नाम रहता है; नमूना व्यवसाय नाम हटा दिया गया है।",
        "सेटअप पूछता है कि क्या आप VAT में पंजीकृत हैं, कुछ भी पहले से चुना हुआ नहीं होता, और वैकल्पिक प्रश्न मुड़े हुए रहते हैं।",
        "नया ऑर्डर, त्वरित फ़ॉर्म: आप तुरंत कीमत जोड़ सकते हैं (वैकल्पिक)।",
        "iPhone पर बैंकिंग: पेज का शीर्षक और उसके बटन अब आपस में नहीं सिकुड़ते।",
        "मरम्मत प्राप्ति केवल वहीं दिखती है जहाँ मरम्मत होती है।",
      ] },
    },
  },
  // 2.5.1 (Android) — SUBMITTED to Google Play 14 Nov 2026 (versionCode 26), automatic release. Word for word from the Play notes entered
  // (.../native-2.5.1/store/notes/play-notes-2.5.1.txt); 中文 is the same text in Simplified script (Play carries zh-TW).
  {
    version: "2.5.1",
    platformKey: "android",
    platform: "Android",
    date: CHANGELOG_251_DAY,
    highlight: CHANGELOG_251_IN_REVIEW,
    changes: [
      { tag: "fixed", text: "Home, Inventory and Orders on a phone: text and buttons no longer overlap." },
      { tag: "fixed", text: "Invoices and estimates: no VAT line when you are not VAT registered; Paid and Balance due on the invoice." },
      { tag: "fixed", text: "Documents carry your own workspace name." },
      { tag: "improved", text: "Setup asks whether you are VAT registered." },
      { tag: "new", text: "New order, quick form: optional price." },
    ],
    i18n: {
      "Türkçe": { highlight: "14 Kasım 2026'dan beri mağaza incelemesinde. Mağaza onayladığında cihazınıza güncelleme olarak gelir.", changes: [
        "Telefonda Ana Sayfa, Envanter ve Siparişler: yazılar ve düğmeler artık iç içe geçmiyor.",
        "Fatura ve teklifler: KDV mükellefi değilseniz KDV satırı yok; faturada Ödenen ve Kalan bakiye.",
        "Belgelerde kendi çalışma alanınızın adı yazar.",
        "Kurulum, KDV mükellefi olup olmadığınızı sorar.",
        "Yeni sipariş, hızlı form: isteğe bağlı fiyat.",
      ] },
      "Deutsch": { highlight: "Seit dem 14. November 2026 in der Store-Prüfung. Das Update erreicht Ihr Gerät, sobald der Store es freigibt.", changes: [
        "Start, Bestand und Bestellungen auf dem Telefon: Texte und Schaltflächen überlappen nicht mehr.",
        "Rechnungen und Kostenvoranschläge: keine Umsatzsteuerzeile, wenn Sie nicht umsatzsteuerpflichtig sind; „Bezahlt“ und „Restbetrag“ auf der Rechnung.",
        "Dokumente tragen den Namen Ihres Workspace.",
        "Die Einrichtung fragt, ob Sie umsatzsteuerpflichtig sind.",
        "Neue Bestellung, Schnellformular: optionaler Preis.",
      ] },
      "Français": { highlight: "En cours de validation par le store depuis le 14 novembre 2026. La mise à jour arrive sur votre appareil dès que le store l'approuve.", changes: [
        "Accueil, Inventaire et Commandes sur téléphone : les textes et les boutons ne se chevauchent plus.",
        "Factures et devis : pas de ligne de TVA si vous n'êtes pas assujetti à la TVA ; « Payé » et « Solde dû » sur la facture.",
        "Les documents portent le nom de votre espace de travail.",
        "La configuration demande si vous êtes assujetti à la TVA.",
        "Nouvelle commande, formulaire rapide : prix facultatif.",
      ] },
      "Italiano": { highlight: "In revisione presso lo store dal 14 novembre 2026. L'aggiornamento arriva sul tuo dispositivo appena lo store lo approva.", changes: [
        "Home, Inventario e Ordini sul telefono: testi e pulsanti non si sovrappongono più.",
        "Fatture e preventivi: nessuna riga IVA se non sei registrato ai fini IVA; «Pagato» e «Saldo dovuto» in fattura.",
        "I documenti riportano il nome del tuo spazio di lavoro.",
        "La configurazione chiede se sei registrato ai fini IVA.",
        "Nuovo ordine, modulo rapido: prezzo facoltativo.",
      ] },
      "Español (Spanish)": { highlight: "En revisión de la tienda desde el 14 de noviembre de 2026. La actualización llega a tu dispositivo en cuanto la tienda la aprueba.", changes: [
        "Inicio, Inventario y Pedidos en el teléfono: los textos y los botones ya no se solapan.",
        "Facturas y presupuestos: sin línea de IVA si no estás registrado a efectos de IVA; «Pagado» y «Saldo pendiente» en la factura.",
        "Los documentos llevan el nombre de tu espacio de trabajo.",
        "La configuración pregunta si estás registrado a efectos de IVA.",
        "Nuevo pedido, formulario rápido: precio opcional.",
      ] },
      "Português": { highlight: "Em revisão na loja desde 14 de novembro de 2026. A atualização chega ao seu dispositivo assim que a loja a aprovar.", changes: [
        "Início, Inventário e Pedidos no telemóvel: os textos e os botões já não se sobrepõem.",
        "Faturas e orçamentos: sem linha de IVA se não estiver registado para efeitos de IVA; «Pago» e «Saldo em dívida» na fatura.",
        "Os documentos levam o nome do seu espaço de trabalho.",
        "A configuração pergunta se está registado para efeitos de IVA.",
        "Novo pedido, formulário rápido: preço opcional.",
      ] },
      "Русский (Russian)": { highlight: "На проверке в магазине с 14 ноября 2026 г. Обновление появится на вашем устройстве, как только магазин его одобрит.", changes: [
        "Главная, Инвентарь и Заказы на телефоне: текст и кнопки больше не накладываются друг на друга.",
        "Счета и сметы: без строки НДС, если вы не плательщик НДС; в счёте — «Оплачено» и «К оплате».",
        "В документах стоит название вашего рабочего пространства.",
        "Настройка спрашивает, являетесь ли вы плательщиком НДС.",
        "Новый заказ, быстрая форма: цена по желанию.",
      ] },
      "日本語 (Japanese)": { highlight: "2026年11月14日からストアの審査中です。ストアが承認すると、アップデートとしてお使いのデバイスに届きます。", changes: [
        "スマートフォンのホーム・在庫・注文：文字とボタンが重ならなくなりました。",
        "請求書と見積書：課税事業者でない場合は税の行なし。請求書に「支払済」と「残額」を表示。",
        "書類にはご自身のワークスペース名が入ります。",
        "セットアップで課税事業者かどうかを確認します。",
        "新規注文のクイックフォーム：価格を入力可能（任意）。",
      ] },
      "العربية (Arabic)": { highlight: "قيد مراجعة المتجر منذ 14 نوفمبر 2026. يصل التحديث إلى جهازك فور موافقة المتجر عليه.", changes: [
        "الرئيسية والمخزون والطلبات على الهاتف: لم تعد النصوص والأزرار تتداخل.",
        "الفواتير وعروض الأسعار: لا سطر لضريبة القيمة المضافة إذا لم تكن مسجّلًا فيها؛ «مدفوع» و«الرصيد المستحق» في الفاتورة.",
        "تحمل المستندات اسم مساحة عملك.",
        "يسألك الإعداد هل أنت مسجّل في ضريبة القيمة المضافة.",
        "طلب جديد، النموذج السريع: سعر اختياري.",
      ] },
      "हिन्दी (Hindi)": { highlight: "14 नवंबर 2026 से स्टोर की समीक्षा में है। स्टोर के स्वीकृत करते ही यह अपडेट के रूप में आपके डिवाइस पर आ जाएगा।", changes: [
        "फ़ोन पर होम, इन्वेंटरी और ऑर्डर: टेक्स्ट और बटन अब एक-दूसरे पर नहीं चढ़ते।",
        "इनवॉइस और अनुमान: VAT में पंजीकृत न होने पर VAT की पंक्ति नहीं; इनवॉइस में “भुगतान किया” और “बकाया राशि”।",
        "दस्तावेज़ों पर आपके वर्कस्पेस का नाम रहता है।",
        "सेटअप पूछता है कि क्या आप VAT में पंजीकृत हैं।",
        "नया ऑर्डर, त्वरित फ़ॉर्म: वैकल्पिक कीमत।",
      ] },
      "中文 (Chinese)": { highlight: "自 2026 年 11 月 14 日起处于商店审核中。商店批准后，将以更新的形式推送到您的设备。", changes: [
        "手机上的主页、库存和订单：文字与按钮不再重叠。",
        "发票与报价单：若您不是增值税登记纳税人，则不显示增值税行；发票显示“已付”与“应付余额”。",
        "单据上显示您自己的工作区名称。",
        "设置向导会询问您是否为增值税登记纳税人。",
        "新建订单快速表单：可选填价格。",
      ] },
    },
  },
  // 2.5 (Apple) — RELEASED: Mac App Store 9 Nov 2026, App Store (iPhone & iPad) 11 Nov 2026 (store pages read 13 Nov); one entry, dated by the later day, both days in the highlight. Owner 7 Nov: 2.4.2 is skipped (never uploaded), everything goes in 2.5, so 2.5 lists 2.4.2's
  // own lines too. Word for word from the App Store "What's New" in store-metadata/app-store/en-US/release_notes.txt on
  // native-2.5-candidate-r14-2026-11-08 (r14 notes: + Files design; + Banking window; + Files share; + files open on your address, Inventory, Quick actions; no SMS, no ChatGPT/Claude; generator ~/Developer/nivadesk-deploy-2026-11-07/store-2.5/notes/build-notes-2.5.py), version 2.5 (37),
  // identical for iOS and macOS. Dates set by hand on 13 Nov 2026 because the stores released on different days; copy any wording change made in App Store Connect. The NivaDesk Trial is NOT listed: it is behind the membership switch (rule 4 above).
  {
    version: "2.5",
    platformKey: "apple",
    platform: "iPhone, iPad & Mac",
    date: "11 November 2026",
    highlight: "Up to 10 people on an order, payment links and refunds in the app, every reminder in one list with notifications on the Mac too, a shorter setup, fuller inventory listings, a smoother Mac window, ZIP downloads, a fuller DHL Express label form with Check with DHL, and product analytics now optional and off. Released to the Mac App Store on 9 November 2026 and to the App Store for iPhone and iPad on 11 November 2026.",
    changes: [
      { tag: "new", text: "Orders: assign an order to up to 10 people. Each of them sees the order with their own role." },
      { tag: "new", text: "Payment links: Banking ▸ Payment links lists every link with its status, on iPhone, iPad and Mac. Create a link for an order or a link on its own; the workspace owner can refund a payment." },
      { tag: "new", text: "Reminders: Notes ▸ Reminders shows note, order and calendar reminders together, soonest first. A note reminder can have a time or be All day, and the Calendar shows order reminders at their time." },
      { tag: "improved", text: "File links: the files you open and share use your workspace's own address, and your file address (for example files.example.com) once it is live." },
      { tag: "improved", text: "Reminder notifications open the note, order or Calendar day they are about, and the Mac now receives them too." },
      { tag: "improved", text: "Setup is shorter: after the setup questions you go straight into the app, with no starter checklist or guided tour." },
      { tag: "improved", text: "Inventory: each listing shows its channel and price, items that still need details are marked, and listing pictures, SKU and description come in with the item. You can add what you paid." },
      { tag: "improved", text: "Home: the Quick actions card only offers actions you can use." },
      { tag: "improved", text: "Orders on iPhone: the status strip opens folded and the order header folds as you scroll, so more of the order fits on the screen." },
      { tag: "improved", text: "Mac: resizing the window is smoother in every direction, the Work Time card fits a narrow column, and the account card at the bottom of the sidebar works like the web." },
      { tag: "improved", text: "Banking uses the whole window on Mac and iPad, with tidier buttons." },
      { tag: "fixed", text: "Order card names follow your workspace on every device." },
      { tag: "new", text: "Files: tick files and download them together as one ZIP, on iPhone, iPad and Mac." },
      { tag: "new", text: "Files: share a file straight from Files with your device's share options." },
      { tag: "new", text: "Files: every file in Client Files and the Library shows a picture, and a PDF shows its first page. A Library file opens large with its order and history; tap it to see the whole file in the app." },
      { tag: "improved", text: "DHL Express: the label form adds a phone country code, a currency list and, where DHL offers it, a courier pickup booked with the label. Before you book, the form tells you that NivaDesk cannot cancel the pickup." },
      { tag: "improved", text: "DHL Express customs: type the weight of one item and NivaDesk multiplies it by the quantity, and saving looks the HS code up in the official UK Trade Tariff. A line that was filled from the order or the inventory asks you to tick that you checked it." },
      { tag: "new", text: "Check with DHL: DHL checks the label details before you create the label. Nothing is created at DHL: no label, no waybill and no courier." },
      { tag: "improved", text: "Privacy: product analytics is now optional and off unless you switch it on (Settings ▸ Legal ▸ Privacy choices). The app no longer uses an advertising ID or ad measurement." },
      { tag: "fixed", text: "Storage use and limits read in the same units everywhere in the app." },
      { tag: "fixed", text: "Smaller fixes and translations." },
    ],
  },
  // 2.5 (Android) — RELEASED on Google Play 8 Nov 2026 (public Play page read 13 Nov: version 2.5, updated 8 Nov 2026). Word for word from the Play notes ~/Developer/nivadesk-deploy-2026-11-07/store-2.5/notes/play-notes-2.5.txt
  // (en-GB) for versionCode 25.
  {
    version: "2.5",
    platformKey: "android",
    platform: "Android",
    date: "8 November 2026",
    highlight: "Up to 10 people on an order, payment links and refunds in the app, every reminder in one list, Files with a picture for every file, a fuller DHL Express label form with Check with DHL, product analytics now optional and off, and the Mac app's colours. Released on Google Play on 8 November 2026.",
    changes: [
      { tag: "new", text: "Orders: assign an order to up to 10 people, each with their own role." },
      { tag: "new", text: "Payment links: Banking ▸ Payment links lists every link; create links, and the owner can refund." },
      { tag: "new", text: "Reminders: note, order and calendar reminders in one list." },
      { tag: "improved", text: "Files: a picture for every file (a PDF's first page), a Library page with order and history, ZIP." },
      { tag: "improved", text: "DHL Express: courier pickup, weight per item, HS codes and Check with DHL." },
      { tag: "improved", text: "Privacy: analytics optional and off; no advertising ID. Colours match the Mac app." },
    ],
  },
  // 2.4.1 (Apple, iPhone, iPad & Mac) — from the App Store "What's New" that was entered (en-GB; ~/Developer/nivadesk-deploy-2026-11-05/store-2.4.1/README.md,
  // identical for iOS and macOS) for native-2.4.1-candidate-2026-11-01 @5336c2245, build 35. Read back 6 Nov 2026 ~01:15Z from the public
  // App Store (no sign-in): iOS — itunes lookup gb version 2.4.1, currentVersionReleaseDate 2026-11-05T22:14:37Z, and the iPhone page's
  // version history "2.4.1 · Thu Nov 05 2026 22:14:37 GMT"; Mac — the apps.apple.com macOS page's version history "2.4.1 · Thu Nov 05 2026
  // 12:11:09 GMT", right after "2.3 · 29 Oct" (the macOS 2.4 build was withdrawn from review on 5 Nov and the same version turned into
  // 2.4.1, so the Mac went from 2.3 straight to 2.4.1 and got the 2.4 changes with it). Same What's New text on both pages. Both stores
  // released it on 5 November 2026 (Mac first, iPhone/iPad the same evening). The itunes lookup with entity=macSoftware still answered the
  // iOS 2.4 record (2.4, 2026-11-02T21:39:46Z, minimum OS 17.0 = the iOS minimum; the Mac page says macOS 14.0) — not a source for the Mac.
  {
    version: "2.4.1",
    platformKey: "apple",
    platform: "iPhone, iPad & Mac",
    date: "5 November 2026",
    highlight: "A security update for the app's database connection, plus confirming online bookings in the app. Released to the App Store for iPhone, iPad and Mac on 5 November 2026. On the Mac this is the first update after 2.3, so it also brings everything listed under 2.4.",
    changes: [
      { tag: "fixed", text: "Security update: the app's connection to its database now includes Google's latest Firebase security fix, which removes the certificates of a compromised certificate authority from the list the app trusts. We recommend updating on every iPhone, iPad and Mac you use." },
      { tag: "new", text: "Online booking: requests from your booking page show their status in Calendar, and you can confirm or decline them in the app, with an optional message to the customer." },
      { tag: "improved", text: "NivaDesk help: your conversation is kept on this device for 7 days, so you can pick it up again later." },
      { tag: "fixed", text: "Smaller fixes and translations." },
    ],
  },
  // 2.4.1 (Android) — from the Play notes that were entered (~/Developer/nivadesk-deploy-2026-11-05/store-2.4.1/play-notes-2.4.1.txt,
  // en-GB) for vc23 (5336c2245). Play Console notification "app update published" 5 Nov 2026 and the public Play page
  // "Updated on 5 Nov 2026", version 2.4.1 (managed publishing off, full rollout). No security line: the Firebase CA fix
  // concerns the Apple SDK only.
  {
    version: "2.4.1",
    platformKey: "android",
    platform: "Android",
    date: "5 November 2026",
    highlight: "Confirm or decline online bookings in the app. Released on Google Play on 5 November 2026.",
    changes: [
      { tag: "new", text: "Online booking: requests from your booking page show their status in Calendar, and you can confirm or decline them in the app, with an optional message to the customer." },
      { tag: "improved", text: "NivaDesk help: your conversation is kept on this device for 7 days." },
      { tag: "fixed", text: "Smaller fixes and translations." },
    ],
  },
  // 2.4 (Apple, iPhone & iPad) — from the App Store "What's New" that was entered, read back from the public App Store
  // record (itunes lookup, gb + us, 4 Nov 2026: version 2.4, currentVersionReleaseDate 2026-11-02T21:39:46Z; same text as
  // ~/Developer/nivadesk-deploy-2026-11-01/store-2.4/notes-2.4.md en-GB) for native-2.4-release-2026-11-01, build 34.
  // The macOS 2.4 build never shipped: it was withdrawn from review on 5 Nov 2026 and the Mac got these changes in 2.4.1 (see
  // the 2.4.1 entry above), so this entry stays "iPhone & iPad" — do not add the Mac here.
  {
    version: "2.4",
    platformKey: "apple",
    platform: "iPhone & iPad",
    date: "2 November 2026",
    highlight: "Orders open in the new Sections view, a delivery address for labels, and the Calendar. Released to the App Store for iPhone and iPad on 2 November 2026.",
    changes: [
      { tag: "new", text: "Orders: an order now opens in the new Sections view — one column of headings, all closed, each opening with a tap. The jump bar takes you straight to a heading, and Expand all / Collapse all opens or closes every section at once. Cards stays available as the second view, and the view you pick is your own and follows you to your other devices." },
      { tag: "new", text: "Order header: a status strip shows each production step, the days left to delivery and, if you can see finances, the order value with its profit and how much has been paid — in both views." },
      { tag: "new", text: "Delivery address: add or edit an order's delivery address under Shipping & Tracking, also on orders you created by hand; shipping labels use this address. \"Use customer address\" copies the customer's address in and puts a UK postcode and town into Postcode and City. View Only members see the address read only." },
      { tag: "new", text: "Calendar: a new Calendar in the menu for meetings, tasks, daily notes, work days and times you are unavailable — just for you, for people you choose or for the whole workspace. The Day, Week, Month and Agenda views also show your orders' due dates, and reminders arrive in the bell." },
      { tag: "new", text: "Google Calendar and Outlook: in Calendar, press Your other calendars to connect your own calendar and see its meetings beside your work — read only, and only you can see them. A new Calendar tile in Settings ▸ Integrations shows whether you are connected." },
      { tag: "new", text: "Cloud storage: the workspace owner can connect Google Drive in Settings ▸ Integrations ▸ Cloud storage; new order files are then saved in your Drive and opened from there (Pro and Team plans)." },
      { tag: "improved", text: "Sign-in: NivaDesk no longer keeps your password itself — your device's Password AutoFill can save it instead." },
      { tag: "fixed", text: "Smaller fixes and translations." },
    ],
  },
  // 2.4 (Android) — from the Play notes that were entered (~/Developer/nivadesk-deploy-2026-11-01/store-2.4/play-notes-2.4.txt,
  // en-GB) for native-2.4-release-2026-11-01 @7de677bde, vc22. Play Console: production "22 (2.4)", last published
  // 1 November 2026, managed publishing off (read 2 Nov 2026). Apple 2.4 was still in review: its entry follows on its
  // own release day (added 4 Nov, above).
  {
    version: "2.4",
    platformKey: "android",
    platform: "Android",
    date: "1 November 2026",
    highlight: "Orders open in the new Sections view, a delivery address for labels, and the Calendar. Released on Google Play on 1 November 2026.",
    changes: [
      { tag: "new", text: "Orders open in the new Sections view, with a jump bar, Expand all / Collapse all and a status strip in the header; Cards is still there." },
      { tag: "new", text: "Delivery address on Shipping & Tracking, with Use customer address." },
      { tag: "new", text: "Calendar: meetings, tasks, notes and reminders, private or shared; connect Google Calendar or Outlook, read only." },
      { tag: "new", text: "Cloud storage: owners can keep new order files in Google Drive (Pro/Team)." },
      { tag: "fixed", text: "Smaller fixes and translations." },
    ],
  },
  // 2.3 — from the store notes that were entered (App Store "What's New" read back from the live App Store page on
  // 29 Oct 2026; Play notes ~/Developer/nivadesk-deploy-2026-10-28/store/play-notes-2.3.txt) for native-unified-2026-10-28
  // @66ccd292, Apple 2.3 (33) / Android vc21. Server-gated or pilot features are left out on purpose.
  {
    version: "2.3",
    platformKey: "apple",
    platform: "iPhone, iPad & Mac",
    date: "29 October 2026",
    highlight: "Filter your orders by shop in one tap, Etsy orders with their own card, and Scan receipt from the app icon. Released to the App Store on 29 October 2026.",
    changes: [
      { tag: "new", text: "Orders: a platform bar above the list filters by shop in one tap (Etsy, WooCommerce, Shopify, By hand …), and each order carries a small badge for the shop it came from." },
      { tag: "new", text: "Etsy orders: the order page shows a \"From Etsy\" card with the items, personalisation (with Copy), buyer note and Etsy's own totals. Profit is marked as estimated until the postage cost is known." },
      { tag: "improved", text: "Etsy: when your plan is full, new Etsy orders wait safely and a banner tells you how many; once you make room, import them in one tap. The customer portal stays folded for Etsy orders, with automatic updates off." },
      { tag: "new", text: "Scan receipt: press and hold the app icon, or open Banking ▸ Receipts, to photograph a receipt or pick a photo or PDF. NivaDesk attaches it to the matching bank payment, or keeps it waiting until the payment arrives (Pro and Team plans with a connected bank)." },
      { tag: "improved", text: "WooCommerce: switch between your connected stores in Settings, and the Integrations card now shows them as connected." },
      { tag: "new", text: "Work time: owners and admins can correct or delete a timer session." },
      { tag: "fixed", text: "Open tracking goes straight to the carrier's own page — DHL, Royal Mail, Parcelforce, UPS, FedEx, Evri and DPD — never to a broken link." },
      { tag: "fixed", text: "iPad: the window controls no longer cover the banner, the menu title or the Settings logo. Files: tapping a file opens its preview again." },
      { tag: "fixed", text: "Smaller fixes and translations." },
    ],
  },
  {
    version: "2.3",
    platformKey: "android",
    platform: "Android",
    date: "28 October 2026",
    highlight: "Filter your orders by shop in one tap, Etsy orders with their own card, and Scan receipt. Released on Google Play on 28 October 2026 to everyone at once.",
    changes: [
      { tag: "new", text: "Orders: filter by shop in one tap; each order shows its shop badge." },
      { tag: "new", text: "Etsy orders show items, personalisation, buyer note and Etsy totals; profit is marked estimated until postage is known." },
      { tag: "new", text: "Scan receipt from the app icon or Banking ▸ Receipts (Pro and Team plans with a connected bank)." },
      { tag: "improved", text: "WooCommerce: switch between connected stores." },
      { tag: "new", text: "Work time: owners and admins can correct or delete sessions." },
      { tag: "fixed", text: "Open tracking goes to the carrier's own page." },
      { tag: "fixed", text: "Fixes and translations." },
    ],
  },
  // 2.2 — from the store notes entered for native-candidate-34-2026-10-22 (docs/store/release-2.2/notes-final.json,
  // §5 of notes-final.md). Server-gated or pilot features (customer inbox, DHL, payment links) are left out on purpose.
  // Apple: released to the App Store on 23 October 2026 (owner, 29 Oct; not readable from the public page, which lists
  // only the newest version).
  {
    version: "2.2",
    platformKey: "apple",
    platform: "iPhone, iPad & Mac",
    date: "23 October 2026",
    highlight: "Choose how your order list loads, a Getting started list that takes you to the real work, and all your notifications in one place. Released to the App Store on 23 October 2026.",
    changes: [
      { tag: "improved", text: "Orders: choose how the list loads — Load more, Page by page or Show all (10 to 100 per page). On iPad and Mac a folded list keeps a rail of order squares beside the open order." },
      { tag: "improved", text: "Getting started: each step opens the real first task and ticks itself off once you have done it." },
      { tag: "new", text: "Settings ▸ Notifications: all your notifications in one place. Owners can choose to be told when a member uploads a file or saves work time on an order assigned to them (off until you switch it on)." },
      { tag: "fixed", text: "Order profit counts every payment recorded on the order, with the same figures as on the web. The order PDF no longer takes VAT off twice, and a platform fee the shop did not report is marked as an estimate." },
      { tag: "improved", text: "Inventory: members without financial access see stock cost as hidden instead of 0." },
      { tag: "fixed", text: "On iPad and Mac, an order opened from a notification or from Getting started opens on the right card." },
      { tag: "new", text: "Files: select every file in a list at once, and drop files onto an order (iPad and Mac)." },
      { tag: "new", text: "Notes: see who a note is shared with." },
      { tag: "new", text: "Settings ▸ About: your version, a check for updates, and what's new after an update." },
      { tag: "improved", text: "Settings ▸ Integrations: separate ChatGPT and Claude cards." },
      { tag: "fixed", text: "Smaller fixes and translations." },
    ],
  },
  {
    version: "2.2",
    platformKey: "android",
    platform: "Android",
    date: "22 October 2026",
    highlight: "Choose how your order list loads, a Getting started list that takes you to the real work, and owner notices for members' uploads and work time. Released on Google Play on 22 October 2026 as a staged rollout to 20% of users, then to everyone on 28 October 2026.",
    changes: [
      { tag: "improved", text: "Orders: Load more, Page by page or Show all." },
      { tag: "improved", text: "Getting started opens the real first task and ticks itself off." },
      { tag: "new", text: "Settings ▸ Notifications: owners can be told when a member uploads a file or saves work time." },
      { tag: "fixed", text: "Order profit counts every payment, as on the web; unreported shop fees are estimated." },
      { tag: "improved", text: "Members without financial access see stock cost as hidden, not 0." },
      { tag: "fixed", text: "Team Access: Delete client files and Bank Spending now apply." },
      { tag: "new", text: "Files: select all, drop on an order, trash or restore several." },
    ],
  },
  // 2.1 — from the store notes that were entered (docs/store/release-2.1/:
  // app-store-whats-new.en-GB.txt, play-release-notes.en-GB.txt) for the code
  // tagged store-2.1-30-apple / store-2.1-vc18-android (3d690eeb). Server-gated
  // features (customer inbox, DHL, payment links, eBay inventory) are left out
  // on purpose: they are not on for everybody.
  {
    version: "2.1",
    platformKey: "apple",
    platform: "iPhone, iPad & Mac",
    date: "17 October 2026",
    highlight: "A new layout, team access that follows each member, and shared notes. Released to the App Store on 17 October 2026 as a phased release over seven days; you can update by hand in the App Store at any time.",
    changes: [
      { tag: "new", text: "New layout: a collapsible sidebar on iPad and Mac, a menu drawer on iPhone. Settings is under your name in the menu." },
      { tag: "improved", text: "Team roles: screens and notifications follow each member's current access; if a team change is refused, you see why." },
      { tag: "improved", text: "Improved privacy of finance information for team members." },
      { tag: "new", text: "Notes: share with a person from your member list. View Only members can read shared notes but not edit them." },
      { tag: "new", text: "Work Time: log a full or half day on an order, kept separate from timer hours. The owner can correct entries." },
      { tag: "improved", text: "New orders start from your default delivery time and keep the due date you pick." },
      { tag: "improved", text: "Dashboard rows now add up to Net Profit, with a Refunds row." },
      { tag: "new", text: "Live PDF export preview, and tracking email preview before sending." },
      { tag: "improved", text: "Upload progress for each file, with Cancel and Retry. Delete several client files at once." },
      { tag: "improved", text: "Clearer Plan & Access, including for workspaces billed through Shopify." },
      { tag: "improved", text: "If you use Sign in with Apple, deleting your account also disconnects your Apple ID from NivaDesk." },
      { tag: "fixed", text: "Better layouts on small screens, more translations and bug fixes." },
    ],
  },
  {
    version: "2.1",
    platformKey: "android",
    platform: "Android",
    date: "17 October 2026",
    highlight: "A new layout, team access that follows each member, and shared notes. Rolled out on Google Play from 17 October 2026, to everybody from 18 October.",
    changes: [
      { tag: "new", text: "New layout: sidebar on tablets, menu drawer on phones." },
      { tag: "improved", text: "Improved privacy of finance information for team members; screens and alerts follow each member's access." },
      { tag: "new", text: "Notes: share with a team member; View Only members can only read." },
      { tag: "new", text: "Work Time: log full or half days." },
      { tag: "improved", text: "Dashboard rows add up to Net Profit; new orders keep the date you pick." },
      { tag: "new", text: "PDF and tracking email previews; upload progress for each file." },
      { tag: "fixed", text: "Clearer Plan & Access, more translations, fixes." },
    ],
  },
  {
    version: "1.1",
    platformKey: "apple",
    platform: "Mac & iPhone",
    date: "5 July 2026",
    highlight: "Widgets arrive: your net profit and deliveries, right on the Home Screen and desktop.",
    changes: [
      { tag: "new", text: "Widgets for the iPhone Home Screen and Mac desktop: Net Profit (weekly, monthly or yearly, with trend), Monthly Net Profit month by month, and Deliveries at a glance." },
      { tag: "new", text: "Financial Breakdown on the dashboard: revenue, costs, fees, VAT and profit in one clear section." },
      { tag: "improved", text: "Custom “Remaining” amounts now count into the order value, profit and every dashboard total." },
      { tag: "improved", text: "Clearer VAT labels throughout, and auto-calculated fields are easier to read." },
      { tag: "new", text: "After sign-up, a reminder to verify your email now stays until your address is confirmed." },
      { tag: "fixed", text: "iPhone: long customer names no longer hide the order amount in lists." },
    ],
  },
  {
    version: "0.1.7",
    platformKey: "android",
    platform: "Android",
    date: "5 July 2026",
    highlight: "Home-screen widgets and a full Financial Breakdown.",
    changes: [
      { tag: "new", text: "Home-screen widgets: Net Profit (weekly, monthly or yearly — switch the period right on the widget), Monthly Net Profit month by month, and Deliveries." },
      { tag: "new", text: "Financial Breakdown on the dashboard: revenue, costs, fees, VAT and profit in one clear section." },
      { tag: "improved", text: "Custom “Remaining” amounts now count into the order value, profit and every dashboard total." },
      { tag: "improved", text: "Clearer VAT labels throughout, and auto-calculated fields are easier to read." },
      { tag: "improved", text: "Chart tooltips now show comparison-year values." },
      { tag: "fixed", text: "Phone: tapping the logo returns to the order list, and long names no longer hide amounts." },
    ],
  },
  {
    version: "0.1.6",
    platformKey: "android",
    platform: "Android",
    date: "2 July 2026",
    highlight: "Clearer email verification and a tidier default order layout.",
    changes: [
      { tag: "new", text: "After sign-up, a reminder to verify your email now stays until your address is confirmed — with one-tap resend — so your account stays active." },
      { tag: "improved", text: "New orders open with a cleaner default card layout, with the Production Status card shown by default." },
    ],
  },
  {
    version: "0.1.3",
    platformKey: "all",
    date: "June 2026",
    highlight: "Welcome to NivaDesk: this is our first release, and we're just getting started.",
    changes: [
      { tag: "new", text: "First release of NivaDesk: run your studio, orders, client files, tasks and team from one place across Mac, iPhone, iPad, Android and web." },
      { tag: "improved", text: "NivaDesk is under active development. We're improving it continuously and listening to early feedback." },
      { tag: "new", text: "From here on, the specific new features, improvements and fixes in each update will be listed on this page." },
    ],
  },
];

// --- Localized page chrome -------------------------------------------------

type ChangelogLabels = {
  eyebrow: string;
  title: string;
  intro: string;
  latest: string;
  versionWord: string;
  lastUpdated: string;
  tags: Record<ChangeTag, string>;
};

const FALLBACK: ChangelogLabels = {
  eyebrow: "Product updates",
  title: "What's new in NivaDesk",
  intro: "Every release of NivaDesk, with what changed and when. Newest updates appear first.",
  latest: "Latest",
  versionWord: "Version",
  lastUpdated: "Last updated",
  tags: { new: "New", improved: "Improved", fixed: "Fixed" },
};

const LABELS: Partial<Record<StudioLanguage, ChangelogLabels>> = {
  Türkçe: {
    eyebrow: "Ürün güncellemeleri",
    title: "NivaDesk'te neler yeni",
    intro: "NivaDesk'in her sürümü; nelerin ne zaman değiştiğiyle birlikte. En yeni güncellemeler en üstte.",
    latest: "En yeni",
    versionWord: "Sürüm",
    lastUpdated: "Son güncelleme",
    tags: { new: "Yeni", improved: "İyileştirildi", fixed: "Düzeltildi" },
  },
  Deutsch: {
    eyebrow: "Produkt-Updates",
    title: "Was ist neu in NivaDesk",
    intro: "Jede Version von NivaDesk mit Änderungen und Datum. Die neuesten Updates stehen oben.",
    latest: "Neueste",
    versionWord: "Version",
    lastUpdated: "Zuletzt aktualisiert",
    tags: { new: "Neu", improved: "Verbessert", fixed: "Behoben" },
  },
  Français: {
    eyebrow: "Mises à jour du produit",
    title: "Nouveautés de NivaDesk",
    intro: "Chaque version de NivaDesk, avec les changements et la date. Les dernières mises à jour en premier.",
    latest: "Dernière",
    versionWord: "Version",
    lastUpdated: "Dernière mise à jour",
    tags: { new: "Nouveau", improved: "Amélioré", fixed: "Corrigé" },
  },
  Italiano: {
    eyebrow: "Aggiornamenti del prodotto",
    title: "Novità di NivaDesk",
    intro: "Ogni versione di NivaDesk, con cosa è cambiato e quando. Gli aggiornamenti più recenti in alto.",
    latest: "Più recente",
    versionWord: "Versione",
    lastUpdated: "Ultimo aggiornamento",
    tags: { new: "Novità", improved: "Migliorato", fixed: "Corretto" },
  },
  "Español (Spanish)": {
    eyebrow: "Novedades del producto",
    title: "Novedades de NivaDesk",
    intro: "Cada versión de NivaDesk, con lo que cambió y cuándo. Las actualizaciones más recientes aparecen primero.",
    latest: "Más reciente",
    versionWord: "Versión",
    lastUpdated: "Última actualización",
    tags: { new: "Nuevo", improved: "Mejorado", fixed: "Corregido" },
  },
  Português: {
    eyebrow: "Atualizações do produto",
    title: "Novidades do NivaDesk",
    intro: "Cada versão do NivaDesk, com o que mudou e quando. As atualizações mais recentes aparecem primeiro.",
    latest: "Mais recente",
    versionWord: "Versão",
    lastUpdated: "Última atualização",
    tags: { new: "Novo", improved: "Melhorado", fixed: "Corrigido" },
  },
  "Русский (Russian)": {
    eyebrow: "Обновления продукта",
    title: "Что нового в NivaDesk",
    intro: "Каждая версия NivaDesk с описанием изменений и датой. Новые обновления: сверху.",
    latest: "Последнее",
    versionWord: "Версия",
    lastUpdated: "Последнее обновление",
    tags: { new: "Новое", improved: "Улучшено", fixed: "Исправлено" },
  },
  "日本語 (Japanese)": {
    eyebrow: "製品アップデート",
    title: "NivaDesk の新機能",
    intro: "NivaDesk の各リリースと、その変更内容・日付。最新のアップデートが上に表示されます。",
    latest: "最新",
    versionWord: "バージョン",
    lastUpdated: "最終更新日",
    tags: { new: "新機能", improved: "改善", fixed: "修正" },
  },
  "中文 (Chinese)": {
    eyebrow: "产品更新",
    title: "NivaDesk 新功能",
    intro: "NivaDesk 的每个版本，及其更改内容和日期。最新更新显示在最上方。",
    latest: "最新",
    versionWord: "版本",
    lastUpdated: "最后更新",
    tags: { new: "新增", improved: "改进", fixed: "修复" },
  },
  "العربية (Arabic)": {
    eyebrow: "تحديثات المنتج",
    title: "ما الجديد في NivaDesk",
    intro: "كل إصدار من NivaDesk مع ما تغيّر وتاريخه. تظهر أحدث التحديثات أولاً.",
    latest: "الأحدث",
    versionWord: "الإصدار",
    lastUpdated: "آخر تحديث",
    tags: { new: "جديد", improved: "تحسين", fixed: "إصلاح" },
  },
  "हिन्दी (Hindi)": {
    eyebrow: "उत्पाद अपडेट",
    title: "NivaDesk में नया क्या है",
    intro: "NivaDesk का हर रिलीज़, क्या बदला और कब, के साथ। सबसे नए अपडेट सबसे ऊपर दिखते हैं।",
    latest: "नवीनतम",
    versionWord: "संस्करण",
    lastUpdated: "अंतिम अपडेट",
    tags: { new: "नया", improved: "बेहतर", fixed: "ठीक किया" },
  },
};

export function getChangelogLabels(language: StudioLanguage | string | null | undefined): ChangelogLabels {
  return LABELS[language as StudioLanguage] ?? FALLBACK;
}
