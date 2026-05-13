import type { PrivacyPolicySection } from "@/lib/publicSite/privacyPolicy";
import type { StudioLanguage } from "@/lib/studioflow/language";

export const SUPPORT_CONTACT_LAST_UPDATED = "13 May 2026";

export const SUPPORT_CONTACT_SECTIONS: PrivacyPolicySection[] = [
  {
    title: "NivaDesk Support and Contact",
    paragraphs: [
      "This Support and Contact page explains how users can contact NivaDesk for help, account support, billing questions, technical issues, privacy requests, and general product enquiries.",
      "NivaDesk is operated by EGGCRAFT LIMITED, a company registered in the United Kingdom."
    ]
  },
  {
    title: "1. Primary support method",
    paragraphs: [
      "NivaDesk provides customer support primarily through the in-app ticket system.",
      "If you experience a problem, need help with your account, have a billing question, or want to report a technical issue, you should open a support ticket from inside the NivaDesk app or web workspace whenever possible.",
      "The ticket system helps us keep your request connected to the correct account, workspace, device, subscription plan, and technical context. This usually allows us to review and respond to issues more accurately than ordinary email communication."
    ]
  },
  {
    title: "2. How to open a support ticket",
    paragraphs: [
      "When the ticket system is available, you can open a support request from inside NivaDesk by going to the support or help area of the app.",
      "When creating a ticket, please include enough information for us to understand the issue, such as the affected workspace, order, screen, device, platform, app version, screenshots, error messages, and the steps that caused the problem.",
      "Please do not include unnecessary sensitive personal data in a ticket unless it is required for us to understand or solve the issue."
    ]
  },
  {
    title: "3. Types of support requests",
    paragraphs: [
      "You may use the in-app ticket system for account issues, login problems, billing questions, subscription questions, workspace access, team permissions, file upload issues, sync problems, bug reports, feature questions, data export questions, account deletion questions, and general technical support.",
      "Some support requests may require us to verify your identity or confirm your authority within a workspace before we can make account, billing, data, or access changes."
    ]
  },
  {
    title: "4. Email contact",
    paragraphs: [
      "If you cannot access your account or cannot open a support ticket, you may contact us by email at nivadesk@gmail.com.",
      "Email should be used mainly when you cannot use the in-app ticket system. For most product and account issues, the ticket system is the preferred support channel."
    ]
  },
  {
    title: "5. Billing and subscription support",
    paragraphs: [
      "For billing or subscription questions, please tell us where you purchased your plan, such as through the NivaDesk website, Apple App Store, or Google Play.",
      "If your subscription was purchased through Apple App Store or Google Play, some payment, cancellation, refund, and renewal processes may need to be handled directly through Apple or Google.",
      "We can help explain your NivaDesk account status, plan access, workspace limits, and available options, but we may not be able to directly control refunds or subscription settings managed by third-party app stores."
    ]
  },
  {
    title: "6. Account deletion and data requests",
    paragraphs: [
      "Account deletion and data requests may be submitted through the in-app support or account area where available.",
      "Before completing certain requests, we may need to verify your identity and confirm whether you are the account owner, workspace owner, administrator, or team member.",
      "If your account is part of a workspace owned by another business, some workspace data may be controlled by that workspace owner rather than by you personally."
    ]
  },
  {
    title: "7. Privacy requests",
    paragraphs: [
      "Privacy-related requests, including access, correction, deletion, restriction, objection, portability, or consent withdrawal requests, will be handled in accordance with our Privacy Policy.",
      "We may ask for additional information to verify your identity before responding to a privacy request.",
      "If your personal data was added to NivaDesk by one of our customers, we may direct you to that customer if they are the controller of the relevant data."
    ]
  },
  {
    title: "8. Security reports",
    paragraphs: [
      "If you believe you have found a security issue, account access issue, data exposure, or vulnerability affecting NivaDesk, please report it using the in-app support ticket system if possible.",
      "Please include a clear description of the issue, affected area, steps to reproduce, and any relevant screenshots or technical details.",
      "You must not access, download, modify, delete, disrupt, or disclose other users' data while investigating or reporting a security issue."
    ]
  },
  {
    title: "9. Response times",
    paragraphs: [
      "We aim to respond to support requests as soon as reasonably possible, but response times may vary depending on the type of request, the subscription plan, the severity of the issue, and our operational capacity.",
      "We do not guarantee a specific response time unless we separately agree to one in writing.",
      "Urgent security, access, or billing issues may be prioritised over general questions or feature requests."
    ]
  },
  {
    title: "10. Information to include in a ticket",
    paragraphs: [
      "For faster support, please include the platform you are using, such as web, iPhone, iPad, Mac, Android, or desktop.",
      "Please also include the app version, device model, operating system version, workspace name, affected order or file if relevant, screenshots, error messages, and a short explanation of what happened.",
      "This information helps us investigate technical issues, reproduce bugs, and understand whether a problem is related to your device, account, workspace, network, subscription, or the NivaDesk service."
    ]
  },
  {
    title: "11. What support does not cover",
    paragraphs: [
      "NivaDesk support does not include professional legal, tax, financial, accounting, business, or compliance advice.",
      "We may help explain how NivaDesk features work, but you are responsible for deciding how to use the product for your own business and for complying with laws that apply to your business, customers, files, and data.",
      "We are not responsible for resolving disputes between workspace owners, team members, clients, employees, contractors, or third parties."
    ]
  },
  {
    title: "12. Changes to this page",
    paragraphs: [
      "We may update this Support and Contact page from time to time as our support process, ticket system, contact methods, or product features change.",
      "If we make material changes, we may update the date at the top of this page or provide notice through the website, app, or account area."
    ]
  },
  {
    title: "Company details",
    paragraphs: [
      "EGGCRAFT LIMITED",
      "141 Randolph Avenue",
      "London",
      "W9 1DN",
      "United Kingdom",
      "Email: nivadesk@gmail.com",
      "This page is intended to provide general support and contact information for NivaDesk users. It should be read together with our Terms of Service, Privacy Policy, Refund and Cancellation Policy, and Account Deletion Policy."
    ]
  }
];

type LocalizedSupportContactDraft = {
  lastUpdatedLabel: string;
  introTitle: string;
  introParagraphs: string[];
  sectionTitles: string[];
  sectionSummaries: string[];
};

function buildLocalizedSupportContact(copy: LocalizedSupportContactDraft): PrivacyPolicySection[] {
  return [
    {
      title: copy.introTitle,
      paragraphs: copy.introParagraphs
    },
    ...copy.sectionTitles.map((title, index) => ({
      title,
      paragraphs: [copy.sectionSummaries[index] ?? ""]
    }))
  ];
}

const SUPPORT_CONTACT_LABELS: Partial<Record<StudioLanguage, string>> = {
  English: "Last updated",
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

const COMMON_SECTION_TITLES = {
  English: [
    "1. Primary support method",
    "2. How to open a support ticket",
    "3. Types of support requests",
    "4. Email contact",
    "5. Billing and subscription support",
    "6. Account deletion and data requests",
    "7. Privacy requests",
    "8. Security reports",
    "9. Response times",
    "10. Information to include in a ticket",
    "11. What support does not cover",
    "12. Changes to this page",
    "Company details"
  ]
};

const SUPPORT_CONTACT_DRAFTS: Partial<Record<StudioLanguage, LocalizedSupportContactDraft>> = {
  Türkçe: {
    lastUpdatedLabel: "Son güncelleme",
    introTitle: "NivaDesk Destek ve İletişim",
    introParagraphs: [
      "Bu sayfa, kullanıcıların yardım, hesap desteği, faturalama soruları, teknik sorunlar, gizlilik talepleri ve genel ürün soruları için NivaDesk ile nasıl iletişime geçebileceğini açıklar.",
      "NivaDesk, Birleşik Krallık'ta kayıtlı EGGCRAFT LIMITED tarafından işletilir."
    ],
    sectionTitles: [
      "1. Birincil destek yöntemi",
      "2. Destek talebi nasıl açılır",
      "3. Destek talebi türleri",
      "4. E-posta ile iletişim",
      "5. Faturalama ve abonelik desteği",
      "6. Hesap silme ve veri talepleri",
      "7. Gizlilik talepleri",
      "8. Güvenlik bildirimleri",
      "9. Yanıt süreleri",
      "10. Talebe eklenmesi gereken bilgiler",
      "11. Desteğin kapsamadığı konular",
      "12. Bu sayfadaki değişiklikler",
      "Şirket bilgileri"
    ],
    sectionSummaries: [
      "NivaDesk müşteri desteğini öncelikle uygulama içi ticket sistemi üzerinden sağlar. Bir sorun, hesap yardımı, faturalama sorusu veya teknik problem olduğunda mümkünse NivaDesk app veya web workspace içinden destek talebi açmanız gerekir. Ticket sistemi talebinizi doğru hesap, workspace, cihaz, abonelik planı ve teknik bağlamla eşleştirmemize yardımcı olur.",
      "Ticket sistemi kullanılabiliyorsa destek veya yardım alanından talep açabilirsiniz. Workspace, sipariş, ekran, cihaz, platform, app versiyonu, ekran görüntüleri, hata mesajları ve soruna yol açan adımlar gibi yeterli bilgileri ekleyin. Gerekli değilse hassas kişisel veri paylaşmayın.",
      "Ticket sistemi; hesap sorunları, giriş problemleri, faturalama, abonelik, workspace erişimi, ekip izinleri, dosya yükleme, sync, bug raporları, özellik soruları, veri dışa aktarma, hesap silme ve genel teknik destek için kullanılabilir. Bazı talepler için kimliğinizi veya workspace yetkinizi doğrulamamız gerekebilir.",
      "Hesabınıza erişemiyorsanız veya ticket açamıyorsanız bize nivadesk@gmail.com adresinden yazabilirsiniz. E-posta çoğunlukla uygulama içi ticket sistemi kullanılamadığında tercih edilmelidir; ürün ve hesap sorunlarında öncelikli kanal ticket sistemidir.",
      "Faturalama veya abonelik sorularında planı nereden aldığınızı belirtin: NivaDesk web sitesi, Apple App Store veya Google Play. Apple ya da Google üzerinden alınan aboneliklerde ödeme, iptal, iade ve yenileme işlemleri ilgili platform tarafından yönetilebilir.",
      "Hesap silme ve veri talepleri mümkün olduğunda uygulama içi destek veya hesap alanından gönderilebilir. Bazı taleplerden önce kimlik doğrulaması ve hesap sahibi, workspace sahibi, admin veya ekip üyesi yetkinizin teyidi gerekebilir. Başka bir işletmeye ait workspace verileri workspace sahibi tarafından kontrol ediliyor olabilir.",
      "Erişim, düzeltme, silme, kısıtlama, itiraz, taşınabilirlik veya rıza geri çekme gibi gizlilik talepleri Privacy Policy uyarınca ele alınır. Kimliğinizi doğrulamak için ek bilgi isteyebiliriz. Veriniz bir NivaDesk müşterisi tarafından eklenmişse ilgili controller müşteriye yönlendirebiliriz.",
      "NivaDesk'i etkileyen güvenlik sorunu, hesap erişim problemi, veri açığı veya vulnerability bulduğunuzu düşünüyorsanız mümkünse uygulama içi destek ticket sistemiyle bildirin. Açık açıklama, etkilenen alan, yeniden üretme adımları, ekran görüntüleri ve teknik detaylar ekleyin; başkalarının verilerine erişmeyin veya ifşa etmeyin.",
      "Destek taleplerine makul olan en kısa sürede yanıt vermeyi hedefleriz; süre talep türüne, abonelik planına, sorunun ciddiyetine ve operasyonel kapasiteye göre değişebilir. Yazılı olarak ayrıca anlaşmadıkça belirli bir yanıt süresi garanti edilmez.",
      "Daha hızlı destek için web, iPhone, iPad, Mac, Android veya desktop gibi kullandığınız platformu; app versiyonu, cihaz modeli, işletim sistemi, workspace adı, etkilenen sipariş/dosya, ekran görüntüsü, hata mesajı ve kısa olay açıklamasını ekleyin.",
      "NivaDesk desteği profesyonel hukuki, vergi, finans, muhasebe, iş veya uyumluluk danışmanlığı içermez. Özelliklerin nasıl çalıştığını açıklayabiliriz; ürünü işletmenizde nasıl kullanacağınıza ve geçerli yasalara uymaya siz karar verirsiniz. Workspace tarafları arasındaki uyuşmazlıkları çözmekten sorumlu değiliz.",
      "Destek süreci, ticket sistemi, iletişim yöntemleri veya ürün özellikleri değiştikçe bu sayfayı güncelleyebiliriz. Önemli değişikliklerde sayfa tarihini güncelleyebilir veya web sitesi, app ya da hesap alanından bildirim sağlayabiliriz.",
      "EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. E-posta: nivadesk@gmail.com. Bu sayfa NivaDesk kullanıcıları için genel destek ve iletişim bilgisi sağlar ve Terms of Service, Privacy Policy, Refund and Cancellation Policy ve Account Deletion Policy ile birlikte okunmalıdır."
    ]
  },
  Deutsch: {
    lastUpdatedLabel: "Zuletzt aktualisiert",
    introTitle: "NivaDesk Support und Kontakt",
    introParagraphs: [
      "Diese Seite erklärt, wie Nutzer NivaDesk für Hilfe, Kontosupport, Abrechnungsfragen, technische Probleme, Datenschutzanfragen und allgemeine Produktfragen kontaktieren können.",
      "NivaDesk wird von EGGCRAFT LIMITED betrieben, einem im Vereinigten Königreich registrierten Unternehmen."
    ],
    sectionTitles: ["1. Primäre Supportmethode", "2. Support-Ticket öffnen", "3. Arten von Supportanfragen", "4. E-Mail-Kontakt", "5. Abrechnungs- und Abosupport", "6. Kontolöschung und Datenanfragen", "7. Datenschutzanfragen", "8. Sicherheitsmeldungen", "9. Antwortzeiten", "10. Informationen im Ticket", "11. Was Support nicht umfasst", "12. Änderungen dieser Seite", "Unternehmensdaten"],
    sectionSummaries: [
      "NivaDesk bietet Support hauptsächlich über das In-App-Ticketsystem. Bei Problemen, Konto- oder Abrechnungsfragen oder technischen Fehlern sollten Sie, wenn möglich, ein Ticket im NivaDesk App- oder Web-Workspace öffnen. So bleibt die Anfrage mit Konto, Workspace, Gerät, Plan und technischem Kontext verbunden.",
      "Wenn das Ticketsystem verfügbar ist, öffnen Sie eine Anfrage im Support- oder Hilfebereich. Fügen Sie Workspace, Bestellung, Bildschirm, Gerät, Plattform, App-Version, Screenshots, Fehlermeldungen und Schritte zum Problem hinzu. Teilen Sie keine unnötigen sensiblen personenbezogenen Daten.",
      "Tickets können für Konto, Login, Abrechnung, Abo, Workspace-Zugriff, Teamrechte, Datei-Uploads, Sync, Bugs, Funktionsfragen, Datenexport, Kontolöschung und allgemeinen technischen Support genutzt werden. Manche Anfragen erfordern Identitäts- oder Rollenprüfung.",
      "Wenn Sie nicht auf Ihr Konto zugreifen oder kein Ticket öffnen können, schreiben Sie an nivadesk@gmail.com. E-Mail sollte hauptsächlich genutzt werden, wenn das In-App-Ticketsystem nicht verfügbar ist.",
      "Bei Abrechnungs- oder Abo-Fragen nennen Sie bitte den Kaufkanal: NivaDesk Website, Apple App Store oder Google Play. Käufe über Apple oder Google müssen teilweise direkt dort verwaltet werden.",
      "Kontolöschung und Datenanfragen können, soweit verfügbar, über Support- oder Kontobereiche eingereicht werden. Vor bestimmten Änderungen müssen wir Identität und Workspace-Berechtigung prüfen. Daten in fremden Business-Workspaces können vom Workspace Owner kontrolliert werden.",
      "Datenschutzanfragen wie Auskunft, Berichtigung, Löschung, Einschränkung, Widerspruch, Portabilität oder Widerruf werden gemäß Privacy Policy bearbeitet. Wir können zusätzliche Informationen zur Identitätsprüfung verlangen.",
      "Sicherheitsprobleme, Zugriffsvorfälle, Datenexposition oder Schwachstellen sollten möglichst per In-App-Ticket gemeldet werden. Beschreiben Sie Problem, betroffenen Bereich, Reproduktionsschritte und technische Details; greifen Sie nicht auf Daten anderer Nutzer zu.",
      "Wir bemühen uns um möglichst schnelle Antworten, aber Zeiten hängen von Anfrageart, Plan, Schweregrad und Kapazität ab. Eine bestimmte Antwortzeit garantieren wir nur bei separater schriftlicher Vereinbarung.",
      "Für schnelleren Support nennen Sie Plattform, App-Version, Gerät, Betriebssystem, Workspace, betroffene Bestellung oder Datei, Screenshots, Fehlermeldungen und eine kurze Beschreibung des Vorfalls.",
      "NivaDesk Support umfasst keine professionelle Rechts-, Steuer-, Finanz-, Buchhaltungs-, Geschäfts- oder Compliance-Beratung. Wir erklären Funktionen, aber Sie entscheiden über Nutzung und rechtliche Pflichten Ihres Unternehmens.",
      "Diese Seite kann aktualisiert werden, wenn sich Supportprozess, Ticketsystem, Kontaktmethoden oder Produktfunktionen ändern. Wesentliche Änderungen können über Website, App oder Kontobereich mitgeteilt werden.",
      "EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. E-Mail: nivadesk@gmail.com. Diese Seite sollte zusammen mit Terms of Service, Privacy Policy, Refund and Cancellation Policy und Account Deletion Policy gelesen werden."
    ]
  },
  Français: {
    lastUpdatedLabel: "Dernière mise à jour",
    introTitle: "Support et contact NivaDesk",
    introParagraphs: [
      "Cette page explique comment contacter NivaDesk pour l'aide, le support de compte, la facturation, les problèmes techniques, les demandes de confidentialité et les questions produit.",
      "NivaDesk est exploité par EGGCRAFT LIMITED, société enregistrée au Royaume-Uni."
    ],
    sectionTitles: ["1. Méthode principale de support", "2. Ouvrir un ticket", "3. Types de demandes", "4. Contact e-mail", "5. Facturation et abonnement", "6. Suppression de compte et données", "7. Demandes de confidentialité", "8. Rapports de sécurité", "9. Délais de réponse", "10. Informations à inclure", "11. Ce que le support ne couvre pas", "12. Modifications de cette page", "Coordonnées de l'entreprise"],
    sectionSummaries: [
      "NivaDesk fournit le support principalement via le système de ticket intégré. En cas de problème, question de compte, facturation ou souci technique, ouvrez si possible un ticket dans l'application ou le workspace web. Cela relie la demande au bon compte, workspace, appareil, plan et contexte technique.",
      "Lorsque le système est disponible, ouvrez une demande dans la zone support ou aide. Ajoutez workspace, commande, écran, appareil, plateforme, version d'app, captures, messages d'erreur et étapes. N'ajoutez pas de données sensibles inutiles.",
      "Le ticket peut servir pour compte, connexion, facturation, abonnement, accès workspace, permissions d'équipe, fichiers, sync, bugs, questions de fonctionnalités, export de données, suppression de compte et support technique général. Certaines demandes exigent une vérification d'identité ou d'autorité.",
      "Si vous ne pouvez pas accéder à votre compte ou ouvrir un ticket, contactez nivadesk@gmail.com. L'e-mail est surtout destiné aux cas où le ticket intégré n'est pas disponible.",
      "Pour la facturation ou l'abonnement, indiquez où vous avez acheté le plan: site NivaDesk, Apple App Store ou Google Play. Les achats Apple ou Google peuvent devoir être gérés directement sur ces plateformes.",
      "Les demandes de suppression de compte et de données peuvent être envoyées via support ou compte lorsque disponible. Nous pouvons vérifier votre identité et votre rôle. Des données de workspace appartenant à une autre entreprise peuvent être contrôlées par son propriétaire.",
      "Les demandes de confidentialité, comme accès, correction, suppression, restriction, opposition, portabilité ou retrait du consentement, sont traitées selon la Privacy Policy. Nous pouvons demander des informations supplémentaires pour vérifier l'identité.",
      "Les problèmes de sécurité, accès, exposition de données ou vulnérabilités doivent être signalés par ticket si possible. Incluez description, zone touchée, étapes et détails techniques; n'accédez pas aux données d'autres utilisateurs.",
      "Nous cherchons à répondre aussi vite que raisonnablement possible, mais les délais varient selon le type de demande, le plan, la gravité et la capacité. Aucun délai précis n'est garanti sans accord écrit séparé.",
      "Pour accélérer le support, indiquez plateforme, version d'app, appareil, système, workspace, commande ou fichier concerné, captures, messages d'erreur et résumé de ce qui s'est passé.",
      "Le support NivaDesk n'inclut pas de conseil professionnel juridique, fiscal, financier, comptable, commercial ou de conformité. Nous expliquons les fonctionnalités; vous restez responsable de l'usage et des lois applicables.",
      "Cette page peut être mise à jour si le processus de support, le système de tickets, les contacts ou les fonctionnalités changent. Les changements importants peuvent être annoncés sur le site, dans l'app ou le compte.",
      "EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. E-mail: nivadesk@gmail.com. Cette page doit être lue avec les Terms of Service, Privacy Policy, Refund and Cancellation Policy et Account Deletion Policy."
    ]
  }
};

const SUPPORT_CONTACT_COMMON: Record<Exclude<StudioLanguage, "English" | "Türkçe" | "Deutsch" | "Français">, LocalizedSupportContactDraft> = {
  Italiano: {
    lastUpdatedLabel: "Ultimo aggiornamento",
    introTitle: "Supporto e contatto NivaDesk",
    introParagraphs: ["Questa pagina spiega come contattare NivaDesk per aiuto, supporto account, domande di fatturazione, problemi tecnici, richieste privacy e domande generali sul prodotto.", "NivaDesk è gestito da EGGCRAFT LIMITED, società registrata nel Regno Unito."],
    sectionTitles: ["1. Metodo principale di supporto", "2. Aprire un ticket", "3. Tipi di richieste", "4. Contatto email", "5. Fatturazione e abbonamenti", "6. Cancellazione account e dati", "7. Richieste privacy", "8. Segnalazioni di sicurezza", "9. Tempi di risposta", "10. Informazioni da includere", "11. Cosa non copre il supporto", "12. Modifiche alla pagina", "Dati aziendali"],
    sectionSummaries: ["NivaDesk fornisce supporto principalmente tramite il sistema ticket in-app. Per problemi, account, fatturazione o questioni tecniche, apri se possibile un ticket dall'app o workspace web. Questo collega la richiesta a account, workspace, dispositivo, piano e contesto tecnico corretti.", "Quando disponibile, apri la richiesta dall'area supporto o aiuto. Includi workspace, ordine, schermata, dispositivo, piattaforma, versione app, screenshot, errori e passaggi. Non includere dati personali sensibili non necessari.", "Il ticket può essere usato per account, login, billing, subscription, accesso workspace, permessi team, upload file, sync, bug, feature, export, cancellazione account e supporto tecnico generale. Alcune richieste richiedono verifica identità o autorità.", "Se non puoi accedere all'account o aprire un ticket, scrivi a nivadesk@gmail.com. L'email è principalmente per i casi in cui il ticket in-app non è disponibile.", "Per billing o subscription indica dove hai acquistato il piano: sito NivaDesk, Apple App Store o Google Play. Alcune operazioni Apple o Google devono essere gestite direttamente su quelle piattaforme.", "Le richieste di cancellazione account e dati possono essere inviate tramite supporto o area account dove disponibile. Possiamo verificare identità e ruolo. Dati in workspace di un'altra azienda possono essere controllati dal workspace owner.", "Le richieste privacy, incluse accesso, correzione, cancellazione, restrizione, opposizione, portabilità o ritiro consenso, sono gestite secondo la Privacy Policy. Potremmo chiedere informazioni aggiuntive per verificare l'identità.", "Problemi di sicurezza, accesso, esposizione dati o vulnerabilità devono essere segnalati con ticket se possibile. Includi descrizione, area interessata, passaggi e dettagli tecnici; non accedere a dati di altri utenti.", "Puntiamo a rispondere appena ragionevolmente possibile, ma i tempi variano per tipo richiesta, piano, gravità e capacità. Non garantiamo tempi specifici senza accordo scritto separato.", "Per supporto più rapido indica piattaforma, versione app, modello dispositivo, sistema operativo, workspace, ordine o file interessato, screenshot, errori e breve spiegazione.", "Il supporto NivaDesk non include consulenza legale, fiscale, finanziaria, contabile, business o compliance. Possiamo spiegare le funzioni; l'uso aziendale e il rispetto delle leggi restano responsabilità tua.", "Possiamo aggiornare questa pagina se cambiano processo di supporto, ticket, contatti o funzioni. Cambiamenti importanti possono essere comunicati via sito, app o account.", "EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. Email: nivadesk@gmail.com. Questa pagina va letta con Terms of Service, Privacy Policy, Refund and Cancellation Policy e Account Deletion Policy."]
  },
  "Español (Spanish)": {
    lastUpdatedLabel: "Última actualización",
    introTitle: "Soporte y contacto de NivaDesk",
    introParagraphs: ["Esta página explica cómo contactar con NivaDesk para ayuda, soporte de cuenta, preguntas de facturación, problemas técnicos, solicitudes de privacidad y consultas generales del producto.", "NivaDesk es operado por EGGCRAFT LIMITED, una empresa registrada en el Reino Unido."],
    sectionTitles: ["1. Método principal de soporte", "2. Abrir un ticket", "3. Tipos de solicitudes", "4. Contacto por email", "5. Facturación y suscripciones", "6. Eliminación de cuenta y datos", "7. Solicitudes de privacidad", "8. Reportes de seguridad", "9. Tiempos de respuesta", "10. Información a incluir", "11. Qué no cubre el soporte", "12. Cambios en esta página", "Datos de la empresa"],
    sectionSummaries: ["NivaDesk ofrece soporte principalmente mediante el sistema de tickets dentro de la app. Si tienes un problema, cuenta, facturación o incidencia técnica, abre si es posible un ticket desde la app o workspace web. Esto conecta la solicitud con cuenta, workspace, dispositivo, plan y contexto técnico.", "Cuando esté disponible, abre la solicitud desde el área de soporte o ayuda. Incluye workspace, pedido, pantalla, dispositivo, plataforma, versión de app, capturas, errores y pasos. No incluyas datos sensibles innecesarios.", "El ticket sirve para cuenta, login, facturación, suscripción, acceso workspace, permisos de equipo, archivos, sync, bugs, preguntas de funciones, exportación, eliminación de cuenta y soporte técnico general. Algunas solicitudes requieren verificar identidad o autoridad.", "Si no puedes acceder a tu cuenta o abrir un ticket, escribe a nivadesk@gmail.com. El email debe usarse principalmente cuando el sistema de tickets no está disponible.", "Para facturación o suscripción, dinos dónde compraste el plan: web de NivaDesk, Apple App Store o Google Play. Algunas gestiones de Apple o Google deben hacerse directamente en esas plataformas.", "Las solicitudes de eliminación de cuenta y datos pueden enviarse desde soporte o cuenta cuando esté disponible. Podemos verificar identidad y rol. Datos de un workspace de otra empresa pueden estar controlados por su propietario.", "Las solicitudes de privacidad, como acceso, corrección, eliminación, restricción, oposición, portabilidad o retirada de consentimiento, se gestionan según la Privacy Policy. Podemos pedir información adicional para verificar identidad.", "Los problemas de seguridad, acceso, exposición de datos o vulnerabilidades deben reportarse por ticket si es posible. Incluye descripción, área afectada, pasos y detalles técnicos; no accedas a datos de otros usuarios.", "Intentamos responder lo antes razonablemente posible, pero los tiempos varían según tipo de solicitud, plan, gravedad y capacidad. No garantizamos un plazo concreto salvo acuerdo escrito.", "Para soporte más rápido indica plataforma, versión de app, dispositivo, sistema operativo, workspace, pedido o archivo afectado, capturas, errores y breve explicación.", "El soporte de NivaDesk no incluye asesoría legal, fiscal, financiera, contable, empresarial o de cumplimiento. Podemos explicar funciones; tú decides el uso y cumples las leyes aplicables.", "Podemos actualizar esta página si cambian el proceso de soporte, tickets, métodos de contacto o funciones. Cambios importantes pueden comunicarse por web, app o cuenta.", "EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. Email: nivadesk@gmail.com. Esta página debe leerse con Terms of Service, Privacy Policy, Refund and Cancellation Policy y Account Deletion Policy."]
  },
  Português: {
    lastUpdatedLabel: "Última atualização",
    introTitle: "Suporte e contacto da NivaDesk",
    introParagraphs: ["Esta página explica como contactar a NivaDesk para ajuda, suporte de conta, faturação, problemas técnicos, pedidos de privacidade e questões gerais sobre o produto.", "A NivaDesk é operada pela EGGCRAFT LIMITED, empresa registada no Reino Unido."],
    sectionTitles: ["1. Método principal de suporte", "2. Abrir um ticket", "3. Tipos de pedidos", "4. Contacto por email", "5. Faturação e subscrições", "6. Eliminação de conta e dados", "7. Pedidos de privacidade", "8. Relatórios de segurança", "9. Tempos de resposta", "10. Informação a incluir", "11. O que o suporte não cobre", "12. Alterações a esta página", "Dados da empresa"],
    sectionSummaries: ["A NivaDesk fornece suporte principalmente pelo sistema de tickets dentro da app. Para problemas, conta, faturação ou questões técnicas, abra sempre que possível um ticket na app ou workspace web. Isto liga o pedido à conta, workspace, dispositivo, plano e contexto técnico.", "Quando disponível, abra o pedido na área de suporte ou ajuda. Inclua workspace, encomenda, ecrã, dispositivo, plataforma, versão da app, capturas, erros e passos. Não inclua dados sensíveis desnecessários.", "O ticket pode ser usado para conta, login, faturação, subscrição, acesso workspace, permissões de equipa, ficheiros, sync, bugs, funcionalidades, exportação, eliminação de conta e suporte técnico geral. Alguns pedidos exigem verificação de identidade ou autoridade.", "Se não conseguir aceder à conta ou abrir ticket, escreva para nivadesk@gmail.com. O email deve ser usado sobretudo quando o ticket in-app não está disponível.", "Para faturação ou subscrição, indique onde comprou o plano: website NivaDesk, Apple App Store ou Google Play. Algumas operações Apple ou Google devem ser geridas diretamente nessas plataformas.", "Pedidos de eliminação de conta e dados podem ser enviados via suporte ou área de conta quando disponível. Podemos verificar identidade e função. Dados em workspace de outra empresa podem ser controlados pelo respetivo owner.", "Pedidos de privacidade, como acesso, correção, eliminação, restrição, oposição, portabilidade ou retirada de consentimento, são tratados segundo a Privacy Policy. Podemos pedir informação adicional para verificar identidade.", "Questões de segurança, acesso, exposição de dados ou vulnerabilidades devem ser reportadas por ticket se possível. Inclua descrição, área afetada, passos e detalhes técnicos; não aceda a dados de outros utilizadores.", "Tentamos responder assim que razoavelmente possível, mas tempos variam por tipo de pedido, plano, gravidade e capacidade. Não garantimos tempo específico sem acordo escrito separado.", "Para suporte mais rápido indique plataforma, versão da app, dispositivo, sistema operativo, workspace, encomenda ou ficheiro afetado, capturas, erros e breve explicação.", "O suporte NivaDesk não inclui aconselhamento legal, fiscal, financeiro, contabilístico, empresarial ou compliance. Podemos explicar funcionalidades; a decisão de uso e cumprimento legal é sua.", "Podemos atualizar esta página se mudarem processo de suporte, tickets, contactos ou funcionalidades. Mudanças importantes podem ser comunicadas por website, app ou conta.", "EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. Email: nivadesk@gmail.com. Esta página deve ser lida com Terms of Service, Privacy Policy, Refund and Cancellation Policy e Account Deletion Policy."]
  },
  "Русский (Russian)": {
    lastUpdatedLabel: "Последнее обновление",
    introTitle: "Поддержка и контакты NivaDesk",
    introParagraphs: ["Эта страница объясняет, как связаться с NivaDesk по вопросам помощи, аккаунта, billing, технических проблем, privacy requests и общих вопросов о продукте.", "NivaDesk управляется EGGCRAFT LIMITED, компанией, зарегистрированной в United Kingdom."],
    sectionTitles: COMMON_SECTION_TITLES.English,
    sectionSummaries: ["NivaDesk предоставляет поддержку главным образом через in-app ticket system. При проблемах с аккаунтом, billing или технических вопросах по возможности открывайте ticket внутри app или web workspace. Это связывает запрос с правильным account, workspace, device, plan и technical context.", "Если ticket system доступна, откройте запрос в support/help area. Укажите workspace, order, screen, device, platform, app version, screenshots, error messages и steps. Не добавляйте unnecessary sensitive personal data.", "Ticket system можно использовать для account issues, login, billing, subscription, workspace access, team permissions, file uploads, sync, bug reports, feature questions, data export, account deletion и general technical support. Иногда нужна identity или authority verification.", "Если вы не можете войти в аккаунт или открыть ticket, пишите на nivadesk@gmail.com. Email в основном нужен, когда in-app ticket system недоступна.", "Для billing/subscription вопросов сообщите, где был куплен plan: NivaDesk website, Apple App Store или Google Play. Apple/Google purchases иногда управляются прямо через эти platforms.", "Account deletion и data requests можно отправлять через in-app support или account area, где доступно. Перед некоторыми действиями мы можем проверять identity и role. Данные в workspace другого бизнеса могут контролироваться workspace owner.", "Privacy requests, including access, correction, deletion, restriction, objection, portability или consent withdrawal, обрабатываются согласно Privacy Policy. Мы можем запросить additional information для identity verification.", "Security issue, account access issue, data exposure или vulnerability лучше сообщать через in-app ticket. Укажите description, affected area, reproduction steps и technical details; не получайте доступ к данным других users.", "Мы стремимся отвечать как можно быстрее, но сроки зависят от request type, plan, severity и operational capacity. Specific response time не гарантируется без separate written agreement.", "Для faster support укажите platform, app version, device model, OS version, workspace name, affected order/file, screenshots, error messages и short explanation.", "NivaDesk support не включает professional legal, tax, financial, accounting, business или compliance advice. Мы можем объяснить features, но использование продукта и compliance остаются вашей ответственностью.", "Мы можем обновлять эту страницу при изменении support process, ticket system, contact methods или product features. Material changes могут быть отражены на website, app или account area.", "EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. Email: nivadesk@gmail.com. Эта страница читается вместе с Terms of Service, Privacy Policy, Refund and Cancellation Policy и Account Deletion Policy."]
  },
  "日本語 (Japanese)": {
    lastUpdatedLabel: "最終更新日",
    introTitle: "NivaDesk サポートと連絡先",
    introParagraphs: ["このページは、help、account support、billing questions、technical issues、privacy requests、general product enquiries のために NivaDesk へ連絡する方法を説明します。", "NivaDesk は United Kingdom 登録会社 EGGCRAFT LIMITED により運営されています。"],
    sectionTitles: COMMON_SECTION_TITLES.English,
    sectionSummaries: ["NivaDesk の customer support は主に in-app ticket system で提供されます。問題、account help、billing question、technical issue がある場合は可能な限り NivaDesk app または web workspace 内から ticket を開いてください。", "Ticket system が利用可能な場合、support/help area から request を作成できます。workspace、order、screen、device、platform、app version、screenshots、error messages、steps を含めてください。不要な sensitive personal data は含めないでください。", "Ticket system は account issues、login、billing、subscription、workspace access、team permissions、file uploads、sync、bug reports、feature questions、data export、account deletion、general technical support に使えます。一部の request は identity/authority verification が必要です。", "Account にアクセスできない、または ticket を開けない場合は nivadesk@gmail.com にメールしてください。Email は主に in-app ticket system が使えない場合の手段です。", "Billing/subscription questions では plan を購入した場所、NivaDesk website、Apple App Store、Google Play を教えてください。Apple/Google purchase は一部の payment、cancellation、refund、renewal が直接 platform 管理になります。", "Account deletion と data requests は利用可能な場合 in-app support または account area から提出できます。一定の request では identity と workspace role の確認が必要です。", "Privacy requests、access、correction、deletion、restriction、objection、portability、consent withdrawal は Privacy Policy に従って処理されます。本人確認のため追加情報を求める場合があります。", "Security issue、account access issue、data exposure、vulnerability を見つけた場合は可能なら in-app ticket で報告してください。他の user data に access、download、modify、delete、disclose しないでください。", "Support requests には合理的に可能な限り早く返答しますが、request type、plan、severity、capacity により異なります。書面で別途合意しない限り specific response time は保証しません。", "Faster support のため、platform、app version、device model、OS version、workspace name、affected order/file、screenshots、error messages、short explanation を含めてください。", "NivaDesk support は professional legal、tax、financial、accounting、business、compliance advice を含みません。Features の説明はできますが、business での利用判断と法令遵守は利用者の責任です。", "Support process、ticket system、contact methods、product features が変わる場合、このページを更新することがあります。Material changes は website、app、account area で通知される場合があります。", "EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom。Email: nivadesk@gmail.com。このページは Terms of Service、Privacy Policy、Refund and Cancellation Policy、Account Deletion Policy とあわせて読んでください。"]
  },
  "中文 (Chinese)": {
    lastUpdatedLabel: "最后更新",
    introTitle: "NivaDesk 支持和联系方式",
    introParagraphs: ["本页说明用户如何就帮助、账户支持、计费问题、技术问题、隐私请求和一般产品咨询联系 NivaDesk。", "NivaDesk 由在英国注册的 EGGCRAFT LIMITED 运营。"],
    sectionTitles: ["1. 主要支持方式", "2. 如何打开支持工单", "3. 支持请求类型", "4. 邮件联系", "5. 计费和订阅支持", "6. 账户删除和数据请求", "7. 隐私请求", "8. 安全报告", "9. 响应时间", "10. 工单应包含的信息", "11. 支持不包括的内容", "12. 页面变更", "公司信息"],
    sectionSummaries: ["NivaDesk 主要通过应用内工单系统提供客户支持。如遇问题、账户帮助、计费问题或技术问题，应尽可能从 NivaDesk 应用或 web workspace 内提交工单。这有助于将请求与正确账户、workspace、设备、订阅计划和技术上下文关联。", "工单系统可用时，可在应用的支持或帮助区域打开请求。请提供 workspace、订单、屏幕、设备、平台、应用版本、截图、错误消息和导致问题的步骤。除非必要，请不要加入敏感个人数据。", "工单可用于账户、登录、计费、订阅、workspace 访问、团队权限、文件上传、同步、bug、功能问题、数据导出、账户删除和一般技术支持。部分请求需要验证身份或 workspace 权限。", "如果无法访问账户或无法提交工单，可发送邮件至 nivadesk@gmail.com。邮件主要用于无法使用应用内工单系统的情况。", "计费或订阅问题请说明购买渠道：NivaDesk 网站、Apple App Store 或 Google Play。Apple 或 Google 购买的一些付款、取消、退款和续订流程可能需要直接通过相应平台处理。", "账户删除和数据请求可在可用时通过应用内支持或账户区域提交。部分请求前可能需要验证身份以及账户所有者、workspace owner、管理员或团队成员权限。", "隐私相关请求，包括访问、更正、删除、限制、反对、可携带或撤回同意，将按 Privacy Policy 处理。我们可能要求额外信息来验证身份。", "如发现影响 NivaDesk 的安全问题、账户访问问题、数据暴露或漏洞，请尽可能通过应用内工单报告。请提供清晰描述、影响区域、复现步骤和技术细节；不要访问或披露其他用户数据。", "我们会尽合理努力尽快回复，但响应时间取决于请求类型、订阅计划、问题严重程度和运营能力。除非另有书面约定，不保证具体响应时间。", "为获得更快支持，请提供使用平台、应用版本、设备型号、系统版本、workspace 名称、相关订单或文件、截图、错误消息和简短说明。", "NivaDesk 支持不包括专业法律、税务、财务、会计、业务或合规建议。我们可以说明功能如何工作，但你负责决定如何用于业务并遵守适用法律。", "随着支持流程、工单系统、联系方式或产品功能变化，我们可能更新本页。重大变更可能通过网站、应用或账户区域通知。", "EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom。Email: nivadesk@gmail.com。本页应与 Terms of Service、Privacy Policy、Refund and Cancellation Policy 和 Account Deletion Policy 一起阅读。"]
  },
  "العربية (Arabic)": {
    lastUpdatedLabel: "آخر تحديث",
    introTitle: "دعم NivaDesk والتواصل",
    introParagraphs: ["توضح هذه الصفحة كيف يمكن للمستخدمين التواصل مع NivaDesk للمساعدة ودعم الحساب والأسئلة المتعلقة بالفوترة والمشكلات التقنية وطلبات الخصوصية والاستفسارات العامة عن المنتج.", "تدير NivaDesk شركة EGGCRAFT LIMITED المسجلة في المملكة المتحدة."],
    sectionTitles: COMMON_SECTION_TITLES.English,
    sectionSummaries: ["توفر NivaDesk الدعم أساساً عبر نظام التذاكر داخل التطبيق. إذا واجهت مشكلة أو احتجت مساعدة في الحساب أو لديك سؤال فوترة أو مشكلة تقنية، افتح ticket من تطبيق NivaDesk أو web workspace كلما أمكن.", "عند توفر نظام التذاكر، يمكنك فتح طلب من منطقة الدعم أو المساعدة. أضف workspace والطلب والشاشة والجهاز والمنصة وإصدار التطبيق واللقطات ورسائل الخطأ والخطوات. لا تضف بيانات شخصية حساسة غير ضرورية.", "يمكن استخدام نظام التذاكر لمشاكل الحساب وتسجيل الدخول والفوترة والاشتراك ووصول workspace وصلاحيات الفريق ورفع الملفات والمزامنة والأخطاء والأسئلة وال export وحذف الحساب والدعم التقني العام. قد تتطلب بعض الطلبات التحقق من الهوية أو الصلاحية.", "إذا لم تتمكن من الوصول إلى حسابك أو فتح ticket، يمكنك مراسلتنا على nivadesk@gmail.com. البريد يستخدم أساساً عندما لا يكون نظام التذاكر داخل التطبيق متاحاً.", "لأسئلة الفوترة أو الاشتراك، أخبرنا أين اشتريت الخطة: موقع NivaDesk أو Apple App Store أو Google Play. قد تحتاج بعض عمليات Apple أو Google إلى إدارتها مباشرة عبر تلك المنصات.", "يمكن تقديم طلبات حذف الحساب والبيانات عبر الدعم داخل التطبيق أو منطقة الحساب حيث تتوفر. قبل بعض الطلبات قد نتحقق من الهوية والدور داخل workspace.", "طلبات الخصوصية مثل access وcorrection وdeletion وrestriction وobjection وportability وconsent withdrawal تتم وفق Privacy Policy. قد نطلب معلومات إضافية للتحقق من الهوية.", "إذا وجدت مشكلة أمان أو وصول حساب أو تعرض بيانات أو vulnerability، أبلغ عنها عبر نظام التذاكر إن أمكن. قدم وصفاً واضحاً وخطوات وتفاصيل تقنية؛ لا تصل إلى بيانات مستخدمين آخرين.", "نسعى للرد بأسرع وقت معقول، لكن المدة تختلف حسب نوع الطلب والخطة وخطورة المشكلة والقدرة التشغيلية. لا نضمن وقتاً محدداً إلا باتفاق مكتوب منفصل.", "لدعم أسرع، أرسل المنصة وإصدار التطبيق وطراز الجهاز ونظام التشغيل واسم workspace والطلب أو الملف المتأثر واللقطات ورسائل الخطأ وشرحاً قصيراً لما حدث.", "لا يشمل دعم NivaDesk نصائح قانونية أو ضريبية أو مالية أو محاسبية أو تجارية أو امتثال. قد نشرح طريقة عمل الميزات، لكن قرار الاستخدام والامتثال للقوانين مسؤوليتك.", "قد نحدث هذه الصفحة عند تغير عملية الدعم أو نظام التذاكر أو وسائل التواصل أو ميزات المنتج. قد يتم الإعلان عن التغييرات المهمة عبر الموقع أو التطبيق أو الحساب.", "EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. البريد: nivadesk@gmail.com. يجب قراءة هذه الصفحة مع Terms of Service و Privacy Policy و Refund and Cancellation Policy و Account Deletion Policy."]
  },
  "हिन्दी (Hindi)": {
    lastUpdatedLabel: "अंतिम अपडेट",
    introTitle: "NivaDesk Support and Contact",
    introParagraphs: ["यह page बताता है कि users help, account support, billing questions, technical issues, privacy requests और general product enquiries के लिए NivaDesk से कैसे contact कर सकते हैं.", "NivaDesk United Kingdom में registered EGGCRAFT LIMITED द्वारा operated है."],
    sectionTitles: COMMON_SECTION_TITLES.English,
    sectionSummaries: ["NivaDesk customer support primarily in-app ticket system से देता है. Problem, account help, billing question या technical issue होने पर जहाँ possible हो NivaDesk app या web workspace के अंदर ticket खोलें.", "Ticket system available होने पर support/help area से request खोलें. Workspace, order, screen, device, platform, app version, screenshots, error messages और steps include करें. Unnecessary sensitive personal data include न करें.", "Ticket system account issues, login, billing, subscription, workspace access, team permissions, file uploads, sync, bugs, feature questions, data export, account deletion और general technical support के लिए use हो सकता है. कुछ requests identity या authority verification require कर सकती हैं.", "अगर account access नहीं है या ticket नहीं खोल सकते, nivadesk@gmail.com पर email करें. Email mainly तब use करें जब in-app ticket system available न हो.", "Billing/subscription questions में बताएं plan कहाँ से purchased था: NivaDesk website, Apple App Store या Google Play. Apple/Google purchases में कुछ payment, cancellation, refund और renewal processes platform द्वारा handled हो सकते हैं.", "Account deletion और data requests in-app support या account area से submit हो सकते हैं जहाँ available हो. कुछ requests से पहले identity और workspace role verify करनी पड़ सकती है.", "Privacy requests, including access, correction, deletion, restriction, objection, portability या consent withdrawal, Privacy Policy के अनुसार handled होंगे. Identity verify करने के लिए additional information मांगी जा सकती है.", "Security issue, account access issue, data exposure या vulnerability मिले तो possible हो तो in-app ticket से report करें. Clear description, affected area, steps और technical details दें; दूसरे users का data access/disclose न करें.", "हम support requests का response reasonably possible जितनी जल्दी देने का प्रयास करते हैं, लेकिन time request type, plan, severity और capacity पर depend करता है. Specific response time separate written agreement के बिना guarantee नहीं है.", "Faster support के लिए platform, app version, device model, OS version, workspace name, affected order/file, screenshots, error messages और short explanation include करें.", "NivaDesk support professional legal, tax, financial, accounting, business या compliance advice include नहीं करता. हम features explain कर सकते हैं; business use और laws compliance आपकी responsibility है.", "Support process, ticket system, contact methods या product features बदलने पर यह page update हो सकता है. Material changes website, app या account area में notice किए जा सकते हैं.", "EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. Email: nivadesk@gmail.com. यह page Terms of Service, Privacy Policy, Refund and Cancellation Policy और Account Deletion Policy के साथ पढ़ा जाना चाहिए."]
  }
};

Object.assign(SUPPORT_CONTACT_DRAFTS, SUPPORT_CONTACT_COMMON);

export function getSupportContactSections(language: StudioLanguage): PrivacyPolicySection[] {
  const localized = SUPPORT_CONTACT_DRAFTS[language];
  if (!localized) {
    return SUPPORT_CONTACT_SECTIONS;
  }
  return buildLocalizedSupportContact(localized);
}

export function getSupportContactLastUpdatedLabel(language: StudioLanguage): string {
  return SUPPORT_CONTACT_LABELS[language] ?? "Last updated";
}
