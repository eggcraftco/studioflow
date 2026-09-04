# Amazon SP-API network security controls — architecture and cost assessment

**Written:** 4 September 2026, after the developer registration was refused
**Owner:** Incident Lead (see [incident-response-plan.md](incident-response-plan.md))
**Status:** assessment only. Nothing in here has been built.

---

## 1. Why this document exists

The SP-API developer registration was refused on 4 September 2026. The refusal
named exactly one question:

> *Does your organization implement the following network security controls:
> firewalls, IDS/IPS, anti-virus/anti-malware and network segmentation?*

We answered **No**, truthfully. Amazon treats that as disqualifying. The appeal
route is a new application with corrected responses — so the answer has to
become **Yes**, and it has to be true when it does.

This assessment measures what exists today and what each of the four controls
would actually cost, in money and in architecture. Two of them turn out to be
much larger than they look, and neither is a configuration change.

## 2. What exists today

Measured from the running project on 4 September 2026.

| | |
|---|---|
| Live functions | **407** — 353 callable, 35 HTTP, 18 scheduled, 1 Cloud Tasks |
| Publicly reachable HTTP surface | **388** endpoints (callable + HTTP) |
| Ingress settings | **None configured.** Every function is `ALLOW_ALL` |
| Load balancer | **None.** No Cloud Armor, no WAF, no rate limiting |
| Direct URLs | Every function answers on its own `*.run.app` and `cloudfunctions.net` address. Verified: `chatgptmcp-…run.app` returns 200, `cloudfunctions.net/generateQuickReply` returns 400 — i.e. it processed the request |
| Client data access | All four clients (web, macOS, iOS, Android) talk **directly** to `firestore.googleapis.com`, `firebasestorage.googleapis.com` and Identity Toolkit through the Firebase SDKs |
| Secrets | 39, all readable by the default compute service account |
| App Check | Configured with reCAPTCHA v3, in **monitor** mode — it observes, it does not enforce |
| Security headers | Only `content-security-policy: upgrade-insecure-requests`. No HSTS, no frame protection, no `X-Content-Type-Options` |
| Upload scanning | None |
| `nivadesk.app` | Cloudflare nameservers → Hostinger origin (the marketing and app site) |
| `mcp.nivadesk.app` | Firebase Hosting → `chatgptMcp` |

## 3. The two findings that change the plan

### 3.1 Cloud Armor in front of the callables is a client change, not a config change

Cloud Armor attaches to a Global External Application Load Balancer. Putting the
HTTP functions behind one is ordinary work. The callables are not.

All 353 callables are invoked by the Firebase SDKs on four clients, which resolve
their own endpoint — `cloudfunctions.net` or the `run.app` address. To route
those through a load balancer, the clients must be told to call a custom origin
instead. That means:

- a change to the Firebase Functions client configuration in web, Swift and
  Kotlin;
- a release of the macOS, iOS and Android apps, through the stores;
- a period where older installed versions still call the old address.

And the bypass has to be closed for the control to mean anything. Setting
function ingress to `internal-and-cloud-load-balancing` closes it — and the
moment it is set, every client still calling the old address fails. So the
sequence is: move clients first, wait for adoption, then close ingress. Doing it
in the other order takes the product down.

**This is the "big architectural change" flag.** It is not difficult so much as
irreversible-in-the-short-term, and it is gated on app store review times.

### 3.2 A VPC Service Controls perimeter around Firestore would break every customer

VPC Service Controls restricts access to a Google API to callers inside the
perimeter. Every one of our end users is outside it: their browser, their Mac,
their phone. All four clients read and write Firestore directly, including
real-time listeners.

A perimeter that includes `firestore.googleapis.com` therefore stops the product
working for everybody, on every platform, at the moment it is enforced. This is
not a tuning problem that dry-run mode reveals and ingress rules fix — end-user
devices have no stable identity or address to write a rule for.

There is a design that is both honest and safe, and it follows from where Amazon
Information actually lives:

- Amazon buyer data is **server-only** by construction. The restricted
  subcollection is denied to every client; the connector runs server-side; the
  outbound policy denies all six release channels.
- So the perimeter should enclose **where Amazon Information is handled** —
  Secret Manager, the Amazon connector's functions, and the server-side
  surface — rather than the whole database that also serves the workshop's own
  clients.

That is a defensible answer to a segmentation question and it does not take the
product down. It needs writing up carefully, because "we did not put Firestore
in the perimeter" has to be presented as a boundary decision with a reason, not
as a gap.

**Confirm before building:** the exact VPC-SC behaviour for Firestore accessed
by Firebase client SDKs should be verified against Google's current
documentation and, ideally, a support case — this assessment is based on how
VPC-SC works in principle, and the consequence of being wrong is an outage.

## 4. The four controls, mapped to this architecture

| Amazon's control | What we would actually build | Size |
|---|---|---|
| **Firewall** | Global external ALB + Cloud Armor: WAF rules, rate limiting, DDoS. All Amazon-related HTTP paths behind it, and the direct `run.app` bypass closed via ingress | **Large** — see 3.1 |
| **IDS/IPS** | Security Command Center with Event Threat Detection and Cloud Run Threat Detection, paired with Cloud Armor blocking so detection and prevention are a chain | **Cost-gated** — see 5 |
| **Anti-malware** | Malware scanning on Storage uploads, **plus** managed AV/EDR on every human device with production access, with update cadence recorded | **Medium** |
| **Network segmentation** | VPC Service Controls perimeter scoped to where Amazon Information is handled; dry-run, analyse violations, then enforce | **Medium, with a design decision** — see 3.2 |
| *Extra: App Check* | Monitor → Enforce, after testing every client call path | Small, but it can lock users out if a path is missed |
| *Extra: web hardening* | HSTS, a real CSP, `X-Content-Type-Options`, frame protection | Small |

App Check and the security headers are defence in depth. They are not answers to
Amazon's question and must not be counted as such.

## 5. Cost

Figures are order-of-magnitude and **must be confirmed against current pricing
before anything is committed**. They are here to size decisions, not to budget.

| Item | Shape of the cost | Note |
|---|---|---|
| Global external ALB | Monthly forwarding-rule charge plus data processing | Required *before* Cloud Armor can exist; the LB is the bigger half of this line at our volume |
| Cloud Armor | Per-policy and per-rule monthly, plus per-million-requests | Modest at our traffic |
| **Security Command Center** | Event Threat Detection and Cloud Run Threat Detection are **Premium/Enterprise tier**, not the free Standard tier. Premium is priced against total Google Cloud spend with a floor | **The single largest unknown.** Our GCP spend is very small, so a percentage-of-spend model may still land on a minimum commitment far above it. Needs a quote before the plan is committed |
| Storage malware scanning | Small — an extension or a scanning service on Cloud Run | Per-file compute |
| Endpoint EDR | Per device per month, for the machines with production access | Two devices today |
| VPC Service Controls | No direct charge | The cost is engineering time and outage risk |
| Annual penetration test | Four figures | See §6 |
| Monthly vulnerability scanning | Low, or free with the right tooling | See §6 |

**The SCC tier question should be answered first.** If Premium's minimum is out
of proportion to a project spending pennies a day, the IDS/IPS control needs a
different answer, and that changes the plan rather than the budget.

## 6. The requirements beyond the four controls

Amazon's current security guidance also asks for operational practices, and
patching only the question that was refused would leave the next refusal to
discover:

- monthly vulnerability scanning;
- annual penetration testing;
- log review at least every two weeks;
- annual third-party security assessment.

These have owners, cadences and evidence requirements exactly like the controls
do, and the readiness gate should test them before a second application, not
after a second refusal.

## 7. Sequence

Nothing here is built. The order matters more than the list.

1. **Answer the SCC tier question.** It can invalidate the IDS/IPS approach.
2. **Confirm the VPC-SC and Firebase client behaviour** in §3.2 against Google's
   documentation. It can invalidate the segmentation approach.
3. Web hardening and Storage malware scanning — independent of both, low risk,
   start whenever.
4. EDR on the production devices, with the update cadence recorded.
5. VPC-SC perimeter: design, **dry-run**, analyse violations, then enforce.
6. Cloud Armor: build the LB, move the clients to the custom origin, ship the
   native apps, wait for adoption, **then** close ingress.
7. App Check monitor → enforce, after every client path is tested.
8. Evidence pack for all four controls: configuration, test, owner, review
   cadence.
9. Only then: change the Developer Profile answer and submit a new application.

## 8. The rule this document exists to enforce

A control counts as implemented when it is **in production and evidenced**. A
control that exists in a design, in a dry-run, or in a staging project does not
count, and the Amazon readiness gate must not pass it. The last application was
refused for answering No honestly. The next one must not be refused for
answering Yes prematurely — that is a materially worse failure, because the
first was a gap and the second would be a misstatement.
