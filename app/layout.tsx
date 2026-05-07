import type { Metadata } from "next";
import "./globals.css";
import { PricePrivacyProvider } from "@/components/PricePrivacy";
import { AuthProvider } from "@/lib/auth/AuthProvider";

const isStagingPreview = process.env.NEXT_PUBLIC_STAGING_NO_INDEX === "true";

export const metadata: Metadata = {
  title: "StudioFlow by EGGcraft",
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <PricePrivacyProvider>{children}</PricePrivacyProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
