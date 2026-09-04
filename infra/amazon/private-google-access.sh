#!/usr/bin/env bash
# Private Google Access through restricted.googleapis.com — step 7 of the
# design, required before the perimeter is enforced.
#
# Inside amazon-vpc, every Google API hostname resolves to the restricted VIP
# 199.36.153.4/30, which serves only VPC Service Controls-supported APIs and
# honours the perimeter. Firestore, Secret Manager and Logging traffic from the
# services then never depends on public Google API resolution, and never leaves
# for the public VIPs. Cloud Run with direct VPC egress resolves through the
# VPC's Cloud DNS, so the private zone applies to the services.
#
# The bridge host in the main project (*.cloudfunctions.net) is not a Google
# API: it stays on the public path through NAT, governed by the VPC-SC egress
# rule and the application allowlist.
#
# Proof afterwards: functions-amazon/deploy/diag.sh runs the ROLE=diag job,
# which resolves each hostname from inside the VPC and exits non-zero if any
# address is outside the /30. Its output goes into the evidence pack.
set -euo pipefail
# gcloud must never wait on a prompt ("enable the API?", "install component?"):
# a script that blocks on stdin in a non-interactive run looks like a hang.
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
PROJECT="${AMAZON_PROJECT_ID:-nivadesk-amazon}"
REGION="europe-west2"
DRY_RUN="${DRY_RUN:-1}"
run() { if [ "$DRY_RUN" = "1" ]; then printf '  [dry-run] %s\n' "$*"; else printf '  → %s\n' "$*"; "$@"; fi; }
exists() { "$@" >/dev/null 2>&1; }
[ "$DRY_RUN" = "1" ] && echo "DRY_RUN=1: nothing will be created."

echo "══ 1. Private DNS zone for googleapis.com, visible only to amazon-vpc ══"
run gcloud services enable dns.googleapis.com --project="$PROJECT"
exists gcloud dns managed-zones describe googleapis-restricted --project="$PROJECT" \
  || run gcloud dns managed-zones create googleapis-restricted --project="$PROJECT" --dns-name="googleapis.com." \
       --visibility=private --networks=amazon-vpc --description="*.googleapis.com → restricted.googleapis.com (VPC-SC VIP)" \
       --log-dns-queries
# restricted.googleapis.com → the four VIP addresses; everything else under googleapis.com → CNAME to it.
if ! gcloud dns record-sets describe restricted.googleapis.com. --type=A --zone=googleapis-restricted --project="$PROJECT" >/dev/null 2>&1; then
  run gcloud dns record-sets create restricted.googleapis.com. --project="$PROJECT" --zone=googleapis-restricted --type=A --ttl=300 \
      --rrdatas=199.36.153.4,199.36.153.5,199.36.153.6,199.36.153.7
fi
if ! gcloud dns record-sets describe '*.googleapis.com.' --type=CNAME --zone=googleapis-restricted --project="$PROJECT" >/dev/null 2>&1; then
  run gcloud dns record-sets create '*.googleapis.com.' --project="$PROJECT" --zone=googleapis-restricted --type=CNAME --ttl=300 \
      --rrdatas=restricted.googleapis.com.
fi

echo "══ 2. Route to the restricted VIP and an explicit firewall rule ahead of the general one ══"
exists gcloud compute routes describe amazon-restricted-vip --project="$PROJECT" \
  || run gcloud compute routes create amazon-restricted-vip --project="$PROJECT" --network=amazon-vpc \
       --destination-range=199.36.153.4/30 --next-hop-gateway=default-internet-gateway --priority=900 \
       --description="Google APIs via the VPC-SC restricted VIP"
exists gcloud compute firewall-rules describe amazon-allow-restricted-vip --project="$PROJECT" \
  || run gcloud compute firewall-rules create amazon-allow-restricted-vip --project="$PROJECT" --network=amazon-vpc \
       --direction=EGRESS --priority=900 --action=ALLOW --rules=tcp:443 --destination-ranges=199.36.153.4/30 --enable-logging \
       --description="Google APIs via restricted.googleapis.com"

echo "══ 3. Proof: functions-amazon/deploy/diag.sh (a Cloud Run job, ROLE=diag) ══"
echo "  expected: every host → 199.36.153.4–7, https answers; the job exits non-zero otherwise."
echo "══ done ══"
