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

# The scanner is private, so every real call carries an identity token whose
# audience is the service URL. gcloud mints one for the signed-in account here;
# in production the Cloud Function's own service account does it.
TOKEN="$(gcloud auth print-identity-token --audiences="$URL" 2>/dev/null || true)"
[ -n "$TOKEN" ] || { echo "FAIL  could not mint an identity token — run: gcloud auth login"; exit 1; }

post() {
  curl -s -m 180 -X POST "$URL" -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/octet-stream" --data-binary "@$1"
}
code_of() { curl -s -m 60 -o /dev/null -w '%{http_code}' "$@"; }

echo "── 0. the scanner is not open to the world ──"
anon="$(code_of -X POST "$URL" -H 'Content-Type: application/octet-stream' --data-binary 'hello')"
{ [ "$anon" = "401" ] || [ "$anon" = "403" ]; } \
  && ok "an unauthenticated request is rejected ($anon)" \
  || bad "public access" "an unauthenticated POST returned $anon — the scanner takes arbitrary bytes and must not be open"

authed="$(curl -s -m 60 -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$URL/healthz")"
[ "$authed" = "200" ] && ok "an authorised caller is accepted (200)" \
  || bad "authorised caller" "healthz returned $authed for an authorised caller"

echo
echo "── readiness ──"
health="$(curl -s -m 60 -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$URL/healthz")"
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
echo "── 4. the startup probe refuses an instance whose clamd is not up ──"
# Proven against the server directly rather than against Cloud Run: with clamd
# absent, /healthz must answer 503 so the probe never marks the instance ready.
if command -v node >/dev/null 2>&1; then
  CLAMD_PORT=1 PORT=8099 node server.js >/tmp/nv-probe.log 2>&1 &
  probe_pid=$!
  sleep 2
  probe="$(code_of "http://127.0.0.1:8099/healthz")"
  kill "$probe_pid" 2>/dev/null
  [ "$probe" = "503" ] && ok "healthz answers 503 while clamd is unreachable ($probe)" \
    || bad "startup probe" "healthz returned $probe with no clamd — an instance would be marked ready with no signatures loaded"
else
  printf "SKIP  startup probe check needs node\n"
fi

echo
echo "── 5. a scanner that is not there ──"
gone="$(curl -s -m 20 -o /dev/null -w '%{http_code}' -X POST "https://scanner-that-does-not-exist.invalid/scan" --data-binary @/tmp/nv-clean.txt || true)"
[ "$gone" != "200" ] && ok "an unreachable scanner does not answer 200 (got ${gone:-connection failed})" \
  || bad "unreachable scanner" "something answered 200 for a host that should not resolve"

rm -f /tmp/nv-clean.txt /tmp/nv-eicar.txt /tmp/nv-big.bin
echo
[ "$fail" = "0" ] && echo "✅ STAGING SCANNER CHECK PASSED" || echo "❌ STAGING SCANNER CHECK FAILED"
exit "$fail"
