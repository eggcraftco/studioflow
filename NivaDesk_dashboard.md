Dashboard bölümünü review@nivadesk.app hesabıyla; Week, Month, Year, All ve Custom aralıkları, karşılaştırmalar, finans kartları, banka hareketleri, vergi bölümü, grafikler ve özelleştirme paneliyle birlikte inceledim. Herhangi bir veri değiştirmedim ve ekranı tekrar Year görünümünde bıraktım.
NivaDesk Dashboard kapsamlı test raporu
1. Genel değerlendirme
Dashboard şu anda dört farklı veri grubunu tek ekranda birleştiriyor:
- Sipariş bazlı finans
- Banka hareketleri
- Vergi/VAT yükümlülüğü
- Dönemsel kâr karşılaştırmaları
Genel yapı güçlü; kullanıcı Orders, Banking ve Customers bölümlerine gitmeden işletmenin genel durumunu görebiliyor.
Ancak en önemli problem finansal terimlerin ve hesaplama kapsamlarının yeterince açıklanmaması. Aynı ekranda:
- Sipariş değeri
- Tahsil edilmiş para
- Bekleyen bakiye
- Banka nakit akışı
- Muhasebesel gelir
- Net profit
birlikte gösteriliyor. Bunların birbirine karıştırılmaması gerekiyor.
2. Dashboard başlığı
Başlıkta:
- Workspace adı
- Kullanıcı rolü
- Aktif sipariş sayısı
- Toplam sipariş
- Toplam müşteri
- Due soon
- Export CSV
bulunuyor.
Çalışan noktalar
- Orders: 23
- Customers: 17
- Active orders: 7
- Due soon: 0
gibi temel göstergeler hızlı okunuyor.
Eksiklikler
Active orders tanımı açıklanmıyor.
Şunlardan hangilerinin aktif sayıldığı belli değil:
- Waiting Customer
- Waiting Deposit
- In Production
- Ready to Ship
- Not Yet
- Overdue
- Cancelled
Öneri:
Metrik üzerine gelindiğinde formül gösterilmeli:
Active orders
Excludes Done, Completed, Cancelled and Trash.

Aynı şekilde Due soon için de zaman aralığı açıklanmalı:
Delivery due within the next 7 days.

Bu küçük sayaçlar tıklanabilir olup ilgili Orders filtresini açmalı.
3. Tarih aralıkları
Mevcut seçenekler:
- Week
- Month
- Year
- All
- Custom
Filtreler çalışıyor ve finans kartları dönemle birlikte değişiyor.
Doğrulanan sonuçlar:
Dönem    Revenue    Pending    Cost    VAT    Net Profit
Week    £1,450.00    £1,050.00    £120.00    £290.00    £996.50
Month    £1,564.00    £1,050.00    £120.00    £312.80    £1,084.28
Year    £32,084.00    £5,210.00    £1,575.00    £6,416.80    £23,114.68
All    £76,584.00    £6,710.00    £5,082.00    £15,316.80    £53,872.68


Custom aralık
Custom seçildiğinde Start ve End alanları açılıyor. Ayrı bir Apply düğmesi yok; aralık canlı uygulanıyor.
Öneriler:
- Apply ve Reset düğmeleri eklenebilir.
- Hazır aralıklar eklenebilir:
  - Last 7 days
  - Last 30 days
  - This quarter
  - Last quarter
  - Tax year
  - Financial year
- Seçili tarih aralığı Export CSV dosya adına eklenmeli.
- Start tarihinin End’den sonra olmasına izin verilmemeli.
- Kullanıcı kendi mali yıl başlangıcını Settings’ten belirleyebilmeli.
4. Üst menü “Month Net / Year Net” tutarsızlığı
Bu doğrulanmış bir finansal kapsam tutarsızlığıdır.
Dashboard Year değerleri:
- Revenue: £32,084.00
- Base Cost + Extra Spending: £1,575.00
- Platform Fee: £962.52
- Shipping: £15.00
- VAT: £6,416.80
- Net Profit: £23,114.68
Dashboard hesabı doğru:
£32,084 − £1,575 − £962.52 − £15 − £6,416.80 = £23,114.68
Fakat üst menüde:
- Year Net: £29,651.48
görünüyor.
Bu değer şu hesaba karşılık geliyor:
£32,084 − £1,455 Base Cost − £962.52 Platform Fee − £15 Shipping = £29,651.48
Yani üst menü hesabı:
- VAT’i düşmüyor.
- £120 Extra Spending’i düşmüyor.
Month değerinde de aynı durum var:
- Dashboard Month Net Profit: £1,084.28
- Üst menü Month Net: £1,517.08
Üst menü değeri:
£1,564 − £46.92 Platform Fee = £1,517.08
Burada Cost ve VAT de düşülmüyor.
Önem derecesi: Kritik
İki rakamın ikisi de “Net” olarak sunuluyor fakat farklı formüller kullanıyor.
Çözüm seçenekleri
Ya bütün uygulamada tek Net Profit formülü kullanılmalı ya da isimler açıkça ayrılmalı:
- Gross Margin
- Pre-Tax Profit
- Net Profit After VAT
- Cash Profit
- Accrual Profit
En doğru yaklaşım:
- Üst menü Dashboard ile aynı Net Profit’i göstermeli.
- Kullanıcı hover ettiğinde formülü görebilmeli.
- Finansal tanımlar Settings → Finance bölümünde merkezi olarak açıklanmalı.
5. “Standard Tax (Services/New)” başlığı
İlk finans kartı £32,084 değerini gösteriyor; Financial Breakdown bölümünde aynı değer Revenue olarak adlandırılmış.
Standard Tax (Services/New) başlığı gelir kartı için anlaşılır değil. Bu ifade bir vergi kuralı veya sipariş kategorisi gibi görünüyor.
Önerilen başlık:
- Revenue
- Gross Revenue
- Order Revenue
Vergi kuralı ayrıca küçük alt metin olabilir:
Revenue
Standard VAT rule applied

6. Pending
Year görünümünde Pending £5,210.
Bu muhtemelen müşterilerden tahsil edilmemiş toplam bakiye. Fakat aşağıdaki kavramlardan hangisi olduğu belli değil:
- Unpaid invoices
- Remaining order balance
- Pending orders
- Authorized but not captured payments
- Overdue amount
Önerilen başlık:
- Outstanding Balance
- Customer Receivables
Ayrıca şu şekilde parçalanmalı:
- Due now
- Overdue
- Not yet due
- Deposit pending
- Awaiting payment confirmation
Pending kartına tıklanınca ilgili Orders filtresi açılmalı.
7. Revenue ve tahsilat ayrımı
Dashboard Revenue sipariş değerine dayanıyor; banka hesabına giren gerçek para değil.
Örneğin QA siparişi:
- Order value: £1,450
- Paid: £400
- Pending: £1,050
Week Revenue £1,450 olarak hesaplanıyor.
Bu tahakkuk bazlı raporlama açısından doğru olabilir; ancak nakit bazlı rapor isteyen kullanıcı için yanıltıcıdır.
Öneri
Dashboard’da iki mod bulunmalı:
- Accrual View: Sipariş/fatura tarihi bazlı
- Cash View: Gerçek ödeme/banka hareketi bazlı
En azından ayrı kartlar gösterilmeli:
- Invoiced Revenue
- Payments Received
- Outstanding Balance
- Bank Incoming
- Net Cash Flow
8. Net Profit hesabı
Dashboard Net Profit formülü kendi içinde tutarlı:
Revenue − Base Cost − Extra Spending − Platform Fee − Shipping − VAT
Ancak şu muhasebe kararları netleştirilmeli:
- Revenue VAT dahil mi?
- VAT neden Revenue’den ayrıca düşülüyor?
- Platform Fee VAT dahil mi?
- Shipping müşteriden alınan tutar mı, işletme maliyeti mi?
- Refund ve chargeback nerede düşülüyor?
- İptal edilen siparişler Revenue’ya giriyor mu?
- Ödenmemiş siparişlerin kârı Net Profit’e giriyor mu?
Kullanıcı kartın üzerine geldiğinde hesap formülünü görmeli.
9. Growth hesaplama hatası
Year-over-Year Summary:
- This Year: £23,114.68
- Last Year: £30,758.00
- Growth: 24.8%
Bu yıl geçen yıldan daha düşük olduğu için büyümenin pozitif olması mümkün değil.
Doğru hesap:
(23,114.68 − 30,758) / 30,758 ≈ −24.8%
Doğru gösterim:
- ↓ 24.8%
- −24.8%
- Kırmızı veya turuncu renk
Önem derecesi: Yüksek
Şu an rakam kullanıcıya işletmenin büyüdüğünü söylüyor; gerçekte yaklaşık %24.8 küçülme var.
Ayrıca Growth yerine daha tarafsız bir başlık düşünülebilir:
- Year-over-Year Change
- Profit Change
10. Karşılaştırma kontrolleri
Mevcut kontroller:
- 1 Yr Compare
- 3 Yrs Compare
Üç yıllık görünümde grafik legend’ı:
- Current
- Bank
- −1 Yr
- −2 Yrs
- −3 Yrs
olarak genişliyor.
Sorunlar
- “3 Yrs Compare” mevcut yılın yanında üç geçmiş yıl gösterdiği için toplam dört seri oluşuyor.
- Current Net Profit ile Bank serisinin aynı grafikte karşılaştırılması kavramsal olarak problemli olabilir.
- Bank nakit hareketi ile sipariş bazlı Net Profit aynı muhasebe ölçüsü değildir.
- Çok fazla çizgi benzer açık renklerde okunamayabilir.
- Mobil ekranda dört–beş seri karmaşıklaşır.
Öneriler
Karşılaştırma türü seçilebilmeli:
- Revenue
- Net Profit
- Payments Received
- Bank Cash Flow
- Orders
- Customers
Current ve historical profit aynı grafikte gösterilmeli; Bank ayrı grafik veya ayrı eksen kullanmalı.
11. Bank Activity
Gösterilen değerler:
- This Month: £626.19
- This Year: £1,220.54
- Incoming This Month: £4,050.50
- Son banka hareketleri
- Fixed ≈ £199/month
- Aylık ve yıllık değişim
Bölüm görsel olarak başarılı ve Banking ekranına geçişler doğru yerde.
İsimlendirme sorunu
This Month £626.19 değerinin ne olduğu açık değil.
Muhtemelen:
- Net bank cash flow
Ancak şu değerlerden biri de olabilir:
- Spending
- Account balance change
- Categorized net
- Cleared transactions only
Daha açık başlık:
- Net Cash Flow This Month
- Bank Net This Month
Eksiklikler
- Bank account bakiyesi yok.
- Pending bank transactions ayrılmıyor.
- Reconciled/unreconciled ayrımı yok.
- Birden fazla banka hesabı desteği görünmüyor.
- Bank sync hatası veya gecikme durumu yeterince belirgin değil.
- Son sync tarihi 21 Ağustos, test tarihi 25 Ağustos; veri dört gün eski olmasına rağmen yalnız “Synced” yazıyor.
Öneri:
- Last synced 4 days ago
- Güncel değilse turuncu uyarı
- Sync now
- Hesap seçimi
- Reconciliation status
12. Bank karşılaştırma yüzdeleri
Dashboard:
- This Month: ↑58% vs last month
- Incoming: ↑105% vs last month
Yüzde karşılaştırmalarında geçen ay sıfır veya negatif olduğunda standart yüzde hesabı yanıltıcı olabilir.
Tooltip içinde şu bilgiler olmalı:
- Current period
- Previous period
- Absolute difference
- Percentage calculation
Örneğin:
£626.19 vs £396.32
+£229.87 / +58.0%

13. Tax set-aside
Bölüm şu değerleri gösteriyor:
- Set aside this year: £6,416.80
- This Month: £312.80
- Paid from bank: £0
- Still to hold: £6,416.80
Bu alan işletme sahipleri için oldukça yararlı.
Kapsam problemi
Kullanıcı Week, Custom veya All seçse bile Tax set-aside kartı sabit olarak “this year” ve “this month” bilgisi gösteriyor.
Bu teknik olarak yanlış olmayabilir; başlıkları zaten yıl/ay olarak belirtilmiş. Ancak diğer bütün bölümler aktif filtreyle değiştiği için kullanıcı Tax kartının da filtreye bağlı olduğunu düşünebilir.
Öneri:
- Kartın üstünde Calendar year tax position yazmalı.
- Veya tarih filtresine bağlanmalı.
- Aktif Dashboard filtresinden bağımsızsa farklı bir görsel blokta sunulmalı.
Vergi gereksinimleri
Shopify/WooCommerce için şu ayrımlar gerekebilir:
- Output VAT
- Input VAT
- VAT payable
- VAT already paid
- VAT period
- Tax exempt sales
- Zero-rated sales
- Reduced rate
- Marketplace-collected tax
- Country/jurisdiction
Şu an VAT Amount = Tax set-aside kabul ediliyor. Input VAT düşülmüyorsa gerçek ödenecek VAT daha düşük olabilir.
14. Financial Breakdown
Mevcut breakdown:
- Revenue
- Base Cost
- Extra Spending
- Platform Fee
- Shipping
- VAT Amount
- Net Profit
Matematiksel yapı kolay okunuyor ve negatif tutarların kırmızı gösterilmesi doğru.
Eksikler
- Discounts
- Refunds
- Chargebacks
- Payment processing fee
- Shopify subscription/app costs
- WooCommerce plugin/hosting costs
- Labour cost
- Bank fees
- Currency conversion fee
- Input VAT
- Tax-exempt revenue
- Uncollectible balance
E-ticaret için daha ayrıntılı waterfall görünümü faydalı olur:
Gross Sales → Discounts → Refunds → Net Sales → COGS → Fees → Shipping → Tax → Profit
15. Extra Spending Summary kapsam tutarsızlığı
Year Financial Breakdown içinde:
- Extra Spending: £120
görünüyor.
Fakat hemen altındaki Extra Spending Summary:
- £479.72
- 9 entries
gösteriyor.
Summary değeri aktif Year filtresiyle aynı kapsamda görünmüyor; muhtemelen tüm zamanların toplamını gösteriyor.
Eğer bilerek all-time gösteriliyorsa başlıkta açıkça yazılmalı:
Extra Spending Summary · All Time

Daha iyi seçenek:
- Dashboard tarih filtresine uyması
- Filtre dışıysa ayrı dönem etiketi taşıması
16. Net Profit Analysis grafiği
Grafik:
- Aylık/yıllık dönem ekseni
- Para ölçeği
- Current
- Bank
- Tarih karşılaştırmaları
sunuyor.
Görsel sorunlar
- Grafik alanı çok yüksek ve geniş.
- Açık renk çizgiler beyaz/gri zeminde zayıf kalabiliyor.
- Çizgilerin anlamı yalnız legend üzerinden anlaşılıyor.
- Veri noktalarının kesin değerleri görünmüyor.
- Bank ve Net Profit aynı ölçekte sunuluyor.
- Negatif değerler için eksen davranışı açık değil.
Öneriler
Hover tooltip:
- Tarih
- Revenue
- Cost
- VAT
- Net Profit
- Bank Net
göstermeli.
Ek olarak:
- Line/bar görünümü seçimi
- Cumulative seçeneği
- Net Profit margin çizgisi
- Negatif ayların kırmızı alanla gösterilmesi
- Noktaya tıklayınca ilgili siparişleri açma
- Grafik PNG/CSV indirme
17. Dashboard Customize
Customize panelinde şu kartlar açılıp kapatılabiliyor:
- Standard Tax
- Pending
- Cost
- Platform Fee
- Shipping
- VAT Amount
- Net Profit
- Bank Spending
Bu işlev çalışır bir başlangıç.
Eksiklikler
- Kart sıralaması değiştirilemiyor.
- Kart boyutu değiştirilemiyor.
- Bank, Tax, Breakdown ve grafik gibi büyük bölümler gizlenemiyor.
- Hazır dashboard görünümleri yok.
- Kullanıcıya özel ve workspace ortak düzen ayrımı görünmüyor.
- Reset to default seçeneği yok.
- Yönetici ve ekip üyesi için farklı dashboard düzenleri yok.
Önerilen şablonlar
- Owner
- Finance
- Sales
- Production
- Cash Flow
- Ecommerce
- Minimal
Customize, Orders kart sistemindeki gibi sürükleme ve görünürlük yönetimi kullanabilir. Aynı kişiselleştirme dili korunmuş olur.
18. Export CSV
Export CSV düğmesi görünür ve doğru konumda.
CSV şu bilgileri mutlaka içermeli:
- Seçili tarih aralığı
- Currency
- Revenue
- Paid
- Pending
- Refunds
- Costs
- Fees
- VAT
- Net Profit
- Order ID
- External platform ID
- Store
- Data source
- Export timestamp
Dosya adı örneği:
nivadesk-dashboard-2026-year-2026-08-25.csv
CSV’nin aktif Dashboard filtresini ve muhasebe modunu kullandığı kullanıcıya belirtilmeli.
19. Shopify ve WooCommerce gereksinimleri
Dashboard’da e-ticaret siparişleri için şu metrikler eksik:
Satış
- Gross Sales
- Net Sales
- Discounts
- Refunds
- Average Order Value
- Orders by Store
- Orders by Channel
- New vs Returning Customers
- Repeat Purchase Rate
Tahsilat
- Paid
- Pending
- Partially Paid
- Failed Payments
- Chargebacks
- Payouts in Transit
- Shopify Payments/Stripe reconciliation
Operasyon
- Unfulfilled
- Partially Fulfilled
- Ready to Ship
- Late
- Returned
- Cancelled
- Average Fulfilment Time
Müşteri
- New Customers
- Repeat Customers
- Customer Lifetime Value
- Inactive Customers
- High-Value Customers
- Customers with Outstanding Balance
Mağaza ve kaynak
- Shopify
- WooCommerce
- Manual
- Marketplace
- POS
Birden fazla store bağlanırsa Dashboard:
- All Stores
- Store A
- Store B
filtresi sunmalı.
20. Çoklu para birimi
Dashboard tüm değerleri GBP gösteriyor.
Shopify/WooCommerce farklı para birimlerinde sipariş getirebilir.
Gerekli kararlar:
- Sipariş para birimi
- Store para birimi
- Workspace reporting currency
- Kullanılan kur
- Kur tarihi
- Kur farkı
- Refund’un orijinal kuru
Dashboard değerleri normalize ediliyorsa:
Converted to GBP using transaction-date exchange rates.

açıklaması olmalı.
21. Görsel tasarım ve renkler
Güçlü yönler
- Beyaz kartlar ve açık gri zemin temiz görünüyor.
- Üst KPI kartları hızlı taranabiliyor.
- Gelir/kâr için yeşil, maliyet için kırmızı kullanılması anlaşılır.
- Bank Activity ayrı bir bölüm olarak güçlü.
- Tax set-aside görsel olarak finansal breakdown’dan ayrılıyor.
- Mavi aktif filtreler genel NivaDesk tasarımıyla uyumlu.
İyileştirmeler
- Üstte yedi eşit KPI kartı aynı öneme sahipmiş gibi görünüyor.
- Revenue, Pending ve Net Profit diğerlerinden daha önemli olmalı.
- Çok fazla beyaz kart görsel önceliği zayıflatıyor.
- Açık gri yazılar bazı alanlarda düşük kontrastlı.
- Emoji tarzı ikonlar profesyonel ikon sistemiyle tam uyumlu değil.
- Kırmızı hem maliyet hem VAT için kullanılıyor; VAT borç/yükümlülük olarak farklı renk kullanabilir.
- Bank bölümündeki küçük grafikler eksensiz olduğu için dekoratif kalıyor.
- Büyük Net Profit grafiği ekranın önemli kısmını kaplıyor.
Önerilen hiyerarşi
Birinci sıra:
- Revenue
- Payments Received
- Outstanding
- Net Profit
İkinci sıra:
- Costs
- Fees
- Shipping
- VAT
Alt bölümler:
- Cash Flow
- Sales & Orders
- Tax
- Profit Trend
- Customer Metrics
- Operational Alerts
22. Mobil ve responsive tasarım
Mobil görünümde KPI kartlarının tek sütuna düşmesi sayfayı çok uzatabilir.
Öneri:
- İlk dört KPI yatay kaydırılabilir kartlar
- Diğer finans kartları “More metrics” altında
- Grafikler daha kısa
- Bank transactions en fazla üç kayıt
- Customize mobil bottom sheet
- Tarih filtreleri yatay kaydırılabilir
- Kritik aksiyonlar üstte sabit
23. Teknik uyarı
Dashboard kullanımı sırasında tekrarlanan uyarı:
NEXT_PUBLIC_FIREBASE_VAPID_KEY is not configured — skipping push registration.

Dashboard hesaplamalarını doğrudan bozmadı; ancak uyarı ve takip bildirimlerinin push olarak çalışmamasına neden olabilir.
Önceliklendirme
Kritik
1. Üst menü Month/Year Net ile Dashboard Net Profit formüllerinin farklı olması.
2. Finansal metrik isimlerinin tek merkezi tanıma bağlanması.
3. Cash ve accrual gelirlerinin ayrılması.
Yüksek
1. Growth değerinin yön işaretinin yanlış olması: +24.8% yerine yaklaşık −24.8%.
2. Standard Tax (Services/New) kartının Revenue olarak doğru isimlendirilmesi.
3. Pending değerinin tanımlanması.
4. Refund, cancellation ve chargeback hesaplarının eklenmesi.
5. Extra Spending Summary dönem kapsamının açıklanması.
6. VAT set-aside hesabının input VAT ve ödenmiş vergiyle ayrılması.
Orta
1. Active Orders ve Due Soon formüllerinin açıklanması.
2. Bank Activity değerlerinin Net Cash Flow olarak adlandırılması.
3. Eski banka senkronizasyonu için uyarı.
4. Grafik tooltip ve drill-down.
5. Dashboard Customize kapsamının genişletilmesi.
6. Store ve channel filtreleri.
7. Çoklu para birimi desteği.
Ürün geliştirmeleri
1. Owner/Finance/Ecommerce dashboard şablonları.
2. Payments Received ve Outstanding ayrımı.
3. New/Returning customers.
4. Average Order Value.
5. Refund ve fulfilment göstergeleri.
6. Tıklanabilir KPI kartları.
7. Dashboard düzenini sürükleme.
8. Muhasebe modu seçimi.
9. Store bazlı raporlama.
10. Kapsamı açık CSV export.
Genel sonuç
Dashboard’ın temel yapısı iyi ve görsel olarak profesyonel bir başlangıç sunuyor. Tarih filtreleri, finans kartları, banka özeti, vergi bölümü, breakdown ve karşılaştırma grafikleri çalışıyor.
Fakat finansal Dashboard için güven en önemli unsur. Kullanıcı üst menüde £29,651.48 “Year Net”, Dashboard’da £23,114.68 “Net Profit” gördüğünde hangi rakama güveneceğini anlayamaz. İlk geliştirme adımı, Revenue, Paid, Pending, Gross Profit, Pre-Tax Profit ve Net Profit tanımlarını bütün uygulamada tek formüle ve tek terminolojiye bağlamak olmalı.
