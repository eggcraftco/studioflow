# Event Threat Detection — investigation record (prepared 2026-09-05, completed after the third official VM test)

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
| 3 — 13:05 UTC | amazon-etd-vm-test | (filled in after the run) | disabled | (filled in after the run) |

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
