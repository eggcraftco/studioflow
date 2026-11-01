"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import { paymentReturnDirection } from "@/lib/publicSite/paymentReturn";
import {
  BOOKING_COPY,
  BOOKING_STRIP_DAYS,
  addDaysKey,
  bookingLocale,
  bookingToken,
  cutoffLabel,
  dayChipParts,
  locationLabel,
  longDate,
  stripKeys,
  timesByPart,
  todayKeyIn,
  type BookingDay,
  type BookingLanguage,
  type BookingStatus,
  type BookingSummary
} from "@/lib/publicSite/onlineBooking";
import styles from "../booking.module.css";

type ManageView = {
  booking: BookingSummary;
  business: { name: string; logoUrl: string | null; accentColor: string | null };
  poweredBy: boolean;
  canCancel: boolean;
  canReschedule: boolean;
  changeCutoffMin: number;
};

function errorCode(error: unknown): string {
  return String((error as { code?: string })?.code || "").replace(/^functions\//, "");
}

function errorReason(error: unknown): string {
  return String((error as { details?: { reason?: string } })?.details?.reason || "");
}

export function ManageBookingContent({ initialLanguage, initialDirection }: { initialLanguage: BookingLanguage; initialDirection: "rtl" | "ltr" }) {
  const [language] = useState<BookingLanguage>(initialLanguage);
  const direction = language === initialLanguage ? initialDirection : paymentReturnDirection(language);
  const c = BOOKING_COPY[language];
  const locale = bookingLocale(language);
  const [token, setToken] = useState("");
  const [view, setView] = useState<ManageView | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "invalid" | "failed" | "tooMany">("loading");
  const [mode, setMode] = useState<"view" | "cancel" | "move">("view");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [stripStart, setStripStart] = useState("");
  const [days, setDays] = useState<BookingDay[] | null>(null);
  const [dateKey, setDateKey] = useState("");
  const [time, setTime] = useState("");

  const call = useCallback(async <T,>(data: Record<string, unknown>) => {
    const callable = httpsCallable<Record<string, unknown>, T>(functions, "bookingPublic");
    return (await callable({ ...data, token })).data;
  }, [token]);

  useEffect(() => {
    const read = () => setToken(bookingToken(typeof window !== "undefined" ? window.location.hash : ""));
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const load = useCallback(async () => {
    if (!token) { setState("invalid"); return; }
    setState("loading");
    try {
      const data = await call<ManageView>({ action: "manage" });
      setView(data);
      setState("ready");
    } catch (error) {
      const code = errorCode(error);
      setState(code === "resource-exhausted" ? "tooMany" : code === "not-found" ? "invalid" : "failed");
    }
  }, [token, call]);

  useEffect(() => {
    // Wait one tick for the hash to be read; an empty hash is an invalid link.
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load]);

  const loadTimes = useCallback(async (from: string) => {
    if (!view) return;
    setDays(null);
    try {
      const data = await call<{ days?: BookingDay[] }>({ action: "manageTimes", from, to: addDaysKey(from, BOOKING_STRIP_DAYS - 1) });
      const list = data.days || [];
      setDays(list);
      setDateKey((current) => (list.some((d) => d.dateKey === current) ? current : list[0]?.dateKey || ""));
    } catch (error) {
      setNotice(errorReason(error) === "too_late" ? c.tooLate.replace("{business}", view.business.name) : c.failed);
      setMode("view");
    }
  }, [view, call, c]);

  function startMove() {
    if (!view) return;
    const from = todayKeyIn(view.booking.timeZone);
    setStripStart(from);
    setMode("move");
    setNotice("");
    setTime("");
    void loadTimes(from);
  }

  async function cancel() {
    if (!view || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const data = await call<{ booking?: BookingSummary }>({ action: "cancel" });
      if (data.booking) setView({ ...view, booking: data.booking, canCancel: false, canReschedule: false });
      setNotice(c.cancelled);
      setMode("view");
    } catch (error) {
      setNotice(errorReason(error) === "too_late" ? c.tooLate.replace("{business}", view.business.name) : errorCode(error) === "resource-exhausted" ? c.tooMany : c.failed);
    } finally {
      setBusy(false);
    }
  }

  async function move() {
    if (!view || busy || !dateKey || !time) return;
    setBusy(true);
    setNotice("");
    try {
      const data = await call<{ booking?: BookingSummary }>({ action: "reschedule", dateKey, time });
      if (data.booking) setView({ ...view, booking: data.booking });
      setNotice(c.moved);
      setMode("view");
    } catch (error) {
      const reason = errorReason(error);
      if (reason === "slot_taken") { setNotice(c.slotTaken); void loadTimes(stripStart); }
      else if (reason === "too_late") { setNotice(c.tooLate.replace("{business}", view.business.name)); setMode("view"); }
      else setNotice(errorCode(error) === "resource-exhausted" ? c.tooMany : c.failed);
    } finally {
      setBusy(false);
    }
  }

  const accent = view?.business.accentColor && /^#[0-9a-f]{6}$/i.test(view.business.accentColor) ? view.business.accentColor : "#2563eb";
  const themeStyle = { "--bk-accent": accent } as CSSProperties;

  if (state !== "ready" || !view) {
    return (
      <main className={styles.page} lang={language} dir={direction} data-booking-state={state}>
        <section className={styles.card}>
          {state === "loading" ? <p className={styles.muted}>{c.loading}</p> : (
            <>
              <h1 className={styles.title}>{state === "invalid" ? c.linkInvalid : c.failed}</h1>
              {state !== "invalid" ? (
                <>
                  <p className={styles.muted}>{state === "tooMany" ? c.tooMany : c.failed}</p>
                  <button type="button" className={styles.secondary} onClick={() => void load()}>{c.retry}</button>
                </>
              ) : null}
            </>
          )}
        </section>
      </main>
    );
  }

  const b = view.booking;
  const statusText: Record<BookingStatus, string> = {
    confirmed: c.statusConfirmed, pending: c.statusPending, cancelled: c.statusCancelled, declined: c.statusDeclined,
    expired: c.statusExpired, completed: c.statusCompleted, no_show: c.statusNoShow
  };
  const live = b.status === "confirmed" || b.status === "pending";
  const day = days?.find((d) => d.dateKey === dateKey) || null;
  const markClass = live ? (b.status === "pending" ? `${styles.mark} ${styles.markWait}` : styles.mark) : `${styles.mark} ${styles.markStop}`;

  return (
    <main className={styles.page} style={themeStyle} lang={language} dir={direction} data-booking-state="manage" data-booking-status={b.status}>
      <section className={styles.card}>
        <header className={styles.brand}>
          {view.business.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={view.business.logoUrl} alt="" className={styles.logo} />
          ) : null}
          <div>
            <h1 className={styles.title}>{c.manageTitle}</h1>
            <p className={styles.intro}>{view.business.name}</p>
          </div>
        </header>

        <div className={styles.done}>
          <span className={markClass} aria-hidden="true">{live ? (b.status === "pending" ? "…" : "✓") : "×"}</span>
          <h2>{statusText[b.status] || b.status}</h2>
          <dl className={styles.summary}>
            <div><dt>{c.chooseService}</dt><dd>{b.serviceName}</dd></div>
            <div><dt>{c.chooseDay}</dt><dd>{longDate(b.dateKey, locale)}, {b.startTime}–{b.endTime}</dd></div>
            {b.providerName ? <div><dt>{c.choosePerson}</dt><dd>{b.providerName}</dd></div> : null}
            <div><dt>{locationLabel(b.location, language)}</dt><dd>{b.location === "customer_address" ? b.address : view.business.name}</dd></div>
          </dl>
          {notice ? <p className={styles.alert} role="status">{notice}</p> : null}

          {mode === "view" && live ? (
            view.canCancel || view.canReschedule ? (
              <div className={styles.doneActions}>
                {view.canReschedule ? <button type="button" className={styles.primary} onClick={startMove}>{c.changeTime}</button> : null}
                {view.canCancel ? <button type="button" className={styles.danger} onClick={() => { setMode("cancel"); setNotice(""); }}>{c.cancelBooking}</button> : null}
              </div>
            ) : <p className={styles.policy}>{c.tooLate.replace("{business}", view.business.name)}</p>
          ) : null}
          {mode === "view" && live && (view.canCancel || view.canReschedule) ? (
            <p className={styles.policy}>{c.policyChange.replace("{time}", cutoffLabel(view.changeCutoffMin, language))}</p>
          ) : null}

          {mode === "cancel" ? (
            <div className={styles.doneActions} role="alertdialog" aria-label={c.cancelAsk}>
              <p style={{ gridColumn: "1 / -1", margin: 0 }}>{c.cancelAsk}</p>
              <button type="button" className={styles.danger} disabled={busy} onClick={() => void cancel()}>{busy ? c.sending : c.yesCancel}</button>
              <button type="button" className={styles.secondary} disabled={busy} onClick={() => setMode("view")}>{c.keep}</button>
            </div>
          ) : null}
        </div>

        {mode === "move" ? (
          <section className={styles.step} aria-labelledby="bk-move">
            <h2 id="bk-move" className={styles.stepTitle}>{c.chooseDay}</h2>
            <div className={styles.stripRow}>
              <button type="button" className={styles.arrow} aria-label={c.earlierDates} disabled={stripStart <= todayKeyIn(b.timeZone)} onClick={() => { const from = addDaysKey(stripStart, -BOOKING_STRIP_DAYS); const today = todayKeyIn(b.timeZone); const next = from < today ? today : from; setStripStart(next); void loadTimes(next); }}>‹</button>
              <div className={styles.strip} role="list">
                {stripKeys(stripStart).map((key) => {
                  const parts = dayChipParts(key, locale);
                  const free = Boolean(days?.some((d) => d.dateKey === key && d.times.length));
                  return (
                    <button key={key} type="button" role="listitem" className={`${styles.day} ${key === dateKey ? styles.selected : ""}`} disabled={!free} aria-pressed={key === dateKey} onClick={() => { setDateKey(key); setTime(""); }}>
                      <span className={styles.dayWeek}>{parts.weekday}</span>
                      <span className={styles.dayNum}>{parts.day}</span>
                      <span className={styles.dayMonth}>{parts.month}</span>
                      {free ? <span className={styles.dot} aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
              <button type="button" className={styles.arrow} aria-label={c.laterDates} onClick={() => { const next = addDaysKey(stripStart, BOOKING_STRIP_DAYS); setStripStart(next); void loadTimes(next); }}>›</button>
            </div>
            <div className={styles.times}>
              {!days ? <p className={styles.muted}>{c.loading}</p> : !days.length ? <p className={styles.muted}>{c.noTimesRange}</p> : day ? (
                timesByPart(day.times).map((group) => (
                  <div key={group.part} className={styles.timeGroup}>
                    <span className={styles.timeGroupLabel}>{c[group.part]}</span>
                    <div className={styles.timeGrid}>
                      {group.times.map((t) => (
                        <button key={t.time} type="button" className={`${styles.time} ${t.time === time ? styles.selected : ""}`} aria-pressed={t.time === time} onClick={() => setTime(t.time)}>{t.time}</button>
                      ))}
                    </div>
                  </div>
                ))
              ) : <p className={styles.muted}>{c.noTimesDay}</p>}
            </div>
            <div className={styles.doneActions}>
              <button type="button" className={styles.primary} disabled={!time || busy} onClick={() => void move()}>{time ? c.moveTo.replace("{when}", `${longDate(dateKey, locale)}, ${time}`) : c.chooseTime}</button>
              <button type="button" className={styles.secondary} disabled={busy} onClick={() => setMode("view")}>{c.keep}</button>
            </div>
          </section>
        ) : null}

        <footer className={styles.footer}>
          <span />
          {view.poweredBy ? <span>{c.poweredBy}</span> : null}
        </footer>
      </section>
    </main>
  );
}
