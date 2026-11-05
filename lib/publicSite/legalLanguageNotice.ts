import type { StudioLanguage } from "@/lib/studioflow/language";

// NIVADESK_HUKUK.md H-07 (owner approved 5 Nov 2026): English is the only legally reviewed text of NivaDesk's
// legal pages. A reader who browses the site in another language is told so in their own language, on every
// legal page:
//   · english — the document below is shown in English (Privacy, Terms, Refunds, and any page or language
//               without a translated summary);
//   · summary — the page below is a translated summary for convenience (Cookies, Account deletion, Security,
//               Subprocessors, Data Processing Agreement, Acceptable use, Support and contact).
// H-06: the Privacy page also says, in the reader's language, how to complain — to us, or to the regulator (the
// Information Commission), which may ask whether the reader raised it with us first (owner's sentence, 5 Nov 2026).
// English governs, subject to mandatory rights (owner, 5 Nov 2026). The English text in privacyPolicy.ts section 19 governs.
// A change to the English source below must be translated again and shown to the owner before release.
export type LegalLanguageNoticeCopy = {
  title: string;
  english: string;
  summary: string;
  complaints: string;
};

export const LEGAL_LANGUAGE_NOTICE_EN: LegalLanguageNoticeCopy = {
  title: "Legal document language",
  english:
    "This document is shown in English. The English version is the current, governing text. This does not affect any mandatory rights you have under applicable law. The page title and the site navigation are in your language, but the document itself has not been translated yet.",
  summary:
    "This page is a summary translation provided for convenience. The English version is the current, governing text: if the two differ, the English version applies, subject to any mandatory rights you have under applicable law. To read it, switch the site language to English.",
  complaints:
    "Questions or complaints about your personal data: write to contact@nivadesk.co.uk. We acknowledge complaints within 30 days. You can also complain to the Information Commission (ico.org.uk). The regulator may ask whether you have raised your concerns with us first."
};

export const LEGAL_LANGUAGE_NOTICE: Record<Exclude<StudioLanguage, "English">, LegalLanguageNoticeCopy> = {
  Türkçe: {
    title: "Hukuki belgenin dili",
    english:
      "Bu belge İngilizce gösterilmektedir. Güncel ve geçerli metin İngilizce sürümdür. Bu, yürürlükteki hukukun size tanıdığı vazgeçilemez hakları etkilemez. Sayfa başlığı ve site menüsü sizin dilinizdedir; belgenin kendisi henüz çevrilmedi.",
    summary:
      "Bu sayfa, kolaylık olsun diye sunulan özet bir çeviridir. Güncel ve geçerli metin İngilizce sürümdür: ikisi arasında fark varsa, yürürlükteki hukukun size tanıdığı vazgeçilemez haklar saklı kalmak kaydıyla İngilizce sürüm uygulanır. İngilizce metni okumak için site dilini İngilizce yapın.",
    complaints:
      "Kişisel verilerinizle ilgili soru ve şikâyetleriniz için contact@nivadesk.co.uk adresine yazın. Şikâyetleri 30 gün içinde aldığımızı bildiririz. Birleşik Krallık veri koruma düzenleyicisi Information Commission'a (ico.org.uk) da şikâyette bulunabilirsiniz. Düzenleyici, endişenizi önce bize iletip iletmediğinizi sorabilir."
  },
  Deutsch: {
    title: "Sprache des Rechtsdokuments",
    english:
      "Dieses Dokument wird auf Englisch angezeigt. Die englische Fassung ist der aktuelle, maßgebliche Text. Zwingende Rechte, die Ihnen nach geltendem Recht zustehen, bleiben davon unberührt. Seitentitel und Navigation erscheinen in Ihrer Sprache, das Dokument selbst ist jedoch noch nicht übersetzt.",
    summary:
      "Diese Seite ist eine zusammenfassende Übersetzung, die wir zur Erleichterung bereitstellen. Die englische Fassung ist der aktuelle, maßgebliche Text: Weichen beide voneinander ab, gilt die englische Fassung, vorbehaltlich zwingender Rechte, die Ihnen nach geltendem Recht zustehen. Um sie zu lesen, stellen Sie die Sprache der Website auf Englisch um.",
    complaints:
      "Fragen oder Beschwerden zu Ihren personenbezogenen Daten richten Sie an contact@nivadesk.co.uk. Wir bestätigen den Eingang von Beschwerden innerhalb von 30 Tagen. Sie können sich außerdem bei der britischen Datenschutzaufsichtsbehörde, der Information Commission (ico.org.uk), beschweren. Die Behörde kann fragen, ob Sie Ihr Anliegen zuerst an uns gerichtet haben."
  },
  Français: {
    title: "Langue du document juridique",
    english:
      "Ce document est affiché en anglais. La version anglaise est le texte actuel qui fait foi. Cela n'affecte pas les droits impératifs dont vous bénéficiez en vertu de la loi applicable. Le titre de la page et la navigation du site sont dans votre langue, mais le document lui-même n'a pas encore été traduit.",
    summary:
      "Cette page est une traduction résumée fournie pour votre commodité. La version anglaise est le texte actuel qui fait foi : en cas de divergence, la version anglaise s'applique, sous réserve des droits impératifs dont vous bénéficiez en vertu de la loi applicable. Pour la lire, passez le site en anglais.",
    complaints:
      "Pour toute question ou réclamation concernant vos données personnelles, écrivez à contact@nivadesk.co.uk. Nous accusons réception des réclamations sous 30 jours. Vous pouvez également adresser une réclamation à l'autorité britannique de protection des données, l'Information Commission (ico.org.uk). Celle-ci peut vous demander si vous nous avez d'abord fait part de vos préoccupations."
  },
  Italiano: {
    title: "Lingua del documento legale",
    english:
      "Questo documento è mostrato in inglese. La versione inglese è il testo attuale e prevalente. Ciò non pregiudica i diritti inderogabili che ti riconosce la legge applicabile. Il titolo della pagina e la navigazione del sito sono nella tua lingua, ma il documento non è ancora stato tradotto.",
    summary:
      "Questa pagina è una traduzione riassuntiva fornita per comodità. La versione inglese è il testo attuale e prevalente: in caso di differenze si applica la versione inglese, fatti salvi i diritti inderogabili che ti riconosce la legge applicabile. Per leggerla, imposta la lingua del sito su inglese.",
    complaints:
      "Per domande o reclami sui tuoi dati personali scrivi a contact@nivadesk.co.uk. Confermiamo la ricezione dei reclami entro 30 giorni. Puoi anche presentare reclamo all'autorità britannica per la protezione dei dati, l'Information Commission (ico.org.uk). L'autorità può chiederti se hai prima sottoposto la questione a noi."
  },
  "Español (Spanish)": {
    title: "Idioma del documento legal",
    english:
      "Este documento se muestra en inglés. La versión en inglés es el texto vigente y el que prevalece. Esto no afecta a los derechos irrenunciables que te reconozca la ley aplicable. El título de la página y la navegación del sitio están en tu idioma, pero el documento en sí aún no se ha traducido.",
    summary:
      "Esta página es una traducción resumida que ofrecemos para tu comodidad. La versión en inglés es el texto vigente y el que prevalece: si ambas difieren, se aplica la versión en inglés, sin perjuicio de los derechos irrenunciables que te reconozca la ley aplicable. Para leerla, cambia el idioma del sitio a inglés.",
    complaints:
      "Si tienes preguntas o reclamaciones sobre tus datos personales, escribe a contact@nivadesk.co.uk. Acusamos recibo de las reclamaciones en un plazo de 30 días. También puedes reclamar ante el regulador británico de protección de datos, la Information Commission (ico.org.uk). El regulador puede preguntarte si nos has planteado antes tu inquietud."
  },
  Português: {
    title: "Idioma do documento legal",
    english:
      "Este documento é apresentado em inglês. A versão em inglês é o texto atual e o que prevalece. Isto não afeta os direitos imperativos que a lei aplicável lhe confira. O título da página e a navegação do site estão no seu idioma, mas o documento em si ainda não foi traduzido.",
    summary:
      "Esta página é uma tradução resumida disponibilizada por conveniência. A versão em inglês é o texto atual e o que prevalece: se as duas divergirem, aplica-se a versão em inglês, sem prejuízo dos direitos imperativos que a lei aplicável lhe confira. Para a ler, mude o idioma do site para inglês.",
    complaints:
      "Para perguntas ou reclamações sobre os seus dados pessoais, escreva para contact@nivadesk.co.uk. Confirmamos a receção das reclamações no prazo de 30 dias. Também pode apresentar reclamação ao regulador britânico de proteção de dados, a Information Commission (ico.org.uk). O regulador pode perguntar se nos apresentou primeiro a sua preocupação."
  },
  "Русский (Russian)": {
    title: "Язык юридического документа",
    english:
      "Этот документ показан на английском языке. Действующим и имеющим преимущественную силу является английский текст. Это не затрагивает обязательных прав, которые предоставляет вам применимое право. Заголовок страницы и навигация сайта показаны на вашем языке, но сам документ ещё не переведён.",
    summary:
      "Эта страница — краткий перевод, предоставленный для удобства. Действующим и имеющим преимущественную силу является английский текст: при расхождениях применяется английская версия, без ущерба для обязательных прав, которые предоставляет вам применимое право. Чтобы прочитать её, переключите язык сайта на английский.",
    complaints:
      "С вопросами или жалобами о ваших персональных данных пишите на contact@nivadesk.co.uk. Мы подтверждаем получение жалоб в течение 30 дней. Вы также можете подать жалобу в британский орган по защите данных — Information Commission (ico.org.uk). Регулятор может спросить, обращались ли вы сначала к нам."
  },
  "日本語 (Japanese)": {
    title: "法的文書の言語",
    english:
      "この文書は英語で表示されています。現行かつ優先する本文は英語版です。これは、適用法によりお客様に認められる強行的な権利に影響しません。ページの見出しとサイトのナビゲーションはお客様の言語で表示されますが、文書本体はまだ翻訳されていません。",
    summary:
      "このページは、便宜のために提供する要約翻訳です。現行かつ優先する本文は英語版です。両者に相違がある場合は、適用法によりお客様に認められる強行的な権利を妨げない範囲で、英語版が適用されます。英語版を読むには、サイトの言語を英語に切り替えてください。",
    complaints:
      "個人データに関するご質問や苦情は contact@nivadesk.co.uk までお寄せください。苦情は30日以内に受領をお知らせします。また、英国のデータ保護監督機関である Information Commission（ico.org.uk）に苦情を申し立てることもできます。監督機関は、先に当社にご相談いただいたかどうかを確認する場合があります。"
  },
  "中文 (Chinese)": {
    title: "法律文件的语言",
    english:
      "本文件以英文显示。英文版本是现行且具有优先效力的文本。这不影响适用法律赋予您的强制性权利。页面标题和网站导航以您的语言显示，但文件本身尚未翻译。",
    summary:
      "本页面是为方便您阅读而提供的摘要译文。英文版本是现行且具有优先效力的文本：两者如有不一致，以英文版本为准，但不影响适用法律赋予您的强制性权利。如需阅读英文版本，请将网站语言切换为英文。",
    complaints:
      "如对您的个人数据有疑问或投诉，请发送邮件至 contact@nivadesk.co.uk。我们会在 30 天内确认收到投诉。您也可以向英国数据保护监管机构 Information Commission（ico.org.uk）投诉。监管机构可能会询问您是否已先向我们提出过您的问题。"
  },
  "العربية (Arabic)": {
    title: "لغة المستند القانوني",
    english:
      "يُعرض هذا المستند باللغة الإنجليزية. النسخة الإنجليزية هي النص الحالي المعتمد. ولا يخلّ ذلك بأي حقوق إلزامية يمنحك إياها القانون المعمول به. يظهر عنوان الصفحة وقائمة التنقل في الموقع بلغتك، لكن المستند نفسه لم يُترجم بعد.",
    summary:
      "هذه الصفحة ترجمة موجزة مقدّمة للتيسير. النسخة الإنجليزية هي النص الحالي المعتمد: إذا اختلف النصان، تُطبَّق النسخة الإنجليزية، مع عدم الإخلال بأي حقوق إلزامية يمنحك إياها القانون المعمول به. لقراءتها، غيّر لغة الموقع إلى الإنجليزية.",
    complaints:
      "لأي أسئلة أو شكاوى بشأن بياناتك الشخصية، راسلنا على contact@nivadesk.co.uk. نؤكد استلام الشكاوى خلال 30 يومًا. ويمكنك أيضًا تقديم شكوى إلى الجهة التنظيمية لحماية البيانات في المملكة المتحدة، Information Commission (ico.org.uk). وقد تسألك الجهة التنظيمية عمّا إذا كنت قد عرضت مخاوفك علينا أولًا."
  },
  "हिन्दी (Hindi)": {
    title: "कानूनी दस्तावेज़ की भाषा",
    english:
      "यह दस्तावेज़ अंग्रेज़ी में दिखाया गया है। अंग्रेज़ी संस्करण ही वर्तमान और मान्य पाठ है। इससे लागू कानून के तहत आपके अनिवार्य अधिकार प्रभावित नहीं होते। पेज का शीर्षक और साइट नेविगेशन आपकी भाषा में हैं, लेकिन दस्तावेज़ का अभी अनुवाद नहीं हुआ है।",
    summary:
      "यह पेज सुविधा के लिए दिया गया सारांश अनुवाद है। अंग्रेज़ी संस्करण ही वर्तमान और मान्य पाठ है: दोनों में अंतर होने पर, लागू कानून के तहत आपके अनिवार्य अधिकारों को प्रभावित किए बिना, अंग्रेज़ी संस्करण लागू होगा। इसे पढ़ने के लिए साइट की भाषा अंग्रेज़ी पर बदलें।",
    complaints:
      "अपने व्यक्तिगत डेटा के बारे में प्रश्न या शिकायत के लिए contact@nivadesk.co.uk पर लिखें। हम 30 दिनों के भीतर शिकायत मिलने की पुष्टि करते हैं। आप यूके के डेटा संरक्षण नियामक, Information Commission (ico.org.uk), से भी शिकायत कर सकते हैं। नियामक यह पूछ सकता है कि क्या आपने पहले अपनी चिंता हमारे सामने रखी थी।"
  }
};

export function getLegalLanguageNotice(language: StudioLanguage | string | null | undefined): LegalLanguageNoticeCopy {
  return LEGAL_LANGUAGE_NOTICE[language as Exclude<StudioLanguage, "English">] ?? LEGAL_LANGUAGE_NOTICE_EN;
}
