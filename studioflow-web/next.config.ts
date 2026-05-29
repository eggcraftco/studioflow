import type { NextConfig } from "next";

const firebaseFunctionsBaseUrl = "https://europe-west2-eggcraft-studio.cloudfunctions.net";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/.well-known/oauth-protected-resource",
        destination: `${firebaseFunctionsBaseUrl}/chatgptOAuthProtectedResource`
      },
      {
        source: "/.well-known/oauth-authorization-server",
        destination: `${firebaseFunctionsBaseUrl}/chatgptOAuthAuthorizationServer`
      },
      {
        source: "/chatgptMcp",
        destination: `${firebaseFunctionsBaseUrl}/chatgptMcp`
      },
      {
        source: "/chatgptOAuthAuthorizationServer",
        destination: `${firebaseFunctionsBaseUrl}/chatgptOAuthAuthorizationServer`
      },
      {
        source: "/chatgptOAuthAuthorize",
        destination: `${firebaseFunctionsBaseUrl}/chatgptOAuthAuthorize`
      },
      {
        source: "/chatgptOAuthToken",
        destination: `${firebaseFunctionsBaseUrl}/chatgptOAuthToken`
      },
      {
        source: "/chatgptOAuthRegister",
        destination: `${firebaseFunctionsBaseUrl}/chatgptOAuthRegister`
      },
      {
        source: "/chatgptOAuthApprove",
        destination: `${firebaseFunctionsBaseUrl}/chatgptOAuthApprove`
      },
      {
        source: "/chatgptOAuthWorkspaces",
        destination: `${firebaseFunctionsBaseUrl}/chatgptOAuthWorkspaces`
      }
    ];
  },
  async headers() {
    return [
      {
        source: "/:path((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, max-age=0, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" }
        ]
      },
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" }
        ]
      }
    ];
  }
};

export default nextConfig;
