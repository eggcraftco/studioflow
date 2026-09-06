# A production webhook token was printed into this session's transcript

6 September 2026, ~17:35 UTC. Recorded because it happened, not because it was noticed by someone else.

## What happened

While establishing which feature flags the live MCP service runs with, the assistant ran
`gcloud run services describe chatgptmcp --region europe-west2 --format=json` and printed **every**
environment entry with its value, rather than filtering to names. The output included
`TRACK17_WEBHOOK_TOKEN` in clear text, so the value now sits in this session's transcript.

Nothing else in that output was a credential: the other entries are Stripe **price** identifiers,
Apple bundle and app-store identifiers, feature booleans, the ClamAV URL, the public web app URL and
Firebase's own project configuration. Secrets mounted through Secret Manager do not appear as values
in that output at all, so no Secret Manager secret was exposed.

## What the token is, and what someone holding it could do

`TRACK17_WEBHOOK_TOKEN` authenticates inbound callbacks from the 17track carrier-tracking service to
the `track17Webhook` function. Someone holding it could post forged tracking updates for orders whose
tracking numbers they knew: that can flip an order's dispatched or delivered flags and, through
`notifyCustomerOnStatusChange`, send a customer a status message. It cannot read customer data, cannot
authenticate to any other function, and is not a Google or Stripe credential.

## What to do

**Rotate it.** It is a shared value with a third party, so rotation is two steps and both are the
operator's:

1. Generate a new token and set it on the functions runtime configuration (it is a plain environment
   value today, not a Secret Manager secret — moving it to Secret Manager at the same time would be
   an improvement, and would have prevented this exposure entirely).
2. Update the webhook URL or token in the 17track dashboard so the provider sends the new value.

Until both are done the old token remains valid. There is no evidence it was used by anyone: the
exposure is to this transcript, not to a public channel.

## What changed so it does not happen again

Reading a service's configuration is now done with the values filtered out — names only — unless a
specific value is needed and is known not to be a credential. The instruction is carried into every
agent brief that touches `gcloud run services describe`.
