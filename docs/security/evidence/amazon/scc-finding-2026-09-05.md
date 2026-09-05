# First real Security Command Center finding and its delivery — 2026-09-05

| | |
|---|---|
| Finding | `organizations/378239481010/sources/17655521329292880633/locations/global/findings/66f4b5ac3b691cb6` (canonical `projects/145308107004/sources/17655521329292880633/locations/global/findings/66f4b5ac3b691cb6`) |
| Category / severity / class / state | **Increasing Deny Ratio** / MEDIUM / THREAT / ACTIVE |
| eventTime / createTime | 2026-09-05T05:29:30.046Z / 2026-09-05T05:29:30.347Z |
| Detector / source | **Cloud Armor** (source 17655521329292880633, "Provider used by Cloud Armor to report CSCC findings") — the Standard-tier Adaptive Protection signal the design claims |
| Resource | backend service `amazon-admin-backend` behind security policy `amazon-edge` |
| What it says | long-term incoming 3 RPS, denied 3 RPS, deny ratio 0.95: the internet scanners that have been hitting `amazon.nivadesk.app` since the certificate went live are being refused by the WAF and the default rule (`armor-blocked-requests.txt`); the finding's own next step points at the LB request log |
| Pub/Sub delivery | published by notification config `projects/145308107004/locations/global/notificationConfigs/amazon-findings` at **2026-09-05T05:29:33.012Z** (3 s after creation) into topic `scc-findings` — the full NotificationMessage was pulled from the evidence subscription without acknowledgement |
| Evidence subscription | `scc-findings-evidence` retains it (7-day retention); `scc-findings-sample.txt` re-reads the finding itself on every pack |
| Alert / email | Cloud Monitoring alert "Amazon zone: SCC finding published" on the topic's publish count → email channel `amazon-security-email` (contact@eggcraft.co.uk). Publish-count points after 05:20 UTC: 2026-09-05T05:30:00Z=1 |

This is the end-to-end proof of the **delivery** half of control 3 with a
real finding: Security Command Center → notification config → Pub/Sub →
subscription → alert → operator. It is not an Event Threat Detection or Cloud
Run Threat Detection finding; those two remain required for the control to
be `Passed` (see `scc-activation-2026-09-05.md` for why neither has fired
yet).

## Delivery chain re-verified end of day (2026-09-05 21:31 UTC)

- `scc-notification-message-2026-09-05.json` — all **six** messages retained
  by the evidence subscription, pulled without acknowledgement and decoded:
  the synthetic delivery-chain check (04:05), the Cloud Armor *Increasing
  Deny Ratio* finding published at 05:29:33 and re-published on each update
  (05:52, 06:47, 16:32 — the internet scanners never stopped and the WAF kept
  refusing them), and the Compliance Evaluation *OS_LOGIN_DISABLED* finding
  (11:39). Every message carries the full finding payload as Security Command
  Center published it.
- `scc-topic-publishes-2026-09-05.txt` — the Cloud Monitoring metric the
  e-mail alert is built on (`pubsub.googleapis.com/topic/send_message_operation_count`
  on `scc-findings`): six non-zero 10-minute buckets at 04:09, 05:39, 05:59,
  06:49, 11:49 and 16:39 UTC, one per message — the alert condition
  (publish count > 0) was true each time and the channel is the operator's
  e-mail (`scc-alerting.txt`).

Together with `scc-finding-2026-09-05.md` above this is the standing proof
that a finding of **any** source on the project reaches the operator; the
detector findings still missing for control 3 would travel the same path.
