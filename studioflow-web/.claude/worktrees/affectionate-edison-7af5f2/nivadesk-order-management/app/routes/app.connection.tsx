import { useEffect, useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useRevalidator, useRouteError } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { nivadeskBridge, type NivadeskStoreView } from "../nivadesk.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const statusResp = await nivadeskBridge<{
    store: NivadeskStoreView;
    workspaceName: string;
    workspaceCurrency: string;
    storeCurrency: string;
  }>("status", { shop: session.shop }).catch(() => null);
  return {
    shop: session.shop,
    store: statusResp?.store ?? null,
    workspaceName: statusResp?.workspaceName ?? "",
    workspaceCurrency: statusResp?.workspaceCurrency ?? "",
    storeCurrency: statusResp?.storeCurrency ?? "",
  };
};

// NivaDesk stores a display SYMBOL (Financial Settings), Shopify reports an ISO
// code. Map the picker's known symbols to codes so we can compare; unknown
// symbols opt out of the warning rather than false-alarm.
const SYMBOL_TO_CODE: Record<string, string> = {
  "£": "GBP",
  $: "USD",
  "€": "EUR",
  "₺": "TRY",
  "¥": "JPY",
  AED: "AED",
  CAD: "CAD",
  AUD: "AUD",
  CHF: "CHF",
};

export function currencyMismatch(workspaceSymbol: string, storeCode: string) {
  const ws = SYMBOL_TO_CODE[workspaceSymbol.trim()] || "";
  const store = storeCode.trim().toUpperCase();
  return Boolean(ws && store && ws !== store);
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent === "begin-connect") {
    const resp = await nivadeskBridge<{ connectUrl: string }>("beginConnect", {
      shop: session.shop,
    });
    return { intent, ok: true, connectUrl: resp.connectUrl };
  }

  if (intent === "disconnect") {
    await nivadeskBridge("disconnect", { shop: session.shop });
    return { intent, ok: true };
  }

  if (intent === "test") {
    // Round-trip both sides: Shopify Admin API + the NivaDesk backend.
    let shopOk = false;
    try {
      const response = await admin.graphql(`query { shop { name } }`);
      const body = (await response.json()) as { data?: { shop?: { name?: string } } };
      shopOk = Boolean(body.data?.shop?.name);
    } catch {
      shopOk = false;
    }
    const statusResp = await nivadeskBridge<{ store: NivadeskStoreView }>("status", {
      shop: session.shop,
    }).catch(() => null);
    const connected = statusResp?.store?.status === "active" && Boolean(statusResp?.store?.companyId);
    return { intent, ok: shopOk && Boolean(statusResp), connected, shopOk };
  }

  return { intent, ok: false };
};

export default function Connection() {
  const { store, workspaceName, workspaceCurrency, storeCurrency } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const shopify = useAppBridge();
  const busy = ["loading", "submitting"].includes(fetcher.state);
  // awaitingConnect must be state, not a ref: the polling effect below has to
  // re-run when it flips, and each new begin-connect response (deduped by
  // object identity) may open a fresh tab — e.g. "Reconnect / change workspace".
  const [awaitingConnect, setAwaitingConnect] = useState(false);
  const handledResponse = useRef<unknown>(null);

  // After "Connect": open the NivaDesk handshake page in a full tab, then poll
  // the connection status so this screen flips to Connected by itself.
  useEffect(() => {
    const data = fetcher.data;
    if (!data || handledResponse.current === data) return;
    handledResponse.current = data;
    if (data.intent === "begin-connect" && data.ok && "connectUrl" in data) {
      window.open(data.connectUrl as string, "_blank");
      shopify.toast.show("Finish connecting in the NivaDesk tab that just opened");
      setAwaitingConnect(true);
    }
    if (data.intent === "disconnect" && data.ok) {
      shopify.toast.show("Store disconnected");
      revalidator.revalidate();
    }
    if (data.intent === "test") {
      shopify.toast.show(
        data.ok
          ? data.connected
            ? "Everything looks good — Shopify and NivaDesk are both reachable"
            : "Backends reachable, but the store is not connected to a workspace yet"
          : "Connection test failed — see Support",
      );
    }
  }, [fetcher.data, revalidator, shopify]);

  useEffect(() => {
    if (!awaitingConnect) return;
    if (store?.status === "active") {
      setAwaitingConnect(false);
      return;
    }
    const timer = setInterval(() => revalidator.revalidate(), 4000);
    return () => clearInterval(timer);
  }, [awaitingConnect, store?.status, revalidator]);

  const connected = store?.status === "active" && store?.companyId;

  // Real form submissions, not onClick: React 18 does not attach JSX event
  // props to custom elements, so s-button onClick never fires inside the
  // embedded iframe. Native submit inside fetcher.Form works everywhere.
  const IntentButton = ({
    intent,
    tone,
    variant,
    children,
  }: {
    intent: string;
    tone?: "critical" | "neutral";
    variant?: "primary" | "secondary";
    children: React.ReactNode;
  }) => (
    <fetcher.Form method="POST" style={{ display: "contents" }}>
      <input type="hidden" name="intent" value={intent} />
      <s-button type="submit" tone={tone} variant={variant} disabled={busy}>
        {children}
      </s-button>
    </fetcher.Form>
  );

  return (
    <s-page heading="NivaDesk connection">
      {!store ? (
        <s-banner tone="critical" heading="Connection service unreachable">
          <s-paragraph>Please try again shortly.</s-paragraph>
        </s-banner>
      ) : connected ? (
        <>
          <s-section heading="Connected workspace">
            <s-stack direction="inline" gap="base">
              <s-badge tone="success">Active</s-badge>
              <s-paragraph>
                <strong>{workspaceName || store.companyId}</strong>
                {store.linkedEmail ? ` · linked by ${store.linkedEmail}` : ""}
              </s-paragraph>
            </s-stack>
            <s-paragraph>
              New Shopify orders sync into this workspace automatically. Manage what syncs under{" "}
              <s-link href="/app/settings">Sync settings</s-link>.
            </s-paragraph>
            {currencyMismatch(workspaceCurrency, storeCurrency) ? (
              <s-banner tone="warning" heading={`Your store sells in ${storeCurrency}, your workspace displays ${workspaceCurrency}`}>
                <s-paragraph>
                  Order amounts import exactly as charged in Shopify — they are never converted.
                  Each order also keeps its original currency on the NivaDesk order screen. To
                  match symbols, change the workspace currency in NivaDesk → Settings → Financial
                  Settings → Currency Symbol.
                </s-paragraph>
              </s-banner>
            ) : null}
          </s-section>
          <s-section heading="Actions">
            <s-stack direction="inline" gap="base">
              <IntentButton intent="test">Test connection</IntentButton>
              <IntentButton intent="begin-connect">Reconnect / change workspace</IntentButton>
              <IntentButton intent="disconnect" tone="critical">Disconnect</IntentButton>
            </s-stack>
            <s-paragraph>
              Disconnecting stops all syncing; nothing already imported into NivaDesk is deleted.
            </s-paragraph>
          </s-section>
        </>
      ) : (
        <>
          <s-section heading="Connect your NivaDesk account">
            <s-paragraph>
              A NivaDesk tab will open where you sign in (or create a free account) and choose the
              workspace this store should sync into. Only workspace owners can complete the link.
            </s-paragraph>
            <s-stack direction="inline" gap="base">
              <IntentButton intent="begin-connect" variant="primary">
                Connect existing NivaDesk account
              </IntentButton>
              <IntentButton intent="begin-connect">Create a NivaDesk account</IntentButton>
            </s-stack>
            {store.status === "uninstalled" ? (
              <s-banner tone="warning" heading="App was uninstalled">
                <s-paragraph>Re-install the app from the App Store to continue.</s-paragraph>
              </s-banner>
            ) : null}
          </s-section>
          <s-section heading="How it works">
            <s-paragraph>
              1. Click Connect — a NivaDesk page opens with a one-time secure code for this store.
            </s-paragraph>
            <s-paragraph>2. Sign in or create your account, then pick a workspace.</s-paragraph>
            <s-paragraph>
              3. Come back here — this page updates to Connected automatically.
            </s-paragraph>
          </s-section>
        </>
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
