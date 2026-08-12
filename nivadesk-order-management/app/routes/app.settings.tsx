import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useRouteError } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { nivadeskBridge } from "../nivadesk.server";

const WORKFLOW_PRESETS = [
  "Not Yet",
  "New Order",
  "Design Required",
  "Design in Progress",
  "Awaiting Customer Approval",
  "Approved",
  "In Production",
  "Quality Control",
  "Ready to Ship",
  "Shipped",
  "Completed",
];

type Settings = {
  autoSync: boolean;
  importUnpaid: boolean;
  filterMode: string;
  productIds: string[];
  collectionIds: string[];
  includeTags: string[];
  excludeTags: string[];
  defaultStatus: string;
  todoTemplate: { title: string }[];
  assigneeEmail: string;
  syncPaymentStatus: boolean;
  syncFulfilment: boolean;
  syncRefunds: boolean;
  syncCancellations: boolean;
  pushTracking: boolean;
  pushTags: boolean;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const resp = await nivadeskBridge<{ settings: Settings }>("getSettings", {
    shop: session.shop,
  });
  return { settings: resp.settings };
};

const csv = (value: FormDataEntryValue | null) =>
  String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const settings = {
    autoSync: form.get("autoSync") === "on",
    importUnpaid: form.get("importUnpaid") === "on",
    filterMode: String(form.get("filterMode") || "all"),
    productIds: csv(form.get("productIds")),
    collectionIds: csv(form.get("collectionIds")),
    includeTags: csv(form.get("includeTags")),
    excludeTags: csv(form.get("excludeTags")),
    defaultStatus: String(form.get("defaultStatus") || "Not Yet"),
    todoTemplate: String(form.get("todoTemplate") || "")
      .split("\n")
      .map((line) => ({ title: line.trim() }))
      .filter((item) => item.title),
    assigneeEmail: String(form.get("assigneeEmail") || "").trim(),
    syncPaymentStatus: form.get("syncPaymentStatus") === "on",
    syncFulfilment: form.get("syncFulfilment") === "on",
    syncRefunds: form.get("syncRefunds") === "on",
    syncCancellations: form.get("syncCancellations") === "on",
  };
  await nivadeskBridge("saveSettings", { shop: session.shop, settings });
  return { ok: true };
};

export default function SyncSettings() {
  const { settings } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const saving = ["loading", "submitting"].includes(fetcher.state);
  // Static initial values only — user changes live in the DOM and reach the
  // server through the form submission (see wc-events.ts on why change
  // handlers are unreliable on these custom elements).
  const filterMode = settings.filterMode || "all";
  const defaultStatus = settings.defaultStatus || "Not Yet";

  useEffect(() => {
    if (fetcher.data?.ok) shopify.toast.show("Settings saved");
  }, [fetcher.data, shopify]);

  return (
    <s-page heading="Order sync settings">
      <fetcher.Form method="post">
        <s-section heading="Automatic sync">
          <s-checkbox name="autoSync" defaultChecked={settings.autoSync} label="Sync new Shopify orders to NivaDesk automatically" />
          <s-checkbox name="importUnpaid" defaultChecked={settings.importUnpaid} label="Also import orders that are not paid yet" />
        </s-section>

        <s-section heading="Which orders sync">
          <s-select label="Product filter" name="filterMode" value={filterMode}>
            <s-option value="all">Import all orders</s-option>
            <s-option value="include_products">Only orders with selected products</s-option>
            <s-option value="include_collections">Only orders with selected collections</s-option>
            <s-option value="exclude_products">Exclude selected products</s-option>
          </s-select>
          <s-text-field
            label="Product IDs (comma separated)"
            name="productIds"
            defaultValue={(settings.productIds || []).join(", ")}
            details="Only used with the product filters — numeric IDs from the product admin URL."
          />
          <s-text-field
            label="Collection IDs (comma separated)"
            name="collectionIds"
            defaultValue={(settings.collectionIds || []).join(", ")}
            details="Only used with the collection filter — numeric IDs from the collection admin URL."
          />
          <s-text-field
            label="Only orders with these tags (comma separated, optional)"
            name="includeTags"
            defaultValue={(settings.includeTags || []).join(", ")}
          />
          <s-text-field
            label="Exclude orders with these tags (comma separated, optional)"
            name="excludeTags"
            defaultValue={(settings.excludeTags || []).join(", ")}
          />
        </s-section>

        <s-section heading="Workflow for new orders">
          <s-select label="Starting stage" name="defaultStatus" value={defaultStatus}>
            {WORKFLOW_PRESETS.map((stage) => (
              <s-option key={stage} value={stage}>
                {stage}
              </s-option>
            ))}
          </s-select>
          <s-text-area
            label="Tasks to create on each order (one per line)"
            name="todoTemplate"
            rows={5}
            defaultValue={(settings.todoTemplate || []).map((t) => t.title).join("\n")}
            details="Example: Review order details / Check customer files / Prepare first design"
          />
          <s-text-field
            label="Default assignee email (optional)"
            name="assigneeEmail"
            defaultValue={settings.assigneeEmail || ""}
            details="Must be a member of the connected NivaDesk workspace."
          />
        </s-section>

        <s-section heading="Status updates from Shopify">
          <s-checkbox name="syncPaymentStatus" defaultChecked={settings.syncPaymentStatus} label="Track payment status changes" />
          <s-checkbox name="syncFulfilment" defaultChecked={settings.syncFulfilment} label="Track fulfilments (dispatched + tracking number)" />
          <s-checkbox name="syncRefunds" defaultChecked={settings.syncRefunds} label="Track refunds" />
          <s-checkbox name="syncCancellations" defaultChecked={settings.syncCancellations} label="Mark cancelled Shopify orders as Cancelled" />
          <s-paragraph>
            Pushing tracking numbers back to Shopify is coming soon and will be optional.
          </s-paragraph>
        </s-section>

        <s-section>
          <s-button variant="primary" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </s-button>
        </s-section>
      </fetcher.Form>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
