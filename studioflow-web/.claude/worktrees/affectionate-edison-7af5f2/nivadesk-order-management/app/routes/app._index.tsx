import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useRouteError } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { nivadeskBridge, startNivadeskImport, type NivadeskStoreView } from "../nivadesk.server";
import { formatTimestamp, statusTone } from "../lib/format";

type SyncRow = {
  id: string;
  ts: unknown;
  topic: string;
  shopifyOrderNumber: string;
  status: string;
  error: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [statusResp, logResp] = await Promise.all([
    nivadeskBridge<{ store: NivadeskStoreView; workspaceName: string }>("status", {
      shop: session.shop,
    }).catch(() => null),
    nivadeskBridge<{ rows: SyncRow[] }>("syncLog", { shop: session.shop, limit: 5 }).catch(
      () => ({ rows: [] as SyncRow[] }),
    ),
  ]);
  return {
    shop: session.shop,
    store: statusResp?.store ?? null,
    workspaceName: statusResp?.workspaceName ?? "",
    recent: logResp?.rows ?? [],
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  // "Sync now": backfill the last 24 hours through the normal pipeline.
  const importId = startNivadeskImport({ shop: session.shop, sinceDays: 1 });
  return { ok: true, importId };
};

export default function Dashboard() {
  const { store, workspaceName, recent } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const syncing = ["loading", "submitting"].includes(fetcher.state);

  useEffect(() => {
    if (fetcher.data?.ok) {
      shopify.toast.show("Sync started — new orders from the last 24h are being imported");
    }
  }, [fetcher.data, shopify]);

  const connected = store?.status === "active" && store?.companyId;

  return (
    <s-page heading="NivaDesk — Custom Order Management">
      {connected ? (
        <s-button slot="primary-action" onClick={() => fetcher.submit({}, { method: "POST" })} disabled={syncing}>
          {syncing ? "Starting…" : "Sync now"}
        </s-button>
      ) : null}

      {!store ? (
        <s-banner tone="critical" heading="Connection service unreachable">
          <s-paragraph>
            The NivaDesk backend could not be reached. Please try again in a moment or contact
            support@nivadesk.co.uk.
          </s-paragraph>
        </s-banner>
      ) : connected ? (
        <s-section heading="Connection">
          <s-stack direction="inline" gap="base">
            <s-badge tone="success">Connected</s-badge>
            <s-paragraph>
              Workspace: <strong>{workspaceName || store.companyId}</strong>
              {store.linkedEmail ? ` · ${store.linkedEmail}` : ""}
            </s-paragraph>
          </s-stack>
          <s-paragraph>
            <s-link href="https://nivadesk.app" target="_blank">
              Open NivaDesk
            </s-link>
            {" · "}
            <s-link href="/app/connection">Manage connection</s-link>
          </s-paragraph>
        </s-section>
      ) : (
        <s-banner tone="warning" heading="Not connected to NivaDesk yet">
          <s-paragraph>
            Connect this store to a NivaDesk workspace to start syncing orders.{" "}
            <s-link href="/app/connection">Connect now</s-link>
          </s-paragraph>
        </s-banner>
      )}

      {store ? (
        <s-section heading="Sync overview">
          <s-stack direction="inline" gap="large">
            <s-paragraph>
              <strong>{store.stats.syncedOrders}</strong> orders synced
            </s-paragraph>
            <s-paragraph>
              <strong>{store.stats.failedCount}</strong> failed
            </s-paragraph>
            <s-paragraph>Last sync: {formatTimestamp(store.stats.lastSyncAt)}</s-paragraph>
            <s-paragraph>Last webhook: {formatTimestamp(store.stats.lastWebhookAt)}</s-paragraph>
          </s-stack>
        </s-section>
      ) : null}

      {recent.length ? (
        <s-section heading="Recent activity">
          {recent.map((row) => (
            <s-stack key={row.id} direction="inline" gap="base">
              <s-badge tone={statusTone(row.status)}>{row.status}</s-badge>
              <s-paragraph>
                {row.shopifyOrderNumber || row.topic} · {row.topic} · {formatTimestamp(row.ts)}
                {row.error ? ` — ${row.error}` : ""}
              </s-paragraph>
            </s-stack>
          ))}
          <s-paragraph>
            <s-link href="/app/history">View full history</s-link>
          </s-paragraph>
        </s-section>
      ) : null}
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
