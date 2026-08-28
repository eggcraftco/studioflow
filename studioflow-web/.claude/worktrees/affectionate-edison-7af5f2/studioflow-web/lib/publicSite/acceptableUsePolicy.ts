import type { PrivacyPolicySection } from "@/lib/publicSite/privacyPolicy";
import type { StudioLanguage } from "@/lib/studioflow/language";

export const ACCEPTABLE_USE_POLICY_LAST_UPDATED = "13 May 2026";

export const ACCEPTABLE_USE_POLICY_SECTIONS: PrivacyPolicySection[] = [
  {
    title: "NivaDesk Acceptable Use Policy",
    paragraphs: [
      "This Acceptable Use Policy explains what is and is not allowed when using NivaDesk, including our website, web app, mobile apps, desktop apps, workspaces, file uploads, collaboration features, integrations, and related services.",
      "This policy forms part of our Terms of Service. By using NivaDesk, you agree to follow this Acceptable Use Policy. If you use NivaDesk on behalf of a business, you are responsible for ensuring that your team members, invited users, contractors, and authorised users also follow this policy."
    ]
  },
  {
    title: "1. Purpose of this policy",
    paragraphs: [
      "NivaDesk is designed to help small businesses, studios, makers, freelancers, and teams manage orders, clients, tasks, files, notes, workflows, timelines, and team access in one organised workspace.",
      "To keep NivaDesk safe, reliable, lawful, and useful for all users, this policy sets out rules for acceptable use, prohibited content, security, file uploads, communications, integrations, and platform abuse."
    ]
  },
  {
    title: "2. General use requirements",
    paragraphs: ["You must use NivaDesk responsibly and only for lawful business or personal work-management purposes."],
    bullets: [
      "provide accurate account and billing information where required;",
      "keep your login details and devices secure;",
      "use NivaDesk only in accordance with applicable laws and regulations;",
      "respect the rights, privacy, and confidentiality of others;",
      "make sure you have permission to upload, store, process, or share any data you add to NivaDesk;",
      "use team roles, workspace permissions, and access controls responsibly."
    ]
  },
  {
    title: "3. Prohibited unlawful use",
    paragraphs: [
      "You must not use NivaDesk for unlawful, harmful, fraudulent, or abusive activity. This includes using NivaDesk to create, store, upload, manage, transmit, or support content or activity that:"
    ],
    bullets: [
      "violates any applicable law or regulation;",
      "facilitates fraud, deception, scams, phishing, or identity theft;",
      "supports money laundering, sanctions evasion, or illegal trade;",
      "encourages, plans, or assists violence, exploitation, or serious harm;",
      "violates export control, sanctions, or trade restrictions;",
      "involves stolen data, unauthorised access credentials, or unlawfully obtained information;",
      "is used to impersonate another person, organisation, or business without permission."
    ]
  },
  {
    title: "4. Prohibited content",
    paragraphs: ["You must not upload, store, share, or process content through NivaDesk that:"],
    bullets: [
      "is illegal, abusive, threatening, harassing, defamatory, hateful, or discriminatory;",
      "exploits, harms, or endangers children or vulnerable people;",
      "contains sexually exploitative, non-consensual, or otherwise unlawful intimate material;",
      "contains malware, viruses, ransomware, spyware, harmful scripts, or malicious code;",
      "infringes copyright, trademark, trade secrets, privacy rights, publicity rights, or other third-party rights;",
      "contains personal data you do not have the right or lawful basis to process;",
      "contains confidential information that you are not authorised to upload or share;",
      "is intended to overload, disrupt, damage, or interfere with NivaDesk or another system."
    ]
  },
  {
    title: "5. File upload and storage rules",
    paragraphs: [
      "NivaDesk may allow users to upload client files, images, PDFs, documents, design files, notes, and other business materials. You are responsible for the files you upload and for ensuring that they are safe, lawful, and appropriate for your workspace.",
      "You must not use NivaDesk file storage to:"
    ],
    bullets: [
      "store or distribute malware, harmful code, pirated files, or illegal materials;",
      "host public file-sharing libraries or content distribution services unrelated to your legitimate workspace use;",
      "bypass storage limits, file size limits, file type limits, or upload safety controls;",
      "store excessive, automated, duplicate, or abusive volumes of files;",
      "upload files that infringe someone else's rights or privacy;",
      "use NivaDesk as your only backup for critical business files."
    ],
    subsections: [
      {
        title: "",
        paragraphs: [
          "We may scan, restrict, quarantine, remove, or block files where necessary to protect users, comply with law, enforce storage limits, investigate abuse, or maintain service security."
        ]
      }
    ]
  },
  {
    title: "6. Client, customer, and third-party data",
    paragraphs: [
      "If you use NivaDesk to manage your own clients, customers, suppliers, employees, contractors, or other third parties, you are responsible for making sure that you have the right to collect, store, use, and process that information.",
      "You must not add personal data, confidential information, or sensitive information to NivaDesk unless you have a lawful basis and appropriate permission to do so. You are responsible for your own privacy notices, contracts, consents, and legal obligations towards your clients and customers."
    ]
  },
  {
    title: "7. Security and access rules",
    paragraphs: [
      "You must not attempt to compromise the security, integrity, availability, or performance of NivaDesk.",
      "You must not:"
    ],
    bullets: [
      "attempt to access accounts, workspaces, files, data, systems, APIs, or networks without permission;",
      "probe, scan, test, or attack NivaDesk systems without our written permission;",
      "bypass authentication, billing, plan limits, storage limits, role permissions, or access controls;",
      "share accounts in a way that avoids user limits, billing requirements, or security controls;",
      "use bots, scripts, or automated tools to overload, scrape, spam, or abuse the service;",
      "interfere with another user's workspace, files, account, or experience;",
      "exploit bugs or vulnerabilities instead of reporting them responsibly."
    ],
    subsections: [
      {
        title: "",
        paragraphs: [
          "If you discover a security issue, please contact us promptly and do not access, modify, delete, download, or disclose data that does not belong to you."
        ]
      }
    ]
  },
  {
    title: "8. Spam, communications, and misuse",
    paragraphs: [
      "You must not use NivaDesk to send spam, abusive communications, misleading messages, phishing attempts, or unwanted bulk communications.",
      "If NivaDesk offers email, notification, sharing, invitation, or client communication features, you must use them responsibly and only where you have permission or a lawful basis to contact the recipient."
    ]
  },
  {
    title: "9. Intellectual property and brand misuse",
    paragraphs: [
      "You must not use NivaDesk to infringe intellectual property rights or misrepresent ownership, authorship, affiliation, endorsement, or approval.",
      "You must not copy, imitate, misuse, or modify the NivaDesk name, logo, website, app interface, brand assets, or product materials without our permission. References to third-party brands, tools, platforms, or services must not imply partnership, endorsement, or affiliation unless such relationship exists."
    ]
  },
  {
    title: "10. Resale, sublicensing, and platform abuse",
    paragraphs: ["Unless we give written permission, you must not:"],
    bullets: [
      "resell, rent, lease, sublicense, or commercially exploit NivaDesk access;",
      "offer NivaDesk as a hosted service or white-label service to third parties;",
      "share paid features with unauthorised users to avoid subscription fees;",
      "copy or reproduce the NivaDesk app, website, workflows, design, or functionality to create a competing service;",
      "reverse engineer or attempt to extract source code except where allowed by law."
    ]
  },
  {
    title: "11. Integrations and third-party services",
    paragraphs: [
      "If NivaDesk offers integrations with third-party services, you must use those integrations in accordance with the third-party provider's terms, policies, and permissions.",
      "You must not use integrations to access data you are not authorised to access, exceed rate limits, send spam, scrape third-party services, or violate third-party platform rules. We may suspend or restrict integrations that create legal, security, operational, or abuse risks."
    ]
  },
  {
    title: "12. Fair usage and service limits",
    paragraphs: [
      "NivaDesk may apply technical, storage, usage, file, workspace, user, API, sync, export, or rate limits depending on your plan and our operational requirements.",
      "You must not attempt to avoid, bypass, manipulate, or abuse these limits. We may restrict accounts, files, workspaces, uploads, downloads, API calls, sync activity, or other usage if we believe the usage is excessive, unsafe, automated, abusive, or harmful to the service."
    ]
  },
  {
    title: "13. Monitoring and enforcement",
    paragraphs: [
      "We do not review all user content before it is uploaded. However, we may investigate activity, review metadata, restrict access, remove content, suspend accounts, or take other action where we believe there may be a breach of this policy, our Terms of Service, the law, third-party rights, or the security of NivaDesk.",
      "Depending on the situation, we may:"
    ],
    bullets: [
      "warn the user or workspace owner;",
      "remove or restrict content;",
      "block uploads, downloads, sharing, or integrations;",
      "temporarily suspend an account or workspace;",
      "permanently terminate access;",
      "preserve or disclose information where required by law;",
      "report unlawful activity to relevant authorities where appropriate."
    ]
  },
  {
    title: "14. Reporting abuse",
    paragraphs: [
      "If you believe someone is misusing NivaDesk, violating this policy, infringing your rights, or uploading unlawful content, please contact us with enough information to review the issue.",
      "Email: contact@nivadesk.co.uk",
      "Please include relevant details such as the workspace, user, file, message, URL, screenshot, order reference, or explanation of the issue where available."
    ]
  },
  {
    title: "15. Changes to this policy",
    paragraphs: [
      "We may update this Acceptable Use Policy from time to time. If we make material changes, we may notify users by email, in-app notice, website notice, or by updating the date at the top of this policy.",
      "Your continued use of NivaDesk after the updated policy becomes effective means you agree to the updated policy."
    ]
  },
  {
    title: "16. Contact",
    paragraphs: [
      "If you have questions about this Acceptable Use Policy, please contact:",
      "EGGCRAFT LIMITED",
      "141 Randolph Avenue",
      "London",
      "W9 1DN",
      "United Kingdom",
      "Email: contact@nivadesk.co.uk"
    ]
  }
];

type LocalizedAcceptableUseDraft = {
  lastUpdatedLabel: string;
  introTitle: string;
  introParagraphs: string[];
  sectionTitles: string[];
  sectionSummaries: string[];
};

function buildLocalizedAcceptableUse(copy: LocalizedAcceptableUseDraft): PrivacyPolicySection[] {
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

const ACCEPTABLE_USE_POLICY_LABELS: Partial<Record<StudioLanguage, string>> = {
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

const ACCEPTABLE_USE_POLICY_DRAFTS: Partial<Record<StudioLanguage, LocalizedAcceptableUseDraft>> = {
  Türkçe: {
    lastUpdatedLabel: "Son güncelleme",
    introTitle: "NivaDesk Kabul Edilebilir Kullanım Politikası",
    introParagraphs: [
      "Bu politika; NivaDesk web sitesi, web app, mobil ve masaüstü uygulamalar, workspaceler, dosya yükleme, iş birliği özellikleri, entegrasyonlar ve ilgili servislerde nelerin izinli olup olmadığını açıklar.",
      "Bu politika Terms of Service'in bir parçasıdır. NivaDesk'i kullanarak bu politikaya uymayı kabul edersiniz. Bir işletme adına kullanıyorsanız ekip üyelerinin ve yetkili kullanıcıların da uymasını sağlamaktan sorumlusunuz."
    ],
    sectionTitles: [
      "1. Politikanın amacı",
      "2. Genel kullanım şartları",
      "3. Yasaklı hukuka aykırı kullanım",
      "4. Yasaklı içerik",
      "5. Dosya yükleme ve depolama kuralları",
      "6. Müşteri ve üçüncü taraf verileri",
      "7. Güvenlik ve erişim kuralları",
      "8. Spam, iletişim ve kötüye kullanım",
      "9. Fikri mülkiyet ve marka kötüye kullanımı",
      "10. Yeniden satış, alt lisans ve platform kötüye kullanımı",
      "11. Entegrasyonlar ve üçüncü taraf servisleri",
      "12. Adil kullanım ve servis limitleri",
      "13. İzleme ve yaptırım",
      "14. Kötüye kullanımı bildirme",
      "15. Politika değişiklikleri",
      "16. İletişim"
    ],
    sectionSummaries: [
      "NivaDesk küçük işletmelerin, stüdyoların, makerların, freelancerların ve ekiplerin sipariş, müşteri, görev, dosya, not, workflow, timeline ve ekip erişimini düzenli bir workspace içinde yönetmesine yardımcı olmak için tasarlanmıştır. Bu politika servisi güvenli, yasal ve güvenilir tutmak için kuralları belirler.",
      "NivaDesk'i sorumlu şekilde ve yalnızca yasal iş veya kişisel iş-yönetimi amaçları için kullanmalısınız. Doğru hesap/fatura bilgisi vermeli, giriş bilgilerinizi korumalı, yasalara uymalı, başkalarının hak ve gizliliğine saygı göstermeli, yüklediğiniz veriler için izin sahibi olmalı ve rol/izinleri dikkatli kullanmalısınız.",
      "NivaDesk yasa dışı, zararlı, hileli veya kötüye kullanım amaçlı kullanılamaz. Dolandırıcılık, phishing, kimlik hırsızlığı, kara para aklama, yaptırım ihlali, yasa dışı ticaret, şiddet veya ciddi zarar desteği, çalıntı veri, izinsiz kimlik bilgisi veya izinsiz taklit yasaktır.",
      "Yasa dışı, tehditkar, taciz edici, hakaret içeren, nefret veya ayrımcılık barındıran, çocukları veya hassas kişileri tehlikeye atan, rıza dışı ya da hukuka aykırı mahrem materyal içeren, malware/virüs barındıran, üçüncü taraf haklarını ihlal eden veya izinsiz kişisel/gizli veri içeren içerik yüklenemez.",
      "Client files, görseller, PDF'ler, dokümanlar ve tasarım dosyaları için yüklenen içeriğin güvenli ve yasal olmasından siz sorumlusunuz. NivaDesk; malware, korsan dosya, ilgisiz public dosya paylaşımı, limitleri aşma, aşırı/otomatik/tekrarlı yükleme, hak ihlali veya tek kritik yedek kullanımı için depolama servisi olarak kullanılamaz.",
      "NivaDesk'e kendi müşterileriniz, tedarikçileriniz, çalışanlarınız, yüklenicileriniz veya üçüncü kişiler hakkında veri eklerseniz, bu veriyi toplama, saklama ve işleme hakkına sahip olmanız gerekir. Gerekli gizlilik bildirimleri, sözleşmeler, rızalar ve yasal yükümlülükler size aittir.",
      "NivaDesk'in güvenliğini, bütünlüğünü, erişilebilirliğini veya performansını tehlikeye atmaya çalışamazsınız. İzinsiz erişim, tarama/test/saldırı, auth veya plan limitlerini aşma, kullanıcı limiti kaçınmak için hesap paylaşımı, bot/script ile aşırı yükleme veya açıkları kötüye kullanma yasaktır.",
      "NivaDesk spam, taciz edici iletişim, yanıltıcı mesaj, phishing veya izinsiz toplu iletişim için kullanılamaz. E-posta, bildirim, paylaşım, davet veya müşteri iletişim özellikleri yalnızca izinli ve yasal dayanağı olan iletişimler için kullanılmalıdır.",
      "NivaDesk fikri mülkiyet ihlali veya sahiplik, yazar, bağlantı, onay ya da destek konusunda yanıltma için kullanılamaz. NivaDesk adı, logosu, sitesi, app arayüzü, marka varlıkları veya ürün materyalleri izinsiz kopyalanamaz, taklit edilemez veya kötüye kullanılamaz.",
      "Yazılı izin olmadan NivaDesk erişimini yeniden satamaz, kiralayamaz, alt lisanslayamaz, white-label servis olarak sunamaz, ücretli özellikleri yetkisiz kişilerle paylaşamaz, rakip servis oluşturmak için app/site/workflow/tasarımı kopyalayamaz veya kaynak kod çıkarmaya çalışamazsınız.",
      "Üçüncü taraf entegrasyonları ilgili sağlayıcının şartlarına, politikalarına ve izinlerine uygun kullanılmalıdır. Yetkisiz veri erişimi, rate limit aşımı, spam, scraping veya platform kurallarını ihlal eden entegrasyon kullanımı kısıtlanabilir veya askıya alınabilir.",
      "NivaDesk planınıza ve operasyonel gerekliliklere göre teknik, depolama, kullanım, dosya, workspace, kullanıcı, API, sync, export veya rate limitleri uygulayabilir. Bu limitlerden kaçınmaya, manipüle etmeye veya kötüye kullanmaya çalışmamalısınız.",
      "Tüm içerikleri yüklenmeden önce incelemeyiz; ancak politika, Terms of Service, hukuk, üçüncü taraf hakları veya güvenlik ihlali şüphesi olduğunda aktiviteyi araştırabilir, metadata inceleyebilir, içeriği kaldırabilir, erişimi kısıtlayabilir veya hesabı/workspace'i askıya alabiliriz.",
      "Birinin NivaDesk'i kötüye kullandığını, bu politikayı ihlal ettiğini, haklarınızı ihlal ettiğini veya hukuka aykırı içerik yüklediğini düşünüyorsanız yeterli bilgiyle bize yazın: contact@nivadesk.co.uk. Workspace, kullanıcı, dosya, mesaj, URL, ekran görüntüsü veya sipariş referansı eklemeniz incelemeye yardımcı olur.",
      "Bu politikayı zaman zaman güncelleyebiliriz. Önemli değişikliklerde e-posta, app içi bildirim, web sitesi bildirimi veya sayfa tarihini güncelleme yoluyla bildirim yapabiliriz. Güncel politikadan sonra kullanmaya devam etmeniz yeni politikayı kabul ettiğiniz anlamına gelir.",
      "Sorular için: EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. E-posta: contact@nivadesk.co.uk."
    ]
  },
  Deutsch: {
    lastUpdatedLabel: "Zuletzt aktualisiert",
    introTitle: "NivaDesk Richtlinie zur akzeptablen Nutzung",
    introParagraphs: [
      "Diese Richtlinie erklärt, was bei der Nutzung von NivaDesk erlaubt und nicht erlaubt ist, einschließlich Website, Web-App, mobilen Apps, Desktop-Apps, Workspaces, Datei-Uploads, Zusammenarbeit, Integrationen und verwandten Services.",
      "Sie ist Teil der Terms of Service. Wenn Sie NivaDesk für ein Unternehmen nutzen, müssen Sie sicherstellen, dass Teammitglieder, eingeladene Nutzer, Auftragnehmer und autorisierte Nutzer sie ebenfalls einhalten."
    ],
    sectionTitles: ["1. Zweck dieser Richtlinie", "2. Allgemeine Nutzungsanforderungen", "3. Verbotene rechtswidrige Nutzung", "4. Verbotene Inhalte", "5. Regeln für Datei-Uploads und Speicher", "6. Kunden- und Drittdaten", "7. Sicherheits- und Zugriffsregeln", "8. Spam, Kommunikation und Missbrauch", "9. Geistiges Eigentum und Markenmissbrauch", "10. Weiterverkauf, Unterlizenzierung und Plattformmissbrauch", "11. Integrationen und Drittanbieter", "12. Faire Nutzung und Servicegrenzen", "13. Überwachung und Durchsetzung", "14. Missbrauch melden", "15. Änderungen dieser Richtlinie", "16. Kontakt"],
    sectionSummaries: [
      "NivaDesk hilft kleinen Unternehmen, Studios, Makern, Freelancern und Teams, Bestellungen, Kunden, Aufgaben, Dateien, Notizen, Workflows, Timelines und Teamzugriff in einem Workspace zu verwalten. Die Richtlinie hält den Dienst sicher, zuverlässig und rechtmäßig.",
      "NivaDesk muss verantwortungsvoll und nur für rechtmäßige Arbeitsverwaltungszwecke genutzt werden. Konto- und Abrechnungsdaten müssen korrekt sein, Logins geschützt, Gesetze beachtet, Rechte und Vertraulichkeit anderer respektiert und Berechtigungen verantwortungsvoll genutzt werden.",
      "NivaDesk darf nicht für rechtswidrige, schädliche, betrügerische oder missbräuchliche Aktivitäten genutzt werden, darunter Betrug, Phishing, Identitätsdiebstahl, Geldwäsche, Sanktionsumgehung, illegaler Handel, Gewaltunterstützung, gestohlene Daten oder unbefugte Nachahmung.",
      "Unzulässig sind illegale, missbräuchliche, bedrohliche, belästigende, diffamierende, hasserfüllte, diskriminierende, ausbeuterische, nicht einvernehmliche intime, malwarehaltige, rechtsverletzende oder unbefugt personenbezogene oder vertrauliche Inhalte.",
      "Hochgeladene Dateien müssen sicher, rechtmäßig und für den Workspace angemessen sein. NivaDesk darf nicht für Malware, Raubkopien, öffentliche Dateiarchive, Umgehung von Limits, übermäßige automatisierte Dateien, Rechteverletzungen oder als einzige Sicherung kritischer Dateien genutzt werden.",
      "Wenn Sie Daten über eigene Kunden, Lieferanten, Mitarbeitende, Auftragnehmer oder Dritte verwalten, müssen Sie das Recht haben, diese Daten zu sammeln, speichern, nutzen und verarbeiten. Hinweise, Verträge, Einwilligungen und Pflichten liegen bei Ihnen.",
      "Sie dürfen Sicherheit, Integrität, Verfügbarkeit oder Leistung von NivaDesk nicht gefährden. Verboten sind unbefugter Zugriff, Scans oder Angriffe ohne schriftliche Erlaubnis, Umgehung von Authentifizierung oder Limits, missbräuchliches Account-Sharing, Bots, Scraping und Ausnutzung von Schwachstellen.",
      "NivaDesk darf nicht für Spam, missbräuchliche Kommunikation, irreführende Nachrichten, Phishing oder unerwünschte Massenkommunikation verwendet werden. Kommunikationsfunktionen müssen verantwortungsvoll und mit Erlaubnis oder Rechtsgrundlage genutzt werden.",
      "NivaDesk darf nicht zur Verletzung geistiger Eigentumsrechte oder zur falschen Darstellung von Eigentum, Urheberschaft, Zugehörigkeit oder Billigung genutzt werden. Name, Logo, Website, App-Interface und Markenmaterial dürfen nicht ohne Erlaubnis kopiert oder missbraucht werden.",
      "Ohne schriftliche Erlaubnis dürfen Sie NivaDesk nicht weiterverkaufen, vermieten, unterlizenzieren, als Hosted- oder White-Label-Dienst anbieten, bezahlte Funktionen unbefugt teilen, konkurrierende Services kopieren oder Source Code extrahieren.",
      "Integrationen müssen gemäß Bedingungen, Richtlinien und Berechtigungen der Drittanbieter genutzt werden. Unbefugter Datenzugriff, Überschreitung von Limits, Spam, Scraping oder Plattformverstöße können zur Einschränkung führen.",
      "NivaDesk kann technische, Speicher-, Nutzungs-, Datei-, Workspace-, Nutzer-, API-, Sync-, Export- oder Rate-Limits anwenden. Diese Limits dürfen nicht umgangen, manipuliert oder missbraucht werden.",
      "Wir prüfen nicht alle Inhalte vor dem Upload, können aber Aktivitäten untersuchen, Metadaten prüfen, Inhalte entfernen, Zugriff beschränken, Accounts sperren oder weitere Maßnahmen ergreifen, wenn Verstöße vermutet werden.",
      "Melden Sie mutmaßlichen Missbrauch, Rechtsverletzungen oder illegale Inhalte mit ausreichenden Details an contact@nivadesk.co.uk. Workspace, Nutzer, Datei, Nachricht, URL, Screenshot oder Auftragsreferenz helfen bei der Prüfung.",
      "Wir können diese Richtlinie aktualisieren und bei wesentlichen Änderungen per E-Mail, In-App-Hinweis, Website-Hinweis oder Aktualisierung des Datums informieren. Fortgesetzte Nutzung bedeutet Zustimmung zur aktualisierten Richtlinie.",
      "Kontakt: EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. E-Mail: contact@nivadesk.co.uk."
    ]
  },
  Français: {
    lastUpdatedLabel: "Dernière mise à jour",
    introTitle: "Politique d'utilisation acceptable de NivaDesk",
    introParagraphs: [
      "Cette politique explique ce qui est autorisé ou interdit lors de l'utilisation de NivaDesk, y compris le site, l'application web, les apps mobiles et de bureau, les workspaces, les fichiers, la collaboration, les intégrations et les services associés.",
      "Elle fait partie des Conditions d'utilisation. Si vous utilisez NivaDesk pour une entreprise, vous devez veiller à ce que les membres d'équipe, utilisateurs invités, prestataires et utilisateurs autorisés la respectent aussi."
    ],
    sectionTitles: ["1. Objectif de cette politique", "2. Exigences générales d'utilisation", "3. Utilisations illégales interdites", "4. Contenu interdit", "5. Règles de fichiers et stockage", "6. Données clients et tierces", "7. Sécurité et accès", "8. Spam, communications et abus", "9. Propriété intellectuelle et marque", "10. Revente, sous-licence et abus de plateforme", "11. Intégrations et services tiers", "12. Usage équitable et limites", "13. Surveillance et application", "14. Signaler un abus", "15. Modifications", "16. Contact"],
    sectionSummaries: [
      "NivaDesk aide les petites entreprises, studios, makers, freelances et équipes à gérer commandes, clients, tâches, fichiers, notes, workflows, timelines et accès d'équipe dans un workspace organisé. Cette politique protège la sécurité, la fiabilité et la légalité du service.",
      "Vous devez utiliser NivaDesk de manière responsable et uniquement pour des usages légaux de gestion du travail. Les informations de compte et de facturation doivent être exactes, les identifiants protégés, les lois respectées, les droits et la confidentialité d'autrui préservés, et les permissions utilisées avec soin.",
      "NivaDesk ne doit pas servir à des activités illégales, nuisibles, frauduleuses ou abusives: fraude, phishing, usurpation, blanchiment, contournement de sanctions, commerce illégal, soutien à la violence, données volées ou impersonation non autorisée.",
      "Sont interdits les contenus illégaux, abusifs, menaçants, harcelants, diffamatoires, haineux, discriminatoires, exploitant des enfants ou personnes vulnérables, intimes non consentis, malveillants, portant atteinte aux droits de tiers ou contenant des données personnelles/confidentielles sans droit.",
      "Vous êtes responsable des fichiers chargés. NivaDesk ne doit pas être utilisé pour malware, fichiers piratés, bibliothèques publiques sans lien avec le workspace, contournement des limites, volumes excessifs ou automatisés, atteintes aux droits ou unique sauvegarde de fichiers critiques.",
      "Si vous gérez vos propres clients, fournisseurs, employés, prestataires ou tiers dans NivaDesk, vous devez disposer du droit de collecter, stocker, utiliser et traiter ces informations. Les notices, contrats, consentements et obligations légales relèvent de vous.",
      "Vous ne devez pas compromettre la sécurité, l'intégrité, la disponibilité ou les performances de NivaDesk. Accès non autorisé, scan ou attaque sans accord écrit, contournement d'authentification ou de limites, partage abusif, bots, scraping et exploitation de failles sont interdits.",
      "NivaDesk ne doit pas être utilisé pour spam, communications abusives, messages trompeurs, phishing ou communications massives non sollicitées. Les fonctions de communication doivent être utilisées avec permission ou base légale.",
      "NivaDesk ne doit pas servir à violer la propriété intellectuelle ou tromper sur la propriété, l'auteur, l'affiliation ou l'approbation. Le nom, logo, site, interface et actifs de marque ne peuvent pas être copiés ou utilisés sans permission.",
      "Sans autorisation écrite, vous ne pouvez pas revendre, louer, sous-licencier ou exploiter commercialement l'accès NivaDesk, l'offrir en service hébergé ou white-label, partager des fonctions payantes sans autorisation, copier le produit pour un concurrent ou extraire le code source.",
      "Les intégrations doivent respecter les conditions, politiques et permissions des fournisseurs tiers. Accès non autorisé, dépassement de limites, spam, scraping ou violation de règles de plateformes peuvent entraîner restriction ou suspension.",
      "NivaDesk peut appliquer des limites techniques, stockage, usage, fichier, workspace, utilisateur, API, sync, export ou débit. Vous ne devez pas tenter de les éviter, les manipuler ou en abuser.",
      "Nous ne vérifions pas tous les contenus avant upload, mais pouvons enquêter, examiner les métadonnées, retirer du contenu, limiter l'accès, suspendre des comptes ou prendre d'autres mesures en cas de violation suspectée.",
      "Pour signaler un abus, une violation de droits ou un contenu illégal, écrivez à contact@nivadesk.co.uk avec des détails utiles: workspace, utilisateur, fichier, message, URL, capture, référence de commande ou explication.",
      "Nous pouvons mettre à jour cette politique et notifier les changements importants par e-mail, notification in-app, site web ou date mise à jour. Continuer à utiliser NivaDesk signifie accepter la version mise à jour.",
      "Contact: EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. E-mail: contact@nivadesk.co.uk."
    ]
  }
};

const COMMON_ACCEPTABLE_USE_BASE: Record<Exclude<StudioLanguage, "English" | "Türkçe" | "Deutsch" | "Français">, LocalizedAcceptableUseDraft> = {
  Italiano: {
    lastUpdatedLabel: "Ultimo aggiornamento",
    introTitle: "Politica di utilizzo accettabile di NivaDesk",
    introParagraphs: ["Questa politica spiega cosa è consentito e cosa non è consentito quando si usa NivaDesk, inclusi sito, web app, app mobili e desktop, workspace, caricamenti file, collaborazione, integrazioni e servizi correlati.", "Fa parte dei Termini di Servizio. Usando NivaDesk accetti di seguirla e, se lo usi per un'azienda, devi assicurarti che anche utenti autorizzati e team la rispettino."],
    sectionTitles: ["1. Scopo", "2. Requisiti generali", "3. Uso illecito vietato", "4. Contenuti vietati", "5. Regole su file e storage", "6. Dati di clienti e terzi", "7. Sicurezza e accesso", "8. Spam e comunicazioni", "9. Proprietà intellettuale e brand", "10. Rivendita e abuso della piattaforma", "11. Integrazioni", "12. Uso equo e limiti", "13. Monitoraggio e applicazione", "14. Segnalare abusi", "15. Modifiche", "16. Contatto"],
    sectionSummaries: ["NivaDesk aiuta studi, piccole imprese, maker, freelance e team a gestire ordini, clienti, attività, file, note, workflow, timeline e accessi in un workspace organizzato. Questa politica mantiene il servizio sicuro, affidabile e legale.", "NivaDesk deve essere usato responsabilmente e solo per gestione del lavoro lecita. Devi fornire dati account/fatturazione corretti, proteggere login e dispositivi, rispettare leggi e diritti altrui, avere permessi sui dati caricati e usare ruoli e permessi con cura.", "È vietato usare NivaDesk per attività illecite, dannose, fraudolente o abusive, inclusi frodi, phishing, furto d'identità, riciclaggio, evasione sanzioni, commercio illegale, supporto a violenza, dati rubati o impersonificazione non autorizzata.", "Non puoi caricare contenuti illegali, abusivi, minacciosi, molesti, diffamatori, discriminatori, che danneggiano minori o persone vulnerabili, materiale intimo illecito, malware, violazioni di diritti o dati personali/confidenziali senza autorizzazione.", "Sei responsabile dei file caricati. Non usare NivaDesk per malware, file pirata, librerie pubbliche non collegate al workspace, aggiramento dei limiti, volumi eccessivi o automatizzati, violazioni di diritti o come unico backup di file critici.", "Se gestisci dati di clienti, fornitori, dipendenti, contractor o terzi, devi avere il diritto di raccoglierli, conservarli, usarli e trattarli. Avvisi privacy, contratti, consensi e obblighi legali sono responsabilità tua.", "Non devi compromettere sicurezza, integrità, disponibilità o prestazioni di NivaDesk. Accesso non autorizzato, scansioni o attacchi senza permesso scritto, bypass di limiti, account sharing abusivo, bot, scraping e sfruttamento di bug sono vietati.", "Non usare NivaDesk per spam, comunicazioni abusive, messaggi ingannevoli, phishing o comunicazioni massive indesiderate. Le funzioni di comunicazione vanno usate solo con permesso o base legale.", "NivaDesk non deve essere usato per violare proprietà intellettuale o dichiarare falsamente proprietà, autore, affiliazione o approvazione. Nome, logo, sito, interfaccia e materiali brand non possono essere copiati o usati impropriamente senza permesso.", "Senza permesso scritto non puoi rivendere, affittare, sublicenziare, offrire come servizio hosted/white-label, condividere funzioni pagate con utenti non autorizzati, copiare il prodotto per un concorrente o estrarre codice sorgente.", "Le integrazioni devono rispettare termini, policy e permessi dei terzi. Accesso non autorizzato, superamento limiti, spam, scraping o violazioni di piattaforma possono portare a restrizioni.", "NivaDesk può applicare limiti tecnici, storage, uso, file, workspace, utenti, API, sync, export o rate. Non devi evitarli, manipolarli o abusarne.", "Non controlliamo tutti i contenuti prima dell'upload, ma possiamo investigare, esaminare metadati, rimuovere contenuti, limitare accesso o sospendere account quando sospettiamo violazioni.", "Per segnalare abusi, violazioni di diritti o contenuti illegali scrivi a contact@nivadesk.co.uk con dettagli utili come workspace, utente, file, messaggio, URL, screenshot o riferimento ordine.", "Possiamo aggiornare questa politica e comunicare cambiamenti importanti via email, app, sito o aggiornando la data. L'uso continuato indica accettazione.", "Contatto: EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. Email: contact@nivadesk.co.uk."]
  },
  "Español (Spanish)": {
    lastUpdatedLabel: "Última actualización",
    introTitle: "Política de uso aceptable de NivaDesk",
    introParagraphs: ["Esta política explica qué está permitido y qué no al usar NivaDesk, incluidos sitio web, web app, apps móviles y de escritorio, workspaces, subidas de archivos, colaboración, integraciones y servicios relacionados.", "Forma parte de los Términos del Servicio. Al usar NivaDesk aceptas cumplirla y, si lo usas para una empresa, debes asegurar que usuarios autorizados y equipo también la cumplan."],
    sectionTitles: ["1. Propósito", "2. Requisitos generales", "3. Uso ilegal prohibido", "4. Contenido prohibido", "5. Archivos y almacenamiento", "6. Datos de clientes y terceros", "7. Seguridad y acceso", "8. Spam y comunicaciones", "9. Propiedad intelectual y marca", "10. Reventa y abuso de plataforma", "11. Integraciones", "12. Uso justo y límites", "13. Supervisión y aplicación", "14. Reportar abuso", "15. Cambios", "16. Contacto"],
    sectionSummaries: ["NivaDesk ayuda a estudios, pequeñas empresas, makers, freelancers y equipos a gestionar pedidos, clientes, tareas, archivos, notas, workflows, timelines y accesos en un workspace organizado. Esta política mantiene el servicio seguro, fiable y legal.", "Debes usar NivaDesk responsablemente y solo para gestión de trabajo lícita. Debes dar datos correctos, proteger credenciales, cumplir leyes, respetar derechos y privacidad, tener permisos sobre los datos cargados y usar roles y permisos con cuidado.", "Está prohibido usar NivaDesk para actividades ilegales, dañinas, fraudulentas o abusivas, como fraude, phishing, robo de identidad, blanqueo, evasión de sanciones, comercio ilegal, apoyo a violencia, datos robados o suplantación no autorizada.", "No puedes subir contenido ilegal, abusivo, amenazante, acosador, difamatorio, discriminatorio, que explote menores o personas vulnerables, material íntimo ilícito, malware, infracciones de derechos o datos personales/confidenciales sin permiso.", "Eres responsable de los archivos cargados. No uses NivaDesk para malware, archivos pirateados, bibliotecas públicas ajenas al workspace, saltar límites, volúmenes excesivos o automatizados, infracciones de derechos o como único backup de archivos críticos.", "Si gestionas datos de tus clientes, proveedores, empleados, contratistas o terceros, debes tener derecho a recopilarlos, almacenarlos, usarlos y tratarlos. Tus avisos, contratos, consentimientos y obligaciones legales son tu responsabilidad.", "No debes comprometer seguridad, integridad, disponibilidad o rendimiento de NivaDesk. Acceso no autorizado, escaneos o ataques sin permiso escrito, saltar límites, compartir cuentas abusivamente, bots, scraping y explotar vulnerabilidades están prohibidos.", "No uses NivaDesk para spam, comunicaciones abusivas, mensajes engañosos, phishing o comunicaciones masivas no deseadas. Las funciones de comunicación deben usarse solo con permiso o base legal.", "NivaDesk no debe usarse para infringir propiedad intelectual ni tergiversar propiedad, autoría, afiliación o aprobación. Nombre, logo, sitio, interfaz y materiales de marca no pueden copiarse ni usarse indebidamente sin permiso.", "Sin permiso escrito no puedes revender, alquilar, sublicenciar, ofrecer como servicio hosted/white-label, compartir funciones de pago con no autorizados, copiar el producto para competir ni extraer código fuente.", "Las integraciones deben respetar términos, políticas y permisos de terceros. Acceso no autorizado, exceso de límites, spam, scraping o violación de reglas de plataforma puede causar restricciones.", "NivaDesk puede aplicar límites técnicos, almacenamiento, uso, archivos, workspace, usuarios, API, sync, export o rate. No debes evitarlos, manipularlos ni abusar de ellos.", "No revisamos todo antes de la subida, pero podemos investigar, revisar metadatos, retirar contenido, limitar acceso o suspender cuentas si sospechamos infracciones.", "Para reportar abuso, infracción de derechos o contenido ilegal, escribe a contact@nivadesk.co.uk con detalles como workspace, usuario, archivo, mensaje, URL, captura o referencia de pedido.", "Podemos actualizar esta política y avisar cambios importantes por email, app, web o fecha actualizada. Seguir usando NivaDesk implica aceptar la versión actualizada.", "Contacto: EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. Email: contact@nivadesk.co.uk."]
  },
  Português: {
    lastUpdatedLabel: "Última atualização",
    introTitle: "Política de Uso Aceitável da NivaDesk",
    introParagraphs: ["Esta política explica o que é permitido e proibido ao usar a NivaDesk, incluindo website, web app, apps móveis e desktop, workspaces, carregamentos de ficheiros, colaboração, integrações e serviços relacionados.", "Faz parte dos Termos de Serviço. Ao usar a NivaDesk aceita cumpri-la e, se usa em nome de uma empresa, deve garantir que equipa e utilizadores autorizados também a cumprem."],
    sectionTitles: ["1. Finalidade", "2. Requisitos gerais", "3. Uso ilegal proibido", "4. Conteúdo proibido", "5. Ficheiros e armazenamento", "6. Dados de clientes e terceiros", "7. Segurança e acesso", "8. Spam e comunicações", "9. Propriedade intelectual e marca", "10. Revenda e abuso da plataforma", "11. Integrações", "12. Uso justo e limites", "13. Monitorização e aplicação", "14. Reportar abuso", "15. Alterações", "16. Contacto"],
    sectionSummaries: ["A NivaDesk ajuda pequenas empresas, estúdios, makers, freelancers e equipas a gerir encomendas, clientes, tarefas, ficheiros, notas, workflows, timelines e acessos num workspace organizado. Esta política mantém o serviço seguro, fiável e legal.", "A NivaDesk deve ser usada responsavelmente e apenas para gestão de trabalho lícita. Deve fornecer dados corretos, proteger credenciais, cumprir leis, respeitar direitos e privacidade, ter permissões sobre dados carregados e usar funções e permissões com cuidado.", "É proibido usar a NivaDesk para atividades ilegais, prejudiciais, fraudulentas ou abusivas, incluindo fraude, phishing, roubo de identidade, branqueamento, evasão de sanções, comércio ilegal, apoio à violência, dados roubados ou impersonação não autorizada.", "Não pode carregar conteúdo ilegal, abusivo, ameaçador, assediante, difamatório, discriminatório, que explore menores ou vulneráveis, material íntimo ilegal, malware, violações de direitos ou dados pessoais/confidenciais sem autorização.", "É responsável pelos ficheiros carregados. Não use a NivaDesk para malware, ficheiros pirateados, bibliotecas públicas alheias ao workspace, contornar limites, volumes excessivos ou automatizados, violações de direitos ou como único backup de ficheiros críticos.", "Se gere dados dos seus clientes, fornecedores, colaboradores, contratados ou terceiros, deve ter direito a recolher, armazenar, usar e tratar esses dados. Avisos, contratos, consentimentos e obrigações legais são responsabilidade sua.", "Não deve comprometer segurança, integridade, disponibilidade ou desempenho da NivaDesk. Acesso não autorizado, scans ou ataques sem permissão escrita, contornar limites, partilha abusiva de contas, bots, scraping e exploração de falhas são proibidos.", "Não use a NivaDesk para spam, comunicações abusivas, mensagens enganosas, phishing ou comunicações em massa não solicitadas. Funcionalidades de comunicação devem ser usadas apenas com permissão ou base legal.", "A NivaDesk não deve ser usada para infringir propriedade intelectual ou deturpar propriedade, autoria, afiliação ou aprovação. Nome, logótipo, site, interface e materiais de marca não podem ser copiados ou usados indevidamente sem permissão.", "Sem permissão escrita, não pode revender, alugar, sublicenciar, oferecer como serviço hosted/white-label, partilhar funções pagas com não autorizados, copiar o produto para competir ou extrair código-fonte.", "Integrações devem respeitar termos, políticas e permissões de terceiros. Acesso não autorizado, excesso de limites, spam, scraping ou violação de regras pode gerar restrições.", "A NivaDesk pode aplicar limites técnicos, armazenamento, uso, ficheiros, workspace, utilizadores, API, sync, export ou rate. Não deve evitá-los, manipulá-los ou abusar deles.", "Não revemos todo conteúdo antes do upload, mas podemos investigar, rever metadados, remover conteúdo, limitar acesso ou suspender contas quando suspeitarmos de violações.", "Para reportar abuso, violação de direitos ou conteúdo ilegal, escreva para contact@nivadesk.co.uk com detalhes úteis como workspace, utilizador, ficheiro, mensagem, URL, screenshot ou referência de encomenda.", "Podemos atualizar esta política e comunicar mudanças importantes por email, app, website ou data atualizada. Continuar a usar a NivaDesk indica aceitação.", "Contacto: EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. Email: contact@nivadesk.co.uk."]
  },
  "Русский (Russian)": {
    lastUpdatedLabel: "Последнее обновление",
    introTitle: "Политика допустимого использования NivaDesk",
    introParagraphs: ["Эта политика объясняет, что разрешено и запрещено при использовании NivaDesk, включая сайт, web app, мобильные и desktop apps, workspaces, загрузку файлов, совместную работу, интеграции и связанные services.", "Она является частью Terms of Service. Используя NivaDesk, вы соглашаетесь соблюдать ее; если вы используете сервис для бизнеса, вы отвечаете за соблюдение командой и авторизованными пользователями."],
    sectionTitles: ["1. Цель политики", "2. Общие требования", "3. Запрещенное незаконное использование", "4. Запрещенный контент", "5. Файлы и хранилище", "6. Данные клиентов и третьих лиц", "7. Безопасность и доступ", "8. Спам и коммуникации", "9. Интеллектуальная собственность и бренд", "10. Перепродажа и злоупотребление платформой", "11. Интеграции", "12. Добросовестное использование и лимиты", "13. Мониторинг и меры", "14. Сообщить о нарушении", "15. Изменения", "16. Контакт"],
    sectionSummaries: ["NivaDesk помогает студиям, малому бизнесу, makers, freelancers и командам управлять заказами, клиентами, задачами, файлами, заметками, workflows, timelines и доступом в организованном workspace. Политика поддерживает безопасность, надежность и законность сервиса.", "NivaDesk нужно использовать ответственно и только для законного управления работой. Данные аккаунта и оплаты должны быть точными, логины защищены, законы соблюдены, права и конфиденциальность других уважаемы, а роли и разрешения использованы аккуратно.", "Запрещено использовать NivaDesk для незаконной, вредной, мошеннической или abusive деятельности: fraud, phishing, identity theft, money laundering, sanctions evasion, illegal trade, support of violence, stolen data или unauthorized impersonation.", "Нельзя загружать незаконный, abusive, threatening, harassing, defamatory, hateful, discriminatory контент, материалы, вредящие детям или уязвимым людям, незаконные intimate materials, malware, нарушения прав или персональные/конфиденциальные данные без права.", "Вы отвечаете за загруженные файлы. Нельзя использовать NivaDesk для malware, pirated files, public file libraries вне workspace use, обхода лимитов, excessive/automated volumes, нарушений прав или как единственный backup критичных файлов.", "Если вы управляете данными клиентов, поставщиков, сотрудников, contractors или третьих лиц, вы должны иметь право собирать, хранить, использовать и обрабатывать эти данные. Privacy notices, contracts, consents и legal obligations - ваша ответственность.", "Нельзя пытаться нарушать security, integrity, availability или performance NivaDesk. Unauthorized access, scans or attacks without written permission, bypassing limits, abusive account sharing, bots, scraping и exploiting vulnerabilities запрещены.", "NivaDesk нельзя использовать для spam, abusive communications, misleading messages, phishing или unwanted bulk communications. Communication features нужно использовать только с permission или lawful basis.", "NivaDesk нельзя использовать для нарушения intellectual property или ложного представления ownership, authorship, affiliation, endorsement. Name, logo, website, app interface и brand assets нельзя копировать или misuse без permission.", "Без written permission нельзя resell, rent, sublicense, offer as hosted/white-label service, share paid features with unauthorized users, copy the product to compete или extract source code.", "Integrations должны использоваться согласно terms, policies и permissions third-party providers. Unauthorized data access, rate limit excess, spam, scraping или platform rule violations могут привести к restriction.", "NivaDesk может применять technical, storage, usage, file, workspace, user, API, sync, export или rate limits. Нельзя обходить, манипулировать или злоупотреблять ими.", "Мы не проверяем весь контент до загрузки, но можем investigate activity, review metadata, remove content, restrict access или suspend accounts при подозрении нарушения.", "Чтобы сообщить о misuse, infringement или unlawful content, напишите на contact@nivadesk.co.uk с деталями: workspace, user, file, message, URL, screenshot или order reference.", "Мы можем обновлять политику и уведомлять о существенных изменениях email, in-app notice, website notice или датой. Продолжение использования означает acceptance.", "Контакт: EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. Email: contact@nivadesk.co.uk."]
  },
  "日本語 (Japanese)": {
    lastUpdatedLabel: "最終更新日",
    introTitle: "NivaDesk 利用許容ポリシー",
    introParagraphs: ["このポリシーは、NivaDesk の website、web app、mobile/desktop apps、workspaces、file uploads、collaboration、integrations、関連 services を利用する際に許可されることと禁止されることを説明します。", "これは Terms of Service の一部です。NivaDesk を利用することでこのポリシーに従うことに同意します。事業として利用する場合、チームと authorized users にも遵守させる責任があります。"],
    sectionTitles: ["1. 目的", "2. 一般的な利用要件", "3. 違法利用の禁止", "4. 禁止コンテンツ", "5. ファイルとストレージ", "6. 顧客および第三者データ", "7. セキュリティとアクセス", "8. スパムと通信", "9. 知的財産とブランド", "10. 再販売とプラットフォーム濫用", "11. 連携サービス", "12. 公正利用と制限", "13. 監視と執行", "14. 濫用の報告", "15. 変更", "16. 連絡先"],
    sectionSummaries: ["NivaDesk は small businesses、studios、makers、freelancers、teams が orders、clients、tasks、files、notes、workflows、timelines、team access を一つの workspace で管理するためのものです。このポリシーは安全で信頼できる合法的な利用を守ります。", "NivaDesk は責任を持って、合法的な仕事管理目的にのみ利用してください。正確な account/billing 情報、login と device の保護、法律遵守、他者の権利と privacy の尊重、データ利用権限、roles と permissions の適切な利用が必要です。", "NivaDesk を違法、有害、詐欺的、濫用的な活動に使うことは禁止です。Fraud、phishing、identity theft、money laundering、sanctions evasion、illegal trade、violence support、stolen data、unauthorized impersonation が含まれます。", "違法、虐待的、脅迫的、嫌がらせ、名誉毀損、差別的なコンテンツ、子どもや vulnerable people を害するもの、違法な intimate material、malware、第三者権利侵害、権限のない personal/confidential data は禁止です。", "アップロードする files は安全で合法かつ workspace に適切である必要があります。Malware、pirated files、無関係な public file library、limit 回避、過剰/自動/重複 upload、権利侵害、critical files の唯一の backup としての利用は禁止です。", "自分の clients、customers、suppliers、employees、contractors、third parties のデータを扱う場合、収集、保存、利用、処理する権利が必要です。Privacy notices、contracts、consents、legal obligations は利用者の責任です。", "NivaDesk の security、integrity、availability、performance を損なう試みは禁止です。Unauthorized access、書面許可のない scans/attacks、limits bypass、abusive account sharing、bots、scraping、vulnerability exploitation は禁止です。", "Spam、abusive communications、misleading messages、phishing、unwanted bulk communications に NivaDesk を使わないでください。Communication features は permission または lawful basis がある場合のみ責任を持って利用してください。", "NivaDesk を intellectual property 侵害や ownership、authorship、affiliation、approval の虚偽表示に使わないでください。Name、logo、website、app interface、brand assets は許可なくコピーや misuse できません。", "書面許可なく NivaDesk access の resell、rent、sublicense、hosted/white-label service 提供、paid features の不正共有、競合 product 作成目的のコピー、source code extraction は禁止です。", "Third-party integrations は各 provider の terms、policies、permissions に従って使う必要があります。Unauthorized data access、rate limit 超過、spam、scraping、platform rule violation は制限される場合があります。", "NivaDesk は technical、storage、usage、file、workspace、user、API、sync、export、rate limits を適用できます。これらを回避、操作、濫用してはいけません。", "すべての content を upload 前に確認するわけではありませんが、違反の疑いがある場合は activity investigation、metadata review、content removal、access restriction、account suspension などを行えます。", "Misuse、rights infringement、unlawful content を報告するには、workspace、user、file、message、URL、screenshot、order reference などの情報を添えて contact@nivadesk.co.uk に連絡してください。", "このポリシーは更新される場合があります。重要な変更は email、in-app notice、website notice、date update で通知されることがあります。継続利用は更新版への同意を意味します。", "連絡先: EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. Email: contact@nivadesk.co.uk。"]
  },
  "中文 (Chinese)": {
    lastUpdatedLabel: "最后更新",
    introTitle: "NivaDesk 可接受使用政策",
    introParagraphs: ["本政策说明使用 NivaDesk 时允许和禁止的行为，包括网站、Web 应用、移动和桌面应用、workspaces、文件上传、协作功能、集成和相关服务。", "本政策是服务条款的一部分。使用 NivaDesk 即表示你同意遵守本政策；如果代表企业使用，你需要确保团队成员和授权用户也遵守。"],
    sectionTitles: ["1. 目的", "2. 一般使用要求", "3. 禁止违法使用", "4. 禁止内容", "5. 文件和存储规则", "6. 客户和第三方数据", "7. 安全和访问规则", "8. 垃圾信息和通信滥用", "9. 知识产权和品牌", "10. 转售和平台滥用", "11. 集成和第三方服务", "12. 合理使用和限制", "13. 监控和执行", "14. 报告滥用", "15. 政策变更", "16. 联系方式"],
    sectionSummaries: ["NivaDesk 帮助小企业、工作室、创作者、自由职业者和团队在一个 workspace 中管理订单、客户、任务、文件、备注、流程、时间线和团队访问。本政策用于保持服务安全、可靠、合法。", "你必须负责任地使用 NivaDesk，并仅用于合法的业务或个人工作管理目的。应提供准确账户和计费信息，保护登录信息和设备，遵守法律，尊重他人权利和隐私，确保有权上传和处理数据，并合理使用角色和权限。", "不得将 NivaDesk 用于违法、有害、欺诈或滥用行为，包括诈骗、phishing、身份盗窃、洗钱、规避制裁、非法贸易、支持暴力、使用被盗数据或未经授权冒充他人。", "不得上传违法、辱骂、威胁、骚扰、诽谤、仇恨、歧视、危害儿童或弱势群体、非法亲密材料、恶意软件、侵犯第三方权利或未经授权的个人/机密数据。", "你对上传的文件负责。不得使用 NivaDesk 存储恶意软件、盗版文件、与 workspace 无关的公共文件库，规避限制，保存过量/自动/重复文件，侵犯他人权利，或作为关键业务文件的唯一备份。", "如果你用 NivaDesk 管理自己的客户、供应商、员工、承包商或第三方信息，你必须有权收集、存储、使用和处理这些信息。隐私通知、合同、同意和法律义务由你负责。", "不得试图破坏 NivaDesk 的安全性、完整性、可用性或性能。禁止未经授权访问、未经书面许可扫描或攻击、绕过身份验证或计划限制、滥用账户共享、bots、scraping 或利用漏洞。", "不得使用 NivaDesk 发送 spam、辱骂性通信、误导性消息、phishing 或未经请求的批量通信。通信功能只能在有许可或法律依据时负责任地使用。", "不得使用 NivaDesk 侵犯知识产权或虚假陈述所有权、作者身份、关联或认可。未经许可不得复制、模仿、滥用或修改 NivaDesk 名称、logo、网站、应用界面或品牌资产。", "未经书面许可，不得转售、出租、再许可、以 hosted/white-label 服务提供、向未授权用户分享付费功能、复制产品以创建竞争服务或提取源代码。", "第三方集成必须遵守相应提供商的条款、政策和权限。未经授权访问数据、超过速率限制、发送 spam、scraping 或违反平台规则可能导致限制。", "NivaDesk 可根据计划和运营需求应用技术、存储、使用、文件、workspace、用户、API、同步、导出或速率限制。不得规避、操纵或滥用这些限制。", "我们不会在上传前审查所有内容，但在怀疑违反政策、条款、法律、第三方权利或安全时，可调查活动、查看元数据、删除内容、限制访问或暂停账户。", "如需报告滥用、侵权或违法内容，请发送邮件至 contact@nivadesk.co.uk，并提供 workspace、用户、文件、消息、URL、截图、订单参考或说明等信息。", "我们可能不时更新本政策。重大变更可能通过邮件、应用内通知、网站通知或更新日期告知。继续使用即表示接受更新政策。", "联系方式：EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom。Email: contact@nivadesk.co.uk。"]
  },
  "العربية (Arabic)": {
    lastUpdatedLabel: "آخر تحديث",
    introTitle: "سياسة الاستخدام المقبول في NivaDesk",
    introParagraphs: ["توضح هذه السياسة ما هو مسموح وممنوع عند استخدام NivaDesk، بما في ذلك الموقع وتطبيق الويب وتطبيقات الجوال وسطح المكتب وworkspaces وتحميل الملفات والتعاون والتكاملات والخدمات المرتبطة.", "هذه السياسة جزء من شروط الخدمة. باستخدام NivaDesk توافق على اتباعها، وإذا كنت تستخدمه نيابة عن شركة فأنت مسؤول عن التزام الفريق والمستخدمين المصرح لهم بها."],
    sectionTitles: ["1. الغرض", "2. متطلبات الاستخدام العامة", "3. الاستخدام غير القانوني المحظور", "4. المحتوى المحظور", "5. الملفات والتخزين", "6. بيانات العملاء والغير", "7. الأمان والوصول", "8. الرسائل المزعجة والاتصالات", "9. الملكية الفكرية والعلامة", "10. إعادة البيع وإساءة استخدام المنصة", "11. التكاملات", "12. الاستخدام العادل والحدود", "13. المراقبة والإنفاذ", "14. الإبلاغ عن إساءة", "15. التغييرات", "16. التواصل"],
    sectionSummaries: ["يساعد NivaDesk الشركات الصغيرة والاستوديوهات والصناع والمستقلين والفرق على إدارة الطلبات والعملاء والمهام والملفات والملاحظات وworkflows وtimelines ووصول الفريق في workspace منظم. تهدف السياسة إلى إبقاء الخدمة آمنة وموثوقة وقانونية.", "يجب استخدام NivaDesk بمسؤولية ولأغراض قانونية لإدارة العمل فقط. يجب تقديم معلومات حساب وفوترة دقيقة، حماية بيانات الدخول، الامتثال للقوانين، احترام حقوق وخصوصية الآخرين، امتلاك إذن للبيانات المرفوعة، واستخدام الأدوار والصلاحيات بحذر.", "يحظر استخدام NivaDesk لنشاط غير قانوني أو ضار أو احتيالي أو مسيء، مثل الاحتيال وphishing وسرقة الهوية وغسل الأموال وتجاوز العقوبات والتجارة غير القانونية ودعم العنف والبيانات المسروقة أو انتحال الهوية دون إذن.", "يحظر رفع محتوى غير قانوني أو مسيء أو مهدد أو متحرش أو تشهيري أو كاره أو تمييزي أو يضر الأطفال أو الضعفاء أو يحتوي مواد حميمة غير قانونية أو malware أو ينتهك حقوق الغير أو يتضمن بيانات شخصية/سرية دون حق.", "أنت مسؤول عن الملفات التي ترفعها. لا يجوز استخدام NivaDesk للبرمجيات الخبيثة أو الملفات المقرصنة أو مكتبات مشاركة عامة غير مرتبطة بالworkspace أو تجاوز الحدود أو أحجام مفرطة/آلية أو انتهاك الحقوق أو كنسخة احتياطية وحيدة للملفات المهمة.", "إذا استخدمت NivaDesk لإدارة بيانات عملائك أو الموردين أو الموظفين أو المتعاقدين أو أطراف ثالثة، يجب أن يكون لديك حق جمعها وتخزينها واستخدامها ومعالجتها. إشعارات الخصوصية والعقود والموافقات والالتزامات القانونية مسؤوليتك.", "لا يجوز محاولة المساس بأمان NivaDesk أو سلامته أو توفره أو أدائه. يحظر الوصول غير المصرح به، الفحص أو الهجوم دون إذن كتابي، تجاوز المصادقة أو الحدود، مشاركة الحسابات بشكل مسيء، bots، scraping أو استغلال الثغرات.", "لا تستخدم NivaDesk للرسائل المزعجة أو الاتصالات المسيئة أو الرسائل المضللة أو phishing أو الرسائل الجماعية غير المرغوبة. ميزات الاتصال يجب أن تستخدم فقط بإذن أو أساس قانوني.", "لا يجوز استخدام NivaDesk لانتهاك الملكية الفكرية أو تضليل الملكية أو التأليف أو الارتباط أو الموافقة. لا يجوز نسخ أو إساءة استخدام اسم NivaDesk أو شعاره أو موقعه أو واجهته أو أصوله دون إذن.", "بدون إذن كتابي لا يجوز إعادة بيع أو تأجير أو ترخيص NivaDesk أو تقديمه كخدمة hosted/white-label أو مشاركة الميزات المدفوعة مع غير المصرح لهم أو نسخه لإنشاء خدمة منافسة أو استخراج الكود.", "يجب استخدام التكاملات وفق شروط وسياسات وأذونات مقدمي الخدمات. الوصول غير المصرح للبيانات أو تجاوز الحدود أو spam أو scraping أو انتهاك قواعد المنصات قد يؤدي إلى تقييدها.", "قد تطبق NivaDesk حدوداً تقنية أو تخزينية أو استخدامية أو على الملفات أو workspaces أو المستخدمين أو API أو sync أو export أو rate. لا يجوز تجاوزها أو التلاعب بها أو إساءة استخدامها.", "لا نراجع كل المحتوى قبل الرفع، لكن قد نحقق في النشاط ونراجع metadata ونزيل المحتوى ونقيد الوصول أو نعلق الحسابات عند الاشتباه في مخالفة.", "للإبلاغ عن إساءة أو انتهاك حقوق أو محتوى غير قانوني، راسل contact@nivadesk.co.uk مع تفاصيل مثل workspace أو المستخدم أو الملف أو الرسالة أو URL أو لقطة شاشة أو مرجع الطلب.", "قد نحدث هذه السياسة ونبلغ عن التغييرات المهمة عبر البريد أو إشعار داخل التطبيق أو الموقع أو تحديث التاريخ. استمرار الاستخدام يعني قبول النسخة المحدثة.", "التواصل: EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. البريد: contact@nivadesk.co.uk."]
  },
  "हिन्दी (Hindi)": {
    lastUpdatedLabel: "अंतिम अपडेट",
    introTitle: "NivaDesk Acceptable Use Policy",
    introParagraphs: ["यह policy बताती है कि NivaDesk use करते समय क्या allowed और क्या prohibited है, including website, web app, mobile/desktop apps, workspaces, file uploads, collaboration, integrations और related services.", "यह Terms of Service का हिस्सा है. NivaDesk use करके आप इसे follow करने से सहमत होते हैं; business की ओर से use करने पर team और authorised users के compliance की जिम्मेदारी आपकी है."],
    sectionTitles: ["1. उद्देश्य", "2. सामान्य use requirements", "3. prohibited unlawful use", "4. prohibited content", "5. file upload और storage rules", "6. client/customer/third-party data", "7. security और access rules", "8. spam और communications", "9. intellectual property और brand misuse", "10. resale और platform abuse", "11. integrations", "12. fair usage और limits", "13. monitoring और enforcement", "14. abuse report करना", "15. changes", "16. contact"],
    sectionSummaries: ["NivaDesk small businesses, studios, makers, freelancers और teams को orders, clients, tasks, files, notes, workflows, timelines और team access को organized workspace में manage करने में help करता है. यह policy service को safe, reliable और lawful रखने के लिए है.", "NivaDesk responsibly और केवल lawful work-management purposes के लिए use करें. Accurate account/billing info दें, login और devices secure रखें, laws follow करें, दूसरों के rights/privacy respect करें, data upload/process करने की permission रखें और roles/permissions carefully use करें.", "NivaDesk को unlawful, harmful, fraudulent या abusive activity के लिए use नहीं किया जा सकता, जैसे fraud, phishing, identity theft, money laundering, sanctions evasion, illegal trade, violence support, stolen data या unauthorized impersonation.", "Illegal, abusive, threatening, harassing, defamatory, hateful, discriminatory content, children/vulnerable people को harm करने वाला content, unlawful intimate material, malware, rights infringement या बिना अधिकार personal/confidential data upload नहीं किया जा सकता.", "Uploaded files के लिए आप responsible हैं. NivaDesk को malware, pirated files, unrelated public file libraries, limit bypass, excessive/automated/duplicate files, rights infringement या critical files के only backup के रूप में use न करें.", "यदि आप अपने clients, customers, suppliers, employees, contractors या third parties का data manage करते हैं, तो आपके पास उसे collect, store, use और process करने का अधिकार होना चाहिए. Privacy notices, contracts, consents और legal obligations आपकी responsibility हैं.", "NivaDesk की security, integrity, availability या performance compromise करने की कोशिश prohibited है. Unauthorized access, written permission के बिना scans/attacks, auth/plan limit bypass, abusive account sharing, bots, scraping और vulnerability exploitation prohibited हैं.", "NivaDesk को spam, abusive communications, misleading messages, phishing या unwanted bulk communications के लिए use न करें. Communication features केवल permission या lawful basis के साथ responsibly use करें.", "NivaDesk को intellectual property infringement या ownership/authorship/affiliation/endorsement misrepresentation के लिए use न करें. NivaDesk name, logo, website, app interface और brand assets बिना permission copy या misuse नहीं किए जा सकते.", "Written permission के बिना NivaDesk access resell, rent, sublicense, hosted/white-label service offer, paid features unauthorized users से share, competing service के लिए copy या source code extract नहीं किया जा सकता.", "Integrations को third-party provider terms, policies और permissions के अनुसार use करें. Unauthorized data access, rate limit exceed, spam, scraping या platform rules violation पर restrictions लग सकती हैं.", "NivaDesk technical, storage, usage, file, workspace, user, API, sync, export या rate limits apply कर सकता है. इन्हें avoid, bypass, manipulate या abuse न करें.", "हम सभी content upload से पहले review नहीं करते, लेकिन suspected violation पर activity investigate, metadata review, content remove, access restrict या account suspend कर सकते हैं.", "Misuse, rights infringement या unlawful content report करने के लिए contact@nivadesk.co.uk पर relevant details भेजें, जैसे workspace, user, file, message, URL, screenshot या order reference.", "हम इस policy को update कर सकते हैं और material changes के लिए email, in-app notice, website notice या date update कर सकते हैं. Continued use updated policy की acceptance है.", "Contact: EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom. Email: contact@nivadesk.co.uk."]
  }
};

Object.assign(ACCEPTABLE_USE_POLICY_DRAFTS, COMMON_ACCEPTABLE_USE_BASE);

export function getAcceptableUsePolicySections(language: StudioLanguage): PrivacyPolicySection[] {
  const localized = ACCEPTABLE_USE_POLICY_DRAFTS[language];
  if (!localized) {
    return ACCEPTABLE_USE_POLICY_SECTIONS;
  }
  return buildLocalizedAcceptableUse(localized);
}

export function getAcceptableUsePolicyLastUpdatedLabel(language: StudioLanguage): string {
  return ACCEPTABLE_USE_POLICY_LABELS[language] ?? "Last updated";
}
