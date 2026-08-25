// Önizlemenin döndürdüğü kalemler, içe aktarmaya OLDUĞU GİBİ geri verilebilmeli.
// Bir "görüntü şekli" döndürülse adetli kalemler sıfır stokla yazılırdı.
const { createInventoryFunctions } = require("../../inventory.js");
const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
const api = createInventoryFunctions({
  admin: { firestore: () => ({}) }, onCall: (_o,h)=>h, HttpsError: class extends Error {},
  requireWorkspace: async () => ({ uid:"u", email:"e", companyId:"c" }),
  cleanText: (v,f="",m=200)=> (v==null? f : String(v).slice(0,m)), roundMoney: round
});
const { normalizeItemInput } = api._internal;

(async () => {
  const res = await api.parseOpeningStock({ data: {
    text: 'Name;Qty;Price\n"Strap, brown";12;8,50\nDial;1;900',
    hasHeader: true, defaultType: "quantity"
  }});
  let fail = 0;
  const ok = (l,c,e="") => { if(!c) fail++; console.log(`${c?"PASS":"FAIL"}  ${l}${c?"":"  <- "+e}`); };

  ok("iki kalem okundu", res.items.length === 2, String(res.items.length));
  const strap = res.items[0];
  ok("düz onHand alanı var (görüntü şekli değil)", strap.onHand === 12, JSON.stringify(strap.onHand));
  ok("önizleme satır değeri 102", strap.lineValue === 102, String(strap.lineValue));

  // ASIL SORU: bu kalem içe aktarmaya geri verilince ne olur?
  const written = normalizeItemInput(strap, null);
  ok("yazılacak adet 12 (0 DEĞİL)", written.quantity.onHand === 12, JSON.stringify(written.quantity));
  ok("yazılacak alış fiyatı 8.50", written.purchasePrice === 8.5, String(written.purchasePrice));
  ok("adı virgülüyle korundu", written.name === "Strap, brown", written.name);
  console.log(fail===0 ? "\n✅ GİDİŞ-DÖNÜŞ SAĞLAM" : `\n❌ ${fail} BAŞARISIZ`);
  process.exit(fail===0?0:1);
})();
