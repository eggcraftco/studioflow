import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Support() {
  return (
    <s-page heading="Support">
      <s-section heading="Help & documentation">
        <s-paragraph>
          <s-link href="https://nivadesk.app/guide" target="_blank">
            NivaDesk user guide
          </s-link>
        </s-paragraph>
        <s-paragraph>
          Questions about the Shopify integration? Email{" "}
          <s-link href="mailto:contact@nivadesk.co.uk">contact@nivadesk.co.uk</s-link> — we usually
          reply within one business day.
        </s-paragraph>
      </s-section>

      <s-section heading="Legal">
        <s-paragraph>
          <s-link href="https://nivadesk.app/privacy" target="_blank">
            Privacy Policy
          </s-link>
          {" · "}
          <s-link href="https://nivadesk.app/terms" target="_blank">
            Terms of Service
          </s-link>
        </s-paragraph>
        <s-paragraph>
          Uninstalling the app stops all syncing and revokes the store's access token. Data already
          imported into your NivaDesk workspace stays yours and can be deleted from NivaDesk at any
          time. Shopify's data-erasure requests are honoured automatically.
        </s-paragraph>
      </s-section>

      <s-section heading="Disconnect">
        <s-paragraph>
          To stop syncing without uninstalling, use{" "}
          <s-link href="/app/connection">Connection → Disconnect</s-link>.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
