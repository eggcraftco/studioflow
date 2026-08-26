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
  anonymizeCustomerFromWeb,
  deleteCustomerFromWeb,
  mergeCustomersFromWeb,
  updateCustomerFromWeb,
  uploadCustomerPhoto,
  CUSTOMER_PHOTO_ACCEPT,
  type CustomerFormInput
} from "@/lib/studioflow/customers";
import { studioT } from "@/lib/studioflow/language";
import { listenToKeepNotes, type StudioKeepNote } from "@/lib/studioflow/notes";
import { resyncIntegrationCustomerFromWeb } from "@/lib/studioflow/customers";

type SortMode = "recent" | "orders" | "lastOrder" | "highestValue" | "outstanding" | "alphabetical";
type FormMode = "create" | "edit" | null;
type CustomerUpdatePatch = Partial<CustomerFormInput>;

const EMPTY_CUSTOMER_FORM: CustomerFormInput = {
  name: "",
  email: "",
  phone: "",
  primaryPhone: "",
  whatsappNumber: "",
  company: "",
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

function formatDateTime(date: Date | null) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

// "1 order" vs "2 orders". Languages that don't inflect after a numeral
// (Turkish among them) simply translate both keys to the same word.
function countLabel(count: number, singularKey: string, pluralKey: string, t: (text: string) => string) {
  return `${count} ${t(count === 1 ? singularKey : pluralKey)}`;
}

// Where a customer record came from. Only external origins get a badge —
// a manual record needs no explanation.
const CUSTOMER_SOURCE_LABEL: Record<string, string> = {
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  inbound: "API"
};

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
    primaryPhone: input.primaryPhone.trim(),
    whatsappNumber: input.whatsappNumber.trim(),
    company: input.company.trim(),
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
  if (Array.isArray(input.tags)) {
    cleaned.tags = Array.from(new Set(input.tags.map(tag => tag.trim()).filter(Boolean))).slice(0, 20);
  }
  // Contact preferences ride along only when the patch carries them — the
  // server treats missing keys as "leave unchanged".
  if (typeof input.preferredChannel === "string") cleaned.preferredChannel = input.preferredChannel;
  if (typeof input.doNotContact === "boolean") cleaned.doNotContact = input.doNotContact;
  if (typeof input.marketingOptIn === "string") cleaned.marketingOptIn = input.marketingOptIn;
  if ("nextFollowUpDateMillis" in input) cleaned.nextFollowUpDateMillis = input.nextFollowUpDateMillis ?? null;
  return cleaned;
}

function formFromCustomer(customer: CustomerDirectoryItem): CustomerFormInput {
  return {
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    primaryPhone: customer.primaryPhone,
    whatsappNumber: customer.whatsappNumber,
    company: customer.company,
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
    notes: customer.notes,
    tags: customer.tags
  };
}

function normalizedCustomerLookup(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

const COMMON_COUNTRIES = [
  "United Kingdom", "Ireland", "United States", "Canada", "Australia", "New Zealand",
  "Germany", "France", "Italy", "Spain", "Portugal", "Netherlands", "Belgium",
  "Switzerland", "Austria", "Denmark", "Sweden", "Norway", "Finland", "Poland",
  "Türkiye", "Greece", "United Arab Emirates", "Saudi Arabia", "Qatar", "Japan",
  "China", "Hong Kong", "Singapore", "India", "South Africa", "Brazil", "Mexico"
];

function CountryDatalist() {
  return (
    <datalist id="studio-country-options">
      {COMMON_COUNTRIES.map(country => <option key={country} value={country} />)}
    </datalist>
  );
}

export default function CustomersPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  // The user's own Notes-app notes: a note typed "Customer" (or linked to one
  // of this customer's orders) surfaces here too — one record, many contexts.
  const [keepNotes, setKeepNotes] = useState<StudioKeepNote[]>([]);
  const [moneySettings, setMoneySettings] = useState<WorkspaceSettingsOverview | null>(null);
  const [customers, setCustomers] = useState<CustomerDirectoryItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [search, setSearch] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [error, setError] = useState("");
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [form, setForm] = useState<CustomerFormInput>(EMPTY_CUSTOMER_FORM);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergingCustomers, setMergingCustomers] = useState(false);
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
    const bySegment = segmentFilter ? customers.filter(customer => customer.tags.includes(segmentFilter)) : customers;
    const filtered = term
      ? bySegment.filter(customer => [
          customer.name,
          customer.email,
          customer.phone,
          customer.primaryPhone,
          customer.whatsappNumber,
          customer.company,
          customer.instagram,
          customer.address,
          customer.streetAddress,
          customer.city,
          customer.postalCode,
          customer.country
        ].some(value => value.toLowerCase().includes(term))
          // The report's ask: find a customer by what they ordered.
          || customer.tags.some(tag => tag.toLowerCase().includes(term))
          || customer.orders.some(order =>
            order.invoiceNumber.toLowerCase().includes(term)
            || order.designName.toLowerCase().includes(term)))
      : bySegment;

    return [...filtered].sort((lhs, rhs) => {
      if (sortMode === "orders" && lhs.orderCount !== rhs.orderCount) return rhs.orderCount - lhs.orderCount;
      if (sortMode === "highestValue" && lhs.totalValue !== rhs.totalValue) return rhs.totalValue - lhs.totalValue;
      if (sortMode === "outstanding") {
        if (lhs.totalOutstanding !== rhs.totalOutstanding) return rhs.totalOutstanding - lhs.totalOutstanding;
      }
      if (sortMode === "lastOrder") {
        const leftOrder = lhs.orders[0]?.paymentDate?.getTime() ?? 0;
        const rightOrder = rhs.orders[0]?.paymentDate?.getTime() ?? 0;
        if (leftOrder !== rightOrder) return rightOrder - leftOrder;
      }
      if (sortMode === "alphabetical") return lhs.name.localeCompare(rhs.name);
      const left = lhs.lastContactDate?.getTime() ?? 0;
      const right = rhs.lastContactDate?.getTime() ?? 0;
      if (left !== right) return right - left;
      return lhs.name.localeCompare(rhs.name);
    });
  }, [customers, search, sortMode, segmentFilter]);


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

  // The whole directory is client-side, so suspected twins cost nothing to
  // spot: another record sharing this customer's email or phone.
  useEffect(() => {
    if (!workspace || !user) return;
    return listenToKeepNotes(workspace.id, user.uid, setKeepNotes);
  }, [workspace, user]);

  const selectedDuplicate = useMemo(() => {
    if (!selectedCustomer) return null;
    const email = selectedCustomer.email.trim().toLowerCase();
    const phonesOf = (customer: CustomerDirectoryItem) => [customer.phone, customer.primaryPhone, customer.whatsappNumber]
      .map(value => value.replace(/[^0-9+]/g, ""))
      .filter(value => value.length >= 7);
    const ownPhones = phonesOf(selectedCustomer);
    for (const other of customers) {
      if (other.id === selectedCustomer.id) continue;
      if (email.length > 3 && other.email.trim().toLowerCase() === email) return { other, reason: "email" as const };
      const otherPhones = phonesOf(other);
      if (ownPhones.some(value => otherPhones.includes(value))) return { other, reason: "phone" as const };
    }
    return null;
  }, [customers, selectedCustomer]);

  // Notes-app records that belong to this customer: typed "Customer" with the
  // matching name, or linked to one of the customer's orders.
  const selectedLinkedNotes = useMemo(() => {
    const customer = customers.find(item => item.id === selectedCustomerId);
    if (!customer) return [] as StudioKeepNote[];
    const nameKey = normalizedCustomerLookup(customer.name);
    const orderIds = new Set(customer.orders.map(order => order.id));
    return keepNotes
      .filter(note => !note.isDeleted && !note.isArchived)
      .filter(note =>
        (note.linkedCustomerName && normalizedCustomerLookup(note.linkedCustomerName) === nameKey)
        || (note.linkedOrderId && orderIds.has(note.linkedOrderId)))
      .sort((a, b) => (b.updatedAtMillis ?? 0) - (a.updatedAtMillis ?? 0));
  }, [customers, selectedCustomerId, keepNotes]);

  const canSeeFinance = Boolean(workspace && workspaceAccessAllows(workspace.memberAccess, "financialInfo"));
  const canManageCustomers = Boolean(workspace && canManageCustomersForRole(workspace.role));
  const language = moneySettings?.selectedLanguage ?? "English";
  const t = (text: string) => studioT(text, language);

  // Segments: the union of workspace tags, with counts, for the filter row.
  const allSegments = useMemo(() => {
    const counts = new Map<string, number>();
    customers.forEach(customer => customer.tags.forEach(tag => counts.set(tag, (counts.get(tag) || 0) + 1)));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [customers]);

  // Which field actually matched the search — shown on the card so a hit on
  // an invoice number or address doesn't look like a random result.
  const searchMatchHints = useMemo(() => {
    const term = search.trim().toLowerCase();
    const map = new Map<string, string>();
    if (!term) return map;
    for (const customer of filteredCustomers) {
      if (customer.name.toLowerCase().includes(term)) continue;
      let hint = "";
      if (customer.email.toLowerCase().includes(term)) hint = `${studioT("Email", language)}: ${customer.email}`;
      else if (customer.phone.toLowerCase().includes(term) || customer.primaryPhone.toLowerCase().includes(term) || customer.whatsappNumber.toLowerCase().includes(term)) hint = `${studioT("Phone", language)}: ${customer.whatsappNumber || customer.primaryPhone || customer.phone}`;
      else if (customer.instagram.toLowerCase().includes(term)) hint = `Instagram: ${customer.instagram}`;
      else {
        const order = customer.orders.find(item => item.invoiceNumber.toLowerCase().includes(term));
        if (order) hint = `${studioT("Order", language)} ${order.invoiceNumber}`;
        else {
          const design = customer.orders.find(item => item.designName.toLowerCase().includes(term));
          if (design) hint = design.designName;
          else if ([customer.address, customer.streetAddress, customer.city, customer.postalCode, customer.country].some(value => value.toLowerCase().includes(term))) {
            hint = `${studioT("Address", language)}: ${[customer.streetAddress || customer.address, customer.city].filter(Boolean).join(", ")}`;
          }
        }
      }
      if (hint) map.set(customer.id, hint);
    }
    return map;
  }, [filteredCustomers, search, language]);

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

  async function handleMergeCustomers(
    primaryId: string,
    mergedId: string,
    keep: Partial<Record<"name" | "email" | "phone" | "primaryPhone" | "whatsappNumber", "primary" | "merged">>
  ) {
    if (!workspace || mergingCustomers) return;
    setMergingCustomers(true);
    setActionStatus(t("Merging customers..."));
    setActionError("");
    try {
      const result = await mergeCustomersFromWeb(workspace, primaryId, mergedId, keep);
      await refreshCustomers(primaryId);
      setMergeOpen(false);
      setActionStatus(`${t("Customers merged.")} ${t("Orders moved")}: ${Number(result.movedOrderCount) || 0}`);
    } catch (mergeError) {
      setActionStatus("");
      setActionError(mergeError instanceof Error ? mergeError.message : t("The customers could not be merged."));
    } finally {
      setMergingCustomers(false);
    }
  }

  // GDPR Art. 15/20: hand the customer's full record over as a file. The
  // directory is already client-side, so no server round-trip is needed.
  function exportCustomerData(customer: CustomerDirectoryItem) {
    const payload = {
      exportedAt: new Date().toISOString(),
      workspace: workspace?.name ?? "",
      profile: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        primaryPhone: customer.primaryPhone,
        whatsappNumber: customer.whatsappNumber,
        company: customer.company,
        instagram: customer.instagram,
        address: customer.address,
        streetAddress: customer.streetAddress,
        city: customer.city,
        postalCode: customer.postalCode,
        country: customer.country,
        shippingAddress: customer.shippingAddress,
        shippingStreetAddress: customer.shippingStreetAddress,
        shippingCity: customer.shippingCity,
        shippingPostalCode: customer.shippingPostalCode,
        shippingCountry: customer.shippingCountry,
        shippingPhone: customer.shippingPhone,
        notes: customer.notes,
        source: customer.source,
        lastContactDate: customer.lastContactDate?.toISOString() ?? null
      },
      totals: {
        orderCount: customer.orderCount,
        totalOrderValue: customer.totalValue,
        totalPaid: customer.totalPaid,
        totalOutstanding: customer.totalOutstanding
      },
      orders: customer.orders.map(order => ({
        invoiceNumber: order.invoiceNumber,
        designName: order.designName,
        status: order.status,
        orderDate: order.paymentDate?.toISOString() ?? null,
        dueDate: order.dueDate?.toISOString() ?? null,
        paidAmount: order.paidAmount,
        remainingAmount: order.remainingAmount + order.customRemainingTotal,
        notes: order.notes,
        files: order.files.map(file => file.fileName),
        activity: order.activity.map(entry => ({
          title: entry.title,
          oldValue: entry.oldValue,
          newValue: entry.newValue,
          at: entry.createdAt?.toISOString() ?? null
        }))
      }))
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `customer-${customerDisplayName(customer.name).replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setActionStatus(t("Customer data exported."));
  }

  async function handleAnonymizeCustomer(customer: CustomerDirectoryItem) {
    if (!workspace) return;
    const label = customerDisplayName(customer.name);
    const confirmed = window.confirm(
      `${t("Anonymize this customer permanently?")} ${label}. ${t("Personal details vanish from the profile and every order; financial records stay. This cannot be undone — export the data first if you still need it.")}`
    );
    if (!confirmed) return;
    setActionStatus(t("Anonymizing customer..."));
    setActionError("");
    try {
      await anonymizeCustomerFromWeb(workspace, customer.id);
      await refreshCustomers(customer.id);
      setActionStatus(t("Customer anonymized."));
    } catch (anonymizeError) {
      setActionStatus("");
      setActionError(anonymizeError instanceof Error ? anonymizeError.message : t("The customer could not be anonymized."));
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
        // The whole directory is already client-side; a same-email or
        // same-phone record is almost always the same person twice.
        const email = (cleanForm.email || "").trim().toLowerCase();
        const phone = (cleanForm.phone || "").replace(/[^0-9+]/g, "");
        const duplicate = customers.find(existing =>
          (email.length > 3 && existing.email.trim().toLowerCase() === email) ||
          (phone.length >= 7 && existing.phone.replace(/[^0-9+]/g, "") === phone)
        );
        if (duplicate) {
          const proceed = window.confirm(
            `${t("Possible duplicate customer")}: ${customerDisplayName(duplicate.name)} ${email && duplicate.email.trim().toLowerCase() === email ? `(${duplicate.email})` : `(${duplicate.phone})`}. ${t("Create anyway?")}`
          );
          if (!proceed) {
            setActionStatus("");
            return;
          }
        }
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

  async function handleResyncCustomer(customer: CustomerDirectoryItem) {
    if (!workspace) return;
    setSavingInlineField("Integration resync");
    setActionStatus(t("Resyncing from store data…"));
    setActionError("");
    try {
      const result = await resyncIntegrationCustomerFromWeb(workspace, customer.id);
      await refreshCustomers(customer.id);
      setActionStatus(`${t("Resynced from store data.")}${result && typeof result.applied === "number" ? ` (${result.applied})` : ""}`);
    } catch (resyncError) {
      setActionStatus("");
      setActionError(resyncError instanceof Error ? resyncError.message : "The customer could not be resynced.");
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
              <h1>{countLabel(customers.length, "customer", "customers", t)}</h1>
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
            <label className="customers-sort-select">
              <span>{t("Sort")}</span>
              <select className="input" value={sortMode} onChange={event => setSortMode(event.target.value as SortMode)}>
                <option value="recent">{t("Last contact")}</option>
                <option value="lastOrder">{t("Last Order")}</option>
                <option value="orders">{t("Most Orders")}</option>
                <option value="highestValue">{t("Highest Value")}</option>
                <option value="outstanding">{t("Outstanding")}</option>
                <option value="alphabetical">{t("Alphabetical")}</option>
              </select>
            </label>
          </div>
          {allSegments.length > 0 ? (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "0 14px 10px" }}>
              {allSegments.map(([tag, count]) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSegmentFilter(current => current === tag ? null : tag)}
                  style={{ cursor: "pointer", fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "3px 11px", border: segmentFilter === tag ? "1px solid #2f6df6" : "1px solid rgba(120,120,140,0.25)", background: segmentFilter === tag ? "rgba(47,109,246,0.1)" : "transparent", color: segmentFilter === tag ? "#2f6df6" : "inherit" }}
                >
                  ⬖ {tag} <span style={{ opacity: 0.55 }}>{count}</span>
                </button>
              ))}
              {segmentFilter ? (
                <button type="button" onClick={() => setSegmentFilter(null)} style={{ cursor: "pointer", fontSize: 11, border: 0, background: "none", opacity: 0.6 }}>✕ {t("Clear")}</button>
              ) : null}
            </div>
          ) : null}

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
                matchHint={searchMatchHints.get(customer.id)}
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
          onDoubleClick={sidebar.resetWidth}
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
              duplicate={selectedDuplicate}
              linkedNotes={selectedLinkedNotes}
              onResync={() => handleResyncCustomer(selectedCustomer)}
              onReviewMerge={() => setMergeOpen(true)}
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

      {mergeOpen && selectedCustomer && selectedDuplicate ? (
        <MergeCustomersModal
          left={selectedCustomer}
          right={selectedDuplicate.other}
          reason={selectedDuplicate.reason}
          merging={mergingCustomers}
          error={actionError}
          canSeeFinance={canSeeFinance}
          moneySettings={moneySettings ?? ({} as StudioMoneySettings)}
          language={language}
          onClose={() => {
            if (!mergingCustomers) setMergeOpen(false);
          }}
          onMerge={handleMergeCustomers}
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
            className="order-list-context-row"
            type="button"
            role="menuitem"
            onClick={() => {
              setCustomerContextMenu(null);
              exportCustomerData(contextCustomer);
            }}
          >
            <span aria-hidden="true">⇩</span>
            {t("Export data (JSON)")}
          </button>
          {workspace && workspace.role.toLowerCase() === "owner" ? (
            <button
              className="order-list-context-row danger"
              type="button"
              role="menuitem"
              onClick={() => {
                setCustomerContextMenu(null);
                void handleAnonymizeCustomer(contextCustomer);
              }}
            >
              <span aria-hidden="true">◍</span>
              {t("Anonymize (GDPR)")}
            </button>
          ) : null}
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
  matchHint,
  onSelect,
  onContextMenu
}: {
  customer: CustomerDirectoryItem;
  selected: boolean;
  canSeeFinance: boolean;
  moneySettings: StudioMoneySettings;
  language: string;
  matchHint?: string;
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
        {matchHint ? (
          <small style={{ color: "#b45309", fontWeight: 700 }}>⌕ {t("Matched")}: {matchHint}</small>
        ) : null}
        {designNames.length > 0 ? (
          <span className="customer-list-designs" aria-label="Customer designs">
            {designNames.map((designName, index) => (
              <span key={`${designName}-${index}`} title={designName}>{designName}</span>
            ))}
            {extraDesignCount > 0 ? <span>+{extraDesignCount} {t("more")}</span> : null}
          </span>
        ) : null}
        {customer.tags.length > 0 ? (
          <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {customer.tags.slice(0, 3).map(tag => (
              <span key={tag} style={{ fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "1px 8px", background: "rgba(47,109,246,0.1)", color: "#2f6df6" }}>⬖ {tag}</span>
            ))}
          </span>
        ) : null}
        <span className="customer-list-meta">
          <span className="studio-pill">{countLabel(customer.orderCount, "order", "orders", t)}</span>
          <span className="studio-pill">{t("Last contact")}: {formatDate(customer.lastContactDate)}</span>
          {CUSTOMER_SOURCE_LABEL[customer.source] ? <span className="studio-pill">{CUSTOMER_SOURCE_LABEL[customer.source]}</span> : null}
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
  duplicate,
  linkedNotes,
  onResync,
  onReviewMerge,
  onSaveDetails,
  onUploadPhoto
}: {
  customer: CustomerDirectoryItem;
  canSeeFinance: boolean;
  canManageCustomers: boolean;
  moneySettings: StudioMoneySettings;
  savingInlineField: string;
  language: string;
  duplicate: { other: CustomerDirectoryItem; reason: "email" | "phone" } | null;
  linkedNotes: StudioKeepNote[];
  onResync: () => void;
  onReviewMerge: () => void;
  onSaveDetails: (patch: CustomerUpdatePatch, fieldLabel: string) => Promise<void>;
  onUploadPhoto: (file: File) => Promise<void>;
}) {
  const { hideNumbers } = usePricePrivacy();
  const t = (text: string) => studioT(text, language);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const uploadingPhoto = savingInlineField === "Customer photo";

  const [activeTab, setActiveTab] = useState<"Orders" | "Files" | "Notes" | "Activity">("Orders");
  const [activityLimit, setActivityLimit] = useState(30);
  const [segmentInput, setSegmentInput] = useState("");

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
            {countLabel(customer.orderCount, "order", "orders", t)}
            {CUSTOMER_SOURCE_LABEL[customer.source] ? <span className="studio-pill" style={{ marginLeft: 8 }}>{CUSTOMER_SOURCE_LABEL[customer.source]}</span> : null}
          </p>
          {(() => {
            // One-tap ways to reach the customer, built from what the profile
            // already knows — no dialer/app integration, plain links.
            const phone = (customer.primaryPhone || customer.phone).trim();
            const phoneDigits = phone.replace(/[^0-9+]/g, "");
            // The dedicated WhatsApp number wins; the store-fed phone is only
            // a fallback guess.
            const waSource = (customer.whatsappNumber || customer.phone || customer.primaryPhone).trim();
            const waDigits = waSource.replace(/[^0-9+]/g, "").replace(/^\+/, "").replace(/^00/, "");
            const instagram = customer.instagram.trim().replace(/^@/, "");
            const quickAction: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, borderRadius: 999, padding: "4px 12px", border: "1px solid rgba(120,120,140,0.28)", textDecoration: "none", color: "inherit" };
            // "Do not contact" wins over every outreach shortcut — the links
            // stay visible but inert, so the flag is impossible to miss.
            const blocked = customer.doNotContact;
            const blockedStyle: React.CSSProperties = blocked ? { opacity: 0.35, pointerEvents: "none" } : {};
            const preferredPill = (channel: string) => customer.preferredChannel === channel
              ? { boxShadow: "0 0 0 2px rgba(47,109,246,0.35)" } : {};
            return (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {phone ? <a style={{ ...quickAction, ...blockedStyle, ...preferredPill("phone") }} href={`tel:${phoneDigits}`}>📞 {t("Call")}</a> : null}
                {waDigits ? <a style={{ ...quickAction, ...blockedStyle, ...preferredPill("whatsapp") }} href={`https://wa.me/${waDigits}`} target="_blank" rel="noopener noreferrer">💬 WhatsApp</a> : null}
                {customer.email ? <a style={{ ...quickAction, ...blockedStyle, ...preferredPill("email") }} href={`mailto:${customer.email}`}>✉️ {t("Email")}</a> : null}
                {instagram ? <a style={{ ...quickAction, ...blockedStyle, ...preferredPill("instagram") }} href={`https://instagram.com/${encodeURIComponent(instagram)}`} target="_blank" rel="noopener noreferrer">◎ Instagram</a> : null}
                <Link style={{ ...quickAction, ...blockedStyle }} href={`/messages?q=${encodeURIComponent(customerDisplayName(customer.name))}`}>🗨 {t("Messages")}</Link>
                <Link style={{ ...quickAction, ...blockedStyle }} href={`/quick-reply?customer=${encodeURIComponent(customerDisplayName(customer.name))}`}>✨ {t("AI Reply")}</Link>
                {blocked ? <span style={{ ...quickAction, borderColor: "rgba(220,38,38,0.4)", color: "#dc2626", background: "rgba(220,38,38,0.06)" }}>⛔ {t("Do not contact")}</span> : null}
                {customer.nextFollowUpDate ? (
                  <span style={{ ...quickAction, borderColor: "rgba(245,158,11,0.4)", color: customer.nextFollowUpDate.getTime() < Date.now() ? "#dc2626" : "#b45309", background: "rgba(245,158,11,0.06)" }}>
                    ⏰ {t("Follow-up")}: {formatDate(customer.nextFollowUpDate)}
                  </span>
                ) : null}
              </div>
            );
          })()}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
            {customer.tags.map(tag => (
              <span key={tag} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "3px 10px", background: "rgba(47,109,246,0.1)", color: "#2f6df6" }}>
                ⬖ {tag}
                {canManageCustomers ? (
                  <button type="button" onClick={() => void onSaveDetails({ tags: customer.tags.filter(item => item !== tag) }, "Segments")}
                    style={{ border: 0, background: "none", cursor: "pointer", color: "inherit", opacity: 0.6, padding: 0, fontSize: 10 }} aria-label={t("Remove")}>✕</button>
                ) : null}
              </span>
            ))}
            {canManageCustomers ? (
              <>
              <input
                type="text"
                value={segmentInput}
                onChange={event => setSegmentInput(event.target.value)}
                onKeyDown={event => {
                  if (event.key !== "Enter") return;
                  const value = segmentInput.trim();
                  if (!value || customer.tags.includes(value)) { setSegmentInput(""); return; }
                  void onSaveDetails({ tags: [...customer.tags, value] }, "Segments");
                  setSegmentInput("");
                }}
                placeholder={`＋ ${t("Add segment")}`}
                list="customer-segment-suggestions"
                style={{ fontSize: 11, padding: "3px 10px", borderRadius: 999, border: "1px dashed rgba(120,120,140,0.4)", background: "transparent", color: "inherit", width: 120 }}
              />
              <datalist id="customer-segment-suggestions">
                {["VIP", "High value", "Repeat customer", "New customer", "Inactive", "Outstanding balance", "Waiting for response", "Marketing subscribed", "Wholesale"].map(item => (
                  <option key={item} value={item} />
                ))}
              </datalist>
              </>
            ) : null}
          </div>
        </div>
      </section>

      {duplicate ? (
        <div className="customer-duplicate-banner" role="status">
          <span>
            ⚠️ {t("Possible duplicate customer")} · {t(duplicate.reason === "email" ? "Same email as" : "Same phone as")}{" "}
            <strong>{customerDisplayName(duplicate.other.name)}</strong>
          </span>
          {canManageCustomers ? (
            <button type="button" onClick={onReviewMerge}>{t("Review and merge")}</button>
          ) : null}
        </div>
      ) : null}

      <div className="customer-stats-row">
        {/* Order value is not money received — the report's distinction, kept
            visible: value, what was actually paid, and what is still owed. */}
        <CustomerStatCard
          emoji="🛍️"
          tint="#34c759"
          label={t("Total Order Value")}
          value={canSeeFinance ? money(customer.totalValue, hideNumbers, moneySettings) : "—"}
          sub={canSeeFinance && customer.totalRefunded > 0.004
            ? `${t("incl.")} ${money(customer.totalRefunded, hideNumbers, moneySettings)} ${t("cancelled or refunded")}`
            : undefined}
          valueClass="positive"
        />
        <CustomerStatCard emoji="💷" tint="#2f6df6" label={t("Paid")} value={canSeeFinance ? money(customer.totalPaid, hideNumbers, moneySettings) : "—"} valueClass="positive" />
        <CustomerStatCard emoji="⏳" tint="#ff3b30" label={t("Outstanding")} value={canSeeFinance ? money(Math.max(customer.totalOutstanding, 0), hideNumbers, moneySettings) : "—"} />
        <CustomerStatCard emoji="📦" tint="#2f6df6" label={t("Total Orders")} value={String(customer.orderCount)} />
        <CustomerStatCard emoji="📅" tint="#af52de" label={t("Last Order")} value={lastOrderDate ? formatDate(lastOrderDate) : "—"} />
        <CustomerStatCard emoji="🕐" tint="#ff9500" label={t("Customer Since")} value={customerSinceDate ? formatMonthYear(customerSinceDate) : "—"} />
      </div>

      {CUSTOMER_SOURCE_LABEL[customer.source] ? (
        <section className="card app-card customer-detail-card" style={{ marginBottom: 14 }}>
          <div className="app-card-panel" style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", fontSize: 12.5 }}>
            <span><span style={{ opacity: 0.6 }}>{t("Connected store")}:</span> <strong>{CUSTOMER_SOURCE_LABEL[customer.source]}</strong></span>
            {customer.externalCustomerId ? <span><span style={{ opacity: 0.6 }}>{t("Store customer ID")}:</span> <strong style={{ fontVariantNumeric: "tabular-nums" }}>{customer.externalCustomerId}</strong></span> : null}
            <span><span style={{ opacity: 0.6 }}>{t("Last synced")}:</span> <strong>{customer.integrationSyncedAt ? formatDateTime(customer.integrationSyncedAt) : "—"}</strong></span>
            <span style={{ flex: 1 }} />
            {canManageCustomers && customer.integrationLastPayload ? (
              <button type="button" className="customer-view-all" disabled={savingInlineField === "Integration resync"}
                onClick={onResync} title={t("Re-applies what the store last sent — the store's values win.")}>
                ⟳ {savingInlineField === "Integration resync" ? t("Resyncing from store data…") : t("Resync from store data")}
              </button>
            ) : null}
          </div>
          {customer.integrationLastPayload ? (
            <details style={{ padding: "0 18px 12px", fontSize: 11.5 }}>
              <summary style={{ cursor: "pointer", opacity: 0.65, fontWeight: 700 }}>{t("View raw store data")}</summary>
              <pre style={{ margin: "8px 0 0", padding: 10, borderRadius: 10, background: "rgba(120,120,140,0.08)", overflowX: "auto", fontSize: 11, lineHeight: 1.5 }}>
                {(() => { try { return JSON.stringify(JSON.parse(customer.integrationLastPayload), null, 2); } catch { return customer.integrationLastPayload; } })()}
              </pre>
            </details>
          ) : null}
        </section>
      ) : null}

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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10, fontSize: 12.5 }}>
                <label>
                  <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.6, marginBottom: 4 }}>{t("Preferred channel")}</div>
                  <select className="input" value={customer.preferredChannel} disabled={!canManageCustomers || savingInlineField === "Contact preferences"}
                    onChange={event => void onSaveDetails({ preferredChannel: event.target.value }, "Contact preferences")}>
                    <option value="">—</option>
                    <option value="phone">{t("Call")}</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="email">{t("Email")}</option>
                    <option value="instagram">Instagram</option>
                  </select>
                </label>
                <label>
                  <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.6, marginBottom: 4 }}>{t("Marketing")}</div>
                  <select className="input" value={customer.marketingOptIn} disabled={!canManageCustomers || savingInlineField === "Contact preferences"}
                    onChange={event => void onSaveDetails({ marketingOptIn: event.target.value }, "Contact preferences")}>
                    <option value="">—</option>
                    <option value="subscribed">{t("Subscribed")}</option>
                    <option value="unsubscribed">{t("Unsubscribed")}</option>
                  </select>
                </label>
                <label>
                  <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.6, marginBottom: 4 }}>{t("Next follow-up")}</div>
                  <input className="input" type="date" disabled={!canManageCustomers || savingInlineField === "Contact preferences"}
                    value={customer.nextFollowUpDate ? `${customer.nextFollowUpDate.getFullYear()}-${String(customer.nextFollowUpDate.getMonth() + 1).padStart(2, "0")}-${String(customer.nextFollowUpDate.getDate()).padStart(2, "0")}` : ""}
                    onChange={event => {
                      const value = event.target.value;
                      if (!value) { void onSaveDetails({ nextFollowUpDateMillis: null }, "Contact preferences"); return; }
                      const [y, m, d] = value.split("-").map(Number);
                      if (!y || !m || !d) return;
                      void onSaveDetails({ nextFollowUpDateMillis: new Date(y, m - 1, d, 12, 0, 0).getTime() }, "Contact preferences");
                    }} />
                </label>
                <label style={{ display: "flex", alignItems: "flex-end", gap: 6, paddingBottom: 6 }}>
                  <input type="checkbox" checked={customer.doNotContact} disabled={!canManageCustomers || savingInlineField === "Contact preferences"}
                    onChange={event => void onSaveDetails({ doNotContact: event.target.checked }, "Contact preferences")} />
                  <span style={{ fontWeight: 700, color: customer.doNotContact ? "#dc2626" : "inherit" }}>{t("Do not contact")}</span>
                </label>
              </div>
            </div>
          </section>
        </div>

        <div className="customer-card-stack">
          <section className="card app-card customer-detail-card">
            <div className="customer-card-head">
              <CardTitle icon="orders" eyebrow={t("Order History")} title={countLabel(customer.orderCount, "order", "orders", t)} />
              {orders.length > 0 ? (
                <Link href={`/orders?customerName=${encodeURIComponent(customer.name)}`} className="customer-view-all">
                  {t("View All Orders")}
                </Link>
              ) : null}
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
            <CardTitle icon="notes" eyebrow={t("Notes")} title={t("Customer Notes")} />
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
              {/* Two things called "Notes" on one screen confuse — the tab is
                  order notes, the card above is the customer's own note. */}
              {t(tab === "Notes" ? "Order Notes" : tab)}
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
                      <td className="ta-right">{canSeeFinance ? money(order.paidAmount + order.remainingAmount + order.customRemainingTotal, hideNumbers, moneySettings) : "—"}</td>
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
            orderNotes.length === 0 && linkedNotes.length === 0 ? <CustomerTabEmpty text={t("No order notes yet.")} /> : (
              <div className="customer-order-notes-list">
                {linkedNotes.map(note => (
                  <Link key={`keep-${note.id}`} href="/notes" className="customer-order-note-card">
                    <span className="customer-order-note-head">
                      <strong>{note.title.trim() || t("Linked note")}</strong>
                      <small>{note.updatedAtMillis ? new Date(note.updatedAtMillis).toLocaleDateString() : ""}</small>
                    </span>
                    <span className="customer-order-note-text">{note.text}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: "#0e7a55" }}>◉ {t("Linked note")}{note.linkedOrderLabel ? ` · ${note.linkedOrderLabel}` : ""}</span>
                  </Link>
                ))}
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
                {allActivity.slice(0, activityLimit).map(({ order, entry }) => (
                  <div key={order.id + entry.id} className="customer-activity-row">
                    <span className="customer-activity-dot" aria-hidden="true" />
                    <span className="customer-activity-main">
                      <strong>{t(entry.title)}</strong>
                      {entry.oldValue || entry.newValue ? <small className="customer-activity-change">{entry.oldValue || "—"} → {entry.newValue || "—"}</small> : null}
                      <small>
                        {(order.invoiceNumber || order.designName)} • {formatDateTime(entry.createdAt)}
                        {entry.byEmail ? ` • ${entry.byEmail}` : ""}
                      </small>
                    </span>
                  </div>
                ))}
                {allActivity.length > activityLimit ? (
                  <button type="button" className="customer-view-all" onClick={() => setActivityLimit(limit => limit + 50)}>
                    {t("Load more")} ({allActivity.length - activityLimit})
                  </button>
                ) : null}
              </div>
            )
          )}
        </div>
      </section>
    </div>
  );
}

function CustomerStatCard({ emoji, tint, label, value, sub, valueClass }: { emoji: string; tint: string; label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="customer-stat-card">
      <span className="customer-stat-chip" style={{ backgroundColor: `${tint}26`, color: tint }}>{emoji}</span>
      <span className="customer-stat-label">{label}</span>
      <span className={`customer-stat-value${valueClass ? ` ${valueClass}` : ""}`}>{value}</span>
      {sub ? <span className="customer-stat-sub">{sub}</span> : null}
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
  // The details form edits string fields only; tags are managed by their own
  // chip editor and must not trip the dirty check.
  const isDirty = (Object.keys(saved) as Array<keyof CustomerFormInput>).some(key => {
    const draftValue = draft[key];
    const savedValue = saved[key];
    if (Array.isArray(draftValue) || Array.isArray(savedValue)) return false;
    return normalizedValue((draftValue as string) || "") !== normalizedValue((savedValue as string) || "");
  });

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
    { label: "Primary Phone", field: "primaryPhone" },
    // The customer's own WhatsApp number, kept apart from the store-fed phone.
    { label: "WhatsApp Number", field: "whatsappNumber" },
    // The order's general phone lands here — it is NOT a verified WhatsApp
    // number, so the label stays honest about that.
    { label: "Phone (from orders)", field: "phone" },
    { label: "Company", field: "company" },
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
            value={(draft[item.field] as string) || ""}
            disabled={disabled || saving}
            onChange={event => updateField(item.field, event.target.value)}
            placeholder="-"
            list={item.field === "country" || item.field === "shippingCountry" ? "studio-country-options" : undefined}
          />
        </label>
      ))}
      <CountryDatalist />
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
            {canSeeFinance ? <span className="studio-pill">{money(order.paidAmount + order.remainingAmount + order.customRemainingTotal, hideNumbers, moneySettings)}</span> : null}
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
              Primary Phone
              <input className="input" value={form.primaryPhone} onChange={event => updateField("primaryPhone", event.target.value)} disabled={saving} />
            </label>
          </div>

          <div className="add-order-two-col">
            <label>
              WhatsApp Number
              <input className="input" value={form.whatsappNumber} onChange={event => updateField("whatsappNumber", event.target.value)} disabled={saving} />
            </label>
            <label>
              Phone (from orders)
              <input className="input" value={form.phone} onChange={event => updateField("phone", event.target.value)} disabled={saving} />
            </label>
            <label>
              Instagram
              <input className="input" value={form.instagram} onChange={event => updateField("instagram", event.target.value)} disabled={saving} />
            </label>
            <label>
              Company
              <input className="input" value={form.company} onChange={event => updateField("company", event.target.value)} disabled={saving} />
            </label>
          </div>

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
            <input className="input" value={form.country} onChange={event => updateField("country", event.target.value)} disabled={saving} list="studio-country-options" />
            <CountryDatalist />
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

// Merging is a decision, not a guess: the user picks which record survives
// and which conflicting values win. No copies, no automatic overwrites — the
// server keeps the primary's values, fills gaps from the duplicate, and moves
// the duplicate's orders under the surviving name.
function MergeCustomersModal({
  left,
  right,
  reason,
  merging,
  error,
  canSeeFinance,
  moneySettings,
  language,
  onClose,
  onMerge
}: {
  left: CustomerDirectoryItem;
  right: CustomerDirectoryItem;
  reason: "email" | "phone";
  merging: boolean;
  error: string;
  canSeeFinance: boolean;
  moneySettings: StudioMoneySettings;
  language: string;
  onClose: () => void;
  onMerge: (primaryId: string, mergedId: string, keep: Partial<Record<"name" | "email" | "phone" | "primaryPhone" | "whatsappNumber", "primary" | "merged">>) => Promise<void>;
}) {
  const { hideNumbers } = usePricePrivacy();
  const t = (text: string) => studioT(text, language);
  // The record with more history survives by default.
  const [primaryId, setPrimaryId] = useState(right.orderCount > left.orderCount ? right.id : left.id);
  const primary = primaryId === left.id ? left : right;
  const other = primaryId === left.id ? right : left;
  const [keepName, setKeepName] = useState<"primary" | "merged">("primary");
  const [keepEmail, setKeepEmail] = useState<"primary" | "merged">("primary");
  const [keepPhone, setKeepPhone] = useState<"primary" | "merged">("primary");
  const [keepPrimaryPhone, setKeepPrimaryPhone] = useState<"primary" | "merged">("primary");
  const [keepWhatsapp, setKeepWhatsapp] = useState<"primary" | "merged">("primary");

  function fieldPicker(
    label: string,
    primaryValue: string,
    otherValue: string,
    value: "primary" | "merged",
    onChange: (next: "primary" | "merged") => void
  ) {
    if (!primaryValue.trim() || !otherValue.trim() || primaryValue.trim() === otherValue.trim()) return null;
    return (
      <div className="customer-merge-field">
        <span className="customer-merge-field-label">{label}</span>
        <label>
          <input type="radio" checked={value === "primary"} onChange={() => onChange("primary")} disabled={merging} />
          <span>{primaryValue}</span>
        </label>
        <label>
          <input type="radio" checked={value === "merged"} onChange={() => onChange("merged")} disabled={merging} />
          <span>{otherValue}</span>
        </label>
      </div>
    );
  }

  function profileCard(customer: CustomerDirectoryItem) {
    const isPrimary = customer.id === primaryId;
    return (
      <button
        type="button"
        className={isPrimary ? "customer-merge-profile is-primary" : "customer-merge-profile"}
        onClick={() => {
          setPrimaryId(customer.id);
          setKeepName("primary");
          setKeepEmail("primary");
          setKeepPhone("primary");
          setKeepPrimaryPhone("primary");
        }}
        disabled={merging}
      >
        <strong>{customerDisplayName(customer.name)}</strong>
        <small>{customer.email || customer.phone || t("No contact details")}</small>
        <small>
          {countLabel(customer.orderCount, "order", "orders", t)}
          {canSeeFinance ? ` · ${money(customer.totalValue, hideNumbers, moneySettings)}` : ""}
          {CUSTOMER_SOURCE_LABEL[customer.source] ? ` · ${CUSTOMER_SOURCE_LABEL[customer.source]}` : ""}
        </small>
        <span className="customer-merge-primary-pill">{isPrimary ? t("Kept as primary") : t("Will be merged")}</span>
      </button>
    );
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal customer-merge-modal" role="dialog" aria-modal="true" aria-label={t("Merge customers")}>
        <CardTitle icon="customer" eyebrow={t("Possible duplicate customer")} title={t("Merge customers")} />
        <p className="muted-copy">
          {t(reason === "email" ? "These two records share the same email address." : "These two records share the same phone number.")}{" "}
          {t("Merging keeps one profile, fills its gaps from the other, and moves all orders under it. A snapshot is kept on the server.")}
        </p>

        <div className="customer-merge-profiles">
          {profileCard(left)}
          {profileCard(right)}
        </div>

        {fieldPicker(t("Name"), customerDisplayName(primary.name), customerDisplayName(other.name), keepName, setKeepName)}
        {fieldPicker(t("Email"), primary.email, other.email, keepEmail, setKeepEmail)}
        {fieldPicker(t("Phone / WhatsApp"), primary.phone, other.phone, keepPhone, setKeepPhone)}
        {fieldPicker(t("Primary Phone"), primary.primaryPhone, other.primaryPhone, keepPrimaryPhone, setKeepPrimaryPhone)}
        {fieldPicker(t("WhatsApp Number"), primary.whatsappNumber, other.whatsappNumber, keepWhatsapp, setKeepWhatsapp)}

        <p className="muted-copy customer-merge-summary">
          {countLabel(other.orderCount, "order", "orders", t)} → <strong>{customerDisplayName(primary.name)}</strong>
        </p>

        {error ? <p className="layout-error">{error}</p> : null}

        <div className="add-order-actions" style={{ display: "flex", gap: 10 }}>
          <button className="button secondary" type="button" onClick={onClose} disabled={merging}>{t("Cancel")}</button>
          <button
            className="button"
            type="button"
            disabled={merging}
            onClick={() => void onMerge(primary.id, other.id, { name: keepName, email: keepEmail, phone: keepPhone, primaryPhone: keepPrimaryPhone, whatsappNumber: keepWhatsapp })}
          >
            {merging ? t("Merging customers...") : t("Merge customers")}
          </button>
        </div>
      </div>
    </div>
  );
}
