import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap"
});
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap"
});
import { AppRouteFrame } from "@/components/AppRouteFrame";
import { PricePrivacyProvider } from "@/components/PricePrivacy";
import { CookieConsent } from "@/components/CookieConsent";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { SessionAutoLock } from "@/components/SessionAutoLock";
import { StudioToastHost } from "@/components/StudioToastHost";

const isStagingPreview = process.env.NEXT_PUBLIC_STAGING_NO_INDEX === "true";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  metadataBase: new URL("https://nivadesk.app"),
  title: "NivaDesk",
  description: "Premium studio management for artists, custom studios and order-based creative businesses.",
  robots: isStagingPreview
    ? {
        index: false,
        follow: false,
        googleBot: {
          index: false,
          follow: false,
          noimageindex: true
        }
      }
    : undefined
};

// The one inline script of our own. It carries the response's CSP nonce
// (middleware.ts, security audit #18) so the policy can list no 'unsafe-inline'.
function ThemeBootstrapScript({ nonce }: { nonce?: string }) {
  const script = `
try {
  var storedTheme = window.localStorage.getItem("studioflow-app-theme");
  if (storedTheme === "light" || storedTheme === "dark") {
    document.documentElement.dataset.studioTheme = storedTheme;
    document.body.dataset.studioTheme = storedTheme;
  }
} catch (error) {}
`;

  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: script }} />;
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" className={`${inter.variable} ${manrope.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeBootstrapScript nonce={nonce} />
        <AuthProvider>
          <PricePrivacyProvider>
            <AppRouteFrame>{children}</AppRouteFrame>
            <CookieConsent />
            <SessionAutoLock />
            {/* One toast host for the whole app. It used to live inside
                AppShell, so a toast fired just before router.push died with
                the shell that fired it — which is why the first-order
                confirmation was never seen after a create navigated. */}
            <StudioToastHost />
          </PricePrivacyProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
