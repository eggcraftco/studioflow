"use client";

import { Component, useEffect, useRef, useState, type ReactNode, useLayoutEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CardIconGlyph } from "@/components/CardTitle";
import {
  HOME_CARD_SIZES,
  homeCardColumns,
  homeCardRows,
  type HomeCardDefinition,
  type HomeCardPlacement,
  type HomeCardSize,
  type HomeCardTone,
} from "@/lib/studioflow/homeCards";

/**
 * The shell every Home card is drawn in — §4's common anatomy in one place, so
 * eleven cards cannot drift into eleven slightly different headers.
 *
 * Left: the six-dot handle, which moves the card and does nothing else. Then
 * the icon and heading, then whatever the card wants in its header slot, then
 * the three-dot menu. Content in the middle, and at most ONE link out at the
 * bottom, because a card that offers three destinations has stopped answering
 * "where do I go for the detail".
 */

export type HomeCardState =
  | { kind: "ready" }
  | { kind: "loading" }
  | { kind: "empty"; message: string; actionLabel?: string; onAction?: () => void }
  | { kind: "error"; message: string; onRetry?: () => void }
  | { kind: "offline"; message: string };

/**
 * One card failing must not take the screen with it (§18). This catches a
 * render-time throw inside a single card and leaves the rest of Home alone.
 */
class HomeCardBoundary extends Component<
  { children: ReactNode; label: string; t: (text: string) => string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Home card failed:", this.props.label, error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="home-card-state" role="status">
        <span className="home-card-state-icon" aria-hidden="true">!</span>
        <p>{this.props.t("This card could not be shown.")}</p>
        <button type="button" className="home-card-retry" onClick={() => this.setState({ failed: false })}>
          {this.props.t("Try again")}
        </button>
      </div>
    );
  }
}

export function HomeCardShell({
  definition,
  placement,
  state,
  customising,
  t,
  headerSlot,
  subtitle,
  children,
  onMove,
  onResize,
  onHide,
  onReset,
  onTone,
  onHeading,
  dragHandlers,
  lastUpdatedLabel,
}: {
  definition: HomeCardDefinition;
  placement: HomeCardPlacement;
  state: HomeCardState;
  customising: boolean;
  t: (text: string) => string;
  headerSlot?: ReactNode;
  /** Small line under the title — "3 of 6 complete", a date range. */
  subtitle?: string;
  children: ReactNode;
  onMove: (direction: -1 | 1) => void;
  onResize: (size: HomeCardSize) => void;
  onHide: () => void;
  onReset: () => void;
  onTone: (tone: HomeCardTone) => void;
  onHeading: (heading: string) => void;
  dragHandlers: {
    onDragStart: (event: React.DragEvent) => void;
    onDragEnd: (event: React.DragEvent) => void;
    onDragOver: (event: React.DragEvent) => void;
    onDrop: (event: React.DragEvent) => void;
    dragging: boolean;
    dropTarget: boolean;
  };
  lastUpdatedLabel?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  /** Which way the menu opens. Below by default, above when there is no room. */
  const [menuAbove, setMenuAbove] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftHeading, setDraftHeading] = useState(placement.heading ?? "");
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function close(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);

  // Decide the direction before the menu paints. The card no longer clips it,
  // but the shell's scroll area does, so a card low on the screen would open a
  // menu into the cut edge.
  useLayoutEffect(() => {
    if (!menuOpen) return;
    const button = menuRef.current?.querySelector("button");
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const estimatedHeight = 320;
    setMenuAbove(rect.bottom + estimatedHeight > window.innerHeight && rect.top > estimatedHeight);
  }, [menuOpen]);

  const router = useRouter();
  const heading = placement.heading?.trim() || t(definition.title);

  return (
    <section
      className={[
        "home-card",
        `home-card-${placement.size}`,
        // A 1x1 becomes a square tap target on a phone; the media query decides
        // whether the class does anything.
        placement.size === "1x1" ? "is-square" : "",
        placement.tone ? `home-tone-${placement.tone}` : "",
        customising ? "is-customising" : "",
        dragHandlers.dragging ? "is-dragging" : "",
        dragHandlers.dropTarget ? "is-drop-target" : "",
      ].filter(Boolean).join(" ")}
      onClick={(event) => {
        // The phone layout hides the footer link at every size, so the card
        // stands in for it. A click on something already interactive — a row
        // link, the menu, an action tile — is left alone.
        if (customising) return;
        const target = event.target as HTMLElement;
        if (target.closest("a, button, input")) return;
        if (!window.matchMedia("(max-width: 640px)").matches) return;
        router.push(definition.href);
      }}
      style={{
        gridColumn: `span ${homeCardColumns(placement.size)}`,
        gridRow: `span ${homeCardRows(placement.size)}`,
      }}
      aria-label={heading}
      onDragOver={dragHandlers.onDragOver}
      onDrop={dragHandlers.onDrop}
    >
      <header className="home-card-head">
        {/* Drag only from the handle: the card body has links and buttons in it,
            and a card that starts moving when you meant to tap a row is worse
            than one that cannot be moved at all. */}
        <button
          type="button"
          className="home-card-grip"
          aria-label={`${t("Move")} ${heading}`}
          draggable
          onDragStart={dragHandlers.onDragStart}
          onDragEnd={dragHandlers.onDragEnd}
          onKeyDown={(event) => {
            // Keyboard move (§20): the grid is reachable without a mouse.
            if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); onMove(-1); }
            if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); onMove(1); }
          }}
        >
          {/* Six dots in two columns, as the reference draws it — a braille glyph
              renders at a different weight in every font on every platform. */}
          <span className="home-grip-dots" aria-hidden="true">
            <i /><i /><i /><i /><i /><i />
          </span>
        </button>
        {/* A ringed badge, not a bare glyph: it is what gives every card the same
            anchor at the same size regardless of which icon it carries. */}
        <span className={`home-card-badge${definition.badge === "filled" ? " is-filled" : ""}`} aria-hidden="true">
          <CardIconGlyph icon={definition.icon} />
        </span>
        {renaming ? (
          <input
            className="home-card-heading-input"
            value={draftHeading}
            autoFocus
            maxLength={40}
            onChange={(event) => setDraftHeading(event.target.value)}
            onBlur={() => { onHeading(draftHeading); setRenaming(false); }}
            onKeyDown={(event) => {
              if (event.key === "Enter") { onHeading(draftHeading); setRenaming(false); }
              if (event.key === "Escape") { setDraftHeading(placement.heading ?? ""); setRenaming(false); }
            }}
            aria-label={t("Edit heading")}
          />
        ) : (
          <span className="home-card-titles">
            <h2 className="home-card-title">{heading}</h2>
            {subtitle ? <span className="home-card-subtitle">{subtitle}</span> : null}
          </span>
        )}
        <span className="home-card-head-slot">{headerSlot}</span>
        <div className="home-card-menu-wrap" ref={menuRef}>
          <button
            type="button"
            className="home-card-menu-button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`${heading} — ${t("Card options")}`}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span aria-hidden="true">···</span>
          </button>
          {menuOpen ? (
            <div className={`home-card-menu${menuAbove ? " is-above" : ""}`} role="menu">
              <p className="home-card-menu-label">{t("Resize")}</p>
              <div className="home-card-menu-sizes">
                {HOME_CARD_SIZES.filter((size) => definition.sizes.includes(size)).map((size) => (
                  <button
                    key={size}
                    type="button"
                    role="menuitemradio"
                    aria-checked={placement.size === size}
                    className={placement.size === size ? "is-active" : ""}
                    onClick={() => { onResize(size); setMenuOpen(false); }}
                  >
                    {size.replace("x", "×")}
                  </button>
                ))}
              </div>
              <p className="home-card-menu-label">{t("Choose colour")}</p>
              <div className="home-card-menu-tones">
                {(["default", "blue", "green", "amber", "purple", "rose"] as HomeCardTone[]).map((tone) => (
                  <button
                    key={tone}
                    type="button"
                    role="menuitemradio"
                    aria-checked={(placement.tone ?? "default") === tone}
                    aria-label={tone}
                    className={`home-tone-swatch home-tone-${tone}${(placement.tone ?? "default") === tone ? " is-active" : ""}`}
                    onClick={() => { onTone(tone); setMenuOpen(false); }}
                  />
                ))}
              </div>
              <button type="button" role="menuitem" onClick={() => { setRenaming(true); setMenuOpen(false); }}>
                {t("Edit heading")}
              </button>
              <button type="button" role="menuitem" onClick={() => { onHide(); setMenuOpen(false); }}>
                {t("Hide card")}
              </button>
              <button type="button" role="menuitem" onClick={() => { onReset(); setMenuOpen(false); }}>
                {t("Reset card")}
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <div className="home-card-body">
        <HomeCardBoundary label={definition.id} t={t}>
          {state.kind === "loading" ? (
            // A skeleton that keeps the card's size, so the grid does not jump
            // as cards arrive at different speeds.
            <div className="home-card-skeleton" aria-hidden="true">
              <span /><span /><span />
            </div>
          ) : state.kind === "error" ? (
            <div className="home-card-state" role="status">
              <p>{state.message}</p>
              {state.onRetry ? (
                <button type="button" className="home-card-retry" onClick={state.onRetry}>
                  {t("Try again")}
                </button>
              ) : null}
            </div>
          ) : state.kind === "offline" ? (
            <div className="home-card-state" role="status">
              <span className="home-card-offline-tag">{t("Offline")}</span>
              <p>{state.message}</p>
            </div>
          ) : state.kind === "empty" ? (
            <div className="home-card-state" role="status">
              <p>{state.message}</p>
              {state.actionLabel && state.onAction ? (
                <button type="button" className="home-card-retry" onClick={state.onAction}>
                  {state.actionLabel}
                </button>
              ) : null}
            </div>
          ) : (
            children
          )}
        </HomeCardBoundary>
      </div>

      <footer className="home-card-foot">
        {lastUpdatedLabel ? <span className="home-card-stale">{lastUpdatedLabel}</span> : <span />}
        <Link href={definition.href} className="home-card-link">
          {t(definition.linkLabel)}<span aria-hidden="true"> →</span>
        </Link>
      </footer>
    </section>
  );
}
