import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect, useFetcher, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { nivadeskBridge } from "../nivadesk.server";

// Plans, charged through Shopify.
//
// Shopify's rule 1.2.1: an app on their App Store bills through THEIR Billing
// API. Sending merchants to Stripe is what paused the listing. Choosing a plan
// here creates an appSubscription and hands the merchant to Shopify's own
// approval screen — the charge authorization prompt review looks for.
//
// Prices come from the NivaDesk server, never from this file: one place to
// change, so the listing, the charge and the entitlement cannot disagree.

type BillingPlan = {
  plan: string;
  name: string;
  amount: number;
  currency: string;
  interval: string;
  recommended?: boolean;
};

type BillingState = {
  plans: BillingPlan[];
  currency: string;
  trialDays: number;
  connected: boolean;
  billedElsewhere: boolean;
  currentPlan: string;
  currentPlanName: string;
  subscriptionStatus: string;
  manageUrl: string;
};

const SUBSCRIPTION_CREATE = `#graphql
  mutation NivaDeskSubscribe($name: String!, $returnUrl: URL!, $trialDays: Int, $test: Boolean, $lineItems: [AppSubscriptionLineItemInput!]!) {
    appSubscriptionCreate(name: $name, returnUrl: $returnUrl, trialDays: $trialDays, test: $test, lineItems: $lineItems) {
      confirmationUrl
      appSubscription { id status trialDays currentPeriodEnd }
      userErrors { field message }
    }
  }`;

// Whether this shop can be charged for real. Shopify refuses a live charge on a
// development store, and App Review tests on one — which is very likely the
// "server error" in the rejection. Asking the shop is right where an env flag
// was wrong: a flag has to be remembered, and it is only ever correct for one
// of the two audiences at a time.
const SHOP_BILLING_MODE = `#graphql
  query NivaDeskShopBillingMode {
    shop { plan { partnerDevelopment shopifyPlus } }
  }`;

const ACTIVE_SUBSCRIPTIONS = `#graphql
  query NivaDeskActiveSubscriptions {
    currentAppInstallation {
      activeSubscriptions { id name status trialDays currentPeriodEnd test }
    }
  }`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const url = new URL(request.url);

  // Coming back from Shopify's approval screen. Read the subscription from
  // Shopify rather than trusting the query string, then write the entitlement
  // before the merchant sees the page — otherwise they approve a charge and
  // land on a workspace that still says Free.
  if (url.searchParams.get("charge_id")) {
    try {
      const response = await admin.graphql(ACTIVE_SUBSCRIPTIONS);
      const body = (await response.json()) as {
        data?: { currentAppInstallation?: { activeSubscriptions?: Array<Record<string, unknown>> } };
      };
      const active = body.data?.currentAppInstallation?.activeSubscriptions?.[0];
      if (active) {
        const planKey = url.searchParams.get("plan") || "";
        const trialDays = Number(active.trialDays) || 0;
        const periodEnd = String(active.currentPeriodEnd || "");
        await nivadeskBridge("billingApply", {
          shop: session.shop,
          subscriptionGid: String(active.id || ""),
          status: String(active.status || ""),
          plan: planKey,
          trialing: trialDays > 0,
          trialEndsAtMs: trialDays > 0 && periodEnd ? Date.parse(periodEnd) || 0 : 0,
        });
      }
    } catch (error) {
      console.error("plan return failed", error);
    }
    // Drop charge_id from the address bar so a refresh does not re-run this.
    throw redirect("/app/plan");
  }

  const state = await nivadeskBridge<{ billing: BillingState }>("billingState", {
    shop: session.shop,
  }).catch(() => null);

  return { shop: session.shop, billing: state?.billing ?? null };
};

/**
 * Development stores (and Plus partner sandboxes) can only take test charges;
 * Shopify rejects a live one outright. Read it from the shop rather than from
 * config, so a reviewer on a dev store gets a test charge and a real merchant
 * gets a real one — without anyone having to remember to flip a flag.
 *
 * If the query fails we charge for real: a merchant who should be billed and
 * silently is not is the worse of the two failures.
 */
async function shopChargesAreTestOnly(admin: {
  graphql: (query: string) => Promise<Response>;
}): Promise<boolean> {
  try {
    const response = await admin.graphql(SHOP_BILLING_MODE);
    const body = (await response.json()) as {
      data?: { shop?: { plan?: { partnerDevelopment?: boolean; shopifyPlus?: boolean } } };
    };
    const plan = body.data?.shop?.plan;
    return plan?.partnerDevelopment === true;
  } catch (error) {
    console.error("shop billing mode lookup failed", error);
    return false;
  }
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  const planKey = String(form.get("plan") || "");

  // The server decides what this plan costs and whether a trial is still owed.
  // The app only relays it — a price in this file could drift from the listing.
  const quote = await nivadeskBridge<{
    plan: string;
    name: string;
    amount: number;
    currency: string;
    interval: string;
    trialDays: number;
  }>("billingPlanRequest", { shop: session.shop, plan: planKey }).catch((error: Error) => {
    return { error: error.message } as never;
  });

  if (!quote || !("amount" in quote)) {
    return { error: "Could not price that plan. Please try again." };
  }

  const returnUrl = `${process.env.SHOPIFY_APP_URL}/app/plan?plan=${encodeURIComponent(quote.plan)}`;
  const response = await admin.graphql(SUBSCRIPTION_CREATE, {
    variables: {
      name: quote.name,
      returnUrl,
      trialDays: quote.trialDays,
      test: await shopChargesAreTestOnly(admin),
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: { amount: quote.amount, currencyCode: quote.currency },
              interval: quote.interval,
            },
          },
        },
      ],
    },
  });

  const body = (await response.json()) as {
    data?: {
      appSubscriptionCreate?: {
        confirmationUrl?: string;
        userErrors?: Array<{ message?: string }>;
      };
    };
  };
  const result = body.data?.appSubscriptionCreate;
  const failure = result?.userErrors?.[0]?.message;
  if (failure) return { error: failure };
  if (!result?.confirmationUrl) return { error: "Shopify did not return an approval link." };

  // Top level, not inside the iframe: Shopify's approval screen refuses to be framed.
  return { confirmationUrl: result.confirmationUrl };
};

export default function PlanPage() {
  const { billing } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ confirmationUrl?: string; error?: string }>();

  if (fetcher.data?.confirmationUrl && typeof window !== "undefined") {
    window.top!.location.href = fetcher.data.confirmationUrl;
  }

  if (!billing?.connected) {
    return (
      <s-page heading="Plans">
        <s-section heading="Connect a workspace first">
          <s-paragraph>
            Plans belong to a NivaDesk workspace. Connect one and this page will show what it is on.
          </s-paragraph>
          <s-link href="/app/connection">Manage connection</s-link>
        </s-section>
      </s-page>
    );
  }

  // Already paying us somewhere else: sell nothing, say where it lives. No
  // second charge can be created for the same workspace.
  if (billing.billedElsewhere) {
    return (
      <s-page heading="Plans">
        <s-section heading="Billed by NivaDesk">
          <s-paragraph>
            This workspace is on {billing.currentPlanName}, billed by NivaDesk rather than through
            Shopify. Nothing is charged through this app.
          </s-paragraph>
          <s-link href={billing.manageUrl} target="_blank">Manage billing in NivaDesk</s-link>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="Plans">
      <s-section heading={`Your workspace is on ${billing.currentPlanName}`}>
        <s-paragraph>
          Charged through Shopify and shown on your Shopify invoice. Cancel any time from
          Settings › Apps in your Shopify admin.
          {billing.trialDays > 0
            ? ` Your first ${billing.trialDays} days are free, and nothing is charged until they end.`
            : ""}
        </s-paragraph>
        {fetcher.data?.error ? <s-banner tone="critical">{fetcher.data.error}</s-banner> : null}
      </s-section>

      {billing.plans.map((plan) => (
        <s-section key={plan.plan} heading={plan.name}>
          <s-paragraph>
            {plan.currency === "GBP" ? "£" : ""}{plan.amount} per month
            {plan.recommended ? " — most studios start here" : ""}
          </s-paragraph>
          {billing.currentPlan === plan.plan ? (
            <s-paragraph>This is your current plan.</s-paragraph>
          ) : (
            <fetcher.Form method="post">
              <input type="hidden" name="plan" value={plan.plan} />
              <s-button type="submit" variant={plan.recommended ? "primary" : undefined}>
                {fetcher.state === "submitting" ? "Opening Shopify…" : `Choose ${plan.name}`}
              </s-button>
            </fetcher.Form>
          )}
        </s-section>
      ))}
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
