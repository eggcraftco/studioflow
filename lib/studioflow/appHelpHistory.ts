import type { AppAssistantAnswer } from "@/lib/studioflow/appAssistant";

// The help assistant's conversation, kept in this browser (owner, 1 Nov 2026: "ekranı kapatıp açınca o sorduğum
// bottaki ekran gidiyor … sonradan ne konuştuk diye bakamıyorsun"). The turns lived in AppHelpAssistant's useState,
// and AppShell is mounted by each page, so a reload, a sign-in refresh or moving to another page started an empty
// panel. The iPhone/iPad/Mac and Android apps keep it the same way (EGGcraft/AppHelpHistory.swift,
// features/help/AppHelpHistory.kt):
// - one conversation per signed-in account and workspace, the last 30 turns of the last 7 days;
// - only in this browser (localStorage), under a hash of the account and workspace, never the ids themselves;
// - "New conversation" starts over, and every sign-out deletes them all (deviceLocalCache.ts).
// Nothing goes to NivaDesk that the question itself did not already send.

export type AppHelpTurn = {
  id: string;
  /** When it was asked, in ms. */
  askedAt: number;
  question: string;
  answer: AppAssistantAnswer;
  /** "" not sent, "sending", "sent", or the error to show. */
  ticket?: string;
};

export const APP_HELP_KEEP_DAYS = 7;
export const APP_HELP_KEEP_TURNS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_PREFIX = "nv_help_history:";
/** Whether the panel was open in this tab, so a reload or the next page opens it again. */
const OPEN_KEY = "nv_help_open";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

function localStore(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function sessionStore(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** The turns still kept at `now`: asked in the last 7 days, the newest 30, oldest first. */
export function keptAppHelpTurns(turns: AppHelpTurn[], now = Date.now()): AppHelpTurn[] {
  const window = APP_HELP_KEEP_DAYS * DAY_MS;
  return turns
    .filter(turn => now - turn.askedAt < window && turn.askedAt - now <= DAY_MS)
    .sort((a, b) => a.askedAt - b.askedAt)
    .slice(-APP_HELP_KEEP_TURNS);
}

/**
 * One conversation per account and workspace; null when either is unknown (nothing is kept then). The first 16
 * bytes of sha256("uid|companyId") as hex, the same name the native apps use, so the storage key never carries an
 * account id. Null too where the browser offers no hashing (not a secure page).
 */
export async function appHelpHistoryKey(userId: string, companyId: string): Promise<string | null> {
  const u = userId.trim();
  const c = companyId.trim();
  if (!u || !c) return null;
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return null;
    const digest = new Uint8Array(await subtle.digest("SHA-256", new TextEncoder().encode(`${u}|${c}`)));
    return Array.from(digest.slice(0, 16), byte => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

function readTurn(value: unknown): AppHelpTurn | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const answer = raw.answer && typeof raw.answer === "object" ? raw.answer as Record<string, unknown> : null;
  if (typeof raw.id !== "string" || typeof raw.question !== "string" || !raw.question.trim()) return null;
  if (typeof raw.askedAt !== "number" || !Number.isFinite(raw.askedAt) || !answer || typeof answer.answer !== "string") return null;
  const sources = Array.isArray(answer.sources)
    ? answer.sources.filter((source): source is { id: string; path: string } =>
      Boolean(source) && typeof (source as { id?: unknown }).id === "string" && typeof (source as { path?: unknown }).path === "string")
      .map(source => ({ id: source.id, path: source.path }))
    : [];
  return {
    id: raw.id,
    askedAt: raw.askedAt,
    question: raw.question,
    answer: {
      answer: answer.answer,
      needsChatGPT: answer.needsChatGPT === true,
      needsSupport: answer.needsSupport === true,
      sources,
      ...(answer.depth === "full" || answer.depth === "short" ? { depth: answer.depth } : {})
    },
    // A ticket still being sent when the page went away was never confirmed: it is offered again.
    ticket: typeof raw.ticket === "string" && raw.ticket !== "sending" ? raw.ticket : ""
  };
}

export function loadAppHelpTurns(key: string, now = Date.now(), storage: StorageLike | null = localStore()): AppHelpTurn[] {
  if (!storage) return [];
  try {
    const file = JSON.parse(storage.getItem(HISTORY_PREFIX + key) || "null") as { version?: unknown; turns?: unknown } | null;
    if (!file || file.version !== 1 || !Array.isArray(file.turns)) return [];
    return keptAppHelpTurns(file.turns.map(readTurn).filter((turn): turn is AppHelpTurn => turn !== null), now);
  } catch {
    return [];
  }
}

/** Saves what is still kept; returns it. An empty conversation removes the entry. */
export function saveAppHelpTurns(key: string, turns: AppHelpTurn[], now = Date.now(), storage: StorageLike | null = localStore()): AppHelpTurn[] {
  const kept = keptAppHelpTurns(turns, now);
  if (!storage) return kept;
  try {
    if (kept.length === 0) storage.removeItem(HISTORY_PREFIX + key);
    else storage.setItem(HISTORY_PREFIX + key, JSON.stringify({ version: 1, turns: kept }));
  } catch {
    /* full or unavailable: the conversation stays on screen only */
  }
  return kept;
}

export function clearAppHelpTurns(key: string, storage: StorageLike | null = localStore()) {
  try { storage?.removeItem(HISTORY_PREFIX + key); } catch { /* storage unavailable */ }
}

/** Whether this browser can keep the conversation at all (private windows may refuse storage). */
export function canKeepAppHelpTurns(storage: StorageLike | null = localStore()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(`${HISTORY_PREFIX}probe`, "1");
    storage.removeItem(`${HISTORY_PREFIX}probe`);
    return true;
  } catch {
    return false;
  }
}

/** The storage key of one account's conversation, for matching a `storage` event from another tab. */
export function appHelpHistoryStorageKey(key: string): string {
  return HISTORY_PREFIX + key;
}

/** Every kept conversation on this browser (sign-out removes them all). */
export function appHelpHistoryStorageKeys(storage: StorageLike | null = localStore()): string[] {
  if (!storage) return [];
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const name = storage.key(index);
      if (name && name.startsWith(HISTORY_PREFIX)) keys.push(name);
    }
  } catch {
    /* storage unavailable */
  }
  return keys;
}

export function readAppHelpOpen(storage: StorageLike | null = sessionStore()): boolean {
  try { return storage?.getItem(OPEN_KEY) === "1"; } catch { return false; }
}

export function writeAppHelpOpen(open: boolean, storage: StorageLike | null = sessionStore()) {
  try {
    if (open) storage?.setItem(OPEN_KEY, "1");
    else storage?.removeItem(OPEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function newAppHelpTurnId(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  } catch {
    /* not a secure page */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
