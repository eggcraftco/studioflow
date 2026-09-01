import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase/client";
import { withWebSyncStatus } from "@/lib/studioflow/syncStatus";
import { DEFAULT_PRODUCTION_STAGES, type ProductionStage } from "@/lib/studioflow/production";

// The four questions worth asking before someone starts work.
//
// The report's cut: ask only what genuinely changes the product, and make the
// answers visibly change it. Business age, inventory experience and "how did you
// find us" were dropped — they help us, not the person filling the form, and a
// setup screen that feels like a survey is one people abandon.
//
// There is no Skip. Every step is answerable instead: "Start empty" and "I'll
// set this up later" are real choices on the last step, not an escape hatch, so
// nobody is trapped and nobody is nagged.

export type OnboardingWorkKind =
  | "watches_jewellery" | "repairs" | "leather" | "art_design"
  | "clothing" | "food" | "ceramics" | "made_to_order" | "other";

export type OnboardingWorkflow = "made_to_order" | "repairs" | "batch" | "mixed";
export type OnboardingTeamSize = "solo" | "2_5" | "6_10" | "10_plus";
export type OnboardingVolume = "" | "under_10" | "10_30" | "31_100" | "100_plus" | "not_sure";

export type OnboardingGoal =
  | "orders_customers" | "production_deadlines" | "repairs_service" | "estimates"
  | "inventory" | "files_notes" | "finance" | "connect_store" | "team" | "other";

export type OnboardingStart =
  | "sample" | "first_order" | "shopify" | "woocommerce" | "spreadsheet" | "empty" | "later";

export type OnboardingAnswers = {
  country: string;
  currency: string;
  /** The workspace's language. Guessed from the browser, changed here rather
   *  than hunted for in Settings after the fact. */
  language: string;
  timeZone: string;
  /** Kept as a list because businessTypeForWorkKinds reads kinds[0] and the
   *  saved answers are read elsewhere; the question itself is now one choice. */
  workKinds: OnboardingWorkKind[];
  workflow: OnboardingWorkflow;
  teamSize: OnboardingTeamSize;
  volume: OnboardingVolume;
  businessAge: OnboardingBusinessAge | "";
  inventoryExperience: OnboardingInventoryExperience | "";
  /** Their own words. Not used to set anything up — asked because knowing what
   *  brought someone is the difference between guessing at marketing and
   *  measuring it, and a list of channels we thought of first would only ever
   *  collect the ones we thought of. */
  heardFrom: string;
  mainGoal: OnboardingGoal | "";
  /** What they typed when the goal is "Something else". Their words, not ours. */
  otherGoal: string;
  extraGoals: OnboardingGoal[];
  start: OnboardingStart | "";
  /** The plan the last step confirmed. Empty until that step is reached. */
  plan: OnboardingTrialPlan | "";
};

export type OnboardingTrialPlan = "lifetime_lite" | "pro_monthly" | "team_monthly";

/**
 * What the answers imply, and what the last step shows as chosen.
 *
 * The same rule the server applies (automaticTrialPlanFor): a workspace that
 * says it has a team gets the plan that covers one, because trialling Pro would
 * hide the very features they came for. Anyone can pick a different one.
 */
export function recommendedTrialPlan(answers: Pick<OnboardingAnswers, "teamSize">): OnboardingTrialPlan {
  return seatsForTeamSize(answers.teamSize) > 1 ? "team_monthly" : "pro_monthly";
}

/** Order matters: this is the order the last step lists them in. */
export const ONBOARDING_TRIAL_PLANS: {
  id: OnboardingTrialPlan;
  title: string;
  /** Amount only. The period is translated and joined at render, because
   *  STRIPE_LIST_PRICE_LABELS spells it "£9 / month" in English and this screen
   *  is read in twelve languages. */
  amount: string;
  summary: string;
}[] = [
  { id: "lifetime_lite", title: "NivaDesk Starter", amount: "£9", summary: "One person, the essentials." },
  { id: "pro_monthly", title: "NivaDesk Pro", amount: "£19", summary: "One studio, everything in it." },
  { id: "team_monthly", title: "NivaDesk Team", amount: "£49", summary: "Shared work, roles and permissions." }
];

export const ONBOARDING_WORK_KINDS: { id: OnboardingWorkKind; label: string }[] = [
  { id: "watches_jewellery", label: "Watches & jewellery" },
  { id: "repairs", label: "Repairs & servicing" },
  { id: "leather", label: "Leather goods" },
  { id: "art_design", label: "Art & custom design" },
  { id: "clothing", label: "Clothing & tailoring" },
  { id: "food", label: "Cakes & food" },
  { id: "ceramics", label: "Ceramics & crafts" },
  { id: "made_to_order", label: "General made-to-order" },
  { id: "other", label: "Other" },
];

export const ONBOARDING_WORKFLOWS: { id: OnboardingWorkflow; label: string; detail: string }[] = [
  { id: "made_to_order", label: "Made to order", detail: "I start work after a customer places an order." },
  { id: "repairs", label: "Repairs and servicing", detail: "Customers send or bring items for work." },
  { id: "batch", label: "Batch production", detail: "I make products in groups and sell them afterwards." },
  { id: "mixed", label: "A mix of these", detail: "My business uses more than one workflow." },
];

export type OnboardingBusinessAge = "starting" | "under_1" | "1_3" | "3_10" | "over_10";
export type OnboardingInventoryExperience = "none" | "some" | "confident" | "no_stock";

export const ONBOARDING_BUSINESS_AGES: { id: OnboardingBusinessAge; label: string }[] = [
  { id: "starting", label: "Just starting out" },
  { id: "under_1", label: "Less than a year" },
  { id: "1_3", label: "1–3 years" },
  { id: "3_10", label: "3–10 years" },
  { id: "over_10", label: "More than 10 years" },
];

export const ONBOARDING_INVENTORY_EXPERIENCE: { id: OnboardingInventoryExperience; label: string }[] = [
  { id: "no_stock", label: "I don't hold stock" },
  { id: "none", label: "New to it" },
  { id: "some", label: "I track some of it" },
  { id: "confident", label: "I track it closely" },
];


export const ONBOARDING_TEAM_SIZES: { id: OnboardingTeamSize; label: string; seats: number }[] = [
  { id: "solo", label: "Just me", seats: 1 },
  { id: "2_5", label: "2–5 people", seats: 5 },
  { id: "6_10", label: "6–10 people", seats: 10 },
  { id: "10_plus", label: "More than 10", seats: 20 },
];

export const ONBOARDING_VOLUMES: { id: OnboardingVolume; label: string }[] = [
  { id: "under_10", label: "Fewer than 10" },
  { id: "10_30", label: "10–30" },
  { id: "31_100", label: "31–100" },
  { id: "100_plus", label: "More than 100" },
  { id: "not_sure", label: "Not sure yet" },
];

// Six shown first, the rest behind "Show more goals" — a wall of ten choices is
// a wall, not a question.
export const ONBOARDING_GOALS: { id: OnboardingGoal; label: string; primary: boolean }[] = [
  { id: "orders_customers", label: "Organise my orders and customers", primary: true },
  { id: "production_deadlines", label: "Plan production and deadlines", primary: true },
  { id: "repairs_service", label: "Track repairs and service work", primary: true },
  { id: "estimates", label: "Send estimates and get approvals", primary: true },
  { id: "inventory", label: "Manage inventory and materials", primary: true },
  { id: "finance", label: "Track income, expenses and profit", primary: true },
  { id: "files_notes", label: "Keep files and notes together", primary: false },
  { id: "connect_store", label: "Connect Shopify or WooCommerce", primary: false },
  { id: "team", label: "Manage work with my team", primary: false },
  { id: "other", label: "Something else", primary: false },
];

/**
 * The accounts a workspace can genuinely connect today.
 *
 * Deliberately only these four: a logo for something we cannot actually connect
 * would cost exactly the trust the grid is here to earn. Pandle is left out
 * until the push side is built.
 *
 * `logo` points at an official brand asset under /brand/integrations. When the
 * file is missing the tile falls back to a wordmark on the brand's own colour,
 * so the grid looks finished either way and improves the moment a real SVG is
 * dropped in.
 */
export type OnboardingIntegration = {
  id: "shopify" | "woocommerce" | "etsy" | "bank" | "chatgpt";
  name: string;
  detail: string;
  href: string;
  logo: string;
  colour: string;
  /** True when the connection can only be started on the provider's side, so
   *  the tile offers directions rather than a button that cannot connect. */
  startsElsewhere?: boolean;
  /** True when there is nowhere to send anyone yet. The tile says so instead of
   *  carrying a button that leads to a dead end. */
  comingSoon?: boolean;
  /** Whether the asset already carries the brand's name. Shopify, Woo and our
   *  own bank glyph do; OpenAI's Blossom is the mark alone, and their
   *  guidelines forbid altering it, so the tile sets the name beside it. */
  logoIncludesName: boolean;
};

/**
 * The NivaDesk listing on the Shopify App Store.
 *
 * A Shopify connection cannot start from this side: the merchant installs the
 * app in their own admin and presses Connect there, and the listing is the one
 * link that takes them straight to it. Leave it empty until the listing is
 * live — every candidate handle 404s while the app is in review, and sending
 * someone to a 404 is the dead end this whole change exists to remove. Empty
 * falls back to the Settings panel, which explains the install in words.
 */
export const SHOPIFY_APP_STORE_URL = "";

export const ONBOARDING_INTEGRATIONS: OnboardingIntegration[] = [
  {
    id: "shopify",
    name: "Shopify",
    detail: "Import your store's orders and customers automatically.",
    // NOT /connect/shopify. That page is the far end of the handshake: it is
    // opened BY the embedded app with ?shop= and a one-time nonce, and cold it
    // can only say so.
    href: SHOPIFY_APP_STORE_URL || "/settings?section=shopify",
    // No listing, no button. Until the app is published there is nowhere to send
    // anyone that is not a 404 or a page telling them to go somewhere else, and
    // "Coming soon" is the true thing to say. Fill SHOPIFY_APP_STORE_URL in and
    // this tile turns into a working Connect on its own.
    comingSoon: !SHOPIFY_APP_STORE_URL,
    logo: "/brand/integrations/shopify.svg",
    colour: "#5E8E3E",
    logoIncludesName: true,
  },
  {
    id: "woocommerce",
    name: "WooCommerce",
    detail: "Import your store's orders and customers automatically.",
    // ?section=integrations opens the hub but not the WooCommerce panel — the
    // provider is only preselected for the four aliases below, so this landed
    // one screen short of the delivery URL the merchant came for.
    href: "/settings?section=woocommerce",
    logo: "/brand/integrations/woocommerce.svg",
    colour: "#7F54B3",
    logoIncludesName: true,
  },
  {
    // No logo file, and that is deliberate: Etsy publishes no downloadable
    // brand asset and their API Terms require their marks to be less
    // prominent than ours. The tile falls back to the name in Etsy's orange,
    // which is the correct outcome rather than a missing file. See
    // public/brand/integrations/README.md.
    id: "etsy",
    name: "Etsy",
    detail: "Import your Etsy orders, with the buyer's personalisation notes.",
    href: "/settings?section=etsy",
    logo: "",
    colour: "#F1641E",
    logoIncludesName: false,
  },
  {
    id: "bank",
    name: "Open Banking",
    detail: "See what you spent and earned beside the work that earned it.",
    href: "/bank",
    logo: "/brand/integrations/openbanking.svg",
    colour: "#0F7B6C",
    logoIncludesName: true,
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    detail: "Ask about your orders, and draft replies, from inside ChatGPT.",
    // NOT ?section=quick-reply. That panel is the AI reply engine — an OpenAI
    // API key for drafting customer replies — which is a different feature that
    // happens to share a company name. The ChatGPT app is an OAuth connection
    // that only ChatGPT can start, so the tile goes to the page that says how.
    href: "/chatgpt",
    startsElsewhere: true,
    logo: "/brand/integrations/chatgpt.svg",
    colour: "#10A37F",
    logoIncludesName: false,
  },
];

/**
 * One row, and it is the honest one.
 *
 * There were five. Not one of them did anything: onboardingStartChoice is
 * written by all three platforms and read by none, so "Create my first order"
 * created no order, "Explore a sample workspace" had no sample data anywhere in
 * the repo to explore, and "Import a spreadsheet" had no importer to open. Four
 * promises the product could not keep, on the screen where someone decides
 * whether to trust it.
 *
 * The type still admits the old ids because workspaces already carry them.
 */
export const ONBOARDING_STARTS: { id: OnboardingStart; label: string; detail: string }[] = [
  { id: "later", label: "I'll set this up later", detail: "Go straight to your workspace." },
];

/** The starting tasks each goal turns into. The report's point: the answers have
 *  to visibly change the product, or the question was just a survey. */
export const ONBOARDING_GOAL_TASKS: Record<OnboardingGoal, string[]> = {
  orders_customers: ["Create your first order", "Add a customer", "Customise your order cards"],
  production_deadlines: ["Choose your production stages", "Add a start and delivery date", "Open Schedule"],
  repairs_service: ["Open a repair intake", "Record what the customer brought in", "Set a promised date"],
  estimates: ["Send your first estimate", "Turn an approval into an order", "Set your estimate wording"],
  inventory: ["Add your first inventory item", "Create a location", "Reserve an item for an order"],
  files_notes: ["Upload a file to an order", "Write your first note", "Open the Files library"],
  finance: ["Record a payment", "Set your tax rule", "Open the finance dashboard"],
  connect_store: ["Connect your store", "Review imported orders", "Confirm customer matching"],
  team: ["Invite a team member", "Set their permissions", "Assign the first task"],
  other: ["Create your first order", "Add a customer", "Open your dashboard"],
};

/**
 * What each card is CALLED, per trade.
 *
 * The preset engine already decides which cards appear and what fields and
 * steps they hold. This is the missing half: a jeweller's materials card is
 * "Metals & Stones", a baker's is "Ingredients", and a repair shop's is "Parts
 * Used". Same card, same data — the workshop's own word for it.
 *
 * Only cards whose vocabulary genuinely differs are listed. "Customer",
 * "Notes" and "Status" mean the same thing in every trade and are left alone,
 * because renaming for the sake of it just makes the app harder to support.
 *
 * Keys are the card ids in functions/index.js ORDER_DETAIL_CARD_IDS.
 */
export const ONBOARDING_CARD_LABELS: Partial<Record<OnboardingWorkKind, Record<string, string>>> = {
  watches_jewellery: {
    preview: "Design Preview",
    materials: "Metals & Stones",
    workTime: "Bench Time",
    summary: "Piece Summary",
  },
  repairs: {
    preview: "Item Photos",
    materials: "Parts Used",
    workTime: "Bench Time",
    summary: "Repair Summary",
    delivery: "Collection",
  },
  leather: {
    preview: "Design Preview",
    materials: "Leather & Hardware",
    workTime: "Bench Time",
    summary: "Piece Summary",
  },
  art_design: {
    preview: "Artwork Preview",
    materials: "Media & Supplies",
    workTime: "Studio Time",
    summary: "Commission Summary",
  },
  clothing: {
    preview: "Garment Photos",
    materials: "Fabric & Trims",
    workTime: "Machine Time",
    summary: "Garment Summary",
    delivery: "Fitting & Collection",
  },
  food: {
    preview: "Design Reference",
    materials: "Ingredients",
    workTime: "Kitchen Time",
    summary: "Order Summary",
    delivery: "Delivery / Pickup",
  },
  ceramics: {
    preview: "Piece Photos",
    materials: "Clay & Glazes",
    workTime: "Studio Time",
    summary: "Piece Summary",
  },
};

/** The chosen trades, folded into one map. The first pick wins where two
 *  trades disagree, so a jeweller who also repairs keeps jeweller wording and
 *  gains "Collection" from repairs rather than losing it. */
export function cardLabelsForWorkKinds(kinds: OnboardingWorkKind[]): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const kind of kinds) {
    const labels = ONBOARDING_CARD_LABELS[kind];
    if (!labels) continue;
    for (const [cardId, label] of Object.entries(labels)) {
      if (!merged[cardId]) merged[cardId] = label;
    }
  }
  return merged;
}

/** The preset engine keys off a business-type phrase, so the chosen work kinds
 *  are turned back into the vocabulary it already understands. */
export function businessTypeForWorkKinds(kinds: OnboardingWorkKind[]): string {
  const first = kinds[0];
  switch (first) {
    case "watches_jewellery": return "Jewellery Studio";
    case "repairs": return "Repair Service";
    case "leather": return "Handmade Products";
    case "art_design": return "Custom Art Studio";
    case "clothing": return "Tailor / Alteration Studio";
    case "food": return "Food / Bakery / Catering";
    case "ceramics": return "Handmade Products";
    case "made_to_order": return "General Small Business";
    default: return "General Small Business";
  }
}

/** How a workshop works decides what its board's lanes are called. A repair
 *  shop does not have a "Ready to Ship" column; it has a collection counter. */
export function productionStagesForWorkflow(workflow: OnboardingWorkflow): ProductionStage[] {
  if (workflow === "repairs") {
    return [
      { id: "intake", title: "Intake", kind: "ready", wipLimit: 10 },
      { id: "in_repair", title: "In Repair", kind: "active", wipLimit: 10 },
      { id: "waiting_parts", title: "Waiting / Blocked", kind: "blocked", wipLimit: 10 },
      { id: "testing", title: "Testing", kind: "review", wipLimit: 10 },
      { id: "ready_for_collection", title: "Ready for Collection", kind: "shipready", wipLimit: 10 },
      { id: "done", title: "Done", kind: "done", wipLimit: 0 },
    ];
  }
  if (workflow === "batch") {
    return [
      { id: "planned", title: "Planned", kind: "ready", wipLimit: 10 },
      { id: "in_production", title: "In Production", kind: "active", wipLimit: 10 },
      { id: "blocked", title: "Waiting / Blocked", kind: "blocked", wipLimit: 10 },
      { id: "quality_check", title: "Quality Check", kind: "review", wipLimit: 10 },
      { id: "ready_to_ship", title: "Ready to Ship", kind: "shipready", wipLimit: 10 },
      { id: "done", title: "Done", kind: "done", wipLimit: 0 },
    ];
  }
  return DEFAULT_PRODUCTION_STAGES.map(stage => ({ ...stage }));
}

export function seatsForTeamSize(size: OnboardingTeamSize) {
  return ONBOARDING_TEAM_SIZES.find(entry => entry.id === size)?.seats ?? 1;
}

/**
 * Saves the wizard's answers, and the things they change.
 *
 * Two documents on purpose: the workspace SETTINGS carry everything that shapes
 * screens, while the team size goes on the COMPANY, because that is where the
 * trial engine reads it to decide whether the fortnight should be Pro or Team.
 */
export async function saveOnboardingAnswers(
  companyId: string,
  userId: string,
  answers: OnboardingAnswers,
  presetPayload: Record<string, unknown>
) {
  const goals = [answers.mainGoal, ...answers.extraGoals].filter(Boolean);
  await withWebSyncStatus(async () => {
    await setDoc(doc(db, "companySettings", companyId), {
      ...presetPayload,
      selectedCountry: answers.country,
      selectedCurrency: answers.currency,
      selectedLanguage: answers.language,
      selectedTimeZone: answers.timeZone,
      onboardingWorkKinds: answers.workKinds,
      onboardingWorkflow: answers.workflow,
      onboardingTeamSizeBand: answers.teamSize,
      onboardingOrderVolume: answers.volume,
      onboardingBusinessAge: answers.businessAge,
      onboardingInventoryExperience: answers.inventoryExperience,
      onboardingHeardFrom: answers.heardFrom.trim().slice(0, 200),
      onboardingGoals: goals,
      onboardingMainGoal: answers.mainGoal,
      onboardingOtherGoal: answers.otherGoal.trim().slice(0, 200),
      onboardingStartChoice: answers.start,
      productionStages: productionStagesForWorkflow(answers.workflow),
      // The workshop's own word for each card. Read by all four platforms when
      // they draw an order-detail heading.
      orderCardLabels: cardLabelsForWorkKinds(answers.workKinds),
      businessOnboardingCompleted: true,
      businessOnboardingCompletedAt: serverTimestamp(),
      businessOnboardingCompletedAction: "wizard",
      businessOnboardingCompletedBy: userId,
    }, { merge: true });

    await setDoc(doc(db, "companies", companyId), {
      onboardingTeamSize: seatsForTeamSize(answers.teamSize),
    }, { merge: true });

    // The trial starts at sign-up, before this answer exists, so it starts on
    // Pro. Now that we know there is a team, ask the server to raise it — the
    // client cannot write billing fields, and the end date must not move.
    // A failure here is not worth losing the answers over: the workspace simply
    // keeps trialling Pro.
    // The trial started at sign-up on Pro, before any of this was known. Put it
    // on the plan the last step confirmed. The client cannot write billing
    // fields and the end date must not move, so the server does it.
    // A failure here is not worth losing the answers over: the workspace simply
    // keeps trialling Pro.
    const chosenPlan = answers.plan || recommendedTrialPlan(answers);
    try {
      await httpsCallable(functions, "setTrialPlan")({ plan: chosenPlan });
    } catch (error) {
      console.warn("setTrialPlan failed", error);
    }
  }, "Saving your workspace setup.");
}
