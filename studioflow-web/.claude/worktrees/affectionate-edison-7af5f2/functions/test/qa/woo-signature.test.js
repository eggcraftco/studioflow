// Settings raporu kritik #2: Woo imza kararı. Secret + header varsa imza
// belirleyicidir (yanlış imza geçerli token'la bile reddedilir); header
// yoksa token eskisi gibi karar verir.
const crypto = require("node:crypto");
const { _wooWebhookAuthDecision: decide } = require("../../index.js");

const secret = "whsec_test_1234";
const body = Buffer.from(JSON.stringify({ id: 42, total: "19.99" }));
const goodSig = crypto.createHmac("sha256", secret).update(body).digest("base64");

let fail = 0;
const ok = (l, c, e = "") => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${l}${c ? "" : "  <- " + JSON.stringify(e)}`); };

let d = decide({ signatureSecret: secret, signatureHeader: goodSig, rawBody: body, providedToken: "", workspaceToken: "tok" });
ok("doğru imza token'sız geçer", d.authed && d.method === "signature", d);

d = decide({ signatureSecret: secret, signatureHeader: "AAAA" + goodSig.slice(4), rawBody: body, providedToken: "tok", workspaceToken: "tok" });
ok("YANLIŞ imza geçerli token'la bile reddedilir", !d.authed && /signature/.test(d.reason), d);

d = decide({ signatureSecret: secret, signatureHeader: "", rawBody: body, providedToken: "tok", workspaceToken: "tok" });
ok("imza header'ı yoksa token karar verir", d.authed && d.method === "token", d);

d = decide({ signatureSecret: "", signatureHeader: goodSig, rawBody: body, providedToken: "tok", workspaceToken: "tok" });
ok("secret kayıtlı değilse eski davranış (token)", d.authed && d.method === "token", d);

d = decide({ signatureSecret: "", signatureHeader: "", rawBody: body, providedToken: "wrong", workspaceToken: "tok" });
ok("yanlış token reddedilir", !d.authed && d.reason === "invalid token", d);

d = decide({ signatureSecret: secret, signatureHeader: goodSig, rawBody: Buffer.from("tampered"), providedToken: "", workspaceToken: "" });
ok("gövde değişmişse imza tutmaz", !d.authed, d);

console.log(fail === 0 ? "\n✅ WOO SIGNATURE GEÇTİ" : `\n❌ ${fail} BAŞARISIZ`);
process.exit(fail === 0 ? 0 : 1);
