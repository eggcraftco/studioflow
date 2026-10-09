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
export type StudioCountNoun = "order" | "customer";

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
