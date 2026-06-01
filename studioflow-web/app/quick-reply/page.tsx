"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CardIconGlyph, CardTitle } from "@/components/CardTitle";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  loadQuickReplySettings,
  loadWorkspaceContext,
  loadWorkspaceSettingsOverview,
  workspaceAccessAllows,
  type QuickReplySettings,
  type QuickReplyTemplateItem,
  type WorkspaceContext,
  type WorkspaceSettingsOverview
} from "@/lib/studioflow/firestore";
import { studioT } from "@/lib/studioflow/language";
import { canEditPersonalQuickReplySettingsForRole, generateQuickReply, loadQuickReplyPersonalSettings, saveQuickReplyPersonalSettings } from "@/lib/studioflow/quickReply";

function quickReplyTitle(mode: string, language: string | null | undefined) {
  if (mode === "Apple" || mode === "Local") return studioT("Apple On-Device AI Quick Reply", language);
  if (mode === "AI") return studioT("AI Quick Reply Assistant", language);
  return studioT("Offline Smart Templates", language);
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
  const [workspaceSettings, setWorkspaceSettings] = useState<WorkspaceSettingsOverview | null>(null);
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
        const [loadedSettings, loadedPersonalSettings, loadedWorkspaceSettings] = await Promise.all([
          loadQuickReplySettings(loadedWorkspace.id),
          loadQuickReplyPersonalSettings(loadedWorkspace),
          loadWorkspaceSettingsOverview(loadedWorkspace.id).catch(() => null)
        ]);
        const activeSettings: QuickReplySettings = {
          ...loadedSettings,
          replyMode: loadedPersonalSettings.replyMode,
          quickReplyPoliteness: loadedPersonalSettings.quickReplyPoliteness,
          quickReplyLength: loadedPersonalSettings.quickReplyLength,
          products: loadedPersonalSettings.products.length ? loadedPersonalSettings.products : loadedSettings.products,
          rules: loadedPersonalSettings.rules.length ? loadedPersonalSettings.rules : loadedSettings.rules
        };
        if (cancelled) return;
        setWorkspace(loadedWorkspace);
        setSettings(activeSettings);
        setWorkspaceSettings(loadedWorkspaceSettings);
        setPoliteness(activeSettings.quickReplyPoliteness);
        setReplyLength(activeSettings.quickReplyLength);
        setSelectedProductId(activeSettings.products[0]?.id || "");
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
  const language = workspaceSettings?.selectedLanguage ?? "English";
  const t = (text: string) => studioT(text, language);
  const selectedProduct = useMemo(
    () => products.find(product => product.id === selectedProductId) ?? products[0] ?? null,
    [products, selectedProductId]
  );
  const selectedRule = useMemo(
    () => rules.find(rule => rule.title === selectedTopic) ?? null,
    [rules, selectedTopic]
  );
  const canSaveReplyStyle = workspace ? canEditPersonalQuickReplySettingsForRole(workspace.role) : false;

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
      await saveQuickReplyPersonalSettings(workspace, {
        quickReplyPoliteness: nextPoliteness,
        quickReplyLength: nextReplyLength
      });
      setSettings(current => current ? { ...current, quickReplyPoliteness: nextPoliteness, quickReplyLength: nextReplyLength } : current);
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
          <header className="quick-reply-hero">
            <span className="quick-reply-hero-icon" aria-hidden="true">
              <CardIconGlyph icon="reply" />
            </span>
            <div>
              <h1>{quickReplyTitle(replyMode, language)}</h1>
              <p>{t("Create professional, context-aware replies in seconds.")}</p>
            </div>
          </header>

          {error ? (
            <section className="card app-card">
              <CardTitle icon="lock" eyebrow={t("Quick Reply error")} title={t("Could not load Quick Reply")} />
              <p className="layout-error">{error}</p>
            </section>
          ) : null}

          <section className="quick-reply-style-card">
            <div className="quick-reply-style-grid">
              <div>
                <span className="quick-reply-style-label"><CardIconGlyph icon="reply" /> {t("Politeness")}</span>
                <div className="segmented-control">
                  {["Direct", "Warm", "Very Polite"].map(option => (
                    <button key={option} className={politeness === option ? "active" : ""} type="button" disabled={styleSaving} onClick={() => updateReplyStyle("politeness", option)}>{t(option)}</button>
                  ))}
                </div>
              </div>
              <div>
                <span className="quick-reply-style-label"><CardIconGlyph icon="historyClock" /> {t("Length")}</span>
                <div className="segmented-control">
                  {["Short", "Balanced", "Detailed"].map(option => (
                    <button key={option} className={replyLength === option ? "active" : ""} type="button" disabled={styleSaving} onClick={() => updateReplyStyle("length", option)}>{t(option)}</button>
                  ))}
                </div>
              </div>
            </div>
            <p className="muted-copy">{canSaveReplyStyle ? t("These controls sync with Quick Reply Settings across web, Mac, iPad and iPhone.") : t("These controls change this draft only for your current workspace role.")}</p>
            {styleStatus ? <p className="success-copy">{t(styleStatus)}</p> : null}
            {styleError ? <p className="layout-error">{styleError}</p> : null}
          </section>

          <div className="quick-reply-grid">
            <div className="quick-reply-column">
              {!isOfflineMode ? (
                <section className="quick-reply-compose-card">
                  <div className="quick-reply-card-heading">
                    <span className="quick-reply-card-icon" aria-hidden="true"><CardIconGlyph icon="reply" /></span>
                    <div>
                      <h2>{replyMode === "Apple" ? t("Customer's Email / Message for Apple AI") : t("Customer's Email / Message")}</h2>
                      <p>{t("Paste the full email or message. The AI will detect the customer's name automatically.")}</p>
                    </div>
                    <span className="quick-reply-count">{customerMessage.length} / 8000</span>
                  </div>
                  <textarea
                    className="quick-reply-textarea"
                    value={customerMessage}
                    onChange={event => setCustomerMessage(event.target.value)}
                    placeholder={t("Paste the customer's email or message here...")}
                  />
                  <p className="quick-reply-tip"><span>✦</span> {t("Tip: Include as much context as possible for the best reply.")}</p>
                  <button className="button" type="button" disabled={isGenerating || !customerMessage.trim()} onClick={generateEngineReply}>
                    {isGenerating ? t("AI is reading the Knowledge Base...") : replyMode === "Apple" ? t("Generate Apple AI Reply") : t("Generate AI Reply")}
                  </button>
                  {replyError ? <p className="layout-error">{replyError}</p> : null}
                </section>
              ) : null}

              {isOfflineMode ? (
                <section className="quick-reply-compose-card">
                  <CardTitle icon="customer" eyebrow={t("Offline Template")} title={t("Customer Info")} />
                  <div className="quick-reply-form">
                    <label>
                      {t("Customer Name")}
                      <input className="input" value={customerName} onChange={event => setCustomerName(event.target.value)} placeholder={t("e.g. John")} />
                    </label>
                    <label>
                      {t("Product / Service")}
                      <select className="input" value={selectedProductId} onChange={event => setSelectedProductId(event.target.value)}>
                        {products.length === 0 ? <option value="">{t("No saved products")}</option> : null}
                        {products.map(product => <option key={product.id} value={product.id}>{product.title || t("Untitled product")}</option>)}
                      </select>
                    </label>
                    <label>
                      {t("Topic / Rule")}
                      <select className="input" value={selectedTopic} onChange={event => setSelectedTopic(event.target.value)}>
                        <option value="Price & Info">{t("Price & Info")}</option>
                        {rules.map(rule => <option key={rule.id} value={rule.title}>{rule.title || t("Untitled rule")}</option>)}
                      </select>
                    </label>
                    <button className="button" type="button" onClick={generateOfflineReply}>{t("Generate Template")}</button>
                    {products.length === 0 && rules.length === 0 ? (
                      <p className="muted-copy">{t("Add Products/Services or Custom Rules in Settings > Quick Reply Settings to make templates richer.")}</p>
                    ) : null}
                  </div>
                </section>
              ) : null}
            </div>

            <div className="quick-reply-column">
              <section className="quick-reply-compose-card">
                <div className="quick-reply-card-heading">
                  <span className="quick-reply-card-icon" aria-hidden="true"><CardIconGlyph icon="docText" /></span>
                  <div>
                    <h2>{t("Generated Email")}</h2>
                    <p>{t("Your AI-generated reply will appear here. Review and copy with one click.")}</p>
                  </div>
                </div>
                <textarea
                  className="quick-reply-textarea output"
                  value={generatedText}
                  onChange={event => {
                    setGeneratedText(event.target.value);
                    setCopied(false);
                  }}
                  placeholder={replyMode === "AI" ? t("The strict AI response based ON YOUR RULES will appear here...") : t("The template text will appear here...")}
                />
                <button className={copied ? "button success-button quick-reply-copy-button" : "button secondary quick-reply-copy-button"} type="button" disabled={!generatedText.trim()} onClick={copyReply}>
                  {copied ? t("Copied to Clipboard!") : t("Copy Reply")}
                </button>
              </section>
            </div>
          </div>
          <p className="quick-reply-security"><span>▢</span> {t("AI replies are generated securely and are not stored.")}</p>
        </div>
      </section>
    </AppShell>
  );
}
