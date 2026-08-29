# NivaDesk ↔ Pandle köprüsü — kısa özet

## Amaç
Pandle (UK muhasebe yazılımı) aynı bankayı Plaid üzerinden kendisi çekiyor ve
işlemleri "Check" kuyruğunda bekletiyor; birinin her satıra nominal hesap + vergi
kodu vermesi gerekiyor. NivaDesk zaten bu kararı veriyor (kategori + VAT kodu),
dolayısıyla köprü aynı işi iki kez yapmamak için **NivaDesk'in kararını Pandle'a
gönderiyor**. Tek yön: NivaDesk → Pandle. Pandle'da defter oluşturmuyor, sadece
bekleyen banka işlemlerini onaylıyor.

## Nasıl çalışıyor
1. **Bağlan** — OAuth2 authorization-code (Pandle destek ekibinin verdiği app
   id/secret). Dönüş adresi `https://nivadesk.app/pandle/callback`.
2. **Meta çek** — Pandle'daki şirket, banka hesapları, nominal hesaplar ve vergi
   kodları okunur; kullanıcı hangi Pandle banka hesabının NivaDesk akışına
   karşılık geldiğini seçer.
3. **Eşleme** — NivaDesk kategorisi → Pandle nominal kodu + vergi kodu tablosu
   (hazır bir varsayılan tabloyla geliyor, kullanıcı düzenleyebiliyor).
4. **Önizleme** — Pandle'ın onaysız işlemleri sayfalanarak çekilir, tutar + tarih
   ile NivaDesk işlemlerine eşleştirilir (tarih toleransı 2 gün, gerekirse 4).
   Belirsiz eşleşmeler kullanıcıya sorulur (onayla / reddet).
5. **Gönder** — eşleşen her satır Pandle'da eşlenen nominal hesap ve işlemin
   kendi VAT koduyla onaylanır; sonuç NivaDesk işlemine `pandle.status =
   confirmed` olarak yazılır ve arayüzde "Confirmed in Pandle" görünür.

## Teknik yerleşim
- **Sunucu:** `functions/pandle.js` — 10 callable, hepsi owner-only, europe-west2:
  `pandleConnectStart / ConnectFinish / Disconnect / RefreshMeta /
  SelectBankAccount / SaveMappings / Preview / Push / ConfirmMatch / RejectMatch`.
- **Secret'lar:** `NIVADESK_PANDLE_CLIENT_ID` / `NIVADESK_PANDLE_CLIENT_SECRET`
  (ikisi de Secret Manager'da kayıtlı ve etkin).
- **Veri:** `companies/{id}/pandleConnection/main` (durum, şirket, hesaplar,
  nominal/vergi listeleri, eşlemeler — owner okur), `pandleTokens/main` (istemciye
  tamamen kapalı), `pandleSyncRuns/{requestId}` (gönderim günlüğü),
  `bankTransactions/{id}.pandle` (importedId + bankTransactionId + status).
- **Arayüz:** web `/bank` sayfasında `PandleCard` (bağlan, hesap seç, eşleme
  tablosu, önizleme, gönder) + `/pandle/callback` dönüş sayfası.

## Tasarım kararı: sağlayıcıdan bağımsız model
İşlemde saklanan şey Pandle kodu değil; NivaDesk'in kendi **kategori + VAT
davranışı** (standart / sıfır oranlı / muaf / kapsam dışı gibi). Pandle'a özgü
nominal ve vergi kodu yalnızca gönderim anında eşleme tablosundan üretiliyor.
Böylece aynı veri ileride QuickBooks veya Xero'ya da gönderilebiliyor —
eşleme yapısı üçü için de yerinde duruyor.

## Durum
Kod tamam ve canlı fonksiyonlara bağlı, kimlik bilgileri kurulu. Uçtan uca
gönderim (gerçek bir Pandle şirketinde onay) henüz üretimde çalıştırılıp
doğrulanmadı — yol haritasında bir sonraki Pandle fazı bu.
