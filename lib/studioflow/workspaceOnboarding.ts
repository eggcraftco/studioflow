import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { withWebSyncStatus } from "@/lib/studioflow/syncStatus";

export const WORKSPACE_ONBOARDING_BUSINESS_TYPES = [
  "Custom Art Studio",
  "Freelancer / Designer",
  "Repair Service",
  "Handmade Products",
  "Photography Studio",
  "Tailor / Alteration Studio",
  "Jewellery Studio",
  "Agency / Creative Studio",
  "Food / Bakery / Catering",
  "Beauty / Clinic / Wellness",
  "Consultancy / Professional Service",
  "General Small Business",
  "Other / Prompt Based"
];

type WorkspaceOnboardingPreset = {
  businessType: string;
  customFields: string[];
  customSteps: string[];
  customToggles: string[];
  inventoryLabels: string[];
  activeStatuses: string[];
  summaryStep1: string;
  summaryStep2: string;
  baseCostLabel: string;
  expenseItems: string[];
  remainingItems: string[];
  showMaterials: boolean;
  showShipping: boolean;
  showPriority: boolean;
  showCustomerNotes: boolean;
};

function containsTerm(text: string, ...terms: string[]) {
  return terms.some(term => text.includes(term.toLowerCase()));
}

function headingItems(titles: string[]) {
  return titles
    .map(title => title.trim())
    .filter(Boolean)
    .map((title, index) => ({
      id: `onboarding-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || index}-${index}`,
      title
    }));
}

function titleItemsJSON(titles: string[]) {
  return JSON.stringify(headingItems(titles));
}

function stringListJSON(values: string[]) {
  return JSON.stringify(values.map(value => value.trim()).filter(Boolean));
}

// Localized business-description seeds: language display name -> business type
// -> seed text. "_default" is the generic placeholder for that language. Keyed
// by the same language names the rest of the app uses (see translation maps).
const BUSINESS_PROMPT_SEEDS: Record<string, Record<string, string>> = {
  "English": {
    "Custom Art Studio": "We create custom artwork commissions. We need customer details, design theme, reference images, approval stages, deposit, production stages, final review and shipping.",
    "Freelancer / Designer": "We deliver design and freelance projects. We need project brief, scope, reference files, revision rounds, client approval, deadline, final files and balance payment.",
    "Repair Service": "We repair customer items. We need model, serial number, issue reported, diagnostics, quote approval, parts order, repair, testing and collection or shipping.",
    "Handmade Products": "We make custom products. We need product type, size, colour, material, customer approval, production, packaging, shipping and balance payment.",
    "Photography Studio": "We manage photo shoots. We need client details, shoot type, location, date, package, booking deposit, selection, editing, delivery and follow-up notes.",
    "Tailor / Alteration Studio": "We tailor and alter garments. We need garment type, measurements, fabric details, fitting appointments, alteration notes, deposit, final fitting and collection date.",
    "Jewellery Studio": "We create custom jewellery. We need metal, stone, size, design sketch, customer approval, deposit, casting, setting, polishing, quality check and delivery.",
    "Agency / Creative Studio": "We run creative client projects. We need project brief, deliverables, timeline, team assignment, draft versions, client feedback rounds, approval, launch and invoicing.",
    "Food / Bakery / Catering": "We prepare custom food orders. We need event date, servings, flavours, dietary notes, design reference, deposit, preparation, decoration and delivery or pickup.",
    "Beauty / Clinic / Wellness": "We manage client appointments and treatments. We need client details, treatment type, consultation notes, appointment date, payment, aftercare and follow-up reminders.",
    "Consultancy / Professional Service": "We deliver consultancy engagements. We need client details, scope, proposal, contract, milestones, meetings, deliverables, review and invoicing.",
    "General Small Business": "We handle customer orders. We need customer details, order items, pricing, deposit, preparation, quality check, delivery or pickup and balance payment.",
    "_default": "Describe this business here, including customer information needed, workflow stages, approval steps, materials, shipping, appointments, deposits and delivery."
  },
  "Türkçe": {
    "Custom Art Studio": "Özel sanat çalışmaları/komisyonlar üretiyoruz. Müşteri bilgileri, tasarım teması, referans görseller, onay aşamaları, depozito, üretim aşamaları, son değerlendirme ve kargo gerekiyor.",
    "Freelancer / Designer": "Tasarım ve serbest çalışma projeleri teslim ediyoruz. Proje özeti, kapsam, referans dosyalar, revizyon turları, müşteri onayı, teslim tarihi, son dosyalar ve bakiye ödemesi gerekiyor.",
    "Repair Service": "Müşteri ürünlerini tamir ediyoruz. Model, seri numarası, bildirilen sorun, arıza tespiti, fiyat onayı, parça siparişi, tamir, test ve teslim alma veya kargo gerekiyor.",
    "Handmade Products": "Özel ürünler yapıyoruz. Ürün türü, ölçü, renk, malzeme, müşteri onayı, üretim, paketleme, kargo ve bakiye ödemesi gerekiyor.",
    "Photography Studio": "Fotoğraf çekimleri yönetiyoruz. Müşteri bilgileri, çekim türü, lokasyon, tarih, paket, rezervasyon depozitosu, seçim, düzenleme, teslimat ve takip notları gerekiyor.",
    "Tailor / Alteration Studio": "Kıyafet dikiyor ve tadilat yapıyoruz. Kıyafet türü, ölçüler, kumaş bilgileri, prova randevuları, tadilat notları, depozito, son prova ve teslim alma tarihi gerekiyor.",
    "Jewellery Studio": "Özel takı üretiyoruz. Metal, taş, ölçü, tasarım çizimi, müşteri onayı, depozito, döküm, taş kakma, parlatma, kalite kontrol ve teslimat gerekiyor.",
    "Agency / Creative Studio": "Yaratıcı müşteri projeleri yürütüyoruz. Proje özeti, çıktılar, zaman planı, ekip ataması, taslak sürümleri, müşteri geri bildirim turları, onay, lansman ve faturalama gerekiyor.",
    "Food / Bakery / Catering": "Özel yemek siparişleri hazırlıyoruz. Etkinlik tarihi, kişi sayısı, lezzetler, diyet notları, tasarım referansı, depozito, hazırlık, süsleme ve teslimat veya teslim alma gerekiyor.",
    "Beauty / Clinic / Wellness": "Müşteri randevularını ve uygulamaları yönetiyoruz. Müşteri bilgileri, uygulama türü, danışma notları, randevu tarihi, ödeme, bakım sonrası ve takip hatırlatmaları gerekiyor.",
    "Consultancy / Professional Service": "Danışmanlık hizmetleri sunuyoruz. Müşteri bilgileri, kapsam, teklif, sözleşme, kilometre taşları, toplantılar, çıktılar, değerlendirme ve faturalama gerekiyor.",
    "General Small Business": "Müşteri siparişlerini yönetiyoruz. Müşteri bilgileri, sipariş kalemleri, fiyatlandırma, depozito, hazırlık, kalite kontrol, teslimat veya teslim alma ve bakiye ödemesi gerekiyor.",
    "_default": "Bu işi burada anlatın: müşteriden gereken bilgiler, iş akışı aşamaları, onay adımları, malzemeler, kargo, randevular, depozitolar ve teslimat süreçleri."
  },
  "Deutsch": {
    "Custom Art Studio": "Wir erstellen individuelle Kunstwerke für Kundinnen und Kunden. Wichtig sind Referenzen, Konzeptfreigabe, Materialien, Produktionsschritte, Prüfung, finale Freigabe und Lieferung.",
    "Freelancer / Designer": "Wir liefern Design- und Freelance-Projekte. Wir benötigen Projektbriefing, Umfang, Referenzdateien, Korrekturrunden, Kundenfreigabe, Termin, finale Dateien und Restzahlung.",
    "Repair Service": "Wir reparieren Kundenartikel. Wir benötigen Modell, Seriennummer, Fehlerbeschreibung, Diagnose, Ersatzteile, Kundenfreigabe, Reparatur, Test, Garantiehinweise und Abholung oder Versand.",
    "Handmade Products": "Wir fertigen individuelle Produkte. Wir benötigen Produktart, Größe, Farbe, Material, Kundenfreigabe, Produktion, Verpackung, Versand und Restzahlung.",
    "Photography Studio": "Wir organisieren Fotoshootings. Wir benötigen Shooting-Art, Ort, Datum, Paket, Vertrag, Anzahlung, Shooting, Bearbeitung, Retusche und digitale Lieferung.",
    "Tailor / Alteration Studio": "Wir schneidern und ändern Kleidung. Wir benötigen Kleidungsart, Maße, Stoffdetails, Anprobetermine, Änderungsnotizen, Anzahlung, finale Anprobe und Abholdatum.",
    "Jewellery Studio": "Wir fertigen individuellen Schmuck. Wir benötigen Metall, Stein, Größe, Designskizze, Kundenfreigabe, Anzahlung, Guss, Fassung, Politur, Qualitätskontrolle und Lieferung.",
    "Agency / Creative Studio": "Wir betreuen kreative Kundenprojekte. Wir benötigen Projektbriefing, Liefergegenstände, Zeitplan, Teamzuweisung, Entwurfsversionen, Feedbackrunden, Freigabe, Launch und Rechnungsstellung.",
    "Food / Bakery / Catering": "Wir bereiten individuelle Essensbestellungen zu. Wir benötigen Veranstaltungsdatum, Portionen, Geschmacksrichtungen, Ernährungshinweise, Designreferenz, Anzahlung, Zubereitung, Dekoration und Lieferung oder Abholung.",
    "Beauty / Clinic / Wellness": "Wir verwalten Kundentermine und Behandlungen. Wir benötigen Kundendaten, Behandlungsart, Beratungsnotizen, Termin, Zahlung, Nachsorge und Folgeerinnerungen.",
    "Consultancy / Professional Service": "Wir erbringen Beratungsleistungen. Wir benötigen Kundendaten, Umfang, Angebot, Vertrag, Meilensteine, Meetings, Liefergegenstände, Prüfung und Rechnungsstellung.",
    "General Small Business": "Wir bearbeiten Kundenbestellungen. Wir benötigen Kundendaten, Bestellpositionen, Preise, Anzahlung, Vorbereitung, Qualitätskontrolle, Lieferung oder Abholung und Restzahlung.",
    "_default": "Beschreiben Sie dieses Geschäft: benötigte Kundendaten, Workflow-Schritte, Freigaben, Materialien, Versand, Termine, Anzahlungen und Lieferung."
  },
  "Français": {
    "Custom Art Studio": "Nous créons des œuvres personnalisées pour les clients. Nous avons besoin de références, validation du concept, matériaux, étapes de production, revue, validation finale et livraison.",
    "Freelancer / Designer": "Nous réalisons des projets de design et freelance. Nous avons besoin du brief, du périmètre, des fichiers de référence, des cycles de révision, de la validation client, de l'échéance, des fichiers finaux et du solde.",
    "Repair Service": "Nous réparons des articles clients. Nous avons besoin du modèle, numéro de série, description du problème, diagnostic, pièces, validation client, réparation, test, garantie et retrait ou expédition.",
    "Handmade Products": "Nous fabriquons des produits personnalisés. Nous avons besoin du type de produit, taille, couleur, matériau, validation client, production, emballage, expédition et solde.",
    "Photography Studio": "Nous gérons des séances photo. Nous avons besoin du type de séance, lieu, date, forfait, contrat, acompte, prise de vue, édition, retouche et livraison numérique.",
    "Tailor / Alteration Studio": "Nous confectionnons et retouchons des vêtements. Nous avons besoin du type de vêtement, mesures, détails du tissu, rendez-vous d'essayage, notes de retouche, acompte, essayage final et date de retrait.",
    "Jewellery Studio": "Nous créons des bijoux personnalisés. Nous avons besoin du métal, pierre, taille, croquis, validation client, acompte, fonte, sertissage, polissage, contrôle qualité et livraison.",
    "Agency / Creative Studio": "Nous menons des projets créatifs clients. Nous avons besoin du brief, des livrables, du planning, de l'attribution d'équipe, des versions de brouillon, des retours client, de la validation, du lancement et de la facturation.",
    "Food / Bakery / Catering": "Nous préparons des commandes alimentaires personnalisées. Nous avons besoin de la date de l'événement, du nombre de parts, des saveurs, des notes diététiques, de la référence de design, de l'acompte, de la préparation, de la décoration et de la livraison ou du retrait.",
    "Beauty / Clinic / Wellness": "Nous gérons les rendez-vous et soins clients. Nous avons besoin des informations client, du type de soin, des notes de consultation, de la date de rendez-vous, du paiement, des soins post et des rappels de suivi.",
    "Consultancy / Professional Service": "Nous réalisons des missions de conseil. Nous avons besoin des informations client, du périmètre, de la proposition, du contrat, des jalons, des réunions, des livrables, de la revue et de la facturation.",
    "General Small Business": "Nous traitons les commandes clients. Nous avons besoin des informations client, des articles, du tarif, de l'acompte, de la préparation, du contrôle qualité, de la livraison ou du retrait et du solde.",
    "_default": "Décrivez l’activité ici : informations client nécessaires, étapes du workflow, validations, matériaux, expédition, rendez-vous, acomptes et livraison."
  },
  "Italiano": {
    "Custom Art Studio": "Creiamo opere d’arte personalizzate per i clienti. Servono riferimenti, approvazione del concept, materiali, fasi di produzione, revisione, approvazione finale e consegna.",
    "Freelancer / Designer": "Realizziamo progetti di design e freelance. Servono brief, ambito, file di riferimento, cicli di revisione, approvazione del cliente, scadenza, file finali e saldo.",
    "Repair Service": "Ripariamo articoli dei clienti. Servono modello, numero di serie, descrizione del problema, diagnosi, pezzi, approvazione del cliente, riparazione, test, garanzia e ritiro o spedizione.",
    "Handmade Products": "Realizziamo prodotti personalizzati. Servono tipo di prodotto, taglia, colore, materiale, approvazione del cliente, produzione, imballaggio, spedizione e saldo.",
    "Photography Studio": "Gestiamo servizi fotografici. Servono tipo di shooting, luogo, data, pacchetto, contratto, deposito, shooting, editing, ritocco e consegna digitale.",
    "Tailor / Alteration Studio": "Confezioniamo e modifichiamo capi. Servono tipo di capo, misure, dettagli del tessuto, appuntamenti di prova, note di modifica, acconto, prova finale e data di ritiro.",
    "Jewellery Studio": "Creiamo gioielli personalizzati. Servono metallo, pietra, misura, bozzetto, approvazione del cliente, acconto, fusione, incastonatura, lucidatura, controllo qualità e consegna.",
    "Agency / Creative Studio": "Gestiamo progetti creativi per i clienti. Servono brief, deliverable, tempistiche, assegnazione del team, bozze, cicli di feedback, approvazione, lancio e fatturazione.",
    "Food / Bakery / Catering": "Prepariamo ordini alimentari personalizzati. Servono data dell'evento, porzioni, gusti, note dietetiche, riferimento del design, acconto, preparazione, decorazione e consegna o ritiro.",
    "Beauty / Clinic / Wellness": "Gestiamo appuntamenti e trattamenti dei clienti. Servono dati del cliente, tipo di trattamento, note di consulenza, data dell'appuntamento, pagamento, post-trattamento e promemoria di follow-up.",
    "Consultancy / Professional Service": "Forniamo servizi di consulenza. Servono dati del cliente, ambito, proposta, contratto, milestone, riunioni, deliverable, revisione e fatturazione.",
    "General Small Business": "Gestiamo gli ordini dei clienti. Servono dati del cliente, articoli, prezzi, acconto, preparazione, controllo qualità, consegna o ritiro e saldo.",
    "_default": "Descrivi qui l’attività: informazioni cliente necessarie, fasi del workflow, approvazioni, materiali, spedizione, appuntamenti, depositi e consegna."
  },
  "Español (Spanish)": {
    "Custom Art Studio": "Creamos obras personalizadas para clientes. Necesitamos referencias, aprobación del concepto, materiales, etapas de producción, revisión, aprobación final y entrega.",
    "Freelancer / Designer": "Realizamos proyectos de diseño y freelance. Necesitamos brief, alcance, archivos de referencia, rondas de revisión, aprobación del cliente, fecha límite, archivos finales y pago restante.",
    "Repair Service": "Reparamos artículos de clientes. Necesitamos modelo, número de serie, descripción del problema, diagnóstico, piezas, aprobación del cliente, reparación, pruebas, garantía y recogida o envío.",
    "Handmade Products": "Fabricamos productos personalizados. Necesitamos tipo de producto, talla, color, material, aprobación del cliente, producción, empaquetado, envío y pago restante.",
    "Photography Studio": "Gestionamos sesiones fotográficas. Necesitamos tipo de sesión, ubicación, fecha, paquete, contrato, depósito, sesión, edición, retoque y entrega digital.",
    "Tailor / Alteration Studio": "Confeccionamos y arreglamos prendas. Necesitamos tipo de prenda, medidas, detalles de la tela, citas de prueba, notas de arreglo, depósito, prueba final y fecha de recogida.",
    "Jewellery Studio": "Creamos joyas personalizadas. Necesitamos metal, piedra, talla, boceto, aprobación del cliente, depósito, fundición, engaste, pulido, control de calidad y entrega.",
    "Agency / Creative Studio": "Llevamos proyectos creativos de clientes. Necesitamos brief, entregables, cronograma, asignación de equipo, versiones de borrador, rondas de feedback, aprobación, lanzamiento y facturación.",
    "Food / Bakery / Catering": "Preparamos pedidos de comida personalizados. Necesitamos fecha del evento, raciones, sabores, notas dietéticas, referencia de diseño, depósito, preparación, decoración y entrega o recogida.",
    "Beauty / Clinic / Wellness": "Gestionamos citas y tratamientos de clientes. Necesitamos datos del cliente, tipo de tratamiento, notas de consulta, fecha de la cita, pago, cuidados posteriores y recordatorios de seguimiento.",
    "Consultancy / Professional Service": "Prestamos servicios de consultoría. Necesitamos datos del cliente, alcance, propuesta, contrato, hitos, reuniones, entregables, revisión y facturación.",
    "General Small Business": "Gestionamos los pedidos de clientes. Necesitamos datos del cliente, artículos, precios, depósito, preparación, control de calidad, entrega o recogida y pago restante.",
    "_default": "Describe este negocio: información necesaria del cliente, etapas del workflow, aprobaciones, materiales, envío, citas, depósitos y entrega."
  },
  "Português": {
    "Custom Art Studio": "Criamos obras personalizadas para clientes. Precisamos de referências, aprovação do conceito, materiais, etapas de produção, revisão, aprovação final e entrega.",
    "Freelancer / Designer": "Realizamos projetos de design e freelance. Precisamos de brief, âmbito, ficheiros de referência, rondas de revisão, aprovação do cliente, prazo, ficheiros finais e pagamento restante.",
    "Repair Service": "Reparamos artigos de clientes. Precisamos de modelo, número de série, descrição do problema, diagnóstico, peças, aprovação do cliente, reparação, teste, garantia e recolha ou envio.",
    "Handmade Products": "Fazemos produtos personalizados. Precisamos de tipo de produto, tamanho, cor, material, aprovação do cliente, produção, embalagem, envio e pagamento restante.",
    "Photography Studio": "Gerimos sessões fotográficas. Precisamos do tipo de sessão, local, data, pacote, contrato, depósito, sessão, edição, retoque e entrega digital.",
    "Tailor / Alteration Studio": "Confecionamos e ajustamos roupas. Precisamos do tipo de peça, medidas, detalhes do tecido, marcações de prova, notas de ajuste, depósito, prova final e data de recolha.",
    "Jewellery Studio": "Criamos joias personalizadas. Precisamos de metal, pedra, tamanho, esboço, aprovação do cliente, depósito, fundição, cravação, polimento, controlo de qualidade e entrega.",
    "Agency / Creative Studio": "Gerimos projetos criativos de clientes. Precisamos de brief, entregáveis, cronograma, atribuição de equipa, versões de rascunho, rondas de feedback, aprovação, lançamento e faturação.",
    "Food / Bakery / Catering": "Preparamos encomendas de comida personalizadas. Precisamos da data do evento, doses, sabores, notas dietéticas, referência de design, depósito, preparação, decoração e entrega ou recolha.",
    "Beauty / Clinic / Wellness": "Gerimos marcações e tratamentos de clientes. Precisamos dos dados do cliente, tipo de tratamento, notas de consulta, data da marcação, pagamento, cuidados pós e lembretes de acompanhamento.",
    "Consultancy / Professional Service": "Prestamos serviços de consultoria. Precisamos dos dados do cliente, âmbito, proposta, contrato, marcos, reuniões, entregáveis, revisão e faturação.",
    "General Small Business": "Gerimos as encomendas dos clientes. Precisamos dos dados do cliente, artigos, preços, depósito, preparação, controlo de qualidade, entrega ou recolha e pagamento restante.",
    "_default": "Descreva este negócio: informações do cliente, etapas do workflow, aprovações, materiais, envio, marcações, depósitos e entrega."
  },
  "Русский (Russian)": {
    "Custom Art Studio": "Мы создаём индивидуальные художественные работы для клиентов. Нужны референсы, утверждение концепции, материалы, этапы производства, проверка, финальное утверждение и доставка.",
    "Freelancer / Designer": "Мы выполняем дизайн- и фриланс-проекты. Нужны бриф, объём работ, референс-файлы, раунды правок, утверждение клиента, срок, финальные файлы и остаток оплаты.",
    "Repair Service": "Мы ремонтируем вещи клиентов. Нужны модель, серийный номер, описание проблемы, диагностика, запчасти, согласование стоимости, ремонт, тестирование, гарантия и самовывоз или доставка.",
    "Handmade Products": "Мы изготавливаем индивидуальные изделия. Нужны тип изделия, размер, цвет, материал, утверждение клиента, производство, упаковка, доставка и остаток оплаты.",
    "Photography Studio": "Мы проводим фотосессии. Нужны тип съёмки, локация, дата, пакет, договор, предоплата, съёмка, обработка, ретушь и цифровая доставка.",
    "Tailor / Alteration Studio": "Мы шьём и подгоняем одежду. Нужны тип изделия, мерки, детали ткани, примерки, заметки по переделке, предоплата, финальная примерка и дата выдачи.",
    "Jewellery Studio": "Мы создаём индивидуальные украшения. Нужны металл, камень, размер, эскиз, утверждение клиента, предоплата, литьё, закрепка, полировка, контроль качества и доставка.",
    "Agency / Creative Studio": "Мы ведём креативные проекты клиентов. Нужны бриф, результаты, график, распределение команды, версии черновиков, раунды правок, утверждение, запуск и выставление счёта.",
    "Food / Bakery / Catering": "Мы готовим индивидуальные заказы еды. Нужны дата мероприятия, число порций, вкусы, диетические пометки, референс дизайна, предоплата, приготовление, оформление и доставка или самовывоз.",
    "Beauty / Clinic / Wellness": "Мы ведём записи и процедуры клиентов. Нужны данные клиента, тип процедуры, заметки консультации, дата записи, оплата, постуход и напоминания о визите.",
    "Consultancy / Professional Service": "Мы оказываем консалтинговые услуги. Нужны данные клиента, объём, предложение, договор, этапы, встречи, результаты, проверка и выставление счёта.",
    "General Small Business": "Мы обрабатываем заказы клиентов. Нужны данные клиента, позиции заказа, цены, предоплата, подготовка, контроль качества, доставка или самовывоз и остаток оплаты.",
    "_default": "Опишите бизнес: какие данные нужны от клиента, этапы работы, согласования, материалы, доставка, встречи, предоплаты и финальная выдача."
  },
  "日本語 (Japanese)": {
    "Custom Art Studio": "お客様向けにカスタムアートを制作します。参考資料、コンセプト承認、材料、制作工程、確認、最終承認、納品が重要です。",
    "Freelancer / Designer": "デザイン・フリーランス案件を納品します。ブリーフ、範囲、参考ファイル、修正回数、クライアント承認、納期、最終ファイル、残金が必要です。",
    "Repair Service": "お客様の品物を修理します。モデル、シリアル番号、不具合内容、診断、部品注文、顧客承認、修理、テスト、保証、受け取りまたは配送が必要です。",
    "Handmade Products": "カスタム製品を作ります。製品タイプ、サイズ、色、素材、顧客承認、製作、梱包、配送、残金が必要です。",
    "Photography Studio": "写真撮影を管理します。撮影タイプ、場所、日付、プラン、契約、前金、撮影、編集、レタッチ、デジタル納品が必要です。",
    "Tailor / Alteration Studio": "衣服の仕立てと直しを行います。衣服タイプ、採寸、生地の詳細、フィッティング予約、直しメモ、前金、最終フィッティング、受け取り日が必要です。",
    "Jewellery Studio": "カスタムジュエリーを制作します。金属、石、サイズ、デザイン画、顧客承認、前金、鋳造、石留め、研磨、品質チェック、納品が必要です。",
    "Agency / Creative Studio": "クリエイティブな案件を進めます。ブリーフ、成果物、スケジュール、チーム割り当て、ドラフト版、フィードバック、承認、ローンチ、請求が必要です。",
    "Food / Bakery / Catering": "カスタムフードの注文を準備します。イベント日、人数、フレーバー、食事制限メモ、デザイン参考、前金、調理、デコレーション、配送または受け取りが必要です。",
    "Beauty / Clinic / Wellness": "お客様の予約と施術を管理します。顧客情報、施術タイプ、カウンセリングメモ、予約日、支払い、アフターケア、フォローアップのリマインドが必要です。",
    "Consultancy / Professional Service": "コンサルティング業務を提供します。顧客情報、範囲、提案、契約、マイルストーン、打ち合わせ、成果物、レビュー、請求が必要です。",
    "General Small Business": "お客様の注文を処理します。顧客情報、注文項目、価格、前金、準備、品質チェック、配送または受け取り、残金が必要です。",
    "_default": "このビジネスを説明してください。必要な顧客情報、ワークフロー、承認、材料、配送、予約、前金、納品について書いてください。"
  },
  "中文 (Chinese)": {
    "Custom Art Studio": "我们为客户制作定制艺术作品。需要参考资料、概念确认、材料、制作阶段、审核、最终确认和交付。",
    "Freelancer / Designer": "我们交付设计与自由职业项目。需要项目简报、范围、参考文件、修改轮次、客户确认、截止日期、最终文件和尾款。",
    "Repair Service": "我们维修客户物品。需要型号、序列号、问题描述、诊断、零件订购、客户确认、维修、测试、保修说明以及取件或配送。",
    "Handmade Products": "我们制作定制产品。需要产品类型、尺寸、颜色、材料、客户确认、生产、包装、配送和尾款。",
    "Photography Studio": "我们管理摄影拍摄。需要拍摄类型、地点、日期、套餐、合同、定金、拍摄、编辑、修图和数字交付。",
    "Tailor / Alteration Studio": "我们裁制和修改服装。需要服装类型、尺寸、面料细节、试衣预约、修改备注、定金、最终试衣和取件日期。",
    "Jewellery Studio": "我们制作定制珠宝。需要金属、宝石、尺寸、设计草图、客户确认、定金、铸造、镶嵌、抛光、质检和交付。",
    "Agency / Creative Studio": "我们承接创意客户项目。需要项目简报、交付物、时间表、团队分配、草稿版本、反馈轮次、确认、上线和开票。",
    "Food / Bakery / Catering": "我们准备定制餐饮订单。需要活动日期、份数、口味、饮食备注、设计参考、定金、制作、装饰和配送或自取。",
    "Beauty / Clinic / Wellness": "我们管理客户预约和护理。需要客户信息、护理类型、咨询备注、预约日期、付款、术后护理和回访提醒。",
    "Consultancy / Professional Service": "我们提供咨询服务。需要客户信息、范围、方案、合同、里程碑、会议、交付物、评审和开票。",
    "General Small Business": "我们处理客户订单。需要客户信息、订单项目、价格、定金、准备、质检、配送或自取和尾款。",
    "_default": "请描述此业务，包括所需客户信息、工作流程阶段、确认步骤、材料、配送、预约、定金和交付。"
  },
  "العربية (Arabic)": {
    "Custom Art Studio": "ننشئ أعمالاً فنية مخصصة للعملاء. نحتاج إلى مراجع، موافقة على الفكرة، مواد، مراحل إنتاج، مراجعة، موافقة نهائية وتسليم.",
    "Freelancer / Designer": "ننفذ مشاريع تصميم وعمل حر. نحتاج إلى الموجز، النطاق، ملفات المرجع، جولات التعديل، موافقة العميل، الموعد النهائي، الملفات النهائية والدفعة المتبقية.",
    "Repair Service": "نصلح أغراض العملاء. نحتاج إلى الموديل، الرقم التسلسلي، وصف المشكلة، التشخيص، طلب القطع، موافقة العميل، الإصلاح، الاختبار، الضمان والاستلام أو الشحن.",
    "Handmade Products": "نصنع منتجات مخصصة. نحتاج إلى نوع المنتج، المقاس، اللون، الخامة، موافقة العميل، الإنتاج، التغليف، الشحن والدفعة المتبقية.",
    "Photography Studio": "ندير جلسات تصوير. نحتاج إلى نوع الجلسة، الموقع، التاريخ، الباقة، العقد، العربون، التصوير، التحرير، التنقيح والتسليم الرقمي.",
    "Tailor / Alteration Studio": "نخيط ونعدّل الملابس. نحتاج إلى نوع القطعة، المقاسات، تفاصيل القماش، مواعيد القياس، ملاحظات التعديل، العربون، القياس النهائي وتاريخ الاستلام.",
    "Jewellery Studio": "نصنع مجوهرات مخصصة. نحتاج إلى المعدن، الحجر، المقاس، رسم التصميم، موافقة العميل، العربون، السباكة، التركيب، التلميع، فحص الجودة والتسليم.",
    "Agency / Creative Studio": "ندير مشاريع إبداعية للعملاء. نحتاج إلى الموجز، المخرجات، الجدول الزمني، توزيع الفريق، نسخ المسودة، جولات الملاحظات، الموافقة، الإطلاق والفوترة.",
    "Food / Bakery / Catering": "نحضّر طلبات طعام مخصصة. نحتاج إلى تاريخ المناسبة، عدد الحصص، النكهات، ملاحظات غذائية، مرجع التصميم، العربون، التحضير، التزيين والتسليم أو الاستلام.",
    "Beauty / Clinic / Wellness": "ندير مواعيد وعلاجات العملاء. نحتاج إلى بيانات العميل، نوع العلاج، ملاحظات الاستشارة، تاريخ الموعد، الدفع، العناية اللاحقة وتذكيرات المتابعة.",
    "Consultancy / Professional Service": "نقدّم خدمات استشارية. نحتاج إلى بيانات العميل، النطاق، العرض، العقد، المراحل، الاجتماعات، المخرجات، المراجعة والفوترة.",
    "General Small Business": "نعالج طلبات العملاء. نحتاج إلى بيانات العميل، عناصر الطلب، الأسعار، العربون، التحضير، فحص الجودة، التسليم أو الاستلام والدفعة المتبقية.",
    "_default": "صف هذا النشاط هنا: معلومات العميل المطلوبة، مراحل العمل، الموافقات، المواد، الشحن، المواعيد، العربون والتسليم."
  },
  "हिन्दी (Hindi)": {
    "Custom Art Studio": "हम ग्राहकों के लिए कस्टम आर्टवर्क बनाते हैं। हमें रेफरेंस, कॉन्सेप्ट approval, सामग्री, production stages, review, final approval और delivery चाहिए।",
    "Freelancer / Designer": "हम design और freelance projects deliver करते हैं। हमें brief, scope, reference files, revision rounds, client approval, deadline, final files और balance payment चाहिए।",
    "Repair Service": "हम ग्राहक के items repair करते हैं। हमें model, serial number, issue, diagnostics, parts order, customer approval, repair, testing, warranty और pickup या shipping चाहिए।",
    "Handmade Products": "हम custom products बनाते हैं। हमें product type, size, colour, material, customer approval, production, packaging, shipping और balance payment चाहिए।",
    "Photography Studio": "हम photo shoots manage करते हैं। हमें shoot type, location, date, package, contract, deposit, shooting, editing, retouching और digital delivery चाहिए।",
    "Tailor / Alteration Studio": "हम कपड़े सिलते और alter करते हैं। हमें garment type, measurements, fabric details, fitting appointments, alteration notes, deposit, final fitting और collection date चाहिए।",
    "Jewellery Studio": "हम custom jewellery बनाते हैं। हमें metal, stone, size, design sketch, customer approval, deposit, casting, setting, polishing, quality check और delivery चाहिए।",
    "Agency / Creative Studio": "हम creative client projects चलाते हैं। हमें brief, deliverables, timeline, team assignment, draft versions, feedback rounds, approval, launch और invoicing चाहिए।",
    "Food / Bakery / Catering": "हम custom food orders तैयार करते हैं। हमें event date, servings, flavours, dietary notes, design reference, deposit, preparation, decoration और delivery या pickup चाहिए।",
    "Beauty / Clinic / Wellness": "हम client appointments और treatments manage करते हैं। हमें client details, treatment type, consultation notes, appointment date, payment, aftercare और follow-up reminders चाहिए।",
    "Consultancy / Professional Service": "हम consultancy services देते हैं। हमें client details, scope, proposal, contract, milestones, meetings, deliverables, review और invoicing चाहिए।",
    "General Small Business": "हम customer orders संभालते हैं। हमें customer details, order items, pricing, deposit, preparation, quality check, delivery या pickup और balance payment चाहिए।",
    "_default": "इस business को यहाँ describe करें: customer information, workflow stages, approval steps, materials, shipping, appointments, deposits और delivery."
  }
};

export function workspaceOnboardingPromptSeed(type: string, language: string = "English") {
  if (type === "Other / Prompt Based") return "";
  const table = BUSINESS_PROMPT_SEEDS[language] ?? BUSINESS_PROMPT_SEEDS.English;
  return table[type] ?? BUSINESS_PROMPT_SEEDS.English[type] ?? table["_default"] ?? BUSINESS_PROMPT_SEEDS.English["_default"];
}

export function isWorkspaceOnboardingPromptSeed(prompt: string) {
  const trimmed = prompt.trim();
  if (!trimmed) return true;
  // A description counts as an auto-seed (safe to refresh) if it matches any
  // industry's seed — or generic default — in any supported language.
  for (const table of Object.values(BUSINESS_PROMPT_SEEDS)) {
    for (const seed of Object.values(table)) {
      if (seed === trimmed) return true;
    }
  }
  return trimmed === "This business offers professional photography services for individuals, families, events, brands, and products.\nCustomers should provide their name, contact details, preferred date, location, type of shoot, style preferences, deadline, and any special requests.\nThe process includes enquiry, consultation, quote, deposit payment, shoot planning, editing, client review, final delivery and follow-up.";
}

function onboardingPresetFor(rawText: string): WorkspaceOnboardingPreset {
  const text = rawText.toLowerCase();
  if (containsTerm(text, "photo", "photography", "video", "shoot", "wedding", "retouch", "editing", "gallery", "fotograf", "cekim")) {
    return {
      businessType: "Photography Studio",
      customFields: ["Shoot Type", "Location", "Shoot Date", "Package"],
      customSteps: ["Enquiry", "Booking", "Pre-shoot", "Shooting", "Selection", "Editing", "Delivery"],
      customToggles: ["Deposit Paid?", "Booking Confirmed?", "Shoot Completed?", "Selection Sent?", "Editing Completed?", "Gallery Delivered?"],
      inventoryLabels: ["Location Confirmed", "Equipment Ready", "Assistant Booked", "Gallery Ready"],
      activeStatuses: ["New", "Not Yet", "Booked", "In Progress", "Review", "Done", "Cancelled"],
      summaryStep1: "Booking",
      summaryStep2: "Editing",
      baseCostLabel: "Shoot Cost (Base)",
      expenseItems: ["Assistant Cost", "Studio / Location", "Editing Cost", "Travel Cost"],
      remainingItems: [],
      showMaterials: true,
      showShipping: false,
      showPriority: true,
      showCustomerNotes: true
    };
  }
  if (containsTerm(text, "repair", "fix", "diagnostic", "warranty", "device", "service", "tamir", "onarim", "ariza")) {
    return {
      businessType: "Repair Service",
      customFields: ["Item / Device Model", "Serial Number", "Issue Reported", "Warranty Status"],
      customSteps: ["Check-in", "Diagnostics", "Quote Approval", "Parts Order", "Repair", "Testing", "Ready for Pickup"],
      customToggles: ["Item Received?", "Customer Approved Cost?", "Parts Arrived?", "Repair Completed?", "Quality Tested?", "Warranty Note Added?"],
      inventoryLabels: ["Parts Ordered", "Parts Received", "Tools Ready", "Quality Tested"],
      activeStatuses: ["New", "Not Yet", "Waiting Parts", "In Progress", "Testing", "Done", "Cancelled"],
      summaryStep1: "Diagnostics",
      summaryStep2: "Repair",
      baseCostLabel: "Service Cost (Base)",
      expenseItems: ["Parts Cost", "Technician Cost", "Testing Cost"],
      remainingItems: [],
      showMaterials: true,
      showShipping: true,
      showPriority: true,
      showCustomerNotes: true
    };
  }
  if (containsTerm(text, "tailor", "alteration", "sewing", "garment", "fabric", "dress", "fitting", "terzi", "tadilat", "dikis")) {
    return {
      businessType: "Tailor / Alteration Studio",
      customFields: ["Garment Type", "Measurements", "Fabric", "Fitting Date"],
      customSteps: ["Consultation", "Measurements", "Pinning", "Cutting", "Sewing", "Fitting", "Final Press"],
      customToggles: ["Measurements Taken?", "Fabric Received?", "Fitting Approved?", "Final Pressed?", "Ready for Collection?"],
      inventoryLabels: ["Fabric Received", "Trim Ready", "Fitting Booked", "Final Pressed"],
      activeStatuses: ["New", "Not Yet", "In Progress", "Fitting", "Ready", "Done", "Cancelled"],
      summaryStep1: "Measurements",
      summaryStep2: "Sewing",
      baseCostLabel: "Labour Cost (Base)",
      expenseItems: ["Fabric Cost", "Trim / Accessories", "Outwork Cost"],
      remainingItems: [],
      showMaterials: true,
      showShipping: false,
      showPriority: true,
      showCustomerNotes: true
    };
  }
  if (containsTerm(text, "jewellery", "jewelry", "ring", "necklace", "stone", "diamond", "gold", "silver", "mucevher", "taki")) {
    return {
      businessType: "Jewellery Studio",
      customFields: ["Metal Type", "Size", "Stone / Setting", "Design Reference"],
      customSteps: ["Consultation", "Design", "CAD / Mockup", "Casting", "Stone Setting", "Polishing", "Final Check"],
      customToggles: ["Deposit Paid?", "Design Approved?", "Metal Sourced?", "Stones Arrived?", "Hallmarked?", "Box Ready?"],
      inventoryLabels: ["Metal Sourced", "Stones Ready", "Hallmark Done", "Box Ready"],
      activeStatuses: ["New", "Not Yet", "Design", "In Progress", "Final Review", "Done", "Cancelled"],
      summaryStep1: "Design",
      summaryStep2: "Stone Setting",
      baseCostLabel: "Workshop Cost (Base)",
      expenseItems: ["Metal Cost", "Stone Cost", "Casting Cost", "Hallmark Cost"],
      remainingItems: [],
      showMaterials: true,
      showShipping: true,
      showPriority: true,
      showCustomerNotes: true
    };
  }
  if (containsTerm(text, "food", "bakery", "cake", "catering", "restaurant", "allergy", "yemek", "firin", "pasta")) {
    return {
      businessType: "Food / Bakery / Catering",
      customFields: ["Event Type", "Guest Count", "Dietary Notes", "Delivery Time"],
      customSteps: ["Enquiry", "Quote", "Deposit", "Menu Approval", "Preparation", "Packaging", "Delivery"],
      customToggles: ["Deposit Paid?", "Menu Approved?", "Ingredients Ordered?", "Prep Completed?", "Packed?", "Delivered?"],
      inventoryLabels: ["Ingredients Ready", "Packaging Ready", "Kitchen Slot", "Delivery Ready"],
      activeStatuses: ["New", "Not Yet", "Booked", "In Progress", "Ready", "Done", "Cancelled"],
      summaryStep1: "Menu Approval",
      summaryStep2: "Preparation",
      baseCostLabel: "Order Cost (Base)",
      expenseItems: ["Ingredient Cost", "Kitchen / Prep Cost", "Packaging Cost", "Delivery Prep"],
      remainingItems: [],
      showMaterials: true,
      showShipping: true,
      showPriority: true,
      showCustomerNotes: true
    };
  }
  if (containsTerm(text, "beauty", "clinic", "wellness", "salon", "treatment", "therapy", "appointment", "guzellik", "klinik")) {
    return {
      businessType: "Beauty / Clinic / Wellness",
      customFields: ["Treatment Type", "Appointment Date", "Client Notes", "Follow-up"],
      customSteps: ["Enquiry", "Consultation", "Booking", "Preparation", "Appointment", "Aftercare", "Follow-up"],
      customToggles: ["Consultation Done?", "Deposit Paid?", "Consent Form?", "Appointment Completed?", "Aftercare Sent?", "Follow-up Booked?"],
      inventoryLabels: ["Room Ready", "Equipment Ready", "Products Ready", "Aftercare Ready"],
      activeStatuses: ["New", "Not Yet", "Booked", "In Progress", "Follow-up", "Done", "Cancelled"],
      summaryStep1: "Booking",
      summaryStep2: "Appointment",
      baseCostLabel: "Treatment Cost (Base)",
      expenseItems: ["Product Cost", "Room / Equipment", "Practitioner Cost"],
      remainingItems: [],
      showMaterials: true,
      showShipping: false,
      showPriority: true,
      showCustomerNotes: true
    };
  }
  if (containsTerm(text, "designer", "freelancer", "agency", "creative", "consult", "branding", "website", "marketing", "tasarim", "ajans")) {
    return {
      businessType: "Agency / Creative Studio",
      customFields: ["Project Type", "Brief", "Deadline", "Revision Limit"],
      customSteps: ["Enquiry", "Brief", "Quote", "Deposit", "Draft", "Revision", "Delivery"],
      customToggles: ["Brief Received?", "Deposit Paid?", "Draft Sent?", "Revision Approved?", "Final Files Sent?"],
      inventoryLabels: ["Brief Ready", "Assets Received", "Draft Sent", "Final Delivered"],
      activeStatuses: ["New", "Not Yet", "In Progress", "Review", "Done", "Cancelled"],
      summaryStep1: "Draft",
      summaryStep2: "Revision",
      baseCostLabel: "Project Cost (Base)",
      expenseItems: ["Freelancer Cost", "Software / Tools", "Asset Purchase"],
      remainingItems: [],
      showMaterials: false,
      showShipping: false,
      showPriority: true,
      showCustomerNotes: true
    };
  }
  return {
    businessType: "General Small Business",
    customFields: ["Design Theme", "Size / Model", "Special Request"],
    customSteps: ["Enquiry", "Concept", "Mockup", "Client Approval", "Production", "Final Review", "Delivery"],
    customToggles: ["Deposit Paid?", "Reference Received?", "Mockup Approved?", "Production Completed?", "Final Photos Sent?", "Ready to Ship?"],
    inventoryLabels: ["Materials Ready", "Item Received", "Packaging Ready", "Final Checked"],
    activeStatuses: ["New", "Not Yet", "In Progress", "Review", "Done", "Cancelled"],
    summaryStep1: "Concept",
    summaryStep2: "Production",
    baseCostLabel: "Cost (Base)",
    expenseItems: ["Material Cost", "Supplier Cost", "Packaging Cost"],
    remainingItems: [],
    showMaterials: true,
    showShipping: true,
    showPriority: true,
    showCustomerNotes: true
  };
}

function onboardingPayload(
  businessType: string,
  prompt: string,
  smart: boolean,
  action: "smart" | "standard",
  userId: string
) {
  const storedPrompt = prompt.trim() || workspaceOnboardingPromptSeed(businessType);
  const preset = onboardingPresetFor(smart ? `${businessType}\n${storedPrompt}` : businessType);
  const labels = preset.inventoryLabels.length ? preset.inventoryLabels : ["Material Check 1"];
  const paddedLabels = [...labels, "Item", "Item", "Item", "Item"];

  return {
    businessType,
    businessDescriptionPrompt: storedPrompt,
    activeStatusesJSON: stringListJSON(preset.activeStatuses),
    customFieldsJSON: titleItemsJSON(preset.customFields),
    customTogglesJSON: titleItemsJSON(preset.customToggles),
    customStepsJSON: titleItemsJSON(preset.customSteps),
    financialExpenseItemsJSON: titleItemsJSON(preset.expenseItems),
    financialRemainingItemsJSON: titleItemsJSON(preset.remainingItems),
    financialShowBaseCost: true,
    financialBaseCostLabel: preset.baseCostLabel,
    summaryStep1: preset.summaryStep1,
    summaryStep2: preset.summaryStep2,
    orderListStep1: preset.summaryStep1,
    orderListStep2: preset.summaryStep2,
    invLabel1: paddedLabels[0],
    invLabel2: paddedLabels[1],
    invLabel3: paddedLabels[2],
    invLabel4: paddedLabels[3],
    materialsDefaultChecksJSON: titleItemsJSON(labels),
    showCardCustomerNotes: preset.showCustomerNotes,
    showCardPreview: true,
    showCardSummary: true,
    showCardCustomer: true,
    showCardDelivery: true,
    showCardCommunication: true,
    showCardNotes: true,
    showCardFinancial: true,
    showCardStatus: false,
    showCardMaterials: preset.showMaterials,
    showCardShipping: preset.showShipping,
    showCardPriority: preset.showPriority,
    businessTemplateAppliedAt: serverTimestamp(),
    businessOnboardingCompletedAt: serverTimestamp(),
    businessOnboardingCompletedAction: action,
    businessOnboardingCompletedBy: userId
  };
}

export async function saveWorkspaceOnboardingTemplate(
  companyId: string,
  userId: string,
  businessType: string,
  prompt: string,
  smart: boolean
) {
  await withWebSyncStatus(
    () => setDoc(
      doc(db, "companySettings", companyId),
      onboardingPayload(businessType, prompt, smart, smart ? "smart" : "standard", userId),
      { merge: true }
    ),
    "Saving workspace setup to cloud."
  );
}

export async function saveWorkspaceOnboardingSkip(companyId: string, userId: string) {
  await withWebSyncStatus(
    () => setDoc(doc(db, "companySettings", companyId), {
      businessOnboardingCompletedAt: serverTimestamp(),
      businessOnboardingCompletedAction: "skip",
      businessOnboardingCompletedBy: userId
    }, { merge: true }),
    "Saving workspace setup choice."
  );
}
