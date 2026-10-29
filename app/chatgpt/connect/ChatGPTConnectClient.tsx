"use client";

import { useEffect, useState, type FormEvent } from "react";
import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { doc, getDoc, getDocs, limit, query, where, collection } from "firebase/firestore";
import { auth, db, googleProvider } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { studioT } from "@/lib/studioflow/language";
import { friendlyErrorMessage } from "@/lib/studioflow/friendlyError";
import { assistantNameForResource, clientMetadataHost, connectCapabilities } from "@/lib/chatgpt/claudeMcp";
import { cancelRedirectUrl, describeRequestedScopes, serverClientName } from "@/lib/chatgpt/oauthConnect";

type WorkspaceOption = {
  id: string;
  name: string;
  role: string;
};

export type OAuthParams = {
  client_id: string;
  redirect_uri: string;
  state: string;
  scope: string;
  code_challenge: string;
  code_challenge_method: string;
  resource: string;
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
      code_challenge_method: "",
      resource: "https://nivadesk.app/chatgptMcp"
    };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    client_id: params.get("client_id") ?? "",
    redirect_uri: params.get("redirect_uri") ?? "",
    state: params.get("state") ?? "",
    // Empty, not a grant this page invented. When ChatGPT names no scope the
    // SERVER decides what the connection gets (nvOAuthDefaultScope), which is
    // the list its own metadata advertises; a default typed here was smaller
    // than that list, so a connection made without an explicit scope could not
    // call the finance tools the same server advertises.
    scope: params.get("scope") ?? "",
    code_challenge: params.get("code_challenge") ?? "",
    code_challenge_method: params.get("code_challenge_method") ?? "",
    resource: params.get("resource") ?? "https://nivadesk.app/chatgptMcp"
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

async function loadWorkspaces(
  user: NonNullable<ReturnType<typeof useAuth>["user"]>,
  oauthParams: OAuthParams
): Promise<{ workspaces: WorkspaceOption[]; clientName: string }> {
  const token = await user.getIdToken();
  const baseUrl = functionBaseUrl();
  if (!baseUrl) throw new Error("ChatGPT connection is not available right now. Please try again later.");

  // The request being approved goes along, so the server can name the client it
  // registered (`client.name` in the answer). A server that does not read these
  // ignores them; the page then shows the client's published host, if any.
  const query = new URLSearchParams();
  if (oauthParams.client_id) query.set("client_id", oauthParams.client_id);
  if (oauthParams.redirect_uri) query.set("redirect_uri", oauthParams.redirect_uri);
  if (oauthParams.scope) query.set("scope", oauthParams.scope);
  const search = query.toString();
  const response = await fetch(`${baseUrl}/chatgptOAuthWorkspaces${search ? `?${search}` : ""}`, {
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
  const workspaces = items
    .map((item: Record<string, unknown>) => ({
      id: cleanText(item.id),
      name: cleanText(item.name) || "My Studio",
      role: cleanText(item.role) || "member"
    }))
    .filter((item: WorkspaceOption) => Boolean(item.id))
    .sort((a: WorkspaceOption, b: WorkspaceOption) => a.name.localeCompare(b.name));
  return { workspaces, clientName: serverClientName(data) };
}

export default function ChatGPTConnectClient({ initialOAuthParams }: { initialOAuthParams: OAuthParams }) {
  const { user, loading, language } = useAuth();
  const t = (text: string) => studioT(text, language);
  const [oauthParams, setOauthParams] = useState<OAuthParams>(initialOAuthParams);

  useEffect(() => {
    setOauthParams(oauthParamsFromLocation());
  }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [clientName, setClientName] = useState("");
  const [cancelled, setCancelled] = useState(false);

  // Parsed rather than printed raw: a URL is long, and the host is the part
  // that decides where the code lands.
  const redirectHost = (() => {
    try {
      return oauthParams.redirect_uri ? new URL(oauthParams.redirect_uri).host : "";
    } catch {
      return "";
    }
  })();

  const validRequest = isValidOAuthRequest(oauthParams);
  // The workspace list is loaded again only when the request itself changes, not
  // when the same values are re-read from the address bar after mount.
  const clientRequestKey = JSON.stringify([oauthParams.client_id, oauthParams.redirect_uri, oauthParams.scope]);

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
        const [clientId, redirectUri, scope] = JSON.parse(clientRequestKey) as [string, string, string];
        const loaded = await loadWorkspaces(user, { ...oauthParams, client_id: clientId, redirect_uri: redirectUri, scope });
        if (cancelled) return;
        const items = loaded.workspaces;
        setWorkspaces(items);
        setClientName(loaded.clientName);
        setSelectedCompanyId(current => current || items[0]?.id || "");
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? t(loadError.message) : t("Could not load workspaces."));
        }
      } finally {
        if (!cancelled) setLoadingWorkspaces(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the request's values (clientRequestKey)
  }, [user, clientRequestKey]);

  async function handleEmailLogin(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (loginError) {
      setError(friendlyErrorMessage(loginError, t) || t("Could not sign in."));
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
      setError(friendlyErrorMessage(loginError, t) || t("Could not sign in with Google."));
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
      if (!baseUrl) throw new Error("ChatGPT connection is not available right now. Please try again later.");

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
      setError(approveError instanceof Error ? t(approveError.message) : t("Could not approve ChatGPT connection."));
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancel() {
    // Back to the assistant only when redirect_uri is one of the assistants the
    // server accepts (lib/chatgpt/oauthConnect.ts). Anything else came from the
    // link, not from a registration, so the page stays here instead of becoming
    // an open redirect on nivadesk.app (audit #10).
    const target = cancelRedirectUrl(oauthParams);
    if (target) {
      window.location.assign(target);
      return;
    }
    setCancelled(true);
  }

  // Which assistant asked: Claude when the request names the Claude endpoint
  // (https://nivadesk.app/claudeMcp), ChatGPT otherwise — the same words as
  // before for every ChatGPT connection. Wording only; the grant is the same.
  const assistant = assistantNameForResource(oauthParams.resource);
  // The list comes from the tools of the endpoint being authorised (lib/chatgpt/claudeMcp.ts), not one fixed text.
  const capabilities = connectCapabilities(oauthParams.resource);
  // A client that names itself with a published metadata document (CIMD): its host is who is asking.
  const requesterHost = clientMetadataHost(oauthParams.client_id);
  // What is being asked for, in words: the scopes in the request (or the server's default when none is named).
  const requested = describeRequestedScopes(oauthParams.scope);

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
              {assistant} connection
            </div>
            <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.08 }}>Connect NivaDesk</h1>
          </div>
        </div>

        <p style={{ color: "#6e6e73", lineHeight: 1.55, marginTop: 0 }}>
          Connect {assistant} to the selected NivaDesk workspace. {assistant} will only work inside the workspace you choose and access is still limited by your NivaDesk plan, role and permissions.
        </p>

        {/* Where the authorization actually goes. This screen sits on the real
            nivadesk.app domain and looks the same whoever sent the link, so the
            destination is the one thing a person can use to tell a genuine
            connection from a crafted one. The server refuses an unregistered
            destination outright; this is so the person can see it too. */}
        {requesterHost ? (
          <p style={{ color: "#6e6e73", lineHeight: 1.55, marginTop: -6, fontSize: 14 }}>
            Requested by <strong style={{ color: "#1d1d1f" }}>{requesterHost}</strong> (the client&apos;s published identity).
          </p>
        ) : null}

        {redirectHost ? (
          <p style={{ color: "#6e6e73", lineHeight: 1.55, marginTop: -6, fontSize: 14 }}>
            After you allow it, NivaDesk will send the authorization to{" "}
            <strong style={{ color: "#1d1d1f" }}>{redirectHost}</strong>. If you were not expecting
            that address, close this page.
          </p>
        ) : null}

        {cancelled ? (
          <div style={{ background: "#f5f5f7", borderRadius: 16, padding: 16, fontWeight: 700 }} data-testid="connect-cancelled">
            Connection cancelled. Nothing was shared with {assistant}. You can close this page.
          </div>
        ) : !validRequest ? (
          <div style={{ background: "#fff2f2", color: "#a11", borderRadius: 16, padding: 16, fontWeight: 700 }}>
            This {assistant} connection request is missing required OAuth parameters. Please start the connection again from {assistant}.
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
              placeholder={t("Email")}
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

            <div style={{ background: "#f5f5f7", borderRadius: 18, padding: 16, display: "grid", gap: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#6e6e73" }}>Application</div>
              <div style={{ fontWeight: 800 }} data-testid="connect-client-name">{clientName || requesterHost || `${assistant} connector`}</div>
              {oauthParams.client_id ? (
                <div style={{ color: "#6e6e73", fontSize: 12, wordBreak: "break-all" }}>
                  Client ID: <code>{oauthParams.client_id.slice(0, 120)}</code>
                </div>
              ) : null}
            </div>

            <div style={{ display: "grid", gap: 6, border: "1px solid rgba(0,0,0,0.08)", borderRadius: 18, padding: 16 }} data-testid="connect-requested-scopes">
              <strong>Requested access{requested.usesDefault ? " (NivaDesk default)" : ""}:</strong>
              {requested.lines.map(line => <span key={line}>• {line}</span>)}
              {requested.unknown.length ? (
                <span style={{ color: "#6e6e73", fontSize: 14 }}>
                  Not recognised by NivaDesk (grants nothing): {requested.unknown.join(", ")}
                </span>
              ) : null}
            </div>

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
              <strong>{assistant} will be able to:</strong>
              {capabilities.map((line) => <span key={line}>• {line}</span>)}
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button type="button" onClick={handleCancel} disabled={submitting} style={secondaryButtonStyle}>{t("Cancel")}</button>
              <button type="button" onClick={handleAllow} disabled={submitting || !selectedCompanyId} style={primaryButtonStyle}>
                {submitting ? "Connecting..." : `Allow ${assistant}`}
              </button>
            </div>
          </div>
        )}

        {error ? (
          <div style={{ marginTop: 16, background: "#fff2f2", color: "#a11", borderRadius: 16, padding: 14, fontWeight: 700 }}>
            {t(error)}
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
