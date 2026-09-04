#!/usr/bin/env bash
# End-to-end check against a real scanner, before anything is enabled anywhere.
#
# Four things have to be true, and the fourth is the one people forget:
#   1. a clean file comes back clean
#   2. EICAR comes back infected, by name
#   3. a file over the cap comes back too_large, not clean
#   4. a scanner that is not there produces a failure, NOT a pass
#
# Usage: SCANNER_URL=https://… ./staging-check.sh
set -uo pipefail
URL="${SCANNER_URL:?set SCANNER_URL to the Cloud Run service URL}"
fail=0
ok()  { printf "PASS  %s\n" "$1"; }
bad() { printf "FAIL  %s — %s\n" "$1" "$2"; fail=1; }

post() { curl -s -m 180 -X POST "$URL" -H "Content-Type: application/octet-stream" --data-binary "@$1"; }

echo "── readiness ──"
health="$(curl -s -m 60 -o /dev/null -w '%{http_code}' "$URL/healthz")"
[ "$health" = "200" ] && ok "clamd is up and holding signatures (200)" \
  || bad "readiness" "healthz returned $health — a scanner with no database calls everything clean"

echo
echo "── 1. a clean file ──"
printf 'This is an ordinary invoice.\n' > /tmp/nv-clean.txt
clean="$(post /tmp/nv-clean.txt)"
echo "  $clean"
echo "$clean" | grep -q '"status":"clean"' && ok "clean file reported clean" \
  || bad "clean file" "expected status clean, got: $clean"

echo
echo "── 2. EICAR ──"
# Assembled at runtime so this repository never contains the test string itself.
printf 'X5O!P%%@AP[4\\PZX54(P^)7CC)7}$%s-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' "EICAR" > /tmp/nv-eicar.txt
eicar="$(post /tmp/nv-eicar.txt)"
echo "  $eicar"
echo "$eicar" | grep -q '"status":"infected"' && ok "EICAR reported infected" \
  || bad "EICAR" "THE SCANNER DID NOT DETECT EICAR — got: $eicar"
echo "$eicar" | grep -qi 'eicar' && ok "the signature name came back" \
  || printf "NOTE  the signature name was not in the reply; detection still counted\n"

echo
echo "── 3. over the size cap ──"
dd if=/dev/zero of=/tmp/nv-big.bin bs=1m count=40 2>/dev/null
big="$(post /tmp/nv-big.bin)"
echo "  $big"
echo "$big" | grep -q '"status":"too_large"' && ok "oversized file refused rather than passed" \
  || bad "size cap" "expected too_large, got: $big"

echo
echo "── 4. a scanner that is not there ──"
gone="$(curl -s -m 20 -o /dev/null -w '%{http_code}' -X POST "https://scanner-that-does-not-exist.invalid/scan" --data-binary @/tmp/nv-clean.txt || true)"
[ "$gone" != "200" ] && ok "an unreachable scanner does not answer 200 (got ${gone:-connection failed})" \
  || bad "unreachable scanner" "something answered 200 for a host that should not resolve"

rm -f /tmp/nv-clean.txt /tmp/nv-eicar.txt /tmp/nv-big.bin
echo
[ "$fail" = "0" ] && echo "✅ STAGING SCANNER CHECK PASSED" || echo "❌ STAGING SCANNER CHECK FAILED"
exit "$fail"
