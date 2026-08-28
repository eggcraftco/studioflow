# NivaDesk Features Sayfasi Arastirma ve Yol Haritasi

Bu dosya, global web sitesindeki `/features` sayfasi icin yapilan uygulama arastirmasini, mevcut dosya agini, uygulanan degisiklikleri ve sonraki adimlari kayit altina alir.

## Amac

NivaDesk'in tum ana ozelliklerini public web sitesinde herkesin gorebilecegi sekilde anlatan, satin alma kararina yardim eden ama mevcut kullanicilar icin de urunun gercek kapsamlarini netlestiren bir Features sayfasi hazirlamak.

Karar:
- Ozellik anlatimi public olmali.
- Derin kullanim rehberleri daha sonra Help Center / Learn / Academy gibi ayri bir alana tasinabilir.
- Public Features sayfasi pazarlama diliyle sinirli kalmamali; uygulamanin gercek modullerini aciklamali.

## Incelenen Ana Dosya Agi

```txt
EGGcraft/
├── PROJECT_CONTEXT.md
├── EGGcraft/
│   ├── Siparis.swift
│   ├── SiparisDetayView.swift
│   ├── DashboardView.swift
│   ├── MusterilerView.swift
│   ├── StudioMessagesView.swift
│   ├── AutoReplyView.swift
│   ├── AyarlarView.swift
│   └── NotificationManager.swift
├── studioflow-android/
│   └── app/src/main/java/uk/co/eggcraft/studioflow/
│       ├── features/orders/
│       ├── features/customers/
│       ├── features/schedule/
│       ├── features/messages/
│       ├── features/quickreply/
│       ├── features/notes/
│       ├── features/dashboard/
│       ├── features/settings/
│       └── data/model/StudioModels.kt
└── studioflow-web/
    ├── app/
    │   ├── page.tsx
    │   ├── features/page.tsx
    │   ├── pricing/page.tsx
    │   ├── dashboard/page.tsx
    │   ├── orders/page.tsx
    │   ├── orders/[orderId]/page.tsx
    │   ├── customers/page.tsx
    │   ├── files/page.tsx
    │   ├── messages/page.tsx
    │   ├── notes/page.tsx
    │   ├── schedule/page.tsx
    │   ├── team/page.tsx
    │   ├── export/page.tsx
    │   └── globals.css
    ├── components/
    │   └── PublicMarketing.tsx
    └── lib/
        ├── publicSite/
        │   ├── metadata.ts
        │   ├── translations.ts
        │   └── i18n.tsx
        └── studioflow/
            ├── orders.ts
            ├── customers.ts
            ├── clientFiles.ts
            ├── export.ts
            ├── finance.ts
            ├── messages.ts
            ├── notes.ts
            ├── plans.ts
            ├── teamActions.ts
            └── notifications.ts
```

## Arastirmadan Cikan Gercek Urun Ozellikleri

### Siparis Merkezi

Uygulamanin ana modeli `Siparis.swift` icinde siparisin sadece basit bir kayit olmadigi goruluyor. Siparis su bilgileri tasiyor:
- Musteri adi
- Odeme tarihi
- Odenen tutar
- Kalan tutar
- Maliyet
- Tasarim adi ve tasarim linki
- Iletisim bilgileri
- E-posta, Instagram, WhatsApp
- Notlar
- Tasarim / uretim durumu
- Kargo ve takip bilgileri
- Vergi, komisyon ve teslimat maliyeti
- Oncelik ve risk alanlari
- Custom fields ve toggles
- History / log
- Client Files
- To Do
- Work Sessions
- Atanan ekip uyesi

Public sayfada bu, "complete order record" olarak anlatildi.

### Siparis Detay Kart Sistemi

Features sayfasinda anlatilmasi gereken kartlar:
- Preview
- Order Summary
- Customer & Communication
- Materials & Inventory
- Priority / Risk
- Timeline & Delivery
- Notes
- Client Files
- To Do
- Work Time
- Financial Info
- Production Status
- Shipping & Tracking
- Schedule & Alerts
- History / Log

Mevcut `PublicMarketing.tsx` icindeki `ORDER_CARDS` yapisi korunarak Features sayfasina da tasindi.

### Client Files

`PROJECT_CONTEXT.md` ve model dosyalarindan cikan ozellikler:
- PDF
- JPG
- PNG
- HEIC
- HEIF
- WEBP
- PSD
- PSB
- Upload File
- Gallery
- Camera
- Files
- Share Sheet
- Drag & Drop
- Upload Safety
- MB limit
- Metadata
- Audit log
- Offline upload queue
- Make Offline
- Preview
- Download
- Use image in Preview Card

Public sayfada bu kisim "Files stay attached to the job" olarak detaylandirildi.

### To Do

Siparis icinde gorev sistemi var:
- Gorev ekleme
- Done checkbox
- Atama
- Due date
- Priority
- Filtreler
- Siralama
- Move Up / Down / Top / Bottom
- Apple Reminders entegrasyonu
- PDF export

Team planinda gorev atama ozelligi daha onemli bir satis noktasi.

### Schedule & Alerts

Schedule ve reminder yapilari siparisin icinde tutuluyor:
- Manual reminder
- Due date
- Priority
- Notify
- Complete
- Snooze
- Delete
- Calendar-style timing

Public sayfada Timeline & Delivery ve Schedule & Alerts kartlariyla anlatildi.

### Work Time

Siparis icinde calisma sureleri tutulabiliyor:
- Work session
- Start / stop
- Duration
- Created by
- Source

Bu ozellik order card sisteminde "Work Time" olarak yer aliyor.

### Finance

Plan bazli finans yapisi var:
- Free/Demo: Paid ve Cost temel alanlari acik.
- Lite / Pro / Team: advanced finance alanlari acik.
- Remaining
- Full Payment
- Payment Method
- Platform Fee
- Shipping Cost
- VAT / Tax
- Final Profit

Public sayfada "Plan-aware finance" olarak anlatildi.

### Team Access

Team Access ozellikleri:
- Join request
- Approve / decline
- Role update
- Remove member
- Owner / admin / member / workflow izinleri
- Team-only rol yonetimi
- Team-only To Do assignment
- Her kullanicinin kendi kart layout / renk / gorunurluk / boyut ayarlari
- Owner layout sync
- Stop Sync

Public sayfada bu kisim "Team access without losing ownership" olarak detaylandirildi.

### Offline ve Sync

Uygulamada offline akis var:
- Online / offline status
- Orders local cache
- Customers local cache
- Offline edits as pending sync
- Cloud / sync icon states
- Client Files offline upload queue

Public sayfada "Offline and sync status" olarak anlatildi.

### Export ve Data Continuity

Onemli urun kurali:
- Export Free/Demo'da bile acik kalmali.
- Kullanici kendi verisine kilitlenmemeli.
- Orders CSV
- Customers CSV
- JSON backup

Public sayfada "Export and data continuity" olarak anlatildi.

### Platformlar

Mevcut yon:
- Apple: Mac, iPad, iPhone
- Android: phone, tablet, wide layouts
- Web portal: dashboard, orders, files, export, team, billing
- Windows: future support

Public sayfada mevcut PlatformNote bolumu korunarak kullanildi.

## Yapilan Web Degisiklikleri

### Degisen Dosyalar

```txt
studioflow-web/
├── components/
│   └── PublicMarketing.tsx
├── lib/
│   └── publicSite/
│       └── translations.ts
└── app/
    └── globals.css
```

### PublicMarketing.tsx

Eklenen yeni yapilar:
- `FeatureDeepDive`
- `FeatureCapability`
- `FEATURE_DEEP_DIVES`
- `FEATURE_CAPABILITIES`
- `FeatureDeepDiveSection`
- `FeatureCapabilityMatrix`

`PublicFeaturesPage` icine eklenen sayfa akisi:
1. Page hero
2. FeatureWorkflowPanel
3. FeatureDeepDiveSection
4. OrderCardTitleGrid
5. Feature highlight cards
6. FeatureCapabilityMatrix
7. PlatformNote

### translations.ts

Ingilizce ve Turkce metinler eklendi:
- Full feature tour
- Complete order record
- Files stay attached to the job
- Team access without losing ownership
- Offline and sync status
- Card customization
- Plan-aware finance
- Messages and quick replies
- Notes and history
- Export and data continuity

Not:
- Diger dillerde mevcut fallback davranisi korunuyor.

### globals.css

Yeni stiller:
- `.public-features-deep-section`
- `.public-features-deep-panel`
- `.public-features-deep-copy`
- `.public-features-kpi-row`
- `.public-features-deep-list`
- `.public-feature-capability-section`
- `.public-capability-grid`
- `.public-capability-card`

Responsive davranis:
- Desktop: deep-dive iki kolon, capability grid uc kolon.
- Tablet: capability grid iki kolon.
- Mobile: tum bolumler tek kolon.

## Yapilan Kontroller

Calistirilan komutlar:

```bash
npm run typecheck
npm run build
```

Sonuc:
- Typecheck basarili.
- Production build basarili.
- `/features` route'u build icinde basarili gorundu.
- Production server ile `http://localhost:3000/features` kontrol edildi.
- Yatay tasma gorulmedi.
- Yeni bolumler DOM icinde render oldu:
  - `.public-features-deep-panel`
  - `.public-order-card-system`
  - `.public-feature-grid`
  - `.public-capability-grid`
  - `.public-platform-panel`

## Gozlenen Not

Next dev server tarafinda bir ara stale `.next` cache / dev overlay kaynakli `Cannot read properties of undefined (reading 'call')` hatasi goruldu.

Production build ve production server temiz calisti. Bu nedenle degisikliklerin derleme acisindan saglam oldugu dogrulandi.

## Sonraki Yapilacaklar

### 1. Gercek Ekran Gorselleri

Features sayfasinda su an kodla uretilmis UI hissi var. Daha guclu global site icin ileride gercek veya hazirlanmis ekran gorselleri eklenebilir:
- Order detail board screenshot
- Client Files screenshot
- Dashboard screenshot
- Team Access screenshot
- Mobile/tablet layout screenshot

### 2. Help Center / Learn Alani

Public Features sayfasi satin alma oncesi icin yeterli. Daha sonra ayri rehber sayfalari hazirlanabilir:
- Ilk siparis nasil olusturulur?
- Client Files nasil kullanilir?
- To Do nasil kullanilir?
- Team Access nasil kurulur?
- Export nasil alinir?
- Offline mod nasil calisir?

### 3. Plan Karsilastirma Detaylari

Pricing sayfasiyla Features sayfasi arasinda daha net bag kurulabilir:
- Free/Demo ozellikleri
- Lite ozellikleri
- Pro ozellikleri
- Team ozellikleri
- Plan kilitleri ve upgrade sebepleri

### 4. SEO Icerik Genisletmesi

Global arama icin metinlerde su arama niyetleri hedeflenebilir:
- custom order management software
- studio management app
- creative studio order tracking
- client files order management
- production workflow for custom studios
- team order management for small studios

### 5. Diger Dil Cevirileri

Turkce ve Ingilizce metinler tamamlandi. Daha sonra diger diller icin native ceviri yapilabilir:
- Deutsch
- Francais
- Italiano
- Espanol
- Portugues
- Russian
- Japanese
- Chinese
- Arabic
- Hindi

### 6. Web Portal Feature Parity Takibi

Uygulamadaki her ozelligin web portalda ayni seviyede olup olmadigi ayrica takip edilmeli:
- Order create/edit
- Client Files upload
- To Do edit
- Schedule reminders
- Work Time
- Full finance edit
- Team role management
- Export

Bu is icin `APPLE_TO_WEB_FEATURE_PARITY.md` dosyasi da referans alinabilir.

## Kisa Ozet

Features sayfasi artik sadece genel pazarlama kartlari degil, NivaDesk'in gercek uygulama mimarisine dayanan bir public urun anlatimi. Sayfa hem potansiyel aliciya "bu uygulama ne yapiyor?" sorusunu cevapliyor, hem de mevcut kullaniciya urunun ana modullerini tek yerde gosteriyor.
