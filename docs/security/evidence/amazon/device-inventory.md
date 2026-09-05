# Device inventory — privileged endpoints (control 4)

Written 2026-09-05 20:45 UTC from live readbacks (`mdatp health`, `profiles status`,
`fdesetup status`, `socketfilterfw`), the Intune device record and the Defender portal
device inventory. Re-confirmed quarterly and re-captured within the 30 days before the
Amazon application. No personal data: the device name is the hostname Intune shows,
the serial is the corporate device identifier Intune enrols against.

| Device | Serial | Management | EDR / anti-malware | Agent / engine | Definitions | Scans | Tamper protection | Compliance evidence | Status |
|---|---|---|---|---|---|---|---|---|---|
| MacBook Pro `Guness-MacBook-Pro` (Mac17,8, macOS 26.6.2 build 25G83) | `MC9RPHGVXK` | Intune, MDM enrolment **Yes (User Approved)**, ownership **Corporate** (serial pre-registered), Intune device id `9fecc52b-9fc5-493a-bc44-4f6eb73dda93`, last check-in 2026-09-05 20:42 UTC | Microsoft Defender for Endpoint (Defender for Business), onboarded 2026-09-05 20:31 UTC, org id `92b27c7b-6c5c-4b81-a503-62e31be1d4cd`, machine id `919af725…`, tag `GROUP=amazon-scope`, `managed_by: MDM`, real-time protection on (endpoint security extension), network protection block, cloud protection on, sample submission off | app 101.26062.0012 / engine 1.1.26060.12000, release ring Production; agent updates via Microsoft AutoUpdate (channel Current, automatic download and install, check every 12 h) | 1.459.66.0, `up_to_date`, updated 2026-09-05 19:41 UTC (automatic, daily) | on-access + policy-scheduled: weekly **full** Sunday 03:00, daily **quick** 12:00 (low priority, runs even when busy); first scheduled run: quick 2026-09-06 12:00, full 2026-09-07 03:00; on-demand quick scan 2026-09-05 20:43 UTC: 7,789 files, 0 threats | **block** `[managed]` (Intune AV policy); system extensions non-removable; MDM profile removal blocked by the hardening profile | FileVault **On** (key escrowed to Intune); firewall **on + stealth**; Gatekeeper on; screen lock: ask for password immediately, inactivity ceiling 15 min (compliance policy, changed from 5 min on 2026-09-05 23:05 UTC; CIS ≤ 20 min); OS updates automatic (download + install + security responses, managed); Intune compliance **Compliant** | **In scope — protected** (the only device used for Amazon SP-API administrative work) |
| Mac Studio (second workstation) | n/a | not enrolled | — | — | — | — | — | — | **Out of scope (decision 2026-09-05)**: not used for Amazon SP-API administrative systems, the `nivadesk-amazon` project, Seller Central or Amazon Information from this date; must be enrolled under the same baseline before any such use |
| Operator's phone | n/a | not enrolled | — | — | — | — | — | — | **Out of scope (decision 2026-09-05)**: used only for MFA / authentication (Microsoft MFA, Google 2-step); no Amazon, SP-API or administrative data access from the phone |
| Amazon zone servers (Cloud Run gen2) | n/a | Google-managed serverless | Google's under the shared-responsibility model; runtime detection = Cloud Run Threat Detection (control 3) | n/a | n/a | n/a | n/a | n/a | covered by control 3 |

**Scope decision (2026-09-05, operator):** MacBook Pro = In Scope; Mac Studio = Out of Scope (no Amazon / `nivadesk-amazon` / Seller Central / Amazon Information use from this date); phone = Out of Scope, authentication only. The policy text is `docs/security/access-control-policy.md` §6.1.

Consoles: Intune (`intune.microsoft.com`, tenant `eggcraft.onmicrosoft.com`) and the
Defender portal (`security.microsoft.com`, UK data location). Policies enforced on the
MacBook Pro: `macOS - Amazon endpoint baseline` (compliance), `macOS - Amazon device
hardening`, `macOS - Defender AV baseline`, `macOS - Defender EDR onboarding`, `macOS -
Defender onboarding (portal package)`, four Defender permission profiles, `macOS -
Defender system extensions`, `macOS - Microsoft AutoUpdate (MAU)` — settings in
`docs/security/edr-intune-policy-spec.md`.
