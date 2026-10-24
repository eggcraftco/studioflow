/**
 * Etsy guide section — the promises match what the connector really does (24 Oct 2026).
 * Imports the real guide (getGuideTree), no copies of the text under test.
 *
 * Real behaviour: one Etsy shop per workspace; history 30 / 90 (default) / 12 months;
 * Etsy webhook + an hourly check; the buyer email is often missing; Preview changes
 * nothing in the workspace; a corrected customer name / design name / address is kept
 * (Etsy's copy shows in the Etsy panel); Disconnect destroys the token and removes
 * Etsy's copy + the remembered buyer matches, orders stay.
 *
 * For each of the 12 guide languages:
 *  1. none of the old promises is in the Etsy section (15 minutes, two years, more
 *     than one shop, "writes nothing", "the buyer email Etsy provides");
 *  2. the seven corrected English lines are in TREE_EN and every one of them is
 *     translated (no English fallback) in each GUIDE_T language;
 *  3. no GUIDE_T dictionary still carries the seven old English keys;
 *  4. Türkçe carries the seven corrected Turkish lines.
 *
 * Run: npx tsx scripts/check-etsy-guide-claims.mts
 */
import { getGuideTree } from "../lib/publicSite/guide";
import { GUIDE_T } from "../lib/publicSite/guideTranslations";
import type { GuideNode } from "../lib/publicSite/guideChrome";
import { SUPPORTED_STUDIO_LANGUAGES } from "../lib/studioflow/language";

const OLD_EN = [
  "The access is read-only: your orders, your shop details, and the buyer email Etsy provides. NivaDesk cannot touch your listings, your prices or anything else in your shop.",
  "More than one shop can be connected to the same workspace.",
  "How far back to look starts at 90 days, and can reach back as far as two years.",
  "Preview writes nothing at all. It shows every order it found and what it would do with each one.",
  "NivaDesk checks your shop every fifteen minutes on its own. Sync now is there for when you would rather not wait.",
  "Your production work is yours — stages, notes, schedule, files, everything you add here — and a sync never writes over it.",
  "Disconnect says what will happen before it happens: syncing stops, and the stored Etsy access is destroyed."
];
const NEW_EN = [
  "The access is read-only: your orders and your shop details (and the buyer's email when Etsy shares one — often it does not). NivaDesk cannot touch your listings, your prices or anything else in your shop.",
  "One Etsy shop per workspace at the moment.",
  "How far back to look: the last 30 days, 90 days (the default) or 12 months.",
  "Preview changes nothing in your workspace. It shows every order it found and what it would do with each one.",
  "Etsy tells NivaDesk about new and changed orders as they happen, and NivaDesk also checks your shop about once an hour to catch anything missed. Sync now is there for when you would rather not wait.",
  "Your production work is yours — stages, notes, schedule, files, everything you add here — and a sync never writes over it. If you correct the customer's name, the design name or the delivery address, your version stays; Etsy's own copy stays visible in the Etsy panel on the order.",
  "Disconnect says what will happen before it happens: syncing stops, the stored Etsy access is destroyed, and Etsy's copy of the order details and the remembered buyer matches are removed from NivaDesk."
];
const NEW_TR = [
  "Erişim salt okunurdur: siparişleriniz ve mağaza bilgileriniz (Etsy paylaşıyorsa alıcının e-postası — çoğu zaman paylaşmaz). NivaDesk ilanlarınıza, fiyatlarınıza ya da mağazanızdaki başka bir şeye dokunamaz.",
  "Şimdilik bir çalışma alanına bir Etsy mağazası bağlanır.",
  "Ne kadar geriye bakılacağı: son 30 gün, 90 gün (varsayılan) ya da 12 ay.",
  "Önizleme çalışma alanınızda hiçbir şeyi değiştirmez. Bulduğu her siparişi ve her biriyle ne yapacağını gösterir.",
  "Etsy yeni ve değişen siparişleri olduğu anda NivaDesk'e bildirir; NivaDesk ayrıca kaçanı yakalamak için mağazanızı yaklaşık saatte bir kontrol eder. Beklemek istemediğinizde Sync now orada.",
  "Üretim işiniz sizindir — aşamalar, notlar, takvim, dosyalar, buraya eklediğiniz her şey — ve senkronizasyon bunların üzerine asla yazmaz. Müşteri adını, tasarım adını ya da teslimat adresini düzeltirseniz sizin hâliniz kalır; Etsy'nin kendi kopyası siparişteki Etsy panelinde görünür.",
  "Disconnect, olmadan önce ne olacağını söyler: senkronizasyon durur, saklanan Etsy erişimi yok edilir ve sipariş ayrıntılarının Etsy kopyası ile hatırlanan alıcı eşleşmeleri NivaDesk'ten kaldırılır."
];

// Old promises, as they were worded in each language (case-insensitive).
const STALE: Record<string, RegExp> = {
  "15 minutes": /fifteen minutes|15 minutes|on beş dakika|15 dakika|fünfzehn Minuten|15 Minuten|quinze minutes|quindici minuti|quince minutos|quinze minutos|пятнадцать минут|15 минут|十五分|15 ?分|خمس عشرة دقيقة|١٥ دقيقة|पंद्रह मिनट|15 मिनट/i,
  "two years": /two years|iki yıl|zwei Jahre|deux ans|due anni|dos años|dois anos|двух лет|два года|二年|两年|2 ?年|سنتين|दो साल/i,
  "several shops": /more than one shop|birden fazla mağaza|mehr als ein Shop|plusieurs boutiques|più di un negozio|más de una tienda|mais de uma loja|несколько магазинов|複数のショップ|不止一家店铺|أكثر من متجر|एक से ज़्यादा दुकानें/i,
  "writes nothing": /writes nothing|hiçbir şey yazmaz|schreibt überhaupt nichts|n'écrit absolument rien|non scrive assolutamente nulla|no escribe absolutamente nada|não escreve absolutamente nada|не пишет вообще ничего|何ひとつ書き込みません|完全不写入|لا تكتب شيئًا|कुछ भी नहीं लिखता/i,
  "buyer email always": /buyer email Etsy provides|Etsy'nin verdiği alıcı e-postası|Käufer-E-Mail, die Etsy bereitstellt|e-mail acheteur fourni par Etsy|email dell'acquirente fornita da Etsy|correo del comprador que facilita Etsy|e-mail do comprador que o Etsy fornece|адрес покупателя, который предоставляет Etsy|Etsy が提供する購入者のメールアドレス|Etsy 提供的买家邮箱|بريد المشتري الذي يوفّره إتسي|Etsy का दिया खरीदार ईमेल/i
};

function findNode(nodes: GuideNode[], id: string): GuideNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const hit = node.children ? findNode(node.children, id) : undefined;
    if (hit) return hit;
  }
  return undefined;
}
function lines(node: GuideNode): string[] {
  const out = [node.title];
  for (const block of node.blocks) {
    if (block.kind === "bullets" || block.kind === "steps") out.push(...block.items);
    else out.push(block.text);
  }
  return out;
}

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed += 1; console.log(`PASS ${name}`); }
  else { failed += 1; console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
}

const enEtsy = findNode(getGuideTree("English"), "set-etsy");
check("English tree has the set-etsy section", Boolean(enEtsy));
const enLines = enEtsy ? lines(enEtsy) : [];
const missingNew = NEW_EN.filter(line => !enLines.includes(line));
check("English: the seven corrected lines are in the Etsy section", missingNew.length === 0, `${missingNew.length} missing`);

for (const language of SUPPORTED_STUDIO_LANGUAGES) {
  const node = findNode(getGuideTree(language), "set-etsy");
  if (!node) { check(`${language}: Etsy section exists`, false); continue; }
  const text = lines(node).join("\n");
  const stale = Object.entries(STALE).filter(([, re]) => re.test(text)).map(([name]) => name);
  check(`${language}: no old promise in the Etsy section`, stale.length === 0, stale.join(", "));

  if (language === "English") continue;
  if (language === "Türkçe") {
    const missing = NEW_TR.filter(line => !text.includes(line));
    check(`${language}: the seven corrected lines`, missing.length === 0, `${missing.length} missing`);
    continue;
  }
  const dict = GUIDE_T[language] ?? {};
  const untranslated = NEW_EN.filter(line => !dict[line] || dict[line] === line);
  check(`${language}: the seven corrected lines are translated`, untranslated.length === 0, `${untranslated.length} fall back to English`);
  const leftover = OLD_EN.filter(line => line in dict);
  check(`${language}: no old Etsy keys left in GUIDE_T`, leftover.length === 0, `${leftover.length} old keys`);
  const fallback = lines(node).slice(1).filter(line => enLines.includes(line));
  check(`${language}: every Etsy line is translated`, fallback.length === 0, `${fallback.length} English lines`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
