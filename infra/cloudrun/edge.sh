#!/usr/bin/env bash
# The front door for nivadesk.app on Google: a global external Application Load Balancer in front of
# the Cloud Run service `nivadesk-web`, with a Google-managed certificate (Certificate Manager, DNS
# authorisation, so it is ACTIVE before any traffic moves) and a TLS 1.2+ policy.
#
# Why a load balancer and not Firebase Hosting or a Cloudflare Worker in front of run.app: those two
# replace the Host header with the run.app name, and Firebase Hosting forwards only the `__session`
# cookie. The eBay connect flow (connect.nivadesk.app → nivadesk.app/ebay/*) depends on its own
# cookies, and /f/ reads Host. The load balancer passes Host, cookies and the visitor address through.
#
#   ACTION=plan      (default) read what exists, print what is missing; change nothing
#   ACTION=apply     create what is missing (idempotent), print the DNS records to add
#   ACTION=rollback  delete what this script created (only after DNS points back at Hostinger)
#
# Needs, once, by the owner: compute.googleapis.com and certificatemanager.googleapis.com enabled on
# the project. No Cloud Armor policy on purpose: the point of moving is that nobody's network is
# throttled; Cloud Run's own limits and the app's own refusals stay as they are.
set -euo pipefail
# Never answer a gcloud prompt by accident (an unenabled API makes gcloud ask "enable it? (y/N)").
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
PROJECT="${PROJECT:-eggcraft-studio}"
REGION=europe-west2
SERVICE=nivadesk-web
ACTION="${ACTION:-plan}"
DOMAINS=(nivadesk.app www.nivadesk.app)

IP=nivadesk-web-ip
IP6=nivadesk-web-ipv6
NEG=nivadesk-web-neg
BACKEND=nivadesk-web-backend
URLMAP=nivadesk-web-map
REDIRECT_MAP=nivadesk-web-http-redirect
SSL_POLICY=nivadesk-web-tls12
CERT=nivadesk-web-cert
CERT_MAP=nivadesk-web-certmap
HTTPS_PROXY=nivadesk-web-https
HTTP_PROXY=nivadesk-web-http
FR_HTTPS=nivadesk-web-https-fr
FR_HTTP=nivadesk-web-http-fr
FR_HTTPS6=nivadesk-web-https-fr-v6
FR_HTTP6=nivadesk-web-http-fr-v6
auth_name() { echo "nivadesk-web-auth-${1//./-}"; }

g() { gcloud "$@" --project="$PROJECT"; }
has() { "$@" >/dev/null 2>&1; }

missing_api=0
for api in compute.googleapis.com certificatemanager.googleapis.com; do
  if ! g services list --enabled --format='value(config.name)' 2>/dev/null | grep -qx "$api"; then
    echo "API $api is NOT enabled on $PROJECT — the owner enables it (gcloud services enable $api --project=$PROJECT)."
    missing_api=1
  fi
done
# Nothing below may run against a disabled API: it would only fail, or ask to enable it.
[ "$missing_api" = 0 ] || { [ "$ACTION" = "plan" ] && { echo "plan stops here — nothing changed"; exit 0; } || exit 1; }

report() {
  for r in "compute addresses describe $IP --global" \
           "compute network-endpoint-groups describe $NEG --region=$REGION" \
           "compute backend-services describe $BACKEND --global" \
           "compute url-maps describe $URLMAP" \
           "compute ssl-policies describe $SSL_POLICY --global" \
           "certificate-manager certificates describe $CERT" \
           "certificate-manager maps describe $CERT_MAP" \
           "compute target-https-proxies describe $HTTPS_PROXY" \
           "compute forwarding-rules describe $FR_HTTPS --global" \
           "compute forwarding-rules describe $FR_HTTP --global" \
           "compute addresses describe $IP6 --global" \
           "compute forwarding-rules describe $FR_HTTPS6 --global" \
           "compute forwarding-rules describe $FR_HTTP6 --global"; do
    # shellcheck disable=SC2086
    if has g $r; then echo "  present  $r"; else echo "  missing  $r"; fi
  done
}

case "$ACTION" in
plan)
  echo "══ $PROJECT: what exists"; report || true
  echo "plan only — nothing changed" ;;

apply)
  # nivadesk.app has an AAAA record as well as an A record: both must move, or IPv6 visitors stay on Hostinger.
  has g compute addresses describe $IP --global || g compute addresses create $IP --global --ip-version=IPV4
  has g compute addresses describe $IP6 --global || g compute addresses create $IP6 --global --ip-version=IPV6
  has g compute network-endpoint-groups describe $NEG --region=$REGION \
    || g compute network-endpoint-groups create $NEG --region=$REGION --network-endpoint-type=serverless --cloud-run-service=$SERVICE
  if ! has g compute backend-services describe $BACKEND --global; then
    g compute backend-services create $BACKEND --global --load-balancing-scheme=EXTERNAL_MANAGED \
      --enable-logging --logging-sample-rate=1.0
    g compute backend-services add-backend $BACKEND --global --network-endpoint-group=$NEG --network-endpoint-group-region=$REGION
  fi
  has g compute url-maps describe $URLMAP || g compute url-maps create $URLMAP --default-service=$BACKEND
  has g compute ssl-policies describe $SSL_POLICY --global \
    || g compute ssl-policies create $SSL_POLICY --global --profile=MODERN --min-tls-version=1.2

  # The certificate is authorised by DNS, so it can be ACTIVE before nivadesk.app points here.
  auths=()
  for d in "${DOMAINS[@]}"; do
    a=$(auth_name "$d"); auths+=("$a")
    has g certificate-manager dns-authorizations describe "$a" || g certificate-manager dns-authorizations create "$a" --domain="$d"
  done
  has g certificate-manager certificates describe $CERT \
    || g certificate-manager certificates create $CERT --domains="$(IFS=,; echo "${DOMAINS[*]}")" --dns-authorizations="$(IFS=,; echo "${auths[*]}")"
  has g certificate-manager maps describe $CERT_MAP || g certificate-manager maps create $CERT_MAP
  for d in "${DOMAINS[@]}"; do
    e="entry-${d//./-}"
    has g certificate-manager maps entries describe "$e" --map=$CERT_MAP \
      || g certificate-manager maps entries create "$e" --map=$CERT_MAP --hostname="$d" --certificates=$CERT
  done

  has g compute target-https-proxies describe $HTTPS_PROXY \
    || g compute target-https-proxies create $HTTPS_PROXY --url-map=$URLMAP --certificate-map=$CERT_MAP --ssl-policy=$SSL_POLICY
  has g compute forwarding-rules describe $FR_HTTPS --global \
    || g compute forwarding-rules create $FR_HTTPS --global --load-balancing-scheme=EXTERNAL_MANAGED \
         --address=$IP --target-https-proxy=$HTTPS_PROXY --ports=443

  # Port 80 only redirects to https.
  if ! has g compute url-maps describe $REDIRECT_MAP; then
    tmp=$(mktemp); printf 'name: %s\ndefaultUrlRedirect:\n  httpsRedirect: true\n  redirectResponseCode: MOVED_PERMANENTLY_DEFAULT\n' "$REDIRECT_MAP" > "$tmp"
    g compute url-maps import $REDIRECT_MAP --source="$tmp" --global --quiet; rm -f "$tmp"
  fi
  has g compute target-http-proxies describe $HTTP_PROXY || g compute target-http-proxies create $HTTP_PROXY --url-map=$REDIRECT_MAP
  has g compute forwarding-rules describe $FR_HTTP --global \
    || g compute forwarding-rules create $FR_HTTP --global --load-balancing-scheme=EXTERNAL_MANAGED \
         --address=$IP --target-http-proxy=$HTTP_PROXY --ports=80
  has g compute forwarding-rules describe $FR_HTTPS6 --global \
    || g compute forwarding-rules create $FR_HTTPS6 --global --load-balancing-scheme=EXTERNAL_MANAGED \
         --address=$IP6 --target-https-proxy=$HTTPS_PROXY --ports=443
  has g compute forwarding-rules describe $FR_HTTP6 --global \
    || g compute forwarding-rules create $FR_HTTP6 --global --load-balancing-scheme=EXTERNAL_MANAGED \
         --address=$IP6 --target-http-proxy=$HTTP_PROXY --ports=80

  echo "══ readback"; report
  addr=$(g compute addresses describe $IP --global --format='value(address)')
  echo "══ DNS records to add in Cloudflare (DNS only, grey cloud):"
  for a in "${auths[@]}"; do
    g certificate-manager dns-authorizations describe "$a" --format='value(dnsResourceRecord.name,dnsResourceRecord.type,dnsResourceRecord.data)'
  done
  addr6=$(g compute addresses describe $IP6 --global --format='value(address)')
  echo "  (NOT yet) nivadesk.app A $addr and AAAA $addr6   ← the cutover step, after smoke.sh passes"
  echo "certificate state: $(g certificate-manager certificates describe $CERT --format='value(managed.state)')" ;;

rollback)
  echo "Only after nivadesk.app's A and AAAA records are back on Hostinger (76.13.132.222, 2a02:4780:3f:2216:0:2907:1f72:6)."
  for r in "compute forwarding-rules delete $FR_HTTP6 --global" "compute forwarding-rules delete $FR_HTTPS6 --global" \
           "compute forwarding-rules delete $FR_HTTP --global" "compute forwarding-rules delete $FR_HTTPS --global" \
           "compute target-http-proxies delete $HTTP_PROXY" "compute target-https-proxies delete $HTTPS_PROXY" \
           "compute url-maps delete $REDIRECT_MAP" "compute url-maps delete $URLMAP" \
           "compute backend-services delete $BACKEND --global" "compute network-endpoint-groups delete $NEG --region=$REGION" \
           "compute ssl-policies delete $SSL_POLICY --global" "compute addresses delete $IP --global" \
           "compute addresses delete $IP6 --global"; do
    # shellcheck disable=SC2086
    has g $r --quiet && echo "  deleted  $r" || echo "  absent   $r"
  done
  echo "Certificate Manager objects ($CERT, $CERT_MAP, dns-authorizations) are kept: they cost nothing and save the wait next time." ;;
*) echo "ACTION must be plan, apply or rollback"; exit 2 ;;
esac
