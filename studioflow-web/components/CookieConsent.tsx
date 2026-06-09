"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_ACCEPTED,
  DEFAULT_DECLINED,
  OPEN_COOKIE_PREFERENCES_EVENT,
  readCookieConsent,
  writeCookieConsent
} from "@/lib/cookieConsent";
import type { CookieConsent as CookieConsentRecord } from "@/lib/cookieConsent";

type Strings = {
  title: string;
  body: string;
  accept: string;
  necessaryOnly: string;
  managePrefs: string;
  hidePrefs: string;
  save: string;
  policyLink: string;
  catNecessary: string;
  catNecessaryDesc: string;
  catFunctional: string;
  catFunctionalDesc: string;
  catAnalytics: string;
  catAnalyticsDesc: string;
  catMarketing: string;
  catMarketingDesc: string;
  alwaysOn: string;
  notUsed: string;
};

const STRINGS: Record<string, Strings> = {
  en: {
    title: "Cookies on NivaDesk",
    body: "We use only essential cookies and local storage to keep you signed in, secure and to remember your preferences. We don't use advertising or third-party analytics trackers.",
    accept: "Accept", necessaryOnly: "Necessary only", managePrefs: "Manage preferences", hidePrefs: "Hide preferences", save: "Save preferences", policyLink: "Cookie Policy",
    catNecessary: "Strictly necessary", catNecessaryDesc: "Login, security, session and payment checkout. Always active.",
    catFunctional: "Functional", catFunctionalDesc: "Remembers language, theme, workspace and display preferences.",
    catAnalytics: "Analytics", catAnalyticsDesc: "Not currently used. Reserved for future, consent-based usage insights.",
    catMarketing: "Marketing", catMarketingDesc: "Not currently used. We don't run advertising trackers.",
    alwaysOn: "Always on", notUsed: "Not used"
  },
  tr: {
    title: "NivaDesk'te çerezler",
    body: "Seni oturumda ve güvende tutmak, tercihlerini hatırlamak için yalnızca zorunlu çerezler ve yerel depolama kullanırız. Reklam veya üçüncü taraf analitik izleyici kullanmıyoruz.",
    accept: "Kabul et", necessaryOnly: "Sadece zorunlu", managePrefs: "Tercihleri yönet", hidePrefs: "Tercihleri gizle", save: "Tercihleri kaydet", policyLink: "Çerez Politikası",
    catNecessary: "Kesinlikle zorunlu", catNecessaryDesc: "Giriş, güvenlik, oturum ve ödeme. Her zaman aktif.",
    catFunctional: "İşlevsel", catFunctionalDesc: "Dil, tema, workspace ve görünüm tercihlerini hatırlar.",
    catAnalytics: "Analitik", catAnalyticsDesc: "Şu an kullanılmıyor. Gelecekte onaya dayalı kullanım analizi için ayrıldı.",
    catMarketing: "Pazarlama", catMarketingDesc: "Şu an kullanılmıyor. Reklam izleyici çalıştırmıyoruz.",
    alwaysOn: "Her zaman açık", notUsed: "Kullanılmıyor"
  },
  de: {
    title: "Cookies bei NivaDesk",
    body: "Wir verwenden nur essenzielle Cookies und lokalen Speicher, um Sie angemeldet und sicher zu halten und Ihre Einstellungen zu speichern. Wir nutzen keine Werbe- oder Drittanbieter-Analyse-Tracker.",
    accept: "Akzeptieren", necessaryOnly: "Nur notwendige", managePrefs: "Einstellungen verwalten", hidePrefs: "Einstellungen ausblenden", save: "Einstellungen speichern", policyLink: "Cookie-Richtlinie",
    catNecessary: "Unbedingt erforderlich", catNecessaryDesc: "Login, Sicherheit, Sitzung und Zahlung. Immer aktiv.",
    catFunctional: "Funktional", catFunctionalDesc: "Speichert Sprache, Theme, Workspace und Anzeigeeinstellungen.",
    catAnalytics: "Analyse", catAnalyticsDesc: "Derzeit nicht verwendet. Reserviert für künftige, einwilligungsbasierte Nutzungsanalysen.",
    catMarketing: "Marketing", catMarketingDesc: "Derzeit nicht verwendet. Wir setzen keine Werbe-Tracker ein.",
    alwaysOn: "Immer aktiv", notUsed: "Nicht verwendet"
  },
  fr: {
    title: "Cookies sur NivaDesk",
    body: "Nous utilisons uniquement des cookies essentiels et le stockage local pour vous garder connecté, sécurisé et mémoriser vos préférences. Nous n'utilisons pas de traceurs publicitaires ou d'analyse tiers.",
    accept: "Accepter", necessaryOnly: "Nécessaires uniquement", managePrefs: "Gérer les préférences", hidePrefs: "Masquer les préférences", save: "Enregistrer les préférences", policyLink: "Politique de cookies",
    catNecessary: "Strictement nécessaires", catNecessaryDesc: "Connexion, sécurité, session et paiement. Toujours actifs.",
    catFunctional: "Fonctionnels", catFunctionalDesc: "Mémorise la langue, le thème, l'espace de travail et l'affichage.",
    catAnalytics: "Analyse", catAnalyticsDesc: "Non utilisé actuellement. Réservé à une future analyse d'usage basée sur le consentement.",
    catMarketing: "Marketing", catMarketingDesc: "Non utilisé actuellement. Nous n'utilisons pas de traceurs publicitaires.",
    alwaysOn: "Toujours actif", notUsed: "Non utilisé"
  },
  it: {
    title: "Cookie su NivaDesk",
    body: "Usiamo solo cookie essenziali e archiviazione locale per mantenerti connesso, sicuro e ricordare le tue preferenze. Non usiamo tracker pubblicitari o di analisi di terze parti.",
    accept: "Accetta", necessaryOnly: "Solo necessari", managePrefs: "Gestisci preferenze", hidePrefs: "Nascondi preferenze", save: "Salva preferenze", policyLink: "Informativa sui cookie",
    catNecessary: "Strettamente necessari", catNecessaryDesc: "Login, sicurezza, sessione e pagamento. Sempre attivi.",
    catFunctional: "Funzionali", catFunctionalDesc: "Ricorda lingua, tema, workspace e preferenze di visualizzazione.",
    catAnalytics: "Analisi", catAnalyticsDesc: "Attualmente non utilizzato. Riservato a future analisi d'uso basate sul consenso.",
    catMarketing: "Marketing", catMarketingDesc: "Attualmente non utilizzato. Non usiamo tracker pubblicitari.",
    alwaysOn: "Sempre attivo", notUsed: "Non utilizzato"
  },
  es: {
    title: "Cookies en NivaDesk",
    body: "Solo usamos cookies esenciales y almacenamiento local para mantenerte conectado, seguro y recordar tus preferencias. No usamos rastreadores publicitarios ni de análisis de terceros.",
    accept: "Aceptar", necessaryOnly: "Solo necesarias", managePrefs: "Gestionar preferencias", hidePrefs: "Ocultar preferencias", save: "Guardar preferencias", policyLink: "Política de cookies",
    catNecessary: "Estrictamente necesarias", catNecessaryDesc: "Inicio de sesión, seguridad, sesión y pago. Siempre activas.",
    catFunctional: "Funcionales", catFunctionalDesc: "Recuerda idioma, tema, espacio de trabajo y preferencias de visualización.",
    catAnalytics: "Analítica", catAnalyticsDesc: "No se usa actualmente. Reservado para futuros análisis de uso basados en consentimiento.",
    catMarketing: "Marketing", catMarketingDesc: "No se usa actualmente. No usamos rastreadores publicitarios.",
    alwaysOn: "Siempre activa", notUsed: "No se usa"
  },
  pt: {
    title: "Cookies no NivaDesk",
    body: "Usamos apenas cookies essenciais e armazenamento local para manter você conectado, seguro e lembrar suas preferências. Não usamos rastreadores de publicidade ou de análise de terceiros.",
    accept: "Aceitar", necessaryOnly: "Apenas necessários", managePrefs: "Gerenciar preferências", hidePrefs: "Ocultar preferências", save: "Salvar preferências", policyLink: "Política de Cookies",
    catNecessary: "Estritamente necessários", catNecessaryDesc: "Login, segurança, sessão e pagamento. Sempre ativos.",
    catFunctional: "Funcionais", catFunctionalDesc: "Lembra idioma, tema, workspace e preferências de exibição.",
    catAnalytics: "Análise", catAnalyticsDesc: "Não usado atualmente. Reservado para futuras análises de uso baseadas em consentimento.",
    catMarketing: "Marketing", catMarketingDesc: "Não usado atualmente. Não usamos rastreadores de publicidade.",
    alwaysOn: "Sempre ativo", notUsed: "Não usado"
  },
  ru: {
    title: "Файлы cookie в NivaDesk",
    body: "Мы используем только необходимые файлы cookie и локальное хранилище, чтобы вы оставались в системе и в безопасности, и чтобы запоминать ваши настройки. Мы не используем рекламные или сторонние аналитические трекеры.",
    accept: "Принять", necessaryOnly: "Только необходимые", managePrefs: "Настроить", hidePrefs: "Скрыть настройки", save: "Сохранить настройки", policyLink: "Политика cookie",
    catNecessary: "Строго необходимые", catNecessaryDesc: "Вход, безопасность, сессия и оплата. Всегда активны.",
    catFunctional: "Функциональные", catFunctionalDesc: "Запоминают язык, тему, рабочее пространство и настройки отображения.",
    catAnalytics: "Аналитика", catAnalyticsDesc: "Сейчас не используется. Зарезервировано для будущей аналитики с согласия.",
    catMarketing: "Маркетинг", catMarketingDesc: "Сейчас не используется. Мы не используем рекламные трекеры.",
    alwaysOn: "Всегда активны", notUsed: "Не используется"
  },
  ja: {
    title: "NivaDesk の Cookie",
    body: "ログイン状態の維持、セキュリティ、設定の記憶のために、必須の Cookie とローカルストレージのみを使用します。広告や第三者の分析トラッカーは使用しません。",
    accept: "同意する", necessaryOnly: "必須のみ", managePrefs: "設定を管理", hidePrefs: "設定を隠す", save: "設定を保存", policyLink: "Cookie ポリシー",
    catNecessary: "必須", catNecessaryDesc: "ログイン、セキュリティ、セッション、決済。常に有効。",
    catFunctional: "機能", catFunctionalDesc: "言語、テーマ、ワークスペース、表示設定を記憶します。",
    catAnalytics: "分析", catAnalyticsDesc: "現在は未使用。将来の同意ベースの利用分析のために予約。",
    catMarketing: "マーケティング", catMarketingDesc: "現在は未使用。広告トラッカーは使用しません。",
    alwaysOn: "常に有効", notUsed: "未使用"
  },
  zh: {
    title: "NivaDesk 上的 Cookie",
    body: "我们仅使用必要的 Cookie 和本地存储，以保持您的登录状态、安全并记住您的偏好。我们不使用广告或第三方分析跟踪器。",
    accept: "接受", necessaryOnly: "仅必要", managePrefs: "管理偏好", hidePrefs: "隐藏偏好", save: "保存偏好", policyLink: "Cookie 政策",
    catNecessary: "严格必要", catNecessaryDesc: "登录、安全、会话和支付结账。始终启用。",
    catFunctional: "功能", catFunctionalDesc: "记住语言、主题、工作区和显示偏好。",
    catAnalytics: "分析", catAnalyticsDesc: "当前未使用。保留用于未来基于同意的使用分析。",
    catMarketing: "营销", catMarketingDesc: "当前未使用。我们不运行广告跟踪器。",
    alwaysOn: "始终启用", notUsed: "未使用"
  },
  ar: {
    title: "ملفات تعريف الارتباط في NivaDesk",
    body: "نستخدم فقط ملفات تعريف الارتباط الأساسية والتخزين المحلي لإبقائك مسجّلاً للدخول وآمناً ولتذكّر تفضيلاتك. لا نستخدم متتبّعات إعلانية أو تحليلات من جهات خارجية.",
    accept: "قبول", necessaryOnly: "الضرورية فقط", managePrefs: "إدارة التفضيلات", hidePrefs: "إخفاء التفضيلات", save: "حفظ التفضيلات", policyLink: "سياسة ملفات تعريف الارتباط",
    catNecessary: "ضرورية للغاية", catNecessaryDesc: "تسجيل الدخول والأمان والجلسة والدفع. مفعّلة دائماً.",
    catFunctional: "وظيفية", catFunctionalDesc: "تتذكّر اللغة والمظهر ومساحة العمل وتفضيلات العرض.",
    catAnalytics: "تحليلات", catAnalyticsDesc: "غير مستخدمة حالياً. محجوزة لتحليلات استخدام مستقبلية قائمة على الموافقة.",
    catMarketing: "تسويق", catMarketingDesc: "غير مستخدمة حالياً. لا نشغّل متتبّعات إعلانية.",
    alwaysOn: "مفعّلة دائماً", notUsed: "غير مستخدمة"
  },
  hi: {
    title: "NivaDesk पर कुकीज़",
    body: "हम आपको साइन इन, सुरक्षित रखने और आपकी प्राथमिकताएँ याद रखने के लिए केवल आवश्यक कुकीज़ और लोकल स्टोरेज का उपयोग करते हैं। हम विज्ञापन या तृतीय-पक्ष एनालिटिक्स ट्रैकर का उपयोग नहीं करते।",
    accept: "स्वीकार करें", necessaryOnly: "केवल आवश्यक", managePrefs: "प्राथमिकताएँ प्रबंधित करें", hidePrefs: "प्राथमिकताएँ छिपाएँ", save: "प्राथमिकताएँ सहेजें", policyLink: "कुकी नीति",
    catNecessary: "अत्यंत आवश्यक", catNecessaryDesc: "लॉगिन, सुरक्षा, सेशन और भुगतान। हमेशा सक्रिय।",
    catFunctional: "कार्यात्मक", catFunctionalDesc: "भाषा, थीम, वर्कस्पेस और प्रदर्शन प्राथमिकताएँ याद रखता है।",
    catAnalytics: "एनालिटिक्स", catAnalyticsDesc: "वर्तमान में उपयोग नहीं। भविष्य में सहमति-आधारित उपयोग विश्लेषण के लिए आरक्षित।",
    catMarketing: "मार्केटिंग", catMarketingDesc: "वर्तमान में उपयोग नहीं। हम विज्ञापन ट्रैकर नहीं चलाते।",
    alwaysOn: "हमेशा सक्रिय", notUsed: "उपयोग नहीं"
  }
};

const RTL_LANGS = new Set(["ar"]);

function detectLang(): string {
  if (typeof navigator === "undefined") return "en";
  const code = (navigator.languages?.[0] || navigator.language || "en").toLowerCase().split("-")[0];
  return STRINGS[code] ? code : "en";
}

export function CookieConsent() {
  const [open, setOpen] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [lang, setLang] = useState("en");
  const [functional, setFunctional] = useState(true);

  useEffect(() => {
    setLang(detectLang());
    const existing = readCookieConsent();
    if (!existing) {
      setOpen(true);
    } else {
      setFunctional(existing.functional);
    }
    const reopen = () => {
      const current = readCookieConsent();
      if (current) setFunctional(current.functional);
      setShowPrefs(true);
      setOpen(true);
    };
    window.addEventListener(OPEN_COOKIE_PREFERENCES_EVENT, reopen);
    return () => window.removeEventListener(OPEN_COOKIE_PREFERENCES_EVENT, reopen);
  }, []);

  const persist = useCallback((record: Omit<CookieConsentRecord, "version" | "decidedAt">) => {
    writeCookieConsent(record);
    setOpen(false);
    setShowPrefs(false);
  }, []);

  if (!open) return null;

  const s = STRINGS[lang] || STRINGS.en;
  const dir = RTL_LANGS.has(lang) ? "rtl" : "ltr";

  return (
    <div className="cookie-banner" role="dialog" aria-label={s.title} aria-live="polite" dir={dir}>
      <div className="cookie-banner-inner">
        <div className="cookie-banner-copy">
          <strong>{s.title}</strong>
          <p>
            {s.body}{" "}
            <a href="/cookies">{s.policyLink}</a>
          </p>
        </div>

        {showPrefs ? (
          <div className="cookie-cats">
            <CookieCat title={s.catNecessary} desc={s.catNecessaryDesc} locked badge={s.alwaysOn} checked />
            <CookieCat title={s.catFunctional} desc={s.catFunctionalDesc} checked={functional} onChange={setFunctional} />
            <CookieCat title={s.catAnalytics} desc={s.catAnalyticsDesc} locked badge={s.notUsed} checked={false} />
            <CookieCat title={s.catMarketing} desc={s.catMarketingDesc} locked badge={s.notUsed} checked={false} />
          </div>
        ) : null}

        <div className="cookie-banner-actions">
          <button type="button" className="cookie-link-btn" onClick={() => setShowPrefs(v => !v)}>
            {showPrefs ? s.hidePrefs : s.managePrefs}
          </button>
          {showPrefs ? (
            <button type="button" className="cookie-btn cookie-btn-ghost" onClick={() => persist({ ...DEFAULT_DECLINED, functional })}>
              {s.save}
            </button>
          ) : (
            <button type="button" className="cookie-btn cookie-btn-ghost" onClick={() => persist(DEFAULT_DECLINED)}>
              {s.necessaryOnly}
            </button>
          )}
          <button type="button" className="cookie-btn cookie-btn-primary" onClick={() => persist(DEFAULT_ACCEPTED)}>
            {s.accept}
          </button>
        </div>
      </div>
    </div>
  );
}

function CookieCat({
  title,
  desc,
  checked,
  locked = false,
  badge,
  onChange
}: {
  title: string;
  desc: string;
  checked: boolean;
  locked?: boolean;
  badge?: string;
  onChange?: (value: boolean) => void;
}) {
  return (
    <div className="cookie-cat">
      <div className="cookie-cat-head">
        <span className="cookie-cat-title">{title}</span>
        {locked ? (
          <span className="cookie-cat-badge">{badge}</span>
        ) : (
          <label className="cookie-switch">
            <input type="checkbox" checked={checked} onChange={e => onChange?.(e.target.checked)} />
            <span className="cookie-switch-track" aria-hidden="true" />
          </label>
        )}
      </div>
      <p className="cookie-cat-desc">{desc}</p>
    </div>
  );
}
