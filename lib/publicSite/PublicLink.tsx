"use client";

// next/link for the public site: an internal link to a page that has language versions points at the version
// in the language being read, so /de/pricing links to /de/features and Google follows German pages through
// German links. Pages with one address (/privacy, /guide, /login, the app) keep theirs. The public pages import
// this as their `Link`, so a new <Link href="/faq"> is localized without anyone remembering to.
import Link from "next/link";
import type { ComponentProps } from "react";
import { usePublicSiteLanguageOptional } from "@/lib/publicSite/i18n";
import { localizedPublicHref } from "@/lib/publicSite/locales";

export default function PublicLink({ href, ...rest }: ComponentProps<typeof Link>) {
  const language = usePublicSiteLanguageOptional()?.language ?? "English";
  return <Link href={typeof href === "string" ? localizedPublicHref(href, language) : href} {...rest} />;
}
