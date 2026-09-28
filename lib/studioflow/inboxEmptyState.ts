/**
 * The sentence an empty customer conversation list shows, as a key for t().
 *
 * An empty list means different things, and the wrong sentence misleads. After
 * every conversation was marked done (27 Sep 2026, live), the Open list said
 * "No customer messages yet." above a workspace that had messages. So:
 *   - a narrowed list (a search, a label, unread only, someone's, or the Closed
 *     list) says the filters left everything out;
 *   - "All conversations" empty means there is none at all;
 *   - "Open conversations" empty says there is no OPEN conversation. It says
 *     "No customer messages yet." only when the page has checked that there is
 *     none in any status (`anyConversation === false`). An unknown answer keeps
 *     the sentence that is true either way.
 *
 * The page's translation check (scripts/check-inbox-translations.mjs) reads the
 * sentences returned here, so each has all eleven translations.
 */
export type InboxEmptyFilters = {
  status?: "open" | "closed" | "all";
  assignee?: string;
  label?: string;
  query?: string;
  unreadOnly?: boolean;
};

export function inboxEmptySentence(filters: InboxEmptyFilters, anyConversation: boolean | null): string {
  const narrowed = Boolean(
    filters.query || filters.label || filters.unreadOnly || (filters.assignee && filters.assignee !== "anyone") || filters.status === "closed"
  );
  if (narrowed) return "No conversations match these filters.";
  if (filters.status === "all") return "No customer messages yet.";
  // One plain string return per sentence: the translation check reads those, and a ternary would slip past it.
  if (anyConversation === false) return "No customer messages yet.";
  return "No open conversations.";
}

/** Whether the list shows the default view (open, anyone's, unfiltered): the one an empty answer is checked for. */
export function isDefaultInboxView(filters: InboxEmptyFilters): boolean {
  return filters.status === "open" && (filters.assignee || "anyone") === "anyone" && !filters.label && !filters.query && !filters.unreadOnly;
}
