Aşağıdaki raporu Schedule bölümünü bağımsız ve farklı bir arayüz gibi değerlendirmeden; Orders ekranıyla aynı sipariş kartı sisteminin farklı genişliklerde uyarlanması gerektiğini dikkate alarak yeniden hazırladım.
Test bilgileri:
- Hesap: review@nivadesk.app
- Test siparişi: QA Team Test Customer
- Proje: Pop-up Sergi Standı — Team QA
- Test sonrası başlangıç ve teslim tarihleri eski hâline getirildi:
  - Başlangıç: 25 Ağustos 2026
  - Teslim: 9 Ekim 2026
  - Süre: 45 gün
- Diğer siparişlerin verileri değiştirilmedi.
NivaDesk Schedule – güncellenmiş test raporu
1. Genel yapı
Schedule ekranı iki ana bölümden oluşuyor:
- Solda Orders ekranıyla ortak sipariş listesi
- Sağda zaman çizelgesi ve planlama kontrolleri
Bu yapı mantıklı. Kullanıcı Schedule’a geçtiğinde siparişleri farklı bir sistemden aramak zorunda kalmıyor; Orders ekranında kullandığı aynı müşteri ve sipariş kartlarını görmeye devam ediyor.
Buradaki hedef, soldaki kartları Schedule için tamamen farklı tasarlamak olmamalı. Aynı kart tasarımı, kullanılabilir genişliğe göre daha sade veya daha ayrıntılı hâle gelmeli.
2. Soldaki ortak sipariş listesi
Doğru yaklaşım
Orders ve Schedule ekranındaki sol liste aynı bileşen ve aynı görsel dilde kalmalı:
- Aynı müşteri adı
- Aynı proje adı
- Aynı tarih
- Aynı durum renkleri
- Aynı seçili kart görünümü
- Aynı filtre ve arama yapısı
- Aynı kart sıralaması
Schedule için ayrı bir sipariş kartı tasarımı oluşturmak kullanıcıda iki farklı sistem varmış hissi yaratır.
Önerilen genişlik davranışı
Orders ekranında
Orders ekranında asıl çalışma sipariş kartları ve sipariş detayları üzerinde yapıldığı için sol bölüm biraz daha geniş olabilir.
Geniş durumda kartta şunlar gösterilebilir:
- Müşteri adı
- Proje adı
- Teslim tarihi
- Kalan gün
- Design durumu
- Painting/Production durumu
- Tutar
- Görsel
- Atanan kişi
Schedule ekranında
Schedule’ın ana amacı sağdaki timeline’ı kullanmak olduğundan aynı sol liste varsayılan olarak biraz daha dar olabilir.
Dar durumda kart otomatik sadeleşebilir:
- Müşteri adı
- Proje adı
- Teslim tarihi veya kalan gün
- Tek bir ana durum
- Tutar veya atanan kişi
Burada kartın tasarımı değişmemeli; yalnızca ikincil bilgiler kademeli olarak gizlenmeli.
Önerilen responsive yoğunluk sistemi
Aynı kart bileşeni üç genişlik durumuna sahip olabilir:
Liste genişliği    Kart görünümü    Gösterilen bilgiler
Geniş    Detailed    Bütün bilgiler ve iki üretim durumu
Orta    Standard    Müşteri, proje, tarih, ana durum ve tutar
Dar    Compact    Müşteri, proje, kalan gün ve renkli durum işareti


Geçişler sabit ekranlara göre değil, ayırıcının gerçek konumuna göre yapılmalı.
Örneğin:
- 400 px üzeri: Detailed
- 300–400 px: Standard
- 300 px altı: Compact
Kesin değerler gerçek kart içeriğine göre ayarlanabilir.
Bilgilerin kaybolma sırası
Liste daraltıldıkça bilgiler şu sırayla gizlenebilir:
1. İkinci üretim aşaması
2. Atanan kişi
3. Sipariş görseli
4. Tutar
5. Tam tarih
Her durumda korunması gereken bilgiler:
- Müşteri veya proje adı
- Kalan gün/gecikme
- Ana durum
- Seçili sipariş işareti
Orders ve Schedule genişliklerinin ayrı hatırlanması
İki ekran aynı kart bileşenini kullansa da ayırıcı konumu ekran bazında saklanabilir:
- Orders sidebar width
- Schedule sidebar width
Böylece kullanıcı:
- Orders ekranında listeyi daha geniş,
- Schedule ekranında timeline için daha dar
kullanabilir.
Bu, farklı görünüm oluşturmak değil; aynı görünümün ekran amacına göre farklı başlangıç genişliğinde kullanılmasıdır.
3. Liste ayırıcısı
Ayırıcı çalışıyor ve sol bölümün genişliği değiştirilebiliyor.
Güncellenmiş tasarım önerisi
- Görünen ayırıcı çizgisi daha ince ve sade olabilir.
- Etkileşim alanı ise görünenden daha geniş kalmalı.
- Örneğin:
  - Görsel çizgi: 1–2 px
  - Fareyle yakalama alanı: 16–20 px
Böylece tasarım daha temiz görünürken kullanmak zorlaşmaz.
Schedule davranışı
Schedule açıldığında:
- Sol liste, kullanıcının önceki Schedule genişliğinde açılmalı.
- İlk kullanımda Orders görünümünden biraz daha dar olabilir.
- Sağdaki timeline daha fazla alan kazanmalı.
- Kullanıcı isterse ayırıcıyı çekerek tekrar genişletebilmeli.
Orders davranışı
Orders ekranına dönüldüğünde:
- Liste tekrar Orders için saklanan genişlikte açılmalı.
- Schedule’da daraltılması Orders düzenini bozmamalı.
Ek öneriler
- Ayırıcı üzerine gelince hafifçe belirginleşebilir.
- Çift tıklama varsayılan genişliğe döndürebilir.
- Ayırıcı sürüklenirken kartlar canlı şekilde Detailed → Standard → Compact geçişi yapmalı.
- Geçiş sırasında ani sıçrama yerine kısa bir animasyon kullanılmalı.
- Listenin tamamen kapatılması için mevcut < düğmesi korunmalı.
4. Seçili siparişin eşleştirilmesi
Sol listeden QA siparişi seçildiğinde Schedule doğru haftaya geçti:
- Önce farklı bir Haziran haftası görüntüleniyordu.
- QA siparişi seçilince 24 Aug – 30 Aug haftası açıldı.
- QA çubuğu timeline’da seçili hâle geldi.
Bu davranış doğru.
İyileştirmeler
- Soldaki karta hover edildiğinde sağdaki timeline çubuğu vurgulanmalı.
- Timeline çubuğuna hover edildiğinde soldaki kart vurgulanmalı.
- Timeline’da başka bir sipariş seçildiğinde sol liste ilgili karta otomatik kaydırılmalı.
- Range değiştirildiğinde seçili sipariş mümkünse görünür alana getirilmeli.
- “Jump to selected order” düğmesi eklenebilir.
5. Zaman çubuğunu taşıma
Çubuğun orta bölümünden sürükleme çalışıyor.
Doğrulanan örnekler:
- 25 Aug – 9 Oct
- Bir gün sağa: 26 Aug – 10 Oct
- İki gün sağa: 27 Aug – 11 Oct
Değişiklikler History/Log bölümünde Created Date ve Due Date değişikliği olarak kaydedildi.
Kalan gün etiketi
Çubuk üzerindeki:
- 45d
- 46d
- 47d
değeri proje süresinden ziyade bugünden teslim tarihine kalan zamanı gösteriyor.
Bu nedenle teslim tarihi ileri taşındığında sayı artıyor. Matematik doğru olsa da anlamı belirsiz.
Öneri:
- 45d remaining
- 45 days left
şeklinde açık bir etiket kullanılmalı.
Sipariş süresi de gösterilecekse iki ayrı değer olmalı:
- Duration: 45 days
- Remaining: 45 days
6. Başlangıç tutamacı
Çubuğun sol kenarındaki tutamaç başlangıç tarihini değiştirebiliyor.
Bu değişiklik:
- Created Date’i güncelliyor.
- Delivery Time’ı yeniden hesaplıyor.
- History/Log kaydı oluşturuyor.
Kullanım sorunu
Uzun ve yatay kaydırılmış zaman çizelgelerinde, sürükleme mesafesinin hangi tarihe karşılık geldiğini anlamak zor.
Öneri
Sürükleme sırasında canlı tarih açıklaması gösterilmeli:
Start: 25 Aug → 26 Aug
Duration: 45 → 44 days

Ayrıca:
- Başlangıç günü üzerinde dikey çizgi gösterilmeli.
- Önceki tarih silik olarak korunmalı.
- Tutamaç hover sırasında büyümeli veya renk değiştirmeli.
7. Bitiş tutamacı
Burada tekrarlanabilir bir davranış farkı bulundu.
Çalışan yön
Sağ tutamaç sola çekilerek sipariş kısaltılabiliyor.
Doğrulanan örnek:
- Önce: 25 Aug – 6 Oct / 42d
- Üç gün sola: 25 Aug – 3 Oct / 39d
Bu işlem hemen kaydoldu.
Çalışmayan yön
Sağ tutamaç sağa doğru sürüklendiğinde teslim tarihi uzamadı.
Şu durumlarda ayrı ayrı denendi:
- Haftalık görünüm
- Üç aylık görünüm
- Bir günlük mesafe
- Üç günlük mesafe
- Daha uzun mesafe
- Timeline yatay kaydırılmışken
Sonuç değişmedi:
- Bitiş tarihi sabit kaldı.
- Çubuk uzamadı.
- Başarı veya hata mesajı gösterilmedi.
Önem derecesi: Yüksek
Aynı tutamaç sola doğru çalışırken sağa doğru uzatma yapmıyor.
Teknik olarak kontrol edilmesi gerekenler:
- Sağ sınır ve scroll offset hesabı
- Pointer koordinatının timeline koordinatına dönüştürülmesi
- Görünür alan dışına uzatma
- Maksimum tarih sınırı
- Otomatik yatay kaydırma
- newEndDate > oldEndDate senaryosu
8. Sürükleme sırasında görsel geri bildirim
Schedule çubuğunda:
- Sol ve sağ resize alanları bulunuyor.
- Sağ tarafta ≡ taşıma işareti var.
- Seçili çubuk çerçeveyle ayrılıyor.
- Alt kısımda “Drag bars to move or resize” açıklaması bulunuyor.
Öneriler
- İlk kullanımda kısa bir rehber gösterilmeli.
- Tutamaç hover açıklamaları eklenmeli:
  - Move order
  - Change start date
  - Change delivery date
- Sürükleme sırasında hedef günün tamamında dikey renkli çizgi görünmeli.
- Bırakmadan önce yeni tarih aralığı gösterilmeli.
- Başarılı değişiklik sonrası:
  - Schedule updated
  - Undo
    bildirimi çıkmalı.
- Başarısız bırakmada sessiz kalmak yerine açıklama gösterilmeli.
9. Üç aylık görünümde tarih başlığı hatası
3 Months görünümünde aralık:
- 1 Aug – 31 Oct
olarak gösterildi.
Ancak Ekim sonundaki gün dizisi:
- Sat 24
- Sun 25
- Sun 25
- Mon 26
- Tue 27
- Wed 28
- Thu 29
- Fri 30
şeklinde oluştu.
Sorun:
- Sun 25 iki kez gösteriliyor.
- Sat 31 görünmüyor.
Önem derecesi: Yüksek
Bu hata yalnızca başlığı değil, tarih sütunlarının ve sürükleme hedeflerinin eşleşmesini de etkileyebilir.
Kontrol edilmesi gereken sınırlar:
- Yaz/kış saati geçişi
- Ekim ayı sonu
- 30/31 günlük aylar
- Şubat ve artık yıl
- Yıl değişimi
Takvim hücrelerinin saat tabanlı değil, salt tarih tabanlı oluşturulması daha güvenli olur.
10. Order içindeki Created Date editörü
Schedule sürüklemesi Created Date’i değiştirebildiği için aynı alan Order → Timeline & Delivery kartından tekrar denendi.
Şu yöntemler kullanıldı:
- Tarihi girip Enter
- Tarihi girip Tab
- Alan dışına geçme
- Başka kontrole tıklama
Yeni tarih kalıcı olmadı ve eski değer geri geldi.
Sonuç
- Schedule sürüklemesi Created Date’i kaydediyor.
- Order içindeki Created Date editörü kaydetmiyor.
Bu doğrulanmış bir tutarsızlıktır.
11. Range seçenekleri
Mevcut seçenekler:
- Weekly
- Monthly
- 3 Months
- 6 Months
- Yearly
Bu kapsam yeterli.
Kullanılabilirlik önerileri
- Today düğmesi eklenmeli.
- Jump to selected eklenmeli.
- Uzun aralıklarda ay isimleri için ikinci bir sticky başlık olmalı.
- Yatay scrollbar daha görünür olmalı.
- Range değişince seçili sipariş görünür alana kaydırılmalı.
- Son kullanılan Range kullanıcı bazında saklanmalı.
12. Zoom
Zoom kontrolleri çalıştı:
- Başlangıç: %100
- Zoom in: %115
- Reset: %100
Öneriler
- %75 / %100 / %125 / Fit seçenekleri eklenebilir.
- “Fit selected order” faydalı olur.
- Zoom seviyesi Schedule için ayrıca hatırlanabilir.
- Reset düğmesinde Reset to 100% tooltip’i gösterilebilir.
- Trackpad pinch-to-zoom desteklenebilir.
13. Filtreler
Status filtresi çalışıyor.
In Production seçildiğinde timeline iki siparişe düştü.
Mevcut filtreler:
- All
- Active
- Waiting Customer
- In Production
- This Week
- Late Orders
- Unpaid Balance
- Ready to Ship
- Completed
- Trash
Öneriler
- Sonuç sayıları gösterilmeli:
  - In Production (2)
  - Late Orders (1)
- Birden fazla filtre birlikte seçilebilmeli.
- Aktif filtreler chip olarak gösterilmeli.
- Clear filters bulunmalı.
- Kullanıcı filtre görünümünü kaydedebilmeli.
- Trash diğer operasyon filtrelerinden ayrılmalı.
14. Arama alanı
QA Team araması yalnız QA siparişini gösterdi. Arama temizlendiğinde diğer siparişler geri geldi.
Fonksiyon çalışıyor.
İsimlendirme problemi
Alan adı Search Tasks, fakat görev değil sipariş ve projeler aranıyor.
Daha uygun isimler:
- Search orders
- Search schedule
- Customer, project or status
15. Timeline çubuklarının içeriği
Çubuklarda şu bilgiler bulunuyor:
- Müşteri
- Proje adı
- Durum
- Tarih aralığı
- Kalan gün
- Kalan ödeme
- Görsel
- Taşıma işareti
Bu bilgiler yararlı. Ancak kısa çubuklarda hepsi sığmayabilir.
Responsive çubuk önerisi
Zoom ve görünür genişliğe göre çubuk da sadeleşebilir:
- Geniş: bütün bilgiler
- Orta: müşteri, proje, durum ve tarih
- Dar: müşteri ve durum
Çubuk üzerindeki £1,050, QA siparişinin toplam değeri değil kalan ödemesidir. Daha açık ifade:
- Due £1,050
- Balance £1,050
olabilir.
16. Schedule ve Team Schedule ayrımı
Schedule ekranında:
Team includes shared schedule planning for the whole workspace.

açıklaması bulunuyor. Ana menüde ayrıca Team Schedule var.
İki bölüm arasındaki fark yeterince açık değil.
Önerilen ayrım:
- Schedule: Siparişlerin başlangıç ve teslim planı
- Team Schedule: Ekip üyelerinin vardiya, müsaitlik ve iş dağılımı
17. Teknik uyarılar
Tarayıcı günlüklerinde:
- Firebase VAPID anahtarının yapılandırılmadığı
- App Check 403 hatası
- App Check isteklerinin yaklaşık 24 saat kısıtlandığı
- Firestore Listen stream transport uyarısı
görüldü.
Bunların olası etkileri:
- Push bildirim kaydı yapılamaması
- App Check doğrulamasının çalışmaması
- Gerçek zamanlı güncellemelerde bağlantı riski
- Auth işlemlerinin App Check token alamaması
Schedule’ın temel fonksiyonları çalıştı; ancak production ortamında bu uyarılar temizlenmeli.
Öncelik sırası
Yüksek
1. Sağ resize tutamacının sağa doğru uzatma yapmaması.
2. Üç aylık görünümde tekrarlanan 25 Ekim ve eksik 31 Ekim.
3. Order → Timeline içindeki Created Date alanının kaydetmemesi.
4. Firebase App Check ve VAPID yapılandırması.
Orta
1. Seçili siparişin uzun Range görünümünde otomatik görünür alana alınmaması.
2. Kalan gün etiketinin anlamının açık olmaması.
3. Search Tasks adının içerikle uyuşmaması.
4. Schedule ve Team Schedule ayrımının belirsizliği.
5. Resize sırasında canlı tarih önizlemesi bulunmaması.
Kullanılabilirlik geliştirmeleri
1. Orders ve Schedule’da aynı sipariş kartı bileşenini korumak.
2. Ayırıcı genişliğine göre Detailed/Standard/Compact geçişi.
3. Orders ve Schedule genişliklerini ayrı hatırlamak.
4. Schedule’ın varsayılan sol listesini biraz daha dar açmak.
5. İnce görünen fakat kolay yakalanan ayırıcı.
6. Today ve Jump to selected düğmeleri.
7. Sticky ay başlıkları.
8. Zoom presetleri.
9. Hover ile sol kart–timeline eşleştirmesi.
10. Tarih değişikliklerinde Undo.
Genel sonuç
Schedule’ın temel sistemi iyi çalışıyor:
- Sol listeden sipariş seçimi
- İlgili haftaya geçiş
- Arama
- Durum filtreleri
- Zoom
- Çubuk gövdesinden tarih aralığını taşıma
- Sol taraftan başlangıç tarihini değiştirme
- Sağ taraftan teslim tarihini kısaltma
- Değişiklikleri History/Log’a kaydetme
Soldaki sipariş listesi Orders ekranından farklılaştırılmamalı. Aynı kart bileşeni kullanılmalı; yalnızca Schedule’da ayırıcı daha dar bir başlangıç konumunda açılarak kartlar otomatik sadeleşmeli ve timeline’a daha fazla alan bırakılmalı. Orders ekranına dönüldüğünde aynı kartlar daha geniş ve ayrıntılı hâle gelebilmeli.
