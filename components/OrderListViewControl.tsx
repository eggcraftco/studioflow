"use client";

// GN-11 (22 Oct 2026): the Orders list's "View" row and its footer. The row chooses how the
// list loads (load more / page by page / show all) and how many orders at a time; the footer
// moves through the result. Both only change what is drawn: search, the filters, the counts
// and every total keep reading the whole list (lib/studioflow/orderListView.ts).
import { useEffect, useRef } from "react";
import { normalizeStudioLanguage, studioLocaleTag } from "@/lib/studioflow/language";
import {
  ORDER_LIST_PAGE_SIZES,
  ORDER_LIST_VIEW_MODES,
  type OrderListPageSize,
  type OrderListViewMode,
  type OrderListViewPreference,
  type OrderListWindow
} from "@/lib/studioflow/orderListView";

export function OrderListViewControl({
  preference,
  onChange,
  t,
  idPrefix
}: {
  preference: OrderListViewPreference;
  onChange: (next: OrderListViewPreference) => void;
  t: (text: string) => string;
  idPrefix: string;
}) {
  const sizeLabel = preference.mode === "paged" ? t("Orders per page") : t("Orders at a time");
  return (
    <div className="orders-view-control" role="group" aria-label={t("List view")} title={t("Search, filters and totals always cover every order.")}>
      <span className="orders-view-control-label" aria-hidden="true">{t("List view")}</span>
      <label className="orders-view-control-field">
        <span className="sr-only">{t("List view")}</span>
        <select
          id={`${idPrefix}-mode`}
          value={preference.mode}
          onChange={event => onChange({ ...preference, mode: event.target.value as OrderListViewMode })}
        >
          {ORDER_LIST_VIEW_MODES.map(mode => (
            <option key={mode.id} value={mode.id}>{t(mode.label)}</option>
          ))}
        </select>
      </label>
      {preference.mode === "all" ? null : (
        <label className="orders-view-control-field">
          <span className="sr-only">{sizeLabel}</span>
          <select
            id={`${idPrefix}-size`}
            aria-label={sizeLabel}
            value={preference.pageSize}
            onChange={event => onChange({ ...preference, pageSize: Number(event.target.value) as OrderListPageSize })}
          >
            {ORDER_LIST_PAGE_SIZES.map(size => (
              <option key={size} value={size}>{t(preference.mode === "paged" ? "{count} per page" : "{count} at a time").replace("{count}", String(size))}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

function formatCount(value: number, language: string) {
  try {
    // The app language's own digits and grouping ("1.449" in German), not the browser's.
    return new Intl.NumberFormat(studioLocaleTag(normalizeStudioLanguage(language))).format(value);
  } catch {
    return String(value);
  }
}

export function OrderListPager({
  mode,
  window: listWindow,
  onNext,
  onPrevious,
  t,
  language,
  step,
  compact = false
}: {
  mode: OrderListViewMode;
  window: OrderListWindow;
  onNext: () => void;
  onPrevious: () => void;
  t: (text: string) => string;
  language: string;
  /** How many one "load more" adds (the page size, or 100 for Show all). */
  step: number;
  /** The folded rail: arrows and a plus only, the words in their tooltips. */
  compact?: boolean;
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const onNextRef = useRef(onNext);
  useEffect(() => {
    onNextRef.current = onNext;
  }, [onNext]);

  // "Show all" keeps mounting the next hundred while the end of the list is in view, so a
  // large workspace arrives in steps instead of as one long freeze. A hidden list (the
  // phone list on a desktop, the full list behind the folded rail) never intersects.
  const autoLoad = mode === "all" && listWindow.hasMore && !compact;
  useEffect(() => {
    if (!autoLoad) return;
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) onNextRef.current();
    }, { rootMargin: "600px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [autoLoad, listWindow.end]);

  if (listWindow.total === 0) return null;
  const shownText = t("Showing {shown} of {total}")
    .replace("{shown}", mode === "paged" && listWindow.total > 0
      ? `${formatCount(listWindow.start + 1, language)}–${formatCount(listWindow.end, language)}`
      : formatCount(listWindow.end, language))
    .replace("{total}", formatCount(listWindow.total, language));
  const pageText = t("Page {page} of {pages}")
    .replace("{page}", formatCount(listWindow.page + 1, language))
    .replace("{pages}", formatCount(listWindow.pageCount, language));
  const moreCount = Math.min(listWindow.remaining, step);
  const moreText = t("Load {count} more").replace("{count}", formatCount(moreCount, language));

  if (compact) {
    if (mode === "paged") {
      if (listWindow.pageCount <= 1) return null;
      return (
        <div className="orders-rail-pager">
          <button type="button" disabled={!listWindow.hasPrevious} onClick={onPrevious} aria-label={t("Previous page")} title={`${t("Previous page")} · ${pageText}`}>‹</button>
          <span aria-label={pageText} title={pageText}>{listWindow.page + 1}/{listWindow.pageCount}</span>
          <button type="button" disabled={!listWindow.hasMore} onClick={onNext} aria-label={t("Next page")} title={`${t("Next page")} · ${pageText}`}>›</button>
        </div>
      );
    }
    if (!listWindow.hasMore) return null;
    return (
      <div className="orders-rail-pager">
        <button type="button" onClick={onNext} aria-label={`${moreText} · ${shownText}`} title={`${moreText} · ${shownText}`}>+</button>
      </div>
    );
  }

  return (
    <div className="orders-list-pager" data-orders-pager={mode}>
      <p className="orders-list-pager-status" aria-live="polite">
        {mode === "paged" && listWindow.pageCount > 1 ? `${pageText} · ${shownText}` : shownText}
      </p>
      {mode === "paged" ? (
        listWindow.pageCount > 1 ? (
          <div className="orders-list-pager-actions">
            <button type="button" className="button secondary" disabled={!listWindow.hasPrevious} onClick={onPrevious}>
              <span aria-hidden="true">‹ </span>{t("Previous page")}
            </button>
            <button type="button" className="button secondary" disabled={!listWindow.hasMore} onClick={onNext}>
              {t("Next page")}<span aria-hidden="true"> ›</span>
            </button>
          </div>
        ) : null
      ) : listWindow.hasMore ? (
        <div className="orders-list-pager-actions">
          <button type="button" className="button secondary" onClick={onNext}>{moreText}</button>
        </div>
      ) : null}
      {autoLoad ? <div ref={sentinelRef} className="orders-list-pager-sentinel" aria-hidden="true" /> : null}
    </div>
  );
}
