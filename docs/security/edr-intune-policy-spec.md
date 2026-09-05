# Intune / Defender for Business policy specification for the Amazon endpoint scope

Written 2026-09-05 for tenant `eggcraft.onmicrosoft.com` (organisation
EGGCRAFT LIMITED). Every object below is created in the Intune admin center or
the Defender portal by the assistant with the operator watching; the
operator does the steps that need an Apple ID, a password, a consent tick or a
click on the Mac. Status column is kept current as the work lands.

Assignment model: one device today, so every policy is assigned to
**All devices** (and compliance to **All users**); no dynamic groups yet. When
the Mac Studio or the phone is onboarded, the same assignments cover them.

## 1. Enrolment prerequisites

| # | Object | Setting | Who | Status |
|---|---|---|---|---|
| 1.1 | Apple MDM push certificate | consent tick → download CSR → identity.apple.com/pushcert with a company-controlled Apple ID → upload `.pem`; renew yearly with the **same** Apple ID (write it in the password manager) | operator | **Active, expires 2026-09-05+1y** |
| 1.2 | Corporate device identifiers | add this Mac's serial so it enrols as **corporate-owned** | assistant | done |
| 1.3 | Enrollment restrictions (macOS) | allow macOS; block personally-owned (identifier list makes ours corporate) | assistant | pending |
| 1.4 | Defender ↔ Intune connector | Intune → Endpoint security → Microsoft Defender for Endpoint: connection Available, enforce Endpoint Security configurations = On. There is **no macOS compliance-evaluation toggle** (Windows/Android/iOS only), so the risk-score compliance rule in §2 does not apply to macOS | assistant | done |

## 2. Compliance policy — `macOS – Amazon endpoint baseline`

| Area | Setting | Value |
|---|---|---|
| Device properties | Minimum OS version | 26.0 (device runs 26.6.2; raise as Apple ships) |
| System security | Require a password to unlock | Required |
| | Simple passwords | Block |
| | Minimum password length | 8 |
| | Maximum minutes of inactivity before password is required | 5 |
| | Require encryption of data storage (FileVault) | Required |
| | Firewall | Enabled; block all incoming = not required; stealth mode = Enabled |
| | Gatekeeper | Mac App Store and identified developers |
| | System Integrity Protection | Required |
| Microsoft Defender for Endpoint | Require the device to be at or under the machine risk score | not available for macOS in Intune (dropped) |
| Actions for noncompliance | Mark device noncompliant | Immediately |
| | Send email to end user | deferred — needs a notification message template first |

## 3. Configuration profiles

| # | Profile (type) | Settings | Status |
|---|---|---|---|
| 3.1 | `macOS – FileVault` (Settings catalog › Full Disk Encryption › FileVault) | Enable = On; Defer = true (enable at next logout if ever off); Show recovery key = false; Personal recovery key escrow → Intune; Use recovery key = true; Defer force at user login max bypass attempts = 0 | **created 2026-09-05** (one profile `macOS - Amazon device hardening` holds 3.1–3.5) |
| 3.2 | `macOS – Firewall` (Settings catalog › Networking › Firewall) | EnableFirewall = true; EnableStealthMode = true; BlockAllIncoming = false; AllowSigned = true | pending |
| 3.3 | `macOS – Software updates` (Settings catalog › System Configuration › Software Update) | Automatic check = true; Automatic download = true; Automatically install macOS updates = true; Config data (XProtect) install = true; Critical update install = true; Restrict software update require admin = true | pending |
| 3.4 | `macOS – Screen lock` (Settings catalog › User Experience › Screensaver + Login Window) | Login window idle time = 300 s; user screensaver idle time = 300 s; ask for password = true; ask for password delay = 0 | pending |
| 3.5 | `macOS – Defender system extensions` (Templates › Extensions) | allowed team identifier `UBF8T346G9`; allowed system extensions `com.microsoft.wdav.epsext`, `com.microsoft.wdav.netext` | pending |
| 3.6 | `macOS – Defender full disk access` (Custom, Microsoft template `fulldisk.mobileconfig`) | PPPC SystemPolicyAllFiles for `com.microsoft.wdav` and `com.microsoft.wdav.epsext` | created 2026-09-05 as `macOS - Defender full disk access` (custom, device channel, All devices) |
| 3.7 | `macOS – Defender network filter` (Custom, `netfilter.mobileconfig`) | content filter provider `com.microsoft.wdav.netext`, socket filter, MDM-approved | created 2026-09-05 as `macOS - Defender network filter` (custom, device channel, All devices) |
| 3.8 | `macOS – Defender background services` (Custom, `background_services.mobileconfig`) | managed login items for team `UBF8T346G9` | created 2026-09-05 as `macOS - Defender background services` (custom, device channel, All devices) |
| 3.9 | `macOS – Defender notifications` (Custom, `notif.mobileconfig`) | allow alerts from `com.microsoft.wdav.tray` and `com.microsoft.autoupdate2` | created 2026-09-05 as `macOS - Defender notifications` (custom, device channel, All devices) |
| 3.10 | `macOS – Defender accessibility / bluetooth` (optional templates) | only if device-control or accessibility features are used — **not planned** | skipped |

Template source: `github.com/microsoft/mdatp-xplat`, path
`macos/mobileconfig/profile-templates/` (Microsoft's official, unmodified
files; SHA-256 of each downloaded file is recorded in the evidence file).

## 4. Endpoint security policies

| # | Policy | Settings | Status |
|---|---|---|---|
| 4.1 | Endpoint detection and response › macOS › `macOS - Defender EDR onboarding` | onboarding through the connector; device tag `amazon-scope` | created 2026-09-05, All devices |
| 4.2 | Antivirus › macOS › `Microsoft Defender Antivirus` — `macOS – Defender AV baseline` | Real-time protection = enabled; Passive mode = disabled; Cloud-delivered protection = enabled; Cloud block level = high; Automatic sample submission = disabled (safe / no data leaves); Diagnostic data = required only; **Tamper protection = block**; Behavior monitoring = enabled; Network protection = block; Exclusions = none; Threat type settings: potentially unwanted apps = block; Enforcement level = real-time | created 2026-09-05 as `macOS - Defender AV baseline` (26 settings), All devices |
| 4.3 | Scheduled scan (Settings catalog › Microsoft Defender › Antivirus engine › Scheduled scan, or `com.microsoft.wdav` plist in the same catalog) | weekly **full** scan Sunday 03:00 (random start ± 30 min, low priority, run when idle = false so it runs even if busy) + daily **quick** scan 12:00; ignore exclusions = false | done 2026-09-05 — carried inside the AV policy (4.2): scheduled scan on, weekly full day 0 03:00, daily quick 12:00, low priority, not idle-only; device readback `[managed]` |
| 4.4 | Automatic updates of the agent (Microsoft AutoUpdate) | channel = Current; automatic download and install = true; update check every 12 h | created 2026-09-05 20:46 UTC as `macOS - Microsoft AutoUpdate (MAU)` (settings catalog: enable AutoUpdate = True, channel Current, check every 720 min, check-for-updates on), All devices |

## 5. Apps

| # | App | Assignment | Status |
|---|---|---|---|
| 5.1 | Apps › macOS › Add › **Microsoft Defender for Endpoint** (built-in app type) | Required → All devices | created 2026-09-05 |
| 5.2 | Company Portal | installer downloaded and signature-verified 2026-09-05; installation needs the operator (admin password) | installed and signed in by the operator 2026-09-05 ~19:40 UTC; MDM profile approved |

## 6. Verification on the Mac (all must hold before control 4 = Passed)

```
mdatp health --field healthy                 → true
mdatp health --field real_time_protection_enabled  → true
mdatp health --field tamper_protection       → block
mdatp health --field cloud_enabled           → true
mdatp health --field definitions_updated     → today's date (age < 24 h)
mdatp health --field licensed / org_id       → true / the tenant's org id
mdatp health --field managed_by             → "MDM"  (Intune-managed, not "local")
profiles status -type enrollment             → MDM enrollment: Yes (User Approved)
systemextensionsctl list                     → com.microsoft.wdav.epsext + netext [activated enabled]
fdesetup status                              → FileVault is On
socketfilterfw --getglobalstate              → enabled ; --getstealthmode → on
```

**Result 2026-09-05 20:32 UTC (MacBook Pro, after the portal onboarding package was
delivered through Intune):** every line above holds — healthy true, RTP true,
tamper_protection block, cloud_enabled true, definitions 1.459.66.0 updated 19:41 UTC
(up_to_date), licensed true / org_id set, managed_by MDM, MDM Yes (User Approved),
both system extensions activated enabled, FileVault On, firewall enabled + stealth on.
Intune = Compliant; Defender › Assets › Devices lists the Mac as onboarded (sensor
Active). The Defender health *reports* (sensor / antivirus) were still empty at 20:40 —
they fill in during the first hours after onboarding. Full readback in
`evidence/amazon/edr-onboarding-2026-09-05.md` §4.

Portal side: Intune › Devices › the Mac = **Compliant**; Defender › Assets ›
Devices = onboarded, sensor health = active, AV mode = active, definitions
up to date; Endpoint security › Antivirus report shows tamper protection on.
