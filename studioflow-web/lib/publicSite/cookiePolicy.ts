import type { PrivacyPolicySection } from "@/lib/publicSite/privacyPolicy";
import type { StudioLanguage } from "@/lib/studioflow/language";

export const COOKIE_POLICY_LAST_UPDATED = "13 May 2026";

export const COOKIE_POLICY_SECTIONS: PrivacyPolicySection[] = [
  {
    title: "Cookie Policy",
    paragraphs: [
      "This Cookie Policy explains how NivaDesk, operated by EGGCRAFT LIMITED, uses cookies and similar technologies on our website, web app, mobile apps, desktop apps, and related services.",
      "It should be read together with our Privacy Policy and Terms of Service."
    ]
  },
  {
    title: "1. Who we are",
    paragraphs: [
      "NivaDesk is operated by EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom.",
      "For cookie, privacy, or data protection questions, contact us at: contact@nivadesk.co.uk."
    ]
  },
  {
    title: "2. What are cookies?",
    paragraphs: [
      "Cookies are small text files placed on your browser or device when you visit a website or use an online service. They help websites and apps work, remember preferences, improve security, understand usage, and support features such as login sessions.",
      "In this policy, cookies also includes similar technologies, such as local storage, session storage, pixels, tags, software development kits, device identifiers, and similar technologies that store or access information on your device."
    ]
  },
  {
    title: "3. Why we use cookies and similar technologies",
    paragraphs: ["We may use cookies and similar technologies to:"],
    bullets: [
      "keep you signed in and maintain your session;",
      "remember your language, workspace, display, and cookie preferences;",
      "provide secure access to NivaDesk;",
      "prevent fraud, abuse, spam, and unauthorised access;",
      "process payments and manage subscriptions;",
      "understand how our website and product are used;",
      "improve performance, reliability, and user experience;",
      "diagnose technical issues, crashes, and bugs;",
      "measure marketing performance, where permitted;",
      "support product updates and business communications."
    ]
  },
  {
    title: "4. Types of cookies we may use",
    paragraphs: ["The categories below describe the cookies and similar technologies NivaDesk may use."],
    subsections: [
      {
        title: "Strictly necessary cookies",
        paragraphs: [
          "Required for core features such as login, security, account access, workspace access, session management, payment checkout, and cookie preference storage.",
          "Consent: usually do not require consent because they are needed to provide the service you request."
        ]
      },
      {
        title: "Preference or functionality cookies",
        paragraphs: [
          "Remember settings such as language, region, display preferences, theme, recently selected workspace, or other usability preferences.",
          "Consent: may require consent depending on purpose and local law."
        ]
      },
      {
        title: "Analytics and performance cookies",
        paragraphs: [
          "Help us understand visits, feature usage, errors, performance, navigation patterns, and how to improve NivaDesk.",
          "Consent: usually require consent where required by law, unless an applicable exemption applies."
        ]
      },
      {
        title: "Marketing cookies",
        paragraphs: [
          "May help measure campaigns, understand referrals, or show relevant product information. We aim to keep marketing tracking limited and transparent.",
          "Consent: require consent where required by law."
        ]
      },
      {
        title: "Third-party cookies",
        paragraphs: [
          "May be set by providers that help with authentication, payments, analytics, support, error monitoring, hosting, or embedded content.",
          "Consent: depends on the purpose. Non-essential third-party cookies usually require consent."
        ]
      }
    ]
  },
  {
    title: "5. Strictly necessary cookies",
    paragraphs: [
      "Strictly necessary cookies are required for NivaDesk to work properly. They may be used for security, authentication, fraud prevention, account access, session management, payment checkout, cookie consent records, and workspace permissions.",
      "Because these cookies are necessary to provide the service you request, they cannot usually be switched off through our cookie banner. You may block them in your browser, but parts of NivaDesk may not work correctly."
    ]
  },
  {
    title: "6. Analytics and performance cookies",
    paragraphs: [
      "We may use analytics and performance tools to understand how visitors and users interact with our website and product. These tools may tell us which pages are visited, which features are used, whether pages load correctly, and where errors occur.",
      "Analytics help us improve NivaDesk, fix bugs, measure product performance, and make the service easier to use. Where required by law, we will ask for your consent before using non-essential analytics cookies."
    ]
  },
  {
    title: "7. Marketing and referral cookies",
    paragraphs: [
      "We may use limited marketing or referral cookies to understand how people find NivaDesk, measure the effectiveness of campaigns, and improve our website messaging.",
      "We do not sell your personal data. We do not use your workspace content, uploaded files, client records, order details, or private business data for advertising to your customers.",
      "Where required by law, marketing cookies will only be used with your consent."
    ]
  },
  {
    title: "8. Local storage and app storage",
    paragraphs: [
      "NivaDesk may use browser local storage, session storage, app storage, device storage, or similar technologies. These may help keep you signed in, remember preferences, support offline mode, cache workspace data, queue pending uploads, or improve performance.",
      "If you use offline features, some workspace data may be stored locally on your device. You are responsible for keeping your device secure, using device passcodes, and managing access to your device."
    ]
  },
  {
    title: "9. Mobile and desktop app technologies",
    paragraphs: [
      "Our mobile and desktop apps may use technologies similar to cookies, such as device identifiers, app storage, diagnostic logs, crash reporting, push notification tokens, or authentication tokens.",
      "These technologies may be used to keep the app secure, sync your workspace, remember settings, send service notifications, diagnose crashes, and improve app reliability."
    ]
  },
  {
    title: "10. Third-party providers",
    paragraphs: [
      "NivaDesk may use trusted third-party providers to operate and improve our service. Depending on the features you use, these may include providers for hosting, authentication, database, cloud storage, payment processing, email delivery, analytics, crash reporting, customer support, and app store subscriptions.",
      "Examples of providers we may use include Firebase or Google Cloud, Stripe, Apple, Google Play, email delivery tools, analytics tools, and error monitoring tools. The exact providers may change as NivaDesk develops.",
      "Third-party providers may set or read cookies or similar technologies where necessary to provide their services. Their use of cookies is governed by their own policies as well as our agreements with them where applicable."
    ]
  },
  {
    title: "11. Cookie consent and your choices",
    paragraphs: [
      "When required by law, we will ask for your consent before setting non-essential cookies or similar technologies. You should be able to accept, reject, or manage non-essential cookies through our cookie banner or cookie settings tool.",
      "You can change your cookie preferences at any time through the cookie settings link on our website where available.",
      "You can also control cookies through your browser settings. Most browsers allow you to block, delete, or manage cookies. If you block all cookies, some parts of NivaDesk may not work properly."
    ]
  },
  {
    title: "12. Browser controls",
    paragraphs: [
      "You can usually manage cookies in your browser settings. The exact steps depend on your browser. Common controls include deleting existing cookies, blocking third-party cookies, blocking all cookies, or allowing cookies only for selected websites.",
      "Please note that browser controls may not affect technologies used inside mobile or desktop apps. For app-based controls, you may need to use in-app settings, operating system settings, device privacy settings, or account deletion/export options."
    ]
  },
  {
    title: "13. Do Not Track and global privacy signals",
    paragraphs: [
      "Some browsers offer Do Not Track or global privacy signals. There is currently no single industry standard for responding to all such signals.",
      "Where required by applicable law or supported by our tools, we will honour legally recognised opt-out signals."
    ]
  },
  {
    title: "14. How long cookies last",
    paragraphs: [
      "Cookies may be session cookies or persistent cookies. Session cookies expire when you close your browser. Persistent cookies remain for a set period unless you delete them earlier.",
      "The exact duration depends on the cookie purpose and provider. Strictly necessary session cookies may last only for the current session, while preference or analytics cookies may last longer to remember choices or measure usage over time.",
      "We aim to keep cookie durations proportionate to their purpose."
    ]
  },
  {
    title: "15. Updates to this Cookie Policy",
    paragraphs: [
      "We may update this Cookie Policy from time to time to reflect changes in our website, app, cookies, providers, legal requirements, or business operations.",
      "If we make material changes, we may notify you by updating the date at the top of this page, showing a notice on our website, or contacting you where appropriate."
    ]
  },
  {
    title: "16. Contact us",
    paragraphs: [
      "If you have questions about this Cookie Policy or how NivaDesk uses cookies and similar technologies, please contact us:",
      "EGGCRAFT LIMITED",
      "141 Randolph Avenue",
      "London",
      "W9 1DN",
      "United Kingdom",
      "Email: contact@nivadesk.co.uk"
    ]
  }
];

type LocalizedCookiePolicyDraft = {
  lastUpdatedLabel: string;
  introTitle: string;
  introParagraphs: string[];
  sectionTitles: string[];
  sectionSummaries: string[];
};

function buildLocalizedCookiePolicy(copy: LocalizedCookiePolicyDraft): PrivacyPolicySection[] {
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

const COOKIE_POLICY_DRAFTS: Partial<Record<StudioLanguage, LocalizedCookiePolicyDraft>> = {
  Türkçe: {
    lastUpdatedLabel: "Son güncelleme",
    introTitle: "Çerez Politikası",
    introParagraphs: [
      "Bu Çerez Politikası, EGGCRAFT LIMITED tarafından işletilen NivaDesk'in web sitesi, web app, mobil uygulamalar, masaüstü uygulamalar ve ilgili hizmetlerde çerezleri ve benzer teknolojileri nasıl kullandığını açıklar.",
      "Bu politika Gizlilik Politikası ve Kullanım Şartları ile birlikte okunmalıdır."
    ],
    sectionTitles: [
      "Biz kimiz",
      "Çerezler nedir?",
      "Çerezleri ve benzer teknolojileri neden kullanıyoruz",
      "Kullanabileceğimiz çerez türleri",
      "Kesinlikle gerekli çerezler",
      "Analitik ve performans çerezleri",
      "Pazarlama ve yönlendirme çerezleri",
      "Yerel depolama ve uygulama depolaması",
      "Mobil ve masaüstü uygulama teknolojileri",
      "Üçüncü taraf sağlayıcılar",
      "Çerez onayı ve seçimleriniz",
      "Tarayıcı kontrolleri",
      "Do Not Track ve global gizlilik sinyalleri",
      "Çerezlerin ne kadar süre kaldığı",
      "Bu Çerez Politikasındaki güncellemeler",
      "İletişim"
    ],
    sectionSummaries: [
      "NivaDesk, EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom tarafından işletilir. Çerez ve gizlilik soruları için: contact@nivadesk.co.uk.",
      "Çerezler, bir web sitesini ziyaret ettiğinizde veya çevrimiçi hizmet kullandığınızda tarayıcınıza ya da cihazınıza yerleştirilen küçük metin dosyalarıdır. Bu politika yerel depolama, oturum depolama, piksel, etiket, SDK ve cihaz tanımlayıcıları gibi benzer teknolojileri de kapsar.",
      "Çerezleri oturumunuzu açık tutmak, dil ve workspace tercihlerini hatırlamak, güvenliği sağlamak, dolandırıcılığı önlemek, abonelik ve ödeme süreçlerini desteklemek, kullanım ve performansı anlamak, hataları teşhis etmek ve izin verilen yerlerde pazarlama performansını ölçmek için kullanabiliriz.",
      "NivaDesk; kesinlikle gerekli, tercih veya işlevsellik, analitik ve performans, pazarlama ve üçüncü taraf çerezleri kullanabilir. Zorunlu olmayan çerezler, yerel hukuka göre onay gerektirebilir.",
      "Kesinlikle gerekli çerezler güvenlik, kimlik doğrulama, hesap erişimi, oturum yönetimi, ödeme checkout, çerez tercih kayıtları ve workspace izinleri için gerekir. Tarayıcıdan engellenirse NivaDesk'in bazı kısımları çalışmayabilir.",
      "Analitik ve performans araçları hangi sayfaların ziyaret edildiğini, hangi özelliklerin kullanıldığını, sayfaların doğru yüklenip yüklenmediğini ve hataların nerede oluştuğunu anlamamıza yardımcı olur. Hukuken gerekli olduğunda onay isteriz.",
      "Sınırlı pazarlama veya yönlendirme çerezleri kullanıcıların NivaDesk'i nasıl bulduğunu ve kampanyaların etkisini anlamaya yardımcı olabilir. Workspace içeriğinizi, yüklenen dosyalarınızı veya müşteri kayıtlarınızı müşterilerinize reklam göstermek için kullanmayız.",
      "NivaDesk tarayıcı yerel depolaması, oturum depolaması, uygulama veya cihaz depolaması kullanabilir. Bunlar oturum, tercih, offline mod, workspace önbelleği, bekleyen yükleme kuyruğu ve performans için kullanılabilir.",
      "Mobil ve masaüstü uygulamalar cihaz tanımlayıcıları, uygulama depolaması, teşhis kayıtları, çökme raporları, push bildirim tokenları ve kimlik doğrulama tokenları gibi çerez benzeri teknolojiler kullanabilir.",
      "Hosting, kimlik doğrulama, veritabanı, bulut depolama, ödeme, e-posta, analitik, hata izleme, destek ve uygulama mağazası abonelikleri için güvenilir üçüncü taraf sağlayıcılar kullanabiliriz. Örnekler Firebase/Google Cloud, Stripe, Apple ve Google Play olabilir.",
      "Hukuken gerekli olduğunda zorunlu olmayan çerezlerden önce onay isteriz. Çerez banner'ı veya ayarlar aracı üzerinden kabul, ret veya yönetim seçenekleri sunulabilir; tarayıcı ayarlarınızdan da çerezleri kontrol edebilirsiniz.",
      "Tarayıcılar genellikle mevcut çerezleri silme, üçüncü taraf çerezlerini engelleme, tüm çerezleri engelleme veya yalnızca belirli siteler için izin verme seçenekleri sunar. Bu kontroller mobil veya masaüstü uygulamadaki teknolojileri her zaman etkilemeyebilir.",
      "Bazı tarayıcılar Do Not Track veya global gizlilik sinyalleri sunar. Tek bir sektör standardı yoktur; ancak uygulanabilir hukuk veya araçlarımız desteklediğinde tanınan opt-out sinyallerine uyarız.",
      "Çerezler oturum çerezi veya kalıcı çerez olabilir. Süre, amaca ve sağlayıcıya bağlıdır; çerez sürelerini amaçlarıyla orantılı tutmayı hedefleriz.",
      "Bu politikayı web sitesi, uygulama, sağlayıcılar, yasal gereklilikler veya iş operasyonlarındaki değişiklikleri yansıtmak için zaman zaman güncelleyebiliriz.",
      "Bu Çerez Politikası veya NivaDesk'in çerez kullanımı hakkında sorularınız için EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom veya contact@nivadesk.co.uk üzerinden bize ulaşabilirsiniz."
    ]
  },
  Deutsch: {
    lastUpdatedLabel: "Zuletzt aktualisiert",
    introTitle: "Cookie-Richtlinie",
    introParagraphs: [
      "Diese Cookie-Richtlinie erklärt, wie NivaDesk, betrieben von EGGCRAFT LIMITED, Cookies und ähnliche Technologien auf Website, Web-App, mobilen Apps, Desktop-Apps und verbundenen Diensten nutzt.",
      "Sie sollte zusammen mit der Datenschutzerklärung und den Nutzungsbedingungen gelesen werden."
    ],
    sectionTitles: [
      "Wer wir sind",
      "Was Cookies sind",
      "Warum wir Cookies und ähnliche Technologien nutzen",
      "Welche Arten von Cookies wir verwenden können",
      "Unbedingt erforderliche Cookies",
      "Analyse- und Performance-Cookies",
      "Marketing- und Referral-Cookies",
      "Lokaler Speicher und App-Speicher",
      "Technologien in mobilen und Desktop-Apps",
      "Drittanbieter",
      "Cookie-Einwilligung und deine Wahlmöglichkeiten",
      "Browser-Kontrollen",
      "Do Not Track und globale Datenschutzsignale",
      "Wie lange Cookies gespeichert bleiben",
      "Aktualisierungen dieser Cookie-Richtlinie",
      "Kontakt"
    ],
    sectionSummaries: [
      "NivaDesk wird von EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom betrieben. Fragen zu Cookies oder Datenschutz: contact@nivadesk.co.uk.",
      "Cookies sind kleine Textdateien auf Browser oder Gerät. Diese Richtlinie umfasst auch lokalen Speicher, Session Storage, Pixel, Tags, SDKs, Gerätekennungen und ähnliche Technologien.",
      "Wir können Cookies nutzen, um Sitzungen zu erhalten, Sprache und Workspace-Präferenzen zu speichern, Sicherheit bereitzustellen, Betrug zu verhindern, Abrechnung zu unterstützen, Nutzung und Leistung zu verstehen, Fehler zu diagnostizieren und erlaubte Marketingmessung zu ermöglichen.",
      "NivaDesk kann unbedingt erforderliche, Präferenz-, Analyse-, Performance-, Marketing- und Drittanbieter-Cookies verwenden. Nicht notwendige Cookies können je nach lokalem Recht eine Einwilligung erfordern.",
      "Unbedingt erforderliche Cookies sind für Sicherheit, Anmeldung, Kontozugriff, Sitzungen, Checkout, Einwilligungsprotokolle und Workspace-Berechtigungen nötig. Wenn du sie im Browser blockierst, funktionieren Teile von NivaDesk möglicherweise nicht richtig.",
      "Analyse- und Performance-Tools helfen uns zu verstehen, welche Seiten und Funktionen genutzt werden, ob Seiten korrekt laden und wo Fehler auftreten. Wenn gesetzlich nötig, fragen wir vorher nach Einwilligung.",
      "Begrenzte Marketing- oder Referral-Cookies können zeigen, wie Menschen NivaDesk finden und wie Kampagnen wirken. Wir verkaufen keine personenbezogenen Daten und nutzen keine Workspace-Inhalte für Werbung an deine Kunden.",
      "NivaDesk kann lokalen Browser-Speicher, Session Storage, App- oder Gerätespeicher verwenden, um Anmeldung, Präferenzen, Offline-Modus, Workspace-Cache, Upload-Warteschlangen und Leistung zu unterstützen.",
      "Mobile und Desktop-Apps können cookieähnliche Technologien wie Gerätekennungen, App-Speicher, Diagnoseprotokolle, Crash Reports, Push-Token und Authentifizierungstoken nutzen.",
      "Wir können vertrauenswürdige Anbieter für Hosting, Authentifizierung, Datenbank, Cloud-Speicher, Zahlungen, E-Mail, Analyse, Fehlerüberwachung, Support und App-Store-Abos einsetzen, etwa Firebase/Google Cloud, Stripe, Apple oder Google Play.",
      "Wenn gesetzlich erforderlich, holen wir vor nicht notwendigen Cookies deine Einwilligung ein. Du kannst Cookies über Banner, Einstellungen oder den Browser annehmen, ablehnen oder verwalten.",
      "Browser bieten meist Optionen zum Löschen, Blockieren von Drittanbieter-Cookies, Blockieren aller Cookies oder Zulassen ausgewählter Websites. Diese Einstellungen wirken nicht immer auf mobile oder Desktop-Apps.",
      "Einige Browser bieten Do Not Track oder globale Datenschutzsignale. Es gibt keinen einheitlichen Branchenstandard; rechtlich anerkannte Opt-out-Signale beachten wir, soweit erforderlich oder technisch unterstützt.",
      "Cookies können sitzungsbasiert oder dauerhaft sein. Die Dauer hängt von Zweck und Anbieter ab; wir versuchen, sie verhältnismäßig zu halten.",
      "Wir können diese Richtlinie aktualisieren, wenn sich Website, App, Cookies, Anbieter, rechtliche Anforderungen oder Geschäftsabläufe ändern.",
      "Fragen zu dieser Cookie-Richtlinie beantwortet EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom oder contact@nivadesk.co.uk."
    ]
  },
  Français: {
    lastUpdatedLabel: "Dernière mise à jour",
    introTitle: "Politique relative aux cookies",
    introParagraphs: [
      "Cette Politique relative aux cookies explique comment NivaDesk, exploité par EGGCRAFT LIMITED, utilise les cookies et technologies similaires sur le site, l'application web, les apps mobiles, les apps de bureau et les services associés.",
      "Elle doit être lue avec notre Politique de confidentialité et nos Conditions d'utilisation."
    ],
    sectionTitles: [
      "Qui nous sommes",
      "Que sont les cookies ?",
      "Pourquoi nous utilisons les cookies et technologies similaires",
      "Types de cookies que nous pouvons utiliser",
      "Cookies strictement nécessaires",
      "Cookies d'analyse et de performance",
      "Cookies marketing et de référence",
      "Stockage local et stockage d'application",
      "Technologies des apps mobiles et de bureau",
      "Prestataires tiers",
      "Consentement aux cookies et vos choix",
      "Contrôles du navigateur",
      "Do Not Track et signaux globaux de confidentialité",
      "Durée de conservation des cookies",
      "Mises à jour de cette Politique",
      "Contact"
    ],
    sectionSummaries: [
      "NivaDesk est exploité par EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. Questions cookies ou confidentialité : contact@nivadesk.co.uk.",
      "Les cookies sont de petits fichiers texte placés sur votre navigateur ou appareil. Cette politique couvre aussi le stockage local, le stockage de session, pixels, tags, SDK, identifiants d'appareil et technologies similaires.",
      "Nous pouvons utiliser ces technologies pour maintenir la connexion, mémoriser la langue et le workspace, sécuriser l'accès, prévenir la fraude, gérer les paiements, comprendre l'usage, améliorer la performance, diagnostiquer les erreurs et mesurer le marketing lorsque permis.",
      "NivaDesk peut utiliser des cookies strictement nécessaires, de préférences, d'analyse, de performance, marketing et de tiers. Les cookies non essentiels peuvent nécessiter votre consentement selon la loi locale.",
      "Les cookies strictement nécessaires servent à la sécurité, l'authentification, l'accès au compte, les sessions, le paiement, les preuves de consentement et les permissions de workspace. Les bloquer peut empêcher certaines parties de fonctionner.",
      "Les outils d'analyse et de performance nous aident à savoir quelles pages et fonctions sont utilisées, si les pages chargent correctement et où les erreurs apparaissent. Lorsque la loi l'exige, nous demandons le consentement.",
      "Des cookies marketing ou de référence limités peuvent mesurer la façon dont les visiteurs trouvent NivaDesk et l'efficacité des campagnes. Nous ne vendons pas vos données et n'utilisons pas le contenu du workspace pour cibler vos clients.",
      "NivaDesk peut utiliser le stockage local, de session, d'application ou d'appareil pour la connexion, les préférences, le mode hors ligne, le cache du workspace, les files d'attente d'upload et la performance.",
      "Les apps mobiles et de bureau peuvent utiliser des technologies similaires comme identifiants d'appareil, stockage d'app, journaux de diagnostic, rapports de crash, tokens push ou tokens d'authentification.",
      "Nous pouvons utiliser des prestataires de confiance pour hébergement, authentification, base de données, stockage cloud, paiement, e-mail, analyse, suivi d'erreurs, support et abonnements app store, par exemple Firebase/Google Cloud, Stripe, Apple ou Google Play.",
      "Lorsque la loi l'exige, nous demandons votre consentement avant les cookies non essentiels. Vous pouvez accepter, refuser ou gérer les cookies via la bannière, les paramètres ou votre navigateur.",
      "Les navigateurs permettent généralement de supprimer les cookies, bloquer les cookies tiers, bloquer tous les cookies ou autoriser certains sites. Ces contrôles n'agissent pas toujours sur les apps mobiles ou de bureau.",
      "Certains navigateurs proposent Do Not Track ou des signaux globaux de confidentialité. Il n'existe pas de standard unique; nous respecterons les signaux reconnus lorsque la loi l'exige ou lorsque nos outils le permettent.",
      "Les cookies peuvent être de session ou persistants. Leur durée dépend du but et du prestataire; nous visons des durées proportionnées.",
      "Nous pouvons mettre à jour cette politique pour refléter les changements du site, de l'app, des cookies, prestataires, exigences légales ou opérations.",
      "Pour toute question, contactez EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom ou contact@nivadesk.co.uk."
    ]
  },
  Italiano: {
    lastUpdatedLabel: "Ultimo aggiornamento",
    introTitle: "Informativa sui cookie",
    introParagraphs: [
      "Questa Informativa sui cookie spiega come NivaDesk, gestito da EGGCRAFT LIMITED, usa cookie e tecnologie simili su sito, web app, app mobili, app desktop e servizi collegati.",
      "Va letta insieme alla Privacy Policy e ai Termini di Servizio."
    ],
    sectionTitles: [
      "Chi siamo",
      "Cosa sono i cookie",
      "Perché usiamo cookie e tecnologie simili",
      "Tipi di cookie che possiamo usare",
      "Cookie strettamente necessari",
      "Cookie di analisi e prestazioni",
      "Cookie marketing e referral",
      "Archiviazione locale e dell'app",
      "Tecnologie per app mobili e desktop",
      "Fornitori terzi",
      "Consenso ai cookie e scelte",
      "Controlli del browser",
      "Do Not Track e segnali globali privacy",
      "Durata dei cookie",
      "Aggiornamenti a questa Informativa",
      "Contatti"
    ],
    sectionSummaries: [
      "NivaDesk è gestito da EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. Domande su cookie o privacy: contact@nivadesk.co.uk.",
      "I cookie sono piccoli file di testo sul browser o dispositivo. Questa informativa include anche local storage, session storage, pixel, tag, SDK, identificatori dispositivo e tecnologie simili.",
      "Possiamo usarli per mantenere la sessione, ricordare lingua e workspace, proteggere l'accesso, prevenire abusi, gestire pagamenti, capire l'uso, migliorare prestazioni, diagnosticare errori e misurare marketing quando consentito.",
      "NivaDesk può usare cookie necessari, preferenze, analisi, prestazioni, marketing e terze parti. I cookie non essenziali possono richiedere consenso secondo la legge locale.",
      "I cookie necessari servono per sicurezza, login, account, sessioni, checkout, registri di consenso e permessi del workspace. Bloccarli può impedire il corretto funzionamento di NivaDesk.",
      "Gli strumenti di analisi e prestazioni ci aiutano a capire pagine visitate, funzioni usate, caricamenti corretti ed errori. Quando richiesto dalla legge, chiediamo consenso.",
      "Cookie marketing o referral limitati possono misurare come le persone trovano NivaDesk e l'efficacia delle campagne. Non vendiamo dati personali e non usiamo contenuti del workspace per pubblicità verso i tuoi clienti.",
      "NivaDesk può usare storage locale, sessione, app o dispositivo per login, preferenze, offline, cache workspace, code upload e prestazioni.",
      "Le app mobili e desktop possono usare identificatori dispositivo, app storage, log diagnostici, crash report, token push o token di autenticazione.",
      "Possiamo usare fornitori affidabili per hosting, autenticazione, database, cloud, pagamenti, email, analytics, error monitoring, supporto e abbonamenti app store, come Firebase/Google Cloud, Stripe, Apple o Google Play.",
      "Quando richiesto, chiediamo consenso prima dei cookie non essenziali. Puoi accettare, rifiutare o gestire i cookie tramite banner, impostazioni o browser.",
      "Il browser consente di eliminare cookie, bloccare terze parti, bloccare tutti i cookie o autorizzare siti selezionati. Questi controlli potrebbero non valere per app mobili o desktop.",
      "Alcuni browser offrono Do Not Track o segnali globali privacy. Non esiste uno standard unico; rispettiamo segnali riconosciuti quando richiesto o supportato.",
      "I cookie possono essere di sessione o persistenti. La durata dipende da scopo e fornitore; cerchiamo di mantenerla proporzionata.",
      "Possiamo aggiornare questa informativa per cambiamenti a sito, app, cookie, fornitori, leggi o operazioni.",
      "Per domande contatta EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom o contact@nivadesk.co.uk."
    ]
  },
  "Español (Spanish)": {
    lastUpdatedLabel: "Última actualización",
    introTitle: "Política de Cookies",
    introParagraphs: [
      "Esta Política de Cookies explica cómo NivaDesk, operado por EGGCRAFT LIMITED, usa cookies y tecnologías similares en el sitio web, web app, apps móviles, apps de escritorio y servicios relacionados.",
      "Debe leerse junto con la Política de Privacidad y los Términos del Servicio."
    ],
    sectionTitles: [
      "Quiénes somos",
      "Qué son las cookies",
      "Por qué usamos cookies y tecnologías similares",
      "Tipos de cookies que podemos usar",
      "Cookies estrictamente necesarias",
      "Cookies de analítica y rendimiento",
      "Cookies de marketing y referencia",
      "Almacenamiento local y de la app",
      "Tecnologías de apps móviles y de escritorio",
      "Proveedores externos",
      "Consentimiento de cookies y tus opciones",
      "Controles del navegador",
      "Do Not Track y señales globales de privacidad",
      "Cuánto duran las cookies",
      "Actualizaciones de esta Política",
      "Contacto"
    ],
    sectionSummaries: [
      "NivaDesk es operado por EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. Preguntas sobre cookies o privacidad: contact@nivadesk.co.uk.",
      "Las cookies son pequeños archivos de texto en tu navegador o dispositivo. Esta política también cubre almacenamiento local, almacenamiento de sesión, píxeles, etiquetas, SDK, identificadores de dispositivo y tecnologías similares.",
      "Podemos usarlas para mantener sesión, recordar idioma y workspace, proteger el acceso, prevenir fraude, gestionar pagos, entender uso, mejorar rendimiento, diagnosticar errores y medir marketing cuando esté permitido.",
      "NivaDesk puede usar cookies necesarias, de preferencias, analítica, rendimiento, marketing y terceros. Las cookies no esenciales pueden requerir consentimiento según la ley local.",
      "Las cookies necesarias sirven para seguridad, autenticación, acceso a cuenta, sesiones, checkout, registros de consentimiento y permisos del workspace. Si las bloqueas, partes de NivaDesk pueden no funcionar.",
      "Las herramientas de analítica y rendimiento nos ayudan a entender páginas visitadas, funciones usadas, carga correcta y errores. Cuando la ley lo exige, pedimos consentimiento.",
      "Cookies limitadas de marketing o referencia pueden medir cómo las personas encuentran NivaDesk y la eficacia de campañas. No vendemos datos ni usamos contenido del workspace para anunciar a tus clientes.",
      "NivaDesk puede usar almacenamiento local, de sesión, de app o de dispositivo para inicio de sesión, preferencias, modo offline, caché de workspace, cola de uploads y rendimiento.",
      "Las apps móviles y de escritorio pueden usar identificadores de dispositivo, almacenamiento de app, logs diagnósticos, crash reports, tokens push o tokens de autenticación.",
      "Podemos usar proveedores de confianza para hosting, autenticación, base de datos, nube, pagos, email, analítica, errores, soporte y suscripciones de app store, como Firebase/Google Cloud, Stripe, Apple o Google Play.",
      "Cuando sea necesario, pedimos consentimiento antes de cookies no esenciales. Puedes aceptar, rechazar o gestionar cookies mediante banner, ajustes o navegador.",
      "Los navegadores suelen permitir borrar cookies, bloquear cookies de terceros, bloquear todas o permitir sitios concretos. Esto no siempre afecta a apps móviles o de escritorio.",
      "Algunos navegadores ofrecen Do Not Track o señales globales de privacidad. No hay un estándar único; respetaremos señales reconocidas cuando la ley o nuestras herramientas lo permitan.",
      "Las cookies pueden ser de sesión o persistentes. La duración depende del propósito y proveedor; intentamos que sea proporcional.",
      "Podemos actualizar esta política para reflejar cambios en sitio, app, cookies, proveedores, requisitos legales u operaciones.",
      "Para preguntas, contacta con EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom o contact@nivadesk.co.uk."
    ]
  },
  Português: {
    lastUpdatedLabel: "Última atualização",
    introTitle: "Política de Cookies",
    introParagraphs: [
      "Esta Política de Cookies explica como a NivaDesk, operada pela EGGCRAFT LIMITED, usa cookies e tecnologias semelhantes no website, web app, apps móveis, apps desktop e serviços relacionados.",
      "Deve ser lida em conjunto com a Política de Privacidade e os Termos de Serviço."
    ],
    sectionTitles: [
      "Quem somos",
      "O que são cookies",
      "Porque usamos cookies e tecnologias semelhantes",
      "Tipos de cookies que podemos usar",
      "Cookies estritamente necessários",
      "Cookies de analytics e desempenho",
      "Cookies de marketing e referência",
      "Armazenamento local e da app",
      "Tecnologias de apps móveis e desktop",
      "Fornecedores terceiros",
      "Consentimento de cookies e escolhas",
      "Controlos do navegador",
      "Do Not Track e sinais globais de privacidade",
      "Quanto tempo duram os cookies",
      "Atualizações desta Política",
      "Contacto"
    ],
    sectionSummaries: [
      "A NivaDesk é operada pela EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. Questões sobre cookies ou privacidade: contact@nivadesk.co.uk.",
      "Cookies são pequenos ficheiros de texto no navegador ou dispositivo. Esta política também cobre armazenamento local, sessão, pixels, tags, SDKs, identificadores de dispositivo e tecnologias semelhantes.",
      "Podemos usá-los para manter sessão, lembrar idioma e workspace, proteger acesso, prevenir fraude, gerir pagamentos, compreender uso, melhorar desempenho, diagnosticar erros e medir marketing quando permitido.",
      "A NivaDesk pode usar cookies necessários, preferências, analytics, desempenho, marketing e terceiros. Cookies não essenciais podem exigir consentimento conforme a lei local.",
      "Cookies necessários suportam segurança, login, conta, sessões, checkout, registos de consentimento e permissões de workspace. Se bloqueados, partes da NivaDesk podem não funcionar.",
      "Ferramentas de analytics e desempenho ajudam a entender páginas visitadas, recursos usados, carregamento correto e erros. Quando exigido por lei, pedimos consentimento.",
      "Cookies limitados de marketing ou referência podem medir como as pessoas encontram a NivaDesk e campanhas. Não vendemos dados nem usamos conteúdo do workspace para publicidade aos seus clientes.",
      "A NivaDesk pode usar armazenamento local, sessão, app ou dispositivo para login, preferências, modo offline, cache de workspace, filas de upload e desempenho.",
      "Apps móveis e desktop podem usar identificadores de dispositivo, armazenamento da app, logs diagnósticos, relatórios de crash, tokens push ou autenticação.",
      "Podemos usar fornecedores confiáveis para hosting, autenticação, base de dados, cloud, pagamentos, email, analytics, erros, suporte e subscrições app store, como Firebase/Google Cloud, Stripe, Apple ou Google Play.",
      "Quando necessário, pedimos consentimento antes de cookies não essenciais. Pode aceitar, rejeitar ou gerir cookies no banner, definições ou navegador.",
      "Navegadores normalmente permitem apagar cookies, bloquear terceiros, bloquear todos ou permitir sites escolhidos. Isto pode não afetar apps móveis ou desktop.",
      "Alguns navegadores oferecem Do Not Track ou sinais globais de privacidade. Não há padrão único; respeitamos sinais reconhecidos quando exigido ou suportado.",
      "Cookies podem ser de sessão ou persistentes. A duração depende do objetivo e fornecedor; procuramos mantê-la proporcional.",
      "Podemos atualizar esta política por alterações no website, app, cookies, fornecedores, lei ou operações.",
      "Para questões, contacte EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom ou contact@nivadesk.co.uk."
    ]
  },
  "Русский (Russian)": {
    lastUpdatedLabel: "Последнее обновление",
    introTitle: "Политика использования cookies",
    introParagraphs: [
      "Эта Политика объясняет, как NivaDesk, управляемый EGGCRAFT LIMITED, использует cookies и похожие технологии на сайте, в веб-приложении, мобильных и настольных приложениях и связанных сервисах.",
      "Ее следует читать вместе с Политикой конфиденциальности и Условиями обслуживания."
    ],
    sectionTitles: [
      "Кто мы",
      "Что такое cookies",
      "Зачем мы используем cookies и похожие технологии",
      "Типы cookies, которые мы можем использовать",
      "Строго необходимые cookies",
      "Аналитические и performance cookies",
      "Маркетинговые и referral cookies",
      "Локальное и app-хранилище",
      "Технологии мобильных и настольных приложений",
      "Сторонние провайдеры",
      "Согласие на cookies и ваши выборы",
      "Настройки браузера",
      "Do Not Track и глобальные сигналы приватности",
      "Как долго хранятся cookies",
      "Обновления этой Политики",
      "Контакт"
    ],
    sectionSummaries: [
      "NivaDesk управляется EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. Вопросы о cookies или приватности: contact@nivadesk.co.uk.",
      "Cookies — небольшие текстовые файлы в браузере или устройстве. Эта политика также охватывает local storage, session storage, пиксели, теги, SDK, идентификаторы устройств и похожие технологии.",
      "Мы можем использовать их для сохранения входа, языка и workspace, защиты доступа, предотвращения мошенничества, платежей, анализа использования, улучшения performance, диагностики ошибок и разрешенного маркетингового измерения.",
      "NivaDesk может использовать необходимые, preference, analytics, performance, marketing и third-party cookies. Необязательные cookies могут требовать согласия по местному закону.",
      "Необходимые cookies нужны для безопасности, входа, аккаунта, сессий, checkout, записей согласия и разрешений workspace. При блокировке части NivaDesk могут работать неправильно.",
      "Аналитика и performance помогают понимать посещенные страницы, использованные функции, загрузку и ошибки. Если закон требует, мы запрашиваем согласие.",
      "Ограниченные marketing или referral cookies могут измерять, как люди находят NivaDesk и эффективность кампаний. Мы не продаем данные и не используем содержимое workspace для рекламы вашим клиентам.",
      "NivaDesk может использовать local/session/app/device storage для входа, настроек, offline mode, кэша workspace, очереди загрузок и performance.",
      "Мобильные и настольные приложения могут использовать идентификаторы устройств, app storage, диагностические логи, crash reports, push-токены и auth-токены.",
      "Мы можем использовать доверенных провайдеров для hosting, auth, database, cloud storage, payments, email, analytics, error monitoring, support и app store subscriptions, например Firebase/Google Cloud, Stripe, Apple или Google Play.",
      "Когда требуется, мы просим согласие перед необязательными cookies. Вы можете принять, отклонить или управлять cookies через banner, settings или browser.",
      "Браузеры обычно позволяют удалить cookies, блокировать third-party cookies, блокировать все cookies или разрешать выбранные сайты. Это не всегда влияет на mobile или desktop apps.",
      "Некоторые браузеры предлагают Do Not Track или глобальные сигналы приватности. Единого стандарта нет; мы учитываем признанные сигналы, когда это требуется или поддерживается.",
      "Cookies бывают session или persistent. Срок зависит от цели и провайдера; мы стремимся сохранять его пропорциональным.",
      "Мы можем обновлять эту политику при изменениях сайта, приложения, cookies, провайдеров, законов или операций.",
      "По вопросам обращайтесь: EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom или contact@nivadesk.co.uk."
    ]
  },
  "日本語 (Japanese)": {
    lastUpdatedLabel: "最終更新日",
    introTitle: "Cookie ポリシー",
    introParagraphs: [
      "この Cookie ポリシーは、EGGCRAFT LIMITED が運営する NivaDesk が、ウェブサイト、Web アプリ、モバイルアプリ、デスクトップアプリおよび関連サービスで cookies と類似技術をどのように使用するかを説明します。",
      "プライバシーポリシーおよび利用規約とあわせてお読みください。"
    ],
    sectionTitles: [
      "運営者",
      "Cookies とは",
      "Cookies と類似技術を使用する理由",
      "使用する可能性のある cookie の種類",
      "厳密に必要な cookies",
      "分析およびパフォーマンス cookies",
      "マーケティングおよび紹介 cookies",
      "ローカルストレージとアプリストレージ",
      "モバイルおよびデスクトップアプリ技術",
      "第三者プロバイダー",
      "Cookie 同意と選択",
      "ブラウザ設定",
      "Do Not Track とグローバルプライバシー信号",
      "Cookies の保存期間",
      "このポリシーの更新",
      "お問い合わせ"
    ],
    sectionSummaries: [
      "NivaDesk は EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom が運営します。Cookie またはプライバシーに関する連絡先: contact@nivadesk.co.uk。",
      "Cookies はブラウザや端末に保存される小さなテキストファイルです。このポリシーは local storage、session storage、pixels、tags、SDK、端末識別子などの類似技術も対象にします。",
      "ログイン維持、言語や workspace 設定の保存、安全なアクセス、不正防止、支払い、利用状況把握、性能改善、エラー診断、許可されたマーケティング測定のために使用する場合があります。",
      "NivaDesk は必須、設定、分析、パフォーマンス、マーケティング、第三者 cookies を使用する場合があります。必須でない cookies は地域の法律により同意が必要になることがあります。",
      "必須 cookies はセキュリティ、認証、アカウント、セッション、checkout、同意記録、workspace 権限に必要です。ブロックすると NivaDesk の一部が正しく動作しない場合があります。",
      "分析とパフォーマンスツールは、訪問ページ、利用機能、読み込み状況、エラーの発生箇所を理解するために役立ちます。法律上必要な場合は同意を求めます。",
      "限定的なマーケティングまたは紹介 cookies は、ユーザーが NivaDesk を見つけた経路やキャンペーン効果を測定します。個人データを販売せず、workspace コンテンツを顧客向け広告に使用しません。",
      "NivaDesk はログイン、設定、オフラインモード、workspace キャッシュ、アップロード待ち行列、性能改善のためにローカル、セッション、アプリ、端末ストレージを使用する場合があります。",
      "モバイルおよびデスクトップアプリは、端末識別子、アプリストレージ、診断ログ、クラッシュレポート、push token、認証 token を使用する場合があります。",
      "Hosting、認証、データベース、クラウド、決済、メール、分析、エラー監視、サポート、アプリストア購読のために Firebase/Google Cloud、Stripe、Apple、Google Play などの信頼できる provider を使う場合があります。",
      "必要な場合、必須でない cookies の前に同意を求めます。バナー、設定、ブラウザから cookies を承認、拒否、管理できます。",
      "ブラウザでは cookies の削除、第三者 cookies のブロック、全 cookies のブロック、特定サイトのみ許可が可能です。モバイルや desktop app には常に適用されるとは限りません。",
      "一部ブラウザは Do Not Track やグローバルプライバシー信号を提供します。統一標準はありませんが、法律上必要または技術的に対応可能な認識済み信号を尊重します。",
      "Cookies は session または persistent です。保存期間は目的と provider によりますが、目的に比例する期間を目指します。",
      "サイト、アプリ、cookies、provider、法的要件、運営の変更に応じてこのポリシーを更新する場合があります。",
      "お問い合わせは EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom または contact@nivadesk.co.uk まで。"
    ]
  },
  "中文 (Chinese)": {
    lastUpdatedLabel: "最后更新",
    introTitle: "Cookie 政策",
    introParagraphs: [
      "本 Cookie 政策说明由 EGGCRAFT LIMITED 运营的 NivaDesk 如何在网站、Web 应用、移动应用、桌面应用和相关服务中使用 cookies 及类似技术。",
      "请与隐私政策和服务条款一并阅读。"
    ],
    sectionTitles: [
      "我们是谁",
      "什么是 cookies",
      "我们为什么使用 cookies 和类似技术",
      "我们可能使用的 cookies 类型",
      "严格必要 cookies",
      "分析和性能 cookies",
      "营销和来源 cookies",
      "本地存储和应用存储",
      "移动和桌面应用技术",
      "第三方服务商",
      "Cookie 同意和你的选择",
      "浏览器控制",
      "Do Not Track 和全球隐私信号",
      "Cookies 保存多久",
      "本政策更新",
      "联系"
    ],
    sectionSummaries: [
      "NivaDesk 由 EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom 运营。Cookie 或隐私问题请联系 contact@nivadesk.co.uk。",
      "Cookies 是保存在浏览器或设备上的小型文本文件。本政策也涵盖 local storage、session storage、pixels、tags、SDK、设备标识符和类似技术。",
      "我们可能用它们保持登录、记住语言和 workspace、安全访问、防止欺诈、支持付款、了解使用、提升性能、诊断错误以及在允许时衡量营销效果。",
      "NivaDesk 可能使用必要、偏好、分析、性能、营销和第三方 cookies。非必要 cookies 可能依法需要同意。",
      "必要 cookies 用于安全、登录、账户、会话、checkout、同意记录和 workspace 权限。阻止后 NivaDesk 部分功能可能无法正常工作。",
      "分析和性能工具帮助我们了解访问页面、使用功能、加载情况和错误位置。法律要求时，我们会先请求同意。",
      "有限的营销或来源 cookies 可衡量用户如何找到 NivaDesk 及活动效果。我们不出售个人数据，也不将 workspace 内容用于向你的客户投放广告。",
      "NivaDesk 可使用本地、会话、应用或设备存储来支持登录、偏好、离线模式、workspace 缓存、上传队列和性能。",
      "移动和桌面应用可使用设备标识符、应用存储、诊断日志、崩溃报告、push token 或认证 token。",
      "我们可使用可信服务商处理托管、认证、数据库、云存储、付款、邮件、分析、错误监控、支持和应用商店订阅，例如 Firebase/Google Cloud、Stripe、Apple 或 Google Play。",
      "必要时，我们会在设置非必要 cookies 前请求同意。你可通过横幅、设置或浏览器接受、拒绝或管理 cookies。",
      "浏览器通常允许删除 cookies、阻止第三方 cookies、阻止全部 cookies 或仅允许特定网站。这些控制不一定影响移动或桌面应用。",
      "某些浏览器提供 Do Not Track 或全球隐私信号。行业没有统一标准；在法律要求或工具支持时，我们会尊重被认可的退出信号。",
      "Cookies 可以是会话或持久 cookies。保存时间取决于目的和服务商；我们会尽量保持与目的相称。",
      "我们可能因网站、应用、cookies、服务商、法律要求或运营变化而更新本政策。",
      "如有问题，请联系 EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom 或 contact@nivadesk.co.uk。"
    ]
  },
  "العربية (Arabic)": {
    lastUpdatedLabel: "آخر تحديث",
    introTitle: "سياسة ملفات تعريف الارتباط",
    introParagraphs: [
      "توضح هذه السياسة كيف تستخدم NivaDesk، التي تديرها EGGCRAFT LIMITED، ملفات تعريف الارتباط والتقنيات المشابهة على الموقع وتطبيق الويب وتطبيقات الجوال وسطح المكتب والخدمات المرتبطة.",
      "يجب قراءتها مع سياسة الخصوصية وشروط الخدمة."
    ],
    sectionTitles: [
      "من نحن",
      "ما هي ملفات تعريف الارتباط",
      "لماذا نستخدم ملفات تعريف الارتباط والتقنيات المشابهة",
      "أنواع الملفات التي قد نستخدمها",
      "الملفات الضرورية تماماً",
      "ملفات التحليلات والأداء",
      "ملفات التسويق والإحالة",
      "التخزين المحلي وتخزين التطبيق",
      "تقنيات تطبيقات الجوال وسطح المكتب",
      "مزودو الطرف الثالث",
      "موافقة ملفات تعريف الارتباط وخياراتك",
      "إعدادات المتصفح",
      "Do Not Track وإشارات الخصوصية العالمية",
      "مدة بقاء الملفات",
      "تحديثات هذه السياسة",
      "التواصل"
    ],
    sectionSummaries: [
      "تدير EGGCRAFT LIMITED خدمة NivaDesk من 141 Randolph Avenue, London, W9 1DN, United Kingdom. للأسئلة حول cookies أو الخصوصية: contact@nivadesk.co.uk.",
      "ملفات تعريف الارتباط هي ملفات نصية صغيرة على المتصفح أو الجهاز. تشمل هذه السياسة أيضاً التخزين المحلي وتخزين الجلسة والبكسلات والوسوم وSDK ومعرفات الجهاز والتقنيات المشابهة.",
      "قد نستخدمها للحفاظ على تسجيل الدخول، وتذكر اللغة وworkspace، وتأمين الوصول، ومنع الاحتيال، ودعم المدفوعات، وفهم الاستخدام، وتحسين الأداء، وتشخيص الأخطاء، وقياس التسويق حيث يسمح القانون.",
      "قد تستخدم NivaDesk ملفات ضرورية وتفضيلات وتحليلات وأداء وتسويق وطرف ثالث. قد تتطلب الملفات غير الضرورية موافقة حسب القانون المحلي.",
      "الملفات الضرورية تدعم الأمان وتسجيل الدخول والحساب والجلسات وcheckout وسجلات الموافقة وأذونات workspace. قد لا تعمل بعض أجزاء NivaDesk إذا حُظرت.",
      "تساعد أدوات التحليلات والأداء في فهم الصفحات والميزات المستخدمة وحالة التحميل ومواقع الأخطاء. نطلب الموافقة عندما يتطلب القانون ذلك.",
      "قد تقيس ملفات التسويق أو الإحالة المحدودة كيف يجد الأشخاص NivaDesk وفعالية الحملات. لا نبيع البيانات ولا نستخدم محتوى workspace للإعلان لعملائك.",
      "قد تستخدم NivaDesk التخزين المحلي أو الجلسة أو التطبيق أو الجهاز لدعم تسجيل الدخول والتفضيلات والوضع دون اتصال وذاكرة workspace المؤقتة وطوابير الرفع والأداء.",
      "قد تستخدم تطبيقات الجوال وسطح المكتب معرفات الجهاز وتخزين التطبيق وسجلات التشخيص وتقارير الأعطال ورموز push ورموز المصادقة.",
      "قد نستخدم مزودين موثوقين للاستضافة والمصادقة وقواعد البيانات والسحابة والمدفوعات والبريد والتحليلات ومراقبة الأخطاء والدعم واشتراكات المتاجر مثل Firebase/Google Cloud وStripe وApple وGoogle Play.",
      "عند الحاجة، نطلب موافقتك قبل الملفات غير الضرورية. يمكنك قبولها أو رفضها أو إدارتها من خلال الشريط أو الإعدادات أو المتصفح.",
      "تتيح المتصفحات عادة حذف cookies أو حظر الطرف الثالث أو حظر الكل أو السماح لمواقع محددة. قد لا تؤثر هذه الإعدادات دائماً على تطبيقات الجوال أو سطح المكتب.",
      "توفر بعض المتصفحات Do Not Track أو إشارات خصوصية عالمية. لا يوجد معيار واحد؛ نحترم الإشارات المعترف بها عندما يتطلب القانون أو تدعمها أدواتنا.",
      "قد تكون cookies جلسة أو دائمة. تعتمد المدة على الغرض والمزود، ونحاول إبقاءها متناسبة مع الغرض.",
      "قد نحدث هذه السياسة عند تغير الموقع أو التطبيق أو cookies أو المزودين أو المتطلبات القانونية أو العمليات.",
      "للأسئلة، تواصل مع EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom أو contact@nivadesk.co.uk."
    ]
  },
  "हिन्दी (Hindi)": {
    lastUpdatedLabel: "अंतिम अपडेट",
    introTitle: "Cookie Policy",
    introParagraphs: [
      "यह Cookie Policy बताती है कि EGGCRAFT LIMITED द्वारा संचालित NivaDesk website, web app, mobile apps, desktop apps और related services में cookies और similar technologies कैसे इस्तेमाल करता है।",
      "इसे Privacy Policy और Terms of Service के साथ पढ़ा जाना चाहिए।"
    ],
    sectionTitles: [
      "हम कौन हैं",
      "Cookies क्या हैं",
      "हम cookies और similar technologies क्यों इस्तेमाल करते हैं",
      "हम कौन से cookie types इस्तेमाल कर सकते हैं",
      "Strictly necessary cookies",
      "Analytics और performance cookies",
      "Marketing और referral cookies",
      "Local storage और app storage",
      "Mobile और desktop app technologies",
      "Third-party providers",
      "Cookie consent और आपकी choices",
      "Browser controls",
      "Do Not Track और global privacy signals",
      "Cookies कितने समय तक रहती हैं",
      "इस Policy के updates",
      "संपर्क"
    ],
    sectionSummaries: [
      "NivaDesk का संचालन EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom द्वारा किया जाता है। Cookie या privacy सवाल: contact@nivadesk.co.uk.",
      "Cookies browser या device पर रखी छोटी text files होती हैं। यह policy local storage, session storage, pixels, tags, SDKs, device identifiers और similar technologies को भी cover करती है।",
      "हम इन्हें signed-in रखने, language और workspace preferences याद रखने, secure access, fraud prevention, payments, usage understanding, performance improvement, bug diagnosis और permitted marketing measurement के लिए इस्तेमाल कर सकते हैं।",
      "NivaDesk necessary, preference, analytics, performance, marketing और third-party cookies इस्तेमाल कर सकता है। Non-essential cookies के लिए local law के अनुसार consent चाहिए हो सकता है।",
      "Necessary cookies security, login, account, sessions, checkout, consent records और workspace permissions के लिए जरूरी हैं। इन्हें block करने पर NivaDesk के कुछ parts ठीक से काम नहीं कर सकते।",
      "Analytics और performance tools pages, features, loading और errors समझने में मदद करते हैं। जहाँ कानून मांगता है, हम पहले consent लेते हैं।",
      "Limited marketing या referral cookies यह माप सकती हैं कि लोग NivaDesk कैसे पाते हैं और campaigns कैसे काम करते हैं। हम data नहीं बेचते और workspace content को आपके customers को ads दिखाने के लिए इस्तेमाल नहीं करते।",
      "NivaDesk local, session, app या device storage का इस्तेमाल login, preferences, offline mode, workspace cache, upload queues और performance के लिए कर सकता है।",
      "Mobile और desktop apps device identifiers, app storage, diagnostic logs, crash reports, push tokens या authentication tokens इस्तेमाल कर सकती हैं।",
      "हम hosting, auth, database, cloud storage, payments, email, analytics, error monitoring, support और app store subscriptions के लिए trusted providers जैसे Firebase/Google Cloud, Stripe, Apple या Google Play इस्तेमाल कर सकते हैं।",
      "जहाँ जरूरी हो, non-essential cookies से पहले consent मांगा जाएगा। आप banner, settings या browser से cookies accept, reject या manage कर सकते हैं।",
      "Browsers आमतौर पर cookies delete, third-party cookies block, all cookies block या selected websites allow करने देते हैं। ये controls mobile या desktop apps पर हमेशा लागू नहीं होते।",
      "कुछ browsers Do Not Track या global privacy signals देते हैं। कोई एक industry standard नहीं है; जहाँ law या tools support करें, हम recognised opt-out signals का सम्मान करेंगे।",
      "Cookies session या persistent हो सकती हैं। Duration purpose और provider पर निर्भर करता है; हम इसे proportionate रखने की कोशिश करते हैं।",
      "Website, app, cookies, providers, legal requirements या operations बदलने पर हम यह policy update कर सकते हैं।",
      "सवालों के लिए EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom या contact@nivadesk.co.uk से संपर्क करें।"
    ]
  }
};

const COOKIE_POLICY_LABELS: Partial<Record<StudioLanguage, string>> = {
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

const LOCALIZED_COOKIE_POLICIES: Partial<Record<StudioLanguage, PrivacyPolicySection[]>> = Object.fromEntries(
  Object.entries(COOKIE_POLICY_DRAFTS).map(([language, copy]) => [
    language,
    buildLocalizedCookiePolicy(copy as LocalizedCookiePolicyDraft)
  ])
) as Partial<Record<StudioLanguage, PrivacyPolicySection[]>>;

export function getCookiePolicySections(language: StudioLanguage | string | null | undefined) {
  return LOCALIZED_COOKIE_POLICIES[language as StudioLanguage] ?? COOKIE_POLICY_SECTIONS;
}

export function getCookiePolicyLastUpdatedLabel(language: StudioLanguage | string | null | undefined) {
  return COOKIE_POLICY_LABELS[language as StudioLanguage] ?? "Last updated";
}
