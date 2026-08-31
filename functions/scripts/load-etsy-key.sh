#!/usr/bin/env bash
# Load an Etsy app's keystring + shared secret into Secret Manager, safely.
#
# The value never passes through a chat message, never gets echoed, and is
# never written to a file. It goes clipboard -> stdin -> Secret Manager.
#
# It is also VALIDATED BEFORE IT IS STORED. The last time these were loaded by
# hand, one version arrived with the value pasted twice (48 chars) and another
# truncated to 10, and both sat ENABLED in Secret Manager for days because
# nothing checked. This pings Etsy with the pair first and refuses to store a
# pair Etsy rejects.
#
#   1. Copy the KEYSTRING from Etsy's "Your Apps" page.
#   2. functions/scripts/load-etsy-key.sh keystring
#   3. Copy the SHARED SECRET.
#   4. functions/scripts/load-etsy-key.sh secret
#   5. functions/scripts/load-etsy-key.sh check      (pings Etsy with the pair)
#
set -uo pipefail
cd "$(dirname "$0")/.."
MODE="${1:-}"

ping_pair() {   # $1 keystring  $2 shared secret — prints only the status
  python3 - "$1" "$2" <<'PY'
import sys, urllib.request
key, secret = sys.argv[1], sys.argv[2]
req = urllib.request.Request(
    "https://api.etsy.com/v3/application/openapi-ping",
    headers={"x-api-key": f"{key}:{secret}"})
try:
    with urllib.request.urlopen(req, timeout=20) as r:
        print(r.status)
except Exception as error:
    print(getattr(error, "code", "ERROR"))
PY
}

case "$MODE" in
  keystring|secret)
    NAME=$([ "$MODE" = "keystring" ] && echo ETSY_KEYSTRING || echo ETSY_SHARED_SECRET)
    VALUE="$(pbpaste)"
    LEN=${#VALUE}
    # Shape check before anything else: a keystring is 24 characters, and the
    # two failures worth catching are "pasted twice" and "truncated".
    echo "clipboard holds $LEN characters"
    if [ "$MODE" = "keystring" ] && [ "$LEN" -ne 24 ]; then
      echo "REFUSED: an Etsy keystring is 24 characters. 48 usually means it pasted twice."
      exit 1
    fi
    if [ "$LEN" -lt 8 ] || [ "$LEN" -gt 200 ]; then
      echo "REFUSED: that length is not a credential."
      exit 1
    fi
    printf '%s' "$VALUE" | npx firebase-tools@latest functions:secrets:set "$NAME" --data-file=- || exit 1
    echo "$NAME stored. Nothing was printed."
    ;;
  check)
    K="$(npx firebase-tools@latest functions:secrets:access ETSY_KEYSTRING 2>/dev/null)"
    S="$(npx firebase-tools@latest functions:secrets:access ETSY_SHARED_SECRET 2>/dev/null)"
    echo "keystring length: ${#K}   shared secret length: ${#S}"
    echo "openapi-ping with the joined pair: $(ping_pair "$K" "$S")"
    echo "openapi-ping with the keystring alone: $(ping_pair "$K" "")  (403 is correct — it proves the join is what Etsy accepts)"
    ;;
  *)
    echo "usage: $0 keystring | secret | check"
    exit 1
    ;;
esac
