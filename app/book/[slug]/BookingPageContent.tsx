"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";
import { paymentReturnDirection } from "@/lib/publicSite/paymentReturn";
import {
  BOOKING_COPY,
  BOOKING_LANGUAGES,
  BOOKING_STRIP_DAYS,
  addDaysKey,
  bookingLocale,
  cutoffLabel,
  dayChipParts,
  daysBetween,
  icsDataUrl,
  locationLabel,
  longDate,
  priceLabel,
  stripKeys,
  timesByPart,
  todayKeyIn,
  visitorZoneDiffers,
  zoneCity,
  type BookingDay,
  type BookingLanguage,
  type BookingPageView,
  type BookingSummary
} from "@/lib/publicSite/onlineBooking";
import styles from "../booking.module.css";

// One page, top to bottom: the business, a service, (a person), a day from a two-week strip, a time,
// the customer's details, then the answer. Nothing is remembered in the browser; the only state that
// leaves the page is what the customer submits. Free times are asked for again whenever the service,
// the person or the fortnight changes, and once more by the server when the booking is made.

type PublicCall<T> = { ok?: boolean } & T;
type Problem = "name" | "email" | "phone" | "address" | "notes" | "answer" | "consent";
const LANGUAGE_NAMES: Record<BookingLanguage, string> = {
  en: "English", tr: "Türkçe", de: "Deutsch", fr: "Français", it: "Italiano", es: "Español", pt: "Português",
  ru: "Русский", ja: "日本語", zh: "中文", ar: "العربية", hi: "हिन्दी"
};

function errorCode(error: unknown): string {
  return String((error as { code?: string })?.code || "").replace(/^functions\//, "");
}

function errorReason(error: unknown): string {
  const details = (error as { details?: { reason?: string } })?.details;
  return String(details?.reason || "");
}

function readableOn(accent: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(accent)) return "#ffffff";
  const r = parseInt(accent.slice(1, 3), 16), g = parseInt(accent.slice(3, 5), 16), b = parseInt(accent.slice(5, 7), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.62 ? "#1c2430" : "#ffffff";
}

export function BookingPageContent({ slug, initialLanguage, initialDirection, embed = false }: { slug: string; initialLanguage: BookingLanguage; initialDirection: "rtl" | "ltr"; embed?: boolean }) {
  const [language, setLanguage] = useState<BookingLanguage>(initialLanguage);
  const direction = language === initialLanguage ? initialDirection : paymentReturnDirection(language);
  const c = BOOKING_COPY[language];
  const locale = bookingLocale(language);

  const [page, setPage] = useState<BookingPageView | null>(null);
  const [poweredBy, setPoweredBy] = useState(true);
  const [state, setState] = useState<"loading" | "ready" | "unavailable" | "failed" | "tooMany">(slug ? "loading" : "unavailable");
  const [serviceId, setServiceId] = useState("");
  const [person, setPerson] = useState("any");
  const [stripStart, setStripStart] = useState("");
  const [days, setDays] = useState<BookingDay[] | null>(null);
  const [timesState, setTimesState] = useState<"idle" | "loading" | "failed" | "tooMany">("idle");
  const [dateKey, setDateKey] = useState("");
  const [time, setTime] = useState("");
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "", notes: "", answer: "", consent: false, website: "" });
  const [problems, setProblems] = useState<Problem[]>([]);
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ status: string; booking: BookingSummary; manageUrl: string; ics: string | null; email: string } | null>(null);
  const openedAt = useRef<number>(0);
  const rootRef = useRef<HTMLElement | null>(null);
  const timesRef = useRef<HTMLDivElement | null>(null);
  const detailsRef = useRef<HTMLFormElement | null>(null);

  const host = () => (typeof window !== "undefined" ? window.location.host : "");
  const call = useCallback(async <T,>(data: Record<string, unknown>) => {
    const callable = httpsCallable<Record<string, unknown>, PublicCall<T>>(functions, "bookingPublic");
    return (await callable({ ...data, slug, host: host() })).data;
  }, [slug]);

  useEffect(() => { openedAt.current = Date.now(); }, []);

  const load = useCallback(async () => {
    if (!slug) return;
    setState("loading");
    try {
      const data = await call<{ page?: BookingPageView; poweredBy?: boolean }>({ action: "page" });
      if (!data.page) throw Object.assign(new Error("not-found"), { code: "functions/not-found" });
      setPage(data.page);
      setPoweredBy(data.poweredBy !== false);
      setState("ready");
      if (data.page.services.length === 1) setServiceId(data.page.services[0].id);
      setStripStart(todayKeyIn(data.page.timeZone));
    } catch (error) {
      const code = errorCode(error);
      setState(code === "resource-exhausted" ? "tooMany" : /not-found|invalid-argument|permission-denied/.test(code) ? "unavailable" : "failed");
    }
  }, [slug, call]);

  useEffect(() => { void load(); }, [load]);

  const service = useMemo(() => page?.services.find((s) => s.id === serviceId) || null, [page, serviceId]);

  const loadTimes = useCallback(async () => {
    if (!page || !service || !stripStart) return;
    setTimesState("loading");
    setDays(null);
    try {
      const data = await call<{ days?: BookingDay[] }>({ action: "times", serviceId: service.id, person, from: stripStart, to: addDaysKey(stripStart, BOOKING_STRIP_DAYS - 1) });
      const list = data.days || [];
      setDays(list);
      setTimesState("idle");
      setDateKey((current) => (list.some((d) => d.dateKey === current) ? current : list[0]?.dateKey || ""));
    } catch (error) {
      setTimesState(errorCode(error) === "resource-exhausted" ? "tooMany" : "failed");
    }
  }, [page, service, person, stripStart, call]);

  useEffect(() => { setTime(""); void loadTimes(); }, [loadTimes]);

  // The business's tab title and logo, as on the payment and tracking pages.
  useEffect(() => {
    if (!page || typeof document === "undefined") return;
    document.title = page.title ? `${page.title} — ${c.chooseService}` : c.chooseService;
    if (page.business.logoUrl) {
      const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']") ?? document.head.appendChild(Object.assign(document.createElement("link"), { rel: "icon" }));
      link.href = page.business.logoUrl;
    }
  }, [page, c.chooseService]);

  // Embedded on the business's website: tell the frame how tall the page is (scripts/booking-embed in Settings).
  useEffect(() => {
    if (!embed || typeof window === "undefined" || window.parent === window || !rootRef.current) return;
    const post = () => window.parent.postMessage({ type: "nivadesk-booking-height", height: Math.ceil(rootRef.current?.scrollHeight || 0) }, "*");
    const observer = new ResizeObserver(post);
    observer.observe(rootRef.current);
    post();
    return () => observer.disconnect();
  }, [embed, state, done]);

  const today = page ? todayKeyIn(page.timeZone) : "";
  const lastKey = page ? addDaysKey(today, page.rules.maxDaysAhead) : "";
  const strip = stripStart ? stripKeys(stripStart) : [];
  const day = days?.find((d) => d.dateKey === dateKey) || null;
  const accent = page?.business.accentColor && /^#[0-9a-f]{6}$/i.test(page.business.accentColor) ? page.business.accentColor : "#2563eb";
  const themeStyle = { "--bk-accent": accent, "--bk-on-accent": readableOn(accent) } as CSSProperties;
  const showPeople = Boolean(page?.choosePerson && service && service.providers.length > 1);

  function pickService(id: string) {
    setServiceId(id);
    setPerson("any");
    setDateKey("");
    setTime("");
    setNotice("");
    if (page) setStripStart(todayKeyIn(page.timeZone));
  }

  function pickTime(value: string) {
    setTime(value);
    setNotice("");
    requestAnimationFrame(() => detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function pickDay(key: string) {
    setDateKey(key);
    setTime("");
    requestAnimationFrame(() => timesRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!page || !service || !dateKey || !time || submitting) return;
    const local: Problem[] = [];
    if (form.name.trim().length < 2) local.push("name");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) local.push("email");
    if (page.form.phone === "required" && !form.phone.trim()) local.push("phone");
    if (page.form.address === "required" && !form.address.trim()) local.push("address");
    if (page.form.notes === "required" && !form.notes.trim()) local.push("notes");
    if (page.form.question && page.form.questionRequired && !form.answer.trim()) local.push("answer");
    if (!form.consent) local.push("consent");
    setProblems(local);
    if (local.length) return;
    setSubmitting(true);
    setNotice("");
    try {
      const data = await call<{ status?: string; booking?: BookingSummary; manageUrl?: string; ics?: string | null }>({
        action: "book",
        serviceId: service.id,
        person,
        dateKey,
        time,
        lang: language,
        openedAt: openedAt.current,
        website: form.website,
        customer: { name: form.name, email: form.email, phone: form.phone, address: form.address, notes: form.notes, answer: form.answer, consent: form.consent }
      });
      if (!data.booking || !data.manageUrl) throw new Error("no booking");
      setDone({ status: String(data.status || data.booking.status), booking: data.booking, manageUrl: data.manageUrl, ics: data.ics || null, email: form.email.trim() });
      requestAnimationFrame(() => rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (error) {
      const code = errorCode(error);
      const reason = errorReason(error);
      if (reason === "details") {
        const list = ((error as { details?: { problems?: string[] } }).details?.problems || []).filter((p): p is Problem => ["name", "email", "phone", "address", "notes", "answer", "consent"].includes(p));
        setProblems(list);
      } else if (reason === "slot_taken") {
        setNotice(c.slotTaken);
        setTime("");
        void loadTimes();
      } else if (reason === "too_many_for_email") {
        setNotice(c.tooManyForEmail);
      } else if (code === "resource-exhausted") {
        setNotice(c.tooMany);
      } else if (code === "not-found") {
        setState("unavailable");
      } else {
        setNotice(c.failed);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setDone(null);
    setTime("");
    setForm((f) => ({ ...f, notes: "", answer: "", consent: false }));
    setProblems([]);
    void loadTimes();
  }

  const has = (p: Problem) => problems.includes(p);
  const problemText: Record<Problem, string> = { name: c.problemName, email: c.problemEmail, phone: c.problemPhone, address: c.problemAddress, notes: c.problemNotes, answer: c.problemAnswer, consent: c.problemConsent };
  const fieldError = (p: Problem) => (has(p) ? <span className={styles.fieldError} role="alert">{problemText[p]}</span> : null);
  const pageClass = [styles.page, embed ? styles.embed : ""].filter(Boolean).join(" ");

  const header = page ? (
    <header className={styles.brand}>
      {page.business.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={page.business.logoUrl} alt="" className={styles.logo} />
      ) : null}
      <div>
        <h1 className={styles.title}>{page.title || page.business.name}</h1>
        {page.intro ? <p className={styles.intro}>{page.intro}</p> : null}
      </div>
    </header>
  ) : null;

  const languagePicker = (
    <label className={styles.language}>
      <span className={styles.srOnly}>Language</span>
      <select value={language} onChange={(e) => setLanguage(e.target.value as BookingLanguage)} aria-label="Language">
        {BOOKING_LANGUAGES.map((code) => <option key={code} value={code}>{LANGUAGE_NAMES[code]}</option>)}
      </select>
    </label>
  );

  if (state !== "ready" || !page) {
    return (
      <main ref={rootRef} className={pageClass} lang={language} dir={direction} data-booking-state={state}>
        <section className={styles.card}>
          {state === "loading" ? <p className={styles.muted}>{c.loading}</p> : (
            <>
              <h1 className={styles.title}>{state === "unavailable" ? c.unavailableTitle : c.failed}</h1>
              <p className={styles.muted}>{state === "unavailable" ? c.unavailableBody : state === "tooMany" ? c.tooMany : c.failed}</p>
              {state !== "unavailable" ? <button type="button" className={styles.secondary} onClick={() => void load()}>{c.retry}</button> : null}
            </>
          )}
        </section>
      </main>
    );
  }

  if (done) {
    const b = done.booking;
    const pending = done.status === "pending";
    return (
      <main ref={rootRef} className={pageClass} style={themeStyle} lang={language} dir={direction} data-booking-state="done">
        <section className={styles.card}>
          {header}
          <div className={styles.done}>
            <span className={`${styles.mark} ${pending ? styles.markWait : ""}`} aria-hidden="true">{pending ? "…" : "✓"}</span>
            <h2>{pending ? c.requestTitle : c.doneTitle}</h2>
            <p className={styles.muted}>{(pending ? c.requestBody : c.doneBody).replace("{business}", page.business.name).replace("{email}", done.email)}</p>
            <dl className={styles.summary}>
              <div><dt>{c.chooseService}</dt><dd>{b.serviceName}</dd></div>
              <div><dt>{c.chooseDay}</dt><dd>{longDate(b.dateKey, locale)}, {b.startTime}–{b.endTime}</dd></div>
              {b.providerName ? <div><dt>{c.choosePerson}</dt><dd>{b.providerName}</dd></div> : null}
              <div><dt>{locationLabel(b.location, language)}</dt><dd>{b.location === "customer_address" ? b.address : page.business.name}</dd></div>
            </dl>
            <div className={styles.doneActions}>
              {done.ics ? <a className={styles.primary} href={icsDataUrl(done.ics)} download="booking.ics">{c.addToCalendar}</a> : null}
              <a className={styles.secondary} href={done.manageUrl}>{c.manage}</a>
            </div>
            <button type="button" className={styles.link} onClick={reset}>{c.bookAnother}</button>
          </div>
          <footer className={styles.footer}>
            {languagePicker}
            {poweredBy ? <span>{c.poweredBy}</span> : null}
          </footer>
        </section>
      </main>
    );
  }

  const policy = page.rules.allowCancel || page.rules.allowReschedule
    ? c.policyChange.replace("{time}", cutoffLabel(page.rules.changeCutoffMin, language))
    : c.policyNoChange.replace("{business}", page.business.name);

  return (
    <main ref={rootRef} className={pageClass} style={themeStyle} lang={language} dir={direction} data-booking-state="ready">
      <section className={styles.card}>
        {header}

        <section className={styles.step} aria-labelledby="bk-service">
          <h2 id="bk-service" className={styles.stepTitle}><span className={styles.stepNo}>1</span>{c.chooseService}</h2>
          <div className={styles.services} role="list">
            {page.services.map((s) => {
              const price = priceLabel(s, page.currency, language);
              const selected = s.id === serviceId;
              return (
                <button key={s.id} type="button" role="listitem" className={`${styles.service} ${selected ? styles.selected : ""}`} aria-pressed={selected} onClick={() => pickService(s.id)} data-service={s.id}>
                  <span className={styles.serviceName}>{s.name}</span>
                  <span className={styles.serviceMeta}>
                    {c.minutes.replace("{n}", String(s.durationMin))}
                    {price ? <> · {price}</> : null}
                    {s.location !== "in_person" ? <> · {locationLabel(s.location, language)}</> : null}
                  </span>
                  {s.description ? <span className={styles.serviceText}>{s.description}</span> : null}
                  {s.approval === "request" ? <span className={styles.serviceNote}>{c.requestNote}</span> : null}
                </button>
              );
            })}
          </div>
        </section>

        {service && showPeople ? (
          <section className={styles.step} aria-labelledby="bk-person">
            <h2 id="bk-person" className={styles.stepTitle}>{c.choosePerson}</h2>
            <div className={styles.chips}>
              {[{ id: "any", name: c.anyone }, ...service.providers].map((p) => (
                <button key={p.id} type="button" className={`${styles.chip} ${person === p.id ? styles.selected : ""}`} aria-pressed={person === p.id} onClick={() => { setPerson(p.id); setDateKey(""); }}>{p.name}</button>
              ))}
            </div>
          </section>
        ) : null}

        {service ? (
          <section className={styles.step} aria-labelledby="bk-day">
            <h2 id="bk-day" className={styles.stepTitle}><span className={styles.stepNo}>2</span>{c.chooseDay}</h2>
            {visitorZoneDiffers(page.timeZone) ? <p className={styles.zone}>🕑 {c.timesIn.replace("{zone}", zoneCity(page.timeZone))}</p> : null}
            <div className={styles.stripRow}>
              <button type="button" className={styles.arrow} aria-label={c.earlierDates} disabled={!stripStart || stripStart <= today} onClick={() => setStripStart(addDaysKey(stripStart, -BOOKING_STRIP_DAYS) < today ? today : addDaysKey(stripStart, -BOOKING_STRIP_DAYS))}>‹</button>
              <div className={styles.strip} role="list">
                {strip.map((key) => {
                  const parts = dayChipParts(key, locale);
                  const free = Boolean(days?.some((d) => d.dateKey === key && d.times.length));
                  const beyond = key > lastKey;
                  return (
                    <button key={key} type="button" role="listitem" className={`${styles.day} ${key === dateKey ? styles.selected : ""}`} disabled={!free || beyond} aria-pressed={key === dateKey} onClick={() => pickDay(key)} data-day={key}>
                      <span className={styles.dayWeek}>{parts.weekday}</span>
                      <span className={styles.dayNum}>{parts.day}</span>
                      <span className={styles.dayMonth}>{parts.month}</span>
                      {free ? <span className={styles.dot} aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
              <button type="button" className={styles.arrow} aria-label={c.laterDates} disabled={!stripStart || daysBetween(today, addDaysKey(stripStart, BOOKING_STRIP_DAYS)) > page.rules.maxDaysAhead} onClick={() => setStripStart(addDaysKey(stripStart, BOOKING_STRIP_DAYS))}>›</button>
            </div>

            <div ref={timesRef} className={styles.times} aria-live="polite">
              {timesState === "loading" ? <p className={styles.muted}>{c.loading}</p>
                : timesState === "failed" || timesState === "tooMany" ? (
                  <p className={styles.alert} role="alert">{timesState === "tooMany" ? c.tooMany : c.failed} <button type="button" className={styles.link} onClick={() => void loadTimes()}>{c.retry}</button></p>
                ) : days && !days.length ? <p className={styles.muted}>{c.noTimesRange}</p>
                : day ? (
                  <>
                    <h3 className={styles.timesTitle}>{longDate(day.dateKey, locale)}</h3>
                    {timesByPart(day.times).map((group) => (
                      <div key={group.part} className={styles.timeGroup}>
                        <span className={styles.timeGroupLabel}>{c[group.part]}</span>
                        <div className={styles.timeGrid}>
                          {group.times.map((t) => (
                            <button key={t.time} type="button" className={`${styles.time} ${t.time === time ? styles.selected : ""}`} aria-pressed={t.time === time} onClick={() => pickTime(t.time)} data-time={t.time}>{t.time}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </>
                ) : days ? <p className={styles.muted}>{c.noTimesDay}</p> : null}
            </div>
          </section>
        ) : null}

        {service && dateKey && time ? (
          <form ref={detailsRef} className={styles.step} onSubmit={(e) => void submit(e)} noValidate aria-labelledby="bk-details">
            <h2 id="bk-details" className={styles.stepTitle}><span className={styles.stepNo}>3</span>{c.yourDetails}</h2>
            <p className={styles.picked}>
              <strong>{service.name}</strong> · {longDate(dateKey, locale)}, {time}
              <button type="button" className={styles.link} onClick={() => setTime("")}>{c.change}</button>
            </p>
            <label className={styles.field}>
              <span>{c.name}</span>
              <input autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-invalid={has("name")} maxLength={120} required />
              {fieldError("name")}
            </label>
            <label className={styles.field}>
              <span>{c.email}</span>
              <input type="email" autoComplete="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} aria-invalid={has("email")} maxLength={254} required />
              {fieldError("email")}
            </label>
            {page.form.phone !== "hidden" ? (
              <label className={styles.field}>
                <span>{c.phone}{page.form.phone === "optional" ? <em> ({c.optional})</em> : null}</span>
                <input type="tel" autoComplete="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} aria-invalid={has("phone")} maxLength={40} />
                {fieldError("phone")}
              </label>
            ) : null}
            {page.form.address !== "hidden" ? (
              <label className={styles.field}>
                <span>{c.address}{page.form.address === "optional" ? <em> ({c.optional})</em> : null}</span>
                <textarea autoComplete="street-address" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} aria-invalid={has("address")} maxLength={400} />
                {fieldError("address")}
              </label>
            ) : null}
            {page.form.question ? (
              <label className={styles.field}>
                <span>{page.form.question}{!page.form.questionRequired ? <em> ({c.optional})</em> : null}</span>
                <input value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} aria-invalid={has("answer")} maxLength={1000} />
                {fieldError("answer")}
              </label>
            ) : null}
            {page.form.notes !== "hidden" ? (
              <label className={styles.field}>
                <span>{c.notes}{page.form.notes === "optional" ? <em> ({c.optional})</em> : null}</span>
                <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} aria-invalid={has("notes")} maxLength={2000} />
                {fieldError("notes")}
              </label>
            ) : null}
            {/* Left empty by people; a form-filling robot fills it and the server refuses the booking. */}
            <label className={styles.trap} aria-hidden="true">
              Website
              <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </label>
            <label className={styles.consent}>
              <input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} aria-invalid={has("consent")} />
              <span>{c.consent.replace("{business}", page.business.name)} <a href="/privacy" target="_blank" rel="noreferrer">{c.privacy}</a></span>
            </label>
            {fieldError("consent")}
            <p className={styles.policy}>{policy}</p>
            {notice ? <p className={styles.alert} role="alert">{notice}</p> : null}
            <button type="submit" className={styles.primary} disabled={submitting}>{submitting ? c.sending : service.approval === "request" ? c.sendRequest : c.confirm}</button>
          </form>
        ) : null}

        <footer className={styles.footer}>
          {languagePicker}
          {poweredBy ? <span>{c.poweredBy}</span> : null}
        </footer>
      </section>
    </main>
  );
}
