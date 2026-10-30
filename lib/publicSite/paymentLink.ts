// Type-only, so scripts/check-payment-link.mts can load this file with plain Node (no path alias at run time).
import type { PaymentReturnLanguage } from "./paymentReturn";

// The customer's page behind a short payment link (https://pay.<their domain>/p/<code>,
// functions/paymentConnect.js getPaymentLinkForVisitor / openPaymentLink). The visitor has no
// NivaDesk account and no language setting, so the page speaks the browser's language — the same
// twelve, chosen the same way, as /pay/done where Stripe sends them back.

export type PaymentLinkStatus = "open" | "processing" | "paid" | "cancelled" | "closed" | "unavailable";

/**
 * A business's own look for this page (companySettings.paymentPageTheme, read by the server and
 * re-checked here): EGGcraft's is its shop's product page — Poppins, a serif title, a royal-blue pill
 * button, white, the hand-painting illustration beside the details. Absent = the neutral card.
 */
export type PaymentPageTheme = {
  font: "default" | "poppins";
  titleFont: "default" | "serif";
  buttonColor: string;
  buttonTextColor: string;
  buttonShape: "rounded" | "pill";
  buttonUppercase: boolean;
  pageBackground: string;
  textColor: string;
  mutedColor: string;
  heroImageUrl: string;
  heroImageFocus: "top" | "center";
  layout: "card" | "product";
};

export type PaymentLinkView = {
  businessName: string;
  logoUrl: string;
  accentColor: string;
  showPoweredBy: boolean;
  reference: string;
  amountMinor: number;
  currency: string;
  status: PaymentLinkStatus;
  theme?: Partial<PaymentPageTheme> | null;
};

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Only what this page knows how to draw: hex colours, an https image, the listed choices. Anything
 * else falls back to the neutral page, so a typo in a business's settings never breaks a payment.
 */
export function paymentPageTheme(raw: unknown): PaymentPageTheme | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const color = (key: string, fallback: string) => (typeof value[key] === "string" && HEX.test(value[key] as string) ? (value[key] as string).toLowerCase() : fallback);
  const pick = <T extends string>(key: string, allowed: readonly T[], fallback: T): T =>
    (allowed as readonly string[]).includes(String(value[key])) ? (value[key] as T) : fallback;
  const hero = typeof value.heroImageUrl === "string" && /^https:\/\/[^\s"'<>]{4,500}$/.test(value.heroImageUrl) ? value.heroImageUrl : "";
  return {
    font: pick("font", ["default", "poppins"] as const, "default"),
    titleFont: pick("titleFont", ["default", "serif"] as const, "default"),
    buttonColor: color("buttonColor", ""),
    buttonTextColor: color("buttonTextColor", "#ffffff"),
    buttonShape: pick("buttonShape", ["rounded", "pill"] as const, "rounded"),
    buttonUppercase: value.buttonUppercase === true,
    pageBackground: color("pageBackground", ""),
    textColor: color("textColor", ""),
    mutedColor: color("mutedColor", ""),
    heroImageUrl: hero,
    heroImageFocus: pick("heroImageFocus", ["top", "center"] as const, "center"),
    layout: pick("layout", ["card", "product"] as const, "card")
  };
}

export type PaymentLinkCopy = {
  title: string;
  forOrder: string;
  amount: string;
  pay: string;
  opening: string;
  secure: string;
  paidTitle: string;
  paidBody: string;
  processingTitle: string;
  processingBody: string;
  cancelledTitle: string;
  cancelledBody: string;
  closedTitle: string;
  closedBody: string;
  unavailableTitle: string;
  unavailableBody: string;
  loading: string;
  failed: string;
  tooMany: string;
  retry: string;
  poweredBy: string;
};

/** The path a short link lives on. Kept beside the page that answers it; the server writes `${host}/p/${code}`. */
export const PAYMENT_LINK_PATH_PREFIX = "/p/";

export const PAYMENT_LINK_COPY: Record<PaymentReturnLanguage, PaymentLinkCopy> = {
  en: {
    title: "Payment request",
    forOrder: "For order {reference}",
    amount: "Amount",
    pay: "Pay now",
    opening: "Opening the secure payment page…",
    secure: "You pay on Stripe's secure page. The business never sees your card details.",
    paidTitle: "This payment is complete",
    paidBody: "Thank you. There is nothing more to pay on this link.",
    processingTitle: "Payment in progress",
    processingBody: "Your payment is being confirmed. You don't need to pay again.",
    cancelledTitle: "This payment link was cancelled",
    cancelledBody: "No payment can be made with it. Contact the business if you still need to pay.",
    closedTitle: "This payment link is closed",
    closedBody: "Contact the business if you have a question about this payment.",
    unavailableTitle: "This payment link is not available",
    unavailableBody: "It may have been replaced. Contact the business that sent it to you.",
    loading: "Loading…",
    failed: "The payment page could not be opened just now. Please try again in a moment.",
    tooMany: "Too many tries. Please wait a little and try again.",
    retry: "Try again",
    poweredBy: "Powered by NivaDesk"
  },
  tr: {
    title: "Ödeme talebi",
    forOrder: "{reference} numaralı sipariş için",
    amount: "Tutar",
    pay: "Şimdi öde",
    opening: "Güvenli ödeme sayfası açılıyor…",
    secure: "Ödemeyi Stripe'ın güvenli sayfasında yaparsınız. İşletme kart bilgilerinizi hiçbir zaman görmez.",
    paidTitle: "Bu ödeme tamamlandı",
    paidBody: "Teşekkürler. Bu bağlantıyla ödenecek başka bir tutar yok.",
    processingTitle: "Ödeme işleniyor",
    processingBody: "Ödemeniz onaylanıyor. Yeniden ödeme yapmanıza gerek yok.",
    cancelledTitle: "Bu ödeme bağlantısı iptal edildi",
    cancelledBody: "Bu bağlantıyla ödeme yapılamaz. Hâlâ ödemeniz gerekiyorsa işletmeyle iletişime geçin.",
    closedTitle: "Bu ödeme bağlantısı kapandı",
    closedBody: "Bu ödemeyle ilgili bir sorunuz varsa işletmeyle iletişime geçin.",
    unavailableTitle: "Bu ödeme bağlantısı kullanılamıyor",
    unavailableBody: "Yenisiyle değiştirilmiş olabilir. Bağlantıyı size gönderen işletmeyle iletişime geçin.",
    loading: "Yükleniyor…",
    failed: "Ödeme sayfası şu anda açılamadı. Lütfen biraz sonra yeniden deneyin.",
    tooMany: "Çok fazla deneme yapıldı. Lütfen biraz bekleyip yeniden deneyin.",
    retry: "Yeniden dene",
    poweredBy: "NivaDesk ile çalışır"
  },
  de: {
    title: "Zahlungsanforderung",
    forOrder: "Für Auftrag {reference}",
    amount: "Betrag",
    pay: "Jetzt bezahlen",
    opening: "Die sichere Zahlungsseite wird geöffnet…",
    secure: "Sie bezahlen auf der sicheren Seite von Stripe. Das Unternehmen sieht Ihre Kartendaten nie.",
    paidTitle: "Diese Zahlung ist abgeschlossen",
    paidBody: "Vielen Dank. Über diesen Link ist nichts mehr zu bezahlen.",
    processingTitle: "Zahlung wird bearbeitet",
    processingBody: "Ihre Zahlung wird bestätigt. Sie müssen nicht erneut bezahlen.",
    cancelledTitle: "Dieser Zahlungslink wurde storniert",
    cancelledBody: "Damit kann nicht mehr bezahlt werden. Wenden Sie sich an das Unternehmen, falls Sie noch bezahlen müssen.",
    closedTitle: "Dieser Zahlungslink ist geschlossen",
    closedBody: "Wenden Sie sich an das Unternehmen, wenn Sie eine Frage zu dieser Zahlung haben.",
    unavailableTitle: "Dieser Zahlungslink ist nicht verfügbar",
    unavailableBody: "Er wurde möglicherweise ersetzt. Wenden Sie sich an das Unternehmen, das ihn Ihnen geschickt hat.",
    loading: "Wird geladen…",
    failed: "Die Zahlungsseite konnte gerade nicht geöffnet werden. Bitte versuchen Sie es gleich noch einmal.",
    tooMany: "Zu viele Versuche. Bitte warten Sie kurz und versuchen Sie es erneut.",
    retry: "Erneut versuchen",
    poweredBy: "Bereitgestellt von NivaDesk"
  },
  fr: {
    title: "Demande de paiement",
    forOrder: "Pour la commande {reference}",
    amount: "Montant",
    pay: "Payer maintenant",
    opening: "Ouverture de la page de paiement sécurisée…",
    secure: "Vous payez sur la page sécurisée de Stripe. L'entreprise ne voit jamais vos données de carte.",
    paidTitle: "Ce paiement est terminé",
    paidBody: "Merci. Il n'y a plus rien à payer avec ce lien.",
    processingTitle: "Paiement en cours",
    processingBody: "Votre paiement est en cours de confirmation. Vous n'avez pas besoin de payer à nouveau.",
    cancelledTitle: "Ce lien de paiement a été annulé",
    cancelledBody: "Il ne permet plus de payer. Contactez l'entreprise si vous devez encore payer.",
    closedTitle: "Ce lien de paiement est clôturé",
    closedBody: "Contactez l'entreprise si vous avez une question sur ce paiement.",
    unavailableTitle: "Ce lien de paiement n'est pas disponible",
    unavailableBody: "Il a peut-être été remplacé. Contactez l'entreprise qui vous l'a envoyé.",
    loading: "Chargement…",
    failed: "La page de paiement n'a pas pu s'ouvrir pour le moment. Veuillez réessayer dans un instant.",
    tooMany: "Trop de tentatives. Veuillez patienter un peu puis réessayer.",
    retry: "Réessayer",
    poweredBy: "Propulsé par NivaDesk"
  },
  it: {
    title: "Richiesta di pagamento",
    forOrder: "Per l'ordine {reference}",
    amount: "Importo",
    pay: "Paga ora",
    opening: "Apertura della pagina di pagamento sicura…",
    secure: "Paghi sulla pagina sicura di Stripe. L'attività non vede mai i dati della tua carta.",
    paidTitle: "Questo pagamento è completato",
    paidBody: "Grazie. Non c'è altro da pagare con questo link.",
    processingTitle: "Pagamento in corso",
    processingBody: "Il tuo pagamento è in fase di conferma. Non devi pagare di nuovo.",
    cancelledTitle: "Questo link di pagamento è stato annullato",
    cancelledBody: "Non è più possibile pagare con questo link. Contatta l'attività se devi ancora pagare.",
    closedTitle: "Questo link di pagamento è chiuso",
    closedBody: "Contatta l'attività se hai domande su questo pagamento.",
    unavailableTitle: "Questo link di pagamento non è disponibile",
    unavailableBody: "Potrebbe essere stato sostituito. Contatta l'attività che te lo ha inviato.",
    loading: "Caricamento…",
    failed: "Non è stato possibile aprire la pagina di pagamento. Riprova tra un momento.",
    tooMany: "Troppi tentativi. Attendi un po' e riprova.",
    retry: "Riprova",
    poweredBy: "Con tecnologia NivaDesk"
  },
  es: {
    title: "Solicitud de pago",
    forOrder: "Para el pedido {reference}",
    amount: "Importe",
    pay: "Pagar ahora",
    opening: "Abriendo la página de pago segura…",
    secure: "Pagas en la página segura de Stripe. El negocio nunca ve los datos de tu tarjeta.",
    paidTitle: "Este pago está completado",
    paidBody: "Gracias. No queda nada por pagar con este enlace.",
    processingTitle: "Pago en curso",
    processingBody: "Tu pago se está confirmando. No necesitas volver a pagar.",
    cancelledTitle: "Este enlace de pago se ha cancelado",
    cancelledBody: "Ya no se puede pagar con él. Ponte en contacto con el negocio si todavía necesitas pagar.",
    closedTitle: "Este enlace de pago está cerrado",
    closedBody: "Ponte en contacto con el negocio si tienes alguna pregunta sobre este pago.",
    unavailableTitle: "Este enlace de pago no está disponible",
    unavailableBody: "Puede que se haya sustituido. Ponte en contacto con el negocio que te lo envió.",
    loading: "Cargando…",
    failed: "No se ha podido abrir la página de pago. Inténtalo de nuevo en un momento.",
    tooMany: "Demasiados intentos. Espera un poco y vuelve a intentarlo.",
    retry: "Reintentar",
    poweredBy: "Con la tecnología de NivaDesk"
  },
  pt: {
    title: "Pedido de pagamento",
    forOrder: "Para a encomenda {reference}",
    amount: "Valor",
    pay: "Pagar agora",
    opening: "A abrir a página de pagamento segura…",
    secure: "Paga na página segura da Stripe. A empresa nunca vê os dados do seu cartão.",
    paidTitle: "Este pagamento está concluído",
    paidBody: "Obrigado. Não há mais nada a pagar com esta ligação.",
    processingTitle: "Pagamento em curso",
    processingBody: "O seu pagamento está a ser confirmado. Não precisa de pagar novamente.",
    cancelledTitle: "Esta ligação de pagamento foi cancelada",
    cancelledBody: "Já não é possível pagar com ela. Contacte a empresa se ainda precisar de pagar.",
    closedTitle: "Esta ligação de pagamento está fechada",
    closedBody: "Contacte a empresa se tiver alguma dúvida sobre este pagamento.",
    unavailableTitle: "Esta ligação de pagamento não está disponível",
    unavailableBody: "Pode ter sido substituída. Contacte a empresa que lha enviou.",
    loading: "A carregar…",
    failed: "Não foi possível abrir a página de pagamento. Tente novamente daqui a pouco.",
    tooMany: "Demasiadas tentativas. Aguarde um pouco e tente novamente.",
    retry: "Tentar novamente",
    poweredBy: "Com tecnologia NivaDesk"
  },
  ru: {
    title: "Запрос на оплату",
    forOrder: "Заказ {reference}",
    amount: "Сумма",
    pay: "Оплатить",
    opening: "Открываем защищённую страницу оплаты…",
    secure: "Вы платите на защищённой странице Stripe. Компания никогда не видит данные вашей карты.",
    paidTitle: "Этот платёж выполнен",
    paidBody: "Спасибо. По этой ссылке больше ничего оплачивать не нужно.",
    processingTitle: "Платёж обрабатывается",
    processingBody: "Ваш платёж подтверждается. Платить повторно не нужно.",
    cancelledTitle: "Эта ссылка на оплату отменена",
    cancelledBody: "Оплатить по ней нельзя. Свяжитесь с компанией, если вам всё ещё нужно оплатить.",
    closedTitle: "Эта ссылка на оплату закрыта",
    closedBody: "Свяжитесь с компанией, если у вас есть вопрос об этом платеже.",
    unavailableTitle: "Эта ссылка на оплату недоступна",
    unavailableBody: "Возможно, её заменили. Свяжитесь с компанией, которая её прислала.",
    loading: "Загрузка…",
    failed: "Не удалось открыть страницу оплаты. Повторите попытку чуть позже.",
    tooMany: "Слишком много попыток. Подождите немного и попробуйте снова.",
    retry: "Повторить",
    poweredBy: "Работает на NivaDesk"
  },
  ja: {
    title: "お支払いのご依頼",
    forOrder: "ご注文 {reference}",
    amount: "金額",
    pay: "今すぐ支払う",
    opening: "安全な決済ページを開いています…",
    secure: "お支払いは Stripe の安全なページで行います。事業者がカード情報を見ることはありません。",
    paidTitle: "このお支払いは完了しています",
    paidBody: "ありがとうございました。このリンクでお支払いいただくものはもうありません。",
    processingTitle: "お支払いを処理中です",
    processingBody: "お支払いを確認しています。もう一度お支払いいただく必要はありません。",
    cancelledTitle: "この支払いリンクはキャンセルされました",
    cancelledBody: "このリンクではお支払いできません。まだお支払いが必要な場合は事業者にお問い合わせください。",
    closedTitle: "この支払いリンクは終了しています",
    closedBody: "このお支払いについてご質問があれば事業者にお問い合わせください。",
    unavailableTitle: "この支払いリンクはご利用いただけません",
    unavailableBody: "新しいリンクに置き換えられた可能性があります。リンクを送った事業者にお問い合わせください。",
    loading: "読み込み中…",
    failed: "決済ページを開けませんでした。しばらくしてからもう一度お試しください。",
    tooMany: "試行回数が多すぎます。少し待ってからもう一度お試しください。",
    retry: "再試行",
    poweredBy: "NivaDesk で提供"
  },
  zh: {
    title: "付款请求",
    forOrder: "订单 {reference}",
    amount: "金额",
    pay: "立即付款",
    opening: "正在打开安全付款页面…",
    secure: "你将在 Stripe 的安全页面上付款。商家永远看不到你的卡信息。",
    paidTitle: "此付款已完成",
    paidBody: "谢谢。此链接已无需再付款。",
    processingTitle: "付款处理中",
    processingBody: "正在确认你的付款，无需再次付款。",
    cancelledTitle: "此付款链接已取消",
    cancelledBody: "无法再通过此链接付款。如仍需付款，请联系商家。",
    closedTitle: "此付款链接已关闭",
    closedBody: "如对此付款有疑问，请联系商家。",
    unavailableTitle: "此付款链接不可用",
    unavailableBody: "它可能已被替换。请联系向你发送链接的商家。",
    loading: "加载中…",
    failed: "暂时无法打开付款页面，请稍后再试。",
    tooMany: "尝试次数过多，请稍等片刻后再试。",
    retry: "重试",
    poweredBy: "由 NivaDesk 提供支持"
  },
  ar: {
    title: "طلب دفع",
    forOrder: "للطلب {reference}",
    amount: "المبلغ",
    pay: "ادفع الآن",
    opening: "جارٍ فتح صفحة الدفع الآمنة…",
    secure: "تدفع على صفحة Stripe الآمنة. لا ترى الجهة التجارية بيانات بطاقتك أبدًا.",
    paidTitle: "اكتملت هذه الدفعة",
    paidBody: "شكرًا لك. لا يوجد شيء آخر للدفع عبر هذا الرابط.",
    processingTitle: "الدفع قيد المعالجة",
    processingBody: "يجري تأكيد دفعتك. لا حاجة إلى الدفع مرة أخرى.",
    cancelledTitle: "أُلغي رابط الدفع هذا",
    cancelledBody: "لا يمكن الدفع عبره. تواصل مع الجهة التجارية إذا كنت لا تزال بحاجة إلى الدفع.",
    closedTitle: "رابط الدفع هذا مغلق",
    closedBody: "تواصل مع الجهة التجارية إذا كان لديك سؤال عن هذه الدفعة.",
    unavailableTitle: "رابط الدفع هذا غير متاح",
    unavailableBody: "ربما استُبدل برابط آخر. تواصل مع الجهة التجارية التي أرسلته إليك.",
    loading: "جارٍ التحميل…",
    failed: "تعذّر فتح صفحة الدفع الآن. يُرجى المحاولة مرة أخرى بعد قليل.",
    tooMany: "محاولات كثيرة جدًا. يُرجى الانتظار قليلًا ثم المحاولة مرة أخرى.",
    retry: "إعادة المحاولة",
    poweredBy: "مدعوم من NivaDesk"
  },
  hi: {
    title: "भुगतान अनुरोध",
    forOrder: "ऑर्डर {reference} के लिए",
    amount: "राशि",
    pay: "अभी भुगतान करें",
    opening: "सुरक्षित भुगतान पेज खुल रहा है…",
    secure: "आप Stripe के सुरक्षित पेज पर भुगतान करते हैं। व्यवसाय आपके कार्ड का विवरण कभी नहीं देखता।",
    paidTitle: "यह भुगतान पूरा हो गया है",
    paidBody: "धन्यवाद। इस लिंक पर अब कुछ भी भुगतान करना बाकी नहीं है।",
    processingTitle: "भुगतान प्रक्रिया में है",
    processingBody: "आपके भुगतान की पुष्टि की जा रही है। दोबारा भुगतान करने की ज़रूरत नहीं है।",
    cancelledTitle: "यह भुगतान लिंक रद्द कर दिया गया है",
    cancelledBody: "इससे भुगतान नहीं किया जा सकता। अगर आपको अभी भी भुगतान करना है तो व्यवसाय से संपर्क करें।",
    closedTitle: "यह भुगतान लिंक बंद है",
    closedBody: "इस भुगतान के बारे में कोई प्रश्न हो तो व्यवसाय से संपर्क करें।",
    unavailableTitle: "यह भुगतान लिंक उपलब्ध नहीं है",
    unavailableBody: "हो सकता है इसे बदल दिया गया हो। जिस व्यवसाय ने इसे भेजा है उससे संपर्क करें।",
    loading: "लोड हो रहा है…",
    failed: "भुगतान पेज अभी नहीं खुल सका। कृपया थोड़ी देर बाद फिर से कोशिश करें।",
    tooMany: "बहुत अधिक प्रयास। कृपया थोड़ा रुककर फिर से कोशिश करें।",
    retry: "फिर से कोशिश करें",
    poweredBy: "NivaDesk द्वारा संचालित"
  }
};

/** The code from the address, as the server accepts it; anything else is no code at all. */
export function paymentLinkCode(raw: string | string[] | undefined | null): string {
  const value = Array.isArray(raw) ? "" : String(raw ?? "").trim();
  return /^[A-Za-z0-9]{8,40}$/.test(value) ? value : "";
}

/**
 * The amount as the customer's own locale writes it, from integer minor units. The digits a currency
 * has come from Intl (GBP 2, JPY 0), never from a guess here; an unknown code falls back to the
 * plain number and the code.
 */
export function paymentLinkAmount(amountMinor: number, currency: string, language: PaymentReturnLanguage): string {
  const code = String(currency || "").toUpperCase();
  const minor = Number.isFinite(amountMinor) ? Math.trunc(amountMinor) : 0;
  try {
    const format = new Intl.NumberFormat(language, { style: "currency", currency: code });
    const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
    return format.format(minor / 10 ** digits);
  } catch {
    return `${(minor / 100).toFixed(2)} ${code}`.trim();
  }
}
