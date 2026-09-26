"use client";

// DHL Express in Settings ▸ Integrations: the workspace's own MyDHL API key, its
// account number, and the sender details every label starts from.
//
// - Only the owner connects or disconnects. The key is checked against DHL
//   before anything is stored, stored encrypted on the server, and never shown
//   again; the account number comes back as its last four digits.
// - The owner or an admin keeps the sender details. Other members see whether
//   DHL is connected, nothing more.
// - The tile and this screen exist only where the server has opened DHL for the
//   workspace (appConfig/shipping); the public integrations page does not list it.
import { useCallback, useEffect, useState } from "react";
import { studioLocaleTag, studioT } from "@/lib/studioflow/language";
import type { WorkspaceContext } from "@/lib/studioflow/firestore";
import { CardTitle } from "@/components/CardTitle";
import { DHL_COUNTRIES, dhlCountryName } from "@/lib/studioflow/dhlCountries";
import {
  REGISTRATION_TYPES,
  disconnectShippingConnection,
  getShippingConnection,
  saveShippingConnection,
  saveShippingSenderProfile,
  shippingErrorMessage,
  shippingErrorReason,
  type ShipperProfile,
  type ShippingConnectionView,
  type ShippingEnvironment
} from "@/lib/studioflow/shipping";

type Props = { workspace: WorkspaceContext; language?: string };

const EMPTY_PROFILE: ShipperProfile = {
  companyName: "", contactName: "", phone: "", email: "", addressLine1: "", addressLine2: "", city: "", postalCode: "",
  provinceCode: "", countryCode: "", timeZone: "Europe/London", registrationNumbers: []
};

const PROFILE_FIELDS: { key: keyof ShipperProfile; label: string }[] = [
  { key: "companyName", label: "Business name" },
  { key: "contactName", label: "Contact name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "addressLine1", label: "Street address" },
  { key: "addressLine2", label: "Address line 2 (optional)" },
  { key: "city", label: "City" },
  { key: "postalCode", label: "Postcode" },
  { key: "provinceCode", label: "State or province code (optional)" }
];

function timeZones(): string[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone");
  return supported && supported.length ? supported : ["Europe/London"];
}

export function DhlExpressIntegrationSection({ workspace, language = "English" }: Props) {
  const t = useCallback((text: string) => studioT(text, language), [language]);
  const locale = studioLocaleTag(language);
  const companyId = workspace.id.trim();
  const isOwner = workspace.role === "owner";
  const [view, setView] = useState<ShippingConnectionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [environment, setEnvironment] = useState<ShippingEnvironment>("test");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [dutiesAccountNumber, setDutiesAccountNumber] = useState("");
  const [profile, setProfile] = useState<ShipperProfile>(EMPTY_PROFILE);
  const [profileProblems, setProfileProblems] = useState<{ code: string; field: string }[]>([]);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  // The server returns the sender details only to those who may edit them.
  const canEditProfile = Boolean(view && "shipperProfile" in view);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    try {
      const next = await getShippingConnection(companyId, { fresh: true });
      setView(next);
      setProfile({ ...EMPTY_PROFILE, ...(next.shipperProfile ?? {}) });
    } catch (failure) {
      setError(shippingErrorMessage(failure, t));
    } finally {
      setLoading(false);
    }
  }, [companyId, t]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function guard(key: string, work: () => Promise<void>) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (failure) {
      setError(shippingErrorMessage(failure, t));
      if (shippingErrorReason(failure) === "profile_invalid") {
        const details = (failure as { details?: { problems?: { code: string; field: string }[] } }).details;
        setProfileProblems(details?.problems ?? []);
      }
    } finally {
      setBusy("");
    }
  }

  const problemFor = (field: string) => profileProblems.find(problem => problem.field === field || problem.field.startsWith(`${field}[`));
  const problemText = (code: string) => code === "required" ? t("Required.")
    : code === "country_invalid" ? t("Choose a country from the list.")
    : code === "time_zone_invalid" ? t("Choose a time zone from the list.")
    : code === "registration_type_invalid" ? t("Choose a registration type from the list.")
    : code === "too_long" ? t("Longer than DHL accepts.")
    : t("Check this field.");

  const connectForm = (
    <div className="shipment-settings-form">
      <p className="muted-copy">{t("Use the MyDHL API key and secret DHL gave your business, and your DHL Express account number. NivaDesk checks them with DHL before saving, stores them encrypted, and never shows the secret again.")}</p>
      <div className="shipment-actions">
        {(["test", "production"] as ShippingEnvironment[]).map(env => (
          <label key={env} className="inventory-check">
            <input type="radio" name="dhl-env" checked={environment === env} onChange={() => setEnvironment(env)} disabled={busy === "connect"} />
            {env === "test" ? t("DHL test environment") : t("DHL production")}
          </label>
        ))}
      </div>
      {environment === "test" ? <p className="shipment-muted">{t("Labels from DHL's test environment are not real shipments.")}</p> : null}
      <div className="inventory-form">
        <label className="inventory-field"><span>{t("API key")}</span>
          <input className="input" value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="off" spellCheck={false} disabled={busy === "connect"} /></label>
        <label className="inventory-field"><span>{t("API secret")}</span>
          <input className="input" type="password" value={apiSecret} onChange={e => setApiSecret(e.target.value)} autoComplete="new-password" spellCheck={false} disabled={busy === "connect"} /></label>
        <label className="inventory-field"><span>{t("DHL Express account number")}</span>
          <input className="input" inputMode="numeric" value={accountNumber} onChange={e => setAccountNumber(e.target.value.replace(/\D/g, ""))} autoComplete="off" disabled={busy === "connect"} /></label>
        <label className="inventory-field"><span>{t("Duties account number (optional)")}</span>
          <input className="input" inputMode="numeric" value={dutiesAccountNumber} onChange={e => setDutiesAccountNumber(e.target.value.replace(/\D/g, ""))} autoComplete="off" disabled={busy === "connect"} /></label>
      </div>
      <p className="shipment-muted">{t("When you choose to pay destination duties for a customer, NivaDesk names this account to DHL for them. Without it, only your main account is sent.")}</p>
      <div className="shipment-actions">
        <button
          type="button"
          className="button"
          disabled={busy === "connect" || !apiKey.trim() || !apiSecret.trim() || !accountNumber.trim()}
          onClick={() => guard("connect", async () => {
            const out = await saveShippingConnection(companyId, {
              environment, apiKey: apiKey.trim(), apiSecret: apiSecret.trim(), accountNumber: accountNumber.trim(), dutiesAccountNumber: dutiesAccountNumber.trim()
            });
            setApiSecret("");
            setShowForm(false);
            setNotice(`${t("DHL Express connected.")} ${t("Account")} ••••${out.accountLast4}`);
            await refresh();
          })}
        >{busy === "connect" ? t("Checking with DHL…") : view?.connected ? t("Save new credentials") : t("Connect DHL Express")}</button>
        {view?.connected && showForm ? <button type="button" className="button secondary" onClick={() => { setShowForm(false); setApiSecret(""); }}>{t("Cancel")}</button> : null}
      </div>
    </div>
  );

  const updateRegistration = (index: number, key: "typeCode" | "number", value: string) => {
    setProfile(current => ({
      ...current,
      registrationNumbers: current.registrationNumbers.map((row, i) => (i === index ? { ...row, [key]: value } : row))
    }));
  };

  const senderForm = (
    <div className="shipment-settings-form">
      <p className="muted-copy">{t("Every new DHL shipment starts from these details. They are printed on the label and the commercial invoice.")}</p>
      <div className="inventory-form">
        {PROFILE_FIELDS.map(field => {
          const problem = problemFor(field.key);
          return (
            <label key={field.key} className="inventory-field">
              <span>{t(field.label)}</span>
              <input
                className="input"
                value={String(profile[field.key] ?? "")}
                onChange={e => setProfile(current => ({ ...current, [field.key]: e.target.value }))}
                aria-invalid={problem ? true : undefined}
              />
              {problem ? <small className="app-inline-error">{problemText(problem.code)}</small> : null}
            </label>
          );
        })}
        <label className="inventory-field">
          <span>{t("Country")}</span>
          <select className="input" value={profile.countryCode} onChange={e => setProfile(current => ({ ...current, countryCode: e.target.value }))}>
            <option value="">{t("Choose…")}</option>
            {DHL_COUNTRIES.map(([code]) => ({ code, name: dhlCountryName(code, locale) }))
              .sort((a, b) => a.name.localeCompare(b.name, locale))
              .map(country => <option key={country.code} value={country.code}>{country.name}</option>)}
          </select>
          {problemFor("countryCode") ? <small className="app-inline-error">{problemText(problemFor("countryCode")!.code)}</small> : null}
        </label>
        <label className="inventory-field">
          <span>{t("Time zone")}</span>
          <select className="input" value={profile.timeZone} onChange={e => setProfile(current => ({ ...current, timeZone: e.target.value }))}>
            {timeZones().map(zone => <option key={zone} value={zone}>{zone}</option>)}
          </select>
        </label>
      </div>
      <div className="shipment-subhead">{t("Registration numbers (EORI, VAT)")}</div>
      {profile.registrationNumbers.map((row, index) => (
        <div key={index} className="shipment-actions">
          <select className="input shipment-registration-type" value={row.typeCode} onChange={e => updateRegistration(index, "typeCode", e.target.value)} aria-label={t("Type")}>
            {REGISTRATION_TYPES.map(code => <option key={code} value={code}>{code === "EOR" ? t("EORI number") : code === "VAT" ? t("VAT number") : code}</option>)}
          </select>
          <input className="input" value={row.number} onChange={e => updateRegistration(index, "number", e.target.value)} aria-label={t("Number")} />
          <button type="button" className="inventory-link inventory-link-danger" onClick={() => setProfile(current => ({ ...current, registrationNumbers: current.registrationNumbers.filter((_, i) => i !== index) }))}>{t("Remove")}</button>
        </div>
      ))}
      <button
        type="button"
        className="inventory-link"
        onClick={() => setProfile(current => ({ ...current, registrationNumbers: [...current.registrationNumbers, { typeCode: "EOR", number: "", issuerCountryCode: current.countryCode }] }))}
      >{t("+ Add a registration number")}</button>
      <div className="shipment-actions">
        <button
          type="button"
          className="button"
          disabled={busy === "profile"}
          onClick={() => guard("profile", async () => {
            setProfileProblems([]);
            await saveShippingSenderProfile(companyId, {
              ...profile,
              registrationNumbers: profile.registrationNumbers.filter(row => row.number.trim()).map(row => ({ ...row, issuerCountryCode: row.issuerCountryCode || profile.countryCode }))
            });
            setNotice(t("Sender details saved. New shipments start from them."));
            await refresh();
          })}
        >{busy === "profile" ? t("Saving…") : t("Save sender details")}</button>
      </div>
    </div>
  );

  return (
    <div className="settings-card-stack">
      {notice ? <p className="settings-notice" style={{ color: "#16a34a", fontWeight: 600 }}>{notice}</p> : null}
      {error ? <p className="settings-notice" style={{ color: "#dc2626", fontWeight: 600 }}>{error}</p> : null}
      {loading ? <p className="muted-copy">{t("Loading...")}</p> : !view?.enabled ? (
        <section className="settings-card">
          <CardTitle icon="bolt" eyebrow="DHL Express" title={t("Not available yet")} />
          <p className="muted-copy">{t("DHL Express is not available for this workspace yet.")}</p>
        </section>
      ) : (
        <>
          <section className="settings-card">
            <CardTitle icon="bolt" eyebrow="DHL Express" title={view.connected ? t("Connected") : t("Connect your DHL Express account")} />
            <p className="muted-copy">{t("Create DHL Express labels from an order, with the customs declaration, and follow each parcel.")} {t("NivaDesk never books a pickup, and never marks an order dispatched before DHL scans the parcel.")}</p>
            {view.connected ? (
              <>
                <ul className="settings-facts">
                  <li>{t("Environment")} <strong>{view.environment === "production" ? t("DHL production") : t("DHL test environment")}</strong></li>
                  {view.accountLast4 ? <li>{t("Account")} <strong>••••{view.accountLast4}</strong></li> : null}
                  {view.dutiesAccountLast4 ? <li>{t("Duties account")} <strong>••••{view.dutiesAccountLast4}</strong></li> : null}
                </ul>
                {isOwner ? (
                  showForm ? connectForm : <button type="button" className="button secondary" onClick={() => setShowForm(true)}>{t("Enter new credentials")}</button>
                ) : null}
              </>
            ) : isOwner ? connectForm : (
              <p className="muted-copy">{t("Only the workspace owner can connect or disconnect DHL Express.")}</p>
            )}
          </section>

          {canEditProfile ? (
            <section className="settings-card">
              <CardTitle icon="orders" eyebrow="DHL Express" title={t("Sender details")} />
              {view.connected && view.profileComplete === false ? (
                <p className="shipment-banner" data-tone="warn">{t("The sender details are not complete. Labels cannot be created until they are.")}</p>
              ) : null}
              {senderForm}
            </section>
          ) : null}

          {isOwner && view.connected ? (
            <section className="settings-card">
              <CardTitle icon="bolt" eyebrow="DHL Express" title={t("Disconnect DHL Express")} />
              {confirmDisconnect ? (
                <div className="shipment-settings-form">
                  <p className="muted-copy">{t("Disconnect DHL Express? The stored key is deleted, no new label can be created and tracking stops. Shipments already made stay on their orders.")}</p>
                  <div className="shipment-actions">
                    <button type="button" className="button danger" disabled={busy === "disconnect"} onClick={() => guard("disconnect", async () => {
                      await disconnectShippingConnection(companyId);
                      setConfirmDisconnect(false);
                      setNotice(t("DHL Express disconnected."));
                      await refresh();
                    })}>{t("Disconnect")}</button>
                    <button type="button" className="button secondary" onClick={() => setConfirmDisconnect(false)}>{t("Keep connected")}</button>
                  </div>
                </div>
              ) : <button type="button" className="button secondary" onClick={() => setConfirmDisconnect(true)}>{t("Disconnect DHL Express")}</button>}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
