import type { PrivacyPolicySection } from "@/lib/publicSite/privacyPolicy";
import type { StudioLanguage } from "@/lib/studioflow/language";

export const ACCOUNT_DELETION_POLICY_LAST_UPDATED = "13 May 2026";

export const ACCOUNT_DELETION_POLICY_SECTIONS: PrivacyPolicySection[] = [
  {
    title: "Account Deletion Policy",
    paragraphs: [
      "This Account Deletion Policy explains how users can request deletion of their NivaDesk account and associated personal data.",
      "It is intended to support NivaDesk users, App Store review requirements, Google Play account deletion requirements, and general data protection transparency."
    ]
  },
  {
    title: "1. What this policy covers",
    paragraphs: [
      "This policy applies to NivaDesk accounts created through our website, web app, mobile app, desktop app, or related services.",
      "It covers deletion of your user account, profile information, authentication records, and personal data associated with your account, subject to the exceptions described below.",
      "If you are a member of a workspace owned by another person or business, the workspace owner may control some shared workspace data. In that case, deletion of your user account may not automatically delete all records that belong to the workspace."
    ]
  },
  {
    title: "2. How to request account deletion",
    paragraphs: ["You may request deletion of your NivaDesk account in any of the following ways:"],
    bullets: [
      "From inside the NivaDesk app, go to Settings > Account > Delete Account, when this option is available.",
      "From the NivaDesk website, use this account deletion request page.",
      "By emailing us at contact@nivadesk.co.uk with the subject line NivaDesk account deletion request."
    ],
    subsections: [
      {
        title: "",
        paragraphs: [
          "If you email us, please use the email address connected to your NivaDesk account where possible. We may ask you to verify your identity before processing the request."
        ]
      }
    ]
  },
  {
    title: "3. App Store and Google Play requirements",
    paragraphs: [
      "NivaDesk is designed to support account deletion requirements for apps that allow account creation. Apple requires apps that support account creation to let users initiate deletion of their account within the app.",
      "Google Play requires developers to disclose deletion practices in the Data Safety form and provide a web link where users can request deletion.",
      "For this reason, NivaDesk should provide both an in-app deletion path and a public web page where users can request account deletion without needing to reinstall the app."
    ]
  },
  {
    title: "4. What happens after you request deletion",
    paragraphs: [
      "After receiving your request, we will take reasonable steps to verify that the request is genuine and that you are authorised to delete the account.",
      "Once verified, we will begin deleting or anonymising personal data associated with your NivaDesk account, subject to legal, security, billing, backup, and workspace-related exceptions described in this policy."
    ]
  },
  {
    title: "5. Data we normally delete or anonymise",
    paragraphs: ["Where applicable, account deletion may include deletion or anonymisation of:"],
    bullets: [
      "your user profile, name, email address, avatar, and account preferences;",
      "authentication records connected to your NivaDesk account;",
      "personal account settings;",
      "personal device or session records where no longer required;",
      "personal app usage data associated with your account where deletion is technically possible;",
      "workspace membership records that identify you, subject to workspace audit and legal retention needs."
    ]
  },
  {
    title: "6. Workspace content and team accounts",
    paragraphs: [
      "NivaDesk supports team workspaces. If you are part of a workspace, some data may belong to the workspace rather than only to your personal account.",
      "Examples may include orders, client records, files, notes, tasks, timelines, history logs, team audit records, and business data created for or inside a shared workspace.",
      "If you are a workspace owner, deleting your account may affect the workspace and other users. We may ask you to transfer ownership, export data, close the workspace, or confirm that you want the workspace deleted.",
      "If you are a team member, deleting your account may remove your personal access, but shared workspace content may remain available to the workspace owner or administrators unless they request deletion separately."
    ]
  },
  {
    title: "7. Data we may need to keep",
    paragraphs: ["We may retain certain information where necessary or legally permitted, including:"],
    bullets: [
      "billing records, invoices, tax, and accounting records;",
      "records required to comply with legal obligations;",
      "security logs needed to protect our systems and investigate abuse;",
      "records needed to resolve disputes or enforce our Terms of Service;",
      "fraud prevention records;",
      "backup copies for a limited period until they are overwritten or deleted through our backup cycle;",
      "workspace audit/history records where deleting them would affect other users, legal compliance, or business records."
    ],
    subsections: [
      {
        title: "",
        paragraphs: [
          "Where we retain information, we will keep it only for as long as necessary for the relevant purpose and in accordance with our Privacy Policy."
        ]
      }
    ]
  },
  {
    title: "8. Uploaded files and client data",
    paragraphs: [
      "If you uploaded files or added client/customer data to a NivaDesk workspace, deletion depends on whether the content belongs to your personal account or to a shared business workspace.",
      "If the workspace is controlled by your business, workspace owner, or employer, we may need instructions from the workspace owner before deleting shared business records or client files.",
      "If you are the workspace owner and request full workspace deletion, we may delete or anonymise workspace content subject to the exceptions in this policy, our Privacy Policy, and any applicable Data Processing Agreement."
    ]
  },
  {
    title: "9. Data export before deletion",
    paragraphs: [
      "Before requesting deletion, you should export or download any business records, order data, files, or other content you need to keep.",
      "After deletion is completed, we may not be able to restore your account or recover deleted data.",
      "Where technically available, NivaDesk aims to let users export their own existing business data, including if a paid subscription has ended and the account has moved to a free or limited plan."
    ]
  },
  {
    title: "10. Timing",
    paragraphs: [
      "We aim to process verified account deletion requests within a reasonable time and normally within 30 days, unless a longer period is required due to the complexity of the request, legal obligations, security checks, workspace ownership issues, or other valid reasons.",
      "Some deleted data may remain in secure backups for a limited period until those backups are automatically overwritten or deleted. Backup data is not used for normal business operations unless restoration is necessary for security, disaster recovery, or legal reasons."
    ]
  },
  {
    title: "11. Cancelling subscriptions is separate",
    paragraphs: [
      "Deleting your NivaDesk account does not automatically cancel all subscriptions if your subscription is managed by Apple App Store, Google Play, Stripe, or another payment provider.",
      "You are responsible for cancelling your subscription through the platform where you purchased it. For example, Apple subscriptions are usually managed through your Apple account, and Google Play subscriptions are usually managed through your Google Play account.",
      "If you subscribed through our website, you may cancel through the billing portal or by contacting us."
    ]
  },
  {
    title: "12. Re-authentication and identity checks",
    paragraphs: [
      "For security, we may require you to log in again, confirm by email, or provide additional information to verify your identity before deleting the account.",
      "We may refuse or delay a deletion request if we cannot verify that the person making the request is authorised to delete the account or workspace."
    ]
  },
  {
    title: "13. Fraud, abuse, and legal restrictions",
    paragraphs: [
      "We may delay or refuse deletion where necessary to detect, prevent, or investigate fraud, abuse, security incidents, legal claims, or violations of our Terms of Service.",
      "We may also retain information where required by law, court order, tax rules, accounting obligations, regulatory requirements, or legitimate business needs."
    ]
  },
  {
    title: "14. Contact us",
    paragraphs: [
      "For account deletion requests or questions about this policy, please contact:",
      "EGGCRAFT LIMITED",
      "141 Randolph Avenue",
      "London",
      "W9 1DN",
      "United Kingdom",
      "Email: contact@nivadesk.co.uk"
    ]
  }
];

type LocalizedDeletionDraft = {
  lastUpdatedLabel: string;
  introTitle: string;
  introParagraphs: string[];
  sectionTitles: string[];
  sectionSummaries: string[];
};

function buildLocalizedDeletionPolicy(copy: LocalizedDeletionDraft): PrivacyPolicySection[] {
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

const ACCOUNT_DELETION_DRAFTS: Partial<Record<StudioLanguage, LocalizedDeletionDraft>> = {
  Türkçe: {
    lastUpdatedLabel: "Son güncelleme",
    introTitle: "Hesap Silme Politikası",
    introParagraphs: [
      "Bu Hesap Silme Politikası, kullanıcıların NivaDesk hesaplarının ve ilişkili kişisel verilerinin silinmesini nasıl talep edebileceğini açıklar.",
      "Bu politika NivaDesk kullanıcılarını, App Store inceleme gerekliliklerini, Google Play hesap silme gerekliliklerini ve genel veri koruma şeffaflığını desteklemek için hazırlanmıştır."
    ],
    sectionTitles: [
      "Bu politika neleri kapsar",
      "Hesap silme talebi nasıl yapılır",
      "App Store ve Google Play gereklilikleri",
      "Silme talebinden sonra ne olur",
      "Normalde sildiğimiz veya anonimleştirdiğimiz veriler",
      "Workspace içeriği ve ekip hesapları",
      "Saklamamız gerekebilecek veriler",
      "Yüklenen dosyalar ve müşteri verileri",
      "Silmeden önce veri dışa aktarma",
      "Zamanlama",
      "Abonelik iptali ayrıdır",
      "Yeniden kimlik doğrulama ve kimlik kontrolleri",
      "Dolandırıcılık, kötüye kullanım ve yasal kısıtlamalar",
      "İletişim"
    ],
    sectionSummaries: [
      "Bu politika web sitesi, web app, mobil uygulama, masaüstü uygulama veya ilgili hizmetler üzerinden oluşturulan NivaDesk hesapları için geçerlidir. Başka bir kişiye veya işletmeye ait workspace üyesiyseniz, bazı paylaşılan kayıtlar workspace sahibinin kontrolünde kalabilir.",
      "Hesap silme talebini uygulamada Settings > Account > Delete Account yolu mevcut olduğunda kullanarak, bu public web sayfasından veya hesabınıza bağlı e-posta ile contact@nivadesk.co.uk adresine NivaDesk account deletion request konusu ile yazarak yapabilirsiniz. Kimliğinizi doğrulamamız gerekebilir.",
      "NivaDesk, hesap oluşturma sunan uygulamalar için Apple ve Google Play hesap silme gerekliliklerini destekleyecek şekilde tasarlanır. Bu nedenle hem uygulama içi silme yolu hem de uygulamayı yeniden yüklemeden kullanılabilecek public web sayfası sağlanmalıdır.",
      "Talebinizi aldıktan sonra isteğin gerçek olduğunu ve hesabı silmeye yetkili olduğunuzu doğrulamak için makul kontroller yaparız. Doğrulama sonrası kişisel verileri silmeye veya anonimleştirmeye başlarız; yasal, güvenlik, faturalama, yedek ve workspace istisnaları saklıdır.",
      "Uygun olduğunda kullanıcı profiliniz, adınız, e-posta adresiniz, avatarınız, hesap tercihleriniz, kimlik doğrulama kayıtları, kişisel ayarlar, artık gerekli olmayan cihaz/oturum kayıtları, teknik olarak silinebilen kullanım verileri ve sizi tanımlayan üyelik kayıtları silinebilir veya anonimleştirilebilir.",
      "NivaDesk ekip workspace'lerini destekler. Siparişler, müşteri kayıtları, dosyalar, notlar, görevler, timeline kayıtları, geçmiş logları, ekip denetim kayıtları ve paylaşılan iş verileri yalnızca kişisel hesabınıza değil workspace'e ait olabilir. Workspace sahibiyseniz sahiplik devri, dışa aktarma veya workspace silme onayı gerekebilir.",
      "Yasal olarak gerekli veya izin verilen durumlarda fatura, vergi, muhasebe, yasal yükümlülük, güvenlik logları, uyuşmazlık/Terms enforcement kayıtları, dolandırıcılık önleme kayıtları, sınırlı süreli yedekler ve workspace denetim/geçmiş kayıtlarını saklayabiliriz.",
      "Yüklediğiniz dosyaların veya müşteri verilerinin silinmesi, içeriğin kişisel hesabınıza mı yoksa paylaşılan işletme workspace'ine mi ait olduğuna bağlıdır. Workspace işletme, işveren veya owner tarafından kontrol ediliyorsa, paylaşılan iş kayıtlarını silmeden önce workspace owner talimatı gerekebilir.",
      "Silme talebinden önce saklamak istediğiniz sipariş, dosya, iş kaydı veya diğer içerikleri dışa aktarmanız ya da indirmeniz gerekir. Silme tamamlandıktan sonra hesabınızı veya silinen verileri geri getiremeyebiliriz. Teknik olarak mümkün olduğunda, plan sona erse bile mevcut iş verilerinin dışa aktarılmasına imkan vermeyi hedefleriz.",
      "Doğrulanmış silme taleplerini makul sürede ve normalde 30 gün içinde işlemeyi hedefleriz. Karmaşık talepler, yasal yükümlülükler, güvenlik kontrolleri, workspace sahipliği sorunları veya geçerli başka nedenler daha uzun süre gerektirebilir. Bazı veriler yedeklerde sınırlı süre kalabilir.",
      "NivaDesk hesabınızı silmek, Apple App Store, Google Play, Stripe veya başka bir ödeme sağlayıcısı tarafından yönetilen abonelikleri otomatik olarak iptal etmeyebilir. Aboneliği satın aldığınız platformdan iptal etmek sizin sorumluluğunuzdedir.",
      "Güvenlik için hesabı silmeden önce yeniden giriş yapmanızı, e-posta ile onay vermenizi veya kimliğinizi doğrulayacak ek bilgi sağlamanızı isteyebiliriz. Yetkiyi doğrulayamazsak talebi reddedebilir veya geciktirebiliriz.",
      "Dolandırıcılık, kötüye kullanım, güvenlik olayı, hukuki talep veya Kullanım Şartları ihlalini tespit etmek, önlemek veya araştırmak için silmeyi geciktirebilir ya da reddedebiliriz. Kanun, mahkeme kararı, vergi, muhasebe, düzenleyici gereklilikler veya meşru iş ihtiyaçları nedeniyle bazı bilgileri saklayabiliriz.",
      "Hesap silme talepleri veya bu politika hakkında sorular için EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom ya da contact@nivadesk.co.uk üzerinden bize ulaşabilirsiniz."
    ]
  },
  Deutsch: {
    lastUpdatedLabel: "Zuletzt aktualisiert",
    introTitle: "Richtlinie zur Kontolöschung",
    introParagraphs: [
      "Diese Richtlinie erklärt, wie Nutzer die Löschung ihres NivaDesk-Kontos und der damit verbundenen personenbezogenen Daten beantragen können.",
      "Sie unterstützt NivaDesk-Nutzer, App-Store-Prüfanforderungen, Google-Play-Anforderungen zur Kontolöschung und allgemeine Transparenz beim Datenschutz."
    ],
    sectionTitles: [
      "Was diese Richtlinie abdeckt",
      "So beantragst du Kontolöschung",
      "App Store und Google Play Anforderungen",
      "Was nach deinem Löschantrag passiert",
      "Daten, die wir normalerweise löschen oder anonymisieren",
      "Workspace-Inhalte und Teamkonten",
      "Daten, die wir behalten müssen",
      "Hochgeladene Dateien und Kundendaten",
      "Datenexport vor Löschung",
      "Zeitlicher Ablauf",
      "Abokündigung ist getrennt",
      "Erneute Authentifizierung und Identitätsprüfung",
      "Betrug, Missbrauch und rechtliche Einschränkungen",
      "Kontakt"
    ],
    sectionSummaries: [
      "Diese Richtlinie gilt für NivaDesk-Konten, die über Website, Web-App, mobile App, Desktop-App oder verbundene Dienste erstellt wurden. Wenn du Mitglied eines fremden Workspaces bist, können geteilte Workspace-Daten weiterhin vom Workspace-Eigentümer kontrolliert werden.",
      "Du kannst die Löschung über Settings > Account > Delete Account in der App beantragen, wenn verfügbar, über diese öffentliche Website oder per E-Mail von deiner Konto-Adresse an contact@nivadesk.co.uk mit dem Betreff NivaDesk account deletion request. Wir können Identitätsprüfung verlangen.",
      "NivaDesk soll Apple- und Google-Play-Anforderungen für Apps mit Kontoerstellung unterstützen. Deshalb sollte es sowohl einen In-App-Löschweg als auch eine öffentliche Web-Seite geben, über die Löschung ohne Neuinstallation der App beantragt werden kann.",
      "Nach Eingang prüfen wir angemessen, ob der Antrag echt ist und du berechtigt bist. Nach Verifizierung beginnen wir mit Löschung oder Anonymisierung personenbezogener Kontodaten, vorbehaltlich rechtlicher, Sicherheits-, Abrechnungs-, Backup- und Workspace-Ausnahmen.",
      "Je nach Fall können Profil, Name, E-Mail, Avatar, Kontopräferenzen, Authentifizierungsdaten, persönliche Einstellungen, nicht mehr benötigte Geräte- oder Sitzungsdaten, technisch löschbare Nutzungsdaten und identifizierende Mitgliedschaftsdaten gelöscht oder anonymisiert werden.",
      "NivaDesk unterstützt Team-Workspaces. Bestellungen, Kundendaten, Dateien, Notizen, Aufgaben, Timelines, Protokolle, Audit-Daten und Geschäftsdaten können zum Workspace gehören. Eigentümer müssen ggf. Besitz übertragen, Daten exportieren, den Workspace schließen oder dessen Löschung bestätigen.",
      "Wir können Rechnungs-, Steuer-, Buchhaltungs-, Rechts-, Sicherheits-, Streitbeilegungs-, Betrugspräventions-, Backup- und Workspace-Auditdaten aufbewahren, soweit dies notwendig oder erlaubt ist.",
      "Bei hochgeladenen Dateien und Kundendaten hängt die Löschung davon ab, ob sie deinem persönlichen Konto oder einem geteilten Business-Workspace gehören. Bei geschäftlich kontrollierten Workspaces benötigen wir ggf. Anweisungen des Workspace-Eigentümers.",
      "Vor Löschung solltest du benötigte Geschäftsunterlagen, Bestelldaten, Dateien oder Inhalte exportieren. Nach Abschluss der Löschung können Konto oder Daten möglicherweise nicht wiederhergestellt werden. Soweit technisch möglich, soll NivaDesk Datenexport auch nach Ende eines bezahlten Plans ermöglichen.",
      "Wir bemühen uns, verifizierte Löschanträge angemessen und normalerweise innerhalb von 30 Tagen zu bearbeiten. Komplexität, rechtliche Pflichten, Sicherheitsprüfungen, Workspace-Eigentum oder andere gültige Gründe können mehr Zeit erfordern.",
      "Kontolöschung kündigt nicht automatisch Abos, die über Apple App Store, Google Play, Stripe oder andere Anbieter verwaltet werden. Du musst dein Abo über die Kaufplattform kündigen.",
      "Zur Sicherheit können wir erneutes Einloggen, E-Mail-Bestätigung oder zusätzliche Informationen verlangen. Wenn wir die Berechtigung nicht verifizieren können, können wir die Löschung verzögern oder ablehnen.",
      "Wir können Löschung verzögern oder verweigern, um Betrug, Missbrauch, Sicherheitsvorfälle, Rechtsansprüche oder Verstöße gegen die Nutzungsbedingungen zu erkennen, zu verhindern oder zu untersuchen, und Informationen aufbewahren, wenn Gesetz, Gericht, Steuern, Buchhaltung oder legitime Geschäftsgründe dies erfordern.",
      "Für Löschanträge oder Fragen kontaktiere EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom oder contact@nivadesk.co.uk."
    ]
  },
  Français: {
    lastUpdatedLabel: "Dernière mise à jour",
    introTitle: "Politique de suppression de compte",
    introParagraphs: [
      "Cette politique explique comment les utilisateurs peuvent demander la suppression de leur compte NivaDesk et des données personnelles associées.",
      "Elle aide les utilisateurs de NivaDesk et répond aux exigences de transparence en matière de protection des données, ainsi qu'aux exigences de l'App Store et de Google Play concernant la suppression de compte."
    ],
    sectionTitles: [
      "Ce que couvre cette politique",
      "Comment demander la suppression du compte",
      "Exigences de l'App Store et de Google Play",
      "Ce qui se passe après votre demande",
      "Données que nous supprimons ou anonymisons normalement",
      "Contenu des workspaces et comptes d'équipe",
      "Données que nous pouvons devoir conserver",
      "Fichiers importés et données client",
      "Exporter les données avant suppression",
      "Délais",
      "L'annulation d'abonnement est séparée",
      "Réauthentification et vérifications d'identité",
      "Fraude, abus et restrictions légales",
      "Contact"
    ],
    sectionSummaries: [
      "Cette politique s'applique aux comptes NivaDesk créés via le site, l'app web, les apps mobiles, les apps de bureau ou les services associés. Si vous êtes membre d'un workspace appartenant à une autre personne ou entreprise, certaines données partagées peuvent rester sous le contrôle du propriétaire du workspace.",
      "Vous pouvez demander la suppression depuis l'app via Settings > Account > Delete Account lorsque cette option est disponible, depuis cette page publique, ou par e-mail à contact@nivadesk.co.uk avec l'objet NivaDesk account deletion request. Nous pouvons vous demander de vérifier votre identité.",
      "NivaDesk est conçu pour prendre en charge les exigences d'Apple et de Google Play pour les apps qui créent des comptes. Nous devons donc proposer à la fois un chemin de suppression dans l'app et une page publique permettant de demander la suppression sans réinstaller l'app.",
      "Après réception de votre demande, nous prenons des mesures raisonnables pour vérifier qu'elle est authentique et que vous êtes autorisé à supprimer le compte. Une fois vérifiée, nous commençons la suppression ou l'anonymisation, sous réserve des exceptions légales, de sécurité, de facturation, de sauvegarde et de workspace.",
      "Selon le cas, nous pouvons supprimer ou anonymiser votre profil, nom, adresse e-mail, avatar, préférences de compte, données d'authentification, paramètres personnels, sessions ou appareils non nécessaires, données d'utilisation techniquement supprimables et enregistrements d'adhésion qui vous identifient.",
      "NivaDesk prend en charge les workspaces d'équipe. Les commandes, clients, fichiers, notes, tâches, délais, journaux, audits et données métier peuvent appartenir au workspace. Si vous êtes propriétaire, nous pouvons demander un transfert de propriété, un export, une fermeture ou une confirmation de suppression du workspace.",
      "Nous pouvons conserver les informations nécessaires ou autorisées, notamment les données de facturation, factures, taxes, comptabilité, obligations légales, journaux de sécurité, litiges, application des conditions, prévention de la fraude, sauvegardes limitées et historiques ou audits de workspace.",
      "La suppression des fichiers importés ou données client dépend de leur appartenance à votre compte personnel ou à un workspace professionnel partagé. Si le workspace est contrôlé par une entreprise, un employeur ou un propriétaire, ses instructions peuvent être nécessaires.",
      "Avant toute suppression, exportez ou téléchargez les commandes, fichiers, données métier ou contenus que vous souhaitez conserver. Après suppression, nous pourrions ne pas pouvoir restaurer le compte ou les données. Lorsque c'est techniquement possible, NivaDesk vise à permettre l'export des données existantes même après la fin d'un plan payant.",
      "Nous cherchons à traiter les demandes vérifiées dans un délai raisonnable, normalement sous 30 jours. La complexité, les obligations légales, les contrôles de sécurité, les questions de propriété du workspace ou d'autres motifs valables peuvent demander plus de temps.",
      "Supprimer votre compte NivaDesk n'annule pas automatiquement les abonnements gérés par l'App Store, Google Play, Stripe ou un autre fournisseur. Vous devez annuler l'abonnement sur la plateforme où vous l'avez acheté.",
      "Pour votre sécurité, nous pouvons demander une nouvelle connexion, une confirmation par e-mail ou des informations supplémentaires. Si nous ne pouvons pas vérifier l'autorisation, nous pouvons refuser ou retarder la demande.",
      "Nous pouvons retarder ou refuser la suppression pour détecter, prévenir ou enquêter sur la fraude, les abus, les incidents de sécurité, les réclamations légales ou les violations des Conditions, et conserver certaines informations si la loi, un tribunal, les taxes, la comptabilité, la réglementation ou des intérêts légitimes l'exigent.",
      "Pour les demandes de suppression ou questions sur cette politique, contactez EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom ou contact@nivadesk.co.uk."
    ]
  },
  Italiano: {
    lastUpdatedLabel: "Ultimo aggiornamento",
    introTitle: "Informativa sulla cancellazione dell'account",
    introParagraphs: [
      "Questa informativa spiega come gli utenti possono richiedere la cancellazione del proprio account NivaDesk e dei dati personali associati.",
      "Serve a supportare gli utenti NivaDesk, i requisiti di App Store e Google Play sulla cancellazione degli account e la trasparenza generale sulla protezione dei dati."
    ],
    sectionTitles: [
      "Cosa copre questa informativa",
      "Come richiedere la cancellazione dell'account",
      "Requisiti di App Store e Google Play",
      "Cosa succede dopo la richiesta",
      "Dati che normalmente cancelliamo o anonimizzamo",
      "Contenuti dei workspace e account team",
      "Dati che potremmo dover conservare",
      "File caricati e dati dei clienti",
      "Esportazione dei dati prima della cancellazione",
      "Tempistiche",
      "L'annullamento degli abbonamenti è separato",
      "Riautenticazione e controlli di identità",
      "Frode, abuso e restrizioni legali",
      "Contatti"
    ],
    sectionSummaries: [
      "Questa informativa si applica agli account NivaDesk creati tramite sito, web app, app mobile, app desktop o servizi collegati. Se fai parte di un workspace di un'altra persona o azienda, alcuni dati condivisi possono rimanere sotto il controllo del proprietario del workspace.",
      "Puoi richiedere la cancellazione dall'app tramite Settings > Account > Delete Account quando disponibile, da questa pagina pubblica, oppure scrivendo a contact@nivadesk.co.uk con oggetto NivaDesk account deletion request. Potremmo chiederti di verificare la tua identità.",
      "NivaDesk è progettato per supportare i requisiti Apple e Google Play per le app che consentono la creazione di account. Per questo dovrebbero essere disponibili sia un percorso in-app sia una pagina pubblica per richiedere la cancellazione senza reinstallare l'app.",
      "Dopo aver ricevuto la richiesta, verifichiamo ragionevolmente che sia autentica e che tu sia autorizzato. Una volta verificata, iniziamo a cancellare o anonimizzare i dati personali dell'account, salvo eccezioni legali, di sicurezza, fatturazione, backup e workspace.",
      "A seconda dei casi, possiamo cancellare o anonimizzare profilo, nome, email, avatar, preferenze, dati di autenticazione, impostazioni personali, sessioni o dispositivi non più necessari, dati d'uso tecnicamente cancellabili e record di membership che ti identificano.",
      "NivaDesk supporta workspace di team. Ordini, clienti, file, note, task, timeline, log, audit e dati aziendali possono appartenere al workspace. Se sei proprietario, potremmo chiedere trasferimento della proprietà, esportazione, chiusura o conferma di cancellazione del workspace.",
      "Potremmo conservare informazioni necessarie o consentite, inclusi record di fatturazione, fatture, tasse, contabilità, obblighi legali, log di sicurezza, controversie, applicazione dei Termini, prevenzione frodi, backup temporanei e audit o storici del workspace.",
      "La cancellazione di file caricati o dati cliente dipende dal fatto che appartengano al tuo account personale o a un workspace aziendale condiviso. Se il workspace è controllato da un'azienda, datore di lavoro o proprietario, potrebbero servire istruzioni del proprietario.",
      "Prima della cancellazione dovresti esportare o scaricare ordini, file, record aziendali o contenuti che vuoi conservare. Dopo la cancellazione potremmo non poter ripristinare account o dati. Dove tecnicamente possibile, NivaDesk mira a permettere l'export anche dopo la fine di un piano a pagamento.",
      "Cerchiamo di gestire le richieste verificate entro un tempo ragionevole, normalmente entro 30 giorni. Complessità, obblighi legali, controlli di sicurezza, proprietà del workspace o altri motivi validi possono richiedere più tempo.",
      "La cancellazione dell'account NivaDesk non annulla automaticamente abbonamenti gestiti da App Store, Google Play, Stripe o altri provider. Devi annullare l'abbonamento sulla piattaforma di acquisto.",
      "Per sicurezza possiamo richiedere un nuovo login, conferma via email o informazioni aggiuntive. Se non possiamo verificare l'autorizzazione, possiamo rifiutare o ritardare la richiesta.",
      "Possiamo ritardare o rifiutare la cancellazione per rilevare, prevenire o indagare frodi, abusi, incidenti di sicurezza, reclami legali o violazioni dei Termini, e conservare dati quando richiesto da legge, tribunali, tasse, contabilità, regolamenti o legittime esigenze aziendali.",
      "Per richieste di cancellazione o domande su questa informativa, contatta EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom oppure contact@nivadesk.co.uk."
    ]
  },
  "Español (Spanish)": {
    lastUpdatedLabel: "Última actualización",
    introTitle: "Política de eliminación de cuenta",
    introParagraphs: [
      "Esta política explica cómo los usuarios pueden solicitar la eliminación de su cuenta de NivaDesk y de los datos personales asociados.",
      "Está pensada para ayudar a los usuarios de NivaDesk, cumplir los requisitos de eliminación de cuentas de App Store y Google Play, y ofrecer transparencia sobre protección de datos."
    ],
    sectionTitles: [
      "Qué cubre esta política",
      "Cómo solicitar la eliminación de la cuenta",
      "Requisitos de App Store y Google Play",
      "Qué ocurre después de tu solicitud",
      "Datos que normalmente eliminamos o anonimizamos",
      "Contenido de workspaces y cuentas de equipo",
      "Datos que podemos necesitar conservar",
      "Archivos subidos y datos de clientes",
      "Exportar datos antes de eliminar",
      "Plazos",
      "Cancelar suscripciones es independiente",
      "Reautenticación y verificación de identidad",
      "Fraude, abuso y restricciones legales",
      "Contacto"
    ],
    sectionSummaries: [
      "Esta política se aplica a cuentas de NivaDesk creadas mediante el sitio web, la web app, apps móviles, apps de escritorio o servicios relacionados. Si perteneces a un workspace de otra persona o empresa, algunos datos compartidos pueden seguir bajo control del propietario.",
      "Puedes solicitar la eliminación desde la app en Settings > Account > Delete Account cuando esté disponible, desde esta página pública, o enviando un email a contact@nivadesk.co.uk con el asunto NivaDesk account deletion request. Podemos pedirte que verifiques tu identidad.",
      "NivaDesk está diseñado para apoyar los requisitos de Apple y Google Play para apps que permiten crear cuentas. Por eso debe existir tanto una ruta dentro de la app como una página pública para solicitar la eliminación sin reinstalar la app.",
      "Tras recibir tu solicitud, tomaremos medidas razonables para verificar que es auténtica y que estás autorizado. Una vez verificada, comenzaremos a eliminar o anonimizar datos personales de la cuenta, sujeto a excepciones legales, de seguridad, facturación, copias de seguridad y workspace.",
      "Cuando corresponda, podemos eliminar o anonimizar perfil, nombre, email, avatar, preferencias, registros de autenticación, ajustes personales, sesiones o dispositivos ya no necesarios, datos de uso técnicamente eliminables y registros de membresía que te identifiquen.",
      "NivaDesk admite workspaces de equipo. Pedidos, clientes, archivos, notas, tareas, líneas de tiempo, registros, auditorías y datos comerciales pueden pertenecer al workspace. Si eres propietario, podríamos pedir transferencia de propiedad, exportación, cierre o confirmación de eliminación.",
      "Podemos conservar información necesaria o permitida, como facturación, facturas, impuestos, contabilidad, obligaciones legales, logs de seguridad, disputas, cumplimiento de Términos, prevención de fraude, copias de seguridad temporales e historial o auditoría del workspace.",
      "La eliminación de archivos subidos o datos de clientes depende de si pertenecen a tu cuenta personal o a un workspace empresarial compartido. Si el workspace lo controla una empresa, empleador o propietario, podemos necesitar instrucciones del propietario.",
      "Antes de eliminar, debes exportar o descargar pedidos, archivos, registros comerciales o contenido que quieras conservar. Después de la eliminación quizá no podamos restaurar la cuenta o los datos. Cuando sea técnicamente posible, NivaDesk busca permitir la exportación incluso tras finalizar un plan pagado.",
      "Intentamos procesar solicitudes verificadas en un plazo razonable, normalmente dentro de 30 días. La complejidad, obligaciones legales, controles de seguridad, propiedad del workspace u otros motivos válidos pueden requerir más tiempo.",
      "Eliminar tu cuenta de NivaDesk no cancela automáticamente suscripciones gestionadas por App Store, Google Play, Stripe u otro proveedor. Debes cancelar la suscripción en la plataforma donde la compraste.",
      "Por seguridad podemos requerir que inicies sesión de nuevo, confirmes por email o proporciones información adicional. Si no podemos verificar la autorización, podemos rechazar o retrasar la solicitud.",
      "Podemos retrasar o rechazar la eliminación para detectar, prevenir o investigar fraude, abuso, incidentes de seguridad, reclamaciones legales o infracciones de los Términos, y conservar información cuando lo exijan la ley, tribunales, impuestos, contabilidad, regulación o intereses empresariales legítimos.",
      "Para solicitudes de eliminación o preguntas sobre esta política, contacta con EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom o contact@nivadesk.co.uk."
    ]
  },
  Português: {
    lastUpdatedLabel: "Última atualização",
    introTitle: "Política de Eliminação de Conta",
    introParagraphs: [
      "Esta política explica como os utilizadores podem solicitar a eliminação da sua conta NivaDesk e dos dados pessoais associados.",
      "Ela apoia os utilizadores da NivaDesk, os requisitos da App Store e do Google Play sobre eliminação de contas e a transparência geral em proteção de dados."
    ],
    sectionTitles: [
      "O que esta política abrange",
      "Como solicitar a eliminação da conta",
      "Requisitos da App Store e Google Play",
      "O que acontece após o pedido",
      "Dados que normalmente eliminamos ou anonimizamos",
      "Conteúdo de workspaces e contas de equipa",
      "Dados que poderemos precisar manter",
      "Ficheiros carregados e dados de clientes",
      "Exportação de dados antes da eliminação",
      "Prazos",
      "Cancelar subscrições é separado",
      "Reautenticação e verificações de identidade",
      "Fraude, abuso e restrições legais",
      "Contacto"
    ],
    sectionSummaries: [
      "Esta política aplica-se a contas NivaDesk criadas através do website, web app, apps móveis, apps desktop ou serviços relacionados. Se fizer parte de um workspace pertencente a outra pessoa ou empresa, alguns dados partilhados podem continuar sob controlo do proprietário do workspace.",
      "Pode solicitar a eliminação na app por Settings > Account > Delete Account quando disponível, nesta página pública, ou por email para contact@nivadesk.co.uk com o assunto NivaDesk account deletion request. Poderemos pedir verificação de identidade.",
      "A NivaDesk é concebida para apoiar os requisitos da Apple e do Google Play para apps com criação de conta. Por isso, deve existir um caminho dentro da app e uma página pública para solicitar eliminação sem reinstalar a app.",
      "Após recebermos o pedido, tomaremos medidas razoáveis para verificar que é genuíno e que tem autorização. Depois de verificado, começaremos a eliminar ou anonimizar dados pessoais da conta, sujeitos a exceções legais, de segurança, faturação, cópias de segurança e workspace.",
      "Quando aplicável, podemos eliminar ou anonimizar perfil, nome, email, avatar, preferências, registos de autenticação, definições pessoais, sessões ou dispositivos já não necessários, dados de utilização tecnicamente elimináveis e registos de participação que o identifiquem.",
      "A NivaDesk suporta workspaces de equipa. Encomendas, clientes, ficheiros, notas, tarefas, timelines, logs, auditorias e dados empresariais podem pertencer ao workspace. Se for proprietário, poderemos pedir transferência de propriedade, exportação, encerramento ou confirmação de eliminação.",
      "Podemos conservar informação necessária ou permitida, incluindo faturação, faturas, impostos, contabilidade, obrigações legais, logs de segurança, disputas, aplicação dos Termos, prevenção de fraude, backups temporários e histórico ou auditoria de workspace.",
      "A eliminação de ficheiros carregados ou dados de clientes depende de pertencerem à sua conta pessoal ou a um workspace empresarial partilhado. Se o workspace for controlado por uma empresa, empregador ou proprietário, poderemos precisar de instruções do proprietário.",
      "Antes da eliminação, deve exportar ou descarregar encomendas, ficheiros, registos empresariais ou conteúdos que queira manter. Após a eliminação, poderemos não conseguir restaurar a conta ou dados. Quando tecnicamente possível, a NivaDesk pretende permitir exportação mesmo depois do fim de um plano pago.",
      "Procuramos processar pedidos verificados num prazo razoável, normalmente até 30 dias. Complexidade, obrigações legais, verificações de segurança, propriedade do workspace ou outros motivos válidos podem exigir mais tempo.",
      "Eliminar a conta NivaDesk não cancela automaticamente subscrições geridas pela App Store, Google Play, Stripe ou outro fornecedor. Deve cancelar a subscrição na plataforma onde a comprou.",
      "Por segurança, podemos pedir novo login, confirmação por email ou informação adicional. Se não conseguirmos verificar autorização, podemos recusar ou atrasar o pedido.",
      "Podemos atrasar ou recusar a eliminação para detetar, prevenir ou investigar fraude, abuso, incidentes de segurança, reclamações legais ou violações dos Termos, e conservar dados quando exigido por lei, tribunal, impostos, contabilidade, regulação ou interesses legítimos.",
      "Para pedidos de eliminação ou perguntas sobre esta política, contacte EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom ou contact@nivadesk.co.uk."
    ]
  },
  "Русский (Russian)": {
    lastUpdatedLabel: "Последнее обновление",
    introTitle: "Политика удаления аккаунта",
    introParagraphs: [
      "Эта политика объясняет, как пользователи могут запросить удаление аккаунта NivaDesk и связанных персональных данных.",
      "Она предназначена для пользователей NivaDesk, требований App Store и Google Play к удалению аккаунтов и общей прозрачности обработки данных."
    ],
    sectionTitles: [
      "Что охватывает эта политика",
      "Как запросить удаление аккаунта",
      "Требования App Store и Google Play",
      "Что происходит после запроса",
      "Данные, которые мы обычно удаляем или обезличиваем",
      "Содержимое workspaces и командные аккаунты",
      "Данные, которые нам может потребоваться сохранить",
      "Загруженные файлы и данные клиентов",
      "Экспорт данных перед удалением",
      "Сроки",
      "Отмена подписки выполняется отдельно",
      "Повторная аутентификация и проверка личности",
      "Мошенничество, злоупотребления и правовые ограничения",
      "Контакты"
    ],
    sectionSummaries: [
      "Эта политика применяется к аккаунтам NivaDesk, созданным через сайт, web app, мобильные приложения, настольные приложения или связанные сервисы. Если вы участник workspace другого человека или компании, часть общих данных может оставаться под контролем владельца workspace.",
      "Вы можете запросить удаление в приложении через Settings > Account > Delete Account, когда этот вариант доступен, на этой публичной странице или по email на contact@nivadesk.co.uk с темой NivaDesk account deletion request. Мы можем запросить подтверждение личности.",
      "NivaDesk разработан с учетом требований Apple и Google Play для приложений с созданием аккаунта. Поэтому должен быть как путь удаления внутри приложения, так и публичная страница для запроса удаления без повторной установки приложения.",
      "После получения запроса мы принимаем разумные меры, чтобы проверить его подлинность и ваши полномочия. После проверки мы начинаем удаление или обезличивание персональных данных аккаунта с учетом юридических, security, billing, backup и workspace исключений.",
      "При необходимости мы можем удалить или обезличить профиль, имя, email, аватар, настройки аккаунта, записи аутентификации, личные настройки, ненужные записи устройств или сессий, технически удаляемые данные использования и записи членства, идентифицирующие вас.",
      "NivaDesk поддерживает командные workspaces. Заказы, клиенты, файлы, заметки, задачи, сроки, журналы, аудиты и бизнес-данные могут принадлежать workspace. Если вы владелец, мы можем попросить передать владение, экспортировать данные, закрыть workspace или подтвердить его удаление.",
      "Мы можем сохранять необходимую или разрешенную информацию: billing, счета, налоги, бухгалтерию, юридические обязательства, security logs, споры, enforcement Terms, prevention fraud, временные backups, историю и audit workspace.",
      "Удаление загруженных файлов и данных клиентов зависит от того, относятся ли они к личному аккаунту или общему бизнес-workspace. Если workspace контролируется компанией, работодателем или владельцем, могут потребоваться инструкции владельца.",
      "Перед удалением экспортируйте или скачайте заказы, файлы, бизнес-записи или другой контент, который хотите сохранить. После удаления мы можем не восстановить аккаунт или данные. Где технически возможно, NivaDesk стремится разрешать экспорт существующих данных даже после окончания платного плана.",
      "Мы стараемся обрабатывать подтвержденные запросы в разумный срок, обычно в течение 30 дней. Сложность, юридические обязанности, security checks, вопросы владения workspace или другие уважительные причины могут потребовать больше времени.",
      "Удаление аккаунта NivaDesk не отменяет автоматически подписки, управляемые App Store, Google Play, Stripe или другим провайдером. Вы должны отменить подписку на платформе покупки.",
      "Для безопасности мы можем потребовать повторный вход, подтверждение по email или дополнительную информацию. Если мы не можем проверить полномочия, запрос может быть отклонен или задержан.",
      "Мы можем задержать или отказать в удалении для выявления, предотвращения или расследования fraud, abuse, security incidents, legal claims или нарушений Terms, а также сохранять данные, если это требуется законом, судом, налогами, бухгалтерией, регуляторами или законными бизнес-интересами.",
      "По вопросам удаления аккаунта или этой политики свяжитесь с EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom или contact@nivadesk.co.uk."
    ]
  },
  "日本語 (Japanese)": {
    lastUpdatedLabel: "最終更新日",
    introTitle: "アカウント削除ポリシー",
    introParagraphs: [
      "このポリシーは、ユーザーが NivaDesk アカウントと関連する個人データの削除をリクエストする方法を説明します。",
      "NivaDesk ユーザー、App Store 審査要件、Google Play のアカウント削除要件、およびデータ保護の透明性を支えるためのものです。"
    ],
    sectionTitles: [
      "このポリシーの対象",
      "アカウント削除のリクエスト方法",
      "App Store と Google Play の要件",
      "リクエスト後に起きること",
      "通常削除または匿名化するデータ",
      "Workspace コンテンツとチームアカウント",
      "保持が必要な場合があるデータ",
      "アップロードファイルと顧客データ",
      "削除前のデータエクスポート",
      "処理期間",
      "サブスクリプションの解約は別手続き",
      "再認証と本人確認",
      "不正、悪用、法的制限",
      "お問い合わせ"
    ],
    sectionSummaries: [
      "このポリシーは、ウェブサイト、Web アプリ、モバイルアプリ、デスクトップアプリ、関連サービスで作成された NivaDesk アカウントに適用されます。他者または企業が所有する workspace のメンバーである場合、一部の共有データは workspace 所有者の管理下に残ることがあります。",
      "削除は、利用可能な場合はアプリの Settings > Account > Delete Account、この公開ページ、またはアカウントに紐づくメールから contact@nivadesk.co.uk 宛に件名 NivaDesk account deletion request で依頼できます。本人確認をお願いする場合があります。",
      "NivaDesk は、アカウント作成を提供するアプリに対する Apple と Google Play の要件を支援するよう設計されています。そのため、アプリ内の削除経路と、アプリを再インストールせずに申請できる公開ページの両方を用意する必要があります。",
      "リクエストを受け取った後、当社は申請が真正であり、あなたに削除権限があることを合理的に確認します。確認後、法的、安全性、請求、バックアップ、workspace 関連の例外を除き、個人データの削除または匿名化を開始します。",
      "該当する場合、プロフィール、氏名、メール、アバター、アカウント設定、認証記録、個人設定、不要になったデバイスやセッション記録、技術的に削除可能な利用データ、あなたを識別するメンバー記録を削除または匿名化できます。",
      "NivaDesk はチーム workspace をサポートします。注文、顧客、ファイル、メモ、タスク、タイムライン、ログ、監査記録、業務データは workspace に属する場合があります。所有者の場合、所有権移転、エクスポート、閉鎖、削除確認を求めることがあります。",
      "請求、請求書、税務、会計、法的義務、セキュリティログ、紛争、利用規約の執行、不正防止、一時的なバックアップ、workspace の監査や履歴など、必要または許可された情報を保持することがあります。",
      "アップロードしたファイルや顧客データの削除は、それが個人アカウントに属するか、共有ビジネス workspace に属するかによって異なります。企業、雇用主、所有者が管理する workspace では、所有者の指示が必要になることがあります。",
      "削除前に、保持したい注文、ファイル、業務記録、その他コンテンツをエクスポートまたはダウンロードしてください。削除後はアカウントやデータを復元できない場合があります。技術的に可能な範囲で、有料プラン終了後も既存データをエクスポートできるよう努めます。",
      "確認済みの削除リクエストは、通常 30 日以内を目安に合理的な期間で処理するよう努めます。複雑性、法的義務、セキュリティ確認、workspace 所有権の問題、その他正当な理由により、追加時間が必要になる場合があります。",
      "NivaDesk アカウントを削除しても、App Store、Google Play、Stripe、その他プロバイダーが管理するサブスクリプションは自動的に解約されません。購入したプラットフォームで解約する責任があります。",
      "安全のため、再ログイン、メール確認、追加情報を求める場合があります。権限を確認できない場合、リクエストを拒否または遅延することがあります。",
      "不正、悪用、セキュリティ事故、法的請求、利用規約違反を検知、防止、調査するため、削除を遅延または拒否する場合があります。また、法律、裁判所、税務、会計、規制、正当な事業上の必要性により情報を保持する場合があります。",
      "アカウント削除の依頼またはこのポリシーに関する質問は、EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom または contact@nivadesk.co.uk までご連絡ください。"
    ]
  },
  "中文 (Chinese)": {
    lastUpdatedLabel: "最后更新",
    introTitle: "账户删除政策",
    introParagraphs: [
      "本政策说明用户如何请求删除其 NivaDesk 账户及相关个人数据。",
      "本政策用于支持 NivaDesk 用户、App Store 审核要求、Google Play 账户删除要求以及一般数据保护透明度。"
    ],
    sectionTitles: [
      "本政策涵盖的内容",
      "如何请求删除账户",
      "App Store 和 Google Play 要求",
      "提交请求后会发生什么",
      "我们通常删除或匿名化的数据",
      "Workspace 内容和团队账户",
      "我们可能需要保留的数据",
      "上传文件和客户数据",
      "删除前的数据导出",
      "处理时间",
      "取消订阅是单独流程",
      "重新认证和身份检查",
      "欺诈、滥用和法律限制",
      "联系我们"
    ],
    sectionSummaries: [
      "本政策适用于通过网站、Web 应用、移动应用、桌面应用或相关服务创建的 NivaDesk 账户。如果你是其他个人或企业拥有的 workspace 成员，某些共享数据可能仍由 workspace 所有者控制。",
      "你可以在应用内通过 Settings > Account > Delete Account 请求删除（如可用），也可以使用本公开页面，或从账户关联邮箱发送邮件至 contact@nivadesk.co.uk，主题为 NivaDesk account deletion request。我们可能要求验证身份。",
      "NivaDesk 设计为支持 Apple 和 Google Play 对允许创建账户的应用提出的账户删除要求。因此，应同时提供应用内删除路径和无需重新安装应用即可请求删除的公开网页。",
      "收到请求后，我们会采取合理措施确认请求真实且你有权删除账户。验证后，我们将开始删除或匿名化账户相关个人数据，但需遵守法律、安全、计费、备份和 workspace 相关例外。",
      "在适用情况下，我们可删除或匿名化用户资料、姓名、邮箱、头像、账户偏好、认证记录、个人设置、不再需要的设备或会话记录、技术上可删除的使用数据以及可识别你的 workspace 成员记录。",
      "NivaDesk 支持团队 workspaces。订单、客户记录、文件、备注、任务、时间线、历史日志、团队审计记录和业务数据可能属于 workspace。如果你是所有者，我们可能要求转移所有权、导出数据、关闭 workspace 或确认删除。",
      "我们可能保留必要或法律允许的信息，包括计费记录、发票、税务和会计记录、法律义务记录、安全日志、争议或条款执行记录、欺诈预防记录、有限期备份以及 workspace 审计或历史记录。",
      "上传文件或客户数据的删除取决于内容属于个人账户还是共享业务 workspace。如果 workspace 由企业、雇主或所有者控制，删除共享业务记录或客户文件前可能需要所有者指示。",
      "删除前，请导出或下载你需要保留的订单、文件、业务记录或其他内容。删除完成后，我们可能无法恢复账户或已删除数据。在技术可行时，NivaDesk 目标是即使付费计划结束后也允许用户导出现有业务数据。",
      "我们力求在合理时间内处理已验证的删除请求，通常为 30 天内。复杂请求、法律义务、安全检查、workspace 所有权问题或其他正当原因可能需要更长时间。",
      "删除 NivaDesk 账户不会自动取消由 App Store、Google Play、Stripe 或其他支付提供商管理的订阅。你需要在购买订阅的平台上自行取消。",
      "出于安全考虑，我们可能要求你重新登录、通过邮件确认或提供额外信息。如果无法验证请求人有权删除账户或 workspace，我们可能拒绝或延迟请求。",
      "为检测、防止或调查欺诈、滥用、安全事件、法律主张或违反服务条款的行为，我们可能延迟或拒绝删除；也可能因法律、法院、税务、会计、监管或合法业务需要保留信息。",
      "如需请求删除账户或咨询本政策，请联系 EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom 或 contact@nivadesk.co.uk。"
    ]
  },
  "العربية (Arabic)": {
    lastUpdatedLabel: "آخر تحديث",
    introTitle: "سياسة حذف الحساب",
    introParagraphs: [
      "توضح هذه السياسة كيف يمكن للمستخدمين طلب حذف حساب NivaDesk والبيانات الشخصية المرتبطة به.",
      "تهدف إلى دعم مستخدمي NivaDesk ومتطلبات App Store و Google Play لحذف الحسابات والشفافية العامة في حماية البيانات."
    ],
    sectionTitles: [
      "ما الذي تغطيه هذه السياسة",
      "كيفية طلب حذف الحساب",
      "متطلبات App Store و Google Play",
      "ماذا يحدث بعد طلب الحذف",
      "البيانات التي نحذفها أو نجعلها مجهولة عادة",
      "محتوى workspaces وحسابات الفريق",
      "البيانات التي قد نحتاج إلى الاحتفاظ بها",
      "الملفات المرفوعة وبيانات العملاء",
      "تصدير البيانات قبل الحذف",
      "المدة الزمنية",
      "إلغاء الاشتراكات إجراء منفصل",
      "إعادة المصادقة والتحقق من الهوية",
      "الاحتيال وإساءة الاستخدام والقيود القانونية",
      "التواصل"
    ],
    sectionSummaries: [
      "تنطبق هذه السياسة على حسابات NivaDesk التي يتم إنشاؤها عبر الموقع أو تطبيق الويب أو تطبيقات الهاتف أو تطبيقات سطح المكتب أو الخدمات المرتبطة. إذا كنت عضواً في workspace يملكه شخص أو شركة أخرى، فقد تبقى بعض البيانات المشتركة تحت تحكم مالك workspace.",
      "يمكنك طلب الحذف من داخل التطبيق عبر Settings > Account > Delete Account عند توفره، أو من هذه الصفحة العامة، أو بإرسال بريد إلى contact@nivadesk.co.uk بعنوان NivaDesk account deletion request. قد نطلب منك التحقق من هويتك.",
      "تم تصميم NivaDesk لدعم متطلبات Apple و Google Play للتطبيقات التي تسمح بإنشاء الحسابات. لذلك يجب توفير مسار حذف داخل التطبيق وصفحة عامة تتيح طلب الحذف دون إعادة تثبيت التطبيق.",
      "بعد استلام طلبك، سنتخذ خطوات معقولة للتحقق من أن الطلب حقيقي وأنك مخول بحذف الحساب. بعد التحقق، نبدأ حذف أو إخفاء هوية البيانات الشخصية المرتبطة بالحساب، مع مراعاة الاستثناءات القانونية والأمنية والفوترة والنسخ الاحتياطي وworkspace.",
      "عند الاقتضاء، قد نحذف أو نخفي هوية ملفك الشخصي واسمك وبريدك وصورتك وتفضيلات الحساب وسجلات المصادقة والإعدادات الشخصية وسجلات الأجهزة أو الجلسات غير المطلوبة وبيانات الاستخدام القابلة للحذف تقنياً وسجلات العضوية التي تحدد هويتك.",
      "يدعم NivaDesk workspaces للفِرق. قد تكون الطلبات والعملاء والملفات والملاحظات والمهام والجداول والسجلات وسجلات التدقيق والبيانات التجارية مملوكة للـ workspace. إذا كنت المالك، قد نطلب نقل الملكية أو التصدير أو الإغلاق أو تأكيد الحذف.",
      "قد نحتفظ بالمعلومات الضرورية أو المسموح بها، بما في ذلك سجلات الفوترة والفواتير والضرائب والمحاسبة والالتزامات القانونية وسجلات الأمان والنزاعات وإنفاذ الشروط ومنع الاحتيال والنسخ الاحتياطية المؤقتة وسجلات التدقيق أو التاريخ الخاصة بـ workspace.",
      "يعتمد حذف الملفات المرفوعة أو بيانات العملاء على ما إذا كانت تخص حسابك الشخصي أو workspace تجاري مشترك. إذا كان workspace تحت سيطرة شركة أو صاحب عمل أو مالك، فقد نحتاج إلى تعليمات من مالك workspace.",
      "قبل الحذف، يجب تصدير أو تنزيل الطلبات أو الملفات أو السجلات التجارية أو المحتوى الذي تريد الاحتفاظ به. بعد اكتمال الحذف، قد لا نتمكن من استعادة الحساب أو البيانات. عندما يكون ذلك ممكناً تقنياً، يهدف NivaDesk إلى السماح بتصدير البيانات حتى بعد انتهاء خطة مدفوعة.",
      "نسعى إلى معالجة طلبات الحذف المؤكدة خلال وقت معقول، وعادة خلال 30 يوماً. قد تتطلب التعقيدات أو الالتزامات القانونية أو فحوصات الأمان أو مشكلات ملكية workspace أو أسباب صالحة أخرى وقتاً أطول.",
      "حذف حساب NivaDesk لا يلغي تلقائياً الاشتراكات التي تديرها App Store أو Google Play أو Stripe أو مزود آخر. أنت مسؤول عن إلغاء الاشتراك من المنصة التي اشتريته منها.",
      "لأسباب أمنية، قد نطلب تسجيل الدخول مرة أخرى أو تأكيداً عبر البريد أو معلومات إضافية. إذا لم نتمكن من التحقق من التفويض، فقد نرفض الطلب أو نؤخره.",
      "قد نؤخر أو نرفض الحذف لاكتشاف أو منع أو التحقيق في الاحتيال أو إساءة الاستخدام أو الحوادث الأمنية أو المطالبات القانونية أو انتهاكات الشروط، وقد نحتفظ بالمعلومات إذا تطلب القانون أو المحكمة أو الضرائب أو المحاسبة أو التنظيم أو المصالح التجارية المشروعة ذلك.",
      "لطلبات حذف الحساب أو الأسئلة حول هذه السياسة، تواصل مع EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom أو contact@nivadesk.co.uk."
    ]
  },
  "हिन्दी (Hindi)": {
    lastUpdatedLabel: "अंतिम अपडेट",
    introTitle: "खाता हटाने की नीति",
    introParagraphs: [
      "यह नीति बताती है कि उपयोगकर्ता अपना NivaDesk खाता और उससे जुड़ा व्यक्तिगत डेटा हटाने का अनुरोध कैसे कर सकते हैं।",
      "यह NivaDesk उपयोगकर्ताओं, App Store review requirements, Google Play account deletion requirements और डेटा सुरक्षा पारदर्शिता को समर्थन देने के लिए है।"
    ],
    sectionTitles: [
      "यह नीति क्या कवर करती है",
      "खाता हटाने का अनुरोध कैसे करें",
      "App Store और Google Play requirements",
      "अनुरोध के बाद क्या होता है",
      "हम सामान्यतः कौन सा डेटा हटाते या anonymise करते हैं",
      "Workspace content और team accounts",
      "वह डेटा जिसे हमें रखना पड़ सकता है",
      "Uploaded files और client data",
      "Deletion से पहले data export",
      "Timing",
      "Subscription cancel करना अलग है",
      "Re-authentication और identity checks",
      "Fraud, abuse और legal restrictions",
      "Contact"
    ],
    sectionSummaries: [
      "यह नीति website, web app, mobile app, desktop app या related services से बनाए गए NivaDesk accounts पर लागू होती है। यदि आप किसी दूसरे व्यक्ति या business के workspace member हैं, तो कुछ shared workspace data owner के control में रह सकता है।",
      "आप app में Settings > Account > Delete Account उपलब्ध होने पर, इस public page से, या अपने account email से contact@nivadesk.co.uk पर NivaDesk account deletion request subject के साथ request भेजकर deletion मांग सकते हैं। हम identity verification मांग सकते हैं।",
      "NivaDesk उन apps के लिए Apple और Google Play account deletion requirements support करने के लिए designed है जिनमें account creation होता है। इसलिए app के अंदर deletion path और app reinstall किए बिना request करने के लिए public web page दोनों होने चाहिए।",
      "Request मिलने के बाद हम reasonable steps लेकर verify करेंगे कि request genuine है और आप account delete करने के लिए authorised हैं। Verification के बाद हम personal data delete या anonymise करना शुरू करेंगे, legal, security, billing, backup और workspace exceptions के अधीन।",
      "जहाँ लागू हो, हम profile, name, email, avatar, account preferences, authentication records, personal settings, अब जरूरी न रहे device/session records, technically deletable usage data और आपको identify करने वाले workspace membership records delete या anonymise कर सकते हैं।",
      "NivaDesk team workspaces support करता है। Orders, client records, files, notes, tasks, timelines, history logs, team audit records और business data workspace से संबंधित हो सकते हैं। Owner होने पर transfer, export, close workspace या deletion confirmation की आवश्यकता हो सकती है।",
      "हम billing records, invoices, tax/accounting records, legal obligation records, security logs, disputes या Terms enforcement records, fraud prevention records, temporary backups और workspace audit/history records जैसी necessary या legally permitted information रख सकते हैं।",
      "Uploaded files या client data का deletion इस पर निर्भर करता है कि content personal account से संबंधित है या shared business workspace से। यदि workspace business, employer या owner के control में है, तो shared records हटाने से पहले owner instructions चाहिए हो सकते हैं।",
      "Deletion से पहले आपको orders, files, business records या other content export/download कर लेना चाहिए जिन्हें रखना है। Deletion के बाद account या deleted data restore करना संभव नहीं हो सकता। Technically available होने पर NivaDesk paid plan खत्म होने के बाद भी existing business data export कराने का लक्ष्य रखता है।",
      "हम verified deletion requests को reasonable time में, सामान्यतः 30 दिनों के भीतर process करने का प्रयास करते हैं। Complexity, legal obligations, security checks, workspace ownership issues या other valid reasons अधिक समय ले सकते हैं।",
      "NivaDesk account delete करने से Apple App Store, Google Play, Stripe या किसी दूसरे provider द्वारा managed subscriptions automatically cancel नहीं होते। Subscription उस platform पर cancel करना आपकी जिम्मेदारी है जहाँ आपने खरीदा था।",
      "Security के लिए हम दोबारा login, email confirmation या additional information मांग सकते हैं। यदि authorization verify नहीं हो पाती, तो request reject या delay हो सकती है।",
      "Fraud, abuse, security incidents, legal claims या Terms violations detect, prevent या investigate करने के लिए हम deletion delay या refuse कर सकते हैं, और law, court order, tax, accounting, regulatory requirements या legitimate business needs के कारण information retain कर सकते हैं।",
      "Account deletion requests या इस policy पर questions के लिए EGGCRAFT LIMITED, 141 Randolph Avenue, London, W9 1DN, United Kingdom या contact@nivadesk.co.uk पर संपर्क करें।"
    ]
  }
};

const ACCOUNT_DELETION_POLICY_LABELS: Partial<Record<StudioLanguage, string>> = {
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

const LOCALIZED_ACCOUNT_DELETION_POLICIES: Partial<Record<StudioLanguage, PrivacyPolicySection[]>> = Object.fromEntries(
  Object.entries(ACCOUNT_DELETION_DRAFTS).map(([language, copy]) => [
    language,
    buildLocalizedDeletionPolicy(copy as LocalizedDeletionDraft)
  ])
) as Partial<Record<StudioLanguage, PrivacyPolicySection[]>>;

export function getAccountDeletionPolicySections(language: StudioLanguage | string | null | undefined) {
  const normalized = language as StudioLanguage;
  return LOCALIZED_ACCOUNT_DELETION_POLICIES[normalized] ?? ACCOUNT_DELETION_POLICY_SECTIONS;
}

export function getAccountDeletionPolicyLastUpdatedLabel(language: StudioLanguage | string | null | undefined) {
  return ACCOUNT_DELETION_POLICY_LABELS[language as StudioLanguage] ?? "Last updated";
}
