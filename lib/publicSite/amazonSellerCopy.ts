import type { StudioLanguage } from "@/lib/studioflow/language";
import { AMAZON_SELLER_PAGE_COPY, type AmazonSellerPageCopy } from "@/lib/publicSite/amazonSellerPageCopy";

/**
 * The public page for Amazon sellers (/integrations/amazon), written for the
 * Selling Partner Appstore review (case 22144456961, 5 October 2026: "a website
 * URL that provides details about the services your app offers to Amazon
 * Sellers … pricing, functions details, and other features").
 *
 * Every sentence states something the code does today; the commit that adds
 * this file lists the evidence claim by claim. When the
 * connector changes — Amazon publishes the app (SP_API_DRAFT goes away), a new
 * regional sign-in is switched on, a new dataset is requested — change this
 * file on the same day.
 *
 *   - Status "Access under review": the zone runs with SP_API_DRAFT=1, so a
 *     third-party seller cannot finish Amazon's consent screen
 *     (functions-amazon/deploy/service-oauth.yaml; web AmazonIntegrationSection
 *     keeps Connect disabled until the server reports "published").
 *   - Read-only: the SP-API client sends GET requests only
 *     (functions-amazon/src/amazon/client.js).
 *   - No buyer data: BUYER and RECIPIENT are never requested
 *     (functions-amazon/src/amazon/sanitize.js INCLUDED_DATA_A1).
 *   - Region: consent starts at sellercentral-europe.amazon.com and reads the
 *     Europe-region API (service-oauth.yaml SELLER_CENTRAL_HOST, SP_API_REGION).
 *   - Pricing: no plan gate on amazonConnectStart; plans from
 *     lib/studioflow/plans.ts.
 *
 * Its own table, keyed by language, rather than ~70 more keys in
 * translations.ts: the Record type makes a missing language a compile error,
 * and nothing here is split across tables (see translation-merge-order).
 * Brand names (NivaDesk, Amazon, Seller Central, Google Cloud) stay untranslated.
 *
 * The page was rebuilt on 7 October 2026: the sections added then (use cases,
 * the field list, how syncing works, reads/never writes, limitations, FAQ) live
 * in amazonSellerPageCopy.ts with their own evidence list, and are merged with
 * this table below. A field lives in exactly one of the two files.
 */

type Pair = readonly [title: string, body: string];

type AmazonSellerBaseCopy = {
  eyebrow: string;
  ctaPricing: string;
  statusLabel: string;
  statusTitle: string;
  statusBody: string;
  connectTitle: string;
  connectSteps: readonly Pair[];
  connectDisconnect: string;
  connectAppstore: string;
  marketsTitle: string;
  regionEurope: string;
  marketsSignInLive: string;
  pricingTitle: string;
  pricingIntro: string;
  pricingTrial: string;
  planFree: string;
  perMonth: string;
  perYear: string;
  planFreeNote: string;
  planStarterNote: string;
  planProNote: string;
  planTeamNote: string;
  extraSeat: string;
  includesAmazon: string;
  pricingLink: string;
  dataTitle: string;
  data: readonly Pair[];
  legalTitle: string;
  linkPrivacy: string;
  linkTerms: string;
  linkSecurity: string;
  linkSubprocessors: string;
  linkDeletion: string;
  contactTitle: string;
  contactBody: string;
  contactEmailLabel: string;
  contactPage: string;
  company: string;
  trademark: string;
};

const EN: AmazonSellerBaseCopy = {
  eyebrow: "NivaDesk for Amazon sellers",
  ctaPricing: "See pricing",
  statusLabel: "Access under review",
  statusTitle: "Current status",
  statusBody: "The NivaDesk app is waiting for Amazon's approval and is still in Draft status at Amazon. Until Amazon approves it, sellers cannot complete the connection. Once it is approved, the Connect button in NivaDesk becomes available on its own; there is nothing to install.",
  connectTitle: "How connecting works",
  connectSteps: [
    ["The workspace owner starts it", "In NivaDesk, open Settings › Integrations › Amazon. Only the workspace owner can connect or disconnect Amazon; team members can see whether the connection is working."],
    ["You approve on Amazon", "NivaDesk sends you to Amazon's own consent page in Seller Central. NivaDesk never sees your Amazon password."],
    ["Orders arrive", "NivaDesk finds the marketplaces your account sells in and starts bringing in your orders."]
  ],
  connectDisconnect: "You can disconnect at any time from the same screen: syncing stops and the stored Amazon authorisation is deleted. Orders already imported stay in your workspace.",
  connectAppstore: "The connection is started from NivaDesk. If you arrive from the Amazon Appstore, sign in or create a free workspace, then connect from Settings › Integrations.",
  marketsTitle: "Amazon marketplaces",
  regionEurope: "Europe region",
  marketsSignInLive: "Sign-in through Seller Central Europe",
  pricingTitle: "Pricing",
  pricingIntro: "The Amazon connection has no separate price and is not limited to a plan: it is included on every NivaDesk plan, including Free. Prices are in pounds sterling (GBP).",
  pricingTrial: "Every paid plan can start with a 14-day free trial, with no card required.",
  planFree: "Free",
  perMonth: "per month",
  perYear: "per year",
  planFreeNote: "10 active orders (delivered and deleted don't count) · unlimited customers · 1 user",
  planStarterNote: "Unlimited orders and customers · 250 MB storage · 1 user",
  planProNote: "Everything in Starter, plus advanced finance, Client Files and bank feed · 10 GB storage · 1 user",
  planTeamNote: "Everything in Pro, plus team access with 5 seats included (up to 10) · 50 GB storage",
  extraSeat: "Extra Team seat: £5 per month or £50 per year.",
  includesAmazon: "Amazon connection included",
  pricingLink: "See full plan details",
  dataTitle: "Data and security",
  data: [
    ["What NivaDesk reads", "Order data only: order and item details, amounts, statuses and dates, plus the list of marketplaces your account sells in. Buyer and recipient data is not requested."],
    ["Where it is kept", "Amazon data is handled in a separate Google Cloud project used only for the Amazon connection, in London (europe-west2). Your Amazon authorisation is kept in Google Secret Manager."],
    ["How it is protected", "Connections use HTTPS (TLS), and Google Cloud encrypts stored data at rest. The Amazon service can only call Amazon's own endpoints and NivaDesk's import endpoint, and only fields on a fixed allowlist are passed into your workspace."],
    ["Who can see it", "Imported orders are visible only to members of your workspace. Team members can see whether the connection is working, but not its details."],
    ["Deleting it", "Disconnecting deletes the stored Amazon authorisation. You can delete imported orders, or your whole account, at any time."]
  ],
  legalTitle: "Policies",
  linkPrivacy: "Privacy Policy",
  linkTerms: "Terms of Service",
  linkSecurity: "Security overview",
  linkSubprocessors: "Subprocessors",
  linkDeletion: "Account deletion",
  contactTitle: "Questions and support",
  contactBody: "Write to us by email or through the contact page, and we will reply.",
  contactEmailLabel: "Email",
  contactPage: "Contact page",
  company: "NivaDesk is made by EGGCRAFT LIMITED, registered in England and Wales, company number 16566512.",
  trademark: "Amazon and Seller Central are trademarks of Amazon.com, Inc. or its affiliates. NivaDesk is an independent product and is not affiliated with or endorsed by Amazon."
};

const TR: AmazonSellerBaseCopy = {
  eyebrow: "Amazon satıcıları için NivaDesk",
  ctaPricing: "Fiyatları gör",
  statusLabel: "Erişim inceleniyor",
  statusTitle: "Güncel durum",
  statusBody: "NivaDesk uygulaması Amazon'un onayını bekliyor ve Amazon'da hâlâ Taslak (Draft) durumunda. Amazon onaylayana kadar satıcılar bağlantıyı tamamlayamaz. Onaylandığında NivaDesk'teki Bağlan düğmesi kendiliğinden kullanılabilir olur; kurulacak bir şey yoktur.",
  connectTitle: "Bağlantı nasıl kurulur",
  connectSteps: [
    ["Çalışma alanı sahibi başlatır", "NivaDesk'te Ayarlar › Entegrasyonlar › Amazon'u açın. Amazon'u yalnızca çalışma alanı sahibi bağlayabilir veya bağlantısını kesebilir; ekip üyeleri bağlantının çalışıp çalışmadığını görebilir."],
    ["Amazon'da onaylarsınız", "NivaDesk sizi Seller Central'daki Amazon'un kendi onay sayfasına yönlendirir. NivaDesk Amazon şifrenizi hiçbir zaman görmez."],
    ["Siparişler gelir", "NivaDesk hesabınızın satış yaptığı pazar yerlerini bulur ve siparişlerinizi getirmeye başlar."]
  ],
  connectDisconnect: "Bağlantıyı aynı ekrandan istediğiniz zaman kesebilirsiniz: eşitleme durur ve saklanan Amazon yetkisi silinir. Daha önce aktarılan siparişler çalışma alanınızda kalır.",
  connectAppstore: "Bağlantı NivaDesk'ten başlatılır. Amazon Appstore'dan geldiyseniz giriş yapın veya ücretsiz bir çalışma alanı oluşturun, ardından Ayarlar › Entegrasyonlar'dan bağlanın.",
  marketsTitle: "Amazon pazar yerleri",
  regionEurope: "Avrupa bölgesi",
  marketsSignInLive: "Seller Central Europe üzerinden oturum açma",
  pricingTitle: "Fiyatlandırma",
  pricingIntro: "Amazon bağlantısının ayrı bir ücreti yoktur ve bir plana bağlı değildir: Free dahil her NivaDesk planında vardır. Fiyatlar İngiliz sterlini (GBP) cinsindendir.",
  pricingTrial: "Her ücretli plan, kart gerekmeden 14 günlük ücretsiz denemeyle başlayabilir.",
  planFree: "Free",
  perMonth: "aylık",
  perYear: "yıllık",
  planFreeNote: "10 aktif sipariş (teslim edilen ve silinenler sayılmaz) · sınırsız müşteri · 1 kullanıcı",
  planStarterNote: "Sınırsız sipariş ve müşteri · 250 MB depolama · 1 kullanıcı",
  planProNote: "Starter'daki her şey, artı gelişmiş finans, Client Files ve banka akışı · 10 GB depolama · 1 kullanıcı",
  planTeamNote: "Pro'daki her şey, artı 5 koltuk dahil ekip erişimi (10'a kadar) · 50 GB depolama",
  extraSeat: "Ek Team koltuğu: aylık £5 veya yıllık £50.",
  includesAmazon: "Amazon bağlantısı dahil",
  pricingLink: "Plan ayrıntılarının tamamını gör",
  dataTitle: "Veri ve güvenlik",
  data: [
    ["NivaDesk neyi okur", "Yalnızca sipariş verisi: sipariş ve ürün ayrıntıları, tutarlar, durumlar ve tarihler, ayrıca hesabınızın satış yaptığı pazar yerlerinin listesi. Alıcı ve teslim alan verisi istenmez."],
    ["Nerede tutulur", "Amazon verisi, yalnızca Amazon bağlantısı için kullanılan ayrı bir Google Cloud projesinde, Londra'da (europe-west2) işlenir. Amazon yetkiniz Google Secret Manager'da tutulur."],
    ["Nasıl korunur", "Bağlantılar HTTPS (TLS) kullanır ve Google Cloud saklanan verileri bekleme sırasında şifreler. Amazon hizmeti yalnızca Amazon'un kendi uç noktalarını ve NivaDesk'in aktarım uç noktasını çağırabilir; çalışma alanınıza yalnızca sabit bir izin listesindeki alanlar geçer."],
    ["Kim görebilir", "Aktarılan siparişleri yalnızca çalışma alanınızın üyeleri görebilir. Ekip üyeleri bağlantının çalışıp çalışmadığını görür, ayrıntılarını görmez."],
    ["Silme", "Bağlantıyı kesmek saklanan Amazon yetkisini siler. Aktarılan siparişleri veya hesabınızın tamamını istediğiniz zaman silebilirsiniz."]
  ],
  legalTitle: "Politikalar",
  linkPrivacy: "Gizlilik Politikası",
  linkTerms: "Hizmet Koşulları",
  linkSecurity: "Güvenlik özeti",
  linkSubprocessors: "Alt işleyiciler",
  linkDeletion: "Hesap silme",
  contactTitle: "Sorular ve destek",
  contactBody: "Bize e-postayla veya iletişim sayfasından yazın, yanıt verelim.",
  contactEmailLabel: "E-posta",
  contactPage: "İletişim sayfası",
  company: "NivaDesk, İngiltere ve Galler'de 16566512 şirket numarasıyla kayıtlı EGGCRAFT LIMITED tarafından geliştirilir.",
  trademark: "Amazon ve Seller Central, Amazon.com, Inc. veya bağlı şirketlerinin ticari markalarıdır. NivaDesk bağımsız bir üründür; Amazon ile bağlantılı değildir ve Amazon tarafından onaylanmamıştır."
};

const DE: AmazonSellerBaseCopy = {
  eyebrow: "NivaDesk für Amazon-Verkäufer",
  ctaPricing: "Preise ansehen",
  statusLabel: "Zugang wird geprüft",
  statusTitle: "Aktueller Stand",
  statusBody: "Die NivaDesk-App wartet auf die Freigabe durch Amazon und hat bei Amazon noch den Status „Draft“ (Entwurf). Bis Amazon sie freigibt, können Verkäufer die Verbindung nicht abschließen. Nach der Freigabe wird die Schaltfläche „Verbinden“ in NivaDesk von selbst verfügbar; es muss nichts installiert werden.",
  connectTitle: "So funktioniert das Verbinden",
  connectSteps: [
    ["Der Workspace-Inhaber startet", "Öffnen Sie in NivaDesk Einstellungen › Integrationen › Amazon. Nur der Workspace-Inhaber kann Amazon verbinden oder trennen; Teammitglieder sehen, ob die Verbindung funktioniert."],
    ["Sie bestätigen bei Amazon", "NivaDesk leitet Sie zur eigenen Zustimmungsseite von Amazon in Seller Central. NivaDesk sieht Ihr Amazon-Passwort nie."],
    ["Bestellungen kommen an", "NivaDesk ermittelt die Marktplätze, auf denen Ihr Konto verkauft, und beginnt, Ihre Bestellungen zu übernehmen."]
  ],
  connectDisconnect: "Sie können die Verbindung jederzeit auf demselben Bildschirm trennen: Die Synchronisierung stoppt und die gespeicherte Amazon-Autorisierung wird gelöscht. Bereits importierte Bestellungen bleiben in Ihrem Workspace.",
  connectAppstore: "Die Verbindung wird in NivaDesk gestartet. Wenn Sie aus dem Amazon Appstore kommen, melden Sie sich an oder erstellen Sie einen kostenlosen Workspace und verbinden Sie dann unter Einstellungen › Integrationen.",
  marketsTitle: "Amazon-Marktplätze",
  regionEurope: "Region Europa",
  marketsSignInLive: "Anmeldung über Seller Central Europe",
  pricingTitle: "Preise",
  pricingIntro: "Die Amazon-Verbindung kostet nichts extra und ist an keinen Tarif gebunden: Sie ist in jedem NivaDesk-Tarif enthalten, auch in Free. Preise in britischen Pfund (GBP).",
  pricingTrial: "Jeder kostenpflichtige Tarif kann mit einer 14-tägigen kostenlosen Testphase beginnen, ohne Karte.",
  planFree: "Free",
  perMonth: "pro Monat",
  perYear: "pro Jahr",
  planFreeNote: "10 aktive Bestellungen (gelieferte und gelöschte zählen nicht) · unbegrenzt Kunden · 1 Nutzer",
  planStarterNote: "Unbegrenzte Bestellungen und Kunden · 250 MB Speicher · 1 Nutzer",
  planProNote: "Alles aus Starter, dazu erweiterte Finanzen, Client Files und Bank-Feed · 10 GB Speicher · 1 Nutzer",
  planTeamNote: "Alles aus Pro, dazu Teamzugang mit 5 enthaltenen Plätzen (bis zu 10) · 50 GB Speicher",
  extraSeat: "Zusätzlicher Team-Platz: £5 pro Monat oder £50 pro Jahr.",
  includesAmazon: "Amazon-Verbindung enthalten",
  pricingLink: "Alle Tarifdetails ansehen",
  dataTitle: "Daten und Sicherheit",
  data: [
    ["Was NivaDesk liest", "Nur Bestelldaten: Bestell- und Artikeldetails, Beträge, Status und Daten sowie die Liste der Marktplätze, auf denen Ihr Konto verkauft. Käufer- und Empfängerdaten werden nicht angefordert."],
    ["Wo sie liegen", "Amazon-Daten werden in einem separaten Google-Cloud-Projekt verarbeitet, das nur für die Amazon-Verbindung genutzt wird, in London (europe-west2). Ihre Amazon-Autorisierung liegt in Google Secret Manager."],
    ["Wie sie geschützt sind", "Verbindungen nutzen HTTPS (TLS), und Google Cloud verschlüsselt gespeicherte Daten im Ruhezustand. Der Amazon-Dienst kann nur Amazons eigene Endpunkte und den Import-Endpunkt von NivaDesk aufrufen, und nur Felder einer festen Positivliste gelangen in Ihren Workspace."],
    ["Wer sie sieht", "Importierte Bestellungen sind nur für Mitglieder Ihres Workspace sichtbar. Teammitglieder sehen, ob die Verbindung funktioniert, aber nicht deren Details."],
    ["Löschen", "Das Trennen löscht die gespeicherte Amazon-Autorisierung. Importierte Bestellungen oder Ihr gesamtes Konto können Sie jederzeit löschen."]
  ],
  legalTitle: "Richtlinien",
  linkPrivacy: "Datenschutzerklärung",
  linkTerms: "Nutzungsbedingungen",
  linkSecurity: "Sicherheitsübersicht",
  linkSubprocessors: "Unterauftragsverarbeiter",
  linkDeletion: "Kontolöschung",
  contactTitle: "Fragen und Support",
  contactBody: "Schreiben Sie uns per E-Mail oder über die Kontaktseite, wir antworten Ihnen.",
  contactEmailLabel: "E-Mail",
  contactPage: "Kontaktseite",
  company: "NivaDesk wird von EGGCRAFT LIMITED entwickelt, eingetragen in England und Wales, Firmennummer 16566512.",
  trademark: "Amazon und Seller Central sind Marken von Amazon.com, Inc. oder seinen verbundenen Unternehmen. NivaDesk ist ein unabhängiges Produkt und steht in keiner Verbindung zu Amazon und wird nicht von Amazon unterstützt."
};

const FR: AmazonSellerBaseCopy = {
  eyebrow: "NivaDesk pour les vendeurs Amazon",
  ctaPricing: "Voir les tarifs",
  statusLabel: "Accès en cours d'examen",
  statusTitle: "Statut actuel",
  statusBody: "L'application NivaDesk attend l'approbation d'Amazon et est encore au statut Draft (brouillon) chez Amazon. Tant qu'Amazon ne l'a pas approuvée, les vendeurs ne peuvent pas finaliser la connexion. Une fois approuvée, le bouton Connecter de NivaDesk devient disponible de lui-même ; il n'y a rien à installer.",
  connectTitle: "Comment se connecter",
  connectSteps: [
    ["Le propriétaire de l'espace lance la connexion", "Dans NivaDesk, ouvrez Paramètres › Intégrations › Amazon. Seul le propriétaire de l'espace peut connecter ou déconnecter Amazon ; les membres de l'équipe voient si la connexion fonctionne."],
    ["Vous approuvez sur Amazon", "NivaDesk vous envoie vers la page de consentement d'Amazon dans Seller Central. NivaDesk ne voit jamais votre mot de passe Amazon."],
    ["Les commandes arrivent", "NivaDesk repère les places de marché sur lesquelles votre compte vend et commence à importer vos commandes."]
  ],
  connectDisconnect: "Vous pouvez vous déconnecter à tout moment depuis le même écran : la synchronisation s'arrête et l'autorisation Amazon enregistrée est supprimée. Les commandes déjà importées restent dans votre espace.",
  connectAppstore: "La connexion se lance depuis NivaDesk. Si vous arrivez depuis l'Amazon Appstore, connectez-vous ou créez un espace gratuit, puis connectez Amazon depuis Paramètres › Intégrations.",
  marketsTitle: "Places de marché Amazon",
  regionEurope: "Région Europe",
  marketsSignInLive: "Connexion via Seller Central Europe",
  pricingTitle: "Tarifs",
  pricingIntro: "La connexion Amazon n'a pas de prix séparé et n'est réservée à aucune offre : elle est incluse dans toutes les offres NivaDesk, y compris Free. Prix en livres sterling (GBP).",
  pricingTrial: "Chaque offre payante peut commencer par un essai gratuit de 14 jours, sans carte.",
  planFree: "Free",
  perMonth: "par mois",
  perYear: "par an",
  planFreeNote: "10 commandes actives (livrées et supprimées non comptées) · clients illimités · 1 utilisateur",
  planStarterNote: "Commandes et clients illimités · 250 Mo de stockage · 1 utilisateur",
  planProNote: "Tout Starter, plus finances avancées, Client Files et flux bancaire · 10 Go de stockage · 1 utilisateur",
  planTeamNote: "Tout Pro, plus l'accès équipe avec 5 places incluses (jusqu'à 10) · 50 Go de stockage",
  extraSeat: "Place Team supplémentaire : 5 £ par mois ou 50 £ par an.",
  includesAmazon: "Connexion Amazon incluse",
  pricingLink: "Voir le détail des offres",
  dataTitle: "Données et sécurité",
  data: [
    ["Ce que NivaDesk lit", "Uniquement des données de commande : détails des commandes et des articles, montants, statuts et dates, ainsi que la liste des places de marché où votre compte vend. Les données d'acheteur et de destinataire ne sont pas demandées."],
    ["Où elles sont conservées", "Les données Amazon sont traitées dans un projet Google Cloud distinct, utilisé uniquement pour la connexion Amazon, à Londres (europe-west2). Votre autorisation Amazon est conservée dans Google Secret Manager."],
    ["Comment elles sont protégées", "Les connexions utilisent HTTPS (TLS) et Google Cloud chiffre les données stockées au repos. Le service Amazon ne peut appeler que les points d'accès d'Amazon et le point d'import de NivaDesk, et seuls les champs d'une liste autorisée fixe arrivent dans votre espace."],
    ["Qui peut les voir", "Les commandes importées ne sont visibles que par les membres de votre espace. Les membres de l'équipe voient si la connexion fonctionne, mais pas ses détails."],
    ["Suppression", "La déconnexion supprime l'autorisation Amazon enregistrée. Vous pouvez supprimer les commandes importées, ou tout votre compte, à tout moment."]
  ],
  legalTitle: "Politiques",
  linkPrivacy: "Politique de confidentialité",
  linkTerms: "Conditions d'utilisation",
  linkSecurity: "Présentation de la sécurité",
  linkSubprocessors: "Sous-traitants",
  linkDeletion: "Suppression du compte",
  contactTitle: "Questions et assistance",
  contactBody: "Écrivez-nous par e-mail ou via la page de contact, nous vous répondrons.",
  contactEmailLabel: "E-mail",
  contactPage: "Page de contact",
  company: "NivaDesk est édité par EGGCRAFT LIMITED, société immatriculée en Angleterre et au pays de Galles sous le numéro 16566512.",
  trademark: "Amazon et Seller Central sont des marques d'Amazon.com, Inc. ou de ses sociétés affiliées. NivaDesk est un produit indépendant, ni affilié à Amazon ni approuvé par Amazon."
};

const IT: AmazonSellerBaseCopy = {
  eyebrow: "NivaDesk per i venditori Amazon",
  ctaPricing: "Vedi i prezzi",
  statusLabel: "Accesso in revisione",
  statusTitle: "Stato attuale",
  statusBody: "L'app NivaDesk è in attesa dell'approvazione di Amazon ed è ancora in stato Draft (bozza) presso Amazon. Finché Amazon non la approva, i venditori non possono completare la connessione. Una volta approvata, il pulsante Connetti in NivaDesk diventa disponibile da solo; non c'è nulla da installare.",
  connectTitle: "Come funziona la connessione",
  connectSteps: [
    ["La avvia il proprietario dello spazio", "In NivaDesk apri Impostazioni › Integrazioni › Amazon. Solo il proprietario dello spazio può connettere o disconnettere Amazon; i membri del team vedono se la connessione funziona."],
    ["Approvi su Amazon", "NivaDesk ti porta alla pagina di consenso di Amazon in Seller Central. NivaDesk non vede mai la tua password Amazon."],
    ["Arrivano gli ordini", "NivaDesk individua i marketplace in cui vende il tuo account e inizia a portare i tuoi ordini."]
  ],
  connectDisconnect: "Puoi disconnetterti in qualsiasi momento dalla stessa schermata: la sincronizzazione si ferma e l'autorizzazione Amazon salvata viene eliminata. Gli ordini già importati restano nel tuo spazio.",
  connectAppstore: "La connessione si avvia da NivaDesk. Se arrivi dall'Amazon Appstore, accedi o crea uno spazio gratuito, poi connettiti da Impostazioni › Integrazioni.",
  marketsTitle: "Marketplace Amazon",
  regionEurope: "Regione Europa",
  marketsSignInLive: "Accesso tramite Seller Central Europe",
  pricingTitle: "Prezzi",
  pricingIntro: "La connessione Amazon non ha un prezzo separato e non è limitata a un piano: è inclusa in ogni piano NivaDesk, compreso Free. Prezzi in sterline britanniche (GBP).",
  pricingTrial: "Ogni piano a pagamento può iniziare con una prova gratuita di 14 giorni, senza carta.",
  planFree: "Free",
  perMonth: "al mese",
  perYear: "all'anno",
  planFreeNote: "10 ordini attivi (consegnati ed eliminati non contano) · clienti illimitati · 1 utente",
  planStarterNote: "Ordini e clienti illimitati · 250 MB di spazio · 1 utente",
  planProNote: "Tutto di Starter, più finanza avanzata, Client Files e feed bancario · 10 GB di spazio · 1 utente",
  planTeamNote: "Tutto di Pro, più accesso del team con 5 posti inclusi (fino a 10) · 50 GB di spazio",
  extraSeat: "Posto Team aggiuntivo: £5 al mese o £50 all'anno.",
  includesAmazon: "Connessione Amazon inclusa",
  pricingLink: "Vedi tutti i dettagli dei piani",
  dataTitle: "Dati e sicurezza",
  data: [
    ["Cosa legge NivaDesk", "Solo dati degli ordini: dettagli di ordini e articoli, importi, stati e date, più l'elenco dei marketplace in cui vende il tuo account. I dati di acquirenti e destinatari non vengono richiesti."],
    ["Dove sono conservati", "I dati Amazon sono trattati in un progetto Google Cloud separato, usato solo per la connessione Amazon, a Londra (europe-west2). La tua autorizzazione Amazon è conservata in Google Secret Manager."],
    ["Come sono protetti", "Le connessioni usano HTTPS (TLS) e Google Cloud cifra i dati archiviati a riposo. Il servizio Amazon può chiamare solo gli endpoint di Amazon e l'endpoint di importazione di NivaDesk, e nel tuo spazio passano solo i campi di un elenco consentito fisso."],
    ["Chi può vederli", "Gli ordini importati sono visibili solo ai membri del tuo spazio. I membri del team vedono se la connessione funziona, ma non i suoi dettagli."],
    ["Eliminazione", "La disconnessione elimina l'autorizzazione Amazon salvata. Puoi eliminare gli ordini importati, o l'intero account, in qualsiasi momento."]
  ],
  legalTitle: "Informative",
  linkPrivacy: "Informativa sulla privacy",
  linkTerms: "Termini di servizio",
  linkSecurity: "Panoramica sulla sicurezza",
  linkSubprocessors: "Sub-responsabili",
  linkDeletion: "Eliminazione dell'account",
  contactTitle: "Domande e assistenza",
  contactBody: "Scrivici via email o dalla pagina contatti e ti risponderemo.",
  contactEmailLabel: "Email",
  contactPage: "Pagina contatti",
  company: "NivaDesk è realizzato da EGGCRAFT LIMITED, registrata in Inghilterra e Galles, numero di società 16566512.",
  trademark: "Amazon e Seller Central sono marchi di Amazon.com, Inc. o delle sue affiliate. NivaDesk è un prodotto indipendente, non affiliato ad Amazon né approvato da Amazon."
};

const ES: AmazonSellerBaseCopy = {
  eyebrow: "NivaDesk para vendedores de Amazon",
  ctaPricing: "Ver precios",
  statusLabel: "Acceso en revisión",
  statusTitle: "Estado actual",
  statusBody: "La aplicación NivaDesk está esperando la aprobación de Amazon y todavía está en estado Draft (borrador) en Amazon. Hasta que Amazon la apruebe, los vendedores no pueden completar la conexión. Una vez aprobada, el botón Conectar de NivaDesk se activará por sí solo; no hay nada que instalar.",
  connectTitle: "Cómo funciona la conexión",
  connectSteps: [
    ["La inicia el propietario del espacio", "En NivaDesk, abre Ajustes › Integraciones › Amazon. Solo el propietario del espacio puede conectar o desconectar Amazon; los miembros del equipo pueden ver si la conexión funciona."],
    ["Lo apruebas en Amazon", "NivaDesk te lleva a la página de consentimiento de Amazon en Seller Central. NivaDesk nunca ve tu contraseña de Amazon."],
    ["Llegan los pedidos", "NivaDesk detecta los marketplaces en los que vende tu cuenta y empieza a traer tus pedidos."]
  ],
  connectDisconnect: "Puedes desconectar en cualquier momento desde la misma pantalla: la sincronización se detiene y se elimina la autorización de Amazon guardada. Los pedidos ya importados se quedan en tu espacio.",
  connectAppstore: "La conexión se inicia desde NivaDesk. Si llegas desde la Amazon Appstore, inicia sesión o crea un espacio gratuito y conecta desde Ajustes › Integraciones.",
  marketsTitle: "Marketplaces de Amazon",
  regionEurope: "Región Europa",
  marketsSignInLive: "Inicio de sesión mediante Seller Central Europe",
  pricingTitle: "Precios",
  pricingIntro: "La conexión con Amazon no tiene precio aparte ni está limitada a un plan: está incluida en todos los planes de NivaDesk, también en Free. Precios en libras esterlinas (GBP).",
  pricingTrial: "Todos los planes de pago pueden empezar con una prueba gratuita de 14 días, sin tarjeta.",
  planFree: "Free",
  perMonth: "al mes",
  perYear: "al año",
  planFreeNote: "10 pedidos activos (entregados y eliminados no cuentan) · clientes ilimitados · 1 usuario",
  planStarterNote: "Pedidos y clientes ilimitados · 250 MB de almacenamiento · 1 usuario",
  planProNote: "Todo lo de Starter, más finanzas avanzadas, Client Files y feed bancario · 10 GB de almacenamiento · 1 usuario",
  planTeamNote: "Todo lo de Pro, más acceso de equipo con 5 plazas incluidas (hasta 10) · 50 GB de almacenamiento",
  extraSeat: "Plaza adicional de Team: £5 al mes o £50 al año.",
  includesAmazon: "Conexión con Amazon incluida",
  pricingLink: "Ver todos los detalles de los planes",
  dataTitle: "Datos y seguridad",
  data: [
    ["Qué lee NivaDesk", "Solo datos de pedidos: detalles de pedidos y artículos, importes, estados y fechas, además de la lista de marketplaces en los que vende tu cuenta. No se solicitan datos de compradores ni destinatarios."],
    ["Dónde se guardan", "Los datos de Amazon se tratan en un proyecto de Google Cloud independiente, usado solo para la conexión con Amazon, en Londres (europe-west2). Tu autorización de Amazon se guarda en Google Secret Manager."],
    ["Cómo se protegen", "Las conexiones usan HTTPS (TLS) y Google Cloud cifra los datos almacenados en reposo. El servicio de Amazon solo puede llamar a los endpoints de Amazon y al endpoint de importación de NivaDesk, y a tu espacio solo pasan los campos de una lista permitida fija."],
    ["Quién puede verlos", "Los pedidos importados solo son visibles para los miembros de tu espacio. Los miembros del equipo ven si la conexión funciona, pero no sus detalles."],
    ["Eliminación", "Desconectar elimina la autorización de Amazon guardada. Puedes eliminar los pedidos importados, o toda tu cuenta, en cualquier momento."]
  ],
  legalTitle: "Políticas",
  linkPrivacy: "Política de privacidad",
  linkTerms: "Términos del servicio",
  linkSecurity: "Resumen de seguridad",
  linkSubprocessors: "Subencargados",
  linkDeletion: "Eliminación de la cuenta",
  contactTitle: "Preguntas y soporte",
  contactBody: "Escríbenos por correo electrónico o desde la página de contacto y te responderemos.",
  contactEmailLabel: "Correo electrónico",
  contactPage: "Página de contacto",
  company: "NivaDesk es un producto de EGGCRAFT LIMITED, registrada en Inglaterra y Gales con el número de sociedad 16566512.",
  trademark: "Amazon y Seller Central son marcas comerciales de Amazon.com, Inc. o sus filiales. NivaDesk es un producto independiente y no está afiliado a Amazon ni respaldado por Amazon."
};

const PT: AmazonSellerBaseCopy = {
  eyebrow: "NivaDesk para vendedores da Amazon",
  ctaPricing: "Ver preços",
  statusLabel: "Acesso em análise",
  statusTitle: "Estado atual",
  statusBody: "A aplicação NivaDesk aguarda a aprovação da Amazon e ainda está no estado Draft (rascunho) na Amazon. Até a Amazon a aprovar, os vendedores não conseguem concluir a ligação. Depois de aprovada, o botão Ligar no NivaDesk fica disponível automaticamente; não há nada para instalar.",
  connectTitle: "Como funciona a ligação",
  connectSteps: [
    ["O proprietário do espaço inicia", "No NivaDesk, abra Definições › Integrações › Amazon. Só o proprietário do espaço pode ligar ou desligar a Amazon; os membros da equipa podem ver se a ligação está a funcionar."],
    ["Aprova na Amazon", "O NivaDesk encaminha-o para a página de consentimento da própria Amazon no Seller Central. O NivaDesk nunca vê a sua palavra-passe da Amazon."],
    ["Os pedidos chegam", "O NivaDesk identifica os marketplaces onde a sua conta vende e começa a trazer os seus pedidos."]
  ],
  connectDisconnect: "Pode desligar a qualquer momento no mesmo ecrã: a sincronização para e a autorização da Amazon guardada é eliminada. Os pedidos já importados ficam no seu espaço.",
  connectAppstore: "A ligação é iniciada no NivaDesk. Se chegar a partir da Amazon Appstore, inicie sessão ou crie um espaço gratuito e depois ligue em Definições › Integrações.",
  marketsTitle: "Marketplaces da Amazon",
  regionEurope: "Região Europa",
  marketsSignInLive: "Início de sessão através do Seller Central Europe",
  pricingTitle: "Preços",
  pricingIntro: "A ligação Amazon não tem preço separado nem está limitada a um plano: está incluída em todos os planos NivaDesk, incluindo o Free. Preços em libras esterlinas (GBP).",
  pricingTrial: "Todos os planos pagos podem começar com uma avaliação gratuita de 14 dias, sem cartão.",
  planFree: "Free",
  perMonth: "por mês",
  perYear: "por ano",
  planFreeNote: "10 encomendas ativas (entregues e eliminadas não contam) · clientes ilimitados · 1 utilizador",
  planStarterNote: "Pedidos e clientes ilimitados · 250 MB de armazenamento · 1 utilizador",
  planProNote: "Tudo do Starter, mais finanças avançadas, Client Files e feed bancário · 10 GB de armazenamento · 1 utilizador",
  planTeamNote: "Tudo do Pro, mais acesso de equipa com 5 lugares incluídos (até 10) · 50 GB de armazenamento",
  extraSeat: "Lugar Team adicional: £5 por mês ou £50 por ano.",
  includesAmazon: "Ligação Amazon incluída",
  pricingLink: "Ver todos os detalhes dos planos",
  dataTitle: "Dados e segurança",
  data: [
    ["O que o NivaDesk lê", "Apenas dados de pedidos: detalhes de pedidos e artigos, valores, estados e datas, mais a lista de marketplaces onde a sua conta vende. Não são pedidos dados de compradores nem de destinatários."],
    ["Onde são guardados", "Os dados da Amazon são tratados num projeto Google Cloud separado, usado apenas para a ligação Amazon, em Londres (europe-west2). A sua autorização da Amazon é guardada no Google Secret Manager."],
    ["Como são protegidos", "As ligações usam HTTPS (TLS) e o Google Cloud encripta os dados armazenados em repouso. O serviço Amazon só pode chamar os endpoints da própria Amazon e o endpoint de importação do NivaDesk, e só os campos de uma lista permitida fixa passam para o seu espaço."],
    ["Quem pode ver", "Os pedidos importados só são visíveis para os membros do seu espaço. Os membros da equipa veem se a ligação está a funcionar, mas não os seus detalhes."],
    ["Eliminação", "Desligar elimina a autorização da Amazon guardada. Pode eliminar os pedidos importados, ou toda a sua conta, a qualquer momento."]
  ],
  legalTitle: "Políticas",
  linkPrivacy: "Política de Privacidade",
  linkTerms: "Termos de Serviço",
  linkSecurity: "Resumo de segurança",
  linkSubprocessors: "Subcontratantes",
  linkDeletion: "Eliminação de conta",
  contactTitle: "Perguntas e suporte",
  contactBody: "Escreva-nos por e-mail ou através da página de contacto e responderemos.",
  contactEmailLabel: "E-mail",
  contactPage: "Página de contacto",
  company: "O NivaDesk é desenvolvido pela EGGCRAFT LIMITED, registada em Inglaterra e no País de Gales, com o número de empresa 16566512.",
  trademark: "Amazon e Seller Central são marcas comerciais da Amazon.com, Inc. ou das suas afiliadas. O NivaDesk é um produto independente e não é afiliado nem endossado pela Amazon."
};

const RU: AmazonSellerBaseCopy = {
  eyebrow: "NivaDesk для продавцов Amazon",
  ctaPricing: "Посмотреть цены",
  statusLabel: "Доступ на проверке",
  statusTitle: "Текущий статус",
  statusBody: "Приложение NivaDesk ожидает одобрения Amazon и пока находится в статусе Draft (черновик). Пока Amazon его не одобрит, продавцы не могут завершить подключение. После одобрения кнопка «Подключить» в NivaDesk станет доступна сама; ничего устанавливать не нужно.",
  connectTitle: "Как работает подключение",
  connectSteps: [
    ["Начинает владелец пространства", "В NivaDesk откройте Настройки › Интеграции › Amazon. Подключать и отключать Amazon может только владелец рабочего пространства; участники команды видят, работает ли подключение."],
    ["Вы подтверждаете в Amazon", "NivaDesk направляет вас на страницу согласия самого Amazon в Seller Central. NivaDesk никогда не видит ваш пароль Amazon."],
    ["Заказы поступают", "NivaDesk определяет маркетплейсы, на которых продаёт ваш аккаунт, и начинает загружать заказы."]
  ],
  connectDisconnect: "Отключиться можно в любой момент на том же экране: синхронизация останавливается, а сохранённая авторизация Amazon удаляется. Уже импортированные заказы остаются в вашем пространстве.",
  connectAppstore: "Подключение начинается в NivaDesk. Если вы пришли из Amazon Appstore, войдите или создайте бесплатное пространство, затем подключитесь в разделе Настройки › Интеграции.",
  marketsTitle: "Маркетплейсы Amazon",
  regionEurope: "Регион «Европа»",
  marketsSignInLive: "Вход через Seller Central Europe",
  pricingTitle: "Цены",
  pricingIntro: "Подключение к Amazon не оплачивается отдельно и не привязано к тарифу: оно входит во все тарифы NivaDesk, включая Free. Цены указаны в фунтах стерлингов (GBP).",
  pricingTrial: "Любой платный тариф можно начать с 14-дневного бесплатного пробного периода без карты.",
  planFree: "Free",
  perMonth: "в месяц",
  perYear: "в год",
  planFreeNote: "10 активных заказов (доставленные и удалённые не учитываются) · неограниченно клиентов · 1 пользователь",
  planStarterNote: "Неограниченные заказы и клиенты · 250 МБ хранилища · 1 пользователь",
  planProNote: "Всё из Starter, а также расширенные финансы, Client Files и банковская лента · 10 ГБ хранилища · 1 пользователь",
  planTeamNote: "Всё из Pro, а также командный доступ с 5 местами (до 10) · 50 ГБ хранилища",
  extraSeat: "Дополнительное место в Team: £5 в месяц или £50 в год.",
  includesAmazon: "Подключение к Amazon включено",
  pricingLink: "Подробнее о тарифах",
  dataTitle: "Данные и безопасность",
  data: [
    ["Что считывает NivaDesk", "Только данные заказов: сведения о заказах и товарах, суммы, статусы и даты, а также список маркетплейсов, где продаёт ваш аккаунт. Данные покупателей и получателей не запрашиваются."],
    ["Где они хранятся", "Данные Amazon обрабатываются в отдельном проекте Google Cloud, который используется только для подключения к Amazon, в Лондоне (europe-west2). Ваша авторизация Amazon хранится в Google Secret Manager."],
    ["Как они защищены", "Соединения используют HTTPS (TLS), а Google Cloud шифрует хранимые данные. Сервис Amazon может обращаться только к конечным точкам самого Amazon и к точке импорта NivaDesk, а в ваше пространство попадают только поля из фиксированного разрешённого списка."],
    ["Кто их видит", "Импортированные заказы видны только участникам вашего пространства. Участники команды видят, работает ли подключение, но не его подробности."],
    ["Удаление", "Отключение удаляет сохранённую авторизацию Amazon. Импортированные заказы или весь аккаунт можно удалить в любое время."]
  ],
  legalTitle: "Документы",
  linkPrivacy: "Политика конфиденциальности",
  linkTerms: "Условия использования",
  linkSecurity: "Обзор безопасности",
  linkSubprocessors: "Субобработчики",
  linkDeletion: "Удаление аккаунта",
  contactTitle: "Вопросы и поддержка",
  contactBody: "Напишите нам по электронной почте или через страницу контактов — мы ответим.",
  contactEmailLabel: "Эл. почта",
  contactPage: "Страница контактов",
  company: "NivaDesk создан компанией EGGCRAFT LIMITED, зарегистрированной в Англии и Уэльсе под номером 16566512.",
  trademark: "Amazon и Seller Central — товарные знаки Amazon.com, Inc. или её аффилированных лиц. NivaDesk — независимый продукт, не связанный с Amazon и не одобренный Amazon."
};

const JA: AmazonSellerBaseCopy = {
  eyebrow: "Amazon セラー向け NivaDesk",
  ctaPricing: "料金を見る",
  statusLabel: "アクセス審査中",
  statusTitle: "現在の状況",
  statusBody: "NivaDesk アプリは Amazon の承認待ちで、Amazon 上ではまだ Draft（下書き）状態です。Amazon が承認するまで、セラーは連携を完了できません。承認されると、NivaDesk の「接続」ボタンが自動的に使えるようになります。インストールは不要です。",
  connectTitle: "連携の仕組み",
  connectSteps: [
    ["ワークスペースのオーナーが開始", "NivaDesk で 設定 › 連携 › Amazon を開きます。Amazon の接続・切断ができるのはワークスペースのオーナーだけです。チームメンバーは連携が動作しているかを確認できます。"],
    ["Amazon で承認", "NivaDesk が Seller Central にある Amazon 自身の同意ページへご案内します。NivaDesk が Amazon のパスワードを見ることはありません。"],
    ["注文が届く", "NivaDesk がアカウントの販売先マーケットプレイスを検出し、注文の取り込みを始めます。"]
  ],
  connectDisconnect: "同じ画面からいつでも切断できます。同期が止まり、保存されている Amazon の認可は削除されます。取り込み済みの注文はワークスペースに残ります。",
  connectAppstore: "連携は NivaDesk から開始します。Amazon Appstore から来た場合は、ログインするか無料のワークスペースを作成し、設定 › 連携 から接続してください。",
  marketsTitle: "Amazon マーケットプレイス",
  regionEurope: "ヨーロッパ リージョン",
  marketsSignInLive: "Seller Central Europe 経由でサインイン",
  pricingTitle: "料金",
  pricingIntro: "Amazon 連携に別料金はなく、プランによる制限もありません。Free を含むすべての NivaDesk プランに含まれています。料金は英ポンド（GBP）です。",
  pricingTrial: "すべての有料プランは、カード不要の 14 日間無料トライアルから始められます。",
  planFree: "Free",
  perMonth: "月額",
  perYear: "年額",
  planFreeNote: "進行中の注文 10 件（納品済み・削除済みは数えません）・顧客数無制限・ユーザー 1 名",
  planStarterNote: "注文・顧客無制限 · ストレージ 250 MB · ユーザー 1 名",
  planProNote: "Starter のすべてに加え、高度な財務機能、Client Files、銀行フィード · ストレージ 10 GB · ユーザー 1 名",
  planTeamNote: "Pro のすべてに加え、5 席込みのチームアクセス（最大 10 席） · ストレージ 50 GB",
  extraSeat: "Team の追加席：月額 £5 または年額 £50。",
  includesAmazon: "Amazon 連携を含む",
  pricingLink: "プランの詳細を見る",
  dataTitle: "データとセキュリティ",
  data: [
    ["NivaDesk が読み取るもの", "注文データのみ：注文と商品の詳細、金額、ステータス、日付、そしてアカウントが販売しているマーケットプレイスの一覧です。購入者・受取人データは要求しません。"],
    ["保管場所", "Amazon のデータは、Amazon 連携専用の独立した Google Cloud プロジェクト内、ロンドン（europe-west2）で処理されます。Amazon の認可は Google Secret Manager に保管されます。"],
    ["保護の方法", "通信には HTTPS（TLS）を使用し、保存データは Google Cloud によって暗号化されます。Amazon サービスが呼び出せるのは Amazon 自身のエンドポイントと NivaDesk の取り込みエンドポイントだけで、ワークスペースに渡るのは固定の許可リストにある項目のみです。"],
    ["閲覧できる人", "取り込んだ注文は、ワークスペースのメンバーだけが閲覧できます。チームメンバーは連携が動作しているかを確認できますが、詳細は見られません。"],
    ["削除", "切断すると、保存されている Amazon の認可が削除されます。取り込んだ注文やアカウント全体はいつでも削除できます。"]
  ],
  legalTitle: "ポリシー",
  linkPrivacy: "プライバシーポリシー",
  linkTerms: "利用規約",
  linkSecurity: "セキュリティの概要",
  linkSubprocessors: "サブプロセッサー",
  linkDeletion: "アカウントの削除",
  contactTitle: "ご質問とサポート",
  contactBody: "メールまたはお問い合わせページからご連絡ください。お返事いたします。",
  contactEmailLabel: "メール",
  contactPage: "お問い合わせページ",
  company: "NivaDesk は、イングランドおよびウェールズで登録された EGGCRAFT LIMITED（会社番号 16566512）が提供しています。",
  trademark: "Amazon および Seller Central は、Amazon.com, Inc. またはその関連会社の商標です。NivaDesk は独立した製品であり、Amazon と提携しておらず、Amazon による推奨を受けていません。"
};

const ZH: AmazonSellerBaseCopy = {
  eyebrow: "面向 Amazon 卖家的 NivaDesk",
  ctaPricing: "查看价格",
  statusLabel: "访问权限审核中",
  statusTitle: "当前状态",
  statusBody: "NivaDesk 应用正在等待 Amazon 批准，目前在 Amazon 仍处于 Draft（草稿）状态。在 Amazon 批准之前，卖家无法完成连接。批准后，NivaDesk 中的“连接”按钮会自动可用，无需安装任何内容。",
  connectTitle: "如何连接",
  connectSteps: [
    ["由工作区所有者发起", "在 NivaDesk 中打开 设置 › 集成 › Amazon。只有工作区所有者可以连接或断开 Amazon；团队成员可以看到连接是否正常。"],
    ["在 Amazon 上授权", "NivaDesk 会将您带到 Seller Central 中 Amazon 自己的授权页面。NivaDesk 永远看不到您的 Amazon 密码。"],
    ["订单到达", "NivaDesk 会识别您的账户所销售的商城站点，并开始导入您的订单。"]
  ],
  connectDisconnect: "您可以随时在同一页面断开连接：同步会停止，已保存的 Amazon 授权会被删除。已导入的订单仍保留在您的工作区中。",
  connectAppstore: "连接需从 NivaDesk 发起。如果您从 Amazon Appstore 进入，请先登录或创建免费工作区，然后在 设置 › 集成 中连接。",
  marketsTitle: "Amazon 商城站点",
  regionEurope: "欧洲区域",
  marketsSignInLive: "通过 Seller Central Europe 登录",
  pricingTitle: "价格",
  pricingIntro: "Amazon 连接不单独收费，也不限定套餐：所有 NivaDesk 套餐（包括 Free）都包含此功能。价格以英镑（GBP）计。",
  pricingTrial: "每个付费套餐都可以先享受 14 天免费试用，无需绑定银行卡。",
  planFree: "Free",
  perMonth: "每月",
  perYear: "每年",
  planFreeNote: "10 个进行中的订单（已交付和已删除的不计入）· 客户不限 · 1 位用户",
  planStarterNote: "订单和客户不限 · 250 MB 存储 · 1 位用户",
  planProNote: "包含 Starter 全部功能，另有高级财务、Client Files 和银行流水 · 10 GB 存储 · 1 位用户",
  planTeamNote: "包含 Pro 全部功能，另有团队访问，含 5 个席位（最多 10 个） · 50 GB 存储",
  extraSeat: "额外 Team 席位：每月 £5 或每年 £50。",
  includesAmazon: "包含 Amazon 连接",
  pricingLink: "查看完整套餐详情",
  dataTitle: "数据与安全",
  data: [
    ["NivaDesk 读取什么", "仅订单数据：订单和商品详情、金额、状态和日期，以及您的账户所销售的商城站点列表。不请求买家和收件人数据。"],
    ["存放在哪里", "Amazon 数据在一个仅用于 Amazon 连接的独立 Google Cloud 项目中处理，位于伦敦（europe-west2）。您的 Amazon 授权保存在 Google Secret Manager 中。"],
    ["如何保护", "连接使用 HTTPS（TLS），Google Cloud 会对存储的数据进行静态加密。Amazon 服务只能调用 Amazon 自己的端点和 NivaDesk 的导入端点，且只有固定允许列表中的字段会进入您的工作区。"],
    ["谁能看到", "导入的订单仅对您工作区的成员可见。团队成员可以看到连接是否正常，但看不到其详细信息。"],
    ["删除", "断开连接会删除已保存的 Amazon 授权。您可以随时删除导入的订单或整个账户。"]
  ],
  legalTitle: "政策",
  linkPrivacy: "隐私政策",
  linkTerms: "服务条款",
  linkSecurity: "安全概览",
  linkSubprocessors: "子处理者",
  linkDeletion: "删除账户",
  contactTitle: "问题与支持",
  contactBody: "请通过电子邮件或联系页面与我们联系，我们会回复您。",
  contactEmailLabel: "电子邮件",
  contactPage: "联系页面",
  company: "NivaDesk 由 EGGCRAFT LIMITED 开发，该公司在英格兰和威尔士注册，公司编号 16566512。",
  trademark: "Amazon 和 Seller Central 是 Amazon.com, Inc. 或其关联公司的商标。NivaDesk 是独立产品，与 Amazon 无关联，也未获得 Amazon 的认可。"
};

const AR: AmazonSellerBaseCopy = {
  eyebrow: "NivaDesk لبائعي Amazon",
  ctaPricing: "عرض الأسعار",
  statusLabel: "الوصول قيد المراجعة",
  statusTitle: "الحالة الحالية",
  statusBody: "تطبيق NivaDesk بانتظار موافقة Amazon، ولا يزال في حالة Draft (مسودة) لدى Amazon. إلى أن توافق Amazon عليه، لا يستطيع البائعون إكمال الاتصال. وبعد الموافقة يصبح زر «اتصال» في NivaDesk متاحًا تلقائيًا، ولا حاجة إلى تثبيت أي شيء.",
  connectTitle: "كيف يتم الاتصال",
  connectSteps: [
    ["يبدأه مالك مساحة العمل", "في NivaDesk افتح الإعدادات › التكاملات › Amazon. يستطيع مالك مساحة العمل وحده توصيل Amazon أو فصله، ويرى أعضاء الفريق ما إذا كان الاتصال يعمل."],
    ["توافق على Amazon", "ينقلك NivaDesk إلى صفحة الموافقة الخاصة بـ Amazon في Seller Central. لا يرى NivaDesk كلمة مرور Amazon الخاصة بك أبدًا."],
    ["تصل الطلبات", "يتعرّف NivaDesk على المتاجر التي يبيع فيها حسابك ويبدأ في جلب طلباتك."]
  ],
  connectDisconnect: "يمكنك قطع الاتصال في أي وقت من الشاشة نفسها: تتوقف المزامنة ويُحذف تفويض Amazon المحفوظ. تبقى الطلبات المستوردة سابقًا في مساحة عملك.",
  connectAppstore: "يبدأ الاتصال من NivaDesk. إذا وصلت من Amazon Appstore، فسجّل الدخول أو أنشئ مساحة عمل مجانية، ثم اتصل من الإعدادات › التكاملات.",
  marketsTitle: "متاجر Amazon",
  regionEurope: "منطقة أوروبا",
  marketsSignInLive: "تسجيل الدخول عبر Seller Central Europe",
  pricingTitle: "الأسعار",
  pricingIntro: "لا يوجد سعر منفصل لاتصال Amazon وهو غير مقصور على خطة معيّنة: فهو مشمول في كل خطط NivaDesk، بما فيها Free. الأسعار بالجنيه الإسترليني (GBP).",
  pricingTrial: "يمكن بدء كل خطة مدفوعة بتجربة مجانية لمدة 14 يومًا دون الحاجة إلى بطاقة.",
  planFree: "Free",
  perMonth: "شهريًا",
  perYear: "سنويًا",
  planFreeNote: "10 طلبات نشطة (المُسلَّمة والمحذوفة لا تُحتسب) · عملاء بلا حدود · مستخدم واحد",
  planStarterNote: "طلبات وعملاء بلا حدود · مساحة تخزين 250 ميغابايت · مستخدم واحد",
  planProNote: "كل ما في Starter، بالإضافة إلى المالية المتقدمة وClient Files وموجز البنك · مساحة تخزين 10 غيغابايت · مستخدم واحد",
  planTeamNote: "كل ما في Pro، بالإضافة إلى وصول الفريق مع 5 مقاعد مشمولة (حتى 10) · مساحة تخزين 50 غيغابايت",
  extraSeat: "مقعد Team إضافي: ‎£5 شهريًا أو ‎£50 سنويًا.",
  includesAmazon: "اتصال Amazon مشمول",
  pricingLink: "عرض تفاصيل الخطط كاملة",
  dataTitle: "البيانات والأمان",
  data: [
    ["ما الذي يقرؤه NivaDesk", "بيانات الطلبات فقط: تفاصيل الطلبات والمنتجات، والمبالغ، والحالات، والتواريخ، بالإضافة إلى قائمة المتاجر التي يبيع فيها حسابك. لا تُطلب بيانات المشترين أو المستلمين."],
    ["أين تُحفظ", "تُعالَج بيانات Amazon في مشروع Google Cloud منفصل مخصّص لاتصال Amazon فقط، في لندن (europe-west2). ويُحفظ تفويض Amazon الخاص بك في Google Secret Manager."],
    ["كيف تُحمى", "تستخدم الاتصالات بروتوكول HTTPS (TLS)، وتشفّر Google Cloud البيانات المخزّنة. لا تستطيع خدمة Amazon الاتصال إلا بنقاط Amazon نفسها ونقطة الاستيراد في NivaDesk، ولا يصل إلى مساحة عملك إلا الحقول الموجودة في قائمة سماح ثابتة."],
    ["من يمكنه رؤيتها", "الطلبات المستوردة مرئية لأعضاء مساحة عملك فقط. يرى أعضاء الفريق ما إذا كان الاتصال يعمل، دون تفاصيله."],
    ["الحذف", "يؤدي قطع الاتصال إلى حذف تفويض Amazon المحفوظ. ويمكنك حذف الطلبات المستوردة أو حسابك بالكامل في أي وقت."]
  ],
  legalTitle: "السياسات",
  linkPrivacy: "سياسة الخصوصية",
  linkTerms: "شروط الخدمة",
  linkSecurity: "نظرة عامة على الأمان",
  linkSubprocessors: "المعالجون الفرعيون",
  linkDeletion: "حذف الحساب",
  contactTitle: "الأسئلة والدعم",
  contactBody: "راسلنا عبر البريد الإلكتروني أو من خلال صفحة التواصل، وسنرد عليك.",
  contactEmailLabel: "البريد الإلكتروني",
  contactPage: "صفحة التواصل",
  company: "يُطوَّر NivaDesk بواسطة EGGCRAFT LIMITED، المسجّلة في إنجلترا وويلز برقم الشركة 16566512.",
  trademark: "Amazon وSeller Central علامتان تجاريتان لشركة Amazon.com, Inc. أو الشركات التابعة لها. NivaDesk منتج مستقل وغير تابع لـ Amazon ولا يحظى بتأييدها."
};

const HI: AmazonSellerBaseCopy = {
  eyebrow: "Amazon विक्रेताओं के लिए NivaDesk",
  ctaPricing: "कीमतें देखें",
  statusLabel: "एक्सेस की समीक्षा जारी",
  statusTitle: "मौजूदा स्थिति",
  statusBody: "NivaDesk ऐप Amazon की स्वीकृति का इंतज़ार कर रहा है और Amazon पर अभी Draft (ड्राफ़्ट) स्थिति में है। जब तक Amazon इसे स्वीकृत नहीं करता, विक्रेता कनेक्शन पूरा नहीं कर सकते। स्वीकृति मिलते ही NivaDesk में Connect बटन अपने-आप उपलब्ध हो जाएगा; कुछ भी इंस्टॉल नहीं करना है।",
  connectTitle: "कनेक्ट कैसे करें",
  connectSteps: [
    ["वर्कस्पेस का मालिक शुरू करता है", "NivaDesk में Settings › Integrations › Amazon खोलें। केवल वर्कस्पेस का मालिक Amazon को कनेक्ट या डिस्कनेक्ट कर सकता है; टीम के सदस्य देख सकते हैं कि कनेक्शन काम कर रहा है या नहीं।"],
    ["आप Amazon पर स्वीकृति देते हैं", "NivaDesk आपको Seller Central में Amazon के अपने सहमति पेज पर भेजता है। NivaDesk आपका Amazon पासवर्ड कभी नहीं देखता।"],
    ["ऑर्डर आने लगते हैं", "NivaDesk पता लगाता है कि आपका खाता किन मार्केटप्लेस में बेचता है और आपके ऑर्डर लाना शुरू करता है।"]
  ],
  connectDisconnect: "आप उसी स्क्रीन से कभी भी डिस्कनेक्ट कर सकते हैं: सिंक रुक जाता है और सहेजा गया Amazon प्राधिकरण हटा दिया जाता है। पहले से इम्पोर्ट हुए ऑर्डर आपके वर्कस्पेस में बने रहते हैं।",
  connectAppstore: "कनेक्शन NivaDesk से शुरू होता है। अगर आप Amazon Appstore से आए हैं, तो साइन इन करें या मुफ़्त वर्कस्पेस बनाएँ, फिर Settings › Integrations से कनेक्ट करें।",
  marketsTitle: "Amazon मार्केटप्लेस",
  regionEurope: "यूरोप क्षेत्र",
  marketsSignInLive: "Seller Central Europe से साइन इन",
  pricingTitle: "कीमतें",
  pricingIntro: "Amazon कनेक्शन की कोई अलग कीमत नहीं है और यह किसी प्लान तक सीमित नहीं है: यह Free सहित हर NivaDesk प्लान में शामिल है। कीमतें ब्रिटिश पाउंड (GBP) में हैं।",
  pricingTrial: "हर पेड प्लान बिना कार्ड के 14 दिन के मुफ़्त ट्रायल से शुरू हो सकता है।",
  planFree: "Free",
  perMonth: "प्रति माह",
  perYear: "प्रति वर्ष",
  planFreeNote: "10 सक्रिय ऑर्डर (डिलीवर और डिलीट किए गए नहीं गिने जाते) · असीमित ग्राहक · 1 उपयोगकर्ता",
  planStarterNote: "असीमित ऑर्डर और ग्राहक · 250 MB स्टोरेज · 1 उपयोगकर्ता",
  planProNote: "Starter की हर सुविधा, साथ में एडवांस्ड फ़ाइनेंस, Client Files और बैंक फ़ीड · 10 GB स्टोरेज · 1 उपयोगकर्ता",
  planTeamNote: "Pro की हर सुविधा, साथ में 5 सीटों वाला टीम एक्सेस (10 तक) · 50 GB स्टोरेज",
  extraSeat: "अतिरिक्त Team सीट: £5 प्रति माह या £50 प्रति वर्ष।",
  includesAmazon: "Amazon कनेक्शन शामिल",
  pricingLink: "प्लान का पूरा विवरण देखें",
  dataTitle: "डेटा और सुरक्षा",
  data: [
    ["NivaDesk क्या पढ़ता है", "केवल ऑर्डर डेटा: ऑर्डर और आइटम का विवरण, राशियाँ, स्थितियाँ और तारीखें, साथ में उन मार्केटप्लेस की सूची जहाँ आपका खाता बेचता है। खरीदार और प्राप्तकर्ता का डेटा नहीं माँगा जाता।"],
    ["यह कहाँ रखा जाता है", "Amazon डेटा एक अलग Google Cloud प्रोजेक्ट में संसाधित होता है, जो केवल Amazon कनेक्शन के लिए है और लंदन (europe-west2) में है। आपका Amazon प्राधिकरण Google Secret Manager में रखा जाता है।"],
    ["इसकी सुरक्षा कैसे होती है", "कनेक्शन HTTPS (TLS) का उपयोग करते हैं, और Google Cloud संग्रहीत डेटा को एन्क्रिप्ट करता है। Amazon सेवा केवल Amazon के अपने एंडपॉइंट और NivaDesk के इम्पोर्ट एंडपॉइंट को कॉल कर सकती है, और आपके वर्कस्पेस में केवल एक तय अनुमत सूची के फ़ील्ड पहुँचते हैं।"],
    ["इसे कौन देख सकता है", "इम्पोर्ट किए गए ऑर्डर केवल आपके वर्कस्पेस के सदस्यों को दिखते हैं। टीम के सदस्य देख सकते हैं कि कनेक्शन काम कर रहा है, पर उसका विवरण नहीं।"],
    ["हटाना", "डिस्कनेक्ट करने से सहेजा गया Amazon प्राधिकरण हट जाता है। आप इम्पोर्ट किए गए ऑर्डर या अपना पूरा खाता कभी भी हटा सकते हैं।"]
  ],
  legalTitle: "नीतियाँ",
  linkPrivacy: "गोपनीयता नीति",
  linkTerms: "सेवा की शर्तें",
  linkSecurity: "सुरक्षा का सारांश",
  linkSubprocessors: "सब-प्रोसेसर",
  linkDeletion: "खाता हटाना",
  contactTitle: "सवाल और सहायता",
  contactBody: "हमें ईमेल से या संपर्क पेज के ज़रिए लिखें, हम जवाब देंगे।",
  contactEmailLabel: "ईमेल",
  contactPage: "संपर्क पेज",
  company: "NivaDesk को EGGCRAFT LIMITED ने बनाया है, जो इंग्लैंड और वेल्स में कंपनी नंबर 16566512 के साथ पंजीकृत है।",
  trademark: "Amazon और Seller Central, Amazon.com, Inc. या उसकी सहयोगी कंपनियों के ट्रेडमार्क हैं। NivaDesk एक स्वतंत्र उत्पाद है और Amazon से संबद्ध या Amazon द्वारा समर्थित नहीं है।"
};

export type AmazonSellerCopy = AmazonSellerBaseCopy & AmazonSellerPageCopy;

const BASE: Record<StudioLanguage, AmazonSellerBaseCopy> = {
  English: EN,
  Türkçe: TR,
  Deutsch: DE,
  Français: FR,
  Italiano: IT,
  "Español (Spanish)": ES,
  Português: PT,
  "Русский (Russian)": RU,
  "日本語 (Japanese)": JA,
  "中文 (Chinese)": ZH,
  "العربية (Arabic)": AR,
  "हिन्दी (Hindi)": HI
};

export const AMAZON_SELLER_COPY = Object.fromEntries(
  (Object.keys(BASE) as StudioLanguage[]).map(language => [language, { ...BASE[language], ...AMAZON_SELLER_PAGE_COPY[language] }])
) as Record<StudioLanguage, AmazonSellerCopy>;

/**
 * The marketplaces one connection can serve today: the Europe-region rows of
 * the connector's table (functions-amazon/src/amazon/marketplaces.js
 * AMAZON_MARKETPLACES, region "eu" — Turkey added 18 September 2026). The
 * zone signs in through sellercentral-europe.amazon.com and reads the Europe
 * endpoint (SP_API_REGION=eu), so the North America and Far East rows of that
 * table are not offered here. Country names come from Intl.DisplayNames in the
 * visitor's language; the code is the fallback.
 */
export const AMAZON_SELLER_MARKETPLACES_EU: readonly string[] = ["GB", "DE", "FR", "IT", "ES", "NL", "SE", "PL", "TR", "AE", "IN"];
