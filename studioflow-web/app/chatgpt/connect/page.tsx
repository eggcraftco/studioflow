"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { doc, getDoc, getDocs, limit, query, where, collection } from "firebase/firestore";
import { auth, db, googleProvider } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/AuthProvider";

type WorkspaceOption = {
  id: string;
  name: string;
  role: string;
};

type OAuthParams = {
  client_id: string;
  redirect_uri: string;
  state: string;
  scope: string;
  code_challenge: string;
  code_challenge_method: string;
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function functionBaseUrl() {
  const explicit = process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const projectId = auth.app.options.projectId;
  if (!projectId) return "";
  return `https://europe-west2-${projectId}.cloudfunctions.net`;
}

function oauthParamsFromLocation(): OAuthParams {
  if (typeof window === "undefined") {
    return {
      client_id: "",
      redirect_uri: "",
      state: "",
      scope: "",
      code_challenge: "",
      code_challenge_method: ""
    };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    client_id: params.get("client_id") ?? "",
    redirect_uri: params.get("redirect_uri") ?? "",
    state: params.get("state") ?? "",
    scope: params.get("scope") ?? "orders.read orders.write",
    code_challenge: params.get("code_challenge") ?? "",
    code_challenge_method: params.get("code_challenge_method") ?? ""
  };
}

function isValidOAuthRequest(params: OAuthParams) {
  return Boolean(
    params.client_id &&
    params.redirect_uri &&
    params.code_challenge &&
    params.code_challenge_method === "S256"
  );
}

function workspaceName(data: Record<string, unknown>, fallback: string) {
  return (
    cleanText(data.companyName) ||
    cleanText(data.name) ||
    cleanText(data.appName) ||
    fallback
  );
}

function workspaceRole(data: Record<string, unknown>, uid: string) {
  if (cleanText(data.ownerUid) === uid) return "owner";
  const memberRoles = data.memberRoles && typeof data.memberRoles === "object" && !Array.isArray(data.memberRoles)
    ? data.memberRoles as Record<string, unknown>
    : {};
  return cleanText(memberRoles[uid]) || "member";
}

async function loadWorkspaces(user: NonNullable<ReturnType<typeof useAuth>["user"]>): Promise<WorkspaceOption[]> {
  const token = await user.getIdToken();
  const baseUrl = functionBaseUrl();
  if (!baseUrl) throw new Error("Firebase Functions base URL is not configured.");

  const response = await fetch(`${baseUrl}/chatgptOAuthWorkspaces`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || "Could not load workspaces.");
  }

  const items = Array.isArray(data.workspaces) ? data.workspaces : [];
  return items
    .map((item: Record<string, unknown>) => ({
      id: cleanText(item.id),
      name: cleanText(item.name) || "My Studio",
      role: cleanText(item.role) || "member"
    }))
    .filter((item: WorkspaceOption) => Boolean(item.id))
    .sort((a: WorkspaceOption, b: WorkspaceOption) => a.name.localeCompare(b.name));
}

export default function ChatGPTConnectPage() {
  const { user, loading } = useAuth();
  const oauthParams = useMemo(() => oauthParamsFromLocation(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const validRequest = isValidOAuthRequest(oauthParams);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!user) {
        setWorkspaces([]);
        setSelectedCompanyId("");
        return;
      }

      setLoadingWorkspaces(true);
      setError("");
      try {
        const items = await loadWorkspaces(user);
        if (cancelled) return;
        setWorkspaces(items);
        setSelectedCompanyId(current => current || items[0]?.id || "");
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load workspaces.");
        }
      } finally {
        if (!cancelled) setLoadingWorkspaces(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function handleEmailLogin(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Could not sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleLogin() {
    setError("");
    setSubmitting(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Could not sign in with Google.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAllow() {
    if (!user || !selectedCompanyId) return;
    setError("");
    setSubmitting(true);

    try {
      const token = await user.getIdToken();
      const baseUrl = functionBaseUrl();
      if (!baseUrl) throw new Error("Firebase Functions base URL is not configured.");

      const response = await fetch(`${baseUrl}/chatgptOAuthApprove`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...oauthParams,
          companyId: selectedCompanyId
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.redirect_uri) {
        throw new Error(data.message || data.error || "Could not approve ChatGPT connection.");
      }

      window.location.assign(data.redirect_uri);
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : "Could not approve ChatGPT connection.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancel() {
    if (!oauthParams.redirect_uri) {
      window.location.assign("/");
      return;
    }

    const redirect = new URL(oauthParams.redirect_uri);
    redirect.searchParams.set("error", "access_denied");
    redirect.searchParams.set("error_description", "User cancelled the NivaDesk connection.");
    if (oauthParams.state) redirect.searchParams.set("state", oauthParams.state);
    window.location.assign(redirect.toString());
  }

  return (
    <main style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #f7f7f9 0%, #ececf1 100%)",
      color: "#1d1d1f",
      padding: "32px 18px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}>
      <section style={{
        width: "100%",
        maxWidth: 720,
        background: "rgba(255,255,255,0.94)",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 28,
        boxShadow: "0 24px 80px rgba(15, 23, 42, 0.14)",
        padding: 28
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
          <img src="/brand/nivadesk-logo.png" alt="NivaDesk" style={{ width: 42, height: 42, objectFit: "contain" }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#6e6e73", letterSpacing: 0.5, textTransform: "uppercase" }}>
              ChatGPT connection
            </div>
            <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.08 }}>Connect NivaDesk</h1>
          </div>
        </div>

        <p style={{ color: "#6e6e73", lineHeight: 1.55, marginTop: 0 }}>
          Connect ChatGPT to the selected NivaDesk workspace. ChatGPT will only work inside the workspace you choose and access is still limited by your NivaDesk plan, role and permissions.
        </p>

        {!validRequest ? (
          <div style={{ background: "#fff2f2", color: "#a11", borderRadius: 16, padding: 16, fontWeight: 700 }}>
            This ChatGPT connection request is missing required OAuth parameters. Please start the connection again from ChatGPT.
          </div>
        ) : loading ? (
          <div style={{ padding: 24, color: "#6e6e73" }}>Checking your session...</div>
        ) : !user ? (
          <form onSubmit={handleEmailLogin} style={{ display: "grid", gap: 12, marginTop: 20 }}>
            <input
              value={email}
              onChange={event => setEmail(event.target.value)}
              type="email"
              required
              placeholder="Email"
              style={inputStyle}
            />
            <input
              value={password}
              onChange={event => setPassword(event.target.value)}
              type="password"
              required
              placeholder="Password"
              style={inputStyle}
            />
            <button type="submit" disabled={submitting} style={primaryButtonStyle}>
              {submitting ? "Signing in..." : "Sign in and continue"}
            </button>
            <button type="button" onClick={handleGoogleLogin} disabled={submitting} style={secondaryButtonStyle}>
              Continue with Google
            </button>
          </form>
        ) : (
          <div style={{ display: "grid", gap: 18, marginTop: 18 }}>
            <div style={{ background: "#f5f5f7", borderRadius: 18, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#6e6e73", marginBottom: 6 }}>Signed in as</div>
              <div style={{ fontWeight: 800 }}>{user.displayName || user.email || user.uid}</div>
              {user.email ? <div style={{ color: "#6e6e73", marginTop: 3 }}>{user.email}</div> : null}
            </div>

            <label style={{ display: "grid", gap: 8, fontWeight: 800 }}>
              Workspace
              <select
                value={selectedCompanyId}
                disabled={loadingWorkspaces || submitting || workspaces.length === 0}
                onChange={event => setSelectedCompanyId(event.target.value)}
                style={inputStyle}
              >
                {workspaces.map(workspace => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name} · {workspace.role}
                  </option>
                ))}
              </select>
            </label>

            {loadingWorkspaces ? <p style={{ color: "#6e6e73", margin: 0 }}>Loading workspaces...</p> : null}
            {!loadingWorkspaces && workspaces.length === 0 ? (
              <p style={{ color: "#a11", margin: 0 }}>No accessible workspace was found for this account.</p>
            ) : null}

            <div style={{
              display: "grid",
              gap: 8,
              background: "#f8f8fb",
              border: "1px solid rgba(0,0,0,0.06)",
              borderRadius: 18,
              padding: 16,
              color: "#3a3a3c"
            }}>
              <strong>ChatGPT will be able to:</strong>
              <span>• Search and summarise orders, tasks, timelines and dashboard information in the selected workspace.</span>
              <span>• View financial summaries only when your NivaDesk plan and role allow financial access.</span>
              <span>• Create new orders, add order notes, add personal notes and update order status after your request.</span>
              <span>• Read messages and quick replies only when your plan and role allow access.</span>
              <span>• It will not access other workspaces unless you connect them separately.</span>
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button type="button" onClick={handleCancel} disabled={submitting} style={secondaryButtonStyle}>Cancel</button>
              <button type="button" onClick={handleAllow} disabled={submitting || !selectedCompanyId} style={primaryButtonStyle}>
                {submitting ? "Connecting..." : "Allow ChatGPT"}
              </button>
            </div>
          </div>
        )}

        {error ? (
          <div style={{ marginTop: 16, background: "#fff2f2", color: "#a11", borderRadius: 16, padding: 14, fontWeight: 700 }}>
            {error}
          </div>
        ) : null}
      </section>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid rgba(0,0,0,0.12)",
  borderRadius: 14,
  padding: "13px 14px",
  fontSize: 16,
  background: "white",
  color: "#1d1d1f",
  boxSizing: "border-box"
};

const primaryButtonStyle: React.CSSProperties = {
  border: 0,
  borderRadius: 999,
  padding: "13px 18px",
  fontSize: 16,
  fontWeight: 800,
  background: "#111827",
  color: "white",
  cursor: "pointer"
};

const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.12)",
  borderRadius: 999,
  padding: "13px 18px",
  fontSize: 16,
  fontWeight: 800,
  background: "white",
  color: "#1d1d1f",
  cursor: "pointer"
};
