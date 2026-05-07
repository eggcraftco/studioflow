"use client";

import { useEffect, useMemo, useState } from "react";
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
  type CustomerFormInput
} from "@/lib/studioflow/customers";

type SortMode = "recent" | "orders";
type FormMode = "create" | "edit" | null;
type CustomerUpdatePatch = Partial<CustomerFormInput>;

const EMPTY_CUSTOMER_FORM: CustomerFormInput = {
  name: "",
  email: "",
  phone: "",
  instagram: "",
  address: "",
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
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "C";
}

function isWorkflowOnly(role: string) {
  const normalized = role.toLowerCase().replace(/[^a-z]/g, "");
  return normalized === "workflow" || normalized === "workflowonly";
}

function formFromCustomer(customer: CustomerDirectoryItem): CustomerFormInput {
  return {
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    instagram: customer.instagram,
    address: customer.address,
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
          customer.address
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

  const canSeeFinance = Boolean(workspace && !isWorkflowOnly(workspace.role));
  const canManageCustomers = Boolean(workspace && canManageCustomersForRole(workspace.role));

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

  async function handleSaveCustomer(event: React.FormEvent) {
    event.preventDefault();
    if (!workspace || !formMode) return;
    if (!form.name.trim()) {
      setActionError("Customer name is required.");
      return;
    }

    setSavingCustomer(true);
    setActionStatus(formMode === "create" ? "Creating customer..." : "Saving customer...");
    setActionError("");
    try {
      if (formMode === "create") {
        const result = await createCustomerFromWeb(workspace, {
          ...form,
          name: form.name.trim()
        });
        await refreshCustomers(result.customerId || undefined);
        setActionStatus("Customer created.");
      } else if (selectedCustomer) {
        await updateCustomerFromWeb(workspace, selectedCustomer.id, {
          ...form,
          name: form.name.trim()
        });
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

    const confirmed = window.confirm(`Delete "${customer.name}" from Customers? Related orders will stay in Orders.`);
    if (!confirmed) return;

    setSavingCustomer(true);
    setActionStatus("Deleting customer...");
    setActionError("");
    try {
      await deleteCustomerFromWeb(workspace, customer.id);
      const nextCustomerId = customers.find(item => item.id !== customer.id)?.id || "";
      await refreshCustomers(nextCustomerId);
      setActionStatus("Customer deleted. Related orders were not removed.");
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
    nextForm.name = nextForm.name.trim();
    if (!nextForm.name) {
      setActionError("Customer name is required.");
      return;
    }

    setSavingInlineField(fieldLabel);
    setActionStatus(`Saving ${fieldLabel}...`);
    setActionError("");
    try {
      await updateCustomerFromWeb(workspace, customer.id, nextForm);
      setCustomers(currentCustomers => currentCustomers.map(item => item.id === customer.id ? {
        ...item,
        ...patch,
        name: nextForm.name
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
              <p className="orders-kicker">Customers</p>
              <h1>{customers.length} customers</h1>
              <p>{workspace ? `${workspace.name} - ${workspace.roleLabel}` : "Loading workspace..."}</p>
            </div>
            <div className="customers-toolbar-actions">
              {workspace ? <span className="studio-pill">{workspace.billingPlanName}</span> : null}
              <button
                className="sidebar-toggle-button"
                type="button"
                title={sidebar.collapsed ? "Expand customer list" : "Collapse customer list"}
                aria-label={sidebar.collapsed ? "Expand customer list" : "Collapse customer list"}
                onClick={() => sidebar.setCollapsed(value => !value)}
              >
                {sidebar.collapsed ? ">" : "<"}
              </button>
              <button
                className="button customer-action-button"
                type="button"
                disabled={!canManageCustomers}
                title={canManageCustomers ? "Add customer" : "Your role cannot create customers"}
                onClick={openCreateForm}
              >
                + Customer
              </button>
            </div>
          </div>

          <div className="customers-filter-bar">
            <label className="customers-search">
              <span>Search</span>
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Name, email, phone..." />
            </label>
            <div className="segmented-control customers-segmented">
              <button type="button" className={sortMode === "recent" ? "active" : ""} onClick={() => setSortMode("recent")}>Recent</button>
              <button type="button" className={sortMode === "orders" ? "active" : ""} onClick={() => setSortMode("orders")}>Most Orders</button>
            </div>
          </div>

          {error ? (
            <div className="mini-panel compact-mini-panel">
              <CardTitle icon="lock" eyebrow="Customer error" title="Could not load customers" />
              <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>
            </div>
          ) : null}

          {filteredCustomers.length === 0 && !loadingCustomers ? (
            <p className="muted-copy" style={{ padding: "0 14px 14px" }}>No customers match this search yet.</p>
          ) : null}

          <div className="customers-list">
            {filteredCustomers.map(customer => (
              <CustomerListCard
                key={customer.id}
                customer={customer}
                selected={customer.id === selectedCustomer?.id}
                canSeeFinance={canSeeFinance}
                moneySettings={moneySettings}
                onSelect={() => setSelectedCustomerId(customer.id)}
              />
            ))}
          </div>
        </aside>

        <button
          className="workspace-sidebar-resizer"
          type="button"
          aria-label="Resize customer list"
          title="Resize customer list"
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
              onEdit={() => openEditForm(selectedCustomer)}
              onDelete={() => handleDeleteCustomer(selectedCustomer)}
              onInlineUpdate={(patch, fieldLabel) => handleInlineCustomerUpdate(selectedCustomer, patch, fieldLabel)}
            />
          ) : (
            <section className="orders-empty-detail">
              <CardTitle icon="customer" eyebrow="Select customer" title="Choose a customer from the list" />
              <p className="muted-copy">Customer details and related orders will appear here.</p>
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
    </AppShell>
  );
}

function CustomerListCard({
  customer,
  selected,
  canSeeFinance,
  moneySettings,
  onSelect
}: {
  customer: CustomerDirectoryItem;
  selected: boolean;
  canSeeFinance: boolean;
  moneySettings: StudioMoneySettings;
  onSelect: () => void;
}) {
  const { hideNumbers } = usePricePrivacy();
  return (
    <button type="button" className={selected ? "customer-list-card selected" : "customer-list-card"} onClick={onSelect}>
      <CustomerAvatar customer={customer} size="small" />
      <span className="customer-list-body">
        <strong>{customer.name}</strong>
        <small>{customer.email || customer.phone || customer.instagram || "No contact details"}</small>
        <span className="customer-list-meta">
          <span className="studio-pill">{customer.orderCount} orders</span>
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
  onEdit,
  onDelete,
  onInlineUpdate
}: {
  customer: CustomerDirectoryItem;
  canSeeFinance: boolean;
  canManageCustomers: boolean;
  moneySettings: StudioMoneySettings;
  savingInlineField: string;
  onEdit: () => void;
  onDelete: () => void;
  onInlineUpdate: (patch: CustomerUpdatePatch, fieldLabel: string) => Promise<void>;
}) {
  const { hideNumbers } = usePricePrivacy();
  return (
    <div className="customer-detail-scroll">
      <section className="customer-profile-header">
        <CustomerAvatar customer={customer} size="large" />
        <div>
          <p className="orders-kicker">Customer Profile</p>
          <CustomerInlineTitle
            value={customer.name}
            disabled={!canManageCustomers}
            saving={savingInlineField === "Customer name"}
            onSave={value => onInlineUpdate({ name: value }, "Customer name")}
          />
          <p>
            {canSeeFinance ? `${money(customer.totalValue, hideNumbers, moneySettings)} total value - ` : ""}
            {customer.orderCount} orders
          </p>
        </div>
        <div className="customer-profile-actions">
          <button
            className="button secondary customer-edit-button"
            type="button"
            disabled={!canManageCustomers}
            title={canManageCustomers ? "Edit customer" : "Your role cannot edit customers"}
            onClick={onEdit}
          >
            Edit
          </button>
          <button
            className="button secondary customer-danger-button"
            type="button"
            disabled={!canManageCustomers}
            title={canManageCustomers ? "Delete customer" : "Your role cannot delete customers"}
            onClick={onDelete}
          >
            Delete
          </button>
        </div>
      </section>

      <div className="customer-detail-grid">
        <div className="customer-card-stack">
          <section className="card app-card customer-detail-card">
            <CardTitle icon="customer" eyebrow="Contact Info" title="Customer details" />
            <div className="app-card-panel">
              <CustomerInlineValueRow
                label="Email"
                field="email"
                value={customer.email}
                disabled={!canManageCustomers}
                saving={savingInlineField === "Email"}
                onSave={onInlineUpdate}
              />
              <CustomerInlineValueRow
                label="WhatsApp"
                field="phone"
                value={customer.phone}
                disabled={!canManageCustomers}
                saving={savingInlineField === "WhatsApp"}
                onSave={onInlineUpdate}
              />
              <CustomerInlineValueRow
                label="Instagram"
                field="instagram"
                value={customer.instagram}
                disabled={!canManageCustomers}
                saving={savingInlineField === "Instagram"}
                onSave={onInlineUpdate}
              />
              <CustomerInlineValueRow
                label="Address"
                field="address"
                value={customer.address}
                disabled={!canManageCustomers}
                saving={savingInlineField === "Address"}
                onSave={onInlineUpdate}
              />
              <InfoRow label="Last Contact" value={formatDate(customer.lastContactDate)} />
            </div>
          </section>

          <section className="card app-card customer-detail-card">
            <CardTitle icon="notes" eyebrow="Customer Notes" title="Notes" />
            <CustomerInlineNotes
              value={customer.notes}
              disabled={!canManageCustomers}
              saving={savingInlineField === "Notes"}
              onSave={value => onInlineUpdate({ notes: value }, "Notes")}
            />
          </section>
        </div>

        <section className="card app-card customer-detail-card">
          <CardTitle icon="orders" eyebrow="Order History" title={`${customer.orderCount} orders`} />
          <div className="customer-order-list">
            {customer.orders.length === 0 ? (
              <p className="muted-copy">No orders found for this customer.</p>
            ) : customer.orders.map(order => (
              <CustomerOrderRow key={order.id} order={order} canSeeFinance={canSeeFinance} moneySettings={moneySettings} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function CustomerAvatar({ customer, size }: { customer: CustomerDirectoryItem; size: "small" | "large" }) {
  return (
    <span className={size === "large" ? "customer-avatar large" : "customer-avatar"} aria-hidden="true">
      {customer.profileImageUrl ? <img src={customer.profileImageUrl} alt="" /> : initials(customer.name)}
    </span>
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
    const nextValue = draft.trim();
    if (!nextValue || nextValue === value) {
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
        <button className="button" type="submit" disabled={saving || !draft.trim()}>
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

function CustomerOrderRow({ order, canSeeFinance, moneySettings }: { order: CustomerOrderSummary; canSeeFinance: boolean; moneySettings: StudioMoneySettings }) {
  const { hideNumbers } = usePricePrivacy();
  return (
    <Link href={`/orders?selectedOrderId=${encodeURIComponent(order.id)}`} className="customer-order-row">
      <span className="customer-order-thumb">
        {order.previewImageUrl ? <img src={order.previewImageUrl} alt="" /> : <span className="image-placeholder-icon" aria-hidden="true"><CardIconGlyph icon="photo" /></span>}
      </span>
      <span className="customer-order-content">
        <span className="customer-order-main-line">
          <span>
            <strong>{order.designName}</strong>
            <small>{formatDate(order.paymentDate)} - due {formatDate(order.dueDate)}</small>
          </span>
          <span className="customer-order-meta">
            <span className="status-pill">{order.status}</span>
            {canSeeFinance ? <span className="studio-pill">{money(order.paidAmount + order.remainingAmount, hideNumbers, moneySettings)}</span> : null}
          </span>
        </span>
        {order.notes ? <span className="customer-order-note">{order.notes}</span> : null}
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
  const updateField = (field: keyof CustomerFormInput, value: string) => onChange({ ...form, [field]: value });

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={mode === "create" ? "Add customer" : "Edit customer"}>
      <section className="add-order-modal customer-form-modal">
        <div className="add-order-header">
          <div>
            <p className="orders-kicker">{mode === "create" ? "New Customer" : "Edit Customer"}</p>
            <h2>{mode === "create" ? "Add customer" : form.name || "Customer details"}</h2>
            <p>These fields match the StudioFlow app customer profile.</p>
          </div>
          <button className="button secondary" type="button" disabled={saving} onClick={onCancel}>Close</button>
        </div>

        <form className="add-order-form" onSubmit={onSubmit}>
          <label>
            Customer name
            <input className="input" value={form.name} onChange={event => updateField("name", event.target.value)} disabled={saving} required />
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
            <input className="input" value={form.address} onChange={event => updateField("address", event.target.value)} disabled={saving} />
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
