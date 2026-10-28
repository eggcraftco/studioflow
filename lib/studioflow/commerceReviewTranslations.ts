import type { StudioLanguage } from "./language";

// S-B client (28 Oct 2026, CUST-005 / CUST-006, UX): the "Needs review" list in Settings ▸ Integrations —
// the "possible duplicate customer" item (two cards, what conflicts, Same person / Different people), the
// reasons the engine writes that had no words yet, the inbound channel's own review card, and the two
// refusals resolveCommerceReview can answer. Every language in one table, keyed by English source text;
// only texts no other table carries (scripts/check-commerce-review-ui.mjs fails on a key that would
// overwrite an older translation). Screen texts: lib/studioflow/commerceReview.ts COMMERCE_REVIEW_SCREEN_TEXTS.
export const COMMERCE_REVIEW_TRANSLATIONS: Record<string, Partial<Record<StudioLanguage, string>>> = {
  // ---- reasons (functions/commerce/adapters/*.js) that read as raw codes until now
  "No order number from the store": {
    "Türkçe": "Mağazadan sipariş numarası gelmedi", "Deutsch": "Keine Bestellnummer vom Shop", "Français": "Aucun numéro de commande de la boutique",
    "Italiano": "Nessun numero d'ordine dal negozio", "Español (Spanish)": "La tienda no envió número de pedido", "Português": "A loja não enviou número de pedido",
    "Русский (Russian)": "Магазин не передал номер заказа", "日本語 (Japanese)": "ストアから注文番号が届いていません", "中文 (Chinese)": "店铺未提供订单号",
    "العربية (Arabic)": "لم يرسل المتجر رقم الطلب", "हिन्दी (Hindi)": "स्टोर से ऑर्डर नंबर नहीं मिला"
  },
  "Order currency differs from the shop's": {
    "Türkçe": "Sipariş para birimi mağazanınkinden farklı", "Deutsch": "Bestellwährung weicht von der des Shops ab", "Français": "La devise de la commande diffère de celle de la boutique",
    "Italiano": "La valuta dell'ordine è diversa da quella del negozio", "Español (Spanish)": "La moneda del pedido no coincide con la de la tienda", "Português": "A moeda do pedido é diferente da moeda da loja",
    "Русский (Russian)": "Валюта заказа отличается от валюты магазина", "日本語 (Japanese)": "注文の通貨がショップの通貨と異なります", "中文 (Chinese)": "订单货币与店铺货币不同",
    "العربية (Arabic)": "عملة الطلب تختلف عن عملة المتجر", "हिन्दी (Hindi)": "ऑर्डर की मुद्रा दुकान की मुद्रा से अलग है"
  },
  "Buyer not identified by the store": {
    "Türkçe": "Mağaza alıcıyı tanımlamadı", "Deutsch": "Käufer vom Shop nicht angegeben", "Français": "Acheteur non identifié par la boutique",
    "Italiano": "Acquirente non identificato dal negozio", "Español (Spanish)": "La tienda no identificó al comprador", "Português": "A loja não identificou o comprador",
    "Русский (Russian)": "Магазин не указал покупателя", "日本語 (Japanese)": "ストアが購入者を特定していません", "中文 (Chinese)": "店铺未提供买家身份",
    "العربية (Arabic)": "لم يحدد المتجر هوية المشتري", "हिन्दी (Hindi)": "स्टोर ने खरीदार की पहचान नहीं दी"
  },
  "Test order from the store": {
    "Türkçe": "Mağazadan gelen test siparişi", "Deutsch": "Testbestellung aus dem Shop", "Français": "Commande test de la boutique",
    "Italiano": "Ordine di prova dal negozio", "Español (Spanish)": "Pedido de prueba de la tienda", "Português": "Pedido de teste da loja",
    "Русский (Russian)": "Тестовый заказ из магазина", "日本語 (Japanese)": "ストアからのテスト注文", "中文 (Chinese)": "来自店铺的测试订单",
    "العربية (Arabic)": "طلب تجريبي من المتجر", "हिन्दी (Hindi)": "स्टोर से आया टेस्ट ऑर्डर"
  },
  "Buyer details not shared by the marketplace": {
    "Türkçe": "Pazar yeri alıcı bilgilerini paylaşmadı", "Deutsch": "Käuferdaten vom Marktplatz nicht freigegeben", "Français": "Coordonnées de l'acheteur non communiquées par la place de marché",
    "Italiano": "Dati dell'acquirente non condivisi dal marketplace", "Español (Spanish)": "El marketplace no compartió los datos del comprador", "Português": "O marketplace não partilhou os dados do comprador",
    "Русский (Russian)": "Маркетплейс не передал данные покупателя", "日本語 (Japanese)": "マーケットプレイスが購入者情報を共有していません", "中文 (Chinese)": "平台未提供买家信息",
    "العربية (Arabic)": "لم يشارك السوق الإلكتروني بيانات المشتري", "हिन्दी (Hindi)": "मार्केटप्लेस ने खरीदार की जानकारी साझा नहीं की"
  },

  // ---- what conflicts / agrees (commerce/customerMatch.js compare: email, phone, external_id)
  "Email differs": {
    "Türkçe": "E-posta farklı", "Deutsch": "E-Mail unterschiedlich", "Français": "E-mail différent", "Italiano": "Email diversa",
    "Español (Spanish)": "El correo es distinto", "Português": "E-mail diferente", "Русский (Russian)": "Эл. почта отличается",
    "日本語 (Japanese)": "メールアドレスが異なる", "中文 (Chinese)": "邮箱不同", "العربية (Arabic)": "البريد الإلكتروني مختلف", "हिन्दी (Hindi)": "ईमेल अलग है"
  },
  "Phone differs": {
    "Türkçe": "Telefon farklı", "Deutsch": "Telefon unterschiedlich", "Français": "Téléphone différent", "Italiano": "Telefono diverso",
    "Español (Spanish)": "El teléfono es distinto", "Português": "Telefone diferente", "Русский (Russian)": "Телефон отличается",
    "日本語 (Japanese)": "電話番号が異なる", "中文 (Chinese)": "电话不同", "العربية (Arabic)": "رقم الهاتف مختلف", "हिन्दी (Hindi)": "फ़ोन अलग है"
  },
  "Store customer ID differs": {
    "Türkçe": "Mağaza müşteri kimliği farklı", "Deutsch": "Kunden-ID im Shop unterschiedlich", "Français": "Identifiant client de la boutique différent",
    "Italiano": "ID cliente del negozio diverso", "Español (Spanish)": "El ID de cliente de la tienda es distinto", "Português": "ID de cliente da loja diferente",
    "Русский (Russian)": "ID клиента в магазине отличается", "日本語 (Japanese)": "ストアの顧客IDが異なる", "中文 (Chinese)": "店铺客户 ID 不同",
    "العربية (Arabic)": "معرّف العميل في المتجر مختلف", "हिन्दी (Hindi)": "स्टोर की ग्राहक ID अलग है"
  },
  "Same email": {
    "Türkçe": "Aynı e-posta", "Deutsch": "Gleiche E-Mail", "Français": "Même e-mail", "Italiano": "Stessa email",
    "Español (Spanish)": "Mismo correo", "Português": "Mesmo e-mail", "Русский (Russian)": "Та же эл. почта",
    "日本語 (Japanese)": "同じメールアドレス", "中文 (Chinese)": "邮箱相同", "العربية (Arabic)": "البريد الإلكتروني نفسه", "हिन्दी (Hindi)": "वही ईमेल"
  },
  "Same phone": {
    "Türkçe": "Aynı telefon", "Deutsch": "Gleiche Telefonnummer", "Français": "Même téléphone", "Italiano": "Stesso telefono",
    "Español (Spanish)": "Mismo teléfono", "Português": "Mesmo telefone", "Русский (Russian)": "Тот же телефон",
    "日本語 (Japanese)": "同じ電話番号", "中文 (Chinese)": "电话相同", "العربية (Arabic)": "رقم الهاتف نفسه", "हिन्दी (Hindi)": "वही फ़ोन"
  },
  "Same store customer ID": {
    "Türkçe": "Aynı mağaza müşteri kimliği", "Deutsch": "Gleiche Kunden-ID im Shop", "Français": "Même identifiant client de la boutique",
    "Italiano": "Stesso ID cliente del negozio", "Español (Spanish)": "Mismo ID de cliente de la tienda", "Português": "Mesmo ID de cliente da loja",
    "Русский (Russian)": "Тот же ID клиента в магазине", "日本語 (Japanese)": "同じストア顧客ID", "中文 (Chinese)": "店铺客户 ID 相同",
    "العربية (Arabic)": "معرّف العميل نفسه في المتجر", "हिन्दी (Hindi)": "वही स्टोर ग्राहक ID"
  },

  // ---- why the server asked (decideByName match.reason)
  "Same name, but their details differ.": {
    "Türkçe": "Ad aynı, ama bilgileri farklı.", "Deutsch": "Gleicher Name, aber unterschiedliche Angaben.", "Français": "Même nom, mais leurs coordonnées diffèrent.",
    "Italiano": "Stesso nome, ma i dati sono diversi.", "Español (Spanish)": "Mismo nombre, pero sus datos son distintos.", "Português": "Mesmo nome, mas os dados são diferentes.",
    "Русский (Russian)": "Имя совпадает, но данные отличаются.", "日本語 (Japanese)": "名前は同じですが、連絡先が異なります。", "中文 (Chinese)": "姓名相同，但信息不同。",
    "العربية (Arabic)": "الاسم نفسه، لكن البيانات مختلفة.", "हिन्दी (Hindi)": "नाम वही है, लेकिन जानकारी अलग है।"
  },
  "Same name and phone, but this order brings new details.": {
    "Türkçe": "Ad ve telefon aynı, ama bu sipariş yeni bilgiler getiriyor.", "Deutsch": "Gleicher Name und gleiche Telefonnummer, aber diese Bestellung bringt neue Angaben.",
    "Français": "Même nom et même téléphone, mais cette commande apporte de nouvelles coordonnées.", "Italiano": "Stesso nome e telefono, ma questo ordine porta dati nuovi.",
    "Español (Spanish)": "Mismo nombre y teléfono, pero este pedido trae datos nuevos.", "Português": "Mesmo nome e telefone, mas este pedido traz dados novos.",
    "Русский (Russian)": "Имя и телефон совпадают, но в этом заказе новые данные.", "日本語 (Japanese)": "名前と電話番号は同じですが、この注文には新しい情報があります。",
    "中文 (Chinese)": "姓名和电话相同，但此订单带来了新信息。", "العربية (Arabic)": "الاسم والهاتف نفسهما، لكن هذا الطلب يحمل بيانات جديدة.",
    "हिन्दी (Hindi)": "नाम और फ़ोन वही हैं, लेकिन इस ऑर्डर में नई जानकारी है।"
  },
  "Same name, but one of them has no email or phone to compare.": {
    "Türkçe": "Ad aynı, ama birinde karşılaştırılacak e-posta ya da telefon yok.", "Deutsch": "Gleicher Name, aber bei einem der beiden fehlt eine E-Mail oder Telefonnummer zum Vergleichen.",
    "Français": "Même nom, mais l'un des deux n'a ni e-mail ni téléphone à comparer.", "Italiano": "Stesso nome, ma uno dei due non ha email o telefono da confrontare.",
    "Español (Spanish)": "Mismo nombre, pero uno de los dos no tiene correo ni teléfono para comparar.", "Português": "Mesmo nome, mas um deles não tem e-mail nem telefone para comparar.",
    "Русский (Russian)": "Имя совпадает, но у одного из них нет эл. почты или телефона для сравнения.", "日本語 (Japanese)": "名前は同じですが、片方に比較できるメールアドレスや電話番号がありません。",
    "中文 (Chinese)": "姓名相同，但其中一方没有可比对的邮箱或电话。", "العربية (Arabic)": "الاسم نفسه، لكن أحدهما ليس لديه بريد إلكتروني أو هاتف للمقارنة.",
    "हिन्दी (Hindi)": "नाम वही है, लेकिन इनमें से एक के पास मिलान के लिए ईमेल या फ़ोन नहीं है।"
  },
  "Same name as an existing customer.": {
    "Türkçe": "Mevcut bir müşteriyle aynı ad.", "Deutsch": "Gleicher Name wie ein bestehender Kunde.", "Français": "Même nom qu'un client existant.",
    "Italiano": "Stesso nome di un cliente esistente.", "Español (Spanish)": "Mismo nombre que un cliente existente.", "Português": "Mesmo nome que um cliente existente.",
    "Русский (Russian)": "Имя совпадает с существующим клиентом.", "日本語 (Japanese)": "既存の顧客と同じ名前です。", "中文 (Chinese)": "与现有客户同名。",
    "العربية (Arabic)": "الاسم نفسه لعميل موجود.", "हिन्दी (Hindi)": "किसी मौजूदा ग्राहक जैसा ही नाम।"
  },

  // ---- the two cards and the owner's answer
  "Existing card": {
    "Türkçe": "Mevcut kart", "Deutsch": "Bestehende Karte", "Français": "Fiche existante", "Italiano": "Scheda esistente",
    "Español (Spanish)": "Ficha existente", "Português": "Ficha existente", "Русский (Russian)": "Существующая карточка",
    "日本語 (Japanese)": "既存のカード", "中文 (Chinese)": "现有卡片", "العربية (Arabic)": "البطاقة الحالية", "हिन्दी (Hindi)": "मौजूदा कार्ड"
  },
  "New card": {
    "Türkçe": "Yeni kart", "Deutsch": "Neue Karte", "Français": "Nouvelle fiche", "Italiano": "Nuova scheda",
    "Español (Spanish)": "Ficha nueva", "Português": "Nova ficha", "Русский (Russian)": "Новая карточка",
    "日本語 (Japanese)": "新しいカード", "中文 (Chinese)": "新卡片", "العربية (Arabic)": "البطاقة الجديدة", "हिन्दी (Hindi)": "नया कार्ड"
  },
  "This card is no longer there.": {
    "Türkçe": "Bu kart artık yok.", "Deutsch": "Diese Karte gibt es nicht mehr.", "Français": "Cette fiche n'existe plus.", "Italiano": "Questa scheda non esiste più.",
    "Español (Spanish)": "Esta ficha ya no existe.", "Português": "Esta ficha já não existe.", "Русский (Russian)": "Этой карточки больше нет.",
    "日本語 (Japanese)": "このカードはもうありません。", "中文 (Chinese)": "此卡片已不存在。", "العربية (Arabic)": "لم تعد هذه البطاقة موجودة.", "हिन्दी (Hindi)": "यह कार्ड अब मौजूद नहीं है।"
  },
  "Same person": {
    "Türkçe": "Aynı kişi", "Deutsch": "Dieselbe Person", "Français": "Même personne", "Italiano": "Stessa persona",
    "Español (Spanish)": "Misma persona", "Português": "Mesma pessoa", "Русский (Russian)": "Один и тот же человек",
    "日本語 (Japanese)": "同一人物", "中文 (Chinese)": "同一个人", "العربية (Arabic)": "الشخص نفسه", "हिन्दी (Hindi)": "एक ही व्यक्ति"
  },
  "Different people": {
    "Türkçe": "Farklı kişiler", "Deutsch": "Verschiedene Personen", "Français": "Personnes différentes", "Italiano": "Persone diverse",
    "Español (Spanish)": "Personas distintas", "Português": "Pessoas diferentes", "Русский (Russian)": "Разные люди",
    "日本語 (Japanese)": "別の人物", "中文 (Chinese)": "不同的人", "العربية (Arabic)": "أشخاص مختلفون", "हिन्दी (Hindi)": "अलग-अलग व्यक्ति"
  },
  "Same person merges the new card into the existing one. Different people keeps both.": {
    "Türkçe": "\"Aynı kişi\" yeni kartı mevcut karta birleştirir. \"Farklı kişiler\" ikisini de tutar.",
    "Deutsch": "„Dieselbe Person“ führt die neue Karte mit der bestehenden zusammen. „Verschiedene Personen“ behält beide.",
    "Français": "« Même personne » fusionne la nouvelle fiche avec la fiche existante. « Personnes différentes » conserve les deux.",
    "Italiano": "\"Stessa persona\" unisce la nuova scheda a quella esistente. \"Persone diverse\" le mantiene entrambe.",
    "Español (Spanish)": "\"Misma persona\" fusiona la ficha nueva con la existente. \"Personas distintas\" conserva las dos.",
    "Português": "\"Mesma pessoa\" junta a nova ficha à existente. \"Pessoas diferentes\" mantém as duas.",
    "Русский (Russian)": "«Один и тот же человек» объединяет новую карточку с существующей. «Разные люди» сохраняет обе.",
    "日本語 (Japanese)": "「同一人物」は新しいカードを既存のカードに統合します。「別の人物」は両方を残します。",
    "中文 (Chinese)": "“同一个人”会将新卡片合并到现有卡片中。“不同的人”会保留两张卡片。",
    "العربية (Arabic)": "«الشخص نفسه» يدمج البطاقة الجديدة في البطاقة الحالية. «أشخاص مختلفون» يُبقي على البطاقتين.",
    "हिन्दी (Hindi)": "\"एक ही व्यक्ति\" नए कार्ड को मौजूदा कार्ड में मर्ज करता है। \"अलग-अलग व्यक्ति\" दोनों को रखता है।"
  },
  "Merge the new card into the existing card? The existing card keeps its details, its empty fields are filled from the new card, and the new card is removed. Orders are not changed. This cannot be undone with a click.": {
    "Türkçe": "Yeni kart mevcut karta birleştirilsin mi? Mevcut kart kendi bilgilerini korur, boş alanları yeni karttan doldurulur ve yeni kart kaldırılır. Siparişler değişmez. Bu işlem tek tıkla geri alınamaz.",
    "Deutsch": "Die neue Karte mit der bestehenden Karte zusammenführen? Die bestehende Karte behält ihre Angaben, leere Felder werden aus der neuen Karte gefüllt, und die neue Karte wird entfernt. Bestellungen werden nicht geändert. Das lässt sich nicht mit einem Klick rückgängig machen.",
    "Français": "Fusionner la nouvelle fiche avec la fiche existante ? La fiche existante garde ses coordonnées, ses champs vides sont complétés à partir de la nouvelle fiche, puis la nouvelle fiche est supprimée. Les commandes ne sont pas modifiées. Cette action ne peut pas être annulée d'un clic.",
    "Italiano": "Unire la nuova scheda a quella esistente? La scheda esistente mantiene i suoi dati, i campi vuoti vengono compilati con quelli della nuova scheda e la nuova scheda viene rimossa. Gli ordini non vengono modificati. L'operazione non si può annullare con un clic.",
    "Español (Spanish)": "¿Fusionar la ficha nueva con la existente? La ficha existente conserva sus datos, sus campos vacíos se completan con la ficha nueva y la ficha nueva se elimina. Los pedidos no cambian. Esto no se puede deshacer con un clic.",
    "Português": "Juntar a nova ficha à ficha existente? A ficha existente mantém os seus dados, os campos vazios são preenchidos a partir da nova ficha e a nova ficha é removida. Os pedidos não são alterados. Isto não pode ser anulado com um clique.",
    "Русский (Russian)": "Объединить новую карточку с существующей? Существующая карточка сохранит свои данные, пустые поля заполнятся из новой карточки, а новая карточка будет удалена. Заказы не изменятся. Это нельзя отменить одним нажатием.",
    "日本語 (Japanese)": "新しいカードを既存のカードに統合しますか？既存のカードの情報はそのまま残り、空欄は新しいカードの情報で埋められ、新しいカードは削除されます。注文は変更されません。この操作はワンクリックでは元に戻せません。",
    "中文 (Chinese)": "将新卡片合并到现有卡片中？现有卡片保留其信息，空白字段由新卡片补全，然后删除新卡片。订单不会更改。此操作无法一键撤销。",
    "العربية (Arabic)": "هل تريد دمج البطاقة الجديدة في البطاقة الحالية؟ تحتفظ البطاقة الحالية ببياناتها، وتُملأ حقولها الفارغة من البطاقة الجديدة، ثم تُحذف البطاقة الجديدة. لا تتغير الطلبات. لا يمكن التراجع عن ذلك بنقرة واحدة.",
    "हिन्दी (Hindi)": "नए कार्ड को मौजूदा कार्ड में मर्ज करें? मौजूदा कार्ड की जानकारी वैसी ही रहती है, उसके खाली फ़ील्ड नए कार्ड से भरे जाते हैं, और नया कार्ड हटा दिया जाता है। ऑर्डर नहीं बदलते। इसे एक क्लिक से वापस नहीं किया जा सकता।"
  },
  "Yes, merge": {
    "Türkçe": "Evet, birleştir", "Deutsch": "Ja, zusammenführen", "Français": "Oui, fusionner", "Italiano": "Sì, unisci",
    "Español (Spanish)": "Sí, fusionar", "Português": "Sim, juntar", "Русский (Russian)": "Да, объединить",
    "日本語 (Japanese)": "はい、統合します", "中文 (Chinese)": "是，合并", "العربية (Arabic)": "نعم، ادمج", "हिन्दी (Hindi)": "हाँ, मर्ज करें"
  },
  "Merged into the existing card.": {
    "Türkçe": "Mevcut karta birleştirildi.", "Deutsch": "Mit der bestehenden Karte zusammengeführt.", "Français": "Fusionnée avec la fiche existante.",
    "Italiano": "Unita alla scheda esistente.", "Español (Spanish)": "Fusionada con la ficha existente.", "Português": "Integrada na ficha existente.",
    "Русский (Russian)": "Объединено с существующей карточкой.", "日本語 (Japanese)": "既存のカードに統合しました。", "中文 (Chinese)": "已合并到现有卡片。",
    "العربية (Arabic)": "تم الدمج في البطاقة الحالية.", "हिन्दी (Hindi)": "मौजूदा कार्ड में मर्ज कर दिया गया।"
  },
  "Kept as two customers.": {
    "Türkçe": "İki ayrı müşteri olarak tutuldu.", "Deutsch": "Als zwei Kunden behalten.", "Français": "Conservés comme deux clients.",
    "Italiano": "Mantenuti come due clienti.", "Español (Spanish)": "Se mantienen como dos clientes.", "Português": "Mantidos como dois clientes.",
    "Русский (Russian)": "Сохранены как два клиента.", "日本語 (Japanese)": "2人の顧客として残しました。", "中文 (Chinese)": "已保留为两个客户。",
    "العربية (Arabic)": "تم الإبقاء عليهما كعميلين منفصلين.", "हिन्दी (Hindi)": "दो अलग ग्राहकों के रूप में रखा गया।"
  },
  "Only the workspace owner can decide.": {
    "Türkçe": "Yalnızca çalışma alanı sahibi karar verebilir.", "Deutsch": "Nur der Inhaber des Arbeitsbereichs kann entscheiden.",
    "Français": "Seul le propriétaire de l'espace de travail peut décider.", "Italiano": "Solo il proprietario dello spazio di lavoro può decidere.",
    "Español (Spanish)": "Solo el propietario del espacio de trabajo puede decidir.", "Português": "Só o proprietário do espaço de trabalho pode decidir.",
    "Русский (Russian)": "Решение может принять только владелец рабочего пространства.", "日本語 (Japanese)": "判断できるのはワークスペースのオーナーだけです。",
    "中文 (Chinese)": "只有工作区所有者可以决定。", "العربية (Arabic)": "لا يمكن اتخاذ القرار إلا لمالك مساحة العمل.", "हिन्दी (Hindi)": "केवल वर्कस्पेस का मालिक तय कर सकता है।"
  },

  // ---- the inbound channel's own review card (Settings ▸ Integrations ▸ Other Platforms)
  "Website orders": {
    "Türkçe": "Web sitesi siparişleri", "Deutsch": "Website-Bestellungen", "Français": "Commandes du site web", "Italiano": "Ordini dal sito web",
    "Español (Spanish)": "Pedidos del sitio web", "Português": "Pedidos do site", "Русский (Russian)": "Заказы с сайта",
    "日本語 (Japanese)": "ウェブサイトの注文", "中文 (Chinese)": "网站订单", "العربية (Arabic)": "طلبات الموقع الإلكتروني", "हिन्दी (Hindi)": "वेबसाइट ऑर्डर"
  },
  "Orders posted to your Delivery URL whose buyer may already be one of your customers.": {
    "Türkçe": "Teslimat URL'nize gönderilen ve alıcısı zaten müşterilerinizden biri olabilecek siparişler.",
    "Deutsch": "An Ihre Delivery-URL gesendete Bestellungen, deren Käufer vielleicht schon einer Ihrer Kunden ist.",
    "Français": "Commandes envoyées à votre URL de livraison dont l'acheteur est peut-être déjà l'un de vos clients.",
    "Italiano": "Ordini inviati al tuo URL di consegna il cui acquirente potrebbe essere già uno dei tuoi clienti.",
    "Español (Spanish)": "Pedidos enviados a tu URL de entrega cuyo comprador quizá ya sea uno de tus clientes.",
    "Português": "Pedidos enviados para o seu URL de entrega cujo comprador pode já ser um dos seus clientes.",
    "Русский (Russian)": "Заказы, отправленные на ваш URL доставки, покупатель которых, возможно, уже есть среди ваших клиентов.",
    "日本語 (Japanese)": "配信 URL に送信された注文のうち、購入者がすでに顧客として登録されている可能性があるもの。",
    "中文 (Chinese)": "发送到你的投递 URL、且买家可能已是你现有客户的订单。",
    "العربية (Arabic)": "الطلبات المرسلة إلى رابط التسليم الخاص بك والتي قد يكون مشتريها أحد عملائك بالفعل.",
    "हिन्दी (Hindi)": "आपके डिलीवरी URL पर भेजे गए ऐसे ऑर्डर जिनका खरीदार शायद पहले से आपका ग्राहक है।"
  },

  // ---- resolveCommerceReview's own refusals (shown through friendlyErrorMessage → studioT)
  "The customer to keep is no longer in this workspace.": {
    "Türkçe": "Tutulacak müşteri artık bu çalışma alanında değil.", "Deutsch": "Der zu behaltende Kunde ist nicht mehr in diesem Arbeitsbereich.",
    "Français": "Le client à conserver n'est plus dans cet espace de travail.", "Italiano": "Il cliente da mantenere non è più in questo spazio di lavoro.",
    "Español (Spanish)": "El cliente que se iba a conservar ya no está en este espacio de trabajo.", "Português": "O cliente a manter já não está neste espaço de trabalho.",
    "Русский (Russian)": "Клиента, которого нужно сохранить, больше нет в этом рабочем пространстве.", "日本語 (Japanese)": "残す顧客はこのワークスペースにもう存在しません。",
    "中文 (Chinese)": "要保留的客户已不在此工作区中。", "العربية (Arabic)": "لم يعد العميل المراد الإبقاء عليه موجودًا في مساحة العمل هذه.",
    "हिन्दी (Hindi)": "जिस ग्राहक को रखना था, वह अब इस वर्कस्पेस में नहीं है।"
  },
  "No such review item in this workspace.": {
    "Türkçe": "Bu çalışma alanında böyle bir inceleme öğesi yok.", "Deutsch": "Diesen Prüfeintrag gibt es in diesem Arbeitsbereich nicht.",
    "Français": "Cet élément à vérifier n'existe pas dans cet espace de travail.", "Italiano": "Questo elemento da rivedere non esiste in questo spazio di lavoro.",
    "Español (Spanish)": "Este elemento por revisar no existe en este espacio de trabajo.", "Português": "Este item para rever não existe neste espaço de trabalho.",
    "Русский (Russian)": "Такого элемента для проверки в этом рабочем пространстве нет.", "日本語 (Japanese)": "このワークスペースにはその確認項目がありません。",
    "中文 (Chinese)": "此工作区中没有该待审核项。", "العربية (Arabic)": "لا يوجد عنصر مراجعة كهذا في مساحة العمل هذه.",
    "हिन्दी (Hindi)": "इस वर्कस्पेस में ऐसा कोई समीक्षा आइटम नहीं है।"
  }
};
