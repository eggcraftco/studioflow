import type { StudioLanguage } from "@/lib/studioflow/language";
import type { LocalizedPublicPage } from "@/lib/publicSite/locales";

export type PublicSeoText = { title: string; description: string };

// The <title> and meta description of every language version (/de/pricing, /hi/faq, …). English stays in
// metadata.ts and the integration pages' own metadata, where it already ranks.
//
// Written to stay true on both sides of the ÜYE-01 membership change (new workspaces start with a 14-day trial
// instead of Free): no line here promises a Free plan. Typed as a full table, so a page added to
// LOCALIZED_PUBLIC_PAGE_PATHS (locales.ts) without its eleven translations does not compile, and
// `npm run test:multilingual-seo` checks that no cell is empty or still English. When an English title or description changes, change its
// eleven cells here in the same commit.
export const PUBLIC_SEO_COPY: Record<Exclude<StudioLanguage, "English">, Record<LocalizedPublicPage, PublicSeoText>> = {
  Türkçe: {
    home: {
      title: "NivaDesk | Özel Sipariş, Onarım ve Müşteri Yönetimi Yazılımı",
      description: "Özel sipariş, onarım ve servis işletmeleri için sipariş yönetimi: siparişler, müşteriler, takvim, stok ve e-imzalı teklifler tek çalışma alanında. Web, Mac, iPhone ve Android."
    },
    features: {
      title: "NivaDesk Özellikleri | Siparişler, Müşteriler, Takvim ve Dosyalar",
      description: "NivaDesk siparişleri, onarımları, müşterileri, takvimi, stoku, teklifleri, müşteri dosyalarını, banka hazırlığını ve ekip rollerini tek çalışma alanında nasıl yönetir, görün."
    },
    pricing: {
      title: "NivaDesk Fiyatları | Starter, Pro ve Team Planları",
      description: "NivaDesk Starter, Pro ve Team planlarını karşılaştırın: sipariş limitleri, müşteri dosyası depolama, finans araçları ve ekip koltukları. Aylık ya da yıllık; 14 gün deneme, kart gerekmez."
    },
    chatgpt: {
      title: "ChatGPT için NivaDesk | Stüdyonu Bir Sohbetten Yönet",
      description: "NivaDesk çalışma alanınızı ChatGPT'ye bağlayın: siparişler, notlar, finans ve banka harcamaları hakkında sorun, eski tablolarınızdan sipariş oluşturun, fişleri banka işlemlerine ekleyin. Her planda dahil."
    },
    faq: {
      title: "NivaDesk SSS | Planlar, Özellikler ve Başlangıç",
      description: "NivaDesk hakkında sık sorulan sorular: planlar ve fiyatlar, desteklenen platformlar, online mağaza entegrasyonları, deneme süresi, verilerinizi dışa aktarma ve başlangıç."
    },
    signup: {
      title: "NivaDesk ile Ücretsiz Başlayın | Stüdyo ve Sipariş Yönetimi",
      description: "NivaDesk'i ücretsiz deneyin, kart gerekmez. Stüdyo çalışma alanınızı oluşturun; siparişleri, müşterileri, takvimi ve faturaları dakikalar içinde takip edin. Web, Mac, iPhone ve Android."
    },
    contact: {
      title: "NivaDesk Destek ve İletişim",
      description: "NivaDesk'e nasıl ulaşılır: uygulama içi destek talepleri, hesap yardımı, faturalama soruları, gizlilik talepleri, güvenlik bildirimleri, yanıt süreleri ve şirket iletişim bilgileri."
    },
    security: {
      title: "NivaDesk Güvenlik Özeti",
      description: "NivaDesk'in hesapları, çalışma alanlarını, dosyaları, işletme verilerini, ödemeleri, yedekleri, çevrimdışı verileri ve rolleri nasıl koruduğuna ve güvenlik olaylarını nasıl ele aldığına pratik bir bakış."
    },
    amazon: {
      title: "Amazon Satıcıları için NivaDesk | Özellikler, Fiyat ve Veriler",
      description: "NivaDesk Amazon siparişlerinizi 30 dakikada bir, yalnız okuyarak alır; siparişe özel üretim, el yapımı ve onarım satıcıları işi planlar. Okunan alanlar, senkron, Avrupa pazaryerleri ve fiyatlar."
    },
    shopify: {
      title: "Shopify için NivaDesk | Kurulum Rehberi, Planlar ve İçe Aktarma",
      description: "Shopify için NivaDesk Order Management uygulaması: yalnız okuma erişimi, mağazayı kurma ve bağlama, Shopify'ın ABD doları ile faturaladığı deneme süreli planlar, geçmiş siparişleri içe aktarma ve destek."
    },
    claude: {
      title: "Claude için NivaDesk | Kurulum Rehberi, Araçlar ve İzinler",
      description: "Claude için NivaDesk bağlayıcısı: kendi NivaDesk hesabınızla bağlanma; siparişler, notlar, para, banka harcamaları ve stok araçları; izin ve güvenlik kuralları, verileriniz ve bağlantıyı kesme."
    }
  },
  Deutsch: {
    home: {
      title: "NivaDesk | Software für Auftrags- und Kundenverwaltung",
      description: "NivaDesk ist Auftragsverwaltung für Sonderanfertigungen, Reparaturen und Service: Aufträge, Kunden, Termine, Lager und Angebote mit E-Signatur in einem Workspace – Web, Mac, iPhone, Android."
    },
    features: {
      title: "NivaDesk Funktionen | Aufträge, Kunden, Planung & Dateien",
      description: "So verwaltet NivaDesk Aufträge, Reparaturen, Kunden, Termine, Lager, Angebote, Kundendateien, Bankvorbereitung, Teamrollen und Kundenlinks in einem Workspace – im Web, auf Mac, iPhone und Android."
    },
    pricing: {
      title: "NivaDesk Preise | Starter-, Pro- & Team-Pläne",
      description: "Vergleichen Sie die NivaDesk-Pläne Starter, Pro und Team: Auftragslimits, Speicher für Kundendateien, Finanzfunktionen und Team-Plätze. Monatlich oder jährlich, 14 Tage testen ohne Karte."
    },
    chatgpt: {
      title: "NivaDesk für ChatGPT | Führen Sie Ihr Studio per Chat",
      description: "Verbinden Sie Ihren NivaDesk-Workspace mit ChatGPT: Fragen zu Aufträgen, Notizen, Finanzen und Bankausgaben, Aufträge aus alten Tabellen anlegen, Belege Banktransaktionen zuordnen. In jedem Plan enthalten."
    },
    faq: {
      title: "NivaDesk FAQ | Pläne, Funktionen & erste Schritte",
      description: "Häufige Fragen zu NivaDesk: Pläne und Preise, unterstützte Plattformen, Onlineshop-Integrationen, die Testphase, der Export Ihrer Daten und der Einstieg."
    },
    signup: {
      title: "Kostenlos mit NivaDesk starten | Studio- & Auftragsverwaltung",
      description: "Testen Sie NivaDesk kostenlos, ohne Karte. Erstellen Sie Ihren Studio-Workspace und verwalten Sie Aufträge, Kunden, Termine und Rechnungen in Minuten – im Web, auf Mac, iPhone und Android."
    },
    contact: {
      title: "NivaDesk Support und Kontakt",
      description: "So erreichen Sie NivaDesk: Support-Tickets in der App, Hilfe zum Konto, Fragen zur Abrechnung, Datenschutzanfragen, Sicherheitsmeldungen, Antwortzeiten und Kontaktdaten des Unternehmens."
    },
    security: {
      title: "NivaDesk Sicherheitsübersicht",
      description: "Ein praktischer Überblick, wie NivaDesk Konten, Workspaces, Dateien, Geschäftsdaten, Zahlungen, Backups, Offline-Daten und Rollen schützt und mit Sicherheitsvorfällen umgeht."
    },
    amazon: {
      title: "NivaDesk für Amazon-Verkäufer | Funktionen, Preise & Daten",
      description: "NivaDesk liest Ihre Amazon-Bestellungen alle 30 Minuten nur lesend ein, damit Auftragsfertiger, Handwerker und Reparaturbetriebe die Arbeit planen. Gelesene Felder, Sync, EU-Marktplätze, Preise."
    },
    shopify: {
      title: "NivaDesk für Shopify | Einrichtung, Pläne & Import",
      description: "So funktioniert die NivaDesk Order Management App für Shopify: nur lesender Zugriff, Shop installieren und verbinden, von Shopify in US-Dollar abgerechnete Pläne mit Testphase, Import alter Bestellungen, Support."
    },
    claude: {
      title: "NivaDesk für Claude | Einrichtung, Tools & Berechtigungen",
      description: "So funktioniert der NivaDesk-Connector für Claude: Verbindung mit Ihrem NivaDesk-Konto, Tools für Aufträge, Notizen, Geld, Bankausgaben und Lager, Berechtigungs- und Sicherheitsregeln, Ihre Daten, Trennen."
    }
  },
  Français: {
    home: {
      title: "NivaDesk | Logiciel de gestion des commandes et des clients",
      description: "NivaDesk gère commandes sur mesure, réparations et prestations : commandes, clients, planning, stock et devis avec signature électronique dans un seul espace. Web, Mac, iPhone, Android."
    },
    features: {
      title: "Fonctionnalités NivaDesk | Commandes, clients, planning et fichiers",
      description: "Découvrez comment NivaDesk gère commandes, réparations, clients, planning, stock, devis, fichiers clients, préparation bancaire, rôles d'équipe et liens clients dans un seul espace, sur web, Mac, iPhone et Android."
    },
    pricing: {
      title: "Tarifs NivaDesk | Offres Starter, Pro et Team",
      description: "Comparez les offres NivaDesk Starter, Pro et Team : limites de commandes, stockage des fichiers clients, outils financiers et sièges d'équipe. Mensuel ou annuel, essai de 14 jours sans carte."
    },
    chatgpt: {
      title: "NivaDesk pour ChatGPT | Pilotez votre atelier depuis un chat",
      description: "Connectez votre espace NivaDesk à ChatGPT : questions sur les commandes, notes, finances et dépenses bancaires, commandes créées depuis vos anciens tableurs, reçus rattachés aux opérations bancaires. Inclus dans chaque offre."
    },
    faq: {
      title: "FAQ NivaDesk | Offres, fonctionnalités et premiers pas",
      description: "Questions fréquentes sur NivaDesk : offres et tarifs, plateformes prises en charge, intégrations de boutiques en ligne, période d'essai, export de vos données et prise en main."
    },
    signup: {
      title: "Essayez NivaDesk gratuitement | Gestion des commandes",
      description: "Essayez NivaDesk gratuitement, sans carte. Créez l'espace de votre atelier et suivez commandes, clients, planning et factures en quelques minutes, sur web, Mac, iPhone et Android."
    },
    contact: {
      title: "Support et contact NivaDesk",
      description: "Comment contacter NivaDesk : tickets de support dans l'app, aide au compte, questions de facturation, demandes de confidentialité, signalements de sécurité, délais de réponse et coordonnées de l'entreprise."
    },
    security: {
      title: "Aperçu de la sécurité NivaDesk",
      description: "Un aperçu concret de la façon dont NivaDesk protège comptes, espaces de travail, fichiers, données d'entreprise, paiements, sauvegardes, données hors ligne et rôles, et gère les incidents de sécurité."
    },
    amazon: {
      title: "NivaDesk pour les vendeurs Amazon | Fonctions, tarifs et données",
      description: "NivaDesk importe vos commandes Amazon toutes les 30 minutes, en lecture seule, pour que vendeurs sur mesure, artisans et réparateurs planifient le travail. Champs lus, synchronisation, marketplaces européennes, tarifs."
    },
    shopify: {
      title: "NivaDesk pour Shopify | Installation, offres et import",
      description: "Comment fonctionne l'app NivaDesk Order Management pour Shopify : accès en lecture seule, installation et connexion de la boutique, offres facturées par Shopify en dollars US avec essai, import des anciennes commandes, support."
    },
    claude: {
      title: "NivaDesk pour Claude | Installation, outils et autorisations",
      description: "Comment fonctionne le connecteur NivaDesk pour Claude : connexion avec votre compte NivaDesk, outils pour commandes, notes, finances, dépenses bancaires et stock, règles d'autorisation et de sécurité, vos données, déconnexion."
    }
  },
  Italiano: {
    home: {
      title: "NivaDesk | Software per gestire ordini, riparazioni e clienti",
      description: "NivaDesk è il software per ordini personalizzati, riparazioni e assistenza: ordini, clienti, calendario, magazzino e preventivi con firma elettronica in un unico spazio. Web, Mac, iPhone, Android."
    },
    features: {
      title: "Funzionalità NivaDesk | Ordini, clienti, pianificazione e file",
      description: "Scopri come NivaDesk gestisce ordini, riparazioni, clienti, calendario, magazzino, preventivi, file dei clienti, preparazione bancaria, ruoli del team e link per i clienti in un unico spazio, su web, Mac, iPhone e Android."
    },
    pricing: {
      title: "Prezzi NivaDesk | Piani Starter, Pro e Team",
      description: "Confronta i piani NivaDesk Starter, Pro e Team: limiti di ordini, spazio per i file dei clienti, strumenti finanziari e postazioni del team. Mensile o annuale, prova di 14 giorni senza carta."
    },
    chatgpt: {
      title: "NivaDesk per ChatGPT | Gestisci lo studio da una chat",
      description: "Collega il tuo spazio NivaDesk a ChatGPT: chiedi di ordini, note, finanze e spese bancarie, crea ordini dai vecchi fogli di calcolo e abbina le ricevute ai movimenti bancari. Incluso in ogni piano."
    },
    faq: {
      title: "FAQ NivaDesk | Piani, funzionalità e primi passi",
      description: "Domande frequenti su NivaDesk: piani e prezzi, piattaforme supportate, integrazioni con negozi online, periodo di prova, esportazione dei dati e primi passi."
    },
    signup: {
      title: "Prova NivaDesk gratis | Gestione di studio e ordini",
      description: "Prova NivaDesk gratis, senza carta. Crea lo spazio del tuo studio e inizia a seguire ordini, clienti, calendario e fatture in pochi minuti, su web, Mac, iPhone e Android."
    },
    contact: {
      title: "Supporto e contatti NivaDesk",
      description: "Come contattare NivaDesk: ticket di supporto nell'app, aiuto per l'account, domande sulla fatturazione, richieste sulla privacy, segnalazioni di sicurezza, tempi di risposta e recapiti dell'azienda."
    },
    security: {
      title: "Panoramica sulla sicurezza di NivaDesk",
      description: "Una panoramica pratica di come NivaDesk protegge account, spazi di lavoro, file, dati aziendali, pagamenti, backup, dati offline e ruoli, e di come gestisce gli incidenti di sicurezza."
    },
    amazon: {
      title: "NivaDesk per venditori Amazon | Funzioni, prezzi e dati",
      description: "NivaDesk importa i tuoi ordini Amazon ogni 30 minuti, in sola lettura, così chi produce su ordinazione, crea a mano o ripara può pianificare il lavoro. Campi letti, sincronizzazione, marketplace europei, prezzi."
    },
    shopify: {
      title: "NivaDesk per Shopify | Configurazione, piani e importazione",
      description: "Come funziona l'app NivaDesk Order Management per Shopify: accesso in sola lettura, installazione e collegamento del negozio, piani fatturati da Shopify in dollari USA con prova, importazione degli ordini passati, supporto."
    },
    claude: {
      title: "NivaDesk per Claude | Configurazione, strumenti e permessi",
      description: "Come funziona il connettore NivaDesk per Claude: collegamento con il tuo account NivaDesk, strumenti per ordini, note, denaro, spese bancarie e magazzino, regole di permesso e sicurezza, i tuoi dati, disconnessione."
    }
  },
  "Español (Spanish)": {
    home: {
      title: "NivaDesk | Software de gestión de pedidos, reparaciones y clientes",
      description: "NivaDesk es software para pedidos personalizados, reparaciones y servicios: pedidos, clientes, agenda, inventario y presupuestos con firma electrónica en un solo espacio. Web, Mac, iPhone, Android."
    },
    features: {
      title: "Funciones de NivaDesk | Pedidos, clientes, agenda y archivos",
      description: "Descubre cómo NivaDesk gestiona pedidos, reparaciones, clientes, agenda, inventario, presupuestos, archivos de clientes, preparación bancaria, roles del equipo y enlaces para clientes en un solo espacio, en web, Mac, iPhone y Android."
    },
    pricing: {
      title: "Precios de NivaDesk | Planes Starter, Pro y Team",
      description: "Compara los planes Starter, Pro y Team de NivaDesk: límites de pedidos, almacenamiento de archivos de clientes, herramientas financieras y puestos de equipo. Mensual o anual, prueba de 14 días sin tarjeta."
    },
    chatgpt: {
      title: "NivaDesk para ChatGPT | Lleva tu estudio desde un chat",
      description: "Conecta tu espacio de NivaDesk a ChatGPT: pregunta por pedidos, notas, finanzas y gastos bancarios, crea pedidos desde tus hojas de cálculo antiguas y asocia recibos a movimientos bancarios. Incluido en todos los planes."
    },
    faq: {
      title: "FAQ de NivaDesk | Planes, funciones y primeros pasos",
      description: "Preguntas frecuentes sobre NivaDesk: planes y precios, plataformas compatibles, integraciones con tiendas online, el periodo de prueba, exportar tus datos y primeros pasos."
    },
    signup: {
      title: "Prueba NivaDesk gratis | Gestión de estudio y pedidos",
      description: "Prueba NivaDesk gratis, sin tarjeta. Crea el espacio de tu estudio y empieza a seguir pedidos, clientes, agenda y facturas en minutos, en web, Mac, iPhone y Android."
    },
    contact: {
      title: "Soporte y contacto de NivaDesk",
      description: "Cómo contactar con NivaDesk: tickets de soporte en la app, ayuda con la cuenta, preguntas de facturación, solicitudes de privacidad, avisos de seguridad, tiempos de respuesta y datos de contacto de la empresa."
    },
    security: {
      title: "Resumen de seguridad de NivaDesk",
      description: "Una visión práctica de cómo NivaDesk protege cuentas, espacios de trabajo, archivos, datos del negocio, pagos, copias de seguridad, datos sin conexión y roles, y de cómo gestiona los incidentes de seguridad."
    },
    amazon: {
      title: "NivaDesk para vendedores de Amazon | Funciones, precios y datos",
      description: "NivaDesk lee tus pedidos de Amazon cada 30 minutos, en solo lectura, para que quienes fabrican por encargo, a mano o reparan planifiquen el trabajo. Campos que lee, sincronización, marketplaces europeos, precios."
    },
    shopify: {
      title: "NivaDesk para Shopify | Configuración, planes e importación",
      description: "Cómo funciona la app NivaDesk Order Management para Shopify: acceso de solo lectura, instalar y conectar la tienda, planes facturados por Shopify en dólares estadounidenses con prueba, importar pedidos anteriores y soporte."
    },
    claude: {
      title: "NivaDesk para Claude | Configuración, herramientas y permisos",
      description: "Cómo funciona el conector de NivaDesk para Claude: conexión con tu propia cuenta de NivaDesk, herramientas para pedidos, notas, dinero, gastos bancarios e inventario, reglas de permisos y seguridad, tus datos y la desconexión."
    }
  },
  Português: {
    home: {
      title: "NivaDesk | Software de gestão de pedidos, reparos e clientes",
      description: "NivaDesk é software para pedidos personalizados, reparos e serviços: pedidos, clientes, agenda, estoque e orçamentos com assinatura eletrônica num só espaço. Web, Mac, iPhone, Android."
    },
    features: {
      title: "Recursos do NivaDesk | Pedidos, clientes, agenda e arquivos",
      description: "Veja como o NivaDesk gerencia pedidos, reparos, clientes, agenda, estoque, orçamentos, arquivos de clientes, preparação bancária, funções da equipe e links para clientes num só espaço, na web, Mac, iPhone e Android."
    },
    pricing: {
      title: "Preços do NivaDesk | Planos Starter, Pro e Team",
      description: "Compare os planos Starter, Pro e Team do NivaDesk: limites de pedidos, armazenamento de arquivos de clientes, ferramentas financeiras e lugares de equipe. Mensal ou anual, teste de 14 dias sem cartão."
    },
    chatgpt: {
      title: "NivaDesk para ChatGPT | Gerencie seu estúdio num chat",
      description: "Conecte seu espaço NivaDesk ao ChatGPT: pergunte sobre pedidos, notas, finanças e gastos bancários, crie pedidos a partir de planilhas antigas e associe recibos a transações bancárias. Incluído em todos os planos."
    },
    faq: {
      title: "FAQ do NivaDesk | Planos, recursos e primeiros passos",
      description: "Perguntas frequentes sobre o NivaDesk: planos e preços, plataformas compatíveis, integrações com lojas online, o período de teste, exportar seus dados e primeiros passos."
    },
    signup: {
      title: "Experimente o NivaDesk grátis | Gestão de estúdio e pedidos",
      description: "Experimente o NivaDesk grátis, sem cartão. Crie o espaço do seu estúdio e comece a acompanhar pedidos, clientes, agenda e faturas em minutos, na web, Mac, iPhone e Android."
    },
    contact: {
      title: "Suporte e contato do NivaDesk",
      description: "Como falar com o NivaDesk: tickets de suporte no app, ajuda com a conta, dúvidas de cobrança, pedidos de privacidade, relatos de segurança, prazos de resposta e dados de contato da empresa."
    },
    security: {
      title: "Resumo de segurança do NivaDesk",
      description: "Uma visão prática de como o NivaDesk protege contas, espaços de trabalho, arquivos, dados do negócio, pagamentos, backups, dados offline e funções, e de como trata incidentes de segurança."
    },
    amazon: {
      title: "NivaDesk para vendedores da Amazon | Recursos, preços e dados",
      description: "O NivaDesk lê seus pedidos da Amazon a cada 30 minutos, só leitura, para que quem vende sob encomenda, faz à mão ou conserta planeje o trabalho. Campos lidos, sincronização, marketplaces europeus, preços."
    },
    shopify: {
      title: "NivaDesk para Shopify | Configuração, planos e importação",
      description: "Como funciona o app NivaDesk Order Management para Shopify: acesso só de leitura, instalação e conexão da loja, planos cobrados pela Shopify em dólares com teste, importação de pedidos antigos e suporte."
    },
    claude: {
      title: "NivaDesk para Claude | Configuração, ferramentas e permissões",
      description: "Como funciona o conector do NivaDesk para Claude: conexão com sua conta NivaDesk, ferramentas para pedidos, notas, dinheiro, gastos bancários e estoque, regras de permissão e segurança, seus dados e a desconexão."
    }
  },
  "Русский (Russian)": {
    home: {
      title: "NivaDesk | Программа для учёта заказов, ремонта и клиентов",
      description: "NivaDesk — программа для индивидуальных заказов, ремонта и сервиса: заказы, клиенты, расписание, склад и сметы с электронной подписью в одном пространстве. Веб, Mac, iPhone, Android."
    },
    features: {
      title: "Возможности NivaDesk | Заказы, клиенты, планирование и файлы",
      description: "Как NivaDesk ведёт заказы, ремонт, клиентов, расписание, склад, сметы, файлы клиентов, подготовку банковских данных, роли команды и ссылки для клиентов в одном пространстве — в вебе, на Mac, iPhone и Android."
    },
    pricing: {
      title: "Цены NivaDesk | Тарифы Starter, Pro и Team",
      description: "Сравните тарифы NivaDesk Starter, Pro и Team: лимиты заказов, хранилище файлов клиентов, финансовые инструменты и места в команде. Помесячно или за год, 14 дней пробного периода без карты."
    },
    chatgpt: {
      title: "NivaDesk для ChatGPT | Управляйте студией в чате",
      description: "Подключите пространство NivaDesk к ChatGPT: спрашивайте о заказах, заметках, финансах и банковских расходах, создавайте заказы из старых таблиц и привязывайте чеки к банковским операциям. Входит в каждый тариф."
    },
    faq: {
      title: "Вопросы о NivaDesk | Тарифы, возможности и начало работы",
      description: "Частые вопросы о NivaDesk: тарифы и цены, поддерживаемые платформы, интеграции с интернет-магазинами, пробный период, экспорт данных и начало работы."
    },
    signup: {
      title: "Попробуйте NivaDesk бесплатно | Учёт заказов для студии",
      description: "Попробуйте NivaDesk бесплатно, без карты. Создайте пространство студии и начните вести заказы, клиентов, расписание и счета за несколько минут — в вебе, на Mac, iPhone и Android."
    },
    contact: {
      title: "Поддержка и контакты NivaDesk",
      description: "Как связаться с NivaDesk: обращения в поддержку из приложения, помощь с аккаунтом, вопросы об оплате, запросы о конфиденциальности, сообщения о безопасности, сроки ответа и контакты компании."
    },
    security: {
      title: "Обзор безопасности NivaDesk",
      description: "Практический обзор того, как NivaDesk защищает аккаунты, рабочие пространства, файлы, данные бизнеса, платежи, резервные копии, офлайн-данные и роли и как работает с инцидентами безопасности."
    },
    amazon: {
      title: "NivaDesk для продавцов Amazon | Возможности, цены и данные",
      description: "NivaDesk каждые 30 минут считывает ваши заказы Amazon в режиме только чтения, чтобы мастера на заказ, ремесленники и ремонтные мастерские планировали работу. Какие поля читаются, синхронизация, рынки Европы, цены."
    },
    shopify: {
      title: "NivaDesk для Shopify | Настройка, тарифы и импорт",
      description: "Как работает приложение NivaDesk Order Management для Shopify: доступ только на чтение, установка и подключение магазина, тарифы с оплатой через Shopify в долларах США и пробным периодом, импорт прошлых заказов, поддержка."
    },
    claude: {
      title: "NivaDesk для Claude | Настройка, инструменты и разрешения",
      description: "Как работает коннектор NivaDesk для Claude: подключение через ваш аккаунт NivaDesk, инструменты для заказов, заметок, денег, банковских расходов и склада, правила разрешений и безопасности, ваши данные и отключение."
    }
  },
  "日本語 (Japanese)": {
    home: {
      title: "NivaDesk | 受注・修理・顧客管理ソフトウェア",
      description: "NivaDesk はカスタムオーダー、修理、サービス業務のための受注管理ソフトです。注文、顧客、スケジュール、在庫、電子署名付きの見積をひとつのワークスペースで。Web、Mac、iPhone、Android に対応。"
    },
    features: {
      title: "NivaDesk の機能 | 注文・顧客・スケジュール・ファイル",
      description: "NivaDesk が注文、修理、顧客、スケジュール、在庫、見積、顧客ファイル、銀行データの準備、チームの役割、顧客向けリンクをひとつのワークスペースでどう管理するかをご覧ください。Web、Mac、iPhone、Android に対応。"
    },
    pricing: {
      title: "NivaDesk 料金 | Starter・Pro・Team プラン",
      description: "NivaDesk の Starter、Pro、Team プランを比較：注文数の上限、顧客ファイルの容量、財務機能、チームの席数。月払いまたは年払い、カード不要の14日間トライアル。"
    },
    chatgpt: {
      title: "ChatGPT 向け NivaDesk | 会話でスタジオを動かす",
      description: "NivaDesk のワークスペースを ChatGPT に接続。注文、メモ、財務、銀行の支出について質問し、古いスプレッドシートから注文を作成し、領収書を銀行取引に紐づけられます。すべてのプランに含まれます。"
    },
    faq: {
      title: "NivaDesk よくある質問 | プラン・機能・はじめ方",
      description: "NivaDesk についてのよくある質問：プランと料金、対応プラットフォーム、オンラインストア連携、トライアル、データのエクスポート、はじめ方。"
    },
    signup: {
      title: "NivaDesk を無料で試す | スタジオと注文の管理",
      description: "カード不要で NivaDesk を無料でお試しください。スタジオのワークスペースを作成し、注文、顧客、スケジュール、請求書の管理を数分で始められます。Web、Mac、iPhone、Android に対応。"
    },
    contact: {
      title: "NivaDesk サポートと連絡先",
      description: "NivaDesk への連絡方法：アプリ内のサポートチケット、アカウントのヘルプ、請求に関する質問、プライバシーのリクエスト、セキュリティの報告、回答までの目安、会社の連絡先。"
    },
    security: {
      title: "NivaDesk セキュリティ概要",
      description: "NivaDesk がアカウント、ワークスペース、ファイル、業務データ、支払い、バックアップ、オフラインデータ、役割をどう守り、セキュリティインシデントにどう対応するかの実践的な概要です。"
    },
    amazon: {
      title: "Amazon セラー向け NivaDesk | 機能・料金・データの扱い",
      description: "NivaDesk は Amazon の注文を30分ごとに読み取り専用で取り込み、受注生産、ハンドメイド、修理の販売者が作業を計画できるようにします。読み取る項目、同期、ヨーロッパのマーケットプレイス、料金。"
    },
    shopify: {
      title: "Shopify 向け NivaDesk | 設定ガイド・プラン・インポート",
      description: "Shopify 向け NivaDesk Order Management アプリの仕組み：読み取り専用のアクセス、ストアのインストールと接続、Shopify が米ドルで請求するトライアル付きプラン、過去の注文のインポート、サポート。"
    },
    claude: {
      title: "Claude 向け NivaDesk | 設定ガイド・ツール・権限",
      description: "Claude 向け NivaDesk コネクタの仕組み：ご自身の NivaDesk アカウントでの接続、注文・メモ・お金・銀行の支出・在庫のツール、権限と安全のルール、データの扱い、接続の解除。"
    }
  },
  "中文 (Chinese)": {
    home: {
      title: "NivaDesk | 订单、维修与客户管理软件",
      description: "NivaDesk 是面向定制订单、维修和服务业务的订单管理软件：订单、客户、日程、库存和带电子签名的报价集中在一个工作空间。支持网页、Mac、iPhone 和 Android。"
    },
    features: {
      title: "NivaDesk 功能 | 订单、客户、日程与文件",
      description: "了解 NivaDesk 如何在一个工作空间中管理订单、维修、客户、日程、库存、报价、客户文件、银行数据准备、团队角色和客户链接，支持网页、Mac、iPhone 和 Android。"
    },
    pricing: {
      title: "NivaDesk 价格 | Starter、Pro 和 Team 套餐",
      description: "比较 NivaDesk 的 Starter、Pro 和 Team 套餐：订单上限、客户文件存储、财务工具和团队席位。按月或按年付费，可免费试用 14 天，无需信用卡。"
    },
    chatgpt: {
      title: "ChatGPT 版 NivaDesk | 在对话中经营工作室",
      description: "将 NivaDesk 工作空间连接到 ChatGPT：询问订单、笔记、财务和银行支出，从旧电子表格创建订单，并将收据匹配到银行交易。所有套餐均包含。"
    },
    faq: {
      title: "NivaDesk 常见问题 | 套餐、功能与入门",
      description: "关于 NivaDesk 的常见问题：套餐和价格、支持的平台、网店集成、试用期、导出数据以及如何开始。"
    },
    signup: {
      title: "免费试用 NivaDesk | 工作室与订单管理",
      description: "免费试用 NivaDesk，无需信用卡。创建工作室工作空间，几分钟内开始管理订单、客户、日程和发票，支持网页、Mac、iPhone 和 Android。"
    },
    contact: {
      title: "NivaDesk 支持和联系方式",
      description: "如何联系 NivaDesk：应用内支持工单、账户帮助、账单问题、隐私请求、安全报告、响应时间以及公司联系方式。"
    },
    security: {
      title: "NivaDesk 安全概览",
      description: "实用概览：NivaDesk 如何保护账户、工作空间、文件、业务数据、付款、备份、离线数据和角色，以及如何处理安全事件。"
    },
    amazon: {
      title: "面向 Amazon 卖家的 NivaDesk | 功能、价格与数据处理",
      description: "NivaDesk 每 30 分钟以只读方式读取你的 Amazon 订单，帮助定制、手工和维修卖家安排工作。包括读取的字段、同步方式、欧洲站点和价格。"
    },
    shopify: {
      title: "Shopify 版 NivaDesk | 设置指南、套餐与导入",
      description: "Shopify 版 NivaDesk Order Management 应用如何运作：只读访问、安装并连接店铺、由 Shopify 以美元计费并含试用期的套餐、导入历史订单以及支持。"
    },
    claude: {
      title: "Claude 版 NivaDesk | 设置指南、工具与权限",
      description: "Claude 版 NivaDesk 连接器如何运作：使用你自己的 NivaDesk 账户连接，订单、笔记、资金、银行支出和库存工具，权限与安全规则，你的数据以及如何断开连接。"
    }
  },
  "العربية (Arabic)": {
    home: {
      title: "NivaDesk | برنامج لإدارة الطلبات والإصلاحات والعملاء",
      description: "NivaDesk برنامج لإدارة الطلبات المخصصة والإصلاحات وأعمال الصيانة: الطلبات والعملاء والمواعيد والمخزون وعروض الأسعار بتوقيع إلكتروني في مساحة عمل واحدة. على الويب وMac وiPhone وAndroid."
    },
    features: {
      title: "ميزات NivaDesk | الطلبات والعملاء والجدولة والملفات",
      description: "تعرّف على كيف يدير NivaDesk الطلبات والإصلاحات والعملاء والمواعيد والمخزون وعروض الأسعار وملفات العملاء وتجهيز بيانات البنك وأدوار الفريق وروابط العملاء في مساحة عمل واحدة، على الويب وMac وiPhone وAndroid."
    },
    pricing: {
      title: "أسعار NivaDesk | خطط Starter وPro وTeam",
      description: "قارن خطط Starter وPro وTeam من NivaDesk: حدود الطلبات وتخزين ملفات العملاء والأدوات المالية ومقاعد الفريق. دفع شهري أو سنوي، وتجربة لمدة 14 يومًا دون بطاقة."
    },
    chatgpt: {
      title: "NivaDesk لـ ChatGPT | أدِر استوديوك من محادثة",
      description: "اربط مساحة عمل NivaDesk بـ ChatGPT: اسأل عن الطلبات والملاحظات والمالية والإنفاق البنكي، وأنشئ طلبات من جداولك القديمة، واربط الإيصالات بالمعاملات البنكية. متاح في كل خطة."
    },
    faq: {
      title: "الأسئلة الشائعة عن NivaDesk | الخطط والميزات والبدء",
      description: "أسئلة شائعة عن NivaDesk: الخطط والأسعار، والمنصات المدعومة، وتكامل المتاجر الإلكترونية، وفترة التجربة، وتصدير بياناتك، وكيفية البدء."
    },
    signup: {
      title: "جرّب NivaDesk مجانًا | إدارة الاستوديو والطلبات",
      description: "جرّب NivaDesk مجانًا ودون بطاقة. أنشئ مساحة عمل الاستوديو وابدأ بمتابعة الطلبات والعملاء والمواعيد والفواتير خلال دقائق، على الويب وMac وiPhone وAndroid."
    },
    contact: {
      title: "دعم NivaDesk والتواصل",
      description: "كيفية التواصل مع NivaDesk: تذاكر الدعم داخل التطبيق، والمساعدة في الحساب، وأسئلة الفوترة، وطلبات الخصوصية، والإبلاغ عن مشكلات الأمان، وأوقات الرد، وبيانات الاتصال بالشركة."
    },
    security: {
      title: "نظرة عامة على أمان NivaDesk",
      description: "نظرة عملية على كيف يحمي NivaDesk الحسابات ومساحات العمل والملفات وبيانات النشاط التجاري والمدفوعات والنسخ الاحتياطية والبيانات دون اتصال والأدوار، وكيف يتعامل مع الحوادث الأمنية."
    },
    amazon: {
      title: "NivaDesk لبائعي Amazon | الميزات والأسعار والبيانات",
      description: "يقرأ NivaDesk طلباتك على Amazon كل 30 دقيقة للقراءة فقط، ليخطط بائعو المنتجات حسب الطلب والمصنوعات اليدوية والإصلاح لعملهم. الحقول المقروءة، والمزامنة، وأسواق أوروبا، والأسعار."
    },
    shopify: {
      title: "NivaDesk لـ Shopify | دليل الإعداد والخطط والاستيراد",
      description: "كيف يعمل تطبيق NivaDesk Order Management لـ Shopify: وصول للقراءة فقط، وتثبيت المتجر وربطه، وخطط تفوترها Shopify بالدولار الأمريكي مع فترة تجربة، واستيراد الطلبات السابقة، والدعم."
    },
    claude: {
      title: "NivaDesk لـ Claude | دليل الإعداد والأدوات والأذونات",
      description: "كيف يعمل موصل NivaDesk لـ Claude: الاتصال بحساب NivaDesk الخاص بك، وأدوات الطلبات والملاحظات والأموال والإنفاق البنكي والمخزون، وقواعد الأذونات والأمان، وبياناتك، وقطع الاتصال."
    }
  },
  "हिन्दी (Hindi)": {
    home: {
      title: "NivaDesk | ऑर्डर, मरम्मत और ग्राहक प्रबंधन सॉफ़्टवेयर",
      description: "NivaDesk कस्टम ऑर्डर, मरम्मत और सर्विस व्यवसायों के लिए ऑर्डर मैनेजमेंट सॉफ़्टवेयर है: ऑर्डर, ग्राहक, शेड्यूल, इन्वेंटरी और ई-सिग्नेचर वाले एस्टिमेट एक वर्कस्पेस में। वेब, Mac, iPhone और Android पर।"
    },
    features: {
      title: "NivaDesk फ़ीचर्स | ऑर्डर, ग्राहक, शेड्यूल और फ़ाइलें",
      description: "देखें कि NivaDesk ऑर्डर, मरम्मत, ग्राहक, शेड्यूल, इन्वेंटरी, एस्टिमेट, क्लाइंट फ़ाइलें, बैंक तैयारी, टीम भूमिकाएँ और ग्राहक लिंक एक वर्कस्पेस में कैसे संभालता है — वेब, Mac, iPhone और Android पर।"
    },
    pricing: {
      title: "NivaDesk प्राइसिंग | Starter, Pro और Team प्लान",
      description: "NivaDesk के Starter, Pro और Team प्लान की तुलना करें: ऑर्डर सीमा, क्लाइंट फ़ाइल स्टोरेज, वित्त टूल और टीम सीटें। मासिक या वार्षिक बिलिंग, बिना कार्ड 14 दिन का ट्रायल।"
    },
    chatgpt: {
      title: "ChatGPT के लिए NivaDesk | अपना स्टूडियो बातचीत से चलाएँ",
      description: "अपने NivaDesk वर्कस्पेस को ChatGPT से जोड़ें: ऑर्डर, नोट्स, वित्त और बैंक खर्च के बारे में पूछें, पुरानी स्प्रेडशीट से ऑर्डर बनाएँ और रसीदों को बैंक लेन-देन से जोड़ें। हर प्लान में शामिल।"
    },
    faq: {
      title: "NivaDesk FAQ | प्लान, फ़ीचर्स और शुरुआत",
      description: "NivaDesk के बारे में आम सवाल: प्लान और कीमतें, समर्थित प्लेटफ़ॉर्म, ऑनलाइन स्टोर इंटीग्रेशन, ट्रायल, अपना डेटा एक्सपोर्ट करना और शुरुआत कैसे करें।"
    },
    signup: {
      title: "NivaDesk मुफ़्त आज़माएँ | स्टूडियो और ऑर्डर मैनेजमेंट",
      description: "NivaDesk मुफ़्त आज़माएँ, कार्ड की ज़रूरत नहीं। अपना स्टूडियो वर्कस्पेस बनाएँ और कुछ ही मिनटों में ऑर्डर, ग्राहक, शेड्यूल और इनवॉइस ट्रैक करना शुरू करें — वेब, Mac, iPhone और Android पर।"
    },
    contact: {
      title: "NivaDesk सपोर्ट और संपर्क",
      description: "NivaDesk से कैसे संपर्क करें: ऐप में सपोर्ट टिकट, अकाउंट सहायता, बिलिंग के सवाल, प्राइवेसी अनुरोध, सुरक्षा रिपोर्ट, जवाब का समय और कंपनी के संपर्क विवरण।"
    },
    security: {
      title: "NivaDesk सुरक्षा अवलोकन",
      description: "एक व्यावहारिक अवलोकन कि NivaDesk अकाउंट, वर्कस्पेस, फ़ाइलें, व्यावसायिक डेटा, भुगतान, बैकअप, ऑफ़लाइन डेटा और भूमिकाओं को कैसे सुरक्षित रखता है और सुरक्षा घटनाओं को कैसे संभालता है।"
    },
    amazon: {
      title: "Amazon विक्रेताओं के लिए NivaDesk | फ़ीचर्स, कीमतें और डेटा",
      description: "NivaDesk हर 30 मिनट में आपके Amazon ऑर्डर केवल-पढ़ने के तरीके से लाता है, ताकि ऑर्डर पर बनाने वाले, हस्तनिर्मित और मरम्मत विक्रेता काम की योजना बना सकें। पढ़े जाने वाले फ़ील्ड, सिंक, यूरोप मार्केटप्लेस, कीमतें।"
    },
    shopify: {
      title: "Shopify के लिए NivaDesk | सेटअप गाइड, प्लान और इम्पोर्ट",
      description: "Shopify के लिए NivaDesk Order Management ऐप कैसे काम करता है: केवल-पढ़ने की पहुँच, स्टोर इंस्टॉल और कनेक्ट करना, Shopify द्वारा अमेरिकी डॉलर में बिल किए जाने वाले ट्रायल सहित प्लान, पुराने ऑर्डर इम्पोर्ट करना और सपोर्ट।"
    },
    claude: {
      title: "Claude के लिए NivaDesk | सेटअप गाइड, टूल और अनुमतियाँ",
      description: "Claude के लिए NivaDesk कनेक्टर कैसे काम करता है: अपने NivaDesk अकाउंट से कनेक्ट करना, ऑर्डर, नोट्स, पैसे, बैंक खर्च और इन्वेंटरी के टूल, अनुमति और सुरक्षा नियम, आपका डेटा और डिस्कनेक्ट करना।"
    }
  }
};
