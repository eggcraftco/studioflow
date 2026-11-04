"use client";

// The footer's language row: a real link to every language version, so the versions are reachable by crawlers
// and people without the header's <select> (which a crawler cannot follow). On a page with language versions each
// link is that page in the language; on a one-address page (/privacy) it is the language's home page.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { rememberPublicSiteLanguage, usePublicSiteLanguage } from "@/lib/publicSite/i18n";
import {
  isLocalizedPublicPath,
  localizedPublicPath,
  PUBLIC_SITE_LOCALES,
  splitPublicLocalePath
} from "@/lib/publicSite/locales";
import styles from "./PublicLanguageLinks.module.css";

export function PublicLanguageLinks() {
  const { language, t } = usePublicSiteLanguage();
  const { path } = splitPublicLocalePath(usePathname());
  const target = isLocalizedPublicPath(path) ? path : "/";

  return (
    <nav className={`public-shell ${styles.languages}`} aria-label={t("language.selectorLabel")}>
      <span className={styles.globe} aria-hidden="true">🌐</span>
      <ul className={styles.list}>
        {PUBLIC_SITE_LOCALES.map(locale => (
          <li key={locale.code}>
            <Link
              href={localizedPublicPath(target, locale.language)}
              hrefLang={locale.hreflang}
              lang={locale.htmlLang}
              dir="auto"
              aria-current={locale.language === language ? "true" : undefined}
              className={styles.link}
              prefetch={false}
              onClick={() => rememberPublicSiteLanguage(locale.language)}
            >
              {locale.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
