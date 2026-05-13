"use client";

import { type ReactNode } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";

const AppShell = dynamic(
  () => import("@/components/AppShell").then(module => module.AppShell),
  { ssr: false }
);

const APP_ROUTE_PREFIXES = [
  "/orders",
  "/dashboard",
  "/schedule",
  "/customers",
  "/quick-reply",
  "/settings",
  "/files",
  "/export",
  "/plan",
  "/team"
];

function isAppRoute(pathname: string | null) {
  if (!pathname) return false;
  return APP_ROUTE_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function AppRouteFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useAuth();

  if (!isAppRoute(pathname) || loading || !user) {
    return <>{children}</>;
  }

  return <AppShell>{children}</AppShell>;
}
