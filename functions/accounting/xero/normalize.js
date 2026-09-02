"use strict";

// Xero entities → NivaDesk accounting snapshots. Pure: raw JSON in, small plain
// objects out. Nothing here touches Firestore, and nothing outside the xero/
// folder reads raw Xero JSON (XR §5, §18). The snapshot shapes match the
// QuickBooks ones field for field so the generic engine, the catalogue and the
// web mapping screens do not care which provider filled them.

const { parseXeroDate } = require("./client");

function text(value, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}
function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function bool(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}
function dateOnly(value) {
  const iso = parseXeroDate(value);
  return iso ? iso.slice(0, 10) : "";
}
function updatedAt(raw) {
  return parseXeroDate(raw?.UpdatedDateUTC);
}
function status(raw) {
  return text(raw?.Status, 20).toUpperCase();
}

const ID_FIELDS = Object.freeze({
  Organisation: "OrganisationID", Account: "AccountID", TaxRate: "TaxType", Contact: "ContactID", Item: "ItemID",
  Invoice: "InvoiceID", CreditNote: "CreditNoteID", Payment: "PaymentID", BankTransaction: "BankTransactionID", BankTransfer: "BankTransferID",
  Overpayment: "OverpaymentID", Prepayment: "PrepaymentID", PurchaseOrder: "PurchaseOrderID", Quote: "QuoteID", ManualJournal: "ManualJournalID"
});
const RESOURCE_OF = Object.freeze({
  Organisation: "Organisation", Account: "Accounts", TaxRate: "TaxRates", Contact: "Contacts", Item: "Items",
  Invoice: "Invoices", CreditNote: "CreditNotes", Payment: "Payments", BankTransaction: "BankTransactions", BankTransfer: "BankTransfers",
  Overpayment: "Overpayments", Prepayment: "Prepayments", PurchaseOrder: "PurchaseOrders", Quote: "Quotes", ManualJournal: "ManualJournals"
});
const CATALOG_ENTITIES = Object.freeze(["Account", "TaxRate", "Contact", "Item"]);
const TRANSACTION_ENTITIES = Object.freeze(["Invoice", "CreditNote", "Payment", "BankTransaction", "BankTransfer", "Overpayment", "Prepayment", "PurchaseOrder", "Quote", "ManualJournal"]);
// What the six-hourly sweep reads with If-Modified-Since. TaxRates carry no
// UpdatedDateUTC and come back whole with the catalogue instead.
const INCREMENTAL_ENTITIES = Object.freeze(["Contact", "Item", "Account", "Invoice", "CreditNote", "Payment", "BankTransaction", "BankTransfer", "Overpayment", "Prepayment"]);
const DELETED_STATUSES = new Set(["DELETED", "VOIDED"]);

function idOf(entityType, raw) {
  return text(raw?.[ID_FIELDS[entityType] || `${entityType}ID`], 80);
}
function isDeleted(raw) {
  return DELETED_STATUSES.has(status(raw));
}

// Organisation (+ Currencies) → what the wizard shows in "Verify the organisation".
function normalizeCompanyProfile(org = {}, { currencies = [] } = {}) {
  const endMonth = num(org.FinancialYearEndMonth);
  const startMonth = endMonth ? (endMonth % 12) + 1 : 0;
  return {
    externalCompanyId: text(org.OrganisationID, 80),
    companyName: text(org.Name, 200),
    legalName: text(org.LegalName, 200),
    country: text(org.CountryCode, 8),
    homeCurrency: text(org.BaseCurrency, 8) || "GBP",
    multiCurrencyEnabled: (Array.isArray(currencies) ? currencies : []).length > 1,
    fiscalYearStartMonth: startMonth ? String(startMonth) : "",
    financialYearEndDay: num(org.FinancialYearEndDay),
    financialYearEndMonth: endMonth,
    bookCloseDate: dateOnly(org.PeriodLockDate),
    endOfYearLockDate: dateOnly(org.EndOfYearLockDate),
    taxTrackingEnabled: Boolean(text(org.TaxNumber, 40)) || Boolean(text(org.SalesTaxBasis, 40)),
    taxNumber: text(org.TaxNumber, 40),
    salesTaxBasis: text(org.SalesTaxBasis, 40),
    salesTaxPeriod: text(org.SalesTaxPeriod, 40),
    organisationType: text(org.OrganisationType, 40),
    edition: text(org.Edition, 20),
    organisationStatus: text(org.OrganisationStatus, 20),
    isDemoCompany: bool(org.IsDemoCompany, false),
    shortCode: text(org.ShortCode, 20),
    timezone: text(org.Timezone, 40),
    companyStartDate: "",
    email: "",
    syncToken: "",
    updatedAt: parseXeroDate(org.CreatedDateUTC)
  };
}

// Xero accounts have a Type (REVENUE, SALES, EXPENSE, DIRECTCOSTS, OVERHEADS,
// BANK, CURRENT, INVENTORY, …) and a Class (ASSET, LIABILITY, EQUITY, REVENUE,
// EXPENSE). Type takes the accountType slot, Class the sub-type/classification.
function normalizeAccount(raw = {}) {
  const code = text(raw.Code, 20);
  const name = text(raw.Name, 200);
  return {
    externalId: text(raw.AccountID, 80),
    name,
    fullyQualifiedName: code ? `${code} · ${name}` : name,
    accountType: text(raw.Type, 40),
    accountSubType: text(raw.Class, 40),
    classification: text(raw.Class, 40),
    accountNumber: code,
    currency: text(raw.CurrencyCode, 8),
    active: status(raw) === "ACTIVE",
    subAccount: false,
    parentId: "",
    currentBalance: 0,
    bankAccountType: text(raw.BankAccountType, 20),
    taxType: text(raw.TaxType, 40),
    enablePaymentsToAccount: bool(raw.EnablePaymentsToAccount, false),
    showInExpenseClaims: bool(raw.ShowInExpenseClaims, false),
    systemAccount: text(raw.SystemAccount, 40),
    syncToken: "",
    updatedAt: updatedAt(raw)
  };
}

// A Xero tax rate is keyed by its TaxType (OUTPUT2, RROUTPUT, NONE, …), which is
// also what a line item carries — so the TaxType is the externalId.
function normalizeTaxRate(raw = {}) {
  const components = (Array.isArray(raw.TaxComponents) ? raw.TaxComponents : []).map((row) => ({
    rateId: text(row.Name, 80), name: text(row.Name, 80), rateValue: num(row.Rate), taxOrder: 0, applicable: row.IsCompound ? "compound" : ""
  }));
  const rate = num(raw.EffectiveRate);
  return {
    externalId: text(raw.TaxType, 80),
    name: text(raw.Name, 200),
    description: `${rate}%${raw.ReportTaxType ? ` · ${text(raw.ReportTaxType, 40)}` : ""}`,
    active: status(raw) === "ACTIVE",
    taxable: rate > 0,
    taxGroup: components.length > 1,
    hidden: false,
    reportTaxType: text(raw.ReportTaxType, 40),
    canApplyToRevenue: bool(raw.CanApplyToRevenue, false),
    canApplyToExpenses: bool(raw.CanApplyToExpenses, false),
    canApplyToAssets: bool(raw.CanApplyToAssets, false),
    canApplyToLiabilities: bool(raw.CanApplyToLiabilities, false),
    canApplyToEquity: bool(raw.CanApplyToEquity, false),
    salesRates: components,
    purchaseRates: components,
    effectiveSalesRate: rate,
    effectivePurchaseRate: rate,
    displayTaxRate: num(raw.DisplayTaxRate),
    syncToken: "",
    updatedAt: ""
  };
}

function firstPhone(raw) {
  const phones = Array.isArray(raw?.Phones) ? raw.Phones : [];
  const preferred = phones.find((row) => row && row.PhoneNumber && text(row.PhoneType, 20) === "DEFAULT") || phones.find((row) => row && row.PhoneNumber);
  return preferred ? text([preferred.PhoneCountryCode, preferred.PhoneAreaCode, preferred.PhoneNumber].filter(Boolean).join(" "), 40) : "";
}

// One Contact carries both roles; IsCustomer / IsSupplier are set by Xero once
// the contact has been used on a sales or purchase document.
function normalizeContact(raw = {}) {
  const name = text(raw.Name, 200);
  return {
    externalId: text(raw.ContactID, 80),
    displayName: name,
    companyName: name,
    givenName: text(raw.FirstName, 100),
    familyName: text(raw.LastName, 100),
    email: text(raw.EmailAddress, 160).toLowerCase(),
    phone: firstPhone(raw),
    currency: text(raw.DefaultCurrency, 8),
    balance: num(raw.Balances?.AccountsReceivable?.Outstanding),
    payableBalance: num(raw.Balances?.AccountsPayable?.Outstanding),
    active: text(raw.ContactStatus, 20).toUpperCase() !== "ARCHIVED" && text(raw.ContactStatus, 20).toUpperCase() !== "GDPRREQUEST",
    isCustomer: bool(raw.IsCustomer, false),
    isSupplier: bool(raw.IsSupplier, false),
    taxNumber: text(raw.TaxNumber, 40),
    accountNumber: text(raw.AccountNumber, 50),
    contactNumber: text(raw.ContactNumber, 50),
    taxable: true,
    syncToken: "",
    updatedAt: updatedAt(raw)
  };
}
function asCustomer(contact) {
  const { payableBalance, ...rest } = contact;
  return rest;
}
function asVendor(contact) {
  const { balance, payableBalance, ...rest } = contact;
  return { ...rest, balance: payableBalance, vendor1099: false };
}

function normalizeItem(raw = {}) {
  const code = text(raw.Code, 80);
  const name = text(raw.Name, 200);
  const sold = bool(raw.IsSold, false);
  const purchased = bool(raw.IsPurchased, false);
  const tracked = bool(raw.IsTrackedAsInventory, false);
  return {
    externalId: text(raw.ItemID, 80),
    name,
    fullyQualifiedName: code ? `${code} · ${name}` : name,
    sku: code,
    type: tracked ? "Inventory" : sold && purchased ? "Service" : sold ? "Sold" : purchased ? "Purchased" : "Service",
    description: text(raw.Description, 300),
    unitPrice: num(raw.SalesDetails?.UnitPrice),
    purchaseCost: num(raw.PurchaseDetails?.UnitPrice),
    incomeAccountId: text(raw.SalesDetails?.AccountCode, 20),
    incomeAccountName: "",
    expenseAccountId: text(raw.PurchaseDetails?.COGSAccountCode || raw.PurchaseDetails?.AccountCode, 20),
    expenseAccountName: "",
    assetAccountId: text(raw.InventoryAssetAccountCode, 20),
    assetAccountName: "",
    taxable: Boolean(text(raw.SalesDetails?.TaxType, 40)) && text(raw.SalesDetails?.TaxType, 40) !== "NONE",
    trackQuantity: tracked,
    quantityOnHand: num(raw.QuantityOnHand),
    active: true,
    syncToken: "",
    updatedAt: updatedAt(raw)
  };
}

// Posted-document snapshots (read-back only until the posting phase).
function normalizeTransaction(entityType, raw = {}) {
  const lines = Array.isArray(raw.LineItems) ? raw.LineItems : Array.isArray(raw.JournalLines) ? raw.JournalLines : [];
  const type = text(raw.Type, 20).toUpperCase();
  const contactId = text(raw.Contact?.ContactID, 80);
  const contactName = text(raw.Contact?.Name, 200);
  const customerSide = type === "ACCREC" || type === "RECEIVE" || type === "RECEIVE-OVERPAYMENT" || type === "RECEIVE-PREPAYMENT" || entityType === "Quote";
  const vendorSide = type === "ACCPAY" || type === "SPEND" || type === "SPEND-OVERPAYMENT" || type === "SPEND-PREPAYMENT" || entityType === "PurchaseOrder";
  const docNumber = text(raw.InvoiceNumber || raw.CreditNoteNumber || raw.PurchaseOrderNumber || raw.QuoteNumber || raw.Reference || raw.Narration, 60);
  const currentStatus = status(raw);
  return {
    externalId: idOf(entityType, raw),
    entityType: text(entityType, 40),
    docNumber,
    reference: text(raw.Reference, 100),
    type,
    status: currentStatus,
    txnDate: dateOnly(raw.DateString || raw.Date),
    dueDate: dateOnly(raw.DueDateString || raw.DueDate),
    totalAmount: raw.Total !== undefined ? num(raw.Total) : num(raw.Amount),
    balance: num(raw.AmountDue ?? raw.RemainingCredit),
    currency: text(raw.CurrencyCode, 8),
    exchangeRate: raw.CurrencyRate === undefined ? null : num(raw.CurrencyRate),
    customerId: customerSide ? contactId : "",
    customerName: customerSide ? contactName : "",
    vendorId: vendorSide ? contactId : "",
    vendorName: vendorSide ? contactName : "",
    privateNote: "",
    lineCount: lines.length,
    totalTax: num(raw.TotalTax),
    isReconciled: bool(raw.IsReconciled, false),
    bankAccountId: text(raw.BankAccount?.AccountID || raw.Account?.AccountID || raw.FromBankAccount?.AccountID, 80),
    linkedTxns: (Array.isArray(raw.Payments) ? raw.Payments : []).map((row) => ({ id: text(row.PaymentID, 80), type: "Payment" }))
      .concat((Array.isArray(raw.Allocations) ? raw.Allocations : []).map((row) => ({ id: text(row.Invoice?.InvoiceID, 80), type: "Invoice" })).filter((row) => row.id)),
    voided: DELETED_STATUSES.has(currentStatus),
    syncToken: "",
    updatedAt: updatedAt(raw)
  };
}

function snapshotOf(entityType, raw) {
  switch (entityType) {
    case "Account": return normalizeAccount(raw);
    case "TaxRate": case "TaxCode": return normalizeTaxRate(raw);
    case "Contact": return normalizeContact(raw);
    case "Customer": return asCustomer(normalizeContact(raw));
    case "Vendor": return asVendor(normalizeContact(raw));
    case "Item": return normalizeItem(raw);
    case "Organisation": return normalizeCompanyProfile(raw, {});
    default: return TRANSACTION_ENTITIES.includes(entityType) ? normalizeTransaction(entityType, raw) : { externalId: idOf(entityType, raw), entityType, syncToken: "", updatedAt: updatedAt(raw) };
  }
}

// ---------------------------------------------------------------------------
// Suggestions for a Xero UK chart of accounts. NivaDesk proposes, a person
// confirms (XR §6 step 6): every suggestion carries a reason and a confidence
// and nothing is written by these. Xero's default UK chart: 200 Sales,
// 260 Other Revenue, 300 Purchases, 310 Cost of Goods Sold, 404 Bank Fees,
// 630 Inventory; tax types OUTPUT2 / RROUTPUT / ZERORATEDOUTPUT / EXEMPTOUTPUT /
// NONE / REVERSECHARGES.

const REVENUE_TYPES = ["REVENUE", "SALES", "OTHERINCOME"];
const EXPENSE_TYPES = ["EXPENSE", "OVERHEADS", "DIRECTCOSTS"];
const FEE_FALLBACK_WORDS = ["merchant fee", "merchant account", "merchant", "processing fee", "card fee", "transaction fee", "bank fees", "bank charges", "bank fee"];

const ACCOUNT_RULES = [
  { key: "product_sales", types: REVENUE_TYPES, words: ["product sales", "sales of product", "sales"], avoid: ["other", "interest", "discount", "refund", "commission", "shipping", "postage"] },
  { key: "bespoke_service", types: REVENUE_TYPES, words: ["services", "service", "bespoke", "design", "labour", "consult"], avoid: ["commission", "discount", "refund", "interest"], fallbackWords: ["sales"], fallbackReason: "no service account; Sales" },
  { key: "shipping_income", types: REVENUE_TYPES, words: ["shipping", "postage", "delivery", "freight"] },
  { key: "discounts", types: REVENUE_TYPES.concat(EXPENSE_TYPES), words: ["discount"] },
  { key: "refunds", types: REVENUE_TYPES, words: ["refund"] },
  { key: "paypal_fees", types: EXPENSE_TYPES, words: ["paypal fee", "paypal"], fallbackWords: FEE_FALLBACK_WORDS },
  { key: "square_fees", types: EXPENSE_TYPES, words: ["square fee", "square"], fallbackWords: FEE_FALLBACK_WORDS },
  { key: "etsy_fees", types: EXPENSE_TYPES, words: ["etsy fee", "etsy", "marketplace fee"], fallbackWords: FEE_FALLBACK_WORDS },
  { key: "shopify_fees", types: EXPENSE_TYPES, words: ["shopify fee", "shopify"], fallbackWords: FEE_FALLBACK_WORDS },
  { key: "materials_purchase", types: ["DIRECTCOSTS", "EXPENSE", "OVERHEADS"], words: ["materials", "material", "supplies", "purchases"], avoid: ["cost of goods", "cost of sales"] },
  { key: "inventory_asset", types: ["INVENTORY", "CURRENT"], words: ["inventory", "stock"] },
  { key: "cogs", types: ["DIRECTCOSTS"], words: ["cost of goods", "cost of sales", "cogs"], avoid: ["purchases"] },
  { key: "clearing_paypal", types: ["CURRENT", "BANK"], words: ["paypal clearing", "paypal"] },
  { key: "clearing_square", types: ["CURRENT", "BANK"], words: ["square clearing", "square"] },
  { key: "clearing_shopify_payments", types: ["CURRENT", "BANK"], words: ["shopify clearing", "shopify payments", "shopify"] },
  { key: "clearing_etsy_payments", types: ["CURRENT", "BANK"], words: ["etsy clearing", "etsy payments", "etsy"] }
];

function suggestAccountMappings(accounts) {
  const active = (Array.isArray(accounts) ? accounts : []).filter((account) => account && account.active !== false);
  const out = {};
  for (const rule of ACCOUNT_RULES) {
    let best = null;
    for (const account of active) {
      const name = `${account.name} ${account.fullyQualifiedName}`.toLowerCase();
      if (rule.types.length && !rule.types.includes(String(account.accountType || "").toUpperCase())) continue;
      if ((rule.avoid || []).some((word) => name.includes(word))) continue;
      let score = 0;
      let reason = "";
      for (const word of rule.words) {
        if (name.includes(word)) { score += Math.min(60, 25 + word.length * 2); reason = `name matches "${word}"`; break; }
      }
      if (!score && rule.fallbackWords) {
        for (const word of rule.fallbackWords) {
          if (name.includes(word)) { score += 30; reason = rule.fallbackReason || `generic account "${word}"`; break; }
        }
      }
      if (rule.key.startsWith("clearing_") && !name.includes("clearing") && !name.includes(rule.key.replace("clearing_", "").split("_")[0])) continue;
      if (rule.key === "product_sales" && String(account.accountType || "").toUpperCase() === "SALES") score += 10;
      if (score > 0 && (!best || score > best.score)) best = { externalId: account.externalId, name: account.fullyQualifiedName || account.name, accountType: account.accountType, score, reason };
    }
    if (best) out[rule.key] = { ...best, confidence: Math.min(0.95, best.score / 100) };
  }
  return out;
}

// `prefer` is the Xero UK TaxType each NivaDesk treatment normally lands on;
// `revenue` says the code must be usable on a sales line. EC / import / CIS /
// domestic-reverse-charge codes are kept out of the plain domestic rules.
const TAX_AVOID = ["ec ", "ec goods", "ec services", "acquisition", "import", "cis ", "domestic reverse", "postponed"];
const TAX_RULES = [
  { key: "ST", rate: 20, prefer: ["OUTPUT2"], words: ["20% (vat on income)", "20% vat on income", "standard"], revenue: true, avoid: TAX_AVOID },
  { key: "RR", rate: 5, prefer: ["RROUTPUT"], words: ["5% (vat on income)", "5% vat on income", "reduced"], revenue: true, avoid: TAX_AVOID },
  { key: "ZR", rate: 0, prefer: ["ZERORATEDOUTPUT"], words: ["zero rated income", "zero rated"], revenue: true, avoid: TAX_AVOID.concat(["exempt", "no vat"]) },
  { key: "EX", rate: 0, prefer: ["EXEMPTOUTPUT"], words: ["exempt income", "exempt"], revenue: true, avoid: TAX_AVOID },
  { key: "OS", rate: 0, prefer: ["NONE"], words: ["no vat", "out of scope"], avoid: TAX_AVOID },
  { key: "NR", rate: 0, prefer: ["NONE"], words: ["no vat", "not registered"], avoid: TAX_AVOID },
  { key: "RC", rate: 20, prefer: ["REVERSECHARGES"], words: ["reverse charge"], avoid: ["domestic reverse", "cis "] },
  { key: "NV", rate: 0, prefer: ["NONE"], words: ["no vat", "no tax"], avoid: TAX_AVOID }
];

function suggestTaxMappings(taxCodes) {
  const active = (Array.isArray(taxCodes) ? taxCodes : []).filter((code) => code && code.active !== false && !code.hidden);
  const out = {};
  for (const rule of TAX_RULES) {
    let best = null;
    for (const code of active) {
      const name = `${code.name} ${code.description || ""}`.toLowerCase();
      if ((rule.avoid || []).some((word) => name.includes(word))) continue;
      if (rule.revenue && code.canApplyToRevenue === false) continue;
      let score = 0;
      let reason = "";
      if (rule.prefer.includes(String(code.externalId || "").toUpperCase())) { score += 60; reason = `Xero's ${code.externalId} code`; }
      const matchedWord = rule.words.find((word) => name.includes(word));
      if (matchedWord) { score += 35; reason = reason ? `${reason}, name` : `name matches "${matchedWord}"`; }
      if (Math.abs(num(code.effectiveSalesRate) - rule.rate) < 0.001) { score += 20; reason = reason ? `${reason}, rate ${rule.rate}%` : `rate ${rule.rate}%`; }
      if (score >= 55 && (!best || score > best.score)) best = { externalId: code.externalId, name: code.name, rate: num(code.effectiveSalesRate), score, reason };
    }
    if (best) out[rule.key] = { ...best, confidence: Math.min(0.95, best.score / 115) };
  }
  return out;
}

const { nameKey, duplicateContactCandidates } = require("../core/matching");

module.exports = {
  ID_FIELDS, RESOURCE_OF, CATALOG_ENTITIES, TRANSACTION_ENTITIES, INCREMENTAL_ENTITIES, DELETED_STATUSES, idOf, isDeleted,
  normalizeCompanyProfile, normalizeAccount, normalizeTaxRate, normalizeContact, asCustomer, asVendor, normalizeItem, normalizeTransaction, snapshotOf,
  suggestAccountMappings, suggestTaxMappings, duplicateContactCandidates, nameKey
};
