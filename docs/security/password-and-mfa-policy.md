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
| 4 September 2026 | Gunes Gocmen | **Confirmed and corrected** — was Notify / no requirements / minimum 6; now Require / numeric / minimum 8 | **First pass done, NOT passed** — see §8: one account 19 months overdue, one with two-factor off, four unverified | Initial version; Android brought into line with the other three clients; §6 given explicit length, character and rotation requirements; server-side policy enabled |
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
| 1 | `contact@eggcraft.co.uk` | Google / Firebase / GCP | Owner on `eggcraft-studio` + 2 more roles | **Yes** — 2SV since 3 Jun, 2 passkeys, recovery phone and email set | Unverified — Google does not show it | Unverified — Google does not show it | **No — last changed 13 February 2024 (19 months)** | **No** | **Rotate the password** |
| 2 | `eggcraftco@gmail.com` (account holder: Ecem Okumus) | Hostinger | Production web hosting; DNS for `nivadesk.co.uk` and `eggcraft.co.uk`; GitHub `eggcraftco` linked | **No — two-factor is off** | n/a — no Hostinger password is set; sign-in is Google social login | n/a | n/a | n/a | **Enable two-factor. Confirm the linked Google account's own security, which is the only factor today** |
| 3 | `eggcraftco` | GitHub | Admin on `eggcraftco/studioflow` (the production publish repo); sole collaborator; no organisation | Unverified — the CLI token lacks the `user` scope and the browser is not signed in | Unverified | Unverified | Unverified | Unverified | **Verify 2FA in the browser** |
| 4 | Cloudflare account | Cloudflare | Nameservers for `nivadesk.app`; Worker and SaaS routing | Unverified — not signed in; the login page names `contact@eggcraft.co.uk` as last used | Unverified | Unverified | Unverified | Unverified | **Sign in and verify** |
| 5 | The second GCP human account | Google Cloud IAM | Unknown — Firebase reports "1 additional user has access to Firebase and/or Google Cloud resources" | Unverified | Unverified | Unverified | Unverified | Unverified | **Identify it. The Cloud console requires a passkey that only the account holder can present** |
| 6 | `gunes.gocmen@gmail.com` | Google | No project access observed; it is the browser's default account | Yes — 2SV since 18 Apr 2023, 1 passkey | Unverified | Unverified | Unverified — password last changed 25 January, year not shown | Unverified | **Confirm whether it holds any production access at all** |

Notes that matter more than the cells:

- **Google never shows a password's length or whether it contains a special
  character.** Those columns cannot be filled from a browser for any Google
  account, and they are recorded as unverified rather than assumed. Anything
  else would be inventing a control.
- Row 2 is the finding this audit existed to produce. The account that holds
  production hosting and two of the three domains is in a second person's name,
  has two-factor **off**, has no password of its own, and is linked to the
  GitHub account with admin on the publish repo. Its only factor today is
  whatever protects `eggcraftco@gmail.com` at Google, which is not signed in
  here and therefore not verified.
- Row 1 fails on age alone. Nineteen months is not within 365 days, and no
  further verification can change that.
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
