# NivaDesk — Password and Multi-Factor Authentication Policy

**Owner:** EGGcraft Ltd (trading as NivaDesk), United Kingdom
**Version:** 1.0
**In force from:** 4 September 2026
**Next scheduled review:** 4 March 2027 — and every six months thereafter, in
step with the [incident response plan](incident-response-plan.md)

---

## 1. Scope

This policy covers two different populations, and the difference matters:

- **People who use NivaDesk** — workspace owners and the members they invite.
  They authenticate against Firebase Authentication.
- **People who run NivaDesk** — the operators named in the incident response
  plan's roles table, who hold administrative access to the Firebase and Google
  Cloud projects, Secret Manager, the source repository, and the domain.

The rules for the second group are stricter, because a compromised operator
account reaches every workspace and a compromised workspace account reaches one.

## 2. How people sign in to NivaDesk

| Method | Available on | Notes |
|---|---|---|
| Email and password | Web, macOS, iOS, Android | Subject to §3. Email verification is required before the workspace opens. |
| Sign in with Google | Web, macOS, iOS, Android | The password, and any second factor, belong to the Google account. |
| Sign in with Apple | Web, macOS, iOS | The password, and any second factor, belong to the Apple ID. |

Where somebody signs in with Google or Apple, NivaDesk never sees or stores a
password, and the strength of that account's authentication — including whether
it carries a second factor — is set and enforced by that provider.

## 3. Password requirements

A password chosen for a NivaDesk email account must be:

- at least **8 characters** long;
- contain at least one letter;
- contain at least one digit.

There is no maximum length, no forced expiry, and no ban on password managers or
pasting. Forced rotation and character-class theatre push people towards worse
passwords, and NCSC guidance has advised against them for years.

**Where this is enforced.** The rule is defined once in
`functions/security/passwordPolicy.js` and mirrored in each client's own
language: the web sign-up form, `AuthViewModel.swift` for macOS and iOS, and
`LoginScreen.kt` for Android. A test in the suite reads all four and fails if
they drift apart. Until September 2026 they *had* drifted: Android checked only
that the two boxes matched, so an account refused in a browser could be created
from a phone. That is fixed, and the test is why it stays fixed.

**Enforced server-side as well.** Client-side checks stop a person choosing a
weak password, which is what they are for, but they do nothing about a caller who
talks to the Firebase Authentication REST API directly. The project's own
password policy is the control that does, and until 4 September 2026 it was not
doing it: enforcement mode was **Notify** — sign-up allowed to proceed with a
non-compliant password — every character requirement was unchecked, and the
minimum length was **6**. In other words the server was weaker than all four
clients, and the client rule was advisory to anyone willing to skip the client.

Read from the Firebase console on 4 September 2026, and set there the same day:

| Setting | Value |
|---|---|
| Enforcement mode | **Require** — a non-compliant sign-up fails |
| Minimum password length | **8** |
| Maximum password length | 4096 |
| Require numeric character | **Yes** |
| Require uppercase / lowercase / special character | No |
| Force upgrade on sign-in | **No** |

Two of those are deliberate and worth saying out loud.

*Force upgrade on sign-in is off.* Turning it on would make every existing
customer change their password the next time they sign in — a decision about
people's Monday morning, not a security setting to flip while tidying a policy.
The new rules apply to new passwords and password changes.

*The console cannot express "a letter".* Firebase offers uppercase, lowercase,
numeric and special; there is no plain letter option, and requiring lowercase
would reject `ABCD1234`, which §3 accepts. So the server floor is 8 characters
and a digit, and the letter requirement stays with the clients — which are
stricter, never looser, so nobody meets a rule in the app that the server then
disagrees with. The residual gap is an all-digit eight-character password created
by calling the REST API directly, and it is written down here rather than rounded
off.

## 4. Account protection beyond the password

- **Email verification** is required. An unverified email account reaches a
  verification gate rather than the workspace.
- **Invitations are bound to an address.** The invitation token is never stored;
  its SHA-256 is the document id, and only the address the invitation was sent to
  can accept it.
- **Sign-out clears the device.** Push tokens, cached workspace layout, and local
  caches are removed, so a signed-out device stops being a copy of the workspace.
- **Removing a member takes effect on their next request.** There is no cached
  grant to expire.
- **Firebase Authentication's own protections** apply throughout: rate limiting
  on sign-in attempts, and detection of credentials known to be breached where
  the project's settings enable it.

## 5. Multi-factor authentication for people who use NivaDesk

Today, a second factor is available to any account signing in with Google or
Apple, through those providers, and NivaDesk honours it: an account protected by
Google's second factor is protected by it when signing in to NivaDesk.

For email-and-password accounts, NivaDesk does not yet offer a second factor of
its own. What stands in the way is smaller than it was assumed to be: the project
already runs **Authentication with Identity Platform** (confirmed in the Firebase
console, 4 September 2026), so the platform-side capability is present and the
remaining work is the enrolment and challenge flow in four clients. It is on the
roadmap and is not claimed here as present.

Until it is offered, the position stated to customers is plain: an account that
needs a second factor should sign in with Google or Apple, where one is
available today.

## 6. Multi-factor authentication for people who run NivaDesk

**Mandatory, without exception.**

The requirements below are stricter than §3 on purpose. §3 governs a jeweller
signing in to their own workspace; this governs an account that can reach every
workspace, and the two should not carry the same rules.

Every operator account — the Firebase and Google Cloud projects, Secret Manager,
the source repository, the domain registrar and DNS — must use a password that
is:

- at least **12 characters** long;
- contains at least one **special character**;
- **unique to that service**, never reused from another account;
- generated and held in a password manager rather than remembered;
- **rotated at least every 365 days**, and immediately on any suspicion of
  compromise or when anyone with access leaves.

And:

- Every Google account with access to the Firebase project, the Google Cloud
  project, or Secret Manager must have two-factor authentication enabled.
- Every account with write access to the source repository must have two-factor
  authentication enabled.
- The domain registrar and DNS account must have two-factor authentication
  enabled.
- An administrative account found without it is **removed from the project**, not
  warned. Removing it takes seconds; the exposure it represents does not expire.
- Administrative access is never shared between people, and never granted to a
  contractor for a single task without being removed when that task ends.
- Recovery codes are stored offline, not in the same password manager as the
  account they recover.

## 7. Review

This policy is reviewed **every six months**, alongside the incident response
plan and the access control policy, and additionally whenever a new sign-in
method is added or the set of operators changes.

Each review confirms:

1. That the four mirrors of §3 still agree — the suite proves this on every run,
   and the review confirms the suite still contains the check.
2. That the Firebase console password policy still matches the table in §3 —
   read from the console, not from this page.
3. That every account listed in §6 still has two-factor authentication, and that
   each password meets §6's length, character and age requirements — checked
   account by account rather than assumed. An account whose password is older
   than 365 days is rotated during the review, not noted for later.
4. Whether Identity Platform and a second factor for email accounts (§5) are
   still deferred, and why.

| Review date | Carried out by | Console policy | Operator accounts audited | Changes made |
|---|---|---|---|---|
| 4 September 2026 | Gunes Gocmen | **Confirmed and corrected** — was Notify / no requirements / minimum 6; now Require / numeric / minimum 8 | **In progress, NOT passed** — see §8: the owner's password was rotated 4 Sep 2026; still outstanding are Hostinger two-factor, GitHub, Cloudflare and the unidentified second GCP account | Initial version; Android brought into line with the other three clients; §6 given explicit length, character and rotation requirements; server-side policy enabled |
| *4 March 2027 (due)* | | | | |

## 8. Outstanding: the operator account audit

§6 states what operator accounts must do. Nobody has yet checked, account by
account, that they do it — and a policy nobody has audited is a claim, not a
control. Until the audit below is complete and recorded here, NivaDesk answers
**No** to any questionnaire asking whether it enforces a 12-character,
special-character, MFA-protected, annually-rotated password policy. The document
existing is not the same as the accounts complying, and answering Yes on the
strength of the document would be the exact failure this policy is meant to
prevent.

The audit covers every account that can reach production or Amazon Information.
First pass carried out 4 September 2026, read-only, from the browser and the
CLI. Nothing was changed.

| # | Account | System | Privileged access | MFA | 12+ chars | Special char | Age < 365d | Annual rotation | Result |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `contact@eggcraft.co.uk` | Google / Firebase / GCP | Owner on `eggcraft-studio` + 2 more roles | **Yes** — 2SV since 3 Jun, 2 passkeys, recovery phone and email set | **Attested** — generated in a password manager to the §6 standard on 4 Sep 2026; Google never displays length | **Attested** — same, and not displayable | **Yes — changed 4 September 2026 17:34**, confirmed in the account's own security event log (was 934 days) | **Attested** — first rotation done; the next is due 4 Sep 2027 and is recorded in §7 | Length and character class are attestations, not readings — see the note below |
| 2 | `contact@eggcraft.co.uk` (billing name: Ecem Okumus) | Hostinger | Production web hosting; DNS for `nivadesk.co.uk` and `eggcraft.co.uk` | **Yes** — enabled 4 Sep 2026, reads back as "Etkin" | **Attested** — generated in a password manager to the §6 standard on 4 Sep 2026; Hostinger never displays length | **Attested** — same, and not displayable | **Yes — password set 4 Sep 2026** (the account had none before) | **Attested** — first rotation is this one; next due 4 Sep 2027 | Rebuilt on 4 Sep 2026: account email moved from `eggcraftco@gmail.com` to the company address, a password of its own was set, a recovery email was added, and the Google login was disconnected. Length and character class are attestations, not readings — the same limit as row 1 |
| 3 | `eggcraftco` | GitHub | Admin on `eggcraftco/studioflow` (the production publish repo); sole collaborator; no organisation | Unverified — the CLI token lacks the `user` scope and the browser is not signed in | Unverified | Unverified | Unverified | Unverified | **Verify 2FA in the browser** |
| 4 | Cloudflare account | Cloudflare | Nameservers for `nivadesk.app`; Worker and SaaS routing | Unverified — not signed in; the login page names `contact@eggcraft.co.uk` as last used | Unverified | Unverified | Unverified | Unverified | **Sign in and verify** |
| 5 | The second GCP human account | Google Cloud IAM | Unknown — Firebase reports "1 additional user has access to Firebase and/or Google Cloud resources" | Unverified | Unverified | Unverified | Unverified | Unverified | **Identify it.** It is none of the three Google accounts signed into this browser: `gunes.gocmen@gmail.com` and `ecem.okm@gmail.com` were both tested against the project and refused, and `contact@eggcraft.co.uk` is the one Firebase already lists. Only the Cloud console IAM screen can name it, and that screen requires a passkey only the account holder can present |
| 6 | `gunes.gocmen@gmail.com` | Google | **None found.** Refused by the Firebase project; not the GitHub account (`eggcraftco`); not the Hostinger account (`eggcraftco@gmail.com`) | Yes — 2SV since 18 Apr 2023, 1 passkey | n/a | n/a | n/a | n/a | **Not privileged / Out of scope** — revisit only if it turns out to hold Cloudflare access, which is still unverified |
| 8 | `eggcraftco@gmail.com` | Google | **None any more.** It was the sole credential behind row 2 until 4 Sep 2026, when the Google login was disconnected from the Hostinger account and replaced with a password of its own | n/a | n/a | n/a | n/a | n/a | **Out of scope** — it no longer opens anything in production. It stays in this table as the record of a dependency that was removed rather than verified |
| 7 | `ecem.okm@gmail.com` (Ecem Okumus) | Google | **None found on GCP** — refused by the Firebase project. The same person holds row 2's Hostinger account under a different address (`eggcraftco@gmail.com`), and that access is real | Unverified | n/a | n/a | n/a | n/a | **Out of scope as a Google account.** The privilege sits on row 2, not here |

Notes that matter more than the cells:

- **Google never shows a password's length or whether it contains a special
  character.** No interface anywhere exposes it, so for a Google account those
  two columns can never be *read* — only attested. This document distinguishes
  the two words on purpose: **verified** means an interface was read and said
  so; **attested** means the account holder performed a stated action on a
  stated date and recorded it here. Row 1's length and special character are
  attested. Writing "verified" there would be claiming a reading that does not
  exist, and the difference is exactly what a reviewer is entitled to know.
- Rotation has no technical enforcement on any of these systems, so "annual
  rotation" is a practice with a recorded date rather than a setting that can
  be inspected. The date is in §7 and the next one is due twelve months after
  it. A missed rotation shows up as a stale date in this table, which is the
  only mechanism there is.
- Row 2 is the finding this audit existed to produce. When the audit opened,
  the account holding production hosting and the DNS for two of the three
  domains had two-factor **off**, no password of its own, a personal Gmail
  address as its identity, and a Google social login as its only credential —
  a login nobody had ever inspected. On 4 September 2026 all four were changed:
  two-factor on, a password set, the account moved to the company address, and
  the Google login disconnected.
- That last change is why row 8 is now out of scope rather than verified. The
  dependency was not checked and found safe; it was removed. Those are
  different outcomes and the table says which one happened.
- A recovery email is now set. The earlier note here recorded the opposite —
  that a lost authenticator had no second route into production hosting — and
  it no longer applies.
- Row 1 no longer fails on age. The password was rotated on 4 September 2026 at
  17:34 and the account's own security event log records the change, which is
  the closest thing to independent evidence the interface offers.
- Three Google accounts are signed into the operator's browser:
  `contact@eggcraft.co.uk`, `gunes.gocmen@gmail.com` and `ecem.okm@gmail.com`.
  Each was tested against the Firebase project directly rather than reasoned
  about: only the first has access. That is how rows 6 and 7 were settled, and
  it is also what proves the second GCP account is somebody not signed in here.
- There is no password expiry mechanism on any of these systems. "Annual
  rotation" is therefore a practice to perform and record, not a setting to
  read — which is why the column asks for evidence of rotation rather than for
  a policy toggle.

Rules for filling it in:

- An account that fails any column is **fixed before the row is marked**, not
  noted as an exception. Rotating a password takes minutes.
- An account nobody can account for is **removed**, not investigated.
- Row #2 requires actually listing project IAM members rather than assuming
  there is only one — the point of an audit is to find the account nobody
  remembered.
- The result is recorded in the §7 table, and only then does the questionnaire
  answer change.
| *4 March 2027 (due)* | | | | |
