"use strict";

// QuickBooks entities → NivaDesk accounting snapshots. Pure: raw JSON in,
// small plain objects out. Nothing here touches Firestore, and nothing outside
// the quickbooks/ folder reads raw QuickBooks JSON (§18).

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
function refId(ref) {
  return ref && typeof ref === "object" ? text(ref.value, 60) : "";
}
function refName(ref) {
  return ref && typeof ref === "object" ? text(ref.name, 200) : "";
}
function updatedAt(raw) {
  return text(raw?.MetaData?.LastUpdatedTime, 40);
}
function syncToken(raw) {
  return text(raw?.SyncToken, 20);
}

// CompanyInfo + Preferences → what the wizard shows in "Verify the company".
function normalizeCompanyProfile(companyInfo = {}, preferences = {}) {
  const accounting = preferences.AccountingInfoPrefs || {};
  const currency = preferences.CurrencyPrefs || {};
  const tax = preferences.TaxPrefs || {};
  const fiscalStart = text(companyInfo.FiscalYearStartMonth || accounting.FirstMonthOfFiscalYear, 20);
  return {
    externalCompanyId: text(companyInfo.Id, 40),
    companyName: text(companyInfo.CompanyName, 200),
    legalName: text(companyInfo.LegalName, 200),
    country: text(companyInfo.Country, 8),
    homeCurrency: text(currency.HomeCurrency?.value, 8) || "GBP",
    multiCurrencyEnabled: bool(currency.MultiCurrencyEnabled, false),
    fiscalYearStartMonth: fiscalStart,
    bookCloseDate: text(accounting.BookCloseDate, 10),
    taxTrackingEnabled: bool(tax.UsingSalesTax, false),
    partnerTaxEnabled: bool(tax.PartnerTaxEnabled, false),
    companyStartDate: text(companyInfo.CompanyStartDate, 10),
    email: text(companyInfo.Email?.Address, 160),
    syncToken: syncToken(companyInfo),
    updatedAt: updatedAt(companyInfo)
  };
}

function normalizeAccount(raw = {}) {
  return {
    externalId: text(raw.Id, 40),
    name: text(raw.Name, 200),
    fullyQualifiedName: text(raw.FullyQualifiedName, 300),
    accountType: text(raw.AccountType, 60),
    accountSubType: text(raw.AccountSubType, 60),
    classification: text(raw.Classification, 30),
    accountNumber: text(raw.AcctNum, 40),
    currency: text(raw.CurrencyRef?.value, 8),
    active: bool(raw.Active, true),
    subAccount: bool(raw.SubAccount, false),
    parentId: refId(raw.ParentRef),
    currentBalance: num(raw.CurrentBalance),
    syncToken: syncToken(raw),
    updatedAt: updatedAt(raw)
  };
}

function normalizeTaxRate(raw = {}) {
  return {
    externalId: text(raw.Id, 40),
    name: text(raw.Name, 200),
    description: text(raw.Description, 300),
    rateValue: num(raw.RateValue),
    active: bool(raw.Active, true),
    specialTaxType: text(raw.SpecialTaxType, 40),
    syncToken: syncToken(raw),
    updatedAt: updatedAt(raw)
  };
}

function rateDetails(list, ratesById) {
  const rows = Array.isArray(list?.TaxRateDetail) ? list.TaxRateDetail : [];
  return rows.map((row) => {
    const id = refId(row.TaxRateRef);
    const rate = ratesById?.get?.(id) || null;
    return { rateId: id, name: rate ? rate.name : refName(row.TaxRateRef), rateValue: rate ? rate.rateValue : 0, taxOrder: num(row.TaxOrder), applicable: text(row.TaxTypeApplicable, 40) };
  });
}

// ratesById: Map<externalId, normalized TaxRate> so a code's effective rate is known.
function normalizeTaxCode(raw = {}, ratesById = new Map()) {
  const sales = rateDetails(raw.SalesTaxRateList, ratesById);
  const purchase = rateDetails(raw.PurchaseTaxRateList, ratesById);
  return {
    externalId: text(raw.Id, 40),
    name: text(raw.Name, 200),
    description: text(raw.Description, 300),
    active: bool(raw.Active, true),
    taxable: bool(raw.Taxable, true),
    taxGroup: bool(raw.TaxGroup, false),
    hidden: bool(raw.Hidden, false),
    salesRates: sales,
    purchaseRates: purchase,
    effectiveSalesRate: sales.reduce((acc, row) => acc + row.rateValue, 0),
    effectivePurchaseRate: purchase.reduce((acc, row) => acc + row.rateValue, 0),
    syncToken: syncToken(raw),
    updatedAt: updatedAt(raw)
  };
}

function normalizeCustomer(raw = {}) {
  return {
    externalId: text(raw.Id, 40),
    displayName: text(raw.DisplayName, 200),
    companyName: text(raw.CompanyName, 200),
    givenName: text(raw.GivenName, 100),
    familyName: text(raw.FamilyName, 100),
    email: text(raw.PrimaryEmailAddr?.Address, 160).toLowerCase(),
    phone: text(raw.PrimaryPhone?.FreeFormNumber, 40),
    currency: text(raw.CurrencyRef?.value, 8),
    balance: num(raw.Balance),
    active: bool(raw.Active, true),
    taxable: bool(raw.Taxable, true),
    syncToken: syncToken(raw),
    updatedAt: updatedAt(raw)
  };
}

function normalizeVendor(raw = {}) {
  return {
    externalId: text(raw.Id, 40),
    displayName: text(raw.DisplayName, 200),
    companyName: text(raw.CompanyName, 200),
    email: text(raw.PrimaryEmailAddr?.Address, 160).toLowerCase(),
    phone: text(raw.PrimaryPhone?.FreeFormNumber, 40),
    currency: text(raw.CurrencyRef?.value, 8),
    balance: num(raw.Balance),
    active: bool(raw.Active, true),
    vendor1099: bool(raw.Vendor1099, false),
    syncToken: syncToken(raw),
    updatedAt: updatedAt(raw)
  };
}

function normalizeItem(raw = {}) {
  return {
    externalId: text(raw.Id, 40),
    name: text(raw.Name, 200),
    fullyQualifiedName: text(raw.FullyQualifiedName, 300),
    sku: text(raw.Sku, 80),
    type: text(raw.Type, 30),
    description: text(raw.Description, 300),
    unitPrice: num(raw.UnitPrice),
    purchaseCost: num(raw.PurchaseCost),
    incomeAccountId: refId(raw.IncomeAccountRef),
    incomeAccountName: refName(raw.IncomeAccountRef),
    expenseAccountId: refId(raw.ExpenseAccountRef),
    expenseAccountName: refName(raw.ExpenseAccountRef),
    assetAccountId: refId(raw.AssetAccountRef),
    assetAccountName: refName(raw.AssetAccountRef),
    taxable: bool(raw.Taxable, false),
    trackQuantity: bool(raw.TrackQtyOnHand, false),
    quantityOnHand: num(raw.QtyOnHand),
    active: bool(raw.Active, true),
    syncToken: syncToken(raw),
    updatedAt: updatedAt(raw)
  };
}

// Posted-document snapshots (read-back only until phase 3 writes them).
function normalizeTransaction(entityType, raw = {}) {
  const lines = Array.isArray(raw.Line) ? raw.Line : [];
  return {
    externalId: text(raw.Id, 40),
    entityType: text(entityType, 40),
    docNumber: text(raw.DocNumber, 40),
    txnDate: text(raw.TxnDate, 10),
    dueDate: text(raw.DueDate, 10),
    totalAmount: num(raw.TotalAmt),
    balance: num(raw.Balance),
    currency: text(raw.CurrencyRef?.value, 8),
    exchangeRate: raw.ExchangeRate === undefined ? null : num(raw.ExchangeRate),
    customerId: refId(raw.CustomerRef),
    customerName: refName(raw.CustomerRef),
    vendorId: refId(raw.VendorRef),
    vendorName: refName(raw.VendorRef),
    privateNote: text(raw.PrivateNote, 300),
    lineCount: lines.length,
    totalTax: num(raw.TxnTaxDetail?.TotalTax),
    linkedTxns: (Array.isArray(raw.LinkedTxn) ? raw.LinkedTxn : []).map((link) => ({ id: text(link.TxnId, 40), type: text(link.TxnType, 40) })),
    voided: text(raw.PrivateNote, 40).toLowerCase().startsWith("voided") || (num(raw.TotalAmt) === 0 && lines.length === 0),
    syncToken: syncToken(raw),
    updatedAt: updatedAt(raw)
  };
}

const CATALOG_ENTITIES = Object.freeze(["Account", "TaxCode", "TaxRate", "Customer", "Vendor", "Item"]);
const TRANSACTION_ENTITIES = Object.freeze([
  "Invoice", "Payment", "SalesReceipt", "CreditMemo", "RefundReceipt", "Estimate", "Bill", "BillPayment", "Purchase",
  "VendorCredit", "JournalEntry", "Deposit", "Transfer"
]);

function snapshotOf(entityType, raw, { ratesById } = {}) {
  switch (entityType) {
    case "Account": return normalizeAccount(raw);
    case "TaxCode": return normalizeTaxCode(raw, ratesById);
    case "TaxRate": return normalizeTaxRate(raw);
    case "Customer": return normalizeCustomer(raw);
    case "Vendor": return normalizeVendor(raw);
    case "Item": return normalizeItem(raw);
    case "CompanyInfo": return normalizeCompanyProfile(raw, {});
    default: return TRANSACTION_ENTITIES.includes(entityType) ? normalizeTransaction(entityType, raw) : { externalId: text(raw?.Id, 40), entityType, syncToken: syncToken(raw), updatedAt: updatedAt(raw) };
  }
}

// ---------------------------------------------------------------------------
// Suggestions. NivaDesk proposes, a person confirms (§4.2 step 6): every
// suggestion carries a reason and a confidence and nothing is written by these.

const FEE_FALLBACK_WORDS = ["merchant account fee", "merchant fee", "merchant", "processing fee", "card fee", "transaction fee", "bank charges", "bank fees"];

const ACCOUNT_RULES = [
  { key: "product_sales", subTypes: ["SalesOfProductIncome"], types: ["Income"], words: ["sales of product", "product sales", "sales", "product"], avoid: ["discount", "refund", "commission"] },
  // "Commission Income" also carries the ServiceFeeIncome sub-type in Intuit's
  // GB sandbox; a bespoke job is a service, never a commission.
  { key: "bespoke_service", subTypes: ["ServiceFeeIncome"], types: ["Income"], words: ["services", "service", "bespoke", "design", "labour"], avoid: ["commission", "discount", "refund", "billable"] },
  { key: "shipping_income", subTypes: [], types: ["Income"], words: ["shipping", "postage", "delivery"] },
  { key: "discounts", subTypes: ["DiscountsRefundsGiven"], types: ["Income"], words: ["discount"] },
  { key: "refunds", subTypes: ["DiscountsRefundsGiven"], types: ["Income"], words: ["refund"] },
  // Fees: a provider-named account wins; otherwise the company's generic
  // merchant / card / processing fee account is the honest fallback.
  { key: "paypal_fees", subTypes: ["BankCharges"], types: ["Expense", "Cost of Goods Sold"], words: ["paypal fee", "paypal"], fallbackWords: FEE_FALLBACK_WORDS },
  { key: "square_fees", subTypes: ["BankCharges"], types: ["Expense", "Cost of Goods Sold"], words: ["square fee", "square"], fallbackWords: FEE_FALLBACK_WORDS },
  { key: "etsy_fees", subTypes: ["BankCharges"], types: ["Expense", "Cost of Goods Sold"], words: ["etsy fee", "etsy", "marketplace fee"], fallbackWords: FEE_FALLBACK_WORDS },
  { key: "shopify_fees", subTypes: ["BankCharges"], types: ["Expense", "Cost of Goods Sold"], words: ["shopify fee", "shopify"], fallbackWords: FEE_FALLBACK_WORDS },
  { key: "materials_purchase", subTypes: ["SuppliesMaterials", "SuppliesMaterialsCogs"], types: ["Expense", "Cost of Goods Sold"], words: ["material", "supplies", "purchases"] },
  { key: "inventory_asset", subTypes: ["Inventory"], types: ["Other Current Asset"], words: ["inventory", "stock"] },
  { key: "cogs", subTypes: ["SuppliesMaterialsCogs", "CostOfLaborCos", "OtherCostsOfServiceCos"], types: ["Cost of Goods Sold"], words: ["cost of goods", "cost of sales", "cogs"], avoid: ["billable"] },
  { key: "clearing_paypal", subTypes: [], types: ["Other Current Asset", "Bank"], words: ["paypal clearing", "paypal"] },
  { key: "clearing_square", subTypes: [], types: ["Other Current Asset", "Bank"], words: ["square clearing", "square"] },
  { key: "clearing_shopify_payments", subTypes: [], types: ["Other Current Asset", "Bank"], words: ["shopify clearing", "shopify payments"] },
  { key: "clearing_etsy_payments", subTypes: [], types: ["Other Current Asset", "Bank"], words: ["etsy clearing", "etsy payments"] }
];

function suggestAccountMappings(accounts) {
  const active = (Array.isArray(accounts) ? accounts : []).filter((account) => account && account.active !== false);
  const out = {};
  for (const rule of ACCOUNT_RULES) {
    let best = null;
    for (const account of active) {
      const name = `${account.name} ${account.fullyQualifiedName}`.toLowerCase();
      const typeOk = rule.types.length === 0 || rule.types.includes(account.accountType);
      if (!typeOk) continue;
      if ((rule.avoid || []).some((word) => name.includes(word))) continue;
      let score = 0;
      let reason = "";
      if (rule.subTypes.includes(account.accountSubType)) { score += 50; reason = `type ${account.accountSubType}`; }
      let matched = false;
      for (const word of rule.words) {
        if (name.includes(word)) { score += Math.min(45, 12 + word.length * 2); reason = reason ? `${reason}, name` : `name matches "${word}"`; matched = true; break; }
      }
      if (!matched && rule.fallbackWords) {
        for (const word of rule.fallbackWords) {
          if (name.includes(word)) { score += 30; reason = reason ? `${reason}, generic fee account` : `generic fee account "${word}"`; matched = true; break; }
        }
      }
      if (rule.key.startsWith("clearing_") && !name.includes("clearing") && !name.includes(rule.key.replace("clearing_", "").split("_")[0])) continue;
      if (score > 0 && (!best || score > best.score)) best = { externalId: account.externalId, name: account.fullyQualifiedName || account.name, accountType: account.accountType, score, reason };
    }
    if (best) out[rule.key] = { ...best, confidence: Math.min(0.95, best.score / 100) };
  }
  return out;
}

// `avoid` keeps the EC-acquisition and reverse-charge codes (which also read
// "zero rated ..." in their descriptions) away from the plain domestic rules;
// `prefer` is the code name Intuit's UK companies actually use.
const TAX_RULES = [
  { key: "ST", rate: 20, words: ["standard", "20%", "20.0%"], avoid: ["ec ", "ecg", "ecs", " rc", "reverse"], prefer: /^20\.0% s$/ },
  { key: "RR", rate: 5, words: ["reduced", "5%", "5.0%"], avoid: ["ec ", "ecg", "ecs", " rc", "reverse"], prefer: /^5\.0% r$/ },
  { key: "ZR", rate: 0, words: ["zero", "0%", "0.0% z"], avoid: ["ec ", "ecg", "ecs", " rc", "reverse", "exempt", "no vat"], prefer: /^0\.0% z$/ },
  { key: "EX", rate: 0, words: ["exempt"], avoid: ["ecg", "ecs", "reverse"] },
  { key: "OS", rate: 0, words: ["out of scope", "outside", "no vat"], avoid: ["ecg", "ecs", "reverse"] },
  { key: "NR", rate: 0, words: ["no vat", "not registered", "out of scope"], avoid: ["ecg", "ecs", "reverse"] },
  { key: "RC", rate: 20, words: ["reverse charge", "reverse", " rc"], prefer: /^20\.0% rc$/ },
  { key: "NV", rate: 0, words: ["no vat", "no tax", "out of scope"], avoid: ["ecg", "ecs", "reverse"] }
];

function suggestTaxMappings(taxCodes) {
  const active = (Array.isArray(taxCodes) ? taxCodes : []).filter((code) => code && code.active !== false && !code.hidden);
  const out = {};
  for (const rule of TAX_RULES) {
    let best = null;
    for (const code of active) {
      const codeName = String(code.name || "").toLowerCase();
      const name = `${code.name} ${code.description}`.toLowerCase();
      if ((rule.avoid || []).some((word) => name.includes(word))) continue;
      let score = 0;
      let reason = "";
      const matchedWord = rule.words.find((word) => name.includes(word));
      if (matchedWord) { score += 55; reason = `name matches "${matchedWord}"`; }
      if (Math.abs(code.effectiveSalesRate - rule.rate) < 0.001) { score += 30; reason = reason ? `${reason}, rate ${rule.rate}%` : `rate ${rule.rate}%`; }
      if (rule.key === "ST" && !matchedWord && Math.abs(code.effectiveSalesRate - 20) < 0.001) score += 10;
      if (rule.prefer && rule.prefer.test(codeName.trim())) { score += 10; reason = `${reason}, the usual UK code`; }
      if (score >= 55 && (!best || score > best.score)) best = { externalId: code.externalId, name: code.name, rate: code.effectiveSalesRate, score, reason };
    }
    if (best) out[rule.key] = { ...best, confidence: Math.min(0.95, best.score / 100) };
  }
  return out;
}

function nameKey(value) {
  return String(value || "").toLowerCase().replace(/\b(ltd|limited|llc|inc|plc)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

// §4.2 step 7 — candidates, never merges. Name equality alone is a reason to
// look, not to link.
function duplicateContactCandidates(local, remote, { limit = 200 } = {}) {
  const byName = new Map();
  const byEmail = new Map();
  for (const row of Array.isArray(remote) ? remote : []) {
    const key = nameKey(row.displayName || row.companyName);
    if (key) byName.set(key, (byName.get(key) || []).concat(row));
    if (row.email) byEmail.set(String(row.email).toLowerCase(), (byEmail.get(String(row.email).toLowerCase()) || []).concat(row));
  }
  const out = [];
  for (const row of Array.isArray(local) ? local : []) {
    const candidates = new Map();
    const email = String(row.email || "").toLowerCase();
    if (email && byEmail.has(email)) for (const hit of byEmail.get(email)) candidates.set(hit.externalId, { externalId: hit.externalId, displayName: hit.displayName, reason: "same_email", score: 90 });
    const key = nameKey(row.name || row.displayName);
    if (key && byName.has(key)) for (const hit of byName.get(key)) if (!candidates.has(hit.externalId)) candidates.set(hit.externalId, { externalId: hit.externalId, displayName: hit.displayName, reason: "same_name", score: 70 });
    if (candidates.size) out.push({ localId: String(row.id || ""), localName: String(row.name || row.displayName || ""), localEmail: email, candidates: Array.from(candidates.values()).sort((a, b) => b.score - a.score) });
    if (out.length >= limit) break;
  }
  return out;
}

module.exports = {
  normalizeCompanyProfile, normalizeAccount, normalizeTaxRate, normalizeTaxCode, normalizeCustomer, normalizeVendor, normalizeItem,
  normalizeTransaction, snapshotOf, CATALOG_ENTITIES, TRANSACTION_ENTITIES, suggestAccountMappings, suggestTaxMappings,
  duplicateContactCandidates, nameKey
};
