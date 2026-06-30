"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CardIconGlyph, CardTitle } from "@/components/CardTitle";
import { LoadingScreen } from "@/components/LoadingScreen";
import { hiddenMoneyLabel, usePricePrivacy } from "@/components/PricePrivacy";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  loadWorkspaceContext,
  loadWorkspaceCustomers,
  loadWorkspaceSettingsOverview,
  workspaceAccessAllows,
  type CustomerDirectoryItem,
  type CustomerOrderSummary,
  type WorkspaceContext,
  type WorkspaceSettingsOverview
} from "@/lib/studioflow/firestore";
import { formatStudioMoney, moneySymbol, type StudioMoneySettings } from "@/lib/studioflow/money";
import { useResizableSidebar } from "@/lib/studioflow/useResizableSidebar";
import {
  canManageCustomersForRole,
  createCustomerFromWeb,
  deleteCustomerFromWeb,
  updateCustomerFromWeb,
  uploadCustomerPhoto,
  CUSTOMER_PHOTO_ACCEPT,
  type CustomerFormInput
} from "@/lib/studioflow/customers";
import { studioT } from "@/lib/studioflow/language";

type SortMode = "recent" | "orders";
type FormMode = "create" | "edit" | null;
type CustomerUpdatePatch = Partial<CustomerFormInput>;

const EMPTY_CUSTOMER_FORM: CustomerFormInput = {
  name: "",
  email: "",
  phone: "",
  instagram: "",
  address: "",
  streetAddress: "",
  city: "",
  postalCode: "",
  country: "",
  shippingStreetAddress: "",
  shippingCity: "",
  shippingPostalCode: "",
  shippingCountry: "",
  shippingPhone: "",
  notes: ""
};

function money(value: number, hidden: boolean, settings: StudioMoneySettings) {
  if (hidden) return hiddenMoneyLabel(moneySymbol(settings));
  return formatStudioMoney(value, settings);
}

function formatDate(date: Date | null) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function initials(value: string) {
  return customerDisplayName(value).split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "C";
}

function customerDisplayName(value: string) {
  const cleaned = value.trim();
  if (!cleaned || ["new order", "new project", "yeni sipariş", "yeni proje"].includes(cleaned.toLowerCase())) {
    return "New Project";
  }
  return cleaned;
}

function cleanCustomerForm(input: CustomerFormInput): CustomerFormInput {
  const cleaned: CustomerFormInput = {
    name: customerDisplayName(input.name),
    email: input.email.trim(),
    phone: input.phone.trim(),
    instagram: input.instagram.trim(),
    address: input.address.trim(),
    streetAddress: input.streetAddress.trim(),
    city: input.city.trim(),
    postalCode: input.postalCode.trim(),
    country: input.country.trim(),
    shippingStreetAddress: input.shippingStreetAddress.trim(),
    shippingCity: input.shippingCity.trim(),
    shippingPostalCode: input.shippingPostalCode.trim(),
    shippingCountry: input.shippingCountry.trim(),
    shippingPhone: input.shippingPhone.trim(),
    notes: input.notes.trim()
  };
  // Pass the photo through only when a patch explicitly sets it; otherwise the
  // backend keeps the existing avatar.
  if (typeof input.profileImageUrl === "string") {
    cleaned.profileImageUrl = input.profileImageUrl;
  }
  return cleaned;
}

function formFromCustomer(customer: CustomerDirectoryItem): CustomerFormInput {
  return {
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    instagram: customer.instagram,
    address: customer.address,
    streetAddress: customer.streetAddress || customer.address,
    city: customer.city,
    postalCode: customer.postalCode,
    country: customer.country,
    shippingStreetAddress: customer.shippingStreetAddress,
    shippingCity: customer.shippingCity,
    shippingPostalCode: customer.shippingPostalCode,
    shippingCountry: customer.shippingCountry,
    shippingPhone: customer.shippingPhone,
    notes: customer.notes
  };
}

function normalizedCustomerLookup(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export default function CustomersPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [moneySettings, setMoneySettings] = useState<WorkspaceSettingsOverview | null>(null);
  const [customers, setCustomers] = useState<CustomerDirectoryItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [error, setError] = useState("");
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [form, setForm] = useState<CustomerFormInput>(EMPTY_CUSTOMER_FORM);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [savingInlineField, setSavingInlineField] = useState("");
  const [actionStatus, setActionStatus] = useState("");
  const [actionError, setActionError] = useState("");
  const [requestedCustomerId, setRequestedCustomerId] = useState("");
  const [requestedCustomerName, setRequestedCustomerName] = useState("");
  const [customerContextMenu, setCustomerContextMenu] = useState<{ customerId: string; x: number; y: number } | null>(null);
  const sidebar = useResizableSidebar({ storageKey: "studioflow-customers-sidebar", workspaceId: workspace?.id, initialWidth: 360, maxWidth: 720 });

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, router, user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRequestedCustomerId(params.get("customerId") ?? "");
    setRequestedCustomerName(params.get("customerName") ?? "");
  }, []);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    let cancelled = false;

    async function run() {
      setLoadingCustomers(true);
      setError("");
      try {
        const loadedWorkspace = await loadWorkspaceContext(uid);
        if (cancelled) return;
        if (!workspaceAccessAllows(loadedWorkspace.memberAccess, "customers")) {
          router.replace("/orders");
          return;
        }
        setWorkspace(loadedWorkspace);

        const [loadedCustomers, loadedMoneySettings] = await Promise.all([
          loadWorkspaceCustomers(loadedWorkspace.id),
          loadWorkspaceSettingsOverview(loadedWorkspace.id).catch(() => null)
        ]);
        if (cancelled) return;
        setCustomers(loadedCustomers);
        setMoneySettings(loadedMoneySettings);
        const requestedCustomer = requestedCustomerId
          ? loadedCustomers.find(customer => customer.id === requestedCustomerId)
          : requestedCustomerName
            ? loadedCustomers.find(customer => normalizedCustomerLookup(customer.name) === normalizedCustomerLookup(requestedCustomerName))
            : null;
        setSelectedCustomerId(current => requestedCustomer?.id || current || loadedCustomers[0]?.id || "");
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not load customers.");
      } finally {
        if (!cancelled) setLoadingCustomers(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [requestedCustomerId, requestedCustomerName, user]);

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? customers.filter(customer => [
          customer.name,
          customer.email,
          customer.phone,
          customer.instagram,
          customer.address,
          customer.streetAddress,
          customer.city,
          customer.postalCode,
          customer.country
        ].some(value => value.toLowerCase().includes(term)))
      : customers;

    return [...filtered].sort((lhs, rhs) => {
      if (sortMode === "orders") {
        if (lhs.orderCount !== rhs.orderCount) return rhs.orderCount - lhs.orderCount;
      }
      const left = lhs.lastContactDate?.getTime() ?? 0;
      const right = rhs.lastContactDate?.getTime() ?? 0;
      if (left !== right) return right - left;
      return lhs.name.localeCompare(rhs.name);
    });
  }, [customers, search, sortMode]);

  const selectedCustomer = useMemo(
    () => filteredCustomers.find(customer => customer.id === selectedCustomerId)
      ?? customers.find(customer => customer.id === selectedCustomerId)
      ?? filteredCustomers[0]
      ?? null,
    [customers, filteredCustomers, selectedCustomerId]
  );
  const contextCustomer = useMemo(
    () => customerContextMenu
      ? customers.find(customer => customer.id === customerContextMenu.customerId) ?? null
      : null,
    [customerContextMenu, customers]
  );

  const canSeeFinance = Boolean(workspace && workspaceAccessAllows(workspace.memberAccess, "financialInfo"));
  const canManageCustomers = Boolean(workspace && canManageCustomersForRole(workspace.role));
  const language = moneySettings?.selectedLanguage ?? "English";
  const t = (text: string) => studioT(text, language);

  useEffect(() => {
    if (!customerContextMenu) return;

    function closeMenu() {
      setCustomerContextMenu(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeMenu();
    }

    window.addEventListener("click", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [customerContextMenu]);

  async function refreshCustomers(selectCustomerId?: string) {
    if (!workspace) return;
    const loadedCustomers = await loadWorkspaceCustomers(workspace.id);
    setCustomers(loadedCustomers);
    if (selectCustomerId) {
      setSelectedCustomerId(selectCustomerId);
    } else if (!loadedCustomers.some(customer => customer.id === selectedCustomerId)) {
      setSelectedCustomerId(loadedCustomers[0]?.id || "");
    }
  }

  function openCreateForm() {
    setActionStatus("");
    setActionError("");
    setForm(EMPTY_CUSTOMER_FORM);
    setFormMode("create");
  }

  function openEditForm(customer: CustomerDirectoryItem) {
    setActionStatus("");
    setActionError("");
    setForm(formFromCustomer(customer));
    setFormMode("edit");
  }

  function openCustomerContextMenu(event: MouseEvent<HTMLButtonElement>, customer: CustomerDirectoryItem) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedCustomerId(customer.id);
    setCustomerContextMenu({
      customerId: customer.id,
      x: Math.min(event.clientX, window.innerWidth - 230),
      y: Math.min(event.clientY, window.innerHeight - 70)
    });
  }

  async function handleSaveCustomer(event: React.FormEvent) {
    event.preventDefault();
    if (!workspace || !formMode) return;

    setSavingCustomer(true);
    setActionStatus(formMode === "create" ? "Creating customer..." : "Saving customer...");
    setActionError("");
    try {
      const cleanForm = cleanCustomerForm(form);
      if (formMode === "create") {
        const result = await createCustomerFromWeb(workspace, cleanForm);
        await refreshCustomers(result.customerId || undefined);
        setActionStatus("Customer created.");
      } else if (selectedCustomer) {
        await updateCustomerFromWeb(workspace, selectedCustomer.id, cleanForm);
        await refreshCustomers(selectedCustomer.id);
        setActionStatus("Customer updated.");
      }
      setFormMode(null);
    } catch (saveError) {
      setActionStatus("");
      setActionError(saveError instanceof Error ? saveError.message : "Could not save customer.");
    } finally {
      setSavingCustomer(false);
    }
  }

  async function handleDeleteCustomer(customer: CustomerDirectoryItem) {
    if (!workspace) return;
    if (!canManageCustomers) {
      setActionError("Your workspace role cannot delete customers.");
      return;
    }

    const confirmed = window.confirm(`Delete "${customerDisplayName(customer.name)}" from Customers? Related orders will stay in Orders, but their customer name will reset to "New Project".`);
    if (!confirmed) return;

    setSavingCustomer(true);
    setActionStatus("Deleting customer...");
    setActionError("");
    try {
      const result = await deleteCustomerFromWeb(workspace, customer.id);
      const nextCustomerId = customers.find(item => item.id !== customer.id)?.id || "";
      await refreshCustomers(nextCustomerId);
      const clearedOrderCount = typeof result.clearedOrderCount === "number" ? result.clearedOrderCount : 0;
      setActionStatus(clearedOrderCount > 0
        ? `Customer deleted. ${clearedOrderCount} related orders were reset to New Project.`
        : "Customer deleted.");
    } catch (deleteError) {
      setActionStatus("");
      setActionError(deleteError instanceof Error ? deleteError.message : "Could not delete customer.");
    } finally {
      setSavingCustomer(false);
    }
  }

  async function handleInlineCustomerUpdate(customer: CustomerDirectoryItem, patch: CustomerUpdatePatch, fieldLabel: string) {
    if (!workspace) return;
    if (!canManageCustomers) {
      setActionError("Your workspace role cannot edit customers.");
      return;
    }

    const nextForm: CustomerFormInput = {
      ...formFromCustomer(customer),
      ...patch
    };
    if ("streetAddress" in patch || "city" in patch || "postalCode" in patch || "country" in patch) {
      nextForm.address = "";
    }
    const cleanForm = cleanCustomerForm(nextForm);

    setSavingInlineField(fieldLabel);
    setActionStatus(`Saving ${fieldLabel}...`);
    setActionError("");
    try {
      await updateCustomerFromWeb(workspace, customer.id, cleanForm);
      setCustomers(currentCustomers => currentCustomers.map(item => item.id === customer.id ? {
        ...item,
        ...patch,
        ...cleanForm
      } : item));
      await refreshCustomers(customer.id);
      setActionStatus(`${fieldLabel} updated.`);
    } catch (saveError) {
      setActionStatus("");
      setActionError(saveError instanceof Error ? saveError.message : "Could not update customer.");
    } finally {
      setSavingInlineField("");
    }
  }

  async function handleCustomerPhotoUpload(customer: CustomerDirectoryItem, file: File) {
    if (!workspace) return;
    if (!canManageCustomers) {
      setActionError("Your workspace role cannot edit customers.");
      return;
    }
    setSavingInlineField("Customer photo");
    setActionStatus("Uploading customer photo...");
    setActionError("");
    try {
      const photoURL = await uploadCustomerPhoto(workspace, file);
      await handleInlineCustomerUpdate(customer, { profileImageUrl: photoURL }, "Customer photo");
    } catch (uploadError) {
      setActionStatus("");
      setActionError(uploadError instanceof Error ? uploadError.message : "Could not upload customer photo.");
    } finally {
      setSavingInlineField("");
    }
  }

  if (loading || !user) return <LoadingScreen />;

  return (
    <AppShell>
      {loadingCustomers ? <LoadingScreen /> : null}

      <section
        className={sidebar.collapsed ? "customers-workspace resizable-workspace is-sidebar-collapsed" : "customers-workspace resizable-workspace"}
        style={sidebar.workspaceStyle}
      >
        <aside className="customers-sidebar">
          <div className="orders-sidebar-toolbar">
            <div>
              <p className="orders-kicker">{t("Customers")}</p>
              <h1>{customers.length} {t("customers")}</h1>
              <p>{workspace ? `${workspace.name} - ${workspace.roleLabel}` : t("Loading workspace...")}</p>
            </div>
            <div className="customers-toolbar-actions">
              {workspace ? <span className="studio-pill">{workspace.billingPlanName}</span> : null}
              <button
                className="sidebar-toggle-button"
                type="button"
                title={sidebar.collapsed ? t("Expand customer list") : t("Collapse customer list")}
                aria-label={sidebar.collapsed ? t("Expand customer list") : t("Collapse customer list")}
                onClick={() => sidebar.setCollapsed(value => !value)}
              >
                {sidebar.collapsed ? ">" : "<"}
              </button>
              <button
                className="button customer-action-button"
                type="button"
                disabled={!canManageCustomers}
                title={canManageCustomers ? t("Add customer") : t("Your role cannot create customers")}
                onClick={openCreateForm}
              >
                + {t("Customer")}
              </button>
            </div>
          </div>

          <div className="customers-filter-bar">
            <label className="customers-search">
              <span>{t("Search")}</span>
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder={t("Name, email, phone...")} />
            </label>
            <div className="segmented-control customers-segmented">
              <button type="button" className={sortMode === "recent" ? "active" : ""} onClick={() => setSortMode("recent")}>{t("Recent")}</button>
              <button type="button" className={sortMode === "orders" ? "active" : ""} onClick={() => setSortMode("orders")}>{t("Most Orders")}</button>
            </div>
          </div>

          {error ? (
            <div className="mini-panel compact-mini-panel">
              <CardTitle icon="lock" eyebrow={t("Customer error")} title={t("Could not load customers")} />
              <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>
            </div>
          ) : null}

          {filteredCustomers.length === 0 && !loadingCustomers ? (
            <p className="muted-copy" style={{ padding: "0 14px 14px" }}>{t("No customers match this search yet.")}</p>
          ) : null}

          <div className="customers-list">
            {filteredCustomers.map(customer => (
              <CustomerListCard
                key={customer.id}
                customer={customer}
                selected={customer.id === selectedCustomer?.id}
                canSeeFinance={canSeeFinance}
                moneySettings={moneySettings}
                language={language}
                onSelect={() => setSelectedCustomerId(customer.id)}
                onContextMenu={event => openCustomerContextMenu(event, customer)}
              />
            ))}
          </div>
        </aside>

        <button
          className="workspace-sidebar-resizer"
          type="button"
          aria-label={t("Resize customer list")}
          title={t("Resize customer list")}
          onPointerDown={sidebar.startResize}
        />

        <main className="customers-detail-pane">
          {actionStatus ? <p className="layout-status customer-action-message">{actionStatus}</p> : null}
          {actionError ? <p className="layout-error customer-action-message">{actionError}</p> : null}

          {selectedCustomer ? (
            <CustomerDetail
              customer={selectedCustomer}
              canSeeFinance={canSeeFinance}
              canManageCustomers={canManageCustomers}
              moneySettings={moneySettings}
              savingInlineField={savingInlineField}
              language={language}
              onSaveDetails={(patch, fieldLabel) => handleInlineCustomerUpdate(selectedCustomer, patch, fieldLabel)}
              onUploadPhoto={file => handleCustomerPhotoUpload(selectedCustomer, file)}
            />
          ) : (
            <section className="orders-empty-detail">
              <CardTitle icon="customer" eyebrow={t("Select customer")} title={t("Choose a customer from the list")} />
              <p className="muted-copy">{t("Customer details and related orders will appear here.")}</p>
            </section>
          )}
        </main>
      </section>

      {formMode ? (
        <CustomerFormModal
          mode={formMode}
          form={form}
          saving={savingCustomer}
          error={actionError}
          onChange={setForm}
          onCancel={() => {
            if (!savingCustomer) setFormMode(null);
          }}
          onSubmit={handleSaveCustomer}
        />
      ) : null}

      {customerContextMenu && contextCustomer ? (
        <div
          className="order-list-context-menu customer-list-context-menu"
          style={{ left: customerContextMenu.x, top: customerContextMenu.y }}
          role="menu"
          onClick={event => event.stopPropagation()}
        >
          <button
            className="order-list-context-row danger"
            type="button"
            role="menuitem"
            disabled={!canManageCustomers}
            onClick={() => {
              setCustomerContextMenu(null);
              void handleDeleteCustomer(contextCustomer);
            }}
          >
            <span aria-hidden="true">⌫</span>
            {t("Delete Customer")}
          </button>
        </div>
      ) : null}
    </AppShell>
  );
}

function CustomerListCard({
  customer,
  selected,
  canSeeFinance,
  moneySettings,
  language,
  onSelect,
  onContextMenu
}: {
  customer: CustomerDirectoryItem;
  selected: boolean;
  canSeeFinance: boolean;
  moneySettings: StudioMoneySettings;
  language: string;
  onSelect: () => void;
  onContextMenu: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const { hideNumbers } = usePricePrivacy();
  const t = (text: string) => studioT(text, language);
  const displayName = customerDisplayName(customer.name);
  const designNames = customer.orders
    .map(order => order.designName.trim() || "Untitled design")
    .filter(Boolean)
    .slice(0, 3);
  const extraDesignCount = Math.max(customer.orders.length - designNames.length, 0);

  return (
    <button type="button" className={selected ? "customer-list-card selected" : "customer-list-card"} onClick={onSelect} onContextMenu={onContextMenu}>
      <CustomerAvatar customer={customer} size="small" />
      <span className="customer-list-body">
        <strong title={displayName}>{displayName}</strong>
        <small>{customer.email || customer.phone || customer.instagram || t("No contact details")}</small>
        {designNames.length > 0 ? (
          <span className="customer-list-designs" aria-label="Customer designs">
            {designNames.map((designName, index) => (
              <span key={`${designName}-${index}`} title={designName}>{designName}</span>
            ))}
            {extraDesignCount > 0 ? <span>+{extraDesignCount} {t("more")}</span> : null}
          </span>
        ) : null}
        <span className="customer-list-meta">
          <span className="studio-pill">{customer.orderCount} {t("orders")}</span>
          <span className="studio-pill">{formatDate(customer.lastContactDate)}</span>
          {canSeeFinance ? <span className="studio-pill">{money(customer.totalValue, hideNumbers, moneySettings)}</span> : null}
        </span>
      </span>
    </button>
  );
}

function CustomerDetail({
  customer,
  canSeeFinance,
  canManageCustomers,
  moneySettings,
  savingInlineField,
  language,
  onSaveDetails,
  onUploadPhoto
}: {
  customer: CustomerDirectoryItem;
  canSeeFinance: boolean;
  canManageCustomers: boolean;
  moneySettings: StudioMoneySettings;
  savingInlineField: string;
  language: string;
  onSaveDetails: (patch: CustomerUpdatePatch, fieldLabel: string) => Promise<void>;
  onUploadPhoto: (file: File) => Promise<void>;
}) {
  const { hideNumbers } = usePricePrivacy();
  const t = (text: string) => studioT(text, language);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const uploadingPhoto = savingInlineField === "Customer photo";

  const [activeTab, setActiveTab] = useState<"Orders" | "Files" | "Notes" | "Activity">("Orders");

  function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void onUploadPhoto(file);
  }

  const orders = customer.orders;
  const lastOrderDate = orders[0]?.paymentDate ?? null;
  const customerSinceDate = orders.length > 0 ? orders[orders.length - 1].paymentDate : null;
  const allFiles = orders.flatMap(order => order.files).slice().sort((a, b) => (b.uploadedAt?.getTime() ?? 0) - (a.uploadedAt?.getTime() ?? 0));
  const allActivity = orders
    .flatMap(order => order.activity.map(entry => ({ order, entry })))
    .sort((a, b) => (b.entry.createdAt?.getTime() ?? 0) - (a.entry.createdAt?.getTime() ?? 0));
  const orderNotes = orders.filter(order => order.notes.trim().length > 0);

  return (
    <div className="customer-detail-scroll">
      <section className="customer-profile-header">
        {canManageCustomers ? (
          <button
            type="button"
            className="customer-avatar-upload"
            onClick={() => photoInputRef.current?.click()}
            disabled={uploadingPhoto}
            aria-label={t("Change customer photo")}
            title={t("Change customer photo")}
          >
            <CustomerAvatar customer={customer} size="large" />
            <span className="customer-avatar-upload-overlay" aria-hidden="true">
              {uploadingPhoto ? "…" : "📷"}
            </span>
            <input
              ref={photoInputRef}
              type="file"
              accept={CUSTOMER_PHOTO_ACCEPT}
              className="visually-hidden-input"
              onChange={handlePhotoChange}
              disabled={uploadingPhoto}
            />
          </button>
        ) : (
          <CustomerAvatar customer={customer} size="large" />
        )}
        <div>
          <p className="orders-kicker">{t("Customer Profile")}</p>
          <CustomerInlineTitle
            value={customerDisplayName(customer.name)}
            disabled={!canManageCustomers}
            saving={savingInlineField === "Customer name"}
            onSave={value => onSaveDetails({ name: value }, "Customer name")}
          />
          <p>
            {canSeeFinance ? `${money(customer.totalValue, hideNumbers, moneySettings)} ${t("total value")} - ` : ""}
            {customer.orderCount} {t("orders")}
          </p>
        </div>
      </section>

      <div className="customer-stats-row">
        <CustomerStatCard emoji="🛍️" tint="#34c759" label={t("Total Spent")} value={canSeeFinance ? money(customer.totalValue, hideNumbers, moneySettings) : "—"} valueClass="positive" />
        <CustomerStatCard emoji="📦" tint="#2f6df6" label={t("Total Orders")} value={String(customer.orderCount)} />
        <CustomerStatCard emoji="📅" tint="#af52de" label={t("Last Order")} value={lastOrderDate ? formatDate(lastOrderDate) : "—"} />
        <CustomerStatCard emoji="🕐" tint="#ff9500" label={t("Customer Since")} value={customerSinceDate ? formatMonthYear(customerSinceDate) : "—"} />
      </div>

      <div className="customer-detail-grid">
        <div className="customer-card-stack">
          <section className="card app-card customer-detail-card">
            <CardTitle icon="customer" eyebrow={t("Contact Info")} title={t("Customer details")} />
            <div className="app-card-panel">
              <CustomerDetailsForm
                customer={customer}
                disabled={!canManageCustomers}
                saving={savingInlineField === "Customer details"}
                onSave={patch => onSaveDetails(patch, "Customer details")}
              />
              <InfoRow label="Last Contact" value={formatDate(customer.lastContactDate)} />
            </div>
          </section>
        </div>

        <div className="customer-card-stack">
          <section className="card app-card customer-detail-card">
            <div className="customer-card-head">
              <CardTitle icon="orders" eyebrow={t("Order History")} title={`${customer.orderCount} ${t("orders")}`} />
              {orders.length > 0 ? <Link href="/orders" className="customer-view-all">{t("View All Orders")}</Link> : null}
            </div>
            <div className="customer-order-list">
              {orders.length === 0 ? (
                <p className="muted-copy">{t("No orders found for this customer.")}</p>
              ) : orders.map(order => (
                <CustomerOrderRow key={order.id} order={order} canSeeFinance={canSeeFinance} moneySettings={moneySettings} t={t} />
              ))}
            </div>
          </section>

          <section className="card app-card customer-detail-card">
            <CardTitle icon="notes" eyebrow={t("Customer Notes")} title={t("Notes")} />
            <CustomerInlineNotes
              value={customer.notes}
              disabled={!canManageCustomers}
              saving={savingInlineField === "Notes"}
              onSave={value => onSaveDetails({ notes: value }, "Notes")}
            />
          </section>
        </div>
      </div>

      <section className="card app-card customer-detail-card customer-tabs-card">
        <div className="customer-tabs-bar">
          {(["Orders", "Files", "Notes", "Activity"] as const).map(tab => (
            <button
              key={tab}
              type="button"
              className={`customer-tab${activeTab === tab ? " is-active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {t(tab)}
            </button>
          ))}
        </div>
        <div className="customer-tabs-content">
          {activeTab === "Orders" ? (
            orders.length === 0 ? <CustomerTabEmpty text={t("No orders yet.")} /> : (
              <table className="customer-orders-table">
                <thead>
                  <tr>
                    <th>{t("Order")}</th>
                    <th>{t("Project")}</th>
                    <th>{t("Date")}</th>
                    <th>{t("Status")}</th>
                    <th className="ta-right">{t("Amount")}</th>
                    <th aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {orders.map(order => (
                    <tr key={order.id} onClick={() => { window.location.href = `/orders?selectedOrderId=${encodeURIComponent(order.id)}`; }}>
                      <td className="customer-order-link">{order.invoiceNumber || "—"}</td>
                      <td>{order.designName.trim() || t("Untitled design")}</td>
                      <td>{formatDate(order.paymentDate)}</td>
                      <td><CustomerOrderStatusBadge order={order} /></td>
                      <td className="ta-right">{canSeeFinance ? money(order.paidAmount + order.remainingAmount, hideNumbers, moneySettings) : "—"}</td>
                      <td className="ta-right customer-table-chevron">›</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : activeTab === "Files" ? (
            allFiles.length === 0 ? <CustomerTabEmpty text={t("No files yet.")} /> : (
              <div className="customer-files-list">
                {allFiles.map(file => (
                  <a key={file.id + file.downloadUrl} href={file.downloadUrl || undefined} target="_blank" rel="noreferrer" className="customer-file-row">
                    <span className="customer-file-icon">📄</span>
                    <span className="customer-file-main">
                      <strong>{file.fileName}</strong>
                      <small>{formatFileSize(file.fileSize)} • {formatDate(file.uploadedAt)}</small>
                    </span>
                    <span className="customer-file-dl">⤓</span>
                  </a>
                ))}
              </div>
            )
          ) : activeTab === "Notes" ? (
            orderNotes.length === 0 ? <CustomerTabEmpty text={t("No order notes yet.")} /> : (
              <div className="customer-order-notes-list">
                {orderNotes.map(order => (
                  <Link key={order.id} href={`/orders?selectedOrderId=${encodeURIComponent(order.id)}`} className="customer-order-note-card">
                    <span className="customer-order-note-head">
                      <strong>{order.invoiceNumber || order.designName.trim() || t("Order")}</strong>
                      <small>{formatDate(order.paymentDate)}</small>
                    </span>
                    <span className="customer-order-note-text">{order.notes}</span>
                  </Link>
                ))}
              </div>
            )
          ) : (
            allActivity.length === 0 ? <CustomerTabEmpty text={t("No activity yet.")} /> : (
              <div className="customer-activity-list">
                {allActivity.map(({ order, entry }) => (
                  <div key={order.id + entry.id} className="customer-activity-row">
                    <span className="customer-activity-dot" aria-hidden="true" />
                    <span className="customer-activity-main">
                      <strong>{t(entry.title)}</strong>
                      {entry.oldValue || entry.newValue ? <small className="customer-activity-change">{entry.oldValue || "—"} → {entry.newValue || "—"}</small> : null}
                      <small>{(order.invoiceNumber || order.designName)} • {formatDate(entry.createdAt)}</small>
                    </span>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </section>
    </div>
  );
}

function CustomerStatCard({ emoji, tint, label, value, valueClass }: { emoji: string; tint: string; label: string; value: string; valueClass?: string }) {
  return (
    <div className="customer-stat-card">
      <span className="customer-stat-chip" style={{ backgroundColor: `${tint}26`, color: tint }}>{emoji}</span>
      <span className="customer-stat-label">{label}</span>
      <span className={`customer-stat-value${valueClass ? ` ${valueClass}` : ""}`}>{value}</span>
    </div>
  );
}

function CustomerOrderStatusBadge({ order }: { order: CustomerOrderSummary }) {
  const status = order.status.trim();
  const lowered = status.toLowerCase();
  const done = order.isDelivered || lowered.includes("complet") || lowered.includes("deliver");
  const tone = done ? "done" : order.isDispatched ? "dispatched" : "pending";
  const label = status || (order.isDelivered ? "Delivered" : "Pending");
  return <span className={`customer-status-badge is-${tone}`}>{label}</span>;
}

function CustomerTabEmpty({ text }: { text: string }) {
  return <p className="customer-tab-empty">{text}</p>;
}

function formatMonthYear(date: Date | null): string {
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(date);
  } catch {
    return "—";
  }
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
  return unit === 0 ? `${bytes} B` : `${size.toFixed(1)} ${units[unit]}`;
}

function CustomerAvatar({ customer, size }: { customer: CustomerDirectoryItem; size: "small" | "large" }) {
  return (
    <span className={size === "large" ? "customer-avatar large" : "customer-avatar"} aria-hidden="true">
      {customer.profileImageUrl ? <img src={customer.profileImageUrl} alt="" /> : initials(customer.name)}
    </span>
  );
}

function CustomerDetailsForm({
  customer,
  disabled,
  saving,
  onSave
}: {
  customer: CustomerDirectoryItem;
  disabled: boolean;
  saving: boolean;
  onSave: (patch: CustomerUpdatePatch) => Promise<void>;
}) {
  const [draft, setDraft] = useState<CustomerFormInput>(() => formFromCustomer(customer));

  useEffect(() => {
    setDraft(formFromCustomer(customer));
  }, [customer]);

  const saved = formFromCustomer(customer);
  const normalizedValue = (value: string) => value.trim();
  const isDirty = (Object.keys(saved) as Array<keyof CustomerFormInput>).some(key => normalizedValue(draft[key] || "") !== normalizedValue(saved[key] || ""));

  function updateField(field: keyof CustomerFormInput, value: string) {
    setDraft(current => ({
      ...current,
      [field]: value,
      ...(field === "streetAddress" || field === "city" || field === "postalCode" || field === "country" ? { address: "" } : {})
    }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (disabled || saving || !isDirty) return;
    await onSave({ ...cleanCustomerForm(draft), address: "" });
  }

  const fields: Array<{ label: string; field: keyof CustomerFormInput; type?: string }> = [
    { label: "Email", field: "email", type: "email" },
    { label: "WhatsApp", field: "phone" },
    { label: "Instagram", field: "instagram" },
    { label: "Street", field: "streetAddress" },
    { label: "City", field: "city" },
    { label: "Postal Code", field: "postalCode" },
    { label: "Country", field: "country" },
    { label: "Shipping Street", field: "shippingStreetAddress" },
    { label: "Shipping City", field: "shippingCity" },
    { label: "Shipping Postcode", field: "shippingPostalCode" },
    { label: "Shipping Country", field: "shippingCountry" },
    { label: "Shipping Phone", field: "shippingPhone" }
  ];

  return (
    <form className="customer-detail-form" onSubmit={submit}>
      {fields.map(item => (
        <label className="customer-detail-input-row" key={item.field}>
          <span>{item.label}</span>
          <input
            type={item.type || "text"}
            value={draft[item.field] || ""}
            disabled={disabled || saving}
            onChange={event => updateField(item.field, event.target.value)}
            placeholder="-"
          />
        </label>
      ))}
      {disabled ? null : (
        <div className="customer-detail-save-row">
          <button className="button" type="submit" disabled={saving || !isDirty}>
            {saving ? "Saving..." : "Save Customer Details"}
          </button>
          {isDirty ? (
            <button className="button secondary" type="button" disabled={saving} onClick={() => setDraft(saved)}>
              Reset
            </button>
          ) : null}
        </div>
      )}
    </form>
  );
}

function CustomerInlineTitle({
  value,
  disabled,
  saving,
  onSave
}: {
  value: string;
  disabled: boolean;
  saving: boolean;
  onSave: (value: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [editing, value]);

  async function submit() {
    const nextValue = customerDisplayName(draft);
    if (nextValue === value) {
      setEditing(false);
      setDraft(value);
      return;
    }
    await onSave(nextValue);
    setEditing(false);
  }

  if (editing) {
    return (
      <form className="customer-inline-title-form" onSubmit={event => {
        event.preventDefault();
        void submit();
      }}>
        <input
          autoFocus
          value={draft}
          disabled={saving}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Escape") {
              setEditing(false);
              setDraft(value);
            }
          }}
        />
        <button className="button" type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
      </form>
    );
  }

  if (disabled) return <h1>{value}</h1>;

  return (
    <button className="customer-inline-title-button" type="button" onClick={() => setEditing(true)}>
      {value}
    </button>
  );
}

function CustomerInlineValueRow({
  label,
  field,
  value,
  disabled,
  saving,
  onSave
}: {
  label: string;
  field: keyof CustomerFormInput;
  value: string;
  disabled: boolean;
  saving: boolean;
  onSave: (patch: CustomerUpdatePatch, fieldLabel: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [editing, value]);

  async function submit() {
    const nextValue = draft.trim();
    if (nextValue === value) {
      setEditing(false);
      return;
    }
    await onSave({ [field]: nextValue } as CustomerUpdatePatch, label);
    setEditing(false);
  }

  return (
    <div className="app-value-row">
      <span>{label}</span>
      {editing ? (
        <form className="customer-inline-form" onSubmit={event => {
          event.preventDefault();
          void submit();
        }}>
          <input
            autoFocus
            value={draft}
            disabled={saving}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Escape") {
                setEditing(false);
                setDraft(value);
              }
            }}
          />
          <span className="customer-inline-actions">
            <button className="button" type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
            <button className="button secondary" type="button" disabled={saving} onClick={() => {
              setEditing(false);
              setDraft(value);
            }}>
              Cancel
            </button>
          </span>
        </form>
      ) : disabled ? (
        <div className={value ? "app-value-pill" : "app-value-pill is-empty"}>{value || "-"}</div>
      ) : (
        <button className={value ? "app-value-pill customer-inline-button" : "app-value-pill customer-inline-button is-empty"} type="button" onClick={() => setEditing(true)}>
          {value || "-"}
        </button>
      )}
    </div>
  );
}

function CustomerInlineNotes({
  value,
  disabled,
  saving,
  onSave
}: {
  value: string;
  disabled: boolean;
  saving: boolean;
  onSave: (value: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [editing, value]);

  async function submit() {
    const nextValue = draft.trim();
    if (nextValue === value) {
      setEditing(false);
      return;
    }
    await onSave(nextValue);
    setEditing(false);
  }

  if (editing) {
    return (
      <form className="customer-inline-notes-form" onSubmit={event => {
        event.preventDefault();
        void submit();
      }}>
        <textarea
          autoFocus
          value={draft}
          disabled={saving}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Escape") {
              setEditing(false);
              setDraft(value);
            }
          }}
        />
        <span className="customer-inline-actions">
          <button className="button" type="submit" disabled={saving}>{saving ? "Saving..." : "Save Notes"}</button>
          <button className="button secondary" type="button" disabled={saving} onClick={() => {
            setEditing(false);
            setDraft(value);
          }}>
            Cancel
          </button>
        </span>
      </form>
    );
  }

  if (disabled) {
    return <div className="customer-notes-box">{value ? value : "No customer notes yet."}</div>;
  }

  return (
    <button className="customer-notes-box customer-notes-button" type="button" onClick={() => setEditing(true)}>
      {value ? value : "No customer notes yet."}
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="app-value-row">
      <span>{label}</span>
      <div className={value ? "app-value-pill" : "app-value-pill is-empty"}>{value || "-"}</div>
    </div>
  );
}

function CustomerOrderRow({ order, canSeeFinance, moneySettings, t }: { order: CustomerOrderSummary; canSeeFinance: boolean; moneySettings: StudioMoneySettings; t: (text: string) => string }) {
  const { hideNumbers } = usePricePrivacy();
  const designName = order.designName.trim() || t("Untitled design");
  return (
    <Link href={`/orders?selectedOrderId=${encodeURIComponent(order.id)}`} className="customer-order-row">
      <span className="customer-order-thumb">
        {order.previewImageUrl ? <img src={order.previewImageUrl} alt="" /> : <span className="image-placeholder-icon" aria-hidden="true"><CardIconGlyph icon="photo" /></span>}
      </span>
      <span className="customer-order-content">
        <span className="customer-order-main-line">
          <span>
            <strong title={designName}>{designName}</strong>
            {order.invoiceNumber ? <small className="customer-order-ref">{t("Order")} #{order.invoiceNumber}</small> : null}
            <small>{formatDate(order.paymentDate)}</small>
          </span>
          <span className="customer-order-meta">
            {canSeeFinance ? <span className="studio-pill">{money(order.paidAmount + order.remainingAmount, hideNumbers, moneySettings)}</span> : null}
            <CustomerOrderStatusBadge order={order} />
          </span>
        </span>
      </span>
    </Link>
  );
}

function CustomerFormModal({
  mode,
  form,
  saving,
  error,
  onChange,
  onCancel,
  onSubmit
}: {
  mode: Exclude<FormMode, null>;
  form: CustomerFormInput;
  saving: boolean;
  error: string;
  onChange: (form: CustomerFormInput) => void;
  onCancel: () => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  const updateField = (field: keyof CustomerFormInput, value: string) => onChange({
    ...form,
    [field]: value,
    ...(field === "streetAddress" || field === "city" || field === "postalCode" || field === "country" ? { address: "" } : {})
  });

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={mode === "create" ? "Add customer" : "Edit customer"}>
      <section className="add-order-modal customer-form-modal">
        <div className="add-order-header">
          <div>
            <p className="orders-kicker">{mode === "create" ? "New Customer" : "Edit Customer"}</p>
            <h2>{mode === "create" ? "Add customer" : customerDisplayName(form.name)}</h2>
            <p>These fields match the NivaDesk app customer profile.</p>
          </div>
          <button className="button secondary" type="button" disabled={saving} onClick={onCancel}>Close</button>
        </div>

        <form className="add-order-form" onSubmit={onSubmit}>
          <label>
            Customer name
            <input className="input" value={form.name} onChange={event => updateField("name", event.target.value)} disabled={saving} />
          </label>

          <div className="add-order-two-col">
            <label>
              Email
              <input className="input" type="email" value={form.email} onChange={event => updateField("email", event.target.value)} disabled={saving} />
            </label>
            <label>
              WhatsApp / Phone
              <input className="input" value={form.phone} onChange={event => updateField("phone", event.target.value)} disabled={saving} />
            </label>
          </div>

          <label>
            Instagram
            <input className="input" value={form.instagram} onChange={event => updateField("instagram", event.target.value)} disabled={saving} />
          </label>

          <label>
            Address
            <input
              className="input"
              value={form.streetAddress || form.address}
              onChange={event => onChange({ ...form, streetAddress: event.target.value, address: "" })}
              disabled={saving}
            />
          </label>

          <div className="add-order-two-col">
            <label>
              City
              <input className="input" value={form.city} onChange={event => updateField("city", event.target.value)} disabled={saving} />
            </label>
            <label>
              Postal Code
              <input className="input" value={form.postalCode} onChange={event => updateField("postalCode", event.target.value)} disabled={saving} />
            </label>
          </div>

          <label>
            Country
            <input className="input" value={form.country} onChange={event => updateField("country", event.target.value)} disabled={saving} />
          </label>

          <label>
            Notes
            <textarea className="input add-order-notes" value={form.notes} onChange={event => updateField("notes", event.target.value)} disabled={saving} />
          </label>

          {error ? <p className="layout-error" style={{ margin: 0 }}>{error}</p> : null}

          <div className="add-order-actions">
            <button className="button secondary" type="button" disabled={saving} onClick={onCancel}>Cancel</button>
            <button className="button" type="submit" disabled={saving}>{saving ? "Saving..." : "Save Customer"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
