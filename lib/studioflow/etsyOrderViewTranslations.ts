import type { StudioLanguage } from "./language";

/**
 * ETSY-UI-1 (27 Oct 2026): the Etsy order block, the jump bar, the Etsy note on the Shipping & Tracking card and
 * the order-list toggle. Merged last in language.ts (mergeIntoTranslations: per language, never a spread), and
 * only NEW keys live here — words the app already translates ("Paid", "Copy", "Customize cards", …) are reused,
 * not redefined, so nothing that already reads well elsewhere changes. "{…}" parts are filled in after t().
 * Etsy stays "Etsy" in every language (a name). The Arabic rows are plain text; the layout mirrors through dir=rtl.
 */
export const ETSY_ORDER_VIEW_TRANSLATIONS: Record<string, Partial<Record<StudioLanguage, string>>> = {
  "Paid on Etsy": {
    "Türkçe": "Etsy'de ödendi", "Deutsch": "Auf Etsy bezahlt", "Français": "Payée sur Etsy", "Italiano": "Pagato su Etsy",
    "Español (Spanish)": "Pagado en Etsy", "Português": "Pago na Etsy", "Русский (Russian)": "Оплачено на Etsy",
    "日本語 (Japanese)": "Etsy で支払済み", "中文 (Chinese)": "已在 Etsy 付款", "العربية (Arabic)": "مدفوع على Etsy", "हिन्दी (Hindi)": "Etsy पर भुगतान हो गया"
  },
  "Not paid on Etsy": {
    "Türkçe": "Etsy'de ödenmedi", "Deutsch": "Auf Etsy nicht bezahlt", "Français": "Non payée sur Etsy", "Italiano": "Non pagato su Etsy",
    "Español (Spanish)": "No pagado en Etsy", "Português": "Não pago na Etsy", "Русский (Russian)": "Не оплачено на Etsy",
    "日本語 (Japanese)": "Etsy で未払い", "中文 (Chinese)": "未在 Etsy 付款", "العربية (Arabic)": "غير مدفوع على Etsy", "हिन्दी (Hindi)": "Etsy पर भुगतान नहीं हुआ"
  },
  "Dispatched on Etsy": {
    "Türkçe": "Etsy'de kargoya verildi", "Deutsch": "Auf Etsy versandt", "Français": "Expédiée sur Etsy", "Italiano": "Spedito su Etsy",
    "Español (Spanish)": "Despachado en Etsy", "Português": "Despachado na Etsy", "Русский (Russian)": "Отправлено на Etsy",
    "日本語 (Japanese)": "Etsy で発送済み", "中文 (Chinese)": "已在 Etsy 发货", "العربية (Arabic)": "تم الإرسال على Etsy", "हिन्दी (Hindi)": "Etsy पर भेज दिया गया"
  },
  "Not dispatched on Etsy": {
    "Türkçe": "Etsy'de kargoya verilmedi", "Deutsch": "Auf Etsy nicht versandt", "Français": "Pas expédiée sur Etsy", "Italiano": "Non spedito su Etsy",
    "Español (Spanish)": "No despachado en Etsy", "Português": "Não despachado na Etsy", "Русский (Russian)": "Не отправлено на Etsy",
    "日本語 (Japanese)": "Etsy で未発送", "中文 (Chinese)": "未在 Etsy 发货", "العربية (Arabic)": "لم يُرسل على Etsy", "हिन्दी (Hindi)": "Etsy पर नहीं भेजा गया"
  },
  "Cancelled on Etsy": {
    "Türkçe": "Etsy'de iptal edildi", "Deutsch": "Auf Etsy storniert", "Français": "Annulée sur Etsy", "Italiano": "Annullato su Etsy",
    "Español (Spanish)": "Cancelado en Etsy", "Português": "Cancelado na Etsy", "Русский (Russian)": "Отменено на Etsy",
    "日本語 (Japanese)": "Etsy でキャンセル済み", "中文 (Chinese)": "已在 Etsy 取消", "العربية (Arabic)": "ملغى على Etsy", "हिन्दी (Hindi)": "Etsy पर रद्द किया गया"
  },
  "Refunded on Etsy": {
    "Türkçe": "Etsy'de iade edildi", "Deutsch": "Auf Etsy erstattet", "Français": "Remboursée sur Etsy", "Italiano": "Rimborsato su Etsy",
    "Español (Spanish)": "Reembolsado en Etsy", "Português": "Reembolsado na Etsy", "Русский (Russian)": "Возврат на Etsy",
    "日本語 (Japanese)": "Etsy で返金済み", "中文 (Chinese)": "已在 Etsy 退款", "العربية (Arabic)": "مسترد على Etsy", "हिन्दी (Hindi)": "Etsy पर रिफ़ंड किया गया"
  },
  "as of {time}": {
    "Türkçe": "{time} itibarıyla", "Deutsch": "Stand {time}", "Français": "au {time}", "Italiano": "aggiornato al {time}",
    "Español (Spanish)": "a fecha de {time}", "Português": "à data de {time}", "Русский (Russian)": "на {time}",
    "日本語 (Japanese)": "{time} 時点", "中文 (Chinese)": "截至 {time}", "العربية (Arabic)": "حتى {time}", "हिन्दी (Hindi)": "{time} तक की स्थिति"
  },
  "Open in Etsy": {
    "Türkçe": "Etsy'de aç", "Deutsch": "In Etsy öffnen", "Français": "Ouvrir dans Etsy", "Italiano": "Apri in Etsy",
    "Español (Spanish)": "Abrir en Etsy", "Português": "Abrir na Etsy", "Русский (Russian)": "Открыть в Etsy",
    "日本語 (Japanese)": "Etsy で開く", "中文 (Chinese)": "在 Etsy 中打开", "العربية (Arabic)": "فتح في Etsy", "हिन्दी (Hindi)": "Etsy में खोलें"
  },
  "View listing on Etsy": {
    "Türkçe": "İlanı Etsy'de gör", "Deutsch": "Angebot auf Etsy ansehen", "Français": "Voir l'annonce sur Etsy", "Italiano": "Vedi l'inserzione su Etsy",
    "Español (Spanish)": "Ver el anuncio en Etsy", "Português": "Ver o anúncio na Etsy", "Русский (Russian)": "Открыть объявление на Etsy",
    "日本語 (Japanese)": "Etsy で商品ページを見る", "中文 (Chinese)": "在 Etsy 上查看商品", "العربية (Arabic)": "عرض الإعلان على Etsy", "हिन्दी (Hindi)": "Etsy पर लिस्टिंग देखें"
  },
  "Enlarge the Etsy photo of {title}": {
    "Türkçe": "{title} için Etsy fotoğrafını büyüt", "Deutsch": "Etsy-Foto von {title} vergrößern", "Français": "Agrandir la photo Etsy de {title}",
    "Italiano": "Ingrandisci la foto Etsy di {title}", "Español (Spanish)": "Ampliar la foto de Etsy de {title}", "Português": "Ampliar a foto da Etsy de {title}",
    "Русский (Russian)": "Увеличить фото Etsy: {title}", "日本語 (Japanese)": "{title} の Etsy 写真を拡大", "中文 (Chinese)": "放大 {title} 的 Etsy 照片",
    "العربية (Arabic)": "تكبير صورة Etsy لـ {title}", "हिन्दी (Hindi)": "{title} की Etsy फ़ोटो बड़ी करें"
  },
  "{price} each": {
    "Türkçe": "tanesi {price}", "Deutsch": "je {price}", "Français": "{price} l'unité", "Italiano": "{price} cad.",
    "Español (Spanish)": "{price} c/u", "Português": "{price} cada", "Русский (Russian)": "{price} за шт.",
    "日本語 (Japanese)": "1点 {price}", "中文 (Chinese)": "每件 {price}", "العربية (Arabic)": "{price} للقطعة", "हिन्दी (Hindi)": "{price} प्रति नग"
  },
  "Copy personalisation": {
    "Türkçe": "Kişiselleştirmeyi kopyala", "Deutsch": "Personalisierung kopieren", "Français": "Copier la personnalisation", "Italiano": "Copia la personalizzazione",
    "Español (Spanish)": "Copiar la personalización", "Português": "Copiar a personalização", "Русский (Russian)": "Копировать персонализацию",
    "日本語 (Japanese)": "名入れ内容をコピー", "中文 (Chinese)": "复制个性化内容", "العربية (Arabic)": "نسخ التخصيص", "हिन्दी (Hindi)": "पर्सनलाइज़ेशन कॉपी करें"
  },
  "Loading the photo from Etsy": {
    "Türkçe": "Fotoğraf Etsy'den yükleniyor", "Deutsch": "Foto wird von Etsy geladen", "Français": "Chargement de la photo depuis Etsy", "Italiano": "Caricamento della foto da Etsy",
    "Español (Spanish)": "Cargando la foto desde Etsy", "Português": "A carregar a foto da Etsy", "Русский (Russian)": "Загрузка фото с Etsy",
    "日本語 (Japanese)": "Etsy から写真を読み込み中", "中文 (Chinese)": "正在从 Etsy 加载照片", "العربية (Arabic)": "جارٍ تحميل الصورة من Etsy", "हिन्दी (Hindi)": "Etsy से फ़ोटो लोड हो रही है"
  },
  "Photo from Etsy": {
    "Türkçe": "Etsy'den fotoğraf", "Deutsch": "Foto von Etsy", "Français": "Photo d'Etsy", "Italiano": "Foto da Etsy",
    "Español (Spanish)": "Foto de Etsy", "Português": "Foto da Etsy", "Русский (Russian)": "Фото с Etsy",
    "日本語 (Japanese)": "Etsy の写真", "中文 (Chinese)": "来自 Etsy 的照片", "العربية (Arabic)": "صورة من Etsy", "हिन्दी (Hindi)": "Etsy से फ़ोटो"
  },
  "Close photo": {
    "Türkçe": "Fotoğrafı kapat", "Deutsch": "Foto schließen", "Français": "Fermer la photo", "Italiano": "Chiudi la foto",
    "Español (Spanish)": "Cerrar la foto", "Português": "Fechar a foto", "Русский (Russian)": "Закрыть фото",
    "日本語 (Japanese)": "写真を閉じる", "中文 (Chinese)": "关闭照片", "العربية (Arabic)": "إغلاق الصورة", "हिन्दी (Hindi)": "फ़ोटो बंद करें"
  },
  "From the Etsy listing · not saved in NivaDesk": {
    "Türkçe": "Etsy ilanından · NivaDesk'e kaydedilmez", "Deutsch": "Aus dem Etsy-Angebot · nicht in NivaDesk gespeichert",
    "Français": "Depuis l'annonce Etsy · non enregistrée dans NivaDesk", "Italiano": "Dall'inserzione Etsy · non salvata in NivaDesk",
    "Español (Spanish)": "Del anuncio de Etsy · no se guarda en NivaDesk", "Português": "Do anúncio da Etsy · não é guardada no NivaDesk",
    "Русский (Russian)": "Из объявления на Etsy · не сохраняется в NivaDesk", "日本語 (Japanese)": "Etsy の商品ページより · NivaDesk には保存されません",
    "中文 (Chinese)": "来自 Etsy 商品页 · 不保存在 NivaDesk 中", "العربية (Arabic)": "من إعلان Etsy · لا تُحفظ في NivaDesk",
    "हिन्दी (Hindi)": "Etsy लिस्टिंग से · NivaDesk में सेव नहीं होती"
  },
  "Totals from Etsy": {
    "Türkçe": "Etsy'deki tutarlar", "Deutsch": "Beträge laut Etsy", "Français": "Montants selon Etsy", "Italiano": "Importi da Etsy",
    "Español (Spanish)": "Importes de Etsy", "Português": "Valores da Etsy", "Русский (Russian)": "Суммы из Etsy",
    "日本語 (Japanese)": "Etsy の金額", "中文 (Chinese)": "Etsy 上的金额", "العربية (Arabic)": "المبالغ من Etsy", "हिन्दी (Hindi)": "Etsy के अनुसार राशि"
  },
  "Tax reported by Etsy": {
    "Türkçe": "Etsy'nin bildirdiği vergi", "Deutsch": "Von Etsy gemeldete Steuer", "Français": "Taxe indiquée par Etsy", "Italiano": "Imposta indicata da Etsy",
    "Español (Spanish)": "Impuesto indicado por Etsy", "Português": "Imposto indicado pela Etsy", "Русский (Russian)": "Налог по данным Etsy",
    "日本語 (Japanese)": "Etsy が示す税額", "中文 (Chinese)": "Etsy 报告的税额", "العربية (Arabic)": "الضريبة كما أبلغت عنها Etsy", "हिन्दी (Hindi)": "Etsy द्वारा बताया गया टैक्स"
  },
  "Photos come live from Etsy and are refreshed at least every 6 hours; they are not saved in NivaDesk.": {
    "Türkçe": "Fotoğraflar Etsy'den canlı gelir ve en az 6 saatte bir yenilenir; NivaDesk'e kaydedilmez.",
    "Deutsch": "Fotos kommen live von Etsy und werden mindestens alle 6 Stunden aktualisiert; sie werden nicht in NivaDesk gespeichert.",
    "Français": "Les photos viennent directement d'Etsy et sont actualisées au moins toutes les 6 heures ; elles ne sont pas enregistrées dans NivaDesk.",
    "Italiano": "Le foto arrivano in diretta da Etsy e vengono aggiornate almeno ogni 6 ore; non vengono salvate in NivaDesk.",
    "Español (Spanish)": "Las fotos llegan en directo desde Etsy y se actualizan al menos cada 6 horas; no se guardan en NivaDesk.",
    "Português": "As fotos chegam em direto da Etsy e são atualizadas pelo menos a cada 6 horas; não são guardadas no NivaDesk.",
    "Русский (Russian)": "Фото загружаются напрямую с Etsy и обновляются не реже чем раз в 6 часов; в NivaDesk они не сохраняются.",
    "日本語 (Japanese)": "写真は Etsy から直接表示され、少なくとも 6 時間ごとに更新されます。NivaDesk には保存されません。",
    "中文 (Chinese)": "照片直接来自 Etsy，至少每 6 小时刷新一次；不会保存在 NivaDesk 中。",
    "العربية (Arabic)": "تأتي الصور مباشرة من Etsy وتُحدَّث كل 6 ساعات على الأقل؛ ولا تُحفظ في NivaDesk.",
    "हिन्दी (Hindi)": "फ़ोटो सीधे Etsy से आती हैं और कम से कम हर 6 घंटे में ताज़ा होती हैं; ये NivaDesk में सेव नहीं होतीं।"
  },
  "NivaDesk reads Etsy orders but can't mark them dispatched on Etsy. Add the tracking number on Etsy too.": {
    "Türkçe": "NivaDesk Etsy siparişlerini okur ama Etsy'de kargoya verildi olarak işaretleyemez. Takip numarasını Etsy'ye de ekleyin.",
    "Deutsch": "NivaDesk liest Etsy-Bestellungen, kann sie auf Etsy aber nicht als versandt markieren. Tragen Sie die Sendungsnummer auch auf Etsy ein.",
    "Français": "NivaDesk lit les commandes Etsy mais ne peut pas les marquer comme expédiées sur Etsy. Ajoutez aussi le numéro de suivi sur Etsy.",
    "Italiano": "NivaDesk legge gli ordini Etsy ma non può segnarli come spediti su Etsy. Aggiungi il numero di tracciamento anche su Etsy.",
    "Español (Spanish)": "NivaDesk lee los pedidos de Etsy, pero no puede marcarlos como despachados en Etsy. Añade también el número de seguimiento en Etsy.",
    "Português": "O NivaDesk lê as encomendas da Etsy, mas não as pode marcar como despachadas na Etsy. Adicione também o número de seguimento na Etsy.",
    "Русский (Russian)": "NivaDesk читает заказы Etsy, но не может отметить их отправленными на Etsy. Добавьте трек-номер и на Etsy.",
    "日本語 (Japanese)": "NivaDesk は Etsy の注文を読み取れますが、Etsy で発送済みにはできません。追跡番号は Etsy にも入力してください。",
    "中文 (Chinese)": "NivaDesk 可以读取 Etsy 订单，但无法在 Etsy 上将其标记为已发货。请同时在 Etsy 上添加追踪号码。",
    "العربية (Arabic)": "يقرأ NivaDesk طلبات Etsy لكنه لا يستطيع تعليمها كمُرسلة على Etsy. أضف رقم التتبع على Etsy أيضًا.",
    "हिन्दी (Hindi)": "NivaDesk Etsy ऑर्डर पढ़ता है, लेकिन उन्हें Etsy पर भेजा गया चिह्नित नहीं कर सकता। ट्रैकिंग नंबर Etsy पर भी जोड़ें।"
  },
  "Add tracking on Etsy": {
    "Türkçe": "Takibi Etsy'de ekle", "Deutsch": "Sendungsnummer auf Etsy eintragen", "Français": "Ajouter le suivi sur Etsy", "Italiano": "Aggiungi il tracciamento su Etsy",
    "Español (Spanish)": "Añadir seguimiento en Etsy", "Português": "Adicionar seguimento na Etsy", "Русский (Russian)": "Добавить трек-номер на Etsy",
    "日本語 (Japanese)": "Etsy で追跡番号を追加", "中文 (Chinese)": "在 Etsy 上添加追踪信息", "العربية (Arabic)": "إضافة التتبع على Etsy", "हिन्दी (Hindi)": "Etsy पर ट्रैकिंग जोड़ें"
  },
  "Jump to a card": {
    "Türkçe": "Bir karta git", "Deutsch": "Zu einer Karte springen", "Français": "Aller à une carte", "Italiano": "Vai a una scheda",
    "Español (Spanish)": "Ir a una tarjeta", "Português": "Ir para um cartão", "Русский (Russian)": "Перейти к карточке",
    "日本語 (Japanese)": "カードへ移動", "中文 (Chinese)": "跳转到卡片", "العربية (Arabic)": "الانتقال إلى بطاقة", "हिन्दी (Hindi)": "किसी कार्ड पर जाएँ"
  },
  "From Etsy": {
    "Türkçe": "Etsy'den", "Deutsch": "Von Etsy", "Français": "D'Etsy", "Italiano": "Da Etsy",
    "Español (Spanish)": "De Etsy", "Português": "Da Etsy", "Русский (Russian)": "Из Etsy",
    "日本語 (Japanese)": "Etsy から", "中文 (Chinese)": "来自 Etsy", "العربية (Arabic)": "من Etsy", "हिन्दी (Hindi)": "Etsy से"
  },
  "{count} hidden": {
    "Türkçe": "{count} gizli", "Deutsch": "{count} ausgeblendet", "Français": "{count} masquée(s)", "Italiano": "{count} nascoste",
    "Español (Spanish)": "{count} ocultas", "Português": "{count} ocultos", "Русский (Russian)": "скрыто: {count}",
    "日本語 (Japanese)": "{count} 件非表示", "中文 (Chinese)": "已隐藏 {count} 个", "العربية (Arabic)": "{count} مخفية", "हिन्दी (Hindi)": "{count} छिपे हुए"
  }
};
