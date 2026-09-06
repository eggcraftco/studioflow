# NivaDesk — Access Control Policy

**Owner:** EGGcraft Ltd (trading as NivaDesk), United Kingdom
**Version:** 1.0
**In force from:** 4 September 2026
**Next scheduled review:** 4 March 2027 — and every six months thereafter, in
step with the [incident response plan](incident-response-plan.md)

---

## 1. The principle

Nobody gets access because it is convenient. Access is granted for a stated
purpose, to the smallest set of data that purpose needs, and it is taken away
when the purpose ends. Where the difference matters, access is enforced by the
database rather than by the interface, because an interface that hides a field
has not restricted it.

This document says exactly which of NivaDesk's controls are enforced where. It
distinguishes the two honestly, because a policy that claims more enforcement
than it has is worse than no policy: it stops people asking.

## 2. Who the actors are

| Actor | What they are | How they are authenticated |
|---|---|---|
| **Workspace owner** | The business that signed up. Owns the workspace record and everything under it. | Firebase Authentication — email and password, Google, or Apple. |
| **Workspace member** | Somebody the owner invited: staff, a bench jeweller, a bookkeeper. | Firebase Authentication, on an invitation addressed to their email. The invitation token is never stored; its SHA-256 is the document id, and only the address it was sent to can accept it. |
| **NivaDesk operator** | The people who run the service. | Google account on the Firebase and Google Cloud projects. |
| **Server code** | Cloud Functions running with the Admin SDK, which bypasses security rules by design. | Service identity within the project; not a login. |
| **Connected platform** | Shopify, Etsy, Square, WooCommerce, PayPal, TrueLayer, QuickBooks, Xero, and in future Amazon. | OAuth tokens held per workspace; webhooks authenticated by a per-workspace signing secret. |

## 3. What is enforced by the database

These are Firestore security rules. They apply to every client on every
platform — web, macOS, iOS, Android — and to a request made with a stolen
session from outside the app, because the check happens in the database and not
in the app.

### 3.1 Workspaces cannot see each other

Every document carries a `companyId`, and every read requires
`canReadCompany(companyId)`: the caller must be the workspace owner or hold a
recognised member role in that workspace, and must not be suspended. There is no
query, on any collection, that returns another workspace's records. This is the
control that matters most and it is the one enforced most strictly.

### 3.2 Suspension is a database fact

`suspendedMembers` sits outside the `members` map — deliberately, because
`members` is a field an owner may write from a client and rules cannot protect
one sub-key of a writable map. Suspension is written only by the server, and a
suspended member fails `canReadCompany` immediately.

### 3.3 Three server-enforced tiers of order access

| Tier | Reads | Enforced by |
|---|---|---|
| **Owner, admin, member, viewer** | The full order document, including the customer's contact details and the order's financial fields. | `canReadOrderDocument` |
| **Assigned Projects Only** (custom role) | Only orders whose `assignedToUid` is their own. They cannot reassign an order to somebody else, on create or on update. | `isAssignedOnlyCustomMember` |
| **Workflow Only** | Never `/siparisler` at all. They read a finance-free view under `/workflowOrders`, and every write goes through a callable that verifies assignment server-side. | `usesWorkflowSafeView` |

### 3.4 Individually protected data

| Data | Who may read | Who may write |
|---|---|---|
| Bank spending feed | Owner, or a member explicitly granted `bankFeed` | Server only |
| Bank and accounting OAuth tokens | No client, ever | Server only |
| Integration webhook secrets | No client, ever | Server only |
| Billing and plan fields | Readable; writable only by the server (`protectedBillingFields`) | Server only |
| PII access log | Workspace owner | No client, ever — append-only from the server |

The rule for `companies/{companyId}/{collectionId}` is a **deny-list**: a
subcollection is readable by all members unless it is named as an exception in
both wildcard blocks *and* given a rule of its own. Any new subcollection
holding sensitive data must be added in all three places in the same change.
This is a known sharp edge, written down here so it is checked rather than
rediscovered.

## 4. What is enforced by the interface

The owner can grant or withhold roughly thirty capabilities per member — which
navigation areas they see, which cards appear inside an order, whether financial
figures are shown, whether they can export data or delete client files — and can
compose them into named custom roles.

These are real controls and they change what a member can do in the app. They
are **not** database rules. A member with `cardCustomer` withheld does not see
the customer card in the app, but the order document they are permitted to read
still contains the customer's name and address, and a determined member could
read it with the credentials they already have.

This is stated plainly rather than glossed, because the distinction is exactly
what a least-privilege review is for. It is acceptable today because these
capabilities exist to shape a colleague's working view inside a business that
already trusts them with the work — and it is not acceptable as the only control
over data belonging to somebody outside that business.

## 5. Amazon Information

Amazon Information is treated as more restricted than the workspace's own
records, in both directions.

**Outbound** — already enforced. The provider policy in
`functions/privacy/outbound.js` denies release on every outbound channel: the
assistant, AI-generated replies, customer messaging, analytics, accounting and
export. A provider with no policy entry is denied by default, so a connector
added without a decision fails closed. Every block is recorded in the PII access
log with the reason.

**Inbound** — the rules below are deployed. The connector is built on top of
them, and shipping it without them would be shipping the thing they exist to
prevent.

1. Amazon buyer personal data is **not** written into the order document. It goes
   to `companies/{companyId}/restrictedCustomer/{orderId}`, which has a rule of
   its own and is named in **both** wildcard deny-lists. Those wildcards OR with
   the specific rule, so a collection missing from either list is readable by
   every member no matter what its own block says.
2. **No client reads it. Not even the workspace owner.** The rule is
   `allow read, write: if false`. This is stricter than the database needs and
   exactly right for the obligation in point 3: a read that goes straight from a
   phone to Firestore is invisible to the access log, so a directly-readable
   collection would make "every access is recorded" true only in the sense that
   nothing was recorded. Reads go through a callable, which checks the caller's
   grant and writes the access down before returning anything.
3. That callable enforces what §4's per-card capabilities cannot: the workspace
   owner, or a member holding an explicit grant, and never a Workflow Only
   member, and never an Assigned Projects Only member on an order that is not
   theirs. Because the check is server-side and the data is unreachable
   otherwise, this is a real restriction rather than a hidden card — §4's gap
   does not apply to it.
4. Every read is written to the PII access log as
   `restricted_resource_accessed`, and every Restricted Data Token request as
   `rdt_requested`, so the trail shows what was fetched and on whose behalf.
   Entries carry the order id, the provider and the categories touched — never a
   name, an address or any other value.
5. A Restricted Data Token is never stored. It is short-lived by design, and
   persisting one turns a grant measured in minutes into a row that outlives its
   purpose.
6. The buyer's details are deleted 30 days after the order no longer needs them,
   by the retention sweep, without the workspace having to ask — the restricted
   document itself, not merely the fields on the order.

### Open remediation: one identity can read every secret

Every Cloud Function in NivaDesk runs as the project's **default compute
service account**. No function declares a service account of its own — 39
secrets are declared across the codebase, and the identity that can read any of
them is the same identity that runs all of them. Granting a secret to a function
therefore grants it, in practice, to every function.

This is the normal Firebase Functions default rather than a mistake, and moving
the whole system to per-function service accounts is not a precondition for
anything currently shipped. It is written down here because it is a real
weakening of least privilege, and because there is one place it stops being
acceptable:

**Before the Amazon connector serves a production seller**, and the eBay connector
likewise, the credentials that open the marketplace — Amazon's LWA client secret
and eBay's application keyset, and the key that seals each seller's refresh
token — must be readable only by that connector's functions themselves, through
a dedicated service account with no other grants. The default compute service
account must not hold `secretAccessor` on them. A marketplace's data protection
obligations do not survive an arrangement where any function in the system can
read the key to it. eBay's functions run as `ebay-connector@eggcraft-studio` and
its tasks ride their own Cloud Tasks queue (`ebayEventWorker`), never the shared
`commerceEventWorker`, so no other connector's key is ever mounted beside eBay's.

A check in the suite fails if Amazon or eBay code ships without that separation.

That separation has two directions, and the suite now checks both. A function
that **mounts** a marketplace secret must run as that connector's own identity —
and a function that **runs** the connector's code must mount its secrets. The
second one was missed once: a shared callable called into the eBay connector to
release a parked order, mounted no eBay secret (it cannot: it cannot take the
eBay identity either), and so threw `No eBay key is configured.` on every attempt
— silently, into a counter that read 'left in place'. The rule that follows from
it is not "add the secret": a shared callable hands the work to that connector's
own worker instead.

## 6. Administrative access to production

Administrative access — the Firebase console, the Google Cloud project,
Secret Manager, and the ability to deploy — is held by the named NivaDesk
operators listed in the incident response plan's roles table, and by nobody else.
It is not shared, not held by a contractor, and not granted for a single task
without being removed afterwards.

Rules for that access:

- **Google account with two-factor authentication is mandatory.** An
  administrative account without it is removed from the project, not warned.
- **Server code bypasses security rules by design.** Every Cloud Function that
  reads customer data is therefore itself an access control decision, and is
  reviewed as one.
- **Console access to customer data is for incident response and support
  requests, not curiosity.** Where a support request needs it, the workspace is
  told what was looked at.
- **Deploys are by named function.** A blind full-functions deploy prunes
  functions absent from the current branch, which is an availability incident
  waiting to happen.
- **Every production change is a commit.** "What changed just before this
  started" must always be answerable.

### 6.1 Privileged endpoints — scope decision (2026-09-05)

A privileged endpoint is any device from which a person can reach Amazon
Information or the controls around it: signed-in `gcloud`, the Google Cloud
console for `nivadesk-amazon`, Seller Central / the SP-API developer profile,
the repository with its deploy keys, or the Intune / Defender consoles that
protect those devices. The rule is simple: **a device is either enrolled and
under the managed EDR baseline, or it is not used for any of that.**

| Device | Decision | What it means |
|---|---|---|
| The operator's MacBook Pro (`Guness-MacBook-Pro`, serial in `evidence/amazon/device-inventory.md`) | **In scope — enrolled** | Intune-managed (user-approved MDM, corporate), Defender for Endpoint onboarded, compliance baseline enforced (FileVault, firewall, screen lock, tamper-protected real-time protection, scheduled scans, automatic updates). The only device on which Amazon SP-API administrative work happens |
| The operator's Mac Studio | **Out of scope — excluded by decision** | From 2026-09-05 it is **not used** for Amazon SP-API administrative systems, the `nivadesk-amazon` project (console or `gcloud`), Seller Central, or any access to Amazon Information. If that ever changes it is enrolled under the same baseline **before** first use; using it without enrolment is a policy violation |
| The operator's phone | **Out of scope — authentication only** | Used only as a second factor / authenticator (Microsoft MFA, Google 2-step verification). No Amazon, SP-API, Seller Central or administrative data access from the phone; the NivaDesk mobile app cannot read the restricted Amazon collection in any case (§5.2) |

This table is the authoritative endpoint inventory for control 4 of the Amazon
readiness criteria; the operational detail (agent versions, definitions, scans)
lives in `evidence/amazon/device-inventory.md`. Re-confirmed at every quarterly
review (§8) and whenever a device is added or replaced.

## 7. Granting, changing and removing access

- **Members** are added by the workspace owner, by invitation to a specific email
  address, within the seat limit of their plan. When the plan drops below the
  number of members, the excess lose access rather than the workspace losing
  data.
- **Removal is immediate.** Removing or suspending a member ends their database
  access on their next request; there is no cached grant to expire. Their push
  tokens are deleted at sign-out.
- **Connected platforms** are disconnected by deleting the workspace's stored
  token, after which the connector fails closed and asks for reconnection.
- **Operator access** is reviewed at each six-month review of this document:
  every account on the project is checked against the list of people who should
  have one, and two-factor authentication is confirmed for each.

## 8. Review

This policy is reviewed **every six months**, alongside the incident response
plan, and additionally whenever a new category of data is taken in, a new
connector ships, or the set of people with administrative access changes.

Each review confirms:

- the actor list in §2 and the operator list in §6;
- that §3 still describes the rules as deployed, by reading them;
- that §4's interface-level list has not silently grown to cover data belonging
  to somebody outside the workspace;
- that §5's inbound conditions are met by any Amazon code that has shipped, by
  reading the ingestion path rather than by watching a test go green;
- whether the secret-access separation above is still outstanding, and if Amazon
  has shipped, that it is done.

| Review date | Carried out by | Operator accounts checked | Changes made |
|---|---|---|---|
| 4 September 2026 | Gunes Gocmen | Yes | Initial version |
| *4 March 2027 (due)* | | | |
