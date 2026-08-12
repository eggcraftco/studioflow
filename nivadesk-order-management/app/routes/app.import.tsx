import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useRouteError } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { nivadeskBridge, startNivadeskImport } from "../nivadesk.server";
import { wcChange, wcClick } from "../lib/wc-events";

type ImportStatus = {
  status: string;
  total: number;
  processed: number;
  created: number;
  skipped: number;
  failedCount: number;
  failed: { orderNumber: string; error: string }[];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

type RangePayload =
  | { sinceDays: number }
  | { startDate: string; endDate: string }
  | { orderIds: string[] };

function rangePayload(form: FormData): RangePayload {
  const range = String(form.get("range") || "30");
  if (range === "custom") {
    return {
      startDate: String(form.get("startDate") || ""),
      endDate: String(form.get("endDate") || ""),
    };
  }
  if (range === "selected") {
    return {
      orderIds: String(form.get("orderIds") || "")
        .split(/[\s,]+/)
        .map((v) => v.trim())
        .filter(Boolean),
    };
  }
  return { sinceDays: Number(range) || 30 };
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  const payload = rangePayload(form);

  if (intent === "preview") {
    if ("orderIds" in payload) {
      return { intent, ok: true, count: payload.orderIds.length };
    }
    const resp = await nivadeskBridge<{ count: number }>("importPreview", {
      shop: session.shop,
      ...payload,
    });
    return { intent, ok: true, count: resp.count };
  }

  if (intent === "start") {
    const importId = startNivadeskImport({ shop: session.shop, ...payload });
    return { intent, ok: true, importId };
  }

  if (intent === "status") {
    const importId = String(form.get("importId") || "");
    const resp = await nivadeskBridge<ImportStatus>("importStatus", {
      shop: session.shop,
      importId,
    });
    return { intent, ok: true, importId, progress: resp };
  }

  return { intent, ok: false };
};

export default function ImportOrders() {
  const fetcher = useFetcher<typeof action>();
  const statusFetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const busy = ["loading", "submitting"].includes(fetcher.state);

  const [range, setRange] = useState("30");
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportStatus | null>(null);

  useEffect(() => {
    const data = fetcher.data;
    if (!data?.ok) return;
    if (data.intent === "preview" && "count" in data) {
      setPreviewCount(data.count as number);
    }
    if (data.intent === "start" && "importId" in data) {
      setImportId(data.importId as string);
      setProgress(null);
      shopify.toast.show("Import started");
    }
  }, [fetcher.data, shopify]);

  // Poll progress while an import runs.
  useEffect(() => {
    if (!importId) return;
    if (progress?.status === "done") return;
    const timer = setInterval(() => {
      statusFetcher.submit({ intent: "status", importId }, { method: "POST" });
    }, 2500);
    return () => clearInterval(timer);
  }, [importId, progress?.status, statusFetcher]);

  useEffect(() => {
    const data = statusFetcher.data;
    if (data?.ok && data.intent === "status" && "progress" in data) {
      setProgress(data.progress as ImportStatus);
    }
  }, [statusFetcher.data]);

  const submit = (intent: string, formEl: HTMLFormElement | null) => {
    if (!formEl) return;
    const form = new FormData(formEl);
    form.set("intent", intent);
    fetcher.submit(form, { method: "POST" });
  };

  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.processed / progress.total) * 100))
      : 0;

  return (
    <s-page heading="Import past orders">
      <form id="import-form" onSubmit={(event) => event.preventDefault()}>
        <s-section heading="What to import">
          <s-select
            label="Date range"
            name="range"
            value={range}
            ref={wcChange((event: Event) => {
              setRange(String((event.target as HTMLSelectElement).value));
              setPreviewCount(null);
            })}
          >
            <s-option value="30">Last 30 days</s-option>
            <s-option value="90">Last 90 days</s-option>
            <s-option value="365">Last 12 months</s-option>
            <s-option value="custom">Custom date range</s-option>
            <s-option value="selected">Selected orders only</s-option>
          </s-select>
          {range === "custom" ? (
            <s-stack direction="inline" gap="base">
              <s-text-field label="From (YYYY-MM-DD)" name="startDate" placeholder="2026-01-01" />
              <s-text-field label="To (YYYY-MM-DD)" name="endDate" placeholder="2026-06-30" />
            </s-stack>
          ) : null}
          {range === "selected" ? (
            <s-text-area
              label="Order IDs"
              name="orderIds"
              rows={4}
              details="Numeric order IDs, separated by commas or new lines (max 250)."
            />
          ) : null}
          <s-stack direction="inline" gap="base">
            <s-button
              ref={wcClick(() => submit("preview", document.getElementById("import-form") as HTMLFormElement))}
              disabled={busy}
            >
              Preview count
            </s-button>
            <s-button
              variant="primary"
              ref={wcClick(() => submit("start", document.getElementById("import-form") as HTMLFormElement))}
              disabled={busy || Boolean(importId && progress?.status !== "done")}
            >
              Start import
            </s-button>
          </s-stack>
          {previewCount !== null ? (
            <s-banner tone="info" heading={`${previewCount} orders in this range`}>
              <s-paragraph>
                Orders already synced are skipped automatically, and your product/tag filters from
                Sync settings apply.
              </s-paragraph>
            </s-banner>
          ) : null}
        </s-section>
      </form>

      {importId ? (
        <s-section heading={progress?.status === "done" ? "Import finished" : "Import running…"}>
          {progress ? (
            <>
              <s-paragraph>
                {progress.processed}/{progress.total || "?"} processed ({percent}%) ·{" "}
                <strong>{progress.created} created</strong> · {progress.skipped} skipped ·{" "}
                {progress.failedCount} failed
              </s-paragraph>
              {progress.failed?.length ? (
                <s-banner tone="warning" heading="Failed records">
                  {progress.failed.map((f, index) => (
                    <s-paragraph key={index}>
                      {f.orderNumber}: {f.error}
                    </s-paragraph>
                  ))}
                </s-banner>
              ) : null}
              {progress.status === "done" ? (
                <s-paragraph>
                  Done. See <s-link href="/app/history">Sync history</s-link> for every record, or
                  open <s-link href="https://nivadesk.app" target="_blank">NivaDesk</s-link>.
                </s-paragraph>
              ) : null}
            </>
          ) : (
            <s-stack direction="inline" gap="base">
              <s-spinner />
              <s-paragraph>Starting…</s-paragraph>
            </s-stack>
          )}
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
