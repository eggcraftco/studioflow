NivaDesk Notes — Nihai İnceleme Raporu
İnceleme review@nivadesk.app hesabında yapıldı. Mevcut order ve notlar değiştirilmedi. Test için geçici bir QA notu oluşturuldu; arama, etiket, hatırlatıcı ve çöp işlemleri kontrol edildikten sonra yalnızca bu geçici not kalıcı olarak silindi.
1. Genel değerlendirme
Notes menüsü, Google Keep referansını görsel ve işlevsel olarak açık biçimde yansıtıyor:
- Renkli not kartları
- Pin
- Reminder
- Collaborators
- Labels
- Archive
- Trash
- Search
- Duplicate/copy
- Görsel ekleme
- Kart üzerinden hızlı işlemler
Temel fikir doğru. Sayfa kolay öğreniliyor ve kişisel hızlı not kullanımı için iyi bir başlangıç sunuyor.
Ancak NivaDesk, Google Keep’ten farklı olarak order, customer, ekip, schedule ve portal gibi iş kayıtlarına sahip. Bu nedenle yalnızca Keep benzeri not kartları yeterli değil. Notes menüsünün en önemli görevi, farklı bölümlerdeki notları doğru tür, ilişki ve görünürlükle merkezi olarak yönetmek olmalı.
Şu anda kişisel notlar, project/order notları, customer notes ve order reminder’ları arasında belirgin bir parçalanma var.
MEVCUT NOTES MENÜSÜ
2. Mevcut yapı
Sol menüde şu bölümler bulunuyor:
Notes
Reminders
Project Notes
Labels
Archive
Trash
Not kartlarında:
- Başlık
- İçerik
- Renk
- Pin
- Reminder
- Collaborators
- Archive
- More
- Label
işlemleri bulunuyor.
Yeni not formunda:
- Title
- Note
- Color
- Reminder date
- Image
- Labels
- Collaborators
alanları mevcut.
More menüsünde:
- Duplicate note
- Copy note
- Label seçimi
- Move to trash
işlemleri bulunuyor. Trash içinde ise:
- Restore note
- Delete forever
işlemleri sunuluyor.
Bu temel özellikler Google Keep tarzı genel not sistemi için uygundur.
3. Görsel tasarım değerlendirmesi
Başarılı yönler
- Sol navigasyon sade ve anlaşılır.
- Notların renklerle ayrılması hızlı görsel tarama sağlıyor.
- Kartların üzerine gelmeden de temel içerik okunabiliyor.
- Arama alanı görünür ve kolay erişilebilir.
- Pin, renk, reminder ve archive işlemleri karttan yapılabiliyor.
- Arayüz genel NivaDesk tasarımıyla uyumlu.
- Empty state mesajları bulunuyor.
Geliştirilmesi gereken yönler
Ekran büyük olduğunda kartlar yalnızca tek bir yatay sıra hâlinde diziliyor ve alt tarafta çok büyük boş alan oluşuyor. Google Keep’in güçlü taraflarından biri, farklı uzunluktaki notları alanı iyi kullanan responsive masonry/grid yapısında göstermesidir.
Öneri:
- Responsive grid/masonry görünümü
- Liste/grid görünüm seçimi
- Kart genişliği seçimi: Compact, Standard, Comfortable
- Uzun içeriklerin belirli yükseklikte kesilmesi
- Kart açıldığında tam içerik paneli/modalı
- Sabitlenmiş notların ayrı Pinned başlığı altında gösterilmesi
- Diğer notların Others altında gösterilmesi
- Mobil ve dar ekranlarda tek sütun
Mevcut kartlardaki bazı başlıklar Courier pi..., Review C... şeklinde erken kesiliyor. Kart biraz daha genişletilebilir veya başlık iki satıra izin verebilir.
4. Arama
Arama testi başarılı oldu:
- Başlık üzerinden doğru not bulundu.
- Sonuç sayısı 1 note olarak güncellendi.
- Arama hızlı biçimde listeyi daralttı.
Ancak arama metni başka sol menü bölümlerine geçildiğinde korunuyor. Örneğin Trash’e geçince arama hâlâ aktif kaldığı için:
- Sol menü Trash 1 gösterebilir.
- İçerik alanı 0 notes ve Trash is empty gösterebilir.
Bu teknik olarak filtre sonucudur ama kullanıcıya çöpün gerçekten boş olduğu izlenimini verir.
Daha doğru mesaj:
No notes match “QA Notes Review”
1 other note is in Trash

[Clear search]
Arama kapsamı ayrıca açıklanmalıdır:
- Sadece aktif görünümde mi arıyor?
- Archive ve Trash dahil mi?
- Customer/project isimlerinde arıyor mu?
- Label, collaborator ve not içeriğini arıyor mu?
5. Labels
Etiket ekleme çalıştı:
- Yeni etiket oluşturuldu.
- Not kartında göründü.
- Sol menüye otomatik olarak eklendi.
- Yanında not sayısı gösterildi.
- Test notu silindiğinde boş etiket sol menüden kayboldu.
Bu davranış iyi.
Geliştirme önerileri:
- Etiketi yeniden adlandırma
- Etiket silme
- Etiket rengi
- Birden fazla etiketi filtreleme
- Etiketleri birleştirme
- Workspace genelinde ortak etiketler
- Kişisel etiketler ve ekip etiketleri ayrımı
Labels için ayrı bir yönetim alanı veya Manage labels işlemi eklenebilir.
6. Renk sistemi
Renkler Google Keep referansına uyuyor ve notları görsel olarak ayırmak için yararlı.
Ancak renklerin anlamı tamamen kullanıcı hafızasına bırakılmamalıdır. Kullanıcı isterse renklere anlam atayabilmelidir:
Red → Urgent
Yellow → Waiting
Green → Approved
Blue → Idea
Purple → Customer request
Renk erişilebilirlik açısından tek durum göstergesi olmamalı. Renk körlüğü olan kullanıcılar için label veya ikonla desteklenmelidir.
Ayrıca renk seçim düğmelerinin erişilebilir isimleri bulunmalı:
- Default
- Red
- Orange
- Yellow
- Green
- Blue
- Purple
- Pink
Şu anda yeni not formundaki renk düğmeleri erişilebilir yapıda isimsiz görünüyor.
DOĞRULANAN TEKNİK PROBLEM
7. Reminder tarihi kaydedilmedi
Geçici QA notu oluşturulurken reminder alanına 26/08/2026 tarihi girildi ve not kaydedildi.
Sonuç:
- Not başarıyla kaydedildi.
- Label başarıyla kaydedildi.
- Not Notes bölümünde göründü.
- Fakat Reminders bölümü 0 notes / No reminders gösterdi.
- Not yeniden açıldığında reminder tarih alanı boştu.
Dolayısıyla reminder tarihi kayıt sırasında korunmadı.
Bu yüksek öncelikli bir problemdir; çünkü arayüz kaydın başarılı olduğu izlenimini veriyor fakat tarih sessizce kayboluyor.
Beklenen davranış:
1. Tarih girilir.
2. Not kaydedilir.
3. Kart üzerinde reminder etiketi görünür.
4. Not Reminders bölümüne düşer.
5. Tarih yaklaşınca notification oluşur.
6. Not yeniden açıldığında tarih korunur.
Ayrıca yalnızca tarih değil, saat de desteklenmelidir:
26 Aug 2026 · 10:30
Önerilen hızlı seçenekler:
- Later today
- Tomorrow
- Next week
- Pick date & time
- Repeat
- Remove reminder
PROJECT NOTES VE ORDER NOTES
8. Project Notes şu anda ne gösteriyor?
Project Notes bölümünde order kartlarının Notes alanlarındaki içerikler merkezi biçimde listeleniyor.
Her kayıtta:
- Order/design adı
- Customer adı
- Not türü
- Not içeriği
görülüyor.
Bu, merkezi Notes menüsü ile order kartları arasındaki doğru bağlantının başlangıcıdır. Order notlarının ayrı kopyaları oluşturulmamalı; aynı order notu burada merkezi görünüm olarak gösterilmelidir.
Doğru mimari:
ORDER NOTE
├── Order: Aurora Dial Project
├── Customer: Amelia Harper
├── Created by
├── Created at
├── Visibility: Internal
└── Notes menüsü → Project Notes görünümünde gösterilir
9. Project Notes içindeki “New Note” problemi
Project Notes görünümündeyken + New Note düğmesine basıldığında normal kişisel not formu açılıyor.
Formda:
- Order seçimi yok
- Customer seçimi yok
- Note type yok
- Project bağlantısı yok
- Görünürlük seçimi yok
Bu nedenle Project Notes ekranından gerçek bir project/order note oluşturmak mümkün görünmüyor. Kullanıcı Project Notes içindeyken New Note dediğinde doğal olarak bir order’a bağlı not oluşturacağını düşünür.
Bu davranış değiştirilmelidir.
İki seçenek var:
Seçenek A — Bağlama göre form
Project Notes içindeyken:
New Project Note

Order *
Customer
Title
Note
Visibility
Collaborators
Reminder
Attachments
formu açılır.
Seçenek B — Tek evrensel form
Her yerden aynı form açılır fakat not türü seçilir:
Note type
[Personal] [Order] [Customer] [Team]

Linked order
Select order…

Linked customer
Automatically selected
Bence ikinci seçenek daha ölçeklenebilir.
10. Project Notes sayaç tutarlılığı
Test sırasında Project Notes başlığı 8 notes gösterirken görünür listede altı project/order notu bulundu.
Bunun nedeni boş not alanları, filtrelenen kayıtlar veya farklı not türlerinin sayaca dahil edilmesi olabilir. Ancak kullanıcı açısından sayaç ile görünür liste uyumlu değil.
Kontrol edilmesi gerekenler:
- Sayaç order sayısını mı, not alanı sayısını mı gösteriyor?
- Boş not alanları sayılıyor mu?
- Arşivlenmiş order notları dahil mi?
- Bir order içindeki birden fazla özel not alanı ayrı ayrı mı sayılıyor?
- Kullanıcının erişemediği notlar sayaca dahil mi?
Sayaç yalnızca o görünümde gerçekten listelenebilen kayıtları göstermelidir.
11. Order Notes kartı
QA order’da ayrı bir Notes kartı bulunuyor:
Notes
Special Notes
Add note here...
Ayrıca + Add note field işlemi mevcut.
Bu kart, order’a özgü operasyonel notlar için uygundur. Fakat Special Notes gibi serbest alan başlıkları kullanıldığında yapı zamanla dağılabilir.
Önerilen kullanım:
- Kullanıcı özel not alanı oluşturabilir.
- Her alanın başlığı değiştirilebilir.
- Alanlar merkezi Project Notes görünümünde bulunabilir.
- Notta oluşturan ve güncelleyen kişi gösterilir.
- Değişiklik geçmişi korunur.
- Order notu kopyalanmadan merkezi Notes’ta listelenir.
Ancak uzun vadede “alan tabanlı not” ile “zaman akışlı not” ayrımı yapılması faydalıdır.
Sabit bilgi alanı
Örneğin:
Special Instructions
Customer wants a matte finish.
Bu, güncellenebilir tek bir sabit alandır.
Not akışı
Örneğin:
25 Aug · review@nivadesk.app
Customer confirmed the darker blue.

26 Aug · Owner
Supplier can deliver on Friday.
Bu ise silinmeden büyüyen kronolojik bir not akışıdır.
Şu anki yapı daha çok sabit alan mantığında. İş takibi için kronolojik yorum/not akışı da eklenmelidir.
CUSTOMER NOTES
12. Customer Notes’un görevi
Order içindeki Customer & Communication kartında ayrıca Customer Notes alanı bulunuyor.
Bu alan, sadece o order’a değil müşterinin tamamına ait bilgileri temsil etmelidir.
Örneğin:
- Preferred contact method
- Available after 5pm
- Repeat customer
- Requires accessible communication
- Packaging preference
- General relationship information
Customer Notes, müşteri hangi order’dan açılırsa açılsın aynı müşteri kaydından gelmelidir.
Doğru ilişki:
CUSTOMER
└── Customer Notes
    ├── Customer detayında görünür
    ├── İlgili order’larda okunabilir
    └── Notes → Customer Notes görünümünde bulunabilir
13. Customer Notes ile Order Notes ayrımı
Bu ayrım kullanıcıya açık biçimde anlatılmalıdır.
Customer Notes
Müşterinin bütün ilişkileri için geçerlidir:
Customer prefers WhatsApp communication.
Order Notes
Yalnızca tek bir iş için geçerlidir:
Use the darker blue approved on 25 August.
Bir order’da Customer Notes düzenlendiğinde sistem şu uyarıyı gösterebilir:
This note belongs to the customer and will appear on all their orders.

Order Notes için:
This note belongs only to this order.

Bu açıklama olmazsa kullanıcı yanlışlıkla order’a özgü bir bilgiyi bütün müşteriye veya müşteri bilgisini tek order’a kaydedebilir.
14. Customer Notes için ayrı merkezi görünüm
Notes sol menüsüne şu bölüm eklenebilir:
Customer Notes
Burada:
- Customer adı
- Son güncelleme
- Not içeriği
- Bağlı order sayısı
- Oluşturan/güncelleyen
- Hassasiyet veya görünürlük
gösterilebilir.
Ancak Notes ana sayfasında bütün Customer Notes kartlarının kişisel notlarla karıştırılması doğru olmaz. Bunlar ayrı filtre/görünüm olarak sunulmalıdır.
REMINDER SİSTEMLERİNİN PARÇALANMASI
15. İki farklı reminder sistemi var
Order içinde Schedule & Alerts kartı bulunuyor. Burada:
- Quick Reminder
- Reminder title
- Date & Time
- Priority
- Notify
- Optional note
- Upcoming
alanları mevcut.
Notes menüsünde ise ayrı bir Reminders bölümü ve not formunda reminder tarihi var.
Şu anda bunların aynı merkezi reminder sisteminden beslendiği anlaşılmıyor. Notes reminder testi de kaydedilmedi.
Bu ayrım kullanıcı için karışıklık yaratabilir:
- Notes reminder nereye bildirim gönderiyor?
- Order reminder Reminders menüsünde görünüyor mu?
- Schedule’da görünüyor mu?
- Notification merkezinde görünüyor mu?
- Assigned kullanıcı kim?
- Bir reminder tamamlanabilir mi?
- Snooze edilebilir mi?
Önerilen yapı:
REMINDER — Merkezi kayıt
├── Personal Note
├── Order
├── Customer
├── Task
└── Standalone
Notes → Reminders görünümü kullanıcının erişebildiği bütün reminder’ları gösterebilir; bağlantı türünü de açıkça yazabilir:
Follow up customer
Tomorrow · 10:30
Order: Pop-up Sergi Standı
Assigned to: review@nivadesk.app
Order reminder’larının Notes içinde gösterilmesi istenmiyorsa bölümün adı Note Reminders olmalıdır.
COLLABORATORS VE YETKİLER
16. Collaborators alanı
Yeni not formunda e-posta yazarak collaborator ekleme alanı bulunuyor. Bu güçlü bir özellik fakat güvenlik kuralları belirsiz.
Açıklanması gerekenler:
- Yalnızca workspace member mı eklenebilir?
- Harici e-posta adresi eklenebilir mi?
- Eklenen kişi notu düzenleyebilir mi?
- Yalnızca görüntüleyebilir mi?
- Customer collaborator olabilir mi?
- Kullanıcı workspace dışındaysa davet gönderilir mi?
- Collaborator kaldırıldığında erişim hemen kesilir mi?
Workspace uygulaması için daha güvenli yaklaşım:
Share with
Search workspace members…

Permission
[Can view] [Can edit]
Harici paylaşım gerekiyorsa ayrı ve açık bir işlem olmalı:
Create secure external link
Order veya Customer internal notları yanlışlıkla harici kişilere paylaşılamamalıdır.
17. Not görünürlüğü
Her notta tür ve görünürlük ayrı tutulmalıdır:
Type
Personal / Order / Customer / Team

Visibility
Only me
Selected team members
Workspace
Client portal
Varsayılanlar:
- Personal Note → Only me
- Order Note → Order team
- Customer Note → Internal workspace
- Team Note → Selected team/workspace
- Client-visible Note → Açık kullanıcı onayı
Özellikle internal order/customer notları otomatik olarak portalda gösterilmemelidir.
ÖNERİLEN NİHAİ NOTES YAPISI
18. Sol menü
NOTES
All Notes
My Notes
Reminders
Pinned

LINKED NOTES
Orders
Customers
Team

ORGANISE
Labels
Archive
Trash
Project Notes yerine NivaDesk genelinde kullanılan isim Orders veya Order Notes olabilir. Uygulamanın ana bölümü Orders olduğu için aynı terminolojiyi kullanmak daha tutarlıdır.
19. Tek not veri modeli
Files sistemindeki “bir kere yükle, farklı kayıtlara bağla” yaklaşımına benzer biçimde notlar da tek kayıt olarak tutulmalıdır.
NOTE
├── Title
├── Content
├── Type
├── Color
├── Labels
├── Reminder
├── Attachments
├── Collaborators
├── Visibility
├── Created by
├── Created at
├── Updated by
├── Updated at
└── Links
    ├── Order
    ├── Customer
    ├── Inventory Item
    └── Team Member
Bir order notu Notes menüsünde gösterildiğinde ikinci bir kopya oluşturulmamalıdır.
20. Önerilen yeni not formu
New Note

Type
Personal / Order / Customer / Team

Link to
Select order or customer…

Title
Note

Attachments
Reminder
Labels
Colour

Visibility
Only me / Order team / Workspace / Client portal

Collaborators
Search team members…

[Cancel] [Save]
Form, seçilen türe göre sadeleşebilir. Kişisel not oluştururken order alanlarını göstermeye gerek yoktur.
21. Kart üzerinde gösterilmesi gereken bilgiler
Kişisel notlarda yalnızca başlık ve içerik yeterli olabilir. Bağlı notlarda bağlam görünmelidir:
ORDER NOTE
Pop-up Sergi Standı — Team QA
QA Team Test Customer

Customer confirmed the final dimensions.

26 Aug · review@nivadesk.app
Internal · QA Review
Bu bilgiler olmazsa kullanıcı Notes ekranında notun kime veya hangi işe ait olduğunu anlamakta zorlanır.
22. Google Keep’ten alınabilecek ek özellikler
- Checklist oluşturma
- Kartları sürükleyerek sıralama
- Pinned/Others ayrımı
- Masonry görünüm
- Label yönetimi
- Arka plan rengi
- Resimli not
- Reminder
- Collaborator
- Archive
- Trash
- Duplicate
- Grid/list değişimi
Ancak NivaDesk’e özgü olarak ayrıca şunlar eklenmelidir:
- Order/customer bağlantısı
- Not türü
- Internal/client visibility
- Oluşturan ve güncelleyen kişi
- Değişiklik geçmişi
- Team permission
- Activity log
- Order’a git
- Customer’a git
- Task’a dönüştür
- Reminder’ı Schedule’a gönder
- Dosya bağlantısı
23. Kullanışlı hızlı işlemler
Bir notun More menüsüne bağlama göre şunlar eklenebilir:
- Open linked order
- Open customer
- Convert to task
- Add to Schedule
- Link to order
- Link to customer
- Change visibility
- View activity
- Duplicate
- Archive
- Move to trash
Özellikle “Convert to task” yararlı olur. Çünkü not içindeki yapılacak işlerin checkbox metni olarak kalması yerine atanan, tarihli ve takip edilebilir göreve dönüşmesi gerekir.
ÖNCELİK SIRASI
Yüksek öncelik
1. Reminder tarihinin kaydedilmemesi düzeltilmeli.
2. Personal, Order ve Customer Notes ayrımı açıklaştırılmalı.
3. Project Notes içindeki New Note, order bağlantısı kurabilmeli.
4. Notes reminder ile Order Schedule & Alerts ilişkisi tanımlanmalı.
5. Internal ve client-visible notlar kesin biçimde ayrılmalı.
6. Collaborator yetkileri açıklanmalı.
7. Project Notes sayaç/listesi tutarlılığı kontrol edilmeli.
Orta öncelik
1. Customer Notes için merkezi görünüm
2. Order Notes’ta kronolojik yorum akışı
3. Created by/updated by/timestamp
4. Liste/grid seçimi
5. Pinned/Others ayrımı
6. Responsive masonry düzeni
7. Search filtrelerinin açıklanması
8. Filtered empty state mesajları
9. Label yönetimi
İyileştirme
1. Checklist editörü
2. Recurring reminder
3. Snooze
4. Task’a dönüştürme
5. Notes içinden linked record açma
6. Attachments ile merkezi Files ilişkisi
7. Activity/audit history
8. Klavye kısayolları
Sonuç
Google Keep referansı kişisel notların görsel yapısı için doğru bir başlangıç. Mevcut Notes menüsü renk, pin, labels, archive, trash, search ve collaborators açısından bu referansa oldukça uyuyor.
Fakat NivaDesk açısından asıl değer, bütün notları tek kart görünümünde toplamak değil; aralarındaki farkı doğru koruyarak merkezi erişim sağlamaktır:
Personal Note
→ Kişiye ait

Order Note
→ Tek bir order’a ait

Customer Note
→ Müşterinin bütün ilişkilerine ait

Team Note
→ Belirli ekip üyeleriyle ortak

Reminder
→ Bu kayıt türlerinden birine bağlanabilen merkezi zaman kaydı
En doğru temel kural şu olur:
Not bir kez oluşturulur; Notes menüsü, Order kartı ve Customer ekranı aynı not kaydını kendi bağlamlarında gösterir. Notun türü, bağlı kaydı ve kimlerin görebileceği birbirinden ayrı tutulur.

Bu düzenleme yapılırsa Notes menüsü, Google Keep benzeri bağımsız bir not ekranı olmaktan çıkar ve NivaDesk’in order, customer, ekip ve schedule sistemlerini birbirine bağlayan güçlü bir çalışma merkezi hâline gelir.
