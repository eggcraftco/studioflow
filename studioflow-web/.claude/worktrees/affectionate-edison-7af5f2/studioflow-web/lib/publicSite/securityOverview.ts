import type { PrivacyPolicySection } from "@/lib/publicSite/privacyPolicy";
import type { StudioLanguage } from "@/lib/studioflow/language";

export const SECURITY_OVERVIEW_LAST_UPDATED = "17 June 2026";

export const SECURITY_OVERVIEW_SECTIONS: PrivacyPolicySection[] = [
  {
    title: "NivaDesk Security Overview",
    paragraphs: [
      "A practical overview of how NivaDesk protects accounts, workspaces, files, and business data.",
      "NivaDesk is operated by EGGCRAFT LIMITED. Contact: contact@nivadesk.co.uk.",
      "This Security Overview explains the security practices we use to help protect NivaDesk, our users, and the business data stored in workspaces. It is intended to provide transparency for customers, team members, and businesses evaluating NivaDesk.",
      "NivaDesk is designed for small businesses, studios, makers, freelancers, and teams that need to manage orders, clients, tasks, files, notes, timelines, and team access in one place. Because this information can include personal data, customer details, files, addresses, workflow records, and business notes, we treat security as an important part of the product.",
      "This document is not a guarantee that any system is completely secure. No online or offline system can be made risk-free. However, we use reasonable technical and organisational measures to reduce risk and protect customer data."
    ]
  },
  {
    title: "1. Security principles",
    paragraphs: ["NivaDesk is built around the following principles:"],
    bullets: [
      "protect each workspace so users only access data they are authorised to view;",
      "keep account access secure through modern authentication methods;",
      "apply role-based permissions for team members;",
      "use trusted cloud infrastructure and service providers;",
      "limit access to customer data to what is needed to operate and support the service;",
      "provide export and deletion options where appropriate;",
      "monitor, improve, and respond to security issues as the product evolves."
    ]
  },
  {
    title: "2. Account security",
    paragraphs: [
      "Users may sign in to NivaDesk using supported authentication methods, such as email/password, Google sign-in, Apple sign-in, or other login options that we may support in the future."
    ],
    bullets: [
      "Passwords are handled through secure authentication systems and are not stored by us in plain text.",
      "Users are responsible for keeping their login details and devices secure.",
      "Users should use strong, unique passwords and avoid sharing accounts.",
      "Where supported, users should enable additional device security such as Face ID, Touch ID, passcode, or operating system account protection.",
      "If a user believes their account has been accessed without permission, they should contact us immediately."
    ]
  },
  {
    title: "3. Workspace isolation",
    paragraphs: [
      "NivaDesk uses a workspace-based structure. Business data is organised inside workspaces, and access is controlled according to workspace membership and role permissions."
    ],
    bullets: [
      "Users should only see workspaces they belong to.",
      "Workspace data should be separated from other customers and companies.",
      "Workspace owners and administrators control who can join the workspace.",
      "Members who leave or are removed should no longer have access to that workspace.",
      "Where applicable, security rules and database permissions are used to restrict access to each user and workspace."
    ]
  },
  {
    title: "4. Role-based access control",
    paragraphs: ["NivaDesk is designed to support different team roles so businesses can limit access according to responsibility."],
    bullets: [
      "Owner: manages the workspace, settings, team access, and key business data.",
      "Member: accesses workspace features according to the permissions granted.",
      "View Only: can view permitted content without editing key records.",
      "Workflow Only: can focus on workflow or production information while sensitive financial information may be hidden.",
      "Additional roles or permission controls may be added as the product develops."
    ]
  },
  {
    title: "5. Client files and uploaded content",
    paragraphs: [
      "NivaDesk may allow users to upload and manage client files, images, PDFs, documents, design files, and other business materials. Uploaded files may include metadata such as filename, file type, file size, upload date, uploader, and the related order or workspace."
    ],
    bullets: [
      "File access is controlled according to workspace and role permissions.",
      "Storage limits and upload limits may apply depending on the plan.",
      "File metadata may be used to display, search, manage, audit, and secure uploads.",
      "We may apply file type restrictions, file size limits, upload safety checks, or abuse prevention controls.",
      "Users are responsible for ensuring they have the right to upload, store, and share any file they add to NivaDesk."
    ]
  },
  {
    title: "6. Cloud infrastructure and storage",
    paragraphs: [
      "NivaDesk may use trusted third-party infrastructure providers for authentication, database hosting, cloud storage, app hosting, payments, analytics, crash reporting, and email delivery."
    ],
    bullets: [
      "We aim to use reputable providers with appropriate security practices.",
      "Data may be processed or stored by service providers according to our Privacy Policy and applicable data protection terms.",
      "Access to infrastructure is limited to authorised personnel or systems where needed.",
      "Service providers may be listed in our Subprocessors page where applicable.",
      "We review our architecture and providers as the product develops."
    ]
  },
  {
    title: "7. Encryption and transmission security",
    paragraphs: [
      "We use secure transmission methods where appropriate to protect data moving between user devices, our services, and third-party providers."
    ],
    bullets: [
      "Connections to NivaDesk services should use encrypted communication where supported.",
      "Payment details are processed by payment providers and full card numbers are not stored by NivaDesk.",
      "Authentication providers may apply their own encryption and security controls.",
      "Local device storage and offline cache security may depend partly on the user's device, operating system, and device security settings."
    ]
  },
  {
    title: "8. Offline mode and local data",
    paragraphs: [
      "NivaDesk may support offline access, local caching, and pending sync features. These features are designed to help users continue working when internet access is unavailable or unstable."
    ],
    bullets: [
      "Offline data may be stored temporarily on the user's device.",
      "Users are responsible for keeping their devices secure.",
      "Device-level protection such as passcodes, biometrics, disk encryption, and account passwords can help protect offline data.",
      "Offline sync may be affected by connectivity issues, deleted records, permission changes, or conflicting edits.",
      "Offline mode is not a replacement for proper backups or secure device management."
    ]
  },
  {
    title: "9. Activity logs and audit information",
    paragraphs: [
      "NivaDesk may record certain activity or history logs to support transparency, troubleshooting, security, and team accountability."
    ],
    bullets: [
      "Order history or workflow logs may record changes such as status updates, notes, file uploads, task changes, or delivery updates.",
      "File audit metadata may record upload date, uploader, file size, and related workspace information.",
      "Security and technical logs may be used to detect abuse, diagnose errors, and improve reliability.",
      "Logs may be retained for a limited period depending on legal, technical, security, and product requirements."
    ]
  },
  {
    title: "10. Payments and billing security",
    paragraphs: [
      "Payments may be handled by third-party payment providers such as Stripe, Apple App Store, Google Play, or other supported platforms."
    ],
    bullets: [
      "We do not store full payment card details ourselves.",
      "Payment providers process card details, renewals, cancellations, refunds, and billing information according to their own terms and privacy policies.",
      "NivaDesk may receive limited billing information, such as plan status, invoice details, subscription state, payment confirmation, or renewal status.",
      "Users should manage Apple or Google subscriptions through the relevant app store account where applicable."
    ]
  },
  {
    title: "11. Access to customer data by NivaDesk",
    paragraphs: ["We limit access to customer data to situations where it is necessary to operate, maintain, secure, or support NivaDesk."],
    bullets: [
      "We do not routinely inspect customer workspace content.",
      "Access may be required for troubleshooting, support, legal compliance, security investigations, abuse prevention, or service maintenance.",
      "Where possible, access is limited to the minimum information needed for the purpose.",
      "We do not sell customer workspace content."
    ]
  },
  {
    title: "12. Backups, retention, and recovery",
    paragraphs: [
      "We protect your workspace against accidental loss and technical failure on several layers, combining in-product recovery with automated infrastructure backups."
    ],
    bullets: [
      "Trash: deleted orders are kept for 30 days and can be restored before they are permanently removed.",
      "Point-in-time recovery: the workspace database can be restored to any moment within the last 7 days.",
      "Automatic daily database backups, retained for two weeks.",
      "A daily backup of account records, retained for 30 days.",
      "The above are automatic backups that we run and use to recover the service; you do not access them directly.",
      "Separately, your own export: you can download your own copy of your data at any time from Settings → Data Management. This is a self-service export you control: not part of, and not a substitute for, our automatic backups.",
      "Retention periods may vary by data type, provider, plan, and legal requirements; these measures are best-effort and not a guarantee.",
      "Users should still keep their own copies of critical business files: NivaDesk should not be your only backup."
    ]
  },
  {
    title: "13. Vulnerability and incident response",
    paragraphs: [
      "If we become aware of a security vulnerability or incident, we will assess the issue and take appropriate action based on its severity and impact."
    ],
    bullets: [
      "We may investigate suspicious activity, abuse, account compromise, or system vulnerability reports.",
      "We may temporarily restrict access, disable features, rotate credentials, or apply fixes where needed.",
      "Where legally required, we will notify affected users, customers, regulators, or authorities.",
      "Users can report security concerns by contacting contact@nivadesk.co.uk."
    ]
  },
  {
    title: "14. Customer responsibilities",
    paragraphs: ["Security is shared between NivaDesk and its users. Customers and users are responsible for using the service safely."],
    bullets: [
      "Use strong, unique passwords and secure login methods.",
      "Protect devices with passcodes, biometrics, and operating system security updates.",
      "Only invite trusted users to workspaces.",
      "Remove team members who should no longer have access.",
      "Assign roles carefully, especially for financial data and client files.",
      "Do not upload unlawful, harmful, or unauthorised content.",
      "Keep separate backup copies of critical files and business records.",
      "Contact us quickly if you suspect unauthorised access or security issues."
    ]
  },
  {
    title: "15. Data export and account deletion",
    paragraphs: ["Where available, NivaDesk may allow users to export their business data or request account deletion."],
    bullets: [
      "Export options may depend on the user's role, workspace permissions, plan, and technical availability.",
      "If a paid plan expires or is cancelled, users may be downgraded to a free or limited plan, but we aim to allow access to export existing business data where technically and legally possible.",
      "Account deletion requests are handled according to our Account Deletion Policy and Privacy Policy.",
      "Some information may be retained where required for legal, tax, accounting, security, dispute resolution, or operational reasons."
    ]
  },
  {
    title: "16. Security limitations",
    paragraphs: ["Although we take reasonable steps to protect NivaDesk, no system can be guaranteed to be completely secure."],
    bullets: [
      "Internet transmission can never be guaranteed to be fully secure.",
      "Device compromise, weak passwords, phishing, shared accounts, malware, or user error can create security risks.",
      "Third-party services may experience outages or security issues outside our control.",
      "Users should consider their own backup, device management, access control, and privacy obligations."
    ]
  },
  {
    title: "17. Related policies",
    paragraphs: ["This Security Overview should be read together with our other legal and policy documents:"],
    bullets: [
      "Privacy Policy",
      "Terms of Service",
      "Cookie Policy",
      "Account Deletion Policy",
      "Refund & Cancellation Policy",
      "Data Processing Agreement, where applicable",
      "Subprocessors page, where applicable",
      "Acceptable Use Policy, where applicable"
    ]
  },
  {
    title: "18. Contact",
    paragraphs: [
      "If you have any questions about this Security Overview or want to report a security concern, please contact:",
      "EGGCRAFT LIMITED",
      "141 Randolph Avenue",
      "London",
      "W9 1DN",
      "United Kingdom",
      "Email: contact@nivadesk.co.uk"
    ]
  }
];

type LocalizedSecurityDraft = {
  lastUpdatedLabel: string;
  introTitle: string;
  introParagraphs: string[];
  sectionTitles: string[];
  sectionSummaries: string[];
};

function buildLocalizedSecurityOverview(copy: LocalizedSecurityDraft): PrivacyPolicySection[] {
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

const SECURITY_OVERVIEW_DRAFTS: Partial<Record<StudioLanguage, LocalizedSecurityDraft>> = {
  Türkçe: {
    lastUpdatedLabel: "Son güncelleme",
    introTitle: "NivaDesk Güvenlik Özeti",
    introParagraphs: [
      "NivaDesk'in hesapları, workspaceleri, dosyaları ve iş verilerini nasıl koruduğuna dair pratik bir özet.",
      "NivaDesk, EGGCRAFT LIMITED tarafından işletilir. İletişim: contact@nivadesk.co.uk. Hiçbir sistem tamamen risksiz değildir; yine de müşteri verilerini korumak için makul teknik ve organizasyonel önlemler kullanırız."
    ],
    sectionTitles: [
      "Güvenlik ilkeleri",
      "Hesap güvenliği",
      "Workspace izolasyonu",
      "Rol tabanlı erişim kontrolü",
      "Client files ve yüklenen içerikler",
      "Bulut altyapısı ve depolama",
      "Şifreleme ve aktarım güvenliği",
      "Offline mode ve yerel veri",
      "Aktivite logları ve denetim bilgileri",
      "Ödemeler ve faturalama güvenliği",
      "NivaDesk'in müşteri verilerine erişimi",
      "Yedekler, saklama ve kurtarma",
      "Zafiyet ve olay müdahalesi",
      "Müşteri sorumlulukları",
      "Veri dışa aktarma ve hesap silme",
      "Güvenlik sınırları",
      "İlgili politikalar",
      "İletişim"
    ],
    sectionSummaries: [
      "NivaDesk, kullanıcıların yalnızca yetkili oldukları workspace verilerine erişmesini, modern authentication kullanmayı, rol bazlı izinleri, güvenilir altyapıyı, sınırlı veri erişimini, export/deletion seçeneklerini ve güvenlik geliştirmelerini temel ilke olarak alır.",
      "Kullanıcılar email/password, Google, Apple veya desteklenen diğer login yöntemleriyle giriş yapabilir. Şifreler secure authentication sistemleriyle işlenir ve plain text tutulmaz; kullanıcılar güçlü şifre ve cihaz güvenliğinden sorumludur.",
      "İş verileri workspace yapısında tutulur ve erişim workspace membership ile role permissions üzerinden kontrol edilir. Kullanıcılar yalnızca dahil oldukları workspaceleri görmeli, ayrılan veya çıkarılan üyelerin erişimi kaldırılmalıdır.",
      "NivaDesk owner, member, view only ve workflow only gibi rolleri destekleyecek şekilde tasarlanır. Roller, özellikle finansal veri ve client files gibi hassas alanlarda erişimi sorumluluğa göre sınırlar.",
      "Client files, görseller, PDF'ler, dokümanlar ve tasarım dosyaları workspace ve role permissions'a göre korunur. Planlara göre upload/storage limitleri, metadata, dosya tipi limitleri ve abuse prevention kontrolleri uygulanabilir.",
      "Authentication, database, cloud storage, hosting, payments, analytics, crash reporting ve email delivery için güvenilir üçüncü taraf sağlayıcılar kullanılabilir. Sağlayıcılar Privacy Policy ve uygun data protection şartlarına göre çalışır.",
      "Veriler cihazlar, servisler ve üçüncü taraf sağlayıcılar arasında aktarılırken uygun yerlerde encrypted communication kullanılır. Full card numbers NivaDesk tarafından saklanmaz; local cache güvenliği cihaz ayarlarına da bağlıdır.",
      "Offline access, local caching ve pending sync özellikleri internet olmadığında çalışmayı destekleyebilir. Offline data cihazda geçici tutulabilir; passcode, biometrics, disk encryption ve cihaz güvenliği önemlidir.",
      "Order history, workflow logs, file audit metadata ve technical logs şeffaflık, troubleshooting, security ve team accountability için kullanılabilir. Log saklama süreleri yasal, teknik ve ürün gerekliliklerine göre değişebilir.",
      "Ödemeler Stripe, Apple App Store, Google Play veya diğer payment providers tarafından işlenebilir. NivaDesk full card details saklamaz; sınırlı billing information alabilir.",
      "NivaDesk müşteri workspace içeriğini rutin olarak incelemez. Troubleshooting, support, legal compliance, security investigation, abuse prevention veya maintenance gerektiğinde minimum gerekli bilgiye erişim olabilir.",
      "İki ayrı şey var. (1) BİZİM otomatik yedeklerimiz: silinen siparişler 30 gün geri getirilebilen bir Çöp Kutusu'na gider; veritabanı için son 7 günü kapsayan zaman-noktası kurtarma, iki hafta saklanan günlük yedekler ve günlük bir hesap yedeği tutarız: bunları biz çalıştırır ve kurtarma için kullanırız, sen doğrudan erişemezsin. (2) SENİN kendi export'un: istediğin zaman Ayarlar → Veri Yönetimi'nden kendi verinin bir kopyasını indirebilirsin; bu senin kontrolündeki self-servis bir export'tur, otomatik yedeklerimizin parçası ya da yerine geçen bir şey değildir. Bu önlemler best-effort esasıyla sağlanır, garanti değildir; kritik dosyalar için kendi yedeklerini de tutmalısın.",
      "Bir vulnerability veya security incident fark edilirse severity ve impact'e göre değerlendirme yaparız. Gerektiğinde erişimi sınırlayabilir, fixes uygulayabilir, credentials rotate edebilir ve yasal bildirim yapabiliriz.",
      "Güvenlik NivaDesk ve kullanıcılar arasında paylaşılır. Güçlü şifre kullanmak, cihazları korumak, yalnızca güvenilir kişileri davet etmek, eski üyeleri kaldırmak, rolleri dikkatle atamak ve kritik dosyaları yedeklemek kullanıcı sorumluluğudur.",
      "Uygun olduğunda kullanıcılar business data export veya account deletion talep edebilir. Paid plan bittiğinde veya iptal edildiğinde mevcut verilerin export'u teknik ve yasal olarak mümkün olduğu ölçüde desteklenir.",
      "Hiçbir sistem tamamen güvenli garanti edilemez. İnternet aktarımı, cihaz compromise, weak passwords, phishing, shared accounts, malware, user error veya third-party issues güvenlik riski oluşturabilir.",
      "Bu özet Privacy Policy, Terms of Service, Cookie Policy, Account Deletion Policy, Refund & Cancellation Policy ve uygulanabilir olduğunda DPA, Subprocessors ve Acceptable Use Policy ile birlikte okunmalıdır.",
      "Güvenlik soruları veya concern report için EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom ya da contact@nivadesk.co.uk üzerinden bize ulaşabilirsiniz."
    ]
  },
  Deutsch: {
    lastUpdatedLabel: "Zuletzt aktualisiert",
    introTitle: "NivaDesk Sicherheitsübersicht",
    introParagraphs: [
      "Eine praktische Übersicht darüber, wie NivaDesk Konten, Workspaces, Dateien und Geschäftsdaten schützt.",
      "NivaDesk wird von EGGCRAFT LIMITED betrieben. Kontakt: contact@nivadesk.co.uk. Kein System ist vollständig risikofrei, aber wir verwenden angemessene technische und organisatorische Maßnahmen."
    ],
    sectionTitles: [
      "Sicherheitsprinzipien",
      "Kontosicherheit",
      "Workspace-Isolation",
      "Rollenbasierte Zugriffskontrolle",
      "Client Files und hochgeladene Inhalte",
      "Cloud-Infrastruktur und Speicher",
      "Verschlüsselung und Übertragungssicherheit",
      "Offline-Modus und lokale Daten",
      "Aktivitätslogs und Audit-Informationen",
      "Zahlungen und Abrechnungssicherheit",
      "Zugriff von NivaDesk auf Kundendaten",
      "Backups, Aufbewahrung und Wiederherstellung",
      "Schwachstellen- und Incident-Response",
      "Verantwortung der Kunden",
      "Datenexport und Kontolöschung",
      "Sicherheitsgrenzen",
      "Verwandte Richtlinien",
      "Kontakt"
    ],
    sectionSummaries: [
      "NivaDesk schützt Workspaces durch autorisierten Zugriff, moderne Authentifizierung, Rollenberechtigungen, vertrauenswürdige Infrastruktur, begrenzten Datenzugriff, Export- und Löschoptionen sowie laufende Sicherheitsverbesserungen.",
      "Nutzer können mit unterstützten Methoden wie E-Mail/Passwort, Google oder Apple anmelden. Passwörter werden durch sichere Authentifizierungssysteme verarbeitet und nicht im Klartext gespeichert; Nutzer müssen Login und Geräte schützen.",
      "Geschäftsdaten werden in Workspaces organisiert und Zugriff richtet sich nach Mitgliedschaft und Rolle. Nutzer sollten nur eigene Workspaces sehen, und entfernte Mitglieder sollten keinen Zugriff behalten.",
      "NivaDesk unterstützt Rollen wie Owner, Member, View Only und Workflow Only, damit Unternehmen Zugriff nach Verantwortung begrenzen können, besonders bei Finanzdaten und Client Files.",
      "Hochgeladene Dateien werden nach Workspace- und Rollenrechten kontrolliert. Je nach Plan können Upload- und Speicherlimits, Metadaten, Dateitypgrenzen und Missbrauchsschutz gelten.",
      "NivaDesk kann vertrauenswürdige Anbieter für Authentifizierung, Datenbank, Cloud-Speicher, Hosting, Zahlungen, Analyse, Crash Reporting und E-Mail nutzen. Verarbeitung erfolgt nach Privacy Policy und Datenschutzbedingungen.",
      "Datenübertragung wird wo angemessen verschlüsselt. Vollständige Kartennummern speichert NivaDesk nicht; lokale Cache-Sicherheit hängt auch von Gerät, Betriebssystem und Einstellungen ab.",
      "Offline-Zugriff, lokales Caching und Pending Sync können Arbeit ohne stabile Verbindung unterstützen. Offline-Daten können lokal liegen; Geräteschutz wie Passcodes, Biometrie und Verschlüsselung ist wichtig.",
      "History Logs, Workflow Logs, File Audit Metadata und technische Logs können Transparenz, Fehlerdiagnose, Sicherheit und Team-Verantwortung unterstützen. Aufbewahrung hängt von Anforderungen ab.",
      "Zahlungen können über Stripe, Apple App Store, Google Play oder andere Anbieter laufen. NivaDesk speichert keine vollständigen Kartendaten und erhält nur begrenzte Billing-Informationen.",
      "NivaDesk prüft Workspace-Inhalte nicht routinemäßig. Zugriff kann für Support, Troubleshooting, Recht, Sicherheitsuntersuchungen, Missbrauchsprävention oder Wartung nötig sein und wird möglichst minimiert.",
      "Backups und Retention-Systeme können gegen Verlust, Störungen oder technische Fehler helfen. Nutzer sollten eigene Backups wichtiger Geschäftsdaten behalten.",
      "Bei Schwachstellen oder Sicherheitsvorfällen bewerten wir Schwere und Auswirkung, untersuchen, beschränken ggf. Zugriff, beheben Probleme, rotieren Zugangsdaten und benachrichtigen rechtlich erforderliche Parteien.",
      "Sicherheit ist geteilt: Nutzer sollten starke Passwörter verwenden, Geräte schützen, nur vertrauenswürdige Personen einladen, alte Mitglieder entfernen, Rollen sorgfältig setzen und wichtige Dateien sichern.",
      "Datenexport und Kontolöschung können je nach Rolle, Berechtigung, Plan und Technik verfügbar sein. Auch nach Ablauf eines Plans streben wir Export bestehender Geschäftsdaten an, soweit möglich.",
      "Kein System ist garantiert vollständig sicher. Übertragung, kompromittierte Geräte, schwache Passwörter, Phishing, geteilte Konten, Malware, Nutzerfehler oder Drittanbieterprobleme schaffen Risiken.",
      "Diese Übersicht sollte mit Privacy Policy, Terms of Service, Cookie Policy, Account Deletion Policy, Refund & Cancellation Policy und ggf. DPA, Subprocessors und Acceptable Use Policy gelesen werden.",
      "Für Sicherheitsfragen oder Meldungen kontaktiere EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom oder contact@nivadesk.co.uk."
    ]
  },
  Français: {
    lastUpdatedLabel: "Dernière mise à jour",
    introTitle: "Aperçu de la sécurité NivaDesk",
    introParagraphs: [
      "Un aperçu pratique de la manière dont NivaDesk protège les comptes, workspaces, fichiers et données professionnelles.",
      "NivaDesk est exploité par EGGCRAFT LIMITED. Contact: contact@nivadesk.co.uk. Aucun système n'est sans risque, mais nous utilisons des mesures techniques et organisationnelles raisonnables."
    ],
    sectionTitles: [
      "Principes de sécurité",
      "Sécurité du compte",
      "Isolation des workspaces",
      "Contrôle d'accès par rôle",
      "Client files et contenus importés",
      "Infrastructure cloud et stockage",
      "Chiffrement et sécurité des transmissions",
      "Mode hors ligne et données locales",
      "Journaux d'activité et audit",
      "Sécurité des paiements et de la facturation",
      "Accès de NivaDesk aux données client",
      "Sauvegardes, conservation et récupération",
      "Réponse aux vulnérabilités et incidents",
      "Responsabilités des clients",
      "Export de données et suppression de compte",
      "Limites de sécurité",
      "Politiques liées",
      "Contact"
    ],
    sectionSummaries: [
      "NivaDesk repose sur l'accès autorisé aux workspaces, l'authentification moderne, les permissions par rôle, une infrastructure fiable, un accès limité aux données, des options d'export/suppression et l'amélioration continue.",
      "Les utilisateurs peuvent se connecter par e-mail/mot de passe, Google, Apple ou autres méthodes prises en charge. Les mots de passe sont traités par des systèmes sécurisés et ne sont pas stockés en clair.",
      "Les données métier sont organisées par workspace et l'accès dépend de l'adhésion et des rôles. Les utilisateurs ne doivent voir que leurs workspaces et les membres retirés ne doivent plus y accéder.",
      "NivaDesk prend en charge des rôles comme Owner, Member, View Only et Workflow Only afin de limiter l'accès selon les responsabilités, notamment pour les données financières et fichiers client.",
      "Les fichiers importés sont contrôlés selon les permissions du workspace et du rôle. Des limites de stockage, métadonnées, restrictions de type de fichier et contrôles anti-abus peuvent s'appliquer.",
      "NivaDesk peut utiliser des fournisseurs fiables pour authentification, base de données, cloud storage, hébergement, paiements, analytics, crash reporting et e-mail, conformément à la Privacy Policy.",
      "Nous utilisons des communications chiffrées lorsque c'est approprié. Les numéros complets de carte ne sont pas stockés par NivaDesk; la sécurité du cache local dépend aussi de l'appareil.",
      "L'accès hors ligne, le cache local et la synchronisation en attente peuvent aider sans connexion stable. Des données peuvent être stockées sur l'appareil; passcodes, biométrie et chiffrement sont importants.",
      "Les journaux d'historique, workflow, fichiers et techniques peuvent soutenir transparence, dépannage, sécurité et responsabilité d'équipe. Leur conservation dépend des besoins légaux, techniques et produit.",
      "Les paiements peuvent être traités par Stripe, Apple App Store, Google Play ou d'autres plateformes. NivaDesk ne stocke pas les cartes complètes et reçoit seulement des informations de facturation limitées.",
      "NivaDesk ne consulte pas régulièrement le contenu des workspaces. Un accès peut être nécessaire pour support, conformité, enquête sécurité, prévention des abus ou maintenance, avec limitation au minimum nécessaire.",
      "Les sauvegardes et systèmes de conservation peuvent aider contre pertes, interruptions ou défaillances. Les utilisateurs doivent garder leurs propres copies des fichiers critiques.",
      "En cas de vulnérabilité ou incident, nous évaluons gravité et impact, enquêtons, limitons l'accès si besoin, corrigeons, changeons des identifiants et notifions lorsque la loi l'exige.",
      "La sécurité est partagée: mots de passe forts, appareils protégés, invitations limitées, suppression des anciens membres, rôles prudents et copies de sauvegarde restent des responsabilités utilisateur.",
      "L'export et la suppression de compte peuvent dépendre du rôle, des permissions, du plan et de la disponibilité technique. Nous visons l'export des données existantes même après expiration quand c'est possible.",
      "Aucun système ne peut être totalement sécurisé. Transmission internet, appareil compromis, mots de passe faibles, phishing, comptes partagés, malware, erreur utilisateur ou tiers peuvent créer des risques.",
      "Cet aperçu doit être lu avec Privacy Policy, Terms of Service, Cookie Policy, Account Deletion Policy, Refund & Cancellation Policy et, le cas échéant, DPA, Subprocessors et Acceptable Use Policy.",
      "Pour toute question ou signalement sécurité, contactez EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom ou contact@nivadesk.co.uk."
    ]
  },
  Italiano: {
    lastUpdatedLabel: "Ultimo aggiornamento",
    introTitle: "Panoramica sulla sicurezza di NivaDesk",
    introParagraphs: [
      "Una panoramica pratica di come NivaDesk protegge account, workspace, file e dati aziendali.",
      "NivaDesk è gestito da EGGCRAFT LIMITED. Contatto: contact@nivadesk.co.uk. Nessun sistema è completamente privo di rischi, ma usiamo misure tecniche e organizzative ragionevoli."
    ],
    sectionTitles: [
      "Principi di sicurezza",
      "Sicurezza dell'account",
      "Isolamento dei workspace",
      "Controllo accessi basato sui ruoli",
      "Client files e contenuti caricati",
      "Infrastruttura cloud e storage",
      "Crittografia e sicurezza della trasmissione",
      "Modalità offline e dati locali",
      "Log attività e informazioni di audit",
      "Sicurezza pagamenti e fatturazione",
      "Accesso di NivaDesk ai dati dei clienti",
      "Backup, conservazione e ripristino",
      "Risposta a vulnerabilità e incidenti",
      "Responsabilità dei clienti",
      "Esportazione dati e cancellazione account",
      "Limiti della sicurezza",
      "Policy correlate",
      "Contatti"
    ],
    sectionSummaries: [
      "NivaDesk si basa su accesso autorizzato ai workspace, autenticazione moderna, permessi per ruolo, infrastruttura affidabile, accesso limitato ai dati, opzioni export/deletion e miglioramento continuo.",
      "Gli utenti possono accedere con email/password, Google, Apple o altri metodi supportati. Le password sono gestite da sistemi sicuri e non salvate in chiaro; utenti e dispositivi devono essere protetti.",
      "I dati aziendali sono organizzati in workspace e l'accesso dipende da membership e ruoli. Gli utenti dovrebbero vedere solo i propri workspace e i membri rimossi non dovrebbero più avere accesso.",
      "NivaDesk supporta ruoli come Owner, Member, View Only e Workflow Only per limitare l'accesso in base alla responsabilità, specialmente per dati finanziari e client files.",
      "I file caricati sono controllati da permessi workspace e ruolo. Possono applicarsi limiti storage/upload, metadata, restrizioni tipo file e controlli anti-abuso.",
      "NivaDesk può usare provider affidabili per autenticazione, database, cloud storage, hosting, pagamenti, analytics, crash reporting ed email delivery, secondo Privacy Policy e termini di protezione dati.",
      "Usiamo comunicazioni cifrate dove appropriato. NivaDesk non conserva numeri completi di carta; la sicurezza della cache locale dipende anche da dispositivo, sistema operativo e impostazioni.",
      "Accesso offline, cache locale e sync pending possono aiutare senza connessione stabile. I dati offline possono restare sul dispositivo; passcode, biometria e cifratura sono importanti.",
      "History logs, workflow logs, file audit metadata e technical logs possono supportare trasparenza, troubleshooting, sicurezza e responsabilità del team. La retention dipende da requisiti legali, tecnici e prodotto.",
      "I pagamenti possono essere gestiti da Stripe, Apple App Store, Google Play o altri provider. NivaDesk non conserva full card details e riceve solo dati billing limitati.",
      "NivaDesk non ispeziona regolarmente il contenuto dei workspace. Accesso può servire per supporto, troubleshooting, compliance, security investigation, abuse prevention o manutenzione, limitato al minimo necessario.",
      "Backup e sistemi di retention possono proteggere da perdita accidentale, interruzione o errore tecnico. Gli utenti dovrebbero mantenere copie proprie di file aziendali critici.",
      "Se rileviamo vulnerabilità o incidenti, valutiamo gravità e impatto, investighiamo, limitiamo accesso se necessario, applichiamo fix, ruotiamo credenziali e notifichiamo quando richiesto dalla legge.",
      "La sicurezza è condivisa: password forti, dispositivi protetti, inviti solo a persone fidate, rimozione ex membri, ruoli assegnati con cura e backup restano responsabilità degli utenti.",
      "Export e account deletion possono dipendere da ruolo, permessi, piano e disponibilità tecnica. Cerchiamo di permettere export dei dati esistenti anche dopo scadenza del piano quando possibile.",
      "Nessun sistema può essere garantito completamente sicuro. Trasmissione internet, device compromise, password deboli, phishing, account condivisi, malware, errore umano o terze parti possono creare rischi.",
      "Questa panoramica va letta con Privacy Policy, Terms of Service, Cookie Policy, Account Deletion Policy, Refund & Cancellation Policy e, se applicabili, DPA, Subprocessors e Acceptable Use Policy.",
      "Per domande o segnalazioni di sicurezza, contatta EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom oppure contact@nivadesk.co.uk."
    ]
  },
  "Español (Spanish)": {
    lastUpdatedLabel: "Última actualización",
    introTitle: "Resumen de seguridad de NivaDesk",
    introParagraphs: [
      "Un resumen práctico de cómo NivaDesk protege cuentas, workspaces, archivos y datos empresariales.",
      "NivaDesk es operado por EGGCRAFT LIMITED. Contacto: contact@nivadesk.co.uk. Ningún sistema está libre de riesgos, pero usamos medidas técnicas y organizativas razonables."
    ],
    sectionTitles: [
      "Principios de seguridad",
      "Seguridad de la cuenta",
      "Aislamiento de workspaces",
      "Control de acceso basado en roles",
      "Client files y contenido subido",
      "Infraestructura cloud y almacenamiento",
      "Cifrado y seguridad de transmisión",
      "Modo offline y datos locales",
      "Logs de actividad e información de auditoría",
      "Seguridad de pagos y facturación",
      "Acceso de NivaDesk a datos de clientes",
      "Backups, retención y recuperación",
      "Respuesta a vulnerabilidades e incidentes",
      "Responsabilidades del cliente",
      "Exportación de datos y eliminación de cuenta",
      "Limitaciones de seguridad",
      "Políticas relacionadas",
      "Contacto"
    ],
    sectionSummaries: [
      "NivaDesk se basa en acceso autorizado a workspaces, autenticación moderna, permisos por rol, infraestructura confiable, acceso limitado a datos, opciones de export/deletion y mejora continua.",
      "Los usuarios pueden iniciar sesión con email/password, Google, Apple u otros métodos. Las contraseñas se gestionan con sistemas seguros y no se guardan en texto plano; los usuarios deben proteger credenciales y dispositivos.",
      "Los datos empresariales se organizan en workspaces y el acceso depende de membresía y roles. Los usuarios solo deberían ver sus workspaces y quienes sean removidos no deberían conservar acceso.",
      "NivaDesk admite roles como Owner, Member, View Only y Workflow Only para limitar acceso según responsabilidad, especialmente en datos financieros y client files.",
      "Los archivos subidos se controlan según permisos del workspace y rol. Pueden aplicar límites de storage/upload, metadata, restricciones de tipo de archivo y controles contra abuso.",
      "NivaDesk puede usar proveedores confiables para autenticación, base de datos, cloud storage, hosting, pagos, analytics, crash reporting y email delivery según la Privacy Policy.",
      "Usamos comunicación cifrada cuando corresponde. NivaDesk no almacena números completos de tarjeta; la seguridad del cache local también depende del dispositivo, sistema operativo y ajustes.",
      "El acceso offline, cache local y pending sync pueden ayudar con conexión inestable. Los datos offline pueden guardarse en el dispositivo; passcodes, biometría y cifrado ayudan a protegerlos.",
      "History logs, workflow logs, file audit metadata y technical logs pueden apoyar transparencia, troubleshooting, seguridad y responsabilidad del equipo. La retención depende de requisitos legales, técnicos y de producto.",
      "Los pagos pueden procesarse con Stripe, Apple App Store, Google Play u otros proveedores. NivaDesk no guarda full card details y solo puede recibir información de billing limitada.",
      "NivaDesk no inspecciona rutinariamente el contenido de workspaces. El acceso puede ser necesario para soporte, compliance, investigación de seguridad, prevención de abuso o mantenimiento, limitado al mínimo necesario.",
      "Backups y sistemas de retención pueden reducir riesgos de pérdida, interrupción o fallo técnico. Los usuarios deben mantener sus propias copias de archivos y registros críticos.",
      "Si conocemos una vulnerabilidad o incidente, evaluamos gravedad e impacto, investigamos, limitamos acceso si hace falta, aplicamos fixes, rotamos credenciales y notificamos cuando la ley lo exige.",
      "La seguridad es compartida: contraseñas fuertes, dispositivos protegidos, invitaciones a usuarios confiables, remover ex miembros, asignar roles cuidadosamente y mantener backups son responsabilidades del usuario.",
      "La exportación y eliminación de cuenta pueden depender de rol, permisos, plan y disponibilidad técnica. Buscamos permitir export de datos existentes incluso tras expirar un plan cuando sea posible.",
      "Ningún sistema puede garantizar seguridad total. Transmisión por internet, dispositivos comprometidos, contraseñas débiles, phishing, cuentas compartidas, malware, errores de usuario o terceros pueden crear riesgos.",
      "Este resumen debe leerse junto con Privacy Policy, Terms of Service, Cookie Policy, Account Deletion Policy, Refund & Cancellation Policy y, cuando aplique, DPA, Subprocessors y Acceptable Use Policy.",
      "Para preguntas o reportes de seguridad, contacta a EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom o contact@nivadesk.co.uk."
    ]
  },
  Português: {
    lastUpdatedLabel: "Última atualização",
    introTitle: "Resumo de Segurança da NivaDesk",
    introParagraphs: [
      "Um resumo prático de como a NivaDesk protege contas, workspaces, ficheiros e dados empresariais.",
      "A NivaDesk é operada pela EGGCRAFT LIMITED. Contacto: contact@nivadesk.co.uk. Nenhum sistema é livre de risco, mas usamos medidas técnicas e organizacionais razoáveis."
    ],
    sectionTitles: [
      "Princípios de segurança",
      "Segurança da conta",
      "Isolamento de workspaces",
      "Controlo de acesso por função",
      "Client files e conteúdo carregado",
      "Infraestrutura cloud e armazenamento",
      "Encriptação e segurança de transmissão",
      "Modo offline e dados locais",
      "Logs de atividade e auditoria",
      "Segurança de pagamentos e faturação",
      "Acesso da NivaDesk a dados de clientes",
      "Backups, retenção e recuperação",
      "Resposta a vulnerabilidades e incidentes",
      "Responsabilidades dos clientes",
      "Exportação de dados e eliminação de conta",
      "Limitações de segurança",
      "Políticas relacionadas",
      "Contacto"
    ],
    sectionSummaries: [
      "A NivaDesk baseia-se em acesso autorizado a workspaces, autenticação moderna, permissões por função, infraestrutura confiável, acesso limitado a dados, opções de export/deletion e melhoria contínua.",
      "Utilizadores podem entrar com email/password, Google, Apple ou outros métodos suportados. Passwords são tratadas por sistemas seguros e não guardadas em texto simples; utilizadores devem proteger credenciais e dispositivos.",
      "Dados empresariais são organizados em workspaces e o acesso depende de membership e roles. Utilizadores devem ver apenas os seus workspaces e membros removidos não devem manter acesso.",
      "A NivaDesk suporta roles como Owner, Member, View Only e Workflow Only para limitar acesso conforme responsabilidade, especialmente em dados financeiros e client files.",
      "Ficheiros carregados são controlados por permissões de workspace e role. Podem aplicar-se limites de storage/upload, metadata, restrições de tipo de ficheiro e controlos anti-abuso.",
      "A NivaDesk pode usar fornecedores confiáveis para autenticação, base de dados, cloud storage, hosting, pagamentos, analytics, crash reporting e email delivery conforme a Privacy Policy.",
      "Usamos comunicação encriptada quando apropriado. A NivaDesk não guarda números completos de cartão; segurança de cache local também depende de dispositivo, sistema operativo e definições.",
      "Acesso offline, cache local e pending sync podem ajudar sem ligação estável. Dados offline podem ficar no dispositivo; passcodes, biometria e encriptação ajudam a protegê-los.",
      "History logs, workflow logs, file audit metadata e technical logs podem apoiar transparência, troubleshooting, segurança e responsabilidade da equipa. Retenção depende de requisitos legais, técnicos e produto.",
      "Pagamentos podem ser processados por Stripe, Apple App Store, Google Play ou outros providers. A NivaDesk não guarda full card details e recebe apenas billing information limitada.",
      "A NivaDesk não inspeciona rotineiramente conteúdo de workspace. Acesso pode ser necessário para suporte, compliance, investigação de segurança, prevenção de abuso ou manutenção, limitado ao mínimo necessário.",
      "Backups e sistemas de retenção podem reduzir riscos de perda, interrupção ou falha técnica. Utilizadores devem manter cópias próprias de ficheiros e registos críticos.",
      "Se soubermos de vulnerabilidade ou incidente, avaliamos gravidade e impacto, investigamos, limitamos acesso se necessário, aplicamos correções, rodamos credenciais e notificamos quando exigido por lei.",
      "Segurança é partilhada: passwords fortes, dispositivos protegidos, convites apenas a utilizadores confiáveis, remoção de antigos membros, roles cuidadosas e backups são responsabilidades do utilizador.",
      "Exportação e eliminação de conta podem depender de role, permissões, plano e disponibilidade técnica. Procuramos permitir export de dados existentes mesmo após expiração de plano quando possível.",
      "Nenhum sistema pode garantir segurança total. Transmissão internet, dispositivos comprometidos, passwords fracas, phishing, contas partilhadas, malware, erro humano ou terceiros podem criar riscos.",
      "Este resumo deve ser lido com Privacy Policy, Terms of Service, Cookie Policy, Account Deletion Policy, Refund & Cancellation Policy e, se aplicável, DPA, Subprocessors e Acceptable Use Policy.",
      "Para questões ou reportes de segurança contacte EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom ou contact@nivadesk.co.uk."
    ]
  },
  "Русский (Russian)": {
    lastUpdatedLabel: "Последнее обновление",
    introTitle: "Обзор безопасности NivaDesk",
    introParagraphs: [
      "Практический обзор того, как NivaDesk защищает аккаунты, workspaces, файлы и бизнес-данные.",
      "NivaDesk управляется EGGCRAFT LIMITED. Контакт: contact@nivadesk.co.uk. Ни одна система не является полностью безрисковой, но мы используем разумные технические и организационные меры."
    ],
    sectionTitles: [
      "Принципы безопасности",
      "Безопасность аккаунта",
      "Изоляция workspaces",
      "Ролевой контроль доступа",
      "Client files и загруженный контент",
      "Cloud инфраструктура и хранение",
      "Шифрование и безопасность передачи",
      "Offline mode и локальные данные",
      "Activity logs и audit information",
      "Безопасность платежей и billing",
      "Доступ NivaDesk к данным клиентов",
      "Backups, retention и recovery",
      "Vulnerability и incident response",
      "Обязанности клиентов",
      "Data export и account deletion",
      "Ограничения безопасности",
      "Связанные политики",
      "Контакты"
    ],
    sectionSummaries: [
      "NivaDesk строится вокруг авторизованного доступа к workspaces, современной аутентификации, ролевых разрешений, надежной инфраструктуры, ограниченного доступа к данным, export/deletion и постоянного улучшения.",
      "Пользователи могут входить через email/password, Google, Apple или другие методы. Пароли обрабатываются безопасными системами и не хранятся plain text; пользователи должны защищать логины и устройства.",
      "Бизнес-данные организованы в workspaces, а доступ зависит от membership и roles. Пользователи должны видеть только свои workspaces, а удаленные участники не должны сохранять доступ.",
      "NivaDesk поддерживает роли Owner, Member, View Only и Workflow Only, чтобы ограничивать доступ по ответственности, особенно для финансовых данных и client files.",
      "Загруженные файлы контролируются permissions workspace и role. Могут применяться storage/upload limits, metadata, ограничения типов файлов и abuse prevention controls.",
      "NivaDesk может использовать надежных providers для authentication, database, cloud storage, hosting, payments, analytics, crash reporting и email delivery согласно Privacy Policy.",
      "Мы используем encrypted communication там, где это уместно. NivaDesk не хранит full card numbers; безопасность local cache также зависит от устройства, OS и настроек.",
      "Offline access, local caching и pending sync могут помогать при нестабильном интернете. Offline data может временно храниться на устройстве; passcodes, biometrics и encryption важны.",
      "History logs, workflow logs, file audit metadata и technical logs помогают transparency, troubleshooting, security и accountability. Retention зависит от legal, technical и product requirements.",
      "Платежи могут обрабатываться Stripe, Apple App Store, Google Play или другими providers. NivaDesk не хранит full card details и получает только limited billing information.",
      "NivaDesk не проверяет workspace content routinely. Доступ может понадобиться для support, troubleshooting, compliance, security investigations, abuse prevention или maintenance и ограничивается минимумом.",
      "Backups и retention systems помогают от accidental loss, service disruption или technical failure. Пользователи должны иметь свои backups critical business files.",
      "При vulnerability или incident мы оцениваем severity и impact, расследуем, ограничиваем доступ при необходимости, исправляем, rotate credentials и уведомляем, когда это требуется законом.",
      "Security shared: strong passwords, protected devices, trusted invites, removing old members, careful roles и backups являются обязанностью пользователей.",
      "Data export и account deletion зависят от role, permissions, plan и technical availability. Мы стремимся поддерживать export existing business data даже после окончания paid plan, где возможно.",
      "Ни одна система не гарантирует полную безопасность. Internet transmission, compromised devices, weak passwords, phishing, shared accounts, malware, user error или third-party issues создают риски.",
      "Этот обзор следует читать вместе с Privacy Policy, Terms of Service, Cookie Policy, Account Deletion Policy, Refund & Cancellation Policy и при необходимости DPA, Subprocessors и Acceptable Use Policy.",
      "Для вопросов или сообщений о безопасности свяжитесь с EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom или contact@nivadesk.co.uk."
    ]
  },
  "日本語 (Japanese)": {
    lastUpdatedLabel: "最終更新日",
    introTitle: "NivaDesk セキュリティ概要",
    introParagraphs: [
      "NivaDesk がアカウント、workspace、ファイル、業務データを保護する方法の実用的な概要です。",
      "NivaDesk は EGGCRAFT LIMITED が運営します。連絡先: contact@nivadesk.co.uk。完全にリスクのないシステムはありませんが、合理的な技術的・組織的対策を用いています。"
    ],
    sectionTitles: [
      "セキュリティ原則",
      "アカウントセキュリティ",
      "Workspace の分離",
      "ロールベースのアクセス制御",
      "Client files とアップロードコンテンツ",
      "クラウドインフラとストレージ",
      "暗号化と通信セキュリティ",
      "オフラインモードとローカルデータ",
      "アクティビティログと監査情報",
      "支払いと請求のセキュリティ",
      "NivaDesk による顧客データへのアクセス",
      "バックアップ、保持、復旧",
      "脆弱性とインシデント対応",
      "顧客の責任",
      "データエクスポートとアカウント削除",
      "セキュリティの限界",
      "関連ポリシー",
      "お問い合わせ"
    ],
    sectionSummaries: [
      "NivaDesk は、authorized workspace access、modern authentication、role permissions、trusted infrastructure、limited data access、export/deletion options、継続的な改善を基本にしています。",
      "ユーザーは email/password、Google、Apple などでログインできます。パスワードは安全な認証システムで処理され、plain text では保存されません。ログイン情報と端末保護はユーザー責任です。",
      "業務データは workspaces 内に整理され、access は membership と role permissions により管理されます。ユーザーは自分の workspace のみを見られ、削除された member はアクセスできないべきです。",
      "NivaDesk は Owner、Member、View Only、Workflow Only などの roles を支援し、特に financial data や client files へのアクセスを責任に応じて制限します。",
      "アップロードファイルは workspace と role permissions により管理されます。plan により storage/upload limits、metadata、file type restrictions、abuse prevention controls が適用されます。",
      "NivaDesk は authentication、database、cloud storage、hosting、payments、analytics、crash reporting、email delivery に trusted providers を利用する場合があります。",
      "適切な場所で encrypted communication を使用します。NivaDesk は full card numbers を保存しません。local cache の安全性は端末、OS、設定にも依存します。",
      "offline access、local caching、pending sync は不安定な接続時の作業を支援します。offline data は端末に保存される場合があり、passcode、biometrics、encryption が重要です。",
      "history logs、workflow logs、file audit metadata、technical logs は透明性、troubleshooting、security、team accountability に役立つ場合があります。保持期間は要件により異なります。",
      "Payments は Stripe、Apple App Store、Google Play などで処理されます。NivaDesk は full card details を保存せず、limited billing information のみ受け取ることがあります。",
      "NivaDesk は customer workspace content を routine に確認しません。support、legal compliance、security investigation、abuse prevention、maintenance に必要な場合のみ、最小限でアクセスします。",
      "backups と retention systems は accidental loss、service disruption、technical failure のリスク軽減に役立ちます。重要ファイルはユーザー自身も backup すべきです。",
      "vulnerability や incident を認識した場合、severity と impact を評価し、調査、アクセス制限、fix、credential rotation、法的通知を必要に応じて行います。",
      "セキュリティは共有責任です。strong passwords、protected devices、trusted invites、old member removal、careful role assignment、critical file backups が重要です。",
      "data export と account deletion は role、permissions、plan、technical availability に依存します。paid plan 終了後も可能な範囲で existing business data export を支援します。",
      "完全な安全を保証できるシステムはありません。internet transmission、device compromise、weak passwords、phishing、shared accounts、malware、user error、third-party issues はリスクです。",
      "この概要は Privacy Policy、Terms of Service、Cookie Policy、Account Deletion Policy、Refund & Cancellation Policy、および必要に応じて DPA、Subprocessors、Acceptable Use Policy と併せて読むべきです。",
      "セキュリティに関する質問や報告は、EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom または contact@nivadesk.co.uk までご連絡ください。"
    ]
  },
  "中文 (Chinese)": {
    lastUpdatedLabel: "最后更新",
    introTitle: "NivaDesk 安全概览",
    introParagraphs: [
      "本页面概述 NivaDesk 如何保护账户、workspaces、文件和业务数据。",
      "NivaDesk 由 EGGCRAFT LIMITED 运营。联系方式: contact@nivadesk.co.uk。没有系统可以完全无风险，但我们使用合理的技术和组织措施。"
    ],
    sectionTitles: [
      "安全原则",
      "账户安全",
      "Workspace 隔离",
      "基于角色的访问控制",
      "Client files 和上传内容",
      "云基础设施和存储",
      "加密和传输安全",
      "离线模式和本地数据",
      "活动日志和审计信息",
      "支付和计费安全",
      "NivaDesk 对客户数据的访问",
      "备份、保留和恢复",
      "漏洞和事件响应",
      "客户责任",
      "数据导出和账户删除",
      "安全限制",
      "相关政策",
      "联系我们"
    ],
    sectionSummaries: [
      "NivaDesk 的原则包括授权 workspace 访问、现代认证、角色权限、可信基础设施、有限数据访问、export/deletion 选项以及持续改进。",
      "用户可通过 email/password、Google、Apple 等方式登录。密码由安全认证系统处理，不以明文保存；用户应保护登录信息和设备。",
      "业务数据按 workspaces 组织，访问由 membership 和 role permissions 控制。用户应只看到自己的 workspaces，被移除成员不应继续访问。",
      "NivaDesk 支持 Owner、Member、View Only、Workflow Only 等角色，用于按职责限制访问，尤其是财务数据和 client files。",
      "上传文件按 workspace 和 role permissions 控制。根据计划可能存在 storage/upload limits、metadata、file type restrictions 和 abuse prevention controls。",
      "NivaDesk 可使用可信第三方提供 authentication、database、cloud storage、hosting、payments、analytics、crash reporting 和 email delivery。",
      "在适当情况下使用 encrypted communication。NivaDesk 不存储完整银行卡号；local cache 安全也取决于设备、操作系统和设置。",
      "offline access、local caching 和 pending sync 可在连接不稳定时继续工作。offline data 可能保存在设备上，passcode、biometrics 和 encryption 很重要。",
      "history logs、workflow logs、file audit metadata 和 technical logs 可用于透明度、troubleshooting、安全和团队责任。保留时间取决于法律、技术和产品需求。",
      "支付可由 Stripe、Apple App Store、Google Play 等处理。NivaDesk 不存储 full card details，只可能收到 limited billing information。",
      "NivaDesk 不会例行检查 customer workspace content。只有在 support、compliance、security investigation、abuse prevention 或 maintenance 需要时才可能最小化访问。",
      "backups 和 retention systems 可降低 accidental loss、service disruption 或 technical failure 风险。用户应自行备份关键业务文件。",
      "如果发现 vulnerability 或 incident，我们会评估 severity 和 impact，调查、必要时限制访问、修复、rotate credentials，并按法律要求通知。",
      "安全是共同责任。strong passwords、protected devices、trusted invites、removing old members、careful roles 和 backups 都是用户责任。",
      "data export 和 account deletion 取决于 role、permissions、plan 和 technical availability。即使 paid plan 到期，我们也尽力允许导出现有业务数据。",
      "没有系统可保证完全安全。internet transmission、device compromise、weak passwords、phishing、shared accounts、malware、user error 或 third-party issues 都可能带来风险。",
      "本概览应与 Privacy Policy、Terms of Service、Cookie Policy、Account Deletion Policy、Refund & Cancellation Policy 以及适用的 DPA、Subprocessors、Acceptable Use Policy 一起阅读。",
      "如有安全问题或报告，请联系 EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom 或 contact@nivadesk.co.uk。"
    ]
  },
  "العربية (Arabic)": {
    lastUpdatedLabel: "آخر تحديث",
    introTitle: "نظرة عامة على أمان NivaDesk",
    introParagraphs: [
      "نظرة عملية على كيفية حماية NivaDesk للحسابات وworkspaces والملفات وبيانات الأعمال.",
      "تدير EGGCRAFT LIMITED خدمة NivaDesk. التواصل: contact@nivadesk.co.uk. لا يوجد نظام بلا مخاطر تماماً، لكننا نستخدم تدابير تقنية وتنظيمية معقولة."
    ],
    sectionTitles: [
      "مبادئ الأمان",
      "أمان الحساب",
      "عزل workspaces",
      "التحكم في الوصول حسب الدور",
      "Client files والمحتوى المرفوع",
      "البنية السحابية والتخزين",
      "التشفير وأمان النقل",
      "الوضع offline والبيانات المحلية",
      "سجلات النشاط ومعلومات التدقيق",
      "أمان المدفوعات والفوترة",
      "وصول NivaDesk إلى بيانات العملاء",
      "النسخ الاحتياطي والاحتفاظ والاسترداد",
      "الاستجابة للثغرات والحوادث",
      "مسؤوليات العملاء",
      "تصدير البيانات وحذف الحساب",
      "حدود الأمان",
      "السياسات ذات الصلة",
      "التواصل"
    ],
    sectionSummaries: [
      "تعتمد NivaDesk على الوصول المصرح به إلى workspaces والمصادقة الحديثة وأذونات الأدوار والبنية الموثوقة والوصول المحدود للبيانات وخيارات export/deletion والتحسين المستمر.",
      "يمكن للمستخدمين الدخول عبر email/password أو Google أو Apple أو طرق مدعومة أخرى. كلمات المرور تعالج بأنظمة آمنة ولا تحفظ كنص عادي؛ حماية الدخول والأجهزة مسؤولية المستخدم.",
      "تنظم بيانات الأعمال داخل workspaces ويتحكم membership وrole permissions في الوصول. يجب أن يرى المستخدمون workspaces الخاصة بهم فقط، وألا يحتفظ الأعضاء المحذوفون بالوصول.",
      "تدعم NivaDesk أدواراً مثل Owner وMember وView Only وWorkflow Only لتقييد الوصول حسب المسؤولية، خصوصاً للبيانات المالية وclient files.",
      "تتحكم أذونات workspace والدور في الملفات المرفوعة. قد تطبق حدود storage/upload وmetadata وقيود نوع الملف وضوابط abuse prevention حسب الخطة.",
      "قد تستخدم NivaDesk مزودين موثوقين للمصادقة وقواعد البيانات وcloud storage والاستضافة والمدفوعات والتحليلات وتقارير الأعطال وإرسال البريد وفق Privacy Policy.",
      "نستخدم encrypted communication حيث يكون مناسباً. لا تخزن NivaDesk أرقام البطاقات كاملة؛ يعتمد أمان local cache أيضاً على الجهاز والنظام والإعدادات.",
      "قد تساعد offline access وlocal caching وpending sync عند ضعف الاتصال. قد تخزن بيانات offline على الجهاز؛ passcodes وbiometrics وencryption مهمة.",
      "قد تدعم history logs وworkflow logs وfile audit metadata وtechnical logs الشفافية واستكشاف الأخطاء والأمان ومساءلة الفريق. مدة الاحتفاظ تعتمد على المتطلبات.",
      "قد تتم المدفوعات عبر Stripe أو Apple App Store أو Google Play أو غيرها. لا تحفظ NivaDesk full card details وقد تتلقى billing information محدودة فقط.",
      "لا تفحص NivaDesk محتوى workspace بشكل روتيني. قد يلزم وصول محدود للدعم أو compliance أو security investigation أو abuse prevention أو maintenance.",
      "تساعد backups وretention systems في تقليل مخاطر الفقد أو التعطل أو الفشل التقني. يجب على المستخدمين الاحتفاظ بنسخ احتياطية لملفات الأعمال المهمة.",
      "عند معرفة vulnerability أو incident، نقيم severity وimpact، نحقق، نحد الوصول عند الحاجة، نطبق إصلاحات، ندير credentials، ونخطر عند وجوب القانون.",
      "الأمان مسؤولية مشتركة: كلمات مرور قوية، أجهزة محمية، دعوة مستخدمين موثوقين، إزالة الأعضاء السابقين، أدوار دقيقة وbackups كلها مسؤوليات المستخدم.",
      "يعتمد data export وaccount deletion على role وpermissions وplan وtechnical availability. نسعى للسماح بتصدير البيانات الحالية حتى بعد انتهاء paid plan حيث يمكن ذلك.",
      "لا يمكن ضمان أمان أي نظام بالكامل. internet transmission وdevice compromise وweak passwords وphishing وshared accounts وmalware وuser error وthird-party issues قد تخلق مخاطر.",
      "يجب قراءة هذا الملخص مع Privacy Policy وTerms of Service وCookie Policy وAccount Deletion Policy وRefund & Cancellation Policy، وعند التطبيق DPA وSubprocessors وAcceptable Use Policy.",
      "للأسئلة أو تقارير الأمان، تواصل مع EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom أو contact@nivadesk.co.uk."
    ]
  },
  "हिन्दी (Hindi)": {
    lastUpdatedLabel: "अंतिम अपडेट",
    introTitle: "NivaDesk Security Overview",
    introParagraphs: [
      "NivaDesk accounts, workspaces, files और business data को कैसे protect करता है इसका practical overview.",
      "NivaDesk EGGCRAFT LIMITED द्वारा संचालित है। Contact: contact@nivadesk.co.uk. कोई system पूरी तरह risk-free नहीं है, लेकिन हम reasonable technical और organisational measures इस्तेमाल करते हैं।"
    ],
    sectionTitles: [
      "Security principles",
      "Account security",
      "Workspace isolation",
      "Role-based access control",
      "Client files और uploaded content",
      "Cloud infrastructure और storage",
      "Encryption और transmission security",
      "Offline mode और local data",
      "Activity logs और audit information",
      "Payments और billing security",
      "NivaDesk द्वारा customer data access",
      "Backups, retention और recovery",
      "Vulnerability और incident response",
      "Customer responsibilities",
      "Data export और account deletion",
      "Security limitations",
      "Related policies",
      "Contact"
    ],
    sectionSummaries: [
      "NivaDesk authorised workspace access, modern authentication, role permissions, trusted infrastructure, limited data access, export/deletion options और continuous security improvement पर आधारित है।",
      "Users email/password, Google, Apple या supported methods से sign in कर सकते हैं। Passwords secure authentication systems से handle होते हैं और plain text में stored नहीं होते; login और device security users की जिम्मेदारी है।",
      "Business data workspaces में organised है और access membership तथा role permissions से controlled होता है। Users केवल अपने workspaces देखें और removed members का access हटना चाहिए।",
      "NivaDesk Owner, Member, View Only और Workflow Only जैसे roles support करता है ताकि financial data और client files जैसे sensitive areas में access responsibility के अनुसार limited हो।",
      "Uploaded files workspace और role permissions से controlled होते हैं। Plan के अनुसार storage/upload limits, metadata, file type restrictions और abuse prevention controls लागू हो सकते हैं।",
      "NivaDesk authentication, database, cloud storage, hosting, payments, analytics, crash reporting और email delivery के लिए trusted providers use कर सकता है, Privacy Policy के अनुसार।",
      "जहाँ appropriate हो वहाँ encrypted communication use होती है। NivaDesk full card numbers store नहीं करता; local cache security device, OS और settings पर भी निर्भर करती है।",
      "Offline access, local caching और pending sync unstable internet में work continue करने में मदद कर सकते हैं। Offline data device पर temporarily stored हो सकता है; passcodes, biometrics और encryption important हैं।",
      "History logs, workflow logs, file audit metadata और technical logs transparency, troubleshooting, security और team accountability support कर सकते हैं। Retention legal, technical और product needs पर depend करती है।",
      "Payments Stripe, Apple App Store, Google Play या other providers से handled हो सकते हैं। NivaDesk full card details store नहीं करता और limited billing information receive कर सकता है।",
      "NivaDesk customer workspace content routinely inspect नहीं करता। Support, troubleshooting, legal compliance, security investigations, abuse prevention या maintenance के लिए minimum necessary access हो सकता है।",
      "Backups और retention systems accidental loss, service disruption या technical failure से protect करने में मदद कर सकते हैं। Users critical business files की अपनी backup copies रखें।",
      "Vulnerability या incident पता चलने पर हम severity और impact assess करते हैं, investigate करते हैं, जरूरत पर access restrict, fixes apply, credentials rotate और legally required notice देते हैं।",
      "Security shared responsibility है: strong passwords, protected devices, trusted invites, old members remove करना, careful roles और critical backups users की जिम्मेदारी हैं।",
      "Data export और account deletion role, permissions, plan और technical availability पर depend कर सकते हैं। Paid plan expire/cancel होने पर भी technically और legally possible हो तो existing business data export support करने का लक्ष्य है।",
      "कोई system completely secure guarantee नहीं हो सकता। Internet transmission, device compromise, weak passwords, phishing, shared accounts, malware, user error या third-party issues risk बना सकते हैं।",
      "यह overview Privacy Policy, Terms of Service, Cookie Policy, Account Deletion Policy, Refund & Cancellation Policy और जहाँ applicable हो DPA, Subprocessors, Acceptable Use Policy के साथ पढ़ा जाना चाहिए।",
      "Security questions या concerns के लिए EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom या contact@nivadesk.co.uk पर संपर्क करें।"
    ]
  }
};

const SECURITY_OVERVIEW_LABELS: Partial<Record<StudioLanguage, string>> = {
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

const LOCALIZED_SECURITY_OVERVIEWS: Partial<Record<StudioLanguage, PrivacyPolicySection[]>> = Object.fromEntries(
  Object.entries(SECURITY_OVERVIEW_DRAFTS).map(([language, copy]) => [
    language,
    buildLocalizedSecurityOverview(copy as LocalizedSecurityDraft)
  ])
) as Partial<Record<StudioLanguage, PrivacyPolicySection[]>>;

export function getSecurityOverviewSections(language: StudioLanguage | string | null | undefined) {
  const normalized = language as StudioLanguage;
  return LOCALIZED_SECURITY_OVERVIEWS[normalized] ?? SECURITY_OVERVIEW_SECTIONS;
}

export function getSecurityOverviewLastUpdatedLabel(language: StudioLanguage | string | null | undefined) {
  return SECURITY_OVERVIEW_LABELS[language as StudioLanguage] ?? "Last updated";
}
