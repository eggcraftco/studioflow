export type WebSyncState = "offline" | "syncing" | "saving" | "saved" | "error" | "connecting";

export const WEB_SYNC_STATUS_EVENT = "studioflow-web-sync-status";

export type WebSyncStatusDetail = {
  state: WebSyncState;
  message?: string;
  at?: number;
};

export function dispatchWebSyncStatus(detail: WebSyncStatusDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<WebSyncStatusDetail>(WEB_SYNC_STATUS_EVENT, {
    detail: {
      ...detail,
      at: detail.at ?? Date.now()
    }
  }));
}

export async function withWebSyncStatus<T>(operation: () => Promise<T>, savingMessage = "Saving to cloud.") {
  dispatchWebSyncStatus({
    state: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "saving",
    message: savingMessage
  });

  try {
    const result = await operation();
    dispatchWebSyncStatus({ state: "saved", message: "Saved to cloud." });
    return result;
  } catch (error) {
    dispatchWebSyncStatus({
      state: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error",
      message: error instanceof Error ? error.message : "There was a problem syncing your changes."
    });
    throw error;
  }
}
