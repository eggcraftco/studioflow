import type { StudioLanguage } from "./language";

// ETSY-E2E r2 (24 Oct 2026): order currency apart from the workspace's, and what
// Etsy says about delivery. Every language in one table, keyed by source text;
// merged last in language.ts. Probes: scripts/check-order-currency.mts and
// scripts/check-etsy-fulfilment.mts call studioT for each language.
export const ETSY_ROUND_TWO_TRANSLATIONS: Record<string, Partial<Record<StudioLanguage, string>>> = {
  "Other currencies (not converted, not in totals):": {
    "Türkçe": "Diğer para birimleri (çevrilmedi, toplamlara dahil değil):",
    "Deutsch": "Andere Währungen (nicht umgerechnet, nicht in den Summen):",
    "Français": "Autres devises (non converties, hors totaux) :",
    "Italiano": "Altre valute (non convertite, escluse dai totali):",
    "Español (Spanish)": "Otras monedas (sin convertir, fuera de los totales):",
    "Português": "Outras moedas (não convertidas, fora dos totais):",
    "Русский (Russian)": "Другие валюты (без пересчёта, не входят в итоги):",
    "日本語 (Japanese)": "その他の通貨（換算なし・合計に含まれません）:",
    "中文 (Chinese)": "其他货币（未换算，不计入合计）：",
    "العربية (Arabic)": "عملات أخرى (غير محوّلة، وغير مشمولة في الإجماليات):",
    "हिन्दी (Hindi)": "अन्य मुद्राएँ (परिवर्तित नहीं, कुल में शामिल नहीं):"
  },
  "Shipped on Etsy": {
    "Türkçe": "Etsy'de kargoya verildi",
    "Deutsch": "Auf Etsy versendet",
    "Français": "Expédiée sur Etsy",
    "Italiano": "Spedito su Etsy",
    "Español (Spanish)": "Enviado en Etsy",
    "Português": "Enviado na Etsy",
    "Русский (Russian)": "Отправлено на Etsy",
    "日本語 (Japanese)": "Etsy で発送済み",
    "中文 (Chinese)": "已在 Etsy 发货",
    "العربية (Arabic)": "تم الشحن على Etsy",
    "हिन्दी (Hindi)": "Etsy पर भेजा गया"
  },
  "Delivery not confirmed": {
    "Türkçe": "Teslimat doğrulanmadı",
    "Deutsch": "Zustellung nicht bestätigt",
    "Français": "Livraison non confirmée",
    "Italiano": "Consegna non confermata",
    "Español (Spanish)": "Entrega no confirmada",
    "Português": "Entrega não confirmada",
    "Русский (Russian)": "Доставка не подтверждена",
    "日本語 (Japanese)": "配達は未確認",
    "中文 (Chinese)": "未确认送达",
    "العربية (Arabic)": "لم يتم تأكيد التسليم",
    "हिन्दी (Hindi)": "डिलीवरी की पुष्टि नहीं हुई"
  },
  "no tracking number": {
    "Türkçe": "takip numarası yok",
    "Deutsch": "keine Sendungsnummer",
    "Français": "pas de numéro de suivi",
    "Italiano": "nessun numero di tracciamento",
    "Español (Spanish)": "sin número de seguimiento",
    "Português": "sem número de rastreio",
    "Русский (Russian)": "нет трек-номера",
    "日本語 (Japanese)": "追跡番号なし",
    "中文 (Chinese)": "无追踪号码",
    "العربية (Arabic)": "لا يوجد رقم تتبع",
    "हिन्दी (Hindi)": "कोई ट्रैकिंग नंबर नहीं"
  },
  "Delivered — reported by Etsy": {
    "Türkçe": "Teslim edildi — Etsy bildirdi",
    "Deutsch": "Zugestellt — laut Etsy",
    "Français": "Livrée — selon Etsy",
    "Italiano": "Consegnato — segnalato da Etsy",
    "Español (Spanish)": "Entregado — según Etsy",
    "Português": "Entregue — informado pela Etsy",
    "Русский (Russian)": "Доставлено — по данным Etsy",
    "日本語 (Japanese)": "配達済み — Etsy の報告",
    "中文 (Chinese)": "已送达 — 由 Etsy 报告",
    "العربية (Arabic)": "تم التسليم — حسب Etsy",
    "हिन्दी (Hindi)": "डिलीवर हुआ — Etsy के अनुसार"
  },
  "Completed on Etsy · not marked as shipped": {
    "Türkçe": "Etsy'de tamamlandı · kargoya verildi olarak işaretlenmedi",
    "Deutsch": "Auf Etsy abgeschlossen · nicht als versendet markiert",
    "Français": "Terminée sur Etsy · non marquée comme expédiée",
    "Italiano": "Completato su Etsy · non segnato come spedito",
    "Español (Spanish)": "Completado en Etsy · no marcado como enviado",
    "Português": "Concluído na Etsy · não marcado como enviado",
    "Русский (Russian)": "Завершено на Etsy · не отмечено как отправленное",
    "日本語 (Japanese)": "Etsy で完了 · 発送済みにはなっていません",
    "中文 (Chinese)": "已在 Etsy 完成 · 未标记为已发货",
    "العربية (Arabic)": "مكتمل على Etsy · لم يُحدَّد كمشحون",
    "हिन्दी (Hindi)": "Etsy पर पूरा हुआ · भेजा गया चिह्नित नहीं"
  },
  "Shipped on Etsy · delivery not confirmed": {
    "Türkçe": "Etsy'de kargoya verildi · teslimat doğrulanmadı",
    "Deutsch": "Auf Etsy versendet · Zustellung nicht bestätigt",
    "Français": "Expédiée sur Etsy · livraison non confirmée",
    "Italiano": "Spedito su Etsy · consegna non confermata",
    "Español (Spanish)": "Enviado en Etsy · entrega no confirmada",
    "Português": "Enviado na Etsy · entrega não confirmada",
    "Русский (Russian)": "Отправлено на Etsy · доставка не подтверждена",
    "日本語 (Japanese)": "Etsy で発送済み · 配達は未確認",
    "中文 (Chinese)": "已在 Etsy 发货 · 未确认送达",
    "العربية (Arabic)": "تم الشحن على Etsy · لم يتم تأكيد التسليم",
    "हिन्दी (Hindi)": "Etsy पर भेजा गया · डिलीवरी की पुष्टि नहीं हुई"
  }
};
