NivaDesk Files ve Inventory — Nihai Değerlendirme Raporu
Bu rapor, mevcut NivaDesk yapısı, canlı uygulamada incelenen özellikler ve hazırlanan Inventory Management Dashboard Mockup birlikte değerlendirilerek hazırlanmıştır.

1. Genel değerlendirme
Hazırlanan görsel, önerilen Inventory yapısına yaklaşık %85–90 oranında uyuyor. Mevcut NivaDesk Inventory ekranına göre önemli bir gelişme gösteriyor.
Özellikle şu alanlar doğru tasarlanmış:
- Inventory’nin tam genişlikte ve profesyonel bir çalışma alanına dönüşmesi
- Sol menü, merkezi liste ve sağ detay panelinden oluşan üç sütunlu yapı
- Unique item ve quantity item ayrımı
- Ürün fotoğrafları
- Available, Reserved, Incoming ve Low Stock durumları
- Purchase, supplier ve bank transaction bağlantıları
- Receipt/invoice gösterimi
- Item’ın bir order için reserve edilebilmesi
- Item geçmişi
- Konum yönetimi
- QR/barkod kullanımı
- Fotoğraflar ve belgeler için ayrı görünümler
- Stok sayımı, raporlar ve kategori yönetimi
Tasarım, NivaDesk’in sadece bir stok listesi değil; satın alma, fiziksel ürün, dosya, finans ve order ilişkilerini bir araya getiren kapsamlı bir operasyon sistemi olabileceğini açıkça gösteriyor.
INVENTORY MENÜSÜ
2. Inventory’nin temel görevi
Inventory, işletmenin sahip olduğu veya sorumluluğunda bulunan fiziksel varlıkların merkezi olmalıdır.
Örneğin:
- Saatler
- Kadranlar
- Movement’lar
- Strap ve bracelet
- Parçalar
- Boya ve tüketim malzemeleri
- Ambalaj
- Araçlar
- Müşteriye ait ancak işletmede bulunan ürünler
Her item için şu bilgiler tutulabilmelidir:
- Unique item veya quantity item
- Ürün adı
- SKU
- Seri numarası
- Barkod veya QR kodu
- Marka ve model
- Kategori
- Mevcut adet
- Reserved adet
- Kullanılabilir adet
- Birim
- Alış maliyeti
- İlave maliyetler
- Güncel veya tahmini değer
- Supplier
- Purchase
- Bank transaction
- Receipt/invoice
- Fiziksel konum
- Stok durumu
- Bağlı order
- Fotoğraflar ve belgeler
- Hareket geçmişi
- Müşteriye ait olup olmadığı
Örnek yaşam döngüsü:
Rolex Air-King 5500
→ PUR-084 ile £2,100’a satın alındı
→ Banka işlemi eşleştirildi
→ Invoice bağlandı
→ Safe A konumuna yerleştirildi
→ Available oldu
→ Order #1089 için Reserved yapıldı
→ Order tamamlanınca Used/Sold oldu
Bu yaşam döngüsünün tamamı item geçmişinde görülebilmelidir.
3. Unique ve Quantity item ayrımı
Mevcut sistemde bulunan bu ayrım doğrudur ve mockup içinde de anlaşılır biçimde gösterilmiştir.
Unique Item
Tekil olarak takip edilen ürünlerdir:
- Saat
- Özel kadran
- Seri numaralı parça
- Tekil sanat eseri
- Müşterinin bıraktığı ürün
Bunlarda genellikle adet 1 olur ve seri numarası, kondisyon, geçmiş, özgün fotoğraflar gibi bilgiler önemlidir.
Quantity Item
Adet veya ölçüyle tüketilen stoklardır:
- Vida
- Cam
- Ambalaj
- Boya
- Temizlik sıvısı
- Tüketim malzemesi
Bunlarda şunlar ayrıca tutulmalıdır:
- On hand
- Reserved
- Available
- Reorder level
- Kullanılan miktar
- Birim: adet, ml, metre, gram vb.
Örneğin 82 ml boya gibi bir stok ile 1 adet Rolex aynı mantıkla işlenmemelidir.
4. Inventory durumları
Mockuptaki durum renkleri genel olarak başarılı:
- Available — yeşil
- Reserved — turuncu
- Incoming — mavi
- Low Stock — kırmızı
- Sold/Used — gri
Ancak statülerin kesin iş kuralları tanımlanmalıdır.
Önerilen durumlar:
- Draft
- Incoming
- Available
- Partially Reserved
- Reserved
- In Use
- Used
- Sold
- Returned
- Damaged
- Lost
- Archived
Durumlar yalnızca görsel etiket olmamalı; stok hesaplarını da değiştirmelidir.
Örneğin:
On Hand: 10
Reserved: 3
Available: 7
Quantity item’ın tamamı değil bir bölümü reserve edildiyse Partially Reserved kullanılabilir.
5. Order ile Inventory ilişkisi
Order içindeki Materials & Inventory kartı, order için ayrılmış veya kullanılmış fiziksel ürünleri göstermelidir.
Örneğin:
Materials & Inventory

Rolex Air-King 5500
Reserved · 1 item · £2,100

Sapphire Crystal 31 mm
Reserved · 1 of 4

Black Dial Paint
Used · 8 ml
Bu karttan kullanıcı şunları yapabilmelidir:
- Inventory item’ı görüntüleme
- Item reserve etme
- Reserve işlemini kaldırma
- Kullanılan miktarı kaydetme
- Başka item ile değiştirme
- Stoka iade etme
- Fire, kayıp veya hasar kaydetme
- Fiziksel konumu görme
- Maliyet bilgisini yetkiye göre görme
- Item hareket geçmişine ulaşma
Bir item reserve edildiğinde:
- Inventory’de Reserved görünmeli.
- Hangi order’a ayrıldığı gösterilmeli.
- Order’daki Materials & Inventory kartında görünmeli.
- Inventory hareket geçmişine kayıt düşülmeli.
- Uygun stok miktarı azaltılmalı.
- Aynı unique item başka order’a aynı anda ayrılamamalı.
6. Mockuptaki Inventory detay paneli
Sağ taraftaki detay paneli tasarımın en güçlü bölümlerinden biridir.
Mevcut sekmeler:
- Details
- History
- Purchases
- Photos
- Files
Bu yapı uygundur.
Details
Temel ürün bilgileri, inventory bilgileri ve mevcut bağlantılar burada bulunabilir.
History
Şu olayları göstermelidir:
- Item oluşturuldu
- Purchase ile ilişkilendirildi
- Bank transaction eşleştirildi
- Konum değiştirildi
- Değeri değiştirildi
- Order için reserve edildi
- Reservation kaldırıldı
- Kullanıldı veya satıldı
- Dosya eklendi
- Dosya order ile paylaşıldı
Her kayıtta kullanıcı, tarih-saat ve yapılan değişiklik bulunmalıdır.
Purchases
Item’ın hangi purchase ile alındığını ve geçmiş satın almalarını göstermelidir. Quantity item birden fazla purchase ile alınmışsa maliyet katmanları görülebilmelidir.
Photos
Görsel galeri deneyimi sunmalıdır. Ancak fotoğraflar ayrı bir depoda tutulmamalı; merkezi Files altyapısındaki görsel dosyalar burada galeri biçiminde gösterilmelidir.
Files
Invoice, certificate, service receipt ve diğer belgeler burada görünmelidir. Bu dosyalar da merkezi Files altyapısındaki aynı kayıtlardır.
7. Linked Records alanı
Mockuptaki Linked To alanı doğru yönde ancak yalnızca order ilişkisini göstermemelidir.
Daha kapsamlı hâli şöyle olabilir:
Linked Records

Purchase
PUR-084

Supplier
ABC Watches

Bank Transaction
£2,100 · Matched

Order
Not linked

[Reserve for Order]
Böylece kullanıcı item’ın bütün operasyonel bağlantılarını tek yerde görebilir.
8. Purchase yönetimi
Purchase kaydı şu alanları desteklemelidir:
- Supplier
- Purchase date
- Reference number
- Para birimi
- Item listesi
- Adet ve birim fiyat
- VAT/vergi
- Shipping
- Diğer maliyetler
- Toplam
- Ödeme durumu
- Bank transaction
- Invoice/receipt
- Expected delivery
- Received quantity
- Notes
Özellikle şu süreçler eksiksiz düşünülmelidir:
- Tam teslim alma
- Kısmi teslim alma
- Eksik veya hasarlı ürün
- İade
- Purchase iptali
- Birden fazla bank transaction ile ödeme
- Birden fazla invoice
- İlave masrafların item maliyetine dağıtılması
Purchase oluşturulunca ürün doğrudan Available olmamalıdır. Teslim alınmamışsa önce Incoming olmalı; teslim alma işleminden sonra stoğa geçmelidir.
9. Supplier yönetimi
Mevcut temel alanlara ek olarak şunlar önerilir:
- Supplier code
- Adres
- Vergi/VAT numarası
- Para birimi
- Ödeme koşulları
- Teslimat süresi
- Ana iletişim kişisi
- Supplier belgeleri
- Aktif/pasif durumu
- Toplam satın alma
- Açık purchase’lar
- İade ve sorun geçmişi
Supplier detayından ilişkili purchase, item ve dosyalara ulaşılabilmelidir.
10. Stocktake
Stocktake yalnızca bir sayım formu değil, kontrollü bir stok doğrulama süreci olmalıdır.
Akış:
Taslak sayım
→ Konum veya kategori seçimi
→ Beklenen miktar
→ Sayılan miktar
→ Farkların incelenmesi
→ Onay
→ Stok düzeltmesi
→ Audit kaydı
Şunları desteklemesi faydalıdır:
- QR/barkod ile sayım
- Konuma göre sayım
- Kategoriye göre sayım
- Kısmi sayım
- Sayım sırasında stok hareketlerini kilitleme veya uyarma
- Fark nedeni
- Yetkili onayı
- Sayım raporu
11. Categories ve Locations
Mockuptaki kategori yapısı saat işletmesi için oldukça uygun. Ancak NivaDesk farklı işletmeler tarafından kullanılacaksa kategoriler çalışma alanına göre özelleştirilebilmelidir.
Başlangıç şablonları sunulabilir:
- Watch repair
- Jewellery
- Photography studio
- Signage
- Furniture/workshop
- General service business
Location sistemi hiyerarşik olabilir:
Main Workshop
└── Safe A
    └── Shelf 2
        └── Box 4
Item hareket ettirildiğinde eski ve yeni konum History’de görünmelidir.
12. KPI kartlarının açıklığı
Mockuptaki üst KPI kartları faydalı ancak tanımları netleştirilmelidir:
- Total Inventory Value
- Unique Items
- Quantity Items
- Reserved for Orders
- Incoming
- Low Stock
Özellikle:
- Total Inventory Value alış maliyeti mi, güncel değer mi?
- Quantity Items toplam stok adedi mi, farklı SKU sayısı mı?
- Reserved for Orders maliyet değeri mi, satış değeri mi?
- Low Stock kaç ürün satırını mı, eksik toplam miktarı mı gösteriyor?
Başlıklara tooltip eklenebilir. Değer temeli kullanıcı tarafından seçilebilir:
Inventory Value
[Purchase Cost] [Current Value]
13. Arama, filtre ve toplu işlemler
Mockuptaki filtre alanı uygundur. Şunlar desteklenmelidir:
- Search
- Category
- Type
- Status
- Location
- Supplier
- Linked order
- Customer-owned
- Purchase date
- Updated date
- Low stock
- Has/does not have file
- Has/does not have purchase
- Has/does not have bank match
Checkbox seçimi mutlaka toplu işlem araçlarını açmalıdır:
- Move location
- Change category
- Assign supplier
- Print QR/barcode
- Export
- Archive
- Stock adjustment
Satıra tıklamak sağ paneli açmalı; checkbox ise yalnızca çoklu seçim için kullanılmalıdır. Bu iki davranış birbirine karışmamalıdır.
14. QR ve barkod
QR/barkod bölümü yararlıdır; ancak erişim güvenliği düşünülmelidir.
QR tarandığında:
- Giriş yapmış yetkili kullanıcı item detayını görebilir.
- Yetkisiz kullanıcı maliyet veya supplier bilgilerini görememelidir.
- QR içinde doğrudan hassas veri bulunmamalıdır.
- Gerekirse iptal edilebilir bir kimlik/token kullanılmalıdır.
- QR etiketi yeniden üretilebilmelidir.
Mobil kullanımda hızlı işlemler sunulabilir:
- Move
- Reserve
- Release
- Count
- Mark as used
- Add photo
15. Import ve dış sistem bağlantıları
Mevcut başlangıç stoğu içe aktarma özelliği yalnızca isim, adet ve fiyatla sınırlı kalmamalıdır.
CSV şablonunda şunlar bulunabilir:
- Name
- Type
- Category
- SKU
- Serial number
- Quantity
- Unit
- Location
- Supplier
- Purchase date
- Purchase price
- Current value
- Reorder level
- Customer-owned
- Notes
Ayrıca duplicate politikası seçilmelidir:
- Yeni kayıt oluştur
- SKU eşleşirse güncelle
- Seri numarası eşleşirse atla
- Kullanıcıya eşleşmeleri göster
Shopify ve WooCommerce bağlantısında ayrıca:
- Platform item/product ID
- Variant ID
- Store
- Sync status
- Last sync
- Stok kaynağı
- İade ve iptal etkileri
- Çakışma çözümü
gibi alanlar gerekir.
FILES MENÜSÜ
16. Files’ın temel görevi
Files, NivaDesk içindeki bütün belgelerin merkezi kütüphanesidir.
Temel kural:
Bir dosya yalnızca bir kez yüklenir; farklı order, inventory item, purchase, supplier veya transaction kayıtlarına bağlantı kurulur.

Örneğin:
invoice.pdf
├── Inventory Item: Rolex Air-King 5500
├── Purchase: PUR-084
├── Supplier: ABC Watches
└── Bank Transaction: £2,100
Burada dört dosya kopyası değil, tek dosyaya ait dört ilişki bulunur.
17. Önerilen Files menüsü
All Files
Recent
Shared with Clients
Internal Only
Unlinked Files

BY CONNECTION
Client & Orders
Inventory
Purchases
Suppliers
Bank Transactions

MANAGE
Tags
Storage
Trash
Bu yapı sayesinde kullanıcı dosyaları hem türüne hem bağlantısına göre bulabilir.
18. Files ekranının önerilen yerleşimi
Inventory mockup ile görsel olarak uyumlu üç panelli bir yapı kullanılabilir.
Sol panel
Dosya kategorileri, bağlantı türleri ve kayıtlı görünümler.
Orta panel
- Search
- Filtreler
- Liste/grid görünümü
- Dosya önizlemeleri
- Dosya adı
- Bağlantılar
- Görünürlük
- Yükleyen
- Tarih
- Boyut
- Versiyon
Sağ panel
- Önizleme
- Dosya bilgileri
- Bağlı kayıtlar
- Görünürlük
- Versiyonlar
- Aktivite geçmişi
- Download
- Rename
- Replace/new version
- Add link
- Remove link
- Share with order
- Move to trash
19. Mevcut Files ekranındaki sorunlar
Canlı sistemde görülen başlıca sorunlardan biri terminoloji çelişkisidir:
- Sayfa Read-only file index olarak tanımlanıyor.
- Buna rağmen Upload, Rename, Delete ve Delete All işlemleri bulunuyor.
Bu nedenle Read-only ifadesi kaldırılmalı veya gerçekten neyin salt okunur olduğu açıklanmalıdır.
Ayrıca mevcut Files ekranında şu geliştirmeler gereklidir:
- Arama
- Filtreleme
- Sıralama
- Sayfalama
- Grupları daraltma
- Liste/grid seçimi
- Dosya kategorileri
- Görünürlük bilgisi
- Portal paylaşım durumu
- Versiyon geçmişi
- Bağlı kayıtların gösterilmesi
- Dosya aktivite geçmişi
- Trash/geri yükleme
Delete All gibi riskli işlemler, ZIP indirme düğmesinin hemen yanında ve aynı görsel ağırlıkta olmamalıdır.
20. Order içindeki Client Files
Client Files, müşteriye veya order’a ait çalışma dosyalarını göstermelidir:
- Müşteriden gelen fotoğraflar
- Design reference
- Approved design
- PDF
- Sketch
- Müşteri belgesi
- Teslim dosyası
- Portalda paylaşılacak belge
Bu dosyalar merkezi Files kütüphanesinde de görünür.
Ancak Client Files ayrı bir fiziksel depolama alanı değildir. Dosyanın order ile bağlantısını ve kullanım amacını temsil eder.
21. Inventory Files ile Client Files ayrımı
Inventory item’a bağlı belgeler farklı amaç taşır:
- Purchase invoice
- Supplier photos
- Authenticity certificate
- Service receipt
- Condition photos
- İç maliyet belgesi
Bir item order’a reserve edildiğinde bu belgelerin tamamı otomatik olarak Client Files’a aktarılmamalıdır.
Doğru yapı:
ORDER
├── Client Files
└── Materials & Inventory
    └── Rolex Air-King 5500
        └── View Inventory Item
            └── Inventory Files
Bunun nedeni purchase invoice, supplier bilgisi ve maliyet gibi bilgilerin müşteriye gösterilmemesi gerektiğidir.
22. Share with Order
Inventory dosyasının order ile paylaşılması için kontrollü bir işlem bulunabilir.
Önerilen akış:
1. Inventory Item içinden dosya seçilir.
2. Share with Order seçilir.
3. İlgili order belirlenir.
4. Görünürlük seçilir:
   - Order team only
   - Client portal visible
   - Internal only
5. Gerekirse müşteriye gösterilecek dosya adı değiştirilir.
6. Dosya kopyalanmadan order bağlantısı oluşturulur.
Örnek:
authenticity-certificate.pdf
├── Inventory Item: Rolex Air-King 5500
└── Order #1089
    ├── Display name: Authenticity Certificate
    └── Client portal visible: Yes
Paylaşım kaldırılırsa sadece order bağlantısı silinmeli; Inventory’deki asıl dosya korunmalıdır.
23. Dosya görünürlüğü ve güvenlik
Dosyanın bağlantısı ile görünürlüğü ayrı kavramlar olmalıdır.
Örneğin:
File
certificate.pdf

Linked Records
Inventory Item INV-00147
Order ORD-01089

Visibility
Internal users: Yes
Client portal: Yes
Önemli kurallar:
- Inventory’nin order’a bağlanması dosyaları otomatik olarak paylaşmamalı.
- Portal paylaşımı ayrıca onaylanmalı.
- Invoice ve bank belgeleri varsayılan olarak Internal only olmalı.
- Team Member yetkileri kontrol edilmeli.
- Remove from this record ile Delete file farklı işlemler olmalı.
- Birden fazla kayda bağlı dosya silinirken uyarı gösterilmeli.
- Silme, paylaşma ve bağlantı kaldırma işlemleri History’ye yazılmalı.
- Dosya bağlantıları iptal edilebilir olmalı.
- Doğrudan storage adresleri veya kalıcı erişim token’ları kontrolsüz paylaşılmamalı.
24. Photos ve Files sekmeleri
Mockupta Photos ve Files sekmelerinin ayrı olması uygundur.
Fark:
- Photos: Görsel galeri deneyimi
- Files: PDF, invoice, certificate ve diğer belgeler
Ancak ikisi de aynı merkezi Files altyapısından beslenmelidir.
Purchase Info > Receipt içinde görünen PDF de yeni bir kopya olmamalıdır. Aynı dosya Purchase, Inventory Item, Supplier ve Bank Transaction kayıtlarıyla ilişkilendirilmelidir.
25. Versiyonlama
Özellikle tasarım ve müşteri onayı bulunan işletmelerde dosya versiyonlama önemlidir.
Örnek:
Approved Design.pdf
v1 — uploaded
v2 — revised
v3 — client approved
Yeni versiyon yüklenince eski dosyanın tamamen kaybolmaması gerekir. Kullanıcı:
- Eski versiyonu görüntüleyebilmeli
- Aktif versiyonu seçebilmeli
- Onaylanmış versiyonu işaretleyebilmeli
- Portalda yalnızca seçilen versiyonu paylaşabilmeli
MOCKUP İLE UYUMLULUK
26. Mockup önerilerle ne kadar uyumlu?
Mockup genel olarak önerilen mimariye güçlü biçimde uyuyor.
Alan    Uyumluluk    Değerlendirme
Üç panelli yerleşim    Çok iyi    Yoğun bilgiyi düzenli gösteriyor
Unique/Quantity ayrımı    Çok iyi    Inventory mantığını doğru anlatıyor
Status renkleri    İyi    Kurallar ve kısmi reservation eklenmeli
Purchase bağlantısı    Çok iyi    Receipt ve bank match doğru yerde
Supplier bağlantısı    İyi    Sağ panelde daha görünür olabilir
Order reservation    Çok iyi    Materials & Inventory ilişkisini destekliyor
Photos/Files    Çok iyi    Merkezi Files altyapısını kullanmalı
History    Çok iyi    Audit trail için uygun
Location    Çok iyi    Hiyerarşik location eklenebilir
QR/barkod    İyi    Yetki ve güvenlik kuralları gerekli
KPI kartları    İyi    Değerlerin tanımları açıklanmalı
Filtreler    İyi    Supplier, order ve bağlantı filtreleri eklenmeli
Sayfalama    Çok iyi    Büyük stoklar için gerekli
Workspace özelleştirmesi    Geliştirilmeli    Kategoriler işletmeye göre değişebilmeli
Dosya görünürlüğü    Geliştirilmeli    Internal/portal ayrımı açık gösterilmeli


27. Mockupta korunması gereken tasarım kararları
- Item seçildiğinde sağ detay panelinin açılması
- Listeyi terk etmeden detay görüntüleme
- Item görsellerinin satırda bulunması
- Filtrelerin tablonun hemen üzerinde olması
- KPI kartlarının en üstte yer alması
- Status etiketlerinin renkli ama sade olması
- Purchase ve bank eşleşmesinin item detayında görülmesi
- Order reservation işleminin hızlı erişimde bulunması
- QR kodunun item detayından üretilebilmesi
- Konumun tabloda doğrudan görünmesi
- History, Photos ve Files için ayrı sekmeler
28. Mockupta geliştirilmesi gereken tasarım kararları
Yinelenen navigasyon
Purchases, Suppliers ve Stocktake hem sol menüde hem üst sekmelerde bulunuyor. Bu, kullanıcıda “hangisi farklı?” sorusu yaratabilir.
Öneri:
- Sol menü ana navigasyon olsun.
- Üst sekmeler seçilen bölümün alt görünümü olarak kullanılsın.
- Ya da üst tekrar tamamen kaldırılıp merkez başlık ve aksiyon alanı bırakılabilir.
Panel genişlikleri
Üç panel oldukça kullanışlı fakat sağ panel dar ekranlarda merkezi tabloyu fazla sıkıştırabilir.
Öneri:
- Sol panel daraltılabilir.
- Sağ panel kapatılabilir.
- Panel genişlikleri sürüklenerek değiştirilebilir.
- Kullanıcının seçtiği genişlik hatırlanabilir.
- Tablet ekranında sağ panel drawer olarak açılabilir.
Bilgi yoğunluğu
Sağ tarafta çok sayıda küçük kutu bulunuyor. Bu yapı büyük ekranda başarılı; daha küçük ekranda yorucu olabilir.
Öneri:
- Basic Information ve Inventory Details katlanabilir bölümler olabilir.
- Kritik bilgiler ilk sıraya alınabilir.
- Daha az kullanılan alanlar More details altında tutulabilir.
- Quick Actions bağlama göre gösterilebilir.
Renkler
Renk sistemi genel olarak dengeli. Ancak rengin tek anlam taşıyıcısı olmaması gerekir.
Örneğin Reserved yalnızca turuncu renkle değil, metin ve mümkünse ikonla da belirtilmelidir. Bu erişilebilirlik açısından önemlidir.
Row selection
Mavi kenarlı seçili satır sağ panelde açılan item’ı, checkbox ise toplu seçimi göstermeli. İki seçim durumu görsel olarak farklı tutulmalıdır.
ÖNCELİKLİ GELİŞTİRME SIRASI
Birinci aşama — Temel veri mimarisi
1. Tek merkezi Files kaydı
2. Çoklu record linking
3. Client/internal görünürlük sistemi
4. Unique/quantity Inventory modeli
5. Purchase–Supplier–Transaction ilişkileri
6. Order reservation sistemi
7. Stok hareket geçmişi
8. Yetkilendirme ve audit trail
İkinci aşama — Ana kullanıcı deneyimi
1. Mockuptaki üç panelli Inventory ekranı
2. Arama, filtre ve sayfalama
3. Sağ item detay paneli
4. Photos ve Files sekmeleri
5. Linked Records
6. Materials & Inventory order kartı
7. Share with Order
8. Files merkezi kütüphanesinin yeniden tasarlanması
Üçüncü aşama — Gelişmiş operasyonlar
1. Partial reservation
2. Partial purchase receipt
3. Stocktake
4. QR/barkod
5. Versiyonlama
6. Shopify/WooCommerce sync
7. Maliyet katmanları
8. İade, hasar, kayıp ve fire süreçleri
9. Inventory raporları
10. BOM/reçete veya ürün bileşeni sistemi
Nihai mimari
FILES — Merkezi dosya kütüphanesi
│
├── Order / Client Files
├── Inventory Files
├── Purchase Files
├── Supplier Files
└── Bank Transaction Files

ORDER
├── Client Files
└── Materials & Inventory
    └── INVENTORY ITEM
        ├── Purchase
        ├── Supplier
        ├── Bank Transaction
        ├── Location
        ├── History
        └── Files
Teknik ilişkinin özeti:
Inventory Item
↕
Purchase
↕
Supplier
↕
Bank Transaction
↕
Files
↕
Order Reservation
Sonuç
Hazırlanan görsel, anlatılan Inventory sistemini güçlü ve anlaşılır biçimde temsil ediyor. Sunumda bu görsel kullanılabilir. Ancak görselin yanında şu üç temel kuralın özellikle belirtilmesi gerekir:
1. Dosya bir kere yüklenir, farklı kayıtlara linklenir.
2. Inventory item’ın order’a bağlanması, Inventory dosyalarını otomatik olarak Client Files’a taşımaz.
3. Inventory belgesi ancak kontrollü bir “Share with Order” işlemi ve ayrıca belirlenen portal görünürlüğüyle müşteriye açılır.
Bu kurallar uygulandığında mockup yalnızca iyi görünen bir Inventory ekranı değil; güvenli, ölçeklenebilir ve NivaDesk’in diğer modülleriyle doğru ilişkilendirilmiş bir operasyon sistemi hâline gelir.
