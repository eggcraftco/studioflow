import type { StudioLanguage } from "./language";

// Web small fixes (17 Oct 2026): Team seats in use / included / extra / total
// (Settings ▸ Team Access, /team), the permission matrix's owner-approval cell
// for Delete orders, and the phone Schedule's per-project Calendar File line.
// Every language in one table, keyed by source text; merged last in
// language.ts so no earlier table can hide a cell.
export const WEB_SMALL_FIXES_TRANSLATIONS: Record<string, Partial<Record<StudioLanguage, string>>> = {
  "Seats in use": {
    "Türkçe": "Kullanılan koltuk",
    "Deutsch": "Belegte Plätze",
    "Français": "Sièges utilisés",
    "Italiano": "Posti in uso",
    "Español (Spanish)": "Puestos en uso",
    "Português": "Lugares em uso",
    "Русский (Russian)": "Занято мест",
    "日本語 (Japanese)": "使用中のシート",
    "中文 (Chinese)": "已使用席位",
    "العربية (Arabic)": "المقاعد المستخدمة",
    "हिन्दी (Hindi)": "उपयोग में सीटें"
  },
  "Included in plan": {
    "Türkçe": "Plana dahil",
    "Deutsch": "Im Tarif enthalten",
    "Français": "Inclus dans le forfait",
    "Italiano": "Inclusi nel piano",
    "Español (Spanish)": "Incluidos en el plan",
    "Português": "Incluídos no plano",
    "Русский (Russian)": "Входит в тариф",
    "日本語 (Japanese)": "プランに含まれる",
    "中文 (Chinese)": "套餐内含",
    "العربية (Arabic)": "مضمّنة في الخطة",
    "हिन्दी (Hindi)": "प्लान में शामिल"
  },
  "Extra seats": {
    "Türkçe": "Ek koltuk",
    "Deutsch": "Zusätzliche Plätze",
    "Français": "Sièges supplémentaires",
    "Italiano": "Posti aggiuntivi",
    "Español (Spanish)": "Puestos adicionales",
    "Português": "Lugares adicionais",
    "Русский (Russian)": "Дополнительные места",
    "日本語 (Japanese)": "追加シート",
    "中文 (Chinese)": "额外席位",
    "العربية (Arabic)": "مقاعد إضافية",
    "हिन्दी (Hindi)": "अतिरिक्त सीटें"
  },
  "Total seats": {
    "Türkçe": "Toplam koltuk",
    "Deutsch": "Plätze insgesamt",
    "Français": "Total des sièges",
    "Italiano": "Posti totali",
    "Español (Spanish)": "Puestos en total",
    "Português": "Total de lugares",
    "Русский (Russian)": "Всего мест",
    "日本語 (Japanese)": "合計シート",
    "中文 (Chinese)": "席位总数",
    "العربية (Arabic)": "إجمالي المقاعد",
    "हिन्दी (Hindi)": "कुल सीटें"
  },
  "extra": {
    "Türkçe": "ek",
    "Deutsch": "zusätzlich",
    "Français": "en plus",
    "Italiano": "aggiuntivi",
    "Español (Spanish)": "adicionales",
    "Português": "adicionais",
    "Русский (Russian)": "дополнительно",
    "日本語 (Japanese)": "追加",
    "中文 (Chinese)": "额外",
    "العربية (Arabic)": "إضافية",
    "हिन्दी (Hindi)": "अतिरिक्त"
  },
  "Needs owner approval": {
    "Türkçe": "Sahip onayı gerekir",
    "Deutsch": "Freigabe durch Inhaber nötig",
    "Français": "Accord du propriétaire requis",
    "Italiano": "Serve l'approvazione del titolare",
    "Español (Spanish)": "Requiere aprobación del propietario",
    "Português": "Requer aprovação do proprietário",
    "Русский (Russian)": "Нужно одобрение владельца",
    "日本語 (Japanese)": "オーナーの承認が必要",
    "中文 (Chinese)": "需所有者批准",
    "العربية (Arabic)": "يتطلب موافقة المالك",
    "हिन्दी (Hindi)": "मालिक की मंज़ूरी ज़रूरी"
  },
  "the member sends a deletion request and the owner deletes the order.": {
    "Türkçe": "üye bir silme isteği gönderir, siparişi sahip siler.",
    "Deutsch": "Das Mitglied sendet eine Löschanfrage, und der Inhaber löscht den Auftrag.",
    "Français": "le membre envoie une demande de suppression et le propriétaire supprime la commande.",
    "Italiano": "il membro invia una richiesta di eliminazione e il titolare elimina l'ordine.",
    "Español (Spanish)": "el miembro envía una solicitud de eliminación y el propietario elimina el pedido.",
    "Português": "o membro envia um pedido de eliminação e o proprietário elimina a encomenda.",
    "Русский (Russian)": "участник отправляет запрос на удаление, а владелец удаляет заказ.",
    "日本語 (Japanese)": "メンバーが削除リクエストを送り、オーナーが注文を削除します。",
    "中文 (Chinese)": "成员发送删除请求，由所有者删除订单。",
    "العربية (Arabic)": "يرسل العضو طلب حذف ويحذف المالك الطلب.",
    "हिन्दी (Hindi)": "सदस्य हटाने का अनुरोध भेजता है और मालिक ऑर्डर हटाता है।"
  },
  "Calendar File: use the calendar button on a project to add it to your calendar.": {
    "Türkçe": "Takvim Dosyası: bir projeyi takviminize eklemek için kartındaki takvim düğmesini kullanın.",
    "Deutsch": "Kalenderdatei: Mit der Kalender-Schaltfläche an einem Projekt fügen Sie es Ihrem Kalender hinzu.",
    "Français": "Fichier calendrier : utilisez le bouton calendrier d'un projet pour l'ajouter à votre calendrier.",
    "Italiano": "File calendario: usa il pulsante calendario di un progetto per aggiungerlo al tuo calendario.",
    "Español (Spanish)": "Archivo de calendario: usa el botón de calendario de un proyecto para añadirlo a tu calendario.",
    "Português": "Ficheiro de calendário: use o botão de calendário de um projeto para o adicionar ao seu calendário.",
    "Русский (Russian)": "Файл календаря: нажмите кнопку календаря у проекта, чтобы добавить его в свой календарь.",
    "日本語 (Japanese)": "カレンダーファイル：プロジェクトのカレンダーボタンで、そのプロジェクトをカレンダーに追加できます。",
    "中文 (Chinese)": "日历文件：使用项目上的日历按钮，将其添加到你的日历。",
    "العربية (Arabic)": "ملف التقويم: استخدم زر التقويم في المشروع لإضافته إلى تقويمك.",
    "हिन्दी (Hindi)": "कैलेंडर फ़ाइल: किसी प्रोजेक्ट को अपने कैलेंडर में जोड़ने के लिए उसके कैलेंडर बटन का उपयोग करें।"
  }
};
