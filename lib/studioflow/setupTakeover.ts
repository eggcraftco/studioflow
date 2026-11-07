// When the setup wizard may take over the whole screen on its own (§113), and what the app shell must know
// before it does.
//
// Owner report, 7 Nov 2026 00:25Z (live web 6d2036272): signing out of one account (2 orders) and into
// EGGcraft (87 orders) in the same tab opened the full-screen wizard over the working workspace; a reload
// made it go away. Its first step pre-fills country, currency, language and time zone, and Continue would
// have written them over the workspace's own.
//
// Reproduced on the local emulator: right after a sign-in the browser's Firestore copy has been wiped
// (signOutSession.ts), the home page has already read the workspace and its settings, and only the order
// list is still on its way. If the Firestore client is offline at that moment — the SDK decides that by
// itself when a (re)started connection stays silent for 10 seconds or fails, and it restarts the connection
// on every sign-in token or App Check token change — getDocs does NOT fail: it answers from the local copy,
// which holds none of this workspace's orders. The shell took that empty answer as "loaded, 0 orders".
// A failed load was counted the same way (the cached list it fell back to had never been counted for this
// account and workspace), and so was the empty list given to a member who may not read the orders at all.
//
// The rule here: the wizard opens on its own only on a COUNTED zero —
//   * the server answered (not this browser's offline copy),
//   * for the whole workspace (not an assigned-only view, which is a different, smaller set),
//   * for a member allowed to read it,
//   * for the account and workspace on screen now.
// Anything less is "not known", and not known never takes over the screen. A positive count is evidence of
// work from wherever it comes, so the Continue setup card may use a count from the local copy.

export type WorkspaceOrderCount = {
  /** The account the count was made for. */
  uid: string;
  /** The workspace the count was made for. */
  companyId: string;
  /** Orders in the answer, Trash included: a workspace with orders in Trash is not a new one. */
  count: number;
  /** True only for a server answer over the whole workspace, read by a member allowed to read it. */
  confirmed: boolean;
};

export type OrderCountSource = {
  uid: string;
  companyId: string;
  count: number;
  /** The answer came from the server, not from this browser's local copy. */
  fromServer: boolean;
  /** The query covered every order of the workspace (not only the ones assigned to this member). */
  wholeWorkspace: boolean;
  /** The member may read the workspace's orders and their finance (the shell's finance read was made). */
  allowed: boolean;
};

const clean = (value: unknown) => String(value ?? "").trim();

/** The count as evidence, stamped with the account and workspace it belongs to. Null when either is unknown. */
export function workspaceOrderCount(source: OrderCountSource): WorkspaceOrderCount | null {
  const uid = clean(source.uid);
  const companyId = clean(source.companyId);
  const count = Number(source.count);
  if (!uid || !companyId || !Number.isInteger(count) || count < 0) return null;
  return {
    uid,
    companyId,
    count,
    confirmed: source.fromServer === true && source.wholeWorkspace === true && source.allowed === true
  };
}

/** The count, only if it was made for this account and this workspace. */
export function orderCountFor(
  orderCount: WorkspaceOrderCount | null | undefined,
  uid: string | null | undefined,
  companyId: string | null | undefined
): WorkspaceOrderCount | null {
  if (!orderCount) return null;
  const forUid = clean(uid);
  const forCompany = clean(companyId);
  if (!forUid || !forCompany) return null;
  return orderCount.uid === forUid && orderCount.companyId === forCompany ? orderCount : null;
}

export type SetupTakeoverInput = {
  /** Setup has not been finished (or skipped) and this member may run it. */
  setupIncomplete: boolean;
  /** This tab was sent somewhere on purpose (Connect tab, provider return): never cover it. */
  passthrough: boolean;
  uid: string | null | undefined;
  companyId: string | null | undefined;
  orderCount: WorkspaceOrderCount | null | undefined;
};

/** The wizard covers the screen by itself only for a workspace counted empty, for the account and workspace on screen. */
export function setupTakesOverAutomatically(input: SetupTakeoverInput): boolean {
  if (!input.setupIncomplete || input.passthrough) return false;
  const counted = orderCountFor(input.orderCount, input.uid, input.companyId);
  return Boolean(counted && counted.confirmed && counted.count === 0);
}

/** The Continue setup card: unfinished setup in a workspace that has work in it (any count above zero is proof). */
export function continueSetupCardShows(input: SetupTakeoverInput & { wizardOnScreen: boolean }): boolean {
  if (!input.setupIncomplete || input.passthrough || input.wizardOnScreen) return false;
  const counted = orderCountFor(input.orderCount, input.uid, input.companyId);
  return Boolean(counted && counted.count > 0);
}

/** A counted zero for this account and workspace: the "new workspace" surfaces (first-project guide) may trust it. */
export function workspaceCountedEmpty(
  orderCount: WorkspaceOrderCount | null | undefined,
  uid: string | null | undefined,
  companyId: string | null | undefined
): boolean {
  const counted = orderCountFor(orderCount, uid, companyId);
  return Boolean(counted && counted.confirmed && counted.count === 0);
}
