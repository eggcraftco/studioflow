"use client";

// The Quick Create mini form.
//
// "+ Add Project" used to write an empty order the moment it was pressed, so
// every abandoned click left a "New Project" ghost in the list. Nothing is
// written until "Create Project" is pressed here.
//
// This is a presenter: the caller owns the form, the saving flag and the error
// text, so the toolbar, the Orders empty state and the Schedule button can all
// open the same dialog without three copies of the create logic. It follows
// the customers modal for structure and class names (.modal-backdrop,
// .add-order-modal, .add-order-form, .add-order-actions) and adds the three
// things none of those sheets has: Escape to close, a focus trap and a scroll
// lock.

import { useEffect, useMemo, useRef, useState } from "react";
import { customerSearchMatches } from "@/lib/studioflow/customers";
import type { CustomerPickerOption } from "@/lib/studioflow/firestore";

export type QuickCreateProjectForm = {
  /** Set only when an existing directory record was picked. It wins on the
   *  server: the stored spelling is written onto the order, so a lowercase
   *  typing joins the existing customer instead of making a second one. */
  customerId: string;
  /** What is in the search box — and, when nothing was picked, the name the
   *  project is created under. */
  customerSearch: string;
  /** "+ New Customer" only reveals a name line. It never writes on its own. */
  newCustomerOpen: boolean;
  newCustomerName: string;
  projectName: string;
  /** yyyy-MM-dd, or empty. */
  dueDate: string;
};

export const EMPTY_QUICK_CREATE_PROJECT_FORM: QuickCreateProjectForm = {
  customerId: "",
  customerSearch: "",
  newCustomerOpen: false,
  newCustomerName: "",
  projectName: "",
  dueDate: ""
};

/** The customer name this form would create under — empty means genuinely no
 *  customer, which is a supported outcome (stock pieces, window work). */
export function quickCreateCustomerName(form: QuickCreateProjectForm): string {
  return (form.newCustomerOpen ? form.newCustomerName : form.customerSearch).trim();
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Tomorrow, in the person's own timezone. An order's due date is stored as a
 * count of days after the payment date and zero already means "no due date", so
 * the schema's earliest expressible date is tomorrow. The picker says so rather
 * than letting the server move a date the person chose. */
function earliestDueDate(): string {
  const day = new Date();
  day.setDate(day.getDate() + 1);
  const month = String(day.getMonth() + 1).padStart(2, "0");
  const date = String(day.getDate()).padStart(2, "0");
  return `${day.getFullYear()}-${month}-${date}`;
}

export function QuickCreateProjectDialog({
  form,
  options,
  optionsLoading,
  saving,
  error,
  t,
  onChange,
  onCancel,
  onSubmit
}: {
  form: QuickCreateProjectForm;
  options: CustomerPickerOption[];
  optionsLoading: boolean;
  saving: boolean;
  error: string;
  t: (text: string) => string;
  onChange: (form: QuickCreateProjectForm) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  const [listOpen, setListOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Escape, focus trap and scroll lock — mounted once. Keyed on nothing so a
  // parent re-render (the caller owns the form, so it re-renders on every
  // keystroke) cannot churn the body's overflow or steal focus back.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    searchInputRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancelRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(element => element.offsetWidth > 0 || element.offsetHeight > 0 || element === document.activeElement);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = active ? root.contains(active) : false;
      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  const pickedCustomer = form.customerId
    ? options.find(option => option.id === form.customerId) ?? null
    : null;

  const matches = useMemo(() => {
    if (form.customerId || form.newCustomerOpen) return [];
    // One search rule for the whole app — the Customers page calls the same
    // helper, so the two lists cannot drift apart.
    return options.filter(option => customerSearchMatches(form.customerSearch, [option.name])).slice(0, 8);
  }, [form.customerId, form.customerSearch, form.newCustomerOpen, options]);

  // The list opens on focus so the directory is discoverable, but a workspace
  // with no customers yet must not be told "no matching customer" before the
  // person has typed anything.
  const hasSearchTerm = form.customerSearch.trim().length > 0;
  const showList =
    listOpen
    && !form.customerId
    && !form.newCustomerOpen
    && !saving
    && (matches.length > 0 || hasSearchTerm || optionsLoading);

  function update(patch: Partial<QuickCreateProjectForm>) {
    onChange({ ...form, ...patch });
  }

  function pickCustomer(option: CustomerPickerOption) {
    update({ customerId: option.id, customerSearch: option.name, newCustomerOpen: false, newCustomerName: "" });
    setListOpen(false);
    setActiveIndex(-1);
  }

  function clearCustomer() {
    update({ customerId: "", customerSearch: "" });
    setActiveIndex(-1);
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!showList || matches.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(index => (index + 1) % matches.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(index => (index <= 0 ? matches.length - 1 : index - 1));
    } else if (event.key === "Enter" && activeIndex >= 0 && activeIndex < matches.length) {
      // Enter picks the highlighted record rather than submitting the form.
      event.preventDefault();
      pickCustomer(matches[activeIndex]);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={saving ? undefined : onCancel}>
      <section
        ref={dialogRef}
        className="add-order-modal quick-create-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t("New Project")}
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="add-order-header">
          <div>
            <p className="orders-kicker">{t("Quick Create")}</p>
            <h2>{t("New Project")}</h2>
            <p>{t("Nothing is saved until you press Create Project.")}</p>
          </div>
          <button className="button secondary" type="button" disabled={saving} onClick={onCancel}>
            {t("Close")}
          </button>
        </div>

        <form
          className="add-order-form"
          onSubmit={event => {
            event.preventDefault();
            if (!saving) onSubmit();
          }}
        >
          <div className="quick-create-field">
            <span className="quick-create-label">{t("Customer")}</span>
            {pickedCustomer ? (
              <span className="quick-create-chip">
                <span>{pickedCustomer.name}</span>
                <button
                  type="button"
                  aria-label={t("Clear customer")}
                  disabled={saving}
                  onClick={clearCustomer}
                >
                  ×
                </button>
              </span>
            ) : form.newCustomerOpen ? (
              <input
                className="input"
                autoFocus
                value={form.newCustomerName}
                placeholder={t("New customer name")}
                disabled={saving}
                onChange={event => update({ newCustomerName: event.target.value })}
              />
            ) : (
              <div className="quick-create-picker">
                <input
                  ref={searchInputRef}
                  className="input"
                  value={form.customerSearch}
                  placeholder={t("Search customers, or type a new name")}
                  disabled={saving}
                  role="combobox"
                  aria-expanded={showList}
                  aria-autocomplete="list"
                  aria-controls="quick-create-customer-list"
                  onFocus={() => setListOpen(true)}
                  onBlur={() => setListOpen(false)}
                  onKeyDown={onSearchKeyDown}
                  onChange={event => {
                    setListOpen(true);
                    setActiveIndex(-1);
                    update({ customerSearch: event.target.value, customerId: "" });
                  }}
                />
                {showList ? (
                  <ul className="quick-create-options" id="quick-create-customer-list" role="listbox">
                    {matches.map((option, index) => (
                      <li key={option.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={index === activeIndex}
                          className={index === activeIndex ? "is-active" : undefined}
                          // Keep the blur from cancelling the click.
                          onMouseDown={event => event.preventDefault()}
                          onClick={() => pickCustomer(option)}
                        >
                          {option.name}
                        </button>
                      </li>
                    ))}
                    {matches.length === 0 ? (
                      <li className="quick-create-options-empty">
                        {optionsLoading ? t("Loading customers...") : t("No matching customer. It will be created with this name.")}
                      </li>
                    ) : null}
                  </ul>
                ) : null}
              </div>
            )}
            <div className="quick-create-hints">
              <span>{t("Optional. A project can be opened with no customer at all.")}</span>
              {form.newCustomerOpen ? (
                <button
                  type="button"
                  className="quick-create-link"
                  disabled={saving}
                  onClick={() => update({ newCustomerOpen: false, newCustomerName: "" })}
                >
                  {t("Search customers instead")}
                </button>
              ) : pickedCustomer ? null : (
                <button
                  type="button"
                  className="quick-create-link"
                  disabled={saving}
                  onClick={() => update({
                    newCustomerOpen: true,
                    newCustomerName: form.customerSearch,
                    customerId: ""
                  })}
                >
                  + {t("New Customer")}
                </button>
              )}
            </div>
          </div>

          <label>
            {t("Project Name")}
            <input
              className="input"
              value={form.projectName}
              placeholder={t("Leave blank and we will name it for you")}
              disabled={saving}
              onChange={event => update({ projectName: event.target.value })}
            />
          </label>

          <label>
            {t("Due Date")}
            <input
              className="input"
              type="date"
              value={form.dueDate}
              min={earliestDueDate()}
              disabled={saving}
              onChange={event => update({ dueDate: event.target.value })}
            />
          </label>

          {error ? <p className="layout-error" style={{ margin: 0 }}>{t(error)}</p> : null}

          <div className="add-order-actions">
            <button className="button secondary" type="button" disabled={saving} onClick={onCancel}>
              {t("Cancel")}
            </button>
            <button className="button" type="submit" disabled={saving}>
              {saving ? t("Creating...") : t("Create Project")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
