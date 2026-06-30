"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { AuthProviderButtons } from "@/components/AuthProviders";
import { AuthFeatureRotator } from "@/components/AuthFeatureRotator";
import { useAuth } from "@/lib/auth/AuthProvider";
import { LoadingScreen } from "@/components/LoadingScreen";
import type { StudioLanguage } from "@/lib/studioflow/language";
import {
  PublicSiteLanguageProvider,
  usePublicSiteLanguage
} from "@/lib/publicSite/i18n";

function LoginLanguageSelector() {
  const { language, languages, setLanguage, t } = usePublicSiteLanguage();
  return (
    <label className="public-language-select login-public-language">
      <span>{t("language.label")}</span>
      <select
        aria-label={t("language.selectorLabel")}
        value={language}
        onChange={event => setLanguage(event.target.value as StudioLanguage)}
      >
        {languages.map(option => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { t } = usePublicSiteLanguage();
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    if (!loading && user) router.replace("/orders");
  }, [loading, router, user]);

  async function handleEmailLogin(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.replace("/orders");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : t("login.errorLoginFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || user) return <LoadingScreen />;

  return (
    <main className="page-shell login-public-shell">
      <nav className="login-public-nav" aria-label={t("login.nav.publicNavigation")}>
        <Link href="/" className="login-public-brand">
          <img className="public-brand-logo" src="/brand/nivadesk-logo.png" alt={t("brand.name")} />
        </Link>
        <span className="login-public-actions">
          <span className="public-header-lang-desktop"><LoginLanguageSelector /></span>
          <Link href="/pricing">{t("nav.pricing")}</Link>
          <Link href="/signup">{t("cta.startFree")}</Link>
          <button
            type="button"
            className="public-header-menu-btn"
            aria-label={t("nav.publicPages")}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(v => !v)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </span>
      </nav>

      {menuOpen ? (
        <div className="public-header-mobile-menu login-mobile-menu">
          <Link href="/" onClick={closeMenu}>{t("nav.home")}</Link>
          <Link href="/features" onClick={closeMenu}>{t("nav.features")}</Link>
          <Link href="/pricing" onClick={closeMenu}>{t("nav.pricing")}</Link>
          <Link href="/faq" onClick={closeMenu}>{t("nav.faq")}</Link>
          <Link href="/signup" onClick={closeMenu}>{t("cta.startFree")}</Link>
          <div className="public-header-mobile-lang"><LoginLanguageSelector /></div>
        </div>
      ) : null}

      <section className="card login-card-frame login-card-app">
        <img className="login-card-logo" src="/brand/nivadesk-logo.png" alt={t("brand.name")} />

        <AuthFeatureRotator
          prefix={t("auth.rotator.prefix")}
          words={[
            t("auth.rotator.w1"),
            t("auth.rotator.w2"),
            t("auth.rotator.w3"),
            t("auth.rotator.w4"),
            t("auth.rotator.w5"),
            t("auth.rotator.w6"),
            t("auth.rotator.w7"),
            t("auth.rotator.w8"),
            t("auth.rotator.w9"),
            t("auth.rotator.w10"),
            t("auth.rotator.w11")
          ]}
        />

        <p className="login-card-subtitle">{t("login.title")}</p>

        <AuthProviderButtons
          appleLabel={t("auth.apple")}
          googleLabel={t("auth.google")}
          appleUnavailableMessage={t("auth.appleUnavailable")}
          disabled={submitting}
          onStart={() => {
            setError(null);
            setSubmitting(true);
          }}
          onSuccess={() => router.replace("/orders")}
          onError={message => {
            setSubmitting(false);
            if (message) setError(message);
          }}
        />

        {!showEmailForm ? (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
            <button
              type="button"
              onClick={() => setShowEmailForm(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                border: "none",
                cursor: "pointer",
                color: "var(--muted)",
                fontSize: 13,
                fontWeight: 600,
                padding: "9px 16px",
                borderRadius: 999,
                background: "color-mix(in srgb, var(--ink) 5%, transparent)"
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              {t("auth.continueWithEmail")}
            </button>
          </div>
        ) : null}

        {showEmailForm ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 4px" }}>
              <div style={{ height: 1, background: "var(--border)", flex: 1 }} />
              <span style={{ color: "var(--muted)", fontSize: 12, fontWeight: 700 }}>{t("login.or")}</span>
              <div style={{ height: 1, background: "var(--border)", flex: 1 }} />
            </div>

            <form onSubmit={handleEmailLogin} className="grid" style={{ marginTop: 14 }}>
              <input
                className="input"
                type="email"
                placeholder={t("login.emailPlaceholder")}
                value={email}
                onChange={event => setEmail(event.target.value)}
                required
              />
              <input
                className="input"
                type="password"
                placeholder={t("login.passwordPlaceholder")}
                value={password}
                onChange={event => setPassword(event.target.value)}
                required
              />
              {error ? <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p> : null}
              <button className="button" type="submit" disabled={submitting}>
                {t("login.signIn")}
              </button>
            </form>
          </>
        ) : null}
        {!showEmailForm && error ? <p style={{ color: "var(--danger)", margin: "12px 0 0", textAlign: "center" }}>{error}</p> : null}

        <p className="login-card-create">
          {t("auth.newHere")} <Link href="/signup">{t("auth.createAccount")}</Link>
        </p>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <PublicSiteLanguageProvider>
      <LoginPageContent />
    </PublicSiteLanguageProvider>
  );
}
