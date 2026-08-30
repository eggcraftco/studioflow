"use client";

// Shopify → NivaDesk connect handshake.
//
// Opened from the embedded Shopify app with ?shop=<x>.myshopify.com&nonce=<one-time>.
// The signed-in workspace owner picks a workspace and the shopifyCompleteConnect
// callable redeems the nonce server-side; the Shopify tab polls its own status
// and flips to Connected on its own, so this page just needs to finish and say so.

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, getDocs, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { studioT } from "@/lib/studioflow/language";

type WorkspaceOption = { id: string; name: string; isOwner: boolean };

function urlParam(name: string): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) || "";
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  background: "#f4f5f3",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};
const card: React.CSSProperties = {
  width: "100%",
  maxWidth: 440,
  background: "#fff",
  borderRadius: 20,
  padding: "30px 28px",
  boxShadow: "0 24px 70px rgba(15, 23, 32, 0.14)",
  color: "#171923",
};
const muted: React.CSSProperties = { color: "#65706d", fontSize: 14, lineHeight: 1.5 };
const buttonPrimary: React.CSSProperties = {
  display: "inline-block",
  width: "100%",
  textAlign: "center",
  padding: "12px 18px",
  borderRadius: 12,
  border: "none",
  background: "#214f4a",
  color: "#fff",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
};
const buttonGhost: React.CSSProperties = {
  ...buttonPrimary,
  background: "rgba(33, 79, 74, 0.08)",
  color: "#214f4a",
};

export default function ConnectShopifyPage() {
  const { user, loading, language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const [shop, setShop] = useState("");
  const [nonce, setNonce] = useState("");
  const [ready, setReady] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[] | null>(null);
  const [workspacesError, setWorkspacesError] = useState(false);
  const [workspacesAttempt, setWorkspacesAttempt] = useState(0);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ workspaceName: string } | null>(null);

  useEffect(() => {
    setShop(urlParam("shop").trim().toLowerCase());
    setNonce(urlParam("nonce").trim());
    setReady(true);
  }, []);

  const validShop = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop);

  useEffect(() => {
    if (!user) {
      setWorkspaces(null);
      return;
    }
    let cancelled = false;
    setWorkspacesError(false);
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, "companies"), where("memberUids", "array-contains", user.uid)),
        );
        const list: WorkspaceOption[] = snap.docs
          .map((docSnap) => {
            const data = docSnap.data() as Record<string, unknown>;
            const name =
              (typeof data.companyName === "string" && data.companyName.trim()) ||
              (typeof data.name === "string" && data.name.trim()) ||
              "My Workspace";
            const isOwner =
              String(data.ownerUid || "") === user.uid || docSnap.id === user.uid;
            return { id: docSnap.id, name, isOwner };
          })
          .sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || a.name.localeCompare(b.name));
        if (!cancelled) {
          setWorkspaces(list);
          setSelected((prev) => prev || list.find((w) => w.isOwner)?.id || "");
        }
      } catch {
        // Distinguish "couldn't load" from "genuinely no workspaces" — a
        // rules/network failure must not read as an empty account.
        if (!cancelled) {
          setWorkspaces(null);
          setWorkspacesError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, workspacesAttempt]);

  async function connect() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const call = httpsCallable(functions, "shopifyCompleteConnect");
      const result = await call({ shop, nonce, companyId: selected });
      const data = (result.data ?? {}) as { workspaceName?: string };
      setDone({ workspaceName: data.workspaceName || "" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed. Please try again.";
      setError(message.replace(/^Firebase: /, ""));
    } finally {
      setBusy(false);
    }
  }

  const selfUrl = `/connect/shopify?shop=${encodeURIComponent(shop)}&nonce=${encodeURIComponent(nonce)}`;
  const nextParam = encodeURIComponent(selfUrl);

  let body: React.ReactNode;
  if (!ready || loading) {
    body = <p style={muted}>Loading…</p>;
  } else if (!validShop || !nonce) {
    body = (
      <>
        <p style={muted}>
          This page needs a valid connect link. Open the NivaDesk app inside your Shopify admin and
          press <strong>Connect</strong> again — the link it opens brings you right back here.
        </p>
      </>
    );
  } else if (done) {
    body = (
      <>
        <p style={{ fontSize: 40, margin: "0 0 6px" }}>✅</p>
        <p style={{ fontWeight: 700, margin: "0 0 8px" }}>
          {shop} is now connected{done.workspaceName ? ` to ${done.workspaceName}` : ""}.
        </p>
        <p style={muted}>
          Return to the Shopify tab — it updates to Connected automatically. New orders will start
          syncing right away. You can close this tab.
        </p>
      </>
    );
  } else if (!user) {
    body = (
      <>
        <p style={muted}>
          Connecting <strong>{shop}</strong> to NivaDesk. Sign in to your NivaDesk account — or
          create one in a minute — to choose which workspace this store syncs into.
        </p>
        <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
          <Link href={`/login?next=${nextParam}`} style={buttonPrimary}>
            Sign in to NivaDesk
          </Link>
          <Link href={`/signup?next=${nextParam}`} style={buttonGhost}>
            Create a NivaDesk account
          </Link>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <p style={muted}>
          Choose the workspace <strong>{shop}</strong> should sync into. Signed in as{" "}
          {user.email || "your account"} ·{" "}
          <Link href={`/login?next=${nextParam}`} style={{ color: "#214f4a" }}>
            switch account
          </Link>
        </p>
        {workspacesError ? (
          <p style={{ ...muted, margin: "16px 0" }}>
            Couldn&apos;t load your workspaces.{" "}
            <button
              type="button"
              onClick={() => setWorkspacesAttempt((n) => n + 1)}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: "#214f4a",
                fontWeight: 700,
                cursor: "pointer",
                textDecoration: "underline",
                font: "inherit",
              }}
            >
              Try again
            </button>
          </p>
        ) : workspaces === null ? (
          <p style={muted}>Loading workspaces…</p>
        ) : workspaces.length === 0 ? (
          <p style={muted}>No workspaces found for this account.</p>
        ) : (
          <div style={{ display: "grid", gap: 8, margin: "16px 0" }}>
            {workspaces.map((workspace) => (
              <label
                key={workspace.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 14px",
                  borderRadius: 12,
                  border:
                    selected === workspace.id
                      ? "2px solid #214f4a"
                      : "1px solid rgba(23, 25, 35, 0.14)",
                  cursor: workspace.isOwner ? "pointer" : "not-allowed",
                  opacity: workspace.isOwner ? 1 : 0.55,
                }}
              >
                <input
                  type="radio"
                  name="workspace"
                  checked={selected === workspace.id}
                  disabled={!workspace.isOwner}
                  onChange={() => setSelected(workspace.id)}
                />
                <span style={{ fontWeight: 700, fontSize: 14.5 }}>{workspace.name}</span>
                {!workspace.isOwner ? (
                  <span style={{ ...muted, fontSize: 12, marginLeft: "auto" }}>owner only</span>
                ) : null}
              </label>
            ))}
          </div>
        )}
        {error ? (
          <p style={{ color: "#b91c1c", fontSize: 13.5, fontWeight: 600, margin: "0 0 12px" }}>
            {t(error)}
          </p>
        ) : null}
        <button
          type="button"
          style={{ ...buttonPrimary, opacity: !selected || busy ? 0.6 : 1 }}
          disabled={!selected || busy}
          onClick={connect}
        >
          {busy ? "Connecting…" : "Connect store"}
        </button>
        <p style={{ ...muted, fontSize: 12.5, marginTop: 12 }}>
          Only what you allow is synced: orders, customer contact details and product info from this
          store. You can disconnect at any time from either side.
        </p>
      </>
    );
  }

  return (
    <div style={page}>
      <div style={card}>
        <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", color: "#65706d", margin: "0 0 6px" }}>
          NIVADESK × SHOPIFY
        </p>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 14px" }}>
          Connect your Shopify store
        </h1>
        {body}
      </div>
    </div>
  );
}
