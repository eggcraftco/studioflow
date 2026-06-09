"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase/client";
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

  async function handleGoogleLogin() {
    setError(null);
    setSubmitting(true);
    try {
      await signInWithPopup(auth, googleProvider);
      router.replace("/orders");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : t("login.errorGoogleFailed"));
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

      <section className="card login-card-frame">
        <div className="pill">{t("login.portalPill")}</div>
        <h1 style={{ fontSize: 34, lineHeight: 1.05, margin: "18px 0 8px" }}>
          {t("login.title")}
        </h1>
        <p style={{ color: "var(--muted)", marginTop: 0 }}>
          {t("login.body")}
        </p>

        <form onSubmit={handleEmailLogin} className="grid" style={{ marginTop: 22 }}>
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

        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0" }}>
          <div style={{ height: 1, background: "var(--border)", flex: 1 }} />
          <span style={{ color: "var(--muted)", fontSize: 12, fontWeight: 700 }}>{t("login.or")}</span>
          <div style={{ height: 1, background: "var(--border)", flex: 1 }} />
        </div>

        <button className="button secondary" style={{ width: "100%" }} onClick={handleGoogleLogin} disabled={submitting}>
          {t("login.google")}
        </button>

        <p className="login-footnote">
          {t("login.footnotePrefix")} <Link href="/signup">{t("cta.startFree")}</Link> {t("login.footnoteOr")} <Link href="/pricing">{t("login.footnotePricing")}</Link>.
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
