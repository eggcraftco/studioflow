"use client";

// Settings → Online booking (1 Nov 2026). Design: docs/integrations/ONLINE-BOOKING-TASARIM-2026-11-01.md.
//
// A public page (nivadesk.app/book/<name>) where customers pick a service and a free time. The first visit
// is a three-step quick setup (link name, a first service suggested from the business type, opening
// hours) that ends with the page on — about two minutes. After that, everything is on one screen: the
// page and its link/QR/embed code, services, hours (per person on Team), rules, the form, notifications,
// and the requests waiting for an answer.
//
// The server decides everything that matters (functions/booking/bookingFunctions.js `bookingAdmin`):
// the workspace must be open for online booking (appConfig/onlineBooking), the plan must be Pro or Team,
// only the owner or an admin may change the setup, and the setup is refused — never quietly repaired —
// when something in it cannot work; the problems come back and are shown next to the fields.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { SettingsCardHead } from "./pageHeader";
import { studioT } from "@/lib/studioflow/language";
import { friendlyErrorMessage } from "@/lib/studioflow/friendlyError";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import {
  BOOKING_SLUG_PATTERN,
  BUFFER_CHOICES,
  CUTOFF_CHOICES,
  DAYS_AHEAD_CHOICES,
  DURATION_CHOICES,
  NOTICE_CHOICES,
  REMINDER_CHOICES,
  STEP_CHOICES,
  WEEKDAY_KEYS,
  actOnBooking,
  blankService,
  bookingEmbedCode,
  checkBookingSlug,
  defaultHours,
  listBookings,
  listPendingBookings,
  loadBookingSetup,
  presetsForBusinessType,
  priceMinorFrom,
  priceText,
  saveBookingSetup,
  type BookingConfig,
  type BookingHours,
  type BookingProvider,
  type BookingService,
  type BookingSetup,
  type StaffBooking
} from "@/lib/studioflow/onlineBooking";
import styles from "./onlineBooking.module.css";

type Props = { workspace: WorkspaceContext; language?: string };

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function minutesLabel(n: number, t: (s: string) => string): string {
  if (n === 0) return t("None");
  if (n % 10080 === 0) return t("{n} weeks").replace("{n}", String(n / 10080)).replace("1 weeks", t("1 week"));
  if (n % 1440 === 0) return n === 1440 ? t("1 day") : t("{n} days").replace("{n}", String(n / 1440));
  if (n % 60 === 0) return n === 60 ? t("1 hour") : t("{n} hours").replace("{n}", String(n / 60));
  return t("{n} min").replace("{n}", String(n));
}

function problemsOf(error: unknown): string[] {
  const details = (error as { details?: { problems?: string[]; reason?: string } })?.details;
  return Array.isArray(details?.problems) ? details.problems : [];
}

function reasonOf(error: unknown): string {
  return String((error as { details?: { reason?: string } })?.details?.reason || "");
}

export function OnlineBookingSection({ workspace, language = "English" }: Props) {
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const [setup, setSetup] = useState<BookingSetup | null>(null);
  const [draft, setDraft] = useState<BookingConfig | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [saved, setSaved] = useState("");
  const [copied, setCopied] = useState("");
  const [qr, setQr] = useState("");
  const [pending, setPending] = useState<StaffBooking[]>([]);
  const [upcoming, setUpcoming] = useState<StaffBooking[]>([]);
  const [acting, setActing] = useState("");
  const requestRef = useRef(0);

  const reload = useCallback(async () => {
    const ticket = (requestRef.current += 1);
    setLoadError("");
    try {
      const answer = await loadBookingSetup(workspace.id);
      if (ticket !== requestRef.current) return;
      setSetup(answer);
      setDraft(answer.config);
      setVersion(answer.saved ? (answer.version ?? null) : 0);
      if (answer.saved) {
        const [p, u] = await Promise.all([
          listPendingBookings(workspace.id).catch(() => ({ bookings: [] as StaffBooking[] })),
          listBookings(workspace.id, Date.now() - 3600000, Date.now() + 14 * 86400000).catch(() => ({ bookings: [] as StaffBooking[] }))
        ]);
        if (ticket !== requestRef.current) return;
        setPending(p.bookings);
        setUpcoming(u.bookings.filter((b) => b.status === "confirmed" || b.status === "pending"));
      }
    } catch (error) {
      if (ticket !== requestRef.current) return;
      setLoadError(friendlyErrorMessage(error, t));
    }
  }, [workspace.id, t]);

  useEffect(() => { setSetup(null); setDraft(null); void reload(); }, [reload]);

  const url = setup?.url || null;
  useEffect(() => {
    let alive = true;
    if (!url) { setQr(""); return; }
    QRCode.toDataURL(url, { margin: 1, width: 360 }).then((data) => { if (alive) setQr(data); }).catch(() => setQr(""));
    return () => { alive = false; };
  }, [url]);

  const dirty = useMemo(() => Boolean(setup && draft && JSON.stringify(setup.config) !== JSON.stringify(draft)), [setup, draft]);
  const canEdit = Boolean(setup?.canManage && setup.planAllowed && setup.open);

  async function save(next: BookingConfig = draft as BookingConfig, message = t("Saved.")) {
    if (!setup || !next) return false;
    setSaving(true);
    setSaveError("");
    setProblems([]);
    setSaved("");
    try {
      const answer = await saveBookingSetup(workspace.id, next, setup.saved ? version : 0);
      setSetup({ ...setup, saved: true, config: answer.config, url: answer.url });
      setDraft(answer.config);
      setVersion(answer.version);
      setSaved(message);
      return true;
    } catch (error) {
      const list = problemsOf(error);
      setProblems(list);
      const reason = reasonOf(error);
      setSaveError(
        reason === "stale" ? t("Someone else changed online booking a moment ago. Reload the page and try again.")
          : reason === "booking_plan_required" ? t("Online booking is part of NivaDesk Pro and Team.")
            : reason === "booking_not_open" ? t("Online booking is not open for this workspace yet.")
              : list.includes("slug.taken") ? t("This link name is taken. Try another.")
                : list.length ? t("Some settings need fixing — see the highlighted fields.")
                  : friendlyErrorMessage(error, t)
      );
      return false;
    } finally {
      setSaving(false);
    }
  }

  function copy(value: string, key: string) {
    void navigator.clipboard?.writeText(value).then(() => { setCopied(key); setTimeout(() => setCopied(""), 1600); });
  }

  async function act(b: StaffBooking, action: "confirm" | "decline") {
    setActing(b.id);
    try {
      await actOnBooking(workspace.id, b.id, action);
      setPending((list) => list.filter((x) => x.id !== b.id));
      setSaved(action === "confirm" ? t("Booking confirmed. The customer has been emailed.") : t("Request declined. The customer has been emailed."));
    } catch (error) {
      setSaveError(friendlyErrorMessage(error, t));
    } finally {
      setActing("");
    }
  }

  if (loadError) return <div className="settings-card-stack"><section className="card app-card"><p className="layout-error" role="alert">{loadError}</p><button type="button" className="button secondary" onClick={() => void reload()}>{t("Try again")}</button></section></div>;
  if (!setup || !draft) return <div className="settings-card-stack"><section className="card app-card"><p className="muted-copy">{t("Loading…")}</p></section></div>;

  const gate = !setup.planAllowed
    ? <p className="settings-field-hint is-caution" data-testid="booking-gate">{t("Online booking is part of NivaDesk Pro and Team.")} <Link href="/plan">{t("See plans")}</Link></p>
    : !setup.open
      ? <p className="settings-field-hint is-caution" data-testid="booking-gate">{t("Online booking is being opened workspace by workspace. It is not open for this workspace yet.")}</p>
      : !setup.canManage
        ? <p className="settings-field-hint is-caution" data-testid="booking-gate">{t("Only the workspace owner or an admin can change online booking.")}</p>
        : null;

  return (
    <div className="settings-card-stack" data-testid="online-booking-settings">
      {!setup.saved ? (
        <QuickSetup companyId={workspace.id} setup={setup} t={t} disabled={!canEdit || saving} gate={gate} onDone={(config) => save(config, t("Your booking page is on."))} saveError={saveError} problems={problems} />
      ) : (
        <>
          <section className="card app-card">
            <SettingsCardHead title={t("Your booking page")} subtitle={t("Customers choose a service and a free time. Bookings go into your Calendar and Customers.")} />
            {gate}
            <div className="settings-switch-list">
              <label className="settings-switch-line">
                <span className="settings-switch-line-copy">
                  <strong>{t("Booking page is on")}</strong>
                  <small>{draft.enabled ? t("Anyone with the link can book.") : t("The link shows “not available” until you turn it on.")}</small>
                </span>
                <input type="checkbox" className="settings-switch" role="switch" aria-checked={draft.enabled} aria-label={t("Booking page is on")} data-testid="booking-enabled" checked={draft.enabled} disabled={!canEdit || saving}
                  onChange={(e) => void save({ ...draft, enabled: e.target.checked }, e.target.checked ? t("Your booking page is on.") : t("Your booking page is off."))} />
              </label>
            </div>
            {url ? (
              <div className={styles.share}>
                <div className="settings-link-row">
                  <code className="settings-link-box" data-testid="booking-url">{url}</code>
                  <button type="button" className="button secondary" onClick={() => copy(url, "url")}>{copied === "url" ? t("Copied!") : t("Copy")}</button>
                  <a className="button secondary" href={url} target="_blank" rel="noreferrer">{t("Open")}</a>
                </div>
                <div className={styles.shareRow}>
                  {qr ? (
                    <figure className={styles.qr}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qr} alt={t("QR code for your booking page")} width={140} height={140} />
                      <a className="button secondary" href={qr} download="booking-qr.png">{t("Download QR code")}</a>
                    </figure>
                  ) : null}
                  <div className={styles.embed}>
                    <strong>{t("Put it on your website")}</strong>
                    <small className="settings-field-hint">{t("Paste this code where the booking page should appear. It sizes itself.")}</small>
                    <textarea readOnly className="input" rows={4} value={bookingEmbedCode(url)} onFocus={(e) => e.currentTarget.select()} />
                    <button type="button" className="button secondary" onClick={() => copy(bookingEmbedCode(url), "embed")}>{copied === "embed" ? t("Copied!") : t("Copy code")}</button>
                  </div>
                </div>
                <p className="settings-field-hint">{t("Share the link in your Instagram bio, Google Business profile, email signature or on a printed card with the QR code.")}</p>
              </div>
            ) : null}
            <SlugField draft={draft} setDraft={setDraft} t={t} disabled={!canEdit} problems={problems} />
          </section>

          {pending.length ? (
            <section className="card app-card" data-testid="booking-pending">
              <SettingsCardHead title={t("Requests waiting for you")} subtitle={t("Confirm or decline. The customer is emailed either way.")} />
              <ul className={styles.list}>
                {pending.map((b) => (
                  <li key={b.id} className={styles.listRow}>
                    <span><strong>{b.customer.name}</strong> · {b.serviceName}<br /><small>{b.dateKey} {b.startTime} · {b.customer.email}{b.customer.phone ? ` · ${b.customer.phone}` : ""}</small></span>
                    <span className={styles.rowActions}>
                      <button type="button" className="button" disabled={acting === b.id} onClick={() => void act(b, "confirm")}>{t("Confirm")}</button>
                      <button type="button" className="button secondary" disabled={acting === b.id} onClick={() => void act(b, "decline")}>{t("Decline")}</button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <ServicesCard draft={draft} setDraft={setDraft} setup={setup} t={t} disabled={!canEdit} problems={problems} />
          <HoursCard draft={draft} setDraft={setDraft} setup={setup} t={t} disabled={!canEdit} problems={problems} />
          <RulesCard draft={draft} setDraft={setDraft} t={t} disabled={!canEdit} />
          <FormCard draft={draft} setDraft={setDraft} t={t} disabled={!canEdit} />

          <section className="card app-card">
            <SettingsCardHead title={t("Upcoming bookings")} subtitle={t("The next two weeks. Open one in the Calendar to confirm, move or cancel it.")} />
            {upcoming.length ? (
              <ul className={styles.list}>
                {upcoming.slice(0, 20).map((b) => (
                  <li key={b.id} className={styles.listRow}>
                    <span><strong>{b.dateKey} {b.startTime}</strong> · {b.serviceName} · {b.customer.name}{b.status === "pending" ? ` · ${t("Request")}` : ""}</span>
                    <Link className="button secondary" href={`/calendar?date=${b.dateKey}&entry=bk_${b.id}`}>{t("Open in Calendar")}</Link>
                  </li>
                ))}
              </ul>
            ) : <p className="muted-copy">{t("No bookings in the next two weeks yet.")}</p>}
          </section>

          {dirty || saveError || saved ? (
            <div className={styles.saveBar} role="region" aria-label={t("Save changes")}>
              {saveError ? <p className="layout-error" role="alert">{saveError}</p> : saved && !dirty ? <p className="success-copy" role="status">{saved}</p> : <p className="muted-copy">{t("You have unsaved changes.")}</p>}
              {dirty ? (
                <span className={styles.rowActions}>
                  <button type="button" className="button" disabled={saving || !canEdit} onClick={() => void save()} data-testid="booking-save">{saving ? t("Saving…") : t("Save changes")}</button>
                  <button type="button" className="button secondary" disabled={saving} onClick={() => { setDraft(setup.config); setProblems([]); setSaveError(""); }}>{t("Discard")}</button>
                </span>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- quick setup (first visit)

function QuickSetup({ companyId, setup, t, disabled, gate, onDone, saveError, problems }: {
  companyId: string;
  setup: BookingSetup;
  t: (s: string) => string;
  disabled: boolean;
  gate: React.ReactNode;
  onDone: (config: BookingConfig) => Promise<boolean>;
  saveError: string;
  problems: string[];
}) {
  const presets = presetsForBusinessType(setup.businessType);
  const [slug, setSlug] = useState(setup.suggestedSlug);
  const [slugState, setSlugState] = useState<"" | "checking" | "ok" | "taken" | "invalid">("");
  const [chosen, setChosen] = useState<number[]>([0]);
  const [custom, setCustom] = useState({ name: "", durationMin: 30 });
  const [hours, setHours] = useState<BookingHours>(defaultHours());
  const [busy, setBusy] = useState(false);

  // Is the link name free? Asked 0.4 s after the last keystroke; answers for an older name are dropped.
  useEffect(() => {
    if (!BOOKING_SLUG_PATTERN.test(slug) || slug.includes("--")) { setSlugState("invalid"); return; }
    setSlugState("checking");
    let alive = true;
    const id = setTimeout(async () => {
      try {
        const answer = await checkBookingSlug(companyId, slug);
        if (alive) setSlugState(answer.available ? "ok" : answer.reason === "invalid" ? "invalid" : "taken");
      } catch {
        if (alive) setSlugState("");
      }
    }, 400);
    return () => { alive = false; clearTimeout(id); };
  }, [slug, companyId]);

  async function finish() {
    setBusy(true);
    const services: BookingService[] = [];
    for (const i of chosen) {
      const p = presets[i];
      if (p) services.push(blankService(services, { name: p.name, durationMin: p.durationMin, location: p.location || "in_person", approval: p.approval || "instant" }));
    }
    if (custom.name.trim()) services.push(blankService(services, { name: custom.name.trim(), durationMin: custom.durationMin }));
    const owner = setup.config.providers[0];
    const providers: BookingProvider[] = [{ ...(owner || { uid: "", name: setup.businessName, useWorkdays: false, active: true, hours }), hours }];
    await onDone({ ...setup.config, enabled: true, slug, services, providers });
    setBusy(false);
  }

  const ready = !disabled && slugState === "ok" && (chosen.length > 0 || custom.name.trim().length > 0) && WEEKDAY_KEYS.some((d) => hours[d].length);

  return (
    <section className="card app-card" data-testid="booking-quick-setup">
      <SettingsCardHead title={t("Set up online booking")} subtitle={t("Let customers book a time with you from a link. Three steps, about two minutes.")} />
      {gate}
      <ol className={styles.steps}>
        <li>
          <strong>{t("Your link")}</strong>
          <div className="settings-link-row">
            <code className="settings-link-box">nivadesk.app/book/</code>
            <input className="input" aria-label={t("Link name")} value={slug} disabled={disabled} maxLength={48} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} data-testid="booking-slug" />
          </div>
          <small className={`settings-field-hint ${slugState === "taken" || slugState === "invalid" || problems.includes("slug") ? "is-caution" : ""}`}>
            {slugState === "checking" ? t("Checking…") : slugState === "ok" ? `✓ ${t("This link name is free.")}` : slugState === "taken" ? t("This link name is taken. Try another.") : slugState === "invalid" ? t("Use 3–48 lowercase letters, numbers and dashes.") : ""}
          </small>
        </li>
        <li>
          <strong>{t("What can customers book?")}</strong>
          <div className={styles.presetChips}>
            {presets.map((p, i) => (
              <button key={p.name} type="button" className={`${styles.presetChip} ${chosen.includes(i) ? styles.on : ""}`} aria-pressed={chosen.includes(i)} disabled={disabled}
                onClick={() => setChosen((list) => (list.includes(i) ? list.filter((x) => x !== i) : [...list, i]))}>
                {t(p.name)} · {minutesLabel(p.durationMin, t)}
              </button>
            ))}
          </div>
          <div className={styles.inline}>
            <input className="input" placeholder={t("Or your own service, e.g. Bespoke ring consultation")} value={custom.name} disabled={disabled} maxLength={80} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
            <select className="input" aria-label={t("Length")} value={custom.durationMin} disabled={disabled} onChange={(e) => setCustom({ ...custom, durationMin: Number(e.target.value) })}>
              {DURATION_CHOICES.map((n) => <option key={n} value={n}>{minutesLabel(n, t)}</option>)}
            </select>
          </div>
          <small className="settings-field-hint">{t("You can rename them, set prices and add more after.")}</small>
        </li>
        <li>
          <strong>{t("When can they book?")}</strong>
          <HoursEditor hours={hours} onChange={setHours} t={t} disabled={disabled} />
        </li>
      </ol>
      {saveError ? <p className="layout-error" role="alert">{saveError}</p> : null}
      <button type="button" className="button" disabled={!ready || busy} onClick={() => void finish()} data-testid="booking-turn-on">{busy ? t("Saving…") : t("Turn on my booking page")}</button>
      <p className="settings-field-hint">{t("Free times also leave out your leave and meetings in the NivaDesk calendar, and your connected Google or Outlook calendar.")}</p>
    </section>
  );
}

// ---------------------------------------------------------------- the link name (after setup)

function SlugField({ draft, setDraft, t, disabled, problems }: { draft: BookingConfig; setDraft: (c: BookingConfig) => void; t: (s: string) => string; disabled: boolean; problems: string[] }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className={`button secondary ${styles.small}`} disabled={disabled} onClick={() => setOpen(true)}>{t("Change link name")}</button>;
  return (
    <div className={styles.slugEdit}>
      <div className="settings-link-row">
        <code className="settings-link-box">nivadesk.app/book/</code>
        <input className="input" aria-label={t("Link name")} value={draft.slug || ""} disabled={disabled} maxLength={48} onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} />
      </div>
      <small className={`settings-field-hint ${problems.includes("slug") || problems.includes("slug.taken") ? "is-caution" : ""}`}>{t("Changing it breaks the old link and old QR codes.")}</small>
    </div>
  );
}

// ---------------------------------------------------------------- services

function ServicesCard({ draft, setDraft, setup, t, disabled, problems }: { draft: BookingConfig; setDraft: (c: BookingConfig) => void; setup: BookingSetup; t: (s: string) => string; disabled: boolean; problems: string[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const update = (id: string, patch: Partial<BookingService>) => setDraft({ ...draft, services: draft.services.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const remove = (id: string) => setDraft({ ...draft, services: draft.services.filter((s) => s.id !== id) });
  const presets = presetsForBusinessType(setup.businessType).filter((p) => !draft.services.some((s) => s.name === p.name));
  const team = draft.providers.length > 1;
  return (
    <section className="card app-card" data-testid="booking-services">
      <SettingsCardHead title={t("Services")} subtitle={t("What customers can book, how long it takes and what it costs.")} />
      <ul className={styles.list}>
        {draft.services.map((s, index) => {
          const bad = (k: string) => problems.includes(`services.${index}.${k}`);
          const open = openId === s.id;
          return (
            <li key={s.id} className={styles.service}>
              <div className={styles.serviceHead}>
                <span>
                  <strong>{s.name || t("New service")}</strong>{!s.active ? ` · ${t("Hidden")}` : ""}
                  <br /><small>{minutesLabel(s.durationMin, t)}{s.priceMode === "fixed" || s.priceMode === "from" ? ` · ${s.priceMode === "from" ? t("from") + " " : ""}${priceText(s.priceMinor)} ${draft.currency}` : s.priceMode === "free" ? ` · ${t("Free")}` : s.priceMode === "quote" ? ` · ${t("Price on request")}` : ""}{s.approval === "request" ? ` · ${t("You confirm each booking")}` : ""}</small>
                </span>
                <button type="button" className="button secondary" onClick={() => setOpenId(open ? null : s.id)} aria-expanded={open}>{open ? t("Done") : t("Edit")}</button>
              </div>
              {open ? (
                <div className={styles.grid}>
                  <label className={styles.field}><span>{t("Name")}</span><input className="input" value={s.name} maxLength={80} disabled={disabled} aria-invalid={bad("name")} onChange={(e) => update(s.id, { name: e.target.value })} /></label>
                  <label className={styles.field}><span>{t("Length")}</span>
                    <select className="input" value={s.durationMin} disabled={disabled} aria-invalid={bad("duration")} onChange={(e) => update(s.id, { durationMin: Number(e.target.value) })}>
                      {[...new Set([...DURATION_CHOICES, s.durationMin])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{minutesLabel(n, t)}</option>)}
                    </select>
                  </label>
                  <label className={styles.field}><span>{t("Price shown")}</span>
                    <select className="input" value={s.priceMode} disabled={disabled} onChange={(e) => update(s.id, { priceMode: e.target.value as BookingService["priceMode"], priceMinor: e.target.value === "fixed" || e.target.value === "from" ? s.priceMinor ?? 0 : null })}>
                      <option value="hidden">{t("Don't show a price")}</option>
                      <option value="free">{t("Free")}</option>
                      <option value="fixed">{t("Fixed price")}</option>
                      <option value="from">{t("Starting price (from …)")}</option>
                      <option value="quote">{t("Price on request")}</option>
                    </select>
                  </label>
                  {s.priceMode === "fixed" || s.priceMode === "from" ? (
                    <label className={styles.field}><span>{t("Price")} ({draft.currency})</span>
                      <input className="input" inputMode="decimal" defaultValue={priceText(s.priceMinor)} disabled={disabled} aria-invalid={bad("price")} onChange={(e) => update(s.id, { priceMinor: priceMinorFrom(e.target.value) ?? s.priceMinor })} />
                    </label>
                  ) : null}
                  <label className={styles.field}><span>{t("Where")}</span>
                    <select className="input" value={s.location} disabled={disabled} onChange={(e) => update(s.id, { location: e.target.value as BookingService["location"] })}>
                      <option value="in_person">{t("At your place")}</option>
                      <option value="customer_address">{t("At the customer's address")}</option>
                      <option value="phone">{t("By phone")}</option>
                      <option value="video">{t("Video call")}</option>
                    </select>
                  </label>
                  <label className={styles.field}><span>{t("Confirmation")}</span>
                    <select className="input" value={s.approval} disabled={disabled} onChange={(e) => update(s.id, { approval: e.target.value as BookingService["approval"] })}>
                      <option value="instant">{t("Booked straight away")}</option>
                      <option value="request">{t("I confirm each booking")}</option>
                    </select>
                  </label>
                  <label className={styles.field}><span>{t("Free time before")}</span>
                    <select className="input" value={s.bufferBeforeMin} disabled={disabled} onChange={(e) => update(s.id, { bufferBeforeMin: Number(e.target.value) })}>
                      {BUFFER_CHOICES.map((n) => <option key={n} value={n}>{minutesLabel(n, t)}</option>)}
                    </select>
                  </label>
                  <label className={styles.field}><span>{t("Free time after")}</span>
                    <select className="input" value={s.bufferAfterMin} disabled={disabled} onChange={(e) => update(s.id, { bufferAfterMin: Number(e.target.value) })}>
                      {BUFFER_CHOICES.map((n) => <option key={n} value={n}>{minutesLabel(n, t)}</option>)}
                    </select>
                  </label>
                  <label className={`${styles.field} ${styles.wide}`}><span>{t("Description (optional)")}</span>
                    <textarea className="input" rows={2} maxLength={600} value={s.description} disabled={disabled} onChange={(e) => update(s.id, { description: e.target.value })} />
                  </label>
                  {team ? (
                    <fieldset className={`${styles.field} ${styles.wide}`}>
                      <legend>{t("Who does it")}</legend>
                      <div className={styles.presetChips}>
                        {draft.providers.map((p) => {
                          const on = s.providerUids.length === 0 || s.providerUids.includes(p.uid);
                          return (
                            <button key={p.uid} type="button" className={`${styles.presetChip} ${on ? styles.on : ""}`} aria-pressed={on} disabled={disabled} onClick={() => {
                              const current = s.providerUids.length ? s.providerUids : draft.providers.map((x) => x.uid);
                              const next = current.includes(p.uid) ? current.filter((u) => u !== p.uid) : [...current, p.uid];
                              update(s.id, { providerUids: next.length === draft.providers.length ? [] : next });
                            }}>{p.name || t("Team member")}</button>
                          );
                        })}
                      </div>
                    </fieldset>
                  ) : null}
                  <label className={`settings-switch-line ${styles.wide}`}>
                    <span className="settings-switch-line-copy"><strong>{t("Open an order for each booking")}</strong><small>{t("Useful for drop-offs and repairs: the booking arrives as an order with the customer on it.")}</small></span>
                    <input type="checkbox" className="settings-switch" role="switch" aria-checked={s.createOrder} checked={s.createOrder} disabled={disabled} onChange={(e) => update(s.id, { createOrder: e.target.checked })} />
                  </label>
                  <label className={`settings-switch-line ${styles.wide}`}>
                    <span className="settings-switch-line-copy"><strong>{t("Show on the booking page")}</strong></span>
                    <input type="checkbox" className="settings-switch" role="switch" aria-checked={s.active} checked={s.active} disabled={disabled} onChange={(e) => update(s.id, { active: e.target.checked })} />
                  </label>
                  <button type="button" className={`button danger secondary ${styles.small}`} disabled={disabled} onClick={() => remove(s.id)}>{t("Remove service")}</button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {problems.includes("services.none") ? <p className="settings-field-hint is-caution">{t("Add at least one service.")}</p> : null}
      <div className={styles.presetChips}>
        {presets.map((p) => (
          <button key={p.name} type="button" className={styles.presetChip} disabled={disabled || draft.services.length >= 20} onClick={() => {
            const service = blankService(draft.services, { name: p.name, durationMin: p.durationMin, location: p.location || "in_person", approval: p.approval || "instant" });
            setDraft({ ...draft, services: [...draft.services, service] });
          }}>+ {t(p.name)}</button>
        ))}
        <button type="button" className={styles.presetChip} disabled={disabled || draft.services.length >= 20} onClick={() => {
          const service = blankService(draft.services, { name: t("New service") });
          setDraft({ ...draft, services: [...draft.services, service] });
          setOpenId(service.id);
        }}>+ {t("Add a service")}</button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- hours

function HoursEditor({ hours, onChange, t, disabled, bad = false }: { hours: BookingHours; onChange: (h: BookingHours) => void; t: (s: string) => string; disabled: boolean; bad?: boolean }) {
  return (
    <div className={styles.hours}>
      {WEEKDAY_KEYS.map((d, i) => {
        const list = hours[d];
        const on = list.length > 0;
        const set = (next: { start: string; end: string }[]) => onChange({ ...hours, [d]: next });
        return (
          <div key={d} className={styles.hoursRow} data-weekday={d}>
            <label className={styles.dayToggle}>
              <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => set(e.target.checked ? [{ start: "09:00", end: "17:00" }] : [])} />
              <span>{t(WEEKDAY_NAMES[i])}</span>
            </label>
            {on ? (
              <span className={styles.windows}>
                {list.map((w, wi) => (
                  <span key={wi} className={styles.window}>
                    <input type="time" className="input" value={w.start} disabled={disabled} aria-invalid={bad} aria-label={t("From")} onChange={(e) => set(list.map((x, xi) => (xi === wi ? { ...x, start: e.target.value } : x)))} />
                    –
                    <input type="time" className="input" value={w.end === "24:00" ? "23:59" : w.end} disabled={disabled} aria-invalid={bad} aria-label={t("To")} onChange={(e) => set(list.map((x, xi) => (xi === wi ? { ...x, end: e.target.value } : x)))} />
                    {list.length > 1 ? <button type="button" className={styles.iconButton} aria-label={t("Remove")} disabled={disabled} onClick={() => set(list.filter((_, xi) => xi !== wi))}>×</button> : null}
                  </span>
                ))}
                {list.length < 3 ? <button type="button" className={styles.linkButton} disabled={disabled} onClick={() => set([...list, { start: "13:00", end: "17:00" }])}>{t("+ add hours")}</button> : null}
              </span>
            ) : <span className="muted-copy">{t("Closed")}</span>}
          </div>
        );
      })}
    </div>
  );
}

function HoursCard({ draft, setDraft, setup, t, disabled, problems }: { draft: BookingConfig; setDraft: (c: BookingConfig) => void; setup: BookingSetup; t: (s: string) => string; disabled: boolean; problems: string[] }) {
  const [person, setPerson] = useState(draft.providers[0]?.uid || "");
  const provider = draft.providers.find((p) => p.uid === person) || draft.providers[0];
  const updateProvider = (uid: string, patch: Partial<BookingProvider>) => setDraft({ ...draft, providers: draft.providers.map((p) => (p.uid === uid ? { ...p, ...patch } : p)) });
  const addable = setup.members.filter((m) => !draft.providers.some((p) => p.uid === m.uid));
  const index = provider ? draft.providers.indexOf(provider) : -1;
  const bad = WEEKDAY_KEYS.some((d) => problems.includes(`providers.${index}.hours.${d}`));
  return (
    <section className="card app-card" data-testid="booking-hours">
      <SettingsCardHead title={t("Booking hours")} subtitle={t("When people can book. Leave, meetings and other bookings are taken out automatically.")} />
      {draft.providers.length > 1 || addable.length ? (
        <div className={styles.presetChips}>
          {draft.providers.map((p) => (
            <button key={p.uid} type="button" className={`${styles.presetChip} ${p.uid === provider?.uid ? styles.on : ""}`} aria-pressed={p.uid === provider?.uid} onClick={() => setPerson(p.uid)}>{p.name || t("Team member")}</button>
          ))}
          {addable.map((m) => (
            <button key={m.uid} type="button" className={styles.presetChip} disabled={disabled || draft.providers.length >= 10} onClick={() => {
              setDraft({ ...draft, providers: [...draft.providers, { uid: m.uid, name: m.name, hours: defaultHours(), useWorkdays: false, active: true }] });
              setPerson(m.uid);
            }}>+ {m.name || t("Team member")}</button>
          ))}
        </div>
      ) : null}
      {provider ? (
        <>
          <label className={styles.field}><span>{t("Name shown to customers")}</span>
            <input className="input" value={provider.name} maxLength={80} disabled={disabled} onChange={(e) => updateProvider(provider.uid, { name: e.target.value })} />
          </label>
          <HoursEditor hours={provider.hours} onChange={(h) => updateProvider(provider.uid, { hours: h })} t={t} disabled={disabled} bad={bad} />
          {bad ? <p className="settings-field-hint is-caution">{t("An end time must be after its start time.")}</p> : null}
          <div className="settings-switch-list">
            <label className="settings-switch-line">
              <span className="settings-switch-line-copy"><strong>{t("Only on my work days in the Calendar")}</strong><small>{t("Bookable only on days with a “Work day” entry for this person in the Calendar (within the hours above).")}</small></span>
              <input type="checkbox" className="settings-switch" role="switch" aria-checked={provider.useWorkdays} checked={provider.useWorkdays} disabled={disabled} onChange={(e) => updateProvider(provider.uid, { useWorkdays: e.target.checked })} />
            </label>
            {draft.providers.length > 1 ? (
              <label className="settings-switch-line">
                <span className="settings-switch-line-copy"><strong>{t("Takes bookings")}</strong></span>
                <input type="checkbox" className="settings-switch" role="switch" aria-checked={provider.active} checked={provider.active} disabled={disabled} onChange={(e) => updateProvider(provider.uid, { active: e.target.checked })} />
              </label>
            ) : null}
          </div>
          {draft.providers.length > 1 ? (
            <button type="button" className={`button danger secondary ${styles.small}`} disabled={disabled} onClick={() => { setDraft({ ...draft, providers: draft.providers.filter((p) => p.uid !== provider.uid) }); setPerson(draft.providers[0]?.uid || ""); }}>{t("Remove from booking")}</button>
          ) : null}
        </>
      ) : null}
      <p className="settings-field-hint">{t("Times are in {zone}. To block a day off, add an “Unavailable” entry in the Calendar.").replace("{zone}", draft.timeZone)}</p>
    </section>
  );
}

// ---------------------------------------------------------------- rules

function RulesCard({ draft, setDraft, t, disabled }: { draft: BookingConfig; setDraft: (c: BookingConfig) => void; t: (s: string) => string; disabled: boolean }) {
  const [closed, setClosed] = useState("");
  const rules = draft.rules;
  const set = (patch: Partial<BookingConfig["rules"]>) => setDraft({ ...draft, rules: { ...rules, ...patch } });
  return (
    <section className="card app-card" data-testid="booking-rules">
      <SettingsCardHead title={t("Booking rules")} subtitle={t("How early and how far ahead customers can book, and whether they can change their booking.")} />
      <div className={styles.grid}>
        <label className={styles.field}><span>{t("Start times every")}</span>
          <select className="input" value={rules.slotStepMin} disabled={disabled} onChange={(e) => set({ slotStepMin: Number(e.target.value) })}>
            {STEP_CHOICES.map((n) => <option key={n} value={n}>{n === 0 ? t("Length of the service") : minutesLabel(n, t)}</option>)}
          </select>
        </label>
        <label className={styles.field}><span>{t("At least this much notice")}</span>
          <select className="input" value={rules.minNoticeMin} disabled={disabled} onChange={(e) => set({ minNoticeMin: Number(e.target.value) })}>
            {[...new Set([...NOTICE_CHOICES, rules.minNoticeMin])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{minutesLabel(n, t)}</option>)}
          </select>
        </label>
        <label className={styles.field}><span>{t("Up to this far ahead")}</span>
          <select className="input" value={rules.maxDaysAhead} disabled={disabled} onChange={(e) => set({ maxDaysAhead: Number(e.target.value) })}>
            {[...new Set([...DAYS_AHEAD_CHOICES, rules.maxDaysAhead])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{t("{n} days").replace("{n}", String(n))}</option>)}
          </select>
        </label>
        <label className={styles.field}><span>{t("Most bookings per day (each person)")}</span>
          <select className="input" value={rules.dailyMaxPerProvider ?? ""} disabled={disabled} onChange={(e) => set({ dailyMaxPerProvider: e.target.value === "" ? null : Number(e.target.value) })}>
            <option value="">{t("No limit")}</option>
            {[1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <div className="settings-switch-list">
        <label className="settings-switch-line">
          <span className="settings-switch-line-copy"><strong>{t("Customers can cancel online")}</strong></span>
          <input type="checkbox" className="settings-switch" role="switch" aria-checked={rules.allowCancel} checked={rules.allowCancel} disabled={disabled} onChange={(e) => set({ allowCancel: e.target.checked })} />
        </label>
        <label className="settings-switch-line">
          <span className="settings-switch-line-copy"><strong>{t("Customers can change the time online")}</strong></span>
          <input type="checkbox" className="settings-switch" role="switch" aria-checked={rules.allowReschedule} checked={rules.allowReschedule} disabled={disabled} onChange={(e) => set({ allowReschedule: e.target.checked })} />
        </label>
      </div>
      {rules.allowCancel || rules.allowReschedule ? (
        <label className={styles.field}><span>{t("Until this long before the booking")}</span>
          <select className="input" value={rules.changeCutoffMin} disabled={disabled} onChange={(e) => set({ changeCutoffMin: Number(e.target.value) })}>
            {[...new Set([...CUTOFF_CHOICES, rules.changeCutoffMin])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{minutesLabel(n, t)}</option>)}
          </select>
        </label>
      ) : null}
      <div className={styles.field}>
        <span>{t("Closed dates")}</span>
        <span className={styles.inline}>
          <input type="date" className="input" value={closed} disabled={disabled} onChange={(e) => setClosed(e.target.value)} aria-label={t("Closed dates")} />
          <button type="button" className="button secondary" disabled={disabled || !/^\d{4}-\d{2}-\d{2}$/.test(closed) || rules.closedDates.includes(closed)} onClick={() => { set({ closedDates: [...rules.closedDates, closed].sort() }); setClosed(""); }}>{t("Add")}</button>
        </span>
        {rules.closedDates.length ? (
          <span className={styles.presetChips}>
            {rules.closedDates.map((d) => <button key={d} type="button" className={styles.presetChip} disabled={disabled} onClick={() => set({ closedDates: rules.closedDates.filter((x) => x !== d) })}>{d} ×</button>)}
          </span>
        ) : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- form, page text, notifications

function FormCard({ draft, setDraft, t, disabled }: { draft: BookingConfig; setDraft: (c: BookingConfig) => void; t: (s: string) => string; disabled: boolean }) {
  const form = draft.form;
  const setForm = (patch: Partial<BookingConfig["form"]>) => setDraft({ ...draft, form: { ...form, ...patch } });
  const mode = (key: "phone" | "address" | "notes", label: string) => (
    <label className={styles.field}><span>{label}</span>
      <select className="input" value={form[key]} disabled={disabled} onChange={(e) => setForm({ [key]: e.target.value } as Partial<BookingConfig["form"]>)}>
        <option value="hidden">{t("Don't ask")}</option>
        <option value="optional">{t("Optional")}</option>
        <option value="required">{t("Required")}</option>
      </select>
    </label>
  );
  return (
    <section className="card app-card" data-testid="booking-form">
      <SettingsCardHead title={t("Booking form and page")} subtitle={t("Name and email are always asked. Choose what else you need.")} />
      <div className={styles.grid}>
        {mode("phone", t("Phone"))}
        {mode("address", t("Address"))}
        {mode("notes", t("Notes"))}
        <label className={`${styles.field} ${styles.wide}`}><span>{t("Your own question (optional)")}</span>
          <input className="input" placeholder={t("e.g. Which piece is it about? / Device and fault / Ring size")} maxLength={160} value={form.question} disabled={disabled} onChange={(e) => setForm({ question: e.target.value, questionRequired: e.target.value ? form.questionRequired : false })} />
        </label>
        {form.question ? (
          <label className={`settings-switch-line ${styles.wide}`}>
            <span className="settings-switch-line-copy"><strong>{t("Answer required")}</strong></span>
            <input type="checkbox" className="settings-switch" role="switch" aria-checked={form.questionRequired} checked={form.questionRequired} disabled={disabled} onChange={(e) => setForm({ questionRequired: e.target.checked })} />
          </label>
        ) : null}
        <label className={`${styles.field} ${styles.wide}`}><span>{t("Page title")}</span>
          <input className="input" placeholder={t("Your business name")} maxLength={80} value={draft.page.title} disabled={disabled} onChange={(e) => setDraft({ ...draft, page: { ...draft.page, title: e.target.value } })} />
        </label>
        <label className={`${styles.field} ${styles.wide}`}><span>{t("A few words for customers (optional)")}</span>
          <textarea className="input" rows={2} maxLength={600} placeholder={t("e.g. Please bring the item with you. Parking at the back.")} value={draft.page.intro} disabled={disabled} onChange={(e) => setDraft({ ...draft, page: { ...draft.page, intro: e.target.value } })} />
        </label>
        <label className={styles.field}><span>{t("Email me about new bookings")}</span>
          <select className="input" value={draft.notify.emailBusiness ? "yes" : "no"} disabled={disabled} onChange={(e) => setDraft({ ...draft, notify: { ...draft.notify, emailBusiness: e.target.value === "yes" } })}>
            <option value="yes">{t("Yes")}</option>
            <option value="no">{t("No — the bell in NivaDesk is enough")}</option>
          </select>
        </label>
        <label className={styles.field}><span>{t("Remind the customer")}</span>
          <select className="input" value={draft.notify.customerReminderHours} disabled={disabled} onChange={(e) => setDraft({ ...draft, notify: { ...draft.notify, customerReminderHours: Number(e.target.value) } })}>
            {REMINDER_CHOICES.map((h) => <option key={h} value={h}>{h === 0 ? t("No reminder") : t("{n} hours before").replace("{n}", String(h))}</option>)}
          </select>
        </label>
        <label className={`${styles.field} ${styles.wide}`}><span>{t("Who sees bookings in the Calendar")}</span>
          <select className="input" value={draft.calendarVisibility} disabled={disabled} onChange={(e) => setDraft({ ...draft, calendarVisibility: e.target.value === "workspace" ? "workspace" : "private" })}>
            <option value="private">{t("The person who serves it and the owner")}</option>
            <option value="workspace">{t("Everyone in the workspace")}</option>
          </select>
        </label>
      </div>
      <p className="settings-field-hint">{t("The page uses your logo and the colour you chose for customer pages (Settings ▸ Customer Portal Domain).")}</p>
    </section>
  );
}
