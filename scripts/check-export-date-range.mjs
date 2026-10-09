// Export page → "Export invoices to CSV": the date-range picker (8 Oct 2026).
//
// The calendar icon used to be absolutely positioned over the select's left
// padding. Safari's native menulist ignores that padding, so the selected text
// was drawn under the icon; in Arabic (dir=rtl) the browser's own arrow moved
// to the left and sat on the icon; a long preset label had no truncation.
// Now the icon, the select and the chevron are one flex row with a gap, the
// select text truncates with an ellipsis and carries the full label in
// `title`, and the field has a minimum width. Static: reads the component and
// the stylesheet, probes the labels through the real studioT.
//
//   node scripts/check-export-date-range.mjs
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
let checks = 0;
const expect = (name, actual, wanted) => {
  checks += 1;
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) failures.push(`${name}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(wanted)}`);
};
const has = (name, text, pattern) => {
  checks += 1;
  if (!pattern.test(text)) failures.push(`${name}: ${pattern} not found`);
};
const hasNot = (name, text, pattern) => {
  checks += 1;
  if (pattern.test(text)) failures.push(`${name}: ${pattern} is still there`);
};
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const panel = read("components/ExportOrdersPanel.tsx");
const css = read("app/globals.css");

// ---- the component
const field = panel.slice(panel.indexOf("function ExportDateRangeField("), panel.indexOf("function ChevronIcon("));
has("the picker is its own component", panel, /function ExportDateRangeField\(/);
has("icon, select and chevron are rendered in order", field, /export-range-field-icon[\s\S]*<select[\s\S]*export-range-field-select[\s\S]*export-range-field-chevron/);
has("the row carries the full label as a title", field, /<div className="export-range-field" title=\{label\}/);
has("the select carries the full label as a title too", field, /className="export-range-field-select"[\s\S]{0,120}title=\{label\}/);
has("the icon is hidden from assistive tech", field, /export-range-field-icon" aria-hidden="true"/);
has("the chevron is hidden from assistive tech", field, /export-range-field-chevron" aria-hidden="true"/);
has("the label is tied to the select", panel, /htmlFor="export-orders-range"/);
has("the select has that id", panel, /id="export-orders-range"/);
has("the Report label is tied to its select", panel, /htmlFor="export-orders-report"[\s\S]{0,200}id="export-orders-report"/);
has("the selected preset's label is resolved for the title", panel, /const selectedPresetLabel = t\(PRESETS\.find\(\(option\) => option\.id === preset\)\?\.label \?\? ""\)/);
has("the picker receives it", panel, /<ExportDateRangeField[\s\S]{0,200}label=\{selectedPresetLabel\}/);
has("preset labels pass through t()", panel, /\{t\(option\.label\)\}/);
has("Date range label passes through t()", panel, /\{t\("Date range"\)\}/);
has("Report label passes through t()", panel, /\{t\("Report"\)\}/);
has("From passes through t()", panel, /\{t\("From"\)\}/);
has("To passes through t()", panel, /\{t\("To"\)\}/);
hasNot("no icon floats over the select any more", panel, /position: "absolute", left: 12/);
hasNot("no padding reserved for a floating icon", panel, /paddingLeft: 38/);
has("the grid cells may shrink below their content", panel, /<div style=\{\{ minWidth: 0 \}\}>\s*<label style=\{labelStyle\} htmlFor="export-orders-report"/);

// ---- the stylesheet
const block = css.slice(css.indexOf("/* Export page: the date-range picker"), css.indexOf("/* PDF Export */"));
expect("the picker's rules are in the stylesheet", block.length > 0, true);
has("row: flex", block, /\.export-range-field \{[^}]*display: flex;/);
has("row: centred", block, /\.export-range-field \{[^}]*align-items: center;/);
has("row: gap", block, /\.export-range-field \{[^}]*gap: 10px;/);
has("row: minimum width", block, /\.export-range-field \{[^}]*min-width: 160px;/);
has("row: focus ring", block, /\.export-range-field:focus-within \{/);
has("icon and chevron never shrink", block, /\.export-range-field-icon,\s*\.export-range-field-chevron \{[^}]*flex: 0 0 auto;/);
has("select: takes the remaining width", block, /\.export-range-field-select \{[^}]*flex: 1 1 auto;/);
has("select: may shrink", block, /\.export-range-field-select \{[^}]*min-width: 0;/);
has("select: truncates", block, /\.export-range-field-select \{[^}]*text-overflow: ellipsis;/);
has("select: single line", block, /\.export-range-field-select \{[^}]*white-space: nowrap;/);
has("select: overflow hidden", block, /\.export-range-field-select \{[^}]*overflow: hidden;/);
has("select: native arrow removed (the chevron replaces it, so RTL cannot stack two)", block, /\.export-range-field-select \{[^}]*appearance: none;/);
has("select: WebKit arrow removed", block, /-webkit-appearance: none;/);
hasNot("no physical left/right offsets (the row mirrors with dir=rtl)", block, /\b(left|right|padding-left|padding-right|margin-left|margin-right):/);

// ---- the labels, in all eleven languages
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "export-date-range-"));
const compile = (rel, name) => {
  const js = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText
    .replace(/from "\.\/(\w+)"/g, 'from "./$1.mjs"');
  fs.writeFileSync(path.join(tmp, `${name}.mjs`), js);
};
for (const name of ["language", "macTranslations", "settingsContentTranslations", "shippingTranslations", "trackingEmailTranslations"]) compile(`lib/studioflow/${name}.ts`, name);
const { studioT, SUPPORTED_STUDIO_LANGUAGES } = await import(pathToFileURL(path.join(tmp, "language.mjs")).href);
const languages = SUPPORTED_STUDIO_LANGUAGES.filter((language) => language !== "English");
expect("eleven languages besides English", languages.length, 11);
const presetLabels = [...panel.matchAll(/\{ id: "\w+", label: "([^"]+)" \}/g)].map((match) => match[1]);
expect("seven presets read from the source", presetLabels.length, 7);
for (const key of [...presetLabels, "Date range", "Report", "From", "To"]) {
  const missing = languages.filter((language) => studioT(key, language) === key);
  expect(`"${key}" translated everywhere`, missing, []);
}
// The longest label decides whether truncation matters; it must be a real
// sentence in the wide scripts too, not an English fallback.
const longest = Math.max(...languages.flatMap((language) => presetLabels.map((label) => studioT(label, language).length)));
expect("some preset label is long enough to need truncation on a narrow screen", longest >= 18, true);

if (failures.length) {
  console.error(`check-export-date-range: ${failures.length} of ${checks} checks failed`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`check-export-date-range: ${checks} checks passed`);
