import type { StudioLanguage } from "./language";

/**
 * The help assistant keeps its conversation (1 Nov 2026, lib/studioflow/appHelpHistory.ts): the line under the
 * panel's header. One NEW key, the natives' row word for word (EGGcraft/AppHelpHistory.swift,
 * StudioTranslationsAppHelpHistory.kt). "New conversation" is NOT redefined: the Messages screen already
 * translates it ("Yeni sohbet"), and the panel says the same.
 */
export const APP_HELP_HISTORY_TRANSLATIONS: Record<string, Partial<Record<StudioLanguage, string>>> = {
  "This conversation is kept on this device for 7 days.": {
    "Türkçe": "Bu konuşma bu cihazda 7 gün saklanır.",
    "Deutsch": "Dieses Gespräch bleibt 7 Tage auf diesem Gerät.",
    "Français": "Cette conversation est conservée 7 jours sur cet appareil.",
    "Italiano": "Questa conversazione resta su questo dispositivo per 7 giorni.",
    "Español (Spanish)": "Esta conversación se guarda en este dispositivo durante 7 días.",
    "Português": "Esta conversa fica guardada neste dispositivo durante 7 dias.",
    "Русский (Russian)": "Этот разговор хранится на этом устройстве 7 дней.",
    "日本語 (Japanese)": "この会話はこのデバイスに7日間保存されます。",
    "中文 (Chinese)": "此对话会在本设备上保留 7 天。",
    "العربية (Arabic)": "تُحفظ هذه المحادثة على هذا الجهاز لمدة 7 أيام.",
    "हिन्दी (Hindi)": "यह बातचीत इस डिवाइस पर 7 दिन तक रखी जाती है।"
  }
};
