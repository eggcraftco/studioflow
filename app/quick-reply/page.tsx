"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CardTitle } from "@/components/CardTitle";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  loadQuickReplySettings,
  loadWorkspaceContext,
  workspaceAccessAllows,
  type QuickReplySettings,
  type QuickReplyTemplateItem,
  type WorkspaceContext
} from "@/lib/studioflow/firestore";
import { canEditQuickReplySettingsForRole, generateQuickReply, saveQuickReplySettings } from "@/lib/studioflow/quickReply";

function quickReplyTitle(mode: string) {
  if (mode === "Apple" || mode === "Local") return "Apple On-Device AI Quick Reply";
  if (mode === "AI") return "AI Quick Reply Assistant";
  return "Offline Smart Templates";
}

function signOffForPoliteness(politeness: string) {
  return politeness === "Very Polite" ? "Kind regards," : "Best regards,";
}

function greetingForName(name: string, politeness: string) {
  const trimmedName = name.trim();
  if (!trimmedName) return politeness === "Direct" ? "Hi," : "Hi there,";
  return politeness === "Very Polite" ? `Dear ${trimmedName},` : `Hi ${trimmedName},`;
}

function buildOfflineReply({
  customerName,
  politeness,
  length,
  product,
  rule,
  topic
}: {
  customerName: string;
  politeness: string;
  length: string;
  product: QuickReplyTemplateItem | null;
  rule: QuickReplyTemplateItem | null;
  topic: string;
}) {
  let body = "";

  if (topic === "Price & Info") {
    body = politeness === "Direct" ? "" : "Thank you for your interest!\n\n";
    body += product?.desc?.trim() || "Thank you for your message. We will get back to you shortly.";
    if (length !== "Short") {
      body += "\n\nPlease let me know if you have any other questions.";
    }
  } else if (rule) {
    body = rule.desc.trim();
  } else {
    body = "Thank you for your message. We will get back to you shortly.";
  }

  if (length === "Detailed") {
    body += "\n\nIf helpful, please send any additional details and we will guide you through the next step.";
  }

  return [
    greetingForName(customerName, politeness),
    body.trim(),
    `${signOffForPoliteness(politeness)}\nThe Team`
  ].filter(Boolean).join("\n\n");
}

export default function QuickReplyPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [settings, setSettings] = useState<QuickReplySettings | null>(null);
  const [customerMessage, setCustomerMessage] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedTopic, setSelectedTopic] = useState("Price & Info");
  const [politeness, setPoliteness] = useState("Warm");
  const [replyLength, setReplyLength] = useState("Short");
  const [generatedText, setGeneratedText] = useState("");
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [styleSaving, setStyleSaving] = useState(false);
  const [styleStatus, setStyleStatus] = useState("");
  const [styleError, setStyleError] = useState("");
  const [loadingQuickReply, setLoadingQuickReply] = useState(true);
  const [error, setError] = useState("");
  const [replyError, setReplyError] = useState("");

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, router, user]);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    let cancelled = false;

    async function run() {
      setLoadingQuickReply(true);
      setError("");
      try {
        const loadedWorkspace = await loadWorkspaceContext(uid);
        if (!workspaceAccessAllows(loadedWorkspace.memberAccess, "quickReply")) {
          router.replace("/orders");
          return;
        }
        const loadedSettings = await loadQuickReplySettings(loadedWorkspace.id);
        if (cancelled) return;
        setWorkspace(loadedWorkspace);
        setSettings(loadedSettings);
        setPoliteness(loadedSettings.quickReplyPoliteness);
        setReplyLength(loadedSettings.quickReplyLength);
        setSelectedProductId(loadedSettings.products[0]?.id || "");
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not load Quick Reply.");
      } finally {
        if (!cancelled) setLoadingQuickReply(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const products = settings?.products ?? [];
  const rules = settings?.rules ?? [];
  const replyMode = settings?.replyMode === "Local" ? "Apple" : settings?.replyMode ?? "AI";
  const isOfflineMode = replyMode === "Offline";
  const selectedProduct = useMemo(
    () => products.find(product => product.id === selectedProductId) ?? products[0] ?? null,
    [products, selectedProductId]
  );
  const selectedRule = useMemo(
    () => rules.find(rule => rule.title === selectedTopic) ?? null,
    [rules, selectedTopic]
  );
  const canSaveReplyStyle = workspace ? canEditQuickReplySettingsForRole(workspace.role) : false;

  async function updateReplyStyle(kind: "politeness" | "length", option: string) {
    const nextPoliteness = kind === "politeness" ? option : politeness;
    const nextReplyLength = kind === "length" ? option : replyLength;
    setPoliteness(nextPoliteness);
    setReplyLength(nextReplyLength);
    setStyleStatus("");
    setStyleError("");

    if (!workspace || !settings || !canSaveReplyStyle) return;

    setStyleSaving(true);
    try {
      const result = await saveQuickReplySettings(workspace, {
        quickReplyPoliteness: nextPoliteness,
        quickReplyLength: nextReplyLength
      });
      if (result.settings) setSettings(result.settings);
      setStyleStatus("Reply style saved.");
      window.setTimeout(() => setStyleStatus(""), 1400);
    } catch (saveError) {
      setStyleError(saveError instanceof Error ? saveError.message : "Reply style could not be saved.");
    } finally {
      setStyleSaving(false);
    }
  }

  function generateOfflineReply() {
    const reply = buildOfflineReply({
      customerName,
      politeness,
      length: replyLength,
      product: selectedProduct,
      rule: selectedRule,
      topic: selectedTopic
    });
    setGeneratedText(reply);
    setCopied(false);
  }

  async function generateEngineReply() {
    if (!workspace) return;
    setReplyError("");
    setCopied(false);

    if (replyMode === "Apple") {
      setGeneratedText("Apple On-Device AI is only available inside the Swift app on Apple Intelligence-capable devices.\n\nYou can switch to OpenAI Online or Offline Template in Settings > Quick Reply Settings to generate replies on web.");
      return;
    }

    if (replyMode === "Offline") {
      generateOfflineReply();
      return;
    }

    setIsGenerating(true);
    try {
      const result = await generateQuickReply(workspace, {
        mode: replyMode,
        customerMessage,
        politeness,
        length: replyLength
      });
      setGeneratedText(result.reply || "");
    } catch (generateError) {
      setReplyError(generateError instanceof Error ? generateError.message : "Could not generate a Quick Reply.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function copyReply() {
    if (!generatedText.trim()) return;
    await navigator.clipboard.writeText(generatedText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (loading || !user) return <LoadingScreen />;

  return (
    <AppShell>
      {loadingQuickReply ? <LoadingScreen /> : null}

      <section className="quick-reply-workspace">
        <div className="quick-reply-shell">
          <header className="quick-reply-header">
            <div>
              <p className="orders-kicker">Quick Reply</p>
              <h1>{quickReplyTitle(replyMode)}</h1>
              <p>{workspace ? `${workspace.name} - ${workspace.roleLabel}` : "Loading workspace..."}</p>
            </div>
            {workspace ? <span className="studio-pill">{workspace.billingPlanName}</span> : null}
          </header>

          {error ? (
            <section className="card app-card">
              <CardTitle icon="lock" eyebrow="Quick Reply error" title="Could not load Quick Reply" />
              <p className="layout-error">{error}</p>
            </section>
          ) : null}

          <section className="card app-card quick-reply-style-card">
            <CardTitle icon="tasks" eyebrow="Reply Style" title="Default Reply Style" />
            <div className="quick-reply-style-grid">
              <div>
                <span>Politeness</span>
                <div className="segmented-control">
                  {["Direct", "Warm", "Very Polite"].map(option => (
                    <button key={option} className={politeness === option ? "active" : ""} type="button" disabled={styleSaving} onClick={() => updateReplyStyle("politeness", option)}>{option}</button>
                  ))}
                </div>
              </div>
              <div>
                <span>Length</span>
                <div className="segmented-control">
                  {["Short", "Balanced", "Detailed"].map(option => (
                    <button key={option} className={replyLength === option ? "active" : ""} type="button" disabled={styleSaving} onClick={() => updateReplyStyle("length", option)}>{option}</button>
                  ))}
                </div>
              </div>
            </div>
            <p className="muted-copy">{canSaveReplyStyle ? "These controls sync with Quick Reply Settings across web, Mac, iPad and iPhone." : "These controls change this draft only for your current workspace role."}</p>
            {styleStatus ? <p className="success-copy">{styleStatus}</p> : null}
            {styleError ? <p className="layout-error">{styleError}</p> : null}
          </section>

          <div className="quick-reply-grid">
            <div className="quick-reply-column">
              {!isOfflineMode ? (
                <section className="card app-card">
                  <CardTitle icon="notes" eyebrow="Customer Message" title={replyMode === "Apple" ? "Customer's Email / Message for Apple AI" : "Customer's Email / Message"} />
                  <textarea
                    className="quick-reply-textarea"
                    value={customerMessage}
                    onChange={event => setCustomerMessage(event.target.value)}
                    placeholder="Paste the full email or message here. The AI will find the customer's name automatically..."
                  />
                  <button className="button" type="button" disabled={isGenerating || !customerMessage.trim()} onClick={generateEngineReply}>
                    {isGenerating ? "AI is reading the Knowledge Base..." : replyMode === "Apple" ? "Generate Apple AI Reply" : "Generate AI Reply"}
                  </button>
                  {replyError ? <p className="layout-error">{replyError}</p> : null}
                </section>
              ) : null}

              {isOfflineMode ? (
                <section className="card app-card">
                  <CardTitle icon="customer" eyebrow="Offline Template" title="Customer Info" />
                  <div className="quick-reply-form">
                    <label>
                      Customer Name
                      <input className="input" value={customerName} onChange={event => setCustomerName(event.target.value)} placeholder="e.g. John" />
                    </label>
                    <label>
                      Product / Service
                      <select className="input" value={selectedProductId} onChange={event => setSelectedProductId(event.target.value)}>
                        {products.length === 0 ? <option value="">No saved products</option> : null}
                        {products.map(product => <option key={product.id} value={product.id}>{product.title || "Untitled product"}</option>)}
                      </select>
                    </label>
                    <label>
                      Topic / Rule
                      <select className="input" value={selectedTopic} onChange={event => setSelectedTopic(event.target.value)}>
                        <option value="Price & Info">Price & Info</option>
                        {rules.map(rule => <option key={rule.id} value={rule.title}>{rule.title || "Untitled rule"}</option>)}
                      </select>
                    </label>
                    <button className="button" type="button" onClick={generateOfflineReply}>Generate Template</button>
                    {products.length === 0 && rules.length === 0 ? (
                      <p className="muted-copy">Add Products/Services or Custom Rules in Settings &gt; Quick Reply Settings to make templates richer.</p>
                    ) : null}
                  </div>
                </section>
              ) : null}
            </div>

            <div className="quick-reply-column">
              <section className="card app-card">
                <CardTitle icon="export" eyebrow="Generated Email" title="Generated Email" />
                <textarea
                  className="quick-reply-textarea output"
                  value={generatedText}
                  onChange={event => {
                    setGeneratedText(event.target.value);
                    setCopied(false);
                  }}
                  placeholder={replyMode === "AI" ? "The strict AI response based ON YOUR RULES will appear here..." : "The template text will appear here..."}
                />
                <button className={copied ? "button success-button" : "button secondary"} type="button" disabled={!generatedText.trim()} onClick={copyReply}>
                  {copied ? "Copied to Clipboard!" : "Copy Reply"}
                </button>
              </section>
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
