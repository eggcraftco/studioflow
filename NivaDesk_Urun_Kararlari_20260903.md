# NivaDesk — Ürün Kararları ve Uygulama Notları

Tarih: 3 Eylül 2026

Bu doküman, dış denetim raporunda karar verilmesi gereken 5 temel ürün davranışı için alınan nihai kararları içerir. Amaç, NivaDesk’in veri bütünlüğü, finansal tutarlılık, ekip yönetimi ve kullanıcı deneyimini rakip SaaS ürünlerdeki yaygın yaklaşımlarla uyumlu ve ölçeklenebilir hale getirmektir.

---

## 1. Müşteri Silme Davranışı

### Karar

Bir müşteri silindiğinde, geçmiş siparişlerdeki müşteri adı **korunmalıdır**.

Siparişlerdeki müşteri adı hiçbir durumda otomatik olarak `"New Project"` olarak değiştirilmemelidir.

### Önerilen yapı

Müşteri yönetiminde üç farklı işlem birbirinden ayrılmalıdır:

#### Archive Customer
- Varsayılan ve önerilen işlem.
- Müşteri aktif müşteri listesinden kaldırılır.
- Siparişleri, geçmişi, ödemeleri ve müşteri bilgileri korunur.
- Daha sonra tekrar aktive edilebilir.

#### Delete Customer Profile
- Müşteri ana müşteri listesinden kaldırılır.
- Geçmiş siparişler silinmez.
- Sipariş oluşturulduğu zamanki müşteri adı sipariş üzerinde korunur.
- Siparişin finansal ve operasyonel geçmişi değişmez.

#### Erase Personal Data
GDPR / privacy talepleri için ayrı bir işlem olmalıdır.

Bu işlem:
- e-posta
- telefon
- WhatsApp
- adres
- diğer kişisel tanımlayıcı bilgileri

anonimleştirebilir.

Siparişler yine korunur.

Gerekirse müşteri adı:

`Anonymised Customer`

olarak değiştirilebilir.

### Uygulanmaması gereken davranış

Müşteri silindiğinde:

`Customer Name → New Project`

yapılmamalıdır.

Bu işlem tarihsel veriyi ve eski faturaların anlamını bozar.

---

## 2. Kâr ve KDV Hesaplama Sistemi

### Karar

Web, iOS, macOS ve Android kendi ayrı kâr/KDV hesaplarını yapmamalıdır.

NivaDesk'te **tek merkezi Finance Engine** oluşturulmalıdır.

Tüm platformlar aynı server-side hesaplama sonucunu kullanmalıdır.

### Temel finans kavramları

#### Gross Margin

`Revenue - Direct Cost`

Örnek:

- Revenue: £2,000
- Product Cost: £1,200

Gross Margin:

`£800`

---

#### Net Profit

Genel yapı:

`Revenue - VAT Due - Base Cost - Platform Fees - Shipping - Other Expenses - Refunds / Adjustments`

Net Profit, kullanıcının gerçekten siparişten ne kadar kazandığını göstermelidir.

---

#### VAT Due

VAT hesabı seçili vergi yöntemine göre Finance Engine tarafından hesaplanmalıdır.

### Workspace Financial Settings

Aşağıdaki ayarlar önerilir:

- VAT Registered: Yes / No
- Default VAT Rate
- Prices: VAT Inclusive / VAT Exclusive
- Default VAT Method:
  - Standard VAT
  - Margin Scheme
  - No VAT

Gerekirse bu ayarlar sipariş bazında override edilebilmelidir.

---

### Standard VAT

Örnek:

VAT-inclusive satış:

`£120`

VAT oranı:

`20%`

VAT:

`£120 × 20 / 120 = £20`

---

### VAT Margin Scheme

Uygun ürünlerde:

`VATable Margin = Selling Price - Eligible Purchase Price`

20% VAT için:

`VAT Due = Margin × 1/6`

Örnek:

- Purchase Price: £1,500
- Selling Price: £2,000
- Margin: £500

VAT:

`£83.33`

---

### Önemli kural

Bir ayar:

`financialShowBaseCost = false`

ise bu yalnızca arayüzde Base Cost rakamını gizlemelidir.

Base Cost finans hesabından çıkarılmamalıdır.

UI görünürlüğü ile muhasebe hesabı birbirinden ayrılmalıdır.

---

### Teknik prensip

Finans formüllerinin gerçek kaynağı:

`Server-side Finance Engine`

olmalıdır.

Web / iOS / macOS / Android yalnızca bu sonucu görüntülemelidir.

---

## 3. "+ Add Project" Davranışı

### Karar

`+ Add Project`

butonuna basıldığında direkt boş sipariş oluşturulmamalıdır.

Önce küçük bir **Quick Create / Mini Form** açılmalıdır.

### Önerilen mini form

#### Customer
Ana alan.

Kullanıcı:

- mevcut müşteri arayabilir
- mevcut müşteriyi seçebilir
- `+ New Customer` ile yeni müşteri oluşturabilir

#### Project Name
Opsiyonel olabilir.

Boş bırakılırsa sistem otomatik bir isim üretebilir.

Örnek:

`John Smith · Project #1042`

#### Due Date
Opsiyonel.

### Buton

`Create Project`

butonuna basılmadan veritabanında sipariş oluşturulmamalıdır.

---

### Ek UX

Proje oluşturulduktan sonra kısa süreli:

`Project created · Undo`

bildirimi gösterilebilir.

Yani önerilen sistem:

**Mini Form + Undo**

---

## 4. Team Planından Düşme / Seat Yönetimi

### Karar

Team planından daha düşük plana geçildiğinde fazla ekip üyeleri **tam erişimle kalmamalıdır**.

Ancak kullanıcılar veya geçmiş verileri de silinmemelidir.

### Önerilen akış

Kullanıcı Team planını downgrade ettiğinde mevcut plan billing period sonuna kadar devam eder.

NivaDesk şu mesajı gösterebilir:

> Your Team plan ends on 4 October.  
> Your new plan allows 1 member.  
> Choose which members will retain access.

Owner hangi üyelerin erişimde kalacağını seçebilir.

---

### Downgrade gerçekleştiğinde

Yeni plan limitinin üzerindeki kullanıcılar:

`Suspended / No Access`

durumuna geçmelidir.

### Korunması gerekenler

- kullanıcının geçmiş activity kayıtları
- sipariş atamaları
- yaptığı değişikliklerin history kayıtları
- kullanıcı adı
- ekip geçmişi

silinmemelidir.

### Upgrade sonrası

Owner tekrar Team planına geçtiğinde kullanıcılar yeniden aktive edilebilmelidir.

Örnek:

`Restore Access`

---

### Read-only konusu

Fazla üyelerin kalıcı şekilde read-only bırakılması önerilmez.

Özellikle eski çalışanların:

- müşteri bilgileri
- şirket finansı
- dosyalar
- sipariş geçmişi

gibi bilgilere erişmeye devam etmesi güvenlik açısından doğru değildir.

Varsayılan davranış:

`Suspended / No Access`

olmalıdır.

---

## 5. Team Invitation Sistemi

### Karar

Owner ve yetkili Admin kullanıcıları ekip üyelerini **e-posta ile doğrudan davet edebilmelidir**.

Bu, NivaDesk'in ana ekip davet yöntemi olmalıdır.

### Önerilen akış

Team sayfasında:

## Invite Member

### Email

Örnek:

`employee@example.com`

### Role

- Admin
- Member
- View Only

### Project Access

- All Projects
- Assigned Projects Only

### Financial Information

- Visible
- Hidden

### Action

`Send Invitation`

---

## Davet e-postası

Örnek:

> Gunes invited you to join EGGcraft on NivaDesk.

Buton:

`Accept Invitation`

### Kullanıcının hesabı yoksa

- hesap oluşturur
- e-posta doğrular
- workspace'e katılır

### Hesabı varsa

- login olur
- workspace mevcut hesabına eklenir

---

## Mevcut Company ID / Join Request Sistemi

Mevcut sistem tamamen kaldırılmak zorunda değildir.

Ancak ana yöntem olmamalıdır.

İkincil seçenek olarak:

`Join a Workspace`

veya

`Enter Company / Invitation Code`

şeklinde tutulabilir.

Ana akış:

**Owner/Admin → Invite by Email**

olmalıdır.

---

# Nihai Karar Özeti

## 1. Customer Deletion

- Sipariş geçmişi korunacak.
- Müşteri adı geçmiş siparişlerde kalacak.
- `"New Project"` yapılmayacak.
- Archive / Delete Profile / Erase Personal Data birbirinden ayrılacak.

## 2. Finance

- Tek merkezi server-side Finance Engine kurulacak.
- Web, iOS, macOS ve Android aynı sonucu kullanacak.
- Gross Margin, Net Profit ve VAT Due ayrı kavramlar olacak.
- Standard VAT / Margin Scheme / No VAT desteklenecek.
- UI görünürlüğü finans hesabını değiştirmeyecek.

## 3. Add Project

- Direkt boş sipariş yaratılmayacak.
- Önce Quick Create mini form açılacak.
- Customer ana alan olacak.
- Create Project sonrası isteğe bağlı Undo gösterilecek.

## 4. Plan Downgrade

- Billing period sonuna kadar mevcut Team erişimi devam edecek.
- Yeni plan seat limitinin üzerindeki kullanıcılar Suspended / No Access olacak.
- Kullanıcı geçmişi ve sipariş geçmişi korunacak.
- Upgrade sonrası restore edilebilecek.

## 5. Team Invitations

- Owner/Admin doğrudan e-posta ile davet gönderecek.
- Davet sırasında rol ve erişim seviyesi seçilecek.
- Mevcut Company ID / Join Request sistemi alternatif yöntem olarak kalacak.

---

# Genel Ürün Prensibi

Bu kararların ortak amacı:

- veri geçmişini korumak
- finansal hesapları merkezi hale getirmek
- yanlışlıkla veri üretimini azaltmak
- plan ve ekip yetkilerini güvenli hale getirmek
- NivaDesk'i büyüdükçe yönetilebilir tutmak

Özellikle Finance Engine, permissions ve historical data yaklaşımı bundan sonraki Shopify, Etsy, WooCommerce, QuickBooks, Xero, Pandle ve diğer entegrasyonların da temelini oluşturmalıdır.
