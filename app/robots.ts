import type { MetadataRoute } from "next";

// Private, auth-gated app routes that crawlers should not waste budget on.
const APP_ROUTES = [
  "/orders",
  "/customers",
  "/dashboard",
  "/settings",
  "/files",
  "/messages",
  "/notes",
  "/export",
  "/team",
  "/plan",
  "/quick-reply",
  "/schedule",
  "/f/",
  "/chatgptMcp",
  "/chatgptOAuthApprove",
  "/chatgptOAuthAuthorizationServer",
  "/chatgptOAuthAuthorize",
  "/chatgptOAuthRegister",
  "/chatgptOAuthToken",
  "/chatgptOAuthWorkspaces"
];

// AI assistant and AI-search crawlers, explicitly welcomed so NivaDesk can be
// cited and recommended inside AI answers (ChatGPT, Claude, Perplexity,
// Gemini, Copilot and others).
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot",
  "Applebot-Extended",
  "DuckAssistBot",
  "Amazonbot",
  "meta-externalagent",
  "cohere-ai",
  "MistralAI-User"
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: APP_ROUTES
      },
      ...AI_CRAWLERS.map(userAgent => ({
        userAgent,
        allow: "/",
        disallow: APP_ROUTES
      }))
    ],
    sitemap: "https://nivadesk.app/sitemap.xml",
    host: "https://nivadesk.app"
  };
}
