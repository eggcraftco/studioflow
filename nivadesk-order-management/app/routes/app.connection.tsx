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
  const statusResp = await nivadeskBridge<{ store: NivadeskStoreView; workspaceName: string }>(
    "status",
    { shop: session.shop },
  ).catch(() => null);
  return {
    shop: session.shop,
    store: statusResp?.store ?? null,
    workspaceName: statusResp?.workspaceName ?? "",
  };
};

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
  const { store, workspaceName } = useLoaderData<typeof loader>();
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

  const submit = (intent: string) => fetcher.submit({ intent }, { method: "POST" });
  const connected = store?.status === "active" && store?.companyId;

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
          </s-section>
          <s-section heading="Actions">
            <s-stack direction="inline" gap="base">
              <s-button onClick={() => submit("test")} disabled={busy}>
                Test connection
              </s-button>
              <s-button onClick={() => submit("begin-connect")} disabled={busy}>
                Reconnect / change workspace
              </s-button>
              <s-button tone="critical" onClick={() => submit("disconnect")} disabled={busy}>
                Disconnect
              </s-button>
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
              <s-button variant="primary" onClick={() => submit("begin-connect")} disabled={busy}>
                Connect existing NivaDesk account
              </s-button>
              <s-button onClick={() => submit("begin-connect")} disabled={busy}>
                Create a NivaDesk account
              </s-button>
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
