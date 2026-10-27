// Inventory categories: a starting set per trade (inventory fixes, 27 Oct 2026).
//
// A new workspace is seeded with a watch workshop's ten categories (functions/inventory.js DEFAULT_CATEGORIES:
// Watches, Dials, Movements, …). A baker or a tailor sees "Dials" and "Movements" in the sidebar until they find
// Inventory ▸ Manage ▸ Categories. The onboarding wizard already asks the trade (onboardingWorkKinds) and already
// turns it into the order cards' words (ONBOARDING_CARD_LABELS); this is the same idea for inventory categories:
//   * the Categories screen offers "a starting set for your trade" — preselected from the onboarding answer — that ADDS
//     the trade's categories (nothing renamed, nothing deleted: items carry the category title) and can hide the
//     watch-workshop categories that hold no items (archived = hidden from the sidebar, kept on the list);
//   * the sidebar says so once, while the list is still the untouched watch-workshop seed and the trade is another.
// The titles are written in the language of the person who applies the set (they are the workspace's own names from
// then on, like a typed one), except "Other": the server keeps a category literally called "Other" as the place for
// items whose category is removed (inventory.js CATEGORY_FALLBACK), so it stays the stored word and is translated
// where it is drawn, as today.
// This module imports nothing, so scripts/check-inventory-fixes.mjs can compile and run it.

export type CategoryTemplateKind = "watches_jewellery" | "repairs" | "leather" | "art_design" | "clothing" | "food" | "ceramics" | "made_to_order" | "other";
export type TemplateCategoryRow = { id: string; title: string; icon: string; archived: boolean; itemCount?: number };

type Lang = "Türkçe" | "Deutsch" | "Français" | "Italiano" | "Español (Spanish)" | "Português" | "Русский (Russian)" | "日本語 (Japanese)" | "中文 (Chinese)" | "العربية (Arabic)" | "हिन्दी (Hindi)";
export const TEMPLATE_LANGUAGES: Lang[] = ["Türkçe", "Deutsch", "Français", "Italiano", "Español (Spanish)", "Português", "Русский (Russian)", "日本語 (Japanese)", "中文 (Chinese)", "العربية (Arabic)", "हिन्दी (Hindi)"];
const L = (tr: string, de: string, fr: string, it: string, es: string, pt: string, ru: string, ja: string, zh: string, ar: string, hi: string): Record<Lang, string> =>
  ({ "Türkçe": tr, "Deutsch": de, "Français": fr, "Italiano": it, "Español (Spanish)": es, "Português": pt, "Русский (Russian)": ru, "日本語 (Japanese)": ja, "中文 (Chinese)": zh, "العربية (Arabic)": ar, "हिन्दी (Hindi)": hi });

/** The server's seed list (functions/inventory.js DEFAULT_CATEGORIES), in its order. */
export const WATCH_WORKSHOP_SEED = ["Watches", "Dials", "Movements", "Bracelets", "Straps", "Parts", "Consumables", "Packaging", "Tools", "Other"];
export const FALLBACK_CATEGORY = "Other";

/** Each trade's set: [English title, icon]. Icons come from the Categories screen's own icon list. */
export const CATEGORY_TEMPLATES: Record<CategoryTemplateKind, Array<[string, string]>> = {
  watches_jewellery: [["Watches", "⌚"], ["Dials", "◎"], ["Movements", "⚙"], ["Straps & Bracelets", "➰"], ["Rings", "◇"], ["Necklaces & Pendants", "✧"], ["Earrings", "✦"], ["Stones & Gems", "⬢"], ["Parts", "⚒"], ["Packaging", "▧"], ["Tools", "✄"], ["Other", "▪"]],
  repairs: [["Spare Parts", "⚙"], ["Batteries", "◐"], ["Consumables", "⚗"], ["Tools", "✄"], ["Packaging", "▧"], ["Other", "▪"]],
  leather: [["Leather", "▤"], ["Hardware", "⚙"], ["Thread & Dyes", "⚗"], ["Finished Goods", "❖"], ["Packaging", "▧"], ["Tools", "✄"], ["Other", "▪"]],
  art_design: [["Canvas & Paper", "▤"], ["Paints & Inks", "⚗"], ["Frames", "▦"], ["Finished Pieces", "❖"], ["Packaging", "▧"], ["Tools", "✄"], ["Other", "▪"]],
  clothing: [["Fabrics", "▤"], ["Trims & Notions", "✧"], ["Thread", "➰"], ["Finished Garments", "❖"], ["Packaging", "▧"], ["Tools", "✄"], ["Other", "▪"]],
  food: [["Ingredients", "⚗"], ["Decorations", "✦"], ["Boxes & Packaging", "▧"], ["Equipment", "⚙"], ["Other", "▪"]],
  ceramics: [["Clay", "◐"], ["Glazes", "⚗"], ["Kiln Supplies", "⬡"], ["Finished Pieces", "❖"], ["Packaging", "▧"], ["Tools", "✄"], ["Other", "▪"]],
  made_to_order: [["Materials", "▤"], ["Parts", "⚒"], ["Consumables", "⚗"], ["Finished Goods", "❖"], ["Packaging", "▧"], ["Tools", "✄"], ["Other", "▪"]],
  other: [["Materials", "▤"], ["Parts", "⚒"], ["Consumables", "⚗"], ["Finished Goods", "❖"], ["Packaging", "▧"], ["Tools", "✄"], ["Other", "▪"]]
};

/** Draft wording (owner approval pending), one row per title. "Other" is deliberately absent (see the header). */
export const TEMPLATE_TITLES: Record<string, Record<Lang, string>> = {
  "Watches": L("Saatler", "Uhren", "Montres", "Orologi", "Relojes", "Relógios", "Часы", "時計", "手表", "ساعات", "घड़ियाँ"),
  "Dials": L("Kadranlar", "Zifferblätter", "Cadrans", "Quadranti", "Esferas", "Mostradores", "Циферблаты", "文字盤", "表盘", "موانئ الساعات", "डायल"),
  "Movements": L("Mekanizmalar", "Uhrwerke", "Mouvements", "Movimenti", "Movimientos", "Movimentos", "Механизмы", "ムーブメント", "机芯", "حركات الساعات", "मूवमेंट"),
  "Straps & Bracelets": L("Kordonlar ve Bileklikler", "Bänder & Armbänder", "Bracelets de montre", "Cinturini e bracciali", "Correas y brazaletes", "Braceletes e pulseiras", "Ремешки и браслеты", "ストラップ・ブレスレット", "表带与手链", "أحزمة وأساور", "स्ट्रैप और ब्रेसलेट"),
  "Rings": L("Yüzükler", "Ringe", "Bagues", "Anelli", "Anillos", "Anéis", "Кольца", "指輪", "戒指", "خواتم", "अंगूठियाँ"),
  "Necklaces & Pendants": L("Kolyeler ve Kolye Uçları", "Ketten & Anhänger", "Colliers et pendentifs", "Collane e ciondoli", "Collares y colgantes", "Colares e pendentes", "Колье и подвески", "ネックレス・ペンダント", "项链与吊坠", "قلائد ودلايات", "हार और पेंडेंट"),
  "Earrings": L("Küpeler", "Ohrringe", "Boucles d'oreilles", "Orecchini", "Pendientes", "Brincos", "Серьги", "イヤリング", "耳环", "أقراط", "कान की बालियाँ"),
  "Stones & Gems": L("Taşlar ve Değerli Taşlar", "Steine & Edelsteine", "Pierres et gemmes", "Pietre e gemme", "Piedras y gemas", "Pedras e gemas", "Камни и самоцветы", "石・宝石", "石材与宝石", "أحجار وجواهر", "पत्थर और रत्न"),
  "Parts": L("Parçalar", "Teile", "Pièces", "Ricambi", "Piezas", "Peças", "Детали", "パーツ", "零件", "قطع", "पुर्ज़े"),
  "Packaging": L("Ambalaj", "Verpackung", "Emballage", "Imballaggi", "Embalaje", "Embalagens", "Упаковка", "梱包材", "包装", "تغليف", "पैकेजिंग"),
  "Tools": L("Aletler", "Werkzeuge", "Outils", "Attrezzi", "Herramientas", "Ferramentas", "Инструменты", "工具", "工具", "أدوات", "औज़ार"),
  "Spare Parts": L("Yedek Parçalar", "Ersatzteile", "Pièces détachées", "Pezzi di ricambio", "Repuestos", "Peças sobresselentes", "Запчасти", "交換部品", "备件", "قطع غيار", "स्पेयर पार्ट्स"),
  "Batteries": L("Piller", "Batterien", "Piles", "Batterie", "Pilas", "Pilhas", "Батарейки", "電池", "电池", "بطاريات", "बैटरियाँ"),
  "Consumables": L("Sarf Malzemeleri", "Verbrauchsmaterial", "Consommables", "Materiali di consumo", "Consumibles", "Consumíveis", "Расходные материалы", "消耗品", "耗材", "مستهلكات", "उपभोग्य सामग्री"),
  "Leather": L("Deri", "Leder", "Cuir", "Pelle", "Cuero", "Couro", "Кожа", "レザー", "皮革", "جلد", "चमड़ा"),
  "Hardware": L("Metal Aksesuarlar", "Beschläge", "Quincaillerie", "Minuteria", "Herrajes", "Ferragens", "Фурнитура", "金具", "五金配件", "إكسسوارات معدنية", "हार्डवेयर"),
  "Thread & Dyes": L("İplik ve Boyalar", "Garn & Farben", "Fils et teintures", "Fili e tinture", "Hilos y tintes", "Linhas e tintas", "Нитки и красители", "糸・染料", "线与染料", "خيوط وأصباغ", "धागे और रंग"),
  "Finished Goods": L("Bitmiş Ürünler", "Fertigwaren", "Produits finis", "Prodotti finiti", "Productos terminados", "Produtos acabados", "Готовые изделия", "完成品", "成品", "منتجات جاهزة", "तैयार माल"),
  "Canvas & Paper": L("Tuval ve Kâğıt", "Leinwand & Papier", "Toiles et papier", "Tele e carta", "Lienzos y papel", "Telas e papel", "Холсты и бумага", "キャンバス・紙", "画布与纸张", "قماش الرسم والورق", "कैनवास और कागज़"),
  "Paints & Inks": L("Boyalar ve Mürekkepler", "Farben & Tinten", "Peintures et encres", "Colori e inchiostri", "Pinturas y tintas", "Tintas e pigmentos", "Краски и чернила", "絵具・インク", "颜料与墨水", "ألوان وأحبار", "पेंट और स्याही"),
  "Frames": L("Çerçeveler", "Rahmen", "Cadres", "Cornici", "Marcos", "Molduras", "Рамы", "額縁", "画框", "إطارات", "फ्रेम"),
  "Finished Pieces": L("Bitmiş Eserler", "Fertige Stücke", "Pièces terminées", "Pezzi finiti", "Piezas terminadas", "Peças acabadas", "Готовые работы", "完成作品", "完成作品", "قطع جاهزة", "तैयार कृतियाँ"),
  "Fabrics": L("Kumaşlar", "Stoffe", "Tissus", "Tessuti", "Telas", "Tecidos", "Ткани", "生地", "面料", "أقمشة", "कपड़े"),
  "Trims & Notions": L("Aksesuar ve Tuhafiye", "Kurzwaren", "Mercerie", "Merceria", "Mercería", "Retrosaria", "Фурнитура и отделка", "副資材", "辅料", "مستلزمات الخياطة", "ट्रिम और सिलाई सामान"),
  "Thread": L("İplik", "Garn", "Fil", "Filo", "Hilo", "Linha", "Нитки", "糸", "线", "خيوط", "धागा"),
  "Finished Garments": L("Hazır Giysiler", "Fertige Kleidung", "Vêtements finis", "Capi finiti", "Prendas terminadas", "Roupa acabada", "Готовая одежда", "完成した衣類", "成衣", "ملابس جاهزة", "तैयार परिधान"),
  "Ingredients": L("Malzemeler", "Zutaten", "Ingrédients", "Ingredienti", "Ingredientes", "Ingredientes", "Ингредиенты", "材料", "原料", "مكونات", "सामग्री"),
  "Decorations": L("Süslemeler", "Dekoration", "Décorations", "Decorazioni", "Decoraciones", "Decorações", "Украшения", "デコレーション", "装饰", "زينة", "सजावट"),
  "Boxes & Packaging": L("Kutular ve Ambalaj", "Schachteln & Verpackung", "Boîtes et emballages", "Scatole e imballaggi", "Cajas y embalaje", "Caixas e embalagens", "Коробки и упаковка", "箱・梱包材", "盒子与包装", "علب وتغليف", "डिब्बे और पैकेजिंग"),
  "Equipment": L("Ekipman", "Ausrüstung", "Équipement", "Attrezzatura", "Equipamiento", "Equipamento", "Оборудование", "機材", "设备", "معدات", "उपकरण"),
  "Clay": L("Kil", "Ton", "Argile", "Argilla", "Arcilla", "Argila", "Глина", "粘土", "黏土", "طين", "मिट्टी"),
  "Glazes": L("Sırlar", "Glasuren", "Émaux", "Smalti", "Esmaltes", "Vidrados", "Глазури", "釉薬", "釉料", "طلاءات زجاجية", "ग्लेज़"),
  "Kiln Supplies": L("Fırın Malzemeleri", "Brennofenzubehör", "Fournitures de four", "Materiali per forno", "Suministros de horno", "Material de forno", "Принадлежности для печи", "窯道具", "窑具", "مستلزمات الفرن", "भट्ठी सामग्री"),
  "Materials": L("Hammaddeler", "Materialien", "Matériaux", "Materiali", "Materiales", "Materiais", "Материалы", "素材", "材料", "مواد", "कच्चा माल")
};

/** A title in `language` (English when the language is English or not in the table). "Other" is never translated here. */
export function templateTitle(english: string, language: string): string {
  if (english === FALLBACK_CATEGORY) return english;
  const row = Object.prototype.hasOwnProperty.call(TEMPLATE_TITLES, english) ? TEMPLATE_TITLES[english] : null;
  return row && Object.prototype.hasOwnProperty.call(row, language) ? row[language as Lang] : english;
}

export function isTemplateKind(value: unknown): value is CategoryTemplateKind {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CATEGORY_TEMPLATES, value);
}

/** The trade the onboarding wizard recorded (its first answer), when it is one of ours. */
export function templateKindFromWorkKinds(workKinds: unknown): CategoryTemplateKind | "" {
  const first = Array.isArray(workKinds) ? workKinds[0] : "";
  return isTemplateKind(first) ? first : "";
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Whether the list is still exactly the server's watch-workshop seed (same ten titles, none hidden). */
export function isUntouchedSeedList(rows: Array<{ title: string; archived?: boolean }>): boolean {
  const titles = rows.map((r) => r.title.trim());
  return titles.length === WATCH_WORKSHOP_SEED.length && rows.every((r) => !r.archived) && WATCH_WORKSHOP_SEED.every((t) => titles.includes(t));
}

/** The sidebar's one-line nudge: only while the list is the untouched seed AND the recorded trade is not watches. */
export function shouldSuggestTradeSet(rows: Array<{ title: string; archived?: boolean }>, workKinds: unknown): boolean {
  const kind = templateKindFromWorkKinds(workKinds);
  return Boolean(kind) && kind !== "watches_jewellery" && isUntouchedSeedList(rows);
}

/**
 * The list after applying a trade's set: every title of the set that is not already there (by its English word or its
 * translation, capitals ignored) is added at the end, visible; with `hideUnusedSeed`, the seed's watch-workshop titles
 * that hold no items and are not in the set are hidden (archived) — never deleted, never renamed. "Other" always stays.
 * Returns the new list and what changed, for the screen to say before anything is saved.
 */
export function applyCategoryTemplate(rows: TemplateCategoryRow[], kind: CategoryTemplateKind, language: string, { hideUnusedSeed = false, now = 0 } = {}) {
  const set = CATEGORY_TEMPLATES[kind];
  const next = rows.map((r) => ({ ...r }));
  const added: string[] = [];
  const hidden: string[] = [];
  set.forEach(([english, icon], index) => {
    const local = templateTitle(english, language);
    if (next.some((r) => same(r.title, english) || same(r.title, local))) return;
    next.push({ id: `category_${(now || 0).toString(36)}_${index}`, title: local, icon, archived: false, itemCount: 0 });
    added.push(local);
  });
  if (hideUnusedSeed) {
    const keep = new Set(set.flatMap(([english]) => [english.toLowerCase(), templateTitle(english, language).toLowerCase()]));
    for (const r of next) {
      if (r.archived || same(r.title, FALLBACK_CATEGORY)) continue;
      if (!WATCH_WORKSHOP_SEED.some((t) => same(t, r.title))) continue;
      if (keep.has(r.title.trim().toLowerCase()) || (r.itemCount ?? 0) > 0) continue;
      r.archived = true;
      hidden.push(r.title);
    }
  }
  return { rows: next, added, hidden };
}
