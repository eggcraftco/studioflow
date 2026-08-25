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

const TREE_EN: GuideNode[] = [
  {
    id: "getting-started",
    title: "Getting started",
    blocks: [
      { kind: "para", text: "When you first open NivaDesk, a short setup gets your workspace ready for your kind of work." },
      { kind: "steps", items: [
        "Pick your industry: NivaDesk tailors the workflow steps, order fields and labels to your craft.",
        "Review the business description: it auto-fills to fit your trade and shapes how orders are set up. You can edit it any time in Settings ▸ Workflow Steps.",
        "Explore the Free workspace: sample orders and customers let you try everything before adding real data.",
        "Add your first real order with Add Project when you are ready."
      ] },
      { kind: "para", text: "You can change your industry, workflow steps and labels later in Settings, so nothing here is permanent." }
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
        "Give a card a color (8 options) to make it stand out.",
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
            "Add to Calendar: downloads an all-day calendar file spanning the created date to the delivery date, so the order appears in your calendar app (available from NivaDesk Lite)."
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
          { kind: "para", text: "This card only appears for roles allowed to see finances; for everyone else the order's money stays hidden." }
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
            "History cards are available from NivaDesk Lite."
          ] }
        ]
      }
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
        "Download an all-day calendar file for an order to add it to your own calendar app (available from NivaDesk Lite).",
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
        "Restore a project note back to your main Notes board at any time."
      ] },
      { kind: "sub", text: "Archive & Trash" },
      { kind: "bullets", items: [
        "Archive a note to clear it from the board without deleting it; Unarchive to bring it back.",
        "Move a note to Trash, Restore it later, or Delete forever to remove it permanently."
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
        "Use the collapsible list to find a customer quickly."
      ] }
    ]
  },
  {
    id: "files",
    title: "Files",
    blocks: [
      { kind: "para", text: "A read-only index of every client file across all your orders, so you can find any document without opening each order." },
      { kind: "bullets", items: [
        "Browse and preview files, and open the order a file belongs to.",
        "See who added each file.",
        "Uploads follow the maximum size and upload policy set in Settings ▸ Safety & Uploads.",
        "To add or delete files, open that order's own Client Files card."
      ] }
    ]
  },
  {
    id: "messages",
    title: "Messages",
    blocks: [
      { kind: "para", text: "Talk to your team inside NivaDesk: direct messages and group conversations, kept right next to your work." },
      { kind: "bullets", items: [
        "Start a Direct message with a teammate or a Group conversation.",
        "Send text, files and images; forward, edit or leave a conversation.",
        "The workspace owner controls whether direct messages, group chats and file sending are allowed.",
        "Team messaging is available on the Team plan. (To raise a ticket instead, use Settings ▸ Support / Tickets.)"
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
      { kind: "para", text: "Where you tailor NivaDesk to your business. Pick a section on the left to see what it controls. Some settings are protected, so only the owner or admins can change them." }
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
          { kind: "para", text: "Control how invoices and order PDFs look: your business details, logo and a footer note, plus what is included in the export." }
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
          { kind: "para", text: "Connect your online store so live website orders flow into NivaDesk automatically. Each integration screen shows your per-workspace signed delivery URL to paste into the platform; new orders then appear in Orders and Schedule, mapped to your order workflow." },
          { kind: "bullets", items: [
            "WooCommerce: create one webhook (Order created) and paste the delivery URL.",
            "Shopify: add an order webhook (Order payment, JSON format) pointing at the delivery URL.",
            "Other platforms: connect Wix, Squarespace, Etsy, BigCommerce or a custom site through the generic order webhook or a no-code tool like Zapier or Make."
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
          { kind: "para", text: "Import, export and back up your workspace data, and manage data clean-up." }
        ]
      },
      {
        id: "set-plan",
        title: "Plan & Access",
        blocks: [
          { kind: "para", text: "See your current plan, your usage limits and which features are available, and manage billing. Review the Free/Demo, Lite, Pro and Team options here." }
        ]
      },
      {
        id: "set-team",
        title: "Team Access",
        blocks: [
          { kind: "para", text: "Invite your team and control exactly what each person can see and do." },
          { kind: "bullets", items: [
            "Give each member a role: Member, View Only, Workflow Only, or your own custom role.",
            "Control which menus, order cards and settings each role can see.",
            "Assign specific projects to specific people, and appoint support managers to handle workspace tickets."
          ] }
        ]
      },
      {
        id: "set-support",
        title: "Support / Tickets",
        blocks: [
          { kind: "para", text: "Contact your workspace owner or admins, or open a support ticket to the NivaDesk team: the same tickets you see in the Messages menu." }
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
  }
];

// --- Turkish tree -----------------------------------------------------------

const TREE_TR: GuideNode[] = [
  {
    id: "getting-started",
    title: "Başlarken",
    blocks: [
      { kind: "para", text: "NivaDesk'i ilk açtığınızda kısa bir kurulum, çalışma alanınızı yaptığınız işe göre hazırlar." },
      { kind: "steps", items: [
        "İş kolunuzu seçin: NivaDesk iş akışı adımlarını, sipariş alanlarını ve etiketleri mesleğinize göre ayarlar.",
        "İş açıklamasını gözden geçirin: mesleğinize uyacak şekilde otomatik dolar ve siparişlerin nasıl kurulacağını belirler. İstediğiniz zaman Settings ▸ Workflow Steps'ten düzenleyebilirsiniz.",
        "Free çalışma alanını keşfedin: örnek siparişler ve müşteriler, gerçek veri eklemeden her şeyi denemenizi sağlar.",
        "Hazır olduğunuzda Add Project ile ilk gerçek siparişinizi ekleyin."
      ] },
      { kind: "para", text: "İş kolunuzu, iş akışı adımlarınızı ve etiketleri sonradan Settings'ten değiştirebilirsiniz; burada hiçbir şey kalıcı değildir." }
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
        "Bir karta renk verin (8 seçenek) ki öne çıksın.",
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
            "Add to Calendar: oluşturulma tarihinden teslim tarihine kadar uzanan tüm-gün bir takvim dosyası indirir; böylece sipariş takvim uygulamanızda görünür (NivaDesk Lite'tan itibaren)."
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
          { kind: "para", text: "Bu kart yalnızca finansı görmeye izinli rollerde görünür; diğer herkes için siparişin parası gizli kalır." }
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
            "History kartları NivaDesk Lite'tan itibaren kullanılabilir."
          ] }
        ]
      }
    ]
  },
  {
    id: "schedule",
    title: "Schedule (Takvim)",
    blocks: [
      { kind: "para", text: "Siparişlerinizin teslim tarihine göre takvim görünümü; haftanızı planlayın ve yaklaşanları görün." },
      { kind: "bullets", items: [
        "Previous ve Next ile tarih aralıkları arasında gezin, duruma göre filtreleyin.",
        "Doğrudan takvimden yeni bir planlı proje oluşturun.",
        "Bir sipariş için tüm-gün takvim dosyası indirip kendi takvim uygulamanıza ekleyin (NivaDesk Lite'tan itibaren).",
        "Aralıktaki herhangi bir siparişi açıp üzerinde çalışın."
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
        "Bir proje notunu istediğiniz zaman ana Notes panonuza geri taşıyın (Restore)."
      ] },
      { kind: "sub", text: "Arşiv & Çöp" },
      { kind: "bullets", items: [
        "Bir notu silmeden panodan kaldırmak için arşivleyin (Archive); geri getirmek için Unarchive.",
        "Bir notu Çöp'e taşıyın, sonra geri alın (Restore) veya kalıcı silmek için Delete forever."
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
        "Bir müşteriyi hızla bulmak için katlanır listeyi kullanın."
      ] }
    ]
  },
  {
    id: "files",
    title: "Files (Dosyalar)",
    blocks: [
      { kind: "para", text: "Tüm siparişlerinizdeki müşteri dosyalarının salt-okunur bir indeksi; herhangi bir belgeyi her siparişi açmadan bulun." },
      { kind: "bullets", items: [
        "Dosyaları tarayıp önizleyin ve bir dosyanın ait olduğu siparişi açın.",
        "Her dosyayı kimin eklediğini görün.",
        "Yüklemeler Settings ▸ Safety & Uploads'taki maksimum boyut ve upload politikasını izler.",
        "Dosya eklemek veya silmek için ilgili siparişin kendi Client Files kartını açın."
      ] }
    ]
  },
  {
    id: "messages",
    title: "Messages (Mesajlar)",
    blocks: [
      { kind: "para", text: "Ekibinizle NivaDesk içinde konuşun: direkt mesajlar ve grup sohbetleri, tam işinizin yanında." },
      { kind: "bullets", items: [
        "Bir ekip arkadaşıyla Direct mesaj veya bir Group sohbeti başlatın.",
        "Metin, dosya ve görsel gönderin; bir konuşmayı iletin (forward), düzenleyin veya ayrılın.",
        "Direkt mesajlara, grup sohbetlerine ve dosya göndermeye izin verilip verilmeyeceğini çalışma alanı sahibi kontrol eder.",
        "Ekip mesajlaşması Team planında kullanılabilir. (Bunun yerine ticket açmak için Settings ▸ Support / Tickets.)"
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
      { kind: "para", text: "NivaDesk'i işinize göre özelleştirdiğiniz yer. Soldan bir bölüm seçin. Bazı ayarlar korumalıdır; yalnızca owner veya adminler değiştirebilir." }
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
          { kind: "para", text: "Fatura ve sipariş PDF'lerinin görünümünü, işletme bilgileri, logo ve alt not, ve dışa aktarıma neyin dahil edileceğini ayarlayın." }
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
          { kind: "para", text: "Online mağazanı bağla; canlı web sitesi siparişleri NivaDesk'e otomatik aksın. Her entegrasyon ekranı, platforma yapıştıracağın çalışma alanına özel imzalı delivery URL'ini gösterir; yeni siparişler sipariş akışına eşlenerek Orders ve Schedule'da görünür." },
          { kind: "bullets", items: [
            "WooCommerce: bir webhook (Order created) oluştur ve delivery URL'ini yapıştır.",
            "Shopify: bir sipariş webhook'u (Order payment, JSON) ekleyip delivery URL'ine yönlendir.",
            "Diğer platformlar: Wix, Squarespace, Etsy, BigCommerce veya özel siteyi generic sipariş webhook'u ya da Zapier/Make gibi kodsuz bir araçla bağla."
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
          { kind: "para", text: "Çalışma alanı verilerinizi içe/dışa aktarın, yedeğini alın ve veri temizliğini yönetin." }
        ]
      },
      {
        id: "set-plan",
        title: "Plan & Access",
        blocks: [
          { kind: "para", text: "Mevcut planınızı, kullanım limitlerinizi ve hangi özelliklerin kullanılabilir olduğunu görün ve faturalandırmayı yönetin. Free/Demo, Lite, Pro ve Team seçeneklerini buradan inceleyin." }
        ]
      },
      {
        id: "set-team",
        title: "Team Access",
        blocks: [
          { kind: "para", text: "Ekibinizi davet edin ve herkesin tam olarak neyi görüp yapabileceğini kontrol edin." },
          { kind: "bullets", items: [
            "Her üyeye bir rol verin: Üye, Sadece Görüntüleme, Sadece İş Akışı veya kendi özel rolünüz.",
            "Her rolün hangi menü, sipariş kartı ve ayarları göreceğini kontrol edin.",
            "Belirli projeleri belirli kişilere atayın ve çalışma alanı ticketlarını yönetmek için support yöneticileri belirleyin."
          ] }
        ]
      },
      {
        id: "set-support",
        title: "Support / Tickets",
        blocks: [
          { kind: "para", text: "Çalışma alanı sahibinize/adminlere veya NivaDesk ekibine ulaşın: Messages menüsünde gördüğünüz ticketların aynısı." }
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

