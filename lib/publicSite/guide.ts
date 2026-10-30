import type { StudioLanguage } from "@/lib/studioflow/language";
import { GUIDE_T } from "@/lib/publicSite/guideTranslations";
import type { GuideNode } from "@/lib/publicSite/guideChrome";

// ---------------------------------------------------------------------------
// NivaDesk user guide (interactive, menu-by-menu) — SERVER SIDE ONLY.
//
// The guide is a docs-style tree: the left column lists every menu (and, for
// Orders, every detail card). Selecting an entry shows its detailed content on
// the right.
//
// Do NOT import this module from a client component. The guide is a paid-plan
// feature: functions/assistant/buildGuideCorpus.js turns it into JSON that the
// getUserGuide callable serves after checking the caller's plan. Importing it
// here would put every word back in the public bundle. Page chrome lives in
// guideChrome.ts, which is the client-safe half.
//
// Content is provided in English and Turkish; other languages are localized
// through GUIDE_T, falling back to English string by string.
//
// Each node's `blocks` render in order. Block kinds:
//   { kind: "para",    text }        a paragraph
//   { kind: "sub",     text }        a small sub-heading
//   { kind: "bullets", items: [] }   a bullet list
//   { kind: "steps",   items: [] }   a numbered list
// A node may have `children` (e.g. Orders → its cards), shown nested in the nav.
// ---------------------------------------------------------------------------

// --- English tree ----------------------------------------------------------

// Adding something to the chatbot? Read docs/chatbot.md first - it is short.
//
// The three rules that catch everyone:
//   1. The assistants read functions/assistant/guideCorpus.json, NOT this file.
//      Run `node functions/assistant/buildGuideCorpus.js` and commit the result,
//      or the bot keeps answering from the old text with no sign anything is
//      wrong. guide-corpus-fresh.test.js fails if you forget.
//   2. `para` blocks are PUBLIC - the website assistant shows them to visitors.
//      `bullets` are members only. Put steps in a para and you have published
//      the operating manual to the marketing site.
//   3. Say WHERE, with the real button names, or the model invents a menu path.
//      Platform-specific lines start with [Web], [Mac], [iPhone/iPad] or
//      [Android]; untagged lines are true everywhere, and most should be.
const TREE_EN: GuideNode[] = [
  {
    id: "getting-started",
    title: "Getting started",
    blocks: [
      { kind: "para", text: "What happens the first time you sign in, and how to set up your new workspace." }
    ],
    children: [
      {
        id: "first-sign-in-setup",
        title: "Setting up your workspace when you first sign in",
        blocks: [
          { kind: "para", text: "When you first open NivaDesk, a five-step setup gets your workspace ready for your kind of work. There is no Skip: every step is answerable, and the step that asks how you want to start offers \"Start empty\" and \"I'll set this up later\" as real choices. Back is there from step two onwards." },
          { kind: "steps", items: [
            "Workspace basics: country, currency and time zone, suggested from where you are and changeable now or later in Settings.",
            "What NivaDesk should help with first: your answer decides the three starting tasks you see when setup finishes.",
            "Tell us about your work: what you make or repair, which sets your order cards, your production stages and your labels.",
            "Bring your work in: connect Shopify, WooCommerce or Etsy — or start another way, with your first order, a sample workspace, a spreadsheet import, an empty workspace, or \"I'll set this up later\".",
            "Your plan: the 14 trial days are free on any of them, nothing is charged until they end, and you can change plan at any time."
          ] },
          { kind: "para", text: "The setup runs once per workspace. If you have already been through it, everything it set is in Settings." }
        ]
      },
      {
        id: "what-the-setup-changes",
        title: "What your setup answers change",
        blocks: [
          { kind: "para", text: "The questions are not a survey: each answer changes the workspace you get." },
          { kind: "bullets", items: [
            "What you make or repair picks your order card layout, your fields and your labels.",
            "How you mainly work picks your production board's lanes — a repair shop gets Intake, In Repair, Waiting, Testing and Ready for Collection instead of Ready to Ship.",
            "What you want help with first picks the three starting tasks on the ready screen.",
            "How many people will use NivaDesk decides whether your free fortnight runs on Pro or on Team."
          ] },
          { kind: "para", text: "Nothing here is permanent: your business type, workflow steps, labels and production stages can all be changed later in Settings." }
        ]
      }
    ]
  },
  {
    id: "trial-and-plans",
    title: "Your free trial and plans",
    blocks: [
      { kind: "para", text: "What signing up costs, when the paid trial starts, and what happens when it ends." }
    ],
    children: [
      {
        id: "trial-no-credit-card",
        title: "No credit card to sign up",
        blocks: [
          { kind: "para", text: "You do not need a credit card to sign up for NivaDesk, and no payment details are asked for anywhere in setup. The Free plan never expires: 10 active orders, unlimited customers, your personal notes and export access, at no cost and with no time limit." },
          { kind: "para", text: "The 14-day trial of the paid plan is separate, and it does not start when you register." }
        ]
      },
      {
        id: "trial-when-it-starts",
        title: "When the 14-day trial starts",
        blocks: [
          { kind: "steps", items: [
            "It starts when you create your first order — not at sign-up, so the fortnight is spent working rather than looking around.",
            "It runs on Pro, or on Team if you said more than one person would use NivaDesk during setup.",
            "No credit card is taken and no subscription is created. Nothing renews and nothing can be charged.",
            "A banner shows what is left, and what the trial has been worth so far. It collapses if you would rather not see it."
          ] },
          { kind: "para", text: "Each workspace gets one trial, so starting a paid plan at checkout does not add another fortnight on top." }
        ]
      },
      {
        id: "trial-when-it-ends",
        title: "What happens when the trial ends",
        blocks: [
          { kind: "para", text: "The workspace goes back to Free, and a notice says so plainly with \"Continue on Free\" and \"Choose a plan\" side by side. Nothing is deleted: every order, customer, file and note stays visible and exportable." },
          { kind: "para", text: "What stops is the paid-plan features — Client Files, advanced finance, team messaging — and creating new orders beyond the Free limit of 10 active ones. Marking finished orders delivered, or deleting ones you no longer need, brings you back under the limit. NivaDesk never decides which of your orders to keep." },
          { kind: "para", text: "Upgrading later picks everything up exactly where it stopped." }
        ]
      },
      {
        id: "plan-where-billed",
        title: "Where your plan is billed, and why you can only buy in one place",
        blocks: [
          { kind: "para", text: "A NivaDesk plan can be paid for in four places: by card on the website, through the App Store on Mac and iPhone, through Google Play on Android, or on your Shopify invoice if you installed us from the Shopify App Store. Whichever one you used is the only place that plan can be changed." },
          { kind: "bullets", items: [
            "The plan page in every app tells you where your subscription lives, and does not offer to sell you the same plan a second time — buying again somewhere else would mean two companies charging you for one workspace, and neither of them would know about the other.",
            "To move to a different plan, change it where you already pay: the website Billing portal, your Apple subscriptions, your Google Play subscriptions, or the NivaDesk app inside your Shopify admin.",
            "To move to a different place, cancel the subscription you have first, then buy again where you want it. Your workspace and everything in it stay exactly as they are.",
            "Changing tier where you already pay — Lite to Pro, monthly to yearly — is a normal upgrade and works as it always did.",
            "Extra storage and extra team seats are add-ons, not plans. They are sold wherever you are, whichever place your plan is billed."
          ] }
        ]
      },
      {
        id: "trial-monthly-yearly",
        title: "Monthly and yearly billing",
        blocks: [
          { kind: "para", text: "Yearly billing is ten months' price for twelve. The plan page shows the monthly equivalent and the exact amount saved beside each yearly price — Pro is £190 a year, which is £15.83 a month and £38 saved — so you can compare the two honestly." },
          { kind: "para", text: "You can switch between monthly and yearly at any time, and cancel from Settings ▸ Plan & Access without contacting us." }
        ]
      }
    ]
  },
  {
    id: "home",
    title: "Home",
    blocks: [
      { kind: "para", text: "Home is the screen you land on, and it is yours: a wall of cards showing the state of the workshop at a glance — what needs doing, what is coming, what came in. You choose which cards are there, how big each one is and in what order they sit." },
      { kind: "sub", text: "The cards" },
      { kind: "bullets", items: [
        "Getting started — the setup checklist, with the next step first. Steps you wave off stay waved off for you and stay put for everyone else.",
        "Quick actions — the handful of things you start most often.",
        "Recent activity — what has happened in the workspace lately.",
        "Money — what has been invoiced, paid and is still owed, over the months it is counting.",
        "Banking — the feed, what is waiting for review, and what needs a receipt.",
        "Inventory — what the stock is doing, and what is running low.",
        "Customers — who is new and who has work in progress.",
        "Orders & production — the lanes of the production board and the orders in them.",
        "Schedule — the week, and which order each date belongs to.",
        "Files — how full the workspace is and what needs doing in the library.",
        "Notes — your latest notes, pinned ones looking pinned.",
      ] },
      { kind: "sub", text: "Changing the layout" },
      { kind: "steps", items: [
        "Press Customise. The button becomes Done, and a bar appears with the cards you do not currently have.",
        "Drag a card to move it. [Android] Press and hold a card first — outside Customise a long press does nothing, so the drag only starts once you are in it.",
        "Change a card's size between 1×1, 2×1 and 2×2. Every card offers all three, and the same card says more at a bigger size rather than just growing.",
        "Add a card from the bar below, or hide one you do not want. A hidden card is not deleted — it goes back to the bar so you can put it back.",
        "Press Done. The layout saves itself.",
      ] },
      { kind: "sub", text: "Two things worth knowing" },
      { kind: "bullets", items: [
        "The layout is YOURS, not the workspace's. Rearranging your Home does not move anybody else's, so a bench jeweller and a bookkeeper can each have the screen they need.",
        "You only see the cards your access allows. Money and Banking need financial access, so a colleague without it does not see them in the bar either — the card is not hidden from them, it is simply not theirs to place.",
      ] },
    ]
  },
  {
    id: "dashboard",
    title: "Dashboard",
    blocks: [
      { kind: "para", text: "Your home overview. Start your day here to see what needs attention before you dive into individual orders." },
      { kind: "bullets", items: [
        "Quick stats on active orders, what is due soon and recent activity.",
        "Spot overdue or at-risk jobs early so they don't slip.",
        "Jump straight to an order that needs you."
      ] },
      { kind: "bullets", items: [
        "New workspaces see a Getting started checklist at the top of the Dashboard: create your first order, add a customer, import old orders with ChatGPT, connect a store and claim your customer-link name. The first two tick themselves as your data appears; Hide this checklist puts it away."
      ] },
      { kind: "sub", text: "Reading the money cards" },
      { kind: "bullets", items: [
        "Revenue counts the value of orders in the selected period, whether or not the money has arrived yet.",
        "Payments Received counts only money actually collected in the period — compare it with Revenue to see what is still out.",
        "Outstanding Balance is what customers still owe across those orders.",
        "Net Profit is revenue minus base cost, extra spending, platform fees, shipping and VAT. Hover any card title for its exact formula.",
        "Cancelled and refunded orders are left out of every money figure; the Financial Breakdown shows them on their own \"Cancelled or refunded\" line.",
        "The Tax set-aside card holds net VAT — VAT collected on sales minus reclaimable VAT inside bank payments marked Standard or Reduced rate — plus Corporation Tax when enabled.",
        "Click any point on the Net Profit chart to zoom the dashboard to that period.",
        "The period switcher has quick presets — Last 7 or 30 days, this or last quarter, and the UK tax year — plus a custom range.",
        "When Shopify or WooCommerce orders exist, channel pills under the period switcher scope every figure to one sales channel — or to manually created orders.",
        "Orders imported in another currency are listed in the Financial Breakdown in their original currency, marked not converted — NivaDesk never silently converts money.",
        "The Financial Breakdown also shows the Average order value for the selected range (revenue ÷ counted orders) and a New vs Returning customers split — a customer is new when their first order falls inside the range, counted across all sales channels."
      ] }
    ]
  },
  {
    id: "orders",
    title: "Orders",
    blocks: [
      { kind: "para", text: "Orders is the heart of NivaDesk: the list of every job you are working on. From here you create orders, find them quickly and open one to manage all of its details." },
      { kind: "sub", text: "The orders list" },
      { kind: "bullets", items: [
        "Add Project: create a new order. You give it a customer, a title and the basics; you can fill in the rest inside the order.",
        "Search: type a customer name, order number or keyword to jump straight to an order.",
        "Quick filters: narrow the list (for example only your assigned orders, or by stage) without losing the others.",
        "Sort: order the list by smart priority, newest, due date and more.",
        "Status badges: small colored tags on each card show production status at a glance; you can turn them off in settings.",
        "Open an order: tap a card to open its detail workspace."
      ] },
      { kind: "sub", text: "The order detail workspace" },
      { kind: "para", text: "Opening an order shows a set of cards: Preview, Order Summary, Financial Info, Client Files and more. Each card covers one part of the job. You decide which cards you see and how they are arranged." },
      { kind: "bullets", items: [
        "Show or hide any card so you only see what matters to you.",
        "Drag a card to reorder it; drag its edge to resize the height.",
        "The ... button on a card opens Block customisation: move it with Up/Down/Left/Right, size it (Fit content, Match column, or S/M/L presets), colour it, hide it, or Reset just that card back to defaults.",
        "Give a card a color (8 options) to make it stand out — each colour carries a meaning label (Urgent, Approved, ...) shown on the card. Manage colour labels lets you rename these meanings for your whole workspace, on every platform.",
        "Your layout is saved to your own user as a card profile: your teammates keep their own layouts, while the order content stays shared.",
        "Some cards let you Edit headings to rename, add or remove their sections and fields (covered on each card below)."
      ] },
      { kind: "sub", text: "Export & invoice" },
      { kind: "bullets", items: [
        "Export the order as a PDF: a clean summary built from your PDF Export Settings.",
        "Generate an Invoice: NivaDesk assigns an invoice number automatically (if the order has none) and uses your business details and footer note from Settings.",
        "You can also print the To Do list and the History log as PDFs.",
        "Customize how all of these look in Settings ▸ PDF Export Settings."
      ] },
      { kind: "sub", text: "Merging orders that should have been one" },
      { kind: "bullets", items: [
        "The same customer ordering twice in a week, or one job that came in through the website and again by email, leaves two orders where there should be one. Tick them in the Orders list and press Merge Selected.",
        "Choose which one is the primary order — that is the order that survives, keeping its number, its cards and its history.",
        "Payments move across: every payment recorded on the other orders is added to the primary one, and the amount paid adds up rather than being retyped.",
        "The orders merged in go to Trash rather than being destroyed, so a merge done by mistake can be undone from Settings ▸ Data Management within 30 days.",
        "Merging needs a role that can edit orders."
      ] },
      { kind: "para", text: "Select a card on the left to see exactly what it does and what you can change in it." }
    ],
    children: [
      {
        id: "card-preview",
        title: "Preview card",
        blocks: [
          { kind: "para", text: "The Preview card is the visual header of the order. It shows the order image and your business logo, giving you and your client an instant sense of the job." },
          { kind: "sub", text: "What you can do" },
          { kind: "bullets", items: [
            "Add or replace the order preview image (for example a photo of the product, design or repair).",
            "The image also appears next to the order in the Orders list and on the exported PDF, so it is worth adding a clear photo.",
            "Preview images accept standard image files (JPG, PNG, HEIC and similar)."
          ] },
          { kind: "para", text: "Tip: a good preview photo makes orders far easier to recognize at a glance in a busy list." }
        ]
      },
      {
        id: "card-repair-intake",
        title: "Repair Intake & Item card",
        blocks: [
          { kind: "para", text: "When a customer hands you their own item to repair, service or alter, this card is the record of what came in. It is deliberately not inventory: the item is stamped as customer-owned so nothing downstream can mistake it for your stock." },
          { kind: "sub", text: "What it shows" },
          { kind: "bullets", items: [
            "A row for each detail you record at intake. What those rows are depends on your trade — a jeweller records Metal, Hallmark and Stones; a phone repairer records Serial / IMEI and whether the passcode was handed over.",
            "Condition and Requested Work, one line each, so the state it arrived in and the job agreed are written down separately.",
            "Customer Instructions for anything the customer specifically asked for.",
            "Intake Photos: pictures of the item as it arrived, shared with that order's Client Files. Four thumbnails at a time; tap one to open it full size.",
            "Received and Received By: when the item came in and who took it."
          ] },
          { kind: "sub", text: "What you can change" },
          { kind: "bullets", items: [
            "Tap any value to fill it in, and tap a heading to rename it — ‘Ring Size’ to a jeweller is ‘Case Size’ to a watchmaker.",
            "Use Edit block headings to start from a trade template (jewellery, watch, electronics, tailoring, shoe and leather, furniture, bicycle, automotive, instruments, or a general set) and then add, rename or delete rows.",
            "Until you edit the rows, the trade you chose when you signed up decides which template you start on."
          ] },
          { kind: "para", text: "Tip: photograph the item at intake even when it looks fine. It is the cheapest possible protection against a disagreement about a scratch later." }
        ]
      },
      {
        id: "card-estimate",
        title: "Estimate & Approval card",
        blocks: [
          { kind: "para", text: "Quote a price, send it to the customer, and keep proof of what they agreed to. The estimate is built from the order's invoice items, and every revision is preserved — an approved estimate is evidence of what was agreed, so it is never edited or deleted." },
          { kind: "sub", text: "What it shows" },
          { kind: "bullets", items: [
            "The current estimate with its own number (for example EST-2026-0001), its status, and its line items with subtotal, VAT and total.",
            "Approval Details once the customer decides: who approved it, when, how, and their signature.",
            "Estimate History listing every earlier revision with its number and total.",
            "A View Estimate PDF button, available to anyone who can see the card."
          ] },
          { kind: "sub", text: "How it works" },
          { kind: "steps", items: [
            "Add your invoice items, then tap Create estimate. The number, the totals and the status are all set by NivaDesk, never by the device.",
            "Tap Send to customer. You get a private link to send them however you normally talk to them.",
            "The customer opens the link without signing in, reviews the figures, and approves or declines. Approving asks for their name and a signature.",
            "The card updates with the decision, and the signature appears on the estimate PDF."
          ] },
          { kind: "sub", text: "Revisions" },
          { kind: "bullets", items: [
            "Create new estimate makes a fresh revision. The previous one is marked superseded and keeps its own number and figures.",
            "Making a new estimate turns off the previous link, so an old price can never be approved by mistake.",
            "The approval evidence is stored where no device can reach it — it can be read, but not altered."
          ] }
        ]
      },
      {
        id: "card-customer-portal",
        title: "Customer Portal card",
        blocks: [
          { kind: "para", text: "The question every repair shop answers all day is ‘is mine ready yet?’. This card is the answer: one link per order that the customer opens with no login, showing where their item is." },
          { kind: "sub", text: "What the customer sees" },
          { kind: "bullets", items: [
            "Repair status as a progress track. The stages are your own workflow steps, so it reads correctly whether you are a jeweller, a tailor or a furniture restorer.",
            "Estimate and approval, payment and balance, photos, and the expected completion date.",
            "Your business name and logo at the top — not NivaDesk's."
          ] },
          { kind: "sub", text: "What the customer never sees" },
          { kind: "para", text: "Internal notes, cost prices, supplier names, profit and team messages. These are not filtered out of the order on the way to the page — the page is built only from the parts you switch on, so nothing else can leak into it." },
          { kind: "sub", text: "What you can change" },
          { kind: "bullets", items: [
            "Switch each of the five sections on or off per order, and the page honours it immediately.",
            "Create portal link to make the link, Copy Link to send it again later, and Turn off to stop it opening.",
            "Creating a fresh link retires the previous one — that is how you take back a link sent to the wrong person."
          ] },
          { kind: "sub", text: "Automatic updates" },
          { kind: "bullets", items: [
            "With updates on, moving the order to a new status tells the customer automatically: their estimate is ready, work has started, or their item is ready for collection.",
            "Email is on by default. SMS is off by default and each business turns it on for itself.",
            "The message comes from your business name, and replies come back to you."
          ] },
          { kind: "para", text: "Tip: send the link when the item comes in, not when it is finished. Most of the calls you are trying to avoid happen in the middle." }
        ]
      },
      {
        id: "card-summary",
        title: "Order Summary card",
        blocks: [
          { kind: "para", text: "The Order Summary card is your at-a-glance status panel: the key numbers, stages and dates you check most often, all in one place." },
          { kind: "sub", text: "What it shows" },
          { kind: "bullets", items: [
            "Order Value: the total value of the order. If your role cannot see finances it shows ‘Hidden’ instead.",
            "Two status steps: the two most important stages of the job (for example design and production), each with a colored badge that reflects its current status.",
            "Placed On: the date the order was started.",
            "Delivery In: a live countdown to the delivery date that turns red when the order is due soon or overdue."
          ] },
          { kind: "sub", text: "What you can change" },
          { kind: "bullets", items: [
            "Use Edit headings to choose which two status steps appear here and rename their labels to match your own workflow.",
            "The status badges and the Delivery In color update automatically as the order progresses, so the card always reflects the real state."
          ] }
        ]
      },
      {
        id: "card-customer",
        title: "Customer & Communication card",
        blocks: [
          { kind: "para", text: "This card holds who the order is for and how to reach them: the customer's details and your communication channels, all editable in place." },
          { kind: "sub", text: "What it shows" },
          { kind: "bullets", items: [
            "Customer Name and Design Name.",
            "Any custom fields you add, for example a reference number, an Instagram handle or a project code.",
            "A Communication section with Telephone, Email and Address.",
            "Channel buttons such as Instagram, WhatsApp or TikTok for quick contact."
          ] },
          { kind: "para", text: "Tap any value to edit it in place (if your role can edit order details)." },
          { kind: "sub", text: "What you can change" },
          { kind: "bullets", items: [
            "Use Edit headings to add, rename or remove your own custom fields.",
            "Show or hide Telephone, Email and Address.",
            "Add, rename or remove channel buttons. Telephone and Email stay as their own fields and can be shown or hidden separately."
          ] }
        ]
      },
      {
        id: "card-materials",
        title: "Materials & Inventory card",
        blocks: [
          { kind: "para", text: "Track the parts and materials a job needs, whether each one is sourced, received and ready, so you never start work missing something." },
          { kind: "sub", text: "What it shows" },
          { kind: "bullets", items: [
            "A yes/no checklist of material steps. The default labels come from your workspace Inventory Labels (set in Settings), for example ‘Dial Sourced’, ‘Dial Received’ or ‘Materials Ready’.",
            "Optional extra yes/no toggles for anything else you want to track on this order.",
            "A Notes / Supplier field for supplier details or a quick note."
          ] },
          { kind: "para", text: "Tap a row to flip it between yes and no as materials arrive." },
          { kind: "sub", text: "What you can change" },
          { kind: "bullets", items: [
            "Use Edit headings to add, rename or remove checklist items and extra toggles.",
            "Show or hide the Notes / Supplier field and rename its label.",
            "The default checklist labels follow your workspace Inventory Labels in Settings, so changing them there updates every order."
          ] }
        ]
      },
      {
        id: "card-priority",
        title: "Priority / Risk card",
        blocks: [
          { kind: "para", text: "Flag how urgent an order is and whether anything is holding it up, so the team can focus on what matters and spot stuck jobs early." },
          { kind: "sub", text: "What it shows" },
          { kind: "bullets", items: [
            "Priority: Low, Normal, High or Urgent. High and Urgent stand out in the Orders list so they are easy to catch.",
            "Risk: None, Waiting, Blocked or Overdue, to mark a job that cannot move forward right now.",
            "Risk reason: appears once Risk is set to anything other than None. Choose why, for example Waiting for customer, Waiting for payment or Waiting for material."
          ] },
          { kind: "para", text: "Pick a value from each dropdown and it saves instantly. Priority and risk also feed the smart sort and the status badges in the Orders list, so flagged jobs rise to the top." }
        ]
      },
      {
        id: "card-delivery",
        title: "Timeline & Delivery card",
        blocks: [
          { kind: "para", text: "See the order's timeline at a glance and keep the delivery date front and center, so nothing is delivered late." },
          { kind: "sub", text: "What it shows" },
          { kind: "bullets", items: [
            "Created Date and Delivery Due, shown as two clear date cards.",
            "Time Remaining: the days left until delivery, color-coded so a tight or overdue deadline stands out.",
            "Add to Calendar: downloads an all-day calendar file spanning the created date to the delivery date, so the order appears in your calendar app (available from NivaDesk Starter)."
          ] },
          { kind: "sub", text: "What you can edit" },
          { kind: "bullets", items: [
            "Delivery Time (in days), the Delivery Due date and the Created Date: tap to change any of them.",
            "Time Remaining and all the colors recalculate automatically as soon as you change a date."
          ] }
        ]
      },
      {
        id: "card-notes",
        title: "Notes card",
        blocks: [
          { kind: "para", text: "Keep written notes about the order, instructions, decisions and reminders, in one place the whole workspace can see." },
          { kind: "sub", text: "What it shows" },
          { kind: "bullets", items: [
            "The main Customer Notes, which stays linked to the customer's profile.",
            "One or more Special Notes sections beneath it for anything specific to this order."
          ] },
          { kind: "sub", text: "What you can do" },
          { kind: "bullets", items: [
            "Type into any section: it saves automatically.",
            "Use the + button to add a note field to this order only, give it a title, and remove it when you no longer need it.",
            "Use Edit headings to add, rename or remove the Special Notes sections that appear on every order across the workspace."
          ] }
        ]
      },
      {
        id: "card-clientfiles",
        title: "Client Files card",
        blocks: [
          { kind: "para", text: "Attach the documents and images that belong to this order, proofs, designs, receipts, reference photos, so everything for the job lives with it." },
          { kind: "sub", text: "What you can do" },
          { kind: "bullets", items: [
            "Upload File: pick PDF, image, PSD or PSB files. You can also drag and drop files straight onto the card.",
            "Tap a file to preview it, or use Download all to grab everything at once.",
            "Delete a file if your role is allowed to.",
            "Works offline: files are saved on the device and upload automatically when you are back online."
          ] },
          { kind: "sub", text: "Safety" },
          { kind: "bullets", items: [
            "The maximum file size and the upload policy come from Settings ▸ Safety & Uploads.",
            "Where required, you tick to accept the upload policy on this browser before uploading."
          ] }
        ]
      },
      {
        id: "card-todo",
        title: "To Do card",
        blocks: [
          { kind: "para", text: "A task checklist for this specific order: break the job into steps, assign them and track what is done." },
          { kind: "sub", text: "What you can do" },
          { kind: "bullets", items: [
            "Add a task with the input, then give it a due date, a priority, an assignee and an optional note.",
            "Filter the list by All, Mine, Open, Overdue or Done to focus on what matters now.",
            "Mark a task Done or Reopen it, and delete tasks you no longer need."
          ] },
          { kind: "sub", text: "Good to know" },
          { kind: "bullets", items: [
            "The Overdue filter surfaces any task past its due date, so nothing slips.",
            "If your role is view-only, you can see tasks but cannot edit them."
          ] }
        ]
      },
      {
        id: "card-worktime",
        title: "Work Time card",
        blocks: [
          { kind: "para", text: "Track how much time you spend on an order, so you can see the real effort per job and price future work more accurately." },
          { kind: "sub", text: "What you can do" },
          { kind: "bullets", items: [
            "Give the work a title and start a timed session: the card shows ‘Running now’ while it counts.",
            "Stop a session when you pause, and Continue it later to keep adding to the same task.",
            "See the Total Work Time for the order, plus a list of every session.",
            "Delete a session you no longer need."
          ] }
        ]
      },
      {
        id: "card-financial",
        title: "Financial Info card",
        blocks: [
          { kind: "para", text: "The full money picture for the order: what was charged, what it costs you, the tax, and the real profit left over." },
          { kind: "sub", text: "What it shows" },
          { kind: "bullets", items: [
            "Order Value, Paid / Received and the Remaining balance, plus the payment method.",
            "Your costs: Base Cost, Platform Fee and Shipping Cost.",
            "Tax: VAT Rule, VAT Rate and VAT Amount, following the tax rules you set in Settings.",
            "Profit: Profit before Corporation Tax, Net Profit after Corporation Tax, and the Final Profit."
          ] },
          { kind: "sub", text: "What you can change" },
          { kind: "bullets", items: [
            "Use Edit headings to customize the Spending / Cost headings so they match how you track costs.",
            "The tax rate, rule and transition date come from Settings ▸ Financial and apply across your orders."
          ] },
          { kind: "para", text: "This card only appears for roles allowed to see finances; for everyone else the order's money stays hidden." },
          { kind: "sub", text: "Payment links (Stripe): ask the customer to pay online" },
          { kind: "bullets", items: [
            "Once Stripe is connected, Payment links inside this card shows Still to pay and Not yet asked for. + New payment link creates a link for a Deposit, an Instalment or the Remaining balance; Copy link and send it to your customer. See Settings › Stripe card payments and payment links."
          ] }
        ]
      },
      {
        id: "card-status",
        title: "Production Status card",
        blocks: [
          { kind: "para", text: "Track where the order is in production: each stage of your workflow with its own status, so anyone can see progress at a glance." },
          { kind: "sub", text: "What it shows" },
          { kind: "bullets", items: [
            "One row per workflow step (for example Design, Production or Finishing), each set to a status such as Not Yet, In Progress, Done or Cancelled.",
            "The available status options come from your workspace and can be customized in Settings."
          ] },
          { kind: "sub", text: "What you can change" },
          { kind: "bullets", items: [
            "Use Edit headings to add, rename or remove the status steps so they match your craft's workflow.",
            "Changing a step here updates the colored status badges in the Orders list and the Order Summary card."
          ] }
        ]
      },
      {
        id: "card-shipping",
        title: "Shipping & Tracking card",
        blocks: [
          { kind: "para", text: "Manage delivery for the order: the courier, the tracking number, and live status updates, all without leaving the app." },
          { kind: "sub", text: "What you can do" },
          { kind: "bullets", items: [
            "Set the Courier (Auto Detect, Royal Mail, DHL, FedEx or UPS) and enter the Tracking number.",
            "Mark the order Dispatched and Delivered as it moves.",
            "Refresh live status to pull the latest delivery progress from 17TRACK, so you always know where a parcel is."
          ] },
          { kind: "sub", text: "Good to know" },
          { kind: "bullets", items: [
            "If the courier cannot be auto-detected, choose it manually and refresh again.",
            "Live tracking support depends on the courier; the system retries automatically and you can still check the courier's own website."
          ] },
          { kind: "sub", text: "DHL Express labels" },
          { kind: "bullets", items: [
            "With DHL Express connected, + Prepare a DHL shipment in this card creates the label and, where customs needs one, the commercial invoice. See Settings › DHL Express."
          ] }
        ]
      },
      {
        id: "card-schedule",
        title: "Schedule & Alerts card",
        blocks: [
          { kind: "para", text: "Set reminders tied to this order so important follow-ups, approvals, payments, client updates, never get forgotten." },
          { kind: "sub", text: "What you can do" },
          { kind: "bullets", items: [
            "Pick a Quick Reminder shortcut (for example Ask for approval, Send design update or Check payment) or type your own title.",
            "Set the date & time, a priority (Normal, High or Urgent) and an optional note. Turn on Notify to get a notification when it is due.",
            "See Upcoming reminders and Recently completed ones; Mark Done, or Snooze by 1 hour or 1 day."
          ] },
          { kind: "sub", text: "What you can change" },
          { kind: "bullets", items: [
            "Use Edit headings to customize the Quick Reminder shortcuts and their default timing so they match how you follow up."
          ] }
        ]
      },
      {
        id: "card-history",
        title: "History / Log card",
        blocks: [
          { kind: "para", text: "An automatic audit trail of the order, what changed and when, so you can always see how it reached its current state." },
          { kind: "sub", text: "What it shows" },
          { kind: "bullets", items: [
            "A list of recent important changes, newest first.",
            "Each entry shows what changed, the date and time, and the old value → the new value."
          ] },
          { kind: "sub", text: "Good to know" },
          { kind: "bullets", items: [
            "The log is read-only; it fills in automatically as people edit the order.",
            "History cards are available from NivaDesk Starter."
          ] }
        ]
      }
    ]
  },
  {
    id: "sales",
    title: "Sales",
    blocks: [
      { kind: "para", text: "Sales shows everything you have sold, built from the orders you already have. Orders are not changed from this screen: nothing on it creates or edits an order, a product, a stock level or a payment. The owner or an admin can manage brands and store names here; that changes how sales are grouped, never the orders themselves. It appears in the menu only when your workspace has it switched on and your account includes orders." },
      { kind: "sub", text: "The Sales tab" },
      { kind: "bullets", items: [
        "One row per order, newest first, with the customer, what was sold, the channel it came from, the payment and delivery state and the revenue.",
        "Opening a row opens that same order in Orders — it is the same order, not a copy.",
        "Filters: one channel or every channel, one store, one brand (or no brand), only what needs attention, and whether to include bespoke work. Show more brings the next page of the same filters from the server; changing a filter starts the list again.",
        "Revenue appears only if your account includes financial information; otherwise the column shows a dash and the rest of the row is unchanged. It is the same revenue the order card, the Dashboard and the export show, worked out from the order when the list is read. If it cannot be worked out, the row says \"Not calculated\" instead of showing a number.",
        "If your account is limited to the work assigned to you, Sales shows exactly the orders Orders shows you, and says so above the list.",
        "A marketplace that keeps the buyer's details, such as eBay or Amazon, shows \"Held by the marketplace\" in place of a name.",
        "An order with no usable date says \"Date unknown\" rather than guessing one."
      ] },
      { kind: "sub", text: "Products" },
      { kind: "para", text: "Products lists the product catalogue for your workspace. Until your workspace has products, it says so plainly — your sales are still listed from the orders you have taken." },
      { kind: "sub", text: "Channels" },
      { kind: "bullets", items: [
        "One row per sales channel, saying whether it is connected to this workspace. Connect or disconnect a channel in Settings → Integrations.",
        "Connected means the channel is linked. It does not mean orders have arrived from it. Today a connected channel brings in its orders; products and stock levels are not imported from a channel automatically, and NivaDesk does not change a listing, a price or a stock level on the channel itself. Your stock is kept in Inventory.",
        "Stores: each connected shop account is listed on its own, with its status and last sync, so two stores on the same platform are never mixed. The owner or an admin can give a store a name of their own.",
        "Brands are optional: the owner or an admin can create, edit and delete a brand and link it to the stores it sells through. Deleting a brand changes no order; its orders simply show their store again.",
        "Amazon is not listed: its connection is held outside this project, so the screen cannot check it without guessing."
      ] }
    ]
  },
  {
    id: "schedule",
    title: "Schedule",
    blocks: [
      { kind: "para", text: "A calendar view of your orders by delivery date, so you can plan your week and see what is coming up." },
      { kind: "bullets", items: [
        "Move through date ranges with Previous and Next, and filter by status.",
        "Create a new scheduled project right from the calendar.",
        "Download an all-day calendar file for an order to add it to your own calendar app (available from NivaDesk Starter).",
        "Open any order in the range to work on it."
      ] }
    ]
  },
  {
    id: "team-schedule",
    title: "Team Schedule",
    blocks: [
      { kind: "para", text: "A team view of the schedule: every member in a row, with the jobs assigned to them laid out across the days. See who is doing what and when, balance the workload and keep delivery dates on track." },
      { kind: "bullets", items: [
        "Each team member has a row showing the orders assigned to them; an Unassigned row collects anything without an owner.",
        "A workload panel shows how busy each member is overall, and an upcoming list highlights the next deadlines.",
        "Tap a day in the calendar to jump the schedule there, and filter by status or member.",
        "Open any job to work on it. Team Schedule is part of the Team plan."
      ] }
    ]
  },
  {
    id: "calendar",
    title: "Calendar",
    blocks: [
      { kind: "para", text: "One calendar for the whole workshop: meetings, tasks with reminders and a list of overdue ones, daily notes, work days and days off, each kept private, shared with the people you choose or shared with the whole workspace. Orders with a due date and note reminders show up on it, and your own Google Calendar or Outlook meetings can sit beside your work." },
      { kind: "para", text: "The Calendar is on the web app; the Mac, iPhone, iPad and Android apps do not have it yet. Schedule stays what it was: your orders laid out by delivery date." },
      { kind: "sub", text: "Opening the calendar and moving around (Day, Week, Month, Agenda)" },
      { kind: "bullets", items: [
        "Calendar is in the sidebar of the web app, between Banking and Schedule. Every member has it, on every plan.",
        "Today jumps back to today, the ‹ and › arrows move one period, and Go to date picks any day.",
        "Day, Week, Month and Agenda switch the view. Month is the default (Agenda on a narrow screen) and your last choice is remembered on that browser.",
        "Search entries finds an entry by its words, 180 days either side of today unless you change Search from and Search until."
      ] },
      { kind: "sub", text: "Adding an entry: meeting, task, daily note, work day" },
      { kind: "bullets", items: [
        "＋ New entry opens the form. In Month view click a day, in Week view use the ＋ on a day, and in Day view click an hour to start a meeting at that time.",
        "Day view also has quick buttons: ＋ Meeting, ＋ Task, ＋ Daily note and ＋ Work day.",
        "Pick the type (Meeting, Task, Daily note, Work day or Unavailable), then Title (Note text for a daily note), Date, and either All day or Starts and Ends. Save keeps it.",
        "More options adds Description, Assigned to (for a task) or Who it is about, Linked order, Repeat (Every day, or Every week on the days you pick, with Repeat ends) and, for a meeting, Location and Meeting link.",
        "An entry can last up to 62 days and repeat up to 500 times."
      ] },
      { kind: "sub", text: "Who can see an entry: only me, selected people, whole workspace" },
      { kind: "bullets", items: [
        "Who can see it: Only me (🔒), Selected people (🔗) or Whole workspace (🏢). The same mark shows on the entry in the calendar.",
        "With Selected people, set each person to Can view or Can edit. With Whole workspace, choose Everyone can view or Everyone can edit.",
        "Whole workspace can be chosen by the owner, an admin or a member. View Only members can be shown an entry but not given Can edit.",
        "Only the person who made an entry can delete it or change who sees it."
      ] },
      { kind: "sub", text: "Tasks, reminders, overdue tasks and repeating entries" },
      { kind: "bullets", items: [
        "Click an entry to open its detail. A task has Mark done, Reopen and Cancel task; the person it is assigned to can change its status too.",
        "Reminder: Off, At the time, 15 minutes before, 1 hour before or 1 day before (an all-day entry also has Reminder time). Reminders appear inside NivaDesk, under Calendar reminders in the notification bell; they are not sent by email, text message or phone notification.",
        "Overdue tasks: open Day view on today. Open tasks planned in the last 14 days that are not done yet are listed there, each with Late since.",
        "Editing or deleting a repeating entry asks Only this one or This and following.",
        "Edit and Delete are at the bottom of the detail. Delete cannot be undone."
      ] },
      { kind: "sub", text: "Order due dates and note reminders on the calendar, and filters" },
      { kind: "bullets", items: [
        "An order with a due date appears as Order due (📦) for people who can see Orders; Open order takes you to it. The date comes from the order, so change it on the order.",
        "A note reminder appears as Note reminder (🔔) for people who can see Notes, with Open in Notes.",
        "Filters narrows the calendar: My entries, Shared with me, Team entries, Who it is about, Type, Status and Linked order. Filters are remembered on this device, never change who can see an entry, and Reset filters clears them."
      ] },
      { kind: "sub", text: "Connecting Google Calendar or Outlook (your other calendars)" },
      { kind: "steps", items: [
        "Press 🌐 Your other calendars, then Connect Google Calendar or Connect Outlook.",
        "Approve on Google's or Microsoft's page; you come back to the Calendar with Calendar connected.",
        "Calendars to show picks which of your calendars appear; press Save. Sync now fetches straight away (once a minute at most), and it also syncs on its own about every 30 minutes.",
        "Disconnect… then Disconnect removes the connection. Your Google or Outlook calendar itself is not changed. Connect again appears if the connection has expired."
      ] },
      { kind: "bullets", items: [
        "It is read-only and one way: NivaDesk never writes to Google or Outlook, and those meetings never become NivaDesk entries, tasks or orders.",
        "Only you see your Google or Outlook meetings — not your team and not the owner. They cover 30 days back to 180 days ahead, and a meeting with a link has Join meeting and Open in Google Calendar or Open in Outlook.",
        "The 🌐 Your other calendars button only appears once this connection is switched on for your account; it is being opened gradually. If you do not see it, it is not on for you yet.",
        "A work or school Outlook account may need your IT admin to approve NivaDesk first."
      ] },
      { kind: "sub", text: "Adding entries without a connection (offline)" },
      { kind: "bullets", items: [
        "Offline, a banner says changes stay on this device until the connection is back, with Waiting to be confirmed and a count. The form says Not confirmed yet and you can close it.",
        "When the connection returns you are told Saved after the connection came back. A save NivaDesk refused is listed above the calendar with Open and Discard."
      ] }
    ]
  },
  {
    id: "notes",
    title: "Notes",
    blocks: [
      { kind: "para", text: "A full notes board for your workspace: capture ideas, lists and reminders, share them with your team, and keep the important ones pinned to the top." },
      { kind: "sub", text: "Create & format" },
      { kind: "bullets", items: [
        "New Note: give it a title and body, and add an image if you need one.",
        "Duplicate or copy a note to reuse it.",
        "Search notes to find anything fast, and switch to a grid view."
      ] },
      { kind: "sub", text: "Organize" },
      { kind: "bullets", items: [
        "Pin a note to keep it at the top of the board; Unpin when it is no longer urgent.",
        "Give a note a color to group related ones visually.",
        "Add labels and filter the board by label."
      ] },
      { kind: "sub", text: "Share with your team" },
      { kind: "bullets", items: [
        "Add collaborators by email so a note is shared and worked on together.",
        "Everyone with access sees the latest version, so the team stays on the same page."
      ] },
      { kind: "sub", text: "Reminders" },
      { kind: "bullets", items: [
        "Set a reminder on a note (Tomorrow, Next week or a custom time) and get notified.",
        "See all your note reminders in one place, and remove a reminder when it is done."
      ] },
      { kind: "sub", text: "Project notes" },
      { kind: "bullets", items: [
        "Notes can be linked to a project and appear under Project Notes for that order.",
        "The order's own note appears there too — and you can edit it right in the Notes menu on web, Mac, iPhone and Android. It is the same text the order's Notes card holds, never a copy, so a change shows up in both places.",
        "Restore a project note back to your main Notes board at any time."
      ] },
      { kind: "sub", text: "Archive & Trash" },
      { kind: "bullets", items: [
        "Archive a note to clear it from the board without deleting it; Unarchive to bring it back.",
        "Move a note to Trash, Restore it later, or Delete forever to remove it permanently."
      ] },
      { kind: "sub", text: "Notes on your phone's home screen" },
      { kind: "bullets", items: [
        "iPhone, iPad and Android can put your notes on the home screen as a widget, so the list is readable without opening anything.",
        "Add it the way you add any widget — press and hold the home screen, then pick NivaDesk.",
        "Tapping the widget opens Notes at that note.",
        "Holding the app icon also offers New note, which opens Notes with the composer already open.",
        "The widget is cleared when you sign out, so notes never stay on the screen of a device you have signed out of."
      ] }
    ]
  },
  {
    id: "customers",
    title: "Customers",
    blocks: [
      { kind: "para", text: "Your client directory: every customer with their details and the work linked to them." },
      { kind: "bullets", items: [
        "Add a customer, edit their details, or remove one you no longer need.",
        "Open a customer to see their details and their designs and orders.",
        "Customer notes stay with the customer and appear on each of their orders.",
        "Use the collapsible list to find a customer quickly.",
        "How many customers are new versus returning in a period lives on the Dashboard: the Financial Breakdown shows New customers and Returning customers for the selected range — new means their first order falls inside it."
      ] }
    ]
  },
  {
    id: "production",
    title: "Production",
    blocks: [
      { kind: "para", text: "The operations layer between Orders and Schedule. Orders says what a customer asked for; Schedule says when it must be ready; Production answers the question you actually ask each morning — where is every live job right now, and what has stopped." },
      { kind: "para", text: "Production status is deliberately separate from order, payment and delivery status. A job can be paid for, undelivered, and still sitting in Quality Check; keeping the three apart is what stops a workshop losing track of its own work." },
      { kind: "sub", text: "The board" },
      { kind: "bullets", items: [
        "Columns are lanes: Ready, In Production, Waiting / Blocked, Quality Check, Ready to Ship and Done to begin with.",
        "The five figures across the top answer the first five questions: how many jobs are active, how many are due this week, how many are blocked, how many are at risk, and how many are ready to go out.",
        "Each column shows its count and, if you set one, its capacity — green under the limit, amber approaching it, red over. The limit warns; it never blocks. You can always move one more job.",
        "Cards carry only what production needs: order number, customer, item, due date, who has it, priority, steps completed, and the blocker if there is one. The money stays on the order."
      ] },
      { kind: "sub", text: "Where a job sits, and why" },
      { kind: "bullets", items: [
        "The stage is worked out from the production steps already on the order, not typed in twice — so the board and the order can never disagree about where a job is.",
        "Nothing started yet reads as Ready. Every step done reads as Ready to Ship. Anything in between is In Production, unless the step being worked shares its name with a column (a step called 'Quality check' puts the card in Quality Check by itself).",
        "Dragging a card is a real decision: it sets the stage by hand, writes the old and new value into the order's History, and tells whoever the job is assigned to — not the whole workshop. Undo is offered straight afterwards.",
        "A delivered order closes to Done; you cannot still be making something the customer already has."
      ] },
      { kind: "sub", text: "Blocked means blocked, with a reason" },
      { kind: "bullets", items: [
        "Dropping a card into the blocked lane always asks why: waiting for customer approval, material unavailable, supplier delay, technical problem, or other — plus a note in your own words.",
        "The reason shows on the card, so a stalled job is visible at a glance instead of quietly ageing.",
        "Moving the card out of the lane clears the blocker."
      ] },
      { kind: "sub", text: "Three views" },
      { kind: "bullets", items: [
        "Board: where each job stands. The default.",
        "List: filter and edit many jobs at once; the stage is a dropdown on every row.",
        "Workload: who is carrying what, and how much of it is late or blocked."
      ] },
      { kind: "sub", text: "Making the board yours" },
      { kind: "bullets", items: [
        "Production settings renames the columns to match how you actually work — a jeweller runs Design, Casting, Setting, Polishing, Quality Check; a leather workshop cuts, sews, finishes edges and packs.",
        "Each column keeps a behaviour: which one means 'not started', which one asks for a blocker reason, which one closes a job. Rename freely; the machinery keeps working.",
        "Renaming or reordering never strands the jobs standing in a lane — they move with it."
      ] }
    ]
  },
  {
    id: "inventory",
    title: "Inventory",
    blocks: [
      { kind: "para", text: "Your stock room inside NivaDesk: the watches, dials, parts and consumables your business owns, what they cost, where they stand and what they are promised to. A customer's own property can be held and tracked too — it is marked as theirs and never counted as your asset." },
      { kind: "sub", text: "Items" },
      { kind: "bullets", items: [
        "Two kinds of item: a Unique item is one physical object with its own serial and condition (a watch, a dial); a Quantity item is counted stock with a unit (screws, leather, lacquer).",
        "Statuses tell the truth about each item: Available, Reserved, Partially Reserved (some of a counted material is promised, some is still free), Incoming, Used, Sold, Removed and Archived.",
        "Give items tags (free labels like 'vintage' or 'gold'), a location, photos, a low-stock threshold for materials, and print a QR label to find the record by scanning.",
        "Search matches names, brands, references, serials, SKUs and tags; filters narrow by category, type, status, location and supplier."
      ] },
      { kind: "sub", text: "Adding stock" },
      { kind: "steps", items: [
        "Add Item creates one item by hand — pick Unique or Quantity first, the form adapts.",
        "Import opening stock pastes a whole spreadsheet: columns are matched automatically, every row is previewed before anything is created, and rows that match stock you already have (by SKU or serial) are flagged so you choose Skip / Update existing / Create anyway.",
        "Recording a Purchase creates its items for you, held as Incoming until the goods arrive."
      ] },
      { kind: "sub", text: "Purchases" },
      { kind: "bullets", items: [
        "New Purchase records what you bought, from whom and at what cost; shipping and fees are spread across the lines without touching the item prices.",
        "Goods arrive in boxes, not purchase orders: Receive lines… takes a partial delivery (6 of 10 boxes), the purchase shows Partially received, and Receive the rest finishes it later.",
        "Match payment links the purchase to the bank transaction that paid for it, so stock and banking join on a fact.",
        "A purchase with stock already on the shelf can no longer be edited or deleted."
      ] },
      { kind: "sub", text: "Stock on orders" },
      { kind: "bullets", items: [
        "Reserve stock on an order's stock card puts a part aside for that job so it cannot be promised twice; the line reads like '3 / 10 pcs · Safe A' — what this order holds out of what exists.",
        "Use on the job consumes the reserved part: it leaves the shelf and the movement ledger names the order.",
        "Swap… exchanges a reserved part for a different one in one step; Release puts it back.",
        "Recipes: write a repeated job's parts list once (Inventory ▸ Recipes), then Use a recipe… on the order reserves every line together — all or nothing."
      ] },
      { kind: "sub", text: "Losses, counts and reports" },
      { kind: "bullets", items: [
        "Record a Loss… on an item logs stock leaving for a reason that is not a sale or a job: damaged, lost, returned to supplier or wastage — the reason lands in the ledger.",
        "Stocktake walks you through counting what is really on the shelf and corrects the records with a full audit trail.",
        "Every change is a movement in the item's History; Reports sums value, movement kinds and category totals over time."
      ] },
      { kind: "sub", text: "Categories" },
      { kind: "bullets", items: [
        "Inventory ▸ Categories is where you name what your workshop actually keeps — a jeweller wants Gemstones and Clasps, not Dials and Movements. Rename, re-icon, reorder, hide and merge them.",
        "There is one central name: renaming a category here renames it on every item, filter, form and report, because the new title is carried to the items that used the old one.",
        "Nothing is orphaned. A category holding items cannot simply be removed — you are asked where those items go: into another category, into Other, or hide the category and leave them where they are.",
        "Merge is the same question said plainly: 'Bracelets into Straps' moves the items across and the category disappears.",
        "Set a default so a new item starts on the category you use most. Items whose category has vanished by some other route (an old import, say) are reported at the top of the screen rather than quietly filtered out of every view."
      ] },
      { kind: "sub", text: "Locations and suppliers" },
      { kind: "bullets", items: [
        "Locations form a tree — a safe holds a drawer holds a tray. Renaming or moving one renames it on every item standing there; a location with stock or child locations inside cannot be deleted.",
        "Suppliers keep contact details plus the paperwork fields an invoice asks for: your own code for them, address, VAT number and billing currency."
      ] },
      { kind: "sub", text: "Printing a QR label for an item" },
      { kind: "bullets", items: [
        "Open the item in Inventory and press Label; the label sheet opens with Print label on it. Stick it on the tray, box or bag the item lives in.",
        "The code is a link, not just a number: scanning it with any phone camera opens that item in NivaDesk, so whoever is standing at the shelf sees the stock figure, the location and the photos without searching for it.",
        "Scanning works for anyone signed in to the workspace; someone who is not signed in is asked to sign in first."
      ] },
      { kind: "sub", text: "Stocktake: counting what is really on the shelf" },
      { kind: "bullets", items: [
        "It lives under Inventory ▸ Stocktake. Start a count opens one; each item then has a Count box for what you actually found, beside the figure NivaDesk holds.",
        "Nothing changes until you finish the count. When you do, every difference is written to the movement ledger as a correction, with who counted it and when — so the stock figure and the audit trail can never disagree.",
        "You can count part of the shelf: filter to a category or a location and stocktake only that.",
        "The ledger keeps the old figure too, so a miscount can be traced and corrected rather than argued about."
      ] }
    ]
  },
  {
    id: "banking",
    title: "Bank Spending",
    blocks: [
      { kind: "para", text: "Connect your business bank through Open Banking and see spending as it happens: categories, VAT treatment, receipts matched to transactions and recurring payments. Photograph a receipt and NivaDesk attaches it to its bank payment and reads its VAT. NivaDesk only reads your transactions — it can never move money. Bank Spending is part of Pro and Team. It is the owner's: a member the owner gives the Bank Spending permission can look, but not change anything." },
      { kind: "para", text: "PayPal beside the bank: connect your PayPal account from Integrations with the Client ID and Secret of your own PayPal app (create it in the PayPal Developer dashboard under Live and enable Transaction Search). NivaDesk checks the credentials, stores the secret encrypted and imports the last six months; from then on PayPal is read with every bank refresh. Payments received and sent, fees and refunds arrive as rows with the fee shown beside the gross, so categories, VAT, receipts and rules work exactly as for a bank row. A withdrawal from PayPal to your bank is not a row: it is matched to the bank statement's incoming row and marked as a processor payout, so the same sales are never counted twice." },
      { kind: "para", text: "Refunds and chargebacks: money that went back to a customer is not spending. Open the outgoing row, choose Customer refund or Chargeback, pick the order and press Record on the order: NivaDesk writes a negative payment entry on that order with the bank row's id, lowers the amount paid and keeps a refunded total, and the row leaves the spending totals. A PayPal refund names the payment it reverses, so when that payment was matched to an order the order is offered before you search. Remove from the order takes the entry back out; a row recorded as a refund cannot also be linked as an expense." },
      { kind: "para", text: "Accounting software: a read-only QuickBooks Online connection is built — it reads the chart of accounts, VAT codes, customers and items and never posts anything back — but a real QuickBooks company cannot connect until Intuit's production access is arranged. Xero (read-only) is set up with us on request. Pandle is not available yet." },
      { kind: "sub", text: "Connecting a bank, and when it says Reconnect" },
      { kind: "steps", items: [
        "In the sidebar open Banking and press + Connect bank; pick your bank and approve access on the bank's own page. Once a bank is linked, ＋ Add account ▸ Bank adds another, and ＋ Add account ▸ PayPal adds PayPal.",
        "Transactions sync in the background, and Refresh fetches straight away.",
        "The account bar shows the connection: Connected, Sync failing, Reconnect needed, Waiting for bank consent… or Disconnected — data kept, with Last sync and Consent renews by (amber from 14 days before).",
        "Open Banking consent lasts about 90 days. When the bank stops sharing data the bar says so and ⟳ Reconnect renews it in a minute; Needs attention on the Overview lists it too.",
        "Disconnect account keeps everything already imported; after disconnecting, the 🗑 Delete imported data icon removes it as a separate choice. 🕑 Activity shows the connection's own diary — syncs, failures, connects and disconnects."
      ] },
      { kind: "sub", text: "Choosing the period, and any date range" },
      { kind: "bullets", items: [
        "Weekly, Monthly and Yearly step through whole periods with the arrows beside them.",
        "Date range takes any two dates instead — pick them in either order, and every figure on the screen (spent, incoming, categories, the transaction list) follows that range.",
        "In a date range the arrows go, because a range you chose by hand has no next or previous, and the 'vs' comparison is against the same number of days ending the day before your range starts."
      ] },
      { kind: "sub", text: "Transactions, categories and VAT" },
      { kind: "bullets", items: [
        "The tabs are Overview, Transactions, Recurring, Receipts and Rules (and Payment Links once Stripe is connected). Transactions filters All, Needs attention, Incoming and Spending, with Search transactions and ☑ Select for bulk edits.",
        "Every transaction gets a category; rules apply them automatically ('always categorise this keyword as Software') and each automatic change says which rule did it. Save & create rule saves a change and makes it a rule.",
        "VAT / Tax code in a transaction: Standard rate (20%), Reduced rate (5%), Zero-rated (0%), Exempt, Outside scope, No VAT receipt, Reverse charge, Import VAT, Mixed / split VAT or No VAT — NivaDesk's own codes, independent of any accounting provider.",
        "Needs attention and the Accounting review groups (Ready for accounting, Needs information, Missing receipt, Missing VAT code) show what still needs a look.",
        "A transaction that covers several things can be split into lines; the lines must add up to the bank amount, to the penny."
      ] },
      { kind: "sub", text: "Scan receipt: photograph a receipt and match it to the bank payment" },
      { kind: "steps", items: [
        "Press 📷 Scan receipt at the top of Banking (the owner, once a bank is linked), or Home ▸ Quick actions ▸ Scan receipt. Take a photo, or pick a photo or a PDF.",
        "NivaDesk reads the amount, the date and the VAT and looks for the bank payment: ✅ Receipt attached when it is sure, or Likely payment found with Attach to this payment when you should confirm.",
        "If the payment has not reached the bank yet — card payments often land 1–3 days later — it says ⏳ Saved — waiting for the bank payment and attaches itself when the payment arrives.",
        "📷 Scan another does the next one; Done closes it. Inside a transaction, Upload new attaches a photo or PDF to that one, and Choose from Files uses an invoice already in your library — nothing is stored twice."
      ] },
      { kind: "sub", text: "Receipts waiting for the bank" },
      { kind: "bullets", items: [
        "Receipts ▸ Waiting for the bank (N) lists every receipt still waiting, where it came from (Web, ChatGPT, Claude, iPhone, Android or Mac) and how many days it has waited. The Overview shows ⏳ N receipts waiting for the bank → when there are any.",
        "⟳ Match now tries the matching again. Each receipt has View, Assign to a transaction (to attach it by hand) and Remove.",
        "After 14 days a receipt turns red: Still no payment — check the amount or assign it by hand. Possibly already matched comes with View that receipt.",
        "A receipt in another currency keeps its own amount (for example USD 838.80). In the Assign list a bank payment whose bank text names that amount is marked with it, which is how a foreign supplier's invoice paid by card is found."
      ] },
      { kind: "sub", text: "VAT read from the receipt" },
      { kind: "bullets", items: [
        "Once a receipt is attached, the transaction's VAT / Tax code shows 🧾 Read from the receipt with the VAT amount (one line per rate on a mixed receipt), and ⚡ Auto-applied when NivaDesk set the code for you.",
        "A receipt with more than one VAT rate offers ⑃ Split by VAT rate (from the receipt), which opens the split already filled in.",
        "For a foreign supplier's document NivaDesk does not guess: choose Import VAT for goods or Reverse charge for services yourself."
      ] },
      { kind: "sub", text: "Recurring payments and incoming money" },
      { kind: "bullets", items: [
        "The Recurring tab lists payments found in your history — usual amount, expected day and a confidence grade; a price change shows as ↑ £x → £y. Upcoming ones are estimates and marked as such.",
        "Mark one yourself in a transaction: ↻ Recurring ▸ Mark as recurring… (Weekly, Monthly or Yearly). Same payee as… groups payments to the same payee, and Stop treating as recurring undoes it. Yours carry Marked by you.",
        "Incoming money: Match to Order payment, Invoice, Deposit, Refund received, Owner contribution, Loan, Transfer between own accounts, Other income or Processor payout. Find matching payment and Match this payment link it to an order's payment — never duplicated — and Record as a new payment on this order adds it there."
      ] }
    ]
  },
  {
    id: "files",
    title: "Files",
    blocks: [
      { kind: "para", text: "The workspace's file library: every client file, receipt, product photo and supplier document in one place, whichever order, purchase or transaction it came from. You can find a document without knowing which order it belongs to, and add one before you know." },
      { kind: "bullets", items: [
        "Upload straight into the library, rename a file, and replace it with a new version while keeping the old ones.",
        "Link a file to an order, a customer, a purchase, a supplier, an inventory item or a bank transaction — one file can be linked to several, and it is stored once.",
        "Linking is not sharing. A linked file stays internal until you share it with the order, which is what puts it in front of the customer.",
        "The left column filters: All Files, Recent, Shared with Clients, Internal Only, Unlinked, Trash, and By Connection (Client & Orders, Bank Transactions, Inventory, Purchases, Suppliers).",
        "Search covers the file name, the customer and the design.",
        "Deleting sends a file to Trash first, where it can be restored; emptying the Trash is what removes it for good.",
        "Uploads follow the maximum size and upload policy set in Settings ▸ Safety & Uploads.",
        "Opening and downloading files requires Pro or Team.",
      ] },
      { kind: "sub", text: "Opening a file, and Make Offline (keeping a file offline)" },
      { kind: "bullets", items: [
        "Opening a file shows it full screen. On iPhone and iPad the buttons under it become icons — Previous, Next, offline, Open and Download — because five labels do not fit a phone.",
        "Make Offline (Mac, iPhone, iPad) keeps a copy on the device, so the file still opens with no signal. The same button then reads Remove offline copy and deletes it again; a file kept offline is opened from the device rather than downloaded each time.",
        "A file you share with a customer opens on your own domain when you have one set up in Settings ▸ Customer Portal Domain — the address bar shows your domain, the NivaDesk name is dropped, and the file itself is still loaded straight from storage, never through our servers."
      ] }
    ]
  },
  {
    id: "messages",
    title: "Messages",
    blocks: [
      { kind: "para", text: "Talk to your team inside NivaDesk — direct messages and group conversations kept next to your work — and, where it is switched on, answer your customers' WhatsApp and Instagram messages from one inbox. Messages is part of the Team plan." },
      { kind: "sub", text: "Team messages: direct and group conversations" },
      { kind: "bullets", items: [
        "Messages ▸ Team: New conversation starts a direct message or a group. Send text, files and images, search, mute, forward, edit or leave a conversation.",
        "The owner decides what is allowed in Settings ▸ Message Settings: Direct messages, Group conversations and File & image sharing.",
        "Without the Team plan the page says Messages is not included in your plan, with View Team plan.",
        "To raise a ticket with NivaDesk instead, use Settings ▸ Support / Tickets."
      ] },
      { kind: "sub", text: "Customer messages: WhatsApp and Instagram inbox" },
      { kind: "bullets", items: [
        "Messages ▸ Customers is the customer inbox. It runs for one business today: connecting your own WhatsApp Business number or Instagram professional account opens once Meta's approvals are in place, and until then those tiles in Settings ▸ Integrations say Coming soon.",
        "Where it runs, Link this conversation ties a conversation to its order, with Assign to, Labels, Mark as done and Delete conversation. Reply on WhatsApp sends your answer; Attach a photo or PDF adds a file (Instagram replies are text only).",
        "WhatsApp only allows replies within 24 hours of the customer's last message, and approved templates are not set up yet, so NivaDesk cannot start a conversation. Messages are deleted after 90 days and photos and PDFs after 30.",
        "On every plan a customer's page has 💬 WhatsApp and ◎ Instagram buttons that open the conversation in WhatsApp or Instagram itself.",
        "Who sees customer messages is set per role in Settings ▸ Team Access."
      ] }
    ]
  },
  {
    id: "quick-reply",
    title: "AI Replies / Quick Reply",
    blocks: [
      { kind: "para", text: "Draft polished customer messages in seconds, in your own style." },
      { kind: "bullets", items: [
        "Generate a quick reply with AI, then copy it to the clipboard to send.",
        "Set your reply style, the greeting and sign-off (for example ‘Hi there,’ and ‘Kind regards,’), and it is reused every time.",
        "Reference your saved products and prices so replies include the right details.",
        "Reach clients through the channel buttons on an order."
      ] },
      { kind: "para", text: "Choose the engine and add your OpenAI API key, company knowledge base, products and rules in Settings ▸ Quick Reply Settings." }
    ]
  },
  {
    id: "settings",
    title: "Settings",
    blocks: [
      { kind: "para", text: "Where you tailor NivaDesk to your business. Pick a section on the left to see what it controls, or type into the search box above the list — searching \"VAT\", \"logo\" or \"password\" jumps straight to the right section. Some settings are protected, so only the owner or admins can change them." }
    ],
    children: [
      {
        id: "set-general",
        title: "General",
        blocks: [
          { kind: "para", text: "Your personal and appearance settings." },
          { kind: "bullets", items: [
            "Appearance & theme: switch between light and dark mode.",
            "Language: choose one of 12 languages for the whole app.",
            "Profile: your name and account details.",
            "Security: manage how you sign in and protect your account."
          ] }
        ]
      },
      {
        id: "set-security",
        title: "Profile & Security: two-step verification",
        blocks: [
          { kind: "para", text: "Two-step verification asks for a code from an authenticator app on your phone as well as your password, so a stolen password alone cannot open your account. It works with email sign-in, Google and Apple, and comes with ten recovery codes for the day the phone is lost." },
          { kind: "sub", text: "Turning on two-step verification (authenticator app)" },
          { kind: "steps", items: [
            "[Web] Settings ▸ Profile & Security ▸ Two-step verification. Searching Settings for 2fa or authenticator finds it.",
            "Update NivaDesk on your iPhone, iPad, Mac and Android to version 2.3 or later first — older apps cannot finish a sign-in with a code — then tick My NivaDesk apps are up to date. Your email must be verified (Send verification email if it is not).",
            "Press Set up authenticator app. If asked to confirm it is you, enter your password (or Continue with Google / Continue with Apple).",
            "Scan the QR code with your authenticator app, or type the Setup key; enter the 6-digit code it shows and press Turn on.",
            "Save the recovery codes with Copy or Download, then press I saved them. They are shown only once."
          ] },
          { kind: "bullets", items: [
            "Turning it on, removing it, new recovery codes and Sign out everywhere are done in the web app. The iPhone, iPad, Mac and Android apps only ask for the code when you sign in.",
            "It is for the owner or an admin of the workspace; one authenticator per account."
          ] },
          { kind: "sub", text: "Signing in with a code, and a lost phone (recovery codes)" },
          { kind: "bullets", items: [
            "After your password (or Google or Apple), Two-step verification asks for the 6-digit code from your authenticator app; press Verify.",
            "Lost your phone? Use a recovery code: the code turns two-step verification off and signs out every device. Sign in again with your password, then turn it on again with a new phone.",
            "Make new recovery codes (N left) replaces the old codes with ten new ones.",
            "No recovery codes and no phone: write to NivaDesk Support from your account's email address."
          ] },
          { kind: "sub", text: "Turning it off, and signing out everywhere (log out of all devices)" },
          { kind: "bullets", items: [
            "Remove on the authenticator turns two-step verification off; your password alone protects the account again.",
            "Sign out everywhere (shown while two-step verification is on) signs out every device, this one included. ChatGPT and Claude connections stay; disconnect them in Settings ▸ Integrations."
          ] }
        ]
      },
      {
        id: "set-workflow",
        title: "Workflow Steps",
        blocks: [
          { kind: "para", text: "Shape how orders flow for your craft." },
          { kind: "bullets", items: [
            "Your industry and its workflow description, which auto-fills to fit your trade and changes when you switch industry.",
            "The production stages (status steps) that appear on every order.",
            "Custom fields and the Inventory Labels used by the Materials card."
          ] }
        ]
      },
      {
        id: "set-pdf",
        title: "PDF Export Settings",
        blocks: [
          { kind: "para", text: "Control how invoices and order PDFs look: your business details, logo and a footer note, plus what is included in the export." },
          { kind: "sub", text: "Presets" },
          { kind: "bullets", items: [
            "Four one-tap presets set the visible sections for a common document: Customer invoice, Internal job sheet, Estimate and Delivery note. A preset only flips the toggles — review the result, open a preview, then press Save.",
            "No preset ever turns on Internal Financials: internal cost, profit and supplier details print only if you enable that section yourself, and the page warns you when it is on.",
            "Change any toggle by hand and the chip row shows Custom, so you always know whether you are on a preset or your own mix."
          ] }
        ]
      },
      {
        id: "set-quickreply",
        title: "Quick Reply Settings",
        blocks: [
          { kind: "para", text: "Set up how NivaDesk drafts replies to customers and what it knows about your business." },
          { kind: "sub", text: "Choose how replies are generated" },
          { kind: "bullets", items: [
            "OpenAI Online: uses OpenAI with your own OpenAI API key. Paste your key here, and replace or clear it any time.",
            "On-Device (Apple): uses Apple's on-device AI on supported Apple Intelligence devices, with no API key needed.",
            "Offline Template: builds replies from your saved products and rules, without any AI model."
          ] },
          { kind: "sub", text: "Teach it about your business" },
          { kind: "bullets", items: [
            "Company Knowledge Base: extra facts, rules and FAQs you give the AI so replies stay accurate and on-brand.",
            "Products: your services or products with prices, so quotes include the right figures.",
            "Rules / FAQs: common answers such as delivery times or deposit policy.",
            "Reply style: your greeting and sign-off, reused on every reply."
          ] },
          { kind: "para", text: "Your OpenAI key belongs to you and is stored securely for your workspace; remove it whenever you like." }
        ]
      },
      {
        id: "set-financial",
        title: "Financial Settings",
        blocks: [
          { kind: "para", text: "Set the money rules that drive every order's Financial card." },
          { kind: "bullets", items: [
            "Currency and decimal separator.",
            "Average platform fee and default tax rate.",
            "Tax rule (standard or margin scheme), the VAT transition date and Corporation Tax.",
            "Recalculate taxes for past orders after a change."
          ] }
        ]
      },
      {
        id: "set-woocommerce",
        title: "Store & website integrations",
        blocks: [
          { kind: "sub", text: "Connected apps: the Integrations screen" },
          { kind: "para", text: "Everything NivaDesk connects to lives on one screen: Settings → Integrations. Providers are cards, grouped into Commerce & orders, Banking & accounting, and Payments, files & automation, and each card says what it is doing right now — Connected, Available, Via webhook or Coming soon. A card's status is read from your workspace, so Connected means something has actually arrived. Manage opens that provider's setup, sync, webhook and security detail, including your per-workspace signed delivery URL to paste into the platform; new orders then appear in Orders and Schedule, mapped to your order workflow." },
          { kind: "para", text: "Shopify connects through the official NivaDesk app on the Shopify App Store, and WooCommerce with one approval at your own store: orders, customers, payment status, fulfilment and refunds then sync on their own, and every fifteen minutes NivaDesk checks the store for anything a webhook missed." },
          { kind: "para", text: "Square connects with one sign-in: NivaDesk gets read-only access to your Square account, and sales from Square Point of Sale, Square Online and Square Invoices arrive with their payments and refunds. You choose which locations to import and which sales become orders — by default only sales with a shipment, pickup or delivery, so a quick counter sale stays in finance without filling the production board. Payments and refunds are recorded beside the order they belong to and never turned into orders of their own; one you cannot match appears under Unmatched Square payments." },
          { kind: "para", text: "Payouts and your bank: when Square pays out to your bank, the money reaches the Banking page as one incoming row that already covers sales NivaDesk counted when they happened. NivaDesk matches that row to the payout by amount, currency and arrival date, marks it as a processor payout so it is not counted as revenue again, and shows the payout's gross, fees and net on the row. If two rows could be the payout, the Square payouts card offers Find bank row so the owner picks one; Unlink undoes a match." },
          { kind: "para", text: "Each connection has a Sync health card: for orders, products, inventory and finance it says whether the last sync is fresh, stale or has never happened — or that the provider cannot sync that data at all — with the last successful sync, the last webhook, the retries still pending and the events that gave up." },
          { kind: "sub", text: "Sync health" },
          { kind: "bullets", items: [
            "Open the connection's Manage screen (Settings → Integrations → Shopify or Etsy). The Sync health card is at the top: one pill per data type — Fresh, Stale, Never synced or Not supported — and, for orders, the last successful sync, the last webhook, pending retries and dead letters.",
            "Recent activity lists the last events the connection received, each with its outcome: Applied, Skipped, Duplicate, Retrying or Dead, and the reason when there is one.",
            "A Dead event is one that stopped being retried — a payload NivaDesk could not understand, or an order Shopify no longer has. The workspace owner can press Retry on it; it runs again under the same key, so an order that already landed is not created twice.",
            "Stale means the last successful order sync is more than six hours old while the connection is active; check the store is still installed and the shop is still linked, then press Sync now or wait for the fifteen-minute catch-up."
          ] },
          { kind: "bullets", items: [
            "Shopify: install the NivaDesk app from the Shopify App Store and press Connect inside it; orders, customers, payment status, fulfilment and refunds then sync on their own, and the Shopify card lists the connected stores with pause and remove. Every fifteen minutes NivaDesk also asks Shopify for anything the live sync missed — an order caught up that way appears in the store's sync log as \"reconcile\".",
            "WooCommerce: open its card, press Connect, type your store's address and approve NivaDesk at your WooCommerce site. NivaDesk creates the webhooks itself, checks the store every fifteen minutes, and shows Import preview before any backfill; a second paid order from the same buyer within sixty days joins their open order as a payment.",
            "Square: open its card, press Connect Square and approve NivaDesk at Square; you are sent straight back. Under What comes in, tick the locations to import, choose which sales become orders (every sale, only those with a shipment or pickup, or none), and untick any Square source you do not want. Sync now checks the last 24 hours; Import preview shows what a backfill would create before anything is written.",
            "Missing order audit and payouts: every connected channel's Manage screen has Run audit, which compares the platform's orders from the chosen days with what NivaDesk holds and lists any that are missing; Sync now or Import brings them in. On Square, the Payouts card explains what Square sent to your bank per payout — gross sales, refunds, fees and adjustments — kept apart from payments, ready for bank matching. The order screen's channel strip shows the platform's own number, status and total, with one link to open the order at the provider.",
            "Needs review: the Sync health card lists orders the sync could apply but could not vouch for — an item not in the catalogue, a missing total — with the reason, an Open order link and, for the owner, Resolve. Resolving clears the flag on the order; a later clean sync clears it on its own.",
            "Other platforms: Wix, Squarespace, Zapier and Make have their own cards and all open the same generic order webhook — connect a custom site the same way.",
            "Etsy and eBay are not among those: each has a connection of its own, described in the sections that follow.",
            "Coming soon cards carry no setup because that integration does not exist yet; Request an integration opens a support ticket if you need one."
          ] },
          { kind: "sub", text: "Amazon" },
          { kind: "bullets", items: [
            "The Amazon connection is complete on NivaDesk's side, with customer data kept in a separate, hardened environment, and is waiting on Amazon's review of the app, so a seller cannot authorise it yet. Listing management is not offered."
          ] }
        ]
      },
      {
        id: "set-etsy",
        title: "Etsy",
        blocks: [
          { kind: "para", text: "Etsy is a connection of its own rather than a webhook recipe. You sign in to Etsy once, and your shop's orders arrive in NivaDesk with the buyer, the items and the personalisation notes already in place — so a made-to-order shop can work from its production board instead of living in the Etsy tab." },
          { kind: "para", text: "Nothing is imported behind your back. The first import is a preview you approve, and any order NivaDesk will not bring in tells you why in a sentence instead of disappearing quietly." },
          { kind: "sub", text: "Connecting your shop" },
          { kind: "bullets", items: [
            "[Web] Settings → Integrations → Etsy → Manage, then Connect Etsy. NivaDesk lists what it will read before it sends you anywhere.",
            "You approve on Etsy's own page and come back. NivaDesk never sees your Etsy password, and no Etsy access is ever held by your browser.",
            "The access is read-only: your orders and your shop details (and the buyer's email when Etsy shares one — often it does not). NivaDesk cannot touch your listings, your prices or anything else in your shop.",
            "On your return the shop is checked and named on screen, so you can see which shop you connected before going any further.",
            "One Etsy shop per workspace at the moment."
          ] },
          { kind: "sub", text: "Choosing what comes in" },
          { kind: "bullets", items: [
            "How far back to look: the last 30 days, 90 days (the default) or 12 months.",
            "Completed, cancelled, digital-only and not-yet-paid orders are each left out unless you turn them on.",
            "Preview changes nothing in your workspace. It shows every order it found and what it would do with each one.",
            "An order it will not import says why: cancelled on Etsy, digital only, not paid yet, or nothing in it NivaDesk can map.",
            "An order in another currency is kept exactly as the buyer paid it, and never converted.",
            "Import everything the preview found, or tick only the orders you want."
          ] },
          { kind: "sub", text: "Buyers and your customer list" },
          { kind: "para", text: "When the same buyer orders again, NivaDesk recognises them and files the new order under the customer you already have." },
          { kind: "bullets", items: [
            "A buyer is linked automatically only when Etsy's own buyer id matches — the one signal that cannot be a coincidence.",
            "Etsy hides many buyers behind a forwarding address, and NivaDesk will not treat one of those as proof of who someone is.",
            "When it is unsure it shows you the likely matches and lets you choose, then remembers your answer so it does not ask twice."
          ] },
          { kind: "sub", text: "Staying up to date" },
          { kind: "bullets", items: [
            "Etsy tells NivaDesk about new and changed orders as they happen, and NivaDesk also checks your shop about once an hour to catch anything missed. Sync now is there for when you would rather not wait.",
            "The sync centre says what actually happened on each run: what arrived, what was updated, and anything that needs a look.",
            "Etsy keeps the money and the buyer. Totals, items and buyer details go on coming from your shop.",
            "Your production work is yours — stages, notes, schedule, files, everything you add here — and a sync never writes over it. If you correct the customer's name, the design name or the delivery address, your version stays; Etsy's own copy stays visible in the Etsy panel on the order.",
            "If the connection ever needs your attention the card says so in plain words, and Reconnect puts it right. Your orders are untouched in the meantime."
          ] },
          { kind: "sub", text: "Disconnecting" },
          { kind: "bullets", items: [
            "Disconnect says what will happen before it happens: syncing stops, the stored Etsy access is destroyed, and Etsy's copy of the order details and the remembered buyer matches are removed from NivaDesk.",
            "Every order and every piece of production work already in NivaDesk stays exactly where it is."
          ] }
        ]
      },
      {
        id: "set-ebay",
        title: "eBay",
        blocks: [
          { kind: "para", text: "Connect your eBay seller account and your eBay orders appear in NivaDesk's Orders alongside everything else, with the buyer's username, the items, totals, taxes and any tracking eBay has. Every workspace can connect eBay. NivaDesk reads your orders; it does not change your listings, prices or stock. Buyer contact details are kept in a protected place and shown only when you ask for them." },
          { kind: "sub", text: "Connecting your account" },
          { kind: "bullets", items: [
            "[Web] Settings → Integrations → eBay → Set up, then Connect eBay. Approve the connection on eBay in the same browser and you come straight back.",
            "[Mac] [iPhone/iPad] [Android] The same button opens nivadesk.app in your browser; sign in if asked, approve on eBay, then come back to the app and press Check now.",
            "Only the workspace owner can connect or disconnect.",
            "The connection is read-only: your orders and who they are from. NivaDesk cannot change a listing, a price or your stock."
          ] },
          { kind: "sub", text: "Choosing what comes in" },
          { kind: "bullets", items: [
            "Choose How far back (7, 30 or 90 days), and whether to Include orders that are not paid yet and Include cancelled orders. Which eBay sites come in, and Check eBay for new and changed orders automatically, are set later in What comes in, once the first orders have arrived.",
            "Preview shows how many orders were found and how many duplicates were prevented before anything is written.",
            "A large import may pause and ask you to press Import again; nothing is lost in between.",
            "If an order or two could not be brought in, the card says so and Retry tries just those again."
          ] },
          { kind: "sub", text: "Staying up to date" },
          { kind: "bullets", items: [
            "NivaDesk checks eBay for new and changed orders on its own through the day and once more each night with an overlap, so a change is never missed.",
            "Sync now checks the last 24 hours immediately.",
            "Sync health shows the last successful check, pending retries and anything that needs a look.",
            "Your production work is yours — stages, notes, schedule, files — and a sync never writes over it."
          ] },
          { kind: "sub", text: "Buyers and your customer list" },
          { kind: "bullets", items: [
            "eBay buyers are not added to your customer list automatically and are never merged by name.",
            "Their address is available from the order when you need it to ship, and every time it is shown is recorded.",
            "It is removed 90 days after delivery, which is also when eBay stops showing it to you."
          ] },
          { kind: "sub", text: "If eBay asks you to reconnect" },
          { kind: "bullets", items: [
            "When eBay stops accepting the connection (permission removed, a changed eBay password, or the 18-month authorisation ends) the card says Reconnect required; press Reconnect eBay and approve again.",
            "Nothing already imported is lost, and orders that changed while you were disconnected are picked up.",
            "eBay is open to every workspace; if the card ever says it is not available, send it to NivaDesk Support."
          ] },
          { kind: "sub", text: "Disconnecting" },
          { kind: "bullets", items: [
            "Disconnect removes NivaDesk's access to your eBay account and stops syncing; the orders you imported stay."
          ] },
          { kind: "sub", text: "Daily call budget, a full plan and the counts on the card" },
          { kind: "bullets", items: [
            "The card shows Calls used today. Each connection has a daily share of eBay's call allowance; when it is used up the card says Today's call budget for this connection is used up. Sync resumes tomorrow. Nothing is lost — the next sync picks everything up.",
            "On a plan with an order limit, new eBay orders wait under Parked (plan full) once the limit is reached; mark finished orders delivered, or change plan, and they come in.",
            "The counts show eBay orders in NivaDesk, Waiting for retry, Needs review and Failed.",
            "A DHL label cannot be created for an eBay order."
          ] }
        ]
      },
      {
        id: "set-stripe",
        title: "Stripe card payments and payment links",
        blocks: [
          { kind: "para", text: "On the paid plans, send a customer a card payment link — for an order (a deposit, an instalment or the balance), or on its own before there is an order — and the money is paid into your own Stripe account. The customer pays on Stripe's secure page by card, or with Apple Pay or Google Pay where Stripe offers them, and NivaDesk records it when Stripe confirms the payment. NivaDesk takes no commission; Stripe's own fees apply." },
          { kind: "sub", text: "Connecting Stripe (owner)" },
          { kind: "steps", items: [
            "Settings ▸ Integrations ▸ Stripe ▸ Set up (Manage once connected).",
            "Press Connect Stripe, choose Country your business is registered in, then Continue to Stripe. The country cannot be changed later; a country that is not in the list is one Stripe does not accept yet.",
            "Finish Stripe's own sign-up in the Stripe tab, come back and press Check again.",
            "The screen says Ready to take payments when you can create links. Stripe needs more information or Finish setting up with Stripe means Stripe is still waiting for something — Continue with Stripe opens it again."
          ] },
          { kind: "bullets", items: [
            "Stripe payments are part of the paid plans. On Free the Stripe screen says so, with See plans, instead of Connect Stripe; links already sent can still be paid, copied, cancelled and refunded.",
            "Only the owner can connect or disconnect; everyone can see whether payments work.",
            "Disconnect asks first. Links already sent keep working at Stripe but are no longer recorded in NivaDesk, so cancel open links before you disconnect. Your Stripe account itself is not closed.",
            "Stripe sends the customer a receipt only when Successful payments is turned on in your Stripe Dashboard (Settings → Customer emails)."
          ] },
          { kind: "sub", text: "Sending a payment link for a deposit, an instalment or the balance" },
          { kind: "steps", items: [
            "Open the order ▸ Financial Info card ▸ Payment links. It shows Still to pay and Not yet asked for.",
            "Press + New payment link, choose Deposit, Instalment or Remaining balance, check the amount and press Create link.",
            "Copy link and send it to your customer yourself — by email, message or however you talk to them. NivaDesk never sends it for you."
          ] },
          { kind: "bullets", items: [
            "The link is in your workspace's currency. Amounts take at most two decimals, and 12,50 means 12.50 in every language.",
            "Each link shows its status: Open, Processing, Paid, Expired, Cancelled, Refunded, Partially refunded or Disputed. Cancel closes an open link.",
            "When the customer pays, the order's paid and remaining amounts update on their own.",
            "Creating a link needs the Financial Info card and permission to edit the order. The iPhone, iPad and Android apps can create and cancel links too; connecting Stripe is done on the web.",
            "Banking ▸ Payment Links lists every link of the workspace (Open, Paid, Expired, Cancelled, Refunded / Disputed, All). Link for an order there opens the order picker; New payment link makes a link without an order (below)."
          ] },
          { kind: "sub", text: "A payment link without an order (the order opens when the customer pays)" },
          { kind: "steps", items: [
            "Banking ▸ Payment Links ▸ New payment link.",
            "Fill in What is this payment for? and the Amount (in your workspace's currency); add Customer name (optional) and Customer email (optional) if you know them, and tick Ask for phone number or Ask for delivery address if you need them. Press Create link.",
            "Copy link and send it. Until it is paid the row says The order opens when the customer pays.; when the customer pays, NivaDesk opens the order with the details they enter, and the row links to it."
          ] },
          { kind: "sub", text: "Refunding a payment" },
          { kind: "bullets", items: [
            "[Web] On the order, a paid link has Refund payment (owner). Enter the Amount to refund — less than the full amount for a partial refund — pick the Reason (Customer asked for a refund or Duplicate payment) and press Refund with the amount.",
            "A refund cannot be undone; the money comes from your Stripe balance and Stripe keeps its processing fee. Refund pending means Stripe will finish it when your balance allows.",
            "A disputed payment, or a link paid more than once, is refunded in your Stripe Dashboard instead."
          ] },
          { kind: "sub", text: "Your own address for payment links (pay.yourdomain)" },
          { kind: "bullets", items: [
            "Links are short, like pay.yourdomain/p/code. Without a domain of your own they use your customer portal domain, or nivadesk.app.",
            "Settings ▸ Integrations ▸ Stripe ▸ Payment link address: type the address, press Use this address, add the CNAME record it shows at your domain provider, then Check again. It goes from DNS required to Domain verified to Live."
          ] }
        ]
      },
      {
        id: "set-dhl",
        title: "DHL Express",
        blocks: [
          { kind: "para", text: "Prepare DHL Express shipments straight from your orders: see the DHL services for the parcel's route, create the label, add the commercial invoice where customs needs one (including between Great Britain and Northern Ireland) and follow the tracking. Each business connects its own DHL Express account and MyDHL API access, so DHL bills you directly. NivaDesk does not book courier pickups." },
          { kind: "sub", text: "Getting a MyDHL API key from DHL" },
          { kind: "bullets", items: [
            "You need MyDHL API access for your own DHL Express account. On the MyDHL API page of developer.dhl.com choose Get Access and fill in DHL's form with your DHL Express account number (Open the MyDHL API page in the DHL Express settings links there).",
            "DHL sends a test key first and decides when production access opens."
          ] },
          { kind: "sub", text: "Connecting DHL Express (owner)" },
          { kind: "steps", items: [
            "Settings ▸ Integrations ▸ Shipping ▸ DHL Express ▸ Set up (Manage once connected).",
            "Choose DHL test environment or DHL production, fill in API key, API secret, DHL Express account number and, if you have one, Duties account number (optional).",
            "Press Connect DHL Express.",
            "In Sender details add your Title / Position and Registration numbers (EORI, VAT) with + Add a registration number, then Save sender details."
          ] },
          { kind: "bullets", items: [
            "Only the owner can connect or disconnect DHL Express; the owner or an admin keeps the sender details.",
            "Every workspace can connect it."
          ] },
          { kind: "sub", text: "Creating a DHL label for an order" },
          { kind: "steps", items: [
            "Open the order ▸ Shipping & Tracking card ▸ + Prepare a DHL shipment.",
            "Check Sender, Recipient and Parcels. Under Contents and customs choose Goods to declare or Documents and who pays duties (DAP, or DDP where your account allows it), then Confirm the declaration.",
            "Press Show DHL services for this parcel, pick a service, then Check and create — or Save draft to finish later.",
            "Create DHL label. The order then has Open label and, where customs needs one, Open commercial invoice."
          ] },
          { kind: "bullets", items: [
            "Prices for the services are shown to people who can see finances.",
            "Refresh tracking fetches the latest status; it also refreshes about every hour. Statuses run from Draft and Label created to In transit, In customs, Out for delivery and Delivered.",
            "A label is not a dispatch: you still hand the parcel to DHL or book the pickup with DHL yourself.",
            "Needs a check means NivaDesk could not confirm whether DHL created the shipment; Find shipments made on MyDHL or Search DHL again settles it before anything is created twice.",
            "Declaring goods and the commercial invoice need finance access. A DHL label cannot be created for an eBay order."
          ] }
        ]
      },
      {
        id: "set-safety",
        title: "Safety & Uploads",
        blocks: [
          { kind: "para", text: "Protect your workspace when people upload files." },
          { kind: "bullets", items: [
            "Maximum upload size and allowed file types.",
            "The upload policy users accept before adding files.",
            "These limits apply to Client Files across every order."
          ] }
        ]
      },
      {
        id: "set-data",
        title: "Data Management",
        blocks: [
          { kind: "para", text: "Import, export and back up your workspace data, and manage data clean-up." },
          { kind: "sub", text: "Importing a backup" },
          { kind: "bullets", items: [
            "Import is a dry run first: before anything is written you see how many orders and customers the file holds, how many already exist in the workspace, how many look like duplicates, and whether the file includes settings.",
            "If the file is the exact backup you last downloaded, the preview says so — the SHA-256 noted at download time is checked against the file you picked.",
            "Likely duplicates are skipped by default; untick Skip likely duplicates only when you want deliberate second copies. One import is capped at 500 records and tells you what was left out.",
            "After importing, Undo this import removes exactly the records that import created. Settings changes are not undone."
          ] },
          { kind: "sub", text: "Exporting orders to CSV for your accountant" },
          { kind: "bullets", items: [
            "Settings ▸ Data Management ▸ Export, or the Export orders to CSV button on the Orders list, opens the export page. The file is a CSV that opens in Excel, Numbers, Google Sheets or any accounting package.",
            "Four templates, so you send the shape your accountant asked for: Invoices is one row per invoice with status, dates, contact and totals; Line items is one row per product or service line; Payments is one row per payment received, which is the cash ledger; Finance is one row per invoice with the accountant columns — revenue, cost, VAT and net profit.",
            "Payments and Finance carry money columns, so they are only offered to people whose role can see Financial Info. The other two templates are available to everyone who can export.",
            "Pick the period from This month, Last month, This quarter, This year, Last year, All time, or a custom range with your own start and end dates.",
            "Export is available on every plan, including Free — your figures are yours, and you can take them out at any time."
          ] },
          { kind: "sub", text: "Change history" },
          { kind: "bullets", items: [
            "Every workspace settings save — from web, Mac, iPhone or Android — is recorded as a change entry: which fields changed, when, and by whom. Entries are kept for 90 days.",
            "The workspace owner reads the history under Settings ▸ Data Management ▸ Change history on the Pro and Team plans. Recording never pauses, so upgrading shows what already happened.",
            "Secrets stay secret: an API key change is recorded as the fact that it changed — never the key itself."
          ] }
        ]
      },
      {
        id: "set-plan",
        title: "Plan & Access",
        blocks: [
          { kind: "para", text: "See your current plan, your usage limits and which features are available, and manage billing. Compare Free, Starter, Pro and Team here; the plan page also says where your subscription is billed — the website, the App Store, Google Play or Shopify — because that is the only place it can be changed." }
        ]
      },
      {
        id: "set-team",
        title: "Team Access",
        blocks: [
          { kind: "para", text: "Invite people to your workspace by email or let them ask to join, choose what each of them can see and do, and take a member's access away — for a while or for good — without losing anything they did. Adding and managing people is for the workspace owner, on the Team plan." },
          { kind: "sub", text: "Inviting someone by email (invitation link)" },
          { kind: "steps", items: [
            "Settings ▸ Team Access ▸ Advanced: connect with Company ID › opens the Team page (Getting started ▸ Invite a team member opens it too).",
            "Press Invite Member, choose By email, enter their email, pick a role and press Send Invitation.",
            "They get an email with a link to nivadesk.app/invite/…, valid for 14 days. They sign in (or press I do not have an account yet and create one with the invited email) and press Accept Invitation."
          ] },
          { kind: "bullets", items: [
            "If the email could not be sent, the invitation is still created: copy the link it shows and send it yourself.",
            "Waiting to be accepted lists invitations not used yet; Withdraw cancels one."
          ] },
          { kind: "sub", text: "Letting someone ask to join (Company ID)" },
          { kind: "bullets", items: [
            "Copy invite code in Settings ▸ Team Access copies your Company ID. The person signs up, chooses Request Access and sends a request with your email or the Company ID.",
            "Their request appears in Team Access: choose a role, then Approve or Decline."
          ] },
          { kind: "sub", text: "Roles and what each person can do" },
          { kind: "bullets", items: [
            "Roles: Member, View Only, Workflow Only, or a role profile of your own. The owner's role is fixed.",
            "The Permission matrix shows every role side by side — what each can view, edit or delete — with how many people have it.",
            "Control which menus, order cards and settings each role can see, including Bank Spending, Customer messages (WhatsApp, Instagram) and Team messages.",
            "Assign specific projects to specific people, and appoint support managers to handle workspace tickets."
          ] },
          { kind: "sub", text: "Seats, removing access and giving it back" },
          { kind: "bullets", items: [
            "Team includes 5 seats; extra seats are £5 a month or £50 a year each, up to 10 users. A person whose access is removed does not use a seat.",
            "On the Team page, Remove Access takes someone's access away: nothing they did is deleted, they show No access, and Restore Access gives it back.",
            "Remove takes a person out of the workspace altogether."
          ] }
        ]
      },
      {
        id: "set-sms",
        title: "Customer SMS",
        blocks: [
          { kind: "para", text: "Text your customer when their work reaches a milestone, with a link to their order page. Owner only, under Settings ▸ Customer SMS, and available on NivaDesk Pro and Team." },
          { kind: "sub", text: "Sending is not switched on yet" },
          { kind: "para", text: "A text can only be sent from a sender name the mobile networks have registered. NivaDesk's own sender name is with the network operator for approval, so you can set everything up now and nothing will be sent until it clears. The screen says which state you are in rather than leaving you guessing." },
          { kind: "sub", text: "Which status changes send a text, and stopping the ones you do not want" },
          { kind: "bullets", items: [
            "Estimate ready — on by default.",
            "Work started — on by default.",
            "Ready for collection — on by default.",
            "Every status change — OFF by default, and deliberately. Telling a customer about every internal step is a choice your business makes, not one made for you.",
          ] },
          { kind: "sub", text: "The SMS sender name your customer sees" },
          { kind: "bullets", items: [
            "By default the platform sender name, with your workspace name written into the message so the customer knows who it is from.",
            "You can register your own sender name instead — a customer trusts your studio's name more than ours. Enter it and it goes to \"pending\": a workspace cannot mark its own sender approved, the network operator does that.",
            "Changing the name starts registration again, because the approval was for the old name.",
            "The default calling code decides how a local number like 07700 900123 is dialled. It is 44 unless you change it.",
          ] },
          { kind: "sub", text: "What each text costs, and this month\u2019s usage" },
          { kind: "bullets", items: [
            "The screen shows this month's messages, segments and spend. A long message is more than one segment, and each segment is charged.",
            "The number used is the one on the order's customer field; an order with no number is skipped rather than failing.",
          ] },
        ]
      },
      {
        id: "set-client-domain",
        title: "Customer Portal Domain",
        blocks: [
          { kind: "para", text: "Put YOUR name on every link your customers see — order tracking, estimates and future customer pages. Owner only, under Settings ▸ Customer Portal Domain." },
          { kind: "sub", text: "Your free NivaDesk subdomain" },
          { kind: "steps", items: [
            "Open Settings ▸ Customer Portal Domain (you must be the workspace owner).",
            "Type a name — letters, numbers and hyphens, 3–40 characters — and press Save.",
            "Your customer links can use name.nivadesk.app. Included on every plan; claiming a new name releases the old one."
          ] },
          { kind: "sub", text: "Your own domain (Pro and Team)" },
          { kind: "steps", items: [
            "Enter a subdomain of a website you own, like track.yourdomain.com, and press Connect. A bare domain or a path such as yourdomain.com/track will not work — DNS cannot route paths.",
            "At your domain provider, add the CNAME record shown on screen, pointing to customers.nivadesk.app.",
            "Press Check again. NivaDesk reports exactly what DNS returned; changes can take up to an hour to spread. The step flow on the card walks Enter domain → Add the DNS record → Verify ownership → Certificate, and the values are copyable with one tap.",
            "After verification a security certificate is issued for your domain automatically — usually within a few minutes. Press Check again to refresh; the card shows Live when your links are being served."
          ] },
          { kind: "bullets", items: [
            "A verified domain serves your customer links with your branding — and your free name.nivadesk.app subdomain works immediately, with no DNS setup at all. Existing nivadesk.app links keep working either way.",
            "Each hostname belongs to one workspace — a name someone else verified cannot be claimed.",
            "Remove a domain any time with the Remove button; your links fall back to the standard nivadesk.app addresses."
          ] },
          { kind: "bullets", items: [
            "The \"Your customer links\" card in the same section shows a live example of your short links (like https://yourstudio.nivadesk.app/r/…) — order tracking and estimate pages follow whichever name you set up.",
            "Once a name is set up, the links NivaDesk hands out — the portal link on the order card, estimate links and SMS status updates — use your branded address automatically. Links shared earlier keep working on the old address.",
            "File links follow your name too: opening or sharing a client file uses a clean viewer link on your address (like track.yourdomain.com/f/…) instead of a raw storage URL, and the files a customer opens from their tracking page stay on your domain as well."
          ] },
          { kind: "sub", text: "The NivaDesk app for ChatGPT" },
          { kind: "bullets", items: [
            "NivaDesk has an app inside ChatGPT, so you can ask about your own workspace in plain language. It has its own section: see NivaDesk in ChatGPT."
          ] },
          { kind: "sub", text: "Customer page branding" },
          { kind: "bullets", items: [
            "In the same section, pick an accent colour for the order tracking page — it colours the status and progress dots. Use the default colour button clears it.",
            "The \"Powered by NivaDesk\" line on customer pages can be switched off on the Pro and Team plans.",
            "Your logo, business name and footer note already come from your workspace branding settings."
          ] }
        ]
      },
      {
        id: "chatgpt-app",
        title: "NivaDesk in ChatGPT",
        blocks: [
          { kind: "para", text: "NivaDesk has an app inside ChatGPT. Once you connect your workspace you can ask about it in plain language — what is overdue, what a customer ordered before, how a month went — and ChatGPT answers from your own records, in the role you have in NivaDesk." },
          { kind: "para", text: "It works on the same orders, notes, finance and banking data you see in the app. It cannot see another workspace, and it never talks to your shops or your bank directly: everything comes through NivaDesk." },
          { kind: "sub", text: "Connecting" },
          { kind: "bullets", items: [
            "In ChatGPT open the apps list, choose NivaDesk and sign in with the NivaDesk account you already use. You pick the workspace on the NivaDesk consent page; ChatGPT never sees your password.",
            "Owners can see and end ChatGPT connections under Settings ▸ Account; connecting again from the same account replaces the earlier connection."
          ] },
          { kind: "sub", text: "What you can ask" },
          { kind: "bullets", items: [
            "Orders: find orders by customer, reference, design name or status; open one; add a note; change its status or design status; create a new order. Workflow-only members see only the orders assigned to them, and money fields are hidden from roles without the Financial permission.",
            "Notes: create, search, open, append to, edit, pin and archive your own personal notes. Team notes are not changed from ChatGPT.",
            "Finance and dashboard: an order's financials, the dashboard summary, the financial overview and extra spending for a month, year or date range — on the Starter plan in the basic shape, on Pro and Team with profit and remaining balances.",
            "Banking: monthly spending by category and merchant, recurring costs, search of bank transactions, and receipts — send a receipt or invoice photo and NivaDesk matches it to the bank line; if several lines could fit it asks which; if the payment has not arrived yet the receipt waits under Banking ▸ Receipts and is matched when it does. Attaching receipts is for the workspace owner.",
            "Across your channels: find an order from any channel — Shopify, Etsy, WooCommerce, Square, Amazon, eBay or one you took yourself — by order number, the shop's own order number, customer, date, or payment or fulfilment state. The shop's own status stays a separate field from your NivaDesk status, so you can see where the two disagree, and the answer says when each channel that contributed last synced, or says it cannot tell. It reports no amounts at all: it tells you where an order is and whether it is paid, never what it was worth, and it names no currency. For the figures, ask about that order's financials — a different tool, with your Financial permission in front of it. Buyer details are withheld for channels whose own data policy restricts them.",
            "Inventory: search your stock by name, SKU, serial number, brand, model, category or location, and narrow it to low stock, reserved items, a status or a place."
          ] },
          // Version 1.2.0 of the ChatGPT app (operator decision, 10 September
          // 2026) publishes the two cross-channel reads behind
          // NIVADESK_MCP_ORCHESTRATOR alone, so the channel search and the
          // stock search sit under "What you can ask" above. The photo add
          // (create_inventory_item) is behind NIVADESK_MCP_INVENTORY, which is
          // not part of that release, so it is the one capability left here.
          // This heading is what keeps the guide honest: a bot that offers a
          // tool the app does not publish sends the reader somewhere that is
          // not there. Anything named here must have a registry row —
          // functions/test/qa/mcp-reduced-surface.test.js reads this chapter
          // out of the built corpus and checks each block against the registry
          // and the release flag. Deploy order matters too: this text goes
          // live with the assistant functions only AFTER chatgptMcp has been
          // deployed with the flag set (docs/openai-resubmission-package-2026-09-10.md).
          { kind: "sub", text: "Coming in the next version of the app" },
          { kind: "bullets", items: [
            "The one below is built and tested but is not in the version of the NivaDesk app published in ChatGPT today, so asking for it now gets you the answers above instead. It arrives with a later release, and nothing on your side has to change for it.",
            "Inventory from a photo: add an item from a photo — NivaDesk reads the photo, says what it thinks the item is, and only adds it once you confirm."
          ] },
          { kind: "sub", text: "When your customer hears about it" },
          { kind: "bullets", items: [
            "Changing an order's status from ChatGPT is the same action as changing it in the app, and it can reach your customer the same way: if the order has automatic updates on — which is the default for orders that carry an email address — NivaDesk emails them about the new status, and sends an SMS too where you have SMS switched on. ChatGPT can only choose from the statuses your workspace already uses, and it should tell you before it changes one.",
            "You control this per order with the customer updates switch, and for the whole workspace under Settings ▸ Notifications. Turning automatic updates off for an order means no message goes out however the status is changed."
          ] },
          { kind: "sub", text: "What it will not do" },
          { kind: "bullets", items: [
            "It does not change anything in Shopify, Etsy, WooCommerce, Square, Amazon or eBay, and it does not write to your bank or your accounting software. It cannot write a message of its own to a customer either — the only thing that reaches them is your workspace's own status update, in your workspace's own words.",
            "When a figure depends on a shop or bank sync that is behind, the answer says so instead of presenting old numbers as live."
          ] },
          { kind: "sub", text: "NivaDesk in Claude (the Claude connector)" },
          { kind: "bullets", items: [
            "Claude, Anthropic's assistant, can work with your workspace through the NivaDesk connector, on every plan: it looks up orders, notes, stock and figures and makes the changes your role allows, as the ChatGPT app does.",
            "In Claude open Settings › Connectors, choose Add custom connector and paste the connector address https://nivadesk.app/claudeMcp (until NivaDesk appears in Claude's own directory), then sign in with your NivaDesk account and choose the workspace.",
            "For a receipt, Claude gives you a NivaDesk upload link for one transaction, valid for 15 minutes; the file never passes through Claude.",
            "You stay connected: you sign in again only if it was disconnected, your access changed, or it went unused for 90 days. Disconnect it in Settings ▸ Integrations."
          ] }
        ]
      },
      {
        id: "set-support",
        title: "Support / Tickets",
        blocks: [
          { kind: "para", text: "Contact your workspace owner or admins, or open a support ticket to the NivaDesk team: the same tickets you see in the Messages menu." },
          { kind: "bullets", items: [
            "Three tabs: Internal Workspace Ticket goes to your own owner, admins and support managers; Contact NivaDesk Support goes to us; Website Chats is the NivaDesk team's own inbox for questions sent from the website widget.",
            "The \"How do I…?\" assistant can file the ticket for you: when a question is outside what the guide covers it offers Send this to NivaDesk Support, and one press opens the ticket with your question as the title and the assistant's own reply attached, so you never retype it."
          ] }
        ]
      }
    ]
  },
  {
    id: "language-theme",
    title: "Language & appearance",
    blocks: [
      { kind: "para", text: "Make NivaDesk look and read the way you prefer. Both live in Settings ▸ General and sync across your devices." },
      { kind: "bullets", items: [
        "Language: choose any of 12 languages; the whole app, including menus and labels, switches instantly.",
        "Appearance: switch between light and dark mode.",
        "Your choices are saved to your account, so they follow you on Mac, iPhone, iPad, Android and web."
      ] }
    ]
  },
  {
    id: "finding-your-way",
    title: "Finding your way around, on each app",
    blocks: [
      { kind: "para", text: "NivaDesk is the same workspace on the web, on Mac, on iPhone and iPad, and on Android — but a phone cannot show a row of menus the way a browser can, so the way you reach a section differs. The rest of this guide writes a place as Section ▸ Tab ▸ Button; this chapter is how to walk that path on the app you are holding." },
      { kind: "bullets", items: [
        "[Web] The sections run along the top of the window — Home, Orders, Production, Dashboard, Bank, Schedule, Notes, Customers, Inventory, Files, Messages, AI Replies, Settings. Click one to open it; a section's tabs then sit inside it.",
        "[Mac] The same row of sections along the top of the window, and the same tabs inside each one.",
        "[iPhone/iPad] There is no room for the row, so the sections live behind the menu button in the top bar. Tap it, pick the section, and its tabs appear inside.",
        "[Android] The same: the menu in the top bar lists the sections, and tabs sit inside the section you pick.",
        "Everything after the first ▸ — the tabs, the buttons, the fields — is named the same on all four, so once you are in the right section the steps read the same."
      ] }
    ]
  },
  {
    id: "help-assistant",
    title: "The help assistant (How do I…?)",
    blocks: [
      { kind: "para", text: "Inside the app, the help assistant (How do I…?) answers from this guide. On Starter, Pro and Team it gives the steps — where to go and what to press. It reads the guide, not your workspace, so it never sees your orders or figures." },
      { kind: "sub", text: "Where the help assistant is" },
      { kind: "bullets", items: [
        "Press How do I…? — the button at the bottom right of the screen, in the web app and in the Mac, iPhone, iPad and Android apps.",
        "Getting started ▸ Ask the help assistant a question opens it too.",
        "On nivadesk.app the chat in the corner answers as well; signed in on Starter, Pro or Team it gives the same steps as the assistant in the app."
      ] },
      { kind: "sub", text: "What it can and cannot answer" },
      { kind: "bullets", items: [
        "Ask how something works, where a button is or how to set something up, in any language.",
        "It cannot see your workspace. For questions about your own data — which orders are late, how much you made — it points you to the NivaDesk ChatGPT app.",
        "When the guide does not cover a question, Send this to NivaDesk Support turns it into a ticket with the answer it gave attached; See your tickets shows the reply.",
        "Starter, Pro and Team can ask 40 questions a day."
      ] }
    ]
  },
  {
    id: "notifications",
    title: "Notifications on your phone and computer",
    blocks: [
      { kind: "para", text: "NivaDesk can tell you something happened without you having to look. Notifications arrive on the devices you are signed in on — Mac, iPhone, iPad, Android and the web app — and each one opens the thing it is about." },
      { kind: "bullets", items: [
        "A new order arriving from your shop or your website.",
        "A parcel moving: the first tracking scan, and delivery.",
        "A note shared with you, and an invitation to work on a note together.",
        "A message from a teammate, and a reply on a support ticket.",
        "Anything that lands in the activity list is a notification as well, so the list and the alerts never tell different stories."
      ] },
      { kind: "sub", text: "Turning them on, and off" },
      { kind: "bullets", items: [
        "The first time you open NivaDesk on a device it asks that device for permission. Say no and nothing else changes.",
        "There is no switch inside NivaDesk: notifications are turned on and off by the device itself, one device at a time. On iPhone and iPad, Settings ▸ Notifications ▸ NivaDesk. On Mac, System Settings ▸ Notifications ▸ NivaDesk. On Android, Settings ▸ Apps ▸ NivaDesk ▸ Notifications. In a browser, the site settings for nivadesk.app.",
        "Turning them off on your phone leaves them on everywhere else you are signed in, which is usually what people want.",
        "A device registers itself when you sign in, and is removed when you sign out — so a phone you have signed out of stops receiving anything about that workspace.",
        "Notifications follow the workspace you are signed in to. They are not sent to people outside it, and a notification meant for particular people is sent only to them."
      ] }
    ]
  }
];

// --- Turkish tree -----------------------------------------------------------

const TREE_TR: GuideNode[] = [
  {
    id: "getting-started",
    title: "Başlarken",
    blocks: [
      { kind: "para", text: "İlk kez giriş yaptığınızda ne olur ve yeni çalışma alanınızı nasıl kurarsınız." }
    ],
    children: [
      {
        id: "first-sign-in-setup",
        title: "İlk girişte çalışma alanınızı kurma",
        blocks: [
          { kind: "para", text: "NivaDesk'i ilk açtığınızda beş adımlık bir kurulum, çalışma alanınızı yaptığınız işe göre hazırlar. Atlama (Skip) yoktur: her adım cevaplanabilir ve nasıl başlamak istediğinizi soran adımda \"Boş başla\" ile \"Bunu sonra ayarlayacağım\" gerçek birer seçenektir. Geri düğmesi ikinci adımdan itibaren hep oradadır." },
          { kind: "steps", items: [
            "Çalışma alanı temelleri: ülke, para birimi ve saat dilimi. Konumunuzdan önerilir; şimdi ya da sonra Ayarlar'dan değiştirilebilir.",
            "NivaDesk önce neye yardım etsin: cevabınız, kurulum bitince göreceğiniz üç başlangıç görevini belirler.",
            "İşinizi anlatın: ne ürettiğiniz ya da onardığınız. Bu, sipariş kartlarınızı, üretim aşamalarınızı ve etiketlerinizi belirler.",
            "İşinizi içeri alın: Shopify, WooCommerce veya Etsy bağlayın — ya da başka türlü başlayın: ilk siparişiniz, örnek bir çalışma alanı, tablo içe aktarma, boş çalışma alanı veya \"Bunu sonra ayarlayacağım\".",
            "Planınız: 14 günlük deneme hepsinde ücretsizdir, deneme bitmeden hiçbir ücret alınmaz ve planı istediğiniz zaman değiştirebilirsiniz."
          ] },
          { kind: "para", text: "Kurulum her çalışma alanı için bir kez çalışır. Daha önce geçtiyseniz, kurduğu her şey Settings içindedir." }
        ]
      },
      {
        id: "what-the-setup-changes",
        title: "Kurulum cevaplarınız neyi değiştirir",
        blocks: [
          { kind: "para", text: "Sorular anket değildir: her cevap elinize geçen çalışma alanını değiştirir." },
          { kind: "bullets", items: [
            "Ne ürettiğiniz ya da onardığınız; sipariş kartı düzeninizi, alanlarınızı ve etiketlerinizi belirler.",
            "Ağırlıklı olarak nasıl çalıştığınız; üretim panosu şeritlerinizi belirler — bir onarım atölyesi \"Ready to Ship\" yerine Intake, In Repair, Waiting, Testing ve Ready for Collection alır.",
            "Önce neye yardım istediğiniz; hazır ekranındaki üç başlangıç görevini belirler.",
            "NivaDesk'i kaç kişinin kullanacağı; ücretsiz iki haftanızın Pro mu Team mi olacağını belirler."
          ] },
          { kind: "para", text: "Burada hiçbir şey kalıcı değildir: iş türünüzü, iş akışı adımlarınızı, etiketlerinizi ve üretim aşamalarınızı sonradan Settings'ten değiştirebilirsiniz." }
        ]
      }
    ]
  },
  {
    id: "trial-and-plans",
    title: "Ücretsiz denemeniz ve planlar",
    blocks: [
      { kind: "para", text: "Kaydolmanın maliyeti, ücretli denemenin ne zaman başladığı ve bittiğinde ne olduğu." }
    ],
    children: [
      {
        id: "trial-no-credit-card",
        title: "Kaydolmak için kredi kartı yok",
        blocks: [
          { kind: "para", text: "NivaDesk'e kaydolmak için kredi kartı gerekmez; kurulumun hiçbir yerinde ödeme bilgisi istenmez. Free planın süresi hiç dolmaz: 10 aktif sipariş, sınırsız müşteri, kişisel notlarınız ve dışa aktarma erişimi; ücretsiz ve süresiz." },
          { kind: "para", text: "Ücretli planın 14 günlük denemesi bundan ayrıdır ve kaydolduğunuzda başlamaz." }
        ]
      },
      {
        id: "trial-when-it-starts",
        title: "14 günlük deneme ne zaman başlar",
        blocks: [
          { kind: "steps", items: [
            "İlk siparişinizi oluşturduğunuzda başlar — kayıtta değil; böylece iki hafta etrafa bakarak değil çalışarak geçer.",
            "Pro üzerinde çalışır; kurulumda NivaDesk'i birden fazla kişinin kullanacağını söylediyseniz Team üzerinde.",
            "Kredi kartı alınmaz ve abonelik oluşturulmaz. Hiçbir şey yenilenmez, hiçbir ücret çekilemez.",
            "Bir şerit kalan süreyi ve denemenin şu ana dek ne kazandırdığını gösterir. Görmek istemezseniz katlanır."
          ] },
          { kind: "para", text: "Her çalışma alanına bir deneme verilir; ödeme sayfasından ücretli plan başlatmak üstüne ikinci bir iki hafta eklemez." }
        ]
      },
      {
        id: "trial-when-it-ends",
        title: "Deneme bitince ne olur",
        blocks: [
          { kind: "para", text: "Çalışma alanı Free'ye döner ve bir bildirim bunu açıkça söyler; \"Free ile devam et\" ile \"Bir plan seç\" yan yana durur. Hiçbir şey silinmez: bütün siparişler, müşteriler, dosyalar ve notlar görünür ve dışa aktarılabilir kalır." },
          { kind: "para", text: "Duran şeyler ücretli plan özellikleridir — Client Files, gelişmiş finans, ekip mesajlaşması — ve Free'nin 10 aktif sipariş sınırının üstünde yeni sipariş açmak. Biten siparişleri teslim edildi olarak işaretlemek ya da artık gerekmeyenleri silmek sizi sınırın altına döndürür. NivaDesk hangi siparişlerinizin kalacağına asla kendisi karar vermez." },
          { kind: "para", text: "Sonradan yükseltmek her şeyi kaldığı yerden devam ettirir." }
        ]
      },
      {
        id: "plan-where-billed",
        title: "Planınız nerede faturalanıyor ve neden tek yerden satın alınır",
        blocks: [
          { kind: "para", text: "Bir NivaDesk planı dört yerden ödenebilir: web sitesinde kartla, Mac ve iPhone'da App Store üzerinden, Android'de Google Play üzerinden, ya da bizi Shopify App Store'dan kurduysanız Shopify faturanızda. Hangisini kullandıysanız, o plan yalnızca orada değiştirilebilir." },
          { kind: "bullets", items: [
            "Her uygulamadaki plan sayfası aboneliğinizin nerede olduğunu söyler ve aynı planı ikinci kez satmaya kalkmaz — başka bir yerden tekrar almak, tek bir çalışma alanı için iki şirketin sizden ayrı ayrı ücret alması demek olurdu ve ikisinin de diğerinden haberi olmazdı.",
            "Farklı bir plana geçmek için, hâlihazırda ödediğiniz yerden değiştirin: web sitesindeki Faturalandırma portalı, Apple abonelikleriniz, Google Play abonelikleriniz veya Shopify yönetim panelinizdeki NivaDesk uygulaması.",
            "Farklı bir yere taşınmak için önce mevcut aboneliğinizi iptal edin, sonra istediğiniz yerden tekrar satın alın. Çalışma alanınız ve içindeki her şey olduğu gibi kalır.",
            "Zaten ödediğiniz yerde kademe değiştirmek — Lite'tan Pro'ya, aylıktan yıllığa — normal bir yükseltmedir ve her zamanki gibi çalışır.",
            "Ek depolama ve ek ekip koltuğu birer eklentidir, plan değildir. Planınız nerede faturalanıyor olursa olsun, bulunduğunuz yerden satın alınabilirler."
          ] }
        ]
      },
      {
        id: "trial-monthly-yearly",
        title: "Aylık ve yıllık faturalandırma",
        blocks: [
          { kind: "para", text: "Yıllık faturalandırma, on iki ay için on aylık fiyattır. Plan sayfası her yıllık fiyatın yanında aylık karşılığını ve tam tasarruf tutarını gösterir — Pro yılda £190, yani ayda £15.83 ve £38 tasarruf — böylece ikisini dürüstçe karşılaştırabilirsiniz." },
          { kind: "para", text: "Aylık ve yıllık arasında istediğiniz zaman geçebilir, Settings ▸ Plan & Access üzerinden bize yazmadan iptal edebilirsiniz." }
        ]
      }
    ]
  },
  {
    id: "home",
    title: "Ana Ekran (Home)",
    blocks: [
      { kind: "para", text: "Home, uygulamayı açtığınızda indiğiniz ekrandır ve size aittir: atölyenin durumunu tek bakışta gösteren bir kart duvarı — yapılması gereken, yaklaşan ve gelen. Hangi kartların orada olacağına, her birinin ne kadar büyük olacağına ve hangi sırada duracağına siz karar verirsiniz." },
      { kind: "sub", text: "Kartlar" },
      { kind: "bullets", items: [
        "Getting started — kurulum kontrol listesi, sıradaki adım en başta. Geçtiğiniz adımlar sizin için geçilmiş kalır, başkalarında yerinde durur.",
        "Quick actions — en sık başlattığınız birkaç iş.",
        "Recent activity — çalışma alanında son olanlar.",
        "Money — faturalanan, tahsil edilen ve hâlâ beklenen tutarlar; saydığı aylarla birlikte.",
        "Banking — akış, incelemeyi bekleyenler ve fiş bekleyenler.",
        "Inventory — stokun durumu ve azalanlar.",
        "Customers — yeni gelenler ve işi süren müşteriler.",
        "Orders & production — üretim panosunun şeritleri ve içindeki siparişler.",
        "Schedule — hafta ve her tarihin hangi siparişe ait olduğu.",
        "Files — çalışma alanının doluluğu ve kütüphanede yapılacaklar.",
        "Notes — son notlarınız; sabitlenmiş olanlar sabitlenmiş görünür.",
      ] },
      { kind: "sub", text: "Düzeni değiştirme" },
      { kind: "steps", items: [
        "Customise'a basın. Düğme Done olur ve şu an sizde olmayan kartların şeridi açılır.",
        "Taşımak için kartı sürükleyin. [Android] Önce karta basılı tutun — Customise dışında uzun basış bir şey yapmaz, sürükleme ancak bu moda girince başlar.",
        "Kartın boyutunu 1×1, 2×1 ve 2×2 arasında değiştirin. Her kart üçünü de sunar ve büyük boyutta yalnızca büyümez, daha fazlasını söyler.",
        "Alttaki şeritten kart ekleyin ya da istemediğinizi gizleyin. Gizlenen kart silinmez — şeride geri döner, istediğinizde geri koyarsınız.",
        "Done'a basın. Düzen kendiliğinden kaydedilir.",
      ] },
      { kind: "sub", text: "Bilinmesi gereken iki şey" },
      { kind: "bullets", items: [
        "Düzen SİZE aittir, çalışma alanına değil. Kendi Home'unuzu değiştirmeniz başkasınınkini oynatmaz; tezgâhtaki kuyumcu ile muhasebeci ayrı ekranlara sahip olabilir.",
        "Yalnızca yetkinizin izin verdiği kartları görürsünüz. Money ve Banking finansal erişim ister; bu erişimi olmayan bir çalışma arkadaşı onları şeritte de görmez — kart ondan gizlenmiş değildir, yerleştirebileceği bir kart değildir.",
      ] },
    ]
  },
  {
    id: "dashboard",
    title: "Panel (Dashboard)",
    blocks: [
      { kind: "para", text: "Ana özet ekranınız. Tek tek siparişlere dalmadan önce neyin ilgi istediğini görmek için güne buradan başlayın." },
      { kind: "bullets", items: [
        "Aktif siparişler, yakında teslim edilecekler ve son etkinlik hakkında hızlı istatistikler.",
        "Geciken veya riskli işleri erkenden fark edin; kaçmasınlar.",
        "Sizi bekleyen bir siparişe doğrudan gidin."
      ] },
      { kind: "bullets", items: [
        "Yeni çalışma alanları Dashboard'ın üstünde bir Başlarken listesi görür: ilk siparişi oluştur, müşteri ekle, eski siparişleri ChatGPT ile aktar, mağaza bağla ve müşteri bağlantısı adını al. İlk ikisi veriniz oluştukça kendiliğinden işaretlenir; Hide this checklist listeyi kaldırır."
      ] },
      { kind: "sub", text: "Para kartlarını okumak" },
      { kind: "bullets", items: [
        "Revenue, seçili dönemdeki siparişlerin değerini sayar — para henüz gelmemiş olsa bile.",
        "Payments Received yalnız dönemde fiilen tahsil edilen parayı sayar; dışarıda ne kaldığını görmek için Revenue ile karşılaştırın.",
        "Outstanding Balance, o siparişlerde müşterilerin hâlâ borçlu olduğu tutardır.",
        "Net Profit = gelir − temel maliyet − ek harcama − platform komisyonu − kargo − KDV. Tam formül için kart başlığının üzerine gelin.",
        "İptal ve iade edilen siparişler hiçbir para rakamına girmez; Financial Breakdown bunları kendi \"Cancelled or refunded\" satırında gösterir.",
        "Tax set-aside kartı net KDV tutar — satışlarda tahsil edilen KDV eksi Standart/İndirimli oranlı banka ödemelerindeki iade alınabilir KDV — açıksa Kurumlar Vergisi de eklenir.",
        "Net Profit grafiğinde bir noktaya tıklayın; panel o döneme yakınlaşır.",
        "Dönem seçicide hazır aralıklar var — Son 7/30 gün, bu/geçen çeyrek, İngiltere vergi yılı — ve özel aralık.",
        "Shopify veya WooCommerce siparişi varsa dönem seçicinin altındaki kanal pilleri her rakamı tek satış kanalına — veya elle açılan siparişlere — daraltır.",
        "Başka para biriminde içe aktarılan siparişler Financial Breakdown'da kendi para birimleriyle, çevrilmedi işaretiyle listelenir — NivaDesk parayı asla sessizce çevirmez.",
        "Financial Breakdown ayrıca seçili aralığın Ortalama sipariş değerini (hasılat ÷ sayılan sipariş) ve Yeni/Dönen müşteri kırılımını gösterir — ilk siparişi aralığa denk gelen müşteri yenidir; tüm satış kanalları birlikte sayılır."
      ] }
    ]
  },
  {
    id: "orders",
    title: "Siparişler (Orders)",
    blocks: [
      { kind: "para", text: "Siparişler, NivaDesk'in kalbidir: üzerinde çalıştığınız tüm işlerin listesi. Buradan sipariş oluşturur, hızlıca bulur ve birini açıp tüm detaylarını yönetirsiniz." },
      { kind: "sub", text: "Sipariş listesi" },
      { kind: "bullets", items: [
        "Add Project: yeni sipariş oluşturur. Müşteri, başlık ve temel bilgileri verirsiniz; gerisini siparişin içinde doldurabilirsiniz.",
        "Arama: müşteri adı, sipariş numarası veya anahtar kelime yazarak doğrudan siparişe gidin.",
        "Hızlı filtreler: listeyi daraltın (örneğin yalnızca size atanan siparişler ya da aşamaya göre), diğerlerini kaybetmeden.",
        "Sıralama: listeyi akıllı önceliğe, en yeniye, teslim tarihine ve daha fazlasına göre sıralayın.",
        "Durum etiketleri: her kartta üretim durumunu bir bakışta gösteren küçük renkli etiketler; ayarlardan kapatabilirsiniz.",
        "Siparişi aç: bir karta dokunarak detay çalışma alanını açın."
      ] },
      { kind: "sub", text: "Sipariş detay çalışma alanı" },
      { kind: "para", text: "Bir siparişi açtığınızda Preview, Order Summary, Financial Info, Client Files ve daha fazlası gibi kartlar gelir. Her kart işin bir bölümünü kapsar. Hangi kartları göreceğinize ve nasıl dizileceğine siz karar verirsiniz." },
      { kind: "bullets", items: [
        "Herhangi bir kartı gösterin veya gizleyin; yalnızca size gerekenleri görün.",
        "Bir kartı sürükleyerek yerini değiştirin; kenarından sürükleyerek yüksekliğini ayarlayın.",
        "Kartın ... düğmesi Blok özelleştirme panelini açar: Yukarı/Aşağı/Sol/Sağ ile taşıyın, boyutlandırın (İçeriğe sığdır, Sütuna eşitle veya S/M/L), renklendirin, gizleyin veya yalnız o kartı Sıfırla ile varsayılanlara döndürün.",
        "Bir karta renk verin (8 seçenek) ki öne çıksın — her renk kartta görünen bir anlam etiketi taşır (Acil, Onaylandı, ...). Renk etiketlerini yönet ile bu anlamları tüm çalışma alanınız için, her platformda geçerli olacak şekilde yeniden adlandırabilirsiniz.",
        "Yerleşiminiz kendi kullanıcınıza bir kart profili olarak kaydedilir: ekip arkadaşlarınız kendi yerleşimlerini korur, sipariş içeriği ise ortak kalır.",
        "Bazı kartlarda Başlıkları Düzenle ile bölümleri ve alanları yeniden adlandırabilir, ekleyebilir veya kaldırabilirsiniz (aşağıda her kartta anlatılıyor)."
      ] },
      { kind: "sub", text: "Dışa aktarma & fatura" },
      { kind: "bullets", items: [
        "Siparişi PDF olarak dışa aktarın: PDF Export Settings'inizden oluşturulan derli toplu bir özet.",
        "Invoice (Fatura) oluşturun: NivaDesk, sipariş için fatura numarasını otomatik atar (yoksa) ve işletme bilgilerinizi ve alt notu Settings'ten kullanır.",
        "Ayrıca To Do listesini ve History kaydını da PDF olarak yazdırabilirsiniz.",
        "Bunların tümünün görünümünü Settings ▸ PDF Export Settings'ten özelleştirin."
      ] },
      { kind: "sub", text: "Tek olması gereken siparişleri birleştirme" },
      { kind: "bullets", items: [
        "Aynı müşterinin hafta içinde iki kez sipariş vermesi ya da bir işin hem siteden hem e-postayla gelmesi, tek olması gereken yerde iki sipariş bırakır. Siparişler listesinde ikisini işaretleyin ve Seçilenleri Birleştir'e basın.",
        "Hangisinin birincil sipariş olacağını seçin — yaşamaya devam eden, numarasını, kartlarını ve geçmişini koruyan sipariş odur.",
        "Ödemeler taşınır: diğer siparişlere kaydedilmiş her ödeme birincil siparişe eklenir, ödenen tutar yeniden yazılmak yerine toplanır.",
        "Birleştirilen siparişler yok edilmez, çöp kutusuna gider; yanlışlıkla yapılan bir birleştirme 30 gün içinde Settings ▸ Data Management üzerinden geri alınabilir.",
        "Birleştirme için siparişleri düzenleyebilen bir rol gerekir."
      ] },
      { kind: "para", text: "Soldan bir kart seçin; tam olarak ne işe yaradığını ve içinde neleri değiştirebileceğinizi görün." }
    ],
    children: [
      {
        id: "card-preview",
        title: "Preview kartı",
        blocks: [
          { kind: "para", text: "Preview kartı, siparişin görsel başlığıdır. Sipariş görselini ve işletme logonuzu gösterir; hem size hem müşterinize işe dair anında bir fikir verir." },
          { kind: "sub", text: "Neler yapabilirsiniz" },
          { kind: "bullets", items: [
            "Sipariş önizleme görselini ekleyin veya değiştirin (örneğin ürünün, tasarımın ya da tamirin fotoğrafı).",
            "Görsel ayrıca Siparişler listesinde siparişin yanında ve dışa aktarılan PDF'te görünür; bu yüzden net bir fotoğraf eklemekte fayda var.",
            "Önizleme görselleri standart görsel dosyalarını kabul eder (JPG, PNG, HEIC ve benzeri)."
          ] },
          { kind: "para", text: "İpucu: iyi bir önizleme fotoğrafı, kalabalık bir listede siparişleri bir bakışta tanımayı çok kolaylaştırır." }
        ]
      },
      {
        id: "card-repair-intake",
        title: "Onarım Kabulü ve Ürün kartı",
        blocks: [
          { kind: "para", text: "Müşteri onarım, bakım ya da tadilat için kendi ürününü size teslim ettiğinde, gelen şeyin kaydı bu karttır. Bilinçli olarak stok değildir: ürün müşteriye ait olarak damgalanır, böylece hiçbir yerde sizin stoğunuzla karıştırılamaz." },
          { kind: "sub", text: "Neler görünür" },
          { kind: "bullets", items: [
            "Kabulde kaydettiğiniz her ayrıntı için bir satır. Bu satırların ne olduğu iş dalınıza bağlıdır — kuyumcu Metal, Ayar ve Taş kaydeder; telefon tamircisi Seri / IMEI ve şifrenin verilip verilmediğini kaydeder.",
            "Durum ve İstenen İş, satır satır: ürünün geldiği hâli ile üzerinde anlaşılan iş ayrı ayrı yazılır.",
            "Müşterinin özellikle istediği şeyler için Müşteri Talimatları.",
            "Kabul Fotoğrafları: ürünün geldiği andaki hâli, o siparişin Client Files'ıyla paylaşılır. Aynı anda dört küçük görsel; birine dokununca tam boy açılır.",
            "Teslim Alındı ve Teslim Alan: ürünün ne zaman geldiği ve kimin aldığı."
          ] },
          { kind: "sub", text: "Neleri değiştirebilirsiniz" },
          { kind: "bullets", items: [
            "Doldurmak için değere dokunun; yeniden adlandırmak için başlığa dokunun — kuyumcunun ‘Yüzük Ölçüsü’ saatçide ‘Kasa Ölçüsü’dür.",
            "Blok başlıklarını düzenle ile bir iş dalı şablonundan başlayın (kuyumculuk, saat, elektronik, terzilik, ayakkabı ve deri, mobilya, bisiklet, otomotiv, müzik aletleri ya da genel) ve ardından satır ekleyin, adlandırın veya silin.",
            "Satırlara dokunmadığınız sürece, kayıt olurken seçtiğiniz iş dalı hangi şablonla başlayacağınızı belirler."
          ] },
          { kind: "para", text: "İpucu: ürün sağlam görünse bile kabulde fotoğraflayın. Sonradan çıkacak bir çizik tartışmasına karşı en ucuz korumadır." }
        ]
      },
      {
        id: "card-estimate",
        title: "Teklif ve Onay kartı",
        blocks: [
          { kind: "para", text: "Fiyat verin, müşteriye gönderin ve neye onay verdiğinin kanıtını saklayın. Teklif siparişin fatura kalemlerinden oluşur ve her revizyon korunur — onaylanmış bir teklif, üzerinde anlaşılanın kanıtıdır; bu yüzden asla düzenlenmez veya silinmez." },
          { kind: "sub", text: "Neler görünür" },
          { kind: "bullets", items: [
            "Kendi numarasıyla güncel teklif (örneğin EST-2026-0001), durumu ve kalemleriyle ara toplam, KDV ve toplam.",
            "Müşteri karar verdiğinde Onay Ayrıntıları: kim, ne zaman, nasıl onayladı ve imzası.",
            "Her eski revizyonu numarası ve tutarıyla listeleyen Teklif Geçmişi.",
            "Kartı görebilen herkesin kullanabileceği bir Teklif PDF'i düğmesi."
          ] },
          { kind: "sub", text: "Nasıl çalışır" },
          { kind: "steps", items: [
            "Fatura kalemlerinizi ekleyin, sonra Teklif oluştur'a dokunun. Numara, toplamlar ve durum NivaDesk tarafından belirlenir, cihaz tarafından değil.",
            "Müşteriye gönder'e dokunun. Size özel bir bağlantı verilir; müşterinizle normalde nasıl konuşuyorsanız öyle iletirsiniz.",
            "Müşteri bağlantıyı giriş yapmadan açar, rakamları görür ve onaylar ya da reddeder. Onaylarken adını ve imzasını ister.",
            "Kart kararla güncellenir ve imza teklif PDF'inde görünür."
          ] },
          { kind: "sub", text: "Revizyonlar" },
          { kind: "bullets", items: [
            "Yeni teklif oluştur yeni bir revizyon yapar. Öncekinin üzeri çizilir ama kendi numarasını ve rakamlarını korur.",
            "Yeni teklif yapmak önceki bağlantıyı kapatır; böylece eski bir fiyat yanlışlıkla onaylanamaz.",
            "Onay kanıtı hiçbir cihazın erişemeyeceği yerde saklanır — okunabilir, değiştirilemez."
          ] }
        ]
      },
      {
        id: "card-customer-portal",
        title: "Müşteri Portalı kartı",
        blocks: [
          { kind: "para", text: "Her onarım atölyesinin gün boyu cevapladığı soru şudur: ‘benimki hazır mı?’. Bu kart o sorunun cevabı: sipariş başına tek bir bağlantı, müşteri giriş yapmadan açar ve ürününün nerede olduğunu görür." },
          { kind: "sub", text: "Müşteri ne görür" },
          { kind: "bullets", items: [
            "Onarım durumu bir ilerleme çizgisi olarak. Aşamalar sizin kendi iş adımlarınızdır; kuyumcu da terzi de mobilya restoratörü de kendi akışını görür.",
            "Teklif ve onay, ödeme ve kalan tutar, fotoğraflar ve tahmini teslim tarihi.",
            "Üstte sizin işletme adınız ve logonuz — NivaDesk'in değil."
          ] },
          { kind: "sub", text: "Müşteri asla ne görmez" },
          { kind: "para", text: "İç notlar, maliyet fiyatları, tedarikçi adları, kâr ve ekip mesajları. Bunlar sayfaya giderken siparişten süzülmüyor — sayfa yalnızca sizin açtığınız bölümlerden kuruluyor, dolayısıyla başka bir şeyin sızması mümkün değil." },
          { kind: "sub", text: "Neleri değiştirebilirsiniz" },
          { kind: "bullets", items: [
            "Beş bölümün her birini sipariş bazında açıp kapatın; sayfa buna anında uyar.",
            "Portal bağlantısı oluştur ile bağlantıyı üretin, Bağlantıyı kopyala ile sonradan tekrar gönderin, Kapat ile açılmasını durdurun.",
            "Yeni bağlantı üretmek eskisini geçersiz kılar — yanlış kişiye giden bir bağlantıyı böyle geri alırsınız."
          ] },
          { kind: "sub", text: "Otomatik bildirimler" },
          { kind: "bullets", items: [
            "Bildirimler açıkken siparişi yeni bir duruma taşımanız müşteriye kendiliğinden haber verir: teklifi hazır, işe başlandı ya da ürünü teslime hazır.",
            "E-posta varsayılan olarak açık. SMS varsayılan olarak kapalı ve her işletme kendisi için açar.",
            "Mesaj sizin işletme adınızla gider ve yanıtlar size döner."
          ] },
          { kind: "para", text: "İpucu: bağlantıyı iş bitince değil, ürün geldiğinde gönderin. Kaçınmaya çalıştığınız telefonların çoğu aradaki süreçte gelir." }
        ]
      },
      {
        id: "card-summary",
        title: "Order Summary kartı",
        blocks: [
          { kind: "para", text: "Order Summary (Sipariş Özeti) kartı, bir bakışta durum panelinizdir: en sık kontrol ettiğiniz temel rakamlar, aşamalar ve tarihler tek yerde." },
          { kind: "sub", text: "Neler gösterir" },
          { kind: "bullets", items: [
            "Order Value (Sipariş Değeri): siparişin toplam değeri. Rolünüz finansı göremiyorsa bunun yerine ‘Hidden’ (Gizli) yazar.",
            "İki durum adımı: işin en önemli iki aşaması (örneğin tasarım ve üretim); her biri mevcut durumu yansıtan renkli bir rozetle.",
            "Placed On: siparişin başlatıldığı tarih.",
            "Delivery In: teslim tarihine canlı geri sayım; sipariş yaklaştığında veya geciktiğinde kırmızıya döner."
          ] },
          { kind: "sub", text: "Neleri değiştirebilirsiniz" },
          { kind: "bullets", items: [
            "Başlıkları Düzenle ile burada hangi iki durum adımının görüneceğini seçin ve etiketlerini kendi iş akışınıza göre yeniden adlandırın.",
            "Durum rozetleri ve Delivery In rengi sipariş ilerledikçe otomatik güncellenir; böylece kart her zaman gerçek durumu yansıtır."
          ] }
        ]
      },
      {
        id: "card-customer",
        title: "Customer & Communication kartı",
        blocks: [
          { kind: "para", text: "Bu kart, siparişin kime ait olduğunu ve müşteriye nasıl ulaşacağınızı tutar: müşteri bilgileri ve iletişim kanallarınız; hepsi yerinde düzenlenebilir." },
          { kind: "sub", text: "Neler gösterir" },
          { kind: "bullets", items: [
            "Customer Name (Müşteri Adı) ve Design Name (Tasarım Adı).",
            "Eklediğiniz özel alanlar, örneğin bir referans numarası, Instagram kullanıcı adı veya proje kodu.",
            "Telephone, Email ve Address içeren bir İletişim (Communication) bölümü.",
            "Hızlı iletişim için Instagram, WhatsApp veya TikTok gibi kanal butonları."
          ] },
          { kind: "para", text: "Herhangi bir değere dokunarak yerinde düzenleyin (rolünüz sipariş detaylarını düzenleyebiliyorsa)." },
          { kind: "sub", text: "Neleri değiştirebilirsiniz" },
          { kind: "bullets", items: [
            "Başlıkları Düzenle ile kendi özel alanlarınızı ekleyin, yeniden adlandırın veya kaldırın.",
            "Telephone, Email ve Address'i gösterin veya gizleyin.",
            "Kanal butonları ekleyin, yeniden adlandırın veya kaldırın. Telephone ve Email kendi alanları olarak kalır ve ayrıca gösterilip gizlenebilir."
          ] }
        ]
      },
      {
        id: "card-materials",
        title: "Materials & Inventory kartı",
        blocks: [
          { kind: "para", text: "Bir işin ihtiyaç duyduğu parça ve malzemeleri takip edin, her birinin tedarik edildi mi, geldi mi, hazır mı, böylece işe eksikle başlamazsınız." },
          { kind: "sub", text: "Neler gösterir" },
          { kind: "bullets", items: [
            "Malzeme adımlarının evet/hayır kontrol listesi. Varsayılan etiketler çalışma alanınızın Inventory Labels (Envanter Etiketleri) ayarından gelir; örneğin ‘Dial Sourced’, ‘Dial Received’ veya ‘Materials Ready’.",
            "Bu siparişte takip etmek istediğiniz başka her şey için isteğe bağlı ekstra evet/hayır geçişleri.",
            "Tedarikçi bilgisi veya kısa bir not için Notes / Supplier alanı."
          ] },
          { kind: "para", text: "Malzemeler geldikçe bir satıra dokunarak evet/hayır arasında değiştirin." },
          { kind: "sub", text: "Neleri değiştirebilirsiniz" },
          { kind: "bullets", items: [
            "Başlıkları Düzenle ile kontrol listesi öğelerini ve ekstra geçişleri ekleyin, yeniden adlandırın veya kaldırın.",
            "Notes / Supplier alanını gösterin veya gizleyin ve etiketini yeniden adlandırın.",
            "Varsayılan kontrol listesi etiketleri Settings'teki Envanter Etiketleri'ni izler; orada değiştirmek tüm siparişleri günceller."
          ] }
        ]
      },
      {
        id: "card-priority",
        title: "Priority / Risk kartı",
        blocks: [
          { kind: "para", text: "Bir siparişin ne kadar acil olduğunu ve onu bekleten bir şey olup olmadığını işaretleyin; böylece ekip önemli olana odaklanır ve takılan işleri erkenden fark eder." },
          { kind: "sub", text: "Neler gösterir" },
          { kind: "bullets", items: [
            "Priority (Öncelik): Low, Normal, High veya Urgent. High ve Urgent, Siparişler listesinde öne çıkar; kolayca yakalanır.",
            "Risk: None, Waiting, Blocked veya Overdue; şu an ilerleyemeyen bir işi işaretlemek için.",
            "Risk reason (Risk nedeni): Risk, None dışında bir şeye ayarlanınca görünür. Nedenini seçin; örneğin Waiting for customer, Waiting for payment veya Waiting for material."
          ] },
          { kind: "para", text: "Her açılır menüden bir değer seçin, anında kaydedilir. Öncelik ve risk ayrıca akıllı sıralamayı ve Siparişler listesindeki durum rozetlerini besler; işaretlenen işler en üste çıkar." }
        ]
      },
      {
        id: "card-delivery",
        title: "Timeline & Delivery kartı",
        blocks: [
          { kind: "para", text: "Siparişin zaman çizelgesini bir bakışta görün ve teslim tarihini hep ön planda tutun; böylece hiçbir şey geç teslim edilmez." },
          { kind: "sub", text: "Neler gösterir" },
          { kind: "bullets", items: [
            "Created Date (Oluşturulma) ve Delivery Due (Teslim Tarihi); iki net tarih kartı olarak.",
            "Time Remaining (Kalan Süre): teslime kalan gün sayısı; sıkışık veya geçmiş bir son tarih öne çıksın diye renk kodlu.",
            "Add to Calendar: oluşturulma tarihinden teslim tarihine kadar uzanan tüm-gün bir takvim dosyası indirir; böylece sipariş takvim uygulamanızda görünür (NivaDesk Starter'tan itibaren)."
          ] },
          { kind: "sub", text: "Neleri düzenleyebilirsiniz" },
          { kind: "bullets", items: [
            "Delivery Time (gün olarak), Delivery Due tarihi ve Created Date: herhangi birine dokunup değiştirin.",
            "Bir tarihi değiştirir değiştirmez Kalan Süre ve tüm renkler otomatik yeniden hesaplanır."
          ] }
        ]
      },
      {
        id: "card-notes",
        title: "Notes kartı",
        blocks: [
          { kind: "para", text: "Sipariş hakkındaki yazılı notları, talimatlar, kararlar ve hatırlatmalar, tüm çalışma alanının görebileceği tek bir yerde tutun." },
          { kind: "sub", text: "Neler gösterir" },
          { kind: "bullets", items: [
            "Müşterinin profiline bağlı kalan ana Customer Notes (Müşteri Notu).",
            "Altında, bu siparişe özel her şey için bir veya daha fazla Special Notes (Özel Not) bölümü."
          ] },
          { kind: "sub", text: "Neler yapabilirsiniz" },
          { kind: "bullets", items: [
            "Herhangi bir bölüme yazın: otomatik kaydedilir.",
            "+ butonuyla yalnızca bu siparişe özel bir not alanı ekleyin, başlık verin ve gerek kalmayınca kaldırın.",
            "Başlıkları Düzenle ile çalışma alanındaki her siparişte görünen Special Notes bölümlerini ekleyin, yeniden adlandırın veya kaldırın."
          ] }
        ]
      },
      {
        id: "card-clientfiles",
        title: "Client Files kartı",
        blocks: [
          { kind: "para", text: "Bu siparişe ait belge ve görselleri, provalar, tasarımlar, fişler, referans fotoğraflar, ekleyin; böylece işe dair her şey onunla birlikte durur." },
          { kind: "sub", text: "Neler yapabilirsiniz" },
          { kind: "bullets", items: [
            "Upload File: PDF, görsel, PSD veya PSB dosyaları seçin. Dosyaları doğrudan kartın üzerine sürükleyip bırakabilirsiniz.",
            "Önizlemek için bir dosyaya dokunun veya Download all ile hepsini tek seferde indirin.",
            "Rolünüz izin veriyorsa bir dosyayı silin.",
            "Çevrimdışı çalışır: dosyalar cihaza kaydedilir ve bağlantı gelince otomatik yüklenir."
          ] },
          { kind: "sub", text: "Güvenlik" },
          { kind: "bullets", items: [
            "Maksimum dosya boyutu ve upload politikası Settings ▸ Safety & Uploads'tan gelir.",
            "Gerektiğinde, yüklemeden önce bu tarayıcıda upload politikasını kabul etmek için işaretlersiniz."
          ] }
        ]
      },
      {
        id: "card-todo",
        title: "To Do kartı",
        blocks: [
          { kind: "para", text: "Bu siparişe özel bir görev kontrol listesi: işi adımlara bölün, atayın ve neyin yapıldığını takip edin." },
          { kind: "sub", text: "Neler yapabilirsiniz" },
          { kind: "bullets", items: [
            "Giriş alanıyla bir görev ekleyin; sonra ona bitiş tarihi, öncelik, bir sorumlu ve isteğe bağlı bir not verin.",
            "Listeyi All, Mine, Open, Overdue veya Done'a göre filtreleyip şu an önemli olana odaklanın.",
            "Bir görevi Mark Done ile tamamlayın veya Reopen ile yeniden açın; gerekmeyen görevleri silin."
          ] },
          { kind: "sub", text: "Bilmekte fayda var" },
          { kind: "bullets", items: [
            "Overdue filtresi bitiş tarihini geçen görevleri öne çıkarır; böylece hiçbir şey kaçmaz.",
            "Rolünüz salt-görüntülemeyse görevleri görebilir ama düzenleyemezsiniz."
          ] }
        ]
      },
      {
        id: "card-worktime",
        title: "Work Time kartı",
        blocks: [
          { kind: "para", text: "Bir siparişe ne kadar zaman harcadığınızı takip edin; böylece iş başına gerçek emeği görür ve gelecekteki işleri daha doğru fiyatlandırırsınız." },
          { kind: "sub", text: "Neler yapabilirsiniz" },
          { kind: "bullets", items: [
            "Çalışmaya bir başlık verip zamanlı bir oturum başlatın: sayarken kartta ‘Running now’ görünür.",
            "Ara verdiğinizde oturumu Stop ile durdurun, sonra Continue ile aynı işe eklemeye devam edin.",
            "Sipariş için Total Work Time toplamını ve her oturumun listesini görün.",
            "Gerekmeyen bir oturumu silin."
          ] }
        ]
      },
      {
        id: "card-financial",
        title: "Financial Info kartı",
        blocks: [
          { kind: "para", text: "Siparişin tam para tablosu: ne tahsil edildi, size maliyeti ne, vergi ne kadar ve geriye kalan gerçek kâr." },
          { kind: "sub", text: "Neler gösterir" },
          { kind: "bullets", items: [
            "Order Value, Paid / Received ve kalan Remaining bakiyesi, ayrıca ödeme yöntemi.",
            "Maliyetleriniz: Base Cost, Platform Fee ve Shipping Cost.",
            "Vergi: Settings'te belirlediğiniz vergi kurallarına göre VAT Rule, VAT Rate ve VAT Amount.",
            "Kâr: Kurumlar Vergisi öncesi kâr (Profit before Corporation Tax), Kurumlar Vergisi sonrası Net Profit ve Final Profit."
          ] },
          { kind: "sub", text: "Neleri değiştirebilirsiniz" },
          { kind: "bullets", items: [
            "Başlıkları Düzenle ile Spending / Cost başlıklarını maliyetleri izleme şeklinize göre özelleştirin.",
            "Vergi oranı, kuralı ve geçiş tarihi Settings ▸ Financial'dan gelir ve tüm siparişlerinize uygulanır."
          ] },
          { kind: "para", text: "Bu kart yalnızca finansı görmeye izinli rollerde görünür; diğer herkes için siparişin parası gizli kalır." },
          { kind: "sub", text: "Ödeme bağlantıları (Stripe): müşteriden online ödeme ya da kapora istemek" },
          { kind: "bullets", items: [
            "Stripe bağlandıktan sonra bu karttaki Ödeme bağlantıları, Kalan tutar ve Henüz istenmedi'yi gösterir. + Yeni ödeme bağlantısı Kapora, Taksit ya da Kalan tutar için bir bağlantı oluşturur; Bağlantıyı kopyala ve müşterinize gönderin. Bkz. Ayarlar › Stripe ile kartla ödeme ve ödeme bağlantıları."
          ] }
        ]
      },
      {
        id: "card-status",
        title: "Production Status kartı",
        blocks: [
          { kind: "para", text: "Siparişin üretimde nerede olduğunu takip edin: iş akışınızın her aşaması kendi durumuyla; böylece herkes ilerlemeyi bir bakışta görür." },
          { kind: "sub", text: "Neler gösterir" },
          { kind: "bullets", items: [
            "İş akışındaki her adım için bir satır (örneğin Tasarım, Üretim veya Sonlandırma); her biri Not Yet, In Progress, Done veya Cancelled gibi bir duruma ayarlı.",
            "Kullanılabilir durum seçenekleri çalışma alanınızdan gelir ve Settings'ten özelleştirilebilir."
          ] },
          { kind: "sub", text: "Neleri değiştirebilirsiniz" },
          { kind: "bullets", items: [
            "Başlıkları Düzenle ile durum adımlarını mesleğinizin iş akışına uyacak şekilde ekleyin, yeniden adlandırın veya kaldırın.",
            "Buradan bir adımı değiştirmek, Siparişler listesindeki renkli durum rozetlerini ve Order Summary kartını günceller."
          ] }
        ]
      },
      {
        id: "card-shipping",
        title: "Shipping & Tracking kartı",
        blocks: [
          { kind: "para", text: "Siparişin teslimatını yönetin: kurye, takip numarası ve canlı durum güncellemeleri; hepsi uygulamadan çıkmadan." },
          { kind: "sub", text: "Neler yapabilirsiniz" },
          { kind: "bullets", items: [
            "Courier'i ayarlayın (Auto Detect, Royal Mail, DHL, FedEx veya UPS) ve Tracking numarasını girin.",
            "Sipariş ilerledikçe Dispatched ve Delivered olarak işaretleyin.",
            "Refresh live status ile 17TRACK'ten en güncel teslimat ilerlemesini çekin; böylece kargonun nerede olduğunu her zaman bilin."
          ] },
          { kind: "sub", text: "Bilmekte fayda var" },
          { kind: "bullets", items: [
            "Kurye otomatik algılanamazsa elle seçip tekrar yenileyin.",
            "Canlı takip desteği kuryeye bağlıdır; sistem otomatik tekrar dener, ayrıca kuryenin kendi sitesinden de kontrol edebilirsiniz."
          ] },
          { kind: "sub", text: "DHL Express etiketleri" },
          { kind: "bullets", items: [
            "DHL Express bağlıysa bu karttaki + DHL gönderisi hazırla etiketi ve gümrüğün istediği yerde ticari faturayı oluşturur. Bkz. Ayarlar › DHL Express."
          ] }
        ]
      },
      {
        id: "card-schedule",
        title: "Schedule & Alerts kartı",
        blocks: [
          { kind: "para", text: "Bu siparişe bağlı hatırlatıcılar kurun; böylece önemli takipler, onaylar, ödemeler, müşteri güncellemeleri, asla unutulmaz." },
          { kind: "sub", text: "Neler yapabilirsiniz" },
          { kind: "bullets", items: [
            "Bir Quick Reminder kısayolu seçin (örneğin Ask for approval, Send design update veya Check payment) ya da kendi başlığınızı yazın.",
            "Tarih & saat, bir öncelik (Normal, High veya Urgent) ve isteğe bağlı bir not belirleyin. Zamanı gelince bildirim almak için Notify'ı açın.",
            "Upcoming (yaklaşan) ve Recently completed (son tamamlanan) hatırlatıcıları görün; Mark Done yapın veya 1 saat ya da 1 gün Snooze edin."
          ] },
          { kind: "sub", text: "Neleri değiştirebilirsiniz" },
          { kind: "bullets", items: [
            "Başlıkları Düzenle ile Quick Reminder kısayollarını ve varsayılan zamanlamalarını, takip etme şeklinize uyacak biçimde özelleştirin."
          ] }
        ]
      },
      {
        id: "card-history",
        title: "History / Log kartı",
        blocks: [
          { kind: "para", text: "Siparişin otomatik bir değişiklik kaydı, neyin ne zaman değiştiği, böylece mevcut duruma nasıl geldiğini her zaman görebilirsiniz." },
          { kind: "sub", text: "Neler gösterir" },
          { kind: "bullets", items: [
            "Son önemli değişikliklerin listesi, en yeni en üstte.",
            "Her kayıt; neyin değiştiğini, tarih ve saati, ve eski değer → yeni değeri gösterir."
          ] },
          { kind: "sub", text: "Bilmekte fayda var" },
          { kind: "bullets", items: [
            "Kayıt salt-okunurdur; insanlar siparişi düzenledikçe otomatik dolar.",
            "History kartları NivaDesk Starter'tan itibaren kullanılabilir."
          ] }
        ]
      }
    ]
  },
  {
    id: "sales",
    title: "Satışlar (Sales)",
    blocks: [
      { kind: "para", text: "Sales, sattığınız her şeyi hâlihazırdaki siparişlerinizden derleyerek gösterir. Siparişler bu ekrandan değiştirilmez: burada hiçbir sipariş, ürün, stok ya da ödeme oluşturulmaz veya düzenlenmez. Sahip ya da bir yönetici markaları ve mağaza adlarını burada yönetebilir; bu, satışların nasıl gruplandığını değiştirir, siparişlerin kendisini asla değiştirmez. Menüde yalnızca çalışma alanınızda açıksa ve hesabınız siparişleri kapsıyorsa görünür." },
      { kind: "sub", text: "Sales sekmesi" },
      { kind: "bullets", items: [
        "Her sipariş için bir satır, en yeniden eskiye; müşteri, satılan şey, geldiği kanal, ödeme ve teslimat durumu ve gelir.",
        "Bir satırı açmak aynı siparişi Siparişler'de açar — kopyası değil, aynısıdır.",
        "Filtreler: tek kanal veya tüm kanallar, tek mağaza, tek marka (ya da markasız), yalnız ilgi bekleyenler, ve özel işlerin dahil edilip edilmeyeceği. Daha fazla göster, aynı filtrelerin sonraki sayfasını sunucudan getirir; bir filtreyi değiştirmek listeyi baştan başlatır.",
        "Gelir yalnızca hesabınız finansal bilgileri kapsıyorsa görünür; kapsamıyorsa sütunda çizgi olur ve satırın geri kalanı değişmez. Sipariş kartı, Pano ve dışa aktarımın gösterdiği gelirin aynısıdır; liste okunurken siparişten hesaplanır. Hesaplanamazsa satır sayı yerine \"Hesaplanmadı\" der.",
        "Hesabınız yalnız size atanan işlerle sınırlıysa Sales, Siparişler'in gösterdiği siparişlerin aynısını gösterir ve bunu listenin üstünde yazar.",
        "Alıcı bilgisini kendinde tutan bir pazaryeri — eBay veya Amazon gibi — isim yerine \"Pazaryeri tarafından saklanıyor\" gösterir.",
        "Kullanılabilir tarihi olmayan sipariş, tarih uydurmak yerine \"Tarih bilinmiyor\" der."
      ] },
      { kind: "sub", text: "Ürünler (Products)" },
      { kind: "para", text: "Products, çalışma alanınızın ürün kataloğunu listeler. Çalışma alanınızda ürün olana kadar bunu açıkça söyler — satışlarınız yine aldığınız siparişlerden listelenir." },
      { kind: "sub", text: "Kanallar (Channels)" },
      { kind: "bullets", items: [
        "Her satış kanalı için bir satır; bu çalışma alanına bağlı olup olmadığını söyler. Bağlama ve kaldırma Ayarlar → Entegrasyonlar'da yapılır.",
        "Bağlı, kanalın bağlandığı anlamına gelir; oradan sipariş geldiği anlamına gelmez. Bugün bağlı bir kanal siparişlerini getirir; ürünler ve stok adetleri bir kanaldan kendiliğinden aktarılmaz ve NivaDesk kanaldaki bir ilanı, fiyatı ya da stok adedini değiştirmez. Stokunuz Envanter'de (Inventory) tutulur.",
        "Mağazalar: bağlı her mağaza hesabı durumu ve son eşitlemesiyle ayrı listelenir; aynı platformdaki iki mağaza asla karışmaz. Sahip ya da bir yönetici bir mağazaya kendi adını verebilir.",
        "Markalar isteğe bağlıdır: sahip ya da bir yönetici marka oluşturabilir, düzenleyebilir, silebilir ve onu sattığı mağazalara bağlayabilir. Bir markayı silmek hiçbir siparişi değiştirmez; o siparişler yeniden mağazalarıyla görünür.",
        "Amazon listelenmez: bağlantısı bu projenin dışında tutulur, bu yüzden ekran tahmin etmeden kontrol edemez."
      ] }
    ]
  },
  {
    id: "schedule",
    title: "Planlama (Schedule)",
    blocks: [
      { kind: "para", text: "Siparişlerinizin teslim tarihine göre takvim görünümü; haftanızı planlayın ve yaklaşanları görün." },
      { kind: "bullets", items: [
        "Previous ve Next ile tarih aralıkları arasında gezin, duruma göre filtreleyin.",
        "Doğrudan takvimden yeni bir planlı proje oluşturun.",
        "Bir sipariş için tüm-gün takvim dosyası indirip kendi takvim uygulamanıza ekleyin (NivaDesk Starter'tan itibaren).",
        "Aralıktaki herhangi bir siparişi açıp üzerinde çalışın."
      ] }
    ]
  },
  {
    id: "calendar",
    title: "Takvim",
    blocks: [
      { kind: "para", text: "Tüm atölye için tek takvim: toplantılar, hatırlatıcılı görevler ve gecikmiş görevlerin listesi, günlük notlar, çalışma günleri ve izin günleri; her biri yalnız size özel kalabilir, seçtiğiniz kişilerle ya da tüm çalışma alanıyla paylaşılabilir. Teslim tarihi olan siparişler ve not hatırlatmaları da takvimde görünür; kendi Google Takvim ya da Outlook toplantılarınız da işinizin yanında durabilir." },
      { kind: "para", text: "Takvim web uygulamasındadır; Mac, iPhone, iPad ve Android uygulamalarında henüz yoktur. Planlama ekranı (Schedule) olduğu gibi kalır: siparişlerinizin teslim tarihine göre dizilişi." },
      { kind: "sub", text: "Takvimi açmak ve içinde gezinmek (Gün, Hafta, Ay, Ajanda)" },
      { kind: "bullets", items: [
        "Takvim, web uygulamasının kenar çubuğunda Banka ile Planlama arasındadır. Her plandaki her üyede vardır.",
        "Bugün sizi bugüne döndürür, ‹ ve › okları bir dönem ileri ya da geri gider, Tarihe git ise istediğiniz günü açar.",
        "Gün, Hafta, Ay ve Ajanda görünümü değiştirir. Varsayılan Ay'dır (dar ekranda Ajanda) ve son seçiminiz o tarayıcıda hatırlanır.",
        "Kayıtlarda ara bir kaydı içindeki kelimelerle bulur; Şu tarihten ara ve Şu tarihe kadar alanlarını değiştirmezseniz bugünün 180 gün öncesine ve sonrasına bakar."
      ] },
      { kind: "sub", text: "Takvime kayıt eklemek: toplantı, görev, günlük not, çalışma günü, izin günü" },
      { kind: "bullets", items: [
        "＋ Yeni kayıt formu açar. Ay görünümünde bir güne tıklayın, Hafta görünümünde günün ＋ düğmesini kullanın, Gün görünümünde ise bir saate tıklayarak o saatte başlayan bir toplantı açın.",
        "Gün görünümünde hızlı düğmeler de vardır: ＋ Toplantı, ＋ Görev, ＋ Günlük not ve ＋ Çalışma günü.",
        "Türü seçin (Toplantı, Görev, Günlük not, Çalışma günü ya da izin günleri için Kullanılamıyor), sonra Başlık (günlük notta Not metni), Tarih ve Tüm gün ya da Başlangıç ile Bitiş. Kaydet kaydı saklar.",
        "Diğer seçenekler şunları ekler: Açıklama, Atandı (görevde) ya da Kimin için, Bağlı sipariş, Tekrar (Her gün ya da seçtiğiniz günlerde Her hafta şu günlerde, Tekrar bitişi ile) ve toplantıda Konum ile Toplantı bağlantısı.",
        "Bir kayıt en çok 62 gün sürebilir ve en çok 500 kez tekrarlanabilir."
      ] },
      { kind: "sub", text: "Bir kaydı kim görür: yalnızca ben, seçtiğim kişiler, tüm çalışma alanı (paylaşma)" },
      { kind: "bullets", items: [
        "Kim görebilir: Yalnızca ben (🔒), Seçtiğim kişiler (🔗) ya da tüm çalışma alanı için Çalışma alanı (🏢). Aynı işaret takvimdeki kaydın üstünde de görünür.",
        "Seçtiğim kişiler'de her kişiyi Görüntüleyebilir ya da Düzenleyebilir yapın. Çalışma alanı'nda Herkes görüntüleyebilir ya da Herkes düzenleyebilir'i seçin.",
        "Çalışma alanı seçeneğini sahip, yönetici (admin) ya da üye seçebilir. Sadece Görüntüleme üyelerine bir kayıt gösterilebilir ama Düzenleyebilir yetkisi verilemez.",
        "Bir kaydı yalnız onu oluşturan kişi silebilir ya da kimin göreceğini değiştirebilir."
      ] },
      { kind: "sub", text: "Görevler, hatırlatıcılar, gecikmiş görevler ve tekrarlayan kayıtlar" },
      { kind: "bullets", items: [
        "Ayrıntısını açmak için bir kayda tıklayın. Görevde Tamamlandı işaretle, Yeniden Aç ve Görevi iptal et vardır; görevin atandığı kişi de durumunu değiştirebilir.",
        "Hatırlatıcı: Kapalı, Tam zamanında, 15 dakika önce, 1 saat önce ya da 1 gün önce (tüm gün süren kayıtlarda ayrıca Hatırlatma saati). Hatırlatmalar NivaDesk'in içinde, bildirim zilinde Takvim hatırlatmaları altında görünür; e-posta, SMS ya da telefon bildirimi olarak gönderilmez.",
        "Gecikmiş görevler: bugünde Gün görünümünü açın. Son 14 günde planlanıp henüz bitmemiş açık görevler Gecikmiş başlığı altında listelenir; her birinde ne zamandan beri geciktiği yazar (… tarihinden beri gecikmiş).",
        "Tekrarlayan bir kaydı düzenlemek ya da silmek Yalnız bu mu, Bu ve sonrakiler mi diye sorar.",
        "Düzenle ve Sil ayrıntının en altındadır. Silme geri alınamaz."
      ] },
      { kind: "sub", text: "Takvimde sipariş teslim tarihleri, not hatırlatmaları ve filtreler" },
      { kind: "bullets", items: [
        "Teslim tarihi olan bir sipariş, Siparişler'i görebilen kişilere Sipariş teslim zamanı (📦) olarak görünür; Siparişi aç sizi siparişe götürür. Tarih siparişten gelir; değiştirmek için siparişte değiştirin.",
        "Bir not hatırlatması, Notlar'ı görebilen kişilere Not hatırlatması (🔔) olarak, Notes'ta aç ile birlikte görünür.",
        "Filtreler takvimi daraltır: Benim kayıtlarım, Benimle paylaşılanlar, Ekibin kayıtları, Kimin için, Tür, Durum ve Bağlı sipariş. Filtreler bu cihazda hatırlanır, bir kaydı kimin görebileceğini asla değiştirmez; Filtreleri sıfırla hepsini temizler."
      ] },
      { kind: "sub", text: "Google Takvim ya da Outlook takvimini bağlamak (diğer takvimleriniz)" },
      { kind: "steps", items: [
        "🌐 Diğer takvimleriniz'e, sonra Google Takvim bağla ya da Outlook bağla'ya basın.",
        "Google'ın ya da Microsoft'un sayfasında onaylayın; Takvim'e Takvim bağlandı mesajıyla dönersiniz.",
        "Gösterilecek takvimler, takvimlerinizden hangilerinin görüneceğini seçer; Kaydet'e basın. Şimdi senkronla hemen çeker (en çok dakikada bir); takvim ayrıca yaklaşık her 30 dakikada bir kendiliğinden senkronlanır.",
        "Bağlantıyı kes… ve ardından Bağlantıyı kes bağlantıyı kaldırır. Google ya da Outlook takviminizin kendisi değişmez. Bağlantının süresi dolduysa Yeniden bağla görünür."
      ] },
      { kind: "bullets", items: [
        "Salt okunurdur ve tek yönlüdür: NivaDesk Google'a ya da Outlook'a asla yazmaz; oradaki toplantılar asla NivaDesk kaydına, görevine ya da siparişine dönüşmez.",
        "Google ya da Outlook toplantılarınızı yalnız siz görürsünüz — ekibiniz de, sahip de görmez. 30 gün öncesinden 180 gün sonrasına kadar gelirler; bağlantısı olan bir toplantıda Toplantıya katıl ile Google Takvim'de aç ya da Outlook'ta aç bulunur.",
        "🌐 Diğer takvimleriniz düğmesi ancak bu bağlantı hesabınız için açıldığında görünür; kademeli olarak açılıyor. Görmüyorsanız sizin için henüz açılmamıştır.",
        "İş ya da okul Outlook hesabında BT yöneticinizin önce NivaDesk'i onaylaması gerekebilir."
      ] },
      { kind: "sub", text: "Bağlantı yokken kayıt eklemek (çevrimdışı)" },
      { kind: "bullets", items: [
        "Çevrimdışıyken bir şerit, değişikliklerin bağlantı geri gelene kadar bu cihazda kaldığını söyler; yanında Onay bekleyen ve bir sayı görünür. Form Henüz onaylanmadı der ve formu kapatabilirsiniz.",
        "Bağlantı geri gelince Bağlantı geri gelince kaydedildi diye haber verilir. NivaDesk'in reddettiği bir kayıt takvimin üstünde Açık ve Vazgeç düğmeleriyle listelenir."
      ] }
    ]
  },
  {
    id: "notes",
    title: "Notes (Notlar)",
    blocks: [
      { kind: "para", text: "Çalışma alanınız için tam bir not panosu: fikirleri, listeleri ve hatırlatmaları yakalayın, ekibinizle paylaşın ve önemlileri en üste sabitleyin." },
      { kind: "sub", text: "Oluştur & biçimlendir" },
      { kind: "bullets", items: [
        "New Note: başlık ve metin verin, gerekiyorsa bir görsel ekleyin.",
        "Bir notu yeniden kullanmak için çoğaltın (Duplicate) veya kopyalayın.",
        "Her şeyi hızla bulmak için notlarda arayın ve ızgara (grid) görünümüne geçin."
      ] },
      { kind: "sub", text: "Düzenle" },
      { kind: "bullets", items: [
        "Bir notu panonun en üstünde tutmak için sabitleyin (Pin); aciliyeti geçince Unpin yapın.",
        "İlgili notları görsel olarak gruplamak için bir nota renk verin.",
        "Etiket ekleyin ve panoyu etikete göre filtreleyin."
      ] },
      { kind: "sub", text: "Ekibinizle paylaşın" },
      { kind: "bullets", items: [
        "E-posta ile ortak çalışanlar (collaborators) ekleyin; not paylaşılır ve birlikte üzerinde çalışılır.",
        "Erişimi olan herkes en güncel sürümü görür; böylece ekip aynı sayfada kalır."
      ] },
      { kind: "sub", text: "Hatırlatıcılar" },
      { kind: "bullets", items: [
        "Bir nota hatırlatıcı kurun (Tomorrow, Next week veya özel bir zaman) ve bildirim alın.",
        "Tüm not hatırlatıcılarınızı tek yerde görün ve işi bitince hatırlatıcıyı kaldırın."
      ] },
      { kind: "sub", text: "Proje notları" },
      { kind: "bullets", items: [
        "Notlar bir projeye bağlanabilir ve o siparişin Project Notes bölümünde görünür.",
        "Siparişin kendi notu da orada görünür — ve artık web, Mac, iPhone ve Android'de Notes menüsünden doğrudan düzenlenebilir. Bu, sipariş kartındaki Notes ile AYNI metindir, kopyası değil; birinde yaptığınız değişiklik diğerinde görünür.",
        "Bir proje notunu istediğiniz zaman ana Notes panonuza geri taşıyın (Restore)."
      ] },
      { kind: "sub", text: "Arşiv & Çöp" },
      { kind: "bullets", items: [
        "Bir notu silmeden panodan kaldırmak için arşivleyin (Archive); geri getirmek için Unarchive.",
        "Bir notu Çöp'e taşıyın, sonra geri alın (Restore) veya kalıcı silmek için Delete forever."
      ] },
      { kind: "sub", text: "Telefonunuzun ana ekranında notlar" },
      { kind: "bullets", items: [
        "iPhone, iPad ve Android notlarınızı ana ekrana widget olarak koyabilir; liste hiçbir şey açmadan okunur.",
        "Herhangi bir widget gibi ekleyin — ana ekrana basılı tutun, sonra NivaDesk'i seçin.",
        "Widget'a dokunmak Notes'u o notta açar.",
        "Uygulama simgesine basılı tutmak ayrıca New note sunar; Notes'u yazma alanı açık hâlde açar.",
        "Çıkış yaptığınızda widget temizlenir; notlar, çıkış yaptığınız bir cihazın ekranında asla kalmaz."
      ] }
    ]
  },
  {
    id: "customers",
    title: "Customers (Müşteriler)",
    blocks: [
      { kind: "para", text: "Müşteri rehberiniz: her müşteri, bilgileri ve ona bağlı işlerle birlikte." },
      { kind: "bullets", items: [
        "Müşteri ekleyin, bilgilerini düzenleyin veya gerekmeyeni kaldırın.",
        "Bir müşteriyi açıp bilgilerini, tasarımlarını ve siparişlerini görün.",
        "Müşteri notları müşteriyle kalır ve onun her siparişinde görünür.",
        "Bir müşteriyi hızla bulmak için katlanır listeyi kullanın.",
        "Bir dönemde kaç müşterinin yeni, kaçının dönen olduğu Dashboard'dadır: Financial Breakdown seçili aralık için Yeni müşteriler ve Dönen müşteriler satırlarını gösterir — ilk siparişi aralığa denk gelen müşteri yenidir."
      ] }
    ]
  },
  {
    id: "production",
    title: "Üretim",
    blocks: [
      { kind: "para", text: "Siparişler ile Takvim arasındaki operasyon katmanı. Siparişler müşterinin ne istediğini, Takvim ne zaman hazır olması gerektiğini söyler; Üretim ise her sabah gerçekten sorduğunuz soruyu cevaplar — hangi iş şu anda nerede ve ne durmuş?" },
      { kind: "para", text: "Üretim durumu; sipariş, ödeme ve teslimat durumundan bilinçli olarak ayrıdır. Bir iş ödenmiş, teslim edilmemiş ve hâlâ Kalite Kontrol'de olabilir; bu üçünü ayrı tutmak, atölyenin kendi işini gözden kaçırmasını önler." },
      { kind: "sub", text: "Pano" },
      { kind: "bullets", items: [
        "Sütunlar birer şerittir: başlangıçta Hazır, Üretimde, Bekliyor / Bloke, Kalite Kontrol, Sevke Hazır ve Bitti.",
        "Üstteki beş rakam ilk beş soruyu cevaplar: kaç iş aktif, kaçı bu hafta teslim, kaçı bloke, kaçı riskli ve kaçı çıkmaya hazır.",
        "Her sütun kendi sayısını ve — belirlediyseniz — kapasitesini gösterir: sınırın altında yeşil, sınıra yaklaşınca sarı, aşınca kırmızı. Sınır uyarır, asla engellemez. Her zaman bir iş daha taşıyabilirsiniz.",
        "Kartlar yalnızca üretimin ihtiyacı olanı taşır: sipariş numarası, müşteri, ürün, teslim tarihi, kimde olduğu, öncelik, tamamlanan adımlar ve varsa blokaj. Para siparişte kalır."
      ] },
      { kind: "sub", text: "İş nerede duruyor ve neden" },
      { kind: "bullets", items: [
        "Aşama, siparişte zaten bulunan üretim adımlarından hesaplanır; iki kez yazılmaz — böylece pano ile sipariş bir işin nerede olduğu konusunda asla çelişemez.",
        "Hiç başlanmamış iş Hazır okunur. Tüm adımları biten iş Sevke Hazır okunur. Arası Üretimde'dir; ancak üzerinde çalışılan adımın adı bir sütunla aynıysa ('Kalite kontrol' adlı bir adım) kart kendiliğinden o sütuna gider.",
        "Kartı sürüklemek gerçek bir karardır: aşamayı elle belirler, eski ve yeni değeri siparişin Geçmiş kaydına yazar ve işi üstlenen kişiye haber verir — bütün atölyeye değil. Hemen ardından Geri Al sunulur.",
        "Teslim edilmiş sipariş Bitti'ye kapanır; müşterinin elindeki bir şeyi hâlâ yapıyor olamazsınız."
      ] },
      { kind: "sub", text: "Bloke demek, sebebiyle bloke demek" },
      { kind: "bullets", items: [
        "Kartı bloke şeridine bırakmak her zaman sebebini sorar: müşteri onayı bekleniyor, malzeme yok, tedarikçi gecikmesi, teknik sorun ya da diğer — üstüne kendi cümlenizle bir not.",
        "Sebep kartın üzerinde görünür; böylece duran iş sessizce yaşlanmak yerine bir bakışta fark edilir.",
        "Kartı şeritten çıkarmak blokajı temizler."
      ] },
      { kind: "sub", text: "Üç görünüm" },
      { kind: "bullets", items: [
        "Pano: her işin nerede olduğu. Varsayılan.",
        "Liste: çok sayıda işi süzüp topluca düzenleyin; aşama her satırda bir açılır menüdür.",
        "İş Yükü: kim neyi taşıyor, ne kadarı geç kalmış veya bloke."
      ] },
      { kind: "sub", text: "Panoyu kendinize göre kurun" },
      { kind: "bullets", items: [
        "Üretim ayarları sütunları gerçekte nasıl çalıştığınıza göre yeniden adlandırır — bir kuyumcu Tasarım, Döküm, Mıhlama, Cila, Kalite Kontrol yürütür; bir deri atölyesi keser, diker, kenar yapar ve paketler.",
        "Her sütun bir davranışı korur: hangisi 'başlanmadı' demek, hangisi blokaj sebebi soruyor, hangisi işi kapatıyor. Serbestçe yeniden adlandırın; mekanizma çalışmaya devam eder.",
        "Yeniden adlandırma veya sıralama, o şeritte duran işleri asla ortada bırakmaz — onlar da taşınır."
      ] }
    ]
  },
  {
    id: "inventory",
    title: "Envanter",
    blocks: [
      { kind: "para", text: "NivaDesk içindeki stok odanız: işletmenizin sahip olduğu saatler, kadranlar, parçalar ve sarf malzemeleri — maliyetleri, nerede durdukları ve neye söz verildikleri. Müşterinin kendi malı da tutulup izlenebilir; onun olarak işaretlenir ve asla sizin varlığınız sayılmaz." },
      { kind: "sub", text: "Ürünler" },
      { kind: "bullets", items: [
        "İki tür ürün var: Benzersiz ürün, kendi serisi ve durumu olan tek bir fiziksel nesnedir (bir saat, bir kadran); Adetli ürün, birimiyle sayılan stoktur (vida, deri, lake).",
        "Statüler her ürün için gerçeği söyler: Uygun, Rezerve, Kısmen Rezerve (sayılan malzemenin bir kısmı söz verilmiş, bir kısmı hâlâ boşta), Geliyor, Kullanıldı, Satıldı, Çıkarıldı ve Arşivlendi.",
        "Ürünlere etiket (örn. 'vintage', 'altın'), konum, fotoğraf ve malzemeler için düşük stok eşiği verin; kaydı taratarak bulmak için QR etiketi yazdırın.",
        "Arama ad, marka, referans, seri, SKU ve etiketlerle eşleşir; filtreler kategori, tür, statü, konum ve tedarikçiye göre daraltır."
      ] },
      { kind: "sub", text: "Stok ekleme" },
      { kind: "steps", items: [
        "Ürün Ekle tek ürünü elle oluşturur — önce Benzersiz mi Adetli mi seçin, form uyum sağlar.",
        "Açılış stoğunu içe aktar bütün bir tabloyu yapıştırır: sütunlar otomatik eşlenir, hiçbir şey oluşturulmadan her satır önizlenir ve elinizdeki stokla (SKU veya seriyle) eşleşen satırlar işaretlenir — Atla / Mevcutları güncelle / Yine de oluştur sizin seçiminizdir.",
        "Satın alma kaydı ürünlerini sizin için oluşturur; mal gelene kadar Geliyor statüsünde tutulur."
      ] },
      { kind: "sub", text: "Satın almalar" },
      { kind: "bullets", items: [
        "Yeni Satın Alma ne aldığınızı, kimden ve kaça aldığınızı kaydeder; kargo ve masraflar ürün fiyatlarına dokunmadan kalemlere dağıtılır.",
        "Mal koliyle gelir, siparişle değil: Kalemleri teslim al… kısmi teslimatı işler (10 kolinin 6'sı), satın alma Kısmen teslim alındı gösterir, kalanı sonra Kalanı teslim al bitirir.",
        "Ödeme eşleştir satın almayı onu ödeyen banka hareketine bağlar; stok ve bankacılık tahminle değil gerçekle birleşir.",
        "Stoğu rafa çıkmış bir satın alma artık düzenlenemez ve silinemez."
      ] },
      { kind: "sub", text: "Siparişte stok" },
      { kind: "bullets", items: [
        "Siparişin stok kartındaki Stok rezerve et parçayı o işe ayırır ki iki kez söz verilemesin; satır '3 / 10 adet · Kasa A' gibi okunur — var olanın içinden bu siparişin tuttuğu.",
        "İşte kullan rezerve parçayı tüketir: raftan düşer ve hareket defteri siparişi adıyla yazar.",
        "Değiştir… rezerve parçayı tek hamlede başkasıyla takas eder; Bırak geri koyar.",
        "Reçeteler: tekrarlanan işin parça listesini bir kez yazın (Envanter ▸ Reçeteler); siparişte Reçete kullan… tüm satırları birlikte rezerve eder — ya hepsi ya hiçbiri."
      ] },
      { kind: "sub", text: "Kayıplar, sayımlar ve raporlar" },
      { kind: "bullets", items: [
        "Üründe Kayıp Kaydet…, satış ya da iş olmayan bir sebeple çıkan stoğu işler: hasarlı, kayıp, tedarikçiye iade veya fire — sebep deftere yazılır.",
        "Sayım, rafta gerçekte ne olduğunu adım adım saydırır ve kayıtları tam izle düzeltir.",
        "Her değişiklik ürünün Geçmiş'inde bir harekettir; Raporlar zaman içinde değeri, hareket türlerini ve kategori toplamlarını özetler."
      ] },
      { kind: "sub", text: "Kategoriler" },
      { kind: "bullets", items: [
        "Envanter ▸ Kategoriler, atölyenizin gerçekte ne tuttuğunu adlandırdığınız yer — bir kuyumcu Değerli Taşlar ve Klipsler ister, Kadranlar ve Mekanizmalar değil. Yeniden adlandırın, ikonunu değiştirin, sıralayın, gizleyin ve birleştirin.",
        "Tek merkezi ad vardır: burada bir kategoriyi yeniden adlandırmak, onu her üründe, filtrede, formda ve raporda yeniden adlandırır; yeni başlık eskisini kullanan ürünlere taşınır.",
        "Hiçbir ürün ortada kalmaz. İçinde ürün olan bir kategori öylece silinemez — o ürünlerin nereye gideceği sorulur: başka bir kategoriye, Diğer'e, ya da kategoriyi gizleyip ürünleri yerinde bırakın.",
        "Birleştir aynı sorunun sade hâlidir: 'Bilezikler → Kayışlar' ürünleri taşır ve kategori kaybolur.",
        "Bir varsayılan belirleyin ki yeni ürün en çok kullandığınız kategoriden başlasın. Kategorisi başka bir yoldan kaybolmuş ürünler (eski bir içe aktarma gibi) her görünümden sessizce süzülmek yerine ekranın üstünde bildirilir."
      ] },
      { kind: "sub", text: "Konumlar ve tedarikçiler" },
      { kind: "bullets", items: [
        "Konumlar ağaç kurar — kasa çekmeceyi, çekmece tepsiyi barındırır. Birini yeniden adlandırmak veya taşımak, orada duran her üründe adını günceller; içinde stok ya da alt konum olan konum silinemez.",
        "Tedarikçiler iletişim bilgisinin yanında faturanın sorduğu evrak alanlarını tutar: sizin verdiğiniz kod, adres, KDV numarası ve para birimi."
      ] },
      { kind: "sub", text: "Bir ürün için QR etiketi yazdırma" },
      { kind: "bullets", items: [
        "Ürünü Envanter'de açın ve Label (Etiket) düğmesine basın; açılan etiket sayfasında Print label (Etiketi yazdır) vardır. Ürünün durduğu tepsiye, kutuya veya poşete yapıştırın.",
        "Kod yalnızca bir numara değil, bir bağlantıdır: herhangi bir telefon kamerasıyla okutulduğunda o ürünü NivaDesk'te açar; rafın başındaki kişi aramaya gerek kalmadan stok sayısını, konumu ve fotoğrafları görür.",
        "Okutma, çalışma alanında oturum açmış herkes için çalışır; oturum açmamış birinden önce giriş yapması istenir."
      ] },
      { kind: "sub", text: "Sayım: rafta gerçekte ne olduğunu saymak" },
      { kind: "bullets", items: [
        "Envanter ▸ Sayım (Stocktake) altındadır. \"Start a count\" bir sayım açar; her ürünün yanında gerçekte bulduğunuz adedi yazacağınız bir Count kutusu ve NivaDesk'in tuttuğu adet yan yana durur.",
        "Sayımı bitirene kadar hiçbir şey değişmez. Bitirdiğinizde her fark, kimin ne zaman saydığıyla birlikte hareket defterine bir düzeltme olarak yazılır — böylece stok sayısı ile denetim izi asla birbirini tutmazlık edemez.",
        "Rafın bir bölümünü sayabilirsiniz: bir kategoriye veya konuma göre süzüp yalnızca onu sayın.",
        "Defter eski adedi de saklar; yanlış bir sayım tartışılmak yerine izlenip düzeltilebilir."
      ] }
    ]
  },
  {
    id: "banking",
    title: "Banka Harcamaları",
    blocks: [
      { kind: "para", text: "İşletme bankanızı Open Banking ile bağlayın ve harcamayı olurken görün: kategoriler, KDV işlemi, hareketlere eşlenmiş fişler ve tekrarlayan ödemeler. Bir fişin fotoğrafını çekin; NivaDesk onu banka ödemesine ekler ve KDV'sini okur. NivaDesk hareketlerinizi yalnızca okur — asla para taşıyamaz. Banka Harcamaları Pro ve Team planlarının parçasıdır. Sahibe aittir: sahibin Banka Harcamaları iznini verdiği bir üye bakabilir ama hiçbir şeyi değiştiremez." },
      { kind: "para", text: "Bankanın yanında PayPal: PayPal hesabınızı Entegrasyonlar'dan, kendi PayPal uygulamanızın Client ID ve Secret'ıyla bağlayın (uygulamayı PayPal Developer panelinde Live altında oluşturup Transaction Search'ü açın). NivaDesk kimlik bilgilerini doğrular, secret'ı şifreli saklar ve son altı ayı içe alır; sonrasında PayPal her banka yenilemesinde okunur. Alınan ve gönderilen ödemeler, ücretler ve iadeler satır olarak gelir, ücret brütün yanında gösterilir; kategoriler, KDV, fişler ve kurallar banka satırındaki gibi çalışır. PayPal'dan bankanıza çekim bir satır değildir: banka ekstresindeki gelen satırla eşleştirilir ve işlemci ödemesi olarak işaretlenir, aynı satışlar asla iki kez sayılmaz." },
      { kind: "para", text: "İadeler ve ters ibrazlar: müşteriye geri dönen para harcama değildir. Giden satırı açıp Müşteri iadesi veya Ters ibraz'ı seçin, siparişi seçin ve Siparişe kaydet'e basın: NivaDesk o siparişe banka satırının kimliğiyle eksi bir ödeme girdisi yazar, ödenen tutarı düşürür ve iade toplamını tutar; satır harcama toplamlarından çıkar. PayPal iadesi geri aldığı ödemeyi adıyla bildirir; o ödeme bir siparişle eşleştirilmişse sipariş siz aramadan önerilir. Siparişten kaldır girdiyi geri alır; iade olarak kaydedilen bir satır ayrıca gider olarak bağlanamaz." },
      { kind: "para", text: "Muhasebe yazılımı: salt okunur bir QuickBooks Online bağlantısı hazırdır — hesap planını, KDV kodlarını, müşterileri ve ürünleri okur, QuickBooks'a hiçbir şey geri yazmaz — ama Intuit'in canlı (production) erişimi ayarlanana kadar gerçek bir QuickBooks şirketi bağlanamaz. Xero (salt okunur) istek üzerine bizimle birlikte kurulur. Pandle henüz kullanılamıyor." },
      { kind: "sub", text: "Banka bağlamak ve Yeniden bağlan uyarısı" },
      { kind: "steps", items: [
        "Kenar çubuğunda Banka'yı açın ve + Banka bağla'ya basın; bankanızı seçin ve erişimi bankanın kendi sayfasında onaylayın. Bir banka bağlandıktan sonra ＋ Hesap ekle ▸ Banka bir başka banka, ＋ Hesap ekle ▸ PayPal ise PayPal ekler.",
        "İşlemler arka planda senkronlanır; Yenile hemen çeker.",
        "Hesap çubuğu bağlantının durumunu gösterir: Bağlandı, Senkron başarısız, Yeniden bağlanmalı, Banka onayı bekleniyor… ya da Bağlantı kesildi — veriler korundu; yanında Son senkron ve Rıza yenileme tarihi (son 14 günde sarıya döner).",
        "Open Banking rızası yaklaşık 90 gün sürer. Banka veri paylaşmayı bırakınca çubuk bunu söyler ve ⟳ Yeniden bağlan bir dakikada yeniler; Genel bakış'taki İlgi bekliyor da onu listeler.",
        "Hesap bağlantısını kes, içe aktarılmış her şeyi korur; bağlantıyı kestikten sonra 🗑 İçe aktarılan verileri sil simgesi onları ayrı bir seçim olarak siler. 🕑 Etkinlik bağlantının kendi günlüğünü gösterir — senkronlar, hatalar, bağlanma ve kesilmeler."
      ] },
      { kind: "sub", text: "Dönem seçimi ve istediğiniz tarih aralığı" },
      { kind: "bullets", items: [
        "Haftalık, Aylık ve Yıllık, yanındaki oklarla tam dönemler arasında gezinir.",
        "Tarih aralığı ise istediğiniz iki tarihi alır — hangi sırayla seçerseniz seçin, ekrandaki her rakam (harcama, gelen, kategoriler, işlem listesi) o aralığa uyar.",
        "Tarih aralığında oklar kalkar, çünkü elle seçtiğiniz bir aralığın öncesi ya da sonrası yoktur; 'vs' karşılaştırması da aralığınızın başladığı günün bir öncesinde biten, aynı sayıda güne karşı yapılır."
      ] },
      { kind: "sub", text: "İşlemler (hareketler), kategoriler ve KDV" },
      { kind: "bullets", items: [
        "Sekmeler Genel bakış, İşlemler, Tekrarlayan, Fişler ve Kurallar'dır (Stripe bağlıysa Ödeme Bağlantıları da). İşlemler Tümü, İlgi bekliyor, Gelen ve Harcama diye süzülür; İşlemlerde ara ve toplu düzenleme için ☑ Seç de vardır.",
        "Her işlem bir kategori alır; kurallar bunu kendiliğinden uygular ('bu kelimeyi hep Yazılım yap') ve her otomatik değişiklik hangi kuralın yaptığını söyler. Kaydet ve kural oluştur bir değişikliği kaydedip onu kural yapar.",
        "İşlemdeki KDV / Vergi kodu: Standart oran (%20), İndirimli oran (%5), Sıfır oranlı (%0), İstisna, KDV kapsamı dışı, KDV fişi yok, Ters KDV, İthalat KDV'si, Karma / bölünmüş KDV ya da KDV yok — NivaDesk'in kendi kodları, hiçbir muhasebe sağlayıcısına bağlı değil.",
        "İlgi bekliyor ve Muhasebe incelemesi grupları (Muhasebeye hazır, Bilgi gerekli, Fiş eksik, KDV kodu eksik) hâlâ bakılması gerekeni gösterir.",
        "Birden çok şeyi kapsayan bir işlem satırlara bölünebilir; satırlar banka tutarına kuruşuna kadar denk gelmek zorundadır."
      ] },
      { kind: "sub", text: "Fiş tara: fişin ya da makbuzun fotoğrafını çekip banka ödemesiyle eşleştirmek" },
      { kind: "steps", items: [
        "Banka'nın üstündeki 📷 Fiş tara'ya basın (sahip, bir banka bağlandıktan sonra) ya da Ana Sayfa ▸ Hızlı işlemler ▸ Fiş tara. Fotoğraf çekin ya da bir fotoğraf veya PDF seçin.",
        "NivaDesk tutarı, tarihi ve KDV'yi okur ve banka ödemesini arar: eminse ✅ Fiş eklendi der; onaylamanız gerekiyorsa Olası ödeme bulundu ile Bu ödemeye ekle'yi gösterir.",
        "Ödeme bankaya henüz düşmediyse — kart ödemeleri çoğu kez 1–3 gün sonra düşer — ⏳ Kaydedildi — banka hareketi bekleniyor der ve ödeme gelince fiş kendiliğinden eklenir.",
        "📷 Başka fiş tara sıradakini yapar; Bitti kapatır. Bir işlemin içinde Yeni yükle o işleme fotoğraf ya da PDF ekler, Dosyalar'dan seç ise kütüphanenizdeki bir faturayı kullanır — hiçbir şey iki kez saklanmaz."
      ] },
      { kind: "sub", text: "Bankayı bekleyen fişler ve makbuzlar" },
      { kind: "bullets", items: [
        "Fişler ▸ Bankayı bekleyenler (N) hâlâ bekleyen her fişi, nereden geldiğini (Web, ChatGPT, Claude, iPhone, Android ya da Mac) ve kaç gündür beklediğini listeler. Bekleyen fiş varsa Genel bakış'ta ⏳ N fiş bankayı bekliyor → görünür.",
        "⟳ Şimdi eşleştir eşleştirmeyi yeniden dener. Her fişte Görüntüle, Bir işleme ata (elle eklemek için) ve Kaldır vardır.",
        "14 gün sonra fiş kırmızıya döner: Hâlâ ödeme yok — tutarı kontrol et ya da elle ata. Zaten eşleşmiş olabilir, O fişi görüntüle ile birlikte gelir.",
        "Başka para birimindeki bir fiş kendi tutarını korur (örneğin USD 838.80). Bir işleme ata listesinde, banka metni o tutarı anan banka ödemesi bununla işaretlenir; kartla ödenmiş yabancı bir tedarikçi faturası böyle bulunur."
      ] },
      { kind: "sub", text: "Fişten okunan KDV" },
      { kind: "bullets", items: [
        "Fiş eklenince işlemin KDV / Vergi kodu 🧾 Fişten okundu ile KDV tutarını gösterir (karma fişte her oran için bir satır); kodu NivaDesk sizin için koyduysa ⚡ Otomatik uygulandı yazar.",
        "Birden çok KDV oranı olan bir fiş ⑃ KDV oranına göre böl (fişten) önerir; bu, bölmeyi önceden doldurulmuş olarak açar.",
        "Yabancı bir tedarikçinin belgesinde NivaDesk tahmin yürütmez: mal için İthalat KDV'si, hizmet için Ters KDV'yi kendiniz seçin."
      ] },
      { kind: "sub", text: "Tekrarlayan ödemeler ve gelen para" },
      { kind: "bullets", items: [
        "Tekrarlayan sekmesi geçmişinizde bulunan ödemeleri listeler — olağan tutar, beklenen gün ve bir güven derecesiyle; fiyat değişikliği ↑ £x → £y olarak görünür. Yaklaşanlar tahmindir ve öyle işaretlenir.",
        "Bir işlemde kendiniz işaretleyin: ↻ Tekrarlayan ▸ Tekrarlayan olarak işaretle… (Haftalık, Aylık ya da Yıllık). Şununla aynı alıcı… aynı alıcıya giden ödemeleri gruplar, Tekrarlayan saymayı bırak bunu geri alır. Sizin işaretledikleriniz Senin işaretlediğin etiketini taşır.",
        "Gelen para, Şununla eşleştir ile Sipariş ödemesi, Fatura, Kapora, Alınan iade, Sahip sermaye katkısı, Kredi, Kendi hesaplar arası transfer, Diğer gelir ya da İşlemci ödemesi olarak işaretlenir. Eşleşen ödemeyi bul ve Bu ödemeyi eşleştir onu bir siparişin ödemesine bağlar — asla çift kayıt olmadan — Bu siparişe yeni ödeme olarak kaydet ise oraya ekler."
      ] }
    ]
  },
  {
    id: "files",
    title: "Files (Dosyalar)",
    blocks: [
      { kind: "para", text: "Çalışma alanının dosya kütüphanesi: her müşteri dosyası, fiş, ürün fotoğrafı ve tedarikçi belgesi tek yerde — hangi siparişten, alımdan ya da banka hareketinden geldiğinden bağımsız. Bir belgeyi hangi siparişe ait olduğunu bilmeden bulabilir, bilmeden de ekleyebilirsiniz." },
      { kind: "bullets", items: [
        "Doğrudan kütüphaneye yükleyin, dosyayı yeniden adlandırın, eskilerini saklayarak yeni sürüm koyun.",
        "Bir dosyayı siparişe, müşteriye, alıma, tedarikçiye, stok kalemine veya banka hareketine bağlayın — bir dosya birkaçına birden bağlanabilir ve yine tek kopya saklanır.",
        "Bağlamak paylaşmak değildir. Bağlı bir dosya, siz siparişle paylaşana kadar iç kalır; müşterinin önüne koyan şey paylaşmaktır.",
        "Sol sütun filtreler: All Files, Recent, Shared with Clients, Internal Only, Unlinked, Trash ve By Connection (Client & Orders, Bank Transactions, Inventory, Purchases, Suppliers).",
        "Arama; dosya adını, müşteriyi ve tasarımı kapsar.",
        "Silme dosyayı önce Trash'e gönderir, oradan geri alınabilir; kalıcı silme ancak çöpü boşaltınca olur.",
        "Yüklemeler Settings ▸ Safety & Uploads'taki maksimum boyut ve upload politikasını izler.",
        "Dosyaları açmak ve indirmek Pro veya Team gerektirir.",
      ] },
      { kind: "sub", text: "Dosya açma ve Make Offline (dosyayı çevrimdışı tutma)" },
      { kind: "bullets", items: [
        "Bir dosyayı açtığınızda tam ekran görünür. iPhone ve iPad'de altındaki düğmeler simgeye döner — Önceki, Sonraki, çevrimdışı, Aç ve İndir — çünkü beş etiket telefona sığmaz.",
        "Make Offline (Mac, iPhone, iPad) dosyanın bir kopyasını cihazda tutar; sinyal yokken de açılır. Aynı düğme sonra Remove offline copy olur ve kopyayı siler. Çevrimdışı tutulan dosya her seferinde indirilmek yerine cihazdan açılır.",
        "Müşteriyle paylaştığınız bir dosya, Settings ▸ Customer Portal Domain'de kendi alan adınız kuruluysa o alan adında açılır — adres çubuğunda sizin alan adınız görünür, NivaDesk adı kalkar, ve dosyanın kendisi sunucularımızdan geçmeden doğrudan depodan yüklenir."
      ] }
    ]
  },
  {
    id: "messages",
    title: "Mesajlar",
    blocks: [
      { kind: "para", text: "Ekibinizle NivaDesk içinde konuşun — işinizin yanında duran direkt mesajlar ve grup sohbetleri — ve açık olduğu yerde müşterilerinizin WhatsApp ve Instagram mesajlarını tek bir gelen kutusundan yanıtlayın. Mesajlar, Team planının parçasıdır." },
      { kind: "sub", text: "Ekip mesajları: direkt mesajlar ve grup sohbetleri" },
      { kind: "bullets", items: [
        "Mesajlar ▸ Ekip: Yeni sohbet bir direkt mesaj ya da grup başlatır. Metin, dosya ve görsel gönderin; arayın, sessize alın, iletin, düzenleyin ya da bir sohbetten ayrılın.",
        "Neye izin verileceğine sahip Ayarlar ▸ Mesaj Ayarları'nda karar verir: Doğrudan mesajlar, Grup konuşmaları ve Dosya ve görsel paylaşımı.",
        "Team planı olmadan sayfa, Mesajlar'ın planınıza dahil olmadığını söyler ve Team planını görüntüle düğmesini gösterir.",
        "Bunun yerine NivaDesk'e destek talebi açmak için Ayarlar ▸ Destek / Talepler'i kullanın."
      ] },
      { kind: "sub", text: "Müşteri mesajları: WhatsApp ve Instagram gelen kutusu" },
      { kind: "bullets", items: [
        "Mesajlar ▸ Müşteriler müşteri gelen kutusudur. Bugün tek bir işletme için çalışır: kendi WhatsApp Business numaranızı ya da Instagram profesyonel hesabınızı bağlamak, Meta'nın onayları tamamlanınca açılır; o zamana dek Ayarlar ▸ Entegrasyonlar'daki bu kutucuklarda Yakında yazar.",
        "Çalıştığı yerde Bu sohbeti bağla bir sohbeti siparişine bağlar; Ata, Etiketler, Tamamlandı olarak işaretle ve Sohbeti sil de vardır. WhatsApp'tan yanıtla yanıtınızı gönderir; Fotoğraf veya PDF ekle bir dosya ekler (Instagram yanıtları yalnızca metindir).",
        "WhatsApp yalnızca müşterinin son mesajından sonraki 24 saat içinde yanıta izin verir ve onaylı şablonlar henüz kurulu değildir; bu yüzden NivaDesk bir sohbet başlatamaz. Mesajlar 90 gün, fotoğraflar ve PDF'ler 30 gün sonra silinir.",
        "Her planda müşteri sayfasında, sohbeti WhatsApp'ın ya da Instagram'ın kendisinde açan 💬 WhatsApp ve ◎ Instagram düğmeleri vardır.",
        "Müşteri mesajlarını kimin göreceği Ayarlar ▸ Ekip Erişimi'nde rol bazında ayarlanır."
      ] }
    ]
  },
  {
    id: "quick-reply",
    title: "AI Replies / Quick Reply",
    blocks: [
      { kind: "para", text: "Saniyeler içinde, kendi üslubunuzda özenli müşteri mesajları hazırlayın." },
      { kind: "bullets", items: [
        "AI ile hızlı bir yanıt üretin, sonra göndermek için panoya kopyalayın.",
        "Yanıt stilinizi, selamlama ve kapanışı (örneğin ‘Hi there,’ ve ‘Kind regards,’), belirleyin; her seferinde yeniden kullanılır.",
        "Kayıtlı ürünlerinize ve fiyatlarınıza atıfta bulunun; yanıtlar doğru ayrıntıları içersin.",
        "Müşterilere bir siparişteki kanal butonlarıyla ulaşın."
      ] },
      { kind: "para", text: "Motoru seçin ve OpenAI API anahtarınızı, şirket bilgi tabanınızı, ürünlerinizi ve kurallarınızı Settings ▸ Quick Reply Settings altından ekleyin." }
    ]
  },
  {
    id: "settings",
    title: "Settings (Ayarlar)",
    blocks: [
      { kind: "para", text: "NivaDesk'i işinize göre özelleştirdiğiniz yer. Soldan bir bölüm seçin veya listenin üstündeki arama kutusuna yazın — \"KDV\", \"logo\" ya da \"şifre\" yazmak doğru bölüme götürür. Bazı ayarlar korumalıdır; yalnızca owner veya adminler değiştirebilir." }
    ],
    children: [
      {
        id: "set-general",
        title: "General (Genel)",
        blocks: [
          { kind: "para", text: "Kişisel ve görünüm ayarlarınız." },
          { kind: "bullets", items: [
            "Görünüm & tema: açık ve koyu mod arasında geçiş.",
            "Dil: tüm uygulama için 12 dilden birini seçin.",
            "Profil: adınız ve hesap bilgileriniz.",
            "Güvenlik: nasıl giriş yaptığınızı ve hesabınızı korumanızı yönetin."
          ] }
        ]
      },
      {
        id: "set-security",
        title: "Profil ve Güvenlik: iki adımlı doğrulama",
        blocks: [
          { kind: "para", text: "İki adımlı doğrulama (2FA), parolanızın yanında telefonunuzdaki bir doğrulama uygulamasından (authenticator) bir kod da ister; böylece çalınan bir parola tek başına hesabınızı açamaz. E-postayla giriş, Google ve Apple ile çalışır ve telefonun kaybolacağı gün için on kurtarma kodu ile gelir." },
          { kind: "sub", text: "İki adımlı doğrulamayı açmak (doğrulama uygulaması, 2FA)" },
          { kind: "steps", items: [
            "[Web] Ayarlar ▸ Profil ve Güvenlik ▸ İki adımlı doğrulama. Ayarlar'da 2fa ya da authenticator diye aramak da onu bulur.",
            "Önce iPhone, iPad, Mac ve Android'deki NivaDesk'i 2.3 ya da sonraki sürüme güncelleyin — eski uygulamalar kodla girişi tamamlayamaz — sonra NivaDesk uygulamalarım güncel kutusunu işaretleyin. E-postanız doğrulanmış olmalıdır (değilse Doğrulama e-postası gönder).",
            "Doğrulama uygulamasını kur'a basın. Siz olduğunuzu onaylamanız istenirse parolanızı girin (ya da Google ile devam et / Apple ile devam et).",
            "QR kodu doğrulama uygulamanızla okutun ya da Kurulum anahtarını yazın; uygulamanın gösterdiği 6 haneli kodu girip Aç'a basın.",
            "Kurtarma kodlarını Kopyala ya da İndir ile saklayın, sonra Kaydettim'e basın. Kodlar yalnızca bir kez gösterilir."
          ] },
          { kind: "bullets", items: [
            "Açmak, kaldırmak, yeni kurtarma kodları ve Her yerden çıkış yap web uygulamasında yapılır. iPhone, iPad, Mac ve Android uygulamaları yalnızca giriş yaparken kodu sorar.",
            "Çalışma alanının sahibi ya da yöneticisi (admin) içindir; her hesapta bir doğrulama uygulaması olur."
          ] },
          { kind: "sub", text: "Kodla giriş yapmak ve kurtarma kodları (telefon kaybolursa)" },
          { kind: "bullets", items: [
            "Parolanızdan (ya da Google veya Apple'dan) sonra İki adımlı doğrulama, doğrulama uygulamanızdaki 6 haneli kodu ister; Doğrula'ya basın.",
            "Telefonunuzu mu kaybettiniz? Kurtarma kodu kullanın: kod iki adımlı doğrulamayı kapatır ve her cihazda oturumu kapatır. Parolanızla yeniden giriş yapın, sonra yeni telefonla yeniden açın.",
            "Yeni kurtarma kodları oluştur (N kaldı) eski kodların yerine on yenisini koyar.",
            "Ne kurtarma kodu ne telefon varsa: hesabınızın e-posta adresinden NivaDesk Destek'e yazın."
          ] },
          { kind: "sub", text: "İki adımlı doğrulamayı kapatmak ve her yerden çıkış yapmak (tüm cihazlarda oturumu kapatma)" },
          { kind: "bullets", items: [
            "Doğrulama uygulamasının yanındaki Kaldır iki adımlı doğrulamayı kapatır; hesabı yeniden yalnızca parolanız korur.",
            "Her yerden çıkış yap (iki adımlı doğrulama açıkken görünür) bu cihaz dahil her cihazda oturumu kapatır. ChatGPT ve Claude bağlantıları kalır; onları Ayarlar ▸ Entegrasyonlar'dan kesin."
          ] }
        ]
      },
      {
        id: "set-workflow",
        title: "Workflow Steps",
        blocks: [
          { kind: "para", text: "Siparişlerin mesleğinize göre nasıl aktığını şekillendirin." },
          { kind: "bullets", items: [
            "İş kolunuz ve iş akışı açıklaması; mesleğinize uyacak şekilde otomatik dolar ve iş kolunu değiştirince değişir.",
            "Her siparişte görünen üretim aşamaları (durum adımları).",
            "Materials kartının kullandığı özel alanlar ve Envanter Etiketleri."
          ] }
        ]
      },
      {
        id: "set-pdf",
        title: "PDF Export Settings",
        blocks: [
          { kind: "para", text: "Fatura ve sipariş PDF'lerinin görünümünü, işletme bilgileri, logo ve alt not, ve dışa aktarıma neyin dahil edileceğini ayarlayın." },
          { kind: "sub", text: "Ön ayarlar" },
          { kind: "bullets", items: [
            "Dört tek dokunuşluk ön ayar, sık kullanılan belgeler için görünür bölümleri ayarlar: Müşteri faturası, İç iş emri, Teklif ve İrsaliye. Ön ayar yalnızca anahtarları değiştirir — sonucu gözden geçirin, önizlemeyi açın, sonra Kaydet'e basın.",
            "Hiçbir ön ayar İç Finansallar'ı açmaz: iç maliyet, kâr ve tedarikçi bilgileri yalnızca o bölümü kendiniz açarsanız yazdırılır; açıkken sayfa sizi uyarır.",
            "Herhangi bir anahtarı elle değiştirirseniz çip satırı Custom gösterir; böylece bir ön ayarda mı yoksa kendi karışımınızda mı olduğunuzu her zaman bilirsiniz."
          ] }
        ]
      },
      {
        id: "set-quickreply",
        title: "Quick Reply Settings",
        blocks: [
          { kind: "para", text: "NivaDesk'in müşterilere yanıtları nasıl hazırlayacağını ve işiniz hakkında neleri bildiğini ayarlayın." },
          { kind: "sub", text: "Yanıtların nasıl üretileceğini seçin" },
          { kind: "bullets", items: [
            "OpenAI Online: kendi OpenAI API anahtarınızla OpenAI'ı kullanır. Anahtarınızı buraya yapıştırın; istediğiniz zaman değiştirin veya silin.",
            "On-Device (Apple): desteklenen Apple Intelligence cihazlarında Apple'ın cihaz üstü yapay zekâsını kullanır; API anahtarı gerekmez.",
            "Offline Template: kayıtlı ürün ve kurallarınızdan, herhangi bir yapay zekâ modeli olmadan yanıt oluşturur."
          ] },
          { kind: "sub", text: "İşinizi ona öğretin" },
          { kind: "bullets", items: [
            "Company Knowledge Base: yapay zekâya verdiğiniz ek bilgiler, kurallar ve SSS; böylece yanıtlar doğru ve markanıza uygun kalır.",
            "Products: fiyatlarıyla birlikte hizmet veya ürünleriniz; teklifler doğru rakamları içersin.",
            "Rules / FAQs: teslim süreleri veya kapora politikası gibi sık yanıtlar.",
            "Reply style: her yanıtta yeniden kullanılan selamlama ve kapanışınız."
          ] },
          { kind: "para", text: "OpenAI anahtarınız size aittir ve çalışma alanınız için güvenli biçimde saklanır; istediğiniz zaman kaldırabilirsiniz." }
        ]
      },
      {
        id: "set-financial",
        title: "Financial Settings",
        blocks: [
          { kind: "para", text: "Her siparişin Financial kartını besleyen para kurallarını ayarlayın." },
          { kind: "bullets", items: [
            "Para birimi ve ondalık ayracı.",
            "Ortalama platform ücreti ve varsayılan vergi oranı.",
            "Vergi kuralı (standart veya margin scheme), KDV geçiş tarihi ve Kurumlar Vergisi.",
            "Bir değişiklikten sonra geçmiş siparişlerin vergisini yeniden hesaplayın."
          ] }
        ]
      },
      {
        id: "set-woocommerce",
        title: "Mağaza ve web sitesi entegrasyonları",
        blocks: [
          { kind: "sub", text: "Bağlı uygulamalar: Integrations ekranı" },
          { kind: "para", text: "NivaDesk'in bağlandığı her şey tek ekranda: Settings → Integrations. Sağlayıcılar kart halinde ve üç başlık altında toplanır — Commerce & orders, Banking & accounting, Payments, files & automation. Her kart şu an ne durumda olduğunu söyler: Connected, Available, Via webhook veya Coming soon. Durum çalışma alanından okunur, yani Connected gerçekten bir şeyin geldiği anlamına gelir. Manage o sağlayıcının kurulum, senkronizasyon, webhook ve güvenlik ayrıntısını açar; platforma yapıştıracağın çalışma alanına özel imzalı delivery URL'i de oradadır. Yeni siparişler sipariş akışına eşlenerek Orders ve Schedule'da görünür." },
          { kind: "para", text: "Shopify, Shopify App Store'daki resmi NivaDesk uygulamasıyla; WooCommerce ise kendi mağazanda tek onayla bağlanır: siparişler, müşteriler, ödeme durumu, kargo ve iadeler kendiliğinden senkron olur; NivaDesk on beş dakikada bir, bir webhook'un kaçırdığı bir şey var mı diye mağazaya bakar." },
          { kind: "para", text: "Square tek girişle bağlanır: NivaDesk, Square hesabına salt okunur erişim alır; Square Point of Sale, Square Online ve Square Invoices satışları ödemeleri ve iadeleriyle birlikte gelir. Hangi konumların içe aktarılacağını ve hangi satışların sipariş olacağını sen seçersin — varsayılan olarak yalnızca kargo, teslim alma veya teslimat içeren satışlar sipariş olur; hızlı bir tezgâh satışı üretim panosunu doldurmadan finansta kalır. Ödemeler ve iadeler ait oldukları siparişin yanına kaydedilir, kendi başlarına asla siparişe dönüşmez; eşleştirilemeyen bir ödeme Eşleşmemiş Square ödemeleri altında görünür." },
          { kind: "para", text: "Ödeme aktarımları ve bankan: Square bankana ödeme yaptığında para, Banking sayfasına NivaDesk'in zaten saydığı satışları kapsayan tek bir gelen satır olarak düşer. NivaDesk o satırı tutar, para birimi ve varış tarihine göre aktarımla eşleştirir, ciro olarak yeniden sayılmasın diye işlemci ödemesi olarak işaretler ve aktarımın brüt, ücret ve net tutarını satırda gösterir. İki satır da aktarım olabiliyorsa Square payouts kartındaki Find bank row ile sahibi birini seçer; Unlink eşleşmeyi geri alır." },
          { kind: "para", text: "Her bağlantının bir Sync health kartı var: siparişler, ürünler, envanter ve finans için son senkronun güncel mi, bayat mı yoksa hiç olmamış mı olduğunu — ya da sağlayıcının o veriyi hiç senkronlayamadığını — son başarılı senkron, son webhook, hâlâ bekleyen yeniden denemeler ve vazgeçilen olaylarla birlikte söyler." },
          { kind: "sub", text: "Sync health" },
          { kind: "bullets", items: [
            "Bağlantının Manage ekranını aç (Settings → Integrations → Shopify ya da Etsy). Sync health kartı en üstte: her veri türü için bir rozet — Fresh, Stale, Never synced ya da Not supported — ve siparişler için son başarılı senkron, son webhook, bekleyen yeniden denemeler ve ölü mektuplar.",
            "Recent activity bağlantının aldığı son olayları sonucuyla listeler: Applied, Skipped, Duplicate, Retrying ya da Dead, varsa nedeniyle.",
            "Dead olay, yeniden denemesi durmuş olaydır — NivaDesk'in anlayamadığı bir gövde ya da Shopify'da artık olmayan bir sipariş. Çalışma alanı sahibi üzerinde Retry'a basabilir; aynı anahtarla yeniden çalışır, yani zaten gelmiş bir sipariş ikinci kez oluşmaz.",
            "Stale, bağlantı aktifken son başarılı sipariş senkronunun altı saatten eski olması demek; mağazanın hâlâ kurulu ve bağlı olduğuna bak, sonra Sync now'a bas ya da on beş dakikalık taramayı bekle."
          ] },
          { kind: "bullets", items: [
            "Shopify: NivaDesk uygulamasını Shopify App Store'dan kur ve içinden Connect'e bas; siparişler, müşteriler, ödeme durumu, kargo ve iadeler kendiliğinden senkron olur, Shopify kartı bağlı mağazaları duraklat/kaldır seçenekleriyle listeler. NivaDesk on beş dakikada bir canlı senkronun kaçırdığı bir şey var mı diye Shopify'a ayrıca sorar — o yoldan yakalanan sipariş mağazanın senkron günlüğünde \"reconcile\" olarak görünür.",
            "WooCommerce: kartını aç, Connect'e bas, mağazanın adresini yaz ve WooCommerce sitende NivaDesk'i onayla. Webhook'ları NivaDesk kendisi kurar, mağazayı on beş dakikada bir kontrol eder ve geri doldurmadan önce Import preview gösterir; aynı alıcının altmış gün içindeki ikinci ödenmiş siparişi açık siparişine ödeme olarak eklenir.",
            "Square: kartını aç, Connect Square'e bas ve Square'de NivaDesk'i onayla; doğrudan geri gönderilirsin. Neler gelsin altında içe aktarılacak konumları işaretle, hangi satışların sipariş olacağını seç (her satış, yalnızca kargo/teslim alma içerenler veya hiçbiri) ve istemediğin Square kaynağının işaretini kaldır. Sync now son 24 saati kontrol eder; Import preview hiçbir şey yazmadan bir geri doldurmanın neler oluşturacağını gösterir.",
            "Eksik sipariş denetimi ve ödeme aktarımları: bağlı her kanalın Manage ekranında Run audit vardır; seçilen günlerdeki platform siparişlerini NivaDesk'tekilerle karşılaştırır ve eksik olanları listeler; Sync now veya Import onları getirir. Square'de Payouts kartı, Square'in bankana aktarım başına gönderdiğini açıklar — brüt satış, iadeler, ücretler ve düzeltmeler — ödemelerden ayrı, banka eşleştirmesine hazır. Sipariş ekranındaki kanal şeridi platformun kendi numarasını, durumunu ve toplamını gösterir; siparişi sağlayıcıda açan tek bir bağlantı sunar.",
            "İnceleme gerekiyor: Sync health kartı, senkronun uygulayabildiği ama doğrulayamadığı siparişleri — katalogda olmayan bir kalem, eksik bir toplam — nedeniyle, Open order bağlantısıyla ve sahip için Resolve düğmesiyle listeler. Çözüldü demek siparişteki bayrağı kaldırır; sonraki temiz bir senkron bayrağı kendiliğinden kaldırır.",
            "Diğer platformlar: Wix, Squarespace, Zapier ve Make'in kendi kartları var ve hepsi aynı generic sipariş webhook'unu açar — özel bir siteyi de aynı yoldan bağlarsın.",
            "Etsy ve eBay bunlardan değil: her birinin kendi bağlantısı var, sonraki bölümlerde anlatılıyor.",
            "Coming soon kartlarında kurulum yoktur, çünkü o entegrasyon henüz yok; ihtiyacın varsa Request an integration bir destek talebi açar."
          ] },
          { kind: "sub", text: "Amazon" },
          { kind: "bullets", items: [
            "Amazon bağlantısı NivaDesk tarafında tamamdır — müşteri verileri ayrı, güçlendirilmiş bir ortamda tutulur — ve Amazon'un uygulamayı incelemesini bekliyor; bu yüzden bir satıcı onu henüz yetkilendiremez. İlan yönetimi sunulmaz."
          ] }
        ]
      },
      {
        id: "set-etsy",
        title: "Etsy",
        blocks: [
          { kind: "para", text: "Etsy bir webhook tarifi değil, kendi başına bir bağlantı. Etsy'ye bir kez giriş yaparsınız; mağazanızın siparişleri NivaDesk'e alıcısı, ürünleri ve kişiselleştirme notlarıyla birlikte gelir — böylece siparişe göre üretim yapan bir mağaza, Etsy sekmesinde yaşamak yerine kendi üretim panosundan çalışabilir." },
          { kind: "para", text: "Arkanızdan hiçbir şey içe aktarılmaz. İlk içe aktarma, sizin onayladığınız bir önizlemedir; NivaDesk'in almayacağı her sipariş sessizce kaybolmak yerine nedenini bir cümleyle söyler." },
          { kind: "sub", text: "Mağazanızı bağlamak" },
          { kind: "bullets", items: [
            "[Web] Settings → Integrations → Etsy → Manage, ardından Connect Etsy. NivaDesk sizi bir yere göndermeden önce neyi okuyacağını sıralar.",
            "Onayı Etsy'nin kendi sayfasında verir, sonra geri dönersiniz. NivaDesk Etsy şifrenizi hiç görmez ve tarayıcınız hiçbir zaman Etsy erişimi taşımaz.",
            "Erişim salt okunurdur: siparişleriniz ve mağaza bilgileriniz (Etsy paylaşıyorsa alıcının e-postası — çoğu zaman paylaşmaz). NivaDesk ilanlarınıza, fiyatlarınıza ya da mağazanızdaki başka bir şeye dokunamaz.",
            "Döndüğünüzde mağaza doğrulanır ve adı ekranda yazar; devam etmeden önce hangi mağazayı bağladığınızı görürsünüz.",
            "Şimdilik bir çalışma alanına bir Etsy mağazası bağlanır."
          ] },
          { kind: "sub", text: "Neyin geleceğini seçmek" },
          { kind: "bullets", items: [
            "Ne kadar geriye bakılacağı: son 30 gün, 90 gün (varsayılan) ya da 12 ay.",
            "Tamamlanmış, iptal edilmiş, yalnızca dijital ve henüz ödenmemiş siparişlerin her biri, siz açmadıkça dışarıda bırakılır.",
            "Önizleme çalışma alanınızda hiçbir şeyi değiştirmez. Bulduğu her siparişi ve her biriyle ne yapacağını gösterir.",
            "İçe aktarmayacağı sipariş nedenini söyler: Etsy'de iptal edilmiş, yalnızca dijital, henüz ödenmemiş ya da NivaDesk'in eşleyebileceği bir şey yok.",
            "Başka para birimindeki sipariş, alıcının ödediği haliyle korunur ve asla çevrilmez.",
            "Önizlemenin bulduğu her şeyi içe aktarabilir ya da yalnızca istediğiniz siparişleri işaretleyebilirsiniz."
          ] },
          { kind: "sub", text: "Alıcılar ve müşteri listeniz" },
          { kind: "para", text: "Aynı alıcı yeniden sipariş verdiğinde NivaDesk onu tanır ve yeni siparişi zaten sahip olduğunuz müşterinin altına yazar." },
          { kind: "bullets", items: [
            "Bir alıcı yalnızca Etsy'nin kendi alıcı kimliği eşleştiğinde otomatik bağlanır — tesadüf olamayacak tek sinyal budur.",
            "Etsy pek çok alıcıyı yönlendirme adresinin arkasında saklar; NivaDesk bunlardan birini kimlik kanıtı saymaz.",
            "Emin olmadığında olası eşleşmeleri gösterir ve seçimi size bırakır, sonra cevabınızı hatırlayıp bir daha sormaz."
          ] },
          { kind: "sub", text: "Güncel kalmak" },
          { kind: "bullets", items: [
            "Etsy yeni ve değişen siparişleri olduğu anda NivaDesk'e bildirir; NivaDesk ayrıca kaçanı yakalamak için mağazanızı yaklaşık saatte bir kontrol eder. Beklemek istemediğinizde Sync now orada.",
            "Senkronizasyon merkezi her turda gerçekte ne olduğunu söyler: ne geldi, ne güncellendi ve bakılması gereken ne var.",
            "Para ve alıcı Etsy'nindir. Toplamlar, ürünler ve alıcı bilgileri mağazanızdan gelmeye devam eder.",
            "Üretim işiniz sizindir — aşamalar, notlar, takvim, dosyalar, buraya eklediğiniz her şey — ve senkronizasyon bunların üzerine asla yazmaz. Müşteri adını, tasarım adını ya da teslimat adresini düzeltirseniz sizin hâliniz kalır; Etsy'nin kendi kopyası siparişteki Etsy panelinde görünür.",
            "Bağlantı bir gün ilginizi gerektirirse kart bunu açık sözlerle söyler, Reconnect düzeltir. Bu sırada siparişlerinize dokunulmaz."
          ] },
          { kind: "sub", text: "Bağlantıyı kesmek" },
          { kind: "bullets", items: [
            "Disconnect, olmadan önce ne olacağını söyler: senkronizasyon durur, saklanan Etsy erişimi yok edilir ve sipariş ayrıntılarının Etsy kopyası ile hatırlanan alıcı eşleşmeleri NivaDesk'ten kaldırılır.",
            "NivaDesk'te zaten bulunan her sipariş ve her üretim işi olduğu yerde kalır."
          ] }
        ]
      },
      {
        id: "set-ebay",
        title: "eBay",
        blocks: [
          { kind: "para", text: "eBay satıcı hesabınızı bağlayın; eBay siparişleriniz alıcı kullanıcı adı, ürünler, tutarlar, vergiler ve eBay'deki kargo takibiyle birlikte Siparişler'de diğer her şeyin yanında görünür. Her çalışma alanı eBay'i bağlayabilir. NivaDesk siparişlerinizi okur; ilanlarınızı, fiyatlarınızı veya stoğunuzu değiştirmez. Alıcı iletişim bilgileri korumalı bir yerde tutulur ve yalnızca siz istediğinizde gösterilir." },
          { kind: "sub", text: "Hesabı bağlama" },
          { kind: "bullets", items: [
            "[Web] Settings → Integrations → eBay → Set up, ardından Connect eBay. Bağlantıyı eBay'de aynı tarayıcıda onaylayın; doğrudan geri dönersiniz.",
            "[Mac] [iPhone/iPad] [Android] Aynı düğme tarayıcınızda nivadesk.app'i açar; sorulursa giriş yapın, eBay'de onaylayın, sonra uygulamaya dönüp Check now'a basın.",
            "Bağlantıyı yalnızca çalışma alanı sahibi kurabilir veya kesebilir.",
            "Bağlantı salt okunurdur: siparişleriniz ve kimden geldikleri. NivaDesk bir ilanı, fiyatı veya stoğunuzu değiştiremez."
          ] },
          { kind: "sub", text: "Neyin geleceğini seçme" },
          { kind: "bullets", items: [
            "Ne kadar geriye'den 7, 30 ya da 90 günü seçin; Henüz ödenmemiş siparişleri de al ve İptal edilmiş siparişleri de al kutularını isteğinize göre işaretleyin. Hangi eBay sitelerinin geleceği ve Yeni ve değişen siparişler için eBay'i otomatik kontrol et, ilk siparişler geldikten sonra Neler gelsin bölümünde ayarlanır.",
            "Preview, hiçbir şey yazılmadan önce kaç sipariş bulunduğunu ve kaç kopyanın önlendiğini gösterir.",
            "Büyük bir içe aktarma duraklayıp Import'a yeniden basmanızı isteyebilir; arada hiçbir şey kaybolmaz.",
            "Bir iki sipariş alınamadıysa kart bunu söyler ve Retry yalnızca onları yeniden dener."
          ] },
          { kind: "sub", text: "Güncel kalma" },
          { kind: "bullets", items: [
            "NivaDesk yeni ve değişen siparişler için eBay'i gün boyunca kendiliğinden, ayrıca her gece bir kez örtüşen bir aralıkla kontrol eder; böylece bir değişiklik atlanmaz.",
            "Sync now son 24 saati hemen kontrol eder.",
            "Sync health son başarılı kontrolü, bekleyen yeniden denemeleri ve bakılması gereken her şeyi gösterir.",
            "Üretim işiniz sizindir — aşamalar, notlar, takvim, dosyalar — ve senkronizasyon bunların üzerine asla yazmaz."
          ] },
          { kind: "sub", text: "Alıcılar ve müşteri listeniz" },
          { kind: "bullets", items: [
            "eBay alıcıları müşteri listenize otomatik eklenmez ve asla ada göre birleştirilmez.",
            "Adresleri, kargolamak için gerektiğinde siparişten görülebilir ve her gösterim kaydedilir.",
            "Teslimattan 90 gün sonra silinir; eBay de size adresi tam o zaman göstermeyi bırakır."
          ] },
          { kind: "sub", text: "eBay yeniden bağlanmanızı isterse" },
          { kind: "bullets", items: [
            "eBay bağlantıyı kabul etmeyi bıraktığında (izin kaldırıldı, eBay şifresi değişti ya da 18 aylık yetki bitti) kartta Yeniden bağlantı gerekli yazar; eBay'i yeniden bağla'ya basıp yeniden onaylayın.",
            "İçe aktarılmış hiçbir şey kaybolmaz ve siz bağlı değilken değişen siparişler sonradan alınır.",
            "eBay her çalışma alanına açıktır; kart bir gün eBay'in kullanılamadığını söylerse bunu NivaDesk Destek'e iletin."
          ] },
          { kind: "sub", text: "Bağlantıyı kesme" },
          { kind: "bullets", items: [
            "Disconnect, NivaDesk'in eBay hesabınıza erişimini kaldırır ve senkronizasyonu durdurur; içe aktardığınız siparişler kalır."
          ] },
          { kind: "sub", text: "Günlük çağrı bütçesi, dolu plan ve karttaki sayılar" },
          { kind: "bullets", items: [
            "Kart Bugün kullanılan çağrı'yı gösterir. Her bağlantının eBay'in çağrı hakkından günlük bir payı vardır; bu pay bitince kart şunu söyler: Bu bağlantının bugünkü çağrı bütçesi doldu. Senkron yarın sürer. Hiçbir şey kaybolmaz — bir sonraki senkron her şeyi alır.",
            "Sipariş sınırı olan bir planda sınıra ulaşılınca yeni eBay siparişleri Bekletilen (plan dolu) altında bekler; biten siparişleri teslim edildi olarak işaretleyin ya da planı değiştirin, içeri gelirler.",
            "Sayılar NivaDesk'teki eBay siparişleri, Yeniden deneme bekliyor, İnceleme gerekli ve Başarısız'ı gösterir.",
            "eBay siparişi için DHL etiketi oluşturulamaz."
          ] }
        ]
      },
      {
        id: "set-stripe",
        title: "Stripe ile kartla ödeme ve ödeme bağlantıları",
        blocks: [
          { kind: "para", text: "Ücretli planlarda müşterinize kartla ödeme bağlantısı gönderin — bir sipariş için (kapora, taksit ya da kalan tutar) ya da henüz sipariş yokken tek başına — ve para kendi Stripe hesabınıza ödensin. Müşteri Stripe'ın güvenli sayfasında kartla, Stripe'ın sunduğu yerlerde Apple Pay ya da Google Pay ile öder; Stripe ödemeyi onaylayınca NivaDesk bunu kaydeder. NivaDesk komisyon almaz; Stripe'ın kendi ücretleri geçerlidir." },
          { kind: "sub", text: "Stripe'ı bağlamak (sahip)" },
          { kind: "steps", items: [
            "Ayarlar ▸ Entegrasyonlar ▸ Stripe ▸ Kur (bağlandıktan sonra Yönet).",
            "Stripe'ı bağla'ya basın, İşletmenizin kayıtlı olduğu ülke'yi seçin, sonra Stripe'a devam et. Ülke sonradan değiştirilemez; listede olmayan bir ülke, Stripe'ın henüz kabul etmediği bir ülkedir.",
            "Stripe sekmesinde Stripe'ın kendi kaydını bitirin, geri dönüp Yeniden kontrol et'e basın.",
            "Bağlantı oluşturabildiğinizde ekranda Ödeme almaya hazır yazar. Stripe'ın daha fazla bilgiye ihtiyacı var ya da Stripe ile kurulumu tamamlayın, Stripe'ın hâlâ bir şey beklediği anlamına gelir — Stripe ile devam et onu yeniden açar."
          ] },
          { kind: "bullets", items: [
            "Stripe ödemeleri ücretli planlarda yer alır. Free'de Stripe ekranı bunu söyler ve Stripe'ı bağla yerine Planları gör düğmesi çıkar; gönderilmiş bağlantılar yine ödenebilir, kopyalanabilir, iptal ve iade edilebilir.",
            "Bağlantıyı yalnız sahip kurabilir ya da kesebilir; ödemelerin çalışıp çalışmadığını herkes görebilir.",
            "Bağlantıyı kes önce sorar. Gönderilmiş bağlantılar Stripe'ta çalışmaya devam eder ama artık NivaDesk'e kaydedilmez; bu yüzden bağlantıyı kesmeden önce açık bağlantıları iptal edin. Stripe hesabınızın kendisi kapanmaz.",
            "Stripe müşteriye makbuzu yalnızca Stripe Dashboard'unuzda Successful payments açıksa gönderir (Settings → Customer emails)."
          ] },
          { kind: "sub", text: "Kapora, taksit ya da kalan tutar için ödeme bağlantısı göndermek" },
          { kind: "steps", items: [
            "Siparişi açın ▸ Finansal Bilgiler kartı ▸ Ödeme bağlantıları. Burada Kalan tutar ve Henüz istenmedi görünür.",
            "+ Yeni ödeme bağlantısı'na basın, Kapora, Taksit ya da Kalan tutar'ı seçin, tutarı kontrol edip Bağlantı oluştur'a basın.",
            "Bağlantıyı kopyala ve müşterinize kendiniz gönderin — e-postayla, mesajla ya da onunla nasıl konuşuyorsanız öyle. NivaDesk onu sizin yerinize asla göndermez."
          ] },
          { kind: "bullets", items: [
            "Bağlantı çalışma alanınızın para birimindedir. Tutarlar en çok iki ondalık alır ve 12,50 her dilde 12.50 demektir.",
            "Her bağlantı durumunu gösterir: Açık, İşleniyor, Ödenen, Süresi doldu, İptal Edildi, İade Edildi, Kısmen iade edildi ya da İtiraz edildi. İptal açık bir bağlantıyı kapatır.",
            "Müşteri ödeyince siparişin ödenen ve kalan tutarları kendiliğinden güncellenir.",
            "Bağlantı oluşturmak için Finansal Bilgiler kartı ve siparişi düzenleme izni gerekir. iPhone, iPad ve Android uygulamaları da bağlantı oluşturup iptal edebilir; Stripe'ı bağlamak web'de yapılır.",
            "Banka ▸ Ödeme Bağlantıları çalışma alanının tüm bağlantılarını listeler (Açık, Ödenen, Süresi doldu, İptal Edildi, İade / İtiraz, Tümü). Oradaki Sipariş için bağlantı sipariş seçiciyi açar; Yeni ödeme bağlantısı siparişsiz bir bağlantı oluşturur (aşağıda)."
          ] },
          { kind: "sub", text: "Siparişsiz ödeme bağlantısı (sipariş, müşteri ödeyince açılır)" },
          { kind: "steps", items: [
            "Banka ▸ Ödeme Bağlantıları ▸ Yeni ödeme bağlantısı.",
            "Bu ödeme ne için? ve Tutar'ı doldurun (çalışma alanınızın para biriminde); biliyorsanız Müşteri adı (isteğe bağlı) ve Müşteri e-postası (isteğe bağlı) ekleyin, gerekiyorsa Telefon numarası iste ya da Teslimat adresi iste'yi işaretleyin. Bağlantı oluştur'a basın.",
            "Bağlantıyı kopyalayıp gönderin. Ödenene kadar satırda Sipariş, müşteri ödediğinde açılır. yazar; müşteri ödeyince NivaDesk siparişi müşterinin girdiği bilgilerle açar ve satır siparişe bağlanır."
          ] },
          { kind: "sub", text: "Ödemeyi iade etmek (para iadesi)" },
          { kind: "bullets", items: [
            "[Web] Siparişte, ödenmiş bir bağlantıda Ödemeyi iade et (sahip) bulunur. İade edilecek tutarı girin — kısmi iade için tam tutardan az — Sebep'i seçin (Müşteri iade istedi ya da Mükerrer ödeme) ve tutarı yazan … iade et düğmesine basın.",
            "İade geri alınamaz; para Stripe bakiyenizden çıkar ve Stripe işlem ücretini tutar. İade bekliyor, Stripe'ın iadeyi bakiyeniz izin verdiğinde tamamlayacağı anlamına gelir.",
            "İtiraz edilmiş bir ödeme ya da birden çok kez ödenmiş bir bağlantı ise Stripe Dashboard'unuzdan iade edilir."
          ] },
          { kind: "sub", text: "Ödeme bağlantıları için kendi adresiniz (pay.alanadiniz)" },
          { kind: "bullets", items: [
            "Bağlantılar kısadır, örneğin pay.alanadiniz/p/kod. Kendi alan adınız yoksa müşteri portalı alan adınızı ya da nivadesk.app'i kullanırlar.",
            "Ayarlar ▸ Entegrasyonlar ▸ Stripe ▸ Ödeme bağlantısı adresi: adresi yazın, Bu adresi kullan'a basın, gösterilen CNAME kaydını alan adı sağlayıcınıza ekleyin, sonra Yeniden kontrol et. Durum DNS gerekli'den Alan adı doğrulandı'ya, oradan Canlı'ya geçer."
          ] }
        ]
      },
      {
        id: "set-dhl",
        title: "DHL Express",
        blocks: [
          { kind: "para", text: "DHL Express gönderilerini doğrudan siparişlerinizden hazırlayın: kolinin rotası için DHL servislerini görün, etiketi oluşturun, gümrüğün istediği yerde ticari faturayı ekleyin (Büyük Britanya ile Kuzey İrlanda arası dahil) ve takibi izleyin. Her işletme kendi DHL Express hesabını ve MyDHL API erişimini bağlar; böylece DHL size doğrudan fatura keser. NivaDesk kurye alımı (pickup) ayarlamaz." },
          { kind: "sub", text: "DHL'den MyDHL API anahtarı almak" },
          { kind: "bullets", items: [
            "Kendi DHL Express hesabınız için MyDHL API erişimi gerekir. developer.dhl.com'daki MyDHL API sayfasında Get Access'i seçin ve DHL'in formunu DHL Express hesap numaranızla doldurun (DHL Express ayarlarındaki MyDHL API sayfasını açın bağlantısı oraya götürür).",
            "DHL önce bir test anahtarı gönderir ve canlı (production) erişimin ne zaman açılacağına kendisi karar verir."
          ] },
          { kind: "sub", text: "DHL Express'i bağlamak (sahip)" },
          { kind: "steps", items: [
            "Ayarlar ▸ Entegrasyonlar ▸ Kargo ▸ DHL Express ▸ Kur (bağlandıktan sonra Yönet).",
            "DHL test ortamı ya da DHL canlı ortamı'nı seçin; API anahtarı, API gizli anahtarı, DHL Express hesap numarası ve varsa Vergi hesabı numarası (isteğe bağlı) alanlarını doldurun.",
            "DHL Express'i bağla'ya basın.",
            "Gönderici bilgileri'nde Unvan / Görev'i ve + Kayıt numarası ekle ile Kayıt numaralarını (EORI, KDV) girin, sonra Gönderici bilgilerini kaydet."
          ] },
          { kind: "bullets", items: [
            "DHL Express'i yalnız sahip bağlayabilir ya da bağlantısını kesebilir; gönderici bilgilerini sahip ya da yönetici (admin) tutar.",
            "Her çalışma alanı bağlayabilir."
          ] },
          { kind: "sub", text: "Sipariş için DHL etiketi oluşturmak (gönderi, gümrük, ticari fatura)" },
          { kind: "steps", items: [
            "Siparişi açın ▸ Kargo ve Takip kartı ▸ + DHL gönderisi hazırla.",
            "Gönderici, Alıcı ve Koliler'i kontrol edin. İçerik ve gümrük altında Beyan edilecek eşya ya da Belgeler'i ve gümrük vergisini kimin ödeyeceğini (DAP ya da hesabınız izin veriyorsa DDP) seçin, sonra Beyanı onayla.",
            "Bu koli için DHL servislerini göster'e basın, bir servis seçin, sonra Kontrol et ve oluştur — ya da sonra bitirmek için Taslağı kaydet.",
            "DHL etiketi oluştur. Siparişte artık Etiketi aç ve gümrüğün istediği yerde Ticari faturayı aç bulunur."
          ] },
          { kind: "bullets", items: [
            "Servislerin fiyatları finansı görebilen kişilere gösterilir.",
            "Takibi yenile en son durumu çeker; takip ayrıca yaklaşık saatte bir yenilenir. Durumlar Taslak ve Etiket oluşturuldu'dan Yolda, Gümrükte, Dağıtımda ve Teslim Edildi'ye ilerler.",
            "Etiket, kargoya vermek demek değildir: koliyi yine DHL'e kendiniz teslim eder ya da alımı DHL'den kendiniz ayarlarsınız.",
            "Kontrol gerekiyor, NivaDesk'in DHL'in gönderiyi oluşturup oluşturmadığını doğrulayamadığı anlamına gelir; MyDHL'de açılmış gönderileri bul ya da DHL'de yeniden ara, bir şey iki kez oluşturulmadan önce durumu netleştirir.",
            "Eşya beyanı ve ticari fatura finans erişimi ister. eBay siparişi için DHL etiketi oluşturulamaz."
          ] }
        ]
      },
      {
        id: "set-safety",
        title: "Safety & Uploads",
        blocks: [
          { kind: "para", text: "İnsanlar dosya yüklerken çalışma alanınızı koruyun." },
          { kind: "bullets", items: [
            "Maksimum yükleme boyutu ve izin verilen dosya türleri.",
            "Kullanıcıların dosya eklemeden önce kabul ettiği upload politikası.",
            "Bu limitler her siparişteki Client Files için geçerlidir."
          ] }
        ]
      },
      {
        id: "set-data",
        title: "Data Management",
        blocks: [
          { kind: "para", text: "Çalışma alanı verilerinizi içe/dışa aktarın, yedeğini alın ve veri temizliğini yönetin." },
          { kind: "sub", text: "Yedek içe aktarma" },
          { kind: "bullets", items: [
            "İçe aktarma önce kuru çalıştırmadır: hiçbir şey yazılmadan önce dosyada kaç sipariş ve müşteri olduğunu, kaçının çalışma alanında zaten bulunduğunu, kaçının kopya göründüğünü ve dosyanın ayar içerip içermediğini görürsünüz.",
            "Dosya, en son indirdiğiniz yedeğin birebir aynısıysa önizleme bunu söyler — indirme sırasında not edilen SHA-256, seçtiğiniz dosyayla karşılaştırılır.",
            "Olası kopyalar varsayılan olarak atlanır; bilerek ikinci kopya istiyorsanız Skip likely duplicates işaretini kaldırın. Bir içe aktarma 500 kayıtla sınırlıdır ve dışarıda kalanları söyler.",
            "İçe aktardıktan sonra Undo this import, tam olarak o içe aktarmanın oluşturduğu kayıtları siler. Ayar değişiklikleri geri alınmaz."
          ] },
          { kind: "sub", text: "Siparişleri muhasebeciniz için CSV olarak dışa aktarma" },
          { kind: "bullets", items: [
            "Settings ▸ Data Management ▸ Export ya da Siparişler listesindeki \"Siparişleri CSV'ye aktar\" düğmesi dışa aktarma sayfasını açar. Dosya CSV'dir; Excel, Numbers, Google E-Tablolar veya herhangi bir muhasebe programında açılır.",
            "Dört şablon var, böylece muhasebecinizin istediği biçimi gönderirsiniz: Invoices her fatura için bir satır — durum, tarihler, iletişim ve toplamlar; Line items her ürün veya hizmet kalemi için bir satır; Payments alınan her ödeme için bir satır, yani kasa defteri; Finance her fatura için muhasebe sütunlarıyla bir satır — ciro, maliyet, KDV ve net kâr.",
            "Payments ve Finance para sütunları taşır; bu yüzden yalnızca rolü Financial Info görebilen kişilere sunulur. Diğer iki şablon, dışa aktarma yetkisi olan herkeste vardır.",
            "Dönemi seçin: Bu ay, Geçen ay, Bu çeyrek, Bu yıl, Geçen yıl, Tüm zamanlar veya kendi başlangıç ve bitiş tarihinizle özel aralık.",
            "Dışa aktarma Free dâhil her planda vardır — rakamlar sizindir, istediğiniz zaman dışarı alabilirsiniz."
          ] },
          { kind: "sub", text: "Değişiklik geçmişi" },
          { kind: "bullets", items: [
            "Her çalışma alanı ayar kaydı — web, Mac, iPhone veya Android'den — bir değişiklik girdisi olarak kaydedilir: hangi alanlar, ne zaman ve kim tarafından. Girdiler 90 gün tutulur.",
            "Çalışma alanı sahibi geçmişi Pro ve Team planlarında Settings ▸ Data Management ▸ Change history altından okur. Kayıt hiç durmaz; yükseltince geçmişte olanlar da görünür.",
            "Gizli olan gizli kalır: API anahtarı değişikliği yalnızca değiştiği bilgisiyle kaydedilir — anahtarın kendisi asla."
          ] }
        ]
      },
      {
        id: "set-plan",
        title: "Plan & Access",
        blocks: [
          { kind: "para", text: "Mevcut planınızı, kullanım limitlerinizi ve hangi özelliklerin kullanılabilir olduğunu görün ve faturalandırmayı yönetin. Free, Starter, Pro ve Team'i burada karşılaştırın; plan sayfası aboneliğinizin nerede faturalandığını da söyler — web sitesi, App Store, Google Play ya da Shopify — çünkü abonelik yalnızca orada değiştirilebilir." }
        ]
      },
      {
        id: "set-team",
        title: "Ekip Erişimi",
        blocks: [
          { kind: "para", text: "İnsanları çalışma alanınıza e-postayla davet edin ya da katılmak istemelerine izin verin, her birinin neyi görüp yapabileceğini seçin ve bir üyenin erişimini — bir süreliğine ya da tamamen — yaptığı hiçbir şeyi kaybetmeden kaldırın. Kişi eklemek ve yönetmek, Team planında çalışma alanı sahibinin işidir." },
          { kind: "sub", text: "Ekibe birini e-postayla davet etmek (davet bağlantısı)" },
          { kind: "steps", items: [
            "Ayarlar ▸ Ekip Erişimi ▸ Gelişmiş: Şirket ID ile bağlan › Ekip sayfasını açar (Başlarken ▸ Ekip üyesi davet et de onu açar).",
            "Üye Davet Et'e basın, E-posta ile'yi seçin, kişinin e-postasını girin, bir rol seçin ve Daveti Gönder'e basın.",
            "Kişiye nivadesk.app/invite/… bağlantılı, 14 gün geçerli bir e-posta gider. Giriş yapar (ya da Henüz hesabım yok'a basıp davet edilen e-postayla hesap açar) ve Daveti Kabul Et'e basar."
          ] },
          { kind: "bullets", items: [
            "E-posta gönderilemediyse davet yine de oluşturulur: gösterilen bağlantıyı kopyalayıp kendiniz gönderin.",
            "Kabul edilmeyi bekliyor henüz kullanılmamış davetleri listeler; Geri Çek bir daveti iptal eder."
          ] },
          { kind: "sub", text: "Birinin katılmak istemesine izin vermek (Şirket ID, davet kodu)" },
          { kind: "bullets", items: [
            "Ayarlar ▸ Ekip Erişimi'ndeki Davet kodunu kopyala, Şirket ID'nizi kopyalar. Kişi kaydolur, Erişim İste'yi seçer ve e-postanızla ya da Şirket ID ile bir istek gönderir.",
            "İsteği Ekip Erişimi'nde görünür: bir rol seçip Onayla ya da Reddet'e basın."
          ] },
          { kind: "sub", text: "Roller, yetkiler ve her kişinin neler yapabileceği" },
          { kind: "bullets", items: [
            "Roller: Üye, Sadece Görüntüleme, Sadece İş Akışı ya da kendi rol profiliniz. Sahibin rolü sabittir.",
            "Yetki matrisi tüm rolleri yan yana gösterir — her rolün neyi görüp düzenleyip silebildiği — ve her rolün kaç kişide olduğunu.",
            "Her rolün hangi menüleri, sipariş kartlarını ve ayarları göreceğini kontrol edin; Banka Harcamaları, Müşteri mesajları (WhatsApp, Instagram) ve Ekip mesajları dahil.",
            "Belirli projeleri belirli kişilere atayın ve çalışma alanı destek taleplerini yönetmek için destek yöneticileri belirleyin."
          ] },
          { kind: "sub", text: "Koltuklar, erişimi kaldırmak ve geri vermek" },
          { kind: "bullets", items: [
            "Team 5 koltuk içerir; ek koltukların her biri ayda £5 ya da yılda £50'dir, en çok 10 kullanıcıya kadar. Erişimi kaldırılan kişi koltuk kullanmaz.",
            "Ekip sayfasında Erişimi Kaldır birinin erişimini alır: yaptığı hiçbir şey silinmez, Erişim yok olarak görünür ve Erişimi Geri Ver erişimini geri verir.",
            "Kaldır kişiyi çalışma alanından tamamen çıkarır."
          ] }
        ]
      },
      {
        id: "set-sms",
        title: "Müşteri SMS'i",
        blocks: [
          { kind: "para", text: "İş bir aşamaya geldiğinde müşterinize kısa mesaj gönderin; içinde sipariş sayfasının bağlantısı olur. Yalnız sahip görür, Settings ▸ Customer SMS altındadır ve NivaDesk Pro ile Team planlarında bulunur." },
          { kind: "sub", text: "Gönderim henüz açık değil" },
          { kind: "para", text: "Kısa mesaj, ancak operatörlerin kaydettiği bir gönderen adından gönderilebilir. NivaDesk'in kendi gönderen adı şu anda operatör onayında; yani her şeyi şimdi ayarlayabilirsiniz ve onay çıkana kadar hiçbir mesaj gitmez. Ekran hangi durumda olduğunuzu tahmine bırakmadan yazar." },
          { kind: "sub", text: "Hangi durum değişikliği SMS gönderir, istemediğinizi nasıl durdurursunuz" },
          { kind: "bullets", items: [
            "Teklif hazır — varsayılan açık.",
            "İşe başlandı — varsayılan açık.",
            "Teslime hazır — varsayılan açık.",
            "Her durum değişikliği — varsayılan KAPALI, bilerek. Müşteriye her iç adımı haber vermek işletmenizin vereceği bir karardır, sizin adınıza verilmez.",
          ] },
          { kind: "sub", text: "Müşterinizin gördüğü SMS gönderen adı" },
          { kind: "bullets", items: [
            "Varsayılan olarak platformun gönderen adından; çalışma alanınızın adı mesajın içine yazılır ki müşteri kimden geldiğini bilsin.",
            "Bunun yerine kendi gönderen adınızı kaydettirebilirsiniz — müşteri sizin atölyenizin adına bizimkinden çok güvenir. Girdiğinizde \"beklemede\" olur: bir çalışma alanı kendi gönderenini onaylı ilan edemez, bunu operatör yapar.",
            "Adı değiştirmek kaydı yeniden başlatır, çünkü onay eski ad içindi.",
            "Varsayılan ülke kodu, 07700 900123 gibi yerel bir numaranın nasıl aranacağını belirler. Değiştirmezseniz 44'tür.",
          ] },
          { kind: "sub", text: "Her SMS ne kadar tutar, bu ayki kullanım" },
          { kind: "bullets", items: [
            "Ekran bu ayın mesaj, segment ve harcama sayılarını gösterir. Uzun bir mesaj birden fazla segmenttir ve her segment ücretlidir.",
            "Kullanılan numara siparişin müşteri alanındaki numaradır; numarası olmayan sipariş hata vermeden atlanır.",
          ] },
        ]
      },
      {
        id: "set-client-domain",
        title: "Müşteri Portalı Alan Adı",
        blocks: [
          { kind: "para", text: "Müşterilerinizin gördüğü her bağlantıya — sipariş takibi, teklifler ve gelecekteki müşteri sayfaları — SİZİN adınızı koyun. Yalnız sahip görür; Settings ▸ Customer Portal Domain altındadır." },
          { kind: "sub", text: "Ücretsiz NivaDesk alt alan adınız" },
          { kind: "steps", items: [
            "Settings ▸ Customer Portal Domain bölümünü açın (çalışma alanı sahibi olmalısınız).",
            "Bir ad yazın — harf, rakam ve tire; 3–40 karakter — ve Save'e basın.",
            "Müşteri bağlantılarınız ad.nivadesk.app olabilir. Tüm planlara dahildir; yeni ad almak eskisini serbest bırakır."
          ] },
          { kind: "sub", text: "Kendi alan adınız (Pro ve Team)" },
          { kind: "steps", items: [
            "Size ait bir sitenin alt alan adını girin — örn. track.sizinsite.com — ve Connect'e basın. Çıplak domain veya sizinsite.com/track gibi yollar çalışmaz; DNS yol yönlendiremez.",
            "Alan adı sağlayıcınızda, ekranda gösterilen CNAME kaydını customers.nivadesk.app hedefiyle ekleyin.",
            "Check again'e basın. NivaDesk, DNS'in gerçekte ne döndürdüğünü raporlar; değişikliklerin yayılması bir saati bulabilir. Karttaki adım akışı Alan adını gir → DNS kaydını ekle → Sahipliği doğrula → Sertifika sırasını izler; değerler tek dokunuşla kopyalanır.",
            "Doğrulamadan sonra alan adınız için güvenlik sertifikası otomatik düzenlenir — genellikle birkaç dakika sürer. Yenilemek için Check again'e basın; bağlantılarınız sunulmaya başlayınca kart Canlı gösterir."
          ] },
          { kind: "bullets", items: [
            "Doğrulanan alan adı müşteri bağlantılarınızı kendi markanızla sunar — ücretsiz ad.nivadesk.app alt alan adınız ise hiç DNS kurulumu gerektirmeden anında çalışır. Mevcut nivadesk.app bağlantıları her durumda çalışmaya devam eder.",
            "Her sunucu adı tek bir çalışma alanına aittir — başkasının doğruladığı ad alınamaz.",
            "Remove düğmesiyle istediğiniz an kaldırın; bağlantılarınız standart nivadesk.app adreslerine geri döner."
          ] },
          { kind: "bullets", items: [
            "Aynı bölümdeki \"Your customer links\" kartı kısa bağlantılarınızın canlı bir örneğini gösterir (https://atolyeniz.nivadesk.app/r/… gibi) — sipariş takibi ve teklif sayfaları burada kurduğunuz adı izler.",
            "Ad kurulduktan sonra NivaDesk'in verdiği bağlantılar — sipariş kartındaki portal bağlantısı, teklif bağlantıları ve SMS durum güncellemeleri — otomatik olarak markalı adresinizi kullanır. Daha önce paylaşılan bağlantılar eski adreste çalışmaya devam eder.",
            "Dosya bağlantıları da adınızı taşır: bir müşteri dosyasını açmak veya paylaşmak, ham depolama URL'si yerine sizin adresinizde temiz bir görüntüleyici bağlantısı (track.sizinsite.com/f/… gibi) kullanır; müşterinin takip sayfasından açtığı dosyalar da sizin domain'inizde kalır."
          ] },
          { kind: "sub", text: "ChatGPT için NivaDesk uygulaması" },
          { kind: "bullets", items: [
            "NivaDesk'in ChatGPT içinde bir uygulaması var; çalışma alanınızı gündelik dille sorabilirsiniz. Kendi bölümü var: ChatGPT'de NivaDesk."
          ] },
          { kind: "sub", text: "Müşteri sayfası markalama" },
          { kind: "bullets", items: [
            "Aynı bölümde sipariş takip sayfası için bir vurgu rengi seçin — durum yazısını ve ilerleme noktalarını renklendirir. Use the default colour düğmesi rengi temizler.",
            "Müşteri sayfalarındaki \"Powered by NivaDesk\" satırı Pro ve Team planlarında kapatılabilir.",
            "Logonuz, işletme adınız ve alt not zaten çalışma alanı markalama ayarlarınızdan gelir."
          ] }
        ]
      },
      {
        id: "chatgpt-app",
        title: "ChatGPT'de NivaDesk",
        blocks: [
          { kind: "para", text: "NivaDesk'in ChatGPT içinde bir uygulaması var. Çalışma alanınızı bağladıktan sonra onu gündelik dille sorabilirsiniz — ne gecikmiş, bir müşteri daha önce ne sipariş etmiş, bir ay nasıl geçmiş — ve ChatGPT NivaDesk'teki rolünüzle kendi kayıtlarınızdan yanıtlar." },
          { kind: "para", text: "Uygulamada gördüğünüz sipariş, not, finans ve banka verisinin aynısı üzerinde çalışır. Başka bir çalışma alanını göremez; mağazalarınızla ya da bankanızla doğrudan konuşmaz, her şey NivaDesk üzerinden gelir." },
          { kind: "sub", text: "Bağlama" },
          { kind: "bullets", items: [
            "ChatGPT'de uygulama listesini açın, NivaDesk'i seçin ve zaten kullandığınız NivaDesk hesabıyla giriş yapın. Çalışma alanını NivaDesk onay sayfasında siz seçersiniz; ChatGPT parolanızı asla görmez.",
            "Sahipler ChatGPT bağlantılarını Settings ▸ Account altında görüp sonlandırabilir; aynı hesaptan yeniden bağlanmak önceki bağlantının yerine geçer."
          ] },
          { kind: "sub", text: "Neler sorabilirsiniz" },
          { kind: "bullets", items: [
            "Siparişler: müşteri, referans, tasarım adı ya da duruma göre sipariş bulma; birini açma; not ekleme; durumunu veya tasarım durumunu değiştirme; yeni sipariş oluşturma. Yalnızca iş akışı üyeleri sadece kendilerine atanan siparişleri görür; Financial izni olmayan rollerden para alanları gizlenir.",
            "Notlar: kendi kişisel notlarınızı oluşturma, arama, açma, sonuna ekleme, düzenleme, sabitleme ve arşivleme. Ekip notları ChatGPT'den değiştirilmez.",
            "Finans ve pano: bir siparişin finansı, pano özeti, finansal genel bakış ve bir ay, yıl ya da tarih aralığı için ek harcamalar — Starter planda temel biçimde, Pro ve Team'de kâr ve kalan bakiyelerle.",
            "Banka: kategori ve satıcıya göre aylık harcama, tekrarlayan giderler, banka hareketlerinde arama ve fişler — bir fiş ya da fatura fotoğrafı gönderin, NivaDesk onu banka satırıyla eşleştirir; birden fazla satır uyuyorsa hangisi olduğunu sorar; ödeme henüz gelmediyse fiş Banking ▸ Receipts altında bekler ve geldiğinde eşlenir. Fiş ekleme çalışma alanı sahibine özeldir.",
            "Kanallarınız genelinde: herhangi bir kanaldaki siparişi bulma — Shopify, Etsy, WooCommerce, Square, Amazon, eBay ya da kendi aldığınız siparişler — sipariş numarası, mağazanın kendi sipariş numarası, müşteri, tarih ya da ödeme ve gönderim durumuna göre. Mağazanın kendi durumu sizin NivaDesk durumunuzdan ayrı bir alan olarak durur, böylece ikisinin çeliştiği yeri görürsünüz; yanıt, katkı veren her kanalın en son ne zaman senkronlandığını söyler, söyleyemiyorsa bunu söyler. Hiçbir tutar döndürmez: siparişin nerede olduğunu ve ödenip ödenmediğini söyler, ne kadar olduğunu değil; para birimi de vermez. Rakamlar için o siparişin finansını sorun — o ayrı bir araçtır ve önünde Financial izniniz durur. Kendi veri politikası kısıtlayan kanallarda alıcı bilgileri gösterilmez.",
            "Envanter: stoğunuzu ad, SKU, seri numarası, marka, model, kategori ya da konuma göre arama; düşük stok, rezerve ürünler, bir durum ya da bir yere göre daraltma."
          ] },
          // İngilizcesindeki gibi: 1.2.0 (operatör kararı, 10 Eylül 2026) yalnız
          // NIVADESK_MCP_ORCHESTRATOR bayrağını açar; kanal araması ve stok
          // araması bu yüzden yukarıda "Neler sorabilirsiniz" altında. Fotoğraftan
          // ürün ekleme NIVADESK_MCP_INVENTORY arkasında ve o sürümde yok; burada
          // kalan tek madde o. Burada adı geçen her şeyin registry satırı olmak
          // zorunda; mcp-reduced-surface testi bu bölümü derlenmiş corpus'tan
          // okuyup registry ve sürüm bayrağıyla karşılaştırır. Bu metin, chatgptMcp
          // bayrakla deploy edildikten SONRA asistan fonksiyonlarıyla yayına alınır.
          { kind: "sub", text: "Uygulamanın sonraki sürümünde geliyor" },
          { kind: "bullets", items: [
            "Aşağıdaki tek madde hazır ve testli ama bugün ChatGPT'de yayında olan NivaDesk sürümünde yok; şimdi sorarsanız yukarıdaki yanıtları alırsınız. Daha sonraki bir sürümle gelir ve bunun için sizin tarafınızda bir şey değişmesi gerekmez.",
            "Fotoğraftan envanter: fotoğraftan ürün ekleyebilirsiniz — NivaDesk fotoğrafı okur, ürünün ne olduğunu düşündüğünü söyler ve yalnızca siz onayladıktan sonra ekler."
          ] },
          { kind: "sub", text: "Müşteriniz ne zaman haber alır" },
          { kind: "bullets", items: [
            "Bir siparişin durumunu ChatGPT'den değiştirmek, uygulamadan değiştirmekle aynı işlemdir ve müşterinize aynı şekilde ulaşabilir: siparişte otomatik güncellemeler açıksa — e-posta adresi olan siparişlerde varsayılan olarak açıktır — NivaDesk yeni durumu e-postayla bildirir, SMS'i açtıysanız SMS de gönderir. ChatGPT yalnızca çalışma alanınızın hâlihazırda kullandığı durumlardan birini seçebilir ve bir durumu değiştirmeden önce size söylemelidir.",
            "Bunu sipariş bazında müşteri güncellemeleri anahtarından, çalışma alanı genelinde Settings ▸ Notifications altından yönetirsiniz. Bir siparişte otomatik güncellemeleri kapatmak, durum nasıl değiştirilirse değiştirilsin mesaj gitmemesi demektir."
          ] },
          { kind: "sub", text: "Yapmayacakları" },
          { kind: "bullets", items: [
            "Shopify, Etsy, WooCommerce, Square, Amazon ya da eBay'de hiçbir şeyi değiştirmez; bankanıza veya muhasebe yazılımınıza yazmaz. Müşterinize kendi cümlesiyle bir mesaj da yazamaz — müşteriye ulaşan tek şey çalışma alanınızın kendi durum bildirimidir, kendi kelimelerinizle.",
            "Bir rakam geride kalmış bir mağaza ya da banka senkronuna bağlıysa yanıt bunu söyler; eski sayıları canlıymış gibi sunmaz."
          ] },
          { kind: "sub", text: "Claude'da NivaDesk (Claude bağlayıcısı)" },
          { kind: "bullets", items: [
            "Anthropic'in asistanı Claude, NivaDesk bağlayıcısıyla her planda çalışma alanınızla çalışabilir: ChatGPT uygulaması gibi siparişlere, notlara, stoğa ve rakamlara bakar ve rolünüzün izin verdiği değişiklikleri yapar.",
            "Claude'da Settings › Connectors'ı açın, Add custom connector'ı seçin ve bağlayıcı adresini yapıştırın: https://nivadesk.app/claudeMcp (NivaDesk Claude'un kendi dizininde görünene kadar); sonra NivaDesk hesabınızla giriş yapıp çalışma alanını seçin.",
            "Bir fiş için Claude size tek bir işleme ait, 15 dakika geçerli bir NivaDesk yükleme bağlantısı verir; dosya hiçbir zaman Claude'dan geçmez.",
            "Bağlı kalırsınız: yalnızca bağlantı kesildiyse, erişiminiz değiştiyse ya da 90 gün kullanılmadıysa yeniden giriş yaparsınız. Bağlantıyı Ayarlar ▸ Entegrasyonlar'dan kesin."
          ] }
        ]
      },
      {
        id: "set-support",
        title: "Support / Tickets",
        blocks: [
          { kind: "para", text: "Çalışma alanı sahibinize/adminlere veya NivaDesk ekibine ulaşın: Messages menüsünde gördüğünüz ticketların aynısı." },
          { kind: "bullets", items: [
            "Üç sekme: Internal Workspace Ticket kendi sahibinize, adminlerinize ve destek yöneticilerinize gider; Contact NivaDesk Support bize gelir; Website Chats ise NivaDesk ekibinin web sitesi widget'ından gelen soruları gördüğü kutudur.",
            "\"How do I…?\" asistanı ticket'ı sizin için açabilir: soru rehberin kapsamı dışındaysa Send this to NivaDesk Support çıkar, tek tuşla sorunuz başlık olarak ve asistanın kendi cevabı ekli şekilde ticket açılır — soruyu tekrar yazmanız gerekmez."
          ] }
        ]
      }
    ]
  },
  {
    id: "language-theme",
    title: "Dil ve Görünüm",
    blocks: [
      { kind: "para", text: "NivaDesk'in görünüşünü ve dilini istediğiniz gibi yapın. İkisi de Settings ▸ General altındadır ve cihazlarınız arasında senkronlanır." },
      { kind: "bullets", items: [
        "Dil: 12 dilden birini seçin; menüler ve etiketler dahil tüm uygulama anında değişir.",
        "Görünüm: açık ve koyu mod arasında geçiş yapın.",
        "Tercihleriniz hesabınıza kaydedilir; Mac, iPhone, iPad, Android ve web'de sizi takip eder."
      ] }
    ]
  },
  {
    id: "finding-your-way",
    title: "Her uygulamada yolunuzu bulmak",
    blocks: [
      { kind: "para", text: "NivaDesk web'de, Mac'te, iPhone ve iPad'de, Android'de aynı çalışma alanıdır — ama telefon, tarayıcının gösterdiği menü sırasını gösteremez; bu yüzden bir bölüme nasıl gittiğiniz değişir. Kılavuzun geri kalanı bir yeri Bölüm ▸ Sekme ▸ Düğme diye yazar; bu bölüm, o yolu elinizdeki uygulamada nasıl yürüyeceğinizi anlatır." },
      { kind: "bullets", items: [
        "[Web] Bölümler pencerenin üstünde sıralanır — Ana Sayfa, Siparişler, Üretim, Pano, Banka, Planlama, Notlar, Müşteriler, Envanter, Dosyalar, Mesajlar, AI Yanıtları, Ayarlar. Birine tıklayın; o bölümün sekmeleri içinde durur.",
        "[Mac] Pencerenin üstünde aynı bölüm sırası, her bölümün içinde aynı sekmeler.",
        "[iPhone/iPad] Sıra için yer yok; bölümler üst bardaki menü düğmesinin arkasındadır. Dokunun, bölümü seçin, sekmeleri içinde açılır.",
        "[Android] Aynısı: üst bardaki menü bölümleri listeler, sekmeler seçtiğiniz bölümün içindedir.",
        "İlk ▸ işaretinden sonrası — sekmeler, düğmeler, alanlar — dört uygulamada da aynı adı taşır; doğru bölüme girdikten sonra adımlar aynı okunur."
      ] }
    ]
  },
  {
    id: "help-assistant",
    title: "Yardım asistanı (Nasıl yaparım…?)",
    blocks: [
      { kind: "para", text: "Uygulamanın içindeki yardım asistanı (Nasıl yaparım…?) bu kılavuzdan yanıt verir. Starter, Pro ve Team'de adımları — nereye gidileceğini ve neye basılacağını — söyler. Çalışma alanınızı değil kılavuzu okur; bu yüzden siparişlerinizi ya da rakamlarınızı asla görmez." },
      { kind: "sub", text: "Yardım asistanı nerede" },
      { kind: "bullets", items: [
        "Nasıl yaparım…? düğmesine basın — ekranın sağ altındaki düğme; web uygulamasında ve Mac, iPhone, iPad ve Android uygulamalarında.",
        "Başlarken ▸ Yardım asistanına bir soru sorun da onu açar.",
        "nivadesk.app'te köşedeki sohbet de yanıt verir; Starter, Pro ya da Team ile oturum açmışsanız uygulamadaki asistanla aynı adımları verir."
      ] },
      { kind: "sub", text: "Neyi yanıtlar, neyi yanıtlayamaz" },
      { kind: "bullets", items: [
        "Bir şeyin nasıl çalıştığını, bir düğmenin nerede olduğunu ya da bir şeyi nasıl kuracağınızı herhangi bir dilde sorun.",
        "Çalışma alanınızı göremez. Kendi verilerinizle ilgili sorular için — hangi siparişler gecikti, ne kadar kazandınız — sizi NivaDesk ChatGPT uygulamasına yönlendirir.",
        "Kılavuz bir soruyu kapsamıyorsa Bunu NivaDesk Destek'e gönder, soruyu verdiği yanıtla birlikte bir destek talebine çevirir; Taleplerini gör yanıtı gösterir.",
        "Starter, Pro ve Team günde 40 soru sorabilir."
      ] }
    ]
  },
  {
    id: "notifications",
    title: "Telefonunuzda ve bilgisayarınızda bildirimler",
    blocks: [
      { kind: "para", text: "NivaDesk, siz bakmak zorunda kalmadan bir şey olduğunu haber verebilir. Bildirimler oturum açtığınız cihazlara gelir — Mac, iPhone, iPad, Android ve web uygulaması — ve her biri ilgili olduğu şeyi açar." },
      { kind: "bullets", items: [
        "Mağazanızdan veya sitenizden yeni bir sipariş gelmesi.",
        "Bir kargonun hareket etmesi: ilk okutma ve teslimat.",
        "Sizinle paylaşılan bir not ve bir nota birlikte çalışma daveti.",
        "Ekip arkadaşınızdan mesaj ve destek talebine gelen yanıt.",
        "Hareket listesine düşen her şey aynı zamanda bir bildirimdir; liste ile uyarılar asla farklı şeyler anlatmaz."
      ] },
      { kind: "sub", text: "Açmak ve kapatmak" },
      { kind: "bullets", items: [
        "NivaDesk'i bir cihazda ilk açtığınızda o cihazdan izin ister. Hayır derseniz başka hiçbir şey değişmez.",
        "NivaDesk'in içinde bir anahtar yoktur: bildirimleri cihazın kendisi açar ve kapatır, her cihaz için ayrı ayrı. iPhone ve iPad'de Ayarlar ▸ Bildirimler ▸ NivaDesk. Mac'te Sistem Ayarları ▸ Bildirimler ▸ NivaDesk. Android'de Ayarlar ▸ Uygulamalar ▸ NivaDesk ▸ Bildirimler. Tarayıcıda nivadesk.app için site ayarları.",
        "Telefonunuzda kapatmanız, oturum açtığınız diğer yerlerde açık kalmasını engellemez; genelde istenen de budur.",
        "Cihaz, oturum açtığınızda kendini kaydeder ve çıkış yaptığınızda kaydı silinir — çıkış yaptığınız bir telefon o çalışma alanıyla ilgili hiçbir şey almayı bırakır.",
        "Bildirimler oturum açtığınız çalışma alanını izler. Dışarıdaki kişilere gönderilmez ve belirli kişiler için olan bir bildirim yalnızca onlara gider."
      ] }
    ]
  }
];

function localizeTree(nodes: GuideNode[], dict: Record<string, string>): GuideNode[] {
  const tr = (value: string) => dict[value] ?? value;
  return nodes.map(node => ({
    id: node.id,
    title: tr(node.title),
    blocks: node.blocks.map(block =>
      block.kind === "bullets" || block.kind === "steps"
        ? { kind: block.kind, items: block.items.map(tr) }
        : { kind: block.kind, text: tr(block.text) }
    ),
    children: node.children ? localizeTree(node.children, dict) : undefined
  }));
}

export function getGuideTree(language: StudioLanguage | string | null | undefined): GuideNode[] {
  const lang = language as StudioLanguage;
  if (lang === "Türkçe") return TREE_TR;
  if (!lang || lang === "English") return TREE_EN;
  const dict = GUIDE_T[lang];
  return dict ? localizeTree(TREE_EN, dict) : TREE_EN;
}

