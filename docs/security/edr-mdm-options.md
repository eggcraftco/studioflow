# EDR / MDM for the two operator devices — options and a recommendation (2026-09-05)

Scope: the devices in `amazon-readiness-criteria.md` §4a — the operator's
MacBook Pro (in scope), the Mac Studio (in scope unless it never signs in to
the Amazon project — to confirm), and the operator's phone (Google sign-in
holder). Amazon's criterion: current anti-malware the user cannot disable,
updated at least monthly, on-access plus scheduled scans, under management,
with evidence.

Prices are list prices found on 2026-09-05 (sources at the end); the vendors
change them, so treat them as ±20 %.

| | Microsoft 365 Business Premium (Intune + Defender for Business) | Jamf Now/Pro + Jamf Protect | Kandji (Iru) MDM + EDR | Mosyle Fuse |
|---|---|---|---|---|
| Covers macOS **and** iOS in one console | yes (Intune manages both; Defender for Business on macOS, Defender for Endpoint on iOS) | yes for MDM; Jamf Protect is macOS — iOS needs a separate Jamf product | yes for MDM; the EDR is macOS-only | MDM both; the Fuse security layer is macOS antivirus, not a full EDR |
| Managed AV/EDR with tamper protection the user cannot switch off | yes — Defender tamper protection enforced by Intune policy | yes — Jamf Protect with the removal profile locked by MDM | yes — Kandji EDR, agent protected by the MDM profile | partial — antivirus with scheduled and real-time scan; weaker tamper story |
| Scheduled weekly full scan plus real-time | yes | yes | yes | yes |
| Automatic definition/engine updates | yes, daily by default | yes | yes | yes |
| Evidence Amazon can read | strongest: Defender portal device list with health, tamper state, definitions age, scan history; Intune compliance report per device; both exportable | good: Jamf Protect console plus Jamf compliance report | good: Kandji device status plus EDR dashboard | weakest: basic reports |
| Cost for one operator (list, monthly) | **$22/user/month** annual ($26.40 month-to-month); one licence covers the user's Macs and phone (up to 5 + 5) | Jamf Now $2–4/device + Jamf Protect $3–8/Mac ≈ **$7–12/month for 2 Macs**, phone MDM extra | MDM $3.20 + EDR $2.40 per device ≈ **$6/Mac/month**, but sold as an annual contract with a minimum a one-person company will not reach without sales | $1–3/device/month with a **30-licence minimum** on paid tiers |
| Setup effort for one person | moderate: Apple Business Manager enrolment, Intune Company Portal, Defender onboarding profile — about an afternoon; a Microsoft tenant is created | low for MDM, moderate for Protect; Apple-native | low, but the commercial minimum is the obstacle | lowest, but the minimum and the weaker EDR |
| Fit with the existing accounts | Google Workspace stays the identity; the Microsoft tenant is only for device management | Apple-only stack, no new identity provider | same | same |

**Recommendation for the morning: Microsoft 365 Business Premium, one
licence.** It is the only option that gives macOS and iOS together, a real
EDR with enforced tamper protection, and the best evidence exports for one
user at a fixed **$22/month**, with no device minimum and no sales call.
Jamf Now + Jamf Protect is the Apple-native runner-up at roughly the same
money for two Macs but leaves the phone as a separate product; Kandji and
Mosyle fail on commercial minimums for a one-person company.

What the operator would do (nothing is installed by the assistant):

1. Buy one Business Premium licence; create the tenant with the operator's
   work identity.
2. Apple Business Manager: enrol the Mac(s) and the phone, link to Intune.
3. Intune: compliance policy (FileVault, screen lock, OS updates), Defender
   for Business onboarding profile, tamper protection on, weekly full scan,
   real-time protection on, definitions older than 7 days = non-compliant.
4. After a week: export the Defender device report and the Intune compliance
   report; take the screenshots for the five pack files named in §4a.

Sources: [Microsoft 365 Business Premium](https://www.microsoft.com/en-us/microsoft-365/business/microsoft-365-business-premium),
[Microsoft 365 pricing update July 2026](https://blog.teamascend.com/blog/microsoft-365-pricing-updates-start-july-1-2026),
[Jamf Now review 2026](https://www.digitnaut.com/2026/04/jamf-now-review-2026-pricing-features.html),
[Jamf pricing 2026](https://superops.com/blog/jamf-pro-pricing),
[Kandji pricing 2026](https://superops.com/blog/kandji-pricing),
[Mosyle pricing 2026](https://costbench.com/software/mdm/mosyle/).

## Decision and setup plan (2026-09-05, decision: Microsoft 365 Business Premium)

**Who and what is in scope** — every person and device that can reach
Amazon Information, SP-API credentials, or the administration of the zone:

| Principal / device | Access | Scope |
|---|---|---|
| `contact@eggcraft.co.uk` (the operator; the only human) | Owner of `nivadesk-amazon`, organisation admin, Amazon Seller Central / SP-API application owner | in scope |
| MacBook Pro `Guness-MacBook-Pro` | signed-in `gcloud`, Google Cloud console sessions, the repository, deploys | **in scope** |
| Mac Studio | second workstation. Rule: if it holds any of the above — a `gcloud` login, a console session, the repository with deploy access, Seller Central — it is **in scope**; if it holds none, it is documented as **out of scope** with that statement. Until the operator confirms, it is treated as in scope (fail closed). | to confirm |
| Operator's phone | Google account sessions (console app, 2-step verification), Seller Central app if installed | in scope |
| Any future person or device | added here before being given access | — |

**Steps** — `[operator]` marks what only the operator can do (purchase,
sign-in, enrolment, consent); everything else is preparation the assistant
can draft.

1. `[operator]` Buy one Microsoft 365 Business Premium licence; create the
   tenant with the work identity; keep Google Workspace as the identity
   provider (the Microsoft tenant is for device management only).
2. `[operator]` Apple Business Manager: create/confirm the organisation
   account; add the Mac(s) and the phone (Apple Configurator or manual
   enrolment for existing devices).
3. `[operator]` Intune: link Apple Business Manager (MDM push certificate,
   automated device enrolment token); enrol the devices.
4. Intune policies — the assistant drafts the exact settings, the operator
   applies them: compliance (FileVault/encryption on, screen lock ≤ 5 min,
   firewall on, minimum OS version, jailbreak/root = non-compliant);
   Defender for Business onboarding profile; **tamper protection on**;
   real-time protection on; **weekly full scan** (scheduled); cloud-delivered
   protection and automatic definition updates; definitions older than
   **7 days → non-compliant**; a compliance-based action that blocks a
   non-compliant device's Microsoft sign-in (and the documented manual step of
   revoking Google sessions for such a device).
5. `[operator]` After one week: export the Defender device list and health,
   the tamper-protection setting, the definitions date and last scan, and the
   Intune compliance report; take the five screenshots/exports named in
   `amazon-readiness-criteria.md` §4a into `docs/security/evidence/amazon/`.
6. Update `access-control-policy.md`'s device inventory (serials, agent
   version, last scan) and set control 4 to `Passed` only once those files
   exist.

Estimated cost: $22/month (annual) for the one licence; no additional device
fees for up to 5 Macs/PCs and 5 phones.

## Operator runbook — Microsoft 365 Business Premium onboarding (ready to execute)

Everything below is done by the operator, in this order; the assistant
prepares texts and checks results but changes nothing on a device. Expect
about half a day end to end, spread over a week for the evidence.

**A. Tenant and licence (30 min)**
1. Sign up for Microsoft 365 Business Premium at microsoft.com with the work
   address; choose annual billing ($22/user/month); 1 licence.
2. Create the tenant admin account (a dedicated `admin@…onmicrosoft.com`
   identity, not the daily account); assign the Business Premium licence to
   the operator's user.
3. Turn on **multi-factor authentication** for both accounts (Microsoft
   Authenticator); write the recovery codes into the password manager.
4. Decline anything not needed (Exchange mailboxes, Teams rollout) — Google
   Workspace stays the identity and mail provider; nothing changes there.

**B. Apple Business Manager (ABM) (30–60 min; Apple may take a day to verify)**
5. Enrol at business.apple.com with the company's D-U-N-S; verification by
   Apple.
6. Add existing devices: the Mac(s) with Apple Configurator for iPhone
   (adds a Mac to ABM during a fresh setup) — or, for devices that will not be
   wiped, profile-based enrolment through Intune Company Portal in step 9.
7. In ABM → Preferences → MDM servers: add Intune (upload the public key
   Intune gives you in step 8, download the server token).

**C. Intune (Microsoft Intune admin center) (45 min)**
8. Devices → Enrollment → Apple: create the **Apple MDM push certificate**
   (Apple ID: a company one, not personal), then add the **Automated Device
   Enrollment** token from step 7.
9. Enrol the MacBook Pro (and the Mac Studio while it is in scope): install
   **Company Portal** on the Mac, sign in with the licensed user, approve the
   management profile in System Settings → Privacy & Security → Profiles.
10. Enrol the phone: Company Portal from the App Store, sign in, allow the
    management profile.

**D. Defender for Business onboarding and policies (45 min)**
11. Intune → Endpoint security → Endpoint detection and response: create the
    macOS **Defender onboarding** profile (Intune-managed) and assign it to
    all devices. Add the four required macOS configuration profiles Microsoft
    documents for Defender: **system extension** approval, **full disk
    access**, **network filter** (network protection), **background service**
    — without these macOS blocks the agent silently.
12. On each Mac after the profiles arrive: open System Settings → Privacy &
    Security and confirm the Defender extension and full-disk access are
    **approved by MDM** (no manual toggles should remain).
13. Endpoint security → Antivirus (macOS): real-time protection on,
    cloud-delivered protection on, automatic sample submission off,
    **tamper protection on**, definitions/engine automatic updates,
    **weekly full scan** (scheduled), threat severity actions = block.
14. Devices → Compliance policies (macOS and iOS): FileVault/encryption on,
    password with 6+ characters and screen lock ≤ 5 min, firewall on,
    minimum OS version (current − 1), jailbroken/rooted = non-compliant,
    Defender machine risk score ≤ medium; action for non-compliance: mark
    non-compliant immediately and email the operator.
15. Devices → Configuration: OS update policy (install within 14 days),
    FileVault enforcement with escrowed recovery key.

**E. Evidence (after one week of running)**
16. Defender portal (security.microsoft.com) → Assets → Devices: screenshot
    the device list with health, sensor, and definition state
    (`edr-console-devices.png`); open one device → screenshot the
    definitions/engine date (`edr-definitions-date.png`); Endpoint security →
    Antivirus → screenshot tamper protection = on (`edr-tamper-protection.png`).
17. Intune → Reports → Device compliance: export (`mdm-policy-export.pdf`,
    together with the assigned profiles list).
18. Fill `device-inventory.md` (device, serial, user, enrolment date, agent
    version, last full scan, compliance state) and copy the five files into
    `docs/security/evidence/amazon/`; then re-run `infra/amazon/evidence.sh`
    and set control 4 to `Passed`.

Mac Studio: **In Scope** until the operator confirms it holds no gcloud
login, console session, repository with deploy access or Seller Central
session; if confirmed, it is recorded as out of scope with that statement
and skipped in steps 9 and 12.

## Decision update (2026-09-05, operator)

- **Plan**: Microsoft 365 Business Premium **(no Teams)**, 1 user, annual term,
  no Copilot/Teams/other add-ons. Organisation name `EGGcraft Ltd`. Tenant on
  `*.onmicrosoft.com`; the `eggcraft.co.uk` mail/DNS/MX stays with Google
  Workspace and is not touched in this phase.
- **No Apple Business Manager.** Section B above is superseded: the MacBook Pro
  is enrolled with **Company Portal user-approved enrolment** (Intune still
  needs the Apple MDM push certificate — operator's Apple ID at
  identity.apple.com) and Defender for Business is installed with the
  **local onboarding package**; the Intune enrolment is verified afterwards so
  the device shows as Intune-managed and Compliant.
- **Scope of this phase**: only this MacBook Pro. Mac Studio stays In Scope
  (fail closed) and is onboarded separately; the phone later.
- **ESET**: not installed on this MacBook Pro (checked 2026-09-05: no app,
  package receipt, daemon, extension or process). The "keep ESET until
  Defender is verified, then ask before removal" rule applies to any device
  where ESET actually exists (Mac Studio, to check).
- Running record: `docs/security/evidence/amazon/edr-onboarding-2026-09-05.md`.
