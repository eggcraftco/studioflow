// Settings audit diff: what one trigger run records for a given before/after.
const assert = require("assert");
const { settingsAuditDiff, areaForKey } = require("../../settingsAudit");

function pass(name) { console.log("PASS ", name); }

// 1. A plain change is recorded with values and attributed via the stamp.
{
  const diff = settingsAuditDiff(
    { financialShowBaseCost: true, selectedCurrency: "GBP" },
    { financialShowBaseCost: false, selectedCurrency: "GBP", lastSettingsWriteByUid: "uid-1" }
  );
  assert(diff, "diff exists");
  assert.deepStrictEqual(diff.changedKeys, ["financialShowBaseCost"]);
  assert.strictEqual(diff.byUid, "uid-1");
  assert.deepStrictEqual(diff.values, [{ key: "financialShowBaseCost", from: "on", to: "off" }]);
  assert.deepStrictEqual(diff.areas, ["Financial"]);
  pass("plain change with stamp");
}

// 2. Pure bookkeeping saves are ignored — no entry, no noise.
{
  const diff = settingsAuditDiff(
    { brandingUpdatedAt: 1, lastBackupExportedAtMs: 5 },
    { brandingUpdatedAt: 2, lastBackupExportedAtMs: 9, lastSettingsWriteByUid: "uid-1" }
  );
  assert.strictEqual(diff, null);
  pass("bookkeeping-only save skipped");
}

// 3. Per-area ...UpdatedByUid fields attribute when the universal stamp is absent.
{
  const diff = settingsAuditDiff(
    { portalAccentColor: "" },
    { portalAccentColor: "#2f6f6d", portalBrandingUpdatedByUid: "uid-9" }
  );
  assert(diff);
  assert.strictEqual(diff.byUid, "uid-9");
  assert.deepStrictEqual(diff.changedKeys, ["portalAccentColor"]);
  pass("area stamp attribution");
}

// 4. Secrets never print values; key rotation marker IS surfaced.
{
  const diff = settingsAuditDiff(
    { hasOpenAIKey: true },
    { hasOpenAIKey: true, openAIKeyRotatedAtMs: 123, lastSettingsWriteByUid: "uid-2" }
  );
  assert(diff);
  assert(diff.changedKeys.includes("openAIKeyRotatedAtMs"));
  assert(!diff.values.some((row) => row.key === "openAIKeyRotatedAtMs"), "rotation marker prints no value");
  assert(diff.areas.includes("AI Reply"));
  pass("key rotation visible, value silent");
}

// 5. JSON blobs list the key but not the blob; long strings truncate.
{
  const diff = settingsAuditDiff(
    { financialExpenseItemsJSON: "[1]", footerNote: "a".repeat(100) },
    { financialExpenseItemsJSON: "[1,2]", footerNote: "b".repeat(100) }
  );
  assert(diff);
  assert(!diff.values.some((row) => row.key === "financialExpenseItemsJSON"));
  const footer = diff.values.find((row) => row.key === "footerNote");
  assert(footer && footer.to.length === 58 && footer.to.endsWith("…"));
  assert.strictEqual(diff.byUid, "", "unstamped save records no actor");
  pass("blobs silent, strings truncated, unstamped is anonymous");
}

// 6. Area mapping spot checks.
assert.strictEqual(areaForKey("pdfShowCustomer"), "PDF");
assert.strictEqual(areaForKey("showCardFinancial"), "Workflow & cards");
assert.strictEqual(areaForKey("dashboardWidgetVisibilityJSON"), "Dashboard");
assert.strictEqual(areaForKey("somethingNobodyMapped"), "Other");
pass("area mapping");

console.log("\n✅ SETTINGS AUDIT GEÇTİ");
