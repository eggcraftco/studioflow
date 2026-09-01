import type { CardIcon } from "@/components/CardTitle";
import {
  workspaceAccessAllows,
  type WorkspaceContext,
  type WorkspaceMemberAccessKey,
} from "@/lib/studioflow/firestore";

/**
 * The Home screen's card model, shared by web, Mac/iPhone and Android.
 *
 * Home is a reporting, alerting and quick-action layer — NOT a smaller copy of
 * Orders, Banking, Inventory, Schedule or Files. Every card answers one of the
 * three questions the screen exists for (what needs attention, what is next,
 * where do I go for the detail) and then hands off to the full screen.
 *
 * The registry is the single source of truth for what a card is: which sizes it
 * supports, what it defaults to, who is allowed to see it, and where its one
 * link goes. Rendering lives with each platform; this does not.
 */

export type HomeCardId =
  | "gettingStarted"
  | "quickActions"
  | "recentActivity"
  | "money"
  | "banking"
  | "inventory"
  | "customers"
  | "ordersProduction"
  | "schedule"
  | "files"
  | "notes";

/** 1×1 is a single square, 2×1 spans two columns, 2×2 spans two by two. */
export type HomeCardSize = "1x1" | "2x1" | "2x2";

export const HOME_CARD_SIZES: HomeCardSize[] = ["1x1", "2x1", "2x2"];

export function homeCardColumns(size: HomeCardSize) {
  return size === "1x1" ? 1 : 2;
}

export function homeCardRows(size: HomeCardSize) {
  return size === "2x2" ? 2 : 1;
}

export type HomeCardDefinition = {
  id: HomeCardId;
  /** English title. Runs through t() at render, and the owner may rename it. */
  title: string;
  icon: CardIcon;
  /** "ring" is the default anchor. "filled" is a solid badge with the glyph
   *  knocked out of the colour. "tinted" is a wash of the colour behind a glyph
   *  drawn in it — what the 2x1 sheet gives Banking, in place of the solid
   *  badge an earlier sheet showed. Badge is per card, not per size, so this
   *  moves Banking at all three. */
  badge?: "ring" | "filled" | "tinted";
  /** The card's own identity colour on its badge, where the sheet gives it one.
   *  Not the same thing as `placement.tone`, which is the owner's choice for
   *  the whole card and still wins when they make one. */
  badgeTone?: "amber";
  sizes: HomeCardSize[];
  defaultSize: HomeCardSize;
  /**
   * Navigation permission this card needs. A member without it never sees the
   * card — §18 says a denied card explains itself or hides, never breaks.
   */
  access?: WorkspaceMemberAccessKey;
  /** Owner-only cards: money and banking are workspace finances. */
  financeOnly?: boolean;
  /** The card reports a total, so its header offers the range that total covers. */
  periods?: boolean;
  /** Where the card's single footer link goes. Deep links, filters pre-applied. */
  href: string;
  /** The footer link's English label. */
  linkLabel: string;
};

/**
 * Order here is the card gallery's order, not the layout's — the default
 * layout below decides where they start.
 */
export const HOME_CARDS: HomeCardDefinition[] = [
  {
    id: "gettingStarted",
    title: "Getting started",
    icon: "checklist",
    sizes: ["1x1", "2x1", "2x2"],
    defaultSize: "2x1",
    href: "/settings",
    linkLabel: "View checklist",
  },
  {
    id: "quickActions",
    title: "Quick actions",
    // A bolt, as Mac and Android already draw it. Web was the only one showing
    // a checklist, which is a different promise: a list you work through
    // rather than four things you fire off.
    icon: "bolt",
    sizes: ["1x1", "2x1", "2x2"],
    defaultSize: "1x1",
    href: "/orders",
    linkLabel: "Open Orders",
  },
  {
    id: "recentActivity",
    title: "Recent activity",
    icon: "historyClock",
    sizes: ["1x1", "2x1", "2x2"],
    defaultSize: "1x1",
    href: "/orders",
    linkLabel: "View all activity",
  },
  {
    id: "money",
    title: "Money",
    icon: "finance",
    sizes: ["1x1", "2x1", "2x2"],
    defaultSize: "1x1",
    access: "dashboard",
    financeOnly: true,
    periods: true,
    href: "/dashboard",
    linkLabel: "Open Dashboard",
  },
  {
    id: "banking",
    title: "Banking",
    // `plan` drew a rectangle with a rule through it, which reads as a window
    // or a payment card. The sheet draws the thing itself.
    icon: "bank",
    badge: "tinted",
    sizes: ["1x1", "2x1", "2x2"],
    defaultSize: "1x1",
    access: "bankFeed",
    financeOnly: true,
    periods: true,
    href: "/bank",
    linkLabel: "Go to banking",
  },
  {
    id: "inventory",
    title: "Inventory",
    icon: "shippingBox",
    sizes: ["1x1", "2x1", "2x2"],
    defaultSize: "1x1",
    href: "/inventory",
    linkLabel: "View inventory",
  },
  {
    id: "customers",
    title: "Customers",
    icon: "customer",
    sizes: ["1x1", "2x1", "2x2"],
    defaultSize: "1x1",
    access: "customers",
    href: "/customers",
    linkLabel: "View customers",
  },
  {
    id: "ordersProduction",
    title: "Orders & production",
    icon: "orders",
    sizes: ["1x1", "2x1", "2x2"],
    defaultSize: "2x1",
    access: "orders",
    href: "/production",
    linkLabel: "View all orders",
  },
  {
    id: "schedule",
    title: "Schedule",
    icon: "calendar",
    sizes: ["1x1", "2x1", "2x2"],
    defaultSize: "2x1",
    access: "schedule",
    href: "/schedule",
    linkLabel: "Open Schedule",
  },
  {
    id: "files",
    // Not "Files": that key is the navigation item and reads as "choose from
    // files" in several languages. This card is the library itself.
    title: "File library",
    icon: "files",
    sizes: ["1x1", "2x1", "2x2"],
    defaultSize: "2x1",
    access: "clientFiles",
    href: "/files",
    linkLabel: "Open Files",
  },
  {
    id: "notes",
    title: "Notes",
    icon: "noteCompose",
    badgeTone: "amber",
    sizes: ["1x1", "2x1", "2x2"],
    defaultSize: "2x1",
    access: "notes",
    href: "/notes",
    linkLabel: "Open Notes",
  },
];

export function homeCardById(id: HomeCardId) {
  return HOME_CARDS.find((card) => card.id === id);
}

/** A card's colour theme. Colour never carries meaning on its own (§20). */
export type HomeCardTone = "default" | "blue" | "green" | "amber" | "purple" | "rose";

/**
 * How far back a card counts. Only the cards that report money offer it — the
 * sheet puts the control in their header, because "£27,858.06" means nothing
 * until you know whether that is this month or since the workspace opened.
 */
export const HOME_CARD_PERIODS = ["month", "year", "all"] as const;
export type HomeCardPeriod = (typeof HOME_CARD_PERIODS)[number];

export const HOME_PERIOD_LABELS: Record<HomeCardPeriod, string> = {
  month: "This month",
  year: "This year",
  all: "All time",
};

/**
 * The window a period covers. Same rule the Dashboard applies — from the start
 * of the month or the year to the end of today, against the order's payment
 * date — because two definitions of "this month" is one too many.
 */
export function homePeriodRange(period: HomeCardPeriod): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  if (period === "month") return { start: new Date(now.getFullYear(), now.getMonth(), 1), end };
  if (period === "year") return { start: new Date(now.getFullYear(), 0, 1), end };
  return { start: new Date(0), end };
}

export type HomeCardPlacement = {
  id: HomeCardId;
  size: HomeCardSize;
  /** Owner's own wording for the heading; empty means the registry title. */
  heading?: string;
  tone?: HomeCardTone;
  /** Only meaningful on a card whose definition sets `periods`. */
  period?: HomeCardPeriod;
};

/**
 * Versioned, because a stored layout outlives the code that wrote it. A layout
 * from an older version is migrated rather than thrown away; an unreadable one
 * falls back to the default rather than leaving Home blank.
 */
export const HOME_LAYOUT_VERSION = 1;

export type HomeLayout = {
  version: number;
  cards: HomeCardPlacement[];
  /** Cards the owner has hidden. They stay listed in the gallery. */
  hidden: HomeCardId[];
};

/**
 * §3's suggested starting layout, in reading order across a four-column grid:
 *
 *   Getting started 2×1 · Quick actions 1×1 · Recent activity 1×1
 *   Money 1×1 · Banking 1×1 · Inventory 1×1 · Customers 1×1
 *   Orders & production 2×1 · Schedule 2×1
 *   Files 2×1 · Notes 2×1
 */
export const DEFAULT_HOME_LAYOUT: HomeLayout = {
  version: HOME_LAYOUT_VERSION,
  cards: [
    { id: "gettingStarted", size: "2x1" },
    { id: "quickActions", size: "1x1" },
    { id: "recentActivity", size: "1x1" },
    { id: "money", size: "1x1" },
    { id: "banking", size: "1x1" },
    { id: "inventory", size: "1x1" },
    { id: "customers", size: "1x1" },
    { id: "ordersProduction", size: "2x1" },
    { id: "schedule", size: "2x1" },
    { id: "files", size: "2x1" },
    { id: "notes", size: "2x1" },
  ],
  hidden: [],
};

export function defaultHomeLayout(): HomeLayout {
  return {
    version: HOME_LAYOUT_VERSION,
    cards: DEFAULT_HOME_LAYOUT.cards.map((card) => ({ ...card })),
    hidden: [],
  };
}

/**
 * Reads a stored layout back into something safe to render.
 *
 * Anything unrecognised is dropped rather than trusted: a card id that no
 * longer exists, a size a card does not support, a duplicate placement. Cards
 * added to the registry since the layout was saved are appended at their
 * default size, so a new card appears instead of silently never showing up.
 */
export function normaliseHomeLayout(raw: unknown): HomeLayout {
  const source = (raw && typeof raw === "object" ? raw : {}) as Partial<HomeLayout>;
  const seen = new Set<HomeCardId>();
  const cards: HomeCardPlacement[] = [];

  for (const entry of Array.isArray(source.cards) ? source.cards : []) {
    if (!entry || typeof entry !== "object") continue;
    const id = (entry as HomeCardPlacement).id;
    const definition = homeCardById(id);
    if (!definition || seen.has(id)) continue;
    seen.add(id);
    const requested = (entry as HomeCardPlacement).size;
    cards.push({
      id,
      size: definition.sizes.includes(requested) ? requested : definition.defaultSize,
      heading: typeof (entry as HomeCardPlacement).heading === "string"
        ? (entry as HomeCardPlacement).heading!.slice(0, 40)
        : undefined,
      tone: (entry as HomeCardPlacement).tone,
      period: HOME_CARD_PERIODS.includes((entry as HomeCardPlacement).period as HomeCardPeriod)
        ? (entry as HomeCardPlacement).period
        : undefined,
    });
  }

  const hidden = (Array.isArray(source.hidden) ? source.hidden : [])
    .filter((id): id is HomeCardId => Boolean(homeCardById(id as HomeCardId)));

  // A card the registry gained since this layout was written.
  for (const definition of HOME_CARDS) {
    if (seen.has(definition.id) || hidden.includes(definition.id)) continue;
    cards.push({ id: definition.id, size: definition.defaultSize });
  }

  if (cards.length === 0) return defaultHomeLayout();
  return { version: HOME_LAYOUT_VERSION, cards, hidden };
}

/**
 * Whether this member may see a card at all.
 *
 * Finance cards are the workspace's money, so they are owner-or-permitted only:
 * a member whose role cannot see financial info must not read the net profit off
 * the Home screen instead.
 */
export function canSeeHomeCard(
  card: HomeCardDefinition,
  workspace: WorkspaceContext | null,
): boolean {
  if (!workspace) return false;
  if (card.access && !workspaceAccessAllows(workspace.memberAccess, card.access)) return false;
  if (card.financeOnly && !workspaceAccessAllows(workspace.memberAccess, "financialInfo")) return false;
  return true;
}

/** The cards actually placed on this member's Home, in layout order. */
export function visibleHomeCards(layout: HomeLayout, workspace: WorkspaceContext | null) {
  return layout.cards
    .filter((placement) => !layout.hidden.includes(placement.id))
    .map((placement) => ({ placement, definition: homeCardById(placement.id)! }))
    .filter(({ definition }) => definition && canSeeHomeCard(definition, workspace));
}

/** The gallery: everything this member could add that is not currently placed. */
export function availableHomeCards(layout: HomeLayout, workspace: WorkspaceContext | null) {
  const placed = new Set(
    layout.cards.filter((card) => !layout.hidden.includes(card.id)).map((card) => card.id),
  );
  return HOME_CARDS.filter(
    (definition) => !placed.has(definition.id) && canSeeHomeCard(definition, workspace),
  );
}

export function moveHomeCard(layout: HomeLayout, from: number, to: number): HomeLayout {
  if (from === to || from < 0 || to < 0 || from >= layout.cards.length || to >= layout.cards.length) {
    return layout;
  }
  const cards = layout.cards.slice();
  const [moved] = cards.splice(from, 1);
  cards.splice(to, 0, moved);
  return { ...layout, cards };
}

export function resizeHomeCard(layout: HomeLayout, id: HomeCardId, size: HomeCardSize): HomeLayout {
  const definition = homeCardById(id);
  if (!definition || !definition.sizes.includes(size)) return layout;
  return {
    ...layout,
    cards: layout.cards.map((card) => (card.id === id ? { ...card, size } : card)),
  };
}

export function hideHomeCard(layout: HomeLayout, id: HomeCardId): HomeLayout {
  if (layout.hidden.includes(id)) return layout;
  return {
    ...layout,
    cards: layout.cards.filter((card) => card.id !== id),
    hidden: [...layout.hidden, id],
  };
}

export function showHomeCard(layout: HomeLayout, id: HomeCardId): HomeLayout {
  const definition = homeCardById(id);
  if (!definition) return layout;
  return {
    version: HOME_LAYOUT_VERSION,
    hidden: layout.hidden.filter((hiddenId) => hiddenId !== id),
    cards: layout.cards.some((card) => card.id === id)
      ? layout.cards
      : [...layout.cards, { id, size: definition.defaultSize }],
  };
}

export function setHomeCardHeading(layout: HomeLayout, id: HomeCardId, heading: string): HomeLayout {
  const clean = heading.trim().slice(0, 40);
  return {
    ...layout,
    cards: layout.cards.map((card) =>
      card.id === id ? { ...card, heading: clean || undefined } : card,
    ),
  };
}

export function setHomeCardPeriod(layout: HomeLayout, id: HomeCardId, period: HomeCardPeriod): HomeLayout {
  return {
    ...layout,
    cards: layout.cards.map((card) => (card.id === id ? { ...card, period } : card)),
  };
}

export function setHomeCardTone(layout: HomeLayout, id: HomeCardId, tone: HomeCardTone): HomeLayout {
  return {
    ...layout,
    cards: layout.cards.map((card) =>
      card.id === id ? { ...card, tone: tone === "default" ? undefined : tone } : card,
    ),
  };
}

/** One card back to its registry defaults, without touching the rest. */
export function resetHomeCard(layout: HomeLayout, id: HomeCardId): HomeLayout {
  const definition = homeCardById(id);
  if (!definition) return layout;
  return {
    ...layout,
    cards: layout.cards.map((card) =>
      card.id === id ? { id, size: definition.defaultSize } : card,
    ),
  };
}
