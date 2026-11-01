"use client";

// Online booking — the booking behind a calendar entry (id `bk_<bookingId>`, written by
// functions/booking/bookingFunctions.js), shown inside the Calendar's side panel: who booked, how to
// reach them, the status, and what may be done with it. Every action goes through `bookingAdmin`
// (the server checks the person may act on this booking and e-mails the customer); the entry in the
// calendar follows on its own. Deleting the entry itself also cancels the booking (the server tells
// the customer), so this block offers "Cancel booking" in place of a bare delete.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { friendlyErrorMessage } from "@/lib/studioflow/friendlyError";
import {
  actOnBooking,
  bookingDetail,
  bookingTimes,
  rescheduleBooking,
  type BookingAction,
  type StaffBooking
} from "@/lib/studioflow/onlineBooking";

type Props = {
  companyId: string;
  bookingId: string;
  locale: string;
  t: (text: string) => string;
};

const STATUS_LABEL: Record<StaffBooking["status"], string> = {
  pending: "Waiting for your answer",
  confirmed: "Confirmed",
  declined: "Declined",
  cancelled: "Cancelled",
  completed: "Done",
  no_show: "Did not come",
  expired: "Not answered in time"
};

function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86400000).toISOString().slice(0, 10);
}

export function CalendarBookingBlock({ companyId, bookingId, locale, t }: Props) {
  const [booking, setBooking] = useState<StaffBooking | null>(null);
  const [canAct, setCanAct] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "hidden" | "failed">("loading");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [mode, setMode] = useState<"" | "decline" | "cancel" | "move">("");
  const [message, setMessage] = useState("");
  const [notify, setNotify] = useState(true);
  const [from, setFrom] = useState("");
  const [days, setDays] = useState<{ dateKey: string; times: { time: string }[] }[] | null>(null);
  const [pick, setPick] = useState<{ dateKey: string; time: string } | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const answer = await bookingDetail(companyId, bookingId);
      setBooking(answer.booking);
      setCanAct(answer.canAct);
      setState("ready");
    } catch (e) {
      // A member who does not serve this booking (and is not owner/admin) may still see the entry
      // when it is shared with the team; the booking's contact details are not theirs to read.
      const code = String((e as { code?: string })?.code || "");
      setState(/not-found|permission-denied/.test(code) ? "hidden" : "failed");
    }
  }, [companyId, bookingId]);

  useEffect(() => { setMode(""); setDone(""); setPick(null); void load(); }, [load]);

  async function run(action: BookingAction, label: string) {
    if (!booking) return;
    setBusy(action);
    setError("");
    try {
      const answer = await actOnBooking(companyId, booking.id, action, message, notify);
      setBooking(answer.booking);
      setDone(label);
      setMode("");
      setMessage("");
    } catch (e) {
      setError(friendlyErrorMessage(e, t));
    } finally {
      setBusy("");
    }
  }

  async function loadTimes(start: string) {
    if (!booking) return;
    setFrom(start);
    setDays(null);
    try {
      const answer = await bookingTimes(companyId, booking.id, start, addDays(start, 13));
      setDays(answer.days);
    } catch (e) {
      setError(friendlyErrorMessage(e, t));
      setDays([]);
    }
  }

  async function move() {
    if (!booking || !pick) return;
    setBusy("move");
    setError("");
    try {
      const answer = await rescheduleBooking(companyId, booking.id, pick.dateKey, pick.time, message, notify);
      setBooking(answer.booking);
      setDone(notify ? t("Booking moved. The customer has been emailed.") : t("Booking moved."));
      setMode("");
      setPick(null);
      setMessage("");
    } catch (e) {
      const reason = String((e as { details?: { reason?: string } })?.details?.reason || "");
      setError(reason === "slot_taken" ? t("That time is no longer free. Pick another.") : friendlyErrorMessage(e, t));
      if (reason === "slot_taken") void loadTimes(from);
    } finally {
      setBusy("");
    }
  }

  if (state === "hidden") return <p className="muted-copy cal-booking-note" data-booking-block="hidden">📅 {t("Online booking")}</p>;
  if (state === "loading") return <p className="muted-copy" data-booking-block="loading">{t("Loading…")}</p>;
  if (state === "failed" || !booking) {
    return <div className="cal-detail-block" data-booking-block="failed"><p className="cal-errors" role="alert">{t("The booking could not be loaded.")}</p><button type="button" className="button secondary" onClick={() => void load()}>{t("Try again")}</button></div>;
  }

  const b = booking;
  const live = b.status === "pending" || b.status === "confirmed";
  const past = b.endMs < Date.now();
  const messageBox = (
    <>
      <label className="cal-field">
        <span>{t("Message to the customer (optional)")}</span>
        <textarea className="input" rows={2} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>
      <label className="cal-check"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> {t("Email the customer")}</label>
    </>
  );

  return (
    <div className="cal-detail-block cal-booking" data-booking-block="ready" data-booking-status={b.status}>
      <p className="cal-booking-head"><strong>📅 {t("Online booking")}</strong> · <span className={`cal-booking-status is-${b.status}`}>{t(STATUS_LABEL[b.status])}</span></p>
      <dl className="cal-booking-facts">
        <div><dt>{t("Customer")}</dt><dd>{b.customer.name}</dd></div>
        <div><dt>{t("Email")}</dt><dd><a href={`mailto:${b.customer.email}`}>{b.customer.email}</a></dd></div>
        {b.customer.phone ? <div><dt>{t("Phone")}</dt><dd><a href={`tel:${b.customer.phone}`}>{b.customer.phone}</a></dd></div> : null}
        {b.customer.address ? <div><dt>{t("Address")}</dt><dd>{b.customer.address}</dd></div> : null}
        {b.customer.answer ? <div><dt>{t("Answer")}</dt><dd>{b.customer.answer}</dd></div> : null}
        {b.customer.notes ? <div><dt>{t("Notes")}</dt><dd>{b.customer.notes}</dd></div> : null}
        <div><dt>{t("Service")}</dt><dd>{b.serviceName} · {t("{n} min").replace("{n}", String(b.durationMin))}</dd></div>
        {b.providerName ? <div><dt>{t("With")}</dt><dd>{b.providerName}</dd></div> : null}
        {b.businessMessage ? <div><dt>{t("Your message")}</dt><dd>{b.businessMessage}</dd></div> : null}
      </dl>
      {b.orderId ? <Link className="button secondary" href={`/orders?orderId=${encodeURIComponent(b.orderId)}`}>{t("Open order")}</Link> : null}
      {b.orderError ? <p className="muted-copy">{t("The order for this booking could not be opened automatically. You can make one from Orders.")}</p> : null}
      {done ? <p className="success-copy" role="status">{done}</p> : null}

      {canAct && live && !mode ? (
        <div className="cal-actions">
          {b.status === "pending" ? (
            <>
              <button type="button" className="button" disabled={Boolean(busy)} onClick={() => void run("confirm", t("Booking confirmed. The customer has been emailed."))} data-booking-action="confirm">{t("Confirm")}</button>
              <button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => setMode("decline")} data-booking-action="decline">{t("Decline")}</button>
            </>
          ) : null}
          {!past ? <button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => { setMode("move"); void loadTimes(new Date().toISOString().slice(0, 10)); }} data-booking-action="move">{t("Move")}</button> : null}
          {b.status === "confirmed" ? (
            <button type="button" className="button danger secondary" disabled={Boolean(busy)} onClick={() => setMode("cancel")} data-booking-action="cancel">{t("Cancel booking")}</button>
          ) : null}
          {b.status === "confirmed" && b.startMs < Date.now() ? (
            <>
              <button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => void run("complete", t("Marked as done."))}>{t("Mark done")}</button>
              <button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => void run("noShow", t("Marked as did not come."))}>{t("Did not come")}</button>
            </>
          ) : null}
        </div>
      ) : null}

      {mode === "decline" || mode === "cancel" ? (
        <div className="cal-confirm" role="alertdialog" aria-label={mode === "decline" ? t("Decline") : t("Cancel booking")}>
          <p>{mode === "decline" ? t("Decline this request? The time becomes free again.") : t("Cancel this booking? The time becomes free again.")}</p>
          {messageBox}
          <div className="cal-actions">
            <button type="button" className="button danger" disabled={Boolean(busy)} onClick={() => void run(mode === "decline" ? "decline" : "cancel", mode === "decline" ? t("Request declined.") : t("Booking cancelled."))} data-booking-action={`${mode}-confirm`}>{mode === "decline" ? t("Decline") : t("Cancel booking")}</button>
            <button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => setMode("")}>{t("Back")}</button>
          </div>
        </div>
      ) : null}

      {mode === "move" ? (
        <div className="cal-confirm">
          <p>{t("Choose a new time. Only times free for this person are shown.")}</p>
          <div className="cal-actions">
            <button type="button" className="button secondary" disabled={!days} onClick={() => void loadTimes(addDays(from, -14) < new Date().toISOString().slice(0, 10) ? new Date().toISOString().slice(0, 10) : addDays(from, -14))}>‹</button>
            <button type="button" className="button secondary" disabled={!days} onClick={() => void loadTimes(addDays(from, 14))}>›</button>
          </div>
          {!days ? <p className="muted-copy">{t("Loading…")}</p> : !days.length ? <p className="muted-copy">{t("No free times in these two weeks.")}</p> : (
            <div className="cal-booking-times">
              {days.map((d) => (
                <div key={d.dateKey}>
                  <strong>{new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d.dateKey}T12:00:00Z`))}</strong>
                  <span className="cal-booking-time-list">
                    {d.times.map((x) => (
                      <button key={x.time} type="button" className={`button ${pick?.dateKey === d.dateKey && pick.time === x.time ? "" : "secondary"}`} aria-pressed={pick?.dateKey === d.dateKey && pick.time === x.time} onClick={() => setPick({ dateKey: d.dateKey, time: x.time })}>{x.time}</button>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          )}
          {messageBox}
          <div className="cal-actions">
            <button type="button" className="button" disabled={!pick || Boolean(busy)} onClick={() => void move()} data-booking-action="move-confirm">{t("Move booking")}</button>
            <button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => { setMode(""); setPick(null); }}>{t("Back")}</button>
          </div>
        </div>
      ) : null}
      {error ? <p className="cal-errors" role="alert">{error}</p> : null}
    </div>
  );
}
