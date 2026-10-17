import type { StudioLanguage } from "./language";

// Web small fixes (17 Oct 2026): Team seats in use / included / extra / total
// (Settings ▸ Team Access, /team).
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
  }
};
