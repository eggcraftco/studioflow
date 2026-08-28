import type { ActionFunctionArgs } from "react-router";
import { authenticate, sessionStorage } from "../shopify.server";
import { nivadeskBridge } from "../nivadesk.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhooks may re-deliver after the app is already uninstalled; both steps
  // below are idempotent. The Functions ingest also receives this topic — the
  // duplication is intentional belt-and-braces.
  if (session) {
    const sessions = await sessionStorage.findSessionsByShop(shop);
    await sessionStorage.deleteSessions(sessions.map((s) => s.id));
  }
  try {
    await nivadeskBridge("markUninstalled", { shop });
  } catch (error) {
    console.warn("markUninstalled bridge call failed:", error);
  }

  return new Response();
};
