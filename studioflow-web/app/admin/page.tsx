"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth/AuthProvider";
import { AdminInsightsHub, isNivaDeskAdminEmail } from "@/components/AdminInsightsHub";

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const allowed = isNivaDeskAdminEmail(user?.email);

  useEffect(() => {
    if (!loading && (!user || !allowed)) {
      router.replace(user ? "/orders" : "/login");
    }
  }, [loading, user, allowed, router]);

  if (loading || !user || !allowed) return null;

  return (
    <AppShell>
      <AdminInsightsHub />
    </AppShell>
  );
}
