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
      { kind: "sub", text: "Locations and suppliers" },
      { kind: "bullets", items: [
        "Locations form a tree — a safe holds a drawer holds a tray. Renaming or moving one renames it on every item standing there; a location with stock or child locations inside cannot be deleted.",
        "Suppliers keep contact details plus the paperwork fields an invoice asks for: your own code for them, address, VAT number and billing currency."
      ] }
    ]
  },
  {
    id: "banking",
    title: "Bank Spending",
    blocks: [
      { kind: "para", text: "Connect your business bank through Open Banking and see spending as it happens: categories, VAT treatment, receipts matched to transactions and recurring payments. NivaDesk only reads your transactions — it can never move money. Bank access is owner-only unless the owner grants a member the Bank Spending permission." },
      { kind: "sub", text: "Connecting a bank" },
      { kind: "steps", items: [
        "Open Banking and choose Connect; pick your bank and approve access on the bank's own page.",
        "Transactions sync automatically in the background, and Refresh fetches on demand.",
        "Open Banking consent lasts 90 days: NivaDesk shows the renewal date, warns when it is close, and Reconnect renews it in a minute.",
        "Disconnect keeps everything already imported; deleting the imported data is a separate, explicit choice. The Activity view shows the connection's own diary — syncs, failures, connects and disconnects."
      ] },
      { kind: "sub", text: "Transactions, categories and VAT" },
      { kind: "bullets", items: [
        "Every transaction gets a category; rules apply them automatically ('always categorise this keyword as Software') and each automatic change says which rule did it.",
        "VAT treatment is recorded per transaction with NivaDesk's own codes (standard, reduced, zero-rated, exempt and more), independent of any accounting provider.",
        "Review statuses track what still needs a look; bulk actions handle a whole month in one pass.",
        "A transaction that covers several things can be split into lines; the lines must add up to the bank amount, to the penny."
      ] },
      { kind: "sub", text: "Receipts" },
      { kind: "steps", items: [
        "Open a transaction and attach its receipt: upload a photo or PDF, or Choose from Files to reference an invoice already in your library — nothing is copied twice.",
        "Or snap the receipt first: NivaDesk reads the amount and date and suggests the matching transaction.",
        "If the receipt arrives before the bank does (card payments often land 1–3 days later), keep it waiting — it attaches itself when the transaction appears."
      ] },
      { kind: "sub", text: "Recurring and incoming" },
      { kind: "bullets", items: [
        "Recurring payments are detected from history — usual amount, expected day of the month and a confidence grade; upcoming ones are estimates, clearly marked. You can also mark a vendor as recurring yourself.",
        "Incoming money can be matched to an order as its payment — never duplicated — or marked as a transfer, an owner contribution or a loan so it does not count as revenue."
      ] },
      { kind: "sub", text: "Accountant sync (Pandle)" },
      { kind: "bullets", items: [
        "If you use Pandle, connect it on the Banking page: confirmed transactions are pushed with your own category and VAT mapping.",
        "NivaDesk matches transactions Pandle already has instead of creating them again, and asks you to confirm when a match is not certain."
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
          { kind: "para", text: "Connect your online store so live website orders flow into NivaDesk automatically. Each integration screen shows your per-workspace signed delivery URL to paste into the platform; new orders then appear in Orders and Schedule, mapped to your order workflow." },
          { kind: "bullets", items: [
            "WooCommerce: create one webhook (Order created) and paste the delivery URL.",
            "WooCommerce signature check (optional, recommended): set a Secret on the WooCommerce webhook, paste the same Secret in the integration screen's Signature check card, and NivaDesk verifies every delivery's signature — a wrong signature is rejected even with a valid URL.",
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
          { kind: "para", text: "Import, export and back up your workspace data, and manage data clean-up." },
          { kind: "sub", text: "Importing a backup" },
          { kind: "bullets", items: [
            "Import is a dry run first: before anything is written you see how many orders and customers the file holds, how many already exist in the workspace, how many look like duplicates, and whether the file includes settings.",
            "If the file is the exact backup you last downloaded, the preview says so — the SHA-256 noted at download time is checked against the file you picked.",
            "Likely duplicates are skipped by default; untick Skip likely duplicates only when you want deliberate second copies. One import is capped at 500 records and tells you what was left out.",
            "After importing, Undo this import removes exactly the records that import created. Settings changes are not undone."
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
            "The Permission matrix shows every role side by side — what each one can view, edit or delete at a glance, with member counts per role.",
            "Control which menus, order cards and settings each role can see.",
            "Assign specific projects to specific people, and appoint support managers to handle workspace tickets."
          ] }
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
            "Once a name is set up, the links NivaDesk hands out — the portal link on the order card, estimate links and SMS status updates — use your branded address automatically. Links shared earlier keep working on the old address."
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
      { kind: "sub", text: "Konumlar ve tedarikçiler" },
      { kind: "bullets", items: [
        "Konumlar ağaç kurar — kasa çekmeceyi, çekmece tepsiyi barındırır. Birini yeniden adlandırmak veya taşımak, orada duran her üründe adını günceller; içinde stok ya da alt konum olan konum silinemez.",
        "Tedarikçiler iletişim bilgisinin yanında faturanın sorduğu evrak alanlarını tutar: sizin verdiğiniz kod, adres, KDV numarası ve para birimi."
      ] }
    ]
  },
  {
    id: "banking",
    title: "Banka Harcamaları",
    blocks: [
      { kind: "para", text: "İşletme bankanızı Open Banking ile bağlayın ve harcamayı olurken görün: kategoriler, KDV işlemi, hareketlere eşlenmiş fişler ve tekrarlayan ödemeler. NivaDesk hareketlerinizi yalnızca okur — asla para taşıyamaz. Banka erişimi, sahibi bir üyeye Banka Harcamaları iznini vermedikçe yalnız sahibindedir." },
      { kind: "sub", text: "Banka bağlama" },
      { kind: "steps", items: [
        "Banka bölümünü açıp Bağlan'ı seçin; bankanızı seçin ve erişimi bankanın kendi sayfasında onaylayın.",
        "Hareketler arka planda kendiliğinden eşitlenir; Yenile anında çeker.",
        "Open Banking rızası 90 gün sürer: NivaDesk yenileme tarihini gösterir, yaklaşınca uyarır; Yeniden bağlan bir dakikada tazeler.",
        "Bağlantıyı kes içe aktarılmış her şeyi korur; veriyi silmek ayrı ve açık bir karardır. Etkinlik görünümü bağlantının kendi günlüğünü gösterir — eşitlemeler, hatalar, bağlanma ve kesilmeler."
      ] },
      { kind: "sub", text: "Hareketler, kategoriler ve KDV" },
      { kind: "bullets", items: [
        "Her hareket bir kategori alır; kurallar bunu kendiliğinden uygular ('bu kelimeyi hep Yazılım yap') ve her otomatik değişiklik hangi kuralın yaptığını söyler.",
        "KDV işlemi, muhasebe sağlayıcısından bağımsız olarak NivaDesk'in kendi kodlarıyla hareket başına kaydedilir (standart, indirimli, sıfır oranlı, istisna ve daha fazlası).",
        "İnceleme durumları hâlâ bakılması gerekeni izler; toplu işlemler koca bir ayı tek geçişte halleder.",
        "Birden çok şeyi kapsayan hareket satırlara bölünebilir; satırlar banka tutarına kuruşuna kadar denk gelmek zorundadır."
      ] },
      { kind: "sub", text: "Fişler" },
      { kind: "steps", items: [
        "Hareketi açın ve fişini ekleyin: fotoğraf ya da PDF yükleyin, veya kütüphanenizdeki faturayı Dosyalardan seç ile bağlayın — hiçbir şey ikinci kez kopyalanmaz.",
        "Ya da önce fişi çekin: NivaDesk tutarı ve tarihi okur, eşleşen hareketi önerir.",
        "Fiş bankadan önce gelirse (kart ödemeleri çoğu kez 1–3 gün sonra düşer) bekletin — hareket görünür görünmez kendiliğinden eklenir."
      ] },
      { kind: "sub", text: "Tekrarlayan ve gelen" },
      { kind: "bullets", items: [
        "Tekrarlayan ödemeler geçmişten saptanır — olağan tutar, ayın beklenen günü ve güven derecesiyle; yaklaşanlar tahmindir ve öyle işaretlenir. Bir satıcıyı kendiniz de tekrarlayan olarak işaretleyebilirsiniz.",
        "Gelen para bir siparişin ödemesi olarak eşlenebilir — asla çift kayıt olmadan — ya da transfer, sahip katkısı veya kredi olarak işaretlenir ki hasılat sayılmasın."
      ] },
      { kind: "sub", text: "Muhasebe eşitlemesi (Pandle)" },
      { kind: "bullets", items: [
        "Pandle kullanıyorsanız Banka sayfasından bağlayın: onaylanmış hareketler sizin kategori ve KDV eşlemenizle gönderilir.",
        "NivaDesk, Pandle'da zaten olan hareketi yeniden yaratmak yerine eşler; eşleşme kesin değilse size sorar."
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
          { kind: "para", text: "Online mağazanı bağla; canlı web sitesi siparişleri NivaDesk'e otomatik aksın. Her entegrasyon ekranı, platforma yapıştıracağın çalışma alanına özel imzalı delivery URL'ini gösterir; yeni siparişler sipariş akışına eşlenerek Orders ve Schedule'da görünür." },
          { kind: "bullets", items: [
            "WooCommerce: bir webhook (Order created) oluştur ve delivery URL'ini yapıştır.",
            "WooCommerce imza denetimi (isteğe bağlı, önerilir): WooCommerce webhook'unda bir Secret belirle, aynısını entegrasyon ekranındaki Signature check kartına yapıştır; NivaDesk her teslimatın imzasını doğrular — yanlış imza geçerli URL ile bile reddedilir.",
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
          { kind: "para", text: "Çalışma alanı verilerinizi içe/dışa aktarın, yedeğini alın ve veri temizliğini yönetin." },
          { kind: "sub", text: "Yedek içe aktarma" },
          { kind: "bullets", items: [
            "İçe aktarma önce kuru çalıştırmadır: hiçbir şey yazılmadan önce dosyada kaç sipariş ve müşteri olduğunu, kaçının çalışma alanında zaten bulunduğunu, kaçının kopya göründüğünü ve dosyanın ayar içerip içermediğini görürsünüz.",
            "Dosya, en son indirdiğiniz yedeğin birebir aynısıysa önizleme bunu söyler — indirme sırasında not edilen SHA-256, seçtiğiniz dosyayla karşılaştırılır.",
            "Olası kopyalar varsayılan olarak atlanır; bilerek ikinci kopya istiyorsanız Skip likely duplicates işaretini kaldırın. Bir içe aktarma 500 kayıtla sınırlıdır ve dışarıda kalanları söyler.",
            "İçe aktardıktan sonra Undo this import, tam olarak o içe aktarmanın oluşturduğu kayıtları siler. Ayar değişiklikleri geri alınmaz."
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
            "Yetki matrisi tüm rolleri yan yana gösterir — her rolün neyi görüp düzenleyip silebildiği ve kaç üyeyi kapsadığı tek bakışta.",
            "Her rolün hangi menü, sipariş kartı ve ayarları göreceğini kontrol edin.",
            "Belirli projeleri belirli kişilere atayın ve çalışma alanı ticketlarını yönetmek için support yöneticileri belirleyin."
          ] }
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
            "Ad kurulduktan sonra NivaDesk'in verdiği bağlantılar — sipariş kartındaki portal bağlantısı, teklif bağlantıları ve SMS durum güncellemeleri — otomatik olarak markalı adresinizi kullanır. Daha önce paylaşılan bağlantılar eski adreste çalışmaya devam eder."
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

