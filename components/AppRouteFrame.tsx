"use client";

import { type ReactNode } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";

const AppShell = dynamic(
  () => import("@/components/AppShell").then(module => module.AppShell),
  { ssr: false }
);

// Every signed-in app route renders inside this ONE shell, mounted in the root
// layout, so the sidebar (its node, its collapsed state, its scroll position)
// survives Link navigation. It used to cover only some routes: the others
// (Home, Messages, Notes, Inventory, Banking, Production, Sales, Insights) each
// mounted their own shell, so every sidebar click unmounted one shell and
// mounted another, and the page looked reloaded. The pages still wrap
// themselves in <AppShell>; inside this one that is a pass-through
// (AppShellMountedContext), and it would still be the shell for a route that
// is missing here. Public, login and legal routes stay without a shell.
const APP_ROUTE_PREFIXES = [
  "/home",
  "/orders",
  "/sales",
  "/production",
  "/dashboard",
  "/bank",
  "/schedule",
  "/team-schedule",
  "/notes",
  "/customers",
  "/inventory",
  "/files",
  "/inbox",
  "/messages",
  "/quick-reply",
  "/admin",
  "/settings",
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
