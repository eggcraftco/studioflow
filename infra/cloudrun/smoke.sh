#!/usr/bin/env bash
# Compares nivadesk.app on the new load balancer with nivadesk.app on Hostinger, path by path.
#
#   ./smoke.sh <LB_IP> [LB_IPv6]   before the cutover: talks to the load balancer with --resolve, so the real
#                          certificate and Host are used while the public DNS still points at Hostinger
#   ./smoke.sh             after the cutover: plain DNS
#
# Reads only. Every request is one a visitor could make; the OAuth/eBay routes get deliberately bad
# input and must refuse it exactly as Hostinger does.
set -uo pipefail
LB_IP="${1:-}"
LB_IP6="${2:-}"
HOSTINGER=76.13.132.222
NEW=(); [ -n "$LB_IP" ] && NEW=(--resolve "nivadesk.app:443:$LB_IP" --resolve "www.nivadesk.app:443:$LB_IP")
OLD=(--resolve "nivadesk.app:443:$HOSTINGER")
fail=0
row() { printf "%-48s new=%-14s old=%-14s %s\n" "$1" "$2" "$3" "$4"; }

echo "══ pages and routes (status/bytes; bytes differ by build id and nonce only)"
for p in / /integrations /integrations/amazon /pricing /features /faq /security /contact /privacy /terms \
         /login /signup /settings /home /orders /guide /changelog /chatgpt /api/app-build \
         /.well-known/oauth-authorization-server /.well-known/oauth-protected-resource \
         "/f/x/y" "/square/callback?error=probe" "/etsy/callback?error=probe" "/robots.txt" "/sitemap.xml" \
         /_next/does-not-exist; do
  n=$(curl -s "${NEW[@]}" -o /dev/null -w '%{http_code}/%{size_download}' "https://nivadesk.app$p")
  o=$(curl -s "${OLD[@]}" -o /dev/null -w '%{http_code}/%{size_download}' "https://nivadesk.app$p")
  verdict=ok; [ "${n%%/*}" = "${o%%/*}" ] || { verdict="STATUS DIFFERS"; fail=1; }
  row "$p" "$n" "$o" "$verdict"
done

echo "══ eBay ticket: a bad ticket is refused with 400 (503 would mean the secret is not bound)"
n=$(curl -s "${NEW[@]}" -o /dev/null -w '%{http_code}' -X POST -H 'origin: https://nivadesk.app' -H 'sec-fetch-site: same-origin' \
    -H 'content-type: application/json' --data '{"ticket":"probe"}' https://nivadesk.app/ebay/ticket)
row "POST /ebay/ticket (bad ticket)" "$n" "-" "$([ "$n" = 400 ] && echo ok || { fail=1; echo 'EXPECTED 400'; })"

echo "══ OAuth metadata (ChatGPT and Claude connectors)"
for p in /.well-known/oauth-authorization-server /.well-known/openid-configuration; do
  n=$(curl -s "${NEW[@]}" "https://nivadesk.app$p" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("issuer"),d.get("token_endpoint"))' 2>/dev/null)
  o=$(curl -s "${OLD[@]}" "https://nivadesk.app$p" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("issuer"),d.get("token_endpoint"))' 2>/dev/null)
  [ "$n" = "$o" ] && row "$p" "same" "same" "ok" || { row "$p" "$n" "$o" "DIFFERS"; fail=1; }
done

echo "══ headers on /pricing (new)"
curl -s "${NEW[@]}" -o /dev/null -D - https://nivadesk.app/pricing \
  | grep -i -E '^(strict-transport-security|x-frame-options|x-content-type-options|referrer-policy|permissions-policy|cross-origin-opener-policy|content-security-policy-report-only|cache-control):' \
  | cut -c1-80
for h in strict-transport-security x-frame-options content-security-policy-report-only; do
  curl -s "${NEW[@]}" -o /dev/null -D - https://nivadesk.app/pricing | grep -qi "^$h:" || { echo "missing header $h"; fail=1; }
done

echo "══ http → https and www"
row "http://nivadesk.app/pricing" "$(curl -s ${LB_IP:+--resolve nivadesk.app:80:$LB_IP} -o /dev/null -w '%{http_code} %{redirect_url}' http://nivadesk.app/pricing)" "-" ""
row "https://www.nivadesk.app/" "$(curl -s ${LB_IP:+--resolve www.nivadesk.app:443:$LB_IP} -o /dev/null -w '%{http_code} %{redirect_url}' https://www.nivadesk.app/)" \
    "$(curl -s --resolve www.nivadesk.app:443:$HOSTINGER -o /dev/null -w '%{http_code} %{redirect_url}' https://www.nivadesk.app/)" ""

echo "══ certificate and TLS"
host_ip="${LB_IP:-$(dig +short nivadesk.app | tail -1)}"
echo | openssl s_client -connect "$host_ip:443" -servername nivadesk.app 2>/dev/null | openssl x509 -noout -subject -issuer -enddate 2>/dev/null | sed 's/^/  /'
echo | openssl s_client -connect "$host_ip:443" -servername nivadesk.app -tls1_2 2>/dev/null | grep -q "Protocol *: TLSv1.2\|TLSv1.2" && echo "  TLS 1.2 accepted" || echo "  TLS 1.2 not negotiated (check)"

if [ -n "$LB_IP6" ]; then
  echo "══ IPv6 front door"
  for p in / /login /integrations/amazon /.well-known/oauth-authorization-server; do
    n=$(curl -s -6 --resolve "nivadesk.app:443:[$LB_IP6]" -o /dev/null -w '%{http_code}' "https://nivadesk.app$p")
    row "[v6] $p" "$n" "-" "$([ "$n" = 200 ] && echo ok || { fail=1; echo 'EXPECTED 200'; })"
  done
fi

[ $fail = 0 ] && echo "SMOKE OK" || { echo "SMOKE FAILED"; exit 1; }
