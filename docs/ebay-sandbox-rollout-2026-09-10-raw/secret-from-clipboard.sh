#!/bin/zsh
# Usage: secret-from-clipboard.sh EBAY_CLIENT_ID|EBAY_CLIENT_SECRET
# Reads the macOS clipboard, validates the SHAPE of a sandbox keyset value, writes it as a new
# Secret Manager version ONLY if the secret has no version yet, then clears the clipboard.
# Prints metadata only — never the value, never a prefix of it.
set -u
S="$1"; PROJECT=eggcraft-studio
case "$S" in
  EBAY_CLIENT_ID)     RE='^[A-Za-z0-9._-]+-SBX-[A-Za-z0-9-]+$' ;;   # sandbox App ID carries -SBX-
  EBAY_CLIENT_SECRET) RE='^SBX-[A-Za-z0-9-]+$' ;;                    # sandbox Cert ID starts with SBX-
  *) echo "unknown secret name"; exit 2 ;;
esac
V="$(pbpaste | tr -d '\r\n')"
LEN=${#V}
if [ "$LEN" -lt 20 ] || [ "$LEN" -gt 120 ]; then echo "$S: clipboard length $LEN out of range — nothing written"; exit 3; fi
if ! print -r -- "$V" | grep -Eq "$RE"; then echo "$S: clipboard does not look like a SANDBOX keyset value (shape check failed) — nothing written"; exit 4; fi
N=$(gcloud secrets versions list "$S" --project=$PROJECT --format='value(name)' | wc -l | tr -d ' ')
if [ "$N" != "0" ]; then echo "$S already has $N version(s) — NOT overwritten"; exit 5; fi
print -rn -- "$V" | gcloud secrets versions add "$S" --project=$PROJECT --data-file=- 2>&1 | tail -1
unset V; pbcopy < /dev/null
echo "$S: written from clipboard (length $LEN, shape ok); clipboard cleared"
