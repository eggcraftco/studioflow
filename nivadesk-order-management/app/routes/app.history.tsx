import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useRevalidator, useRouteError } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { nivadeskBridge } from "../nivadesk.server";
import { formatTimestamp, statusTone } from "../lib/format";

type SyncRow = {
  id: string;
  ts: unknown;
  topic: string;
  shopifyOrderId: string;
  shopifyOrderNumber: string;
  nivadeskOrderId: string;
  status: string;
  error: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const resp = await nivadeskBridge<{ rows: SyncRow[] }>("syncLog", {
    shop: session.shop,
    limit: 100,
  }).catch(() => ({ rows: [] as SyncRow[] }));
  return { rows: resp.rows };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const rowId = String(form.get("rowId") || "");
  const resp = await nivadeskBridge<{ result: string; error: string }>("retryRow", {
    shop: session.shop,
    rowId,
  });
  return { ok: true, result: resp.result, error: resp.error };
};

export default function SyncHistory() {
  const { rows } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const shopify = useAppBridge();
  const busy = ["loading", "submitting"].includes(fetcher.state);

  useEffect(() => {
    if (fetcher.data?.ok) {
      shopify.toast.show(
        fetcher.data.result === "ok"
          ? "Retried successfully"
          : `Retry finished: ${fetcher.data.result}${fetcher.data.error ? ` (${fetcher.data.error})` : ""}`,
      );
      revalidator.revalidate();
    }
  }, [fetcher.data, revalidator, shopify]);

  return (
    <s-page heading="Sync history">
      {rows.length === 0 ? (
        <s-section>
          <s-paragraph>No sync activity yet — new Shopify orders will appear here.</s-paragraph>
        </s-section>
      ) : (
        <s-section heading={`Last ${rows.length} events`}>
          {rows.map((row) => (
            <s-box key={row.id} padding="base" borderWidth="small-100" borderRadius="base">
              <s-stack direction="inline" gap="base">
                <s-badge tone={statusTone(row.status)}>{row.status}</s-badge>
                <s-paragraph>
                  <strong>{row.shopifyOrderNumber || "—"}</strong> · {row.topic} ·{" "}
                  {formatTimestamp(row.ts)}
                </s-paragraph>
                {row.status === "failed" ? (
                  <fetcher.Form method="POST" style={{ display: "contents" }}>
                    <input type="hidden" name="rowId" value={row.id} />
                    <s-button type="submit" disabled={busy}>
                      Retry
                    </s-button>
                  </fetcher.Form>
                ) : null}
              </s-stack>
              {row.error ? <s-paragraph>Error: {row.error}</s-paragraph> : null}
              {row.nivadeskOrderId ? (
                <s-paragraph>
                  NivaDesk order: {row.nivadeskOrderId} ·{" "}
                  <s-link href="https://nivadesk.app/orders" target="_blank">
                    Open in NivaDesk
                  </s-link>
                </s-paragraph>
              ) : null}
            </s-box>
          ))}
        </s-section>
      )}
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
