// Messaging access (contract: docs/messaging-access-contract-2026-10-08.md).
//
// Two member-access keys, two surfaces:
//   `messages` → the CUSTOMER inbox (/inbox: WhatsApp, Instagram) and its
//                 notifications;
//   `teamChat` → TEAM messages (/messages: team thread, DMs, groups) and
//                 their notifications.
// Both default to allowed; only an explicit `false` closes a surface. These
// helpers are pure (no imports) so scripts/check-messaging-access.mjs can run
// them in plain Node; the nav, the tabs and the message bubbles all read them.

export type MessagingAccessLike = {
  messages?: boolean;
  teamChat?: boolean;
} | null | undefined;

export type MessagingAccess = { customers: boolean; team: boolean };

/** Which of the two messaging surfaces this access opens. */
export function messagingAccessFrom(access: MessagingAccessLike): MessagingAccess {
  return {
    customers: access?.messages !== false,
    team: access?.teamChat !== false
  };
}

/** The sidebar "Messages" item: hidden when neither surface is allowed, else
 *  it opens the customer inbox when allowed, otherwise the team messages. */
export function messagesNavHref(access: MessagingAccessLike): "/inbox" | "/messages" | null {
  const allowed = messagingAccessFrom(access);
  if (allowed.customers) return "/inbox";
  if (allowed.team) return "/messages";
  return null;
}

/** Where a page redirects when its own surface is closed: the other surface
 *  when that one is open, otherwise the dashboard. */
export function messagingRedirectFor(surface: "customers" | "team", access: MessagingAccessLike): string {
  const allowed = messagingAccessFrom(access);
  if (surface === "customers" && allowed.team) return "/messages";
  if (surface === "team" && allowed.customers) return "/inbox";
  return "/dashboard";
}

/** Deleting a team message (team thread, DM or group): the workspace owner
 *  deletes any message, everyone else only their own. Mirrors the server's
 *  `deleteThreadMessage` (owner any / author own / else permission-denied). */
export function canDeleteTeamMessage(input: {
  viewerUid: string;
  viewerIsOwner: boolean;
  senderUid: string;
  deleted?: boolean;
}): boolean {
  if (input.deleted === true) return false;
  if (input.viewerIsOwner) return true;
  const viewer = input.viewerUid.trim();
  return viewer.length > 0 && viewer === input.senderUid.trim();
}
