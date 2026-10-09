import { normalizeStudioLanguage, studioLocaleTag } from "./language";

/**
 * "1 order" / "2 orders", in every app language.
 *
 * `${count} ${t("orders")}` printed "1 Aufträge" in German, and a single
 * singular/plural key pair cannot serve Russian (1 заказ, 2 заказа, 5 заказов)
 * or Arabic (dual, few, many). The plural category comes from
 * Intl.PluralRules for the app language; each language lists the forms it
 * uses, and a missing category falls back to "other".
 */
export type StudioCountNoun = "order" | "customer" | "file" | "item" | "note" | "member";

type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

const COUNT_FORMS: Record<StudioCountNoun, Record<string, PluralForms>> = {
  order: {
    "English": { one: "{count} order", other: "{count} orders" },
    "Türkçe": { other: "{count} sipariş" },
    "Deutsch": { one: "{count} Auftrag", other: "{count} Aufträge" },
    "Français": { one: "{count} commande", other: "{count} commandes" },
    "Italiano": { one: "{count} ordine", other: "{count} ordini" },
    "Español (Spanish)": { one: "{count} pedido", other: "{count} pedidos" },
    "Português": { one: "{count} pedido", other: "{count} pedidos" },
    "Русский (Russian)": { one: "{count} заказ", few: "{count} заказа", many: "{count} заказов", other: "{count} заказа" },
    "日本語 (Japanese)": { other: "{count} 件の注文" },
    "中文 (Chinese)": { other: "{count} 个订单" },
    "العربية (Arabic)": { zero: "{count} طلب", one: "{count} طلب", two: "{count} طلبان", few: "{count} طلبات", many: "{count} طلبًا", other: "{count} طلب" },
    "हिन्दी (Hindi)": { other: "{count} ऑर्डर" }
  },
  customer: {
    "English": { one: "{count} customer", other: "{count} customers" },
    "Türkçe": { other: "{count} müşteri" },
    "Deutsch": { one: "{count} Kunde", other: "{count} Kunden" },
    "Français": { one: "{count} client", other: "{count} clients" },
    "Italiano": { one: "{count} cliente", other: "{count} clienti" },
    "Español (Spanish)": { one: "{count} cliente", other: "{count} clientes" },
    "Português": { one: "{count} cliente", other: "{count} clientes" },
    "Русский (Russian)": { one: "{count} клиент", few: "{count} клиента", many: "{count} клиентов", other: "{count} клиента" },
    "日本語 (Japanese)": { other: "{count} 名の顧客" },
    "中文 (Chinese)": { other: "{count} 位客户" },
    "العربية (Arabic)": { zero: "{count} عميل", one: "{count} عميل", two: "{count} عميلان", few: "{count} عملاء", many: "{count} عميلًا", other: "{count} عميل" },
    "हिन्दी (Hindi)": { other: "{count} ग्राहक" }
  },
  file: {
    "English": { one: "{count} file", other: "{count} files" },
    "Türkçe": { other: "{count} dosya" },
    "Deutsch": { one: "{count} Datei", other: "{count} Dateien" },
    "Français": { one: "{count} fichier", other: "{count} fichiers" },
    "Italiano": { one: "{count} file", other: "{count} file" },
    "Español (Spanish)": { one: "{count} archivo", other: "{count} archivos" },
    "Português": { one: "{count} arquivo", other: "{count} arquivos" },
    "Русский (Russian)": { one: "{count} файл", few: "{count} файла", many: "{count} файлов", other: "{count} файла" },
    "日本語 (Japanese)": { other: "{count} 件のファイル" },
    "中文 (Chinese)": { other: "{count} 个文件" },
    "العربية (Arabic)": { zero: "{count} ملف", one: "{count} ملف", two: "{count} ملفان", few: "{count} ملفات", many: "{count} ملفًا", other: "{count} ملف" },
    "हिन्दी (Hindi)": { other: "{count} फ़ाइल" }
  },
  item: {
    "English": { one: "{count} item", other: "{count} items" },
    "Türkçe": { other: "{count} ürün" },
    "Deutsch": { one: "{count} Artikel", other: "{count} Artikel" },
    "Français": { one: "{count} article", other: "{count} articles" },
    "Italiano": { one: "{count} articolo", other: "{count} articoli" },
    "Español (Spanish)": { one: "{count} artículo", other: "{count} artículos" },
    "Português": { one: "{count} item", other: "{count} itens" },
    "Русский (Russian)": { one: "{count} позиция", few: "{count} позиции", many: "{count} позиций", other: "{count} позиции" },
    "日本語 (Japanese)": { other: "{count} 件のアイテム" },
    "中文 (Chinese)": { other: "{count} 个项目" },
    "العربية (Arabic)": { zero: "{count} عنصر", one: "{count} عنصر", two: "{count} عنصران", few: "{count} عناصر", many: "{count} عنصرًا", other: "{count} عنصر" },
    "हिन्दी (Hindi)": { other: "{count} आइटम" }
  },
  note: {
    "English": { one: "{count} note", other: "{count} notes" },
    "Türkçe": { other: "{count} not" },
    "Deutsch": { one: "{count} Notiz", other: "{count} Notizen" },
    "Français": { one: "{count} note", other: "{count} notes" },
    "Italiano": { one: "{count} nota", other: "{count} note" },
    "Español (Spanish)": { one: "{count} nota", other: "{count} notas" },
    "Português": { one: "{count} nota", other: "{count} notas" },
    "Русский (Russian)": { one: "{count} заметка", few: "{count} заметки", many: "{count} заметок", other: "{count} заметки" },
    "日本語 (Japanese)": { other: "{count} 件のメモ" },
    "中文 (Chinese)": { other: "{count} 条笔记" },
    "العربية (Arabic)": { zero: "{count} ملاحظة", one: "{count} ملاحظة", two: "{count} ملاحظتان", few: "{count} ملاحظات", many: "{count} ملاحظةً", other: "{count} ملاحظة" },
    "हिन्दी (Hindi)": { other: "{count} नोट" }
  },
  member: {
    "English": { one: "{count} member", other: "{count} members" },
    "Türkçe": { other: "{count} üye" },
    "Deutsch": { one: "{count} Mitglied", other: "{count} Mitglieder" },
    "Français": { one: "{count} membre", other: "{count} membres" },
    "Italiano": { one: "{count} membro", other: "{count} membri" },
    "Español (Spanish)": { one: "{count} miembro", other: "{count} miembros" },
    "Português": { one: "{count} membro", other: "{count} membros" },
    "Русский (Russian)": { one: "{count} участник", few: "{count} участника", many: "{count} участников", other: "{count} участника" },
    "日本語 (Japanese)": { other: "{count} 名のメンバー" },
    "中文 (Chinese)": { other: "{count} 位成员" },
    "العربية (Arabic)": { zero: "{count} عضو", one: "{count} عضو", two: "{count} عضوان", few: "{count} أعضاء", many: "{count} عضوًا", other: "{count} عضو" },
    "हिन्दी (Hindi)": { other: "{count} सदस्य" }
  }
};

function pluralCategory(count: number, language: string): Intl.LDMLPluralRule {
  try {
    return new Intl.PluralRules(studioLocaleTag(language)).select(count);
  } catch {
    return count === 1 ? "one" : "other";
  }
}

export function studioCountLabel(count: number, noun: StudioCountNoun, language: string | null | undefined): string {
  const normalized = normalizeStudioLanguage(language);
  const forms = COUNT_FORMS[noun][normalized] ?? COUNT_FORMS[noun]["English"];
  const template = forms[pluralCategory(count, normalized)] ?? forms.other;
  return template.replace("{count}", String(count));
}

/** Every language and plural form, for the check script. */
export const STUDIO_COUNT_FORMS = COUNT_FORMS;
