# NivaDesk WhatsApp AI Channel — Uygulama ve Güvenlik Şartnamesi

**Tarih:** 5 Eylül 2026  
**Durum:** Uygulama öncesi repository, provider/API ve security doğrulaması gerekli  
**Bağlı ana şartname:** `NivaDesk_ChatGPT_MCP_Agentic_Orchestration_Expanded_2026-09-05.md`

---

# 1. Belge amacı

Bu belge NivaDesk kullanıcılarının yalnız NivaDesk uygulaması veya ChatGPT üzerinden değil, **WhatsApp üzerinden de NivaDesk AI / Niva Orchestrator ile güvenli şekilde iletişim kurabilmesini** tanımlar.

Ana kullanım:

> İşletme sahibi veya yetkili ekip üyesi WhatsApp'tan doğal dilde NivaDesk'e soru sorar, order/customer/inventory/banking/shipping/commerce verisini okur, güvenli NivaDesk işlemlerini hazırlar veya uygular ve gerektiğinde approval verir.

Bu belge müşteri support inbox'ını birincil kapsam olarak ele almaz.

---

# 2. Ana ürün kararı

WhatsApp NivaDesk'te yeni bir business logic sistemi olmayacaktır.

Doğru model:

```text
WhatsApp
↓
WhatsApp Provider Adapter
↓
NivaDesk Channel Gateway
↓
Identity / Workspace / Permission Resolution
↓
Niva AI Orchestrator
↓
Specialist Capabilities
↓
Canonical NivaDesk Tools / Action Layer
↓
NivaDesk Source of Truth
```

Ana ilke:

> **WhatsApp is a channel, not a second NivaDesk.**

Order logic, finance logic, customer logic, inventory logic ve permission logic WhatsApp adapter'ında tekrar yazılmamalıdır.

---

# 3. Neden yapılmalı?

NivaDesk'in AI değeri yalnız kullanıcı NivaDesk ekranını açtığında ortaya çıkmamalıdır.

İşletme sahibi günlük hayatında WhatsApp kullanıyorsa şu işlemler doğrudan yapılabilmelidir:

- order durumunu sorma,
- bugün neyin geciktiğini öğrenme,
- müşteri geçmişini özetleme,
- receipt eksik giderleri görme,
- invoice/receipt gönderip bank transaction ile eşleştirme,
- shipping gereken order'ları listeleme,
- stock risk'i görme,
- Amazon/eBay/Shopify performansını sorma,
- customer reply draft hazırlatma,
- güvenli internal action'ları approval sonrası uygulama.

Bu aynı zamanda gelecekte Siri, AirPods, phone/voice agent ve diğer AI istemcileri için temel oluşturur.

---

# 4. Scope

## Phase 1 — MUST

- WhatsApp 1:1 owner/team linking,
- secure user/workspace binding,
- order read,
- customer read,
- inventory read,
- shipping read,
- commerce overview,
- business attention summary,
- integration health,
- compact WhatsApp response rendering,
- audit,
- permission enforcement,
- duplicate webhook protection.

## Phase 2 — MUST

- PDF/image receipt upload,
- invoice/receipt interpretation,
- bank transaction candidate matching,
- same-upload continuation,
- banking attention summary,
- selected safe internal writes,
- proposal/approval/revalidation.

## Phase 3 — SHOULD

- proactive daily briefing,
- high-value alerts,
- customer reply drafting,
- approved customer send path,
- WhatsApp groups,
- voice notes.

## Later — MAY

- customer-facing WhatsApp inbox,
- voice replies,
- Siri/AirPods,
- phone agent,
- other AI clients.

---

# 5. Non-goals

İlk sürümde amaç:

- bütün NivaDesk UI'ını WhatsApp'a taşımak değildir,
- WhatsApp'tan kontrolsüz destructive action vermek değildir,
- WhatsApp konuşma geçmişini database yerine kullanmak değildir,
- Meta/provider-specific mantığı NivaDesk core'a yaymak değildir,
- müşteri mesajlarını owner command gibi işlemek değildir,
- bank/payment authority oluşturmak değildir.

---

# 6. Symphony benchmark

5 Eylül 2026 itibarıyla Wix Symphony'nin public Channels ekranı şunları göstermektedir:

- WhatsApp'ta Symphony agent ile chat,
- Symphony'yi WhatsApp grubuna ekleme,
- group içinde `@symphony` ile çağırma,
- ChatGPT,
- Claude,
- Gemini Enterprise,
- Phone,
- Siri & AirPods.

Bu NivaDesk için dependency değildir; ancak çoklu-channel AI operating system yaklaşımının güncel bir ürün benchmark'ıdır.

Kaynak:

https://symphony.wix.com/settings/connectors/channels

---

# 7. Temel mimari

```text
                       ┌─────────────────────┐
                       │ WhatsApp User/Group │
                       └──────────┬──────────┘
                                  │
                                  ▼
                       ┌─────────────────────┐
                       │ WhatsApp Provider   │
                       │ Webhook / Messages  │
                       └──────────┬──────────┘
                                  │
                                  ▼
                       ┌─────────────────────┐
                       │ Provider Adapter    │
                       └──────────┬──────────┘
                                  │ normalized event
                                  ▼
                       ┌─────────────────────┐
                       │ Channel Gateway     │
                       └──────────┬──────────┘
                                  │
               ┌──────────────────┼──────────────────┐
               ▼                  ▼                  ▼
         Identity Binding   Permission Resolve   Idempotency
               └──────────────────┼──────────────────┘
                                  ▼
                       ┌─────────────────────┐
                       │ Niva Orchestrator   │
                       └──────────┬──────────┘
                                  │
       ┌──────────────┬───────────┼──────────────┬─────────────┐
       ▼              ▼           ▼              ▼             ▼
     Orders        Customer     Finance       Inventory      Shipping
       └──────────────┴───────────┼──────────────┴─────────────┘
                                  ▼
                       ┌─────────────────────┐
                       │ Canonical NivaDesk  │
                       │ Source of Truth     │
                       └─────────────────────┘
```

---

# 8. Provider abstraction

WhatsApp provider seçimi core design'dan ayrılmalıdır.

Interface örneği:

```text
WhatsAppProviderAdapter
  verifyInboundRequest(...)
  parseInboundEvent(...)
  fetchMedia(...)
  sendText(...)
  sendInteractive(...)
  sendMedia(...)
  getDeliveryStatus(...)
  normalizeError(...)
```

Core NivaDesk şu provider-specific detayları bilmemelidir:

- webhook payload şekli,
- access token formatı,
- message id formatı,
- media download mechanics,
- outbound session/template policy,
- provider-specific retry semantics.

Bunlar adapter içinde kalmalıdır.

Implementation başlamadan seçilecek WhatsApp Business provider/API'nin güncel resmi dokümantasyonu doğrulanmalıdır.

---

# 9. Inbound message contract

Normalize edilmiş inbound event:

```json
{
  "channel": "whatsapp",
  "provider": "<provider>",
  "providerMessageId": "...",
  "providerConversationId": "...",
  "providerSenderId": "...",
  "isGroup": false,
  "groupId": null,
  "messageType": "text|image|document|audio|interactive",
  "text": "Order #1042 ne durumda?",
  "media": null,
  "receivedAt": "..."
}
```

Provider raw payload application logic'in kalıcı contract'ı olmamalıdır.

---

# 10. Secure account linking

Kullanıcının WhatsApp kimliği NivaDesk hesabına explicit olarak bağlanmalıdır.

Önerilen UX:

```text
NivaDesk
Settings
→ AI Channels
→ WhatsApp
→ Connect
```

NivaDesk:

- kısa ömürlü pairing token üretir,
- QR veya signed WhatsApp deep-link gösterebilir,
- kullanıcı WhatsApp'tan pairing mesajını gönderir,
- server provider sender identity + token'ı doğrular,
- binding oluşturur.

Örnek:

```text
NivaDesk shows:
LINK NIVA 7K4M2P

User sends to NivaDesk WhatsApp:
LINK NIVA 7K4M2P
```

Token:

- kısa ömürlü,
- single-use,
- workspace/user scoped,
- brute-force protected

olmalıdır.

---

# 11. Channel binding data model

Önerilen model:

```text
ChannelBinding
- id
- channelType = whatsapp
- provider
- providerAccountId
- providerUserIdentity
- workspaceId
- userId
- status = active|revoked|expired|needs_reverify
- createdAt
- lastVerifiedAt
- lastUsedAt
- revokedAt
- allowedCapabilities[]
- allowedGroupIds[]
- securityLevel
- notificationPreferenceId
```

Phone number human-readable metadata olarak saklanabilir; fakat authorization key olarak tek başına kullanılmamalıdır.

Sensitive identifiers encrypted veya protected storage'da tutulmalıdır.

---

# 12. Multi-workspace users

Bir NivaDesk kullanıcısının birden fazla workspace'i olabilir.

Öneri:

- binding varsayılan olarak tek workspace'e bağlı olsun,
- user WhatsApp'ta workspace değiştirmek isterse explicit `switch workspace` akışı olsun,
- active workspace mesajın başında/command context'te açık olsun,
- ambiguous durumda sistem tahmin etmesin.

Örnek:

```text
You have access to 2 workspaces:
1. EGGcraft
2. Studio B

Reply 1 or 2.
```

---

# 13. Permission resolution

Her request'te current permission server-side resolve edilmelidir.

Örnek:

```text
channel binding
↓
user
↓
workspace membership
↓
current role
↓
current permissions
↓
requested capability authorization
```

Cached role snapshot yalnız optimization olabilir; authorization authority olmamalıdır.

---

# 14. Required permissions

WhatsApp access ayrı bir global "all access" permission olmamalıdır.

Channel yalnız mevcut NivaDesk permissions'ı taşır.

Örnek:

```text
Orders: read/write
Customers: read
Banking: none
Inventory: read
Financials: none
```

Bu kullanıcı WhatsApp'tan bank data sorarsa cevap alamamalıdır.

---

# 15. Identity assurance levels

Önerilen assurance:

## Level 1

Linked WhatsApp identity + active NivaDesk binding.

Read ve düşük riskli internal action.

## Level 2

Recent NivaDesk reauthentication veya signed approval link.

Consequential internal writes.

## Level 3

Strong reauth / secure approval surface.

Financial/destructive/high-risk external actions.

Her capability minimum assurance level taşıyabilir.

---

# 16. Order management — read

WhatsApp'tan desteklenmesi gereken temel sorular:

- "Yahya'nın order'ını bul."
- "#1042 ne durumda?"
- "Bu hafta teslim edilecek order'lar hangileri?"
- "Ödemesi eksik order'ları göster."
- "Design approval bekleyenleri göster."
- "Shipping bekleyenleri göster."
- "Bu müşterinin geçmiş siparişlerini özetle."
- "Bugün kaç order attention istiyor?"

Response order source kimliğini korumalıdır.

---

# 17. Order management — internal writes

Örnek düşük/orta risk işlemler:

- internal note ekle,
- task/attention flag oluştur,
- belirli workflow status update,
- due date change proposal.

Her write tool-specific policy ile değerlendirilmelidir.

Örnek:

```text
User:
#1042'ye "müşteri pazartesi alacak" notu ekle.

AI:
Added internal note to Order #1042:
"Müşteri pazartesi alacak."
```

Bu action permission + idempotency + audit ile yapılmalıdır.

---

# 18. Consequential order writes

Örnek:

```text
User:
#1042'yi completed yap.
```

Önerilen akış:

```text
read current order
↓
check allowed transition
↓
prepare proposal
↓
show current → target
↓
explicit confirm
↓
revalidate order state
↓
permission check
↓
execute once
↓
verify
↓
report completed
```

Status transition invalid ise AI yalnız doğal dilde "tamam" diyerek bypass etmemelidir.

---

# 19. Customer actions

Owner/team WhatsApp'tan:

- customer bul,
- history özetle,
- unanswered communication göster,
- reply draft hazırla,
- appointment/order context özetle

yapılabilir.

Müşteriye gönderme ayrı external action'dır.

---

# 20. Draft vs Send ayrımı

```text
"John'a cevap hazırla"
= read + prepare
```

```text
"John'a bunu gönder"
= external communication write
```

Bu iki intent farklı tool/policy yolu kullanmalıdır.

Draft hiçbir zaman otomatik send sayılmamalıdır.

---

# 21. Banking / Finance read

Yetkili kullanıcı WhatsApp'tan:

- spending summary,
- missing receipts,
- uncategorised transactions,
- unmatched marketplace payouts,
- merchant spend,
- recurring transaction attention,
- banking attention summary

okuyabilmelidir.

Örnek:

```text
User:
Receipt'i eksik ödemeler var mı?

Niva AI:
3 transaction missing receipts:
1. DHL — £42.10 — 3 Sep
2. Cousins UK — £120.00 — 4 Sep
3. Royal Mail — £18.40 — 5 Sep

Reply with a number to open one.
```

---

# 22. Invoice / receipt via WhatsApp

Bu NivaDesk'in güçlü mevcut Banking özelliğinin WhatsApp extension'ıdır.

Akış:

```text
User sends PDF/image
↓
provider media event verified
↓
server fetches media
↓
file safety validation
↓
NivaDesk file asset
↓
merchant/date/amount extraction
↓
search_bank_transactions-compatible candidate lookup
↓
confidence evaluation
↓
strong single candidate OR choices
↓
user confirms/selects
↓
attach_bank_receipt-compatible write
↓
verify attachment
```

Kritik:

> Aynı yüklenmiş dosya conversation continuation içinde korunmalı; kullanıcıdan tekrar yüklemesi istenmemelidir.

---

# 23. Receipt candidate state

Önerilen continuation record:

```text
PendingFileMatch
- id
- workspaceId
- userId
- channelBindingId
- fileAssetId
- documentType
- extractedMerchant
- extractedAmount
- extractedDate
- candidateTransactionIds[]
- confidence
- state
- expiresAt
```

Kullanıcı:

> "2"

veya

> "Cousins olan"

dediğinde bu record üzerinden continuation yapılabilir.

Execution öncesi candidate transaction yeniden okunmalıdır.

---

# 24. Inventory

WhatsApp examples:

- "Stoğu düşük parçalar hangileri?"
- "Rolex 5500 dial kaç tane kaldı?"
- "Bu order için gerekli parça reserve edilmiş mi?"
- "Amazon ve Shopify stock tutarsızlığı var mı?"
- "Oversell riski olan ürünleri göster."

Inventory source-of-truth ve freshness cevapta korunmalıdır.

---

# 25. Shipping

WhatsApp examples:

- "Bugün kargoya çıkması gerekenler?"
- "Tracking'i olmayan shipped order var mı?"
- "DHL'de gecikmiş shipment var mı?"
- "Bu order'ın tracking numarası ne?"

Provider mutation:

- mark fulfilled,
- upload tracking,
- cancel shipment

read işlemlerinden ayrı policy gerektirir.

---

# 26. Commerce / marketplaces

Cross-channel examples:

- "Bugün Amazon, eBay ve Shopify'da kaç order geldi?"
- "Bu hafta en iyi kanal hangisi?"
- "Marketplace fee sonrası hangisi daha iyi?"
- "Unmatched payout var mı?"
- "Amazon finance sync güncel mi?"

NivaDesk canonical commerce model kullanılmalıdır.

WhatsApp adapter raw Amazon/eBay API çağrısı yapmamalıdır.

---

# 27. Attention summary

WhatsApp NivaDesk'in proactive/business-attention deneyimi için güçlü bir yüzeydir.

On-demand:

```text
User:
Bugün neye dikkat etmeliyim?
```

Response:

```text
Today — 6 items need attention

1. 2 orders due within 48h
2. 1 design approval waiting 5 days
3. 2 bank transactions missing receipts
4. Amazon inventory sync stale 8h

Reply 1–4 to open.
```

---

# 28. Proactive Daily Briefing

Opt-in kullanıcıya belirli zamanda:

```text
Good morning.

5 things need your attention today:
• 2 orders due soon
• 1 overdue payment
• 1 unmatched payout
• 1 missing receipt

I prepared 2 suggested actions.
```

gönderilebilir.

Bu proactive layer mevcut `get_business_attention_summary` ve Agentic Attention Engine ile aynı data source'u kullanmalıdır.

---

# 29. Notification preference model

```text
NotificationPreference
- workspaceId
- userId
- channelBindingId
- enabled
- timezone
- quietHours
- dailyBriefingEnabled
- dailyBriefingTime
- severityThreshold
- bankingAlerts
- orderAlerts
- integrationAlerts
- shippingAlerts
- batchingMode
```

---

# 30. Alert deduplication

Aynı problem her scheduler run'ında tekrar mesaj olmamalıdır.

Önerilen identity:

```text
attention_type
entity_id
workspace_id
state_version / fingerprint
```

Notification states:

```text
new
notified
acknowledged
snoozed
resolved
reopened
```

---

# 31. Quiet hours

Proactive notifications için:

- user timezone,
- quiet hours,
- severity override,
- next delivery window

uygulanmalıdır.

Örneğin low severity stock alert gece 02:00'de gönderilmemelidir.

Critical integration outage için kullanıcı explicit override seçebilir.

---

# 32. WhatsApp provider delivery policy

WhatsApp'ın güncel outbound/session/template ve benzeri messaging kısıtları zaman içinde değişebilir.

Bu nedenle:

> **Provider messaging policy core NivaDesk business logic'e hard-code edilmemelidir.**

Adapter:

- mesaj şimdi gönderilebilir mi,
- template gerekiyor mu,
- hangi message type izinli,
- retry yapılabilir mi,
- provider error kategorisi ne

kararını provider policy'ye göre resolve etmelidir.

Launch öncesi güncel resmi provider dokümanı zorunlu doğrulanmalıdır.

---

# 33. WhatsApp groups

İleri faz.

Hedef kullanım:

```text
EGGcraft Operations group

Gunes:
@NivaDesk bugün teslim edilecek işler hangileri?
```

Group yalnız dashboard'dan authorize edilmelidir.

---

# 34. Group binding

```text
ChannelGroupBinding
- id
- providerGroupId
- workspaceId
- status
- requireMention
- allowedUserIds[]
- allowedCapabilities[]
- financialDataAllowed = false default
- createdBy
- createdAt
```

---

# 35. Group rules

1. Explicit mention/command gerekir.
2. Tüm group sohbeti gereksiz yere ingest edilmez.
3. Yalnız linked team members management command verebilir.
4. Banking/financial detail default kapalıdır.
5. Sensitive customer PII minimize edilir.
6. High-risk write direct yapılmaz.
7. Group-specific audit vardır.
8. Group revoke edilebilir.

---

# 36. Voice notes

İleri faz.

```text
WhatsApp audio
↓
secure media fetch
↓
transcription
↓
text intent
↓
Niva Orchestrator
```

Voice note yeni business permission yaratmaz.

---

# 37. Voice confirmation

Speech recognition belirsizliği nedeniyle:

- order id,
- customer name,
- amount,
- date,
- status change,
- cancellation/refund

gibi write-critical alanlarda doğrulama gerekir.

Örnek:

```text
I heard: "Mark Order #1042 completed."
Current status: Painting.
Confirm this change?
```

---

# 38. Message rendering

WhatsApp response kısa, taranabilir ve numbered olmalıdır.

Uzun dashboard dump yapmamalıdır.

Önerilen format:

```text
Order #1042
Customer: John Smith
Status: Painting
Due: 7 Sep
Payment: Paid
Shipping: Not ready
Attention: Due in 2 days

Reply:
1 — details
2 — add note
3 — prepare status change
```

---

# 39. Pagination

WhatsApp'ta 50 order tek mesajda dönmemelidir.

Örnek:

```text
Showing 1–5 of 18
...
Reply "more" for the next 5.
```

Continuation cursor server-side saklanmalıdır.

---

# 40. Conversation state

Conversation state örnekleri:

```text
activeWorkspaceId
lastSearchResultIds[]
lastOpenedEntity
pendingProposalId
pendingFileMatchId
paginationCursor
expiresAt
```

Bu state source of truth değil UX continuation state'tir.

---

# 41. Conversation state expiry

Eski context yanlış action'a neden olmamalıdır.

Örneğin 3 gün sonra:

> "ikincisini yap"

mesajı önceki result listesine kör şekilde bağlanmamalıdır.

Pending selection/proposal expiry açıkça uygulanmalıdır.

---

# 42. Idempotency

WhatsApp/provider webhook'ları duplicate gelebilir.

Her inbound event için:

```text
provider + providerMessageId
```

unique processed-event key olmalıdır.

Write action ayrıca request/proposal idempotency key taşımalıdır.

---

# 43. Retry safety

Provider retry:

```text
same inbound event
→ same logical request
→ no second order note
→ no second status transition
→ no second customer message
→ no second receipt attachment
```

şeklinde davranmalıdır.

---

# 44. Action state machine

```text
received
understood
prepared
awaiting_approval
approved
executing
completed
failed
invalidated
needs_attention
```

WhatsApp response bu state'leri doğru isimlendirmelidir.

`queued` veya `executing` sonucu `completed` gibi göstermemelidir.

---

# 45. Proposal object

```text
ActionProposal
- id
- workspaceId
- userId
- sourceChannel = whatsapp
- sourceMessageId
- actionType
- targetEntityIds[]
- beforeState
- proposedState
- impactSummary
- riskClass
- requiredAssurance
- expiresAt
- state
```

---

# 46. Approval

Low/medium risk için WhatsApp structured confirmation yeterli olabilir.

High-risk için signed deep-link tercih edilir.

Örnek:

```text
This action needs secure approval:
Refund £450 to customer John Smith.

Open NivaDesk to review and approve.
```

Link:

- short-lived,
- signed,
- proposal-specific,
- authenticated NivaDesk session required

olmalıdır.

---

# 47. Revalidation

Approval geldiğinde current state tekrar okunmalıdır.

Örnek:

Order status approval hazırlanırken `Painting` idi; user approve edene kadar başka team member `Completed` yaptıysa proposal invalidated olabilir.

---

# 48. Customer-facing WhatsApp — ayrı faz

Bu belge owner/team command channel'a odaklanır.

Gelecekte customer inbox şu şekilde eklenebilir:

```text
Customer WhatsApp
↓
Customer Channel Gateway
↓
CRM identity resolution
↓
Order/customer context
↓
AI-assisted support
↓
Human approval / policy
```

Bu customer identity management commands permission'ına asla sahip olmamalıdır.

---

# 49. Customer identity matching

Gelecekte customer inbox eklenirse telefon numarası ile otomatik customer merge dikkatli yapılmalıdır.

Primary customer identity yalnız name/phone similarity olmamalıdır.

Ambiguous match:

- proposal,
- human review,
- no silent merge.

---

# 50. Files / media security

Inbound media için:

- webhook authenticity,
- media auth,
- MIME validation,
- size limits,
- malware/safety scan,
- tenant isolation,
- short-lived temp URLs,
- no provider token leakage,
- audit asset id

zorunludur.

---

# 51. Secrets

Asla model/tool response'a çıkmamalı:

- WhatsApp provider access token,
- webhook secret,
- app secret,
- verification secret,
- Meta/business credential,
- provider refresh token.

Credential resolution server-side olmalıdır.

---

# 52. PII minimization

WhatsApp response kanal riskine göre minimum gerekli customer bilgisini göstermelidir.

Örneğin order listesinde tam adres gerekmiyorsa göstermemelidir.

Group mode daha agresif redaction kullanmalıdır.

---

# 53. Logging

Raw message logging minimum tutulmalıdır.

Sensitive logs yerine structured audit tercih edilir.

```text
message_id
intent
entity_ids
action_state
result
```

Full content retention ayrı data-retention policy ile yönetilmelidir.

---

# 54. Audit event

```json
{
  "channel": "whatsapp",
  "bindingId": "...",
  "providerMessageId": "...",
  "workspaceId": "...",
  "userId": "...",
  "intent": "update_order_status",
  "tool": "update_order_status",
  "proposalId": "...",
  "executionId": "...",
  "result": "completed",
  "timestamp": "..."
}
```

---

# 55. Observability

Metrics:

- inbound messages,
- linked users,
- active users,
- read requests,
- write requests,
- proposal rate,
- approval rate,
- rejected actions,
- duplicate webhook count,
- tool error rate,
- provider send failure,
- median response latency,
- file match success rate,
- permission denied rate,
- wrong-route corrections,
- AI cost per task.

---

# 56. Cost control

Her WhatsApp mesajı pahalı multi-agent run başlatmamalıdır.

Routing:

```text
simple deterministic intent
→ lightweight route/tool call

complex cross-domain question
→ orchestrator reasoning

high-value multi-step task
→ specialist agent workflow
```

AI cost telemetry tutulmalıdır.

---

# 57. Abuse / rate limits

- per binding rate limit,
- per workspace rate limit,
- file upload limit,
- repeated failed pairing lockout,
- suspicious command burst detection,
- provider webhook replay protection

uygulanmalıdır.

---

# 58. Pairing attack protection

Pairing token:

- short TTL,
- cryptographically random,
- single use,
- attempt limited,
- user/workspace scoped

olmalıdır.

Successful pairing sonrası token invalidated edilmelidir.

---

# 59. Lost/stolen phone

User NivaDesk dashboard'dan:

```text
Settings → AI Channels → WhatsApp → Revoke
```

ile erişimi anında iptal edebilmelidir.

Ayrıca:

- password/account security change,
- user deactivation,
- workspace removal

gibi olaylar binding'i invalidate edebilmelidir.

---

# 60. Number change

WhatsApp identity değişiminde automatic trust transfer yapılmamalıdır.

Yeni identity için re-pairing gereklidir.

---

# 61. Device vs account trust

WhatsApp tarafında user aynı hesabı farklı cihazlarda kullanabilir.

NivaDesk authorization device fingerprint'e değil verified channel account binding'e dayanmalıdır; fakat high-risk approval için NivaDesk reauth gerekebilir.

---

# 62. Example flows

## Flow A — Daily attention

```text
User: Bugün neye dikkat etmeliyim?
AI: 5 items...
User: 1
AI: Shows two due orders...
User: ilkini aç
AI: Order detail...
```

## Flow B — Add note

```text
User: #1042'ye "Monday pickup" notu ekle
AI: Note added.
```

## Flow C — Status change

```text
User: #1042'yi completed yap
AI: Current: Painting → Proposed: Completed. Confirm?
User: Confirm
AI: Revalidates → executes → verifies → Completed.
```

## Flow D — Receipt

```text
User sends DHL invoice PDF
AI: I found 2 possible bank transactions...
User: 2
AI: Attached the invoice to DHL £42.10, 3 Sep.
```

## Flow E — Customer draft

```text
User: Yahya'ya watch'ın hazır olduğunu söyleyen mesaj hazırla
AI: Draft: ...
```

No send yet.

## Flow F — Customer send

```text
User: gönder
AI: Shows target + draft + approval
User approves
AI: Sends through allowed communication connector
AI: Sent / failed state verified
```

---

# 63. Suggested WhatsApp commands — no rigid command language required

NivaDesk doğal dili desteklemelidir.

Optional shortcuts:

```text
TODAY
ORDERS
BANKING
STOCK
SHIP
SALES
HELP
SWITCH
UNLINK
```

Bunlar fallback/UX shortcut olabilir; ana deneyim command syntax öğrenmeye zorlamamalıdır.

---

# 64. HELP response

```text
You can ask NivaDesk things like:

• "What's due this week?"
• "Find Order #1042"
• "Show missing receipts"
• "How many Amazon orders today?"
• Send an invoice/receipt PDF to match it
• "Draft a reply to John"

Type UNLINK to see how to disconnect this WhatsApp account.
```

---

# 65. Response confidence

Entity resolution ambiguous ise AI kesinmiş gibi davranmamalıdır.

Örnek:

```text
I found 2 customers named John Smith:
1. John Smith — Order #1042
2. John Smith — Order #987
Which one?
```

---

# 66. Freshness

WhatsApp cevapları provider sync freshness'i gizlememelidir.

Örnek:

> Amazon finance sync is 8 hours behind, so today's payout figure may be incomplete.

---

# 67. Partial data

Cross-channel summary partial ise açıkça söylenmelidir.

Örneğin eBay unavailable:

> Shopify + Amazon + manual orders total 12. eBay is excluded because the connection needs reauthorization.

---

# 68. Integration health via WhatsApp

```text
User:
Bağlantılarda sorun var mı?

AI:
1 issue:
• eBay — reconnect required

All other connections are healthy.
```

Bu `get_integration_health` ile aynı canonical health modelinden gelmelidir.

---

# 69. OpenAI / MCP relationship

WhatsApp internal channel eklenmesi ChatGPT MCP review standardını değiştirmez.

ChatGPT public MCP tool catalog için:

- `readOnlyHint`,
- `destructiveHint`,
- `idempotentHint`,
- `openWorldHint`

gerçek davranışla uyumlu kalmalıdır.

Underlying behavior WhatsApp yüzünden sessizce değiştirilmemelidir.

---

# 70. Shared action semantics

Örneğin `update_order_status`:

ChatGPT'den, WhatsApp'tan veya NivaDesk UI'dan çağrıldığında:

- aynı allowed transition logic,
- aynı permission,
- aynı validation,
- aynı audit,
- aynı idempotency expectations

uygulanmalıdır.

Channel özel bypass olmamalıdır.

---

# 71. Channel Gateway reusable contract

WhatsApp implementasyonu aşağıdaki geleceği desteklemelidir:

```text
NivaDesk App
ChatGPT
WhatsApp
Siri / AirPods
Phone Agent
Claude
Gemini
Other trusted AI clients
```

Yeni channel eklemek için core order/finance logic değiştirmek gerekiyorsa abstraction yetersizdir.

---

# 72. Future Siri / AirPods

Önerilen gelecekteki akış:

```text
"Hey Siri, ask NivaDesk what is due today"
↓
Voice Channel Adapter
↓
Channel Gateway
↓
Niva Orchestrator
↓
Attention summary
↓
Voice response
```

Write:

```text
"Mark order 1042 completed"
```

→ confirmation / secure approval semantics korunmalıdır.

---

# 73. Future phone agent

Kullanıcı NivaDesk AI numarasını arayabilir.

Voice agent aynı channel binding + identity assurance modelini kullanmalıdır.

Caller ID tek authorization olmamalıdır.

Sensitive write için stronger reauth gereklidir.

---

# 74. Future third-party AI clients

ChatGPT bugün ilk external AI client olabilir.

Gelecekte Claude/Gemini/başka client:

- protocol adapter,
- identity,
- permission scope,
- approval support,
- audit capability

ile değerlendirilmelidir.

Generic "her AI full write access" verilmemelidir.

---

# 75. Suggested implementation phases

## W0 — Repository audit

Kod değiştirmeden:

- mevcut WhatsApp code/search,
- webhook infrastructure,
- notification infrastructure,
- chat/orchestrator code,
- auth/workspace permission,
- file upload,
- Banking match path

haritalandır.

## W1 — Channel abstractions

- provider adapter interface,
- normalized event,
- Channel Gateway,
- binding model,
- audit,
- idempotency.

## W2 — Pairing + read beta

- connect/unlink,
- 1:1,
- Orders,
- Customer,
- Inventory,
- Shipping,
- Commerce,
- Attention.

## W3 — File/Banking

- media,
- receipt matching,
- continuation.

## W4 — Safe writes

- notes,
- selected status actions,
- proposal/approval.

## W5 — Proactive

- briefing,
- alerts,
- notification preferences.

## W6 — External communication

- customer draft/send,
- strict approval.

## W7 — Groups + voice

- authorized groups,
- mention,
- audio.

## W8 — Generalize

- Siri/phone/other AI proof-of-abstraction.

---

# 76. Acceptance tests — pairing

### P1 valid pairing
Authenticated user + valid token + valid sender → active binding.

### P2 expired token
No binding.

### P3 token replay
Second use rejected.

### P4 wrong workspace
Cannot pair to unauthorized workspace.

### P5 revoked user
Cannot pair.

---

# 77. Acceptance tests — reads

### R1 order read
Correct order from correct workspace.

### R2 cross-tenant
No other workspace data.

### R3 banking permission
No banking data without permission.

### R4 stale integration
Freshness warning shown.

### R5 ambiguous customer
Candidates; no guess.

---

# 78. Acceptance tests — writes

### W1 duplicate webhook
One note only.

### W2 status confirmation
No transition before approval.

### W3 stale proposal
Invalidated on changed state.

### W4 revoked permission
Approval fails if permission removed.

### W5 queued state
Not reported completed.

---

# 79. Acceptance tests — receipts

### F1 single confident match
Correct attach.

### F2 multiple candidates
No wrong auto-attach.

### F3 user selects second
Same file used.

### F4 no match
File retained in Needs Attention/inbox state.

### F5 duplicate retry
No duplicate attachment.

---

# 80. Acceptance tests — proactive

### N1 opt-out
No message.

### N2 quiet hours
Defers low severity.

### N3 same alert repeated
Dedupes.

### N4 resolved alert
No further message.

### N5 sensitive group
No financial detail.

---

# 81. Acceptance tests — unlink/revoke

### U1 user unlinks
Immediate access removal.

### U2 admin removes user
Binding invalidates.

### U3 role loses Banking
Next request denied.

### U4 provider identity changes
Re-pair required.

---

# 82. Rollout

Önerilen rollout:

```text
internal staff
→ selected beta workspaces
→ read-only public beta
→ files/banking beta
→ safe writes
→ proactive
→ groups/voice
```

Her faz feature flag ile açılmalıdır.

---

# 83. Feature flags

Örnek:

```text
whatsapp_channel_enabled
whatsapp_read_enabled
whatsapp_files_enabled
whatsapp_banking_enabled
whatsapp_internal_write_enabled
whatsapp_external_send_enabled
whatsapp_proactive_enabled
whatsapp_groups_enabled
whatsapp_voice_enabled
```

---

# 84. Emergency kill switches

Ayrı kill switch:

- all WhatsApp inbound,
- all write actions,
- external customer send,
- proactive outbound,
- media ingest,
- groups

için bulunmalıdır.

Read-only fallback mümkün olmalıdır.

---

# 85. Admin/support tooling

Support ekranı:

- binding status,
- workspace/user,
- provider identity masked,
- last message timestamp,
- last successful request,
- last error,
- permission denial,
- revoke,
- reverify,
- delivery diagnostics

gösterebilir.

Raw secrets göstermemelidir.

---

# 86. Error UX

Provider/system error:

```text
I couldn't complete that action.
Nothing was changed.
Error reference: NWA-83F2
```

Kullanıcıya raw stack/provider token/error dump gösterilmemelidir.

---

# 87. Partial failure UX

Multi-step action:

```text
Order status updated successfully.
Customer message was not sent because the WhatsApp communication connector needs reauthorization.
```

Bir adım başarısızken bütün iş "completed" olmamalıdır.

---

# 88. Explainability

Kullanıcı sorabilmeli:

> "Neden bunu bana gösterdin?"

AI:

```text
Because Order #1042 is due tomorrow and is still in Painting status.
```

Attention reason deterministic rule/source ile açıklanabilmelidir.

---

# 89. Data ownership

WhatsApp chat transcript NivaDesk business data authority değildir.

Authority:

- order → NivaDesk/connected commerce canonical record,
- bank movement → Banking provider/canonical banking record,
- accounting state → configured accounting authority,
- message delivery → communication provider result,
- agent state → NivaDesk task/proposal/audit.

---

# 90. No double counting

WhatsApp'tan "bu ay revenue ne?" sorulduğunda da ana finance kuralları geçerli:

- order sale,
- payment,
- payout,
- bank deposit

aynı revenue olarak birden fazla sayılmamalıdır.

---

# 91. Privacy / retention decision required

Launch öncesi ürün/legal kararı:

- WhatsApp message content ne kadar tutulacak?
- file media retention ne olacak?
- audit ne kadar tutulacak?
- user unlink sonrası transcript ne olacak?
- customer PII group mode'da nasıl maskelenecek?

Bu kararlar kodda implicit bırakılmamalıdır.

---

# 92. Provider compliance decision required

Launch öncesi doğrulanacak:

- WhatsApp Business onboarding,
- business verification requirements,
- phone number ownership,
- webhook verification,
- outbound message rules,
- templates/session constraints,
- media handling,
- display name policy,
- opt-in requirements,
- group/bot support model,
- rate limits,
- data/compliance terms.

Resmî provider dokümanı implementation source of truth olmalıdır.

---

# 93. Coding AI için doğrudan talimat

```text
Bu dosyayı NivaDesk WhatsApp AI Channel için normatif uygulama şartnamesi olarak kullan.

ÖNCE KOD DEĞİŞTİRME.

1. Repository'de mevcut WhatsApp, messaging, webhook, notification, channel ve AI chat kodlarını ara.
2. Mevcut Niva Orchestrator / ChatGPT MCP / canonical tool yollarını haritala.
3. WhatsApp için ayrı business logic yazma.
4. Generic Channel Gateway ve WhatsAppProviderAdapter sınırını önce tasarla.
5. Authenticated NivaDesk user + workspace pairing modelini çıkar.
6. Telefon/display name'i authorization source kabul etme.
7. Current role/permission'ı her request'te server-side resolve et.
8. Owner/team command channel ile customer WhatsApp inbox'ı ayrı identity class yap.
9. Phase 1'i read-only başlat.
10. Orders/Customer/Inventory/Shipping/Commerce/Attention canonical reads kullan.
11. Cross-workspace isolation testini release blocker yap.
12. providerMessageId tabanlı dedupe ekle.
13. Write action için ayrıca idempotency key kullan.
14. WhatsApp PDF/image'i secure media pipeline ile ingest et.
15. Mevcut attach_bank_receipt match/continuation davranışını koru.
16. Aynı receipt'i kullanıcıdan tekrar isteme.
17. Consequential writes için prepare -> approve -> revalidate -> execute -> verify kullan.
18. High-risk approval için gerekirse signed NivaDesk deep-link kullan.
19. Belirsiz "yes" mesajını high-risk approval sayma.
20. Proactive notification için opt-in, quiet hours, dedupe, severity ve channel preferences ekle.
21. Provider outbound/session/template policy'lerini adapter'da tut.
22. Group support'u ayrı feature flag ve stricter permission ile ekle.
23. Group'ta financial/banking details default disabled olsun.
24. Voice note'u input adapter olarak kur; permission/action semantics'i değiştirme.
25. Audit'e source channel + binding + provider message + proposal + execution metadata ekle.
26. Secrets'i model/tool response'a çıkarma.
27. Queue/executing/completed state'lerini doğru raporla.
28. Error/partial failure state'ini structured yap.
29. Feature flags ve emergency kill switches ekle.
30. WhatsApp implementation'ının ileride Siri/phone/other AI channels'a genellenebilir olduğunu architecture test ile göster.

Kod değişikliğinden önce üret:
- current-state report,
- proposed provider abstraction,
- account linking/security model,
- data models,
- capability matrix,
- rollout phases,
- risk register,
- test plan.

Tamamlandığında üret:
- final architecture diagram,
- provider implementation summary,
- permission matrix,
- security results,
- idempotency results,
- receipt parity results,
- proactive notification results,
- group/voice status,
- release checklist.
```

---

# 94. Kesinlikle yapılmaması gerekenler

1. WhatsApp adapter içinde order/finance business logic yazmak.
2. Phone number'ı tek authorization kaynağı kabul etmek.
3. User link edildi diye permission'ı sonsuza kadar cache etmek.
4. Müşteri WhatsApp mesajını owner management command olarak işlemek.
5. Duplicate webhook ile duplicate write yapmak.
6. Receipt file'ını candidate selection sonrası kaybetmek.
7. Aynı dosyayı kullanıcıdan tekrar istemek.
8. Group'ta tüm banking/PII verisini varsayılan olarak göstermek.
9. Belirsiz doğal dil onayını destructive approval saymak.
10. Stale conversation state ile write yapmak.
11. Approval sonrası revalidation yapmamak.
12. Queued işlemi completed demek.
13. Provider token/secret'i LLM'e vermek.
14. Raw WhatsApp payload'u canonical business contract yapmak.
15. Provider messaging policy'yi NivaDesk core'a hard-code etmek.
16. ChatGPT ile WhatsApp'a farklı business truth üretmek.
17. WhatsApp'a özel duplicate tool set oluşturmak.
18. High-risk action'ları ilk beta fazında açmak.
19. Revoke/kill switch olmadan launch yapmak.
20. Future channel abstraction düşünmeden WhatsApp-only architecture kurmak.

---

# 95. Release checklist

## Provider
- [ ] Provider/API seçildi ve resmi dokümantasyon doğrulandı.
- [ ] Webhook authenticity test edildi.
- [ ] Media fetch güvenli.
- [ ] Outbound policy adapter'da.

## Identity
- [ ] Pairing token short-lived/single-use.
- [ ] Workspace binding doğru.
- [ ] Revoke çalışıyor.
- [ ] Role/permission current state'ten geliyor.

## Read
- [ ] Orders.
- [ ] Customers.
- [ ] Inventory.
- [ ] Shipping.
- [ ] Commerce.
- [ ] Attention.
- [ ] Integration health.

## Banking/files
- [ ] PDF/image ingest.
- [ ] Candidate match.
- [ ] Ambiguous selection.
- [ ] Same-upload continuation.
- [ ] Duplicate protection.

## Write safety
- [ ] Risk classes.
- [ ] Proposal.
- [ ] Approval.
- [ ] Revalidation.
- [ ] Idempotency.
- [ ] Verification.

## Notifications
- [ ] Opt-in.
- [ ] Quiet hours.
- [ ] Severity.
- [ ] Deduplication.
- [ ] Redaction.

## Security
- [ ] Cross-tenant tests.
- [ ] Revoked permission tests.
- [ ] Secret leakage tests.
- [ ] Group privacy tests.
- [ ] Lost phone revoke test.

## Operations
- [ ] Feature flags.
- [ ] Kill switches.
- [ ] Audit.
- [ ] Metrics.
- [ ] Support diagnostics.

---

# 96. Nihai kullanıcı deneyimi

NivaDesk kullanıcısı işletmesini yönetmek için her seferinde yeni bir uygulama akışı öğrenmek zorunda kalmamalıdır.

Sabah WhatsApp'tan:

> "Bugün neye dikkat etmeliyim?"

Öğleden sonra ChatGPT'den:

> "Amazon ve eBay performansını karşılaştır."

Akşam NivaDesk'ten:

> dashboard / order detail

kullanabilir.

Hepsi aynı source of truth, aynı permission, aynı orchestrator ve aynı audit üzerinden çalışmalıdır.

Nihai prensip:

> **One NivaDesk. One business truth. One orchestrator. Many trusted channels.**

---

# 97. Benchmark / reference links — 5 Eylül 2026

1. Wix Symphony Channels  
   https://symphony.wix.com/settings/connectors/channels

2. Wix Symphony Connectors & MCPs  
   https://symphony.wix.com/connectors

3. Wix Inbox — WhatsApp Business connection reference  
   https://support.wix.com/en/article/wix-inbox-connecting-whatsapp-business-to-inbox

4. Wix Symphony — AI Credits / background actions  
   https://support.wix.com/en/article/symphony-about-ai-credits

Bu kaynaklar benchmark'tır. NivaDesk WhatsApp implementation'ı için seçilen provider'ın resmî, güncel teknik dokümanı ayrıca source of truth olarak kullanılmalıdır.
