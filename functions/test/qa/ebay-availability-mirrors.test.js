// The eBay rollout gate reaches every client the same way: the server says whether THIS workspace may connect
// (getEbayConnections.workspaceEnabled, the same gates beginEbayConnect applies), and each client — web, Mac/iPhone,
// Android — stops offering Connect and shows the card as planned/"not available for this workspace yet" when it is
// false, while an absent field (an older server) keeps the previous behaviour. Pinned by text on all four sources so
// the three mirrors cannot drift apart silently.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
let failures = 0;
function check(name, fn) { try { fn(); console.log("PASS ", name); } catch (error) { failures += 1; console.log("FAIL ", name, "-", String(error.message).split("\n")[0].slice(0, 240)); } }

check("server: getEbayConnections carries workspaceEnabled from the same four gates as beginEbayConnect; configured is untouched", () => {
  const src = read("functions/ebayConnector.js");
  assert.ok(src.includes('const workspaceEnabled = connectorOn() && configured() && (await providerFlagOn()) && flagsModule.workspaceEnabled(flags, "connectors", "ebay", companyId);'));
  assert.ok(src.includes("configured: configured() && connectorOn(), workspaceEnabled, environment: env()"));
});
check("web: the reader defaults an absent field to true, the section shows the sentence instead of Connect, the hub reads planned", () => {
  assert.ok(read("studioflow-web/lib/studioflow/ebay.ts").includes("workspaceEnabled: data.workspaceEnabled !== false"));
  const section = read("studioflow-web/app/settings/EbayIntegrationSection.tsx");
  assert.ok(section.includes("if (!workspaceEnabled && !connection) {") && section.includes('t("eBay is not available for this workspace yet.")'));
  assert.ok(section.indexOf("if (!workspaceEnabled && !connection) {") < section.indexOf('t("Connect eBay")'), "the not-available card comes before the Connect card");
  const hub = read("studioflow-web/lib/studioflow/integrations.ts");
  assert.ok(hub.includes('if (live.length === 0) return { state: signals.ebayWorkspaceEnabled === false ? "planned" : "available" };'));
  assert.ok(hub.includes('ebayWorkspaceEnabled: ebay.status === "fulfilled" ? ebay.value.workspaceEnabled !== false : true,'));
  assert.ok(read("studioflow-web/lib/studioflow/language.ts").includes('"eBay is not available for this workspace yet.": {'), "eleven-language string on the web");
});
check("Mac/iPhone: the same three pieces, absent field → true", () => {
  assert.ok(read("EGGcraft/EbayIntegration.swift").includes('(data["workspaceEnabled"] as? Bool) ?? true'));
  const view = read("EGGcraft/EbayIntegrationView.swift");
  assert.ok(view.includes("} else if !workspaceEnabled {") && view.includes('tr("eBay is not available for this workspace yet.")'));
  assert.ok(view.indexOf("} else if !workspaceEnabled {") < view.indexOf("EbayConnectCard("), "checked before the Connect card");
  assert.ok(read("EGGcraft/NivaDeskIntegrations.swift").includes("if signals.ebayConnections == 0 { return signals.ebayWorkspaceEnabled ? .available : .planned }"));
  assert.ok(read("EGGcraft/AyarlarView.swift").includes('integrationSignals.ebayWorkspaceEnabled = ((result?.data as? [String: Any])?["workspaceEnabled"] as? Bool) ?? true'));
  assert.strictEqual((read("EGGcraft/DilMotoru.swift").match(/"eBay is not available for this workspace yet\.": \[/g) || []).length, 1, "one dictionary entry, no duplicate");
});
check("Android: repository default true, the detail screen's card before Connect, the hub reads Planned", () => {
  const repo = read("studioflow-android/app/src/main/java/uk/co/eggcraft/studioflow/data/firebase/StudioFlowRepository.kt");
  assert.ok(repo.includes('workspaceEnabled = raw["workspaceEnabled"] as? Boolean ?: true,'));
  const screen = read("studioflow-android/app/src/main/java/uk/co/eggcraft/studioflow/features/settings/SettingsScreen.kt");
  assert.ok(screen.includes("if (!workspaceEnabled && connection == null) {") && screen.includes('t("eBay is not available for this workspace yet.")'));
  assert.ok(screen.indexOf("if (!workspaceEnabled && connection == null) {") < screen.indexOf('t("Connect eBay")'), "before the Connect button");
  assert.ok(screen.includes("ebayWorkspaceEnabled = ebayResult?.workspaceEnabled ?: true,"));
  assert.ok(read("studioflow-android/app/src/main/java/uk/co/eggcraft/studioflow/features/settings/IntegrationsHub.kt").includes("if (signals.ebayConnections == 0) return if (signals.ebayWorkspaceEnabled) IntegrationState.Available else IntegrationState.Planned"));
  assert.ok(read("studioflow-android/app/src/main/java/uk/co/eggcraft/studioflow/language/StudioTranslations.kt").includes('"eBay is not available for this workspace yet." to mapOf('));
});
console.log(failures ? `\n❌ EBAY AVAILABILITY MIRRORS: ${failures} FAIL` : "\n✅ EBAY AVAILABILITY MIRRORS GEÇTİ");
process.exit(failures ? 1 : 0);
