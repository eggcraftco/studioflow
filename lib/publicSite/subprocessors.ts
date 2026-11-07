import type { PrivacyPolicySection } from "@/lib/publicSite/privacyPolicy";
import type { StudioLanguage } from "@/lib/studioflow/language";

// NIVADESK_HUKUK.md H-02 (narrow fix, separate from the v2 rewrite): sections 5, 5A and 5B list the providers
// NivaDesk uses today, with locations; the generic rows for tools NivaDesk does not use (crash reporting, help desk)
// are gone. Sections 1-4 and 6-13, the DPA and the Terms are unchanged. The date is the publication day:
// scripts/check-subprocessors-h02.mts --publish-date "<d Month yyyy>" must pass on release day.
export const SUBPROCESSORS_LAST_UPDATED = "7 November 2026";

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
      "NivaDesk is operated by EGGCRAFT LIMITED, 141d Randolph Avenue, London, W9 1DN, United Kingdom.",
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
      "technical data, such as IP address, device type, app version, logs, diagnostics, and security events;",
      "communication data, such as support requests, transactional emails, and service notifications."
    ]
  },
  {
    title: "5. Subprocessors for the data you keep in NivaDesk",
    paragraphs: [
      "These providers process personal data that our customers keep in their NivaDesk workspaces, on our behalf, for the purposes shown for each. A provider marked \"on trial\" processes data only for the workspaces where we have turned that feature on."
    ],
    subsections: [
      {
        title: "Google Cloud and Firebase",
        paragraphs: [
          "Purpose: hosting, the database (Cloud Firestore), file storage, server functions, sign-in (Firebase Authentication), push notifications (Firebase Cloud Messaging), malware scanning of uploaded files, server logs and database backups.",
          "Data: the content of your workspace, uploaded files and their metadata, the text of notifications, and technical logs.",
          "Location: the database, file storage, server functions, malware scanning and database backups are in Google Cloud's London region (europe-west2); sign-in runs in the United States, and push messaging and server logs run on Google's global infrastructure, including the United States."
        ]
      },
      {
        title: "Google Cloud Vision",
        paragraphs: [
          "Purpose: reading the text of receipts and documents you upload or attach, to match them to bank transactions.",
          "Data: the images of those receipts and documents.",
          "Location: Google's global infrastructure."
        ]
      },
      {
        title: "Google document viewer (Android app)",
        paragraphs: [
          "Role: a Google service, provided under Google's terms, that our Android app uses to show PDF previews.",
          "Purpose: showing a preview when you open a PDF file in our Android app; Google receives a link to the file and opens the file to display it.",
          "Data: the PDF files you preview in the Android app.",
          "Location: Google's global infrastructure."
        ]
      },
      {
        title: "Hostinger",
        paragraphs: [
          "Purpose: sending e-mails, including the e-mails NivaDesk sends to your customers when you use features that send them (for example order status updates and booking confirmations).",
          "Data: names, e-mail addresses, e-mail content and delivery logs.",
          "Location: Hostinger's data centres; e-mail is stored in Europe (France and Germany)."
        ]
      },
      {
        title: "Cloudflare",
        paragraphs: [
          "Purpose: the network in front of the pages your customers open from NivaDesk links (customer pages, tracking, estimates, files and payment pages), on nivadesk.app addresses and on your own custom domain.",
          "Data: IP addresses and request data of the people who open those pages.",
          "Location: Cloudflare's global network, including the United States."
        ]
      },
      {
        title: "17TRACK",
        paragraphs: [
          "Purpose: following parcels so that NivaDesk can show delivery status.",
          "Data: tracking numbers and carrier codes only.",
          "Location: 17TRACK's servers in the United States; 17TRACK operates from Singapore and China."
        ]
      },
      {
        // Twilio SMS legal texts (7 Nov 2026, NIVADESK_HUKUK.md O-18; owner approval pending): provider entities, the
        // real message content, Twilio's 30-day copy and the transfer mechanism. "(on trial)" goes on the day text
        // messages open to Pro and Team workspaces (ROLLOUT=general), not before.
        title: "Twilio (on trial)",
        paragraphs: [
          "Provider: Twilio Ireland Limited, our contracting party; messages are processed by Twilio Inc.",
          "Purpose: sending text messages to your customers about their orders, where your workspace switches this feature on.",
          "Data: your customer's phone number and the message (your business name, the stage of the order, a link to your customer's order page and a link to stop texts, or, for the first text, a link to confirm). Twilio's copy of each message is deleted 30 days after it is sent, and may remain in Twilio's internal systems for up to 30 more days.",
          "Location: United States. Twilio states that it is certified under the UK Extension to the EU-U.S. Data Privacy Framework; its data protection terms also include the UK International Data Transfer Addendum to the Standard Contractual Clauses."
        ]
      },
      {
        title: "Meta: WhatsApp Business Platform (on trial)",
        paragraphs: [
          "Purpose: receiving and sending your customers' WhatsApp messages in the customer inbox.",
          "Data: your customers' phone numbers and WhatsApp profile names, and the messages, photos and files exchanged.",
          "Location: Meta's global infrastructure, including the United States."
        ]
      }
    ]
  },
  {
    title: "5A. Service providers for NivaDesk's own activities",
    paragraphs: [
      "These providers support the processing NivaDesk does for itself as a controller: accounts and sign-in, our website and apps, billing, support and our own help assistant. Their role differs, as shown for each."
    ],
    subsections: [
      {
        title: "Google Cloud and Firebase",
        paragraphs: [
          "Role: our service provider, as in section 5, for accounts, sign-in, our website (hosted in Google Cloud's London region) and our own records."
        ]
      },
      {
        title: "Google Analytics for Firebase",
        paragraphs: [
          "Purpose: measuring how our iPhone, iPad, Mac and Android apps are used, and measuring our own app advertising.",
          "Data: an app instance identifier, device and app information, usage events and, where the device allows it, its advertising identifier.",
          "Location: Google's global infrastructure, including the United States."
        ]
      },
      {
        title: "Google reCAPTCHA",
        paragraphs: [
          "Role: Google provides it under the reCAPTCHA terms that apply to our use.",
          "Purpose: telling people from automated abuse on our website and web app.",
          "Data: device and browser data, IP address and interaction data.",
          "Location: Google's global infrastructure, including the United States."
        ]
      },
      {
        title: "Hostinger",
        paragraphs: [
          "Purpose: our own mailboxes, such as contact@nivadesk.co.uk, the e-mails we send about accounts, invitations and support, and a standby copy of our website.",
          "Data: names, e-mail addresses and e-mail content.",
          "Location: Hostinger's data centres; e-mail is stored in Europe (France and Germany)."
        ]
      },
      {
        title: "Cloudflare",
        paragraphs: [
          "Purpose: domain name services for our domains, and the copy of our help pages at docs.nivadesk.app.",
          "Data: IP addresses and request data.",
          "Location: Cloudflare's global network, including the United States."
        ]
      },
      {
        title: "OpenAI",
        paragraphs: [
          "Role: our service provider.",
          "Purpose: writing the answers of our website chat and of the help assistant in NivaDesk. This is separate from ChatGPT, and from Quick Reply, which uses your own OpenAI key (section 5B).",
          "Data: the questions and messages written in the chat or the assistant, and the parts of our guide needed for the answer.",
          "Location: the United States and other countries where OpenAI's providers operate."
        ]
      },
      {
        title: "Stripe",
        paragraphs: [
          "Role: Stripe processes payments for NivaDesk's web subscriptions; it acts as an independent controller for payment processing and as our processor for some billing services, as set out in Stripe's data processing terms.",
          "Data: billing contact details, such as the workspace owner's e-mail address and the workspace name, invoices and subscription data; NivaDesk never receives full card numbers.",
          "Location: Stripe's global infrastructure, including the United States."
        ]
      },
      {
        title: "Apple",
        paragraphs: [
          "Role: Apple sells and manages subscriptions bought in the App Store under its own terms and privacy policy; it also provides Sign in with Apple, app attestation and push notifications on Apple devices.",
          "Data: the identifiers and subscription status Apple shares with us, push tokens and the text of notifications delivered to Apple devices.",
          "Location: Apple's global infrastructure."
        ]
      },
      {
        title: "Google (Google Play and Google sign-in)",
        paragraphs: [
          "Role: Google sells and manages subscriptions bought on Google Play under its own terms and privacy policy, and provides Google sign-in and Play Integrity checks.",
          "Data: the identifiers, profile details and subscription status Google shares with us.",
          "Location: Google's global infrastructure."
        ]
      },
      {
        title: "Shopify",
        paragraphs: [
          "Role: Shopify bills subscriptions bought through the NivaDesk app in the Shopify App Store under its own terms.",
          "Data: the store identifier and subscription status Shopify shares with us.",
          "Location: Shopify's global infrastructure."
        ]
      }
    ]
  },
  {
    title: "5B. Services your workspace connects",
    paragraphs: [
      "When you or your workspace owner connect another service using your own account, NivaDesk sends data to that service or receives data from it on your instructions, only for the feature you use. You choose these services and have your own agreement with them; they handle the data under that agreement and their own terms and privacy policies, for example as your processor or as an independent controller. NivaDesk does not engage them as its subprocessors; if NivaDesk itself uses one of these providers to process your data, it is listed in section 5.",
      "These services include:"
    ],
    bullets: [
      "online stores and marketplaces: Etsy, eBay, Shopify, WooCommerce and Square;",
      "accounting software: QuickBooks (Intuit) and Xero;",
      "bank and payment feeds: TrueLayer (open banking) and PayPal;",
      "payment links: your own Stripe account, connected through Stripe Connect;",
      "shipping carriers: DHL Express and Royal Mail (Click & Drop);",
      "calendars and files: Google Calendar, Google Drive and Microsoft Outlook calendar;",
      "messaging: your Instagram professional account (Meta);",
      "AI: your own OpenAI API key for Quick Reply, and AI assistants you connect to NivaDesk, such as ChatGPT and Claude."
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
      "141d Randolph Avenue",
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
      "Güncel alt işleyenler ve hizmet sağlayıcılar",
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
      "NivaDesk, EGGCRAFT LIMITED tarafından 141d Randolph Avenue, London, W9 1DN, United Kingdom adresinden işletilir. Privacy, data protection veya subprocessors soruları için contact@nivadesk.co.uk adresinden ulaşabilirsiniz.",
      "Subprocessor, NivaDesk'in müşterilere hizmet sunmasına yardımcı olmak için NivaDesk adına personal data işleyebilen üçüncü taraf servis sağlayıcıdır. Örneğin cloud infrastructure, authentication, payments veya email providers kullanılabilir.",
      "Makul güvenlik, reliability ve privacy standartlarını destekleyen trusted providers kullanmayı hedefleriz. Subprocessorların verileri yalnızca bize hizmet sunmak için gerekli amaçlarla işlemesine izin veririz; personal data satmayız ve workspace content'i reklam için kullanmayız.",
      "Kullanılan servise göre account data, workspace data, uploaded files metadata, payment/subscription information, technical data ve communication data gibi sınırlı veri kategorileri işlenebilir.",
      "NivaDesk'te sakladığınız veriler için şunları kullanırız: Google Cloud ve Firebase (barındırma, veritabanı, dosyalar, giriş ve bildirimler; veritabanı, dosyalar ve sunucu işlevleri Londra'da, giriş ABD'de, bildirimler ve kayıtlar küresel altyapıda), Google Cloud Vision (fiş okuma), Google belge görüntüleyicisi (Android uygulamasında PDF önizlemesi), Hostinger (e-posta; Fransa ve Almanya'da saklanır), Cloudflare (müşteri sayfaları ve ödeme bağlantılarının önündeki ağ; küresel), 17TRACK (yalnız takip numaraları; sunucular ABD'de) ve denemede Twilio (SMS; ABD) ile Meta WhatsApp (mesajlar; küresel). Kendi işlerimiz için: Google (Firebase, uygulamalarımızda Google Analytics for Firebase, reCAPTCHA), Hostinger, Cloudflare, OpenAI (site sohbeti ve yardım asistanı; ABD), Stripe, Apple, Google Play ve Shopify. Kendi hesabınızla bağladığınız hizmetler (mağazalar ve pazar yerleri, QuickBooks, Xero, TrueLayer, PayPal, Stripe Connect, DHL Express, Royal Mail, takvim ve dosya hizmetleri, Instagram, Hızlı Yanıt için kendi OpenAI anahtarınız, ChatGPT ve Claude) onlarla yaptığınız kendi sözleşmenize göre çalışır. Her sağlayıcının rolü, verisi ve konumu İngilizce metindedir.",
      "Core infrastructure providers; authentication, database storage, file storage, serverless functions, hosting, sync, backup ve security controls için gerekli olabilir. Hizmet çalışırken bu processing’den genellikle opt out yapılamaz.",
      "Payment providers subscriptions, renewals, invoices, receipts, refunds, tax information, fraud checks ve payment status işler. Apple/Google üzerinden aboneliklerde ilişki bu platformlarla olabilir; web billing Stripe veya başka provider ile işlenebilir.",
      "Analytics ve diagnostics providers, website ve product usage anlamak, performance ölçmek, bugs düzeltmek ve reliability geliştirmek için kullanılabilir. Non-essential analytics/marketing cookies gerekli yerlerde consent sonrası kullanılır.",
      "Email, help desk veya customer support providers; support requests yanıtlamak, account messages göndermek, billing notices iletmek ve service updates sağlamak için kullanılabilir. Gereksiz sensitive information göndermekten kaçınılmalıdır.",
      "Bazı subprocessors verileri UK veya EEA dışında işleyebilir. Gerekli olduğunda adequacy decisions, standard contractual clauses, UK International Data Transfer Agreement veya diğer lawful transfer mechanisms kullanılır.",
      "NivaDesk hizmet geliştikçe subprocessors ekleyebilir, değiştirebilir veya kaldırabilir. Material değişikliklerde bu sayfa güncellenir; DPA olan business customers ek bildirim haklarına sahip olabilir.",
      "Customers, NivaDesk'e ekledikleri personal data için gerekli haklara sahip olduklarından ve kendi client/customer/supplier/employee verileri için gerekli privacy notices veya consents sağladıklarından sorumludur.",
      "Bu sayfa, providers veya NivaDesk'in data processing'i hakkında sorular için EGGCRAFT LIMITED, 141d Randolph Avenue, London, W9 1DN, United Kingdom ya da contact@nivadesk.co.uk üzerinden bize ulaşabilirsiniz."
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
      "Aktuelle Subprozessoren und Dienstleister",
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
      "NivaDesk wird von EGGCRAFT LIMITED, 141d Randolph Avenue, London, W9 1DN, United Kingdom betrieben. Für Datenschutz- oder Subprozessorfragen kontaktiere contact@nivadesk.co.uk.",
      "Ein Subprozessor ist ein Drittanbieter, der personenbezogene Daten im Auftrag von NivaDesk verarbeitet, um den Dienst bereitzustellen, etwa Cloud-Infrastruktur, Authentifizierung, Zahlungen oder E-Mail.",
      "Wir wollen vertrauenswürdige Anbieter mit angemessener Sicherheit, Zuverlässigkeit und Datenschutz verwenden. Daten dürfen nur für benötigte Dienste verarbeitet werden; wir verkaufen keine personenbezogenen Daten und nutzen Workspace-Inhalte nicht für Werbung.",
      "Je nach Dienst können Konto-, Workspace-, Datei-Metadaten, Zahlungs- und Abodaten, technische Daten sowie Kommunikationsdaten verarbeitet werden.",
      "Für die in NivaDesk gespeicherten Daten nutzen wir: Google Cloud und Firebase (Hosting, Datenbank, Dateien, Anmeldung und Benachrichtigungen; Datenbank, Dateien und Serverfunktionen in London, Anmeldung in den USA, Benachrichtigungen und Protokolle auf weltweiter Infrastruktur), Google Cloud Vision (Lesen von Belegen), den Google-Dokumentbetrachter (PDF-Vorschau in der Android-App), Hostinger (E-Mail; gespeichert in Frankreich und Deutschland), Cloudflare (Netzwerk vor Kundenseiten und Zahlungslinks; weltweit), 17TRACK (nur Sendungsnummern; Server in den USA) sowie im Test Twilio (SMS; USA) und Meta WhatsApp (Nachrichten; weltweit). Für unsere eigenen Tätigkeiten: Google (Firebase, Google Analytics for Firebase in unseren Apps, reCAPTCHA), Hostinger, Cloudflare, OpenAI (Website-Chat und Hilfeassistent; USA), Stripe, Apple, Google Play und Shopify. Dienste, die mit dem eigenen Konto verbunden werden (Shops und Marktplätze, QuickBooks, Xero, TrueLayer, PayPal, Stripe Connect, DHL Express, Royal Mail, Kalender- und Dateidienste, Instagram, der eigene OpenAI-Schlüssel für Quick Reply, ChatGPT und Claude), handeln nach der eigenen Vereinbarung mit ihnen. Rolle, Daten und Standort jedes Anbieters stehen im englischen Text.",
      "Kerninfrastruktur kann Authentifizierung, Datenbank, Dateispeicher, Functions, Hosting, Sync, Backup und Sicherheitskontrollen unterstützen. Ohne diese Verarbeitung kann der Dienst meist nicht genutzt werden.",
      "Zahlungsanbieter verarbeiten Abos, Verlängerungen, Rechnungen, Belege, Rückerstattungen, Steuerdaten, Betrugsprüfungen und Zahlungsstatus. App-Store-Zahlungen können direkt über Apple oder Google laufen.",
      "Analytics und Diagnose können Nutzung, Performance, Fehlerbehebung und Zuverlässigkeit unterstützen. Nicht notwendige Analytics- oder Marketing-Cookies werden nur mit erforderlicher Einwilligung genutzt.",
      "E-Mail-, Helpdesk- oder Supportanbieter können Supportanfragen, Account-Nachrichten, Abrechnungshinweise und Service-Updates unterstützen. Sende keine unnötigen sensiblen Informationen.",
      "Einige Subprozessoren können Daten außerhalb des UK oder EEA verarbeiten. Wo nötig nutzen wir geeignete Schutzmaßnahmen wie Angemessenheitsbeschlüsse, SCCs oder das UK IDTA.",
      "NivaDesk kann Subprozessoren hinzufügen, ersetzen oder entfernen. Diese Seite wird bei wesentlichen Änderungen aktualisiert; Business-Kunden mit DPA können zusätzliche Benachrichtigungsrechte haben.",
      "Kunden sind verantwortlich dafür, welche personenbezogenen Daten sie hinzufügen und ob sie die nötigen Rechte, Hinweise oder Einwilligungen für eigene Kunden, Lieferanten, Mitarbeiter oder Dritte haben.",
      "Für Fragen zu Subprozessoren oder Datenverarbeitung kontaktiere EGGCRAFT LIMITED, 141d Randolph Avenue, London, W9 1DN, United Kingdom oder contact@nivadesk.co.uk."
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
      "Sous-traitants et prestataires actuels",
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
      "NivaDesk est exploité par EGGCRAFT LIMITED, 141d Randolph Avenue, London, W9 1DN, United Kingdom. Pour les questions privacy, data protection ou subprocessors, contactez contact@nivadesk.co.uk.",
      "Un subprocessor est un prestataire tiers qui peut traiter des données personnelles pour NivaDesk afin de fournir le service, par exemple cloud infrastructure, authentification, paiements ou e-mail.",
      "Nous visons des prestataires fiables avec des standards raisonnables de sécurité, fiabilité et confidentialité. Les données ne doivent être traitées que pour fournir les services nécessaires; nous ne vendons pas les données et n'utilisons pas le workspace content pour la publicité.",
      "Selon le service, les données traitées peuvent inclure account data, workspace data, metadata de fichiers, paiement/abonnement, données techniques et communications.",
      "Pour les données que vous conservez dans NivaDesk, nous utilisons : Google Cloud et Firebase (hébergement, base de données, fichiers, connexion et notifications ; base de données, fichiers et fonctions serveur à Londres, connexion aux États-Unis, notifications et journaux sur une infrastructure mondiale), Google Cloud Vision (lecture des reçus), la visionneuse de documents de Google (aperçu des PDF dans l'application Android), Hostinger (e-mail ; stocké en France et en Allemagne), Cloudflare (réseau devant les pages clients et les liens de paiement ; mondial), 17TRACK (numéros de suivi uniquement ; serveurs aux États-Unis) et, à l'essai, Twilio (SMS ; États-Unis) et Meta WhatsApp (messages ; mondial). Pour nos propres activités : Google (Firebase, Google Analytics for Firebase dans nos applications, reCAPTCHA), Hostinger, Cloudflare, OpenAI (chat du site et assistant d'aide ; États-Unis), Stripe, Apple, Google Play et Shopify. Les services que vous connectez avec votre propre compte (boutiques et places de marché, QuickBooks, Xero, TrueLayer, PayPal, Stripe Connect, DHL Express, Royal Mail, calendriers et fichiers, Instagram, votre propre clé OpenAI pour Quick Reply, ChatGPT et Claude) agissent selon votre propre accord avec eux. Le texte anglais indique le rôle, les données et la localisation de chaque prestataire.",
      "Les fournisseurs d'infrastructure principale peuvent être nécessaires pour l'authentification, base de données, stockage fichiers, functions, hosting, sync, backup et contrôles sécurité. Les utilisateurs ne peuvent généralement pas s'en retirer tout en utilisant le service.",
      "Les prestataires de paiement traitent abonnements, renouvellements, factures, reçus, remboursements, taxes, contrôles fraude et statut de paiement. Les abonnements Apple/Google peuvent être gérés par ces plateformes.",
      "Les prestataires analytics et diagnostics peuvent aider à comprendre l'usage, mesurer la performance, corriger les bugs et améliorer la fiabilité. Les cookies non essentiels nécessitent le consentement lorsque requis.",
      "Les prestataires e-mail, help desk ou support peuvent aider à répondre aux demandes, envoyer messages de compte, notices de facturation et mises à jour de service. Évitez d'envoyer des informations sensibles inutiles.",
      "Certains subprocessors peuvent traiter des données hors du Royaume-Uni ou de l'EEE. Si nécessaire, nous utilisons des garanties appropriées comme décisions d'adéquation, SCCs, UK IDTA ou autres mécanismes légaux.",
      "NivaDesk peut ajouter, remplacer ou supprimer des subprocessors. Cette page sera mise à jour lors de changements matériels; les clients business avec DPA peuvent avoir des droits de notification supplémentaires.",
      "Les clients décident quelles données personnelles ils ajoutent à NivaDesk et doivent disposer des droits, notices ou consentements requis pour leurs propres clients, fournisseurs, employés ou tiers.",
      "Pour toute question sur cette page, nos prestataires ou le traitement des données, contactez EGGCRAFT LIMITED, 141d Randolph Avenue, London, W9 1DN, United Kingdom ou contact@nivadesk.co.uk."
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
      "Subprocessor e fornitori attuali",
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
      "NivaDesk è gestito da EGGCRAFT LIMITED, 141d Randolph Avenue, London, W9 1DN, United Kingdom. Per privacy, protezione dati o subprocessor contatta contact@nivadesk.co.uk.",
      "Un subprocessor è un fornitore terzo che può trattare dati personali per conto di NivaDesk per aiutarci a fornire il servizio, ad esempio cloud infrastructure, autenticazione, pagamenti o email.",
      "Usiamo provider affidabili con standard ragionevoli di sicurezza, affidabilità e privacy. I dati sono trattati solo per i servizi necessari; non vendiamo dati personali e non usiamo workspace content per pubblicità.",
      "A seconda del servizio, possono essere trattati account data, workspace data, metadata dei file, informazioni pagamento/abbonamento, technical data e communication data.",
      "Per i dati che conservi in NivaDesk usiamo: Google Cloud e Firebase (hosting, database, file, accesso e notifiche; database, file e funzioni server a Londra, accesso negli Stati Uniti, notifiche e log su infrastruttura globale), Google Cloud Vision (lettura delle ricevute), il visualizzatore di documenti di Google (anteprima dei PDF nell'app Android), Hostinger (e-mail; conservata in Francia e Germania), Cloudflare (rete davanti alle pagine clienti e ai link di pagamento; globale), 17TRACK (solo numeri di tracciamento; server negli Stati Uniti) e, in prova, Twilio (SMS; Stati Uniti) e Meta WhatsApp (messaggi; globale). Per le nostre attività: Google (Firebase, Google Analytics for Firebase nelle nostre app, reCAPTCHA), Hostinger, Cloudflare, OpenAI (chat del sito e assistente di aiuto; Stati Uniti), Stripe, Apple, Google Play e Shopify. I servizi che colleghi con il tuo account (negozi e marketplace, QuickBooks, Xero, TrueLayer, PayPal, Stripe Connect, DHL Express, Royal Mail, calendari e file, Instagram, la tua chiave OpenAI per Quick Reply, ChatGPT e Claude) operano secondo il tuo accordo con loro. Il testo inglese indica ruolo, dati e luogo di ciascun fornitore.",
      "I fornitori core possono supportare autenticazione, database, file storage, functions, hosting, sync, backup e security controls. Di solito non è possibile opt out continuando a usare il servizio.",
      "I provider di pagamento trattano subscriptions, renewals, invoices, receipts, refunds, tax information, fraud checks e payment status. Apple o Google possono gestire abbonamenti app store; web billing può passare da Stripe.",
      "Analytics e diagnostica possono aiutare a capire usage, misurare performance, correggere bug e migliorare reliability. Cookie analytics/marketing non essenziali sono usati con consenso dove richiesto.",
      "Email, help desk o customer support providers possono gestire support requests, account messages, billing notices e service updates. Evita di inviare dati sensibili non necessari.",
      "Alcuni subprocessor possono trattare dati fuori da UK o EEA. Dove richiesto usiamo garanzie appropriate come adequacy decisions, SCCs, UK IDTA o altri meccanismi legali.",
      "NivaDesk può aggiungere, sostituire o rimuovere subprocessor. Questa pagina sarà aggiornata per modifiche materiali; clienti business con DPA possono avere ulteriori diritti di notifica.",
      "I clienti sono responsabili dei dati personali che aggiungono a NivaDesk e dei diritti, informative o consensi necessari per clienti, fornitori, dipendenti o altri terzi.",
      "Per domande su questa pagina, provider o data processing, contatta EGGCRAFT LIMITED, 141d Randolph Avenue, London, W9 1DN, United Kingdom oppure contact@nivadesk.co.uk."
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
      "Subprocesadores y proveedores actuales",
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
      "NivaDesk es operado por EGGCRAFT LIMITED, 141d Randolph Avenue, London, W9 1DN, United Kingdom. Para privacidad, protección de datos o subprocesadores contacta a contact@nivadesk.co.uk.",
      "Un subprocesador es un proveedor tercero que puede procesar datos personales en nombre de NivaDesk para prestar el servicio, como cloud infrastructure, autenticación, pagos o email.",
      "Buscamos proveedores confiables con estándares razonables de seguridad, fiabilidad y privacidad. Solo procesan datos para los servicios necesarios; no vendemos datos personales ni usamos workspace content para publicidad.",
      "Según el servicio, pueden procesarse account data, workspace data, metadata de archivos, información de pago/suscripción, technical data y communication data.",
      "Para los datos que guardas en NivaDesk usamos: Google Cloud y Firebase (alojamiento, base de datos, archivos, inicio de sesión y notificaciones; la base de datos, los archivos y las funciones de servidor están en Londres, el inicio de sesión en Estados Unidos, y las notificaciones y los registros en infraestructura global), Google Cloud Vision (lectura de recibos), el visor de documentos de Google (vista previa de PDF en la app de Android), Hostinger (correo electrónico; almacenado en Francia y Alemania), Cloudflare (red delante de las páginas para clientes y los enlaces de pago; global), 17TRACK (solo números de seguimiento; servidores en Estados Unidos) y, en prueba, Twilio (SMS; Estados Unidos) y Meta WhatsApp (mensajes; global). Para nuestras propias actividades: Google (Firebase, Google Analytics for Firebase en nuestras apps, reCAPTCHA), Hostinger, Cloudflare, OpenAI (chat del sitio y asistente de ayuda; Estados Unidos), Stripe, Apple, Google Play y Shopify. Los servicios que conectas con tu propia cuenta (tiendas y marketplaces, QuickBooks, Xero, TrueLayer, PayPal, Stripe Connect, DHL Express, Royal Mail, calendarios y archivos, Instagram, tu propia clave de OpenAI para Quick Reply, ChatGPT y Claude) actúan según tu propio acuerdo con ellos. El texto en inglés indica el papel, los datos y la ubicación de cada proveedor.",
      "Los proveedores core pueden soportar autenticación, database, file storage, functions, hosting, sync, backup y security controls. Normalmente no se puede optar fuera y seguir usando el servicio.",
      "Los proveedores de pago procesan subscriptions, renewals, invoices, receipts, refunds, tax information, fraud checks y payment status. Apple o Google pueden gestionar compras de app store; web billing puede usar Stripe.",
      "Analytics y diagnóstico pueden ayudar a entender uso, medir performance, corregir bugs y mejorar reliability. Cookies analytics/marketing no esenciales se usan con consentimiento donde sea requerido.",
      "Email, help desk o soporte pueden responder solicitudes, enviar account messages, billing notices y service updates. Evita enviar información sensible innecesaria.",
      "Algunos subprocesadores pueden procesar datos fuera de UK o EEA. Cuando sea necesario usamos garantías como adequacy decisions, SCCs, UK IDTA u otros mecanismos legales.",
      "NivaDesk puede añadir, reemplazar o eliminar subprocesadores. Actualizaremos esta página ante cambios materiales; clientes business con DPA pueden tener derechos adicionales de notificación.",
      "Los clientes son responsables de los datos personales que añaden a NivaDesk y de contar con derechos, avisos o consentimientos necesarios para sus propios clientes, proveedores, empleados o terceros.",
      "Para preguntas sobre esta página, proveedores o procesamiento de datos, contacta a EGGCRAFT LIMITED, 141d Randolph Avenue, London, W9 1DN, United Kingdom o contact@nivadesk.co.uk."
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
      "Subprocessadores e fornecedores atuais",
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
      "A NivaDesk é operada pela EGGCRAFT LIMITED, 141d Randolph Avenue, London, W9 1DN, United Kingdom. Para privacidade, proteção de dados ou subprocessadores contacte contact@nivadesk.co.uk.",
      "Um subprocessador é um fornecedor terceiro que pode tratar dados pessoais em nome da NivaDesk para ajudar a prestar o serviço, como cloud infrastructure, autenticação, pagamentos ou email.",
      "Procuramos fornecedores confiáveis com segurança, fiabilidade e privacidade razoáveis. Só tratam dados para os serviços necessários; não vendemos dados pessoais nem usamos workspace content para publicidade.",
      "Conforme o serviço, podem ser tratados account data, workspace data, metadata de ficheiros, informação de pagamento/subscrição, technical data e communication data.",
      "Para os dados que guarda na NivaDesk usamos: Google Cloud e Firebase (alojamento, base de dados, ficheiros, início de sessão e notificações; base de dados, ficheiros e funções de servidor em Londres, início de sessão nos Estados Unidos, notificações e registos em infraestrutura global), Google Cloud Vision (leitura de recibos), o visualizador de documentos da Google (pré-visualização de PDF na app Android), Hostinger (e-mail; guardado em França e na Alemanha), Cloudflare (rede à frente das páginas de clientes e das ligações de pagamento; global), 17TRACK (apenas números de seguimento; servidores nos Estados Unidos) e, em teste, Twilio (SMS; Estados Unidos) e Meta WhatsApp (mensagens; global). Para as nossas próprias atividades: Google (Firebase, Google Analytics for Firebase nas nossas apps, reCAPTCHA), Hostinger, Cloudflare, OpenAI (chat do site e assistente de ajuda; Estados Unidos), Stripe, Apple, Google Play e Shopify. Os serviços que liga com a sua própria conta (lojas e marketplaces, QuickBooks, Xero, TrueLayer, PayPal, Stripe Connect, DHL Express, Royal Mail, calendários e ficheiros, Instagram, a sua própria chave OpenAI para Quick Reply, ChatGPT e Claude) atuam segundo o seu próprio acordo com eles. O texto em inglês indica o papel, os dados e a localização de cada fornecedor.",
      "Fornecedores core podem suportar autenticação, database, file storage, functions, hosting, sync, backup e security controls. Normalmente não é possível optar fora e continuar a usar o serviço.",
      "Fornecedores de pagamento tratam subscriptions, renewals, invoices, receipts, refunds, tax information, fraud checks e payment status. Apple/Google podem gerir app store; web billing pode usar Stripe.",
      "Analytics e diagnóstico podem ajudar a entender uso, medir performance, corrigir bugs e melhorar reliability. Cookies não essenciais usam consentimento quando exigido.",
      "Email, help desk ou support providers podem responder pedidos, enviar account messages, billing notices e service updates. Evite enviar informação sensível desnecessária.",
      "Alguns subprocessadores podem tratar dados fora do UK ou EEA. Quando necessário usamos safeguards como adequacy decisions, SCCs, UK IDTA ou outros mecanismos legais.",
      "A NivaDesk pode adicionar, substituir ou remover subprocessadores. Esta página será atualizada em mudanças materiais; clientes business com DPA podem ter direitos adicionais de notificação.",
      "Clientes são responsáveis pelos dados pessoais que adicionam à NivaDesk e por terem direitos, avisos ou consentimentos necessários para clientes, fornecedores, empregados ou terceiros.",
      "Para perguntas sobre esta página, fornecedores ou tratamento de dados, contacte EGGCRAFT LIMITED, 141d Randolph Avenue, London, W9 1DN, United Kingdom ou contact@nivadesk.co.uk."
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
      "Текущие субпроцессоры и поставщики услуг",
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
      "NivaDesk управляется EGGCRAFT LIMITED, 141d Randolph Avenue, London, W9 1DN, United Kingdom. По вопросам privacy, data protection или subprocessors пишите на contact@nivadesk.co.uk.",
      "Subprocessor: сторонний provider, который может обрабатывать personal data от имени NivaDesk, чтобы помогать предоставлять сервис, например cloud infrastructure, authentication, payments или email.",
      "Мы стремимся использовать trusted providers с разумными security, reliability и privacy standards. Данные обрабатываются только для нужных services; мы не продаем personal data и не используем workspace content для рекламы.",
      "В зависимости от сервиса могут обрабатываться account data, workspace data, file metadata, payment/subscription information, technical data и communication data.",
      "Для данных, которые вы храните в NivaDesk, мы используем: Google Cloud и Firebase (хостинг, база данных, файлы, вход и уведомления; база данных, файлы и серверные функции находятся в Лондоне, вход — в США, уведомления и журналы — в глобальной инфраструктуре), Google Cloud Vision (чтение чеков), средство просмотра документов Google (предпросмотр PDF в приложении для Android), Hostinger (электронная почта; хранится во Франции и Германии), Cloudflare (сеть перед страницами для клиентов и платёжными ссылками; глобально), 17TRACK (только номера отслеживания; серверы в США), а также в пробном режиме Twilio (SMS; США) и Meta WhatsApp (сообщения; глобально). Для нашей собственной деятельности: Google (Firebase, Google Analytics for Firebase в наших приложениях, reCAPTCHA), Hostinger, Cloudflare, OpenAI (чат на сайте и помощник; США), Stripe, Apple, Google Play и Shopify. Сервисы, которые вы подключаете своей учётной записью (магазины и маркетплейсы, QuickBooks, Xero, TrueLayer, PayPal, Stripe Connect, DHL Express, Royal Mail, календари и файлы, Instagram, ваш собственный ключ OpenAI для Quick Reply, ChatGPT и Claude), действуют по вашему собственному соглашению с ними. Роль, данные и местоположение каждого поставщика указаны в английском тексте.",
      "Core infrastructure может поддерживать authentication, database, file storage, functions, hosting, sync, backup и security controls. Обычно нельзя отказаться от такой processing и продолжать использовать сервис.",
      "Payment providers обрабатывают subscriptions, renewals, invoices, receipts, refunds, taxes, fraud checks и payment status. Apple/Google могут управлять app store payments; web billing может идти через Stripe.",
      "Analytics и diagnostics помогают понимать usage, измерять performance, fixing bugs и improving reliability. Non-essential analytics/marketing cookies используются с consent, где требуется.",
      "Email, help desk или support providers могут обрабатывать support requests, account messages, billing notices и service updates. Не отправляйте ненужную sensitive information.",
      "Некоторые subprocessors могут обрабатывать данные за пределами UK или EEA. Где требуется, мы используем safeguards вроде adequacy decisions, SCCs, UK IDTA или других lawful mechanisms.",
      "NivaDesk может добавлять, заменять или удалять subprocessors. Эта страница обновляется при material changes; business customers с DPA могут иметь дополнительные notification rights.",
      "Клиенты отвечают за personal data, добавляемые в NivaDesk, и за rights, notices или consents для своих clients, suppliers, employees или third parties.",
      "По вопросам этой страницы, providers или data processing свяжитесь с EGGCRAFT LIMITED, 141d Randolph Avenue, London, W9 1DN, United Kingdom или contact@nivadesk.co.uk."
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
      "現在のサブプロセッサとサービス提供者",
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
      "NivaDesk は EGGCRAFT LIMITED, 141d Randolph Avenue, London, W9 1DN, United Kingdom が運営します。privacy、data protection、subprocessors に関する質問は contact@nivadesk.co.uk へご連絡ください。",
      "Subprocessor は、NivaDesk がサービス提供のために personal data を委託処理する第三者 provider です。例として cloud infrastructure、authentication、payments、email providers があります。",
      "当社は合理的な security、reliability、privacy standards を支援する trusted providers を利用することを目指します。personal data は必要なサービス目的のみに処理され、販売や workspace content の広告利用はしません。",
      "サービスに応じて account data、workspace data、uploaded file metadata、payment/subscription information、technical data、communication data が処理される場合があります。",
      "NivaDesk に保存するデータについて、次の事業者を利用しています：Google Cloud と Firebase（ホスティング、データベース、ファイル、ログイン、通知。データベース、ファイル、サーバー機能はロンドン、ログインは米国、通知とログはグローバルなインフラ）、Google Cloud Vision（レシートの読み取り）、Google のドキュメントビューア（Android アプリでの PDF プレビュー）、Hostinger（メール。フランスとドイツに保存）、Cloudflare（顧客向けページと支払いリンクの前段のネットワーク。グローバル）、17TRACK（追跡番号のみ。サーバーは米国）、試験運用中の Twilio（SMS。米国）と Meta WhatsApp（メッセージ。グローバル）。当社自身の業務のために：Google（Firebase、アプリ内の Google Analytics for Firebase、reCAPTCHA）、Hostinger、Cloudflare、OpenAI（サイトのチャットとヘルプアシスタント。米国）、Stripe、Apple、Google Play、Shopify。ご自身のアカウントで接続するサービス（ストアとマーケットプレイス、QuickBooks、Xero、TrueLayer、PayPal、Stripe Connect、DHL Express、Royal Mail、カレンダーとファイル、Instagram、Quick Reply 用のご自身の OpenAI キー、ChatGPT、Claude）は、お客様とそのサービスとの契約に基づいて動作します。各事業者の役割、データ、所在地は英語版に記載しています。",
      "Core infrastructure は authentication、database、file storage、functions、hosting、sync、backup、security controls を支援します。通常、サービス利用中にこの processing から opt out できません。",
      "Payment providers は subscriptions、renewals、invoices、receipts、refunds、taxes、fraud checks、payment status を処理します。Apple/Google の購入はそれぞれの platform が管理する場合があります。",
      "Analytics と diagnostics は usage、performance、bug fixing、reliability improvement を支援します。non-essential analytics/marketing cookies は必要な場合 consent 後に使用されます。",
      "Email、help desk、customer support providers は support requests、account messages、billing notices、service updates を支援します。不要な sensitive information を送らないでください。",
      "一部 subprocessors は UK または EEA 外でデータを処理する場合があります。必要な場合、adequacy decisions、SCCs、UK IDTA などの safeguards を利用します。",
      "NivaDesk は subprocessors を追加、置換、削除する場合があります。material changes がある場合このページを更新し、DPA のある business customers には追加通知権がある場合があります。",
      "顧客は NivaDesk に追加する personal data と、自身の clients、suppliers、employees、third parties に必要な rights、notices、consents について責任を負います。",
      "このページ、providers、data processing については EGGCRAFT LIMITED, 141d Randolph Avenue, London, W9 1DN, United Kingdom または contact@nivadesk.co.uk までご連絡ください。"
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
      "当前子处理方和服务提供商",
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
      "NivaDesk 由 EGGCRAFT LIMITED, 141d Randolph Avenue, London, W9 1DN, United Kingdom 运营。隐私、数据保护或 subprocessors 问题请联系 contact@nivadesk.co.uk。",
      "Subprocessor 是代表 NivaDesk 处理 personal data 以帮助提供服务的第三方 provider，例如 cloud infrastructure、authentication、payments 或 email providers。",
      "我们目标是使用具备合理安全、可靠性和隐私标准的 trusted providers。数据仅为提供必要服务而处理；我们不出售 personal data，也不将 workspace content 用于广告。",
      "根据服务不同，可能处理 account data、workspace data、uploaded files metadata、payment/subscription information、technical data 和 communication data。",
      "对于您保存在 NivaDesk 中的数据，我们使用：Google Cloud 和 Firebase（托管、数据库、文件、登录和通知；数据库、文件和服务器函数位于伦敦，登录在美国，通知和日志在全球基础设施上）、Google Cloud Vision（读取收据）、Google 文档查看器（Android 应用中的 PDF 预览）、Hostinger（电子邮件；存储在法国和德国）、Cloudflare（客户页面和付款链接前端的网络；全球）、17TRACK（仅跟踪号码；服务器在美国），以及试用中的 Twilio（短信；美国）和 Meta WhatsApp（消息；全球）。用于我们自身的活动：Google（Firebase、我们应用中的 Google Analytics for Firebase、reCAPTCHA）、Hostinger、Cloudflare、OpenAI（网站聊天和帮助助手；美国）、Stripe、Apple、Google Play 和 Shopify。您用自己的账户连接的服务（商店和电商平台、QuickBooks、Xero、TrueLayer、PayPal、Stripe Connect、DHL Express、Royal Mail、日历和文件、Instagram、用于 Quick Reply 的您自己的 OpenAI 密钥、ChatGPT 和 Claude）按照您与它们之间的协议运作。英文文本列出了每个提供商的角色、数据和位置。",
      "核心基础设施可支持 authentication、database、file storage、functions、hosting、sync、backup 和 security controls。通常无法在继续使用服务的同时选择退出该 processing。",
      "Payment providers 处理 subscriptions、renewals、invoices、receipts、refunds、taxes、fraud checks 和 payment status。Apple/Google 购买可能由对应平台管理，web billing 可通过 Stripe。",
      "Analytics 和 diagnostics 可帮助了解 usage、衡量 performance、修复 bugs、提升 reliability。非必要 analytics/marketing cookies 在法律要求时仅经 consent 使用。",
      "Email、help desk 或 support providers 可用于回复 support requests、发送 account messages、billing notices 和 service updates。请避免发送不必要的 sensitive information。",
      "部分 subprocessors 可能在 UK 或 EEA 之外处理数据。需要时，我们使用 adequacy decisions、SCCs、UK IDTA 或其他 lawful transfer mechanisms。",
      "NivaDesk 可能添加、替换或移除 subprocessors。重大变更时会更新本页面；有 DPA 的 business customers 可能享有额外通知权。",
      "客户负责决定添加到 NivaDesk 的 personal data，并确保对自身 clients、customers、suppliers、employees 或 third parties 具备必要 rights、notices 或 consents。",
      "如对本页面、providers 或 data processing 有疑问，请联系 EGGCRAFT LIMITED, 141d Randolph Avenue, London, W9 1DN, United Kingdom 或 contact@nivadesk.co.uk。"
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
      "المعالجون الفرعيون ومزودو الخدمات الحاليون",
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
      "تدير EGGCRAFT LIMITED خدمة NivaDesk من 141d Randolph Avenue, London, W9 1DN, United Kingdom. لأسئلة الخصوصية أو حماية البيانات أو subprocessors تواصل عبر contact@nivadesk.co.uk.",
      "Subprocessor هو مزود خدمة خارجي قد يعالج personal data نيابة عن NivaDesk لمساعدتنا في تقديم الخدمة، مثل cloud infrastructure أو authentication أو payments أو email providers.",
      "نهدف إلى استخدام trusted providers يدعمون security وreliability وprivacy standards معقولة. نعالج البيانات فقط للأغراض اللازمة، ولا نبيع personal data أو نستخدم workspace content للإعلانات.",
      "حسب الخدمة، قد تعالج فئات محدودة مثل account data وworkspace data وuploaded file metadata وpayment/subscription information وtechnical data وcommunication data.",
      "للبيانات التي تحتفظ بها في NivaDesk نستخدم: Google Cloud وFirebase (الاستضافة وقاعدة البيانات والملفات وتسجيل الدخول والإشعارات؛ قاعدة البيانات والملفات ووظائف الخادم في لندن، وتسجيل الدخول في الولايات المتحدة، والإشعارات والسجلات على بنية تحتية عالمية)، وGoogle Cloud Vision (قراءة الإيصالات)، وعارض المستندات من Google (معاينة ملفات PDF في تطبيق Android)، وHostinger (البريد الإلكتروني؛ يُخزَّن في فرنسا وألمانيا)، وCloudflare (الشبكة أمام صفحات العملاء وروابط الدفع؛ عالمية)، و17TRACK (أرقام التتبع فقط؛ الخوادم في الولايات المتحدة)، وفي مرحلة التجربة Twilio (الرسائل النصية؛ الولايات المتحدة) وMeta WhatsApp (الرسائل؛ عالمية). ولأنشطتنا الخاصة: Google (Firebase وGoogle Analytics for Firebase في تطبيقاتنا وreCAPTCHA) وHostinger وCloudflare وOpenAI (دردشة الموقع ومساعد المساعدة؛ الولايات المتحدة) وStripe وApple وGoogle Play وShopify. أما الخدمات التي تربطها بحسابك الخاص (المتاجر والأسواق الإلكترونية وQuickBooks وXero وTrueLayer وPayPal وStripe Connect وDHL Express وRoyal Mail وخدمات التقويم والملفات وInstagram ومفتاح OpenAI الخاص بك لـ Quick Reply وChatGPT وClaude) فتعمل وفق اتفاقك الخاص معها. يبيّن النص الإنجليزي دور كل مزود وبياناته وموقعه.",
      "قد تكون core infrastructure ضرورية للمصادقة وقاعدة البيانات وتخزين الملفات وfunctions والاستضافة وsync والنسخ الاحتياطي وsecurity controls. غالباً لا يمكن opt out مع استمرار استخدام الخدمة.",
      "تعالج payment providers الاشتراكات والتجديدات والفواتير والإيصالات والاستردادات والضرائب وفحوص الاحتيال وحالة الدفع. قد تدير Apple/Google مشتريات app store، وقد يستخدم web billing Stripe.",
      "قد تساعد analytics والتشخيص في فهم usage وقياس performance وإصلاح bugs وتحسين reliability. تستخدم cookies غير الضرورية بعد consent حيث يلزم.",
      "قد تساعد email وhelp desk وsupport providers في الرد على support requests وإرسال account messages وbilling notices وservice updates. تجنب إرسال sensitive information غير ضرورية.",
      "قد يعالج بعض subprocessors البيانات خارج UK أو EEA. عند الحاجة نستخدم safeguards مثل adequacy decisions أو SCCs أو UK IDTA أو آليات قانونية أخرى.",
      "قد تضيف NivaDesk أو تستبدل أو تزيل subprocessors. سنحدث هذه الصفحة عند تغييرات جوهرية؛ قد يكون لدى business customers مع DPA حقوق إشعار إضافية.",
      "يتحمل العملاء مسؤولية personal data التي يضيفونها إلى NivaDesk وضمان الحقوق والإشعارات أو الموافقات اللازمة لعملائهم أو مورديهم أو موظفيهم أو أطرافهم الثالثة.",
      "للأسئلة حول هذه الصفحة أو providers أو data processing، تواصل مع EGGCRAFT LIMITED, 141d Randolph Avenue, London, W9 1DN, United Kingdom أو contact@nivadesk.co.uk."
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
      "वर्तमान subprocessors और service providers",
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
      "NivaDesk EGGCRAFT LIMITED, 141d Randolph Avenue, London, W9 1DN, United Kingdom द्वारा संचालित है। Privacy, data protection या subprocessors questions के लिए contact@nivadesk.co.uk पर संपर्क करें।",
      "Subprocessor एक third-party service provider है जो NivaDesk की ओर से personal data process कर सकता है ताकि service provide की जा सके, जैसे cloud infrastructure, authentication, payments या email providers।",
      "हम reasonable security, reliability और privacy standards support करने वाले trusted providers use करना चाहते हैं। Data केवल required services के लिए process होता है; हम personal data बेचते नहीं और workspace content advertising के लिए use नहीं करते।",
      "Service के अनुसार account data, workspace data, uploaded files metadata, payment/subscription information, technical data और communication data process हो सकते हैं।",
      "NivaDesk में आप जो data रखते हैं, उसके लिए हम इनका उपयोग करते हैं: Google Cloud और Firebase (hosting, database, files, sign-in और notifications; database, files और server functions लंदन में, sign-in अमेरिका में, notifications और logs global infrastructure पर), Google Cloud Vision (receipts पढ़ना), Google का document viewer (Android app में PDF preview), Hostinger (email; फ़्रांस और जर्मनी में stored), Cloudflare (customer pages और payment links के आगे का network; global), 17TRACK (केवल tracking numbers; servers अमेरिका में), और trial में Twilio (SMS; अमेरिका) तथा Meta WhatsApp (messages; global)। हमारे अपने कामों के लिए: Google (Firebase, हमारे apps में Google Analytics for Firebase, reCAPTCHA), Hostinger, Cloudflare, OpenAI (website chat और help assistant; अमेरिका), Stripe, Apple, Google Play और Shopify। जो services आप अपने account से जोड़ते हैं (stores और marketplaces, QuickBooks, Xero, TrueLayer, PayPal, Stripe Connect, DHL Express, Royal Mail, calendar और file services, Instagram, Quick Reply के लिए आपकी अपनी OpenAI key, ChatGPT और Claude), वे उनके साथ आपके अपने agreement के अनुसार काम करती हैं। हर provider की role, data और location अंग्रेज़ी text में दी गई है।",
      "Core infrastructure authentication, database, file storage, functions, hosting, sync, backup और security controls support कर सकता है। Service use करते हुए इस processing से opt out आमतौर पर संभव नहीं होता।",
      "Payment providers subscriptions, renewals, invoices, receipts, refunds, taxes, fraud checks और payment status process करते हैं। Apple/Google app store subscriptions manage कर सकते हैं; web billing Stripe से हो सकता है।",
      "Analytics और diagnostics website/product usage समझने, performance measure करने, bugs fix करने और reliability improve करने में मदद कर सकते हैं। Non-essential cookies required consent के बाद use होंगे।",
      "Email, help desk या support providers support requests, account messages, billing notices और service updates में मदद कर सकते हैं। कृपया unnecessary sensitive information न भेजें।",
      "कुछ subprocessors UK या EEA के बाहर data process कर सकते हैं। Required होने पर हम adequacy decisions, SCCs, UK IDTA या other lawful transfer mechanisms use करते हैं।",
      "NivaDesk service develop होने पर subprocessors add, replace या remove कर सकता है। Material changes पर यह page update होगा; DPA वाले business customers को extra notification rights हो सकते हैं।",
      "Customers NivaDesk में जो personal data add करते हैं उसके लिए responsible हैं और अपने clients, suppliers, employees या third parties के लिए required notices, rights या consents सुनिश्चित करने होंगे।",
      "इस page, providers या data processing पर questions के लिए EGGCRAFT LIMITED, 141d Randolph Avenue, London, W9 1DN, United Kingdom या contact@nivadesk.co.uk पर संपर्क करें।"
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
