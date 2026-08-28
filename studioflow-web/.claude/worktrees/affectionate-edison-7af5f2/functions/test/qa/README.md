# QA raporu regresyon testleri

25 Ağustos 2026 tarihli dış QA raporunda "kesin doğrulanmış" denen üç sipariş
alanını emülatöre karşı sınar: To Do görev tarihi, Timeline & Delivery teslim
tarihi, Repair Intake Requested Work. Web istemcisinin gönderdiği yükü birebir
taklit eder, sonra Firestore'dan geri okur.

## Çalıştırma

Java gerekir ve Homebrew'un openjdk'ı PATH'te değildir:

```bash
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
npx firebase emulators:start --only auth,firestore,functions,storage --project eggcraft-studio
```

Sonra ayrı bir kabukta:

```bash
cd functions/test/qa
node seed-qa.js > seed-out.json
node order-fields.mjs        # rapor 1-3: sipariş alanları
node vat-math.mjs            # KDV brütten çıkarılıyor mu
node vat-recalculate.mjs     # toplu yeniden hesaplama + önizleme + entegrasyon koruması
node integration-secrets.mjs # webhook token'ı: taşıma, döndürme, token'sız istek reddi
node clear-tax-undo.mjs      # KDV silme: önizleme + geri alma
node import-preview.mjs      # yedek içe aktarma: önizleme, yinelenen, kırpma
node key-test.mjs            # OpenAI anahtar testi (gerçek ağ çağrısı yapar)
node webhook-protocol.mjs    # inbound webhook: token, test payload'ı, para okuma, tekrar teslimat
node ticket-dedupe.mjs       # destek bileti: çift gönderim tek bilet, pencere aritmetiği
```

`seed-qa.js` her çalıştığında çalışma alanının siparişlerini ve entegrasyon
sırlarını siler, sonra hesabı ve sipariş verisini sıfırdan kurar. **Her testten
önce yeniden tohumlayın** — bir önceki koşudan kalan tek bir entegrasyon siparişi
sayım iddialarını bozmaya yeter.

## İki koşu yolu

- `order-fields.mjs` — HTTP üzerinden, tam yol: tarayıcının çağırdığı uçla aynı.
- `direct.mjs` — `updateWebOrder.run()` ile doğrudan; emülatör çalışma zamanını
  atlar. Emülatöre özgü bir bozulmayı gerçek bir hatadan ayırmak için kullanışlı.

Emülatör çalışma zamanı `firebase-admin`'i proxy'ler ve `admin.firestore`'u yeniden
bağlayarak statik üyelerini (`FieldValue`, `Timestamp`) düşürür. `functions/index.js`
başındaki `FUNCTIONS_EMULATOR` korumalı blok bunu geri koyar; o blok olmadan
sipariş fonksiyonlarının hiçbiri emülatörde çalışmaz.

## Tarayıcıda elle doğrulama

Bu üç alan tarayıcı olayları gerektirir. Bir `input`/`textarea` değerini düz
`el.value = "..."` ile yazmak React'in `onChange`'ini tetiklemez: taslak durum
eski kalır, kayıt eski değeri gönderir ve alan "kaydedilmiyor" gibi görünür.
Rapordaki üç semptomun da kaynağı budur. Doğru yol yerel setter'dır:

```js
const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
set.call(input, "2026-09-30");
input.dispatchEvent(new Event("input", { bubbles: true }));
```
