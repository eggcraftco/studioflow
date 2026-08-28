import type { PrivacyPolicySection } from "@/lib/publicSite/privacyPolicy";
import type { StudioLanguage } from "@/lib/studioflow/language";

export const SUBPROCESSORS_LAST_UPDATED = "28 May 2026";

export const SUBPROCESSORS_SECTIONS: PrivacyPolicySection[] = [
  {
    title: "Subprocessors",
    paragraphs: [
      "NivaDesk is operated by EGGCRAFT LIMITED.",
      "This Subprocessors page explains the third-party service providers that NivaDesk may use to host, operate, secure, support, and improve the NivaDesk service.",
      "This document supports our Privacy Policy, Terms of Service, Security Overview, and Data Processing Agreement. It lists the core providers we use or may use to operate NivaDesk, depending on the features enabled for a customer."
    ]
  },
  {
    title: "1. Who we are",
    paragraphs: [
      "NivaDesk is operated by EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom.",
      "For privacy, data protection, or subprocessors questions, contact us at: contact@nivadesk.co.uk."
    ]
  },
  {
    title: "2. What is a subprocessor?",
    paragraphs: [
      "A subprocessor is a third-party service provider that may process personal data on behalf of NivaDesk in order to help us provide our service to customers.",
      "For example, NivaDesk may use cloud infrastructure to store workspace data, authentication providers to manage login, payment providers to process subscriptions, or email providers to send account and service emails."
    ]
  },
  {
    title: "3. Our approach",
    paragraphs: [
      "We aim to use trusted providers that support reasonable security, reliability, and privacy standards.",
      "We only allow subprocessors to process personal data for the purposes needed to provide their services to us. We do not sell personal data. We do not use workspace content, client files, order records, or private business data for advertising to customers.",
      "Where required, we enter into appropriate contracts with subprocessors, including data processing terms and confidentiality obligations."
    ]
  },
  {
    title: "4. Data that subprocessors may process",
    paragraphs: ["Depending on the service and feature used, subprocessors may process limited categories of data such as:"],
    bullets: [
      "account data, such as name, email address, user ID, login method, and workspace role;",
      "workspace data, such as order records, customer details, tasks, notes, timelines, and activity logs;",
      "uploaded files and related metadata, such as file name, size, type, storage path, upload date, and uploader;",
      "payment and subscription information, such as plan, invoice status, subscription ID, and billing contact details;",
      "technical data, such as IP address, device type, app version, logs, diagnostics, crash reports, and security events;",
      "communication data, such as support requests, transactional emails, and service notifications."
    ]
  },
  {
    title: "5. Current and expected subprocessors",
    paragraphs: ["The providers below may be used to operate NivaDesk, depending on the platform, plan, and features a customer uses."],
    subsections: [
      {
        title: "Firebase / Google Cloud",
        paragraphs: [
          "Purpose: authentication, database, cloud storage, hosting, functions, security rules, app infrastructure, and sync.",
          "Data categories: account data, workspace data, uploaded files, metadata, and technical logs.",
          "Location / notes: used for core NivaDesk infrastructure such as authentication, database, storage, hosting, functions, and sync."
        ]
      },
      {
        title: "Apple",
        paragraphs: [
          "Purpose: Apple sign-in, App Store distribution, in-app purchases, subscriptions, and app platform services.",
          "Data categories: Apple account identifier, email where shared, subscription status, and app transaction data.",
          "Location / notes: applies where users download, sign in, or subscribe through Apple services."
        ]
      },
      {
        title: "Google / Google Play",
        paragraphs: [
          "Purpose: Google sign-in, Google Play distribution, subscriptions, app services, and Android platform support.",
          "Data categories: Google account identifier, email/profile information where shared, subscription status, and app transaction data.",
          "Location / notes: applies where users download, sign in, or subscribe through Google services."
        ]
      },
      {
        title: "Stripe",
        paragraphs: [
          "Purpose: web payments, billing portal, subscriptions, invoices, receipts, taxes, and payment status.",
          "Data categories: billing contact data, payment method token/reference, invoices, subscription data, and transaction data.",
          "Location / notes: needed if NivaDesk offers direct web billing. Full card numbers are not stored by NivaDesk."
        ]
      },
      {
        title: "Email delivery provider",
        paragraphs: [
          "Purpose: transactional emails such as login, account, billing, security, support, and service notifications.",
          "Data categories: name, email address, message metadata, and email content needed for delivery.",
          "Location / notes: used only if this service is configured for NivaDesk."
        ]
      },
      {
        title: "Analytics provider",
        paragraphs: [
          "Purpose: website and product analytics, usage measurement, feature improvement, and performance insights.",
          "Data categories: usage data, device/browser data, approximate location, event data, and cookie or device identifiers where enabled.",
          "Location / notes: use only where configured and with consent where required."
        ]
      },
      {
        title: "Crash/error monitoring provider",
        paragraphs: [
          "Purpose: crash reports, diagnostics, reliability monitoring, and bug fixing.",
          "Data categories: technical logs, device/app data, error traces, and user/session identifiers where necessary.",
          "Location / notes: used only if this service is configured for NivaDesk."
        ]
      },
      {
        title: "Customer support provider",
        paragraphs: [
          "Purpose: support tickets, help desk, user messages, screenshots, and support history.",
          "Data categories: contact details, support messages, and screenshots or attachments sent by the user.",
          "Location / notes: used only if a dedicated support tool is configured for NivaDesk."
        ]
      }
    ]
  },
  {
    title: "6. Core infrastructure providers",
    paragraphs: [
      "Core infrastructure providers are necessary to operate NivaDesk. They may support account authentication, database storage, file storage, serverless functions, hosting, app sync, backup, and security controls.",
      "Because these providers are needed for the service to work, users cannot usually opt out of core infrastructure processing while continuing to use NivaDesk."
    ]
  },
  {
    title: "7. Payment providers",
    paragraphs: [
      "Payment providers process subscriptions, renewals, invoices, receipts, refunds, tax information, fraud checks, and payment status.",
      "If you subscribe through Apple App Store or Google Play, your payment relationship may be with Apple or Google. If you subscribe through our website, payment may be processed through Stripe or another payment provider.",
      "NivaDesk does not store full card numbers on its own systems."
    ]
  },
  {
    title: "8. Analytics and diagnostics providers",
    paragraphs: [
      "We may use analytics and diagnostics providers to understand how the website and product are used, measure performance, fix bugs, and improve reliability.",
      "Where required by law, non-essential analytics or marketing cookies will only be used after consent. Analytics should not be used to inspect private workspace content, uploaded files, or customer records for advertising purposes."
    ]
  },
  {
    title: "9. Support and communication providers",
    paragraphs: [
      "We may use email, help desk, or customer support providers to respond to support requests, send account messages, deliver billing notices, and provide service-related updates.",
      "Please avoid sending unnecessary sensitive information in support messages unless it is needed to resolve your request."
    ]
  },
  {
    title: "10. International transfers",
    paragraphs: [
      "Some subprocessors may process data outside the United Kingdom or European Economic Area.",
      "Where required, we use appropriate safeguards for international transfers, such as adequacy decisions, standard contractual clauses, the UK International Data Transfer Agreement, or other lawful transfer mechanisms."
    ]
  },
  {
    title: "11. Changes to subprocessors",
    paragraphs: [
      "NivaDesk may add, replace, or remove subprocessors as our service develops.",
      "We will update this page when material subprocessors change. Business customers that have a Data Processing Agreement with us may have additional notification rights as described in that agreement.",
      "If you have concerns about a new subprocessor, contact us at contact@nivadesk.co.uk."
    ]
  },
  {
    title: "12. Customer responsibilities",
    paragraphs: [
      "Customers are responsible for deciding what personal data they add to NivaDesk and ensuring they have the right to process that data.",
      "If you use NivaDesk to manage your own clients, customers, suppliers, contractors, employees, or other third parties, you are responsible for providing any privacy notices or consent required by law.",
      "You should only upload files and data that are necessary for your business use and should avoid storing unnecessary sensitive information."
    ]
  },
  {
    title: "13. Contact",
    paragraphs: [
      "If you have questions about this Subprocessors page, our providers, or how NivaDesk processes data, please contact:",
      "EGGCRAFT LIMITED",
      "141 Randolph Avenue",
      "London",
      "W9 1DN",
      "United Kingdom",
      "Email: contact@nivadesk.co.uk"
    ]
  }
];

type LocalizedSubprocessorsDraft = {
  lastUpdatedLabel: string;
  introTitle: string;
  introParagraphs: string[];
  sectionTitles: string[];
  sectionSummaries: string[];
};

function buildLocalizedSubprocessors(copy: LocalizedSubprocessorsDraft): PrivacyPolicySection[] {
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

const SUBPROCESSORS_DRAFTS: Partial<Record<StudioLanguage, LocalizedSubprocessorsDraft>> = {
  Türkçe: {
    lastUpdatedLabel: "Son güncelleme",
    introTitle: "Subprocessors",
    introParagraphs: [
      "Bu sayfa, NivaDesk'in hizmeti barındırmak, işletmek, güvenceye almak, desteklemek ve geliştirmek için kullanabileceği üçüncü taraf servis sağlayıcıları açıklar.",
      "NivaDesk, EGGCRAFT LIMITED tarafından işletilir. İletişim: contact@nivadesk.co.uk. Bu sayfa Privacy Policy, Terms of Service, Security Overview ve Data Processing Agreement dokümanlarını destekler."
    ],
    sectionTitles: [
      "Biz kimiz",
      "Subprocessor nedir?",
      "Yaklaşımımız",
      "Subprocessorların işleyebileceği veriler",
      "Mevcut ve beklenen subprocessors",
      "Core infrastructure providers",
      "Payment providers",
      "Analytics ve diagnostics providers",
      "Support ve communication providers",
      "International transfers",
      "Subprocessor değişiklikleri",
      "Müşteri sorumlulukları",
      "İletişim"
    ],
    sectionSummaries: [
      "NivaDesk, EGGCRAFT LIMITED tarafından 141 Randolph Avenue, London, W9 1DN, United Kingdom adresinden işletilir. Privacy, data protection veya subprocessors soruları için contact@nivadesk.co.uk adresinden ulaşabilirsiniz.",
      "Subprocessor, NivaDesk'in müşterilere hizmet sunmasına yardımcı olmak için NivaDesk adına personal data işleyebilen üçüncü taraf servis sağlayıcıdır. Örneğin cloud infrastructure, authentication, payments veya email providers kullanılabilir.",
      "Makul güvenlik, reliability ve privacy standartlarını destekleyen trusted providers kullanmayı hedefleriz. Subprocessorların verileri yalnızca bize hizmet sunmak için gerekli amaçlarla işlemesine izin veririz; personal data satmayız ve workspace content'i reklam için kullanmayız.",
      "Kullanılan servise göre account data, workspace data, uploaded files metadata, payment/subscription information, technical data ve communication data gibi sınırlı veri kategorileri işlenebilir.",
      "Beklenen sağlayıcılar arasında Firebase / Google Cloud, Apple, Google / Google Play, Stripe, email delivery provider, analytics provider, crash/error monitoring provider ve customer support provider bulunabilir. Production provider, service ve region bilgileri yayından önce netleştirilmelidir.",
      "Core infrastructure providers; authentication, database storage, file storage, serverless functions, hosting, sync, backup ve security controls için gerekli olabilir. Hizmet çalışırken bu processing’den genellikle opt out yapılamaz.",
      "Payment providers subscriptions, renewals, invoices, receipts, refunds, tax information, fraud checks ve payment status işler. Apple/Google üzerinden aboneliklerde ilişki bu platformlarla olabilir; web billing Stripe veya başka provider ile işlenebilir.",
      "Analytics ve diagnostics providers, website ve product usage anlamak, performance ölçmek, bugs düzeltmek ve reliability geliştirmek için kullanılabilir. Non-essential analytics/marketing cookies gerekli yerlerde consent sonrası kullanılır.",
      "Email, help desk veya customer support providers; support requests yanıtlamak, account messages göndermek, billing notices iletmek ve service updates sağlamak için kullanılabilir. Gereksiz sensitive information göndermekten kaçınılmalıdır.",
      "Bazı subprocessors verileri UK veya EEA dışında işleyebilir. Gerekli olduğunda adequacy decisions, standard contractual clauses, UK International Data Transfer Agreement veya diğer lawful transfer mechanisms kullanılır.",
      "NivaDesk hizmet geliştikçe subprocessors ekleyebilir, değiştirebilir veya kaldırabilir. Material değişikliklerde bu sayfa güncellenir; DPA olan business customers ek bildirim haklarına sahip olabilir.",
      "Customers, NivaDesk'e ekledikleri personal data için gerekli haklara sahip olduklarından ve kendi client/customer/supplier/employee verileri için gerekli privacy notices veya consents sağladıklarından sorumludur.",
      "Bu sayfa, providers veya NivaDesk'in data processing'i hakkında sorular için EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom ya da contact@nivadesk.co.uk üzerinden bize ulaşabilirsiniz."
    ]
  },
  Deutsch: {
    lastUpdatedLabel: "Zuletzt aktualisiert",
    introTitle: "Subprozessoren",
    introParagraphs: [
      "Diese Seite erklärt, welche Drittanbieter NivaDesk verwenden kann, um den Dienst zu hosten, betreiben, sichern, unterstützen und verbessern.",
      "NivaDesk wird von EGGCRAFT LIMITED betrieben. Kontakt: contact@nivadesk.co.uk. Diese Seite ergänzt Privacy Policy, Terms of Service, Security Overview und Data Processing Agreement."
    ],
    sectionTitles: [
      "Wer wir sind",
      "Was ist ein Subprozessor?",
      "Unser Ansatz",
      "Daten, die Subprozessoren verarbeiten können",
      "Aktuelle und erwartete Subprozessoren",
      "Kerninfrastruktur-Anbieter",
      "Zahlungsanbieter",
      "Analytics- und Diagnoseanbieter",
      "Support- und Kommunikationsanbieter",
      "Internationale Übermittlungen",
      "Änderungen an Subprozessoren",
      "Verantwortung der Kunden",
      "Kontakt"
    ],
    sectionSummaries: [
      "NivaDesk wird von EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom betrieben. Für Datenschutz- oder Subprozessorfragen kontaktiere contact@nivadesk.co.uk.",
      "Ein Subprozessor ist ein Drittanbieter, der personenbezogene Daten im Auftrag von NivaDesk verarbeitet, um den Dienst bereitzustellen, etwa Cloud-Infrastruktur, Authentifizierung, Zahlungen oder E-Mail.",
      "Wir wollen vertrauenswürdige Anbieter mit angemessener Sicherheit, Zuverlässigkeit und Datenschutz verwenden. Daten dürfen nur für benötigte Dienste verarbeitet werden; wir verkaufen keine personenbezogenen Daten und nutzen Workspace-Inhalte nicht für Werbung.",
      "Je nach Dienst können Konto-, Workspace-, Datei-Metadaten, Zahlungs- und Abodaten, technische Daten sowie Kommunikationsdaten verarbeitet werden.",
      "Erwartete Anbieter können Firebase / Google Cloud, Apple, Google / Google Play, Stripe, E-Mail-Versand, Analytics, Crash/Error Monitoring und Customer Support sein. Produktionsanbieter, Services und Regionen sollten vor Veröffentlichung bestätigt werden.",
      "Kerninfrastruktur kann Authentifizierung, Datenbank, Dateispeicher, Functions, Hosting, Sync, Backup und Sicherheitskontrollen unterstützen. Ohne diese Verarbeitung kann der Dienst meist nicht genutzt werden.",
      "Zahlungsanbieter verarbeiten Abos, Verlängerungen, Rechnungen, Belege, Rückerstattungen, Steuerdaten, Betrugsprüfungen und Zahlungsstatus. App-Store-Zahlungen können direkt über Apple oder Google laufen.",
      "Analytics und Diagnose können Nutzung, Performance, Fehlerbehebung und Zuverlässigkeit unterstützen. Nicht notwendige Analytics- oder Marketing-Cookies werden nur mit erforderlicher Einwilligung genutzt.",
      "E-Mail-, Helpdesk- oder Supportanbieter können Supportanfragen, Account-Nachrichten, Abrechnungshinweise und Service-Updates unterstützen. Sende keine unnötigen sensiblen Informationen.",
      "Einige Subprozessoren können Daten außerhalb des UK oder EEA verarbeiten. Wo nötig nutzen wir geeignete Schutzmaßnahmen wie Angemessenheitsbeschlüsse, SCCs oder das UK IDTA.",
      "NivaDesk kann Subprozessoren hinzufügen, ersetzen oder entfernen. Diese Seite wird bei wesentlichen Änderungen aktualisiert; Business-Kunden mit DPA können zusätzliche Benachrichtigungsrechte haben.",
      "Kunden sind verantwortlich dafür, welche personenbezogenen Daten sie hinzufügen und ob sie die nötigen Rechte, Hinweise oder Einwilligungen für eigene Kunden, Lieferanten, Mitarbeiter oder Dritte haben.",
      "Für Fragen zu Subprozessoren oder Datenverarbeitung kontaktiere EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom oder contact@nivadesk.co.uk."
    ]
  },
  Français: {
    lastUpdatedLabel: "Dernière mise à jour",
    introTitle: "Sous-traitants ultérieurs",
    introParagraphs: [
      "Cette page explique les prestataires tiers que NivaDesk peut utiliser pour héberger, exploiter, sécuriser, soutenir et améliorer le service.",
      "NivaDesk est exploité par EGGCRAFT LIMITED. Contact: contact@nivadesk.co.uk. Cette page complète la Privacy Policy, les Terms of Service, le Security Overview et le Data Processing Agreement."
    ],
    sectionTitles: [
      "Qui nous sommes",
      "Qu'est-ce qu'un sous-traitant ultérieur?",
      "Notre approche",
      "Données que les sous-traitants peuvent traiter",
      "Sous-traitants actuels et attendus",
      "Fournisseurs d'infrastructure principale",
      "Prestataires de paiement",
      "Prestataires analytics et diagnostics",
      "Prestataires support et communication",
      "Transferts internationaux",
      "Changements de sous-traitants",
      "Responsabilités des clients",
      "Contact"
    ],
    sectionSummaries: [
      "NivaDesk est exploité par EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. Pour les questions privacy, data protection ou subprocessors, contactez contact@nivadesk.co.uk.",
      "Un subprocessor est un prestataire tiers qui peut traiter des données personnelles pour NivaDesk afin de fournir le service, par exemple cloud infrastructure, authentification, paiements ou e-mail.",
      "Nous visons des prestataires fiables avec des standards raisonnables de sécurité, fiabilité et confidentialité. Les données ne doivent être traitées que pour fournir les services nécessaires; nous ne vendons pas les données et n'utilisons pas le workspace content pour la publicité.",
      "Selon le service, les données traitées peuvent inclure account data, workspace data, metadata de fichiers, paiement/abonnement, données techniques et communications.",
      "Les prestataires attendus peuvent inclure Firebase / Google Cloud, Apple, Google / Google Play, Stripe, e-mail delivery, analytics, crash/error monitoring et customer support. Les prestataires, services et régions de production doivent être confirmés avant publication.",
      "Les fournisseurs d'infrastructure principale peuvent être nécessaires pour l'authentification, base de données, stockage fichiers, functions, hosting, sync, backup et contrôles sécurité. Les utilisateurs ne peuvent généralement pas s'en retirer tout en utilisant le service.",
      "Les prestataires de paiement traitent abonnements, renouvellements, factures, reçus, remboursements, taxes, contrôles fraude et statut de paiement. Les abonnements Apple/Google peuvent être gérés par ces plateformes.",
      "Les prestataires analytics et diagnostics peuvent aider à comprendre l'usage, mesurer la performance, corriger les bugs et améliorer la fiabilité. Les cookies non essentiels nécessitent le consentement lorsque requis.",
      "Les prestataires e-mail, help desk ou support peuvent aider à répondre aux demandes, envoyer messages de compte, notices de facturation et mises à jour de service. Évitez d'envoyer des informations sensibles inutiles.",
      "Certains subprocessors peuvent traiter des données hors du Royaume-Uni ou de l'EEE. Si nécessaire, nous utilisons des garanties appropriées comme décisions d'adéquation, SCCs, UK IDTA ou autres mécanismes légaux.",
      "NivaDesk peut ajouter, remplacer ou supprimer des subprocessors. Cette page sera mise à jour lors de changements matériels; les clients business avec DPA peuvent avoir des droits de notification supplémentaires.",
      "Les clients décident quelles données personnelles ils ajoutent à NivaDesk et doivent disposer des droits, notices ou consentements requis pour leurs propres clients, fournisseurs, employés ou tiers.",
      "Pour toute question sur cette page, nos prestataires ou le traitement des données, contactez EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom ou contact@nivadesk.co.uk."
    ]
  },
  Italiano: {
    lastUpdatedLabel: "Ultimo aggiornamento",
    introTitle: "Subprocessor",
    introParagraphs: [
      "Questa pagina spiega i fornitori terzi che NivaDesk può usare per ospitare, gestire, proteggere, supportare e migliorare il servizio.",
      "NivaDesk è gestito da EGGCRAFT LIMITED. Contatto: contact@nivadesk.co.uk. Questa pagina supporta Privacy Policy, Terms of Service, Security Overview e Data Processing Agreement."
    ],
    sectionTitles: [
      "Chi siamo",
      "Che cos'è un subprocessor?",
      "Il nostro approccio",
      "Dati che i subprocessor possono trattare",
      "Subprocessor attuali e previsti",
      "Fornitori di infrastruttura core",
      "Provider di pagamento",
      "Provider analytics e diagnostica",
      "Provider supporto e comunicazione",
      "Trasferimenti internazionali",
      "Modifiche ai subprocessor",
      "Responsabilità dei clienti",
      "Contatti"
    ],
    sectionSummaries: [
      "NivaDesk è gestito da EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. Per privacy, protezione dati o subprocessor contatta contact@nivadesk.co.uk.",
      "Un subprocessor è un fornitore terzo che può trattare dati personali per conto di NivaDesk per aiutarci a fornire il servizio, ad esempio cloud infrastructure, autenticazione, pagamenti o email.",
      "Usiamo provider affidabili con standard ragionevoli di sicurezza, affidabilità e privacy. I dati sono trattati solo per i servizi necessari; non vendiamo dati personali e non usiamo workspace content per pubblicità.",
      "A seconda del servizio, possono essere trattati account data, workspace data, metadata dei file, informazioni pagamento/abbonamento, technical data e communication data.",
      "Provider previsti possono includere Firebase / Google Cloud, Apple, Google / Google Play, Stripe, email delivery, analytics, crash/error monitoring e customer support. Provider, servizi e regioni production vanno confermati prima della pubblicazione.",
      "I fornitori core possono supportare autenticazione, database, file storage, functions, hosting, sync, backup e security controls. Di solito non è possibile opt out continuando a usare il servizio.",
      "I provider di pagamento trattano subscriptions, renewals, invoices, receipts, refunds, tax information, fraud checks e payment status. Apple o Google possono gestire abbonamenti app store; web billing può passare da Stripe.",
      "Analytics e diagnostica possono aiutare a capire usage, misurare performance, correggere bug e migliorare reliability. Cookie analytics/marketing non essenziali sono usati con consenso dove richiesto.",
      "Email, help desk o customer support providers possono gestire support requests, account messages, billing notices e service updates. Evita di inviare dati sensibili non necessari.",
      "Alcuni subprocessor possono trattare dati fuori da UK o EEA. Dove richiesto usiamo garanzie appropriate come adequacy decisions, SCCs, UK IDTA o altri meccanismi legali.",
      "NivaDesk può aggiungere, sostituire o rimuovere subprocessor. Questa pagina sarà aggiornata per modifiche materiali; clienti business con DPA possono avere ulteriori diritti di notifica.",
      "I clienti sono responsabili dei dati personali che aggiungono a NivaDesk e dei diritti, informative o consensi necessari per clienti, fornitori, dipendenti o altri terzi.",
      "Per domande su questa pagina, provider o data processing, contatta EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom oppure contact@nivadesk.co.uk."
    ]
  },
  "Español (Spanish)": {
    lastUpdatedLabel: "Última actualización",
    introTitle: "Subprocesadores",
    introParagraphs: [
      "Esta página explica los proveedores terceros que NivaDesk puede usar para alojar, operar, proteger, apoyar y mejorar el servicio.",
      "NivaDesk es operado por EGGCRAFT LIMITED. Contacto: contact@nivadesk.co.uk. Esta página apoya la Privacy Policy, Terms of Service, Security Overview y Data Processing Agreement."
    ],
    sectionTitles: [
      "Quiénes somos",
      "Qué es un subprocesador",
      "Nuestro enfoque",
      "Datos que pueden procesar",
      "Subprocesadores actuales y previstos",
      "Proveedores de infraestructura core",
      "Proveedores de pago",
      "Proveedores de analytics y diagnóstico",
      "Proveedores de soporte y comunicación",
      "Transferencias internacionales",
      "Cambios en subprocesadores",
      "Responsabilidades del cliente",
      "Contacto"
    ],
    sectionSummaries: [
      "NivaDesk es operado por EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. Para privacidad, protección de datos o subprocesadores contacta a contact@nivadesk.co.uk.",
      "Un subprocesador es un proveedor tercero que puede procesar datos personales en nombre de NivaDesk para prestar el servicio, como cloud infrastructure, autenticación, pagos o email.",
      "Buscamos proveedores confiables con estándares razonables de seguridad, fiabilidad y privacidad. Solo procesan datos para los servicios necesarios; no vendemos datos personales ni usamos workspace content para publicidad.",
      "Según el servicio, pueden procesarse account data, workspace data, metadata de archivos, información de pago/suscripción, technical data y communication data.",
      "Los proveedores previstos pueden incluir Firebase / Google Cloud, Apple, Google / Google Play, Stripe, email delivery, analytics, crash/error monitoring y customer support. Deben confirmarse provider, services y regions antes de publicar.",
      "Los proveedores core pueden soportar autenticación, database, file storage, functions, hosting, sync, backup y security controls. Normalmente no se puede optar fuera y seguir usando el servicio.",
      "Los proveedores de pago procesan subscriptions, renewals, invoices, receipts, refunds, tax information, fraud checks y payment status. Apple o Google pueden gestionar compras de app store; web billing puede usar Stripe.",
      "Analytics y diagnóstico pueden ayudar a entender uso, medir performance, corregir bugs y mejorar reliability. Cookies analytics/marketing no esenciales se usan con consentimiento donde sea requerido.",
      "Email, help desk o soporte pueden responder solicitudes, enviar account messages, billing notices y service updates. Evita enviar información sensible innecesaria.",
      "Algunos subprocesadores pueden procesar datos fuera de UK o EEA. Cuando sea necesario usamos garantías como adequacy decisions, SCCs, UK IDTA u otros mecanismos legales.",
      "NivaDesk puede añadir, reemplazar o eliminar subprocesadores. Actualizaremos esta página ante cambios materiales; clientes business con DPA pueden tener derechos adicionales de notificación.",
      "Los clientes son responsables de los datos personales que añaden a NivaDesk y de contar con derechos, avisos o consentimientos necesarios para sus propios clientes, proveedores, empleados o terceros.",
      "Para preguntas sobre esta página, proveedores o procesamiento de datos, contacta a EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom o contact@nivadesk.co.uk."
    ]
  },
  Português: {
    lastUpdatedLabel: "Última atualização",
    introTitle: "Subprocessadores",
    introParagraphs: [
      "Esta página explica os fornecedores terceiros que a NivaDesk pode usar para alojar, operar, proteger, apoiar e melhorar o serviço.",
      "A NivaDesk é operada pela EGGCRAFT LIMITED. Contacto: contact@nivadesk.co.uk. Esta página apoia a Privacy Policy, Terms of Service, Security Overview e Data Processing Agreement."
    ],
    sectionTitles: [
      "Quem somos",
      "O que é um subprocessador?",
      "A nossa abordagem",
      "Dados que subprocessadores podem tratar",
      "Subprocessadores atuais e esperados",
      "Fornecedores de infraestrutura core",
      "Fornecedores de pagamento",
      "Fornecedores analytics e diagnóstico",
      "Fornecedores de suporte e comunicação",
      "Transferências internacionais",
      "Alterações a subprocessadores",
      "Responsabilidades dos clientes",
      "Contacto"
    ],
    sectionSummaries: [
      "A NivaDesk é operada pela EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. Para privacidade, proteção de dados ou subprocessadores contacte contact@nivadesk.co.uk.",
      "Um subprocessador é um fornecedor terceiro que pode tratar dados pessoais em nome da NivaDesk para ajudar a prestar o serviço, como cloud infrastructure, autenticação, pagamentos ou email.",
      "Procuramos fornecedores confiáveis com segurança, fiabilidade e privacidade razoáveis. Só tratam dados para os serviços necessários; não vendemos dados pessoais nem usamos workspace content para publicidade.",
      "Conforme o serviço, podem ser tratados account data, workspace data, metadata de ficheiros, informação de pagamento/subscrição, technical data e communication data.",
      "Fornecedores esperados podem incluir Firebase / Google Cloud, Apple, Google / Google Play, Stripe, email delivery, analytics, crash/error monitoring e customer support. Provider, services e regions devem ser confirmados antes da publicação.",
      "Fornecedores core podem suportar autenticação, database, file storage, functions, hosting, sync, backup e security controls. Normalmente não é possível optar fora e continuar a usar o serviço.",
      "Fornecedores de pagamento tratam subscriptions, renewals, invoices, receipts, refunds, tax information, fraud checks e payment status. Apple/Google podem gerir app store; web billing pode usar Stripe.",
      "Analytics e diagnóstico podem ajudar a entender uso, medir performance, corrigir bugs e melhorar reliability. Cookies não essenciais usam consentimento quando exigido.",
      "Email, help desk ou support providers podem responder pedidos, enviar account messages, billing notices e service updates. Evite enviar informação sensível desnecessária.",
      "Alguns subprocessadores podem tratar dados fora do UK ou EEA. Quando necessário usamos safeguards como adequacy decisions, SCCs, UK IDTA ou outros mecanismos legais.",
      "A NivaDesk pode adicionar, substituir ou remover subprocessadores. Esta página será atualizada em mudanças materiais; clientes business com DPA podem ter direitos adicionais de notificação.",
      "Clientes são responsáveis pelos dados pessoais que adicionam à NivaDesk e por terem direitos, avisos ou consentimentos necessários para clientes, fornecedores, empregados ou terceiros.",
      "Para perguntas sobre esta página, fornecedores ou tratamento de dados, contacte EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom ou contact@nivadesk.co.uk."
    ]
  },
  "Русский (Russian)": {
    lastUpdatedLabel: "Последнее обновление",
    introTitle: "Субпроцессоры",
    introParagraphs: [
      "Эта страница объясняет, каких сторонних providers NivaDesk может использовать для hosting, operation, security, support и improvement сервиса.",
      "NivaDesk управляется EGGCRAFT LIMITED. Контакт: contact@nivadesk.co.uk. Эта страница дополняет Privacy Policy, Terms of Service, Security Overview и Data Processing Agreement."
    ],
    sectionTitles: [
      "Кто мы",
      "Что такое subprocessor?",
      "Наш подход",
      "Какие данные могут обрабатывать subprocessors",
      "Текущие и ожидаемые subprocessors",
      "Core infrastructure providers",
      "Payment providers",
      "Analytics и diagnostics providers",
      "Support и communication providers",
      "International transfers",
      "Изменения subprocessors",
      "Обязанности клиентов",
      "Контакты"
    ],
    sectionSummaries: [
      "NivaDesk управляется EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. По вопросам privacy, data protection или subprocessors пишите на contact@nivadesk.co.uk.",
      "Subprocessor: сторонний provider, который может обрабатывать personal data от имени NivaDesk, чтобы помогать предоставлять сервис, например cloud infrastructure, authentication, payments или email.",
      "Мы стремимся использовать trusted providers с разумными security, reliability и privacy standards. Данные обрабатываются только для нужных services; мы не продаем personal data и не используем workspace content для рекламы.",
      "В зависимости от сервиса могут обрабатываться account data, workspace data, file metadata, payment/subscription information, technical data и communication data.",
      "Ожидаемые providers могут включать Firebase / Google Cloud, Apple, Google / Google Play, Stripe, email delivery, analytics, crash/error monitoring и customer support. Production providers, services и regions нужно подтвердить до публикации.",
      "Core infrastructure может поддерживать authentication, database, file storage, functions, hosting, sync, backup и security controls. Обычно нельзя отказаться от такой processing и продолжать использовать сервис.",
      "Payment providers обрабатывают subscriptions, renewals, invoices, receipts, refunds, taxes, fraud checks и payment status. Apple/Google могут управлять app store payments; web billing может идти через Stripe.",
      "Analytics и diagnostics помогают понимать usage, измерять performance, fixing bugs и improving reliability. Non-essential analytics/marketing cookies используются с consent, где требуется.",
      "Email, help desk или support providers могут обрабатывать support requests, account messages, billing notices и service updates. Не отправляйте ненужную sensitive information.",
      "Некоторые subprocessors могут обрабатывать данные за пределами UK или EEA. Где требуется, мы используем safeguards вроде adequacy decisions, SCCs, UK IDTA или других lawful mechanisms.",
      "NivaDesk может добавлять, заменять или удалять subprocessors. Эта страница обновляется при material changes; business customers с DPA могут иметь дополнительные notification rights.",
      "Клиенты отвечают за personal data, добавляемые в NivaDesk, и за rights, notices или consents для своих clients, suppliers, employees или third parties.",
      "По вопросам этой страницы, providers или data processing свяжитесь с EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom или contact@nivadesk.co.uk."
    ]
  },
  "日本語 (Japanese)": {
    lastUpdatedLabel: "最終更新日",
    introTitle: "サブプロセッサ",
    introParagraphs: [
      "このページは、NivaDesk がサービスの hosting、operation、security、support、improvement のために利用する可能性がある第三者 service providers を説明します。",
      "NivaDesk は EGGCRAFT LIMITED が運営します。連絡先: contact@nivadesk.co.uk。このページは Privacy Policy、Terms of Service、Security Overview、Data Processing Agreement を補足します。"
    ],
    sectionTitles: [
      "運営者",
      "Subprocessor とは",
      "当社の方針",
      "Subprocessors が処理する可能性のあるデータ",
      "現在および想定される subprocessors",
      "Core infrastructure providers",
      "Payment providers",
      "Analytics と diagnostics providers",
      "Support と communication providers",
      "国際移転",
      "Subprocessors の変更",
      "顧客の責任",
      "お問い合わせ"
    ],
    sectionSummaries: [
      "NivaDesk は EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom が運営します。privacy、data protection、subprocessors に関する質問は contact@nivadesk.co.uk へご連絡ください。",
      "Subprocessor は、NivaDesk がサービス提供のために personal data を委託処理する第三者 provider です。例として cloud infrastructure、authentication、payments、email providers があります。",
      "当社は合理的な security、reliability、privacy standards を支援する trusted providers を利用することを目指します。personal data は必要なサービス目的のみに処理され、販売や workspace content の広告利用はしません。",
      "サービスに応じて account data、workspace data、uploaded file metadata、payment/subscription information、technical data、communication data が処理される場合があります。",
      "想定 providers には Firebase / Google Cloud、Apple、Google / Google Play、Stripe、email delivery、analytics、crash/error monitoring、customer support が含まれます。production providers、services、regions は公開前に確認が必要です。",
      "Core infrastructure は authentication、database、file storage、functions、hosting、sync、backup、security controls を支援します。通常、サービス利用中にこの processing から opt out できません。",
      "Payment providers は subscriptions、renewals、invoices、receipts、refunds、taxes、fraud checks、payment status を処理します。Apple/Google の購入はそれぞれの platform が管理する場合があります。",
      "Analytics と diagnostics は usage、performance、bug fixing、reliability improvement を支援します。non-essential analytics/marketing cookies は必要な場合 consent 後に使用されます。",
      "Email、help desk、customer support providers は support requests、account messages、billing notices、service updates を支援します。不要な sensitive information を送らないでください。",
      "一部 subprocessors は UK または EEA 外でデータを処理する場合があります。必要な場合、adequacy decisions、SCCs、UK IDTA などの safeguards を利用します。",
      "NivaDesk は subprocessors を追加、置換、削除する場合があります。material changes がある場合このページを更新し、DPA のある business customers には追加通知権がある場合があります。",
      "顧客は NivaDesk に追加する personal data と、自身の clients、suppliers、employees、third parties に必要な rights、notices、consents について責任を負います。",
      "このページ、providers、data processing については EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom または contact@nivadesk.co.uk までご連絡ください。"
    ]
  },
  "中文 (Chinese)": {
    lastUpdatedLabel: "最后更新",
    introTitle: "子处理方",
    introParagraphs: [
      "本页面说明 NivaDesk 可能用于托管、运营、保护、支持和改进服务的第三方 service providers。",
      "NivaDesk 由 EGGCRAFT LIMITED 运营。联系方式: contact@nivadesk.co.uk。本页面支持 Privacy Policy、Terms of Service、Security Overview 和 Data Processing Agreement。"
    ],
    sectionTitles: [
      "我们是谁",
      "什么是 subprocessor",
      "我们的做法",
      "Subprocessors 可能处理的数据",
      "当前和预期 subprocessors",
      "核心基础设施提供商",
      "支付提供商",
      "Analytics 和 diagnostics providers",
      "支持和通信提供商",
      "国际传输",
      "Subprocessors 变更",
      "客户责任",
      "联系我们"
    ],
    sectionSummaries: [
      "NivaDesk 由 EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom 运营。隐私、数据保护或 subprocessors 问题请联系 contact@nivadesk.co.uk。",
      "Subprocessor 是代表 NivaDesk 处理 personal data 以帮助提供服务的第三方 provider，例如 cloud infrastructure、authentication、payments 或 email providers。",
      "我们目标是使用具备合理安全、可靠性和隐私标准的 trusted providers。数据仅为提供必要服务而处理；我们不出售 personal data，也不将 workspace content 用于广告。",
      "根据服务不同，可能处理 account data、workspace data、uploaded files metadata、payment/subscription information、technical data 和 communication data。",
      "预期 providers 可能包括 Firebase / Google Cloud、Apple、Google / Google Play、Stripe、email delivery、analytics、crash/error monitoring 和 customer support。Production provider、service 和 region 应在发布前确认。",
      "核心基础设施可支持 authentication、database、file storage、functions、hosting、sync、backup 和 security controls。通常无法在继续使用服务的同时选择退出该 processing。",
      "Payment providers 处理 subscriptions、renewals、invoices、receipts、refunds、taxes、fraud checks 和 payment status。Apple/Google 购买可能由对应平台管理，web billing 可通过 Stripe。",
      "Analytics 和 diagnostics 可帮助了解 usage、衡量 performance、修复 bugs、提升 reliability。非必要 analytics/marketing cookies 在法律要求时仅经 consent 使用。",
      "Email、help desk 或 support providers 可用于回复 support requests、发送 account messages、billing notices 和 service updates。请避免发送不必要的 sensitive information。",
      "部分 subprocessors 可能在 UK 或 EEA 之外处理数据。需要时，我们使用 adequacy decisions、SCCs、UK IDTA 或其他 lawful transfer mechanisms。",
      "NivaDesk 可能添加、替换或移除 subprocessors。重大变更时会更新本页面；有 DPA 的 business customers 可能享有额外通知权。",
      "客户负责决定添加到 NivaDesk 的 personal data，并确保对自身 clients、customers、suppliers、employees 或 third parties 具备必要 rights、notices 或 consents。",
      "如对本页面、providers 或 data processing 有疑问，请联系 EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom 或 contact@nivadesk.co.uk。"
    ]
  },
  "العربية (Arabic)": {
    lastUpdatedLabel: "آخر تحديث",
    introTitle: "المعالجون الفرعيون",
    introParagraphs: [
      "توضح هذه الصفحة مزودي الخدمات الخارجيين الذين قد تستخدمهم NivaDesk لاستضافة الخدمة وتشغيلها وتأمينها ودعمها وتحسينها.",
      "تدير EGGCRAFT LIMITED خدمة NivaDesk. التواصل: contact@nivadesk.co.uk. تدعم هذه الصفحة Privacy Policy وTerms of Service وSecurity Overview وData Processing Agreement."
    ],
    sectionTitles: [
      "من نحن",
      "ما هو subprocessor؟",
      "نهجنا",
      "البيانات التي قد يعالجها subprocessors",
      "المعالجون الحاليون والمتوقعون",
      "مزودو البنية الأساسية",
      "مزودو الدفع",
      "مزودو analytics والتشخيص",
      "مزودو الدعم والتواصل",
      "النقل الدولي",
      "تغييرات subprocessors",
      "مسؤوليات العملاء",
      "التواصل"
    ],
    sectionSummaries: [
      "تدير EGGCRAFT LIMITED خدمة NivaDesk من 141 Randolph Avenue, London, W9 1DN, United Kingdom. لأسئلة الخصوصية أو حماية البيانات أو subprocessors تواصل عبر contact@nivadesk.co.uk.",
      "Subprocessor هو مزود خدمة خارجي قد يعالج personal data نيابة عن NivaDesk لمساعدتنا في تقديم الخدمة، مثل cloud infrastructure أو authentication أو payments أو email providers.",
      "نهدف إلى استخدام trusted providers يدعمون security وreliability وprivacy standards معقولة. نعالج البيانات فقط للأغراض اللازمة، ولا نبيع personal data أو نستخدم workspace content للإعلانات.",
      "حسب الخدمة، قد تعالج فئات محدودة مثل account data وworkspace data وuploaded file metadata وpayment/subscription information وtechnical data وcommunication data.",
      "قد تشمل providers المتوقعة Firebase / Google Cloud وApple وGoogle / Google Play وStripe وemail delivery وanalytics وcrash/error monitoring وcustomer support. يجب تأكيد providers والخدمات والمناطق قبل النشر.",
      "قد تكون core infrastructure ضرورية للمصادقة وقاعدة البيانات وتخزين الملفات وfunctions والاستضافة وsync والنسخ الاحتياطي وsecurity controls. غالباً لا يمكن opt out مع استمرار استخدام الخدمة.",
      "تعالج payment providers الاشتراكات والتجديدات والفواتير والإيصالات والاستردادات والضرائب وفحوص الاحتيال وحالة الدفع. قد تدير Apple/Google مشتريات app store، وقد يستخدم web billing Stripe.",
      "قد تساعد analytics والتشخيص في فهم usage وقياس performance وإصلاح bugs وتحسين reliability. تستخدم cookies غير الضرورية بعد consent حيث يلزم.",
      "قد تساعد email وhelp desk وsupport providers في الرد على support requests وإرسال account messages وbilling notices وservice updates. تجنب إرسال sensitive information غير ضرورية.",
      "قد يعالج بعض subprocessors البيانات خارج UK أو EEA. عند الحاجة نستخدم safeguards مثل adequacy decisions أو SCCs أو UK IDTA أو آليات قانونية أخرى.",
      "قد تضيف NivaDesk أو تستبدل أو تزيل subprocessors. سنحدث هذه الصفحة عند تغييرات جوهرية؛ قد يكون لدى business customers مع DPA حقوق إشعار إضافية.",
      "يتحمل العملاء مسؤولية personal data التي يضيفونها إلى NivaDesk وضمان الحقوق والإشعارات أو الموافقات اللازمة لعملائهم أو مورديهم أو موظفيهم أو أطرافهم الثالثة.",
      "للأسئلة حول هذه الصفحة أو providers أو data processing، تواصل مع EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom أو contact@nivadesk.co.uk."
    ]
  },
  "हिन्दी (Hindi)": {
    lastUpdatedLabel: "अंतिम अपडेट",
    introTitle: "Subprocessors",
    introParagraphs: [
      "यह पेज उन third-party service providers को समझाता है जिन्हें NivaDesk service host, operate, secure, support और improve करने के लिए use कर सकता है।",
      "NivaDesk EGGCRAFT LIMITED द्वारा संचालित है। Contact: contact@nivadesk.co.uk. यह page Privacy Policy, Terms of Service, Security Overview और Data Processing Agreement को support करता है।"
    ],
    sectionTitles: [
      "हम कौन हैं",
      "Subprocessor क्या है?",
      "हमारा approach",
      "Subprocessors कौन सा data process कर सकते हैं",
      "Current और expected subprocessors",
      "Core infrastructure providers",
      "Payment providers",
      "Analytics और diagnostics providers",
      "Support और communication providers",
      "International transfers",
      "Subprocessors में changes",
      "Customer responsibilities",
      "Contact"
    ],
    sectionSummaries: [
      "NivaDesk EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom द्वारा संचालित है। Privacy, data protection या subprocessors questions के लिए contact@nivadesk.co.uk पर संपर्क करें।",
      "Subprocessor एक third-party service provider है जो NivaDesk की ओर से personal data process कर सकता है ताकि service provide की जा सके, जैसे cloud infrastructure, authentication, payments या email providers।",
      "हम reasonable security, reliability और privacy standards support करने वाले trusted providers use करना चाहते हैं। Data केवल required services के लिए process होता है; हम personal data बेचते नहीं और workspace content advertising के लिए use नहीं करते।",
      "Service के अनुसार account data, workspace data, uploaded files metadata, payment/subscription information, technical data और communication data process हो सकते हैं।",
      "Expected providers में Firebase / Google Cloud, Apple, Google / Google Play, Stripe, email delivery, analytics, crash/error monitoring और customer support शामिल हो सकते हैं। Production providers, services और regions publication से पहले confirm होने चाहिए।",
      "Core infrastructure authentication, database, file storage, functions, hosting, sync, backup और security controls support कर सकता है। Service use करते हुए इस processing से opt out आमतौर पर संभव नहीं होता।",
      "Payment providers subscriptions, renewals, invoices, receipts, refunds, taxes, fraud checks और payment status process करते हैं। Apple/Google app store subscriptions manage कर सकते हैं; web billing Stripe से हो सकता है।",
      "Analytics और diagnostics website/product usage समझने, performance measure करने, bugs fix करने और reliability improve करने में मदद कर सकते हैं। Non-essential cookies required consent के बाद use होंगे।",
      "Email, help desk या support providers support requests, account messages, billing notices और service updates में मदद कर सकते हैं। कृपया unnecessary sensitive information न भेजें।",
      "कुछ subprocessors UK या EEA के बाहर data process कर सकते हैं। Required होने पर हम adequacy decisions, SCCs, UK IDTA या other lawful transfer mechanisms use करते हैं।",
      "NivaDesk service develop होने पर subprocessors add, replace या remove कर सकता है। Material changes पर यह page update होगा; DPA वाले business customers को extra notification rights हो सकते हैं।",
      "Customers NivaDesk में जो personal data add करते हैं उसके लिए responsible हैं और अपने clients, suppliers, employees या third parties के लिए required notices, rights या consents सुनिश्चित करने होंगे।",
      "इस page, providers या data processing पर questions के लिए EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom या contact@nivadesk.co.uk पर संपर्क करें।"
    ]
  }
};

const SUBPROCESSORS_LABELS: Partial<Record<StudioLanguage, string>> = {
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

const LOCALIZED_SUBPROCESSORS: Partial<Record<StudioLanguage, PrivacyPolicySection[]>> = Object.fromEntries(
  Object.entries(SUBPROCESSORS_DRAFTS).map(([language, copy]) => [
    language,
    buildLocalizedSubprocessors(copy as LocalizedSubprocessorsDraft)
  ])
) as Partial<Record<StudioLanguage, PrivacyPolicySection[]>>;

export function getSubprocessorsSections(language: StudioLanguage | string | null | undefined) {
  const normalized = language as StudioLanguage;
  return LOCALIZED_SUBPROCESSORS[normalized] ?? SUBPROCESSORS_SECTIONS;
}

export function getSubprocessorsLastUpdatedLabel(language: StudioLanguage | string | null | undefined) {
  return SUBPROCESSORS_LABELS[language as StudioLanguage] ?? "Last updated";
}
