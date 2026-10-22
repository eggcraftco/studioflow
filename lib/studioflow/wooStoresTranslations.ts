import type { StudioLanguage } from "./language";

// Multistore (23 Oct 2026): Settings ▸ Integrations ▸ WooCommerce lists every
// store of the workspace, adds another one, and says which workspace (business)
// a store joins. Every language in one table, keyed by source text; merged after
// the MC-2 table in language.ts. Probe: `npx tsx scripts/check-woo-stores-translations.mts`.
export const WOO_STORES_TRANSLATIONS: Record<string, Partial<Record<StudioLanguage, string>>> = {
  "This workspace": {
    "Türkçe": "Bu çalışma alanı", "Deutsch": "Dieser Arbeitsbereich", "Français": "Cet espace de travail", "Italiano": "Questo spazio di lavoro",
    "Español (Spanish)": "Este espacio de trabajo", "Português": "Este espaço de trabalho", "Русский (Russian)": "Это рабочее пространство",
    "日本語 (Japanese)": "このワークスペース", "中文 (Chinese)": "此工作区", "العربية (Arabic)": "مساحة العمل هذه", "हिन्दी (Hindi)": "यह वर्कस्पेस"
  },
  "Add another store": {
    "Türkçe": "Başka bir mağaza ekle", "Deutsch": "Weiteren Shop hinzufügen", "Français": "Ajouter une autre boutique", "Italiano": "Aggiungi un altro negozio",
    "Español (Spanish)": "Añadir otra tienda", "Português": "Adicionar outra loja", "Русский (Russian)": "Добавить ещё один магазин",
    "日本語 (Japanese)": "別のストアを追加", "中文 (Chinese)": "添加另一个店铺", "العربية (Arabic)": "إضافة متجر آخر", "हिन्दी (Hindi)": "एक और स्टोर जोड़ें"
  },
  "Stores in this workspace": {
    "Türkçe": "Bu çalışma alanındaki mağazalar", "Deutsch": "Shops in diesem Arbeitsbereich", "Français": "Boutiques de cet espace de travail", "Italiano": "Negozi in questo spazio di lavoro",
    "Español (Spanish)": "Tiendas de este espacio de trabajo", "Português": "Lojas deste espaço de trabalho", "Русский (Russian)": "Магазины в этом рабочем пространстве",
    "日本語 (Japanese)": "このワークスペースのストア", "中文 (Chinese)": "此工作区中的店铺", "العربية (Arabic)": "المتاجر في مساحة العمل هذه", "हिन्दी (Hindi)": "इस वर्कस्पेस के स्टोर"
  },
  "Selected": {
    "Türkçe": "Seçili", "Deutsch": "Ausgewählt", "Français": "Sélectionnée", "Italiano": "Selezionato",
    "Español (Spanish)": "Seleccionada", "Português": "Selecionada", "Русский (Russian)": "Выбран",
    "日本語 (Japanese)": "選択中", "中文 (Chinese)": "已选择", "العربية (Arabic)": "محدد", "हिन्दी (Hindi)": "चयनित"
  },
  "The store is added to this workspace (business):": {
    "Türkçe": "Mağaza şu çalışma alanına (işletmeye) eklenecek:", "Deutsch": "Der Shop wird diesem Arbeitsbereich (Unternehmen) hinzugefügt:",
    "Français": "La boutique sera ajoutée à cet espace de travail (entreprise) :", "Italiano": "Il negozio viene aggiunto a questo spazio di lavoro (attività):",
    "Español (Spanish)": "La tienda se añadirá a este espacio de trabajo (empresa):", "Português": "A loja será adicionada a este espaço de trabalho (empresa):",
    "Русский (Russian)": "Магазин будет добавлен в это рабочее пространство (компанию):", "日本語 (Japanese)": "ストアはこのワークスペース（事業）に追加されます:",
    "中文 (Chinese)": "店铺将添加到此工作区（企业）：", "العربية (Arabic)": "ستتم إضافة المتجر إلى مساحة العمل هذه (النشاط التجاري):", "हिन्दी (Hindi)": "स्टोर इस वर्कस्पेस (व्यवसाय) में जोड़ा जाएगा:"
  },
  "Stores of the same business, for example a second brand, belong in one workspace. Connecting another store never creates a new company or a second subscription. A separate company should use its own workspace.": {
    "Türkçe": "Aynı işletmenin mağazaları (örneğin ikinci bir marka) tek çalışma alanında durur. Başka bir mağaza bağlamak hiçbir zaman yeni bir şirket ya da ikinci bir abonelik oluşturmaz. Ayrı bir şirket kendi çalışma alanını kullanmalıdır.",
    "Deutsch": "Shops desselben Unternehmens, zum Beispiel einer zweiten Marke, gehören in einen Arbeitsbereich. Ein weiterer Shop legt nie ein neues Unternehmen oder ein zweites Abonnement an. Ein separates Unternehmen sollte einen eigenen Arbeitsbereich verwenden.",
    "Français": "Les boutiques d'une même entreprise, par exemple une deuxième marque, vont dans un seul espace de travail. Connecter une autre boutique ne crée jamais une nouvelle entreprise ni un deuxième abonnement. Une entreprise distincte doit utiliser son propre espace de travail.",
    "Italiano": "I negozi della stessa attività, ad esempio un secondo marchio, stanno in un unico spazio di lavoro. Collegare un altro negozio non crea mai una nuova azienda né un secondo abbonamento. Un'azienda separata dovrebbe usare il proprio spazio di lavoro.",
    "Español (Spanish)": "Las tiendas de una misma empresa, por ejemplo una segunda marca, van en un solo espacio de trabajo. Conectar otra tienda nunca crea una empresa nueva ni una segunda suscripción. Una empresa distinta debe usar su propio espacio de trabajo.",
    "Português": "As lojas da mesma empresa, por exemplo uma segunda marca, ficam num único espaço de trabalho. Ligar outra loja nunca cria uma nova empresa nem uma segunda assinatura. Uma empresa separada deve usar o seu próprio espaço de trabalho.",
    "Русский (Russian)": "Магазины одной компании, например второго бренда, находятся в одном рабочем пространстве. Подключение ещё одного магазина никогда не создаёт новую компанию или вторую подписку. Отдельной компании следует использовать собственное рабочее пространство.",
    "日本語 (Japanese)": "同じ事業のストア（たとえば2つ目のブランド）は1つのワークスペースに入ります。別のストアを接続しても、新しい会社や2つ目のサブスクリプションが作成されることはありません。別会社には専用のワークスペースを使ってください。",
    "中文 (Chinese)": "同一企业的店铺（例如第二个品牌）放在同一个工作区。连接另一个店铺绝不会创建新公司或第二个订阅。独立的公司应使用自己的工作区。",
    "العربية (Arabic)": "متاجر النشاط التجاري نفسه، مثل علامة تجارية ثانية، تكون في مساحة عمل واحدة. ربط متجر آخر لا ينشئ أبدًا شركة جديدة أو اشتراكًا ثانيًا. يجب أن تستخدم الشركة المستقلة مساحة عمل خاصة بها.",
    "हिन्दी (Hindi)": "एक ही व्यवसाय के स्टोर, जैसे दूसरा ब्रांड, एक ही वर्कस्पेस में रहते हैं। दूसरा स्टोर जोड़ने से कभी नई कंपनी या दूसरी सदस्यता नहीं बनती। अलग कंपनी को अपना अलग वर्कस्पेस इस्तेमाल करना चाहिए।"
  },
  "Choosing a brand for a store later only labels its sales. It does not change the business, the subscription or who owns the workspace.": {
    "Türkçe": "Daha sonra bir mağazaya marka seçmek yalnızca satışlarını etiketler. İşletmeyi, aboneliği ya da çalışma alanının sahibini değiştirmez.",
    "Deutsch": "Eine spätere Markenwahl für einen Shop kennzeichnet nur seine Verkäufe. Sie ändert weder das Unternehmen noch das Abonnement oder den Eigentümer des Arbeitsbereichs.",
    "Français": "Choisir plus tard une marque pour une boutique ne fait qu'étiqueter ses ventes. Cela ne change ni l'entreprise, ni l'abonnement, ni le propriétaire de l'espace de travail.",
    "Italiano": "Scegliere in seguito un marchio per un negozio etichetta solo le sue vendite. Non cambia l'attività, l'abbonamento né il proprietario dello spazio di lavoro.",
    "Español (Spanish)": "Elegir más tarde una marca para una tienda solo etiqueta sus ventas. No cambia la empresa, la suscripción ni el propietario del espacio de trabajo.",
    "Português": "Escolher mais tarde uma marca para uma loja apenas etiqueta as suas vendas. Não altera a empresa, a assinatura nem o proprietário do espaço de trabalho.",
    "Русский (Russian)": "Выбор бренда для магазина позже лишь помечает его продажи. Он не меняет компанию, подписку или владельца рабочего пространства.",
    "日本語 (Japanese)": "後からストアにブランドを選んでも、売上にラベルが付くだけです。事業、サブスクリプション、ワークスペースの所有者は変わりません。",
    "中文 (Chinese)": "之后为店铺选择品牌只会给其销售加标签，不会改变企业、订阅或工作区的所有者。",
    "العربية (Arabic)": "اختيار علامة تجارية لمتجر لاحقًا يضع تسمية على مبيعاته فقط. ولا يغيّر النشاط التجاري أو الاشتراك أو مالك مساحة العمل.",
    "हिन्दी (Hindi)": "बाद में किसी स्टोर के लिए ब्रांड चुनने से केवल उसकी बिक्री पर लेबल लगता है। इससे व्यवसाय, सदस्यता या वर्कस्पेस का मालिक नहीं बदलता।"
  }
};
