// Tablo yapıştırma/CSV ayrıştırıcısı — SUNUCUDAKİ tek gerçek uygulama.
// Ayrıştırma üç istemcide ayrı yazılsaydı, "Strap, brown" gibi bir satırın
// yalnız birinde bozulması için üç şans olurdu.
const { createInventoryFunctions } = require("../../inventory.js");

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
const api = createInventoryFunctions({
  admin: { firestore: () => ({}) },
  onCall: (_o, h) => h,
  HttpsError: class extends Error {},
  requireWorkspace: async () => ({ uid: "u", email: "e", companyId: "c" }),
  cleanText: (v, f = "", max = 200) => (v === undefined || v === null ? f : String(v).slice(0, max)),
  roundMoney: round
});
const { splitDelimited, guessMapping, spreadsheetNumber } = api._internal;

let fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
};

console.log("=== AYIRICI ALGILAMA ===");
eq("Excel'den yapıştırma (sekme)", splitDelimited("Name\tQty\nDial\t10"), [["Name","Qty"],["Dial","10"]]);
eq("CSV (virgül)", splitDelimited("Name,Qty\nDial,10"), [["Name","Qty"],["Dial","10"]]);
eq("Avrupa CSV (noktalı virgül)", splitDelimited("Name;Qty\nDial;10"), [["Name","Qty"],["Dial","10"]]);
eq("tek sütun, ayırıcı yok", splitDelimited("Name\nDial"), [["Name"],["Dial"]]);

console.log("\n=== TIRNAKLI ALANLAR ===");
eq("virgül içeren ad korunuyor", splitDelimited('Name,Qty\n"Strap, brown",4'), [["Name","Qty"],["Strap, brown","4"]]);
eq("alan içinde tırnak (çiftlenmiş)", splitDelimited('Name\n"18"" chain"'), [["Name"],['18" chain']]);
eq("tırnak içinde satır sonu", splitDelimited('Name,Note\n"Dial","first\nsecond"'),
   [["Name","Note"],["Dial","first\nsecond"]]);

console.log("\n=== GÜRÜLTÜ ===");
eq("boş satırlar atılıyor", splitDelimited("A,B\n\n\nC,D"), [["A","B"],["C","D"]]);
eq("CRLF normalize", splitDelimited("A,B\r\nC,D"), [["A","B"],["C","D"]]);
eq("baş/son boşluk kırpılıyor", splitDelimited("  A , B \n C , D "), [["A","B"],["C","D"]]);
eq("tamamen boş metin", splitDelimited("   \n  "), []);
eq("null güvenli", splitDelimited(null), []);

console.log("\n=== SÜTUN EŞLEME ===");
eq("yaygın başlıklar tanınıyor",
   guessMapping(["Item Name","Quantity","Unit Price","Location"]),
   ["name","onHand","purchasePrice","location"]);
eq("büyük/küçük ve alt çizgi farketmiyor", guessMapping(["ITEM_NAME","Serial No"]), ["name","serialNumber"]);
eq("tanınmayan sütun boş kalıyor", guessMapping(["Name","Colour"]), ["name",""]);
eq("aynı alan iki kez atanmıyor", guessMapping(["Name","Item"]), ["name",""]);
eq("boş başlık boş kalıyor", guessMapping(["","Qty"]), ["","onHand"]);

console.log("\n=== SAYI OKUMA ===");
eq("İngiliz biçimi £1,250.50", spreadsheetNumber("£1,250.50"), 1250.5);
eq("Avrupa biçimi 1.250,50", spreadsheetNumber("1.250,50"), 1250.5);
eq("sade tam sayı", spreadsheetNumber("42"), 42);
eq("binlik yok, ondalık virgül", spreadsheetNumber("0,35"), 0.35);
eq("boş hücre sıfır", spreadsheetNumber(""), 0);
eq("saçma metin sıfır", spreadsheetNumber("n/a"), 0);
eq("para simgesi ve boşluk", spreadsheetNumber(" 2 300.00 GBP"), 2300);
eq("null güvenli", spreadsheetNumber(null), 0);

console.log(fail === 0 ? "\n✅ TÜM AYRIŞTIRICI TESTLERİ GEÇTİ" : `\n❌ ${fail} BAŞARISIZ`);
process.exit(fail === 0 ? 0 : 1);
