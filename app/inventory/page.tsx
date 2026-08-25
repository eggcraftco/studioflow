"use client";

// Inventory: the physical things the workspace owns and what they cost.
// Reads are open to anyone who can read the workspace; every write goes through
// a callable, because item numbering, the purchase-price / additional-costs
// split and the status lifecycle are all decided on the server.

import { useEffect, useState } from "react";
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
import { moneySymbol } from "@/lib/studioflow/money";
import { InventoryContent } from "./InventoryContent";

export default function InventoryPage() {
  const { user, loading: authLoading } = useAuth();
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [settings, setSettings] = useState<WorkspaceSettingsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const context = await loadWorkspaceContext(user.uid);
        if (cancelled) return;
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
  }, [authLoading, user]);

  if (authLoading || loading) return <LoadingScreen />;

  if (error || !workspace) {
    return (
      <AppShell>
        <div className="inventory-page">
          <h1>Inventory</h1>
          <p className="inventory-notice">{error || "Workspace could not be loaded."}</p>
        </div>
      </AppShell>
    );
  }

  // Inventory rides the orders permission: someone who cannot see orders has no
  // reason to see what the workshop owns, and only a full editor can change it.
  const canEdit = workspaceAccessAllows(workspace.memberAccess, "orders");

  return (
    <AppShell>
      <InventoryContent
        workspace={workspace}
        currencySymbol={moneySymbol(settings)}
        canEdit={canEdit}
      />
    </AppShell>
  );
}
