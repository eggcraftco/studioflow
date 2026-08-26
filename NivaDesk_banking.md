NivaDesk Banking — Nihai İnceleme Raporu
İnceleme review@nivadesk.app hesabında yapıldı. Overview, Transactions, Recurring, Receipts ve Rules bölümleri tek tek kontrol edildi. Mevcut banka hareketleri, kategoriler, receipt durumları ve kurallar değiştirilmedi.
Verdiğiniz temel mimari doğru:
Bank
→ NivaDesk
→ Review / Category / VAT / Receipt / Order
→ Accounting Connector
→ Pandle / QuickBooks / Xero
→ Accountant
NivaDesk’in konumlandırması bir muhasebe sistemi değil, işletme sahibinin banka hareketlerini hazırladığı bir financial preparation workspace olmalıdır.
1. Genel değerlendirme
Banking modülü, hedeflenen sistemin önemli bir bölümünü şimdiden görsel olarak anlatıyor.
Güçlü taraflar:
- Sayfanın başında read-only açıklaması bulunuyor.
- Banka hesabının bağlantı ve son senkronizasyon durumu gösteriliyor.
- Transaction listesi mevcut.
- Category düzenleme alanı bulunuyor.
- VAT/tax code alanı bulunuyor.
- Order/project bağlantısı kurulabiliyor.
- Receipt eklenebiliyor.
- Internal note alanı bulunuyor.
- Recurring işaretleme ve otomatik tespit bulunuyor.
- Rule suggestion sistemi var.
- Pandle sync durumu için başlangıç niteliğinde bir alan var.
- Eksik receipt’ler ayrı ekranda görülebiliyor.
Genel yaklaşım, anlattığınız modele yaklaşık %70–75 oranında uyuyor. Arayüz ve günlük kullanım katmanı iyi başlamış; ancak muhasebe connector mimarisi, duplicate önleme, transaction kimlikleri, review statüleri ve gelişmiş finansal durumlar henüz kullanıcı arayüzünde yeterince görünür değil.
2. Read-only banka bağlantısı
Sayfanın üst kısmında şu açıklama bulunuyor:
Read-only Open Banking feed — NivaDesk can never move money.

Bu açıklama doğru ve güven verici. NivaDesk’in para gönderemeyeceği kullanıcıya açıkça anlatılıyor.
Bunun bağlantı sırasında da tekrarlanması gerekir:
NivaDesk can:
✓ Read account details
✓ Read balances
✓ Read transactions

NivaDesk cannot:
✕ Send money
✕ Create payments
✕ Change bank account settings
Ancak canlı arayüzü inceleyerek Open Banking sağlayıcısına gerçekten hangi izinlerin gönderildiğini teknik olarak doğrulamak mümkün değil. Bu yüzden backend tarafında şu kurallar kesin uygulanmalıdır:
- Yalnızca account ve transaction read scope’ları istenmeli.
- Payment initiation scope hiçbir zaman istenmemeli.
- Open Banking consent ID saklanmalı.
- Consent bitiş tarihi tutulmalı.
- Yeniden bağlantı gereksinimi gösterilmeli.
- Token’lar şifreli tutulmalı.
- Refresh ve connection hataları audit log’a yazılmalı.
- Banka hesabını silme ile bağlantıyı kesme ayrılmalı.
Bağlı hesap kartı
Mevcut kartta:
- HSBC-BUSINESS
- Connected
- Last sync
- Disconnect
- Add account
bulunuyor.
Bu iyi bir temel. Şunlar da eklenebilir:
- Banka adı ve logosu
- Maskelenmiş hesap numarası
- Para birimi
- Available balance
- Current balance
- Connection provider
- Consent expiration
- Sync status
- Son başarılı sync
- Son sync hatası
- Reconnect
Disconnect işlemi yalnızca küçük bir × olarak gösteriliyor. Bu işlem yanlışlıkla bağlantıyı kesebileceği için:
- Açıkça Disconnect account yazmalı.
- Confirmation istemeli.
- Eski transaction verilerinin silinmeyeceğini açıklamalı.
- Pandle bağlantısına etkisini açıklamalı.
OVERVIEW
3. Overview yapısı
Overview bölümünde:
- Weekly/Monthly/Yearly dönem seçimi
- Total spent
- Incoming
- Recurring spend
- Needs attention
- Spending mix
- Top recurring vendors
- Receipts summary
- Recent transactions
- Upcoming payments
bulunuyor.
Bu bilgiler günlük işletme yönetimi açısından uygun ve kolay anlaşılır.
4. Dönem filtresi
Weekly, Monthly ve Yearly seçimi doğru. Önceki dönemlere geçilebiliyor ve gelecekteki dönem düğmesi devre dışı bırakılmış.
Ancak şu sorular kullanıcı için açıklanmalı:
- Dönem transaction date’e mi, posted date’e mi göre hesaplanıyor?
- Pending hareketler dahil mi?
- Transferler spending’e dahil mi?
- Refund’lar kategoriden düşülüyor mu?
- Birden fazla hesap varsa hepsi mi seçili?
- Dövizli işlemler hangi kurla çevriliyor?
Önerilen ek filtre:
Accounts
[All accounts ▼]

Transaction basis
[Posted date ▼]
5. KPI kartları
Mevcut değerler görsel olarak anlaşılır. Fakat Needs attention kartında:
- 13 missing receipts
- 8 rule suggestions
aynı toplam içinde gösteriliyor.
Bir transaction hem missing receipt hem rule suggestion içeriyorsa toplam 13 items olarak gösterilmesi yanıltıcı olabilir. Bu değer “benzersiz transaction sayısı” mı yoksa “sorun sayısı” mı açıklanmalıdır.
Daha doğru yapı:
Needs attention

13 transactions
21 outstanding actions

13 Missing receipts
8 Rule suggestions
Ayrıca şu review durumları eklenebilir:
- Uncategorised
- Missing VAT code
- Missing receipt
- Not linked
- Duplicate suspected
- Ready for accounting
- Sync failed
6. Spending mix
Kategori grafiği başarılı ve okunabilir. Merkezde toplam değer bulunması faydalı.
Ancak:
- Incoming işlemler grafiğe dahil edilmemeli.
- Transfer ve credit card payment işlemleri gider sayılmamalı.
- Refund’lar ilgili kategori tutarını azaltmalı.
- VAT dahil veya hariç tutar olduğu belirtilmeli.
- Kategoriye tıklandığında filtrelenmiş transaction listesi açılmalı.
£29.10 in 1 more categories kullanılabilir ama kategori adı doğrudan gösterilebilecek alan varsa gizlenmemesi daha iyi olur.
7. Upcoming payments
Recurring işlemlerden bir sonraki tahmini ödeme tarihinin gösterilmesi yararlı.
Fakat bunların kesin ödeme değil, tahmin olduğu belirtilmelidir:
Expected around 16 September
Based on the last 3 monthly payments
İleride:
- Tutar değişimi
- Gecikme
- Beklenen işlem gelmedi
- Subscription fiyat artışı
- Muhtemel iptal
uyarıları eklenebilir.
TRANSACTIONS
8. Transaction listesi
Mevcut tablo şu alanları gösteriyor:
- Merchant
- Date
- Category
- Method
- Receipt
- Amount
Ayrıca:
- All
- Needs attention
- Incoming
- Spending
- Search
- Select
- Sayfalama
- Satır sayısı
bulunuyor.
Bu yapı günlük kullanım için başarılı. Transaction’a tıklanınca sağ detay panelinin açılması da çok iyi bir karar; kullanıcı listeyi terk etmeden işlemi inceleyebiliyor.
9. Transaction detay paneli
Kontrol edilen işlemde şu bilgiler bulundu:
- Merchant
- Tarih
- Amount
- Payment method
- Raw bank description
- Category
- VAT/tax code
- Linked order or project
- Receipt
- Notes
- Rule suggestion
- Recurring
- Activity & sync
- Previous/next transaction
- Save
- Save & create rule
Bu, hedeflenen kullanımın büyük kısmına uyuyor.
Özellikle Raw bank description alanının korunması önemlidir. Merchant adı normalize edilse bile bankadan gelen özgün açıklama değişmemelidir.
10. Eksik transaction alanları
Aşağıdaki banka verileri detay paneline eklenmelidir:
- Bank transaction ID
- Bank account
- Posted/pending status
- Transaction date
- Posted date
- Value date
- Direction
- Original amount
- Original currency
- Exchange rate
- Converted amount
- Bank reference
- Merchant/counterparty
- Bank category
- NivaDesk category
- Open Banking provider
- First imported date
- Last updated date
Ham banka verileri kullanıcı tarafından değiştirilememeli. NivaDesk’in eklediği bilgiler ayrı tutulmalıdır:
BANK DATA — Read-only
Amount
Date
Description
Reference
Bank transaction ID

NIVADESK ENRICHMENT — Editable
Category
VAT code
Order
Receipt
Notes
Recurring
Review status
Bu ayrım veri bütünlüğünü korur.
11. Category yapısı
Mevcut kategoriler:
- Materials
- Equipment
- Shipping
- Software
- Subscriptions
- Fees
- Marketing
- Travel
- Utilities
- Rent
- Staff
- Tax
- Other
Başlangıç için uygun ancak sabit/hard-coded bırakılmamalıdır.
NivaDesk’in kendi bağımsız kategori kayıtları olmalıdır:
NivaDesk Category
├── Name
├── Type: income/expense/transfer
├── Default VAT code
├── Active
├── Reporting group
└── Connector mappings
    ├── Pandle category ID
    ├── QuickBooks account ID
    └── Xero account code
Kullanıcı:
- Kategori ekleyebilmeli
- Yeniden adlandırabilmeli
- Pasifleştirebilmeli
- Varsayılan VAT seçebilmeli
- Her accounting provider için mapping yapabilmeli
12. VAT/tax code
Transaction detayında VAT/tax code bulunması doğru.
Mevcut seçenekler:
- Category default
- VAT 20%
- VAT 5%
- Reverse charge
- No VAT
- Exempt/0%
Ancak Exempt ve 0% aynı seçenek olmamalıdır. Muhasebe ve VAT return açısından zero-rated ile exempt farklı kavramlardır.
Daha doğru seçenekler:
- Standard rate
- Reduced rate
- Zero-rated
- Exempt
- Outside scope
- No VAT receipt
- Reverse charge
- Import VAT
- Mixed/split VAT
Ayrıca transaction üzerinde şu değerler gösterilebilir:
Gross: £120.00
VAT: £20.00
Net: £100.00
VAT kodu kategori varsayılanından gelmişse bu açıkça belirtilmeli:
VAT 20%
Inherited from category: Software
Kullanıcının manuel override yaptığı durum ayrıca kaydedilmelidir.
13. Split transaction ihtiyacı
Mevcut panel bir transaction’a yalnızca tek kategori ve tek order bağlayabiliyor.
Gerçek hayatta tek ödeme birden fazla kategori veya order içerebilir:
Amazon · £120

£70 → Materials → Order #1089
£30 → Packaging → Order #1092
£20 → Office expense
Bu nedenle Split transaction özelliği kritik bir gereksinimdir.
Her split satırında:
- Amount
- Category
- VAT code
- Order/project
- Inventory/purchase
- Note
bulunabilmelidir. Split toplamı banka transaction tutarıyla birebir eşleşmelidir.
14. Order ve proje bağlantısı
Mevcut order seçimi doğru yönde. Customer ve design/order adı birlikte gösteriliyor.
Ancak uzun listede arama yapılabilir combobox gerekir. Untitled design ve yalnızca customer adı görünen eski kayıtlar yanlış seçim riskini artırıyor.
Gösterim:
ORD-01089 · Pop-up Sergi Standı
QA Team Test Customer · £1,450
Ayrıca transaction’ın sadece order’a değil şu kayıtlara bağlanması gerekebilir:
- Purchase
- Supplier
- Inventory item
- Customer
- Expense record
- VAT payment
Özellikle Inventory mimarisi açısından:
Bank Transaction £2,100
↔ Purchase PUR-084
↔ Supplier ABC Watches
↔ Inventory Item Rolex Air-King
↔ Receipt invoice.pdf
bağlantısı desteklenmelidir.
15. Incoming işlemler
Incoming transaction’larda ayrı bir eşleştirme mantığı gerekir:
- Order payment
- Customer
- Invoice
- Deposit
- Refund received
- Owner contribution
- Loan
- Transfer
- Other income
Bir gelen ödeme doğrudan gelir sayılmamalıdır. Örneğin iki şirket hesabı arasındaki transfer veya owner contribution satış değildir.
Incoming detail panelinde:
Match to
Order payment
Invoice
Customer
Transfer
Other income
seçimi bulunmalıdır.
Order payment’a bağlandığında Financial Info kartındaki payment ile duplicate kayıt oluşmamalıdır. Banka transaction’ı mevcut payment kaydıyla eşleştirilmeli veya kullanıcıya yeni payment oluşturma seçeneği açıkça sunulmalıdır.
REVIEW VE MUHASEBE HAZIRLIĞI
16. Review statüsü eksik
Sistemin temel amacı muhasebeciye hazırlanmış kayıt üretmekse her transaction’ın bir hazırlık statüsü olmalıdır.
Önerilen statüler:
Unreviewed
Needs information
Ready for accounting
Synced
Confirmed in accounting
Sync error
Ignored
Save tek başına yeterli değil. Kullanıcı category seçmiş olsa bile receipt veya VAT eksik olabilir.
Daha uygun ana işlem:
Save draft
Mark as reviewed
Ready for Pandle
17. Toplu işlemler
Select düğmesi bulunuyor, ancak toplu çalışma akışı daha belirgin olmalıdır.
Toplu işlemler:
- Set category
- Set VAT code
- Mark no receipt needed
- Create rule
- Link order
- Mark reviewed
- Ready for accounting
- Export
- Retry sync
Riskli toplu işlemlerde kaç transaction’ın etkileneceği gösterilmelidir.
RECEIPTS
18. Receipts bölümü
Mevcut yapı:
- Receipts matched
- Missing receipts
- No receipt needed
- Upload receipt
- All/Missing/Matched
- Transaction tablosu
- Attach
- No receipt needed
Bu yapı kullanıcıyı eksik belgelere yönlendirmek açısından başarılı.
19. “No receipt needed” ifadesi
Ekranda:
No receipt needed: 2
2 incoming · 0 marked
görülüyor.
Buradaki iki işlem aslında incoming olduğu için receipt gereksiniminin dışında bırakılmış. Ancak başlık bunların kullanıcı tarafından No receipt needed olarak işaretlendiğini düşündürüyor.
Daha doğru gösterim:
Receipt not required: 2

Incoming transactions: 2
Manually excluded: 0
Incoming ödeme için satış invoice veya remittance belgesi gerekebileceğinden, bütün incoming transaction’ların kesin olarak “belge gerektirmez” sayılması da muhasebe politikasına bağlı olmalıdır.
20. Receipt dosya mimarisi
Receipt, Files menüsüne ayrıca ikinci bir kopya olarak yüklenmemelidir.
Doğru yapı:
receipt.pdf — Tek dosya
├── Bank Transaction
├── Purchase
├── Supplier
├── Inventory Item
└── Files merkezi kütüphanesi
Transaction detayındaki Attach, merkezi Files kütüphanesindeki mevcut dosyayı seçmeye de izin vermelidir:
Attach receipt
[Upload new] [Choose from Files]
Böylece Purchase veya Inventory içinde daha önce yüklenmiş invoice tekrar yüklenmez.
21. Receipt matching
Kullanıcıya şu açıklama sunuluyor:
NivaDesk reads the total and date and finds the transaction.

Bu iyi bir özellik. Ancak otomatik eşleşme güven skoru göstermelidir:
Suggested match — 94%

Amount: Exact
Date: 1 day difference
Merchant: Similar
Birden fazla olası eşleşme varsa kullanıcı seçim yapmalıdır. Düşük güvenli eşleşmeler otomatik tamamlanmamalıdır.
Ayrıca:
- Bir receipt birden fazla transaction’a
- Bir transaction birden fazla receipt’e
- Çok sayfalı invoice
- Credit note
- Kısmi ödeme
- Split payment
durumları desteklenmelidir.
RECURRING
22. Recurring tespiti
Recurring bölümünde:
- Monthly recurring spend
- Active recurring
- Possibly cancelled
- Upcoming renewals
- Merchant
- Amount
- Cadence
- Next expected
- Observation count
- Create rule
bulunuyor.
Monthly · 3× gösterimi faydalı; tespitin üç işlem üzerinden yapıldığını anlatıyor.
Ancak recurring tespiti ile categorisation rule birbirinden farklı şeylerdir:
- Recurring pattern: ödemenin ne sıklıkta tekrar ettiği
- Category rule: geldiğinde nasıl kategorize edileceği
Create rule bu farkı kullanıcıya açıklamalıdır.
23. Recurring geliştirmeleri
Eklenebilecek alanlar:
- First seen
- Last seen
- Average amount
- Amount range
- Price increase
- Expected date range
- Confidence
- Contract/renewal date
- Notice deadline
- Owner
- Linked supplier
- Linked subscription
- Possibly cancelled reason
Örneğin:
Adobe
Usually £32.99
Expected monthly around the 17th
Detected from 3 payments
Confidence: High
Kullanıcı yanlış tespiti kapatabilmelidir:
- Not recurring
- Ignore this pattern
- Change cadence
- Pause alerts
RULES
24. Mevcut Rules yapısı
Rules ekranında:
- Active rules
- Suggested rules
- Auto-applied
- Needs review
- New rule
- Bulk create suggested rules
- Rule tablosu
- Suggested rule kartları
bulunuyor.
Kural tablosunun sütunları doğru yönde:
- Rule name
- Condition
- Category
- VAT/tax code
- Applies to
- Status
- Last used
- Actions
25. Doğrulanan kural formu eksikliği
New rule formu incelendiğinde yalnızca:
- Merchant contains
- Category
alanları bulunuyor.
Ancak tablonun kendisinde VAT / Tax code ve Applies to sütunları var. Yeni kural formunda bu değerleri belirleme imkânı görünmüyor.
Bu doğrudan bir tasarım/işlev tutarsızlığıdır.
Kural formu en az şunları içermelidir:
Rule name

WHEN
Merchant contains
Description contains
Amount equals / range
Money in / money out
Bank account
Payment method

THEN
Category
VAT/tax code
Supplier
Order/project
Receipt policy
Recurring status
Note

APPLY
Future transactions only
Existing unreviewed transactions
Selected matching transactions
26. Suggested rules
Öneriler merchant geçmişinden mantıklı şekilde üretiliyor:
- Adobe → Subscriptions
- ACCOUNTANCYPARTNER → Fees
- Royal Mail → Shipping
- Google → Software
Ancak öneriler yalnızca kategori gösteriyor. VAT/tax code önerisi görünmüyor.
Özellikle Bulk create 8 suggested rules riskli olabilir. Kullanıcı oluşturmadan önce şunları görmelidir:
- Oluşturulacak kurallar
- Kategori
- VAT kodu
- Eşleşecek transaction sayısı
- Geçmişe uygulanıp uygulanmayacağı
- Çakışan mevcut kurallar
- Yanlış eşleşme riski
Örneğin merchant contains "google" çok geniş olabilir ve Google Ads ile Google Workspace’i aynı kategoriye atayabilir.
Kural önizlemesi:
This rule matches 2 transactions:

Google Workspace · £14.00
Google Workspace · £14.00

It will not affect:
Google Ads · £240.00
27. Kural önceliği ve çakışmalar
Birden fazla kural aynı transaction’a uyarsa hangi kuralın uygulanacağı tanımlanmalıdır:
- Priority sırası
- Most specific rule wins
- İlk eşleşen
- Kullanıcı incelemesi
Her otomatik işlemde:
Category set to Software
Applied by rule: Google Workspace Rule
şeklinde audit bilgisi bulunmalıdır.
PANDLE / QUICKBOOKS / XERO MİMARİSİ
28. Provider’dan bağımsız veri modeli
NivaDesk kategorileri Pandle kategori isimleri olarak hard-code edilmemelidir.
Doğru yapı:
NivaDesk Transaction
├── NivaDesk category
├── NivaDesk tax code
├── Order
├── Receipt
├── Review status
└── Accounting links
    ├── Pandle
    ├── QuickBooks
    └── Xero
Provider mapping ayrı tutulmalıdır:
NivaDesk Category: Software

Pandle mapping
Category ID: pd_cat_182

QuickBooks mapping
Account ID: qb_acc_204

Xero mapping
Account code: 402
29. Duplicate önleme
Sizin belirttiğiniz en kritik konu budur.
Pandle banka hareketini zaten import etmişse NivaDesk aynı transaction’ı tekrar oluşturmamalıdır.
Doğru süreç:
1. Bank transaction NivaDesk’e gelir.
2. Pandle’daki mevcut transaction’lar okunur.
3. Kalıcı ID veya güvenilir eşleştirme ile aynı hareket bulunur.
4. NivaDesk transaction’ına Pandle transaction ID yazılır.
5. Category ve tax code mevcut Pandle transaction’ına gönderilir.
6. Pandle transaction confirm edilir.
7. Sync sonucu NivaDesk’te saklanır.
Saklanması gereken kimlikler:
bank_provider
bank_account_id
bank_transaction_id

accounting_provider
accounting_connection_id
accounting_account_id
accounting_transaction_id
Unique constraint önerisi:
workspace_id
+ bank_account_id
+ bank_transaction_id
Aynı işlem tekrar sync edilse bile yeni NivaDesk transaction oluşmamalıdır.
Provider tarafında:
workspace_id
+ accounting_provider
+ accounting_transaction_id
benzersiz olmalıdır.
30. Banka ile Pandle eşleştirme
Her zaman aynı ID iki sağlayıcıda bulunmayabilir. Bu durumda eşleştirme sırası:
1. Provider’ın ortak transaction/reference ID’si
2. Bank account
3. Exact amount
4. Date/value date toleransı
5. Bank reference
6. Merchant/description
7. Önceden saklanan manuel eşleştirme
Otomatik eşleşme güvenli değilse:
Possible Pandle match
Confidence: 82%

[Confirm match] [Not the same transaction]
gösterilmelidir.
Asla belirsiz eşleşmeye dayanarak yeni Pandle transaction oluşturulmamalıdır.
31. Sync durumları
Transaction detayında şu anda Not synced to Pandle yet yazıyor. Bu iyi bir başlangıç ama daha kapsamlı durumlar gerekir:
- Not connected
- Not matched
- Match suggested
- Matched to existing transaction
- Ready to sync
- Syncing
- Sent
- Confirmed in Pandle
- Rejected
- Sync error
- Changed after sync
Detay alanı:
Pandle

Status
Matched to existing transaction

Pandle transaction ID
TX-948205

Last sync
25 Aug 2026 · 14:20

Sent
Category: Software
Tax code: Standard rate

[Open in Pandle] [Sync again] [View activity]
32. Idempotency
Connector işlemleri idempotent olmalıdır. Kullanıcı Sync düğmesine iki kere bassa bile aynı veri ikinci kez oluşturulmamalıdır.
Her sync işlemi için:
- Idempotency key
- Request ID
- Provider response
- Attempt count
- Error
- Timestamp
saklanmalıdır.
Confirm in Pandle başarısız olursa NivaDesk’in local transaction bilgileri kaybolmamalı; durum Sync error olmalı ve tekrar denenebilmelidir.
33. Muhasebeci çalışma alanı
Uzun vadeli hedef için ayrı bir görünüm faydalı olur:
Accounting Review

Ready to sync
32

Missing receipt
7

Missing VAT code
3

Sync errors
1

Confirmed in Pandle
148
Muhasebeci veya işletme sahibi dönem bazında:
- Hazır transaction’ları
- Eksik belgeleri
- Belirsiz VAT kodlarını
- Duplicate şüphelerini
- Sync hatalarını
tek yerden yönetebilir.
GENEL TASARIM DEĞERLENDİRMESİ
34. Başarılı tasarım kararları
- Overview bilgi hiyerarşisi iyi.
- KPI kartları kolay okunuyor.
- Renkler gelir/gider/uyarı ayrımını destekliyor.
- Transaction tablosu sade.
- Sağ detay paneli çok kullanışlı.
- Alt sekmeler anlaşılır.
- Receipt eksikleri görünür.
- Recurring ödemeler ayrı tutulmuş.
- Rule suggestions görünür.
- Read-only mesajı doğru yerde.
- Dönem seçimi kolay erişilebilir.
35. Geliştirilmesi gereken tasarım kararları
Global navigasyon satır kırılması
Geniş ekran görüntüsünde bile üst navigasyonun bazı öğeleri ikinci satıra düşüyor. Messages, AI Replies ve Settings aşağı satıra geçerek header yüksekliğini artırıyor ve ana navigasyon bütünlüğünü bozuyor.
Çözüm:
- Navigasyon aralıklarını azaltma
- Daha kompakt ikon+metin yapısı
- Düşük öncelikli bölümleri More altına alma
- Responsive olarak yalnızca ikon gösterme
Sayfa genişliği
Banking içeriği büyük ekranda merkezde nispeten dar kalıyor. Overview için bu kabul edilebilir; ancak transaction tablosu ve sağ inspector birlikte kullanılacaksa daha geniş çalışma alanı faydalı olur.
- Overview: kontrollü max-width
- Transactions: daha geniş/full-width
- Sağ panel: resize/collapse
- Seçilen panel genişliği hatırlanabilir
Simge tutarlılığı
Bazı alanlarda emoji benzeri ikonlar kullanılıyor:
- 🏛
- 📷
- ↻
- ⚠
Bunlar işletim sistemine göre farklı görünebilir. NivaDesk’in diğer bölümleriyle aynı SVG ikon sistemi kullanılmalıdır.
Disconnect düğmesi
Küçük ×, hesap bağlantısını kesme gibi ciddi bir işlem için yeterince açıklayıcı değil. Metin ve confirmation gereklidir.
Accessibility
- Renk tek başına durumu anlatmamalı.
- Grafik dilimleri klavye ve ekran okuyucuyla erişilebilir olmalı.
- Tablo satırlarının açılabilir olduğu belirtilmeli.
- Rule renkleri metin/ikonla desteklenmeli.
- Tutar işaretleri ekran okuyucuda “income/expense” olarak okunmalı.
ÖNCELİKLİ GELİŞTİRME PLANI
Kritik
1. Kalıcı bank transaction ID saklama
2. Pandle transaction ID saklama
3. Duplicate önleyen unique constraint
4. Mevcut Pandle transaction’ına match etme
5. Idempotent sync
6. NivaDesk kategori ve VAT modelini provider’dan ayırma
7. Review/ready/synced/error statüleri
8. Banka verisi ile NivaDesk enrichment alanlarını ayırma
Yüksek öncelik
1. Split transaction
2. Incoming payment–order payment eşleştirme
3. Transfer/refund/owner contribution ayrımı
4. Kural formuna VAT ve scope ekleme
5. Receipt’in merkezi Files sistemine bağlanması
6. Accounting sync activity paneli
7. Searchable order selector
8. Multi-account filtreleme
9. Pending/posted statüsü
10. Multi-currency alanları
Orta öncelik
1. Receipt confidence matching
2. Recurring confidence ve fiyat değişimi
3. Bulk review
4. Rule preview
5. Rule priority/conflict
6. Supplier/Purchase/Inventory bağlantısı
7. Accounting Review ekranı
8. Audit log
9. Custom categories
10. Category mapping yönetimi
Nihai mimari
OPEN BANKING — Read-only
        │
        ▼
BANK ACCOUNT
        │
        ▼
BANK TRANSACTION — Değiştirilemez ham veri
        │
        ├── NivaDesk Category
        ├── VAT / Tax Code
        ├── Order / Customer
        ├── Purchase / Supplier / Inventory
        ├── Receipt — Files kaydı
        ├── Internal Note
        ├── Recurring Pattern
        ├── Rule
        └── Review Status
                │
                ▼
ACCOUNTING CONNECTOR
        ├── Pandle
        ├── QuickBooks
        └── Xero
                │
                ▼
EXISTING ACCOUNTING TRANSACTION
Match → Update category/tax → Confirm
Sonuç
Banking modülünün mevcut arayüzü, anlattığınız günlük finans hazırlama deneyimine büyük ölçüde uyuyor. Özellikle transaction detay paneli, category, VAT, order, receipt, recurring ve rule suggestion alanları doğru temeli oluşturuyor.
En önemli eksiklik görsel arayüzden çok veri ve connector mimarisinde:
NivaDesk transaction’ı zenginleştirmeli; banka veya muhasebe transaction’ının yerine yeni ve kontrolsüz kayıt üretmemelidir.

Korunması gereken dört kesin kural:
1. Open Banking bağlantısı yalnızca read-only olmalı.
2. Her banka hareketi provider transaction ID ile benzersiz tutulmalı.
3. Pandle’daki mevcut hareket eşleştirilmeli; yeniden oluşturulmamalı.
4. NivaDesk kategorileri ve VAT kodları Pandle, QuickBooks veya Xero’ya özel hard-code edilmemeli; connector mapping ile çevrilmeli.
Bu kurallar tamamlandığında Banking bölümü, muhasebe yazılımıyla rekabet eden ikinci bir defter değil; işletme sahibinin günlük finans işini kolaylaştıran ve muhasebeciye temiz veri hazırlayan güçlü bir ara katman olur.
