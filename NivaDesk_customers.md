Customers bölümünü review@nivadesk.app hesabıyla; liste, profil, iletişim bilgileri, sipariş geçmişi, Files/Notes/Activity sekmeleri, arama, sıralama ve manuel müşteri oluşturma akışlarıyla birlikte inceledim.
Değerlendirmeyi özellikle Shopify ve WooCommerce’den siparişlerle beraber müşteri verilerinin otomatik gelmesi senaryosuna göre yaptım. Mevcut müşterilerde değişiklik yapmadım.
NivaDesk Customers kapsamlı test raporu
1. Genel değerlendirme
Customers bölümü şu anda güçlü bir başlangıç sunuyor:
- Müşteri listesi
- Arama
- Recent ve Most Orders sıralaması
- Toplam sipariş değeri
- Sipariş sayısı
- Son sipariş
- Müşteri başlangıç tarihi
- İletişim ve adres bilgileri
- Sipariş geçmişi
- Müşteri notu
- Dosyalar
- Sipariş notları
- Aktivite geçmişi
- Manuel müşteri ekleme
Ancak Shopify/WooCommerce entegrasyonu düşünüldüğünde Customers yalnız bir profil sayfası olmamalı. Müşteri eşleştirme, tekrar eden kayıt yönetimi, veri kaynağı, iletişim izinleri, iadeler ve gerçek müşteri yaşam boyu değeri gibi konuların da merkezi hâline gelmeli.
2. Sol müşteri listesi
Her müşteri kartında şu bilgiler gösteriliyor:
- Baş harf avatarı
- Müşteri adı
- E-posta veya telefon
- Satın alınan tasarımlar
- Sipariş sayısı
- Tarih
- Toplam değer
Bu yapı genel olarak anlaşılır ve seçilen müşteri mavi arka planla belirgin biçimde ayrılıyor.
Sorunlar
1 orders dilbilgisi hatası
Tek siparişli müşterilerde:
1 orders

yazıyor.
Doğrusu:
- 1 order
- 2 orders
Bu hata hem sol listede hem profil başlığında hem Order History başlığında görülüyor.
Tarihin anlamı belli değil
Müşteri kartlarında örneğin:
- 29 Dec 2026
- 25 Aug 2026
gibi tarihler bulunuyor; fakat bunun ne olduğu yazmıyor.
Bu tarih şunlardan biri olabilir:
- Son sipariş
- Son iletişim
- Profil güncelleme tarihi
- En son aktivite
- Entegrasyondan son senkronizasyon
Örneğin Richard Tilley kartında 29 Dec 2026 görünürken profil içindeki Last Order 29 Dec 2025. Bu nedenle karttaki tarihin “son sipariş” olmadığı anlaşılıyor; fakat kullanıcıya anlamı açıklanmıyor.
Öneri:
- Last contact: 29 Dec 2026
- Last order: 29 Dec 2025
gibi etiket kullanılmalı.
Çok siparişli müşterilerde proje isimleri listeyi uzatıyor
Emma Testcustomer kartında üç proje adı alt alta gösteriliyor. Sipariş sayısı yükseldikçe kart çok uzayabilir.
Öneri:
- İlk iki proje gösterilsin.
- Devamı +4 more olarak özetlensin.
- Hover veya tıklamayla tamamı açılsın.
Müşteri kaynağı görünmüyor
Shopify Customer isimli bir kayıt bulunmasına rağmen kart üzerinde bunun Shopify’dan geldiğini gösteren kaynak rozeti yok.
Gerekli rozetler:
- Shopify
- WooCommerce
- Manual
- API
- Imported CSV
- NivaDesk order
Kaynak bilgisi özellikle veri hatalarını çözmek için kritik.
3. Müşteri profil başlığı
Başlıkta:
- Avatar
- Müşteri adı
- Toplam değer
- Sipariş sayısı
gösteriliyor.
“Total Spent” yanlış anlaşılabilir
QA müşterisinin:
- Sipariş değeri: £1,450
- Ödenen: £400
- Kalan: £1,050
olmasına rağmen müşteri profilinde:
Total Spent £1,450

yazıyor.
Bu müşteri tarafından gerçekten ödenmiş tutar değil; toplam sipariş değeridir.
Daha doğru isim:
- Lifetime Order Value
- Total Order Value
- Gross Sales
Ayrıca gerçek finansal değerler ayrı gösterilmeli:
- Total Order Value: £1,450
- Paid: £400
- Outstanding: £1,050
- Refunded: £0
- Net Revenue: £400 veya işletmenin muhasebe tanımına göre gerçek net değer
Shopify/WooCommerce senaryosu
İptal, iade ve refund edilmiş siparişler toplam harcamaya dahil edilmemeli veya ayrıca gösterilmeli.
Önerilen müşteri finans özeti:
- Gross Orders
- Discounts
- Refunds
- Taxes
- Shipping
- Paid
- Outstanding
- Net Customer Value
- Average Order Value
4. İletişim bilgileri
Mevcut alanlar:
- Email
- WhatsApp
- Instagram
- Street
- City
- Postal Code
- Country
- Shipping Street
- Shipping City
- Shipping Postcode
- Shipping Country
- Shipping Phone
Billing ve Shipping ayrımı bulunması Shopify/WooCommerce açısından doğru.
Alan isimlendirme problemi
Order içindeki genel telefon numarası Customers tarafında WhatsApp alanına geliyor.
Örneğin QA müşterisinin 020 7946 0123 numarası WhatsApp olarak gösteriliyor. Bunun WhatsApp numarası olduğuna dair doğrulanmış bir bilgi bulunmuyor.
Önerilen yapı:
- Primary Phone
- Mobile
- WhatsApp
- Shipping Phone
WhatsApp ayrı ve doğrulanabilir bir kanal olmalı. Genel telefon otomatik olarak WhatsApp kabul edilmemeli.
Eksik alanlar
E-ticaret müşterileri için şu alanlara ihtiyaç var:
- First Name
- Last Name
- Company
- Billing Company
- Tax/VAT Number
- Billing Phone
- Primary Phone
- Language
- Preferred Contact Channel
- Customer Timezone
- Shopify/WooCommerce Customer ID
- Store name
- Customer tags
- Account type: Guest / Registered
- Marketing consent
- SMS consent
- Consent timestamp
- Consent source
Ülke alanı
Country serbest metin alanı yerine standart ülke seçimi olmalı:
- ISO country code
- Ülke adı
- Telefon ülke kodu
- Adres formatı
Örneğin UK, United Kingdom ve GB ayrı değerler gibi değerlendirilmemeli.
5. Shopify ve WooCommerce müşteri eşleştirmesi
Bu bölüm sistemin en önemli gereksinimlerinden biri.
Aynı kişi şu şekillerde farklı kayıtlar oluşturabilir:
- Shopify’da kayıtlı hesap
- Shopify guest checkout
- WooCommerce hesabı
- WooCommerce guest checkout
- Manuel NivaDesk siparişi
- Farklı e-posta
- Aynı telefon
- Aynı e-posta fakat farklı teslimat adresi
- Birden fazla mağazadan sipariş
Mevcut ekranda müşteri birleştirme veya olası duplicate uyarısı görünmüyor.
Mevcut veride duplicate riski işaretleri
Listede:
- Shopify Customer ve James Carter aynı telefon numarasını kullanıyor.
- Lucas Reed ve Olivia Grant aynı e-posta adresini kullanıyor.
- OpenAI Review Test ve Anita Fancy aynı e-posta adresini kullanıyor.
Bunların test verisi olması mümkün; dolayısıyla doğrudan veri hatası demiyorum. Fakat gerçek entegrasyonda sistemin bu kayıtları işaretlemesi gerekir.
Önerilen eşleştirme sırası
1. Store ID + external customer ID
2. Normalize edilmiş e-posta
3. Normalize edilmiş telefon
4. İsim + posta kodu + adres benzerliği
5. Kullanıcı onaylı manuel eşleşme
Sistem kesin olmayan eşleşmeleri otomatik birleştirmemeli.
Önerilen uyarı:
Possible duplicate customer
Same email as Olivia Grant
Review and merge

Müşteri birleştirme ekranı
Merge işleminde kullanıcı şunları seçebilmeli:
- Korunacak ana profil
- Hangi isim kullanılacak
- Hangi e-posta kullanılacak
- Hangi telefon kullanılacak
- Billing adresi
- Shipping adresi
- Notlar
- Etiketler
- Siparişlerin taşınması
- Entegrasyon kimliklerinin korunması
Birleştirme geri alınabilir ve Activity kaydına yazılabilir olmalı.
6. Veri kaynağı ve senkronizasyon
Müşteri profilinde verinin nereden geldiği görünmüyor.
Her alanın kaynağı takip edilmeli:
- Shopify
- WooCommerce
- Manual
- Order import
- Customer edited
- API
Örnek:
Email
customer@example.com
Source: Shopify · Last synced 10 min ago

Conflict resolution
Kullanıcı NivaDesk’te adresi değiştirir, Shopify daha sonra eski adresi gönderirse hangi veri kazanacak?
Bunun için alan bazlı kaynak politikası olmalı:
- Store is source of truth
- NivaDesk is source of truth
- Newest update wins
- Ask before overwrite
Profilde önerilen entegrasyon paneli
- Connected store
- Platform
- External Customer ID
- First imported
- Last synced
- Sync status
- Last sync error
- Open in Shopify/WooCommerce
- Resync customer
- View raw source data
“Raw source data” yalnız yönetici ve destek rollerine açık olmalı.
7. Arama
Arama şu verilerle çalıştı:
- Müşteri adı
- E-posta
- Telefon
QA e-postası ve telefonuyla arama yapıldığında doğru müşteri bulundu.
Geliştirme önerileri
Arama şunları da kapsamalı:
- Sipariş numarası
- Proje adı
- Şirket
- Posta kodu
- Shopify/WooCommerce Customer ID
- Etiket
- Instagram
- Adres
- Mağaza adı
Arama sonucunda eşleşen alan vurgulanmalı.
Örneğin telefonla arandıysa müşteri kartında telefon öne çıkarılmalı.
8. Recent ve Most Orders
Most Orders doğru çalışıyor:
- 3 siparişli müşteri ilk sıraya geldi.
- Ardından 2 siparişli müşteriler sıralandı.
Recent görünümü de müşteri tarihine göre sıralama yapıyor.
Eksiklikler
Sadece iki sıralama yetersiz.
Önerilen seçenekler:
- Last Order
- Last Contact
- Highest Value
- Outstanding Balance
- Most Orders
- Average Order Value
- Newest Customer
- Oldest Customer
- Recently Updated
- Alphabetical
Recent yerine hangi tarihin kullanıldığı açıkça yazılmalı.
9. Sipariş geçmişi
Profilde sipariş geçmişi iki farklı yerde bulunuyor:
- Üst tarafta Order History kartı
- Alt sekmelerde Orders tablosu
Bu tekrar bir miktar gereksiz.
İyi taraflar
Sipariş satırında:
- Proje adı
- Tarih
- Tutar
- Durum
gösteriliyor ve sipariş detayına bağlantı var.
“View All Orders” sorunu
“View All Orders” bağlantısı doğrudan:
/orders
adresine gidiyor.
Seçili müşteri filtresi taşınmıyor. Kullanıcı müşteri profilinden “View All Orders” dediğinde yalnız o müşterinin siparişlerini görmeyi bekler.
Daha doğru bağlantı:
- /orders?customerId=...
- veya filtrelenmiş Orders görünümü
Gerekli sipariş geçmişi alanları
Shopify/WooCommerce için:
- Platform order number
- NivaDesk order number
- Store
- Fulfilment status
- Payment status
- Refund status
- Total
- Paid
- Balance
- Tracking
- Order source
- Channel
10. Customer Notes ve Notes sekmesi
Üst bölümde Customer Notes bulunuyor ve QA müşteri notu doğru görünüyor.
Alt Notes sekmesine geçildiğinde:
No order notes yet.

yazıyor.
Teknik olarak biri müşteri notu, diğeri sipariş notları olabilir; fakat ikisinin de “Notes” olarak adlandırılması kafa karıştırıyor.
Önerilen isimler:
- Customer Notes
- Order Notes
Sekmede bütün siparişlerin notları gösteriliyorsa her notun yanında:
- Sipariş/proje adı
- Tarih
- Yazan kişi
- İç/dış görünürlük
bulunmalı.
11. Files sekmesi
Files sekmesi QA müşterisinde:
No files yet.

gösteriyor.
Bu alanın amacı açık değil:
- Müşteriye doğrudan bağlı dosyalar mı?
- Bütün sipariş dosyalarının birleşimi mi?
- Yalnız Client Files mı?
- Internal files da dahil mi?
Öneri:
Dosyalar gruplanmalı:
- Customer Files
- Order Files
- Estimates
- Invoices
- Images
- Other
Her dosyada kaynak sipariş ve görünürlük gösterilmeli.
12. Activity sekmesi
Activity, QA siparişinde yapılan değişiklikleri ayrıntılı biçimde gösteriyor:
- Tarih değişiklikleri
- Durum değişiklikleri
- Ödeme
- Estimate
- Task
- Customer portal
- İletişim bilgisi değişiklikleri
Bu faydalı bir özellik.
Eksiklikler
Aktivitede şu bilgiler görünmüyor:
- İşlemi yapan ekip üyesi
- Tam saat
- İşlemin kaynağı
- Shopify/WooCommerce sync işlemi
- Manuel/API ayrımı
- Filtre
- Sayfalama
E-ticaret için gerekli aktiviteler
- Customer imported from Shopify
- Address updated by WooCommerce
- Order refunded
- Marketing consent changed
- Duplicate merged
- Sync conflict resolved
- Customer unsubscribed
- Profile anonymized
- Customer data exported
Yoğunluk sorunu
Çok sayıda tarih testi Activity alanını hızla uzattı. Gerçek müşteride yüzlerce olay olabilir.
Öneri:
- Sayfalama veya “Load more”
- Aktivite türü filtresi
- Tarih filtresi
- Sipariş filtresi
- Önemli aktiviteleri sabitleme
13. Manuel müşteri oluşturma
Mevcut alanlar:
- Customer name
- Email
- WhatsApp / Phone
- Instagram
- Address
- City
- Postal Code
- Country
- Notes
Eksiklikler
Detay profilinde Shipping alanları bulunmasına rağmen yeni müşteri formunda bulunmuyor.
Ayrıca eksik olanlar:
- First/Last Name ayrımı
- Company
- Billing/Shipping ayrımı
- Store/source
- Tags
- Marketing consent
- Preferred language
- Primary phone/WhatsApp ayrımı
- Duplicate kontrolü
Müşteri kaydedilmeden önce e-posta ve telefonla duplicate kontrolü yapılmalı.
14. Veri gizliliği ve GDPR
Customers ekranında şu özellikler görünmüyor:
- Export customer data
- Delete customer
- Anonymize customer
- Marketing consent history
- Data retention status
- Right-to-be-forgotten workflow
- Restrict processing
- Consent source
- Customer request log
Shopify/WooCommerce’den müşteri bilgisi çekildiği için bu alanlar önemlidir.
Silme davranışı
Müşteri silindiğinde finansal sipariş kayıtlarının tamamen yok edilmesi doğru olmayabilir.
Önerilen seçenekler:
- Deactivate customer
- Anonymize personal data
- Preserve financial records
- Disconnect store identity
- Delete only manual profile data
Bu işlemler yönetici yetkisi ve onay gerektirmeli.
15. İletişim ve pazarlama
Customers ekranı Messages ve AI Replies ile daha güçlü bağlanabilir.
Profilde bulunması gerekenler:
- Send email
- Open WhatsApp
- Create AI reply
- View message history
- Preferred channel
- Do not contact
- Marketing subscribed/unsubscribed
- Last contacted
- Next follow-up
AI Replies müşteri profilinden açıldığında:
- Müşteri adı
- Son sipariş
- Sipariş durumu
- Ödeme bakiyesi
- Son mesaj
otomatik bağlama eklenebilir.
Ancak kullanıcı gönderilmeden önce cevabı görmeli ve düzenlemeli.
16. Müşteri segmentleri
E-ticaret bağlantısı için Customers bölümü segmentasyon sunmalı.
Önerilen segmentler:
- New customer
- Repeat customer
- VIP
- High value
- Inactive
- Outstanding balance
- Refund risk
- Waiting for response
- Shopify customer
- WooCommerce customer
- Guest checkout
- No contact details
- Marketing subscribed
Kullanıcı özel segmentler ve etiketler oluşturabilmeli.
17. Görsel tasarım
Güçlü yönler
- Açık gri çalışma zemini rahat.
- Beyaz kartlar temiz görünüyor.
- Mavi vurgu NivaDesk genel tasarımıyla uyumlu.
- Seçili müşteri açık maviyle net ayrılıyor.
- Yeşil finans değerleri hızlı okunuyor.
- Profil, istatistik ve içerik kartları arasında yeterli ayrım var.
Geliştirilmesi gerekenler
- Çok fazla açık gri alan kullanılıyor; input ile salt-okunur bilgi birbirine benziyor.
- Contact Info alanları buton veya salt-okunur kutu gibi görünebiliyor.
- Düzenlenebilir alanlar daha açık belirtilmeli.
- “Save Customer Details” düğmesi sayfanın altına yakın ve uzun formda gözden kaçabilir.
- Profilde geniş boş alanlar oluşuyor.
- Customer Notes kartı tek kısa not için gereğinden büyük.
- Activity bölümü çok uzun ve yoğun.
- Emoji tarzı metrik ikonları diğer profesyonel ikonlarla tam uyumlu değil.
- Yeşil renk hem pozitif finansal değer hem başka durum anlamlarında kullanılıyor.
Önerilen görsel düzen
Profil başlığına hızlı aksiyonlar eklenebilir:
- New Order
- Message
- AI Reply
- Add Note
- Upload File
- More
Altında iki sütun:
- Sol: iletişim ve adres
- Sağ: finansal özet, siparişler, takip
Sekmeler:
- Overview
- Orders
- Messages
- Files
- Notes
- Activity
18. Sol liste genişliği
Customers listesinde de Orders ve Schedule ile aynı genel ayırıcı yaklaşımı korunmalı:
- İnce görsel çizgi
- Daha geniş görünmez yakalama alanı
- Genişliğe göre sadeleşen müşteri kartları
- Ekrana özel saklanan genişlik
Dar durumda:
- Avatar
- Müşteri adı
- Kalan bakiye veya sipariş sayısı
Geniş durumda:
- E-posta
- Projeler
- Tarih
- Değer
gösterilebilir.
Orders, Schedule ve Customers farklı kart sistemleri gibi görünmemeli; aynı NivaDesk yan panel davranışını paylaşmalı.
19. Teknik uyarı
Customers kullanımı sırasında konsolda tekrarlanan uyarı:
NEXT_PUBLIC_FIREBASE_VAPID_KEY is not configured — skipping push registration.

Bu Customers’a özel bir görsel hata değil, fakat müşteri takip bildirimleri, mesaj bildirimleri ve otomatik hatırlatmalar için push kayıtlarının çalışmadığını gösteriyor.
Önceliklendirme
Kritik/yüksek öncelik
1. Sağlam müşteri eşleştirme ve duplicate yönetimi.
2. Shopify/WooCommerce kaynak kimliklerinin saklanması.
3. Alan bazlı veri kaynağı ve sync conflict yönetimi.
4. Total Spent değerinin gerçek ödeme ile sipariş değerini ayırması.
5. “View All Orders” bağlantısının müşteriye göre filtrelenmesi.
6. Telefon ve WhatsApp alanlarının ayrılması.
7. GDPR export/anonymize/delete süreçleri.
8. İade ve refund’ların müşteri değerine doğru yansıması.
Orta öncelik
1. 1 orders dilbilgisi.
2. Sol karttaki tarihin anlamının açıklanması.
3. Customer Notes ve Order Notes ayrımının netleştirilmesi.
4. Activity’de kullanıcı, saat ve kaynak bilgisi.
5. Müşteri kaynak rozetleri.
6. Daha kapsamlı sıralama ve filtreler.
7. Uzun sipariş/proje listelerinin özetlenmesi.
8. Manuel müşteri formunun genişletilmesi.
Ürün geliştirmeleri
1. Müşteri segmentleri ve etiketler.
2. Messages ve AI Replies bağlantısı.
3. Preferred contact channel.
4. Outstanding balance özeti.
5. Ortalama sipariş değeri ve tekrar sipariş oranı.
6. Store bazlı müşteri görünümü.
7. Alan bazlı sync bilgisi.
8. Overview/Orders/Messages/Files/Notes/Activity sekmeleri.
9. Hızlı aksiyonlar.
10. Responsive müşteri listesi.
Genel sonuç
Customers bölümü mevcut hâliyle manuel işletme takibi için kullanılabilir. Ancak Shopify ve WooCommerce entegrasyonları devreye girdiğinde en büyük risk görsel tasarımdan çok veri kimliği olacaktır.
Öncelikli ürün kararı şu olmalı:
Bir kişi, farklı mağazalardan, guest checkout’tan veya manuel siparişten geldiğinde NivaDesk bunun aynı müşteri olup olmadığını güvenli biçimde anlamalı; kaynak veriyi kaybetmeden tek müşteri görünümünde birleştirebilmelidir.

Bu çözülmeden toplam sipariş, müşteri değeri, iletişim bilgileri ve pazarlama izinleri zamanla güvenilirliğini kaybedebilir.
