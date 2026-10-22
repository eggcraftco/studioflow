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
  }
};
