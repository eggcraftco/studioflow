# NivaDesk — Security Incident Response Plan

**Owner:** EGGcraft Ltd (trading as NivaDesk), United Kingdom
**Document owner:** Incident Lead (see *Roles*)
**Version:** 1.0
**In force from:** 4 September 2026
**Next scheduled review:** 4 March 2027 — and every six months thereafter

---

## 1. What this document is for

NivaDesk holds other people's business records: their customers' names and
addresses, their orders, their bank transaction descriptions, and the access
tokens that let us read from the shops and marketplaces they have connected. A
security incident here is not an inconvenience to us; it is somebody else's
customer list in the wrong hands.

This plan says who decides, what happens in the first hour, who must be told and
by when, and how we know afterwards what actually happened. It is written to be
followed under pressure by a small team, which is what NivaDesk is.

## 2. What counts as a security incident

Any of the following, confirmed or reasonably suspected:

- Unauthorised access to, or disclosure of, customer or end-customer personal
  data held in NivaDesk.
- Unauthorised access to a NivaDesk administrative account, the Firebase project
  `eggcraft-studio`, the Google Cloud project behind it, the source repository,
  or the domain and DNS.
- Disclosure, theft, or suspected exposure of a credential: a Secret Manager
  secret, an OAuth token belonging to a connected shop or bank, a webhook signing
  key, or an API key.
- A change to the service — code, security rules, or configuration — that made
  data readable by somebody who should not have been able to read it, whether or
  not anybody did.
- Loss of integrity or availability caused by an attack, as distinct from an
  ordinary outage.
- A security incident at a processor or connected platform that affects data we
  hold, notified to us by them.

**Amazon Information** means any data obtained through the Amazon Selling Partner
API, including buyer names, addresses, contact details, and order information.
Where this plan sets a stricter clock for Amazon Information, that clock wins.

An ordinary outage, a failed deploy, or a bug that loses nobody's data is not a
security incident. It is a reliability problem, handled separately. When it is
unclear which one it is, it is treated as an incident until shown otherwise.

## 3. Roles

NivaDesk is operated by a small team. The roles below are defined by
responsibility, not by headcount: one person may hold several, but each role has
a named holder at all times, and the holder is recorded here.

| Role | Responsibility | Holder |
|---|---|---|
| **Incident Lead** | Declares an incident, sets severity, owns the timeline, decides on containment that degrades the service, and signs off closure. Every decision in an incident is theirs to make or delegate. | Görkem Öçmen — contact@nivadesk.co.uk |
| **Deputy Incident Lead** | Takes the Lead's authority in full when the Lead is unreachable for more than 60 minutes, or when the Lead is themselves the subject of the incident (for example, a compromised administrator account). | Named at each six-month review; recorded in §11. Until a second person is appointed, the escalation is to the registered company director, and this limitation is stated openly rather than papered over. |
| **Technical Remediation** | Executes containment and recovery: revokes tokens, rotates secrets, deploys fixes, restores from backup. | Incident Lead |
| **Communications** | Writes and sends every external notification: affected customers, Amazon, the ICO, connected platforms. Keeps one thread per recipient so the record is coherent afterwards. | Incident Lead |
| **Record Keeper** | Maintains the incident log: what was seen, when, by whom, what was decided, and what evidence was preserved. Timestamps in UTC. | Incident Lead |

If NivaDesk grows past one operator, the Deputy and Communications roles are
assigned to a second person before any other role is split. Concentration of all
roles in one person is the single largest weakness of this plan, and it is named
here so that it is reviewed rather than forgotten.

## 4. Severity

| Level | Meaning | Examples | Response |
|---|---|---|---|
| **S1** | Personal data confirmed or likely exposed to an unauthorised party, or an administrative account is compromised. | Security rules allowed cross-workspace reads; an admin credential is found published; a token grants a third party access to a customer's shop. | Immediate. Containment before diagnosis. All clocks in §6 run. |
| **S2** | A credible route to exposure existed but there is no evidence it was used, or a credential was exposed to a limited and identified party. | A secret was committed to a private repository; a webhook accepted unsigned requests for a period. | Same day. Containment first, then evidence gathering to establish whether S1 applies. |
| **S3** | A weakness with no exposure and no exploitable path in production. | A dependency advisory affecting a code path we do not call. | Tracked and fixed on the normal release cycle. No external notification. |

Severity is set by the Incident Lead within 30 minutes of an incident being
declared, and revised upwards without hesitation if evidence justifies it.
Severity is never revised downwards to avoid a notification.

## 5. How we find out

- **Cloud Functions logs and Google Cloud error reporting** for the
  `europe-west2` functions that carry every server-side write.
- **The PII access log** (`companies/{companyId}/piiAccessLog`): an append-only
  record of server-side access to customer personal data — who, which workspace,
  which order, which category of data, which action, and whether the outbound
  policy allowed or blocked it. It is readable by the workspace owner and
  writable by no client.
- **Firestore security rules**, which fail closed: a rule denial is a signal, not
  only a refusal.
- **Platform dashboards** for connected processors — Stripe, Twilio, Google
  Play, Apple, and each commerce and accounting connector — including their own
  breach notifications to us.
- **Reports from customers and researchers** to contact@nivadesk.co.uk. Any
  message that reads like a vulnerability report is treated as one, and
  acknowledged within one business day.
- **Deploy history**: every production change is a commit and a named function
  deploy, so "what changed just before this started" is answerable.

## 6. The clocks

Times run from the moment the Incident Lead declares an incident.

| By | What |
|---|---|
| **T + 30 min** | Severity set. Incident log opened. Evidence preservation started (see §8). |
| **T + 1 hour** | Containment in place for S1 and S2: the exposed route is closed, even if closing it degrades or disables part of the service. Availability is never traded for a continuing exposure. |
| **T + 24 hours** | **Amazon notified** — see §7. Non-negotiable for any incident involving Amazon Information. |
| **T + 72 hours** | The UK Information Commissioner's Office notified, where the incident is a personal data breach likely to result in a risk to people's rights and freedoms (UK GDPR Article 33). Where NivaDesk acts as processor for a customer, that customer is notified without undue delay so they can meet their own 72-hour duty. |
| **Without undue delay** | Affected customers told, in plain language: what happened, what data, what we have done, what they should do. Where the risk to individuals is high, their own end-customers are told too, through the customer, or directly if the customer cannot. |
| **T + 5 working days** | Interim written report to affected customers if the investigation is still open. |
| **T + 30 days** | Post-incident review completed and corrective actions assigned with dates (§9). |

## 7. Notifying Amazon

For any security incident affecting Amazon Information — confirmed or reasonably
suspected — NivaDesk notifies Amazon **within 24 hours of becoming aware of it**,
by email to **security@amazon.com**, and continues to update Amazon as the
investigation proceeds.

The first notification does not wait for a complete picture. It states:

1. That a security incident affecting Amazon Information has occurred or is
   suspected, and when it was detected.
2. What is known so far about scope: which data categories, roughly how many
   records, which sellers.
3. What containment is already in place.
4. Who is leading the response and how to reach them directly.
5. When the next update will be sent.

Amazon Information is, by policy, the most restricted data NivaDesk holds. The
outbound policy (`functions/privacy/outbound.js`) denies its release on every
outbound channel — the assistant, AI-generated replies, customer messaging,
analytics, accounting, and export — and a provider with no policy entry is denied
by default. An incident in which Amazon Information reached one of those channels
is by definition S1, regardless of volume.

## 8. Containment playbooks

Each of these is a real mechanism in the running service, not an aspiration.

- **Revoke a connected shop or bank's access**: delete the workspace's stored
  token document; the connector then fails closed and asks the workspace to
  reconnect.
- **Rotate a token-encryption key**: tokens are stored in an AES-256-GCM envelope
  stamped with the key that sealed them, so a new key can be introduced and the
  old one retired while existing tokens still open.
- **Rotate a platform secret**: replace the value in Google Secret Manager and
  redeploy the affected functions by name. Deploying by name is mandatory: a
  blind full-functions deploy prunes functions that are not in the current
  branch.
- **Disable a connector or an endpoint**: remove or gate the function, so an
  exploited route stops existing rather than merely becoming harder to reach.
- **Cut off a person**: suspend the workspace member, revoke their session, and
  delete their push tokens. For a compromised administrator, reset the account
  credential first and the sessions second.
- **Restore data**. Every value below was read from the Firestore Admin API on
  4 September 2026, not from anybody's recollection:
  - Firestore database `(default)`, edition STANDARD, located in
    **europe-west2** (London) — the same region as the Cloud Functions.
  - **Point-in-time recovery: enabled**, with a version retention period of
    **7 days** (604800s). Any moment inside that window can be recovered to.
  - **Daily backup schedule**, retention **14 days** (1209600s).
  - Firebase Authentication users are snapshotted daily to private storage and
    kept for **30 days**.
  - **Delete protection: enabled** (4 September 2026). It was off until that
    date, which is worth recording rather than quietly fixing: with it off, the
    database itself could be deleted, and no amount of point-in-time recovery
    survives that. Every recovery mechanism above assumes there is still a
    database to recover into.

  These are re-read at each review of this document, from the API rather than
  from this page, and §11 records the date they were last confirmed.

**Preserve before you clean.** Before deleting or rotating anything, export the
relevant Cloud Functions logs, the PII access log entries, and the state of the
affected documents. Containment destroys evidence as a side effect, so the export
comes first — it takes minutes, and without it the post-incident review is
guesswork.

## 9. After the incident

Within 30 days of closure, the Incident Lead completes a written review covering:

- A factual timeline, in UTC, from first signal to closure.
- What data was affected, for whom, and how that was established.
- Root cause — the condition that made the incident possible, not the action that
  triggered it.
- Why it was not caught earlier, treated as a question about detection rather
  than about the person involved.
- Corrective actions, each with an owner and a date, tracked to completion.
- Whether this plan worked, and what in it needs to change.

Reviews are blameless in tone and specific in outcome. A review that produces no
change to code, configuration, or this document has almost certainly missed
something.

## 10. Testing

At each six-month review, the Incident Lead runs a tabletop exercise against one
scenario, working through this plan without changing production:

- A leaked Secret Manager secret with unknown exposure window.
- A security rule change that exposed one workspace's orders to another.
- A connected marketplace notifying us of a breach on their side.
- A compromised administrator account.

The exercise is timed against the clocks in §6. Where the plan cannot be followed
in the time it allows, the plan is changed — not the clock.

## 11. Review cadence and record

This plan is reviewed **every six months**, and additionally:

- after any S1 or S2 incident;
- when a new category of data is taken in, or a new marketplace is connected;
- when responsibility for any role in §3 changes hands.

A review confirms every role holder in §3, re-reads the backup and recovery
values in §8 from the Firestore Admin API, runs the exercise in §10, and records
the result below.

| Review date | Carried out by | Roles confirmed | §8 values re-read | Exercise run | Changes made |
|---|---|---|---|---|---|
| 4 September 2026 | Görkem Öçmen | Yes — single-operator limitation recorded | Yes — PITR 7 days, daily backup 14 days, Auth snapshot 30 days, all read from the API | Plan authored; first exercise due at next review | Initial version |
| *4 March 2027 (due)* | | | | | |

### Outstanding actions

| Action | Raised | Owner | Status |
|---|---|---|---|
| Enable delete protection on the Firestore `(default)` database | 4 September 2026 | Incident Lead | **Done, 4 September 2026** — confirmed `DELETE_PROTECTION_ENABLED` |
| Audit every operator account against the password and MFA policy §6 | 4 September 2026 | Incident Lead | Open — the table is in `password-and-mfa-policy.md` §8, and the questionnaire answer stays No until it is filled in |
| Appoint a second person as Deputy Incident Lead | 4 September 2026 | Incident Lead | Open — see §3 |
| Run the first tabletop exercise (§10) | 4 September 2026 | Incident Lead | Due at the March 2027 review |

## 12. Contacts

| Who | How | For |
|---|---|---|
| NivaDesk Incident Lead | contact@nivadesk.co.uk | Everything below, first point of contact |
| Amazon Security | security@amazon.com | Any incident affecting Amazon Information — within 24 hours |
| UK Information Commissioner's Office | ico.org.uk/report | Personal data breaches, within 72 hours where reportable |
| Vulnerability reports | contact@nivadesk.co.uk | Acknowledged within one business day |
