"use strict";

/**
 * Who may read the accounting state.
 *
 * This was one line inside `requireReader` in accountingFunctions.js, which
 * meant anything else wanting the same answer — the assistant, and later the
 * WhatsApp channel — had to write its own version of it. Two versions of a
 * permission rule is one version too many, so the rule is lifted here and both
 * sides call it.
 *
 * It is deliberately STRICTER than the `bankFeed` workspace area: the area can
 * be granted through a custom role's access map, while this asks for the
 * explicit per-member grant (`memberAccess[uid].bankFeed === true`) or
 * ownership. The accounting callables have always worked that way, and an
 * assistant must not be the looser door into the same data.
 *
 * `uidIsCompanyOwner` is injected so this module stays free of firebase-admin.
 */

function accountingReaderCanRead(companyData = {}, uid = "", { uidIsCompanyOwner } = {}) {
  const cleanUid = String(uid || "").trim();
  if (!cleanUid) return false;
  if (typeof uidIsCompanyOwner === "function" && uidIsCompanyOwner(companyData, cleanUid)) return true;
  const access = companyData && companyData.memberAccess && companyData.memberAccess[cleanUid];
  return Boolean(access && access.bankFeed === true);
}

module.exports = { accountingReaderCanRead };
