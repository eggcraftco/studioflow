#!/usr/bin/env bash
# The emulator-backed suite. Everything in test/qa runs against a hand-built
# fake Firestore; these run against a real one, which is the only way to catch
# a document that maps fine and stores badly.
#
#   Terminal 1:  firebase emulators:start --only firestore
#   Terminal 2:  functions/test/run-e2e.sh
set -uo pipefail
cd "$(dirname "$0")/.."

export NIVADESK_E2E=1
export GCLOUD_PROJECT="${GCLOUD_PROJECT:-eggcraft-studio}"
export FIREBASE_CONFIG="${FIREBASE_CONFIG:-{\"projectId\":\"$GCLOUD_PROJECT\"}}"
export FIRESTORE_EMULATOR_HOST="${FIRESTORE_EMULATOR_HOST:-127.0.0.1:8080}"

if ! curl -sf -m 3 -o /dev/null "http://$FIRESTORE_EMULATOR_HOST/"; then
  echo "No Firestore emulator at $FIRESTORE_EMULATOR_HOST."
  echo "Start one with:  firebase emulators:start --only firestore"
  exit 1
fi

status=0
for file in test/e2e/*.test.js; do
  echo "── $(basename "$file")"
  node "$file" || status=1
  echo
done
exit $status
