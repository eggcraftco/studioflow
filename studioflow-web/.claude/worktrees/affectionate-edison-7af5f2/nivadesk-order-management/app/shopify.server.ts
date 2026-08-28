import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { FirestoreSessionStorage } from "./firestore-session-storage.server";
import { nivadeskBridge } from "./nivadesk.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.July26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new FirestoreSessionStorage(),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  hooks: {
    // After every (re)install or token refresh: hand the offline token + shop
    // metadata to the NivaDesk backend, which owns all further processing.
    afterAuth: async ({ session, admin }) => {
      try {
        let shopName = "";
        let email = "";
        let currencyCode = "";
        try {
          const response = await admin.graphql(
            `query { shop { name email currencyCode } }`,
          );
          const body = (await response.json()) as {
            data?: { shop?: { name?: string; email?: string; currencyCode?: string } };
          };
          shopName = body.data?.shop?.name || "";
          email = body.data?.shop?.email || "";
          currencyCode = body.data?.shop?.currencyCode || "";
        } catch (error) {
          console.warn("shop info lookup failed:", error);
        }
        await nivadeskBridge("upsertStore", {
          shop: session.shop,
          accessToken: session.accessToken || "",
          scopes: session.scope || "",
          shopName,
          email,
          currencyCode,
          apiVersion: "2026-10",
        });
      } catch (error) {
        console.error("NivaDesk upsertStore failed:", error);
      }
    },
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.July26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
