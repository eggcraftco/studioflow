import type { StudioLanguage } from "./language";

// MC-2 (22 Oct 2026): Sales store and brand filters, the per-store Channels list
// and the optional brand set-up. Every language in one table, keyed by source
// text (never split by language — see translation-merge-order); merged last in
// language.ts so no earlier table can hide a cell. Probe:
// `npx tsx scripts/check-sales-mc2-translations.mts`.
export const SALES_STORES_TRANSLATIONS: Record<string, Partial<Record<StudioLanguage, string>>> = {
  "Every store": {
    "Türkçe": "Tüm mağazalar", "Deutsch": "Alle Shops", "Français": "Toutes les boutiques", "Italiano": "Tutti i negozi",
    "Español (Spanish)": "Todas las tiendas", "Português": "Todas as lojas", "Русский (Russian)": "Все магазины",
    "日本語 (Japanese)": "すべてのストア", "中文 (Chinese)": "所有店铺", "العربية (Arabic)": "كل المتاجر", "हिन्दी (Hindi)": "सभी स्टोर"
  },
  "Every brand": {
    "Türkçe": "Tüm markalar", "Deutsch": "Alle Marken", "Français": "Toutes les marques", "Italiano": "Tutti i marchi",
    "Español (Spanish)": "Todas las marcas", "Português": "Todas as marcas", "Русский (Russian)": "Все бренды",
    "日本語 (Japanese)": "すべてのブランド", "中文 (Chinese)": "所有品牌", "العربية (Arabic)": "كل العلامات التجارية", "हिन्दी (Hindi)": "सभी ब्रांड"
  },
  "No brand": {
    "Türkçe": "Markasız", "Deutsch": "Ohne Marke", "Français": "Sans marque", "Italiano": "Senza marchio",
    "Español (Spanish)": "Sin marca", "Português": "Sem marca", "Русский (Russian)": "Без бренда",
    "日本語 (Japanese)": "ブランドなし", "中文 (Chinese)": "无品牌", "العربية (Arabic)": "بلا علامة تجارية", "हिन्दी (Hindi)": "कोई ब्रांड नहीं"
  },
  "Two brands — choose one": {
    "Türkçe": "İki marka — birini seçin", "Deutsch": "Zwei Marken – bitte eine wählen", "Français": "Deux marques — choisissez-en une", "Italiano": "Due marchi — scegline uno",
    "Español (Spanish)": "Dos marcas: elige una", "Português": "Duas marcas — escolha uma", "Русский (Russian)": "Два бренда — выберите один",
    "日本語 (Japanese)": "ブランドが2つあります — 1つ選んでください", "中文 (Chinese)": "有两个品牌——请选择一个", "العربية (Arabic)": "علامتان تجاريتان — اختر واحدة", "हिन्दी (Hindi)": "दो ब्रांड — एक चुनें"
  },
  "From the store": {
    "Türkçe": "Mağazadan", "Deutsch": "Vom Shop", "Français": "Selon la boutique", "Italiano": "Dal negozio",
    "Español (Spanish)": "Según la tienda", "Português": "Pela loja", "Русский (Russian)": "По магазину",
    "日本語 (Japanese)": "ストアから", "中文 (Chinese)": "按店铺", "العربية (Arabic)": "حسب المتجر", "हिन्दी (Hindi)": "स्टोर से"
  },
  "Stores": {
    "Türkçe": "Mağazalar", "Deutsch": "Shops", "Français": "Boutiques", "Italiano": "Negozi",
    "Español (Spanish)": "Tiendas", "Português": "Lojas", "Русский (Russian)": "Магазины",
    "日本語 (Japanese)": "ストア", "中文 (Chinese)": "店铺", "العربية (Arabic)": "المتاجر", "हिन्दी (Hindi)": "स्टोर"
  },
  "Each connected shop account on its own, so two stores on the same platform are never mixed.": {
    "Türkçe": "Bağlı her mağaza hesabı ayrı gösterilir; aynı platformdaki iki mağaza asla karışmaz.",
    "Deutsch": "Jedes verbundene Shop-Konto einzeln, damit zwei Shops auf derselben Plattform nie vermischt werden.",
    "Français": "Chaque compte de boutique connecté à part, pour que deux boutiques sur la même plateforme ne soient jamais mélangées.",
    "Italiano": "Ogni account negozio collegato a sé, così due negozi sulla stessa piattaforma non si confondono mai.",
    "Español (Spanish)": "Cada cuenta de tienda conectada por separado, para que dos tiendas de la misma plataforma nunca se mezclen.",
    "Português": "Cada conta de loja ligada em separado, para que duas lojas na mesma plataforma nunca se misturem.",
    "Русский (Russian)": "Каждый подключённый магазин отдельно, чтобы два магазина на одной платформе никогда не смешивались.",
    "日本語 (Japanese)": "接続したストアのアカウントを1つずつ表示するので、同じプラットフォームの2つのストアが混ざることはありません。",
    "中文 (Chinese)": "每个已连接的店铺账户单独显示，同一平台上的两个店铺绝不会混在一起。",
    "العربية (Arabic)": "كل حساب متجر متصل على حدة، فلا يختلط متجران على المنصة نفسها أبدًا.",
    "हिन्दी (Hindi)": "हर कनेक्टेड स्टोर खाता अलग दिखता है, ताकि एक ही प्लेटफ़ॉर्म के दो स्टोर कभी न मिलें।"
  },
  "No stores connected yet.": {
    "Türkçe": "Henüz bağlı mağaza yok.", "Deutsch": "Noch keine Shops verbunden.", "Français": "Aucune boutique connectée pour l'instant.", "Italiano": "Ancora nessun negozio collegato.",
    "Español (Spanish)": "Aún no hay tiendas conectadas.", "Português": "Ainda não há lojas ligadas.", "Русский (Russian)": "Магазины пока не подключены.",
    "日本語 (Japanese)": "接続済みのストアはまだありません。", "中文 (Chinese)": "尚未连接任何店铺。", "العربية (Arabic)": "لا توجد متاجر متصلة بعد.", "हिन्दी (Hindi)": "अभी कोई स्टोर कनेक्ट नहीं है।"
  },
  "Error code": {
    "Türkçe": "Hata kodu", "Deutsch": "Fehlercode", "Français": "Code d'erreur", "Italiano": "Codice di errore",
    "Español (Spanish)": "Código de error", "Português": "Código de erro", "Русский (Russian)": "Код ошибки",
    "日本語 (Japanese)": "エラーコード", "中文 (Chinese)": "错误代码", "العربية (Arabic)": "رمز الخطأ", "हिन्दी (Hindi)": "त्रुटि कोड"
  },
  "Store name": {
    "Türkçe": "Mağaza adı", "Deutsch": "Shop-Name", "Français": "Nom de la boutique", "Italiano": "Nome del negozio",
    "Español (Spanish)": "Nombre de la tienda", "Português": "Nome da loja", "Русский (Russian)": "Название магазина",
    "日本語 (Japanese)": "ストア名", "中文 (Chinese)": "店铺名称", "العربية (Arabic)": "اسم المتجر", "हिन्दी (Hindi)": "स्टोर का नाम"
  },
  "Brands": {
    "Türkçe": "Markalar", "Deutsch": "Marken", "Français": "Marques", "Italiano": "Marchi",
    "Español (Spanish)": "Marcas", "Português": "Marcas", "Русский (Russian)": "Бренды",
    "日本語 (Japanese)": "ブランド", "中文 (Chinese)": "品牌", "العربية (Arabic)": "العلامات التجارية", "हिन्दी (Hindi)": "ब्रांड"
  },
  "Brands are optional. Link a brand to the stores it sells through; an order from a store with two brands waits for you to choose.": {
    "Türkçe": "Markalar isteğe bağlıdır. Bir markayı satış yaptığı mağazalara bağlayın; iki markalı bir mağazadan gelen sipariş, sizin seçmenizi bekler.",
    "Deutsch": "Marken sind optional. Verknüpfen Sie eine Marke mit den Shops, über die sie verkauft; ein Auftrag aus einem Shop mit zwei Marken wartet auf Ihre Wahl.",
    "Français": "Les marques sont facultatives. Liez une marque aux boutiques où elle vend ; une commande d'une boutique à deux marques attend votre choix.",
    "Italiano": "I marchi sono facoltativi. Collega un marchio ai negozi in cui vende; un ordine da un negozio con due marchi aspetta la tua scelta.",
    "Español (Spanish)": "Las marcas son opcionales. Vincula una marca a las tiendas en las que vende; un pedido de una tienda con dos marcas espera a que elijas.",
    "Português": "As marcas são opcionais. Ligue uma marca às lojas onde vende; uma encomenda de uma loja com duas marcas aguarda a sua escolha.",
    "Русский (Russian)": "Бренды необязательны. Свяжите бренд с магазинами, где он продаётся; заказ из магазина с двумя брендами ждёт вашего выбора.",
    "日本語 (Japanese)": "ブランドは任意です。ブランドを販売先のストアに紐づけてください。ブランドが2つあるストアの注文は、あなたが選ぶまで未割り当てのままです。",
    "中文 (Chinese)": "品牌是可选的。将品牌关联到它销售的店铺；来自有两个品牌的店铺的订单会等待您选择。",
    "العربية (Arabic)": "العلامات التجارية اختيارية. اربط العلامة بالمتاجر التي تبيع عبرها؛ والطلب الوارد من متجر له علامتان ينتظر اختيارك.",
    "हिन्दी (Hindi)": "ब्रांड वैकल्पिक हैं। किसी ब्रांड को उन स्टोर से जोड़ें जिनसे वह बिकता है; दो ब्रांड वाले स्टोर का ऑर्डर आपके चुनने तक प्रतीक्षा करता है।"
  },
  "No brands yet.": {
    "Türkçe": "Henüz marka yok.", "Deutsch": "Noch keine Marken.", "Français": "Aucune marque pour l'instant.", "Italiano": "Ancora nessun marchio.",
    "Español (Spanish)": "Aún no hay marcas.", "Português": "Ainda não há marcas.", "Русский (Russian)": "Брендов пока нет.",
    "日本語 (Japanese)": "ブランドはまだありません。", "中文 (Chinese)": "暂无品牌。", "العربية (Arabic)": "لا توجد علامات تجارية بعد.", "हिन्दी (Hindi)": "अभी कोई ब्रांड नहीं।"
  },
  "Delete this brand? Orders keep their store; nothing else changes.": {
    "Türkçe": "Bu marka silinsin mi? Siparişler mağazalarını korur; başka hiçbir şey değişmez.",
    "Deutsch": "Diese Marke löschen? Aufträge behalten ihren Shop; sonst ändert sich nichts.",
    "Français": "Supprimer cette marque ? Les commandes gardent leur boutique ; rien d'autre ne change.",
    "Italiano": "Eliminare questo marchio? Gli ordini mantengono il loro negozio; nient'altro cambia.",
    "Español (Spanish)": "¿Eliminar esta marca? Los pedidos conservan su tienda; nada más cambia.",
    "Português": "Eliminar esta marca? As encomendas mantêm a sua loja; nada mais muda.",
    "Русский (Russian)": "Удалить этот бренд? Заказы сохранят свой магазин, больше ничего не изменится.",
    "日本語 (Japanese)": "このブランドを削除しますか？注文のストアはそのままで、ほかは何も変わりません。",
    "中文 (Chinese)": "删除此品牌？订单仍保留其店铺，其他一切不变。",
    "العربية (Arabic)": "حذف هذه العلامة التجارية؟ تحتفظ الطلبات بمتجرها ولا يتغير شيء آخر.",
    "हिन्दी (Hindi)": "यह ब्रांड हटाएँ? ऑर्डर अपना स्टोर रखेंगे; और कुछ नहीं बदलेगा।"
  },
  "Not linked to a store yet": {
    "Türkçe": "Henüz bir mağazaya bağlı değil", "Deutsch": "Noch mit keinem Shop verknüpft", "Français": "Pas encore liée à une boutique", "Italiano": "Non ancora collegato a un negozio",
    "Español (Spanish)": "Aún no vinculada a una tienda", "Português": "Ainda não ligada a uma loja", "Русский (Russian)": "Пока не связан с магазином",
    "日本語 (Japanese)": "まだストアに紐づいていません", "中文 (Chinese)": "尚未关联店铺", "العربية (Arabic)": "غير مرتبطة بمتجر بعد", "हिन्दी (Hindi)": "अभी किसी स्टोर से नहीं जुड़ा"
  },
  "Brand name": {
    "Türkçe": "Marka adı", "Deutsch": "Markenname", "Français": "Nom de la marque", "Italiano": "Nome del marchio",
    "Español (Spanish)": "Nombre de la marca", "Português": "Nome da marca", "Русский (Russian)": "Название бренда",
    "日本語 (Japanese)": "ブランド名", "中文 (Chinese)": "品牌名称", "العربية (Arabic)": "اسم العلامة التجارية", "हिन्दी (Hindi)": "ब्रांड का नाम"
  },
  "Linked stores": {
    "Türkçe": "Bağlı mağazalar", "Deutsch": "Verknüpfte Shops", "Français": "Boutiques liées", "Italiano": "Negozi collegati",
    "Español (Spanish)": "Tiendas vinculadas", "Português": "Lojas ligadas", "Русский (Russian)": "Связанные магазины",
    "日本語 (Japanese)": "紐づいたストア", "中文 (Chinese)": "关联的店铺", "العربية (Arabic)": "المتاجر المرتبطة", "हिन्दी (Hindi)": "जुड़े स्टोर"
  },
  "New brand": {
    "Türkçe": "Yeni marka", "Deutsch": "Neue Marke", "Français": "Nouvelle marque", "Italiano": "Nuovo marchio",
    "Español (Spanish)": "Nueva marca", "Português": "Nova marca", "Русский (Russian)": "Новый бренд",
    "日本語 (Japanese)": "新しいブランド", "中文 (Chinese)": "新品牌", "العربية (Arabic)": "علامة تجارية جديدة", "हिन्दी (Hindi)": "नया ब्रांड"
  },
  "Only the owner or an admin can change brands and store names.": {
    "Türkçe": "Markaları ve mağaza adlarını yalnız sahip ya da bir yönetici değiştirebilir.",
    "Deutsch": "Nur der Inhaber oder ein Admin kann Marken und Shop-Namen ändern.",
    "Français": "Seul le propriétaire ou un administrateur peut modifier les marques et les noms de boutique.",
    "Italiano": "Solo il titolare o un amministratore può modificare marchi e nomi dei negozi.",
    "Español (Spanish)": "Solo el propietario o un administrador puede cambiar las marcas y los nombres de las tiendas.",
    "Português": "Só o proprietário ou um administrador pode alterar as marcas e os nomes das lojas.",
    "Русский (Russian)": "Менять бренды и названия магазинов может только владелец или администратор.",
    "日本語 (Japanese)": "ブランドとストア名を変更できるのはオーナーか管理者だけです。",
    "中文 (Chinese)": "只有所有者或管理员可以更改品牌和店铺名称。",
    "العربية (Arabic)": "لا يمكن تغيير العلامات التجارية وأسماء المتاجر إلا للمالك أو المسؤول.",
    "हिन्दी (Hindi)": "ब्रांड और स्टोर के नाम केवल मालिक या एडमिन बदल सकते हैं।"
  },
  "Could not save.": {
    "Türkçe": "Kaydedilemedi.", "Deutsch": "Konnte nicht gespeichert werden.", "Français": "Impossible d'enregistrer.", "Italiano": "Impossibile salvare.",
    "Español (Spanish)": "No se pudo guardar.", "Português": "Não foi possível guardar.", "Русский (Russian)": "Не удалось сохранить.",
    "日本語 (Japanese)": "保存できませんでした。", "中文 (Chinese)": "无法保存。", "العربية (Arabic)": "تعذّر الحفظ.", "हिन्दी (Hindi)": "सहेजा नहीं जा सका।"
  },
  "Connected means the channel is linked to this workspace. It does not mean orders have arrived from it. Channel orders are read-only here; where a channel supports it, product and stock links are managed per channel in Inventory.": {
    "Türkçe": "Bağlı, kanalın bu çalışma alanına bağlandığı anlamına gelir; oradan sipariş geldiği anlamına gelmez. Kanal siparişleri burada salt okunurdur; kanal destekliyorsa ürün ve stok bağlantıları Envanter'de kanal bazında yönetilir.",
    "Deutsch": "Verbunden heißt, der Kanal ist mit diesem Arbeitsbereich verknüpft – nicht, dass von dort schon Aufträge eingetroffen sind. Kanalaufträge sind hier schreibgeschützt; wo ein Kanal es unterstützt, werden Produkt- und Bestandsverknüpfungen pro Kanal unter Bestand verwaltet.",
    "Français": "Connecté signifie que le canal est relié à cet espace de travail, pas que des commandes en sont déjà arrivées. Les commandes des canaux sont ici en lecture seule ; quand un canal le permet, les liens produits et stock se gèrent canal par canal dans Inventaire.",
    "Italiano": "Collegato significa che il canale è associato a questo spazio di lavoro, non che siano già arrivati ordini. Qui gli ordini dei canali sono in sola lettura; dove un canale lo supporta, i collegamenti di prodotti e giacenze si gestiscono per canale in Inventario.",
    "Español (Spanish)": "Conectado significa que el canal está vinculado a este espacio de trabajo, no que ya hayan llegado pedidos de él. Aquí los pedidos de los canales son de solo lectura; cuando un canal lo permite, los vínculos de productos y stock se gestionan por canal en Inventario.",
    "Português": "Ligado significa que o canal está associado a este espaço de trabalho, não que já tenham chegado encomendas dele. Aqui as encomendas dos canais são apenas de leitura; quando um canal o permite, as ligações de produtos e stock gerem-se por canal em Inventário.",
    "Русский (Russian)": "«Подключено» означает, что канал связан с этой рабочей областью, а не то, что из него уже пришли заказы. Заказы из каналов здесь только для чтения; если канал это поддерживает, связи товаров и остатков настраиваются для каждого канала в разделе «Инвентарь».",
    "日本語 (Japanese)": "「接続済み」はチャネルがこのワークスペースに連携されていることを示し、注文がすでに届いたという意味ではありません。チャネルの注文はここでは読み取り専用です。対応しているチャネルでは、商品と在庫の連携を「在庫」でチャネルごとに管理します。",
    "中文 (Chinese)": "“已连接”表示该渠道已关联到此工作区，并不表示已有订单到达。渠道订单在此处为只读；渠道支持时，可在“库存”中按渠道管理产品和库存关联。",
    "العربية (Arabic)": "«متصل» تعني أن القناة مرتبطة بمساحة العمل هذه، ولا تعني أن طلبات قد وصلت منها. طلبات القنوات هنا للقراءة فقط؛ وحيث تدعم القناة ذلك، تُدار روابط المنتجات والمخزون لكل قناة في المخزون.",
    "हिन्दी (Hindi)": "“कनेक्टेड” का अर्थ है कि चैनल इस वर्कस्पेस से जुड़ा है, यह नहीं कि वहाँ से ऑर्डर आ चुके हैं। चैनल के ऑर्डर यहाँ केवल-पठन हैं; जहाँ चैनल इसका समर्थन करता है, उत्पाद और स्टॉक के लिंक इन्वेंटरी में हर चैनल के लिए अलग से प्रबंधित होते हैं।"
  },
  // MC-2 fix (23 Oct 2026): the Sales intro no longer says "nothing here is created or changed" —
  // orders are not changed from this screen, but the owner/admin does manage brands and store names.
  "Everything you have sold, from the orders you already have. Orders are not changed from this screen. The owner or an admin can manage brands and store names here.": {
    "Türkçe": "Sattığınız her şey, mevcut siparişlerinizden. Siparişler bu ekrandan değiştirilmez. Sahip ya da bir yönetici markaları ve mağaza adlarını burada yönetebilir.",
    "Deutsch": "Alles, was Sie verkauft haben, aus Ihren vorhandenen Aufträgen. Aufträge werden auf dieser Seite nicht geändert. Der Inhaber oder ein Admin kann hier Marken und Shop-Namen verwalten.",
    "Français": "Tout ce que vous avez vendu, à partir de vos commandes existantes. Les commandes ne sont pas modifiées depuis cet écran. Le propriétaire ou un administrateur peut gérer ici les marques et les noms de boutique.",
    "Italiano": "Tutto ciò che hai venduto, dagli ordini che hai già. Gli ordini non vengono modificati da questa schermata. Il titolare o un amministratore può gestire qui marchi e nomi dei negozi.",
    "Español (Spanish)": "Todo lo que has vendido, a partir de los pedidos que ya tienes. Los pedidos no se modifican desde esta pantalla. El propietario o un administrador puede gestionar aquí las marcas y los nombres de las tiendas.",
    "Português": "Tudo o que vendeu, a partir das encomendas que já tem. As encomendas não são alteradas a partir deste ecrã. O proprietário ou um administrador pode gerir aqui as marcas e os nomes das lojas.",
    "Русский (Russian)": "Всё, что вы продали, на основе уже имеющихся заказов. Заказы на этом экране не изменяются. Владелец или администратор может управлять здесь брендами и названиями магазинов.",
    "日本語 (Japanese)": "すでにある注文から見た、これまでの売上です。この画面から注文が変更されることはありません。オーナーまたは管理者は、ここでブランドとストア名を管理できます。",
    "中文 (Chinese)": "根据你已有的订单列出的全部销售。订单不会在此页面被更改。所有者或管理员可以在这里管理品牌和店铺名称。",
    "العربية (Arabic)": "كل ما بعته، مستمدًّا من الطلبات الموجودة لديك. لا تُعدَّل الطلبات من هذه الشاشة. يمكن للمالك أو المسؤول إدارة العلامات التجارية وأسماء المتاجر هنا.",
    "हिन्दी (Hindi)": "आपकी सभी बिक्री, आपके मौजूदा ऑर्डरों से। इस स्क्रीन से ऑर्डर नहीं बदले जाते। मालिक या एडमिन यहाँ ब्रांड और स्टोर के नाम प्रबंधित कर सकते हैं।"
  },
  // S-2 (23 Oct 2026): Settings → Sales, the menu switch (app/settings/SalesSettingsSection.tsx),
  // and the friendlyError sentences the Sales screens can now show (they had Turkish only).
  "Sales in the menu": {
    "Türkçe": "Menüde Satışlar", "Deutsch": "Verkäufe im Menü", "Français": "Ventes dans le menu", "Italiano": "Vendite nel menu", "Español (Spanish)": "Ventas en el menú", "Português": "Vendas no menu", "Русский (Russian)": "Продажи в меню", "日本語 (Japanese)": "メニューの「売上」", "中文 (Chinese)": "菜单中的“销售”", "العربية (Arabic)": "المبيعات في القائمة", "हिन्दी (Hindi)": "मेनू में बिक्री"
  },
  "Sales lists everything you have sold, from the orders you already have.": {
    "Türkçe": "Satışlar, mevcut siparişlerinizden sattığınız her şeyi listeler.", "Deutsch": "Verkäufe listet alles auf, was Sie verkauft haben – aus Ihren vorhandenen Aufträgen.", "Français": "Ventes liste tout ce que vous avez vendu, à partir de vos commandes existantes.", "Italiano": "Vendite elenca tutto ciò che hai venduto, dagli ordini che hai già.", "Español (Spanish)": "Ventas muestra todo lo que has vendido, a partir de los pedidos que ya tienes.", "Português": "Vendas lista tudo o que vendeu, a partir das encomendas que já tem.", "Русский (Russian)": "В разделе «Продажи» собрано всё, что вы продали, на основе уже имеющихся заказов.", "日本語 (Japanese)": "「売上」には、すでにある注文から、これまでに販売したものがすべて表示されます。", "中文 (Chinese)": "“销售”根据你已有的订单，列出你售出的全部内容。", "العربية (Arabic)": "تعرض المبيعات كل ما بعته، مستمدًّا من الطلبات الموجودة لديك.", "हिन्दी (Hindi)": "बिक्री में आपके मौजूदा ऑर्डरों से, आपने जो कुछ बेचा है वह सब दिखता है।"
  },
  "Show Sales in the menu": {
    "Türkçe": "Satışlar'ı menüde göster", "Deutsch": "Verkäufe im Menü anzeigen", "Français": "Afficher Ventes dans le menu", "Italiano": "Mostra Vendite nel menu", "Español (Spanish)": "Mostrar Ventas en el menú", "Português": "Mostrar Vendas no menu", "Русский (Russian)": "Показывать «Продажи» в меню", "日本語 (Japanese)": "メニューに「売上」を表示", "中文 (Chinese)": "在菜单中显示“销售”", "العربية (Arabic)": "إظهار المبيعات في القائمة", "हिन्दी (Hindi)": "मेनू में बिक्री दिखाएँ"
  },
  "For everyone in this workspace who can see orders. Workflow Only members never see Sales.": {
    "Türkçe": "Bu çalışma alanında siparişleri görebilen herkes için. Sadece İş Akışı üyeleri Satışlar'ı hiçbir zaman görmez.", "Deutsch": "Für alle in diesem Arbeitsbereich, die Aufträge sehen dürfen. Mitglieder mit „Nur Workflow“ sehen Verkäufe nie.", "Français": "Pour toutes les personnes de cet espace de travail qui peuvent voir les commandes. Les membres « Flux uniquement » ne voient jamais Ventes.", "Italiano": "Per tutti in questo spazio di lavoro che possono vedere gli ordini. I membri «Solo workflow» non vedono mai Vendite.", "Español (Spanish)": "Para todas las personas de este espacio de trabajo que pueden ver pedidos. Los miembros «Solo flujo» nunca ven Ventas.", "Português": "Para todas as pessoas deste espaço de trabalho que podem ver encomendas. Os membros «Apenas workflow» nunca veem Vendas.", "Русский (Russian)": "Для всех в этой рабочей области, кто может видеть заказы. Участники с ролью «Только процесс» никогда не видят «Продажи».", "日本語 (Japanese)": "このワークスペースで注文を閲覧できる全員が対象です。「ワークフローのみ」のメンバーには「売上」は表示されません。", "中文 (Chinese)": "适用于此工作区中所有可以查看订单的人。“仅工作流”成员永远看不到“销售”。", "العربية (Arabic)": "لكل من يستطيع رؤية الطلبات في مساحة العمل هذه. لا يرى أعضاء «سير العمل فقط» المبيعات أبدًا.", "हिन्दी (Hindi)": "इस वर्कस्पेस में ऑर्डर देख सकने वाले सभी के लिए। केवल-वर्कफ़्लो सदस्य बिक्री कभी नहीं देखते।"
  },
  "Sales is not open for this workspace yet. It is being opened workspace by workspace; until then this switch stays off.": {
    "Türkçe": "Satışlar bu çalışma alanı için henüz açık değil. Çalışma alanı çalışma alanı açılıyor; o zamana kadar bu düğme kapalı kalır.", "Deutsch": "Verkäufe ist für diesen Arbeitsbereich noch nicht freigeschaltet. Die Freischaltung erfolgt Arbeitsbereich für Arbeitsbereich; bis dahin bleibt dieser Schalter aus.", "Français": "Ventes n'est pas encore ouvert pour cet espace de travail. L'ouverture se fait espace par espace ; d'ici là, cet interrupteur reste désactivé.", "Italiano": "Vendite non è ancora attivo per questo spazio di lavoro. Viene attivato uno spazio alla volta; fino ad allora questo interruttore resta spento.", "Español (Spanish)": "Ventas aún no está disponible para este espacio de trabajo. Se está abriendo espacio por espacio; hasta entonces este interruptor permanece desactivado.", "Português": "Vendas ainda não está disponível para este espaço de trabalho. Está a ser aberto espaço a espaço; até lá este interruptor fica desligado.", "Русский (Russian)": "Раздел «Продажи» для этой рабочей области ещё не открыт. Его открывают поочерёдно для каждой рабочей области; до этого переключатель остаётся выключенным.", "日本語 (Japanese)": "このワークスペースでは「売上」はまだ利用できません。ワークスペースごとに順次公開しています。それまでこのスイッチはオフのままです。", "中文 (Chinese)": "此工作区尚未开放“销售”。我们正在逐个工作区开放；在此之前，此开关保持关闭。", "العربية (Arabic)": "المبيعات غير مفتوحة لمساحة العمل هذه بعد. يجري فتحها مساحةً تلو الأخرى؛ وحتى ذلك الحين يبقى هذا المفتاح مطفأً.", "हिन्दी (Hindi)": "इस वर्कस्पेस के लिए बिक्री अभी खुली नहीं है। इसे एक-एक वर्कस्पेस के लिए खोला जा रहा है; तब तक यह स्विच बंद रहेगा।"
  },
  "Only the workspace owner or an admin can change this.": {
    "Türkçe": "Bunu yalnız çalışma alanı sahibi ya da bir yönetici değiştirebilir.", "Deutsch": "Nur der Inhaber des Arbeitsbereichs oder ein Admin kann das ändern.", "Français": "Seul le propriétaire de l'espace de travail ou un administrateur peut modifier ce réglage.", "Italiano": "Solo il titolare dello spazio di lavoro o un amministratore può modificarlo.", "Español (Spanish)": "Solo el propietario del espacio de trabajo o un administrador puede cambiar esto.", "Português": "Apenas o proprietário do espaço de trabalho ou um administrador pode alterar isto.", "Русский (Russian)": "Изменить это может только владелец рабочей области или администратор.", "日本語 (Japanese)": "これを変更できるのはワークスペースのオーナーまたは管理者のみです。", "中文 (Chinese)": "只有工作区所有者或管理员可以更改此设置。", "العربية (Arabic)": "لا يمكن تغيير هذا إلا لمالك مساحة العمل أو مسؤول.", "हिन्दी (Hindi)": "इसे केवल वर्कस्पेस का मालिक या कोई एडमिन बदल सकता है।"
  },
  "This only adds or removes the menu item. It does not change who may open Sales: anyone who can see orders can still reach it at its address.": {
    "Türkçe": "Bu yalnız menü öğesini ekler ya da kaldırır. Satışlar'ı kimin açabileceğini değiştirmez: siparişleri görebilen herkes sayfaya adresinden yine ulaşabilir.", "Deutsch": "Damit wird nur der Menüpunkt hinzugefügt oder entfernt. Wer Verkäufe öffnen darf, ändert sich nicht: Wer Aufträge sehen darf, erreicht die Seite weiterhin über ihre Adresse.", "Français": "Ce réglage ajoute ou retire seulement l'élément du menu. Il ne change pas qui peut ouvrir Ventes : toute personne qui voit les commandes peut toujours y accéder par son adresse.", "Italiano": "Aggiunge o rimuove solo la voce di menu. Non cambia chi può aprire Vendite: chi può vedere gli ordini può comunque raggiungerla dal suo indirizzo.", "Español (Spanish)": "Esto solo añade o quita el elemento del menú. No cambia quién puede abrir Ventas: cualquiera que pueda ver pedidos puede seguir accediendo desde su dirección.", "Português": "Isto apenas adiciona ou remove o item do menu. Não altera quem pode abrir Vendas: quem consegue ver encomendas pode continuar a aceder pelo endereço.", "Русский (Russian)": "Это только добавляет или убирает пункт меню. Кто может открыть «Продажи», не меняется: любой, кто видит заказы, по-прежнему может открыть раздел по его адресу.", "日本語 (Japanese)": "これはメニュー項目を追加・削除するだけです。「売上」を開ける人は変わりません。注文を閲覧できる人は、引き続きアドレスから開けます。", "中文 (Chinese)": "这只会添加或移除菜单项，不会改变谁可以打开“销售”：任何可以查看订单的人仍可通过其地址访问。", "العربية (Arabic)": "هذا يضيف عنصر القائمة أو يزيله فقط. ولا يغيّر من يمكنه فتح المبيعات: يظل بإمكان كل من يرى الطلبات الوصول إليها عبر عنوانها.", "हिन्दी (Hindi)": "यह केवल मेनू आइटम जोड़ता या हटाता है। बिक्री कौन खोल सकता है, यह नहीं बदलता: ऑर्डर देख सकने वाला कोई भी व्यक्ति इसके पते से इसे अब भी खोल सकता है।"
  },
  "Sales is now in the menu.": {
    "Türkçe": "Satışlar artık menüde.", "Deutsch": "Verkäufe ist jetzt im Menü.", "Français": "Ventes est maintenant dans le menu.", "Italiano": "Vendite ora è nel menu.", "Español (Spanish)": "Ventas ya está en el menú.", "Português": "Vendas está agora no menu.", "Русский (Russian)": "«Продажи» теперь в меню.", "日本語 (Japanese)": "「売上」がメニューに追加されました。", "中文 (Chinese)": "“销售”现已显示在菜单中。", "العربية (Arabic)": "أصبحت المبيعات الآن في القائمة.", "हिन्दी (Hindi)": "बिक्री अब मेनू में है।"
  },
  "Sales is no longer in the menu.": {
    "Türkçe": "Satışlar artık menüde değil.", "Deutsch": "Verkäufe ist nicht mehr im Menü.", "Français": "Ventes n'est plus dans le menu.", "Italiano": "Vendite non è più nel menu.", "Español (Spanish)": "Ventas ya no está en el menú.", "Português": "Vendas já não está no menu.", "Русский (Russian)": "«Продажи» больше не отображаются в меню.", "日本語 (Japanese)": "「売上」はメニューから外れました。", "中文 (Chinese)": "“销售”已不再显示在菜单中。", "العربية (Arabic)": "لم تعد المبيعات في القائمة.", "हिन्दी (Hindi)": "बिक्री अब मेनू में नहीं है।"
  },
  "Show or hide Sales in the main menu.": {
    "Türkçe": "Satışlar'ı ana menüde gösterin ya da gizleyin.", "Deutsch": "Verkäufe im Hauptmenü ein- oder ausblenden.", "Français": "Afficher ou masquer Ventes dans le menu principal.", "Italiano": "Mostra o nascondi Vendite nel menu principale.", "Español (Spanish)": "Mostrar u ocultar Ventas en el menú principal.", "Português": "Mostrar ou ocultar Vendas no menu principal.", "Русский (Russian)": "Показать или скрыть «Продажи» в главном меню.", "日本語 (Japanese)": "メインメニューに「売上」を表示または非表示にします。", "中文 (Chinese)": "在主菜单中显示或隐藏“销售”。", "العربية (Arabic)": "إظهار المبيعات أو إخفاؤها في القائمة الرئيسية.", "हिन्दी (Hindi)": "मुख्य मेनू में बिक्री दिखाएँ या छिपाएँ।"
  },
  "Something went wrong. Please try again.": {
    "Türkçe": "Bir şeyler ters gitti. Lütfen tekrar deneyin.", "Deutsch": "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.", "Français": "Un problème est survenu. Veuillez réessayer.", "Italiano": "Qualcosa è andato storto. Riprova.", "Español (Spanish)": "Algo salió mal. Inténtalo de nuevo.", "Português": "Algo correu mal. Tente novamente.", "Русский (Russian)": "Что-то пошло не так. Попробуйте ещё раз.", "日本語 (Japanese)": "問題が発生しました。もう一度お試しください。", "中文 (Chinese)": "出了点问题，请重试。", "العربية (Arabic)": "حدث خطأ ما. يُرجى المحاولة مرة أخرى.", "हिन्दी (Hindi)": "कुछ गलत हो गया। कृपया फिर से कोशिश करें।"
  },
  "You don't have permission for this.": {
    "Türkçe": "Bunun için izniniz yok.", "Deutsch": "Dafür haben Sie keine Berechtigung.", "Français": "Vous n'avez pas l'autorisation pour cela.", "Italiano": "Non hai l'autorizzazione per farlo.", "Español (Spanish)": "No tienes permiso para esto.", "Português": "Não tem permissão para isto.", "Русский (Russian)": "У вас нет разрешения на это.", "日本語 (Japanese)": "この操作を行う権限がありません。", "中文 (Chinese)": "你没有执行此操作的权限。", "العربية (Arabic)": "ليس لديك إذن للقيام بذلك.", "हिन्दी (Hindi)": "आपके पास इसकी अनुमति नहीं है।"
  },
  "The server is busy. Please try again.": {
    "Türkçe": "Sunucu meşgul. Lütfen tekrar deneyin.", "Deutsch": "Der Server ist ausgelastet. Bitte versuchen Sie es erneut.", "Français": "Le serveur est occupé. Veuillez réessayer.", "Italiano": "Il server è occupato. Riprova.", "Español (Spanish)": "El servidor está ocupado. Inténtalo de nuevo.", "Português": "O servidor está ocupado. Tente novamente.", "Русский (Russian)": "Сервер занят. Попробуйте ещё раз.", "日本語 (Japanese)": "サーバーが混み合っています。もう一度お試しください。", "中文 (Chinese)": "服务器繁忙，请重试。", "العربية (Arabic)": "الخادم مشغول. يُرجى المحاولة مرة أخرى.", "हिन्दी (Hindi)": "सर्वर व्यस्त है। कृपया फिर से कोशिश करें।"
  },
  "Too many requests. Please try again in a moment.": {
    "Türkçe": "Çok fazla istek. Lütfen birazdan tekrar deneyin.", "Deutsch": "Zu viele Anfragen. Bitte versuchen Sie es gleich noch einmal.", "Français": "Trop de requêtes. Veuillez réessayer dans un instant.", "Italiano": "Troppe richieste. Riprova tra un momento.", "Español (Spanish)": "Demasiadas solicitudes. Inténtalo de nuevo en un momento.", "Português": "Demasiados pedidos. Tente novamente daqui a pouco.", "Русский (Russian)": "Слишком много запросов. Попробуйте чуть позже.", "日本語 (Japanese)": "リクエストが多すぎます。しばらくしてからもう一度お試しください。", "中文 (Chinese)": "请求过多，请稍后重试。", "العربية (Arabic)": "طلبات كثيرة جدًا. يُرجى المحاولة بعد قليل.", "हिन्दी (Hindi)": "बहुत अधिक अनुरोध। कृपया थोड़ी देर बाद फिर से कोशिश करें।"
  },
  "Please sign in again.": {
    "Türkçe": "Lütfen tekrar giriş yapın.", "Deutsch": "Bitte melden Sie sich erneut an.", "Français": "Veuillez vous reconnecter.", "Italiano": "Accedi di nuovo.", "Español (Spanish)": "Vuelve a iniciar sesión.", "Português": "Inicie sessão novamente.", "Русский (Russian)": "Пожалуйста, войдите снова.", "日本語 (Japanese)": "もう一度サインインしてください。", "中文 (Chinese)": "请重新登录。", "العربية (Arabic)": "يُرجى تسجيل الدخول مرة أخرى.", "हिन्दी (Hindi)": "कृपया फिर से साइन इन करें।"
  },
  // S-5 (23 Oct 2026): a filtered search that stopped at its safety cap (app/sales/page.tsx).
  "Checked {count} orders, no match yet.": {
    "Türkçe": "{count} siparişe bakıldı, henüz eşleşme yok.", "Deutsch": "{count} Aufträge geprüft, noch kein Treffer.", "Français": "{count} commandes vérifiées, aucune correspondance pour l'instant.", "Italiano": "{count} ordini controllati, ancora nessuna corrispondenza.", "Español (Spanish)": "Se revisaron {count} pedidos; aún no hay coincidencias.", "Português": "{count} encomendas verificadas, ainda sem correspondência.", "Русский (Russian)": "Проверено заказов: {count}. Совпадений пока нет.", "日本語 (Japanese)": "{count} 件の注文を確認しました。まだ一致するものはありません。", "中文 (Chinese)": "已检查 {count} 个订单，暂无匹配。", "العربية (Arabic)": "تم فحص {count} طلب، ولا توجد نتيجة مطابقة بعد.", "हिन्दी (Hindi)": "{count} ऑर्डर जाँचे गए, अभी तक कोई मेल नहीं।"
  },
  "Keep searching": {
    "Türkçe": "Aramaya devam et", "Deutsch": "Weitersuchen", "Français": "Continuer la recherche", "Italiano": "Continua a cercare", "Español (Spanish)": "Seguir buscando", "Português": "Continuar a procurar", "Русский (Russian)": "Продолжить поиск", "日本語 (Japanese)": "検索を続ける", "中文 (Chinese)": "继续搜索", "العربية (Arabic)": "متابعة البحث", "हिन्दी (Hindi)": "खोज जारी रखें"
  },
  // S6c/S6d (23 Oct 2026): rows on screen and the search capped; progress while a long search runs.
  "Checked {count} orders so far. Older orders may still match.": {
    "Türkçe": "Şimdiye kadar {count} siparişe bakıldı. Daha eski siparişler de eşleşebilir.", "Deutsch": "Bisher {count} Aufträge geprüft. Ältere Aufträge könnten noch passen.", "Français": "{count} commandes vérifiées jusqu'ici. Des commandes plus anciennes peuvent encore correspondre.", "Italiano": "Finora controllati {count} ordini. Ordini più vecchi potrebbero ancora corrispondere.", "Español (Spanish)": "Hasta ahora se revisaron {count} pedidos. Puede que pedidos más antiguos también coincidan.", "Português": "Até agora foram verificadas {count} encomendas. Encomendas mais antigas ainda podem corresponder.", "Русский (Russian)": "Пока проверено заказов: {count}. Более старые заказы тоже могут подойти.", "日本語 (Japanese)": "これまでに {count} 件の注文を確認しました。さらに古い注文が一致する可能性があります。", "中文 (Chinese)": "目前已检查 {count} 个订单。更早的订单可能仍有匹配。", "العربية (Arabic)": "تم فحص {count} طلب حتى الآن. قد تتطابق طلبات أقدم أيضًا.", "हिन्दी (Hindi)": "अब तक {count} ऑर्डर जाँचे गए। पुराने ऑर्डर भी मेल खा सकते हैं।"
  },
  "Checking orders… {count} so far": {
    "Türkçe": "Siparişlere bakılıyor… şimdiye kadar {count}", "Deutsch": "Aufträge werden geprüft … bisher {count}", "Français": "Vérification des commandes… {count} jusqu'ici", "Italiano": "Controllo degli ordini… finora {count}", "Español (Spanish)": "Revisando pedidos… {count} hasta ahora", "Português": "A verificar encomendas… {count} até agora", "Русский (Russian)": "Проверка заказов… пока {count}", "日本語 (Japanese)": "注文を確認中… これまでに {count} 件", "中文 (Chinese)": "正在检查订单… 已检查 {count} 个", "العربية (Arabic)": "جارٍ فحص الطلبات… {count} حتى الآن", "हिन्दी (Hindi)": "ऑर्डर जाँचे जा रहे हैं… अब तक {count}"
  }
};
