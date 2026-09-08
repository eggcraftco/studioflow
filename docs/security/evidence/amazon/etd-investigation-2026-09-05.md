# Event Threat Detection — investigation record (2026-09-05)

> **CLOSED 8 September 2026 by Google Cloud Support, case 75151719.** The three runs below did
> everything right and could never have succeeded. Read §Closure at the end before the detail.

## Configuration read live at 2026-09-05T13:06:14Z

```
project: nivadesk-amazon (145308107004)
SCC tier (console readback 02:18 UTC): Premium, trial ending 5 Oct 2026; organisation: Standard
event-threat-detection: ENABLED ENABLED 2026-09-05T02:17:51Z
module MALWARE_BAD_DOMAIN = ENABLED
module MALWARE_BAD_IP = ENABLED
module CONFIGURABLE_BAD_DOMAIN = ENABLED
module SERVICE_ACCOUNT_SELF_INVESTIGATION = ENABLED
securitycenter API enabled: 1
SCC service agent role on the project: ['roles/securitycenter.serviceAgent']
Cloud DNS server policy: amazon-dns-logging True amazon-vpc
log sinks: _Default=True _Required= amazon-audit-sink= 
log bucket amazon-audit:  400
```

## Official VM-procedure runs (Malware: Bad Domain, etd-malware-trigger.goog)

| Run | VM | DNS queries logged (Cloud DNS, amazon-audit bucket) | _Default sink | Finding within 30 min |
|---|---|---|---|---|
| 1 — 03:13 UTC | amazon-etd-vm-test, 10.60.0.2 | 5 entries 03:13:38–03:14:38, vmInstanceName 145308107004.amazon-etd-vm-test, NOERROR | disabled (design) | none |
| 2 — 12:26 UTC (operator) | amazon-etd-vm-test, 10.60.0.3 | 5 entries 12:27:27–12:28:27, same identity, NOERROR | **enabled** for the test, then disabled again | none |
| 3 — 13:05 UTC | amazon-etd-vm-test, 10.60.0.4 | 5 entries 13:05:28–13:06:28, same identity, NOERROR | disabled (unchanged) | none by 13:38 |

Earlier, non-official attempt: Cloud Run job resolver 02:41 UTC (no VM identity in the DNS log) — none.

## DNS log entries as stored (proof they exist in the project's own bucket)

```
2026-09-05T13:05:58.752143124Z	etd-malware-trigger.goog.	10.60.0.4	145308107004.amazon-etd-vm-test	NOERROR	projects/nivadesk-amazon/logs/dns.googleapis.com%2Fdns_queries
2026-09-05T13:05:58.737088014Z	etd-malware-trigger.goog.	10.60.0.4	145308107004.amazon-etd-vm-test	NOERROR	projects/nivadesk-amazon/logs/dns.googleapis.com%2Fdns_queries
2026-09-05T13:05:28.731042752Z	etd-malware-trigger.goog.	10.60.0.4	145308107004.amazon-etd-vm-test	NOERROR	projects/nivadesk-amazon/logs/dns.googleapis.com%2Fdns_queries
2026-09-05T13:05:28.724532486Z	etd-malware-trigger.goog.	10.60.0.4	145308107004.amazon-etd-vm-test	NOERROR	projects/nivadesk-amazon/logs/dns.googleapis.com%2Fdns_queries
2026-09-05T12:28:27.756078492Z	etd-malware-trigger.goog.	10.60.0.3	145308107004.amazon-etd-vm-test	NOERROR	projects/nivadesk-amazon/logs/dns.googleapis.com%2Fdns_queries
2026-09-05T12:28:27.724600663Z	etd-malware-trigger.goog.	10.60.0.3	145308107004.amazon-etd-vm-test	NOERROR	projects/nivadesk-amazon/logs/dns.googleapis.com%2Fdns_queries
2026-09-05T12:27:57.702501610Z	etd-malware-trigger.goog.	10.60.0.3	145308107004.amazon-etd-vm-test	NOERROR	projects/nivadesk-amazon/logs/dns.googleapis.com%2Fdns_queries
2026-09-05T12:27:57.696499088Z	etd-malware-trigger.goog.	10.60.0.3	145308107004.amazon-etd-vm-test	NOERROR	projects/nivadesk-amazon/logs/dns.googleapis.com%2Fdns_queries
2026-09-05T12:27:27.693134780Z	etd-malware-trigger.goog.	10.60.0.3	145308107004.amazon-etd-vm-test	NOERROR	projects/nivadesk-amazon/logs/dns.googleapis.com%2Fdns_queries
2026-09-05T12:27:27.692064872Z	etd-malware-trigger.goog.	10.60.0.3	145308107004.amazon-etd-vm-test	NOERROR	projects/nivadesk-amazon/logs/dns.googleapis.com%2Fdns_queries
2026-09-05T03:14:38.517692621Z	etd-malware-trigger.goog.	10.60.0.2	145308107004.amazon-etd-vm-test	NOERROR	projects/nivadesk-amazon/logs/dns.googleapis.com%2Fdns_queries
2026-09-05T03:14:38.509049743Z	etd-malware-trigger.goog.	10.60.0.2	145308107004.amazon-etd-vm-test	NOERROR	projects/nivadesk-amazon/logs/dns.googleapis.com%2Fdns_queries
```

## Conclusion (13:38 UTC)

Three runs of Google's documented "Malware: Bad Domain" procedure — the last
two on a VM exactly as documented, with the Cloud DNS query logged under the
VM's identity, once with the `_Default` sink enabled and once with it
disabled — produced no finding, against a documented detection latency of
"generally less than 15 minutes". The detector service and the
`MALWARE_BAD_DOMAIN` module read effective ENABLED, the project's Security
Command Center service agent holds its role, the Event Threat Detection
source is registered for the project, and the only findings on the project
come from Cloud Armor and Compliance Manager. No further experiments: the
question goes to Google with this record (support case or the Premium
support channel). Suggested wording: *"Project-level Premium activation on
2026-09-05; Event Threat Detection effective ENABLED; Cloud DNS logging on
the VPC; the documented etd-malware-trigger.goog VM test run three times
(timestamps in this record) with the DNS queries visible in the project's
logs; no Malware: Bad Domain finding at project or organisation level. Is
the detector consuming this project's Cloud DNS logs, and if not, why?"*

## Final status (2026-09-05 21:45 UTC) — record closed

No "Malware: Bad Domain" finding has appeared at project or organisation
level up to 21:30 UTC (v2 findings list on the project: only the Cloud Armor
and Compliance Evaluation Service findings exist). Operator decision: **no
further test triggering**; this record is final and is the attachment for
the support case in `google-support-case-scc-detectors.md`. The test VM was
deleted after run 3 (`test-artifacts-cleanup-2026-09-05.md`); the DNS logging
policy and the detector configuration stay as they are, so a finding that
arrives later is delivered through the same notification config → Pub/Sub →
e-mail chain proven in `scc-finding-2026-09-05.md`.


---

## Closure — 8 September 2026, Google Cloud Support case 75151719

Google's engineer answered the question this record was written to ask, in writing and unambiguously.

**Why no finding could ever have appeared.** Security Command Center surfaces a finding according to
the tier of the resource it is **anchored to**. `Malware: Bad Domain` hits a **known issue on Google's
side** where it loses its project-level metadata, so the backend anchors it at the **organisation**
level instead. Our organisation is on **Standard**, which carries no entitlement to display a
Premium-tier ETD finding, so the finding is **dropped entirely** before it can reach our project view.

Google's conclusion, verbatim: *a project-only Premium deployment inside a Standard-tier organisation
cannot expose this promoted finding.*

**What that means for this record.** The three runs on 5 September were correctly executed against a
correctly configured detector, and the absence of a finding was never evidence of a fault. Specifically:

| | |
|---|---|
| Detector or configuration issue on our side | **Not indicated** |
| Project SCC pipeline | **Healthy** — Google's words, and independently proven here by a real Cloud Armor finding travelling the whole notification config → Pub/Sub → e-mail chain |
| The absence of a finding | **Explained** by tier and anchoring behaviour Google confirms |
| Further Bad Domain testing | **Do not perform.** No test can succeed; what withholds the finding is the entitlement, not the trigger |

**The wording matters and is deliberate.** This is **not observable in the current SCC tier topology**.
It is not "failed" and it is not "misconfigured" — nothing built here is wrong, and no change available
inside the project would alter the result. Making the finding observable would require Premium at the
**organisation** level, which is a purchasing decision, not a remediation.

The DNS logging policy and the detector configuration stay exactly as they are. If Google ever changes
the anchoring behaviour, a finding will arrive through the chain already proven.
