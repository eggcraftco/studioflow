import type { StudioLanguage } from "./language";

/**
 * Sections view (31 Oct 2026): the order header's status strip, the Sections / Cards toggle and the section
 * headings. Merged late in language.ts (mergeIntoTranslations: per language, never a spread) and NEW keys only —
 * words the app already translates ("Paid", "Remaining", "Up", "Down", "Hide block", the colour names, …) are
 * reused, not redefined. "{…}" parts are filled in after t(). The Arabic rows are plain text; dir=rtl mirrors.
 */
export const ORDER_STACK_VIEW_TRANSLATIONS: Record<string, Partial<Record<StudioLanguage, string>>> = {
  "Start timer": {
    "Türkçe": "Başlat", "Deutsch": "Starten", "Français": "Démarrer", "Italiano": "Avvia",
    "Español (Spanish)": "Iniciar", "Português": "Iniciar", "Русский (Russian)": "Запустить",
    "日本語 (Japanese)": "開始", "中文 (Chinese)": "开始", "العربية (Arabic)": "ابدأ", "हिन्दी (Hindi)": "शुरू करें"
  },
  "Sections": {
    "Türkçe": "Bölümler", "Deutsch": "Abschnitte", "Français": "Sections", "Italiano": "Sezioni",
    "Español (Spanish)": "Secciones", "Português": "Seções", "Русский (Russian)": "Разделы",
    "日本語 (Japanese)": "セクション", "中文 (Chinese)": "分区", "العربية (Arabic)": "الأقسام", "हिन्दी (Hindi)": "सेक्शन"
  },
  "Cards": {
    "Türkçe": "Kartlar", "Deutsch": "Karten", "Français": "Cartes", "Italiano": "Schede",
    "Español (Spanish)": "Tarjetas", "Português": "Cartões", "Русский (Russian)": "Карточки",
    "日本語 (Japanese)": "カード", "中文 (Chinese)": "卡片", "العربية (Arabic)": "البطاقات", "हिन्दी (Hindi)": "कार्ड"
  },
  "Sections view": {
    "Türkçe": "Bölüm görünümü", "Deutsch": "Abschnittsansicht", "Français": "Vue en sections", "Italiano": "Vista a sezioni",
    "Español (Spanish)": "Vista por secciones", "Português": "Vista em seções", "Русский (Russian)": "Вид разделами",
    "日本語 (Japanese)": "セクション表示", "中文 (Chinese)": "分区视图", "العربية (Arabic)": "عرض الأقسام", "हिन्दी (Hindi)": "सेक्शन दृश्य"
  },
  "Card view": {
    "Türkçe": "Kart görünümü", "Deutsch": "Kartenansicht", "Français": "Vue en cartes", "Italiano": "Vista a schede",
    "Español (Spanish)": "Vista de tarjetas", "Português": "Vista de cartões", "Русский (Russian)": "Вид карточками",
    "日本語 (Japanese)": "カード表示", "中文 (Chinese)": "卡片视图", "العربية (Arabic)": "عرض البطاقات", "हिन्दी (Hindi)": "कार्ड दृश्य"
  },
  "Choose how this order opens: sections or cards": {
    "Türkçe": "Siparişin nasıl açılacağını seçin: bölümler ya da kartlar", "Deutsch": "Wählen, wie dieser Auftrag öffnet: Abschnitte oder Karten",
    "Français": "Choisir l'ouverture de la commande : sections ou cartes", "Italiano": "Scegli come si apre l'ordine: sezioni o schede",
    "Español (Spanish)": "Elige cómo se abre el pedido: secciones o tarjetas", "Português": "Escolha como o pedido abre: seções ou cartões",
    "Русский (Russian)": "Как открывать заказ: разделами или карточками", "日本語 (Japanese)": "注文の表示方法を選択：セクションまたはカード",
    "中文 (Chinese)": "选择订单打开方式：分区或卡片", "العربية (Arabic)": "اختر طريقة فتح الطلب: أقسام أو بطاقات", "हिन्दी (Hindi)": "चुनें कि ऑर्डर कैसे खुले: सेक्शन या कार्ड"
  },
  "Expand all": {
    "Türkçe": "Tümünü aç", "Deutsch": "Alle aufklappen", "Français": "Tout déplier", "Italiano": "Espandi tutto",
    "Español (Spanish)": "Expandir todo", "Português": "Expandir tudo", "Русский (Russian)": "Развернуть все",
    "日本語 (Japanese)": "すべて開く", "中文 (Chinese)": "全部展开", "العربية (Arabic)": "توسيع الكل", "हिन्दी (Hindi)": "सभी खोलें"
  },
  "Show status details": {
    "Türkçe": "Durum ayrıntılarını göster", "Deutsch": "Statusdetails anzeigen", "Français": "Afficher le détail du statut",
    "Italiano": "Mostra i dettagli dello stato", "Español (Spanish)": "Mostrar los detalles del estado", "Português": "Mostrar os detalhes do estado",
    "Русский (Russian)": "Показать подробности статуса", "日本語 (Japanese)": "ステータスの詳細を表示", "中文 (Chinese)": "显示状态详情",
    "العربية (Arabic)": "إظهار تفاصيل الحالة", "हिन्दी (Hindi)": "स्थिति का विवरण दिखाएँ"
  },
  "Hide status details": {
    "Türkçe": "Durum ayrıntılarını gizle", "Deutsch": "Statusdetails ausblenden", "Français": "Masquer le détail du statut",
    "Italiano": "Nascondi i dettagli dello stato", "Español (Spanish)": "Ocultar los detalles del estado", "Português": "Ocultar os detalhes do estado",
    "Русский (Russian)": "Скрыть подробности статуса", "日本語 (Japanese)": "ステータスの詳細を隠す", "中文 (Chinese)": "隐藏状态详情",
    "العربية (Arabic)": "إخفاء تفاصيل الحالة", "हिन्दी (Hindi)": "स्थिति का विवरण छिपाएँ"
  },
  "Collapse all": {
    "Türkçe": "Tümünü kapat", "Deutsch": "Alle einklappen", "Français": "Tout replier", "Italiano": "Comprimi tutto",
    "Español (Spanish)": "Contraer todo", "Português": "Recolher tudo", "Русский (Russian)": "Свернуть все",
    "日本語 (Japanese)": "すべて閉じる", "中文 (Chinese)": "全部收起", "العربية (Arabic)": "طي الكل", "हिन्दी (Hindi)": "सभी बंद करें"
  },
  "Open section": {
    "Türkçe": "Bölümü aç", "Deutsch": "Abschnitt öffnen", "Français": "Ouvrir la section", "Italiano": "Apri sezione",
    "Español (Spanish)": "Abrir sección", "Português": "Abrir seção", "Русский (Russian)": "Открыть раздел",
    "日本語 (Japanese)": "セクションを開く", "中文 (Chinese)": "打开分区", "العربية (Arabic)": "فتح القسم", "हिन्दी (Hindi)": "सेक्शन खोलें"
  },
  "Close section": {
    "Türkçe": "Bölümü kapat", "Deutsch": "Abschnitt schließen", "Français": "Fermer la section", "Italiano": "Chiudi sezione",
    "Español (Spanish)": "Cerrar sección", "Português": "Fechar seção", "Русский (Russian)": "Закрыть раздел",
    "日本語 (Japanese)": "セクションを閉じる", "中文 (Chinese)": "关闭分区", "العربية (Arabic)": "إغلاق القسم", "हिन्दी (Hindi)": "सेक्शन बंद करें"
  },
  "Drag to reorder sections": {
    "Türkçe": "Bölümleri sıralamak için sürükleyin", "Deutsch": "Ziehen, um Abschnitte zu ordnen", "Français": "Glisser pour réordonner les sections",
    "Italiano": "Trascina per riordinare le sezioni", "Español (Spanish)": "Arrastra para reordenar las secciones", "Português": "Arraste para reordenar as seções",
    "Русский (Russian)": "Перетащите, чтобы изменить порядок разделов", "日本語 (Japanese)": "ドラッグしてセクションを並べ替え",
    "中文 (Chinese)": "拖动以重新排列分区", "العربية (Arabic)": "اسحب لإعادة ترتيب الأقسام", "हिन्दी (Hindi)": "सेक्शन क्रम बदलने के लिए खींचें"
  },
  "Section order saved.": {
    "Türkçe": "Bölüm sırası kaydedildi.", "Deutsch": "Abschnittsreihenfolge gespeichert.", "Français": "Ordre des sections enregistré.",
    "Italiano": "Ordine delle sezioni salvato.", "Español (Spanish)": "Orden de secciones guardado.", "Português": "Ordem das seções guardada.",
    "Русский (Russian)": "Порядок разделов сохранён.", "日本語 (Japanese)": "セクションの順序を保存しました。", "中文 (Chinese)": "分区顺序已保存。",
    "العربية (Arabic)": "تم حفظ ترتيب الأقسام.", "हिन्दी (Hindi)": "सेक्शन क्रम सहेजा गया।"
  },
  "Final profit": {
    "Türkçe": "Nihai kâr", "Deutsch": "Endgewinn", "Français": "Bénéfice final", "Italiano": "Profitto finale",
    "Español (Spanish)": "Beneficio final", "Português": "Lucro final", "Русский (Russian)": "Итоговая прибыль",
    "日本語 (Japanese)": "最終利益", "中文 (Chinese)": "最终利润", "العربية (Arabic)": "الربح النهائي", "हिन्दी (Hindi)": "अंतिम लाभ"
  },
  "No steps yet": {
    "Türkçe": "Henüz adım yok", "Deutsch": "Noch keine Schritte", "Français": "Aucune étape", "Italiano": "Nessun passaggio",
    "Español (Spanish)": "Sin pasos aún", "Português": "Ainda sem etapas", "Русский (Russian)": "Шагов пока нет",
    "日本語 (Japanese)": "ステップはまだありません", "中文 (Chinese)": "暂无步骤", "العربية (Arabic)": "لا توجد خطوات بعد", "हिन्दी (Hindi)": "अभी कोई चरण नहीं"
  },
  "{count} items": {
    "Türkçe": "{count} kalem", "Deutsch": "{count} Positionen", "Français": "{count} articles", "Italiano": "{count} voci",
    "Español (Spanish)": "{count} artículos", "Português": "{count} itens", "Русский (Russian)": "Позиций: {count}",
    "日本語 (Japanese)": "{count} 件", "中文 (Chinese)": "{count} 项", "العربية (Arabic)": "{count} بنود", "हिन्दी (Hindi)": "{count} आइटम"
  },
  "{count} files": {
    "Türkçe": "{count} dosya", "Deutsch": "{count} Dateien", "Français": "{count} fichiers", "Italiano": "{count} file",
    "Español (Spanish)": "{count} archivos", "Português": "{count} ficheiros", "Русский (Russian)": "Файлов: {count}",
    "日本語 (Japanese)": "{count} ファイル", "中文 (Chinese)": "{count} 个文件", "العربية (Arabic)": "{count} ملفات", "हिन्दी (Hindi)": "{count} फ़ाइलें"
  },
  "{count} entries": {
    "Türkçe": "{count} kayıt", "Deutsch": "{count} Einträge", "Français": "{count} entrées", "Italiano": "{count} voci",
    "Español (Spanish)": "{count} entradas", "Português": "{count} registos", "Русский (Russian)": "Записей: {count}",
    "日本語 (Japanese)": "{count} 件", "中文 (Chinese)": "{count} 条记录", "العربية (Arabic)": "{count} إدخالات", "हिन्दी (Hindi)": "{count} प्रविष्टियाँ"
  },
  "{count} reminders": {
    "Türkçe": "{count} hatırlatma", "Deutsch": "{count} Erinnerungen", "Français": "{count} rappels", "Italiano": "{count} promemoria",
    "Español (Spanish)": "{count} recordatorios", "Português": "{count} lembretes", "Русский (Russian)": "Напоминаний: {count}",
    "日本語 (Japanese)": "{count} 件のリマインダー", "中文 (Chinese)": "{count} 个提醒", "العربية (Arabic)": "{count} تذكيرات", "हिन्दी (Hindi)": "{count} रिमाइंडर"
  },
  "{done} of {total} done": {
    "Türkçe": "{total} görevden {done} bitti", "Deutsch": "{done} von {total} erledigt", "Français": "{done} sur {total} faits",
    "Italiano": "{done} su {total} fatti", "Español (Spanish)": "{done} de {total} hechos", "Português": "{done} de {total} feitos",
    "Русский (Russian)": "Готово {done} из {total}", "日本語 (Japanese)": "{total} 件中 {done} 件完了", "中文 (Chinese)": "已完成 {done}/{total}",
    "العربية (Arabic)": "تم {done} من {total}", "हिन्दी (Hindi)": "{total} में से {done} पूरे"
  },
  "{checked} of {total} ready": {
    "Türkçe": "{total} malzemeden {checked} hazır", "Deutsch": "{checked} von {total} bereit", "Français": "{checked} sur {total} prêts",
    "Italiano": "{checked} su {total} pronti", "Español (Spanish)": "{checked} de {total} listos", "Português": "{checked} de {total} prontos",
    "Русский (Russian)": "Готово {checked} из {total}", "日本語 (Japanese)": "{total} 件中 {checked} 件準備完了", "中文 (Chinese)": "已备好 {checked}/{total}",
    "العربية (Arabic)": "جاهز {checked} من {total}", "हिन्दी (Hindi)": "{total} में से {checked} तैयार"
  },
  "Portal active": {
    "Türkçe": "Portal açık", "Deutsch": "Portal aktiv", "Français": "Portail actif", "Italiano": "Portale attivo",
    "Español (Spanish)": "Portal activo", "Português": "Portal ativo", "Русский (Russian)": "Портал открыт",
    "日本語 (Japanese)": "ポータル有効", "中文 (Chinese)": "门户已启用", "العربية (Arabic)": "البوابة مفعّلة", "हिन्दी (Hindi)": "पोर्टल सक्रिय"
  },
  "No estimate yet": {
    "Türkçe": "Henüz teklif yok", "Deutsch": "Noch kein Angebot", "Français": "Pas encore de devis", "Italiano": "Nessun preventivo",
    "Español (Spanish)": "Sin presupuesto aún", "Português": "Ainda sem orçamento", "Русский (Russian)": "Сметы пока нет",
    "日本語 (Japanese)": "見積りはまだありません", "中文 (Chinese)": "暂无报价", "العربية (Arabic)": "لا يوجد تقدير بعد", "हिन्दी (Hindi)": "अभी कोई अनुमान नहीं"
  },
  "No notes yet": {
    "Türkçe": "Henüz not yok", "Deutsch": "Noch keine Notizen", "Français": "Pas encore de notes", "Italiano": "Nessuna nota",
    "Español (Spanish)": "Sin notas aún", "Português": "Ainda sem notas", "Русский (Russian)": "Заметок пока нет",
    "日本語 (Japanese)": "メモはまだありません", "中文 (Chinese)": "暂无备注", "العربية (Arabic)": "لا توجد ملاحظات بعد", "हिन्दी (Hindi)": "अभी कोई नोट नहीं"
  },
  "No time logged": {
    "Türkçe": "Süre kaydı yok", "Deutsch": "Keine Zeit erfasst", "Français": "Aucun temps saisi", "Italiano": "Nessun tempo registrato",
    "Español (Spanish)": "Sin tiempo registrado", "Português": "Sem tempo registado", "Русский (Russian)": "Время не учтено",
    "日本語 (Japanese)": "作業時間の記録なし", "中文 (Chinese)": "未记录工时", "العربية (Arabic)": "لم يُسجَّل وقت", "हिन्दी (Hindi)": "कोई समय दर्ज नहीं"
  },
  "Top": {
    "Türkçe": "En üst", "Deutsch": "Ganz oben", "Français": "En haut", "Italiano": "In cima",
    "Español (Spanish)": "Arriba del todo", "Português": "No topo", "Русский (Russian)": "Наверх",
    "日本語 (Japanese)": "一番上", "中文 (Chinese)": "置顶", "العربية (Arabic)": "الأعلى", "हिन्दी (Hindi)": "सबसे ऊपर"
  },
  "Bottom": {
    "Türkçe": "En alt", "Deutsch": "Ganz unten", "Français": "En bas", "Italiano": "In fondo",
    "Español (Spanish)": "Abajo del todo", "Português": "No fim", "Русский (Russian)": "Вниз",
    "日本語 (Japanese)": "一番下", "中文 (Chinese)": "置底", "العربية (Arabic)": "الأسفل", "हिन्दी (Hindi)": "सबसे नीचे"
  },
  "Not dispatched": {
    "Türkçe": "Kargoya verilmedi", "Deutsch": "Nicht versandt", "Français": "Non expédiée", "Italiano": "Non spedito",
    "Español (Spanish)": "No despachado", "Português": "Não despachado", "Русский (Russian)": "Не отправлено",
    "日本語 (Japanese)": "未発送", "中文 (Chinese)": "未发货", "العربية (Arabic)": "لم يُرسل", "हिन्दी (Hindi)": "नहीं भेजा गया"
  },
  "Sections are hidden on this order": {
    "Türkçe": "Bu siparişte bölümler gizli", "Deutsch": "Abschnitte sind bei diesem Auftrag ausgeblendet", "Français": "Les sections sont masquées sur cette commande",
    "Italiano": "Le sezioni sono nascoste su questo ordine", "Español (Spanish)": "Las secciones están ocultas en este pedido", "Português": "As seções estão ocultas neste pedido",
    "Русский (Russian)": "Разделы этого заказа скрыты", "日本語 (Japanese)": "この注文ではセクションが非表示です", "中文 (Chinese)": "此订单已隐藏分区",
    "العربية (Arabic)": "الأقسام مخفية في هذا الطلب", "हिन्दी (Hindi)": "इस ऑर्डर में सेक्शन छिपे हैं"
  }
};
