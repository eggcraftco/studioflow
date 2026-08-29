Aşağıda kartlarla ilgili önceki raporun, sürükleme davranışı düzeltilmiş ve bütün bulgular birleştirilmiş son hâli bulunuyor.
Test bilgileri:
- Hesap: review@nivadesk.app
- Test siparişi: QA Team Test Customer
- Proje: Pop-up Sergi Standı — Team QA
- Mevcut diğer siparişlerde değişiklik yapılmadı.
- Geçici renk, ölçü ve düzen değişiklikleri geri alındı.
- QA siparişi tekrar ortak workspace düzenine bağlandı.
NivaDesk kart sistemi test raporu
1. Soldaki küçük sipariş kartları
Çalışan özellikler
- Seçili sipariş açık mavi arka plan ve mavi çerçeveyle belirgin biçimde ayrılıyor.
- Kartlarda müşteri, ürün, tarih, üretim aşamaları ve fiyat birlikte gösteriliyor.
- Geciken siparişlerde “46d late” gibi gecikme göstergesi bulunuyor.
- Durum rozetlerinin renkleri değişiyor:
  - Devam ediyor
  - Bekliyor
  - Tamamlandı
  - İptal edildi
- Arama ve filtre alanları listenin üst bölümünde bulunuyor.
- Sipariş listesi daraltılabiliyor.
- Seçilen siparişle sağdaki detay alanı doğru şekilde eşleşiyor.
Kullanılabilirlik sorunları
- Normal, gecikmiş ve tamamlanmış sipariş kartlarının ana zemini çoğunlukla aynı beyaz renkte kalıyor.
- Durum farklılıkları küçük rozet ve metinlere bağımlı.
- Yaklaşık 100 px yüksekliğindeki kartlar fazla bilgi taşıyor; sipariş sayısı arttıkça liste gereğinden fazla uzuyor.
- DESI ve BOYA gibi kısaltmalar yeni kullanıcı için yeterince açıklayıcı değil.
- Geciken bir siparişin tamamı değil, yalnızca küçük gecikme rozeti dikkat çekiyor.
- Tamamlanan sipariş ilk bakışta aktif siparişten yeterince güçlü ayrılmıyor.
- Uzun müşteri ve ürün adlarında bilgi hiyerarşisi zayıflıyor veya metinler kesiliyor.
Öneriler
- Üç görünüm yoğunluğu sunulabilir:
  - Compact
  - Standard
  - Detailed
- Kartın sol tarafında durum şeridi kullanılabilir:
  - Kırmızı: gecikmiş veya blocked
  - Turuncu: bekliyor
  - Mavi: devam ediyor
  - Yeşil: tamamlandı
  - Gri: iptal
- Tamamlanan kartların zemini hafif gri/yeşil yapılabilir.
- İptal edilen kartlar daha düşük opaklıkta gösterilebilir.
- Kısaltmaların üzerine gelindiğinde tam aşama adı gösterilebilir.
- “Aktif”, “Geciken”, “Benden aksiyon bekleyen” ve “Tamamlanan” hızlı sekmeleri eklenebilir.
2. Sol liste ayırıcısı
Test sonucu
Ayırıcı düzgün çalışıyor:
- Sağa çekildiğinde sipariş listesi genişliyor.
- Sola çekildiğinde daralıyor.
- Sağdaki kart çalışma alanı kalan genişliğe uyum sağlıyor.
- Test sonunda başlangıç genişliği geri yüklendi.
Kullanılabilirlik sorunu
- Ayırıcının etkileşim alanı yaklaşık 12 px.
- Fare imleci doğru şekilde col-resize oluyor.
- Bununla birlikte çizgi görsel olarak oldukça silik.
- Kullanıcı ilk bakışta çizginin hareket ettirilebildiğini fark etmeyebilir.
- Dokunmatik ekranda 12 px alanı yakalamak zor olabilir.
Öneriler
- Görünen çizgi ince kalabilir; görünmez etkileşim alanı 20–24 px yapılmalı.
- Üzerine gelindiğinde çizgi maviye dönmeli.
- Ortasında küçük bir ⋮ tutamacı gösterilmeli.
- Çift tıklandığında varsayılan genişliğe dönmeli.
- “Dar / Normal / Geniş” hazır seçenekleri bulunmalı.
- Liste çok daraltıldığında küçük sipariş kartları otomatik olarak compact moda geçmeli.
3. Büyük kartların boyutlandırılması
Test sonucu
Boyutlandırma çalışıyor:
- Alt tutamaç yalnızca kartın yüksekliğini değiştiriyor.
- Sağ alt köşe tutamacı kart yüksekliğiyle birlikte sütun genişliğini değiştiriyor.
- Preview kartı test sırasında:
  - 384 × 497 px’den
  - 444 × 537 px’e getirildi.
- Ardından tekrar 384 × 497 px başlangıç boyutuna döndürüldü.
- Bir sütunun genişliği değiştiğinde o sütundaki kartlar aynı genişliği kullanıyor.
Kullanılabilirlik sorunları
- İki farklı boyutlandırma tutamacının işlev farkı ilk bakışta anlaşılmıyor.
- Kullanıcı mevcut kart ölçüsünü göremiyor.
- Minimum ve maksimum ölçü belirtilmiyor.
- Kart içeriğine göre otomatik yükseklik seçeneği bulunmuyor.
- Çok sayıda kartın ayrı ayrı boyutlandırılması düzensiz bir çalışma alanı oluşturabilir.
Öneriler
- Sürükleme sırasında canlı ölçü etiketi gösterilmeli: 384 × 497.
- Tutamaçlarda tooltip kullanılmalı:
  - Yüksekliği değiştir
  - Sütun genişliği ve yüksekliği değiştir
- Kart menüsüne şu seçenekler eklenmeli:
  - İçeriğe sığdır
  - Varsayılan boyuta dön
  - Sütundaki kartlarla eşitle
  - Küçük / Orta / Büyük
- Kart çok küçültülürse içerik taşmak yerine özet görünüme geçmeli.
- Kart başlığı ve kritik durum bilgileri her ölçüde görünür kalmalı.
4. Büyük kartların sürüklenmesi
Düzeltilmiş test sonucu
Kart sürükleme sistemi çalışıyor. Önceki rapordaki “sürükleme çalışmıyor olabilir” değerlendirmesi geçerli değildir.
Farklı kart ve hedef türleri incelendi:
- Aynı sütundaki kartlar arasında taşıma
- Başka sütuna taşıma
- Uzun ve kısa kartların arasına bırakma
- Sütunun sonuna bırakma
- Boş sütun hedefi
Sürüklenen kartın görünümü
Sürükleme sırasında:
- Kartın opaklığı yaklaşık %58 seviyesine düşüyor.
- Kart hafif küçülüyor: scale(0.985).
- İmleç grab durumundan grabbing durumuna geçiyor.
- Kullanıcı hangi kartı taşıdığını anlayabiliyor.
Kullanıcının belirttiği “kartın şeffaflaşması” doğru ve tasarlanmış bir davranıştır.
Kartlar arasındaki bırakma çizgileri
Kartlar arasında yaklaşık 54 px yüksekliğinde bir bırakma bölgesi oluşturuluyor.
Bu bölge:
- Kesik mavi çerçeve kullanıyor.
- Yarı saydam açık mavi zemine sahip.
- Karttan önce ve karttan sonra konumlanabiliyor.
- Gerektiğinde küçük bir yönlendirme etiketi gösterebiliyor.
- Sütunun sonunda ayrıca yaklaşık 48 px’lik algılama şeridi bulunuyor.
Dolayısıyla kullanıcının gördüğü çizgi ve boşluklar gerçek bırakma hedefleridir.
Sütunlar arası taşıma
Başka sütuna geçildiğinde hedef sütun:
- Açık mavi yarı saydam bir zemin kazanıyor.
- Kesik mavi dış çizgiyle belirtiliyor.
- Dış çizgi sütunun yaklaşık 5 px dışına taşarak hedefi belirginleştiriyor.
Boş sütunlar için özel bırakma alanı bulunuyor:
- Normal bırakma alanı: minimum 72 px
- Tamamen boş sütun hedefi: minimum 176 px
Hedef kartın görünümü
Geçerli hedef kart:
- Mavi çerçeve kazanıyor.
- Hafif iç ve dış gölgeyle diğer kartlardan ayrılıyor.
- Öncesine veya sonrasına bırakma alanı gösteriliyor.
Sonuç
Kart taşıma mekanizması için doğrulanmış bir teknik arıza bulunmuyor. Görsel geri bildirim sistemi genel olarak iyi düşünülmüş.
İyileştirme önerileri
- İlk kullanımda “Kartı bu tutamaçtan sürükleyin” tooltip’i gösterilebilir.
- Bırakma alanlarına daha açık metinler eklenebilir:
  - Bu kartın önüne
  - Bu kartın arkasına
  - Sütunun sonuna
- Başarılı taşıma sonrasında “Kart taşındı — Geri al” bildirimi çıkabilir.
- Sürükleme sırasında kart başlığı tam opak bırakılabilir.
- Hedef sütunun mavi vurgusu biraz güçlendirilebilir.
- Uzun sayfalarda otomatik kaydırma hızı kademeli olmalı.
- Kart menüsüne klavye ve erişilebilirlik seçenekleri eklenebilir:
  - Yukarı taşı
  - Aşağı taşı
  - Sol sütuna taşı
  - Sağ sütuna taşı
- 26 × 26 px görünen tutamaç korunabilir; ancak görünmez dokunma alanı 40–44 px yapılabilir.
5. Kart kilitleme
Test sonucu
Kilit düzgün çalışıyor:
- “Lock cards” etkinleştirildiğinde sürükleme tutamaçları kaldırılıyor.
- Yükseklik ve köşe boyutlandırma tutamaçları kaldırılıyor.
- Kartlarda “Layout locked” durumu oluşuyor.
- Kilit açıldığında bütün tutamaçlar geri geliyor.
- Yanlışlıkla kart taşıma ve ölçü değiştirme engelleniyor.
Öneriler
- Kilit açıkken çalışma alanında küçük, sabit bir kilit göstergesi kalabilir.
- Kilidin kapsamı açıkça yazılmalı:
  - Yalnız benim görünümüm
  - Bu sipariş
  - Workspace ortak düzeni
- Kilitliyken renk değiştirme ve kart gizleme işlemlerinin izin durumu açıklanmalı.
- Düzen değişikliğinden sonra sistem otomatik kilitleme önerebilir.
6. Kart renkleri
Test sonucu
Kart menüsünde şu renkler bulunuyor:
- Default
- Red
- Orange
- Yellow
- Green
- Blue
- Purple
- Pink
Renk değiştirme çalışıyor.
Örneğin Blue seçildiğinde:
- Kart gövdesine yarı saydam mavi zemin uygulanıyor.
- Mavi çerçeve oluşuyor.
- Kart içeriği okunabilir kalıyor.
“Default” seçildiğinde renk kaldırılıyor. Test edilen kart başlangıç rengine geri döndürüldü.
Kullanılabilirlik sorunları
- Renklerin anlamı tanımlı değil.
- Farklı kullanıcılar aynı rengi farklı amaçlarla kullanabilir.
- Yalnız renk kullanılması erişilebilirlik açısından yeterli değil.
- Rengin siparişe özel mi yoksa ortak kart türüne mi uygulandığı menüde yeterince görünür değil.
Öneriler
- Renk + metinsel etiket birlikte kullanılmalı:
  - Acil
  - Finans
  - Müşteri bekleniyor
  - Üretim
  - Kontrol
- Renklerin yanına ikon eklenmeli.
- Workspace yöneticisi renk anlamlarını tanımlayabilmeli.
- Uygulama kapsamı açıkça seçilebilmeli:
  - Yalnız bu siparişte
  - Bu kart türünün tamamında
  - Benim kişisel görünümümde
- Özellikle sarı ve açık renklerde kontrast kontrolü yapılmalı.
- Kullanıcı özel renk seçebilmeli ancak erişilebilirlik uyarısı gösterilmeli.
7. Actions menüsü
Actions menüsünde şu seçenekler bulunuyor:
- Delivery Time göster/gizle
- Upcoming Schedule göster/gizle
- Order Value göster/gizle
- Export PDF
- Invoice PDF
- Customize cards
Başlık bilgilerinin hızlıca açılıp kapatılabilmesi yararlı.
Öneriler
- Actions içeriği gruplandırılmalı:
  - Header görünümü
  - Belgeler
  - Kart düzeni
- “Customize cards” daha görünür bir isimle sunulabilir:
  - Customize workspace
  - Edit card layout
- Menüde mevcut düzen adı gösterilebilir.
- “Son düzen değişikliğini geri al” seçeneği eklenebilir.
8. Actions → Customize cards
Çalışan özellikler
“Workspace Blocks” panelinde:
- Bütün kartlar checkbox listesi halinde gösteriliyor.
- Kartlar gösterilip gizlenebiliyor.
- Reset düğmesi bulunuyor.
- Ortak workspace düzeni kullanılabiliyor.
- Siparişe özel bağımsız düzen oluşturulabiliyor.
- Bağımsız düzende:
  - Kart sırası
  - Görünürlük
  - Renkler
  - Boyutlar
    yalnızca ilgili siparişi etkiliyor.
- “Rejoin shared” ile sipariş tekrar ortak düzene bağlanabiliyor.
QA siparişinde bu geçiş test edildi ve sonunda ortak düzene geri dönüldü.
Sorunlar
- “Saving card layout...” durumu yaklaşık 1–2 saniye kalabiliyor.
- Otomatik kayıt ile “Save this order” düğmesinin birlikte bulunması kafa karıştırıyor.
- “Reset” düğmesinin tam kapsamı belli değil.
- “Rejoin shared” siparişe özel düzeni kaldırıyor; sonucu yeterince açık anlatılmıyor.
- Yaklaşık 18 kartın düz checkbox listesi uzun ve kategorisiz.
Öneriler
Kartlar kategorilere ayrılmalı:
- Müşteri
- Üretim
- Finans
- Teslimat
- Planlama
- Dosyalar ve notlar
Reset seçenekleri açıkça ayrılmalı:
- Bu siparişin düzenini sıfırla
- Kişisel görünümümü sıfırla
- Workspace ortak düzenini sıfırla
Ek olarak:
- Otomatik kayıt kullanılıyorsa manuel Save kaldırılmalı.
- Rejoin shared öncesinde kaybedilecek ayarlar açıklanmalı.
- Panelde kart arama alanı bulunmalı.
- Kartların yanında görünürlük, renk, boyut ve sıra bilgileri birlikte gösterilmeli.
- Değişikliklerin kaç siparişi ve kullanıcıyı etkileyeceği gösterilmeli.
Öncelikli genel geliştirme önerileri
En faydalı geliştirmeleri şu sırada öneriyorum:
1. Hazır çalışma alanı şablonları:
   - Owner
   - Designer
   - Finance
   - Workshop
   - Mobile
2. Sipariş türüne göre otomatik kart düzeni:
   - Custom Order
   - Repair / Service
3. Kullanıcıya özel düzen:
   - Aynı workspace’te her ekip üyesi farklı kart görünümü kullanabilmeli.
4. Compact/Standard/Detailed sipariş listesi.
5. Kart değişikliklerinde Undo.
6. “Bu düzeni benzer siparişlere uygula.”
7. Kart menüsünde klavye ile taşıma seçenekleri.
8. Gecikme, eksik ödeme veya bekleyen onay için akıllı “Dikkat gerekiyor” alanı.
9. Mobilde tek sütun ve katlanabilir kart sistemi.
10. Ortak düzen değişmeden önce kapsam önizlemesi.
Genel sonuç
Kart sistemi işlevsel ve güçlü:
- Kartlar boyutlandırılabiliyor.
- Sütun genişlikleri ayarlanabiliyor.
- Kartlar kilitlenebiliyor.
- Renkler değiştirilebiliyor.
- Kart görünürlüğü yönetilebiliyor.
- Ortak ve siparişe özel düzen ayrımı bulunuyor.
- Sürükleme sırasında saydamlık, kart arası bırakma alanları ve sütun hedefleri doğru şekilde gösteriliyor.
Doğrulanmış temel sorun, kart taşıma sisteminin çalışmaması değil. Geliştirilmesi gereken ana alanlar; ilk kullanımın daha kolay anlaşılması, ayar kapsamının açıklanması, erişilebilirlik ve çok sayıda kartın daha pratik yönetilmesidir.
