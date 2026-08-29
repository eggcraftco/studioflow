# NivaDesk Home — Ürün ve Arayüz Şartnamesi

## 1. Home ekranının amacı

Home, kullanıcı uygulamaya girdiğinde doğrudan bir order açmak yerine işletmenin o anki durumunu tek bakışta anlamasını sağlayan kişisel çalışma alanıdır. Bu ekran ayrı menülerin küçük kopyalarından oluşmamalıdır. Her kart yalnızca kendi alanındaki en önemli bilgiyi göstermeli ve kullanıcıyı ilgili tam ekrana götürmelidir.

Home şu üç soruyu hızlıca cevaplamalıdır:

1. Bugün neye dikkat etmeliyim?
2. Sıradaki işim veya işlemim nedir?
3. Ayrıntıyı görmek ya da işlem yapmak için nereye gitmeliyim?

Bu nedenle Home ekranı rapor, uyarı ve hızlı eylem katmanıdır; Orders, Banking, Inventory, Schedule veya Files ekranlarının yerine geçmez.

## 2. Genel ekran yapısı

Üst bölüm mevcut NivaDesk uygulama kabuğuyla aynı kalmalıdır: marka/workspace, ana navigasyon, bildirimler, kullanıcı hesabı ve `+ New order` gibi global eylemler. Home içinde bunların ikinci bir kopyası oluşturulmamalıdır.

Sayfa başlığında şu öğeler bulunmalıdır:

- `Home`
- Günün saatine göre kısa karşılama metni
- Son senkronizasyon durumu
- `Customise` düğmesi
- Gerekirse global tarih aralığı: `Today`, `This week`, `This month`

Kart alanı geniş ekranda dört kolonlu modüler grid kullanmalıdır. Kartların temel boyutları:

- `1×1`: küçük kare
- `2×1`: iki kare genişliğinde yatay kart
- `2×2`: dört karenin birleştiği büyük kart

Kartlar grid içinde sürüklenebilir ve desteklenen boyutlar arasında değiştirilebilir. Kullanıcı sürüklemeye başladığında kart hafif saydamlaşmalı, geçerli bırakma alanları çizgilerle görünmeli ve hedef konumda bir ghost placeholder oluşmalıdır. Bırakma işleminden sonra yerleşim otomatik kaydedilmelidir.

## 3. Önerilen varsayılan masaüstü yerleşimi

Geniş ekranda önerilen başlangıç düzeni:

- 1. sıra: `Getting started 2×1` + `Quick actions 1×1` + `Recent activity 1×1`
- 2. sıra: `Money 1×1` + `Banking 1×1` + `Inventory 1×1` + `Customers 1×1`
- 3. sıra: `Orders & production 2×1` + `Schedule 2×1`
- 4. sıra: `Files 2×1` + `Notes 2×1`

`Getting started` tamamlandığında veya gizlendiğinde diğer kartlar boşluğu doldurmalıdır. Bu değişiklik kullanıcının kalan özel yerleşimini bozmamalıdır.

## 4. Kartların ortak anatomisi

Web/Mac kartlarında ortak yapı:

- Sol üstte yalnızca kartı taşımaya yarayan altı noktalı drag handle
- Kart ikonu ve başlığı
- Gerekliyse tarih aralığı veya filtre
- Sağ üstte üç nokta menüsü
- Ana içerik
- Gerekiyorsa ilgili tam ekrana götüren tek bir alt bağlantı

Üç nokta menüsünde ortak seçenekler:

- `Resize`
- `Move`
- `Choose colour`
- `Edit heading`
- `Hide card`
- `Reset card`

Kartın tamamı çok renkli olmamalıdır. Renk, ikon, durum etiketi ve hafif vurgulu alanlarda kullanılmalıdır. Ana yüzey beyaz veya çok açık nötr kalmalıdır.

iPhone sürümlerinde masaüstü drag handle ve üç nokta menüsü normal görünümde bulunmamalıdır. Kartın tamamına dokunmak ilgili ekranı açar; uzun basmak kişiselleştirme modunu başlatır.

## 5. Kartların işlevleri

| Kart | Gösterdiği ana bilgi | Ana eylem | Gösterilmemesi gerekenler |
|---|---|---|---|
| Quick actions | Sık kullanılan oluşturma ve yakalama işlemleri | New order, customer, note, file, inventory, expense, receipt, AI reply | İstatistik ve raporlar |
| Money | Gelir, tahsilat, outstanding ve net profit | Dashboard/finance ayrıntısı | Banka transaction listesi |
| Banking | Review bekleyen banka hareketleri, receipt ve categorisation durumu | Review transactions | Net profit kartının tekrarı |
| Inventory | Stok değeri, düşük stok, reserved ve incoming item’lar | Inventory ekranı veya Add item | Files kütüphanesinin kopyası |
| Orders & production | Üretim akışı ve darboğazlar | Production görünümü | Aynı status rakamlarının iki kez gösterilmesi |
| Schedule | Başlangıç/teslim tarihleri ve yaklaşan deadline’lar | Open Schedule | Production status özetinin tekrarı |
| Customers | Yeni, aktif ve dikkat gerektiren müşteriler | Customers ekranı | Order listesinin kopyası |
| Recent activity | Workspace içindeki son önemli hareketler | Activity history | Her küçük otomatik sistem olayını göstermek |
| Notes | Pinned ve recent notlar, hızlı not oluşturma | New note / Open Notes | Files ve AI Reply birleşimi |
| Files | Merkezi dosya deposu, son dosyalar ve bağlantılar | Upload file / Open Files | Aynı dosyanın fiziksel kopyaları |
| Getting started | Kullanıcıya özel kurulum adımları | Sıradaki adıma devam | Ödeme baskısı ve engelleyici onboarding |

## 6. Quick Actions

Boyuta göre 4, 6 veya 8 eylem gösterilir. `New order` birincil mavi eylemdir. Diğer eylemler eşit ağırlıkta ve daha sakin renklerde görünür. Eylemler mümkünse kullanıcıyı sayfadan çıkarmadan modal veya sheet açmalıdır.

Görünen eylemler kullanıcının yetkilerine bağlıdır. Yetkisi olmayan eylem gizlenir ve grid boşluk bırakmadan yeniden dizilir. Kullanıcı `Edit actions` ile seçim ve sıralama yapabilir.

## 7. Money ve Banking ayrımı

Money kartı işletmenin ticari sonucunu anlatır: revenue, received, outstanding, cost ve net profit.

Banking kartı banka hareketlerinin çalışma durumunu anlatır: review bekleyen transaction, categorisation, VAT/tax code, receipt, order bağlantısı ve accounting connector durumu.

Bu iki kart birleştirilmemeli ve aynı rakamları tekrar etmemelidir. Banking read-only banka bağlantısı ilkesini korumalıdır; para gönderme eylemi gösterilmemelidir.

## 8. Inventory

Inventory kartı fiziksel item’ları özetler: total value, low stock, reserved, incoming ve location. Unique item ile quantity item ayrımı korunmalıdır.

Inventory içindeki belgeler Files sistemindeki aynı dosyalardır. Kartta dosyayı yeniden yükleme mantığı oluşturulmamalıdır. Inventory kartı kullanıcıyı item veya low-stock listesine götürebilir.

## 9. Orders & Production

Kart üretimin hangi aşamalarda biriktiğini göstermelidir. Üstteki KPI’lar ile alttaki production flow aynı bilgiyi iki kez tekrarlamamalıdır. Küçük kart tek bir kısa durum özeti, orta kart aşama dağılımı, büyük kart ise akış ve riskli order’ları gösterebilir.

Order’a tıklamak ilgili order’ı açar. Status değişikliği için tam production ekranı tercih edilmelidir.

## 10. Schedule

Schedule kartı tarih ve deadline odaklıdır. Production kartının statuslarını tekrar etmez. Küçük kart sıradaki teslimleri, orta kart haftalık timeline’ı, büyük kart timeline ve upcoming deadlines bölümünü gösterir.

Home kartının kendisi sürüklenebilir olduğundan iç timeline barları dashboard üzerinde read-only olmalıdır. Aksi halde kart taşıma ile tarih değiştirme gesture’ı çakışır. Tarih değiştirmek için kullanıcı `Open Schedule` ile tam Schedule ekranına gider.

## 11. Customers

Customers kartı müşteri sağlığını ve son hareketi özetler. Shopify veya WooCommerce’den gelen müşteri kayıtları source etiketi taşıyabilir. Aynı kişiye ait kayıtlar mümkünse email/telefon/shop customer ID üzerinden birleştirilmeli; olası duplicate kayıtlar ayrıca gösterilmelidir.

## 12. Recent Activity

Recent Activity; order değişikliği, ödeme eşleşmesi, dosya eklenmesi, not paylaşılması, inventory reservation ve team member işlemleri gibi anlamlı olayları gösterir. Gürültü oluşturan teknik sync olayları varsayılan görünümde saklanmalıdır.

Her satırda actor, eylem, ilgili kayıt ve zaman bulunmalıdır. Kullanıcı yalnızca görmeye yetkili olduğu kayıtların activity bilgisini görebilmelidir.

## 13. Notes

Notes kartı yalnızca notlar içindir. Files veya AI Reply ile birleştirilmemelidir. Pinned notlar önce, recent notlar sonra gösterilir. Order veya customer ilişkisi küçük chip olarak görünür ve tıklandığında ilgili kaydı açar.

`Take a note…` hızlı oluşturma alanı modal açabilir. Renk, pin, checklist ve reminder gibi Notes özellikleri desteklenebilir.

## 14. Files

Files, NivaDesk içindeki merkezi dosya kütüphanesidir. Bir dosya yalnızca bir kez yüklenir ve birden fazla kayda bağlanabilir.

Örnek:

`invoice_PUR-084.pdf` → `Purchase PUR-084` + `Inventory INV-00147`

Bu yapı tabloda tek dosya satırı ve birden fazla relationship chip ile gösterilmelidir. `Unlinked` dosyalar review alanına alınmalıdır. Inventory belgesi Order’a bağlandığında otomatik olarak Client Files’a açılmamalıdır; müşteri paylaşımı ayrıca ve açıkça yapılmalıdır.

## 15. Getting Started

Getting Started kartı kullanıcının planına, rolüne ve workflow’una göre değişen kurulum adımları gösterir. Örneğin e-ticaret kullanıcısında `Connect your shop`, Team kullanıcısında `Invite a team member` öne çıkabilir.

`Skip for now` görevi tamamlanmış saymaz; yalnızca sıradaki öneriyi değiştirir. Kart uygulamayı kullanmayı engellemez, ödeme veya trial baskısı oluşturmaz. Tüm adımlar tamamlandığında kısa bir başarı durumu gösterildikten sonra kart otomatik gizlenebilir. Kullanıcı kart galerisinden tekrar ekleyebilmelidir.

## 16. Kişiselleştirme

`Customise` modu açıldığında:

- Grid çizgileri görünür.
- Kartlar hafif saydamlaşır.
- Drag handle’lar belirginleşir.
- Geçerli boyutlar `1×1`, `2×1`, `2×2` olarak seçilebilir.
- Kart renk teması seçilebilir; renk veri anlamını bozmamalıdır.
- Kart başlığı düzenlenebilir.
- Kartlar gizlenebilir veya kart galerisinden geri eklenebilir.
- `Reset layout` varsayılan yerleşime döndürür.

Kart yerleşimi workspace + user bazında saklanmalıdır. Bir kullanıcının düzeni başka team member’ın düzenini değiştirmemelidir.

## 17. Responsive davranış

- Geniş masaüstü: dört kolon.
- Orta masaüstü/tablet landscape: üç veya iki kolon.
- Tablet portrait: iki kolon.
- Telefon: tek kolon ve dikey akış.

Telefon kartları aynı verinin sade versiyonunu gösterir. Masaüstü kartlarının küçültülmüş ekran görüntüsü kullanılmamalıdır. Dokunma hedefleri en az 44×44 pt olmalıdır.

## 18. Durumlar ve hata yönetimi

Her kart şu durumlara sahip olmalıdır:

- Loading: kart ölçüsünü koruyan skeleton
- Empty: neden boş olduğunu ve tek bir başlangıç eylemini anlatan durum
- Error: kısa mesaj ve `Try again`
- Permission denied: kartı bozmak yerine izin açıklaması veya kartı otomatik gizleme
- Stale data: son güncelleme zamanı ve refresh
- Offline: cache’lenmiş veri ve offline etiketi

Kart başarısız olduğunda tüm Home ekranı çökmemelidir. Her kart bağımsız error boundary içinde çalışmalıdır.

## 19. Teknik öneriler

- Grid yerleşimi versiyonlanmış JSON olarak saklanmalıdır.
- Kart registry; `id`, desteklenen boyutlar, varsayılan boyut, permission, data loader ve render varyantlarını tanımlamalıdır.
- Kart başına bağımsız veri sorgusu ve cache kullanılmalıdır.
- Aynı veri farklı kartlarda kullanılıyorsa ortak query/cache katmanı tekrar istekleri önlemelidir.
- Sürükleme sırasında optimistic layout uygulanmalı, kayıt başarısız olursa önceki yerleşime dönülmelidir.
- Kart içi linkler deep-link olmalı; ilgili filtre veya kayıt hazır açılmalıdır.
- Hassas finans, banka ve müşteri verileri role/permission kontrolünden sonra render edilmelidir.

## 20. Erişilebilirlik

- Renk tek başına durum anlamı taşımamalıdır; ikon veya metin eşlik etmelidir.
- Klavye ile kartlar taşınabilmeli ve yeniden boyutlandırılabilmelidir.
- Focus sırası görsel grid sırasını takip etmelidir.
- Ekran okuyucu kart başlığı, güncellik ve ana eylemi açıklamalıdır.
- Reduced motion ayarında sürükleme ve geçiş animasyonları azaltılmalıdır.
- Kontrast WCAG AA seviyesini karşılamalıdır.

## 21. Başarı ölçütleri

Home ekranı başarılı sayılırsa kullanıcı:

- Uygulamayı açtıktan sonraki birkaç saniye içinde önemli işi fark eder.
- Yeni order veya sık kullanılan işlemi tek tıklamayla başlatır.
- Banking, Schedule, Production ve Files sorunlarını ayrı ayrı anlayabilir.
- İstediği kartları seçip kendi çalışma alanını oluşturabilir.
- Ayrıntıya geçerken hangi ekrana gideceğini düşünmek zorunda kalmaz.

