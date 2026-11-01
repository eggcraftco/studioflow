import type { StudioLanguage } from "./language";

/**
 * Delivery address (1 Nov 2026): the block on an order's Shipping & Tracking section
 * (app/orders/OrderDeliveryAddress.tsx). NEW keys only, merged late in language.ts with
 * mergeMissingIntoTranslations, so a key another screen already translates keeps its wording.
 * Words the app already has are reused, not redefined: "Delivery address", "Name",
 * "Company (optional)", "City", "Postcode", "Country", "Save", "Cancel", "Edit", "Saving…".
 * Portuguese is the app's European Portuguese ("morada"); Arabic follows "عنوان التسليم".
 */
export const ORDER_DELIVERY_ADDRESS_TRANSLATIONS: Record<string, Partial<Record<StudioLanguage, string>>> = {
  "Address lines": {
    "Türkçe": "Adres satırları", "Deutsch": "Adresszeilen", "Français": "Lignes d'adresse", "Italiano": "Righe dell'indirizzo",
    "Español (Spanish)": "Líneas de dirección", "Português": "Linhas da morada", "Русский (Russian)": "Строки адреса",
    "日本語 (Japanese)": "住所の行", "中文 (Chinese)": "地址行", "العربية (Arabic)": "أسطر العنوان", "हिन्दी (Hindi)": "पते की पंक्तियाँ"
  },
  "One line per row": {
    "Türkçe": "Her satıra bir adres satırı", "Deutsch": "Eine Adresszeile pro Zeile", "Français": "Une ligne d'adresse par ligne",
    "Italiano": "Una riga dell'indirizzo per riga", "Español (Spanish)": "Una línea de dirección por fila", "Português": "Uma linha da morada por linha",
    "Русский (Russian)": "По одной строке адреса на строку", "日本語 (Japanese)": "1行に住所を1行ずつ", "中文 (Chinese)": "每行填写一行地址",
    "العربية (Arabic)": "سطر واحد من العنوان في كل سطر", "हिन्दी (Hindi)": "हर पंक्ति में पते की एक पंक्ति"
  },
  "Phone (optional)": {
    "Türkçe": "Telefon (isteğe bağlı)", "Deutsch": "Telefon (optional)", "Français": "Téléphone (facultatif)", "Italiano": "Telefono (facoltativo)",
    "Español (Spanish)": "Teléfono (opcional)", "Português": "Telefone (opcional)", "Русский (Russian)": "Телефон (необязательно)",
    "日本語 (Japanese)": "電話番号（任意）", "中文 (Chinese)": "电话（可选）", "العربية (Arabic)": "الهاتف (اختياري)", "हिन्दी (Hindi)": "फ़ोन (वैकल्पिक)"
  },
  "Use customer address": {
    "Türkçe": "Müşteri adresini kullan", "Deutsch": "Kundenadresse übernehmen", "Français": "Utiliser l'adresse du client",
    "Italiano": "Usa l'indirizzo del cliente", "Español (Spanish)": "Usar la dirección del cliente", "Português": "Usar a morada do cliente",
    "Русский (Russian)": "Взять адрес клиента", "日本語 (Japanese)": "顧客の住所を使う", "中文 (Chinese)": "使用客户地址",
    "العربية (Arabic)": "استخدام عنوان العميل", "हिन्दी (Hindi)": "ग्राहक का पता इस्तेमाल करें"
  },
  "Add address": {
    "Türkçe": "Adres ekle", "Deutsch": "Adresse hinzufügen", "Français": "Ajouter une adresse", "Italiano": "Aggiungi indirizzo",
    "Español (Spanish)": "Añadir dirección", "Português": "Adicionar morada", "Русский (Russian)": "Добавить адрес",
    "日本語 (Japanese)": "住所を追加", "中文 (Chinese)": "添加地址", "العربية (Arabic)": "إضافة عنوان", "हिन्दी (Hindi)": "पता जोड़ें"
  },
  "No delivery address yet.": {
    "Türkçe": "Henüz teslimat adresi yok.", "Deutsch": "Noch keine Lieferadresse.", "Français": "Pas encore d'adresse de livraison.",
    "Italiano": "Nessun indirizzo di consegna ancora.", "Español (Spanish)": "Aún no hay dirección de entrega.", "Português": "Ainda não há morada de entrega.",
    "Русский (Russian)": "Адреса доставки пока нет.", "日本語 (Japanese)": "配送先住所はまだありません。", "中文 (Chinese)": "还没有收货地址。",
    "العربية (Arabic)": "لا يوجد عنوان تسليم بعد.", "हिन्दी (Hindi)": "अभी कोई डिलीवरी पता नहीं है।"
  },
  "Shipping labels use this address.": {
    "Türkçe": "Kargo etiketleri bu adresi kullanır.", "Deutsch": "Versandetiketten verwenden diese Adresse.",
    "Français": "Les étiquettes d'expédition utilisent cette adresse.", "Italiano": "Le etichette di spedizione usano questo indirizzo.",
    "Español (Spanish)": "Las etiquetas de envío usan esta dirección.", "Português": "As etiquetas de envio usam esta morada.",
    "Русский (Russian)": "Этот адрес используется в транспортных этикетках.", "日本語 (Japanese)": "配送ラベルにはこの住所が使われます。",
    "中文 (Chinese)": "运单标签使用此地址。", "العربية (Arabic)": "تستخدم ملصقات الشحن هذا العنوان.", "हिन्दी (Hindi)": "शिपिंग लेबल इसी पते का इस्तेमाल करते हैं।"
  },
  "A shipping label needs a name, an address line, a city and a postcode.": {
    "Türkçe": "Kargo etiketi için ad, bir adres satırı, şehir ve posta kodu gerekir.",
    "Deutsch": "Ein Versandetikett braucht einen Namen, eine Adresszeile, eine Stadt und eine Postleitzahl.",
    "Français": "Une étiquette d'expédition demande un nom, une ligne d'adresse, une ville et un code postal.",
    "Italiano": "Un'etichetta di spedizione richiede un nome, una riga dell'indirizzo, una città e un CAP.",
    "Español (Spanish)": "Una etiqueta de envío necesita un nombre, una línea de dirección, una ciudad y un código postal.",
    "Português": "Uma etiqueta de envio precisa de um nome, uma linha da morada, uma cidade e um código postal.",
    "Русский (Russian)": "Для транспортной этикетки нужны имя, строка адреса, город и почтовый индекс.",
    "日本語 (Japanese)": "配送ラベルには、氏名、住所1行、市区町村、郵便番号が必要です。",
    "中文 (Chinese)": "运单标签需要姓名、一行地址、城市和邮政编码。",
    "العربية (Arabic)": "يحتاج ملصق الشحن إلى اسم وسطر عنوان ومدينة ورمز بريدي.",
    "हिन्दी (Hindi)": "शिपिंग लेबल के लिए नाम, पते की एक पंक्ति, शहर और पिन कोड चाहिए।"
  },
  "Could not save the delivery address: the server does not accept it yet. Nothing was changed; your text is still here.": {
    "Türkçe": "Teslimat adresi kaydedilemedi: sunucu bunu henüz kabul etmiyor. Hiçbir şey değişmedi; yazdıklarınız burada duruyor.",
    "Deutsch": "Die Lieferadresse konnte nicht gespeichert werden: Der Server nimmt sie noch nicht an. Nichts wurde geändert; Ihr Text steht weiter hier.",
    "Français": "Impossible d'enregistrer l'adresse de livraison : le serveur ne l'accepte pas encore. Rien n'a été modifié ; votre texte est toujours là.",
    "Italiano": "Impossibile salvare l'indirizzo di consegna: il server non lo accetta ancora. Non è cambiato nulla; il testo è ancora qui.",
    "Español (Spanish)": "No se pudo guardar la dirección de entrega: el servidor aún no la acepta. No ha cambiado nada; tu texto sigue aquí.",
    "Português": "Não foi possível guardar a morada de entrega: o servidor ainda não a aceita. Nada foi alterado; o seu texto continua aqui.",
    "Русский (Russian)": "Не удалось сохранить адрес доставки: сервер пока его не принимает. Ничего не изменилось; ваш текст остался здесь.",
    "日本語 (Japanese)": "配送先住所を保存できませんでした。サーバーがまだ対応していません。何も変更されておらず、入力内容はそのまま残っています。",
    "中文 (Chinese)": "无法保存收货地址：服务器尚不支持。没有任何更改，你输入的内容仍在这里。",
    "العربية (Arabic)": "تعذّر حفظ عنوان التسليم: الخادم لا يقبله بعد. لم يتغيّر شيء، وما كتبته لا يزال هنا.",
    "हिन्दी (Hindi)": "डिलीवरी पता सेव नहीं हो सका: सर्वर अभी इसे स्वीकार नहीं करता। कुछ नहीं बदला; आपका लिखा हुआ यहीं है।"
  }
};
