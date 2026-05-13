import type { PrivacyPolicySection } from "@/lib/publicSite/privacyPolicy";
import type { StudioLanguage } from "@/lib/studioflow/language";

export const REFUND_CANCELLATION_POLICY_LAST_UPDATED = "13 May 2026";

export const REFUND_CANCELLATION_POLICY_SECTIONS: PrivacyPolicySection[] = [
  {
    title: "NivaDesk Refund and Cancellation Policy",
    paragraphs: [
      "This Refund and Cancellation Policy explains how cancellations, renewals, downgrades, refunds, trials, and account access work for NivaDesk paid plans, free plans, lifetime plans, and add-ons.",
      "NivaDesk is operated by EGGCRAFT LIMITED (\"NivaDesk\", \"we\", \"us\", or \"our\"). This policy forms part of our Terms of Service. If there is a conflict between this policy and mandatory consumer law, the mandatory law will apply."
    ]
  },
  {
    title: "1. Who we are",
    paragraphs: [
      "EGGCRAFT LIMITED",
      "141 Randolph Avenue",
      "London",
      "W9 1DN",
      "United Kingdom",
      "Email: nivadesk@gmail.com"
    ]
  },
  {
    title: "2. Plans covered by this policy",
    paragraphs: [
      "This policy applies to NivaDesk plans and purchases, including free access, trials, monthly subscriptions, annual subscriptions, lifetime plans, team plans, storage add-ons, and other paid features we may offer.",
      "Each plan may include different limits, features, storage allowances, team access, file upload rights, export options, integrations, and support levels. The features included in your plan will be shown on the pricing page, in the app, or during checkout."
    ]
  },
  {
    title: "3. Where you purchased your plan matters",
    paragraphs: ["How you cancel, renew, and request a refund depends on where you purchased your plan:"],
    bullets: [
      "If you purchased through Apple App Store, your subscription, cancellation, billing, and refunds are usually managed by Apple.",
      "If you purchased through Google Play, your subscription, cancellation, billing, and refunds are usually managed by Google.",
      "If you purchased through our website, billing may be managed by us or by a payment provider such as Stripe."
    ],
    subsections: [
      {
        title: "",
        paragraphs: [
          "We cannot always cancel or refund purchases made through Apple App Store or Google Play directly, because those platforms manage their own billing systems."
        ]
      }
    ]
  },
  {
    title: "4. Subscription renewals",
    paragraphs: [
      "Paid subscriptions may renew automatically at the end of each billing period unless cancelled before the renewal date.",
      "Your billing period may be monthly, annual, or another period shown at checkout. You are responsible for reviewing the renewal terms before purchasing and for cancelling before renewal if you do not want the subscription to continue.",
      "If payment fails, we may retry payment, limit paid features, downgrade your account, suspend access to paid features, or cancel the subscription."
    ]
  },
  {
    title: "5. How to cancel",
    paragraphs: ["You must cancel through the platform where you purchased your subscription."],
    bullets: [
      "Apple App Store: manage or cancel the subscription through your Apple Account or App Store subscription settings.",
      "Google Play: manage or cancel the subscription through your Google Play subscription settings.",
      "Web or Stripe: cancel through the billing portal if available, or contact us at nivadesk@gmail.com."
    ],
    subsections: [
      {
        title: "",
        paragraphs: [
          "Cancelling a subscription stops future renewals. It does not usually remove access immediately. In most cases, you can continue using paid features until the end of the billing period you have already paid for."
        ]
      }
    ]
  },
  {
    title: "6. Refunds for Apple App Store purchases",
    paragraphs: [
      "If you purchased NivaDesk through Apple App Store, refund requests are usually handled by Apple.",
      "Apple may ask you to sign in to Apple's Report a Problem website, choose Request a refund, and select a reason. Apple decides refund eligibility under its own policies and applicable law.",
      "We cannot guarantee that Apple will approve a refund, and we may not be able to issue an App Store refund ourselves."
    ]
  },
  {
    title: "7. Refunds for Google Play purchases",
    paragraphs: [
      "If you purchased NivaDesk through Google Play, refund requests are usually handled by Google.",
      "You may need to request the refund through Google Play's refund request process or subscription management tools. Google decides refund eligibility under its own policies and applicable law.",
      "We cannot guarantee that Google will approve a refund, and we may not be able to issue a Google Play refund ourselves."
    ]
  },
  {
    title: "8. Refunds for web purchases",
    paragraphs: [
      "If you purchased directly through our website, we may review refund requests ourselves or through our payment provider.",
      "Unless required by law or clearly stated otherwise at checkout, subscription fees are generally non-refundable once the paid period has started.",
      "We may consider a refund at our discretion, for example where there has been a duplicate charge, technical billing error, accidental purchase, or serious service issue that prevented meaningful use of the paid plan.",
      "If a refund is approved, it will usually be returned to the original payment method. Processing times may depend on the payment provider and your bank."
    ]
  },
  {
    title: "9. Partial refunds and credits",
    paragraphs: [
      "We are not required to provide partial refunds for unused time in a billing period unless required by law or stated otherwise.",
      "In some cases, we may offer account credit, a partial refund, plan extension, or other remedy at our discretion.",
      "Any discretionary refund, credit, or exception does not create a right to similar refunds in the future."
    ]
  },
  {
    title: "10. Downgrades and plan changes",
    paragraphs: [
      "If you downgrade from a paid plan to a lower plan, the downgrade may take effect immediately or at the end of the current billing period depending on the platform and plan type.",
      "Downgrading may remove or limit features such as file uploads, team member access, customisation, integrations, storage, workflow controls, or advanced export features.",
      "If your workspace exceeds the limits of the new plan, we may restrict new activity, uploads, invitations, or paid features until the workspace is within the relevant limits."
    ]
  },
  {
    title: "11. What happens after cancellation or expiry",
    paragraphs: [
      "If your Pro, Team, or other paid subscription expires, is cancelled, or payment fails, your account may fall back to a Free/Demo or limited-access plan rather than remaining on the paid plan.",
      "We aim to let users access and export their existing business data after cancellation or expiry, subject to reasonable security, technical, legal, abuse prevention, and storage limits.",
      "Some paid features may stop working after cancellation, including file upload, advanced customisation, team management, storage expansion, integrations, or role-based controls depending on the plan."
    ]
  },
  {
    title: "12. Lifetime plans",
    paragraphs: [
      "If we offer a lifetime plan, lifetime means access to the included NivaDesk features for the lifetime of the product or plan, not for the lifetime of the user, company, device, app store, or payment platform.",
      "Lifetime plans may still be subject to fair use limits, storage limits, supported platform limits, account rules, acceptable use rules, and feature availability described at the time of purchase.",
      "Lifetime plans may not include future paid add-ons, third-party service fees, storage upgrades, enterprise features, or new products unless stated otherwise."
    ]
  },
  {
    title: "13. Trials and promotional offers",
    paragraphs: [
      "We may offer free trials, beta access, promotional discounts, early access pricing, or introductory offers.",
      "Trial terms will be shown at sign-up or checkout. A trial may convert to a paid subscription if you do not cancel before the trial ends, depending on the platform and offer terms.",
      "We may change, limit, withdraw, or refuse promotional offers at any time where permitted by law."
    ]
  },
  {
    title: "14. Storage add-ons",
    paragraphs: [
      "NivaDesk may offer additional storage packages or add-ons, such as extra workspace storage.",
      "Storage add-ons may be billed separately from your base plan. Cancelling a storage add-on may reduce your available storage allowance.",
      "If your workspace uses more storage than your active plan allows, we may restrict new uploads or require you to reduce storage usage, purchase an add-on, or upgrade your plan."
    ]
  },
  {
    title: "15. Account deletion after cancellation",
    paragraphs: [
      "Cancelling a subscription does not automatically delete your account or workspace data.",
      "You may request account deletion separately through the app, our Account Deletion page, or by contacting us.",
      "Before deleting an account, we may need to verify your identity and confirm workspace ownership. Some information may be retained where required for legal, tax, accounting, security, fraud prevention, dispute resolution, or backup purposes."
    ]
  },
  {
    title: "16. Taxes and currency",
    paragraphs: [
      "Prices may be shown exclusive or inclusive of taxes depending on your location, platform, and checkout method.",
      "You are responsible for applicable taxes unless they are collected by the payment platform at checkout.",
      "Prices may be charged in different currencies depending on your country, app store, payment provider, or billing method."
    ]
  },
  {
    title: "17. Chargebacks and payment disputes",
    paragraphs: [
      "If you believe a charge is incorrect, please contact us first so we can investigate.",
      "If you file a chargeback or payment dispute, we may suspend or limit the related account while the dispute is reviewed. If a chargeback is successful, your paid access may be cancelled or downgraded."
    ]
  },
  {
    title: "18. Changes to prices or this policy",
    paragraphs: [
      "We may change prices, plan features, billing terms, refund rules, or this policy from time to time.",
      "Where required, we will provide notice of material changes to active paid users. Your continued use of NivaDesk after a change becomes effective means you accept the updated terms."
    ]
  },
  {
    title: "19. Consumer rights",
    paragraphs: [
      "Nothing in this policy limits any rights you may have under applicable consumer protection law.",
      "If you are a consumer in the UK, EU, or another jurisdiction with mandatory consumer rights, those rights continue to apply."
    ]
  },
  {
    title: "20. Contact us",
    paragraphs: [
      "For billing, cancellation, refund, or subscription questions, contact:",
      "EGGCRAFT LIMITED",
      "141 Randolph Avenue",
      "London",
      "W9 1DN",
      "United Kingdom",
      "Email: nivadesk@gmail.com"
    ]
  }
];

type LocalizedRefundPolicyDraft = {
  lastUpdatedLabel: string;
  introTitle: string;
  introParagraphs: string[];
  sectionTitles: string[];
  sectionSummaries: string[];
};

function buildLocalizedRefundPolicy(copy: LocalizedRefundPolicyDraft): PrivacyPolicySection[] {
  return [
    {
      title: copy.introTitle,
      paragraphs: copy.introParagraphs
    },
    ...copy.sectionTitles.map((title, index) => ({
      title: `${index + 1}. ${title}`,
      paragraphs: [copy.sectionSummaries[index] ?? ""]
    }))
  ];
}

const REFUND_CANCELLATION_POLICY_DRAFTS: Partial<Record<StudioLanguage, LocalizedRefundPolicyDraft>> = {
  Türkçe: {
    lastUpdatedLabel: "Son güncelleme",
    introTitle: "İade ve İptal Politikası",
    introParagraphs: [
      "Bu İade ve İptal Politikası, NivaDesk ücretli planları, ücretsiz planları, lifetime planları ve add-on'ları için iptal, yenileme, downgrade, iade, deneme ve hesap erişiminin nasıl çalıştığını açıklar.",
      "NivaDesk, EGGCRAFT LIMITED tarafından işletilir. Bu politika Kullanım Şartları'nın bir parçasıdır; zorunlu tüketici hukuku farklı bir hak tanıyorsa o kurallar geçerli olur."
    ],
    sectionTitles: [
      "Biz kimiz",
      "Bu politikanın kapsadığı planlar",
      "Planı nereden satın aldığınız önemlidir",
      "Abonelik yenilemeleri",
      "Nasıl iptal edilir",
      "Apple App Store satın alımları için iadeler",
      "Google Play satın alımları için iadeler",
      "Web satın alımları için iadeler",
      "Kısmi iadeler ve krediler",
      "Downgrade ve plan değişiklikleri",
      "İptal veya sürenin bitmesinden sonra ne olur",
      "Lifetime planlar",
      "Denemeler ve promosyonlar",
      "Depolama add-on'ları",
      "İptalden sonra hesap silme",
      "Vergiler ve para birimi",
      "Chargeback ve ödeme uyuşmazlıkları",
      "Fiyat veya politika değişiklikleri",
      "Tüketici hakları",
      "İletişim"
    ],
    sectionSummaries: [
      "NivaDesk, EGGCRAFT LIMITED tarafından 141 Randolph Avenue, London, W9 1DN, United Kingdom adresinden işletilir. Faturalama, iptal, iade veya abonelik soruları için nivadesk@gmail.com adresinden bize ulaşabilirsiniz.",
      "Bu politika ücretsiz erişim, denemeler, aylık ve yıllık abonelikler, lifetime planlar, team planlar, depolama add-on'ları ve sunabileceğimiz diğer ücretli özellikler için geçerlidir. Plan limitleri ve özellikleri fiyatlandırma sayfasında, uygulamada veya checkout sırasında gösterilir.",
      "İptal, yenileme ve iade süreçleri satın alma kanalına göre değişir. Apple App Store satın alımları genellikle Apple, Google Play satın alımları Google, web satın alımları ise NivaDesk veya Stripe gibi ödeme sağlayıcıları tarafından yönetilir.",
      "Ücretli abonelikler, yenileme tarihinden önce iptal edilmedikçe fatura döneminin sonunda otomatik yenilenebilir. Ödeme başarısız olursa ödemeyi yeniden deneyebilir, ücretli özellikleri sınırlayabilir, hesabı downgrade edebilir, erişimi askıya alabilir veya aboneliği iptal edebiliriz.",
      "Abonelik satın alındığı platformdan iptal edilmelidir: Apple abonelikleri Apple Account/App Store ayarlarından, Google Play abonelikleri Google Play ayarlarından, web veya Stripe abonelikleri billing portal üzerinden ya da nivadesk@gmail.com ile iptal edilir.",
      "NivaDesk'i Apple App Store üzerinden satın aldıysanız iade talepleri genellikle Apple tarafından değerlendirilir. Apple kendi politikaları ve geçerli hukuk kapsamında karar verir; App Store iadesini kendimiz garanti edemeyebilir veya işleyemeyebiliriz.",
      "NivaDesk'i Google Play üzerinden satın aldıysanız iade talepleri genellikle Google tarafından değerlendirilir. Google kendi refund süreci ve politikaları kapsamında karar verir; Google Play iadesini kendimiz garanti edemeyebilir veya işleyemeyebiliriz.",
      "Web sitesinden doğrudan satın alımlarda iade taleplerini biz veya ödeme sağlayıcımız inceleyebilir. Kanun gerektirmedikçe ya da checkout sırasında açıkça belirtilmedikçe, ücretli dönem başladıktan sonra abonelik ücretleri genellikle iade edilmez.",
      "Kanun gerektirmedikçe veya aksi belirtilmedikçe kullanılmayan süre için kısmi iade vermek zorunda değiliz. Bazı durumlarda kendi takdirimizle hesap kredisi, kısmi iade, plan uzatma veya başka bir çözüm sunabiliriz.",
      "Ücretli plandan daha düşük plana geçiş platforma ve plan tipine bağlı olarak hemen veya mevcut fatura dönemi sonunda yürürlüğe girebilir. Downgrade, dosya yükleme, ekip erişimi, özelleştirme, entegrasyon, depolama, workflow kontrolleri veya advanced export gibi özellikleri sınırlayabilir.",
      "Pro, Team veya başka bir ücretli abonelik sona ererse, iptal edilirse ya da ödeme başarısız olursa hesap Free/Demo veya sınırlı erişim planına dönebilir. Mevcut iş verilerine erişim ve export imkanı makul güvenlik, teknik, yasal, abuse prevention ve storage limitlerine tabidir.",
      "Lifetime plan sunulursa lifetime, kullanıcının veya cihazın ömrü değil, ürünün veya planın ömrü boyunca dahil edilen NivaDesk özelliklerine erişim anlamına gelir. Future add-on'lar, üçüncü taraf ücretleri, storage upgrades, enterprise features veya yeni ürünler dahil olmayabilir.",
      "Ücretsiz deneme, beta access, promosyon indirimi, early access pricing veya introductory offer sunabiliriz. Deneme şartları signup veya checkout sırasında gösterilir; iptal edilmezse platform ve teklif şartlarına göre ücretli aboneliğe dönüşebilir.",
      "NivaDesk ekstra workspace storage gibi depolama paketleri veya add-on'lar sunabilir. Add-on iptali kullanılabilir storage limitini düşürebilir; limit aşılırsa yeni upload'ları kısıtlayabilir, kullanım azaltma, add-on alma veya plan yükseltme isteyebiliriz.",
      "Aboneliği iptal etmek hesabı veya workspace verilerini otomatik silmez. Hesap silme ayrıca uygulama, Account Deletion sayfası veya bizimle iletişim üzerinden talep edilir; kimlik ve workspace sahipliği doğrulaması gerekebilir.",
      "Fiyatlar konuma, platforma ve checkout yöntemine göre vergiler dahil veya hariç gösterilebilir. Vergiler checkout sırasında platform tarafından tahsil edilmediği sürece geçerli vergilerden siz sorumlusunuz; para birimi ülke, app store veya ödeme sağlayıcısına göre değişebilir.",
      "Bir ücretin hatalı olduğunu düşünüyorsanız önce bizimle iletişime geçin. Chargeback veya ödeme uyuşmazlığı açılırsa inceleme süresince ilgili hesabı sınırlayabilir veya askıya alabiliriz; başarılı chargeback paid access'i iptal veya downgrade edebilir.",
      "Fiyatları, plan özelliklerini, faturalama şartlarını, iade kurallarını veya bu politikayı zaman zaman değiştirebiliriz. Gerekli olduğunda aktif ücretli kullanıcılara önemli değişiklikler için bildirim yaparız.",
      "Bu politika geçerli tüketici koruma hukukundan doğan haklarınızı sınırlamaz. UK, EU veya zorunlu tüketici hakları tanıyan başka bir bölgede tüketiciyseniz bu haklar geçerli kalır.",
      "Faturalama, iptal, iade veya abonelik soruları için EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom ya da nivadesk@gmail.com üzerinden bize ulaşabilirsiniz."
    ]
  },
  Deutsch: {
    lastUpdatedLabel: "Zuletzt aktualisiert",
    introTitle: "Rückerstattungs- und Kündigungsrichtlinie",
    introParagraphs: [
      "Diese Richtlinie erklärt, wie Kündigungen, Verlängerungen, Downgrades, Rückerstattungen, Testphasen und Kontozugriff für NivaDesk-Pläne und Add-ons funktionieren.",
      "NivaDesk wird von EGGCRAFT LIMITED betrieben. Diese Richtlinie ist Teil der Nutzungsbedingungen; zwingendes Verbraucherrecht bleibt vorrangig."
    ],
    sectionTitles: [
      "Wer wir sind",
      "Von dieser Richtlinie erfasste Pläne",
      "Der Kaufort ist wichtig",
      "Abonnementverlängerungen",
      "So kündigst du",
      "Rückerstattungen für Apple App Store Käufe",
      "Rückerstattungen für Google Play Käufe",
      "Rückerstattungen für Webkäufe",
      "Teilrückerstattungen und Guthaben",
      "Downgrades und Planänderungen",
      "Nach Kündigung oder Ablauf",
      "Lifetime-Pläne",
      "Testphasen und Aktionen",
      "Speicher-Add-ons",
      "Kontolöschung nach Kündigung",
      "Steuern und Währung",
      "Chargebacks und Zahlungsstreitigkeiten",
      "Preis- oder Richtlinienänderungen",
      "Verbraucherrechte",
      "Kontakt"
    ],
    sectionSummaries: [
      "NivaDesk wird von EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom betrieben. Für Abrechnung, Kündigung, Rückerstattung oder Abos kontaktiere nivadesk@gmail.com.",
      "Diese Richtlinie gilt für kostenlosen Zugriff, Testphasen, Monats- und Jahresabos, Lifetime-Pläne, Team-Pläne, Speicher-Add-ons und andere bezahlte Funktionen. Limits und Funktionen werden auf der Preisseite, in der App oder beim Checkout angezeigt.",
      "Kündigung, Verlängerung und Rückerstattung hängen davon ab, wo du gekauft hast. Apple verwaltet meist App Store Käufe, Google meist Google Play Käufe, Webkäufe können von uns oder Stripe verwaltet werden.",
      "Bezahlte Abos können automatisch verlängert werden, wenn sie nicht vor dem Verlängerungsdatum gekündigt werden. Bei fehlgeschlagener Zahlung können wir erneut abbuchen, Funktionen beschränken, downgraden, Zugriff aussetzen oder kündigen.",
      "Du musst über die Kaufplattform kündigen: Apple über Apple Account oder App Store Einstellungen, Google über Google Play Einstellungen, Web oder Stripe über das Billing Portal oder nivadesk@gmail.com.",
      "Bei App Store Käufen werden Rückerstattungen normalerweise von Apple bearbeitet. Apple entscheidet nach eigenen Regeln und geltendem Recht; wir können App Store Rückerstattungen nicht garantieren oder immer selbst ausstellen.",
      "Bei Google Play Käufen werden Rückerstattungen normalerweise von Google bearbeitet. Google entscheidet nach eigenen Regeln und geltendem Recht; wir können Google Play Rückerstattungen nicht garantieren oder immer selbst ausstellen.",
      "Bei direkten Webkäufen können wir oder unser Zahlungsanbieter Rückerstattungen prüfen. Sofern nicht gesetzlich erforderlich oder beim Checkout anders angegeben, sind Abogebühren nach Beginn des bezahlten Zeitraums grundsätzlich nicht erstattbar.",
      "Teilrückerstattungen für ungenutzte Zeit sind nur geschuldet, wenn Gesetz oder Bedingungen dies verlangen. Nach eigenem Ermessen können wir Guthaben, Teilrückerstattung, Planverlängerung oder andere Abhilfe anbieten.",
      "Downgrades können sofort oder zum Ende des Abrechnungszeitraums wirken. Sie können Datei-Uploads, Teamzugriff, Anpassungen, Integrationen, Speicher, Workflows oder erweiterte Exporte beschränken.",
      "Wenn Pro, Team oder ein anderes bezahltes Abo endet, gekündigt wird oder Zahlung fehlschlägt, kann das Konto auf Free/Demo oder eingeschränkten Zugriff zurückfallen. Export bestehender Geschäftsdaten bleibt nach vernünftigen Sicherheits-, Technik-, Rechts- und Speichergrenzen angestrebt.",
      "Lifetime bedeutet Zugriff auf enthaltene Funktionen für die Lebensdauer des Produkts oder Plans, nicht des Nutzers, Unternehmens, Geräts, App Stores oder Zahlungsanbieters. Künftige Add-ons, Drittanbietergebühren, Speicherupgrades, Enterprise-Funktionen oder neue Produkte können ausgeschlossen sein.",
      "Wir können kostenlose Tests, Beta-Zugriff, Rabatte, Early-Access-Preise oder Einführungsangebote anbieten. Testbedingungen erscheinen bei Anmeldung oder Checkout und können je nach Angebot in ein bezahltes Abo übergehen.",
      "NivaDesk kann zusätzliche Speicherpakete anbieten. Wird ein Speicher-Add-on gekündigt oder überschreitest du Limits, können neue Uploads beschränkt werden oder Reduzierung, Add-on-Kauf oder Upgrade erforderlich sein.",
      "Eine Kündigung löscht Konto oder Workspace-Daten nicht automatisch. Kontolöschung kann separat in der App, über die Account Deletion Seite oder per Kontakt angefragt werden; Identität und Workspace-Eigentum müssen ggf. geprüft werden.",
      "Preise können je nach Standort, Plattform und Checkout inklusive oder exklusive Steuern angezeigt werden. Du bist für anwendbare Steuern verantwortlich, sofern sie nicht beim Checkout erhoben werden; Währungen können variieren.",
      "Wenn eine Abbuchung falsch erscheint, kontaktiere uns bitte zuerst. Bei Chargebacks oder Zahlungsstreitigkeiten können wir das Konto während der Prüfung beschränken; erfolgreiche Chargebacks können bezahlten Zugriff kündigen oder downgraden.",
      "Wir können Preise, Planfunktionen, Abrechnungsbedingungen, Rückerstattungsregeln oder diese Richtlinie ändern. Wo erforderlich, informieren wir aktive bezahlte Nutzer über wesentliche Änderungen.",
      "Diese Richtlinie beschränkt keine zwingenden Verbraucherrechte. Verbraucher im UK, in der EU oder anderen Rechtsordnungen behalten gesetzliche Rechte.",
      "Für Abrechnung, Kündigung, Rückerstattung oder Abos kontaktiere EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom oder nivadesk@gmail.com."
    ]
  },
  Français: {
    lastUpdatedLabel: "Dernière mise à jour",
    introTitle: "Politique de remboursement et d'annulation",
    introParagraphs: [
      "Cette politique explique le fonctionnement des annulations, renouvellements, changements de plan, remboursements, essais et accès au compte pour les plans et add-ons NivaDesk.",
      "NivaDesk est exploité par EGGCRAFT LIMITED. Cette politique fait partie des Conditions d'utilisation; les droits impératifs des consommateurs restent applicables."
    ],
    sectionTitles: [
      "Qui nous sommes",
      "Plans couverts par cette politique",
      "Le lieu d'achat compte",
      "Renouvellements d'abonnement",
      "Comment annuler",
      "Remboursements des achats Apple App Store",
      "Remboursements des achats Google Play",
      "Remboursements des achats web",
      "Remboursements partiels et crédits",
      "Downgrades et changements de plan",
      "Après annulation ou expiration",
      "Plans lifetime",
      "Essais et offres promotionnelles",
      "Add-ons de stockage",
      "Suppression du compte après annulation",
      "Taxes et devise",
      "Chargebacks et litiges de paiement",
      "Modifications de prix ou de politique",
      "Droits des consommateurs",
      "Contact"
    ],
    sectionSummaries: [
      "NivaDesk est exploité par EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. Pour la facturation, les annulations, remboursements ou abonnements, contactez nivadesk@gmail.com.",
      "Cette politique couvre l'accès gratuit, les essais, abonnements mensuels ou annuels, plans lifetime, plans d'équipe, add-ons de stockage et autres fonctions payantes. Les limites et fonctions sont affichées sur la page de tarifs, dans l'app ou au checkout.",
      "Les annulations, renouvellements et remboursements dépendent du lieu d'achat. Apple gère généralement les achats App Store, Google les achats Google Play, et les achats web peuvent être gérés par nous ou par Stripe.",
      "Les abonnements payants peuvent se renouveler automatiquement sauf annulation avant la date de renouvellement. En cas d'échec de paiement, nous pouvons réessayer, limiter des fonctions, downgrader, suspendre l'accès ou annuler.",
      "Vous devez annuler via la plateforme d'achat: Apple Account ou réglages App Store, paramètres Google Play, ou pour le web/Stripe via le portail de facturation ou nivadesk@gmail.com.",
      "Pour les achats App Store, les demandes de remboursement sont généralement traitées par Apple. Apple décide selon ses propres politiques et la loi applicable; nous ne pouvons pas garantir ni toujours émettre ces remboursements.",
      "Pour les achats Google Play, les demandes de remboursement sont généralement traitées par Google. Google décide selon ses propres politiques et la loi applicable; nous ne pouvons pas garantir ni toujours émettre ces remboursements.",
      "Pour les achats directs sur le web, nous ou notre prestataire de paiement pouvons examiner les demandes. Sauf obligation légale ou indication contraire au checkout, les frais d'abonnement ne sont généralement pas remboursables après le début de la période payée.",
      "Les remboursements partiels pour temps non utilisé ne sont pas dus sauf si la loi ou les conditions l'exigent. Nous pouvons proposer à notre discrétion un crédit, un remboursement partiel, une extension ou une autre solution.",
      "Un changement vers un plan inférieur peut s'appliquer immédiatement ou en fin de période. Il peut limiter fichiers, accès d'équipe, personnalisation, intégrations, stockage, workflows ou exports avancés.",
      "Si un abonnement Pro, Team ou autre plan payant expire, est annulé ou échoue au paiement, le compte peut revenir à Free/Demo ou accès limité. Nous visons à permettre l'accès et l'export des données existantes sous limites raisonnables.",
      "Un plan lifetime signifie accès aux fonctions incluses pendant la vie du produit ou du plan, pas de l'utilisateur, de l'entreprise, de l'appareil, de l'app store ou du fournisseur de paiement. Des add-ons futurs ou nouvelles offres peuvent être exclus.",
      "Nous pouvons proposer essais gratuits, accès beta, réductions, prix early access ou offres d'introduction. Les conditions apparaissent à l'inscription ou au checkout et un essai peut devenir payant selon l'offre.",
      "NivaDesk peut proposer des add-ons de stockage. Leur annulation peut réduire le stockage disponible; en cas de dépassement, nous pouvons limiter les nouveaux uploads ou demander réduction, add-on ou upgrade.",
      "Annuler un abonnement ne supprime pas automatiquement le compte ou les données workspace. La suppression se demande séparément via l'app, la page Account Deletion ou en nous contactant; vérification d'identité et de propriété possible.",
      "Les prix peuvent être affichés avec ou sans taxes selon lieu, plateforme et checkout. Vous êtes responsable des taxes applicables sauf collecte au checkout; les devises peuvent varier.",
      "Si une charge semble incorrecte, contactez-nous d'abord. En cas de chargeback ou litige, nous pouvons limiter le compte pendant l'examen; un chargeback accepté peut annuler ou downgrader l'accès payant.",
      "Nous pouvons modifier prix, fonctions de plan, conditions de facturation, règles de remboursement ou cette politique. Si nécessaire, nous prévenons les utilisateurs payants actifs des changements importants.",
      "Cette politique ne limite pas les droits impératifs de protection des consommateurs. Les droits des consommateurs au UK, dans l'UE ou ailleurs continuent de s'appliquer.",
      "Pour la facturation, les annulations, remboursements ou abonnements, contactez EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom ou nivadesk@gmail.com."
    ]
  },
  Italiano: {
    lastUpdatedLabel: "Ultimo aggiornamento",
    introTitle: "Informativa su rimborsi e cancellazioni",
    introParagraphs: [
      "Questa informativa spiega come funzionano cancellazioni, rinnovi, downgrade, rimborsi, prove e accesso all'account per piani NivaDesk, piani gratuiti, lifetime plan e add-on.",
      "NivaDesk è gestito da EGGCRAFT LIMITED. Questa informativa fa parte dei Termini di Servizio; eventuali diritti obbligatori dei consumatori restano applicabili."
    ],
    sectionTitles: [
      "Chi siamo",
      "Piani coperti da questa informativa",
      "Dove hai acquistato il piano conta",
      "Rinnovi degli abbonamenti",
      "Come cancellare",
      "Rimborsi per acquisti Apple App Store",
      "Rimborsi per acquisti Google Play",
      "Rimborsi per acquisti web",
      "Rimborsi parziali e crediti",
      "Downgrade e cambi piano",
      "Cosa succede dopo cancellazione o scadenza",
      "Piani lifetime",
      "Prove e offerte promozionali",
      "Add-on di archiviazione",
      "Cancellazione account dopo l'annullamento",
      "Tasse e valuta",
      "Chargeback e contestazioni di pagamento",
      "Modifiche a prezzi o informativa",
      "Diritti dei consumatori",
      "Contatti"
    ],
    sectionSummaries: [
      "NivaDesk è gestito da EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. Per domande su fatturazione, cancellazioni, rimborsi o abbonamenti contatta nivadesk@gmail.com.",
      "Questa informativa copre accesso gratuito, prove, abbonamenti mensili o annuali, lifetime plan, team plan, add-on di archiviazione e altre funzionalità a pagamento. Limiti e funzioni sono mostrati nella pagina prezzi, nell'app o al checkout.",
      "Cancellazioni, rinnovi e rimborsi dipendono dal canale di acquisto. Apple gestisce di solito App Store, Google gestisce Google Play, mentre gli acquisti web possono essere gestiti da noi o da Stripe.",
      "Gli abbonamenti a pagamento possono rinnovarsi automaticamente se non cancellati prima della data di rinnovo. Se il pagamento fallisce, possiamo riprovare, limitare funzioni, effettuare downgrade, sospendere accesso o cancellare l'abbonamento.",
      "Devi cancellare dalla piattaforma di acquisto: Apple Account o impostazioni App Store, impostazioni Google Play, oppure per web/Stripe tramite portale di fatturazione o nivadesk@gmail.com.",
      "Per acquisti App Store, i rimborsi sono normalmente gestiti da Apple. Apple decide secondo le proprie policy e la legge applicabile; non possiamo garantirli né sempre emetterli direttamente.",
      "Per acquisti Google Play, i rimborsi sono normalmente gestiti da Google. Google decide secondo le proprie policy e la legge applicabile; non possiamo garantirli né sempre emetterli direttamente.",
      "Per acquisti web diretti, noi o il payment provider possiamo esaminare le richieste. Salvo obbligo di legge o indicazione diversa al checkout, le fee di abbonamento non sono generalmente rimborsabili dopo l'inizio del periodo pagato.",
      "Non siamo tenuti a fornire rimborsi parziali per tempo non usato salvo obbligo di legge o diversa indicazione. Possiamo offrire a discrezione credito, rimborso parziale, estensione del piano o altro rimedio.",
      "Un downgrade può avere effetto subito o alla fine del periodo di fatturazione. Può limitare upload, team access, personalizzazione, integrazioni, storage, workflow o export avanzati.",
      "Se un abbonamento Pro, Team o altro piano pagato scade, viene cancellato o il pagamento fallisce, l'account può tornare a Free/Demo o accesso limitato. Puntiamo a consentire accesso ed export dei dati esistenti entro limiti ragionevoli.",
      "Lifetime significa accesso alle funzionalità incluse per la vita del prodotto o piano, non dell'utente, azienda, dispositivo, app store o piattaforma di pagamento. Add-on futuri o nuovi prodotti possono essere esclusi.",
      "Possiamo offrire prove gratuite, beta access, sconti, early access pricing o offerte introduttive. I termini sono mostrati a signup o checkout e una prova può diventare abbonamento pagato se non cancellata.",
      "NivaDesk può offrire storage add-on. La cancellazione può ridurre lo storage disponibile; se superi i limiti possiamo limitare nuovi upload o richiedere riduzione, add-on o upgrade.",
      "Cancellare l'abbonamento non elimina automaticamente account o dati workspace. La cancellazione account va richiesta separatamente tramite app, pagina Account Deletion o contatto; può servire verifica identità e proprietà workspace.",
      "I prezzi possono essere mostrati con o senza tasse secondo località, piattaforma e checkout. Sei responsabile delle tasse applicabili salvo raccolta al checkout; la valuta può variare.",
      "Se pensi che un addebito sia errato, contattaci prima. In caso di chargeback o contestazione possiamo limitare l'account durante la revisione; un chargeback riuscito può annullare o downgradare l'accesso pagato.",
      "Possiamo modificare prezzi, funzioni dei piani, termini di fatturazione, regole di rimborso o questa informativa. Dove richiesto, avviseremo gli utenti paganti attivi di modifiche sostanziali.",
      "Questa informativa non limita diritti obbligatori di tutela dei consumatori. I diritti dei consumatori in UK, UE o altre giurisdizioni restano validi.",
      "Per domande su fatturazione, cancellazioni, rimborsi o abbonamenti contatta EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom oppure nivadesk@gmail.com."
    ]
  },
  "Español (Spanish)": {
    lastUpdatedLabel: "Última actualización",
    introTitle: "Política de reembolsos y cancelaciones",
    introParagraphs: [
      "Esta política explica cómo funcionan cancelaciones, renovaciones, cambios a planes inferiores, reembolsos, pruebas y acceso a la cuenta para planes de NivaDesk y add-ons.",
      "NivaDesk es operado por EGGCRAFT LIMITED. Esta política forma parte de los Términos del Servicio; los derechos obligatorios de consumidores siguen aplicando."
    ],
    sectionTitles: [
      "Quiénes somos",
      "Planes cubiertos por esta política",
      "Importa dónde compraste tu plan",
      "Renovaciones de suscripción",
      "Cómo cancelar",
      "Reembolsos de compras en Apple App Store",
      "Reembolsos de compras en Google Play",
      "Reembolsos de compras web",
      "Reembolsos parciales y créditos",
      "Downgrades y cambios de plan",
      "Qué ocurre tras cancelar o expirar",
      "Planes lifetime",
      "Pruebas y ofertas promocionales",
      "Add-ons de almacenamiento",
      "Eliminación de cuenta tras cancelar",
      "Impuestos y moneda",
      "Chargebacks y disputas de pago",
      "Cambios de precios o política",
      "Derechos del consumidor",
      "Contacto"
    ],
    sectionSummaries: [
      "NivaDesk es operado por EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. Para facturación, cancelaciones, reembolsos o suscripciones contacta a nivadesk@gmail.com.",
      "Esta política cubre acceso gratuito, pruebas, suscripciones mensuales o anuales, planes lifetime, planes de equipo, add-ons de almacenamiento y otras funciones pagas. Los límites y funciones se muestran en precios, la app o checkout.",
      "La cancelación, renovación y reembolso dependen del lugar de compra. Apple suele gestionar App Store, Google suele gestionar Google Play, y las compras web pueden gestionarse por nosotros o Stripe.",
      "Las suscripciones pagas pueden renovarse automáticamente salvo cancelación antes de la fecha de renovación. Si falla el pago, podemos reintentar, limitar funciones, bajar de plan, suspender acceso o cancelar.",
      "Debes cancelar en la plataforma de compra: Apple Account/App Store, ajustes de Google Play, o para web/Stripe mediante el portal de facturación o nivadesk@gmail.com.",
      "Si compraste en App Store, los reembolsos normalmente los gestiona Apple. Apple decide según sus políticas y la ley aplicable; no podemos garantizarlos ni emitirlos siempre nosotros.",
      "Si compraste en Google Play, los reembolsos normalmente los gestiona Google. Google decide según sus políticas y la ley aplicable; no podemos garantizarlos ni emitirlos siempre nosotros.",
      "Para compras web directas, nosotros o el proveedor de pagos podemos revisar solicitudes. Salvo obligación legal o indicación clara en checkout, las tarifas de suscripción no suelen ser reembolsables una vez iniciado el periodo pagado.",
      "No estamos obligados a dar reembolsos parciales por tiempo no usado salvo ley o indicación contraria. Podemos ofrecer crédito, reembolso parcial, extensión u otro remedio a discreción.",
      "Un downgrade puede aplicarse de inmediato o al final del periodo. Puede limitar uploads, acceso de equipo, personalización, integraciones, storage, workflow o export avanzado.",
      "Si Pro, Team u otra suscripción pagada expira, se cancela o falla el pago, la cuenta puede volver a Free/Demo o acceso limitado. Buscamos permitir acceso y exportación de datos existentes con límites razonables.",
      "Lifetime significa acceso a funciones incluidas durante la vida del producto o plan, no del usuario, empresa, dispositivo, app store o proveedor de pago. Futuros add-ons o productos pueden no estar incluidos.",
      "Podemos ofrecer pruebas gratuitas, beta, descuentos, early access o ofertas introductorias. Los términos se muestran en signup o checkout y una prueba puede convertirse en suscripción pagada.",
      "NivaDesk puede ofrecer add-ons de storage. Cancelarlos puede reducir el almacenamiento disponible; si superas límites podemos restringir nuevos uploads o pedir reducción, add-on o upgrade.",
      "Cancelar una suscripción no elimina automáticamente la cuenta ni datos del workspace. La eliminación se solicita aparte en la app, la página Account Deletion o contactándonos; puede requerir verificación.",
      "Los precios pueden mostrarse con o sin impuestos según ubicación, plataforma y checkout. Eres responsable de impuestos aplicables salvo cobro en checkout; la moneda puede variar.",
      "Si crees que un cargo es incorrecto, contáctanos primero. Si abres chargeback o disputa, podemos limitar la cuenta mientras se revisa; si prospera, el acceso pagado puede cancelarse o downgradearse.",
      "Podemos cambiar precios, funciones, términos de facturación, reglas de reembolso o esta política. Cuando sea necesario, avisaremos a usuarios pagos activos de cambios materiales.",
      "Esta política no limita derechos obligatorios de protección al consumidor. Si eres consumidor en UK, UE u otra jurisdicción, esos derechos siguen aplicando.",
      "Para facturación, cancelaciones, reembolsos o suscripciones contacta a EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom o nivadesk@gmail.com."
    ]
  },
  Português: {
    lastUpdatedLabel: "Última atualização",
    introTitle: "Política de Reembolsos e Cancelamentos",
    introParagraphs: [
      "Esta política explica como funcionam cancelamentos, renovações, downgrades, reembolsos, testes e acesso à conta para planos NivaDesk e add-ons.",
      "A NivaDesk é operada pela EGGCRAFT LIMITED. Esta política faz parte dos Termos de Serviço; direitos obrigatórios do consumidor continuam aplicáveis."
    ],
    sectionTitles: [
      "Quem somos",
      "Planos abrangidos por esta política",
      "Onde comprou o plano importa",
      "Renovações de subscrição",
      "Como cancelar",
      "Reembolsos de compras Apple App Store",
      "Reembolsos de compras Google Play",
      "Reembolsos de compras web",
      "Reembolsos parciais e créditos",
      "Downgrades e alterações de plano",
      "O que acontece após cancelamento ou expiração",
      "Planos lifetime",
      "Testes e ofertas promocionais",
      "Add-ons de armazenamento",
      "Eliminação de conta após cancelamento",
      "Impostos e moeda",
      "Chargebacks e disputas de pagamento",
      "Alterações de preços ou política",
      "Direitos do consumidor",
      "Contacto"
    ],
    sectionSummaries: [
      "A NivaDesk é operada pela EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. Para faturação, cancelamentos, reembolsos ou subscrições contacte nivadesk@gmail.com.",
      "Esta política cobre acesso gratuito, testes, subscrições mensais ou anuais, planos lifetime, planos de equipa, add-ons de armazenamento e outras funcionalidades pagas. Limites e recursos são mostrados nos preços, app ou checkout.",
      "Cancelamentos, renovações e reembolsos dependem do local de compra. Apple gere normalmente App Store, Google gere Google Play, e compras web podem ser geridas por nós ou Stripe.",
      "Subscrições pagas podem renovar automaticamente se não forem canceladas antes da renovação. Se o pagamento falhar, podemos tentar novamente, limitar recursos, fazer downgrade, suspender acesso ou cancelar.",
      "Deve cancelar na plataforma de compra: Apple Account/App Store, definições Google Play, ou para web/Stripe pelo portal de faturação ou nivadesk@gmail.com.",
      "Compras na App Store são normalmente reembolsadas pela Apple. A Apple decide segundo as suas políticas e lei aplicável; não podemos garantir ou emitir sempre esses reembolsos.",
      "Compras no Google Play são normalmente reembolsadas pela Google. A Google decide segundo as suas políticas e lei aplicável; não podemos garantir ou emitir sempre esses reembolsos.",
      "Para compras web diretas, nós ou o fornecedor de pagamento podemos rever pedidos. Salvo lei ou indicação no checkout, taxas de subscrição geralmente não são reembolsáveis após início do período pago.",
      "Não somos obrigados a reembolsar tempo não usado salvo lei ou indicação contrária. Podemos oferecer crédito, reembolso parcial, extensão de plano ou outro remédio a nosso critério.",
      "Um downgrade pode aplicar-se imediatamente ou no fim do período. Pode limitar uploads, acesso de equipa, personalização, integrações, storage, workflows ou export avançado.",
      "Se Pro, Team ou outro plano pago expirar, for cancelado ou o pagamento falhar, a conta pode voltar a Free/Demo ou acesso limitado. Procuramos permitir acesso e exportação de dados existentes com limites razoáveis.",
      "Lifetime significa acesso às funcionalidades incluídas durante a vida do produto ou plano, não do utilizador, empresa, dispositivo, app store ou fornecedor de pagamento. Add-ons futuros ou novos produtos podem ficar excluídos.",
      "Podemos oferecer testes grátis, beta, descontos, early access ou ofertas introdutórias. Os termos aparecem no signup ou checkout e um teste pode converter para subscrição paga.",
      "A NivaDesk pode oferecer add-ons de storage. Cancelá-los pode reduzir armazenamento; se exceder limites podemos restringir uploads ou pedir redução, add-on ou upgrade.",
      "Cancelar uma subscrição não elimina automaticamente conta ou dados workspace. A eliminação deve ser pedida separadamente na app, página Account Deletion ou contacto; pode exigir verificação.",
      "Preços podem aparecer com ou sem impostos conforme localização, plataforma e checkout. É responsável por impostos aplicáveis salvo cobrança no checkout; moedas podem variar.",
      "Se uma cobrança parecer incorreta, contacte-nos primeiro. Em chargeback ou disputa, podemos limitar a conta durante análise; se for aceite, o acesso pago pode ser cancelado ou downgraded.",
      "Podemos alterar preços, recursos, termos de faturação, regras de reembolso ou esta política. Quando necessário, avisaremos utilizadores pagos ativos sobre alterações materiais.",
      "Esta política não limita direitos obrigatórios do consumidor. Consumidores no UK, UE ou outra jurisdição mantêm esses direitos.",
      "Para faturação, cancelamentos, reembolsos ou subscrições contacte EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom ou nivadesk@gmail.com."
    ]
  },
  "Русский (Russian)": {
    lastUpdatedLabel: "Последнее обновление",
    introTitle: "Политика возвратов и отмены",
    introParagraphs: [
      "Эта политика объясняет, как работают отмены, продления, downgrade, возвраты, пробные периоды и доступ к аккаунту для планов NivaDesk и add-ons.",
      "NivaDesk управляется EGGCRAFT LIMITED. Эта политика является частью Условий обслуживания; обязательные права потребителей продолжают применяться."
    ],
    sectionTitles: [
      "Кто мы",
      "Планы, к которым применяется политика",
      "Важно, где был куплен план",
      "Продление подписок",
      "Как отменить",
      "Возвраты покупок Apple App Store",
      "Возвраты покупок Google Play",
      "Возвраты веб-покупок",
      "Частичные возвраты и кредиты",
      "Downgrade и изменения плана",
      "Что происходит после отмены или окончания",
      "Lifetime планы",
      "Пробные периоды и промо",
      "Storage add-ons",
      "Удаление аккаунта после отмены",
      "Налоги и валюта",
      "Chargebacks и платежные споры",
      "Изменения цен или политики",
      "Права потребителей",
      "Контакты"
    ],
    sectionSummaries: [
      "NivaDesk управляется EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. По вопросам billing, отмены, возвратов или подписок пишите на nivadesk@gmail.com.",
      "Политика охватывает бесплатный доступ, trials, месячные и годовые подписки, lifetime планы, team планы, storage add-ons и другие платные функции. Лимиты и функции показываются на pricing page, в app или checkout.",
      "Отмена, продление и возврат зависят от места покупки. Apple обычно управляет App Store, Google управляет Google Play, а web purchases могут управляться нами или Stripe.",
      "Платные подписки могут продлеваться автоматически, если не отменены до даты продления. При неудачном платеже мы можем повторить списание, ограничить функции, downgrade, suspend access или cancel.",
      "Отмена выполняется на платформе покупки: Apple Account/App Store settings, Google Play settings, либо для web/Stripe через billing portal или nivadesk@gmail.com.",
      "Возвраты App Store обычно обрабатываются Apple. Apple решает по своим правилам и применимому закону; мы не можем гарантировать или всегда выполнить такой возврат самостоятельно.",
      "Возвраты Google Play обычно обрабатываются Google. Google решает по своим правилам и применимому закону; мы не можем гарантировать или всегда выполнить такой возврат самостоятельно.",
      "Для прямых web purchases мы или платежный провайдер можем рассмотреть запрос. Если закон или checkout явно не говорят иначе, subscription fees обычно не возвращаются после начала оплаченного периода.",
      "Мы не обязаны делать частичный возврат за неиспользованное время, если этого не требует закон или условия. По своему усмотрению можем предложить credit, partial refund, plan extension или другой remedy.",
      "Downgrade может вступить в силу сразу или в конце billing period. Он может ограничить uploads, team access, customization, integrations, storage, workflow controls или advanced export.",
      "Если Pro, Team или другая paid subscription истекла, отменена или платеж не прошел, аккаунт может перейти на Free/Demo или limited access. Мы стремимся сохранять доступ и export существующих business data с разумными ограничениями.",
      "Lifetime означает доступ к включенным функциям на срок жизни продукта или плана, а не пользователя, компании, устройства, app store или payment platform. Future add-ons или новые продукты могут не входить.",
      "Мы можем предлагать free trials, beta access, скидки, early access pricing или introductory offers. Условия показываются при signup или checkout; trial может стать paid subscription.",
      "NivaDesk может предлагать storage add-ons. Их отмена может уменьшить storage allowance; при превышении лимита мы можем ограничить uploads или потребовать reduction, add-on или upgrade.",
      "Отмена подписки не удаляет автоматически аккаунт или workspace data. Account deletion запрашивается отдельно через app, Account Deletion page или contact; может потребоваться verification.",
      "Цены могут показываться с налогами или без них в зависимости от location, platform и checkout. Вы отвечаете за applicable taxes, если они не собраны при checkout; currency может отличаться.",
      "Если списание кажется неверным, сначала свяжитесь с нами. При chargeback или dispute мы можем ограничить аккаунт во время review; successful chargeback может cancel или downgrade paid access.",
      "Мы можем менять prices, plan features, billing terms, refund rules или эту policy. Когда нужно, мы уведомим active paid users о material changes.",
      "Эта policy не ограничивает обязательные consumer protection rights. Права потребителей в UK, EU или другой юрисдикции продолжают действовать.",
      "По вопросам billing, отмены, возвратов или подписок свяжитесь с EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom или nivadesk@gmail.com."
    ]
  },
  "日本語 (Japanese)": {
    lastUpdatedLabel: "最終更新日",
    introTitle: "返金およびキャンセルポリシー",
    introParagraphs: [
      "このポリシーは、NivaDesk の有料プラン、無料プラン、lifetime プラン、add-on におけるキャンセル、更新、ダウングレード、返金、トライアル、アカウントアクセスを説明します。",
      "NivaDesk は EGGCRAFT LIMITED が運営します。このポリシーは利用規約の一部であり、強制的な消費者保護法が優先される場合があります。"
    ],
    sectionTitles: [
      "運営者",
      "このポリシーの対象プラン",
      "購入場所による違い",
      "サブスクリプション更新",
      "キャンセル方法",
      "Apple App Store 購入の返金",
      "Google Play 購入の返金",
      "Web 購入の返金",
      "部分返金とクレジット",
      "ダウングレードとプラン変更",
      "キャンセルまたは期限切れ後",
      "Lifetime プラン",
      "トライアルとプロモーション",
      "ストレージ add-on",
      "キャンセル後のアカウント削除",
      "税金と通貨",
      "チャージバックと支払い紛争",
      "価格またはポリシーの変更",
      "消費者の権利",
      "お問い合わせ"
    ],
    sectionSummaries: [
      "NivaDesk は EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom が運営します。請求、キャンセル、返金、サブスクリプションについては nivadesk@gmail.com へご連絡ください。",
      "このポリシーは無料アクセス、トライアル、月額・年額サブスクリプション、lifetime プラン、team プラン、ストレージ add-on、その他有料機能に適用されます。制限と機能は料金ページ、アプリ、checkout に表示されます。",
      "キャンセル、更新、返金は購入場所により異なります。Apple は通常 App Store、Google は Google Play、Web 購入は当社または Stripe などが管理します。",
      "有料サブスクリプションは更新日前にキャンセルしない限り自動更新される場合があります。支払い失敗時は再試行、機能制限、ダウングレード、アクセス停止、キャンセルを行う場合があります。",
      "購入したプラットフォームでキャンセルしてください。Apple は Apple Account/App Store 設定、Google は Google Play 設定、Web/Stripe は billing portal または nivadesk@gmail.com です。",
      "App Store 購入の返金は通常 Apple が処理します。Apple が独自ポリシーと適用法に基づき判断し、当社が保証または直接処理できない場合があります。",
      "Google Play 購入の返金は通常 Google が処理します。Google が独自ポリシーと適用法に基づき判断し、当社が保証または直接処理できない場合があります。",
      "Web で直接購入した場合、当社または決済プロバイダーが返金リクエストを確認することがあります。法律上必要な場合や checkout で明示された場合を除き、有料期間開始後の subscription fees は通常返金不可です。",
      "未使用期間の部分返金は、法律または条件で求められる場合を除き義務ではありません。当社の裁量で credit、partial refund、plan extension などを提供する場合があります。",
      "ダウングレードは即時または現在の請求期間終了時に適用される場合があります。アップロード、チームアクセス、カスタマイズ、連携、ストレージ、workflow、advanced export が制限されることがあります。",
      "Pro、Team、その他有料プランが期限切れ、キャンセル、支払い失敗となった場合、アカウントは Free/Demo または limited access に戻る場合があります。既存データのアクセスと export は合理的制限の範囲で維持を目指します。",
      "Lifetime は製品またはプランの存続期間中の含まれる機能へのアクセスを意味し、ユーザー、会社、端末、app store、決済プラットフォームの存続期間ではありません。将来の add-on や新製品は含まれない場合があります。",
      "無料トライアル、beta access、割引、early access pricing、introductory offers を提供する場合があります。条件は signup または checkout に表示され、キャンセルしない場合有料化されることがあります。",
      "NivaDesk はストレージ add-on を提供する場合があります。キャンセルにより利用可能ストレージが減り、制限超過時は新規 upload の制限、使用量削減、add-on、upgrade を求めることがあります。",
      "サブスクリプションのキャンセルはアカウントや workspace data を自動削除しません。削除はアプリ、Account Deletion ページ、または連絡により別途申請し、本人確認が必要な場合があります。",
      "価格は所在地、プラットフォーム、checkout 方法により税込または税抜で表示されます。checkout で徴収されない税金は利用者の責任であり、通貨は異なる場合があります。",
      "請求が誤っていると思う場合は、まず当社へご連絡ください。chargeback や dispute 中はアカウントを制限することがあり、成立した場合 paid access がキャンセルまたはダウングレードされることがあります。",
      "価格、プラン機能、請求条件、返金ルール、またはこのポリシーを変更する場合があります。必要な場合、重要な変更は有料ユーザーに通知します。",
      "このポリシーは適用される消費者保護法上の権利を制限しません。UK、EU、その他地域の強制的な消費者権利は引き続き適用されます。",
      "請求、キャンセル、返金、サブスクリプションについては EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom または nivadesk@gmail.com へご連絡ください。"
    ]
  },
  "中文 (Chinese)": {
    lastUpdatedLabel: "最后更新",
    introTitle: "退款和取消政策",
    introParagraphs: [
      "本政策说明 NivaDesk 付费计划、免费计划、lifetime 计划和 add-ons 的取消、续订、降级、退款、试用和账户访问如何运作。",
      "NivaDesk 由 EGGCRAFT LIMITED 运营。本政策是服务条款的一部分；强制性消费者法律仍然适用。"
    ],
    sectionTitles: [
      "我们是谁",
      "本政策涵盖的计划",
      "购买渠道很重要",
      "订阅续订",
      "如何取消",
      "Apple App Store 购买退款",
      "Google Play 购买退款",
      "Web 购买退款",
      "部分退款和账户积分",
      "降级和计划变更",
      "取消或到期后会发生什么",
      "Lifetime 计划",
      "试用和促销优惠",
      "存储 add-ons",
      "取消后的账户删除",
      "税费和货币",
      "Chargebacks 和付款争议",
      "价格或政策变更",
      "消费者权利",
      "联系我们"
    ],
    sectionSummaries: [
      "NivaDesk 由 EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom 运营。计费、取消、退款或订阅问题请联系 nivadesk@gmail.com。",
      "本政策适用于免费访问、试用、月度或年度订阅、lifetime 计划、团队计划、存储 add-ons 和其他付费功能。限制和功能会在价格页、应用或 checkout 中显示。",
      "取消、续订和退款取决于购买渠道。Apple 通常管理 App Store 购买，Google 管理 Google Play 购买，Web 购买可由我们或 Stripe 等提供商管理。",
      "付费订阅可能在每个计费周期结束时自动续订，除非在续订日前取消。付款失败时，我们可重试、限制功能、降级账户、暂停访问或取消订阅。",
      "你必须通过购买平台取消：Apple Account 或 App Store 设置、Google Play 设置，Web/Stripe 则通过 billing portal 或 nivadesk@gmail.com。",
      "App Store 购买的退款通常由 Apple 处理。Apple 根据自身政策和适用法律决定，我们不能保证或总是自行处理 App Store 退款。",
      "Google Play 购买的退款通常由 Google 处理。Google 根据自身政策和适用法律决定，我们不能保证或总是自行处理 Google Play 退款。",
      "Web 直接购买的退款请求可由我们或支付提供商审查。除非法律要求或 checkout 明确说明，付费周期开始后订阅费用通常不退款。",
      "除非法律或条款要求，我们无需为未使用时间提供部分退款。我们可酌情提供账户积分、部分退款、计划延期或其他补救。",
      "降级可能立即生效或在当前计费期结束后生效。降级可能限制文件上传、团队访问、自定义、集成、存储、workflow 控制或高级导出。",
      "如果 Pro、Team 或其他付费订阅到期、取消或付款失败，账户可能回到 Free/Demo 或有限访问计划。我们目标是在合理安全、技术、法律和存储限制内允许访问和导出现有业务数据。",
      "Lifetime 指在产品或计划生命周期内访问所含功能，不是用户、公司、设备、app store 或支付平台的生命周期。未来 add-ons、第三方费用、存储升级、企业功能或新产品可能不包括在内。",
      "我们可能提供免费试用、beta access、促销折扣、early access pricing 或 introductory offers。条款会在 signup 或 checkout 显示，未取消时试用可能转为付费订阅。",
      "NivaDesk 可提供额外存储 add-ons。取消 add-on 可能降低可用存储；超过限制时，我们可限制新上传，要求减少使用、购买 add-on 或升级。",
      "取消订阅不会自动删除账户或 workspace 数据。账户删除需通过应用、Account Deletion 页面或联系我们单独请求，可能需要身份和 workspace 所有权验证。",
      "价格可能根据位置、平台和 checkout 方式显示含税或不含税。除非平台在 checkout 收取，否则你负责适用税费；货币可能不同。",
      "如果认为收费有误，请先联系我们。发起 chargeback 或付款争议时，我们可在审查期间限制相关账户；成功 chargeback 可能取消或降级付费访问。",
      "我们可能不时更改价格、计划功能、计费条款、退款规则或本政策。需要时，我们会向活跃付费用户通知重大变更。",
      "本政策不限制适用消费者保护法赋予你的权利。UK、EU 或其他地区的强制性消费者权利继续适用。",
      "计费、取消、退款或订阅问题，请联系 EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom 或 nivadesk@gmail.com。"
    ]
  },
  "العربية (Arabic)": {
    lastUpdatedLabel: "آخر تحديث",
    introTitle: "سياسة الاسترداد والإلغاء",
    introParagraphs: [
      "توضح هذه السياسة كيفية عمل الإلغاء والتجديد وخفض الخطة والاسترداد والتجارب والوصول إلى الحساب في خطط NivaDesk والإضافات.",
      "تدير EGGCRAFT LIMITED خدمة NivaDesk. هذه السياسة جزء من شروط الخدمة، وتظل حقوق المستهلك الإلزامية سارية."
    ],
    sectionTitles: [
      "من نحن",
      "الخطط التي تغطيها هذه السياسة",
      "مكان شراء الخطة مهم",
      "تجديد الاشتراكات",
      "كيفية الإلغاء",
      "استرداد مشتريات Apple App Store",
      "استرداد مشتريات Google Play",
      "استرداد مشتريات الويب",
      "الاسترداد الجزئي والأرصدة",
      "خفض الخطة وتغييرها",
      "ما يحدث بعد الإلغاء أو الانتهاء",
      "خطط lifetime",
      "التجارب والعروض الترويجية",
      "إضافات التخزين",
      "حذف الحساب بعد الإلغاء",
      "الضرائب والعملة",
      "Chargebacks ونزاعات الدفع",
      "تغييرات الأسعار أو السياسة",
      "حقوق المستهلك",
      "التواصل"
    ],
    sectionSummaries: [
      "تدير EGGCRAFT LIMITED خدمة NivaDesk من 141 Randolph Avenue, London, W9 1DN, United Kingdom. لأسئلة الفوترة أو الإلغاء أو الاسترداد أو الاشتراكات، تواصل عبر nivadesk@gmail.com.",
      "تنطبق هذه السياسة على الوصول المجاني والتجارب والاشتراكات الشهرية أو السنوية وخطط lifetime وخطط الفريق وإضافات التخزين والميزات المدفوعة الأخرى. تظهر الحدود والميزات في صفحة الأسعار أو التطبيق أو checkout.",
      "تعتمد طريقة الإلغاء والتجديد والاسترداد على مكان الشراء. Apple تدير عادة مشتريات App Store، وGoogle تدير Google Play، ومشتريات الويب قد نديرها نحن أو Stripe.",
      "قد تتجدد الاشتراكات المدفوعة تلقائياً ما لم تُلغ قبل تاريخ التجديد. إذا فشل الدفع، قد نعيد المحاولة أو نحد الميزات أو نخفض الخطة أو نعلق الوصول أو نلغي الاشتراك.",
      "يجب الإلغاء من منصة الشراء: Apple Account أو إعدادات App Store، إعدادات Google Play، أو للويب/Stripe عبر بوابة الفوترة أو nivadesk@gmail.com.",
      "عادة تعالج Apple طلبات استرداد مشتريات App Store. تقرر Apple الأهلية وفق سياساتها والقانون، ولا يمكننا ضمان أو إصدار هذه الاستردادات دائماً بأنفسنا.",
      "عادة تعالج Google طلبات استرداد مشتريات Google Play. تقرر Google الأهلية وفق سياساتها والقانون، ولا يمكننا ضمان أو إصدار هذه الاستردادات دائماً بأنفسنا.",
      "بالنسبة لمشتريات الويب المباشرة، قد نراجع الطلب نحن أو مزود الدفع. ما لم يفرض القانون أو يوضح checkout خلاف ذلك، فإن رسوم الاشتراك لا تُرد عادة بعد بدء الفترة المدفوعة.",
      "لسنا ملزمين برد جزئي للوقت غير المستخدم إلا إذا فرض القانون أو الشروط ذلك. قد نقدم رصيداً أو استرداداً جزئياً أو تمديد خطة أو علاجاً آخر وفق تقديرنا.",
      "قد يسري خفض الخطة فوراً أو في نهاية فترة الفوترة. قد يحد من uploads أو وصول الفريق أو التخصيص أو التكاملات أو التخزين أو workflow أو export المتقدم.",
      "إذا انتهى اشتراك Pro أو Team أو خطة مدفوعة أخرى أو أُلغي أو فشل الدفع، قد يعود الحساب إلى Free/Demo أو وصول محدود. نسعى لإتاحة الوصول والتصدير للبيانات الحالية ضمن حدود معقولة.",
      "تعني lifetime الوصول إلى الميزات المشمولة طوال عمر المنتج أو الخطة، وليس عمر المستخدم أو الشركة أو الجهاز أو app store أو منصة الدفع. قد لا تشمل إضافات مستقبلية أو منتجات جديدة.",
      "قد نقدم تجارب مجانية أو beta access أو خصومات أو early access pricing أو عروضاً تمهيدية. تظهر الشروط عند signup أو checkout وقد تتحول التجربة إلى اشتراك مدفوع إذا لم تُلغ.",
      "قد تقدم NivaDesk إضافات تخزين. إلغاء الإضافة قد يقلل المساحة المتاحة؛ وإذا تجاوزت الحدود فقد نقيد uploads أو نطلب تقليل الاستخدام أو شراء إضافة أو ترقية.",
      "إلغاء الاشتراك لا يحذف الحساب أو بيانات workspace تلقائياً. يجب طلب حذف الحساب بشكل منفصل عبر التطبيق أو صفحة Account Deletion أو التواصل معنا، وقد نحتاج تحقق الهوية والملكية.",
      "قد تظهر الأسعار شاملة أو غير شاملة للضرائب حسب الموقع والمنصة وcheckout. أنت مسؤول عن الضرائب ما لم تُحصّل عند checkout؛ وقد تختلف العملة.",
      "إذا اعتقدت أن هناك رسماً خاطئاً، تواصل معنا أولاً. عند chargeback أو نزاع دفع، قد نقيد الحساب أثناء المراجعة؛ وإذا نجح النزاع قد يُلغى الوصول المدفوع أو يخفض.",
      "قد نغير الأسعار أو ميزات الخطط أو شروط الفوترة أو قواعد الاسترداد أو هذه السياسة. عند الحاجة، سنبلغ المستخدمين المدفوعين النشطين بالتغييرات الجوهرية.",
      "لا تحد هذه السياسة من أي حقوق إلزامية لديك بموجب قوانين حماية المستهلك. تستمر حقوق المستهلك في UK أو EU أو أي ولاية أخرى في التطبيق.",
      "لأسئلة الفوترة أو الإلغاء أو الاسترداد أو الاشتراكات، تواصل مع EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom أو nivadesk@gmail.com."
    ]
  },
  "हिन्दी (Hindi)": {
    lastUpdatedLabel: "अंतिम अपडेट",
    introTitle: "रिफंड और कैंसलेशन नीति",
    introParagraphs: [
      "यह नीति बताती है कि NivaDesk paid plans, free plans, lifetime plans और add-ons में cancellations, renewals, downgrades, refunds, trials और account access कैसे काम करते हैं।",
      "NivaDesk EGGCRAFT LIMITED द्वारा संचालित है। यह नीति Terms of Service का हिस्सा है; mandatory consumer law से मिलने वाले अधिकार लागू रहेंगे।"
    ],
    sectionTitles: [
      "हम कौन हैं",
      "इस नीति में शामिल plans",
      "आपने plan कहाँ खरीदा यह महत्वपूर्ण है",
      "Subscription renewals",
      "Cancel कैसे करें",
      "Apple App Store purchases के refunds",
      "Google Play purchases के refunds",
      "Web purchases के refunds",
      "Partial refunds और credits",
      "Downgrades और plan changes",
      "Cancellation या expiry के बाद क्या होता है",
      "Lifetime plans",
      "Trials और promotional offers",
      "Storage add-ons",
      "Cancellation के बाद account deletion",
      "Taxes और currency",
      "Chargebacks और payment disputes",
      "Prices या policy changes",
      "Consumer rights",
      "Contact"
    ],
    sectionSummaries: [
      "NivaDesk EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom द्वारा संचालित है। Billing, cancellation, refund या subscription questions के लिए nivadesk@gmail.com पर संपर्क करें।",
      "यह policy free access, trials, monthly/annual subscriptions, lifetime plans, team plans, storage add-ons और other paid features पर लागू होती है। Limits और features pricing page, app या checkout में दिखाए जाएंगे।",
      "Cancel, renew और refund की प्रक्रिया purchase platform पर निर्भर करती है। Apple App Store purchases सामान्यतः Apple, Google Play purchases Google, और web purchases हम या Stripe जैसे provider manage कर सकते हैं।",
      "Paid subscriptions renewal date से पहले cancel न होने पर automatically renew हो सकती हैं। Payment fail होने पर हम retry, paid features limit, account downgrade, access suspend या subscription cancel कर सकते हैं।",
      "आपको subscription उसी platform से cancel करनी होगी जहाँ purchase की थी: Apple Account/App Store settings, Google Play settings, या web/Stripe के लिए billing portal या nivadesk@gmail.com।",
      "Apple App Store purchases के refund requests सामान्यतः Apple handle करता है। Apple अपनी policies और applicable law के अनुसार decide करता है; हम App Store refund guarantee या हमेशा issue नहीं कर सकते।",
      "Google Play purchases के refund requests सामान्यतः Google handle करता है। Google अपनी policies और applicable law के अनुसार decide करता है; हम Google Play refund guarantee या हमेशा issue नहीं कर सकते।",
      "Direct web purchases के refund requests हम या payment provider review कर सकते हैं। Law required न हो या checkout में अलग न लिखा हो, paid period शुरू होने के बाद subscription fees generally non-refundable हैं।",
      "Unused time के लिए partial refunds देना जरूरी नहीं है जब तक law या terms require न करें। हम discretion से account credit, partial refund, plan extension या other remedy दे सकते हैं।",
      "Paid plan से lower plan में downgrade immediately या current billing period के end पर लागू हो सकता है। इससे uploads, team access, customisation, integrations, storage, workflow controls या advanced export limit हो सकते हैं।",
      "Pro, Team या other paid subscription expire/cancel/payment fail होने पर account Free/Demo या limited-access plan पर लौट सकता है। Existing business data access और export reasonable security, technical, legal, abuse prevention और storage limits के अधीन रहेंगे।",
      "Lifetime का मतलब product या plan की lifetime तक included NivaDesk features का access है, user, company, device, app store या payment platform की lifetime नहीं। Future add-ons या new products शामिल न हो सकते हैं।",
      "हम free trials, beta access, discounts, early access pricing या introductory offers दे सकते हैं। Trial terms signup या checkout पर दिखेंगे; cancel न करने पर trial paid subscription में बदल सकता है।",
      "NivaDesk extra workspace storage जैसे storage add-ons दे सकता है। Add-on cancel करने से storage allowance घट सकता है; limit exceed होने पर uploads restrict या reduce usage/add-on/upgrade मांगा जा सकता है।",
      "Subscription cancel करने से account या workspace data automatically delete नहीं होता। Account deletion app, Account Deletion page या contact से separately request करना होगा; identity और workspace ownership verification चाहिए हो सकता है।",
      "Prices location, platform और checkout method के अनुसार tax inclusive या exclusive दिख सकते हैं। Checkout में collect न होने पर applicable taxes आपकी जिम्मेदारी हैं; currency country या provider से बदल सकती है।",
      "यदि charge incorrect लगे तो पहले हमसे संपर्क करें। Chargeback या payment dispute होने पर review के दौरान account suspend/limit हो सकता है; successful chargeback paid access cancel या downgrade कर सकता है।",
      "हम prices, plan features, billing terms, refund rules या इस policy को समय-समय पर बदल सकते हैं। Required होने पर active paid users को material changes की notice देंगे।",
      "यह policy applicable consumer protection law से मिलने वाले rights को limit नहीं करती। UK, EU या अन्य jurisdictions में mandatory consumer rights लागू रहेंगे।",
      "Billing, cancellation, refund या subscription questions के लिए EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom या nivadesk@gmail.com पर संपर्क करें।"
    ]
  }
};

const REFUND_CANCELLATION_POLICY_LABELS: Partial<Record<StudioLanguage, string>> = {
  Türkçe: "Son güncelleme",
  Deutsch: "Zuletzt aktualisiert",
  Français: "Dernière mise à jour",
  Italiano: "Ultimo aggiornamento",
  "Español (Spanish)": "Última actualización",
  Português: "Última atualização",
  "Русский (Russian)": "Последнее обновление",
  "日本語 (Japanese)": "最終更新日",
  "中文 (Chinese)": "最后更新",
  "العربية (Arabic)": "آخر تحديث",
  "हिन्दी (Hindi)": "अंतिम अपडेट"
};

const LOCALIZED_REFUND_CANCELLATION_POLICIES: Partial<Record<StudioLanguage, PrivacyPolicySection[]>> = Object.fromEntries(
  Object.entries(REFUND_CANCELLATION_POLICY_DRAFTS).map(([language, copy]) => [
    language,
    buildLocalizedRefundPolicy(copy as LocalizedRefundPolicyDraft)
  ])
) as Partial<Record<StudioLanguage, PrivacyPolicySection[]>>;

export function getRefundCancellationPolicySections(language: StudioLanguage | string | null | undefined) {
  const normalized = language as StudioLanguage;
  return LOCALIZED_REFUND_CANCELLATION_POLICIES[normalized] ?? REFUND_CANCELLATION_POLICY_SECTIONS;
}

export function getRefundCancellationPolicyLastUpdatedLabel(language: StudioLanguage | string | null | undefined) {
  return REFUND_CANCELLATION_POLICY_LABELS[language as StudioLanguage] ?? "Last updated";
}
