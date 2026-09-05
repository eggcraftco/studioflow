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
