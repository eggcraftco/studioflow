#!/usr/bin/env bash
# The edge: one global external HTTPS load balancer in front of amazon-oauth and
# amazon-admin, with Cloud Armor "amazon-edge" (Standard tier) as the firewall.
# Step 5 of the design. Runs after deploy.sh. The DNS record is a ⛔ gate: this
# script prints it and never touches Cloudflare.
#
# What is deliberately NOT here:
#   - a load-balancer health check: serverless NEG backends do not support
#     classic health checks; readiness is Cloud Run's own startup probe.
#   - Cloud Armor Enterprise: attack signatures, suggested rules, auto-deploy.
#     Standard's Adaptive Protection is basic alerting and that is all that is
#     enabled and all that is claimed.
set -euo pipefail
# gcloud must never wait on a prompt ("enable the API?", "install component?"):
# a script that blocks on stdin in a non-interactive run looks like a hang.
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
PROJECT="${AMAZON_PROJECT_ID:-nivadesk-amazon}"
REGION="europe-west2"
HOST="amazon.nivadesk.app"
DRY_RUN="${DRY_RUN:-1}"
run() { if [ "$DRY_RUN" = "1" ]; then printf '  [dry-run] %s\n' "$*"; else printf '  → %s\n' "$*"; "$@"; fi; }
exists() { "$@" >/dev/null 2>&1; }
[ "$DRY_RUN" = "1" ] && echo "DRY_RUN=1: nothing will be created."

echo "══ 1. Cloud Armor policy amazon-edge (Standard) ══"
exists gcloud compute security-policies describe amazon-edge --project="$PROJECT" \
  || run gcloud compute security-policies create amazon-edge --project="$PROJECT" --type=CLOUD_ARMOR \
       --description="Amazon zone edge: WAF, rate limits, default deny"
# Basic Adaptive Protection alerting — the Standard-tier feature. Nothing more.
run gcloud compute security-policies update amazon-edge --project="$PROJECT" --enable-layer7-ddos-defense --log-level=VERBOSE
# Default rule: deny everything not explicitly allowed below.
run gcloud compute security-policies rules update 2147483647 --security-policy=amazon-edge --project="$PROJECT" --action=deny-403
# Preconfigured WAF rule sets, sensitivity 1 (the stable, low-false-positive level).
for i in sqli xss lfi rfi rce protocolattack scannerdetection; do :; done
exists gcloud compute security-policies rules describe 1000 --security-policy=amazon-edge --project="$PROJECT" \
  || run gcloud compute security-policies rules create 1000 --security-policy=amazon-edge --project="$PROJECT" --action=deny-403 \
       --expression="evaluatePreconfiguredWaf('sqli-v33-stable', {'sensitivity': 1}) || evaluatePreconfiguredWaf('xss-v33-stable', {'sensitivity': 1}) || evaluatePreconfiguredWaf('lfi-v33-stable', {'sensitivity': 1}) || evaluatePreconfiguredWaf('rfi-v33-stable', {'sensitivity': 1}) || evaluatePreconfiguredWaf('rce-v33-stable', {'sensitivity': 1}) || evaluatePreconfiguredWaf('protocolattack-v33-stable', {'sensitivity': 1}) || evaluatePreconfiguredWaf('scannerdetection-v33-stable', {'sensitivity': 1})" \
       --description="preconfigured WAF, sensitivity 1"
# Rate limits: the consent flow and the admin surface, per client address.
exists gcloud compute security-policies rules describe 2000 --security-policy=amazon-edge --project="$PROJECT" \
  || run gcloud compute security-policies rules create 2000 --security-policy=amazon-edge --project="$PROJECT" \
       --expression="request.path.startsWith('/oauth/')" --action=rate-based-ban \
       --rate-limit-threshold-count=30 --rate-limit-threshold-interval-sec=60 --ban-duration-sec=600 \
       --conform-action=allow --exceed-action=deny-429 --enforce-on-key=IP --description="oauth: 30/min per IP, ban 10 min"
exists gcloud compute security-policies rules describe 2100 --security-policy=amazon-edge --project="$PROJECT" \
  || run gcloud compute security-policies rules create 2100 --security-policy=amazon-edge --project="$PROJECT" \
       --expression="request.path.startsWith('/admin/')" --action=throttle \
       --rate-limit-threshold-count=120 --rate-limit-threshold-interval-sec=60 \
       --conform-action=allow --exceed-action=deny-429 --enforce-on-key=IP --description="admin: 120/min per IP"
# The enumerated paths. /healthz is smoke/monitoring only; it is allowed from
# the operator's address, given at run time, and from nowhere else.
exists gcloud compute security-policies rules describe 3000 --security-policy=amazon-edge --project="$PROJECT" \
  || run gcloud compute security-policies rules create 3000 --security-policy=amazon-edge --project="$PROJECT" --action=allow \
       --expression="request.path == '/oauth/start' || request.path == '/oauth/callback' || request.path.startsWith('/admin/')" \
       --description="enumerated paths"
if [ -n "${OPERATOR_IP:-}" ]; then
  exists gcloud compute security-policies rules describe 3100 --security-policy=amazon-edge --project="$PROJECT" \
    || run gcloud compute security-policies rules create 3100 --security-policy=amazon-edge --project="$PROJECT" --action=allow \
         --expression="request.path == '/healthz' && inIpRange(origin.ip, '${OPERATOR_IP}/32')" --description="healthz: operator smoke tests only"
else
  echo "  (OPERATOR_IP not set: /healthz stays denied at the edge; set it to allow smoke tests from one address)"
fi

echo "══ 2. Serverless NEGs and backend services (no health checks: unsupported on serverless NEGs) ══"
for svc in amazon-oauth amazon-admin; do
  exists gcloud compute network-endpoint-groups describe "$svc-neg" --region="$REGION" --project="$PROJECT" \
    || run gcloud compute network-endpoint-groups create "$svc-neg" --project="$PROJECT" --region="$REGION" \
         --network-endpoint-type=serverless --cloud-run-service="$svc"
  exists gcloud compute backend-services describe "$svc-backend" --global --project="$PROJECT" \
    || run gcloud compute backend-services create "$svc-backend" --project="$PROJECT" --global \
         --load-balancing-scheme=EXTERNAL_MANAGED --protocol=HTTPS --enable-logging --logging-sample-rate=1.0
  run gcloud compute backend-services add-backend "$svc-backend" --project="$PROJECT" --global \
      --network-endpoint-group="$svc-neg" --network-endpoint-group-region="$REGION"
  run gcloud compute backend-services update "$svc-backend" --project="$PROJECT" --global --security-policy=amazon-edge
done

echo "══ 3. URL map: /oauth/* → oauth, /admin/* → admin, everything else → oauth (Armor denies it first) ══"
exists gcloud compute url-maps describe amazon-edge-map --global --project="$PROJECT" \
  || run gcloud compute url-maps create amazon-edge-map --project="$PROJECT" --global --default-service=amazon-oauth-backend
exists gcloud compute url-maps describe amazon-edge-map --global --project="$PROJECT" --format='value(pathMatchers[0].name)' \
  || run gcloud compute url-maps add-path-matcher amazon-edge-map --project="$PROJECT" --global --path-matcher-name=amazon-paths \
       --default-service=amazon-oauth-backend --path-rules="/oauth/*=amazon-oauth-backend,/admin/*=amazon-admin-backend,/healthz=amazon-oauth-backend" \
       --new-hosts="$HOST"

echo "══ 4. Managed certificate, HTTPS proxy, global address, forwarding rule ══"
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
# No HTTP (port 80) listener at all: nothing to redirect, nothing to answer.

echo "══ 5. ⛔ DNS — shown, not done ══"
IP=$( [ "$DRY_RUN" = "1" ] && echo "<amazon-edge-ip>" || gcloud compute addresses describe amazon-edge-ip --global --project="$PROJECT" --format='value(address)')
echo "  Create at Cloudflare (DNS-only / grey cloud, NOT proxied):"
echo "    A    $HOST    $IP    TTL auto"
echo "  The managed certificate provisions only after the record resolves (up to ~60 min)."
echo "══ done ══"
