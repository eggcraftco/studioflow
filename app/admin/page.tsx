"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth/AuthProvider";
import { AdminInsightsHub } from "@/components/AdminInsightsHub";
import { useNivaDeskAdmin } from "@/lib/security/adminGate";

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  // View gate only (digests, lib/security/adminGate.ts): null while the
  // browser hashes the address. The admin callables are gated on the server.
  const allowed = useNivaDeskAdmin(user?.email);

  useEffect(() => {
    if (!loading && (!user || allowed === false)) {
      router.replace(user ? "/orders" : "/login");
    }
  }, [loading, user, allowed, router]);

  if (loading || !user || allowed !== true) return null;

  return (
    <AppShell>
      <AdminInsightsHub />
    </AppShell>
  );
}
