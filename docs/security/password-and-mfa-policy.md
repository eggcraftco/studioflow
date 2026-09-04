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

**The honest limit.** These are client-side checks. They stop a person choosing a
weak password, which is what they are for. They do not stop a caller who talks to
the Firebase Authentication REST API directly. The control that does is the
project's own password policy in the **Firebase console**
(Authentication → Settings → Password policy), which enforces a minimum length
and required character types server-side, for every client and every direct API
call. Confirming that this is enabled, and that its settings match §3, is a
standing item at each review of this document (§7).

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
its own. Adding it means enabling Google Cloud Identity Platform on the project
and building the enrolment and challenge flow into four clients. It is on the
roadmap and is not claimed here as present.

Until it is offered, the position stated to customers is plain: an account that
needs a second factor should sign in with Google or Apple, where one is
available today.

## 6. Multi-factor authentication for people who run NivaDesk

**Mandatory, without exception.**

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
2. That the Firebase console password policy is enabled and matches §3.
3. That every account listed in §6 still has two-factor authentication, checked
   account by account rather than assumed.
4. Whether Identity Platform and a second factor for email accounts (§5) are
   still deferred, and why.

| Review date | Carried out by | Console policy confirmed | Operator 2FA confirmed | Changes made |
|---|---|---|---|---|
| 4 September 2026 | Görkem Öçmen | Pending — to confirm in the Firebase console | Yes | Initial version; Android brought into line with the other three clients |
| *4 March 2027 (due)* | | | | |
