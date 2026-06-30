"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useAuth } from "@/lib/auth/AuthProvider";
import { appCompatibleBackupJson, customersToCsv, downloadTextFile, fullBackupJson, safeFileDate } from "@/lib/studioflow/export";
import { loadWorkspaceContext, loadWorkspaceExportData, workspaceAccessAllows, type WorkspaceContext, type WorkspaceExportData } from "@/lib/studioflow/firestore";
import { ExportOrdersPanel } from "@/components/ExportOrdersPanel";

function filePrefix(workspace: WorkspaceContext | null) {
  const base = workspace?.name || "studioflow";
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "studioflow";
}

export default function ExportPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [exportData, setExportData] = useState<WorkspaceExportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loadingExport, setLoadingExport] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, router, user]);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    let cancelled = false;

    async function run() {
      setLoadingExport(true);
      setError(null);
      setStatus(null);
      try {
        const loadedWorkspace = await loadWorkspaceContext(uid);
        if (cancelled) return;
        setWorkspace(loadedWorkspace);
        const loadedExportData = await loadWorkspaceExportData(loadedWorkspace);
        if (cancelled) return;
        setExportData(loadedExportData);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not prepare export data.");
        }
      } finally {
        if (!cancelled) setLoadingExport(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const prefix = useMemo(() => filePrefix(workspace), [workspace]);
  const date = safeFileDate();

  function exportCustomersCsv() {
    if (!exportData) return;
    downloadTextFile(`${prefix}-customers-${date}.csv`, customersToCsv(exportData.customers), "text/csv");
    setStatus("Customers CSV downloaded.");
  }

  function exportFullBackup() {
    if (!exportData) return;
    downloadTextFile(
      `${prefix}-web-backup-${date}.json`,
      fullBackupJson(exportData, user?.email),
      "application/json"
    );
    setStatus("Web JSON backup downloaded.");
  }

  function exportAppBackup() {
    if (!exportData) return;
    downloadTextFile(
      `StudioManager_Backup_${date}.json`,
      appCompatibleBackupJson(exportData),
      "application/json"
    );
    setStatus("App-compatible backup downloaded.");
  }

  if (loading || !user) return <LoadingScreen />;

  const exportAllowed = workspace?.entitlements.features.export_data ?? true;
  const canSeeFinance = Boolean(workspace && workspaceAccessAllows(workspace.memberAccess, "financialInfo"));

  return (
    <AppShell>
      {loadingExport ? <LoadingScreen /> : null}

      <section className="card" style={{ padding: 24, marginBottom: 18 }}>
        <div className="pill">Data export</div>
        <h1 style={{ fontSize: 34, lineHeight: 1.05, margin: "14px 0 8px" }}>Export your workspace data</h1>
        <p style={{ color: "var(--muted)", margin: 0 }}>
          {workspace ? `${workspace.name} · ${workspace.billingPlanName}` : "Loading workspace…"}
        </p>
      </section>

      {error ? (
        <section className="card" style={{ padding: 22, marginBottom: 18 }}>
          <div className="pill">Export error</div>
          <h2 style={{ margin: "12px 0 6px" }}>Could not prepare export</h2>
          <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>
        </section>
      ) : null}

      <section className="card" style={{ padding: 22, marginBottom: 18 }}>
        <div className="pill">Export-first rule</div>
        <h2 style={{ margin: "12px 0 6px" }}>Exports stay available on Free Demo</h2>
        <p style={{ color: "var(--muted)", margin: 0 }}>
          If a subscription expires, the workspace can fall back to Free Demo, but existing orders and customers can still be downloaded. Uploading files, creating new team data, or advanced features can remain locked by plan.
        </p>
      </section>

      <section style={{ marginBottom: 18 }}>
        <ExportOrdersPanel workspace={workspace} canSeeFinance={canSeeFinance} disabled={!exportAllowed} />
      </section>

      <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <ExportCard
          title="Customers CSV"
          description="Download customer rows for spreadsheets. This first version keeps the common fields and leaves full details in the JSON backup."
          count={exportData?.customers.length ?? 0}
          buttonTitle="Download customers CSV"
          disabled={!exportAllowed || !exportData}
          onClick={exportCustomersCsv}
        />

        <ExportCard
          title="Export Backup"
          description="Download a NivaDesk app-compatible backup. This can be imported back into the Swift app or into the web portal."
          count={(exportData?.orders.length ?? 0) + (exportData?.customers.length ?? 0)}
          buttonTitle="Download backup"
          disabled={!exportAllowed || !exportData}
          onClick={exportAppBackup}
        />

        <ExportCard
          title="Web JSON backup"
          description="Download the raw web archive with document ids and workspace metadata. The web importer can read this format too."
          count={(exportData?.orders.length ?? 0) + (exportData?.customers.length ?? 0)}
          buttonTitle="Download web JSON"
          disabled={!exportAllowed || !exportData}
          onClick={exportFullBackup}
        />
      </section>

      {status ? (
        <section className="card" style={{ padding: 18, marginTop: 18 }}>
          <p style={{ margin: 0, color: "var(--muted)", fontWeight: 800 }}>{status}</p>
        </section>
      ) : null}
    </AppShell>
  );
}

function ExportCard({
  title,
  description,
  count,
  buttonTitle,
  disabled,
  onClick
}: {
  title: string;
  description: string;
  count: number;
  buttonTitle: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="card" style={{ padding: 22 }}>
      <div className="pill">{count} records</div>
      <h2 style={{ margin: "12px 0 6px" }}>{title}</h2>
      <p style={{ color: "var(--muted)", marginTop: 0, minHeight: 78 }}>{description}</p>
      <button
        className="button secondary"
        onClick={onClick}
        disabled={disabled}
        style={{ width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        {buttonTitle}
      </button>
    </div>
  );
}
