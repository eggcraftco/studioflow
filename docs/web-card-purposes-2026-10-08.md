# Web: sipariş kartı "i" — kartın ne için olduğu; "Getting started" yalnız sahibe — 8 Ekim 2026

Dal: `web-cards-info-2026-10-08` (publish deposu, `hostinger/web-messaging-access-2026-10-08` @ `0e39d3d7` üzerinden; o dal canlı `main` `635b8a0f` üstünde).
Durum: **kod hazır · tsc 0 · build 0 · betik 292/292 · ekran kabulü YAPILMADI · CANLI DEĞİL.**
Yayın yapılmadı; `hostinger/main`'e dokunulmadı.

## 1. Düzeltme: 120a7a3d yanlış okumuştu

`120a7a3d` kartın "…" menüsündeki **her seçeneğe** bir açıklama koymuştu (hover/odak balonu,
telefonda panel başlığındaki "i" ile satır altı). Sahibin istediği bu değildi: **her sipariş
kartının başlığında bir "i"**, basınca **o kartın ne için olduğunu** söyleyen tek bir metin
(Timeline & Delivery: teslim tarihi, kalan gün, gecikme; To Do: görev listesi…).

Bu commit:
- Seçenek açıklamaları **kaldırıldı**: `lib/studioflow/orderCardMenuDescriptions.ts` silindi,
  `language.ts`'teki 21 anahtar × 11 dil bloğu silindi, `globals.css`'teki `.block-custom-desc` /
  `.block-custom-info` / `.is-describing` kuralları (101 satır) silindi, `OrderDetailContent.tsx`
  menü paneli `120a7a3d` öncesi düz biçimine döndü (`.block-custom-opt` sarmalayıcıları yok).
  `scripts/check-menu-card-strings.mjs` yalnız sol menü etiketlerini denetliyor (17 kontrol).
- Yerine **kart amacı**: `lib/studioflow/orderCardPurposes.ts` — `ORDER_CARD_PURPOSES`
  (kart id → 1–2 cümle İngilizce), `ORDER_CARD_PURPOSE_TOGGLE` ("What is this card for?"),
  `orderCardPurposeId(cardId)`. 11 dil `language.ts`'te (`mergeIntoTranslations`, derin birleştirme).
  Anahtar **kart id'si**, başlık değil: başlık mesleğe/yeniden adlandırmaya göre değişir
  (`orderCardLabels`), amaç değişmez.

## 2. Davranış (`app/orders/OrderDetailContent.tsx`)

- Başlık satırında "…"ın önünde aynı 40×40 hedefli "i" (`.order-card-menu-button.order-card-info-button`,
  görünen 32 px disk; `inset-inline-end` ile RTL'de aynalanır). `aria-expanded`, `aria-controls` ve
  `aria-describedby` amaç öğesine (`order-card-purpose-<id>`) bağlı; `title` + `aria-label`
  "<Kart>: What is this card for?".
- **≤768 px**: metin kart başlığının **altında satır içi** (`renderCardTitle` → `.order-card-purpose.is-inline`).
  Ayrı `matchMedia("(max-width: 768px)")` (`cardInfoInline`); 640 px'lik `isNarrowLayout` tüm düzeni
  belirlediği için ona bağlanmadı.
- **>768 px**: "i"ye bağlı açılır balon (`.order-card-purpose.is-popover`, `role="dialog"`, panelle aynı
  `top: 42px; inset-inline-end: 0`).
- Aynı anda bir kart açık (`openCardInfoId`). **Escape** ve **dışarı tıklama** (`pointerdown`,
  `data-card-info` dışı) kapatır; odak açan "i"ye döner (`cardInfoButtonRefs`). "…" paneli ayrı
  durum, etkilenmedi; pan dışlama listesi `.order-card-menu-wrap`'i zaten kapsıyor.

## 3. Kart id'leri ve İngilizce amaç metni

| Kart id | Amaç |
|---|---|
| `preview` | The order's pictures. Add photos of the piece, the design or the reference the customer sent; the first one is the order's cover image. |
| `repairIntake` | Records the customer's own item that came in for repair: what it is, its condition and any marks. It is held for the customer, never counted as stock. |
| `estimate` | The quote for this order and the customer's answer. Send the estimate, see whether it was approved or declined, and keep the signed record. |
| `customerPortal` | The customer's own page for this order. Share the link so they can follow progress, see files and reply without an account. |
| `summary` | The headline facts of the order: what is being made, how many, the main choices and the reference number. Edit a value by clicking it. |
| `customer` | Who the order is for and how to reach them. Name, phone, e-mail and the customer's own notes, with shortcuts to call, message or open the customer. |
| `invoiceItems` | The lines that will appear on the invoice: each item, its quantity and price. Totals and tax are worked out from these lines. |
| `materials` | What this order needs in materials and parts, with a check for each. Items linked to inventory show their stock so nothing runs short mid-job. |
| `priority` | How urgent the order is and whether it is at risk. Set the priority, flag a risk and write the reason so the team sees it at a glance. |
| `delivery` | When the order was created and when it is due. Shows the delivery date, the days remaining and turns red once the order is late. |
| `notes` | Free-form notes about this order for the team. Add your own note sections for the things this workspace always writes down. |
| `clientFiles` | Files that belong to this order: designs, photos, documents and proofs. Upload, download and share them with the customer. |
| `todo` | The task list for this order. Add steps, tick them off, set due dates and assign them to team members; overdue tasks are flagged. |
| `workTime` | Time spent on this order. Start a timer or log hours by hand so labour can be costed and compared with the estimate. |
| `financial` | The money on this order: price, cost, payments received, refunds and what is still owed. Record payments and see the margin. |
| `status` | Where the order is in production. Tick the stages as the job moves along; the board and this card always show the same stage. |
| `shipping` | How the finished order gets to the customer. Choose the courier, save the tracking number and follow the parcel from here. |
| `schedule` | Reminders and alerts for this order. Set a date and time to be reminded about a fitting, a deadline or a follow-up. |
| `historyLog` | Everything that happened to this order, in time order: who changed what and when. Read-only; nothing here can be edited. |

## 4. "Getting started" yalnız sahibe

`lib/studioflow/homeCards.ts`: `canSeeGettingStarted(role)` — saf, dışa açık; yalnız `role === "owner"`
(kırpılmış, küçük harf). Erişim anahtarına bakmaz: her anahtarı verilmiş üye de görmez.
`HomeCardDefinition.ownerOnly` eklendi, `gettingStarted` kartı `ownerOnly: true`; `canSeeHomeCard`
bunu okur, dolayısıyla `visibleHomeCards` ve `availableHomeCards` (galeri) üyeye kartı vermez.
`app/home/page.tsx` kontrol listesi çağrısını da sahibe sınırlar; `app/dashboard/page.tsx`
`GettingStartedCard`'ı aynı yardımcıyla kapılar. Home'un geri kalanı değişmedi.
(`app/orders/page.tsx:1428`'deki "Getting started" yalnız boş-workspace eyebrow metni, kart değil; dokunulmadı.)

## 5. Doğrulama

- `npx tsc --noEmit` → rc=0
- `npm run build` → rc=0 (`NEXT_BUILD_EXIT {"code":0}`; `integrations.module.css` uyarısı tabanda da var)
- `node scripts/check-card-purposes.mjs` → `PASS 292 checks` (19 kart × 11 dil gerçek `studioT` + "i" etiketi ×11 + bağlantı + kapı: member/workflow/viewer/admin/custom/boş/null → false, owner/OWNER/"Owner " → true)
- Aynı betik `0e39d3d7` üzerinde → `FAIL 16/18` (amaç dosyası yok, "i" yok, kapı yok)
- `node scripts/check-menu-card-strings.mjs` → `PASS 17 checks`; `check-home-cards.mjs` → 159/159

**Yapılmayan:** izole ortamda ekran kabulü (telefon satır içi / masaüstü balon / RTL / odak dönüşü)
yapılmadı; yalnız derleme + betik. Native karşılıkları (iOS/Android/Mac) bu dalda yok.
