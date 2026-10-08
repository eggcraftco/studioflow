"use client";

// The customer inbox: a customer's own messages, opened from inside NivaDesk.
//
// Deliberately not the Messages screen. That one is the team talking to itself
// over Firestore listeners it is allowed to hold. This collection is denied to
// every client in firestore.rules — everything in it was written by an identity
// that proved nothing — so every row here arrives through a callable, and the
// screen holds no listener at all.

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  loadWorkspaceContext,
  workspaceAccessAllows,
  type WorkspaceContext
} from "@/lib/studioflow/firestore";
import { messagingRedirectFor } from "@/lib/studioflow/messagingAccess";
import { studioT } from "@/lib/studioflow/language";
import { InboxContent } from "./InboxContent";

export default function InboxPage() {
  const router = useRouter();
  const { user, loading: authLoading, language } = useAuth();
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
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
        // The same key the nav uses, checked again here so a typed URL cannot
        // reach a screen the sidebar would not have offered.
        if (!workspaceAccessAllows(context.memberAccess, "messages")) {
          router.replace(messagingRedirectFor("customers", context.memberAccess));
          return;
        }
        setWorkspace(context);
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
        <div className="inbox-page">
          <h1>{studioT("Inbox", language)}</h1>
          <p className="inbox-notice">{error || studioT("Workspace could not be loaded.", language)}</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* InboxContent reads ?conversation= (a notification's link). */}
      <Suspense fallback={<LoadingScreen />}>
        <InboxContent workspace={workspace} language={language} />
      </Suspense>
    </AppShell>
  );
}
