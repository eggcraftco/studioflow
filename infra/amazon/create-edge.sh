#!/usr/bin/env bash
# The edge: one global external HTTPS load balancer in front of the Amazon
# zone, with Cloud Armor "amazon-edge" (Standard tier) as the firewall.
# Step 5 of the design. Idempotent; DRY_RUN=1 by default.
#
# Only the services that EXIST get a backend. Today that is amazon-admin;
# amazon-oauth is not deployed (lwa-client-secret has no version, and a
# placeholder credential would not make it production), so /oauth/* has no
# backend and no allow rule — Cloud Armor's default rule denies it at the edge.
# Re-running this script after amazon-oauth exists adds its backend, its path
# rule and its rate-limit/allow rule.
#
# Cloud Armor rule order (a rate-limit rule's conform action can only be
# "allow", so the rate-limit rules ARE the allow rules — nothing else opens a
# path):
#   1000  preconfigured WAF (sqli/xss/lfi/rfi/rce/protocol/scanner), deny 403
#   2000  /oauth/start, /oauth/callback: 30/min per IP, ban 10 min   (only with oauth)
#   2100  /admin/*: 120/min per IP, 429 beyond                         (the admin allow)
#   3100  /healthz from the operator's address only (OPERATOR_IP)     (smoke tests)
#   default deny 403
#
# What is deliberately NOT here:
#   - a load-balancer health check: unsupported on serverless NEGs; readiness
#     is Cloud Run's startup probe.
#   - Cloud Armor Enterprise: attack signatures, suggested rules, auto-deploy.
#     Standard's Adaptive Protection is basic alerting and that is all that is
#     enabled and all that is claimed.
#   - an HTTP (port 80) listener: nothing to redirect, nothing to answer.
#   - the DNS record: shown at the end, made at Cloudflare (DNS-only).
set -euo pipefail
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
PROJECT="${AMAZON_PROJECT_ID:-nivadesk-amazon}"
REGION="europe-west2"
HOST="amazon.nivadesk.app"
DRY_RUN="${DRY_RUN:-1}"
run() { if [ "$DRY_RUN" = "1" ]; then printf '  [dry-run] %s\n' "$*"; else printf '  → %s\n' "$*"; "$@"; fi; }
exists() { "$@" >/dev/null 2>&1; }
[ "$DRY_RUN" = "1" ] && echo "DRY_RUN=1: nothing will be created."

SERVICES=""
for svc in amazon-admin amazon-oauth; do
  if exists gcloud run services describe "$svc" --region="$REGION" --project="$PROJECT"; then SERVICES="$SERVICES $svc"; else echo "  ($svc is not deployed: no backend, no path, no allow rule)"; fi
done
HAVE_OAUTH=0; echo "$SERVICES" | grep -q amazon-oauth && HAVE_OAUTH=1

echo "══ 1. Cloud Armor policy amazon-edge (Standard) ══"
exists gcloud compute security-policies describe amazon-edge --project="$PROJECT" \
  || run gcloud compute security-policies create amazon-edge --project="$PROJECT" --type=CLOUD_ARMOR \
       --description="Amazon zone edge: WAF, rate limits, default deny"
# Basic Adaptive Protection alerting — the Standard-tier feature. Nothing more.
run gcloud compute security-policies update amazon-edge --project="$PROJECT" --enable-layer7-ddos-defense --log-level=VERBOSE
run gcloud compute security-policies rules update 2147483647 --security-policy=amazon-edge --project="$PROJECT" --action=deny-403 --description="default: deny"
exists gcloud compute security-policies rules describe 1000 --security-policy=amazon-edge --project="$PROJECT" \
  || run gcloud compute security-policies rules create 1000 --security-policy=amazon-edge --project="$PROJECT" --action=deny-403 \
       --expression="evaluatePreconfiguredWaf('sqli-v33-stable', {'sensitivity': 1}) || evaluatePreconfiguredWaf('xss-v33-stable', {'sensitivity': 1}) || evaluatePreconfiguredWaf('lfi-v33-stable', {'sensitivity': 1}) || evaluatePreconfiguredWaf('rfi-v33-stable', {'sensitivity': 1}) || evaluatePreconfiguredWaf('rce-v33-stable', {'sensitivity': 1}) || evaluatePreconfiguredWaf('protocolattack-v33-stable', {'sensitivity': 1}) || evaluatePreconfiguredWaf('scannerdetection-v33-stable', {'sensitivity': 1})" \
       --description="preconfigured WAF, sensitivity 1"
if [ "$HAVE_OAUTH" = "1" ]; then
  exists gcloud compute security-policies rules describe 2000 --security-policy=amazon-edge --project="$PROJECT" \
    || run gcloud compute security-policies rules create 2000 --security-policy=amazon-edge --project="$PROJECT" \
         --expression="request.path == '/oauth/start' || request.path == '/oauth/callback'" --action=rate-based-ban \
         --rate-limit-threshold-count=30 --rate-limit-threshold-interval-sec=60 --ban-duration-sec=600 \
         --conform-action=allow --exceed-action=deny-429 --enforce-on-key=IP --description="oauth: 30/min per IP, ban 10 min"
fi
exists gcloud compute security-policies rules describe 2100 --security-policy=amazon-edge --project="$PROJECT" \
  || run gcloud compute security-policies rules create 2100 --security-policy=amazon-edge --project="$PROJECT" \
       --expression="request.path.startsWith('/admin/')" --action=throttle \
       --rate-limit-threshold-count=120 --rate-limit-threshold-interval-sec=60 \
       --conform-action=allow --exceed-action=deny-429 --enforce-on-key=IP --description="admin: 120/min per IP (this is the admin allow)"
if [ -n "${OPERATOR_IP:-}" ]; then
  exists gcloud compute security-policies rules describe 3100 --security-policy=amazon-edge --project="$PROJECT" \
    || run gcloud compute security-policies rules create 3100 --security-policy=amazon-edge --project="$PROJECT" --action=allow \
         --expression="request.path == '/healthz' && inIpRange(origin.ip, '${OPERATOR_IP}/32')" --description="healthz: operator smoke tests only"
else
  echo "  (OPERATOR_IP not set: /healthz stays denied at the edge)"
fi

echo "══ 2. Serverless NEGs and backend services for:$SERVICES (no health checks: unsupported on serverless NEGs) ══"
for svc in $SERVICES; do
  exists gcloud compute network-endpoint-groups describe "$svc-neg" --region="$REGION" --project="$PROJECT" \
    || run gcloud compute network-endpoint-groups create "$svc-neg" --project="$PROJECT" --region="$REGION" \
         --network-endpoint-type=serverless --cloud-run-service="$svc"
  if ! exists gcloud compute backend-services describe "$svc-backend" --global --project="$PROJECT"; then
    run gcloud compute backend-services create "$svc-backend" --project="$PROJECT" --global \
        --load-balancing-scheme=EXTERNAL_MANAGED --enable-logging --logging-sample-rate=1.0
    run gcloud compute backend-services add-backend "$svc-backend" --project="$PROJECT" --global \
        --network-endpoint-group="$svc-neg" --network-endpoint-group-region="$REGION"
  fi
  run gcloud compute backend-services update "$svc-backend" --project="$PROJECT" --global --security-policy=amazon-edge
done

echo "══ 3. URL map: /admin/* → admin$([ "$HAVE_OAUTH" = "1" ] && echo ', /oauth/* → oauth'); everything else has no allow rule and dies at Cloud Armor ══"
PATH_RULES="/admin/*=amazon-admin-backend"
[ "$HAVE_OAUTH" = "1" ] && PATH_RULES="$PATH_RULES,/oauth/*=amazon-oauth-backend"
exists gcloud compute url-maps describe amazon-edge-map --global --project="$PROJECT" \
  || run gcloud compute url-maps create amazon-edge-map --project="$PROJECT" --global --default-service=amazon-admin-backend
# The path matcher is rebuilt each run so a newly deployed oauth gets its rule.
if [ "$DRY_RUN" != "1" ] && [ -n "$(gcloud compute url-maps describe amazon-edge-map --global --project="$PROJECT" --format='value(pathMatchers[0].name)' 2>/dev/null)" ]; then
  run gcloud compute url-maps remove-path-matcher amazon-edge-map --project="$PROJECT" --global --path-matcher-name=amazon-paths
fi
run gcloud compute url-maps add-path-matcher amazon-edge-map --project="$PROJECT" --global --path-matcher-name=amazon-paths \
    --default-service=amazon-admin-backend --path-rules="$PATH_RULES" --new-hosts="$HOST"

echo "══ 4. Managed certificate, global address, HTTPS proxy, forwarding rule ══"
exists gcloud compute ssl-certificates describe amazon-edge-cert --global --project="$PROJECT" \
  || run gcloud compute ssl-certificates create amazon-edge-cert --project="$PROJECT" --global --domains="$HOST"
exists gcloud compute addresses describe amazon-edge-ip --global --project="$PROJECT" \
  || run gcloud compute addresses create amazon-edge-ip --project="$PROJECT" --global --ip-version=IPV4
exists gcloud compute target-https-proxies describe amazon-edge-proxy --global --project="$PROJECT" \
  || run gcloud compute target-https-proxies create amazon-edge-proxy --project="$PROJECT" --global \
       --url-map=amazon-edge-map --ssl-certificates=amazon-edge-cert
exists gcloud compute forwarding-rules describe amazon-edge-https --global --project="$PROJECT" \
  || run gcloud compute forwarding-rules create amazon-edge-https --project="$PROJECT" --global \
       --load-balancing-scheme=EXTERNAL_MANAGED --network-tier=PREMIUM --address=amazon-edge-ip \
       --target-https-proxy=amazon-edge-proxy --ports=443

echo "══ 5. Read back ══"
if [ "$DRY_RUN" != "1" ]; then
  IP=$(gcloud compute addresses describe amazon-edge-ip --global --project="$PROJECT" --format='value(address)')
  echo "  LB address: $IP"
  echo "  certificate: $(gcloud compute ssl-certificates describe amazon-edge-cert --global --project="$PROJECT" --format='value(managed.status,managed.domainStatus)')"
  echo "  Cloud Armor rules (priority, action, description):"
  gcloud compute security-policies describe amazon-edge --project="$PROJECT" --format=json | python3 -c '
import json,sys; p=json.load(sys.stdin); p=p[0] if isinstance(p,list) else p
print("    adaptive protection (layer-7 DDoS defense):", p.get("adaptiveProtectionConfig",{}).get("layer7DdosDefenseConfig",{}).get("enable"))
for r in sorted(p.get("rules",[]), key=lambda r: r["priority"]):
    act = r.get("action"); rl = r.get("rateLimitOptions")
    if rl: act += " (%s/%ss per %s → %s)" % (rl["rateLimitThreshold"]["count"], rl["rateLimitThreshold"]["intervalSec"], rl.get("enforceOnKey"), rl.get("exceedAction"))
    print("    %-11s %-45s %s" % (r["priority"], act, r.get("description","")))'
  echo "  path matcher: $(gcloud compute url-maps describe amazon-edge-map --global --project="$PROJECT" --format='value(pathMatchers[0].pathRules[].paths.flatten(),pathMatchers[0].pathRules[].service.basename())' | tr '\t' ' ')"
  echo "  hosts: $(gcloud compute url-maps describe amazon-edge-map --global --project="$PROJECT" --format='value(hostRules[].hosts.flatten())')"
  for svc in $SERVICES; do
    u=$(gcloud run services describe "$svc" --project="$PROJECT" --region="$REGION" --format='value(status.url)')
    echo "  $svc run.app from the internet → $(curl -s -o /dev/null -w '%{http_code}' -m 15 "$u/healthz") (expected 403/404: closed)"
  done
  echo "  DNS (Cloudflare, DNS-only / grey cloud, NOT proxied):   A   $HOST   $IP"
  echo "  The managed certificate provisions only after the record resolves (up to ~60 min)."
fi
echo "══ done ══"
