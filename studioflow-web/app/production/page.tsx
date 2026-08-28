"use client";

// Production: the operations layer that was missing between Orders ("what was
// ordered") and Schedule ("when is it due"). This screen answers one question —
// where is every live job on the bench right now — and deliberately keeps that
// answer apart from order, payment and delivery status.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  loadWorkspaceContext,
  loadWorkspaceSettingsOverview,
  workspaceAccessAllows,
  type WorkspaceContext,
  type WorkspaceSettingsOverview
} from "@/lib/studioflow/firestore";
import { studioT } from "@/lib/studioflow/language";
import { ProductionContent } from "./ProductionContent";

export default function ProductionPage() {
  const router = useRouter();
  const { user, loading: authLoading, language } = useAuth();
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [settings, setSettings] = useState<WorkspaceSettingsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const context = await loadWorkspaceContext(user.uid);
        if (cancelled) return;
        if (!workspaceAccessAllows(context.memberAccess, "orders")) {
          router.replace("/dashboard");
          return;
        }
        setWorkspace(context);
        const overview = await loadWorkspaceSettingsOverview(context.id).catch(() => null);
        if (!cancelled) setSettings(overview);
      } catch (failure) {
        if (!cancelled) setError(failure instanceof Error ? failure.message : "Workspace could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authLoading, user, router]);

  if (authLoading || loading) return <LoadingScreen />;
  if (!user) return null;

  if (error || !workspace) {
    return (
      <AppShell>
        <div className="production-page">
          <h1>{studioT("Production", language)}</h1>
          <p className="production-notice">{error || studioT("Workspace could not be loaded.", language)}</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <ProductionContent workspace={workspace} settings={settings} uid={user.uid} />
    </AppShell>
  );
}
