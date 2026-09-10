# Monitoring — a narrow proposal (10 September 2026, night)

**Proposal only. Nothing was created:** no alert policy, no notification channel, no log-based metric.
The night authorization asked for a narrow configuration proposal and forbade a new production policy or
recipient. Every command below is written to be run by the operator after the two decisions in §4.

## 1. Why now, and why these four

Tonight's work found a regression that ran for six days without anybody seeing it: every ChatGPT
connect attempt has been refused since 4 September (`docs/security/evidence/oauth-client-registry-gap-2026-09-10.md`).
The log line was there every day (`chatgptOAuthAuthorize refused a redirect_uri: unregistered_client …`)
and the daily count of successful consents went from a handful to zero. Nothing watched either. The
proposal is four signals, each with a log line or a status that already exists, and one channel.

| # | Signal | What it catches | Filter (Cloud Logging) |
|---|---|---|---|
| M1 | **OAuth refusals** — any `unregistered_client` or redirect refusal on `chatgptoauthauthorize` / `chatgptoauthapprove` | the regression above, and the next one like it | `resource.type="cloud_run_revision" AND resource.labels.service_name=("chatgptoauthauthorize" OR "chatgptoauthapprove") AND textPayload:"refused a redirect_uri"` |
| M2 | **OAuth consent silence** — zero `302` from `chatgptoauthauthorize` in 3 days while the app is published | the same regression from the other side: a connect flow nobody completes | metric: count of `httpRequest.status=302` on `chatgptoauthauthorize`; alert on absence (metric-absence condition, 72 h) |
| M3 | **Stripe webhook failures** — any 5xx or ERROR on `stripewebhook` | a billing event dropped after the L1 fix (`stripewebhook-00047-por`); today there is no traffic to observe, so the absence of errors proves nothing and the alert is what will | `resource.type="cloud_run_revision" AND resource.labels.service_name="stripewebhook" AND (httpRequest.status>=500 OR severity>=ERROR)` |
| M4 | **Any function 5xx above a floor** — project-wide Cloud Run 5xx rate | the generic "something broke on deploy" signal, tuned above the noise of the nightly jobs | `resource.type="cloud_run_revision" AND httpRequest.status>=500`, threshold ≥ 5 in 10 min |

Not proposed: per-function latency, memory, or cost alerts — they page for reasons that are not incidents.

## 2. The channel

The project has **no notification channel and no alert policy today** (`gcloud monitoring policies list`
and `channels list` are empty, read tonight). One e-mail channel is proposed: `contact@eggcraft.co.uk`,
the mailbox the operator already reads. A second recipient (phone/SMS) is not proposed — it is the
operator's decision and outside "narrow".

## 3. The commands (not run)

```bash
PROJECT=eggcraft-studio

# The channel — the operator confirms the address in the console after creation (§4, decision 1)
gcloud monitoring channels create --project=$PROJECT --display-name="NivaDesk ops e-mail" \
  --type=email --channel-labels=email_address=contact@eggcraft.co.uk
CHANNEL=$(gcloud monitoring channels list --project=$PROJECT --filter='displayName="NivaDesk ops e-mail"' --format='value(name)')

# M1 — log-based metric + policy
gcloud logging metrics create chatgpt_oauth_refusals --project=$PROJECT \
  --description="chatgptOAuthAuthorize/Approve refused a redirect_uri (unregistered client or mismatch)" \
  --log-filter='resource.type="cloud_run_revision" AND resource.labels.service_name=("chatgptoauthauthorize" OR "chatgptoauthapprove") AND textPayload:"refused a redirect_uri"'
gcloud monitoring policies create --project=$PROJECT --display-name="ChatGPT OAuth refusals" \
  --notification-channels="$CHANNEL" --combiner=OR \
  --condition-display-name="any refusal in 10 min" \
  --condition-filter='metric.type="logging.googleapis.com/user/chatgpt_oauth_refusals" AND resource.type="cloud_run_revision"' \
  --condition-threshold-value=0 --condition-threshold-comparison=COMPARISON_GT --condition-threshold-duration=600s \
  --aggregation-alignment-period=600s --aggregation-per-series-aligner=ALIGN_SUM --aggregation-cross-series-reducer=REDUCE_SUM

# M2 — consent silence: a metric for the 302s, then an absence condition (72 h)
gcloud logging metrics create chatgpt_oauth_consents --project=$PROJECT \
  --description="chatgptOAuthAuthorize 302 to the consent page" \
  --log-filter='resource.type="cloud_run_revision" AND resource.labels.service_name="chatgptoauthauthorize" AND httpRequest.status=302'
# absence conditions are not expressible on the gcloud command line; create this one from a policy file:
cat > /tmp/m2.json <<'JSON'
{ "displayName": "ChatGPT consent silence (72h)", "combiner": "OR", "enabled": true,
  "conditions": [{ "displayName": "no 302 in 72h",
    "conditionAbsent": { "filter": "metric.type=\"logging.googleapis.com/user/chatgpt_oauth_consents\" AND resource.type=\"cloud_run_revision\"",
      "duration": "259200s", "aggregations": [{ "alignmentPeriod": "3600s", "perSeriesAligner": "ALIGN_SUM", "crossSeriesReducer": "REDUCE_SUM" }] } }] }
JSON
gcloud monitoring policies create --project=$PROJECT --policy-from-file=/tmp/m2.json --notification-channels="$CHANNEL"

# M3 — Stripe webhook failures
gcloud logging metrics create stripe_webhook_failures --project=$PROJECT \
  --description="stripewebhook 5xx or ERROR" \
  --log-filter='resource.type="cloud_run_revision" AND resource.labels.service_name="stripewebhook" AND (httpRequest.status>=500 OR severity>=ERROR)'
gcloud monitoring policies create --project=$PROJECT --display-name="Stripe webhook failure" \
  --notification-channels="$CHANNEL" --combiner=OR --condition-display-name="any in 5 min" \
  --condition-filter='metric.type="logging.googleapis.com/user/stripe_webhook_failures" AND resource.type="cloud_run_revision"' \
  --condition-threshold-value=0 --condition-threshold-comparison=COMPARISON_GT --condition-threshold-duration=300s \
  --aggregation-alignment-period=300s --aggregation-per-series-aligner=ALIGN_SUM --aggregation-cross-series-reducer=REDUCE_SUM

# M4 — project-wide 5xx floor (built-in metric, no log metric needed)
gcloud monitoring policies create --project=$PROJECT --display-name="Cloud Run 5xx above floor" \
  --notification-channels="$CHANNEL" --combiner=OR --condition-display-name="≥5 5xx in 10 min" \
  --condition-filter='metric.type="run.googleapis.com/request_count" AND resource.type="cloud_run_revision" AND metric.labels.response_code_class="5xx"' \
  --condition-threshold-value=5 --condition-threshold-comparison=COMPARISON_GT --condition-threshold-duration=600s \
  --aggregation-alignment-period=600s --aggregation-per-series-aligner=ALIGN_SUM --aggregation-cross-series-reducer=REDUCE_SUM
```

Rollback: `gcloud monitoring policies delete <name>`, `gcloud logging metrics delete <metric>`,
`gcloud monitoring channels delete "$CHANNEL"` — none of them touches a running service.

## 4. The two decisions

1. **The recipient.** `contact@eggcraft.co.uk` only, or also a phone. The proposal says e-mail only.
2. **M4's floor.** Five 5xx in ten minutes is a guess from tonight's logs (the nightly jobs produce
   none); the operator may prefer a rate. Everything else is a count of a line that should never appear.

## 5. What this does not do

It does not watch the web (Hostinger) build, the App Store lines, eBay (not deployed) or the retention
flags (off). It does not replace the deploy runbook's post-deploy log read; it is what runs when nobody
is reading.
