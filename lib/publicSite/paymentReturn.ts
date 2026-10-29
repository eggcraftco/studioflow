// Where a business's customer lands after Stripe's hosted payment page
// (functions/paymentConnect.js `customerReturnUrl`, STRIPE-LINKS 29 Oct 2026).
//
// The customer is not a NivaDesk user, so this is a standalone public page: no
// sign-in, no app shell, nothing about the workspace or the order. Stripe adds
// only `?status=paid|cancelled` to the address, and that word is not proof of
// anything — the payment reaches the order through the signed webhook — so the
// paid sentence says the business is told once Stripe confirms, never that
// the money has arrived.
//
// Erasable TypeScript only (no enums, no path aliases): scripts/check-payment-return.mts
// imports this file directly under Node's type stripping.

export type PaymentReturnStatus = "paid" | "cancelled" | "unknown";

export type PaymentReturnLanguage =
  "en" | "tr" | "de" | "fr" | "it" | "es" | "pt" | "ru" | "ja" | "zh" | "ar" | "hi";

export type PaymentReturnCopy = {
  paidTitle: string;
  paidBody: string;
  cancelledTitle: string;
  cancelledBody: string;
  unknownTitle: string;
  unknownBody: string;
  close: string;
  secure: string;
};

/** The path the server sends customers to. Kept beside the page that answers it. */
export const PAYMENT_RETURN_PATH = "/pay/done";

export const PAYMENT_RETURN_LANGUAGES: readonly PaymentReturnLanguage[] =
  ["en", "tr", "de", "fr", "it", "es", "pt", "ru", "ja", "zh", "ar", "hi"];

export const PAYMENT_RETURN_COPY: Record<PaymentReturnLanguage, PaymentReturnCopy> = {
  en: {
    paidTitle: "Thank you — your payment was submitted",
    paidBody: "The business will be notified as soon as Stripe confirms it. You don't need to do anything else.",
    cancelledTitle: "Payment not completed",
    cancelledBody: "No payment was taken. To pay, open the link you were sent again while it is still valid. If it has expired, ask the business for a new one.",
    unknownTitle: "Payment",
    unknownBody: "If you have just paid, the business will be notified as soon as Stripe confirms it. If something went wrong, contact the business that sent you the link.",
    close: "You can close this page.",
    secure: "Card payments are processed by Stripe."
  },
  tr: {
    paidTitle: "Teşekkürler — ödemeniz gönderildi",
    paidBody: "Stripe ödemeyi onaylar onaylamaz işletmeye bildirilecek. Başka bir şey yapmanıza gerek yok.",
    cancelledTitle: "Ödeme tamamlanmadı",
    cancelledBody: "Sizden ödeme alınmadı. Ödemek için size gönderilen bağlantıyı geçerli olduğu süre içinde yeniden açın. Süresi dolduysa işletmeden yeni bir bağlantı isteyin.",
    unknownTitle: "Ödeme",
    unknownBody: "Az önce ödeme yaptıysanız Stripe onayladığında işletmeye bildirilecek. Bir sorun olduysa size bağlantıyı gönderen işletmeyle iletişime geçin.",
    close: "Bu sayfayı kapatabilirsiniz.",
    secure: "Kart ödemeleri Stripe tarafından işlenir."
  },
  de: {
    paidTitle: "Vielen Dank – Ihre Zahlung wurde übermittelt",
    paidBody: "Das Unternehmen wird benachrichtigt, sobald Stripe die Zahlung bestätigt. Sie müssen nichts weiter tun.",
    cancelledTitle: "Zahlung nicht abgeschlossen",
    cancelledBody: "Es wurde keine Zahlung eingezogen. Um zu bezahlen, öffnen Sie den erhaltenen Link erneut, solange er gültig ist. Ist er abgelaufen, bitten Sie das Unternehmen um einen neuen.",
    unknownTitle: "Zahlung",
    unknownBody: "Wenn Sie gerade bezahlt haben, wird das Unternehmen benachrichtigt, sobald Stripe die Zahlung bestätigt. Falls etwas schiefgelaufen ist, wenden Sie sich an das Unternehmen, das Ihnen den Link geschickt hat.",
    close: "Sie können diese Seite schließen.",
    secure: "Kartenzahlungen werden von Stripe abgewickelt."
  },
  fr: {
    paidTitle: "Merci — votre paiement a été transmis",
    paidBody: "L'entreprise sera prévenue dès que Stripe l'aura confirmé. Vous n'avez rien d'autre à faire.",
    cancelledTitle: "Paiement non effectué",
    cancelledBody: "Aucun paiement n'a été prélevé. Pour payer, rouvrez le lien reçu tant qu'il est encore valide. S'il a expiré, demandez-en un nouveau à l'entreprise.",
    unknownTitle: "Paiement",
    unknownBody: "Si vous venez de payer, l'entreprise sera prévenue dès que Stripe aura confirmé le paiement. En cas de problème, contactez l'entreprise qui vous a envoyé le lien.",
    close: "Vous pouvez fermer cette page.",
    secure: "Les paiements par carte sont traités par Stripe."
  },
  it: {
    paidTitle: "Grazie — il tuo pagamento è stato inviato",
    paidBody: "L'azienda riceverà una notifica non appena Stripe lo confermerà. Non devi fare altro.",
    cancelledTitle: "Pagamento non completato",
    cancelledBody: "Non è stato addebitato alcun importo. Per pagare, riapri il link che hai ricevuto finché è valido. Se è scaduto, chiedine uno nuovo all'azienda.",
    unknownTitle: "Pagamento",
    unknownBody: "Se hai appena pagato, l'azienda riceverà una notifica non appena Stripe confermerà il pagamento. Se qualcosa è andato storto, contatta l'azienda che ti ha inviato il link.",
    close: "Puoi chiudere questa pagina.",
    secure: "I pagamenti con carta sono elaborati da Stripe."
  },
  es: {
    paidTitle: "Gracias: tu pago se ha enviado",
    paidBody: "La empresa recibirá un aviso en cuanto Stripe lo confirme. No tienes que hacer nada más.",
    cancelledTitle: "Pago no completado",
    cancelledBody: "No se ha cobrado nada. Para pagar, vuelve a abrir el enlace que recibiste mientras siga siendo válido. Si ha caducado, pide uno nuevo a la empresa.",
    unknownTitle: "Pago",
    unknownBody: "Si acabas de pagar, la empresa recibirá un aviso en cuanto Stripe confirme el pago. Si algo ha ido mal, ponte en contacto con la empresa que te envió el enlace.",
    close: "Puedes cerrar esta página.",
    secure: "Los pagos con tarjeta los procesa Stripe."
  },
  pt: {
    paidTitle: "Obrigado — o seu pagamento foi enviado",
    paidBody: "A empresa será avisada assim que a Stripe o confirmar. Não precisa de fazer mais nada.",
    cancelledTitle: "Pagamento não concluído",
    cancelledBody: "Não foi cobrado nenhum valor. Para pagar, volte a abrir a ligação que recebeu enquanto ainda for válida. Se tiver expirado, peça uma nova à empresa.",
    unknownTitle: "Pagamento",
    unknownBody: "Se acabou de pagar, a empresa será avisada assim que a Stripe confirmar o pagamento. Se algo correu mal, contacte a empresa que lhe enviou a ligação.",
    close: "Pode fechar esta página.",
    secure: "Os pagamentos com cartão são processados pela Stripe."
  },
  ru: {
    paidTitle: "Спасибо — ваш платёж отправлен",
    paidBody: "Компания получит уведомление, как только Stripe его подтвердит. Больше ничего делать не нужно.",
    cancelledTitle: "Платёж не завершён",
    cancelledBody: "Деньги не списаны. Чтобы оплатить, снова откройте полученную ссылку, пока она действует. Если срок её действия истёк, попросите у компании новую.",
    unknownTitle: "Оплата",
    unknownBody: "Если вы только что оплатили, компания получит уведомление, как только Stripe подтвердит платёж. Если что-то пошло не так, свяжитесь с компанией, которая прислала вам ссылку.",
    close: "Эту страницу можно закрыть.",
    secure: "Платежи картой обрабатывает Stripe."
  },
  ja: {
    paidTitle: "ありがとうございます。お支払いを送信しました",
    paidBody: "Stripe がお支払いを確認しだい、事業者に通知されます。これ以上の操作は必要ありません。",
    cancelledTitle: "お支払いは完了していません",
    cancelledBody: "料金は請求されていません。お支払いいただく場合は、有効期限内に受け取ったリンクをもう一度開いてください。期限が切れている場合は、事業者に新しいリンクを依頼してください。",
    unknownTitle: "お支払い",
    unknownBody: "お支払いを済ませたばかりの場合は、Stripe が確認しだい事業者に通知されます。問題が発生した場合は、リンクを送ってきた事業者にお問い合わせください。",
    close: "このページは閉じてかまいません。",
    secure: "カード決済は Stripe が処理します。"
  },
  zh: {
    paidTitle: "谢谢，您的付款已提交",
    paidBody: "Stripe 确认后，商家会立即收到通知。您无需再做任何操作。",
    cancelledTitle: "付款未完成",
    cancelledBody: "未扣取任何款项。如需付款，请在链接有效期内重新打开您收到的链接。如果链接已过期，请向商家索取新链接。",
    unknownTitle: "付款",
    unknownBody: "如果您刚刚完成付款，Stripe 确认后商家会收到通知。如果出现问题，请联系向您发送链接的商家。",
    close: "您可以关闭此页面。",
    secure: "银行卡付款由 Stripe 处理。"
  },
  ar: {
    paidTitle: "شكرًا لك — تم إرسال دفعتك",
    paidBody: "سيتم إشعار النشاط التجاري فور تأكيد Stripe للدفعة. لا حاجة لأي إجراء آخر منك.",
    cancelledTitle: "لم تكتمل عملية الدفع",
    cancelledBody: "لم يُخصم أي مبلغ. للدفع، افتح الرابط الذي أُرسل إليك مرة أخرى ما دام صالحًا. وإذا انتهت صلاحيته، فاطلب رابطًا جديدًا من النشاط التجاري.",
    unknownTitle: "الدفع",
    unknownBody: "إذا كنت قد دفعت للتو، فسيتم إشعار النشاط التجاري فور تأكيد Stripe للدفعة. وإذا حدث خطأ ما، فتواصل مع النشاط التجاري الذي أرسل إليك الرابط.",
    close: "يمكنك إغلاق هذه الصفحة.",
    secure: "تتم معالجة المدفوعات بالبطاقة بواسطة Stripe."
  },
  hi: {
    paidTitle: "धन्यवाद — आपका भुगतान भेज दिया गया है",
    paidBody: "Stripe के पुष्टि करते ही व्यवसाय को सूचना मिल जाएगी। आपको और कुछ करने की ज़रूरत नहीं है।",
    cancelledTitle: "भुगतान पूरा नहीं हुआ",
    cancelledBody: "कोई राशि नहीं ली गई। भुगतान करने के लिए, आपको भेजा गया लिंक उसके मान्य रहते दोबारा खोलें। अगर उसकी अवधि समाप्त हो गई है, तो व्यवसाय से नया लिंक माँगें।",
    unknownTitle: "भुगतान",
    unknownBody: "अगर आपने अभी भुगतान किया है, तो Stripe के पुष्टि करते ही व्यवसाय को सूचना मिल जाएगी। अगर कुछ गड़बड़ हुई है, तो उस व्यवसाय से संपर्क करें जिसने आपको लिंक भेजा था।",
    close: "आप यह पेज बंद कर सकते हैं।",
    secure: "कार्ड भुगतान Stripe द्वारा प्रोसेस किए जाते हैं।"
  }
};

/** `?status=` as Stripe returns it. Anything else, a list, or nothing is "unknown". */
export function paymentReturnStatus(raw: string | string[] | undefined | null): PaymentReturnStatus {
  const value = Array.isArray(raw) ? "" : String(raw ?? "").trim().toLowerCase();
  if (value === "paid") return "paid";
  if (value === "cancelled") return "cancelled";
  return "unknown";
}

/**
 * The visitor's language from the Accept-Language header: the highest-weighted
 * tag whose base language the page has, else English. "pt-BR" reads as "pt",
 * "zh-Hant" as "zh"; a malformed header is English, never an error.
 */
export function paymentReturnLanguage(header: string | null | undefined): PaymentReturnLanguage {
  const ranked = String(header ?? "")
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map(p => p.trim()).find(p => p.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return { base: tag.trim().toLowerCase().split("-")[0], weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter(item => item.base && item.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const item of ranked) {
    if ((PAYMENT_RETURN_LANGUAGES as readonly string[]).includes(item.base)) return item.base as PaymentReturnLanguage;
  }
  return "en";
}

export function paymentReturnDirection(language: PaymentReturnLanguage): "rtl" | "ltr" {
  return language === "ar" ? "rtl" : "ltr";
}
