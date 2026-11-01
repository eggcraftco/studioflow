"use client";

// Delivery address (1 Nov 2026) on an order's Shipping & Tracking section — the Sections view body and the
// Cards view card both draw this block (one renderCard("shipping")). It is the recipient Royal Mail and DHL
// read (shippingName, shippingCompany, shippingStreetAddress, shippingCity, shippingPostalCode, shippingCountry,
// shippingPhone), so a manually created order can be shipped too. The free-text customer address (Customer &
// Communication) is never parsed: "Use customer address" copies it into the address rows for the person to finish.
//
// Who sees what: a role that can fully edit the order (Owner, Admin, Member) gets Add address / Edit; every
// other role sees the stored address read-only, and nothing when there is none (a Workflow Only member's copy
// of the order never carries it). The order screen hides the block on an eBay order whose buyer address eBay
// keeps private (addressRestricted) — the order document must not carry it.
// One Save sends the seven keys through updateWebOrder; the form stays open with the person's text when the
// save fails, and says so plainly when the server is one that does not accept delivery addresses yet.

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { DHL_COUNTRIES, dhlCountryName } from "@/lib/studioflow/dhlCountries";
import {
  DELIVERY_ADDRESS_LIMITS,
  UNSUPPORTED_DETAIL_FIELD_MESSAGE,
  addressRowsFromStreet,
  countryCodeFor,
  deliveryAddressIsEmpty,
  deliveryAddressMissing,
  deliveryAddressPatch,
  draftFromAddress,
  type DeliveryAddress,
  type DeliveryAddressDraft
} from "@/lib/studioflow/deliveryAddress";
import { studioLocaleTag, studioT } from "@/lib/studioflow/language";

export const DELIVERY_ADDRESS_SERVER_TOO_OLD =
  "Could not save the delivery address: the server does not accept it yet. Nothing was changed; your text is still here.";

/** The sentence a failed save shows: the plain one for a server without the delivery-address keys, else the server's. */
export function deliveryAddressSaveError(failure: string, language: string): string {
  return studioT(failure.includes(UNSUPPORTED_DETAIL_FIELD_MESSAGE) ? DELIVERY_ADDRESS_SERVER_TOO_OLD : failure, language);
}

type Props = {
  address: DeliveryAddress;
  customerName: string;
  /** customFields.communicationAddress — offered, never parsed. */
  customerAddress: string;
  /** companySettings.selectedCountry (the onboarding answer, a two-letter code). */
  workspaceCountry: string;
  canEdit: boolean;
  language: string;
  saving: boolean;
  /** Saves the seven keys; resolves to null when saved, else the error text. */
  onSave: (patch: DeliveryAddress) => Promise<string | null>;
  /** The card grid re-measures a card whose content grows (the form opening, an error line). */
  onSizeChange?: () => void;
};

export function OrderDeliveryAddress({ address, customerName, customerAddress, workspaceCountry, canEdit, language, saving, onSave, onSizeChange }: Props) {
  const [draft, setDraft] = useState<DeliveryAddressDraft | null>(null);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sizeChangeRef = useRef(onSizeChange);
  sizeChangeRef.current = onSizeChange;
  const editing = draft !== null;
  const empty = deliveryAddressIsEmpty(address);
  const freeText = String(customerAddress || "").trim();

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => sizeChangeRef.current?.());
    observer.observe(node);
    return () => observer.disconnect();
  }, [editing, empty, canEdit]);

  if (!canEdit && empty) return null;

  function open(withCustomerAddress = false) {
    const next = draftFromAddress(address, customerName, workspaceCountry);
    if (withCustomerAddress && freeText) next.rows = freeText;
    setError("");
    setDraft(next);
  }

  async function save() {
    if (!draft || saving) return;
    setError("");
    const failure = await onSave(deliveryAddressPatch(draft, address));
    if (failure === null) {
      setDraft(null);
      return;
    }
    setError(deliveryAddressSaveError(failure, language));
  }

  if (draft && canEdit) {
    return (
      <div ref={rootRef} className="order-delivery-address is-editing" data-delivery-address="edit">
        <DeliveryAddressForm
          draft={draft}
          setDraft={setDraft}
          customerAddress={freeText}
          language={language}
          saving={saving}
          error={error}
          onSubmit={() => void save()}
          onCancel={() => { setDraft(null); setError(""); }}
        />
      </div>
    );
  }

  return (
    <div ref={rootRef} className="order-delivery-address" data-delivery-address={canEdit ? "view" : "read-only"}>
      <DeliveryAddressView
        address={address}
        customerName={customerName}
        customerAddress={freeText}
        canEdit={canEdit}
        language={language}
        onAdd={() => open()}
        onUseCustomerAddress={() => open(true)}
      />
    </div>
  );
}

/** The stored address (or the empty state), with Edit / Add address / Use customer address for an editor. */
export function DeliveryAddressView({ address, customerName, customerAddress, canEdit, language, onAdd, onUseCustomerAddress }: {
  address: DeliveryAddress;
  customerName: string;
  customerAddress: string;
  canEdit: boolean;
  language: string;
  onAdd: () => void;
  onUseCustomerAddress: () => void;
}) {
  const t = (text: string) => studioT(text, language);
  const locale = studioLocaleTag(language);
  const empty = deliveryAddressIsEmpty(address);
  const code = countryCodeFor(address.shippingCountry);
  const countryLabel = code ? dhlCountryName(code, locale) : address.shippingCountry.trim();
  const rows = addressRowsFromStreet(address.shippingStreetAddress).split("\n").filter(Boolean);
  const cityLine = [address.shippingCity.trim(), address.shippingPostalCode.trim()].filter(Boolean).join(" ");
  const recipient = address.shippingName.trim() || customerName.trim();
  const missing = empty ? [] : deliveryAddressMissing(address, customerName);
  return (
    <>
      <div className="order-delivery-address__head">
        <span className="order-delivery-address__title">{t("Delivery address")}</span>
        {canEdit && !empty ? (
          <button className="order-delivery-address__button is-soft is-small" type="button" onClick={onAdd} data-delivery-address-edit="">
            {t("Edit")}
          </button>
        ) : null}
      </div>
      {empty ? (
        <div className="order-delivery-address__empty">
          <p>{t("No delivery address yet.")}</p>
          {canEdit ? (
            <div className="order-delivery-address__empty-actions">
              <button className="order-delivery-address__button is-primary" type="button" onClick={onAdd} data-delivery-address-add="">
                {t("Add address")}
              </button>
              {customerAddress ? (
                <button className="order-delivery-address__button is-soft" type="button" onClick={onUseCustomerAddress} data-delivery-use-customer-address="">
                  {t("Use customer address")}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <address className="order-delivery-address__lines" data-delivery-address-lines="">
          {recipient ? <strong>{recipient}</strong> : null}
          {address.shippingCompany.trim() ? <span>{address.shippingCompany.trim()}</span> : null}
          {rows.map((row, index) => <span key={`${index}-${row}`}>{row}</span>)}
          {cityLine ? <span>{cityLine}</span> : null}
          {countryLabel ? <span>{countryLabel}</span> : null}
          {address.shippingPhone.trim() ? <span className="order-delivery-address__phone">{address.shippingPhone.trim()}</span> : null}
        </address>
      )}
      {canEdit && missing.length > 0 ? (
        <p className="order-delivery-address__hint" data-delivery-address-missing="">{t("A shipping label needs a name, an address line, a city and a postcode.")}</p>
      ) : null}
    </>
  );
}

/** The form: Name, Company (optional), Address lines, City, Postcode, Country, Phone (optional); Save / Cancel. */
export function DeliveryAddressForm({ draft, setDraft, customerAddress, language, saving, error, onSubmit, onCancel }: {
  draft: DeliveryAddressDraft;
  setDraft: Dispatch<SetStateAction<DeliveryAddressDraft | null>>;
  customerAddress: string;
  language: string;
  saving: boolean;
  error: string;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const t = (text: string) => studioT(text, language);
  const locale = studioLocaleTag(language);
  const countries = useMemo(
    () => DHL_COUNTRIES.map(([code]) => ({ code, name: dhlCountryName(code, locale) })).sort((a, b) => a.name.localeCompare(b.name, locale)),
    [locale]
  );
  const unknownCountry = draft.country && !countryCodeFor(draft.country) ? draft.country : "";
  const set = (key: keyof DeliveryAddressDraft) => (event: { target: { value: string } }) =>
    setDraft(current => (current ? { ...current, [key]: event.target.value } : current));
  return (
    <>
      <div className="order-delivery-address__head">
        <span className="order-delivery-address__title">{t("Delivery address")}</span>
      </div>
      <form
        className="order-delivery-address__form"
        onSubmit={event => {
          event.preventDefault();
          onSubmit();
        }}
        onKeyDown={event => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      >
        <label className="order-delivery-address__field is-wide">
          <span>{t("Name")}</span>
          <input className="order-delivery-address__control" type="text" autoComplete="off" autoFocus
            maxLength={DELIVERY_ADDRESS_LIMITS.shippingName} value={draft.name} onChange={set("name")} data-delivery-field="shippingName" />
        </label>
        <label className="order-delivery-address__field is-wide">
          <span>{t("Company (optional)")}</span>
          <input className="order-delivery-address__control" type="text" autoComplete="off"
            maxLength={DELIVERY_ADDRESS_LIMITS.shippingCompany} value={draft.company} onChange={set("company")} data-delivery-field="shippingCompany" />
        </label>
        <label className="order-delivery-address__field is-wide">
          <span>{t("Address lines")}</span>
          <textarea className="order-delivery-address__control" rows={3} autoComplete="off" placeholder={t("One line per row")}
            value={draft.rows} onChange={set("rows")} data-delivery-field="shippingStreetAddress" />
        </label>
        {customerAddress && !draft.rows.trim() ? (
          <div className="order-delivery-address__use is-wide">
            <button className="order-delivery-address__button is-soft" type="button" data-delivery-use-customer-address=""
              onClick={() => setDraft(current => (current ? { ...current, rows: customerAddress } : current))}>
              {t("Use customer address")}
            </button>
            <span className="order-delivery-address__quote" title={customerAddress}>{customerAddress}</span>
          </div>
        ) : null}
        <label className="order-delivery-address__field">
          <span>{t("City")}</span>
          <input className="order-delivery-address__control" type="text" autoComplete="off"
            maxLength={DELIVERY_ADDRESS_LIMITS.shippingCity} value={draft.city} onChange={set("city")} data-delivery-field="shippingCity" />
        </label>
        <label className="order-delivery-address__field">
          <span>{t("Postcode")}</span>
          <input className="order-delivery-address__control" type="text" autoComplete="off"
            maxLength={DELIVERY_ADDRESS_LIMITS.shippingPostalCode} value={draft.postcode} onChange={set("postcode")} data-delivery-field="shippingPostalCode" />
        </label>
        <label className="order-delivery-address__field">
          <span>{t("Country")}</span>
          <select className="order-delivery-address__control" value={draft.country} onChange={set("country")} data-delivery-field="shippingCountry">
            {unknownCountry ? <option value={unknownCountry}>{unknownCountry}</option> : null}
            {countries.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}
          </select>
        </label>
        <label className="order-delivery-address__field">
          <span>{t("Phone (optional)")}</span>
          <input className="order-delivery-address__control" type="tel" autoComplete="off"
            maxLength={DELIVERY_ADDRESS_LIMITS.shippingPhone} value={draft.phone} onChange={set("phone")} data-delivery-field="shippingPhone" />
        </label>
        <p className="order-delivery-address__hint is-wide">{t("Shipping labels use this address.")}</p>
        {error ? <p className="order-delivery-address__error is-wide" role="alert" data-delivery-address-error="">{error}</p> : null}
        <div className="order-delivery-address__actions is-wide">
          <button className="order-delivery-address__button is-primary" type="submit" disabled={saving} data-delivery-address-save="">
            {saving ? t("Saving…") : t("Save")}
          </button>
          <button className="order-delivery-address__button is-soft" type="button" disabled={saving} onClick={onCancel}>
            {t("Cancel")}
          </button>
        </div>
      </form>
    </>
  );
}
