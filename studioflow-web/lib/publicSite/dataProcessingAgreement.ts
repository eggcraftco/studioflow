import type { PrivacyPolicySection } from "@/lib/publicSite/privacyPolicy";
import type { StudioLanguage } from "@/lib/studioflow/language";

export const DATA_PROCESSING_AGREEMENT_LAST_UPDATED = "13 May 2026";

export const DATA_PROCESSING_AGREEMENT_SECTIONS: PrivacyPolicySection[] = [
  {
    title: "Data Processing Agreement",
    paragraphs: [
      "This Data Processing Agreement forms part of the Terms of Service between EGGCRAFT LIMITED, trading as NivaDesk, and the customer using NivaDesk.",
      "This DPA supports UK GDPR and EU GDPR compliance for customer personal data processed through NivaDesk."
    ]
  },
  {
    title: "1. Parties",
    paragraphs: [
      "This Data Processing Agreement (\"DPA\") is entered into between:",
      "Customer: the individual, company, organisation, workspace owner, or other legal entity using NivaDesk (\"Customer\", \"you\", or \"your\").",
      "Processor: EGGCRAFT LIMITED, a company registered in England and Wales, operating NivaDesk (\"NivaDesk\", \"we\", \"us\", or \"our\").",
      "EGGCRAFT LIMITED\n141 Randolph Avenue\nLondon\nW9 1DN\nUnited Kingdom\nEmail: nivadesk@gmail.com"
    ]
  },
  {
    title: "2. Relationship with other terms",
    paragraphs: [
      "This DPA forms part of and is incorporated into the NivaDesk Terms of Service or any other written agreement between the parties that governs the use of NivaDesk (the \"Agreement\").",
      "If there is a conflict between this DPA and the Agreement regarding the processing of Customer Personal Data, this DPA will apply to that processing."
    ]
  },
  {
    title: "3. Definitions",
    paragraphs: ["For the purposes of this DPA:"],
    bullets: [
      "Applicable Data Protection Laws: UK GDPR, EU GDPR, the UK Data Protection Act 2018, the Privacy and Electronic Communications Regulations, and any other data protection laws that apply to the processing of Customer Personal Data.",
      "Customer Personal Data: personal data submitted to, stored in, or processed through NivaDesk by or on behalf of Customer, including personal data relating to Customer's clients, customers, team members, suppliers, contractors, or other third parties.",
      "Controller: the party that determines the purposes and means of processing personal data.",
      "Processor: the party that processes personal data on behalf of the Controller.",
      "Subprocessor: a third party engaged by NivaDesk to process Customer Personal Data on behalf of Customer.",
      "Services: the NivaDesk website, web app, mobile apps, desktop apps, software, storage, sync, support, and related services."
    ]
  },
  {
    title: "4. Roles of the parties",
    paragraphs: [
      "For Customer Personal Data, Customer is the Controller and NivaDesk is the Processor, unless the parties have agreed otherwise in writing.",
      "Customer is responsible for ensuring that it has a lawful basis and all required permissions, notices, and rights to collect, use, upload, disclose, and process Customer Personal Data through NivaDesk.",
      "NivaDesk will process Customer Personal Data only on Customer's documented instructions, including as set out in the Agreement, this DPA, Customer's use of the Services, and Customer's configuration of workspace settings and integrations."
    ]
  },
  {
    title: "5. Scope and purpose of processing",
    paragraphs: [
      "NivaDesk processes Customer Personal Data to provide, maintain, secure, support, and improve the Services.",
      "This may include:"
    ],
    bullets: [
      "creating and managing workspaces, accounts, roles, and permissions;",
      "storing and syncing orders, client records, tasks, notes, files, timelines, and workflow information;",
      "providing file upload, download, preview, metadata, and offline queue features;",
      "providing support, troubleshooting, security monitoring, abuse prevention, backups, and audit logs;",
      "processing plan limits, billing status, and subscription access;",
      "enabling optional integrations or connected features chosen by Customer."
    ]
  },
  {
    title: "6. Categories of data subjects",
    paragraphs: ["Customer Personal Data may relate to the following categories of data subjects:"],
    bullets: [
      "Customer's clients or customers;",
      "Customer's team members, employees, contractors, or workspace users;",
      "suppliers, couriers, collaborators, or business contacts;",
      "individuals referenced in orders, notes, tasks, files, addresses, communications, or workflow records."
    ]
  },
  {
    title: "7. Categories of personal data",
    paragraphs: ["Depending on how Customer uses NivaDesk, Customer Personal Data may include:"],
    bullets: [
      "names, email addresses, phone numbers, postal addresses, and contact details;",
      "order details, customer notes, delivery dates, workflow status, tasks, reminders, and history logs;",
      "uploaded files, images, PDFs, documents, design files, attachments, and related metadata;",
      "workspace roles, activity records, audit events, user IDs, and access permissions;",
      "technical information needed for sync, support, security, and troubleshooting."
    ],
    subsections: [
      {
        title: "",
        paragraphs: [
          "Customer should not upload special category data, highly sensitive data, regulated data, or unnecessary personal data unless Customer has a lawful basis and has assessed whether NivaDesk is suitable for that data."
        ]
      }
    ]
  },
  {
    title: "8. Customer instructions",
    paragraphs: [
      "Customer instructs NivaDesk to process Customer Personal Data as necessary to provide the Services and as otherwise described in this DPA.",
      "Customer may provide additional instructions through account settings, workspace configuration, integrations, support requests, or written communication. NivaDesk is not required to follow instructions that, in our reasonable opinion, violate Applicable Data Protection Laws or create a security, legal, or operational risk."
    ]
  },
  {
    title: "9. Confidentiality",
    paragraphs: [
      "NivaDesk will ensure that people authorised to process Customer Personal Data are subject to appropriate confidentiality obligations, whether contractual or statutory.",
      "Access to Customer Personal Data will be limited to personnel and service providers who need such access to provide, secure, maintain, or support the Services."
    ]
  },
  {
    title: "10. Security measures",
    paragraphs: [
      "NivaDesk will implement appropriate technical and organisational measures designed to protect Customer Personal Data against accidental or unlawful destruction, loss, alteration, unauthorised disclosure, or access.",
      "These measures may include, as appropriate:"
    ],
    bullets: [
      "secure authentication and account access controls;",
      "workspace isolation and role-based permissions;",
      "restricted administrative access;",
      "encrypted connections where appropriate;",
      "cloud infrastructure security controls;",
      "file metadata and audit logging;",
      "monitoring, backups, and operational safeguards;",
      "procedures for handling security incidents and support access."
    ],
    subsections: [
      {
        title: "",
        paragraphs: [
          "NivaDesk's security measures may evolve over time, provided they do not materially reduce the overall level of protection for Customer Personal Data."
        ]
      }
    ]
  },
  {
    title: "11. Subprocessors",
    paragraphs: [
      "Customer authorises NivaDesk to engage Subprocessors to provide the Services. Subprocessors may include hosting providers, cloud storage providers, authentication services, payment processors, email delivery services, analytics, crash reporting, and support tools.",
      "NivaDesk will maintain a list of Subprocessors, which may be published on the NivaDesk website or provided on request.",
      "NivaDesk will require Subprocessors to protect Customer Personal Data under written terms that provide a level of protection substantially similar to this DPA, to the extent applicable to the services they provide.",
      "NivaDesk remains responsible for the performance of its Subprocessors to the extent required by Applicable Data Protection Laws."
    ]
  },
  {
    title: "12. Changes to Subprocessors",
    paragraphs: [
      "NivaDesk may add or replace Subprocessors from time to time. Where required by Applicable Data Protection Laws, NivaDesk will provide reasonable notice of material Subprocessor changes, for example by updating a Subprocessors page, sending notice, or providing in-app notice.",
      "Customer may object to a new Subprocessor on reasonable data protection grounds. If the parties cannot resolve the objection, Customer may stop using the affected Services or terminate the applicable paid subscription in accordance with the Agreement."
    ]
  },
  {
    title: "13. International transfers",
    paragraphs: [
      "Customer Personal Data may be processed in the United Kingdom, European Economic Area, United States, or other locations where NivaDesk or its Subprocessors operate.",
      "Where Customer Personal Data is transferred outside the UK or EEA and legal safeguards are required, NivaDesk will use appropriate transfer mechanisms such as adequacy decisions, Standard Contractual Clauses, the UK International Data Transfer Agreement or Addendum, or other lawful mechanisms."
    ]
  },
  {
    title: "14. Assistance with data subject rights",
    paragraphs: [
      "Taking into account the nature of the processing, NivaDesk will provide reasonable assistance to Customer in responding to data subject requests relating to Customer Personal Data, where Customer cannot reasonably fulfil the request through the Services.",
      "Customer is responsible for verifying the identity of the requester and deciding whether and how to respond to the request.",
      "If NivaDesk receives a request directly from a data subject relating to Customer Personal Data, NivaDesk may direct the requester to Customer unless legally required to respond otherwise."
    ]
  },
  {
    title: "15. Assistance with compliance",
    paragraphs: [
      "NivaDesk will provide reasonable assistance to Customer, taking into account the nature of the processing and information available to NivaDesk, with Customer's obligations relating to security, breach notification, data protection impact assessments, and consultation with supervisory authorities where required by Applicable Data Protection Laws.",
      "NivaDesk may charge reasonable fees for assistance that is outside the standard Services, unless such assistance is required because of NivaDesk's breach of this DPA."
    ]
  },
  {
    title: "16. Personal data breach",
    paragraphs: [
      "NivaDesk will notify Customer without undue delay after becoming aware of a personal data breach affecting Customer Personal Data.",
      "The notification will include information reasonably available to NivaDesk, such as the nature of the incident, categories of data affected, likely consequences, measures taken or proposed, and contact point for further information.",
      "NivaDesk's notification of a breach is not an admission of fault or liability."
    ]
  },
  {
    title: "17. Deletion and return of data",
    paragraphs: [
      "During the term of the Agreement, Customer may access, export, or delete certain Customer Personal Data through the Services where those features are available.",
      "After termination or expiry of the Agreement, NivaDesk will delete or return Customer Personal Data in accordance with the Agreement, the Privacy Policy, product functionality, backup practices, legal obligations, and technical limitations.",
      "Customer Personal Data may remain in backups for a limited period before deletion according to NivaDesk's backup retention processes. NivaDesk may retain data where required by law, dispute resolution, security, fraud prevention, accounting, or legitimate business obligations."
    ]
  },
  {
    title: "18. Audits and information",
    paragraphs: [
      "NivaDesk will make available information reasonably necessary to demonstrate compliance with this DPA, such as security summaries, policy documents, Subprocessor information, and responses to reasonable data protection questionnaires.",
      "Where required by Applicable Data Protection Laws, Customer may request an audit. Audits must be reasonable in scope, frequency, timing, and method, and must not compromise the security, confidentiality, or availability of NivaDesk or other customers' data.",
      "NivaDesk may satisfy audit requests by providing independent reports, certifications, written responses, or other appropriate evidence where available."
    ]
  },
  {
    title: "19. Customer responsibilities",
    paragraphs: ["Customer is responsible for:"],
    bullets: [
      "using NivaDesk in compliance with Applicable Data Protection Laws;",
      "providing required notices to data subjects;",
      "obtaining required consents or other lawful bases;",
      "configuring workspace permissions appropriately;",
      "ensuring team members use the Services lawfully and securely;",
      "not uploading unnecessary or unsuitable sensitive data;",
      "responding to data subject requests and regulatory communications relating to Customer Personal Data;",
      "maintaining appropriate backups of important business records where needed."
    ]
  },
  {
    title: "20. Liability",
    paragraphs: [
      "Each party's liability under this DPA is subject to the limitations and exclusions of liability in the Agreement, unless prohibited by Applicable Data Protection Laws.",
      "Nothing in this DPA limits liability where it would be unlawful to do so."
    ]
  },
  {
    title: "21. Term",
    paragraphs: [
      "This DPA remains in effect for as long as NivaDesk processes Customer Personal Data on behalf of Customer."
    ]
  },
  {
    title: "22. Governing law",
    paragraphs: [
      "This DPA is governed by the same governing law and jurisdiction as the Agreement, unless Applicable Data Protection Laws require otherwise."
    ]
  },
  {
    title: "Schedule 1 - Processing Details",
    subsections: [
      {
        title: "Subject matter",
        paragraphs: [
          "Provision of NivaDesk as a business management workspace for orders, clients, tasks, files, workflow, timelines, team access, and related services."
        ]
      },
      {
        title: "Duration",
        paragraphs: [
          "For the term of the Agreement and any period during which NivaDesk processes Customer Personal Data."
        ]
      },
      {
        title: "Purpose",
        paragraphs: [
          "To provide, maintain, secure, support, and improve NivaDesk and related services selected or configured by Customer."
        ]
      },
      {
        title: "Nature of processing",
        paragraphs: [
          "Hosting, storage, syncing, transmission, display, backup, retrieval, deletion, support, security monitoring, troubleshooting, and processing required for workspace features."
        ]
      },
      {
        title: "Categories of data subjects",
        paragraphs: [
          "Customer's clients, customers, team members, employees, contractors, suppliers, collaborators, business contacts, and other individuals included in Customer's workspace content."
        ]
      },
      {
        title: "Categories of data",
        paragraphs: [
          "Contact details, order records, addresses, notes, tasks, workflow data, dates, uploaded files, file metadata, role data, user activity, support information, and technical data."
        ]
      },
      {
        title: "Special categories",
        paragraphs: [
          "NivaDesk is not designed for special category data or highly sensitive regulated data unless Customer has assessed suitability and has a lawful basis."
        ]
      }
    ]
  },
  {
    title: "Schedule 2 - Indicative Technical and Organisational Measures",
    bullets: [
      "account authentication and access controls;",
      "workspace-level data separation and permissions;",
      "role-based access including owner, member, view-only, and workflow-only concepts where available;",
      "secure cloud infrastructure provided by trusted subprocessors;",
      "file upload limits, metadata, and access rules;",
      "audit logs or history logs for relevant workspace actions where available;",
      "encrypted transport where appropriate;",
      "administrative access limited to authorised personnel;",
      "incident response and support procedures;",
      "backup and recovery procedures appropriate to the Services."
    ]
  },
  {
    title: "Contact",
    paragraphs: [
      "For questions about this DPA, please contact:",
      "EGGCRAFT LIMITED",
      "141 Randolph Avenue",
      "London",
      "W9 1DN",
      "United Kingdom",
      "Email: nivadesk@gmail.com"
    ]
  }
];

type LocalizedDataProcessingAgreementDraft = {
  lastUpdatedLabel: string;
  introTitle: string;
  introParagraphs: string[];
  sectionTitles: string[];
  sectionSummaries: string[];
};

function buildLocalizedDataProcessingAgreement(copy: LocalizedDataProcessingAgreementDraft): PrivacyPolicySection[] {
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

const DATA_PROCESSING_AGREEMENT_DRAFTS: Partial<Record<StudioLanguage, LocalizedDataProcessingAgreementDraft>> = {
  Türkçe: {
    lastUpdatedLabel: "Son güncelleme",
    introTitle: "Veri İşleme Anlaşması",
    introParagraphs: [
      "Bu Veri İşleme Anlaşması, EGGCRAFT LIMITED tarafından işletilen NivaDesk ile NivaDesk'i kullanan müşteri arasındaki Terms of Service'in bir parçasıdır.",
      "Bu metin, NivaDesk üzerinden işlenen müşteri kişisel verileri için UK GDPR ve EU GDPR uyumluluğunu destekler."
    ],
    sectionTitles: [
      "1. Taraflar",
      "2. Diğer şartlarla ilişki",
      "3. Tanımlar",
      "4. Tarafların rolleri",
      "5. İşlemenin kapsamı ve amacı",
      "6. Veri sahibi kategorileri",
      "7. Kişisel veri kategorileri",
      "8. Müşteri talimatları",
      "9. Gizlilik",
      "10. Güvenlik önlemleri",
      "11. Subprocessorlar",
      "12. Subprocessor değişiklikleri",
      "13. Uluslararası aktarımlar",
      "14. Veri sahibi haklarına destek",
      "15. Uyumluluk desteği",
      "16. Kişisel veri ihlali",
      "17. Verinin silinmesi ve iadesi",
      "18. Denetimler ve bilgi",
      "19. Müşteri sorumlulukları",
      "20. Sorumluluk",
      "21. Süre",
      "22. Geçerli hukuk",
      "Schedule 1 - İşleme detayları",
      "Schedule 2 - Teknik ve organizasyonel önlemler",
      "İletişim"
    ],
    sectionSummaries: [
      "Müşteri, NivaDesk'i kullanan kişi veya kurumdur. İşleyici EGGCRAFT LIMITED'dir: 141 Randolph Avenue, London, W9 1DN, United Kingdom. E-posta: nivadesk@gmail.com.",
      "Bu DPA, NivaDesk Terms of Service'e dahildir. Customer Personal Data işlenmesi konusunda çelişki olursa bu DPA geçerli olur.",
      "Applicable Data Protection Laws, Customer Personal Data, Controller, Processor, Subprocessor ve Services kavramları bu anlaşma için tanımlanır.",
      "Customer Personal Data için müşteri controller, NivaDesk processor olarak hareket eder. NivaDesk veriyi müşterinin belgelenmiş talimatlarına göre işler.",
      "İşleme; workspace, hesap, rol, sipariş, müşteri kaydı, görev, not, dosya, timeline, destek, güvenlik, yedek ve plan erişimi özelliklerini sağlamak içindir.",
      "Veriler müşterilerin kendi müşterileri, ekip üyeleri, çalışanları, yüklenicileri, tedarikçileri, kuryeleri, iş ortakları veya kayıt içinde geçen diğer kişilerle ilgili olabilir.",
      "Veriler ad, e-posta, telefon, adres, sipariş bilgisi, not, görev, teslim tarihi, dosya, metadata, rol, aktivite kaydı ve teknik destek bilgisini içerebilir.",
      "Müşteri, NivaDesk'e hizmeti sağlamak için gerekli verileri işlemesi yönünde talimat verir. Hukuka aykırı veya riskli talimatlar uygulanmayabilir.",
      "Customer Personal Data'ya erişen kişiler uygun gizlilik yükümlülüklerine tabi tutulur ve erişim hizmeti sağlamak için gerekli olanlarla sınırlanır.",
      "NivaDesk; kimlik doğrulama, rol bazlı izinler, kısıtlı yönetici erişimi, güvenli bağlantılar, bulut güvenliği, loglar, yedekler ve olay prosedürleri gibi önlemler uygular.",
      "Müşteri, NivaDesk'in hizmeti sağlamak için hosting, depolama, kimlik doğrulama, ödeme, e-posta, analytics, hata izleme ve destek araçları gibi subprocessors kullanmasına izin verir.",
      "NivaDesk gerekli olduğunda önemli subprocessor değişiklikleri hakkında makul bildirim sağlar. Müşteri veri koruma gerekçeleriyle itiraz edebilir.",
      "Customer Personal Data UK, EEA, ABD veya hizmet sağlayıcıların çalıştığı diğer yerlerde işlenebilir. Gerekli olduğunda uygun aktarım mekanizmaları kullanılır.",
      "NivaDesk, müşterinin hizmet içinde makul olarak karşılayamadığı veri sahibi taleplerinde makul destek sağlar; talebe nasıl yanıt verileceğine müşteri karar verir.",
      "NivaDesk, güvenlik, ihlal bildirimi, DPIA ve otorite danışmaları gibi yükümlülüklerde elindeki bilgiler ölçüsünde makul destek sağlar.",
      "NivaDesk, Customer Personal Data'yı etkileyen bir kişisel veri ihlalinden haberdar olursa müşteriye gereksiz gecikme olmadan bildirim yapar.",
      "Müşteri hizmet süresince veriye erişebilir, dışa aktarabilir veya silebilir. Sona erme sonrası veri, anlaşma, Privacy Policy, yedekleme ve yasal gerekliliklere göre silinir veya iade edilir.",
      "NivaDesk, uyumu göstermek için güvenlik özetleri, politika belgeleri, subprocessor bilgisi ve makul anket yanıtları sağlayabilir.",
      "Müşteri, veri koruma yasalarına uygun kullanım, bildirimler, rızalar, izinler, ekip güvenliği, hassas veri yüklememe, taleplere yanıt ve gerekli yedeklerden sorumludur.",
      "Tarafların DPA kapsamındaki sorumluluğu, zorunlu hukuk aksini gerektirmedikçe Agreement içindeki sorumluluk sınırlamalarına tabidir.",
      "Bu DPA, NivaDesk müşteri adına Customer Personal Data işlediği sürece yürürlükte kalır.",
      "Bu DPA, veri koruma yasaları aksini gerektirmedikçe Agreement ile aynı hukuk ve yargı düzenine tabidir.",
      "İşleme detayları; NivaDesk'in sipariş, müşteri, görev, dosya, workflow, timeline ve ekip erişimi için sağlanmasını, süresini, amacını, veri kategorilerini ve özel kategori veri sınırlamasını açıklar.",
      "Teknik ve organizasyonel önlemler; hesap güvenliği, workspace ayrımı, rol bazlı erişim, güvenli bulut altyapısı, dosya limitleri, loglar, güvenli aktarım, sınırlı admin erişimi, olay yanıtı ve yedekleri kapsar.",
      "DPA soruları için: EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. E-posta: nivadesk@gmail.com."
    ]
  },
  Deutsch: {
    lastUpdatedLabel: "Zuletzt aktualisiert",
    introTitle: "Datenverarbeitungsvereinbarung",
    introParagraphs: [
      "Diese Datenverarbeitungsvereinbarung ist Teil der Nutzungsbedingungen zwischen EGGCRAFT LIMITED, das NivaDesk betreibt, und dem Kunden, der NivaDesk nutzt.",
      "Sie unterstützt die Einhaltung von UK GDPR und EU GDPR für Kundendaten, die über NivaDesk verarbeitet werden."
    ],
    sectionTitles: [
      "1. Parteien",
      "2. Verhältnis zu anderen Bedingungen",
      "3. Begriffe",
      "4. Rollen der Parteien",
      "5. Umfang und Zweck der Verarbeitung",
      "6. Kategorien betroffener Personen",
      "7. Kategorien personenbezogener Daten",
      "8. Weisungen des Kunden",
      "9. Vertraulichkeit",
      "10. Sicherheitsmaßnahmen",
      "11. Unterauftragsverarbeiter",
      "12. Änderungen bei Unterauftragsverarbeitern",
      "13. Internationale Übermittlungen",
      "14. Unterstützung bei Betroffenenrechten",
      "15. Unterstützung bei Compliance",
      "16. Verletzung personenbezogener Daten",
      "17. Löschung und Rückgabe von Daten",
      "18. Audits und Informationen",
      "19. Verantwortlichkeiten des Kunden",
      "20. Haftung",
      "21. Laufzeit",
      "22. Anwendbares Recht",
      "Anlage 1 - Verarbeitungsdetails",
      "Anlage 2 - Technische und organisatorische Maßnahmen",
      "Kontakt"
    ],
    sectionSummaries: [
      "Kunde ist die Person oder Organisation, die NivaDesk nutzt. Verarbeiter ist EGGCRAFT LIMITED: 141 Randolph Avenue, London, W9 1DN, United Kingdom. E-Mail: nivadesk@gmail.com.",
      "Diese DPA ist in die NivaDesk Terms of Service einbezogen. Bei Konflikten zur Verarbeitung von Customer Personal Data gilt diese DPA.",
      "Applicable Data Protection Laws, Customer Personal Data, Controller, Processor, Subprocessor und Services werden für diese Vereinbarung definiert.",
      "Für Customer Personal Data ist der Kunde Controller und NivaDesk Processor, sofern nichts anderes schriftlich vereinbart wurde.",
      "Die Verarbeitung dient der Bereitstellung, Wartung, Sicherung, Unterstützung und Verbesserung von NivaDesk, einschließlich Workspaces, Konten, Rollen, Bestellungen, Dateien, Support, Backups und Plan-Zugriff.",
      "Daten können Kunden des Kunden, Teammitglieder, Mitarbeitende, Auftragnehmer, Lieferanten, Kuriere, Partner und andere Personen in Workspace-Inhalten betreffen.",
      "Daten können Namen, E-Mails, Telefonnummern, Adressen, Bestellinformationen, Notizen, Aufgaben, Termine, Dateien, Metadaten, Rollen, Aktivitäten und technische Supportdaten umfassen.",
      "Der Kunde weist NivaDesk an, Daten zur Bereitstellung der Services zu verarbeiten. Rechtswidrige oder riskante Weisungen müssen nicht befolgt werden.",
      "Personen mit Zugriff auf Customer Personal Data unterliegen angemessenen Vertraulichkeitspflichten; Zugriff wird auf notwendige Personen und Anbieter beschränkt.",
      "NivaDesk nutzt angemessene technische und organisatorische Maßnahmen wie Authentifizierung, rollenbasierte Berechtigungen, beschränkten Admin-Zugriff, sichere Verbindungen, Cloud-Sicherheitskontrollen, Logs, Backups und Incident-Prozesse.",
      "Der Kunde erlaubt NivaDesk den Einsatz von Unterauftragsverarbeitern für Hosting, Speicherung, Authentifizierung, Zahlungen, E-Mail, Analytics, Fehlerüberwachung und Support.",
      "NivaDesk kann Unterauftragsverarbeiter ändern und stellt, soweit erforderlich, angemessene Hinweise bereit. Der Kunde kann aus Datenschutzgründen widersprechen.",
      "Customer Personal Data kann im UK, EWR, den USA oder anderen Standorten der Anbieter verarbeitet werden; erforderliche Schutzmechanismen werden genutzt.",
      "NivaDesk unterstützt den Kunden angemessen bei Betroffenenanfragen, soweit diese nicht direkt über die Services erfüllt werden können.",
      "NivaDesk unterstützt angemessen bei Sicherheits-, Breach-, DPIA- und Behördenpflichten, soweit die Informationen verfügbar sind.",
      "NivaDesk informiert den Kunden ohne unangemessene Verzögerung, wenn NivaDesk von einer Verletzung erfährt, die Customer Personal Data betrifft.",
      "Während der Laufzeit kann der Kunde Daten, soweit verfügbar, abrufen, exportieren oder löschen. Nach Ende werden Daten gemäß Agreement, Privacy Policy, Backups, Rechtspflichten und technischen Grenzen gelöscht oder zurückgegeben.",
      "NivaDesk kann Sicherheitsübersichten, Richtlinien, Subprocessor-Informationen und angemessene Fragebogenantworten zur Verfügung stellen.",
      "Der Kunde ist für rechtmäßige Nutzung, Hinweise, Rechtsgrundlagen, Berechtigungen, sichere Teamnutzung, Vermeidung unnötiger sensibler Daten, Anfragen und eigene Backups verantwortlich.",
      "Die Haftung aus dieser DPA unterliegt den Haftungsbeschränkungen des Agreement, soweit Datenschutzrecht nichts anderes verlangt.",
      "Diese DPA gilt, solange NivaDesk Customer Personal Data im Auftrag des Kunden verarbeitet.",
      "Diese DPA unterliegt demselben Recht und Gerichtsstand wie das Agreement, sofern Datenschutzrecht nichts anderes verlangt.",
      "Die Verarbeitungsdetails beschreiben Gegenstand, Dauer, Zweck, Art der Verarbeitung, betroffene Personen, Datenkategorien und Grenzen für besondere Kategorien.",
      "Die Maßnahmen umfassen Kontosicherheit, Workspace-Trennung, rollenbasierten Zugriff, Cloud-Sicherheit, Datei-Limits, Logs, verschlüsselte Übertragung, beschränkten Admin-Zugriff, Incident Response und Backups.",
      "Fragen zur DPA: EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. E-Mail: nivadesk@gmail.com."
    ]
  },
  Français: {
    lastUpdatedLabel: "Dernière mise à jour",
    introTitle: "Accord de traitement des données",
    introParagraphs: [
      "Cet accord de traitement des données fait partie des Conditions d'utilisation entre EGGCRAFT LIMITED, exploitant NivaDesk, et le client qui utilise NivaDesk.",
      "Il soutient la conformité UK GDPR et EU GDPR pour les données personnelles client traitées via NivaDesk."
    ],
    sectionTitles: [
      "1. Parties",
      "2. Relation avec les autres conditions",
      "3. Définitions",
      "4. Rôles des parties",
      "5. Portée et finalité du traitement",
      "6. Catégories de personnes concernées",
      "7. Catégories de données personnelles",
      "8. Instructions du client",
      "9. Confidentialité",
      "10. Mesures de sécurité",
      "11. Sous-traitants",
      "12. Changements de sous-traitants",
      "13. Transferts internationaux",
      "14. Assistance pour les droits des personnes",
      "15. Assistance à la conformité",
      "16. Violation de données personnelles",
      "17. Suppression et restitution des données",
      "18. Audits et informations",
      "19. Responsabilités du client",
      "20. Responsabilité",
      "21. Durée",
      "22. Droit applicable",
      "Annexe 1 - Détails du traitement",
      "Annexe 2 - Mesures techniques et organisationnelles",
      "Contact"
    ],
    sectionSummaries: [
      "Le client est la personne ou l'organisation utilisant NivaDesk. Le sous-traitant est EGGCRAFT LIMITED: 141 Randolph Avenue, London, W9 1DN, United Kingdom. E-mail: nivadesk@gmail.com.",
      "Ce DPA est intégré aux Terms of Service de NivaDesk. En cas de conflit sur le traitement des Customer Personal Data, ce DPA prévaut.",
      "Les notions Applicable Data Protection Laws, Customer Personal Data, Controller, Processor, Subprocessor et Services sont définies pour cet accord.",
      "Pour les Customer Personal Data, le client est controller et NivaDesk est processor, sauf accord écrit contraire.",
      "Le traitement sert à fournir, maintenir, sécuriser, soutenir et améliorer NivaDesk, y compris workspaces, comptes, rôles, commandes, fichiers, support, sauvegardes et accès aux plans.",
      "Les données peuvent concerner les clients du client, membres d'équipe, employés, prestataires, fournisseurs, coursiers, collaborateurs et autres personnes présentes dans le contenu workspace.",
      "Les données peuvent inclure noms, e-mails, téléphones, adresses, détails de commandes, notes, tâches, dates, fichiers, métadonnées, rôles, activité et données techniques de support.",
      "Le client demande à NivaDesk de traiter les données nécessaires aux Services. Les instructions illégales ou risquées peuvent être refusées.",
      "Les personnes autorisées à accéder aux Customer Personal Data sont soumises à des obligations de confidentialité et l'accès est limité aux besoins du service.",
      "NivaDesk applique des mesures telles qu'authentification, permissions par rôle, accès administrateur restreint, connexions sécurisées, contrôles cloud, journaux, sauvegardes et procédures d'incident.",
      "Le client autorise NivaDesk à utiliser des sous-traitants pour l'hébergement, le stockage, l'authentification, les paiements, l'e-mail, l'analytics, le monitoring d'erreurs et le support.",
      "NivaDesk peut ajouter ou remplacer des sous-traitants et fournir un préavis raisonnable si la loi l'exige. Le client peut s'opposer pour des motifs de protection des données.",
      "Les Customer Personal Data peuvent être traitées au Royaume-Uni, dans l'EEE, aux États-Unis ou ailleurs chez les prestataires; les garanties nécessaires sont utilisées.",
      "NivaDesk fournit une assistance raisonnable pour les demandes des personnes lorsque le client ne peut pas les traiter directement via les Services.",
      "NivaDesk aide raisonnablement pour la sécurité, les notifications de violation, DPIA et consultations d'autorité, selon les informations disponibles.",
      "NivaDesk notifie le client sans retard injustifié après avoir pris connaissance d'une violation affectant les Customer Personal Data.",
      "Pendant la durée du contrat, le client peut accéder, exporter ou supprimer les données lorsque les fonctionnalités existent. Après expiration, les données sont supprimées ou restituées selon l'Agreement, la Privacy Policy, les sauvegardes, les obligations légales et les limites techniques.",
      "NivaDesk peut fournir des résumés de sécurité, documents de politique, informations sur les sous-traitants et réponses raisonnables aux questionnaires.",
      "Le client est responsable de l'usage légal, des notices, bases juridiques, permissions, sécurité des équipes, limitation des données sensibles, réponses aux demandes et sauvegardes nécessaires.",
      "La responsabilité au titre de ce DPA est soumise aux limites de responsabilité de l'Agreement sauf interdiction par la loi applicable.",
      "Ce DPA reste en vigueur tant que NivaDesk traite des Customer Personal Data pour le client.",
      "Ce DPA suit le même droit applicable et la même juridiction que l'Agreement, sauf exigence contraire des lois de protection des données.",
      "Les détails du traitement couvrent l'objet, la durée, le but, la nature, les personnes concernées, les catégories de données et les limites pour données sensibles.",
      "Les mesures couvrent sécurité de compte, séparation workspace, accès par rôle, sécurité cloud, limites de fichiers, journaux, transport sécurisé, accès admin limité, réponse aux incidents et sauvegardes.",
      "Questions DPA: EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. E-mail: nivadesk@gmail.com."
    ]
  }
};

const DATA_PROCESSING_AGREEMENT_LABELS: Partial<Record<StudioLanguage, string>> = {
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

const DATA_PROCESSING_AGREEMENT_TRANSLATION_BASE: Record<Exclude<StudioLanguage, "English" | "Türkçe" | "Deutsch" | "Français">, LocalizedDataProcessingAgreementDraft> = {
  Italiano: {
    lastUpdatedLabel: "Ultimo aggiornamento",
    introTitle: "Accordo sul trattamento dei dati",
    introParagraphs: [
      "Questo Accordo sul trattamento dei dati fa parte dei Termini di Servizio tra EGGCRAFT LIMITED, che gestisce NivaDesk, e il cliente che usa NivaDesk.",
      "Supporta la conformità UK GDPR ed EU GDPR per i dati personali del cliente trattati tramite NivaDesk."
    ],
    sectionTitles: [
      "1. Parti",
      "2. Rapporto con altri termini",
      "3. Definizioni",
      "4. Ruoli delle parti",
      "5. Ambito e finalità del trattamento",
      "6. Categorie di interessati",
      "7. Categorie di dati personali",
      "8. Istruzioni del cliente",
      "9. Riservatezza",
      "10. Misure di sicurezza",
      "11. Subprocessor",
      "12. Modifiche ai subprocessor",
      "13. Trasferimenti internazionali",
      "14. Assistenza per i diritti degli interessati",
      "15. Assistenza alla conformità",
      "16. Violazione dei dati personali",
      "17. Cancellazione e restituzione dei dati",
      "18. Audit e informazioni",
      "19. Responsabilità del cliente",
      "20. Responsabilità legale",
      "21. Durata",
      "22. Legge applicabile",
      "Allegato 1 - Dettagli del trattamento",
      "Allegato 2 - Misure tecniche e organizzative",
      "Contatto"
    ],
    sectionSummaries: [
      "Il cliente è la persona o organizzazione che usa NivaDesk. Il responsabile del trattamento è EGGCRAFT LIMITED: 141 Randolph Avenue, London, W9 1DN, United Kingdom. Email: nivadesk@gmail.com.",
      "Questo DPA è incorporato nei Terms of Service di NivaDesk. In caso di conflitto sul trattamento dei Customer Personal Data, prevale questo DPA.",
      "Applicable Data Protection Laws, Customer Personal Data, Controller, Processor, Subprocessor e Services sono definiti per questo accordo.",
      "Per i Customer Personal Data il cliente è controller e NivaDesk è processor, salvo diverso accordo scritto.",
      "Il trattamento serve a fornire, mantenere, proteggere, supportare e migliorare NivaDesk, inclusi workspace, account, ruoli, ordini, file, supporto, backup e accesso ai piani.",
      "I dati possono riguardare clienti del cliente, membri del team, dipendenti, collaboratori, fornitori, corrieri, partner e altre persone presenti nei contenuti workspace.",
      "I dati possono includere nomi, email, telefoni, indirizzi, dettagli ordine, note, attività, date, file, metadati, ruoli, registri attività e dati tecnici di supporto.",
      "Il cliente istruisce NivaDesk a trattare i dati necessari per i Services. Istruzioni illegali o rischiose possono essere rifiutate.",
      "Le persone autorizzate ad accedere ai Customer Personal Data sono soggette a obblighi di riservatezza e l'accesso è limitato a chi ne ha bisogno.",
      "NivaDesk applica misure come autenticazione, permessi per ruolo, accesso amministrativo limitato, connessioni sicure, controlli cloud, log, backup e procedure per incidenti.",
      "Il cliente autorizza NivaDesk a usare subprocessor per hosting, storage, autenticazione, pagamenti, email, analytics, monitoraggio errori e supporto.",
      "NivaDesk può aggiungere o sostituire subprocessor e fornisce avviso ragionevole quando richiesto. Il cliente può opporsi per motivi di protezione dati.",
      "I Customer Personal Data possono essere trattati nel Regno Unito, SEE, Stati Uniti o altri paesi dei fornitori; saranno usate garanzie appropriate dove richiesto.",
      "NivaDesk fornisce assistenza ragionevole per richieste degli interessati quando il cliente non può gestirle direttamente tramite i Services.",
      "NivaDesk assiste ragionevolmente per sicurezza, notifiche di violazione, DPIA e consultazioni con autorità sulla base delle informazioni disponibili.",
      "NivaDesk avvisa il cliente senza indebito ritardo dopo essere venuta a conoscenza di una violazione che riguarda Customer Personal Data.",
      "Durante il contratto il cliente può accedere, esportare o cancellare dati dove disponibile. Dopo la fine, i dati sono cancellati o restituiti secondo Agreement, Privacy Policy, backup, obblighi legali e limiti tecnici.",
      "NivaDesk può fornire riepiloghi di sicurezza, policy, informazioni sui subprocessor e risposte ragionevoli a questionari.",
      "Il cliente è responsabile di uso conforme alla legge, informative, basi giuridiche, permessi, sicurezza del team, limitazione di dati sensibili, risposte alle richieste e backup necessari.",
      "La responsabilità sotto questo DPA è soggetta ai limiti dell'Agreement salvo quanto vietato dalla legge.",
      "Questo DPA resta valido finché NivaDesk tratta Customer Personal Data per conto del cliente.",
      "Questo DPA segue la stessa legge e giurisdizione dell'Agreement salvo diversa richiesta delle leggi sulla protezione dati.",
      "I dettagli del trattamento descrivono oggetto, durata, finalità, natura, interessati, categorie di dati e limiti sulle categorie speciali.",
      "Le misure includono sicurezza account, separazione workspace, accesso per ruolo, sicurezza cloud, limiti file, log, trasporto sicuro, accesso admin limitato, risposta incidenti e backup.",
      "Domande sul DPA: EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. Email: nivadesk@gmail.com."
    ]
  },
  "Español (Spanish)": {
    lastUpdatedLabel: "Última actualización",
    introTitle: "Acuerdo de tratamiento de datos",
    introParagraphs: [
      "Este Acuerdo de tratamiento de datos forma parte de los Términos del Servicio entre EGGCRAFT LIMITED, que opera NivaDesk, y el cliente que usa NivaDesk.",
      "Apoya el cumplimiento de UK GDPR y EU GDPR para los datos personales del cliente tratados a través de NivaDesk."
    ],
    sectionTitles: [
      "1. Partes",
      "2. Relación con otros términos",
      "3. Definiciones",
      "4. Roles de las partes",
      "5. Alcance y finalidad del tratamiento",
      "6. Categorías de interesados",
      "7. Categorías de datos personales",
      "8. Instrucciones del cliente",
      "9. Confidencialidad",
      "10. Medidas de seguridad",
      "11. Subprocesadores",
      "12. Cambios en subprocesadores",
      "13. Transferencias internacionales",
      "14. Ayuda con derechos de los interesados",
      "15. Ayuda de cumplimiento",
      "16. Brecha de datos personales",
      "17. Eliminación y devolución de datos",
      "18. Auditorías e información",
      "19. Responsabilidades del cliente",
      "20. Responsabilidad",
      "21. Duración",
      "22. Ley aplicable",
      "Anexo 1 - Detalles del tratamiento",
      "Anexo 2 - Medidas técnicas y organizativas",
      "Contacto"
    ],
    sectionSummaries: [
      "El cliente es la persona u organización que usa NivaDesk. El procesador es EGGCRAFT LIMITED: 141 Randolph Avenue, London, W9 1DN, United Kingdom. Email: nivadesk@gmail.com.",
      "Este DPA se incorpora a los Terms of Service de NivaDesk. Si hay conflicto sobre Customer Personal Data, este DPA prevalece.",
      "Applicable Data Protection Laws, Customer Personal Data, Controller, Processor, Subprocessor y Services se definen para este acuerdo.",
      "Para Customer Personal Data, el cliente es controller y NivaDesk es processor, salvo acuerdo escrito diferente.",
      "El tratamiento sirve para proporcionar, mantener, proteger, apoyar y mejorar NivaDesk, incluidos workspaces, cuentas, roles, pedidos, archivos, soporte, copias de seguridad y acceso a planes.",
      "Los datos pueden relacionarse con clientes del cliente, miembros del equipo, empleados, contratistas, proveedores, mensajeros, colaboradores y otras personas incluidas en el workspace.",
      "Los datos pueden incluir nombres, emails, teléfonos, direcciones, detalles de pedidos, notas, tareas, fechas, archivos, metadatos, roles, actividad y datos técnicos de soporte.",
      "El cliente instruye a NivaDesk para tratar los datos necesarios para los Services. Las instrucciones ilegales o riesgosas pueden rechazarse.",
      "Las personas autorizadas a acceder a Customer Personal Data están sujetas a confidencialidad y el acceso se limita a lo necesario.",
      "NivaDesk aplica medidas como autenticación, permisos por rol, acceso administrativo restringido, conexiones seguras, controles cloud, registros, copias de seguridad y procesos de incidentes.",
      "El cliente autoriza a NivaDesk a usar subprocesadores para hosting, almacenamiento, autenticación, pagos, email, analytics, monitoreo de errores y soporte.",
      "NivaDesk puede añadir o reemplazar subprocesadores y dará aviso razonable cuando sea requerido. El cliente puede objetar por motivos de protección de datos.",
      "Customer Personal Data puede tratarse en Reino Unido, EEE, Estados Unidos u otras ubicaciones de proveedores; se usarán salvaguardas adecuadas cuando sean necesarias.",
      "NivaDesk proporciona asistencia razonable para solicitudes de interesados cuando el cliente no pueda gestionarlas directamente mediante los Services.",
      "NivaDesk ayuda razonablemente con seguridad, notificaciones de brecha, DPIA y consultas con autoridades según la información disponible.",
      "NivaDesk notificará al cliente sin demora indebida después de conocer una brecha que afecte a Customer Personal Data.",
      "Durante el contrato, el cliente puede acceder, exportar o eliminar datos cuando esté disponible. Tras finalizar, los datos se eliminan o devuelven según Agreement, Privacy Policy, backups, obligaciones legales y límites técnicos.",
      "NivaDesk puede facilitar resúmenes de seguridad, políticas, información de subprocesadores y respuestas razonables a cuestionarios.",
      "El cliente es responsable del uso legal, avisos, bases jurídicas, permisos, seguridad del equipo, evitar datos sensibles innecesarios, responder solicitudes y mantener backups necesarios.",
      "La responsabilidad bajo este DPA está sujeta a los límites del Agreement salvo que la ley lo prohíba.",
      "Este DPA sigue vigente mientras NivaDesk trate Customer Personal Data por cuenta del cliente.",
      "Este DPA se rige por la misma ley y jurisdicción que el Agreement, salvo exigencia distinta de las leyes de protección de datos.",
      "Los detalles del tratamiento explican objeto, duración, finalidad, naturaleza, interesados, categorías de datos y límites sobre categorías especiales.",
      "Las medidas incluyen seguridad de cuenta, separación workspace, acceso por rol, seguridad cloud, límites de archivos, registros, transporte seguro, acceso admin limitado, respuesta a incidentes y backups.",
      "Preguntas sobre DPA: EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. Email: nivadesk@gmail.com."
    ]
  },
  Português: {
    lastUpdatedLabel: "Última atualização",
    introTitle: "Acordo de Tratamento de Dados",
    introParagraphs: [
      "Este Acordo de Tratamento de Dados faz parte dos Termos de Serviço entre a EGGCRAFT LIMITED, que opera o NivaDesk, e o cliente que usa o NivaDesk.",
      "Apoia a conformidade com UK GDPR e EU GDPR para dados pessoais do cliente tratados através do NivaDesk."
    ],
    sectionTitles: [
      "1. Partes",
      "2. Relação com outros termos",
      "3. Definições",
      "4. Funções das partes",
      "5. Âmbito e finalidade do tratamento",
      "6. Categorias de titulares dos dados",
      "7. Categorias de dados pessoais",
      "8. Instruções do cliente",
      "9. Confidencialidade",
      "10. Medidas de segurança",
      "11. Subprocessadores",
      "12. Alterações a subprocessadores",
      "13. Transferências internacionais",
      "14. Assistência com direitos dos titulares",
      "15. Assistência de conformidade",
      "16. Violação de dados pessoais",
      "17. Eliminação e devolução de dados",
      "18. Auditorias e informações",
      "19. Responsabilidades do cliente",
      "20. Responsabilidade",
      "21. Duração",
      "22. Lei aplicável",
      "Anexo 1 - Detalhes do tratamento",
      "Anexo 2 - Medidas técnicas e organizacionais",
      "Contacto"
    ],
    sectionSummaries: [
      "O cliente é a pessoa ou organização que usa o NivaDesk. O processador é a EGGCRAFT LIMITED: 141 Randolph Avenue, London, W9 1DN, United Kingdom. Email: nivadesk@gmail.com.",
      "Este DPA integra os Terms of Service do NivaDesk. Se houver conflito sobre Customer Personal Data, este DPA prevalece.",
      "Applicable Data Protection Laws, Customer Personal Data, Controller, Processor, Subprocessor e Services são definidos para este acordo.",
      "Para Customer Personal Data, o cliente é controller e o NivaDesk é processor, salvo acordo escrito diferente.",
      "O tratamento serve para fornecer, manter, proteger, apoiar e melhorar o NivaDesk, incluindo workspaces, contas, funções, encomendas, ficheiros, suporte, backups e acesso a planos.",
      "Os dados podem dizer respeito a clientes do cliente, equipa, colaboradores, contratados, fornecedores, estafetas, parceiros e outras pessoas incluídas no workspace.",
      "Os dados podem incluir nomes, emails, telefones, moradas, detalhes de encomendas, notas, tarefas, datas, ficheiros, metadados, funções, atividade e dados técnicos de suporte.",
      "O cliente instrui o NivaDesk a tratar os dados necessários aos Services. Instruções ilegais ou arriscadas podem ser recusadas.",
      "As pessoas autorizadas a aceder a Customer Personal Data estão sujeitas a confidencialidade e o acesso é limitado ao necessário.",
      "O NivaDesk aplica medidas como autenticação, permissões por função, acesso administrativo limitado, ligações seguras, controlos cloud, logs, backups e procedimentos de incidente.",
      "O cliente autoriza o NivaDesk a usar subprocessadores para hosting, armazenamento, autenticação, pagamentos, email, analytics, monitorização de erros e suporte.",
      "O NivaDesk pode adicionar ou substituir subprocessadores e dará aviso razoável quando necessário. O cliente pode opor-se por motivos de proteção de dados.",
      "Customer Personal Data pode ser tratado no Reino Unido, EEE, Estados Unidos ou outros locais de fornecedores; serão usadas salvaguardas adequadas quando exigidas.",
      "O NivaDesk presta assistência razoável em pedidos de titulares quando o cliente não os conseguir cumprir diretamente pelos Services.",
      "O NivaDesk apoia razoavelmente obrigações de segurança, notificação de violação, DPIA e consulta de autoridades conforme a informação disponível.",
      "O NivaDesk notificará o cliente sem demora indevida após tomar conhecimento de uma violação que afete Customer Personal Data.",
      "Durante o acordo, o cliente pode aceder, exportar ou eliminar dados quando disponível. Após o fim, os dados são eliminados ou devolvidos conforme Agreement, Privacy Policy, backups, obrigações legais e limites técnicos.",
      "O NivaDesk pode disponibilizar resumos de segurança, políticas, informação de subprocessadores e respostas razoáveis a questionários.",
      "O cliente é responsável por uso legal, avisos, bases jurídicas, permissões, segurança da equipa, evitar dados sensíveis desnecessários, responder a pedidos e manter backups necessários.",
      "A responsabilidade ao abrigo deste DPA está sujeita aos limites do Agreement salvo quando proibido por lei.",
      "Este DPA mantém-se enquanto o NivaDesk tratar Customer Personal Data por conta do cliente.",
      "Este DPA rege-se pela mesma lei e jurisdição do Agreement, salvo exigência diferente da lei de proteção de dados.",
      "Os detalhes do tratamento explicam objeto, duração, finalidade, natureza, titulares, categorias de dados e limites para categorias especiais.",
      "As medidas incluem segurança de conta, separação workspace, acesso por função, segurança cloud, limites de ficheiros, logs, transporte seguro, acesso admin limitado, resposta a incidentes e backups.",
      "Perguntas sobre DPA: EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. Email: nivadesk@gmail.com."
    ]
  },
  "Русский (Russian)": {
    lastUpdatedLabel: "Последнее обновление",
    introTitle: "Соглашение об обработке данных",
    introParagraphs: [
      "Это Соглашение об обработке данных является частью Условий обслуживания между EGGCRAFT LIMITED, оператором NivaDesk, и клиентом, использующим NivaDesk.",
      "Оно поддерживает соблюдение UK GDPR и EU GDPR для персональных данных клиента, обрабатываемых через NivaDesk."
    ],
    sectionTitles: [
      "1. Стороны",
      "2. Связь с другими условиями",
      "3. Определения",
      "4. Роли сторон",
      "5. Объем и цель обработки",
      "6. Категории субъектов данных",
      "7. Категории персональных данных",
      "8. Инструкции клиента",
      "9. Конфиденциальность",
      "10. Меры безопасности",
      "11. Субпроцессоры",
      "12. Изменения субпроцессоров",
      "13. Международные передачи",
      "14. Помощь по правам субъектов",
      "15. Помощь с соблюдением требований",
      "16. Нарушение персональных данных",
      "17. Удаление и возврат данных",
      "18. Аудиты и информация",
      "19. Обязанности клиента",
      "20. Ответственность",
      "21. Срок действия",
      "22. Применимое право",
      "Приложение 1 - Детали обработки",
      "Приложение 2 - Технические и организационные меры",
      "Контакт"
    ],
    sectionSummaries: [
      "Клиентом является лицо или организация, использующая NivaDesk. Обработчик: EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. Email: nivadesk@gmail.com.",
      "Этот DPA включен в Terms of Service NivaDesk. При конфликте по обработке Customer Personal Data применяется этот DPA.",
      "Applicable Data Protection Laws, Customer Personal Data, Controller, Processor, Subprocessor и Services определяются для целей этого соглашения.",
      "Для Customer Personal Data клиент является controller, а NivaDesk - processor, если письменно не согласовано иное.",
      "Обработка нужна для предоставления, поддержки, защиты и улучшения NivaDesk, включая workspaces, аккаунты, роли, заказы, файлы, поддержку, backups и доступ к планам.",
      "Данные могут относиться к клиентам заказчика, членам команды, сотрудникам, подрядчикам, поставщикам, курьерам, партнерам и другим лицам в workspace.",
      "Данные могут включать имена, email, телефоны, адреса, детали заказов, заметки, задачи, даты, файлы, metadata, роли, активность и технические данные поддержки.",
      "Клиент поручает NivaDesk обрабатывать данные, необходимые для Services. Незаконные или рискованные инструкции могут быть отклонены.",
      "Лица с доступом к Customer Personal Data связаны обязательствами конфиденциальности; доступ ограничен необходимым.",
      "NivaDesk применяет меры вроде аутентификации, прав по ролям, ограниченного admin-доступа, защищенных соединений, cloud-контролей, logs, backups и процедур incident response.",
      "Клиент разрешает NivaDesk использовать субпроцессоров для hosting, storage, authentication, payments, email, analytics, error monitoring и support.",
      "NivaDesk может добавлять или заменять субпроцессоров и предоставляет разумное уведомление, когда требуется. Клиент может возразить по основаниям защиты данных.",
      "Customer Personal Data может обрабатываться в UK, EEA, США или других местах провайдеров; при необходимости используются надлежащие гарантии.",
      "NivaDesk оказывает разумную помощь по запросам субъектов данных, если клиент не может выполнить их напрямую через Services.",
      "NivaDesk разумно помогает с безопасностью, уведомлением о нарушениях, DPIA и консультациями с органами с учетом доступной информации.",
      "NivaDesk уведомит клиента без необоснованной задержки после того, как узнает о нарушении, затрагивающем Customer Personal Data.",
      "Во время договора клиент может получать, экспортировать или удалять данные, где это доступно. После завершения данные удаляются или возвращаются согласно Agreement, Privacy Policy, backup-практикам, закону и техническим ограничениям.",
      "NivaDesk может предоставить обзоры безопасности, политики, сведения о субпроцессорах и разумные ответы на анкеты.",
      "Клиент отвечает за законное использование, уведомления, правовые основания, разрешения, безопасность команды, отказ от лишних чувствительных данных, ответы на запросы и нужные backups.",
      "Ответственность по этому DPA регулируется ограничениями Agreement, если закон не требует иного.",
      "Этот DPA действует, пока NivaDesk обрабатывает Customer Personal Data от имени клиента.",
      "Этот DPA регулируется тем же правом и юрисдикцией, что и Agreement, если законы о защите данных не требуют иного.",
      "Детали обработки описывают предмет, срок, цель, характер обработки, субъектов данных, категории данных и ограничения для специальных категорий.",
      "Меры включают безопасность аккаунта, разделение workspace, доступ по ролям, cloud security, file limits, logs, secure transport, ограниченный admin access, incident response и backups.",
      "Вопросы по DPA: EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. Email: nivadesk@gmail.com."
    ]
  },
  "日本語 (Japanese)": {
    lastUpdatedLabel: "最終更新日",
    introTitle: "データ処理契約",
    introParagraphs: [
      "このデータ処理契約は、NivaDesk を運営する EGGCRAFT LIMITED と NivaDesk を利用するお客様との Terms of Service の一部です。",
      "NivaDesk を通じて処理されるお客様の個人データについて、UK GDPR と EU GDPR への対応を支援します。"
    ],
    sectionTitles: [
      "1. 当事者",
      "2. 他の条件との関係",
      "3. 定義",
      "4. 当事者の役割",
      "5. 処理の範囲と目的",
      "6. データ主体のカテゴリ",
      "7. 個人データのカテゴリ",
      "8. お客様の指示",
      "9. 機密保持",
      "10. セキュリティ対策",
      "11. サブプロセッサ",
      "12. サブプロセッサの変更",
      "13. 国際移転",
      "14. データ主体の権利への支援",
      "15. コンプライアンス支援",
      "16. 個人データ侵害",
      "17. データの削除と返却",
      "18. 監査と情報",
      "19. お客様の責任",
      "20. 責任",
      "21. 期間",
      "22. 準拠法",
      "別紙 1 - 処理の詳細",
      "別紙 2 - 技術的および組織的対策",
      "連絡先"
    ],
    sectionSummaries: [
      "お客様は NivaDesk を利用する個人または組織です。処理者は EGGCRAFT LIMITED です: 141 Randolph Avenue, London, W9 1DN, United Kingdom。Email: nivadesk@gmail.com。",
      "この DPA は NivaDesk の Terms of Service に組み込まれます。Customer Personal Data の処理について矛盾がある場合、この DPA が優先します。",
      "Applicable Data Protection Laws、Customer Personal Data、Controller、Processor、Subprocessor、Services をこの契約のために定義します。",
      "Customer Personal Data について、お客様は controller、NivaDesk は processor です。ただし書面で別段の合意がある場合を除きます。",
      "処理は NivaDesk の提供、維持、安全確保、サポート、改善のためであり、workspaces、アカウント、ロール、注文、ファイル、サポート、バックアップ、プランアクセスを含みます。",
      "データはお客様の顧客、チームメンバー、従業員、委託先、サプライヤー、配送業者、協力者、workspace 内のその他の個人に関するものです。",
      "データには氏名、メール、電話、住所、注文詳細、メモ、タスク、日付、ファイル、メタデータ、ロール、活動記録、技術サポート情報が含まれます。",
      "お客様は Services 提供に必要な処理を NivaDesk に指示します。違法またはリスクのある指示は拒否される場合があります。",
      "Customer Personal Data にアクセスする者は機密保持義務を負い、アクセスは必要な範囲に制限されます。",
      "NivaDesk は認証、ロール権限、制限付き管理者アクセス、安全な接続、cloud controls、logs、backups、incident procedures などを適用します。",
      "お客様は hosting、storage、authentication、payments、email、analytics、error monitoring、support のためのサブプロセッサ利用を承認します。",
      "NivaDesk はサブプロセッサを追加または置換できます。必要な場合は合理的な通知を行い、お客様はデータ保護上の理由で異議を述べられます。",
      "Customer Personal Data は UK、EEA、米国、またはプロバイダーの所在地で処理されることがあり、必要な保護措置を用います。",
      "NivaDesk は、お客様が Services だけでは対応できないデータ主体のリクエストについて合理的に支援します。",
      "NivaDesk は安全性、侵害通知、DPIA、監督機関との相談について、利用可能な情報に基づき合理的に支援します。",
      "NivaDesk は Customer Personal Data に影響する侵害を認識した場合、不当な遅延なくお客様に通知します。",
      "契約期間中、お客様は利用可能な範囲でデータへアクセス、エクスポート、削除できます。終了後は Agreement、Privacy Policy、バックアップ、法的義務、技術的制限に従って削除または返却されます。",
      "NivaDesk はセキュリティ概要、方針文書、サブプロセッサ情報、合理的な質問票回答を提供できます。",
      "お客様は適法な利用、通知、法的根拠、権限設定、チームの安全利用、不要な機微データの回避、リクエスト対応、必要なバックアップに責任を負います。",
      "この DPA に基づく責任は、法律で禁止されない限り Agreement の責任制限に従います。",
      "この DPA は NivaDesk が Customer Personal Data をお客様のために処理する限り有効です。",
      "この DPA は、データ保護法が別途要求しない限り、Agreement と同じ準拠法および管轄に従います。",
      "処理の詳細は、対象、期間、目的、処理の性質、データ主体、データカテゴリ、特別カテゴリの制限を説明します。",
      "対策は account security、workspace separation、role access、cloud security、file limits、logs、secure transport、limited admin access、incident response、backups を含みます。",
      "DPA に関する質問: EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom。Email: nivadesk@gmail.com。"
    ]
  },
  "中文 (Chinese)": {
    lastUpdatedLabel: "最后更新",
    introTitle: "数据处理协议",
    introParagraphs: [
      "本数据处理协议是 EGGCRAFT LIMITED（NivaDesk 的运营方）与使用 NivaDesk 的客户之间服务条款的一部分。",
      "它用于支持 NivaDesk 处理客户个人数据时符合 UK GDPR 和 EU GDPR。"
    ],
    sectionTitles: [
      "1. 双方",
      "2. 与其他条款的关系",
      "3. 定义",
      "4. 双方角色",
      "5. 处理范围和目的",
      "6. 数据主体类别",
      "7. 个人数据类别",
      "8. 客户指示",
      "9. 保密",
      "10. 安全措施",
      "11. 子处理方",
      "12. 子处理方变更",
      "13. 国际传输",
      "14. 数据主体权利协助",
      "15. 合规协助",
      "16. 个人数据泄露",
      "17. 数据删除和返还",
      "18. 审计和信息",
      "19. 客户责任",
      "20. 责任限制",
      "21. 期限",
      "22. 适用法律",
      "附录 1 - 处理详情",
      "附录 2 - 技术和组织措施",
      "联系方式"
    ],
    sectionSummaries: [
      "客户是使用 NivaDesk 的个人或组织。处理方是 EGGCRAFT LIMITED：141 Randolph Avenue, London, W9 1DN, United Kingdom。Email: nivadesk@gmail.com。",
      "本 DPA 纳入 NivaDesk Terms of Service。若 Customer Personal Data 的处理条款发生冲突，本 DPA 优先适用。",
      "本协议定义 Applicable Data Protection Laws、Customer Personal Data、Controller、Processor、Subprocessor 和 Services。",
      "对于 Customer Personal Data，客户为 controller，NivaDesk 为 processor，除非双方另有书面约定。",
      "处理目的是提供、维护、保护、支持并改进 NivaDesk，包括 workspaces、账户、角色、订单、文件、支持、备份和计划访问。",
      "数据可能涉及客户自己的客户、团队成员、员工、承包商、供应商、快递方、协作者以及 workspace 内容中的其他个人。",
      "数据可能包括姓名、邮箱、电话、地址、订单详情、备注、任务、日期、文件、元数据、角色、活动记录和技术支持信息。",
      "客户指示 NivaDesk 为提供 Services 处理必要数据。违法或有风险的指示可能被拒绝。",
      "获准访问 Customer Personal Data 的人员受保密义务约束，访问权限仅限必要范围。",
      "NivaDesk 采用身份验证、基于角色的权限、受限管理员访问、安全连接、云安全控制、日志、备份和事件处理程序等措施。",
      "客户授权 NivaDesk 使用子处理方提供托管、存储、认证、支付、邮件、analytics、错误监控和支持服务。",
      "NivaDesk 可增加或替换子处理方，并在法律要求时提供合理通知。客户可基于数据保护理由提出异议。",
      "Customer Personal Data 可能在英国、EEA、美国或服务提供商运营的其他地点处理；必要时会使用适当传输保障。",
      "当客户无法通过 Services 合理完成数据主体请求时，NivaDesk 会提供合理协助。",
      "NivaDesk 会根据可获得的信息，就安全、泄露通知、DPIA 和监管机构咨询提供合理协助。",
      "NivaDesk 在知悉影响 Customer Personal Data 的个人数据泄露后，会无不当延迟地通知客户。",
      "协议期间，客户可在功能可用时访问、导出或删除数据。终止后，数据会根据 Agreement、Privacy Policy、备份实践、法律义务和技术限制删除或返还。",
      "NivaDesk 可提供安全摘要、政策文件、子处理方信息和对合理数据保护问卷的答复。",
      "客户负责合法使用、提供通知、取得法律依据和权限、配置权限、团队安全使用、避免不必要敏感数据、回应请求并保留必要备份。",
      "本 DPA 项下责任受 Agreement 的责任限制约束，除非适用法律另有要求。",
      "只要 NivaDesk 代表客户处理 Customer Personal Data，本 DPA 即持续有效。",
      "本 DPA 适用与 Agreement 相同的法律和管辖，除非数据保护法另有要求。",
      "处理详情说明主题、期限、目的、处理性质、数据主体、数据类别以及特殊类别数据限制。",
      "措施包括账户安全、workspace 隔离、角色访问、云安全、文件限制、日志、安全传输、受限管理员访问、事件响应和备份。",
      "DPA 问题请联系：EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom。Email: nivadesk@gmail.com。"
    ]
  },
  "العربية (Arabic)": {
    lastUpdatedLabel: "آخر تحديث",
    introTitle: "اتفاقية معالجة البيانات",
    introParagraphs: [
      "تشكل اتفاقية معالجة البيانات هذه جزءاً من شروط الخدمة بين EGGCRAFT LIMITED، المشغلة لـ NivaDesk، والعميل الذي يستخدم NivaDesk.",
      "وهي تدعم الامتثال لـ UK GDPR و EU GDPR للبيانات الشخصية الخاصة بالعميل التي تتم معالجتها عبر NivaDesk."
    ],
    sectionTitles: [
      "1. الأطراف",
      "2. العلاقة مع الشروط الأخرى",
      "3. التعريفات",
      "4. أدوار الأطراف",
      "5. نطاق وغرض المعالجة",
      "6. فئات أصحاب البيانات",
      "7. فئات البيانات الشخصية",
      "8. تعليمات العميل",
      "9. السرية",
      "10. تدابير الأمان",
      "11. المعالجون الفرعيون",
      "12. تغييرات المعالجين الفرعيين",
      "13. التحويلات الدولية",
      "14. المساعدة في حقوق أصحاب البيانات",
      "15. المساعدة في الامتثال",
      "16. خرق البيانات الشخصية",
      "17. حذف البيانات وإعادتها",
      "18. التدقيق والمعلومات",
      "19. مسؤوليات العميل",
      "20. المسؤولية",
      "21. المدة",
      "22. القانون الحاكم",
      "الجدول 1 - تفاصيل المعالجة",
      "الجدول 2 - التدابير التقنية والتنظيمية",
      "التواصل"
    ],
    sectionSummaries: [
      "العميل هو الشخص أو المؤسسة التي تستخدم NivaDesk. المعالج هو EGGCRAFT LIMITED: 141 Randolph Avenue, London, W9 1DN, United Kingdom. البريد: nivadesk@gmail.com.",
      "تندمج هذه الاتفاقية مع Terms of Service الخاصة بـ NivaDesk. عند وجود تعارض بشأن Customer Personal Data، تسري هذه الاتفاقية.",
      "توضح هذه الاتفاقية معاني Applicable Data Protection Laws و Customer Personal Data و Controller و Processor و Subprocessor و Services.",
      "بالنسبة إلى Customer Personal Data، يكون العميل controller وتكون NivaDesk processor ما لم يتم الاتفاق كتابياً على خلاف ذلك.",
      "الغرض من المعالجة هو توفير NivaDesk وصيانته وتأمينه ودعمه وتحسينه، بما في ذلك workspaces والحسابات والأدوار والطلبات والملفات والدعم والنسخ الاحتياطي والوصول إلى الخطط.",
      "قد تتعلق البيانات بعملاء العميل، أعضاء الفريق، الموظفين، المتعاقدين، الموردين، شركات التوصيل، المتعاونين أو أي أفراد مذكورين داخل workspace.",
      "قد تشمل البيانات الأسماء والبريد والهاتف والعناوين وتفاصيل الطلبات والملاحظات والمهام والتواريخ والملفات والبيانات الوصفية والأدوار وسجلات النشاط وبيانات الدعم التقنية.",
      "يوجه العميل NivaDesk لمعالجة البيانات اللازمة لتقديم Services. قد ترفض NivaDesk التعليمات غير القانونية أو عالية المخاطر.",
      "الأشخاص المصرح لهم بالوصول إلى Customer Personal Data يخضعون لالتزامات سرية، ويقتصر الوصول على الحاجة اللازمة.",
      "تستخدم NivaDesk تدابير مثل المصادقة، صلاحيات الأدوار، الوصول الإداري المحدود، الاتصالات الآمنة، ضوابط cloud، السجلات، النسخ الاحتياطي وإجراءات الحوادث.",
      "يفوض العميل NivaDesk باستخدام معالجين فرعيين للاستضافة والتخزين والمصادقة والمدفوعات والبريد والتحليلات ومراقبة الأخطاء والدعم.",
      "قد تضيف NivaDesk أو تستبدل معالجين فرعيين وتقدم إشعاراً معقولاً عند اللزوم. يمكن للعميل الاعتراض لأسباب حماية البيانات.",
      "قد تتم معالجة Customer Personal Data في المملكة المتحدة أو المنطقة الاقتصادية الأوروبية أو الولايات المتحدة أو مواقع أخرى لمزودي الخدمة، مع استخدام ضمانات مناسبة عند الحاجة.",
      "تقدم NivaDesk مساعدة معقولة لطلبات أصحاب البيانات عندما لا يستطيع العميل تنفيذها مباشرة من خلال Services.",
      "تساعد NivaDesk بشكل معقول في الأمن وإشعارات الخرق وDPIA والتشاور مع السلطات بناءً على المعلومات المتاحة.",
      "تخطر NivaDesk العميل دون تأخير غير مبرر بعد علمها بخرق يؤثر في Customer Personal Data.",
      "خلال مدة الاتفاقية يمكن للعميل الوصول إلى البيانات أو تصديرها أو حذفها عندما تكون الميزة متاحة. بعد الانتهاء، تحذف البيانات أو تعاد وفق Agreement و Privacy Policy والنسخ الاحتياطي والالتزامات القانونية والقيود التقنية.",
      "قد توفر NivaDesk ملخصات أمنية ووثائق سياسات ومعلومات عن المعالجين الفرعيين وردوداً معقولة على الاستبيانات.",
      "يتحمل العميل مسؤولية الاستخدام القانوني، الإشعارات، الأسس القانونية، الأذونات، أمان الفريق، تجنب البيانات الحساسة غير اللازمة، الرد على الطلبات والاحتفاظ بالنسخ الاحتياطية اللازمة.",
      "تخضع المسؤولية بموجب هذه الاتفاقية لقيود المسؤولية في Agreement ما لم يمنع القانون ذلك.",
      "تظل هذه الاتفاقية سارية ما دامت NivaDesk تعالج Customer Personal Data نيابة عن العميل.",
      "تخضع هذه الاتفاقية لنفس القانون والاختصاص في Agreement ما لم تتطلب قوانين حماية البيانات غير ذلك.",
      "تفاصيل المعالجة تشرح الموضوع والمدة والغرض وطبيعة المعالجة وأصحاب البيانات وفئات البيانات وحدود البيانات الخاصة.",
      "تشمل التدابير أمان الحساب، فصل workspace، الوصول حسب الدور، أمان cloud، حدود الملفات، السجلات، النقل الآمن، وصول الإدارة المحدود، الاستجابة للحوادث والنسخ الاحتياطي.",
      "لأسئلة DPA: EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. البريد: nivadesk@gmail.com."
    ]
  },
  "हिन्दी (Hindi)": {
    lastUpdatedLabel: "अंतिम अपडेट",
    introTitle: "डेटा प्रोसेसिंग एग्रीमेंट",
    introParagraphs: [
      "यह डेटा प्रोसेसिंग एग्रीमेंट EGGCRAFT LIMITED, जो NivaDesk संचालित करता है, और NivaDesk इस्तेमाल करने वाले ग्राहक के Terms of Service का हिस्सा है.",
      "यह NivaDesk के माध्यम से प्रोसेस किए जाने वाले ग्राहक personal data के लिए UK GDPR और EU GDPR compliance को support करता है."
    ],
    sectionTitles: [
      "1. पक्ष",
      "2. अन्य शर्तों से संबंध",
      "3. परिभाषाएँ",
      "4. पक्षों की भूमिकाएँ",
      "5. प्रोसेसिंग का दायरा और उद्देश्य",
      "6. Data subjects की श्रेणियाँ",
      "7. Personal data की श्रेणियाँ",
      "8. ग्राहक निर्देश",
      "9. गोपनीयता",
      "10. सुरक्षा उपाय",
      "11. Subprocessors",
      "12. Subprocessor बदलाव",
      "13. अंतरराष्ट्रीय transfer",
      "14. Data subject rights में सहायता",
      "15. Compliance सहायता",
      "16. Personal data breach",
      "17. Data deletion और return",
      "18. Audits और जानकारी",
      "19. ग्राहक जिम्मेदारियाँ",
      "20. Liability",
      "21. Term",
      "22. Governing law",
      "Schedule 1 - Processing details",
      "Schedule 2 - Technical and organisational measures",
      "Contact"
    ],
    sectionSummaries: [
      "ग्राहक वह व्यक्ति या संस्था है जो NivaDesk इस्तेमाल करती है. Processor EGGCRAFT LIMITED है: 141 Randolph Avenue, London, W9 1DN, United Kingdom. Email: nivadesk@gmail.com.",
      "यह DPA NivaDesk Terms of Service में शामिल है. Customer Personal Data processing पर conflict होने पर यह DPA लागू होगा.",
      "Applicable Data Protection Laws, Customer Personal Data, Controller, Processor, Subprocessor और Services को इस agreement के लिए define किया गया है.",
      "Customer Personal Data के लिए ग्राहक controller और NivaDesk processor है, जब तक अलग written agreement न हो.",
      "Processing का उद्देश्य NivaDesk provide, maintain, secure, support और improve करना है, including workspaces, accounts, roles, orders, files, support, backups और plan access.",
      "Data ग्राहक के clients, customers, team members, employees, contractors, suppliers, couriers, collaborators और workspace content में शामिल अन्य लोगों से related हो सकता है.",
      "Data में names, emails, phones, addresses, order details, notes, tasks, dates, files, metadata, roles, activity records और technical support data शामिल हो सकते हैं.",
      "ग्राहक NivaDesk को Services provide करने के लिए required data process करने का instruction देता है. Illegal या risky instructions refuse किए जा सकते हैं.",
      "Customer Personal Data access करने वाले लोग confidentiality obligations के अधीन होते हैं और access जरूरत तक limited रहता है.",
      "NivaDesk authentication, role permissions, limited admin access, secure connections, cloud controls, logs, backups और incident procedures जैसे measures apply करता है.",
      "ग्राहक NivaDesk को hosting, storage, authentication, payments, email, analytics, error monitoring और support के लिए subprocessors use करने की अनुमति देता है.",
      "NivaDesk subprocessors add या replace कर सकता है और जरूरत होने पर reasonable notice देगा. ग्राहक data protection grounds पर object कर सकता है.",
      "Customer Personal Data UK, EEA, US या providers के अन्य locations में process हो सकता है; required safeguards use किए जाएंगे.",
      "जहां ग्राहक Services से request पूरी नहीं कर सकता, NivaDesk data subject requests पर reasonable assistance देता है.",
      "NivaDesk available information के आधार पर security, breach notice, DPIA और authority consultation obligations में reasonable assistance देता है.",
      "Customer Personal Data को affect करने वाले breach की जानकारी होने पर NivaDesk customer को undue delay के बिना notify करेगा.",
      "Agreement term के दौरान ग्राहक data access, export या delete कर सकता है जहां features available हों. End के बाद data Agreement, Privacy Policy, backups, legal obligations और technical limits के अनुसार delete या return होता है.",
      "NivaDesk security summaries, policy documents, subprocessor information और reasonable questionnaire responses provide कर सकता है.",
      "ग्राहक lawful use, notices, legal bases, permissions, team security, unnecessary sensitive data avoid करने, requests respond करने और जरूरी backups रखने के लिए responsible है.",
      "इस DPA के तहत liability Agreement की limits के अधीन है, unless law prohibits it.",
      "यह DPA तब तक effective रहता है जब तक NivaDesk customer की ओर से Customer Personal Data process करता है.",
      "यह DPA Agreement जैसी governing law और jurisdiction follow करता है, unless data protection laws require otherwise.",
      "Processing details subject matter, duration, purpose, nature, data subjects, data categories और special category limits समझाते हैं.",
      "Measures में account security, workspace separation, role access, cloud security, file limits, logs, secure transport, limited admin access, incident response और backups शामिल हैं.",
      "DPA questions के लिए: EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. Email: nivadesk@gmail.com."
    ]
  }
};

Object.assign(DATA_PROCESSING_AGREEMENT_DRAFTS, DATA_PROCESSING_AGREEMENT_TRANSLATION_BASE);

export function getDataProcessingAgreementSections(language: StudioLanguage): PrivacyPolicySection[] {
  const localized = DATA_PROCESSING_AGREEMENT_DRAFTS[language];
  if (!localized) {
    return DATA_PROCESSING_AGREEMENT_SECTIONS;
  }
  return buildLocalizedDataProcessingAgreement(localized);
}

export function getDataProcessingAgreementLastUpdatedLabel(language: StudioLanguage): string {
  return DATA_PROCESSING_AGREEMENT_LABELS[language] ?? "Last updated";
}
