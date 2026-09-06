# NivaDesk ChatGPT / MCP — Yeni Sistem Uyum ve Genişletme Spesifikasyonu

**Belge amacı:** NivaDesk'in mevcut ChatGPT özelliklerini kaybetmeden yeni Commerce, Banking, Marketplace, Payments ve Accounting yapısına uyarlamak; Amazon ve eBay dahil yeni bağlı uygulamaların verilerini ChatGPT cevaplarına açmak; bir sonraki OpenAI app review başvurusunu tool davranışı ve annotations açısından doğru hazırlamak.

**Tarih:** 3 Eylül 2026  
**Durum:** Uygulama öncesi repository ve production MCP doğrulaması gerekli.

---

## 1. OpenAI'den gelen mevcut ret

NivaDesk v1.1.1 ikinci update başvurusu için gelen mesaj:

> Hello,  
> After careful review, NivaDesk (v1.1.1) was not approved. Please see the details below:  
> One or more of your tool's annotations do not appear to match the tool's behavior. Please confirm annotations are explicitly set to true or false (not null) for every tool. Include a clear justification for why the hint is set that way based on the tool’s actual behavior.  
> Please review our app guidelines as well as this help center article which includes more information about common rejection reasons. Once you’ve remediated the issues above, you may re-submit your app for review from the OpenAI Platform dashboard.  
> If you have questions or believe we have made an error in our review, reply directly to this email to initiate an appeal.  
> Best,  
> The OpenAI team

Bu ret yalnızca annotation objesinin bulunup bulunmaması olarak ele alınmamalıdır. OpenAI iki şeyi açıkça istemektedir:

1. Her published tool için bütün annotation hint'leri açıkça `true` veya `false` olmalıdır.
2. Bu değerlerin her biri tool'un gerçek runtime davranışıyla uyumlu ve gerekçelendirilebilir olmalıdır.

Hiçbir published tool'da annotation alanı `null`, `undefined` veya eksik bırakılmamalıdır.

---

# 2. Ana ürün kararı

Mevcut ChatGPT entegrasyonu silinip baştan yazılmayacaktır.

Yeni yapı:

```text
MEVCUT CHATGPT ÖZELLİKLERİ
        +
YENİ NIVADESK ENTEGRASYON VERİLERİ
        +
CROSS-CHANNEL OKUMA / ANALİZ
        +
GÜVENLİ ACTION / APPROVAL MODELİ
        +
OPENAI REVIEW UYUMLU MCP ANNOTATIONS
        =
NIVADESK CHATGPT V2
```

Yeni geliştirme **additive ve backward-compatible** olmalıdır.

Mevcut çalışan tool'lar yalnızca zorunlu teknik gerekçeyle değiştirilmelidir. Bir tool davranışı değiştirilecekse önce mevcut davranış için regression/parity testi yazılmalıdır.

---

# 3. ChatGPT'nin NivaDesk içindeki rolü

Hedef mimari:

```text
Shopify ─┐
Etsy ────┤
Woo ─────┤
Amazon ──┤
eBay ────┤
Faire ───┤
Square ──┘
         ↓
Integration Gateway
         ↓
Provider Adapters
         ↓
NivaDesk Commerce Core
         ↓
Canonical Orders / Customers / Products / Inventory / Finance
         ↓
Banking + Payments + Accounting Core
         ↓
AI Policy / Permission Layer
         ↓
NivaDesk MCP
         ↓
ChatGPT
```

Temel kural:

**ChatGPT provider API'lerine doğrudan bağlanmak yerine mümkün olduğunca NivaDesk'in normalize edilmiş/canonical verisi üzerinden çalışmalıdır.**

Bu sayede:

- aynı order iki kez oluşmaz,
- provider kimliği korunur,
- payout yeni revenue sayılmaz,
- bank hareketi gerçek para hareketi olarak ayrı kalır,
- permission modeli tek merkezde uygulanır,
- ChatGPT provider token'larına erişmez,
- birden çok satış kanalı tek cevapta karşılaştırılabilir.

---

# 4. Kaynakların rolü

## NivaDesk
Operasyonel source of truth ve karar katmanıdır.

## Commerce channels
Shopify, Etsy, WooCommerce, Amazon, eBay, Faire ve benzeri provider'lar dış order/listing kimliği ve platform durumunun kaynağıdır.

## Banking
Gerçek para hareketinin kaynağıdır.

## Marketplace payout / settlement
Provider ücret, refund, settlement ve payout detaylarının kaynağıdır.

## Pandle / Xero / QuickBooks
Seçilen muhasebe yapısına göre resmî bookkeeping/accounting sonucu için yetkili provider olabilir.

## ChatGPT
Permission-aware natural-language interface'tir.

ChatGPT:

- okur,
- açıklar,
- karşılaştırır,
- özetler,
- anormallik bulur,
- match önerir,
- izin verilen NivaDesk işlemlerini yapar,
- yüksek etkili veya dış provider'a yazan işlemleri güvenli proposal/approval akışına sokar.

ChatGPT muhasebe otoritesi veya banka otoritesi değildir.

---

# 5. Mevcut ChatGPT özellikleri korunacak

Yeni çalışma yapılırken aşağıdaki mevcut özellikler **regression-critical** kabul edilmelidir.

## Orders

Mevcut kabiliyetler:

- `create_order`
- `search_orders`
- `get_order_detail`
- `add_order_note`
- `update_order_status`
- `get_order_financials`
- `get_dashboard_summary`
- `get_extra_spending_overview`
- `get_financial_overview`

Manuel NivaDesk order'ları ile satış kanallarından gelen order'lar aynı genel sorgu katmanında bulunabilir, ancak `order_source`, provider connection ve external identity kesinlikle korunmalıdır.

## Personal Notes

Mevcut:

- `create_note`
- `search_notes`
- `get_note_detail`
- `append_note`
- `update_note`
- `pin_note`
- `archive_note`

fonksiyonları Commerce/Banking refactor sırasında bozulmamalıdır.

---

# 6. Banking — mevcut güçlü özellik kesinlikle korunmalı

NivaDesk ile ChatGPT arasındaki mevcut Banking ilişkisi yeni yapının merkezinde kalmalıdır.

Şu anda ChatGPT:

- bank spending summary okuyabilir,
- banka transaction'larını arayabilir,
- kullanıcı tarafından yüklenen invoice/receipt'i NivaDesk'e ekleyip uygun banka hareketiyle eşleştirebilir.

Mevcut Banking tool'ları:

- `get_bank_spending_summary`
- `search_bank_transactions`
- `attach_bank_receipt`

## 6.1 Invoice / receipt → bank transaction eşleştirme

Bu akış **MUST NOT REGRESS**.

Hedef davranış:

```text
Kullanıcı ChatGPT'ye invoice / receipt yükler
↓
NivaDesk merchant + amount + date + mevcut matching sinyallerini kullanır
↓
Bank transactions içinde adayları bulur
↓
Tek güçlü match varsa attach
↓
Birden fazla aday varsa kullanıcıya seçenekleri göster
↓
Kullanıcı seçince aynı yüklenmiş dosyayı tekrar istemeden doğru transaction'a attach et
```

Yeni MCP mimarisi bu çalışan akışı kaldırmamalı, daha zayıf generic bir file tool ile değiştirmemeli ve kullanıcıya dosyayı ikinci kez yükletmemelidir.

## 6.2 Güvenlik

- Tek güçlü aday yoksa yanlış auto-match yapılmamalı.
- Receipt birden fazla transaction'a sessizce bağlanmamalı.
- Banking permission server-side kontrol edilmeli.
- Duplicate retry davranışı test edilmeli.
- Match yalnız operational NivaDesk match ise accounting provider'daki formal reconciliation ile aynı şeymiş gibi gösterilmemeli.

---

# 7. Yeni bağlı uygulamalar ChatGPT'ye nasıl açılmalı?

Hedef:

```text
Provider
→ Adapter
→ Canonical NivaDesk model
→ NivaDesk MCP
→ ChatGPT
```

Provider başına ayrı bir ChatGPT mimarisi kurulmamalıdır.

Provider-specific alanlar kaybolmamalı; fakat UI ve AI iş mantığı doğrudan raw provider JSON'a bağımlı hale gelmemelidir.

Korunacak kimlik:

```text
provider
connection_id
entity_type
external_id
external_updated_at
```

---

# 8. Amazon ve eBay yeni sistemde dahil edilecek

Bu çalışma, Amazon ve eBay entegrasyonlarının yeni NivaDesk sistemine eklendiğini/eklenmekte olduğunu varsayar.

Ancak coding agent repository'deki gerçek durumu doğrulamadan provider'ı production-ready kabul etmemelidir.

`Roadmap / code exists / UI card exists` tek başına `Available` anlamına gelmez.

## Amazon için ChatGPT'nin okuyabileceği alanlar

Connector capability desteklediği ölçüde:

- orders,
- marketplace/account,
- line items,
- seller fulfilled / Amazon fulfilled ayrımı,
- fulfilment,
- shipment/tracking,
- inventory ve locations,
- FBA/external warehouse location,
- refunds,
- marketplace fees,
- fulfilment/storage/advertising fees mevcutsa,
- settlement/payout,
- bank settlement match,
- sync health.

Amazon settlement ile order sale aynı olay değildir.

ChatGPT şu soruya cevap verebilmelidir:

> "Bu banka girişi hangi Amazon settlement'ına ait olabilir?"

## eBay için ChatGPT'nin okuyabileceği alanlar

Connector capability desteklediği ölçüde:

- orders,
- marketplace/account,
- buyer data izin verilen ölçüde,
- listings/products/variations,
- order/payment/fulfilment status,
- returns/refunds,
- fees,
- payouts,
- inventory,
- shipment/tracking,
- sync health.

eBay order:

```text
order_source = ebay
```

olarak kalmalıdır. Shopify/Etsy/manual order kimliğine dönüştürülmemelidir.

---

# 9. ChatGPT artık cross-channel cevap verebilmeli

Yeni sistemin asıl değeri provider'ları ayrı ayrı göstermek değil, tek işletme resmi oluşturabilmektir.

Örnek sorular:

- "Bu ay toplam kaç sipariş aldım?"
- "Amazon, eBay, Etsy ve Shopify satışlarını karşılaştır."
- "Bu hafta en çok hangi kanaldan satış geldi?"
- "Marketplace fee sonrası en kârlı kanal hangisi?"
- "Gönderilmesi gereken bütün siparişleri göster."
- "Amazon'da shipped olup NivaDesk'te shipping bekleyen order var mı?"
- "eBay siparişlerinde teslim tarihi yaklaşanları göster."
- "Stoğu düşük ve birden fazla kanalda listelenen ürünleri bul."
- "Bu ürünün Amazon, Etsy ve Shopify stokları tutarlı mı?"
- "Bugün işletmemde ilgilenmem gereken en önemli şeyler neler?"
- "Bankada eşleşmemiş marketplace payout var mı?"
- "Bu faturayı doğru banka hareketine bağla."
- "Receipt'i eksik banka işlemlerini göster."
- "Pandle/Xero'ya hazır olmayan kayıtların sebebi ne?"
- "Bu müşterinin farklı kanallardaki sipariş geçmişini özetle."
- "Platform ücretleri bu ay kârımı ne kadar azalttı?"

---

# 10. Tool sayısını gereksiz çoğaltma

Mümkün olduğunda:

```text
get_shopify_orders
get_etsy_orders
get_amazon_orders
get_ebay_orders
...
```

şeklinde aynı fonksiyonun çok sayıda provider kopyası yerine ortak source-filtered tool kullanılmalıdır.

Örnek:

```text
search_commerce_orders(
  source = all|manual|shopify|etsy|woocommerce|amazon|ebay|faire|square,
  query,
  status,
  fromDate,
  toDate,
  paymentStatus,
  fulfillmentStatus,
  needsAttention,
  limit
)
```

Kural:

> **Ortak iş = ortak tool. Provider'a özel semantics = provider extension veya gerçekten gerektiğinde provider-specific tool.**

Bu, ChatGPT'nin doğru tool seçmesini kolaylaştırır ve OpenAI review yüzeyini gereksiz büyütmez.

---

# 11. Önerilen yeni read capabilities

Final isimler repository çakışma kontrolünden sonra kesinleşmelidir.

## `get_business_attention_summary`

Şu soruya cevap verir:

> "Bugün neye dikkat etmeliyim?"

Dönebilecek alanlar:

- overdue orders,
- delivery due soon,
- outstanding payments,
- design approval waiting,
- shipping waiting,
- stock risk,
- missing receipts,
- uncategorised transactions,
- unmatched payouts,
- accounting sync issues,
- provider reconnect/sync errors.

---

## `get_commerce_overview`

Parametre:

```json
{
  "source": "all",
  "fromDate": "2026-09-01",
  "toDate": "2026-09-30"
}
```

Dönebilir:

- orders,
- gross sales,
- refunds,
- discounts,
- known fees,
- shipping income,
- settlement/payout totals,
- channel breakdown,
- currencies,
- fulfilment breakdown.

Bank deposit + payout + order gross aynı revenue olarak üç kez sayılmamalıdır.

---

## `search_commerce_orders`

Cross-channel order search.

Sonuçta mutlaka ayrılmalı:

- NivaDesk order id,
- provider/source,
- external order id,
- connection/store,
- platform status,
- payment status,
- fulfilment status,
- NivaDesk workflow status,
- totals/currency,
- last sync/freshness.

---

## `get_channel_performance`

Karşılaştırılabilecek kanallar:

- Shopify
- Etsy
- WooCommerce
- Amazon
- eBay
- Faire
- Square
- Manual

Metrikler:

- order count,
- gross sales,
- AOV,
- refunds,
- known platform fees,
- known margin/profit yalnız veri yeterliyse,
- settlement/payout state,
- fulfilment state.

Eksik maliyet varsa kâr kesin sayıymış gibi verilmemeli.

---

## `get_inventory_overview`

ChatGPT şunları okuyabilmeli:

- low stock,
- reserved,
- available,
- incoming,
- channel allocation,
- sync mismatch,
- oversell risk,
- multi-channel listings,
- source-of-truth.

## `search_inventory_items`

Filtreler:

- name/SKU/reference,
- channel,
- status,
- low stock,
- reserved,
- location,
- mapping issue.

SKU tek başına cross-channel primary identity değildir.

---

## `get_payout_reconciliation_overview`

Amazon settlement, eBay payout, Faire payout, Shopify payout, Etsy finance, PayPal/Square payout gibi olayların bankaya bağlanma durumunu tek yerde özetler.

Örnek:

```json
{
  "matched": 21,
  "partial": 2,
  "unmatched": 4,
  "needsReview": 1
}
```

---

## `get_integration_health`

Şu soruya cevap verir:

> "Bağlantılarda sorun var mı?"

Her connection için:

- provider,
- account/store,
- auth status,
- orders freshness,
- inventory freshness,
- finance freshness,
- retries,
- DLQ/review count,
- last successful sync,
- reconnect required,
- read-only/limited/full mode.

---

## `get_accounting_sync_status`

Pandle/Xero/QuickBooks için:

- primary accounting writer,
- prepared,
- approved,
- queued,
- synced,
- failed,
- conflict,
- needs attention

durumlarını okuyabilir.

---

# 12. Banking capability genişlemesi

Mevcut üç Banking tool korunmalıdır.

Gerekirse ek read capability:

## `get_banking_attention_summary`

Dönebilir:

- uncategorised,
- missing receipt,
- possible duplicate,
- unusual charge,
- recurring price changed,
- possible cancelled subscription,
- possible transfer,
- unmatched payout,
- order/project link suggestion.

Bu sayede kullanıcı:

> "Banking tarafında ilgilenmem gereken ne var?"

diye sorabilir.

---

# 13. ChatGPT cevap standardı

Yeni cevaplar mümkün olduğunda:

1. doğrudan sonuç,
2. kaynak/channel kırılımı,
3. Banking/Finance durumu,
4. dikkat gerektirenler,
5. yapılabilecek sonraki aksiyon

şeklinde oluşturulabilmelidir.

Örnek:

```text
Bu ay 42 sipariş ve £28,420 brüt satış görünüyor.

Shopify: 16
Etsy: 9
Amazon: 7
eBay: 5
Faire: 3
Manuel: 2

£3,840 marketplace payout henüz bankayla tam eşleşmemiş.
4 sipariş önümüzdeki 7 gün içinde teslim edilmeli.
3 banka işleminde receipt eksik.
Amazon finance sync 6 saat geriden geliyor.
```

Bütün rakamlar tool verisinden gelmelidir.

---

# 14. Freshness ve eksik veri açıkça belirtilmeli

Tool response'larında mümkün olduğunca:

```json
{
  "freshness": {
    "ordersLastSync": "...",
    "inventoryLastSync": "...",
    "financeLastSync": "..."
  },
  "partial": false,
  "warnings": []
}
```

bulunmalıdır.

ChatGPT stale veriyi canlıymış gibi sunmamalıdır.

Örnek:

> "Amazon finance sync 8 saat geride olduğu için bugünkü payout toplamı eksik olabilir."

---

# 15. Mevcut public MCP inventory

Yeni geliştirme başlamadan production `tools/list` ile doğrulanmalıdır.

Şu anda görünen mevcut tool seti:

### Orders
- `create_order`
- `search_orders`
- `get_order_detail`
- `add_order_note`
- `update_order_status`

### Notes
- `create_note`
- `search_notes`
- `get_note_detail`
- `append_note`
- `update_note`
- `pin_note`
- `archive_note`

### Finance / Dashboard
- `get_order_financials`
- `get_dashboard_summary`
- `get_extra_spending_overview`
- `get_financial_overview`

### Banking
- `get_bank_spending_summary`
- `search_bank_transactions`
- `attach_bank_receipt`

**Mevcut görünen toplam: 19 tool.**

Bu liste repository veya production runtime farklıysa runtime davranışı source of truth olmalıdır.

---

# 16. OpenAI review için annotation standardı

Her tool'da aşağıdaki dört hint açık boolean olmalıdır:

```json
{
  "annotations": {
    "readOnlyHint": true,
    "destructiveHint": false,
    "idempotentHint": true,
    "openWorldHint": false
  }
}
```

Hiçbiri:

- `null`,
- `undefined`,
- missing

olamaz.

## `readOnlyHint`

Persistent state değiştirmeyen tool → `true`.

## `destructiveHint`

Mevcut veriyi silen, replace eden veya destructive state change yapan tool için gerçek davranışa göre belirlenmeli.

## `idempotentHint`

Aynı input tekrar çalışınca yeni side effect yaratmıyorsa `true`.

Örnek: create işlemleri genellikle `false`; aynı `pin=true` çağrısı gerçek no-op ise `true` olabilir.

## `openWorldHint`

Tool NivaDesk'in kapalı workspace domain'i dışındaki sisteme doğrudan etki ediyor veya canlı external provider ile etkileşime giriyorsa gerçek davranışa göre belirlenmelidir.

Önemli ayrım:

```text
ChatGPT → NivaDesk internal proposal
```

ile:

```text
ChatGPT → external provider mutation
```

aynı annotation davranışı değildir.

---

# 17. Mevcut tool'lar için başlangıç annotation tablosu

**Final değerler gerçek backend behavior testinden sonra kesinleştirilecektir. `verify` submission'da kalamaz.**

| Tool | readOnly | destructive | idempotent | openWorld |
|---|---:|---:|---:|---:|
| `search_orders` | true | false | true | false |
| `get_order_detail` | true | false | true | false |
| `get_order_financials` | true | false | true | false |
| `get_dashboard_summary` | true | false | true | false |
| `get_extra_spending_overview` | true | false | true | false |
| `get_financial_overview` | true | false | true | false |
| `search_notes` | true | false | true | false |
| `get_note_detail` | true | false | true | false |
| `get_bank_spending_summary` | true | false | true | verify |
| `search_bank_transactions` | true | false | true | verify |
| `create_order` | false | false | false | false |
| `add_order_note` | false | false | false | false |
| `create_note` | false | false | false | false |
| `append_note` | false | false | false | false |
| `update_order_status` | false | verify | verify | false |
| `update_note` | false | verify | verify | false |
| `pin_note` | false | verify | verify | false |
| `archive_note` | false | verify | verify | false |
| `attach_bank_receipt` | false | false | verify | false |

`verify` olan her alan kod + behavior test sonucunda kesin `true`/`false` yapılmalıdır.

---

# 18. Her annotation için justification yazılmalı

Örnek `search_orders`:

```text
readOnlyHint: true
Because the tool only queries existing orders and does not modify workspace state.

destructiveHint: false
Because it does not delete, replace, archive or mutate a record.

idempotentHint: true
Because repeating the same query creates no additional side effect.

openWorldHint: false
Because it reads NivaDesk workspace data and does not directly mutate an external provider.
```

Örnek `create_order`:

```text
readOnlyHint: false
Because the tool creates a persistent order.

destructiveHint: false
Because it adds a new record without removing an existing order.

idempotentHint: false
Because repeating the same request can create another order unless explicit request-level deduplication prevents it.

openWorldHint: false
Because the write is limited to the authenticated NivaDesk workspace.
```

---

# 19. Annotation CI validation zorunlu

Her published tool için:

```text
annotations exists
readOnlyHint is boolean
destructiveHint is boolean
idempotentHint is boolean
openWorldHint is boolean
justification exists
```

kontrol edilmelidir.

Bir alan boolean değilse release fail olmalıdır.

---

# 20. Production `tools/list` mutlaka test edilmeli

Source code'da doğru görünmesi yeterli değildir.

Review öncesi gerçek deployed MCP endpoint'inden tool listesi alınmalı ve her tool'un gerçek response'unda annotation'lar kontrol edilmelidir.

Kontrol:

- null yok,
- missing yok,
- internal/test tools public değil,
- deprecated duplicate yok,
- description gerçek davranışı anlatıyor,
- input schema gerçek backend ile uyumlu,
- annotations gerçek behavior testleriyle uyumlu.

---

# 21. Tool description'ları güçlendirilmeli

Örneğin cross-channel order search description:

```text
Search normalized orders in the authenticated NivaDesk workspace across manual and supported connected sales channels such as Shopify, Etsy, WooCommerce, Amazon, eBay and Faire. Returns provider/payment/fulfilment state separately from NivaDesk workflow state. This tool does not modify an external provider.
```

Description:

- ne yapar,
- ne zaman kullanılır,
- read/write sınırı,
- provider/workspace sınırı

konularını açıkça söylemelidir.

---

# 22. Secrets asla ChatGPT'ye açılmamalı

Model response veya tool args/result içinde:

- Amazon token,
- eBay token,
- Shopify secret,
- Etsy token,
- Xero token,
- Pandle secret,
- QuickBooks token,
- Open Banking credential

olmamalıdır.

Credential resolution server-side yapılmalıdır.

ChatGPT logical id'lerle çalışmalıdır:

- order id,
- transaction id,
- connection id,
- proposal id.

---

# 23. Cross-tenant güvenlik

Her tool server-side:

- authenticated user,
- workspace,
- role,
- Banking permission,
- Financial permission,
- Accounting permission,
- provider capability

kontrol etmelidir.

Model tarafından gönderilen `companyId` tek başına authorization kaynağı olamaz.

---

# 24. Read / Prepare / Approve / Execute ayrımı

Yeni güçlü action modelinde:

```text
READ
PREPARE
APPROVE
EXECUTE
```

ayrılmalıdır.

Örneğin external eBay/Amazon/Accounting write:

```text
ChatGPT request
↓
read current state
↓
create proposal
↓
show impact
↓
explicit approval
↓
revalidate current state
↓
permission check
↓
idempotency
↓
outbox/queue
↓
provider adapter
↓
verify
↓
audit
```

Doğrudan provider write yalnız gerçekten tasarlanmış ve review edilmiş action path üzerinden yapılmalıdır.

---

# 25. `queued` ile `completed` karıştırılmamalı

Write response state'leri mümkün olduğunca structured olmalı:

```text
prepared
awaiting_approval
approved
queued
executing
completed
failed
invalidated
needs_attention
```

Eğer işlem yalnız `queued` ise ChatGPT "tamamlandı" dememelidir.

---

# 26. Finance double-counting engellenmeli

Bunlar ayrı olaylardır:

```text
order sale
payment
fee
refund
payout/settlement
bank deposit
accounting posting
```

ChatGPT bunları tek gelirin tekrarları olarak doğru ilişkilendirmelidir.

Payout veya bank deposit ikinci revenue değildir.

---

# 27. Cross-channel identity güvenliği

Aşağıdakiler yalnız isim/email/SKU benzerliğine göre otomatik birleştirilmemelidir:

- customer,
- product,
- order,
- payout,
- refund,
- bank transaction.

Primary external identity:

```text
provider + connection_id + entity_type + external_id
```

mantığı korunmalıdır.

---

# 28. Banking + Commerce + Accounting birlikte cevaplanabilmeli

Örnek:

> "Amazon'da paid olup bankada settlement'ı görünmeyen kayıt var mı?"

```text
Commerce
→ Amazon financial entries
→ settlement
→ Banking match
→ exceptions
```

Örnek:

> "Bu Cousins UK faturası hangi siparişin maliyeti?"

```text
Uploaded invoice
→ bank transaction match
→ order/project matching
→ profitability
```

Örnek:

> "Pandle'a hazır ama receipt'i eksik işlemler var mı?"

```text
Banking
→ receipt state
→ category/VAT state
→ accounting readiness
```

---

# 29. Regression testleri

## Banking receipt match

### Tek confident match
Invoice yükle → tek doğru transaction → attach → UI doğrula.

### Birden fazla aday
Yanlış auto-attach yapma → candidates döndür → kullanıcı seçimi → aynı upload continuation ile attach.

### No match
Dosyayı kaybetme → Needs Attention/inbox state.

### Duplicate retry
Aynı request tekrarında duplicate attachment oluşup oluşmadığını test et. Sonuç `idempotentHint` kararını belirlesin.

### Permission
Banking yetkisi olmayan kullanıcı attach yapamasın.

## Orders / Notes

- order search parity,
- order create parity,
- order note parity,
- status update parity,
- Notes create/search/update/pin/archive parity,
- finance permission parity.

## Amazon/eBay

- aynı external event 10 kez → tek order,
- source identity korunuyor,
- customer isimle auto-merge olmuyor,
- inventory loop yok,
- payout yeni revenue değil,
- duplicate bank match yok.

---

# 30. Review öncesi tool catalog freeze

Yeni başvuru yapılmadan önce MCP catalog bir release snapshot olarak dondurulmalıdır:

- tool names,
- descriptions,
- schemas,
- annotations,
- justifications,
- permissions,
- deployed endpoint/version.

Review'a gönderildikten hemen sonra tool davranışlarını yeniden değiştirmekten kaçınılmalıdır.

---

# 31. Final OpenAI re-submission checklist

## Mevcut özellikler
- [ ] Mevcut 19 tool production'da doğrulandı.
- [ ] `attach_bank_receipt` parity testleri geçti.
- [ ] Banking search/summary çalışıyor.
- [ ] Orders regression geçti.
- [ ] Notes regression geçti.
- [ ] Finance permissions regression geçti.

## Yeni sistem
- [ ] Amazon normalized read data ChatGPT'ye açıldı.
- [ ] eBay normalized read data ChatGPT'ye açıldı.
- [ ] Shopify/Etsy/Woo regression geçti.
- [ ] Faire/Square/PayPal durumları gerçek capability ile uyumlu.
- [ ] Cross-channel commerce overview çalışıyor.
- [ ] Inventory cevapları source-of-truth/freshness taşıyor.
- [ ] Payout ↔ Bank match double-count yapmıyor.
- [ ] Integration health gerçek sync durumunu gösteriyor.
- [ ] Accounting sync status provider authority ayrımını koruyor.

## Güvenlik
- [ ] Secrets MCP response'larına çıkmıyor.
- [ ] Workspace server-side resolve ediliyor.
- [ ] Cross-tenant testleri geçti.
- [ ] Banking/financial permissions geçti.
- [ ] External write proposal/approval/revalidation kullanıyor.

## OpenAI annotations
- [ ] Her published tool'da `annotations` var.
- [ ] `readOnlyHint` boolean.
- [ ] `destructiveHint` boolean.
- [ ] `idempotentHint` boolean.
- [ ] `openWorldHint` boolean.
- [ ] Hiçbir hint null değil.
- [ ] Hiçbir hint missing değil.
- [ ] Her hint için behavior-based justification var.
- [ ] Production `tools/list` snapshot kontrol edildi.
- [ ] Description gerçek davranışla eşleşiyor.
- [ ] Internal/test tools public değil.

---

# 32. Coding AI için doğrudan uygulama talimatı

```text
Bu dosyayı NivaDesk ChatGPT/MCP genişletmesi için normatif şartname olarak kullan.

ÖNCE KOD DEĞİŞTİRME.

1. Repository'deki MCP tool registry'yi ve gerçek published tool setini bul.
2. Production-equivalent tools/list çıktısıyla karşılaştır.
3. Mevcut 19 tool'un gerçek code path'lerini doğrula.
4. Özellikle attach_bank_receipt invoice/receipt -> bank transaction matching akışını trace et ve regression-critical işaretle.
5. OpenAI v1.1.1 rejection mesajını release blocker kabul et.
6. Her published tool için readOnlyHint, destructiveHint, idempotentHint, openWorldHint değerlerini gerçek behavior testinden çıkar.
7. Hiçbir hint null/missing olmasın.
8. Her hint için kısa justification üret.
9. Annotation CI validator ekle.
10. Mevcut Orders, Notes ve Banking özelliklerini parity testleri olmadan değiştirme.
11. NivaDesk Commerce Core canonical identity/finance/inventory kurallarını koru.
12. Amazon ve eBay'in repository'deki gerçek implementation/capability durumunu doğrula; roadmap/UI var diye active kabul etme.
13. ChatGPT'nin yeni provider verilerini mümkün olduğunca NivaDesk canonical read modelinden okumasını sağla.
14. Provider başına gereksiz duplicate tool üretme; source-filtered ortak read tools tercih et.
15. Provider token/secrets'i ChatGPT'ye açma.
16. Payout/bank deposit'i yeni revenue sayma.
17. SKU/email/name'i tek cross-channel identity kabul etme.
18. Sensitive/external write için proposal -> approval -> revalidation -> outbox/queue -> provider adapter -> verification kullan.
19. queued sonucu completed olarak raporlama.
20. Yeni tool'ların tamamını aynı annotation ve permission standardına dahil et.

Kod değişikliğine başlamadan:
- current-state report,
- target tool catalog,
- annotation matrix,
- regression risks,
- proposed implementation phases
üret.

Tamamlandığında:
- production tools/list snapshot,
- final all-boolean annotation matrix,
- per-hint justifications,
- regression results,
- permission/security results,
- OpenAI re-submission checklist
üret.
```

---

# 33. Kesinlikle yapılmaması gerekenler

1. Çalışan `attach_bank_receipt` özelliğini yeni finance refactor yüzünden kaybetmek.
2. ChatGPT'yi Amazon/eBay/accounting provider token'larıyla doğrudan çalıştırmak.
3. Aynı read işi için provider başına onlarca duplicate tool yaratmak.
4. Amazon/eBay order source kimliğini kaybetmek.
5. Payout veya bank deposit'i ikinci revenue saymak.
6. Platform status ile NivaDesk workflow status'ı aynı alan yapmak.
7. Annotation değerlerini tool adına bakarak tahmin etmek.
8. `null` veya missing annotation bırakmak.
9. Sadece source code kontrol edip deployed `tools/list` kontrol etmemek.
10. Idempotency behavior test edilmeden `idempotentHint: true` vermek.
11. Queued external action'a "completed" demek.
12. User/permission kontrolü olmadan external write yapmak.
13. Muhasebeci/provider değişikliklerini kör overwrite etmek.
14. Stale provider verisini güncelmiş gibi sunmak.
15. Roadmap'teki entegrasyonu runtime readiness testleri geçmeden "Available" göstermek.
16. Cross-workspace authorization için modelden gelen company/workspace id'ye güvenmek.
17. Raw provider JSON'u kalıcı AI business contract yapmak.

---

# 34. Son hedef

Bu çalışma tamamlandığında ChatGPT yalnız:

> "John'un siparişini bul."

gibi basit sorulara cevap vermemelidir.

Aynı zamanda:

> "Bugün işletmemde neye dikkat etmeliyim?"

> "Amazon, eBay, Etsy ve Shopify arasında bu ay en iyi performans hangi kanalda?"

> "Bankada eşleşmemiş marketplace payout var mı?"

> "Bu faturayı doğru banka hareketine bağla."

> "Receipt'i eksik giderleri göster."

> "Teslim tarihi yaklaşan ve stok riski olan siparişleri bul."

> "Pandle/Xero'ya hazır olmayan işlemlerin sebebini açıkla."

> "Bu müşterinin bütün kanallardaki sipariş geçmişini özetle."

gibi işletmenin tamamını kapsayan sorulara cevap verebilmelidir.

**NivaDesk bütün operasyonel ve finansal kaynakları bir araya getirir; ChatGPT ise bu birleşik veriyi güvenli, izinli ve doğal dilde kullanılabilir hale getirir.**

En kritik ürün kuralı:

> **Yeni özellik eklemek, çalışan eski özelliği kaybetmek anlamına gelmemelidir.**

En kritik OpenAI review kuralı:

> **Her MCP tool ne yapıyorsa annotations tam olarak onu söylemeli; bütün hint'ler açık boolean olmalı ve gerçek davranışla gerekçelendirilmelidir.**

---

# 35. 5 Eylül 2026 genişletmesi — Agentic Orchestration / Symphony benchmark

**Bu bölüm normatif bir genişletmedir.** Önceki 1–34. bölümleri kaldırmaz; özellikle mevcut ChatGPT/MCP, Banking receipt matching, canonical Commerce, permission, annotation ve OpenAI review kurallarını aynen korur.

Bu genişletmenin amacı NivaDesk'i yalnızca kullanıcının soru sorduğu bir ChatGPT arayüzünden çıkarıp, işletmenin birleşik verisini sürekli değerlendirebilen, uzman görev alanlarına iş dağıtabilen ve güvenli sınırlar içinde aksiyon hazırlayabilen bir **AI business operating layer** haline getirmektir.

Dış benchmark olarak Wix Symphony incelenmiştir. Symphony'nin ürün yaklaşımında öne çıkan fikirler şunlardır:

- tek bir ana orchestrator üzerinden kullanıcıyla konuşma,
- uzman AI agent'lara görev dağıtımı,
- mevcut business tool'larına / connector'lara bağlanma,
- kullanıcı sormadan ihtiyaç ve fırsatları proaktif olarak yüzeye çıkarma,
- önemli işlemlerde approval isteme,
- günlük business briefing / morning meeting yaklaşımı,
- agent çıktısını kullanıcıya göstermeden önce ayrı quality-review katmanından geçirme,
- agent işlerini usage/action bazında ölçme,
- farklı agent'lar için farklı model/compute seçebilme.

**NivaDesk bu modeli kopyalamamalıdır.** NivaDesk'in avantajı farklı SaaS'ların üstüne oturan generic bir agent layer olmak değil; Orders, Customers, Projects, Inventory, Banking, Payments, Commerce, Shipping ve Accounting ilişkilerinin kendi canonical modelinde tutulduğu operasyonel source of truth olmasıdır.

Dolayısıyla hedef:

```text
SYMPHONY'DEN ALINAN AGENTIC ORCHESTRATION FİKRİ
        +
NIVADESK CANONICAL BUSINESS DATA
        +
MEVCUT CHATGPT / MCP CAPABILITIES
        +
BANKING / COMMERCE / ACCOUNTING CROSS-DOMAIN CONTEXT
        +
PERMISSION + APPROVAL + AUDIT
        =
NIVADESK AGENTIC BUSINESS OS
```

---

# 36. Yeni ana ürün kararı

NivaDesk'in AI deneyimi yalnızca:

```text
User asks → ChatGPT calls tool → answer
```

modelinde kalmamalıdır.

Yeni hedef üç giriş yolunu aynı intelligence katmanında birleştirmektir:

```text
A) USER-INITIATED
User → NivaDesk UI / ChatGPT → Orchestrator

B) EVENT-DRIVEN
Order / payment / bank / inventory / shipping / integration event
→ Attention Engine
→ Orchestrator

C) SCHEDULED
Daily / weekly / deadline-based job
→ Attention Engine
→ Orchestrator
```

Bunların tamamı aynı permission, canonical data, proposal/approval ve audit kurallarını kullanmalıdır.

**Business-critical autonomy sadece ChatGPT client içinde yaşamamalıdır.** Orchestration ve policy NivaDesk server-side olmalıdır. Böylece aynı güvenli davranış bugün ChatGPT'de, yarın NivaDesk native app'te veya izin verilen başka kanallarda tekrar kullanılabilir.

---

# 37. Hedef mimari — NivaDesk AI Orchestrator

```text
                    ┌─────────────────────┐
                    │   NivaDesk Native   │
                    └──────────┬──────────┘
                               │
┌──────────────┐               │              ┌──────────────┐
│   ChatGPT    │──── MCP ──────┼──────────────│ Future Channels│
└──────────────┘               │              └──────────────┘
                               ↓
                    ┌─────────────────────┐
                    │ NivaDesk AI Gateway │
                    └──────────┬──────────┘
                               ↓
                    ┌─────────────────────┐
                    │   AI Orchestrator   │
                    └──────────┬──────────┘
                               ↓
             ┌─────────────────┼──────────────────┐
             ↓                 ↓                  ↓
     Specialist Skills   Attention Engine   Quality / Policy Review
             ↓                 ↓                  ↓
                    AI Permission Layer
                               ↓
                Canonical NivaDesk Domain APIs
                               ↓
 Orders / Customers / Projects / Commerce / Inventory
 Banking / Payments / Shipping / Accounting / Integrations
                               ↓
           Provider Adapters / Queues / External APIs
```

Buradaki **specialist agent** kavramı mutlaka ayrı process veya ayrı LLM anlamına gelmez.

İlk sürümde agent'lar:

- role-specific system policy,
- izin verilen tool seti,
- domain context,
- output schema,
- escalation kuralları

ile tanımlanmış **logical specialists** olabilir.

Gerçek multi-agent parallel execution yalnız ölçülmüş fayda varsa eklenmelidir.

---

# 38. AI Orchestrator'ın sorumlulukları

Orchestrator:

1. Kullanıcının amacını anlamalı.
2. İlgili NivaDesk domain'lerini belirlemeli.
3. Tek domain ise doğru specialist capability'ye yönlendirmeli.
4. Cross-domain soru ise görevleri parçalamalı.
5. Aynı gerçeği farklı kaynaklardan double-count etmemeli.
6. Freshness / partial-data durumunu hesaba katmalı.
7. Permission sınırlarını tool çağrısından önce kontrol etmeli.
8. Read-only sonuç ile proposed action'ı ayırmalı.
9. Gerekliyse birden fazla specialist sonucunu tek business answer'da birleştirmeli.
10. Önemli action için approval istemeli.
11. `queued`, `executing`, `completed` durumlarını doğru raporlamalı.
12. Kullanıcıya tool isimleri veya iç teknik karmaşıklık göstermeden sonuç odaklı cevap vermeli.

Örnek:

> "Bu hafta ilgilenmem gereken şeyleri bul ve hazırlayabildiklerini hazırla."

Orchestrator bunu aşağıdaki gibi bölebilir:

```text
Orders Agent → overdue / due soon
Finance Agent → unpaid / unmatched / missing receipts
Inventory Agent → stock risk
Shipping Agent → shipment exceptions
Customer Agent → unanswered / follow-up candidates
Integration Agent → sync/reconnect errors
        ↓
Quality + Policy Review
        ↓
Unified Attention Summary
        ↓
Safe proposals prepared
        ↓
User approval where required
```

---

# 39. Uzman agent / skill alanları

## 39.1 Orders & Operations Agent

Sorumluluk:

- overdue projects/orders,
- due soon,
- workflow bottlenecks,
- estimate approval waiting,
- deposit/payment dependency,
- production state,
- completion dependency,
- project/order notes,
- linked inventory/parts risk.

Örnek:

> "Deposit'i alınmış ama production başlamamış işleri bul."

---

## 39.2 Customer & Communication Agent

Sorumluluk:

- customer history,
- unanswered conversations verisi NivaDesk'e bağlıysa detection,
- follow-up candidates,
- inactive customer patterns,
- order-linked communication context,
- prepared drafts.

Kural:

**Mesaj hazırlamak ile mesaj göndermek aynı action değildir.**

Draft üretimi read/prepare olarak yapılabilir. External send işlemi ilgili connector ve permission modeline göre approval gerektirmelidir.

---

## 39.3 Finance & Banking Agent

Sorumluluk:

- bank transaction analysis,
- receipt/invoice matching,
- missing receipts,
- uncategorised spend,
- unusual/duplicate candidates,
- recurring spend changes,
- payout ↔ bank reconciliation,
- project/order cost suggestions,
- cash attention.

Mevcut `attach_bank_receipt` davranışı regression-critical olmaya devam eder.

---

## 39.4 Inventory Agent

Sorumluluk:

- low stock,
- available/reserved/incoming,
- oversell risk,
- location allocation,
- linked order demand,
- multi-channel mismatch,
- reorder suggestion,
- cost visibility.

Reorder **önerisi** ile supplier'a gerçek purchase order / payment göndermek ayrılmalıdır.

---

## 39.5 Commerce Agent

Sorumluluk:

- Shopify,
- Etsy,
- WooCommerce,
- Amazon,
- eBay,
- Faire,
- Square,
- diğer desteklenen channel'lar

üzerindeki canonical commerce görünümünü kullanmak.

Görevler:

- sales/channel comparison,
- refunds,
- fees,
- fulfilment discrepancies,
- listing/inventory mismatch,
- marketplace settlement context,
- cross-channel customer/order history.

Provider-specific truth korunmalıdır.

---

## 39.6 Shipping Agent

Sorumluluk:

- ready-to-ship,
- tracking,
- delayed shipment,
- delivery due soon,
- missing tracking,
- fulfilment mismatch,
- export/shipping evidence,
- courier exception.

Shipment satın alma, label oluşturma veya provider'a write yapma varsa approval/action policy uygulanmalıdır.

---

## 39.7 Accounting Agent

Sorumluluk:

- Pandle / Xero / QuickBooks readiness,
- category/VAT readiness,
- missing receipt blockers,
- sync conflicts,
- prepared/approved/queued/synced status,
- accounting provider authority ayrımı.

ChatGPT veya NivaDesk AI formal accountant gibi davranmamalıdır.

---

## 39.8 Integration Health Agent

Sorumluluk:

- expired/revoked auth,
- stale sync,
- webhook failure,
- retry backlog,
- DLQ/review count,
- provider degradation,
- partial capability,
- reconnect required.

---

## 39.9 Growth / Insight Agent — opsiyonel ve ikinci faz

Operational foundation oturduktan sonra:

- repeat customers,
- channel growth,
- margin opportunity,
- dormant leads,
- conversion bottlenecks,
- seasonality,
- product/service demand patterns

gibi insight'lar üretebilir.

**Bu agent operasyonel doğruluğun önüne geçirilmemelidir.**

---

## 39.10 Quality & Policy Reviewer

Bu rol kullanıcı adına iş yapan domain agent'lardan ayrılmalıdır.

Görev:

- sonuçta unsupported claim var mı,
- stale/partial data doğru belirtilmiş mi,
- financial double-count yapılmış mı,
- source/provider identity kaybolmuş mu,
- permission ihlali var mı,
- action approval gerektiriyor mu,
- `queued` yanlışlıkla `completed` denmiş mi,
- external write kapsamı doğru mu,
- kullanıcıya gösterilecek proposal ile gerçek execution aynı şeymiş gibi sunulmuş mu

kontrol etmektir.

High-impact external action'larda reviewer bypass edilmemelidir.

---

# 40. Proactive Attention Engine

Mevcut `get_business_attention_summary` yalnız user-requested read capability olarak kalmamalıdır.

Aynı business rules ayrıca server-side **Attention Engine** tarafından çalıştırılabilmelidir.

Attention Engine iki katmandan oluşmalıdır:

```text
DETERMINISTIC SIGNALS
rules / due dates / statuses / thresholds / sync errors
        +
AI INTERPRETATION
priority / grouping / explanation / suggested next step
```

AI tek başına "önemli" olay yaratmamalıdır. Mümkün olan yerde önce deterministic fact üretilmeli, AI bunu yorumlamalıdır.

Örnek attention signals:

- teslim tarihi 72 saat içinde,
- order payment overdue,
- design approval 5+ gündür bekliyor,
- ready-to-ship ama tracking yok,
- low stock + açık order demand,
- receipt missing,
- marketplace payout unmatched,
- accounting sync failed,
- provider sync stale,
- refund/provider status ile NivaDesk state çelişiyor,
- customer follow-up SLA aşıldı.

Her attention item mümkün olduğunca şu yapıyı taşımalıdır:

```json
{
  "attentionId": "...",
  "type": "shipping_due",
  "severity": "high",
  "title": "...",
  "reason": "...",
  "entityRefs": [],
  "facts": [],
  "freshness": {},
  "suggestedActions": [],
  "requiresApproval": false,
  "createdAt": "...",
  "resolvedAt": null
}
```

---

# 41. Daily Business Briefing / Morning Meeting

NivaDesk kullanıcısı her sabah soru sormak zorunda kalmamalıdır.

Opsiyonel daily briefing:

```text
Good morning.
8 things need your attention today.
3 have safe drafts prepared.
2 require your approval.
3 are informational.
```

Briefing içeriği:

1. Dün tamamlanan önemli işler.
2. Bugün deadline olanlar.
3. Gecikenler.
4. Payment/banking exceptions.
5. Stock/shipping risk.
6. Customer follow-up candidates.
7. Integration/accounting health.
8. Hazırlanmış fakat approval bekleyen actions.
9. Gerçekten anlamlıysa opportunity/insight.

Briefing her workspace için configurable olmalıdır.

Kullanıcı kapatabilmeli veya frequency değiştirebilmelidir.

---

# 42. Trigger modeli

Agentic davranış yalnız scheduled polling'e bağlı kalmamalıdır.

Desteklenebilecek trigger tipleri:

```text
DOMAIN EVENT
- order created
- order status changed
- payment received
- refund created
- bank transaction imported
- receipt attached
- stock changed
- shipment event
- provider sync failure

TIME / SLA
- due in N hours/days
- overdue by N hours/days
- every morning
- weekly review

STATE COMBINATION
- paid + not started
- ready_to_ship + no tracking
- low_stock + active orders
- payout_received + bank_unmatched
- accounting_prepared + missing_receipt
```

Trigger doğrudan high-impact external write yapmamalıdır.

Default pattern:

```text
Trigger
→ detect
→ prepare
→ notify
→ approval if needed
→ execute
```

---

# 43. Agent action güvenlik sınıfları

Her agent capability aşağıdaki action class'lardan birine atanmalıdır.

## Class A — Read / Explain

Örnek:

- search,
- summarize,
- compare,
- detect attention,
- explain variance.

Genelde approval gerekmez.

## Class B — Internal low-risk prepare/write

Örnek:

- internal draft,
- suggested category,
- proposed match,
- internal task/proposal,
- note hazırlama.

Gerçek persistent write varsa mevcut MCP annotation davranışı doğru işaretlenmelidir.

## Class C — Internal consequential write

Örnek:

- order status değiştirme,
- financial mapping,
- inventory adjustment,
- archive/replace gibi anlamlı state değişimi.

Permission + impact preview + gerekli durumda approval.

## Class D — External communication/write

Örnek:

- customer email/message gönderme,
- marketplace listing değiştirme,
- shipment satın alma,
- accounting provider'a write,
- provider order mutation.

Default olarak explicit approval + revalidation.

## Class E — Financial / destructive / irreversible

Örnek:

- payment/refund initiation desteklenirse,
- irreversible delete,
- high-impact bulk update.

En sıkı policy; mümkünse ChatGPT public app scope'undan ayrı tutulmalıdır.

---

# 44. Proposal / Approval UX

Approval yalnız "Are you sure?" butonu olmamalıdır.

Kullanıcı approval öncesi şunları görmelidir:

- ne yapılacak,
- hangi record/provider etkilenecek,
- mevcut state,
- hedef state,
- neden önerildi,
- geri alınabilir mi,
- external side effect var mı,
- kaç entity etkilenecek,
- stale data riski var mı.

Örnek:

```text
Prepared action

Send follow-up to 4 customers whose design approval has been waiting 7+ days.

4 drafts ready.
No messages have been sent yet.

[Review drafts] [Approve & send] [Dismiss]
```

Bulk action approval'ında entity count ve scope açıkça gösterilmelidir.

---

# 45. Agent task lifecycle

Agent work kendi state machine'ine sahip olmalıdır:

```text
created
planning
reading
prepared
awaiting_approval
approved
queued
executing
verifying
completed
partially_completed
failed
invalidated
cancelled
needs_attention
```

Her task:

```text
task_id
workspace_id
initiator
trigger
agent_role
input refs
plan summary
permissions checked
proposals
approvals
execution attempts
provider results
verification
final outcome
cost/usage metadata
audit timestamps
```

saklayabilmelidir.

---

# 46. Native AI ana ekran deneyimi

NivaDesk'in AI deneyimi yalnız boş bir chat kutusu olmamalıdır.

Önerilen başlangıç yüzeyi:

```text
TODAY

8 things need your attention

High priority
- 2 orders due this week with stock risk
- 1 Amazon payout unmatched in Banking
- eBay sync needs reconnect

Prepared for you
- 3 customer follow-up drafts
- 2 receipt matches ready for review

Completed
- 6 routine checks completed

Ask NivaDesk anything...
```

Bu ekran deterministic dashboard verisini AI açıklamasıyla birleştirmelidir.

Kullanıcı her item'a tıklayıp gerçek source record'a gidebilmelidir.

AI hiçbir zaman underlying UI/data'nın yerine doğrulanamaz kapalı bir kutu olmamalıdır.

---

# 47. ChatGPT deneyimi nasıl genişlemeli?

ChatGPT connector mevcut capability'leri kaybetmeden aşağıdaki davranışları desteklemelidir.

Örnek:

> "Bugün işletmemde neye dikkat etmeliyim?"

NivaDesk MCP:

- attention summary,
- relevant entity details,
- freshness,
- allowed next actions

döndürür.

ChatGPT:

- önceliklendirir,
- açıklar,
- kullanıcı isterse proposal hazırlatır.

Örnek:

> "Bunlardan yapabileceklerini hazırla."

ChatGPT yalnız izin verilen prepare tool'larını çağırır.

> "Tamam, gönder."

External write ise explicit approval semantics + action tool + revalidation gerekir.

**ChatGPT'nin kendi conversation memory'si business state source of truth değildir.** Her consequential action öncesi current state yeniden okunmalıdır.

---

# 48. MCP tool mimarisi — agent yüzünden tool patlaması yaratma

Yeni specialist agent'lar için provider veya agent başına duplicate MCP tool oluşturulmamalıdır.

Yanlış:

```text
orders_agent_search_shopify
orders_agent_search_etsy
finance_agent_search_shopify_payout
finance_agent_search_ebay_payout
...
```

Doğru yaklaşım:

- mevcut domain tool'ları,
- canonical cross-channel tool'lar,
- gerektiğinde proposal/action tool'ları,
- server-side orchestrator routing.

Agent rolü tool contract'ından çok policy/routing katmanında yaşamalıdır.

Yeni gerekebilecek generic capabilities:

```text
get_attention_items
get_attention_item_detail
prepare_action
get_prepared_action
approve_prepared_action
get_agent_task_status
list_agent_tasks
resolve_attention_item
```

**Final tool names repository ve OpenAI review surface kontrolünden sonra kesinleşmelidir.**

`approve_prepared_action` gibi generic tool tasarlanırsa arbitrary action injection'a dönüşmemelidir. Server-side allowlisted typed action schema kullanmalıdır.

---

# 49. Quality review katmanı

Symphony benchmark'ında görülen "agent output'u başka bir agent'ın kontrol etmesi" fikri NivaDesk'e daha deterministic uygulanmalıdır.

Quality review üç seviyeli olabilir:

```text
LEVEL 1 — deterministic validators
schema / permissions / totals / currency / state checks

LEVEL 2 — domain consistency checks
sale vs payout vs bank deposit
provider status vs NivaDesk status
freshness / missing data

LEVEL 3 — AI reviewer
unsupported conclusions
unclear explanation
risky suggested action
```

Financial ve external-write alanlarında Level 1 ve Level 2 zorunludur.

AI reviewer hiçbir zaman deterministic permission check'in yerine geçmez.

---

# 50. Knowledge / Business Context Layer

Orchestrator yalnız transaction data değil, workspace-level işletme context'ini de güvenli biçimde kullanabilmelidir.

Örnek context:

- business type,
- operating hours,
- standard lead times,
- shipping preferences,
- approval thresholds,
- communication tone presets,
- preferred couriers,
- reorder thresholds,
- internal SLA rules,
- accounting setup,
- enabled/disabled automations.

Bu context:

- workspace scoped,
- permission aware,
- editable,
- auditable

olmalıdır.

AI'nın konuşmadan çıkardığı varsayım otomatik olarak permanent business rule haline gelmemelidir.

---

# 51. Proactive notification prensibi

Notification sayısı ürün kalitesi kadar önemlidir.

NivaDesk her detection'da kullanıcıyı rahatsız etmemelidir.

Her attention item için:

```text
severity
urgency
confidence
user preference
already notified?
changed since last notification?
actionable?
```

hesaplanmalıdır.

Benzer item'lar batch edilmelidir.

Örnek:

Yanlış:

```text
8 ayrı missing receipt bildirimi
```

Daha iyi:

```text
8 transactions are missing receipts — £1,842 total
[Review]
```

---

# 52. Agent cost / usage telemetry

Symphony'nin credit/action yaklaşımı NivaDesk için doğrudan kopyalanmamalıdır; fakat agent işlerinin maliyeti ölçülmelidir.

Her task için mümkün olduğunca:

- model usage,
- tool calls,
- external API calls,
- duration,
- retry count,
- success/failure,
- user-approved outcome,
- estimated compute cost

kaydedilmelidir.

Bu telemetry daha sonra pricing / fair-use / plan limit kararları için kullanılabilir.

**Önce ölç, sonra credit modeli tasarla.**

---

# 53. Model routing — ileri faz

Farklı agent'ların farklı kalite/hız/maliyet ihtiyacı olabilir.

Örnek:

- simple classification → fast/low-cost model,
- customer draft → writing-capable model,
- cross-domain financial reasoning → stronger reasoning model,
- deterministic check → model kullanma.

Model seçimi product contract olmamalıdır.

Agent capability:

```text
role + policy + tools + schemas
```

üzerinden tanımlanmalı; underlying model değiştirilebilir olmalıdır.

---

# 54. Audit ve explainability

Kullanıcı ve support ekibi bir agent sonucunun neden çıktığını gerektiğinde görebilmelidir.

Her consequential item için trace:

```text
What triggered this?
What records were read?
What facts were used?
What rule/AI interpretation produced the recommendation?
Was anything changed?
Who approved it?
What provider response came back?
Was completion verified?
```

Bu trace end-user UI'da sade, internal audit log'da detaylı olabilir.

Secrets ve raw credentials log'a yazılmamalıdır.

---

# 55. Yeni acceptance scenarios

## Scenario A — Morning briefing

Workspace'te:

- 2 overdue order,
- 1 due-soon order,
- 3 missing receipt,
- 1 unmatched marketplace payout,
- 1 stale provider sync

var.

Beklenen:

- tek briefing,
- doğru severity,
- duplicate item yok,
- stale provider için warning,
- payout revenue olarak tekrar sayılmıyor.

## Scenario B — Prepare what you can

User:

> "Bugün gereken şeylerden yapabileceklerini hazırla."

Beklenen:

- read-only issue'lar açıklanır,
- safe drafts/proposals hazırlanır,
- external send/write yapılmaz,
- approval gerekenler ayrı listelenir.

## Scenario C — Customer follow-up

7+ gündür design approval bekleyen 4 müşteri var.

Beklenen:

- 4 draft hazırlanabilir,
- hiçbiri approval olmadan gönderilmez,
- customer/order link korunur,
- user dismiss ederse tekrar spam edilmez.

## Scenario D — Banking receipt

User invoice yükler.

Beklenen:

- mevcut regression-critical matching flow aynen çalışır,
- tek confident match varsa policy'ye göre attach,
- ambiguity varsa candidate review,
- upload tekrar istenmez.

## Scenario E — Cross-domain stock risk

Order 3 gün içinde teslim, gerekli part low stock.

Beklenen:

- Orders + Inventory birlikte değerlendirilir,
- aynı issue iki ayrı duplicate alert olmaz,
- reorder suggestion hazırlanabilir,
- supplier purchase otomatik yapılmaz.

## Scenario F — External provider mismatch

Amazon `shipped`, NivaDesk `shipping waiting`.

Beklenen:

- platform state ile NivaDesk workflow state ayrı gösterilir,
- stale data kontrol edilir,
- kör auto-fix yapılmaz,
- doğru remediation proposal hazırlanır.

## Scenario G — Accounting blocker

Transaction Pandle'a hazır görünüyor fakat receipt eksik.

Beklenen:

- Banking + Accounting birlikte okunur,
- missing receipt blocker açıklanır,
- accounting sync completed denmez.

## Scenario H — Agent retry

Aynı triggered task iki kez delivery alır.

Beklenen:

- idempotency key,
- duplicate external action yok,
- duplicate notification yok,
- task audit'te retry görülebilir.

---

# 56. Önerilen implementation fazları

## Phase 0 — Mevcut şartnameyi güvene al

Önce mevcut 1–34. bölüm tamamlanmalı:

- production MCP inventory,
- OpenAI annotations,
- regression tests,
- canonical Commerce,
- Banking receipt parity,
- permissions,
- Amazon/eBay gerçek capability doğrulaması.

Agentic refactor mevcut OpenAI resubmission blocker'ını büyütmemelidir.

## Phase 1 — Unified Attention read model

- attention schema,
- deterministic detectors,
- `get_business_attention_summary` genişletmesi,
- source entity links,
- severity/freshness,
- native Today view.

Bu fazda autonomy yok.

## Phase 2 — Orchestrator + logical specialists

- intent routing,
- domain specialists,
- cross-domain aggregation,
- quality/policy review,
- no external autonomous write.

## Phase 3 — Prepare / proposal layer

- prepared actions,
- drafts,
- typed proposals,
- approval UX,
- task lifecycle,
- audit.

## Phase 4 — Event-driven + scheduled proactive engine

- domain events,
- SLA/time triggers,
- daily briefing,
- deduplicated notifications,
- configurable automation.

## Phase 5 — Approved external actions

Sadece gerçek connector capability ve review/policy uygunluğu olan alanlarda:

- communication send,
- provider mutations,
- accounting writes,
- shipping actions.

## Phase 6 — Cost optimization / growth intelligence

- model routing,
- compute telemetry,
- optional usage packaging,
- growth/opportunity agent.

---

# 57. OpenAI app review ile agentic sistemin ilişkisi

Yeni agentic yapı OpenAI review annotations sorununu çözmeden public tool surface'i kontrolsüz büyütmemelidir.

Kurallar:

1. Native NivaDesk internal agent sayısı ile public MCP tool sayısı aynı şey değildir.
2. Public MCP yalnız gerçekten ChatGPT'nin çağırması gereken stable capability'leri açmalıdır.
3. Proactive background jobs NivaDesk server-side çalışıyorsa MCP annotation'ı gerektiren yeni public tool olmak zorunda değildir.
4. ChatGPT'den yapılan consequential action mevcut annotation + permission standardına uymalıdır.
5. External write tool'ları review edilmeden generic "do_anything" action tool yapılmamalıdır.
6. Tool description gerçek side effect'i açıkça söylemelidir.
7. `openWorldHint` gerçek external interaction'a göre behavior testinden çıkarılmalıdır.
8. Approval UI bulunması yanlış annotation'ı doğru hale getirmez; annotation runtime behavior'ı anlatmalıdır.

---

# 58. Coding AI için agentic orchestration addendum

Aşağıdaki talimatlar Bölüm 32'ye ek normatif görevlerdir:

```text
21. Mevcut ChatGPT/MCP özelliklerini silmeden NivaDesk AI Orchestrator için current-state architecture report üret.
22. get_business_attention_summary'nin bugün gerçek implementasyon durumunu bul; yoksa sadece spec olduğunu açıkça işaretle.
23. Orders, Banking, Commerce, Inventory, Shipping, Accounting ve Integration Health domain'lerinde deterministic attention signals envanteri çıkar.
24. Agent kavramını ilk fazda logical role/policy/tool-scope olarak tasarla; gereksiz multi-process/multi-LLM complexity ekleme.
25. Business-critical orchestration'ı yalnız ChatGPT conversation içine gömme; server-side reusable orchestration layer kur.
26. Specialist role başına izin verilen domain tools ve prohibited actions matrisi oluştur.
27. Read / Prepare / Approve / Execute modelini agent task lifecycle ile birleştir.
28. Proactive engine için event, schedule ve state-combination trigger modeli oluştur.
29. Aynı underlying problem için duplicate alerts üretmemek üzere attention deduplication tasarla.
30. Daily Business Briefing'i stored attention items + fresh validation üzerinden üret; sadece generative model hafızasına dayanma.
31. Customer communication draft ile actual send'i ayrı capability yap.
32. Supplier reorder suggestion ile purchase/payment'i ayrı capability yap.
33. Marketplace/provider state mismatch'lerinde kör auto-fix yapma; freshness + revalidation + proposal kullan.
34. Quality review için deterministic validators + domain consistency + optional AI reviewer katmanlarını ayır.
35. Financial calculations'ta order sale/payment/fee/refund/payout/bank deposit/accounting posting ayrımını reviewer seviyesinde de doğrula.
36. Her proactive task için idempotency/deduplication key tanımla.
37. Agent task audit trail'i trigger → read → proposal → approval → execute → verify zincirinde sakla.
38. User-facing Today/Attention view için source entity deep-link'leri döndür.
39. Notification batching, severity ve already-notified state tasarla; spam üretme.
40. Agent compute/tool usage telemetry ekle fakat ilk implementasyonda Symphony benzeri credit billing'i zorunlu kılma.
41. Underlying model'i agent contract yapma; role + policy + tools + schemas üzerinden model-independent tasarla.
42. Public MCP tool setini agent sayısıyla birlikte patlatma; reusable canonical capabilities kullan.
43. Generic prepare/approve action tool tasarlanırsa arbitrary command çalıştırmasın; typed allowlisted action registry kullan.
44. External provider write'ları OpenAI review ve permission testleri tamamlanmadan public ChatGPT surface'ine açma.
45. Agentic faz başlamadan Phase 0 regression/review blocker'larının durumunu raporla.

Kod değişikliğinden önce ek olarak şunları üret:
- attention signal catalog,
- agent/skill responsibility matrix,
- agent-to-tool permission matrix,
- action risk-class matrix,
- trigger catalog,
- task lifecycle diagram,
- proactive notification dedupe strategy,
- quality-review architecture,
- native Today/Briefing UX data contract,
- MCP surface impact report.

Tamamlandığında ek olarak şunları üret:
- attention acceptance-test results,
- proactive trigger idempotency results,
- prepared-action approval tests,
- external action revalidation tests,
- duplicate-notification tests,
- agent audit examples,
- compute/usage telemetry report.
```

---

# 59. Kesinlikle yapılmaması gereken yeni agentic hatalar

1. Agent sayısını artırmayı ürün zekâsı sanmak.
2. Aynı business verisini her agent'ın ayrı ayrı normalize etmesi.
3. ChatGPT memory'sini current order/payment/banking truth kabul etmek.
4. Kullanıcı soru sormadı diye high-impact external write'ı otomatik yapmak.
5. "Proactive" olmak adına kullanıcıyı sürekli notification ile boğmak.
6. Aynı geciken order'ı Orders, Shipping ve Customer agent'ta üç ayrı alert göstermek.
7. AI confidence ile permission kontrolünü karıştırmak.
8. LLM reviewer'ı deterministic validator yerine kullanmak.
9. Agent draft'ını gönderilmiş mesaj gibi göstermek.
10. Proposal'ı execution gibi göstermek.
11. Provider queue response'unu completed saymak.
12. Stale sync üzerinde irreversible action yapmak.
13. Generic `execute_action(name, payload)` ile arbitrary internal/external command açmak.
14. Agent başına provider-specific duplicate MCP tool üretmek.
15. Her küçük task için pahalı model kullanmak.
16. Pricing/credits kararını gerçek usage telemetry oluşmadan vermek.
17. Native NivaDesk ile ChatGPT'nin farklı permission kuralları kullanması.
18. Source entity linki olmadan AI-only opaque alert üretmek.
19. User dismiss/resolve ettiği attention item'ı değişiklik yokken tekrar tekrar açmak.
20. Agentic genişletme yüzünden mevcut `attach_bank_receipt`, Orders veya Notes özelliklerini bozmak.

---

# 60. Güncellenmiş son hedef

NivaDesk'in nihai AI deneyimi yalnızca sorulara cevap veren bir chatbot olmamalıdır.

Hedef:

```text
NivaDesk knows what is happening in the business.
It identifies what needs attention.
It delegates analysis to the right specialist capability.
It prepares safe work before the owner asks.
It requests approval before consequential actions.
It executes through typed, permissioned paths.
It verifies the result.
It keeps the underlying business records as the source of truth.
```

Kullanıcı örneğin sabah NivaDesk'i açtığında:

> **Good morning. I found 8 things that need your attention today. I prepared 5 of them; 2 need your approval.**

mesajını görebilmelidir.

Ama bu mesajın arkasında yalnız generative AI değil:

- canonical business data,
- deterministic attention rules,
- freshness,
- permissions,
- specialist reasoning,
- typed proposals,
- approvals,
- audit,
- verification

olmalıdır.

**NivaDesk'in Symphony gibi ürünlerden ayrışacağı temel nokta budur:** NivaDesk yalnız başka uygulamaların üstünde gezen generic bir AI ekibi olmak yerine, custom-order işletmesinin operasyonel source of truth'u ile agentic intelligence katmanını aynı ürün içinde birleştirir.

Güncellenmiş ürün ilkesi:

> **The AI Operating System for Custom-Order Businesses — one source of truth, one intelligent orchestrator, specialist capabilities, and safe action.**

---

# 61. Dış benchmark kaynakları — 5 Eylül 2026

Bu bölümdeki Symphony karşılaştırması yalnız ürün/mimari benchmark amaçlıdır; NivaDesk'in runtime dependency'si değildir.

1. Wix Symphony launch / Press Room  
   https://www.wix.com/press-room/home/post/wix-launches-symphony-by-wix-a-new-standalone-multi-agent-system-built-for-smbs

2. Wix Symphony pricing / product capabilities  
   https://www.wix.com/symphony/pricing

3. Wix Symphony connectors & MCPs  
   https://symphony.wix.com/connectors

4. Wix Symphony agent models  
   https://symphony.wix.com/settings/models

5. Wix Help Center — Symphony AI credits  
   https://support.wix.com/en/article/symphony-about-ai-credits

Benchmark'tan doğrulanan başlıca ürün fikirleri:

- central orchestrator / Maestro,
- multiple specialist agents,
- proactive background activity,
- approvals for important actions,
- integrations / MCP connectivity,
- daily/morning business briefing,
- quality-review layer,
- usage/action-based AI credits,
- agent-specific model selection.

NivaDesk implementation kararı her durumda kendi canonical domain modeli, security boundary'leri, OpenAI MCP review kuralları ve mevcut regression-critical özellikleri tarafından belirlenmelidir.
---

# 62. 5 Eylül 2026 genişletmesi — External AI Channels / WhatsApp-first erişim

Bu bölüm, önceki Agentic Orchestration genişletmesinin devamıdır.

Yeni ürün kararı:

> **NivaDesk AI yalnız NivaDesk web/mobile arayüzünden veya ChatGPT üzerinden erişilen bir assistant olmayacaktır. Aynı Niva Orchestrator; WhatsApp, ileride voice/Siri, telefon, diğer AI istemcileri ve uygun üçüncü taraf kanallar üzerinden de güvenli şekilde kullanılabilmelidir.**

Bu karar yeni bir iş mantığı katmanı yaratmamalıdır.

Doğru yaklaşım:

```text
WhatsApp ──────┐
ChatGPT ───────┤
NivaDesk App ──┤
Voice / Siri ──┤
Future AI ─────┤
Phone ─────────┘
       ↓
Channel Gateway
       ↓
Identity + Workspace + Permission Resolution
       ↓
Niva AI Orchestrator
       ↓
Specialist Capabilities / Policies
       ↓
Canonical NivaDesk Tools + MCP / Internal Action Layer
       ↓
NivaDesk Source of Truth
       ↓
Provider Adapters / External Systems where explicitly allowed
```

Ana kural:

> **Channel değişir; business logic değişmez.**

WhatsApp, ChatGPT veya Siri aynı NivaDesk iş kurallarını bypass eden ayrı backend'ler olmamalıdır.

---

# 63. Symphony benchmark'tan çıkan yeni channel prensibi

5 Eylül 2026 itibarıyla Wix Symphony'nin public Channels ekranı, Symphony agent'larına yalnız kendi uygulamasından değil farklı giriş yüzeylerinden erişme modelini açıkça göstermektedir.

Public olarak görünen örnekler arasında:

- WhatsApp'ta agent ile mesajlaşma,
- Symphony'yi WhatsApp grubuna ekleyip `@symphony` ile çağırma,
- ChatGPT,
- Claude,
- Gemini Enterprise,
- phone,
- Siri & AirPods

bulunmaktadır.

Bu benchmark NivaDesk için bir implementation dependency değildir; fakat şu ürün varsayımını doğrular:

> **AI business operating system'in değeri yalnız kendi chat ekranında değil, kullanıcının zaten bulunduğu iletişim yüzeylerinde erişilebilir olduğunda artar.**

NivaDesk bu yaklaşımı kendi domain avantajıyla uygulamalıdır:

- orders NivaDesk'te,
- customer/project context NivaDesk'te,
- banking NivaDesk'te,
- receipts NivaDesk'te,
- inventory NivaDesk'te,
- shipping state NivaDesk'te,
- commerce normalization NivaDesk'te,
- permissions NivaDesk'te,
- audit NivaDesk'te.

External channel yalnız bu intelligence katmanına erişim sağlar.

---

# 64. Yeni ana mimari — Channel Gateway

Yeni ortak katman:

```text
External Channel
↓
Provider-specific Adapter
↓
Channel Gateway
↓
Authenticated Channel Identity
↓
Workspace / Role / Permission Context
↓
Niva Orchestrator
↓
Typed capability/tool call
↓
Policy / Approval / Revalidation
↓
Canonical NivaDesk Core
↓
Response Renderer
↓
Same External Channel
```

`Channel Gateway` business logic içermemelidir.

Sorumlulukları:

- inbound event doğrulama,
- provider webhook/event normalization,
- sender/channel identity resolution,
- workspace binding,
- user/role/permission context oluşturma,
- message/media normalization,
- correlation/conversation id üretme,
- idempotency/deduplication,
- orchestrator'a typed request gönderme,
- response'ı kanal formatına render etme,
- audit metadata taşıma.

Yapmaması gerekenler:

- order state business rule kararını kendi vermek,
- finance calculation yapmak,
- raw banking credential taşımak,
- provider token'larını modele vermek,
- permission kontrolünü yalnız prompt'a bırakmak,
- doğrudan external provider'a kontrolsüz write yapmak.

---

# 65. Channel capability contract

Her kanal için capability açıkça tanımlanmalıdır.

Önerilen contract:

```text
channel_id
channel_type
workspace_id
user_id
binding_id
conversation_id
is_group
provider_message_id
capabilities:
  read
  internal_write
  external_write
  file_upload
  voice_input
  proactive_delivery
  interactive_approval
security:
  assurance_level
  reauth_required_for
  financial_data_allowed
  pii_level
rendering:
  rich_cards
  buttons
  file_reply
  long_text
```

Orchestrator aynı soruya kanala göre farklı presentation üretebilir; fakat business sonucu aynı canonical data'dan gelmelidir.

---

# 66. WhatsApp'ın NivaDesk içindeki rolü

İlk WhatsApp hedefi:

> **NivaDesk owner/team command channel**

Kullanıcı WhatsApp'tan NivaDesk'e doğal dilde yazabilmelidir:

- "Bugün neye dikkat etmem gerekiyor?"
- "Bu hafta teslim edilmesi gereken order'ları göster."
- "Yahya'nın siparişinin durumu ne?"
- "Order #1042'yi ready for collection yap."
- "Amazon ve eBay'de bugün kaç satış olmuş?"
- "Receipt'i eksik banka hareketlerini göster."
- "Bu faturayı doğru banka hareketine bağla."
- "Stoğu düşük parçaları göster."
- "Bugün kargoya çıkması gerekenleri listele."
- "John'a göndermek için sipariş hazır mesajı hazırla."

Bu kullanımda WhatsApp bir CRM inbox değildir; NivaDesk AI'ı yönetmek için command surface'tir.

---

# 67. Owner/team WhatsApp channel ile customer WhatsApp inbox ayrılmalı

İki farklı problem kesinlikle karıştırılmamalıdır.

## A. Owner / team command channel

```text
NivaDesk user
→ WhatsApp
→ Niva AI
→ business data / actions
```

Bu bölümün öncelikli kapsamı budur.

## B. Customer communication channel

```text
Customer
→ WhatsApp
→ Business inbox / CRM
→ NivaDesk customer/order context
→ human/AI-assisted reply
```

Bu ayrı bir capability'dir ve daha sonra eklenebilir.

Güvenlik sebebi:

> Bir müşterinin WhatsApp mesajı hiçbir durumda owner/team management command olarak yorumlanmamalıdır.

Örneğin müşteri:

> "Order'ımı iptal edin."

mesajı gönderdiğinde bu mesaj doğrudan NivaDesk'te destructive order mutation çalıştırmamalıdır.

Customer channel farklı identity class, farklı permission set ve farklı action policy kullanmalıdır.

---

# 68. WhatsApp account linking / identity modeli

Telefon numarası tek başına NivaDesk authorization kaynağı olmamalıdır.

Önerilen linking akışı:

```text
User NivaDesk'e login olur
↓
Settings → AI Channels → WhatsApp
↓
Connect WhatsApp
↓
Short-lived pairing token / signed link / QR oluştur
↓
User NivaDesk WhatsApp endpoint'ine pairing mesajı gönderir
↓
Server token + WhatsApp sender identity'yi doğrular
↓
Authenticated NivaDesk user + workspace ile binding oluşturur
↓
Channel active
```

Önerilen `channel_binding` kaydı:

```text
binding_id
provider = whatsapp
provider_account_id
provider_user_identity
workspace_id
user_id
role_snapshot
status
created_at
last_verified_at
last_used_at
allowed_capabilities
group_ids[]
security_level
revoked_at
```

Telefon/display name gibi kullanıcı tarafından değiştirilebilen alanlar authorization için kullanılmamalıdır.

Binding dashboard'dan görülebilmeli ve tek tıkla revoke edilebilmelidir.

---

# 69. Workspace ve role çözümleme

Her inbound WhatsApp isteğinde server-side:

1. provider event doğrulanmalı,
2. active channel binding bulunmalı,
3. NivaDesk user hâlâ active mi kontrol edilmeli,
4. workspace membership hâlâ geçerli mi kontrol edilmeli,
5. role/permission güncel olarak resolve edilmeli,
6. tool çağrısında aynı permission context kullanılmalı.

Binding oluşturulduğu günkü permission snapshot kalıcı authorization olarak kullanılmamalıdır.

Örneğin kullanıcı Banking access'ini daha sonra kaybettiyse WhatsApp channel eski yetkiye dayanarak bank transaction göstermemelidir.

---

# 70. WhatsApp action risk sınıfları

Mevcut Agentic Orchestration risk modeli WhatsApp'ta da aynen geçerli olmalıdır.

## Class A — Read

Örnek:

- order bul,
- customer history göster,
- shipment state göster,
- inventory oku,
- banking attention summary oku.

Yetkili kullanıcı için doğrudan cevaplanabilir.

## Class B — Low-impact internal write

Örnek:

- internal order note ekleme,
- non-sensitive personal note ekleme,
- belirli low-risk internal flag güncelleme.

Permission + clear intent varsa direct veya lightweight confirmation ile yapılabilir.

## Class C — Consequential internal write

Örnek:

- order workflow status değişikliği,
- due date değiştirme,
- financial classification etkileyen alan değişikliği.

Structured confirmation/proposal tercih edilmelidir.

## Class D — External communication / provider write

Örnek:

- müşteriye mesaj gönderme,
- marketplace fulfilment update,
- external accounting write,
- refund/cancellation request,
- provider-side inventory mutation.

Proposal + explicit approval + revalidation gerekir.

## Class E — Financial / destructive / high-risk

Örnek:

- refund,
- payment-related irreversible action,
- delete/cancel,
- accounting authority mutation,
- sensitive bulk action.

WhatsApp mesajındaki tek bir belirsiz "evet" ile çalıştırılmamalıdır.

Tercihen signed approval deep-link veya yüksek güvenli structured confirmation kullanılmalıdır.

---

# 71. WhatsApp approval UX

Örnek:

```text
User:
Order #1042'yi completed yap ve müşteriye hazır olduğunu bildir.

Niva AI:
Order #1042 şu anda "Painting" durumunda.
Önerilen işlemler:
1. NivaDesk workflow status → Completed
2. Müşteriye "Your watch is ready for collection" mesajı gönder

Status değişikliği ve external customer message iki ayrı action'dır.
Devam etmek için approval gerekiyor.
```

Backend:

```text
prepare_action
↓
proposal_id
↓
impact summary
↓
approval
↓
revalidate
↓
permission check
↓
idempotency
↓
execute
↓
verify
↓
WhatsApp result
```

High-risk approval için kanalın desteklediği güvenlik düzeyi yetersizse kullanıcı NivaDesk approval screen'e yönlendirilmelidir.

---

# 72. WhatsApp group support

Symphony benchmark'ta WhatsApp group + mention pattern'i görülmektedir.

NivaDesk için ileride desteklenebilir:

```text
Team WhatsApp Group
→ @NivaDesk / explicit command
→ Group binding
→ Workspace context
→ Orchestrator
```

Ancak group mode varsayılan olarak daha kısıtlı olmalıdır.

Önerilen kurallar:

- group açıkça NivaDesk dashboard'dan authorize edilmeli,
- group → tek workspace mapping yapılmalı,
- yalnız linked NivaDesk team members command verebilmeli,
- explicit mention/command olmadan tüm konuşma dinlenmemeli,
- finansal/banking detayları group'ta default kapalı olmalı,
- sensitive customer PII minimize edilmeli,
- destructive/external write group'tan direct çalıştırılmamalı,
- audit'te group id + sender user id saklanmalı.

Örnek güvenli kullanım:

> "@NivaDesk bugün teslim edilmesi gereken işler hangileri?"

Örnek varsayılan olarak engellenecek kullanım:

> "@NivaDesk bu ay bütün banka hareketlerini ve çalışan ödemelerini buraya dök."

---

# 73. Conversation context

WhatsApp conversation history tek başına source of truth değildir.

Orchestrator her önemli iş için gerekli güncel state'i NivaDesk'ten yeniden okumalıdır.

Conversation context yalnız:

- pronoun/reference resolution,
- kullanıcı intent continuation,
- candidate selection continuation,
- proposal/approval continuation,
- file upload continuation

için kullanılmalıdır.

Örnek:

```text
User: Receipt'i eksik işlemleri göster.
AI: 3 işlem buldum. 1) DHL £42.10 2) Cousins £120 3) Royal Mail £18.40
User: ikincisine bunu bağla [PDF]
```

Sistem "ikincisi"ni conversation state'ten çözebilir; fakat transaction'ın hâlâ uygun olduğunu execution öncesi yeniden doğrulamalıdır.

---

# 74. Files, images, invoices ve receipts

WhatsApp media upload NivaDesk'in mevcut güçlü receipt/invoice akışını genişletmelidir.

Hedef:

```text
WhatsApp PDF/image
↓
Verified media fetch
↓
NivaDesk temporary/managed file asset
↓
Document interpretation
↓
Existing banking/order matching capabilities
↓
Candidate result
↓
User selection/approval if needed
↓
Attach without asking for same file again
```

Regression-critical kural:

> WhatsApp üzerinden yüklenen receipt/invoice da ChatGPT üzerinden yüklenen receipt gibi continuation içinde korunmalı; kullanıcıdan aynı dosya tekrar istenmemelidir.

Dosya güvenliği:

- provider download URL/tokens modele gösterilmemeli,
- MIME/type/size doğrulanmalı,
- malware/file safety kontrolleri uygulanmalı,
- tenant-scoped storage kullanılmalı,
- temporary URL'ler kısa ömürlü olmalı,
- audit'te file asset id kullanılmalı.

---

# 75. Voice notes — WhatsApp üzerinden ilk voice adımı

WhatsApp voice note ileride voice/Siri mimarisinin ilk doğal extension'ı olabilir.

Akış:

```text
Voice note
↓
Verified media
↓
Speech-to-text
↓
Niva Orchestrator
↓
Same permissions / tools / approval model
↓
Text response veya uygun voice response
```

Voice transcription hiçbir zaman write approval yerine geçmemelidir.

Özellikle:

- isim,
- order number,
- para tutarı,
- tarih,
- destructive command

gibi alanlarda belirsizlik varsa structured confirmation gerekir.

---

# 76. Proactive WhatsApp notifications

Proactive Attention Engine yalnız NivaDesk dashboard'da kalmamalıdır.

Kullanıcı tercih ederse WhatsApp üzerinden de gönderilebilir:

```text
Good morning. 6 things need attention today.

• 2 orders are due within 48 hours
• 1 customer approval is waiting for 5 days
• 2 bank transactions are missing receipts
• Amazon inventory sync is stale

Reply "show 1" to review overdue orders.
```

Notification engine şu kuralları taşımalıdır:

- opt-in,
- channel preference,
- quiet hours,
- timezone,
- severity threshold,
- batching,
- duplicate suppression,
- cooldown,
- resolved-alert suppression,
- sensitive-data redaction,
- provider delivery policy compatibility.

WhatsApp provider'ın outbound/session/template gibi güncel policy kısıtları adapter seviyesinde doğrulanmalı; business logic bu kuralları hard-code etmemelidir.

---

# 77. Notification ≠ action

Proactive mesajın gönderilmiş olması bir business action'ın uygulanmış olduğu anlamına gelmez.

Örnek:

> "3 order shipment overdue. I prepared suggested actions."

ile:

> "3 order'ı shipped yaptım."

aynı şey değildir.

NivaDesk mesajlarında:

- detected,
- prepared,
- awaiting approval,
- executing,
- completed,
- failed

state'i açıkça ayrılmalıdır.

---

# 78. WhatsApp üzerinden order management kapsamı

Phase 1 order capabilities:

### Read

- search order,
- order detail,
- customer/order history,
- due date,
- payment state,
- approval state,
- production/workflow state,
- shipping state,
- notes,
- linked inventory/parts,
- attention flags.

### Prepare

- status change proposal,
- due date change proposal,
- internal note draft,
- customer reply draft,
- shipping action proposal,
- missing-data checklist.

### Execute — policy-dependent

- add internal note,
- approved internal status update,
- approved low/medium risk NivaDesk mutation.

### External action — approval required

- send customer message,
- update external marketplace state,
- provider fulfilment mutation,
- cancellation/refund,
- accounting write.

---

# 79. Banking / Finance WhatsApp kapsamı

Read examples:

- "Bu hafta ne kadar harcadık?"
- "Receipt'i eksik transaction var mı?"
- "Amazon payout bankada eşleşmiş mi?"
- "DHL'e bu ay ne kadar ödedik?"

File-assisted example:

```text
User WhatsApp'tan invoice PDF gönderir
→ merchant/date/amount parse
→ bank candidates
→ strong single match varsa öner
→ ambiguous ise candidates
→ user selects
→ attach_bank_receipt-compatible flow
```

Güvenlik:

- full bank account credentials asla gösterilmez,
- permission'sız user financial data okuyamaz,
- group chat'te banking default disabled,
- external payment/refund action Phase 1 kapsamında direct değildir.

---

# 80. Customer / CRM WhatsApp kapsamı

Owner/team command channel içinden:

- customer bul,
- order history özetle,
- unanswered/waiting customers göster,
- follow-up draft hazırla,
- communication history summary ver,
- customer için next-best-action öner.

Ancak `send` ayrı action'dır.

Draft:

```text
read/prepare
```

Send:

```text
external communication
→ approval/policy
```

Bu ayrım ChatGPT, WhatsApp ve gelecekteki tüm external channels için ortak olmalıdır.

---

# 81. Inventory / Shipping / Commerce WhatsApp kapsamı

Inventory:

- low stock,
- reserved/available,
- order allocation,
- oversell risk,
- channel mismatch.

Shipping:

- due to ship,
- tracking state,
- delayed shipment,
- missing tracking,
- dispatch proposal.

Commerce:

- today/weekly sales,
- channel comparison,
- marketplace fees,
- payout state,
- order exceptions,
- sync health.

WhatsApp özel tool set yaratmamalıdır. Mevcut canonical NivaDesk tools/capabilities kullanılmalıdır.

---

# 82. Response rendering — channel-aware, data-consistent

Web UI rich card gösterebilir.

WhatsApp daha kompakt cevap vermelidir.

Örnek:

```text
Today — 5 items need attention

1. Order #1042 — due tomorrow — Painting
2. Order #1037 — payment overdue 6 days
3. DHL £82.40 — receipt missing
4. Amazon payout £1,840 — unmatched
5. eBay inventory sync — stale 9h

Reply with a number to open it.
```

Aynı underlying result ChatGPT'de farklı presentation ile gösterilebilir.

Presentation farklılığı business truth farklılığına dönüşmemelidir.

---

# 83. Future Channels — Siri, voice, phone ve diğer AI'lar

WhatsApp için kurulacak gateway yalnız WhatsApp'a özel tasarlanmamalıdır.

Gelecekte:

```text
Siri / AirPods
Phone / voice agent
Apple Watch / Wear OS
ChatGPT
Claude
Gemini
Other MCP/A2A-compatible clients
Slack / Teams if product fit exists
```

aynı `Channel Gateway → Identity → Orchestrator → Tools` zincirine eklenebilmelidir.

Her yeni kanal için yalnız:

- provider adapter,
- identity binding,
- capability profile,
- rendering,
- delivery policy

eklenmesi hedeflenmelidir.

Business logic yeniden yazılmamalıdır.

---

# 84. Third-party AI access prensibi

ChatGPT'nin NivaDesk'e MCP üzerinden bağlanması yalnız tek AI istemcisine özel mimari haline gelmemelidir.

Uzun vadeli prensip:

> **NivaDesk AI Core client-agnostic; tool access permission-aware; external AI surface protocol-adapter based olmalıdır.**

Ancak her third-party AI istemcisi aynı trust level'e sahip kabul edilmemelidir.

Client capability profile:

```text
client_type
protocol
read_scope
write_scope
approval_support
file_support
identity_assurance
audit_support
```

High-risk action desteği client'ın güvenli approval/revalidation modelini taşıyabildiği ölçüde açılmalıdır.

---

# 85. Channel security invariants

Tüm external channels için değişmez güvenlik kuralları:

1. Provider identity tek başına workspace authorization değildir.
2. Workspace server-side resolve edilir.
3. Current membership/role her request'te kontrol edilir.
4. Secrets modele verilmez.
5. Raw provider credential channel'a dönmez.
6. High-risk write proposal/approval/revalidation kullanır.
7. Idempotency provider message id/correlation id ile korunur.
8. Duplicate webhook aynı action'ı iki kez çalıştırmaz.
9. Channel conversation state source of truth değildir.
10. Sensitive data channel capability'ye göre redact edilir.
11. Revoked binding hemen etkili olur.
12. Audit log her channel action'ını source channel ile kaydeder.
13. Group permissions 1:1 permissions'tan daha kısıtlı olabilir.
14. File/media tenant boundary dışında paylaşılmaz.
15. User wording approval semantics olarak aşırı yorumlanmaz.

---

# 86. Audit genişlemesi

Her external-channel request için mümkün olduğunca:

```text
request_id
channel_type
provider_message_id
provider_conversation_id
binding_id
workspace_id
user_id
group_id if any
received_at
intent
orchestrator_route
tool_calls[]
proposal_id if any
approval_id if any
execution_id if any
result_state
response_message_id
```

saklanmalıdır.

Bu audit özellikle:

- accidental write,
- duplicate webhook,
- permission dispute,
- agent wrong-route,
- approval dispute,
- provider delivery failure

gibi durumların incelenebilmesini sağlar.

---

# 87. MCP / OpenAI review ile ilişki

WhatsApp channel eklenmesi mevcut OpenAI rejection şartlarını ortadan kaldırmaz.

ChatGPT public MCP yüzeyindeki her tool için mevcut annotation standardı aynı kalmalıdır.

Önemli ayrım:

```text
WhatsApp → internal Niva Orchestrator → internal capability
```

ile:

```text
ChatGPT → public NivaDesk MCP tool
```

aynı transport değildir.

Ancak aynı underlying action davranışı varsa:

- permission semantics,
- destructive semantics,
- idempotency semantics,
- external-write semantics

tutarlı olmalıdır.

Bir iş ChatGPT MCP'de read-only görünüp WhatsApp'ta aynı endpoint üzerinden state mutate etmemelidir.

---

# 88. Önerilen channel implementation fazları

## Phase CH-0 — Current-state audit

Kod değiştirmeden önce:

- mevcut ChatGPT/MCP architecture,
- native AI chat,
- webhook framework,
- user/workspace auth,
- notification engine,
- file upload pipeline,
- WhatsApp ile ilgili mevcut herhangi bir kod/config

tespit edilmelidir.

## Phase CH-1 — Generic Channel Gateway

Önce WhatsApp değil generic interface:

- normalized inbound message,
- identity context,
- capability profile,
- normalized outbound response,
- audit,
- idempotency.

## Phase CH-2 — WhatsApp 1:1 read-only beta

- secure binding,
- order/customer/inventory/shipping/commerce reads,
- attention summary,
- integration health,
- no consequential writes.

## Phase CH-3 — Files + Banking continuation

- PDF/image receipt,
- bank candidate matching,
- same-upload continuation,
- missing receipt workflows.

## Phase CH-4 — Safe internal actions

- notes,
- selected order status updates,
- proposal/confirmation,
- audit + verify.

## Phase CH-5 — Proactive delivery

- Daily Briefing,
- high-value alerts,
- quiet hours,
- opt-in,
- provider messaging policy compliance.

## Phase CH-6 — External communication / provider actions

Yalnız security + approval + revalidation + idempotency tamamlandıktan sonra.

## Phase CH-7 — Group + voice

- authorized groups,
- explicit mention,
- voice notes,
- stricter group policy.

## Phase CH-8 — Siri / phone / other AI clients

Generic Channel Gateway'in gerçekten provider-agnostic olduğunu kanıtlayan faz.

---

# 89. External Channels acceptance scenarios

## Scenario 1 — Read an order from WhatsApp

Given linked user with Orders permission
When user asks "Order #1042 ne durumda?"
Then correct workspace order is returned
And no write occurs.

## Scenario 2 — Cross-workspace isolation

Given same phone/user has access to multiple workspaces
When context is ambiguous
Then system must not guess silently
And must use explicit active workspace/binding context.

## Scenario 3 — Permission revoked after linking

Given WhatsApp was linked when user had Banking access
And Banking permission is later removed
When user asks for transactions
Then access is denied based on current permission.

## Scenario 4 — Duplicate webhook

Same provider message delivered twice
→ one logical request
→ no duplicate note/status/action.

## Scenario 5 — Receipt match continuation

User sends PDF
→ candidates returned
→ user says "2"
→ same file attached to selected transaction
→ no re-upload request.

## Scenario 6 — Consequential order status

User asks to mark order completed
→ proposal
→ confirmation/approval
→ revalidate
→ execute once
→ verify
→ result reported.

## Scenario 7 — External message

User says "John'a hazır olduğunu söyle"
→ customer/order resolved
→ draft shown
→ no send without approval.

## Scenario 8 — Group privacy

Group requests full banking detail
→ blocked/redacted by group policy unless explicitly enabled under secure policy.

## Scenario 9 — Proactive duplicate suppression

Same overdue order remains overdue for 3 polling cycles
→ do not send three identical WhatsApp alerts.

## Scenario 10 — Revoked channel

Binding revoked in NivaDesk
→ next inbound WhatsApp command cannot access workspace.

## Scenario 11 — Voice ambiguity

Voice transcription says ambiguous order number
→ no write
→ ask structured clarification.

## Scenario 12 — Third-party AI consistency

Same read query through ChatGPT and WhatsApp
→ same canonical business state
→ presentation may differ
→ totals/status cannot conflict due to channel-specific data logic.

---

# 90. Coding AI için External Channels addendum

Önceki Coding AI talimatlarına aşağıdakileri ekle:

```text
46. NivaDesk AI'ı ChatGPT-only olarak hard-code etme; generic External Channel boundary tasarla.
47. WhatsApp'ı ayrı business logic implementation'ı yapma; aynı Niva Orchestrator ve canonical tools üzerinden çalıştır.
48. Önce generic Channel Gateway contract'ını çıkar, sonra WhatsApp adapter'ı ekle.
49. Owner/team command channel ile customer WhatsApp inbox'ı ayrı identity ve permission sınıfları olarak tasarla.
50. Telefon numarasını tek authorization kaynağı kabul etme; authenticated NivaDesk user + workspace binding kullan.
51. Her inbound request'te current membership/role/permission'ı server-side yeniden doğrula.
52. Channel binding için revoke, audit ve last-verified state ekle.
53. Duplicate provider webhook/message için idempotency kur.
54. WhatsApp conversation history'yi source of truth kabul etme; write öncesi state'i NivaDesk'ten revalidate et.
55. WhatsApp file/media continuation'ı mevcut attach_bank_receipt davranışını bozmayacak şekilde tasarla.
56. Kullanıcıdan aynı invoice/receipt'i ikinci kez isteme.
57. WhatsApp read capabilities'i önce aç; consequential write'ları security modeli tamamlanmadan açma.
58. Internal low-risk write, consequential internal write, external write ve financial/destructive action'ları ayrı policy class yap.
59. High-risk approval'ı belirsiz natural-language "yes" mesajına bağlama.
60. Gerekirse signed NivaDesk approval deep-link kullan.
61. Group mode'u 1:1 mode'dan daha kısıtlı başlat; explicit authorization ve mention gerektir.
62. Banking/financial details'i group channel'da default kapalı tut.
63. Proactive notifications için opt-in, quiet hours, batching, dedupe ve severity policy ekle.
64. WhatsApp provider outbound/session/template policy'lerini adapter'da encapsulate et; core business logic'e hard-code etme.
65. Voice note desteğini speech-to-text input adapter olarak kur; approval semantics'i değiştirme.
66. Response rendering'i channel-aware yap fakat canonical data/result'i channel'a göre değiştirme.
67. Audit'e channel_type, provider_message_id, binding_id, user/workspace ve proposal/execution id'lerini ekle.
68. ChatGPT public MCP annotation semantics ile internal WhatsApp action semantics'in çelişmediğini test et.
69. Future Siri/voice/phone/other-AI client'ların aynı gateway'e eklenebilmesi için WhatsApp-specific abstraction sızıntısını engelle.
70. Kod değişikliğine başlamadan channel current-state report + security model + binding model + rollout plan üret.
```

---

# 91. External Channels release checklist

## Architecture
- [ ] Generic Channel Gateway var.
- [ ] WhatsApp adapter business logic içermiyor.
- [ ] Orchestrator mevcut canonical tools'u kullanıyor.
- [ ] ChatGPT ve WhatsApp business result semantics tutarlı.

## Identity / Security
- [ ] Secure account linking var.
- [ ] Current membership her request'te kontrol ediliyor.
- [ ] Binding revoke çalışıyor.
- [ ] Cross-workspace isolation test edildi.
- [ ] Group security ayrı test edildi.
- [ ] Secrets channel response'larına çıkmıyor.

## Actions
- [ ] Read/write risk sınıfları uygulanıyor.
- [ ] Proposal/approval/revalidation var.
- [ ] Duplicate message action'ı iki kez çalıştırmıyor.
- [ ] Queued/completed state ayrılıyor.
- [ ] External send ayrı action olarak audit ediliyor.

## Files / Banking
- [ ] WhatsApp PDF/image ingest çalışıyor.
- [ ] Existing receipt match parity korunuyor.
- [ ] Ambiguous candidate flow çalışıyor.
- [ ] Same-upload continuation çalışıyor.

## Proactive
- [ ] Opt-in var.
- [ ] Quiet hours/timezone var.
- [ ] Duplicate suppression var.
- [ ] Sensitive-data redaction var.
- [ ] Provider delivery rules adapter'da uygulanıyor.

## Future-proofing
- [ ] Voice input aynı orchestrator'a gidiyor.
- [ ] New channel eklemek core business logic değişikliği gerektirmiyor.
- [ ] Third-party AI client capability profile desteklenebilir.

---

# 92. Güncellenmiş ürün hedefi — NivaDesk her yerde

Yeni hedef yalnız:

> "ChatGPT'den NivaDesk'i kullan."

olmamalıdır.

Hedef:

> **"NivaDesk'i bulunduğun yerden yönet."**

Kullanıcı:

- NivaDesk uygulamasını açabilir,
- ChatGPT'den sorabilir,
- WhatsApp'tan mesaj atabilir,
- ileride Siri/AirPods ile konuşabilir,
- başka güvenilir AI istemcilerinden NivaDesk'e erişebilir.

Ama her durumda arka tarafta aynı şey çalışır:

```text
ONE SOURCE OF TRUTH
+
ONE ORCHESTRATOR
+
SHARED SPECIALIST CAPABILITIES
+
SHARED PERMISSION / APPROVAL MODEL
+
MULTIPLE ACCESS CHANNELS
```

Yeni ürün ilkesi:

> **NivaDesk is not a chatbot inside a business app. It is the business operating system that can meet the user in the interface they already use.**

Bu yaklaşım NivaDesk'in ChatGPT entegrasyonunu küçültmez; tersine ChatGPT'yi NivaDesk'e açılan ilk büyük external AI channel olarak konumlandırır.

WhatsApp ikinci büyük channel olur.

Siri/voice, phone ve diğer AI istemcileri aynı mimarinin doğal devamıdır.

---

# 93. Bu genişletme için benchmark kaynakları — 5 Eylül 2026

Bu kaynaklar yalnız ürün/mimari benchmark içindir; implementation dependency değildir.

1. Wix Symphony — Channels / Connectors
   https://symphony.wix.com/settings/connectors/channels

   5 Eylül 2026 itibarıyla public sayfada WhatsApp'ta Symphony ile chat, WhatsApp group + `@symphony`, ChatGPT, Claude, Gemini Enterprise, Phone ve Siri & AirPods gibi erişim yüzeyleri gösterilmektedir.

2. Wix Symphony — Connectors & MCPs
   https://symphony.wix.com/connectors

3. Wix Inbox — WhatsApp Business connection reference
   https://support.wix.com/en/article/wix-inbox-connecting-whatsapp-business-to-inbox

NivaDesk implementation'ı başlamadan seçilecek WhatsApp provider/API'nin güncel onboarding, webhook, outbound messaging, template/session, media, account ownership ve compliance kuralları resmi provider dokümantasyonundan ayrıca doğrulanmalıdır.


