import type { StudioLanguage } from "@/lib/studioflow/language";

export type PrivacyPolicySubsection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type PrivacyPolicySection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  subsections?: PrivacyPolicySubsection[];
};

export const PRIVACY_POLICY_LAST_UPDATED = "1 June 2026";

export const PRIVACY_POLICY_SECTIONS: PrivacyPolicySection[] = [
  {
    title: "1. Who we are",
    paragraphs: [
      "NivaDesk is operated by:",
      "EGGCRAFT LIMITED\n141 Randolph Avenue\nLondon\nW9 1DN\nUnited Kingdom",
      "Email: contact@nivadesk.co.uk",
      "For privacy-related questions, data requests, or account deletion requests, please contact us by email."
    ]
  },
  {
    title: "2. What this Privacy Policy covers",
    paragraphs: ["This Privacy Policy applies to:"],
    bullets: [
      "our website;",
      "the NivaDesk web app;",
      "the NivaDesk mobile and desktop apps;",
      "account registration and login;",
      "customer support and email communication;",
      "payment and subscription management;",
      "uploaded files, client files, order records, notes, tasks, workflow data, and workspace content;",
      "integrations or third-party services connected to NivaDesk."
    ],
    subsections: [
      {
        title: "",
        paragraphs: ["This Privacy Policy does not apply to websites, apps, or services that we do not own or control."]
      }
    ]
  },
  {
    title: "3. Our role: controller and processor",
    paragraphs: [
      "In some situations, we act as a data controller. This means we decide how and why certain personal data is processed. For example, we are the controller when you create a NivaDesk account, contact us, subscribe to updates, pay for a plan, or use our website.",
      "In other situations, we act as a data processor. This means we process data on behalf of our customers. For example, if a business uses NivaDesk to store its own client names, order details, files, notes, addresses, tasks, or workflow information, that business is usually the controller of that data, and we process it according to their instructions.",
      "If your personal data was added to NivaDesk by one of our customers, please contact that customer first if you want to exercise your rights regarding that data."
    ]
  },
  {
    title: "4. Personal data we collect",
    paragraphs: ["We may collect the following types of personal data."],
    subsections: [
      {
        title: "4.1 Account and profile data",
        paragraphs: ["When you create or use a NivaDesk account, we may collect:"],
        bullets: [
          "name;",
          "email address;",
          "password or authentication information;",
          "profile photo or avatar;",
          "company or workspace name;",
          "role within a workspace;",
          "language, timezone, and app preferences;",
          "login method, such as email/password, Google sign-in, or Apple sign-in."
        ]
      },
      {
        title: "4.2 Workspace and business content",
        paragraphs: ["When you use NivaDesk, you or your team may add content such as:"],
        bullets: [
          "customer or client details;",
          "order details;",
          "workflow status;",
          "order notes;",
          "customer notes;",
          "task lists and reminders;",
          "delivery dates and timelines;",
          "addresses;",
          "uploaded files;",
          "images, PDFs, design files, documents, and attachments;",
          "team member roles and access permissions;",
          "history logs and activity records."
        ]
      },
      {
        title: "",
        paragraphs: ["You are responsible for ensuring that any personal data you upload to NivaDesk has been collected and added lawfully."]
      },
      {
        title: "4.3 Payment and subscription data",
        paragraphs: ["If you purchase a paid plan, we or our payment providers may process:"],
        bullets: [
          "billing name;",
          "billing address;",
          "email address;",
          "payment method information;",
          "subscription plan;",
          "invoices and transaction history;",
          "tax or accounting information where required."
        ]
      },
      {
        title: "",
        paragraphs: [
          "We do not store full card numbers ourselves. Payment details are processed by third-party payment providers such as Stripe, Apple, Google, or other payment platforms depending on how you subscribe."
        ]
      },
      {
        title: "4.4 Device, usage, and technical data",
        paragraphs: ["When you use our website or apps, we may collect:"],
        bullets: [
          "IP address;",
          "device type;",
          "operating system;",
          "browser type;",
          "app version;",
          "crash reports;",
          "log-in times;",
          "pages or features used;",
          "performance and diagnostic data;",
          "approximate location based on IP address;",
          "cookies and similar technologies."
        ]
      },
      {
        title: "",
        paragraphs: [
          "This helps us keep NivaDesk secure, improve performance, fix bugs, and understand how users interact with our services."
        ]
      },
      {
        title: "4.5 Communication data",
        paragraphs: ["If you contact us, we may collect:"],
        bullets: [
          "your name;",
          "email address;",
          "message content;",
          "support requests;",
          "feedback;",
          "attachments or screenshots you send us;",
          "records of our communication with you."
        ]
      },
      {
        title: "4.6 Data from third-party login or integrations",
        paragraphs: [
          "If you choose to sign in with or connect a third-party service, such as Google or Apple, we may receive limited information from that service, such as:"
        ],
        bullets: [
          "name;",
          "email address;",
          "profile image;",
          "authentication identifier."
        ]
      },
      {
        title: "",
        paragraphs: [
          "If future NivaDesk integrations allow access to services such as calendar, files, email, storage, or other business tools, we will only access the data needed to provide the feature you choose to use."
        ]
      }
    ]
  },
  {
    title: "5. How we use personal data",
    paragraphs: ["We use personal data to:"],
    bullets: [
      "create and manage your account;",
      "provide access to NivaDesk;",
      "create and manage workspaces;",
      "store and sync orders, clients, tasks, files, notes, timelines, and workflow information;",
      "manage team roles and permissions;",
      "provide customer support;",
      "process payments and subscriptions;",
      "send service-related emails;",
      "improve app performance and reliability;",
      "detect bugs, abuse, fraud, or security issues;",
      "comply with legal, tax, accounting, and regulatory obligations;",
      "understand how users use our website and services;",
      "send product updates or marketing communications where permitted."
    ],
    subsections: [
      {
        title: "",
        paragraphs: ["We will not use your workspace content to advertise to your customers."]
      }
    ]
  },
  {
    title: "6. Legal bases for processing",
    paragraphs: ["Where UK GDPR or EU GDPR applies, we rely on the following legal bases:"],
    subsections: [
      {
        title: "Contract",
        paragraphs: ["We process data when necessary to provide NivaDesk to you, manage your account, process payments, and deliver features you request."]
      },
      {
        title: "Legitimate interests",
        paragraphs: ["We may process data for our legitimate business interests, including improving NivaDesk, preventing misuse, securing our services, responding to support requests, and understanding product usage."]
      },
      {
        title: "Consent",
        paragraphs: ["We may rely on consent for optional features, marketing emails, cookies that are not strictly necessary, or certain third-party integrations."]
      },
      {
        title: "Legal obligation",
        paragraphs: ["We may process data when required to comply with law, tax, accounting, security, fraud prevention, or regulatory obligations."]
      }
    ]
  },
  {
    title: "7. Workspace content and uploaded files",
    paragraphs: [
      "NivaDesk allows users to upload and store business files, client files, documents, images, PDFs, design files, and other materials.",
      "We process uploaded files only to provide the service, including:"
    ],
    bullets: [
      "storing files;",
      "displaying files in your workspace;",
      "syncing files across your devices;",
      "allowing downloads;",
      "applying workspace permissions;",
      "creating metadata such as file name, upload date, file size, and uploader;",
      "maintaining security and audit logs;",
      "supporting offline access or upload queues where enabled."
    ],
    subsections: [
      {
        title: "",
        paragraphs: [
          "We do not claim ownership of your uploaded content. You retain all rights to the content you upload, subject to the rights you grant us to operate and provide the service.",
          "Client Files and cloud-stored message attachments require an active eligible paid plan to open, preview, download, upload, rename, or delete them through the app. If eligible paid access ends, those files may be retained for up to 90 days so access can be restored if the workspace resubscribes during that period; after the retention period they may be deleted."
        ]
      }
    ]
  },
  {
    title: "8. Team workspaces and permissions",
    paragraphs: ["If you are invited to a NivaDesk workspace, the workspace owner or administrators may be able to:"],
    bullets: [
      "see your name and email address;",
      "assign you a role;",
      "control your access;",
      "view your activity within the workspace;",
      "remove your access;",
      "manage shared workspace content."
    ],
    subsections: [
      {
        title: "",
        paragraphs: ["If you add another user to a workspace, you confirm that you have permission to provide their email address or other relevant information."]
      }
    ]
  },
  {
    title: "9. Google, Apple, and third-party sign-in",
    paragraphs: [
      "If you sign in using Google, Apple, or another supported authentication provider, we use the information provided by that service only to authenticate you and provide access to your account.",
      "We do not receive or store your Google or Apple password.",
      "If we later offer additional Google, Apple, calendar, email, file, or cloud integrations, we will only request access to the information needed for the feature and will use that information only to provide or improve the user-facing feature you choose to enable.",
      "We will not use data from connected third-party services for advertising or sell that data to third parties."
    ]
  },
  {
    title: "10. ChatGPT App and connected AI features",
    paragraphs: [
      "NivaDesk may offer a ChatGPT App or connected AI feature that allows you to connect your NivaDesk workspace to ChatGPT or a similar assistant through a secure OAuth connection and MCP server.",
      "If you choose to connect NivaDesk to ChatGPT, the assistant may request workspace data only for the workspace you select and only for the tools and permissions you authorise. Access remains subject to your NivaDesk plan, workspace role, feature permissions, and security rules.",
      "Depending on the tools enabled for your account, ChatGPT may be able to search, summarise, create, or update NivaDesk records such as orders, order details, dashboard summaries, financial fields, tasks, order notes, personal notes, messages, quick replies, workflow status, due dates, customer information, internal IDs, timestamps, and history or audit information.",
      "Financial data, messages, notes, and other sensitive workspace content should only be returned where your NivaDesk role and plan allow access. Write actions, such as creating an order, adding a note, or updating an order status, should only happen after your request or confirmation.",
      "We use the ChatGPT connection to provide the integration you choose to enable. We do not sell your workspace content or use it to advertise to your customers. You can disconnect or stop using the connected feature where the product provides that option."
    ]
  },
  {
    title: "11. Payments and subscriptions",
    paragraphs: [
      "Payments may be processed by third-party providers such as Stripe, Apple App Store, Google Play, or other payment platforms.",
      "These providers may collect and process payment information according to their own privacy policies and terms. We receive limited payment and subscription information needed to manage your NivaDesk plan, invoices, renewals, cancellations, refunds, and account status."
    ]
  },
  {
    title: "12. Cookies and analytics",
    paragraphs: ["Our website and services may use cookies or similar technologies to:"],
    bullets: [
      "keep you signed in;",
      "remember preferences;",
      "improve security;",
      "understand website usage;",
      "measure performance;",
      "improve the product."
    ],
    subsections: [
      {
        title: "",
        paragraphs: [
          "Some cookies are necessary for the service to work. Others, such as analytics or marketing cookies, may depend on your consent where required by law.",
          "You can manage cookies through your browser settings. Disabling some cookies may affect the functionality of our website or app."
        ]
      }
    ]
  },
  {
    title: "13. Marketing communications",
    paragraphs: [
      "We may send you emails about product updates, feature announcements, offers, or news about NivaDesk.",
      "You can unsubscribe from marketing emails at any time by using the unsubscribe link or contacting us.",
      "Even if you unsubscribe from marketing emails, we may still send important service emails, such as account, billing, security, subscription, or legal notices."
    ]
  },
  {
    title: "14. Who we share personal data with",
    paragraphs: [
      "We do not sell your personal data.",
      "We may share personal data with trusted third parties only when necessary to operate, support, secure, or improve NivaDesk. These may include:"
    ],
    bullets: [
      "hosting and cloud infrastructure providers;",
      "database and storage providers;",
      "authentication providers;",
      "payment processors;",
      "analytics and performance tools;",
      "customer support tools;",
      "email delivery providers;",
      "error monitoring and crash reporting services;",
      "accountants, lawyers, or professional advisers;",
      "authorities where required by law."
    ],
    subsections: [
      {
        title: "",
        paragraphs: ["We only provide service providers with the information they need to perform their services for us."]
      }
    ]
  },
  {
    title: "15. International transfers",
    paragraphs: [
      "Your data may be stored or processed in the United Kingdom, European Economic Area, United States, or other countries where our service providers operate.",
      "Where personal data is transferred outside the UK or EEA, we use appropriate safeguards where required, such as adequacy decisions, standard contractual clauses, the UK International Data Transfer Agreement, or other lawful transfer mechanisms."
    ]
  },
  {
    title: "16. Security",
    paragraphs: ["We take reasonable technical and organisational measures to protect personal data, including:"],
    bullets: [
      "secure authentication;",
      "restricted access controls;",
      "encrypted connections where appropriate;",
      "role-based workspace permissions;",
      "cloud security controls;",
      "monitoring for errors and abuse;",
      "backups and operational safeguards;",
      "limiting access to personal data to those who need it."
    ],
    subsections: [
      {
        title: "",
        paragraphs: [
          "However, no system is completely secure. We cannot guarantee that personal data will always remain completely secure, but we work to protect it and respond appropriately if a security issue occurs."
        ]
      }
    ]
  },
  {
    title: "17. Data retention",
    paragraphs: [
      "We keep personal data only for as long as necessary for the purposes described in this Privacy Policy.",
      "In general:"
    ],
    bullets: [
      "account data is kept while your account is active;",
      "workspace content is kept while the workspace or account remains active;",
      "billing and invoice data may be kept for legal, tax, and accounting requirements;",
      "support messages may be kept to help us respond to your request and improve support;",
      "technical logs may be kept for a limited period for security and troubleshooting;",
      "deleted data may remain in backups for a limited time before being permanently removed;",
      "Client Files and cloud-stored message attachments whose paid access has ended may be retained for up to 90 days for restoration upon resubscription, after which they may be deleted."
    ],
    subsections: [
      {
        title: "",
        paragraphs: [
          "If you delete your account or request deletion, we will delete or anonymise personal data unless we need to keep it for legal, security, accounting, dispute resolution, or legitimate business reasons."
        ]
      }
    ]
  },
  {
    title: "18. Account deletion and data export",
    paragraphs: [
      "You may request account deletion by contacting us.",
      "Before deleting your account, we may need to verify your identity. If you are part of a workspace owned by someone else, we may need to direct you to the workspace owner for deletion of workspace content.",
      "Where available, you may export your data from within NivaDesk. We believe customers should be able to access and export their own business data, even if their plan changes or expires, subject to reasonable technical and security limits."
    ]
  },
  {
    title: "19. Your rights",
    paragraphs: ["Depending on where you live, you may have rights under data protection law, including the right to:"],
    bullets: [
      "access the personal data we hold about you;",
      "request correction of inaccurate data;",
      "request deletion of your data;",
      "object to certain processing;",
      "restrict processing;",
      "request data portability;",
      "withdraw consent where processing is based on consent;",
      "opt out of marketing communications;",
      "lodge a complaint with a data protection authority."
    ],
    subsections: [
      {
        title: "",
        paragraphs: [
          "If you are in the UK, you can contact the Information Commissioner's Office at ico.org.uk.",
          "To exercise your rights, contact us at: contact@nivadesk.co.uk",
          "We may ask for information to verify your identity before responding to a request."
        ]
      }
    ]
  },
  {
    title: "20. Children",
    paragraphs: [
      "NivaDesk is not intended for children. We do not knowingly collect personal data from children.",
      "If you believe a child has provided personal data to us, please contact us and we will take appropriate steps to delete it."
    ]
  },
  {
    title: "21. Third-party websites and services",
    paragraphs: [
      "NivaDesk may contain links to third-party websites, services, integrations, or payment providers.",
      "We are not responsible for the privacy practices of third parties. You should review their privacy policies before using their services."
    ]
  },
  {
    title: "22. Changes to this Privacy Policy",
    paragraphs: [
      "We may update this Privacy Policy from time to time.",
      "If we make material changes, we may notify you by email, in-app notice, or by updating the date at the top of this page.",
      "Your continued use of NivaDesk after the updated Privacy Policy becomes effective means you accept the updated policy."
    ]
  },
  {
    title: "23. Contact us",
    paragraphs: [
      "If you have questions about this Privacy Policy, your personal data, or your rights, please contact:",
      "EGGCRAFT LIMITED\n141 Randolph Avenue\nLondon\nW9 1DN\nUnited Kingdom",
      "Email: contact@nivadesk.co.uk"
    ]
  }
];

const EXTRA_LOCALIZED_PRIVACY_POLICIES = {
  "Русский (Russian)": {
    lastUpdatedLabel: "Последнее обновление",
    sections: [
      {
        title: "1. Кто мы",
        paragraphs: [
          "NivaDesk управляется компанией:",
          "EGGCRAFT LIMITED\n141 Randolph Avenue\nLondon\nW9 1DN\nUnited Kingdom",
          "Email: contact@nivadesk.co.uk",
          "По вопросам конфиденциальности, запросам данных или удалению аккаунта свяжитесь с нами по email."
        ]
      },
      {
        title: "2. Что охватывает эта Политика конфиденциальности",
        paragraphs: ["Эта Политика применяется к нашему сайту, веб-приложению NivaDesk, мобильным и настольным приложениям, регистрации, входу, поддержке, платежам, подпискам, загруженным файлам, клиентским файлам, заказам, заметкам, задачам, workflow-данным, содержимому workspace и подключенным интеграциям. Она не применяется к сервисам, которыми мы не владеем и которые не контролируем."]
      },
      {
        title: "3. Наша роль: контролер и обработчик",
        paragraphs: ["В некоторых случаях мы являемся контролером данных, например для аккаунта, сайта, поддержки или платежей. В других случаях мы обрабатываем данные от имени клиентов, когда студия хранит клиентов, заказы, файлы или задачи в NivaDesk. Если ваши данные добавлены клиентом NivaDesk, сначала обратитесь к этому клиенту."]
      },
      {
        title: "4. Какие персональные данные мы собираем",
        paragraphs: ["Мы можем собирать данные аккаунта и профиля, содержимое workspace и бизнеса, сведения о клиентах и заказах, заметки, задачи, файлы, данные платежей и подписок, технические данные, данные устройства и использования, сообщения поддержки, а также данные из Google, Apple или других интеграций."]
      },
      {
        title: "5. Как мы используем персональные данные",
        paragraphs: ["Мы используем данные для создания и управления аккаунтами и workspace, хранения и синхронизации заказов, файлов, задач и workflows, управления ролями, поддержки, платежей, сервисных писем, повышения безопасности и производительности и соблюдения закона. Мы не используем содержимое workspace для рекламы вашим клиентам."]
      },
      {
        title: "6. Правовые основания обработки",
        paragraphs: ["Если применяется UK GDPR или EU GDPR, мы опираемся на договор, законные интересы, согласие и юридические обязанности, включая предоставление NivaDesk, безопасность, дополнительные функции, маркетинг, cookies, интеграции, налоговые и бухгалтерские требования."]
      },
      {
        title: "7. Содержимое workspace и загруженные файлы",
        paragraphs: ["NivaDesk позволяет загружать рабочие файлы, клиентские файлы, изображения, PDF, дизайн-файлы и документы. Мы обрабатываем их для хранения, отображения, синхронизации, скачивания, применения разрешений, создания метаданных и поддержки безопасности. Мы не претендуем на право собственности на загруженный контент."]
      },
      {
        title: "8. Командные workspaces и разрешения",
        paragraphs: ["Владельцы и администраторы workspace могут видеть и управлять вашим именем, email, ролью, доступом и активностью в workspace. При приглашении другого пользователя вы подтверждаете, что имеете право предоставить его данные."]
      },
      {
        title: "9. Вход через Google, Apple и третьих лиц",
        paragraphs: ["Если вы входите через Google, Apple или другого провайдера, мы используем полученные данные только для аутентификации и доступа к аккаунту. Мы не получаем и не храним ваш пароль Google или Apple. Данные подключенных сервисов не используются для рекламы и не продаются."]
      },
      {
        title: "10. Платежи и подписки",
        paragraphs: ["Платежи могут обрабатываться Stripe, Apple App Store, Google Play или другими платформами. Эти провайдеры обрабатывают платежные данные по своим правилам. Мы получаем только сведения, необходимые для управления планом, счетами, продлениями, отменами, возвратами и статусом аккаунта."]
      },
      {
        title: "11. Cookies и аналитика",
        paragraphs: ["Наш сайт и сервисы могут использовать cookies или похожие технологии для сохранения входа, запоминания настроек, повышения безопасности, понимания использования, измерения производительности и улучшения продукта. Некоторые необязательные cookies могут зависеть от вашего согласия."]
      },
      {
        title: "12. Маркетинговые сообщения",
        paragraphs: ["Мы можем отправлять письма об обновлениях, функциях, предложениях или новостях NivaDesk. Вы можете отказаться от маркетинга в любое время. Важные письма об аккаунте, оплате, безопасности, подписке или юридических уведомлениях мы можем отправлять и далее."]
      },
      {
        title: "13. С кем мы делимся персональными данными",
        paragraphs: ["Мы не продаем ваши персональные данные. Мы делимся ими только с надежными поставщиками, когда это необходимо для работы, поддержки, защиты или улучшения NivaDesk: хостинг, базы данных, хранение, аутентификация, платежи, аналитика, поддержка, email, мониторинг ошибок, консультанты или органы власти, если требуется законом."]
      },
      {
        title: "14. Международные передачи",
        paragraphs: ["Ваши данные могут храниться или обрабатываться в Великобритании, ЕЭЗ, США или других странах, где работают наши поставщики. При необходимости мы используем подходящие меры защиты для передач за пределы UK или EEA."]
      },
      {
        title: "15. Безопасность",
        paragraphs: ["Мы применяем разумные технические и организационные меры, включая безопасную аутентификацию, контроль доступа, шифрованные соединения, ролевые разрешения, cloud-контроли, мониторинг, резервные копии и ограничение доступа. Но ни одна система не является полностью безопасной."]
      },
      {
        title: "16. Хранение данных",
        paragraphs: ["Мы храним персональные данные только столько, сколько необходимо. Данные аккаунта и workspace хранятся пока они активны; платежные данные могут храниться для налоговых и бухгалтерских обязанностей; удаленные данные могут временно оставаться в резервных копиях."]
      },
      {
        title: "17. Удаление аккаунта и экспорт данных",
        paragraphs: ["Вы можете запросить удаление аккаунта. Нам может потребоваться подтвердить вашу личность. Если вы часть workspace другого владельца, за содержимое может отвечать владелец workspace. Где доступно, вы можете экспортировать данные из NivaDesk, даже если план изменился или истек."]
      },
      {
        title: "18. Ваши права",
        paragraphs: ["В зависимости от места проживания у вас могут быть права на доступ, исправление, удаление, возражение, ограничение, переносимость, отзыв согласия, отказ от маркетинга и жалобу в орган по защите данных. В UK можно обратиться в ICO на ico.org.uk. Для реализации прав пишите на contact@nivadesk.co.uk."]
      },
      {
        title: "19. Дети",
        paragraphs: ["NivaDesk не предназначен для детей. Мы сознательно не собираем персональные данные детей. Если вы считаете, что ребенок передал нам данные, свяжитесь с нами."]
      },
      {
        title: "20. Сайты и сервисы третьих лиц",
        paragraphs: ["NivaDesk может содержать ссылки на сайты, сервисы, интеграции или платежных провайдеров третьих лиц. Мы не отвечаем за их практики конфиденциальности. Ознакомьтесь с их политиками."]
      },
      {
        title: "21. Изменения этой Политики",
        paragraphs: ["Мы можем время от времени обновлять эту Политику. При существенных изменениях мы можем уведомить вас по email, в приложении или обновив дату на этой странице."]
      },
      {
        title: "22. Контакты",
        paragraphs: [
          "Если у вас есть вопросы об этой Политике, ваших данных или правах, свяжитесь с нами:",
          "EGGCRAFT LIMITED\n141 Randolph Avenue\nLondon\nW9 1DN\nUnited Kingdom",
          "Email: contact@nivadesk.co.uk"
        ]
      }
    ]
  },
  "日本語 (Japanese)": {
    lastUpdatedLabel: "最終更新日",
    sections: [
      {
        title: "1. 運営者",
        paragraphs: [
          "NivaDesk は以下により運営されています。",
          "EGGCRAFT LIMITED\n141 Randolph Avenue\nLondon\nW9 1DN\nUnited Kingdom",
          "Email: contact@nivadesk.co.uk",
          "プライバシーに関する質問、データ請求、アカウント削除請求はメールでお問い合わせください。"
        ]
      },
      {
        title: "2. 本プライバシーポリシーの対象",
        paragraphs: ["本ポリシーは、当社ウェブサイト、NivaDesk Webアプリ、モバイルおよびデスクトップアプリ、登録、ログイン、サポート、支払い、サブスクリプション、アップロードファイル、クライアントファイル、注文、メモ、タスク、ワークフローデータ、workspaceコンテンツ、接続された連携に適用されます。当社が所有または管理しないサービスには適用されません。"]
      },
      {
        title: "3. 当社の役割：管理者と処理者",
        paragraphs: ["アカウント、ウェブサイト、サポート、支払いなどでは当社がデータ管理者となる場合があります。一方、スタジオが NivaDesk に顧客、注文、ファイル、タスクを保存する場合、当社は顧客の指示に従ってデータを処理します。あなたのデータが NivaDesk の顧客により追加された場合は、まずその顧客に連絡してください。"]
      },
      {
        title: "4. 収集する個人データ",
        paragraphs: ["当社は、アカウントとプロフィール情報、workspaceおよび業務コンテンツ、顧客と注文の詳細、メモ、タスク、ファイル、支払いとサブスクリプション情報、端末・利用・技術データ、サポート連絡、Google、Apple、その他連携からのデータを収集する場合があります。"]
      },
      {
        title: "5. 個人データの利用方法",
        paragraphs: ["当社は、アカウントとworkspaceの提供、注文・ファイル・タスク・workflowの保存と同期、権限管理、サポート、支払い処理、サービスメール送信、安全性と性能の改善、法令遵守のためにデータを使用します。workspaceコンテンツをあなたの顧客への広告に使用することはありません。"]
      },
      {
        title: "6. 処理の法的根拠",
        paragraphs: ["UK GDPR または EU GDPR が適用される場合、契約、正当な利益、同意、法的義務に基づいて処理します。これには NivaDesk の提供、安全性、任意機能、マーケティング、cookies、連携、税務・会計義務が含まれます。"]
      },
      {
        title: "7. Workspaceコンテンツとアップロードファイル",
        paragraphs: ["NivaDesk では業務ファイル、クライアントファイル、画像、PDF、デザインファイル、文書をアップロードできます。当社は保存、表示、同期、ダウンロード、権限適用、メタデータ作成、安全性維持のために処理します。アップロードコンテンツの所有権を主張しません。"]
      },
      {
        title: "8. チームworkspaceと権限",
        paragraphs: ["workspaceの所有者や管理者は、あなたの氏名、メール、役割、アクセス、workspace内の活動を確認・管理できます。他のユーザーを招待する場合、その情報を提供する権限があることを確認したものとします。"]
      },
      {
        title: "9. Google、Apple、第三者ログイン",
        paragraphs: ["Google、Apple、その他プロバイダーでログインする場合、受け取る情報は認証とアカウントアクセスのためだけに使用します。GoogleまたはAppleのパスワードは受け取らず保存しません。接続サービスのデータを広告に使用したり販売したりしません。"]
      },
      {
        title: "10. 支払いとサブスクリプション",
        paragraphs: ["支払いは Stripe、Apple App Store、Google Play、その他プラットフォームにより処理される場合があります。これらの事業者は独自のポリシーに従って支払い情報を処理します。当社はプラン、請求書、更新、解約、返金、アカウント状態の管理に必要な情報のみ受け取ります。"]
      },
      {
        title: "11. Cookiesと分析",
        paragraphs: ["当社サイトとサービスは、ログイン維持、設定保存、安全性向上、利用状況把握、性能測定、製品改善のためにcookiesまたは類似技術を使用する場合があります。必須でないcookiesは、法律上必要な場合、同意に基づきます。"]
      },
      {
        title: "12. マーケティング連絡",
        paragraphs: ["製品更新、機能、オファー、NivaDeskニュースに関するメールを送る場合があります。いつでも配信停止できます。ただしアカウント、請求、安全性、サブスクリプション、法的通知など重要なサービスメールは送信される場合があります。"]
      },
      {
        title: "13. 個人データの共有先",
        paragraphs: ["当社は個人データを販売しません。NivaDeskの運営、サポート、安全性、改善に必要な場合に限り、ホスティング、データベース、ストレージ、認証、決済、分析、サポート、メール、エラー監視、専門家、法令上必要な当局など信頼できる第三者と共有します。"]
      },
      {
        title: "14. 国際移転",
        paragraphs: ["データは英国、EEA、米国、または当社サービスプロバイダーが運営するその他の国で保存・処理される場合があります。必要に応じて、英国またはEEA外への移転に適切な保護措置を使用します。"]
      },
      {
        title: "15. セキュリティ",
        paragraphs: ["当社は、安全な認証、アクセス制御、暗号化接続、役割ベース権限、cloudセキュリティ、監視、バックアップ、必要な者へのアクセス制限など合理的な措置を講じます。ただし完全に安全なシステムはありません。"]
      },
      {
        title: "16. データ保持",
        paragraphs: ["個人データは必要な期間のみ保持します。アカウントとworkspaceデータは有効な間保持され、請求データは税務・会計義務のため保持される場合があり、削除データは一定期間バックアップに残る場合があります。"]
      },
      {
        title: "17. アカウント削除とデータエクスポート",
        paragraphs: ["アカウント削除を請求できます。本人確認が必要な場合があります。他者所有のworkspaceに属する場合、コンテンツはworkspace所有者が管理することがあります。利用可能な場合、プラン変更や期限切れ後も NivaDesk からデータをエクスポートできます。"]
      },
      {
        title: "18. あなたの権利",
        paragraphs: ["居住地により、アクセス、訂正、削除、異議、制限、ポータビリティ、同意撤回、マーケティング停止、監督機関への苦情の権利があります。英国では ico.org.uk の ICO に連絡できます。権利行使は contact@nivadesk.co.uk へご連絡ください。"]
      },
      {
        title: "19. 子ども",
        paragraphs: ["NivaDesk は子ども向けではありません。当社は子どもから個人データを意図的に収集しません。子どもがデータを提供したと思われる場合はご連絡ください。"]
      },
      {
        title: "20. 第三者サイトとサービス",
        paragraphs: ["NivaDesk には第三者サイト、サービス、連携、決済事業者へのリンクが含まれる場合があります。当社は第三者のプライバシー実務について責任を負いません。各ポリシーをご確認ください。"]
      },
      {
        title: "21. 本ポリシーの変更",
        paragraphs: ["当社は本ポリシーを随時更新する場合があります。重要な変更がある場合、メール、アプリ内通知、またはこのページの日付更新によりお知らせすることがあります。"]
      },
      {
        title: "22. お問い合わせ",
        paragraphs: [
          "本ポリシー、個人データ、権利について質問がある場合はお問い合わせください。",
          "EGGCRAFT LIMITED\n141 Randolph Avenue\nLondon\nW9 1DN\nUnited Kingdom",
          "Email: contact@nivadesk.co.uk"
        ]
      }
    ]
  },
  "中文 (Chinese)": {
    lastUpdatedLabel: "最后更新",
    sections: [
      {
        title: "1. 我们是谁",
        paragraphs: [
          "NivaDesk 由以下公司运营：",
          "EGGCRAFT LIMITED\n141 Randolph Avenue\nLondon\nW9 1DN\nUnited Kingdom",
          "Email: contact@nivadesk.co.uk",
          "如有隐私问题、数据请求或账户删除请求，请通过电子邮件联系我们。"
        ]
      },
      {
        title: "2. 本隐私政策的适用范围",
        paragraphs: ["本政策适用于我们的网站、NivaDesk 网页应用、移动和桌面应用、注册、登录、客户支持、付款、订阅、上传文件、客户文件、订单、备注、任务、工作流数据、workspace 内容以及连接的集成。它不适用于我们不拥有或不控制的网站、应用或服务。"]
      },
      {
        title: "3. 我们的角色：控制者和处理者",
        paragraphs: ["在账户、网站、支持或付款等场景中，我们可能是数据控制者。在客户使用 NivaDesk 保存其客户、订单、文件或任务时，我们通常代表客户处理数据。如果您的数据由某个 NivaDesk 客户添加，请先联系该客户。"]
      },
      {
        title: "4. 我们收集的个人数据",
        paragraphs: ["我们可能收集账户和资料数据、workspace 和业务内容、客户和订单信息、备注、任务、文件、付款和订阅数据、设备、使用和技术数据、支持沟通内容，以及来自 Google、Apple 或其他集成的数据。"]
      },
      {
        title: "5. 我们如何使用个人数据",
        paragraphs: ["我们使用数据来创建和管理账户及 workspace，存储和同步订单、文件、任务和工作流，管理角色，提供支持，处理付款，发送服务邮件，提升安全和性能，并履行法律义务。我们不会使用您的 workspace 内容向您的客户投放广告。"]
      },
      {
        title: "6. 处理的法律依据",
        paragraphs: ["在 UK GDPR 或 EU GDPR 适用时，我们依赖合同、合法利益、同意和法律义务作为处理依据，包括提供 NivaDesk、维护安全、可选功能、营销、cookies、集成以及税务和会计要求。"]
      },
      {
        title: "7. Workspace 内容和上传文件",
        paragraphs: ["NivaDesk 允许上传业务文件、客户文件、图片、PDF、设计文件和文档。我们处理这些内容用于存储、显示、同步、下载、权限控制、元数据创建和安全维护。我们不主张拥有您上传内容的所有权。"]
      },
      {
        title: "8. 团队 workspace 和权限",
        paragraphs: ["workspace 所有者和管理员可以查看和管理您的姓名、邮箱、角色、访问权限和 workspace 内活动。如果您邀请其他用户，即表示您确认有权提供其相关信息。"]
      },
      {
        title: "9. Google、Apple 和第三方登录",
        paragraphs: ["如果您使用 Google、Apple 或其他提供方登录，我们仅使用收到的信息进行身份验证和账户访问。我们不会接收或存储您的 Google 或 Apple 密码，也不会将连接服务的数据用于广告或出售。"]
      },
      {
        title: "10. 付款和订阅",
        paragraphs: ["付款可能由 Stripe、Apple App Store、Google Play 或其他平台处理。这些提供方会根据自己的政策处理付款数据。我们只接收管理计划、发票、续订、取消、退款和账户状态所需的信息。"]
      },
      {
        title: "11. Cookies 和分析",
        paragraphs: ["我们的网站和服务可能使用 cookies 或类似技术来保持登录、记住偏好、提升安全、了解使用情况、衡量性能和改进产品。某些非必要 cookies 可能依法需要您的同意。"]
      },
      {
        title: "12. 营销沟通",
        paragraphs: ["我们可能发送关于 NivaDesk 更新、功能、优惠或新闻的邮件。您可以随时退订营销邮件。即使退订，我们仍可能发送账户、账单、安全、订阅或法律通知等重要服务邮件。"]
      },
      {
        title: "13. 我们与谁共享个人数据",
        paragraphs: ["我们不出售您的个人数据。仅在运营、支持、保护或改进 NivaDesk 所必需时，我们与可信服务提供商共享数据，例如托管、数据库、存储、身份验证、付款、分析、支持、邮件、错误监控、顾问或法律要求的主管机关。"]
      },
      {
        title: "14. 国际传输",
        paragraphs: ["您的数据可能在英国、欧洲经济区、美国或我们的服务提供商运营所在的其他国家存储或处理。在需要时，我们会为 UK 或 EEA 之外的传输使用适当保障措施。"]
      },
      {
        title: "15. 安全",
        paragraphs: ["我们采取合理的技术和组织措施，包括安全身份验证、访问控制、加密连接、基于角色的权限、cloud 安全控制、监控、备份和限制访问。但没有任何系统是完全安全的。"]
      },
      {
        title: "16. 数据保留",
        paragraphs: ["我们仅在必要期间保留个人数据。账户和 workspace 数据会在活跃期间保留；账单数据可能因税务和会计义务而保留；删除的数据可能在备份中短期保留。"]
      },
      {
        title: "17. 账户删除和数据导出",
        paragraphs: ["您可以请求删除账户。我们可能需要验证您的身份。如果您属于他人拥有的 workspace，内容可能由 workspace 所有者管理。在可用时，即使计划变更或到期，您也可以从 NivaDesk 导出数据。"]
      },
      {
        title: "18. 您的权利",
        paragraphs: ["根据居住地，您可能拥有访问、更正、删除、反对、限制、数据可携带、撤回同意、退出营销以及向数据保护机构投诉的权利。在英国可通过 ico.org.uk 联系 ICO。行使权利请写信至 contact@nivadesk.co.uk。"]
      },
      {
        title: "19. 儿童",
        paragraphs: ["NivaDesk 不面向儿童。我们不会有意收集儿童的个人数据。如果您认为儿童向我们提供了数据，请联系我们。"]
      },
      {
        title: "20. 第三方网站和服务",
        paragraphs: ["NivaDesk 可能包含指向第三方网站、服务、集成或付款提供商的链接。我们不对其隐私做法负责。请查看其隐私政策。"]
      },
      {
        title: "21. 本政策的变更",
        paragraphs: ["我们可能不时更新本政策。如有重大变更，我们可能通过电子邮件、应用内通知或更新本页日期来告知您。"]
      },
      {
        title: "22. 联系我们",
        paragraphs: [
          "如果您对本政策、个人数据或您的权利有疑问，请联系：",
          "EGGCRAFT LIMITED\n141 Randolph Avenue\nLondon\nW9 1DN\nUnited Kingdom",
          "Email: contact@nivadesk.co.uk"
        ]
      }
    ]
  },
  "العربية (Arabic)": {
    lastUpdatedLabel: "آخر تحديث",
    sections: [
      {
        title: "1. من نحن",
        paragraphs: [
          "يتم تشغيل NivaDesk بواسطة:",
          "EGGCRAFT LIMITED\n141 Randolph Avenue\nLondon\nW9 1DN\nUnited Kingdom",
          "البريد الإلكتروني: contact@nivadesk.co.uk",
          "لأسئلة الخصوصية أو طلبات البيانات أو حذف الحساب، يرجى التواصل معنا عبر البريد الإلكتروني."
        ]
      },
      {
        title: "2. ما الذي تغطيه سياسة الخصوصية هذه",
        paragraphs: ["تنطبق هذه السياسة على موقعنا، وتطبيق NivaDesk على الويب، وتطبيقات الهاتف وسطح المكتب، والتسجيل، وتسجيل الدخول، والدعم، والمدفوعات، والاشتراكات، والملفات المرفوعة، وملفات العملاء، والطلبات، والملاحظات، والمهام، وبيانات سير العمل، ومحتوى workspace، والتكاملات المتصلة. ولا تنطبق على الخدمات التي لا نملكها أو لا نتحكم بها."]
      },
      {
        title: "3. دورنا: متحكم ومعالج",
        paragraphs: ["في بعض الحالات نكون متحكمين في البيانات، مثل الحساب والموقع والدعم والمدفوعات. وفي حالات أخرى نعالج البيانات نيابة عن عملائنا عندما يستخدم استوديو NivaDesk لتخزين العملاء أو الطلبات أو الملفات أو المهام. إذا أضيفت بياناتك بواسطة أحد عملاء NivaDesk، يرجى التواصل معه أولاً."]
      },
      {
        title: "4. البيانات الشخصية التي نجمعها",
        paragraphs: ["قد نجمع بيانات الحساب والملف الشخصي، ومحتوى workspace والعمل، وتفاصيل العملاء والطلبات، والملاحظات، والمهام، والملفات، وبيانات الدفع والاشتراك، وبيانات الجهاز والاستخدام والبيانات التقنية، ورسائل الدعم، وبيانات من Google أو Apple أو تكاملات أخرى."]
      },
      {
        title: "5. كيف نستخدم البيانات الشخصية",
        paragraphs: ["نستخدم البيانات لإنشاء الحسابات وworkspaces وإدارتها، وتخزين ومزامنة الطلبات والملفات والمهام وسير العمل، وإدارة الأدوار، وتقديم الدعم، ومعالجة المدفوعات، وإرسال رسائل الخدمة، وتحسين الأمان والأداء، والامتثال للقانون. لا نستخدم محتوى workspace للإعلان لعملائك."]
      },
      {
        title: "6. الأسس القانونية للمعالجة",
        paragraphs: ["عندما تنطبق UK GDPR أو EU GDPR، نعتمد على العقد، والمصالح المشروعة، والموافقة، والالتزامات القانونية، بما في ذلك تقديم NivaDesk، والأمان، والميزات الاختيارية، والتسويق، وcookies، والتكاملات، ومتطلبات الضرائب والمحاسبة."]
      },
      {
        title: "7. محتوى workspace والملفات المرفوعة",
        paragraphs: ["يسمح NivaDesk برفع ملفات العمل وملفات العملاء والصور وPDF وملفات التصميم والمستندات. نعالجها للتخزين والعرض والمزامنة والتنزيل وتطبيق الصلاحيات وإنشاء metadata والحفاظ على الأمان. لا ندعي ملكية المحتوى الذي ترفعه."]
      },
      {
        title: "8. Workspaces الفريق والصلاحيات",
        paragraphs: ["يمكن لمالكي ومديري workspace رؤية وإدارة اسمك وبريدك الإلكتروني ودورك ووصولك ونشاطك داخل workspace. إذا دعوت مستخدماً آخر، فأنت تؤكد أن لديك إذناً بتقديم معلوماته."]
      },
      {
        title: "9. تسجيل الدخول عبر Google وApple وأطراف ثالثة",
        paragraphs: ["إذا سجلت الدخول عبر Google أو Apple أو مزود آخر، نستخدم المعلومات فقط للمصادقة والوصول للحساب. لا نستلم أو نخزن كلمة مرور Google أو Apple. لا نستخدم بيانات الخدمات المتصلة للإعلانات ولا نبيعها."]
      },
      {
        title: "10. المدفوعات والاشتراكات",
        paragraphs: ["قد تتم معالجة المدفوعات عبر Stripe أو Apple App Store أو Google Play أو منصات أخرى. يعالج هؤلاء المزودون بيانات الدفع وفق سياساتهم. نستلم فقط المعلومات اللازمة لإدارة الخطة والفواتير والتجديدات والإلغاءات والمبالغ المستردة وحالة الحساب."]
      },
      {
        title: "11. Cookies والتحليلات",
        paragraphs: ["قد يستخدم موقعنا وخدماتنا cookies أو تقنيات مشابهة للحفاظ على تسجيل الدخول، وتذكر التفضيلات، وتحسين الأمان، وفهم الاستخدام، وقياس الأداء، وتحسين المنتج. قد تعتمد بعض cookies غير الضرورية على موافقتك حيث يتطلب القانون ذلك."]
      },
      {
        title: "12. رسائل التسويق",
        paragraphs: ["قد نرسل رسائل حول تحديثات وميزات وعروض وأخبار NivaDesk. يمكنك إلغاء الاشتراك في أي وقت. وقد نستمر في إرسال رسائل خدمة مهمة تخص الحساب أو الفوترة أو الأمان أو الاشتراك أو الإشعارات القانونية."]
      },
      {
        title: "13. مع من نشارك البيانات الشخصية",
        paragraphs: ["لا نبيع بياناتك الشخصية. نشاركها فقط مع مزودي خدمات موثوقين عند الحاجة لتشغيل NivaDesk أو دعمه أو حمايته أو تحسينه، مثل الاستضافة، قواعد البيانات، التخزين، المصادقة، المدفوعات، التحليلات، الدعم، البريد، مراقبة الأخطاء، المستشارين أو السلطات عند طلب القانون."]
      },
      {
        title: "14. التحويلات الدولية",
        paragraphs: ["قد يتم تخزين بياناتك أو معالجتها في المملكة المتحدة أو المنطقة الاقتصادية الأوروبية أو الولايات المتحدة أو دول أخرى يعمل فيها مزودونا. عند الحاجة نستخدم ضمانات مناسبة للتحويلات خارج UK أو EEA."]
      },
      {
        title: "15. الأمان",
        paragraphs: ["نتخذ إجراءات تقنية وتنظيمية معقولة، مثل المصادقة الآمنة، وضوابط الوصول، والاتصالات المشفرة، والصلاحيات حسب الدور، وضوابط cloud، والمراقبة، والنسخ الاحتياطي، وتقييد الوصول. لكن لا يوجد نظام آمن تماماً."]
      },
      {
        title: "16. الاحتفاظ بالبيانات",
        paragraphs: ["نحتفظ بالبيانات الشخصية فقط طالما كان ذلك ضرورياً. تُحفظ بيانات الحساب وworkspace أثناء النشاط؛ وقد تُحفظ بيانات الفوترة للضرائب والمحاسبة؛ وقد تبقى البيانات المحذوفة مؤقتاً في النسخ الاحتياطية."]
      },
      {
        title: "17. حذف الحساب وتصدير البيانات",
        paragraphs: ["يمكنك طلب حذف الحساب. قد نحتاج إلى التحقق من هويتك. إذا كنت ضمن workspace يملكه شخص آخر فقد يكون المالك مسؤولاً عن المحتوى. حيثما يتاح، يمكنك تصدير بياناتك من NivaDesk حتى إذا تغيرت خطتك أو انتهت."]
      },
      {
        title: "18. حقوقك",
        paragraphs: ["بحسب مكان إقامتك، قد تكون لديك حقوق الوصول والتصحيح والحذف والاعتراض والتقييد ونقل البيانات وسحب الموافقة وإلغاء التسويق وتقديم شكوى لسلطة حماية البيانات. في المملكة المتحدة يمكنك التواصل مع ICO عبر ico.org.uk. لممارسة الحقوق راسل contact@nivadesk.co.uk."]
      },
      {
        title: "19. الأطفال",
        paragraphs: ["NivaDesk غير موجه للأطفال. لا نجمع عن علم بيانات شخصية من الأطفال. إذا كنت تعتقد أن طفلاً قدم لنا بيانات، يرجى التواصل معنا."]
      },
      {
        title: "20. مواقع وخدمات الأطراف الثالثة",
        paragraphs: ["قد يحتوي NivaDesk على روابط لمواقع أو خدمات أو تكاملات أو مزودي دفع من أطراف ثالثة. لسنا مسؤولين عن ممارسات الخصوصية لديهم. يرجى مراجعة سياساتهم."]
      },
      {
        title: "21. تغييرات هذه السياسة",
        paragraphs: ["قد نحدّث هذه السياسة من وقت لآخر. إذا أجرينا تغييرات جوهرية، فقد نخطرك بالبريد الإلكتروني أو داخل التطبيق أو بتحديث تاريخ هذه الصفحة."]
      },
      {
        title: "22. اتصل بنا",
        paragraphs: [
          "إذا كانت لديك أسئلة حول هذه السياسة أو بياناتك أو حقوقك، يرجى التواصل مع:",
          "EGGCRAFT LIMITED\n141 Randolph Avenue\nLondon\nW9 1DN\nUnited Kingdom",
          "Email: contact@nivadesk.co.uk"
        ]
      }
    ]
  },
  "हिन्दी (Hindi)": {
    lastUpdatedLabel: "अंतिम अपडेट",
    sections: [
      {
        title: "1. हम कौन हैं",
        paragraphs: [
          "NivaDesk का संचालन इस कंपनी द्वारा किया जाता है:",
          "EGGCRAFT LIMITED\n141 Randolph Avenue\nLondon\nW9 1DN\nUnited Kingdom",
          "Email: contact@nivadesk.co.uk",
          "गोपनीयता प्रश्न, डेटा अनुरोध या अकाउंट हटाने के अनुरोध के लिए कृपया हमें ईमेल करें।"
        ]
      },
      {
        title: "2. यह Privacy Policy क्या कवर करती है",
        paragraphs: ["यह Policy हमारी वेबसाइट, NivaDesk web app, mobile और desktop apps, registration, login, support, payments, subscriptions, uploaded files, client files, orders, notes, tasks, workflow data, workspace content और connected integrations पर लागू होती है। यह उन services पर लागू नहीं होती जिन्हें हम own या control नहीं करते।"]
      },
      {
        title: "3. हमारी भूमिका: controller और processor",
        paragraphs: ["कुछ स्थितियों में हम data controller होते हैं, जैसे account, website, support या payments के लिए। दूसरी स्थितियों में हम customers की ओर से data process करते हैं, जैसे कोई studio NivaDesk में clients, orders, files या tasks store करता है। यदि आपका data किसी NivaDesk customer ने जोड़ा है, तो कृपया पहले उस customer से संपर्क करें।"]
      },
      {
        title: "4. हम कौन सा personal data collect करते हैं",
        paragraphs: ["हम account और profile data, workspace और business content, client और order details, notes, tasks, files, payment और subscription data, device, usage और technical data, support communications, तथा Google, Apple या अन्य integrations से data collect कर सकते हैं।"]
      },
      {
        title: "5. हम personal data का उपयोग कैसे करते हैं",
        paragraphs: ["हम data का उपयोग accounts और workspaces बनाने और manage करने, orders, files, tasks और workflows store और sync करने, roles manage करने, support देने, payments process करने, service emails भेजने, security और performance सुधारने और legal obligations पूरा करने के लिए करते हैं। हम workspace content का उपयोग आपके customers को advertising दिखाने के लिए नहीं करते।"]
      },
      {
        title: "6. Processing के legal bases",
        paragraphs: ["जहाँ UK GDPR या EU GDPR लागू होता है, हम contract, legitimate interests, consent और legal obligation पर निर्भर करते हैं, जिसमें NivaDesk देना, security, optional features, marketing, cookies, integrations, tax और accounting requirements शामिल हैं।"]
      },
      {
        title: "7. Workspace content और uploaded files",
        paragraphs: ["NivaDesk business files, client files, images, PDFs, design files और documents upload करने देता है। हम उन्हें storage, display, sync, download, permissions, metadata और security के लिए process करते हैं। हम आपके uploaded content पर ownership claim नहीं करते।"]
      },
      {
        title: "8. Team workspaces और permissions",
        paragraphs: ["Workspace owners और admins आपका name, email, role, access और workspace activity देख और manage कर सकते हैं। यदि आप किसी user को invite करते हैं, तो आप confirm करते हैं कि आपके पास उसकी जानकारी देने की permission है।"]
      },
      {
        title: "9. Google, Apple और third-party sign-in",
        paragraphs: ["यदि आप Google, Apple या किसी अन्य provider से sign in करते हैं, तो हम मिली जानकारी केवल authentication और account access के लिए उपयोग करते हैं। हम आपका Google या Apple password receive या store नहीं करते। Connected services का data advertising के लिए उपयोग या sell नहीं किया जाता।"]
      },
      {
        title: "10. Payments और subscriptions",
        paragraphs: ["Payments Stripe, Apple App Store, Google Play या अन्य platforms द्वारा process हो सकते हैं। ये providers अपने policies के अनुसार payment data process करते हैं। हमें plan, invoices, renewals, cancellations, refunds और account status manage करने के लिए आवश्यक limited information मिलती है।"]
      },
      {
        title: "11. Cookies और analytics",
        paragraphs: ["हमारी website और services login बनाए रखने, preferences याद रखने, security सुधारने, usage समझने, performance मापने और product सुधारने के लिए cookies या similar technologies इस्तेमाल कर सकती हैं। कुछ non-essential cookies consent पर निर्भर हो सकती हैं।"]
      },
      {
        title: "12. Marketing communications",
        paragraphs: ["हम आपको NivaDesk updates, features, offers या news के emails भेज सकते हैं। आप कभी भी unsubscribe कर सकते हैं। फिर भी account, billing, security, subscription या legal notices जैसे important service emails भेजे जा सकते हैं।"]
      },
      {
        title: "13. हम personal data किसके साथ share करते हैं",
        paragraphs: ["हम आपका personal data sell नहीं करते। हम data केवल trusted service providers के साथ share करते हैं जब NivaDesk operate, support, secure या improve करने के लिए जरूरी हो, जैसे hosting, database, storage, authentication, payments, analytics, support, email, error monitoring, advisers या law द्वारा required authorities."]
      },
      {
        title: "14. International transfers",
        paragraphs: ["आपका data UK, EEA, United States या हमारे service providers के operating countries में store या process हो सकता है। जरूरत होने पर UK या EEA से बाहर transfers के लिए suitable safeguards इस्तेमाल किए जाते हैं।"]
      },
      {
        title: "15. Security",
        paragraphs: ["हम reasonable technical और organisational measures लेते हैं, जैसे secure authentication, access controls, encrypted connections, role-based permissions, cloud security controls, monitoring, backups और limited access। कोई भी system पूरी तरह secure नहीं होता।"]
      },
      {
        title: "16. Data retention",
        paragraphs: ["हम personal data केवल उतने समय तक रखते हैं जितना आवश्यक हो। Account और workspace data active रहने तक रखा जाता है; billing data tax और accounting obligations के लिए रखा जा सकता है; deleted data कुछ समय backups में रह सकता है।"]
      },
      {
        title: "17. Account deletion और data export",
        paragraphs: ["आप account deletion request कर सकते हैं। हमें आपकी identity verify करनी पड़ सकती है। यदि आप किसी और के workspace का हिस्सा हैं, तो content के लिए workspace owner responsible हो सकता है। जहाँ उपलब्ध हो, आप NivaDesk से अपना data export कर सकते हैं, भले plan बदल जाए या expire हो जाए।"]
      },
      {
        title: "18. आपके अधिकार",
        paragraphs: ["आपके location के अनुसार आपको access, correction, deletion, objection, restriction, portability, consent withdrawal, marketing opt-out और data protection authority में complaint के अधिकार मिल सकते हैं। UK में ICO से ico.org.uk पर संपर्क कर सकते हैं। Rights exercise करने के लिए contact@nivadesk.co.uk पर लिखें।"]
      },
      {
        title: "19. Children",
        paragraphs: ["NivaDesk बच्चों के लिए नहीं है। हम जानबूझकर बच्चों से personal data collect नहीं करते। यदि आपको लगता है कि किसी बच्चे ने हमें data दिया है, तो कृपया contact करें।"]
      },
      {
        title: "20. Third-party websites और services",
        paragraphs: ["NivaDesk में third-party websites, services, integrations या payment providers के links हो सकते हैं। हम उनकी privacy practices के लिए responsible नहीं हैं। कृपया उनकी policies देखें।"]
      },
      {
        title: "21. इस Policy में बदलाव",
        paragraphs: ["हम समय-समय पर इस Policy को update कर सकते हैं। Material changes होने पर हम email, in-app notice या इस page की date update करके सूचना दे सकते हैं।"]
      },
      {
        title: "22. Contact us",
        paragraphs: [
          "यदि इस Policy, आपके data या rights के बारे में प्रश्न हैं, तो contact करें:",
          "EGGCRAFT LIMITED\n141 Randolph Avenue\nLondon\nW9 1DN\nUnited Kingdom",
          "Email: contact@nivadesk.co.uk"
        ]
      }
    ]
  }
};

const PRIVACY_POLICY_SECTIONS_TR: PrivacyPolicySection[] = [
  {
    title: "1. Biz kimiz",
    paragraphs: [
      "NivaDesk şu şirket tarafından işletilir:",
      "EGGCRAFT LIMITED\n141 Randolph Avenue\nLondon\nW9 1DN\nUnited Kingdom",
      "Email: contact@nivadesk.co.uk",
      "Gizlilikle ilgili sorular, veri talepleri veya hesap silme talepleri için lütfen bizimle e-posta yoluyla iletişime geçin."
    ]
  },
  {
    title: "2. Bu Gizlilik Politikası neleri kapsar",
    paragraphs: ["Bu Gizlilik Politikası şunlar için geçerlidir:"],
    bullets: [
      "web sitemiz;",
      "NivaDesk web uygulaması;",
      "NivaDesk mobil ve masaüstü uygulamaları;",
      "hesap kaydı ve giriş;",
      "müşteri desteği ve e-posta iletişimi;",
      "ödeme ve abonelik yönetimi;",
      "yüklenen dosyalar, müşteri dosyaları, sipariş kayıtları, notlar, görevler, workflow verileri ve workspace içeriği;",
      "NivaDesk'e bağlı entegrasyonlar veya üçüncü taraf servisler."
    ],
    subsections: [
      {
        title: "",
        paragraphs: ["Bu Gizlilik Politikası sahip olmadığımız veya kontrol etmediğimiz web siteleri, uygulamalar veya servisler için geçerli değildir."]
      }
    ]
  },
  {
    title: "3. Rolümüz: veri sorumlusu ve veri işleyen",
    paragraphs: [
      "Bazı durumlarda veri sorumlusu olarak hareket ederiz. Bu, belirli kişisel verilerin nasıl ve neden işlendiğine bizim karar verdiğimiz anlamına gelir. Örneğin bir NivaDesk hesabı oluşturduğunuzda, bizimle iletişime geçtiğinizde, güncellemelere abone olduğunuzda, bir plan için ödeme yaptığınızda veya web sitemizi kullandığınızda veri sorumlusu biz oluruz.",
      "Diğer durumlarda veri işleyen olarak hareket ederiz. Bu, müşterilerimiz adına veri işlediğimiz anlamına gelir. Örneğin bir işletme NivaDesk'i kendi müşteri adlarını, sipariş detaylarını, dosyalarını, notlarını, adreslerini, görevlerini veya workflow bilgilerini saklamak için kullanıyorsa, genellikle bu verinin veri sorumlusu o işletmedir ve biz veriyi onların talimatlarına göre işleriz.",
      "Kişisel verileriniz NivaDesk'e müşterilerimizden biri tarafından eklendiyse, bu verilerle ilgili haklarınızı kullanmak için lütfen önce o müşteriyle iletişime geçin."
    ]
  },
  {
    title: "4. Topladığımız kişisel veriler",
    paragraphs: ["Aşağıdaki türlerde kişisel veri toplayabiliriz."],
    subsections: [
      {
        title: "4.1 Hesap ve profil verileri",
        paragraphs: ["Bir NivaDesk hesabı oluşturduğunuzda veya kullandığınızda şunları toplayabiliriz:"],
        bullets: [
          "ad;",
          "e-posta adresi;",
          "şifre veya kimlik doğrulama bilgileri;",
          "profil fotoğrafı veya avatar;",
          "şirket veya workspace adı;",
          "workspace içindeki rol;",
          "dil, saat dilimi ve uygulama tercihleri;",
          "e-posta/şifre, Google ile giriş veya Apple ile giriş gibi giriş yöntemi."
        ]
      },
      {
        title: "4.2 Workspace ve iş içeriği",
        paragraphs: ["NivaDesk'i kullandığınızda siz veya ekibiniz şu tür içerikler ekleyebilir:"],
        bullets: [
          "müşteri veya client detayları;",
          "sipariş detayları;",
          "workflow durumu;",
          "sipariş notları;",
          "müşteri notları;",
          "görev listeleri ve hatırlatmalar;",
          "teslim tarihleri ve zaman çizelgeleri;",
          "adresler;",
          "yüklenen dosyalar;",
          "görseller, PDF'ler, tasarım dosyaları, belgeler ve ekler;",
          "ekip üyesi rolleri ve erişim izinleri;",
          "geçmiş kayıtları ve aktivite kayıtları."
        ]
      },
      {
        title: "",
        paragraphs: ["NivaDesk'e yüklediğiniz kişisel verilerin hukuka uygun şekilde toplanmış ve eklenmiş olmasını sağlamak sizin sorumluluğunuzdadır."]
      },
      {
        title: "4.3 Ödeme ve abonelik verileri",
        paragraphs: ["Ücretli bir plan satın alırsanız biz veya ödeme sağlayıcılarımız şunları işleyebilir:"],
        bullets: [
          "fatura adı;",
          "fatura adresi;",
          "e-posta adresi;",
          "ödeme yöntemi bilgileri;",
          "abonelik planı;",
          "faturalar ve işlem geçmişi;",
          "gerekli olduğunda vergi veya muhasebe bilgileri."
        ]
      },
      {
        title: "",
        paragraphs: [
          "Tam kart numaralarını kendimiz saklamayız. Ödeme detayları, aboneliği nasıl başlattığınıza bağlı olarak Stripe, Apple, Google veya diğer ödeme platformları gibi üçüncü taraf ödeme sağlayıcıları tarafından işlenir."
        ]
      },
      {
        title: "4.4 Cihaz, kullanım ve teknik veriler",
        paragraphs: ["Web sitemizi veya uygulamalarımızı kullandığınızda şunları toplayabiliriz:"],
        bullets: [
          "IP adresi;",
          "cihaz türü;",
          "işletim sistemi;",
          "tarayıcı türü;",
          "uygulama sürümü;",
          "çökme raporları;",
          "giriş zamanları;",
          "kullanılan sayfalar veya özellikler;",
          "performans ve tanılama verileri;",
          "IP adresine dayalı yaklaşık konum;",
          "çerezler ve benzer teknolojiler."
        ]
      },
      {
        title: "",
        paragraphs: [
          "Bu veriler NivaDesk'i güvenli tutmamıza, performansı iyileştirmemize, hataları gidermemize ve kullanıcıların servislerimizle nasıl etkileşim kurduğunu anlamamıza yardımcı olur."
        ]
      },
      {
        title: "4.5 İletişim verileri",
        paragraphs: ["Bizimle iletişime geçerseniz şunları toplayabiliriz:"],
        bullets: [
          "adınız;",
          "e-posta adresiniz;",
          "mesaj içeriği;",
          "destek talepleri;",
          "geri bildirim;",
          "bize gönderdiğiniz ekler veya ekran görüntüleri;",
          "sizinle yaptığımız iletişimin kayıtları."
        ]
      },
      {
        title: "4.6 Üçüncü taraf giriş veya entegrasyonlardan gelen veriler",
        paragraphs: [
          "Google veya Apple gibi bir üçüncü taraf servisle giriş yapmayı veya bağlantı kurmayı seçerseniz, o servisten sınırlı bilgiler alabiliriz:"
        ],
        bullets: [
          "ad;",
          "e-posta adresi;",
          "profil görseli;",
          "kimlik doğrulama tanımlayıcısı."
        ]
      },
      {
        title: "",
        paragraphs: [
          "Gelecekteki NivaDesk entegrasyonları takvim, dosyalar, e-posta, depolama veya diğer iş araçları gibi servislere erişim sağlarsa, yalnızca kullanmayı seçtiğiniz özelliği sunmak için gereken verilere erişiriz."
        ]
      }
    ]
  },
  {
    title: "5. Kişisel verileri nasıl kullanırız",
    paragraphs: ["Kişisel verileri şu amaçlarla kullanırız:"],
    bullets: [
      "hesabınızı oluşturmak ve yönetmek;",
      "NivaDesk'e erişim sağlamak;",
      "workspaceleri oluşturmak ve yönetmek;",
      "siparişleri, müşterileri, görevleri, dosyaları, notları, zaman çizelgelerini ve workflow bilgilerini saklamak ve senkronize etmek;",
      "ekip rollerini ve izinlerini yönetmek;",
      "müşteri desteği sağlamak;",
      "ödemeleri ve abonelikleri işlemek;",
      "servisle ilgili e-postalar göndermek;",
      "uygulama performansını ve güvenilirliğini iyileştirmek;",
      "hataları, kötüye kullanımı, dolandırıcılığı veya güvenlik sorunlarını tespit etmek;",
      "hukuki, vergi, muhasebe ve düzenleyici yükümlülüklere uymak;",
      "kullanıcıların web sitemizi ve servislerimizi nasıl kullandığını anlamak;",
      "izin verilen durumlarda ürün güncellemeleri veya pazarlama iletişimleri göndermek."
    ],
    subsections: [
      {
        title: "",
        paragraphs: ["Workspace içeriğinizi müşterilerinize reklam göstermek için kullanmayız."]
      }
    ]
  },
  {
    title: "6. İşleme için hukuki dayanaklar",
    paragraphs: ["UK GDPR veya EU GDPR geçerli olduğunda aşağıdaki hukuki dayanaklara dayanırız:"],
    subsections: [
      {
        title: "Sözleşme",
        paragraphs: ["NivaDesk'i size sunmak, hesabınızı yönetmek, ödemeleri işlemek ve talep ettiğiniz özellikleri sağlamak için gerekli olduğunda verileri işleriz."]
      },
      {
        title: "Meşru menfaatler",
        paragraphs: ["NivaDesk'i iyileştirmek, kötüye kullanımı önlemek, servislerimizi güvence altına almak, destek taleplerine yanıt vermek ve ürün kullanımını anlamak gibi meşru iş menfaatlerimiz için verileri işleyebiliriz."]
      },
      {
        title: "Rıza",
        paragraphs: ["İsteğe bağlı özellikler, pazarlama e-postaları, kesinlikle gerekli olmayan çerezler veya bazı üçüncü taraf entegrasyonları için rızaya dayanabiliriz."]
      },
      {
        title: "Hukuki yükümlülük",
        paragraphs: ["Kanun, vergi, muhasebe, güvenlik, dolandırıcılığı önleme veya düzenleyici yükümlülükler gerektirdiğinde verileri işleyebiliriz."]
      }
    ]
  },
  {
    title: "7. Workspace içeriği ve yüklenen dosyalar",
    paragraphs: [
      "NivaDesk kullanıcıların iş dosyaları, müşteri dosyaları, belgeler, görseller, PDF'ler, tasarım dosyaları ve diğer materyalleri yüklemesine ve saklamasına olanak tanır.",
      "Yüklenen dosyaları yalnızca servisi sağlamak için işleriz. Buna şunlar dahildir:"
    ],
    bullets: [
      "dosyaları saklamak;",
      "dosyaları workspace içinde göstermek;",
      "dosyaları cihazlarınız arasında senkronize etmek;",
      "indirmelere izin vermek;",
      "workspace izinlerini uygulamak;",
      "dosya adı, yükleme tarihi, dosya boyutu ve yükleyen kişi gibi metadata oluşturmak;",
      "güvenlik ve denetim kayıtlarını tutmak;",
      "etkinleştirildiğinde offline erişimi veya yükleme kuyruklarını desteklemek."
    ],
    subsections: [
      {
        title: "",
        paragraphs: [
          "Yüklediğiniz içeriğin sahipliğini talep etmeyiz. Servisi işletmek ve sağlamak için bize verdiğiniz haklar saklı kalmak üzere, yüklediğiniz içerik üzerindeki tüm haklar sizde kalır."
        ]
      }
    ]
  },
  {
    title: "8. Ekip workspaceleri ve izinler",
    paragraphs: ["Bir NivaDesk workspace'ine davet edilirseniz, workspace sahibi veya yöneticiler şunları yapabilir:"],
    bullets: [
      "adınızı ve e-posta adresinizi görmek;",
      "size rol atamak;",
      "erişiminizi kontrol etmek;",
      "workspace içindeki aktivitenizi görüntülemek;",
      "erişiminizi kaldırmak;",
      "paylaşılan workspace içeriğini yönetmek."
    ],
    subsections: [
      {
        title: "",
        paragraphs: ["Bir workspace'e başka bir kullanıcı eklerseniz, o kişinin e-posta adresini veya ilgili bilgilerini sağlama izniniz olduğunu onaylarsınız."]
      }
    ]
  },
  {
    title: "9. Google, Apple ve üçüncü taraf giriş",
    paragraphs: [
      "Google, Apple veya desteklenen başka bir kimlik doğrulama sağlayıcısıyla giriş yaparsanız, bu servisin sağladığı bilgileri yalnızca kimliğinizi doğrulamak ve hesabınıza erişim sağlamak için kullanırız.",
      "Google veya Apple şifrenizi almayız veya saklamayız.",
      "Gelecekte ek Google, Apple, takvim, e-posta, dosya veya cloud entegrasyonları sunarsak, yalnızca ilgili özellik için gereken erişimi isteriz ve bu bilgileri yalnızca etkinleştirmeyi seçtiğiniz kullanıcıya dönük özelliği sağlamak veya iyileştirmek için kullanırız.",
      "Bağlı üçüncü taraf servislerden gelen verileri reklam için kullanmayız veya bu verileri üçüncü taraflara satmayız."
    ]
  },
  {
    title: "10. Ödemeler ve abonelikler",
    paragraphs: [
      "Ödemeler Stripe, Apple App Store, Google Play veya diğer ödeme platformları gibi üçüncü taraf sağlayıcılar tarafından işlenebilir.",
      "Bu sağlayıcılar ödeme bilgilerini kendi gizlilik politikaları ve şartlarına göre toplayabilir ve işleyebilir. Biz, NivaDesk planınızı, faturalarınızı, yenilemeleri, iptalleri, iadeleri ve hesap durumunu yönetmek için gereken sınırlı ödeme ve abonelik bilgilerini alırız."
    ]
  },
  {
    title: "11. Çerezler ve analitik",
    paragraphs: ["Web sitemiz ve servislerimiz çerezleri veya benzer teknolojileri şu amaçlarla kullanabilir:"],
    bullets: [
      "oturumunuzu açık tutmak;",
      "tercihleri hatırlamak;",
      "güvenliği iyileştirmek;",
      "web sitesi kullanımını anlamak;",
      "performansı ölçmek;",
      "ürünü iyileştirmek."
    ],
    subsections: [
      {
        title: "",
        paragraphs: [
          "Bazı çerezler servisin çalışması için gereklidir. Analitik veya pazarlama çerezleri gibi diğerleri, kanunen gerekli olduğu durumlarda rızanıza bağlı olabilir.",
          "Çerezleri tarayıcı ayarlarınızdan yönetebilirsiniz. Bazı çerezleri devre dışı bırakmak web sitemizin veya uygulamanın işlevselliğini etkileyebilir."
        ]
      }
    ]
  },
  {
    title: "12. Pazarlama iletişimleri",
    paragraphs: [
      "Size ürün güncellemeleri, özellik duyuruları, teklifler veya NivaDesk haberleri hakkında e-postalar gönderebiliriz.",
      "Pazarlama e-postalarından istediğiniz zaman abonelikten çıkma bağlantısını kullanarak veya bizimle iletişime geçerek çıkabilirsiniz.",
      "Pazarlama e-postalarından çıksanız bile hesap, faturalama, güvenlik, abonelik veya hukuki bildirimler gibi önemli servis e-postalarını göndermeye devam edebiliriz."
    ]
  },
  {
    title: "13. Kişisel verileri kimlerle paylaşırız",
    paragraphs: [
      "Kişisel verilerinizi satmayız.",
      "Kişisel verileri yalnızca NivaDesk'i işletmek, desteklemek, güvence altına almak veya iyileştirmek için gerekli olduğunda güvenilir üçüncü taraflarla paylaşabiliriz. Bunlar şunları içerebilir:"
    ],
    bullets: [
      "barındırma ve cloud altyapı sağlayıcıları;",
      "veritabanı ve depolama sağlayıcıları;",
      "kimlik doğrulama sağlayıcıları;",
      "ödeme işlemcileri;",
      "analitik ve performans araçları;",
      "müşteri destek araçları;",
      "e-posta teslim sağlayıcıları;",
      "hata izleme ve çökme raporlama servisleri;",
      "muhasebeciler, avukatlar veya profesyonel danışmanlar;",
      "kanunen gerekli olduğunda yetkili makamlar."
    ],
    subsections: [
      {
        title: "",
        paragraphs: ["Servis sağlayıcılara yalnızca bizim için hizmetlerini yerine getirmek için ihtiyaç duydukları bilgileri sağlarız."]
      }
    ]
  },
  {
    title: "14. Uluslararası aktarımlar",
    paragraphs: [
      "Verileriniz Birleşik Krallık, Avrupa Ekonomik Alanı, Amerika Birleşik Devletleri veya servis sağlayıcılarımızın faaliyet gösterdiği diğer ülkelerde saklanabilir veya işlenebilir.",
      "Kişisel veriler UK veya EEA dışına aktarıldığında, gerekli olduğu durumlarda yeterlilik kararları, standart sözleşme maddeleri, UK International Data Transfer Agreement veya diğer hukuka uygun aktarım mekanizmaları gibi uygun güvenceleri kullanırız."
    ]
  },
  {
    title: "15. Güvenlik",
    paragraphs: ["Kişisel verileri korumak için makul teknik ve organizasyonel önlemler alırız. Bunlar şunları içerir:"],
    bullets: [
      "güvenli kimlik doğrulama;",
      "kısıtlı erişim kontrolleri;",
      "uygun olduğunda şifreli bağlantılar;",
      "rol bazlı workspace izinleri;",
      "cloud güvenlik kontrolleri;",
      "hatalar ve kötüye kullanım için izleme;",
      "yedekler ve operasyonel korumalar;",
      "kişisel verilere erişimi yalnızca ihtiyacı olan kişilerle sınırlama."
    ],
    subsections: [
      {
        title: "",
        paragraphs: [
          "Ancak hiçbir sistem tamamen güvenli değildir. Kişisel verilerin her zaman tamamen güvenli kalacağını garanti edemeyiz, ancak onları korumak ve bir güvenlik sorunu oluşursa uygun şekilde yanıt vermek için çalışırız."
        ]
      }
    ]
  },
  {
    title: "16. Veri saklama",
    paragraphs: [
      "Kişisel verileri yalnızca bu Gizlilik Politikası'nda açıklanan amaçlar için gerekli olduğu sürece saklarız.",
      "Genel olarak:"
    ],
    bullets: [
      "hesap verileri hesabınız aktif olduğu sürece saklanır;",
      "workspace içeriği workspace veya hesap aktif kaldığı sürece saklanır;",
      "faturalama ve fatura verileri hukuki, vergi ve muhasebe gereklilikleri için saklanabilir;",
      "destek mesajları talebinize yanıt vermemize ve desteği iyileştirmemize yardımcı olmak için saklanabilir;",
      "teknik loglar güvenlik ve sorun giderme için sınırlı bir süre saklanabilir;",
      "silinen veriler kalıcı olarak kaldırılmadan önce sınırlı bir süre yedeklerde kalabilir."
    ],
    subsections: [
      {
        title: "",
        paragraphs: [
          "Hesabınızı silerseniz veya silme talep ederseniz, hukuki, güvenlik, muhasebe, uyuşmazlık çözümü veya meşru iş sebepleriyle saklamamız gerekmedikçe kişisel verileri siler veya anonim hale getiririz."
        ]
      }
    ]
  },
  {
    title: "17. Hesap silme ve veri dışa aktarma",
    paragraphs: [
      "Bizimle iletişime geçerek hesap silme talep edebilirsiniz.",
      "Hesabınızı silmeden önce kimliğinizi doğrulamamız gerekebilir. Başkasına ait bir workspace'in parçasıysanız, workspace içeriğinin silinmesi için sizi workspace sahibine yönlendirmemiz gerekebilir.",
      "Mevcut olduğunda verilerinizi NivaDesk içinden dışa aktarabilirsiniz. Plan değişse veya süresi dolsa bile müşterilerin kendi iş verilerine erişebilmesi ve bunları dışa aktarabilmesi gerektiğine inanıyoruz; bu, makul teknik ve güvenlik sınırlarına tabidir."
    ]
  },
  {
    title: "18. Haklarınız",
    paragraphs: ["Yaşadığınız yere bağlı olarak veri koruma hukuku kapsamında şu haklara sahip olabilirsiniz:"],
    bullets: [
      "hakkınızda tuttuğumuz kişisel verilere erişme;",
      "hatalı verilerin düzeltilmesini isteme;",
      "verilerinizin silinmesini isteme;",
      "belirli işlemelere itiraz etme;",
      "işlemeyi kısıtlama;",
      "veri taşınabilirliği talep etme;",
      "işleme rızaya dayanıyorsa rızayı geri çekme;",
      "pazarlama iletişimlerinden çıkma;",
      "bir veri koruma otoritesine şikayette bulunma."
    ],
    subsections: [
      {
        title: "",
        paragraphs: [
          "Birleşik Krallık'taysanız Information Commissioner's Office ile ico.org.uk üzerinden iletişime geçebilirsiniz.",
          "Haklarınızı kullanmak için bize şu adresten ulaşın: contact@nivadesk.co.uk",
          "Bir talebe yanıt vermeden önce kimliğinizi doğrulamak için bilgi isteyebiliriz."
        ]
      }
    ]
  },
  {
    title: "19. Çocuklar",
    paragraphs: [
      "NivaDesk çocuklara yönelik değildir. Bilerek çocuklardan kişisel veri toplamıyoruz.",
      "Bir çocuğun bize kişisel veri sağladığını düşünüyorsanız lütfen bizimle iletişime geçin; bu veriyi silmek için uygun adımları atarız."
    ]
  },
  {
    title: "20. Üçüncü taraf web siteleri ve servisler",
    paragraphs: [
      "NivaDesk üçüncü taraf web sitelerine, servislere, entegrasyonlara veya ödeme sağlayıcılarına bağlantılar içerebilir.",
      "Üçüncü tarafların gizlilik uygulamalarından sorumlu değiliz. Servislerini kullanmadan önce gizlilik politikalarını incelemelisiniz."
    ]
  },
  {
    title: "21. Bu Gizlilik Politikası'ndaki değişiklikler",
    paragraphs: [
      "Bu Gizlilik Politikası'nı zaman zaman güncelleyebiliriz.",
      "Önemli değişiklikler yaparsak sizi e-posta, uygulama içi bildirim veya bu sayfanın üstündeki tarihi güncelleyerek bilgilendirebiliriz.",
      "Güncellenen Gizlilik Politikası yürürlüğe girdikten sonra NivaDesk'i kullanmaya devam etmeniz, güncellenen politikayı kabul ettiğiniz anlamına gelir."
    ]
  },
  {
    title: "22. Bizimle iletişime geçin",
    paragraphs: [
      "Bu Gizlilik Politikası, kişisel verileriniz veya haklarınız hakkında sorularınız varsa lütfen iletişime geçin:",
      "EGGCRAFT LIMITED\n141 Randolph Avenue\nLondon\nW9 1DN\nUnited Kingdom",
      "Email: contact@nivadesk.co.uk"
    ]
  }
];

type LocalizedPrivacyPolicy = {
  lastUpdatedLabel: string;
  sections: PrivacyPolicySection[];
};

const LOCALIZED_PRIVACY_POLICIES: Partial<Record<StudioLanguage, LocalizedPrivacyPolicy>> = {
  ...EXTRA_LOCALIZED_PRIVACY_POLICIES,
  Türkçe: {
    lastUpdatedLabel: "Son güncelleme",
    sections: PRIVACY_POLICY_SECTIONS_TR
  },
  Deutsch: {
    lastUpdatedLabel: "Zuletzt aktualisiert",
    sections: [
      {
        title: "1. Wer wir sind",
        paragraphs: [
          "NivaDesk wird betrieben von:",
          "EGGCRAFT LIMITED\n141 Randolph Avenue\nLondon\nW9 1DN\nUnited Kingdom",
          "E-Mail: contact@nivadesk.co.uk",
          "Für Datenschutzfragen, Datenanfragen oder Anfragen zur Kontolöschung kontaktieren Sie uns bitte per E-Mail."
        ]
      },
      {
        title: "2. Was diese Datenschutzerklärung abdeckt",
        paragraphs: ["Diese Datenschutzerklärung gilt für unsere Website, die NivaDesk Web-App, mobile und Desktop-Apps, Registrierung, Login, Support, Zahlungen, Abonnements, hochgeladene Dateien, Kundendateien, Bestellungen, Notizen, Aufgaben, Workflow-Daten, Workspace-Inhalte und verbundene Integrationen. Sie gilt nicht für Dienste, die wir nicht besitzen oder kontrollieren."]
      },
      {
        title: "3. Unsere Rolle: Verantwortlicher und Auftragsverarbeiter",
        paragraphs: ["In manchen Situationen sind wir Verantwortlicher, etwa bei Kontoerstellung, Website-Nutzung, Support oder Zahlungen. In anderen Situationen verarbeiten wir Daten im Auftrag unserer Kunden, etwa wenn ein Studio Kundendaten, Bestellungen, Dateien oder Aufgaben in NivaDesk speichert. Wenn Ihre Daten von einem NivaDesk-Kunden hinzugefügt wurden, wenden Sie sich bitte zuerst an diesen Kunden."]
      },
      {
        title: "4. Personenbezogene Daten, die wir erfassen",
        paragraphs: ["Wir können Konto- und Profildaten, Workspace- und Geschäftsinhalte, Kunden- und Bestelldaten, Notizen, Aufgaben, Dateien, Zahlungs- und Abonnementdaten, Geräte-, Nutzungs- und technische Daten, Support-Kommunikation sowie Daten aus Google, Apple oder anderen Integrationen erfassen."]
      },
      {
        title: "5. Wie wir personenbezogene Daten verwenden",
        paragraphs: ["Wir verwenden personenbezogene Daten, um Konten und Workspaces bereitzustellen, Bestellungen, Dateien, Aufgaben und Workflows zu speichern und zu synchronisieren, Rollen und Berechtigungen zu verwalten, Support zu leisten, Zahlungen zu verarbeiten, Service-E-Mails zu senden, Sicherheit und Leistung zu verbessern und gesetzlichen Pflichten nachzukommen. Wir verwenden Workspace-Inhalte nicht, um bei Ihren Kunden zu werben."]
      },
      {
        title: "6. Rechtsgrundlagen der Verarbeitung",
        paragraphs: ["Soweit UK GDPR oder EU GDPR gilt, stützen wir uns auf Vertragserfüllung, berechtigte Interessen, Einwilligung und gesetzliche Verpflichtungen. Dazu gehören die Bereitstellung von NivaDesk, Schutz vor Missbrauch, optionale Funktionen, Marketing, Cookies, Integrationen sowie steuerliche, buchhalterische und regulatorische Pflichten."]
      },
      {
        title: "7. Workspace-Inhalte und hochgeladene Dateien",
        paragraphs: ["NivaDesk erlaubt das Hochladen von Geschäftsdateien, Kundendateien, Bildern, PDFs, Designdateien und Dokumenten. Wir verarbeiten diese Inhalte, um sie zu speichern, anzuzeigen, zu synchronisieren, Downloads zu ermöglichen, Berechtigungen anzuwenden, Metadaten zu erstellen und Sicherheit sowie Audit-Protokolle zu unterstützen. Wir beanspruchen kein Eigentum an Ihren hochgeladenen Inhalten."]
      },
      {
        title: "8. Team-Workspaces und Berechtigungen",
        paragraphs: ["Workspace-Inhaber und Administratoren können Ihren Namen, Ihre E-Mail-Adresse, Rolle, Zugriffsrechte und Aktivitäten innerhalb des Workspace sehen und verwalten. Wenn Sie andere Personen einladen, bestätigen Sie, dass Sie deren relevante Informationen bereitstellen dürfen."]
      },
      {
        title: "9. Google, Apple und Drittanbieter-Login",
        paragraphs: ["Wenn Sie sich mit Google, Apple oder einem anderen Anbieter anmelden, verwenden wir die bereitgestellten Informationen nur zur Authentifizierung und zum Kontozugriff. Wir erhalten oder speichern Ihr Google- oder Apple-Passwort nicht. Daten aus verbundenen Drittanbieterdiensten nutzen wir nicht für Werbung und verkaufen sie nicht."]
      },
      {
        title: "10. Zahlungen und Abonnements",
        paragraphs: ["Zahlungen können über Stripe, Apple App Store, Google Play oder andere Zahlungsplattformen verarbeitet werden. Diese Anbieter verarbeiten Zahlungsdaten nach ihren eigenen Bedingungen. Wir erhalten nur die Informationen, die zur Verwaltung von Plan, Rechnungen, Verlängerungen, Kündigungen, Erstattungen und Kontostatus nötig sind."]
      },
      {
        title: "11. Cookies und Analyse",
        paragraphs: ["Unsere Website und Dienste können Cookies oder ähnliche Technologien verwenden, um Sie angemeldet zu halten, Präferenzen zu speichern, Sicherheit zu verbessern, Nutzung zu verstehen, Leistung zu messen und das Produkt zu verbessern. Nicht notwendige Cookies können, soweit gesetzlich erforderlich, von Ihrer Einwilligung abhängen."]
      },
      {
        title: "12. Marketing-Kommunikation",
        paragraphs: ["Wir können Ihnen E-Mails zu Produktupdates, Funktionen, Angeboten oder NivaDesk-Neuigkeiten senden. Sie können Marketing-E-Mails jederzeit abbestellen. Wichtige Service-E-Mails zu Konto, Abrechnung, Sicherheit, Abonnement oder rechtlichen Hinweisen können wir weiterhin senden."]
      },
      {
        title: "13. Mit wem wir personenbezogene Daten teilen",
        paragraphs: ["Wir verkaufen Ihre personenbezogenen Daten nicht. Wir teilen Daten nur mit vertrauenswürdigen Dienstleistern, wenn dies für Betrieb, Support, Sicherheit oder Verbesserung von NivaDesk notwendig ist, etwa Hosting, Datenbanken, Speicher, Authentifizierung, Zahlungsabwicklung, Analyse, Support, E-Mail-Versand, Fehlerüberwachung, Berater oder Behörden, wenn gesetzlich erforderlich."]
      },
      {
        title: "14. Internationale Übermittlungen",
        paragraphs: ["Ihre Daten können im Vereinigten Königreich, im EWR, in den USA oder in anderen Ländern verarbeitet werden, in denen unsere Dienstleister tätig sind. Bei Übermittlungen außerhalb des UK oder EWR verwenden wir geeignete Schutzmaßnahmen, soweit gesetzlich erforderlich."]
      },
      {
        title: "15. Sicherheit",
        paragraphs: ["Wir treffen angemessene technische und organisatorische Maßnahmen, darunter sichere Authentifizierung, Zugriffskontrollen, verschlüsselte Verbindungen, rollenbasierte Berechtigungen, Cloud-Sicherheitskontrollen, Monitoring, Backups und Beschränkung des Zugriffs auf Personen, die ihn benötigen. Kein System ist jedoch vollständig sicher."]
      },
      {
        title: "16. Aufbewahrung von Daten",
        paragraphs: ["Wir bewahren personenbezogene Daten nur so lange auf, wie es für die in dieser Datenschutzerklärung beschriebenen Zwecke erforderlich ist. Konto- und Workspace-Daten werden während aktiver Nutzung gespeichert; Rechnungsdaten können für Steuer- und Buchhaltungspflichten länger aufbewahrt werden; gelöschte Daten können begrenzte Zeit in Backups verbleiben."]
      },
      {
        title: "17. Kontolöschung und Datenexport",
        paragraphs: ["Sie können die Löschung Ihres Kontos beantragen. Vor der Löschung müssen wir möglicherweise Ihre Identität prüfen. Wenn Sie Teil eines fremden Workspace sind, kann der Workspace-Inhaber für Inhalte zuständig sein. Wo verfügbar, können Sie Ihre Daten aus NivaDesk exportieren, auch wenn sich Ihr Plan ändert oder abläuft."]
      },
      {
        title: "18. Ihre Rechte",
        paragraphs: ["Je nach Wohnort können Sie Rechte auf Auskunft, Berichtigung, Löschung, Widerspruch, Einschränkung, Datenübertragbarkeit, Widerruf der Einwilligung, Abmeldung von Marketing und Beschwerde bei einer Datenschutzbehörde haben. Im UK können Sie das ICO unter ico.org.uk kontaktieren. Zur Ausübung Ihrer Rechte schreiben Sie an contact@nivadesk.co.uk."]
      },
      {
        title: "19. Kinder",
        paragraphs: ["NivaDesk richtet sich nicht an Kinder. Wir erheben wissentlich keine personenbezogenen Daten von Kindern. Wenn Sie glauben, dass ein Kind uns personenbezogene Daten bereitgestellt hat, kontaktieren Sie uns bitte."]
      },
      {
        title: "20. Websites und Dienste Dritter",
        paragraphs: ["NivaDesk kann Links zu Websites, Diensten, Integrationen oder Zahlungsanbietern Dritter enthalten. Wir sind nicht für deren Datenschutzpraktiken verantwortlich. Bitte prüfen Sie deren Datenschutzerklärungen."]
      },
      {
        title: "21. Änderungen dieser Datenschutzerklärung",
        paragraphs: ["Wir können diese Datenschutzerklärung von Zeit zu Zeit aktualisieren. Bei wesentlichen Änderungen können wir Sie per E-Mail, In-App-Hinweis oder durch Aktualisierung des Datums auf dieser Seite informieren."]
      },
      {
        title: "22. Kontakt",
        paragraphs: [
          "Wenn Sie Fragen zu dieser Datenschutzerklärung, Ihren personenbezogenen Daten oder Ihren Rechten haben, kontaktieren Sie uns bitte:",
          "EGGCRAFT LIMITED\n141 Randolph Avenue\nLondon\nW9 1DN\nUnited Kingdom",
          "E-Mail: contact@nivadesk.co.uk"
        ]
      }
    ]
  },
  Français: {
    lastUpdatedLabel: "Dernière mise à jour",
    sections: [
      {
        title: "1. Qui sommes-nous",
        paragraphs: [
          "NivaDesk est exploité par :",
          "EGGCRAFT LIMITED\n141 Randolph Avenue\nLondon\nW9 1DN\nUnited Kingdom",
          "E-mail : contact@nivadesk.co.uk",
          "Pour toute question relative à la confidentialité, demande de données ou demande de suppression de compte, contactez-nous par e-mail."
        ]
      },
      {
        title: "2. Ce que couvre cette Politique de confidentialité",
        paragraphs: ["Cette Politique s'applique à notre site web, à l'application web NivaDesk, aux applications mobiles et de bureau, à l'inscription, à la connexion, au support, aux paiements, aux abonnements, aux fichiers téléversés, aux fichiers clients, aux commandes, notes, tâches, données de workflow, contenus de workspace et intégrations connectées. Elle ne s'applique pas aux services que nous ne possédons ni ne contrôlons."]
      },
      {
        title: "3. Notre rôle : responsable du traitement et sous-traitant",
        paragraphs: ["Dans certains cas, nous sommes responsables du traitement, par exemple pour votre compte, le site, le support ou les paiements. Dans d'autres cas, nous traitons des données pour le compte de nos clients, par exemple lorsqu'un studio stocke des clients, commandes, fichiers ou tâches dans NivaDesk. Si vos données ont été ajoutées par l'un de nos clients, contactez d'abord ce client."]
      },
      {
        title: "4. Données personnelles que nous collectons",
        paragraphs: ["Nous pouvons collecter des données de compte et de profil, contenus de workspace et d'entreprise, informations clients et commandes, notes, tâches, fichiers, données de paiement et d'abonnement, données d'appareil, d'utilisation et techniques, communications de support, ainsi que des données provenant de Google, Apple ou d'autres intégrations."]
      },
      {
        title: "5. Comment nous utilisons les données personnelles",
        paragraphs: ["Nous utilisons les données pour créer et gérer les comptes et workspaces, stocker et synchroniser commandes, fichiers, tâches et workflows, gérer les rôles, fournir le support, traiter les paiements, envoyer des e-mails de service, améliorer la sécurité et la performance, et respecter nos obligations légales. Nous n'utilisons pas le contenu de votre workspace pour faire de la publicité auprès de vos clients."]
      },
      {
        title: "6. Bases légales du traitement",
        paragraphs: ["Lorsque le UK GDPR ou le RGPD de l'UE s'applique, nous nous appuyons sur le contrat, les intérêts légitimes, le consentement et les obligations légales, notamment pour fournir NivaDesk, sécuriser le service, activer des fonctions optionnelles, gérer les cookies, intégrations, taxes et obligations comptables."]
      },
      {
        title: "7. Contenu du workspace et fichiers téléversés",
        paragraphs: ["NivaDesk permet de téléverser des fichiers professionnels, fichiers clients, images, PDF, fichiers de design et documents. Nous les traitons pour les stocker, afficher, synchroniser, permettre les téléchargements, appliquer les permissions, créer des métadonnées et maintenir la sécurité. Nous ne revendiquons pas la propriété de vos contenus."]
      },
      {
        title: "8. Workspaces d'équipe et permissions",
        paragraphs: ["Les propriétaires et administrateurs de workspace peuvent voir et gérer votre nom, e-mail, rôle, accès et activité dans le workspace. Si vous invitez un utilisateur, vous confirmez avoir l'autorisation de fournir ses informations."]
      },
      {
        title: "9. Connexion Google, Apple et tiers",
        paragraphs: ["Si vous vous connectez avec Google, Apple ou un autre fournisseur, nous utilisons les informations fournies uniquement pour l'authentification et l'accès au compte. Nous ne recevons ni ne stockons votre mot de passe Google ou Apple. Nous n'utilisons pas les données des services connectés pour la publicité et ne les vendons pas."]
      },
      {
        title: "10. Paiements et abonnements",
        paragraphs: ["Les paiements peuvent être traités par Stripe, Apple App Store, Google Play ou d'autres plateformes. Ces fournisseurs traitent les informations de paiement selon leurs propres règles. Nous recevons seulement les informations nécessaires pour gérer votre plan, factures, renouvellements, annulations, remboursements et statut de compte."]
      },
      {
        title: "11. Cookies et analyses",
        paragraphs: ["Notre site et nos services peuvent utiliser des cookies ou technologies similaires pour maintenir la connexion, mémoriser les préférences, améliorer la sécurité, comprendre l'utilisation, mesurer la performance et améliorer le produit. Certains cookies non nécessaires peuvent dépendre de votre consentement."]
      },
      {
        title: "12. Communications marketing",
        paragraphs: ["Nous pouvons vous envoyer des e-mails sur les mises à jour, fonctionnalités, offres ou actualités de NivaDesk. Vous pouvez vous désabonner à tout moment. Nous pouvons continuer à envoyer des e-mails importants concernant le compte, la facturation, la sécurité, l'abonnement ou les avis légaux."]
      },
      {
        title: "13. Avec qui nous partageons les données",
        paragraphs: ["Nous ne vendons pas vos données personnelles. Nous les partageons uniquement avec des prestataires de confiance lorsque cela est nécessaire pour exploiter, soutenir, sécuriser ou améliorer NivaDesk, par exemple hébergement, stockage, authentification, paiement, analyse, support, e-mail, surveillance d'erreurs, conseillers ou autorités si la loi l'exige."]
      },
      {
        title: "14. Transferts internationaux",
        paragraphs: ["Vos données peuvent être stockées ou traitées au Royaume-Uni, dans l'EEE, aux États-Unis ou dans d'autres pays où nos prestataires opèrent. Lorsque nécessaire, nous utilisons des garanties appropriées pour les transferts hors du Royaume-Uni ou de l'EEE."]
      },
      {
        title: "15. Sécurité",
        paragraphs: ["Nous appliquons des mesures techniques et organisationnelles raisonnables, notamment authentification sécurisée, contrôles d'accès, connexions chiffrées, permissions par rôle, contrôles cloud, surveillance, sauvegardes et limitation des accès. Aucun système n'est toutefois totalement sécurisé."]
      },
      {
        title: "16. Conservation des données",
        paragraphs: ["Nous conservons les données personnelles uniquement aussi longtemps que nécessaire. Les données de compte et de workspace sont conservées pendant l'activité du compte ou workspace; les données de facturation peuvent être conservées pour les obligations fiscales et comptables; les données supprimées peuvent rester temporairement dans des sauvegardes."]
      },
      {
        title: "17. Suppression de compte et export des données",
        paragraphs: ["Vous pouvez demander la suppression de votre compte. Nous pouvons devoir vérifier votre identité. Si vous appartenez au workspace d'une autre personne, le propriétaire du workspace peut être responsable du contenu. Lorsque disponible, vous pouvez exporter vos données depuis NivaDesk, même si votre plan change ou expire."]
      },
      {
        title: "18. Vos droits",
        paragraphs: ["Selon votre lieu de résidence, vous pouvez avoir des droits d'accès, de rectification, de suppression, d'opposition, de limitation, de portabilité, de retrait du consentement, de désabonnement marketing et de plainte auprès d'une autorité. Au Royaume-Uni, vous pouvez contacter l'ICO à ico.org.uk. Pour exercer vos droits, écrivez à contact@nivadesk.co.uk."]
      },
      {
        title: "19. Enfants",
        paragraphs: ["NivaDesk n'est pas destiné aux enfants. Nous ne collectons pas sciemment de données personnelles d'enfants. Si vous pensez qu'un enfant nous a transmis des données, contactez-nous."]
      },
      {
        title: "20. Sites et services tiers",
        paragraphs: ["NivaDesk peut contenir des liens vers des sites, services, intégrations ou fournisseurs de paiement tiers. Nous ne sommes pas responsables de leurs pratiques de confidentialité. Consultez leurs politiques."]
      },
      {
        title: "21. Modifications de cette Politique",
        paragraphs: ["Nous pouvons mettre à jour cette Politique. En cas de changements importants, nous pouvons vous informer par e-mail, notification dans l'application ou mise à jour de la date sur cette page."]
      },
      {
        title: "22. Nous contacter",
        paragraphs: [
          "Pour toute question sur cette Politique, vos données ou vos droits, contactez :",
          "EGGCRAFT LIMITED\n141 Randolph Avenue\nLondon\nW9 1DN\nUnited Kingdom",
          "E-mail : contact@nivadesk.co.uk"
        ]
      }
    ]
  },
  Italiano: {
    lastUpdatedLabel: "Ultimo aggiornamento",
    sections: [
      {
        title: "1. Chi siamo",
        paragraphs: [
          "NivaDesk è gestito da:",
          "EGGCRAFT LIMITED\n141 Randolph Avenue\nLondon\nW9 1DN\nUnited Kingdom",
          "Email: contact@nivadesk.co.uk",
          "Per domande sulla privacy, richieste relative ai dati o cancellazione dell'account, contattaci via email."
        ]
      },
      {
        title: "2. Cosa copre questa Informativa sulla privacy",
        paragraphs: ["Questa Informativa si applica al sito web, alla web app NivaDesk, alle app mobile e desktop, registrazione, login, supporto, pagamenti, abbonamenti, file caricati, file cliente, ordini, note, attività, dati di workflow, contenuti del workspace e integrazioni collegate. Non si applica a servizi che non possediamo o controlliamo."]
      },
      {
        title: "3. Il nostro ruolo: titolare e responsabile del trattamento",
        paragraphs: ["In alcuni casi siamo titolari del trattamento, ad esempio per account, sito, supporto o pagamenti. In altri casi trattiamo dati per conto dei nostri clienti, quando uno studio archivia clienti, ordini, file o attività in NivaDesk. Se i tuoi dati sono stati aggiunti da un cliente NivaDesk, contatta prima quel cliente."]
      },
      {
        title: "4. Dati personali che raccogliamo",
        paragraphs: ["Possiamo raccogliere dati di account e profilo, contenuti del workspace e aziendali, dettagli clienti e ordini, note, attività, file, dati di pagamento e abbonamento, dati tecnici, di dispositivo e utilizzo, comunicazioni di supporto e dati da Google, Apple o altre integrazioni."]
      },
      {
        title: "5. Come usiamo i dati personali",
        paragraphs: ["Usiamo i dati per creare e gestire account e workspace, archiviare e sincronizzare ordini, file, attività e workflow, gestire ruoli, fornire supporto, elaborare pagamenti, inviare email di servizio, migliorare sicurezza e prestazioni e rispettare obblighi legali. Non usiamo i contenuti del workspace per fare pubblicità ai tuoi clienti."]
      },
      {
        title: "6. Basi giuridiche del trattamento",
        paragraphs: ["Quando si applicano UK GDPR o GDPR UE, ci basiamo su contratto, interessi legittimi, consenso e obblighi legali, inclusa la fornitura di NivaDesk, sicurezza, funzioni opzionali, marketing, cookie, integrazioni e requisiti fiscali o contabili."]
      },
      {
        title: "7. Contenuti del workspace e file caricati",
        paragraphs: ["NivaDesk consente di caricare file aziendali, file cliente, immagini, PDF, file di design e documenti. Li trattiamo per archiviare, mostrare, sincronizzare, consentire download, applicare permessi, creare metadati e mantenere sicurezza e registri. Non rivendichiamo la proprietà dei contenuti caricati."]
      },
      {
        title: "8. Workspace di team e permessi",
        paragraphs: ["Proprietari e amministratori del workspace possono vedere e gestire nome, email, ruolo, accesso e attività nel workspace. Se inviti un utente, confermi di avere il permesso di fornire le sue informazioni."]
      },
      {
        title: "9. Accesso con Google, Apple e terzi",
        paragraphs: ["Se accedi con Google, Apple o un altro provider, usiamo le informazioni ricevute solo per autenticarti e fornire accesso all'account. Non riceviamo né memorizziamo la tua password Google o Apple. Non usiamo i dati dei servizi collegati per pubblicità e non li vendiamo."]
      },
      {
        title: "10. Pagamenti e abbonamenti",
        paragraphs: ["I pagamenti possono essere gestiti da Stripe, Apple App Store, Google Play o altre piattaforme. Questi fornitori trattano i dati di pagamento secondo le proprie policy. Riceviamo solo le informazioni necessarie per gestire piano, fatture, rinnovi, cancellazioni, rimborsi e stato dell'account."]
      },
      {
        title: "11. Cookie e analisi",
        paragraphs: ["Il sito e i servizi possono usare cookie o tecnologie simili per mantenere il login, ricordare preferenze, migliorare sicurezza, comprendere l'uso, misurare prestazioni e migliorare il prodotto. I cookie non necessari possono richiedere consenso dove previsto dalla legge."]
      },
      {
        title: "12. Comunicazioni marketing",
        paragraphs: ["Possiamo inviarti email su aggiornamenti, funzionalità, offerte o notizie NivaDesk. Puoi disiscriverti in qualsiasi momento. Possiamo comunque inviare email importanti su account, fatturazione, sicurezza, abbonamento o avvisi legali."]
      },
      {
        title: "13. Con chi condividiamo i dati personali",
        paragraphs: ["Non vendiamo i tuoi dati personali. Li condividiamo solo con fornitori fidati quando necessario per gestire, supportare, proteggere o migliorare NivaDesk, ad esempio hosting, database, storage, autenticazione, pagamenti, analisi, supporto, email, monitoraggio errori, consulenti o autorità se richiesto dalla legge."]
      },
      {
        title: "14. Trasferimenti internazionali",
        paragraphs: ["I dati possono essere conservati o trattati nel Regno Unito, SEE, Stati Uniti o altri paesi in cui operano i nostri fornitori. Quando richiesto, usiamo garanzie adeguate per trasferimenti fuori da UK o SEE."]
      },
      {
        title: "15. Sicurezza",
        paragraphs: ["Adottiamo misure tecniche e organizzative ragionevoli, tra cui autenticazione sicura, controlli di accesso, connessioni cifrate, permessi basati sui ruoli, controlli cloud, monitoraggio, backup e accesso limitato ai dati. Nessun sistema è però completamente sicuro."]
      },
      {
        title: "16. Conservazione dei dati",
        paragraphs: ["Conserviamo i dati personali solo per il tempo necessario. Dati account e workspace restano mentre sono attivi; dati di fatturazione possono restare per obblighi fiscali e contabili; dati eliminati possono rimanere per un periodo limitato nei backup."]
      },
      {
        title: "17. Cancellazione account ed esportazione dati",
        paragraphs: ["Puoi richiedere la cancellazione dell'account. Potremmo dover verificare la tua identità. Se fai parte di un workspace di qualcun altro, il proprietario può essere responsabile dei contenuti. Dove disponibile, puoi esportare i dati da NivaDesk anche se il piano cambia o scade."]
      },
      {
        title: "18. I tuoi diritti",
        paragraphs: ["A seconda del luogo in cui vivi, puoi avere diritti di accesso, rettifica, cancellazione, opposizione, limitazione, portabilità, revoca del consenso, opt-out marketing e reclamo a un'autorità. Nel Regno Unito puoi contattare l'ICO su ico.org.uk. Per esercitare i diritti scrivi a contact@nivadesk.co.uk."]
      },
      {
        title: "19. Minori",
        paragraphs: ["NivaDesk non è destinato ai minori. Non raccogliamo consapevolmente dati personali di minori. Se ritieni che un minore ci abbia fornito dati, contattaci."]
      },
      {
        title: "20. Siti e servizi di terzi",
        paragraphs: ["NivaDesk può contenere link a siti, servizi, integrazioni o fornitori di pagamento di terzi. Non siamo responsabili delle loro pratiche privacy. Consulta le loro informative."]
      },
      {
        title: "21. Modifiche a questa Informativa",
        paragraphs: ["Possiamo aggiornare questa Informativa. In caso di modifiche importanti, possiamo avvisarti via email, notifica in-app o aggiornando la data in questa pagina."]
      },
      {
        title: "22. Contatti",
        paragraphs: [
          "Per domande su questa Informativa, sui dati personali o sui tuoi diritti, contatta:",
          "EGGCRAFT LIMITED\n141 Randolph Avenue\nLondon\nW9 1DN\nUnited Kingdom",
          "Email: contact@nivadesk.co.uk"
        ]
      }
    ]
  },
  "Español (Spanish)": {
    lastUpdatedLabel: "Última actualización",
    sections: [
      {
        title: "1. Quiénes somos",
        paragraphs: [
          "NivaDesk es operado por:",
          "EGGCRAFT LIMITED\n141 Randolph Avenue\nLondon\nW9 1DN\nUnited Kingdom",
          "Email: contact@nivadesk.co.uk",
          "Para preguntas de privacidad, solicitudes de datos o eliminación de cuenta, contáctanos por email."
        ]
      },
      {
        title: "2. Qué cubre esta Política de privacidad",
        paragraphs: ["Esta Política se aplica a nuestro sitio web, la app web de NivaDesk, apps móviles y de escritorio, registro, inicio de sesión, soporte, pagos, suscripciones, archivos subidos, archivos de clientes, pedidos, notas, tareas, datos de flujo de trabajo, contenido del workspace e integraciones conectadas. No se aplica a servicios que no poseemos ni controlamos."]
      },
      {
        title: "3. Nuestro papel: responsable y encargado",
        paragraphs: ["En algunos casos actuamos como responsable del tratamiento, por ejemplo para cuentas, sitio web, soporte o pagos. En otros casos procesamos datos por cuenta de nuestros clientes, cuando un estudio almacena clientes, pedidos, archivos o tareas en NivaDesk. Si tus datos fueron añadidos por un cliente de NivaDesk, contacta primero con ese cliente."]
      },
      {
        title: "4. Datos personales que recopilamos",
        paragraphs: ["Podemos recopilar datos de cuenta y perfil, contenido de workspace y negocio, detalles de clientes y pedidos, notas, tareas, archivos, datos de pago y suscripción, datos técnicos, de dispositivo y uso, comunicaciones de soporte y datos de Google, Apple u otras integraciones."]
      },
      {
        title: "5. Cómo usamos los datos personales",
        paragraphs: ["Usamos datos para crear y gestionar cuentas y workspaces, almacenar y sincronizar pedidos, archivos, tareas y workflows, gestionar roles, dar soporte, procesar pagos, enviar emails de servicio, mejorar seguridad y rendimiento y cumplir obligaciones legales. No usamos el contenido del workspace para anunciar a tus clientes."]
      },
      {
        title: "6. Bases legales del tratamiento",
        paragraphs: ["Cuando aplica UK GDPR o GDPR de la UE, nos basamos en contrato, intereses legítimos, consentimiento y obligación legal, incluyendo proporcionar NivaDesk, seguridad, funciones opcionales, marketing, cookies, integraciones y requisitos fiscales o contables."]
      },
      {
        title: "7. Contenido del workspace y archivos subidos",
        paragraphs: ["NivaDesk permite subir archivos de negocio, archivos de clientes, imágenes, PDFs, diseños y documentos. Los procesamos para almacenar, mostrar, sincronizar, permitir descargas, aplicar permisos, crear metadatos y mantener seguridad y registros. No reclamamos propiedad sobre tu contenido subido."]
      },
      {
        title: "8. Workspaces de equipo y permisos",
        paragraphs: ["Los propietarios y administradores del workspace pueden ver y gestionar tu nombre, email, rol, acceso y actividad dentro del workspace. Si invitas a otro usuario, confirmas que tienes permiso para proporcionar su información."]
      },
      {
        title: "9. Inicio de sesión con Google, Apple y terceros",
        paragraphs: ["Si inicias sesión con Google, Apple u otro proveedor, usamos la información recibida solo para autenticarte y dar acceso a tu cuenta. No recibimos ni guardamos tu contraseña de Google o Apple. No usamos datos de servicios conectados para publicidad ni los vendemos."]
      },
      {
        title: "10. Pagos y suscripciones",
        paragraphs: ["Los pagos pueden ser procesados por Stripe, Apple App Store, Google Play u otras plataformas. Estos proveedores procesan datos de pago según sus propias políticas. Recibimos solo la información necesaria para gestionar plan, facturas, renovaciones, cancelaciones, reembolsos y estado de cuenta."]
      },
      {
        title: "11. Cookies y analítica",
        paragraphs: ["Nuestro sitio y servicios pueden usar cookies o tecnologías similares para mantener sesión, recordar preferencias, mejorar seguridad, entender uso, medir rendimiento y mejorar el producto. Algunas cookies no necesarias pueden depender de tu consentimiento."]
      },
      {
        title: "12. Comunicaciones de marketing",
        paragraphs: ["Podemos enviarte emails sobre actualizaciones, funciones, ofertas o noticias de NivaDesk. Puedes darte de baja en cualquier momento. Aun así podemos enviar emails importantes sobre cuenta, facturación, seguridad, suscripción o avisos legales."]
      },
      {
        title: "13. Con quién compartimos datos personales",
        paragraphs: ["No vendemos tus datos personales. Los compartimos solo con proveedores de confianza cuando es necesario para operar, dar soporte, proteger o mejorar NivaDesk, como hosting, bases de datos, almacenamiento, autenticación, pagos, analítica, soporte, email, monitoreo de errores, asesores o autoridades si lo exige la ley."]
      },
      {
        title: "14. Transferencias internacionales",
        paragraphs: ["Tus datos pueden almacenarse o procesarse en Reino Unido, EEE, Estados Unidos u otros países donde operen nuestros proveedores. Cuando sea necesario, usamos salvaguardas apropiadas para transferencias fuera del UK o EEE."]
      },
      {
        title: "15. Seguridad",
        paragraphs: ["Aplicamos medidas técnicas y organizativas razonables, como autenticación segura, controles de acceso, conexiones cifradas, permisos por rol, controles cloud, monitoreo, copias de seguridad y acceso limitado. Ningún sistema es completamente seguro."]
      },
      {
        title: "16. Retención de datos",
        paragraphs: ["Conservamos datos personales solo mientras sea necesario. Datos de cuenta y workspace se conservan mientras estén activos; datos de facturación pueden conservarse por obligaciones fiscales y contables; datos eliminados pueden permanecer temporalmente en copias de seguridad."]
      },
      {
        title: "17. Eliminación de cuenta y exportación",
        paragraphs: ["Puedes solicitar la eliminación de tu cuenta. Podemos necesitar verificar tu identidad. Si perteneces a un workspace de otra persona, el propietario puede ser responsable del contenido. Cuando esté disponible, puedes exportar tus datos desde NivaDesk aunque tu plan cambie o expire."]
      },
      {
        title: "18. Tus derechos",
        paragraphs: ["Según dónde vivas, puedes tener derechos de acceso, corrección, eliminación, oposición, restricción, portabilidad, retirada de consentimiento, baja de marketing y reclamación ante una autoridad. En Reino Unido puedes contactar al ICO en ico.org.uk. Para ejercer tus derechos escribe a contact@nivadesk.co.uk."]
      },
      {
        title: "19. Niños",
        paragraphs: ["NivaDesk no está dirigido a niños. No recopilamos conscientemente datos personales de niños. Si crees que un niño nos proporcionó datos, contáctanos."]
      },
      {
        title: "20. Sitios y servicios de terceros",
        paragraphs: ["NivaDesk puede contener enlaces a sitios, servicios, integraciones o proveedores de pago de terceros. No somos responsables de sus prácticas de privacidad. Revisa sus políticas."]
      },
      {
        title: "21. Cambios en esta Política",
        paragraphs: ["Podemos actualizar esta Política. Si hacemos cambios importantes, podemos avisarte por email, aviso en la app o actualizando la fecha de esta página."]
      },
      {
        title: "22. Contacto",
        paragraphs: [
          "Si tienes preguntas sobre esta Política, tus datos personales o tus derechos, contacta:",
          "EGGCRAFT LIMITED\n141 Randolph Avenue\nLondon\nW9 1DN\nUnited Kingdom",
          "Email: contact@nivadesk.co.uk"
        ]
      }
    ]
  },
  Português: {
    lastUpdatedLabel: "Última atualização",
    sections: [
      {
        title: "1. Quem somos",
        paragraphs: [
          "A NivaDesk é operada por:",
          "EGGCRAFT LIMITED\n141 Randolph Avenue\nLondon\nW9 1DN\nUnited Kingdom",
          "Email: contact@nivadesk.co.uk",
          "Para perguntas de privacidade, pedidos de dados ou eliminação de conta, contacte-nos por email."
        ]
      },
      {
        title: "2. O que esta Política de Privacidade cobre",
        paragraphs: ["Esta Política aplica-se ao nosso site, à app web NivaDesk, apps móveis e desktop, registo, login, suporte, pagamentos, subscrições, ficheiros carregados, ficheiros de clientes, encomendas, notas, tarefas, dados de workflow, conteúdo do workspace e integrações ligadas. Não se aplica a serviços que não possuímos ou controlamos."]
      },
      {
        title: "3. O nosso papel: responsável e subcontratante",
        paragraphs: ["Em alguns casos somos responsáveis pelo tratamento, por exemplo em contas, site, suporte ou pagamentos. Noutros casos processamos dados em nome dos nossos clientes, quando um estúdio guarda clientes, encomendas, ficheiros ou tarefas na NivaDesk. Se os seus dados foram adicionados por um cliente NivaDesk, contacte primeiro esse cliente."]
      },
      {
        title: "4. Dados pessoais que recolhemos",
        paragraphs: ["Podemos recolher dados de conta e perfil, conteúdo de workspace e negócio, detalhes de clientes e encomendas, notas, tarefas, ficheiros, dados de pagamento e subscrição, dados técnicos, de dispositivo e utilização, comunicações de suporte e dados de Google, Apple ou outras integrações."]
      },
      {
        title: "5. Como usamos dados pessoais",
        paragraphs: ["Usamos dados para criar e gerir contas e workspaces, guardar e sincronizar encomendas, ficheiros, tarefas e workflows, gerir funções, prestar suporte, processar pagamentos, enviar emails de serviço, melhorar segurança e desempenho e cumprir obrigações legais. Não usamos conteúdo do workspace para anunciar aos seus clientes."]
      },
      {
        title: "6. Bases legais do tratamento",
        paragraphs: ["Quando se aplica o UK GDPR ou GDPR da UE, baseamo-nos em contrato, interesses legítimos, consentimento e obrigação legal, incluindo fornecer a NivaDesk, segurança, funções opcionais, marketing, cookies, integrações e requisitos fiscais ou contabilísticos."]
      },
      {
        title: "7. Conteúdo do workspace e ficheiros carregados",
        paragraphs: ["A NivaDesk permite carregar ficheiros de negócio, ficheiros de clientes, imagens, PDFs, ficheiros de design e documentos. Processamo-los para guardar, mostrar, sincronizar, permitir downloads, aplicar permissões, criar metadados e manter segurança e registos. Não reivindicamos propriedade sobre o conteúdo carregado."]
      },
      {
        title: "8. Workspaces de equipa e permissões",
        paragraphs: ["Proprietários e administradores do workspace podem ver e gerir nome, email, função, acesso e atividade no workspace. Se convidar outro utilizador, confirma que tem permissão para fornecer as informações dessa pessoa."]
      },
      {
        title: "9. Login com Google, Apple e terceiros",
        paragraphs: ["Se iniciar sessão com Google, Apple ou outro fornecedor, usamos as informações recebidas apenas para autenticação e acesso à conta. Não recebemos nem guardamos a sua palavra-passe Google ou Apple. Não usamos dados de serviços ligados para publicidade nem os vendemos."]
      },
      {
        title: "10. Pagamentos e subscrições",
        paragraphs: ["Pagamentos podem ser processados por Stripe, Apple App Store, Google Play ou outras plataformas. Estes fornecedores processam dados de pagamento segundo as suas políticas. Recebemos apenas informação necessária para gerir plano, faturas, renovações, cancelamentos, reembolsos e estado da conta."]
      },
      {
        title: "11. Cookies e analytics",
        paragraphs: ["O site e serviços podem usar cookies ou tecnologias semelhantes para manter sessão, lembrar preferências, melhorar segurança, compreender utilização, medir desempenho e melhorar o produto. Alguns cookies não essenciais podem depender do seu consentimento."]
      },
      {
        title: "12. Comunicações de marketing",
        paragraphs: ["Podemos enviar emails sobre atualizações, funcionalidades, ofertas ou notícias da NivaDesk. Pode cancelar a subscrição a qualquer momento. Ainda podemos enviar emails importantes sobre conta, faturação, segurança, subscrição ou avisos legais."]
      },
      {
        title: "13. Com quem partilhamos dados pessoais",
        paragraphs: ["Não vendemos os seus dados pessoais. Partilhamos dados apenas com fornecedores de confiança quando necessário para operar, apoiar, proteger ou melhorar a NivaDesk, incluindo hosting, bases de dados, armazenamento, autenticação, pagamentos, analytics, suporte, email, monitorização de erros, consultores ou autoridades quando exigido por lei."]
      },
      {
        title: "14. Transferências internacionais",
        paragraphs: ["Os seus dados podem ser guardados ou processados no Reino Unido, EEE, EUA ou outros países onde os nossos fornecedores operam. Quando necessário, usamos salvaguardas adequadas para transferências fora do UK ou EEE."]
      },
      {
        title: "15. Segurança",
        paragraphs: ["Aplicamos medidas técnicas e organizacionais razoáveis, como autenticação segura, controlos de acesso, ligações cifradas, permissões por função, controlos cloud, monitorização, backups e acesso limitado. Nenhum sistema é totalmente seguro."]
      },
      {
        title: "16. Retenção de dados",
        paragraphs: ["Mantemos dados pessoais apenas pelo tempo necessário. Dados de conta e workspace são mantidos enquanto ativos; dados de faturação podem ser mantidos por obrigações fiscais e contabilísticas; dados apagados podem permanecer temporariamente em backups."]
      },
      {
        title: "17. Eliminação de conta e exportação de dados",
        paragraphs: ["Pode pedir a eliminação da conta. Podemos precisar de verificar a sua identidade. Se pertence a um workspace de outra pessoa, o proprietário pode ser responsável pelo conteúdo. Quando disponível, pode exportar os seus dados da NivaDesk mesmo que o plano mude ou expire."]
      },
      {
        title: "18. Os seus direitos",
        paragraphs: ["Dependendo de onde vive, pode ter direitos de acesso, correção, eliminação, oposição, limitação, portabilidade, retirada de consentimento, opt-out de marketing e reclamação a uma autoridade. No Reino Unido pode contactar o ICO em ico.org.uk. Para exercer direitos escreva para contact@nivadesk.co.uk."]
      },
      {
        title: "19. Crianças",
        paragraphs: ["A NivaDesk não se destina a crianças. Não recolhemos conscientemente dados pessoais de crianças. Se acredita que uma criança nos forneceu dados, contacte-nos."]
      },
      {
        title: "20. Sites e serviços de terceiros",
        paragraphs: ["A NivaDesk pode conter links para sites, serviços, integrações ou fornecedores de pagamento de terceiros. Não somos responsáveis pelas suas práticas de privacidade. Reveja as respetivas políticas."]
      },
      {
        title: "21. Alterações a esta Política",
        paragraphs: ["Podemos atualizar esta Política. Se fizermos alterações materiais, podemos avisar por email, aviso na app ou atualizando a data nesta página."]
      },
      {
        title: "22. Contacto",
        paragraphs: [
          "Se tiver perguntas sobre esta Política, os seus dados ou direitos, contacte:",
          "EGGCRAFT LIMITED\n141 Randolph Avenue\nLondon\nW9 1DN\nUnited Kingdom",
          "Email: contact@nivadesk.co.uk"
        ]
      }
    ]
  }
};

// English is the current authoritative public legal copy. Localised policy
// drafts remain in this file for later review but are intentionally not shown
// until they are aligned with the current subscription and file-retention terms.
export function getPrivacyPolicySections(_language: StudioLanguage | string | null | undefined) {
  return PRIVACY_POLICY_SECTIONS;
}

export function getPrivacyPolicyLastUpdatedLabel(_language: StudioLanguage | string | null | undefined) {
  return "Last updated";
}
