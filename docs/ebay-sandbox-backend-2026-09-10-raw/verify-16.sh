#!/bin/zsh
# Post-deploy verification of the sixteen: revision, runtime SA, secrets, env names, source hash, invoker policy,
# scheduler jobs, and unauthenticated/unsigned calls (expected refusals). Read-only apart from the probe requests.
set -u
P=eggcraft-studio; R=europe-west2; stamp() { date -u +%FT%TZ; }
NAMES=(beginEbayConnect claimEbayConnectState disconnectEbay ebayNotifications ebayOAuthCallback getEbayConnections previewEbayImport reconcileEbayConnections reconcileEbayConnectionsNightly reconcileEbayDeletions retryEbayImportFailures revealRestrictedCustomer runEbayImport syncEbayNow updateEbayConnectionSettings verifyEbayConnection ebayEventWorker)
echo "=== $(stamp) services"
printf '%-32s %-34s %-6s %-40s %-4s %-4s %-3s %-10s %s\n' function revision ready runtimeSA sec env hash ingress invokers
for n in "${NAMES[@]}"; do s=$(echo "$n" | tr '[:upper:]' '[:lower:]')
  gcloud run services describe "$s" --region=$R --project=$P --format=json 2>/dev/null | python3 -c "
import json,sys
d=json.load(sys.stdin);t=d['spec']['template'];c=t['spec']['containers'][0]
sec=sorted(e['valueFrom']['secretKeyRef']['name'] for e in c.get('env',[]) if 'valueFrom' in e)
names=set(e['name'] for e in c.get('env',[]))
envok='ok' if {'NIVADESK_EBAY_ENVIRONMENT','NIVADESK_EBAY_RUNAME'}<=names and 'NIVADESK_EBAY_CONNECTOR' not in names else 'BAD'
h=d['metadata'].get('labels',{}).get('firebase-functions-hash','')[:7]
print('%-32s %-34s %-6s %-40s %-4s %-4s %-3s %-10s' % ('$n', d['status']['traffic'][0]['revisionName'], d['status']['conditions'][0]['status'], t['spec'].get('serviceAccountName','')[:40], len(sec), envok, h, d['metadata'].get('annotations',{}).get('run.googleapis.com/ingress','')), end=' ')"
  gcloud run services get-iam-policy "$s" --region=$R --project=$P --format=json 2>/dev/null | python3 -c "import json,sys;p=json.load(sys.stdin);print(' | '.join(b['role'].split('/')[-1]+':'+','.join(m.split(':')[-1].split('@')[0] for m in b['members']) for b in p.get('bindings',[])) or '(empty)')"
done
echo; echo "=== $(stamp) scheduler jobs"
gcloud scheduler jobs list --location=$R --project=$P --format=json 2>/dev/null | python3 -c "
import json,sys
for j in json.load(sys.stdin):
    n=j['name'].split('/')[-1]
    if 'ebay' not in n.lower(): continue
    h=j.get('httpTarget',{});print(' ',n,'|',j.get('schedule'),'|',j.get('timeZone'),'|',j.get('state'),'| oidc SA:',h.get('oidcToken',{}).get('serviceAccountEmail'),'| uri:',h.get('uri','')[:80],'| lastAttempt:',j.get('lastAttemptTime','-'),'| status:',j.get('status',{}).get('code','-'))"
echo; echo "=== $(stamp) refusal probes (no credentials, no signature)"
B=https://europe-west2-$P.cloudfunctions.net
for f in beginEbayConnect getEbayConnections revealRestrictedCustomer syncEbayNow; do
  printf '  %-26s POST {} no auth -> ' "$f"; curl -s -o /tmp/probe.json -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"data":{}}' "$B/$f"; echo " $(head -c 160 /tmp/probe.json | tr -d '\n')"
done
printf '  %-26s GET -> ' ebayOAuthCallback; curl -s -o /tmp/probe.json -w '%{http_code}' "$B/ebayOAuthCallback"; echo " $(head -c 120 /tmp/probe.json | tr -d '\n')"
printf '  %-26s POST unsigned -> ' ebayOAuthCallback; curl -s -o /tmp/probe.json -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"code":"x"}' "$B/ebayOAuthCallback"; echo " $(head -c 120 /tmp/probe.json | tr -d '\n')"
printf '  %-26s GET (no challenge) -> ' ebayNotifications; curl -s -o /tmp/probe.json -w '%{http_code}' "$B/ebayNotifications"; echo " $(head -c 120 /tmp/probe.json | tr -d '\n')"
printf '  %-26s POST unsigned -> ' ebayNotifications; curl -s -o /tmp/probe.json -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"metadata":{"topic":"MARKETPLACE_ACCOUNT_DELETION"},"notification":{}}' "$B/ebayNotifications"; echo " $(head -c 120 /tmp/probe.json | tr -d '\n')"
printf '  %-26s POST no token -> ' reconcileEbayConnections; curl -s -o /tmp/probe.json -w '%{http_code}' -X POST "$B/reconcileEbayConnections"; echo " $(head -c 120 /tmp/probe.json | tr -d '\n')"
rm -f /tmp/probe.json
echo; echo "=== $(stamp) logs from the ebay services since deploy start (severity>=WARNING) + sweep lines"
gcloud logging read "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=~\"ebay\" AND timestamp>=\"$1\" AND (severity>=WARNING OR textPayload:\"connector off\" OR textPayload:\"reconcile\")" --project=$P --limit=40 --format='value(timestamp,resource.labels.service_name,severity,textPayload)' 2>/dev/null | cut -c1-200 | sed 's/^/  /'
