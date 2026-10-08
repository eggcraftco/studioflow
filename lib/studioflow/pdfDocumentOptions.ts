// PDF Export settings → what a printed document shows (8 Oct 2026).
//
// One place decides how the twelve `pdfShow*` switches and the viewer's
// permissions become the sections of a job sheet or an invoice. The real
// print buttons (app/orders/OrderDetailContent.tsx: orderPdfHtml, invoiceHtml)
// and the live preview on Settings → PDF Export Settings both read it, so the
// preview can never show a section the download would hide, or the reverse.
//
// Nothing here touches React, Firebase or the DOM: scripts/check-pdf-export-preview.mjs
// compiles this file on its own and runs it.

export type PdfDocumentKind = "invoice" | "jobsheet";

export const PDF_TOGGLE_KEYS = [
  "pdfShowCustomer",
  "pdfShowContact",
  "pdfShowPreview",
  "pdfShowMaterials",
  "pdfShowPriority",
  "pdfShowFinCustomer",
  "pdfShowPaymentMethod",
  "pdfShowFinInternal",
  "pdfShowStatus",
  "pdfShowShipping",
  "pdfShowAddress",
  "pdfShowShippingAddress"
] as const;

export type PdfToggleKey = (typeof PDF_TOGGLE_KEYS)[number];

/** The switches as they are stored; anything missing takes its default below. */
export type PdfToggleSettings = Partial<Record<PdfToggleKey, boolean>>;

/** What a document shows when a workspace has never saved PDF settings. */
export const PDF_TOGGLE_DEFAULTS: Record<PdfToggleKey, boolean> = {
  pdfShowCustomer: true,
  pdfShowContact: true,
  pdfShowPreview: true,
  pdfShowMaterials: true,
  pdfShowPriority: true,
  pdfShowFinCustomer: true,
  pdfShowPaymentMethod: true,
  pdfShowFinInternal: false,
  pdfShowStatus: true,
  pdfShowShipping: true,
  pdfShowAddress: true,
  pdfShowShippingAddress: true
};

/** The switches that print money. They follow the viewer's permissions, never the stored value alone. */
export const PDF_FINANCE_TOGGLE_KEYS: readonly PdfToggleKey[] = ["pdfShowFinCustomer", "pdfShowPaymentMethod", "pdfShowFinInternal"];

/**
 * Which document each switch changes. The invoice bills line items and prints
 * every price, so only the two address switches reach it; everything else is a
 * job sheet section. The preview uses this to show the document a switch
 * actually changes, and the test proves the list against the renderers.
 */
export const PDF_TOGGLE_DOCUMENTS: Record<PdfToggleKey, readonly PdfDocumentKind[]> = {
  pdfShowCustomer: ["jobsheet"],
  pdfShowContact: ["jobsheet"],
  pdfShowPreview: ["jobsheet"],
  pdfShowMaterials: ["jobsheet"],
  pdfShowPriority: ["jobsheet"],
  pdfShowFinCustomer: ["jobsheet"],
  pdfShowPaymentMethod: ["jobsheet"],
  pdfShowFinInternal: ["jobsheet"],
  pdfShowStatus: ["jobsheet"],
  pdfShowShipping: ["jobsheet"],
  pdfShowAddress: ["invoice", "jobsheet"],
  pdfShowShippingAddress: ["invoice", "jobsheet"]
};

/** The viewer's money permissions, as the order screen derives them. */
export type PdfViewerAccess = {
  /** Workspace member access "financialInfo" (prices, paid, remaining). */
  canSeeFinance: boolean;
  /** Financial Info AND the plan's financial_advanced feature (payment method, cost, profit). */
  canSeeAdvancedFinance: boolean;
};

/** An owner, or a preview that stands in for one. */
export const PDF_FULL_ACCESS: PdfViewerAccess = { canSeeFinance: true, canSeeAdvancedFinance: true };

/**
 * The same two lines the order screen used for its finance gates, kept here so
 * the Settings preview and the print buttons cannot drift: a member is allowed
 * money unless their access says `financialInfo: false`, and the advanced
 * figures also need the plan feature.
 */
export function pdfViewerAccess(
  memberAccess: { financialInfo?: boolean } | null | undefined,
  features: { financial_advanced?: boolean } | null | undefined
): PdfViewerAccess {
  const canSeeFinance = memberAccess?.financialInfo !== false;
  return {
    canSeeFinance,
    canSeeAdvancedFinance: Boolean(features?.financial_advanced && canSeeFinance)
  };
}

/** The resolved sections of a document: every switch, after defaults and the permission mask. */
export type PdfDocumentOptions = {
  showCustomer: boolean;
  showContact: boolean;
  showPreview: boolean;
  showMaterials: boolean;
  showPriority: boolean;
  showFinCustomer: boolean;
  showPaymentMethod: boolean;
  showFinInternal: boolean;
  showStatus: boolean;
  showShipping: boolean;
  showAddress: boolean;
  showShippingAddress: boolean;
};

function toggleValue(settings: PdfToggleSettings | null | undefined, key: PdfToggleKey) {
  const value = settings?.[key];
  return typeof value === "boolean" ? value : PDF_TOGGLE_DEFAULTS[key];
}

/**
 * Settings + permissions → sections. The permission mask is applied here and
 * nowhere else:
 *  - Paid & Remaining need Financial Info;
 *  - Payment Method needs Paid & Remaining AND the advanced finance feature;
 *  - Internal Financials need the advanced finance feature (and are off by default).
 * A stored `true` never wins over a missing permission.
 */
export function resolvePdfDocumentOptions(
  settings: PdfToggleSettings | null | undefined,
  access: PdfViewerAccess
): PdfDocumentOptions {
  const showFinCustomer = Boolean(access.canSeeFinance && toggleValue(settings, "pdfShowFinCustomer"));
  const showPaymentMethod = Boolean(showFinCustomer && access.canSeeAdvancedFinance && toggleValue(settings, "pdfShowPaymentMethod"));
  const showFinInternal = Boolean(access.canSeeAdvancedFinance && toggleValue(settings, "pdfShowFinInternal"));
  return {
    showCustomer: toggleValue(settings, "pdfShowCustomer"),
    showContact: toggleValue(settings, "pdfShowContact"),
    showPreview: toggleValue(settings, "pdfShowPreview"),
    showMaterials: toggleValue(settings, "pdfShowMaterials"),
    showPriority: toggleValue(settings, "pdfShowPriority"),
    showFinCustomer,
    showPaymentMethod,
    showFinInternal,
    showStatus: toggleValue(settings, "pdfShowStatus"),
    showShipping: toggleValue(settings, "pdfShowShipping"),
    showAddress: toggleValue(settings, "pdfShowAddress"),
    showShippingAddress: toggleValue(settings, "pdfShowShippingAddress")
  };
}

/**
 * The invoice prints every price, the VAT and the total, so the whole document
 * follows Financial Info: the order screen hides both Invoice PDF buttons from a
 * member without it, and the Settings preview must not show them one either.
 */
export function canViewInvoiceDocument(access: PdfViewerAccess) {
  return access.canSeeFinance;
}

/**
 * Why a finance switch is masked out of every document this viewer can print
 * or preview: "permission" when Financial Info is off, "plan" when only the
 * advanced finance feature is missing, "none" when the switch applies. The
 * Settings page tags such a switch so a flip that changes nothing on screen is
 * explained rather than mistaken for a broken preview.
 */
export type PdfToggleMaskReason = "none" | "permission" | "plan";
export function pdfToggleMaskReason(key: PdfToggleKey, access: PdfViewerAccess): PdfToggleMaskReason {
  if (!PDF_FINANCE_TOGGLE_KEYS.includes(key)) return "none";
  if (!access.canSeeFinance) return "permission";
  if (key === "pdfShowFinCustomer") return "none";
  return access.canSeeAdvancedFinance ? "none" : "plan";
}

/**
 * Which document the preview should show after a switch is flipped: the one on
 * screen if the switch changes it, otherwise the first document it does change.
 * This is how every switch is visibly reflected — toggling "Materials" while
 * the invoice is shown moves the preview to the job sheet, where materials live.
 */
export function pdfPreviewKindAfterToggle(current: PdfDocumentKind, key: PdfToggleKey): PdfDocumentKind {
  const documents = PDF_TOGGLE_DOCUMENTS[key];
  return documents.includes(current) ? current : (documents[0] ?? current);
}

/**
 * The settings object a document is rendered from: the stored settings with
 * the unsaved draft on top. Both the preview and (once saved) the real print
 * read the same shape, so there is no second mapping to keep in step.
 */
export function pdfRenderSettings<T extends object>(stored: T, draft: Partial<T> | null | undefined): T {
  return { ...stored, ...(draft ?? {}) };
}

/**
 * Latest-wins bookkeeping for the preview. Every generation takes a token;
 * only the holder of the newest token may publish its result, so a slow
 * render (the module still loading, a large template) can never overwrite the
 * preview of a setting that changed after it started.
 */
export function createPdfPreviewSequencer() {
  let latest = 0;
  return {
    next(): number {
      latest += 1;
      return latest;
    },
    isCurrent(token: number): boolean {
      return token === latest;
    },
    /** Invalidates every token handed out so far (unmount, workspace change). */
    cancel(): void {
      latest += 1;
    }
  };
}
